"""Read-only facts about loads, for the guided UI. Changes nothing it reads.

    python preprocessing/load_info.py schema          # columns and rules custom_load.py accepts
    python preprocessing/load_info.py totals 350      # boxes / volume / mass / stops / fragile of a wtpack instance

`schema` is built from custom_load.py's own constants (column titles,
required columns, aliases, the box limit, the stop count), so the upload
screen's format explanation and template cannot drift from the converter.
`totals` loads the instance exactly as a run does (pipeline defaults).
"""
import sys
import json
import argparse
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from preprocessing import custom_load as cl                      # noqa: E402
from preprocessing.pipeline import load_augmented_instance        # noqa: E402

# What each simple column holds. The numbers in these rules come from the
# converter's checks: sizes, weight and max load must be > 0, Qty a whole
# number > 0, Stop a whole number 1..STOP_COUNT, Handle with care yes/no.
_KINDS = {
    'name': ('text', 'any text, for your own reference'),
    'stop': ('whole number', f'1 to {cl.STOP_COUNT}; stop 1 is unloaded first'),
    'length': ('number', 'cm, greater than 0'),
    'width': ('number', 'cm, greater than 0'),
    'height': ('number', 'cm, greater than 0; stays vertical'),
    'weight': ('number', 'kg, greater than 0'),
    'max_load': ('number', 'kg the top of the box can carry, greater than 0'),
    'qty': ('whole number', 'how many of this box, greater than 0'),
    'fragile': ('yes / no', 'yes marks the box as fragile: nothing may rest on it'),
}


def schema():
    aliases = {}
    for alias, key in cl._ALIASES.items():
        aliases.setdefault(key, []).append(alias)
    required = set(cl.REQUIRED) | {'max_load'}          # max_load: required unless all six advanced columns
    return {
        'columns': [{'key': k, 'title': t, 'required': k in required,
                     'type': _KINDS[k][0], 'rule': _KINDS[k][1], 'aliases': sorted(aliases.get(k, []))}
                    for k, t in cl.SIMPLE_COLUMNS],
        'advanced_columns': [{'key': k, 'title': t} for k, t in cl.ADVANCED_COLUMNS],
        'true_values': sorted(cl._TRUE - {''}), 'false_values': sorted(cl._FALSE - {''}),
        'max_boxes': cl.MAX_BOXES, 'stop_count': cl.STOP_COUNT, 'stop_seed': cl.STOP_SEED,
        'upright_orientations': cl.UPRIGHT, 'label': cl.LABEL,
        'template': cl.template('simple'),
    }


def totals(instance_id, raw_dir=None):
    inst = load_augmented_instance({'data': {'raw_dir': raw_dir or str(_ROOT / 'data' / 'raw')}},
                                   instance_id=instance_id)
    boxes, c = inst['boxes'], inst['container']
    stops = {}
    for b in boxes:
        stops[int(b['stop'])] = stops.get(int(b['stop']), 0) + 1
    return {
        'instance_id': instance_id, 'boxes': len(boxes),
        'volume_m3': sum(b['l'] * b['w'] * b['h'] for b in boxes) / 1e6,
        'mass_kg': sum(b['mass'] for b in boxes),
        'container_volume_m3': c['L'] * c['W'] * c['H'] / 1e6,
        'stops': dict(sorted(stops.items())),
        'fragile_count': sum(int(b['fragile']) for b in boxes),
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('schema')
    t = sub.add_parser('totals')
    t.add_argument('instance_id', type=int)
    a = ap.parse_args(argv)
    print(json.dumps(schema() if a.cmd == 'schema' else totals(a.instance_id)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
