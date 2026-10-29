import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Play, RefreshCw, Square, X } from 'lucide-react';
import { Series, isActive, type ProjectSummary } from '../services/seriesService';
import { getLocalProcesses, stopLocalProcess, type LocalProcessSummary } from '../services/processRegistry';

interface JobsPanelProps { onClose: () => void; onOpenSeries: () => void; }

/** A server-backed overview of episode jobs. Direct Video Studio generation has its own local Stop control. */
export const JobsPanel: React.FC<JobsPanelProps> = ({ onClose, onOpenSeries }) => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stoppingAll, setStoppingAll] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [localJobs, setLocalJobs] = useState<LocalProcessSummary[]>([]);
  const readLocalJobs = useCallback(() => setLocalJobs(getLocalProcesses()), []);

  const refresh = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    try { setProjects(await Series.list()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load background processes.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    void refresh(); readLocalJobs();
    const timer = window.setInterval(() => { void refresh(true); readLocalJobs(); }, 10000);
    const onLocalUpdate = () => readLocalJobs();
    window.addEventListener('omnipulse:local-job-updated', onLocalUpdate);
    return () => { window.clearInterval(timer); window.removeEventListener('omnipulse:local-job-updated', onLocalUpdate); };
  }, [refresh, readLocalJobs]);

  const rows = projects.flatMap((project) => project.episodes.map((episode) => ({
    ...episode, projectId: project.id, projectTitle: project.title,
  }))).filter((job) => isActive(job.status) || job.status === 'FAILED')
    .sort((a, b) => Number(isActive(b.status)) - Number(isActive(a.status)));
  const activeCount = rows.filter((j) => isActive(j.status)).length + localJobs.length;
  const stopLocal = (job: LocalProcessSummary) => { if (!window.confirm(`Stop “${job.title || job.type}”? An external request already accepted may still finish remotely.`)) return; if (!stopLocalProcess(job.id)) { setError('This browser process is no longer active. Refresh the panel.'); readLocalJobs(); return; } setNotice(`Stop requested for ${job.title || job.type}.`); }

  const stopAll = async () => {
    const activeRows = rows.filter((job) => isActive(job.status));
    if (!activeRows.length && !localJobs.length) { setNotice('There are no active processes to stop.'); return; }
    if (!window.confirm(`Pause/stop all ${activeRows.length + localJobs.length} active process(es)? Completed clips and videos are kept where available. External provider requests already accepted may still finish remotely.`)) return;
    setStoppingAll(true); setError(''); setNotice('');
    let stopped = 0; const failures: string[] = [];
    for (const job of localJobs) { if (stopLocalProcess(job.id)) stopped++; }
    for (const job of activeRows) { try { const result = await Series.stop(job.id); if (result.stopped) stopped++; } catch { failures.push(`${job.projectTitle} · Part ${job.partNumber}`); } }
    setNotice(`Stop requested for ${stopped} process(es).${failures.length ? ` Could not stop: ${failures.join(', ')}.` : ''}`);
    await refresh(true); readLocalJobs(); setStoppingAll(false);
  };

  const stop = async (id: string, title: string) => {
    if (!window.confirm(`Stop “${title}” now? Completed clips are kept. A provider request already accepted may still finish remotely.`)) return;
    setWorkingId(id); setError(''); setNotice('');
    try {
      const r = await Series.stop(id);
      setNotice(r.stopped ? `Stopped: ${title}` : `${title} is no longer active.`);
      await refresh(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not stop this process.'); }
    finally { setWorkingId(null); }
  };

  const resume = async (id: string, title: string) => {
    if (!window.confirm(`Resume “${title}”? This may submit new provider requests and use quota.`)) return;
    setWorkingId(id); setError(''); setNotice('');
    try { await Series.retry(id); setNotice(`Resumed: ${title}`); await refresh(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not resume this process.'); }
    finally { setWorkingId(null); }
  };

  return <div className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="jobs-panel-title">
    <section className="w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl flex flex-col">
      <header className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-800">
        <div><h2 id="jobs-panel-title" className="text-lg font-bold text-white">Jobs &amp; Processes</h2><p className="text-xs text-slate-400 mt-1">Monitor active series jobs, stop them, or resume failed/stopped parts.</p></div>
        <div className="flex items-center gap-2">{(activeCount > 0) && <button onClick={() => void stopAll()} disabled={stoppingAll} className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-rose-800 bg-rose-950/50 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-900/70 disabled:opacity-50"><Square className="w-3.5 h-3.5 fill-current"/>{stoppingAll ? 'Stopping all…' : 'Stop all'}</button>}<button onClick={() => void refresh(true)} disabled={refreshing} className="p-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800" aria-label="Refresh jobs"><RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /></button><button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-800" aria-label="Close jobs panel"><X className="w-5 h-5" /></button></div>
      </header>
      <div className="p-4 sm:p-5 overflow-y-auto space-y-3">
        <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-emerald-800 bg-emerald-950/50 px-3 py-1.5 text-emerald-200">{activeCount} active</span><span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-slate-300">Auto-refresh every 10 seconds</span></div>
        {error && <div role="alert" className="flex gap-2 rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}
        {notice && <div role="status" className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-200">{notice}</div>}
        {localJobs.map((job) => <article key={job.id} className="rounded-xl border border-indigo-800 bg-indigo-950/30 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between"><div className="min-w-0"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"/><p className="font-semibold text-white truncate">{job.title || job.type}</p></div><div className="text-xs text-slate-400 mt-1">{job.type} · Running in this browser tab</div></div><button onClick={() => stopLocal(job)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-800 bg-rose-950/50 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-900/70"><Square className="w-3.5 h-3.5 fill-current"/>Stop</button></article>)}
        {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" />Loading jobs…</div> : rows.length === 0 && localJobs.length === 0 ? <div className="py-10 text-center"><CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-3"/><p className="font-semibold text-white">No active or stopped series jobs</p><p className="text-sm text-slate-400 mt-1">Direct Video and Auto-Pilot runs also appear here while active.</p></div> : rows.map((job) => {
          const active = isActive(job.status); const title = `${job.projectTitle} · Part ${job.partNumber}`;
          return <article key={job.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="min-w-0"><div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} /><p className="font-semibold text-white truncate">{title}</p></div><div className="flex items-center gap-2 mt-1 text-xs text-slate-400"><Clock3 className="w-3.5 h-3.5"/><span>{active ? (job.status === 'PROCESSING' ? 'Writing script / preparing scenes' : 'Rendering scenes') : 'Stopped or failed'}</span><span>·</span><span>{job.status}</span></div></div>
            <div className="flex gap-2 shrink-0">{active ? <button disabled={workingId === job.id} onClick={() => void stop(job.id, title)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-800 bg-rose-950/50 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-900/70 disabled:opacity-50">{workingId === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Square className="w-3.5 h-3.5 fill-current"/>}Pause / Stop</button> : <button disabled={workingId === job.id} onClick={() => void resume(job.id, title)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-800 bg-emerald-950/50 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/70 disabled:opacity-50">{workingId === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Play className="w-3.5 h-3.5"/>}Resume</button>}<button onClick={() => { onClose(); onOpenSeries(); }} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Open</button></div>
          </article>;
        })}
        <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-100/80">Stopping prevents OmniPulse from advancing the series workflow. A request already accepted by Gemini, Groq, or a video provider may still finish remotely and may still count toward that provider's usage.</div>
      </div>
      <footer className="border-t border-slate-800 p-3 flex justify-end"><button onClick={onClose} className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm text-white">Done</button></footer>
    </section>
  </div>;
};
