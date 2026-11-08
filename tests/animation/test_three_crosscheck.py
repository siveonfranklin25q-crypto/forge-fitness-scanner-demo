"""Cross-check the Python FK/sampler against three.js AnimationMixer.

Skipped unless three.js is installed next to the tool:
  npm install --no-save --prefix tools/animation three@0.172.0
Set FORGE_REQUIRE_THREE=1 (CI) to fail instead of skip.
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
import synthetic_rigs as S  # noqa: E402

HAVE_THREE = (TOOLS / "node_modules" / "three").is_dir() and shutil.which("node")
REQUIRE = os.environ.get("FORGE_REQUIRE_THREE") == "1"
JOINTS = ["LeftUpLeg", "RightUpLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]


class ThreeCrossCheck(unittest.TestCase):
    def setUp(self):
        if not HAVE_THREE:
            if REQUIRE:
                self.fail("three.js not installed but FORGE_REQUIRE_THREE=1")
            self.skipTest("three.js not installed")

    def test_positions_and_heading_match_three(self):
        worst_mm = worst_deg = 0.0
        with tempfile.TemporaryDirectory() as tmp:
            for name, (build, _) in sorted(S.FIXTURES.items()):
                path = Path(tmp) / (name + ".glb")
                path.write_bytes(build())
                rig = D.load(str(path))
                ch = rig.channels(0)
                dur = max(c.times[-1] for cs in ch.values() for c in cs.values())
                ts = [round(dur * k / 40, 6) for k in range(41)]
                out = json.loads(subprocess.check_output(
                    ["node", str(TOOLS / "three_sample.mjs"), str(path)] + [str(t) for t in ts]))
                self.assertAlmostEqual(out["duration"], dur, places=5)
                idx = {n: rig.names.index(n) for n in JOINTS}
                for f in out["frames"]:
                    w = rig.world(ch, f["t"], list(idx.values()))
                    for n, i in idx.items():
                        worst_mm = max(worst_mm, 1000 * D.dist(D.pos(w[i]), f[n]))
                    a = D.heading_from(f["LeftUpLeg"], f["RightUpLeg"])
                    b = D.heading_from(D.pos(w[idx["LeftUpLeg"]]), D.pos(w[idx["RightUpLeg"]]))
                    worst_deg = max(worst_deg, abs(D.wrap180(a - b)))
        print("\nthree.js cross-check: max %.4f mm, %.4f deg" % (worst_mm, worst_deg))
        self.assertLess(worst_mm, 0.5)
        self.assertLess(worst_deg, 0.05)


if __name__ == "__main__":
    unittest.main()
