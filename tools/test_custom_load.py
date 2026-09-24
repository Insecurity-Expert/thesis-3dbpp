"""Custom-load converter acceptance (preprocessing/custom_load.py).

  1a  instance 350 exported to the advanced CSV and re-imported: the converted
      box list equals loader.py's output field by field
  1b  through pipeline.container_from_file_dims: length_cm 587, width_cm 233,
      door on the 233 x 220 face; stops and fragile flags equal the pipeline's
  2   a three-box simple-mode CSV against values computed by hand
  3   one malformed CSV hitting every validation rule
  4   blank stops are drawn once at conversion and stored
  +   fragile share option, near-uniform warning, no-fragile message

Writes nothing outside a temporary directory.

    python tools/test_custom_load.py
"""
import sys
import json
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from preprocessing.loader import parse_wtpack
from preprocessing.pipeline import load_augmented_instance
from preprocessing.sampling import resolve_instance_id
from preprocessing import custom_load as cl

_passed, _failed = 0, []
CONTAINER = {'length': 587, 'width': 233, 'height': 220}


def check(name, got, want):
    global _passed
    if got == want:
        _passed += 1
        print(f"  PASS  {name}")
    else:
        _failed.append(name)
        print(f"  FAIL  {name}: got {got!r}, want {want!r}")


def errors_of(request):
    try:
        cl.convert(request)
    except cl.CustomLoadError as e:
        return e.errors
    return []


# ── 1. round trip on instance 350 ────────────────────────────────────────────
print("\n[1] round trip: instance 350 -> advanced CSV -> converter")
ID = 350
meta = resolve_instance_id(ID)
loader_inst = parse_wtpack(str(_ROOT / 'data' / 'raw' / meta['file']))[meta['index']]
piped = load_augmented_instance({'data': {'raw_dir': str(_ROOT / 'data' / 'raw')}}, instance_id=ID)
csv_text = cl.export_wtpack_csv(ID)
check("one CSV row per box, Qty 1", len(csv_text.strip().splitlines()) - 1, len(loader_inst['boxes']))
c = loader_inst['container']
doc = cl.convert({'source': 'csv', 'csv': csv_text, 'fragile_share': None,
                  'container': {'length': c['L'], 'width': c['W'], 'height': c['H']}})
raw = doc['raw']
diffs = []
for a, b in zip(raw['boxes'], loader_inst['boxes']):
    for k in b:
        if a.get(k) != b[k] or type(a.get(k)) is not type(b[k]):
            diffs.append((b['id'], k, a.get(k), b[k]))
    extra = set(a) - set(b)
    if extra:
        diffs.append((b['id'], 'extra keys', sorted(extra), None))
check("1a box count", len(raw['boxes']), len(loader_inst['boxes']))
check("1a every box equals loader.py field by field (value and type)", diffs, [])
check("1a container dict equals loader.py", raw['container'], loader_inst['container'])
check("1a n_types equals loader.py", raw['n_types'], loader_inst['n_types'])
print(f"        total_volume_m3: converter {raw['total_volume_m3']!r} (sum of boxes) vs "
      f"file header {loader_inst['total_volume_m3']!r} (stated in wtpack, not recomputed)")
cont = doc['container']
check("1b length_cm = 587", cont['length_cm'], 587.0)
check("1b width_cm = 233", cont['width_cm'], 233.0)
check("1b door face = x extent x z extent = 233 x 220 (y = 0 face)", (cont['L'], cont['H']), (233.0, 220.0))
check("1b container equals the pipeline's", cont, piped['container'])
check("1b stop labels equal the pipeline's (seed 42)",
      [b['stop'] for b in doc['boxes']], [b['stop'] for b in piped['boxes']])
check("1b fragile flags equal the pipeline's",
      [b['fragile'] for b in doc['boxes']], [b['fragile'] for b in piped['boxes']])
check("1b augmented boxes equal the pipeline's", doc['boxes'], piped['boxes'])
check("1  stops recorded as given (from the file)", doc['augmentation']['stops']['mode'], 'given')

# ── 2. hand check ────────────────────────────────────────────────────────────
print("\n[2] hand check: three simple-mode boxes")
HAND = """Box name,Stop,Length (cm),Width (cm),Height (cm),Weight (kg),Max load on top (kg),Qty,Handle with care
Carton A,1,60,40,50,20,120,1,no
Glassware,2,40,30,30,8,24,1,yes
Crate,3,120,80,100,45.5,400,1,
"""
doc = cl.convert({'source': 'csv', 'csv': HAND, 'container': CONTAINER})
b = doc['boxes']
# lbs = max load / top face (length x width):
#   Carton A   120 kg / (60 x 40 = 2400 cm2)  = 0.05       kg/cm2
#   Glassware   24 kg / (40 x 30 = 1200 cm2)  = 0.02       kg/cm2
#   Crate      400 kg / (120 x 80 = 9600 cm2) = 0.041666.. kg/cm2
hand = [(60, 40, 50, 20, 120 / 2400), (40, 30, 30, 8, 24 / 1200), (120, 80, 100, 45.5, 400 / 9600)]
for box, (l, w, h, m, lbs) in zip(b, hand):
    tag = f"box {box['id']}"
    check(f"{tag} l,w,h = {l},{w},{h}", (box['l'], box['w'], box['h']), (l, w, h))
    check(f"{tag} mass = {m}", box['mass'], m)
    check(f"{tag} lbs_l = lbs_w = lbs_h = {lbs:.6f}", (box['lbs_l'], box['lbs_w'], box['lbs_h']), (lbs, lbs, lbs))
    check(f"{tag} upright: flags (0,0,1), orientations [1, 2]",
          (box['l_flag'], box['w_flag'], box['h_flag'], box['allowed_orientations']), (0, 0, 1, [1, 2]))
check("ids 0,1,2 and one type per row", [(x['id'], x['type_id']) for x in b], [(0, 0), (1, 1), (2, 2)])
check("stops as typed", [x['stop'] for x in b], [1, 2, 3])
check("fragile from the tick only", [x['fragile'] for x in b], [0, 1, 0])
check("totals: mass 73.5 kg", doc['totals']['mass_kg'], 73.5)
check("totals: volume 0.12 + 0.036 + 0.96 m3",
      round(doc['totals']['volume_m3'], 9), round((120000 + 36000 + 960000) / 1e6, 9))
check("max weight blank -> None (no preset)", doc['max_weight_kg'], None)

# ── 3. malformed file ────────────────────────────────────────────────────────
print("\n[3] one malformed CSV, every rule")
BAD = """Box name,Stop,Length (cm),Width (cm),Height (cm),Max load on top (kg),Qty,Handle with care
Row one,1,abc,40,50,120,1,no
Row two,4,60,-5,50,120,1,no
Row three,1,60,40,50,120,2.5,no
Row four,,60,40,50,,1,no
Row five,2,700,40,50,120,1,no
Row six,3,60,40,50,120,600,maybe
"""
errs = errors_of({'source': 'csv', 'csv': BAD, 'container': CONTAINER})
for e in errs:
    print(f"        row {e['row']}, {e['column']}: {e['message']}")


def has(row, column, fragment):
    return any(e['row'] == row and e['column'] == column and fragment in e['message'] for e in errs)


check("missing column: Weight (kg)", has(None, 'Weight (kg)', 'Missing column'), True)
check("non-numeric: row 1 Length", has(1, 'Length (cm)', 'not a number'), True)
check("non-positive: row 2 Width", has(2, 'Width (cm)', 'greater than 0'), True)
check("stop out of range: row 2 Stop", has(2, 'Stop', 'from 1 to 3'), True)
check("non-integer qty: row 3 Qty", has(3, 'Qty', 'not a whole number'), True)
check("mixed blank/non-blank stops: row 4 Stop", has(4, 'Stop', 'leave them all blank'), True)
check("blank max load: row 4", has(4, 'Max load on top (kg)', 'blank'), True)
check("fits nowhere: row 5", has(5, None, 'none of its allowed orientations'), True)
check("bad Handle with care: row 6", has(6, 'Handle with care', 'yes or no'), True)
check("over the box limit", has(None, 'Qty', 'limit is 500'), True)
check("errors name a file line", all(e.get('line') for e in errs if e['row']), True)
errs = errors_of({'source': 'typed', 'container': {'length': 0, 'width': 'x', 'height': 220},
                  'rows': [{'length': 1, 'width': 1, 'height': 1, 'weight': 1, 'max_load': 1, 'qty': 1}]})
check("container: non-positive length and non-numeric width",
      sorted(e['column'] for e in errs), ['Container length (door to cab)', 'Container width'])
errs = errors_of({'source': 'typed', 'container': CONTAINER,
                  'rows': [{'length': 1, 'width': 1, 'height': 1, 'weight': 1, 'max_load': 1, 'qty': 2}]})
check("blank stops need >= 3 boxes", any('at least 3 boxes' in e['message'] for e in errs), True)
errs = errors_of({'source': 'typed', 'container': CONTAINER,
                  'rows': [{'length': 1, 'width': 1, 'height': 1, 'weight': 1, 'max_load': 1, 'qty': 5}]})
check("blank stops on 5 boxes: pipeline balance check becomes a message",
      any('cannot be split' in e['message'] for e in errs), True)
ADV_PART = "Length,Width,Height,Weight,Qty,LBS L (kg/cm2)\n1,1,1,1,1,1\n"
errs = errors_of({'source': 'csv', 'csv': ADV_PART, 'container': CONTAINER})
check("partial advanced columns name the five missing",
      sum('advanced strength needs all six' in e['message'] for e in errs), 5)

# ── 4. stops stored once ────────────────────────────────────────────────────
print("\n[4] blank stops: drawn once at conversion, stored")
ROWS = [{'name': 'A', 'length': 60, 'width': 40, 'height': 50, 'weight': 20, 'max_load': 120, 'qty': 7},
        {'name': 'B', 'length': 40, 'width': 30, 'height': 30, 'weight': 8, 'max_load': 24, 'qty': 5}]
d1 = cl.convert({'source': 'typed', 'rows': ROWS, 'container': CONTAINER})
d2 = cl.convert({'source': 'typed', 'rows': ROWS, 'container': CONTAINER})
st = d1['augmentation']['stops']
check("mode assigned, seed recorded", (st['mode'], st['seed'], st['num_stops']),
      ('assigned', cl.STOP_SEED, cl.STOP_COUNT))
check("labels are 1..3 and balanced", st['counts'], {1: 4, 2: 4, 3: 4})
check("conversion is deterministic", [b['stop'] for b in d1['boxes']], [b['stop'] for b in d2['boxes']])
import tempfile
with tempfile.TemporaryDirectory() as tmp:
    Path(tmp, 'cl_test.json').write_text(json.dumps(d1), encoding='utf-8')
    back = cl.load_stored('cl_test', Path(tmp))
check("stored load returns the stored labels", [b['stop'] for b in back['boxes']],
      [b['stop'] for b in d1['boxes']])
check("no ticks, no share -> 'No fragile boxes in this load.'",
      'No fragile boxes in this load.' in d1['warnings'], True)

# ── fragile share option ───────────────────────────────────────────────────
print("\n[+] fragile share option")
d = cl.convert({'source': 'typed', 'rows': ROWS, 'container': CONTAINER, 'fragile_share': 0.25})
fr = d['augmentation']['fragility']
# A: lbs 0.05 x7 ; B: 0.02 x5. Weakest type B = 5/12 = 0.417 (closest cut to 25%).
check("share 25% flags the weakest type (B, 5 of 12)", (fr['share_types'], fr['fragile_count']), ([1], 5))
check("share reached is reported", round(fr['fragile_rate'], 4), round(5 / 12, 4))
check("strength ratio 2.5 > 2: no uniformity warning",
      any('nearly uniform' in w for w in d['warnings']), False)
flat = [dict(r, max_load=r['length'] * r['width'] * 0.05) for r in ROWS]
d = cl.convert({'source': 'typed', 'rows': flat, 'container': CONTAINER, 'fragile_share': 0.25})
check("near-uniform strengths warn", any('nearly uniform' in w for w in d['warnings']), True)
ticked = [dict(ROWS[0], fragile='yes'), ROWS[1]]
d = cl.convert({'source': 'typed', 'rows': ticked, 'container': CONTAINER, 'fragile_share': 0.25})
check("a tick always wins (ticked A + share-picked B = all 12)", d['augmentation']['fragility']['fragile_count'], 12)

print(f"\n{_passed} passed, {len(_failed)} failed")
if _failed:
    print("FAILED: " + ", ".join(_failed))
    sys.exit(1)
print("PASS")
