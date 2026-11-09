export type TrendSearchCategory = 'news' | 'stories' | 'youtube' | 'short-form' | 'hashtags' | 'community' | 'industry';

export interface TrendSearchQuery {
  category: TrendSearchCategory;
  query: string;
}

/**
 * Builds a deliberately varied search plan instead of repeating the same generic niche query.
 * The date is included as context for search engines; returned pages are still date-validated
 * independently before they can appear as current trends.
 */
export function buildTrendSearchQueries(niche: string, customQuery = '', now = new Date()): TrendSearchQuery[] {
  const clean = (value: string) => String(value || '').replace(/["\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const topic = clean(niche) || 'Tech and AI';
  const focus = clean(customQuery);
  const date = now.toISOString().slice(0, 10);
  const year = String(now.getUTCFullYear());
  const prefix = '"' + topic + '"';
  const suffix = (focus ? ' Focus: ' + focus + '.' : '') + ' Current as of ' + date + '. Published in the last 14 days.';
  return [
    { category: 'news', query: prefix + ' latest breaking news announcements reports and major events ' + year + suffix },
    { category: 'stories', query: prefix + ' viral stories real examples case studies creator stories controversies and audience reactions ' + year + suffix },
    { category: 'youtube', query: prefix + ' recent YouTube videos Shorts channels creators public views and new formats ' + suffix },
    { category: 'short-form', query: prefix + ' TikTok trends Instagram Reels short videos challenges sounds and creator posts ' + suffix },
    { category: 'hashtags', query: prefix + ' hashtags hashtag campaigns tags used in recent public posts and videos ' + suffix },
    { category: 'community', query: prefix + ' Reddit discussions community conversations questions complaints and audience pain points ' + suffix },
    { category: 'industry', query: prefix + ' product launches platform updates research data funding regulation and industry changes ' + year + suffix },
  ];
}
