#!/usr/bin/env python3
"""Deterministic synthetic skeleton GLBs for TurnInPlace regression tests.

No likeness, mesh, texture or personal data: just a 13-joint stick skeleton
(Mixamo-style joint names) with analytically known motion. Every fixture
states its expected heading, pivot and slide so the diagnostic can be checked
against ground truth rather than against itself.

  python3 tools/animation/synthetic_rigs.py OUT_DIR   # writes *.glb for manual viewing
"""
from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

KEY_FPS = 60

# name, parent, rest translation (metres; multiplied by `unit`)
SKELETON = [
    ("Root", None, (0.0, 0.0, 0.0)),
    ("Hips", "Root", (0.0, 0.95, 0.0)),
    ("LeftUpLeg", "Hips", (0.10, 0.0, 0.0)),
    ("LeftLeg", "LeftUpLeg", (0.0, -0.45, 0.0)),
    ("LeftFoot", "LeftLeg", (0.0, -0.42, 0.0)),
    ("LeftToeBase", "LeftFoot", (0.0, -0.08, 0.12)),
    ("RightUpLeg", "Hips", (-0.10, 0.0, 0.0)),
    ("RightLeg", "RightUpLeg", (0.0, -0.45, 0.0)),
    ("RightFoot", "RightLeg", (0.0, -0.42, 0.0)),
    ("RightToeBase", "RightFoot", (0.0, -0.08, 0.12)),
    ("Spine", "Hips", (0.0, 0.10, 0.0)),
    ("LeftArm", "Spine", (0.18, 0.40, 0.0)),
    ("RightArm", "Spine", (-0.18, 0.40, 0.0)),
]
HIP_HALF_WIDTH = 0.10


def qy(deg):
    h = math.radians(deg) / 2
    return [0.0, math.sin(h), 0.0, math.cos(h)]


def qx(deg):
    h = math.radians(deg) / 2
    return [math.sin(h), 0.0, 0.0, math.cos(h)]


def smoothstep(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def window(t, a, b):
    return 0.0 if b <= a else (t - a) / (b - a)


def rot_y(x, z, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return x * c + z * s, -x * s + z * c


def build_glb(name, duration, tracks, unit=1.0, root_scale=1.0):
    """tracks: {node_name: {path: fn(t) -> list}} sampled at KEY_FPS."""
    idx = {n: i for i, (n, _, _) in enumerate(SKELETON)}
    nodes = []
    for n, parent, t in SKELETON:
        node = {"name": n, "translation": [c * unit for c in t]}
        if n == "Root" and root_scale != 1.0:
            node["scale"] = [root_scale] * 3
        kids = [idx[c] for c, p, _ in SKELETON if p == n]
        if kids:
            node["children"] = kids
        nodes.append(node)
    count = int(round(duration * KEY_FPS)) + 1
    times = [duration * k / (count - 1) for k in range(count)]
    blob = bytearray()
    views, accessors = [], []

    def add(values, typ):
        flat = [v for row in values for v in (row if isinstance(row, list) else [row])]
        off = len(blob)
        blob.extend(struct.pack("<%df" % len(flat), *flat))
        views.append({"buffer": 0, "byteOffset": off, "byteLength": 4 * len(flat)})
        acc = {"bufferView": len(views) - 1, "componentType": 5126, "count": len(values), "type": typ}
        if typ == "SCALAR":
            acc["min"], acc["max"] = [min(values)], [max(values)]
        accessors.append(acc)
        return len(accessors) - 1

    # A small box on every joint so model-viewer (which rejects mesh-less files) can
    # render the fixture. Meshes do not affect the skeletal measurements.
    h = 0.04 * unit
    corners = [[x, y, z] for x in (-h, h) for y in (-h, h) for z in (-h, h)]
    pos_acc = add(corners, "VEC3")
    accessors[pos_acc]["min"], accessors[pos_acc]["max"] = [-h] * 3, [h] * 3
    quads = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    tri = [i for a, b, c, d in quads for i in (a, b, c, a, c, d)]
    off = len(blob)
    blob.extend(struct.pack("<%dH" % len(tri), *tri))
    blob.extend(b"\x00" * (-len(blob) % 4))
    views.append({"buffer": 0, "byteOffset": off, "byteLength": 2 * len(tri), "target": 34963})
    accessors.append({"bufferView": len(views) - 1, "componentType": 5123, "count": len(tri),
                      "type": "SCALAR", "min": [0], "max": [7]})
    idx_acc = len(accessors) - 1
    for node in nodes:
        if node["name"] != "Root":
            node["mesh"] = 0

    t_acc = add(times, "SCALAR")
    samplers, channels = [], []
    for node_name in sorted(tracks):
        for path in sorted(tracks[node_name]):
            fn = tracks[node_name][path]
            vals = [fn(t) for t in times]
            if path == "translation":
                vals = [[c * unit for c in v] for v in vals]
            out = add(vals, "VEC4" if path == "rotation" else "VEC3")
            samplers.append({"input": t_acc, "output": out, "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": idx[node_name], "path": path}})
    doc = {
        "asset": {"version": "2.0", "generator": "forge synthetic_rigs.py"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": nodes,
        "meshes": [{"name": "JointBox", "primitives": [{"attributes": {"POSITION": pos_acc},
                                                        "indices": idx_acc, "material": 0}]}],
        "materials": [{"name": "Synthetic", "pbrMetallicRoughness": {
            "baseColorFactor": [0.94, 0.58, 0.26, 1.0], "metallicFactor": 0.0, "roughnessFactor": 0.8}}],
        "animations": [{"name": name, "samplers": samplers, "channels": channels}],
        "buffers": [{"byteLength": len(blob)}], "bufferViews": views, "accessors": accessors,
    }
    js = json.dumps(doc, separators=(",", ":"), sort_keys=True).encode()
    js += b" " * (-len(js) % 4)
    blob += b"\x00" * (-len(blob) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob))


def planted_turn(angle, duration, profile="ramp", drive="Hips", unit=1.0, root_scale=1.0,
                 lift_deg=35.0, name="TurnInPlace"):
    """Turn pivoting on the inside foot (left for +angle) while the outside foot steps.

    Pivot ankle stays fixed in world XZ by construction; the stepping foot is fully
    lifted before the yaw starts and lands after it ends.
    """
    pivot_x = HIP_HALF_WIDTH if angle >= 0 else -HIP_HALF_WIDTH
    swing = "Right" if angle >= 0 else "Left"
    a, b = 0.2 * duration, 0.8 * duration

    def theta(t):
        u = window(t, a, b)
        if profile == "return":  # out and back: net heading zero
            return angle * math.sin(math.pi * min(1.0, max(0.0, u))) ** 2
        return angle * smoothstep(u)

    def lift(t):
        up = smoothstep(window(t, 0.1 * duration, a))
        down = 1.0 - smoothstep(window(t, b, 0.9 * duration))
        return lift_deg * min(up, down)

    # Rest translation (metres) of the driven node in its parent space.
    rest = (0.0, 0.95, 0.0) if drive == "Hips" else (0.0, 0.0, 0.0)
    # Pivot in that same space; with the Root driver the world is metres already.
    px, pz = pivot_x, 0.0

    def trans(t):
        dx, dz = rot_y(rest[0] - px, rest[2] - pz, theta(t))
        v = [px + dx, rest[1], pz + dz]
        # Root sits in world space (metres); build_glb multiplies tracks by `unit`.
        return [c / unit for c in v] if drive == "Root" else v

    tracks = {
        drive: {"rotation": lambda t: qy(theta(t)), "translation": trans},
        swing + "UpLeg": {"rotation": lambda t: qx(-lift(t))},
        swing + "Leg": {"rotation": lambda t: qx(2 * lift(t))},
    }
    return build_glb(name, duration, tracks, unit=unit, root_scale=root_scale)


def skating_turn(angle, duration, name="TurnInPlace"):
    """Hips spin about their own centre with both feet grounded: feet skate."""
    a, b = 0.2 * duration, 0.8 * duration
    tracks = {"Hips": {"rotation": lambda t: qy(angle * smoothstep(window(t, a, b)))}}
    return build_glb(name, duration, tracks)


def stepping_in_place(duration=0.8, lift_deg=35.0, name="TurnInPlace"):
    """Footwork with NO heading change: right foot steps, then left (like the private clip's
    reported structure: Hips constant, legs/feet moving)."""
    def lift(t, a, b):
        ramp = 0.08 * duration
        up = smoothstep(window(t, a, a + ramp))
        down = 1.0 - smoothstep(window(t, b - ramp, b))
        return lift_deg * min(up, down)
    r = lambda t: lift(t, 0.05 * duration, 0.45 * duration)
    l = lambda t: lift(t, 0.55 * duration, 0.95 * duration)
    tracks = {
        "RightUpLeg": {"rotation": lambda t: qx(-r(t))},
        "RightLeg": {"rotation": lambda t: qx(2 * r(t))},
        "LeftUpLeg": {"rotation": lambda t: qx(-l(t))},
        "LeftLeg": {"rotation": lambda t: qx(2 * l(t))},
    }
    return build_glb(name, duration, tracks)


# name -> (builder, expectations)
FIXTURES = {
    "planted_turn_90": (lambda: planted_turn(90, 1.6), {
        "net": 90, "classification": "PLANTED_TURN", "pivot": "left", "verdict": "PASS"}),
    "planted_turn_180_right": (lambda: planted_turn(-180, 3.0), {
        "net": -180, "classification": "PLANTED_TURN", "pivot": "right", "verdict": "PASS"}),
    "skating_turn_90": (lambda: skating_turn(90, 1.6), {
        "net": 90, "classification": "TURN_WITH_FOOT_SLIDE", "verdict": "FAIL"}),
    "turn_and_return_30": (lambda: planted_turn(30, 1.6, profile="return"), {
        "net": 0, "classification": "TURN_AND_RETURN", "verdict": "FAIL"}),
    "full_spin_360": (lambda: planted_turn(360, 4.0), {
        "net": 360, "classification": "PLANTED_TURN", "pivot": "left"}),
    "root_driven_cm_units_90": (lambda: planted_turn(90, 1.6, drive="Root", unit=100.0, root_scale=0.01), {
        "net": 90, "classification": "PLANTED_TURN", "pivot": "left", "verdict": "PASS"}),
    "fast_turn_90_0p8s": (lambda: planted_turn(90, 0.8), {
        "net": 90, "classification": "PLANTED_TURN", "pivot": "left"}),
    "stepping_in_place_0p8s": (lambda: stepping_in_place(0.8), {
        "net": 0, "classification": "NO_NET_HEADING", "verdict": "FAIL"}),
}


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    out = Path(argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for name, (build, _) in sorted(FIXTURES.items()):
        (out / (name + ".glb")).write_bytes(build())
        print(out / (name + ".glb"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
