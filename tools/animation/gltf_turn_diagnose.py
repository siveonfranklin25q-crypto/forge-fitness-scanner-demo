#!/usr/bin/env python3
"""Offline, deterministic TurnInPlace diagnostics for glTF 2.0 / GLB skeletons.

Answers, with measurements rather than guesses:
  * Does the clip author a real body heading change, and how much (unwrapped,
    so a 360 degree spin is not mistaken for "no change")?
  * Which node authors it (armature root vs hips)?
  * Is a foot planted (pivot) or do the feet skate during the turn?
  * Knee angle range and fastest knee snap (informational).
  * Loop seam: how far the heading pops back when the clip repeats without
    root-motion accumulation (model-viewer / three.js LoopRepeat behaviour).
  * Effective on-screen rates for a given viewer timeScale and auto-rotate
    (rotation-per-second). In model-viewer 4.1.0 auto-rotate spins the scene
    pivot as a rigid turntable (staging.js -> ModelScene.yaw): it is NOT a
    skeletal body turn and cannot plant feet.

Privacy: reports never include the input path or file hash. Only node names,
clip names and numbers are emitted. Do not commit private models or reports
that include identifying data.

Standard library only (Python >= 3.9). Usage:
  python3 tools/animation/gltf_turn_diagnose.py MODEL.glb --list
  python3 tools/animation/gltf_turn_diagnose.py MODEL.glb --clip TurnInPlace \
      --time-scale 1.65 --turntable-deg-per-sec 85 --expect-angle 90 --json
"""
from __future__ import annotations

import argparse
import base64
import json
import math
import re
import struct
import sys
from pathlib import Path

# --------------------------------------------------------------------------
# Gates. Values marked PROPOSED need owner confirmation; they are not derived
# from a validated human-motion dataset (see docs/animation/turn-in-place.md).
# --------------------------------------------------------------------------
GATES = {
    "min_net_heading_deg": 10.0,          # below this the clip is not a turn
    "angle_tolerance_deg": 10.0,          # |net - expected| when --expect-angle
    "max_contact_slide_leg_ratio": 0.025,  # ~2.2 cm on a 0.9 m leg
    "contact_height_leg_ratio": 0.03,     # foot counts as grounded within this
    "pivot_contact_fraction": 0.5,        # pivot foot grounded >= 50% of turn
    "turn_rate_min_deg_s": 60.0,          # PROPOSED natural in-place band
    "turn_rate_max_deg_s": 150.0,         # PROPOSED
    "turn_rate_target_deg_s": 105.0,      # PROPOSED midpoint for time-scale advice
}
SAMPLE_FPS = 120

# ------------------------------- math ------------------------------------

def q_norm(q):
    n = math.sqrt(sum(c * c for c in q)) or 1.0
    return [c / n for c in q]


def q_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return [aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz]


def q_slerp(a, b, t):
    dot = sum(x * y for x, y in zip(a, b))
    if dot < 0:
        b = [-c for c in b]
        dot = -dot
    if dot > 0.9995:
        return q_norm([x + (y - x) * t for x, y in zip(a, b)])
    th = math.acos(max(-1.0, min(1.0, dot)))
    s = math.sin(th)
    wa, wb = math.sin((1 - t) * th) / s, math.sin(t * th) / s
    return [wa * x + wb * y for x, y in zip(a, b)]


def q_angle_deg(a, b):
    dot = abs(sum(x * y for x, y in zip(q_norm(a), q_norm(b))))
    return math.degrees(2 * math.acos(min(1.0, dot)))


def mat_trs(t, r, s):
    x, y, z, w = q_norm(r)
    m = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
    return [[m[0][0] * s[0], m[0][1] * s[1], m[0][2] * s[2], t[0]],
            [m[1][0] * s[0], m[1][1] * s[1], m[1][2] * s[2], t[1]],
            [m[2][0] * s[0], m[2][1] * s[1], m[2][2] * s[2], t[2]],
            [0.0, 0.0, 0.0, 1.0]]


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def mat_from_gltf(m):  # glTF matrices are column-major
    return [[m[c * 4 + r] for c in range(4)] for r in range(4)]


def pos(m):
    return (m[0][3], m[1][3], m[2][3])


def dist(a, b):
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def hdist(a, b):
    return math.hypot(a[0] - b[0], a[2] - b[2])


def wrap180(d):
    d = (d + 180.0) % 360.0 - 180.0
    return 180.0 if d == -180.0 else d


def r(v, n=3):
    return None if v is None else round(float(v), n) + 0.0

# ------------------------------ loading ----------------------------------

COMP = {5120: ("b", 127.0), 5121: ("B", 255.0), 5122: ("h", 32767.0),
        5123: ("H", 65535.0), 5125: ("I", None), 5126: ("f", None)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


class Gltf:
    def __init__(self, data: bytes, base_dir: Path | None = None):
        self.bin = None
        if data[:4] == b"glTF":
            _, version, _total = struct.unpack_from("<III", data, 0)
            if version != 2:
                raise ValueError("Only glTF 2.0 is supported")
            off, self.json = 12, None
            while off < len(data):
                length, ctype = struct.unpack_from("<II", data, off)
                chunk = data[off + 8: off + 8 + length]
                if ctype == 0x4E4F534A:
                    self.json = json.loads(chunk.decode("utf-8"))
                elif ctype == 0x004E4942:
                    self.bin = chunk
                off += 8 + length
        else:
            self.json = json.loads(data.decode("utf-8"))
        self.base_dir = base_dir
        self._buffers = {}

    def buffer(self, i):
        if i not in self._buffers:
            b = self.json["buffers"][i]
            uri = b.get("uri")
            if uri is None:
                if self.bin is None:
                    raise ValueError("GLB BIN chunk missing")
                self._buffers[i] = self.bin
            elif uri.startswith("data:"):
                self._buffers[i] = base64.b64decode(uri.split(",", 1)[1])
            else:
                if self.base_dir is None:
                    raise ValueError("External buffer needs a file path")
                self._buffers[i] = (self.base_dir / uri).read_bytes()
        return self._buffers[i]

    def accessor(self, i):
        a = self.json["accessors"][i]
        if "sparse" in a:
            raise ValueError("Sparse accessors are not supported by this diagnostic")
        fmt, norm = COMP[a["componentType"]]
        n = NCOMP[a["type"]]
        size = struct.calcsize("<" + fmt)
        bv = self.json["bufferViews"][a["bufferView"]]
        buf = self.buffer(bv["buffer"])
        stride = bv.get("byteStride") or size * n
        base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        out = []
        for k in range(a["count"]):
            vals = struct.unpack_from("<%d%s" % (n, fmt), buf, base + k * stride)
            if norm and a.get("normalized", False):
                vals = tuple(max(v / norm, -1.0) for v in vals)
            out.append(list(vals) if n > 1 else vals[0])
        return out

# ----------------------------- sampling ----------------------------------


class Channel:
    def __init__(self, times, values, interp, path):
        self.times, self.values, self.interp, self.path = times, values, interp, path

    def sample(self, t):
        ts, vs = self.times, self.values
        cubic = self.interp == "CUBICSPLINE"
        val = (lambda k: vs[3 * k + 1]) if cubic else (lambda k: vs[k])
        if t <= ts[0] or len(ts) == 1:
            return list(val(0))
        if t >= ts[-1]:
            return list(val(len(ts) - 1))
        lo, hi = 0, len(ts) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if ts[mid] <= t:
                lo = mid
            else:
                hi = mid
        k = lo
        if self.interp == "STEP":
            return list(val(k))
        td = ts[k + 1] - ts[k]
        u = (t - ts[k]) / td if td > 0 else 0.0
        if cubic:
            p0, m0 = vs[3 * k + 1], vs[3 * k + 2]
            p1, m1 = vs[3 * (k + 1) + 1], vs[3 * (k + 1)]
            u2, u3 = u * u, u * u * u
            h = (2 * u3 - 3 * u2 + 1, u3 - 2 * u2 + u, -2 * u3 + 3 * u2, u3 - u2)
            out = [h[0] * a + h[1] * td * b + h[2] * c + h[3] * td * d
                   for a, b, c, d in zip(p0, m0, p1, m1)]
            return q_norm(out) if self.path == "rotation" else out
        if self.path == "rotation":
            return q_slerp(vs[k], vs[k + 1], u)
        return [a + (b - a) * u for a, b in zip(vs[k], vs[k + 1])]


class Rig:
    def __init__(self, g: Gltf):
        self.g = g
        self.nodes = g.json.get("nodes", [])
        self.names = [n.get("name") or "node%d" % i for i, n in enumerate(self.nodes)]
        self.parent = {}
        for i, n in enumerate(self.nodes):
            for c in n.get("children", []):
                self.parent[c] = i
        scenes = g.json.get("scenes") or [{"nodes": [i for i in range(len(self.nodes)) if i not in self.parent]}]
        self.roots = scenes[g.json.get("scene", 0)]["nodes"]

    def clips(self):
        out = []
        for i, a in enumerate(self.g.json.get("animations", [])):
            chans = self.channels(i)
            dur = max((c.times[-1] for cs in chans.values() for c in cs.values()), default=0.0)
            out.append({"index": i, "name": a.get("name") or "Animation %d" % (i + 1),
                        "duration_s": r(dur, 4), "animated_nodes": len(chans)})
        return out

    def channels(self, clip_index):
        a = self.g.json["animations"][clip_index]
        res = {}
        for ch in a.get("channels", []):
            tgt = ch.get("target", {})
            if "node" not in tgt or tgt.get("path") not in ("translation", "rotation", "scale"):
                continue
            s = a["samplers"][ch["sampler"]]
            res.setdefault(tgt["node"], {})[tgt["path"]] = Channel(
                self.g.accessor(s["input"]), self.g.accessor(s["output"]),
                s.get("interpolation", "LINEAR"), tgt["path"])
        return res

    def rest_trs(self, i):
        n = self.nodes[i]
        return (n.get("translation", [0.0, 0.0, 0.0]), n.get("rotation", [0.0, 0.0, 0.0, 1.0]),
                n.get("scale", [1.0, 1.0, 1.0]))

    def local(self, i, chans, t, mask=None):
        n = self.nodes[i]
        c = chans.get(i) if (mask is None or i in mask) else None
        if not c and "matrix" in n:
            return mat_from_gltf(n["matrix"])
        tr, ro, sc = self.rest_trs(i)
        if c:
            tr = c["translation"].sample(t) if "translation" in c else tr
            ro = c["rotation"].sample(t) if "rotation" in c else ro
            sc = c["scale"].sample(t) if "scale" in c else sc
        return mat_trs(tr, ro, sc)

    def world(self, chans, t, wanted, mask=None):
        """World matrices for `wanted` node indices (and their ancestors)."""
        cache = {}

        def w(i):
            if i not in cache:
                loc = self.local(i, chans, t, mask)
                p = self.parent.get(i)
                cache[i] = mat_mul(w(p), loc) if p is not None else loc
            return cache[i]
        return {i: w(i) for i in wanted if i is not None}

    def chain(self, i):
        out = []
        while i is not None:
            out.append(i)
            i = self.parent.get(i)
        return list(reversed(out))

# ---------------------------- joint finding ------------------------------

SIDE = {"L": re.compile(r"(^|[^a-z])(left|l)([^a-z]|$)|left", re.I),
        "R": re.compile(r"(^|[^a-z])(right|r)([^a-z]|$)|right", re.I)}
PART = {
    "upleg": re.compile(r"up_?leg|thigh|upperleg|hip(?!s)", re.I),
    "knee": re.compile(r"(?<!up)(?<!up_)(?<!upper)leg(?!.*up)|shin|calf|knee|lowerleg", re.I),
    "foot": re.compile(r"foot|ankle", re.I),
    "toe": re.compile(r"toe|ball", re.I),
    "arm": re.compile(r"(?<!fore)(?<!lower)arm(?!.*twist)|shoulder|clavicle|upperarm", re.I),
}


def find_joints(names, overrides=None):
    overrides = overrides or {}
    found = {}

    def pick(part, side):
        key = side + part
        if overrides.get(key):
            return names.index(overrides[key]) if overrides[key] in names else None
        best = None
        for i, nm in enumerate(names):
            core = re.sub(r"^.*[:|]", "", nm)
            if not SIDE[side].search(core) or SIDE["R" if side == "L" else "L"].search(core):
                continue
            if not PART[part].search(core):
                continue
            if part == "foot" and PART["toe"].search(core):
                continue
            if part == "knee" and (PART["upleg"].search(core) or PART["foot"].search(core)):
                continue
            if part == "arm" and re.search(r"fore|hand|lower|twist", core, re.I):
                continue
            if best is None or len(nm) < len(names[best]):
                best = i
        return best

    for side in "LR":
        for part in ("upleg", "knee", "foot", "toe", "arm"):
            found[side + part] = pick(part, side)
    hips = overrides.get("hips")
    if hips:
        found["hips"] = names.index(hips) if hips in names else None
    else:
        found["hips"] = next((i for i, n in enumerate(names) if re.search(r"hips|pelvis", n, re.I)), None)
    return found

# ----------------------------- analysis ----------------------------------


def heading_from(left, right):
    """Character heading (deg) from a left-minus-right line, +Y up, 0 = +Z."""
    vx, vz = left[0] - right[0], left[2] - right[2]
    fx, fz = -vz, vx
    if abs(fx) < 1e-9 and abs(fz) < 1e-9:
        return None
    return math.degrees(math.atan2(fx, fz))


def unwrap(seq):
    out, prev = [], None
    for v in seq:
        if v is None:
            out.append(out[-1] if out else 0.0)
            continue
        out.append(v if prev is None else out[-1] + wrap180(v - prev))
        prev = v
    return out


def times_for(duration, fps=SAMPLE_FPS):
    n = max(2, int(math.ceil(duration * fps)) + 1)
    return [duration * k / (n - 1) for k in range(n)]


def contact_segments(flags):
    segs, start = [], None
    for k, f in enumerate(flags + [False]):
        if f and start is None:
            start = k
        elif not f and start is not None:
            segs.append((start, k - 1))
            start = None
    return segs


def analyse(rig: Rig, clip_index: int, time_scale=1.0, turntable_deg_s=0.0,
            expect_angle=None, overrides=None, gates=None):
    G = dict(GATES, **(gates or {}))
    chans = rig.channels(clip_index)
    clip = rig.clips()[clip_index]
    dur = max((c.times[-1] for cs in chans.values() for c in cs.values()), default=0.0)
    if dur <= 0:
        raise ValueError("Clip has zero duration")
    J = find_joints(rig.names, overrides)
    need = ["Lupleg", "Rupleg", "Lfoot", "Rfoot"]
    missing = [k for k in need if J.get(k) is None]
    if missing:
        raise ValueError("Could not identify joints %s; pass --joint overrides" % missing)
    ts = times_for(dur)
    wanted = [v for v in J.values() if v is not None]

    frames = [rig.world(chans, t, wanted) for t in ts]
    P = {k: [pos(f[v]) for f in frames] if v is not None else None for k, v in J.items()}

    pelvis = unwrap([heading_from(a, b) for a, b in zip(P["Lupleg"], P["Rupleg"])])
    shoulders = None
    if P.get("Larm") and P.get("Rarm"):
        shoulders = unwrap([heading_from(a, b) for a, b in zip(P["Larm"], P["Rarm"])])
    rel = [h - pelvis[0] for h in pelvis]
    net = rel[-1]
    peak = max(rel, key=abs)

    # Per-node attribution: heading change when only one chain node animates.
    attribution = []
    hip_chain = rig.chain(J["Lupleg"])[:-1]
    for node in hip_chain:
        if node not in chans:
            continue
        mask = {node}
        f0 = rig.world(chans, 0.0, [J["Lupleg"], J["Rupleg"]], mask)
        f1 = rig.world(chans, dur, [J["Lupleg"], J["Rupleg"]], mask)
        seq = [rig.world(chans, t, [J["Lupleg"], J["Rupleg"]], mask) for t in ts[:: max(1, len(ts) // 60)]] + [f1]
        hs = unwrap([heading_from(pos(f[J["Lupleg"]]), pos(f[J["Rupleg"]])) for f in [f0] + seq])
        attribution.append({"node": rig.names[node], "net_heading_deg": r(hs[-1] - hs[0], 2),
                            "channels": sorted(chans[node].keys())})

    # Scale reference: leg length at t=0.
    def leg_len(side):
        k = P.get(side + "knee")
        if k:
            return dist(P[side + "upleg"][0], k[0]) + dist(k[0], P[side + "foot"][0])
        return dist(P[side + "upleg"][0], P[side + "foot"][0])
    leg = (leg_len("L") + leg_len("R")) / 2.0
    tol_h = G["contact_height_leg_ratio"] * leg
    max_slide = G["max_contact_slide_leg_ratio"] * leg

    def low(side, k):
        ys = [P[side + "foot"][k][1]]
        if P.get(side + "toe"):
            ys.append(P[side + "toe"][k][1])
        return min(ys)
    ground = min(low(s, k) for s in "LR" for k in range(len(ts)))

    # Turn window: 5%..95% of net heading.
    turning = abs(net) >= G["min_net_heading_deg"]
    t5 = t95 = None
    if turning:
        for k, h in enumerate(rel):
            if t5 is None and abs(h) >= 0.05 * abs(net):
                t5 = ts[k]
            if t95 is None and abs(h) >= 0.95 * abs(net):
                t95 = ts[k]
    peak_rate = max(abs(wrap180(b - a)) / (ts[1] - ts[0]) for a, b in zip(pelvis, pelvis[1:]))

    feet = {}
    for side, label in (("L", "left"), ("R", "right")):
        flags = [low(side, k) - ground <= tol_h for k in range(len(ts))]
        segs = []
        for a, b in contact_segments(flags):
            pts = [P[side + "foot"]] + ([P[side + "toe"]] if P.get(side + "toe") else [])
            slide = min(max(hdist(p[k], p[a]) for k in range(a, b + 1)) for p in pts)
            segs.append({"start_s": r(ts[a]), "end_s": r(ts[b]), "slide_m": r(slide, 4),
                         "slide_leg_ratio": r(slide / leg, 4)})
        in_turn = [flags[k] for k in range(len(ts)) if turning and t5 <= ts[k] <= t95]
        feet[label] = {
            "contact_fraction_clip": r(sum(flags) / len(flags)),
            "contact_fraction_turn": r(sum(in_turn) / len(in_turn)) if in_turn else None,
            "contact_segments": segs,
            "max_slide_m": r(max([s["slide_m"] for s in segs] or [0.0]), 4),
        }

    knees = {}
    for side, label in (("L", "left"), ("R", "right")):
        if not P.get(side + "knee"):
            continue
        ang = []
        for k in range(len(ts)):
            h, kn, f = P[side + "upleg"][k], P[side + "knee"][k], P[side + "foot"][k]
            a = [h[i] - kn[i] for i in range(3)]
            b = [f[i] - kn[i] for i in range(3)]
            na, nb = math.sqrt(sum(x * x for x in a)), math.sqrt(sum(x * x for x in b))
            c = sum(x * y for x, y in zip(a, b)) / (na * nb) if na and nb else 1.0
            ang.append(math.degrees(math.acos(max(-1.0, min(1.0, c)))))
        dt = ts[1] - ts[0]
        knees[label] = {"min_interior_deg": r(min(ang), 2), "max_interior_deg": r(max(ang), 2),
                        "max_angular_speed_deg_s": r(max(abs(b - a) / dt for a, b in zip(ang, ang[1:])), 1)}

    # Loop seam: local pose difference between first and last frame.
    seam = 0.0
    for node, cs in chans.items():
        if "rotation" in cs:
            seam = max(seam, q_angle_deg(cs["rotation"].sample(0.0), cs["rotation"].sample(dur)))
    hips_i = J.get("hips")
    root_drift = r(hdist(P["hips"][0], P["hips"][-1]), 4) if hips_i is not None else None

    # Viewer playback (model-viewer timeScale + turntable auto-rotate).
    ts_ = float(time_scale)
    cycle = dur / ts_
    window = (t95 - t5) / ts_ if turning and t95 and t5 is not None and t95 > t5 else None
    mean_rate = (0.9 * abs(net) / window) if window else None
    rate_1x = mean_rate * 1.0 / ts_ if mean_rate else None
    rec_scale = (G["turn_rate_target_deg_s"] / rate_1x) if rate_1x else None
    playback = {
        "time_scale": r(ts_, 3),
        "cycle_s": r(cycle, 4),
        "body_turn_mean_rate_deg_s": r(mean_rate, 1),
        "body_turn_peak_rate_deg_s": r(peak_rate * ts_, 1),
        "turntable_deg_s": r(turntable_deg_s, 1),
        "turntable_deg_per_cycle": r(turntable_deg_s * cycle, 1),
        "seconds_per_360_turntable": r(360.0 / turntable_deg_s, 2) if turntable_deg_s else None,
        "loop_heading_pop_deg": r(-net, 2) if turning else 0.0,
        "recommended_time_scale": r(rec_scale, 3),
        "recommended_cycle_s": r(dur / rec_scale, 3) if rec_scale else None,
    }

    gates_out = {}
    gates_out["heading_authored"] = "PASS" if turning else "FAIL"
    if expect_angle is not None:
        gates_out["angle_matches_expected"] = "PASS" if abs(abs(net) - abs(expect_angle)) <= G["angle_tolerance_deg"] else "FAIL"
    all_segs = feet["left"]["contact_segments"] + feet["right"]["contact_segments"]
    gates_out["foot_slide"] = "PASS" if all(s["slide_m"] <= max_slide + 1e-9 for s in all_segs) else "FAIL"
    def planted(s):  # grounded for most of the turn AND not sliding
        return ((feet[s]["contact_fraction_turn"] or 0) >= G["pivot_contact_fraction"]
                and feet[s]["max_slide_m"] <= max_slide + 1e-9)
    if turning:
        gates_out["pivot_foot_present"] = "PASS" if any(planted(s) for s in ("left", "right")) else "FAIL"
        gates_out["turn_rate_in_band_PROPOSED"] = (
            "PASS" if mean_rate and G["turn_rate_min_deg_s"] <= mean_rate <= G["turn_rate_max_deg_s"] else "FAIL")
    pivot = None
    if turning:
        cand = [(feet[s]["contact_fraction_turn"] or 0, -feet[s]["max_slide_m"], s)
                for s in ("left", "right") if planted(s)]
        pivot = max(cand)[2] if cand else None

    if not turning:
        classification = "NO_NET_HEADING"
        if abs(peak) >= G["min_net_heading_deg"]:
            classification = "TURN_AND_RETURN"
    elif gates_out["foot_slide"] == "FAIL":
        classification = "TURN_WITH_FOOT_SLIDE"
    else:
        classification = "PLANTED_TURN"

    verdict = "PASS" if all(v == "PASS" for v in gates_out.values()) else "FAIL"
    notes = []
    if not turning:
        notes.append("Clip does not change body heading; any on-screen spin comes from the viewer "
                     "turntable auto-rotate (rotation-per-second), not from the skeleton.")
    if turning:
        notes.append("model-viewer loops with three.js LoopRepeat and does not accumulate root motion: "
                     "the body snaps back %.1f deg every %.3f s unless the integrator adds the net yaw "
                     "(e.g. play({repetitions:1}) + 'finished' -> orientation += net)." % (abs(net), cycle))
    if turntable_deg_s:
        notes.append("Turntable auto-rotate of %.0f deg/s is a rigid whole-model viewer effect and must not "
                     "be reported as body-turn quality." % turntable_deg_s)
    return {
        "tool": "forge-gltf-turn-diagnose/1",
        "clip": {"name": clip["name"], "index": clip_index, "duration_s": r(dur, 4),
                 "sample_fps": SAMPLE_FPS, "animated_nodes": len(chans)},
        "joints": {k: rig.names[v] for k, v in sorted(J.items()) if v is not None},
        "scale": {"leg_length_m": r(leg, 4), "contact_height_tol_m": r(tol_h, 4),
                  "max_slide_m": r(max_slide, 4)},
        "heading": {
            "net_deg": r(net, 2), "peak_excursion_deg": r(peak, 2),
            "direction": "left(+)" if net > 0 else ("right(-)" if net < 0 else "none"),
            "turn_window_s": [r(t5), r(t95)] if turning else None,
            "shoulder_net_deg": r(shoulders[-1] - shoulders[0], 2) if shoulders else None,
            "attribution": attribution,
            "hips_horizontal_drift_m": root_drift,
        },
        "feet": feet,
        "pivot_foot": pivot,
        "knees": knees,
        "loop_seam_max_joint_deg": r(seam, 2),
        "playback": playback,
        "gates": gates_out,
        "thresholds": G,
        "classification": classification,
        "verdict": verdict,
        "notes": notes,
    }


def load(path: str) -> Rig:
    p = Path(path)
    return Rig(Gltf(p.read_bytes(), p.parent))


def find_clip(rig, name):
    clips = rig.clips()
    if name is None:
        for c in clips:
            if re.search(r"turn", c["name"], re.I):
                return c["index"]
        return 0 if clips else None
    for c in clips:
        if c["name"] == name:
            return c["index"]
    for c in clips:
        if name.lower() in c["name"].lower():
            return c["index"]
    raise SystemExit("Clip %r not found; available: %s" % (name, [c["name"] for c in clips]))


def text_report(rep):
    h, pb = rep["heading"], rep["playback"]
    lines = [
        "Clip %s: %.3f s, %d animated nodes" % (rep["clip"]["name"], rep["clip"]["duration_s"], rep["clip"]["animated_nodes"]),
        "Classification: %s   Verdict: %s" % (rep["classification"], rep["verdict"]),
        "Net body heading %.2f deg (peak %.2f), window %s" % (h["net_deg"], h["peak_excursion_deg"], h["turn_window_s"]),
        "Attribution: " + ", ".join("%s=%.1f" % (a["node"], a["net_heading_deg"]) for a in h["attribution"]),
        "Pivot foot: %s; max slide L=%.4f m R=%.4f m (limit %.4f m)" % (
            rep["pivot_foot"], rep["feet"]["left"]["max_slide_m"], rep["feet"]["right"]["max_slide_m"], rep["scale"]["max_slide_m"]),
        "Playback x%s: cycle %.3f s, body rate %s deg/s, turntable %s deg/s, loop pop %s deg, recommended x%s" % (
            pb["time_scale"], pb["cycle_s"], pb["body_turn_mean_rate_deg_s"], pb["turntable_deg_s"],
            pb["loop_heading_pop_deg"], pb["recommended_time_scale"]),
        "Gates: " + ", ".join("%s=%s" % kv for kv in sorted(rep["gates"].items())),
    ]
    lines += ["Note: " + n for n in rep["notes"]]
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("model")
    ap.add_argument("--list", action="store_true", help="list clips and durations")
    ap.add_argument("--clip", help="clip name (default: first containing 'turn')")
    ap.add_argument("--time-scale", type=float, default=1.0)
    ap.add_argument("--turntable-deg-per-sec", type=float, default=0.0)
    ap.add_argument("--expect-angle", type=float)
    ap.add_argument("--joint", action="append", default=[], metavar="KEY=NODE",
                    help="override joint, e.g. Lfoot=mixamorig:LeftFoot, hips=Hips")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    rig = load(a.model)
    if a.list:
        print(json.dumps(rig.clips(), indent=2, sort_keys=True))
        return 0
    idx = find_clip(rig, a.clip)
    if idx is None:
        raise SystemExit("Model has no animations")
    overrides = dict(kv.split("=", 1) for kv in a.joint)
    rep = analyse(rig, idx, a.time_scale, a.turntable_deg_per_sec, a.expect_angle, overrides)
    print(json.dumps(rep, indent=2, sort_keys=True) if a.json else text_report(rep))
    return 0 if rep["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
