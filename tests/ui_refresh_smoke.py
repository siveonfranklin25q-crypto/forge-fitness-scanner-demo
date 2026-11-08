"""FORGE UI refresh browser smoke test.
Run: python tests/ui_refresh_smoke.py
Requires Playwright, Chromium. Serves the actual HTML, CSS, and JS over localhost.
No personal profile is uploaded; external barcode library is disabled in the test.
"""
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import os

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


@contextmanager
def local_site():
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT))
    )
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/index.html"
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)


with local_site() as url, sync_playwright() as playwright:
    options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
    if os.path.exists("/usr/bin/chromium"):
        options["executable_path"] = "/usr/bin/chromium"
    browser = playwright.chromium.launch(**options)

    shots = ROOT / "ui-review-screenshots"
    shots.mkdir(exist_ok=True)
    for width in (320, 390, 768, 1280):
        page = browser.new_page(viewport={"width": width, "height": 844})
        page.emulate_media(reduced_motion="reduce")
        # The external library isn't needed to test local navigation and should
        # not make smoke tests dependent on third-party availability.
        page.route("https://cdn.jsdelivr.net/**", lambda route: route.abort())
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url, wait_until="domcontentloaded")
        assert page.locator(".forge-hero").is_visible()
        if width in (390, 1280):
            page.screenshot(path=str(shots / f"forge-dashboard-{width}.png"), animations="disabled")
        assert page.locator(".summary-card").count() == 4
        assert page.locator(".tabs [data-tab]").count() == 8
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), width
        assert page.locator("#forge-active-section").is_visible()
        if width == 1280:
            assert page.locator(".sidebar").evaluate(
                "(el) => getComputedStyle(el).position"
            ) == "sticky"

        page.locator('[data-forge-go="strength-lab"]').click()
        assert page.locator("#strength-lab").is_visible()
        assert page.locator(".forge-hero").evaluate("(el) => el.classList.contains('is-secondary')")
        if width == 390:
            page.screenshot(path=str(shots / "forge-strength-390.png"), animations="disabled")
        assert page.locator('[data-tab="strength-lab"]').get_attribute(
            "aria-current"
        ) == "page"
        assert page.evaluate("location.hash") == "#strength-lab"

        page.locator('[data-tab="nutrition"]').click()
        assert page.locator("#nutrition").is_visible()
        assert page.locator("#live-food-panel").count() == 1
        assert page.evaluate("location.hash") == "#nutrition"

        page.goto(url + "#progress", wait_until="domcontentloaded")
        assert page.locator("#progress").is_visible()
        assert page.locator('[data-tab="progress"]').get_attribute(
            "aria-current"
        ) == "page"
        assert not errors, {"viewport": width, "errors": errors}
        page.close()

    browser.close()
print("PASS: FORGE UI navigation, deep links, quick actions, mobile layout, and legacy content")
