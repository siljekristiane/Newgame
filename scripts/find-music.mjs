// Finds CC0 / public-domain recordings on Wikimedia Commons for the music
// tracks (phase D). Not part of the build: run by hand, slowly (Commons rate
// limits), and check the result before downloading anything.
//
//   node scripts/find-music.mjs [out.json]
//
// Only files whose licence is CC0, Public domain or the Public Domain Mark are
// listed; CC BY / BY-SA and everything else is skipped.
import { writeFileSync } from 'node:fs';

const QUERIES = {
  'bach-goldberg-aria': ['Goldberg Variations Aria', 'Goldberg Aria Ishizaka'],
  'bach-air': ['Air on the G String', 'Orchestral Suite 3 Air Bach'],
  'satie-gymnopedie-1': ['Gymnopédie No. 1', 'Gymnopedie 1 Satie'],
  'grieg-morning': ['Grieg Morning Mood', 'Peer Gynt Morning'],
  'beethoven-pastoral-2': ['Beethoven Symphony 6 second movement', 'Pastoral Symphony Scene by the brook'],
  'vivaldi-winter-largo': ['Vivaldi Winter Largo', 'Vivaldi Four Seasons Winter 2'],
  'bach-prelude-c': ['Well-Tempered Clavier Prelude 1 C major', 'Prelude C major BWV 846'],
  'debussy-clair-de-lune': ['Clair de lune Debussy'],
  'chopin-barcarolle': ['Chopin Barcarolle'],
  'chopin-nocturne-9-2': ['Chopin Nocturne Op. 9 No. 2'],
  'chopin-nocturne-27-2': ['Chopin Nocturne Op. 27 No. 2'],
  'beethoven-moonlight-1': ['Moonlight Sonata first movement', 'Piano Sonata 14 Beethoven Adagio sostenuto'],
  'chopin-raindrop': ['Chopin Prelude Op. 28 No. 15', 'Raindrop Prelude Chopin'],
};

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'DuskwoodWorld/0.1 (open-source browser game; music licence check)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FREE = /^(cc0|public domain|pdm|pd\b|public domain mark)/i;

async function get(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', ...params })}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 429) {
      await sleep(10_000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }
  throw new Error(`rate limited: ${url}`);
}

const strip = (html = '') => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const out = {};
for (const [id, queries] of Object.entries(QUERIES)) {
  const found = new Map();
  for (const q of queries) {
    const d = await get({
      action: 'query',
      generator: 'search',
      gsrsearch: `${q} filetype:audio`,
      gsrnamespace: '6',
      gsrlimit: '15',
      prop: 'imageinfo',
      iiprop: 'extmetadata|size|url|mediatype',
    });
    for (const p of Object.values(d.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0];
      const m = ii?.extmetadata ?? {};
      const licence = strip(m.LicenseShortName?.value);
      if (!ii || !FREE.test(licence)) continue;
      found.set(p.title, {
        title: p.title,
        licence,
        artist: strip(m.Artist?.value).slice(0, 160),
        description: strip(m.ImageDescription?.value).slice(0, 200),
        sizeMB: +(ii.size / 1e6).toFixed(1),
        url: ii.url,
        page: ii.descriptionurl,
      });
    }
    await sleep(4_000);
  }
  out[id] = [...found.values()];
  console.log(`${id}: ${out[id].length}`);
  for (const f of out[id]) console.log(`   ${f.licence} | ${f.title} | ${f.sizeMB} MB`);
}
writeFileSync(process.argv[2] ?? 'music-candidates.json', JSON.stringify(out, null, 2));
