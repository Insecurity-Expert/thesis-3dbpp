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
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

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
    parser.add_argument("--raw-dir", default="data/raw/",
                        help="Directory holding wtpack*.txt (used with --dataset wtpack)")
    parser.add_argument("--stream", action="store_true",
                        help="Emit JSON progress lines to stdout (for batch/WebSocket mode)")
    parser.add_argument("--max-time", type=int, default=90,
                    help="Wall-clock time limit in seconds (default 90)")
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

    # ── Scale parameters to instance size ─────────────────────────────────────
    pop_size    = min(20, max(5,  n // 8))
    max_iter    = min(50, max(20, n // 4))
    max_process = min(15, max(5,  n // 10))

    print(f"Params    : pop={pop_size} iter={max_iter} proc={max_process}",
          file=sys.stderr, flush=True)

    # ── Streaming callback ─────────────────────────────────────────────────────
    def emit(event_type, data):
        """Print one JSON line to stdout and flush immediately."""
        msg = {"type": event_type, **data}
        print(json.dumps(msg), flush=True)

    # If streaming, emit instance metadata first so React knows the container dims
    if streaming:
        emit("instance_info", {
            "container":   container,
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
        # Override to 30 pop and 500 iter for thesis architectures as per standard
        opt_class = {
            "DGWO": StandaloneDGWO,
            "MOGWO": StandaloneMOGWO,
            "SEQ": SequentialHybrid,
            "REP": RepairBasedHybrid
        }[args.strategy]
        optimizer = opt_class(
            items=items,
            container=container,
            pop_size=30,
            max_iter=500,
            lambda_penalty=0.10,
            seed=args.seed,
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
            "type":     box.get('type', 'Standard'),
        })
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
        "container":        container,
        "n_items":          n,
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
        print(json.dumps(result))


if __name__ == "__main__":
    main()