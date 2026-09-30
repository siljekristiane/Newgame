import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import type { DebugSnapshot } from '../src/state/useGameStore';
import { goToView, waitUntilSettled } from './helpers';

/**
 * `npm run measure`: visits every fixed view, waits for streaming to finish,
 * and writes numbers + screenshots to measurements/<timestamp>/.
 * Compare two runs to see what a change cost or saved.
 */
test('measure all fixed views @measure', async ({ page }) => {
  // Full quality (textures, shadows) under software rendering is slow; this is a measurement, not a smoke test.
  test.setTimeout(20 * 60_000);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const dir = join('measurements', stamp);
  mkdirSync(dir, { recursive: true });

  await page.goto('/');
  await page.waitForFunction(() => window.__duskwood !== undefined, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__duskwood!.setTime(15, true)); // same light every run
  await page.evaluate(() => window.__duskwood!.setWeather('clear'));
  await page.keyboard.press('F3'); // show the performance panel in the screenshots
  await waitUntilSettled(page);
  await page.waitForFunction(() => window.__duskwood!.debug().terrainTextures, undefined, { timeout: 120_000 });
  const firstLoad = await page.evaluate(() => window.__duskwood!.debug().settleMs);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  });

  const rows: Array<{ view: string } & DebugSnapshot> = [];
  const views = await page.evaluate(() => window.__duskwood!.views);
  for (const id of views) {
    await goToView(page, id);
    await page.waitForTimeout(3000); // fill the frame-time window
    rows.push({ view: id, ...(await page.evaluate(() => window.__duskwood!.debug())) });
    await page.screenshot({ path: join(dir, `${id}.jpg`), type: 'jpeg', quality: 80 });
  }

  const software = /swiftshader|llvmpipe|software/i.test(gpu);
  const n = (v: number | null, d = 0) => (v === null ? '–' : v.toLocaleString('nb-NO', { maximumFractionDigits: d, minimumFractionDigits: d }));
  const md = [
    `# Måling ${stamp}`,
    '',
    `- Skjermkort: \`${gpu}\`${software ? ' (programvare: FPS og bildetid er ikke representative)' : ''}`,
    `- Første innlasting til ferdig strømmet verden: ${n(firstLoad === null ? null : firstLoad / 1000, 1)} s`,
    '',
    '| Vinkel | Draw calls | Trekanter | Geometrier | Teksturer | Shadere | Chunks | LOD 0/1/2/3 | Innlasting (s) | FPS | Bildetid snitt / 95 % (ms) | JS-minne (MB) |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.view} | ${n(r.drawCalls)} | ${n(r.triangles)} | ${n(r.geometries)} | ${n(r.textures)} | ${n(r.programs)} | ${r.loadedChunks} | ${r.lodCounts.join('/')} | ${n(r.settleMs === null ? null : r.settleMs / 1000, 1)} | ${r.fps} | ${n(r.frameMs, 1)} / ${n(r.frameMsP95, 1)} | ${n(r.heapMb)} |`,
    ),
    '',
  ].join('\n');
  writeFileSync(join(dir, 'report.md'), md);
  writeFileSync(join(dir, 'report.json'), JSON.stringify({ stamp, gpu, firstLoadMs: firstLoad, rows }, null, 2));
  console.log(md);
});
