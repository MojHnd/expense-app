// Money is always integer cents. These helpers convert between cents and text.

const AMOUNT_RE = /^(\d{1,3}(,\d{3})+|\d*)(\.\d{1,2})?$/;

/** Parse user text such as "85.50", "$1,234" or "6,550" to cents. Returns null if not valid. */
export function parseAmount(text) {
  if (typeof text !== 'string') return null;
  const clean = text.trim().replace(/^\$/, '').trim();
  const match = AMOUNT_RE.exec(clean);
  if (!clean || !match || clean === '.') return null;
  const dollars = Number((match[1] || '0').replaceAll(',', ''));
  const fraction = match[3] ? match[3].slice(1).padEnd(2, '0') : '00';
  return dollars * 100 + Number(fraction);
}

function groupThousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Format cents for display: "$85", "$85.50", "−$500". */
export function formatMoney(cents) {
  const sign = cents < 0 ? '−' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const fraction = rest ? '.' + String(rest).padStart(2, '0') : '';
  return `${sign}$${groupThousands(dollars)}${fraction}`;
}

/** Format cents for an input field: "85" or "85.50", no symbol, no commas. */
export function formatPlain(cents) {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest ? `${dollars}.${String(rest).padStart(2, '0')}` : String(dollars);
}

/** Format cents rounded to whole dollars (for averages): "$6,643". */
export function formatWhole(cents) {
  return formatMoney(Math.round(cents / 100) * 100);
}
