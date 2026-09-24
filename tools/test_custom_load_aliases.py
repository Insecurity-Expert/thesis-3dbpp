"""Guided-UI Part B: stop-column aliases, ignored columns, the 3-stop limit.

    python tools/test_custom_load_aliases.py

  1  "Stop", "Stop Number", "Stop Sequence", "Delivery Sequence" (any case)
     all map to the stop field and give the same stops as "Stop".
  2  A "Destination" column is ignored with the note
     "Destination ignored — STACKR uses stop numbers."; any other unknown
     column is ignored with its own note. Neither is an error.
  3  A stop above 3 is an error naming the row that says
     "STACKR supports up to 3 delivery stops."
  4  load_info.schema() (the upload help text) reports the columns, the 500-box limit and 3 stops.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from preprocessing import custom_load as cl   # noqa: E402
from preprocessing import load_info           # noqa: E402

CONTAINER = {'length': 587, 'width': 233, 'height': 220}
FAILED = []


def check(name, got, want):
    ok = got == want
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + ('' if ok else f"  (got {got!r}, want {want!r})"))
    if not ok:
        FAILED.append(name)


def body(stop_header, extra_header=None, stops=('1', '2', '3')):
    head = ['Box name', stop_header, 'Length (cm)', 'Width (cm)', 'Height (cm)', 'Weight (kg)',
            'Max load on top (kg)', 'Qty', 'Handle with care'] + ([extra_header] if extra_header else [])
    rows = [[f'B{i}', s, '60', '40', '50', '20', '120', '2', 'no'] + (['Manila'] if extra_header else [])
            for i, s in enumerate(stops, start=1)]
    return '\n'.join(','.join(r) for r in [head] + rows) + '\n'


def convert(csv_text):
    try:
        return cl.convert({'source': 'csv', 'csv': csv_text, 'container': CONTAINER}), None
    except cl.CustomLoadError as e:
        return None, e


print("1  stop aliases")
ref, _ = convert(body('Stop'))
for header in ['Stop', 'stop', 'Stop Number', 'STOP NUMBER', 'Stop Sequence', 'Delivery Sequence', 'delivery sequence']:
    doc, err = convert(body(header))
    check(f'"{header}" -> stop', None if err else [b['stop'] for b in doc['boxes']], [b['stop'] for b in ref['boxes']])
    if doc:
        check(f'"{header}" stops given, not assigned', doc['augmentation']['stops']['mode'], 'given')

print("2  ignored columns")
doc, err = convert(body('Delivery Sequence', 'Destination'))
check('Destination is not an error', err, None)
check('Destination note', doc and doc['notes'], ['Destination ignored — STACKR uses stop numbers.'])
check('note reaches the summary', doc and cl.summary(doc)['notes'], ['Destination ignored — STACKR uses stop numbers.'])
doc, err = convert(body('Stop', 'Colour'))
check('other unknown column is not an error', err, None)
check('other unknown column note', doc and doc['notes'], ['"Colour" ignored — STACKR does not use this column.'])

print("3  stop above 3")
doc, err = convert(body('Stop', stops=('1', '4', '2')))
msgs = [e['message'] for e in err.errors] if err else []
check('stop 4 rejected', doc, None)
check('names row 2', any(e['row'] == 2 and e['column'] == 'Stop' for e in (err.errors if err else [])), True)
check('3-stop message', any('STACKR supports up to 3 delivery stops.' in m for m in msgs), True)
doc, err = convert(body('Stop', 'Destination', stops=('1', '4', '2')))
check('notes kept on an invalid load', err.notes if err else None, ['Destination ignored — STACKR uses stop numbers.'])

print("4  schema")
sc = load_info.schema()
check('max boxes', sc['max_boxes'], 500)
check('stop count', sc['stop_count'], 3)
check('required columns', [c['title'] for c in sc['columns'] if c['required']],
      ['Length (cm)', 'Width (cm)', 'Height (cm)', 'Weight (kg)', 'Max load on top (kg)', 'Qty'])
check('no Destination column', any('destination' in c['title'].lower() for c in sc['columns']), False)

print()
print(f"{'FAIL' if FAILED else 'PASS'} - {len(FAILED)} failed")
sys.exit(1 if FAILED else 0)
