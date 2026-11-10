import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

async function importTypeScript(path, name) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: name,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
}

const D = await importTypeScript('../server/lib/deapi-duration.ts', 'deapi-duration.ts');
const seedanceLimits = {
  info: {
    limits: { min_frames: 97, max_frames: 721, min_fps: 24, max_fps: 24 },
    defaults: { fps: 24 },
  },
};
const seedance = D.getDeapiFrameLimits('seedance-2.5', seedanceLimits);
assert.equal(seedance.minDurationSeconds, 4);
assert.equal(seedance.maxDurationSeconds, 30);
assert.deepEqual(D.deapiFramesForDuration(4, 'seedance-2.5', seedanceLimits), { frames: 97, fps: 24 });
assert.deepEqual(D.deapiFramesForDuration(30, 'seedance-2.5', seedanceLimits), { frames: 721, fps: 24 });
assert.throws(() => D.deapiFramesForDuration(3, 'seedance-2.5', seedanceLimits), /supports approximately 4–30 seconds/);
assert.throws(() => D.deapiFramesForDuration(31, 'seedance-2.5', seedanceLimits), /supports approximately 4–30 seconds/);
assert.throws(() => D.deapiFramesForDuration(30.5, 'seedance-2.5', seedanceLimits), /whole number/);

// Account-live model limits override fallback documentation.
const ltxLimits = { info: { limits: { min_frames: 49, max_frames: 241, min_fps: 24, max_fps: 24 }, defaults: { fps: 24 } } };
assert.deepEqual(D.deapiFramesForDuration(10, 'Ltx2_3_22B', ltxLimits), { frames: 241, fps: 24 });
assert.throws(() => D.deapiFramesForDuration(30, 'Ltx2_3_22B', ltxLimits), /supports approximately 2–10 seconds/);

// Known public model fallback works only for the exact documented family.
assert.equal(D.getDeapiFrameLimits('Kling-4', {}).maxDurationSeconds, 30);
assert.equal(D.getDeapiFrameLimits('unknown-video-model', {}), null);
assert.throws(() => D.deapiFramesForDuration(30, 'unknown-video-model', {}), /did not publish frame limits/);
const minimaxLimits = { info: { limits: { min_frames: 96, max_frames: 360, min_fps: 24, max_fps: 24 }, defaults: { fps: 24 } } };
assert.deepEqual(D.deapiFramesForDuration(15, 'MiniMaxH3_33B_Turbo_INT8', minimaxLimits), { frames: 360, fps: 24 });
assert.throws(() => D.deapiFramesForDuration(30, 'MiniMaxH3_33B_Turbo_INT8', minimaxLimits), /supports approximately 4–15 seconds/);
assert.equal(D.getDeapiFrameLimits('Ltx2_5_22B_Dist_INT8', {}).maxDurationSeconds, 10);
assert.equal(D.getDeapiFrameLimits('veo-3.1', {}).maxDurationSeconds, 8);

console.log('DeAPI duration and frame-limit tests passed.');
