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

const PlatformMark: React.FC<{ id: PlatformId; avatar?: string }> = ({ id, avatar }) => (
  avatar ? <img src={avatar} alt="" className="h-6 w-6 shrink-0 rounded-md object-cover" /> :
  <span role="img" aria-label={BRAND[id].label + ' logo'} title={BRAND[id].label}
    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-extrabold text-white"
    style={{ background: BRAND[id].bg, boxShadow: '0 4px 12px ' + BRAND[id].color + '24' }}>
    {BRAND[id].short}
  </span>
);

export const AccountsBar: React.FC<AccountsBarProps> = ({ accounts, onToggleConnect, onRequestConnect, compact = false }) => {
  const connectedCount = accounts.filter((account) => account.connected).length;
  return (
    <section className={compact
      ? 'social-compact rounded-xl border border-white/[.07] bg-[#111019]/80 p-2'
      : 'rounded-2xl border border-white/[.08] bg-[#111019]/80 p-3 sm:p-4'}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-400/10 text-violet-200"><Link2 className="h-3.5 w-3.5" /></div>
          <div className="min-w-0"><h2 className="text-xs font-extrabold text-white">Social channels</h2><p className="text-[9px] text-slate-500">Secure publishing connections</p></div>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[.08] bg-white/[.035] px-2.5 py-1">
          <span className="text-[11px] font-extrabold tabular-nums text-white">{connectedCount}<span className="font-medium text-slate-500">/{accounts.length}</span></span>
          <span className="text-[9px] text-slate-400">connected</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
        {accounts.map((account) => {
          const brand = BRAND[account.id];
          const unavailable = !account.connected && (account.publishable === false || account.configured === false);
          return (
            <article key={account.id} className={account.connected
              ? 'flex min-w-0 items-center gap-1.5 rounded-md border border-emerald-400/20 bg-emerald-400/[.045] px-1.5 py-1'
              : 'flex min-w-0 items-center gap-1.5 rounded-md border border-white/[.065] bg-white/[.025] px-2 py-1.5 transition hover:border-violet-300/25 hover:bg-white/[.045]'}>
              <PlatformMark id={account.id} avatar={account.connected ? account.avatarUrl : undefined} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[9px] font-extrabold text-white">{brand.label}</p>
                <p className={account.connected ? 'truncate text-[7px] text-emerald-300' : unavailable ? 'truncate text-[7px] text-amber-300' : 'truncate text-[7px] text-slate-500'}>
                  {account.connected ? (account.handle || 'Connected') : unavailable ? 'Setup needed' : 'Not connected'}
                </p>
              </div>
              <button type="button" disabled={unavailable} onClick={() => account.connected ? onToggleConnect(account.id) : onRequestConnect(account)}
                aria-label={account.connected ? 'Disconnect ' + brand.label : 'Connect ' + brand.label}
                className={account.connected
                  ? 'inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 border border-rose-400/15 bg-rose-400/[.06] px-2 text-[8px] font-extrabold text-rose-200 transition hover:bg-rose-400/15 disabled:opacity-40'
                  : 'inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-violet-300/20 bg-violet-300/[.07] px-2 text-[8px] font-extrabold text-violet-100 transition hover:bg-violet-300/15 disabled:opacity-40'}>
                {account.connected ? <><Unplug className="h-3 w-3" />Off</> : unavailable ? 'Locked' : <>Connect <ExternalLink className="h-2.5 w-2.5" /></>}
              </button>
            </article>
          );
        })}
      </div>
      {!compact && <p className="mt-2.5 flex items-center gap-1.5 text-[9px] leading-4 text-slate-500"><ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400" />Sign in through each platform’s official authorization page. OmniPulse never asks for your social password.</p>}
    </section>
  );
};
