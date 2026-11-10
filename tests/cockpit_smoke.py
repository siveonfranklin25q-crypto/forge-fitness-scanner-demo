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
        assert page.locator("#fc-volume").input_value() == "reduced"
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
        assert page.locator("#fc-reps").input_value() == ""
        assert page.locator("#fc-load").input_value() == ""
        page.locator('[data-fc-action="log"]').click()
        assert "Enter actual completed reps" in page.locator("#fc-feedback").inner_text()
        assert len(page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1')).active.sets")) == 0
        page.locator("#fc-reps").fill("10")
        page.locator('[data-fc-action="log"]').click()
        assert len(page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1')).active.sets")) == 0
        page.locator("#fc-load").fill("40")
        page.locator('[data-fc-action="log"]').click()
        assert page.locator("#fc-rest").is_visible()
        assert page.locator("#fc-live-count").inner_text() == "1 actual set logged"
        saved = page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1'))")
        assert saved["active"]["sets"][0]["reps"] == 10
        assert saved["records"] == []
        page.reload(wait_until="domcontentloaded")
        page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
        assert page.locator("#fc-rest").is_visible(), "Session should restore without inventing completion"
        page.locator('[data-fc-action="rest-done"]').click()
        assert page.locator("#fc-exercise").is_visible()
        assert page.locator("#fc-reps").input_value() == "", "Reps must reset for every new set"
        assert page.locator("#fc-load").input_value() == "", "Load must reset for every new set"
        page.locator('[data-fc-action="log"]').click()
        assert "Enter actual completed reps" in page.locator("#fc-feedback").inner_text()
        assert len(page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1')).active.sets")) == 1
        page.locator('[data-fc-action="abort"]').click()
        result = page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1'))")
        assert result["active"] is None
        assert len(result["records"]) == 1
        assert result["records"][0]["status"] == "partial"
        assert result["records"][0]["loggedSets"] == 1
        assert page.evaluate("localStorage.getItem('forge-strength-v08-sessions')") == "[]"
        assert page.locator('[data-fc-action="start"]').is_hidden()
        assert "partial" in page.locator("#fc-latest").inner_text()
        assert "1 logged training session this week · 1 working set recorded." in page.locator("#fc-progress-count").inner_text()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Overflow at {width}px"
        assert not errors, errors
        context.close()

    # Chromium Thursday A2: 18 reduced-volume sets, including two 60-second-target planks.
    # Actual time is entered manually; the app must NEVER assume the target was achieved.
    context = browser.new_context(viewport={"width": 390, "height": 850}, reduced_motion="reduce")
    page = context.new_page()
    page.add_init_script(FIXED_CLOCK.replace("2026-11-09T17:00:00Z", "2026-11-12T17:00:00Z"))
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:") else route.abort())
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(url, wait_until="domcontentloaded")
    page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
    page.locator("#fc-start-date").fill("2026-11-09")
    page.locator("#fc-mode").select_option("fixed-week")
    page.locator('[data-fc-action="configure"]').click()
    page.locator('[data-fc-action="start"]').click()
    assert page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1')).active.dayKey") == "A2"
    page.locator('[data-fc-action="safety"]').click()
    page.locator('[data-fc-action="warmup-done"]').click()
    set_count = hold_count = 0
    for _ in range(50):
        if page.locator("#fc-review").is_visible():
            break
        if page.locator("#fc-rest").is_visible():
            page.locator('[data-fc-action="rest-done"]').click()
            continue
        assert page.locator("#fc-exercise").is_visible(), "Unexpected stage"
        if page.locator("#fc-exercise-name").inner_text() == "Plank":
            assert page.locator("#fc-hold-wrap").is_visible()
            assert not page.locator("#fc-reps-wrap").is_visible()
            assert "60 seconds" in page.locator("#fc-exercise-target").inner_text()
            if hold_count == 0:
                page.locator('[data-fc-action="log"]').click()
                assert "actual hold time" in page.locator("#fc-feedback").inner_text()
                assert len(page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1')).active.sets")) == set_count
            page.locator("#fc-seconds").fill("45")
            page.locator('[data-fc-action="log"]').click()
            hold_count += 1
        else:
            assert page.locator("#fc-reps-wrap").is_visible()
            assert not page.locator("#fc-hold-wrap").is_visible()
            page.locator("#fc-reps").fill("10")
            page.locator("#fc-load").fill("20")
            page.locator('[data-fc-action="log"]').click()
        set_count += 1
    assert page.locator("#fc-review").is_visible()
    assert (set_count, hold_count) == (18, 2), (set_count, hold_count)
    page.locator("#fc-symptoms").select_option("none")
    page.locator('[data-fc-action="finish"]').click()
    saved = page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1'))")
    assert saved["active"] is None and len(saved["records"]) == 1
    record = saved["records"][0]
    assert record["status"] == "completed" and record["dayKey"] == "A2"
    assert record["loggedSets"] == 18 and record["plannedSets"] == 18
    # Fixed-week: completing today's session must NOT expose a second start button.
    assert page.locator('[data-fc-action="start"]').is_hidden()
    assert "done today" in page.locator("#fc-mission-title").inner_text()
    timed = [x for x in record["sets"] if x["measure"] == "time"]
    assert len(timed) == 2
    assert all(x["reps"] is None and x["seconds"] == 45 and x["load"] == 0 for x in timed)
    page.reload(wait_until="domcontentloaded")
    page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
    assert "18 working sets" in page.locator("#fc-progress-count").inner_text()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert not errors, errors
    context.close()

    # A v1 saved A/B/C rotation must not erase history or leave the cockpit unusable.
    context = browser.new_context(viewport={"width": 390, "height": 850}, reduced_motion="reduce")
    page = context.new_page()
    page.add_init_script(FIXED_CLOCK)
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:") else route.abort())
    page.goto(url, wait_until="domcontentloaded")
    page.evaluate("""() => {
      localStorage.setItem('forge-training-v1', JSON.stringify({
        version:1, programId:'classic-six-day-v1',
        config:{startDate:'2026-11-09',mode:'rolling',restWeekdays:[0],rotation:['A','B','C'],
          restSec:null,includeOptional:true,setsChoice:'min'},
        active:null,records:[]
      }));
      localStorage.setItem('forge-strength-v08-sessions','[]');
    }""")
    page.reload(wait_until="domcontentloaded")
    page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
    assert page.locator('[data-fc-action="start"]').is_visible()
    assert "Chest & back" in page.locator("#fc-mission-title").inner_text()
    assert page.evaluate("localStorage.getItem('forge-strength-v08-sessions')") == "[]"
    context.close()

    # Storage quarantine: malformed legacy entries survive the cockpit's first save.
    context = browser.new_context(viewport={"width": 390, "height": 850})
    page = context.new_page()
    page.add_init_script(FIXED_CLOCK)
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:") else route.abort())
    page.goto(url, wait_until="domcontentloaded")
    page.evaluate("""() => {
      const baseline = { version: 1, programId: 'classic-six-day-v2', config: null,
        records: [
          { id: 'old1', date: '2026-11-07', status: 'partial', dayKey: 'A1',
            plannedSets: 2, loggedSets: 1, sets: [
              { exerciseId: 'bench-press', muscle: 'chest', measure: 'reps', reps: 8, load: 60, unit: 'lb' }] },
          { id: 'odd1', date: '2026-11-07', status: 'partial', dayKey: 'A1',
            plannedSets: 2, loggedSets: 1, sets: [
              { exerciseId: 'bench-press', muscle: 'chest', measure: 'reps', reps: 8, load: '60', unit: 'lb' }] }
        ], active: null };
      localStorage.setItem('forge-training-v1', JSON.stringify(baseline));
    }""")
    page.reload(wait_until="domcontentloaded")
    page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
    page.locator('[data-fc-action="configure"]').click()
    preserved = page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1'))")
    assert [r["id"] for r in preserved["records"]] == ["old1"]
    assert any(r.get("id") == "odd1" for r in preserved["quarantine"])
    context.close()

    # Old unverified *active* workout: never resume it; archive original, uncounted.
    context = browser.new_context(viewport={"width": 390, "height": 850})
    page = context.new_page()
    page.add_init_script(FIXED_CLOCK)
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:") else route.abort())
    page.goto(url, wait_until="domcontentloaded")
    page.evaluate("""() => {
      const legacy = { version: 1, id: 'legacy-active-01', programId: 'classic-six-day-v1',
        date: '2026-11-09', dayKey: 'A', title: 'Old chest/back', stage: 'exercise',
        status: 'in_progress', plan: { dayKey: 'A', title: 'Old chest/back', exercises: [
          { exerciseId: 'bench-press', name: 'Bench Press', targetReps: {min:10,max:15},
            verification:'pending-source', targetSets:3 }] },
        sets: [{ exerciseId: 'bench-press', reps: 10, load: 20, unit:'lb' }], skipped: [] };
      localStorage.setItem('forge-training-v1', JSON.stringify({
        version: 1, programId: 'classic-six-day-v1',
        config: { startDate:'2026-11-09', mode:'rolling', rotation:['A','B','C'], restWeekdays:[0], restSec:null },
        records: [], active: legacy
      }));
    }""")
    page.reload(wait_until="domcontentloaded")
    page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
    assert page.locator("#fc-legacy").is_visible()
    assert page.locator("#fc-session").is_hidden()
    assert page.locator('[data-fc-action="start"]').is_hidden()
    assert "1 recorded set" in page.locator("#fc-legacy-detail").inner_text()
    page.locator('[data-fc-action="archive-legacy"]').click()
    data = page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1'))")
    assert data["active"] is None and data["records"] == []
    assert data["quarantine"][-1]["originalSession"]["id"] == "legacy-active-01"
    assert page.locator("#fc-legacy").is_hidden()
    assert page.locator('[data-fc-action="start"]').is_visible()
    page.reload(wait_until="domcontentloaded")
    data = page.evaluate("JSON.parse(localStorage.getItem('forge-training-v1'))")
    assert data["quarantine"][-1]["originalSession"]["sets"][0]["reps"] == 10
    context.close()

    # Fail-closed 201-entry archive: refuse writes, explain exact cap, export untouched bytes.
    context = browser.new_context(viewport={"width": 390, "height": 850}, accept_downloads=True)
    page = context.new_page()
    page.add_init_script(FIXED_CLOCK)
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:") else route.abort())
    page.goto(url, wait_until="domcontentloaded")
    page.evaluate("""() => localStorage.setItem('forge-training-v1', JSON.stringify({
      version:1, programId:null, config:null, records:[], active:null,
      quarantine:Array.from({length:201},(_,i)=>({kind:'legacy',id:'q'+i,nested:{unknown:[i,null,'raw']}})),
      privateFutureField:{preserve:'unchanged'}
    }))""")
    original = page.evaluate("localStorage.getItem('forge-training-v1')")
    page.reload(wait_until="domcontentloaded")
    page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
    assert page.locator("#fc-storage").is_visible()
    assert "201 archived or unreadable entries" in page.locator("#fc-storage-message").inner_text()
    assert "200" in page.locator("#fc-storage-message").inner_text()
    assert page.locator('[data-fc-action="configure"]').is_disabled()
    with page.expect_download() as capture:
        page.locator('[data-fc-action="download-training"]').click()
    download = capture.value
    assert download.suggested_filename.endswith(".json")
    assert Path(download.path()).read_text(encoding="utf-8") == original
    assert page.evaluate("localStorage.getItem('forge-training-v1')") == original
    context.close()

    # Damaged or unfamiliar JSON also remains untouched and can be downloaded.
    for original in ("{not valid json", '{"version":999,"unknown":{"private":"keep me"}}'):
        context = browser.new_context(viewport={"width": 390, "height": 850}, accept_downloads=True)
        page = context.new_page()
        page.add_init_script(FIXED_CLOCK)
        page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:") else route.abort())
        page.goto(url, wait_until="domcontentloaded")
        page.evaluate("(raw) => localStorage.setItem('forge-training-v1', raw)", original)
        page.reload(wait_until="domcontentloaded")
        page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
        message = page.locator("#fc-storage-message").inner_text().lower()
        assert ("unreadable" in message) if original.startswith("{not") else ("unfamiliar" in message)
        assert page.locator('[data-fc-action="configure"]').is_disabled()
        with page.expect_download() as capture:
            page.locator('[data-fc-action="download-training"]').click()
        download = capture.value
        assert download.suggested_filename.endswith(".txt" if original.startswith("{not") else ".json")
        assert Path(download.path()).read_text(encoding="utf-8") == original
        assert page.evaluate("localStorage.getItem('forge-training-v1')") == original
        context.close()

    # At the 500-record limit, no new workout can start and raw backup is available.
    context = browser.new_context(viewport={"width": 390, "height": 850}, accept_downloads=True)
    page = context.new_page()
    page.add_init_script(FIXED_CLOCK)
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:") else route.abort())
    page.goto(url, wait_until="domcontentloaded")
    page.evaluate("""() => localStorage.setItem('forge-training-v1', JSON.stringify({
      version:1, programId:'classic-six-day-v2',
      config:{startDate:'2026-11-09',mode:'rolling',restWeekdays:[0],rotation:['A1','B1','C1','A2','B2','C2'],
        volume:'reduced',restSec:null,allowPendingSource:false},
      active:null, quarantine:[],
      records:Array.from({length:500},(_,i)=>({id:'s'+i, date:'2026-11-01', status:'skipped',
        sets:[],dayKey:'A1',plannedSets:0,loggedSets:0}))
    }))""")
    original = page.evaluate("localStorage.getItem('forge-training-v1')")
    page.reload(wait_until="domcontentloaded")
    page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
    assert page.locator("#fc-storage").is_visible()
    assert "500 saved workouts" in page.locator("#fc-storage-message").inner_text()
    assert page.locator('[data-fc-action="start"]').is_hidden()
    with page.expect_download() as capture:
        page.locator('[data-fc-action="download-training"]').click()
    assert Path(capture.value.path()).read_text(encoding="utf-8") == original
    assert page.evaluate("localStorage.getItem('forge-training-v1')") == original
    context.close()

    # Exactly 200 archived items are permitted, but archiving another stale active
    # session must refuse without dropping it or losing the original snapshot.
    context = browser.new_context(viewport={"width": 390, "height": 850}, accept_downloads=True)
    page = context.new_page()
    page.add_init_script(FIXED_CLOCK)
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith("http://127.0.0.1:") else route.abort())
    page.goto(url, wait_until="domcontentloaded")
    page.evaluate("""() => localStorage.setItem('forge-training-v1', JSON.stringify({
      version:1,programId:'classic-six-day-v1',
      config:{startDate:'2026-11-09',mode:'rolling',restWeekdays:[0],rotation:['A','B','C']},
      records:[], quarantine:Array.from({length:200},(_,i)=>({id:'archive'+i})),
      active:{version:1, programId:'classic-six-day-v1',id:'old-active',date:'2026-11-09',
        dayKey:'A', stage:'exercise',sets:[{exerciseId:'bench',reps:8}],skipped:[]}
    }))""")
    original = page.evaluate("localStorage.getItem('forge-training-v1')")
    page.reload(wait_until="domcontentloaded")
    page.locator('[data-tab="training"]').first.evaluate("(node)=>node.click()")
    assert page.locator("#fc-legacy").is_visible()
    page.locator('[data-fc-action="archive-legacy"]').click()
    assert "cannot be archived" in page.locator("#fc-storage-message").inner_text()
    assert page.evaluate("localStorage.getItem('forge-training-v1')") == original
    with page.expect_download() as capture:
        page.locator('[data-fc-action="download-training"]').click()
    assert Path(capture.value.path()).read_text(encoding="utf-8") == original
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
print("FORGE cockpit: Chromium real-input validation, duplicate prevention, quarantine, old-session archive, timed holds, safety, mobile layout PASS")
