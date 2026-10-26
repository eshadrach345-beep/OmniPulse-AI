import React, { useEffect, useState } from 'react';
import { X, Loader2, Download, Trash2, CheckCircle2, XCircle, Activity } from 'lucide-react';
import { AppUser } from '../types/auth';
import { Auth } from '../services/authService';
import { ApiError } from '../services/api';

const field = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500';
const btn = 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-4 py-2 flex items-center gap-2';

interface Props { user: AppUser; onClose: () => void; onUserChange: (u: AppUser) => void; onDeleted: () => void; onOpenPlans: () => void; }

export const AccountSettings: React.FC<Props> = ({ user, onClose, onUserChange, onDeleted, onOpenPlans }) => {
  const [name, setName] = useState(user.name);
  const [brand, setBrand] = useState(user.brandName);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [delPw, setDelPw] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [usage, setUsage] = useState<{ videosUsed: number; videosLimit: number; secondsUsed: number; secondsLimit: number; topupSeconds?: number } | null>(null);
  const [checks, setChecks] = useState<{ name: string; ok: boolean; detail: string }[] | null>(null);
  useEffect(() => { Auth.usage().then(setUsage).catch(() => undefined); }, []);

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key); setMsg(null);
    try { const t = await fn(); if (t) setMsg({ ok: true, text: t }); }
    catch (e) { setMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Something went wrong.' }); }
    finally { setBusy(null); }
  };

  const download = () => run('export', async () => {
    const data = await Auth.exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'omnipulse-data.json'; a.click(); URL.revokeObjectURL(url);
    return 'Your data export has been downloaded.';
  });

  const remove = () => {
    if (!window.confirm('Permanently delete your account and all data? Active subscriptions are cancelled. This cannot be undone.')) return;
    run('delete', async () => { await Auth.deleteAccount(delPw); onDeleted(); });
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="border-t border-slate-800 pt-4 space-y-3"><h3 className="text-sm font-bold text-white">{title}</h3>{children}</section>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Account settings" className="bg-slate-900 border border-slate-700 rounded-2xl p-6 my-6 max-w-lg mx-auto space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-white">Account settings</h2><button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button></div>
        {msg && <div role={msg.ok ? 'status' : 'alert'} className={`text-xs rounded-lg px-3 py-2 border ${msg.ok ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-rose-300 bg-rose-500/10 border-rose-500/30'}`}>{msg.text}</div>}

        <form onSubmit={(e) => { e.preventDefault(); run('profile', async () => { onUserChange(await Auth.updateProfile(name, brand)); return 'Profile updated.'; }); }} className="space-y-3">
          <label className="block text-xs text-slate-400">Name<input className={field} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} /></label>
          <label className="block text-xs text-slate-400">Brand / business<input className={field} value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={80} /></label>
          <p className="text-xs text-slate-500">Email: {user.email}</p>
          <button disabled={busy === 'profile'} className={btn}>{busy === 'profile' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Save profile</button>
        </form>

        {user.isOwner && (
          <Section title="System check (owner only)">
            <p className="text-xs text-slate-400">Tests every connection live: database, Gemini, fal.ai (video and voice), Resend, Flutterwave and your social network keys. Uses a few cents of API credit.</p>
            <button onClick={() => run('check', async () => { setChecks(null); setChecks(await Auth.systemCheck()); })} disabled={busy === 'check'} className={btn}>
              {busy === 'check' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}Run system check
            </button>
            {checks && (
              <ul className="space-y-2">
                {checks.map((c) => (
                  <li key={c.name} className="text-xs flex gap-2">
                    {c.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                    <span><span className="font-semibold text-slate-100">{c.name}</span><span className={`block ${c.ok ? 'text-slate-400' : 'text-rose-300'}`}>{c.detail}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="Plan & usage">
          <p className="text-xs text-slate-300 capitalize">{user.isOwner ? 'Owner test access (no subscription)' : `${user.tier} plan · ${user.subscriptionStatus === 'canceling' ? 'ends' : 'renews'} ${user.currentPeriodEnd ? new Date(user.currentPeriodEnd).toLocaleDateString() : '—'}`}</p>
          {usage && <p className="text-xs text-slate-400">Video seconds used this month: {usage.secondsLimit >= 1_000_000 ? `${usage.secondsUsed} (unlimited)` : `${usage.secondsUsed} / ${usage.secondsLimit}`}{usage.topupSeconds ? ` (+${usage.topupSeconds} bonus seconds)` : ''}</p>}
          {!user.isOwner && <button onClick={() => { onClose(); onOpenPlans(); }} className="text-xs text-indigo-400 hover:text-indigo-300">Change plan or cancel</button>}
        </Section>

        {!user.isOwner && (<>
        <Section title="Change password">
          <form onSubmit={(e) => { e.preventDefault(); run('pw', async () => { await Auth.changePassword(cur, next); setCur(''); setNext(''); return 'Password changed.'; }); }} className="space-y-3">
            <input className={field} type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} required autoComplete="current-password" />
            <input className={field} type="password" placeholder="New password (8+ chars, letter & number)" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
            <button disabled={busy === 'pw'} className={btn}>{busy === 'pw' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Update password</button>
          </form>
        </Section>

        </>)}

        <p className="text-[11px] text-slate-600">App build {typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}</p>

        <Section title="Your data">
          <button onClick={download} disabled={busy === 'export'} className="bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg px-4 py-2 flex items-center gap-2"><Download className="w-3.5 h-3.5" />Download my data</button>
        </Section>

        {!user.isOwner && (
        <Section title="Delete account">
          <p className="text-xs text-slate-400">Permanently removes your account, videos, posts and connected social accounts, and cancels any subscription.</p>
          <div className="flex gap-2">
            <input className={field} type="password" placeholder="Confirm with your password" value={delPw} onChange={(e) => setDelPw(e.target.value)} autoComplete="current-password" />
            <button onClick={remove} disabled={!delPw || busy === 'delete'} className="bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg px-4 flex items-center gap-2 shrink-0"><Trash2 className="w-3.5 h-3.5" />Delete</button>
          </div>
        </Section>
        )}
      </div>
    </div>
  );
};
