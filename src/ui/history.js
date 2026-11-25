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

export function historyView(ctx) {
  const rows = monthSummaries(ctx.doc);
  if (!rows.length) {
    return { top: { title: 'History' }, content: h('p', { class: 'card empty' }, 'No months yet. Create a month on the Month tab, or import your history in Settings.') };
  }
  const range = ctx.ui.historyRange || '12';
  const chartBox = h('div');
  const drawChart = () => {
    const r = ctx.ui.historyRange || '12';
    const shown = r === 'all' ? rows : rows.slice(-Number(r));
    const groups = shown.map((row, i) => ({
      key: row.key,
      title: monthLabel(row.key),
      tick: tickFor(row.key, i, shown.length),
      bars: [SERIES.map((x) => ({ series: x.id, value: row[x.id] }))],
      row,
    }));
    chartBox.replaceChildren(columnChart(groups, SERIES, {
      label: 'Monthly totals by part',
      rows: (g) => SERIES.map((x) => ({ label: x.label, value: g.row[x.id], color: x.color })).reverse(),
      total: (g) => g.row.total,
      onSelect: (key) => ctx.navigate(`#/month/${key}`),
    }));
  };
  drawChart();

  const years = [...new Set(rows.map((r) => r.key.slice(0, 4)))].reverse();
  return {
    top: { title: 'History' },
    content: h('div', null,
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h2', null, 'Monthly totals')),
        h('div', { style: { marginTop: '8px' } }, segmented(RANGES, range, (v) => { ctx.ui.historyRange = v; drawChart(); })),
        chartBox),
      years.map((y) => yearCard(ctx, Number(y), rows.filter((r) => r.key.startsWith(y))))),
  };
}

function tickFor(key, i, count) {
  const m = Number(key.slice(5));
  if (count <= 14) return ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][m - 1];
  return m === 1 || i === 0 ? key.slice(0, 4) : '';
}

function yearCard(ctx, year, rows) {
  const y = yearSummary(ctx.doc, year, { upTo: ctx.todayKey });
  return h('section', { class: 'card', 'data-year': year },
    h('div', { class: 'year-head' }, h('h2', null, String(year)), h('span', { class: 'subtotal' }, formatMoney(y.total))),
    h('div', { class: 'stats' },
      h('span', null, 'Average ', h('strong', null, formatWhole(y.average)), ' / month'),
      h('span', null, h('strong', null, String(y.months)), y.months === 1 ? ' month' : ' months')),
    y.future ? h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, `Months after this month are not in the total and average (${y.future}).`) : null,
    h('ul', { class: 'list' }, [...rows].reverse().map((r) => h('li', null,
      h('a', { class: 'item', href: `#/month/${r.key}` },
        h('span', { class: 'main' },
          h('span', { class: 'name' }, monthLabel(r.key)),
          h('span', { class: 'meta' }, `Fixed ${formatMoney(r.fixed)} · Grocery ${formatMoney(r.grocery)} · Gas ${formatMoney(r.gas)} · Other ${formatMoney(r.other)}`)),
        h('span', { class: 'amount' }, formatMoney(r.total)))))));
}
