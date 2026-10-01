import { WORLD_SEED } from '../config/world';
import { mulberry32 } from '../world/noise';
import { biquad, normalize } from './dsp';

/**
 * The avatar's voice (pure, tested): a small formant synthesiser that hums
 * public-domain melodies and babbles wordless syllables, as in many games.
 * A buzzing source (sawtooth with vibrato and a little breath) goes through
 * three band-pass formants per vowel; each note or syllable is rendered on its
 * own and overlap-added, so the vowel can change between them.
 */

export const VOWELS = ['m', 'u', 'o', 'a', 'e', 'i'] as const;
export type Vowel = (typeof VOWELS)[number];

/** Formant frequencies (Hz) and relative levels; 'm' is a closed-mouth hum. */
const FORMANTS: Record<Vowel, ReadonlyArray<readonly [number, number]>> = {
  m: [[250, 1], [1000, 0.08], [2200, 0.03]],
  u: [[320, 1], [800, 0.35], [2300, 0.08]],
  o: [[500, 1], [850, 0.5], [2400, 0.12]],
  a: [[750, 1], [1150, 0.7], [2500, 0.2]],
  e: [[480, 1], [1850, 0.45], [2550, 0.2]],
  i: [[300, 1], [2300, 0.35], [3000, 0.2]],
};

/** One sung note or spoken syllable. */
export interface VoiceNote {
  /** Start time, seconds. */
  start: number;
  /** Length, seconds. */
  duration: number;
  /** Pitch at the start and end (a glide), Hz. */
  from: number;
  to: number;
  vowel: Vowel;
  /** 0..1 */
  level: number;
  /** A short breathy consonant before the vowel (talking). */
  consonant?: boolean;
}

export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export interface Melody {
  id: string;
  name: string;
  /** Beats per minute. */
  bpm: number;
  /** [MIDI note or null for a rest, beats] */
  notes: ReadonlyArray<readonly [number | null, number]>;
}

/** Short phrases from public-domain works, hummed in a comfortable middle range. */
export const HUM_MELODIES: readonly Melody[] = [
  {
    id: 'morning',
    name: 'Grieg: Morgenstemning',
    bpm: 150,
    notes: [
      [59, 1], [56, 1], [54, 1], [52, 1], [54, 1], [56, 1],
      [59, 1], [56, 1], [54, 1], [52, 1], [54, 0.5], [56, 0.5], [54, 0.5], [56, 0.5],
      [59, 1], [56, 1], [59, 1], [61, 1], [56, 1], [61, 1],
      [59, 1], [56, 1], [54, 1], [52, 3],
    ],
  },
  {
    id: 'elise',
    name: 'Beethoven: Für Elise',
    bpm: 140,
    notes: [
      [64, 0.5], [63, 0.5], [64, 0.5], [63, 0.5], [64, 0.5], [59, 0.5], [62, 0.5], [60, 0.5], [57, 1.5],
      [null, 0.5], [48, 0.5], [52, 0.5], [57, 0.5], [59, 1.5],
      [null, 0.5], [52, 0.5], [56, 0.5], [59, 0.5], [60, 1.5],
      [null, 0.5], [52, 0.5], [64, 0.5], [63, 0.5], [64, 0.5], [63, 0.5], [64, 0.5], [59, 0.5], [62, 0.5], [60, 0.5], [57, 2],
    ],
  },
  {
    id: 'joy',
    name: 'Beethoven: Ode til gleden',
    bpm: 132,
    notes: [
      [52, 1], [52, 1], [53, 1], [55, 1], [55, 1], [53, 1], [52, 1], [50, 1],
      [48, 1], [48, 1], [50, 1], [52, 1], [52, 1.5], [50, 0.5], [50, 2],
      [52, 1], [52, 1], [53, 1], [55, 1], [55, 1], [53, 1], [52, 1], [50, 1],
      [48, 1], [48, 1], [50, 1], [52, 1], [50, 1.5], [48, 0.5], [48, 2],
    ],
  },
  {
    id: 'lullaby',
    name: 'Brahms: Vuggevise',
    bpm: 100,
    notes: [
      [52, 0.5], [52, 0.5], [55, 2], [52, 0.5], [52, 0.5], [55, 2],
      [52, 0.5], [55, 0.5], [60, 1], [59, 1.5], [57, 0.5], [57, 1], [55, 1],
      [50, 0.5], [52, 0.5], [53, 1], [50, 1], [50, 0.5], [52, 0.5], [53, 2],
    ],
  },
];

/** A melody as voice notes, legato, on the closed-mouth 'm' with an occasional open 'u'. */
export function melodyNotes(melody: Melody, level = 0.8): VoiceNote[] {
  const beat = 60 / melody.bpm;
  const out: VoiceNote[] = [];
  let t = 0;
  melody.notes.forEach(([midi, beats], i) => {
    const duration = beats * beat;
    if (midi !== null) {
      const hz = midiToHz(midi);
      // Long notes open up a little, as people do when they hum.
      out.push({ start: t, duration: duration * 1.04, from: hz, to: hz, vowel: beats >= 2 && i % 2 === 0 ? 'u' : 'm', level });
    }
    t += duration;
  });
  return out;
}

export type Mood = 'calm' | 'eager';

/**
 * Wordless speech: a few "words" of 1–4 syllables with varied vowels, length
 * and pitch. Calm speech is slower and lower and falls at the end; eager
 * speech is quicker, higher and rises like a question. Deterministic per seed.
 */
export function babble(seed: number, mood: Mood = 'calm'): VoiceNote[] {
  const random = mulberry32(WORLD_SEED + 4_000 + seed * 977);
  const eager = mood === 'eager';
  const base = midiToHz(eager ? 60 : 56);
  const words = 2 + Math.floor(random() * (eager ? 4 : 3));
  const out: VoiceNote[] = [];
  let t = 0;
  let pitch = 1;
  for (let w = 0; w < words; w++) {
    const syllables = 1 + Math.floor(random() * 4);
    for (let s = 0; s < syllables; s++) {
      const duration = (eager ? 0.08 : 0.12) + random() * (eager ? 0.08 : 0.1);
      pitch = Math.min(1.5, Math.max(0.75, pitch * 2 ** (((random() - 0.5) * (eager ? 6 : 4)) / 12)));
      const last = w === words - 1 && s === syllables - 1;
      const end = last ? pitch * (eager ? 1.25 : 0.82) : pitch * 2 ** (((random() - 0.5) * 2) / 12);
      out.push({
        start: t,
        duration: last ? duration * 1.6 : duration,
        from: base * pitch,
        to: base * end,
        vowel: VOWELS[1 + Math.floor(random() * (VOWELS.length - 1))]!,
        level: 0.6 + random() * 0.3,
        consonant: random() < 0.6,
      });
      t += duration + 0.02;
    }
    t += (eager ? 0.08 : 0.14) + random() * 0.1; // a pause between words
  }
  return out;
}

/** Renders notes to a mono buffer peaking at `peak`. */
export function renderVoice(notes: readonly VoiceNote[], sampleRate: number, peak = 0.8, seed = 0): Float32Array {
  const end = notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0) + 0.1;
  const out = new Float32Array(Math.ceil(end * sampleRate));
  const random = mulberry32(WORLD_SEED + 4_500 + seed);
  for (const note of notes) {
    const part = renderNote(note, sampleRate, random);
    const offset = Math.round(note.start * sampleRate);
    for (let i = 0; i < part.length && offset + i < out.length; i++) out[offset + i]! += part[i]!;
  }
  return normalize(out, peak);
}

function renderNote(note: VoiceNote, sr: number, random: () => number): Float32Array {
  const lead = note.consonant ? Math.round(0.035 * sr) : 0;
  const n = Math.round(note.duration * sr) + lead;
  // Source: sawtooth with vibrato (and a little jitter), plus breath noise.
  const source = new Float32Array(n);
  const breath = new Float32Array(n);
  const vibRate = 5 + random() * 1.2;
  const vibPhase = random() * Math.PI * 2;
  let phase = random();
  for (let i = lead; i < n; i++) {
    const t = (i - lead) / sr;
    const u = (i - lead) / Math.max(1, n - lead);
    const vibrato = 1 + 0.006 * Math.sin(2 * Math.PI * vibRate * t + vibPhase) * Math.min(1, t / 0.25);
    const f = (note.from + (note.to - note.from) * u) * vibrato;
    phase += f / sr;
    phase -= Math.floor(phase);
    source[i] = 2 * phase - 1;
    breath[i] = (random() * 2 - 1) * 0.05;
  }
  // Consonant: a short hiss before the vowel.
  for (let i = 0; i < lead; i++) breath[i] = (random() * 2 - 1) * 0.5 * Math.sin((Math.PI * i) / lead);
  for (let i = 0; i < n; i++) source[i]! += breath[i]!;
  if (lead > 0) biquad(breath, 'highpass', 3000, 0.7, sr);

  // Formants: three parallel band-passes.
  const out = new Float32Array(n);
  for (const [freq, gain] of FORMANTS[note.vowel]) {
    const band = biquad(Float32Array.from(source), 'bandpass', freq, freq < 600 ? 4 : 7, sr);
    for (let i = 0; i < n; i++) out[i]! += band[i]! * gain;
  }
  if (note.vowel === 'm') biquad(out, 'lowpass', 900, 0.7, sr);

  // Envelope: soft attack and release.
  const attack = 0.03 * sr;
  const release = 0.06 * sr;
  for (let i = 0; i < n; i++) {
    const v = i - lead;
    const env = v < 0 ? 0 : Math.min(1, v / attack) * Math.min(1, (n - i) / release);
    out[i] = out[i]! * env * note.level + (i < lead ? breath[i]! * 0.25 * note.level : 0);
  }
  return out;
}
