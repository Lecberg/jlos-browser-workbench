import type { Analysis, ComputedSegment, Los, Route, RouteSegment } from "../domain/types";
import { createMarkerIcon, MARKER_LABELS, TERMINAL_MARKERS } from "./markerIcons";
import { defaultDiagramTheme, hexToRgba, losFill, type DiagramTheme } from "./theme";

const NS = "http://www.w3.org/2000/svg";
const CORRIDOR_HEIGHT = 30;
const AIR_CON_DEPTH = 15;
const POINTER_LINE_LENGTH = 30;
const DEFAULT_CANVAS_PADDING_X = 140;
const DEFAULT_CANVAS_PADDING_TOP = 60;
const DEFAULT_CANVAS_PADDING_BOTTOM = 160;
const DESTINATION_SUMMARY_LINE_SPACING = 16;
const DESTINATION_SUMMARY_POINT_GAP = 12;
const DESTINATION_SUMMARY_FRAME_PADDING = 12;
const DESTINATION_SUMMARY_DEFAULT_RIGHT_GAP = 28;
const DESTINATION_SUMMARY_ICON_GAP = 12;

interface Layout {
  canvasWidth: number;
  canvasHeight: number;
  gridWidthPx: number;
  gridHeightPx: number;
  startX: number;
  diagramY: number;
  legendY: number;
  startElevation: number;
}

interface DrawResult {
  cursorX: number;
  cursorY: number;
  destinationClearance: number;
}

export function renderRouteSvg(route: Route, analysis: Analysis, theme: DiagramTheme = defaultDiagramTheme): SVGSVGElement {
  const layout = buildLayout(route, analysis);
  const svg = el("svg");
  svg.setAttribute("width", String(layout.canvasWidth));
  svg.setAttribute("height", String(layout.canvasHeight));
  svg.setAttribute("viewBox", `0 0 ${layout.canvasWidth} ${layout.canvasHeight}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `JLOS route diagram for ${route.meta.routeName}`);
  svg.append(
    title(`JLOS route diagram for ${route.meta.routeName}`),
    description(`Route length ${route.computed.totalLengthM} meters, vertical change ${route.computed.totalVerticalM} meters, overall LOS ${route.meta.overallLos}.`),
    style(theme),
    defs(theme),
  );

  svg.appendChild(rect(0, 0, layout.canvasWidth, layout.canvasHeight, { fill: theme.background }));
  const root = group({ transform: "translate(10 10)" });
  svg.appendChild(root);

  drawGrid(root, layout.canvasWidth, layout.canvasHeight, layout.gridWidthPx, layout.gridHeightPx, theme);
  root.appendChild(rect(0, 0, layout.canvasWidth - 20, layout.canvasHeight - 20, { fill: "none", stroke: theme.frame, "stroke-width": 1.4, rx: 10 }));

  const scaleBoxX = Math.floor((layout.canvasWidth - layout.gridWidthPx - 40) / layout.gridWidthPx) * layout.gridWidthPx;
  const scaleBoxY = Math.floor(layout.legendY / layout.gridHeightPx) * layout.gridHeightPx;
  drawScaleBox(root, route, scaleBoxX, scaleBoxY, layout.gridWidthPx, layout.gridHeightPx, theme);

  if (route.meta.showLegend) {
    drawLegend(root, layout.legendY, theme);
  }

  const routeResult = drawRoute(root, route, analysis, layout.startX, layout.diagramY, theme);
  drawDestinationSummary(
    root,
    route,
    layout.startX + routeResult.cursorX,
    layout.diagramY + routeResult.cursorY,
    routeResult.destinationClearance,
    layout.canvasWidth,
    layout.canvasHeight,
    layout.legendY,
    scaleBoxY,
    theme,
  );

  if (route.meta.showOverallLos) {
    drawLosBadge(root, route.meta.overallLos, layout.canvasWidth - 58, 38, theme, 42);
  }

  return svg;
}

export function exportSvg(svg: SVGSVGElement): Blob {
  const serialized = new XMLSerializer().serializeToString(svg);
  return new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
}

export async function exportPng(svg: SVGSVGElement, scale = 3): Promise<Blob> {
  const width = Number(svg.getAttribute("width") || 0);
  const height = Number(svg.getAttribute("height") || 0);
  const blob = exportSvg(svg);
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create a canvas rendering context.");
    context.fillStyle = defaultDiagramTheme.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const output = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((pngBlob) => (pngBlob ? resolve(pngBlob) : reject(new Error("PNG export failed."))), "image/png");
    });
    return output;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildLayout(route: Route, analysis: Analysis): Layout {
  const meta = route.meta;
  const pxPerMeterH = meta.xScale;
  const pxPerMeterV = meta.yScale;
  const gridWidthPx = Math.max(meta.gridWidthM * pxPerMeterH, 50);
  const gridHeightPx = Math.max(meta.gridHeightM * pxPerMeterV, 50);
  const startElevation = levelElevation(route, route.startLevel);

  let diagramWidth = 0;
  let cursorY = 0;
  let routeMinY = 0;
  let routeMaxY = 0;

  analysis.segments.forEach((segment) => {
    const dx = segment.lengthM * pxPerMeterH;
    const dy = segment.verticalM * pxPerMeterV;
    diagramWidth += dx;
    routeMinY = Math.min(routeMinY, cursorY);
    routeMaxY = Math.max(routeMaxY, cursorY);
    cursorY -= dy;
    routeMinY = Math.min(routeMinY, cursorY);
    routeMaxY = Math.max(routeMaxY, cursorY);
  });

  route.levels.forEach((level) => {
    if (!level.label) return;
    const levelY = -(level.elevationM - startElevation) * pxPerMeterV;
    routeMinY = Math.min(routeMinY, levelY);
    routeMaxY = Math.max(routeMaxY, levelY);
  });

  const drawingTopY = routeMinY - CORRIDOR_HEIGHT - AIR_CON_DEPTH - 50;
  const drawingBottomY = routeMaxY + 95;
  const leftReserve = Math.max(meta.canvasPaddingX || DEFAULT_CANVAS_PADDING_X, 100);
  const rightReserve = Math.max(meta.canvasPaddingX || DEFAULT_CANVAS_PADDING_X, 260);
  let canvasWidth = Math.round(Math.max(diagramWidth + leftReserve + rightReserve + 20, 1000));
  const bottomPadding = Math.max(meta.canvasPaddingBottom || DEFAULT_CANVAS_PADDING_BOTTOM, meta.showLegend ? 160 : 90);
  let canvasHeight = Math.round(Math.max((meta.canvasPaddingTop || DEFAULT_CANVAS_PADDING_TOP) + (drawingBottomY - drawingTopY) + bottomPadding + 20, 420));

  if (meta.canvasRatioPreset !== "auto") {
    [canvasWidth, canvasHeight] = adjustedCanvasSizeForRatio(canvasWidth, canvasHeight, meta.canvasRatioWidth, meta.canvasRatioHeight, gridWidthPx, gridHeightPx);
  }

  const startXMin = leftReserve;
  const startXMax = Math.max(startXMin, canvasWidth - 20 - rightReserve - diagramWidth);
  const startX = snappedValueInRange((canvasWidth - 20 - diagramWidth) / 2, startXMin, startXMax, gridWidthPx);

  const legendY = canvasHeight - 110;
  const drawingHeight = drawingBottomY - drawingTopY;
  const routeAreaTop = 20;
  const routeAreaBottom = Math.max(routeAreaTop + drawingHeight, legendY - 20);
  const diagramYMin = routeAreaTop - drawingTopY;
  const diagramYMax = Math.max(diagramYMin, routeAreaBottom - drawingBottomY);
  const diagramY = snappedValueInRange(routeAreaTop + ((routeAreaBottom - routeAreaTop) - drawingHeight) / 2 - drawingTopY, diagramYMin, diagramYMax, gridHeightPx);

  return { canvasWidth, canvasHeight, gridWidthPx, gridHeightPx, startX, diagramY, legendY, startElevation };
}

function drawRoute(parent: SVGElement, route: Route, analysis: Analysis, startX: number, diagramY: number, theme: DiagramTheme): DrawResult {
  const pxPerMeterH = route.meta.xScale;
  const pxPerMeterV = route.meta.yScale;
  const startElevation = levelElevation(route, route.startLevel);
  const g = group({ transform: `translate(${num(startX)} ${num(diagramY)})` });
  parent.appendChild(g);

  g.appendChild(line(-70, 0, -50, 0, { stroke: theme.ink, "stroke-width": 1.4 }));
  g.appendChild(text(route.startLevel, -82, 0, { "font-size": 11, "text-anchor": "middle", fill: theme.ink }));
  route.levels.forEach((level) => {
    if (!level.label) return;
    if (level.label === route.startLevel && Math.abs(level.elevationM - startElevation) <= 0.01) return;
    const y = -(level.elevationM - startElevation) * pxPerMeterV;
    g.appendChild(line(-70, y, -50, y, { stroke: theme.ink, "stroke-width": 1.4 }));
    g.appendChild(text(level.label, -82, y, { "font-size": 11, "text-anchor": "middle", fill: theme.ink }));
  });

  let cursorX = 0;
  let cursorY = 0;
  analysis.segments.forEach((segment, index) => {
    const routeSegment = route.segments[index];
    const dx = segment.lengthM * pxPerMeterH;
    const dy = segment.verticalM * pxPerMeterV;
    const segmentGroup = group({ transform: `translate(${num(cursorX)} ${num(cursorY)})` });
    g.appendChild(segmentGroup);

    const corridor = polygon(
      [[0, 0], [0, -CORRIDOR_HEIGHT], [dx, -dy - CORRIDOR_HEIGHT], [dx, -dy]],
      { fill: losFill(routeSegment.los, 0.24, theme), stroke: "none" },
    );
    segmentGroup.appendChild(corridor);
    drawWeather(segmentGroup, routeSegment, dx, dy, theme);
    segmentGroup.appendChild(line(0, 0, dx, -dy, { stroke: theme.routeStroke, "stroke-width": 4, "stroke-linecap": "round" }));
    segmentGroup.appendChild(circle(0, 0, 5, { fill: theme.routeStroke }));

    const startMarker = index === 0 && route.origin.type ? route.origin.type : routeSegment.startMarker;
    drawStartMarker(segmentGroup, startMarker, dy, theme);
    drawMidMarker(segmentGroup, routeSegment.midMarker, dx, dy, theme);

    cursorX += dx;
    cursorY -= dy;
  });

  g.appendChild(circle(cursorX, cursorY, 5, { fill: theme.routeStroke }));
  const destinationClearance = drawDestinationMarker(g, route.destination.type, cursorX, cursorY, theme);
  return { cursorX, cursorY, destinationClearance };
}

function drawWeather(parent: SVGElement, segment: RouteSegment, dx: number, dy: number, theme: DiagramTheme): void {
  if (segment.weather === "air_conditioned") {
    parent.appendChild(polygon(
      [[0, -CORRIDOR_HEIGHT], [0, -CORRIDOR_HEIGHT - AIR_CON_DEPTH], [dx, -dy - CORRIDOR_HEIGHT - AIR_CON_DEPTH], [dx, -dy - CORRIDOR_HEIGHT]],
      { fill: hexToRgba(theme.airConditioned, 0.72), stroke: "none" },
    ));
  }
  if (segment.weather === "sheltered" || segment.weather === "air_conditioned") {
    parent.appendChild(polygon(
      [[0, -CORRIDOR_HEIGHT], [0, -CORRIDOR_HEIGHT - 7], [dx, -dy - CORRIDOR_HEIGHT - 7], [dx, -dy - CORRIDOR_HEIGHT]],
      { fill: "url(#shelter-hatch)", stroke: "none", opacity: 0.9 },
    ));
  }
}

function drawStartMarker(parent: SVGElement, marker: string, dy: number, theme: DiagramTheme): void {
  if (!marker || marker === "none") return;
  if (TERMINAL_MARKERS.has(marker)) {
    drawTerminalMarker(parent, marker, -25, -15, marker === "drop_off" || marker === "smart_car" ? 25 : -25, 17, theme);
    return;
  }
  drawCalloutMarker(parent, marker, 0, -dy / 2 - CORRIDOR_HEIGHT / 2, theme);
}

function drawMidMarker(parent: SVGElement, marker: string, dx: number, dy: number, theme: DiagramTheme): void {
  if (!marker || marker === "none") return;
  const iconX = dx / 2;
  const iconY = -dy / 2 - CORRIDOR_HEIGHT / 2;
  if (["escalator_up", "escalator_down", "stair_up", "stair_down", "bottleneck", "turnstiles"].includes(marker)) {
    drawIcon(parent, marker, iconX, iconY, theme, 24);
  } else {
    drawCalloutMarker(parent, marker, iconX, iconY, theme);
  }
}

function drawTerminalMarker(parent: SVGElement, marker: string, iconX: number, iconY: number, labelX: number, labelY: number, theme: DiagramTheme): void {
  drawIcon(parent, marker, iconX, iconY, theme, 30);
  const label = MARKER_LABELS[marker];
  if (label) parent.appendChild(text(label, labelX, labelY, { "font-size": 11, "text-anchor": "middle", fill: theme.ink, "font-weight": 700 }));
}

function drawCalloutMarker(parent: SVGElement, marker: string, x: number, y: number, theme: DiagramTheme): void {
  drawIcon(parent, marker, x, y, theme, 24);
  const label = MARKER_LABELS[marker];
  if (!label) return;
  parent.appendChild(line(x, y + 12, x, POINTER_LINE_LENGTH, { stroke: theme.ink, "stroke-width": 1.3 }));
  parent.appendChild(text(label, x, POINTER_LINE_LENGTH + 12, { "font-size": 10.5, "text-anchor": "middle", fill: theme.ink, "font-weight": 700 }));
}

function drawDestinationMarker(parent: SVGElement, marker: string, x: number, y: number, theme: DiagramTheme): number {
  if (!marker) return 0;
  drawIcon(parent, marker, x + 26, y - 15, theme, 30);
  const label = MARKER_LABELS[marker];
  if (label) parent.appendChild(text(label, x + 26, y + 17, { "font-size": 11, "text-anchor": "middle", fill: theme.ink, "font-weight": 700 }));
  return Math.max(26 + 15, label ? 26 + textWidth(label, 11) / 2 : 0);
}

function drawGrid(parent: SVGElement, canvasWidth: number, canvasHeight: number, gridWidthPx: number, gridHeightPx: number, theme: DiagramTheme): void {
  for (let x = 0; x <= canvasWidth; x += gridWidthPx) {
    parent.appendChild(line(x, 0, x, canvasHeight, { stroke: theme.grid, "stroke-width": 1 }));
  }
  for (let y = 0; y <= canvasHeight; y += gridHeightPx) {
    parent.appendChild(line(0, y, canvasWidth, y, { stroke: theme.grid, "stroke-width": 1 }));
  }
}

function drawScaleBox(parent: SVGElement, route: Route, x: number, y: number, gridW: number, gridH: number, theme: DiagramTheme): void {
  parent.appendChild(rect(x, y, gridW, gridH, { fill: "none", stroke: theme.muted, "stroke-width": 1.5, rx: 4 }));
  parent.appendChild(text(`${formatGridMeasure(route.meta.gridWidthM)}m`, x + gridW / 2, y + gridH + 12, { "font-size": 11, fill: theme.muted, "text-anchor": "middle" }));
  parent.appendChild(text(`${formatGridMeasure(route.meta.gridHeightM)}m`, x + gridW + 12, y + gridH / 2, { "font-size": 11, fill: theme.muted, "text-anchor": "start" }));
}

function drawLegend(parent: SVGElement, legendY: number, theme: DiagramTheme): void {
  const legend = group();
  parent.appendChild(legend);
  legend.appendChild(rect(90, legendY - 6, 740, 64, { fill: "rgba(255,255,255,0.92)", stroke: theme.frame, "stroke-width": 1, rx: 10 }));
  (["A", "B", "C", "D", "E", "F"] as Los[]).forEach((letter, index) => {
    const x = 122 + index * 46;
    legend.appendChild(rect(x, legendY + 16, 40, 22, { fill: theme.los[letter], rx: 5 }));
    legend.appendChild(text(letter, x + 20, legendY + 27, { "font-size": 12, fill: "#fff", "font-weight": 800, "text-anchor": "middle" }));
  });
  legend.appendChild(text("Level of service", 122, legendY + 50, { "font-size": 10, fill: theme.muted, "text-anchor": "start" }));
  legend.appendChild(rect(430, legendY + 15, 82, 10, { fill: "url(#shelter-hatch)", stroke: "none" }));
  legend.appendChild(text("Sheltered", 526, legendY + 20, { "font-size": 12, fill: theme.ink, "text-anchor": "start" }));
  legend.appendChild(rect(430, legendY + 34, 82, 12, { fill: hexToRgba(theme.airConditioned, 0.72), stroke: "none", rx: 4 }));
  legend.appendChild(text("Air-conditioned", 526, legendY + 40, { "font-size": 12, fill: theme.ink, "text-anchor": "start" }));
  drawIcon(legend, "bottleneck", 668, legendY + 20, theme, 20);
  legend.appendChild(text("Bottleneck", 690, legendY + 20, { "font-size": 12, fill: theme.ink, "text-anchor": "start" }));
  drawIcon(legend, "turnstiles", 668, legendY + 42, theme, 20);
  legend.appendChild(text("Turnstiles", 690, legendY + 42, { "font-size": 12, fill: theme.ink, "text-anchor": "start" }));
}

function drawDestinationSummary(parent: SVGElement, route: Route, routeEndX: number, routeEndY: number, destinationClearance: number, canvasWidth: number, canvasHeight: number, legendY: number, scaleBoxY: number, theme: DiagramTheme): void {
  const horizontalText = `H ${Math.round(route.computed.totalLengthM)}m`;
  const verticalText = `V ${Math.round(route.computed.totalVerticalM)}m`;
  const blockWidth = Math.max(textWidth(horizontalText, 12), textWidth(verticalText, 12)) + 20;
  const blockHeight = 44;
  const safeLeft = DESTINATION_SUMMARY_FRAME_PADDING;
  const safeTop = DESTINATION_SUMMARY_FRAME_PADDING;
  const safeRight = canvasWidth - 20 - DESTINATION_SUMMARY_FRAME_PADDING;
  const safeBottom = Math.min(canvasHeight - 20 - DESTINATION_SUMMARY_FRAME_PADDING, Math.min(legendY, scaleBoxY) - DESTINATION_SUMMARY_FRAME_PADDING);
  const maxLeft = Math.max(safeLeft, safeRight - blockWidth);
  const maxTop = Math.max(safeTop, safeBottom - blockHeight);
  const position = route.meta.destinationMetricLabelPosition;
  let left = routeEndX + (destinationClearance > 0 ? destinationClearance + DESTINATION_SUMMARY_ICON_GAP : DESTINATION_SUMMARY_DEFAULT_RIGHT_GAP);
  let top = routeEndY - blockHeight / 2;
  if (position !== "right") {
    left = routeEndX - blockWidth / 2;
    top = position === "above" ? routeEndY - DESTINATION_SUMMARY_POINT_GAP - blockHeight : routeEndY + DESTINATION_SUMMARY_POINT_GAP;
  }
  left = constrain(left, safeLeft, maxLeft);
  top = constrain(top, safeTop, maxTop);
  parent.appendChild(rect(left, top, blockWidth, blockHeight, { fill: "rgba(255,255,255,0.88)", stroke: theme.frame, "stroke-width": 1, rx: 8 }));
  parent.appendChild(text(horizontalText, left + 10, top + 17, { "font-size": 12, fill: theme.ink, "text-anchor": "start", "font-weight": 750 }));
  parent.appendChild(text(verticalText, left + 10, top + 17 + DESTINATION_SUMMARY_LINE_SPACING, { "font-size": 12, fill: theme.ink, "text-anchor": "start", "font-weight": 750 }));
}

function drawLosBadge(parent: SVGElement, los: Los, x: number, y: number, theme: DiagramTheme, size: number): void {
  parent.appendChild(rect(x - size / 2, y - size / 2, size, size, { fill: theme.los[los], stroke: theme.ink, "stroke-width": 1.5, rx: 8 }));
  parent.appendChild(text(los, x, y + 1, { "font-size": 28, fill: "#fff", "font-weight": 800, "text-anchor": "middle" }));
}

function drawIcon(parent: SVGElement, marker: string, cx: number, cy: number, theme: DiagramTheme, size: number): void {
  const wrapper = group({ transform: `translate(${num(cx)} ${num(cy)})` });
  wrapper.appendChild(createMarkerIcon(marker, theme, size));
  parent.appendChild(wrapper);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load serialized SVG for PNG export."));
    image.src = url;
  });
}

function style(theme: DiagramTheme): SVGStyleElement {
  const node = el("style");
  node.textContent = `
    text { font-family: ${theme.fontFamily}; dominant-baseline: middle; letter-spacing: 0; }
    .diagram-description { fill: ${theme.muted}; }
  `;
  return node;
}

function defs(theme: DiagramTheme): SVGDefsElement {
  const node = el("defs");
  const pattern = el("pattern");
  pattern.setAttribute("id", "shelter-hatch");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", "8");
  pattern.setAttribute("height", "8");
  pattern.appendChild(line(0, 8, 8, 0, { stroke: theme.sheltered, "stroke-width": 1.4, opacity: 0.34 }));
  node.appendChild(pattern);
  return node;
}

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag);
}

function group(attrs: Record<string, string | number> = {}): SVGGElement {
  const node = el("g");
  setAttrs(node, attrs);
  return node;
}

function rect(x: number, y: number, width: number, height: number, attrs: Record<string, string | number> = {}): SVGRectElement {
  const node = el("rect");
  setAttrs(node, { x, y, width, height, ...attrs });
  return node;
}

function line(x1: number, y1: number, x2: number, y2: number, attrs: Record<string, string | number> = {}): SVGLineElement {
  const node = el("line");
  setAttrs(node, { x1, y1, x2, y2, ...attrs });
  return node;
}

function circle(cx: number, cy: number, r: number, attrs: Record<string, string | number> = {}): SVGCircleElement {
  const node = el("circle");
  setAttrs(node, { cx, cy, r, ...attrs });
  return node;
}

function polygon(points: [number, number][], attrs: Record<string, string | number> = {}): SVGPolygonElement {
  const node = el("polygon");
  setAttrs(node, { points: points.map(([x, y]) => `${num(x)},${num(y)}`).join(" "), ...attrs });
  return node;
}

function text(value: string, x: number, y: number, attrs: Record<string, string | number> = {}): SVGTextElement {
  const node = el("text");
  node.textContent = value;
  setAttrs(node, { x, y, ...attrs });
  return node;
}

function title(value: string): SVGTitleElement {
  const node = el("title");
  node.textContent = value;
  return node;
}

function description(value: string): SVGDescElement {
  const node = el("desc");
  node.textContent = value;
  return node;
}

function setAttrs(node: SVGElement, attrs: Record<string, string | number>): void {
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
}

function adjustedCanvasSizeForRatio(width: number, height: number, ratioWidth: number, ratioHeight: number, gridW: number, gridH: number): [number, number] {
  if (width <= 0 || height <= 0 || ratioWidth <= 0 || ratioHeight <= 0) return [width, height];
  const targetRatio = ratioWidth / ratioHeight;
  const currentRatio = width / height;
  if (Math.abs(currentRatio - targetRatio) <= 0.001) return [width, height];
  if (currentRatio < targetRatio) return [expandedCanvasSize(width, height * targetRatio, gridW), height];
  return [width, expandedCanvasSize(height, width / targetRatio, gridH)];
}

function expandedCanvasSize(currentSize: number, desiredSize: number, gridSize: number): number {
  const neededExtra = Math.max(0, desiredSize - currentSize);
  if (neededExtra <= 0) return currentSize;
  if (gridSize <= 0) return Math.ceil(desiredSize);
  return currentSize + Math.ceil(neededExtra / gridSize) * gridSize;
}

function snappedValueInRange(value: number, minValue: number, maxValue: number, gridSize: number): number {
  if (maxValue < minValue) return minValue;
  if (gridSize <= 0) return constrain(value, minValue, maxValue);
  const minSnapped = Math.ceil(minValue / gridSize) * gridSize;
  const maxSnapped = Math.floor(maxValue / gridSize) * gridSize;
  if (maxSnapped < minSnapped) return constrain(value, minValue, maxValue);
  return constrain(Math.round(value / gridSize) * gridSize, minSnapped, maxSnapped);
}

function levelElevation(route: Route, label: string): number {
  return route.levels.find((level) => level.label === label)?.elevationM ?? 0;
}

function constrain(value: number, minValue: number, maxValue: number): number {
  return Math.min(Math.max(value, minValue), maxValue);
}

function textWidth(value: string, fontSize: number): number {
  return value.length * fontSize * 0.58;
}

function formatGridMeasure(value: number): string {
  return String(Number(value.toFixed(3)));
}

function num(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return (Math.abs(rounded) < 0.0005 ? 0 : rounded).toFixed(3).replace(/\.?0+$/, "");
}
