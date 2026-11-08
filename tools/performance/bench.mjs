#!/usr/bin/env node
// FORGE 3D performance + accessibility harness (Issue #4).
//
// Measures a FORGE page (or the bare baseline in fixtures/stage.html) loading a
// SYNTHETIC skinned character through the real model-viewer 4.1.0 element in
// Chromium. Everything is EMULATION: headless Chromium, SwiftShader software
// WebGL, CDP CPU throttling. It is not a physical-device result.
//
//   node tools/performance/bench.mjs --root <site dir> --page index.html \
//        --vendor <dir with model-viewer.min.js, html5-qrcode.min.js, axe.min.js> \
//        --models light,typical --profiles desktop,mobile-emu --runs 5 \
//        --checks --out report.json --md report.md --label "pr2@<sha>"
//
// External requests: the pinned CDN URLs are served from --vendor (sha256 recorded);
// every other external request is BLOCKED and listed in the report.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// require() so both a local node_modules and a globally provisioned Playwright resolve.
const { chromium } = createRequire(import.meta.url)('playwright');
const VIEWER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/model-viewer/4.1.0/model-viewer.min.js';
const QR_URL = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
const PROFILES = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, cpu: 1 },
  'mobile-emu': { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, cpu: 4 },
};
const PHASE_MS = 5000;
const SEL = { file: '#forge-avatar-file', panel: '.forge-avatar-panel', viewer: '#forge-avatar-viewer',
  status: '#forge-avatar-status', motion: '#forge-motion-toggle' };

function args() {
  const a = { root: path.join(HERE, 'fixtures'), page: 'stage.html', vendor: null, models: 'light,typical',
    profiles: 'desktop,mobile-emu', runs: 3, checks: false, out: null, md: null, label: '', modelsDir: null };
  const v = process.argv.slice(2);
  for (let i = 0; i < v.length; i++) {
    const k = v[i].replace(/^--/, '');
    if (k === 'checks') a.checks = true;
    else if (k === 'models-dir') a.modelsDir = v[++i];
    else a[k] = v[++i];
  }
  if (!a.vendor) throw new Error('--vendor is required (see tools/performance/fetch_vendor.sh)');
  a.runs = Number(a.runs);
  return a;
}

const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const median = xs => { const s = [...xs].sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const stat = xs => {
  const v = xs.filter(x => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return null;
  const mean = v.reduce((p, q) => p + q, 0) / v.length;
  const sd = Math.sqrt(v.reduce((p, q) => p + (q - mean) ** 2, 0) / v.length);
  const r = x => Math.round(x * 100) / 100;
  return { median: r(median(v)), min: r(Math.min(...v)), max: r(Math.max(...v)), cv_pct: mean ? r(100 * sd / mean) : 0, n: v.length };
};

function serve(root) {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
  return new Promise(ok => {
    const srv = http.createServer((q, r) => {
      const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '');
      const f = path.resolve(root, rel || 'index.html');
      if (!f.startsWith(path.resolve(root)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(r);
    }).listen(0, '127.0.0.1', () => ok(srv));
  });
}

function firstPartyGzip(root, page) {
  // What a gzip-serving host would send for the first-party text the page references.
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const refs = new Set([page]);
  for (const m of html.matchAll(/(?:src|href)="\.?\/?([^"#?:]+\.(?:js|css|mjs))"/g)) refs.add(m[1]);
  const out = {};
  let raw = 0, gz = 0;
  for (const r of refs) {
    const f = path.join(root, r);
    if (!fs.existsSync(f)) continue;
    const b = fs.readFileSync(f);
    const g = zlib.gzipSync(b, { level: 9 }).length;
    out[r] = { raw: b.length, gzip: g };
    raw += b.length; gz += g;
  }
  return { files: out, total_raw: raw, total_gzip: gz };
}

const INIT = () => {
  window.__perf = { lt: [], cls: 0, lcp: 0, fcp: 0 };
  try {
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime; }).observe({ type: 'paint', buffered: true });
  } catch (e) { window.__perf.err = String(e); }
};

async function routeExternal(context, vendor, origin, ledger, opts = {}) {
  await context.route(u => !u.href.startsWith(origin) && /^https?:/.test(u.href), async route => {
    const url = route.request().url();
    if (url === VIEWER_URL && !opts.blockViewer) return route.fulfill({ path: path.join(vendor, 'model-viewer.min.js'), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
    if (url === QR_URL) return route.fulfill({ path: path.join(vendor, 'html5-qrcode.min.js'), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
    ledger.add(url.split('?')[0]);
    return route.abort();
  });
}

async function processCpu(bcdp) {
  const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo');
  const by = {};
  for (const p of processInfo) by[p.type] = (by[p.type] || 0) + p.cpuTime;
  return by;
}

async function metrics(cdp) {
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(m.map(x => [x.name, x.value]));
}

async function phase(page, cdp, bcdp, ms = PHASE_MS) {
  const m0 = await metrics(cdp); const c0 = await processCpu(bcdp); const t0 = Date.now();
  const frames = await page.evaluate(ms => new Promise(ok => {
    const d = []; let last = performance.now(); const end = last + ms;
    const tick = now => { d.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else ok(d); };
    requestAnimationFrame(tick);
  }), ms);
  const wall = (Date.now() - t0) / 1000;
  const m1 = await metrics(cdp); const c1 = await processCpu(bcdp);
  const cpu = {};
  let total = 0;
  for (const k of Object.keys(c1)) { cpu[k] = Math.round(1000 * ((c1[k] || 0) - (c0[k] || 0)) / wall) / 10; total += (c1[k] || 0) - (c0[k] || 0); }
  const fs_ = frames.slice(1).sort((a, b) => a - b);
  const p = q => fs_[Math.min(fs_.length - 1, Math.floor(q * fs_.length))];
  return {
    fps: Math.round(10 * frames.length / (ms / 1000)) / 10,
    frame_ms_p50: Math.round(10 * p(0.5)) / 10, frame_ms_p95: Math.round(10 * p(0.95)) / 10,
    main_thread_busy_pct: Math.round(1000 * (m1.TaskDuration - m0.TaskDuration) / wall) / 10,
    script_pct: Math.round(1000 * (m1.ScriptDuration - m0.ScriptDuration) / wall) / 10,
    all_process_cpu_pct: Math.round(1000 * total / wall) / 10,
    process_cpu_pct: cpu,
  };
}

// After an action (motion off, scroll away) software GL drains queued frames for a
// while; a single average would mix that lag with steady state. Sample 1 s windows.
const QUIET_PCT = 10;
async function settle(page, bcdp, windows = 8) {
  const cpuNow = async () => Object.values(await processCpu(bcdp)).reduce((p, q) => p + q, 0);
  const series = [];
  for (let i = 0; i < windows; i++) {
    const c0 = await cpuNow(); const t0 = Date.now();
    await page.waitForTimeout(1000);
    series.push(Math.round(1000 * (await cpuNow() - c0) / ((Date.now() - t0) / 1000)) / 10);
  }
  const running = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running')
    .map(a => (a.animationName || a.constructor.name) + '@' + (a.effect?.target?.className?.toString?.().split(' ')[0] || a.effect?.target?.tagName || '?')));
  const q = series.findIndex(v => v < QUIET_PCT);
  const tail = series.slice(-3);
  return { cpu_series_pct: series, seconds_to_quiet: q < 0 ? null : q + 1,
    steady_cpu_pct: Math.round(10 * tail.reduce((p, v) => p + v, 0) / tail.length) / 10, running_animations: running };
}

async function loadModel(page, glbPath, timeout = 90000) {
  await page.evaluate(sel => {
    const v = document.querySelector(sel);
    window.__mv = {};
    v?.addEventListener('load', () => { window.__mv.load = performance.now(); }, { once: true });
    v?.addEventListener('model-visibility', e => { if (e.detail?.visible && !window.__mv.visible) window.__mv.visible = performance.now(); });
  }, SEL.viewer);
  const t0 = await page.evaluate(() => performance.now());
  await page.locator(SEL.file).setInputFiles({ name: 'synthetic-character.glb', mimeType: 'model/gltf-binary', buffer: fs.readFileSync(glbPath) });
  let ok = true;
  try { await page.locator(SEL.panel + '.is-loaded').first().waitFor({ state: 'attached', timeout }); } catch { ok = false; }
  const r = await page.evaluate(([t0, sel]) => ({
    ready_ms: performance.now() - t0,
    mv_load_ms: window.__mv.load ? window.__mv.load - t0 : null,
    mv_visible_ms: window.__mv.visible ? window.__mv.visible - t0 : null,
    status: document.querySelector(sel)?.textContent?.trim().slice(0, 160) || '',
  }), [t0, SEL.status]);
  return { ok, ...r };
}

async function canvasInfo(page) {
  return page.evaluate(sel => {
    const v = document.querySelector(sel);
    const c = v?.shadowRoot?.querySelector('canvas');
    if (!v || !c) return null;
    const b = v.getBoundingClientRect();
    return { css_w: Math.round(b.width), css_h: Math.round(b.height), dpr: devicePixelRatio, canvas_w: c.width, canvas_h: c.height,
      render_scale: Math.round(100 * c.width / Math.max(1, b.width * devicePixelRatio)) / 100,
      auto_rotate: v.hasAttribute('auto-rotate'), animation: v.animationName || null, paused: v.paused,
      touch_action: v.getAttribute('touch-action') };
  }, SEL.viewer);
}

async function oneRun(browser, a, prof, glb, origin, url) {
  const P = PROFILES[prof];
  const ctx = await browser.newContext({ viewport: P.viewport, deviceScaleFactor: P.deviceScaleFactor, isMobile: P.isMobile, hasTouch: P.hasTouch });
  const blocked = new Set();
  await routeExternal(ctx, a.vendor, origin, blocked);
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  const bytes = { first_party: 0, viewer: 0, qr: 0, other: 0 };
  page.on('requestfinished', async req => {
    try {
      const s = await req.sizes(); const n = s.responseBodySize + s.responseHeadersSize; const u = req.url();
      if (u === VIEWER_URL) bytes.viewer += n; else if (u === QR_URL) bytes.qr += n;
      else if (u.startsWith(origin)) bytes.first_party += n; else bytes.other += n;
    } catch {}
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  // CDP CPU throttling is implemented by busy-waiting the renderer (~85 % of a core at 4x on this host),
  // so it is ON only for timing metrics (load, model-ready, fps) and OFF for every CPU/battery reading.
  const throttle = on => P.cpu > 1 ? cdp.send('Emulation.setCPUThrottlingRate', { rate: on ? P.cpu : 1 }) : null;
  await throttle(true);
  const bcdp = await browser.newBrowserCDPSession();
  const nav0 = Date.now();
  await page.goto(url, { waitUntil: 'load' });
  const navLoad = Date.now() - nav0;
  await page.waitForTimeout(1500);
  const pre = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return { dcl_ms: n?.domContentLoadedEventEnd, load_ms: n?.loadEventEnd, fcp_ms: __perf.fcp, lcp_ms: __perf.lcp, cls_pre_model: __perf.cls,
      long_tasks_pre_model: __perf.lt.length, long_task_ms_pre_model: __perf.lt.reduce((p, q) => p + q[1], 0),
      running_css_animations: document.getAnimations().filter(x => x.playState === 'running').length,
      running_animation_names: document.getAnimations().filter(x => x.playState === 'running').map(a => a.animationName || a.constructor.name) };
  });
  await throttle(false);
  const idle_ui = await settle(page, bcdp, 6);
  await throttle(true);
  const model = await loadModel(page, glb);
  let animating = null, animating_cpu = null, motion_off = null, offscreen = null, canvas = null, heap = null;
  if (model.ok) {
    await page.waitForTimeout(1000);
    canvas = await canvasInfo(page);
    animating = await phase(page, cdp, bcdp);
    await throttle(false);
    animating_cpu = await settle(page, bcdp, 4);
    const mm = await metrics(cdp);
    heap = { js_heap_used_mb: Math.round(mm.JSHeapUsedSize / 1048576 * 10) / 10, dom_nodes: mm.Nodes };
    const toggle = page.locator(SEL.motion);
    if (await toggle.count() && await toggle.first().isVisible()) {
      await toggle.first().click();
      motion_off = { ...(await settle(page, bcdp)), state: await canvasInfo(page) };
      await toggle.first().click();
      await page.waitForTimeout(2000);
    }
    // Take the stage out of view: scroll first; if the layout keeps it on screen (app-shell
    // pages), switch to another workspace by hash, which is how FORGE navigates.
    const how = await page.evaluate(sel => {
      const v = document.querySelector(sel);
      const out = () => { const b = v.getBoundingClientRect(); return b.width === 0 || b.bottom <= 0 || b.top >= innerHeight || b.right <= 0 || b.left >= innerWidth; };
      window.scrollTo(0, document.documentElement.scrollHeight);
      if (out()) return 'scroll';
      const other = [...document.querySelectorAll('section.page[id]')].find(s => !s.contains(v));
      if (other) { location.hash = '#' + other.id; return 'workspace:' + other.id; }
      return 'none';
    }, SEL.viewer);
    await page.waitForTimeout(300);
    const outOfView = await page.evaluate(sel => { const b = document.querySelector(sel).getBoundingClientRect();
      return b.width === 0 || b.bottom <= 0 || b.top >= innerHeight || b.right <= 0 || b.left >= innerWidth; }, SEL.viewer);
    offscreen = { ...(await settle(page, bcdp)), method: how, stage_out_of_view: outOfView };
  }
  const post = await page.evaluate(() => ({ cls_total: __perf.cls, long_tasks_total: __perf.lt.length,
    long_task_ms_total: __perf.lt.reduce((p, q) => p + q[1], 0), long_task_max_ms: __perf.lt.reduce((p, q) => Math.max(p, q[1]), 0) }));
  await ctx.close();
  return { nav_wall_ms: navLoad, ...pre, ...post, transfer_bytes: bytes, idle_ui, model, canvas, animating, animating_cpu, motion_off, offscreen, heap,
    blocked_external: [...blocked], page_errors: errors };
}

async function checks(a, origin, url, glb) {
  const out = {};
  // 1. Reduced motion.
  {
    const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    for (const rm of ['no-preference', 'reduce']) {
      const ctx = await b.newContext({ viewport: PROFILES['mobile-emu'].viewport, reducedMotion: rm });
      await routeExternal(ctx, a.vendor, origin, new Set());
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
      const bcdp = await b.newBrowserCDPSession();
      await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(1000);
      const css = await page.evaluate(() => document.getAnimations().filter(x => x.playState === 'running').length);
      const m = await loadModel(page, glb);
      await page.waitForTimeout(1000);
      out['motion_' + rm] = { running_css_animations: css, model_ready: m.ok, viewer: await canvasInfo(page), cpu: m.ok ? await settle(page, bcdp, 6) : null };
      await ctx.close();
    }
    await b.close();
  }
  // 1b. One-tap authored turn controls (PR #2 recognises the clip names the synthetic model carries).
  {
    const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const ctx = await b.newContext({ viewport: PROFILES['mobile-emu'].viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await routeExternal(ctx, a.vendor, origin, new Set());
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
    const bcdp = await b.newBrowserCDPSession();
    await page.goto(url, { waitUntil: 'load' });
    const m = await loadModel(page, glb);
    const btn = page.locator('[data-forge-private-turn="Turn90Left_PrivateV1"]');
    const present = m.ok && await btn.count() > 0;
    if (!present) out.turn_controls = { present: false, note: 'no turn buttons on this page (baseline or clip names not recognised)' };
    else {
      await page.waitForTimeout(1500);
      const visible = await btn.first().isVisible();
      const state = () => page.evaluate(sel => { const v = document.querySelector(sel);
        return { animation: v.animationName, paused: v.paused, t: Math.round(1000 * v.currentTime) / 1000, auto_rotate: v.hasAttribute('auto-rotate') }; }, SEL.viewer);
      await page.evaluate(sel => { const v = document.querySelector(sel); window.__turnEv = { loop: 0, finished: 0 };
        v.addEventListener('loop', () => window.__turnEv.loop++); v.addEventListener('finished', () => window.__turnEv.finished++); }, SEL.viewer);
      const t0 = Date.now();
      if (visible) await btn.first().tap();
      const at_tap = await state();
      const tap_ms = Date.now() - t0;
      const during = await phase(page, cdp, bcdp, 1500);
      const hold = await settle(page, bcdp, 6);
      const after = await state();
      const idle = page.locator('#forge-avatar-idle');
      let back = null;
      if (await idle.count() && await idle.first().isVisible()) { await idle.first().tap(); await page.waitForTimeout(1000); back = await state(); }
      const ev = await page.evaluate(() => window.__turnEv);
      const CLIP_S = 1.70; // Turn90Left_PrivateV1 duration (synthetic_character.TURN_CLIPS)
      out.turn_controls = { present: true, button_visible: visible, tap_to_state_ms: tap_ms, at_tap, during_turn: during,
        end_pose_hold: hold, after_turn: after, back_to_idle: back, events: ev, page_errors: errors,
        turntable_suppressed: at_tap.auto_rotate === false,
        played_once: ev.loop === 0 && ev.finished >= 1,
        holds_end_pose: after.paused === true && Math.abs(after.t - CLIP_S) <= 0.05 && after.animation === 'Turn90Left_PrivateV1' };
    }
    await b.close();
  }
  // 2. No WebGL.
  {
    const b = await chromium.launch({ args: ['--disable-3d-apis', '--disable-gpu'] });
    const ctx = await b.newContext({ viewport: PROFILES['mobile-emu'].viewport });
    await routeExternal(ctx, a.vendor, origin, new Set());
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    await page.goto(url, { waitUntil: 'load' });
    const webgl = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl'));
    const m = await loadModel(page, glb, 30000);
    out.no_webgl = { webgl_available: webgl, model_marked_loaded: m.ok, status: m.status, page_errors: errors,
      user_told: /webgl|3d|display|support|could not|unable|unavailable/i.test(m.status) };
    await b.close();
  }
  // 3. Viewer library unreachable (offline / CDN blocked).
  {
    const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const ctx = await b.newContext({ viewport: PROFILES['mobile-emu'].viewport });
    await routeExternal(ctx, a.vendor, origin, new Set(), { blockViewer: true });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
    await page.goto(url, { waitUntil: 'load' });
    const m = await loadModel(page, glb, 20000);
    out.viewer_offline = { model_marked_loaded: m.ok, status: m.status, page_errors: errors,
      user_told: /connection|could not|unable|offline|load/i.test(m.status) };
    // 4. Accessibility (axe-core) + keyboard, on the same page (UI without a model).
    await page.addScriptTag({ path: path.join(a.vendor, 'axe.min.js') });
    const axe = await page.evaluate(async () => {
      const r = await window.axe.run(document, { resultTypes: ['violations'] });
      return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
    });
    out.axe = { engine: 'axe-core 4.10.2', violations: axe,
      by_impact: axe.reduce((p, v) => (p[v.impact] = (p[v.impact] || 0) + v.nodes, p), {}) };
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    const seen = [];
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press('Tab');
      const d = await page.evaluate(() => {
        let e = document.activeElement; while (e?.shadowRoot?.activeElement) e = e.shadowRoot.activeElement;
        if (!e || e === document.body) return null;
        const s = getComputedStyle(e);
        const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none');
        const r = e.getBoundingClientRect();
        return { tag: e.tagName.toLowerCase(), id: e.id || null, name: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40),
          visible_ring: !!ring, on_screen: r.width > 0 && r.height > 0 };
      });
      if (!d) continue;
      const key = d.tag + '#' + d.id + ':' + d.name;
      if (seen.length && seen[0].key === key) break;
      seen.push({ key, ...d });
    }
    out.keyboard = { focus_stops: seen.length,
      without_visible_ring: seen.filter(s => !s.visible_ring && s.on_screen).map(s => s.key),
      off_screen_focus: seen.filter(s => !s.on_screen).map(s => s.key),
      reaches_file_chooser: seen.some(s => /forge-avatar-(file|open)/.test(s.key) || /choose|load your 3d|glb/i.test(s.name)),
      reaches_motion_toggle: seen.some(s => s.id === 'forge-motion-toggle') };
    await b.close();
  }
  return out;
}

async function environment(vendor) {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const gl = await p.evaluate(() => { const g = document.createElement('canvas').getContext('webgl');
    const e = g?.getExtension('WEBGL_debug_renderer_info'); return g ? (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'webgl') : 'none'; });
  const env = { chromium: b.version(), webgl_renderer: gl, node: process.version, os: `${os.type()} ${os.release()}`,
    cpu: `${os.cpus()[0]?.model || '?'} x${os.cpus().length}`, mem_gb: Math.round(os.totalmem() / 2 ** 30),
    vendor_sha256: Object.fromEntries(['model-viewer.min.js', 'html5-qrcode.min.js', 'axe.min.js'].map(f => [f, sha256(path.join(vendor, f))])),
    classification: 'EMULATION — headless Chromium, software WebGL, CDP CPU throttling; not a physical device' };
  await b.close();
  return env;
}

function ensureModels(names, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const info = {};
  for (const n of names) {
    const f = path.join(dir, n + '.glb');
    const line = execFileSync('python3', [path.join(HERE, 'synthetic_character.py'), f, '--preset', n]).toString().trim();
    info[n] = { path: f, ...JSON.parse(line) };
  }
  return info;
}

function summarize(runs) {
  const pick = f => stat(runs.map(f));
  return {
    fcp_ms: pick(r => r.fcp_ms), lcp_ms: pick(r => r.lcp_ms), dcl_ms: pick(r => r.dcl_ms), load_ms: pick(r => r.load_ms),
    cls_total: pick(r => r.cls_total), long_task_ms_total: pick(r => r.long_task_ms_total), long_task_max_ms: pick(r => r.long_task_max_ms),
    model_ready_ms: pick(r => r.model.ok ? r.model.ready_ms : NaN), model_visible_ms: pick(r => r.model.mv_visible_ms),
    idle_ui_cpu_pct: pick(r => r.idle_ui.steady_cpu_pct), idle_ui_quiet_s: pick(r => r.idle_ui.seconds_to_quiet),
    animating_fps: pick(r => r.animating?.fps), animating_frame_p95_ms: pick(r => r.animating?.frame_ms_p95),
    animating_cpu_pct: pick(r => r.animating_cpu?.steady_cpu_pct), animating_main_busy_pct: pick(r => r.animating?.main_thread_busy_pct),
    motion_off_cpu_pct: pick(r => r.motion_off?.steady_cpu_pct), motion_off_quiet_s: pick(r => r.motion_off?.seconds_to_quiet),
    offscreen_cpu_pct: pick(r => r.offscreen?.steady_cpu_pct), offscreen_quiet_s: pick(r => r.offscreen?.seconds_to_quiet),
    js_heap_mb: pick(r => r.heap?.js_heap_used_mb), dom_nodes: pick(r => r.heap?.dom_nodes),
    first_party_kb: pick(r => r.transfer_bytes.first_party / 1024), viewer_kb: pick(r => r.transfer_bytes.viewer / 1024),
    failures: runs.filter(r => !r.model.ok).length,
    canvas: runs.find(r => r.canvas)?.canvas || null,
    offscreen_method: runs.find(r => r.offscreen)?.offscreen?.method ?? null,
    stage_out_of_view: runs.find(r => r.offscreen)?.offscreen?.stage_out_of_view ?? null,
    idle_running_animations: runs[0]?.running_animation_names || [],
    blocked_external: [...new Set(runs.flatMap(r => r.blocked_external))],
    page_errors: [...new Set(runs.flatMap(r => r.page_errors))],
  };
}

function markdown(rep) {
  const L = [];
  L.push(`# FORGE 3D performance report — ${rep.label || rep.page}`, '', `**${rep.environment.classification}**`, '');
  L.push(`Chromium ${rep.environment.chromium}; WebGL renderer: \`${rep.environment.webgl_renderer}\`; host ${rep.environment.cpu}, ${rep.environment.mem_gb} GB; runs per cell: ${rep.runs}. Values: median (min–max).`, '');
  L.push(`First-party text: ${rep.first_party_gzip.total_raw} B raw, ${rep.first_party_gzip.total_gzip} B gzip-9 (est. hosted transfer).`, '');
  const f = s => s ? `${s.median} (${s.min}–${s.max})` : '—';
  L.push('| Profile | Model | FCP ms | LCP ms | CLS | Long-task ms | Model ready ms | Idle UI CPU % | Animating fps | Frame p95 ms | Animating CPU % | Motion-off CPU % (quiet s) | Offscreen CPU % (quiet s) | JS heap MB |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of rep.cells) {
    const s = c.summary;
    L.push(`| ${c.profile} | ${c.model} | ${f(s.fcp_ms)} | ${f(s.lcp_ms)} | ${f(s.cls_total)} | ${f(s.long_task_ms_total)} | ${f(s.model_ready_ms)} | ${f(s.idle_ui_cpu_pct)} | ${f(s.animating_fps)} | ${f(s.animating_frame_p95_ms)} | ${f(s.animating_cpu_pct)} | ${f(s.motion_off_cpu_pct)} (${s.motion_off_quiet_s?.median ?? '—'}) | ${f(s.offscreen_cpu_pct)} (${s.offscreen_quiet_s?.median ?? '—'}) | ${f(s.js_heap_mb)} |`);
  }
  L.push('', 'CPU readings are taken with CDP CPU throttling OFF (throttling busy-waits the renderer); fps / timings use the profile throttle. On this 4-core host software WebGL saturates near 380 %, so animating CPU hits a ceiling — compare fps and quiet states instead.');
  L.push(`Offscreen method: ${[...new Set(rep.cells.map(c => c.summary.offscreen_method))].join(', ')}; stage out of view: ${[...new Set(rep.cells.map(c => c.summary.stage_out_of_view))].join(', ')}. Ambient animations running at idle: ${rep.cells[0]?.summary.idle_running_animations.join(', ') || 'none'}.`);
  L.push(`Motion-off / offscreen CPU = steady state (mean of the last 3 of 8 one-second windows after the action); quiet s = first window under ${QUIET_PCT} %.`);
  L.push('CPU % = sum over all Chromium processes (100 % = one core), a battery proxy. Software WebGL inflates GPU-process CPU versus real hardware; compare rows, do not read as device numbers.');
  if (rep.checks) {
    const k = rep.checks;
    L.push('', '## Checks', '');
    L.push(`- Reduced motion: running CSS animations ${k.motion_reduce.running_css_animations} vs ${k['motion_no-preference'].running_css_animations} normal; auto-rotate ${k.motion_reduce.viewer?.auto_rotate} vs ${k['motion_no-preference'].viewer?.auto_rotate}; steady CPU with model ${k.motion_reduce.cpu?.steady_cpu_pct}% vs ${k['motion_no-preference'].cpu?.steady_cpu_pct}%.`);
    if (k.turn_controls?.present) {
      const t = k.turn_controls;
      L.push(`- One-tap turn (90° Left, mobile-emu): button visible ${t.button_visible}; turntable suppressed ${t.turntable_suppressed}; **played once ${t.played_once}** (loop events ${t.events.loop}, finished ${t.events.finished}); **holds end pose ${t.holds_end_pose}**; during turn ${t.during_turn.fps} fps / ${t.during_turn.all_process_cpu_pct}% CPU; end-pose hold quiet after ${t.end_pose_hold.seconds_to_quiet ?? 'never'} s, steady ${t.end_pose_hold.steady_cpu_pct}% (still running: ${t.end_pose_hold.running_animations.join(', ') || 'none'}); after: ${JSON.stringify(t.after_turn)}; back to idle: ${JSON.stringify(t.back_to_idle)}.`);
    } else if (k.turn_controls) L.push(`- One-tap turn: ${k.turn_controls.note}.`);
    L.push(`- No WebGL: user told = ${k.no_webgl.user_told}; marked loaded = ${k.no_webgl.model_marked_loaded}; status: "${k.no_webgl.status}"; page errors ${k.no_webgl.page_errors.length}.`);
    L.push(`- Viewer CDN unreachable: user told = ${k.viewer_offline.user_told}; status: "${k.viewer_offline.status}".`);
    L.push(`- axe-core: ${k.axe.violations.length} rule(s) violated; nodes by impact ${JSON.stringify(k.axe.by_impact)}.`);
    for (const v of k.axe.violations) L.push(`  - \`${v.id}\` (${v.impact}, ${v.nodes} nodes): ${v.help}`);
    L.push(`- Keyboard: ${k.keyboard.focus_stops} focus stops; without visible ring: ${k.keyboard.without_visible_ring.length}; off-screen focus: ${k.keyboard.off_screen_focus.length}; reaches model chooser: ${k.keyboard.reaches_file_chooser}; reaches motion toggle: ${k.keyboard.reaches_motion_toggle}.`);
  }
  const blocked = [...new Set(rep.cells.flatMap(c => c.summary.blocked_external))];
  L.push('', `Blocked external requests (not pinned CDN): ${blocked.length ? blocked.map(b => '`' + b + '`').join(', ') : 'none'}.`);
  return L.join('\n') + '\n';
}

async function main() {
  const a = args();
  const srv = await serve(path.resolve(a.root));
  const origin = `http://127.0.0.1:${srv.address().port}`;
  const url = `${origin}/${a.page}`;
  const modelsDir = a.modelsDir || fs.mkdtempSync(path.join(os.tmpdir(), 'forge-perf-'));
  const models = ensureModels(a.models.split(','), modelsDir);
  const rep = { tool: 'forge-bench/1', label: a.label, page: a.page, runs: a.runs, models: Object.fromEntries(Object.entries(models).map(([k, v]) => [k, { ...v, path: undefined }])),
    environment: await environment(a.vendor), first_party_gzip: firstPartyGzip(path.resolve(a.root), a.page), cells: [] };
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const prof of a.profiles.split(',')) for (const m of Object.keys(models)) {
    const runs = [];
    for (let i = 0; i < a.runs; i++) {
      runs.push(await oneRun(browser, a, prof, models[m].path, origin, url));
      process.stderr.write(`${prof}/${m} run ${i + 1}/${a.runs} ready=${Math.round(runs.at(-1).model.ready_ms)}ms ok=${runs.at(-1).model.ok}\n`);
    }
    rep.cells.push({ profile: prof, model: m, summary: summarize(runs), runs });
  }
  await browser.close();
  if (a.checks) rep.checks = await checks(a, origin, url, models[Object.keys(models)[0]].path);
  srv.close();
  const json = JSON.stringify(rep, null, 2);
  if (a.out) fs.writeFileSync(a.out, json); else process.stdout.write(json + '\n');
  if (a.md) fs.writeFileSync(a.md, markdown(rep));
  const failed = rep.cells.some(c => c.summary.failures);
  process.exitCode = failed ? 1 : 0;
}

main().catch(e => { console.error(e); process.exit(2); });
