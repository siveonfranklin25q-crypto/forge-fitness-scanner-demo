"""Real-browser smoke: FORGE Meal Prep Command.
Runs local HTML/CSS/JS; synthetic food data only, no personal macros or assets.
"""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import os
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass

@contextmanager
def site():
    server=ThreadingHTTPServer(("127.0.0.1",0),partial(QuietHandler,directory=str(ROOT)))
    worker=Thread(target=server.serve_forever,daemon=True)
    worker.start()
    try:yield f"http://127.0.0.1:{server.server_port}/index.html"
    finally:
        server.shutdown();server.server_close();worker.join(timeout=5)

with site() as url,sync_playwright() as p:
    opts={"headless":True,"args":["--no-sandbox","--disable-dev-shm-usage"]}
    if os.path.exists("/usr/bin/chromium"):opts["executable_path"]="/usr/bin/chromium"
    browser=p.chromium.launch(**opts)
    for width in (320,390,768,1280):
        page=browser.new_page(viewport={"width":width,"height":844})
        page.emulate_media(reduced_motion="reduce")
        page.route("https://cdn.jsdelivr.net/**",lambda route:route.abort())
        errors=[]
        page.on("pageerror",lambda e:errors.append(str(e)))
        page.goto(url,wait_until="domcontentloaded")
        page.locator('[data-tab="nutrition"]').first.evaluate("(el)=>el.click()")
        assert page.locator("#nutrition").is_visible()
        assert page.locator("#forge-pack").is_visible()

        data={
            "forge-pack-batch":"2000","forge-pack-kcal":"3000",
            "forge-pack-protein":"200","forge-pack-carbs":"200","forge-pack-fat":"180",
            "forge-pack-rice-kcal":"130","forge-pack-rice-protein":"3",
            "forge-pack-rice-carbs":"28","forge-pack-rice-fat":"0.3",
            "forge-pack-count":"2","forge-pack-mix-serving":"250",
            "forge-pack-rice-serving":"400"
        }
        for id,value in data.items():page.locator("#"+id).fill(value)
        page.locator('#forge-pack-form button[type="submit"]').click()
        assert page.locator("#forge-pack-result").get_attribute("data-state")=="ready"
        assert "895" in page.locator("#forge-pack-result").inner_text()
        assert "37 g protein" in page.locator("#forge-pack-result").inner_text()
        assert "1790 kcal" in page.locator("#forge-pack-result").inner_text()
        assert "1500 g" in page.locator("#forge-pack-result").inner_text()
        assert page.evaluate("document.documentElement.scrollWidth<=innerWidth"),width

        page.locator("#forge-pack-save").click()
        assert page.evaluate("localStorage.getItem('forge-pack-v1')") is not None
        page.reload(wait_until="domcontentloaded")
        assert page.locator("#forge-pack-mix-serving").input_value()=="250"
        assert page.locator("#forge-pack-result").get_attribute("data-state")=="ready"

        # Invalid portion totals must fail, not silently suggest more than cooked.
        page.locator("#forge-pack-count").fill("12")
        page.locator('#forge-pack-form button[type="submit"]').click()
        assert page.locator("#forge-pack-result").get_attribute("data-state")=="error"
        assert "Not enough cooked mixture" in page.locator("#forge-pack-result").inner_text()

        page.locator("#forge-pack-clear").click()
        assert page.locator("#forge-pack-batch").input_value()==""
        assert page.evaluate("localStorage.getItem('forge-pack-v1')") is None
        assert not errors,{"width":width,"errors":errors}
        if width==390:
            # Capture empty state for design review; no personal data ever used.
            page.screenshot(path=str(ROOT/"ui-review-screenshots"/"forge-pack-390.png"),animations="disabled",full_page=True)
        page.close()
    browser.close()
print("PASS: gram-based packed-meal calculation, insufficient food warning, explicit local save and clearing at 4 screen widths")
