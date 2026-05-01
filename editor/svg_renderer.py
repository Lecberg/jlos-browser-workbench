from __future__ import annotations

import base64
import html
import math
from pathlib import Path
from typing import Any

SCALE = 3
CORRIDOR_HEIGHT = 30.0
AIR_CON_DEPTH = 15.0
POINTER_LINE_LENGTH = 30.0
DEFAULT_DESTINATION_METRIC_LABEL_POSITION = "right"
DEFAULT_CANVAS_PADDING_X = 140.0
DEFAULT_CANVAS_PADDING_TOP = 60.0
DEFAULT_CANVAS_PADDING_BOTTOM = 160.0
DEFAULT_CANVAS_RATIO_WIDTH = 16.0
DEFAULT_CANVAS_RATIO_HEIGHT = 9.0
DESTINATION_SUMMARY_LINE_SPACING = 16.0
DESTINATION_SUMMARY_POINT_GAP = 12.0
DESTINATION_SUMMARY_FRAME_PADDING = 12.0
DESTINATION_SUMMARY_DEFAULT_RIGHT_GAP = 28.0
DESTINATION_SUMMARY_ICON_GAP = 12.0
FONT_FAMILY = "Consolas, 'Courier New', monospace"

LOS_COLORS = {
    "A": (50, 255, 0),
    "B": (150, 255, 120),
    "C": (200, 255, 180),
    "D": (250, 234, 160),
    "E": (230, 210, 130),
    "F": (200, 180, 96),
}

ICON_FILES = {
    "metro": "Picto Metro.png",
    "bus": "Picto Bus.png",
    "brt": "Picto BRT.png",
    "coach": "Picto Tour Coach.png",
    "rail": "Picto Rail.png",
    "evtol": "Picto Air Taxi.png",
    "minibus": "Picto Minibus.png",
    "ferry": "Picto Ferry.png",
    "taxi": "Picto Taxi.png",
    "uber": "Picto uber.png",
    "bike": "Picto Bike.png",
    "drop_off": "Picto Private Car.png",
    "smart_car": "Picto Smart Car.png",
    "escalator_up": "Picto Escalator Up.png",
    "escalator_down": "Picto Escalator Down.png",
    "stair_up": "Picto Stair Up.png",
    "stair_down": "Picto Stair Down.png",
    "bottleneck": "Picto Bottleneck.png",
    "turnstiles": "Picto Turnstiles.png",
    "washroom": "Picto WC.png",
    "retail": "Picto Retail.png",
    "ticketing": "Picto Ticketing.png",
    "fnb": "Picto F&B.png",
}

ICON_LABELS = {
    "metro": "METRO",
    "bus": "BUS",
    "brt": "BRT",
    "coach": "COACH",
    "rail": "RAIL",
    "evtol": "EVTOL",
    "minibus": "MINIBUS",
    "ferry": "FERRY",
    "taxi": "TAXI",
    "uber": "UBER",
    "bike": "BIKE",
    "drop_off": "DROP-OFF",
    "smart_car": "SMART CAR",
    "washroom": "WASHROOM",
    "retail": "RETAIL",
    "ticketing": "TICKETING",
    "fnb": "F&B",
}

TERMINAL_MARKERS = {
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
}


def render_route_svg(route: dict[str, Any], analysis: dict[str, Any], assets_dir: Path) -> str:
    layout = _build_layout(route, analysis)
    canvas_width = layout["canvas_width"]
    canvas_height = layout["canvas_height"]
    grid_w = layout["grid_width_px"]
    grid_h = layout["grid_height_px"]
    legend_y = layout["legend_y"]
    scale_box_x = math.floor((canvas_width - grid_w - 40.0) / grid_w) * grid_w
    scale_box_y = math.floor(legend_y / grid_h) * grid_h

    writer = _SvgWriter(canvas_width, canvas_height)
    writer.open_group('transform="translate(10 10)"')
    _draw_grid(writer, canvas_width, canvas_height, grid_w, grid_h)
    writer.rect(0, 0, canvas_width - 20, canvas_height - 20, fill="none", stroke="#000", stroke_width=1)
    _draw_scale_box(writer, route, scale_box_x, scale_box_y, grid_w, grid_h)

    if route["meta"]["showLegend"]:
        _draw_legend(writer, legend_y, assets_dir)

    route_cursor_x, route_cursor_y, destination_clearance = _draw_route(
        writer,
        route,
        analysis,
        assets_dir,
        layout["start_x"],
        layout["diagram_y"],
    )
    _draw_destination_summary(
        writer,
        route,
        layout["start_x"] + route_cursor_x,
        layout["diagram_y"] + route_cursor_y,
        destination_clearance,
        canvas_width,
        canvas_height,
        legend_y,
        scale_box_y,
    )

    if route["meta"]["showOverallLos"]:
        _draw_los_badge(
            writer,
            route["meta"]["overallLos"],
            canvas_width - 20 - 20 - CORRIDOR_HEIGHT / 2,
            20 + CORRIDOR_HEIGHT / 2,
        )

    writer.close_group()
    return writer.to_string()


def svg_to_png(svg_text: str, output_path: Path) -> str:
    try:
        import cairosvg  # type: ignore[import-not-found]
    except (ImportError, OSError) as error:
        raise RuntimeError("CairoSVG with native Cairo support is required for PNG export from the SVG renderer.") from error

    width, height = _svg_dimensions(svg_text)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(
        bytestring=svg_text.encode("utf-8"),
        write_to=str(output_path),
        output_width=width * SCALE,
        output_height=height * SCALE,
    )
    return "cairosvg"


def _build_layout(route: dict[str, Any], analysis: dict[str, Any]) -> dict[str, float]:
    meta = route["meta"]
    px_per_meter_h = float(meta["xScale"])
    px_per_meter_v = float(meta["yScale"])
    grid_w = max(float(meta["gridWidthM"]) * px_per_meter_h, 50.0)
    grid_h = max(float(meta["gridHeightM"]) * px_per_meter_v, 50.0)
    start_elevation = _level_elevation(route, route["startLevel"])

    diagram_width = 0.0
    cursor_y = 0.0
    route_min_y = 0.0
    route_max_y = 0.0
    for segment in analysis["segments"]:
        dx = float(segment["lengthM"]) * px_per_meter_h
        dy = float(segment["verticalM"]) * px_per_meter_v
        diagram_width += dx
        route_min_y = min(route_min_y, cursor_y)
        route_max_y = max(route_max_y, cursor_y)
        cursor_y -= dy
        route_min_y = min(route_min_y, cursor_y)
        route_max_y = max(route_max_y, cursor_y)

    for level in route["levels"]:
        if not level["label"]:
            continue
        level_y = -(float(level["elevationM"]) - start_elevation) * px_per_meter_v
        route_min_y = min(route_min_y, level_y)
        route_max_y = max(route_max_y, level_y)

    drawing_top_y = route_min_y - CORRIDOR_HEIGHT - AIR_CON_DEPTH - 50
    drawing_bottom_y = route_max_y + 95
    left_reserve = max(float(meta.get("canvasPaddingX", DEFAULT_CANVAS_PADDING_X)), 100.0)
    right_reserve = max(float(meta.get("canvasPaddingX", DEFAULT_CANVAS_PADDING_X)), 260.0)
    canvas_width = round(max(diagram_width + left_reserve + right_reserve + 20, 1000))
    bottom_padding = max(
        float(meta.get("canvasPaddingBottom", DEFAULT_CANVAS_PADDING_BOTTOM)),
        160.0 if meta["showLegend"] else 90.0,
    )
    canvas_height = round(
        max(float(meta.get("canvasPaddingTop", DEFAULT_CANVAS_PADDING_TOP)) + (drawing_bottom_y - drawing_top_y) + bottom_padding + 20, 420)
    )

    if meta["canvasRatioPreset"] != "auto":
        canvas_width, canvas_height = _adjusted_canvas_size_for_ratio(
            canvas_width,
            canvas_height,
            float(meta.get("canvasRatioWidth", DEFAULT_CANVAS_RATIO_WIDTH)),
            float(meta.get("canvasRatioHeight", DEFAULT_CANVAS_RATIO_HEIGHT)),
            grid_w,
            grid_h,
        )

    start_x_min = left_reserve
    start_x_max = max(start_x_min, canvas_width - 20 - right_reserve - diagram_width)
    start_x = _snapped_value_in_range((canvas_width - 20 - diagram_width) / 2.0, start_x_min, start_x_max, grid_w)

    legend_y = canvas_height - 110
    drawing_height = drawing_bottom_y - drawing_top_y
    route_area_top = 20.0
    route_area_bottom = max(route_area_top + drawing_height, legend_y - 20)
    diagram_y_min = route_area_top - drawing_top_y
    diagram_y_max = max(diagram_y_min, route_area_bottom - drawing_bottom_y)
    diagram_y = _snapped_value_in_range(
        route_area_top + ((route_area_bottom - route_area_top) - drawing_height) / 2.0 - drawing_top_y,
        diagram_y_min,
        diagram_y_max,
        grid_h,
    )

    return {
        "canvas_width": float(canvas_width),
        "canvas_height": float(canvas_height),
        "grid_width_px": grid_w,
        "grid_height_px": grid_h,
        "start_x": start_x,
        "diagram_y": diagram_y,
        "legend_y": legend_y,
        "start_elevation": start_elevation,
    }


def _draw_route(
    writer: "_SvgWriter",
    route: dict[str, Any],
    analysis: dict[str, Any],
    assets_dir: Path,
    start_x: float,
    diagram_y: float,
) -> tuple[float, float, float]:
    px_per_meter_h = float(route["meta"]["xScale"])
    px_per_meter_v = float(route["meta"]["yScale"])
    start_elevation = _level_elevation(route, route["startLevel"])

    writer.open_group(f'transform="translate({_num(start_x)} {_num(diagram_y)})"')
    writer.line(-70, 0, -50, 0, stroke="#000")
    writer.text(route["startLevel"], -80, 0, font_size=10, anchor="middle", dominant_baseline="middle")
    for level in route["levels"]:
        label = level["label"]
        elevation = float(level["elevationM"])
        if not label:
            continue
        if label == route["startLevel"] and abs(elevation - start_elevation) <= 0.01:
            continue
        y = -(elevation - start_elevation) * px_per_meter_v
        writer.line(-70, y, -50, y, stroke="#000")
        writer.text(label, -80, y, font_size=10, anchor="middle", dominant_baseline="middle")

    cursor_x = 0.0
    cursor_y = 0.0
    for index, segment in enumerate(analysis["segments"]):
        route_segment = route["segments"][index]
        dx = float(segment["lengthM"]) * px_per_meter_h
        dy = float(segment["verticalM"]) * px_per_meter_v
        writer.open_group(f'transform="translate({_num(cursor_x)} {_num(cursor_y)})"')
        writer.polygon(
            [(0, 0), (0, -CORRIDOR_HEIGHT), (dx, -dy - CORRIDOR_HEIGHT), (dx, -dy)],
            fill=_los_fill(route_segment["los"], 0.59),
        )
        writer.line(0, 0, dx, -dy, stroke="#000", stroke_width=2.5)
        writer.circle(0, 0, 4, fill="#000")
        _draw_weather(writer, route_segment["weather"], dx, dy)

        start_marker = route["origin"]["type"] if index == 0 and route["origin"]["type"] else route_segment["startMarker"]
        _draw_start_marker(writer, start_marker, dy, assets_dir)
        _draw_mid_marker(writer, route_segment["midMarker"], dx, dy, assets_dir)
        writer.close_group()
        cursor_x += dx
        cursor_y -= dy

    writer.circle(cursor_x, cursor_y, 4, fill="#000")
    destination_clearance = _draw_destination_marker(writer, route["destination"]["type"], cursor_x, cursor_y, assets_dir)
    writer.close_group()
    return cursor_x, cursor_y, destination_clearance


def _draw_grid(writer: "_SvgWriter", canvas_width: float, canvas_height: float, grid_w: float, grid_h: float) -> None:
    x = 0.0
    while x <= canvas_width:
        writer.line(x, 0, x, canvas_height, stroke="#dcdcdc")
        x += grid_w
    y = 0.0
    while y <= canvas_height:
        writer.line(0, y, canvas_width, y, stroke="#dcdcdc")
        y += grid_h


def _draw_scale_box(writer: "_SvgWriter", route: dict[str, Any], x: float, y: float, grid_w: float, grid_h: float) -> None:
    writer.rect(x, y, grid_w, grid_h, fill="none", stroke="#969696", stroke_width=1.5)
    writer.text(_format_grid_measure(route["meta"]["gridWidthM"]) + "m", x + grid_w / 2, y + grid_h + 8, font_size=10, fill="#969696", anchor="middle", dominant_baseline="text-before-edge")
    writer.text(_format_grid_measure(route["meta"]["gridHeightM"]) + "m", x + grid_w + 8, y + grid_h / 2, font_size=10, fill="#969696", anchor="start", dominant_baseline="middle")


def _draw_legend(writer: "_SvgWriter", legend_y: float, assets_dir: Path) -> None:
    writer.rect(100, legend_y, 600, 50, fill="#fff", stroke="#dcdcdc")
    writer.line(100, legend_y, 700, legend_y, stroke="#000", stroke_width=0.5)
    writer.line(100, legend_y + 50, 700, legend_y + 50, stroke="#000", stroke_width=0.5)
    for index, letter in enumerate(("A", "B", "C", "D", "E", "F")):
        x = 130 + index * 40
        writer.rect(x, legend_y + 15, 40, 20, fill=_los_fill(letter, 0.78))
        writer.text(letter, x + 20, legend_y + 25, font_size=10, anchor="middle", dominant_baseline="middle")
    _draw_tick_row(writer, 420, 480, legend_y + 15, 0)
    writer.text("Sheltered", 490, legend_y + 15, font_size=10, anchor="start", dominant_baseline="middle")
    writer.rect(419, legend_y + 29.375, 62, AIR_CON_DEPTH * 0.75, fill="rgba(93,255,255,0.27)")
    _draw_tick_row(writer, 420, 480, legend_y + 40, 0)
    writer.text("Air-conditioned", 490, legend_y + 36, font_size=10, anchor="start", dominant_baseline="middle")
    _draw_image_center(writer, "bottleneck", 600, legend_y + 12.5, assets_dir)
    writer.text("Bottleneck", 620, legend_y + 15, font_size=10, anchor="start", dominant_baseline="middle")
    _draw_image_center(writer, "turnstiles", 600, legend_y + 30, assets_dir)
    writer.text("Turnstiles", 620, legend_y + 36, font_size=10, anchor="start", dominant_baseline="middle")


def _draw_weather(writer: "_SvgWriter", weather: str, dx: float, dy: float) -> None:
    if weather == "air_conditioned":
        writer.polygon(
            [(0, -CORRIDOR_HEIGHT), (0, -CORRIDOR_HEIGHT - AIR_CON_DEPTH), (dx, -dy - CORRIDOR_HEIGHT - AIR_CON_DEPTH), (dx, -dy - CORRIDOR_HEIGHT)],
            fill="rgba(93,255,255,0.27)",
        )
    if weather in {"sheltered", "air_conditioned"}:
        if dx <= 0:
            return
        x = 0.0
        while x <= dx:
            y = (-dy / dx * x) - CORRIDOR_HEIGHT
            writer.rect(x - 0.5, y - 2, 1, 4, fill="#000")
            x += 3.0


def _draw_start_marker(writer: "_SvgWriter", marker: str, dy: float, assets_dir: Path) -> None:
    if marker in TERMINAL_MARKERS:
        label_x = 21 if marker in {"drop_off", "smart_car"} else -21
        _draw_terminal_marker(writer, marker, -21, -15, label_x, 10, assets_dir)
    elif marker in {"bottleneck", "turnstiles", "washroom", "retail", "ticketing", "fnb"}:
        _draw_callout_marker(writer, marker, 0, -dy / 2 - CORRIDOR_HEIGHT / 2, assets_dir)


def _draw_mid_marker(writer: "_SvgWriter", marker: str, dx: float, dy: float, assets_dir: Path) -> None:
    if marker == "none":
        return
    icon_x = dx / 2
    icon_y = -dy / 2 - CORRIDOR_HEIGHT / 2
    if marker in {"escalator_up", "escalator_down", "stair_up", "stair_down", "bottleneck", "turnstiles"}:
        _draw_image_center(writer, marker, icon_x, icon_y, assets_dir)
    else:
        _draw_callout_marker(writer, marker, icon_x, icon_y, assets_dir)


def _draw_terminal_marker(
    writer: "_SvgWriter",
    marker: str,
    icon_x: float,
    icon_y: float,
    label_x: float,
    label_y: float,
    assets_dir: Path,
) -> None:
    _draw_image_center(writer, marker, icon_x, icon_y, assets_dir)
    label = ICON_LABELS.get(marker, "")
    if label:
        writer.text(label, label_x, label_y, font_size=10, anchor="middle", dominant_baseline="middle")


def _draw_callout_marker(writer: "_SvgWriter", marker: str, x: float, y: float, assets_dir: Path) -> None:
    _draw_image_center(writer, marker, x, y, assets_dir)
    label = ICON_LABELS.get(marker, "")
    if label:
        writer.line(x, -3, x, POINTER_LINE_LENGTH, stroke="#000")
        writer.text(label, x, POINTER_LINE_LENGTH + 7, font_size=10, anchor="middle", dominant_baseline="middle")


def _draw_destination_marker(writer: "_SvgWriter", marker: str, x: float, y: float, assets_dir: Path) -> float:
    if not marker:
        return 0.0
    width, height = _draw_image_center(writer, marker, x + 21, y - 15, assets_dir)
    label = ICON_LABELS.get(marker, "")
    if label:
        writer.text(label, x + 21, y + 10, font_size=10, anchor="middle", dominant_baseline="middle")
    return max(21 + width / 2, 21 + _text_width(label, 10) / 2 if label else 0)


def _draw_destination_summary(
    writer: "_SvgWriter",
    route: dict[str, Any],
    route_end_x: float,
    route_end_y: float,
    destination_clearance: float,
    canvas_width: float,
    canvas_height: float,
    legend_y: float,
    scale_box_y: float,
) -> None:
    horizontal_text = f"H:  {int(route['computed']['totalLengthM'])}m"
    vertical_text = f"V: {int(route['computed']['totalVerticalM'])}m"
    block_width = max(_text_width(horizontal_text, 10), _text_width(vertical_text, 10))
    line_height = 10
    block_height = DESTINATION_SUMMARY_LINE_SPACING + line_height
    safe_left = DESTINATION_SUMMARY_FRAME_PADDING
    safe_top = DESTINATION_SUMMARY_FRAME_PADDING
    safe_right = canvas_width - 20 - DESTINATION_SUMMARY_FRAME_PADDING
    safe_bottom = min(canvas_height - 20 - DESTINATION_SUMMARY_FRAME_PADDING, min(legend_y, scale_box_y) - DESTINATION_SUMMARY_FRAME_PADDING)
    max_left = max(safe_left, safe_right - block_width)
    max_top = max(safe_top, safe_bottom - block_height)
    text_center_offset_y = line_height / 2
    position = route["meta"].get("destinationMetricLabelPosition", DEFAULT_DESTINATION_METRIC_LABEL_POSITION)

    if position == "right":
        right_offset = destination_clearance + DESTINATION_SUMMARY_ICON_GAP if destination_clearance > 0 else DESTINATION_SUMMARY_DEFAULT_RIGHT_GAP
        left = _constrain(route_end_x + right_offset, safe_left, max_left)
        top = _constrain(route_end_y - block_height / 2, safe_top, max_top)
        writer.text(horizontal_text, left, top + text_center_offset_y, font_size=10, anchor="start", dominant_baseline="middle")
        writer.text(vertical_text, left, top + text_center_offset_y + DESTINATION_SUMMARY_LINE_SPACING, font_size=10, anchor="start", dominant_baseline="middle")
        return

    left = _constrain(route_end_x - block_width / 2, safe_left, max_left)
    top = route_end_y - DESTINATION_SUMMARY_POINT_GAP - block_height if position == "above" else route_end_y + DESTINATION_SUMMARY_POINT_GAP
    top = _constrain(top, safe_top, max_top)
    center_x = left + block_width / 2
    writer.text(horizontal_text, center_x, top + text_center_offset_y, font_size=10, anchor="middle", dominant_baseline="middle")
    writer.text(vertical_text, center_x, top + text_center_offset_y + DESTINATION_SUMMARY_LINE_SPACING, font_size=10, anchor="middle", dominant_baseline="middle")


def _draw_los_badge(writer: "_SvgWriter", los: str, x: float, y: float) -> None:
    if los not in LOS_COLORS:
        return
    writer.rect(x - CORRIDOR_HEIGHT / 2, y - CORRIDOR_HEIGHT / 2, CORRIDOR_HEIGHT, CORRIDOR_HEIGHT, fill=_los_fill(los, 0.59), stroke="#000")
    writer.text(los, x + 1, y, font_size=30, anchor="middle", dominant_baseline="middle")


def _draw_tick_row(writer: "_SvgWriter", start_x: float, end_x: float, y: float, slope: float) -> None:
    x = start_x
    while x <= end_x:
        writer.rect(x - 0.5, y + slope * (x - start_x) - 2, 1, 4, fill="#000")
        x += 3


def _draw_image_center(writer: "_SvgWriter", marker: str, cx: float, cy: float, assets_dir: Path) -> tuple[float, float]:
    icon_file = ICON_FILES.get(marker)
    if not icon_file:
        return (0.0, 0.0)
    icon_path = assets_dir / icon_file
    if not icon_path.exists():
        return (0.0, 0.0)
    width, height = _png_size(icon_path)
    writer.image(_data_uri(icon_path), cx - width / 2, cy - height / 2, width, height)
    return (float(width), float(height))


def _level_elevation(route: dict[str, Any], label: str) -> float:
    for level in route["levels"]:
        if level["label"] == label:
            return float(level["elevationM"])
    return 0.0


def _snapped_value_in_range(value: float, min_value: float, max_value: float, grid_size: float) -> float:
    if max_value < min_value:
        return min_value
    if grid_size <= 0:
        return _constrain(value, min_value, max_value)
    min_snapped = math.ceil(min_value / grid_size) * grid_size
    max_snapped = math.floor(max_value / grid_size) * grid_size
    if max_snapped < min_snapped:
        return _constrain(value, min_value, max_value)
    snapped = round(value / grid_size) * grid_size
    return _constrain(snapped, min_snapped, max_snapped)


def _adjusted_canvas_size_for_ratio(
    width: float,
    height: float,
    ratio_width: float,
    ratio_height: float,
    grid_w: float,
    grid_h: float,
) -> tuple[float, float]:
    if width <= 0 or height <= 0 or ratio_width <= 0 or ratio_height <= 0:
        return (width, height)
    target_ratio = ratio_width / ratio_height
    current_ratio = width / height
    if abs(current_ratio - target_ratio) <= 0.001:
        return (width, height)
    if current_ratio < target_ratio:
        return (_expanded_canvas_size(width, height * target_ratio, grid_w), height)
    return (width, _expanded_canvas_size(height, width / target_ratio, grid_h))


def _expanded_canvas_size(current_size: float, desired_size: float, grid_size: float) -> float:
    needed_extra = max(0.0, desired_size - current_size)
    if needed_extra <= 0:
        return current_size
    if grid_size <= 0:
        return math.ceil(desired_size)
    return current_size + math.ceil(needed_extra / grid_size) * grid_size


def _constrain(value: float, min_value: float, max_value: float) -> float:
    return min(max(value, min_value), max_value)


def _los_fill(los: str, alpha: float) -> str:
    red, green, blue = LOS_COLORS.get(los, (235, 235, 235))
    return f"rgba({red},{green},{blue},{alpha:.3f})"


def _format_grid_measure(value: Any) -> str:
    number = float(value)
    return f"{number:.3f}".rstrip("0").rstrip(".")


def _text_width(text: str, font_size: float) -> float:
    return len(text) * font_size * 0.6


def _num(value: float) -> str:
    rounded = round(float(value), 3)
    if abs(rounded) < 0.0005:
        rounded = 0.0
    return f"{rounded:.3f}".rstrip("0").rstrip(".")


def _data_uri(path: Path) -> str:
    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{payload}"


def _png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return (30, 30)
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    return (width, height)


def _svg_dimensions(svg_text: str) -> tuple[int, int]:
    width_marker = 'width="'
    height_marker = 'height="'
    width_start = svg_text.index(width_marker) + len(width_marker)
    width_end = svg_text.index('"', width_start)
    height_start = svg_text.index(height_marker) + len(height_marker)
    height_end = svg_text.index('"', height_start)
    return (int(float(svg_text[width_start:width_end])), int(float(svg_text[height_start:height_end])))


class _SvgWriter:
    def __init__(self, width: float, height: float) -> None:
        self.width = int(round(width))
        self.height = int(round(height))
        self.parts = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.width}" height="{self.height}" viewBox="0 0 {self.width} {self.height}">',
            f'<style>text {{ font-family: {FONT_FAMILY}; fill: #000; }}</style>',
        ]

    def to_string(self) -> str:
        return "\n".join([*self.parts, "</svg>\n"])

    def open_group(self, attrs: str = "") -> None:
        self.parts.append(f"<g {attrs}>")

    def close_group(self) -> None:
        self.parts.append("</g>")

    def line(self, x1: float, y1: float, x2: float, y2: float, *, stroke: str, stroke_width: float = 1.0) -> None:
        self.parts.append(
            f'<line x1="{_num(x1)}" y1="{_num(y1)}" x2="{_num(x2)}" y2="{_num(y2)}" stroke="{stroke}" stroke-width="{_num(stroke_width)}" stroke-linecap="square" />'
        )

    def rect(
        self,
        x: float,
        y: float,
        width: float,
        height: float,
        *,
        fill: str,
        stroke: str | None = None,
        stroke_width: float = 1.0,
    ) -> None:
        stroke_attrs = f' stroke="{stroke}" stroke-width="{_num(stroke_width)}"' if stroke else ""
        self.parts.append(f'<rect x="{_num(x)}" y="{_num(y)}" width="{_num(width)}" height="{_num(height)}" fill="{fill}"{stroke_attrs} />')

    def circle(self, cx: float, cy: float, radius: float, *, fill: str) -> None:
        self.parts.append(f'<circle cx="{_num(cx)}" cy="{_num(cy)}" r="{_num(radius)}" fill="{fill}" />')

    def polygon(self, points: list[tuple[float, float]], *, fill: str) -> None:
        point_text = " ".join(f"{_num(x)},{_num(y)}" for x, y in points)
        self.parts.append(f'<polygon points="{point_text}" fill="{fill}" />')

    def image(self, href: str, x: float, y: float, width: float, height: float) -> None:
        self.parts.append(
            f'<image href="{href}" x="{_num(x)}" y="{_num(y)}" width="{_num(width)}" height="{_num(height)}" />'
        )

    def text(
        self,
        text: str,
        x: float,
        y: float,
        *,
        font_size: float,
        fill: str = "#000",
        anchor: str = "middle",
        dominant_baseline: str = "middle",
    ) -> None:
        self.parts.append(
            f'<text x="{_num(x)}" y="{_num(y)}" font-size="{_num(font_size)}" fill="{fill}" text-anchor="{anchor}" dominant-baseline="{dominant_baseline}">{html.escape(str(text))}</text>'
        )
