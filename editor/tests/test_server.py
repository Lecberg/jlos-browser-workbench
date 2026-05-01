from __future__ import annotations

import json
import sys
import threading
import unittest
from pathlib import Path
from unittest import mock
from urllib import request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import model  # noqa: E402
import server  # noqa: E402


def make_legacy_route() -> dict:
    return {
        "version": 1,
        "meta": {
            "routeName": "Legacy API Route",
            "xScale": 1.2,
            "yScale": 10,
            "gridWidthM": 25,
            "gridHeightM": 4,
            "showLegend": True,
            "showOverallLos": True,
            "overallLos": "C",
        },
        "origin": {"type": "metro"},
        "destination": {"type": "bus"},
        "startLevel": "GF",
        "levels": [
            {"label": "GF", "elevationM": 0},
            {"label": "L1", "elevationM": 6},
        ],
        "segments": [
            {
                "lengthM": 50,
                "verticalM": 0,
                "weather": "open",
                "startMarker": "none",
                "midMarker": "none",
                "los": "C",
            }
        ],
    }


class ServerApiTests(unittest.TestCase):
    def request_json(self, method: str, url: str, payload: dict | None = None) -> dict:
        req = request.Request(url, method=method)
        if payload is not None:
            req.add_header("Content-Type", "application/json")
            req.data = json.dumps(payload).encode("utf-8")
        with request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))

    def test_api_flow_bootstrap_analyze_save_export_render(self) -> None:
        def fake_save_route_json(route: dict) -> dict:
            return model.analyze_route(route)["route"]

        def fake_export_route_files(route: dict) -> dict:
            bundle = model.analyze_route(route)
            return {
                "validation": bundle["analysis"]["validation"],
                "paths": {"json": "tmp/test_api_route.json", "csv": "tmp/test_api_data.csv"},
                "bundle": bundle,
            }

        fake_preview = {
            "previewVersion": 123,
            "stdout": "",
            "stderr": "",
            "renderer": "svg/cairosvg",
            "previewPath": "tmp/editor-preview/sample_hires_preview.png",
            "previewSvgPath": "tmp/editor-preview/sample_hires_preview.svg",
            "preview": {
                "hasPreview": True,
                "version": 123,
                "isTemporary": True,
                "downloadPath": "JLOS/sample_hires.png",
                "downloadSvgPath": "JLOS/sample_hires.svg",
                "hasSvg": True,
            },
            "bundle": model.analyze_route(make_legacy_route()),
        }

        with (
            mock.patch.object(model, "ensure_route_file", return_value=None),
            mock.patch.object(model, "read_route_json", return_value=make_legacy_route()),
            mock.patch.object(server, "save_route_json", side_effect=fake_save_route_json),
            mock.patch.object(server, "export_route_files", side_effect=fake_export_route_files),
            mock.patch.object(server, "render_current_route", return_value=fake_preview),
        ):
            httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.EditorHandler)
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            base_url = f"http://127.0.0.1:{httpd.server_port}"

            try:
                bootstrap = self.request_json("GET", f"{base_url}/api/bootstrap")
                self.assertEqual(bootstrap["route"]["version"], model.ROUTE_VERSION)
                self.assertEqual(bootstrap["analysis"]["route"]["overallLos"], "C")

                edited_route = bootstrap["route"]
                edited_route["segments"][0]["los"] = "D"

                analyze = self.request_json("POST", f"{base_url}/api/analyze-route", {"route": edited_route})
                self.assertTrue(analyze["dirty"])
                self.assertIn("analysis", analyze)
                self.assertEqual(analyze["analysis"]["route"]["suggestedOverallLos"], "D")

                save_response = self.request_json("POST", f"{base_url}/api/save-route", {"route": edited_route})
                self.assertFalse(save_response["dirty"])

                export_response = self.request_json("POST", f"{base_url}/api/export-route", {"route": edited_route})
                self.assertIn("export", export_response)
                self.assertEqual(export_response["export"]["paths"]["csv"], "tmp/test_api_data.csv")

                render_response = self.request_json("POST", f"{base_url}/api/render-route", {"route": edited_route})
                self.assertIn("render", render_response)
                self.assertTrue(render_response["render"]["preview"]["hasPreview"])
                self.assertEqual(render_response["render"]["previewSvgPath"], "tmp/editor-preview/sample_hires_preview.svg")
                self.assertNotIn("export", render_response)
            finally:
                httpd.shutdown()
                httpd.server_close()
                thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
