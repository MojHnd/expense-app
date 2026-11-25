import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDoc, createMonth, addItem, addTemplateItem } from '../src/model.js';
import {
  monthSummaries, yearsOf, yearSummary, topOtherNames, nameTotalsByYear, yearVsYear, nameKey,
} from '../src/reports.js';
import { suggestNames } from '../src/names.js';

let n = 0;
const o = { now: 1, newId: () => `id${++n}` };

function sample() {
  const doc = createDoc();
  addTemplateItem(doc, { name: 'Mortgage', amount: 100000 }, o);
  const add = (key, kind, amount, name) => addItem(doc, key, { kind, amount, name }, o);
  createMonth(doc, '2025-11', o);
  add('2025-11', 'grocery', 30000);
  add('2025-11', 'other', 5000, 'Dine out');
  createMonth(doc, '2026-10', o);
  add('2026-10', 'gas', 7000);
  add('2026-10', 'other', 31000, 'dine out ');
  add('2026-10', 'other', 13500, 'Amazon');
  createMonth(doc, '2026-11', o);
  add('2026-11', 'other', 12000, 'Dine Out');
  add('2026-11', 'other', 10000, 'Amazon');
  add('2026-11', 'other', 240000, 'Car inspection');
  return doc;
}

test('monthSummaries lists live months in order with totals and target', () => {
  const rows = monthSummaries(sample());
  assert.deepEqual(rows.map((r) => r.key), ['2025-11', '2026-10', '2026-11']);
  assert.deepEqual(rows[0], { key: '2025-11', fixed: 100000, grocery: 30000, gas: 0, other: 5000, total: 135000, target: null });
});

test('yearsOf and yearSummary give the year total and the monthly average', () => {
  const doc = sample();
  assert.deepEqual(yearsOf(doc), [2025, 2026]);
  const y = yearSummary(doc, 2026);
  assert.equal(y.months, 2);
  assert.equal(y.total, 151500 + 362000);
  assert.equal(y.average, Math.round((151500 + 362000) / 2));
  assert.equal(y.parts.other, 31000 + 13500 + 12000 + 10000 + 240000);
});

test('nameKey ignores case and extra spaces', () => {
  assert.equal(nameKey('  Dine   Out '), 'dine out');
});

test('topOtherNames groups names without case and sorts by total', () => {
  const top = topOtherNames(sample(), { from: '2026-01', to: '2026-12' });
  assert.deepEqual(top.map((r) => [r.name, r.total, r.count]), [
    ['Car inspection', 240000, 1],
    ['Dine Out', 43000, 2],
    ['Amazon', 23500, 2],
  ]);
});

test('topOtherNames with no range uses all months', () => {
  const top = topOtherNames(sample());
  assert.equal(top.find((r) => r.name === 'Dine Out').total, 48000);
});

test('nameTotalsByYear gives the total of one name in each year', () => {
  assert.deepEqual(nameTotalsByYear(sample(), 'dine out'), [
    { year: 2025, total: 5000, count: 1 },
    { year: 2026, total: 43000, count: 2 },
  ]);
});

test('yearVsYear compares months and parts of two years', () => {
  const cmp = yearVsYear(sample(), 2025, 2026);
  assert.equal(cmp.months.length, 12);
  assert.deepEqual(cmp.months[10], { month: 11, a: 135000, b: 362000 });
  assert.deepEqual(cmp.months[0], { month: 1, a: null, b: null });
  assert.deepEqual(cmp.parts.grocery, { a: 30000, b: 0 });
  assert.deepEqual(cmp.total, { a: 135000, b: 513500 });
});

test('suggestNames lists the most used names first, one spelling each', () => {
  assert.deepEqual(suggestNames(sample(), 'other'), ['Dine Out', 'Amazon', 'Car inspection']);
});

test('yearSummary with upTo leaves out later months (months started early)', () => {
  const doc = sample();
  createMonth(doc, '2026-12', o);
  const y = yearSummary(doc, 2026, { upTo: '2026-11' });
  assert.equal(y.months, 2);
  assert.equal(y.total, 151500 + 362000);
  assert.equal(y.future, 1);
  assert.equal(yearSummary(doc, 2026).months, 3);
});

test('yearVsYear with upTo leaves out later months', () => {
  const doc = sample();
  createMonth(doc, '2026-12', o);
  const cmp = yearVsYear(doc, 2025, 2026, { upTo: '2026-11' });
  assert.equal(cmp.months[11].b, null);
  assert.deepEqual(cmp.total, { a: 135000, b: 513500 });
});
