// Downloads the chosen recordings (scripts/music-sources.json) from Wikimedia
// Commons into audio-src/ (git-ignored), one at a time. Re-checks each file's
// licence first and refuses anything that is not CC0 / public domain.
//
//   node scripts/fetch-music.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';

const UA = 'DuskwoodWorld/0.1 (open-source browser game; music licence check)';
const FREE = /^(cc0|public domain|pdm)/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (h = '') => String(h).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const sources = JSON.parse(readFileSync(new URL('./music-sources.json', import.meta.url), 'utf8'));
mkdirSync('audio-src', { recursive: true });

async function fetchRetry(url) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status !== 429 && res.status < 500) return res;
    await sleep(15_000 * (attempt + 1));
  }
  throw new Error(`gave up: ${url}`);
}

for (const [id, src] of Object.entries(sources)) {
  const q = new URLSearchParams({ format: 'json', action: 'query', titles: src.title, prop: 'imageinfo', iiprop: 'extmetadata|url' });
  const info = await (await fetchRetry(`https://commons.wikimedia.org/w/api.php?${q}`)).json();
  const ii = Object.values(info.query.pages)[0].imageinfo?.[0];
  const licence = strip(ii?.extmetadata?.LicenseShortName?.value);
  if (!ii || !FREE.test(licence)) throw new Error(`${id}: not free (${licence || 'missing'})`);
  const out = `audio-src/${id}${extname(new URL(ii.url).pathname).toLowerCase()}`;
  if (!existsSync(out)) {
    const res = await fetchRetry(ii.url);
    if (!res.ok) throw new Error(`${id}: ${res.status}`);
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
  }
  console.log(`${id}: ${licence} → ${out} (${ii.descriptionurl})`);
  await sleep(3_000);
}
