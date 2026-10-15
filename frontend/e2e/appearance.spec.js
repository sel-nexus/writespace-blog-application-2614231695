/** Specify real appearance journeys and browser-rendered evidence; parent runs this suite later. */
import { test, expect, seedLocalData, captureView } from './fixtures.js';

const account = {
  id: 'bdf27466-18c4-4b8d-9e83-10a44668c590',
  displayName: 'Jamie Writer',
  username: 'jamie',
  password: 'demo-only',
  role: 'user',
  createdAt: '2026-10-14T12:30:00.000Z',
};
const identity = { userId: account.id, username: account.username, displayName: account.displayName, role: 'user' };
const admin = { userId: 'writespace-demo-admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const post = {
  id: '8b1a849e-32e6-4d5a-87f1-3f99c5f0f135',
  title: 'An existing story',
  content: 'Original plain text.\nA second line.',
  authorId: account.id,
  authorName: account.displayName,
  createdAt: '2026-10-14T12:30:00.000Z',
};

/** Seed initialized actual storage, then observe application writes without replacing persistence. */
async function seed(page, session = null, posts = [post]) {
  await seedLocalData(page, {
    writespace_bootstrap_v1: JSON.stringify({ version: 1, initialized: true }),
    writespace_posts: JSON.stringify(posts),
    writespace_users: JSON.stringify([account]),
    ...(session ? { writespace_session: JSON.stringify(session) } : {}),
  });
  await page.addInitScript(() => {
    const originalSet = Storage.prototype.setItem;
    const originalRemove = Storage.prototype.removeItem;
    const originalClear = Storage.prototype.clear;
    window.appearanceStorageWrites = [];
    Storage.prototype.setItem = function setItem(key, value) {
      if (this === localStorage) window.appearanceStorageWrites.push(['set', key]);
      return originalSet.call(this, key, value);
    };
    Storage.prototype.removeItem = function removeItem(key) {
      if (this === localStorage) window.appearanceStorageWrites.push(['remove', key]);
      return originalRemove.call(this, key);
    };
    Storage.prototype.clear = function clear() {
      if (this === localStorage) window.appearanceStorageWrites.push(['clear']);
      return originalClear.call(this);
    };
  });
}

/** Read exact durable records for comparisons after navigation and mutations. */
async function stored(page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)])));
}

/** Change mode only when necessary and verify its visible and accessible state. */
async function mode(page, appearance) {
  const action = page.getByRole('button', { name: `Switch to ${appearance} mode` });
  if (await action.count()) await action.click();
  await expect(page.locator('[data-appearance]')).toHaveAttribute('data-appearance', appearance);
  const button = page.getByRole('button', { name: `Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode` });
  await expect(button).toHaveCount(1);
  await expect(button).toBeVisible();
  await expect(button).toHaveText(appearance === 'dark' ? 'Dark mode' : 'Light mode');
  await expect(button).toHaveAttribute('aria-pressed', String(appearance === 'dark'));
  expect(await page.locator('[data-appearance]').evaluate((element) => getComputedStyle(element).colorScheme)).toBe(appearance);
}

/** Follow role navigation through the mobile disclosure when needed. */
async function navigation(page, name) {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  if (!(await nav.isVisible())) await page.getByRole('button', { name: 'Open menu' }).click();
  await nav.getByRole('link', { name, exact: true }).click();
}

/** Verify no browser storage operation occurred since a known stable fixture or saved mutation. */
async function noWrites(page, before) {
  expect(await stored(page)).toEqual(before);
  expect(await page.evaluate(() => window.appearanceStorageWrites)).toEqual([]);
}

/** Start a fresh observation window after an intentional account/post mutation. */
async function resetWrites(page) {
  await page.evaluate(() => { window.appearanceStorageWrites = []; });
}

/** Audit computed solid surfaces, ordinary text, brand links and form controls, including hovered accents. */
async function audit(page, testInfo, name) {
  const footerLink = page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Home', exact: true });
  await footerLink.hover();
  const appearance = await page.locator('[data-appearance]').getAttribute('data-appearance');
  expect(await footerLink.evaluate((element) => getComputedStyle(element).color))
    .toBe(appearance === 'dark' ? 'rgb(199, 210, 254)' : 'rgb(55, 48, 163)');
  const titleLink = page.locator('main article h3 a').first();
  if (await titleLink.count()) {
    await titleLink.hover();
    expect(await titleLink.evaluate((element) => getComputedStyle(element).color))
      .toBe(appearance === 'dark' ? 'rgb(165, 180, 252)' : 'rgb(67, 56, 202)');
  }
  const evidence = await page.evaluate(() => {
    /** Parse computed RGB channels and opacity for browser color composition. */
    function rgba(value) {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return [channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0, channels[3] ?? 1];
    }
    /** Composite a translucent foreground over an opaque background. */
    function over(top, bottom) {
      return [0, 1, 2].map((index) => top[index] * top[3] + bottom[index] * (1 - top[3]));
    }
    /** Resolve the painted solid background through transparent ancestor surfaces. */
    function background(element) {
      const ancestors = [];
      for (let node = element; node; node = node.parentElement) ancestors.unshift(node);
      let result = [255, 255, 255];
      for (const node of ancestors) result = over(rgba(getComputedStyle(node).backgroundColor), result);
      return result;
    }
    /** Compute WCAG relative luminance from sRGB channels. */
    function luminance(rgb) {
      const linear = rgb.map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    }
    /** Return WCAG contrast between two painted colors. */
    function contrast(a, b) {
      const first = luminance(a);
      const second = luminance(b);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }
    const root = document.querySelector('[data-appearance]');
    const samples = [];
    // Solid semantic surfaces only; inherited decorative hero gradients are not flattened to a fake solid color.
    const elements = root.querySelectorAll('header a, header button, footer a, main form label, main input, main textarea, main select, main button, main article, main [class*="text-primary-7"], main [class*="text-primary-8"], main [class*="text-foreground"], main [role="alert"]');
    for (const element of elements) {
      const style = getComputedStyle(element);
      if (!element.getClientRects().length || style.visibility === 'hidden' || element.disabled) continue;
      let gradient = false;
      for (let node = element; node && node !== root; node = node.parentElement) {
        if (getComputedStyle(node).backgroundImage !== 'none') gradient = true;
      }
      if (gradient) continue;
      const bg = background(element);
      const fg = over(rgba(style.color), bg);
      const size = Number.parseFloat(style.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number.parseInt(style.fontWeight, 10) >= 700);
      samples.push({
        tag: element.tagName,
        text: element.textContent.trim().slice(0, 70) || element.getAttribute('aria-label') || element.getAttribute('name'),
        color: style.color,
        background: style.backgroundColor,
        contrast: contrast(fg, bg),
        required: large ? 3 : 4.5,
        classes: element.className,
      });
      if (element.matches('input, textarea, select')) {
        samples.push({ tag: 'control-border', text: element.id, contrast: contrast(rgba(style.borderTopColor).slice(0, 3), bg), required: 3 });
        if (element.getAttribute('placeholder')) {
          const placeholder = getComputedStyle(element, '::placeholder');
          samples.push({ tag: 'placeholder', text: element.id, contrast: contrast(over(rgba(placeholder.color), bg), bg), required: 4.5 });
        }
      }
    }
    return {
      mode: root.dataset.appearance,
      rootBackground: getComputedStyle(root).backgroundColor,
      surface: getComputedStyle(document.querySelector('footer')).backgroundColor,
      headerBackground: getComputedStyle(document.querySelector('header')).backgroundColor,
      samples,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  await testInfo.attach(`${name}-contrast`, { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  expect(evidence.overflow, `${name}: viewport overflow`).toBe(false);
  expect(evidence.samples.length, 'Actual computed text/control samples').toBeGreaterThan(5);
  expect(evidence.rootBackground).toBe(evidence.mode === 'light' ? 'rgb(248, 247, 244)' : 'rgb(26, 25, 31)');
  expect(evidence.surface).toBe(evidence.mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(36, 34, 43)');
  expect(evidence.headerBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(evidence.samples.filter((sample) => sample.contrast < sample.required), `${name}: WCAG AA failures`).toEqual([]);
  await captureView(page, testInfo, name);
}

for (const width of [390, 768, 1280]) {
  test(`public, login and register both modes at ${width}px, keyboard, storage isolation and reload`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const before = await stored(page);
    // Initial fixture observer order is immaterial; isolate only explicit app actions after entry.
    await resetWrites(page);
    await mode(page, 'light');
    const toggle = page.getByRole('button', { name: 'Switch to dark mode' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toBeFocused();
    await mode(page, 'dark');
    if (width < 768) {
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeHidden();
      await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
    }
    for (const appearance of ['dark', 'light']) {
      await mode(page, appearance);
      await audit(page, testInfo, `landing-${width}-${appearance}`);
    }
    await navigation(page, 'Login');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Username', { exact: true }).fill('unsaved name');
    for (const appearance of ['light', 'dark']) {
      await mode(page, appearance);
      await expect(page.getByLabel('Username', { exact: true })).toHaveValue('unsaved name');
      await audit(page, testInfo, `login-${width}-${appearance}`);
    }
    await navigation(page, 'Register');
    await expect(page.getByLabel('Display name', { exact: true })).toBeVisible();
    for (const appearance of ['dark', 'light']) {
      await mode(page, appearance);
      await audit(page, testInfo, `register-${width}-${appearance}`);
    }
    await mode(page, 'dark');
    await navigation(page, 'Home');
    await expect(page.locator('[data-appearance]')).toHaveAttribute('data-appearance', 'dark');
    await noWrites(page, before);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-appearance]')).toHaveAttribute('data-appearance', 'light');
    await mode(page, 'light');
    await noWrites(page, before);
    await page.getByRole('button', { name: 'Switch to dark mode' }).focus();
    await page.keyboard.press('Space');
    await expect(page.locator('[data-appearance]')).toHaveAttribute('data-appearance', 'dark');
    await noWrites(page, before);
  });
}

test('dark writer creates, reads, edits and deletes while preserving ownership, form state and durable empty state', async ({ page }, testInfo) => {
  await seed(page, identity, []);
  await page.goto('/blogs');
  await expect(page.getByRole('heading', { name: 'All Blogs', exact: true })).toBeVisible();
  await resetWrites(page);
  const before = await stored(page);
  await mode(page, 'dark');
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
  await navigation(page, 'Write Blog');
  await page.getByLabel('Title', { exact: true }).fill('Dark authored story');
  await page.getByLabel('Content', { exact: true }).fill('First line\nSecond line');
  await mode(page, 'light');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Dark authored story');
  await mode(page, 'dark');
  await audit(page, testInfo, 'dark-writer-form');
  await noWrites(page, before);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/blog\/[0-9a-f-]+$/);
  const created = JSON.parse((await stored(page)).writespace_posts)[0];
  expect(created).toMatchObject({ title: 'Dark authored story', content: 'First line\nSecond line', authorId: account.id, authorName: account.displayName });
  await expect(page.getByRole('heading', { name: created.title, exact: true })).toBeVisible();
  await expect(page.locator('[data-appearance]')).toHaveAttribute('data-appearance', 'dark');
  await audit(page, testInfo, 'dark-writer-detail');
  await resetWrites(page);
  const saved = await stored(page);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(created.title);
  await noWrites(page, saved);
  await page.getByLabel('Content', { exact: true }).fill('Revised dark content');
  await audit(page, testInfo, 'dark-writer-edit');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('article p')).toHaveText('Revised dark content');
  expect(JSON.parse((await stored(page)).writespace_posts)).toEqual([{ ...created, content: 'Revised dark content' }]);
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('Delete this post? This cannot be undone.');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  expect(JSON.parse((await stored(page)).writespace_posts)).toEqual([]);
  await expect(page.getByText('No posts yet — check back soon!', { exact: true })).toBeVisible();
  await expect(page.locator('[data-appearance]')).toHaveAttribute('data-appearance', 'dark');
  await page.reload();
  await expect(page.getByText('No posts yet — check back soon!', { exact: true })).toBeVisible();
  await mode(page, 'light');
  expect(JSON.parse((await stored(page)).writespace_posts)).toEqual([]);
});

for (const width of [390, 768, 1280]) {
  test(`dark admin dashboard, other-author edit/delete and account create/delete at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page, admin);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    await resetWrites(page);
    const before = await stored(page);
    await mode(page, 'dark');
    await audit(page, testInfo, `admin-${width}-dark`);
    await navigation(page, 'All Blogs');
    await page.getByRole('link', { name: post.title, exact: true }).click();
    await expect(page.getByRole('heading', { name: post.title, exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(post.title);
    await noWrites(page, before);
    await page.getByLabel('Title', { exact: true }).fill('Admin revised story');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Admin revised story', exact: true })).toBeVisible();
    expect(JSON.parse((await stored(page)).writespace_posts)).toEqual([{ ...post, title: 'Admin revised story' }]);
    page.once('dialog', async (dialog) => { await dialog.accept(); });
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    expect(JSON.parse((await stored(page)).writespace_posts)).toEqual([]);
    await navigation(page, 'Dashboard');
    await navigation(page, 'Users');
    await expect(page.getByRole('heading', { name: 'Manage users', exact: true })).toBeVisible();
    await expect(page.locator('[data-appearance]')).toHaveAttribute('data-appearance', 'dark');
    const accounts = width < 768 ? page.getByLabel('Mobile accounts') : page.getByRole('table', { name: 'Accounts' });
    await expect(accounts.getByRole('button', { name: 'Delete admin', exact: true })).toBeDisabled();
    await page.getByLabel('Display name', { exact: true }).fill('Created in dark');
    await page.getByLabel('Username', { exact: true }).fill('darkwriter');
    await page.getByLabel('Password', { exact: true }).fill('demo-only');
    await page.getByLabel('Role', { exact: true }).selectOption('user');
    await audit(page, testInfo, `users-${width}-dark-form`);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    const created = JSON.parse((await stored(page)).writespace_users).find((record) => record.username === 'darkwriter');
    expect(created).toMatchObject({ displayName: 'Created in dark', role: 'user', password: 'demo-only' });
    await expect(accounts.getByRole('button', { name: 'Delete darkwriter', exact: true })).toBeVisible();
    await resetWrites(page);
    const saved = await stored(page);
    await mode(page, 'light');
    await audit(page, testInfo, `users-${width}-light`);
    await mode(page, 'dark');
    await noWrites(page, saved);
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Delete this account? This cannot be undone.');
      await dialog.accept();
    });
    await accounts.getByRole('button', { name: 'Delete darkwriter', exact: true }).click();
    await expect(accounts.getByRole('button', { name: 'Delete darkwriter', exact: true })).toHaveCount(0);
    expect(JSON.parse((await stored(page)).writespace_users)).toEqual([account]);
    expect(JSON.parse((await stored(page)).writespace_session)).toEqual(admin);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Manage users', exact: true })).toBeVisible();
    await expect(page.locator('[data-appearance]')).toHaveAttribute('data-appearance', 'light');
    await mode(page, 'light');
  });
}

test('unknown entry and denied storage leave the shared mode control usable with safe default', async ({ page }, testInfo) => {
  await seed(page);
  await page.goto('/appearance-unknown');
  await expect(page.getByRole('main')).toBeVisible();
  await page.evaluate(() => {
    Storage.prototype.getItem = function getItem() { throw new DOMException('Denied', 'SecurityError'); };
    Storage.prototype.setItem = function setItem() { throw new DOMException('Denied', 'SecurityError'); };
  });
  await mode(page, 'light');
  await mode(page, 'dark');
  await audit(page, testInfo, 'unknown-dark-denied-storage');
  await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByText(/Post changes are disabled/)).toBeVisible();
  await expect(page.locator('[data-appearance]')).toHaveAttribute('data-appearance', 'dark');
  await mode(page, 'light');
});
