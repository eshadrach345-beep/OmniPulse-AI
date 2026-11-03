import React, { useState } from 'react';
import { ScheduledPost, SocialAccount } from '../types';
import { api, ApiError } from '../services/api';
import { BarChart3, RefreshCw, Loader2, Info } from 'lucide-react';

interface Props {
  accounts: SocialAccount[];
  posts: ScheduledPost[];
}

type Row = Record<string, number>;
const ENGAGEMENT = ['reactions', 'comments', 'shares', 'reposts', 'saves', 'clicks'];

export const AnalyticsReports: React.FC<Props> = ({ posts }) => {
  const tracked = posts.filter((p) => p.publishedPosts?.length);
  const [metrics, setMetrics] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const refresh = async () => {
    const ids = tracked.flatMap((p) => p.publishedPosts!.map((b) => b.postId)).slice(0, 40);
    if (!ids.length) return;
    setBusy(true); setMessage(null);
    try {
      const r = await api.get<{ metrics: { id: string; metrics: Row }[] }>(`/social/metrics?ids=${ids.join(',')}`);
      setMetrics(Object.fromEntries(r.metrics.map((m) => [m.id, m.metrics])));
      setLoadedAt(new Date());
      if (!r.metrics.length) setMessage('No metrics reported yet. Networks usually report data some hours after a post is published.');
    } catch (e) {
      setMessage(e instanceof ApiError && e.code === 'METRICS_UNAVAILABLE'
        ? 'Metrics aren\'t available for this connection. View performance in each platform\'s own analytics.'
        : e instanceof ApiError ? e.message : 'Could not load metrics.');
    } finally { setBusy(false); }
  };

  const sum = (p: ScheduledPost, keys: string[]) => p.publishedPosts!.reduce((t, b) => t + keys.reduce((s, k) => s + (metrics[b.postId]?.[k] || 0), 0), 0);
  const hasMetrics = Object.keys(metrics).length > 0;
  const totals = tracked.reduce((t, p) => ({ views: t.views + sum(p, ['impressions', 'views']), eng: t.eng + sum(p, ENGAGEMENT) }), { views: 0, eng: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-xl p-4">
        <div>
          <div className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-indigo-400" /><h1 className="text-lg font-bold text-white">Performance</h1></div>
          <p className="text-xs text-slate-400">Real results for posts you sent through OmniPulse, read from each network (YouTube, X, Facebook and Instagram report data). Nothing here is estimated.</p>
        </div>
        <button onClick={refresh} disabled={busy || !tracked.length} className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh results
        </button>
      </div>

      {message && <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex gap-2"><Info className="w-4 h-4 shrink-0" />{message}</div>}

      {tracked.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">No tracked posts yet. Publish or schedule a post and its results will show up here.</p>
      ) : (
        <>
          {hasMetrics && (
            <div className="grid grid-cols-3 gap-3">
              {[['Posts tracked', tracked.length], ['Views / impressions', totals.views.toLocaleString()], ['Engagements', totals.eng.toLocaleString()]].map(([l, v]) => (
                <div key={l as string} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4"><p className="text-xs text-slate-400">{l}</p><p className="text-2xl font-bold text-white tabular-nums">{v}</p></div>
              ))}
            </div>
          )}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-400 text-left"><tr><th className="p-3">Post</th><th>Channels</th><th>Status</th><th className="text-right">Views</th><th className="text-right">Engagements</th><th className="text-right pr-3">Eng. rate</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {tracked.map((p) => {
                  const v = sum(p, ['impressions', 'views']), e = sum(p, ENGAGEMENT);
                  return (
                    <tr key={p.id} className="text-slate-200">
                      <td className="p-3 max-w-[16rem] truncate">{p.title}</td>
                      <td className="text-slate-400">{p.publishedPosts!.map((b) => b.name).join(', ')}</td>
                      <td>{p.status}</td>
                      <td className="text-right tabular-nums">{hasMetrics ? v.toLocaleString() : '—'}</td>
                      <td className="text-right tabular-nums">{hasMetrics ? e.toLocaleString() : '—'}</td>
                      <td className="text-right pr-3 tabular-nums">{hasMetrics && v > 0 ? `${((e / v) * 100).toFixed(2)}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {loadedAt && <p className="text-[11px] text-slate-500">Last refreshed {loadedAt.toLocaleTimeString()}</p>}
        </>
      )}
    </div>
  );
};
