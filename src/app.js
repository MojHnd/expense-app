// Start-up, hash router, state, and the connection between the UI, storage, sync and lock.

import { h, toast, sheetIsOpen } from './ui/dom.js';
import { monthView } from './ui/month.js';
import { historyView } from './ui/history.js';
import { trendsView } from './ui/trends.js';
import { settingsView, templateView, syncStatusLine } from './ui/settings.js';
import { loadDoc, saveDoc, loadDevice, saveDevice } from './store.js';
import { monthKeyOf, startMonthKey } from './model.js';
import { mergeDocs, canonicalJson } from './merge.js';
import { syncOnce } from './sync.js';
import { lockSupported, registerPasskey, verifyPasskey, shouldRelock } from './lock.js';

const storage = window.localStorage;
const $ = (id) => document.getElementById(id);

const state = {
  doc: loadDoc(storage),
  device: loadDevice(storage),
  locked: false,
  hiddenAt: null,
  syncStatus: { state: 'idle', message: '' },
  ui: {}, // view state that must survive a re-render (open sections, selected filters)
  renderPending: false,
  lastRoute: null,
};

function persist() {
  saveDoc(storage, state.doc);
}

const ctx = {
  get doc() { return state.doc; },
  get device() { return state.device; },
  get todayKey() { return monthKeyOf(new Date()); },
  get syncStatus() { return state.syncStatus; },
  ui: state.ui,
  /** Change the document, save it, show the change and schedule a sync. */
  mutate(fn) {
    const result = fn(state.doc);
    persist();
    render();
    scheduleSync();
    return result;
  },
  setDoc(doc) {
    state.doc = doc;
    persist();
    render();
    scheduleSync(0);
  },
  saveDevice(patch) {
    state.device = { ...state.device, ...patch };
    saveDevice(storage, state.device);
    render();
  },
  navigate(hash) { location.hash = hash; },
  toast,
  runSync: () => runSync(),
  enableLock: () => enableLock(),
  disableLock: () => disableLock(),
};

// ---- Router and render ----

function route() {
  const hash = location.hash || '';
  let m = /^#\/month\/(\d{4}-(0[1-9]|1[0-2]))$/.exec(hash);
  if (m) return { tab: 'month', view: () => monthView(ctx, m[1]) };
  if (hash === '#/history') return { tab: 'history', view: () => historyView(ctx) };
  if (hash === '#/trends') return { tab: 'trends', view: () => trendsView(ctx) };
  if (hash === '#/settings') return { tab: 'settings', view: () => settingsView(ctx) };
  if (hash === '#/settings/template') return { tab: 'settings', view: () => templateView(ctx) };
  return null;
}

function render() {
  if (state.locked) return;
  const r = route();
  if (!r) {
    location.replace(`#/month/${startMonthKey(state.doc, ctx.todayKey)}`);
    return;
  }
  const sameRoute = state.lastRoute === location.hash;
  const scrollY = window.scrollY;
  const view = r.view();

  const top = view.top || {};
  const titleEl = typeof top.title === 'string' ? h('div', { class: 'title' }, h('h1', { style: { fontSize: '17px' } }, top.title)) : top.title;
  $('topbar').replaceChildren(
    top.left || h('span', { style: { width: '44px' } }),
    titleEl,
    top.right || h('span', { style: { width: '44px' } }),
    h('a', { class: 'sync-dot', href: '#/settings', 'data-state': state.syncStatus.state, title: state.syncStatus.message || 'Sync', 'aria-label': `Sync status: ${state.syncStatus.message || state.syncStatus.state}` }),
  );
  $('app').replaceChildren(installHint(), view.content, view.fab || '');
  for (const a of $('tabbar').querySelectorAll('a')) {
    if (a.dataset.tab === r.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
    if (a.dataset.tab === 'month') a.href = `#/month/${startMonthKey(state.doc, ctx.todayKey)}`;
  }
  $('tabbar').hidden = false;
  if (sameRoute) window.scrollTo(0, scrollY);
  else window.scrollTo(0, 0);
  state.lastRoute = location.hash;
  state.renderPending = false;
}

/** On an iPhone in a Safari tab: tell the user to use the Home Screen app (it has its own storage). */
function installHint() {
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (!ios || standalone || state.device.hideInstallHint) return '';
  return h('section', { class: 'card', 'data-testid': 'install-hint' },
    h('h2', null, 'Add Expenses to your Home Screen'),
    h('p', { class: 'small muted' }, 'Tap Share → Add to Home Screen, then open the app from its icon. The Home Screen app keeps its own data, so set up sync and Face ID there.'),
    h('button', { class: 'btn ghost small', type: 'button', onclick: () => ctx.saveDevice({ hideInstallHint: true }) }, 'Hide'));
}

/** Render now, or after the open sheet closes (so that a sync does not disturb a form). */
function renderSoon() {
  if (sheetIsOpen()) state.renderPending = true;
  else render();
}
$('sheet').addEventListener('close', () => { if (state.renderPending) setTimeout(render, 0); });

// ---- Sync ----

let syncTimer = null;
let syncing = false;
let syncAgain = false;

function setSyncStatus(st, message) {
  state.syncStatus = { state: st, message };
  const dot = document.querySelector('.topbar .sync-dot');
  if (dot) { dot.dataset.state = st; dot.title = message; }
  const line = document.querySelector('[data-testid="sync-status"]');
  if (line) line.replaceWith(syncStatusLine(ctx));
}

function scheduleSync(delay = 2000) {
  if (!state.device.token) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay);
}

async function runSync() {
  clearTimeout(syncTimer);
  if (state.locked) return;
  if (!state.device.token) { setSyncStatus('idle', 'Sync is not set up'); return; }
  if (syncing) { syncAgain = true; return; }
  if (!navigator.onLine) { setSyncStatus('offline', 'Offline. Changes stay on this device.'); return; }
  syncing = true;
  setSyncStatus('syncing', 'Syncing…');
  const before = canonicalJson(state.doc);
  try {
    const device = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : 'computer';
    const result = await syncOnce({ doc: state.doc, config: state.device, message: `Sync from ${device}` });
    // The user can change data while the request runs: keep those changes too.
    const changedDuring = canonicalJson(state.doc) !== before;
    const merged = changedDuring ? mergeDocs(result.doc, state.doc) : result.doc;
    const changed = canonicalJson(merged) !== canonicalJson(state.doc);
    state.doc = merged;
    persist();
    state.device = { ...state.device, lastSyncAt: Date.now() };
    saveDevice(storage, state.device);
    setSyncStatus('ok', result.pushed ? 'Synced and saved to GitHub' : 'Synced');
    // Settings has form fields that a re-render would clear; its data parts update on the next visit.
    if (changed && location.hash !== '#/settings') renderSoon();
    if (changedDuring) syncAgain = true;
  } catch (err) {
    setSyncStatus(err.code === 'offline' ? 'offline' : 'error', err.message || String(err));
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(500); }
  }
}

// ---- Lock ----

function lockNow() {
  state.locked = true;
  if (sheetIsOpen()) $('sheet').close();
  $('app').replaceChildren();
  $('topbar').replaceChildren();
  $('tabbar').hidden = true;
  $('lock').hidden = false;
}

async function tryUnlock() {
  $('lock-error').textContent = '';
  try {
    await verifyPasskey(state.device.credentialId);
    state.locked = false;
    $('lock').hidden = true;
    render();
    runSync();
  } catch (err) {
    $('lock-error').textContent = err?.name === 'NotAllowedError'
      ? 'Not unlocked. Tap Unlock to try again.'
      : `Unlock failed: ${err?.message || err}`;
  }
}
$('unlock-btn').addEventListener('click', tryUnlock);

async function enableLock() {
  try {
    const credentialId = await registerPasskey();
    ctx.saveDevice({ lockEnabled: true, credentialId });
    toast('Lock is on');
  } catch (err) {
    toast(err?.name === 'NotAllowedError' ? 'Cancelled. The lock is still off.' : `Could not make a passkey: ${err?.message || err}`);
  }
}

async function disableLock() {
  try {
    await verifyPasskey(state.device.credentialId);
    ctx.saveDevice({ lockEnabled: false, credentialId: null });
    toast('Lock is off');
  } catch {
    toast('Not verified. The lock is still on.');
  }
}

const lockActive = () => state.device.lockEnabled && state.device.credentialId && lockSupported();

// ---- Start ----

window.addEventListener('hashchange', () => {
  // For example the browser Back button while a sheet is open: the sheet belongs to the old screen.
  if (sheetIsOpen()) $('sheet').close();
  render();
});
window.addEventListener('online', () => runSync());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    state.hiddenAt = Date.now();
    return;
  }
  if (lockActive() && !state.locked && shouldRelock(state.hiddenAt, Date.now())) {
    lockNow();
    tryUnlock();
  } else if (!state.locked) {
    runSync();
  }
  state.hiddenAt = null;
});

if (lockActive()) {
  lockNow();
  tryUnlock();
} else {
  render();
  runSync();
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // A new release activates a new worker. Reload to use it, but not while a form is open.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (sheetIsOpen()) $('sheet').addEventListener('close', () => location.reload(), { once: true });
    else location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => { /* the app works without it */ });
}
navigator.storage?.persist?.();
