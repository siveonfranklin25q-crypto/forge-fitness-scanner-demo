"""Synthetic character generator: valid, deterministic, and sized as advertised.

Run: python3 -m unittest discover -s tests/performance -v
"""
import json
import struct
import sys
import unittest
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "performance"))

import synthetic_character as C  # noqa: E402


def parse(glb):
    magic, version, total = struct.unpack_from("<III", glb, 0)
    jlen, jtype = struct.unpack_from("<II", glb, 12)
    doc = json.loads(glb[20:20 + jlen])
    blen, btype = struct.unpack_from("<II", glb, 20 + jlen)
    binary = glb[28 + jlen:28 + jlen + blen]
    return (magic, version, total, jtype, btype), doc, binary


class Generator(unittest.TestCase):
    def test_light_preset_structure(self):
        glb, info = C.build(*C.PRESETS["light"])
        head, doc, binary = parse(glb)
        self.assertEqual(head, (0x46546C67, 2, len(glb), 0x4E4F534A, 0x004E4942))
        self.assertEqual(doc["buffers"][0]["byteLength"], len(binary))
        for v in doc["bufferViews"]:
            self.assertLessEqual(v["byteOffset"] + v["byteLength"], len(binary))
            self.assertEqual(v["byteOffset"] % 4, 0)
        prim = doc["meshes"][0]["primitives"][0]
        self.assertEqual(set(prim["attributes"]), {"POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"})
        self.assertEqual(doc["accessors"][prim["indices"]]["count"] // 3, info["triangles"])
        self.assertEqual(len(doc["skins"][0]["joints"]), 16)
        self.assertEqual([a["name"] for a in doc["animations"]],
                         ["Idle", "Walk"] + [n for n, _, _ in C.TURN_CLIPS])
        self.assertEqual([a["name"] for a in parse(C.build(2000, 32, 4, turns=False)[0])[1]["animations"]], ["Idle", "Walk"])
        # glTF requires POSITION min/max.
        pos = doc["accessors"][prim["attributes"]["POSITION"]]
        self.assertIn("min", pos)
        self.assertIn("max", pos)

    def test_embedded_png_is_valid_and_sized(self):
        glb, info = C.build(2000, 64, 4)
        _, doc, binary = parse(glb)
        view = doc["bufferViews"][doc["images"][0]["bufferView"]]
        png = binary[view["byteOffset"]:view["byteOffset"] + view["byteLength"]]
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
        w, h = struct.unpack(">II", png[16:24])
        self.assertEqual((w, h), (64, 64))
        idat_len = struct.unpack(">I", png[33:37])[0]
        raw = zlib.decompress(png[41:41 + idat_len])
        self.assertEqual(len(raw), 64 * (1 + 64 * 3))

    def test_weights_sum_to_one(self):
        glb, info = C.build(2000, 32, 8)
        _, doc, binary = parse(glb)
        acc = doc["accessors"][doc["meshes"][0]["primitives"][0]["attributes"]["WEIGHTS_0"]]
        view = doc["bufferViews"][acc["bufferView"]]
        vals = struct.unpack_from("<%df" % (acc["count"] * 4), binary, view["byteOffset"])
        for i in range(0, len(vals), 4):
            self.assertAlmostEqual(sum(vals[i:i + 4]), 1.0, places=5)

    def test_triangle_targets_and_index_width(self):
        for name, (tris, tex, bones) in C.PRESETS.items():
            if name == "heavy":
                tex = 64  # keep the test fast; geometry is what matters here
            with self.subTest(preset=name):
                _, info = C.build(tris, tex, bones)
                self.assertLess(abs(info["triangles"] - tris) / tris, 0.02)
                self.assertEqual(info["index_type"], "uint32" if info["vertices"] > 65535 else "uint16")

    def test_deterministic(self):
        self.assertEqual(C.build(3000, 64, 8)[0], C.build(3000, 64, 8)[0])


if __name__ == "__main__":
    unittest.main()
