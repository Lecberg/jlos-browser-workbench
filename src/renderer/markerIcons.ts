import type { DiagramTheme } from "./theme";

const NS = "http://www.w3.org/2000/svg";

export const MARKER_LABELS: Record<string, string> = {
  metro: "METRO",
  bus: "BUS",
  brt: "BRT",
  coach: "COACH",
  rail: "RAIL",
  evtol: "EVTOL",
  minibus: "MINIBUS",
  ferry: "FERRY",
  taxi: "TAXI",
  uber: "UBER",
  bike: "BIKE",
  drop_off: "DROP-OFF",
  smart_car: "SMART CAR",
  escalator_up: "ESCALATOR",
  escalator_down: "ESCALATOR",
  stair_up: "STAIR",
  stair_down: "STAIR",
  bottleneck: "BOTTLENECK",
  turnstiles: "TURNSTILES",
  washroom: "WASHROOM",
  retail: "RETAIL",
  ticketing: "TICKETING",
  fnb: "F&B",
};

export const TERMINAL_MARKERS = new Set([
  "metro",
  "bus",
  "brt",
  "coach",
  "rail",
  "evtol",
  "minibus",
  "ferry",
  "taxi",
  "uber",
  "bike",
  "drop_off",
  "smart_car",
]);

export function createMarkerIcon(marker: string, theme: DiagramTheme, size = 28): SVGGElement {
  const group = svg("g");
  group.setAttribute("data-marker", marker);
  group.setAttribute("fill", "none");
  group.setAttribute("stroke", theme.ink);
  group.setAttribute("stroke-width", "2");
  group.setAttribute("stroke-linecap", "round");
  group.setAttribute("stroke-linejoin", "round");
  group.setAttribute("transform", `scale(${size / 24}) translate(-12 -12)`);

  switch (marker) {
    case "metro":
    case "rail":
      append(group, path("M6 3h12a2 2 0 0 1 2 2v10a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V5a2 2 0 0 1 2-2Z"));
      append(group, path("M7 8h10M8 15h.01M16 15h.01M9 21l2-2M15 19l2 2"));
      break;
    case "bus":
    case "brt":
    case "coach":
    case "minibus":
      append(group, rect(4, 5, 16, 12, 3));
      append(group, path("M7 17v2M17 17v2M7 9h10M8 14h.01M16 14h.01"));
      break;
    case "ferry":
      append(group, path("M5 16h14l-2 4H7l-2-4ZM7 16V8h10v8M9 8V5h6v3"));
      break;
    case "taxi":
    case "uber":
      append(group, path("M5 16h14M7 16l1.5-5h7L17 16M8 19h.01M16 19h.01M10 8h4"));
      break;
    case "bike":
      append(group, circle(6, 17, 3));
      append(group, circle(18, 17, 3));
      append(group, path("M9 17l3-7 2 7M12 10h3M11 7h2"));
      break;
    case "drop_off":
    case "smart_car":
      append(group, path("M6 17h12M7 17l1.5-6h7L17 17M8 20h.01M16 20h.01M12 5v4M9 8l3-3 3 3"));
      break;
    case "evtol":
      append(group, path("M12 6v12M4 10h16M7 7l-3 3 3 3M17 7l3 3-3 3"));
      break;
    case "escalator_up":
      append(group, path("M5 18h4l5-8h5M15 6h4v4M15 10l4-4M6 8h.01"));
      break;
    case "escalator_down":
      append(group, path("M5 10h4l5 8h5M15 18h4v-4M15 14l4 4M6 6h.01"));
      break;
    case "stair_up":
      append(group, path("M4 18h5v-4h5v-4h6M16 6h4v4M16 10l4-4"));
      break;
    case "stair_down":
      append(group, path("M4 10h5v4h5v4h6M16 18h4v-4M16 14l4 4"));
      break;
    case "bottleneck":
      append(group, path("M8 4v6l3 2-3 2v6M16 4v6l-3 2 3 2v6"));
      break;
    case "turnstiles":
      append(group, path("M7 4v16M17 4v16M7 12h10M12 7l5 5-5 5"));
      break;
    case "washroom":
      append(group, circle(8, 6, 2));
      append(group, circle(16, 6, 2));
      append(group, path("M6 21l1-10h2l1 10M14 21l1-10h2l1 10"));
      break;
    case "retail":
      append(group, path("M6 8h12l-1 12H7L6 8ZM9 8a3 3 0 0 1 6 0"));
      break;
    case "ticketing":
      append(group, path("M5 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v2Z"));
      append(group, path("M9 9h6M9 13h6"));
      break;
    case "fnb":
      append(group, path("M7 3v8M10 3v8M7 7h3M17 3v18M14 3c0 4 3 5 3 8"));
      break;
    default:
      append(group, circle(12, 12, 8));
      append(group, path("M12 8v4l3 2"));
      break;
  }

  return group;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(NS, tag);
}

function append(parent: SVGElement, child: SVGElement): void {
  parent.appendChild(child);
}

function path(d: string): SVGPathElement {
  const element = svg("path");
  element.setAttribute("d", d);
  return element;
}

function rect(x: number, y: number, width: number, height: number, radius = 0): SVGRectElement {
  const element = svg("rect");
  element.setAttribute("x", String(x));
  element.setAttribute("y", String(y));
  element.setAttribute("width", String(width));
  element.setAttribute("height", String(height));
  element.setAttribute("rx", String(radius));
  return element;
}

function circle(cx: number, cy: number, radius: number): SVGCircleElement {
  const element = svg("circle");
  element.setAttribute("cx", String(cx));
  element.setAttribute("cy", String(cy));
  element.setAttribute("r", String(radius));
  return element;
}
