import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBase64Url, fromBase64Url, shouldRelock, RELOCK_AFTER_MS } from '../src/lock.js';

test('base64url helpers keep the bytes', () => {
  const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255, 62, 63]);
  const text = toBase64Url(bytes);
  assert.doesNotMatch(text, /[+/=]/);
  assert.deepEqual(fromBase64Url(text), bytes);
});

test('the app locks again only after 5 minutes in the background', () => {
  assert.equal(RELOCK_AFTER_MS, 5 * 60 * 1000);
  assert.equal(shouldRelock(null, 1_000_000), false);
  assert.equal(shouldRelock(1_000_000, 1_000_000 + RELOCK_AFTER_MS - 1), false);
  assert.equal(shouldRelock(1_000_000, 1_000_000 + RELOCK_AFTER_MS), true);
});
