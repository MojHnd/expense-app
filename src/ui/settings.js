// Settings screen and the template editor.

import { h, confirmSheet } from './dom.js';
import { amountSheet, templateItemSheet } from './item-sheet.js';
import { formatMoney } from '../money.js';
import {
  liveTemplate, addTemplateItem, updateTemplateItem, deleteTemplateItem,
  openMonthKeys, applyTemplateChange, setDefaultTarget, monthLabel, liveMonthKeys, validateDoc,
} from '../model.js';
import { mergeDocs } from '../merge.js';
import { serialize } from '../sync.js';
import { lockSupported } from '../lock.js';

export const APP_VERSION = '1.0.0';

function listOfMonths(keys) {
  const labels = keys.map((k) => monthLabel(k));
  return labels.length <= 2 ? labels.join(' and ') : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

/** After a template change: ask if it must also apply to the current and future months that exist. */
async function offerToOpenMonths(ctx, change, verb) {
  const open = openMonthKeys(ctx.doc, ctx.todayKey);
  if (!open.length) return;
  const ok = await confirmSheet({
    title: `Also ${verb} in open months?`,
    message: `Apply this change to ${listOfMonths(open)}? Past months do not change.`,
    yes: 'Apply', no: 'Only new months',
  });
  if (ok) {
    ctx.mutate((doc) => applyTemplateChange(doc, change, open));
    ctx.toast(`Applied to ${open.length} ${open.length === 1 ? 'month' : 'months'}`);
  }
}

export function templateView(ctx) {
  const items = liveTemplate(ctx.doc);
  const total = items.reduce((s, t) => s + t.amount, 0);
  const add = async () => {
    const r = await templateItemSheet(null);
    if (r?.action !== 'save') return;
    let item;
    ctx.mutate((doc) => { item = addTemplateItem(doc, { name: r.name, amount: r.amount }); });
    await offerToOpenMonths(ctx, { type: 'add', item }, 'add it');
  };
  const edit = async (t) => {
    const r = await templateItemSheet(t);
    if (r?.action === 'save') {
      let item;
      ctx.mutate((doc) => { item = updateTemplateItem(doc, t.id, { name: r.name, amount: r.amount }); });
      await offerToOpenMonths(ctx, { type: 'update', item }, 'change it');
    } else if (r?.action === 'delete') {
      const ok = await confirmSheet({ title: `Delete ${t.name} from the template?`, yes: 'Delete', danger: true });
      if (!ok) return;
      ctx.mutate((doc) => deleteTemplateItem(doc, t.id));
      await offerToOpenMonths(ctx, { type: 'delete', item: t }, 'remove it');
    }
  };
  return {
    top: {
      left: h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Back to settings', style: { display: 'grid', placeItems: 'center', textDecoration: 'none' } }, '‹'),
      title: 'Template',
    },
    content: h('div', null,
      h('p', { class: 'muted small' }, 'New months copy these fixed costs. To change one month only, edit the fixed list in that month.'),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Fixed costs'), h('span', { class: 'subtotal' }, formatMoney(total))),
        items.length ? h('ul', { class: 'list' }, items.map((t) => h('li', null,
          h('button', { class: 'item', type: 'button', onclick: () => edit(t) },
            h('span', { class: 'main' }, h('span', { class: 'name' }, t.name)),
            h('span', { class: 'amount' }, formatMoney(t.amount)))))) : h('p', { class: 'empty' }, 'No fixed costs yet.'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: add }, '+ Add fixed cost'))),
  };
}

function syncCard(ctx) {
  const d = ctx.device;
  const owner = h('input', { type: 'text', value: d.owner, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const repo = h('input', { type: 'text', value: d.repo, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const path = h('input', { type: 'text', value: d.path, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const token = h('input', { type: 'password', value: d.token, autocomplete: 'off', placeholder: 'github_pat_…', spellcheck: 'false' });
  return h('section', { class: 'card', id: 'sync' },
    h('div', { class: 'card-head' }, h('h2', null, 'Sync with GitHub')),
    syncStatusLine(ctx),
    h('div', { class: 'row' },
      h('label', { class: 'field' }, h('span', null, 'Owner'), owner),
      h('label', { class: 'field' }, h('span', null, 'Private repo'), repo)),
    h('label', { class: 'field' }, h('span', null, 'File'), path),
    h('label', { class: 'field' }, h('span', null, 'Token (kept only on this device)'), token),
    h('div', { class: 'row' },
      h('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          ctx.saveDevice({ owner: owner.value.trim(), repo: repo.value.trim(), path: path.value.trim() || 'data.json', token: token.value.trim() });
          ctx.toast('Sync settings saved');
          ctx.runSync();
        },
      }, 'Save'),
      h('button', { class: 'btn primary', type: 'button', disabled: !d.token, onclick: () => ctx.runSync() }, 'Sync now')),
    h('details', { class: 'help', style: { marginTop: '10px' } },
      h('summary', null, 'How to make a token'),
      h('ol', null,
        h('li', null, 'On GitHub, open Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.'),
        h('li', null, `Repository access: "Only select repositories" → ${d.repo || 'expense-data'}.`),
        h('li', null, 'Permissions → Repository → Contents: "Read and write".'),
        h('li', null, 'Generate the token, copy it, paste it here, and tap Save. Do the same on each device (or use the same token).'))));
}

/** The sync status line. app.js replaces it in place, so that a sync does not clear the form fields. */
export function syncStatusLine(ctx) {
  const d = ctx.device;
  const status = ctx.syncStatus;
  const last = d.lastSyncAt ? new Date(d.lastSyncAt).toLocaleString() : 'never';
  return h('p', { class: 'status-line', 'data-testid': 'sync-status' },
    h('span', { class: 'sync-dot', 'data-state': status.state, style: { display: 'inline-block', marginRight: '6px' } }),
    status.message || (d.token ? 'Ready' : 'Not set up'), h('span', { class: 'muted small' }, ` · last sync: ${last}`));
}

function lockCard(ctx) {
  const d = ctx.device;
  if (!lockSupported()) {
    return h('section', { class: 'card' }, h('h2', null, 'Lock'), h('p', { class: 'muted small' }, 'This browser does not support passkeys.'));
  }
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Lock with Face ID / Windows Hello')),
    h('p', { class: 'muted small' }, d.lockEnabled
      ? 'On. The app asks for Face ID or Windows Hello when it opens, and again after 5 minutes in the background.'
      : 'Off. Turn it on to protect the app on this device. Each device has its own passkey.'),
    h('button', {
      class: `btn ${d.lockEnabled ? 'danger' : 'primary'}`, type: 'button',
      onclick: () => (d.lockEnabled ? ctx.disableLock() : ctx.enableLock()),
    }, d.lockEnabled ? 'Turn lock off' : 'Turn lock on'));
}

function dataCard(ctx) {
  const file = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      let imported;
      try {
        imported = JSON.parse(await f.text());
      } catch {
        ctx.toast('This file is not JSON.');
        return;
      }
      const problems = validateDoc(imported);
      if (problems.length) {
        ctx.toast(`This file is not an Expenses backup: ${problems[0]}`);
        return;
      }
      const count = Object.values(imported.months).filter((m) => !m.deleted).length;
      const ok = await confirmSheet({
        title: `Import ${count} months?`,
        message: 'The file is merged with your data. For records that are in both, the newer change wins. Nothing is deleted unless the file deletes it.',
        yes: 'Import',
      });
      if (!ok) return;
      ctx.setDoc(mergeDocs(ctx.doc, imported));
      ctx.toast(`Imported. You now have ${liveMonthKeys(ctx.doc).length} months.`);
    },
  });
  const exportData = async () => {
    const name = `expenses-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([serialize(ctx.doc)], { type: 'application/json' });
    const shareFile = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [shareFile] }) && /iPhone|iPad/.test(navigator.userAgent)) {
      try { await navigator.share({ files: [shareFile], title: name }); return; } catch (err) { if (err.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Backup')),
    h('p', { class: 'muted small' }, 'The GitHub repo keeps every version of your data. You can also save a file.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: exportData }, 'Export JSON'),
      h('button', { class: 'btn', type: 'button', onclick: () => file.click() }, 'Import JSON')),
    file);
}

export function settingsView(ctx) {
  const target = ctx.doc.settings.defaultTarget;
  const template = liveTemplate(ctx.doc);
  return {
    top: { title: 'Settings' },
    content: h('div', null,
      h('section', { class: 'card' },
        h('ul', { class: 'list', style: { margin: '-8px -14px' } },
          h('li', null, h('button', {
            class: 'item', type: 'button',
            onclick: async () => {
              const v = await amountSheet({ title: 'Default monthly target', message: 'New months copy this target. Leave empty for no target.', value: target, allowEmpty: true });
              if (v !== undefined) { ctx.mutate((doc) => setDefaultTarget(doc, v)); ctx.toast('Default target saved'); }
            },
          }, h('span', { class: 'main' }, h('span', { class: 'name' }, 'Default monthly target'), h('span', { class: 'meta' }, 'New months copy it')),
          h('span', { class: 'amount' }, target ? formatMoney(target) : 'None'))),
          h('li', null, h('a', { class: 'item', href: '#/settings/template' },
            h('span', { class: 'main' }, h('span', { class: 'name' }, 'Template'), h('span', { class: 'meta' }, `${template.length} fixed costs`)),
            h('span', { class: 'amount' }, `${formatMoney(template.reduce((s, t) => s + t.amount, 0))} ›`))))),
      syncCard(ctx),
      lockCard(ctx),
      dataCard(ctx),
      h('p', { class: 'small muted', style: { textAlign: 'center' } }, `Expenses ${APP_VERSION} · data stays on your devices and in your private repo`)),
  };
}
