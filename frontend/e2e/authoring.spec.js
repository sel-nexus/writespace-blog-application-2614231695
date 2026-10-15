/** Exercise real authoring journeys; the shared automatic fixture rejects all browser errors. */
import { test, expect, seedLocalData, captureView } from './fixtures.js';

const account = {
  id: 'bdf27466-18c4-4b8d-9e83-10a44668c590',
  displayName: 'Jamie Writer',
  username: 'jamie',
  password: 'demo-only',
  role: 'user',
  createdAt: '2026-10-14T12:30:00.000Z',
};
const other = {
  ...account,
  id: 'ef147466-18c4-4b8d-9e83-10a44668c590',
  username: 'robin',
  displayName: 'Robin Reader',
};
const identity = { userId: account.id, username: account.username, displayName: account.displayName, role: account.role };
const otherIdentity = { userId: other.id, username: other.username, displayName: other.displayName, role: other.role };
const post = {
  id: '8b1a849e-32e6-4d5a-87f1-3f99c5f0f135',
  title: 'Existing story',
  content: 'First line\nSecond line',
  createdAt: '2026-10-14T12:30:00.000Z',
  authorId: account.id,
  authorName: account.displayName,
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Read all real persisted feature state without modifying it.
 * Args:
 *   page: Browser page on the application origin.
 * Returns:
 *   Parsed posts, users and exact session for state-transition assertions.
 */
async function stored(page) {
  return page.evaluate(() => ({
    posts: JSON.parse(localStorage.getItem('writespace_posts')),
    users: JSON.parse(localStorage.getItem('writespace_users')),
    session: JSON.parse(localStorage.getItem('writespace_session')),
  }));
}

/** Fill the actual labelled editor fields without changing any storage outside the UI. */
async function fillEditor(page, title, content) {
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByLabel('Content', { exact: true }).fill(content);
}

/** Seed each test once through the shared initial-document fixture. */
async function seedWriter(page, posts = [post], session = identity) {
  await seedLocalData(page, {
    writespace_posts: JSON.stringify(posts),
    writespace_users: JSON.stringify([account, other]),
    writespace_session: JSON.stringify(session),
  });
}

test('guest registers, writes, reads, edits, reloads and deletes with exact persisted identity', async ({ page }, testInfo) => {
  await seedLocalData(page, { writespace_bootstrap_v1: JSON.stringify({ version: 1, initialized: true }) });
  await page.goto('/');
  expect(await stored(page)).toEqual({ posts: null, users: null, session: null });
  await page.getByRole('link', { name: 'Get Started Free' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByLabel('Display name', { exact: true }).fill('  Avery Author  ');
  await page.getByLabel('Username', { exact: true }).fill(' AVERY ');
  await page.getByLabel('Password', { exact: true }).fill('demo-only');
  await page.getByLabel('Confirm password', { exact: true }).fill('demo-only');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByText('No posts yet — check back soon!', { exact: true })).toBeVisible();
  const registered = await stored(page);
  expect(registered.users).toHaveLength(1);
  const user = registered.users[0];
  expect(user.id).toMatch(uuid);
  expect(Number.isFinite(Date.parse(user.createdAt))).toBe(true);
  expect(user).toEqual({
    id: user.id, displayName: 'Avery Author', username: 'avery', password: 'demo-only', role: 'user', createdAt: user.createdAt,
  });
  const session = { userId: user.id, username: 'avery', displayName: 'Avery Author', role: 'user' };
  expect(registered.session).toEqual(session);
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await nav.getByRole('link', { name: 'Write Blog', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Write a post', exact: true })).toBeVisible();
  expect(await stored(page)).toEqual(registered);
  const content = '  First line\n\n  Second line\n<script>plain text</script>  ';
  await fillEditor(page, '  A new beginning  ', content);
  await expect(page.getByRole('status')).toHaveText(`${content.length} characters`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const createdState = await stored(page);
  expect(createdState.posts).toHaveLength(1);
  const created = createdState.posts[0];
  expect(created.id).toMatch(uuid);
  expect(Number.isFinite(Date.parse(created.createdAt))).toBe(true);
  expect(created).toEqual({
    id: created.id, title: 'A new beginning', content: content.trim(), createdAt: created.createdAt,
    authorId: user.id, authorName: user.displayName,
  });
  expect(createdState.users).toEqual(registered.users);
  expect(createdState.session).toEqual(session);
  await expect(page).toHaveURL(`/blog/${created.id}`);
  await expect(page.getByRole('heading', { name: created.title, exact: true })).toBeVisible();
  expect(await page.locator('article p').textContent()).toBe(created.content);
  await expect(page.locator('article script')).toHaveCount(0);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page).toHaveURL(`/edit/${created.id}`);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue(created.title);
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue(created.content);
  expect(await stored(page)).toEqual(createdState);
  await fillEditor(page, '  A thoughtful revision  ', '\nRevised first\n\n  Revised second\n');
  await captureView(page, testInfo, 'authoring-edit');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(`/blog/${created.id}`);
  const edited = { ...created, title: 'A thoughtful revision', content: 'Revised first\n\n  Revised second' };
  const expectedState = { posts: [edited], users: registered.users, session };
  expect(await stored(page)).toEqual(expectedState);
  await page.reload();
  await expect(page.getByRole('heading', { name: edited.title, exact: true })).toBeVisible();
  expect(await page.locator('article p').textContent()).toBe(edited.content);
  expect(await stored(page)).toEqual(expectedState);
  await captureView(page, testInfo, 'authoring-reloaded-detail');
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('Delete this post? This cannot be undone.');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByText('No posts yet — check back soon!', { exact: true })).toBeVisible();
  expect(await stored(page)).toEqual({ posts: [], users: registered.users, session });
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(0);
  expect(await stored(page)).toEqual({ posts: [], users: registered.users, session });
});

test('bad input and cancel preserve create/edit data, with mobile stacked actions', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedWriter(page);
  await page.goto('/write');
  const before = await stored(page);
  await expect(page.getByRole('heading', { name: 'Write a post', exact: true })).toBeVisible();
  expect(await page.getByLabel('Content', { exact: true }).evaluate((element) => getComputedStyle(element).minHeight)).toBe('256px');
  expect(await page.getByRole('button', { name: 'Save' }).evaluate((element) => getComputedStyle(element.parentElement).flexDirection))
    .toBe('column');
  await fillEditor(page, '  ', '\n  ');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Title is required.', { exact: true })).toBeVisible();
  await expect(page.getByText('Content is required.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Content', { exact: true })).toHaveAttribute('aria-describedby', 'post-content-error post-content-count');
  expect(await stored(page)).toEqual(before);
  await captureView(page, testInfo, 'authoring-mobile-errors');
  await fillEditor(page, 'Never saved', 'Unsaved creation');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  expect(await stored(page)).toEqual(before);
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: post.title, exact: true }) });
  await card.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Content', { exact: true })).toHaveValue(post.content);
  await fillEditor(page, '', 'valid body');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Title is required.', { exact: true })).toBeVisible();
  expect(await stored(page)).toEqual(before);
  await fillEditor(page, 'Never saved edit', 'Unsaved revision');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(`/blog/${post.id}`);
  await expect(page.getByRole('heading', { name: post.title, exact: true })).toBeVisible();
  expect(await page.locator('article p').textContent()).toBe(post.content);
  expect(await stored(page)).toEqual(before);
  await page.reload();
  expect(await stored(page)).toEqual(before);
});

for (const path of ['/write', `/edit/${post.id}`]) {
  test(`guest direct entry ${path} redirects to login without changing posts`, async ({ page }) => {
    await seedLocalData(page, { writespace_posts: JSON.stringify([post]), writespace_users: JSON.stringify([account]) });
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    expect(await stored(page)).toEqual({ posts: [post], users: [account], session: null });
    await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
  });
}

test('another writer direct edit redirects to blogs and detail has no management controls', async ({ page }) => {
  await seedWriter(page, [post], otherIdentity);
  await page.goto(`/edit/${post.id}`);
  await expect(page).toHaveURL(/\/blogs$/);
  const expected = { posts: [post], users: [account, other], session: otherIdentity };
  expect(await stored(page)).toEqual(expected);
  await page.getByRole('link', { name: post.title, exact: true }).click();
  await expect(page).toHaveURL(`/blog/${post.id}`);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  expect(await stored(page)).toEqual(expected);
});

test('missing exact edit target offers a safe back link without creating a post', async ({ page }) => {
  await seedWriter(page);
  await page.goto('/edit/missing');
  await expect(page.getByRole('heading', { name: 'Post not found', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to All Blogs', exact: true }).click();
  await expect(page).toHaveURL(/\/blogs$/);
  expect(await stored(page)).toEqual({ posts: [post], users: [account, other], session: identity });
});

for (const path of ['/write', `/edit/${post.id}`]) {
  test(`corrupt local posts disable authoring at ${path} without repairing data`, async ({ page }, testInfo) => {
    await seedLocalData(page, {
      writespace_posts: '{broken', writespace_users: JSON.stringify([account]), writespace_session: JSON.stringify(identity),
    });
    await page.goto(path);
    await expect(page.getByRole('alert')).toHaveText('Local data could not be read. It has not been changed.');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => localStorage.getItem('writespace_posts'))).toBe('{broken');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('writespace_session')))).toEqual(identity);
    await captureView(page, testInfo, 'authoring-storage-warning');
  });
}
