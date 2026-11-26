// The expense document and the pure functions that change it.
// Each function that changes data takes { now, newId } so that tests can control time and IDs.
// Records are never removed: a deletion sets `deleted: true` so that sync can merge it.

export const KINDS = ['fixed', 'grocery', 'gas', 'other'];

/** The monthly target when the settings have no default target ($6,500). */
export const DEFAULT_TARGET = 650000;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const defaults = () => ({ now: Date.now(), newId: () => crypto.randomUUID() });

export function createDoc() {
  return { version: 1, settings: { defaultTarget: null, updatedAt: 0 }, template: [], months: {} };
}

// ---- Month keys ("YYYY-MM") ----

export function monthKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const index = y * 12 + (m - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function monthLabel(key, style = 'long') {
  const [y, m] = key.split('-').map(Number);
  const name = MONTH_NAMES[m - 1];
  return `${style === 'short' ? name.slice(0, 3) : name} ${y}`;
}

// ---- Months ----

export function getMonth(doc, key) {
  const month = doc.months[key];
  return month && !month.deleted ? month : null;
}

export function liveMonthKeys(doc) {
  return Object.keys(doc.months).filter((k) => !doc.months[k].deleted).sort();
}

/** The month the app opens on: the last month that exists, or the current month when there is none. */
export function startMonthKey(doc, todayKey) {
  return liveMonthKeys(doc).at(-1) || todayKey;
}

function requireMonth(doc, key) {
  const month = getMonth(doc, key);
  if (!month) throw new Error(`No month ${key}`);
  return month;
}

export function createMonth(doc, key, options = {}) {
  const { now } = { ...defaults(), ...options };
  if (getMonth(doc, key)) throw new Error(`Month ${key} exists`);
  const old = doc.months[key];
  const month = old || { items: [], createdAt: now };
  Object.assign(month, { target: doc.settings.defaultTarget, deleted: false, updatedAt: now });
  doc.months[key] = month;
  for (const t of liveTemplate(doc)) putTemplateCopy(month, key, t, now);
  return month;
}

/**
 * Put a copy of template item `t` in a month. The ID depends only on the month and the template item,
 * so two devices that copy the same item make the same record, and the merge keeps one.
 */
function putTemplateCopy(month, key, t, now) {
  const id = `${key}:${t.id}`;
  const fields = { kind: 'fixed', name: t.name, amount: t.amount, templateId: t.id, order: t.order };
  const old = month.items.find((i) => i.id === id);
  if (old) Object.assign(old, fields, { deleted: false, updatedAt: now });
  else month.items.push({ id, ...fields, updatedAt: now });
}

export function deleteMonth(doc, key, options = {}) {
  const { now } = { ...defaults(), ...options };
  const month = requireMonth(doc, key);
  month.deleted = true;
  month.updatedAt = now;
  for (const item of month.items) {
    if (!item.deleted) Object.assign(item, { deleted: true, updatedAt: now });
  }
}

export function setMonthTarget(doc, key, target, options = {}) {
  const { now } = { ...defaults(), ...options };
  const month = requireMonth(doc, key);
  month.target = target;
  month.updatedAt = now;
}

export function setDefaultTarget(doc, target, options = {}) {
  const { now } = { ...defaults(), ...options };
  doc.settings.defaultTarget = target;
  doc.settings.updatedAt = now;
}

/**
 * Give the default target to each month that has no target (and $6,500 to the settings if they have none).
 * The new `updatedAt` is the old one + 1: two devices that fill the same month make the same record,
 * and a real change that the user makes later still wins in the merge. Returns true if something changed.
 */
export function fillMissingTargets(doc) {
  let changed = false;
  if (doc.settings.defaultTarget == null) {
    doc.settings.defaultTarget = DEFAULT_TARGET;
    doc.settings.updatedAt += 1;
    changed = true;
  }
  for (const key of liveMonthKeys(doc)) {
    const month = doc.months[key];
    if (month.target != null) continue;
    month.target = doc.settings.defaultTarget;
    month.updatedAt += 1;
    changed = true;
  }
  return changed;
}

// ---- Items ----

function checkAmount(amount) {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`Bad amount: ${amount}`);
}

export function addItem(doc, key, fields, options = {}) {
  const { now, newId } = { ...defaults(), ...options };
  const month = requireMonth(doc, key);
  if (!KINDS.includes(fields.kind)) throw new Error(`Bad kind: ${fields.kind}`);
  checkAmount(fields.amount);
  const item = { id: newId(), ...fields, updatedAt: now };
  if (item.kind === 'fixed' && item.order === undefined) {
    item.order = Math.max(0, ...liveItems(month, 'fixed').map((i) => i.order ?? 0)) + 1;
  }
  month.items.push(item);
  return item;
}

export function updateItem(doc, key, id, patch, options = {}) {
  const { now } = { ...defaults(), ...options };
  const item = requireMonth(doc, key).items.find((i) => i.id === id && !i.deleted);
  if (!item) throw new Error(`No item ${id}`);
  if ('amount' in patch) checkAmount(patch.amount);
  Object.assign(item, patch, { updatedAt: now });
  return item;
}

export function deleteItem(doc, key, id, options = {}) {
  const { now } = { ...defaults(), ...options };
  const item = requireMonth(doc, key).items.find((i) => i.id === id);
  if (!item) throw new Error(`No item ${id}`);
  Object.assign(item, { deleted: true, updatedAt: now });
}

/** Items that are not deleted, optionally of one kind. Fixed items are sorted by `order`. */
export function liveItems(month, kind) {
  const items = month.items.filter((i) => !i.deleted && (!kind || i.kind === kind));
  if (kind === 'fixed') items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return items;
}

export function monthTotals(month) {
  const totals = { fixed: 0, grocery: 0, gas: 0, other: 0, total: 0 };
  for (const item of liveItems(month)) {
    totals[item.kind] += item.amount;
    totals.total += item.amount;
  }
  return totals;
}

// ---- Template ----

export function liveTemplate(doc) {
  return doc.template.filter((t) => !t.deleted).sort((a, b) => a.order - b.order);
}

export function addTemplateItem(doc, { name, amount }, options = {}) {
  const { now, newId } = { ...defaults(), ...options };
  checkAmount(amount);
  const order = Math.max(0, ...doc.template.map((t) => t.order)) + 1;
  const item = { id: newId(), name, amount, order, updatedAt: now };
  doc.template.push(item);
  return item;
}

export function updateTemplateItem(doc, id, patch, options = {}) {
  const { now } = { ...defaults(), ...options };
  const item = doc.template.find((t) => t.id === id && !t.deleted);
  if (!item) throw new Error(`No template item ${id}`);
  if ('amount' in patch) checkAmount(patch.amount);
  Object.assign(item, patch, { updatedAt: now });
  return item;
}

export function deleteTemplateItem(doc, id, options = {}) {
  const { now } = { ...defaults(), ...options };
  const item = doc.template.find((t) => t.id === id);
  if (!item) throw new Error(`No template item ${id}`);
  Object.assign(item, { deleted: true, updatedAt: now });
}

/** The months that a template change can apply to: the current month and later months that exist. */
export function openMonthKeys(doc, currentKey) {
  return liveMonthKeys(doc).filter((k) => k >= currentKey);
}

/**
 * Apply one template change to the given months.
 * change.type is 'add', 'update' or 'delete'; change.item is the template item (after the change).
 */
export function applyTemplateChange(doc, change, monthKeys, options = {}) {
  const { now } = { ...defaults(), ...options };
  const t = change.item;
  for (const key of monthKeys) {
    const month = requireMonth(doc, key);
    const linked = liveItems(month, 'fixed').filter((i) => i.templateId === t.id);
    if (change.type === 'add' && linked.length === 0) {
      putTemplateCopy(month, key, t, now);
    } else if (change.type === 'update') {
      for (const i of linked) Object.assign(i, { name: t.name, amount: t.amount, updatedAt: now });
    } else if (change.type === 'delete') {
      for (const i of linked) Object.assign(i, { deleted: true, updatedAt: now });
    }
  }
}

// ---- Validation (for import files and the remote file) ----

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const isAmount = (a) => Number.isInteger(a) && a >= 0;

/** Return a list of problems (empty when the document is good). It checks the shape, not the meaning. */
export function validateDoc(doc) {
  if (!doc || typeof doc !== 'object') return ['The file is not a document.'];
  const problems = [];
  if (!Array.isArray(doc.template)) problems.push('The template is missing.');
  if (!doc.months || typeof doc.months !== 'object' || Array.isArray(doc.months)) problems.push('The months are missing.');
  if (problems.length) return problems;
  if (doc.settings && typeof doc.settings !== 'object') problems.push('The settings are not valid.');
  doc.template.forEach((t, i) => {
    if (!t || typeof t.id !== 'string' || typeof t.name !== 'string' || !isAmount(t.amount)) problems.push(`Template item ${i + 1} is not valid.`);
  });
  for (const [key, month] of Object.entries(doc.months)) {
    if (!MONTH_KEY_RE.test(key)) { problems.push(`"${key}" is not a month (YYYY-MM).`); continue; }
    if (!month || !Array.isArray(month.items)) { problems.push(`${key} has no item list.`); continue; }
    month.items.forEach((item, i) => {
      if (!item || typeof item.id !== 'string' || !KINDS.includes(item.kind) || !isAmount(item.amount)) {
        problems.push(`${key} item ${i + 1} is not valid.`);
      }
    });
  }
  return problems;
}
