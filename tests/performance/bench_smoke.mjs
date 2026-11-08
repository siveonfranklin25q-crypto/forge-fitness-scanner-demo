// Harness smoke test: runs bench.mjs once on the bare baseline stage and checks the
// report is complete and internally sane. Needs Playwright Chromium and a vendor dir.
//   node tests/performance/bench_smoke.mjs <vendor dir>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const vendor = process.argv[2];
assert.ok(vendor, 'usage: bench_smoke.mjs <vendor dir>');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-bench-smoke-'));
const out = path.join(tmp, 'r.json');
execFileSync('node', [path.join(ROOT, 'tools/performance/bench.mjs'), '--vendor', vendor, '--models', 'light',
  '--profiles', 'desktop', '--runs', '1', '--checks', '--models-dir', tmp, '--out', out, '--md', path.join(tmp, 'r.md')],
  { stdio: ['ignore', 'inherit', 'inherit'] });
const r = JSON.parse(fs.readFileSync(out, 'utf8'));
const run = r.cells[0].runs[0];

assert.match(r.environment.classification, /EMULATION/);
assert.equal(r.environment.vendor_sha256['model-viewer.min.js'].length, 64);
assert.ok(run.model.ok, 'synthetic model must load in real model-viewer');
assert.ok(run.model.mv_load_ms > 0);
assert.ok(run.canvas.canvas_w > 0 && run.canvas.auto_rotate === true);
assert.ok(run.animating.fps > 0);
assert.ok(run.transfer_bytes.viewer > 500_000, 'viewer bytes counted');
assert.deepEqual(run.blocked_external, []);
assert.equal(run.page_errors.length, 0);
// Baseline has no ambient CSS motion: once the model is paused/offscreen it must go quiet.
assert.ok(run.motion_off.seconds_to_quiet !== null, 'motion off reaches quiet');
assert.ok(run.offscreen.stage_out_of_view && run.offscreen.seconds_to_quiet !== null, 'offscreen reaches quiet');
assert.ok(r.checks.motion_reduce.viewer.auto_rotate === false, 'reduced motion disables auto-rotate');
assert.ok(r.checks.viewer_offline.user_told, 'offline viewer is explained to the user');
assert.ok(Array.isArray(r.checks.axe.violations));
assert.ok(r.checks.keyboard.reaches_file_chooser);
console.log('bench smoke OK', JSON.stringify({ ready_ms: Math.round(run.model.ready_ms), fps: run.animating.fps,
  quiet_motion_off_s: run.motion_off.seconds_to_quiet, quiet_offscreen_s: run.offscreen.seconds_to_quiet }));
