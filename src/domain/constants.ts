import type {
  AppOptions,
  CanvasRatioPreset,
  DestinationMetricLabelPosition,
  Los,
  OptionItem,
  SegmentKind,
  Weather,
} from "./types";

export const ROUTE_VERSION = 4;
export const ANALYSIS_STANDARD = "fruin_hcm_v1";
export const DEFAULT_USER_PROFILE = "standard_adult";
export const DEFAULT_SCENARIO_NAME = "Base Scenario";
export const DEFAULT_DEMAND_PPM = 25;
export const DEFAULT_X_SCALE = 1.333333333;
export const DEFAULT_Y_SCALE = 12.5;
export const DEFAULT_GRID_WIDTH_M = 75;
export const DEFAULT_GRID_HEIGHT_M = 4;
export const DEFAULT_START_LEVEL_LABEL = "GF";
export const DEFAULT_START_LEVEL_ELEVATION_M = 0;
export const DEFAULT_DESTINATION_METRIC_LABEL_POSITION: DestinationMetricLabelPosition = "right";
export const DEFAULT_CANVAS_PADDING_X = 140;
export const DEFAULT_CANVAS_PADDING_TOP = 60;
export const DEFAULT_CANVAS_PADDING_BOTTOM = 160;
export const DEFAULT_CANVAS_RATIO_PRESET: CanvasRatioPreset = "auto";
export const DEFAULT_CANVAS_RATIO_WIDTH = 16;
export const DEFAULT_CANVAS_RATIO_HEIGHT = 9;
export const RENDERER_MAX_SEGMENTS = 28;

export const LOS_LETTERS: Los[] = ["A", "B", "C", "D", "E", "F"];
export const DEFAULT_OVERALL_LOS: Los = "C";

export const CANVAS_RATIO_PRESET_DIMENSIONS: Record<CanvasRatioPreset, [number, number]> = {
  auto: [16, 9],
  "16:9": [16, 9],
  "4:3": [4, 3],
  "3:2": [3, 2],
  "1:1": [1, 1],
  custom: [16, 9],
};

export const ORIGIN_MARKER_OPTIONS: OptionItem[] = [
  { value: "metro", label: "Metro", code: 1 },
  { value: "bus", label: "Bus", code: 2 },
  { value: "brt", label: "BRT", code: 3 },
  { value: "coach", label: "Coach", code: 4 },
  { value: "rail", label: "Rail", code: 5 },
  { value: "evtol", label: "eVTOL", code: 6 },
  { value: "minibus", label: "Minibus", code: 7 },
  { value: "ferry", label: "Ferry", code: 8 },
  { value: "taxi", label: "Taxi", code: 9 },
  { value: "uber", label: "Uber", code: 10 },
  { value: "bike", label: "Bike", code: 11 },
  { value: "drop_off", label: "Drop-off", code: 12 },
  { value: "smart_car", label: "Smart Car", code: 13 },
];

export const SEGMENT_START_MARKER_OPTIONS: OptionItem[] = [
  { value: "none", label: "None", code: 0 },
  ...ORIGIN_MARKER_OPTIONS,
  { value: "bottleneck", label: "Bottleneck", code: 18 },
  { value: "turnstiles", label: "Turnstiles", code: 19 },
  { value: "ticketing", label: "Ticketing", code: 22 },
];

export const SEGMENT_MID_MARKER_OPTIONS: OptionItem[] = [
  { value: "none", label: "None", code: 0 },
  { value: "escalator_up", label: "Escalator Up", code: 14 },
  { value: "escalator_down", label: "Escalator Down", code: 15 },
  { value: "stair_up", label: "Stair Up", code: 16 },
  { value: "stair_down", label: "Stair Down", code: 17 },
  { value: "bottleneck", label: "Bottleneck", code: 18 },
  { value: "turnstiles", label: "Turnstiles", code: 19 },
  { value: "washroom", label: "Washroom", code: 20 },
  { value: "retail", label: "Retail", code: 21 },
  { value: "ticketing", label: "Ticketing", code: 22 },
  { value: "fnb", label: "F&B", code: 23 },
];

export const WEATHER_OPTIONS: OptionItem<Weather>[] = [
  { value: "open", label: "Open", code: 1 },
  { value: "sheltered", label: "Sheltered", code: 2 },
  { value: "air_conditioned", label: "Air-conditioned", code: 3 },
];

export const LOS_OPTIONS: OptionItem<Los>[] = [
  { value: "A", label: "A", code: 50 },
  { value: "B", label: "B", code: 51 },
  { value: "C", label: "C", code: 52 },
  { value: "D", label: "D", code: 53 },
  { value: "E", label: "E", code: 54 },
  { value: "F", label: "F", code: 55 },
];

export const DESTINATION_METRIC_LABEL_POSITION_OPTIONS: OptionItem<DestinationMetricLabelPosition>[] = [
  { value: "right", label: "Right" },
  { value: "above", label: "Above" },
  { value: "below", label: "Below" },
];

export const SEGMENT_KIND_OPTIONS: OptionItem<SegmentKind>[] = [
  { value: "walkway", label: "Walkway" },
  { value: "stair", label: "Stair" },
  { value: "escalator", label: "Escalator" },
  { value: "queue", label: "Queue" },
  { value: "checkpoint", label: "Checkpoint" },
];

export const STANDARD_OPTIONS: OptionItem[] = [{ value: ANALYSIS_STANDARD, label: "Fruin / HCM v1" }];
export const USER_PROFILE_OPTIONS: OptionItem[] = [{ value: DEFAULT_USER_PROFILE, label: "Standard Adult" }];

export const DEFAULT_EFFECTIVE_WIDTH_BY_KIND: Record<SegmentKind, number> = {
  walkway: 3,
  stair: 1.8,
  escalator: 1,
  queue: 2.2,
  checkpoint: 1.8,
};

export const MARKER_TO_INFERRED_KIND: Record<string, SegmentKind> = {
  escalator_up: "escalator",
  escalator_down: "escalator",
  stair_up: "stair",
  stair_down: "stair",
  bottleneck: "queue",
  turnstiles: "checkpoint",
  ticketing: "checkpoint",
};

export const CODE_MAPS = {
  originToCode: Object.fromEntries(ORIGIN_MARKER_OPTIONS.map((item) => [item.value, item.code ?? 0])),
  startMarkerToCode: Object.fromEntries(SEGMENT_START_MARKER_OPTIONS.map((item) => [item.value, item.code ?? 0])),
  midMarkerToCode: Object.fromEntries(SEGMENT_MID_MARKER_OPTIONS.map((item) => [item.value, item.code ?? 0])),
  weatherToCode: Object.fromEntries(WEATHER_OPTIONS.map((item) => [item.value, item.code ?? 0])),
  losToCode: Object.fromEntries(LOS_OPTIONS.map((item) => [item.value, item.code ?? 0])),
};

export function buildOptions(): AppOptions {
  return {
    originTypes: ORIGIN_MARKER_OPTIONS,
    destinationTypes: ORIGIN_MARKER_OPTIONS,
    destinationMetricLabelPositions: DESTINATION_METRIC_LABEL_POSITION_OPTIONS,
    startMarkers: SEGMENT_START_MARKER_OPTIONS,
    midMarkers: SEGMENT_MID_MARKER_OPTIONS,
    weatherOptions: WEATHER_OPTIONS,
    losOptions: LOS_OPTIONS,
    segmentKindOptions: SEGMENT_KIND_OPTIONS,
    standards: STANDARD_OPTIONS,
    userProfiles: USER_PROFILE_OPTIONS,
    renderer: { maxSegments: RENDERER_MAX_SEGMENTS },
  };
}
