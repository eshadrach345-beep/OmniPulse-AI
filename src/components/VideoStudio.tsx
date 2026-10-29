import React, { useState, useEffect, useRef } from 'react';
import { SeriesStudio } from './SeriesStudio';
import { StoryPlayer } from './StoryPlayer';
import { 
  GeneratedVideo, 
  VideoType, 
  AspectRatioType, 
  PlatformId, 
  VideoScene,
  NicheCategory,
  VideoDirectorStyle,
  HookFormulaStyle
} from '../types';
import { 
  generateAIVideoScript, 
  StudioAudioService,
} from '../services/aiService';
import { STUDIO_VOICES, StudioVoice } from '../data/voicesData';
import { registerLocalProcess, unregisterLocalProcess } from '../services/processRegistry';
import { CAMERA_OPTIONS, GENRE_OPTIONS, MOOD_OPTIONS, PRESENTATION_OPTIONS, formatSeconds } from '../data/storyOptions';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Download, 
  Calendar, 
  Share2, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  Sliders, 
  Layers, 
  Smartphone, 
  Monitor, 
  Square,
  Wand2,
  FileText,
  AlertCircle,
  Zap,
  Mic,
  Key,
  RefreshCw,
  Settings2,
  Gauge,
  Flame,
  ShieldCheck,
  Video,
  Check,
  Maximize2,
  Camera,
  Lock
} from 'lucide-react';

interface VideoStudioProps {
  videos: GeneratedVideo[];
  niches: NicheCategory[];
  activeNiche: NicheCategory;
  onSaveNewVideo: (video: GeneratedVideo) => void;
  onScheduleVideoDirect: (video: GeneratedVideo) => void;
  selectedVideoId?: string;
  /** Seconds of video left in this month's plan, if known. */
  secondsLeft?: number | null;
  initialCreateRequested?: boolean;
  prefillPrompt?: string;
  onResetCreateRequested?: () => void;
}

/** Placeholder used only while the library is empty; the player is hidden and an empty state is shown instead. */
const BLANK_VIDEO: GeneratedVideo = {
  id: 'blank',
  title: '',
  userPrompt: '',
  videoType: 'explainer_video',
  aspectRatio: '9:16',
  targetPlatforms: [],
  nicheId: '',
  estimatedDuration: 0,
  voiceoverStyle: '',
  backgroundMusicTrack: '',
  thumbnailUrl: '',
  createdAt: '',
  status: 'ready',
  scenes: [],
};

export const VideoStudio: React.FC<VideoStudioProps> = ({
  videos,
  niches,
  activeNiche,
  onSaveNewVideo,
  onScheduleVideoDirect,
  selectedVideoId,
  secondsLeft,
  initialCreateRequested,
  prefillPrompt,
  onResetCreateRequested,
}) => {
  const effectiveVideos = videos.length > 0 ? videos : [BLANK_VIDEO];
  const isBlankState = videos.length === 0;
  const initialActive = effectiveVideos.find(v => v.id === selectedVideoId) || effectiveVideos[0];
  const [activeVideo, setActiveVideo] = useState<GeneratedVideo>(initialActive);
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [editedTitle, setEditedTitle] = useState(initialActive.title);
  const [editedScenes, setEditedScenes] = useState<VideoScene[]>(initialActive.scenes.map(scene => ({ ...scene })));

  const beginScriptEdit = () => {
    setEditedTitle(activeVideo.title);
    setEditedScenes(activeVideo.scenes.map(scene => ({ ...scene })));
    setIsEditingScript(true);
  };
  const saveScriptEdit = () => {
    const next = { ...activeVideo, title: editedTitle.trim() || activeVideo.title, scenes: editedScenes, estimatedDuration: editedScenes.reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0) };
    setActiveVideo(next);
    onSaveNewVideo(next);
    setIsEditingScript(false);
  };

  // Creation Modal State
  const [isCreating, setIsCreating] = useState(false);
  const createMode: 'story' | 'voiceover' = 'story'; // the single voice-over form is no longer offered
  const [isGenerating, setIsGenerating] = useState(false);
  const generationController = useRef<AbortController | null>(null);
  const generationId = useRef<string | null>(null);
  useEffect(() => {
    const onGlobalStop = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (generationController.current && (!detail?.id || detail.id === generationId.current)) generationController.current.abort();
    };
    window.addEventListener('omnipulse:stop-local-process', onGlobalStop);
    return () => window.removeEventListener('omnipulse:stop-local-process', onGlobalStop);
  }, []);
  const [statusMessage, setStatusMessage] = useState('');
  const [genError, setGenError] = useState<string | null>(null);
  const [videoLoadError, setVideoLoadError] = useState(false);
  
  // Creation Form State
  const [ideaPrompt, setIdeaPrompt] = useState('');
  const [selectedType, setSelectedType] = useState<VideoType>('ad_video');
  const [selectedRatio, setSelectedRatio] = useState<AspectRatioType>('9:16');
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(['tiktok', 'youtube', 'instagram']);
  
  // Director Engine State
  const [directorStyle, setDirectorStyle] = useState<VideoDirectorStyle>('dynamic_viral');
  const [hookFormula, setHookFormula] = useState<HookFormulaStyle>('witty_provocative');

  // Studio Voice State
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(''); // no voice is chosen for the user
  const [selectedSeconds, setSelectedSeconds] = useState<number>(5);
  const [voiceGenderFilter, setVoiceGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [voiceTypeFilter, setVoiceTypeFilter] = useState<'all' | 'commercial_ad' | 'viral_short' | 'storyteller' | 'explainer_tech' | 'conversational'>('all');
  const [voiceMomentum, setVoiceMomentum] = useState<number>(1.10); // 0.75x to 1.40x
  const [voiceQuality, setVoiceQuality] = useState<string>('Ultra HD Neural Audio · 48kHz');
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  // Voice Settings Modal State
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false);
  const [isKeySavedToast, setIsKeySavedToast] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Real Video Player State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [sceneProgress, setSceneProgress] = useState(0); // 0 to 100%
  const [totalElapsedTime, setTotalElapsedTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [videoDuration, setVideoDuration] = useState(15);
  const [playerMode, setPlayerMode] = useState<'storyboard' | 'raw_mp4'>('storyboard');

  // Ensure active video has valid videoUrl
  const currentVideoSrc = activeVideo.videoUrl || '';

  // Sync active video if prop changes
  useEffect(() => {
    if (selectedVideoId) {
      const found = effectiveVideos.find(v => v.id === selectedVideoId);
      if (found) {
        setActiveVideo(found);
        setEditedTitle(found.title);
        setEditedScenes(found.scenes.map(scene => ({ ...scene })));
        setIsEditingScript(false);
        resetPlayer();
      }
    } else if (videos.length === 0) {
      setActiveVideo(BLANK_VIDEO);
    }
  }, [selectedVideoId, videos]);

  // Jump straight to creation when requested by navigation or topic actions
  useEffect(() => {
    if (initialCreateRequested) {
      setIsCreating(true);
      if (prefillPrompt) {
        setIdeaPrompt(prefillPrompt);
      }
      if (onResetCreateRequested) {
        onResetCreateRequested();
      }
    }
  }, [initialCreateRequested, prefillPrompt, onResetCreateRequested]);

  // While the create window is open the page behind it stays put, and the window itself always opens at its top.
  useEffect(() => {
    if (!isCreating) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isCreating]);

  // Video playback loop & scene tracking
  useEffect(() => {
    let interval: any = null;
    if (isPlaying && activeVideo && activeVideo.scenes.length > 0) {
      const currentScene = activeVideo.scenes[currentSceneIdx];
      const sceneDurationMs = (currentScene.duration || 4) * 1000;
      const tickMs = 50;

      interval = setInterval(() => {
        setSceneProgress(prev => {
          const next = prev + (tickMs / sceneDurationMs) * 100;
          if (next >= 100) {
            // Next scene
            if (currentSceneIdx < activeVideo.scenes.length - 1) {
              const nextIdx = currentSceneIdx + 1;
              setCurrentSceneIdx(nextIdx);
              triggerSceneNarration(activeVideo.scenes[nextIdx]);
              return 0;
            } else {
              // Finished
              setIsPlaying(false);
              StudioAudioService.stop();
              if (videoRef.current) {
                videoRef.current.pause();
              }
              return 100;
            }
          }
          return next;
        });

        setTotalElapsedTime(t => t + tickMs / 1000);
      }, tickMs);
    }

    return () => clearInterval(interval);
  }, [isPlaying, currentSceneIdx, activeVideo]);

  // High-Fidelity Voice Narration playback
  const triggerSceneNarration = (scene: VideoScene) => {
    if (isMuted) return;
    const vId = activeVideo.voiceId || selectedVoiceId;
    if (!vId || vId === 'none') return;
    const momentum = activeVideo.voiceMomentum || voiceMomentum || 1.10;
    StudioAudioService.speak(scene.narration, vId, momentum);
  };

  const handlePlayToggle = () => {
    if (!isPlaying) {
      if (currentSceneIdx >= activeVideo.scenes.length - 1 && sceneProgress >= 99) {
        resetPlayer();
      }
      setIsPlaying(true);
      if (videoRef.current) {
        videoRef.current.play().catch(e => console.warn('Autoplay error:', e));
      }
      triggerSceneNarration(activeVideo.scenes[currentSceneIdx]);
    } else {
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.pause();
      }
      StudioAudioService.stop();
    }
  };

  const resetPlayer = () => {
    setIsPlaying(false);
    StudioAudioService.stop();
    setCurrentSceneIdx(0);
    setSceneProgress(0);
    setTotalElapsedTime(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const handleSceneClick = (idx: number) => {
    StudioAudioService.stop();
    setCurrentSceneIdx(idx);
    setSceneProgress(0);
    
    // Calculate timestamp offset
    let offset = 0;
    for (let i = 0; i < idx; i++) {
      offset += activeVideo.scenes[i]?.duration || 4;
    }
    setTotalElapsedTime(offset);

    if (videoRef.current) {
      videoRef.current.currentTime = offset % (videoDuration || 15);
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
      }
    }

    if (isPlaying) {
      triggerSceneNarration(activeVideo.scenes[idx]);
    }
  };

  const togglePlatform = (p: PlatformId) => {
    if (selectedPlatforms.includes(p)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter(item => item !== p));
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, p]);
    }
  };

  // Preview voice audition with absolute concurrency safety
  const handlePreviewVoice = (vId: string) => {
    // If video playback was running, pause it and stop speech
    if (isPlaying) {
      setIsPlaying(false);
      if (videoRef.current) videoRef.current.pause();
    }
    StudioAudioService.stop();

    if (previewingVoiceId === vId) {
      setPreviewingVoiceId(null);
      return;
    }

    setPreviewingVoiceId(vId);
    StudioAudioService.previewVoice(vId, () => {
      setPreviewingVoiceId(null);
    });
  };

  const handleApplyVoiceToCurrentVideo = (voice: StudioVoice, momentum: number, quality: string) => {
    const updated: GeneratedVideo = {
      ...activeVideo,
      voiceId: voice.id,
      voiceName: voice.speakerName,
      voiceMomentum: momentum,
      voiceQuality: quality,
      voiceoverStyle: `${voice.name} (${voice.speakerName}) · ${quality} [${momentum}x]`,
    };
    setActiveVideo(updated);
    onSaveNewVideo(updated);
    setIsVoiceSettingsOpen(false);
  };

  // High-Fidelity MP4 Video Master Exporter
  const handleExportRealVideo = async () => {
    try {
      setExportNotice('Preparing your MP4 file...');
      const videoUrl = currentVideoSrc;
      const cleanTitle = (activeVideo.title || 'omnipulse_video')
        .toLowerCase()
        .replace(/[^a-z0-9]/gi, '_')
        .replace(/_+/g, '_');
      const downloadFileName = `${cleanTitle}.mp4`;

      const response = await fetch(videoUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch video stream (HTTP ${response.status})`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = downloadFileName;
      document.body.appendChild(a);
      a.click();

      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      }, 3000);

      setExportNotice(`Exported ${downloadFileName}`);
    } catch (err: any) {
      console.warn('Blob export exception, using direct anchor fallback:', err);
      try {
        const cleanTitle = (activeVideo.title || 'omnipulse_video')
          .toLowerCase()
          .replace(/[^a-z0-9]/gi, '_');
        const downloadFileName = `${cleanTitle}.mp4`;
        const a = document.createElement('a');
        a.href = currentVideoSrc;
        a.download = downloadFileName;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setExportNotice(`✓ Export triggered for "${downloadFileName}"! Check your downloads.`);
      } catch (fallbackErr) {
        setExportNotice(`Video asset available at ${currentVideoSrc}`);
      }
    }

    setTimeout(() => setExportNotice(null), 5000);
  };

  // Generate Video
  const handleGenerateScript = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ideaPrompt.trim()) return;
    if (!selectedVoiceId) { setGenError('Please choose a voice, or tap No voice-over, before rendering.'); return; }

    if (generationController.current) generationController.current.abort();
    const controller = new AbortController();
    generationController.current = controller;
    generationId.current = `direct-video-${Date.now()}`;
    registerLocalProcess({ id: generationId.current, type: 'Direct Video', title: ideaPrompt.trim().slice(0, 90), startedAt: Date.now() }, () => controller.abort());
    setIsGenerating(true);
    setGenError(null);
    setStatusMessage('Writing your script and storyboard...');

    try {
      const generated = await generateAIVideoScript({
        idea: ideaPrompt,
        videoType: selectedType,
        aspectRatio: selectedRatio,
        targetPlatforms: selectedPlatforms,
        nicheName: activeNiche.name,
        aiDirectorEngine: directorStyle,
        grokHookStyle: hookFormula,
        voiceId: selectedVoiceId,
        seconds: selectedSeconds,
        voiceMomentum,
        voiceQuality,
        signal: controller.signal,
      }, (m) => setStatusMessage(m));

      onSaveNewVideo(generated);
      setActiveVideo(generated);
      setIsCreating(false);
      resetPlayer();
      setIdeaPrompt('');
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && /stopped by you/i.test(err.message))) {
        setGenError('Process stopped. Any provider request already accepted may still finish remotely.');
      } else {
        console.error(err);
        setGenError(err instanceof Error ? err.message : 'Video generation failed. Please try again.');
      }
    } finally {
      if (generationController.current === controller) generationController.current = null;
      if (generationId.current) unregisterLocalProcess(generationId.current);
      generationId.current = null;
      setIsGenerating(false);
      setStatusMessage('');
    }
  };

  // Filtered voice catalog for picker
  const filteredVoices = STUDIO_VOICES.filter(v => {
    if (voiceGenderFilter !== 'all' && v.gender !== voiceGenderFilter) return false;
    if (voiceTypeFilter !== 'all' && v.voiceType !== voiceTypeFilter) return false;
    return true;
  });

  const activeVoiceProfile = StudioAudioService.getVoice(activeVideo.voiceId || selectedVoiceId);
  const currentScene = activeVideo.scenes[currentSceneIdx] || activeVideo.scenes[0];

  return (
    <div className="space-y-6">
      {/* Studio Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Video className="w-5 h-5 text-indigo-400" />
            <h1 className="text-lg font-bold text-white tracking-tight">
              Video Production Studio
            </h1>
            <span className="text-xs text-slate-500">·</span>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30">
              <Zap className="w-3 h-3 text-emerald-400" />
              AI video clips
            </span>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-950/80 text-indigo-300 text-[11px] font-semibold border border-indigo-500/40">
              <Mic className="w-3 h-3 text-indigo-400" />
              Studio Voice Suite
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Make dramas, documentaries and animations with several characters and voices, or a single voice-over video, then schedule them to your channels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsVoiceSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
            title="Configure voice, speed momentum, and quality"
          >
            <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Voice & Audio Studio</span>
          </button>

          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all"
          >
            <Wand2 className="w-4 h-4" />
            <span>Direct New Video</span>
          </button>
        </div>
      </div>

      {isBlankState ? (
        <div className="bg-slate-900/60 border border-dashed border-slate-700 rounded-2xl p-10 text-center space-y-3">
          <Video className="w-10 h-10 text-indigo-400 mx-auto" />
          <h2 className="text-base font-bold text-white">Create your first video</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">Describe a story. OmniPulse writes the script with characters and dialogue, tells you how long it will be, then renders each scene and plays it with every character's voice.</p>
          <button onClick={() => setIsCreating(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold">
            <Wand2 className="w-4 h-4" /> Direct a new video
          </button>
        </div>
      ) : (
      <>
      {/* Creative settings the production was made with (duration, mood, camera, character lock) */}
      {activeVideo.brief && activeVideo.characters?.length ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px]" aria-label="Production settings">
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300"><Clock className="w-3 h-3 text-indigo-400" />{activeVideo.brief.durationMode === 'long' ? 'Long form' : 'Short form'} · {formatSeconds(activeVideo.estimatedDuration)}</span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300"><Video className="w-3 h-3 text-indigo-400" />{MOOD_OPTIONS.find((m) => m.id === activeVideo.brief?.mood)?.label || activeVideo.brief.mood}</span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300"><Camera className="w-3 h-3 text-indigo-400" />{CAMERA_OPTIONS.find((c) => c.id === activeVideo.brief?.cameraProfile)?.label || activeVideo.brief.cameraProfile}</span>
          {activeVideo.brief.presentation && <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-950 border border-indigo-700 text-indigo-200">{PRESENTATION_OPTIONS.find((o) => o.id === activeVideo.brief?.presentation)?.emoji} {PRESENTATION_OPTIONS.find((o) => o.id === activeVideo.brief?.presentation)?.label}</span>}
          {activeVideo.brief.genre && activeVideo.brief.genre !== 'auto' && <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-slate-300">{GENRE_OPTIONS.find((o) => o.id === activeVideo.brief?.genre)?.emoji} {GENRE_OPTIONS.find((o) => o.id === activeVideo.brief?.genre)?.label}</span>}
          {activeVideo.brief.characterLock && <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-900 border border-amber-500/40 text-amber-300"><Lock className="w-3 h-3" />{activeVideo.brief.characterLock.name || 'Main character'} locked</span>}
        </div>
      ) : null}
      {activeVideo.characters?.length ? <StoryPlayer key={activeVideo.id} video={activeVideo} /> : null}
      {/* Main Studio Viewport: Left Player + Right Storyboard */}
      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-6 items-start ${activeVideo.characters?.length ? 'hidden' : ''}`}>
        {/* Left Column: Interactive Real Video Player (5 Cols) */}
        <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div>
              <span className="text-xs font-semibold text-slate-200">
                Video Player
              </span>
              <span className="text-[11px] text-slate-500 ml-2">
                Scene {currentSceneIdx + 1} of {activeVideo.scenes.length}
              </span>
            </div>
            
            {/* View Mode Toggle: Interactive Storyboard vs Raw MP4 */}
            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setPlayerMode('storyboard')}
                className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                  playerMode === 'storyboard'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Interactive scene storyboard overlay"
              >
                Storyboard
              </button>
              <button
                type="button"
                onClick={() => setPlayerMode('raw_mp4')}
                className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                  playerMode === 'raw_mp4'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Play raw MP4 video footage with native controls"
              >
                Direct MP4
              </button>
            </div>
          </div>

          {/* Screen Container with Real Video Footage */}
          <div 
            className="relative mx-auto flex items-center justify-center bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-800 cursor-pointer group"
            style={{ 
              aspectRatio: activeVideo.aspectRatio === '9:16' ? '9/16' : activeVideo.aspectRatio === '1:1' ? '1/1' : '16/9',
              maxHeight: '480px',
              width: '100%',
              maxWidth: activeVideo.aspectRatio === '9:16' ? '270px' : '100%'
            }}
            onClick={() => {
              if (playerMode === 'storyboard') {
                handlePlayToggle();
              }
            }}
          >
            {/* Real HTML5 Video Player */}
            <video
              key={`${currentVideoSrc}-${playerMode}`}
              ref={videoRef}
              src={currentVideoSrc}
              loop
              playsInline
              preload="auto"
              controls={playerMode === 'raw_mp4'}
              muted={playerMode === 'storyboard' || isMuted}
              onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration || 15)}
              onLoadedData={() => setVideoLoadError(false)}
              onError={() => setVideoLoadError(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
            {videoLoadError && currentVideoSrc && (
              <div role="alert" className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-950/95 text-center p-4 text-xs text-slate-300">
                <p>This video file could not be played in the browser.</p>
                <a href={currentVideoSrc} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Open the video file</a>
              </div>
            )}

            {/* In Direct MP4 mode, do not show storyboard overlays */}
            {playerMode === 'storyboard' && (
              <>
                {/* Lighter Gradient Overlay for Clean Video Visibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/50 pointer-events-none" />

                {/* Dynamic Animated Overlay Content */}
                <div className="absolute inset-0 flex flex-col justify-between p-3.5 text-center pointer-events-none z-10">
                  
                  {/* Top Watermark & Time */}
                  <div className="flex items-center justify-between text-[10px] text-white/90">
                    <span className="font-semibold tracking-wider flex items-center gap-1 bg-black/50 px-2 py-0.5 rounded backdrop-blur-xs border border-white/10">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      OMNIPULSE · MP4
                    </span>
                    <span className="font-mono tabular-nums bg-black/50 px-2 py-0.5 rounded backdrop-blur-xs text-white/80 border border-white/10">
                      00:0{Math.floor(totalElapsedTime)}s
                    </span>
                  </div>

                  {/* Center Kinetic Callout Title */}
                  <div className="my-auto px-2">
                    {currentScene.onScreenText && (
                      <div className="inline-block py-1 px-2.5 rounded-md bg-black/80 border border-amber-400/50 text-amber-300 font-extrabold text-xs sm:text-sm tracking-wide shadow-2xl animate-in zoom-in-95 duration-200">
                        {currentScene.onScreenText}
                      </div>
                    )}
                    {currentScene.soundEffectCue && (
                      <div className="mt-1.5 text-[9px] text-white/80 italic flex items-center justify-center gap-1">
                        <span>SFX: {currentScene.soundEffectCue}</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Spoken Subtitles & Voice Badge */}
                  <div className="space-y-1">
                    <div className="bg-black/85 backdrop-blur-xs rounded-lg p-2 border border-white/10 text-[11px] text-slate-100 font-medium leading-snug shadow-lg">
                      "{currentScene.narration}"
                    </div>

                    <div className="flex items-center justify-between text-[9px] text-slate-400 px-1">
                      <span className="flex items-center gap-1 text-indigo-300">
                        <Mic className="w-2.5 h-2.5" />
                        <span>Voice: {activeVoiceProfile.name}</span>
                      </span>
                      <span className="font-mono">
                        Scene {currentSceneIdx + 1}/{activeVideo.scenes.length}
                      </span>
                    </div>
                  </div>

                </div>

                {/* Play/Pause Center Overlay on Hover or Pause */}
                {!isPlaying && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayToggle();
                    }}
                    className="absolute inset-0 m-auto w-14 h-14 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white flex items-center justify-center shadow-2xl transition-transform hover:scale-105 z-20 cursor-pointer"
                  >
                    <Play className="w-6 h-6 ml-0.5" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Player Progress Scrubber */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span>Scene {currentSceneIdx + 1}: {Math.round(sceneProgress)}%</span>
              <span>{Math.floor(totalElapsedTime)}s / {activeVideo.estimatedDuration}s</span>
            </div>
            
            {/* Multi-Segment Scene Progress Bar */}
            <div className="grid grid-cols-4 gap-1 h-2 bg-slate-950 rounded-full p-0.5 border border-slate-800">
              {activeVideo.scenes.map((scene, idx) => {
                let fillWidth = '0%';
                if (idx < currentSceneIdx) fillWidth = '100%';
                else if (idx === currentSceneIdx) fillWidth = `${sceneProgress}%`;

                return (
                  <div
                    key={scene.id}
                    onClick={() => handleSceneClick(idx)}
                    className="relative bg-slate-800 h-full rounded-full overflow-hidden cursor-pointer hover:bg-slate-700 transition-colors"
                  >
                    <div 
                      className="absolute left-0 top-0 bottom-0 bg-indigo-500 rounded-full transition-all duration-75"
                      style={{ width: fillWidth }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Playback Controls & Action Buttons */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePlayToggle}
                className="p-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                title={isPlaying ? 'Pause' : 'Play video with narration'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>

              <button
                onClick={resetPlayer}
                className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 transition-colors"
                title="Restart from beginning"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 transition-colors"
                title={isMuted ? 'Unmute voice narration' : 'Mute voice narration'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
              </button>
            </div>

            {/* Direct Real Video Download & Schedule Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleExportRealVideo}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
                title="Download MP4"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Export MP4</span>
              </button>

              <button
                onClick={() => onScheduleVideoDirect(activeVideo)}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Schedule</span>
              </button>
            </div>
          </div>

          {/* Export Notification Toast */}
          {exportNotice && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded-lg text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{exportNotice}</span>
            </div>
          )}

          {/* Voice Engine Indicator Bar */}
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-850 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400" />
              <span className="text-slate-300 font-medium">Voice Narration Track:</span>
              <span className="text-white font-mono">{activeVoiceProfile.name}</span>
            </div>
            <button
              onClick={() => setIsVoiceSettingsOpen(true)}
              className="text-[11px] text-indigo-400 hover:underline"
            >
              Configure Speed & Tone
            </button>
          </div>
        </div>

        {/* Right Column: Multi-Scene Storyboard & Breakdown (7 Cols) */}
        <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              {isEditingScript ? (
                <input value={editedTitle} onChange={e => setEditedTitle(e.target.value)} aria-label="Video title" className="w-full text-sm font-bold text-white bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-500" />
              ) : (
                <h2 className="text-sm font-bold text-white flex items-center gap-2"><span>{activeVideo.title}</span></h2>
              )}
              <p className="text-xs text-slate-400 mt-0.5">
                Target: {activeVideo.targetPlatforms.map(p => p.toUpperCase()).join(', ')} · ~{activeVideo.estimatedDuration} seconds total
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-mono">{activeVideo.scenes.length} Scenes</span>
              {!isEditingScript ? (
                <button type="button" onClick={beginScriptEdit} className="px-3 py-1.5 rounded-lg border border-indigo-700 bg-indigo-950/60 text-indigo-200 text-xs font-semibold hover:bg-indigo-900">Edit script</button>
              ) : (
                <>
                  <button type="button" onClick={() => setIsEditingScript(false)} className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 text-xs">Cancel</button>
                  <button type="button" onClick={saveScriptEdit} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500">Save edits</button>
                </>
              )}
            </div>
          </div>

          {/* Scene List Cards */}
          <div className="space-y-3">
            {activeVideo.scenes.map((scene, idx) => (
              <div
                key={scene.id}
                onClick={() => handleSceneClick(idx)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  currentSceneIdx === idx
                    ? 'bg-indigo-950/40 border-indigo-500 shadow-md'
                    : 'bg-slate-950/60 border-slate-850 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center font-mono ${
                      currentSceneIdx === idx ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {scene.sceneNumber}
                    </span>
                    <span className="text-xs font-semibold text-white">
                      Scene {scene.sceneNumber} ({scene.duration}s)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                      {scene.motionStyle}
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      StudioAudioService.speak(scene.narration, activeVideo.voiceId, activeVideo.voiceMomentum);
                    }}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                    title="Audition spoken line"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5 text-xs">
                  {isEditingScript ? (
                    <div className="space-y-2" onClick={e => e.stopPropagation()}>
                      <label className="block text-[10px] uppercase tracking-wide text-slate-500">Narration / dialogue</label>
                      <textarea value={editedScenes[idx]?.narration ?? scene.narration} onChange={e => setEditedScenes(prev => prev.map((item, i) => i === idx ? { ...item, narration: e.target.value } : item))} rows={3} className="w-full resize-y text-slate-100 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs leading-relaxed focus:outline-none focus:border-indigo-500" />
                      <label className="block text-[10px] uppercase tracking-wide text-slate-500">Visual direction</label>
                      <textarea value={editedScenes[idx]?.visualCue ?? scene.visualCue} onChange={e => setEditedScenes(prev => prev.map((item, i) => i === idx ? { ...item, visualCue: e.target.value } : item))} rows={2} className="w-full resize-y text-slate-100 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs leading-relaxed focus:outline-none focus:border-indigo-500" />
                      <label className="block text-[10px] uppercase tracking-wide text-slate-500">On-screen text</label>
                      <input value={editedScenes[idx]?.onScreenText ?? scene.onScreenText} onChange={e => setEditedScenes(prev => prev.map((item, i) => i === idx ? { ...item, onScreenText: e.target.value } : item))} className="w-full text-slate-100 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-500" />
                    </div>
                  ) : (
                    <>
                      <p className="text-slate-300 font-mono leading-relaxed bg-slate-900/60 p-2 rounded border border-slate-800">"{scene.narration}"</p>
                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
                        <span>Visual: {scene.visualCue}</span>
                        {scene.onScreenText && <span className="text-amber-300 font-semibold font-mono">Text: {scene.onScreenText}</span>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: DIRECT NEW VIDEO */}
      {/* ---------------------------------------------------- */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-start justify-center p-3 sm:p-4 overflow-y-auto overscroll-contain">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl p-5 sm:p-6 space-y-4 my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">
                  Direct High-Converting Video
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsCreating(false);
                  StudioAudioService.stop();
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {createMode === 'story' ? (
              <SeriesStudio single nicheName={activeNiche.name} secondsLeft={secondsLeft} />
            ) : (
            <form onSubmit={handleGenerateScript} className="space-y-4">
              {/* Concept Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Video Concept or Angle
                </label>
                <textarea
                  rows={2}
                  required
                  value={ideaPrompt}
                  onChange={(e) => setIdeaPrompt(e.target.value)}
                  placeholder="e.g. 3-step automation that saves 10 hours a week for creators..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              {/* Format & Style Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Video Style */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Production Format
                  </label>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    <button
                      type="button"
                      onClick={() => setSelectedType('cartoon_3d')}
                      className={`w-full text-left p-2 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                        selectedType === 'cartoon_3d'
                          ? 'bg-indigo-950 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-amber-400 font-bold">✨ 3D Cartoon / Animation</span>
                      </div>
                      {selectedType === 'cartoon_3d' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedType('cartoon_2d')}
                      className={`w-full text-left p-2 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                        selectedType === 'cartoon_2d'
                          ? 'bg-indigo-950 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-indigo-400 font-bold">🎨 2D Vector & Anime Style</span>
                      </div>
                      {selectedType === 'cartoon_2d' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedType('ad_video')}
                      className={`w-full text-left p-2 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                        selectedType === 'ad_video'
                          ? 'bg-indigo-950 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-emerald-400 font-bold">🎬 Real Video Commercial</span>
                      </div>
                      {selectedType === 'ad_video' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedType('doodle_video')}
                      className={`w-full text-left p-2 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                        selectedType === 'doodle_video'
                          ? 'bg-indigo-950 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>Hand-Drawn Whiteboard Sketch</span>
                      {selectedType === 'doodle_video' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedType('explainer_video')}
                      className={`w-full text-left p-2 rounded-lg border text-xs transition-colors flex items-center justify-between ${
                        selectedType === 'explainer_video'
                          ? 'bg-indigo-950 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>Kinetic Animated Explainer</span>
                      {selectedType === 'explainer_video' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </button>
                  </div>
                </div>

                {/* Aspect Ratio */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Target Aspect Ratio
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedRatio('9:16')}
                      className={`p-2.5 rounded-lg border text-center transition-colors ${
                        selectedRatio === '9:16'
                          ? 'bg-indigo-950 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Smartphone className="w-4 h-4 mx-auto mb-1" />
                      <span className="text-[11px] block font-semibold">9:16</span>
                      <span className="text-[9px] text-slate-500">TikTok/Reels</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRatio('16:9')}
                      className={`p-2.5 rounded-lg border text-center transition-colors ${
                        selectedRatio === '16:9'
                          ? 'bg-indigo-950 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Monitor className="w-4 h-4 mx-auto mb-1" />
                      <span className="text-[11px] block font-semibold">16:9</span>
                      <span className="text-[9px] text-slate-500">YouTube</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRatio('1:1')}
                      className={`p-2.5 rounded-lg border text-center transition-colors ${
                        selectedRatio === '1:1'
                          ? 'bg-indigo-950 border-indigo-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Square className="w-4 h-4 mx-auto mb-1" />
                      <span className="text-[11px] block font-semibold">1:1</span>
                      <span className="text-[9px] text-slate-500">Square</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Director Style & Hook Formula */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">Director Style & Narrative Arc</span>
                  <span className="text-emerald-400 text-[11px]">Dynamic Creator Engine</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDirectorStyle('dynamic_viral')}
                    className={`p-2.5 rounded-lg border text-left text-xs transition-colors ${
                      directorStyle === 'dynamic_viral'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="font-semibold text-white">Dynamic Viral Director</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">High-dopamine hooks & fast retention cuts</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDirectorStyle('cinematic_commercial')}
                    className={`p-2.5 rounded-lg border text-left text-xs transition-colors ${
                      directorStyle === 'cinematic_commercial'
                        ? 'bg-indigo-950/80 border-indigo-500 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="font-semibold text-white">Cinematic Commercial Director</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Polished story arc & high conversion clarity</div>
                  </button>
                </div>

                {/* Hook Formula */}
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1.5">
                    Hook & Pattern Interrupt Formula:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'witty_provocative', label: 'Witty Pattern Interrupt', desc: 'Unpopular opinion hook' },
                      { id: 'contrarian', label: 'Contrarian Truth', desc: 'Delete the old playbook' },
                      { id: 'viral_breakout', label: 'Viral Breakout Hook', desc: 'Stop scrolling pattern interrupt' },
                      { id: 'raw_founder', label: 'Authentic Founder Story', desc: 'Zero fluff, raw execution' },
                    ].map(style => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setHookFormula(style.id as HookFormulaStyle)}
                        className={`p-2 rounded-lg border text-left transition-colors ${
                          hookFormula === style.id
                            ? 'bg-indigo-900/40 border-indigo-500 text-white'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="text-[11px] font-semibold">{style.label}</div>
                        <div className="text-[9px] text-slate-500">{style.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Video length */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">Video length</label>
                <div className="grid grid-cols-2 gap-2">
                  {[5, 10].map((sec) => {
                    const tooLong = secondsLeft != null && secondsLeft < sec;
                    return (
                      <button
                        key={sec} type="button" disabled={tooLong} onClick={() => setSelectedSeconds(sec)}
                        className={`p-2.5 rounded-lg border text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${selectedSeconds === sec ? 'bg-indigo-950 border-indigo-500' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}
                      >
                        <span className="block text-xs font-bold text-white">{sec} seconds</span>
                        <span className="block text-[10px] text-slate-400">Uses {sec} seconds of your monthly video allowance</span>
                      </button>
                    );
                  })}
                </div>
                {secondsLeft != null && <p className="text-[11px] text-slate-400">{secondsLeft} seconds of video left this month.</p>}
              </div>

              {/* Voice Selection Strip */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Select Studio Voice {!selectedVoiceId && <span className="text-amber-300 font-normal">(choose one to continue)</span>}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div
                    onClick={() => { setSelectedVoiceId('none'); try { localStorage.setItem('omnipulse:voice', 'none'); } catch { /* ignore */ } }}
                    className={`p-2.5 rounded-lg border cursor-pointer text-left transition-all ${selectedVoiceId === 'none' ? 'bg-indigo-950 border-indigo-500 shadow-sm' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}
                  >
                    <span className="block text-xs font-bold text-white mb-1">No voice-over</span>
                    <div className="text-[10px] text-slate-400">Silent video</div>
                  </div>
                  {STUDIO_VOICES.map(voice => (
                    <div
                      key={voice.id}
                      onClick={() => { setSelectedVoiceId(voice.id); try { localStorage.setItem('omnipulse:voice', voice.id); } catch { /* ignore */ } }}
                      className={`p-2.5 rounded-lg border cursor-pointer text-left transition-all ${
                        selectedVoiceId === voice.id
                          ? 'bg-indigo-950 border-indigo-500 shadow-sm'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white">{voice.name}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePreviewVoice(voice.id);
                          }}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        >
                          <Volume2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-400 capitalize">{voice.gender} · {voice.age}</div>
                    </div>
                  ))}
                </div>
              </div>

              {genError && (
                <div role="alert" className="mb-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{genError}</div>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="submit"
                  disabled={isGenerating || !ideaPrompt.trim() || !selectedVoiceId}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  <span>{isGenerating ? statusMessage || 'Directing Video...' : 'Direct & Render Video'}</span>
                </button>
                {isGenerating && <button type="button" onClick={() => { if (window.confirm('Stop this generation process? A request already accepted by an external provider may still finish remotely.')) generationController.current?.abort(); }} className="py-3 px-4 rounded-lg border border-rose-700 bg-rose-950/50 text-rose-200 hover:bg-rose-900/70 text-xs font-semibold flex items-center justify-center gap-2"><Square className="w-3.5 h-3.5 fill-current" /> Stop process</button>}
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL: VOICE STUDIO & SPEED CONTROLS */}
      {/* ---------------------------------------------------- */}
      {isVoiceSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl p-5 sm:p-6 space-y-4 my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Mic className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">
                  Studio Voice & Narration Engine
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsVoiceSettingsOpen(false);
                  StudioAudioService.stop();
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* Voice Pacing Slider */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">Speech Momentum / Cadence</span>
                  <span className="font-mono text-indigo-400 font-bold">{voiceMomentum.toFixed(2)}x Speed</span>
                </div>
                <input
                  type="range"
                  min="0.75"
                  max="1.40"
                  step="0.05"
                  value={voiceMomentum}
                  onChange={(e) => setVoiceMomentum(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                  <span>0.75x (Cinematic)</span>
                  <span>1.10x (Optimal)</span>
                  <span>1.40x (Fast Pace)</span>
                </div>
              </div>

              {/* Voice Picker */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Select Voice Persona
                </label>
                <div className="space-y-2">
                  {STUDIO_VOICES.map(voice => (
                    <div
                      key={voice.id}
                      onClick={() => handleApplyVoiceToCurrentVideo(voice, voiceMomentum, voiceQuality)}
                      className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-colors ${
                        activeVideo.voiceId === voice.id
                          ? 'bg-indigo-950/60 border-indigo-500'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-white">{voice.speakerName}</div>
                        <div className="text-[11px] text-slate-400">{voice.useCase}</div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreviewVoice(voice.id);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Audition</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
