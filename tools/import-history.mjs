// Convert the old notes to an import file for the app.
// Usage: node tools/import-history.mjs [notesDir] [correctionsFile] [outDir]
// Defaults: history-files/  private/history-corrections.json  private/
// Output: <outDir>/history-import.json (load it in Settings → Import) and <outDir>/import-report.md.
// All of these paths are git-ignored, because they contain private data.
// All records get the same fixed time (IMPORT_TIME), so edits made in the app always win over a second import.
// Because of this, a second import cannot correct records that were already imported: correct them in the app,
// or replace data.json in the data repo before any device has synced.

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseNotes, buildDoc } from './history.mjs';
import { formatMoney } from '../src/money.js';
import { serialize } from '../src/sync.js';

const [notesDir = 'history-files', correctionsFile = 'private/history-corrections.json', outDir = 'private'] = process.argv.slice(2);
const IMPORT_TIME = Date.UTC(2026, 10, 25);

const corrections = JSON.parse(readFileSync(correctionsFile, 'utf8'));
const files = {};
for (const name of readdirSync(notesDir).filter((f) => f.endsWith('.md')).sort()) {
  files[name] = parseNotes(readFileSync(join(notesDir, name), 'utf8'));
}
const { doc, report } = buildDoc(files, corrections, IMPORT_TIME);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'history-import.json'), serialize(doc));

const money = (c) => (c === null ? '—' : formatMoney(c));
const lines = ['# History import report', '', `Months: ${report.length} (${report[0].month} to ${report.at(-1).month})`, ''];
lines.push('| Month | Source | Fixed (written) | Total | Written total | Difference |', '|---|---|---|---|---|---|');
for (const r of report) {
  const diff = r.writtenTotal === null ? '' : r.writtenTotal - r.total;
  lines.push(`| ${r.month} | ${r.labels.join('<br>')} | ${money(r.fixed)} (${money(r.writtenFixed)}) | ${money(r.total)} | ${money(r.writtenTotal)} | ${diff === '' || diff === 0 ? '' : money(diff)} |`);
}
const unparsed = report.filter((r) => r.unparsed.length);
if (unparsed.length) {
  lines.push('', '## Lines that were not read', '');
  for (const r of unparsed) lines.push(`- ${r.month}: ${r.unparsed.map((l) => `\`${l}\``).join(', ')}`);
}
writeFileSync(join(outDir, 'import-report.md'), lines.join('\n') + '\n');
console.log(`Wrote ${join(outDir, 'history-import.json')} (${report.length} months) and ${join(outDir, 'import-report.md')}.`);
