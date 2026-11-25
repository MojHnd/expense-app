// Tests for the history importer. All data here is made up; the real notes are private.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItemLine, parseMonthLabel, parseNotes, buildDoc } from '../tools/history.mjs';
import { getMonth, liveItems, monthTotals, liveTemplate } from '../src/model.js';
import { canonicalJson } from '../src/merge.js';

const SAMPLE_A = `[  ] Jan. 2030;
100    Rent
20      Phone
30      phone
= 999

[  ] Grocery
Grocery       \t200
Gas                    50

[  ] Other
70 dine out
X 15
10+5 cup+plate
= 1

[  ] Total: 9,999
++++++++++++++++++
[  ] Jan. 2030;
100    Rent
20      Phone
30      phone
= 150

[  ] Grocery
Grocery              0
Gas                     40

[  ] Other
25 Dine Out
12 cloths

[  ] Total:265
`;

const SAMPLE_B = `[  ] Auguste 2029:
90    Rent
= 90

[  ] Grocery
Grocery              10
Gas                     0

[  ] Other
5 Dine out

[  ] Total: 105
+++++++++++++++
[  ] Nov. 2029;
90    Rent
= 90

[  ] Grocery
Grocery              10
Gas                     0

[  ] Other

[  ] Total: 100
`;

const files = { 'a.md': parseNotes(SAMPLE_A), 'b.md': parseNotes(SAMPLE_B) };
const corrections = {
  blocks: [
    { file: 'a.md', index: 0, month: '2030-01', merge: true },
    { file: 'a.md', index: 1, month: '2030-01', merge: true },
    { file: 'b.md', index: 1, month: '2029-09' },
  ],
  templateFrom: '2030-01',
  names: { cloths: 'Clothes' },
  fixedNames: { phone: 'Phone 2' },
};
const IMPORT_TIME = 1_000;

test('parseItemLine reads amount-first and name-first lines', () => {
  assert.deepEqual(parseItemLine('33 Dine out'), [{ name: 'Dine out', amount: 3300 }]);
  assert.deepEqual(parseItemLine('Y 42'), [{ name: 'Y', amount: 4200 }]);
  assert.deepEqual(parseItemLine('80 kettle '), [{ name: 'kettle', amount: 8000 }]);
});

test('parseItemLine splits "a+b name+name" into two items', () => {
  assert.deepEqual(parseItemLine('40+25 lamp+shade'), [{ name: 'lamp', amount: 4000 }, { name: 'shade', amount: 2500 }]);
});

test('parseItemLine keeps one item when only the name has a plus sign or the counts differ', () => {
  assert.deepEqual(parseItemLine('50 Shop: pens+paper'), [{ name: 'Shop: pens+paper', amount: 5000 }]);
  assert.deepEqual(parseItemLine('10+20 gifts'), [{ name: 'gifts', amount: 3000 }]);
});

test('parseItemLine returns null for lines that are not items', () => {
  assert.equal(parseItemLine('= 999'), null);
  assert.equal(parseItemLine(''), null);
  assert.equal(parseItemLine('+++++'), null);
});

test('parseMonthLabel reads the month names used in the notes', () => {
  assert.equal(parseMonthLabel('Auguste 2022:'), '2022-08');
  assert.equal(parseMonthLabel('June. 2026;'), '2026-06');
  assert.equal(parseMonthLabel('April 2022;'), '2022-04');
  assert.equal(parseMonthLabel('Dec. 2026;'), '2026-12');
  assert.equal(parseMonthLabel('Grocery'), null);
});

test('parseNotes reads each block with its parts and the written totals', () => {
  const [first, second] = parseNotes(SAMPLE_A);
  assert.equal(first.label, 'Jan. 2030;');
  assert.equal(first.month, '2030-01');
  assert.deepEqual(first.fixed, [{ name: 'Rent', amount: 10000 }, { name: 'Phone', amount: 2000 }, { name: 'phone', amount: 3000 }]);
  assert.equal(first.grocery, 20000);
  assert.equal(first.gas, 5000);
  assert.equal(first.other.length, 4);
  assert.equal(first.writtenFixed, 99900);
  assert.equal(first.writtenTotal, 999900);
  assert.equal(second.writtenTotal, 26500);
  assert.equal(second.grocery, 0);
});

test('buildDoc applies month corrections and merges blocks of the same month', () => {
  const { doc } = buildDoc(files, corrections, IMPORT_TIME);
  assert.deepEqual(Object.keys(doc.months).sort(), ['2029-08', '2029-09', '2030-01']);
  const jan = getMonth(doc, '2030-01');
  const t = monthTotals(jan);
  assert.equal(t.fixed, 15000);
  assert.equal(t.grocery, 20000);
  assert.equal(t.gas, 9000);
  assert.equal(t.other, 7000 + 1500 + 1000 + 500 + 2500 + 1200);
});

test('buildDoc refuses two blocks for one month without a merge correction', () => {
  const bad = { ...corrections, blocks: corrections.blocks.filter((c) => c.file !== 'a.md') };
  assert.throws(() => buildDoc(files, bad, IMPORT_TIME), /2030-01/);
});

test('buildDoc can drop a block', () => {
  const drop = { ...corrections, blocks: [...corrections.blocks, { file: 'b.md', index: 0, drop: true }] };
  assert.equal(buildDoc(files, drop, IMPORT_TIME).doc.months['2029-08'], undefined);
});

test('buildDoc imports grocery and gas totals as one entry each and skips zero', () => {
  const { doc } = buildDoc(files, corrections, IMPORT_TIME);
  const sep = getMonth(doc, '2029-09');
  assert.equal(liveItems(sep, 'grocery').length, 1);
  assert.equal(liveItems(sep, 'grocery')[0].note, 'Imported monthly total');
  assert.equal(liveItems(sep, 'gas').length, 0);
});

test('buildDoc normalizes names: corrections, capital letter, and the most used spelling', () => {
  const { doc } = buildDoc(files, corrections, IMPORT_TIME);
  const names = liveItems(getMonth(doc, '2030-01'), 'other').map((i) => i.name);
  assert.deepEqual(names, ['Dine out', 'X', 'Cup', 'Plate', 'Dine out', 'Clothes']);
  const fixed = liveItems(getMonth(doc, '2030-01'), 'fixed').map((i) => i.name);
  assert.deepEqual(fixed, ['Rent', 'Phone', 'Phone 2']);
});

test('buildDoc makes the template from one month and links fixed items to it', () => {
  const { doc } = buildDoc(files, corrections, IMPORT_TIME);
  assert.deepEqual(liveTemplate(doc).map((t) => [t.name, t.amount]), [['Rent', 10000], ['Phone', 2000], ['Phone 2', 3000]]);
  const rentId = liveTemplate(doc)[0].id;
  assert.equal(liveItems(getMonth(doc, '2029-08'), 'fixed')[0].templateId, rentId);
});

test('buildDoc gives the same result each time (stable IDs and times)', () => {
  assert.equal(canonicalJson(buildDoc(files, corrections, IMPORT_TIME).doc), canonicalJson(buildDoc(files, corrections, IMPORT_TIME).doc));
});

test('buildDoc reports months where the written total is wrong', () => {
  const { report } = buildDoc(files, corrections, IMPORT_TIME);
  const aug = report.find((r) => r.month === '2029-08');
  assert.equal(aug.writtenTotal, 10500);
  assert.equal(aug.total, 10500);
  const jan = report.find((r) => r.month === '2030-01');
  assert.equal(jan.blocks, 2);
  assert.equal(jan.total, 15000 + 20000 + 9000 + 13700);
});
