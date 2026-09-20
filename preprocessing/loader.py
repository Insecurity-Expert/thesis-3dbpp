from pathlib import Path
from typing import List, Dict, Any


def _allowed_orientations(l_flag: int, w_flag: int, h_flag: int) -> List[int]:
    """
    Return the list of allowed orientation indices (1-6) for a box,
    based on the 0/1 flags from the OR-Library wtpack format.

    Encoding:
        1: H vertical, L along x, W along y  (requires H_flag)
        2: H vertical, W along x, L along y  (requires H_flag)
        3: W vertical, L along x, H along y  (requires W_flag)
        4: W vertical, H along x, L along y  (requires W_flag)
        5: L vertical, W along x, H along y  (requires L_flag)
        6: L vertical, H along x, W along y  (requires L_flag)
    """
    allowed = []
    if h_flag == 1:
        allowed.extend([1, 2])
    if w_flag == 1:
        allowed.extend([3, 4])
    if l_flag == 1:
        allowed.extend([5, 6])
    return allowed


def parse_wtpack(file_path: str) -> List[Dict[str, Any]]:
    """
    Parse an OR-Library wtpack file (100 instances per file).

    Format:
      Line 1: container L W H (cm)
      Line 2: n_types total_volume_m3
      Lines 3+: box type data (11 values per line)

    Box type line format:
      L L_flag W W_flag H H_flag qty mass LBS_L LBS_W LBS_H
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Data file not found: {file_path}")

    with open(path, 'r') as f:
        lines = [line.strip() for line in f if line.strip()]

    instances = []
    idx = 0

    while idx < len(lines):
        # Container dimensions
        dims = list(map(float, lines[idx].split()))
        if len(dims) != 3:
            raise ValueError(f"Malformed container line at index {idx}: {lines[idx]}")
        container = {'L': dims[0], 'W': dims[1], 'H': dims[2]}
        idx += 1

        # Header: n_types, total_volume_m3
        header = lines[idx].split()
        n_types = int(header[0])
        total_volume_m3 = float(header[1])
        idx += 1

        # Box types
        boxes = []
        for type_id in range(n_types):
            vals = lines[idx].split()
            idx += 1
            if len(vals) != 11:
                raise ValueError(
                    f"Expected 11 fields, got {len(vals)} at line {idx}: {lines[idx-1]}"
                )
            L = float(vals[0]); L_flag = int(vals[1])
            W = float(vals[2]); W_flag = int(vals[3])
            H = float(vals[4]); H_flag = int(vals[5])
            qty = int(vals[6])
            mass = float(vals[7])
            lbs_l = float(vals[8])
            lbs_w = float(vals[9])
            lbs_h = float(vals[10])

            for _ in range(qty):
                boxes.append({
                    'id': len(boxes),
                    'type_id': type_id,
                    'l': L, 'w': W, 'h': H,
                    'l_flag': L_flag, 'w_flag': W_flag, 'h_flag': H_flag,
                    'mass': mass,
                    'lbs_l': lbs_l, 'lbs_w': lbs_w, 'lbs_h': lbs_h,
                    'allowed_orientations': _allowed_orientations(L_flag, W_flag, H_flag),
                })

        # Append instance AFTER all box types are parsed
        instances.append({
            'container': container,
            'n_types': n_types,
            'total_volume_m3': total_volume_m3,
            'boxes': boxes,
        })

    return instances


def load_instance(config: Dict[str, Any], instance_id: int) -> Dict[str, Any]:
    """
    Load a specific instance by ID, using a round-robin mapping across
    the 7 wtpack files.
    """
    raw_dir = Path(config['data']['raw_dir'])
    file_idx = (instance_id % 7) + 1
    file_path = raw_dir / f"wtpack{file_idx}.txt"

    instances = parse_wtpack(str(file_path))
    return instances[instance_id // 7]