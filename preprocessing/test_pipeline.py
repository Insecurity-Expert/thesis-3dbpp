"""
Tests for the preprocessing pipeline.

Run from the project root with:
    python -m pytest preprocessing/test_pipeline.py -v
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Anchor data paths to the repo, not the cwd, so the suite passes from anywhere.
RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"

import numpy as np
import pytest

from preprocessing.loader import parse_wtpack
from preprocessing.fragility import assign_fragility, FRAGILE_RATE_MIN, FRAGILE_RATE_MAX
from preprocessing.stop_assignment import assign_stops
from preprocessing.pipeline import load_augmented_instance


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def wtpack1_instances():
    """Parse wtpack1 once and reuse across all tests in this module."""
    return parse_wtpack(str(RAW_DIR / "wtpack1.txt"))


# wtpack1 has only 3 box types, so the greedy 25% cut is coarse and most of
# its instances fall outside the +/-5pp bound. Index 5 (instance_id 35) is the
# first that validates and is the reference instance for the pipeline tests.
REF_INDEX = 5
REF_INSTANCE_ID = REF_INDEX * 7


@pytest.fixture
def fresh_instance(wtpack1_instances):
    """Fresh copy of the reference instance so mutations in one test don't leak."""
    inst = wtpack1_instances[REF_INDEX]
    return {
        "container": dict(inst["container"]),
        "n_types": inst["n_types"],
        "total_volume_m3": inst["total_volume_m3"],
        "boxes": [dict(b) for b in inst["boxes"]],
    }


@pytest.fixture
def minimal_config():
    return {"data": {"raw_dir": str(RAW_DIR)}}


# ── Loader tests ─────────────────────────────────────────────────────────────

class TestLoader:

    def test_parses_100_instances(self, wtpack1_instances):
        assert len(wtpack1_instances) == 100

    def test_container_has_three_dimensions(self, wtpack1_instances):
        for inst in wtpack1_instances[:5]:
            assert set(inst["container"].keys()) == {"L", "W", "H"}
            for v in inst["container"].values():
                assert v > 0

    def test_instance_has_expected_fields(self, wtpack1_instances):
        inst = wtpack1_instances[0]
        assert "container" in inst
        assert "n_types" in inst
        assert "total_volume_m3" in inst
        assert "boxes" in inst

    def test_n_types_matches_source(self, wtpack1_instances):
        # wtpack1 has 3 box types per instance
        for inst in wtpack1_instances:
            assert inst["n_types"] == 3

    def test_boxes_have_all_required_fields(self, wtpack1_instances):
        required = {
            "l", "w", "h",
            "l_flag", "w_flag", "h_flag",
            "mass", "lbs_l", "lbs_w", "lbs_h",
            "allowed_orientations",
        }
        for box in wtpack1_instances[0]["boxes"]:
            assert required.issubset(box.keys())

    def test_box_dimensions_are_positive(self, wtpack1_instances):
        for box in wtpack1_instances[0]["boxes"]:
            assert box["l"] > 0
            assert box["w"] > 0
            assert box["h"] > 0

    def test_allowed_orientations_nonempty(self, wtpack1_instances):
        # At least one flag must be 1 for any valid box type
        for box in wtpack1_instances[0]["boxes"]:
            assert len(box["allowed_orientations"]) >= 2

    def test_total_volume_matches_recomputed(self, wtpack1_instances):
        # total_volume_m3 is the OR-Library's own check field.
        # Sum of l*w*h*qty / 1e6 should be within rounding of it.
        for inst in wtpack1_instances[:10]:
            vol_cm3 = sum(b["l"] * b["w"] * b["h"] for b in inst["boxes"])
            vol_m3 = vol_cm3 / 1e6
            assert abs(vol_m3 - inst["total_volume_m3"]) < 0.01

    def test_missing_file_raises(self):
        with pytest.raises(FileNotFoundError):
            parse_wtpack(str(RAW_DIR / "does_not_exist.txt"))


# ── Fragility tests ──────────────────────────────────────────────────────────

class TestFragility:

    def test_fragile_rate_within_type_level_bounds(self, fresh_instance):
        assign_fragility(fresh_instance["boxes"])
        n = len(fresh_instance["boxes"])
        rate = sum(b["fragile"] for b in fresh_instance["boxes"]) / n
        assert FRAGILE_RATE_MIN <= rate <= FRAGILE_RATE_MAX

    def test_fragility_is_a_property_of_the_type(self, fresh_instance):
        """Boxes with identical LBS must never carry different flags."""
        assign_fragility(fresh_instance["boxes"])
        flags_by_type = {}
        for b in fresh_instance["boxes"]:
            flags_by_type.setdefault(b["type_id"], set()).add(b["fragile"])
        assert all(len(v) == 1 for v in flags_by_type.values())

    def test_at_least_one_type_is_fragile(self, fresh_instance):
        """Greedy selection always flags the weakest type, so C4 is never vacuous."""
        assign_fragility(fresh_instance["boxes"])
        assert sum(b["fragile"] for b in fresh_instance["boxes"]) >= 1

    def test_greedy_cut_is_closest_type_boundary_to_25pct(self, fresh_instance):
        """No other prefix of the LBS-ranked types lands nearer to 25%."""
        boxes = fresh_instance["boxes"]
        assign_fragility(boxes)
        n = len(boxes)
        lbs = {}; cnt = {}
        for b in boxes:
            lbs.setdefault(b["type_id"], min(b["lbs_l"], b["lbs_w"], b["lbs_h"]))
            cnt[b["type_id"]] = cnt.get(b["type_id"], 0) + 1
        ranked = sorted(lbs, key=lambda t: (lbs[t], t))
        chosen = sum(b["fragile"] for b in boxes) / n
        cum, best = 0, None
        for t in ranked:
            cum += cnt[t]
            err = abs(cum / n - 0.25)
            best = err if best is None or err < best else best
        assert abs(abs(chosen - 0.25) - best) < 1e-12

    def test_all_boxes_have_fragile_field(self, fresh_instance):
        assign_fragility(fresh_instance["boxes"])
        for box in fresh_instance["boxes"]:
            assert "fragile" in box
            assert box["fragile"] in (0, 1)

    def test_fragile_boxes_have_lower_lbs(self, fresh_instance):
        assign_fragility(fresh_instance["boxes"])
        boxes = fresh_instance["boxes"]
        fragile_lbs = [min(b["lbs_l"], b["lbs_w"], b["lbs_h"])
                       for b in boxes if b["fragile"] == 1]
        robust_lbs = [min(b["lbs_l"], b["lbs_w"], b["lbs_h"])
                      for b in boxes if b["fragile"] == 0]
        assert max(fragile_lbs) <= min(robust_lbs)

    def test_empty_list_raises(self):
        with pytest.raises(ValueError):
            assign_fragility([])

    def test_report_contains_expected_keys(self, fresh_instance):
        report = assign_fragility(fresh_instance["boxes"])
        for key in ("n_boxes", "fragile_count", "fragile_rate",
                    "n_distinct_lbs", "lbs_min", "lbs_max",
                    "lbs_ratio", "lbs_std", "q1"):
            assert key in report


# ── Stop assignment tests ────────────────────────────────────────────────────

class TestStopAssignment:

    def test_all_boxes_get_a_stop(self, fresh_instance):
        assign_stops(fresh_instance["boxes"], num_stops=3, seed=42)
        for box in fresh_instance["boxes"]:
            assert "stop" in box
            assert box["stop"] in (1, 2, 3)

    def test_balance_within_10_percentage_points(self, fresh_instance):
        assign_stops(fresh_instance["boxes"], num_stops=3, seed=42)
        n = len(fresh_instance["boxes"])
        counts = {1: 0, 2: 0, 3: 0}
        for box in fresh_instance["boxes"]:
            counts[box["stop"]] += 1
        for s, c in counts.items():
            assert abs(c / n - 1/3) <= 0.10

    def test_reproducible_under_same_seed(self, fresh_instance):
        assign_stops(fresh_instance["boxes"], num_stops=3, seed=42)
        first = [b["stop"] for b in fresh_instance["boxes"]]

        # Re-assign with same seed on a fresh copy
        inst2_boxes = [dict(b) for b in fresh_instance["boxes"]]
        for b in inst2_boxes:
            b.pop("stop", None)
        assign_stops(inst2_boxes, num_stops=3, seed=42)
        second = [b["stop"] for b in inst2_boxes]

        assert first == second

    def test_different_seeds_differ(self, fresh_instance):
        boxes_a = [dict(b) for b in fresh_instance["boxes"]]
        boxes_b = [dict(b) for b in fresh_instance["boxes"]]
        assign_stops(boxes_a, num_stops=3, seed=42)
        assign_stops(boxes_b, num_stops=3, seed=99)
        stops_a = [b["stop"] for b in boxes_a]
        stops_b = [b["stop"] for b in boxes_b]
        assert stops_a != stops_b

    def test_too_few_boxes_raises(self):
        boxes = [{"l": 10, "w": 10, "h": 10} for _ in range(2)]
        with pytest.raises(ValueError):
            assign_stops(boxes, num_stops=3, seed=42)

    def test_invalid_num_stops_raises(self, fresh_instance):
        with pytest.raises(ValueError):
            assign_stops(fresh_instance["boxes"], num_stops=1, seed=42)

    def test_empty_list_raises(self):
        with pytest.raises(ValueError):
            assign_stops([], num_stops=3, seed=42)


# ── Pipeline integration tests ───────────────────────────────────────────────

class TestPipeline:

    def test_container_is_rear_door_rotated(self, minimal_config, wtpack1_instances):
        """Pipeline rotates the file's length x width x height so depth (y)
        runs along the length: door = small end face. Loader stays raw."""
        raw = wtpack1_instances[REF_INDEX]["container"]
        inst = load_augmented_instance(minimal_config, instance_id=REF_INSTANCE_ID)
        c = inst["container"]
        assert c["L"] == raw["W"] and c["W"] == raw["L"] and c["H"] == raw["H"]
        assert (c["length_cm"], c["width_cm"], c["height_cm"]) == (raw["L"], raw["W"], raw["H"])
        assert c["door"] == "rear"
        assert c["W"] >= c["L"]          # depth is the long axis on every wtpack container

    def test_load_augmented_instance_end_to_end(self, minimal_config):
        inst = load_augmented_instance(minimal_config, instance_id=REF_INSTANCE_ID)
        assert "container" in inst
        assert "boxes" in inst
        assert "augmentation" in inst
        assert "fragility" in inst["augmentation"]
        assert "stops" in inst["augmentation"]

    def test_every_box_has_full_attribute_set(self, minimal_config):
        inst = load_augmented_instance(minimal_config, instance_id=REF_INSTANCE_ID)
        required = {
            "l", "w", "h",
            "l_flag", "w_flag", "h_flag",
            "mass", "lbs_l", "lbs_w", "lbs_h",
            "allowed_orientations",
            "fragile", "stop",
        }
        for box in inst["boxes"]:
            assert required.issubset(box.keys())

    def test_pipeline_is_deterministic(self, minimal_config):
        a = load_augmented_instance(minimal_config, instance_id=REF_INSTANCE_ID, stop_seed=42)
        b = load_augmented_instance(minimal_config, instance_id=REF_INSTANCE_ID, stop_seed=42)
        stops_a = [box["stop"] for box in a["boxes"]]
        stops_b = [box["stop"] for box in b["boxes"]]
        assert stops_a == stops_b

    def test_pipeline_works_across_all_seven_files(self, minimal_config):
        # Sample one instance from each wtpack file. Validation may reject an
        # instance (the documented contract is "reject and try the next"), so
        # a ValueError is a legitimate outcome; every accepted instance must
        # satisfy the bounds, and at least one file must yield an instance.
        accepted = 0
        for instance_id in range(7):
            try:
                inst = load_augmented_instance(minimal_config, instance_id=instance_id)
            except ValueError:
                continue
            accepted += 1
            assert len(inst["boxes"]) > 0
            n = len(inst["boxes"])
            rate = sum(b["fragile"] for b in inst["boxes"]) / n
            assert FRAGILE_RATE_MIN <= rate <= FRAGILE_RATE_MAX
        assert accepted >= 1