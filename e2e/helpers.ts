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

/**
 * Opens the game at an optional `#v-<id>` view, with the clock stopped at 15:00.
 * Detail textures, shadows and vegetation are switched off unless asked for: under software rendering (CI) they make every frame
 * several times slower, and most tests are about streaming, movement or ground
 * contact, not texturing. The first smoke test and `npm run measure` keep them on.
 */
export async function openGame(page: Page, hash = '', { textures = false, shadows = false, vegetation = false } = {}): Promise<void> {
  await page.goto(`/${hash}`);
  await page.waitForFunction(() => window.__duskwood !== undefined, undefined, { timeout: 60_000 });
  // Fixed light, so screenshots taken seconds apart are comparable.
  await page.evaluate(() => window.__duskwood!.setTime(15, true));
  if (!textures) await page.evaluate(() => window.__duskwood!.setTerrainTextures(false));
  if (!shadows) await page.evaluate(() => window.__duskwood!.setShadows(false));
  if (!vegetation) await page.evaluate(() => window.__duskwood!.setVegetation(false));
  await waitUntilSettled(page);
}
