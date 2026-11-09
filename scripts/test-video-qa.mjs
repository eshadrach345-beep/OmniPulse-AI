import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../server/lib/video-qa.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'video-qa.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const clean = mod.parseVideoQualityOutput(
  '[freezedetect] freeze_start: 2.000\n[freezedetect] freeze_end: 3.250 | freeze_duration: 1.250\n[silencedetect] silence_start: 8.100\n[silencedetect] silence_end: 9.000 | silence_duration: 0.900\n[Parsed_ebur128] I: -14.2 LUFS\n[Parsed_ebur128] Peak: -2.1 dBFS',
);
assert.equal(clean.frozenSegments.length, 1);
assert.equal(clean.frozenSegments[0].duration, 1.25);
assert.equal(clean.silenceSegments[0].duration, 0.9);
assert.equal(clean.integratedLufs, -14.2);
assert.equal(clean.truePeakDbfs, -2.1);
assert.equal(clean.warnings.length, 2, 'long freeze and silence must be flagged');
const loud = mod.parseVideoQualityOutput('[Parsed_ebur128] I: -10.0 LUFS\n[Parsed_ebur128] Peak: -0.2 dBFS');
assert.ok(loud.warnings.some((warning) => warning.includes('loudness')));
assert.ok(loud.warnings.some((warning) => warning.includes('True peak')));
const silentTail = mod.parseVideoQualityOutput('[silencedetect] silence_start: 27.2');
assert.ok(silentTail.warnings.some((warning) => warning.includes('silence gap')));
const noAudio = mod.parseVideoQualityOutput('[freezedetect] freeze_start: 1.0', false);
assert.equal(noAudio.integratedLufs, null);
assert.equal(noAudio.hasAudio, false);
console.log('Video delivery QA parser tests passed (freeze, silence, loudness, true peak and no-audio handling).');
