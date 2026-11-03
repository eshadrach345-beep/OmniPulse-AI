import React, { useState } from 'react';
import { SocialAccount, PlatformId } from '../types';
import { 
  Check, 
  Plus, 
  ExternalLink, 
  Clock, 
  TrendingUp, 
  X,
  Share2
} from 'lucide-react';

interface AccountsBarProps {
  accounts: SocialAccount[];
  onToggleConnect: (platformId: PlatformId) => void;
  onUpdateAccount: (updated: SocialAccount) => void;
  onRequestConnect: (account: SocialAccount) => void;
}

export const AccountsBar: React.FC<AccountsBarProps> = ({
  accounts,
  onToggleConnect,
  onUpdateAccount,
  onRequestConnect,
}) => {
  const connectedCount = accounts.filter((a) => a.connected).length;

  const getPlatformIcon = (id: PlatformId) => {
    switch (id) {
      case 'tiktok':
        return (
          <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center text-[10px] font-black text-cyan-400 border border-slate-700">
            TT
          </div>
        );
      case 'youtube':
        return (
          <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-[10px] font-black text-white">
            YT
          </div>
        );
      case 'instagram':
        return (
          <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-[10px] font-black text-white">
            IG
          </div>
        );
      case 'x':
        return (
          <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center text-[10px] font-black text-white border border-slate-700">
            𝕏
          </div>
        );
      case 'linkedin':
        return (
          <div className="w-5 h-5 rounded-full bg-blue-700 flex items-center justify-center text-[10px] font-black text-white">
            in
          </div>
        );
      case 'facebook':
        return (
          <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black text-white">
            fb
          </div>
        );
      case 'pinterest':
        return (
          <div className="w-5 h-5 rounded-full bg-rose-600 flex items-center justify-center text-[10px] font-black text-white">
            P
          </div>
        );
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <Share2 className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Your social accounts
          </h2>
          <span className="text-xs text-slate-400">
            ({connectedCount} of {accounts.length} active)
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Tap Connect, sign in on the network&apos;s own page and approve access.
        </p>
      </div>

      {/* Account items grid */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-3">
        {accounts.map(acc => (
          <div
            key={acc.id}
            className={`rounded-xl p-3.5 border transition-colors flex flex-col ${acc.connected ? 'bg-slate-850 border-emerald-500/40' : 'bg-slate-900/50 border-slate-800'}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {getPlatformIcon(acc.id)}
              <span className="text-sm font-semibold text-slate-100 truncate">{acc.name}</span>
              {acc.connected && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Connected" />}
            </div>
            <p className={`mt-2 text-xs truncate font-mono ${acc.connected ? 'text-emerald-300' : 'text-slate-500'}`}>
              {acc.connected ? acc.handle : 'Not connected'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              {acc.connected && acc.followers > 0 ? `${acc.followers.toLocaleString()} followers` : ' '}
            </p>
            <button
              disabled={!acc.connected && acc.publishable === false}
              onClick={() => (acc.connected ? onToggleConnect(acc.id) : onRequestConnect(acc))}
              className={`mt-3 w-full text-xs px-3 py-2 rounded-lg font-semibold transition-colors ${
                acc.connected
                  ? 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-rose-500/15 hover:text-rose-300 hover:border-rose-500/40'
                  : acc.publishable === false || acc.configured === false
                    ? 'bg-slate-800 text-slate-400 border border-slate-700'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500'
              }`}
              title={acc.connected ? 'Connected. Tap to disconnect.' : acc.configured === false ? `${acc.name} still needs to be switched on by the site owner` : `Connect ${acc.name}`}
            >
              {acc.connected ? 'Disconnect' : acc.publishable === false ? 'Coming soon' : acc.configured === false ? 'Not available yet' : 'Connect'}
            </button>
          </div>
        ))}
      </div>

    </div>
  );
};
