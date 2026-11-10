import csv, sys, collections as c
import numpy as np
ROOT = r"C:\thesis-3dbpp"
sys.path[:0] = [ROOT + r"\experiments", ROOT + r"\optimizer", ROOT]
from stats import compare_rm
CFG = ["DGWO", "MOGWO", "SEQ", "REP"]
DEV = {413, 147, 392, 454}
vals = c.defaultdict(list)
for r in csv.DictReader(open(r"C:\thesis-tools\export\compliant_su_per_run.csv")):
    vals[(r["configuration"], int(r["instance_id"]))].append(float(r["compliant_su"]))
insts = sorted({i for _, i in vals})
lines = []
def run(title, use):
    mat = np.array([[np.mean(vals[(cfg, i)]) for cfg in CFG] for i in use])
    res = compare_rm(mat, CFG, "compliant SU")
    om = res["omnibus"]
    lines.append(f"=== {title} ({len(use)} instances) ===")
    lines.append("instance means: " + ", ".join(f"{k} {v}" for k, v in res["instance_means"].items()))
    lines.append(f"normality of within-instance differences: all normal = {res['all_normal']}")
    lines.append(f"omnibus: {om.get('test')} statistic={om.get('statistic')} p={om.get('p')} significant={om.get('significant')}")
    lines.append(f"post hoc: {res.get('posthoc_test')}, effect size {res.get('effect_size')}")
    for p in res["pairs"]:
        lines.append(f"   {p['a']} vs {p['b']}: p_holm={p['p']} effect={p['effect']['value']} ({p['effect']['magnitude']}) -> {p['verdict']}")
    lines.append("")
lines.append("SUPPLEMENTARY POST HOC ANALYSIS: compliant SU (volume of boxes satisfying C3-C6, % of container)")
lines.append("Main study, thesis-run-v3; same repeated-measures procedure as SP1; separate from the planned hypothesis family.")
lines.append("")
run("All instances", insts)
run("Sensitivity: excluding development instances 413, 147, 392, 454", [i for i in insts if i not in DEV])
text = "\n".join(lines)
open(r"C:\thesis-tools\export\stats_compliant_su_supplementary.txt", "w", encoding="utf-8").write(text + "\n")
print(text)
