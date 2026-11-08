import React, { useEffect, useState } from 'react';
import { SocialAccount, ScheduledPost, GeneratedVideo, ABTestExperiment } from '../types';
import { Share2, Video, CalendarClock, Send, Check, Circle, ArrowRight, Loader2, Bot, Clapperboard, Sparkles, TrendingUp, WandSparkles } from 'lucide-react';
import { ProjectSummary, Series, isActive } from '../services/seriesService';

type Tab = 'dashboard' | 'video-studio' | 'series' | 'trends-hashtags' | 'scheduler' | 'ab-testing' | 'analytics';

interface Props {
  accounts: SocialAccount[];
  posts: ScheduledPost[];
  videos: GeneratedVideo[];
  experiments: ABTestExperiment[];
  hasResearch: boolean;
  onNavigate: (tab: Tab) => void;
  /** Opens the Series tab on one project, ready to write its next part. */
  onContinueSeries: (projectId: string) => void;
  onSelectVideoForStudio: (id: string) => void;
  onInstantPublishPost: (post: ScheduledPost) => void;
  onConnect: () => void;
  onOpenAutoPilot: () => void;
  isPublishingPostId: string | null;
  usage: { videosUsed: number; videosLimit: number; secondsUsed: number; secondsLimit: number; topupSeconds?: number } | null;
}

/** Lists the latest series so the next part can be started from the dashboard instead of a blank page. */
const SeriesShortcut: React.FC<{ onOpen: (id: string) => void; onAll: () => void }> = ({ onOpen, onAll }) => {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  useEffect(() => { let off = false; Series.list().then((p) => { if (!off) setProjects(p); }).catch(() => { if (!off) setProjects([]); }); return () => { off = true; }; }, []);
  if (projects === null) return null;
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2"><Clapperboard className="w-4 h-4 text-indigo-400" />Your series</h2>
        <button onClick={onAll} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">{projects.length ? 'All series' : 'Start a series'}<ArrowRight className="w-3 h-3" /></button>
      </div>
      {projects.length === 0 && <p className="text-xs text-slate-400">Make a story in parts. Each new part remembers the last one.</p>}
      <ul className="space-y-2">
        {projects.slice(0, 3).map((p) => {
          const active = p.episodes.find((e) => isActive(e.status));
          const parts = p.episodes.filter((e) => e.status === 'COMPLETED').length;
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0 text-slate-200 truncate">{p.title} <span className="text-slate-500">· {parts} {parts === 1 ? 'part' : 'parts'}</span></span>
              <button onClick={() => onOpen(p.id)} className="shrink-0 text-indigo-400 hover:text-indigo-300 flex items-center gap-1">{active ? `Part ${active.partNumber} in progress` : 'Generate Next Part / Continue Script'}<ArrowRight className="w-3 h-3" /></button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const Stat = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number | string }) => (
  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
    <div className="flex items-center gap-2 text-slate-400 text-xs"><Icon className="w-4 h-4 text-indigo-400" />{label}</div>
    <p className="text-2xl font-bold text-white mt-1 tabular-nums">{value}</p>
  </div>
);

export const DashboardOverview: React.FC<Props> = ({ accounts, posts, videos, experiments, hasResearch, onNavigate, onContinueSeries, onSelectVideoForStudio, onInstantPublishPost, onConnect, onOpenAutoPilot, isPublishingPostId, usage }) => {
  const connected = accounts.filter((a) => a.connected).length;
  const scheduled = posts.filter((p) => p.status === 'scheduled');
  const published = posts.filter((p) => p.status === 'published');
  const upcoming = [...scheduled, ...posts.filter((p) => p.status === 'draft')].sort((a, b) => +new Date(a.scheduledTime) - +new Date(b.scheduledTime)).slice(0, 5);

  const steps = [
    { done: connected > 0, label: 'Connect your social accounts', action: onConnect, cta: 'Connect' },
    { done: videos.length > 0, label: 'Generate your first AI video', action: () => onNavigate('video-studio'), cta: 'Open studio' },
    { done: hasResearch, label: 'Research trends and hashtags for your niche', action: () => onNavigate('trends-hashtags'), cta: 'Open radar' },
    { done: posts.length > 0, label: 'Schedule your first post', action: () => onNavigate('scheduler'), cta: 'Open scheduler' },
    { done: experiments.length > 0, label: 'Run an A/B hook test', action: () => onNavigate('ab-testing'), cta: 'Start a test' },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <div className="space-y-6">
      <section className="relative isolate overflow-hidden rounded-3xl border border-indigo-400/20 bg-linear-to-br from-slate-900 via-slate-900 to-indigo-950/80 p-5 sm:p-7 shadow-2xl shadow-black/20">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-indigo-400/10 blur-3xl" />
        <div className="pointer-events-none absolute right-1/3 -bottom-28 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-200"><Sparkles className="h-3.5 w-3.5" /> Creator command centre</div>
            <h1 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight text-white">Your entire creator workflow, in one canvas.</h1>
            <p className="mt-3 max-w-xl text-sm sm:text-base leading-relaxed text-slate-300">Move from a creative brief to directed scenes, a polished edit and a publishing plan. Keep your ideas, media, video tools and growth workflow connected in one workspace.</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button onClick={() => onNavigate('trends-hashtags')} className="inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-950/60 px-4 py-3 text-xs font-semibold text-slate-100 hover:border-indigo-300/50 hover:bg-slate-900"><TrendingUp className="h-4 w-4 text-indigo-300" />Research trends</button>
            <button onClick={() => onNavigate('video-studio')} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-950/40 hover:bg-indigo-400"><WandSparkles className="h-4 w-4" />Create a video</button>
          </div>
        </div>
        <div className="relative mt-7 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/5 bg-black/15 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Discover</p><p className="mt-1 text-xs font-semibold text-slate-200">Creators, trends & outliers</p></div>
          <div className="rounded-xl border border-white/5 bg-black/15 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Produce</p><p className="mt-1 text-xs font-semibold text-slate-200">Stories, shorts & brand ads</p></div>
          <div className="rounded-xl border border-white/5 bg-black/15 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-500">Grow</p><p className="mt-1 text-xs font-semibold text-slate-200">Schedule, test & improve</p></div>
        </div>
        <div className="relative mt-3 overflow-hidden rounded-2xl border border-indigo-300/15 bg-slate-950/70 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.7)]" /><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">OmniPulse creator canvas</span></div>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[9px] font-semibold text-slate-400">Brief → Storyboard → Edit → Publish</span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[0.8fr_1.6fr_0.8fr]">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex items-center gap-2 text-[10px] font-semibold text-indigo-200"><Sparkles className="h-3.5 w-3.5" />Creative brief</div>
              <p className="mt-2 text-xs font-semibold text-white">Build a story worth watching.</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">Set your subject, audience, format, tone and visual direction.</p>
              <button type="button" onClick={() => onNavigate('series')} className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-300 hover:text-white">Open story studio <ArrowRight className="h-3 w-3" /></button>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-[10px] font-semibold text-slate-200"><Clapperboard className="h-3.5 w-3.5 text-fuchsia-300" />Storyboard & shot plan</div><span className="text-[9px] text-slate-500">Scene-based workflow</span></div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { name: 'Opening hook', time: '00:00–00:05', shade: 'from-indigo-500/35 to-slate-900', tag: '01' },
                  { name: 'Main reveal', time: '00:05–00:10', shade: 'from-fuchsia-500/30 to-slate-900', tag: '02' },
                  { name: 'Final moment', time: '00:10–00:15', shade: 'from-emerald-500/30 to-slate-900', tag: '03' },
                ].map((scene) => <div key={scene.tag} className={`relative min-w-0 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br ${scene.shade} p-2.5`}>
                  <span className="text-[9px] font-mono text-white/60">{scene.tag}</span><p className="mt-5 text-[10px] font-semibold text-white">{scene.name}</p><p className="mt-1 text-[9px] tabular-nums text-slate-400">{scene.time}</p>
                </div>)}
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center gap-2"><span className="w-12 text-[9px] text-slate-500">Video</span><div className="flex flex-1 gap-1"><span className="h-2 flex-1 rounded-sm bg-indigo-400/70" /><span className="h-2 flex-1 rounded-sm bg-fuchsia-400/70" /><span className="h-2 flex-1 rounded-sm bg-emerald-400/70" /></div></div>
                <div className="flex items-center gap-2"><span className="w-12 text-[9px] text-slate-500">Text</span><div className="flex flex-1 gap-1"><span className="h-2 w-1/3 rounded-sm bg-slate-500/70" /><span className="h-2 w-1/4 rounded-sm bg-slate-500/40" /></div></div>
                <div className="flex items-center gap-2"><span className="w-12 text-[9px] text-slate-500">Audio</span><div className="h-2 flex-1 rounded-sm bg-gradient-to-r from-cyan-400/70 via-indigo-400/40 to-cyan-400/70" /></div>
              </div>
            </div>
            <div className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <div><div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-200"><TrendingUp className="h-3.5 w-3.5" />Publishing & growth</div><p className="mt-2 text-xs font-semibold text-white">Make the edit work harder.</p><p className="mt-1 text-[10px] leading-4 text-slate-500">Prepare titles, captions, hashtags, schedules and performance experiments.</p></div>
              <button type="button" onClick={() => onNavigate('trends-hashtags')} className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-300 hover:text-white">Open growth studio <ArrowRight className="h-3 w-3" /></button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
            <p className="text-[9px] text-slate-500">An example of the connected production workflow—not a live project preview.</p>
            <button type="button" onClick={() => onNavigate('creator-studio')} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-[10px] font-semibold text-indigo-200 hover:bg-indigo-500/20">Open timeline editor <ArrowRight className="h-3 w-3" /></button>
          </div>
        </div>
      </section>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Share2} label="Channels connected" value={`${connected} / ${accounts.length}`} />
        <Stat icon={Video} label="Videos generated" value={videos.length} />
        <Stat icon={CalendarClock} label="Posts scheduled" value={scheduled.length} />
        <Stat icon={Send} label="Posts published" value={published.length} />
      </div>

      {usage && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-slate-300 font-semibold">Video seconds used this month</span>
            <span className="text-slate-400 tabular-nums">{usage.secondsLimit >= 1_000_000 ? `${usage.secondsUsed} seconds (unlimited)` : `${usage.secondsUsed} / ${usage.secondsLimit} seconds`}{usage.topupSeconds ? ` (+${usage.topupSeconds} bonus)` : ''}</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full ${usage.secondsUsed / Math.max(1, usage.secondsLimit) > 0.85 ? 'bg-amber-400' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, (usage.secondsUsed / Math.max(1, usage.secondsLimit)) * 100)}%` }} /></div>
        </div>
      )}

      <SeriesShortcut onOpen={onContinueSeries} onAll={() => onNavigate('series')} />

      {remaining > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <h2 className="text-sm font-bold text-white mb-3">Getting started <span className="text-slate-500 font-normal">· {steps.length - remaining} of {steps.length} done</span></h2>
          <ul className="space-y-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3 text-xs">
                <span className={`flex items-center gap-2 ${s.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                  {s.done ? <Check className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4 text-slate-600" />}{s.label}
                </span>
                {!s.done && <button onClick={s.action} className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 shrink-0">{s.cta}<ArrowRight className="w-3 h-3" /></button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Up next</h2>
            <button onClick={() => onNavigate('scheduler')} className="text-xs text-indigo-400 hover:text-indigo-300">Open scheduler</button>
          </div>
          {upcoming.length === 0 ? <p className="text-xs text-slate-500 py-6 text-center">Nothing scheduled yet.</p> : (
            <ul className="divide-y divide-slate-800">
              {upcoming.map((p) => (
                <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-100 truncate">{p.title}</p>
                    <p className="text-[11px] text-slate-500">{p.platforms.join(', ')} · {new Date(p.scheduledTime).toLocaleString()} · <span className={p.status === 'draft' ? 'text-amber-400' : 'text-emerald-400'}>{p.status}</span></p>
                  </div>
                  <button disabled={isPublishingPostId === p.id} onClick={() => onInstantPublishPost(p)} className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 flex items-center gap-1">
                    {isPublishingPostId === p.id && <Loader2 className="w-3 h-3 animate-spin" />}Publish now
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white">Recent videos</h2>
            <button onClick={onOpenAutoPilot} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Bot className="w-3.5 h-3.5" />Auto-Pilot batch</button>
          </div>
          {videos.length === 0 ? <p className="text-xs text-slate-500 py-6 text-center">No videos yet.</p> : (
            <ul className="divide-y divide-slate-800">
              {videos.slice(0, 5).map((v) => (
                <li key={v.id}>
                  <button onClick={() => onSelectVideoForStudio(v.id)} className="w-full text-left py-2.5 flex items-center justify-between gap-3 hover:bg-slate-800/40 rounded px-1">
                    <span className="min-w-0"><span className="block text-xs font-semibold text-slate-100 truncate">{v.title}</span><span className="text-[11px] text-slate-500">{v.aspectRatio} · {v.estimatedDuration}s · {new Date(v.createdAt).toLocaleDateString()}</span></span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
