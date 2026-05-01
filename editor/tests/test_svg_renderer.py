from __future__ import annotations

import sys
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import model  # noqa: E402
import svg_renderer  # noqa: E402


class SvgRendererTests(unittest.TestCase):
    def test_svg_generation_includes_route_geometry_and_embedded_icons(self) -> None:
        bundle = model.analyze_route(model.load_route())

        svg_text = svg_renderer.render_route_svg(
            bundle["route"],
            bundle["analysis"],
            model.JLOS_DIR,
        )
        root = ET.fromstring(svg_text)

        self.assertEqual(root.tag, "{http://www.w3.org/2000/svg}svg")
        self.assertGreater(int(root.attrib["width"]), 900)
        self.assertGreater(int(root.attrib["height"]), 300)
        self.assertIn("data:image/png;base64", svg_text)
        self.assertIn(">G<", svg_text)
        self.assertIn(">METRO<", svg_text)
        self.assertGreaterEqual(svg_text.count("<polygon"), len(bundle["route"]["segments"]))
        self.assertIn("rgba(200,255,180", svg_text)

    def test_svg_to_png_conversion_when_cairosvg_is_available(self) -> None:
        try:
            import cairosvg  # noqa: F401
        except (ImportError, OSError):
            self.skipTest("CairoSVG is not usable in this runtime.")

        bundle = model.analyze_route(model.load_route())
        svg_text = svg_renderer.render_route_svg(
            bundle["route"],
            bundle["analysis"],
            model.JLOS_DIR,
        )
        output_path = model.PROJECT_ROOT / "tmp" / "test-svg-renderer.png"

        converter = svg_renderer.svg_to_png(svg_text, output_path)

        self.assertEqual(converter, "cairosvg")
        self.assertTrue(output_path.exists())
        self.assertGreater(output_path.stat().st_size, 1000)


if __name__ == "__main__":
    unittest.main()
