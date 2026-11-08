"""Regression tests for tools/animation (stdlib unittest, no browser, no private assets).

Run: python3 -m unittest discover -s tests/animation -v
"""
import io
import json
import math
import struct
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "animation"))

import gltf_turn_diagnose as D  # noqa: E402
import synthetic_rigs as S  # noqa: E402


def rig_from(glb):
    return D.Rig(D.Gltf(glb))


def report(glb, **kw):
    rig = rig_from(glb)
    return D.analyse(rig, 0, **kw)


class FixtureGroundTruth(unittest.TestCase):
    """Each synthetic fixture has analytically known heading, pivot and slide."""

    def test_all_fixtures_match_expectations(self):
        for name, (build, exp) in sorted(S.FIXTURES.items()):
            with self.subTest(fixture=name):
                rep = report(build(), expect_angle=exp["net"] or None)
                self.assertAlmostEqual(rep["heading"]["net_deg"], exp["net"], delta=0.5)
                self.assertEqual(rep["classification"], exp["classification"])
                if "pivot" in exp:
                    self.assertEqual(rep["pivot_foot"], exp["pivot"])
                if "verdict" in exp:
                    self.assertEqual(rep["verdict"], exp["verdict"], rep["gates"])

    def test_planted_pivot_does_not_slide_but_skating_feet_do(self):
        planted = report(S.planted_turn(90, 1.6))
        self.assertLess(planted["feet"]["left"]["max_slide_m"], 0.002)
        skate = report(S.skating_turn(90, 1.6))
        # Feet 0.10 m from the spin axis sweep a 90 deg chord: 0.1*sqrt(2) m.
        self.assertAlmostEqual(skate["feet"]["left"]["max_slide_m"], 0.1 * math.sqrt(2), delta=0.002)
        self.assertEqual(skate["gates"]["foot_slide"], "FAIL")
        self.assertEqual(skate["gates"]["pivot_foot_present"], "FAIL")
        self.assertIsNone(skate["pivot_foot"])


class EndpointFallacy(unittest.TestCase):
    """Equal first/last Hips rotation does NOT imply 'no turn'."""

    def test_360_spin_has_equal_endpoint_rotation_but_full_heading_change(self):
        rig = rig_from(S.planted_turn(360, 4.0))
        hips = rig.names.index("Hips")
        ch = rig.channels(0)[hips]["rotation"]
        self.assertLess(D.q_angle_deg(ch.sample(0.0), ch.sample(4.0)), 0.01)
        rep = D.analyse(rig, 0)
        self.assertAlmostEqual(rep["heading"]["net_deg"], 360.0, delta=0.5)

    def test_turn_and_return_reports_peak_not_net(self):
        rep = report(S.planted_turn(30, 1.6, profile="return"))
        self.assertAlmostEqual(rep["heading"]["net_deg"], 0.0, delta=0.5)
        self.assertAlmostEqual(rep["heading"]["peak_excursion_deg"], 30.0, delta=0.5)
        self.assertIn("turntable auto-rotate", " ".join(rep["notes"]))


class Attribution(unittest.TestCase):
    def test_root_vs_hips_driver_is_identified(self):
        hips = report(S.planted_turn(90, 1.6))["heading"]["attribution"]
        root = report(S.planted_turn(90, 1.6, drive="Root", unit=100.0, root_scale=0.01))["heading"]["attribution"]
        self.assertEqual([(a["node"], round(a["net_heading_deg"])) for a in hips], [("Hips", 90)])
        self.assertEqual([(a["node"], round(a["net_heading_deg"])) for a in root], [("Root", 90)])

    def test_centimetre_armature_reports_metres(self):
        rep = report(S.planted_turn(90, 1.6, drive="Root", unit=100.0, root_scale=0.01))
        self.assertAlmostEqual(rep["scale"]["leg_length_m"], 0.87, delta=0.01)


class ViewerPlayback(unittest.TestCase):
    """Numbers for the PR #2 viewer settings, computed rather than asserted by hand."""

    def test_pr2_settings_on_0p8s_clip(self):
        rep = report(S.planted_turn(90, 0.8), time_scale=1.65, turntable_deg_s=85)
        pb = rep["playback"]
        self.assertAlmostEqual(pb["cycle_s"], 0.8 / 1.65, places=3)
        self.assertAlmostEqual(pb["turntable_deg_per_cycle"], 85 * 0.8 / 1.65, delta=0.1)
        self.assertAlmostEqual(pb["seconds_per_360_turntable"], 360 / 85, delta=0.01)
        self.assertEqual(pb["loop_heading_pop_deg"], -90.0)
        # Speed-up alone pushes this body turn far outside the proposed natural band.
        self.assertEqual(rep["gates"]["turn_rate_in_band_PROPOSED"], "FAIL")

    def test_original_8deg_turntable_takes_45s(self):
        rep = report(S.planted_turn(90, 0.8), turntable_deg_s=8)
        self.assertAlmostEqual(rep["playback"]["seconds_per_360_turntable"], 45.0, places=2)

    def test_recommended_time_scale_lands_on_target(self):
        rep = report(S.planted_turn(90, 0.8))
        k = rep["playback"]["recommended_time_scale"]
        again = report(S.planted_turn(90, 0.8), time_scale=k)
        self.assertAlmostEqual(again["playback"]["body_turn_mean_rate_deg_s"],
                               D.GATES["turn_rate_target_deg_s"], delta=1.0)
        self.assertEqual(again["verdict"], "PASS", again["gates"])


class Sampling(unittest.TestCase):
    def test_step_linear_cubic(self):
        times = [0.0, 1.0]
        self.assertEqual(D.Channel(times, [[0, 0, 0], [2, 0, 0]], "STEP", "translation").sample(0.5), [0, 0, 0])
        self.assertEqual(D.Channel(times, [[0, 0, 0], [2, 0, 0]], "LINEAR", "translation").sample(0.5), [1.0, 0.0, 0.0])
        cub = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [2, 0, 0], [0, 0, 0]]  # in, value, out per key
        self.assertAlmostEqual(D.Channel(times, cub, "CUBICSPLINE", "translation").sample(0.5)[0], 1.0)
        q = D.Channel(times, [S.qy(0), S.qy(90)], "LINEAR", "rotation").sample(0.5)
        self.assertAlmostEqual(D.q_angle_deg(q, S.qy(45)), 0.0, places=4)

    def test_clamps_outside_range(self):
        ch = D.Channel([0.5, 1.0], [[1, 0, 0], [2, 0, 0]], "LINEAR", "translation")
        self.assertEqual(ch.sample(0.0), [1, 0, 0])
        self.assertEqual(ch.sample(9.0), [2, 0, 0])


class JointNaming(unittest.TestCase):
    def test_common_conventions(self):
        cases = {
            "mixamo": ["mixamorig:Hips", "mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "mixamorig:LeftFoot",
                       "mixamorig:LeftToeBase", "mixamorig:RightUpLeg", "mixamorig:RightLeg",
                       "mixamorig:RightFoot", "mixamorig:RightToeBase"],
            "blender": ["pelvis", "thigh.L", "shin.L", "foot.L", "toe.L", "thigh.R", "shin.R", "foot.R", "toe.R"],
            "suffix": ["Hips", "UpperLeg_L", "LowerLeg_L", "Foot_L", "Toes_L", "UpperLeg_R", "LowerLeg_R", "Foot_R", "Toes_R"],
        }
        for label, names in cases.items():
            with self.subTest(convention=label):
                j = D.find_joints(names)
                got = {k: names[v] for k, v in j.items() if v is not None}
                self.assertEqual(got["Lupleg"], names[1])
                self.assertEqual(got["Lknee"], names[2])
                self.assertEqual(got["Lfoot"], names[3])
                self.assertEqual(got["Ltoe"], names[4])
                self.assertEqual(got["Rupleg"], names[5])
                self.assertEqual(got["Rfoot"], names[7])
                self.assertEqual(got["hips"], names[0])

    def test_missing_feet_is_a_clear_error(self):
        rig = rig_from(S.build_glb("X", 1.0, {}))
        rig.names = ["a%d" % i for i in range(len(rig.names))]
        with self.assertRaises(ValueError):
            D.analyse(rig, 0)


class PrivacyAndDeterminism(unittest.TestCase):
    def run_cli(self, *args):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = D.main(list(args))
        return code, buf.getvalue()

    def test_cli_json_is_deterministic_and_omits_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "private-name-should-not-leak.glb"
            path.write_bytes(S.planted_turn(90, 1.6))
            c1, out1 = self.run_cli(str(path), "--json", "--expect-angle", "90")
            c2, out2 = self.run_cli(str(path), "--json", "--expect-angle", "90")
        self.assertEqual((c1, c2), (0, 0))
        self.assertEqual(out1, out2)
        self.assertNotIn("private-name-should-not-leak", out1)
        self.assertNotIn(tmp, out1)
        json.loads(out1)

    def test_cli_exit_code_fails_on_skate(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "m.glb"
            path.write_bytes(S.skating_turn(90, 1.6))
            code, out = self.run_cli(str(path))
        self.assertEqual(code, 1)
        self.assertIn("TURN_WITH_FOOT_SLIDE", out)

    def test_fixture_bytes_are_reproducible(self):
        self.assertEqual(S.planted_turn(90, 1.6), S.planted_turn(90, 1.6))

    def test_glb_header_is_valid(self):
        glb = S.planted_turn(90, 1.6)
        magic, version, total = struct.unpack_from("<III", glb, 0)
        self.assertEqual((magic, version, total), (0x46546C67, 2, len(glb)))


if __name__ == "__main__":
    unittest.main()
