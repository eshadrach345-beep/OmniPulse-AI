import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const helperSource = fs.readFileSync(new URL('../src/services/editorTimeline.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { splitVideoScene } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const source = {
  id: 'scene-1', sceneNumber: 1, duration: 10, visualCue: '', narration: '', onScreenText: '',
  soundEffectCue: '', motionStyle: 'Dynamic Zoom', bgGradient: 'none',
  mediaLayers: [{ id: 'main', assetId: 'video-1', name: 'clip.mp4', contentType: 'video/mp4', kind: 'video', track: 'main', startAt: 0, sourceIn: 3, duration: 10, volume: 1, opacity: 1, scale: 100, x: 50, y: 50 }],
  captions: [{ start: 2, end: 8, text: 'Hello there' }],
  textOverlays: [{ id: 'title', start: 1, end: 5, text: 'TITLE', y: 'h*0.78', fontSize: 42 }],
};
const result = splitVideoScene(source, 4);
assert.ok(result);
assert.equal(result.first.duration, 4);
assert.equal(result.second.duration, 6);
assert.equal(result.first.mediaLayers[0].duration, 4);
assert.equal(result.second.mediaLayers[0].sourceIn, 7);
assert.equal(result.second.mediaLayers[0].duration, 6);
assert.deepEqual(result.first.captions, [{ start: 2, end: 4, text: 'Hello there' }]);
assert.deepEqual(result.second.captions, [{ start: 0, end: 4, text: 'Hello there' }]);
assert.deepEqual(result.first.textOverlays.map(x => [x.start, x.end]), [[1, 4]]);
assert.deepEqual(result.second.textOverlays.map(x => [x.start, x.end]), [[0, 1]]);
assert.equal(splitVideoScene(source, 0.2), null);
const handler = fs.readFileSync(new URL('../server/handler.ts', import.meta.url), 'utf8');
assert.match(handler, /GET \/video\/editor\/capabilities': videoEditorCapabilities/);
assert.match(handler, /const textOverlays = \(Array\.isArray\(scene\.textOverlays\)/);
assert.match(handler, /audio: audioFiles, captions, textOverlays/);
console.log('Creative Lab split, text-overlay export and AI capability tests passed.');
