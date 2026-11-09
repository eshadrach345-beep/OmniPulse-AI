import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
let ffmpeg = process.env.FFMPEG_PATH || '';
if (!ffmpeg) {
  try { ffmpeg = require('ffmpeg-static'); } catch { /* use the configured system binary below */ }
}
if (!ffmpeg) throw new Error('FFMPEG_PATH or ffmpeg-static is required for the merge smoke test.');
process.env.FFMPEG_PATH = ffmpeg;

function run(args, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 120_000) stderr = stderr.slice(-80_000);
    });
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* already stopped */ }
    }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stderr });
    });
  });
}

const work = await fs.mkdtemp(path.join(os.tmpdir(), 'op-merge-smoke-'));
const clipA = path.join(work, 'scene-a.mp4');
const clipB = path.join(work, 'scene-b.mp4');
const modulePath = path.join(work, 'merge.mjs');
let merged = null;
let mergedTransition = null;
let server = null;
const originalInfo = console.info;
const infoLines = [];
console.info = (...args) => { infoLines.push(args.join(' ')); originalInfo(...args); };

try {
  // Create two short, matching H.264/AAC scene clips with distinct audio.
  for (const [file, color, frequency] of [
    [clipA, '0x18334D', 440],
    [clipB, '0x0F5A60', 550],
  ]) {
    const result = await run([
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `color=c=${color}:s=360x640:r=24`,
      '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000`,
      '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '96k', '-ar', '48000', '-ac', '2', '-shortest', file,
    ]);
    assert.equal(result.code, 0, `Could not create test MP4: ${result.stderr.slice(-1200)}`);
  }

  // Compile the actual merge implementation so this test exercises production code.
  const mergeSource = await fs.readFile(new URL('../server/lib/merge.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(mergeSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  await fs.writeFile(modulePath, compiled, 'utf8');
  const { mergeClips, sampleVideoFrames } = await import(pathToFileURL(modulePath).href);

  server = createServer(async (req, res) => {
    const file = req.url === '/scene-a.mp4' ? clipA : req.url === '/scene-b.mp4' ? clipB : null;
    if (!file) { res.writeHead(404).end(); return; }
    const stat = await fs.stat(file);
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': stat.size });
    createReadStream(file).pipe(res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const sampledFrames = await sampleVideoFrames(`${base}/scene-a.mp4`, 3);
  assert.equal(sampledFrames.length, 3, 'Visual QA should sample three frames from each clip.');
  assert.ok(sampledFrames.every((frame) => frame.bytes.length > 1000 && frame.mimeType === 'image/jpeg'), 'Sampled frames should be non-empty JPEG images.');
  assert.ok(sampledFrames[0].timestamp < sampledFrames[1].timestamp && sampledFrames[1].timestamp < sampledFrames[2].timestamp, 'Sample timestamps should be ordered through the clip.');

  merged = await mergeClips([`${base}/scene-a.mp4`, `${base}/scene-b.mp4`]);
  const stat = await fs.stat(merged.file);
  assert.ok(stat.size > 2_000, 'Merged MP4 should not be empty.');
  assert.ok(infoLines.some((line) => line.includes('Scene merge used packet stream-copy')),
    'Matching clips with AAC audio should take the packet stream-copy fast path.');
  assert.ok(infoLines.some((line) => line.includes('Final film audio mastered') && line.includes('-14')),
    'The final film should complete the audio-only -14 LUFS mastering pass.');


  const probe = await run(['-hide_banner', '-i', merged.file, '-f', 'null', '-']);
  assert.equal(probe.code, 0, `Merged MP4 must decode: ${probe.stderr.slice(-1200)}`);
  assert.match(probe.stderr, /Video:\s*h264/i, 'Merged output should retain H.264 video.');
  assert.match(probe.stderr, /Audio:\s*aac/i, 'Merged output should retain AAC audio.');
  const duration = probe.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  assert.ok(duration, 'FFmpeg should report the merged MP4 duration.');
  const seconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
  assert.ok(seconds >= 3.8 && seconds <= 4.3, `Expected about 4 seconds of video, got ${seconds}.`);

  mergedTransition = await mergeClips([base + '/scene-a.mp4', base + '/scene-b.mp4'], { transition: 'fade', transitionDuration: 0.4 });
  const transitionProbe = await run(['-hide_banner', '-i', mergedTransition.file, '-f', 'null', '-']);
  assert.equal(transitionProbe.code, 0, `Crossfade MP4 must decode: ${transitionProbe.stderr.slice(-1200)}`);
  assert.match(transitionProbe.stderr, /Video:\s*h264/i, 'Crossfade output should retain H.264 video.');
  assert.match(transitionProbe.stderr, /Audio:\s*aac/i, 'Crossfade output should retain AAC audio.');
  const transitionDuration = transitionProbe.stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  assert.ok(transitionDuration, 'FFmpeg should report the transitioned film duration.');
  const transitionSeconds = Number(transitionDuration[1]) * 3600 + Number(transitionDuration[2]) * 60 + Number(transitionDuration[3]);
  assert.ok(transitionSeconds >= 3.4 && transitionSeconds <= 3.8, `Expected about 3.6 seconds after one 0.4-second crossfade, got ${transitionSeconds}.`);
  assert.ok(transitionSeconds < seconds - 0.1, 'A crossfade should shorten the joined runtime by its overlap duration.');

  console.log('Scene assembly smoke tests passed (stream-copy cut + real H.264/AAC crossfade).');
} finally {
  console.info = originalInfo;
  if (merged) await merged.cleanup().catch(() => undefined);
  if (mergedTransition) await mergedTransition.cleanup().catch(() => undefined);
  if (server) await new Promise((resolve) => server.close(resolve));
  await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
}
