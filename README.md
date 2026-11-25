# Expenses

A personal monthly expense tracker. It is a web app (PWA) for the iPhone Home Screen and for a desktop browser.

- A template of fixed monthly costs is copied into each new month. You can create any month, also a future month.
- Add Grocery, Gas and Other items during the month. The app calculates all subtotals, the total, and the amount left against a monthly target.
- History (chart and list per year), top "Other" names, and year vs year.
- The data stays on your devices. It syncs through a **private** GitHub repo that only you can read.
- Face ID (iPhone) or Windows Hello (PC) can lock the app.

App: https://mojhnd.github.io/expense-app/

## Set up on the iPhone

1. Open the app address in **Safari**.
2. Tap **Share → Add to Home Screen**. Keep "Open as Web App" on. Tap **Add**.
3. Open the app from the **Home Screen icon**. Do the steps below in that app, not in a Safari tab: the Home Screen app keeps its own data.
4. **Settings → Sync with GitHub:** paste the token (see below) and tap **Save**. Your data comes from the private repo.
5. **Settings → Lock:** tap **Turn lock on** and accept Face ID.

## Set up on the PC (Chrome or Edge)

1. Open the app address. To get an app window, use the install icon in the address bar (or **Menu → Install**).
2. **Settings → Sync with GitHub:** paste the token and tap **Save**.
3. **Settings → Lock:** tap **Turn lock on** and accept Windows Hello.

## The sync token

Sync uses a GitHub fine-grained personal access token that can only read and write the data repo.

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Repository access: **Only select repositories** → `expense-data`.
3. Permissions → Repository permissions → **Contents: Read and write**.
4. Choose an expiry date, generate, and copy the token. Paste it on each device.

The token stays in the browser storage of each device. It is never put in the synced data. When the token expires, make a new one and paste it again.

## How sync works

Each item, month and template entry has an ID and a change time. A sync downloads `data.json` from the private repo, merges it item by item with the local data (the newer change wins; deletions are kept as markers), and uploads the result if something changed. Offline changes stay on the device and sync later. Every upload is a commit, so the repo has the full history of your data.

## If something goes wrong

- **Sync error:** the status line in Settings shows the reason (bad token, no access, offline).
- **Passkey lost or Face ID does not work:** clear the website data for the site (iPhone: Settings → Apps → Safari → Advanced → Website Data; or remove the Home Screen app and add it again). Then set up sync again. The data comes back from GitHub.
- **Backup file:** Settings → Backup → Export JSON. Import JSON merges a file into your data.

## Development

No build step and no runtime dependencies. Plain HTML, CSS and ES modules.

```sh
npm test                  # unit tests (node --test)
npx playwright test       # UI tests (iPhone 15 profile and desktop Chrome)
npm run serve             # local server on http://localhost:8080
```

The history import (`tools/import-history.mjs`) converts the old plain-text notes to an import file. The notes, the corrections file and the output are private and git-ignored.
