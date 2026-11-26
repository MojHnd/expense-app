// Hand-made SVG column charts (stacked or grouped) with a tap/hover tooltip.
// Mark specs from the dataviz guide: bars <= 24px, 4px rounded data-end, 2px surface gap
// between stacked segments, hairline grid, legend for 2+ series, text in ink colors only.

import { h, s } from './dom.js';
import { formatMoney } from '../money.js';

const W = 600;
const PAD = { top: 10, right: 6, bottom: 24, left: 46 };

/** Clean axis steps (in cents) for a maximum value. */
export function niceTicks(max, count = 4) {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw);
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks.at(-1) < max) ticks.push(ticks.at(-1) + step);
  return ticks;
}

function compact(cents) {
  const d = cents / 100;
  if (d >= 1000) return `$${Number.isInteger(d / 1000) ? d / 1000 : (d / 1000).toFixed(1)}k`;
  return `$${Math.round(d)}`;
}

/** Path for a column with a rounded top (4px) and a square base. */
function columnPath(x, y, w, hgt, r) {
  r = Math.min(r, w / 2, hgt);
  if (hgt <= 0) return '';
  return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
}

/**
 * groups: [{ key, tick (axis label or ''), title, bars: [[{ series, value }]], target (optional mark), dim (fade it) }]
 * series: [{ id, label, color }]  (color is a CSS value such as "var(--series-1)")
 * options: { height, onSelect(key), rows(group) → [{ label, value, color }], total(group), note(group) → text }
 */
export function columnChart(groups, series, options = {}) {
  const H = options.height || 220;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const colorOf = Object.fromEntries(series.map((x) => [x.id, x.color]));
  const barTotals = groups.flatMap((g) => g.bars.map((bar) => bar.reduce((sum, seg) => sum + seg.value, 0)));
  const ticks = niceTicks(Math.max(0, ...barTotals, ...groups.map((g) => g.target || 0), options.target || 0));
  const max = ticks.at(-1) || 1;
  const y = (v) => PAD.top + plotH - (v / max) * plotH;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': options.label || 'Chart' });
  for (const t of ticks) {
    svg.append(s('line', { class: t === 0 ? 'baseline' : 'grid', x1: PAD.left, x2: W - PAD.right, y1: y(t), y2: y(t) }));
    svg.append(s('text', { class: 'tick', x: PAD.left - 6, y: y(t) + 4, 'text-anchor': 'end' }, compact(t)));
  }
  if (options.target) {
    svg.append(s('line', { class: 'target', x1: PAD.left, x2: W - PAD.right, y1: y(options.target), y2: y(options.target) }));
  }

  const band = plotW / Math.max(groups.length, 1);
  const barsPer = Math.max(1, ...groups.map((g) => g.bars.length));
  const innerGap = barsPer > 1 ? 2 : 0;
  const barW = Math.max(2, Math.min(24, (band * 0.72 - innerGap * (barsPer - 1)) / barsPer));
  const wrap = h('div', { class: 'chart' });
  const tip = h('div', { class: 'tooltip', hidden: true });
  let active = null;

  const show = (g, colEl, xCenter) => {
    for (const c of svg.querySelectorAll('.col.active')) c.classList.remove('active');
    colEl.classList.add('active');
    active = g.key;
    const rows = options.rows ? options.rows(g) : [];
    tip.replaceChildren(
      h('div', { class: 't-title' }, g.title),
      ...rows.map((r) => h('div', { class: 't-row' },
        h('span', { class: 't-key', style: { background: r.color } }),
        h('strong', null, r.value === null ? '—' : formatMoney(r.value)),
        h('span', { class: 'muted' }, r.label))),
      options.total ? h('div', { class: 't-row' }, h('span', { class: 't-key' }), h('strong', null, formatMoney(options.total(g))), h('span', null, 'Total')) : null,
      options.note?.(g) ? h('div', { class: 'small' }, options.note(g)) : null,
      options.onSelect ? h('div', { class: 'small muted' }, 'Tap again to open') : null,
    );
    tip.hidden = false;
    const rect = wrap.getBoundingClientRect();
    const px = (xCenter / W) * rect.width;
    const tipW = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(0, px - tipW / 2), rect.width - tipW)}px`;
    tip.style.top = '0px';
  };
  const hide = () => {
    tip.hidden = true;
    active = null;
    for (const c of svg.querySelectorAll('.col.active')) c.classList.remove('active');
  };

  groups.forEach((g, gi) => {
    const x0 = PAD.left + gi * band + (band - (barW * barsPer + innerGap * (barsPer - 1))) / 2;
    const col = s('g', { class: g.dim ? 'col dim' : 'col' });
    g.bars.forEach((bar, bi) => {
      const x = x0 + bi * (barW + innerGap);
      let acc = 0;
      const live = bar.filter((seg) => seg.value > 0);
      live.forEach((seg, si) => {
        const top = y(acc + seg.value);
        const bottom = y(acc);
        const isTop = si === live.length - 1;
        // 2px surface gap above each segment that has another segment on top of it.
        const hgt = Math.max(0, bottom - top - (isTop ? 0 : 2));
        const yTop = isTop ? top : top + 2;
        col.append(s('path', {
          class: 'seg',
          d: isTop ? columnPath(x, yTop, barW, hgt, 4) : `M${x},${yTop}h${barW}v${hgt}h${-barW}Z`,
          fill: colorOf[seg.series],
        }));
        acc += seg.value;
      });
    });
    if (g.target) {
      const w = barW * barsPer + innerGap * (barsPer - 1);
      col.append(s('line', { class: 'target-mark', x1: x0 - 2, x2: x0 + w + 2, y1: y(g.target), y2: y(g.target) }));
    }
    const hit = s('rect', { class: 'hit', x: PAD.left + gi * band, y: PAD.top, width: band, height: plotH + PAD.bottom, tabindex: 0, role: 'button', 'aria-label': g.title });
    const xCenter = PAD.left + gi * band + band / 2;
    hit.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(g, col, xCenter); });
    // A tap first shows the tooltip; a second tap (or a click after mouse hover) opens the item.
    // Read the state on pointerdown, because the focus event that comes before the click also shows the tooltip.
    let wasActive = false;
    hit.addEventListener('pointerdown', () => { wasActive = active === g.key; });
    hit.addEventListener('focus', () => show(g, col, xCenter));
    hit.addEventListener('click', () => {
      if (wasActive && options.onSelect) options.onSelect(g.key);
      else show(g, col, xCenter);
    });
    hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' && options.onSelect) options.onSelect(g.key); });
    col.append(hit);
    svg.append(col);
    if (g.tick) svg.append(s('text', { class: 'tick', x: xCenter, y: H - 6, 'text-anchor': 'middle' }, g.tick));
  });
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });

  wrap.append(svg, tip);
  if (series.length > 1) {
    wrap.append(h('div', { class: 'legend' }, series.map((x) => h('span', null, h('span', { class: 'key', style: { background: x.color } }), x.label))));
  }
  return wrap;
}

/** Horizontal bar list (one series): name, value, and a bar scaled to the largest value. */
export function hbarList(rows, { onSelect, selected, detail } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return h('ul', { class: 'hbar-list' }, rows.map((r) => h('li', null,
    h('button', { class: 'hbar', type: 'button', 'aria-expanded': String(selected === r.id), onclick: () => onSelect && onSelect(r.id) },
      h('div', { class: 'line' }, h('span', { class: 'n' }, r.label), h('span', { class: 'v' }, formatMoney(r.value))),
      h('div', { class: 'track' }, h('div', { style: { width: `${(r.value / max) * 100}%` } })),
      r.meta ? h('div', { class: 'small muted' }, r.meta) : null),
    selected === r.id && detail ? detail(r) : null)));
}
