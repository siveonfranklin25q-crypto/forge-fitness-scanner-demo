"""Synthetic-browser check for serving-scale accuracy and no stale overrides.

No real products, private uploads, personal data, or external web requests.
"""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

@contextmanager
def site():
    server=ThreadingHTTPServer(("127.0.0.1",0),partial(Quiet,directory=str(ROOT)))
    t=Thread(target=server.serve_forever,daemon=True)
    t.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/index.html"
    finally:
        server.shutdown()
        server.server_close()
        t.join(timeout=5)

def product(code, serving):
    return {"status":1,"product":{
        "code":code,"product_name":"Synthetic nutrition QA item","brands":"Test brand",
        "quantity":"300 g","serving_size":serving,
        "nutriments":{"energy-kcal_100g":200,"proteins_100g":10,
            "carbohydrates_100g":20,"fat_100g":8,"sodium_100g":0.12}
    }}

with site() as url,sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
    for barcode,serving,wanted in [
        ("1234567890123","30 g",30),
        ("1234567890124","2 crackers (56 g)",56),
        ("1234567890125","2 crackers",None),
        ("1234567890126","250 mL",None),
        ("1234567890127","30 g + 56 g",None),
        ("4099100310030","112 g",112),
    ]:
        page=browser.new_page(viewport={"width":390,"height":844},reduced_motion="reduce")
        page.route("**/*",lambda r:(
            r.fulfill(status=200,content_type="application/json",body=json.dumps(product(barcode,serving)))
            if r.request.url.startswith("https://world.openfoodfacts.org/api/v2/product/")
            else r.continue_() if r.request.url.startswith("http://127.0.0.1:")
            else r.abort()
        ))
        errors=[]
        page.on("pageerror",lambda error:errors.append(str(error)))
        page.goto(url,wait_until="domcontentloaded")
        page.locator('[data-tab="nutrition"]').first.evaluate("(el)=>el.click()")
        page.locator("#lookup-mode").select_option("barcode")
        page.locator("#live-query").fill(barcode)
        page.locator("#live-search").click()
        page.locator("#live-product-meta strong").first.wait_for(timeout=10000)
        val=page.locator("#live-quantity").input_value()
        if wanted is None:
            assert val=="", (barcode,serving,val)
            assert page.locator("#log-live").is_disabled()
            assert "No unambiguous gram serving" in page.locator("#live-serving-warning").inner_text()
            page.locator("#live-quantity").fill("25")
            page.locator("#live-quantity").dispatch_event("input")
            assert page.locator("#log-live").is_enabled()
        else:
            assert float(val)==wanted, (barcode,serving,val)
            assert page.locator("#log-live").is_enabled()
            text=page.locator("#live-breakdown").inner_text()
            kcal=round(200*wanted/100,1)
            assert f"{kcal:g} kcal" in text, (barcode,text)
            assert "Community" in text or "community" in text
        # The old demo barcode is no longer silently overridden by a stale photo.
        if barcode=="4099100310030":
            assert "Community data provided" in page.locator("#live-product-meta").inner_text()
            assert float(page.locator("#live-quantity").input_value())==112
            assert "224 kcal" in page.locator("#live-breakdown").inner_text()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors,errors
        page.close()
    browser.close()
print("FORGE synthetic serving audit PASS: actual gram serving, ambiguous units, no stale override")
