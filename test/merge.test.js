import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDocs, canonicalJson } from '../src/merge.js';
import {
  createDoc, createMonth, addItem, updateItem, deleteItem, deleteMonth, getMonth, liveItems,
  addTemplateItem, updateTemplateItem, setDefaultTarget, setMonthTarget, monthTotals, applyTemplateChange,
} from '../src/model.js';

let n = 0;
const at = (now) => ({ now, newId: () => `id${++n}` });
const clone = (doc) => structuredClone(doc);

function base() {
  const doc = createDoc();
  addTemplateItem(doc, { name: 'Mortgage', amount: 200000 }, at(100));
  createMonth(doc, '2026-11', at(100));
  return doc;
}

test('items added on two devices are both kept', () => {
  const phone = base();
  const pc = clone(phone);
  addItem(phone, '2026-11', { kind: 'gas', amount: 6000 }, at(200));
  addItem(pc, '2026-11', { kind: 'grocery', amount: 8000 }, at(300));
  const merged = mergeDocs(phone, pc);
  const t = monthTotals(getMonth(merged, '2026-11'));
  assert.equal(t.gas, 6000);
  assert.equal(t.grocery, 8000);
});

test('the newer edit of the same item wins, in both merge directions', () => {
  const phone = base();
  const item = addItem(phone, '2026-11', { kind: 'gas', amount: 6000 }, at(200));
  const pc = clone(phone);
  updateItem(phone, '2026-11', item.id, { amount: 7000 }, at(400));
  updateItem(pc, '2026-11', item.id, { amount: 9000 }, at(300));
  assert.equal(monthTotals(getMonth(mergeDocs(phone, pc), '2026-11')).gas, 7000);
  assert.equal(monthTotals(getMonth(mergeDocs(pc, phone), '2026-11')).gas, 7000);
});

test('a deletion on one device removes the item after merge', () => {
  const phone = base();
  const item = addItem(phone, '2026-11', { kind: 'gas', amount: 6000 }, at(200));
  const pc = clone(phone);
  deleteItem(pc, '2026-11', item.id, at(300));
  assert.equal(monthTotals(getMonth(mergeDocs(phone, pc), '2026-11')).gas, 0);
});

test('a month that exists on one device only is kept', () => {
  const phone = base();
  const pc = clone(phone);
  createMonth(pc, '2026-12', at(300));
  const merged = mergeDocs(phone, pc);
  assert.ok(getMonth(merged, '2026-12'));
  assert.equal(liveItems(getMonth(merged, '2026-12'), 'fixed').length, 1);
});

test('a deleted month stays deleted unless it is created again later', () => {
  const phone = base();
  const pc = clone(phone);
  deleteMonth(pc, '2026-11', at(300));
  assert.equal(getMonth(mergeDocs(phone, pc), '2026-11'), null);
});

test('month target, settings and template use the newer value', () => {
  const phone = base();
  const pc = clone(phone);
  setMonthTarget(phone, '2026-11', 600000, at(500));
  setDefaultTarget(pc, 700000, at(600));
  updateTemplateItem(pc, phone.template[0].id, { amount: 230000 }, at(700));
  const merged = mergeDocs(phone, pc);
  assert.equal(getMonth(merged, '2026-11').target, 600000);
  assert.equal(merged.settings.defaultTarget, 700000);
  assert.equal(merged.template[0].amount, 230000);
});

test('merge does not change its inputs', () => {
  const phone = base();
  const pc = clone(phone);
  addItem(pc, '2026-11', { kind: 'gas', amount: 6000 }, at(200));
  const before = canonicalJson(phone);
  mergeDocs(phone, pc);
  assert.equal(canonicalJson(phone), before);
});

test('merging a doc with itself or a copy gives the same canonical JSON', () => {
  const phone = base();
  addItem(phone, '2026-11', { kind: 'gas', amount: 6000 }, at(200));
  assert.equal(canonicalJson(mergeDocs(phone, clone(phone))), canonicalJson(phone));
});

test('canonicalJson does not depend on key order', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: 2, c: 3 } }), canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
});

test('merge with an empty document gives the other document', () => {
  const phone = base();
  assert.equal(canonicalJson(mergeDocs(createDoc(), phone)), canonicalJson(phone));
  assert.equal(canonicalJson(mergeDocs(phone, null)), canonicalJson(phone));
});

test('two devices that create the same month do not double the fixed costs', () => {
  const phone = createDoc();
  addTemplateItem(phone, { name: 'Rent', amount: 150000 }, at(100));
  const pc = clone(phone);
  createMonth(phone, '2026-12', at(200));
  createMonth(pc, '2026-12', at(300));
  assert.equal(monthTotals(getMonth(mergeDocs(phone, pc), '2026-12')).fixed, 150000);
});

test('two devices that apply the same template add do not make two items', () => {
  const phone = base();
  const t = addTemplateItem(phone, { name: 'VPN', amount: 1500 }, at(150));
  const pc = clone(phone);
  applyTemplateChange(phone, { type: 'add', item: t }, ['2026-11'], at(200));
  applyTemplateChange(pc, { type: 'add', item: t }, ['2026-11'], at(300));
  const merged = mergeDocs(phone, pc);
  assert.equal(liveItems(getMonth(merged, '2026-11'), 'fixed').filter((i) => i.name === 'VPN').length, 1);
});

test('an item added on one device after the other device deleted the month keeps the month', () => {
  const phone = base();
  const pc = clone(phone);
  deleteMonth(phone, '2026-11', at(300));
  addItem(pc, '2026-11', { kind: 'gas', amount: 4000 }, at(400));
  const merged = mergeDocs(phone, pc);
  assert.ok(getMonth(merged, '2026-11'));
  assert.equal(monthTotals(getMonth(merged, '2026-11')).gas, 4000);
});
