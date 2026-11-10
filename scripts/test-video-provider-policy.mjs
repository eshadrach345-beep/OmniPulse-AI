import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../server/lib/video-provider-policy.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const policy = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

assert.equal(policy.parseVideoProvider(undefined), 'fal', 'fal remains the safe default');
assert.equal(policy.parseVideoProvider(' DEAPI '), 'deapi');
assert.equal(policy.parseVideoProvider('auto'), 'auto');
assert.throws(() => policy.parseVideoProvider('unknown'), /VIDEO_PROVIDER must be fal, deapi, or auto/);

assert.equal(policy.shouldFallbackToDeapi('fal'), false, 'ordinary fal errors must not silently fall back');
assert.equal(policy.shouldFallbackToDeapi('deapi'), false, 'deapi is already the selected provider');
assert.equal(policy.shouldFallbackToDeapi('auto'), true, 'auto keeps its existing fallback behaviour');
const exhaustedBalance = new Error('fal.ai does not have enough credit for Kling 4.0.');
assert.equal(policy.isFalCreditExhaustion(exhaustedBalance), true);
assert.equal(policy.shouldFallbackToDeapi('fal', exhaustedBalance), true, 'fal credit exhaustion activates DeAPI even when fal was selected');
assert.equal(policy.shouldFallbackToDeapi('deapi', exhaustedBalance), false, 'DeAPI does not need a fallback when it is already selected');
assert.equal(policy.shouldFallbackToDeapi('fal', new Error('fal.ai rejected the API key. Check FAL_KEY.')), false, 'credential errors must not trigger a misleading credit fallback');

assert.equal(policy.shouldAttemptKlingMultiShot('fal', true, 2), true);
assert.equal(policy.shouldAttemptKlingMultiShot('auto', true, 2), true);
assert.equal(policy.shouldAttemptKlingMultiShot('fal', false, 2), false);
assert.equal(policy.shouldAttemptKlingMultiShot('deapi', true, 2), false);
assert.equal(policy.requiresKlingMultiShot('fal', 2), true, 'multi-shot requests must not silently degrade to a single-shot model');
assert.equal(policy.requiresKlingMultiShot('auto', 2), true);
assert.equal(policy.requiresKlingMultiShot('deapi', 2), false, 'DeAPI receives an explicit prose conversion instead');

console.log('Video provider policy tests passed.');
