import React, { useState } from 'react';
import { AppUser } from '../types/auth';
import { Zap, Video, Clapperboard, Calendar, TrendingUp, Split, BarChart3, Radio, Crown, LogOut, Settings, Activity, CreditCard, ImagePlus, Share2, MessageSquare } from 'lucide-react';

export type TabId = 'dashboard' | 'accounts' | 'video-studio' | 'creator-studio' | 'series' | 'trends-hashtags' | 'scheduler' | 'ab-testing' | 'analytics' | 'support' | 'owner';

interface TopNavProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  onOpenCreateVideo: () => void;
  onOpenAdMaker: () => void;
  onOpenSchedulePost: () => void;
  autoPilotActive: boolean;
  toggleAutoPilot: () => void;
  currentUser: AppUser;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenSystemCheck: () => void;
  onOpenPricing: () => void;
}

const NAV: { id: TabId; label: string; short: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: Activity },
  { id: 'accounts', label: 'Social Accounts', short: 'Accounts', icon: Share2 },
  { id: 'video-studio', label: 'Video Studio', short: 'Videos', icon: Video },
  { id: 'creator-studio', label: 'Creator Studio', short: 'Creator', icon: Clapperboard },
  { id: 'series', label: 'Series', short: 'Series', icon: Clapperboard },
  { id: 'trends-hashtags', label: 'Trends & Hashtags', short: 'Trends', icon: TrendingUp },
  { id: 'scheduler', label: 'Post Scheduler', short: 'Posts', icon: Calendar },
  { id: 'ab-testing', label: 'A/B Studio', short: 'A/B', icon: Split },
  { id: 'analytics', label: 'Analytics & Reports', short: 'Reports', icon: BarChart3 },
  { id: 'support', label: 'Support', short: 'Help', icon: MessageSquare },
  { id: 'owner', label: 'Owner Console', short: 'Owner', icon: Activity },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeTab, setActiveTab, onOpenCreateVideo, onOpenAdMaker, autoPilotActive, toggleAutoPilot, currentUser, onLogout, onOpenSettings, onOpenSystemCheck, onOpenPricing,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = currentUser.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const planLabel = currentUser.isOwner ? 'Owner access' : currentUser.isTrial ? 'Trial' : `${currentUser.tier} plan`;
  const item = 'w-full text-left px-3.5 py-2.5 hover:bg-slate-800 flex items-center gap-2.5';

  return (
    <>
      <header className="border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 h-16">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-linear-to-br from-indigo-500 to-indigo-700 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
              OmniPulse<span className="hidden sm:inline text-indigo-300"> Studio</span>
            </span>
          </div>

          <nav className="hidden xl:flex items-center gap-0.5" aria-label="Main">
            {NAV.filter(({ id }) => id !== 'owner' || currentUser.isOwner).map(({ id, label, icon: Icon }) => (
              <button
                key={id} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? 'page' : undefined}
                className={`flex items-center gap-1 px-2 py-2 text-xs font-medium transition-colors border-b-2 ${activeTab === id ? 'border-indigo-400 text-white' : 'border-transparent text-slate-400 hover:text-slate-100'}`}
              >
                <Icon className="w-4 h-4" /><span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={toggleAutoPilot} title="Open Auto-Pilot settings"
              className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${autoPilotActive ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'}`}
            >
              <Radio className={`w-3.5 h-3.5 ${autoPilotActive ? 'animate-pulse' : ''}`} /><span>Auto-Pilot</span>
            </button>

            <button onClick={onOpenCreateVideo} className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors whitespace-nowrap">
              <Video className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Direct Video</span><span className="sm:hidden">Create</span>
            </button>
            <button onClick={onOpenAdMaker} title="Open the dedicated brand advertising studio" className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-fuchsia-100 bg-fuchsia-950 border border-fuchsia-700/60 rounded-lg hover:bg-fuchsia-900 transition-colors whitespace-nowrap">
              <ImagePlus className="w-3.5 h-3.5" /><span className="hidden sm:inline">Ad Maker</span><span className="sm:hidden">Ad</span>
            </button>

            <button onClick={onOpenPricing} title="Plans & billing" className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:border-amber-400 transition-colors">
              <Crown className="w-3.5 h-3.5" /><span className="capitalize">{planLabel}</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Account menu" title={`${currentUser.name} (${currentUser.email})`}
                className="flex items-center group"
              >
                <span className="w-9 h-9 rounded-full bg-indigo-900 text-indigo-100 ring-1 ring-slate-600 group-hover:ring-indigo-400 flex items-center justify-center text-xs font-bold transition-shadow">{initials || 'U'}</span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div role="menu" className="absolute right-0 mt-2 w-60 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 py-1 text-sm overflow-hidden">
                    <div className="px-3.5 py-3 border-b border-slate-800">
                      <p className="font-semibold text-white truncate">{currentUser.name}</p>
                      <p className="text-xs text-slate-400 truncate">{currentUser.email}</p>
                      <p className="text-xs text-amber-300 capitalize mt-1">{planLabel}</p>
                    </div>
                    <button role="menuitem" onClick={() => { setMenuOpen(false); toggleAutoPilot(); }} className={`${item} text-slate-200 sm:hidden`}><Radio className="w-4 h-4" /> Auto-Pilot</button>
                    {currentUser.isOwner && <button role="menuitem" onClick={() => { setMenuOpen(false); onOpenSystemCheck(); }} className={`${item} text-emerald-300`}><Activity className="w-4 h-4" /> System status</button>}
                    <button role="menuitem" onClick={() => { setMenuOpen(false); onOpenSettings(); }} className={`${item} text-slate-200`}><Settings className="w-4 h-4" /> Account settings</button>
                    <button role="menuitem" onClick={() => { setMenuOpen(false); onOpenPricing(); }} className={`${item} text-slate-200`}><CreditCard className="w-4 h-4" /> Plans & billing</button>
                    <button role="menuitem" onClick={() => { setMenuOpen(false); onLogout(); }} className={`${item} text-rose-300`}><LogOut className="w-4 h-4" /> Sign out</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Phone navigation: a bottom tab bar is easier to reach than a scrolling strip */}
      <nav aria-label="Main" className="xl:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 max-w-3xl mx-auto">
          {NAV.filter(({ id }) => id !== 'owner' || currentUser.isOwner).map(({ id, short, icon: Icon }) => (
            <button
              key={id} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium transition-colors ${activeTab === id ? 'text-indigo-300' : 'text-slate-400'}`}
            >
              <Icon className={`w-5 h-5 ${activeTab === id ? 'text-indigo-300' : ''}`} />
              <span>{short}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  );
};
