// Read-only calculations for the History and Trends screens.

import { getMonth, liveItems, liveMonthKeys, monthTotals } from './model.js';

const PARTS = ['fixed', 'grocery', 'gas', 'other'];

/** Grouping key for names: case and extra spaces do not matter. */
export function nameKey(name) {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function monthSummaries(doc) {
  return liveMonthKeys(doc).map((key) => {
    const month = getMonth(doc, key);
    return { key, ...monthTotals(month), target: month.target ?? null };
  });
}

export function yearsOf(doc) {
  return [...new Set(liveMonthKeys(doc).map((k) => Number(k.slice(0, 4))))];
}

/** Totals of one year. With `upTo` (a month key), later months (started early) are not counted. */
export function yearSummary(doc, year, { upTo = '9999-99' } = {}) {
  const all = monthSummaries(doc).filter((r) => r.key.startsWith(`${year}-`));
  const rows = all.filter((r) => r.key <= upTo);
  const parts = Object.fromEntries(PARTS.map((p) => [p, rows.reduce((s, r) => s + r[p], 0)]));
  const total = rows.reduce((s, r) => s + r.total, 0);
  return { year, months: rows.length, future: all.length - rows.length, total, average: rows.length ? Math.round(total / rows.length) : 0, parts };
}

/** All live items of one kind with their month key, in month order. Range keys are inclusive. */
export function itemsOfKind(doc, kind, { from = '0000-00', to = '9999-99' } = {}) {
  const out = [];
  for (const key of liveMonthKeys(doc)) {
    if (key < from || key > to) continue;
    for (const item of liveItems(getMonth(doc, key), kind)) out.push({ key, item });
  }
  return out;
}

/** Group { key, item } entries by item name. The display name is the newest spelling. */
export function groupByName(entries) {
  const groups = new Map();
  for (const { item } of entries) {
    const k = nameKey(item.name);
    if (!k) continue;
    const g = groups.get(k) || { name: '', total: 0, count: 0 };
    g.name = item.name.trim().replace(/\s+/g, ' ');
    g.total += item.amount;
    g.count += 1;
    groups.set(k, g);
  }
  return [...groups.values()];
}

/** Names of "other" items with the largest total in the range (month keys, both ends included). */
export function topOtherNames(doc, range) {
  return groupByName(itemsOfKind(doc, 'other', range)).sort((a, b) => b.total - a.total || b.count - a.count);
}

export function nameTotalsByYear(doc, name) {
  const k = nameKey(name);
  const byYear = new Map();
  for (const { key, item } of itemsOfKind(doc, 'other')) {
    if (nameKey(item.name) !== k) continue;
    const year = Number(key.slice(0, 4));
    const row = byYear.get(year) || { year, total: 0, count: 0 };
    row.total += item.amount;
    row.count += 1;
    byYear.set(year, row);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

/** Compare year a with year b: total per month (null if the month does not exist or is after upTo) and per part. */
export function yearVsYear(doc, a, b, { upTo = '9999-99' } = {}) {
  const total = (year, m) => {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    const month = key <= upTo ? getMonth(doc, key) : null;
    return month ? monthTotals(month).total : null;
  };
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, a: total(a, i + 1), b: total(b, i + 1) }));
  const ya = yearSummary(doc, a, { upTo });
  const yb = yearSummary(doc, b, { upTo });
  const parts = Object.fromEntries(PARTS.map((p) => [p, { a: ya.parts[p], b: yb.parts[p] }]));
  return { months, parts, total: { a: ya.total, b: yb.total } };
}
