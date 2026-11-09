type AnyRecord = Record<string, any>;

const asRecord = (value: unknown): AnyRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {};

const asList = (value: unknown): any[] => Array.isArray(value) ? value : [];
const cleanText = (value: unknown, max = 1000): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const safeUrlInNotes = (value: unknown, notes: string): string => {
  const url = cleanText(value, 800);
  if (!/^https?:\/\/\S+$/i.test(url) || !notes.includes(url)) return '';
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? url : '';
  } catch {
    return '';
  }
};

function validSourceRefs(notes: string): Set<number> {
  const refs = new Set<number>();
  for (const match of notes.matchAll(/\[SOURCE\s+(\d+)\]/gi)) {
    const value = Number(match[1]);
    if (Number.isSafeInteger(value) && value > 0) refs.add(value);
  }
  return refs;
}

function cleanHashtagItems(
  values: unknown,
  category: 'viral' | 'niche' | 'evergreen',
  notes: string,
): AnyRecord[] {
  const seen = new Set<string>();
  return asList(values).flatMap((value) => {
    const item = asRecord(value);
    const tag = cleanText(item.tag, 80);
    if (!/^#[\p{L}\p{N}_]{2,}$/u.test(tag)) return [];
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    const verified = category === 'viral' && notes.toLocaleLowerCase().includes(key);
    if (category === 'viral' && !verified) return [];
    const score = Number(item.velocityScore);
    return [{
      tag,
      volume: 'Not measured',
      competition: 'Unknown',
      // This is explicitly a topic-fit score, never a measured trend or reach metric.
      velocityScore: Number.isFinite(score) ? Math.max(1, Math.min(100, Math.round(score))) : 60,
      category,
      evidenceStatus: verified ? 'verified' : 'suggested',
    }];
  });
}

/**
 * Enforces the evidence boundary after generation. The language model may summarize evidence,
 * but it cannot create source citations, creator URLs or "viral" hashtags out of thin air.
 */
export function validateTrendRadarOutput(value: unknown, notes: string): AnyRecord {
  const data = asRecord(value);
  const refs = validSourceRefs(notes);
  const validTopics = asList(data.trendingTopics).flatMap((value) => {
    const topic = asRecord(value);
    const title = cleanText(topic.title, 220);
    const whyNow = cleanText(topic.whyNow, 700);
    if (!title || !whyNow) return [];
    const cited = [...whyNow.matchAll(/\[SOURCE\s+(\d+)\]/gi)]
      .some((match) => refs.has(Number(match[1])));
    if (!cited) return [];
    return [{
      ...topic,
      id: cleanText(topic.id, 100) || 'trend-' + validTopics.length,
      title,
      whyNow,
      estimatedReachMultiplier: 'Not measured',
    }];
  }).slice(0, 5);

  const creatorRows = asList(data.trendingCreators).flatMap((value) => {
    const creator = asRecord(value);
    const name = cleanText(creator.name, 160);
    const url = safeUrlInNotes(creator.url, notes);
    if (!name || !url) return [];
    const recentVideos = asList(creator.recentVideos).flatMap((value) => {
      const video = asRecord(value);
      const videoUrl = safeUrlInNotes(video.url, notes);
      if (!videoUrl) return [];
      return [{
        ...video,
        title: cleanText(video.title, 220) || 'Recent video',
        url: videoUrl,
        views: null,
        viewsPerHour: null,
        metricLabel: 'Not publicly available',
      }];
    }).slice(0, 3);
    return [{
      ...creator,
      name,
      url,
      handle: cleanText(creator.handle, 120),
      recentVideos,
    }];
  }).slice(0, 8);

  const hashtags = asRecord(data.viralHashtags);
  return {
    ...data,
    trendingTopics: validTopics,
    trendingCreators: creatorRows,
    viralHashtags: {
      viral: cleanHashtagItems(hashtags.viral, 'viral', notes).slice(0, 5),
      nicheSpecific: cleanHashtagItems(hashtags.nicheSpecific, 'niche', notes).slice(0, 5),
      evergreen: cleanHashtagItems(hashtags.evergreen, 'evergreen', notes).slice(0, 5),
    },
    suggestedKeywords: asList(data.suggestedKeywords).map((value) => cleanText(value, 100)).filter(Boolean).slice(0, 8),
    bestPractices: asList(data.bestPractices).flatMap((value) => {
      const item = asRecord(value);
      const title = cleanText(item.title, 160);
      const actionableStep = cleanText(item.actionableStep, 500);
      return title && actionableStep ? [{ ...item, title, actionableStep }] : [];
    }).slice(0, 5),
  };
}
