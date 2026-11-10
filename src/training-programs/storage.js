// Versioned local store for the training module. NEW key; existing FORGE keys are never written.
// Pure (de)serialization plus thin load/save over an injected Storage-like object (localStorage
// in the browser, a Map-backed fake in tests). Nothing leaves the device.

import { isISODate } from './dates.js';

export const STORAGE_KEY = 'forge-training-v1';
export const STORE_VERSION = 1;
export const MAX_RECORDS = 500;
const STATUSES = new Set(['completed', 'partial', 'skipped', 'aborted', 'stopped_safety']);

export const MAX_QUARANTINE = 200;

export function emptyStore() {
  return { version: STORE_VERSION, programId: null, config: null, records: [], active: null, quarantine: [] };
}

function validRecord(r) {
  return r && typeof r.id === 'string' && isISODate(r.date) && STATUSES.has(r.status) && Array.isArray(r.sets)
    && r.sets.every(s => s && typeof s.exerciseId === 'string' && Number.isFinite(s.load) && ['kg', 'lb'].includes(s.unit)
      && (Number.isInteger(s.reps) || (s.reps === null && Number.isInteger(s.seconds) && s.seconds > 0)));
}

/** Why a store may not be written. null = writable. */
export function capacityError(store) {
  if (store.readOnly) return store.readOnly;
  if ((store.records?.length ?? 0) > MAX_RECORDS) return 'records-overflow';
  if ((store.quarantine?.length ?? 0) > MAX_QUARANTINE) return 'quarantine-overflow';
  return null;
}

const KNOWN_KEYS = new Set(['version', 'programId', 'config', 'records', 'active', 'quarantine', 'readOnly']);

/**
 * Parse untrusted JSON. NOTHING is ever dropped or trimmed:
 *  - valid, unique records           -> store.records (used for schedule/progress)
 *  - invalid or duplicate-id records -> store.quarantine (kept verbatim, never used in logic)
 *  - an unreadable `active` session  -> store.quarantine as {kind:'unreadable-active', original}
 *  - unknown top-level fields        -> kept and written back unchanged
 * If the result exceeds a cap, or the data is unreadable / from an unknown version / has a
 * `records` or `quarantine` field that is present but not a list ('malformed-store'), the store is
 * marked `readOnly` and `error` is set: serializeStore/save then REFUSE to write (fail closed),
 * so the original browser data stays exactly as it was until the owner decides (see exportRaw).
 */
export function parseStore(json) {
  let x;
  try { x = JSON.parse(json); } catch { return { store: { ...emptyStore(), readOnly: 'unreadable' }, dropped: 0, quarantined: 0, error: 'unreadable' }; }
  if (x === null || x === undefined) return { store: emptyStore(), dropped: 0, quarantined: 0, error: 'empty' };
  if (typeof x !== 'object' || x.version !== STORE_VERSION) {
    return { store: { ...emptyStore(), readOnly: 'unknown-version' }, dropped: 0, quarantined: 0, error: 'unknown-version' };
  }
  // A missing (or null) list is simply empty. A PRESENT field of the wrong shape is damaged data
  // we must not reinterpret as empty and later overwrite: fail closed instead.
  const wrongShape = v => v !== undefined && v !== null && !Array.isArray(v);
  if (wrongShape(x.records) || wrongShape(x.quarantine)) {
    return { store: { ...emptyStore(), readOnly: 'malformed-store' }, dropped: 0, quarantined: 0, error: 'malformed-store',
      malformedFields: ['records', 'quarantine'].filter(k => wrongShape(x[k])) };
  }
  const input = Array.isArray(x.records) ? x.records : [];
  const ids = new Set();
  const records = [];
  const moved = [];
  for (const r of input) {
    if (validRecord(r) && !ids.has(r.id)) { ids.add(r.id); records.push(r); } else moved.push(r);
  }
  const prior = Array.isArray(x.quarantine) ? x.quarantine : [];
  let active = null;
  if (x.active && typeof x.active === 'object' && x.active.version === 1) active = x.active;
  else if (x.active !== null && x.active !== undefined) moved.push({ kind: 'unreadable-active', original: x.active });
  const extra = {};
  for (const k of Object.keys(x)) if (!KNOWN_KEYS.has(k)) extra[k] = x[k];
  const store = { ...extra, version: STORE_VERSION, programId: x.programId ?? null, config: x.config ?? null,
    records, active, quarantine: [...prior, ...moved] };
  const error = capacityError(store);
  if (error) store.readOnly = error;
  return { store, dropped: 0, quarantined: moved.length, error,
    counts: { records: records.length, quarantine: store.quarantine.length, maxRecords: MAX_RECORDS, maxQuarantine: MAX_QUARANTINE } };
}

/** Throws RangeError instead of trimming when a cap is exceeded or the store is read-only. */
export function serializeStore(store) {
  const error = capacityError(store);
  if (error) throw new RangeError(`Training store is not writable: ${error}`);
  return JSON.stringify(store);
}

/**
 * Add a finished record (idempotent by id). Returns a new store. Never trims: if this pushes
 * the store past MAX_RECORDS, save() will refuse and the UI must tell the user.
 */
export function addRecord(store, record) {
  if (!validRecord(record)) throw new TypeError('Invalid session record');
  const records = store.records.filter(r => r.id !== record.id).concat(record).sort((a, b) => a.date.localeCompare(b.date));
  return { ...store, records, active: null };
}

export function load(storage) {
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return { store: { ...emptyStore(), readOnly: 'storage-unavailable' }, dropped: 0, quarantined: 0, error: 'storage-unavailable' }; }
  return parseStore(raw ?? 'null');
}

/** Save with a reason on failure: {ok:true} | {ok:false, error}. Never writes a trimmed copy. */
export function trySave(storage, store) {
  const error = capacityError(store);
  if (error) return { ok: false, error };
  try { storage.setItem(STORAGE_KEY, serializeStore(store)); return { ok: true, error: null }; }
  catch { return { ok: false, error: 'storage-write-failed' }; }
}

export function save(storage, store) {
  return trySave(storage, store).ok;
}

/** The untouched original string for backup/export (or null). Read-only; safe in every state. */
export function exportRaw(storage) {
  try { return storage.getItem(STORAGE_KEY); } catch { return null; }
}
