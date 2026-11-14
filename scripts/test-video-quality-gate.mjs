import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../server/lib/video-quality-gate.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'video-quality-gate.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const gate = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const strong = {
  passed: true, severity: 'none', confidence: 'high',
  qualityScore: 84, promptMatchScore: 91, motionCoherenceScore: 79,
  issues: [], summary: 'The requested action is clear and coherent.',
};
assert.deepEqual(gate.evaluateVisualReview(strong), {
  status: 'passed', reject: false, reason: 'The requested action is clear and coherent.',
});

const identityDefect = { ...strong, passed: false, severity: 'major', identityDrift: true, summary: 'The lead actor changes identity.' };
const identityDecision = gate.evaluateVisualReview(identityDefect);
assert.equal(identityDecision.status, 'rejected');
assert.equal(identityDecision.reject, true);
assert.match(identityDecision.reason, /identity/i);

const continuityDefect = { ...strong, passed: false, severity: 'major', sceneContinuityIssue: true, summary: 'The lead cast and important prop change without a story reason.' };
const continuityDecision = gate.evaluateVisualReview(continuityDefect);
assert.equal(continuityDecision.status, 'rejected', 'unmotivated cast, wardrobe or prop discontinuity blocks the shot');
assert.match(continuityDecision.reason, /story|cast|wardrobe|props/i);

const lowPromptMatch = { ...strong, qualityScore: 80, promptMatchScore: 28, summary: 'The shot does not show the requested action.' };
const lowPromptDecision = gate.evaluateVisualReview(lowPromptMatch);
assert.equal(lowPromptDecision.status, 'rejected', 'high-confidence prompt mismatch scores block unusable shots');
assert.match(lowPromptDecision.reason, /matched only 28/);

const lowConfidence = { ...strong, confidence: 'low', qualityScore: 20, promptMatchScore: 10, motionCoherenceScore: 5 };
assert.equal(gate.evaluateVisualReview(lowConfidence).status, 'passed', 'uncertain numeric scores alone must not cause a rejection');

const minorWarning = { ...strong, passed: false, severity: 'minor', issues: ['The background is slightly soft.'] };
const warning = gate.evaluateVisualReview(minorWarning);
assert.equal(warning.status, 'warning');
assert.equal(warning.reject, false);

const unavailable = gate.evaluateVisualReview(null);
assert.equal(unavailable.status, 'unavailable');
assert.equal(unavailable.reject, false);
assert.match(unavailable.reason, /not been quality-certified/i);

assert.equal(gate.VISUAL_QUALITY_THRESHOLDS.overall, 58);
assert.equal(gate.VISUAL_QUALITY_THRESHOLDS.promptMatch, 45);
assert.equal(gate.VISUAL_QUALITY_THRESHOLDS.motionCoherence, 38);

const handler = fs.readFileSync(new URL('../server/handler.ts', import.meta.url), 'utf8');
assert.match(handler, /if \(p\.tries < MAX_PART_TRIES\)/, 'visual QA retry budget must be the same bounded three-attempt budget as provider rendering');
assert.match(handler, /evaluateVisualReview\(review\)/, 'generated clips must pass through the central visual quality decision');
assert.match(handler, /quality-certified/i, 'an unavailable visual reviewer must not be reported as a pass');
assert.doesNotMatch(handler, /Accepted after one visual retry/, 'a clip rejected on every attempt must never be silently accepted');

assert.match(handler, /resolveFalKlingResolution\(spec\.videoQuality \|\| 'balanced'\)/, 'quality-first must select the matching Kling resolution');
assert.ok((handler.match(/spec\.videoQuality \|\| 'balanced'/g) || []).length >= 3, 'the selected quality profile must reach Kling and both FAL reference-to-video paths');

const services = fs.readFileSync(new URL('../server/lib/services.ts', import.meta.url), 'utf8');
const falReferenceAdapter = services.match(/export async function falReferenceVideoSubmit\([\s\S]*?\n}\n/);
assert.ok(falReferenceAdapter, 'the FAL reference-to-video adapter must exist');
assert.match(falReferenceAdapter[0], /resolveFalPromptExpansionMode\(quality, process\.env\.FAL_PROMPT_EXPANSION\)/, 'FAL reference-to-video must honor the selected prompt expansion profile');

const studio = fs.readFileSync(new URL('../src/components/SeriesStudio.tsx', import.meta.url), 'utf8');
assert.match(studio, /episode\.visualQuality/, 'the series studio must display the visual review data returned by the API');
assert.match(studio, /Not certified/, 'an unavailable visual review must be explicitly identified as unverified');

const db = fs.readFileSync(new URL('../server/lib/db.ts', import.meta.url), 'utf8');
assert.match(db, /ADD COLUMN IF NOT EXISTS render_prompt TEXT/);
assert.match(db, /ADD COLUMN IF NOT EXISTS visual_review JSONB/);
assert.match(db, /ADD COLUMN IF NOT EXISTS visual_review_started_at TIMESTAMPTZ/);

assert.match(handler, /async function reviewDirectVideoJob\(job: any\)/, 'single-video and ad renders must use the same visual review gate');
assert.match(handler, /SET visual_review_started_at = now\(\)[\s\S]*?visual_review_started_at < now\(\) - interval '90 seconds'/, 'direct video review must claim a DB lock to prevent duplicate paid vision reviews');
assert.match(handler, /sampleVideoFrames\(String\(job\.video_url\), 4\)/, 'direct video review must sample four chronological frames');
assert.match(handler, /SET visual_review = \$\{jsonb\(result\)\}::jsonb,[\s\S]*?status = \$\{rejected \? 'failed' : 'done'\}/, 'direct rejections must be persisted and marked failed for usage refunds');
assert.match(handler, /render_prompt\) VALUES \(\$\{id\}, \$\{row\.id\}, \$\{job\.statusUrl\}, \$\{job\.responseUrl\}, \$\{seconds\}, \$\{source\}, \$\{prompt\}\)/, 'direct renders must save the exact prompt that will be reviewed');
assert.match(handler, /videoStatus:[\s\S]*?reviewDirectVideoJob\(completed\)/, 'status polling must not reveal a finished direct clip before visual review');

const client = fs.readFileSync(new URL('../src/services/aiService.ts', import.meta.url), 'utf8');
assert.match(client, /for \(let attempt = 1; attempt <= 3; attempt\+\+\)/, 'single clip quality rejection retries must be bounded to three total jobs');
assert.match(client, /message\.startsWith\('Visual QA rejected this shot:'\)/, 'only quality-rejected renders should auto-retry');
assert.match(client, /rejected attempt was refunded; generating a fresh variation/);
console.log('Direct video quality review tests passed (persistent prompt review, duplicate-call lock, usage refund and bounded client retries).');
assert.match(handler, /UPDATE video_jobs SET status = 'failed'[\s\S]*?delete p\.jobId/, 'a rejected paid provider job must be failed before the episode releases it');
console.log('Visual quality gate tests passed (major defects, confidence-aware scores, warnings, unavailable review, bounded retries and billing refund).');
