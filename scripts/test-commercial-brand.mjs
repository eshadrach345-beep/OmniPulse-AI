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
assert.match(prompt, /No action-movie danger, crowds, hand close-ups or invented product features/i);
assert.match(prompt, /screens-within-screens/i);
assert.match(prompt, /disembodied hands/i);
const ui = fs.readFileSync(new URL('../src/components/SeriesStudio.tsx', import.meta.url), 'utf8');
assert.ok(ui.includes("if (f.id === 'commercial') { setSceneSeconds(10); setReviewFirst(true); setSeconds(30); }"));
assert.ok(ui.includes('six directed 5-second shots'));
const merge = fs.readFileSync(new URL('../server/lib/merge.ts', import.meta.url), 'utf8');
assert.ok(merge.includes('if (same) {'));
assert.ok(merge.includes("'-c', 'copy'"));
assert.ok(merge.includes(".join('\\n')"));
assert.ok(merge.includes("'-preset', 'ultrafast'"));
assert.ok(merge.includes("'-crf', '23'"));
assert.ok(merge.includes("'-b:a', '160k'"));
assert.ok(merge.includes('Scene merge used packet stream-copy'));
assert.ok(!merge.includes('dynaudnorm'));
assert.ok(!merge.includes('loudnorm'));
assert.ok(ui.includes('Brand kit & visual references'));
assert.ok(ui.includes("handleUploadUrl: '/api/media/upload'"));
assert.ok(ui.includes('brandReferences.map'));
assert.ok(ui.includes('brandCta'));
assert.ok(ui.includes('brandUrl'));
const handler = fs.readFileSync(new URL('../server/handler.ts', import.meta.url), 'utf8');
const services = fs.readFileSync(new URL('../server/lib/services.ts', import.meta.url), 'utf8');
assert.ok(services.includes("buildDeapiVideoFields"));
assert.ok(services.includes("getDeapiVideoModelInfo"));
assert.ok(services.includes("DEAPI_VIDEO_SEED"));
assert.ok(services.includes("form.set(key, value)"));
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
assert.ok(handler.includes('const closingDuration = Math.min(4, duration)'));
assert.ok(handler.includes('textOverlays: ['));
assert.ok(handler.includes('text: cta'));
assert.ok(handler.includes('text: website'));
assert.ok(handler.includes('const width = ratio >= 1 ? 1920 : 1080'));
assert.ok(handler.includes('buildCommercialShotPrompts'));
assert.ok(handler.includes('commercialMultiPrompt'));
assert.ok(handler.includes('const deapiAnimationPrompt = deapiMultiPrompt?.length'));
assert.ok(handler.includes('deapiAnimate(deapiAnimationPrompt'));
assert.ok(handler.includes('multiPrompt: commercialMultiPrompt || scene.parts[k].multiPrompt'));
const assembly = fs.readFileSync(new URL('../server/lib/assemble.ts', import.meta.url), 'utf8');
assert.ok(assembly.includes('Avoid hand close-ups'));
assert.ok(handler.includes('deapiCommercialOpening'));
assert.ok(handler.includes('brandReferenceImages[0]?.url'));
assert.ok(handler.includes('cta: str(kit.cta, 60), url: str(kit.url, 140)'));
assert.ok(handler.includes('const cta = str(kit.cta, 60)'));
assert.ok(handler.includes('BRAND_CARD_RENDER_FAILED'));
const studio = fs.readFileSync(new URL('../src/components/SeriesStudio.tsx', import.meta.url), 'utf8');
const seriesService = fs.readFileSync(new URL('../src/services/seriesService.ts', import.meta.url), 'utf8');
assert.ok(seriesService.includes('cta?: string; url?: string;'));
assert.ok(handler.includes('hasBrandLogo: !!cfg.brandKit?.logoAssetId'));
assert.ok(seriesService.includes('hasBrandLogo: boolean'));
assert.ok(studio.includes('Final branded advert preview'));
assert.ok(studio.includes('src={episode.finalVideoUrl}'));
console.log('All OmniPulse commercial and Brand Kit regressions passed.');
