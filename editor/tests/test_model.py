from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import model  # noqa: E402


def make_route() -> dict:
    return {
        "version": 2,
        "meta": {
            "routeName": "Test Route",
            "xScale": 1.333333333,
            "yScale": 12.5,
            "gridWidthM": 75,
            "gridHeightM": 4,
            "showLegend": True,
            "showOverallLos": True,
            "overallLos": "B",
            "destinationMetricLabelPosition": "right",
            "canvasPaddingX": 140,
            "canvasPaddingTop": 60,
            "canvasPaddingBottom": 160,
            "canvasRatioPreset": "auto",
            "canvasRatioWidth": 16,
            "canvasRatioHeight": 9,
        },
        "origin": {"type": "metro"},
        "destination": {"type": "bus"},
        "startLevel": "GF",
        "levels": [
            {"label": "GF", "elevationM": 0},
            {"label": "L1", "elevationM": 6},
        ],
        "segments": [],
    }


class ModelAnalysisTests(unittest.TestCase):
    def test_v1_routes_promote_to_v2_and_keep_manual_los(self) -> None:
        route = {
            "version": 1,
            "meta": {
                "routeName": "Legacy",
                "xScale": 1.2,
                "yScale": 10,
                "gridWidthM": 25,
                "gridHeightM": 4,
                "showLegend": True,
                "showOverallLos": True,
                "overallLos": "B",
            },
            "origin": {"type": "metro"},
            "destination": {"type": "bus"},
            "startLevel": "GF",
            "levels": [{"label": "GF", "elevationM": 0}],
            "segments": [
                {
                    "lengthM": 50,
                    "verticalM": 0,
                    "weather": "open",
                    "startMarker": "none",
                    "midMarker": "none",
                    "los": "C",
                }
            ],
        }

        bundle = model.analyze_route(route)
        normalized = bundle["route"]

        self.assertEqual(normalized["version"], model.ROUTE_VERSION)
        self.assertEqual(normalized["meta"]["overallLos"], "B")
        self.assertEqual(normalized["meta"]["canvasRatioPreset"], "auto")
        self.assertEqual(normalized["meta"]["canvasRatioWidth"], 16.0)
        self.assertEqual(normalized["meta"]["canvasRatioHeight"], 9.0)
        self.assertEqual(normalized["segments"][0]["los"], "C")
        self.assertEqual(bundle["analysis"]["route"]["overallLos"], "B")
        self.assertEqual(bundle["analysis"]["route"]["suggestedOverallLos"], "C")
        self.assertIn("computed", normalized)

    def test_default_route_includes_auto_canvas_ratio(self) -> None:
        route = model.create_default_route()

        self.assertEqual(route["meta"]["canvasRatioPreset"], "auto")
        self.assertEqual(route["meta"]["canvasRatioWidth"], 16.0)
        self.assertEqual(route["meta"]["canvasRatioHeight"], 9.0)

    def test_legacy_los_fields_migrate_to_current_manual_fields(self) -> None:
        route = make_route()
        route["meta"].pop("overallLos")
        route["meta"]["legacyOverallLos"] = "D"
        route["segments"] = [
            {
                "lengthM": 25,
                "verticalM": 0,
                "weather": "open",
                "startMarker": "none",
                "midMarker": "none",
                "legacyLos": "E",
            }
        ]

        normalized = model.analyze_route(route)["route"]

        self.assertEqual(normalized["meta"]["overallLos"], "D")
        self.assertEqual(normalized["segments"][0]["los"], "E")

    def test_flat_segment_keeps_manual_los_without_width_demand_calculation(self) -> None:
        route = make_route()
        route["segments"] = [
            {
                "lengthM": 120,
                "verticalM": 0,
                "weather": "sheltered",
                "startMarker": "none",
                "midMarker": "none",
                "los": "E",
                "kind": "walkway",
                "effectiveWidthM": 99,
            }
        ]

        segment = model.analyze_route(route)["analysis"]["segments"][0]

        self.assertEqual(segment["los"], "E")
        self.assertEqual(segment["travelTimeS"], 0.0)
        self.assertEqual(segment["impedanceS"], 0.0)
        self.assertEqual(segment["flowPerMinPerM"], 0.0)

    def test_target_level_updates_vertical_totals(self) -> None:
        route = make_route()
        route["segments"] = [
            {
                "lengthM": 10,
                "verticalM": 0,
                "weather": "open",
                "startMarker": "none",
                "midMarker": "stair_up",
                "targetLevel": "L1",
                "los": "D",
            }
        ]

        bundle = model.analyze_route(route)
        segment = bundle["analysis"]["segments"][0]

        self.assertEqual(segment["verticalM"], 6.0)
        self.assertEqual(segment["endElevationM"], 6.0)
        self.assertEqual(bundle["analysis"]["route"]["totalVerticalM"], 6.0)

    def test_overall_suggestion_comes_from_worst_manual_segment(self) -> None:
        route = make_route()
        route["meta"]["overallLos"] = "B"
        route["segments"] = [
            {
                "lengthM": 30,
                "verticalM": 0,
                "weather": "sheltered",
                "startMarker": "none",
                "midMarker": "none",
                "los": "B",
            },
            {
                "lengthM": 20,
                "verticalM": 0,
                "weather": "open",
                "startMarker": "turnstiles",
                "midMarker": "none",
                "los": "F",
            },
        ]

        bundle = model.analyze_route(route)

        self.assertEqual(bundle["analysis"]["route"]["overallLos"], "B")
        self.assertEqual(bundle["analysis"]["route"]["suggestedOverallLos"], "F")
        self.assertIn("worst segment suggests F", bundle["analysis"]["warnings"][0])

    def test_csv_import_preserves_manual_overall_and_segment_los(self) -> None:
        csv_text = "\n".join(
            [
                "X-Y SCALE>>,1.157,6,25,4,OVERALL LOS >>,51,1,1,START LEVEL>>,G,0,HV LABEL POS>>,right",
                "1,11.57,0,2,1,17,52",
                "2,0,0,0,2,0,0",
            ]
            + [f"{row},0,0,0,0,0,0" for row in range(3, 30)]
            + [
                "TOTAL>>,10,0",
                "G,1F",
                "0,6",
            ]
        ) + "\n"

        rows = [line.split(",") for line in csv_text.strip().splitlines()]
        with mock.patch.object(model, "read_csv_rows", return_value=rows):
            route = model.import_route_from_csv(Path("ignored.csv"))

        self.assertEqual(route["meta"]["overallLos"], "B")
        self.assertEqual(route["segments"][0]["los"], "C")
        self.assertFalse(route["computed"]["assumptions"])

    def test_csv_export_appends_canvas_ratio_marker(self) -> None:
        route = make_route()
        route["meta"]["canvasRatioPreset"] = "4:3"
        route["segments"] = [
            {
                "lengthM": 10,
                "verticalM": 0,
                "weather": "open",
                "startMarker": "none",
                "midMarker": "none",
                "los": "C",
            }
        ]
        bundle = model.analyze_route(route)

        first_row = model.route_to_csv(bundle["route"], bundle["analysis"]).splitlines()[0]

        self.assertIn("CANVAS RATIO>>,4:3,4,3", first_row)

    def test_csv_import_reads_canvas_ratio_marker(self) -> None:
        csv_text = "\n".join(
            [
                "X-Y SCALE>>,1.157,6,25,4,OVERALL LOS >>,51,1,1,START LEVEL>>,G,0,HV LABEL POS>>,right,CANVAS PAD>>,140,60,160,CANVAS RATIO>>,custom,21,10",
                "1,11.57,0,2,1,17,52",
                "2,0,0,0,2,0,0",
            ]
            + [f"{row},0,0,0,0,0,0" for row in range(3, 30)]
            + [
                "TOTAL>>,10,0",
                "G,1F",
                "0,6",
            ]
        ) + "\n"

        rows = [line.split(",") for line in csv_text.strip().splitlines()]
        with mock.patch.object(model, "read_csv_rows", return_value=rows):
            route = model.import_route_from_csv(Path("ignored.csv"))

        self.assertEqual(route["meta"]["canvasRatioPreset"], "custom")
        self.assertEqual(route["meta"]["canvasRatioWidth"], 21.0)
        self.assertEqual(route["meta"]["canvasRatioHeight"], 10.0)

    def test_csv_import_without_canvas_ratio_marker_defaults_to_auto(self) -> None:
        csv_text = "\n".join(
            [
                "X-Y SCALE>>,1.157,6,25,4,OVERALL LOS >>,51,1,1,START LEVEL>>,G,0,HV LABEL POS>>,right",
                "1,11.57,0,2,1,17,52",
                "2,0,0,0,2,0,0",
            ]
            + [f"{row},0,0,0,0,0,0" for row in range(3, 30)]
            + [
                "TOTAL>>,10,0",
                "G,1F",
                "0,6",
            ]
        ) + "\n"

        rows = [line.split(",") for line in csv_text.strip().splitlines()]
        with mock.patch.object(model, "read_csv_rows", return_value=rows):
            route = model.import_route_from_csv(Path("ignored.csv"))

        self.assertEqual(route["meta"]["canvasRatioPreset"], "auto")
        self.assertEqual(route["meta"]["canvasRatioWidth"], 16.0)
        self.assertEqual(route["meta"]["canvasRatioHeight"], 9.0)

    def test_invalid_custom_canvas_ratio_dimensions_block_export(self) -> None:
        route = make_route()
        route["meta"]["canvasRatioPreset"] = "custom"
        route["meta"]["canvasRatioWidth"] = 0
        route["meta"]["canvasRatioHeight"] = -1
        route["segments"] = [
            {
                "lengthM": 10,
                "verticalM": 0,
                "weather": "open",
                "startMarker": "none",
                "midMarker": "none",
                "los": "C",
            }
        ]

        errors = model.analyze_route(route)["analysis"]["validation"]["errors"]

        self.assertIn("Custom canvas ratio width must be greater than 0.", errors)
        self.assertIn("Custom canvas ratio height must be greater than 0.", errors)


if __name__ == "__main__":
    unittest.main()
