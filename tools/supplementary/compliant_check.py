import json, sys, statistics as st, collections as c
ROOT = r"C:\thesis-3dbpp"
sys.path[:0] = [ROOT, ROOT + r"\optimizer", ROOT + r"\tools"]
from preprocessing.pipeline import load_augmented_instance
from thesis_metrics import per_box_constraints
from validate_arrangement import validate
d = json.load(open(ROOT + r"\experiments\results\studies\thesis_main_v3.json"))
cache = {}
csr_diff = c.defaultdict(list); set_mismatch = c.Counter(); su_diff = c.defaultdict(list)
recorded = c.defaultdict(list); recount = c.defaultdict(list); n = c.Counter()
for r in d["runs"]:
    i, cfg = r["instance_id"], r["configuration"]
    if i not in cache:
        inst = load_augmented_instance({"data": {"raw_dir": ROOT + r"\data\raw"}}, instance_id=i, stop_seed=42, stop_count=3)
        C = inst["container"]; cache[i] = (inst["boxes"], C, C["L"] * C["W"] * C["H"])
    B, C, V = cache[i]
    P = {int(k): v for k, v in r["placements"].items()}
    O = {int(k): v for k, v in r["orientations"].items()}
    ev = {k for k, x in per_box_constraints(P, B, O).items() if x["C3"] and x["C4"] and x["C5"] and x["C6"]}
    vb = validate(C, B, P, O, verbose=True)["per_box"]
    va = {k for k, x in vb.items() if all(x.get(t, True) for t in ("C1", "C2", "C3", "C4", "C5", "C6"))}
    n[cfg] += 1
    if ev != va: set_mismatch[cfg] += 1
    pct = 100 * len(ev) / len(P) if P else 0.0
    csr_diff[cfg].append(abs(pct - r["csr_pct"]))
    recorded[cfg].append(r["csr_pct"]); recount[cfg].append(pct)
    vol = lambda ks: 100 * sum(P[k][3] * P[k][4] * P[k][5] for k in ks) / V
    su_diff[cfg].append(abs(vol(ev) - vol(va)))
print("CHECK: compliant boxes recounted from saved arrangements vs the main study's recorded CSR, and evaluator vs independent validator")
print(f"{'config':6s} | {'runs':>4s} | {'recorded CSR (loaded)':>21s} | {'recounted':>9s} | {'max |diff|':>10s} | {'runs where evaluator and validator disagree on a box':>52s} | {'max compliant-SU diff (eval vs validator)':>41s}")
for cfg in ("DGWO", "MOGWO", "SEQ", "REP"):
    print(f"{cfg:6s} | {n[cfg]:4d} | {st.mean(recorded[cfg]):21.2f} | {st.mean(recount[cfg]):9.2f} | {max(csr_diff[cfg]):10.6f} | {set_mismatch[cfg]:52d} | {max(su_diff[cfg]):41.6f}")
