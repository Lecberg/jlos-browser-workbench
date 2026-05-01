import type { Los } from "../domain/types";

export interface DiagramTheme {
  background: string;
  ink: string;
  muted: string;
  grid: string;
  frame: string;
  routeStroke: string;
  airConditioned: string;
  sheltered: string;
  surface: string;
  fontFamily: string;
  los: Record<Los, string>;
}

export const defaultDiagramTheme: DiagramTheme = {
  background: "#FFFFFF",
  ink: "#111827",
  muted: "#6B7280",
  grid: "#E5E7EB",
  frame: "#D1D5DB",
  routeStroke: "#111827",
  airConditioned: "#BAE6FD",
  sheltered: "#111827",
  surface: "#F9FAFB",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  los: {
    A: "#16A34A",
    B: "#65A30D",
    C: "#EAB308",
    D: "#F97316",
    E: "#DC2626",
    F: "#7F1D1D",
  },
};

export function losFill(letter: Los, opacity = 0.24, theme = defaultDiagramTheme): string {
  return hexToRgba(theme.los[letter], opacity);
}

export function hexToRgba(hex: string, opacity: number): string {
  const normalized = hex.replace("#", "");
  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}
