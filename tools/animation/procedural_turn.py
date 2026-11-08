#!/usr/bin/env python3
"""Derive a planted, stepping turn from an in-place footwork clip (Option A, Issue #3).

The original clip is never altered. A NEW animation is appended to an in-memory
copy of the glTF: the original tracks are repeated `cycles` times and the
armature root receives extra yaw about the pivot foot, applied ONLY while the
pivot foot is grounded and the other foot is in the air. Because every rotation
is about a planted foot, that foot does not slide; the swing foot lands at its
rotated spot. A 360 degree total loops seamlessly in model-viewer (360 == 0), so
no root-motion accumulation is needed in the viewer.

Why a derived clip instead of animating `orientation` in model-viewer 4.1.0:
  * `orientation` rotates about the model origin, not a foot -> planted-foot slide;
  * each `orientation` change re-runs applyTransform + updateBoundingBox +
    updateShadow (scene-graph.js), a per-frame cost on a skinned mesh.

Privacy: writes only where you tell it to and REFUSES to write inside a git
work tree (so a derived likeness cannot be committed by accident).

  python3 tools/animation/procedural_turn.py IN.glb OUT.glb --clip TurnInPlace \
      --total-deg 360 --max-step-deg 60
"""
from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gltf_turn_diagnose as D  # noqa: E402

OUT_FPS = 60


def single_support_windows(rig, clip_index, pivot=None, gates=None, fps=D.SAMPLE_FPS, prefer=None):
    """Return (pivot_side, windows[(t0,t1)], cycle_s, joints) for one clip cycle."""
    G = dict(D.GATES, **(gates or {}))
    chans = rig.channels(clip_index)
    cycle = max(c.times[-1] for cs in chans.values() for c in cs.values())
    J = D.find_joints(rig.names)
    for k in ("Lupleg", "Rupleg", "Lfoot", "Rfoot"):
        if J.get(k) is None:
            raise ValueError("Could not identify joint %s" % k)
    ts = D.times_for(cycle, fps)
    wanted = [v for v in J.values() if v is not None]
    P = {k: [] for k in J if J[k] is not None}
    for t in ts:
        w = rig.world(chans, t, wanted)
        for k in P:
            P[k].append(D.pos(w[J[k]]))

    def leg(side):
        if side + "knee" in P:
            return D.dist(P[side + "upleg"][0], P[side + "knee"][0]) + D.dist(P[side + "knee"][0], P[side + "foot"][0])
        return D.dist(P[side + "upleg"][0], P[side + "foot"][0])
    L = (leg("L") + leg("R")) / 2

    def low(side, k):
        ys = [P[side + "foot"][k][1]] + ([P[side + "toe"][k][1]] if side + "toe" in P else [])
        return min(ys)
    ground = min(low(s, k) for s in "LR" for k in range(len(ts)))
    tol = G["contact_height_leg_ratio"] * L
    down = {s: [low(s, k) - ground <= tol for k in range(len(ts))] for s in "LR"}

    def runs(side):
        other = "R" if side == "L" else "L"
        flags = [down[side][k] and not down[other][k] for k in range(len(ts))]
        segs = D.contact_segments(flags)
        # 1-sample margin each side so the swing foot is clearly airborne.
        return [(ts[a + 1], ts[b - 1]) for a, b in segs if b - a >= 4]

    if pivot is None:
        # Prefer the inside foot (left for a left turn); fall back to the other side.
        order = [prefer, "R" if prefer == "L" else "L"] if prefer else ["L", "R"]
        pivot = next((s for s in order if runs(s)), order[0])
    wins = runs(pivot)
    if not wins:
        raise ValueError("No single-support window for pivot %s: footwork never lifts the other foot "
                         "clear of the ground, so a planted turn cannot be derived." % pivot)
    return pivot, wins, cycle, J


def _rot_y(x, z, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return x * c + z * s, -x * s + z * c


def _qy(deg):
    h = math.radians(deg) / 2
    return [0.0, math.sin(h), 0.0, math.cos(h)]


def _smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3 - 2 * u)


def derive(glb: bytes, clip_index: int, total_deg: float = 360.0, max_step_deg: float = 60.0,
           pivot=None, name=None):
    """Return (new_glb_bytes, plan_dict). The original animation is left untouched."""
    g = D.Gltf(glb)
    if g.bin is None:
        raise ValueError("Input must be a GLB with an embedded BIN chunk")
    rig = D.Rig(g)
    inside = "L" if total_deg >= 0 else "R"
    pivot, wins, cycle, J = single_support_windows(rig, clip_index, pivot, prefer=inside)
    wins_per_cycle = len(wins)
    steps_needed = max(1, math.ceil(abs(total_deg) / max_step_deg - 1e-9))
    cycles = max(1, math.ceil(steps_needed / wins_per_cycle))
    steps = cycles * wins_per_cycle
    step = total_deg / steps
    chans = rig.channels(clip_index)
    root = rig.chain(J["hips"] if J.get("hips") is not None else J["Lupleg"])[0]
    if "matrix" in rig.nodes[root]:
        raise ValueError("Armature root uses a matrix; convert it to TRS first")
    pivot_joint = J[pivot + "foot"]

    # Schedule: (start, end, step) in absolute time.
    sched = []
    for c in range(cycles):
        for a, b in wins:
            sched.append((c * cycle + a, c * cycle + b, step))
    total_t = cycles * cycle
    n = int(round(total_t * OUT_FPS)) + 1
    times = [total_t * k / (n - 1) for k in range(n)]

    def local_t(t):
        if t >= total_t:
            return cycle
        return t - math.floor(t / cycle) * cycle

    # Accumulated rigid yaw M = (phi, cx, cz): x' = R(phi) x + c, applied to world.
    acc = [0.0, 0.0, 0.0]
    root_T, root_R = [], []
    si = 0
    cur_pivot = None
    for t in times:
        while si < len(sched) and t > sched[si][1]:
            # close finished window into the accumulator
            a, b, d = sched[si]
            if cur_pivot is None:
                cur_pivot = _pivot_world(rig, chans, a, cycle, pivot_joint, acc)
            acc = _compose(acc, d, cur_pivot)
            cur_pivot = None
            si += 1
        phi, cx, cz = acc
        if si < len(sched) and sched[si][0] <= t <= sched[si][1]:
            a, b, d = sched[si]
            if cur_pivot is None:
                cur_pivot = _pivot_world(rig, chans, a, cycle, pivot_joint, acc)
            phi, cx, cz = _compose(acc, d * _smooth((t - a) / (b - a)), cur_pivot)
        tr, ro, _sc = rig.rest_trs(root)
        lt = local_t(t)
        if root in chans:
            tr = chans[root]["translation"].sample(lt) if "translation" in chans[root] else tr
            ro = chans[root]["rotation"].sample(lt) if "rotation" in chans[root] else ro
        x, z = _rot_y(tr[0], tr[2], phi)
        root_T.append([x + cx, tr[1], z + cz])
        root_R.append(D.q_norm(D.q_mul(_qy(phi), ro)))

    # Build the new animation: resample every animated node + new root tracks.
    js = g.json
    blob = bytearray(g.bin)
    blob += b"\x00" * (-len(blob) % 4)
    views = js.setdefault("bufferViews", [])
    accs = js.setdefault("accessors", [])

    def add(values, typ):
        flat = [float(v) for row in values for v in (row if isinstance(row, list) else [row])]
        off = len(blob)
        blob.extend(struct.pack("<%df" % len(flat), *flat))
        views.append({"buffer": 0, "byteOffset": off, "byteLength": 4 * len(flat)})
        acc_ = {"bufferView": len(views) - 1, "componentType": 5126, "count": len(values), "type": typ}
        if typ == "SCALAR":
            acc_["min"], acc_["max"] = [min(values)], [max(values)]
        accs.append(acc_)
        return len(accs) - 1

    t_acc = add(times, "SCALAR")
    samplers, channels = [], []
    nodes = sorted(set(chans) | {root})
    for node in nodes:
        for path in ("translation", "rotation", "scale"):
            if node == root and path in ("translation", "rotation"):
                vals = root_T if path == "translation" else root_R
            elif node in chans and path in chans[node]:
                vals = [chans[node][path].sample(local_t(t)) for t in times]
            else:
                continue
            out = add(vals, "VEC4" if path == "rotation" else "VEC3")
            samplers.append({"input": t_acc, "output": out, "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": node, "path": path}})
    src = js["animations"][clip_index].get("name") or "Animation %d" % (clip_index + 1)
    new_name = name or "%s (planted %+g deg)" % (src, total_deg)
    js["animations"].append({"name": new_name, "samplers": samplers, "channels": channels})
    blob += b"\x00" * (-len(blob) % 4)
    js["buffers"][0]["byteLength"] = len(blob)
    text = json.dumps(js, separators=(",", ":"), sort_keys=True).encode()
    text += b" " * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(blob)
    out = (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(text), 0x4E4F534A) + text
           + struct.pack("<II", len(blob), 0x004E4942) + bytes(blob))
    plan = {
        "source_clip": src, "new_clip": new_name, "new_clip_index": len(js["animations"]) - 1,
        "pivot_foot": "left" if pivot == "L" else "right", "armature_root": rig.names[root],
        "pivot_is_inside_foot": pivot == inside,
        "source_cycle_s": round(cycle, 4), "cycles": cycles, "steps": steps,
        "deg_per_step": round(step, 3), "total_deg": total_deg,
        "single_support_windows_s": [[round(a, 3), round(b, 3)] for a, b in wins],
        "new_duration_s": round(total_t, 4),
        "seamless_loop": abs(D.wrap180(total_deg)) < 1e-6,
    }
    return out, plan


def _pivot_world(rig, chans, t_abs, cycle, joint, acc):
    lt = t_abs - math.floor(t_abs / cycle) * cycle
    p = D.pos(rig.world(chans, lt, [joint])[joint])
    x, z = _rot_y(p[0], p[2], acc[0])
    return (x + acc[1], z + acc[2])


def _compose(acc, theta, p):
    phi, cx, cz = acc
    x, z = _rot_y(cx - p[0], cz - p[1], theta)
    return [phi + theta, x + p[0], z + p[1]]


def _inside_git_tree(path: Path) -> bool:
    for parent in [path.resolve().parent, *path.resolve().parents]:
        if (parent / ".git").exists():
            return True
    return False


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("model")
    ap.add_argument("out")
    ap.add_argument("--clip")
    ap.add_argument("--total-deg", type=float, default=360.0)
    ap.add_argument("--max-step-deg", type=float, default=60.0)
    ap.add_argument("--pivot", choices=["L", "R"])
    ap.add_argument("--allow-git-output", action="store_true",
                    help="permit writing inside a git work tree (synthetic fixtures only)")
    a = ap.parse_args(argv)
    out = Path(a.out)
    if _inside_git_tree(out) and not a.allow_git_output:
        raise SystemExit("Refusing to write inside a git work tree (privacy guard). "
                         "Choose a private folder outside any repository.")
    data = Path(a.model).read_bytes()
    rig = D.Rig(D.Gltf(data))
    idx = D.find_clip(rig, a.clip)
    glb, plan = derive(data, idx, a.total_deg, a.max_step_deg, a.pivot)
    out.write_bytes(glb)
    print(json.dumps(plan, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
