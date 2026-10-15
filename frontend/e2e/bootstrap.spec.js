/** Verify starter discovery and durable empty state against the real browser application. */
import { test, expect, seedLocalData, captureView } from './fixtures.js';
import { DEMO_ADMIN, INITIALIZATION_KEY, POSTS_KEY, USERS_KEY, SESSION_KEY } from '../src/utils/storage.js';
import { post } from '../tests/fixtures.js';

const marker = { version: 1, initialized: true };

/** Read actual persisted JSON, without substituting any application behavior. */
async function storedPosts(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), POSTS_KEY);
}

/** Resolve primary navigation apart from matching footer destinations. */
function primaryLink(page, name) {
  return page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name });
}

/** Locate an exact label's paired displayed count in the dashboard definition list. */
function metric(page, label) {
  return page.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
}

/** Inject genuine browser storage exceptions for one key and operation. */
async function denyStorage(page, key, operation, name) {
  await page.addInitScript(({ failedKey, method, errorName }) => {
    const original = Storage.prototype[method];
    Storage.prototype[method] = function (requestedKey, ...args) {
      if (this === localStorage && requestedKey === failedKey) throw new DOMException('', errorName);
      return original.call(this, requestedKey, ...args);
    };
  }, { failedKey: key, method: operation, errorName: name });
}

test('clean first use shows persisted previews and reload never duplicates or creates users', async ({ page }, testInfo) => {
  await seedLocalData(page);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Welcome to WriteSpace' })).toBeVisible();
  const posts = await storedPosts(page);
  expect(posts.length).toBeGreaterThan(0);
  expect(posts.length).toBeLessThanOrEqual(3);
  for (const record of posts) {
    await expect(page.getByRole('link', { name: record.title })).toBeVisible();
    expect(record.authorId).toBe(DEMO_ADMIN.userId);
    expect(record.authorName).toBe(DEMO_ADMIN.displayName);
  }
  expect(await page.evaluate((key) => localStorage.getItem(key), USERS_KEY)).toBeNull();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), INITIALIZATION_KEY)).toEqual(marker);
  await captureView(page, testInfo, 'starter-discovery');
  await page.reload();
  await expect(page.getByRole('link', { name: posts[0].title })).toBeVisible();
  expect(await storedPosts(page)).toEqual(posts);
  await page.getByRole('link', { name: posts[0].title }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await primaryLink(page, 'Home').click();
  expect(await storedPosts(page)).toEqual(posts);
});

test('admin deletes every starter and reload preserves empty discovery and zero post counts', async ({ page }) => {
  await seedLocalData(page, { [SESSION_KEY]: JSON.stringify(DEMO_ADMIN) });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Welcome to WriteSpace' })).toBeVisible();
  const posts = await storedPosts(page);
  await primaryLink(page, 'Dashboard').click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: /admin dashboard/i })).toBeVisible();
  await expect(metric(page, 'Total Posts')).toHaveText(String(posts.length));
  await expect(metric(page, 'Registered Users')).toHaveText('0');
  page.on('dialog', (dialog) => dialog.accept());
  for (let index = 0; index < posts.length; index += 1) {
    await page.getByRole('button', { name: /delete/i }).first().click();
    await expect(page).toHaveURL(/\/blogs$/);
    await expect.poll(async () => (await storedPosts(page)).length).toBe(posts.length - index - 1);
  }
  await primaryLink(page, 'Dashboard').click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(metric(page, 'Total Posts')).toHaveText('0');
  await expect(metric(page, 'Published Posts')).toHaveText('0');
  await primaryLink(page, 'Home').click();
  await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
  await page.reload();
  await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
  expect(await storedPosts(page)).toEqual([]);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), INITIALIZATION_KEY)).toEqual(marker);
});

for (const posts of [[], [post]]) {
  test(`existing ${posts.length ? 'populated' : 'empty'} array is preserved without marker`, async ({ page }) => {
    const raw = ` ${JSON.stringify(posts)} `;
    await seedLocalData(page, { [POSTS_KEY]: raw });
    await page.goto('/');
    if (posts.length) await expect(page.getByRole('link', { name: post.title })).toBeVisible();
    else await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), POSTS_KEY)).toBe(raw);
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), INITIALIZATION_KEY)).toEqual(marker);
    await page.reload();
    expect(await storedPosts(page)).toEqual(posts);
  });
}

for (const raw of [null, '[]']) {
  test(`initialized ${raw === null ? 'missing' : 'empty'} posts stay empty on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const values = { [INITIALIZATION_KEY]: JSON.stringify(marker) };
    if (raw !== null) values[POSTS_KEY] = raw;
    await seedLocalData(page, values);
    await page.goto('/');
    await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
    await page.reload();
    await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), POSTS_KEY)).toBe(raw);
  });
}

for (const [key, raw] of [[INITIALIZATION_KEY, '{bad'], [INITIALIZATION_KEY, '{}'],
  [POSTS_KEY, '{bad'], [POSTS_KEY, '{}'], [POSTS_KEY, '[{}]']]) {
  test(`malformed ${key} ${raw} is preserved and editors are blocked`, async ({ page }) => {
    await seedLocalData(page, { [key]: raw, [SESSION_KEY]: JSON.stringify(DEMO_ADMIN) });
    await page.goto('/');
    await expect(page.getByText(/Local post initialization could not be completed/)).toBeVisible();
    expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe(raw);
    await primaryLink(page, 'Write Blog').click();
    await expect(page.getByRole('status', { name: 'Local post initialization' })).toContainText('Post changes are disabled');
    const before = await page.evaluate(() => ({ ...localStorage }));
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    for (const input of await page.getByRole('textbox').all()) await expect(input).toBeDisabled();
    await page.getByRole('button', { name: 'Save' }).evaluate((button) => {
      button.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
    expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe(raw);
  });
}

for (const key of [INITIALIZATION_KEY, POSTS_KEY]) {
  test(`denied ${key} read never seeds`, async ({ page }) => {
    await seedLocalData(page);
    await denyStorage(page, key, 'getItem', 'SecurityError');
    await page.goto('/');
    await expect(page.getByText(/Local post initialization could not be completed/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await expect(page.getByRole('link', { name: 'Welcome to WriteSpace' })).toHaveCount(0);
  });
}

test('post quota failure reports unsaved starters without a completion marker', async ({ page }) => {
  await seedLocalData(page);
  await denyStorage(page, POSTS_KEY, 'setItem', 'QuotaExceededError');
  await page.goto('/');
  await expect(page.getByText(/Starter posts were not saved/)).toBeVisible();
  expect(await storedPosts(page)).toBeNull();
  expect(await page.evaluate((key) => localStorage.getItem(key), INITIALIZATION_KEY)).toBeNull();
});

test('marker quota failure retains readable posts, disables deletes, and retry cannot duplicate', async ({ page }) => {
  await seedLocalData(page, { [SESSION_KEY]: JSON.stringify(DEMO_ADMIN) });
  // sessionStorage controls only the injected browser exception, never application results.
  await page.addInitScript((key) => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (requestedKey, value) {
      if (requestedKey === key && !sessionStorage.getItem('allow-marker-write')) {
        throw new DOMException('', 'QuotaExceededError');
      }
      return setItem.call(this, requestedKey, value);
    };
  }, INITIALIZATION_KEY);
  await page.goto('/');
  await expect(page.getByText(/Saved posts remain available/)).toBeVisible();
  const posts = await storedPosts(page);
  for (const record of posts) await expect(page.getByRole('link', { name: record.title })).toBeVisible();
  await primaryLink(page, 'All Blogs').click();
  const deletes = page.getByRole('button', { name: /delete/i });
  expect(await deletes.count()).toBeGreaterThan(0);
  for (const button of await deletes.all()) await expect(button).toBeDisabled();
  await primaryLink(page, 'Write Blog').click();
  const before = await page.evaluate(() => ({ ...localStorage }));
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  for (const input of await page.getByRole('textbox').all()) await expect(input).toBeDisabled();
  await page.getByRole('button', { name: 'Save' }).evaluate((button) => {
    button.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  expect(await storedPosts(page)).toEqual(posts);
  await page.evaluate(() => sessionStorage.setItem('allow-marker-write', 'true'));
  await page.reload();
  await expect(page.getByRole('textbox').first()).toBeVisible();
  expect(await storedPosts(page)).toEqual(posts);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), INITIALIZATION_KEY)).toEqual(marker);
});

test('unknown direct entry leaves all bytes untouched until safe home navigation', async ({ page }) => {
  await seedLocalData(page, { [SESSION_KEY]: '{bad' });
  await page.goto('/unknown/deep-link');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({ [SESSION_KEY]: '{bad' });
  await page.getByRole('link', { name: 'Back to Home' }).click();
  await expect(page.getByRole('link', { name: 'Welcome to WriteSpace' })).toBeVisible();
  expect((await storedPosts(page)).length).toBeGreaterThan(0);
});
