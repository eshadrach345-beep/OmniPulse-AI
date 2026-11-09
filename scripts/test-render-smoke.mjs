// CPU-only render smoke test: no API keys, paid image/video generation or network calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const ffmpeg = require('ffmpeg-static');
assert.ok(ffmpeg && typeof ffmpeg === 'string', 'ffmpeg-static binary is available');
function run(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (part) => { stderr += part.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stderr) : reject(new Error(stderr.slice(-2400) || 'ffmpeg failed')));
  });
}
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'omnipulse-render-smoke-'));
const base = path.join(work, 'base.mp4');
const overlay = path.join(work, 'brand-mark.ppm');
const output = path.join(work, 'rendered.mp4');
const compiledPath = path.resolve('scripts/.tmp-compositor-smoke.mjs');
const compiledQaPath = path.resolve('scripts/.tmp-video-qa.mjs');
try {
  const qaSource = await fs.readFile(new URL('../server/lib/video-qa.ts', import.meta.url), 'utf8');
  const compiledQa = ts.transpileModule(qaSource, { fileName: 'video-qa.ts', compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  await fs.writeFile(compiledQaPath, compiledQa);
  const source = (await fs.readFile(new URL('../server/lib/compositor.ts', import.meta.url), 'utf8')).replace("from './video-qa.js'", "from './.tmp-video-qa.mjs'");
  const compiled = ts.transpileModule(source, {
    fileName: 'compositor.ts',
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  await fs.writeFile(compiledPath, compiled);
  const { renderComposition } = await import(pathToFileURL(compiledPath).href);
  const width = 64, height = 64;
  const header = Buffer.from('P6\n64 64\n255\n');
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) { pixels[i] = 216; pixels[i + 1] = 243; pixels[i + 2] = 106; }
  await fs.writeFile(overlay, Buffer.concat([header, pixels]));
  await run(ffmpeg, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=0x111D31:s=720x1280:r=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', base]);
  await renderComposition({
    base, overlays: [{ layer: { kind: 'image', sourceIn: 0, duration: 3, startAt: 0.2, scale: 18, opacity: 1, x: 80, y: 12, volume: 0, chromaKey: true, chromaKeyColor: '#D8F36A', chromaKeySimilarity: 0.3, chromaKeyBlend: 0.08 }, file: overlay }],
    audio: [], captions: [], title: 'OMNIPULSE AI', titlePosition: 'top',
    playbackSpeed: 1.25, clipFadeIn: 0.25, clipFadeOut: 0.25, fitMode: 'cover', colorGrade: 'cinematic',
    textOverlays: [
      { start: 0.2, end: 2.8, text: 'One Platform. Endless Possibilities.', y: 'h*0.60', fontSize: 34, color: '#DCE8F5', weight: 'regular', fadeIn: 0.25, fadeOut: 0.2 },
      { start: 0.3, end: 2.8, text: 'Start free today', y: 'h*0.76', fontSize: 32, color: '#06122B', boxColor: '#2DE0B8', boxBorderWidth: 16, fadeIn: 0.25, fadeOut: 0.2 },
      { start: 0.3, end: 2.8, text: 'OmniPulseai.us.ci', y: 'h*0.88', fontSize: 28, color: '#2DE0B8' },
    ],
    duration: 3, width: 1080, height: 1920, output,
  });
  const stat = await fs.stat(output);
  assert.ok(stat.size > 6000, 'compositor creates a non-empty MP4');
  const outputInfo = await run(ffmpeg, ['-hide_banner', '-i', output, '-f', 'null', '-']);
  assert.match(outputInfo, /1080x1920/, 'portrait master export should be 1080x1920');
  console.log('CPU-only video render smoke test passed (MP4 + logo image layer + title + animated CTA/text overlays + playback speed + clip fades + crop-to-fill + cinematic grade + chroma key).');
} finally {
  await fs.rm(compiledPath, { force: true });
  await fs.rm(compiledQaPath, { force: true });
  await fs.rm(work, { recursive: true, force: true });
}
