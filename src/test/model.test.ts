import { describe, expect, it } from "vitest";
import { sampleRoutes } from "../data/samples";
import { analyzeRoute, createDefaultRoute, defaultSegment, routeToCsv } from "../domain/model";

describe("browser route model", () => {
  it("normalizes legacy sample JSON and computes route totals", () => {
    const { route, analysis } = analyzeRoute(sampleRoutes[0].route);

    expect(route.version).toBe(4);
    expect(route.meta.routeName).toBeTruthy();
    expect(analysis.route.segmentCount).toBe(route.segments.length);
    expect(analysis.route.totalLengthM).toBeGreaterThan(0);
    expect(analysis.validation.canRender).toBe(true);
  });

  it("validates required first-segment origin information", () => {
    const route = createDefaultRoute();
    route.segments.push(defaultSegment());

    const { analysis } = analyzeRoute(route);

    expect(analysis.validation.errors).toContain("Choose an origin icon or set a start marker on the first segment.");
    expect(analysis.validation.canRender).toBe(false);
  });

  it("exports a legacy-compatible CSV adapter", () => {
    const { route, analysis } = analyzeRoute(sampleRoutes[1].route);
    const csv = routeToCsv(route, analysis);

    expect(csv).toContain("X-Y SCALE>>");
    expect(csv).toContain("TOTAL>>");
    expect(csv.split("\n").length).toBeGreaterThanOrEqual(33);
  });
});
