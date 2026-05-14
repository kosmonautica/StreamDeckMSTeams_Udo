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
    """Video camera icon: hollow rounded-rect body + outlined triangle (tip points left)."""
    s = c.size
    sw = 0.065  # stroke width as fraction of s

    # Body: filled outer rect, then punch hollow with bg color
    r_out = 0.12
    r_in = max(r_out - sw, 0.02)
    c.rounded_rect(0.07 * s, 0.26 * s, 0.63 * s, 0.74 * s, r_out * s, fg)
    c.rounded_rect((0.07 + sw) * s, (0.26 + sw) * s,
                   (0.63 - sw) * s, (0.74 - sw) * s, r_in * s, bg)

    # Triangle outline: right vertical edge + two diagonals converging left
    lw = sw * s
    c.line(0.91 * s, 0.29 * s, 0.91 * s, 0.71 * s, lw, fg)  # right vertical
    c.line(0.91 * s, 0.29 * s, 0.65 * s, 0.50 * s, lw, fg)  # top to tip
    c.line(0.91 * s, 0.71 * s, 0.65 * s, 0.50 * s, lw, fg)  # bottom to tip


def blur(c, fg, bg):
    """Background blur icon: person silhouette with background blur suggestion."""
    s = c.size
    # Person head
    c.circle(0.50 * s, 0.32 * s, 0.13 * s, fg)
    # Person torso
    c.rounded_rect(0.35 * s, 0.46 * s, 0.65 * s, 0.72 * s, 0.10 * s, fg)


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
