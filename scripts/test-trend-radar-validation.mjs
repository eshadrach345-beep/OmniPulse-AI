import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../server/lib/trend-radar-validation.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'trend-radar-validation.ts',
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const validator = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const notes = [
  '[SOURCE 1] New platform launch and the #LaunchDay tag.',
  'URL: https://example.com/news',
  '[SOURCE 2] A creator shared a real audience story.',
  'Channel: https://youtube.com/@verifiedcreator',
  'Video URL: https://youtube.com/watch?v=abcdefghijk',
].join('\n');

const result = validator.validateTrendRadarOutput({
  trendingTopics: [
    { title: 'New platform launch', whyNow: 'The launch was announced this week [SOURCE 1].', estimatedReachMultiplier: '4x' },
    { title: 'Generic evergreen advice', whyNow: 'This is useful all year.' },
    { title: 'Uncited story', whyNow: 'People are discussing it [SOURCE 99].' },
  ],
  trendingCreators: [
    { name: 'Verified Creator', url: 'https://youtube.com/@verifiedcreator', recentVideos: [{ title: 'A story', url: 'https://youtube.com/watch?v=abcdefghijk', views: 999999 }] },
    { name: 'Invented Creator', url: 'https://example.com/not-in-sources' },
  ],
  viralHashtags: {
    viral: [
      { tag: '#LaunchDay', volume: '1M', competition: 'Low', velocityScore: 98 },
      { tag: '#MadeUpViral', volume: 'Huge', competition: 'Low', velocityScore: 99 },
    ],
    nicheSpecific: [{ tag: '#UsefulIdea', volume: 'Millions', competition: 'Low', velocityScore: 70 }],
    evergreen: [{ tag: '#CreatorTips', volume: 'Large', competition: 'Low', velocityScore: 60 }],
  },
  suggestedKeywords: [' creator story ', '', 'current launch'],
  bestPractices: [{ title: 'Use the news', actionableStep: 'Explain what changed.' }, { title: '', actionableStep: '' }],
}, notes);

assert.equal(result.trendingTopics.length, 1, 'only a topic with a valid source citation should survive');
assert.equal(result.trendingTopics[0].estimatedReachMultiplier, 'Not measured');
assert.equal(result.trendingCreators.length, 1, 'only creators with a URL present in supplied evidence should survive');
assert.equal(result.trendingCreators[0].recentVideos[0].views, null, 'unverified creator metrics must be removed');
assert.deepEqual(result.viralHashtags.viral.map(x => x.tag), ['#LaunchDay']);
assert.equal(result.viralHashtags.viral[0].evidenceStatus, 'verified');
assert.equal(result.viralHashtags.viral[0].volume, 'Not measured');
assert.equal(result.viralHashtags.nicheSpecific[0].evidenceStatus, 'suggested');
assert.equal(result.viralHashtags.nicheSpecific[0].competition, 'Unknown');
assert.equal(result.suggestedKeywords.length, 2);
assert.equal(result.bestPractices.length, 1);

console.log('Trend radar evidence-validation tests passed (citations, creator URLs, hashtags and unsupported metrics).');
