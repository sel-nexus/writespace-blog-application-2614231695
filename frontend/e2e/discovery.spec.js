/** Cover discovery journeys through implemented auth, role views, and the unknown-route fallback. */
import { test, expect, seedLocalData, captureView } from './fixtures.js';
import { makePost, user, session } from '../tests/fixtures.js';
import { POSTS_KEY, USERS_KEY, SESSION_KEY, DEMO_ADMIN } from '../src/utils/storage.js';

// Assert literal approved copy independently; Node specs must not import JSX components.
const DEMO_MESSAGE = 'Demo only: do not enter real passwords or sensitive information. '
  + 'Accounts and posts are stored in this browser and are not protected or synced.';
const STORAGE_WARNING = 'Local data could not be read. It has not been changed.';
const tagline = 'Your thoughts. Your space. Beautifully simple.';

test('empty discovery and CTA/footer navigation execute only after activation', async ({ page }, testInfo) => {
  await seedLocalData(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(tagline);
  for (const name of ['Write Freely', 'Private & Local', 'Instant & Fast']) {
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
  await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
  await expect(page.getByRole('note')).toHaveText(DEMO_MESSAGE);
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await captureView(page, testInfo, 'empty-desktop');

  const primary = page.getByRole('navigation', { name: 'Primary' });
  for (const [name, path, heading] of [
    ['Start Reading', '/login', 'Sign in'],
    ['Get Started Free', '/register', 'Create account'],
    ['View all blogs', '/login', 'Sign in'],
  ]) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await primary.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tagline);
  }
  const footer = page.getByRole('navigation', { name: 'Footer' });
  for (const [name, path, heading] of [
    ['All Blogs', '/login', 'Sign in'],
    ['Login', '/login', 'Sign in'],
    ['Register', '/register', 'Create account'],
  ]) {
    await footer.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await footer.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tagline);
  }
  await footer.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByText(`© ${new Date().getFullYear()} WriteSpace`)).toBeVisible();
});

test('latest three previews preserve escaped text, ordering and browser data across navigation/reload', async ({ page }, testInfo) => {
  const posts = [makePost(1), makePost(3), makePost(2), {
    ...makePost(4), content: '<img src=x onerror=alert(1)>\n' + 'x'.repeat(120) + 'OMITTED_SUFFIX',
    authorId: DEMO_ADMIN.userId, authorName: 'Admin',
  }];
  await seedLocalData(page, { [POSTS_KEY]: JSON.stringify(posts) });
  await page.goto('/');
  const cards = page.getByRole('article').filter({ has: page.getByRole('link') });
  await expect(cards).toHaveCount(3);
  await expect(cards.getByRole('heading')).toHaveText(['Story 4', 'Story 3', 'Story 2']);
  await expect(page.getByRole('link', { name: 'Story 1', exact: true })).toHaveCount(0);
  await expect(cards.first().locator('p')).toHaveText(posts[3].content.slice(0, 120));
  await expect(cards.first().getByRole('img', { name: 'Admin avatar' })).toBeVisible();
  await expect(cards.first().locator('time')).toHaveText('Oct 04, 2026');
  await expect(page.locator('main img')).toHaveCount(0);
  await captureView(page, testInfo, 'latest-desktop');

  await page.getByRole('link', { name: 'Story 4', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(cards).toHaveCount(3);
  await page.reload();
  await expect(cards.getByRole('heading')).toHaveText(['Story 4', 'Story 3', 'Story 2']);
  expect(await page.evaluate((key) => localStorage.getItem(key), POSTS_KEY)).toBe(JSON.stringify(posts));
});

test('corrupt collections remain unchanged with exact visible warning', async ({ page }, testInfo) => {
  const raw = '{broken posts';
  await seedLocalData(page, { [POSTS_KEY]: raw });
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveText(STORAGE_WARNING);
  await expect(page.getByText('No posts yet — check back soon!')).toHaveCount(0);
  await captureView(page, testInfo, 'corrupt-desktop');
  await page.getByRole('link', { name: 'Start Reading' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('alert')).toHaveText(STORAGE_WARNING);
  expect(await page.evaluate((key) => localStorage.getItem(key), POSTS_KEY)).toBe(raw);
});

test('mobile discovery stacks previews and closes menu after a clicked route', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedLocalData(page, { [POSTS_KEY]: JSON.stringify([makePost(1), makePost(2), makePost(3)]) });
  await page.goto('/');
  const primary = page.getByRole('navigation', { name: 'Primary' });
  await expect(primary).toBeHidden();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(primary).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
  await captureView(page, testInfo, 'mobile-menu');
  await primary.getByRole('link', { name: 'All Blogs', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in', exact: true })).toBeVisible();
  await expect(primary).toBeHidden();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await primary.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(primary).toBeHidden();
  const cards = page.getByRole('article').filter({ has: page.getByRole('link') });
  await expect(cards).toHaveCount(3);
  const boxes = await cards.evaluateAll((elements) => elements.map((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y };
  }));
  expect(boxes[0].x).toBe(boxes[1].x);
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await captureView(page, testInfo, 'latest-mobile');
});

test('resolved registered identity offers role home and logout persists across reload', async ({ page }) => {
  await seedLocalData(page, { [USERS_KEY]: JSON.stringify([user]), [SESSION_KEY]: JSON.stringify(session) });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByText(user.displayName)).toBeVisible();
  await page.getByRole('link', { name: 'WriteSpace home' }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('heading', { level: 1, name: 'All Blogs', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(tagline);
  await page.getByRole('button', { name: 'Logout' }).click();
  expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY)).toBeNull();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Logout' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Login' })).toBeVisible();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), USERS_KEY)).toEqual([user]);
});

for (const [name, raw] of [['empty', null], ['corrupt', '{broken mobile posts']]) {
  test(`mobile ${name} discovery remains readable without overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedLocalData(page, raw === null ? {} : { [POSTS_KEY]: raw });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tagline);
    if (raw === null) {
      await expect(page.getByText('No posts yet — check back soon!')).toBeVisible();
    } else {
      await expect(page.getByRole('alert')).toHaveText(STORAGE_WARNING);
      expect(await page.evaluate((key) => localStorage.getItem(key), POSTS_KEY)).toBe(raw);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await captureView(page, testInfo, `${name}-mobile`);
  });
}

test('mobile fixed administrator navigation uses crown and role links', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedLocalData(page, { [SESSION_KEY]: JSON.stringify(DEMO_ADMIN) });
  await page.goto('/');
  const primary = page.getByRole('navigation', { name: 'Primary' });
  for (const [name, path, heading] of [
    ['Dashboard', '/admin', 'Admin dashboard'],
    ['Users', '/users', 'Manage users'],
    ['Write Blog', '/write', 'Write a post'],
  ]) {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(primary.getByRole('img', { name: 'Admin avatar' })).toBeVisible();
    await primary.getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(primary).toBeHidden();
    await page.getByRole('button', { name: 'Open menu' }).click();
    await primary.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tagline);
    await expect(primary).toBeHidden();
  }
  await page.getByRole('button', { name: 'Open menu' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await captureView(page, testInfo, 'admin-mobile-menu');
});

for (const [entry, path, heading] of [
  ['/unavailable/deep-link', '/unavailable/deep-link', 'Page not found'],
  ['/login', '/login', 'Sign in'],
  ['/blogs', '/login', 'Sign in'],
  ['/blog/unknown', '/login', 'Sign in'],
  ['/admin', '/login', 'Sign in'],
  ['/users', '/login', 'Sign in'],
]) {
  test(`production direct entry ${entry} receives the correct SPA view or guest redirect`, async ({ page }) => {
    await seedLocalData(page);
    const response = await page.goto(entry);
    expect(response.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Footer' }).getByRole('link', { name: 'Home', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(tagline);
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
  });
}
