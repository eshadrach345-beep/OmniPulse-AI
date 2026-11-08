import React, { useState } from 'react';
import { CompetitorIntel } from './CompetitorIntel';
import { NicheSelect } from './NicheSelect';
import { 
  NicheCategory, 
  TrendingTopic, 
  HashtagGroup, 
  BestPractice, 
  HashtagItem,
  PlatformId,
  SocialAccount
} from '../types';
import { analyzeNicheTrends } from '../services/aiService';
import { api } from '../services/api';

type YouTubeGrowthKit = {
  titleOptions: string[];
  openingHooks: string[];
  description: string;
  tags: string[];
  hashtags: string[];
  shortsIdeas: string[];
  thumbnailConcepts: string[];
  optimizationChecklist: string[];
};

import { 
  TrendingUp, 
  Hash, 
  Search, 
  Sparkles, 
  ArrowUpRight, 
  Copy, 
  Check, 
  Video, 
  Calendar, 
  Compass, 
  ShieldCheck, 
  Flame, 
  Layers, 
  Lightbulb, 
  ExternalLink, 
  Target, 
  BarChart, 
  RefreshCw,
  Users,
  Trophy,
  Plus,
  Zap,
  Wand2,
  Send,
  Eye,
  Youtube,
  Newspaper,
  Globe2
} from 'lucide-react';

/** YouTube exposes a stable public thumbnail URL for verified public video IDs. */
const TREND_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const isFreshPublishedAt = (value?: string) => {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= -24 * 60 * 60 * 1000 && age <= TREND_WINDOW_MS;
};

/** YouTube exposes a stable public thumbnail URL for verified public video IDs. */
const youtubeThumbnail = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith('youtube.com') && host !== 'youtu.be' && !host.endsWith('.youtube.com')) return undefined;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const id = host === 'youtu.be' ? parts[0] : (parsed.searchParams.get('v') || parts[parts.length - 1]);
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined;
  } catch { return undefined; }
};

interface TrendHashtagRadarProps {
  niches: NicheCategory[];
  activeNiche: NicheCategory;
  userAccounts: SocialAccount[];
  onSelectNiche: (niche: NicheCategory) => void;
  onCreateVideoFromTopic: (topic: TrendingTopic) => void;
  onCreatePostFromTopic: (topic: TrendingTopic, hashtags: string[]) => void;
  onSendOutrankToScheduler: (post: { title: string; caption: string; hook: string }) => void;
  onSendOutrankToVideoStudio: (hook: string) => void;
}

export const TrendHashtagRadar: React.FC<TrendHashtagRadarProps> = ({
  niches,
  activeNiche,
  userAccounts,
  onSelectNiche,
  onCreateVideoFromTopic,
  onCreatePostFromTopic,
  onSendOutrankToScheduler,
  onSendOutrankToVideoStudio,
}) => {
  const [customSearchQuery, setCustomSearchQuery] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [copiedBatch, setCopiedBatch] = useState(false);
  const [activeTab, setActiveTab] = useState<'topics' | 'creators' | 'hashtags' | 'competitors' | 'best-practices' | 'youtube-growth'>('topics');
  const [seoKeyword, setSeoKeyword] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoGoal, setSeoGoal] = useState<'discoverability' | 'clicks' | 'subscribers' | 'shorts'>('discoverability');
  const [growthKit, setGrowthKit] = useState<YouTubeGrowthKit | null>(null);
  const [growthKitBusy, setGrowthKitBusy] = useState(false);
  const [growthKitError, setGrowthKitError] = useState('');
  const [showAllCreators, setShowAllCreators] = useState(false);
  const [creatorPlatformFilter, setCreatorPlatformFilter] = useState('All');
  const [creatorSort, setCreatorSort] = useState<'rank' | 'views' | 'velocity' | 'recent'>('rank');

  const recentResearchSources = (activeNiche.researchSources || []).filter((source) => isFreshPublishedAt(source.publishedAt));
  const hasFreshResearch = activeNiche.researchGrounded === true && recentResearchSources.length >= 4;

  const copyGrowthText = (value: string) => { void navigator.clipboard.writeText(value); };

  const buildYouTubeGrowthKit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setGrowthKitBusy(true); setGrowthKitError(''); setGrowthKit(null);
    try {
      const result = await api.post<YouTubeGrowthKit>('/ai/youtube-growth-kit', {
        niche: activeNiche.name, keyword: seoKeyword.trim(), title: seoTitle.trim(),
        description: seoDescription.trim(), goal: seoGoal,
      });
      setGrowthKit(result);
    } catch (error) {
      setGrowthKitError(error instanceof Error ? error.message : 'The YouTube growth package could not be generated.');
    } finally { setGrowthKitBusy(false); }
  };

  // Handle custom niche search or refresh analysis
  const handleRunAnalysis = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsAnalyzing(true);

    setAnalysisError(null);
    try {
      const results = await analyzeNicheTrends(
        customSearchQuery.trim() || activeNiche.name,
        customSearchQuery.trim()
      );

      // If user typed a custom query, update active niche state or create custom category
      const updatedNiche: NicheCategory = {
        ...activeNiche,
        id: customSearchQuery.trim() ? `custom-${Date.now()}` : activeNiche.id,
        name: customSearchQuery.trim() || activeNiche.name,
        trendingTopics: results.trendingTopics,
        trendingCreators: results.trendingCreators,
        viralHashtags: results.viralHashtags,
        suggestedKeywords: results.suggestedKeywords,
        bestPractices: results.bestPractices,
        researchSources: results.researchSources,
        researchGrounded: results.researchGrounded,
      };

      onSelectNiche(updatedNiche);
      setShowAllCreators(false);
    } catch (err) {
      console.error('Error analyzing niche trends:', err);
      setAnalysisError(err instanceof Error ? err.message : 'Research failed. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const copySingleTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 1500);
  };

  const copyAllHashtags = (group: HashtagGroup) => {
    const all = [
      ...group.viral.map(h => h.tag),
      ...group.nicheSpecific.map(h => h.tag),
      ...group.evergreen.map(h => h.tag),
    ].join(' ');
    navigator.clipboard.writeText(all);
    setCopiedBatch(true);
    setTimeout(() => setCopiedBatch(false), 2000);
  };

  const getAllHashtagStrings = () => {
    return [
      ...activeNiche.viralHashtags.viral.map(h => h.tag),
      ...activeNiche.viralHashtags.nicheSpecific.map(h => h.tag),
    ];
  };

  const creatorResults = (activeNiche.trendingCreators || [])
    .filter((creator) => (creator.recentVideos || []).some((video) => isFreshPublishedAt(video.publishedAt)))
    .filter((c) => creatorPlatformFilter === 'All' || c.platform.toLowerCase().includes(creatorPlatformFilter.toLowerCase()))
    .slice()
    .sort((a, b) => {
      if (creatorSort === 'views') return Math.max(0, ...(b.recentVideos || []).map(v => v.views || 0)) - Math.max(0, ...(a.recentVideos || []).map(v => v.views || 0));
      if (creatorSort === 'velocity') return Math.max(0, ...(b.recentVideos || []).map(v => v.viewsPerHour || 0)) - Math.max(0, ...(a.recentVideos || []).map(v => v.viewsPerHour || 0));
      if (creatorSort === 'recent') return Math.max(0, ...(b.recentVideos || []).map(v => Date.parse(v.publishedAt || '') || 0)) - Math.max(0, ...(a.recentVideos || []).map(v => Date.parse(v.publishedAt || '') || 0));
      return (a.rank || 999) - (b.rank || 999);
    });

  return (
    <div className="space-y-6">
      {/* Header & Niche Explorer Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Compass className="w-5 h-5 text-indigo-400" />
              <h1 className="text-lg font-bold text-white tracking-tight">
                AI Niche Trend & Viral Hashtag Radar
              </h1>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-emerald-400 font-mono">14-Day Source-Verified Feed</span>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              Researches niche trends, creators and public videos using sources dated within the last 14 days. Older and undated pages are excluded; public views are labelled by source and private impressions are never guessed.
            </p>
          </div>

          {/* Custom Niche Search Bar */}
          <form onSubmit={handleRunAnalysis} className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={customSearchQuery}
                onChange={(e) => setCustomSearchQuery(e.target.value)}
                placeholder="Search or enter any custom niche..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={isAnalyzing}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold whitespace-nowrap shadow-sm transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
              <span>{isAnalyzing ? 'Scanning...' : 'Scan Radar'}</span>
            </button>
          </form>
        </div>

        {/* Niche dropdown: scroll or search the full list, or type your own */}
        <div>
          <span className="text-[11px] font-semibold text-slate-400 block mb-2 uppercase tracking-wider">
            Choose your niche ({niches.length}+ to pick from, or type your own):
          </span>
          <NicheSelect niches={niches} activeNiche={activeNiche} onSelect={(n) => { setCustomSearchQuery(''); onSelectNiche(n); }} disabled={isAnalyzing} />
        </div>

        {/* Active Niche Demographics & Overview */}
        <div className="bg-slate-950/70 rounded-lg p-3 border border-slate-850 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="text-slate-400">Target Demographics: </span>
            <span className="text-slate-200 font-medium">{activeNiche.audienceDemographics}</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>
              Topics Tracked: <span className="text-indigo-300 font-mono font-medium">{activeNiche.trendingTopics.length}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Sub Tab Navigation */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('topics')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'topics'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Trending Topics & Viral Hooks ({activeNiche.trendingTopics.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('creators')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'creators'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span>Trending Creators ({activeNiche.trendingCreators?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('hashtags')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'hashtags'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Hash className="w-3.5 h-3.5" />
          <span>Hashtags & Keyword Radar</span>
        </button>

        <button
          onClick={() => setActiveTab('competitors')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'competitors'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5 text-rose-400" />
          <span>Competitor Intel & Outranker</span>
        </button>

        <button
          onClick={() => setActiveTab('youtube-growth')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'youtube-growth'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Youtube className="w-3.5 h-3.5 text-red-300" />
          <span>YouTube Growth Studio</span>
        </button>

        <button
          onClick={() => setActiveTab('best-practices')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'best-practices'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Lightbulb className="w-3.5 h-3.5" />
          <span>Media Playbook ({activeNiche.bestPractices.length})</span>
        </button>
      </div>

      {/* Tab 1: Trending Topics & Viral Content Inspiration */}
      {analysisError && <div role="alert" className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{analysisError}</div>}

      {activeTab === 'topics' && activeNiche.trendingTopics.length > 0 && !hasFreshResearch && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold text-amber-200">Saved trend research has expired</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">These older cards are hidden. Refresh the research to see topics supported by sources dated within the last 14 days.</p>
          <button type="button" onClick={() => void handleRunAnalysis()} disabled={isAnalyzing} className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{isAnalyzing ? 'Refreshing…' : 'Refresh current trends'}</button>
        </div>
      )}

      {activeNiche.trendingTopics.length === 0 && activeTab === 'topics' && (
        <div className="bg-slate-900/60 border border-dashed border-slate-700 rounded-xl p-6 text-center space-y-2">
          <p className="text-sm text-slate-300">{isAnalyzing ? 'Researching live trends for this niche...' : 'No research loaded for this niche yet.'}</p>
          {!isAnalyzing && <button onClick={() => handleRunAnalysis()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">Run live research</button>}
        </div>
      )}

      {activeNiche.trendingTopics.length > 0 && activeTab === 'topics' && hasFreshResearch && (
        <section className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-slate-900/75 shadow-xl shadow-black/10">
          <div className="flex flex-col gap-3 border-b border-slate-800 bg-gradient-to-r from-emerald-500/10 via-slate-900 to-cyan-500/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10">
                <Search className="h-5 w-5 text-emerald-300" />
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-white sm:text-base">Live Web Research</h2>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">Live sources</span>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">Real pages and public videos dated within the last 14 days · {recentResearchSources.length} verified sources</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Evidence-linked results
            </div>
          </div>
          {recentResearchSources.length ? (
            <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-3">
              {recentResearchSources.slice(0, 15).map((x) => {
                const preview = x.imageUrl || youtubeThumbnail(x.url);
                const isVideo = x.sourceType === 'video' || !!youtubeThumbnail(x.url);
                const SourceIcon = isVideo ? Youtube : x.sourceType === 'news' ? Newspaper : Globe2;
                const publisher = x.platform || x.domain || (() => { try { return new URL(x.url).hostname.replace(/^www\./i, ''); } catch { return 'Web source'; } })();
                return (
                  <a key={x.url} href={x.url} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80 transition-all hover:-translate-y-0.5 hover:border-emerald-400/40 hover:shadow-lg hover:shadow-emerald-950/20">
                    <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-emerald-950/70">
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 shadow-lg">
                          <SourceIcon className={`h-6 w-6 ${isVideo ? 'text-red-400' : 'text-emerald-300'}`} />
                        </div>
                        <span className="max-w-[80%] truncate text-[10px] font-semibold text-slate-300">{publisher}</span>
                      </div>
                      {preview && <img src={preview} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/90 to-transparent px-3 pb-2 pt-7">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur-sm">
                          <SourceIcon className={`h-3 w-3 ${isVideo ? 'text-red-300' : 'text-emerald-300'}`} /> {publisher}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 text-white/80" />
                      </div>
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="flex items-center gap-2">
                        {x.faviconUrl && <img src={x.faviconUrl} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="h-4 w-4 rounded-sm" />}
                        <span className="min-w-0 truncate text-[10px] font-medium uppercase tracking-wide text-emerald-300/90">{x.domain || publisher}</span>
                        {x.publishedAt && <span className="ml-auto shrink-0 text-[9px] text-slate-500">{x.publishedAt.slice(0, 10)}</span>}
                      </div>
                      <h3 className="line-clamp-2 min-h-[2.5rem] text-xs font-bold leading-5 text-slate-100 group-hover:text-emerald-200">{x.title}</h3>
                      {x.snippet && <p className="line-clamp-2 text-[10px] leading-4 text-slate-400">{x.snippet}</p>}
                      <span className="inline-flex items-center gap-1 pt-0.5 text-[10px] font-semibold text-indigo-300 group-hover:text-indigo-200">{isVideo ? 'Watch video' : 'Read source'} <ArrowUpRight className="h-3 w-3" /></span>
                    </div>
                  </a>
                );
              })}
            </div>
          ) : (
            <p className="p-5 text-xs text-slate-400">Research completed, but no individual source cards were returned.</p>
          )}
          {(activeNiche.researchSources || []).length > 15 && <p className="border-t border-slate-800 px-4 py-3 text-center text-[10px] text-slate-500">Showing 15 of {activeNiche.researchSources?.length} live sources</p>}
        </section>
      )}

      {/* Tab: Trending creators and evidence-backed video inspiration */}
      {activeTab === 'creators' && hasFreshResearch && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-slate-300">
            <p className="font-semibold text-indigo-200">Creator discovery · ranked by available public evidence</p>
            <p className="mt-1 text-slate-400">YouTube view counts are public views, not impressions. Where official YouTube data is connected, you can also sort by calculated views/hour. TikTok and Instagram metrics appear only when a source makes them public. Use the examples to study structure and adapt the approach in your own voice.</p>
          </div>
          {(activeNiche.trendingCreators?.length || 0) === 0 ? (
            <div className="bg-slate-900/60 border border-dashed border-slate-700 rounded-xl p-6 text-center text-sm text-slate-300">
              {isAnalyzing ? 'Finding creators and their recent high-performing videos...' : 'Run live research to discover creators in this niche.'}
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-400">Showing {Math.min(showAllCreators ? 50 : 10, creatorResults.length)} of {creatorResults.length} matching creators</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label="Filter creators by platform" value={creatorPlatformFilter} onChange={(e) => { setCreatorPlatformFilter(e.target.value); setShowAllCreators(false); }} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200">
                    <option value="All">All platforms</option><option value="YouTube">YouTube</option><option value="TikTok">TikTok</option><option value="Instagram">Instagram</option><option value="Facebook">Facebook</option><option value="X">X</option><option value="LinkedIn">LinkedIn</option>
                  </select>
                  <select aria-label="Sort creators" value={creatorSort} onChange={(e) => setCreatorSort(e.target.value as 'rank' | 'views' | 'velocity' | 'recent')} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200">
                    <option value="rank">Sort: evidence rank</option><option value="views">Sort: public views</option><option value="velocity">Sort: views per hour</option><option value="recent">Sort: newest content</option>
                  </select>
                </div>
                {creatorResults.length > 10 && (
                  <button onClick={() => setShowAllCreators(v => !v)} className="text-xs font-semibold text-indigo-300 hover:text-white">
                    {showAllCreators ? 'Show top 10' : 'Show all up to 50'}
                  </button>
                )}
              </div>
              {creatorResults.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-center text-xs text-slate-400">No creators were found for this platform filter. Try another platform or return to All platforms.</div>
              ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {creatorResults.slice(0, showAllCreators ? 50 : 10).map((c, i) => (
                  <article key={c.url || c.handle || c.name + i} className="bg-slate-900/75 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-3 hover:border-indigo-500/40 transition-colors">
                    <div className="flex items-start gap-3">
                      {c.avatarUrl ? <img src={c.avatarUrl} alt="" loading="lazy" className="w-12 h-12 rounded-full object-cover border border-slate-700 bg-slate-950" /> : (
                        <div className="w-12 h-12 rounded-full bg-indigo-950 border border-indigo-800 flex items-center justify-center text-sm font-bold text-indigo-200">{(c.name || '?').slice(0,1).toUpperCase()}</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="text-[10px] font-mono rounded bg-slate-800 px-2 py-0.5 text-amber-200">#{c.rank || i + 1}</span>
                          <h3 className="text-sm font-bold text-white">{c.name}</h3>
                        </div>
                        <p className="text-xs text-indigo-300 font-mono truncate mt-0.5">{c.handle} · {c.platform}</p>
                        {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-indigo-300 hover:text-white mt-1"><ExternalLink className="w-3 h-3" /> Open creator profile</a>}
                      </div>
                    </div>
                    {c.rankingBasis && <p className="text-[11px] text-emerald-200 bg-emerald-500/5 border border-emerald-500/15 rounded-lg p-2">{c.rankingBasis}</p>}
                    <p className="text-xs text-amber-200/90"><span className="font-semibold">Why featured:</span> {c.whyTrending}</p>
                    <div className="rounded-lg bg-slate-950/60 border border-slate-800 p-3 space-y-1">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Content pattern to study</p>
                      <p className="text-xs text-slate-300">{c.contentStyle}</p>
                      <p className="text-xs text-slate-300 pt-1"><span className="text-slate-500 font-semibold">Adapt this idea:</span> {c.takeaway}</p>
                      {c.exampleHook && <p className="text-xs text-indigo-100 italic pt-1">“{c.exampleHook}”</p>}
                    </div>
                    {!!c.recentVideos?.length && (
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Recent video examples</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {c.recentVideos.slice(0, 3).map((v, vi) => (
                            <a key={v.url + vi} href={v.url} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-lg border border-slate-800 bg-slate-950 hover:border-indigo-500/60">
                              {(v.thumbnailUrl || youtubeThumbnail(v.url)) ? <img src={v.thumbnailUrl || youtubeThumbnail(v.url)} alt={v.title} loading="lazy" className="w-full aspect-video object-cover bg-black" /> : <div className="w-full aspect-video flex items-center justify-center bg-slate-900 text-slate-500"><Video className="w-7 h-7" /></div>}
                              <div className="p-2">
                                <p className="text-[11px] text-slate-200 font-semibold leading-snug line-clamp-2 group-hover:text-indigo-200">{v.title}</p>
                                <div className="flex flex-wrap items-center justify-between gap-1 mt-1 text-[10px] text-slate-500">
                                  <span>{v.publishedAt || v.platform}</span>
                                  <span>{v.views != null ? v.views.toLocaleString() + ' ' + (v.metricLabel || 'public views') : (v.metricLabel || 'Metric unavailable')}{v.viewsPerHour != null ? ' · ' + v.viewsPerHour.toLocaleString() + '/hr' : ''}</span>
                                </div>
                                <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-indigo-300">Watch video <ExternalLink className="w-3 h-3" /></span>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => onSendOutrankToVideoStudio(c.exampleHook || c.takeaway)} className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"><Video className="w-3.5 h-3.5" /> Create an original video</button>
                      <button onClick={() => navigator.clipboard.writeText(c.exampleHook || c.takeaway)} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium" aria-label="Copy creator inspiration"><Copy className="w-3.5 h-3.5" /></button>
                    </div>
                  </article>
                ))}
              </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'topics' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeNiche.trendingTopics.map(topic => (
              <div
                key={topic.id}
                className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between hover:border-slate-700 transition-all shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[11px] font-semibold">
                      {topic.velocity}
                    </span>
                    <span className="text-[10px] uppercase font-mono text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40">
                      {topic.recommendedFormat}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white mb-2 leading-snug">
                    {topic.title}
                  </h3>

                  {topic.whyNow && <p className="text-xs text-amber-200/90 mb-2"><span className="font-semibold">Why now:</span> {topic.whyNow}</p>}

                  <p className="text-xs text-slate-400 mb-3 bg-slate-950/50 p-2 rounded-lg border border-slate-850">
                    <span className="text-slate-500 font-semibold block mb-0.5">Content Angle:</span>
                    {topic.contentAngle}
                  </p>

                  <div className="space-y-1.5 mb-4">
                    <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider block">
                      3-Second Viral Opening Hooks:
                    </span>
                    {topic.viralHooks.map((hook, hIdx) => (
                      <div
                        key={hIdx}
                        className="text-xs text-slate-300 italic bg-slate-950/80 p-2 rounded border border-slate-850 leading-relaxed"
                      >
                        "{hook}"
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Reach Multiplier:</span>
                    <span className="text-emerald-400 font-mono font-bold">
                      {topic.estimatedReachMultiplier} Potential
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <button
                      onClick={() => onCreateVideoFromTopic(topic)}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Make Video</span>
                    </button>

                    <button
                      onClick={() => onCreatePostFromTopic(topic, getAllHashtagStrings())}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Post Now</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Categorized Hashtags & Keyword Radar */}
      {activeTab === 'hashtags' && !hasFreshResearch && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold text-amber-200">Hashtag radar needs fresh evidence</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">Older saved velocity and volume estimates are hidden until they can be rebuilt from sources dated within the last 14 days.</p>
          <button type="button" onClick={() => void handleRunAnalysis()} disabled={isAnalyzing} className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{isAnalyzing ? 'Refreshing…' : 'Refresh current trend data'}</button>
        </div>
      )}

      {activeTab === 'hashtags' && hasFreshResearch && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div>
              <h2 className="text-sm font-bold text-white">
                Categorized Hashtag Radar & Spoken SEO Keywords
              </h2>
              <p className="text-xs text-slate-400">
                Sorted by algorithmic velocity and search volume to maximize reach without trigger shadowbans.
              </p>
            </div>

            <button
              onClick={() => copyAllHashtags(activeNiche.viralHashtags)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
            >
              {copiedBatch ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              <span>{copiedBatch ? 'Copied All to Clipboard!' : 'Copy Complete Hashtag Stack'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-rose-400" />
                  <span className="text-xs font-bold text-white">Viral Velocity Tags</span>
                </div>
                <span className="text-[10px] text-rose-400 font-mono">High Reach</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Top trending tags with explosive discovery volume across recommendation feeds.
              </p>

              <div className="space-y-2">
                {activeNiche.viralHashtags.viral.map(item => (
                  <div
                    key={item.tag}
                    onClick={() => copySingleTag(item.tag)}
                    className="cursor-pointer group flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-slate-850 hover:border-indigo-500 transition-all"
                  >
                    <div>
                      <span className="text-xs font-semibold text-slate-100 group-hover:text-indigo-300">
                        {item.tag}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {item.volume} · {item.competition} Comp
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        {item.velocityScore}/100
                      </span>
                      {copiedTag === item.tag ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-bold text-white">Niche-Specific Tags</span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono">Low Comp · Easy Rank</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Targeted tags with lower saturation, allowing you to dominate the top 9 posts quickly.
              </p>

              <div className="space-y-2">
                {activeNiche.viralHashtags.nicheSpecific.map(item => (
                  <div
                    key={item.tag}
                    onClick={() => copySingleTag(item.tag)}
                    className="cursor-pointer group flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-slate-850 hover:border-indigo-500 transition-all"
                  >
                    <div>
                      <span className="text-xs font-semibold text-slate-100 group-hover:text-indigo-300">
                        {item.tag}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {item.volume} · {item.competition} Comp
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-bold text-indigo-300">
                        {item.velocityScore}/100
                      </span>
                      {copiedTag === item.tag ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white">Evergreen Authority</span>
                </div>
                <span className="text-[10px] text-cyan-400 font-mono">Consistent Reach</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Reliable industry anchors that establish channel category indexing with platform bots.
              </p>

              <div className="space-y-2">
                {activeNiche.viralHashtags.evergreen.map(item => (
                  <div
                    key={item.tag}
                    onClick={() => copySingleTag(item.tag)}
                    className="cursor-pointer group flex items-center justify-between p-2.5 rounded-lg bg-slate-950/80 border border-slate-850 hover:border-indigo-500 transition-all"
                  >
                    <div>
                      <span className="text-xs font-semibold text-slate-100 group-hover:text-indigo-300">
                        {item.tag}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        {item.volume} · {item.competition} Comp
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-bold text-slate-400">
                        {item.velocityScore}/100
                      </span>
                      {copiedTag === item.tag ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
              Algorithmic Spoken SEO Keywords (Voice & Transcription Indexing)
            </h3>
            <p className="text-[11px] text-slate-400 mb-3">
              TikTok and YouTube Shorts transcribe video speech. Pronouncing these keywords in your first 10 seconds boosts indexing in search results.
            </p>

            <div className="flex flex-wrap gap-2">
              {activeNiche.suggestedKeywords.map((kw, idx) => (
                <div
                  key={idx}
                  onClick={() => copySingleTag(kw)}
                  className="cursor-pointer px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-850 hover:border-indigo-500 text-xs font-mono text-slate-300 hover:text-white transition-all flex items-center gap-1.5"
                >
                  <Search className="w-3 h-3 text-indigo-400" />
                  <span>{kw}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Competitor Tracker & Outranker Sub-Section */}
      {activeTab === 'competitors' && (
        <CompetitorIntel
          nicheName={activeNiche.name}
          onSendOutrankToScheduler={onSendOutrankToScheduler}
          onSendOutrankToVideoStudio={onSendOutrankToVideoStudio}
        />
      )}

      {activeTab === 'youtube-growth' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-500/5 via-slate-900/90 to-indigo-500/5 p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-400/20 bg-red-400/10"><Youtube className="h-5 w-5 text-red-300" /></div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white">YouTube Growth Studio</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Build a publish-ready SEO and creative package: title variations, opening hooks, description, tags, thumbnail angles and Shorts ideas. Recommendations are generated from your brief; this tool does not pretend to know private channel analytics or keyword search volumes.</p>
              </div>
            </div>
            <form onSubmit={buildYouTubeGrowthKit} className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-300">Primary topic / keyword</span><input value={seoKeyword} onChange={(event) => setSeoKeyword(event.target.value)} maxLength={160} placeholder="e.g. AI video editing for small businesses" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" /></label>
              <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-300">Current video title (optional)</span><input value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} maxLength={180} placeholder="Paste your working title" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" /></label>
              <label className="block space-y-1 lg:col-span-2"><span className="text-[11px] font-semibold text-slate-300">What happens in the video?</span><textarea value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)} maxLength={4000} rows={4} placeholder="Describe the video, intended audience, key points and the result viewers should get..." className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white placeholder:text-slate-600" /></label>
              <label className="block space-y-1"><span className="text-[11px] font-semibold text-slate-300">Main growth goal</span><select value={seoGoal} onChange={(event) => setSeoGoal(event.target.value as typeof seoGoal)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white"><option value="discoverability">Search discovery</option><option value="clicks">More qualified clicks</option><option value="subscribers">Subscriber growth</option><option value="shorts">Shorts reach</option></select></label>
              <div className="flex items-end"><button type="submit" disabled={growthKitBusy || (!seoKeyword.trim() && !seoTitle.trim() && seoDescription.trim().length < 30)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-950/20 transition-colors hover:bg-red-500 disabled:opacity-40">{growthKitBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{growthKitBusy ? 'Building growth package…' : 'Build YouTube package'}</button></div>
            </form>
            {growthKitError && <p role="alert" className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{growthKitError}</p>}
          </section>

          {growthKit && (
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Title variations</h3><button type="button" onClick={() => copyGrowthText(growthKit.titleOptions.join('\n'))} className="text-[10px] font-semibold text-indigo-300 hover:text-indigo-200">Copy all</button></div>
                {growthKit.titleOptions.map((item, index) => <div key={index} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/80 p-3"><span className="text-[10px] font-mono text-slate-500">{String(index + 1).padStart(2, '0')}</span><p className="min-w-0 flex-1 text-xs font-semibold text-white">{item}</p><button type="button" onClick={() => copyGrowthText(item)} aria-label="Copy title" className="text-slate-500 hover:text-indigo-300"><Copy className="h-3.5 w-3.5" /></button></div>)}
              </section>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <div className="flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Opening hooks</h3><button type="button" onClick={() => copyGrowthText(growthKit.openingHooks.join('\n'))} className="text-[10px] text-indigo-300">Copy all</button></div>
                  {growthKit.openingHooks.map((item,index) => <p key={index} className="border-b border-slate-800 pb-2 text-xs leading-5 text-slate-300">“{item}”</p>)}
                </section>
                <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                  <div className="flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Tags & hashtags</h3><button type="button" onClick={() => copyGrowthText([...growthKit.tags, ...growthKit.hashtags].join(', '))} className="text-[10px] text-indigo-300">Copy pack</button></div>
                  <div className="flex flex-wrap gap-1.5">{growthKit.tags.map((item,index) => <button type="button" key={index} onClick={() => copyGrowthText(item)} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-300">{item}</button>)}</div>
                  <div className="flex flex-wrap gap-1.5 border-t border-slate-800 pt-3">{growthKit.hashtags.map((item,index) => <button type="button" key={index} onClick={() => copyGrowthText(item)} className="rounded-md border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-200">{item}</button>)}</div>
                </section>
              </div>
              <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
                <div className="flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Optimized description</h3><button type="button" onClick={() => copyGrowthText(growthKit.description)} className="text-[10px] text-indigo-300">Copy description</button></div>
                <p className="whitespace-pre-wrap text-xs leading-6 text-slate-300">{growthKit.description}</p>
              </section>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {[
                  { title: 'Shorts ideas', items: growthKit.shortsIdeas },
                  { title: 'Thumbnail concepts', items: growthKit.thumbnailConcepts },
                  { title: 'Pre-publish checklist', items: growthKit.optimizationChecklist },
                ].map(({ title, items }) => (
                  <section key={title} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">{title}</h3>
                    {items.map((item,index) => <div key={index} className="flex items-start gap-2 border-b border-slate-800/70 pb-2 text-xs leading-5 text-slate-300"><span className="mt-0.5 text-indigo-300">•</span><span className="flex-1">{item}</span><button type="button" onClick={() => copyGrowthText(item)} className="shrink-0 text-slate-500 hover:text-indigo-300" aria-label="Copy item"><Copy className="h-3 w-3" /></button></div>)}
                  </section>
                ))}
                <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 lg:col-span-2"><p className="text-[10px] leading-5 text-amber-100/80">Growth note: these are creative and optimization recommendations, not verified search-volume, ranking or performance measurements. Compare actual results in your connected channel analytics after publishing.</p></section>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'best-practices' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <h2 className="text-sm font-bold text-white mb-1">
              Social Media Growth & Sales Conversion Playbook
            </h2>
            <p className="text-xs text-slate-400">
              AI-generated recommendations based on general platform best practices. Results vary by account, audience and timing.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {activeNiche.bestPractices.map((bp, idx) => (
              <div
                key={idx}
                className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-indigo-950/70 text-indigo-300 border border-indigo-800/40">
                      {bp.category}
                    </span>
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  </div>

                  <h3 className="text-sm font-bold text-white mb-2">
                    {bp.title}
                  </h3>

                  <p className="text-xs text-slate-300 leading-relaxed mb-3">
                    {bp.insight}
                  </p>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-850">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">
                    Actionable Implementation:
                  </span>
                  <p className="text-xs text-slate-200">
                    {bp.actionableStep}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
