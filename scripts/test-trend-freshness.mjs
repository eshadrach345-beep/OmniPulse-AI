import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../server/lib/trend-freshness.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'trend-freshness.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const freshness = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const now = Date.parse('2026-11-09T00:00:00.000Z');

assert.equal(freshness.TREND_FRESHNESS_DAYS, 14);
assert.equal(freshness.isRecentTrendSource('today', now), true);
assert.equal(freshness.isRecentTrendSource('yesterday', now), true);
assert.equal(freshness.isRecentTrendSource('2 days ago', now), true);
assert.equal(freshness.isRecentTrendSource('14 days ago', now), true);
assert.equal(freshness.isRecentTrendSource('15 days ago', now), false);
assert.equal(freshness.isRecentTrendSource('3 weeks ago', now), false);
assert.equal(freshness.isRecentTrendSource(undefined, now), false, 'undated pages must never be labelled as current');
assert.equal(freshness.isRecentTrendSource('not a date', now), false);
assert.equal(freshness.isRecentTrendSource('2026-11-08T12:00:00.000Z', now), true);
assert.equal(freshness.isRecentTrendSource('2026-10-01T12:00:00.000Z', now), false);
assert.equal(freshness.isRecentTrendSource('2026-12-01T12:00:00.000Z', now), false, 'future-dated sources should be rejected');
assert.equal(freshness.normalizeTrendPublishedAt('yesterday', now), '2026-11-08T00:00:00.000Z');

console.log('14-day trend freshness tests passed (stale, undated and future sources excluded).');
