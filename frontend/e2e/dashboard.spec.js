/** Exercise dashboard journeys with real browser-local data; fixtures reject console and page errors. */
import { test, expect, seedLocalData, captureView } from './fixtures.js';

const user = {
  id: 'bdf27466-18c4-4b8d-9e83-10a44668c590',
  displayName: 'Jamie Writer',
  username: 'jamie',
  password: 'demo-only',
  role: 'user',
  createdAt: '2020-10-14T12:30:00.000Z',
};
const admin = {
  ...user,
  id: 'ef147466-18c4-4b8d-9e83-10a44668c590',
  displayName: 'Robin Admin',
  username: 'robin',
  role: 'admin',
};
const demoSession = { userId: 'writespace-demo-admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const writerSession = { userId: user.id, username: user.username, displayName: user.displayName, role: user.role };
const warning = 'Local data could not be read. It has not been changed.';

/** Create schema-valid posts with deliberately old timestamps and deterministic IDs. */
function makePost(number) {
  return {
    id: `8b1a849e-32e6-4d5a-87f1-${String(number).padStart(12, '0')}`,
    title: `Dashboard story ${number}`,
    content: `Local story ${number}\nSecond line`,
    createdAt: `2020-10-${String(number).padStart(2, '0')}T12:30:00.000Z`,
    authorId: number === 7 ? admin.id : user.id,
    authorName: number === 7 ? admin.displayName : user.displayName,
  };
}

/** Read persisted state without altering it so journeys prove data-layer transitions. */
async function stored(page) {
  return page.evaluate(() => ({
    posts: JSON.parse(localStorage.getItem('writespace_posts')),
    users: JSON.parse(localStorage.getItem('writespace_users')),
    session: JSON.parse(localStorage.getItem('writespace_session')),
  }));
}

/** Locate an exact label's paired displayed count in the dashboard definition list. */
function metric(page, label) {
  return page.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
}

/** Sign in through the real labelled form; initial entry is performed by the calling test. */
async function signInAdmin(page) {
  await page.getByLabel('Username', { exact: true }).fill('admin');
  await page.getByLabel('Password', { exact: true }).fill('admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin dashboard', exact: true })).toBeVisible();
}

/** Activate shared dashboard navigation, opening the mobile menu only if needed. */
async function visitDashboard(page) {
  const navigation = page.getByRole('navigation', { name: 'Primary' });
  if (!(await navigation.isVisible())) await page.getByRole('button', { name: 'Open menu' }).click();
  await navigation.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('real admin login shows exact counts/newest five, writes via quick action, deletes and reloads persisted changes',
  async ({ page }, testInfo) => {
    const posts = [1, 4, 2, 7, 3, 6, 5].map(makePost);
    const users = [user, admin];
    await seedLocalData(page, { writespace_posts: JSON.stringify(posts), writespace_users: JSON.stringify(users) });
    await page.goto('/login');
    await signInAdmin(page);
    await expect(metric(page, 'Total Posts')).toHaveText('7');
    await expect(metric(page, 'Registered Users')).toHaveText('2');
    await expect(metric(page, 'Published Posts')).toHaveText('7');
    await expect(metric(page, 'Drafts')).toHaveText('0');
    await expect(page.getByRole('article')).toHaveCount(5);
    await expect(page.locator('article h3')).toHaveText([7, 6, 5, 4, 3].map((number) => `Dashboard story ${number}`));
    await expect(page.getByRole('article').first().getByRole('img', { name: 'Admin avatar' })).toBeVisible();
    const before = { posts, users, session: demoSession };
    expect(await stored(page)).toEqual(before);
    await captureView(page, testInfo, 'dashboard-populated');
    const actions = page.getByRole('navigation', { name: 'Quick actions' });
    await actions.getByRole('link', { name: 'Write a post', exact: true }).click();
    await expect(page).toHaveURL(/\/write$/);
    expect(await stored(page)).toEqual(before);
    await page.getByLabel('Title', { exact: true }).fill('A dashboard creation');
    await page.getByLabel('Content', { exact: true }).fill('Created through the real quick action\nNo draft status.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page).toHaveURL(/\/blog\/[0-9a-f-]+$/);
    const createdState = await stored(page);
    const created = createdState.posts.find((record) => record.title === 'A dashboard creation');
    expect(created).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/), title: 'A dashboard creation',
      content: 'Created through the real quick action\nNo draft status.',
      createdAt: expect.any(String), authorId: demoSession.userId, authorName: 'Admin',
    });
    expect(Number.isFinite(Date.parse(created.createdAt))).toBe(true);
    expect(createdState.posts).toEqual([created, ...posts]);
    expect(createdState.users).toEqual(users);
    expect(createdState.session).toEqual(demoSession);
    await expect(page.getByRole('heading', { name: created.title, exact: true })).toBeVisible();
    await visitDashboard(page);
    await expect(metric(page, 'Total Posts')).toHaveText('8');
    await expect(metric(page, 'Published Posts')).toHaveText('8');
    await expect(metric(page, 'Registered Users')).toHaveText('2');
    await expect(metric(page, 'Drafts')).toHaveText('0');
    await expect(page.locator('article h3')).toHaveText([created.title, ...[7, 6, 5, 4].map((number) => `Dashboard story ${number}`)]);
    const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: created.title, exact: true }) });
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Delete this post? This cannot be undone.');
      await dialog.dismiss();
    });
    await card.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/admin$/);
    expect(await stored(page)).toEqual(createdState);
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toBe('Delete this post? This cannot be undone.');
      await dialog.accept();
    });
    await card.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    expect(await stored(page)).toEqual(before);
    await page.reload();
    await expect(page.getByRole('article')).toHaveCount(7);
    await expect(page.getByRole('heading', { name: created.title, exact: true })).toHaveCount(0);
    expect(await stored(page)).toEqual(before);
    await visitDashboard(page);
    await expect(metric(page, 'Total Posts')).toHaveText('7');
    await expect(metric(page, 'Published Posts')).toHaveText('7');
    await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('link', { name: 'All Blogs', exact: true }).click();
    await expect(page).toHaveURL(/\/blogs$/);
    await visitDashboard(page);
    await page.getByRole('navigation', { name: 'Quick actions' }).getByRole('link', { name: 'Manage users', exact: true }).click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(page.getByRole('heading', { name: 'Manage users', exact: true })).toBeVisible();
    expect(await stored(page)).toEqual(before);
  },
);

test('guest direct admin entry redirects through the real guard without changing local records', async ({ page }) => {
  const posts = [makePost(1)];
  await seedLocalData(page, { writespace_posts: JSON.stringify(posts), writespace_users: JSON.stringify([user]) });
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Admin dashboard' })).toHaveCount(0);
  expect(await stored(page)).toEqual({ posts, users: [user], session: null });
});

test('ordinary writer direct admin entry returns to blogs with no administrator navigation', async ({ page }) => {
  const posts = [makePost(1)];
  await seedLocalData(page, {
    writespace_posts: JSON.stringify(posts), writespace_users: JSON.stringify([user]),
    writespace_session: JSON.stringify(writerSession),
  });
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/blogs$/);
  await expect(page.getByRole('heading', { name: 'All Blogs', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCount(0);
  expect(await stored(page)).toEqual({ posts, users: [user], session: writerSession });
});

test('mobile missing collections show verified zeros and an explicit empty preview without seeding rows', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedLocalData(page);
  await page.goto('/login');
  await signInAdmin(page);
  for (const label of ['Total Posts', 'Registered Users', 'Published Posts', 'Drafts']) {
    await expect(metric(page, label)).toHaveText('0');
  }
  await expect(page.getByText('No posts yet — check back soon!', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await stored(page)).toEqual({ posts: null, users: null, session: demoSession });
  expect(await page.locator('dl').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await captureView(page, testInfo, 'dashboard-mobile-empty');
});

for (const [badPosts, badUsers] of [[true, false], [false, true], [true, true]]) {
  test(`corrupt collections posts=${badPosts} users=${badUsers} preserve independent counts and raw values`, async ({ page }, testInfo) => {
    const posts = [makePost(1)];
    await seedLocalData(page, {
      writespace_posts: badPosts ? '{broken' : JSON.stringify(posts),
      writespace_users: badUsers ? '{broken' : JSON.stringify([user, admin]),
    });
    await page.goto('/login');
    await signInAdmin(page);
    await expect(metric(page, 'Total Posts')).toHaveText(badPosts ? 'Unavailable' : '1');
    await expect(metric(page, 'Published Posts')).toHaveText(badPosts ? 'Unavailable' : '1');
    await expect(metric(page, 'Registered Users')).toHaveText(badUsers ? 'Unavailable' : '2');
    await expect(metric(page, 'Drafts')).toHaveText('0');
    await expect(page.getByText(warning, { exact: true })).toHaveCount(Number(badPosts) + Number(badUsers));
    await expect(page.getByRole('article')).toHaveCount(badPosts ? 0 : 1);
    await expect(page.getByText('No posts yet — check back soon!', { exact: true })).toHaveCount(0);
    if (badPosts) await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    if (badUsers && !badPosts) {
      await expect(page.getByRole('article').getByRole('img', { name: 'User avatar' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled();
    }
    expect(await page.evaluate(() => ({
      posts: localStorage.getItem('writespace_posts'), users: localStorage.getItem('writespace_users'),
    }))).toEqual({
      posts: badPosts ? '{broken' : JSON.stringify(posts), users: badUsers ? '{broken' : JSON.stringify([user, admin]),
    });
    await captureView(page, testInfo, `dashboard-corrupt-${badPosts}-${badUsers}`);
  });
}
