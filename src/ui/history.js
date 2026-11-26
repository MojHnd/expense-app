// History screen: stacked column chart over time, then all months grouped by year (the table view).

import { h, segmented } from './dom.js';
import { columnChart } from './charts.js';
import { formatMoney, formatWhole } from '../money.js';
import { monthLabel } from '../model.js';
import { monthSummaries, yearSummary } from '../reports.js';

export const SERIES = [
  { id: 'fixed', label: 'Fixed', color: 'var(--series-1)' },
  { id: 'grocery', label: 'Grocery', color: 'var(--series-2)' },
  { id: 'gas', label: 'Gas', color: 'var(--series-3)' },
  { id: 'other', label: 'Other', color: 'var(--series-4)' },
];

const RANGES = [['12', '12 months'], ['24', '24 months'], ['all', 'All']];
const PART_FILTERS = [['all', 'All'], ...SERIES.map((x) => [x.id, x.label])];

export function historyView(ctx) {
  const rows = monthSummaries(ctx.doc);
  if (!rows.length) {
    return { top: { title: 'History' }, content: h('p', { class: 'card empty' }, 'No months yet. Create a month on the Month tab, or import your history in Settings.') };
  }
  const range = ctx.ui.historyRange || '12';
  const part = ctx.ui.historyPart || 'all';
  const heading = h('h2');
  const chartBox = h('div');
  const yearsBox = h('div');
  const years = [...new Set(rows.map((r) => r.key.slice(0, 4)))].reverse();
  const draw = () => {
    const r = ctx.ui.historyRange || '12';
    const p = ctx.ui.historyPart || 'all';
    const series = p === 'all' ? SERIES : SERIES.filter((x) => x.id === p);
    const shown = r === 'all' ? rows : rows.slice(-Number(r));
    const groups = shown.map((row, i) => ({
      key: row.key,
      title: monthLabel(row.key),
      tick: tickFor(row.key, i, shown.length),
      bars: [series.map((x) => ({ series: x.id, value: row[x.id] }))],
      row,
    }));
    heading.textContent = p === 'all' ? 'Monthly totals' : `Monthly ${series[0].label.toLowerCase()}`;
    chartBox.replaceChildren(columnChart(groups, series, {
      label: p === 'all' ? 'Monthly totals by part' : `Monthly ${series[0].label.toLowerCase()} totals`,
      rows: (g) => series.map((x) => ({ label: x.label, value: g.row[x.id], color: x.color })).reverse(),
      total: p === 'all' ? (g) => g.row.total : undefined,
      onSelect: (key) => ctx.navigate(`#/month/${key}`),
    }));
    yearsBox.replaceChildren(...years.map((y) => yearCard(ctx, Number(y), rows.filter((row) => row.key.startsWith(y)), p)));
  };
  draw();

  const partFilter = segmented(PART_FILTERS, part, (v) => { ctx.ui.historyPart = v; draw(); });
  partFilter.setAttribute('aria-label', 'Part');
  const rangeFilter = segmented(RANGES, range, (v) => { ctx.ui.historyRange = v; draw(); });
  rangeFilter.setAttribute('aria-label', 'Period');
  return {
    top: { title: 'History' },
    content: h('div', null,
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, heading),
        h('div', { style: { marginTop: '8px' } }, rangeFilter),
        h('div', { style: { marginTop: '6px' } }, partFilter),
        chartBox),
      yearsBox),
  };
}

function tickFor(key, i, count) {
  const m = Number(key.slice(5));
  if (count <= 14) return ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][m - 1];
  return m === 1 || i === 0 ? key.slice(0, 4) : '';
}

/** One year: total, average and its months. With a part selected, the amounts are for that part only. */
function yearCard(ctx, year, rows, part) {
  const y = yearSummary(ctx.doc, year, { upTo: ctx.todayKey });
  const total = part === 'all' ? y.total : y.parts[part];
  const average = y.months ? Math.round(total / y.months) : 0;
  const meta = (r) => (part === 'all'
    ? `Fixed ${formatMoney(r.fixed)} · Grocery ${formatMoney(r.grocery)} · Gas ${formatMoney(r.gas)} · Other ${formatMoney(r.other)}`
    : `Total ${formatMoney(r.total)}`);
  return h('section', { class: 'card', 'data-year': year },
    h('div', { class: 'year-head' }, h('h2', null, String(year)), h('span', { class: 'subtotal' }, formatMoney(total))),
    h('div', { class: 'stats' },
      h('span', null, 'Average ', h('strong', null, formatWhole(average)), ' / month'),
      h('span', null, h('strong', null, String(y.months)), y.months === 1 ? ' month' : ' months')),
    y.future ? h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, `Months after this month are not in the total and average (${y.future}).`) : null,
    h('ul', { class: 'list' }, [...rows].reverse().map((r) => h('li', null,
      h('a', { class: 'item', href: `#/month/${r.key}` },
        h('span', { class: 'main' },
          h('span', { class: 'name' }, monthLabel(r.key)),
          h('span', { class: 'meta' }, meta(r))),
        h('span', { class: 'amount' }, formatMoney(part === 'all' ? r.total : r[part])))))));
}
