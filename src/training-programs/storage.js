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

/**
 * Parse untrusted JSON. Invalid records are never "repaired" into fake data and never used for
 * schedule or progress — but they are QUARANTINED and written back on save, so a later write by
 * any UI cannot silently delete data this version doesn't understand.
 */
export function parseStore(json) {
  let x;
  try { x = JSON.parse(json); } catch { return { store: emptyStore(), dropped: 0, error: 'unreadable' }; }
  if (!x || typeof x !== 'object' || x.version !== STORE_VERSION) return { store: emptyStore(), dropped: 0, error: x ? 'unknown-version' : 'empty' };
  const records = Array.isArray(x.records) ? x.records : [];
  const kept = records.filter(validRecord).slice(-MAX_RECORDS);
  const ids = new Set();
  const unique = kept.filter(r => (ids.has(r.id) ? false : (ids.add(r.id), true)));
  const invalid = records.filter(r => !validRecord(r));
  const prior = Array.isArray(x.quarantine) ? x.quarantine : [];
  const quarantine = [...prior, ...invalid].slice(-MAX_QUARANTINE);
  return { store: { version: STORE_VERSION, programId: x.programId ?? null, config: x.config ?? null, records: unique,
    active: x.active && x.active.version === 1 ? x.active : null, quarantine },
  dropped: records.length - unique.length, quarantined: invalid.length, error: null };
}

export function serializeStore(store) {
  return JSON.stringify({ ...store, records: store.records.slice(-MAX_RECORDS),
    quarantine: (store.quarantine ?? []).slice(-MAX_QUARANTINE) });
}

/** Add a finished record (idempotent by id). Returns a new store. */
export function addRecord(store, record) {
  if (!validRecord(record)) throw new TypeError('Invalid session record');
  const records = store.records.filter(r => r.id !== record.id).concat(record).sort((a, b) => a.date.localeCompare(b.date));
  return { ...store, records: records.slice(-MAX_RECORDS), active: null };
}

export function load(storage) {
  try { return parseStore(storage.getItem(STORAGE_KEY) ?? 'null'); } catch { return { store: emptyStore(), dropped: 0, error: 'storage-unavailable' }; }
}

export function save(storage, store) {
  try { storage.setItem(STORAGE_KEY, serializeStore(store)); return true; } catch { return false; }
}
