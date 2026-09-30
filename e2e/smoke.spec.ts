import { expect, test } from '@playwright/test';
import { goToView, openGame, waitUntilSettled, watchForErrors } from './helpers';

test.describe('Duskwood World', () => {
  test('starts without errors and streams in the world (with textures and shadows)', async ({ page }) => {
    const errors = watchForErrors(page);
    await openGame(page, '', { textures: true, shadows: true });
    await page.waitForTimeout(500); // let the 5 Hz snapshot catch up

    await page.waitForFunction(() => window.__duskwood!.debug().terrainTextures, undefined, { timeout: 60_000 });
    const d = await page.evaluate(() => window.__duskwood!.debug());
    expect(d.loadedChunks).toBeGreaterThan(300);
    expect(d.textures, 'detail textures uploaded').toBeGreaterThanOrEqual(2);
    expect(d.pendingChunks).toBe(0);
    expect(d.lodCounts.every((n) => n > 0)).toBe(true);
    expect(d.drawCalls, 'draw-call budget from CLAUDE.md').toBeLessThanOrEqual(500);
    expect(d.triangles, 'triangle budget from CLAUDE.md').toBeLessThanOrEqual(1_500_000);
    await expect(page.getByText('Verdenskart')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('WASD moves the player', async ({ page }) => {
    await openGame(page);
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
    await openGame(page);
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
    await openGame(page);
    const views = await page.evaluate(() => window.__duskwood!.views);
    for (const id of views) {
      await goToView(page, id);
      await testInfo.attach(`view-${id}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
    expect(errors).toEqual([]);
  });
});

test('the player stands on the rendered ground, also between grid points', async ({ page }) => {
  await openGame(page);
  // Fixed views, plus off-grid points: on the highest ridge, on a slope and in a valley.
  const spots: Array<[string, number, number]> = [
    ['ridge', 34_507.3, 49_511.1],
    ['slope', 37_503.9, 49_805.2],
    ['valley', 47_008.8, 46_992.6],
    ['spawn', 50_000, 50_000],
  ];
  let worstOld = 0;
  for (const [name, x, z] of spots) {
    await page.evaluate(([px, pz]) => window.__duskwood!.teleport(px!, pz!), [x, z]);
    await page.waitForTimeout(300);
    await waitUntilSettled(page);
    const g = (await page.evaluate(() => window.__duskwood!.groundCheck()))!;
    expect(g, `no terrain under the player at ${name}`).not.toBeNull();
    // float32 vertices + ray precision: millimetres at most.
    expect(Math.abs(g.playerY - g.meshY), `gap at ${name}`).toBeLessThan(0.02);
    worstOld = Math.max(worstOld, Math.abs(g.smoothY - g.meshY));
    console.log(`${name}: player ${g.playerY.toFixed(3)} m, mesh ${g.meshY.toFixed(3)} m, old method off by ${(g.smoothY - g.meshY).toFixed(3)} m`);
  }
  expect(worstOld, 'the test spots should include a place where the old method was wrong').toBeGreaterThan(0.05);
});

test('LOD swaps do not pop (geomorphing)', async ({ page }) => {
  // Facing the snowy peak ~3 km away: relief in every LOD ring, so swaps would show.
  await openGame(page, '#v-mountain');
  await page.addStyleTag({ content: '.dw-hud{display:none}' });
  const settle = async () => {
    await page.waitForTimeout(400);
    await waitUntilSettled(page);
    await page.waitForTimeout(1000);
  };
  const shot = async () => (await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 430 } })).toString('base64');
  // Share of pixels that changed noticeably between two screenshots.
  const changed = (a: string, b: string) =>
    page.evaluate(async ([a, b]) => {
      const load = (s: string) =>
        new Promise<HTMLImageElement>((r) => {
          const i = new Image();
          i.onload = () => r(i);
          i.src = `data:image/png;base64,${s}`;
        });
      const [ia, ib] = await Promise.all([load(a!), load(b!)]);
      const c = document.createElement('canvas');
      c.width = ia.width;
      c.height = ia.height;
      const x = c.getContext('2d')!;
      x.drawImage(ia, 0, 0);
      const da = x.getImageData(0, 0, c.width, c.height).data;
      x.drawImage(ib, 0, 0);
      const db = x.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i]! - db[i]!) + Math.abs(da[i + 1]! - db[i + 1]!) + Math.abs(da[i + 2]! - db[i + 2]!) > 24) n++;
      return n / (da.length / 4);
    }, [a, b]);
  // Walk 2 m west across a chunk border (x = 37 km): every LOD ring shifts by one chunk.
  const cross = async (morph: boolean) => {
    await page.evaluate((m) => window.__duskwood!.setGeomorph(m), morph);
    await page.evaluate(() => window.__duskwood!.teleport(37_001, 49_800));
    await settle();
    const before = await shot();
    await page.evaluate(() => window.__duskwood!.teleport(36_999, 49_800));
    await settle();
    return changed(before, await shot());
  };
  const withMorph = await cross(true);
  const withoutMorph = await cross(false);
  console.log(`changed pixels at a LOD swap: ${(withMorph * 100).toFixed(2)} % with geomorphing, ${(withoutMorph * 100).toFixed(2)} % without`);
  // Guard: the spot must actually show LOD swaps, or this test proves nothing.
  expect(withoutMorph, 'test spot too flat to show LOD swaps').toBeGreaterThan(0.008);
  expect(withMorph).toBeLessThan(withoutMorph * 0.8);
});
