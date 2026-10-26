import React, { useState } from 'react';
import { ABTestExperiment, ABVariant, GeneratedVideo, NicheCategory, PlatformId, SocialAccount } from '../types';
import { api, ApiError } from '../services/api';
import { evaluateAB } from '../services/abStats';
import { Split, Sparkles, Loader2, Trophy, RefreshCw, Rocket, AlertTriangle } from 'lucide-react';

interface Props {
  experiments: ABTestExperiment[];
  accounts: SocialAccount[];
  videos: GeneratedVideo[];
  activeNiche: NicheCategory;
  onSaveExperiment: (e: ABTestExperiment) => void;
  onUpdateExperiment: (e: ABTestExperiment) => void;
  onLaunch: (e: ABTestExperiment, hoursApart: number) => Promise<ABTestExperiment | null>;
  onDeployWinnerToSchedule: (e: ABTestExperiment, winner: 'A' | 'B') => void;
}

const field = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500';
const ENGAGEMENT_KEYS = ['reactions', 'comments', 'shares', 'reposts', 'clicks', 'saves'];

export const ABTestingStudio: React.FC<Props> = ({ experiments, accounts, videos, activeNiche, onSaveExperiment, onUpdateExperiment, onLaunch, onDeployWinnerToSchedule }) => {
  const connected = accounts.filter((a) => a.connected);
  const [idea, setIdea] = useState('');
  const [platform, setPlatform] = useState<PlatformId | ''>('');
  const [videoId, setVideoId] = useState('');
  const [hours, setHours] = useState(24);
  const [draft, setDraft] = useState<ABTestExperiment | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState<Record<string, { ai: string; ae: string; bi: string; be: string }>>({});

  const target = (platform || connected[0]?.id || '') as PlatformId | '';

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) { setError('Connect at least one social account first.'); return; }
    setBusy('gen'); setError(null);
    try {
      const r = await api.post<any>('/gemini/ab-variations', { idea, platform: target, niche: activeNiche.name });
      setDraft({
        id: `ab-${Date.now()}`, name: idea.slice(0, 60), targetPlatform: target, createdAt: new Date().toISOString(),
        hypothesis: r.hypothesis, strategicReasoning: r.strategicReasoning, videoRefId: videoId || undefined, status: 'draft',
        variantA: { hook: r.variantA.hook, caption: r.variantA.caption, thumbnailDesc: r.variantA.thumbnailDesc },
        variantB: { hook: r.variantB.hook, caption: r.variantB.caption, thumbnailDesc: r.variantB.thumbnailDesc },
      });
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not generate variants.'); }
    finally { setBusy(null); }
  };

  const editDraft = (v: 'variantA' | 'variantB', k: keyof ABVariant, val: string) =>
    setDraft((d) => (d ? { ...d, [v]: { ...d[v], [k]: val } } : d));

  const launch = async () => {
    if (!draft) return;
    setBusy('launch'); setError(null);
    const started = await onLaunch({ ...draft, videoRefId: videoId || undefined }, hours);
    setBusy(null);
    if (started) { onSaveExperiment(started); setDraft(null); setIdea(''); }
  };

  const refresh = async (exp: ABTestExperiment) => {
    const ids = [exp.variantA.postId, exp.variantB.postId].filter(Boolean) as string[];
    if (ids.length < 2) return;
    setBusy(exp.id); setError(null);
    try {
      const r = await api.get<{ metrics: { id: string; metrics: Record<string, number> }[] }>(`/social/metrics?ids=${ids.join(',')}`);
      const pick = (id?: string) => {
        const m = r.metrics.find((x) => x.id === id)?.metrics;
        if (!m) return undefined;
        return { impressions: m.impressions || m.views || m.reach || 0, engagements: ENGAGEMENT_KEYS.reduce((s, k) => s + (m[k] || 0), 0) };
      };
      const a = pick(exp.variantA.postId), b = pick(exp.variantB.postId);
      if (!a || !b) { setError('No metrics for these posts yet. They appear after both posts are published and the network reports data (the scheduled variant publishes at its set time).'); return; }
      const next = { ...exp, resultsSource: 'network' as const, variantA: { ...exp.variantA, ...a }, variantB: { ...exp.variantB, ...b } };
      onUpdateExperiment(finalize(next));
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'METRICS_UNAVAILABLE'
        ? 'Metrics aren\'t available for this network. Enter the numbers from each platform\'s analytics below.'
        : err instanceof ApiError ? err.message : 'Could not read metrics.');
    } finally { setBusy(null); }
  };

  const finalize = (exp: ABTestExperiment): ABTestExperiment => {
    const o = evaluateAB(exp.variantA, exp.variantB);
    return { ...exp, confidenceRate: Math.round(o.confidence * 100), winningVariant: o.winner, status: o.winner ? 'completed' : 'running' };
  };

  const saveManual = (exp: ABTestExperiment) => {
    const m = manual[exp.id];
    if (!m) return;
    const n = (x: string) => Math.max(0, parseInt(x, 10) || 0);
    onUpdateExperiment(finalize({ ...exp, resultsSource: 'manual', variantA: { ...exp.variantA, impressions: n(m.ai), engagements: n(m.ae) }, variantB: { ...exp.variantB, impressions: n(m.bi), engagements: n(m.be) } }));
  };

  const VariantEditor = ({ k, label }: { k: 'variantA' | 'variantB'; label: string }) => (
    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
      <h4 className="text-xs font-bold text-indigo-300">{label}</h4>
      <label className="block text-[11px] text-slate-400">Hook<textarea className={field} rows={2} value={draft![k].hook} onChange={(e) => editDraft(k, 'hook', e.target.value)} /></label>
      <label className="block text-[11px] text-slate-400">Caption<textarea className={field} rows={4} value={draft![k].caption} onChange={(e) => editDraft(k, 'caption', e.target.value)} /></label>
      <p className="text-[11px] text-slate-500">Thumbnail idea: {draft![k].thumbnailDesc}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-1">
        <div className="flex items-center gap-2"><Split className="w-5 h-5 text-indigo-400" /><h1 className="text-lg font-bold text-white">A/B Hook Testing</h1></div>
        <p className="text-xs text-slate-400 max-w-2xl">AI writes two variants, both are published straight to your account, and the winner is decided from real engagement data with a statistical significance check.</p>
      </div>

      {error && <div role="alert" className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}

      <form onSubmit={generate} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 grid md:grid-cols-4 gap-3 items-end">
        <label className="md:col-span-2 text-[11px] text-slate-400">What is the post about?
          <input className={field} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="e.g. 3 mistakes new founders make with pricing" required minLength={5} maxLength={300} />
        </label>
        <label className="text-[11px] text-slate-400">Channel
          <select className={field} value={target} onChange={(e) => setPlatform(e.target.value as PlatformId)} disabled={!connected.length}>
            {connected.length ? connected.map((a) => <option key={a.id} value={a.id}>{a.name}</option>) : <option value="">No channels connected</option>}
          </select>
        </label>
        <label className="text-[11px] text-slate-400">Attach video (optional)
          <select className={field} value={videoId} onChange={(e) => setVideoId(e.target.value)}>
            <option value="">Text / image post</option>
            {videos.filter((v) => v.videoUrl).map((v) => <option key={v.id} value={v.id}>{v.title.slice(0, 40)}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy === 'gen' || !connected.length} className="md:col-span-4 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-xs font-semibold">
          {busy === 'gen' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Generate A/B variants
        </button>
      </form>

      {draft && (
        <div className="bg-slate-900/60 border border-indigo-500/40 rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-300"><span className="font-semibold text-white">Hypothesis:</span> {draft.hypothesis}</p>
          <div className="grid md:grid-cols-2 gap-3"><VariantEditor k="variantA" label="Variant A" /><VariantEditor k="variantB" label="Variant B" /></div>
          <p className="text-[11px] text-slate-500">{draft.strategicReasoning}</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-[11px] text-slate-400 flex items-center gap-2">Publish B
              <select className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {[12, 24, 48].map((h) => <option key={h} value={h}>{h}h after A</option>)}
              </select>
            </label>
            <button onClick={launch} disabled={busy === 'launch'} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-xs font-semibold">
              {busy === 'launch' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />} Publish both variants
            </button>
            <button onClick={() => setDraft(null)} className="text-xs text-slate-400 hover:text-slate-200">Discard</button>
          </div>
        </div>
      )}

      {experiments.length === 0 && !draft && <p className="text-sm text-slate-500 text-center py-8">No experiments yet. Generate your first A/B test above.</p>}

      {experiments.map((exp) => {
        const o = evaluateAB(exp.variantA, exp.variantB);
        const m = manual[exp.id] || { ai: '', ae: '', bi: '', be: '' };
        const hasData = (exp.variantA.impressions ?? 0) > 0 || (exp.variantB.impressions ?? 0) > 0;
        return (
          <div key={exp.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-sm font-bold text-white">{exp.name}</h3><p className="text-[11px] text-slate-500">{exp.targetPlatform.toUpperCase()} · {new Date(exp.createdAt).toLocaleDateString()} · {exp.status}</p></div>
              <div className="flex gap-2">
                <button onClick={() => refresh(exp)} disabled={busy === exp.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200">
                  {busy === exp.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh results
                </button>
                {exp.winningVariant && <button onClick={() => onDeployWinnerToSchedule(exp, exp.winningVariant!)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/40 text-xs"><Trophy className="w-3.5 h-3.5" /> Reuse winner</button>}
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              {(['A', 'B'] as const).map((k) => {
                const v = k === 'A' ? exp.variantA : exp.variantB;
                return (
                  <div key={k} className={`rounded-lg border p-3 ${exp.winningVariant === k ? 'border-emerald-500/60 bg-emerald-500/5' : 'border-slate-800 bg-slate-950/50'}`}>
                    <p className="font-bold text-indigo-300 mb-1">Variant {k}{exp.winningVariant === k && ' 🏆'}</p>
                    <p className="text-slate-200 mb-1">{v.hook}</p>
                    <p className="text-slate-500 line-clamp-3">{v.caption}</p>
                    <p className="mt-2 font-mono text-slate-300">{hasData ? `${(v.impressions ?? 0).toLocaleString()} impressions · ${(v.engagements ?? 0).toLocaleString()} engagements · ${(((k === 'A' ? o.rateA : o.rateB)) * 100).toFixed(2)}%` : 'No data yet'}</p>
                  </div>
                );
              })}
            </div>
            {hasData && <p className="text-xs text-slate-300">{o.message}{exp.resultsSource === 'manual' && ' (entered manually)'}</p>}
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer hover:text-slate-200">Enter results manually</summary>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                {([['ai', 'A impressions'], ['ae', 'A engagements'], ['bi', 'B impressions'], ['be', 'B engagements']] as const).map(([key, label]) => (
                  <label key={key} className="text-[11px]">{label}<input className={field} inputMode="numeric" value={m[key]} onChange={(e) => setManual((s) => ({ ...s, [exp.id]: { ...m, [key]: e.target.value.replace(/\D/g, '') } }))} /></label>
                ))}
                <button onClick={() => saveManual(exp)} className="col-span-2 md:col-span-4 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg py-2 text-xs font-semibold">Save results</button>
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
};
