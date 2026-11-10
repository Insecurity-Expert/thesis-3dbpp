import json, sys, os, statistics as st, collections as c
ROOT = r"C:\thesis-3dbpp"
sys.path[:0] = [ROOT, ROOT + r"\optimizer", ROOT + r"\experiments"]
from preprocessing.pipeline import load_augmented_instance
from thesis_metrics import per_box_constraints
S = ROOT + r"\experiments\results\studies\thesis_main_v3.json"
d = json.load(open(S))
cache = {}
rows = []
for r in d["runs"]:
    i = r["instance_id"]
    if i not in cache:
        inst = load_augmented_instance({"data": {"raw_dir": ROOT + r"\data\raw"}}, instance_id=i, stop_seed=42, stop_count=3)
        C = inst["container"]
        cache[i] = (inst["boxes"], C["L"] * C["W"] * C["H"])
    B, V = cache[i]
    P = {int(k): v for k, v in r["placements"].items()}
    O = {int(k): v for k, v in r["orientations"].items()}
    pb = per_box_constraints(P, B, O)
    vol = lambda k: P[k][3] * P[k][4] * P[k][5]
    ok = [k for k, x in pb.items() if x["C3"] and x["C4"] and x["C5"] and x["C6"]]
    rows.append((r["configuration"], i, 100 * sum(map(vol, P)) / V, 100 * sum(vol(k) for k in ok) / V))
g = c.defaultdict(lambda: c.defaultdict(list))
for cfg, i, su, csu in rows:
    g[cfg][i].append((su, csu))
print("Compliant SU: volume of boxes that satisfy C3-C6, as % of the container (main study, mean over instances)")
print(f"{'config':6s} | {'SU':>6s} | {'compliant SU':>12s} | {'non-compliant fill':>18s}")
for cfg in ("DGWO", "MOGWO", "SEQ", "REP"):
    su = st.mean(st.mean(x[0] for x in v) for v in g[cfg].values())
    csu = st.mean(st.mean(x[1] for x in v) for v in g[cfg].values())
    print(f"{cfg:6s} | {su:6.2f} | {csu:12.2f} | {su - csu:18.2f}")
with open(r"C:\thesis-tools\export\compliant_su_per_run.csv", "w") as f:
    f.write("configuration,instance_id,su,compliant_su\n")
    for x in rows: f.write(f"{x[0]},{x[1]},{x[2]:.4f},{x[3]:.4f}\n")
print("written C:\\thesis-tools\\export\\compliant_su_per_run.csv")
