import unittest
from shapely.geometry import box
from road_data.domain.historical_events import (
    excel_date,
    occurrence_day,
    natural_hazard,
    kilometer,
)
from road_data.domain.hazards import weighted_susceptibility, unit_overlap


class HistoricalEventTests(unittest.TestCase):
    def test_uses_excel_epoch_and_full_lima_day_without_inventing_an_hour(self):
        self.assertEqual(excel_date("45375"), "2024-03-24")
        self.assertEqual(
            occurrence_day("2024-03-24"),
            ("2024-03-24T05:00:00+00:00", "2024-03-25T05:00:00+00:00"),
        )
        self.assertEqual(kilometer("68+800"), 68.8)
        self.assertIsNone(kilometer("unknown"))

    def test_excludes_crashes_and_keeps_hazard_type_separate_from_cause(self):
        self.assertIsNone(natural_hazard("ACCIDENTE DE TRÁNSITO", ""))
        self.assertEqual(natural_hazard("DERRUMBE", ""), "rockfall_or_slope_failure")
        self.assertEqual(
            natural_hazard("DEFORMACIÓN PROFUNDA", "DESLIZAMIENTO"), "landslide"
        )


class HazardTests(unittest.TestCase):
    def test_preserves_unknown_weight_and_uses_worst_class_at_a_boundary(self):
        samples = [
            {"longitude": 0.5, "latitude": 0.5, "weight": 0.6},
            {"longitude": 10, "latitude": 10, "weight": 0.4},
        ]
        value = weighted_susceptibility(
            samples, [box(0, 0, 1, 1), box(0.5, 0, 1.5, 1)], [2, 5]
        )
        self.assertAlmostEqual(value["classWeights"]["5"], 0.6)
        self.assertAlmostEqual(value["unknownWeight"], 0.4)

    def test_unit_overlap_never_claims_uncovered_area_is_validated(self):
        value = unit_overlap(
            box(-77, -12, -76, -11), [("reference", box(-77, -12, -76.5, -11))]
        )
        self.assertAlmostEqual(value["coverageFraction"], 0.5, places=3)


if __name__ == "__main__":
    unittest.main()
