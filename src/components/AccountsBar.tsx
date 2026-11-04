import React from 'react';
import { SocialAccount, PlatformId } from '../types';
import { Check, ExternalLink, Link2, ShieldCheck, Users, Unplug } from 'lucide-react';

interface AccountsBarProps {
  accounts: SocialAccount[];
  onToggleConnect: (platformId: PlatformId) => void;
  onUpdateAccount: (updated: SocialAccount) => void;
  onRequestConnect: (account: SocialAccount) => void;
}

const BRAND: Record<PlatformId, { label: string; short: string; color: string; glow: string; bg: string }> = {
  youtube: { label: 'YouTube', short: '▶', color: '#ff3434', glow: 'rgba(255,52,52,.18)', bg: 'linear-gradient(135deg,#ff3333,#c51616)' },
  tiktok: { label: 'TikTok', short: '♪', color: '#25f4ee', glow: 'rgba(37,244,238,.14)', bg: 'linear-gradient(135deg,#111827,#050505)' },
  instagram: { label: 'Instagram', short: '◎', color: '#f472b6', glow: 'rgba(225,48,108,.18)', bg: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)' },
  x: { label: 'X', short: '𝕏', color: '#f8fafc', glow: 'rgba(255,255,255,.10)', bg: 'linear-gradient(135deg,#30343b,#050505)' },
  linkedin: { label: 'LinkedIn', short: 'in', color: '#60a5fa', glow: 'rgba(10,102,194,.2)', bg: 'linear-gradient(135deg,#0a66c2,#084b91)' },
  facebook: { label: 'Facebook', short: 'f', color: '#60a5fa', glow: 'rgba(24,119,242,.2)', bg: 'linear-gradient(135deg,#1877f2,#0756b8)' },
  pinterest: { label: 'Pinterest', short: 'P', color: '#fb7185', glow: 'rgba(230,0,35,.18)', bg: 'linear-gradient(135deg,#e60023,#a90019)' },
};

const PlatformMark: React.FC<{ id: PlatformId }> = ({ id }) => {
  const brand = BRAND[id];
  return (
    <div className="h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg"
      style={{ background: brand.bg, boxShadow: `0 8px 24px ${brand.glow}` }} aria-label={brand.label}>
      {id === 'youtube' ? (
        <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.2 3.6-6.2 3.6Z"/></svg>
      ) : id === 'instagram' ? (
        <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="18" cy="6" r="1" fill="currentColor" stroke="none"/></svg>
      ) : brand.short}
    </div>
  );
};

export const AccountsBar: React.FC<AccountsBarProps> = ({ accounts, onToggleConnect, onRequestConnect }) => {
  const connectedCount = accounts.filter((a) => a.connected).length;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 p-4 sm:p-6 shadow-2xl">
      <div className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-indigo-600/10 blur-3xl" />
      <div className="relative mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.18em] text-indigo-300">
            <Link2 className="h-3.5 w-3.5" /> Creator connections
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Your social channels</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-400">Connect your channels once, then manage publishing from one workspace.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400"><Check className="h-5 w-5" /></div>
          <div><div className="text-lg font-bold tabular-nums text-white">{connectedCount}<span className="text-slate-500">/{accounts.length}</span></div><div className="text-[11px] text-slate-400">Channels connected</div></div>
        </div>
      </div>

      <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((acc) => {
          const brand = BRAND[acc.id];
          const unavailable = !acc.connected && (acc.publishable === false || acc.configured === false);
          return (
            <article key={acc.id} className={`group relative min-w-0 overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl ${acc.connected ? 'border-emerald-500/30 bg-emerald-500/[.045]' : 'border-slate-800 bg-slate-900/65 hover:border-slate-700'}`}>
              <div className="absolute inset-x-0 top-0 h-px opacity-80" style={{ background: `linear-gradient(90deg,transparent,${brand.color},transparent)` }} />
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {acc.connected && acc.avatarUrl ? <img src={acc.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-2xl border border-white/10 object-cover" /> : <PlatformMark id={acc.id} />}
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-white">{brand.label}</h3>
                    <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                      <span className={`h-1.5 w-1.5 rounded-full ${acc.connected ? 'bg-emerald-400' : unavailable ? 'bg-amber-400' : 'bg-slate-500'}`} />
                      <span className={acc.connected ? 'text-emerald-300' : unavailable ? 'text-amber-300' : 'text-slate-400'}>{acc.connected ? 'Connected' : unavailable ? 'Setup required' : 'Ready to connect'}</span>
                    </div>
                  </div>
                </div>
                {acc.connected && <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">ACTIVE</span>}
              </div>

              <div className="mt-4 min-h-[58px] rounded-xl border border-slate-800/80 bg-slate-950/55 px-3 py-2.5">
                {acc.connected ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-100">{acc.handle || 'Account connected'}</div><div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Users className="h-3 w-3" />{acc.followers > 0 ? `${acc.followers.toLocaleString()} followers` : 'Audience data not provided'}</div></div>
                    <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs leading-5 text-slate-400"><ShieldCheck className="h-4 w-4 shrink-0 text-slate-500" />Secure sign-in through {brand.label}. OmniPulse does not ask for your social password.</div>
                )}
              </div>

              <button
                type="button"
                disabled={unavailable}
                onClick={() => acc.connected ? onToggleConnect(acc.id) : onRequestConnect(acc)}
                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${acc.connected ? 'border border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/40 hover:bg-indigo-500 active:scale-[.99]'}`}
              >
                {acc.connected ? <><Unplug className="h-4 w-4" /> Disconnect channel</> : unavailable ? 'Not available yet' : <>Connect {brand.label}<ExternalLink className="h-3.5 w-3.5" /></>}
              </button>
              {!acc.connected && acc.configured === false && <p className="mt-2 text-center text-[10px] text-amber-300/80">Platform credentials have not been enabled by the site owner.</p>}
            </article>
          );
        })}
      </div>

      <div className="relative mt-5 flex items-start gap-2 rounded-xl border border-slate-800/80 bg-slate-900/40 px-3 py-3 text-[11px] leading-5 text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <p>Connections use the platform's authorization page. You can disconnect a channel at any time. Available actions depend on each platform's permissions and publishing support.</p>
      </div>
    </section>
  );
};
