import { createIcons, icons } from "lucide";
import "./styles.css";
import { sampleRoutes } from "./data/samples";
import { buildOptions, createDefaultRoute, defaultSegment, analyzeRoute, routeToCsv } from "./domain/model";
import type { Analysis, AppOptions, Route } from "./domain/types";
import { defaultDiagramTheme } from "./renderer/theme";
import { downloadBlob, exportPng, exportSvg, renderRouteSvg } from "./renderer/svgRenderer";

interface AppState {
  route: Route;
  analysis: Analysis;
  options: AppOptions;
  selectedSampleId: string;
  status: { tone: "info" | "success" | "warning" | "error"; message: string };
  previewSvg: SVGSVGElement | null;
}

const options = buildOptions();
const initial = analyzeRoute(sampleRoutes[0]?.route || createDefaultRoute());
const state: AppState = {
  route: initial.route,
  analysis: initial.analysis,
  options,
  selectedSampleId: sampleRoutes[0]?.id || "",
  status: { tone: "success", message: "Browser-only workbench loaded." },
  previewSvg: null,
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app root.");
const appRoot = app;

render();

function render(): void {
  state.previewSvg = renderRouteSvg(state.route, state.analysis, defaultDiagramTheme);
  appRoot.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <span class="eyebrow">Pedestrian route workbench</span>
          <h1>JLOS Browser Workbench</h1>
        </div>
        <div class="toolbar" aria-label="Route actions">
          ${button("new-route", "file-plus", "New", "ghost")}
          <label class="button ghost file-button">
            <i data-lucide="upload"></i><span>Import JSON</span>
            <input id="json-import" type="file" accept=".json,application/json" hidden />
          </label>
          ${button("export-json", "save", "JSON", "secondary")}
          ${button("export-csv", "table", "CSV", "secondary")}
          ${button("export-svg", "image", "SVG", "primary")}
          ${button("export-png", "download", "PNG", "accent")}
        </div>
      </header>

      <main class="workspace">
        <aside class="panel stack settings-panel">
          ${renderSettings()}
        </aside>
        <section class="panel stack editor-panel">
          ${renderSegments()}
        </section>
        <aside class="panel stack preview-panel">
          ${renderPreviewPanel()}
        </aside>
      </main>

      <footer class="statusbar" data-tone="${state.status.tone}">
        <span>${escapeHtml(state.status.message)}</span>
        <span>${state.analysis.route.segmentCount} segments / ${formatMetric(state.analysis.route.totalLengthM)}m / LOS ${state.route.meta.overallLos}</span>
      </footer>
    </div>
  `;

  const previewMount = document.querySelector<HTMLDivElement>("#preview-mount");
  if (previewMount && state.previewSvg) {
    previewMount.replaceChildren(state.previewSvg.cloneNode(true));
  }

  bindStaticInputs();
  createIcons({ icons });
}

function renderSettings(): string {
  return `
    <section class="card">
      <div class="card-header">
        <div>
          <h2>Route</h2>
          <p>Canonical JSON model, rendered fully in the browser.</p>
        </div>
      </div>
      <label class="field">
        <span>Sample Route</span>
        <select data-action="load-sample">
          ${sampleRoutes.map((sample) => `<option value="${escapeHtml(sample.id)}" ${sample.id === state.selectedSampleId ? "selected" : ""}>${escapeHtml(sample.label)}</option>`).join("")}
        </select>
      </label>
      <div class="grid-two">
        ${fieldText("Route Name", "meta", "routeName", state.route.meta.routeName)}
        ${fieldSelect("Overall LOS", "meta", "overallLos", state.route.meta.overallLos, state.options.losOptions)}
        ${fieldSelect("H/V Label", "meta", "destinationMetricLabelPosition", state.route.meta.destinationMetricLabelPosition, state.options.destinationMetricLabelPositions)}
        ${fieldSelect("Origin", "origin", "type", state.route.origin.type, state.options.originTypes, true)}
        ${fieldSelect("Destination", "destination", "type", state.route.destination.type, state.options.destinationTypes, true)}
        ${fieldSelect("Start Level", "route", "startLevel", state.route.startLevel, levelOptions(), true)}
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2>Image Frame</h2>
          <p>SVG is primary; PNG export uses the current frame.</p>
        </div>
      </div>
      <div class="grid-two">
        ${fieldNumber("Grid Width (m)", "meta", "gridWidthM", state.route.meta.gridWidthM, 0.001)}
        ${fieldNumber("Grid Height (m)", "meta", "gridHeightM", state.route.meta.gridHeightM, 0.001)}
        ${fieldNumber("X Scale", "meta", "xScale", state.route.meta.xScale, 0.001)}
        ${fieldNumber("Y Scale", "meta", "yScale", state.route.meta.yScale, 0.001)}
        ${fieldNumber("Padding X", "meta", "canvasPaddingX", state.route.meta.canvasPaddingX, 1)}
        ${fieldNumber("Padding Bottom", "meta", "canvasPaddingBottom", state.route.meta.canvasPaddingBottom, 1)}
      </div>
      <div class="segmented" aria-label="Canvas ratio presets">
        ${["auto", "16:9", "4:3", "3:2", "1:1"].map((preset) => `
          <button type="button" data-action="ratio" data-value="${preset}" class="${state.route.meta.canvasRatioPreset === preset ? "is-active" : ""}">${preset}</button>
        `).join("")}
      </div>
      <div class="toggle-row">
        ${fieldCheckbox("Legend", "meta", "showLegend", state.route.meta.showLegend)}
        ${fieldCheckbox("LOS Badge", "meta", "showOverallLos", state.route.meta.showOverallLos)}
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2>Levels</h2>
          <p>Reference elevations drive vertical geometry.</p>
        </div>
        ${button("add-level", "plus", "Level", "secondary")}
      </div>
      <div class="stack">
        ${state.route.levels.map((level, index) => `
          <article class="compact-row">
            ${fieldText("Label", "level", "label", level.label, index)}
            ${fieldNumber("Elevation", "level", "elevationM", level.elevationM, 0.1, index)}
            <button type="button" class="icon-button" data-action="remove-level" data-index="${index}" aria-label="Remove level"><i data-lucide="trash-2"></i></button>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSegments(): string {
  return `
    <section class="card segments-card">
      <div class="card-header">
        <div>
          <h2>Segments</h2>
          <p>Route sequence updates the rendered diagram immediately.</p>
        </div>
        ${button("add-segment", "plus", "Segment", "accent")}
      </div>
      ${state.route.segments.length ? `
        <div class="segment-list">
          ${state.route.segments.map(renderSegmentCard).join("")}
        </div>
      ` : `
        <div class="empty-state">
          <p>No route segments yet.</p>
          ${button("add-segment", "plus", "Add Segment", "accent")}
        </div>
      `}
    </section>
  `;
}

function renderSegmentCard(segment: Route["segments"][number], index: number): string {
  const computed = state.analysis.segments[index];
  return `
    <article class="segment-card">
      <div class="segment-title">
        <span class="segment-index">${index + 1}</span>
        <div>
          <h3>Segment ${index + 1}</h3>
          <div class="chip-row">
            <span class="los-chip" data-los="${segment.los}">${segment.los}</span>
            <span class="chip">${escapeHtml(segment.kind)}</span>
            <span class="chip">${formatMetric(computed?.startElevationM)} to ${formatMetric(computed?.endElevationM)}m</span>
          </div>
        </div>
        <div class="icon-actions">
          <button type="button" class="icon-button" data-action="move-up" data-index="${index}" ${index === 0 ? "disabled" : ""} aria-label="Move segment up"><i data-lucide="arrow-up"></i></button>
          <button type="button" class="icon-button" data-action="move-down" data-index="${index}" ${index === state.route.segments.length - 1 ? "disabled" : ""} aria-label="Move segment down"><i data-lucide="arrow-down"></i></button>
          <button type="button" class="icon-button" data-action="duplicate-segment" data-index="${index}" aria-label="Duplicate segment"><i data-lucide="copy"></i></button>
          <button type="button" class="icon-button danger" data-action="remove-segment" data-index="${index}" aria-label="Delete segment"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
      <div class="grid-four">
        ${fieldNumber("Horizontal (m)", "segment", "lengthM", segment.lengthM, 0.1, index)}
        ${fieldSelect("Target Level", "segment", "targetLevel", segment.targetLevel, [{ value: "", label: "Custom" }, ...levelOptions()], false, index)}
        ${fieldNumber("Vertical (m)", "segment", "verticalM", segment.verticalM, 0.1, index, Boolean(segment.targetLevel))}
        ${fieldSelect("Weather", "segment", "weather", segment.weather, state.options.weatherOptions, false, index)}
        ${fieldSelect("Start Marker", "segment", "startMarker", segment.startMarker, state.options.startMarkers, false, index)}
        ${fieldSelect("Mid Marker", "segment", "midMarker", segment.midMarker, state.options.midMarkers, false, index)}
        ${fieldSelect("LOS", "segment", "los", segment.los, state.options.losOptions, false, index)}
        ${fieldSelect("Kind", "segment", "kind", segment.kind, state.options.segmentKindOptions, false, index)}
      </div>
      <div class="summary-grid">
        ${stat("Path", `${formatMetric(computed?.pathLengthM)}m`)}
        ${stat("Time", `${formatMetric(computed?.travelTimeS)}s`)}
        ${stat("Impedance", `${formatMetric(computed?.impedanceS)}s`)}
        ${stat("Flow", `${formatMetric(computed?.flowPerMinPerM)}/min/m`)}
      </div>
    </article>
  `;
}

function renderPreviewPanel(): string {
  const validation = state.analysis.validation;
  const issues = [...validation.errors, ...validation.rendererErrors, ...validation.warnings];
  return `
    <section class="card preview-card">
      <div class="card-header">
        <div>
          <h2>Live Preview</h2>
          <p>Clean transport-diagram style with inline vector pictograms.</p>
        </div>
      </div>
      <div id="preview-mount" class="preview-mount" aria-label="Rendered JLOS diagram"></div>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2>Metrics</h2>
          <p>Computed locally from the JSON model.</p>
        </div>
      </div>
      <div class="summary-grid">
        ${stat("Length", `${formatMetric(state.analysis.route.totalLengthM)}m`)}
        ${stat("Vertical", `${formatMetric(state.analysis.route.totalVerticalM)}m`)}
        ${stat("Time", `${formatMetric(state.analysis.route.totalTimeS)}s`)}
        ${stat("Impedance", `${formatMetric(state.analysis.route.totalImpedanceS)}s`)}
      </div>
    </section>

    <section class="message-panel ${issues.length ? validation.errors.length ? "errors" : "warnings" : "success"}">
      <h2>${issues.length ? "Validation" : "Ready"}</h2>
      ${issues.length ? `<ol>${issues.map((issue) => `<li>${escapeHtml(issue)}</li>`).join("")}</ol>` : `<p>SVG and PNG export are ready.</p>`}
    </section>
  `;
}

function bindStaticInputs(): void {
  appRoot.querySelector("#json-import")?.addEventListener("change", handleJsonImport);
}

appRoot.addEventListener("click", async (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!target) return;
  const action = target.dataset.action || "";
  const index = Number(target.dataset.index);

  if (action === "new-route") {
    applyRoute(createDefaultRoute(), "Started a new browser-only route.", "");
  } else if (action === "export-json") {
    downloadBlob(new Blob([JSON.stringify(state.route, null, 2)], { type: "application/json" }), fileName("json"));
    setStatus("Exported route JSON.", "success");
  } else if (action === "export-csv") {
    downloadBlob(new Blob([routeToCsv(state.route, state.analysis)], { type: "text/csv;charset=utf-8" }), fileName("csv"));
    setStatus("Exported legacy-compatible CSV.", "success");
  } else if (action === "export-svg") {
    if (!state.previewSvg) return;
    downloadBlob(exportSvg(state.previewSvg), fileName("svg"));
    setStatus("Exported SVG diagram.", "success");
  } else if (action === "export-png") {
    if (!state.previewSvg) return;
    setStatus("Rendering PNG export...", "info");
    render();
    downloadBlob(await exportPng(state.previewSvg, 3), fileName("png"));
    setStatus("Exported high-resolution PNG diagram.", "success");
  } else if (action === "add-level") {
    state.route.levels.push({ label: `L${state.route.levels.length}`, elevationM: 0 });
    updateRoute("Added a reference level.");
  } else if (action === "remove-level") {
    const [removed] = state.route.levels.splice(index, 1);
    state.route.segments.forEach((segment) => {
      if (segment.targetLevel === removed?.label) segment.targetLevel = "";
    });
    updateRoute("Removed a reference level.");
  } else if (action === "add-segment") {
    state.route.segments.push(defaultSegment());
    updateRoute("Added a segment.");
  } else if (action === "remove-segment") {
    state.route.segments.splice(index, 1);
    updateRoute("Removed a segment.");
  } else if (action === "duplicate-segment") {
    state.route.segments.splice(index + 1, 0, structuredClone(state.route.segments[index]));
    updateRoute("Duplicated a segment.");
  } else if (action === "move-up") {
    moveSegment(index, -1);
  } else if (action === "move-down") {
    moveSegment(index, 1);
  } else if (action === "ratio") {
    applyRatio(target.dataset.value || "auto");
  }
});

appRoot.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target.dataset.action === "load-sample") {
    const sample = sampleRoutes.find((item) => item.id === target.value);
    if (sample) applyRoute(sample.route, `Loaded ${sample.label}.`, sample.id);
    return;
  }
  if (!target.dataset.kind || !state.route) return;
  const { kind, field, index } = target.dataset;
  const value = readInputValue(target);
  if (kind === "meta") {
    (state.route.meta as unknown as Record<string, unknown>)[field || ""] = value;
  } else if (kind === "origin") {
    state.route.origin.type = String(value);
  } else if (kind === "destination") {
    state.route.destination.type = String(value);
  } else if (kind === "route") {
    (state.route as unknown as Record<string, unknown>)[field || ""] = value;
  } else if (kind === "level") {
    const level = state.route.levels[Number(index)];
    const previousLabel = level.label;
    (level as unknown as Record<string, unknown>)[field || ""] = value;
    if (field === "label") {
      state.route.segments.forEach((segment) => {
        if (segment.targetLevel === previousLabel) segment.targetLevel = String(value);
      });
      if (state.route.startLevel === previousLabel) state.route.startLevel = String(value);
    }
  } else if (kind === "segment") {
    const segment = state.route.segments[Number(index)];
    (segment as unknown as Record<string, unknown>)[field || ""] = value;
    if (field === "verticalM") segment.targetLevel = "";
  }
  updateRoute("Updated route model.");
});

async function handleJsonImport(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    applyRoute(json, `Imported ${file.name}.`, "");
  } catch (error) {
    setStatus(`Could not import JSON: ${error instanceof Error ? error.message : "Unknown error."}`, "error");
    render();
  } finally {
    input.value = "";
  }
}

function applyRoute(route: unknown, message: string, sampleId: string): void {
  const next = analyzeRoute(route);
  state.route = next.route;
  state.analysis = next.analysis;
  state.selectedSampleId = sampleId;
  setStatus(message, next.analysis.validation.errors.length ? "warning" : "success");
  render();
}

function updateRoute(message: string): void {
  const next = analyzeRoute(state.route);
  state.route = next.route;
  state.analysis = next.analysis;
  setStatus(message, next.analysis.validation.errors.length ? "warning" : "success");
  render();
}

function moveSegment(index: number, direction: number): void {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= state.route.segments.length) return;
  const [segment] = state.route.segments.splice(index, 1);
  state.route.segments.splice(nextIndex, 0, segment);
  updateRoute("Reordered segments.");
}

function applyRatio(value: string): void {
  const preset = value as Route["meta"]["canvasRatioPreset"];
  state.route.meta.canvasRatioPreset = preset;
  const dimensions: Record<string, [number, number]> = { auto: [16, 9], "16:9": [16, 9], "4:3": [4, 3], "3:2": [3, 2], "1:1": [1, 1] };
  const [width, height] = dimensions[value] || [16, 9];
  state.route.meta.canvasRatioWidth = width;
  state.route.meta.canvasRatioHeight = height;
  updateRoute(`Applied ${value} frame.`);
}

function readInputValue(target: HTMLInputElement | HTMLSelectElement): string | number | boolean {
  if (target instanceof HTMLInputElement && target.type === "checkbox") return target.checked;
  if (target instanceof HTMLInputElement && target.type === "number") return Number(target.value);
  return target.value;
}

function setStatus(message: string, tone: AppState["status"]["tone"]): void {
  state.status = { message, tone };
}

function levelOptions() {
  return state.route.levels.filter((level) => level.label).map((level) => ({ value: level.label, label: level.label }));
}

function fieldText(label: string, kind: string, fieldName: string, value: unknown, index: number | string = ""): string {
  return renderField(label, `<input type="text" data-kind="${kind}" data-field="${fieldName}" ${index !== "" ? `data-index="${index}"` : ""} value="${escapeHtml(String(value ?? ""))}" />`);
}

function fieldNumber(label: string, kind: string, fieldName: string, value: unknown, step: number, index: number | string = "", readOnly = false): string {
  return renderField(label, `<input type="number" data-kind="${kind}" data-field="${fieldName}" ${index !== "" ? `data-index="${index}"` : ""} step="${step}" value="${escapeHtml(String(value ?? 0))}" ${readOnly ? "readonly" : ""} />`);
}

function fieldCheckbox(label: string, kind: string, fieldName: string, checked: boolean): string {
  return `<label class="toggle"><input type="checkbox" data-kind="${kind}" data-field="${fieldName}" ${checked ? "checked" : ""} /><span>${escapeHtml(label)}</span></label>`;
}

function fieldSelect(label: string, kind: string, fieldName: string, value: unknown, optionsList: { value: string; label: string }[], includePlaceholder = false, index: number | string = ""): string {
  const optionList = includePlaceholder ? [{ value: "", label: "Choose..." }, ...optionsList] : optionsList;
  return renderField(label, `
    <select data-kind="${kind}" data-field="${fieldName}" ${index !== "" ? `data-index="${index}"` : ""}>
      ${optionList.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
    </select>
  `);
}

function renderField(label: string, control: string): string {
  return `<label class="field"><span>${escapeHtml(label)}</span>${control}</label>`;
}

function stat(label: string, value: string): string {
  return `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function button(action: string, icon: string, label: string, variant: string): string {
  return `<button class="button ${variant}" type="button" data-action="${action}"><i data-lucide="${icon}"></i><span>${escapeHtml(label)}</span></button>`;
}

function fileName(extension: "json" | "csv" | "svg" | "png"): string {
  const base = (state.route.meta.routeName || "jlos-route").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "jlos-route";
  return `${base}.${extension}`;
}

function formatMetric(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return (Math.round(number * 1000) / 1000).toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
