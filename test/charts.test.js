import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niceTicks } from '../src/ui/charts.js';

test('niceTicks gives clean steps that cover the maximum', () => {
  assert.deepEqual(niceTicks(877400), [0, 250000, 500000, 750000, 1000000]);
  assert.deepEqual(niceTicks(400000), [0, 100000, 200000, 300000, 400000]);
  assert.deepEqual(niceTicks(0), [0]);
  const t = niceTicks(123);
  assert.ok(t.at(-1) >= 123);
});
