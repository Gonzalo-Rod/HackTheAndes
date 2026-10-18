import unittest
from shapely.geometry import (
    GeometryCollection,
    LineString,
    MultiPoint,
    MultiPolygon,
    Point,
    box,
    Polygon,
)
from road_data.domain.catchments import (
    area_km2,
    containing_basin_segments,
    crossing_segment_ids,
    point_intersections,
    sampling_points,
    upstream_ids,
)


class CatchmentDomainTests(unittest.TestCase):
    def test_collects_all_ancestors_once_and_excludes_downstream(self):
        self.assertEqual(upstream_ids([3], {1: 3, 2: 3, 3: 4, 4: 0}), [1, 2, 3])

    def test_rejects_cycles_and_missing_outlets(self):
        with self.assertRaises(ValueError):
            upstream_ids([1], {1: 2, 2: 1})
        with self.assertRaises(ValueError):
            upstream_ids([9], {1: 0})

    def test_overlapping_lines_do_not_invent_a_crossing(self):
        self.assertEqual(point_intersections(LineString([(0, 0), (1, 1)])), [])
        result = point_intersections(
            GeometryCollection(
                [MultiPoint([(0, 0), (1, 1)]), LineString([(0, 0), (1, 1)])]
            )
        )
        self.assertEqual(len(result), 2)

    def test_weights_cover_the_polygon_and_points_stay_inside_it(self):
        polygon = MultiPolygon([box(-77.05, -12.05, -76.95, -11.95)])
        samples = sampling_points(polygon)
        self.assertAlmostEqual(sum(item["weight"] for item in samples), 1)
        self.assertTrue(
            all(
                polygon.covers(Point(item["longitude"], item["latitude"]))
                for item in samples
            )
        )

    def test_holes_reduce_area_regardless_of_ring_orientation(self):
        outer = [(-77, -12), (-76, -12), (-76, -11), (-77, -11)]
        hole = [(-76.8, -11.8), (-76.2, -11.8), (-76.2, -11.2), (-76.8, -11.2)]
        self.assertAlmostEqual(
            area_km2(Polygon(outer, [hole])),
            area_km2(Polygon(outer, [list(reversed(hole))])),
        )
        self.assertLess(area_km2(Polygon(outer, [hole])), area_km2(Polygon(outer)))

    def test_rejects_distant_road_associations_and_preserves_boundary_ties(self):
        segments = [
            ("a", LineString([(-77, -12), (-76.99, -12)])),
            ("b", LineString([(-76.99, -12), (-76.98, -12)])),
        ]
        self.assertEqual(crossing_segment_ids(Point(-76.99, -12), segments), ["a", "b"])
        self.assertEqual(crossing_segment_ids(Point(-76, -12), segments), [])


    def test_groups_unlinked_segments_by_the_basin_covering_their_midpoint(self):
        basins = {7: box(0, 0, 1, 1), 3: box(1, 0, 2, 1)}
        segments = [
            ("s1", LineString([(0.1, 0.5), (0.3, 0.5)])),
            ("s2", LineString([(0.9, 0.5), (1.5, 0.5)])),
            # Midpoint exactly on the shared edge: the lowest basin id wins deterministically.
            ("s3", LineString([(0.9, 0.2), (1.1, 0.2)])),
            ("s4", LineString([(5, 5), (6, 5)])),
        ]
        self.assertEqual(
            containing_basin_segments(segments, basins), {7: ["s1"], 3: ["s2", "s3"]}
        )


if __name__ == "__main__":
    unittest.main()
