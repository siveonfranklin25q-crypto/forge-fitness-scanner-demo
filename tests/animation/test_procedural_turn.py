"""Option A (Issue #3): derive a planted stepping turn from in-place footwork.

Run: python3 -m unittest discover -s tests/animation -v
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools" / "animation"
sys.path.insert(0, str(TOOLS))

import gltf_turn_diagnose as D  # noqa: E402
import procedural_turn as P  # noqa: E402
import synthetic_rigs as S  # noqa: E402

SOURCE = S.stepping_in_place(0.8)


def analyse(glb, clip, **kw):
    return D.analyse(D.Rig(D.Gltf(glb)), clip, **kw)


class SourceClip(unittest.TestCase):
    def test_stepping_source_has_no_heading(self):
        rep = analyse(SOURCE, 0)
        self.assertEqual(rep["classification"], "NO_NET_HEADING")
        self.assertAlmostEqual(rep["heading"]["peak_excursion_deg"], 0.0, delta=0.01)


class DerivedTurn(unittest.TestCase):
    def test_360_loop_is_planted_and_seamless(self):
        glb, plan = P.derive(SOURCE, 0, 360, 45)
        self.assertTrue(plan["seamless_loop"])
        self.assertEqual((plan["cycles"], plan["steps"], plan["deg_per_step"]), (8, 8, 45.0))
        self.assertEqual(plan["new_duration_s"], 6.4)
        rep = analyse(glb, plan["new_clip_index"], expect_angle=360)
        self.assertEqual(rep["classification"], "PLANTED_TURN")
        self.assertAlmostEqual(rep["heading"]["net_deg"], 360.0, delta=0.5)
        self.assertEqual(rep["playback"]["loop_visible_pop_deg"], 0.0)
        for gate in ("heading_authored", "angle_matches_expected", "foot_slide", "pivot_foot_present"):
            self.assertEqual(rep["gates"][gate], "PASS", gate)
        self.assertEqual(rep["pivot_foot"], "left")

    def test_90_left_and_right_use_inside_pivot_and_pass(self):
        for total, side in ((90, "left"), (-90, "right")):
            with self.subTest(total=total):
                glb, plan = P.derive(SOURCE, 0, total, 45)
                self.assertEqual(plan["pivot_foot"], side)
                self.assertTrue(plan["pivot_is_inside_foot"])
                rep = analyse(glb, plan["new_clip_index"], expect_angle=total)
                self.assertAlmostEqual(rep["heading"]["net_deg"], total, delta=0.5)
                self.assertEqual(rep["verdict"], "PASS", rep["gates"])

    def test_pivot_ankle_is_fixed_while_yaw_is_applied(self):
        glb, plan = P.derive(SOURCE, 0, 360, 45)
        rig = D.Rig(D.Gltf(glb))
        ch = rig.channels(plan["new_clip_index"])
        ankle = rig.names.index("LeftFoot")
        worst = 0.0
        for c in range(plan["cycles"]):
            a, b = plan["single_support_windows_s"][0]
            a, b = c * 0.8 + a, c * 0.8 + b
            p0 = D.pos(rig.world(ch, a, [ankle])[ankle])
            for k in range(1, 21):
                t = a + (b - a) * k / 20
                worst = max(worst, D.hdist(p0, D.pos(rig.world(ch, t, [ankle])[ankle])))
        self.assertLess(worst, 0.001, "pivot ankle moved %.4f m during yaw" % worst)

    def test_original_clip_is_untouched(self):
        glb, plan = P.derive(SOURCE, 0, 360, 45)
        before, after = analyse(SOURCE, 0), analyse(glb, 0)
        self.assertEqual(json.dumps(before, sort_keys=True), json.dumps(after, sort_keys=True))
        self.assertEqual(plan["new_clip_index"], 1)

    def test_default_step_meets_proposed_rate_band(self):
        glb, plan = P.derive(SOURCE, 0, 360)
        self.assertEqual((plan["steps"], plan["deg_per_step"], plan["new_duration_s"]), (6, 60.0, 4.8))
        rep = analyse(glb, plan["new_clip_index"], expect_angle=360)
        self.assertEqual(rep["verdict"], "PASS", rep["gates"])
        # Yaw is confined to single support, so the in-step peak is much higher than the
        # mean. Recorded (not gated) so the owner reviews it visually.
        self.assertGreater(rep["playback"]["body_turn_peak_rate_deg_s"], 300)

    def test_deterministic(self):
        self.assertEqual(P.derive(SOURCE, 0, 360, 45)[0], P.derive(SOURCE, 0, 360, 45)[0])

    def test_footwork_without_lift_is_refused(self):
        with self.assertRaises(ValueError):
            P.derive(S.skating_turn(90, 1.6), 0, 360, 45)


class PrivacyGuard(unittest.TestCase):
    def test_refuses_output_inside_git_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "in.glb"
            src.write_bytes(SOURCE)
            target = ROOT / "tools" / "animation" / "should-not-exist.glb"
            with self.assertRaises(SystemExit):
                P.main([str(src), str(target)])
            self.assertFalse(target.exists())

    def test_writes_outside_git_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            if P._inside_git_tree(Path(tmp) / "x.glb"):
                self.skipTest("temp dir is inside a git tree on this host")
            src, out = Path(tmp) / "in.glb", Path(tmp) / "out.glb"
            src.write_bytes(SOURCE)
            from contextlib import redirect_stdout
            import io
            with redirect_stdout(io.StringIO()):
                self.assertEqual(P.main([str(src), str(out)]), 0)
            self.assertTrue(out.exists())


HAVE_THREE = (TOOLS / "node_modules" / "three").is_dir() and shutil.which("node")


class DerivedThreeCrossCheck(unittest.TestCase):
    def test_three_matches_derived_clip(self):
        if not HAVE_THREE:
            if os.environ.get("FORGE_REQUIRE_THREE") == "1":
                self.fail("three.js not installed but FORGE_REQUIRE_THREE=1")
            self.skipTest("three.js not installed")
        glb, plan = P.derive(SOURCE, 0, 360, 45)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "derived.glb"
            path.write_bytes(glb)
            rig = D.Rig(D.Gltf(glb))
            ch = rig.channels(plan["new_clip_index"])
            ts = [round(6.4 * k / 64, 6) for k in range(65)]
            env = dict(os.environ, FORGE_CLIP=str(plan["new_clip_index"]))
            out = json.loads(subprocess.check_output(
                ["node", str(TOOLS / "three_sample.mjs"), str(path)] + [str(t) for t in ts], env=env))
        self.assertAlmostEqual(out["duration"], 6.4, places=4)
        worst = 0.0
        for f in out["frames"]:
            for n in ("LeftFoot", "RightFoot", "LeftUpLeg", "RightUpLeg"):
                i = rig.names.index(n)
                worst = max(worst, D.dist(D.pos(rig.world(ch, f["t"], [i])[i]), f[n]))
        self.assertLess(worst * 1000, 0.5, "max %.4f mm" % (worst * 1000))


if __name__ == "__main__":
    unittest.main()
