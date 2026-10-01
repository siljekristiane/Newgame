/**
 * The music: zones and the pieces that may play in each. Only recordings that
 * are CC0 or public domain (the recording itself, not just the work) go here;
 * every file is credited in CREDITS.md. `file` is null until the recording is
 * in `public/audio/music/` (phase D): such pieces are skipped, so a zone stays
 * silent until it has music.
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
  /** Path under public/ (e.g. 'audio/music/bach-air.ogg'), or null while there is no recording. */
  file: string | null;
  /** Performer, source and licence, as in CREDITS.md. Empty while `file` is null. */
  credit: string;
}

export const TRACKS: readonly Track[] = [
  { id: 'bach-goldberg-aria', composer: 'J. S. Bach', work: 'Goldberg-variasjonene', movement: 'Aria', zones: ['start'], file: null, credit: '' },
  { id: 'bach-air', composer: 'J. S. Bach', work: 'Orkestersuite nr. 3', movement: 'Air', zones: ['start', 'meadow'], file: null, credit: '' },
  { id: 'satie-gymnopedie-1', composer: 'Erik Satie', work: 'Gymnopédie nr. 1', zones: ['start', 'coast'], file: null, credit: '' },
  { id: 'grieg-morning', composer: 'Edvard Grieg', work: 'Peer Gynt', movement: 'Morgenstemning', zones: ['forest', 'meadow'], file: null, credit: '' },
  { id: 'beethoven-pastoral-2', composer: 'L. van Beethoven', work: 'Symfoni nr. 6 «Pastorale»', movement: '2. sats', zones: ['forest', 'meadow'], file: null, credit: '' },
  { id: 'vivaldi-winter-largo', composer: 'Antonio Vivaldi', work: 'De fire årstider: Vinter', movement: 'Largo', zones: ['mountain'], file: null, credit: '' },
  { id: 'bach-prelude-c', composer: 'J. S. Bach', work: 'Das wohltemperierte Klavier I', movement: 'Preludium i C-dur', zones: ['mountain', 'start'], file: null, credit: '' },
  { id: 'debussy-clair-de-lune', composer: 'Claude Debussy', work: 'Suite bergamasque', movement: 'Clair de lune', zones: ['coast', 'night'], file: null, credit: '' },
  { id: 'chopin-barcarolle', composer: 'Frédéric Chopin', work: 'Barcarolle op. 60', zones: ['coast'], file: null, credit: '' },
  { id: 'chopin-nocturne-9-2', composer: 'Frédéric Chopin', work: 'Nocturne op. 9 nr. 2', zones: ['night'], file: null, credit: '' },
  { id: 'chopin-nocturne-27-2', composer: 'Frédéric Chopin', work: 'Nocturne op. 27 nr. 2', zones: ['night'], file: null, credit: '' },
  { id: 'beethoven-moonlight-1', composer: 'L. van Beethoven', work: 'Månskinnssonaten', movement: '1. sats', zones: ['night'], file: null, credit: '' },
  { id: 'chopin-raindrop', composer: 'Frédéric Chopin', work: 'Preludium op. 28 nr. 15 «Regndråpe»', zones: ['rain'], file: null, credit: '' },
];

/** "Composer – work (movement)", for the F3 panel. */
export function trackTitle(track: Track): string {
  return `${track.composer} – ${track.work}${track.movement ? ` (${track.movement})` : ''}`;
}
