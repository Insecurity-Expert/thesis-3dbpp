"""
Preprocessing pipeline - Step 4 of Chapter 3.

Wraps loader + fragility + stop_assignment into one call that returns
a fully-augmented instance ready for the algorithms.
"""

from typing import Dict, Any, Optional, List
from pathlib import Path

from preprocessing.loader import parse_wtpack
from preprocessing.fragility import assign_fragility
from preprocessing.stop_assignment import assign_stops


def load_augmented_instance(
    config: Dict[str, Any],
    instance_id: int,
    fragility_seed: int = 42,
    stop_seed: int = 42,
    stop_count: int = 3,
) -> Dict[str, Any]:
    """
    Load one wtpack instance, apply fragility and stop augmentation,
    and return the fully-augmented instance.

    Parameters
    ----------
    config : project config dict (must have config['data']['raw_dir'])
    instance_id : 0-699, round-robin over the seven files (see
                  preprocessing.sampling.resolve_instance_id)
    fragility_seed : unused for now (fragility is deterministic)
    stop_seed : seed passed to assign_stops
    stop_count : number of delivery stops (default 3)

    Returns
    -------
    dict with keys: container, boxes, n_types, total_volume_m3,
                    augmentation (report dict)
    """
    raw_dir = Path(config['data']['raw_dir'])
    file_idx = (instance_id % 7) + 1
    file_path = raw_dir / f"wtpack{file_idx}.txt"

    instances = parse_wtpack(str(file_path))
    inst = instances[instance_id // 7]

    frag_report = assign_fragility(inst['boxes'])
    stop_report = assign_stops(inst['boxes'], num_stops=stop_count, seed=stop_seed)

    return {
        'container':       inst['container'],
        'boxes':           inst['boxes'],
        'n_types':         inst['n_types'],
        'total_volume_m3': inst['total_volume_m3'],
        'augmentation': {
            'fragility': frag_report,
            'stops':     stop_report,
        },
    }