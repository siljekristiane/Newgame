import { expect, test } from '@playwright/test';
import { goToView, waitUntilSettled, watchForErrors } from './helpers';

test.describe('Duskwood World', () => {
  test('starts without errors and streams in the world', async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto('/');
    await waitUntilSettled(page);
    await page.waitForTimeout(500); // let the 5 Hz snapshot catch up

    const d = await page.evaluate(() => window.__duskwood!.debug());
    expect(d.loadedChunks).toBeGreaterThan(300);
    expect(d.pendingChunks).toBe(0);
    expect(d.lodCounts.every((n) => n > 0)).toBe(true);
    expect(d.drawCalls, 'draw-call budget from CLAUDE.md').toBeLessThanOrEqual(500);
    expect(d.triangles, 'triangle budget from CLAUDE.md').toBeLessThanOrEqual(1_500_000);
    await expect(page.getByText('Verdenskart')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('WASD moves the player', async ({ page }) => {
    await page.goto('/');
    await waitUntilSettled(page);
    const before = await page.evaluate(() => window.__duskwood!.hud());
    await page.locator('canvas').first().focus();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => window.__duskwood!.hud());
    expect(after.z).toBeLessThan(before.z); // camera starts facing north (-Z)
  });

  test('clicking the minimap teleports', async ({ page }) => {
    await page.goto('/');
    await waitUntilSettled(page);
    const map = page.getByRole('img', { name: /Kart over hele verdenen/ });
    const box = (await map.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await page.waitForTimeout(400);
    const hud = await page.evaluate(() => window.__duskwood!.hud());
    expect(hud.x).toBeGreaterThan(29_000);
    expect(hud.x).toBeLessThan(31_000);
    expect(hud.z).toBeGreaterThan(39_000);
    expect(hud.z).toBeLessThan(41_000);
    await waitUntilSettled(page);
  });

  test('every fixed camera view loads', async ({ page }, testInfo) => {
    const errors = watchForErrors(page);
    await page.goto('/');
    await waitUntilSettled(page);
    const views = await page.evaluate(() => window.__duskwood!.views);
    for (const id of views) {
      await goToView(page, id);
      await testInfo.attach(`view-${id}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
    expect(errors).toEqual([]);
  });
});
