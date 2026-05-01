export type Los = "A" | "B" | "C" | "D" | "E" | "F";
export type Weather = "open" | "sheltered" | "air_conditioned";
export type SegmentKind = "walkway" | "stair" | "escalator" | "queue" | "checkpoint";
export type CanvasRatioPreset = "auto" | "16:9" | "4:3" | "3:2" | "1:1" | "custom";
export type DestinationMetricLabelPosition = "right" | "above" | "below";

export interface OptionItem<T extends string = string> {
  value: T;
  label: string;
  code?: number;
}

export interface RouteMeta {
  routeName: string;
  xScale: number;
  yScale: number;
  gridWidthM: number;
  gridHeightM: number;
  showLegend: boolean;
  showOverallLos: boolean;
  overallLos: Los;
  legacyOverallLos: string;
  destinationMetricLabelPosition: DestinationMetricLabelPosition;
  canvasPaddingX: number;
  canvasPaddingTop: number;
  canvasPaddingBottom: number;
  canvasRatioPreset: CanvasRatioPreset;
  canvasRatioWidth: number;
  canvasRatioHeight: number;
}

export interface Scenario {
  name: string;
  standard: string;
  demandPpm: number;
  userProfile: string;
}

export interface Terminal {
  type: string;
}

export interface Level {
  label: string;
  elevationM: number;
}

export interface SegmentComputed {
  startElevationM: number;
  endElevationM: number;
  pathLengthM: number;
  travelTimeS: number;
  impedanceS: number;
  los: Los | "";
  flowPerMinPerM: number;
}

export interface RouteSegment {
  lengthM: number;
  verticalM: number;
  weather: Weather;
  startMarker: string;
  midMarker: string;
  targetLevel: string;
  los: Los;
  kind: SegmentKind;
  effectiveWidthM: number;
  fixedDelayS: number;
  queueDelayS: number;
  capacityFactor: number;
  legacyLos: string;
  computed: SegmentComputed;
}

export interface RouteComputed {
  totalLengthM: number;
  totalVerticalM: number;
  totalTimeS: number;
  totalImpedanceS: number;
  overallLos: Los | "";
  suggestedOverallLos: Los | "";
  assumptions: string[];
  warnings: string[];
}

export interface Route {
  version: number;
  meta: RouteMeta;
  scenario: Scenario;
  origin: Terminal;
  destination: Terminal;
  startLevel: string;
  levels: Level[];
  segments: RouteSegment[];
  computed: RouteComputed;
}

export interface ComputedSegment extends SegmentComputed {
  index: number;
  kind: SegmentKind;
  legacyLos: string;
  lengthM: number;
  verticalM: number;
  effectiveWidthM: number;
  fixedDelayS: number;
  queueDelayS: number;
  capacityFactor: number;
  weather: Weather;
  startMarker: string;
  midMarker: string;
  targetLevel: string;
  los: Los;
}

export interface ValidationState {
  errors: string[];
  warnings: string[];
  rendererErrors: string[];
  rendererWarnings: string[];
  canSave: boolean;
  canExport: boolean;
  canRender: boolean;
}

export interface Analysis {
  route: {
    totalLengthM: number;
    totalVerticalM: number;
    totalTimeS: number;
    totalImpedanceS: number;
    startElevationM: number;
    finalElevationM: number;
    segmentCount: number;
    overallLos: Los | "";
    suggestedOverallLos: Los | "";
  };
  segments: ComputedSegment[];
  assumptions: string[];
  warnings: string[];
  validation: ValidationState;
}

export interface AnalyzeResult {
  route: Route;
  analysis: Analysis;
}

export interface AppOptions {
  originTypes: OptionItem[];
  destinationTypes: OptionItem[];
  destinationMetricLabelPositions: OptionItem<DestinationMetricLabelPosition>[];
  startMarkers: OptionItem[];
  midMarkers: OptionItem[];
  weatherOptions: OptionItem<Weather>[];
  losOptions: OptionItem<Los>[];
  segmentKindOptions: OptionItem<SegmentKind>[];
  standards: OptionItem[];
  userProfiles: OptionItem[];
  renderer: { maxSegments: number };
}
