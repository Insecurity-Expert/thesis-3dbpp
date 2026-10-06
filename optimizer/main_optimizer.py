"""
main_optimizer.py
Command-line entry point.

Normal mode (no --stream):
    python main_optimizer.py <wtpack id> --strategy DGWO
    → prints one JSON result blob to stdout when done.

Streaming mode (--stream):
    python main_optimizer.py <wtpack id> --strategy DGWO --stream
    → prints one JSON line per event to stdout throughout the run.
      Node.js reads these line-by-line and forwards them via WebSocket.

All progress/debug text goes to stderr (never pollutes stdout JSON).
"""

import sys
import json
import math
import time
import argparse
from pathlib import Path

import psutil

# Repo root on the path so `preprocessing` resolves when run from optimizer/
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw"

from thesis_algorithms import StandaloneDGWO, StandaloneMOGWO, SequentialHybrid, RepairBasedHybrid
from thesis_metrics import (evaluate_constraints,
                            space_utilization as thesis_space_utilization)
from arrangement_view import wtpack_entry, annotate


# M-3 / M-4 as in experiments/study.py (Chapter 3): numba warmed untimed, M-3 =
# wall-clock (time.perf_counter) of opt.run(), M-4 = the process's peak working
# set (psutil; ru_maxrss on POSIX). Runs saved before this carry no
# metrics.timing_method and were timed under tracemalloc (~2.7x slower).
TIMING_METHOD = ("numba warmed untimed; M-3 = time.perf_counter wall-clock of opt.run(); "
                 "M-4 = process peak working set (psutil)")


def _peak_mb():
    mi = psutil.Process().memory_info()
    peak = getattr(mi, 'peak_wset', None)          # Windows
    if peak is None:                                # POSIX: ru_maxrss
        try:
            import resource
            ru = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            peak = ru * (1 if sys.platform == 'darwin' else 1024)
        except Exception:
            peak = mi.rss
    return peak / (1024 * 1024)


def lower_bound(items, container):
    """Canonical convention: container {L,W,H}, boxes {l,w,h}."""
    cap   = container['L'] * container['W'] * container['H']
    total = sum(i['l'] * i['w'] * i['h'] for i in items)
    return math.ceil(total / cap) if cap > 0 else 1


def main():
    # ── Arguments ─────────────────────────────────────────────────────────────
    parser = argparse.ArgumentParser(description="STACKR — constrained single-container loading (GWO configurations)")
    parser.add_argument("instance_path",
                        help="wtpack instance id (0..699), or a stored custom load id with --dataset custom")
    parser.add_argument("--dataset", choices=["wtpack", "custom"], default="wtpack",
                        help="Data source: wtpack = OR-Library wtpack, "
                             "custom = a stored custom load id (preprocessing/custom_load.py)")
    parser.add_argument("--raw-dir", default=str(DEFAULT_RAW_DIR),
                        help="Directory holding wtpack*.txt (used with --dataset wtpack)")
    parser.add_argument("--stream", action="store_true",
                        help="Emit JSON progress lines to stdout (for batch/WebSocket mode)")
    parser.add_argument("--pop-size", type=int, default=10,
                    help="Wolf pack size for the thesis strategies (default 10)")
    parser.add_argument("--max-iter", type=int, default=60,
                    help="Iterations for the thesis strategies (default 60)")
    parser.add_argument("--lambda", type=float, default=0.20, dest="lam",
                    help="PEN-1 penalty weight tying all four constraints (default 0.20)")
    parser.add_argument("--lambda-w", type=float, default=None, help="override C3 weight")
    parser.add_argument("--lambda-f", type=float, default=None, help="override C4 weight")
    parser.add_argument("--lambda-b", type=float, default=None, help="override C5 weight")
    parser.add_argument("--lambda-a", type=float, default=None, help="override C6 weight")
    parser.add_argument("--enforce-support", action=argparse.BooleanOptionalAction, default=True,
                    help="Reject placements failing C5 at decode time (default on)")
    parser.add_argument("--enforce-fragility", action=argparse.BooleanOptionalAction, default=True,
                    help="Reject placements above a fragile box at decode time (default on)")
    parser.add_argument("--seed", type=int, default=None,
                    help="RNG seed for the thesis strategies (omit = entropy-seeded)")
    parser.add_argument("--strategy", choices=["DGWO", "MOGWO", "SEQ", "REP"],
                    default="DGWO", help="Optimization strategy to run")
    args = parser.parse_args()

    streaming = args.stream
    custom_doc = None

    # ── Load instance ──────────────────────────────────────────────────────────
    try:
        if args.dataset == "wtpack":
            from preprocessing.pipeline import load_augmented_instance
            inst = load_augmented_instance({'data': {'raw_dir': args.raw_dir}},
                                           instance_id=int(args.instance_path))
            container, items = inst['container'], inst['boxes']
        else:
            # A custom load carries the same physics schema as wtpack (custom_load.py
            # converts to loader.py's format and applies the same pipeline steps).
            # Stored stops and fragile flags: nothing is re-drawn per run.
            from preprocessing.custom_load import load_stored
            inst = load_stored(args.instance_path)
            container, items, custom_doc = inst['container'], inst['boxes'], inst['doc']
    except Exception as e:
        print(json.dumps({"type": "error", "error": f"Failed to load: {e}"}), flush=True)
        sys.exit(1)

    n  = len(items)
    lb = lower_bound(items, container)

    print(f"Instance  : {args.instance_path} ({args.dataset})", file=sys.stderr, flush=True)
    print(f"Container : {container}", file=sys.stderr, flush=True)
    # Single-container formulation: no bins to lower-bound.
    print(f"Items     : {n}  (single container)", file=sys.stderr, flush=True)

    # ── Parameters actually used ───────────────────────────────────────────────
    # The strategies take exactly what the CLI (and therefore the UI) passed.
    # Print the values that will reach the constructor, nothing else.
    lam = lambda v: args.lam if v is None else v
    params = {
        "strategy":          args.strategy,
        "dataset":           args.dataset,
        "instance_id":       int(args.instance_path) if args.dataset == "wtpack" else args.instance_path,
        "pop_size":          args.pop_size,
        "max_iter":          args.max_iter,
        "lambda_w":          lam(args.lambda_w),
        "lambda_f":          lam(args.lambda_f),
        "lambda_b":          lam(args.lambda_b),
        "lambda_a":          lam(args.lambda_a),
        "enforce_support":   bool(args.enforce_support),
        "enforce_fragility": bool(args.enforce_fragility),
        "seed":              args.seed,
    }
    print(f"Params    : pop={params['pop_size']} iter={params['max_iter']} "
          f"lambda=(w={params['lambda_w']}, f={params['lambda_f']}, b={params['lambda_b']}, a={params['lambda_a']}) "
          f"enforce_support={params['enforce_support']} enforce_fragility={params['enforce_fragility']} "
          f"seed={params['seed']}", file=sys.stderr, flush=True)

    # ── Streaming callback ─────────────────────────────────────────────────────
    def json_safe(obj):
        """NaN/Infinity are not JSON. The Node side cannot parse such a line, so
        a stray inf (e.g. an archive wolf's unset scalar_fitness) would make
        the whole run vanish from the UI. Replace with null."""
        if isinstance(obj, float):
            return obj if math.isfinite(obj) else None
        if isinstance(obj, dict):
            return {k: json_safe(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [json_safe(v) for v in obj]
        return obj

    def emit(event_type, data):
        """Print one JSON line to stdout and flush immediately."""
        msg = json_safe({"type": event_type, **data})
        print(json.dumps(msg, allow_nan=False), flush=True)

    # RENDER BOUNDARY for the container: the viewer reads {L, H, D} in y-up
    # (H = height, D = depth). Physics is {L, W, H}: physics x (across the
    # truck) -> render x; physics y (depth from the rear door) -> render z;
    # physics z (height) -> render y. The raw file dimensions (length x width
    # x height) ride along for display.
    render_container = {"L": container['L'], "H": container['H'], "D": container['W'],
                        "length_cm": container.get('length_cm'), "width_cm": container.get('width_cm'),
                        "height_cm": container.get('height_cm'), "door": container.get('door', 'rear')}

    # If streaming, emit instance metadata first so React knows the container dims
    if streaming:
        emit("instance_info", {
            "container":   render_container,
            "n_items":     n,
            "lower_bound": lb,
        })

    # ── Run optimizer ──────────────────────────────────────────────────────────
    # Warm every compiled kernel (decode + evaluate + repair) untimed, exactly as
    # experiments/study.py does, so M-3 never includes numba cache loading.
    RepairBasedHybrid(items=items, container=container, pop_size=3, max_iter=1,
                      enforce_support=params["enforce_support"],
                      enforce_fragility=params["enforce_fragility"], seed=0).run()
    opt_class = {
        "DGWO": StandaloneDGWO,
        "MOGWO": StandaloneMOGWO,
        "SEQ": SequentialHybrid,
        "REP": RepairBasedHybrid
    }[args.strategy]
    # Every CLI flag binds to a constructor argument. `params` is the single
    # source of truth for what runs and is echoed in the result JSON.
    optimizer = opt_class(
        items=items,
        container=container,
        pop_size=params["pop_size"],
        max_iter=params["max_iter"],
        lambda_w=params["lambda_w"], lambda_f=params["lambda_f"],
        lambda_b=params["lambda_b"], lambda_a=params["lambda_a"],
        enforce_support=params["enforce_support"],
        enforce_fragility=params["enforce_fragility"],
        seed=params["seed"],
        stream_cb=emit if streaming else None,
    )

    _start_time = time.perf_counter()
    best = optimizer.run()
    exec_time_ms = (time.perf_counter() - _start_time) * 1000.0   # M-3
    peak_mem_mb = _peak_mb()                                      # M-4

    # ── Build final result ─────────────────────────────────────────────────────
    packed_items = []
    for item_idx, placement in best.placements.items():
        box = items[item_idx]
        # RENDER BOUNDARY — see arrangement_view.wtpack_entry
        entry = wtpack_entry(box, item_idx, placement)
        entry.update({
            "id":       box.get('id', f"Box-{item_idx+1:03d}"),
            "item_idx": item_idx,
            "bin_id":   0,          # single container
        })
        entry.setdefault("type", box.get('type', 'Standard'))
        packed_items.append(entry)
    packed_items.sort(key=lambda p: (p["bin_id"], p["z"], p["y"], p["x"]))

    # Per-box C3-C6 for the viewer's problem view (additive; after M-3 timing).
    problem_view = annotate(packed_items, best.placements, best.orientations, items)

    cap_vol      = container['L'] * container['W'] * container['H']
    items_vol    = sum(p['dx'] * p['dy'] * p['dz'] for p in packed_items)
    vol_util_pct = round(items_vol / cap_vol * 100, 2) if cap_vol > 0 else 0.0

    # ── Thesis metrics (M-1 .. M-4) ────────────────────────────────────────────
    su_pct = thesis_space_utilization(best.placements, container) * 100.0         # M-1
    csr_pct, csr_detail = evaluate_constraints(best.placements, items, best.orientations)

    metrics = {
        "M1_space_utilization_pct":      round(su_pct, 2),
        "M2_constraint_satisfaction_pct": round(csr_pct, 2),
        "M3_execution_time_ms":          round(exec_time_ms, 1),
        "M4_peak_memory_mb":             round(peak_mem_mb, 2),
        "timing_method":                 TIMING_METHOD,
        "M5_robustness_su_std":          None,   # needs >1 run; see experiments/study.py
        "weight_capacity":               None,
        "constraint_detail":             csr_detail,
    }

    # A silent spill to overflow would confound the cross-config comparison.
    budget_exhausted = getattr(best, 'budget_exhausted', False)

    result = {
        "status":          "ok",
        "instance":        args.instance_path,
        "bins_used":       1,
        "placed":          len(best.placements),
        "unplaced":        n - len(best.placements),
        "lower_bound":     lb,
        "gap_pct":         round((1 - lb) / max(lb, 1) * 100, 2),
        "dissipation":     0.0,
        "composite_score": round(getattr(best, 'scalar_fitness', None) or 0.0, 6),
        "volume_util_pct": vol_util_pct,
        "runtime_s":       round(exec_time_ms / 1000.0, 2),
        "container":        render_container,
        "n_items":          n,
        "params":           params,
        "dataset":          args.dataset,
        "seed":             args.seed,
        "budget_exhausted": budget_exhausted,
        "metrics":          metrics,
        "items":            packed_items,
        "problem_view":     problem_view,
    }
    if custom_doc is not None:
        # Post-run check only: the optimizer has no payload constraint.
        packed_mass = sum(items[i]['mass'] for i in best.placements)
        result["custom_load"] = {
            "id": args.instance_path,
            "label": custom_doc.get("label"),
            "name": custom_doc.get("name"),
            "source": custom_doc.get("source"),
            "mode": custom_doc.get("mode"),
            "stops": custom_doc.get("augmentation", {}).get("stops"),
            "fragility": custom_doc.get("augmentation", {}).get("fragility"),
            "total_mass_kg": round(sum(b['mass'] for b in items), 4),
            "packed_mass_kg": round(packed_mass, 4),
            "max_weight_kg": custom_doc.get("max_weight_kg"),
            "weight_check_note": "not part of the optimization",
        }

    if streaming:
        # Emit as a typed message so Node.js/React can handle it
        emit("instance_complete", result)
    else:
        # Normal mode: single JSON blob to stdout
        print(json.dumps(json_safe(result), allow_nan=False))

if __name__ == "__main__":
    main()