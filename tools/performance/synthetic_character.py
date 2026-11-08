#!/usr/bin/env python3
"""Deterministic synthetic *skinned, textured, animated* GLB for performance tests.

Stands in for a private character without any likeness: a capsule-like body
(rings x segments) skinned to a vertical bone chain, a procedurally generated
PNG base-colour texture, two looping clips ("Idle", "Walk") and four one-shot
turn clips named like the ones FORGE's turn buttons recognise. Triangle count,
texture size and bone count are configurable so cost can be swept.

  python3 tools/performance/synthetic_character.py OUT.glb --preset typical
  python3 tools/performance/synthetic_character.py OUT.glb --tris 80000 --texture 1024

Standard library only. Same arguments -> identical bytes.
"""
from __future__ import annotations

import argparse
import json
import math
import struct
import sys
import zlib
from pathlib import Path

PRESETS = {
    # name: (target triangles, texture edge px, bones)
    "light": (12_000, 512, 16),
    "typical": (60_000, 1024, 32),
    "heavy": (200_000, 2048, 64),
}
# Clip names/durations FORGE PR #2 recognises for its one-tap turn buttons (public UI code).
TURN_CLIPS = [("Turn90Left_PrivateV1", 90, 1.70), ("Turn90Right_PrivateV1", -90, 1.70),
              ("Turn180Left_PrivateV1", 180, 2.58), ("Turn180Right_PrivateV1", -180, 2.58)]
SEGMENTS = 96
HEIGHT = 1.8
RADIUS = 0.22


def png_rgb(size: int, seed: int = 1) -> bytes:
    """Smooth value noise + fine grain: compresses like a real skin texture, not like a flat fill."""
    cells = 16
    state = seed

    def rnd():
        nonlocal state
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        return state / 0x7FFFFFFF
    grid = [[rnd() for _ in range(cells + 1)] for _ in range(cells + 1)]
    rows = bytearray()
    step = cells / size
    for y in range(size):
        rows.append(0)
        gy = y * step
        iy = int(gy)
        fy = gy - iy
        fy = fy * fy * (3 - 2 * fy)
        r0, r1 = grid[iy], grid[min(iy + 1, cells)]
        for x in range(size):
            gx = x * step
            ix = int(gx)
            fx = gx - ix
            fx = fx * fx * (3 - 2 * fx)
            a = r0[ix] + (r0[min(ix + 1, cells)] - r0[ix]) * fx
            b = r1[ix] + (r1[min(ix + 1, cells)] - r1[ix]) * fx
            v = a + (b - a) * fy
            grain = ((x * 2654435761 ^ y * 40503) >> 7) & 15
            base = int(120 + 90 * v) + grain
            rows += bytes((min(255, base + 40), min(255, base), min(255, base - 30 if base > 30 else 0)))
    raw = zlib.compress(bytes(rows), 6)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


def qx(deg):
    h = math.radians(deg) / 2
    return [math.sin(h), 0.0, 0.0, math.cos(h)]


def qz(deg):
    h = math.radians(deg) / 2
    return [0.0, 0.0, math.sin(h), math.cos(h)]


def build(tris: int, tex: int, bones: int, turns: bool = True) -> tuple[bytes, dict]:
    rings = max(2, round(tris / (2 * SEGMENTS)) + 1)
    pos, nrm, uv, jnt, wgt = [], [], [], [], []
    seg_h = HEIGHT / bones
    for r in range(rings):
        v = r / (rings - 1)
        y = v * HEIGHT
        # capsule-ish profile: narrower at the ends
        prof = RADIUS * (0.55 + 0.45 * math.sin(math.pi * min(1.0, max(0.0, v * 1.1 - 0.05))))
        b = min(bones - 1, int(y / seg_h))
        t = (y - b * seg_h) / seg_h
        b2 = min(bones - 1, b + 1)
        for s in range(SEGMENTS):
            a = 2 * math.pi * s / SEGMENTS
            cx, cz = math.cos(a), math.sin(a)
            pos += [prof * cx, y, prof * cz]
            nrm += [cx, 0.0, cz]
            uv += [s / SEGMENTS, 1 - v]
            jnt += [b, b2, 0, 0]
            wgt += [1 - t, t, 0.0, 0.0] if b2 != b else [1.0, 0.0, 0.0, 0.0]
    idx = []
    for r in range(rings - 1):
        for s in range(SEGMENTS):
            a = r * SEGMENTS + s
            b_ = r * SEGMENTS + (s + 1) % SEGMENTS
            c = a + SEGMENTS
            d = b_ + SEGMENTS
            idx += [a, c, b_, b_, c, d]
    nverts = len(pos) // 3
    big = nverts > 65535

    blob = bytearray()
    views, accs = [], []

    def add(data: bytes, target=None):
        blob.extend(b"\x00" * (-len(blob) % 4))
        off = len(blob)
        blob.extend(data)
        view = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            view["target"] = target
        views.append(view)
        return len(views) - 1

    def acc(view, ctype, count, typ, **extra):
        accs.append(dict({"bufferView": view, "componentType": ctype, "count": count, "type": typ}, **extra))
        return len(accs) - 1

    xs, ys, zs = pos[0::3], pos[1::3], pos[2::3]
    a_pos = acc(add(struct.pack("<%df" % len(pos), *pos), 34962), 5126, nverts, "VEC3",
                min=[min(xs), min(ys), min(zs)], max=[max(xs), max(ys), max(zs)])
    a_nrm = acc(add(struct.pack("<%df" % len(nrm), *nrm), 34962), 5126, nverts, "VEC3")
    a_uv = acc(add(struct.pack("<%df" % len(uv), *uv), 34962), 5126, nverts, "VEC2")
    a_j = acc(add(struct.pack("<%dH" % len(jnt), *jnt), 34962), 5123, nverts, "VEC4")
    a_w = acc(add(struct.pack("<%df" % len(wgt), *wgt), 34962), 5126, nverts, "VEC4")
    a_i = acc(add(struct.pack("<%d%s" % (len(idx), "I" if big else "H"), *idx), 34963),
              5125 if big else 5123, len(idx), "SCALAR")
    img_view = add(png_rgb(tex))

    # Bones: node 0 = mesh, nodes 1..bones = joint chain (each child of previous).
    nodes = [{"name": "Body", "mesh": 0, "skin": 0}]
    for k in range(bones):
        node = {"name": "Bone%02d" % k, "translation": [0.0, 0.0 if k == 0 else seg_h, 0.0]}
        if k + 1 < bones:
            node["children"] = [k + 2]
        nodes.append(node)
    ibm = []
    for k in range(bones):
        ibm += [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -k * seg_h, 0, 1]
    a_ibm = acc(add(struct.pack("<%df" % len(ibm), *ibm)), 5126, bones, "MAT4")

    def clip(name, period, amp_x, amp_z):
        n = 31
        times = [period * i / (n - 1) for i in range(n)]
        a_t = acc(add(struct.pack("<%df" % n, *times)), 5126, n, "SCALAR", min=[0.0], max=[period])
        samplers, channels = [], []
        for k in range(1, bones):
            ph = k / bones * math.pi
            vals = []
            for t in times:
                w = 2 * math.pi * t / period
                q = qx(amp_x * math.sin(w + ph))
                r = qz(amp_z * math.sin(w * 0.5 + ph))
                # q * r
                x1, y1, z1, w1 = q
                x2, y2, z2, w2 = r
                vals += [w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
                         w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2]
            a_v = acc(add(struct.pack("<%df" % len(vals), *vals)), 5126, n, "VEC4")
            samplers.append({"input": a_t, "output": a_v, "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": k + 1, "path": "rotation"}})
        return {"name": name, "samplers": samplers, "channels": channels}

    anims = [clip("Idle", 4.0, 1.2 * 32 / bones, 0.6 * 32 / bones),
             clip("Walk", 0.8667, 4.0 * 32 / bones, 2.0 * 32 / bones)]

    def turn(name, deg, period):
        # Root-bone yaw with eased start/stop: exercises FORGE's one-tap turn controls,
        # which recognise these clip names. Synthetic motion only, not a likeness.
        n = 61
        times = [period * i / (n - 1) for i in range(n)]
        a_t = acc(add(struct.pack("<%df" % n, *times)), 5126, n, "SCALAR", min=[0.0], max=[period])
        vals = []
        for t in times:
            u = t / period
            h = math.radians(deg * u * u * (3 - 2 * u)) / 2
            vals += [0.0, math.sin(h), 0.0, math.cos(h)]
        a_v = acc(add(struct.pack("<%df" % len(vals), *vals)), 5126, n, "VEC4")
        return {"name": name, "samplers": [{"input": a_t, "output": a_v, "interpolation": "LINEAR"}],
                "channels": [{"sampler": 0, "target": {"node": 1, "path": "rotation"}}]}
    if turns:
        anims += [turn(nm, d, per) for nm, d, per in TURN_CLIPS]
    blob.extend(b"\x00" * (-len(blob) % 4))
    doc = {
        "asset": {"version": "2.0", "generator": "forge synthetic_character.py"},
        "scene": 0, "scenes": [{"nodes": [0, 1]}], "nodes": nodes,
        "meshes": [{"name": "Body", "primitives": [{
            "attributes": {"POSITION": a_pos, "NORMAL": a_nrm, "TEXCOORD_0": a_uv, "JOINTS_0": a_j, "WEIGHTS_0": a_w},
            "indices": a_i, "material": 0}]}],
        "materials": [{"name": "Skin", "pbrMetallicRoughness": {
            "baseColorTexture": {"index": 0}, "metallicFactor": 0.0, "roughnessFactor": 0.7}}],
        "textures": [{"source": 0, "sampler": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987}],
        "images": [{"bufferView": img_view, "mimeType": "image/png"}],
        "skins": [{"joints": list(range(1, bones + 1)), "inverseBindMatrices": a_ibm, "skeleton": 1}],
        "animations": anims,
        "buffers": [{"byteLength": len(blob)}], "bufferViews": views, "accessors": accs,
    }
    js = json.dumps(doc, separators=(",", ":"), sort_keys=True).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    glb = (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
           + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob))
    info = {"triangles": len(idx) // 3, "vertices": nverts, "texture_px": tex, "bones": bones,
            "texture_png_bytes": views[img_view]["byteLength"], "glb_bytes": len(glb),
            "index_type": "uint32" if big else "uint16", "clips": [a["name"] for a in anims]}
    return glb, info


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("out")
    ap.add_argument("--preset", choices=sorted(PRESETS), default="typical")
    ap.add_argument("--tris", type=int)
    ap.add_argument("--texture", type=int)
    ap.add_argument("--bones", type=int)
    ap.add_argument("--no-turns", action="store_true", help="omit the four turn clips")
    a = ap.parse_args(argv)
    t, x, b = PRESETS[a.preset]
    glb, info = build(a.tris or t, a.texture or x, a.bones or b, turns=not a.no_turns)
    Path(a.out).write_bytes(glb)
    print(json.dumps(info, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
