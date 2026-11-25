// The add/edit sheet for one month item, and the small amount sheet for targets.

import { h, openSheet, segmented, confirmSheet } from './dom.js';
import { parseAmount, formatPlain } from '../money.js';
import { suggestNames } from '../names.js';
import { monthLabel } from '../model.js';

const KIND_LABELS = [['grocery', 'Grocery'], ['gas', 'Gas'], ['other', 'Other'], ['fixed', 'Fixed']];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Open the item sheet. For a new item pass { kind }; to edit pass { item }.
 * Resolves with { action: 'save', fields } | { action: 'delete' } | undefined.
 */
export function itemSheet(doc, monthKey, { item, kind = 'other' } = {}) {
  const editing = Boolean(item);
  let current = item ? item.kind : kind;
  const today = todayIso();
  const defaultDate = today.startsWith(monthKey) ? today : '';

  return openSheet((close) => {
    const amount = h('input', {
      class: 'amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00',
      'aria-label': 'Amount', autofocus: true, value: item ? formatPlain(item.amount) : '',
    });
    const name = h('input', { type: 'text', autocomplete: 'off', enterkeyhint: 'done', value: item ? (item.kind === 'other' || item.kind === 'fixed' ? item.name : item.note || '') : '' });
    const nameLabel = h('span');
    const date = h('input', { type: 'date', value: item ? item.date || '' : defaultDate, min: `${monthKey}-01`, max: `${monthKey}-31` });
    const dateField = h('label', { class: 'field' }, h('span', null, 'Date (optional)'), date);
    const chips = h('div', { class: 'chips' });
    const error = h('p', { class: 'error', role: 'alert' });

    const needsName = () => current === 'other' || current === 'fixed';
    const refresh = () => {
      nameLabel.textContent = needsName() ? 'Name' : 'Note (optional)';
      name.placeholder = current === 'other' ? 'For example: Dine out' : current === 'fixed' ? 'For example: Snow removal' : 'For example: Costco';
      dateField.hidden = current === 'fixed';
      renderChips();
    };
    const renderChips = () => {
      const all = current === 'grocery' || current === 'gas'
        ? suggestNotes(doc, current)
        : suggestNames(doc, current);
      const q = name.value.trim().toLowerCase();
      const list = all.filter((n) => !q || (n.toLowerCase().includes(q) && n.toLowerCase() !== q)).slice(0, 10);
      chips.replaceChildren(...list.map((n) => h('button', {
        class: 'chip', type: 'button',
        onclick: () => { name.value = n; renderChips(); amount.value || amount.focus(); },
      }, n)));
    };
    name.addEventListener('input', renderChips);

    const save = () => {
      const cents = parseAmount(amount.value);
      if (cents === null) { error.textContent = 'Type an amount, for example 85 or 85.50.'; amount.focus(); return; }
      const text = name.value.trim().replace(/\s+/g, ' ');
      if (needsName() && !text) { error.textContent = 'Type a name.'; name.focus(); return; }
      const fields = { kind: current, amount: cents };
      if (needsName()) Object.assign(fields, { name: text });
      else Object.assign(fields, { name: '', note: text });
      if (current !== 'fixed') fields.date = date.value || null;
      close({ action: 'save', fields });
    };
    amount.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); needsName() && !name.value ? name.focus() : save(); } });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });

    const content = h('form', { onsubmit: (e) => { e.preventDefault(); save(); } },
      h('div', { class: 'sheet-head' },
        h('h2', null, `${editing ? 'Edit' : 'Add'} · ${monthLabel(monthKey, 'short')}`),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => close() }, '✕')),
      editing && item.kind === 'fixed' ? null : segmented(KIND_LABELS.filter(([k]) => !editing || k !== 'fixed'), current, (k) => { current = k; refresh(); }),
      h('label', { class: 'field' }, h('span', null, 'Amount ($)'), amount),
      h('label', { class: 'field' }, nameLabel, name, chips),
      dateField,
      error,
      h('div', { class: 'sheet-actions' },
        // Delete closes this sheet first; the question comes in a second sheet (see below).
        editing
          ? h('button', { class: 'btn danger', type: 'button', onclick: () => close({ action: 'ask-delete' }) }, 'Delete')
          : h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit' }, editing ? 'Save' : 'Add')),
    );
    refresh();
    return content;
  }).then(async (result) => {
    if (result?.action !== 'ask-delete') return result;
    const ok = await confirmSheet({ title: 'Delete this item?', message: `${item.name || item.note || labelOf(item.kind)} will be removed from ${monthLabel(monthKey)}.`, yes: 'Delete', danger: true });
    return ok ? { action: 'delete' } : undefined;
  });
}

function labelOf(kind) {
  return KIND_LABELS.find(([k]) => k === kind)[1];
}

/** Notes used before for grocery or gas, most used first (the import note is left out). */
function suggestNotes(doc, kind) {
  const counts = new Map();
  for (const month of Object.values(doc.months)) {
    if (month.deleted) continue;
    for (const i of month.items) {
      if (i.deleted || i.kind !== kind || !i.note || i.note === 'Imported monthly total') continue;
      counts.set(i.note, (counts.get(i.note) || 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

/**
 * A sheet that asks for one amount (target, template amount). Empty input means "no value"
 * when allowEmpty is true. Resolves with cents, null (cleared) or undefined (cancelled).
 */
export function amountSheet({ title, message, value, allowEmpty = false, yes = 'Save' }) {
  return openSheet((close) => {
    const input = h('input', { class: 'amount', type: 'text', inputmode: 'decimal', autofocus: true, value: value ? formatPlain(value) : '', 'aria-label': title });
    const error = h('p', { class: 'error', role: 'alert' });
    const save = () => {
      if (allowEmpty && !input.value.trim()) return close(null);
      const cents = parseAmount(input.value);
      if (cents === null) { error.textContent = 'Type an amount, for example 6500.'; return; }
      close(cents);
    };
    return h('form', { onsubmit: (e) => { e.preventDefault(); save(); } },
      h('div', { class: 'sheet-head' }, h('h2', null, title)),
      message ? h('p', { class: 'muted small' }, message) : null,
      h('label', { class: 'field' }, h('span', null, 'Amount ($)'), input),
      error,
      h('div', { class: 'sheet-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit' }, yes)));
  });
}

/** A sheet for one template item: name and amount. Resolves with { action, name, amount }. */
export function templateItemSheet(item) {
  return openSheet((close) => {
    const name = h('input', { type: 'text', autofocus: !item, value: item?.name || '', autocomplete: 'off' });
    const amount = h('input', { class: 'amount', type: 'text', inputmode: 'decimal', value: item ? formatPlain(item.amount) : '', autocomplete: 'off' });
    const error = h('p', { class: 'error', role: 'alert' });
    const save = () => {
      const cents = parseAmount(amount.value);
      if (!name.value.trim()) { error.textContent = 'Type a name.'; return; }
      if (cents === null) { error.textContent = 'Type an amount.'; return; }
      close({ action: 'save', name: name.value.trim(), amount: cents });
    };
    return h('form', { onsubmit: (e) => { e.preventDefault(); save(); } },
      h('div', { class: 'sheet-head' }, h('h2', null, item ? 'Edit fixed cost' : 'Add fixed cost')),
      h('label', { class: 'field' }, h('span', null, 'Name'), name),
      h('label', { class: 'field' }, h('span', null, 'Amount per month ($)'), amount),
      error,
      h('div', { class: 'sheet-actions' },
        item ? h('button', { class: 'btn danger', type: 'button', onclick: () => close({ action: 'delete' }) }, 'Delete') : h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit' }, item ? 'Save' : 'Add')));
  });
}
