import { expect, type Page } from '@playwright/test';

/** Collects page errors, console errors and failed same-origin requests. */
export function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // Resource failures are checked per request below (web fonts may be offline in CI).
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.url().startsWith('http://localhost') && r.status() >= 400 && !r.url().endsWith('/favicon.ico')) {
      errors.push(`HTTP ${r.status()}: ${r.url()}`);
    }
  });
  return errors;
}

/** Waits until the game exposes its test API and every wanted chunk is loaded. */
export async function waitUntilSettled(page: Page, timeout = 180_000): Promise<void> {
  await page.waitForFunction(() => window.__duskwood !== undefined, undefined, { timeout });
  await page.waitForFunction(() => window.__duskwood!.isSettled(), undefined, { timeout, polling: 250 });
}

export async function goToView(page: Page, id: string): Promise<void> {
  const ok = await page.evaluate((v) => window.__duskwood!.setView(v), id);
  expect(ok, `unknown view ${id}`).toBe(true);
  // The settle flag resets on the next frame; give it a moment before waiting.
  await page.waitForTimeout(300);
  await waitUntilSettled(page);
}
