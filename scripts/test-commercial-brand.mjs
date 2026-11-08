// Offline regressions for the OmniPulse commercial storyboard and Brand Kit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../server/lib/prompts.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'prompts.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const promptsUrl = 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64');
const P = await import(promptsUrl);
const prompt = P.storyPrompt({
  idea: 'Show a bricklayer, student, business owner and office professional using a real AI creative platform.',
  format: 'commercial', look: 'premium, grounded technology commercial', niche: 'AI productivity platform',
  aspectRatio: '16:9', clips: [10, 10, 10, 10, 10, 10],
  mood: Object.keys(P.STORY_MOODS)[0], cameraProfile: Object.keys(P.CAMERA_PROFILES)[0], pacing: 'confident and energetic',
});
assert.match(prompt, /COMMERCIAL DIRECTOR.S BRIEF/);
assert.match(prompt, /premium brand commercial/i);
assert.match(prompt, /human hook, real-world context, product or service in use/i);
assert.match(prompt, /different visual purpose/i);
assert.match(prompt, /profession-specific actions/i);
assert.match(prompt, /Never place unexplained papers, bundles, tools, maps, boxes or props on a person.s head/i);
assert.match(prompt, /No generated logo, brand name, subtitle, sign or readable lettering/i);
assert.match(prompt, /clean closing composition/i);
assert.match(prompt, /screens-within-screens/i);
assert.match(prompt, /disembodied hands/i);
const ui = fs.readFileSync(new URL('../src/components/SeriesStudio.tsx', import.meta.url), 'utf8');
assert.ok(ui.includes("if (f.id === 'commercial') { setSceneSeconds(10); setReviewFirst(true); setSeconds(60); }"));
assert.ok(ui.includes('Brand kit & visual references'));
assert.ok(ui.includes("handleUploadUrl: '/api/media/upload'"));
assert.ok(ui.includes('brandReferences.map'));
const handler = fs.readFileSync(new URL('../server/handler.ts', import.meta.url), 'utf8');
assert.ok(handler.includes('BRAND_ASSET_NOT_FOUND'));
assert.ok(handler.includes('BRAND_ASSET_TYPE'));
assert.ok(handler.includes('brandReferenceImages.slice(0, brandSlots)'));
assert.ok(handler.includes('reference_assets = COALESCE(reference_assets'));
// Commercial product references take priority over cast portraits, and the exact private logo
// is composited over a clean closing card instead of being left to the generative model.
assert.ok(handler.includes("String(ep.brief?.format || '') === 'commercial'"));
assert.ok(handler.includes('brandReferenceImages.slice(0, Math.max(0, 4 - locationRef.length))'));
assert.ok(handler.includes('const logoAssetId = str(kit.logoAssetId, 80)'));
assert.ok(handler.includes('closing-card.ppm'));
assert.ok(handler.includes('deapiCommercialOpening'));
assert.ok(handler.includes('brandReferenceImages[0]?.url'));
assert.ok(handler.includes('BRAND_CARD_RENDER_FAILED'));
console.log('All OmniPulse commercial and Brand Kit regressions passed.');
