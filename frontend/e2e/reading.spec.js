/** Exercise real browser-local reading; the shared automatic fixture rejects console errors. */
import { test, expect, seedLocalData, captureView } from './fixtures.js';
import { DEMO_ADMIN, POSTS_KEY, SESSION_KEY, USERS_KEY } from '../src/utils/storage.js';
import { makePost, post, secondUser, session, user } from '../tests/fixtures.js';

const registeredAdmin = { ...secondUser, role: 'admin' };
const adminSession = {
  userId: registeredAdmin.id,
  username: registeredAdmin.username,
  displayName: registeredAdmin.displayName,
  role: registeredAdmin.role,
};

/**
 * Prepare first-entry browser fixtures once without mocks or intercepts.
 * Args:
 *   page: Browser page before initial navigation.
 *   posts: Real local post records.
 *   identity: Active local session or null.
 *   users: Real registered records.
 * Returns:
 *   Promise resolved when the shared one-time initialization script is installed.
 */
async function seed(page, posts = [post], identity = session, users = [user, secondUser]) {
  const values = { [POSTS_KEY]: JSON.stringify(posts), [USERS_KEY]: JSON.stringify(users) };
  if (identity) values[SESSION_KEY] = JSON.stringify(identity);
  await seedLocalData(page, values);
}

/**
 * Read real persisted posts without mutating storage.
 * Args:
 *   page: Browser page on the app origin.
 * Returns:
 *   Promise resolving to parsed current posts.
 */
async function storedPosts(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), POSTS_KEY);
}

for (const [width, columns] of [[390, 1], [768, 2], [1280, 3]]) {
  test(`all posts and responsive ${columns}-column grid at ${width}px, then detail and back`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const posts = [makePost(1), makePost(2), makePost(3), makePost(4)];
    posts[3].content = 'x'.repeat(120) + 'HIDDEN_SUFFIX';
    await seed(page, posts);
    await page.goto('/blogs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('All Blogs');
    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(4);
    await expect(cards.getByRole('heading')).toHaveText(['Story 4', 'Story 3', 'Story 2', 'Story 1']);
    await expect(cards.first().getByText('x'.repeat(120), { exact: true })).toBeVisible();
    await expect(page.getByText(/HIDDEN_SUFFIX/)).toHaveCount(0);
    await expect(cards.first().getByText(user.displayName, { exact: true })).toBeVisible();
    await expect(cards.first().locator('time')).toHaveText('Oct 04, 2026');
    await expect(cards.first().getByRole('img', { name: 'User avatar' })).toBeVisible();
    const grid = page.locator('[aria-label="Blog posts"]');
    await expect.poll(() => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(columns);
    expect(await page.locator('main section').evaluate((element) => getComputedStyle(element).maxWidth)).toBe('1152px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await storedPosts(page)).toEqual(posts);
    await captureView(page, testInfo, `reading-${width}`);
    await cards.first().getByRole('link', { name: 'Story 4', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/blog/${posts[3].id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Story 4');
    await expect(page.getByRole('article').getByText(posts[3].content, { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back to All Blogs' }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    await expect(cards).toHaveCount(4);
    await page.reload();
    await expect(cards).toHaveCount(4);
    expect(await storedPosts(page)).toEqual(posts);
  });
}

test('full multiline markup remains escaped and public previews remain unmanaged', async ({ page }, testInfo) => {
  const malicious = {
    ...post,
    title: '<script>title</script>',
    authorName: '<b>Writer</b>',
    content: '<img src=x onerror=alert(1)>\nSecond line\n' + 'x'.repeat(160),
  };
  await seed(page, [malicious], DEMO_ADMIN);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: malicious.title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/blog/${post.id}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(malicious.title);
  await expect(page.getByRole('article').getByText(malicious.authorName, { exact: true })).toBeVisible();
  const content = page.getByRole('article').locator('p');
  expect(await content.textContent()).toBe(malicious.content);
  expect(await content.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('pre-wrap');
  await expect(page.locator('main script, main img, main b')).toHaveCount(0);
  await captureView(page, testInfo, 'escaped-detail');
  await page.reload();
  expect(await content.textContent()).toBe(malicious.content);
  expect(await storedPosts(page)).toEqual([malicious]);
});

for (const identity of [session, DEMO_ADMIN, adminSession]) {
  test(`${identity.username} declines then accepts deletion from detail and reload proves persistence`, async ({ page }) => {
    const remaining = makePost(1);
    await seed(page, [remaining, post], identity, [user, registeredAdmin]);
    await page.goto('/blogs');
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(2);
    expect(await storedPosts(page)).toEqual([remaining, post]);
    await page.getByRole('link', { name: post.title, exact: true }).click();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveAttribute('href', `/edit/${post.id}`);
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/blog/${post.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(post.title);
    expect(await storedPosts(page)).toEqual([remaining, post]);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(post.title);
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.accept();
    });
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    await expect(page.getByRole('link', { name: post.title, exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: remaining.title, exact: true })).toBeVisible();
    expect(await storedPosts(page)).toEqual([remaining]);
    await page.reload();
    await expect(page.getByRole('article')).toHaveCount(1);
    expect(await storedPosts(page)).toEqual([remaining]);
  });
}

test('owner list Delete declines unchanged then accepts and persists empty presentation', async ({ page }, testInfo) => {
  await seed(page);
  await page.goto('/blogs');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('link', { name: post.title, exact: true })).toBeVisible();
  expect(await storedPosts(page)).toEqual([post]);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('No posts yet — check back soon!', { exact: true })).toBeVisible();
  expect(await storedPosts(page)).toEqual([]);
  await page.reload();
  await expect(page.getByRole('article')).toHaveCount(0);
  await expect(page.getByText('No posts yet — check back soon!', { exact: true })).toBeVisible();
  await captureView(page, testInfo, 'reading-empty');
});

test('other writer can read but has no management controls on list or detail', async ({ page }) => {
  const reader = { userId: secondUser.id, username: secondUser.username, displayName: secondUser.displayName, role: 'user' };
  await seed(page, [post], reader);
  await page.goto('/blogs');
  await expect(page.getByRole('article').getByText(post.authorName, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: post.title, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(post.title);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
  expect(await storedPosts(page)).toEqual([post]);
});

for (const path of ['/blogs', `/blog/${post.id}`]) {
  test(`guest redirect from ${path} does not expose stored content`, async ({ page }) => {
    await seed(page, [post], null);
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
    await expect(page.getByText(post.title, { exact: true })).toHaveCount(0);
    expect(await storedPosts(page)).toEqual([post]);
  });
}

for (const id of ['unknown', 'not-a-uuid', post.id.toUpperCase()]) {
  test(`exact not-found state for ${id} with safe back navigation`, async ({ page }, testInfo) => {
    await seed(page);
    await page.goto(`/blog/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Post not found');
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await captureView(page, testInfo, 'post-not-found');
    await page.getByRole('link', { name: 'Back to All Blogs' }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    await expect(page.getByRole('link', { name: post.title, exact: true })).toBeVisible();
    expect(await storedPosts(page)).toEqual([post]);
  });
}

for (const path of ['/blogs', `/blog/${post.id}`]) {
  test(`corrupt posts at ${path} show warning, no actions and survive reload without repair`, async ({ page }, testInfo) => {
    await seedLocalData(page, {
      [POSTS_KEY]: '{broken',
      [USERS_KEY]: JSON.stringify([user]),
      [SESSION_KEY]: JSON.stringify(session),
    });
    await page.goto(path);
    await expect(page.getByRole('alert')).toHaveText('Local data could not be read. It has not been changed.');
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByText('Post not found', { exact: true })).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), POSTS_KEY)).toBe('{broken');
    await captureView(page, testInfo, 'reading-storage-warning');
    await page.reload();
    await expect(page.getByRole('alert')).toHaveText('Local data could not be read. It has not been changed.');
    expect(await page.evaluate((key) => localStorage.getItem(key), POSTS_KEY)).toBe('{broken');
  });
}

test('registered and fixed admin author roles are derived, deleted account author remains readable', async ({ page }) => {
  const adminPost = { ...makePost(2), authorId: registeredAdmin.id, authorName: registeredAdmin.displayName };
  const syntheticPost = { ...makePost(3), authorId: DEMO_ADMIN.userId, authorName: 'Admin' };
  await seed(page, [post, adminPost, syntheticPost], DEMO_ADMIN, [registeredAdmin]);
  await page.goto('/blogs');
  const cards = page.getByRole('article');
  await expect(cards.nth(0).getByRole('img', { name: 'User avatar' })).toBeVisible();
  await expect(cards.nth(0).getByText(post.authorName, { exact: true })).toBeVisible();
  await expect(cards.nth(1).getByRole('img', { name: 'Admin avatar' })).toBeVisible();
  await expect(cards.nth(2).getByRole('img', { name: 'Admin avatar' })).toBeVisible();
  await expect(cards.getByRole('heading')).toHaveText([post.title, syntheticPost.title, adminPost.title]);
  await cards.nth(2).getByRole('link', { name: adminPost.title, exact: true }).click();
  await expect(page.getByRole('article').getByRole('img', { name: 'Admin avatar' })).toBeVisible();
  expect(await storedPosts(page)).toEqual([post, adminPost, syntheticPost]);
});

test('Edit link activates the planned URL without assuming unimplemented editor content', async ({ page }) => {
  await seed(page);
  await page.goto(`/blog/${post.id}`);
  expect(await storedPosts(page)).toEqual([post]);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/edit/${post.id}$`));
  expect(await storedPosts(page)).toEqual([post]);
});
