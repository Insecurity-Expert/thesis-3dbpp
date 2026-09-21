"""
Stratified instance sampling with validation and discard-and-replace
(Chapter 3, Step A4).

Instance addressing
-------------------
pipeline.load_augmented_instance addresses the 700 OR-Library instances by a
single id in 0..699, round-robin over the seven wtpack files:

    file_idx = (instance_id % 7) + 1        # wtpack1 .. wtpack7
    index    =  instance_id // 7            # 0 .. 99 within that file

so ids 0, 7, 14, ... live in wtpack1; 1, 8, 15, ... in wtpack2; and so on.
wtpackK corresponds to Bischoff-Ratcliff class BRK (3, 5, 8, 10, 12, 15, 20
box types respectively). resolve_instance_id / make_instance_id convert
between the two views.

Validation gates (an instance failing any is discarded and the next one from
the SAME file is tried):
  * the LBS range checks in fragility._validate
  * the fragile-rate bounds fragility.FRAGILE_RATE_MIN / MAX
  * n_boxes <= max_boxes

Usage
-----
    python -m preprocessing.sampling --n 30 --out experiments/sample30.json
"""
import json
import argparse
from pathlib import Path
from typing import Dict, Any, List, Tuple

import numpy as np

from preprocessing.loader import parse_wtpack
from preprocessing.fragility import assign_fragility, FRAGILE_RATE_MIN, FRAGILE_RATE_MAX

N_FILES = 7
PER_FILE = 100
BR_TYPES = {1: 3, 2: 5, 3: 8, 4: 10, 5: 12, 6: 15, 7: 20}


def resolve_instance_id(instance_id: int) -> Dict[str, Any]:
    """instance_id (0..699) -> {'file_idx', 'index', 'br_class', 'file'}."""
    if not (0 <= instance_id < N_FILES * PER_FILE):
        raise ValueError(f"instance_id {instance_id} outside 0..{N_FILES * PER_FILE - 1}")
    file_idx = (instance_id % N_FILES) + 1
    return {
        'instance_id': instance_id,
        'file_idx': file_idx,
        'index': instance_id // N_FILES,
        'br_class': f"BR{file_idx}",
        'file': f"wtpack{file_idx}.txt",
    }


def make_instance_id(file_idx: int, index: int) -> int:
    """(wtpack file 1..7, index 0..99) -> the round-robin instance_id."""
    if not (1 <= file_idx <= N_FILES) or not (0 <= index < PER_FILE):
        raise ValueError(f"bad address file_idx={file_idx} index={index}")
    return index * N_FILES + (file_idx - 1)


def _validate_instance(inst: Dict[str, Any], max_boxes: int) -> Tuple[bool, str, Dict[str, Any]]:
    """Run every gate on a COPY of the boxes. Returns (ok, reason, report)."""
    n = len(inst['boxes'])
    if n > max_boxes:
        return False, f"n_boxes {n} > max_boxes {max_boxes}", {}
    boxes = [dict(b) for b in inst['boxes']]
    try:
        rep = assign_fragility(boxes)
    except ValueError as e:
        msg = str(e)
        return False, ("fragile_rate" if "Fragile proportion" in msg else "lbs_range") + ": " + msg, {}
    return True, "", rep


def _quotas(n_total: int, rng: np.random.Generator) -> List[int]:
    """Spread n_total over the seven files as evenly as possible; the remainder
    goes to a seeded random subset of files so no class is favoured by index."""
    base, rem = divmod(n_total, N_FILES)
    q = [base] * N_FILES
    for f in rng.permutation(N_FILES)[:rem]:
        q[int(f)] += 1
    return q


def sample_instances(config: Dict[str, Any], n_total: int = 30,
                     max_boxes: int = 200, seed: int = 42):
    """Stratified draw across BR classes with discard-and-replace.

    Returns (selected, provenance) where selected is a list of
    (br_class, instance_id) and provenance records every decision made.
    """
    raw_dir = Path(config['data']['raw_dir'])
    rng = np.random.default_rng(seed)
    quotas = _quotas(n_total, rng)

    selected: List[Tuple[str, int]] = []
    chosen, rejected = [], []
    per_file = {}

    for file_idx in range(1, N_FILES + 1):
        instances = parse_wtpack(str(raw_dir / f"wtpack{file_idx}.txt"))
        order = rng.permutation(len(instances))
        want = quotas[file_idx - 1]
        got = 0
        tried = 0
        for index in order:
            if got >= want:
                break
            index = int(index)
            tried += 1
            inst = instances[index]
            iid = make_instance_id(file_idx, index)
            ok, reason, rep = _validate_instance(inst, max_boxes)
            if not ok:
                rejected.append({'instance_id': iid, 'br_class': f"BR{file_idx}",
                                 'index': index, 'n_boxes': len(inst['boxes']),
                                 'reason': reason})
                continue
            got += 1
            selected.append((f"BR{file_idx}", iid))
            chosen.append({
                'instance_id': iid,
                'br_class': f"BR{file_idx}",
                'file': f"wtpack{file_idx}.txt",
                'index': index,
                'n_types': inst['n_types'],
                'n_boxes': len(inst['boxes']),
                'fragile_rate': round(rep['fragile_rate'], 4),
                'fragile_count': rep['fragile_count'],
                'lbs_min': rep['lbs_min'],
                'lbs_max': rep['lbs_max'],
                'lbs_ratio': round(rep['lbs_ratio'], 4),
                'container': inst['container'],
            })
        per_file[f"BR{file_idx}"] = {'quota': want, 'selected': got, 'tried': tried,
                                     'rejected': tried - got}
        if got < want:
            raise RuntimeError(
                f"wtpack{file_idx}: only {got} of {want} instances pass validation "
                f"(max_boxes={max_boxes}, fragile bounds "
                f"[{FRAGILE_RATE_MIN}, {FRAGILE_RATE_MAX}])")

    provenance = {
        'seed': seed,
        'n_total': n_total,
        'max_boxes': max_boxes,
        'fragile_rate_bounds': [FRAGILE_RATE_MIN, FRAGILE_RATE_MAX],
        'quotas': {f"BR{i + 1}": q for i, q in enumerate(quotas)},
        'per_file': per_file,
        'selected': chosen,
        'rejected': rejected,
        'addressing': "instance_id = index * 7 + (file_idx - 1); wtpackK = BRK",
    }
    return selected, provenance


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--n', type=int, default=30)
    p.add_argument('--max-boxes', type=int, default=200)
    p.add_argument('--seed', type=int, default=42)
    p.add_argument('--raw-dir', default=str(Path(__file__).resolve().parent.parent / 'data' / 'raw'))
    p.add_argument('--out', help='write provenance JSON here')
    args = p.parse_args()
    selected, prov = sample_instances({'data': {'raw_dir': args.raw_dir}},
                                      n_total=args.n, max_boxes=args.max_boxes, seed=args.seed)
    if args.out:
        Path(args.out).write_text(json.dumps(prov, indent=2))
        print(f"wrote {args.out}: {len(selected)} instances, {len(prov['rejected'])} rejected")
    else:
        print(json.dumps(prov, indent=2))


if __name__ == '__main__':
    main()
