import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../server/lib/trend-search-plan.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'trend-search-plan.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const plan = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const queries = plan.buildTrendSearchQueries('Afrobeats & African Entertainment', 'new music releases and viral dance challenge', new Date('2026-11-10T12:00:00.000Z'));

assert.equal(queries.length, 7, 'the radar should use multiple distinct research angles');
assert.deepEqual([...new Set(queries.map((item) => item.category))], ['news', 'stories', 'youtube', 'short-form', 'hashtags', 'community', 'industry']);
assert.ok(queries.every((item) => item.query.includes('Afrobeats & African Entertainment')));
assert.ok(queries.every((item) => item.query.includes('new music releases and viral dance challenge')));
assert.ok(queries.every((item) => item.query.includes('2026-11-10')));
assert.ok(queries.find((item) => item.category === 'stories').query.includes('case studies'));
assert.ok(queries.find((item) => item.category === 'hashtags').query.includes('hashtag campaigns'));
assert.ok(queries.find((item) => item.category === 'community').query.includes('Reddit'));
assert.ok(plan.buildTrendSearchQueries('', '', new Date('2026-01-01T00:00:00.000Z'))[0].query.includes('Tech and AI'));

console.log('Trend search-plan tests passed (7 distinct current-news, story, platform, hashtag and community angles).');
