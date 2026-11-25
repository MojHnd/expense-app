import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDoc, saveDoc, loadDevice, saveDevice, DEFAULT_DEVICE } from '../src/store.js';
import { createDoc } from '../src/model.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('loadDoc gives a new document when storage is empty', () => {
  assert.deepEqual(loadDoc(memoryStorage()), createDoc());
});

test('saveDoc and loadDoc keep the document', () => {
  const s = memoryStorage();
  const doc = createDoc();
  doc.settings.defaultTarget = 650000;
  saveDoc(s, doc);
  assert.deepEqual(loadDoc(s), doc);
});

test('loadDoc keeps a damaged value and starts a new document', () => {
  const s = memoryStorage();
  s.setItem('expenses.doc.v1', '{not json');
  assert.deepEqual(loadDoc(s), createDoc());
  assert.equal(s.getItem('expenses.doc.v1.damaged'), '{not json');
});

test('device settings have defaults and keep saved values', () => {
  const s = memoryStorage();
  assert.deepEqual(loadDevice(s), DEFAULT_DEVICE);
  saveDevice(s, { ...DEFAULT_DEVICE, token: 'abc', lockEnabled: true });
  assert.equal(loadDevice(s).token, 'abc');
  assert.equal(loadDevice(s).repo, 'expense-data');
  assert.equal(loadDevice(s).lockEnabled, true);
});
