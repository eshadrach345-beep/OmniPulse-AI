import { placeholderThumb } from '../services/aiService';
import React, { useState } from 'react';
import { 
  ScheduledPost, 
  PlatformId, 
  SocialAccount, 
  GeneratedVideo,
  NicheCategory
} from '../types';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Send, 
  Sparkles, 
  CheckCircle2, 
  Trash2, 
  Eye, 
  Share2, 
  Video, 
  Image as ImageIcon, 
  Layers, 
  ChevronLeft, 
  ChevronRight, 
  Smartphone,
  ExternalLink,
  Zap,
  Check
} from 'lucide-react';

interface PostSchedulerProps {
  posts: ScheduledPost[];
  accounts: SocialAccount[];
  videos: GeneratedVideo[];
  activeNiche: NicheCategory;
  onSavePost: (post: ScheduledPost) => void;
  onDeletePost: (id: string) => void;
  onInstantPublish: (post: ScheduledPost) => void;
  isPublishingPostId?: string | null;
  onRequestConnect?: (account: SocialAccount) => void;
}

export const PostScheduler: React.FC<PostSchedulerProps> = ({
  posts,
  accounts,
  videos,
  activeNiche,
  onSavePost,
  onDeletePost,
  onInstantPublish,
  isPublishingPostId,
  onRequestConnect,
}) => {
  const [viewMode, setViewMode] = useState<'queue' | 'calendar'>('queue');
  const [isComposing, setIsComposing] = useState(false);

  // Compose form state
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [hashtagsInput, setHashtagsInput] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(['tiktok', 'youtube', 'instagram']);
  const [mediaType, setMediaType] = useState<'video' | 'image'>('video');
  const [selectedVideoId, setSelectedVideoId] = useState<string>(videos[0]?.id || '');
  const [scheduledDateTime, setScheduledDateTime] = useState('2026-10-07T18:30');
  const [autoPeakOptimized, setAutoPeakOptimized] = useState(true);

  const togglePlatform = (p: PlatformId) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter(item => item !== p));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  // Auto-optimize posting time based on peak audience engagement of selected accounts
  const applyPeakActivityTime = () => {
    // Find best peak time for selected platforms (default e.g. 7:45 PM tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(19, 45, 0, 0); // 7:45 PM
    
    // Format for input datetime-local
    const pad = (n: number) => n < 10 ? '0' + n : n;
    const str = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth()+1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;
    
    setScheduledDateTime(str);
    setAutoPeakOptimized(true);
  };

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !caption.trim()) return;

    const tags = hashtagsInput
      .split(/[\s,]+/)
      .filter(t => t.trim().length > 0)
      .map(t => t.startsWith('#') ? t : `#${t}`);

    const newPost: ScheduledPost = {
      id: `post-${Date.now()}`,
      title: title.trim(),
      caption: caption.trim(),
      hashtags: tags.length > 0 ? tags : activeNiche.viralHashtags.viral.slice(0, 4).map(h => h.tag),
      platforms: selectedPlatforms,
      mediaType,
      videoRefId: mediaType === 'video' ? selectedVideoId : undefined,
      mediaUrl: mediaType === 'video' 
        ? videos.find(v => v.id === selectedVideoId)?.thumbnailUrl || placeholderThumb('Post')
        : placeholderThumb('Post'),
      scheduledTime: new Date(scheduledDateTime).toISOString(),
      status: 'scheduled',
      autoPeakOptimized,
    };

    onSavePost(newPost);
    setIsComposing(false);
    // Reset form
    setTitle('');
    setCaption('');
    setHashtagsInput('');
  };

  const selectedVideoObj = videos.find(v => v.id === selectedVideoId) || videos[0];

  return (
    <div className="space-y-6">
      {/* Scheduler Header & Action Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-5 h-5 text-indigo-400" />
              <h1 className="text-lg font-bold text-white tracking-tight">
                Multi-Platform Post Scheduler & Auto-Upload Engine
              </h1>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-emerald-400 font-mono">Auto-Pilot Ready</span>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              Distribute short-form videos and multi-channel posts simultaneously to TikTok, YouTube, Instagram, X, and LinkedIn at peak audience activity windows.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-lg text-xs">
              <button
                onClick={() => setViewMode('queue')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  viewMode === 'queue' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Queue List ({posts.length})
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  viewMode === 'calendar' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Weekly Calendar
              </button>
            </div>

            <button
              onClick={() => setIsComposing(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Schedule New Post</span>
            </button>
          </div>
        </div>
      </div>

      {/* Queue View */}
      {viewMode === 'queue' && (
        <div className="space-y-4">
          {posts.map(post => {
            const isPublishing = isPublishingPostId === post.id;
            const isPublished = post.status === 'published';
            const scheduledDate = new Date(post.scheduledTime);

            return (
              <div
                key={post.id}
                className={`bg-slate-900/70 border rounded-xl p-4 sm:p-5 transition-all shadow-sm ${
                  isPublished 
                    ? 'border-emerald-800/40 bg-slate-900/50' 
                    : isPublishing
                    ? 'border-indigo-500 shadow-indigo-500/20'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Left: Media Thumbnail + Details */}
                  <div className="flex items-start gap-4">
                    {post.mediaUrl ? (
                      <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg overflow-hidden bg-black shrink-0 border border-slate-800 relative group">
                        <img
                          src={post.mediaUrl}
                          alt={post.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-[9px] font-mono text-white">
                          {post.mediaType === 'video' ? 'VIDEO' : 'IMG'}
                        </div>
                      </div>
                    ) : (
                      <div className="w-16 h-24 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500">
                        <Calendar className="w-6 h-6" />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                          isPublished
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : isPublishing
                            ? 'bg-indigo-500/20 text-indigo-300 animate-pulse'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        }`}>
                          {isPublishing ? 'Uploading to Channels...' : post.status}
                        </span>

                        {post.autoPeakOptimized && (
                          <span className="text-[10px] font-medium text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                            Suggested time
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm sm:text-base font-bold text-white">
                        {post.title}
                      </h3>

                      <p className="text-xs text-slate-300 leading-relaxed max-w-2xl line-clamp-2">
                        {post.caption}
                      </p>

                      {/* Hashtags */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {post.hashtags.map((tag, tIdx) => (
                          <span key={tIdx} className="text-[11px] text-indigo-400 font-mono">
                            {tag}
                          </span>
                        ))}
                      </div>

                      {/* Target Platforms */}
                      <div className="flex items-center gap-1.5 pt-2">
                        <span className="text-[11px] text-slate-400">Target Channels:</span>
                        {post.platforms.map(p => (
                          <span
                            key={p}
                            className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 text-[10px] font-mono uppercase"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Timing & Actions */}
                  <div className="flex flex-row md:flex-col items-end justify-between md:justify-start gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                    <div className="text-right">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Scheduled For:</span>
                      </div>
                      <div className="text-xs font-mono font-semibold text-slate-200 mt-0.5">
                        {scheduledDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at{' '}
                        {scheduledDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                    {/* Published Post Metrics or Publish Now Action */}
                    {isPublished && post.metrics ? (
                      <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 text-right space-y-1">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Live Reach</span>
                        <div className="text-xs font-mono font-bold text-emerald-400 tabular-nums">
                          {post.metrics.views.toLocaleString()} Views
                        </div>
                        <div className="text-[10px] text-slate-400 tabular-nums">
                          {post.metrics.likes.toLocaleString()} Likes · {post.metrics.shares.toLocaleString()} Shares
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onInstantPublish(post)}
                          disabled={isPublishing}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                          title="Publish now"
                        >
                          <Send className="w-3 h-3" />
                          <span>{isPublishing ? 'Uploading...' : 'Publish Now'}</span>
                        </button>

                        <button
                          onClick={() => onDeletePost(post.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Remove scheduled post"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
            <h2 className="text-sm font-bold text-white">
              Weekly Multi-Platform Content Distribution Calendar
            </h2>
            <span className="text-xs text-slate-400">
              Typical high-engagement windows (general guidance, not based on your audience data)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-3">
            {['Mon (Oct 5)', 'Tue (Oct 6)', 'Wed (Oct 7)', 'Thu (Oct 8)', 'Fri (Oct 9)', 'Sat (Oct 10)', 'Sun (Oct 11)'].map((day, dIdx) => {
              // Filter posts scheduled on this relative day
              const dayPosts = posts.filter(p => {
                const pDate = new Date(p.scheduledTime);
                return pDate.getDate() === (5 + dIdx);
              });

              return (
                <div
                  key={day}
                  className="bg-slate-950/70 border border-slate-850 rounded-lg p-3 min-h-[160px] flex flex-col justify-between"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-300 pb-1.5 border-b border-slate-900 mb-2 flex items-center justify-between">
                      <span>{day}</span>
                      <span className="text-[10px] text-indigo-400 font-mono">
                        {dIdx === 1 || dIdx === 3 ? '🔥 Peak Day' : ''}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {dayPosts.map(p => (
                        <div
                          key={p.id}
                          className="p-1.5 rounded bg-slate-900 border border-slate-800 text-[11px] hover:border-indigo-500 transition-colors"
                        >
                          <p className="font-semibold text-slate-100 truncate">{p.title}</p>
                          <div className="flex items-center justify-between text-[9px] text-slate-400 mt-1">
                            <span className="font-mono">{new Date(p.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="uppercase text-indigo-300">{p.platforms[0]}</span>
                          </div>
                        </div>
                      ))}

                      {dayPosts.length === 0 && (
                        <div className="text-[10px] text-slate-600 italic py-2">
                          Auto-slot available (Recommend 7:30 PM)
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setTitle(`Batch Post for ${day}`);
                      setIsComposing(true);
                    }}
                    className="w-full text-center py-1 text-[10px] text-slate-400 hover:text-indigo-300 transition-colors border border-dashed border-slate-800 rounded mt-2"
                  >
                    + Add Slot
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compose & Schedule Modal */}
      {isComposing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 sm:p-6 w-full max-w-xl shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">
                  Schedule Post & Auto-Upload Across Channels
                </h3>
              </div>
              <button
                onClick={() => setIsComposing(false)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePost} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Post Headline / Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Why AI Agents Are Replacing Traditional Workflows in 2026"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Post Caption & Call to Action
                </label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write the full post caption for YouTube, TikTok, X, and LinkedIn..."
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
                  required
                />
              </div>

              {/* Hashtags with auto-insert */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    Hashtags
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const topTags = activeNiche.viralHashtags.viral.slice(0, 4).map(h => h.tag).join(' ');
                      setHashtagsInput(prev => prev ? `${prev} ${topTags}` : topTags);
                    }}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    Insert Trending Niche Hashtags
                  </button>
                </div>
                <input
                  type="text"
                  value={hashtagsInput}
                  onChange={(e) => setHashtagsInput(e.target.value)}
                  placeholder="#TechTok #AISoftware #BuildInPublic"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-mono placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              {/* Media Selection */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-300">
                      Attach Media Asset
                    </label>
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setMediaType('video')}
                        className={`px-1.5 py-0.5 rounded ${mediaType === 'video' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400'}`}
                      >
                        Video
                      </button>
                      <button
                        type="button"
                        onClick={() => setMediaType('image')}
                        className={`px-1.5 py-0.5 rounded ${mediaType === 'image' ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400'}`}
                      >
                        Graphic
                      </button>
                    </div>
                  </div>
                  {mediaType === 'video' ? (
                    <select
                      value={selectedVideoId}
                      onChange={(e) => setSelectedVideoId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
                    >
                      {videos.length === 0 && (
                        <option value="">Default Studio Video Asset</option>
                      )}
                      {videos.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.title} ({v.videoType.replace('_', ' ')})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-2 bg-slate-950 border border-slate-700 rounded-lg text-[11px] text-slate-300">
                      Studio High-Res Graphic Frame
                    </div>
                  )}
                </div>

                {/* Scheduled Time + Peak Auto Button */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-300">
                      Scheduled Date & Time
                    </label>
                    <button
                      type="button"
                      onClick={applyPeakActivityTime}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      ⚡ Suggest a time
                    </button>
                  </div>
                  <input
                    type="datetime-local"
                    value={scheduledDateTime}
                    onChange={(e) => setScheduledDateTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              {/* Target Platforms Toggle */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Publish Simultaneously Across:
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {accounts.filter(a => a.connected).length} of {accounts.length} channels connected
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['tiktok', 'youtube', 'instagram', 'x', 'linkedin', 'facebook', 'pinterest'] as PlatformId[]).map(p => {
                    const isSel = selectedPlatforms.includes(p);
                    const acc = accounts.find(a => a.id === p);
                    const isConn = !!acc?.connected;

                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => togglePlatform(p)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium uppercase transition-colors ${
                          isSel
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isConn ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <span>{p}</span>
                        {!isConn && (
                          <span className="text-[9px] text-amber-400/80 lowercase">offline</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Warning / Prompt if any selected platform is not connected */}
                {selectedPlatforms.some(p => !accounts.find(a => a.id === p)?.connected) && (
                  <div className="mt-2.5 p-2 rounded-lg bg-amber-950/40 border border-amber-800/60 flex items-center justify-between gap-2 text-[11px] text-amber-200">
                    <span>
                      ⚠️ Selected unlinked channel(s): {selectedPlatforms.filter(p => !accounts.find(a => a.id === p)?.connected).join(', ')}. Connect your channel so scheduled uploads can publish automatically.
                    </span>
                    {onRequestConnect && (
                      <button
                        type="button"
                        onClick={() => {
                          const firstUnlinked = accounts.find(a => selectedPlatforms.includes(a.id) && !a.connected);
                          if (firstUnlinked) {
                            onRequestConnect(firstUnlinked);
                          }
                        }}
                        className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded font-semibold text-[10px] shrink-0"
                      >
                        Connect Now
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsComposing(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors shadow-md shadow-indigo-600/30"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Confirm Multi-Platform Schedule</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
