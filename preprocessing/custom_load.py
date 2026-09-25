"""Custom loads: user rows (typed in or a CSV) -> a STACKR instance.

The converter produces EXACTLY the dict preprocessing/loader.py returns for a
wtpack instance:

    {'container': {'L': length, 'W': width, 'H': height},    # file order
     'n_types', 'total_volume_m3',
     'boxes': [{'id', 'type_id', 'l', 'w', 'h', 'l_flag', 'w_flag', 'h_flag',
                'mass', 'lbs_l', 'lbs_w', 'lbs_h', 'allowed_orientations'}]}

and then applies the same steps pipeline.load_augmented_instance applies:
pipeline.container_from_file_dims (the one place the rear-door rotation is
decided) and stop_assignment.assign_stops. Neither is re-implemented here and
no post-pipeline axis field is written by this module. Fragility is NOT the
thesis augmentation: it comes from the user's "Handle with care" ticks, plus
(optionally) the type-level rule at a chosen share.

Mapping by meaning (see loader.parse_wtpack):
    box    Length / Width / Height (cm)          -> l / w / h
    container Length (door to cab) / Width / Height -> container L / W / H
    Weight (kg)                                   -> mass
    Max load on top (kg), simple mode             -> lbs = max_load / (l * w)  kg/cm2
                                                     (the top face; boxes kept upright)

Nothing is ever defaulted: a missing physics value is an error naming its row
and column. The server calls this file; its messages are authoritative.

    python preprocessing/custom_load.py convert --out <file.json>   < request.json
    python preprocessing/custom_load.py export-wtpack 350 > i350.csv
    python preprocessing/custom_load.py template simple|advanced
"""
import csv
import io
import os
import re
import sys
import json
import inspect
import argparse
from pathlib import Path
from typing import Any, Dict, List, Optional

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from preprocessing.loader import _allowed_orientations
from preprocessing.pipeline import container_from_file_dims, load_augmented_instance
from preprocessing.stop_assignment import assign_stops
from preprocessing.fragility import fragile_types_by_share, _box_lbs

# The pipeline's configured stop augmentation, read from its signature so the
# two can never drift apart (pipeline.py itself is not edited).
_PIPELINE_DEFAULTS = inspect.signature(load_augmented_instance).parameters
STOP_COUNT = _PIPELINE_DEFAULTS['stop_count'].default
STOP_SEED = _PIPELINE_DEFAULTS['stop_seed'].default

MAX_BOXES = 500
DEFAULT_SHARE = 0.25
UPRIGHT = [1, 2]            # orientation codes with h vertical (loader encoding)
LABEL = 'Custom load — not part of the thesis dataset'
FORMAT_VERSION = 1

CUSTOM_LOADS_DIR = Path(os.environ.get('STACKR_CUSTOM_LOADS_DIR')
                        or _ROOT / 'experiments' / 'custom_loads')

# Canonical column keys and the header text the templates use.
SIMPLE_COLUMNS = [
    ('name', 'Box name'), ('stop', 'Stop'),
    ('length', 'Length (cm)'), ('width', 'Width (cm)'), ('height', 'Height (cm)'),
    ('weight', 'Weight (kg)'), ('max_load', 'Max load on top (kg)'),
    ('qty', 'Qty'), ('fragile', 'Handle with care'),
]
ADVANCED_COLUMNS = [
    ('type_id', 'Type ID'),
    ('l_flag', 'L flag'), ('w_flag', 'W flag'), ('h_flag', 'H flag'),
    ('lbs_l', 'LBS L (kg/cm2)'), ('lbs_w', 'LBS W (kg/cm2)'), ('lbs_h', 'LBS H (kg/cm2)'),
]
COLUMN_TITLES = dict(SIMPLE_COLUMNS + ADVANCED_COLUMNS)
REQUIRED = ['length', 'width', 'height', 'weight', 'qty']
STRENGTH = ['l_flag', 'w_flag', 'h_flag', 'lbs_l', 'lbs_w', 'lbs_h']

_ALIASES = {
    'box_name': 'name', 'name': 'name', 'box': 'name',
    'stop': 'stop', 'delivery_stop': 'stop',
    'stop_number': 'stop', 'stop_sequence': 'stop', 'delivery_sequence': 'stop',
    'length': 'length', 'l': 'length',
    'width': 'width', 'w': 'width',
    'height': 'height', 'h': 'height',
    'weight': 'weight', 'mass': 'weight',
    'max_load_on_top': 'max_load', 'max_load': 'max_load',
    'qty': 'qty', 'quantity': 'qty',
    'handle_with_care': 'fragile', 'fragile': 'fragile', 'handle_with_care_': 'fragile',
    'type_id': 'type_id', 'type': 'type_id',
    'l_flag': 'l_flag', 'w_flag': 'w_flag', 'h_flag': 'h_flag',
    'lbs_l': 'lbs_l', 'lbs_w': 'lbs_w', 'lbs_h': 'lbs_h',
}
_TRUE = {'yes', 'y', 'true', '1', 'x'}
_FALSE = {'', 'no', 'n', 'false', '0'}


class CustomLoadError(ValueError):
    def __init__(self, errors, notes=None):
        super().__init__('; '.join(e['message'] for e in errors))
        self.errors = errors
        self.notes = notes or []


def ignored_note(header: str) -> str:
    """The note shown for a column STACKR does not read."""
    if re.sub(r'[^a-z]', '', header.lower()) == 'destination':
        return 'Destination ignored — STACKR uses stop numbers.'
    return f'"{header}" ignored — STACKR does not use this column.'


def normalize_header(text: str) -> Optional[str]:
    """'Max load on top (kg)' -> 'max_load'; unknown headers -> None."""
    t = re.sub(r'\(.*?\)', '', str(text)).strip().lower().lstrip('﻿')
    t = re.sub(r'[^a-z0-9]+', '_', t).strip('_')
    return _ALIASES.get(t)


def parse_csv(text: str):
    """CSV text -> (rows as {key: str}, header errors, canonical keys present).
    A column STACKR does not read is skipped (see ignored_columns), not an error."""
    reader = csv.reader(io.StringIO(text))
    lines = [r for r in reader]
    while lines and not any(c.strip() for c in lines[0]):
        lines.pop(0)
    if not lines:
        return [], [_err(None, None, 'The file is empty.')], []
    header = lines[0]
    keys, errors = [], []
    for i, h in enumerate(header):
        k = normalize_header(h)
        if k is not None and k in keys:
            errors.append(_err(None, COLUMN_TITLES[k], f'Column "{COLUMN_TITLES[k]}" appears twice.'))
        keys.append(k)
    rows, line_nos = [], []
    for n, raw in enumerate(lines[1:], start=2):
        if not any(c.strip() for c in raw):
            continue
        rows.append({k: (raw[i].strip() if i < len(raw) else '') for i, k in enumerate(keys) if k})
        line_nos.append(n)
    return rows, errors, [k for k in keys if k]


def ignored_columns(text: str) -> List[str]:
    """Header cells of a CSV that map to no STACKR column (read, then skipped)."""
    for raw in csv.reader(io.StringIO(text)):
        if any(c.strip() for c in raw):
            return [h.strip().lstrip('\ufeff') for h in raw if h.strip() and normalize_header(h) is None]
    return []


def _err(row, column, message, line=None):
    e = {'row': row, 'column': column, 'message': message}
    if line is not None:
        e['line'] = line
    return e


def _where(row, column, line=None):
    at = f'Row {row}' + (f' (line {line} of the file)' if line else '')
    return f'{at}, {column}' if column else at


def _num(v):
    try:
        x = float(str(v).strip())
    except (TypeError, ValueError):
        return None
    return x if x == x and x not in (float('inf'), float('-inf')) else None


def convert(request: Dict[str, Any]) -> Dict[str, Any]:
    """User request -> stored custom-load document. Raises CustomLoadError.

    request = {
      'source': 'typed' | 'csv',
      'csv': '<text>'                       # when source == 'csv'
      'rows': [{name, stop, length, ...}]   # when source == 'typed'
      'container': {'length', 'width', 'height', 'max_weight'?},   # cm, kg
      'fragile_share': null | 0 < target < 1,   # "also mark the weakest share"
      'name': 'display name'?
    }
    """
    errors: List[Dict[str, Any]] = []
    source = request.get('source')
    if source == 'csv':
        rows, errors, present = parse_csv(request.get('csv') or '')
        line_nos = _csv_line_numbers(request.get('csv') or '')
        notes = [ignored_note(h) for h in ignored_columns(request.get('csv') or '')]
    elif source == 'typed':
        rows = [{k: ('' if v is None else str(v).strip()) for k, v in r.items()}
                for r in (request.get('rows') or [])]
        present = sorted({k for r in rows for k in r})
        line_nos = [None] * len(rows)
        notes = []
    else:
        raise CustomLoadError([_err(None, None, 'source must be "typed" or "csv".')])

    # ── container ────────────────────────────────────────────────────────────
    c_in = request.get('container') or {}
    cont = {}
    for key, title in (('length', 'Container length (door to cab)'), ('width', 'Container width'),
                       ('height', 'Container height')):
        v = _num(c_in.get(key))
        if v is None or v <= 0:
            errors.append(_err(None, title, f'{title} must be a positive number of cm.'))
        cont[key] = v
    max_weight = c_in.get('max_weight')
    if max_weight in (None, ''):
        max_weight = None
    else:
        mw = _num(max_weight)
        if mw is None or mw <= 0:
            errors.append(_err(None, 'Container max weight',
                               'Container max weight must be blank or a positive number of kg.'))
        max_weight = mw

    share = request.get('fragile_share')
    if share not in (None, '', False):
        s = _num(share)
        if s is None or not (0 < s < 1):
            errors.append(_err(None, 'Weakest share', 'The weakest-share target must be between 0% and 100%.'))
        share = s
    else:
        share = None

    # ── columns ──────────────────────────────────────────────────────────────
    if not rows:
        errors.append(_err(None, None, 'The load has no boxes.'))
    advanced_present = [k for k in STRENGTH if k in present]
    advanced = len(advanced_present) == len(STRENGTH)
    if advanced_present and not advanced:
        missing = [COLUMN_TITLES[k] for k in STRENGTH if k not in present]
        for m in missing:
            errors.append(_err(None, m, f'Missing column "{m}": advanced strength needs all six '
                                        f'of L/W/H flag and LBS L/W/H.'))
    needed = REQUIRED + ([] if advanced else ['max_load'])
    for k in needed:
        if k not in present:
            errors.append(_err(None, COLUMN_TITLES[k], f'Missing column "{COLUMN_TITLES[k]}".'))

    # ── rows ─────────────────────────────────────────────────────────────────
    stops_given = [bool(r.get('stop', '')) for r in rows]
    stop_mode = 'given' if rows and all(stops_given) else 'assigned'
    if any(stops_given) and not all(stops_given):
        blank = [i + 1 for i, g in enumerate(stops_given) if not g]
        filled = [i + 1 for i, g in enumerate(stops_given) if g]
        for i in blank:
            errors.append(_err(i, 'Stop', f'{_where(i, "Stop", line_nos[i - 1])}: blank, but rows '
                                          f'{_list(filled)} have a stop. Give every row a stop, '
                                          f'or leave them all blank.', line_nos[i - 1]))

    parsed = []
    for i, r in enumerate(rows, start=1):
        line = line_nos[i - 1]
        p = {'name': r.get('name', ''), 'row': i}
        bad = False

        def pos(key, integer=False, allow_zero=False):
            nonlocal bad
            title = COLUMN_TITLES[key]
            if key not in present:          # reported once as a missing column
                return None
            raw = r.get(key, '')
            if raw == '':
                errors.append(_err(i, title, f'{_where(i, title, line)}: blank.', line)); bad = True
                return None
            v = _num(raw)
            if v is None:
                errors.append(_err(i, title, f'{_where(i, title, line)}: "{raw}" is not a number.', line))
                bad = True; return None
            if integer and v != int(v):
                errors.append(_err(i, title, f'{_where(i, title, line)}: "{raw}" is not a whole number.', line))
                bad = True; return None
            if v < 0 or (v == 0 and not allow_zero):
                errors.append(_err(i, title, f'{_where(i, title, line)}: must be greater than 0 (got {raw}).', line))
                bad = True; return None
            return int(v) if integer else v

        p['l'], p['w'], p['h'] = pos('length'), pos('width'), pos('height')
        p['mass'] = pos('weight')
        p['qty'] = pos('qty', integer=True)

        if stop_mode == 'given' or r.get('stop', ''):
            raw = r.get('stop', '')
            if raw:
                v = _num(raw)
                if v is None or v != int(v) or not (1 <= v <= STOP_COUNT):
                    errors.append(_err(i, 'Stop', f'{_where(i, "Stop", line)}: "{raw}" is not a stop '
                                                  f'number from 1 to {STOP_COUNT}.'
                                                  + (f' STACKR supports up to {STOP_COUNT} delivery stops.'
                                                     if v is not None and v > STOP_COUNT else ''), line)); bad = True
                else:
                    p['stop'] = int(v)

        fr = r.get('fragile', '').strip().lower()
        if fr in _TRUE:
            p['fragile'] = 1
        elif fr in _FALSE:
            p['fragile'] = 0
        else:
            errors.append(_err(i, 'Handle with care', f'{_where(i, "Handle with care", line)}: '
                                                     f'"{r.get("fragile")}" must be yes or no (or blank).', line))
            bad = True

        if advanced:
            flags = []
            for k in ('l_flag', 'w_flag', 'h_flag'):
                raw = r.get(k, '')
                if raw not in ('0', '1'):
                    errors.append(_err(i, COLUMN_TITLES[k], f'{_where(i, COLUMN_TITLES[k], line)}: '
                                                            f'"{raw}" must be 0 or 1.', line)); bad = True
                flags.append(1 if raw == '1' else 0)
            p['l_flag'], p['w_flag'], p['h_flag'] = flags
            p['lbs_l'], p['lbs_w'], p['lbs_h'] = pos('lbs_l'), pos('lbs_w'), pos('lbs_h')
            if not bad and not any(flags):
                errors.append(_err(i, 'L flag', f'{_where(i, "L/W/H flag", line)}: all three flags are 0, '
                                                f'so no orientation is allowed.', line)); bad = True
            if 'type_id' in present:
                p['type_id'] = pos('type_id', integer=True, allow_zero=True)
        else:
            ml = pos('max_load', allow_zero=False)
            if ml is not None and p['l'] and p['w']:
                lbs = ml / (p['l'] * p['w'])
                p['lbs_l'] = p['lbs_w'] = p['lbs_h'] = lbs
                p['max_load'] = ml
            p['l_flag'], p['w_flag'], p['h_flag'] = 0, 0, 1

        if not bad and None not in (p['l'], p['w'], p['h']) and all(v is not None for v in cont.values()):
            allowed = _allowed_orientations(p['l_flag'], p['w_flag'], p['h_flag'])
            if not _fits_somewhere(p, allowed, cont):
                errors.append(_err(i, None, f'{_where(i, None, line)}: a {_fmt(p["l"])} x {_fmt(p["w"])} x '
                                            f'{_fmt(p["h"])} cm box fits the {_fmt(cont["length"])} x '
                                            f'{_fmt(cont["width"])} x {_fmt(cont["height"])} cm container in '
                                            f'none of its allowed orientations'
                                            + (' (custom boxes are kept upright)' if not advanced else '') + '.',
                                   line))
        parsed.append(p)

    # A type_id column must describe one box type per id.
    if advanced and 'type_id' in present:
        seen = {}
        keys = ('l', 'w', 'h', 'mass', 'l_flag', 'w_flag', 'h_flag', 'lbs_l', 'lbs_w', 'lbs_h')
        for p in parsed:
            t = p.get('type_id')
            if t is None:
                continue
            sig = tuple(p.get(k) for k in keys)
            if t in seen and seen[t][0] != sig:
                errors.append(_err(p['row'], 'Type ID', f'{_where(p["row"], "Type ID", line_nos[p["row"] - 1])}: '
                                                        f'type {t} already used by row {seen[t][1]} with '
                                                        f'different size, weight or strength.',
                                   line_nos[p['row'] - 1]))
            seen.setdefault(t, (sig, p['row']))

    total = sum(p['qty'] for p in parsed if isinstance(p.get('qty'), int))
    if total > MAX_BOXES:
        errors.append(_err(None, 'Qty', f'The load has {total} boxes after Qty; the limit is {MAX_BOXES}.'))
    if stop_mode == 'assigned' and rows and not errors and total < STOP_COUNT:
        errors.append(_err(None, 'Stop', f'With blank stops the {STOP_COUNT} stops are assigned '
                                         f'automatically, which needs at least {STOP_COUNT} boxes '
                                         f'(this load has {total}). Give each row a stop instead.'))
    if errors:
        raise CustomLoadError(errors, notes)

    # ── loader-format dict ───────────────────────────────────────────────────
    raw = to_loader_format(parsed, cont)
    # The augmented boxes are copies: 'raw' stays exactly the loader's output.
    boxes = [dict(b, allowed_orientations=list(b['allowed_orientations'])) for b in raw['boxes']]
    box_rows = [p['row'] for p in parsed for _ in range(p['qty'])]

    # ── stops: stored once, here; every configuration and seed reads them ───
    if stop_mode == 'given':
        k = 0
        for p in parsed:
            for _ in range(p['qty']):
                boxes[k]['stop'] = p['stop']; k += 1
        stop_report = {'mode': 'given', 'num_stops': STOP_COUNT, 'seed': None,
                       'counts': _counts(b['stop'] for b in boxes)}
    else:
        try:
            rep = assign_stops(boxes, num_stops=STOP_COUNT, seed=STOP_SEED)
        except ValueError as e:     # the pipeline's balance check (+/-10 pp of 1/S)
            raise CustomLoadError([_err(None, 'Stop', f'With blank stops the {STOP_COUNT} stops are drawn '
                                                      f'balanced, and {len(boxes)} boxes cannot be split '
                                                      f'evenly enough ({e}). Give each row a stop instead.')], notes)
        stop_report = {'mode': 'assigned', 'num_stops': STOP_COUNT, 'seed': STOP_SEED,
                       'counts': {int(s): c for s, c in rep['counts'].items()}}

    # ── fragility: ticks, plus the type-level rule at a chosen share ─────────
    ticked = [p['fragile'] for p in parsed for _ in range(p['qty'])]
    share_types = fragile_types_by_share(boxes, share) if share is not None else set()
    for b, t in zip(boxes, ticked):
        b['fragile'] = 1 if (t or b['type_id'] in share_types) else 0
    lbs = [_box_lbs(b) for b in boxes]
    ratio = max(lbs) / min(lbs)
    n_frag = sum(b['fragile'] for b in boxes)
    frag_report = {
        'mode': ('ticks+share' if share is not None and any(ticked) else
                 'share' if share is not None else 'ticks' if any(ticked) else 'none'),
        'ticked_count': sum(ticked),
        'share_target': share,
        'share_types': sorted(share_types),
        'share_count': sum(1 for b in boxes if b['type_id'] in share_types),
        'fragile_count': n_frag,
        'fragile_rate': n_frag / len(boxes),
        'lbs_min': min(lbs), 'lbs_max': max(lbs), 'lbs_ratio': ratio,
    }
    warnings = []
    if share is not None and ratio <= 2.0:
        warnings.append(f'Box strengths are nearly uniform (strongest / weakest = {ratio:.2f}, at most 2), '
                        f'so "mark the weakest share" cannot meaningfully rank them.')
    if n_frag == 0:
        warnings.append('No fragile boxes in this load.')
    if advanced and any(r.get('max_load', '') for r in rows):
        warnings.append('Max load on top is ignored: the advanced strength columns are used exactly.')

    container = container_from_file_dims(raw['container'])
    total_mass = sum(b['mass'] for b in boxes)
    return {
        'stackr_custom_load': FORMAT_VERSION,
        'label': LABEL,
        'name': (request.get('name') or '').strip() or None,
        'source': source,
        'mode': 'advanced' if advanced else 'simple',
        'raw': raw,
        'container': container,
        'boxes': boxes,
        'box_rows': box_rows,
        'row_names': [p['name'] for p in parsed],
        'max_weight_kg': max_weight,
        'totals': {'boxes': len(boxes), 'volume_m3': raw['total_volume_m3'], 'mass_kg': total_mass,
                   'container_volume_m3': cont['length'] * cont['width'] * cont['height'] / 1e6},
        'augmentation': {'source': 'custom', 'stops': stop_report, 'fragility': frag_report},
        'warnings': warnings,
        'notes': notes,
    }


def to_loader_format(parsed, cont):
    """Parsed rows -> the dict loader.parse_wtpack returns (one entry per box,
    row order kept, ids 0..n-1, one type_id per row unless a Type ID column
    was given)."""
    boxes = []
    for row_idx, p in enumerate(parsed):
        type_id = p['type_id'] if p.get('type_id') is not None else row_idx
        for _ in range(p['qty']):
            boxes.append({
                'id': len(boxes),
                'type_id': type_id,
                'l': p['l'], 'w': p['w'], 'h': p['h'],
                'l_flag': p['l_flag'], 'w_flag': p['w_flag'], 'h_flag': p['h_flag'],
                'mass': p['mass'],
                'lbs_l': p['lbs_l'], 'lbs_w': p['lbs_w'], 'lbs_h': p['lbs_h'],
                'allowed_orientations': _allowed_orientations(p['l_flag'], p['w_flag'], p['h_flag']),
            })
    return {
        'container': {'L': cont['length'], 'W': cont['width'], 'H': cont['height']},
        'n_types': len({b['type_id'] for b in boxes}),
        'total_volume_m3': sum(b['l'] * b['w'] * b['h'] for b in boxes) / 1e6,
        'boxes': boxes,
    }


# Box extents (dx, dy, dz) per orientation code: loader._allowed_orientations
# encoding, identical to optimizer/geometry_3d.ORIENT_FNS.
_ORIENT = {1: lambda l, w, h: (l, w, h), 2: lambda l, w, h: (w, l, h),
           3: lambda l, w, h: (l, h, w), 4: lambda l, w, h: (h, l, w),
           5: lambda l, w, h: (w, h, l), 6: lambda l, w, h: (h, w, l)}


def _fits_somewhere(p, allowed, cont):
    c = container_from_file_dims({'L': cont['length'], 'W': cont['width'], 'H': cont['height']})
    for r in allowed:
        dx, dy, dz = _ORIENT[r](p['l'], p['w'], p['h'])
        if dx <= c['L'] and dy <= c['W'] and dz <= c['H']:
            return True
    return False


def _counts(values):
    out = {}
    for v in values:
        out[int(v)] = out.get(int(v), 0) + 1
    return dict(sorted(out.items()))


def _list(nums):
    nums = list(nums)
    return ', '.join(map(str, nums[:6])) + (' ...' if len(nums) > 6 else '')


def _fmt(x):
    return f'{x:g}'


def _csv_line_numbers(text):
    reader = csv.reader(io.StringIO(text))
    lines = list(reader)
    start = 0
    while start < len(lines) and not any(c.strip() for c in lines[start]):
        start += 1
    return [n for n, raw in enumerate(lines[start + 1:], start=start + 2) if any(c.strip() for c in raw)]


# ─── stored loads ────────────────────────────────────────────────────────────
def load_stored(custom_id: str, directory: Optional[Path] = None) -> Dict[str, Any]:
    """A stored custom load -> {'container', 'boxes', 'augmentation', 'doc'}.
    Stops and fragile flags are the stored ones; nothing is re-drawn."""
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', str(custom_id)):
        raise ValueError(f'bad custom load id {custom_id!r}')
    path = Path(directory or CUSTOM_LOADS_DIR) / f'{custom_id}.json'
    if not path.exists():
        raise FileNotFoundError(f'custom load {custom_id!r} not found at {path}')
    doc = json.loads(path.read_text(encoding='utf-8'))
    return {'container': doc['container'], 'boxes': doc['boxes'],
            'augmentation': doc.get('augmentation', {'source': 'custom'}), 'doc': doc}


# ─── CSV export / templates ──────────────────────────────────────────────────
def template(mode: str) -> str:
    cols = SIMPLE_COLUMNS + (ADVANCED_COLUMNS if mode == 'advanced' else [])
    out = io.StringIO()
    w = csv.writer(out, lineterminator='\n')
    w.writerow([t for _, t in cols])
    if mode == 'advanced':
        w.writerow(['Carton A', '1', '60', '40', '50', '20', '', '4', 'no', '0', '1', '1', '1', '0.05', '0.05', '0.05'])
        w.writerow(['Glassware', '2', '40', '30', '30', '8', '', '2', 'yes', '1', '0', '0', '1', '0.02', '0.02', '0.02'])
    else:
        w.writerow(['Carton A', '1', '60', '40', '50', '20', '120', '4', 'no'])
        w.writerow(['Glassware', '2', '40', '30', '30', '8', '24', '2', 'yes'])
    return out.getvalue()


def export_wtpack_csv(instance_id: int, raw_dir: Optional[str] = None) -> str:
    """One advanced-CSV row per box (Qty 1) of a pipeline-augmented wtpack
    instance, in loader order, with its actual stop labels and fragile flags.
    Floats are written with repr so re-import is exact."""
    inst = load_augmented_instance({'data': {'raw_dir': raw_dir or str(_ROOT / 'data' / 'raw')}},
                                   instance_id=instance_id)
    out = io.StringIO()
    w = csv.writer(out, lineterminator='\n')
    w.writerow([t for _, t in SIMPLE_COLUMNS + ADVANCED_COLUMNS])
    for b in inst['boxes']:
        w.writerow([f'box {b["id"]}', b['stop'], repr(b['l']), repr(b['w']), repr(b['h']), repr(b['mass']),
                    '', 1, 'yes' if b['fragile'] else 'no', b['type_id'],
                    b['l_flag'], b['w_flag'], b['h_flag'], repr(b['lbs_l']), repr(b['lbs_w']), repr(b['lbs_h'])])
    return out.getvalue()


# ─── ready-made samples (real wtpack instances, NOT custom loads) ─────────────
SAMPLE_TARGETS = (('~70 boxes', 70), ('~130 boxes', 130), ('~250 boxes', 250))
STUDY_A_INSTANCE = 350


def ready_made_samples(raw_dir: Optional[str] = None) -> Dict[str, Any]:
    """Pick OR-Library instances by COMPUTED box count: the nearest to ~70,
    ~130 and ~250 boxes, plus the largest, among instances the thesis pipeline
    accepts (assign_fragility's gates). For ~130 the Study A instance (350) is
    used when it passes. Instances skipped for failing a gate are reported."""
    from preprocessing.loader import parse_wtpack
    from preprocessing.fragility import assign_fragility
    from preprocessing.sampling import resolve_instance_id
    raw = Path(raw_dir or _ROOT / 'data' / 'raw')
    cap = None
    prov = _ROOT / 'experiments' / 'samples' / 'sample30_seed42.json'
    if prov.exists():
        cap = json.loads(prov.read_text(encoding='utf-8')).get('max_boxes')
    rows = []
    for f in range(1, 8):
        for i, inst in enumerate(parse_wtpack(str(raw / f'wtpack{f}.txt'))):
            iid = i * 7 + f - 1
            boxes = [dict(b) for b in inst['boxes']]
            try:
                rep = assign_fragility(boxes)
                reason = None
            except ValueError as e:
                rep, reason = None, str(e)
            meta = resolve_instance_id(iid)
            rows.append({'instance_id': iid, 'br_class': meta['br_class'], 'n_boxes': len(boxes),
                         'n_types': inst['n_types'], 'container': inst['container'],
                         'fragile_count': rep['fragile_count'] if rep else None,
                         'fragile_rate': rep['fragile_rate'] if rep else None, 'reason': reason})
    ok = [r for r in rows if r['reason'] is None]
    samples, excluded = [], []

    def pick(title, chosen, why, skipped):
        samples.append(dict(chosen, target=title, why=why,
                            over_cap=bool(cap and chosen['n_boxes'] > cap)))
        for r in skipped:
            excluded.append({'target': title, 'instance_id': r['instance_id'], 'br_class': r['br_class'],
                             'n_boxes': r['n_boxes'], 'reason': r['reason']})

    for title, t in SAMPLE_TARGETS:
        best = min(ok, key=lambda r: (abs(r['n_boxes'] - t), r['instance_id']))
        why = f'nearest to {t} boxes that the thesis pipeline accepts'
        if t == 130:
            a = next((r for r in ok if r['instance_id'] == STUDY_A_INSTANCE), None)
            if a is not None:
                best, why = a, "the Study A instance (the thesis's main test case)"
        d = abs(best['n_boxes'] - t)
        skipped = sorted((r for r in rows if r['reason'] and abs(r['n_boxes'] - t) < d),
                         key=lambda r: (abs(r['n_boxes'] - t), r['instance_id']))
        pick(title, best, why, skipped)
    largest = max(ok, key=lambda r: (r['n_boxes'], -r['instance_id']))
    pick('largest', largest, 'the largest instance the thesis pipeline accepts',
         sorted((r for r in rows if r['reason'] and r['n_boxes'] > largest['n_boxes']),
                key=lambda r: -r['n_boxes']))
    return {'source': 'OR-Library benchmark (wtpack1-7)', 'cap': cap,
            'largest_overall': max(rows, key=lambda r: r['n_boxes']),
            'samples': samples, 'excluded': excluded}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('convert', help='request JSON on stdin -> result JSON on stdout')
    c.add_argument('--out', help='write the converted document here when valid')
    e = sub.add_parser('export-wtpack', help='advanced CSV of a wtpack instance')
    e.add_argument('instance_id', type=int)
    t = sub.add_parser('template')
    t.add_argument('mode', choices=['simple', 'advanced'])
    sub.add_parser('samples', help='the ready-made OR-Library samples (JSON)')
    a = ap.parse_args(argv)

    if a.cmd == 'samples':
        print(json.dumps(ready_made_samples())); return 0
    if a.cmd == 'template':
        sys.stdout.write(template(a.mode)); return 0
    if a.cmd == 'export-wtpack':
        sys.stdout.write(export_wtpack_csv(a.instance_id)); return 0

    request = json.loads(sys.stdin.buffer.read().decode('utf-8-sig'))
    try:
        doc = convert(request)
    except CustomLoadError as err:
        print(json.dumps({'ok': False, 'errors': err.errors, 'notes': err.notes})); return 2
    except Exception as err:        # never a traceback in place of a message
        print(json.dumps({'ok': False, 'errors': [_err(None, None, f'Could not convert this load: {err}')]}))
        return 2
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(json.dumps(doc, indent=1), encoding='utf-8')
    print(json.dumps({'ok': True, 'summary': summary(doc)}))
    return 0


def summary(doc):
    return {'label': doc['label'], 'name': doc['name'], 'source': doc['source'], 'mode': doc['mode'],
            'totals': doc['totals'], 'container': doc['container'], 'max_weight_kg': doc['max_weight_kg'],
            'stops': doc['augmentation']['stops'], 'fragility': doc['augmentation']['fragility'],
            'warnings': doc['warnings'], 'notes': doc.get('notes', [])}


if __name__ == '__main__':
    sys.exit(main())
