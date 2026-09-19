import math
import numpy as np
from geometry_3d import get_dims

def sigmoid(x):
    """Sigmoid transfer function: sigma(x) = 1 / (1 + e^-x)"""
    x = np.clip(x, -500, 500)
    return 1.0 / (1.0 + np.exp(-x))

def decode_position(continuous_vector, items, container=None):
    """
    Decode a 2n random-key genome into a placement sequence and orientations.

    Genome layout: [k_1..k_n, r_1..r_n]
      k_i : random keys. Sorting them ascending gives the placement order, so
            the search controls the sequence DBLF consumes.
      r_i : orientation genes. Sigmoid, then index into that box's
            allowed_orientations, so an unrealisable code cannot be produced.

    `container` is accepted but unused: coordinates are decided by DBLF, not by
    the genome. Kept so call sites read the same as the rest of the pipeline.

    Returns:
        (sequence, orientations)
    """
    n = len(items)
    if len(continuous_vector) != 2 * n:
        raise ValueError(f"expected 2n = {2*n}, got {len(continuous_vector)}")

    keys = continuous_vector[:n]
    r_cont = continuous_vector[n:]

    sequence = [int(i) for i in np.argsort(keys, kind='stable')]

    orientations = {}
    for i in range(n):
        allowed = items[i]['allowed_orientations']
        idx = int(math.floor(len(allowed) * sigmoid(r_cont[i])))
        orientations[i] = allowed[min(idx, len(allowed) - 1)]

    return sequence, orientations
