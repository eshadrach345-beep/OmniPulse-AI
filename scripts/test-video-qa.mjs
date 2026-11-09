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

const handler = fs.readFileSync(new URL('../server/handler.ts', import.meta.url), 'utf8');
const rejectionBlock = handler.match(/if \(!review\.passed && review\.severity === 'major'\) \{([\s\S]*?)\n\s*\}\n\s*\} else \{/);
assert.ok(rejectionBlock, 'visual QA major-rejection path must exist');
const rejectionCode = rejectionBlock[1];
const refundUpdate = rejectionCode.indexOf("UPDATE video_jobs SET status = 'failed'");
const clearJob = rejectionCode.indexOf('delete p.jobId');
assert.ok(refundUpdate >= 0, 'a visually rejected completed provider job must be marked failed for billing');
assert.ok(clearJob > refundUpdate, 'billing row must be marked failed before the episode drops its job ID');
assert.match(rejectionCode, /WHERE id = \$\{p\.jobId\} AND user_id = \$\{row\.id\}/, 'refund update must be scoped to the current user and rejected job');

const providerTimeoutBlock = handler.match(/const MAX_PROVIDER_JOB_MS = 20 \* 60_000;[\s\S]*?const st = await refreshJob\(j\);/);
assert.ok(providerTimeoutBlock, 'stale provider jobs must have a bounded timeout before status polling');
assert.match(providerTimeoutBlock[0], /Date\.now\(\) - providerStartedAt > MAX_PROVIDER_JOB_MS/);
assert.match(providerTimeoutBlock[0], /UPDATE video_jobs SET status = 'failed'/);
assert.match(providerTimeoutBlock[0], /p\.tries = MAX_PART_TRIES/);
assert.match(handler, /if \(p\.tries < 2\) \{[\s\S]*?Visual QA still found issues after one retry/);
