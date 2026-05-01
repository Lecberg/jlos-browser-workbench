from __future__ import annotations

import argparse
import json
import mimetypes
import threading
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from model import (
    CSV_PATH,
    JLOS_DIR,
    PREVIEW_PATH,
    PreviewNotReadyError,
    active_preview_path,
    analyze_route,
    build_bootstrap,
    build_options,
    download_preview_to_project,
    export_route_files,
    normalize_route,
    render_current_route,
    save_route_json,
)

STATIC_DIR = Path(__file__).resolve().parent / "static"


class EditorHandler(BaseHTTPRequestHandler):
    server_version = "JLOSEditor/2.0"

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/":
            self.serve_file(STATIC_DIR / "index.html", "text/html; charset=utf-8")
            return

        if path.startswith("/static/"):
            relative = path.removeprefix("/static/")
            self.serve_file(STATIC_DIR / relative)
            return

        if path == "/api/bootstrap":
            self.send_json(HTTPStatus.OK, build_bootstrap())
            return

        if path == "/api/preview-image":
            preview_path = active_preview_path()
            if preview_path is None:
                self.send_error(HTTPStatus.NOT_FOUND, "Preview not found")
                return
            self.serve_file(preview_path, "image/png")
            return

        if path == "/sample_hires.png":
            self.serve_file(PREVIEW_PATH, "image/png")
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/analyze-route":
            payload = self.read_json()
            route = normalize_route(payload.get("route"))
            self.send_json(
                HTTPStatus.OK,
                self.api_payload(route, "Scientific analysis updated.", dirty=True),
            )
            return

        if parsed.path == "/api/save-route":
            payload = self.read_json()
            route = save_route_json(payload.get("route"))
            self.send_json(
                HTTPStatus.OK,
                self.api_payload(route, "Route JSON saved to disk."),
            )
            return

        if parsed.path == "/api/export-route":
            payload = self.read_json()
            try:
                result = export_route_files(payload.get("route"))
            except Exception as error:  # noqa: BLE001
                self.handle_export_or_render_error(payload.get("route"), error)
                return

            self.send_json(
                HTTPStatus.OK,
                self.api_payload(
                    result["bundle"]["route"],
                    "CSV exported for the Processing renderer.",
                    extra={"export": result},
                ),
            )
            return

        if parsed.path == "/api/render-route":
            payload = self.read_json()
            try:
                render_result = render_current_route(payload.get("route"))
            except Exception as error:  # noqa: BLE001
                self.handle_export_or_render_error(payload.get("route"), error)
                return

            self.send_json(
                HTTPStatus.OK,
                self.api_payload(
                    render_result["bundle"]["route"],
                    "Diagram rendered. Temporary preview is ready.",
                    extra={
                        "render": render_result,
                    },
                ),
            )
            return

        if parsed.path == "/api/download-preview":
            try:
                preview = download_preview_to_project()
            except PreviewNotReadyError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "errors": [str(error)]})
                return

            self.send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "message": f"Preview saved to {preview['downloadPath']}.",
                    "preview": preview,
                    "previewVersion": preview["version"],
                    "files": {
                        "preview": preview["downloadPath"],
                        "previewSvg": preview.get("downloadSvgPath", "JLOS/sample_hires.svg"),
                    },
                },
            )
            return

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def api_payload(
        self,
        route: dict[str, object] | None,
        message: str | None = None,
        *,
        ok: bool = True,
        errors: list[str] | None = None,
        dirty: bool = False,
        extra: dict[str, object] | None = None,
    ) -> dict[str, object]:
        bundle = build_bootstrap(route)
        payload: dict[str, object] = {
            "ok": ok,
            "dirty": dirty,
            **bundle,
        }
        payload["options"] = build_options()
        if message:
            payload["message"] = message
        if errors:
            payload["errors"] = errors
        if extra:
            payload.update(extra)
        return payload

    def handle_export_or_render_error(self, route_payload: object, error: Exception) -> None:
        bundle_route = None
        errors = [str(error)]
        if hasattr(error, "bundle"):
            bundle = getattr(error, "bundle")
            if isinstance(bundle, dict):
                bundle_route = bundle.get("route")
        if hasattr(error, "errors"):
            extracted_errors = getattr(error, "errors")
            if isinstance(extracted_errors, list) and extracted_errors:
                errors = extracted_errors
        elif route_payload is not None:
            bundle_route = analyze_route(route_payload).get("route")

        self.send_json(
            HTTPStatus.BAD_REQUEST,
            self.api_payload(
                bundle_route,
                ok=False,
                errors=errors,
            ),
        )

    def serve_file(self, path: Path | str, content_type: str | None = None) -> None:
        file_path = Path(path)
        if not file_path.exists() or not file_path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return

        guessed_type = content_type or mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", guessed_type)
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(file_path.read_bytes())

    def read_json(self) -> dict[str, object]:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length) if content_length else b"{}"
        try:
            return json.loads(raw_body.decode("utf-8") or "{}")
        except json.JSONDecodeError as error:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"ok": False, "errors": [f"Invalid JSON body: {error.msg}."]},
            )
            raise

    def send_json(self, status: HTTPStatus, payload: dict[str, object]) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the JLOS route editor server.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--open", action="store_true", help="Open the editor in the default browser after startup.")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), EditorHandler)
    editor_url = f"http://{args.host}:{args.port}/"

    print(f"JLOS editor is serving {JLOS_DIR}")
    print(f"Route JSON: {CSV_PATH.parent / 'JLOS_route.json'}")
    print(f"Editor URL: {editor_url}")
    print("Press Ctrl+C to stop the server.")

    if args.open:
        threading.Timer(0.6, lambda: webbrowser.open(editor_url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping JLOS editor server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
