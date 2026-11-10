import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../server/lib/fal-video-profile.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'fal-video-profile.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const profile = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

assert.equal(profile.resolveFalVideoModel('text'), 'minimax/h3-max-turbo/text-to-video');
assert.equal(profile.resolveFalVideoModel('image'), 'minimax/h3-max-turbo/image-to-video');
assert.equal(profile.resolveFalVideoModel('text', 'quality'), 'minimax/h3-max/text-to-video');
assert.equal(profile.resolveFalVideoModel('image', 'quality'), 'minimax/h3-max/image-to-video');
assert.equal(profile.resolveFalVideoModel('text', 'quality', 'minimax/h3-max-turbo/text-to-video'), 'minimax/h3-max/text-to-video', 'per-production quality choice must override the default H3 Turbo model');
assert.equal(profile.resolveFalVideoModel('image', 'balanced', 'minimax/h3-max/text-to-video'), 'minimax/h3-max-turbo/image-to-video', 'balanced choice must select Turbo even when workspace H3 Max is configured');

assert.equal(
  profile.resolveFalVideoModel('image', 'quality', 'custom/model/text-to-video'),
  'custom/model/image-to-video',
  'configured text model is mapped to its image task variant when supported by the suffix convention',
);
assert.equal(
  profile.resolveFalVideoModel('text', 'quality', 'account/custom-model'),
  'account/custom-model',
  'explicit custom model remains authoritative',
);
assert.equal(profile.resolveFalPromptExpansionMode('balanced'), 'balanced');
assert.equal(profile.resolveFalPromptExpansionMode('quality'), 'quality');
assert.equal(profile.resolveFalPromptExpansionMode('quality', 'disabled'), 'disabled');
assert.equal(profile.resolveFalPromptExpansionMode('balanced', 'quality'), 'quality');
assert.equal(profile.resolveFalPromptExpansionMode('quality', 'unknown-value'), 'quality');

console.log('FAL video profile tests passed (balanced Turbo defaults, quality-first H3 Max, custom model precedence and prompt expansion).');
