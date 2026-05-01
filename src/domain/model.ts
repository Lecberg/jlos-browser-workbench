import {
  ANALYSIS_STANDARD,
  buildOptions,
  CANVAS_RATIO_PRESET_DIMENSIONS,
  CODE_MAPS,
  DEFAULT_CANVAS_PADDING_BOTTOM,
  DEFAULT_CANVAS_PADDING_TOP,
  DEFAULT_CANVAS_PADDING_X,
  DEFAULT_CANVAS_RATIO_HEIGHT,
  DEFAULT_CANVAS_RATIO_PRESET,
  DEFAULT_CANVAS_RATIO_WIDTH,
  DEFAULT_DEMAND_PPM,
  DEFAULT_DESTINATION_METRIC_LABEL_POSITION,
  DEFAULT_EFFECTIVE_WIDTH_BY_KIND,
  DEFAULT_GRID_HEIGHT_M,
  DEFAULT_GRID_WIDTH_M,
  DEFAULT_OVERALL_LOS,
  DEFAULT_SCENARIO_NAME,
  DEFAULT_START_LEVEL_ELEVATION_M,
  DEFAULT_START_LEVEL_LABEL,
  DEFAULT_USER_PROFILE,
  DEFAULT_X_SCALE,
  DEFAULT_Y_SCALE,
  LOS_LETTERS,
  MARKER_TO_INFERRED_KIND,
  ORIGIN_MARKER_OPTIONS,
  RENDERER_MAX_SEGMENTS,
  ROUTE_VERSION,
  SEGMENT_KIND_OPTIONS,
  SEGMENT_MID_MARKER_OPTIONS,
  SEGMENT_START_MARKER_OPTIONS,
  WEATHER_OPTIONS,
} from "./constants";
import type {
  Analysis,
  AnalyzeResult,
  CanvasRatioPreset,
  ComputedSegment,
  DestinationMetricLabelPosition,
  Level,
  Los,
  Route,
  RouteSegment,
  SegmentComputed,
  SegmentKind,
  ValidationState,
  Weather,
} from "./types";

const ORIGIN_VALUES = new Set(ORIGIN_MARKER_OPTIONS.map((item) => item.value));
const START_MARKER_VALUES = new Set(SEGMENT_START_MARKER_OPTIONS.map((item) => item.value));
const MID_MARKER_VALUES = new Set(SEGMENT_MID_MARKER_OPTIONS.map((item) => item.value));
const WEATHER_VALUES = new Set(WEATHER_OPTIONS.map((item) => item.value));
const SEGMENT_KIND_VALUES = new Set(SEGMENT_KIND_OPTIONS.map((item) => item.value));

export { buildOptions };

export function createDefaultRoute(): Route {
  return {
    version: ROUTE_VERSION,
    meta: {
      routeName: "New Route",
      xScale: DEFAULT_X_SCALE,
      yScale: DEFAULT_Y_SCALE,
      gridWidthM: DEFAULT_GRID_WIDTH_M,
      gridHeightM: DEFAULT_GRID_HEIGHT_M,
      showLegend: true,
      showOverallLos: true,
      overallLos: DEFAULT_OVERALL_LOS,
      legacyOverallLos: "",
      destinationMetricLabelPosition: DEFAULT_DESTINATION_METRIC_LABEL_POSITION,
      canvasPaddingX: DEFAULT_CANVAS_PADDING_X,
      canvasPaddingTop: DEFAULT_CANVAS_PADDING_TOP,
      canvasPaddingBottom: DEFAULT_CANVAS_PADDING_BOTTOM,
      canvasRatioPreset: DEFAULT_CANVAS_RATIO_PRESET,
      canvasRatioWidth: DEFAULT_CANVAS_RATIO_WIDTH,
      canvasRatioHeight: DEFAULT_CANVAS_RATIO_HEIGHT,
    },
    scenario: {
      name: DEFAULT_SCENARIO_NAME,
      standard: ANALYSIS_STANDARD,
      demandPpm: DEFAULT_DEMAND_PPM,
      userProfile: DEFAULT_USER_PROFILE,
    },
    origin: { type: "" },
    destination: { type: "" },
    startLevel: DEFAULT_START_LEVEL_LABEL,
    levels: [
      { label: DEFAULT_START_LEVEL_LABEL, elevationM: DEFAULT_START_LEVEL_ELEVATION_M },
      { label: "L1", elevationM: 13 },
    ],
    segments: [],
    computed: emptyRouteComputed(),
  };
}

export function emptyRouteComputed() {
  return {
    totalLengthM: 0,
    totalVerticalM: 0,
    totalTimeS: 0,
    totalImpedanceS: 0,
    overallLos: "" as Los | "",
    suggestedOverallLos: "" as Los | "",
    assumptions: [],
    warnings: [],
  };
}

export function emptySegmentComputed(): SegmentComputed {
  return {
    startElevationM: 0,
    endElevationM: 0,
    pathLengthM: 0,
    travelTimeS: 0,
    impedanceS: 0,
    los: "",
    flowPerMinPerM: 0,
  };
}

export function defaultSegment(): RouteSegment {
  return {
    lengthM: 10,
    verticalM: 0,
    weather: "open",
    startMarker: "none",
    midMarker: "none",
    targetLevel: "",
    los: "C",
    kind: "walkway",
    effectiveWidthM: 3,
    fixedDelayS: 0,
    queueDelayS: 0,
    capacityFactor: 1,
    legacyLos: "",
    computed: emptySegmentComputed(),
  };
}

export function analyzeRoute(input: unknown): AnalyzeResult {
  const route = normalizeRoute(input);
  const metrics = computeRouteMetrics(route);
  const validation = validateRoute(route, metrics);
  const warnings = uniqueMessages([...validation.warnings, ...legacyComparisonWarnings(route, metrics)]);
  const rendererErrors = rendererCompatibilityErrors(route);

  route.computed = {
    totalLengthM: metrics.totalLengthM,
    totalVerticalM: metrics.totalVerticalM,
    totalTimeS: metrics.totalTimeS,
    totalImpedanceS: metrics.totalImpedanceS,
    overallLos: route.meta.overallLos,
    suggestedOverallLos: metrics.suggestedOverallLos,
    assumptions: [],
    warnings,
  };

  route.segments.forEach((segment, index) => {
    const computed = metrics.computedSegments[index];
    if (!computed) return;
    segment.computed = {
      startElevationM: computed.startElevationM,
      endElevationM: computed.endElevationM,
      pathLengthM: computed.pathLengthM,
      travelTimeS: computed.travelTimeS,
      impedanceS: computed.impedanceS,
      los: computed.los,
      flowPerMinPerM: computed.flowPerMinPerM,
    };
    segment.verticalM = computed.verticalM;
  });

  const analysis: Analysis = {
    route: {
      totalLengthM: metrics.totalLengthM,
      totalVerticalM: metrics.totalVerticalM,
      totalTimeS: metrics.totalTimeS,
      totalImpedanceS: metrics.totalImpedanceS,
      startElevationM: metrics.startElevationM,
      finalElevationM: metrics.finalElevationM,
      segmentCount: route.segments.length,
      overallLos: route.meta.overallLos,
      suggestedOverallLos: metrics.suggestedOverallLos,
    },
    segments: metrics.computedSegments,
    assumptions: [],
    warnings,
    validation: {
      errors: uniqueMessages(validation.errors),
      warnings,
      rendererErrors,
      rendererWarnings: [],
      canSave: true,
      canExport: validation.errors.length === 0 && rendererErrors.length === 0,
      canRender: validation.errors.length === 0,
    },
  };

  return { route, analysis };
}

export function normalizeRoute(input: unknown): Route {
  const raw = isRecord(input) ? input : {};
  const fallback = createDefaultRoute();
  const meta = isRecord(raw.meta) ? raw.meta : {};
  const scenario = isRecord(raw.scenario) ? raw.scenario : {};
  const origin = isRecord(raw.origin) ? raw.origin : {};
  const destination = isRecord(raw.destination) ? raw.destination : {};
  const levels = Array.isArray(raw.levels)
    ? raw.levels.filter(isRecord).map(normalizeLevel)
    : fallback.levels;
  const [startLevel, normalizedLevels] = normalizeStartLevelSelection(raw.startLevel, levels);
  const overallLos = normalizeLos(meta.overallLos ?? meta.legacyOverallLos, DEFAULT_OVERALL_LOS);
  const canvasRatio = normalizeCanvasRatioMeta(meta);

  return {
    version: ROUTE_VERSION,
    meta: {
      routeName: String(meta.routeName || fallback.meta.routeName).trim() || fallback.meta.routeName,
      xScale: roundScale(meta.xScale, DEFAULT_X_SCALE),
      yScale: roundScale(meta.yScale, DEFAULT_Y_SCALE),
      gridWidthM: roundMeasure(meta.gridWidthM, DEFAULT_GRID_WIDTH_M),
      gridHeightM: roundMeasure(meta.gridHeightM, DEFAULT_GRID_HEIGHT_M),
      showLegend: normalizeBoolean(meta.showLegend, true),
      showOverallLos: normalizeBoolean(meta.showOverallLos, true),
      overallLos,
      legacyOverallLos: normalizeLegacyLos(meta.legacyOverallLos),
      destinationMetricLabelPosition: normalizeDestinationMetricLabelPosition(
        meta.destinationMetricLabelPosition,
        DEFAULT_DESTINATION_METRIC_LABEL_POSITION,
      ),
      canvasPaddingX: roundMeasure(meta.canvasPaddingX, DEFAULT_CANVAS_PADDING_X),
      canvasPaddingTop: roundMeasure(meta.canvasPaddingTop, DEFAULT_CANVAS_PADDING_TOP),
      canvasPaddingBottom: roundMeasure(meta.canvasPaddingBottom, DEFAULT_CANVAS_PADDING_BOTTOM),
      ...canvasRatio,
    },
    scenario: {
      name: String(scenario.name || DEFAULT_SCENARIO_NAME).trim() || DEFAULT_SCENARIO_NAME,
      standard: String(scenario.standard || ANALYSIS_STANDARD).trim() || ANALYSIS_STANDARD,
      demandPpm: roundMeasure(scenario.demandPpm, DEFAULT_DEMAND_PPM),
      userProfile: String(scenario.userProfile || DEFAULT_USER_PROFILE).trim() || DEFAULT_USER_PROFILE,
    },
    origin: { type: normalizeOriginType(origin.type) },
    destination: { type: normalizeOriginType(destination.type) },
    startLevel,
    levels: normalizedLevels,
    segments: Array.isArray(raw.segments)
      ? raw.segments.filter(isRecord).map((segment) => normalizeSegment(segment))
      : [],
    computed: emptyRouteComputed(),
  };
}

export function routeToCsv(routeInput: unknown, analysisInput?: Analysis): string {
  const { route, analysis } = analysisInput ? { route: normalizeRoute(routeInput), analysis: analysisInput } : analyzeRoute(routeInput);
  const rows: string[][] = [];
  rows.push([
    "X-Y SCALE>>",
    formatNumber(route.meta.xScale),
    formatNumber(route.meta.yScale),
    formatNumber(route.meta.gridWidthM),
    formatNumber(route.meta.gridHeightM),
    "OVERALL LOS >>",
    String(CODE_MAPS.losToCode[route.meta.overallLos] ?? 0),
    booleanFlag(route.meta.showLegend),
    booleanFlag(route.meta.showOverallLos),
    "START LEVEL>>",
    route.startLevel,
    formatNumber(levelElevation(route.levels, route.startLevel, DEFAULT_START_LEVEL_ELEVATION_M)),
    "HV LABEL POS>>",
    route.meta.destinationMetricLabelPosition,
    "CANVAS PAD>>",
    formatNumber(route.meta.canvasPaddingX),
    formatNumber(route.meta.canvasPaddingTop),
    formatNumber(route.meta.canvasPaddingBottom),
    "CANVAS RATIO>>",
    route.meta.canvasRatioPreset,
    formatNumber(route.meta.canvasRatioWidth),
    formatNumber(route.meta.canvasRatioHeight),
  ]);

  for (let index = 0; index < 29; index += 1) {
    const computed = analysis.segments[index];
    if (computed) {
      const segment = route.segments[index];
      const startCode = index === 0 && route.origin.type
        ? CODE_MAPS.originToCode[route.origin.type]
        : CODE_MAPS.startMarkerToCode[segment.startMarker];
      rows.push([
        String(index + 1),
        formatNumber(computed.lengthM * route.meta.xScale),
        formatNumber(computed.verticalM * route.meta.yScale),
        String(CODE_MAPS.weatherToCode[segment.weather] ?? 0),
        String(startCode ?? 0),
        String(CODE_MAPS.midMarkerToCode[segment.midMarker] ?? 0),
        String(CODE_MAPS.losToCode[segment.los] ?? 0),
      ]);
    } else if (index === analysis.segments.length) {
      rows.push([String(index + 1), "0", "0", "0", String(CODE_MAPS.originToCode[route.destination.type] ?? 0), "0", "0"]);
    } else {
      rows.push([String(index + 1), "0", "0", "0", "0", "0", "0"]);
    }
  }

  rows.push(["TOTAL>>", formatNumber(route.computed.totalLengthM), formatNumber(route.computed.totalVerticalM)]);
  rows.push(route.levels.map((level) => level.label));
  rows.push(route.levels.map((level) => formatNumber(level.elevationM)));
  return `${rows.map((row) => row.join(",")).join("\n")}\n`;
}

interface Metrics {
  computedSegments: ComputedSegment[];
  startElevationM: number;
  totalLengthM: number;
  totalVerticalM: number;
  totalTimeS: number;
  totalImpedanceS: number;
  finalElevationM: number;
  overallLos: Los;
  suggestedOverallLos: Los | "";
}

function computeRouteMetrics(route: Route): Metrics {
  const levelLookup = new Map(route.levels.filter((level) => level.label).map((level) => [level.label, level.elevationM]));
  const startElevation = levelElevation(route.levels, route.startLevel, DEFAULT_START_LEVEL_ELEVATION_M);
  let totalLength = 0;
  let totalVertical = 0;
  let totalTime = 0;
  let totalImpedance = 0;
  let currentElevation = startElevation;
  let worstLosIndex = -1;
  const computedSegments: ComputedSegment[] = [];

  route.segments.forEach((segment, segmentIndex) => {
    const index = segmentIndex + 1;
    const lengthM = roundMeasure(segment.lengthM, 0);
    let verticalM = roundMeasure(segment.verticalM, 0);
    if (segment.targetLevel && levelLookup.has(segment.targetLevel)) {
      verticalM = roundMeasure((levelLookup.get(segment.targetLevel) ?? currentElevation) - currentElevation, 0);
    }

    const startSegmentElevation = currentElevation;
    const endSegmentElevation = roundMeasure(currentElevation + verticalM, 0);
    currentElevation = endSegmentElevation;

    const pathLengthM = roundMeasure(Math.hypot(lengthM, verticalM), lengthM);
    const flowPerMinPerM = deriveFlowPerMinPerM(route.scenario.demandPpm, segment.effectiveWidthM, segment.capacityFactor);
    const derivedTime = deriveTravelTimeSeconds(segment.kind, segment.weather, pathLengthM, verticalM);
    const travelTimeS = roundMeasure(derivedTime + segment.fixedDelayS + segment.queueDelayS, 0);
    const impedanceS = roundMeasure(
      travelTimeS + deriveVerticalEffortPenalty(segment.kind, verticalM) + deriveWeatherImpedance(segment.weather, pathLengthM),
      0,
    );

    totalLength = roundMeasure(totalLength + lengthM, 0);
    totalVertical = roundMeasure(totalVertical + verticalM, 0);
    totalTime = roundMeasure(totalTime + travelTimeS, 0);
    totalImpedance = roundMeasure(totalImpedance + impedanceS, 0);
    worstLosIndex = Math.max(worstLosIndex, losIndex(segment.los));

    computedSegments.push({
      index,
      kind: segment.kind,
      legacyLos: segment.legacyLos,
      startElevationM: startSegmentElevation,
      endElevationM: endSegmentElevation,
      lengthM,
      verticalM,
      pathLengthM,
      travelTimeS,
      impedanceS,
      los: segment.los,
      flowPerMinPerM,
      effectiveWidthM: segment.effectiveWidthM,
      fixedDelayS: segment.fixedDelayS,
      queueDelayS: segment.queueDelayS,
      capacityFactor: segment.capacityFactor,
      weather: segment.weather,
      startMarker: segment.startMarker,
      midMarker: segment.midMarker,
      targetLevel: segment.targetLevel,
    });
  });

  return {
    computedSegments,
    startElevationM: startElevation,
    totalLengthM: totalLength,
    totalVerticalM: totalVertical,
    totalTimeS: totalTime,
    totalImpedanceS: totalImpedance,
    finalElevationM: currentElevation,
    overallLos: route.meta.overallLos,
    suggestedOverallLos: worstLosIndex >= 0 ? LOS_LETTERS[worstLosIndex] : "",
  };
}

function validateRoute(route: Route, metrics: Metrics): Pick<ValidationState, "errors" | "warnings"> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const meta = route.meta;

  if (meta.xScale <= 0) errors.push("Horizontal scale must be greater than 0.");
  if (meta.yScale <= 0) errors.push("Vertical scale must be greater than 0.");
  if (meta.gridWidthM <= 0) errors.push("Grid width must be greater than 0.");
  if (meta.gridHeightM <= 0) errors.push("Grid height must be greater than 0.");
  if (meta.canvasPaddingX < 0) errors.push("Canvas padding X cannot be negative.");
  if (meta.canvasPaddingTop < 0) errors.push("Canvas padding top cannot be negative.");
  if (meta.canvasPaddingBottom < 0) errors.push("Canvas padding bottom cannot be negative.");
  if (meta.canvasRatioPreset === "custom") {
    if (meta.canvasRatioWidth <= 0) errors.push("Custom canvas ratio width must be greater than 0.");
    if (meta.canvasRatioHeight <= 0) errors.push("Custom canvas ratio height must be greater than 0.");
  }

  const labelsSeen = new Set<string>();
  route.levels.forEach((level, index) => {
    if (!level.label) {
      errors.push(`Level ${index + 1} is missing a label.`);
      return;
    }
    const folded = level.label.toLowerCase();
    if (labelsSeen.has(folded)) errors.push(`Level label '${level.label}' is duplicated.`);
    labelsSeen.add(folded);
  });

  if (!route.levels.length) errors.push("Add at least one level to choose a route start.");
  if (!route.startLevel) errors.push("Choose a start level.");
  else if (!labelsSeen.has(route.startLevel.toLowerCase())) errors.push(`Start level '${route.startLevel}' does not match any defined level.`);
  if (!route.segments.length) errors.push("Add at least one route segment.");

  if (route.segments.length) {
    const firstSegment = route.segments[0];
    if (route.origin.type && firstSegment.startMarker !== "none") {
      errors.push("The first segment cannot have a separate start marker while an origin icon is selected.");
    }
    if (!route.origin.type && firstSegment.startMarker === "none") {
      errors.push("Choose an origin icon or set a start marker on the first segment.");
    }
  }

  const levelLookup = new Set(route.levels.filter((level) => level.label).map((level) => level.label));
  metrics.computedSegments.forEach((segment) => {
    if (segment.lengthM <= 0) errors.push(`Segment ${segment.index} must have a positive horizontal length.`);
    if (!WEATHER_VALUES.has(segment.weather)) errors.push(`Segment ${segment.index} has an unsupported weather option.`);
    if (!START_MARKER_VALUES.has(segment.startMarker)) errors.push(`Segment ${segment.index} has an unsupported start marker.`);
    if (!MID_MARKER_VALUES.has(segment.midMarker)) errors.push(`Segment ${segment.index} has an unsupported mid marker.`);
    if (losIndex(segment.los) < 0) errors.push(`Segment ${segment.index} has an unsupported LOS value.`);
    if (segment.targetLevel && !levelLookup.has(segment.targetLevel)) errors.push(`Segment ${segment.index} targets missing level '${segment.targetLevel}'.`);
  });

  return { errors: uniqueMessages(errors), warnings: uniqueMessages(warnings) };
}

function normalizeLevel(value: Record<string, unknown>): Level {
  return {
    label: String(value.label || "").trim(),
    elevationM: roundMeasure(value.elevationM, 0),
  };
}

function normalizeSegment(value: Record<string, unknown>): RouteSegment {
  const startMarker = normalizeMarker(value.startMarker, START_MARKER_VALUES, "none");
  const midMarker = normalizeMarker(value.midMarker, MID_MARKER_VALUES, "none");
  const rawKind = String(value.kind || "").trim().toLowerCase();
  const kind = SEGMENT_KIND_VALUES.has(rawKind as SegmentKind) ? (rawKind as SegmentKind) : inferSegmentKind(startMarker, midMarker);
  return {
    lengthM: roundMeasure(value.lengthM, 0),
    verticalM: roundMeasure(value.verticalM, 0),
    weather: normalizeWeather(value.weather, "open"),
    startMarker,
    midMarker,
    targetLevel: String(value.targetLevel || "").trim(),
    los: normalizeLos(value.los ?? value.legacyLos, DEFAULT_OVERALL_LOS),
    kind,
    effectiveWidthM: roundMeasure(value.effectiveWidthM, DEFAULT_EFFECTIVE_WIDTH_BY_KIND[kind]),
    fixedDelayS: roundMeasure(value.fixedDelayS, 0),
    queueDelayS: roundMeasure(value.queueDelayS, 0),
    capacityFactor: roundMeasure(value.capacityFactor, 1),
    legacyLos: normalizeLegacyLos(value.legacyLos),
    computed: emptySegmentComputed(),
  };
}

function inferSegmentKind(startMarker: string, midMarker: string): SegmentKind {
  return MARKER_TO_INFERRED_KIND[midMarker] || MARKER_TO_INFERRED_KIND[startMarker] || "walkway";
}

function normalizeStartLevelSelection(input: unknown, levels: Level[]): [string, Level[]] {
  const normalizedLevels = [...levels];
  if (isRecord(input) && ("label" in input || "elevationM" in input)) {
    const legacyLevel = normalizeLevel(input);
    const merged = mergeLevelIntoLevels(normalizedLevels, legacyLevel);
    return [resolveStartLevelLabel(merged, legacyLevel.label), merged];
  }
  return [resolveStartLevelLabel(normalizedLevels, String(input || "").trim()), normalizedLevels];
}

function normalizeCanvasRatioMeta(meta: Record<string, unknown>) {
  const preset = normalizeCanvasRatioPreset(meta.canvasRatioPreset);
  const [defaultWidth, defaultHeight] = CANVAS_RATIO_PRESET_DIMENSIONS[preset];
  if (preset === "custom") {
    return {
      canvasRatioPreset: preset,
      canvasRatioWidth: roundMeasure(meta.canvasRatioWidth, defaultWidth),
      canvasRatioHeight: roundMeasure(meta.canvasRatioHeight, defaultHeight),
    };
  }
  return {
    canvasRatioPreset: preset,
    canvasRatioWidth: defaultWidth,
    canvasRatioHeight: defaultHeight,
  };
}

function resolveStartLevelLabel(levels: Level[], requestedLabel: string): string {
  const requested = requestedLabel.trim();
  if (requested) {
    const existing = findLevel(levels, requested);
    if (existing) return existing.label;
  }
  return inferStartLevelLabel(levels);
}

function inferStartLevelLabel(levels: Level[]): string {
  return levels.find((level) => level.label && Math.abs(level.elevationM - DEFAULT_START_LEVEL_ELEVATION_M) <= 0.01)?.label
    || levels.find((level) => level.label)?.label
    || "";
}

function mergeLevelIntoLevels(levels: Level[], levelToMerge: Level): Level[] {
  const label = levelToMerge.label.trim();
  if (!label) return [...levels];
  const copy = levels.map((level) => ({ ...level }));
  const index = copy.findIndex((level) => level.label.toLowerCase() === label.toLowerCase());
  if (index >= 0) copy[index] = levelToMerge;
  else copy.unshift(levelToMerge);
  return copy;
}

function findLevel(levels: Level[], label: string): Level | undefined {
  const normalized = label.trim().toLowerCase();
  return levels.find((level) => level.label.toLowerCase() === normalized);
}

function levelElevation(levels: Level[], label: string, fallback: number): number {
  return roundMeasure(findLevel(levels, label)?.elevationM, fallback);
}

function normalizeOriginType(input: unknown): string {
  const value = String(input || "").trim();
  return ORIGIN_VALUES.has(value) ? value : "";
}

function normalizeMarker(input: unknown, allowed: Set<string>, fallback: string): string {
  const value = String(input || "").trim();
  return allowed.has(value) ? value : fallback;
}

function normalizeWeather(input: unknown, fallback: Weather): Weather {
  const value = String(input || "").trim();
  return WEATHER_VALUES.has(value as Weather) ? (value as Weather) : fallback;
}

function normalizeLegacyLos(input: unknown): Los | "" {
  if (typeof input === "string") {
    const value = input.trim().toUpperCase();
    if (LOS_LETTERS.includes(value as Los)) return value as Los;
  }
  const numeric = Number(input);
  if (Number.isFinite(numeric)) {
    if (numeric >= 1 && numeric <= 6) return LOS_LETTERS[Math.trunc(numeric) - 1];
    const found = Object.entries(CODE_MAPS.losToCode).find(([, code]) => Number(code) === numeric)?.[0];
    if (found && LOS_LETTERS.includes(found as Los)) return found as Los;
  }
  return "";
}

function normalizeLos(input: unknown, fallback: Los): Los {
  return normalizeLegacyLos(input) || fallback;
}

function normalizeDestinationMetricLabelPosition(input: unknown, fallback: DestinationMetricLabelPosition): DestinationMetricLabelPosition {
  const value = String(input || "").trim().toLowerCase();
  return value === "right" || value === "above" || value === "below" ? value : fallback;
}

function normalizeCanvasRatioPreset(input: unknown): CanvasRatioPreset {
  const value = String(input || "").trim().toLowerCase();
  return value in CANVAS_RATIO_PRESET_DIMENSIONS ? (value as CanvasRatioPreset) : DEFAULT_CANVAS_RATIO_PRESET;
}

function legacyComparisonWarnings(route: Route, metrics: Metrics): string[] {
  if (metrics.suggestedOverallLos && route.meta.overallLos !== metrics.suggestedOverallLos) {
    return [`Overall LOS is set to ${route.meta.overallLos}, while the worst segment suggests ${metrics.suggestedOverallLos}.`];
  }
  return [];
}

function rendererCompatibilityErrors(route: Route): string[] {
  return route.segments.length > RENDERER_MAX_SEGMENTS
    ? [`The legacy CSV export supports at most ${RENDERER_MAX_SEGMENTS} segments per export.`]
    : [];
}

function deriveFlowPerMinPerM(demandPpm: number, widthM: number, capacityFactor: number): number {
  const effectiveWidth = roundMeasure(widthM * capacityFactor, 0);
  return effectiveWidth <= 0 ? 0 : roundMeasure(demandPpm / effectiveWidth, 0);
}

function deriveTravelTimeSeconds(kind: SegmentKind, weather: Weather, pathLengthM: number, verticalM: number): number {
  const speedMps = deriveSpeedMps(kind, weather, verticalM);
  return speedMps <= 0 ? 0 : pathLengthM / speedMps;
}

function deriveSpeedMps(kind: SegmentKind, weather: Weather, verticalM: number): number {
  const baseByKind: Record<SegmentKind, number> = { walkway: 1.4, stair: verticalM > 0 ? 0.65 : 0.75, escalator: 0.9, queue: 0.8, checkpoint: 0.75 };
  const weatherFactor: Record<Weather, number> = { open: 0.97, sheltered: 1, air_conditioned: 1.02 };
  return roundMeasure(baseByKind[kind] * weatherFactor[weather], 0);
}

function deriveVerticalEffortPenalty(kind: SegmentKind, verticalM: number): number {
  if (Math.abs(verticalM) <= 0.0005) return 0;
  const up = verticalM > 0;
  const penalty: Record<SegmentKind, [number, number]> = {
    walkway: [8, 3],
    stair: [10, 4],
    escalator: [4, 1],
    queue: [8, 3],
    checkpoint: [6, 2],
  };
  return roundMeasure(Math.abs(verticalM) * (up ? penalty[kind][0] : penalty[kind][1]), 0);
}

function deriveWeatherImpedance(weather: Weather, pathLengthM: number): number {
  const penaltyPer100m: Record<Weather, number> = { open: 6, sheltered: 2, air_conditioned: 0 };
  return roundMeasure((pathLengthM / 100) * penaltyPer100m[weather], 0);
}

function losIndex(input: Los | string): number {
  return LOS_LETTERS.indexOf(input as Los);
}

export function roundMeasure(input: unknown, fallback: number): number {
  const numeric = Number(input);
  const rounded = Math.round((Number.isFinite(numeric) ? numeric : fallback) * 1000) / 1000;
  return Math.abs(rounded) < 0.0005 ? 0 : rounded;
}

function roundScale(input: unknown, fallback: number): number {
  const numeric = Number(input);
  const rounded = Math.round((Number.isFinite(numeric) ? numeric : fallback) * 1_000_000_000) / 1_000_000_000;
  return Math.abs(rounded) < 0.0000005 ? 0 : rounded;
}

export function formatNumber(input: number): string {
  const rounded = Math.round(Number(input) * 1_000_000_000) / 1_000_000_000;
  return (Math.abs(rounded) < 0.0000005 ? 0 : rounded).toFixed(9).replace(/\.?0+$/, "") || "0";
}

function booleanFlag(input: boolean): string {
  return input ? "1" : "0";
}

function normalizeBoolean(input: unknown, fallback: boolean): boolean {
  if (typeof input === "boolean") return input;
  if (typeof input === "number") return input !== 0;
  if (typeof input === "string") {
    const value = input.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(value)) return true;
    if (["false", "0", "no", "off"].includes(value)) return false;
  }
  return fallback;
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages.filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
