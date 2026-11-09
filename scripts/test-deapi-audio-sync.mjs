import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../server/lib/deapi-audio-sync.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'deapi-audio-sync.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helpers = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

assert.equal(helpers.deapiAudioSyncFrames(1), 25);
assert.equal(helpers.deapiAudioSyncFrames(2), 49);
assert.equal(helpers.deapiAudioSyncFrames(5), 121);
assert.equal(helpers.deapiAudioSyncFrames(10), 241);
assert.equal(helpers.deapiAudioSyncFrames(11), 265);
assert.throws(() => helpers.deapiAudioSyncFrames(0.5), RangeError);
assert.throws(() => helpers.deapiAudioSyncFrames(12), RangeError);
assert.equal(helpers.supportsDeapiAudioSyncModel('Ltx2_3_22B_Dist_INT8'), true);
assert.equal(helpers.supportsDeapiAudioSyncModel('SomeModel', 'supports_audio_input: true'), true);
assert.equal(helpers.supportsDeapiAudioSyncModel('H3_Max', 'text-to-video only'), false);
assert.deepEqual(helpers.deapiAudioMime('audio/mpeg', 'speech.mp3'), { type: 'audio/mpeg', extension: 'mp3' });
assert.deepEqual(helpers.deapiAudioMime('audio/x-wav', 'voice.wav'), { type: 'audio/wav', extension: 'wav' });
assert.deepEqual(helpers.deapiAudioMime('audio/ogg', 'voice.ogg'), { type: 'audio/ogg', extension: 'ogg' });
assert.deepEqual(helpers.deapiAudioMime('audio/flac', 'voice.flac'), { type: 'audio/flac', extension: 'flac' });
assert.equal(helpers.deapiAudioMime('audio/mp4', 'voice.m4a'), null);
console.log('DeAPI audio-sync model, duration and file-type tests passed.');
