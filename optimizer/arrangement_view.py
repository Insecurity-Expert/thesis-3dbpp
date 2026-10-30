"""
arrangement_view.py
What the 3-D viewer needs to draw one finished wtpack arrangement: one render
entry per placed box, with its per-box C3-C6 outcome, plus the boxes that were
left out. ADDITIVE ONLY: nothing here feeds the search or the scores.

Used by main_optimizer.py (live runs, which the server saves as history rows)
and by `python optimizer/arrangement_view.py --study ...` (a stored study run),
so both sources are annotated by the same code, never by the browser.
"""
import sys
import json
import argparse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
for _p in (str(REPO_ROOT), str(REPO_ROOT / "optimizer")):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from thesis_metrics import (per_box_constraints, evaluate_constraints,
                            space_utilization)
from layout_metrics import face_gaps, gap_metrics, edge_indicators, FACES, FACE_NAMES

# Where physics y = 0 is, sent to the viewer as container.y_origin. Every
# producer today (decoder, repair, metrics, validator) measures y from the rear
# door. Flip this ONE value when the front-wall origin (paper D1) is merged;
# the client's door helper (client/src/viewer/truckFrame.js) reads it.
Y_ORIGIN = "door"

# Bump when the per-box fields change shape. Rows saved without
# result.problem_view predate the problem view and show a banner instead.
PROBLEM_VIEW_VERSION = 1
RULES = ("C3", "C4", "C5", "C6")


def wtpack_entry(box, item_idx, placement):
    """RENDER BOUNDARY — the only place the y-up convention exists.
    physics (x=across, y=depth from the rear door, z=height)
    -> render (x, y=height, z=depth)."""
    x, y, z, d1, d2, d3 = placement
    return {
        "x": x, "y": z, "z": y,
        "dx": d1, "dy": d3, "dz": d2,
        "length": d1, "height": d3, "width": d2,
        "orig_L": box['l'], "orig_H": box['h'], "orig_D": box['w'],
        "stop": box['stop'], "mass": box['mass'],
        "fragile": int(box['fragile']),
        "type": "Fragile" if box['fragile'] else "Standard",
    }


def annotate(entries, placements, orientations, items):
    """Add the per-box problem fields to render entries (keyed by item_idx)
    and return the result-level problem_view block."""
    per_box = per_box_constraints(placements, items, orientations)
    ids = {i: items[i].get('id', f"Box-{i+1:03d}") for i in range(len(items))}
    for e in entries:
        i = e["item_idx"]
        pb = per_box[i]
        e["orientation"] = int(orientations[i])
        e["checks"] = {k: bool(pb[k]) for k in RULES}
        e["violations"] = [k for k in RULES if not pb[k]]
        e["load_above_kg"] = round(pb["load_above_kg"], 4)
        e["max_load_kg"] = round(pb["capacity_kg"], 4)
        e["lbs_kg_cm2"] = pb["lbs_kg_cm2"]
        e["support_ratio"] = None if pb["support_ratio"] is None else round(pb["support_ratio"], 4)
        e["c6_blocked_by"] = [ids[j] for j in pb["c6_blockers"]]
    unplaced = [i for i in range(len(items)) if i not in placements]
    return {
        "version": PROBLEM_VIEW_VERSION,
        "attribution": "C3 loaded box, C4 fragile box, C5 unsupported box, "
                       "C6 blocked box (as tools/validate_arrangement.py)",
        "n_items": len(items),
        "n_placed": len(placements),
        "violating": {k: sum(1 for i in per_box if not per_box[i][k]) for k in RULES},
        "compliant_placed": sum(1 for i in per_box if all(per_box[i][k] for k in RULES)),
        "unplaced": [{"item_idx": i, "id": ids[i], "stop": items[i]['stop'],
                      "fragile": int(items[i]['fragile']), "mass": items[i]['mass']}
                     for i in unplaced],
    }


def render_container_of(container):
    return {"L": container['L'], "H": container['H'], "D": container['W'],
            "length_cm": container.get('length_cm'), "width_cm": container.get('width_cm'),
            "height_cm": container.get('height_cm'), "door": container.get('door', 'rear'),
            "y_origin": Y_ORIGIN}


def gap_view(entries, placements, container, items):
    """M-6 for the viewer: add each render entry's six face gaps and return the
    run summary. The numbers are layout_metrics.face_gaps / gap_metrics, not
    recomputed. Added here, so the browser draws without doing any gap maths:
    what lies beyond each face ("wall", or the box whose facing face is at
    exactly the gap), and, for a significant gap (>= tau), the dimension line
    and the empty block in front of the face. All in physics coordinates
    (x across, y depth, z height), keyed by face name x-, x+, y-, y+, z-, z+."""
    summary = gap_metrics(placements, container, items)
    tau = summary["significant_threshold_cm"]
    gaps = face_gaps(placements, container)
    ext = (float(container['L']), float(container['W']), float(container['H']))
    P = {i: [float(v) for v in placements[i]] for i in placements}
    for e in entries:
        i = e["item_idx"]
        lo = P[i][:3]
        hi = [lo[a] + P[i][3 + a] for a in range(3)]
        faces = {}
        for (ax, sgn), name in zip(FACES, FACE_NAMES):
            g = gaps[i][name]
            o1, o2 = [a for a in range(3) if a != ax]
            plane = hi[ax] if sgn > 0 else lo[ax]
            wall = (ext[ax] - hi[ax]) if sgn > 0 else lo[ax]
            nb, rect = None, (lo[o1], hi[o1], lo[o2], hi[o2])
            if abs(g - wall) > 1e-6:
                best = 0.0
                for j, q in P.items():
                    if j == i:
                        continue
                    qplane = q[ax] if sgn > 0 else q[ax] + q[3 + ax]
                    if abs((qplane - plane) * sgn - g) > 1e-6:      # beyond the face, at the gap
                        continue
                    r = (max(lo[o1], q[o1]), min(hi[o1], q[o1] + q[3 + o1]),
                         max(lo[o2], q[o2]), min(hi[o2], q[o2] + q[3 + o2]))
                    area = max(0.0, r[1] - r[0]) * max(0.0, r[3] - r[2])
                    if area > best:
                        nb, best, rect = j, area, r
            f = {"gap_cm": round(g, 4), "to": "wall" if nb is None else "box", "box": nb}
            if g >= tau - 1e-9:
                a = [0.0, 0.0, 0.0]
                a[o1], a[o2] = (rect[0] + rect[1]) / 2.0, (rect[2] + rect[3]) / 2.0
                a[ax] = plane
                b = list(a)
                b[ax] = plane + sgn * g
                block = [0.0] * 6
                block[o1], block[3 + o1] = lo[o1], hi[o1] - lo[o1]
                block[o2], block[3 + o2] = lo[o2], hi[o2] - lo[o2]
                block[ax], block[3 + ax] = min(plane, plane + sgn * g), g
                f["line"] = [[round(v, 4) for v in a], [round(v, 4) for v in b]]
                f["block"] = [round(v, 4) for v in block]
            faces[name] = f
        e["face_gaps"] = faces
    return {**summary, "source": "optimizer/layout_metrics.py (M-6)"}


def study_run_view(study_path, run_index, raw_dir=None):
    """Rebuild the viewer payload for one stored study run. Recomputes SU and
    CSR from the stored arrangement and refuses to draw if they differ from
    the values the study recorded."""
    from preprocessing.pipeline import load_augmented_instance
    doc = json.loads(Path(study_path).read_text(encoding='utf-8'))
    run = doc['runs'][run_index]
    custom_doc = None
    if run.get('custom_load'):
        # The stored load, with the stop labels and fragile flags every run used.
        from preprocessing.custom_load import load_stored
        inst = load_stored(run['custom_load'])
        custom_doc = inst['doc']
    else:
        inst = load_augmented_instance({'data': {'raw_dir': raw_dir or str(REPO_ROOT / 'data' / 'raw')}},
                                       instance_id=run['instance_id'],
                                       stop_seed=doc['stop_seed'], stop_count=doc['stop_count'])
    items, container = inst['boxes'], inst['container']
    placements = {int(k): tuple(float(v) for v in vals) for k, vals in run['placements'].items()}
    orientations = {int(k): int(v) for k, v in run['orientations'].items()}

    su = round(space_utilization(placements, container) * 100.0, 4)
    csr = round(evaluate_constraints(placements, items, orientations)[0], 4)
    mism = [(name, got, want) for name, got, want in
            (("SU %", su, run['su_pct']), ("CSR %", csr, run['csr_pct']), ("placed", len(placements), run['placed']))
            if abs(got - want) > 1e-6]
    if mism:
        raise ValueError("stored arrangement does not reproduce the study's metrics: " +
                         "; ".join(f"{n} recomputed {g} vs stored {w}" for n, g, w in mism))

    entries = []
    for i, p in placements.items():
        e = wtpack_entry(items[i], i, p)
        e.update({"id": items[i].get('id', f"Box-{i+1:03d}"), "item_idx": i, "bin_id": 0})
        entries.append(e)
    entries.sort(key=lambda p: (p["bin_id"], p["z"], p["y"], p["x"]))
    pv = annotate(entries, placements, orientations, items)
    gaps = gap_view(entries, placements, container, items)
    render_container = render_container_of(container)

    from lateral_centering import center_arrangement
    centered_res = center_arrangement(placements, container, items, orientations)
    centered_entries = []
    for i, p in centered_res['placements'].items():
        e = wtpack_entry(items[i], i, p)
        e.update({"id": items[i].get('id', f"Box-{i+1:03d}"), "item_idx": i, "bin_id": 0})
        centered_entries.append(e)
    centered_entries.sort(key=lambda p: (p["bin_id"], p["z"], p["y"], p["x"]))
    # The Center Load toggle swaps in the centered boxes; its gaps travel with them.
    annotate(centered_entries, centered_res['placements'], orientations, items)
    centered_gaps = gap_view(centered_entries, centered_res['placements'], container, items)

    out = {
        "status": "ok", "source": "study", "study": doc.get('name'), "run_index": run_index,
        "strategy": run['configuration'], "instance": run['instance_id'], "seed": run['seed'],
        "preset": doc.get('preset'), "dataset": "wtpack",
        "n_items": len(items), "placed": len(placements), "unplaced": len(items) - len(placements),
        "bins_used": 1, "container": render_container,
        "budget_exhausted": bool(run.get('budget_exhausted', False)),
        "metrics": {"M1_space_utilization_pct": su, "M2_constraint_satisfaction_pct": csr,
                    "M3_execution_time_ms": run.get('exec_time_ms'), "M4_peak_memory_mb": run.get('peak_mem_mb')},
        "verified": {"su_pct": su, "csr_pct": csr, "stored_su_pct": run['su_pct'], "stored_csr_pct": run['csr_pct']},
        "problem_view": pv,
        "gaps": gaps,
        "edge": edge_indicators(placements, container, items),
        "uncentered_gaps": gaps,
        "centered_gaps": centered_gaps,
        "centered_edge": edge_indicators(centered_res['placements'], container, items),
        "edge_fill": run.get('edge_fill_stats'),
        "fragile_lift": run.get('fragile_lift_stats'),
        "items": entries,
        "lateral_balance": {
            "before": centered_res['m7_before'],
            "after": centered_res['m7_after'],
            "improved": centered_res['improved'],
            "shifts": centered_res['shifts'],
        },
        "centered_items": centered_entries,
    }
    if custom_doc is not None:
        out["dataset"] = "custom"
        out["instance"] = run['custom_load']
        out["custom_load"] = {"id": run['custom_load'], "label": custom_doc.get('label'),
                              "name": custom_doc.get('name'), "source": custom_doc.get('source'),
                              "total_mass_kg": round(sum(b['mass'] for b in items), 4),
                              "packed_mass_kg": round(sum(items[i]['mass'] for i in placements), 4),
                              "max_weight_kg": custom_doc.get('max_weight_kg'),
                              "weight_check_note": "not part of the optimization"}
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description="Viewer payload for one stored study run (JSON on stdout).")
    ap.add_argument('--study', required=True)
    ap.add_argument('--run', type=int, required=True)
    a = ap.parse_args()
    try:
        print(json.dumps(study_run_view(a.study, a.run)))
    except Exception as exc:
        print(json.dumps({"status": "error", "error": str(exc)}))
        sys.exit(1)
