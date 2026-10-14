/** Capture browser errors before entry and seed isolated real localStorage fixtures. */
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  browserErrors: [async ({ page }, use) => {
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await use(errors);
    expect(errors, 'Browser console warnings/errors and page errors').toEqual([]);
  }, { auto: true }],
});

export { expect };

/** Seed only on first document entry; later reloads preserve actual application state. */
export async function seedLocalData(page, values = {}) {
  await page.addInitScript((records) => {
    if (sessionStorage.getItem('writespace-test-initialized')) return;
    localStorage.clear();
    for (const [key, value] of Object.entries(records)) localStorage.setItem(key, value);
    sessionStorage.setItem('writespace-test-initialized', 'true');
  }, values);
}

/** Capture screenshot and text-based design evidence for parent review. */
export async function captureView(page, testInfo, name) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  await testInfo.attach(`${name}-html`, { body: await page.content(), contentType: 'text/html' });
  const accessibility = await page.accessibility.snapshot();
  await testInfo.attach(`${name}-accessibility`, {
    body: JSON.stringify(accessibility, null, 2), contentType: 'application/json',
  });
  const styles = await page.locator('h1').evaluate((element) => {
    const heading = getComputedStyle(element);
    const root = getComputedStyle(document.querySelector('main').parentElement);
    return { headingFont: heading.fontFamily, headingSize: heading.fontSize, background: root.backgroundColor };
  });
  await testInfo.attach(`${name}-styles`, { body: JSON.stringify(styles, null, 2), contentType: 'application/json' });
}
