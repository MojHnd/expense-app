// Month screen: total, target, and the four parts with their items.

import { h, confirmSheet } from './dom.js';
import { itemSheet, amountSheet } from './item-sheet.js';
import { formatMoney } from '../money.js';
import {
  getMonth, liveItems, monthTotals, monthLabel, addMonths, createMonth, deleteMonth,
  addItem, updateItem, deleteItem, setMonthTarget, liveTemplate,
} from '../model.js';

const PARTS = [
  { kind: 'fixed', label: 'Fixed', color: 'var(--series-1)' },
  { kind: 'grocery', label: 'Grocery', color: 'var(--series-2)' },
  { kind: 'gas', label: 'Gas', color: 'var(--series-3)' },
  { kind: 'other', label: 'Other', color: 'var(--series-4)' },
];

function shortDate(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`;
}

export function monthView(ctx, key) {
  const month = getMonth(ctx.doc, key);
  const picker = h('input', {
    type: 'month', value: key, 'aria-label': 'Choose month', class: 'month-picker',
    style: { position: 'absolute', opacity: 0, pointerEvents: 'none', width: '1px', height: '1px' },
    onchange: (e) => {
      const go = () => e.target.value && ctx.navigate(`#/month/${e.target.value}`);
      // iOS can send change while its picker wheel is still open: wait until the picker closes.
      if (document.activeElement === e.target) e.target.addEventListener('blur', go, { once: true });
      else go();
    },
  });
  const title = h('div', { class: 'title' },
    h('button', {
      type: 'button', 'aria-label': `${monthLabel(key)}. Choose another month`,
      onclick: () => {
        try { picker.showPicker(); } catch { picker.focus(); picker.click(); }
      },
    }, monthLabel(key), ' ▾'),
    picker);
  const top = {
    left: h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous month', onclick: () => ctx.navigate(`#/month/${addMonths(key, -1)}`) }, '‹'),
    title,
    right: h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next month', onclick: () => ctx.navigate(`#/month/${addMonths(key, 1)}`) }, '›'),
  };

  if (!month) return { top, content: createCard(ctx, key) };

  const addTo = async (kind) => {
    const result = await itemSheet(ctx.doc, key, { kind: kind || ctx.device.lastKind || 'grocery' });
    if (result?.action !== 'save') return;
    ctx.mutate((doc) => addItem(doc, key, result.fields));
    if (result.fields.kind !== 'fixed') ctx.saveDevice({ lastKind: result.fields.kind });
    ctx.toast(`Added ${formatMoney(result.fields.amount)}`);
  };
  const edit = async (item) => {
    const result = await itemSheet(ctx.doc, key, { item });
    if (result?.action === 'save') ctx.mutate((doc) => updateItem(doc, key, item.id, result.fields));
    if (result?.action === 'delete') {
      ctx.mutate((doc) => deleteItem(doc, key, item.id));
      ctx.toast('Deleted');
    }
  };

  const totals = monthTotals(month);
  return {
    top,
    content: h('div', null,
      hero(ctx, key, month, totals),
      PARTS.map((p) => partCard(ctx, key, month, p, totals[p.kind], { addTo, edit })),
      h('div', { class: 'spacer' }),
      h('button', {
        class: 'btn danger block', type: 'button',
        onclick: async () => {
          const ok = await confirmSheet({ title: `Delete ${monthLabel(key)}?`, message: 'All items of this month will be removed on all devices.', yes: 'Delete month', danger: true });
          if (ok) { ctx.mutate((doc) => deleteMonth(doc, key)); ctx.toast('Month deleted'); }
        },
      }, `Delete ${monthLabel(key)}`)),
    fab: h('button', { class: 'fab', type: 'button', 'aria-label': 'Add expense', onclick: () => addTo() }, '+'),
  };
}

function createCard(ctx, key) {
  const template = liveTemplate(ctx.doc);
  const fixed = template.reduce((s, t) => s + t.amount, 0);
  return h('div', { class: 'card', style: { textAlign: 'center', padding: '28px 16px' } },
    h('h2', null, `${monthLabel(key)} has no data yet`),
    h('p', { class: 'muted' }, template.length
      ? `Creating it copies the template: ${template.length} fixed costs, ${formatMoney(fixed)}.`
      : 'The template is empty. You can add fixed costs in Settings → Template.'),
    h('button', {
      class: 'btn primary', type: 'button',
      onclick: () => { ctx.mutate((doc) => createMonth(doc, key)); ctx.toast(`${monthLabel(key)} created`); },
    }, `Create ${monthLabel(key)}`));
}

function hero(ctx, key, month, totals) {
  const target = month.target;
  const editTarget = async () => {
    const value = await amountSheet({ title: `Target for ${monthLabel(key)}`, message: 'Leave empty for no target. The default for new months is in Settings.', value: target, allowEmpty: true });
    if (value !== undefined) ctx.mutate((doc) => setMonthTarget(doc, key, value));
  };
  let targetPart;
  if (target) {
    const left = target - totals.total;
    const pct = Math.min(100, (totals.total / target) * 100);
    targetPart = h('div', null,
      h('div', { class: `meter ${left < 0 ? 'over' : ''}`, role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': target, 'aria-valuenow': totals.total, 'aria-label': 'Spent of target' },
        h('div', { style: { width: `${pct}%` } })),
      h('button', { class: 'target-line', type: 'button', onclick: editTarget },
        'Target ', h('strong', null, formatMoney(target)), ' · ',
        left >= 0 ? h('span', { class: 'left' }, `${formatMoney(left)} left`) : h('span', { class: 'over' }, `${formatMoney(-left)} over`)));
  } else {
    targetPart = h('button', { class: 'target-line', type: 'button', onclick: editTarget }, '+ Set a target');
  }
  return h('section', { class: 'card hero', 'aria-label': 'Month total' },
    h('div', { class: 'label' }, 'Total'),
    h('div', { class: 'value', 'data-testid': 'month-total' }, formatMoney(totals.total)),
    targetPart,
    h('div', { class: 'parts' }, PARTS.map((p) => h('div', null,
      h('strong', null, formatMoney(totals[p.kind])),
      h('span', { class: 'key', style: { background: p.color } }), p.label))));
}

function itemRow(item, onClick) {
  const title = item.kind === 'other' || item.kind === 'fixed' ? item.name : (item.note || (item.kind === 'gas' ? 'Gas' : 'Grocery'));
  const meta = [shortDate(item.date), item.kind === 'fixed' && !item.templateId ? 'This month only' : ''].filter(Boolean).join(' · ');
  return h('li', null, h('button', { class: 'item', type: 'button', onclick: () => onClick(item) },
    h('span', { class: 'main' }, h('span', { class: 'name' }, title), meta ? h('span', { class: 'meta' }, meta) : null),
    h('span', { class: 'amount' }, formatMoney(item.amount))));
}

function partCard(ctx, key, month, part, subtotal, { addTo, edit }) {
  const items = liveItems(month, part.kind);
  if (part.kind !== 'fixed') items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const head = h('div', { class: 'card-head' },
    h('span', { class: 'key', style: { background: part.color } }),
    h('h2', null, part.label, part.kind === 'fixed' ? h('span', { class: 'chev', style: { marginLeft: '6px' } }, '›') : null),
    h('span', { class: 'subtotal' }, formatMoney(subtotal)));
  const list = items.length
    ? h('ul', { class: 'list' }, items.map((i) => itemRow(i, edit)))
    : h('p', { class: 'empty' }, 'No items yet.');
  const addButton = h('button', { class: 'btn ghost small', type: 'button', onclick: () => addTo(part.kind) },
    part.kind === 'fixed' ? '+ Add a cost for this month only' : `+ Add ${part.label.toLowerCase()}`);

  if (part.kind === 'fixed') {
    const details = h('details', { class: 'card fold', 'data-part': 'fixed' },
      h('summary', null, head),
      list,
      h('div', { class: 'row', style: { marginTop: '8px' } }, addButton,
        h('a', { class: 'btn ghost small none', href: '#/settings/template' }, 'Edit template')));
    details.open = Boolean(ctx.ui.fixedOpen);
    details.addEventListener('toggle', () => { ctx.ui.fixedOpen = details.open; });
    return details;
  }
  return h('section', { class: 'card', 'data-part': part.kind }, head, list, addButton);
}
