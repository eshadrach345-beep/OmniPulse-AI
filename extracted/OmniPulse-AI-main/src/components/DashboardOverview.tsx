import React, { useEffect, useState } from 'react';
import { SocialAccount, ScheduledPost, GeneratedVideo, ABTestExperiment } from '../types';
import { Share2, Video, CalendarClock, Send, Check, Circle, ArrowRight, Loader2, Bot, Clapperboard } from 'lucide-react';
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
