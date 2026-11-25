import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatMoney, formatPlain, formatWhole } from '../src/money.js';

test('parseAmount converts dollars to integer cents', () => {
  assert.equal(parseAmount('85'), 8500);
  assert.equal(parseAmount('85.5'), 8550);
  assert.equal(parseAmount('85.50'), 8550);
  assert.equal(parseAmount('.99'), 99);
  assert.equal(parseAmount('0'), 0);
});

test('parseAmount accepts a dollar sign, spaces and thousands commas', () => {
  assert.equal(parseAmount(' $1,234.56 '), 123456);
  assert.equal(parseAmount('6,550'), 655000);
});

test('parseAmount returns null for input that is not a valid amount', () => {
  for (const bad of ['', '  ', 'abc', '1.234', '-5', '1.2.3', '12a', null, undefined]) {
    assert.equal(parseAmount(bad), null, `input ${JSON.stringify(bad)}`);
  }
});

test('formatMoney shows whole amounts without cents', () => {
  assert.equal(formatMoney(8500), '$85');
  assert.equal(formatMoney(0), '$0');
  assert.equal(formatMoney(449400), '$4,494');
});

test('formatMoney shows cents when the amount has cents', () => {
  assert.equal(formatMoney(8550), '$85.50');
  assert.equal(formatMoney(123456789), '$1,234,567.89');
  assert.equal(formatMoney(5), '$0.05');
});

test('formatMoney puts a minus sign before negative amounts', () => {
  assert.equal(formatMoney(-50000), '−$500');
});

test('formatPlain gives a value for an input field', () => {
  assert.equal(formatPlain(8500), '85');
  assert.equal(formatPlain(8550), '85.50');
  assert.equal(formatPlain(123456), '1234.56');
});

test('formatWhole rounds to whole dollars', () => {
  assert.equal(formatWhole(664275), '$6,643');
  assert.equal(formatWhole(664249), '$6,642');
  assert.equal(formatWhole(0), '$0');
});
