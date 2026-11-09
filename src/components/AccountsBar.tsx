import React from 'react';
import { SocialAccount, PlatformId } from '../types';
import { ExternalLink, Link2, ShieldCheck, Unplug } from 'lucide-react';

interface AccountsBarProps {
  accounts: SocialAccount[];
  onToggleConnect: (platformId: PlatformId) => void;
  onUpdateAccount: (updated: SocialAccount) => void;
  onRequestConnect: (account: SocialAccount) => void;
  compact?: boolean;
}

const BRAND: Record<PlatformId, { label: string; short: string; color: string; bg: string }> = {
  youtube: { label: 'YouTube', short: '▶', color: '#ff4444', bg: 'linear-gradient(135deg,#ff3838,#b91d2a)' },
  tiktok: { label: 'TikTok', short: '♪', color: '#72f2ec', bg: 'linear-gradient(135deg,#202938,#080a10)' },
  instagram: { label: 'Instagram', short: '◎', color: '#f29ac8', bg: 'linear-gradient(135deg,#8b3ab7,#e83d78,#f5ad4f)' },
  x: { label: 'X', short: '𝕏', color: '#e8f0fb', bg: 'linear-gradient(135deg,#303847,#080a10)' },
  linkedin: { label: 'LinkedIn', short: 'in', color: '#75b9ff', bg: 'linear-gradient(135deg,#0a66c2,#093f79)' },
  facebook: { label: 'Facebook', short: 'f', color: '#84baff', bg: 'linear-gradient(135deg,#1877f2,#0756b8)' },
  pinterest: { label: 'Pinterest', short: 'P', color: '#ff8294', bg: 'linear-gradient(135deg,#e60023,#a90019)' },
};

const PlatformMark: React.FC<{ id: PlatformId }> = ({ id }) => (
  <div role="img" aria-label={BRAND[id].label + ' logo'} title={BRAND[id].label}
    className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-extrabold text-white shadow-lg"
    style={{ background: BRAND[id].bg, boxShadow: '0 5px 16px ' + BRAND[id].color + '22' }}>
    {BRAND[id].short}
  </div>
);

export const AccountsBar: React.FC<AccountsBarProps> = ({ accounts, onToggleConnect, onRequestConnect, compact = false }) => {
  const connectedCount = accounts.filter((account) => account.connected).length;
  return (
    <section className={compact ? 'social-compact rounded-2xl border border-slate-800/80 bg-slate-950/70 p-3 sm:p-4' : 'rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 sm:p-5'}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-400/10 text-cyan-200"><Link2 className="h-4 w-4" /></div>
          <div><h2 className="text-sm font-bold text-white">Social channels</h2><p className="text-[10px] text-slate-500">Secure connections for publishing</p></div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
          <span className="text-sm font-extrabold tabular-nums text-white">{connectedCount}<span className="font-medium text-slate-500">/{accounts.length}</span></span>
          <span className="text-[10px] text-slate-400">connected</span>
        </div>
      </div>
      <div className={compact ? 'grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7' : 'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7'}>
        {accounts.map((account) => {
          const brand = BRAND[account.id];
          const unavailable = !account.connected && (account.publishable === false || account.configured === false);
          return (
            <article key={account.id} className={account.connected ? 'min-w-0 rounded-xl border border-emerald-400/25 bg-emerald-400/[.045] p-2.5' : 'min-w-0 rounded-xl border border-slate-800 bg-slate-900/55 p-2.5 transition hover:border-slate-600'}>
              <div className="flex min-w-0 items-center gap-2">
                {account.connected && account.avatarUrl ? <img src={account.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-xl object-cover" /> : <PlatformMark id={account.id} />}
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-bold text-white">{brand.label}</p>
                  <p className={account.connected ? 'mt-0.5 truncate text-[9px] text-emerald-300' : unavailable ? 'mt-0.5 truncate text-[9px] text-amber-300' : 'mt-0.5 truncate text-[9px] text-slate-500'}>{account.connected ? 'Connected' : unavailable ? 'Setup required' : 'Not connected'}</p>
                </div>
              </div>
              {account.connected && account.handle && <p className="mt-2 truncate text-[10px] text-slate-400">{account.handle}</p>}
              <button type="button" disabled={unavailable} onClick={() => account.connected ? onToggleConnect(account.id) : onRequestConnect(account)}
                className={account.connected ? 'mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[.07] px-2 py-1.5 text-[10px] font-bold text-rose-200 hover:bg-rose-500/15 disabled:opacity-40' : 'mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/[.08] px-2 py-1.5 text-[10px] font-bold text-cyan-100 hover:bg-cyan-400/15 disabled:opacity-40'}>
                {account.connected ? <><Unplug className="h-3 w-3" />Disconnect</> : unavailable ? 'Unavailable' : <>Connect <ExternalLink className="h-3 w-3" /></>}
              </button>
            </article>
          );
        })}
      </div>
      {!compact && <p className="mt-3 flex items-center gap-2 text-[10px] leading-5 text-slate-500"><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />Sign in on each platform’s official authorization page. OmniPulse never asks for your social password.</p>}
    </section>
  );
};
