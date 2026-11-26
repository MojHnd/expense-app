// History screen: stacked column chart over time, then all months grouped by year (the table view).

import { h, segmented } from './dom.js';
import { columnChart } from './charts.js';
import { formatMoney, formatWhole } from '../money.js';
import { monthLabel } from '../model.js';
import { monthSummaries, yearSummary, targetStatus } from '../reports.js';

export const SERIES = [
  { id: 'fixed', label: 'Fixed', color: 'var(--series-1)' },
  { id: 'grocery', label: 'Grocery', color: 'var(--series-2)' },
  { id: 'gas', label: 'Gas', color: 'var(--series-3)' },
  { id: 'other', label: 'Other', color: 'var(--series-4)' },
];

const RANGES = [['12', '12 months'], ['24', '24 months'], ['all', 'All']];
const PART_FILTERS = [['all', 'All'], ...SERIES.map((x) => [x.id, x.label])];
const TARGET_FILTERS = [['any', 'Any'], ['over', 'Over target'], ['under', 'Under target']];

/** "$265 over" or "$735 under": the month total against its target. */
const versus = (r) => (r.total > r.target ? `${formatMoney(r.total - r.target)} over` : `${formatMoney(r.target - r.total)} under`);

export function historyView(ctx) {
  const rows = monthSummaries(ctx.doc);
  if (!rows.length) {
    return { top: { title: 'History' }, content: h('p', { class: 'card empty' }, 'No months yet. Create a month on the Month tab, or import your history in Settings.') };
  }
  const range = ctx.ui.historyRange || '12';
  const part = ctx.ui.historyPart || 'all';
  const target = ctx.ui.historyTarget || 'any';
  const heading = h('h2');
  const chartBox = h('div');
  const yearsBox = h('div');
  const years = [...new Set(rows.map((r) => r.key.slice(0, 4)))].reverse();
  const draw = () => {
    const r = ctx.ui.historyRange || '12';
    const p = ctx.ui.historyPart || 'all';
    const t = ctx.ui.historyTarget || 'any';
    const series = p === 'all' ? SERIES : SERIES.filter((x) => x.id === p);
    const shown = r === 'all' ? rows : rows.slice(-Number(r));
    const groups = shown.map((row, i) => ({
      key: row.key,
      title: monthLabel(row.key),
      tick: tickFor(row.key, i, shown.length),
      bars: [series.map((x) => ({ series: x.id, value: row[x.id] }))],
      // The target is for the month total, so the chart shows it only with all the parts.
      target: p === 'all' ? row.target : null,
      dim: t !== 'any' && targetStatus(row) !== t,
      row,
    }));
    heading.textContent = p === 'all' ? 'Monthly totals' : `Monthly ${series[0].label.toLowerCase()}`;
    chartBox.replaceChildren(columnChart(groups, series, {
      label: p === 'all' ? 'Monthly totals by part' : `Monthly ${series[0].label.toLowerCase()} totals`,
      rows: (g) => series.map((x) => ({ label: x.label, value: g.row[x.id], color: x.color })).reverse(),
      total: p === 'all' ? (g) => g.row.total : undefined,
      note: (g) => (targetStatus(g.row) ? `Target ${formatMoney(g.row.target)} · ${versus(g.row)}` : ''),
      onSelect: (key) => ctx.navigate(`#/month/${key}`),
    }));
    yearsBox.replaceChildren(...years.map((y) => yearCard(ctx, Number(y), rows.filter((row) => row.key.startsWith(y)), p, t)));
  };
  draw();

  const partFilter = segmented(PART_FILTERS, part, (v) => { ctx.ui.historyPart = v; draw(); });
  partFilter.setAttribute('aria-label', 'Part');
  const rangeFilter = segmented(RANGES, range, (v) => { ctx.ui.historyRange = v; draw(); });
  rangeFilter.setAttribute('aria-label', 'Period');
  const targetFilter = segmented(TARGET_FILTERS, target, (v) => { ctx.ui.historyTarget = v; draw(); });
  targetFilter.setAttribute('aria-label', 'Target');
  return {
    top: { title: 'History' },
    content: h('div', null,
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, heading),
        h('div', { style: { marginTop: '8px' } }, rangeFilter),
        h('div', { style: { marginTop: '6px' } }, partFilter),
        h('div', { style: { marginTop: '6px' } }, targetFilter),
        chartBox),
      yearsBox),
  };
}

function tickFor(key, i, count) {
  const m = Number(key.slice(5));
  if (count <= 14) return ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][m - 1];
  return m === 1 || i === 0 ? key.slice(0, 4) : '';
}

/**
 * One year: total, average and its months. With a part selected, the amounts are for that part only.
 * With a target filter ('over' or 'under'), the list shows only the months that match.
 */
function yearCard(ctx, year, rows, part, filter) {
  const y = yearSummary(ctx.doc, year, { upTo: ctx.todayKey });
  const total = part === 'all' ? y.total : y.parts[part];
  const average = y.months ? Math.round(total / y.months) : 0;
  const shown = filter === 'any' ? rows : rows.filter((r) => targetStatus(r) === filter);
  const meta = (r) => {
    if (part !== 'all') return `Total ${formatMoney(r.total)}${filter === 'any' ? '' : ` · ${versus(r)}`}`;
    if (filter !== 'any') return `Target ${formatMoney(r.target)} · ${versus(r)}`;
    return `Fixed ${formatMoney(r.fixed)} · Grocery ${formatMoney(r.grocery)} · Gas ${formatMoney(r.gas)} · Other ${formatMoney(r.other)}`;
  };
  return h('section', { class: 'card', 'data-year': year },
    h('div', { class: 'year-head' }, h('h2', null, String(year)), h('span', { class: 'subtotal' }, formatMoney(total))),
    h('div', { class: 'stats' },
      h('span', null, 'Average ', h('strong', null, formatWhole(average)), ' / month'),
      h('span', null, h('strong', null, String(y.months)), y.months === 1 ? ' month' : ' months'),
      filter === 'any' ? null : h('span', null, h('strong', null, String(shown.length)), ` ${filter} target`)),
    y.future ? h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, `Months after this month are not in the total and average (${y.future}).`) : null,
    shown.length ? null : h('p', { class: 'small muted', style: { margin: '4px 0 0' } }, `No months ${filter} target.`),
    h('ul', { class: 'list' }, [...shown].reverse().map((r) => h('li', null,
      h('a', { class: 'item', href: `#/month/${r.key}` },
        h('span', { class: 'main' },
          h('span', { class: 'name' }, monthLabel(r.key)),
          h('span', { class: 'meta' }, meta(r))),
        h('span', { class: 'amount' }, formatMoney(part === 'all' ? r.total : r[part])))))));
}
