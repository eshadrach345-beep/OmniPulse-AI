import React, { useEffect, useMemo, useState } from 'react';
import { GeneratedVideo, VideoScene, VideoMediaLayer, VideoMediaTrack } from '../types';
import { api } from '../services/api';
import { ArrowDown, ArrowUp, Clapperboard, Copy, Film, Layers3, Scissors, Undo2, Redo2, Plus, Trash2, Sparkles, Wand2, Loader2, Check, Image as ImageIcon, Music2, RefreshCw } from 'lucide-react';

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

  useEffect(() => { setScenes(video.scenes || []); setSelected(0); setUndoStack([]); setRedoStack([]); }, [video.id]);
  const totalSeconds = useMemo(() => scenes.reduce((sum, scene) => sum + Math.max(0, Number(scene.duration) || 0), 0), [scenes]);
  const current = scenes[selected];
  const mainLayer = current?.mediaLayers?.find((layer) => layer.track === 'main');
  const overlayLayers = current?.mediaLayers?.filter((layer) => layer.track === 'overlay') || [];
  const audioLayers = current?.mediaLayers?.filter((layer) => layer.track === 'audio') || [];
  const activeCaption = current?.captions?.find((cue) => previewTime >= cue.start && previewTime <= cue.end);

  useEffect(() => { setPreviewTime(0); }, [current?.id, mainLayer?.sourceIn]);

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

  const addMediaLayer = () => {
    const asset = mediaAssets.find((item) => item.id === selectedAssetId);
    if (!asset || !current) return;
    const kind: VideoMediaLayer['kind'] = asset.contentType.startsWith('audio/') ? 'audio' : asset.contentType.startsWith('image/') ? 'image' : 'video';
    const track: VideoMediaTrack = kind === 'audio' ? 'audio' : selectedMediaTrack === 'audio' ? 'overlay' : selectedMediaTrack;
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
    if (!current || !mediaMatchPlan?.matches?.length) return;
    const stamp = Date.now();
    const additions: VideoMediaLayer[] = mediaMatchPlan.matches.map((match, index) => ({
      id: `director-${match.assetId}-${stamp}-${index}`,
      assetId: match.assetId,
      name: match.name,
      contentType: match.contentType,
      kind: match.kind,
      track: match.track,
      startAt: Math.max(0, match.startAt),
      sourceIn: 0,
      duration: Math.max(0.5, match.duration),
      volume: 0.8,
      fadeIn: 0,
      fadeOut: 0,
      opacity: 1,
      scale: 55,
      x: 50,
      y: 50,
    }));
    patchCurrent({ mediaLayers: [...(current.mediaLayers || []), ...additions] });
    setMediaMatchPlan(null);
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
      return { ...scene, visualCue: edit.visualDirection ? [scene.visualCue, edit.visualDirection].filter(Boolean).join('\n• ') : scene.visualCue, onScreenText: edit.overlayText || scene.onScreenText, soundEffectCue: edit.soundEffect || scene.soundEffectCue, beat: scene.beat || edit.reason };
    });
    commit(next); setDirectorPlan(null); setDirectorInstruction('');
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

  if (!scenes.length) return null;
  return (
    <section id="omnipulse-timeline-editor" className="scroll-mt-24 rounded-2xl border border-indigo-500/25 bg-slate-950/90 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/15 p-2.5 text-indigo-300"><Clapperboard className="w-5 h-5" /></div>
          <div><h2 className="text-base font-bold text-white">OmniPulse Timeline Editor</h2><p className="text-xs text-slate-400">Reorder clips, remove shots, duplicate scenes and create text overlays</p></div>
        </div>
        <div className="flex gap-2 text-xs text-slate-300">
          <span className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5"><Film className="inline w-3.5 h-3.5 mr-1 text-indigo-300" />{scenes.length} clips</span>
          <span className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 tabular-nums">{Math.floor(totalSeconds / 60)}:{String(Math.round(totalSeconds % 60)).padStart(2, '0')}</span>
        </div>
      </div>
      <div className="rounded-xl border border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-950/35 to-slate-900 p-4 space-y-3">
        <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-fuchsia-300" /><div><h3 className="text-sm font-semibold text-white">AI Director · Edit by instruction</h3><p className="text-[11px] text-slate-400">Describe the feeling, effects or pacing you want. Review the scene-by-scene proposal before applying it.</p></div></div>
        <textarea value={directorInstruction} onChange={(event) => setDirectorInstruction(event.target.value)} rows={2} maxLength={2400} placeholder="Example: Make the opening punchier, add a dramatic thunder cue at the reveal, and use a clean lower-third when the speaker introduces the topic..." className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-fuchsia-400" />
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => void requestDirectorPlan()} disabled={directorBusy || directorInstruction.trim().length < 8} className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-700 px-3 py-2 text-xs font-semibold text-white hover:bg-fuchsia-600 disabled:opacity-40">{directorBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}{directorBusy ? 'Planning edits…' : 'Create edit plan'}</button><span className="text-[10px] text-slate-500">AI suggestions are proposals, not rendered effects or sourced footage.</span></div>
        {directorError && <p role="alert" className="text-xs text-rose-300">{directorError}</p>}
        {directorPlan && <div className="space-y-3 rounded-lg border border-fuchsia-500/20 bg-slate-950/70 p-3"><p className="text-xs text-slate-200">{directorPlan.summary}</p>{directorPlan.edits.map((edit, index) => <div key={index} className="border-l-2 border-fuchsia-500/50 pl-3 space-y-1"><p className="text-[11px] font-semibold text-fuchsia-200">Scene {edit.scene} · {edit.reason}</p>{edit.visualDirection && <p className="text-[11px] text-slate-300">Visual: {edit.visualDirection}</p>}{edit.overlayText && <p className="text-[11px] text-slate-300">Overlay: {edit.overlayText}</p>}{edit.soundEffect && <p className="text-[11px] text-slate-300">Sound: {edit.soundEffect}</p>}{edit.transition && <p className="text-[11px] text-slate-400">Transition idea: {edit.transition}</p>}</div>)}<div className="flex flex-wrap gap-2"><button type="button" onClick={applyDirectorPlan} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600"><Check className="h-3.5 w-3.5" />Apply to timeline</button><button type="button" onClick={() => setDirectorPlan(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">Discard proposal</button></div></div>}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
        <div className="space-y-3 min-w-0">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Main video track</p><button type="button" onClick={undo} disabled={!undoStack.length} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 disabled:opacity-40"><Undo2 className="w-3.5 h-3.5" />Undo</button><button type="button" onClick={redo} disabled={!redoStack.length} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 disabled:opacity-40"><Redo2 className="w-3.5 h-3.5" />Redo</button></div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {scenes.map((scene, index) => <button type="button" key={scene.id} onClick={() => setSelected(index)} className={`min-w-[126px] max-w-[160px] flex-1 rounded-xl border p-2 text-left ${selected === index ? 'border-indigo-400 bg-indigo-950/60 ring-1 ring-indigo-400/40' : 'border-slate-800 bg-slate-900 hover:border-slate-600'}`}>
              <div className="flex justify-between gap-1"><span className="text-[10px] font-bold text-indigo-300">CLIP {index + 1}</span><span className="text-[10px] text-slate-500">{scene.duration}s</span></div>
              <div className="mt-2 h-12 rounded-md bg-gradient-to-br from-slate-700 to-slate-950 border border-white/5 overflow-hidden flex items-center justify-center">{scene.clipUrl ? <video src={scene.clipUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-label={`Preview of clip ${index + 1}`} /> : <Film className="w-5 h-5 text-slate-500" />}</div>
              <p className="mt-2 text-[11px] text-slate-200 line-clamp-2">{scene.beat || scene.visualCue || 'Untitled scene'}</p>
              <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(8, Math.min(100, (Number(scene.duration) || 1) * 5))}%` }} /></div>
            </button>)}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => move(selected - 1)} disabled={selected === 0} title="Move earlier" className="rounded-lg border border-slate-700 p-2 text-slate-300 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
            <button type="button" onClick={() => move(selected + 1)} disabled={selected === scenes.length - 1} title="Move later" className="rounded-lg border border-slate-700 p-2 text-slate-300 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
            <button type="button" onClick={duplicate} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200"><Copy className="w-3.5 h-3.5" />Duplicate</button>
            <button type="button" onClick={remove} disabled={scenes.length <= 1} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-900/70 px-3 py-2 text-xs text-rose-300 disabled:opacity-30"><Scissors className="w-3.5 h-3.5" />Remove clip</button>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
          <div className="flex items-center gap-2"><Layers3 className="w-4 h-4 text-fuchsia-300" /><h3 className="text-sm font-semibold text-white">Clip & overlay inspector</h3></div>
          {current && <div className="overflow-hidden rounded-lg border border-slate-700 bg-black">
            <div className="relative mx-auto aspect-video max-h-64 w-full bg-slate-950">
              {mainLayer?.kind === 'image' && mediaUrls[mainLayer.assetId]
                ? <img src={mediaUrls[mainLayer.assetId]} alt={mainLayer.name} className="h-full w-full object-contain" />
                : <video key={`${mainLayer?.assetId || current.clipUrl || current.id}-${mainLayer?.sourceIn || 0}`} src={(mainLayer && mainLayer.kind === 'video' ? mediaUrls[mainLayer.assetId] : '') || current.clipUrl || undefined} controls playsInline preload="metadata" onLoadedMetadata={(event) => { const start = Math.max(0, Number(mainLayer?.sourceIn) || 0); if (start > 0) event.currentTarget.currentTime = Math.min(start, Math.max(0, event.currentTarget.duration - 0.05)); }} onTimeUpdate={(event) => { const start = Math.max(0, Number(mainLayer?.sourceIn) || 0); const elapsed = Math.max(0, event.currentTarget.currentTime - start); const limit = Math.max(1, Number(current.duration) || 1); if (elapsed >= limit) { event.currentTarget.currentTime = start + limit; event.currentTarget.pause(); } setPreviewTime(Math.min(limit, elapsed)); }} className="h-full w-full object-contain" aria-label="Selected scene preview" />}
              {overlayLayers.filter((layer) => previewTime >= layer.startAt && previewTime <= layer.startAt + layer.duration).map((layer) => mediaUrls[layer.assetId] ? <div key={layer.id} className="pointer-events-none absolute" style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${Math.max(10, Math.min(100, layer.scale))}%`, opacity: layer.opacity, transform: 'translate(-50%, -50%)' }}>
                {layer.kind === 'image' ? <img src={mediaUrls[layer.assetId]} alt={layer.name} className="w-full rounded-md shadow-xl" /> : <video src={mediaUrls[layer.assetId]} muted loop autoPlay playsInline className="w-full rounded-md shadow-xl" />}
              </div> : null)}
              {!mainLayer && !current.clipUrl && <div className="absolute inset-0 grid place-items-center text-xs text-slate-500">Attach a video or image to preview this scene</div>}
              {activeCaption && <div className="pointer-events-none absolute bottom-5 left-3 right-3 text-center"><span className="inline-block rounded bg-black/80 px-3 py-1.5 text-sm font-semibold text-white shadow-lg">{activeCaption.text}</span></div>}
            </div>
          </div>}
          {audioLayers.map((layer) => mediaUrls[layer.assetId] ? <div key={layer.id} className="rounded-lg border border-slate-700 bg-slate-950 p-2"><p className="mb-1 text-[10px] text-slate-400">{layer.name} · audio track · starts at {formatTime(layer.startAt)}</p><audio src={mediaUrls[layer.assetId]} controls preload="metadata" onLoadedMetadata={(event) => { event.currentTarget.currentTime = Math.max(0, layer.sourceIn); event.currentTarget.volume = Math.max(0, Math.min(1, layer.volume)); }} className="w-full" /></div> : null)}
          {current && <>
            <label className="block space-y-1"><span className="text-[11px] font-medium text-slate-400">Edit segment duration (seconds · max 90 per render)</span><input type="number" min="1" max="90" step="0.5" value={current.duration} onChange={(event) => patchCurrent({ duration: Math.max(1, Math.min(90, Number(event.target.value) || 1)) })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400" /></label>
            <label className="block space-y-1"><span className="text-[11px] font-medium text-slate-400">Footage playback speed</span><select value={current.playbackSpeed || 1} onChange={(event) => patchCurrent({ playbackSpeed: Number(event.target.value) })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"><option value={0.5}>0.5× · Slow motion</option><option value={0.75}>0.75× · Slow</option><option value={1}>1× · Normal</option><option value={1.25}>1.25× · Fast</option><option value={1.5}>1.5× · Faster</option><option value={2}>2× · Double speed</option></select><p className="text-[10px] text-slate-500">Keeps the finished scene at its selected duration. Main video audio follows the same speed setting.</p></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1"><span className="text-[11px] font-medium text-slate-400">Fade in (0–3 sec)</span><input type="number" min="0" max="3" step="0.1" value={current.clipFadeIn || 0} onChange={(event) => patchCurrent({ clipFadeIn: Math.max(0, Math.min(3, Number(event.target.value) || 0)) })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" /></label>
              <label className="block space-y-1"><span className="text-[11px] font-medium text-slate-400">Fade out (0–3 sec)</span><input type="number" min="0" max="3" step="0.1" value={current.clipFadeOut || 0} onChange={(event) => patchCurrent({ clipFadeOut: Math.max(0, Math.min(3, Number(event.target.value) || 0)) })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" /></label>
              <p className="col-span-2 text-[10px] text-slate-500">Fades the clip picture and its original sound at the beginning or end of this scene.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1"><span className="text-[11px] font-medium text-slate-400">Frame fit</span><select value={current.fitMode || 'contain'} onChange={(event) => patchCurrent({ fitMode: event.target.value as VideoScene['fitMode'] })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"><option value="contain">Fit · show full frame</option><option value="cover">Fill · crop edges</option></select></label>
              <label className="block space-y-1"><span className="text-[11px] font-medium text-slate-400">Color grade</span><select value={current.colorGrade || 'none'} onChange={(event) => patchCurrent({ colorGrade: event.target.value as VideoScene['colorGrade'] })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"><option value="none">Original</option><option value="cinematic">Cinematic</option><option value="warm">Warm</option><option value="cool">Cool</option><option value="monochrome">Monochrome</option><option value="vintage">Vintage</option><option value="vivid">Vivid</option></select></label>
              <p className="col-span-2 text-[10px] text-slate-500">These are applied to the exported video, not just the editor preview.</p>
            </div>
            <label className="block space-y-1"><span className="text-[11px] font-medium text-slate-400">Scene name / beat</span><input value={current.beat || ''} onChange={(e) => patchCurrent({ beat: e.target.value })} placeholder="Opening, reveal, climax..." className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400" /></label>
            <label className="block space-y-1"><span className="text-[11px] font-medium text-slate-400">Text overlay</span><textarea value={current.onScreenText || ''} onChange={(e) => patchCurrent({ onScreenText: e.target.value })} rows={3} maxLength={180} placeholder="Add a title, lower-third or callout..." className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400" /></label>
            <label className="block space-y-1"><span className="text-[11px] font-medium text-slate-400">Overlay placement</span><select value={current.overlayPosition || 'center'} onChange={(event) => patchCurrent({ overlayPosition: event.target.value as VideoScene['overlayPosition'] })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"><option value="top">Top title</option><option value="center">Center title</option><option value="bottom">Bottom lower-third</option></select></label>
            <label className="block space-y-1"><span className="text-[11px] font-medium text-slate-400">Overlay style</span><select value={current.overlayStyle || 'cinematic'} onChange={(event) => patchCurrent({ overlayStyle: event.target.value as VideoScene['overlayStyle'] })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"><option value="cinematic">Cinematic panel</option><option value="minimal">Minimal text</option><option value="lower_third">Broadcast lower-third</option></select></label>
            <label className="block space-y-1"><span className="text-[11px] font-medium text-slate-400">Visual direction</span><textarea value={current.visualCue || ''} onChange={(e) => patchCurrent({ visualCue: e.target.value })} rows={3} maxLength={1200} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400" /></label>
            <label className="block space-y-1"><span className="text-[11px] font-medium text-slate-400">Scene dialogue / narration</span><textarea value={current.narration || ''} onChange={(e) => patchCurrent({ narration: e.target.value })} rows={3} maxLength={1600} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-indigo-400" /></label>
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between gap-2"><p className="text-[11px] font-semibold text-slate-300">Subtitle / dialogue track</p><button type="button" onClick={addLine} className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2 py-1.5 text-[11px] font-semibold text-indigo-200"><Plus className="w-3 h-3" />Add line</button></div>
              {!!current.lines?.length ? current.lines.map((line, lineIndex) => <div key={lineIndex} className="rounded-lg border border-slate-800 bg-slate-950 p-2 space-y-1.5">
                <div className="flex items-center gap-2"><input value={line.speaker} onChange={(e) => patchLine(lineIndex, { speaker: e.target.value })} aria-label="Dialogue speaker" className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-indigo-200" /><button type="button" onClick={() => removeLine(lineIndex)} aria-label={`Remove dialogue line ${lineIndex + 1}`} title="Remove line" className="rounded border border-rose-900/60 p-1.5 text-rose-300 hover:bg-rose-950/40"><Trash2 className="w-3.5 h-3.5" /></button></div>
                <textarea value={line.text} onChange={(e) => patchLine(lineIndex, { text: e.target.value })} rows={2} maxLength={500} aria-label="Dialogue subtitle" className="w-full resize-y rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white" />
                {Number(current.duration) >= 20 && <label className="flex items-center gap-2 text-[10px] text-slate-400">Dialogue timing <select value={line.half || 1} onChange={(e) => patchLine(lineIndex, { half: Number(e.target.value) as 1 | 2 })} className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200"><option value={1}>First half</option><option value={2}>Second half</option></select></label>}
              </div>) : <p className="text-[10px] text-slate-500">No dialogue lines yet. Add one to create a subtitle or spoken line for this scene.</p>}
            </div>
          <div className="space-y-3 rounded-xl border border-indigo-500/20 bg-slate-950/70 p-3">
            <div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-indigo-300" /><div><h4 className="text-xs font-semibold text-white">Creator media tracks</h4><p className="text-[10px] text-slate-500">Attach private video, image and audio assets to this scene.</p></div></div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select value={selectedAssetId} onChange={(event) => setSelectedAssetId(event.target.value)} className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white">
                <option value="">{mediaLoading ? 'Loading media library…' : 'Choose an uploaded asset'}</option>
                {mediaAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} · {asset.contentType.split('/')[0]}</option>)}
              </select>
              <div className="flex gap-2">
                <select value={selectedMediaTrack} onChange={(event) => setSelectedMediaTrack(event.target.value as VideoMediaTrack)} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-xs text-white">
                  <option value="main">Main shot</option><option value="overlay">Overlay</option><option value="audio">Audio</option>
                </select>
                <button type="button" onClick={addMediaLayer} disabled={!selectedAssetId} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><Plus className="h-3.5 w-3.5" />Add</button>
              </div>
            </div>
            {mediaAssets.length === 0 && !mediaLoading && <p className="text-[10px] text-slate-500">Your private media library is empty. Upload clips, images or audio in Creator Upload Studio first.</p>}
            {mediaError && <p role="alert" className="text-[10px] text-rose-300">{mediaError}</p>}
            {(current.mediaLayers || []).length > 0 && <div className="space-y-2">
              {(current.mediaLayers || []).map((layer) => <div key={layer.id} className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/80 p-2.5">
                <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2">{layer.kind === 'audio' ? <Music2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" /> : layer.kind === 'image' ? <ImageIcon className="h-3.5 w-3.5 shrink-0 text-amber-300" /> : <Film className="h-3.5 w-3.5 shrink-0 text-indigo-300" />}<span className="truncate text-[11px] font-medium text-slate-200">{layer.name}</span></div><button type="button" onClick={() => removeMediaLayer(layer.id)} className="rounded p-1 text-rose-300 hover:bg-rose-950/40" aria-label={`Remove ${layer.name}`}><Trash2 className="h-3.5 w-3.5" /></button></div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1 text-[10px] text-slate-400">Source in (sec)<input type="number" min="0" step="0.1" value={layer.sourceIn} onChange={(event) => patchMediaLayer(layer.id, { sourceIn: Math.max(0, Number(event.target.value) || 0) })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" /></label>
                  <label className="space-y-1 text-[10px] text-slate-400">Start at (sec)<input type="number" min="0" step="0.1" value={layer.startAt} onChange={(event) => patchMediaLayer(layer.id, { startAt: Math.max(0, Number(event.target.value) || 0) })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" /></label>
                  <label className="space-y-1 text-[10px] text-slate-400">Duration (sec)<input type="number" min="0.5" step="0.5" value={layer.duration} onChange={(event) => patchMediaLayer(layer.id, { duration: Math.max(0.5, Number(event.target.value) || 0.5) })} className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white" /></label>
                </div>
                {layer.track === 'overlay' && <><div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">Overlay size {layer.scale}%<input type="range" min="15" max="100" step="1" value={layer.scale} onChange={(event) => patchMediaLayer(layer.id, { scale: Number(event.target.value) })} className="w-full" /></label><label className="text-[10px] text-slate-400">Opacity {Math.round(layer.opacity * 100)}%<input type="range" min="0.1" max="1" step="0.05" value={layer.opacity} onChange={(event) => patchMediaLayer(layer.id, { opacity: Number(event.target.value) })} className="w-full" /></label></div><div className="grid grid-cols-2 gap-2"><label className="text-[10px] text-slate-400">Horizontal {layer.x}%<input type="range" min="0" max="100" step="1" value={layer.x} onChange={(event) => patchMediaLayer(layer.id, { x: Number(event.target.value) })} className="w-full" /></label><label className="text-[10px] text-slate-400">Vertical {layer.y}%<input type="range" min="0" max="100" step="1" value={layer.y} onChange={(event) => patchMediaLayer(layer.id, { y: Number(event.target.value) })} className="w-full" /></label></div>
                  <div className="space-y-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
                    <label className="flex items-center gap-2 text-[10px] font-semibold text-emerald-200"><input type="checkbox" checked={layer.chromaKey === true} onChange={(event) => patchMediaLayer(layer.id, { chromaKey: event.target.checked })} className="accent-emerald-500" />Remove green-screen / chroma background</label>
                    {layer.chromaKey && <>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px] text-slate-400">Key colour<input type="color" value={layer.chromaKeyColor || '#00ff00'} onChange={(event) => patchMediaLayer(layer.id, { chromaKeyColor: event.target.value })} className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-950 p-1" /></label>
                        <label className="text-[10px] text-slate-400">Similarity {(layer.chromaKeySimilarity ?? 0.25).toFixed(2)}<input type="range" min="0.01" max="0.8" step="0.01" value={layer.chromaKeySimilarity ?? 0.25} onChange={(event) => patchMediaLayer(layer.id, { chromaKeySimilarity: Number(event.target.value) })} className="mt-2 w-full" /></label>
                      </div>
                      <label className="block text-[10px] text-slate-400">Edge blend {(layer.chromaKeyBlend ?? 0.08).toFixed(2)}<input type="range" min="0" max="0.5" step="0.01" value={layer.chromaKeyBlend ?? 0.08} onChange={(event) => patchMediaLayer(layer.id, { chromaKeyBlend: Number(event.target.value) })} className="w-full" /></label>
                      <p className="text-[9px] leading-4 text-slate-500">Applied to the exported overlay before compositing. Best for clean, evenly lit green or blue backgrounds.</p>
                    </>}
                  </div></>}
                {layer.track === 'audio' && <div className="space-y-2"><label className="block text-[10px] text-slate-400">Audio volume {Math.round(layer.volume * 100)}%<input type="range" min="0" max="1.5" step="0.05" value={layer.volume} onChange={(event) => patchMediaLayer(layer.id, { volume: Number(event.target.value) })} className="w-full" /></label><div className="grid grid-cols-2 gap-2"><label className="block text-[10px] text-slate-400">Fade in {(layer.fadeIn || 0).toFixed(1)}s<input type="range" min="0" max="3" step="0.1" value={layer.fadeIn || 0} onChange={(event) => patchMediaLayer(layer.id, { fadeIn: Number(event.target.value) })} className="w-full" /></label><label className="block text-[10px] text-slate-400">Fade out {(layer.fadeOut || 0).toFixed(1)}s<input type="range" min="0" max="3" step="0.1" value={layer.fadeOut || 0} onChange={(event) => patchMediaLayer(layer.id, { fadeOut: Number(event.target.value) })} className="w-full" /></label></div></div>}
              </div>)}
            </div>}
            <div className="mt-3 space-y-3 rounded-xl border border-cyan-500/25 bg-cyan-950/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-cyan-300" /><div><p className="text-xs font-semibold text-white">DeAPI Audio-to-Video · Lip Sync</p><p className="text-[10px] text-slate-500">Drive a character performance from real audio, optionally anchored by a speaker image.</p></div></div>
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[9px] font-semibold text-cyan-200">1–11 seconds</span>
              </div>
              {!audioSyncModels.length && <p className="text-[10px] text-amber-300">No compatible DeAPI audio-sync model is available on this account. The model list is loaded live from DeAPI; this tool will not silently use a model that lacks audio-sync support.</p>}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-[10px] text-slate-400">Audio source
                  <select value={audioSyncAudioId} onChange={(event) => { setAudioSyncAudioId(event.target.value); setAudioSyncResult(null); }} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white">
                    <option value="">Choose MP3 / WAV / OGG / FLAC</option>
                    {mediaAssets.filter((asset) => /^audio\/(mpeg|mp3|wav|x-wav|wave|ogg|flac|x-flac)$/i.test(asset.contentType)).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-[10px] text-slate-400">Optional speaker image
                  <select value={audioSyncImageId} onChange={(event) => { setAudioSyncImageId(event.target.value); setAudioSyncResult(null); }} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white">
                    <option value="">Generate the speaker from text</option>
                    {mediaAssets.filter((asset) => asset.contentType.startsWith('image/')).map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
                  </select>
                </label>
              </div>
              {audioSyncAudioUrl && <div className="space-y-1 rounded-lg border border-slate-800 bg-slate-950/80 p-2">
                <audio controls preload="metadata" src={audioSyncAudioUrl} className="w-full" onLoadedMetadata={(event) => setAudioSyncDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} />
                <p className="text-[10px] text-slate-500">{audioSyncDuration > 0 ? `Detected audio length: ${audioSyncDuration.toFixed(2)}s` : 'Reading audio duration…'} · DeAPI accepts up to 20 MB and 11 seconds per audio-sync clip.</p>
              </div>}
              <label className="block space-y-1 text-[10px] text-slate-400">Compatible DeAPI model
                <select value={audioSyncModel} onChange={(event) => setAudioSyncModel(event.target.value)} disabled={!audioSyncModels.length} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-white disabled:opacity-50">
                  {audioSyncModels.map((model) => <option key={model.slug} value={model.slug}>{model.name}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-[10px] text-slate-400">Performance direction
                <textarea value={audioSyncPrompt} onChange={(event) => setAudioSyncPrompt(event.target.value)} rows={3} maxLength={2200} className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white" placeholder="Describe expression, eye contact, micro-movements and camera direction…" />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void generateAudioSync()} disabled={audioSyncBusy || !audioSyncAudioId || !audioSyncModel || audioSyncDuration < 1 || audioSyncDuration > 11} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-700 px-3 py-2 text-[10px] font-semibold text-white hover:bg-cyan-600 disabled:opacity-40">
                  {audioSyncBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}{audioSyncBusy ? 'Generating…' : 'Generate lip-synced video'}
                </button>
                {audioSyncResult && <button type="button" onClick={applyAudioSyncResult} className="rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-semibold text-white hover:bg-indigo-500">Use as this scene’s main shot</button>}
                {audioSyncResult && <a href={`/api/video/download?id=${encodeURIComponent(audioSyncResult.jobId)}&name=audio-synced-scene`} className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] font-semibold text-slate-200">Download MP4</a>}
              </div>
              {audioSyncBusy && <p role="status" className="text-[10px] text-cyan-200">{audioSyncStatus}</p>}
              {audioSyncError && <p role="alert" className="text-[10px] text-rose-300">{audioSyncError}</p>}
              {audioSyncResult && <div className="space-y-2 rounded-lg border border-emerald-500/20 bg-slate-950 p-2">
                <video src={audioSyncResult.videoUrl} controls playsInline preload="metadata" className="max-h-72 w-full rounded-lg bg-black" />
                <p className="text-[10px] text-emerald-300">Ready · {audioSyncResult.duration.toFixed(1)} seconds · {audioSyncResult.frameCount} frames. The clip can replace the selected scene’s main footage.</p>
              </div>}
              {!!audioSyncStatus && !audioSyncBusy && !audioSyncError && !audioSyncResult && <p className="text-[10px] text-slate-400">{audioSyncStatus}</p>}
              <p className="text-[10px] leading-relaxed text-slate-500">For best lip sync, use a clean single-speaker recording. The optional image anchors the speaker’s appearance; DeAPI aligns mouth and body motion to the audio waveform. Audio-sync generation uses video seconds and DeAPI credits.</p>
            </div>
            <div className="border-t border-slate-800 pt-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-semibold text-slate-200">Timed transcription & captions</p><button type="button" onClick={() => void transcribeSelectedAsset()} disabled={!selectedAssetId || transcribing || !mediaAssets.find((asset) => asset.id === selectedAssetId)?.contentType.match(/^(audio|video)\//)} className="inline-flex items-center gap-1.5 rounded-lg border border-fuchsia-500/40 px-2.5 py-1.5 text-[10px] font-semibold text-fuchsia-200 disabled:opacity-40">{transcribing ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}{transcribing ? 'Transcribing…' : 'Transcribe selected upload'}</button></div>
              <p className="text-[10px] text-slate-500">Uses Groq Whisper to create timestamped speech segments. The selected upload is sent to Groq for transcription; current file limit is 100 MB.</p>
              {transcript && <div className="space-y-2 rounded-lg border border-fuchsia-500/20 bg-slate-900 p-2"><p className="text-[10px] font-semibold text-fuchsia-200">{transcript.name} · {transcript.segments.length} timed segments</p><div className="max-h-36 space-y-1 overflow-y-auto">{transcript.segments.slice(0, 16).map((segment, index) => <div key={index} className="flex gap-2 text-[10px]"><span className="shrink-0 tabular-nums text-slate-500">{formatTime(segment.start)}–{formatTime(segment.end)}</span><span className="text-slate-300">{segment.text}</span></div>)}</div><button type="button" onClick={applyTranscript} className="rounded-lg bg-fuchsia-700 px-3 py-2 text-[10px] font-semibold text-white hover:bg-fuchsia-600">Apply timed captions to this scene</button></div>}
              {transcript && <div className="space-y-2 rounded-lg border border-indigo-500/20 bg-slate-900 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[11px] font-semibold text-indigo-200">AI Director · contextual media matching</p><p className="text-[10px] text-slate-500">Find the best moments in your own uploaded media.</p></div><button type="button" onClick={() => void requestMediaMatches()} disabled={mediaMatchBusy || mediaAssets.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-40">{mediaMatchBusy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}{mediaMatchBusy ? 'Matching moments…' : 'Find matching moments'}</button></div>
                {mediaMatchError && <p role="alert" className="text-[10px] text-rose-300">{mediaMatchError}</p>}
                {mediaMatchPlan && <div className="space-y-2"><p className="text-[10px] text-slate-300">{mediaMatchPlan.summary}</p>{mediaMatchPlan.matches.map((match, index) => <div key={`${match.assetId}-${index}`} className="rounded-md border border-slate-800 bg-slate-950 p-2"><div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-semibold text-white">{match.name}</span><span className="shrink-0 text-[10px] tabular-nums text-indigo-300">{formatTime(match.startAt)} · {match.duration.toFixed(1)}s</span></div><p className="mt-1 text-[10px] text-slate-400">{match.reason}</p><p className="text-[10px] text-slate-500">{match.visualTreatment}</p></div>)}<div className="flex flex-wrap gap-2"><button type="button" onClick={applyMediaMatches} className="rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-semibold text-white">Apply {mediaMatchPlan.matches.length} placements to timeline</button><button type="button" onClick={() => setMediaMatchPlan(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-[10px] text-slate-300">Discard proposal</button></div></div>}
              </div>}
              {!!current.captions?.length && <p className="text-[10px] text-emerald-300">{current.captions.length} timed caption cues saved on this scene.</p>}
            </div>
          </div>
          </>}
          <p className="text-[10px] leading-relaxed text-slate-500">Edits are non-destructive until you render. Scene exports burn in text overlays and timed captions, composite visual layers, and mix added audio; the original uploaded files remain unchanged.</p>
        </div>
      <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        <div className="flex items-center justify-between gap-2"><div><h3 className="text-xs font-semibold text-white">Multitrack timeline</h3><p className="text-[10px] text-slate-500">Select any block to inspect and edit that scene's layers.</p></div><span className="text-[10px] text-slate-500">{scenes.length} scene lanes</span></div>
        {([
          ['main', 'Main footage'],
          ['overlay', 'Visual overlays'],
          ['audio', 'Audio / music'],
          ['captions', 'Timed captions'],
        ] as const).map(([track, label]) => <div key={track} className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] gap-2">
          <div className="flex items-center text-[10px] font-semibold text-slate-400">{label}</div>
          <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1">
            {scenes.map((scene, index) => {
              const layers = track === 'captions' ? [] : (scene.mediaLayers || []).filter((layer) => layer.track === track);
              const fallback = track === 'main' && !layers.length && scene.clipUrl ? 'Generated clip' : '';
              const title = track === 'captions' ? (scene.captions?.length ? `${scene.captions.length} subtitle cues` : 'No captions') : layers.map((layer) => layer.name).join(', ') || fallback || 'Empty';
              const active = index === selected;
              return <button key={scene.id} type="button" onClick={() => setSelected(index)} title={title} className={`min-w-[112px] max-w-[180px] flex-1 rounded-md border px-2 py-2 text-left transition-colors ${active ? 'border-indigo-400 bg-indigo-500/15 text-white' : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-600'}`}>
                <span className="block text-[9px] uppercase tracking-wide opacity-60">Scene {index + 1}</span>
                <span className="block truncate text-[10px] font-medium">{title}</span>
              </button>;
            })}
          </div>
        </div>)}
      </div>
      <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <div><h3 className="text-xs font-semibold text-white">Render edited scene</h3><p className="text-[10px] text-slate-400">Composites the selected scene's footage, overlays, audio and timed captions into a saved MP4.</p></div>
          <button type="button" onClick={renderCurrentScene} disabled={!current || renderingScene || (Number(current.duration) || 0) > 90 || (!mainLayer && !current.clipJobId)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
            {renderingScene ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clapperboard className="h-3.5 w-3.5" />}{renderingScene ? 'Rendering…' : 'Render scene'}
          </button>
        </div>
        {(Number(current?.duration) || 0) > 90 && <p className="text-[10px] text-amber-300">This first compositor pass supports scenes up to 90 seconds. Split this scene into shorter sections.</p>}
        {renderError && <p role="alert" className="text-[10px] text-rose-300">{renderError}</p>}
        {renderedScene && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2"><span className="min-w-0 text-[10px] text-emerald-200">Saved to Media Library · {renderedScene.renderedLayers} layers · {renderedScene.captionsBurnedIn ? 'captions burned in' : 'no captions'}</span><a href={renderedScene.downloadUrl} target="_blank" rel="noreferrer" download className="rounded-md bg-emerald-600 px-3 py-1.5 text-[10px] font-semibold text-white">Download MP4</a></div>}
        <div className="border-t border-slate-800 pt-2 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
            <label className="block space-y-1"><span className="text-[10px] font-medium text-slate-400">Transition between scenes</span><select value={filmTransition} onChange={(event) => setFilmTransition(event.target.value as typeof filmTransition)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"><option value="cut">Hard cut</option><option value="fade">Crossfade / dissolve</option><option value="wipeleft">Wipe left</option><option value="slideleft">Slide left</option><option value="circleopen">Circle reveal</option></select></label>
            <label className="block space-y-1"><span className="text-[10px] font-medium text-slate-400">Duration · {filmTransitionDuration.toFixed(2)}s</span><input type="range" min="0.2" max="1" step="0.05" value={filmTransitionDuration} disabled={filmTransition === 'cut'} onChange={(event) => setFilmTransitionDuration(Number(event.target.value))} className="mt-2 w-full disabled:opacity-30" /></label>
          </div>
          <div className="flex items-center justify-between gap-2"><div><p className="text-[11px] font-semibold text-white">Assemble the full film</p><p className="text-[9px] text-slate-500">Render each scene, then join the MP4s into one saved production. Transitions overlap adjacent video and audio by the selected duration.</p></div><button type="button" onClick={renderFullFilm} disabled={renderingFilm || scenes.length < 2 || scenes.length > 14 || scenes.some((scene) => (Number(scene.duration) || 0) > 90 || (!scene.mediaLayers?.some((layer) => layer.track === 'main') && !scene.clipJobId))} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-400/40 px-3 py-2 text-[10px] font-semibold text-indigo-200 disabled:opacity-40">{renderingFilm ? <Loader2 className="h-3 w-3 animate-spin" /> : <Film className="h-3 w-3" />}{renderingFilm ? 'Working…' : 'Render full film'}</button></div>
          {renderingFilm && <p role="status" className="mt-2 text-[10px] text-indigo-200">{filmProgress}</p>}
          {filmError && <p role="alert" className="mt-2 text-[10px] text-rose-300">{filmError}</p>}
          {finishedFilm && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2"><span className="text-[10px] text-emerald-200">Finished film saved · {finishedFilm.sceneCount} scenes</span><a href={finishedFilm.downloadUrl} target="_blank" rel="noreferrer" download className="rounded-md bg-emerald-600 px-3 py-1.5 text-[10px] font-semibold text-white">Download full film</a></div>}
          {scenes.length > 14 && <p className="mt-2 text-[9px] text-amber-300">This first assembly pass supports up to 14 scenes. Larger films need the background render queue stage.</p>}
        </div>
        <p className="text-[9px] leading-relaxed text-slate-500">Current limits: 90 seconds per scene, 12 visual overlays, 8 audio layers and a 250 MB finished file. This is the first scene-rendering pass, not yet a full-film background render queue.</p>
      </div>
      </div>
      {saved && <p className="text-[10px] text-emerald-400" role="status">Edits saved to your video library.</p>}
    </section>
  );
};
