import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../server/lib/scene-keyframe.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'scene-keyframe.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const prompt = mod.buildSceneKeyframePrompt({
  scenePrompt: 'A woman opens a weathered wooden box beside the sea.',
  location: 'Stormy cliffside with iron railing.',
  aspect: '9:16',
  characters: [{ name: 'Mara', description: 'Dark hair, olive skin, orange raincoat.' }],
  props: [{ name: 'wooden box', description: 'Rectangular dark oak box with brass corner panels.' }],
  referenceKind: 'character',
});
assert.match(prompt, /exact lead-character identity reference/);
assert.match(prompt, /Mara: Dark hair/);
assert.match(prompt, /wooden box: Rectangular dark oak/);
assert.match(prompt, /9:16 frame/);
assert.match(prompt, /natural hands and fingers/);
assert.match(prompt, /No ghosted objects/);

const refs = [
  { url: 'https://example.test/location.jpg', kind: 'location' },
  { url: 'https://example.test/character.jpg', kind: 'character' },
  { url: 'https://example.test/product.jpg', kind: 'product' },
];
assert.equal(mod.chooseSceneKeyframeReference(refs).url, refs[1].url, 'character identity takes priority over location plate');
assert.equal(mod.chooseSceneKeyframeReference([{ url: 'https://example.test/product.jpg', kind: 'product' }]).kind, 'product');
assert.equal(mod.chooseSceneKeyframeReference([]), undefined);
console.log('Scene keyframe prompt and reference-selection tests passed.');
