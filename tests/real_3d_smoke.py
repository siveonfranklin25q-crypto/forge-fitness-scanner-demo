"""FORGE genuine 3D renderer integration smoke test (no personal model).
Loads a generated test triangle GLB through the real, pinned model-viewer library.
This proves browser WebGL and loading, not the owner's private model accuracy.
"""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
import os
import struct

from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*_args):
        pass


@contextmanager
def serve():
    server=ThreadingHTTPServer(("127.0.0.1",0),partial(Quiet,directory=str(ROOT)))
    worker=Thread(target=server.serve_forever,daemon=True)
    worker.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/index.html"
    finally:
        server.shutdown();server.server_close();worker.join(timeout=5)


def make_triangle_glb():
    vertices=struct.pack("<9f",-0.5,0,0,0.5,0,0,0,1,0)
    indices=struct.pack("<3H",0,1,2)
    binary=vertices+indices+b"\x00\x00"
    model={
        "asset":{"version":"2.0"},
        "scene":0,"scenes":[{"nodes":[0]}],
        "nodes":[{"mesh":0}],
        "meshes":[{"primitives":[{"attributes":{"POSITION":0},"indices":1,"material":0}]}],
        "materials":[{"pbrMetallicRoughness":{"baseColorFactor":[0.94,0.58,0.26,1],"metallicFactor":0,"roughnessFactor":0.8},"doubleSided":True}],
        "buffers":[{"byteLength":len(binary)}],
        "bufferViews":[{"buffer":0,"byteOffset":0,"byteLength":36,"target":34962},{"buffer":0,"byteOffset":36,"byteLength":6,"target":34963}],
        "accessors":[
            {"bufferView":0,"componentType":5126,"count":3,"type":"VEC3","min":[-0.5,0,0],"max":[0.5,1,0]},
            {"bufferView":1,"componentType":5123,"count":3,"type":"SCALAR","min":[0],"max":[2]},
        ],
    }
    text=json.dumps(model,separators=(",",":")).encode()
    text+=b" " * ((-len(text))%4)
    total=12+8+len(text)+8+len(binary)
    return (struct.pack("<III",0x46546c67,2,total)+
            struct.pack("<II",len(text),0x4e4f534a)+text+
            struct.pack("<II",len(binary),0x004e4942)+binary)


with serve() as url,sync_playwright() as p:
    args={"headless":True,"args":["--no-sandbox","--disable-dev-shm-usage","--enable-webgl","--use-gl=angle","--use-angle=swiftshader"]}
    if os.path.exists("/usr/bin/chromium"):
        args["executable_path"]="/usr/bin/chromium"
    browser=p.chromium.launch(**args)
    page=browser.new_page(viewport={"width":390,"height":844})
    errors=[]
    page.on("pageerror",lambda error:errors.append(str(error)))
    # Barcode decoder is unrelated; don't require that external provider.
    page.route("https://cdn.jsdelivr.net/**",lambda route:route.abort())
    page.goto(url,wait_until="domcontentloaded")
    page.locator("#forge-avatar-file").set_input_files({
        "name":"synthetic-test-triangle.glb",
        "mimeType":"model/gltf-binary",
        "buffer":make_triangle_glb(),
    })
    try:
        page.locator(".forge-avatar-panel.is-loaded").wait_for(timeout=45000)
    except Exception as e:
        message=page.locator("#forge-avatar-status").inner_text()
        raise AssertionError(f"Real model-viewer did not load a valid synthetic GLB: {message}; page errors={errors}") from e
    assert page.locator("#forge-avatar-viewer").evaluate("(el)=>el.loaded===true")
    assert page.locator("#forge-avatar-empty").is_hidden()
    assert not errors,errors
    out=ROOT/"ui-review-screenshots"
    out.mkdir(exist_ok=True)
    page.screenshot(path=str(out/"forge-real-webgl-390.png"),animations="disabled")
    browser.close()
print("PASS: real model-viewer WebGL renders synthetic embedded test GLB without uploading personal assets")
