const MAX_VISIBLE_NOTIFICATIONS = 3;
const NOTIFICATION_TIMEOUT_MS = 4200;
const DEFAULT_PREVIEW_DOWNLOAD_PATH = "JLOS/sample_hires.png";
const ANALYZE_DEBOUNCE_MS = 280;
const PLACEHOLDER_OPTION = { value: "", label: "Choose..." };
const CUSTOM_VERTICAL_OPTION = { value: "", label: "Custom vertical" };
const SCALE_PRESETS = [
  {
    id: "tight",
    label: "Tight",
    description: "Compact framing for longer routes.",
    targetGridWidthPx: 75,
    targetGridHeightPx: 40,
    canvasPaddingX: 100,
    canvasPaddingTop: 50,
    canvasPaddingBottom: 120,
  },
  {
    id: "default",
    label: "Default",
    description: "Current standard diagram scale.",
    targetGridWidthPx: 100,
    targetGridHeightPx: 50,
    canvasPaddingX: 140,
    canvasPaddingTop: 60,
    canvasPaddingBottom: 160,
  },
  {
    id: "wide",
    label: "Wide",
    description: "Roomier framing with larger spacing.",
    targetGridWidthPx: 120,
    targetGridHeightPx: 60,
    canvasPaddingX: 180,
    canvasPaddingTop: 80,
    canvasPaddingBottom: 200,
  },
];
const CANVAS_RATIO_PRESETS = [
  {
    id: "auto",
    label: "Auto",
    description: "Use dynamic route-driven framing.",
    width: 16,
    height: 9,
  },
  {
    id: "16:9",
    label: "16:9",
    description: "Wide presentation frame.",
    width: 16,
    height: 9,
  },
  {
    id: "4:3",
    label: "4:3",
    description: "Standard landscape frame.",
    width: 4,
    height: 3,
  },
  {
    id: "3:2",
    label: "3:2",
    description: "Balanced landscape frame.",
    width: 3,
    height: 2,
  },
  {
    id: "1:1",
    label: "1:1",
    description: "Square frame.",
    width: 1,
    height: 1,
  },
  {
    id: "custom",
    label: "Custom",
    description: "Use custom width and height.",
    width: 16,
    height: 9,
  },
];

const notificationTimeouts = new Map();

const state = {
  route: null,
  analysis: null,
  options: null,
  files: null,
  preview: defaultPreviewState(),
  status: { message: "Loading editor...", tone: "info" },
  dirty: false,
  notifications: [],
  nextNotificationId: 1,
  isPreviewModalOpen: false,
  isAnalyzing: false,
  analyzeTimerId: 0,
  analyzeRequestToken: 0,
  latestAppliedAnalysisToken: 0,
  routeEditRevision: 0,
};

document.addEventListener("DOMContentLoaded", () => {
  bindGlobalEvents();
  renderNotifications();
  renderPreviewModal();
  bootstrap();
});

async function bootstrap(options = {}) {
  const {
    successMessage = "Route loaded from disk.",
    notifyOnSuccess = false,
    notifyOnError = false,
  } = options;

  setStatus("Loading route data from disk...");
  try {
    const payload = await getJson("/api/bootstrap");
    applyServerPayload(payload, { dirty: false, statusMessage: successMessage });
    if (notifyOnSuccess) {
      notify(successMessage, "success");
    }
  } catch (error) {
    setStatus(error.message, "error");
    if (notifyOnError) {
      notify(error.message, "error");
    }
  }
}

function bindGlobalEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKeyDown);
  document.getElementById("json-import").addEventListener("change", handleJsonImport);
}

async function handleClick(event) {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) {
    return;
  }

  const { action, index } = actionTarget.dataset;
  switch (action) {
    case "dismiss-notification":
      dismissNotification(Number(actionTarget.dataset.id));
      break;
    case "open-preview":
      openPreviewModal();
      break;
    case "close-preview":
      closePreviewModal();
      break;
    case "download-preview":
      await downloadPreview();
      break;
    case "new-route":
      if (!confirm("Create a new route? Unsaved edits in the editor will be lost.")) {
        return;
      }
      state.route = createEmptyRoute();
      state.analysis = null;
      state.dirty = true;
      bumpRouteEditRevision();
      setStatus("Started a new route. Backend validation will update shortly.", "warning");
      renderApp();
      scheduleAnalyze({ immediate: true });
      break;
    case "reload-route":
      await bootstrap({
        successMessage: "Route reloaded from disk.",
        notifyOnSuccess: true,
        notifyOnError: true,
      });
      break;
    case "save-route":
      await saveRoute();
      break;
    case "export-route":
      await exportRoute();
      break;
    case "render-route":
      await renderRoute();
      break;
    case "apply-scale-preset":
      applyScalePreset(actionTarget.dataset.preset);
      break;
    case "apply-canvas-ratio-preset":
      applyCanvasRatioPreset(actionTarget.dataset.preset);
      break;
    case "add-level":
      state.route.levels.push({ label: "", elevationM: 0 });
      markDirty("Added a reference level.");
      break;
    case "remove-level": {
      const removeIndex = Number(index);
      const [removedLevel] = state.route.levels.splice(removeIndex, 1);
      clearRemovedLevelReferences(removedLevel?.label || "");
      markDirty("Removed a reference level.");
      break;
    }
    case "add-segment":
      state.route.segments.push(defaultSegment());
      markDirty("Added a route segment.");
      break;
    case "remove-segment":
      state.route.segments.splice(Number(index), 1);
      markDirty("Removed a route segment.");
      break;
    case "duplicate-segment":
      state.route.segments.splice(Number(index) + 1, 0, structuredClone(state.route.segments[Number(index)]));
      markDirty("Duplicated a route segment.");
      break;
    case "move-segment-up":
      moveSegment(Number(index), -1);
      break;
    case "move-segment-down":
      moveSegment(Number(index), 1);
      break;
    default:
      break;
  }
}

function handleKeyDown(event) {
  if (event.key === "Escape" && state.isPreviewModalOpen) {
    closePreviewModal();
  }
}

function handleChange(event) {
  const target = event.target;
  if (!target.dataset.kind || !state.route) {
    return;
  }

  const { kind, field, index } = target.dataset;
  const numericFields = new Set([
    "xScale",
    "yScale",
    "gridWidthM",
    "gridHeightM",
    "canvasPaddingX",
    "canvasPaddingTop",
    "canvasPaddingBottom",
    "canvasRatioWidth",
    "canvasRatioHeight",
    "elevationM",
    "lengthM",
    "verticalM",
  ]);
  const checkboxFields = new Set(["showLegend", "showOverallLos"]);
  const value = checkboxFields.has(field) ? target.checked : numericFields.has(field) ? toNumber(target.value) : target.value;
  const activeScalePresetBeforeGridChange = kind === "meta" && ["gridWidthM", "gridHeightM"].includes(field)
    ? findActiveScalePreset()
    : null;
  let dirtyMessage = "Edits are in memory. Backend validation is updating...";

  if (kind === "meta") {
    state.route.meta[field] = value;
    if (["canvasRatioWidth", "canvasRatioHeight"].includes(field)) {
      state.route.meta.canvasRatioPreset = "custom";
      dirtyMessage = "Updated custom canvas ratio.";
    }
    if (activeScalePresetBeforeGridChange) {
      const values = calculateScalePresetValues(activeScalePresetBeforeGridChange);
      if (values) {
        Object.assign(state.route.meta, values);
        dirtyMessage = `Updated grid size and recalculated ${activeScalePresetBeforeGridChange.label} scale preset.`;
      }
    }
  } else if (kind === "scenario") {
    state.route.scenario[field] = value;
  } else if (kind === "origin") {
    state.route.origin[field] = value;
  } else if (kind === "destination") {
    state.route.destination[field] = value;
  } else if (kind === "route") {
    state.route[field] = value;
  } else if (kind === "level") {
    const level = state.route.levels[Number(index)];
    const previousLabel = String(level.label ?? "");
    level[field] = value;
    if (field === "label") {
      renameLevelReferences(previousLabel, value);
    }
  } else if (kind === "segment") {
    const segment = state.route.segments[Number(index)];
    segment[field] = value;
    if (field === "verticalM") {
      segment.targetLevel = "";
    }
  }

  markDirty(dirtyMessage);
}

async function handleJsonImport(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    state.route = hydrateRoute(JSON.parse(text));
    state.analysis = null;
    state.dirty = true;
    bumpRouteEditRevision();
    setStatus(`Loaded ${file.name} into the editor. Analysis is updating...`, "warning");
    renderApp();
    scheduleAnalyze({ immediate: true });
    notify(`Loaded ${file.name} into the editor.`, "warning");
  } catch (error) {
    const message = `Could not import JSON: ${error.message}`;
    setStatus(message, "error");
    notify(message, "error");
  } finally {
    event.target.value = "";
  }
}

async function saveRoute() {
  await sendRoute("/api/save-route", "Route JSON saved to disk.");
}

async function exportRoute() {
  await sendRoute("/api/export-route", "CSV exported for the Processing renderer.");
}

async function renderRoute() {
  const payload = await sendRoute("/api/render-route", `Preview rendered. Download to save to ${savedPreviewPathText()}.`);
  if (payload?.preview?.hasPreview) {
    openPreviewModal();
  }
}

async function sendRoute(endpoint, successMessage) {
  if (!state.route) {
    return null;
  }

  const actionLabel =
    endpoint === "/api/render-route"
      ? "Rendering diagram..."
      : endpoint === "/api/export-route"
        ? "Exporting CSV..."
        : "Saving route JSON...";
  setStatus(actionLabel);
  renderApp();

  try {
    const payload = await postJson(endpoint, { route: state.route });
    applyServerPayload(payload, { dirty: false, statusMessage: successMessage });
    notify(successMessage, "success");
    return payload;
  } catch (error) {
    if (error.payload?.route) {
      applyServerPayload(error.payload, {
        dirty: state.dirty,
        statusMessage: error.payload.errors?.[0] || error.message,
      });
    } else {
      setStatus(error.message, "error");
      renderApp();
    }
    notify(error.payload?.errors?.[0] || error.message, "error");
    return null;
  }
}

function scheduleAnalyze(options = {}) {
  const { immediate = false } = options;
  if (!state.route) {
    return;
  }

  if (state.analyzeTimerId) {
    window.clearTimeout(state.analyzeTimerId);
    state.analyzeTimerId = 0;
  }

  const runAnalyze = async () => {
    const requestToken = ++state.analyzeRequestToken;
    const requestRevision = state.routeEditRevision;
    const routeSnapshot = structuredClone(state.route);
    state.isAnalyzing = true;
    renderStatus();
    try {
      const payload = await postJson("/api/analyze-route", { route: routeSnapshot });
      if (requestToken < state.latestAppliedAnalysisToken || requestRevision !== state.routeEditRevision) {
        return;
      }
      state.latestAppliedAnalysisToken = requestToken;
      applyServerPayload(payload, {
        dirty: true,
        statusMessage: "Route validation updated. Save JSON or export when ready.",
      });
    } catch (error) {
      if (requestToken < state.latestAppliedAnalysisToken || requestRevision !== state.routeEditRevision) {
        return;
      }
      if (error.payload?.route) {
        applyServerPayload(error.payload, {
          dirty: true,
          statusMessage: error.payload.errors?.[0] || error.message,
        });
      } else {
        state.isAnalyzing = false;
        setStatus(error.message, "error");
        renderApp();
      }
    } finally {
      if (requestToken >= state.latestAppliedAnalysisToken) {
        state.isAnalyzing = false;
        renderStatus();
      }
    }
  };

  if (immediate) {
    void runAnalyze();
  } else {
    state.analyzeTimerId = window.setTimeout(() => {
      state.analyzeTimerId = 0;
      void runAnalyze();
    }, ANALYZE_DEBOUNCE_MS);
  }
}

function applyServerPayload(payload, options = {}) {
  const {
    dirty = false,
    statusMessage = payload.message || "Route validation updated.",
  } = options;

  state.route = hydrateRoute(mergeLocalCanvasRatioWhenMissing(payload.route));
  state.analysis = hydrateAnalysis(payload.analysis);
  state.options = payload.options || state.options;
  state.files = payload.files || state.files;
  state.preview = normalizePreview(payload.preview);
  state.dirty = dirty;
  state.isAnalyzing = false;
  setStatus(statusMessage, payload.ok === false ? "error" : dirty ? "warning" : "success");
  renderApp();
}

function mergeLocalCanvasRatioWhenMissing(route) {
  if (!route || typeof route !== "object") {
    return route;
  }
  const meta = route.meta || {};
  if (Object.prototype.hasOwnProperty.call(meta, "canvasRatioPreset")) {
    return route;
  }
  const localMeta = state.route?.meta;
  if (!localMeta) {
    return route;
  }

  return {
    ...route,
    meta: {
      ...meta,
      canvasRatioPreset: localMeta.canvasRatioPreset,
      canvasRatioWidth: localMeta.canvasRatioWidth,
      canvasRatioHeight: localMeta.canvasRatioHeight,
    },
  };
}

function hydrateAnalysis(analysis) {
  if (!analysis || typeof analysis !== "object") {
    return {
      route: defaultRouteAnalysis(),
      segments: [],
      assumptions: [],
      warnings: [],
      validation: defaultValidationState(),
    };
  }
  return {
    route: { ...defaultRouteAnalysis(), ...(analysis.route || {}) },
    segments: Array.isArray(analysis.segments) ? analysis.segments : [],
    assumptions: Array.isArray(analysis.assumptions) ? analysis.assumptions : [],
    warnings: Array.isArray(analysis.warnings) ? analysis.warnings : [],
    validation: { ...defaultValidationState(), ...(analysis.validation || {}) },
  };
}

function defaultRouteAnalysis() {
  return {
    totalLengthM: 0,
    totalVerticalM: 0,
    totalTimeS: 0,
    totalImpedanceS: 0,
    overallLos: "",
    suggestedOverallLos: "",
    startElevationM: 0,
    finalElevationM: 0,
    segmentCount: 0,
  };
}

function defaultValidationState() {
  return {
    errors: [],
    warnings: [],
    rendererErrors: [],
    rendererWarnings: [],
    canSave: true,
    canExport: false,
    canRender: false,
  };
}

function renderApp() {
  if (!state.route || !state.options) {
    return;
  }

  document.getElementById("left-column").innerHTML = renderLeftColumn();
  document.getElementById("center-column").innerHTML = renderCenterColumn();
  document.getElementById("right-column").innerHTML = renderRightColumn();
  renderStatus();
  renderPreviewModal();
}

function renderLeftColumn() {
  const levelOptions = buildLevelOptions();
  return `
    <section class="card">
      <div class="card-header">
        <div>
          <h2>Route Settings</h2>
          <p class="card-subtitle">JSON is the canonical route model. CSV is now a renderer adapter export.</p>
        </div>
      </div>
      <div class="grid-two">
        ${fieldText("Route Name", "meta", "routeName", state.route.meta.routeName)}
        ${fieldSelect("Overall LOS", "meta", "overallLos", state.route.meta.overallLos, state.options.losOptions)}
        ${fieldSelect("H/V Label Position", "meta", "destinationMetricLabelPosition", state.route.meta.destinationMetricLabelPosition, state.options.destinationMetricLabelPositions)}
        ${fieldNumber("Grid Width (m)", "meta", "gridWidthM", state.route.meta.gridWidthM, 0.001)}
        ${fieldNumber("Grid Height (m)", "meta", "gridHeightM", state.route.meta.gridHeightM, 0.001)}
      </div>
      ${renderScalePresetPanel()}
      ${renderCanvasRatioPanel()}
      <div class="grid-two toggle-grid">
        ${fieldCheckbox("Show Legend", "meta", "showLegend", state.route.meta.showLegend)}
        ${fieldCheckbox("Show Overall LOS Badge", "meta", "showOverallLos", state.route.meta.showOverallLos)}
      </div>
      <p class="hint">Canvas padding now controls renderer framing instead of a fixed hardcoded aspect ratio.</p>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2>Terminals</h2>
          <p class="card-subtitle">Terminal pictograms remain presentation metadata for the Processing renderer.</p>
        </div>
      </div>
      <div class="grid-two">
        ${fieldSelect("Origin", "origin", "type", state.route.origin.type, state.options.originTypes, true)}
        ${fieldSelect("Destination", "destination", "type", state.route.destination.type, state.options.destinationTypes, true)}
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2>Start Level</h2>
          <p class="card-subtitle">The route baseline anchors all derived elevations and level targeting.</p>
        </div>
      </div>
      ${fieldSelect("Start Level", "route", "startLevel", state.route.startLevel, levelOptions, true)}
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2>Levels</h2>
          <p class="card-subtitle">Reference levels remain editable and can drive segment vertical geometry.</p>
        </div>
        <button class="button secondary" data-action="add-level">Add Level</button>
      </div>
      <div class="stack">
        ${state.route.levels.map((level, index) => `
          <div class="level-row grid-two">
            ${fieldText("Label", "level", "label", level.label, index)}
            ${fieldNumber("Elevation (m)", "level", "elevationM", level.elevationM, 0.1, index)}
            <div class="mini-actions">
              <button class="button ghost" data-action="remove-level" data-index="${index}">Remove</button>
            </div>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2>Working Files</h2>
          <p class="card-subtitle">Save JSON for route state, export CSV for the Processing sketch, render to preview the current adapter output.</p>
        </div>
      </div>
      <div class="stack">
        <span class="pill"><strong>JSON</strong> <span class="mono">${escapeHtml(state.files?.json || "")}</span></span>
        <span class="pill"><strong>CSV</strong> <span class="mono">${escapeHtml(state.files?.csv || "")}</span></span>
        <span class="pill"><strong>Preview</strong> <span class="mono">${escapeHtml(state.files?.preview || "")}</span></span>
      </div>
    </section>
  `;
}

function renderScalePresetPanel() {
  const activePreset = findActiveScalePreset();
  return `
    <div class="scale-preset-panel">
      <div class="scale-preset-header">
        <strong>Scale Preset</strong>
        <span>Updates horizontal scale, vertical scale, and canvas padding together.</span>
      </div>
      <div class="scale-preset-grid">
        ${SCALE_PRESETS.map((preset) => {
          const values = calculateScalePresetValues(preset);
          const isActive = activePreset?.id === preset.id;
          return `
            <button
              class="scale-preset ${isActive ? "is-active" : ""}"
              type="button"
              data-action="apply-scale-preset"
              data-preset="${escapeHtml(preset.id)}"
              aria-pressed="${isActive}"
              ${values ? "" : "disabled"}
            >
              <strong>${escapeHtml(preset.label)}</strong>
              <span>${escapeHtml(preset.description)}</span>
              <small>${formatScalePresetValues(values)}</small>
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function findActiveScalePreset() {
  return SCALE_PRESETS.find((preset) => {
    const values = calculateScalePresetValues(preset);
    return values && Object.entries(values).every(([field, value]) => scalePresetValueMatches(field, state.route.meta[field], value));
  }) || null;
}

function formatScalePresetValues(values) {
  if (!values) {
    return "Enter positive grid size";
  }
  return [
    `H ${formatScaleValue(values.xScale)}`,
    `V ${formatScaleValue(values.yScale)}`,
    `Pad ${formatMetric(values.canvasPaddingX)}/${formatMetric(values.canvasPaddingTop)}/${formatMetric(values.canvasPaddingBottom)}`,
  ].join(" / ");
}

function calculateScalePresetValues(preset) {
  const gridWidthM = toNumber(state.route?.meta?.gridWidthM);
  const gridHeightM = toNumber(state.route?.meta?.gridHeightM);
  if (gridWidthM <= 0 || gridHeightM <= 0) {
    return null;
  }

  return {
    xScale: roundScale(preset.targetGridWidthPx / gridWidthM),
    yScale: roundScale(preset.targetGridHeightPx / gridHeightM),
    canvasPaddingX: preset.canvasPaddingX,
    canvasPaddingTop: preset.canvasPaddingTop,
    canvasPaddingBottom: preset.canvasPaddingBottom,
  };
}

function scalePresetValueMatches(field, actual, expected) {
  const tolerance = ["xScale", "yScale"].includes(field) ? 0.0000005 : 0.0005;
  return Math.abs(toNumber(actual) - expected) <= tolerance;
}

function renderCanvasRatioPanel() {
  const activePreset = normalizeCanvasRatioPreset(state.route.meta.canvasRatioPreset);
  const isCustom = activePreset === "custom";
  return `
    <div class="canvas-ratio-panel">
      <div class="canvas-ratio-header">
        <strong>Canvas Ratio</strong>
        <span>Expands the final canvas after route scale, grid size, and padding are applied.</span>
      </div>
      <div class="canvas-ratio-grid">
        ${CANVAS_RATIO_PRESETS.map((preset) => {
          const isActive = activePreset === preset.id;
          return `
            <button
              class="canvas-ratio ${isActive ? "is-active" : ""}"
              type="button"
              data-action="apply-canvas-ratio-preset"
              data-preset="${escapeHtml(preset.id)}"
              aria-pressed="${isActive}"
            >
              <strong>${escapeHtml(preset.label)}</strong>
              <span>${escapeHtml(preset.description)}</span>
            </button>
          `;
        }).join("")}
      </div>
      ${isCustom ? `
        <div class="grid-two canvas-ratio-custom">
          ${fieldNumber("Ratio Width", "meta", "canvasRatioWidth", state.route.meta.canvasRatioWidth, 0.001)}
          ${fieldNumber("Ratio Height", "meta", "canvasRatioHeight", state.route.meta.canvasRatioHeight, 0.001)}
        </div>
      ` : ""}
    </div>
  `;
}

function renderCenterColumn() {
  const emptyTemplate = document.getElementById("empty-state-template").innerHTML;
  return `
    <section class="card">
      <div class="card-header">
        <div>
          <h2>Segments</h2>
          <p class="card-subtitle">Author the route in sequence. Backend-normalized geometry updates after each edit.</p>
        </div>
        <div class="pill-row">
          <span class="chip"><strong>${state.route.segments.length}</strong> segment${state.route.segments.length === 1 ? "" : "s"}</span>
          <button class="button secondary" data-action="add-segment">Add Segment</button>
        </div>
      </div>
      <div class="stack">
        ${state.route.segments.length === 0 ? emptyTemplate : state.route.segments.map((segment, index) => renderSegmentCard(segment, index)).join("")}
      </div>
    </section>
  `;
}

function renderSegmentCard(segment, index) {
  const computed = state.analysis?.segments?.[index] || {};
  const levelOptions = [CUSTOM_VERTICAL_OPTION, ...buildLevelOptions()];
  const targetLocked = Boolean(segment.targetLevel);
  return `
    <article class="segment-card">
      <div class="segment-title">
        <div class="segment-index">${index + 1}</div>
        <div class="segment-title-main">
          <h3>Segment ${index + 1}</h3>
          <div class="segment-meta">
            <span class="chip"><strong>LOS</strong> ${escapeHtml(segment.los || "-")}</span>
            <span class="chip">${escapeHtml(segment.kind || "walkway")}</span>
            <span class="chip">${formatMetric(computed.startElevationM)} to ${formatMetric(computed.endElevationM)} m elevation</span>
          </div>
        </div>
        <div class="segment-actions">
          <button class="button ghost" data-action="move-segment-up" data-index="${index}" ${index === 0 ? "disabled" : ""}>Up</button>
          <button class="button ghost" data-action="move-segment-down" data-index="${index}" ${index === state.route.segments.length - 1 ? "disabled" : ""}>Down</button>
          <button class="button ghost" data-action="duplicate-segment" data-index="${index}">Duplicate</button>
          <button class="button ghost" data-action="remove-segment" data-index="${index}">Delete</button>
        </div>
      </div>

      <div class="grid-four">
        ${fieldNumber("Horizontal Length (m)", "segment", "lengthM", segment.lengthM, 0.1, index)}
        ${fieldSelect("Target Level", "segment", "targetLevel", segment.targetLevel, levelOptions, false, index)}
        ${fieldNumber("Vertical Change (m)", "segment", "verticalM", segment.verticalM, 0.1, index, targetLocked)}
        ${fieldSelect("Weather", "segment", "weather", segment.weather, state.options.weatherOptions, false, index)}
      </div>

      <div class="grid-three">
        ${fieldSelect("Segment LOS", "segment", "los", segment.los, state.options.losOptions, false, index)}
        ${fieldSelect("Segment Start Marker", "segment", "startMarker", segment.startMarker, state.options.startMarkers, false, index)}
        ${fieldSelect("Mid-Segment Marker", "segment", "midMarker", segment.midMarker, state.options.midMarkers, false, index)}
      </div>

      <div class="summary-grid">
        ${summaryStat("Manual LOS", computed.los || segment.los || "-")}
        ${summaryStat("Horizontal Length", `${formatMetric(computed.lengthM ?? segment.lengthM)} m`)}
        ${summaryStat("Vertical Change", `${formatMetric(computed.verticalM ?? segment.verticalM)} m`)}
        ${summaryStat("Elevations", `${formatMetric(computed.startElevationM)} to ${formatMetric(computed.endElevationM)} m`)}
      </div>
    </article>
  `;
}

function renderRightColumn() {
  const routeSummary = state.analysis?.route || defaultRouteAnalysis();
  const validation = state.analysis?.validation || defaultValidationState();
  const assumptions = state.analysis?.assumptions || [];
  const warnings = state.analysis?.warnings || [];
  const previewSrc = buildPreviewUrl();
  const hasValidationIssues = validation.errors.length || validation.rendererErrors.length || assumptions.length || warnings.length;
  const validationClass = validation.errors.length
    ? "errors"
    : hasValidationIssues
      ? "warnings"
      : "success";
  const validationTitle = validation.errors.length
    ? `${validation.errors.length} blocking issue${validation.errors.length === 1 ? "" : "s"}`
    : hasValidationIssues
      ? `${validation.rendererErrors.length + assumptions.length + warnings.length} issue${validation.rendererErrors.length + assumptions.length + warnings.length === 1 ? "" : "s"} to review`
      : "No blocking issues";
  const previewSubtitle = state.preview.hasPreview
    ? state.preview.isTemporary
      ? `Preview rendered but not yet saved. Click the image to open it, then Download to write ${savedPreviewPathText()}.`
      : `Saved preview path: ${savedPreviewPathText()}. Click the image to enlarge it.`
    : "Press Render Diagram to generate a preview.";

  return `
    <section class="card">
      <div class="card-header">
        <div>
          <h2>Preview</h2>
          <p class="card-subtitle">${escapeHtml(previewSubtitle)}</p>
        </div>
      </div>
      ${state.preview.hasPreview ? `
        <button class="preview-launcher" type="button" data-action="open-preview">
          <div class="preview-frame">
            <img src="${previewSrc}" alt="Rendered route preview">
          </div>
        </button>
      ` : `
        <div class="preview-empty">
          <p>No preview available yet.</p>
        </div>
      `}
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2>Route Summary</h2>
          <p class="card-subtitle">Normalized geometry and renderer readiness for the active route.</p>
        </div>
      </div>
      <div class="summary-grid">
        ${summaryStat("Segments", routeSummary.segmentCount)}
        ${summaryStat("Start Elevation", `${formatMetric(routeSummary.startElevationM)} m`)}
        ${summaryStat("Total Length", `${formatMetric(routeSummary.totalLengthM)} m`)}
        ${summaryStat("Total Vertical", `${formatMetric(routeSummary.totalVerticalM)} m`)}
        ${summaryStat("Final Elevation", `${formatMetric(routeSummary.finalElevationM)} m`)}
        ${summaryStat("Overall LOS", routeSummary.overallLos || "-")}
        ${summaryStat("Worst Segment LOS", routeSummary.suggestedOverallLos || "-")}
      </div>
      <div class="pill-row">
        <span class="pill"><strong>Dirty</strong> ${state.dirty ? "Yes" : "No"}</span>
        <span class="pill"><strong>Updating</strong> ${state.isAnalyzing ? "Yes" : "No"}</span>
        <span class="pill"><strong>Save</strong> ${validation.canSave ? "Ready" : "Blocked"}</span>
        <span class="pill"><strong>Export</strong> ${validation.canExport ? "Ready" : "Blocked"}</span>
      </div>
    </section>

    <section class="message-panel ${validationClass}">
      <div class="card-header">
        <div>
          <h2>Validation</h2>
          <p class="card-subtitle">${escapeHtml(validationTitle)}</p>
        </div>
      </div>
      ${hasValidationIssues ? `
        <ol class="message-list">
          ${validation.errors.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}
          ${validation.rendererErrors.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}
          ${assumptions.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}
          ${warnings.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}
        </ol>
      ` : `
        <div class="pill-row">
          <span class="chip success"><strong>Save</strong> enabled</span>
          <span class="chip ${validation.canExport ? "success" : "warning"}"><strong>Export</strong> ${validation.canExport ? "ready" : "waiting"}</span>
          <span class="chip ${validation.canRender ? "success" : "warning"}"><strong>Render</strong> ${validation.canRender ? "ready" : "waiting"}</span>
        </div>
      `}
    </section>
  `;
}

function renderStatus() {
  const validation = state.analysis?.validation || defaultValidationState();
  const routeName = state.route?.meta?.routeName || "Untitled Route";
  const segmentCount = state.analysis?.route?.segmentCount ?? state.route?.segments?.length ?? 0;
  const exportState = validation.rendererErrors.length
    ? "Renderer blocked"
    : validation.errors.length
      ? "Export blocked"
      : "Ready to export";
  const statusLine = [
    state.status.tone === "error" ? `<strong>${escapeHtml(state.status.message)}</strong>` : escapeHtml(state.status.message),
    `Route: ${escapeHtml(routeName)}`,
    `${segmentCount} segment${segmentCount === 1 ? "" : "s"}`,
    state.isAnalyzing ? "Analyzing" : exportState,
  ].join(" / ");

  document.getElementById("status-text").innerHTML = statusLine;
  document.querySelector('[data-action="save-route"]').disabled = !state.route || !validation.canSave;
  document.querySelector('[data-action="export-route"]').disabled = !state.route || state.isAnalyzing || !validation.canExport;
  document.querySelector('[data-action="render-route"]').disabled = !state.route || state.isAnalyzing || !validation.canRender;
}

function buildLevelOptions() {
  return getRouteLevels(state.route).map((level) => ({ value: level.label, label: level.label }));
}

function getRouteLevels(route) {
  return (route?.levels || [])
    .filter((level) => level && (level.label || "").trim())
    .map((level) => ({
      ...level,
      label: String(level.label || "").trim(),
      elevationM: level.elevationM,
    }));
}

function sameLevelLabel(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function findLevelByLabel(levels, label) {
  return levels.find((level) => sameLevelLabel(level.label, label)) || null;
}

function inferStartLevelLabel(levels) {
  const zeroLevel = levels.find((level) => {
    const label = String(level.label || "").trim();
    return label && Math.abs(toNumber(level.elevationM)) < 0.01;
  });
  if (zeroLevel) {
    return String(zeroLevel.label || "").trim();
  }
  const firstLevel = levels.find((level) => String(level.label || "").trim());
  return firstLevel ? String(firstLevel.label || "").trim() : "";
}

function renameLevelReferences(previousLabel, nextLabel) {
  if (!previousLabel) {
    return;
  }
  if (sameLevelLabel(state.route.startLevel, previousLabel)) {
    state.route.startLevel = String(nextLabel ?? "").trim();
  }
  state.route.segments.forEach((segment) => {
    if (sameLevelLabel(segment.targetLevel, previousLabel)) {
      segment.targetLevel = String(nextLabel ?? "").trim();
    }
  });
}

function clearRemovedLevelReferences(removedLabel) {
  if (!removedLabel) {
    return;
  }
  if (sameLevelLabel(state.route.startLevel, removedLabel)) {
    state.route.startLevel = inferStartLevelLabel(getRouteLevels(state.route));
  }
  state.route.segments.forEach((segment) => {
    if (sameLevelLabel(segment.targetLevel, removedLabel)) {
      segment.targetLevel = "";
    }
  });
}

function applyScalePreset(presetId) {
  const preset = SCALE_PRESETS.find((item) => item.id === presetId);
  if (!preset || !state.route) {
    return;
  }

  const values = calculateScalePresetValues(preset);
  if (!values) {
    return;
  }

  Object.assign(state.route.meta, values);
  markDirty(`Applied ${preset.label} scale preset.`);
}

function applyCanvasRatioPreset(presetId) {
  const preset = CANVAS_RATIO_PRESETS.find((item) => item.id === presetId);
  if (!preset || !state.route) {
    return;
  }

  state.route.meta.canvasRatioPreset = preset.id;
  if (preset.id === "custom") {
    if (toNumber(state.route.meta.canvasRatioWidth) <= 0) {
      state.route.meta.canvasRatioWidth = preset.width;
    }
    if (toNumber(state.route.meta.canvasRatioHeight) <= 0) {
      state.route.meta.canvasRatioHeight = preset.height;
    }
  } else {
    state.route.meta.canvasRatioWidth = preset.width;
    state.route.meta.canvasRatioHeight = preset.height;
  }
  markDirty(`Applied ${preset.label} canvas ratio.`);
}

function moveSegment(index, direction) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= state.route.segments.length) {
    return;
  }
  const [segment] = state.route.segments.splice(index, 1);
  state.route.segments.splice(nextIndex, 0, segment);
  markDirty("Reordered route segments.");
}

function markDirty(message) {
  bumpRouteEditRevision();
  state.dirty = true;
  setStatus(message, "warning");
  renderApp();
  scheduleAnalyze();
}

function bumpRouteEditRevision() {
  state.routeEditRevision += 1;
}

function setStatus(message, tone = "info") {
  state.status = { message, tone };
}

function defaultPreviewState() {
  return {
    hasPreview: false,
    version: 0,
    isTemporary: false,
    downloadPath: DEFAULT_PREVIEW_DOWNLOAD_PATH,
  };
}

function normalizePreview(preview) {
  const normalized = defaultPreviewState();
  if (!preview || typeof preview !== "object") {
    return normalized;
  }

  normalized.hasPreview = Boolean(preview.hasPreview);
  normalized.version = Number(preview.version) || 0;
  normalized.isTemporary = Boolean(preview.isTemporary);
  normalized.downloadPath = String(preview.downloadPath || DEFAULT_PREVIEW_DOWNLOAD_PATH);
  return normalized;
}

function buildPreviewUrl() {
  if (!state.preview.hasPreview) {
    return "";
  }
  const version = state.preview.version || Date.now();
  return `/api/preview-image?v=${version}`;
}

function savedPreviewPathText() {
  return state.preview.downloadPath || state.files?.preview || DEFAULT_PREVIEW_DOWNLOAD_PATH;
}

function openPreviewModal() {
  if (!state.preview.hasPreview) {
    return;
  }
  state.isPreviewModalOpen = true;
  renderPreviewModal();
}

function closePreviewModal() {
  if (!state.isPreviewModalOpen) {
    return;
  }
  state.isPreviewModalOpen = false;
  renderPreviewModal();
}

function renderPreviewModal() {
  const modal = document.getElementById("preview-modal");
  const modalSubtitle = document.getElementById("preview-modal-subtitle");
  const modalImage = document.getElementById("preview-modal-image");
  const modalEmpty = document.getElementById("preview-modal-empty");
  const downloadButton = document.getElementById("preview-download-button");
  if (!modal || !modalSubtitle || !modalImage || !modalEmpty || !downloadButton) {
    return;
  }

  const hasPreview = state.preview.hasPreview;
  const previewUrl = buildPreviewUrl();
  const detailText = hasPreview
    ? state.preview.isTemporary
      ? `Preview rendered. Click Download to save to ${savedPreviewPathText()}.`
      : `Preview already saved to ${savedPreviewPathText()}.`
    : "Render Diagram to generate a preview.";

  modal.hidden = !state.isPreviewModalOpen;
  modal.setAttribute("aria-hidden", String(!state.isPreviewModalOpen));
  modal.classList.toggle("is-open", state.isPreviewModalOpen);
  document.body.classList.toggle("modal-open", state.isPreviewModalOpen);

  modalSubtitle.textContent = detailText;
  modalImage.hidden = !hasPreview;
  modalEmpty.hidden = hasPreview;
  downloadButton.disabled = !state.preview.isTemporary;
  downloadButton.textContent = state.preview.isTemporary ? "Download" : "Saved";

  if (hasPreview) {
    modalImage.src = previewUrl;
  } else {
    modalImage.removeAttribute("src");
  }
}

async function downloadPreview() {
  setStatus(`Saving preview to ${savedPreviewPathText()}...`);
  try {
    const payload = await postJson("/api/download-preview", {});
    state.preview = normalizePreview(payload.preview);
    state.files = { ...(state.files || {}), ...(payload.files || {}) };
    setStatus(payload.message, "success");
    closePreviewModal();
    renderApp();
    notify(payload.message, "success");
  } catch (error) {
    setStatus(error.message, "error");
    renderPreviewModal();
    notify(error.message, "error");
  }
}

function notify(message, tone = "info") {
  const notification = {
    id: state.nextNotificationId,
    message,
    tone,
  };

  state.nextNotificationId += 1;
  const nextNotifications = [notification, ...state.notifications].slice(0, MAX_VISIBLE_NOTIFICATIONS);
  const nextIds = new Set(nextNotifications.map((item) => item.id));
  state.notifications
    .filter((item) => !nextIds.has(item.id))
    .forEach((item) => clearNotificationTimer(item.id));
  state.notifications = nextNotifications;
  renderNotifications();

  if (tone !== "error") {
    scheduleNotificationDismiss(notification.id);
  }
}

function dismissNotification(id) {
  clearNotificationTimer(id);
  if (!state.notifications.some((item) => item.id === id)) {
    return;
  }
  state.notifications = state.notifications.filter((item) => item.id !== id);
  renderNotifications();
}

function scheduleNotificationDismiss(id) {
  clearNotificationTimer(id);
  const timeoutId = window.setTimeout(() => dismissNotification(id), NOTIFICATION_TIMEOUT_MS);
  notificationTimeouts.set(id, timeoutId);
}

function clearNotificationTimer(id) {
  const timeoutId = notificationTimeouts.get(id);
  if (timeoutId) {
    window.clearTimeout(timeoutId);
    notificationTimeouts.delete(id);
  }
}

function renderNotifications() {
  const stack = document.getElementById("toast-stack");
  if (!stack) {
    return;
  }
  stack.innerHTML = state.notifications.map(renderNotification).join("");
}

function renderNotification(notification) {
  return `
    <article class="toast" data-tone="${escapeHtml(notification.tone)}" role="${notification.tone === "error" ? "alert" : "status"}">
      <div class="toast-copy">
        <p class="toast-label">${escapeHtml(notificationToneLabel(notification.tone))}</p>
        <p class="toast-message">${escapeHtml(notification.message)}</p>
      </div>
      <button class="toast-close" type="button" data-action="dismiss-notification" data-id="${notification.id}" aria-label="Dismiss notification">
        Close
      </button>
    </article>
  `;
}

function notificationToneLabel(tone) {
  if (tone === "success") return "Success";
  if (tone === "warning") return "Warning";
  if (tone === "error") return "Error";
  return "Notice";
}

async function getJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.errors?.[0] || "Request failed.");
    error.errors = payload.errors || [];
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function postJson(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.errors?.[0] || "Request failed.");
    error.errors = payload.errors || [];
    error.payload = payload;
    throw error;
  }
  return payload;
}

function fieldText(label, kind, field, value, index = "") {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input type="text" data-kind="${kind}" data-field="${field}" ${index !== "" ? `data-index="${index}"` : ""} value="${escapeHtml(value ?? "")}">
    </label>
  `;
}

function fieldNumber(label, kind, field, value, step, index = "", readOnly = false) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input type="number" data-kind="${kind}" data-field="${field}" ${index !== "" ? `data-index="${index}"` : ""} step="${step}" value="${escapeHtml(value ?? 0)}" ${readOnly ? "readonly" : ""}>
    </label>
  `;
}

function fieldCheckbox(label, kind, field, checked, index = "") {
  return `
    <label class="field-checkbox">
      <input type="checkbox" data-kind="${kind}" data-field="${field}" ${index !== "" ? `data-index="${index}"` : ""} ${checked ? "checked" : ""}>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function fieldSelect(label, kind, field, value, options, includePlaceholder = false, index = "") {
  const optionList = includePlaceholder ? [PLACEHOLDER_OPTION, ...options] : options;
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select data-kind="${kind}" data-field="${field}" ${index !== "" ? `data-index="${index}"` : ""}>
        ${optionList.map((option) => `
          <option value="${escapeHtml(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label)}</option>
        `).join("")}
      </select>
    </label>
  `;
}

function summaryStat(label, value) {
  return `
    <div class="summary-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value ?? "-"))}</strong>
    </div>
  `;
}

function defaultSegment() {
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
    computed: {},
  };
}

function createEmptyRoute() {
  return {
    version: 3,
    meta: {
      routeName: "New Route",
      xScale: 1.333333333,
      yScale: 12.5,
      gridWidthM: 75,
      gridHeightM: 4,
      showLegend: true,
      showOverallLos: true,
      overallLos: "C",
      legacyOverallLos: "",
      destinationMetricLabelPosition: "right",
      canvasPaddingX: 140,
      canvasPaddingTop: 60,
      canvasPaddingBottom: 160,
      canvasRatioPreset: "auto",
      canvasRatioWidth: 16,
      canvasRatioHeight: 9,
    },
    scenario: {
      name: "Base Scenario",
      standard: "fruin_hcm_v1",
      demandPpm: 25,
      userProfile: "standard_adult",
    },
    origin: { type: "" },
    destination: { type: "" },
    startLevel: "GF",
    levels: [
      { label: "GF", elevationM: 0 },
      { label: "L1", elevationM: 13 },
    ],
    segments: [],
    computed: {},
  };
}

function hydrateRoute(route) {
  const empty = createEmptyRoute();
  const nextRoute = {
    ...empty,
    ...route,
    meta: { ...empty.meta, ...(route?.meta || {}) },
    scenario: { ...empty.scenario, ...(route?.scenario || {}) },
    origin: { ...empty.origin, ...(route?.origin || {}) },
    destination: { ...empty.destination, ...(route?.destination || {}) },
    levels: Array.isArray(route?.levels) ? route.levels.map((level) => ({
      label: String(level.label ?? ""),
      elevationM: toNumber(level.elevationM),
    })) : empty.levels,
    segments: Array.isArray(route?.segments) ? route.segments.map((segment) => ({
      ...defaultSegment(),
      ...segment,
      lengthM: toNumber(segment.lengthM),
      verticalM: toNumber(segment.verticalM),
      targetLevel: String(segment.targetLevel ?? ""),
      weather: String(segment.weather ?? "open"),
      startMarker: String(segment.startMarker ?? "none"),
      midMarker: String(segment.midMarker ?? "none"),
      los: normalizeLos(segment.los ?? segment.legacyLos ?? "C"),
      kind: String(segment.kind ?? "walkway"),
      effectiveWidthM: toNumber(segment.effectiveWidthM),
      fixedDelayS: toNumber(segment.fixedDelayS),
      queueDelayS: toNumber(segment.queueDelayS),
      capacityFactor: toNumber(segment.capacityFactor),
      legacyLos: String(segment.legacyLos ?? ""),
      computed: segment.computed || {},
    })) : [],
  };

  nextRoute.meta.xScale = toNumber(nextRoute.meta.xScale);
  nextRoute.meta.yScale = toNumber(nextRoute.meta.yScale);
  nextRoute.meta.gridWidthM = toNumber(nextRoute.meta.gridWidthM);
  nextRoute.meta.gridHeightM = toNumber(nextRoute.meta.gridHeightM);
  nextRoute.meta.showLegend = toBoolean(nextRoute.meta.showLegend, true);
  nextRoute.meta.showOverallLos = toBoolean(nextRoute.meta.showOverallLos, true);
  nextRoute.meta.overallLos = normalizeLos(nextRoute.meta.overallLos ?? nextRoute.meta.legacyOverallLos ?? "C");
  nextRoute.meta.destinationMetricLabelPosition = normalizeDestinationMetricLabelPosition(nextRoute.meta.destinationMetricLabelPosition);
  nextRoute.meta.canvasPaddingX = toNumber(nextRoute.meta.canvasPaddingX);
  nextRoute.meta.canvasPaddingTop = toNumber(nextRoute.meta.canvasPaddingTop);
  nextRoute.meta.canvasPaddingBottom = toNumber(nextRoute.meta.canvasPaddingBottom);
  nextRoute.meta.canvasRatioPreset = normalizeCanvasRatioPreset(nextRoute.meta.canvasRatioPreset);
  if (nextRoute.meta.canvasRatioPreset === "custom") {
    nextRoute.meta.canvasRatioWidth = toNumber(nextRoute.meta.canvasRatioWidth);
    nextRoute.meta.canvasRatioHeight = toNumber(nextRoute.meta.canvasRatioHeight);
  } else {
    const preset = canvasRatioPresetValues(nextRoute.meta.canvasRatioPreset);
    nextRoute.meta.canvasRatioWidth = preset.width;
    nextRoute.meta.canvasRatioHeight = preset.height;
  }
  nextRoute.scenario.demandPpm = toNumber(nextRoute.scenario.demandPpm);
  nextRoute.startLevel = String(nextRoute.startLevel || "");
  return nextRoute;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value, defaultValue = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return defaultValue;
}

function normalizeDestinationMetricLabelPosition(value) {
  const normalized = String(value ?? "right").trim().toLowerCase();
  return ["right", "above", "below"].includes(normalized) ? normalized : "right";
}

function normalizeCanvasRatioPreset(value) {
  const normalized = String(value ?? "auto").trim().toLowerCase();
  return CANVAS_RATIO_PRESETS.some((preset) => preset.id === normalized) ? normalized : "auto";
}

function canvasRatioPresetValues(presetId) {
  return CANVAS_RATIO_PRESETS.find((preset) => preset.id === presetId) || CANVAS_RATIO_PRESETS[0];
}

function normalizeLos(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return ["A", "B", "C", "D", "E", "F"].includes(normalized) ? normalized : "C";
}

function formatMetric(value) {
  const rounded = Math.round(toNumber(value) * 1000) / 1000;
  return (Math.abs(rounded) < 0.0005 ? 0 : rounded).toFixed(3).replace(/\.?0+$/, "");
}

function roundScale(value) {
  const rounded = Math.round(toNumber(value) * 1000000000) / 1000000000;
  return Math.abs(rounded) < 0.0000005 ? 0 : rounded;
}

function formatScaleValue(value) {
  const rounded = roundScale(value);
  return rounded.toFixed(9).replace(/\.?0+$/, "");
}

function formatSeconds(value) {
  const seconds = Math.round(toNumber(value));
  return `${seconds}s`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
