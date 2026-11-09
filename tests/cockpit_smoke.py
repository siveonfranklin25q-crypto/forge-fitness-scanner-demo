"""Real-browser FORGE cockpit contract test. Synthetic data only, local HTTP and blocked external requests."""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

@contextmanager
def server():
    host = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    t = Thread(target=host.serve_forever, daemon=True)
    t.start()
    try:
        yield f"http://127.0.0.1:{host.server_port}/index.html"
    finally:
        host.shutdown()
        host.server_close()
        t.join(timeout=5)

FIXED_CLOCK = """
(() => {
 const RealDate = Date;
 const fixed = '2026-11-09T17:00:00Z';
 class FakeDate extends RealDate {
   constructor(...args) { super(...(args.length ? args : [fixed])); }
   static now() { return RealDate.parse(fixed); }
 }
 window.Date = FakeDate;
})();
"""

with server() as url, sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
    for width in (390, 1280):
        context = browser.new_context(viewport={"width": width, "height": 850}, reduced_motion="reduce")
        page = context.new_page()
        page.add_init_script(FIXED_CLOCK)
        page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:") else route.abort())
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(url, wait_until="domcontentloaded")
        page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
        assert page.locator("#training").is_visible()
        page.locator("#fc-start-date").fill("2026-11-09")
        assert not page.locator("#fc-optional").is_checked()
        page.locator('[data-fc-action="configure"]').click()
        assert "Chest & back" in page.locator("#fc-mission-title").inner_text()
        assert "0 working sets" in page.locator("#fc-progress-count").inner_text()
        page.evaluate("localStorage.setItem('forge-strength-v08-sessions', '[]')")
        page.locator('[data-fc-action="start"]').click()
        assert page.locator("#fc-safety").is_visible()
        page.locator("#fc-sleep").fill("8")
        page.locator('[data-fc-action="safety"]').click()
        assert page.locator("#fc-warmup").is_visible()
        page.locator('[data-fc-action="warmup-skip"]').click()
        assert page.locator("#fc-exercise").is_visible()
        assert "Bench press" in page.locator("#fc-exercise-name").inner_text()
        page.locator("#fc-reps").fill("10")
        page.locator("#fc-load").fill("40")
        page.locator('[data-fc-action="log"]').click()
        assert page.locator("#fc-rest").is_visible()
        saved = page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1'))")
        assert saved["active"]["sets"][0]["reps"] == 10
        assert saved["records"] == []
        page.reload(wait_until="domcontentloaded")
        page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
        assert page.locator("#fc-rest").is_visible(), "Session should restore without inventing completion"
        page.locator('[data-fc-action="rest-done"]').click()
        assert page.locator("#fc-exercise").is_visible()
        page.locator('[data-fc-action="abort"]').click()
        result = page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1'))")
        assert result["active"] is None
        assert len(result["records"]) == 1
        assert result["records"][0]["status"] == "partial"
        assert result["records"][0]["loggedSets"] == 1
        assert page.evaluate("localStorage.getItem('forge-strength-v08-sessions')") == "[]"
        assert page.locator('[data-fc-action="start"]').is_hidden()
        assert "partial" in page.locator("#fc-latest").inner_text()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Overflow at {width}px"
        assert not errors, errors
        context.close()

    # Safety stop produces its own status without attributing sets or rewards.
    context = browser.new_context(viewport={"width": 390, "height": 850})
    page = context.new_page()
    page.add_init_script(FIXED_CLOCK)
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:") else route.abort())
    page.goto(url, wait_until="domcontentloaded")
    page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
    page.locator("#fc-start-date").fill("2026-11-09")
    page.locator('[data-fc-action="configure"]').click()
    page.locator('[data-fc-action="start"]').click()
    page.locator("#fc-warning").check()
    page.locator('[data-fc-action="safety"]').click()
    result = page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1'))")
    assert result["records"][0]["status"] == "stopped_safety"
    assert result["records"][0]["loggedSets"] == 0
    assert result["active"] is None
    assert "safety" in page.locator("#fc-latest").inner_text()
    context.close()
    browser.close()
print("FORGE cockpit: real-browser synthetic flow, persistence, safety and mobile layout PASS")
