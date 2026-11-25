# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A personal expense tracker PWA for one person on 2 devices (iPhone Home Screen app with Face ID, Windows PC with Chrome/Edge and Windows Hello). Public code repo `MojHnd/expense-app` on GitHub Pages (`https://mojhnd.github.io/expense-app/`). The data syncs through the **private** repo `MojHnd/expense-data` (`data.json`). The design is in `docs/superpowers/specs/2026-11-25-expense-app-design.md`.

## Privacy rules (important)

- The public repo holds code only. Never commit expense data.
- Git-ignored and private: `handoff-*.md`, `history-files/` (the owner's raw notes), `private/` (import corrections, generated import JSON and report).
- Test data in `test/` and `e2e/` must be made up. Do not copy real names or amounts from the notes into tests.
- Owner-specific import fixes (month relabels, name spellings) go in `private/history-corrections.json`, not in `tools/`.

## Commands

- Unit tests: `npm test` (runs `node --test test/*.test.js`). One file: `node --test test/merge.test.js`. One test: `node --test --test-name-pattern="newer edit" test/*.test.js`.
- UI tests: `npx playwright test` (projects `iphone` and `desktop`; it starts its own server on port 8091). One test: `npx playwright test -g "template change"`. WebKit cannot run on this machine (missing system libraries), so the `iphone` project uses Chromium with the iPhone 15 profile.
- Local server: `npm run serve` → http://localhost:8080
- History import: `npm run import-history` → `private/history-import.json` and `private/import-report.md`.
- Icons: `python3 tools/make-icons.py` (Pillow).

## Architecture

- No build step, no runtime dependencies. Plain ES modules loaded by `index.html`. Use only relative paths (the site runs under `/expense-app/`).
- **Pure logic** (tested with `node --test`, no DOM): `src/money.js` (integer cents ↔ text), `src/model.js` (the document and every change to it), `src/merge.js`, `src/reports.js`, `src/names.js`, `src/sync.js` (`fetch` is injected), `src/store.js` (storage is injected), `tools/history.mjs`.
- **UI**: `src/app.js` owns the state, the hash router (`#/month/YYYY-MM`, `#/history`, `#/trends`, `#/settings`, `#/settings/template`), sync timing and the lock. Each screen in `src/ui/*.js` returns `{ top, content, fab }` from the `ctx` object; a change goes through `ctx.mutate(fn)`, which saves, re-renders the whole view and schedules a sync. `src/ui/dom.js` `h()`/`s()` build elements; text goes in as text nodes only (no `innerHTML`).
- **Data model**: money is integer cents. Every record has `id` and `updatedAt`; deletions are tombstones (`deleted: true`), never removals, because `mergeDocs` merges record by record (newer `updatedAt` wins, ties are broken by canonical JSON so both directions agree). Model functions take `{ now, newId }` for tests. Fixed items copied from the template carry `templateId` and the ID `<month>:<templateId>`, so two devices that create the same month make the same records; template changes apply to "open months" (current month and later months that exist) only after the user confirms.
- **Two storage keys**: `expenses.doc.v1` (the synced document) and `expenses.device.v1` (token, repo, passkey ID, lock flag; never synced).
- **Sync** (`syncOnce`): GET contents → merge → PUT with the remote `sha` if the merge differs; retry on 409/422. `app.js` merges again if the user changed data while a request ran.
- **Lock**: WebAuthn platform passkey, "lock only" (no server, so a successful `navigator.credentials.get` is the gate). Re-lock after 5 minutes hidden.
- **Service worker** (`sw.js`): cache first with a background update, same-origin GET only. **For each release, bump `CACHE`** (the new worker caches all files again and `app.js` reloads the page on `controllerchange`). When you add a file under `src/`, also add it to `SHELL`.
- **Charts** (`src/ui/charts.js`): hand-made SVG following the dataviz guide (series colors `--series-1..4` in `styles.css` for Fixed/Grocery/Gas/Other, legend + table view, tap shows the tooltip, second tap opens).
