/**
 * The music: zones and the pieces that may play in each. Only recordings that
 * are CC0 or public domain (the recording itself, not just the work) go here;
 * every file is credited in CREDITS.md. Recordings live in
 * `public/audio/music/` (encoded with `npm run audio:encode` from audio-src/,
 * sources in scripts/music-sources.json).
 * A piece with `file: null` is skipped, so a zone without music stays silent.
 */

export const MUSIC_ZONES = ['start', 'forest', 'mountain', 'coast', 'meadow', 'night', 'rain'] as const;
export type MusicZone = (typeof MUSIC_ZONES)[number];

/** Zone names shown in the game. */
export const ZONE_NAMES: Record<MusicZone, string> = {
  start: 'Startplassen',
  forest: 'Skogen',
  mountain: 'Fjellet',
  coast: 'Kysten',
  meadow: 'Det åpne landet',
  night: 'Natt',
  rain: 'Regn',
};

export interface Track {
  id: string;
  composer: string;
  work: string;
  /** Movement or part, if any. */
  movement?: string;
  /**
   * Zones (or plot layers, see MusicScheduler.pushLayer) the piece belongs to.
   * Plain strings, so later plot layers need no change here.
   */
  zones: readonly string[];
  /** Path under public/ (e.g. 'audio/music/bach-air.webm'), or null while there is no recording. */
  file: string | null;
  /** Performer, source and licence, as in CREDITS.md. Empty while `file` is null. */
  credit: string;
}

export const TRACKS: readonly Track[] = [
  { id: 'bach-goldberg-aria', composer: 'J. S. Bach', work: 'Goldberg-variasjonene', movement: 'Aria', zones: ['start'], file: 'audio/music/bach-goldberg-aria.webm', credit: 'Kimiko Ishizaka (Open Goldberg Variations) · Wikimedia Commons · CC0' },
  { id: 'bach-air', composer: 'J. S. Bach', work: 'Orkestersuite nr. 3', movement: 'Air', zones: ['start', 'meadow'], file: 'audio/music/bach-air.webm', credit: 'Air Force Strings, United States Air Force Band · Wikimedia Commons · Public domain (US Government work)' },
  { id: 'satie-gymnopedie-1', composer: 'Erik Satie', work: 'Gymnopédie nr. 1', zones: ['start', 'coast'], file: 'audio/music/satie-gymnopedie-1.webm', credit: 'Robin Alciatore (Musopen) · Wikimedia Commons · Public domain' },
  { id: 'grieg-morning', composer: 'Edvard Grieg', work: 'Peer Gynt', movement: 'Morgenstemning', zones: ['forest', 'meadow'], file: 'audio/music/grieg-morning.webm', credit: 'Musopen Symphony · Wikimedia Commons · Public domain' },
  { id: 'beethoven-pastoral-2', composer: 'L. van Beethoven', work: 'Symfoni nr. 6 «Pastorale»', movement: '2. sats', zones: ['forest', 'meadow'], file: 'audio/music/beethoven-pastoral-2.webm', credit: 'Musopen · Wikimedia Commons · Public domain' },
  { id: 'vivaldi-winter-largo', composer: 'Antonio Vivaldi', work: 'De fire årstider: Vinter', movement: 'Largo', zones: ['mountain'], file: 'audio/music/vivaldi-winter-largo.webm', credit: 'The Modena Chamber Orchestra (Musopen) · Wikimedia Commons · Public Domain Mark' },
  { id: 'bach-prelude-c', composer: 'J. S. Bach', work: 'Das wohltemperierte Klavier I', movement: 'Preludium i C-dur', zones: ['mountain', 'start'], file: 'audio/music/bach-prelude-c.webm', credit: 'Kimiko Ishizaka (Open Well-Tempered Clavier) · Wikimedia Commons · Public domain (CC0)' },
  { id: 'debussy-clair-de-lune', composer: 'Claude Debussy', work: 'Suite bergamasque', movement: 'Clair de lune', zones: ['coast', 'night'], file: 'audio/music/debussy-clair-de-lune.webm', credit: 'Laurens Goedhart · Wikimedia Commons · Public domain' },
  { id: 'chopin-berceuse', composer: 'Frédéric Chopin', work: 'Berceuse op. 57', zones: ['coast'], file: 'audio/music/chopin-berceuse.webm', credit: 'Veronica van der Knaap · Wikimedia Commons · Public domain' },
  { id: 'chopin-nocturne-9-2', composer: 'Frédéric Chopin', work: 'Nocturne op. 9 nr. 2', zones: ['night'], file: 'audio/music/chopin-nocturne-9-2.webm', credit: 'Frank Lévy (Musopen, Set Chopin Free) · Wikimedia Commons · Public domain' },
  { id: 'chopin-nocturne-27-2', composer: 'Frédéric Chopin', work: 'Nocturne op. 27 nr. 2', zones: ['night'], file: 'audio/music/chopin-nocturne-27-2.webm', credit: 'Frank Lévy (Musopen, Set Chopin Free) · Wikimedia Commons · Public domain' },
  { id: 'beethoven-moonlight-1', composer: 'L. van Beethoven', work: 'Månskinnssonaten', movement: '1. sats', zones: ['night', 'rain'], file: 'audio/music/beethoven-moonlight-1.webm', credit: 'Paul Pitman (Musopen) · Wikimedia Commons · Public domain' },
  { id: 'chopin-raindrop', composer: 'Frédéric Chopin', work: 'Preludium op. 28 nr. 15 «Regndråpe»', zones: ['rain'], file: 'audio/music/chopin-raindrop.webm', credit: 'Musopen (Chopin collection) · Wikimedia Commons · CC0' },
];

/** "Composer – work (movement)", for the F3 panel. */
export function trackTitle(track: Track): string {
  return `${track.composer} – ${track.work}${track.movement ? ` (${track.movement})` : ''}`;
}
