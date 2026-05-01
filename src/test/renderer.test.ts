import { describe, expect, it } from "vitest";
import { sampleRoutes } from "../data/samples";
import { analyzeRoute } from "../domain/model";
import { renderRouteSvg } from "../renderer/svgRenderer";

describe("browser SVG renderer", () => {
  it("renders a modern inline SVG diagram without raster pictograms", async () => {
    const { route, analysis } = analyzeRoute(sampleRoutes[0].route);
    const svg = renderRouteSvg(route, analysis);
    const serialized = new XMLSerializer().serializeToString(svg);

    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(Number(svg.getAttribute("width"))).toBeGreaterThan(900);
    expect(serialized).toContain("shelter-hatch");
    expect(serialized).toContain("JLOS route diagram");
    expect(serialized).not.toContain("data:image/png;base64");
  });

  it("keeps LOS letters visible in the rendered output", async () => {
    const { route, analysis } = analyzeRoute(sampleRoutes[1].route);
    route.meta.showLegend = true;
    const serialized = new XMLSerializer().serializeToString(renderRouteSvg(route, analysis));

    for (const letter of ["A", "B", "C", "D", "E", "F"]) {
      expect(serialized).toContain(`>${letter}<`);
    }
  });
});
