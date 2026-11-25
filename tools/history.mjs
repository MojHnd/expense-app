// Parser for the old plain-text expense notes, and conversion to an app document.
// The owner-specific corrections (wrong month labels, name fixes) are NOT here: they are in
// private/history-corrections.json, which git ignores. See tools/import-history.mjs.

import { parseAmount } from '../src/money.js';
import { createDoc } from '../src/model.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const AMOUNT = String.raw`\d[\d,]*(?:\.\d{1,2})?`;
const AMOUNT_FIRST = new RegExp(String.raw`^(${AMOUNT}(?:\+${AMOUNT})*)\s+(.+)$`);
const NAME_FIRST = new RegExp(String.raw`^(.+?)\s+(${AMOUNT})$`);

const clean = (s) => s.trim().replace(/\s+/g, ' ');

/** Parse one item line ("70 Dine out", "Taxi 12", "10+5 cup+plate"). Returns a list of items, or null. */
export function parseItemLine(line) {
  const text = clean(line);
  if (!text || /^[+=]/.test(text)) return null;
  let m = AMOUNT_FIRST.exec(text);
  if (m) {
    const amounts = m[1].split('+').map(parseAmount);
    const names = m[2].split('+').map(clean);
    if (amounts.some((a) => a === null)) return null;
    if (amounts.length > 1 && names.length === amounts.length) {
      return amounts.map((amount, i) => ({ name: names[i], amount }));
    }
    return [{ name: clean(m[2]), amount: amounts.reduce((s, a) => s + a, 0) }];
  }
  m = NAME_FIRST.exec(text);
  if (m) return [{ name: clean(m[1]), amount: parseAmount(m[2]) }];
  return null;
}

/** "Auguste 2022:" → "2022-08". Returns null if the text is not a month label. */
export function parseMonthLabel(label) {
  const m = /^([a-z]+)\.?\s*(\d{4})/i.exec(label.trim());
  if (!m) return null;
  const index = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
  return index < 0 ? null : `${m[2]}-${String(index + 1).padStart(2, '0')}`;
}

/** Split a notes file into month blocks. */
export function parseNotes(text) {
  const blocks = [];
  let block = null;
  let section = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = clean(raw);
    if (!line || /^\++$/.test(line)) continue;
    const header = /^\[\s*\]\s*(.*)$/.exec(line);
    if (header) {
      const rest = header[1];
      if (/^grocery/i.test(rest)) section = 'grocery';
      else if (/^other/i.test(rest)) section = 'other';
      else if (/^total/i.test(rest)) {
        if (block) block.writtenTotal = parseAmount(rest.replace(/^total:?/i, '').trim());
        section = null;
      } else {
        block = { label: rest, month: parseMonthLabel(rest), fixed: [], grocery: 0, gas: 0, other: [], writtenFixed: null, writtenTotal: null, unparsed: [] };
        blocks.push(block);
        section = 'fixed';
      }
      continue;
    }
    if (!block || !section) continue;
    const sum = /^=\s*(.+)$/.exec(line);
    if (sum) {
      if (section === 'fixed') block.writtenFixed = parseAmount(sum[1]);
      continue;
    }
    if (section === 'grocery') {
      const g = /^(grocery|gas)\s+(.+)$/i.exec(line);
      const amount = g && parseAmount(g[2]);
      if (amount !== null && g) block[g[1].toLowerCase()] += amount;
      else block.unparsed.push(line);
      continue;
    }
    const items = parseItemLine(line);
    if (items) block[section].push(...items);
    else block.unparsed.push(line);
  }
  return blocks;
}

function capitalize(s) {
  return s === s.toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** First pass: fix each name alone. */
function fixName(name, kind, corrections) {
  const c = clean(name);
  if (kind === 'fixed' && corrections.fixedNames?.[c]) return corrections.fixedNames[c];
  return corrections.names?.[c.toLowerCase()] ?? capitalize(c);
}

/** Second pass: for each name (any case), use the spelling that is used most (then the newest). */
function unifySpelling(items) {
  const stats = new Map();
  items.forEach((item, index) => {
    const key = `${item.kind}:${item.name.toLowerCase()}`;
    const variants = stats.get(key) || new Map();
    const v = variants.get(item.name) || { count: 0, last: 0 };
    variants.set(item.name, { count: v.count + 1, last: index });
    stats.set(key, variants);
  });
  const best = new Map();
  for (const [key, variants] of stats) {
    const [name] = [...variants].sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)[0];
    best.set(key, name);
  }
  for (const item of items) item.name = best.get(`${item.kind}:${item.name.toLowerCase()}`);
}

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}

/** Choose the month of each block, apply drops and merges. Returns Map(monthKey → blocks). */
function assignMonths(files, corrections) {
  const byMonth = new Map();
  for (const [file, blocks] of Object.entries(files)) {
    blocks.forEach((block, index) => {
      const c = (corrections.blocks || []).find((x) => x.file === file && x.index === index) || {};
      if (c.drop) return;
      const month = c.month || block.month;
      if (!month) throw new Error(`${file} block ${index} ("${block.label}") has no month`);
      const list = byMonth.get(month) || [];
      list.push({ ...block, file, index, merge: Boolean(c.merge) });
      byMonth.set(month, list);
    });
  }
  for (const [month, list] of byMonth) {
    if (list.length > 1 && !list.every((b) => b.merge)) {
      const where = list.map((b) => `${b.file} block ${b.index} ("${b.label}")`).join(', ');
      throw new Error(`More than one block for ${month}: ${where}. Add a correction (month, merge or drop).`);
    }
  }
  return byMonth;
}

/**
 * Build an app document from parsed notes.
 * files: { fileName: blocks from parseNotes }. importTime: fixed time for all records (stable output).
 * Returns { doc, report }.
 */
export function buildDoc(files, corrections, importTime) {
  const byMonth = assignMonths(files, corrections);
  const keys = [...byMonth.keys()].sort();
  const doc = createDoc();
  const report = [];
  const allItems = [];

  for (const key of keys) {
    const blocks = byMonth.get(key);
    const items = [];
    const add = (kind, letter, fields) => {
      const n = items.filter((i) => i.kind === kind).length + 1;
      const item = { id: `imp-${key}-${letter}${n}`, kind, ...fields, updatedAt: importTime };
      items.push(item);
      allItems.push(item);
    };
    // Merged blocks are parts of one month: count the fixed list one time.
    blocks[0].fixed.forEach((f, i) => add('fixed', 'f', { name: fixName(f.name, 'fixed', corrections), amount: f.amount, order: i + 1 }));
    const grocery = blocks.reduce((s, b) => s + b.grocery, 0);
    const gas = blocks.reduce((s, b) => s + b.gas, 0);
    if (grocery) add('grocery', 'g', { name: '', note: 'Imported monthly total', amount: grocery, date: null });
    if (gas) add('gas', 's', { name: '', note: 'Imported monthly total', amount: gas, date: null });
    for (const b of blocks) {
      for (const o of b.other) add('other', 'o', { name: fixName(o.name, 'other', corrections), amount: o.amount, date: null });
    }
    doc.months[key] = { target: null, createdAt: importTime, updatedAt: importTime, deleted: false, items };

    const total = items.reduce((s, i) => s + i.amount, 0);
    const fixed = items.filter((i) => i.kind === 'fixed').reduce((s, i) => s + i.amount, 0);
    report.push({
      month: key,
      blocks: blocks.length,
      labels: blocks.map((b) => `${b.file}#${b.index} "${b.label}"`),
      fixed,
      writtenFixed: blocks.length === 1 ? blocks[0].writtenFixed : null,
      total,
      writtenTotal: blocks.length === 1 ? blocks[0].writtenTotal : null,
      unparsed: blocks.flatMap((b) => b.unparsed),
    });
  }

  unifySpelling(allItems);

  const source = doc.months[corrections.templateFrom];
  if (!source) throw new Error(`templateFrom month ${corrections.templateFrom} is not in the data`);
  const used = new Set();
  doc.template = source.items.filter((i) => i.kind === 'fixed').map((f, i) => {
    let id = `t-${slug(f.name)}`;
    while (used.has(id)) id += '-x';
    used.add(id);
    return { id, name: f.name, amount: f.amount, order: i + 1, updatedAt: importTime };
  });
  const templateIdByName = new Map(doc.template.map((t) => [t.name, t.id]));
  for (const item of allItems) {
    if (item.kind === 'fixed' && templateIdByName.has(item.name)) item.templateId = templateIdByName.get(item.name);
  }
  return { doc, report };
}
