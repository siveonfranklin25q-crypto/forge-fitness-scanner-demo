"""FORGE UI + private likeness pipeline smoke test.
Tests a mocked 3D element, not the GPU renderer itself.
Runs the existing app over local HTTP; no personal assets or outbound uploads.
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


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*_args):
        pass


@contextmanager
def local_site():
    server=ThreadingHTTPServer(("127.0.0.1",0),partial(QuietHandler,directory=str(ROOT)))
    worker=Thread(target=server.serve_forever,daemon=True)
    worker.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/index.html"
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)


def sample_glb():
    """Tiny *test-only* glTF header with a mesh and named animation."""
    spec={
        "asset":{"version":"2.0"},
        "meshes":[{"primitives":[{"attributes":{"POSITION":0}}]}],
        "animations":[{"name":"Idle"}],
    }
    payload=json.dumps(spec,separators=(",",":")).encode("utf8")
    payload+=b" "*((-len(payload))%4)
    total=12+8+len(payload)
    return struct.pack("<III",0x46546c67,2,total)+struct.pack("<II",len(payload),0x4e4f534a)+payload


MOCK_VIEWER=r"""
class MockModelViewer extends HTMLElement {
  constructor(){ super(); this._url=""; this._paused=true; }
  get availableAnimations(){return ["Idle","Walk","TurnInPlace","Turn90Left_PrivateV1","Turn90Right_PrivateV1","Turn180Left_PrivateV1","Turn180Right_PrivateV1"];}
  get src(){return this._url;}
  set src(url){
    this._url=url;
    if(url) queueMicrotask(()=>this.dispatchEvent(new Event("load")));
  }
  play(options){this._paused=false;this.lastPlayOptions=options||null;}
  pause(){this._paused=true;}
  get paused(){return this._paused;}
}
customElements.define("model-viewer", MockModelViewer);
"""


with local_site() as url,sync_playwright() as playwright:
    options={"headless":True,"args":["--no-sandbox","--disable-dev-shm-usage"]}
    if os.path.exists("/usr/bin/chromium"):
        options["executable_path"]="/usr/bin/chromium"
    browser=playwright.chromium.launch(**options)
    shots=ROOT/"ui-review-screenshots"
    shots.mkdir(exist_ok=True)

    for width in (320,390,768,1280):
        page=browser.new_page(viewport={"width":width,"height":844})
        page.emulate_media(reduced_motion="reduce")
        page.add_init_script(MOCK_VIEWER)
        page.route("https://cdn.jsdelivr.net/**",lambda route:route.abort())
        errors=[]
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.goto(url,wait_until="domcontentloaded")

        assert page.locator(".forge-avatar-panel").is_visible()
        if width<781:
            assert page.locator(".forge-avatar-panel").bounding_box()["y"] < page.locator(".forge-story").bounding_box()["y"], "Mobile must open on the character, not a generic text hero."
        assert page.locator("#forge-avatar-empty").is_visible()
        # Decorative animation must have finite duration/iteration count:
        # 3D stages should stop drawing once the opening flourish has ended.
        assert page.evaluate("""() => document.getAnimations({subtree:true})
            .every(a => Number.isFinite(a.effect.getTiming().iterations))"""), "A never-ending decorative CSS animation would waste idle power."
        deck_before=page.locator(".forge-avatar-deck").evaluate("(el)=>el.getBoundingClientRect().height") if width<=660 else None
        assert page.locator(".forge-atlas-body").count()==0, "The generic mannequin must be gone."
        assert page.locator("#forge-avatar-viewer").count()==1
        assert page.locator(".forge-mission-tile").count()==4
        assert page.locator(".forge-momentum-day").count()==7
        assert page.locator("#forge-momentum-title").evaluate("(el) => el.tagName")=="H2", "Avoid skipping heading level after H1"
        assert page.locator("#forge-momentum-percent").inner_text()=="—"
        assert page.locator(".summary-card").count()==4
        assert page.locator(".tabs [data-tab]").count()==8
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),width
        assert page.locator("#forge-motion-toggle").get_attribute("aria-pressed")=="false"
        page.locator("#forge-motion-toggle").click()
        assert page.locator("#forge-motion-toggle").get_attribute("aria-pressed")=="true"
        page.locator("#forge-motion-toggle").click()
        assert page.locator("#forge-motion-toggle").get_attribute("aria-pressed")=="false"

        if width in (390,1280):
            page.screenshot(path=str(shots/f"forge-dashboard-{width}.png"),animations="disabled")
        if width<781:
            assert page.locator("#forge-mobile-dock").is_visible()
            assert not page.locator("#forge-sidebar").is_visible()
            page.locator("#forge-dock-more").click()
            assert page.locator("#forge-sidebar").is_visible()
            page.locator('#forge-sidebar [data-tab="movement-lab"]').click()
            assert page.locator("#movement-lab").is_visible()
            assert not page.locator("#forge-sidebar").is_visible()
            page.locator('#forge-mobile-dock [data-forge-go="profile"]').click()
        else:
            assert page.locator("#forge-sidebar").is_visible()
            assert not page.locator("#forge-mobile-dock").is_visible()
            assert page.locator("#forge-sidebar").evaluate(
                "(el)=>getComputedStyle(el).position")=="sticky"

        # Test a local GLB import. The mock viewer models load callbacks;
        # no real user likeness is loaded, generated, or sent anywhere.
        page.locator("#forge-avatar-remember").check()
        page.locator("#forge-avatar-file").set_input_files({
            "name":"smoke-test.glb",
            "mimeType":"model/gltf-binary",
            "buffer":sample_glb(),
        })
        page.locator(".forge-avatar-panel.is-loaded").wait_for()
        if deck_before is not None:
            deck_after=page.locator(".forge-avatar-deck").evaluate("(el)=>el.getBoundingClientRect().height")
            assert deck_after<=deck_before+1, f"Avatar controls pushed mobile content by {deck_after-deck_before:.1f}px at {width}px"
        assert page.locator("#forge-avatar-empty").is_hidden()
        assert page.locator("#forge-avatar-animation").input_value()=="Idle"
        assert page.locator("#forge-avatar-turn-wrap").is_hidden()
        page.locator("#forge-avatar-animation").select_option("TurnInPlace")
        assert page.locator("#forge-avatar-turn-wrap").is_visible()
        assert page.locator("#forge-avatar-turn-output").inner_text()=="85°/s"
        assert page.locator("#forge-avatar-viewer").get_attribute("rotation-per-second")=="85deg"
        assert page.evaluate("document.getElementById('forge-avatar-viewer').timeScale")==1
        assert "Turntable speed" in page.locator("#forge-avatar-turn-wrap").inner_text()
        assert "not a planted-foot turn" in page.locator("#forge-avatar-status").inner_text()
        page.locator("#forge-avatar-turn-speed").evaluate(
            "(el)=>{el.value='115';el.dispatchEvent(new Event('input',{bubbles:true}));}"
        )
        assert page.locator("#forge-avatar-viewer").get_attribute("rotation-per-second")=="115deg"
        page.locator("#forge-avatar-animation").select_option("Walk")
        assert page.locator("#forge-avatar-turn-wrap").is_hidden()
        assert page.locator("#forge-avatar-viewer").get_attribute("rotation-per-second")=="22deg"
        page.locator("#forge-avatar-animation").select_option("Idle")

        # New private skeletal turns must NOT use a turntable and must play only
        # once; old TurnInPlace remains an honestly labeled rigid display spin.
        page.emulate_media(reduced_motion="no-preference")
        if page.locator("#forge-hero").evaluate("(el)=>el.classList.contains('forge-still')"):
            page.locator("#forge-motion-toggle").click()
        page.locator("#forge-avatar-animation").select_option("Turn90Left_PrivateV1")
        assert page.locator("#forge-avatar-turn-wrap").is_hidden()
        assert page.locator("#forge-avatar-viewer").get_attribute("auto-rotate") is None
        assert page.locator("#forge-avatar-viewer").get_attribute("animation-name")=="Turn90Left_PrivateV1"
        assert page.evaluate("document.getElementById('forge-avatar-viewer').lastPlayOptions.repetitions")==1
        page.locator("#forge-avatar-viewer").evaluate("(el)=>{el.currentTime=1.70;el.dispatchEvent(new Event('finished'))}")
        # Mock the real engine's clamped final frame; the UI must NOT set currentTime.
        assert abs(page.evaluate("document.getElementById('forge-avatar-viewer').currentTime")-1.70)<0.001
        assert "complete" in page.locator("#forge-avatar-status").inner_text().lower()
        page.locator("#forge-avatar-animation").select_option("Turn180Right_PrivateV1")
        assert page.locator("#forge-avatar-viewer").get_attribute("auto-rotate") is None
        assert page.evaluate("document.getElementById('forge-avatar-viewer').lastPlayOptions.repetitions")==1
        page.locator("#forge-avatar-viewer").evaluate("(el)=>{el.currentTime=2.58;el.dispatchEvent(new Event('finished'))}")
        assert abs(page.evaluate("document.getElementById('forge-avatar-viewer').currentTime")-2.58)<0.001
        page.locator("#forge-avatar-animation").select_option("Idle")

        # Accepted private turn clips get instant buttons; no buttons are
        # available for the public synthetic test GLB unless it includes them.
        assert page.locator("#forge-avatar-turn-pad").is_visible()
        assert page.locator("[data-forge-private-turn]:visible").count()==4
        page.locator('[data-forge-private-turn="Turn90Left_PrivateV1"]').click()
        assert page.locator("#forge-avatar-animation").input_value()=="Turn90Left_PrivateV1"
        assert page.locator('[data-forge-private-turn="Turn90Left_PrivateV1"]').get_attribute("aria-pressed")=="true"
        assert page.locator("#forge-avatar-viewer").get_attribute("auto-rotate") is None
        assert page.evaluate("document.getElementById('forge-avatar-viewer').lastPlayOptions.repetitions")==1
        page.locator("#forge-avatar-viewer").evaluate("(el)=>{el.currentTime=0.93}")
        page.locator("#forge-avatar-replay").click()
        assert page.evaluate("document.getElementById('forge-avatar-viewer').currentTime")==0
        assert page.evaluate("document.getElementById('forge-avatar-viewer').lastPlayOptions.repetitions")==1
        page.locator('[data-forge-private-turn="Turn180Right_PrivateV1"]').click()
        assert page.locator("#forge-avatar-animation").input_value()=="Turn180Right_PrivateV1"
        assert page.locator('[data-forge-private-turn="Turn180Right_PrivateV1"]').get_attribute("aria-pressed")=="true"
        page.locator("#forge-avatar-idle").click()
        assert page.locator("#forge-avatar-animation").input_value()=="Idle"
        assert page.locator("#forge-avatar-replay").is_disabled()

        assert page.locator("#forge-avatar-status").is_visible()
        assert page.locator("#forge-avatar-forget").is_visible()

        if width==390:
            page.screenshot(path=str(shots/"forge-private-3d-loaded-390.png"),animations="disabled")

        # Local opt-in persistence survives refresh on this browser origin.
        page.reload(wait_until="domcontentloaded")
        page.locator(".forge-avatar-panel.is-loaded").wait_for()
        assert page.locator("#forge-avatar-remember").is_checked()

        if width==390:
            page.screenshot(path=str(shots/"forge-strength-390.png"),animations="disabled")

        # Genuine dated sessions drive the momentum ring; an untouched sample
        # profile never produces a pretend completion percentage.
        if width==390:
            page.evaluate("""() => {
              const state=JSON.parse(localStorage.getItem("forge-demo-v01")) || {profile:{age:35,weight:200,height:70,sex:"male",referenceWeight:190,activity:"sedentary",goal:"lose",days:3,equipment:"home"},check:{sleep:7.5,soreness:"low",pain:"none",injury:false,redFlag:false},foodLog:[],weighins:[],workoutsDone:0,recipeKind:"smart",recipeId:"nachos"};
              state.profile.weight=180;
              state.profile.referenceWeight=195;
              state.profile.goal="gain";
              state.profile.days=6;
              localStorage.setItem("forge-demo-v01", JSON.stringify(state));
              const d=new Date(),iso=[d.getFullYear(),
                String(d.getMonth()+1).padStart(2,"0"),
                String(d.getDate()).padStart(2,"0")].join("-");
              const session={id:"qa-1",date:iso,sets:[{exerciseId:0,reps:10,kg:25,rir:2,type:"working"}],symptoms:"none",counted:true};
              localStorage.setItem("forge-strength-v08-sessions",JSON.stringify([session]));
            }""")
            page.reload(wait_until="domcontentloaded")
            assert page.locator("#forge-momentum-count").inner_text()=="1 / 6"
            assert page.locator("#forge-momentum-percent").inner_text()=="17%"
            assert page.locator(".forge-momentum-day.logged").count()==1

        # Forget must clear the local DB without changing any source file.
        page.once("dialog",lambda dialog:dialog.accept())
        page.locator("#forge-avatar-forget").click()
        page.locator("#forge-avatar-empty").wait_for(state="visible",timeout=8000)
        assert page.locator("#forge-avatar-forget").is_hidden()
        page.locator("#forge-avatar-file").set_input_files({
            "name":"invalid.glb","mimeType":"model/gltf-binary","buffer":b"not-a-real-model"
        })
        assert "valid" in page.locator("#forge-avatar-status").inner_text().lower()

        page.locator('.forge-mission-tile[data-forge-go="strength-lab"]').click()
        assert page.locator("#strength-lab").is_visible()
        assert page.evaluate("location.hash")=="#strength-lab"
        assert "general exercise library" in page.locator("#strength-lab .notice").inner_text().lower()
        page.locator('#strength-lab [data-forge-go="training"]').click()
        assert page.locator("#training").is_visible()
        assert "1970s bodybuilding training plan" in page.locator("#training-title").inner_text().lower()
        assert "muscleandstrength.com/workouts/old-school-series-1970s-bodybuilding-routine" in page.locator('#training .notice a').get_attribute('href')
        if width<781:
            page.locator('#forge-mobile-dock [data-forge-go="nutrition"]').click()
        else:
            page.locator('#forge-sidebar [data-tab="nutrition"]').click()
        assert page.locator("#nutrition").is_visible()
        assert page.locator("#live-food-panel").count()==1
        page.goto(url+"#progress",wait_until="domcontentloaded")
        assert page.locator("#progress").is_visible()
        assert page.locator('[data-tab="progress"]').get_attribute("aria-current")=="page"
        assert not errors,{"viewport":width,"errors":errors}
        page.close()
    browser.close()
print("PASS: private 3D likeness import, local persistence, safe removal, responsive navigation and v0.8 content")
