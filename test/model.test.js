import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDoc, monthKeyOf, addMonths, monthLabel,
  getMonth, liveMonthKeys, createMonth, deleteMonth,
  addItem, updateItem, deleteItem, liveItems, monthTotals,
  setDefaultTarget, setMonthTarget,
  liveTemplate, addTemplateItem, updateTemplateItem, deleteTemplateItem,
  openMonthKeys, applyTemplateChange, startMonthKey, fillMissingTargets,
} from '../src/model.js';

let counter = 0;
const ids = () => `id${++counter}`;
const opts = (now = 1000) => ({ now, newId: ids });

function docWithTemplate() {
  const doc = createDoc();
  addTemplateItem(doc, { name: 'Mortgage', amount: 200000 }, opts());
  addTemplateItem(doc, { name: 'Hydro', amount: 9000 }, opts());
  return doc;
}

test('monthKeyOf, addMonths and monthLabel work with YYYY-MM keys', () => {
  assert.equal(monthKeyOf(new Date(2026, 10, 25)), '2026-11');
  assert.equal(addMonths('2026-11', 1), '2026-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-03', -14), '2025-01');
  assert.equal(monthLabel('2026-11'), 'November 2026');
  assert.equal(monthLabel('2026-11', 'short'), 'Nov 2026');
});

test('createMonth copies the template into fixed items and the default target', () => {
  const doc = docWithTemplate();
  setDefaultTarget(doc, 650000, opts());
  const month = createMonth(doc, '2026-12', opts(2000));
  const fixed = liveItems(month, 'fixed');
  assert.deepEqual(fixed.map((i) => [i.name, i.amount]), [['Mortgage', 200000], ['Hydro', 9000]]);
  assert.ok(fixed.every((i) => i.templateId));
  assert.equal(month.target, 650000);
  assert.equal(month.updatedAt, 2000);
  assert.equal(getMonth(doc, '2026-12'), month);
});

test('createMonth refuses to create a month that exists', () => {
  const doc = docWithTemplate();
  createMonth(doc, '2026-12', opts());
  assert.throws(() => createMonth(doc, '2026-12', opts()), /exists/);
});

test('editing a month fixed list does not change the template', () => {
  const doc = docWithTemplate();
  createMonth(doc, '2026-12', opts());
  addItem(doc, '2026-12', { kind: 'fixed', name: 'Window cleaning', amount: 30000 }, opts());
  assert.equal(liveTemplate(doc).length, 2);
  assert.equal(liveItems(getMonth(doc, '2026-12'), 'fixed').length, 3);
});

test('monthTotals adds each part and the total', () => {
  const doc = docWithTemplate();
  createMonth(doc, '2026-11', opts());
  addItem(doc, '2026-11', { kind: 'grocery', amount: 8550, note: 'Costco', date: '2026-11-03' }, opts());
  addItem(doc, '2026-11', { kind: 'grocery', amount: 1450 }, opts());
  addItem(doc, '2026-11', { kind: 'gas', amount: 6000 }, opts());
  addItem(doc, '2026-11', { kind: 'other', name: 'Dine out', amount: 12000 }, opts());
  assert.deepEqual(monthTotals(getMonth(doc, '2026-11')), {
    fixed: 209000, grocery: 10000, gas: 6000, other: 12000, total: 237000,
  });
});

test('updateItem and deleteItem change the totals and keep a tombstone', () => {
  const doc = docWithTemplate();
  createMonth(doc, '2026-11', opts());
  const item = addItem(doc, '2026-11', { kind: 'gas', amount: 6000 }, opts());
  updateItem(doc, '2026-11', item.id, { amount: 7000 }, opts(3000));
  assert.equal(monthTotals(getMonth(doc, '2026-11')).gas, 7000);
  assert.equal(item.updatedAt, 3000);
  deleteItem(doc, '2026-11', item.id, opts(4000));
  assert.equal(monthTotals(getMonth(doc, '2026-11')).gas, 0);
  const raw = getMonth(doc, '2026-11').items.find((i) => i.id === item.id);
  assert.equal(raw.deleted, true);
  assert.equal(raw.updatedAt, 4000);
});

test('addItem rejects a wrong kind or amount', () => {
  const doc = docWithTemplate();
  createMonth(doc, '2026-11', opts());
  assert.throws(() => addItem(doc, '2026-11', { kind: 'food', amount: 1 }, opts()), /kind/);
  assert.throws(() => addItem(doc, '2026-11', { kind: 'gas', amount: 1.5 }, opts()), /amount/);
  assert.throws(() => addItem(doc, '2026-10', { kind: 'gas', amount: 100 }, opts()), /month/);
});

test('deleteMonth hides the month and creating it again starts fresh from the template', () => {
  const doc = docWithTemplate();
  createMonth(doc, '2026-11', opts());
  addItem(doc, '2026-11', { kind: 'gas', amount: 6000 }, opts());
  deleteMonth(doc, '2026-11', opts(5000));
  assert.equal(getMonth(doc, '2026-11'), null);
  assert.deepEqual(liveMonthKeys(doc), []);
  const again = createMonth(doc, '2026-11', opts(6000));
  assert.equal(again.deleted, false);
  assert.equal(monthTotals(again).gas, 0);
  assert.equal(monthTotals(again).fixed, 209000);
});

test('setMonthTarget changes only that month', () => {
  const doc = docWithTemplate();
  setDefaultTarget(doc, 650000, opts());
  createMonth(doc, '2026-11', opts());
  createMonth(doc, '2026-12', opts());
  setMonthTarget(doc, '2026-12', 700000, opts(7000));
  assert.equal(getMonth(doc, '2026-11').target, 650000);
  assert.equal(getMonth(doc, '2026-12').target, 700000);
  assert.equal(doc.settings.defaultTarget, 650000);
});

test('openMonthKeys gives the current and future months that exist', () => {
  const doc = docWithTemplate();
  for (const key of ['2026-10', '2026-11', '2026-12']) createMonth(doc, key, opts());
  assert.deepEqual(openMonthKeys(doc, '2026-11'), ['2026-11', '2026-12']);
});

test('startMonthKey gives the last month that exists, or the current month when there is none', () => {
  const doc = docWithTemplate();
  assert.equal(startMonthKey(doc, '2026-11'), '2026-11');
  for (const key of ['2026-10', '2026-12']) createMonth(doc, key, opts());
  assert.equal(startMonthKey(doc, '2026-11'), '2026-12');
  deleteMonth(doc, '2026-12', opts());
  assert.equal(startMonthKey(doc, '2026-11'), '2026-10');
});

test('fillMissingTargets gives the default target to each month that has none', () => {
  const doc = docWithTemplate();
  for (const key of ['2026-10', '2026-11']) createMonth(doc, key, opts(2000));
  setMonthTarget(doc, '2026-11', 500000, opts(3000));
  assert.equal(fillMissingTargets(doc), true);
  assert.equal(doc.settings.defaultTarget, 650000);
  assert.equal(getMonth(doc, '2026-10').target, 650000);
  assert.equal(getMonth(doc, '2026-11').target, 500000);
  // The time goes up by 1 only, so two devices make the same record and a later real change still wins.
  assert.equal(getMonth(doc, '2026-10').updatedAt, 2001);
  assert.equal(getMonth(doc, '2026-11').updatedAt, 3000);
  assert.equal(fillMissingTargets(doc), false);
});

test('fillMissingTargets uses the default target from the settings', () => {
  const doc = docWithTemplate();
  createMonth(doc, '2026-10', opts());
  setDefaultTarget(doc, 700000, opts());
  fillMissingTargets(doc);
  assert.equal(getMonth(doc, '2026-10').target, 700000);
});

test('template update can apply to open months only', () => {
  const doc = docWithTemplate();
  for (const key of ['2026-10', '2026-11', '2026-12']) createMonth(doc, key, opts());
  const hydro = liveTemplate(doc).find((t) => t.name === 'Hydro');
  updateTemplateItem(doc, hydro.id, { amount: 16000 }, opts());
  applyTemplateChange(doc, { type: 'update', item: hydro }, openMonthKeys(doc, '2026-11'), opts());
  const hydroIn = (key) => liveItems(getMonth(doc, key), 'fixed').find((i) => i.name === 'Hydro').amount;
  assert.equal(hydroIn('2026-10'), 9000);
  assert.equal(hydroIn('2026-11'), 16000);
  assert.equal(hydroIn('2026-12'), 16000);
});

test('template add and delete can apply to open months', () => {
  const doc = docWithTemplate();
  createMonth(doc, '2026-11', opts());
  const vpn = addTemplateItem(doc, { name: 'VPN', amount: 1500 }, opts());
  applyTemplateChange(doc, { type: 'add', item: vpn }, ['2026-11'], opts());
  applyTemplateChange(doc, { type: 'add', item: vpn }, ['2026-11'], opts());
  assert.equal(liveItems(getMonth(doc, '2026-11'), 'fixed').filter((i) => i.name === 'VPN').length, 1);
  deleteTemplateItem(doc, vpn.id, opts());
  applyTemplateChange(doc, { type: 'delete', item: vpn }, ['2026-11'], opts());
  assert.equal(liveItems(getMonth(doc, '2026-11'), 'fixed').some((i) => i.name === 'VPN'), false);
  assert.equal(liveTemplate(doc).some((t) => t.name === 'VPN'), false);
});

test('a month-only change to a template-linked item is kept when it is not in the open months', () => {
  const doc = docWithTemplate();
  createMonth(doc, '2026-10', opts());
  const hydro = liveTemplate(doc).find((t) => t.name === 'Hydro');
  updateTemplateItem(doc, hydro.id, { name: 'Hydro-Québec' }, opts());
  applyTemplateChange(doc, { type: 'update', item: hydro }, [], opts());
  assert.equal(liveItems(getMonth(doc, '2026-10'), 'fixed').some((i) => i.name === 'Hydro'), true);
});

test('validateDoc accepts a good document and lists the problems of a bad one', async () => {
  const { validateDoc } = await import('../src/model.js');
  const doc = docWithTemplate();
  createMonth(doc, '2026-11', opts());
  assert.deepEqual(validateDoc(doc), []);
  assert.notDeepEqual(validateDoc(null), []);
  assert.notDeepEqual(validateDoc({ version: 1, template: [], months: { '2026-11': { target: null } } }), []);
  assert.notDeepEqual(validateDoc({ version: 1, template: [], months: { nope: { items: [] } } }), []);
  const bad = structuredClone(doc);
  bad.months['2026-11'].items[0].amount = '12';
  assert.match(validateDoc(bad)[0], /2026-11/);
  const badKind = structuredClone(doc);
  badKind.months['2026-11'].items[0].kind = 'food';
  assert.equal(validateDoc(badKind).length, 1);
});
