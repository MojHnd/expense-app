// End-to-end tests. All data is made up.
import { test, expect } from '@playwright/test';

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const THIS = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
const shift = (key, n) => {
  const [y, m] = key.split('-').map(Number);
  const i = y * 12 + m - 1 + n;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
};
const NEXT = shift(THIS, 1);
const PREV = shift(THIS, -1);

/** A small document: template Rent 1000 + Phone 50, last month with a few items. */
function seedDoc() {
  const t = 1;
  const fixed = (key) => [
    { id: `${key}-f1`, kind: 'fixed', name: 'Rent', amount: 100000, templateId: 't-rent', order: 1, updatedAt: t },
    { id: `${key}-f2`, kind: 'fixed', name: 'Phone', amount: 5000, templateId: 't-phone', order: 2, updatedAt: t },
  ];
  return {
    version: 1,
    settings: { defaultTarget: 200000, updatedAt: t },
    template: [
      { id: 't-rent', name: 'Rent', amount: 100000, order: 1, updatedAt: t },
      { id: 't-phone', name: 'Phone', amount: 5000, order: 2, updatedAt: t },
    ],
    months: {
      [PREV]: {
        target: 200000, createdAt: t, updatedAt: t, deleted: false,
        items: [
          ...fixed(PREV),
          { id: 'p-g1', kind: 'grocery', name: '', note: 'Costco', amount: 12000, date: null, updatedAt: t },
          { id: 'p-o1', kind: 'other', name: 'Dine out', amount: 4500, date: null, updatedAt: t },
          { id: 'p-o2', kind: 'other', name: 'Dine out', amount: 3000, date: null, updatedAt: t },
          { id: 'p-o3', kind: 'other', name: 'Bookstore', amount: 2000, date: null, updatedAt: t },
        ],
      },
    },
  };
}

async function open(page, hash, doc = seedDoc()) {
  await page.addInitScript((d) => {
    if (d && !sessionStorage.getItem('seeded')) {
      localStorage.setItem('expenses.doc.v1', JSON.stringify(d));
      sessionStorage.setItem('seeded', '1');
    }
  }, doc);
  await page.goto(`/${hash}`);
}

const total = (page) => page.getByTestId('month-total');
const sheet = (page) => page.locator('dialog#sheet');

test('an empty app shows the current month with a create button, and the template is used', async ({ page }) => {
  await open(page, '', null);
  await expect(page.getByRole('button', { name: /^Create / })).toBeVisible();
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: /Template/ }).click();
  await page.getByRole('button', { name: '+ Add fixed cost' }).click();
  await sheet(page).getByLabel('Name').fill('Rent');
  await sheet(page).getByLabel('Amount per month ($)').fill('1000');
  await sheet(page).getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Rent')).toBeVisible();
  await page.getByRole('link', { name: 'Month' }).click();
  await page.getByRole('button', { name: /^Create / }).click();
  await expect(total(page)).toHaveText('$1,000');
});

test('add a grocery purchase with the + button; the totals change', async ({ page }) => {
  await open(page, `#/month/${PREV}`);
  await expect(total(page)).toHaveText('$1,265');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await sheet(page).getByRole('button', { name: 'Grocery' }).click();
  await sheet(page).getByLabel('Amount', { exact: true }).fill('85.50');
  await sheet(page).getByLabel('Note (optional)').fill('Costco');
  await sheet(page).getByRole('button', { name: 'Add' }).click();
  await expect(total(page)).toHaveText('$1,350.50');
  await expect(page.locator('[data-part="grocery"] .subtotal')).toHaveText('$205.50');
});

test('an "Other" name can come from a suggestion chip', async ({ page }) => {
  await open(page, `#/month/${PREV}`);
  await page.getByRole('button', { name: 'Add expense' }).click();
  await sheet(page).getByRole('button', { name: 'Other' }).click();
  await sheet(page).getByLabel('Amount', { exact: true }).fill('20');
  await sheet(page).getByLabel('Name').fill('din');
  await sheet(page).getByRole('button', { name: 'Dine out' }).click();
  await expect(sheet(page).getByLabel('Name')).toHaveValue('Dine out');
  await sheet(page).getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('[data-part="other"] .subtotal')).toHaveText('$115');
});

test('a new name can be typed, and a missing amount shows an error', async ({ page }) => {
  await open(page, `#/month/${PREV}`);
  await page.getByRole('button', { name: 'Add expense' }).click();
  await sheet(page).getByRole('button', { name: 'Other' }).click();
  await sheet(page).getByLabel('Name').fill('Ski lessons');
  await sheet(page).getByRole('button', { name: 'Add' }).click();
  await expect(sheet(page).getByRole('alert')).toContainText('Type an amount');
  await sheet(page).getByLabel('Amount', { exact: true }).fill('120');
  await sheet(page).getByRole('button', { name: 'Add' }).click();
  await expect(page.locator('[data-part="other"]').getByText('Ski lessons')).toBeVisible();
});

test('edit an item, then delete it after the question', async ({ page }) => {
  await open(page, `#/month/${PREV}`);
  await page.locator('[data-part="other"]').getByRole('button', { name: /Bookstore/ }).click();
  await sheet(page).getByLabel('Amount', { exact: true }).fill('25');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(total(page)).toHaveText('$1,270');
  await page.locator('[data-part="other"]').getByRole('button', { name: /Bookstore/ }).click();
  await sheet(page).getByRole('button', { name: 'Delete' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Delete this item?' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Delete' }).click();
  await expect(total(page)).toHaveText('$1,245');
  await expect(page.locator('[data-part="other"]').getByText('Bookstore')).toHaveCount(0);
});

test('a future month can be created early from the next-month arrow', async ({ page }) => {
  await open(page, `#/month/${THIS}`);
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page).toHaveURL(new RegExp(`#/month/${NEXT}$`));
  await page.getByRole('button', { name: /^Create / }).click();
  await expect(total(page)).toHaveText('$1,050');
  await expect(page.getByRole('button', { name: /Target/ })).toContainText('$2,000');
});

test('a template change asks to update open months and leaves past months', async ({ page }) => {
  await open(page, `#/month/${THIS}`);
  await page.getByRole('button', { name: /^Create / }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.getByRole('button', { name: /^Create / }).click();
  await page.goto(`/#/settings/template`);
  await page.getByRole('button', { name: /Rent/ }).click();
  await sheet(page).getByLabel('Amount per month ($)').fill('1200');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(sheet(page).getByRole('heading', { name: /open months/ })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Apply' }).click();
  await page.goto(`/#/month/${THIS}`);
  await expect(total(page)).toHaveText('$1,250');
  await page.goto(`/#/month/${NEXT}`);
  await expect(total(page)).toHaveText('$1,250');
  await page.goto(`/#/month/${PREV}`);
  await expect(total(page)).toHaveText('$1,265');
});

test('the month target shows the amount left', async ({ page }) => {
  await open(page, `#/month/${PREV}`);
  await expect(page.getByRole('button', { name: /Target/ })).toContainText('$735 left');
  await page.getByRole('button', { name: /Target/ }).click();
  await sheet(page).getByRole('textbox').fill('1000');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: /Target/ })).toContainText('$265 over');
});

test('a month without a target gets the default target, and an empty target goes back to it', async ({ page }) => {
  const doc = seedDoc();
  doc.months[PREV].target = null;
  await open(page, `#/month/${PREV}`, doc);
  const target = page.getByRole('button', { name: /Target/ });
  await expect(target).toContainText('$2,000');
  await target.click();
  await sheet(page).getByRole('textbox').fill('1000');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(target).toContainText('$1,000');
  await target.click();
  await sheet(page).getByRole('textbox').fill('');
  await sheet(page).getByRole('button', { name: 'Save' }).click();
  await expect(target).toContainText('$2,000');
});

test('the app opens on the last month that exists, and the Month tab goes there too', async ({ page }) => {
  const doc = seedDoc();
  doc.months[NEXT] = { ...doc.months[PREV], items: [] };
  await open(page, '', doc);
  await expect(page).toHaveURL(new RegExp(`#/month/${NEXT}$`));
  await page.getByRole('link', { name: 'History' }).click();
  await page.getByRole('link', { name: 'Month' }).click();
  await expect(page).toHaveURL(new RegExp(`#/month/${NEXT}$`));
});

test('history shows the chart and the month list; a row opens the month', async ({ page }) => {
  await open(page, '#/history');
  await expect(page.locator('.chart svg')).toBeVisible();
  await expect(page.locator('.legend')).toContainText('Grocery');
  await page.getByRole('link', { name: /\$1,265/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/month/${PREV}$`));
});

test('history filters the chart and the year list by one part', async ({ page }, testInfo) => {
  await open(page, '#/history');
  await page.getByRole('group', { name: 'Part' }).getByRole('button', { name: 'Grocery' }).click();
  await expect(page.locator('.chart .seg')).toHaveCount(1);
  await expect(page.locator('.chart .seg')).toHaveAttribute('fill', 'var(--series-2)');
  await expect(page.locator('.legend')).toHaveCount(0);
  const year = page.locator(`[data-year="${PREV.slice(0, 4)}"]`);
  await expect(year.locator('.subtotal')).toHaveText('$120');
  await expect(year.getByRole('link')).toContainText('$120');
  await expect(year.getByRole('link')).toContainText('Total $1,265');
  const column = page.locator('.chart .hit').first();
  if (testInfo.project.name === 'iphone') await column.tap();
  else await column.hover();
  await expect(page.locator('.tooltip')).toContainText('Grocery');
  await expect(page.locator('.tooltip')).not.toContainText('Fixed');
  await page.getByRole('group', { name: 'Part' }).getByRole('button', { name: 'All' }).click();
  await expect(year.locator('.subtotal')).toHaveText('$1,265');
  await expect(page.locator('.legend')).toContainText('Grocery');
});

test('history filters the months by over and under target', async ({ page }) => {
  const doc = seedDoc();
  doc.months[shift(THIS, -2)] = {
    target: 100000, createdAt: 1, updatedAt: 1, deleted: false,
    items: [
      { id: 'o-f1', kind: 'fixed', name: 'Rent', amount: 100000, updatedAt: 1 },
      { id: 'o-g1', kind: 'grocery', name: '', amount: 5000, updatedAt: 1 },
    ],
  };
  await open(page, '#/history', doc);
  const filter = page.getByRole('group', { name: 'Target' });
  const rows = page.locator('[data-year] .item');
  await expect(rows).toHaveCount(2);
  await filter.getByRole('button', { name: 'Over target' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('$50 over');
  await expect(page.locator('.chart .col.dim')).toHaveCount(1);
  await filter.getByRole('button', { name: 'Under target' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('$735 under');
  await filter.getByRole('button', { name: 'Any' }).click();
  await expect(rows).toHaveCount(2);
  await expect(page.locator('.chart .col.dim')).toHaveCount(0);
});

test('trends shows the top names and the detail per year', async ({ page }) => {
  await open(page, '#/trends');
  await page.getByRole('combobox', { name: 'Period' }).selectOption('all');
  const first = page.locator('.hbar').first();
  await expect(first).toContainText('Dine out');
  await expect(first).toContainText('$75');
  await first.click();
  await expect(page.locator('.detail')).toContainText(PREV.slice(0, 4));
});

test('sync sends the data to the GitHub API and shows the status', async ({ page }) => {
  let putBody = null;
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    expect(req.headers().authorization).toBe('Bearer test-token');
    if (req.method() === 'GET') return route.fulfill({ status: 404, json: { message: 'Not Found' } });
    putBody = JSON.parse(req.postData());
    return route.fulfill({ status: 201, json: { content: { sha: 'abc123' } } });
  });
  await open(page, '#/settings');
  await page.getByLabel('Token (kept only on this device)').fill('test-token');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByTestId('sync-status')).toContainText('Synced and saved to GitHub');
  const text = Buffer.from(putBody.content, 'base64').toString('utf8');
  expect(JSON.parse(text).months[PREV].items.length).toBe(6);
});

test('sync merges data that another device saved', async ({ page }) => {
  const remote = seedDoc();
  remote.months[PREV].items.push({ id: 'pc-1', kind: 'gas', name: '', note: 'Shell', amount: 6000, date: null, updatedAt: 5 });
  await page.route('https://api.github.com/**', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, json: { sha: 's1', encoding: 'base64', content: Buffer.from(JSON.stringify(remote)).toString('base64') } });
    }
    return route.fulfill({ status: 200, json: { content: { sha: 's2' } } });
  });
  await page.addInitScript(() => localStorage.setItem('expenses.device.v1', JSON.stringify({ token: 'test-token' })));
  await open(page, `#/month/${PREV}`);
  await expect(total(page)).toHaveText('$1,325');
});

test('import a backup file merges the months', async ({ page }) => {
  await open(page, '#/settings');
  const extra = seedDoc();
  extra.months['2020-05'] = { target: null, createdAt: 1, updatedAt: 1, deleted: false, items: [{ id: 'x1', kind: 'other', name: 'Old', amount: 999, updatedAt: 1 }] };
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON' }).click();
  await (await chooser).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(extra)) });
  await sheet(page).getByRole('button', { name: 'Import' }).click();
  await page.goto('/#/month/2020-05');
  await expect(total(page)).toHaveText('$9.99');
});

test('the layout fits the screen without sideways scroll', async ({ page }) => {
  for (const hash of [`#/month/${PREV}`, '#/history', '#/trends', '#/settings']) {
    await open(page, hash);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, hash).toBeLessThanOrEqual(0);
  }
});

test('a chart column shows a tooltip first, then opens the month', async ({ page }, testInfo) => {
  await open(page, '#/history');
  const column = page.locator('.chart .hit').first();
  if (testInfo.project.name === 'iphone') await column.tap();
  else await column.hover();
  await expect(page.locator('.tooltip')).toBeVisible();
  await expect(page.locator('.tooltip')).toContainText('Total');
  await expect(page).toHaveURL(/#\/history$/);
  if (testInfo.project.name === 'iphone') await column.tap();
  else await column.click();
  await expect(page).toHaveURL(new RegExp(`#/month/${PREV}$`));
});

test('an iPhone Safari tab shows the Home Screen hint, which can be hidden', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone', 'iPhone only');
  await open(page, `#/month/${PREV}`);
  await expect(page.getByTestId('install-hint')).toBeVisible();
  await page.getByTestId('install-hint').getByRole('button', { name: 'Hide' }).click();
  await expect(page.getByTestId('install-hint')).toHaveCount(0);
});

test('an open sheet closes when the route changes (for example with Back)', async ({ page }) => {
  await open(page, `#/month/${PREV}`);
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(sheet(page)).toBeVisible();
  await page.evaluate(() => { location.hash = '#/trends'; });
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Trends' })).toBeVisible();
});

test('a sync does not clear the settings fields while you type', async ({ page }) => {
  await page.route('https://api.github.com/**', (route) => route.fulfill({ status: 401, json: { message: 'Bad credentials' } }));
  await page.addInitScript(() => localStorage.setItem('expenses.device.v1', JSON.stringify({ token: 'old-token' })));
  await open(page, '#/settings');
  await page.getByLabel('Private repo').fill('other-repo');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByTestId('sync-status')).toContainText('rejected the token');
  await expect(page.getByLabel('Private repo')).toHaveValue('other-repo');
});

test('a tap inside the sheet near its bottom edge does not close it', async ({ page }) => {
  await open(page, `#/month/${PREV}`);
  await page.getByRole('button', { name: 'Add expense' }).click();
  const box = await sheet(page).boundingBox();
  await page.mouse.click(box.x + 5, box.y + box.height - 3);
  await expect(sheet(page)).toBeVisible();
  await page.mouse.click(box.x + box.width / 2, Math.max(2, box.y - 40));
  await expect(sheet(page)).toBeHidden();
});
