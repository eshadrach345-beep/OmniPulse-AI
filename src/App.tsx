import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  SocialAccount, 
  NicheCategory, 
  GeneratedVideo, 
  ScheduledPost, 
  ABTestExperiment, 
  PlatformId,
  TrendingTopic,
  NicheAutoPilotSettings
} from './types';
import { AppUser } from './types/auth';
import { Auth, UserDashboardState, emptyDashboard } from './services/authService';
import { api, AUTH_EVENT, ApiError } from './services/api';
import { NICHES } from './data/niches';
import { generateAIVideoScript, analyzeNicheTrends } from './services/aiService';
import { TopNav } from './components/TopNav';
import { AccountsBar } from './components/AccountsBar';
import { DashboardOverview } from './components/DashboardOverview';
import { VideoStudio } from './components/VideoStudio';
import { SeriesStudio } from './components/SeriesStudio';
import { TrendHashtagRadar } from './components/TrendHashtagRadar';
import { PostScheduler } from './components/PostScheduler';
import { ABTestingStudio } from './components/ABTestingStudio';
import { AnalyticsReports } from './components/AnalyticsReports';
import { PricingModal } from './components/PricingModal';
import { AuthScreen } from './components/AuthScreen';
import { Landing } from './components/Landing';
import { LegalView, LegalPage } from './components/Legal';
import { AccountSettings } from './components/AccountSettings';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SystemCheck } from './components/SystemCheck';
import { AutoPilotModal } from './components/AutoPilotModal';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface WorkspaceProps {
  user: AppUser;
  initialDashboard: UserDashboardState;
  onLogout: () => void;
  onUserChange: (u: AppUser) => void;
}

function Workspace({ user: currentUser, initialDashboard, onLogout, onUserChange }: WorkspaceProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'video-studio' | 'series' | 'trends-hashtags' | 'scheduler' | 'ab-testing' | 'analytics'
  >('dashboard');

  // Set when the dashboard asks the Series tab to open one project on its next part.
  const [seriesFocus, setSeriesFocus] = useState<string | null>(null);

  // Modals state
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSystemOpen, setIsSystemOpen] = useState(false);
  const [createRequest, setCreateRequest] = useState<{ open: boolean; prompt: string }>({ open: false, prompt: '' });
  const requestCreateVideo = (prompt = '') => { setActiveTab('video-studio'); setCreateRequest({ open: true, prompt }); };

  // Every navigation lands exactly on the section that was clicked (below the sticky nav), never part-way down the page.
  const contentRef = useRef<HTMLDivElement | null>(null);
  const firstNav = useRef(true);
  useEffect(() => {
    if (firstNav.current) { firstNav.current = false; return; }
    const go = () => {
      const el = contentRef.current;
      if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 72), behavior: 'auto' });
      else window.scrollTo({ top: 0 });
    };
    go();
    requestAnimationFrame(go); // once more after the new tab has rendered
  }, [activeTab]);

  // Surface voice-over failures instead of hiding them
  useEffect(() => {
    const onVoiceError = (e: Event) => showToast(`Voice-over unavailable: ${(e as CustomEvent).detail}`);
    window.addEventListener('omnipulse:voice-error', onVoiceError);
    return () => window.removeEventListener('omnipulse:voice-error', onVoiceError);
  }, []);
  const [usage, setUsage] = useState<{ videosUsed: number; videosLimit: number; secondsUsed: number; secondsLimit: number; topupSeconds: number } | null>(null);
  const [isAutoPilotModalOpen, setIsAutoPilotModalOpen] = useState(false);

  // Auto-Pilot Advanced Niche Settings
  const [autoPilotSettings, setAutoPilotSettings] = useState<NicheAutoPilotSettings>({
    enabled: true,
    frequency: 'daily',
    videosPerBatch: 2,
    preferredStyle: 'cartoon_3d',
    customTimeSlot: '18:30',
    targetPlatforms: ['tiktok', 'youtube', 'instagram'],
    autoResearchTrending: true,
  });
  const [isExecutingAutonomousRun, setIsExecutingAutonomousRun] = useState(false);

  // User's Isolated Dashboard Data
  const [accounts, setAccounts] = useState<SocialAccount[]>(initialDashboard.accounts);
  const [niches] = useState<NicheCategory[]>(NICHES);
  const [research, setResearch] = useState(initialDashboard.research);
  const [activeNiche, setActiveNiche] = useState<NicheCategory>(() => {
    const base = NICHES.find(n => n.id === initialDashboard.activeNicheId) || NICHES[0];
    const cached = initialDashboard.research[base.id];
    return cached ? { ...base, ...cached } : base;
  });

  // Cache live research so it persists between sessions
  useEffect(() => {
    if (!activeNiche.trendingTopics.length) return;
    setResearch(prev => prev[activeNiche.id]?.trendingTopics === activeNiche.trendingTopics ? prev : ({
      ...prev,
      [activeNiche.id]: {
        trendingTopics: activeNiche.trendingTopics, trendingCreators: activeNiche.trendingCreators || [], viralHashtags: activeNiche.viralHashtags,
        suggestedKeywords: activeNiche.suggestedKeywords, bestPractices: activeNiche.bestPractices,
        researchSources: activeNiche.researchSources, researchGrounded: activeNiche.researchGrounded, fetchedAt: Date.now(),
      },
    }));
  }, [activeNiche]);

  const selectNiche = (n: NicheCategory) => {
    const cached = research[n.id];
    setActiveNiche(cached && !n.trendingTopics.length ? { ...n, ...cached } : n);
  };
  const [videos, setVideos] = useState<GeneratedVideo[]>(initialDashboard.videos);
  const [selectedVideoId, setSelectedVideoId] = useState<string>(initialDashboard.videos[0]?.id || '');
  const [posts, setPosts] = useState<ScheduledPost[]>(initialDashboard.posts);
  const [experiments, setExperiments] = useState<ABTestExperiment[]>(initialDashboard.experiments);

  // Auto-Pilot & Instant publishing states
  const [autoPilotActive, setAutoPilotActive] = useState(true);
  const [isPublishingPostId, setIsPublishingPostId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 5000);
  };

  // Persist dashboard to the server (debounced)
  const firstRender = useRef(true);
  const saveTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      Auth.saveDashboard({
        accounts, posts, videos, experiments, research, activeNicheId: activeNiche.id,
      }).catch(() => undefined);
    }, 1200);
  }, [accounts, posts, videos, experiments, research, activeNiche.id]);

  const refreshUsage = useCallback(() => { Auth.usage().then(setUsage).catch(() => undefined); }, []);
  useEffect(() => { refreshUsage(); }, [videos.length, refreshUsage]);

  // ---------- Social networks: direct connect, sync, disconnect ----------
  type SocialState = { platform: PlatformId; connected: boolean; handle: string; avatar: string; followers: number; configured: boolean; publishable: boolean; connectedAt: string | null };
  const syncChannels = async (silent = true) => {
    try {
      const r = await api.get<{ accounts: SocialState[] }>('/social/accounts');
      setAccounts(prev => prev.map(a => {
        const s = r.accounts.find(x => x.platform === a.id);
        if (!s) return a;
        return { ...a, connected: s.connected, handle: s.connected ? s.handle : '', avatarUrl: s.avatar || '', followers: s.followers || 0, configured: s.configured, publishable: s.publishable, connectedAt: s.connectedAt || undefined };
      }));
    } catch (e) {
      if (!silent) showToast(e instanceof ApiError ? e.message : 'Could not load your connected accounts.');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('social');
    if (result) {
      window.history.replaceState({}, '', window.location.pathname);
      if (result === 'connected') showToast('Connected! Loading your account...');
      else showToast(params.get('reason') || 'The connection was not completed.');
    }
    syncChannels(true);
  }, []);

  // Connect opens the network's own login + permission screen in a popup; if popups are blocked we redirect the whole page instead.
  const handleRequestOAuth = (account?: SocialAccount) => {
    const target = account || accounts.find(a => !a.connected && a.configured !== false) || accounts[0];
    if (!target) return;
    if (target.configured === false) { showToast(`${target.name} isn't switched on for this site yet. The site owner needs to add its developer keys.`); return; }
    const url = `/api/social/connect?platform=${target.id}`;
    const w = 520, h = 720;
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
    const popup = window.open(url, 'omnipulse-connect', `width=${w},height=${h},left=${left},top=${top}`);
    if (!popup) { window.location.href = url; return; }
    showToast(`Sign in to ${target.name} in the window that just opened.`);
    // The publishing service does not call us back, so check for the new account while the window is open.
    const started = Date.now();
    const timer = window.setInterval(async () => {
      try {
        const r = await api.post<{ added: number }>('/social/sync');
        if (r.added > 0) { await syncChannels(true); showToast(`${target.name} connected.`); window.clearInterval(timer); return; }
      } catch { /* keep trying */ }
      if (Date.now() - started > 4 * 60_000 || (popup.closed && Date.now() - started > 8000)) {
        window.clearInterval(timer);
        try { await api.post('/social/sync'); await syncChannels(true); } catch { /* ignore */ }
      }
    }, 4000);
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'omnipulse:social') return;
      if (e.data.result === 'connected') { showToast('Connected! Loading your account...'); syncChannels(false); }
      else showToast(e.data.reason || 'The connection was not completed.');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleToggleAccountConnect = async (platformId: PlatformId) => {
    const name = accounts.find(a => a.id === platformId)?.name || 'this account';
    if (!window.confirm(`Disconnect ${name}? OmniPulse will stop publishing there. Posts already published are not affected.`)) return;
    try {
      await api.post('/social/disconnect', { platform: platformId });
      await syncChannels();
      showToast(`${name} disconnected.`);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : `Could not disconnect ${name}.`);
    }
  };

  // ---------- Publishing straight to each network ----------
  const updatePost = (id: string, patch: Partial<ScheduledPost>) =>
    setPosts(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));

  const dispatchPost = async (post: ScheduledPost, mode: 'now' | 'queue' | 'scheduled') => {
    const platforms = accounts.filter(a => a.connected && post.platforms.includes(a.id)).map(a => a.id);
    if (!platforms.length) {
      updatePost(post.id, { status: 'draft' });
      showToast('Saved as draft. Connect at least one of the selected accounts to publish it.');
      return;
    }
    const video = post.videoRefId ? videos.find(v => v.id === post.videoRefId) : undefined;
    const videoUrl = video?.videoUrl && /^https:\/\//.test(video.videoUrl) ? video.videoUrl : undefined;
    const when = new Date(post.scheduledTime).getTime();
    const effectiveMode = mode === 'scheduled' && !(when > Date.now() + 60_000) ? 'now' : mode === 'queue' ? 'now' : mode;
    setIsPublishingPostId(post.id);
    try {
      const res = await api.post<{ results: { ok: boolean; name?: string; error?: string; postId?: string; platform?: string; scheduled?: boolean }[] }>('/social/publish', {
        title: post.title,
        text: [post.caption, post.hashtags.join(' ')].filter(Boolean).join('\n\n'),
        videoUrl, platforms, mode: effectiveMode, dueAt: post.scheduledTime,
      });
      const ok = res.results.filter(r => r.ok);
      const bad = res.results.filter(r => !r.ok);
      const scheduled = ok.some(r => r.scheduled);
      updatePost(post.id, {
        status: ok.length ? (scheduled ? 'scheduled' : 'published') : 'draft',
        publishedPosts: ok.filter(r => r.postId).map(r => ({ postId: r.postId as string, platform: r.platform as string, name: r.name || '' })),
      });
      if (ok.length && !bad.length) showToast(scheduled ? `Scheduled for ${ok.map(r => r.name).join(', ')}.` : `Published to ${ok.map(r => r.name).join(', ')}.`);
      else if (ok.length) showToast(`Sent to ${ok.length} account(s). ${bad[0].name} failed: ${bad[0].error}`);
      else showToast(`${bad[0]?.name || 'The network'} rejected the post: ${bad[0]?.error || 'unknown error'}`);
    } catch (e) {
      updatePost(post.id, { status: 'draft' });
      showToast(e instanceof ApiError ? e.message : 'Could not publish. The post was saved as a draft.');
    } finally {
      setIsPublishingPostId(null);
    }
  };

  /** Adds a post to the list and publishes or schedules it on the connected networks. */
  const addPost = (post: ScheduledPost) => {
    setPosts(prev => [{ ...post, status: 'draft' }, ...prev]);
    return dispatchPost(post, 'scheduled');
  };

  const handleUpdateAccount = (updated: SocialAccount) => {
    setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a));
    showToast(`Updated account settings for ${updated.name}`);
  };

  // Video studio handlers
  const handleSaveNewVideo = (video: GeneratedVideo) => {
    setVideos(prev => prev.some(existing => existing.id === video.id)
      ? prev.map(existing => existing.id === video.id ? video : existing)
      : [video, ...prev]);
    setSelectedVideoId(video.id);
    showToast(`Video "${video.title}" saved successfully.`);
  };

  const handleScheduleVideoDirect = (video: GeneratedVideo) => {
    const newPost: ScheduledPost = {
      id: `post-${Date.now()}`,
      title: `${video.title} (Short-Form Video)`,
      caption: `🚀 ${video.scenes[0]?.narration || 'Check out our latest release!'} Drop your thoughts below 👇`,
      hashtags: activeNiche.viralHashtags.viral.slice(0, 4).map(h => h.tag),
      platforms: video.targetPlatforms,
      mediaType: 'video',
      videoRefId: video.id,
      mediaUrl: video.thumbnailUrl,
      scheduledTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: 'scheduled',
      autoPeakOptimized: true,
    };

    addPost(newPost);
    setActiveTab('scheduler');
  };

  // Topic to Video / Post conversion
  const handleCreateVideoFromTopic = (topic: TrendingTopic) => {
    requestCreateVideo(`${topic.title}. ${topic.contentAngle}`);
  };

  const handleCreatePostFromTopic = (topic: TrendingTopic, hashtags: string[]) => {
    const newPost: ScheduledPost = {
      id: `post-trend-${Date.now()}`,
      title: topic.title,
      caption: `🔥 ${topic.viralHooks[0]} \n\n${topic.contentAngle} \n\nWhat are your thoughts on this trend?`,
      hashtags: hashtags.slice(0, 5),
      platforms: accounts.filter(a => a.connected).map(a => a.id),
      mediaType: 'video',
      scheduledTime: new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
      status: 'scheduled',
      autoPeakOptimized: true,
    };

    addPost(newPost);
    setActiveTab('scheduler');
  };

  // Post Scheduler Handlers
  const handleSavePost = (post: ScheduledPost) => {
    if (post.status === 'draft') { setPosts(prev => [post, ...prev]); showToast('Draft saved.'); return; }
    addPost(post);
  };

  const handleDeletePost = (id: string) => {
    setPosts(prev => prev.filter(p => p.id !== id));
    showToast('Post removed from queue.');
  };

  // Immediate publish
  const handleInstantPublish = (post: ScheduledPost) => {
    showToast(`Publishing to ${post.platforms.join(', ')}...`);
    dispatchPost(post, 'now');
  };

  // A/B testing handlers (real: both variants are published to the network, results come from the network or manual entry)
  const handleSaveExperiment = (exp: ABTestExperiment) => {
    setExperiments(prev => [exp, ...prev]);
    showToast('A/B test is live. Check back after both posts have been published.');
  };

  const handleUpdateExperiment = (exp: ABTestExperiment) => {
    setExperiments(prev => prev.map(e => (e.id === exp.id ? exp : e)));
  };

  const handleLaunchExperiment = async (exp: ABTestExperiment, hoursApart: number): Promise<ABTestExperiment | null> => {
    const account = accounts.find(a => a.id === exp.targetPlatform && a.connected);
    if (!account) { showToast(`Connect ${exp.targetPlatform} first.`); return null; }
    const video = exp.videoRefId ? videos.find(v => v.id === exp.videoRefId) : undefined;
    const videoUrl = video?.videoUrl && /^https:\/\//.test(video.videoUrl) ? video.videoUrl : undefined;
    const send = async (v: ABTestExperiment['variantA'], mode: 'now' | 'scheduled', dueAt?: string) => {
      const r = await api.post<{ results: { ok: boolean; postId?: string; error?: string }[] }>('/social/publish', {
        title: exp.name, text: `${v.hook}\n\n${v.caption}`, videoUrl, platforms: [account.id], mode, dueAt,
      });
      if (!r.results[0]?.ok) throw new Error(r.results[0]?.error || `${account.name} rejected the post.`);
      return r.results[0].postId as string | undefined;
    };
    try {
      const a = await send(exp.variantA, 'now');
      const b = await send(exp.variantB, 'scheduled', new Date(Date.now() + hoursApart * 3600_000).toISOString());
      return { ...exp, status: 'running', variantA: { ...exp.variantA, postId: a, channelId: account.id }, variantB: { ...exp.variantB, postId: b, channelId: account.id } };
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not publish the A/B variants.');
      return null;
    }
  };

  const handleDeployWinnerToSchedule = (exp: ABTestExperiment, winningVariant: 'A' | 'B') => {
    const variant = winningVariant === 'A' ? exp.variantA : exp.variantB;
    addPost({
      id: `post-ab-${Date.now()}`,
      title: `${exp.name} (winning variant ${winningVariant})`,
      caption: `${variant.hook}\n\n${variant.caption}`,
      hashtags: activeNiche.viralHashtags.viral.slice(0, 4).map(h => h.tag),
      platforms: [exp.targetPlatform],
      mediaType: 'video',
      videoRefId: exp.videoRefId,
      scheduledTime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      status: 'scheduled',
      autoPeakOptimized: false,
    });
    setActiveTab('scheduler');
  };

  const handleSendOutrankToScheduler = (item: { title: string; caption: string; hook: string }) => {
    const newPost: ScheduledPost = {
      id: `post-outrank-${Date.now()}`,
      title: item.title,
      caption: item.caption,
      hashtags: activeNiche.viralHashtags.viral.slice(0, 4).map(h => h.tag),
      platforms: ['tiktok', 'youtube', 'instagram', 'x'],
      mediaType: 'video',
      scheduledTime: new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString(),
      status: 'scheduled',
      autoPeakOptimized: true,
    };

    addPost(newPost);
    setActiveTab('scheduler');
  };

  const handleSendOutrankToVideoStudio = (hook: string) => {
    requestCreateVideo(hook);
  };

  // Autonomous Niche Video Generation & Scheduled Dispatch
  const handleTriggerImmediateAutonomousRun = async (settings: NicheAutoPilotSettings) => {
    setIsExecutingAutonomousRun(true);
    showToast(`Researching top breakout trends in "${activeNiche.name}"...`);

    try {
      let niche = activeNiche;
      if (!niche.trendingTopics.length) {
        const r = await analyzeNicheTrends(niche.name);
        niche = { ...niche, ...r };
        setActiveNiche(niche);
      }

      if (!niche.trendingTopics.length) throw new Error('No trending topics were found for this niche. Please try again.');
      const count = Math.min(Math.max(settings.videosPerBatch || 2, 1), 5);
      let made = 0;
      try {
        for (let i = 0; i < count; i++) {
          const topicItem = niche.trendingTopics[i % niche.trendingTopics.length];
          const videoConcept = `${topicItem.title} - ${topicItem.viralHooks[0] || topicItem.contentAngle}`;
          const video = await generateAIVideoScript({
            idea: videoConcept,
            videoType: settings.preferredStyle || 'cartoon_3d',
            aspectRatio: '9:16',
            targetPlatforms: settings.targetPlatforms || ['tiktok', 'youtube', 'instagram'],
            nicheName: activeNiche.name,
            aiDirectorEngine: 'dynamic_viral',
            grokHookStyle: 'viral_breakout',
          });
          // Keep every finished video straight away, so one failure later never loses paid work
          setVideos(prev => [video, ...prev]);
          if (i === 0) setSelectedVideoId(video.id);
          made++;

          const dispatchDate = new Date();
          dispatchDate.setDate(dispatchDate.getDate() + (i + 1));
          const [hours, minutes] = (settings.customTimeSlot || '18:30').split(':').map(Number);
          if (!isNaN(hours)) dispatchDate.setHours(hours, minutes || 0, 0, 0);

          await addPost({
            id: `post-auto-${Date.now()}-${i}`,
            title: `${video.title} [Auto-Pilot Batch #${i + 1}]`,
            caption: `🚀 ${video.scenes[0]?.narration || topicItem.viralHooks[0]} \n\nAutomated niche dispatch for ${activeNiche.name}. Drop your questions below! 👇`,
            hashtags: activeNiche.viralHashtags.viral.slice(0, 4).map(h => h.tag),
            platforms: settings.targetPlatforms || ['tiktok', 'youtube', 'instagram'],
            mediaType: 'video',
            videoRefId: video.id,
            mediaUrl: video.thumbnailUrl,
            scheduledTime: dispatchDate.toISOString(),
            status: 'scheduled',
            autoPeakOptimized: true,
          });
        }
      } catch (err) {
        if (made > 0) {
          showToast(`Auto-Pilot made ${made} of ${count} videos before stopping: ${err instanceof Error ? err.message : 'an error occurred'}`);
          return;
        }
        throw err;
      }

      setAutoPilotSettings(prev => ({
        ...prev,
        ...settings,
        lastAutonomousRun: new Date().toISOString(),
      }));

      showToast(`Auto-Pilot made ${made} ${settings.preferredStyle.replace(/_/g, ' ')} videos for ${settings.targetPlatforms.join(', ')}.`);
    } catch (err) {
      console.error('Autonomous run error:', err);
      showToast(err instanceof Error ? err.message : 'Auto-Pilot run failed. Please try again.');
    } finally {
      setIsExecutingAutonomousRun(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col bg-slate-950 text-slate-100">
      {/* Top Bar Navigation with Auth & Plan Triggers */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenCreateVideo={() => requestCreateVideo()}
        onOpenSchedulePost={() => setActiveTab('scheduler')}
        autoPilotActive={autoPilotActive}
        toggleAutoPilot={() => setIsAutoPilotModalOpen(true)}
        currentUser={currentUser}
        onLogout={onLogout}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSystemCheck={() => setIsSystemOpen(true)}
        onOpenPricing={() => setIsPricingOpen(true)}
      />

      {/* Main Workspace Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 pb-28 lg:pb-10 space-y-6">
        {/* Connected Social Accounts Bar with OAuth Login Trigger */}
        {activeTab === 'dashboard' && (
          <AccountsBar
            accounts={accounts}
            onToggleConnect={handleToggleAccountConnect}
            onUpdateAccount={handleUpdateAccount}
            onRequestConnect={handleRequestOAuth}
          />
        )}

        <div ref={contentRef} className="space-y-6">

        {/* Dynamic Tab Views */}
        {activeTab === 'dashboard' && (
          <DashboardOverview
            accounts={accounts}
            posts={posts}
            videos={videos}
            activeNiche={activeNiche}
            experiments={experiments}
            hasResearch={Object.keys(research).length > 0}
            usage={usage}
            onConnect={handleRequestOAuth}
            onOpenAutoPilot={() => setIsAutoPilotModalOpen(true)}
            onNavigate={(tab) => setActiveTab(tab)}
            onContinueSeries={(id) => { setSeriesFocus(id); setActiveTab('series'); }}
            onSelectVideoForStudio={(id) => {
              setSelectedVideoId(id);
              setActiveTab('video-studio');
            }}
            onInstantPublishPost={handleInstantPublish}
            isPublishingPostId={isPublishingPostId}
          />
        )}

        {activeTab === 'video-studio' && (
          <VideoStudio
            videos={videos}
            niches={niches}
            activeNiche={activeNiche}
            selectedVideoId={selectedVideoId}
            secondsLeft={usage ? Math.max(0, usage.secondsLimit - usage.secondsUsed) + (usage.topupSeconds || 0) : null}
            onSaveNewVideo={handleSaveNewVideo}
            onScheduleVideoDirect={handleScheduleVideoDirect}
            initialCreateRequested={createRequest.open}
            prefillPrompt={createRequest.prompt}
            onResetCreateRequested={() => setCreateRequest({ open: false, prompt: '' })}
          />
        )}

        {activeTab === 'series' && (
          <SeriesStudio
            nicheName={activeNiche?.name || 'general audience'}
            secondsLeft={usage ? Math.max(0, usage.secondsLimit - usage.secondsUsed) + (usage.topupSeconds || 0) : null}
            onUsageChanged={refreshUsage}
            focusProjectId={seriesFocus}
            onFocusHandled={() => setSeriesFocus(null)}
          />
        )}

        {activeTab === 'trends-hashtags' && (
          <TrendHashtagRadar
            niches={niches}
            activeNiche={activeNiche}
            userAccounts={accounts}
            onSelectNiche={(n) => {
              selectNiche(n);
            }}
            onCreateVideoFromTopic={handleCreateVideoFromTopic}
            onCreatePostFromTopic={handleCreatePostFromTopic}
            onSendOutrankToScheduler={handleSendOutrankToScheduler}
            onSendOutrankToVideoStudio={handleSendOutrankToVideoStudio}
          />
        )}

        {activeTab === 'scheduler' && (
          <PostScheduler
            posts={posts}
            accounts={accounts}
            videos={videos}
            activeNiche={activeNiche}
            onSavePost={handleSavePost}
            onDeletePost={handleDeletePost}
            onInstantPublish={handleInstantPublish}
            isPublishingPostId={isPublishingPostId}
            onRequestConnect={handleRequestOAuth}
          />
        )}

        {activeTab === 'ab-testing' && (
          <ABTestingStudio
            experiments={experiments}
            accounts={accounts}
            videos={videos}
            activeNiche={activeNiche}
            onSaveExperiment={handleSaveExperiment}
            onUpdateExperiment={handleUpdateExperiment}
            onLaunch={handleLaunchExperiment}
            onDeployWinnerToSchedule={handleDeployWinnerToSchedule}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsReports accounts={accounts} posts={posts} />
        )}
        </div>
      </main>

      {isSystemOpen && <SystemCheck onClose={() => setIsSystemOpen(false)} />}

      {isSettingsOpen && (
        <AccountSettings
          user={currentUser}
          onClose={() => setIsSettingsOpen(false)}
          onUserChange={onUserChange}
          onDeleted={onLogout}
          onOpenPlans={() => setIsPricingOpen(true)}
        />
      )}

      {/* Plans & billing */}
      <PricingModal
        currentUser={currentUser}
        isOpen={isPricingOpen}
        onClose={() => setIsPricingOpen(false)}
        onLogout={onLogout}
        onUserChange={onUserChange}
      />

      {/* Auto-Pilot Niche Schedule & Video Research Modal */}
      <AutoPilotModal
        isOpen={isAutoPilotModalOpen}
        onClose={() => setIsAutoPilotModalOpen(false)}
        activeNiche={activeNiche}
        niches={niches}
        onSelectNiche={(niche) => {
          setActiveNiche(niche);
          showToast(`Active niche updated to "${niche.name}"!`);
        }}
        currentSettings={autoPilotSettings}
        onSaveSettings={(s) => {
          setAutoPilotSettings(s);
          setAutoPilotActive(s.enabled);
          showToast('Autonomous Auto-Pilot schedule saved!');
        }}
        onTriggerImmediateAutonomousRun={handleTriggerImmediateAutonomousRun}
        isExecutingAutonomousRun={isExecutingAutonomousRun}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div role="status" aria-live="polite" className="fixed bottom-24 lg:bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 bg-slate-900 border border-indigo-400/60 text-white px-4 py-3 rounded-xl shadow-2xl flex items-start gap-2.5 text-sm font-medium animate-toast-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

/**
 * App shell: session bootstrap → sign in → subscription paywall → workspace.
 * Nothing in the workspace renders (or loads data) until the user is verified AND subscribed.
 */
export default function App() {
  // When this page is the popup the social network redirected back to, hand the result to the app window and close.
  const [popupResult] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return window.opener && p.get('social') ? { result: p.get('social') as string, reason: p.get('reason') || '' } : null;
  });
  useEffect(() => {
    if (!popupResult) return;
    try { window.opener?.postMessage({ type: 'omnipulse:social', ...popupResult }, window.location.origin); } catch { /* opener gone */ }
    setTimeout(() => window.close(), 400);
  }, [popupResult]);

  const [user, setUser] = useState<AppUser | null>(null);
  const [dashboard, setDashboard] = useState<UserDashboardState | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootMessage, setBootMessage] = useState('Loading your workspace...');
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<'landing' | 'signin' | 'signup'>('landing');
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => { setHash(window.location.hash); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const legalPage = (['terms', 'privacy', 'refunds'] as LegalPage[]).find(p => window.location.pathname === `/${p}` || hash === `#/${p}`);

  // 1) Restore session and, if returning from checkout, confirm the payment.
  useEffect(() => {
    (async () => {
      let me = await Auth.me();
      const params = new URLSearchParams(window.location.search);
      const txRef = params.get('tx_ref'), txId = params.get('transaction_id'), payStatus = params.get('status') || '';
      if (me && params.get('billing') === 'callback' && txRef && txId) {
        setBootMessage('Confirming your payment...');
        try {
          const r = await Auth.verifyPayment({ status: payStatus, tx_ref: txRef, transaction_id: txId });
          me = r.user;
          if (r.status === 'pending') setNotice('Your payment is still being confirmed. This usually takes under a minute — refresh to check.');
          else if (r.status === 'denied') setNotice(r.message || 'We could not start your trial.');
          else if (r.status !== 'success') setNotice('Your payment was not completed. You have not been charged.');
        } catch (e) {
          setNotice(e instanceof ApiError ? e.message : 'We could not confirm your payment yet. If you were charged, access will unlock within a minute — refresh to check.');
        }
      }
      if (params.get('billing')) window.history.replaceState({}, '', window.location.pathname);
      setUser(me);
      setBooting(false);
    })();
  }, []);

  // 2) Load the saved dashboard once the user has an active subscription.
  useEffect(() => {
    if (!user?.hasAccess) { setDashboard(null); return; }
    let cancelled = false;
    Auth.loadDashboard().then(d => { if (!cancelled) setDashboard(d); }).catch(() => { if (!cancelled) setDashboard(emptyDashboard()); });
    return () => { cancelled = true; };
  }, [user?.id, user?.hasAccess]);

  // 3) React to the server ending the session or requiring a subscription.
  useEffect(() => {
    const onAuthEvent = async (e: Event) => {
      const kind = (e as CustomEvent).detail;
      if (kind === 'signed-out') { setUser(null); setNotice('Your session expired. Please sign in again.'); }
      if (kind === 'subscription-required') setUser(await Auth.me());
    };
    window.addEventListener(AUTH_EVENT, onAuthEvent);
    return () => window.removeEventListener(AUTH_EVENT, onAuthEvent);
  }, []);

  const logout = async () => {
    await Auth.logout();
    setUser(null); setDashboard(null); setNotice(null); setView('landing');
  };

  const Splash = ({ message }: { message: string }) => (
    <div className="min-h-full flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-400 text-sm">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
      <span>{message}</span>
    </div>
  );

  if (popupResult) return <div className="min-h-full flex items-center justify-center bg-slate-950 text-slate-300 text-sm p-6 text-center">{popupResult.result === 'connected' ? 'Connected! You can close this window.' : (popupResult.reason || 'The connection was not completed.') + ' You can close this window.'}</div>;
  if (legalPage) return <LegalView page={legalPage} onBack={() => { if (window.location.pathname === '/') window.location.hash = ''; else window.location.assign('/'); }} />;
  if (booting) return <Splash message={bootMessage} />;
  if (!user) {
    if (view === 'landing' && !notice) return <Landing onGetStarted={(m) => setView(m)} />;
    return <AuthScreen key={view} initialMode={view === 'signup' ? 'signup' : 'signin'} onAuthed={(u) => { setUser(u); setNotice(null); }} notice={notice} onBack={() => { setNotice(null); setView('landing'); }} />;
  }
  if (!user.hasAccess) return <PricingModal currentUser={user} isOpen blocking onLogout={logout} notice={notice} />;
  if (!dashboard) return <Splash message="Loading your workspace..." />;
  return (
    <ErrorBoundary>
      <Workspace key={user.id} user={user} initialDashboard={dashboard} onLogout={logout} onUserChange={setUser} />
    </ErrorBoundary>
  );
}
