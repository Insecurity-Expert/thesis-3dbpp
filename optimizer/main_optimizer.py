"""
main_optimizer.py
Command-line entry point.

Normal mode (no --stream):
    python main_optimizer.py <path.json>
    → prints one JSON result blob to stdout when done.

Streaming mode (--stream):
    python main_optimizer.py <path.json> --stream
    → prints one JSON line per event to stdout throughout the run.
      Node.js reads these line-by-line and forwards them via WebSocket.

All progress/debug text goes to stderr (never pollutes stdout JSON).
"""

import sys
import json
import math
import time
import argparse
import tracemalloc
from pathlib import Path

# Repo root on the path so `preprocessing` resolves when run from optimizer/
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
DEFAULT_RAW_DIR = REPO_ROOT / "data" / "raw"

from instance_reader import load_instance
from hd_gwo import HDGWO
from thesis_algorithms import StandaloneDGWO, StandaloneMOGWO, SequentialHybrid, RepairBasedHybrid
from thesis_metrics import (evaluate_constraints,
                            space_utilization as thesis_space_utilization)
from webapp_metrics import (assign_weights, compute_weight_capacity,
                            space_utilization, constraint_satisfaction)


def lower_bound(items, container):
    """Canonical convention: container {L,W,H}, boxes {l,w,h}."""
    cap   = container['L'] * container['W'] * container['H']
    total = sum(i['l'] * i['w'] * i['h'] for i in items)
    return math.ceil(total / cap) if cap > 0 else 1


def legacy_lower_bound(items, container):
    """BR JSON schema: container {L,H,D}, boxes {L,H,D}."""
    cap   = container['L'] * container['H'] * container['D']
    total = sum(i['L'] * i['H'] * i['D'] for i in items)
    return math.ceil(total / cap) if cap > 0 else 1


def main():
    # ── Arguments ─────────────────────────────────────────────────────────────
    parser = argparse.ArgumentParser(description="3-D Bin Packing — HD-GWO Optimizer")
    parser.add_argument("instance_path",
                        help="BR dataset JSON path, or wtpack instance id when --dataset wtpack")
    parser.add_argument("--dataset", choices=["br", "wtpack"], default="br",
                        help="Data source: br = BR JSON (legacy), wtpack = OR-Library wtpack")
    parser.add_argument("--raw-dir", default=str(DEFAULT_RAW_DIR),
                        help="Directory holding wtpack*.txt (used with --dataset wtpack)")
    parser.add_argument("--stream", action="store_true",
                        help="Emit JSON progress lines to stdout (for batch/WebSocket mode)")
    parser.add_argument("--max-time", type=int, default=90,
                    help="Wall-clock time limit in seconds (default 90)")
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
    parser.add_argument("--strategy", choices=["HDGWO", "DGWO", "MOGWO", "SEQ", "REP"],
                    default="HDGWO", help="Optimization strategy to run")
    args = parser.parse_args()

    streaming = args.stream
    thesis_strategy = args.strategy != "HDGWO"

    # ── Load instance ──────────────────────────────────────────────────────────
    # The dataset decides the schema; the strategy never does. Synthesising
    # physics to satisfy a strategy is exactly what Step 3 removed.
    if thesis_strategy and args.dataset == "br":
        print(json.dumps({"type": "error", "error": (
            f"Strategy {args.strategy} requires real physics "
            f"(mass, lbs_l, lbs_w, lbs_h, allowed_orientations) which the BR "
            f"JSON dataset does not carry. Re-run with --dataset wtpack."
        )}), flush=True)
        sys.exit(1)

    try:
        if args.dataset == "wtpack":
            from preprocessing.pipeline import load_augmented_instance
            inst = load_augmented_instance({'data': {'raw_dir': args.raw_dir}},
                                           instance_id=int(args.instance_path))
            container, items = inst['container'], inst['boxes']
        else:
            container, items = load_instance(args.instance_path)
    except Exception as e:
        print(json.dumps({"type": "error", "error": f"Failed to load: {e}"}), flush=True)
        sys.exit(1)

    n  = len(items)

    if args.dataset == "wtpack":
        lb = lower_bound(items, container)
        weight_cap = None
    else:
        lb = legacy_lower_bound(items, container)
        # BR data carries no weights; the legacy engine needs deterministic ones.
        assign_weights(items, seed=42)
        weight_cap = compute_weight_capacity(items, container)

    print(f"Instance  : {args.instance_path} ({args.dataset})", file=sys.stderr, flush=True)
    print(f"Container : {container}", file=sys.stderr, flush=True)
    print(f"Items     : {n}  (lower bound: {lb} bin(s))",
          file=sys.stderr, flush=True)

    # ── Parameters actually used ───────────────────────────────────────────────
    # The legacy HD-GWO path auto-scales to instance size; the thesis strategies
    # take exactly what the CLI (and therefore the UI) passed. Print the values
    # that will reach the constructor of the strategy being run, nothing else.
    lam = lambda v: args.lam if v is None else v
    if thesis_strategy:
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
    else:
        pop_size    = min(20, max(5,  n // 8))
        max_iter    = min(50, max(20, n // 4))
        max_process = min(15, max(5,  n // 10))
        params = {
            "strategy": args.strategy, "dataset": args.dataset,
            "instance_id": args.instance_path,
            "pop_size": pop_size, "max_iter": max_iter, "max_process": max_process,
            "max_time": args.max_time, "seed": None,
        }
        print(f"Params    : pop={pop_size} iter={max_iter} proc={max_process} (HD-GWO auto-scaled)",
              file=sys.stderr, flush=True)

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
    # (H = height, D = depth). Physics is {L, W, H}; the legacy schema is
    # already {L, H, D}.
    if args.dataset == "wtpack":
        render_container = {"L": container['L'], "H": container['H'], "D": container['W']}
    else:
        render_container = container

    # If streaming, emit instance metadata first so React knows the container dims
    if streaming:
        emit("instance_info", {
            "container":   render_container,
            "n_items":     n,
            "lower_bound": lb,
        })

    # ── Run optimizer ──────────────────────────────────────────────────────────
    tracemalloc.start()
    _start_time = time.perf_counter()
    if args.strategy == "HDGWO":
        optimizer = HDGWO(
            items=items,
            container=container,
            pop_size=pop_size,
            max_iter=max_iter,
            T0=500.0,
            delta_T=25.0,
            freeze=10.0,
            max_process=max_process,
            max_time=args.max_time,
            stream_cb=emit if streaming else None,
        )
    else:
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

    best = optimizer.run()
    exec_time_ms = (time.perf_counter() - _start_time) * 1000.0   # M-3
    _, peak_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    peak_mem_mb = peak_bytes / (1024 * 1024)                      # M-4

    # ── Build final result ─────────────────────────────────────────────────────
    packed_items = []
    for item_idx, placement in best.placements.items():
        box = items[item_idx]
        if args.dataset == "wtpack":
            # Single container: no bin id in the tuple
            x, y, z, d1, d2, d3 = placement
            bin_id = 0
        else:
            bin_id, x, y, z, d1, d2, d3 = placement
        if args.dataset == "wtpack":
            # RENDER BOUNDARY — the only place the y-up convention exists.
            # physics (x=length, y=depth, z=height) -> render (x, y=height, z=depth)
            entry = {
                "x": x, "y": z, "z": y,
                "dx": d1, "dy": d3, "dz": d2,
                "length": d1, "height": d3, "width": d2,
                "orig_L": box['l'], "orig_H": box['h'], "orig_D": box['w'],
                "stop": box['stop'], "mass": box['mass'],
                "fragile": int(box['fragile']),
                "type": "Fragile" if box['fragile'] else "Standard",
            }
        else:
            # Legacy engine is already y-up; no conversion required.
            entry = {
                "x": x, "y": y, "z": z,
                "dx": d1, "dy": d2, "dz": d3,
                "length": d1, "height": d2, "width": d3,
                "orig_L": box['L'], "orig_H": box['H'], "orig_D": box['D'],
                "stop": box.get('stop', 1), "mass": box.get('weight', 0),
            }
        entry.update({
            "id":       box.get('id', f"Box-{item_idx+1:03d}"),
            "item_idx": item_idx,
            "bin_id":   bin_id,
        })
        entry.setdefault("type", box.get('type', 'Standard'))
        packed_items.append(entry)
    packed_items.sort(key=lambda p: (p["bin_id"], p["z"], p["y"], p["x"]))

    if args.dataset == "wtpack":
        cap_vol = container['L'] * container['W'] * container['H']
    else:
        cap_vol = container['L'] * container['H'] * container['D']
    items_vol    = sum(p['dx'] * p['dy'] * p['dz'] for p in packed_items)
    n_containers = 1 if args.dataset == "wtpack" else best.n_bins
    vol_util_pct = round(items_vol / (n_containers * cap_vol) * 100, 2) if cap_vol > 0 else 0.0

    # ── Thesis metrics (M-1 .. M-5) ────────────────────────────────────────────
    if args.dataset == "wtpack":
        su_pct = thesis_space_utilization(best.placements, container) * 100.0         # M-1
        csr_pct, csr_detail = evaluate_constraints(best.placements, items, best.orientations)
    else:
        su_pct = space_utilization(best.placements, container, best.n_bins)          # M-1
        csr_pct, csr_detail = constraint_satisfaction(
            best.placements, items, container, weight_cap)


    metrics = {
        "M1_space_utilization_pct":      round(su_pct, 2),
        "M2_constraint_satisfaction_pct": round(csr_pct, 2),
        "M3_execution_time_ms":          round(exec_time_ms, 1),
        "M4_peak_memory_mb":             round(peak_mem_mb, 2),
        "M5_robustness_su_std":          None,   # needs >1 run; see batch runner
        "weight_capacity":               weight_cap,
        "constraint_detail":             csr_detail,
    }

    # A silent spill to overflow would confound the cross-config comparison.
    budget_exhausted = getattr(best, 'budget_exhausted', False)

    result = {
        "status":          "ok",
        "instance":        args.instance_path,
        "bins_used":       n_containers,
        "placed":          len(best.placements),
        "unplaced":        n - len(best.placements),
        "lower_bound":     lb,
        "gap_pct":         round((n_containers - lb) / max(lb, 1) * 100, 2),
        "dissipation":     round(getattr(best, 'dissipation', 0.0), 6),
        "composite_score": round(getattr(best, 'composite', getattr(best, 'scalar_fitness', 0.0)), 6),
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
    }

    if streaming:
        # Emit as a typed message so Node.js/React can handle it
        emit("instance_complete", result)
    else:
        # Normal mode: single JSON blob to stdout
        print(json.dumps(json_safe(result), allow_nan=False))


if __name__ == "__main__":
    main()