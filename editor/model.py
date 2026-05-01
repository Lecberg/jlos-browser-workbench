from __future__ import annotations

import csv
import json
import math
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
JLOS_DIR = PROJECT_ROOT / "JLOS"
PROCESSING_EXE = PROJECT_ROOT / "Processing" / "processing-4.3.2" / "processing-java.exe"
ROUTE_JSON_PATH = JLOS_DIR / "JLOS_route.json"
CSV_PATH = JLOS_DIR / "JLOS_data.csv"
PREVIEW_PATH = JLOS_DIR / "sample_hires.png"
PREVIEW_SVG_PATH = JLOS_DIR / "sample_hires.svg"
TEMP_PREVIEW_DIR = PROJECT_ROOT / "tmp" / "editor-preview"
TEMP_PREVIEW_PATH = TEMP_PREVIEW_DIR / "sample_hires_preview.png"
TEMP_PREVIEW_SVG_PATH = TEMP_PREVIEW_DIR / "sample_hires_preview.svg"

CSV_SEGMENT_ROWS = 29
CSV_TOTAL_ROW_INDEX = 30
CSV_LEVEL_LABEL_ROW_INDEX = 31
CSV_LEVEL_ELEVATION_ROW_INDEX = 32
RENDERER_MAX_SEGMENTS = 28

ROUTE_VERSION = 3
ANALYSIS_STANDARD = "fruin_hcm_v1"
DEFAULT_USER_PROFILE = "standard_adult"
DEFAULT_SCENARIO_NAME = "Base Scenario"
DEFAULT_DEMAND_PPM = 25.0
DEFAULT_X_SCALE = 1.333333333
DEFAULT_Y_SCALE = 12.5
DEFAULT_GRID_WIDTH_M = 75.0
DEFAULT_GRID_HEIGHT_M = 4.0
DEFAULT_START_LEVEL_LABEL = "GF"
DEFAULT_START_LEVEL_ELEVATION_M = 0.0
DEFAULT_DESTINATION_METRIC_LABEL_POSITION = "right"
DEFAULT_CANVAS_PADDING_X = 140.0
DEFAULT_CANVAS_PADDING_TOP = 60.0
DEFAULT_CANVAS_PADDING_BOTTOM = 160.0
DEFAULT_CANVAS_RATIO_PRESET = "auto"
DEFAULT_CANVAS_RATIO_WIDTH = 16.0
DEFAULT_CANVAS_RATIO_HEIGHT = 9.0
CANVAS_RATIO_PRESET_DIMENSIONS = {
    "auto": (DEFAULT_CANVAS_RATIO_WIDTH, DEFAULT_CANVAS_RATIO_HEIGHT),
    "16:9": (16.0, 9.0),
    "4:3": (4.0, 3.0),
    "3:2": (3.0, 2.0),
    "1:1": (1.0, 1.0),
}
CANVAS_RATIO_PRESETS = (*CANVAS_RATIO_PRESET_DIMENSIONS.keys(), "custom")

LOS_LETTERS = ("A", "B", "C", "D", "E", "F")
DEFAULT_OVERALL_LOS = "C"

ORIGIN_MARKER_OPTIONS = [
    {"value": "metro", "label": "Metro", "code": 1},
    {"value": "bus", "label": "Bus", "code": 2},
    {"value": "brt", "label": "BRT", "code": 3},
    {"value": "coach", "label": "Coach", "code": 4},
    {"value": "rail", "label": "Rail", "code": 5},
    {"value": "evtol", "label": "eVTOL", "code": 6},
    {"value": "minibus", "label": "Minibus", "code": 7},
    {"value": "ferry", "label": "Ferry", "code": 8},
    {"value": "taxi", "label": "Taxi", "code": 9},
    {"value": "uber", "label": "Uber", "code": 10},
    {"value": "bike", "label": "Bike", "code": 11},
    {"value": "drop_off", "label": "Drop-off", "code": 12},
    {"value": "smart_car", "label": "Smart Car", "code": 13},
]

SEGMENT_START_MARKER_OPTIONS = [
    {"value": "none", "label": "None", "code": 0},
    *ORIGIN_MARKER_OPTIONS,
    {"value": "bottleneck", "label": "Bottleneck", "code": 18},
    {"value": "turnstiles", "label": "Turnstiles", "code": 19},
    {"value": "ticketing", "label": "Ticketing", "code": 22},
]

SEGMENT_MID_MARKER_OPTIONS = [
    {"value": "none", "label": "None", "code": 0},
    {"value": "escalator_up", "label": "Escalator Up", "code": 14},
    {"value": "escalator_down", "label": "Escalator Down", "code": 15},
    {"value": "stair_up", "label": "Stair Up", "code": 16},
    {"value": "stair_down", "label": "Stair Down", "code": 17},
    {"value": "bottleneck", "label": "Bottleneck", "code": 18},
    {"value": "turnstiles", "label": "Turnstiles", "code": 19},
    {"value": "washroom", "label": "Washroom", "code": 20},
    {"value": "retail", "label": "Retail", "code": 21},
    {"value": "ticketing", "label": "Ticketing", "code": 22},
    {"value": "fnb", "label": "F&B", "code": 23},
]

WEATHER_OPTIONS = [
    {"value": "open", "label": "Open", "code": 1},
    {"value": "sheltered", "label": "Sheltered", "code": 2},
    {"value": "air_conditioned", "label": "Air-conditioned", "code": 3},
]

LOS_OPTIONS = [
    {"value": "A", "label": "A", "code": 50},
    {"value": "B", "label": "B", "code": 51},
    {"value": "C", "label": "C", "code": 52},
    {"value": "D", "label": "D", "code": 53},
    {"value": "E", "label": "E", "code": 54},
    {"value": "F", "label": "F", "code": 55},
]

DESTINATION_METRIC_LABEL_POSITION_OPTIONS = [
    {"value": "right", "label": "Right"},
    {"value": "above", "label": "Above"},
    {"value": "below", "label": "Below"},
]

SEGMENT_KIND_OPTIONS = [
    {"value": "walkway", "label": "Walkway"},
    {"value": "stair", "label": "Stair"},
    {"value": "escalator", "label": "Escalator"},
    {"value": "queue", "label": "Queue"},
    {"value": "checkpoint", "label": "Checkpoint"},
]

STANDARD_OPTIONS = [{"value": ANALYSIS_STANDARD, "label": "Fruin / HCM v1"}]
USER_PROFILE_OPTIONS = [{"value": DEFAULT_USER_PROFILE, "label": "Standard Adult"}]

ORIGIN_TO_CODE = {item["value"]: item["code"] for item in ORIGIN_MARKER_OPTIONS}
CODE_TO_ORIGIN = {item["code"]: item["value"] for item in ORIGIN_MARKER_OPTIONS}
START_MARKER_TO_CODE = {item["value"]: item["code"] for item in SEGMENT_START_MARKER_OPTIONS}
CODE_TO_START_MARKER = {item["code"]: item["value"] for item in SEGMENT_START_MARKER_OPTIONS}
MID_MARKER_TO_CODE = {item["value"]: item["code"] for item in SEGMENT_MID_MARKER_OPTIONS}
CODE_TO_MID_MARKER = {item["code"]: item["value"] for item in SEGMENT_MID_MARKER_OPTIONS}
WEATHER_TO_CODE = {item["value"]: item["code"] for item in WEATHER_OPTIONS}
CODE_TO_WEATHER = {item["code"]: item["value"] for item in WEATHER_OPTIONS}
LOS_TO_CODE = {item["value"]: item["code"] for item in LOS_OPTIONS}
CODE_TO_LOS = {item["code"]: item["value"] for item in LOS_OPTIONS}
SEGMENT_KIND_VALUES = {item["value"] for item in SEGMENT_KIND_OPTIONS}
STANDARD_VALUES = {item["value"] for item in STANDARD_OPTIONS}
USER_PROFILE_VALUES = {item["value"] for item in USER_PROFILE_OPTIONS}
DESTINATION_METRIC_LABEL_POSITIONS = {
    option["value"] for option in DESTINATION_METRIC_LABEL_POSITION_OPTIONS
}

DEFAULT_EFFECTIVE_WIDTH_BY_KIND = {
    "walkway": 3.0,
    "stair": 1.8,
    "escalator": 1.0,
    "queue": 2.2,
    "checkpoint": 1.8,
}

DEFAULT_FIXED_DELAY_BY_KIND = {
    "walkway": 0.0,
    "stair": 0.0,
    "escalator": 0.0,
    "queue": 0.0,
    "checkpoint": 0.0,
}

DEFAULT_QUEUE_DELAY_BY_KIND = {
    "walkway": 0.0,
    "stair": 0.0,
    "escalator": 0.0,
    "queue": 0.0,
    "checkpoint": 0.0,
}

DEFAULT_CAPACITY_FACTOR_BY_KIND = {
    "walkway": 1.0,
    "stair": 1.0,
    "escalator": 1.0,
    "queue": 1.0,
    "checkpoint": 1.0,
}

FLOW_THRESHOLDS_BY_KIND = {
    "walkway": (16.0, 23.0, 33.0, 49.0, 66.0),
    "stair": (13.0, 18.0, 23.0, 30.0, 38.0),
    "escalator": (18.0, 25.0, 34.0, 45.0, 60.0),
    "queue": (10.0, 15.0, 20.0, 30.0, 40.0),
    "checkpoint": (8.0, 12.0, 18.0, 26.0, 36.0),
}

BASE_SPEED_BY_KIND = {
    "walkway": 1.40,
    "stair": 0.70,
    "escalator": 0.90,
    "queue": 0.80,
    "checkpoint": 0.75,
}

STAIR_DIRECTION_SPEED = {"up": 0.65, "down": 0.75}
WEATHER_SPEED_FACTORS = {"open": 0.97, "sheltered": 1.0, "air_conditioned": 1.02}
WEATHER_IMPEDANCE_PER_100M = {"open": 6.0, "sheltered": 2.0, "air_conditioned": 0.0}
VERTICAL_PENALTY_PER_M = {
    "walkway": {"up": 8.0, "down": 3.0},
    "stair": {"up": 10.0, "down": 4.0},
    "escalator": {"up": 4.0, "down": 1.0},
    "queue": {"up": 8.0, "down": 3.0},
    "checkpoint": {"up": 6.0, "down": 2.0},
}

MARKER_TO_INFERRED_KIND = {
    "escalator_up": "escalator",
    "escalator_down": "escalator",
    "stair_up": "stair",
    "stair_down": "stair",
    "bottleneck": "queue",
    "turnstiles": "checkpoint",
    "ticketing": "checkpoint",
}


@dataclass
class AssumptionTracker:
    scenario_defaulted: set[str] = field(default_factory=set)
    inferred_kinds: list[int] = field(default_factory=list)
    default_width_segments: list[int] = field(default_factory=list)
    default_fixed_delay_segments: list[int] = field(default_factory=list)
    default_queue_delay_segments: list[int] = field(default_factory=list)
    default_capacity_segments: list[int] = field(default_factory=list)

    def messages(self) -> list[str]:
        return []


class ExportValidationError(Exception):
    def __init__(self, errors: list[str], bundle: dict[str, Any]) -> None:
        super().__init__("Route data is not ready for export.")
        self.errors = errors
        self.bundle = bundle


class PreviewNotReadyError(Exception):
    pass


def build_options() -> dict[str, Any]:
    return {
        "originTypes": ORIGIN_MARKER_OPTIONS,
        "destinationTypes": ORIGIN_MARKER_OPTIONS,
        "destinationMetricLabelPositions": DESTINATION_METRIC_LABEL_POSITION_OPTIONS,
        "startMarkers": SEGMENT_START_MARKER_OPTIONS,
        "midMarkers": SEGMENT_MID_MARKER_OPTIONS,
        "weatherOptions": WEATHER_OPTIONS,
        "losOptions": LOS_OPTIONS,
        "segmentKindOptions": SEGMENT_KIND_OPTIONS,
        "standards": STANDARD_OPTIONS,
        "userProfiles": USER_PROFILE_OPTIONS,
        "renderer": {"maxSegments": RENDERER_MAX_SEGMENTS},
    }


def create_default_route() -> dict[str, Any]:
    return {
        "version": ROUTE_VERSION,
        "meta": {
            "routeName": "New Route",
            "xScale": DEFAULT_X_SCALE,
            "yScale": DEFAULT_Y_SCALE,
            "gridWidthM": DEFAULT_GRID_WIDTH_M,
            "gridHeightM": DEFAULT_GRID_HEIGHT_M,
            "showLegend": True,
            "showOverallLos": True,
            "overallLos": DEFAULT_OVERALL_LOS,
            "legacyOverallLos": "",
            "destinationMetricLabelPosition": DEFAULT_DESTINATION_METRIC_LABEL_POSITION,
            "canvasPaddingX": DEFAULT_CANVAS_PADDING_X,
            "canvasPaddingTop": DEFAULT_CANVAS_PADDING_TOP,
            "canvasPaddingBottom": DEFAULT_CANVAS_PADDING_BOTTOM,
            "canvasRatioPreset": DEFAULT_CANVAS_RATIO_PRESET,
            "canvasRatioWidth": DEFAULT_CANVAS_RATIO_WIDTH,
            "canvasRatioHeight": DEFAULT_CANVAS_RATIO_HEIGHT,
        },
        "scenario": {
            "name": DEFAULT_SCENARIO_NAME,
            "standard": ANALYSIS_STANDARD,
            "demandPpm": DEFAULT_DEMAND_PPM,
            "userProfile": DEFAULT_USER_PROFILE,
        },
        "origin": {"type": ""},
        "destination": {"type": ""},
        "startLevel": DEFAULT_START_LEVEL_LABEL,
        "levels": [
            {"label": DEFAULT_START_LEVEL_LABEL, "elevationM": DEFAULT_START_LEVEL_ELEVATION_M},
            {"label": "L1", "elevationM": 13.0},
        ],
        "segments": [],
        "computed": empty_route_computed(),
    }


def empty_route_computed() -> dict[str, Any]:
    return {
        "totalLengthM": 0.0,
        "totalVerticalM": 0.0,
        "totalTimeS": 0.0,
        "totalImpedanceS": 0.0,
        "overallLos": "",
        "suggestedOverallLos": "",
        "assumptions": [],
        "warnings": [],
    }


def empty_segment_computed() -> dict[str, Any]:
    return {
        "startElevationM": 0.0,
        "endElevationM": 0.0,
        "pathLengthM": 0.0,
        "travelTimeS": 0.0,
        "impedanceS": 0.0,
        "los": "",
        "flowPerMinPerM": 0.0,
    }


def ensure_route_file() -> None:
    if ROUTE_JSON_PATH.exists():
        return
    if CSV_PATH.exists():
        write_route_json(import_route_from_csv(CSV_PATH))
    else:
        write_route_json(create_default_route())


def load_route() -> dict[str, Any]:
    ensure_route_file()
    return read_route_json()


def read_route_json() -> dict[str, Any]:
    if not ROUTE_JSON_PATH.exists():
        return create_default_route()
    return json.loads(ROUTE_JSON_PATH.read_text(encoding="utf-8"))


def write_route_json(route: dict[str, Any]) -> None:
    ROUTE_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    ROUTE_JSON_PATH.write_text(json.dumps(route, indent=2), encoding="utf-8")


def save_route_json(route: dict[str, Any]) -> dict[str, Any]:
    bundle = analyze_route(route)
    write_route_json(bundle["route"])
    return bundle["route"]


def normalize_route(route: dict[str, Any] | None) -> dict[str, Any]:
    return analyze_route(route)["route"]


def analyze_route(route: dict[str, Any] | None) -> dict[str, Any]:
    tracker = AssumptionTracker()
    normalized = normalize_route_structure(route, tracker)
    metrics = compute_route_metrics(normalized)
    validation = validate_route(normalized, metrics)
    comparison_warnings = legacy_comparison_warnings(normalized, metrics)
    route_warnings = unique_messages(validation["warnings"] + comparison_warnings)

    route_computed = {
        "totalLengthM": metrics["totalLengthM"],
        "totalVerticalM": metrics["totalVerticalM"],
        "totalTimeS": 0.0,
        "totalImpedanceS": 0.0,
        "overallLos": normalized["meta"]["overallLos"],
        "suggestedOverallLos": metrics["suggestedOverallLos"],
        "assumptions": [],
        "warnings": route_warnings,
    }

    normalized["computed"] = route_computed
    for segment, computed in zip(normalized["segments"], metrics["computedSegments"], strict=False):
        segment["computed"] = {
            "startElevationM": computed["startElevationM"],
            "endElevationM": computed["endElevationM"],
            "pathLengthM": computed["pathLengthM"],
            "travelTimeS": 0.0,
            "impedanceS": 0.0,
            "los": computed["los"],
            "flowPerMinPerM": 0.0,
        }

    renderer_errors = renderer_compatibility_errors(normalized)
    analysis = {
        "route": {
            **route_computed,
            "startElevationM": metrics["startElevationM"],
            "finalElevationM": metrics["finalElevationM"],
            "segmentCount": len(normalized["segments"]),
            "overallLos": normalized["meta"]["overallLos"],
            "suggestedOverallLos": metrics["suggestedOverallLos"],
        },
        "segments": metrics["computedSegments"],
        "assumptions": [],
        "warnings": route_warnings,
        "validation": {
            "errors": unique_messages(validation["errors"]),
            "warnings": route_warnings,
            "rendererErrors": renderer_errors,
            "rendererWarnings": [],
            "canSave": True,
            "canExport": not validation["errors"] and not renderer_errors,
            "canRender": not validation["errors"],
        },
    }
    return {"route": normalized, "analysis": analysis}


def normalize_route_structure(
    route: dict[str, Any] | None,
    tracker: AssumptionTracker,
) -> dict[str, Any]:
    route = route or {}
    default_route = create_default_route()
    meta = route.get("meta") or {}
    origin = route.get("origin") or {}
    destination = route.get("destination") or {}
    raw_levels = route.get("levels")
    raw_segments = route.get("segments") or []
    scenario = normalize_scenario(route.get("scenario"), tracker)

    normalized_levels = [
        normalize_level(level) for level in raw_levels if isinstance(level, dict)
    ] if raw_levels is not None else [
        normalize_level(level) for level in default_route["levels"]
    ]
    normalized_start_level, normalized_levels = normalize_start_level_selection(
        route.get("startLevel"),
        normalized_levels,
    )

    normalized_segments = [
        normalize_segment(segment, index + 1, tracker)
        for index, segment in enumerate(raw_segments)
        if isinstance(segment, dict)
    ]

    overall_los = normalize_los(
        meta.get("overallLos") or meta.get("legacyOverallLos"),
        DEFAULT_OVERALL_LOS,
    )
    legacy_overall_los = normalize_legacy_los(meta.get("legacyOverallLos"))

    return {
        "version": ROUTE_VERSION,
        "meta": {
            "routeName": str(meta.get("routeName") or default_route["meta"]["routeName"]).strip()
            or default_route["meta"]["routeName"],
            "xScale": round_scale(meta.get("xScale"), DEFAULT_X_SCALE),
            "yScale": round_scale(meta.get("yScale"), DEFAULT_Y_SCALE),
            "gridWidthM": round_measure(meta.get("gridWidthM"), DEFAULT_GRID_WIDTH_M),
            "gridHeightM": round_measure(meta.get("gridHeightM"), DEFAULT_GRID_HEIGHT_M),
            "showLegend": normalize_bool(meta.get("showLegend"), True),
            "showOverallLos": normalize_bool(meta.get("showOverallLos"), True),
            "overallLos": overall_los,
            "legacyOverallLos": legacy_overall_los,
            "destinationMetricLabelPosition": normalize_destination_metric_label_position(
                meta.get("destinationMetricLabelPosition"),
                DEFAULT_DESTINATION_METRIC_LABEL_POSITION,
            ),
            "canvasPaddingX": round_measure(
                meta.get("canvasPaddingX"),
                DEFAULT_CANVAS_PADDING_X,
            ),
            "canvasPaddingTop": round_measure(
                meta.get("canvasPaddingTop"),
                DEFAULT_CANVAS_PADDING_TOP,
            ),
            "canvasPaddingBottom": round_measure(
                meta.get("canvasPaddingBottom"),
                DEFAULT_CANVAS_PADDING_BOTTOM,
            ),
            **normalize_canvas_ratio_meta(meta),
        },
        "scenario": scenario,
        "origin": {"type": normalize_origin_type(origin.get("type"))},
        "destination": {"type": normalize_origin_type(destination.get("type"))},
        "startLevel": normalized_start_level,
        "levels": normalized_levels,
        "segments": normalized_segments,
        "computed": empty_route_computed(),
    }


def normalize_scenario(raw_scenario: Any, tracker: AssumptionTracker) -> dict[str, Any]:
    scenario = raw_scenario if isinstance(raw_scenario, dict) else {}

    name = str(scenario.get("name") or DEFAULT_SCENARIO_NAME).strip()
    if not str(scenario.get("name") or "").strip():
        tracker.scenario_defaulted.add("name")

    standard = str(scenario.get("standard") or "").strip()
    if standard not in STANDARD_VALUES:
        standard = ANALYSIS_STANDARD
        tracker.scenario_defaulted.add("standard")

    user_profile = str(scenario.get("userProfile") or "").strip()
    if user_profile not in USER_PROFILE_VALUES:
        user_profile = DEFAULT_USER_PROFILE
        tracker.scenario_defaulted.add("userProfile")

    raw_demand = scenario.get("demandPpm")
    if raw_demand in ("", None):
        demand_ppm = DEFAULT_DEMAND_PPM
        tracker.scenario_defaulted.add("demandPpm")
    else:
        demand_ppm = round_measure(raw_demand, DEFAULT_DEMAND_PPM)

    return {
        "name": name,
        "standard": standard,
        "demandPpm": demand_ppm,
        "userProfile": user_profile,
    }


def normalize_level(level: dict[str, Any]) -> dict[str, Any]:
    return {
        "label": str(level.get("label") or "").strip(),
        "elevationM": round_measure(level.get("elevationM"), 0.0),
    }


def normalize_segment(
    segment: dict[str, Any],
    index: int,
    tracker: AssumptionTracker,
) -> dict[str, Any]:
    start_marker = normalize_start_marker(segment.get("startMarker"), "none")
    mid_marker = normalize_mid_marker(segment.get("midMarker"), "none")
    kind = normalize_segment_kind(segment.get("kind"))
    if not kind:
        kind = infer_segment_kind(start_marker, mid_marker)
        tracker.inferred_kinds.append(index)

    width_value = segment.get("effectiveWidthM")
    if width_value in ("", None):
        effective_width = DEFAULT_EFFECTIVE_WIDTH_BY_KIND[kind]
        tracker.default_width_segments.append(index)
    else:
        effective_width = round_measure(width_value, DEFAULT_EFFECTIVE_WIDTH_BY_KIND[kind])

    fixed_delay_value = segment.get("fixedDelayS")
    if fixed_delay_value in ("", None):
        fixed_delay = DEFAULT_FIXED_DELAY_BY_KIND[kind]
        tracker.default_fixed_delay_segments.append(index)
    else:
        fixed_delay = round_measure(fixed_delay_value, DEFAULT_FIXED_DELAY_BY_KIND[kind])

    queue_delay_value = segment.get("queueDelayS")
    if queue_delay_value in ("", None):
        queue_delay = DEFAULT_QUEUE_DELAY_BY_KIND[kind]
        tracker.default_queue_delay_segments.append(index)
    else:
        queue_delay = round_measure(queue_delay_value, DEFAULT_QUEUE_DELAY_BY_KIND[kind])

    capacity_factor_value = segment.get("capacityFactor")
    if capacity_factor_value in ("", None):
        capacity_factor = DEFAULT_CAPACITY_FACTOR_BY_KIND[kind]
        tracker.default_capacity_segments.append(index)
    else:
        capacity_factor = round_measure(
            capacity_factor_value,
            DEFAULT_CAPACITY_FACTOR_BY_KIND[kind],
        )

    return {
        "lengthM": round_measure(segment.get("lengthM"), 0.0),
        "verticalM": round_measure(segment.get("verticalM"), 0.0),
        "weather": normalize_weather(segment.get("weather"), "open"),
        "startMarker": start_marker,
        "midMarker": mid_marker,
        "targetLevel": str(segment.get("targetLevel") or "").strip(),
        "los": normalize_los(segment.get("los") or segment.get("legacyLos"), DEFAULT_OVERALL_LOS),
        "kind": kind,
        "effectiveWidthM": effective_width,
        "fixedDelayS": fixed_delay,
        "queueDelayS": queue_delay,
        "capacityFactor": capacity_factor,
        "legacyLos": normalize_legacy_los(segment.get("legacyLos")),
        "computed": empty_segment_computed(),
    }


def infer_segment_kind(start_marker: str, mid_marker: str) -> str:
    for marker in (mid_marker, start_marker):
        inferred = MARKER_TO_INFERRED_KIND.get(marker)
        if inferred:
            return inferred
    return "walkway"


def normalize_start_level_selection(
    start_level: Any,
    levels: list[dict[str, Any]],
) -> tuple[str, list[dict[str, Any]]]:
    normalized_levels = list(levels)
    requested_label = ""
    legacy_level = normalize_legacy_start_level(start_level)
    if legacy_level:
        normalized_levels = merge_level_into_levels(normalized_levels, legacy_level)
        requested_label = legacy_level["label"]
    else:
        requested_label = str(start_level or "").strip()
    return resolve_start_level_label(normalized_levels, requested_label), normalized_levels


def normalize_legacy_start_level(start_level: Any) -> dict[str, Any] | None:
    if not isinstance(start_level, dict):
        return None
    if not any(key in start_level for key in ("label", "elevationM")):
        return None
    return {
        "label": str(start_level.get("label") or "").strip(),
        "elevationM": round_measure(
            start_level.get("elevationM"),
            DEFAULT_START_LEVEL_ELEVATION_M,
        ),
    }


def normalize_origin_type(value: Any) -> str:
    value = str(value or "").strip()
    return value if value in ORIGIN_TO_CODE else ""


def normalize_start_marker(value: Any, default: str) -> str:
    value = str(value or "").strip()
    return value if value in START_MARKER_TO_CODE else default


def normalize_mid_marker(value: Any, default: str) -> str:
    value = str(value or "").strip()
    return value if value in MID_MARKER_TO_CODE else default


def normalize_weather(value: Any, default: str) -> str:
    value = str(value or "").strip()
    return value if value in WEATHER_TO_CODE else default


def normalize_segment_kind(value: Any) -> str:
    value = str(value or "").strip().lower()
    return value if value in SEGMENT_KIND_VALUES else ""


def normalize_legacy_los(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        value = value.strip().upper()
        if value in LOS_TO_CODE:
            return value
    return los_from_code(value)


def normalize_los(value: Any, default: str) -> str:
    return normalize_legacy_los(value) or default


def normalize_destination_metric_label_position(value: Any, default: str) -> str:
    value = str(value or "").strip().lower()
    return value if value in DESTINATION_METRIC_LABEL_POSITIONS else default


def normalize_canvas_ratio_preset(value: Any, default: str = DEFAULT_CANVAS_RATIO_PRESET) -> str:
    value = str(value or "").strip().lower()
    return value if value in CANVAS_RATIO_PRESETS else default


def canvas_ratio_dimensions_for_preset(preset: str) -> tuple[float, float]:
    return CANVAS_RATIO_PRESET_DIMENSIONS.get(
        preset,
        (DEFAULT_CANVAS_RATIO_WIDTH, DEFAULT_CANVAS_RATIO_HEIGHT),
    )


def normalize_canvas_ratio_meta(meta: dict[str, Any]) -> dict[str, Any]:
    preset = normalize_canvas_ratio_preset(meta.get("canvasRatioPreset"))
    default_width, default_height = canvas_ratio_dimensions_for_preset(preset)
    if preset == "custom":
        width = round_measure(meta.get("canvasRatioWidth"), default_width)
        height = round_measure(meta.get("canvasRatioHeight"), default_height)
    else:
        width, height = default_width, default_height

    return {
        "canvasRatioPreset": preset,
        "canvasRatioWidth": width,
        "canvasRatioHeight": height,
    }


def resolve_start_level_label(levels: list[dict[str, Any]], requested_label: str) -> str:
    requested = str(requested_label or "").strip()
    if requested:
        existing = find_level(levels, requested)
        if existing:
            return existing["label"]
    return infer_start_level_label(levels)


def infer_start_level_label(levels: list[dict[str, Any]]) -> str:
    for level in levels:
        if level["label"] and abs(level["elevationM"] - DEFAULT_START_LEVEL_ELEVATION_M) <= 0.01:
            return level["label"]
    for level in levels:
        if level["label"]:
            return level["label"]
    return ""


def merge_level_into_levels(
    levels: list[dict[str, Any]],
    level_to_merge: dict[str, Any],
) -> list[dict[str, Any]]:
    label = str(level_to_merge.get("label") or "").strip()
    if not label:
        return list(levels)
    merged_level = {
        "label": label,
        "elevationM": round_measure(
            level_to_merge.get("elevationM"),
            DEFAULT_START_LEVEL_ELEVATION_M,
        ),
    }
    merged_levels = [dict(level) for level in levels]
    for index, level in enumerate(merged_levels):
        if level["label"].casefold() == label.casefold():
            merged_levels[index] = merged_level
            return merged_levels
    return [merged_level, *merged_levels]


def find_level(levels: list[dict[str, Any]], label: str) -> dict[str, Any] | None:
    normalized_label = str(label or "").strip().casefold()
    if not normalized_label:
        return None
    for level in levels:
        if level["label"].casefold() == normalized_label:
            return level
    return None


def level_elevation(levels: list[dict[str, Any]], label: str, default: float) -> float:
    level = find_level(levels, label)
    if not level:
        return round_measure(default, default)
    return round_measure(level["elevationM"], default)


def compute_route_metrics(route: dict[str, Any]) -> dict[str, Any]:
    level_lookup = {
        level["label"]: level["elevationM"]
        for level in route["levels"]
        if level["label"]
    }
    start_elevation = level_elevation(
        route["levels"],
        route["startLevel"],
        DEFAULT_START_LEVEL_ELEVATION_M,
    )

    total_length = 0.0
    total_vertical = 0.0
    current_elevation = start_elevation
    worst_los_index = -1
    computed_segments: list[dict[str, Any]] = []

    for index, segment in enumerate(route["segments"], start=1):
        length_m = round_measure(segment["lengthM"], 0.0)
        vertical_m = round_measure(segment["verticalM"], 0.0)
        target_level = segment["targetLevel"]
        if target_level and target_level in level_lookup:
            vertical_m = round_measure(level_lookup[target_level] - current_elevation, 0.0)

        start_segment_elevation = current_elevation
        end_segment_elevation = round_measure(current_elevation + vertical_m, 0.0)
        current_elevation = end_segment_elevation

        los = segment["los"]

        total_length = round_measure(total_length + length_m, 0.0)
        total_vertical = round_measure(total_vertical + vertical_m, 0.0)
        worst_los_index = max(worst_los_index, los_index(los))

        computed_segments.append(
            {
                "index": index,
                "kind": segment["kind"],
                "legacyLos": segment["legacyLos"],
                "startElevationM": start_segment_elevation,
                "endElevationM": end_segment_elevation,
                "lengthM": length_m,
                "verticalM": vertical_m,
                "pathLengthM": length_m,
                "travelTimeS": 0.0,
                "impedanceS": 0.0,
                "los": los,
                "flowPerMinPerM": 0.0,
                "effectiveWidthM": segment["effectiveWidthM"],
                "fixedDelayS": segment["fixedDelayS"],
                "queueDelayS": segment["queueDelayS"],
                "capacityFactor": segment["capacityFactor"],
                "weather": segment["weather"],
                "startMarker": segment["startMarker"],
                "midMarker": segment["midMarker"],
                "targetLevel": target_level,
            }
        )

    suggested_overall_los = LOS_LETTERS[worst_los_index] if worst_los_index >= 0 else ""
    return {
        "computedSegments": computed_segments,
        "startElevationM": start_elevation,
        "totalLengthM": total_length,
        "totalVerticalM": total_vertical,
        "totalTimeS": 0.0,
        "totalImpedanceS": 0.0,
        "finalElevationM": current_elevation,
        "overallLos": route["meta"]["overallLos"],
        "suggestedOverallLos": suggested_overall_los,
    }


def derive_flow_per_min_per_m(demand_ppm: float, width_m: float, capacity_factor: float) -> float:
    effective_width = round_measure(width_m * capacity_factor, 0.0)
    if effective_width <= 0:
        return 0.0
    return round_measure(demand_ppm / effective_width, 0.0)


def derive_los(kind: str, flow_per_min_per_m: float) -> str:
    thresholds = FLOW_THRESHOLDS_BY_KIND.get(kind, FLOW_THRESHOLDS_BY_KIND["walkway"])
    for index, threshold in enumerate(thresholds):
        if flow_per_min_per_m <= threshold:
            return LOS_LETTERS[index]
    return "F"


def derive_travel_time_seconds(kind: str, weather: str, path_length_m: float, vertical_m: float) -> float:
    speed_mps = derive_speed_mps(kind, weather, vertical_m)
    if speed_mps <= 0:
        return 0.0
    return path_length_m / speed_mps


def derive_speed_mps(kind: str, weather: str, vertical_m: float) -> float:
    base_speed = BASE_SPEED_BY_KIND.get(kind, BASE_SPEED_BY_KIND["walkway"])
    if kind == "stair":
        direction = "up" if vertical_m > 0 else "down"
        base_speed = STAIR_DIRECTION_SPEED[direction]
    weather_factor = WEATHER_SPEED_FACTORS.get(weather, 1.0)
    return round_measure(base_speed * weather_factor, 0.0)


def derive_vertical_effort_penalty(kind: str, vertical_m: float) -> float:
    if abs(vertical_m) <= 0.0005:
        return 0.0
    direction = "up" if vertical_m > 0 else "down"
    penalty_per_m = VERTICAL_PENALTY_PER_M.get(kind, VERTICAL_PENALTY_PER_M["walkway"])[direction]
    return round_measure(abs(vertical_m) * penalty_per_m, 0.0)


def derive_weather_impedance(weather: str, path_length_m: float) -> float:
    penalty_per_100m = WEATHER_IMPEDANCE_PER_100M.get(weather, 0.0)
    return round_measure((path_length_m / 100.0) * penalty_per_100m, 0.0)


def validate_route(route: dict[str, Any], metrics: dict[str, Any]) -> dict[str, list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    meta = route["meta"]
    if meta["xScale"] <= 0:
        errors.append("Horizontal scale must be greater than 0.")
    if meta["yScale"] <= 0:
        errors.append("Vertical scale must be greater than 0.")
    if meta["gridWidthM"] <= 0:
        errors.append("Grid width must be greater than 0.")
    if meta["gridHeightM"] <= 0:
        errors.append("Grid height must be greater than 0.")
    if meta["canvasPaddingX"] < 0:
        errors.append("Canvas padding X cannot be negative.")
    if meta["canvasPaddingTop"] < 0:
        errors.append("Canvas padding top cannot be negative.")
    if meta["canvasPaddingBottom"] < 0:
        errors.append("Canvas padding bottom cannot be negative.")
    if meta["canvasRatioPreset"] == "custom":
        if meta["canvasRatioWidth"] <= 0:
            errors.append("Custom canvas ratio width must be greater than 0.")
        if meta["canvasRatioHeight"] <= 0:
            errors.append("Custom canvas ratio height must be greater than 0.")

    labels_seen: set[str] = set()
    for index, level in enumerate(route["levels"], start=1):
        label = level["label"]
        if not label:
            errors.append(f"Level {index} is missing a label.")
            continue
        folded = label.casefold()
        if folded in labels_seen:
            errors.append(f"Level label '{label}' is duplicated.")
        labels_seen.add(folded)

    if not route["levels"]:
        errors.append("Add at least one level to choose a route start.")
    if not route["startLevel"]:
        errors.append("Choose a start level.")
    elif route["startLevel"].casefold() not in labels_seen:
        errors.append(f"Start level '{route['startLevel']}' does not match any defined level.")

    if not route["segments"]:
        errors.append("Add at least one route segment.")

    if route["segments"]:
        first_segment = route["segments"][0]
        if route["origin"]["type"] and first_segment["startMarker"] != "none":
            errors.append(
                "The first segment cannot have a separate start marker while an origin icon is selected."
            )
        if not route["origin"]["type"] and first_segment["startMarker"] == "none":
            errors.append("Choose an origin icon or set a start marker on the first segment.")

    level_lookup = {level["label"] for level in route["levels"] if level["label"]}
    for segment in metrics["computedSegments"]:
        if segment["lengthM"] <= 0:
            errors.append(f"Segment {segment['index']} must have a positive horizontal length.")
        if segment["weather"] not in WEATHER_TO_CODE:
            errors.append(f"Segment {segment['index']} has an unsupported weather option.")
        if segment["startMarker"] not in START_MARKER_TO_CODE:
            errors.append(f"Segment {segment['index']} has an unsupported start marker.")
        if segment["midMarker"] not in MID_MARKER_TO_CODE:
            errors.append(f"Segment {segment['index']} has an unsupported mid marker.")
        if segment["los"] not in LOS_TO_CODE:
            errors.append(f"Segment {segment['index']} has an unsupported LOS value.")
        if segment["targetLevel"] and segment["targetLevel"] not in level_lookup:
            errors.append(
                f"Segment {segment['index']} targets missing level '{segment['targetLevel']}'."
            )

    return {"errors": unique_messages(errors), "warnings": unique_messages(warnings)}


def legacy_comparison_warnings(route: dict[str, Any], metrics: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    manual_overall_los = route["meta"]["overallLos"]
    suggested_overall_los = metrics["suggestedOverallLos"]
    if suggested_overall_los and manual_overall_los != suggested_overall_los:
        warnings.append(
            f"Overall LOS is set to {manual_overall_los}, while the worst segment suggests {suggested_overall_los}."
        )
    return warnings


def renderer_compatibility_errors(route: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if len(route["segments"]) > RENDERER_MAX_SEGMENTS:
        errors.append(
            f"The legacy CSV/Processing export supports at most {RENDERER_MAX_SEGMENTS} segments per export."
        )
    return errors


def export_route_files(route: dict[str, Any]) -> dict[str, Any]:
    bundle = analyze_route(route)
    errors = (
        bundle["analysis"]["validation"]["errors"]
        + bundle["analysis"]["validation"]["rendererErrors"]
    )
    if errors:
        raise ExportValidationError(errors, bundle)

    csv_text = route_to_csv(bundle["route"], bundle["analysis"])
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    CSV_PATH.write_text(csv_text, encoding="utf-8", newline="\n")
    write_route_json(bundle["route"])

    return {
        "validation": bundle["analysis"]["validation"],
        "paths": {
            "json": relative_path(ROUTE_JSON_PATH),
            "csv": relative_path(CSV_PATH),
        },
        "bundle": bundle,
    }


def route_to_csv(route: dict[str, Any], analysis: dict[str, Any]) -> str:
    route_summary = route["computed"]
    rows: list[list[str]] = []
    rows.append(
        [
            "X-Y SCALE>>",
            format_number(route["meta"]["xScale"]),
            format_number(route["meta"]["yScale"]),
            format_number(route["meta"]["gridWidthM"]),
            format_number(route["meta"]["gridHeightM"]),
            "OVERALL LOS >>",
            str(LOS_TO_CODE[route["meta"]["overallLos"]]) if route["meta"]["overallLos"] else "0",
            boolean_flag(route["meta"]["showLegend"]),
            boolean_flag(route["meta"]["showOverallLos"]),
            "START LEVEL>>",
            route["startLevel"],
            format_number(
                level_elevation(route["levels"], route["startLevel"], DEFAULT_START_LEVEL_ELEVATION_M)
            ),
            "HV LABEL POS>>",
            route["meta"]["destinationMetricLabelPosition"],
            "CANVAS PAD>>",
            format_number(route["meta"]["canvasPaddingX"]),
            format_number(route["meta"]["canvasPaddingTop"]),
            format_number(route["meta"]["canvasPaddingBottom"]),
            "CANVAS RATIO>>",
            route["meta"]["canvasRatioPreset"],
            format_number(route["meta"]["canvasRatioWidth"]),
            format_number(route["meta"]["canvasRatioHeight"]),
        ]
    )

    computed_segments = analysis["segments"]
    for index in range(CSV_SEGMENT_ROWS):
        if index < len(computed_segments):
            segment = computed_segments[index]
            route_segment = route["segments"][index]
            if index == 0 and route["origin"]["type"]:
                start_code = ORIGIN_TO_CODE[route["origin"]["type"]]
            else:
                start_code = START_MARKER_TO_CODE[route_segment["startMarker"]]
            rows.append(
                [
                    str(index + 1),
                    format_number(segment["lengthM"] * route["meta"]["xScale"]),
                    format_number(segment["verticalM"] * route["meta"]["yScale"]),
                    str(WEATHER_TO_CODE[route_segment["weather"]]),
                    str(start_code),
                    str(MID_MARKER_TO_CODE[route_segment["midMarker"]]),
                    str(LOS_TO_CODE[route_segment["los"]]),
                ]
            )
        elif index == len(computed_segments):
            rows.append(
                [
                    str(index + 1),
                    "0",
                    "0",
                    "0",
                    str(ORIGIN_TO_CODE.get(route["destination"]["type"], 0)),
                    "0",
                    "0",
                ]
            )
        else:
            rows.append([str(index + 1), "0", "0", "0", "0", "0", "0"])

    rows.append(
        [
            "TOTAL>>",
            format_number(route_summary["totalLengthM"]),
            format_number(route_summary["totalVerticalM"]),
        ]
    )
    rows.append([level["label"] for level in route["levels"]])
    rows.append([format_number(level["elevationM"]) for level in route["levels"]])

    return "\n".join(",".join(row) for row in rows) + "\n"


def render_current_route(route: dict[str, Any] | None = None) -> dict[str, Any]:
    from svg_renderer import render_route_svg, svg_to_png

    bundle = analyze_route(route or load_route())
    errors = bundle["analysis"]["validation"]["errors"]
    if errors:
        raise ExportValidationError(errors, bundle)

    write_route_json(bundle["route"])
    TEMP_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    svg_text = render_route_svg(bundle["route"], bundle["analysis"], JLOS_DIR)
    TEMP_PREVIEW_SVG_PATH.write_text(svg_text, encoding="utf-8")

    renderer = "svg"
    fallback_reason = ""
    try:
        converter = svg_to_png(svg_text, TEMP_PREVIEW_PATH)
        renderer = f"svg/{converter}"
    except RuntimeError as error:
        fallback_reason = str(error)
        export_route_files(bundle["route"])
        processing_result = render_current_route_processing()
        renderer = "processing-fallback"
        return {
            **processing_result,
            "renderer": renderer,
            "fallbackReason": fallback_reason,
            "previewSvgPath": relative_path(TEMP_PREVIEW_SVG_PATH),
            "bundle": bundle,
        }

    return {
        "previewVersion": preview_version(),
        "stdout": "",
        "stderr": "",
        "renderer": renderer,
        "previewPath": relative_path(TEMP_PREVIEW_PATH),
        "previewSvgPath": relative_path(TEMP_PREVIEW_SVG_PATH),
        "preview": preview_state(),
        "bundle": bundle,
    }


def render_current_route_processing() -> dict[str, Any]:
    if not PROCESSING_EXE.exists():
        raise FileNotFoundError(f"Processing executable was not found at {PROCESSING_EXE}.")

    output_dir = PROJECT_ROOT / "tmp" / "editor-render"
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    TEMP_PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    staged_preview_path = output_dir / "sample_hires_preview.png"

    command = [
        str(PROCESSING_EXE),
        f"--sketch={JLOS_DIR}",
        f"--output={output_dir}",
        "--force",
        "--run",
        str(staged_preview_path),
    ]
    completed = subprocess.run(
        command,
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if completed.returncode != 0:
        raise RuntimeError((completed.stderr or completed.stdout or "Processing render failed.").strip())
    if not staged_preview_path.exists():
        raise FileNotFoundError("Processing render did not produce a preview image.")

    shutil.copy2(staged_preview_path, TEMP_PREVIEW_PATH)
    return {
        "previewVersion": preview_version(),
        "stdout": (completed.stdout or "").strip(),
        "stderr": (completed.stderr or "").strip(),
        "previewPath": relative_path(TEMP_PREVIEW_PATH),
        "preview": preview_state(),
    }


def download_preview_to_project() -> dict[str, Any]:
    if not TEMP_PREVIEW_PATH.exists():
        raise PreviewNotReadyError("No temporary preview is available. Render Diagram first.")

    PREVIEW_PATH.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(TEMP_PREVIEW_PATH, PREVIEW_PATH)
    TEMP_PREVIEW_PATH.unlink(missing_ok=True)
    if TEMP_PREVIEW_SVG_PATH.exists():
        shutil.copy2(TEMP_PREVIEW_SVG_PATH, PREVIEW_SVG_PATH)
        TEMP_PREVIEW_SVG_PATH.unlink(missing_ok=True)
    return preview_state()


def build_bootstrap(route: dict[str, Any] | None = None) -> dict[str, Any]:
    bundle = analyze_route(route or load_route())
    preview = preview_state()
    return {
        "route": bundle["route"],
        "analysis": bundle["analysis"],
        "options": build_options(),
        "previewVersion": preview["version"],
        "preview": preview,
        "files": {
            "json": relative_path(ROUTE_JSON_PATH),
            "csv": relative_path(CSV_PATH),
            "preview": relative_path(PREVIEW_PATH),
            "previewSvg": relative_path(PREVIEW_SVG_PATH),
        },
    }


def import_route_from_csv(csv_path: Path) -> dict[str, Any]:
    rows = read_csv_rows(csv_path)
    route = create_default_route()
    if not rows:
        return route

    scale_row = row_at(rows, 0)
    x_scale = parse_number(cell_at(scale_row, 1), DEFAULT_X_SCALE)
    y_scale = parse_number(cell_at(scale_row, 2), DEFAULT_Y_SCALE)
    route["meta"]["xScale"] = round_scale(x_scale, DEFAULT_X_SCALE)
    route["meta"]["yScale"] = round_scale(y_scale, DEFAULT_Y_SCALE)
    route["meta"]["gridWidthM"] = round_measure(cell_at(scale_row, 3), DEFAULT_GRID_WIDTH_M)
    route["meta"]["gridHeightM"] = round_measure(cell_at(scale_row, 4), DEFAULT_GRID_HEIGHT_M)
    route["meta"]["showLegend"] = csv_flag_enabled(cell_at(scale_row, 7), True)
    route["meta"]["showOverallLos"] = csv_flag_enabled(cell_at(scale_row, 8), True)
    route["meta"]["overallLos"] = normalize_los(los_from_code(cell_at(scale_row, 6)), DEFAULT_OVERALL_LOS)
    route["meta"]["legacyOverallLos"] = ""
    route["meta"]["destinationMetricLabelPosition"] = csv_destination_metric_label_position(scale_row)
    route["meta"]["canvasPaddingX"] = csv_canvas_padding_value(scale_row, 15, DEFAULT_CANVAS_PADDING_X)
    route["meta"]["canvasPaddingTop"] = csv_canvas_padding_value(scale_row, 16, DEFAULT_CANVAS_PADDING_TOP)
    route["meta"]["canvasPaddingBottom"] = csv_canvas_padding_value(
        scale_row,
        17,
        DEFAULT_CANVAS_PADDING_BOTTOM,
    )
    route["meta"].update(csv_canvas_ratio_values(scale_row))
    route["meta"]["routeName"] = "Imported Route"

    labels = row_at(rows, CSV_LEVEL_LABEL_ROW_INDEX)
    elevations = row_at(rows, CSV_LEVEL_ELEVATION_ROW_INDEX)
    imported_levels = []
    for index, label in enumerate(labels):
        cleaned_label = label.strip()
        if not cleaned_label:
            continue
        imported_levels.append(
            {
                "label": cleaned_label,
                "elevationM": round_measure(cell_at(elevations, index), 0.0),
            }
        )

    requested_start_level = ""
    if csv_has_explicit_start_level(scale_row):
        requested_start_level = cell_at(scale_row, 10)
        if requested_start_level:
            imported_levels = merge_level_into_levels(
                imported_levels,
                {
                    "label": requested_start_level,
                    "elevationM": round_measure(
                        cell_at(scale_row, 11),
                        DEFAULT_START_LEVEL_ELEVATION_M,
                    ),
                },
            )

    route["levels"] = imported_levels
    route["startLevel"] = resolve_start_level_label(imported_levels, requested_start_level)

    available_levels = route["levels"]
    cumulative_elevation = level_elevation(
        available_levels,
        route["startLevel"],
        DEFAULT_START_LEVEL_ELEVATION_M,
    )
    destination_code = 0
    segments = []
    for row_index in range(1, CSV_SEGMENT_ROWS + 1):
        cells = row_at(rows, row_index)
        length_px = parse_number(cell_at(cells, 1), 0.0)
        if length_px == 0:
            destination_code = parse_int(cell_at(cells, 4), 0)
            break

        vertical_px = parse_number(cell_at(cells, 2), 0.0)
        start_code = parse_int(cell_at(cells, 4), 0)
        length_m = length_px / x_scale if x_scale else 0.0
        vertical_m = vertical_px / y_scale if y_scale else 0.0
        cumulative_elevation = round_measure(cumulative_elevation + vertical_m, 0.0)

        if row_index == 1 and start_code in CODE_TO_ORIGIN:
            route["origin"]["type"] = CODE_TO_ORIGIN[start_code]
            start_marker = "none"
        else:
            start_marker = CODE_TO_START_MARKER.get(start_code, "none")

        target_level = match_level_label(available_levels, cumulative_elevation)
        segments.append(
            {
                "lengthM": round_measure(length_m, 0.0),
                "verticalM": round_measure(vertical_m, 0.0),
                "weather": CODE_TO_WEATHER.get(parse_int(cell_at(cells, 3), 1), "open"),
                "startMarker": start_marker,
                "midMarker": CODE_TO_MID_MARKER.get(parse_int(cell_at(cells, 5), 0), "none"),
                "los": normalize_los(los_from_code(cell_at(cells, 6)), DEFAULT_OVERALL_LOS),
                "legacyLos": "",
                "targetLevel": target_level or "",
            }
        )

    route["segments"] = segments
    route["destination"]["type"] = CODE_TO_ORIGIN.get(destination_code, "")
    return normalize_route(route)


def csv_flag_enabled(value: Any, default: bool) -> bool:
    default_flag = 1 if default else 0
    return parse_int(value, default_flag) != 0


def csv_has_explicit_start_level(scale_row: list[str]) -> bool:
    marker = cell_at(scale_row, 9).upper()
    return marker == "START LEVEL>>" or bool(cell_at(scale_row, 10) or cell_at(scale_row, 11))


def csv_destination_metric_label_position(scale_row: list[str]) -> str:
    marker = cell_at(scale_row, 12).upper()
    raw_value = cell_at(scale_row, 13)
    if marker != "HV LABEL POS>>" and not raw_value:
        return DEFAULT_DESTINATION_METRIC_LABEL_POSITION
    return normalize_destination_metric_label_position(
        raw_value,
        DEFAULT_DESTINATION_METRIC_LABEL_POSITION,
    )


def csv_canvas_padding_value(scale_row: list[str], value_index: int, default: float) -> float:
    marker = cell_at(scale_row, 14).upper()
    if marker != "CANVAS PAD>>":
        return default
    return round_measure(cell_at(scale_row, value_index), default)


def csv_canvas_ratio_values(scale_row: list[str]) -> dict[str, Any]:
    marker = cell_at(scale_row, 18).upper()
    if marker != "CANVAS RATIO>>":
        return {
            "canvasRatioPreset": DEFAULT_CANVAS_RATIO_PRESET,
            "canvasRatioWidth": DEFAULT_CANVAS_RATIO_WIDTH,
            "canvasRatioHeight": DEFAULT_CANVAS_RATIO_HEIGHT,
        }

    preset = normalize_canvas_ratio_preset(cell_at(scale_row, 19))
    default_width, default_height = canvas_ratio_dimensions_for_preset(preset)
    return {
        "canvasRatioPreset": preset,
        "canvasRatioWidth": round_measure(cell_at(scale_row, 20), default_width),
        "canvasRatioHeight": round_measure(cell_at(scale_row, 21), default_height),
    }


def read_csv_rows(csv_path: Path) -> list[list[str]]:
    if not csv_path.exists():
        return []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        return [row for row in csv.reader(handle)]


def row_at(rows: list[list[str]], index: int) -> list[str]:
    return rows[index] if 0 <= index < len(rows) else []


def cell_at(row: list[str], index: int) -> str:
    return row[index].strip() if 0 <= index < len(row) else ""


def parse_number(value: Any, default: float) -> float:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_int(value: Any, default: int) -> int:
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def normalize_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(int(value))
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False
    return default


def los_from_code(value: Any) -> str:
    code = parse_int(value, 0)
    if 1 <= code <= 6:
        return LOS_LETTERS[code - 1]
    return CODE_TO_LOS.get(code, "")


def los_index(letter: str) -> int:
    normalized = normalize_legacy_los(letter)
    if not normalized:
        return -1
    return LOS_LETTERS.index(normalized)


def match_level_label(levels: list[dict[str, Any]], elevation_m: float, tolerance: float = 0.01) -> str:
    for level in levels:
        if abs(level["elevationM"] - elevation_m) <= tolerance:
            return level["label"]
    return ""


def round_measure(value: Any, default: float) -> float:
    number = parse_number(value, default)
    rounded = round(number, 3)
    return 0.0 if abs(rounded) < 0.0005 else rounded


def round_scale(value: Any, default: float) -> float:
    number = parse_number(value, default)
    rounded = round(number, 9)
    return 0.0 if abs(rounded) < 0.0000005 else rounded


def format_number(value: float) -> str:
    rounded = round(float(value), 9)
    if abs(rounded) < 0.0000005:
        rounded = 0.0
    return f"{rounded:.9f}".rstrip("0").rstrip(".") or "0"


def boolean_flag(value: Any) -> str:
    return "1" if normalize_bool(value, True) else "0"


def preview_version() -> int:
    active_preview = active_preview_path()
    if active_preview is None:
        return 0
    return int(active_preview.stat().st_mtime_ns)


def active_preview_path() -> Path | None:
    if TEMP_PREVIEW_PATH.exists():
        return TEMP_PREVIEW_PATH
    if PREVIEW_PATH.exists():
        return PREVIEW_PATH
    return None


def preview_state() -> dict[str, Any]:
    active_preview = active_preview_path()
    return {
        "hasPreview": active_preview is not None,
        "version": int(active_preview.stat().st_mtime_ns) if active_preview is not None else 0,
        "isTemporary": active_preview == TEMP_PREVIEW_PATH,
        "downloadPath": relative_path(PREVIEW_PATH),
        "downloadSvgPath": relative_path(PREVIEW_SVG_PATH),
        "hasSvg": TEMP_PREVIEW_SVG_PATH.exists() or PREVIEW_SVG_PATH.exists(),
    }


def relative_path(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def unique_messages(messages: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for message in messages:
        if message and message not in seen:
            seen.add(message)
            unique.append(message)
    return unique
