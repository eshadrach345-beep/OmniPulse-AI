#!/usr/bin/env node
// Optional finishing pass for an already-rendered clip.
// Usage: node scripts/finish-video.mjs input.mp4 output.mp4 [--height 1920] [--grade cinematic|warm|cool|none] [--grain 3] [--smooth] [--crf 19]
// Requires ffmpeg-static (installed with the project) or ffmpeg on PATH.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const [input, output, ...rest] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/finish-video.mjs input.mp4 output.mp4 [--height 1920] [--grade cinematic] [--grain 3] [--smooth] [--crf 19]');
  process.exit(1);
}

const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : fallback;
};
const flag = (name) => rest.includes(`--${name}`);

let ffmpeg = process.env.FFMPEG_PATH || '';
if (!ffmpeg) {
  try { ffmpeg = require('ffmpeg-static'); }
  catch { ffmpeg = 'ffmpeg'; }
}

const height = Math.max(480, Math.min(2160, Number(opt('height', 1920)) || 1920));
const grain = Math.max(0, Math.min(20, Number(opt('grain', 3)) || 0));
const crf = Math.max(12, Math.min(28, Number(opt('crf', 19)) || 19));
const grades = {
  cinematic: 'eq=contrast=1.08:saturation=0.95:gamma=0.98,colorbalance=rs=0.03:bs=-0.03:rh=0.02:bh=-0.02',
  warm: 'colorbalance=rs=0.08:gs=0.02:bs=-0.06,eq=contrast=1.05',
  cool: 'colorbalance=rs=-0.06:bs=0.08,eq=contrast=1.05',
  none: '',
};
const grade = grades[String(opt('grade', 'cinematic'))] ?? grades.cinematic;
const filters = [
  'hqdn3d=1.2:1.0:3:3',
  `scale=-2:${height}:flags=lanczos`,
  'unsharp=5:5:0.6:5:5:0.0',
  grade,
  flag('smooth') ? 'minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:vsbmc=1' : '',
  grain > 0 ? `noise=alls=${grain}:allf=t` : '',
  'format=yuv420p',
].filter(Boolean).join(',');

const args = [
  '-hide_banner', '-y', '-i', input, '-vf', filters,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
  '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-c:a', 'copy', '-movflags', '+faststart', output,
];
const result = spawnSync(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' });
if (result.status !== 0) {
  console.error(String(result.stderr || '').slice(-2000));
  process.exit(result.status || 1);
}
console.log(`Finished video written to ${output}`);
