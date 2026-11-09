import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GeneratedVideo, VideoScene, VideoMediaLayer, VideoMediaTrack } from '../types';
import { api } from '../services/api';
import { splitVideoScene } from '../services/editorTimeline';
import { ArrowDown, ArrowUp, AudioLines, Check, Clapperboard, Copy, Download, Film, Image as ImageIcon, Layers3, Loader2, Music2, Play, Plus, Redo2, RefreshCw, Scissors, Settings2, ShieldCheck, Sparkles, Split, Trash2, Type, Undo2, Volume2, Wand2 } from 'lucide-react';

interface DirectorEdit { scene: number; reason: string; visualDirection: string; overlayText: string; soundEffect: string; transition: string }
interface DirectorPlan { summary: string; edits: DirectorEdit[] }
interface EditorMediaAsset { id: string; name: string; contentType: string; size: number; createdAt: string }
interface TranscriptSegment { start: number; end: number; text: string }
interface TranscriptResult { assetId: string; name: string; text: string; duration: number; segments: TranscriptSegment[] }
interface DirectorMediaMatch {
  assetId: string; name: string; contentType: string; kind: 'video' | 'image' | 'audio';
  track: 'overlay' | 'audio'; startAt: number; duration: number; reason: string; visualTreatment: string;
}
interface DirectorMediaPlan { summary: string; matches: DirectorMediaMatch[] }
interface SceneRenderResult { asset: EditorMediaAsset; downloadUrl: string; duration: number; renderedLayers: number; captionsBurnedIn: boolean }
interface FilmAssembleResult { asset: EditorMediaAsset; downloadUrl: string; sceneCount: number; transition?: string; transitionDuration?: number }
interface DeapiAudioModel { slug: string; name: string; description: string; supportsAudioToVideo: boolean }
interface AudioSyncResult { jobId: string; videoUrl: string; duration: number; frameCount: number }
type EditorTool = 'media' | 'text' | 'audio' | 'captions' | 'ai';
interface EditorCapabilities { aiDirectorAvailable: boolean; aiProviders: string[]; transcriptionAvailable: boolean; audioSyncModels: number }
interface AiTestResult { results: { name: string; ok: boolean; message: string }[]; available: boolean }
const TOOL_ITEMS: { id: EditorTool; label: string; icon: React.ElementType }[] = [
  { id: 'media', label: 'Media', icon: ImageIcon },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'audio', label: 'Audio', icon: AudioLines },
  { id: 'captions', label: 'Captions', icon: Volume2 },
  { id: 'ai', label: 'AI tools', icon: Sparkles },
];
const formatTime = (seconds: number) => {
  const value = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
};
interface Props { video: GeneratedVideo; onSave: (video: GeneratedVideo) => void }

/** Non-destructive scene timeline: the source render jobs remain intact while the edit list controls the final join order. */
export const VideoEditor: React.FC<Props> = ({ video, onSave }) => {
  const [scenes, setScenes] = useState<VideoScene[]>(video.scenes || []);
  const [selected, setSelected] = useState(0);
  const [undoStack, setUndoStack] = useState<VideoScene[][]>([]);
  const [redoStack, setRedoStack] = useState<VideoScene[][]>([]);
  const [saved, setSaved] = useState(false);
  const [directorInstruction, setDirectorInstruction] = useState('');
  const [directorPlan, setDirectorPlan] = useState<DirectorPlan | null>(null);
  const [directorBusy, setDirectorBusy] = useState(false);
  const [mediaAssets, setMediaAssets] = useState<EditorMediaAsset[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'video' | 'image' | 'audio'>('all');
  const [selectedMediaTrack, setSelectedMediaTrack] = useState<VideoMediaTrack>('main');
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [mediaError, setMediaError] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptResult | null>(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [mediaMatchBusy, setMediaMatchBusy] = useState(false);
  const [mediaMatchPlan, setMediaMatchPlan] = useState<DirectorMediaPlan | null>(null);
  const [mediaMatchError, setMediaMatchError] = useState('');
  const [renderingScene, setRenderingScene] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [renderedScene, setRenderedScene] = useState<SceneRenderResult | null>(null);
  const [renderingFilm, setRenderingFilm] = useState(false);
  const [filmProgress, setFilmProgress] = useState('');
  const [filmError, setFilmError] = useState('');
  const [finishedFilm, setFinishedFilm] = useState<FilmAssembleResult | null>(null);
  const [filmTransition, setFilmTransition] = useState<'cut' | 'fade' | 'wipeleft' | 'slideleft' | 'circleopen'>('cut');
  const [filmTransitionDuration, setFilmTransitionDuration] = useState(0.45);
  const [directorError, setDirectorError] = useState('');
  const [audioSyncModels, setAudioSyncModels] = useState<DeapiAudioModel[]>([]);
  const [audioSyncModel, setAudioSyncModel] = useState('');
  const [audioSyncAudioId, setAudioSyncAudioId] = useState('');
  const [audioSyncImageId, setAudioSyncImageId] = useState('');
  const [audioSyncAudioUrl, setAudioSyncAudioUrl] = useState('');
  const [audioSyncDuration, setAudioSyncDuration] = useState(0);
  const [audioSyncPrompt, setAudioSyncPrompt] = useState('A natural, expressive on-camera performance with mouth movements precisely synchronized to the uploaded audio. The speaker maintains warm eye contact, natural blinks and subtle eyebrow and head movement between phrases. Keep the camera steady in a medium close-up and preserve the speaker identity from the optional reference image.');
  const [audioSyncBusy, setAudioSyncBusy] = useState(false);
  const [audioSyncStatus, setAudioSyncStatus] = useState('');
  const [audioSyncError, setAudioSyncError] = useState('');
  const [audioSyncResult, setAudioSyncResult] = useState<AudioSyncResult | null>(null);
  const [activeTool, setActiveTool] = useState<EditorTool>('media');
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<EditorCapabilities | null>(null);
  const [capabilityError, setCapabilityError] = useState('');
  const [aiTestBusy, setAiTestBusy] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<AiTestResult | null>(null);
  const [aiTestError, setAiTestError] = useState('');
  const [timelineZoom, setTimelineZoom] = useState(26);
  const [globalPlayhead, setGlobalPlayhead] = useState(0);
  const [newText, setNewText] = useState('Your title');
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const pendingPreviewSeek = useRef<number | null>(null);

  useEffect(() => { setScenes(video.scenes || []); setSelected(0); setUndoStack([]); setRedoStack([]); }, [video.id]);
  const totalSeconds = useMemo(() => scenes.reduce((sum, scene) => sum + Math.max(0, Number(scene.duration) || 0), 0), [scenes]);
  const current = scenes[selected];
  const sceneStarts = useMemo(() => {
    let cursor = 0;
    return scenes.map((scene) => {
      const start = cursor;
      const duration = Math.max(0.5, Number(scene.duration) || 1);
      cursor += duration;
      return { start, duration };
    });
  }, [scenes]);
  const timelineWidth = Math.max(760, totalSeconds * timelineZoom);
  const selectedLayer = current?.mediaLayers?.find((layer) => layer.id === selectedLayerId);
  const selectedTextOverlay = current?.textOverlays?.find((layer) => layer.id === selectedLayerId);
  const mainLayer = current?.mediaLayers?.find((layer) => layer.track === 'main');
  const overlayLayers = current?.mediaLayers?.filter((layer) => layer.track === 'overlay') || [];
  const audioLayers = current?.mediaLayers?.filter((layer) => layer.track === 'audio') || [];
  const activeCaption = current?.captions?.find((cue) => previewTime >= cue.start && previewTime <= cue.end);

  useEffect(() => {
    const requested = pendingPreviewSeek.current;
    pendingPreviewSeek.current = null;
    setPreviewTime(requested == null ? 0 : requested);
  }, [current?.id, mainLayer?.sourceIn]);

  useEffect(() => {
    let active = true;
    setMediaLoading(true);
    api.get<{ assets: EditorMediaAsset[] }>('/media/list')
      .then((result) => { if (active) setMediaAssets(result.assets || []); })
      .catch((error) => { if (active) setMediaError(error instanceof Error ? error.message : 'Could not load your private media library.'); })
      .finally(() => { if (active) setMediaLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    api.get<EditorCapabilities>('/video/editor/capabilities')
      .then((result) => { if (active) setCapabilities(result); })
      .catch((error) => { if (active) setCapabilityError(error instanceof Error ? error.message : 'AI capability status could not be loaded.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    api.get<{ models: DeapiAudioModel[] }>('/video/models')
      .then((result) => {
        if (!active) return;
        const compatible = (result.models || []).filter((model) => model.supportsAudioToVideo);
        setAudioSyncModels(compatible);
        setAudioSyncModel((currentModel) => compatible.some((model) => model.slug === currentModel) ? currentModel : compatible[0]?.slug || '');
      })
      .catch((error) => { if (active) setAudioSyncError(error instanceof Error ? error.message : 'Could not load DeAPI audio-sync models.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setAudioSyncAudioUrl('');
    setAudioSyncDuration(0);
    if (!audioSyncAudioId) return;
    api.get<{ url: string }>(`/media/url?id=${encodeURIComponent(audioSyncAudioId)}`)
      .then((result) => { if (active) setAudioSyncAudioUrl(result.url); })
      .catch((error) => { if (active) setAudioSyncError(error instanceof Error ? error.message : 'Could not open the selected audio file.'); });
    return () => { active = false; };
  }, [audioSyncAudioId]);

  useEffect(() => {
    let active = true;
    const ids: string[] = Array.from(new Set<string>((current?.mediaLayers || []).map((layer) => layer.assetId).filter((id): id is string => Boolean(id) && !mediaUrls[id])));
    if (!ids.length) return;
    const resolveUrls = async () => {
      const results: Array<readonly [string, string] | null> = await Promise.all(ids.map(async (id): Promise<readonly [string, string] | null> => {
        try {
          const result = await api.get<{ url: string }>(`/media/url?id=${encodeURIComponent(id)}`);
          return [id, result.url] as const;
        } catch { return null; }
      }));
      if (!active) return;
      const resolved: Record<string, string> = {};
      results.forEach((item) => { if (item) resolved[item[0]] = item[1]; });
      if (Object.keys(resolved).length) setMediaUrls((currentUrls) => ({ ...currentUrls, ...resolved }));
    };
    void resolveUrls();
    return () => { active = false; };
  }, [current?.id, current?.mediaLayers, mediaUrls]);

  const addMediaLayer = (trackOverride: VideoMediaTrack = selectedMediaTrack, assetIdOverride?: string) => {
    const asset = mediaAssets.find((item) => item.id === (assetIdOverride || selectedAssetId));
    if (!asset || !current) return;
    const kind: VideoMediaLayer['kind'] = asset.contentType.startsWith('audio/') ? 'audio' : asset.contentType.startsWith('image/') ? 'image' : 'video';
    const track: VideoMediaTrack = kind === 'audio' ? 'audio' : trackOverride === 'audio' ? 'overlay' : trackOverride;
    const layer: VideoMediaLayer = {
      id: `${asset.id}-${Date.now().toString(36)}`,
      assetId: asset.id,
      name: asset.name,
      contentType: asset.contentType,
      kind,
      track,
      startAt: 0,
      sourceIn: 0,
      duration: Math.max(1, Number(current.duration) || 5),
      volume: 1,
      fadeIn: 0,
      fadeOut: 0,
      opacity: 1,
      scale: 55,
      x: 50,
      y: 50,
    };
    const existing = current.mediaLayers || [];
    const next = track === 'main' ? existing.filter((item) => item.track !== 'main') : existing;
    patchCurrent({ mediaLayers: [...next, layer] });
    api.get<{ url: string }>(`/media/url?id=${encodeURIComponent(asset.id)}`)
      .then((result) => setMediaUrls((urls) => ({ ...urls, [asset.id]: result.url })))
      .catch((error) => setMediaError(error instanceof Error ? error.message : 'Could not preview this media asset.'));
    setMediaError('');
  };

  const patchMediaLayer = (id: string, patch: Partial<VideoMediaLayer>) => {
    if (!current) return;
    patchCurrent({ mediaLayers: (current.mediaLayers || []).map((layer) => layer.id === id ? { ...layer, ...patch } : layer) });
  };

  const removeMediaLayer = (id: string) => {
    if (!current) return;
    patchCurrent({ mediaLayers: (current.mediaLayers || []).filter((layer) => layer.id !== id) });
  };

  const transcribeSelectedAsset = async () => {
    if (!selectedAssetId) return;
    setTranscribing(true);
    setMediaError('');
    setTranscript(null);
    try {
      const result = await api.post<TranscriptResult>('/media/transcribe', { id: selectedAssetId });
      setTranscript(result);
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'Transcription could not be completed.');
    } finally { setTranscribing(false); }
  };

  const applyTranscript = () => {
    if (!current || !transcript?.segments?.length) return;
    // Transcription timestamps refer to the complete uploaded file. Convert them
    // to this scene's local timeline and keep every cue inside the render window.
    const duration = Math.max(1, Math.min(90, Number(current.duration) || 30));
    const sourceIn = transcript.assetId === mainLayer?.assetId ? Math.max(0, Number(mainLayer?.sourceIn) || 0) : 0;
    const windowEnd = sourceIn + duration;
    const captions = transcript.segments
      .filter((segment) => segment.end > sourceIn && segment.start < windowEnd)
      .map((segment) => ({
        start: Math.max(0, segment.start - sourceIn),
        end: Math.min(duration, segment.end - sourceIn),
        text: segment.text,
      }))
      .filter((cue) => cue.end > cue.start);
    if (!captions.length) {
      setMediaError('No speech was found inside this scene segment. Adjust the source in-point or edit duration, then transcribe again.');
      return;
    }
    patchCurrent({ captions, voiceoverText: transcript.text });
    setMediaError('');
  };

  const requestMediaMatches = async () => {
    if (!transcript?.segments?.length) return;
    setMediaMatchBusy(true); setMediaMatchError(''); setMediaMatchPlan(null);
    try {
      const result = await api.post<DirectorMediaPlan>('/video/director/match', {
        instruction: directorInstruction || 'Match the spoken moments to the most relevant supporting clips, images and sound from my uploads.',
        segments: transcript.segments,
        duration: transcript.duration,
      });
      setMediaMatchPlan(result);
    } catch (error) {
      setMediaMatchError(error instanceof Error ? error.message : 'The AI Director could not match your media.');
    } finally { setMediaMatchBusy(false); }
  };

  const applyMediaMatches = () => {
    if (!mediaMatchPlan?.matches?.length || !scenes.length) return;
    const stamp = Date.now();
    const next = scenes.map((scene) => ({ ...scene, mediaLayers: [...(scene.mediaLayers || [])] }));
    let placementCount = 0;
    mediaMatchPlan.matches.forEach((match, matchIndex) => {
      const globalStart = Math.max(0, Number(match.startAt) || 0);
      const globalEnd = globalStart + Math.max(0.5, Number(match.duration) || 3);
      sceneStarts.forEach((range, sceneIndex) => {
        const overlapStart = Math.max(globalStart, range.start);
        const overlapEnd = Math.min(globalEnd, range.start + range.duration);
        if (overlapEnd <= overlapStart) return;
        const layer: VideoMediaLayer = {
          id: `director-${match.assetId}-${stamp}-${matchIndex}-${sceneIndex}`,
          assetId: match.assetId, name: match.name, contentType: match.contentType,
          kind: match.kind, track: match.track, startAt: overlapStart - range.start,
          sourceIn: overlapStart - globalStart, duration: overlapEnd - overlapStart,
          volume: 0.8, fadeIn: 0, fadeOut: 0, opacity: 1, scale: 55, x: 50, y: 50,
        };
        next[sceneIndex].mediaLayers!.push(layer);
        placementCount += 1;
      });
    });
    if (!placementCount) {
      setMediaMatchError('The matched moments fall outside the current timeline. Transcribe the video you are editing or extend the timeline, then try again.');
      return;
    }
    commit(next);
    setMediaMatchPlan(null);
    setMediaMatchError(`Applied ${placementCount} supporting-media placement(s) across the timeline.`);
  };

  const renderCurrentScene = async () => {
    if (!current) return;
    setRenderingScene(true); setRenderError(''); setRenderedScene(null);
    try {
      const result = await api.post<SceneRenderResult>('/video/editor/render', { scene: current, aspectRatio: video.aspectRatio });
      setRenderedScene(result);
      const library = await api.get<{ assets: EditorMediaAsset[] }>('/media/list');
      setMediaAssets(library.assets || []);
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : 'This scene could not be rendered.');
    } finally { setRenderingScene(false); }
  };

  const renderFullFilm = async () => {
    if (scenes.length < 2 || scenes.length > 14) return;
    setRenderingFilm(true); setFilmError(''); setFinishedFilm(null);
    const assetIds: string[] = [];
    try {
      for (let index = 0; index < scenes.length; index++) {
        const scene = scenes[index];
        setFilmProgress(`Rendering scene ${index + 1} of ${scenes.length}…`);
        const rendered = await api.post<SceneRenderResult>('/video/editor/render', { scene, aspectRatio: video.aspectRatio });
        assetIds.push(rendered.asset.id);
      }
      setFilmProgress('Assembling the finished film…');
      const result = await api.post<FilmAssembleResult>('/video/editor/assemble', { assetIds, title: video.title, transition: filmTransition, transitionDuration: filmTransitionDuration });
      setFinishedFilm(result);
      setFilmProgress('');
      const library = await api.get<{ assets: EditorMediaAsset[] }>('/media/list');
      setMediaAssets(library.assets || []);
    } catch (error) {
      setFilmError(error instanceof Error ? error.message : 'The full film could not be assembled.');
      setFilmProgress('');
    } finally { setRenderingFilm(false); }
  };

  const commit = (next: VideoScene[]) => {
    // Keep scene numbering aligned with the actual edited join order after every operation.
    const ordered = next.map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));
    setUndoStack((stack) => [...stack.slice(-19), scenes]);
    setRedoStack([]);
    setScenes(ordered);
    onSave({ ...video, scenes: ordered, estimatedDuration: Math.round(ordered.reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0)) });
    setSaved(true);
  };
  const generateAudioSync = async () => {
    if (!audioSyncAudioId) { setAudioSyncError('Choose an audio file from your private Media Library.'); return; }
    if (!audioSyncModel) { setAudioSyncError('No compatible DeAPI audio-sync model is available on this account.'); return; }
    if (audioSyncDuration < 1 || audioSyncDuration > 11) { setAudioSyncError('The selected audio must be between 1 and 11 seconds. Trim longer audio before generating.'); return; }
    setAudioSyncBusy(true); setAudioSyncError(''); setAudioSyncStatus('Submitting audio and reference frames to DeAPI…'); setAudioSyncResult(null);
    try {
      const submitted = await api.post<{ jobId: string; frameCount: number; duration: number; model: string }>('/video/audio-sync', {
        audioAssetId: audioSyncAudioId,
        firstFrameAssetId: audioSyncImageId || undefined,
        prompt: audioSyncPrompt,
        model: audioSyncModel,
        durationSeconds: audioSyncDuration,
        aspect: video.aspectRatio,
      });
      setAudioSyncStatus('Generating a performance synchronized to your audio…');
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        const status = await api.get<{ state: string; videoUrl?: string; error?: string }>(`/video/status?id=${encodeURIComponent(submitted.jobId)}`);
        if (status.state === 'done' && status.videoUrl) {
          setAudioSyncResult({ jobId: submitted.jobId, videoUrl: status.videoUrl, duration: submitted.duration, frameCount: submitted.frameCount });
          setAudioSyncStatus('Audio-synced clip is ready. Preview it, then apply it to the selected scene.');
          return;
        }
        if (status.state === 'failed') throw new Error(status.error || 'DeAPI could not complete this audio-sync render.');
        setAudioSyncStatus(`Audio-sync render ${status.state === 'queued' ? 'queued' : 'in progress'}…`);
      }
      throw new Error('This render is still processing. You can reopen the job later from your render history.');
    } catch (error) {
      setAudioSyncError(error instanceof Error ? error.message : 'Audio-to-video could not be completed.');
      setAudioSyncStatus('');
    } finally { setAudioSyncBusy(false); }
  };

  const applyAudioSyncResult = () => {
    if (!current || !audioSyncResult) return;
    const next = [...scenes];
    next[selected] = {
      ...current,
      duration: audioSyncResult.duration,
      clipJobId: audioSyncResult.jobId,
      clipUrl: audioSyncResult.videoUrl,
      mediaLayers: (current.mediaLayers || []).filter((layer) => layer.track !== 'main'),
    };
    commit(next);
    setAudioSyncStatus('The audio-synced clip is now the main footage for this scene.');
  };

  const testAiConnections = async () => {
    setAiTestBusy(true); setAiTestError(''); setAiTestResult(null);
    try {
      const result = await api.post<AiTestResult>('/video/editor/ai-test', {});
      setAiTestResult(result);
      setCapabilities((current) => current ? {
        ...current,
        aiDirectorAvailable: result.available,
        aiProviders: result.results.filter((item) => item.ok).map((item) => item.name),
      } : current);
      if (!result.available) setAiTestError('No configured AI writer passed its live connection test. Check the provider messages below before using the AI Director.');
    } catch (error) {
      setAiTestError(error instanceof Error ? error.message : 'AI connection checks could not run.');
    } finally { setAiTestBusy(false); }
  };

  const requestDirectorPlan = async () => {
    setDirectorBusy(true); setDirectorError(''); setDirectorPlan(null);
    try {
      const result = await api.post<DirectorPlan>('/video/director/plan', { instruction: directorInstruction, scenes: scenes.map(({ beat, visualCue, narration, lines, duration, onScreenText, soundEffectCue }) => ({ beat, visualCue, narration, lines, duration, onScreenText, soundEffectCue })) });
      setDirectorPlan(result);
    } catch (error) { setDirectorError(error instanceof Error ? error.message : 'The AI Director could not prepare this edit.'); }
    finally { setDirectorBusy(false); }
  };
  const applyDirectorPlan = () => {
    if (!directorPlan) return;
    const next = scenes.map((scene, index) => {
      const edit = directorPlan.edits.find((item) => item.scene === index + 1);
      if (!edit) return scene;
      const textOverlays = [...(scene.textOverlays || [])];
      if (edit.overlayText?.trim()) textOverlays.push({
        id: `ai-title-${scene.id}-${Date.now()}-${index}`,
        start: 0, end: Math.min(5, Number(scene.duration) || 5),
        text: edit.overlayText.trim().slice(0, 180), y: 'h*0.78',
        fontSize: 44, color: '#ffffff', boxColor: '#101827', boxBorderWidth: 12,
        fadeIn: 0.2, fadeOut: 0.2, weight: 'bold',
      });
      return { ...scene,
        visualCue: edit.visualDirection ? [scene.visualCue, edit.visualDirection].filter(Boolean).join('\n• ') : scene.visualCue,
        textOverlays, soundEffectCue: edit.soundEffect || scene.soundEffectCue, beat: scene.beat || edit.reason };
    });
    commit(next); setDirectorPlan(null); setDirectorInstruction(''); setActiveTool('text');
  };
  const patchCurrent = (patch: Partial<VideoScene>) => {
    if (current) commit(scenes.map((scene, index) => index === selected ? { ...scene, ...patch } : scene));
  };
  const patchLine = (lineIndex: number, patch: Partial<NonNullable<VideoScene['lines']>[number]>) => {
    if (!current?.lines) return;
    patchCurrent({ lines: current.lines.map((line, index) => index === lineIndex ? { ...line, ...patch } : line) });
  };
  const addLine = () => {
    if (!current) return;
    const lines = [...(current.lines || []), { speaker: 'Character', text: '', half: 1 as const }];
    patchCurrent({ lines });
  };
  const removeLine = (lineIndex: number) => {
    if (!current?.lines) return;
    patchCurrent({ lines: current.lines.filter((_, index) => index !== lineIndex) });
  };
  const move = (to: number) => {
    if (to < 0 || to >= scenes.length) return;
    const next = [...scenes]; const [item] = next.splice(selected, 1); next.splice(to, 0, item);
    commit(next); setSelected(to);
  };
  const reorderScene = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= scenes.length || to >= scenes.length) return;
    const next = [...scenes];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
    setSelected(to);
    setSelectedLayerId(null);
  };
  const handleTimelineLayerDrop = (event: React.DragEvent<HTMLDivElement>, targetTrack: 'overlay' | 'audio' | 'text') => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/x-omni-timeline');
    if (!raw) return;
    let payload: { kind: 'media' | 'text'; sceneIndex: number; layerId: string };
    try { payload = JSON.parse(raw); } catch { return; }
    if (!Number.isInteger(payload.sceneIndex) || !payload.layerId || !scenes[payload.sceneIndex]) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const globalTime = Math.max(0, Math.min(totalSeconds, (event.clientX - rect.left) / timelineZoom));
    let targetIndex = sceneStarts.findIndex((range) => globalTime >= range.start && globalTime < range.start + range.duration);
    if (targetIndex < 0) targetIndex = scenes.length - 1;
    const localTime = Math.max(0, globalTime - (sceneStarts[targetIndex]?.start || 0));
    const next = scenes.map((scene) => ({ ...scene, mediaLayers: [...(scene.mediaLayers || [])], textOverlays: [...(scene.textOverlays || [])] }));
    if (payload.kind === 'media' && targetTrack !== 'text') {
      const source = next[payload.sceneIndex];
      const layer = source.mediaLayers.find((item) => item.id === payload.layerId);
      if (!layer || (targetTrack === 'audio' && layer.kind !== 'audio') || (targetTrack === 'overlay' && layer.kind === 'audio')) return;
      source.mediaLayers = source.mediaLayers.filter((item) => item.id !== payload.layerId);
      const targetDuration = Math.max(0.5, Number(next[targetIndex].duration) || 1);
      const startAt = Math.min(localTime, Math.max(0, targetDuration - 0.1));
      next[targetIndex].mediaLayers.push({
        ...layer,
        track: targetTrack,
        startAt,
        duration: Math.min(layer.duration, Math.max(0.1, targetDuration - startAt)),
      });
    } else if (payload.kind === 'text' && targetTrack === 'text') {
      const source = next[payload.sceneIndex];
      const overlay = source.textOverlays.find((item) => item.id === payload.layerId);
      if (!overlay) return;
      const duration = Math.max(0.1, overlay.end - overlay.start);
      source.textOverlays = source.textOverlays.filter((item) => item.id !== payload.layerId);
      const targetDuration = Math.max(0.5, Number(next[targetIndex].duration) || 1);
      const start = Math.min(localTime, Math.max(0, targetDuration - 0.1));
      next[targetIndex].textOverlays.push({ ...overlay, start, end: Math.min(targetDuration, start + duration) });
    } else return;
    commit(next);
    setSelected(targetIndex);
    setSelectedLayerId(payload.layerId);
  };
  const remove = () => {
    if (scenes.length <= 1) return;
    const next = scenes.filter((_, index) => index !== selected);
    commit(next); setSelected(Math.min(selected, next.length - 1));
  };
  const duplicate = () => {
    if (!current) return;
    const next = [...scenes];
    next.splice(selected + 1, 0, { ...current, id: `${current.id}-copy-${Date.now()}`, sceneNumber: scenes.length + 1 });
    commit(next); setSelected(selected + 1);
  };
  const undo = () => {
    const previous = undoStack[undoStack.length - 1]; if (!previous) return;
    const ordered = previous.map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack.slice(-19), scenes]);
    setScenes(ordered);
    onSave({ ...video, scenes: ordered, estimatedDuration: Math.round(ordered.reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0)) });
    setSaved(true);
  };
  const redo = () => {
    const next = redoStack[redoStack.length - 1]; if (!next) return;
    const ordered = next.map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack.slice(-19), scenes]);
    setScenes(ordered);
    onSave({ ...video, scenes: ordered, estimatedDuration: Math.round(ordered.reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0)) });
    setSaved(true);
  };

  const seekGlobalTime = (seconds: number) => {
    const target = Math.max(0, Math.min(Math.max(0, totalSeconds - 0.01), Number(seconds) || 0));
    let index = sceneStarts.findIndex((range) => target >= range.start && target < range.start + range.duration);
    if (index < 0) index = Math.max(0, scenes.length - 1);
    const local = Math.max(0, target - (sceneStarts[index]?.start || 0));
    if (index !== selected) pendingPreviewSeek.current = local;
    setSelected(index);
    setPreviewTime(local);
    setGlobalPlayhead(target);
    if (index === selected && previewRef.current) {
      const sourceIn = Math.max(0, Number(scenes[index]?.mediaLayers?.find((layer) => layer.track === 'main')?.sourceIn ?? scenes[index]?.sourceIn) || 0);
      try { previewRef.current.currentTime = sourceIn + local; } catch { /* wait for media metadata */ }
    }
  };

  const addTextOverlay = () => {
    if (!current) return;
    const start = Math.max(0, Math.min(previewTime, Math.max(0, Number(current.duration) - 0.5)));
    const layer = {
      id: `text-${current.id}-${Date.now()}`, start,
      end: Math.min(Number(current.duration) || 5, Math.max(start + 2.5, 2.5)),
      text: newText.trim() || 'Your title', y: 'h*0.78',
      fontSize: 44, color: '#ffffff', boxColor: '#101827', boxBorderWidth: 12,
      fadeIn: 0.15, fadeOut: 0.15, weight: 'bold' as const,
    };
    patchCurrent({ textOverlays: [...(current.textOverlays || []), layer] });
    setSelectedLayerId(layer.id);
  };

  const patchTextOverlay = (id: string, patch: Partial<NonNullable<VideoScene['textOverlays']>[number]>) => {
    if (!current) return;
    patchCurrent({ textOverlays: (current.textOverlays || []).map((layer) => layer.id === id ? { ...layer, ...patch } : layer) });
  };

  const trimCurrentStart = () => {
    if (!current) return;
    const step = 0.5;
    if (mainLayer) {
      if (mainLayer.duration <= step + 0.25) return;
      patchMediaLayer(mainLayer.id, { sourceIn: mainLayer.sourceIn + step, duration: mainLayer.duration - step });
    } else {
      if (Number(current.duration) <= step + 0.25) return;
      patchCurrent({ sourceIn: Math.max(0, Number(current.sourceIn || 0) + step), duration: Number(current.duration) - step });
    }
    setPreviewTime(0);
  };
  const trimCurrentEnd = () => {
    if (!current || Number(current.duration) <= 0.75) return;
    const nextDuration = Math.max(0.5, Number(current.duration) - 0.5);
    if (mainLayer) patchMediaLayer(mainLayer.id, { duration: Math.min(mainLayer.duration, nextDuration) });
    patchCurrent({ duration: nextDuration });
    setPreviewTime(Math.min(previewTime, nextDuration));
  };

  const splitCurrentScene = () => {
    if (!current) return;
    const splitAt = previewTime;
    const split = splitVideoScene(current, splitAt);
    if (!split) {
      setRenderError('Move the playhead away from the clip edges before splitting. Both resulting clips must be at least half a second.');
      return;
    }
    const next = [...scenes];
    next.splice(selected, 1, split.first, split.second);
    commit(next);
    setSelected(selected + 1);
    pendingPreviewSeek.current = 0;
    setPreviewTime(0);
    setGlobalPlayhead((sceneStarts[selected]?.start || 0) + splitAt);
    setSelectedLayerId(null);
    setRenderError('');
  };

  const selectedTrackBlock = (sceneIndex: number, localTime: number, layerId?: string) => {
    setSelectedLayerId(layerId || null);
    seekGlobalTime((sceneStarts[sceneIndex]?.start || 0) + localTime);
  };

  const renderClipUrl = mainLayer?.kind === 'video' ? (mediaUrls[mainLayer.assetId] || current?.clipUrl || '') : (current?.clipUrl || '');
  const previewSourceIn = Math.max(0, Number(mainLayer?.sourceIn ?? current?.sourceIn) || 0);
  const selectedVisualOverlays = overlayLayers.filter((layer) => previewTime >= layer.startAt && previewTime <= layer.startAt + layer.duration);

  if (!scenes.length) return null;
  const totalMarkers = Math.max(2, Math.min(18, Math.ceil(totalSeconds / 5) + 1));
  const previewTitle = current?.beat || 'Scene ' + (selected + 1);

  return (
    <section id="omnipulse-timeline-editor" className="op-editor overflow-hidden rounded-[18px] border border-white/10 bg-[#101114] text-slate-100 shadow-2xl shadow-black/40">
      <header className="op-editor-topbar flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Clapperboard className="h-4 w-4" /></div>
          <div className="min-w-0"><h2 className="truncate text-sm font-extrabold text-white">OmniPulse Creative Lab</h2><p className="truncate text-[10px] text-slate-500">{video.title} · {scenes.length} clips · {formatTime(totalSeconds)}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={undo} disabled={!undoStack.length} title="Undo" className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-slate-300 hover:border-slate-500 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
          <button type="button" onClick={redo} disabled={!redoStack.length} title="Redo" className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-slate-300 hover:border-slate-500 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
          <span className="hidden h-6 w-px bg-white/10 sm:block" />
          <span className="hidden items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-2 text-[10px] text-emerald-200 sm:inline-flex"><ShieldCheck className="h-3 w-3" /> {saved ? 'Changes saved' : 'Non-destructive edit'}</span>
          <button type="button" onClick={() => void renderCurrentScene()} disabled={renderingScene || !current || (!mainLayer && !current.clipJobId)} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-lime-200 px-3.5 py-2.5 text-[11px] font-extrabold text-[#07111b] shadow-lg shadow-cyan-500/10 disabled:opacity-40">
            {renderingScene ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{renderingScene ? 'Exporting…' : 'Export clip'}
          </button>
        </div>
      </header>

      <div className="op-editor-layout grid grid-cols-1 lg:grid-cols-[54px_218px_minmax(0,1fr)_286px] xl:grid-cols-[58px_232px_minmax(0,1fr)_294px]">
        <nav aria-label="Editing tools" className="order-2 flex gap-1 overflow-x-auto border-y border-white/10 bg-[#15101e] p-2 lg:order-1 lg:flex-col lg:overflow-visible lg:border-y-0 lg:border-r lg:p-2">
          {TOOL_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setActiveTool(id)} aria-pressed={activeTool === id}
              className={activeTool === id ? 'flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-xl border border-cyan-300/25 bg-cyan-300/10 px-2 py-2.5 text-cyan-100 lg:flex-none' : 'flex min-w-[64px] flex-1 flex-col items-center gap-1 rounded-xl border border-transparent px-2 py-2.5 text-slate-500 transition hover:border-white/10 hover:bg-white/5 hover:text-slate-200 lg:flex-none'}>
              <Icon className="h-[18px] w-[18px]" /><span className="text-[9px] font-bold">{label}</span>
            </button>
          ))}
        </nav>

        <aside className="op-media-bin order-3 flex max-h-[220px] min-w-0 flex-col overflow-hidden border-b border-white/10 bg-[#110d18] lg:order-2 lg:max-h-[calc(100vh-180px)] lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-white/[.07] px-3 py-3">
            <div><h3 className="text-[11px] font-extrabold text-white">Media bin</h3><p className="mt-0.5 text-[9px] text-slate-500">{mediaAssets.length} files in your library</p></div>
            <span className="rounded-md border border-violet-300/15 bg-violet-300/[.07] px-2 py-1 text-[8px] font-bold text-violet-200">PROJECT</span>
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-white/[.06] px-2 py-2">
            {(['all', 'video', 'image', 'audio'] as const).map((filter) => <button key={filter} type="button" onClick={() => setMediaFilter(filter)} className={mediaFilter === filter ? 'rounded-md bg-violet-300/15 px-2.5 py-1.5 text-[9px] font-extrabold capitalize text-violet-100' : 'rounded-md px-2.5 py-1.5 text-[9px] font-semibold capitalize text-slate-500 hover:bg-white/[.04] hover:text-slate-200'}>{filter}</button>)}
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
            {mediaLoading && <p className="px-1 py-3 text-[10px] text-slate-500">Loading your media…</p>}
            {!mediaLoading && mediaAssets.filter((asset) => mediaFilter === 'all' || (mediaFilter === 'audio' ? asset.contentType.startsWith('audio/') : mediaFilter === 'image' ? asset.contentType.startsWith('image/') : asset.contentType.startsWith('video/'))).map((asset) => {
              const kind = asset.contentType.startsWith('audio/') ? 'audio' : asset.contentType.startsWith('image/') ? 'image' : 'video';
              return <div key={asset.id} className={selectedAssetId === asset.id ? 'rounded-lg border border-violet-300/25 bg-violet-300/[.07] p-2' : 'rounded-lg border border-white/[.055] bg-white/[.025] p-2 hover:border-white/15'}>
                <button type="button" onClick={() => { setSelectedAssetId(asset.id); setActiveTool(kind === 'audio' ? 'audio' : 'media'); }} className="flex w-full min-w-0 items-center gap-2 text-left">
                  <span className={kind === 'audio' ? 'grid h-9 w-10 shrink-0 place-items-center rounded-md bg-orange-300/10 text-orange-200' : kind === 'image' ? 'grid h-9 w-10 shrink-0 place-items-center rounded-md bg-violet-300/10 text-violet-200' : 'grid h-9 w-10 shrink-0 place-items-center rounded-md bg-blue-300/10 text-blue-200'}>{kind === 'audio' ? <AudioLines className="h-4 w-4" /> : kind === 'image' ? <ImageIcon className="h-4 w-4" /> : <Film className="h-4 w-4" />}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[9px] font-bold text-slate-200">{asset.name}</span><span className="mt-0.5 block text-[8px] uppercase tracking-wider text-slate-600">{kind} · {(asset.size / 1024 / 1024).toFixed(1)} MB</span></span>
                </button>
                <div className="mt-2 flex gap-1">
                  <button type="button" onClick={() => { setSelectedAssetId(asset.id); addMediaLayer(kind === 'audio' ? 'audio' : 'main', asset.id); }} className="flex-1 rounded-md bg-violet-300/[.12] px-2 py-1.5 text-[8px] font-extrabold text-violet-100 hover:bg-violet-300/20">Add to timeline</button>
                  {kind !== 'audio' && <button type="button" onClick={() => { setSelectedAssetId(asset.id); addMediaLayer('overlay', asset.id); }} className="rounded-md border border-white/10 px-2 py-1.5 text-[8px] font-bold text-slate-300">Overlay</button>}
                </div>
              </div>;
            })}
            {!mediaLoading && !mediaAssets.some((asset) => mediaFilter === 'all' || (mediaFilter === 'audio' ? asset.contentType.startsWith('audio/') : mediaFilter === 'image' ? asset.contentType.startsWith('image/') : asset.contentType.startsWith('video/'))) && <p className="px-1 py-3 text-[9px] leading-5 text-slate-500">No matching files yet. Upload clips, images or audio in Creator Upload Studio, then return here.</p>}
          </div>
          <div className="border-t border-white/[.06] p-2.5"><p className="text-[8px] leading-4 text-slate-600">Select a file and add it to the main video, overlay or audio track. Drag timeline layers to reposition them.</p></div>
        </aside>

        <div className="order-1 min-w-0 bg-[#100c17] lg:order-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 sm:px-4">
            <div className="flex items-center gap-2 text-[10px] text-slate-400"><Film className="h-3.5 w-3.5 text-cyan-200" /><span>Preview monitor</span><span className="text-slate-700">/</span><span className="max-w-[180px] truncate text-slate-200">{previewTitle}</span></div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[9px] text-slate-400">{video.aspectRatio} · 30 FPS</span>
              <span className="font-mono text-[10px] tabular-nums text-cyan-200">{formatTime(globalPlayhead)} <span className="text-slate-600">/ {formatTime(totalSeconds)}</span></span>
            </div>
          </div>

          <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(50,81,130,.22),transparent_64%),linear-gradient(145deg,#08101d,#050912)] px-3 py-5 sm:min-h-[410px]">
            <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(130,170,220,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(130,170,220,.10) 1px,transparent 1px)', backgroundSize: '36px 36px' }} />
            <div className="relative mx-auto flex max-h-[64vh] w-full max-w-[560px] items-center justify-center">
              <div className={video.aspectRatio === '9:16' ? 'relative aspect-[9/16] max-h-[62vh] w-auto max-w-full overflow-hidden rounded-lg border border-white/15 bg-black shadow-[0_28px_80px_rgba(0,0,0,.6)]' : video.aspectRatio === '1:1' ? 'relative aspect-square max-h-[62vh] w-full max-w-[62vh] overflow-hidden rounded-lg border border-white/15 bg-black shadow-[0_28px_80px_rgba(0,0,0,.6)]' : 'relative aspect-video w-full overflow-hidden rounded-lg border border-white/15 bg-black shadow-[0_28px_80px_rgba(0,0,0,.6)]'}>
                {mainLayer?.kind === 'image' && mediaUrls[mainLayer.assetId]
                  ? <img src={mediaUrls[mainLayer.assetId]} alt={mainLayer.name} className="h-full w-full object-contain" />
                  : renderClipUrl
                    ? <video ref={previewRef} key={(mainLayer?.assetId || current?.clipUrl || current?.id) + '-' + previewSourceIn} src={renderClipUrl} controls playsInline preload="metadata" onLoadedMetadata={(event) => { event.currentTarget.currentTime = Math.max(0, Math.min(event.currentTarget.duration - 0.05, previewSourceIn + previewTime)); }} onTimeUpdate={(event) => { const local = Math.max(0, Math.min(Number(current?.duration) || 0, event.currentTarget.currentTime - previewSourceIn)); setPreviewTime(local); setGlobalPlayhead((sceneStarts[selected]?.start || 0) + local); }} className="h-full w-full bg-black object-contain" aria-label="Video editing preview" />
                    : <div className="grid h-full min-h-[290px] w-full place-items-center gap-2 px-5 text-center text-xs text-slate-500"><Film className="h-9 w-9 text-slate-700" /><span>Add a source clip from Media, or select a completed generated scene.</span></div>}
                {selectedVisualOverlays.map((layer) => mediaUrls[layer.assetId] ? <div key={layer.id} className="pointer-events-none absolute" style={{ left: layer.x + '%', top: layer.y + '%', width: layer.scale + '%', opacity: layer.opacity, transform: 'translate(-50%,-50%)' }}>{layer.kind === 'image' ? <img src={mediaUrls[layer.assetId]} alt={layer.name} className="w-full rounded shadow-xl" /> : <video src={mediaUrls[layer.assetId]} muted loop autoPlay playsInline className="w-full rounded shadow-xl" />}</div> : null)}
                {(current?.textOverlays || []).filter((layer) => previewTime >= layer.start && previewTime <= layer.end).map((layer) => <div key={layer.id} className="pointer-events-none absolute left-2 right-2 text-center" style={{ top: layer.y === 'h*0.12' ? '12%' : layer.y === 'h*0.5' ? '50%' : '78%', transform: 'translateY(-50%)' }}><span style={{ color: layer.color || '#fff', background: layer.boxColor || 'rgba(8,15,28,.68)', fontSize: Math.max(12, Math.min(54, layer.fontSize * 0.42)), fontWeight: layer.weight === 'regular' ? 500 : 800 }} className="inline-block max-w-full rounded-lg px-3 py-2 shadow-lg">{layer.text}</span></div>)}
                {activeCaption && <div className="pointer-events-none absolute bottom-4 left-2 right-2 text-center"><span className="inline-block max-w-[94%] rounded-md bg-black/80 px-3 py-1.5 text-sm font-semibold text-white shadow-lg">{activeCaption.text}</span></div>}
              </div>
            </div>
            <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 sm:left-5 sm:right-5">
              <button type="button" onClick={() => seekGlobalTime(Math.max(0, globalPlayhead - 1))} title="Back one second" className="rounded-lg border border-white/10 bg-black/40 p-2 text-slate-300 hover:text-white"><ArrowDown className="h-3.5 w-3.5 rotate-90" /></button>
              <button type="button" onClick={() => { if (previewRef.current) { if (previewRef.current.paused) void previewRef.current.play(); else previewRef.current.pause(); } }} title="Play or pause" className="grid h-9 w-9 place-items-center rounded-full border border-cyan-200/30 bg-cyan-200/15 text-cyan-100"><Play className="h-4 w-4 fill-current" /></button>
              <button type="button" onClick={() => seekGlobalTime(Math.min(totalSeconds, globalPlayhead + 1))} title="Forward one second" className="rounded-lg border border-white/10 bg-black/40 p-2 text-slate-300 hover:text-white"><ArrowDown className="h-3.5 w-3.5 -rotate-90" /></button>
              <input aria-label="Preview playhead" type="range" min={0} max={Math.max(0.5, totalSeconds)} step={0.05} value={Math.min(globalPlayhead, totalSeconds)} onChange={(event) => seekGlobalTime(Number(event.target.value))} className="min-w-0 flex-1 accent-cyan-300" />
              <span className="font-mono text-[9px] tabular-nums text-slate-400">{formatTime(globalPlayhead)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#0e1828] px-3 py-2.5 sm:px-4">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={trimCurrentStart} disabled={!current || Number(current.duration) <= 0.75} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[.04] px-2 py-2 text-[9px] font-bold text-slate-200 disabled:opacity-30">Trim start −0.5s</button>
              <button type="button" onClick={trimCurrentEnd} disabled={!current || Number(current.duration) <= 0.75} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[.04] px-2 py-2 text-[9px] font-bold text-slate-200 disabled:opacity-30">Trim end −0.5s</button>
              <button type="button" onClick={splitCurrentScene} disabled={!current || previewTime < 0.5 || previewTime > Number(current.duration) - 0.5} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-300/5 px-2.5 py-2 text-[10px] font-bold text-cyan-100 disabled:opacity-30"><Split className="h-3.5 w-3.5" />Split at playhead</button>
              <button type="button" onClick={() => move(selected - 1)} disabled={selected <= 0} className="rounded-lg border border-slate-700 p-2 text-slate-300 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => move(selected + 1)} disabled={selected >= scenes.length - 1} className="rounded-lg border border-slate-700 p-2 text-slate-300 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={duplicate} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-2 text-[10px] text-slate-300 hover:text-white"><Copy className="h-3.5 w-3.5" />Duplicate</button>
              <button type="button" onClick={remove} disabled={scenes.length < 2} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/20 px-2.5 py-2 text-[10px] text-rose-200 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" />Delete</button>
            </div>
            <div className="flex items-center gap-2"><span className="text-[9px] text-slate-500">Zoom</span><input aria-label="Timeline zoom" type="range" min="14" max="46" value={timelineZoom} onChange={(event) => setTimelineZoom(Number(event.target.value))} className="w-20 accent-cyan-300" /></div>
          </div>
        </div>

        <aside className="order-4 min-w-0 border-t border-white/10 bg-[#120e19] lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><h3 className="text-xs font-extrabold text-white">{TOOL_ITEMS.find((tool) => tool.id === activeTool)?.label || 'Inspector'}</h3><p className="mt-0.5 text-[9px] text-slate-500">Selected clip and track controls</p></div><Settings2 className="h-4 w-4 text-cyan-200" /></div>
          <div className="max-h-[620px] space-y-4 overflow-y-auto p-3 sm:p-4 lg:max-h-[calc(100vh-250px)]">
            {activeTool === 'media' && <>
              <div className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Add from your library</p><select value={selectedAssetId} onChange={(event) => setSelectedAssetId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-[#08111e] px-3 py-2.5 text-xs text-white"><option value="">Choose a video, image or audio</option>{mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>
                <div className="grid grid-cols-3 gap-1.5"><button type="button" onClick={() => addMediaLayer('main')} disabled={!selectedAssetId || (!mediaAssets.find((asset) => asset.id === selectedAssetId)?.contentType.startsWith('video/') && !mediaAssets.find((asset) => asset.id === selectedAssetId)?.contentType.startsWith('image/'))} className="rounded-lg bg-cyan-300 px-2 py-2 text-[9px] font-extrabold text-slate-950 disabled:opacity-30">Main clip</button><button type="button" onClick={() => addMediaLayer('overlay')} disabled={!selectedAssetId || mediaAssets.find((asset) => asset.id === selectedAssetId)?.contentType.startsWith('audio/')} className="rounded-lg border border-slate-700 px-2 py-2 text-[9px] font-bold text-slate-200 disabled:opacity-30">Overlay</button><button type="button" onClick={() => addMediaLayer('audio')} disabled={!selectedAssetId || !mediaAssets.find((asset) => asset.id === selectedAssetId)?.contentType.startsWith('audio/')} className="rounded-lg border border-slate-700 px-2 py-2 text-[9px] font-bold text-slate-200 disabled:opacity-30">Audio</button></div>
                <p className="text-[9px] leading-4 text-slate-500">Adding a new main clip replaces only this scene’s source layer. Overlay and audio items stay on separate tracks.</p>
              </div>
              <div className="border-t border-white/10 pt-3"><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Private media library</p><span className="text-[9px] text-slate-600">{mediaAssets.length} files</span></div>{mediaLoading ? <p className="text-xs text-slate-500">Loading media…</p> : mediaAssets.length ? <div className="space-y-1.5">{mediaAssets.slice(0, 18).map((asset) => <button key={asset.id} type="button" onClick={() => { setSelectedAssetId(asset.id); setActiveTool(asset.contentType.startsWith('audio/') ? 'audio' : 'media'); }} className={selectedAssetId === asset.id ? 'flex w-full items-center gap-2 rounded-lg border border-cyan-300/25 bg-cyan-300/5 p-2 text-left' : 'flex w-full items-center gap-2 rounded-lg border border-transparent bg-white/[.025] p-2 text-left hover:border-white/10'}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/5 text-cyan-200">{asset.contentType.startsWith('audio/') ? <AudioLines className="h-3.5 w-3.5" /> : asset.contentType.startsWith('image/') ? <ImageIcon className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}</span><span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">{asset.name}</span></button>)}</div> : <p className="text-[10px] text-slate-500">Upload footage, photos or sound in Creator Upload Studio first.</p>}</div>
            </>}

            {activeTool === 'text' && <>
              <div className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Add a title or graphic</p><textarea value={newText} onChange={(event) => setNewText(event.target.value)} rows={2} maxLength={180} className="w-full rounded-lg border border-slate-700 bg-[#08111e] px-3 py-2 text-xs text-white" /><button type="button" onClick={addTextOverlay} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500 px-3 py-2.5 text-[10px] font-extrabold text-white"><Plus className="h-3.5 w-3.5" />Add text to timeline</button></div>
              <div className="border-t border-white/10 pt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Text layers</p>{(current?.textOverlays || []).map((layer) => <button key={layer.id} type="button" onClick={() => setSelectedLayerId(layer.id)} className={selectedLayerId === layer.id ? 'mb-1 flex w-full items-center justify-between rounded-lg border border-violet-300/30 bg-violet-300/10 p-2 text-left text-[10px] text-white' : 'mb-1 flex w-full items-center justify-between rounded-lg border border-slate-800 bg-white/[.025] p-2 text-left text-[10px] text-slate-300'}><span className="min-w-0 truncate">{layer.text}</span><span className="ml-2 shrink-0 text-slate-500">{formatTime(layer.start)}</span></button>)}</div>
              {selectedTextOverlay && <div className="space-y-2 border-t border-white/10 pt-3"><p className="text-[10px] font-bold uppercase tracking-wider text-violet-200">Text inspector</p><textarea value={selectedTextOverlay.text} onChange={(event) => patchTextOverlay(selectedTextOverlay.id, { text: event.target.value })} rows={2} className="w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white" /><label className="block text-[10px] text-slate-400">Start · {selectedTextOverlay.start.toFixed(1)}s<input type="range" min="0" max={Math.max(0.1, current?.duration || 1)} step="0.1" value={selectedTextOverlay.start} onChange={(event) => patchTextOverlay(selectedTextOverlay.id, { start: Math.min(Number(event.target.value), selectedTextOverlay.end - 0.1) })} className="w-full accent-violet-300" /></label><label className="block text-[10px] text-slate-400">End · {selectedTextOverlay.end.toFixed(1)}s<input type="range" min={selectedTextOverlay.start + 0.1} max={Math.max(0.2, current?.duration || 1)} step="0.1" value={selectedTextOverlay.end} onChange={(event) => patchTextOverlay(selectedTextOverlay.id, { end: Number(event.target.value) })} className="w-full accent-violet-300" /></label><div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">Size<input type="number" min="18" max="112" value={selectedTextOverlay.fontSize} onChange={(event) => patchTextOverlay(selectedTextOverlay.id, { fontSize: Math.max(18, Math.min(112, Number(event.target.value) || 44)) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white" /></label><label className="text-[10px] text-slate-400">Position<select value={selectedTextOverlay.y} onChange={(event) => patchTextOverlay(selectedTextOverlay.id, { y: event.target.value as NonNullable<VideoScene['textOverlays']>[number]['y'] })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white"><option value="h*0.12">Top</option><option value="h*0.5">Center</option><option value="h*0.78">Bottom</option></select></label></div><label className="block text-[10px] text-slate-400">Text colour<input type="color" value={selectedTextOverlay.color || '#ffffff'} onChange={(event) => patchTextOverlay(selectedTextOverlay.id, { color: event.target.value })} className="mt-1 h-9 w-full rounded border border-slate-700 bg-[#08111e]" /></label><button type="button" onClick={() => { patchCurrent({ textOverlays: (current?.textOverlays || []).filter((layer) => layer.id !== selectedTextOverlay.id) }); setSelectedLayerId(null); }} className="w-full rounded-lg border border-rose-500/20 px-3 py-2 text-[10px] font-bold text-rose-200">Delete text layer</button></div>}
            </>}

            {activeTool === 'audio' && <>
              <div className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sound library</p><select value={selectedAssetId} onChange={(event) => setSelectedAssetId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-[#08111e] px-3 py-2.5 text-xs text-white"><option value="">Choose audio</option>{mediaAssets.filter((asset) => asset.contentType.startsWith('audio/')).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><button type="button" onClick={() => addMediaLayer('audio')} disabled={!selectedAssetId || !mediaAssets.find((asset) => asset.id === selectedAssetId)?.contentType.startsWith('audio/')} className="w-full rounded-lg bg-amber-300 px-3 py-2.5 text-[10px] font-extrabold text-slate-950 disabled:opacity-30">Add audio to timeline</button></div>
              <div className="border-t border-white/10 pt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Audio layers</p>{audioLayers.map((layer) => <button type="button" key={layer.id} onClick={() => setSelectedLayerId(layer.id)} className={selectedLayerId === layer.id ? 'mb-1 w-full rounded-lg border border-amber-300/30 bg-amber-300/10 p-2 text-left text-[10px] text-amber-100' : 'mb-1 w-full rounded-lg border border-slate-800 p-2 text-left text-[10px] text-slate-300'}>{layer.name} · {formatTime(layer.startAt)}</button>)}</div>
              {selectedLayer?.track === 'audio' && <div className="space-y-3 border-t border-white/10 pt-3"><p className="text-[10px] font-bold uppercase tracking-wider text-amber-200">Audio inspector</p><label className="block text-[10px] text-slate-400">Start · {selectedLayer.startAt.toFixed(1)}s<input type="range" min="0" max={Math.max(0.1, current?.duration || 1)} step="0.1" value={selectedLayer.startAt} onChange={(event) => patchMediaLayer(selectedLayer.id, { startAt: Number(event.target.value) })} className="w-full accent-amber-300" /></label><label className="block text-[10px] text-slate-400">Volume · {Math.round(selectedLayer.volume * 100)}%<input type="range" min="0" max="1.5" step="0.05" value={selectedLayer.volume} onChange={(event) => patchMediaLayer(selectedLayer.id, { volume: Number(event.target.value) })} className="w-full accent-amber-300" /></label><div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">Fade in<input type="number" min="0" max="3" step="0.1" value={selectedLayer.fadeIn || 0} onChange={(event) => patchMediaLayer(selectedLayer.id, { fadeIn: Number(event.target.value) })} className="mt-1 w-full rounded border border-slate-700 bg-[#08111e] p-2 text-xs text-white" /></label><label className="text-[10px] text-slate-400">Fade out<input type="number" min="0" max="3" step="0.1" value={selectedLayer.fadeOut || 0} onChange={(event) => patchMediaLayer(selectedLayer.id, { fadeOut: Number(event.target.value) })} className="mt-1 w-full rounded border border-slate-700 bg-[#08111e] p-2 text-xs text-white" /></label></div><button type="button" onClick={() => removeMediaLayer(selectedLayer.id)} className="w-full rounded-lg border border-rose-500/20 px-3 py-2 text-[10px] text-rose-200">Remove audio layer</button></div>}
              <div className="space-y-2 border-t border-white/10 pt-3"><p className="text-[10px] font-bold uppercase tracking-wider text-cyan-100">Audio-to-video · Lip Sync</p><select value={audioSyncAudioId} onChange={(event) => setAudioSyncAudioId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-[10px] text-white"><option value="">Choose a speaker audio file</option>{mediaAssets.filter((asset) => /^(audio\/mpeg|audio\/mp3|audio\/wav|audio\/x-wav|audio\/ogg|audio\/flac)/i.test(asset.contentType)).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><select value={audioSyncImageId} onChange={(event) => setAudioSyncImageId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-[10px] text-white"><option value="">Generate speaker from audio only</option>{mediaAssets.filter((asset) => asset.contentType.startsWith('image/')).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><audio controls preload="metadata" src={audioSyncAudioUrl || undefined} className="w-full" onLoadedMetadata={(event) => setAudioSyncDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} /><select value={audioSyncModel} onChange={(event) => setAudioSyncModel(event.target.value)} disabled={!audioSyncModels.length} className="w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-[10px] text-white"><option value="">Choose compatible model</option>{audioSyncModels.map((model) => <option key={model.slug} value={model.slug}>{model.name}</option>)}</select><textarea value={audioSyncPrompt} onChange={(event) => setAudioSyncPrompt(event.target.value)} rows={2} className="w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-[10px] text-white" /><button type="button" onClick={() => void generateAudioSync()} disabled={audioSyncBusy || !audioSyncAudioId || !audioSyncModel || audioSyncDuration < 1 || audioSyncDuration > 11} className="w-full rounded-lg bg-cyan-300 px-3 py-2 text-[10px] font-extrabold text-slate-950 disabled:opacity-30">{audioSyncBusy ? 'Generating lip sync…' : 'Generate lip-synced video'}</button>{audioSyncStatus && <p role="status" className="text-[9px] text-cyan-100">{audioSyncStatus}</p>}{audioSyncError && <p role="alert" className="text-[9px] text-rose-300">{audioSyncError}</p>}</div>
            </>}

            {activeTool === 'captions' && <>
              <div className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Speech to captions</p><select value={selectedAssetId} onChange={(event) => setSelectedAssetId(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-[#08111e] px-3 py-2.5 text-xs text-white"><option value="">Choose audio or video</option>{mediaAssets.filter((asset) => /^(audio|video)\//.test(asset.contentType)).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><button type="button" onClick={() => void transcribeSelectedAsset()} disabled={!selectedAssetId || transcribing || !capabilities?.transcriptionAvailable || !/^(audio|video)\//.test(mediaAssets.find((asset) => asset.id === selectedAssetId)?.contentType || '')} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500 px-3 py-2.5 text-[10px] font-extrabold text-white disabled:opacity-30">{transcribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}{transcribing ? 'Transcribing audio…' : 'Create timed captions'}</button><p className="text-[9px] leading-4 text-slate-500">{capabilities?.transcriptionAvailable ? 'Uses Groq Whisper to create timestamped speech segments.' : 'Transcription is unavailable: GROQ_API_KEY is not configured on the server.'}</p></div>
              {transcript && <div className="space-y-2 border-t border-white/10 pt-3"><p className="text-[10px] font-bold text-violet-200">{transcript.name} · {transcript.segments.length} segments</p><div className="max-h-40 space-y-1 overflow-y-auto">{transcript.segments.slice(0, 25).map((segment, index) => <div key={index} className="flex gap-2 text-[9px]"><span className="shrink-0 font-mono text-slate-500">{formatTime(segment.start)}</span><span className="text-slate-300">{segment.text}</span></div>)}</div><button type="button" onClick={applyTranscript} className="w-full rounded-lg bg-violet-500 px-3 py-2 text-[10px] font-bold text-white">Apply captions to selected clip</button></div>}
              <div className="border-t border-white/10 pt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Caption cues</p>{(current?.captions || []).map((cue, index) => <div key={index} className="mb-1 rounded-lg border border-slate-800 bg-white/[.025] p-2"><p className="text-[9px] text-slate-500">{formatTime(cue.start)} – {formatTime(cue.end)}</p><p className="mt-1 text-[10px] text-slate-300">{cue.text}</p></div>)}</div>
            </>}

            {activeTool === 'ai' && <>
              <div className="rounded-xl border border-violet-300/15 bg-violet-300/[.045] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-violet-100">AI services</p>
                  <span className={aiTestResult ? (aiTestResult.available ? 'rounded-full bg-emerald-300/10 px-2 py-1 text-[9px] text-emerald-200' : 'rounded-full bg-rose-300/10 px-2 py-1 text-[9px] text-rose-200') : capabilities?.aiDirectorAvailable ? 'rounded-full bg-amber-300/10 px-2 py-1 text-[9px] text-amber-200' : 'rounded-full bg-rose-300/10 px-2 py-1 text-[9px] text-rose-200'}>
                    {aiTestResult ? (aiTestResult.available ? 'Connection passed' : 'Connection failed') : capabilities?.aiDirectorAvailable ? 'Configured · untested' : 'Not configured'}
                  </span>
                </div>
                <p className="mt-2 text-[9px] leading-4 text-slate-400">{capabilityError || (capabilities?.aiDirectorAvailable ? 'Configured writers: ' + capabilities.aiProviders.join(', ') + '. Run the live test before relying on AI editing.' : 'No AI writer is configured. Add a supported Gemini or backup provider key in Vercel.')}</p>
                <button type="button" onClick={() => void testAiConnections()} disabled={aiTestBusy} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-200/20 bg-violet-300/10 px-3 py-2.5 text-[10px] font-extrabold text-violet-100 hover:bg-violet-300/15 disabled:opacity-40">
                  {aiTestBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {aiTestBusy ? 'Testing AI providers…' : 'Test AI connections'}
                </button>
                {aiTestResult && <div className="mt-3 space-y-1.5 border-t border-white/[.07] pt-2">
                  {aiTestResult.results.map((result, index) => <div key={result.name + index} className="flex items-start gap-2 text-[9px]">
                    <span className={result.ok ? 'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300' : 'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-300'} />
                    <span className="min-w-0"><strong className={result.ok ? 'text-emerald-200' : 'text-rose-200'}>{result.name}</strong><span className="block leading-4 text-slate-500">{result.message}</span></span>
                  </div>)}
                </div>}
                {aiTestError && <p role="alert" className="mt-2 text-[9px] leading-4 text-rose-300">{aiTestError}</p>}
              </div>
              <div className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AI Director · edit by instruction</p><textarea value={directorInstruction} onChange={(event) => setDirectorInstruction(event.target.value)} rows={3} maxLength={2400} placeholder="Tighten the opening, add a title at the reveal, and suggest a stronger cut into scene three…" className="w-full rounded-lg border border-slate-700 bg-[#08111e] p-2.5 text-xs text-white" /><button type="button" onClick={() => void requestDirectorPlan()} disabled={directorBusy || directorInstruction.trim().length < 8 || !capabilities?.aiDirectorAvailable} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3 py-2.5 text-[10px] font-extrabold text-slate-950 disabled:opacity-30">{directorBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{directorBusy ? 'Preparing edit proposal…' : 'Ask AI Director'}</button>{directorError && <p role="alert" className="text-[10px] text-rose-300">{directorError}</p>}</div>
              {directorPlan && <div className="space-y-2 border-t border-white/10 pt-3"><p className="text-[10px] font-bold text-cyan-100">{directorPlan.summary}</p>{directorPlan.edits.map((edit, index) => <div key={index} className="rounded-lg border border-slate-800 bg-white/[.025] p-2"><p className="text-[10px] font-bold text-white">Scene {edit.scene} · {edit.reason}</p>{edit.visualDirection && <p className="mt-1 text-[9px] leading-4 text-slate-400">{edit.visualDirection}</p>}{edit.overlayText && <p className="mt-1 text-[9px] text-violet-200">Title: {edit.overlayText}</p>}</div>)}<button type="button" onClick={applyDirectorPlan} className="w-full rounded-lg bg-emerald-400 px-3 py-2 text-[10px] font-extrabold text-slate-950">Apply proposal to timeline</button></div>}
              <div className="space-y-2 border-t border-white/10 pt-3"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Contextual media matching</p><button type="button" onClick={() => void requestMediaMatches()} disabled={mediaMatchBusy || !transcript?.segments?.length || !mediaAssets.length || !capabilities?.aiDirectorAvailable} className="w-full rounded-lg border border-cyan-300/20 bg-cyan-300/5 px-3 py-2.5 text-[10px] font-bold text-cyan-100 disabled:opacity-30">{mediaMatchBusy ? 'Matching your media…' : 'Find matching moments'}</button><p className="text-[9px] leading-4 text-slate-500">{!transcript?.segments?.length ? 'First create a transcript in the Captions tool. The Director then matches timestamped speech to files in your private library.' : !mediaAssets.length ? 'Upload supporting footage, images or sound before matching.' : 'The Director suggests placements using only your uploaded media. Review placements before applying.'}</p>{mediaMatchError && <p role="alert" className="text-[10px] text-rose-300">{mediaMatchError}</p>}{mediaMatchPlan && <div className="space-y-2">{mediaMatchPlan.summary && <p className="text-[9px] text-slate-300">{mediaMatchPlan.summary}</p>}{mediaMatchPlan.matches.map((match, index) => <div key={match.assetId + index} className="rounded-lg border border-slate-800 p-2"><p className="truncate text-[10px] font-bold text-white">{match.name}</p><p className="text-[9px] text-slate-500">{formatTime(match.startAt)} · {match.duration.toFixed(1)}s · {match.reason}</p></div>)}<button type="button" onClick={applyMediaMatches} className="w-full rounded-lg bg-cyan-300 px-3 py-2 text-[10px] font-extrabold text-slate-950">Place {mediaMatchPlan.matches.length} matches on tracks</button></div>}</div>
            </>}
            {selectedLayer && <div className="space-y-3 border-t border-white/10 pt-3">
              <div><p className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-100">Clip inspector</p><p className="mt-1 truncate text-[10px] text-slate-400">{selectedLayer.name}</p></div>
              <label className="block text-[10px] text-slate-400">Timeline start · {selectedLayer.startAt.toFixed(1)}s<input type="range" min="0" max={Math.max(0.1, (current?.duration || 1) - 0.1)} step="0.1" value={selectedLayer.startAt} onChange={(event) => patchMediaLayer(selectedLayer.id, { startAt: Number(event.target.value) })} className="w-full accent-cyan-300" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-slate-400">Duration<input type="number" min="0.5" max={Math.max(0.5, current?.duration || 1)} step="0.1" value={selectedLayer.duration} onChange={(event) => patchMediaLayer(selectedLayer.id, { duration: Math.max(0.5, Math.min(Number(current?.duration) || 1, Number(event.target.value) || 0.5)) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white" /></label>
                <label className="text-[10px] text-slate-400">Source in<input type="number" min="0" max="3600" step="0.1" value={selectedLayer.sourceIn} onChange={(event) => patchMediaLayer(selectedLayer.id, { sourceIn: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white" /></label>
              </div>
              <label className="block text-[10px] text-slate-400">Opacity · {Math.round(selectedLayer.opacity * 100)}%<input type="range" min="0" max="1" step="0.05" value={selectedLayer.opacity} onChange={(event) => patchMediaLayer(selectedLayer.id, { opacity: Number(event.target.value) })} className="w-full accent-cyan-300" /></label>
              {selectedLayer.track === 'overlay' && <>
                <label className="block text-[10px] text-slate-400">Scale · {Math.round(selectedLayer.scale)}%<input type="range" min="10" max="100" step="1" value={selectedLayer.scale} onChange={(event) => patchMediaLayer(selectedLayer.id, { scale: Number(event.target.value) })} className="w-full accent-cyan-300" /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] text-slate-400">Position X<input type="range" min="0" max="100" value={selectedLayer.x} onChange={(event) => patchMediaLayer(selectedLayer.id, { x: Number(event.target.value) })} className="w-full accent-cyan-300" /></label>
                  <label className="text-[10px] text-slate-400">Position Y<input type="range" min="0" max="100" value={selectedLayer.y} onChange={(event) => patchMediaLayer(selectedLayer.id, { y: Number(event.target.value) })} className="w-full accent-cyan-300" /></label>
                </div>
                {selectedLayer.kind === 'video' && <label className="flex items-center gap-2 text-[10px] text-slate-300"><input type="checkbox" checked={!!selectedLayer.chromaKey} onChange={(event) => patchMediaLayer(selectedLayer.id, { chromaKey: event.target.checked })} className="accent-cyan-300" />Remove green screen</label>}
              </>}
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-slate-400">Fade in<input type="number" min="0" max="3" step="0.1" value={selectedLayer.fadeIn || 0} onChange={(event) => patchMediaLayer(selectedLayer.id, { fadeIn: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white" /></label>
                <label className="text-[10px] text-slate-400">Fade out<input type="number" min="0" max="3" step="0.1" value={selectedLayer.fadeOut || 0} onChange={(event) => patchMediaLayer(selectedLayer.id, { fadeOut: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white" /></label>
              </div>
              <button type="button" onClick={() => removeMediaLayer(selectedLayer.id)} className="w-full rounded-lg border border-rose-500/20 px-3 py-2 text-[10px] font-bold text-rose-200">Remove selected layer</button>
            </div>}
            {!selectedLayer && !selectedTextOverlay && current && <div className="space-y-3 border-t border-white/10 pt-3">
              <div><p className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-100">Scene inspector</p><p className="mt-1 text-[9px] text-slate-500">Clip timing, speed and finishing controls</p></div>
              <label className="block text-[10px] text-slate-400">Duration · {Number(current.duration).toFixed(1)}s<input type="range" min="1" max="90" step="0.5" value={current.duration} onChange={(event) => patchCurrent({ duration: Number(event.target.value) })} className="w-full accent-cyan-300" /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[10px] text-slate-400">Playback speed<select value={current.playbackSpeed || 1} onChange={(event) => patchCurrent({ playbackSpeed: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
                <label className="text-[10px] text-slate-400">Fit mode<select value={current.fitMode || 'contain'} onChange={(event) => patchCurrent({ fitMode: event.target.value as 'contain' | 'cover' })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white"><option value="contain">Contain</option><option value="cover">Fill / cover</option></select></label>
                <label className="text-[10px] text-slate-400">Color grade<select value={current.colorGrade || 'none'} onChange={(event) => patchCurrent({ colorGrade: event.target.value as NonNullable<VideoScene['colorGrade']> })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white"><option value="none">Original</option><option value="cinematic">Cinematic</option><option value="warm">Warm</option><option value="cool">Cool</option><option value="monochrome">Monochrome</option><option value="vintage">Vintage</option><option value="vivid">Vivid</option></select></label>
                <label className="text-[10px] text-slate-400">Title position<select value={current.overlayPosition || 'center'} onChange={(event) => patchCurrent({ overlayPosition: event.target.value as 'top' | 'center' | 'bottom' })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white"><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label>
              </div>
              <div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">Fade in<input type="number" min="0" max="3" step="0.1" value={current.clipFadeIn || 0} onChange={(event) => patchCurrent({ clipFadeIn: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white" /></label><label className="text-[10px] text-slate-400">Fade out<input type="number" min="0" max="3" step="0.1" value={current.clipFadeOut || 0} onChange={(event) => patchCurrent({ clipFadeOut: Number(event.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-[#08111e] p-2 text-xs text-white" /></label></div>
            </div>}
          </div>
        </aside>
      </div>

      <div className="op-editor-timeline border-t border-white/10 bg-[#080e19] p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xs font-extrabold uppercase tracking-wider text-white">Multitrack timeline</h3><p className="mt-1 text-[9px] text-slate-500">Click any clip or layer to select it. Split with the playhead and adjust timing in the inspector.</p></div><div className="flex items-center gap-2"><span className="font-mono text-[10px] text-cyan-200">{formatTime(globalPlayhead)}</span><span className="text-[9px] text-slate-600">of</span><span className="font-mono text-[10px] text-slate-400">{formatTime(totalSeconds)}</span></div></div>
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0c1421]">
          <div className="relative" style={{ width: timelineWidth, minWidth: '100%' }}>
            <div className="relative ml-[94px] h-7 border-b border-white/10">
              {Array.from({ length: totalMarkers }, (_, index) => {
                const time = Math.min(totalSeconds, index * 5);
                return <div key={index} className="absolute top-0 h-full border-l border-white/10 pl-1.5 pt-1 text-[8px] font-mono text-slate-600" style={{ left: time * timelineZoom }}>{formatTime(time)}</div>;
              })}
            </div>
            {([
              { id: 'video', label: 'VIDEO' },
              { id: 'overlay', label: 'OVERLAY' },
              { id: 'text', label: 'TEXT' },
              { id: 'captions', label: 'CAPTIONS' },
              { id: 'audio', label: 'AUDIO' },
            ] as const).map((track) => <div key={track.id} className="op-track-row relative grid min-h-[58px] grid-cols-[94px_1fr] border-b border-white/[.06] last:border-b-0">
              <div className="flex items-center px-3 text-[8px] font-extrabold tracking-wider text-slate-500">{track.label}</div>
              <div className="relative min-h-[58px]" onDragOver={(event) => { if (track.id === 'overlay' || track.id === 'audio' || track.id === 'text') event.preventDefault(); }} onDrop={(event) => { if (track.id === 'overlay' || track.id === 'audio' || track.id === 'text') handleTimelineLayerDrop(event, track.id); }}>
                {track.id === 'video' && scenes.map((scene, index) => {
                  const range = sceneStarts[index];
                  return <button key={scene.id} type="button" draggable onDragStart={(event) => event.dataTransfer.setData('application/x-omni-scene', String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const from = Number(event.dataTransfer.getData('application/x-omni-scene')); if (Number.isInteger(from)) reorderScene(from, index); }} onClick={() => selectedTrackBlock(index, 0)} title={scene.beat || 'Scene ' + (index + 1)} className={index === selected ? 'absolute top-1 h-10 overflow-hidden rounded-md border border-cyan-200 bg-gradient-to-r from-cyan-400/35 to-blue-500/35 px-2 text-left shadow-[0_0_18px_rgba(34,211,238,.12)]' : 'absolute top-1 h-10 overflow-hidden rounded-md border border-cyan-500/20 bg-gradient-to-r from-cyan-500/15 to-blue-500/15 px-2 text-left hover:border-cyan-300/50'} style={{ left: range.start * timelineZoom, width: Math.max(26, range.duration * timelineZoom - 3) }}><span className="block truncate text-[9px] font-bold text-white">Clip {index + 1}</span><span className="block truncate text-[8px] text-cyan-100/70">{formatTime(range.duration)}</span></button>;
                })}
                {track.id === 'overlay' && scenes.flatMap((scene, index) => (scene.mediaLayers || []).filter((layer) => layer.track === 'overlay').map((layer) => {
                  const left = ((sceneStarts[index]?.start || 0) + layer.startAt) * timelineZoom;
                  return <button key={layer.id} type="button" draggable onDragStart={(event) => event.dataTransfer.setData('application/x-omni-timeline', JSON.stringify({ kind: 'media', sceneIndex: index, layerId: layer.id }))} onClick={() => selectedTrackBlock(index, layer.startAt, layer.id)} title={layer.name} className={selectedLayerId === layer.id ? 'absolute top-1 h-10 truncate rounded-md border border-blue-200 bg-blue-400/35 px-1.5 text-left text-[8px] text-white' : 'absolute top-1 h-10 truncate rounded-md border border-blue-400/20 bg-blue-500/20 px-1.5 text-left text-[8px] text-blue-100'} style={{ left, width: Math.max(18, layer.duration * timelineZoom - 2) }}>{layer.name}</button>;
                }))}
                {track.id === 'text' && scenes.flatMap((scene, index) => (scene.textOverlays || []).map((layer) => {
                  const left = ((sceneStarts[index]?.start || 0) + layer.start) * timelineZoom;
                  return <button key={layer.id} type="button" draggable onDragStart={(event) => event.dataTransfer.setData('application/x-omni-timeline', JSON.stringify({ kind: 'text', sceneIndex: index, layerId: layer.id }))} onClick={() => { setActiveTool('text'); selectedTrackBlock(index, layer.start, layer.id); }} title={layer.text} className={selectedLayerId === layer.id ? 'absolute top-1 h-10 truncate rounded-md border border-violet-200 bg-violet-400/35 px-1.5 text-left text-[8px] text-white' : 'absolute top-1 h-10 truncate rounded-md border border-violet-400/20 bg-violet-500/20 px-1.5 text-left text-[8px] text-violet-100'} style={{ left, width: Math.max(18, (layer.end - layer.start) * timelineZoom - 2) }}>{layer.text}</button>;
                }))}
                {track.id === 'captions' && scenes.flatMap((scene, index) => (scene.captions || []).map((cue, cueIndex) => {
                  const left = ((sceneStarts[index]?.start || 0) + cue.start) * timelineZoom;
                  return <button key={scene.id + '-caption-' + cueIndex} type="button" onClick={() => { setActiveTool('captions'); selectedTrackBlock(index, cue.start); }} title={cue.text} className="absolute top-1 h-10 truncate rounded-md border border-pink-400/20 bg-pink-500/15 px-1.5 text-left text-[8px] text-pink-100" style={{ left, width: Math.max(14, (cue.end - cue.start) * timelineZoom - 2) }}>{cue.text}</button>;
                }))}
                {track.id === 'audio' && scenes.flatMap((scene, index) => (scene.mediaLayers || []).filter((layer) => layer.track === 'audio').map((layer) => {
                  const left = ((sceneStarts[index]?.start || 0) + layer.startAt) * timelineZoom;
                  return <button key={layer.id} type="button" draggable onDragStart={(event) => event.dataTransfer.setData('application/x-omni-timeline', JSON.stringify({ kind: 'media', sceneIndex: index, layerId: layer.id }))} onClick={() => { setActiveTool('audio'); selectedTrackBlock(index, layer.startAt, layer.id); }} title={layer.name} className={selectedLayerId === layer.id ? 'absolute top-1 h-10 truncate rounded-md border border-amber-200 bg-amber-300/35 px-1.5 text-left text-[8px] text-white' : 'absolute top-1 h-10 truncate rounded-md border border-amber-400/20 bg-amber-400/15 px-1.5 text-left text-[8px] text-amber-100'} style={{ left, width: Math.max(18, layer.duration * timelineZoom - 2) }}>{layer.name}</button>;
                }))}
              </div>
            </div>)}
            <div className="pointer-events-none absolute bottom-0 top-7 z-20 w-px bg-cyan-200 shadow-[0_0_8px_rgba(103,232,249,.8)]" style={{ left: 94 + globalPlayhead * timelineZoom }}><span className="absolute -left-1.5 -top-1 h-3.5 w-3.5 rounded-sm bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,.7)]" /></div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2"><span className="text-[9px] text-slate-600">PLAYHEAD</span><input aria-label="Timeline playhead" type="range" min="0" max={Math.max(0.5, totalSeconds)} step="0.05" value={Math.min(globalPlayhead, totalSeconds)} onChange={(event) => seekGlobalTime(Number(event.target.value))} className="w-full accent-cyan-300" /></div>
      </div>

      <footer className="op-editor-footer flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-[#101a2a] px-3 py-3 sm:px-5">
        <div className="min-w-0 flex-1">{renderError && <p role="alert" className="text-[10px] text-rose-300">{renderError}</p>}{mediaError && <p role="alert" className="text-[10px] text-rose-300">{mediaError}</p>}{renderedScene && <p className="text-[10px] text-emerald-200">Export ready · {renderedScene.renderedLayers} visual/audio layers · {renderedScene.captionsBurnedIn ? 'captions included' : 'no captions'}</p>}{renderedScene && <a href={renderedScene.downloadUrl} target="_blank" rel="noreferrer" download className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-cyan-200 hover:text-white"><Download className="h-3 w-3" />Download edited MP4</a>}</div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={renderFullFilm} disabled={renderingFilm || scenes.length < 2 || scenes.length > 14 || scenes.some((scene) => (Number(scene.duration) || 0) > 90 || (!scene.mediaLayers?.some((layer) => layer.track === 'main') && !scene.clipJobId))} className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-200 disabled:opacity-30">{renderingFilm ? 'Assembling…' : 'Render full film'}</button><button type="button" onClick={renderCurrentScene} disabled={renderingScene || !current || (!mainLayer && !current.clipJobId)} className="rounded-lg bg-cyan-300 px-4 py-2.5 text-[10px] font-extrabold text-slate-950 disabled:opacity-30">{renderingScene ? 'Rendering…' : 'Export scene'}</button></div>
        {renderingFilm && <p role="status" className="w-full text-[10px] text-cyan-200">{filmProgress}</p>}{filmError && <p role="alert" className="w-full text-[10px] text-rose-300">{filmError}</p>}{finishedFilm && <div className="w-full text-[10px] text-emerald-200">Full film saved · <a href={finishedFilm.downloadUrl} download className="underline">Download MP4</a></div>}
      </footer>
      {audioSyncResult && <div className="border-t border-white/10 bg-[#0c1524] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-emerald-200">Lip-synced performance ready · {audioSyncResult.duration.toFixed(1)}s</p><div className="flex gap-2"><button type="button" onClick={applyAudioSyncResult} className="rounded-lg bg-emerald-400 px-3 py-2 text-[10px] font-extrabold text-slate-950">Use on selected clip</button><a href={'/api/video/download?id=' + encodeURIComponent(audioSyncResult.jobId) + '&name=audio-synced-scene'} className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] text-slate-200">Download</a></div></div><video src={audioSyncResult.videoUrl} controls playsInline className="mt-2 max-h-48 w-full rounded-lg bg-black" /></div>}
    </section>
  );
};