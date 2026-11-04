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
  Eye
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'topics' | 'creators' | 'hashtags' | 'competitors' | 'best-practices'>('topics');
  const [showAllCreators, setShowAllCreators] = useState(false);

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
              <span className="text-xs text-emerald-400 font-mono">Live Algorithmic Feed</span>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              Researches live niche trends, creators and recent high-performing public videos across YouTube, TikTok, Instagram and the wider web. Metrics are labelled by source; private impressions are never guessed.
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

      {activeNiche.trendingTopics.length === 0 && activeTab !== 'competitors' && (
        <div className="bg-slate-900/60 border border-dashed border-slate-700 rounded-xl p-6 text-center space-y-2">
          <p className="text-sm text-slate-300">{isAnalyzing ? 'Researching live trends for this niche...' : 'No research loaded for this niche yet.'}</p>
          {!isAnalyzing && <button onClick={() => handleRunAnalysis()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">Run live research</button>}
        </div>
      )}

      {activeNiche.trendingTopics.length > 0 && activeTab !== 'competitors' && activeNiche.researchGrounded && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-slate-300 p-3 text-[11px] space-y-1.5">
          <p className="font-semibold text-emerald-300">Live web research · {activeNiche.researchSources?.length || 0} sources</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {(activeNiche.researchSources || []).map((x) => (
              <li key={x.url}><a href={x.url} target="_blank" rel="noopener noreferrer" className="text-indigo-300 hover:underline">{x.title.length > 48 ? `${x.title.slice(0, 48)}…` : x.title}</a></li>
            ))}
          </ul>
        </div>
      )}

      {/* Tab: Trending creators and evidence-backed video inspiration */}
      {activeTab === 'creators' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-slate-300">
            <p className="font-semibold text-indigo-200">Creator discovery · ranked by available public evidence</p>
            <p className="mt-1 text-slate-400">YouTube view counts are public views, not impressions. TikTok and Instagram metrics appear only when a source makes them public. Use the examples to study structure and adapt the approach in your own voice.</p>
          </div>
          {(activeNiche.trendingCreators?.length || 0) === 0 ? (
            <div className="bg-slate-900/60 border border-dashed border-slate-700 rounded-xl p-6 text-center text-sm text-slate-300">
              {isAnalyzing ? 'Finding creators and their recent high-performing videos...' : 'Run live research to discover creators in this niche.'}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">Showing {Math.min(showAllCreators ? 50 : 10, activeNiche.trendingCreators!.length)} of {activeNiche.trendingCreators!.length} researched creators</p>
                {activeNiche.trendingCreators!.length > 10 && (
                  <button onClick={() => setShowAllCreators(v => !v)} className="text-xs font-semibold text-indigo-300 hover:text-white">
                    {showAllCreators ? 'Show top 10' : 'Show all up to 50'}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {activeNiche.trendingCreators!.slice(0, showAllCreators ? 50 : 10).map((c, i) => (
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
                              {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt={v.title} loading="lazy" className="w-full aspect-video object-cover bg-black" /> : <div className="w-full aspect-video flex items-center justify-center bg-slate-900 text-slate-500"><Video className="w-7 h-7" /></div>}
                              <div className="p-2">
                                <p className="text-[11px] text-slate-200 font-semibold leading-snug line-clamp-2 group-hover:text-indigo-200">{v.title}</p>
                                <div className="flex flex-wrap items-center justify-between gap-1 mt-1 text-[10px] text-slate-500">
                                  <span>{v.publishedAt || v.platform}</span>
                                  <span>{v.views != null ? v.views.toLocaleString() + ' ' + (v.metricLabel || 'public views') : (v.metricLabel || 'Metric unavailable')}</span>
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
      {activeTab === 'hashtags' && (
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
