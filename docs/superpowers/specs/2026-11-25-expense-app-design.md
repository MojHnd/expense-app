# Expense app: design

Date: 2026-11-25. Status: approved by the owner ("build it all").

## 1. Goal

A personal expense tracker that replaces a plain-text note. The owner adds Grocery, Gas and Other items during the month. The app copies fixed monthly costs from a template, calculates all totals, and shows history and trends.

## 2. Requirements

- One person, 2 devices: iPhone (Home Screen PWA, Face ID) and a Windows PC (Chrome or Edge, Windows Hello).
- Data syncs through a **private** GitHub repo `MojHnd/expense-data` (file `data.json`), with the GitHub Contents API and a fine-grained token.
- The code is in the **public** repo `MojHnd/expense-app` on GitHub Pages: `https://mojhnd.github.io/expense-app/`. The public repo holds no data.
- Lock only (WebAuthn platform passkey). No encryption of the data.
- A month has fixed costs (copied from the template), Grocery and Gas (one entry per purchase), and Other items (free name, with suggestions from earlier names).
- The owner can create any month, also a future month.
- When the owner changes the template, the app asks if it must also apply the change to the open months (the current month and the future months that exist). Past months do not change.
- A monthly total target. The default target is in the settings, each new month copies it, and the owner can change the target of one month.
- Reports: month list with totals, year total and monthly average; chart over time; top Other names; year vs year.
- Import all history from Feb 2022 to Dec 2026 (see section 8).
- Defaults: CAD, cents allowed (whole amounts show without ".00"), English, theme from the system, auto-lock after 5 minutes in the background.
- Not in scope: paid/not-paid status, per-category budgets, encryption, more than one user.

## 3. Stack

- Plain HTML, CSS and JavaScript ES modules. No framework, no build step, no runtime dependencies.
- Charts are hand-made SVG.
- Only relative paths, because the site runs under `/expense-app/`.
- Dev dependency only: `@playwright/test` for UI tests.

## 4. Data model (synced document)

Money is integer cents. Each record has `id` and `updatedAt` (ms since epoch). A deleted record stays as a tombstone (`deleted: true`) so that the merge can see the deletion.

```json
{
  "version": 1,
  "settings": { "defaultTarget": 650000, "updatedAt": 0 },
  "template": [
    { "id": "t-rent", "name": "Rent", "amount": 150000, "order": 1, "updatedAt": 0 }
  ],
  "months": {
    "2026-11": {
      "target": 650000, "createdAt": 0, "updatedAt": 0, "deleted": false,
      "items": [
        { "id": "…", "kind": "fixed",   "name": "Rent", "amount": 150000, "templateId": "t-rent", "order": 1, "updatedAt": 0 },
        { "id": "…", "kind": "grocery", "name": "", "note": "Costco", "amount": 8550, "date": "2026-11-03", "updatedAt": 0 },
        { "id": "…", "kind": "gas",     "amount": 6000, "date": "2026-11-05", "updatedAt": 0 },
        { "id": "…", "kind": "other",   "name": "Dine out", "amount": 12000, "date": "2026-11-10", "updatedAt": 0 }
      ]
    }
  }
}
```

- `kind` is one of `fixed`, `grocery`, `gas`, `other`.
- A fixed item that came from the template has `templateId`. A one-time fixed item (for example "Snow removal") has no `templateId`.
- Month fields (`target`, `deleted`) use the month `updatedAt`. Items merge one by one.
- Deleting a month sets `deleted: true` on the month and on all its items. Creating the month again clears `deleted` and copies the template again.

Device-only settings (not synced, in a separate `localStorage` key): GitHub token, owner, repo, path, last known remote `sha`, passkey credential ID, lock on/off, last sync time.

## 5. Modules

| Module | Purpose |
|---|---|
| `src/money.js` | Parse user input to cents; format cents for display. |
| `src/model.js` | Pure functions: new document, create month from template, add/edit/delete items, template changes and propagation to open months, month totals. |
| `src/merge.js` | Merge two documents record by record (newer `updatedAt` wins). |
| `src/reports.js` | Month summaries, year totals and averages, series for charts, top Other names, year vs year. |
| `src/names.js` | Name suggestions (most used names first). |
| `src/store.js` | Load and save the document and device settings in `localStorage`. |
| `src/sync.js` | GitHub Contents API: pull, merge, push with `sha`; retry on conflict. `fetch` is injected for tests. |
| `src/lock.js` | WebAuthn register and unlock; auto-lock timer. |
| `src/ui/*.js` | Screens: month, history, trends, settings, template; SVG charts; small DOM helpers. |
| `src/app.js` | Start-up, hash router, state, connects UI to model, store and sync. |
| `tools/import-history.mjs` | Converts `history-files/*.md` to an import JSON (output to git-ignored `private/`). |

## 6. Screens

Bottom tab bar: **Month**, **History**, **Trends**, **Settings**.

- **Month** (`#/month/YYYY-MM`): previous/next arrows and a month picker. The total is at the top in large text, with the target and the amount left. Sections: Fixed (collapsed, with subtotal; expand to edit, add a one-time item, or open the template), Grocery, Gas, Other (each with subtotal and list). A "+" button opens the add sheet (kind, amount, name or note, date). Tap an item to edit or delete it. If the month does not exist, the screen shows "Create <month>".
- **History** (`#/history`): stacked bar chart of the monthly totals (12 months, 24 months, all); list of months grouped by year with total, year total and monthly average.
- **Trends** (`#/trends`): top Other names for a period (this year, last 12 months, a year, all), with total and count; tap a name to see its total per year. Year vs year: select 2 years, compare per part and per month.
- **Settings** (`#/settings`): default target, template editor, sync (token, repo, "Sync now", status), lock on/off and passkey registration, export JSON, import JSON.

## 7. Sync and lock

- Sync runs at start-up (after unlock), 2 s after each local change, when the app becomes visible, when the device goes online, and with "Sync now".
- Sync: GET the file (404 means no remote file) → merge with local → if the result differs from the remote, PUT with the remote `sha`. If the PUT returns 409 or 422 (sha mismatch), repeat (max 3 times).
- When offline, changes stay local and sync later. The UI shows the sync status.
- Lock: with lock on, the app renders no data until `navigator.credentials.get` with `userVerification: "required"` succeeds. The lock screen has an "Unlock" button, because Safari can require a user tap. The app locks again when it was hidden for more than 5 minutes.
- Recovery: if the passkey is lost, clear the site data and sync again from GitHub.

## 8. History import

- Input: the old plain-text notes (private, git-ignored). Each month block starts with `[  ] <Month> <Year>`, then the fixed list, a Grocery/Gas section, an Other list and a written total.
- Owner-specific corrections are in the git-ignored file `private/history-corrections.json`:
  - per block (file + index): set the real month, drop a duplicate or draft, or merge blocks that are parts of one month (the fixed list counts one time);
  - name fixes (case, spelling, synonyms) and exact-case renames for fixed items;
  - the month whose fixed list becomes the template.
- The block order in each file decides a wrong month label (the owner confirmed this rule).
- Grocery and Gas values in the notes are monthly totals; each becomes one entry with the note "Imported monthly total".
- `a+b name+name` lines become 2 items; name-first lines (`Name 12`) are read too.
- After the first pass, each name uses its most common spelling.
- Totals are calculated again. The tool writes a report of the months where the written total is different.
- Item IDs and times are fixed, so a second import merges and does not make duplicates, and later edits always win.
- Fixed items whose name matches a template item get its `templateId`.

## 9. Testing

- Unit tests with `node --test` for money, model, merge, reports, names, sync (fake `fetch`) and the import parser.
- UI tests with Playwright in the iPhone 15 profile (WebKit) and desktop Chrome.
- Final check on the real devices: install, offline, Face ID / Windows Hello, sync.
