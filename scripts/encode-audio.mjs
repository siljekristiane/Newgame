// Encodes the source recordings in audio-src/ to public/audio/music/<id>.webm:
// Opus 80 kbit/s stereo in WebM (plays in Chrome, Firefox and Safari), silence
// trimmed at both ends, 1 s fades, and loudness evened out to -20 LUFS so the
// pieces sit at the same level behind the game.
//
//   npm run audio:encode            (skips files that are already encoded)
//   npm run audio:encode -- --force
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';

const SRC = 'audio-src';
const OUT = 'public/audio/music';
const force = process.argv.includes('--force');
const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.3';
const filter = [trim, 'areverse', trim, 'afade=t=in:d=1', 'areverse', 'afade=t=in:d=1', 'loudnorm=I=-20:TP=-2:LRA=11', 'aresample=48000'].join(',');

mkdirSync(OUT, { recursive: true });
for (const file of readdirSync(SRC).sort()) {
  const id = basename(file, extname(file));
  const out = `${OUT}/${id}.webm`;
  if (existsSync(out) && !force) continue;
  execFileSync(ffmpeg.path, ['-hide_banner', '-loglevel', 'error', '-y', '-i', `${SRC}/${file}`, '-vn', '-map_metadata', '-1', '-af', filter, '-ac', '2', '-c:a', 'libopus', '-b:a', '80k', out], { stdio: 'inherit' });
  console.log(`${out}: ${(statSync(out).size / 1e6).toFixed(1)} MB`);
}
