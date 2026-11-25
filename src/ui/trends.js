// Trends screen: top "Other" names for a period, and year vs year.

import { h } from './dom.js';
import { columnChart, hbarList } from './charts.js';
import { formatMoney, formatWhole } from '../money.js';
import { addMonths } from '../model.js';
import { topOtherNames, nameTotalsByYear, yearVsYear, yearsOf, yearSummary } from '../reports.js';

const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function periods(ctx) {
  const list = [
    { id: '12m', label: 'Last 12 months', range: { from: addMonths(ctx.todayKey, -11), to: ctx.todayKey } },
  ];
  for (const y of [...yearsOf(ctx.doc)].reverse()) list.push({ id: String(y), label: String(y), range: { from: `${y}-01`, to: `${y}-12` } });
  list.push({ id: 'all', label: 'All time', range: undefined });
  return list;
}

function select(options, value, onChange, label) {
  return h('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value) },
    options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)));
}

export function trendsView(ctx) {
  const years = yearsOf(ctx.doc);
  if (!years.length) return { top: { title: 'Trends' }, content: h('p', { class: 'card empty' }, 'No data yet.') };
  return {
    top: { title: 'Trends' },
    content: h('div', null, topNamesCard(ctx), yearVsYearCard(ctx, years)),
  };
}

function topNamesCard(ctx) {
  const list = periods(ctx);
  const box = h('div');
  const draw = () => {
    const period = list.find((p) => p.id === ctx.ui.trendPeriod) || list[0];
    const all = topOtherNames(ctx.doc, period.range);
    const shown = ctx.ui.trendShowAll ? all : all.slice(0, 15);
    const total = all.reduce((s, r) => s + r.total, 0);
    box.replaceChildren(
      h('p', { class: 'small muted' }, `${all.length} names · ${formatMoney(total)} in "Other" · tap a name to see it per year`),
      hbarList(shown.map((r) => ({ id: r.name, label: r.name, value: r.total, meta: r.count > 1 ? `${r.count} times` : null })), {
        selected: ctx.ui.trendName,
        onSelect: (id) => { ctx.ui.trendName = ctx.ui.trendName === id ? null : id; draw(); },
        detail: (r) => nameDetail(ctx, r.id),
      }),
      all.length > 15 ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => { ctx.ui.trendShowAll = !ctx.ui.trendShowAll; draw(); } },
        ctx.ui.trendShowAll ? 'Show top 15' : `Show all ${all.length}`) : null,
    );
  };
  draw();
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Top "Other" names')),
    h('div', { style: { marginTop: '8px' } }, select(list.map((p) => [p.id, p.label]), ctx.ui.trendPeriod || list[0].id, (v) => { ctx.ui.trendPeriod = v; draw(); }, 'Period')),
    box);
}

function nameDetail(ctx, name) {
  const rows = nameTotalsByYear(ctx.doc, name);
  return h('div', { class: 'detail' },
    h('table', { class: 'data' },
      h('thead', null, h('tr', null, h('th', null, 'Year'), h('th', null, 'Times'), h('th', null, 'Total'), h('th', null, 'Per month'))),
      h('tbody', null, rows.map((r) => {
        const months = yearSummary(ctx.doc, r.year, { upTo: ctx.todayKey }).months || 1;
        return h('tr', null, h('td', null, String(r.year)), h('td', null, String(r.count)), h('td', null, formatMoney(r.total)), h('td', null, formatWhole(Math.round(r.total / months))));
      }))));
}

function change(a, b) {
  if (!a) return h('td', { class: 'muted' }, '—');
  const pct = Math.round(((b - a) / a) * 100);
  return h('td', { class: pct > 0 ? 'up' : pct < 0 ? 'down' : '' }, `${pct > 0 ? '+' : ''}${pct}%`);
}

function yearVsYearCard(ctx, years) {
  const box = h('div');
  const latest = years.at(-1);
  const current = Number(ctx.todayKey.slice(0, 4));
  const defaultB = years.includes(current) ? current : latest;
  const defaultA = years.includes(defaultB - 1) ? defaultB - 1 : years[0];
  const draw = () => {
    const a = ctx.ui.yearA ?? defaultA;
    const b = ctx.ui.yearB ?? defaultB;
    const cmp = yearVsYear(ctx.doc, a, b, { upTo: ctx.todayKey });
    const series = [
      { id: 'a', label: String(a), color: 'var(--series-1)' },
      { id: 'b', label: String(b), color: 'var(--series-2)' },
    ];
    const groups = cmp.months.map((m) => ({
      key: String(m.month),
      title: MONTH_NAMES[m.month - 1],
      tick: MONTH_INITIALS[m.month - 1],
      bars: [[{ series: 'a', value: m.a || 0 }], [{ series: 'b', value: m.b || 0 }]],
      m,
    }));
    const ya = yearSummary(ctx.doc, a, { upTo: ctx.todayKey });
    const yb = yearSummary(ctx.doc, b, { upTo: ctx.todayKey });
    const row = (label, va, vb, cls, fmt = formatMoney) => h('tr', { class: cls }, h('td', null, label), h('td', null, fmt(va)), h('td', null, fmt(vb)), change(va, vb));
    box.replaceChildren(
      columnChart(groups, series, {
        label: `Monthly totals ${a} and ${b}`,
        rows: (g) => [{ label: String(a), value: g.m.a, color: series[0].color }, { label: String(b), value: g.m.b, color: series[1].color }],
      }),
      h('table', { class: 'data' },
        h('thead', null, h('tr', null, h('th', null, ''), h('th', null, String(a)), h('th', null, String(b)), h('th', null, 'Change'))),
        h('tbody', null,
          row('Fixed', cmp.parts.fixed.a, cmp.parts.fixed.b),
          row('Grocery', cmp.parts.grocery.a, cmp.parts.grocery.b),
          row('Gas', cmp.parts.gas.a, cmp.parts.gas.b),
          row('Other', cmp.parts.other.a, cmp.parts.other.b),
          row('Total', cmp.total.a, cmp.total.b, 'total'),
          row('Average / month', ya.average, yb.average, '', formatWhole))),
      h('p', { class: 'small muted' }, `${a}: ${ya.months} months of data · ${b}: ${yb.months} months of data. Compare averages when a year is not complete.`),
    );
  };
  const opts = [...years].reverse().map((y) => [String(y), String(y)]);
  draw();
  return h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', null, 'Year vs year')),
    h('div', { class: 'row', style: { marginTop: '8px' } },
      select(opts, String(ctx.ui.yearA ?? defaultA), (v) => { ctx.ui.yearA = Number(v); draw(); }, 'First year'),
      h('span', { class: 'none muted' }, 'vs'),
      select(opts, String(ctx.ui.yearB ?? defaultB), (v) => { ctx.ui.yearB = Number(v); draw(); }, 'Second year')),
    box);
}
