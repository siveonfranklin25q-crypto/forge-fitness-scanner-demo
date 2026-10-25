"""FORGE v0.8 offline interaction smoke test.

Run from repository root: python tests/strength_tracker_smoke.py
Requires pip install playwright and a Chromium executable (or installed playwright chromium).
The test intentionally disables external barcode JS and uses mock localStorage.
It does NOT verify live scanning, product API responses, or medical safety.
"""
from pathlib import Path
from datetime import date, timedelta
import os
import re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "index.html").read_text(encoding="utf-8")
html = re.sub(r'<script defer src="https://cdn.jsdelivr.net[^>]+></script>', '', html)

with sync_playwright() as p:
    args = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
    if os.path.exists('/usr/bin/chromium'):
        args['executable_path'] = '/usr/bin/chromium'
    browser = p.chromium.launch(**args)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.evaluate('''() => {
      const local={};
      Object.defineProperty(window,'localStorage',{configurable:true,value:{
        getItem:k=>local[k]??null,
        setItem:(k,v)=>{local[k]=String(v)},
        removeItem:k=>{delete local[k]}
      }});
    }''')
    page.set_content(html, wait_until='commit')
    page.locator('[data-tab="strength-lab"]').click()
    assert page.locator('#strength-exercise option').count() >= 20
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    for day in [(date.today()-timedelta(days=3)).isoformat(),
                (date.today()-timedelta(days=1)).isoformat()]:
        page.locator('#strength-date').fill(day)
        page.locator('#strength-load').fill('40')
        page.locator('#strength-reps').fill('12')
        page.locator('#strength-rir').select_option('2')
        for _ in range(2):
            page.locator('#strength-add').click()
        page.locator('#strength-save').click()
        assert 'saved' in page.locator('#strength-message').inner_text().lower()
    assert 'Consider a small increase' in page.locator('#strength-progression').inner_text()
    assert '4 sets' in page.locator('#strength-weekly').inner_text()
    page.set_content(html, wait_until='commit')
    page.locator('[data-tab="strength-lab"]').click()
    assert page.locator('[data-strength-delete]').count() == 2
    page.once('dialog', lambda dialog: dialog.accept())
    page.locator('[data-strength-delete]').first.click()
    assert page.locator('[data-strength-delete]').count() == 1
    assert 'One workout logged' in page.locator('#strength-progression').inner_text()
    page.locator('[data-tab="recovery"]').click()
    page.locator('#redFlag').check()
    page.locator('#recovery-form button[type=submit]').click()
    page.locator('[data-tab="strength-lab"]').click()
    assert 'Pause training' in page.locator('#strength-progression').inner_text()
    page.locator('#strength-date').fill(date.today().isoformat())
    page.locator('#strength-add').click()
    page.locator('#strength-save').click()
    assert 'warning sign' in page.locator('#strength-message').inner_text().lower()
    page.locator('[data-tab="nutrition"]').click()
    assert page.locator('#scan-start').count() == 1
    assert page.locator('#week-planner').count() == 1
    assert not errors, errors
    browser.close()
print('PASS: v0.8 log, persistence, progression, deletion, warnings, mobile and legacy UI')