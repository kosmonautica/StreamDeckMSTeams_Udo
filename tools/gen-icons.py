#!/usr/bin/env python3
"""Generates the PNG icon set for the Teams Control Stream Deck plugin.

No third-party deps: writes RGBA PNGs using only the standard library.
Run from the repo root:  python3 tools/gen-icons.py
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..",
                   "com.kosmonautica.teams-control.sdPlugin", "imgs")

GREEN = (40, 170, 90)
RED = (200, 55, 55)
GREY = (90, 95, 105)
DARK = (30, 32, 38)
WHITE = (245, 247, 250)
FADED = (170, 175, 185)


class Canvas:
    def __init__(self, size):
        self.size = size
        self.px = [[(0, 0, 0, 0)] * size for _ in range(size)]

    def _blend(self, x, y, color, alpha):
        if x < 0 or y < 0 or x >= self.size or y >= self.size:
            return
        r, g, b = color
        br, bg, bb, ba = self.px[y][x]
        na = alpha + ba * (1 - alpha)
        if na <= 0:
            self.px[y][x] = (0, 0, 0, 0)
            return
        nr = (r * alpha + br * ba * (1 - alpha)) / na
        ng = (g * alpha + bg * ba * (1 - alpha)) / na
        nb = (b * alpha + bb * ba * (1 - alpha)) / na
        self.px[y][x] = (nr, ng, nb, na)

    def rounded_rect(self, x0, y0, x1, y1, radius, color, alpha=1.0):
        for y in range(int(y0), int(math.ceil(y1))):
            for x in range(int(x0), int(math.ceil(x1))):
                cx = min(max(x, x0 + radius), x1 - radius)
                cy = min(max(y, y0 + radius), y1 - radius)
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                cov = max(0.0, min(1.0, radius - d + 0.5)) if radius > 0 else 1.0
                if x0 + radius <= x + 0.5 <= x1 - radius or y0 + radius <= y + 0.5 <= y1 - radius:
                    cov = 1.0
                self._blend(x, y, color, cov * alpha)

    def circle(self, cx, cy, r, color, alpha=1.0):
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - cy)
                cov = max(0.0, min(1.0, r - d + 0.5))
                self._blend(x, y, color, cov * alpha)

    def arc(self, cx, cy, r, a0, a1, width, color, alpha=1.0):
        """Draw an arc from angle a0 to a1 (radians). In screen coords y+ is down."""
        steps = max(int(r * abs(a1 - a0)) * 4 + 1, 30)
        for i in range(steps + 1):
            t = i / steps
            angle = a0 + (a1 - a0) * t
            x = cx + r * math.cos(angle)
            y = cy + r * math.sin(angle)
            self.circle(x, y, width / 2, color, alpha)

    def line(self, x0, y0, x1, y1, width, color, alpha=1.0):
        steps = int(math.hypot(x1 - x0, y1 - y0)) * 3 + 1
        for i in range(steps + 1):
            t = i / steps
            self.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, color, alpha)

    def triangle(self, pts, color, alpha=1.0):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(math.ceil(max(ys)))):
            for x in range(0, self.size):
                if self._in_tri(x + 0.5, y + 0.5, pts):
                    self._blend(x, y, color, alpha)

    @staticmethod
    def _in_tri(px, py, pts):
        (ax, ay), (bx, by), (cx, cy) = pts
        d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
        d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
        d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
        has_neg = d1 < 0 or d2 < 0 or d3 < 0
        has_pos = d1 > 0 or d2 > 0 or d3 > 0
        return not (has_neg and has_pos)

    def write(self, path):
        raw = bytearray()
        for row in self.px:
            raw.append(0)
            for (r, g, b, a) in row:
                raw += bytes((int(r) & 255, int(g) & 255, int(b) & 255,
                              int(a * 255) & 255))

        def chunk(tag, data):
            return (struct.pack(">I", len(data)) + tag + data +
                    struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

        png = b"\x89PNG\r\n\x1a\n"
        png += chunk(b"IHDR", struct.pack(">IIBBBBB", self.size, self.size,
                                          8, 6, 0, 0, 0))
        png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        png += chunk(b"IEND", b"")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(png)


def mic(c, fg, bg):
    """Standard studio/podcast mic: vertical capsule + U-arc housing + stem + base."""
    s = c.size
    # Capsule (the mic body, tall rounded rect)
    c.rounded_rect(0.37 * s, 0.10 * s, 0.63 * s, 0.52 * s, 0.13 * s, fg)
    # U-shaped housing arc: a0=0 (right) sweeping through pi/2 (down) to pi (left)
    # Arc spans from (0.73, 0.42) around bottom (0.50, 0.65) to (0.27, 0.42)
    c.arc(0.50 * s, 0.42 * s, 0.23 * s, 0, math.pi, 0.05 * s, fg)
    # Stem: housing bottom to base
    c.line(0.50 * s, 0.65 * s, 0.50 * s, 0.75 * s, 0.05 * s, fg)
    # Base: horizontal bar
    c.line(0.34 * s, 0.77 * s, 0.66 * s, 0.77 * s, 0.06 * s, fg)


def camera(c, fg, bg):
    """Classic camera icon: landscape body + viewfinder bump + lens ring."""
    s = c.size
    # Camera body (wider than tall, landscape)
    c.rounded_rect(0.14 * s, 0.37 * s, 0.80 * s, 0.72 * s, 0.08 * s, fg)
    # Viewfinder bump: sits on top of the body, slightly left of center
    c.rounded_rect(0.31 * s, 0.25 * s, 0.56 * s, 0.40 * s, 0.05 * s, fg)
    # Lens: outer filled circle
    c.circle(0.46 * s, 0.545 * s, 0.145 * s, fg)
    # Lens: hollow ring (punch out with background color)
    c.circle(0.46 * s, 0.545 * s, 0.095 * s, bg)
    # Lens: small inner glass element
    c.circle(0.46 * s, 0.545 * s, 0.045 * s, fg)


def blur(c, fg, bg):
    """Background blur icon: sharp person silhouette + bokeh circles in background."""
    s = c.size
    # Background bokeh (out-of-focus circles at the four corners, semi-transparent)
    c.circle(0.21 * s, 0.27 * s, 0.11 * s, fg, 0.40)
    c.circle(0.80 * s, 0.27 * s, 0.12 * s, fg, 0.40)
    c.circle(0.19 * s, 0.74 * s, 0.10 * s, fg, 0.40)
    c.circle(0.81 * s, 0.72 * s, 0.11 * s, fg, 0.40)
    # Person silhouette (the clear foreground subject): head + torso
    c.circle(0.50 * s, 0.32 * s, 0.12 * s, fg)
    c.rounded_rect(0.36 * s, 0.45 * s, 0.64 * s, 0.70 * s, 0.09 * s, fg)


def make(name, bg, glyph, fg, slash, sizes):
    for size in sizes:
        c = Canvas(size)
        c.rounded_rect(0, 0, size, size, size * 0.18, bg)
        glyph(c, fg, bg)
        if slash:
            s = size
            c.line(0.24 * s, 0.24 * s, 0.76 * s, 0.76 * s, 0.10 * s, bg)
            c.line(0.24 * s, 0.24 * s, 0.76 * s, 0.76 * s, 0.055 * s, fg)
        suffix = "" if size in (28, 72) else "@2x"
        base = 72 if size in (72, 144) else 28
        c.write(os.path.join(OUT, name + suffix + ".png"))
        _ = base


ACTION_SIZES = (72, 144)
PLUGIN_SIZES = (28, 56)

make("actions/mic-on",       GREEN, mic,    WHITE, False, ACTION_SIZES)
make("actions/mic-off",      RED,   mic,    WHITE, True,  ACTION_SIZES)
make("actions/mic-inactive", GREY,  mic,    FADED, False, ACTION_SIZES)
make("actions/camera-on",       GREEN, camera, WHITE, False, ACTION_SIZES)
make("actions/camera-off",      RED,   camera, WHITE, True,  ACTION_SIZES)
make("actions/camera-inactive", GREY,  camera, FADED, False, ACTION_SIZES)
make("actions/blur-on",       GREEN, blur, WHITE, False, ACTION_SIZES)
make("actions/blur-off",      RED,   blur, WHITE, True,  ACTION_SIZES)
make("actions/blur-inactive", GREY,  blur, FADED, False, ACTION_SIZES)
make("plugin/icon",          DARK, mic, WHITE, False, PLUGIN_SIZES)
make("plugin/category-icon", DARK, mic, WHITE, False, PLUGIN_SIZES)

print("Icons written to", os.path.normpath(OUT))
