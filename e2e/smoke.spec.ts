import { expect, test } from '@playwright/test';
import { goToView, openGame, waitUntilSettled, watchForErrors } from './helpers';

test.describe('Duskwood World', () => {
  test('starts without errors and streams in the world (with textures, shadows and vegetation)', async ({ page }) => {
    const errors = watchForErrors(page);
    await openGame(page, '', { textures: true, shadows: true, vegetation: true });
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

  test('rain, snow and overcast skies render without errors', async ({ page }) => {
    const errors = watchForErrors(page);
    await openGame(page);
    await page.evaluate(() => window.__duskwood!.setWeather('rain'));
    await page.waitForTimeout(3000); // a few frames of rain at the spawn
    await page.evaluate(() => window.__duskwood!.teleport(34_600, 49_700)); // the cold peak: snow
    await page.waitForTimeout(300);
    await waitUntilSettled(page);
    await page.waitForTimeout(2000);
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

  test('the wardrobe (K): pick a starter look, try a locked item, save, and no walking while it is open', async ({ page }) => {
    const errors = watchForErrors(page);
    await openGame(page);
    await page.keyboard.press('KeyK');
    const dialog = page.getByRole('dialog', { name: 'Klesskap' });
    await expect(dialog).toBeVisible();

    // Movement keys are ignored while the wardrobe is open.
    const before = await page.evaluate(() => window.__duskwood!.hud());
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(800);
    await page.keyboard.up('KeyW');
    const still = await page.evaluate(() => window.__duskwood!.hud());
    expect(Math.abs(still.z - before.z)).toBeLessThan(0.05);

    // The starter look (once) gives its clothes.
    await expect(dialog.getByRole('tab', { name: 'Startfigur' })).toHaveAttribute('aria-selected', 'true');
    await dialog.getByRole('button', { name: 'Velg', exact: true }).first().click();
    await dialog.getByRole('tab', { name: 'Ytterplagg' }).click();
    await expect(dialog.getByText('På deg')).toBeVisible();

    // A quest item can be tried on but not saved.
    await expect(dialog.getByText('Låst: Fullfør «Stien inn i skogen»')).toBeVisible();
    const save = dialog.getByRole('button', { name: 'Lagre utseende' });
    const cloakCard = dialog.locator('.dw-ward-card', { hasText: 'Skogkappe' });
    await cloakCard.getByRole('button', { name: 'Prøv' }).click();
    await expect(save).toBeDisabled();
    await cloakCard.locator('..').locator('.dw-ward-card', { hasText: 'Lavendelkåpe' }).getByRole('button', { name: 'Ta på' }).click();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(dialog).toBeHidden();

    // Saved in the browser, and the starter choice is gone next time.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('duskwood.wardrobe.v1') ?? '{}'));
    expect(stored.starterChosen).toBe(true);
    expect(stored.appearance.outfit.outer.id).toBe('outer_lavender_coat');
    await page.keyboard.press('KeyK');
    await expect(dialog.getByRole('tab', { name: 'Startfigur' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('the big map opens with M and teleports on click; N, P and H hide the panels', async ({ page }) => {
    await openGame(page);
    await page.keyboard.press('KeyM');
    const dialog = page.getByRole('dialog', { name: 'Stort kart' });
    await expect(dialog).toBeVisible();
    const map = dialog.getByRole('img', { name: /Stort kart over hele verdenen/ });
    const box = (await map.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.25);
    await expect(dialog).toBeHidden();
    await page.waitForTimeout(400);
    const hud = await page.evaluate(() => window.__duskwood!.hud());
    expect(hud.x).toBeGreaterThan(69_000);
    expect(hud.x).toBeLessThan(71_000);
    expect(hud.z).toBeGreaterThan(24_000);
    expect(hud.z).toBeLessThan(26_000);

    // N hides the minimap completely; the help line offers it back.
    const minimap = page.getByText('Verdenskart');
    const position = page.getByText('Posisjon', { exact: true });
    await page.keyboard.press('KeyN');
    await expect(minimap).toBeHidden();
    await page.getByRole('button', { name: /Vis kart/ }).click();
    await expect(minimap).toBeVisible();
    // P hides the position panel (also its own button); H hides or shows both.
    await page.keyboard.press('KeyP');
    await expect(position).toBeHidden();
    await page.getByRole('button', { name: /Vis posisjon/ }).click();
    await expect(position).toBeVisible();
    await page.getByTitle('Skjul posisjonen').click();
    await expect(position).toBeHidden();
    await page.keyboard.press('KeyH'); // one hidden: H shows both
    await expect(position).toBeVisible();
    await expect(minimap).toBeVisible();
    await page.keyboard.press('KeyH');
    await expect(position).toBeHidden();
    await expect(minimap).toBeHidden();
    await expect(page.getByRole('button', { name: /Vis kart/ })).toBeVisible();
    await page.keyboard.press('KeyH');
    await expect(minimap).toBeVisible();
  });

  test('sound unlocks on the first click, U mutes it, wind, steps and rain play, and T talks', async ({ page }) => {
    const errors = watchForErrors(page);
    await openGame(page);
    expect((await page.evaluate(() => window.__duskwood!.audio())).unlocked).toBe(false);
    const canvas = page.locator('canvas').first();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => window.__duskwood!.audio().unlocked);
    await page.keyboard.press('Escape'); // release pointer lock if the browser granted it
    expect((await page.evaluate(() => window.__duskwood!.audio())).muted).toBe(false);
    await page.keyboard.press('KeyU');
    expect((await page.evaluate(() => window.__duskwood!.audio())).muted).toBe(true);
    await page.keyboard.press('KeyU');
    expect((await page.evaluate(() => window.__duskwood!.audio())).muted).toBe(false);

    // Wind is always there; walking makes footsteps; rain is heard when it rains.
    await page.waitForFunction(() => window.__duskwood!.audio().wind > 0);
    await page.keyboard.down('KeyW');
    await page.waitForFunction(() => window.__duskwood!.audio().steps > 0, undefined, { timeout: 30_000 });
    await page.keyboard.up('KeyW');
    expect(['grass', 'dirt', 'rock', 'sand', 'snow', 'gravel', 'paving', 'water']).toContain((await page.evaluate(() => window.__duskwood!.audio())).lastStep);
    expect((await page.evaluate(() => window.__duskwood!.audio())).rain).toBe(0);
    await page.evaluate(() => window.__duskwood!.setWeather('rain'));
    await page.waitForFunction(() => window.__duskwood!.audio().rain > 0.1, undefined, { timeout: 30_000 });

    // T: the avatar says something (wordless babble on the voice channel).
    expect((await page.evaluate(() => window.__duskwood!.audio())).voiceCount).toBe(0);
    await page.keyboard.press('KeyT');
    await page.waitForFunction(() => window.__duskwood!.audio().voice === 'talk');
    expect((await page.evaluate(() => window.__duskwood!.audio())).voiceCount).toBe(1);
    await page.waitForFunction(() => window.__duskwood!.audio().voice === 'idle', undefined, { timeout: 30_000 });
    expect(errors).toEqual([]);
  });

  test('the music follows the zone: start, mountain, night, rain and a plot layer', async ({ page }) => {
    const errors = watchForErrors(page);
    await openGame(page);
    const music = () => page.evaluate(() => window.__duskwood!.audio());
    await page.waitForFunction(() => window.__duskwood!.audio().zone === 'start');
    expect((await music()).target).toBe('start');
    // Music needs sound: unlock it with a click, skip the first pause, and the start zone's music plays.
    const canvas = page.locator('canvas').first();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__duskwood!.audio().unlocked);
    await page.evaluate(() => window.__duskwood!.musicSkipGap());
    await page.waitForFunction(() => window.__duskwood!.audio().track !== null);
    expect(['bach-goldberg-aria', 'bach-air', 'satie-gymnopedie-1', 'bach-prelude-c']).toContain((await music()).track);
    await page.waitForFunction(() => window.__duskwood!.audio().musicTime > 1, undefined, { timeout: 30_000 });

    // The zone right now changes at once; the music follows once it has held (8–10 s).
    await page.evaluate(() => window.__duskwood!.teleport(34_500, 49_500));
    await page.waitForFunction(() => window.__duskwood!.audio().zoneRaw === 'mountain');
    expect((await music()).zone).toBe('start');
    await page.waitForFunction(() => window.__duskwood!.audio().zone === 'mountain', undefined, { timeout: 30_000 });
    await page.evaluate(() => window.__duskwood!.setTime(23, true));
    await page.waitForFunction(() => window.__duskwood!.audio().zoneRaw === 'night');
    await page.evaluate(() => window.__duskwood!.setWeather('rain'));
    await page.waitForFunction(() => window.__duskwood!.audio().zoneRaw === 'rain', undefined, { timeout: 30_000 });
    await page.waitForFunction(() => window.__duskwood!.audio().zone === 'rain', undefined, { timeout: 30_000 });

    // A plot layer wins over every zone until it is popped.
    await page.evaluate(() => window.__duskwood!.setMusicLayer('battle'));
    await page.waitForFunction(() => window.__duskwood!.audio().target === 'battle');
    await page.evaluate(() => window.__duskwood!.setMusicLayer(null));
    await page.waitForFunction(() => window.__duskwood!.audio().target === 'rain');
    expect(errors).toEqual([]);
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
