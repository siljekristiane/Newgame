import { describe, expect, it } from 'vitest';
import { zeroCrossingRate } from './dsp';
import { babble, HUM_MELODIES, melodyNotes, midiToHz, renderVoice, type Vowel } from './voice';

const SR = 22_050;

const tone = (vowel: Vowel, hz = 180, duration = 0.6) => renderVoice([{ start: 0, duration, from: hz, to: hz, vowel, level: 1 }], SR);

/** Fundamental by autocorrelation over 70–500 Hz, in the steady middle of the buffer. */
function pitch(x: Float32Array): number {
  const a = Math.floor(x.length * 0.3);
  const b = Math.floor(x.length * 0.7);
  let best = 0;
  let bestLag = 0;
  for (let lag = Math.floor(SR / 500); lag <= Math.floor(SR / 70); lag++) {
    let sum = 0;
    for (let i = a; i < b; i++) sum += x[i]! * x[i + lag]!;
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  return SR / bestLag;
}

describe('voice', () => {
  it('sings at the pitch of the note', () => {
    for (const midi of [50, 57, 62]) {
      const hz = midiToHz(midi);
      expect(Math.abs(pitch(tone('m', hz)) / hz - 1)).toBeLessThan(0.03);
    }
  });

  it('open vowels are brighter than closed ones', () => {
    const zcr = (v: Vowel) => zeroCrossingRate(tone(v));
    expect(zcr('a')).toBeGreaterThan(zcr('u'));
    expect(zcr('u')).toBeGreaterThan(zcr('m'));
    expect(zcr('i')).toBeGreaterThan(zcr('u'));
  });

  it('is clean: finite, normalised, quiet at both ends', () => {
    const x = renderVoice(babble(1), SR);
    let peak = 0;
    for (const v of x) {
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeCloseTo(0.8, 2);
    expect(Math.abs(x[0]!)).toBeLessThan(0.01);
    expect(Math.abs(x[x.length - 1]!)).toBeLessThan(0.01);
  });

  it('babble is deterministic, varied, and has pauses between words', () => {
    expect(babble(3)).toEqual(babble(3));
    expect(babble(3)).not.toEqual(babble(4));
    for (const mood of ['calm', 'eager'] as const) {
      const notes = babble(5, mood);
      expect(notes.length).toBeGreaterThanOrEqual(2);
      const gaps = notes.slice(1).map((n, i) => n.start - (notes[i]!.start + notes[i]!.duration));
      expect(Math.max(...gaps)).toBeGreaterThan(0.07);
      expect(new Set(notes.map((n) => n.vowel)).size).toBeGreaterThan(1);
    }
    // Eager speech is higher than calm speech.
    const mean = (mood: 'calm' | 'eager') => {
      const n = [1, 2, 3, 4, 5].flatMap((s) => babble(s, mood));
      return n.reduce((s, x) => s + x.from, 0) / n.length;
    };
    expect(mean('eager')).toBeGreaterThan(mean('calm'));
  });

  it('melodies are short phrases in a comfortable range', () => {
    for (const m of HUM_MELODIES) {
      const notes = melodyNotes(m);
      const length = notes[notes.length - 1]!.start + notes[notes.length - 1]!.duration;
      expect(length, m.id).toBeGreaterThan(4);
      expect(length, m.id).toBeLessThan(16);
      for (const [midi, beats] of m.notes) {
        expect(beats).toBeGreaterThan(0);
        if (midi !== null) {
          expect(midi).toBeGreaterThanOrEqual(45);
          expect(midi).toBeLessThanOrEqual(66);
        }
      }
    }
  });
});
