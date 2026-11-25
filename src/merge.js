// Merge two expense documents record by record. The record with the newer `updatedAt` wins.
// For equal times, the result is still the same in both merge directions (see `pick`).

import { createDoc } from './model.js';

/** JSON with sorted object keys, so that equal documents give equal text. */
export function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

function pick(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return canonicalJson(a) >= canonicalJson(b) ? a : b;
}

/** Union of two record lists by `id`. Keeps the order of `a`, then the new records of `b`. */
function mergeRecords(a = [], b = []) {
  const byId = new Map(b.map((r) => [r.id, r]));
  const out = a.map((r) => pick(r, byId.get(r.id)));
  const seen = new Set(a.map((r) => r.id));
  for (const r of b) if (!seen.has(r.id)) out.push(r);
  return out;
}

function mergeMonth(a, b) {
  if (!a || !b) return a || b;
  const { items: itemsA, ...metaA } = a;
  const { items: itemsB, ...metaB } = b;
  const meta = { ...pick(metaA, metaB) };
  const items = mergeRecords(itemsA, itemsB);
  // One device deleted the month, but the other device added or changed an item later: keep the month.
  if (meta.deleted) {
    const newest = Math.max(-Infinity, ...items.filter((i) => !i.deleted).map((i) => i.updatedAt));
    if (newest > meta.updatedAt) Object.assign(meta, { deleted: false, updatedAt: newest });
  }
  return { ...meta, items };
}

export function mergeDocs(a, b) {
  a = structuredClone(a || createDoc());
  b = structuredClone(b || createDoc());
  const months = {};
  for (const key of new Set([...Object.keys(a.months), ...Object.keys(b.months)])) {
    months[key] = mergeMonth(a.months[key], b.months[key]);
  }
  return {
    version: Math.max(a.version, b.version),
    settings: pick(a.settings, b.settings),
    template: mergeRecords(a.template, b.template),
    months,
  };
}
