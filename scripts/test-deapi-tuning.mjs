import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../server/lib/deapi-tuning.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'deapi-tuning.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const url = 'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64');
const D = await import(url);

const tuned = D.buildDeapiVideoFields({ info: {
  features: { supports_negative_prompt: true, supports_guidance: true, supports_steps: true },
  limits: { min_guidance: 1, max_guidance: 8, min_steps: 4, max_steps: 12 },
  defaults: { guidance: 4, steps: 8 },
} }, { guidance: 99, steps: 99 });
assert.equal(tuned.guidance, '8', 'guidance clamps to the model maximum');
assert.equal(tuned.steps, '12', 'steps clamps to the model maximum');
assert.match(tuned.negative_prompt, /extra fingers/);
assert.match(tuned.negative_prompt, /duplicate people/);

const defaults = D.buildDeapiVideoFields({ info: {
  features: { supports_negative_prompt: true, supports_guidance: true, supports_steps: true },
  limits: { min_guidance: 0, max_guidance: 10, min_steps: 1, max_steps: 50 },
  defaults: { guidance: 5.5, steps: 14 },
} });
assert.equal(defaults.guidance, '5.5', 'uses the model guidance default');
assert.equal(defaults.steps, '14', 'uses the model steps default');

const noOptional = D.buildDeapiVideoFields({ info: {
  features: { supports_negative_prompt: false, supports_guidance: false, supports_steps: false },
} }, { guidance: 7.5, steps: 30, negative_prompt: 'do not send me' });
assert.deepEqual(noOptional, {}, 'never sends tuning fields disabled by model capabilities');

const unspecified = D.buildDeapiVideoFields({ info: {} });
assert.ok(unspecified.negative_prompt, 'keeps the endpoint-supported negative prompt when the model does not explicitly disable it');
assert.equal(unspecified.guidance, undefined, 'does not guess guidance support');
assert.equal(unspecified.steps, undefined, 'does not guess steps support');

console.log('DeAPI model-aware parameter tests passed.');
