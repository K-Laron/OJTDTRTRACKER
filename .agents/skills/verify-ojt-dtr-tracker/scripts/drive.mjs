import fs from 'node:fs';
import path from 'node:path';
import { evidenceRoot } from './config.mjs';

const ENTRY_TIMES = { amIn: '08:00', amOut: '12:00', pmIn: '13:00', pmOut: '17:00' };
const EXPECTED_HOURS = 8;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function localDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function displayDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

async function login(page, account) {
  await page.goto('/');
  await page.locator('#auth-user').waitFor();
  await page.locator('#auth-user').fill(account.username);
  await page.locator('#auth-pass').fill(account.password);
  await page.locator('#auth-submit').click();
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
}

async function openRoute(page, navPath, heading) {
  await page.locator(`a[data-nav-path="${navPath}"]`).click();
  await page.getByRole('heading', { name: heading, exact: true, level: 2 }).waitFor();
}

async function seedEntry(page, date) {
  await openRoute(page, '/timelog', 'Time Log');
  const row = page.locator('tbody tr', { hasText: displayDate(date) });
  if (await row.count()) return 'existing';

  await page.locator('#btn-add-entry').click();
  await page.locator('#entry-save').waitFor();
  await page.locator('#entry-date').fill(date);
  await page.locator('#entry-status').selectOption('present');
  await page.locator('#entry-am-in').fill(ENTRY_TIMES.amIn);
  await page.locator('#entry-am-out').fill(ENTRY_TIMES.amOut);
  await page.locator('#entry-pm-in').fill(ENTRY_TIMES.pmIn);
  await page.locator('#entry-pm-out').fill(ENTRY_TIMES.pmOut);
  await page.locator('#entry-activities').fill('Verification entry');
  await page.locator('#entry-save').click();
  await page.locator('#entry-save').waitFor({ state: 'detached' });
  await row.first().waitFor();
  return 'created';
}

async function authHeaders(page) {
  return page.evaluate(() => ({
    userId: localStorage.getItem('dtr_user_id'),
    token: localStorage.getItem('dtr_auth_token'),
  }));
}

async function apiEntries(page, state, date) {
  const auth = await authHeaders(page);
  assert(auth.userId && auth.token, 'browser has no session');
  const url = `${state.urls.backend}/api/entries?date_from=${date}&date_to=${date}`;
  const res = await fetch(url, {
    headers: { 'x-user-id': auth.userId, 'x-auth-token': auth.token },
  });
  assert(res.ok, `GET /api/entries returned ${res.status}`);
  const body = await res.json();
  assert(Array.isArray(body), 'GET /api/entries did not return a list');
  return body;
}

async function saveDownload(page, selector, evidenceDir) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.locator(selector).click(),
  ]);
  const name = path.basename(download.suggestedFilename());
  const target = path.join(evidenceDir, name);
  await download.saveAs(target);
  return { name, target, size: fs.statSync(target).size };
}

const journeys = {
  async auth({ page, run, shot }) {
    const username = `verify_${run.id}`;
    const password = `verify-pass-${run.id}`;

    await page.goto('/');
    await page.getByRole('heading', { name: 'Welcome Back' }).waitFor();
    await shot('01-login-page');

    await page.locator('#switch-mode').click();
    await page.getByRole('heading', { name: 'Create Account' }).waitFor();
    await page.locator('#auth-user').fill(username);
    await page.locator('#auth-pass').fill(password);
    await page.locator('#auth-submit').click();
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
    await shot('02-account-created');

    const stored = await page.evaluate(() => ({
      userId: Boolean(localStorage.getItem('dtr_user_id')),
      token: Boolean(localStorage.getItem('dtr_auth_token')),
    }));
    assert(stored.userId && stored.token, 'register did not store a session');

    await page.reload();
    await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
    await shot('03-session-survives-reload');

    await page.locator('#btn-logout').click();
    await page.getByRole('heading', { name: 'Welcome Back' }).waitFor();
    const cleared = await page.evaluate(() => localStorage.getItem('dtr_auth_token'));
    assert(cleared === null, 'logout left the auth token in localStorage');
    await shot('04-logged-out');

    await login(page, { username, password });
    await shot('05-signed-in-again');

    return { username, sessionPersisted: true, logoutClearedSession: true };
  },

  async 'time-log'({ page, state, run, shot, date }) {
    await login(page, state.account);
    await openRoute(page, '/timelog', 'Time Log');
    const existing = page.locator('tbody tr', { hasText: displayDate(date) });
    if (!(await existing.count())) {
      await page.getByText('No entries found').waitFor();
      await shot('01-empty-time-log');
    }

    const seeded = await seedEntry(page, date);
    const row = page.locator('tbody tr', { hasText: displayDate(date) }).first();
    const rowText = await row.innerText();
    assert(/Present/.test(rowText), `entry row does not show Present: ${rowText}`);
    assert(rowText.includes('8h'), `entry row does not show 8h: ${rowText}`);
    await shot('02-entry-saved');

    await page.reload();
    await page.getByRole('heading', { name: 'Time Log' }).waitFor();
    await page.locator('tbody tr', { hasText: displayDate(date) }).first().waitFor();
    await shot('03-entry-survives-reload');

    const entries = await apiEntries(page, state, date);
    const entry = entries.find(item => item.date === date);
    assert(entry, `API has no entry for ${date}`);
    assert(entry.hoursRendered === EXPECTED_HOURS, `API hoursRendered is ${entry.hoursRendered}, expected ${EXPECTED_HOURS}`);
    fs.writeFileSync(
      path.join(run.evidenceDir, 'api-entry.json'),
      `${JSON.stringify({ date, entry }, null, 2)}\n`,
    );

    return {
      seeded,
      entryId: entry.id,
      status: entry.status,
      hoursRendered: entry.hoursRendered,
      otMinutes: entry.overtimeMinutes,
      lateMinutes: entry.lateMinutes,
    };
  },

  async dashboard({ page, state, shot, date }) {
    await login(page, state.account);
    const seeded = await seedEntry(page, date);

    await openRoute(page, '/', 'Dashboard');
    const hoursRow = page.locator('.detail-row', { hasText: 'Hours Rendered' });
    await hoursRow.waitFor();
    const hoursText = await hoursRow.innerText();
    assert(hoursText.includes('8h'), `dashboard hours row reads "${hoursText}"`);

    const recentCard = page.locator('.card', { hasText: 'Recent Entries' }).first();
    await recentCard.waitFor();
    assert((await recentCard.innerText()).includes(displayDate(date)), 'dashboard recent entries omit the seeded date');
    await shot('01-dashboard-with-entry');

    const entries = await apiEntries(page, state, date);
    const entry = entries.find(item => item.date === date);
    assert(entry, 'API lost the entry the dashboard renders');

    return { seeded, dashboardTotalHours: 8, recentEntryDate: date };
  },

  async 'dtr-export'({ page, state, run, shot, date }) {
    await login(page, state.account);
    await seedEntry(page, date);

    await openRoute(page, '/dtr', 'DTR Sheet');
    await page.locator('#dtr-printable').waitFor();
    await page.locator('#dtr-printable').getByText('Verification entry').waitFor();
    const sheetText = await page.locator('#dtr-printable').innerText();
    assert(sheetText.includes('8.00'), 'DTR sheet does not total 8.00 hours');
    await shot('01-dtr-sheet');

    const pdf = await saveDownload(page, '#btn-export-pdf', run.evidenceDir);
    assert(pdf.name.endsWith('.pdf'), `PDF download named ${pdf.name}`);
    assert(pdf.name.includes(state.account.username), `PDF filename omits the account: ${pdf.name}`);
    assert(pdf.size > 1000, `PDF is only ${pdf.size} bytes`);

    const excel = await saveDownload(page, '#btn-export-excel', run.evidenceDir);
    assert(excel.name.endsWith('.xlsx'), `Excel download named ${excel.name}`);
    assert(excel.name.includes(state.account.username), `Excel filename omits the account: ${excel.name}`);
    assert(excel.size > 1000, `Excel file is only ${excel.size} bytes`);
    await shot('02-downloads-saved');

    return {
      pdf: { name: pdf.name, size: pdf.size },
      excel: { name: excel.name, size: excel.size },
    };
  },

  async 'settings-backup'({ page, state, run, shot, date }) {
    await login(page, state.account);
    await seedEntry(page, date);

    await openRoute(page, '/settings', 'Settings');
    await page.locator('#set-hours').fill('480');
    await page.locator('#btn-save-settings').click();
    await page.getByText('Settings saved!').waitFor();
    await shot('01-settings-saved');

    await page.reload();
    await page.getByRole('heading', { name: 'Settings', exact: true, level: 2 }).waitFor();
    await page.waitForFunction(() => document.querySelector('#set-hours')?.value === '480');
    await shot('02-settings-survive-reload');

    const backup = await saveDownload(page, '#btn-export-data', run.evidenceDir);
    assert(backup.name.endsWith('.json'), `backup named ${backup.name}`);
    const data = JSON.parse(fs.readFileSync(backup.target, 'utf8'));
    assert(Array.isArray(data.entries) && data.entries.length >= 1, 'backup has no entries');
    assert(data.settings?.requiredHours === 480, `backup requiredHours is ${data.settings?.requiredHours}`);
    await shot('03-backup-downloaded');

    return {
      backup: { name: backup.name, size: backup.size },
      entriesInBackup: data.entries.length,
      requiredHours: data.settings.requiredHours,
    };
  },
};

export const featureNames = Object.keys(journeys);

export async function drive(feature, state) {
  if (!journeys[feature]) {
    throw new Error(`Unknown feature "${feature}". Choose one of: ${featureNames.join(', ')}`);
  }

  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const id = `${stamp}${Math.random().toString(36).slice(2, 6)}`;
  const evidenceDir = path.join(evidenceRoot, `${id}-${feature}`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const result = {
    feature,
    id,
    startedAt: new Date().toISOString(),
    baseUrl: state.urls.frontend,
    evidenceDir,
    ok: false,
    screenshots: [],
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    data: null,
  };

  const writeResult = () => {
    result.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(evidenceDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  };

  const { chromium } = await import('playwright').catch(() => {
    throw new Error('Playwright is not installed. Run npm ci.');
  });
  const browser = await chromium.launch({ headless: true }).catch(err => {
    throw new Error(`Chromium failed to launch. Run npx playwright install chromium.\n${err.message}`);
  });
  const context = await browser.newContext({
    baseURL: state.urls.frontend,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  const shot = async name => {
    const file = path.join(evidenceDir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    result.screenshots.push(path.basename(file));
  };

  page.on('console', message => {
    if (message.type() === 'error') result.consoleErrors.push(message.text());
  });
  page.on('pageerror', error => result.pageErrors.push(error.message));
  page.on('requestfailed', request => {
    const url = request.url();
    const error = request.failure()?.errorText || 'failed';
    if (error === 'net::ERR_ABORTED' && /\/api\/sync\b/.test(url)) return;
    result.failedRequests.push({
      url: url.replace(/([?&](?:authToken|token|password)=)[^&]*/gi, '$1[redacted]'),
      error,
    });
  });

  const run = {
    id,
    evidenceDir,
    date: localDate(),
  };

  try {
    const data = await journeys[feature]({ page, state, run, shot, date: run.date });
    result.data = data;
    result.ok = true;
  } catch (err) {
    result.error = err.message;
    try { await shot('failure'); } catch { /* page may be gone */ }
  } finally {
    writeResult();
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  return result;
}
