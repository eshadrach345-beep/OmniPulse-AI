import React, { useEffect, useState } from 'react';
import { X, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { Auth } from '../services/authService';
import { ApiError } from '../services/api';

type Check = { name: string; ok: boolean; detail: string };
const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

/** Owner-only: runs live checks against every connected service so you can see exactly what is (not) working. */
export const SystemCheck: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true); setError(null);
    try { setChecks(await Auth.systemCheck()); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not run the system check.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { run(); }, []);

  const failed = checks?.filter((c) => !c.ok).length ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="System status" className="bg-slate-900 border border-slate-700 rounded-2xl p-6 my-6 max-w-xl mx-auto space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div><h2 className="text-lg font-bold text-white">System status</h2><p className="text-[11px] text-slate-500">Live checks of every connected service · build {BUILD}</p></div>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
        </div>
        {error && <div role="alert" className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</div>}
        {!checks && busy && <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center"><Loader2 className="w-4 h-4 animate-spin" />Checking your services...</div>}
        {checks && (
          <>
            <p className={`text-xs font-semibold ${failed ? 'text-amber-300' : 'text-emerald-300'}`}>{failed ? `${failed} of ${checks.length} checks need attention` : 'Everything is connected and working'}</p>
            <ul className="space-y-2">
              {checks.map((c) => (
                <li key={c.name} className={`rounded-lg border p-3 text-xs ${c.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/5'}`}>
                  <div className="flex items-center gap-2 font-semibold text-slate-100">{c.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}{c.name}</div>
                  <p className="mt-1 text-slate-400 break-words">{c.detail}</p>
                </li>
              ))}
            </ul>
          </>
        )}
        <button onClick={run} disabled={busy} className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-100 text-xs font-semibold rounded-lg px-4 py-2 flex items-center gap-2"><RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />Run checks again</button>
      </div>
    </div>
  );
};
