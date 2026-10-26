import React, { useState } from 'react';
import { PlatformId } from '../types';
import { api, ApiError } from '../services/api';
import { Loader2, Search, Sparkles, Copy, Calendar, Video, AlertTriangle } from 'lucide-react';

interface Props {
  nicheName: string;
  onSendOutrankToScheduler: (post: { title: string; caption: string; hook: string }) => void;
  onSendOutrankToVideoStudio: (hook: string) => void;
}

const field = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500';
const PLATFORMS: PlatformId[] = ['tiktok', 'youtube', 'instagram', 'x', 'linkedin', 'facebook', 'pinterest'];

export const CompetitorIntel: React.FC<Props> = ({ nicheName, onSendOutrankToScheduler, onSendOutrankToVideoStudio }) => {
  const [target, setTarget] = useState('');
  const [platform, setPlatform] = useState<PlatformId>('tiktok');
  const [busy, setBusy] = useState<'intel' | 'rewrite' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intel, setIntel] = useState<any>(null);
  const [name, setName] = useState('');
  const [hook, setHook] = useState('');
  const [caption, setCaption] = useState('');
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

  const research = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy('intel'); setError(null); setIntel(null);
    try { setIntel(await api.post('/gemini/competitor-analysis', { target, platform, niche: nicheName })); setName(target); }
    catch (err) { fail(err); } finally { setBusy(null); }
  };

  const rewrite = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy('rewrite'); setError(null); setResult(null);
    try { setResult(await api.post('/gemini/outrank', { competitorName: name || 'a competitor', hook, caption, niche: nicheName })); }
    catch (err) { fail(err); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      {error && <div role="alert" className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</div>}

      <form onSubmit={research} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-white">Competitor research</h3>
        <p className="text-[11px] text-slate-500">Uses Google Search to summarise what a public account publishes. Follower counts are never guessed.</p>
        <div className="grid md:grid-cols-4 gap-3">
          <input className={`${field} md:col-span-2`} value={target} onChange={(e) => setTarget(e.target.value)} placeholder="@handle, brand name or profile URL" required minLength={2} maxLength={200} />
          <select className={field} value={platform} onChange={(e) => setPlatform(e.target.value as PlatformId)}>{PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
          <button disabled={busy === 'intel'} className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold py-2">
            {busy === 'intel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Research
          </button>
        </div>
        {intel && (
          <div className="text-xs text-slate-300 space-y-2 border-t border-slate-800 pt-3">
            {intel.verified === false && <p className="text-amber-300 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />Reliable public information could not be found for this account. Treat the notes below with caution.</p>}
            <p>{intel.summary}</p>
            <p><span className="text-slate-500">Style:</span> {intel.postingStyle}</p>
            {!!intel.contentThemes?.length && <p><span className="text-slate-500">Themes:</span> {intel.contentThemes.join(' · ')}</p>}
            {!!intel.topKeywords?.length && <p><span className="text-slate-500">Keywords:</span> {intel.topKeywords.join(', ')}</p>}
            {!!intel.gapsAndOpportunities?.length && (<div><p className="text-slate-500">Opportunities:</p><ul className="list-disc pl-5 space-y-0.5">{intel.gapsAndOpportunities.map((g: string) => <li key={g}>{g}</li>)}</ul></div>)}
          </div>
        )}
      </form>

      <form onSubmit={rewrite} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-white">Outrank a competitor post</h3>
        <p className="text-[11px] text-slate-500">Paste a competitor's hook and caption. AI writes an original, stronger version on the same topic.</p>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Competitor name (optional)" maxLength={80} />
        <textarea className={field} rows={2} value={hook} onChange={(e) => setHook(e.target.value)} placeholder="Their hook" maxLength={400} />
        <textarea className={field} rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Their caption" maxLength={2000} />
        <button disabled={busy === 'rewrite' || (!hook.trim() && !caption.trim())} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold px-4 py-2">
          {busy === 'rewrite' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Write a stronger version
        </button>
        {result && (
          <div className="border-t border-slate-800 pt-3 text-xs space-y-2">
            <p className="text-slate-100 font-semibold">{result.rewrittenOutrankHook}</p>
            <p className="text-slate-300 whitespace-pre-line">{result.rewrittenOutrankCaption}</p>
            <p className="text-slate-500">{result.outrankAngle}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => { navigator.clipboard.writeText(`${result.rewrittenOutrankHook}\n\n${result.rewrittenOutrankCaption}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center gap-1.5"><Copy className="w-3.5 h-3.5" />{copied ? 'Copied' : 'Copy'}</button>
              <button type="button" onClick={() => onSendOutrankToScheduler({ title: result.rewrittenOutrankHook.slice(0, 70), caption: result.rewrittenOutrankCaption, hook: result.rewrittenOutrankHook })} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Send to scheduler</button>
              <button type="button" onClick={() => onSendOutrankToVideoStudio(result.rewrittenOutrankHook)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center gap-1.5"><Video className="w-3.5 h-3.5" />Make a video</button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
