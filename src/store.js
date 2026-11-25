// Local persistence. The synced document and the device-only settings use separate keys.
// The device settings (token, passkey ID) never go to GitHub.

import { createDoc } from './model.js';

const DOC_KEY = 'expenses.doc.v1';
const DEVICE_KEY = 'expenses.device.v1';

export const DEFAULT_DEVICE = Object.freeze({
  owner: 'MojHnd',
  repo: 'expense-data',
  path: 'data.json',
  token: '',
  lockEnabled: false,
  credentialId: null,
  lastSyncAt: null,
});

export function loadDoc(storage) {
  const text = storage.getItem(DOC_KEY);
  if (!text) return createDoc();
  try {
    return JSON.parse(text);
  } catch {
    // Keep the damaged text so that it can be recovered by hand, then start empty (sync restores the data).
    storage.setItem(`${DOC_KEY}.damaged`, text);
    return createDoc();
  }
}

export function saveDoc(storage, doc) {
  storage.setItem(DOC_KEY, JSON.stringify(doc));
}

export function loadDevice(storage) {
  try {
    return { ...DEFAULT_DEVICE, ...JSON.parse(storage.getItem(DEVICE_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_DEVICE };
  }
}

export function saveDevice(storage, device) {
  storage.setItem(DEVICE_KEY, JSON.stringify(device));
}
