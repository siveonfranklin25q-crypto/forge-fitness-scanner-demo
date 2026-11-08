"""FORGE immersive interface browser smoke test.
Run: python tests/ui_refresh_smoke.py
Uses a local HTTP server to load the real HTML, CSS and JS. No external
barcode library or user data; Playwright uses an isolated browser context.
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
        page.route("https://cdn.jsdelivr.net/**", lambda route: route.abort())
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(url, wait_until="domcontentloaded")

        assert page.locator(".forge-hero").is_visible()
        assert page.locator(".forge-holo-panel").is_visible()
        assert page.locator(".forge-atlas-body").count() == 1
        assert page.locator(".forge-mission-tile").count() == 4
        assert page.locator(".summary-card").count() == 4
        assert page.locator(".tabs [data-tab]").count() == 8
        assert page.evaluate(
            "document.documentElement.scrollWidth <= window.innerWidth"
        ), f"Horizontal overflow at {width}px"
        assert "sample profile" in page.locator("#forge-mission-caption").inner_text().lower()

        # Motion is off for a user who requests reduced motion, but can be toggled.
        assert page.locator("#forge-motion-toggle").get_attribute("aria-pressed") == "false"
        page.locator("#forge-motion-toggle").click()
        assert page.locator("#forge-motion-toggle").get_attribute("aria-pressed") == "true"
        page.locator("#forge-motion-toggle").click()
        assert page.locator("#forge-motion-toggle").get_attribute("aria-pressed") == "false"

        if width in (390, 1280):
            page.screenshot(path=str(shots / f"forge-dashboard-{width}.png"), animations="disabled")
        if width < 781:
            assert page.locator("#forge-mobile-dock").is_visible()
            assert not page.locator("#forge-sidebar").is_visible()
            page.locator("#forge-dock-more").click()
            assert page.locator("#forge-sidebar").is_visible()
            assert page.locator("#forge-dock-more").get_attribute("aria-expanded") == "true"
            page.locator('#forge-sidebar [data-tab="movement-lab"]').click()
            assert page.locator("#movement-lab").is_visible()
            assert not page.locator("#forge-sidebar").is_visible()
            page.locator('#forge-mobile-dock [data-forge-go="profile"]').click()
            assert page.locator("#profile").is_visible()
        else:
            assert page.locator("#forge-sidebar").is_visible()
            assert not page.locator("#forge-mobile-dock").is_visible()
            assert page.locator("#forge-sidebar").evaluate(
                "(el) => getComputedStyle(el).position"
            ) == "sticky"

        # Use the same visible mission card that an actual user would tap.
        page.locator('.forge-mission-tile[data-forge-go="strength-lab"]').click()
        assert page.locator("#strength-lab").is_visible()
        assert page.locator(".forge-hero").evaluate(
            "(el) => el.classList.contains('is-secondary')"
        )
        assert page.evaluate("location.hash") == "#strength-lab"
        assert page.locator('[data-tab="strength-lab"]').get_attribute(
            "aria-current"
        ) == "page"
        if width == 390:
            page.screenshot(path=str(shots / "forge-strength-390.png"), animations="disabled")
            page.locator('#forge-mobile-dock [data-forge-go="nutrition"]').click()
        elif width < 781:
            page.locator('#forge-mobile-dock [data-forge-go="nutrition"]').click()
        else:
            page.locator('#forge-sidebar [data-tab="nutrition"]').click()
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
print("PASS: FORGE immersive UI, reduced-motion, navigation, mobile menu, deep links and legacy content")
