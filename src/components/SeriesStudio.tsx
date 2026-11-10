import React, { useCallback, useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Loader2, Play, Plus, ChevronRight, Clock, Film, Camera, Check, AlertTriangle, Download, ArrowLeft, Clapperboard, RotateCcw, FileText, Users, Sparkles, Pause, ImagePlus, Trash2 } from 'lucide-react';
import { AspectRatioType, CameraProfileId, CastId, DialogueId, EndingId, GenreId, IntensityId, PresentationId, StoryMoodId, TropeId } from '../types';
import { StoryFormat } from '../services/aiService';
import { Episode, ProjectDetail, ProjectSummary, Series, isActive, isOpen, type EditableScene } from '../services/seriesService';
import { ScriptEditor } from './ScriptEditor';
import { ApiError, api } from '../services/api';
import { MoviePoster } from './MoviePoster';
import {
  CAMERA_OPTIONS, CAST_OPTIONS, DIALOGUE_OPTIONS, ENDING_OPTIONS, GENRE_OPTIONS, IDEA_STARTERS, INTENSITY_OPTIONS, LENGTH_CHOICES, MAX_PART_SECONDS, MIN_PART_SECONDS, MOOD_OPTIONS, PRESENTATION_OPTIONS, PRESETS, TROPE_OPTIONS, TROPE_STARTERS,
  buildBrief, clampSeconds, formatSeconds, sceneCountFor, type StyleOption,
} from '../data/storyOptions';

type BrandMediaAsset = { id: string; name: string; contentType: string; size: number; previewUrl?: string };

interface Props {
  nicheName: string;
  /** Video seconds this person can still use (plan plus bought extras), if known. */
  secondsLeft?: number | null;
  /** Called when a part starts or finishes, so the usage meter can refresh. */
  onUsageChanged?: () => void;
  /** Opens this project straight on its next part (used by the dashboard shortcut). */
  focusProjectId?: string | null;
  onFocusHandled?: () => void;
  /** Used inside the "Direct Video" window: one video, no series list. */
  single?: boolean;
}

const FORMATS: { id: StoryFormat; title: string; look: string }[] = [
  { id: 'drama', title: 'Drama', look: 'Cinematic live-action look' },
  { id: 'documentary', title: 'Documentary', look: 'Documentary footage look' },
  { id: 'animation', title: 'Animation', look: '3D animated movie look' },
  { id: 'commercial', title: 'Brand Ad', look: 'Premium product commercial, polished studio lighting, elegant brand cinematography' },
];
const RATIOS: AspectRatioType[] = ['9:16', '16:9', '1:1'];
const POLL_MS = 4000;

type View = 'list' | 'compose' | 'progress';

const chip = (on: boolean) => `px-3 py-2 rounded-lg border text-xs font-medium text-left transition-colors ${on ? 'bg-indigo-950 border-indigo-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'}`;
const selectCls = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500';
const areaCls = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600';

/** A row of option buttons with an emoji, a label and a one-line hint. */
function OptionRow<T extends string>({ legend, value, onChange, options, cols }: { legend: string; value: T; onChange: (v: T) => void; options: StyleOption<T>[]; cols: 2 | 3 | 4 | 5 }) {
  const grid = { 2: 'grid-cols-2', 3: 'grid-cols-2 sm:grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4', 5: 'grid-cols-2 sm:grid-cols-5' }[cols];
  return (
    <div>
      <p className="text-xs font-semibold text-slate-300 mb-1.5">{legend}</p>
      <div className={`grid ${grid} gap-2`} role="group" aria-label={legend}>
        {options.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={value === o.id} title={o.hint} className={chip(value === o.id)}>
            <span className="block font-bold"><span aria-hidden="true">{o.emoji}</span> {o.label}</span>
            <span className="block text-[10px] text-slate-400 font-normal mt-0.5 leading-snug">{o.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
};

type CaptionCue = { start: number; end: number; text: string };
/** Captions come only from approved spoken dialogue, split into natural reading phrases. Never add speaker labels or invented copy. */
function episodeCaptionTracks(scenes: Episode['scenes']): CaptionCue[][] {
  const tracks: CaptionCue[][] = [];
  for (const scene of scenes) {
    const halves = Math.max(1, Math.ceil(scene.clipSeconds / 10));
    for (let half = 1; half <= halves; half++) {
      const lines = scene.lines.filter((line) => (line.half || 1) === half);
      let cursor = 0.25;
      const cues: CaptionCue[] = [];
      for (const line of lines) {
        const words = line.text.trim().split(/\s+/).filter(Boolean);
        for (let i = 0; i < words.length; i += 5) {
          if (cursor >= 9.65) break;
          const phrase = words.slice(i, i + 5).join(' ');
          const count = phrase.split(/\s+/).filter(Boolean).length;
          const duration = Math.max(0.85, Math.min(2.35, count / 2.65 + 0.28));
          const end = Math.min(9.85, cursor + duration);
          cues.push({ start: cursor, end, text: phrase });
          cursor = end + 0.12;
        }
      }
      tracks.push(cues);
    }
  }
  return tracks;
}

const vttTime = (seconds: number) => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000), m = Math.floor((ms % 3_600_000) / 60_000), sec = Math.floor((ms % 60_000) / 1000), milli = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
};

/**
 * Plays the finished clips one after another. Two video elements take turns: while one plays, the other is already loading the next clip,
 * so there is no blank wait between clips. A clip always plays to its very end, and a spinner shows whenever the connection is slow.
 */
const ClipSequence: React.FC<{ clips: string[]; captions?: CaptionCue[][]; audioEnabled?: boolean }> = ({ clips, captions = [], audioEnabled = true }) => {
  const [i, setI] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [playhead, setPlayhead] = useState(0);
  const refs = [useRef<HTMLVideoElement | null>(null), useRef<HTMLVideoElement | null>(null)];
  const clipKey = clips.join('|');
  const attach = (el: HTMLVideoElement | null, url?: string) => {
    if (!el || !url || el.dataset.src === url) return;
    el.dataset.src = url; el.src = url; el.preload = 'auto'; el.load();
  };
  useEffect(() => {
    refs.forEach((r) => { if (r.current) { delete r.current.dataset.src; r.current.pause(); } });
    setI(0); setPlayhead(0); setBuffering(true);
    attach(refs[0].current, clips[0]);
    attach(refs[1].current, clips[1]);
  }, [clipKey]);
  useEffect(() => {
    refs.forEach((r) => { if (r.current) r.current.muted = !audioEnabled; });
  }, [audioEnabled, clipKey]);
  useEffect(() => {
    const cur = refs[i % 2].current, other = refs[(i + 1) % 2].current;
    attach(cur, clips[i]);
    if (cur) cur.muted = !audioEnabled;
    other?.pause();
    attach(other, clips[i + 1]);
    if (other) other.muted = !audioEnabled;
    setPlayhead(0);
    if (i > 0 && cur) {
      // Do not start the next clip until its decoder can present a frame.
      let cancelled = false;
      const start = () => {
        if (cancelled || !cur) return;
        cur.removeEventListener('canplay', start);
        cur.play().then(() => setBuffering(false)).catch(() => setBuffering(false));
      };
      if (cur.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) start();
      else {
        setBuffering(true);
        cur.addEventListener('canplay', start, { once: true });
        cur.load();
      }
      return () => { cancelled = true; cur.removeEventListener('canplay', start); };
    }
  }, [i, clipKey, audioEnabled]);
  if (!clips.length) return null;
  const caption = (captions[i] || []).find((cue) => playhead >= cue.start && playhead <= cue.end);
  return (
    <div className="space-y-1.5">
      <div className="relative w-full max-h-[60vh] rounded-xl bg-black overflow-hidden" style={{ minHeight: 200 }}>
        {[0, 1].map((n) => (
          <video
            key={n} ref={refs[n]} controls playsInline preload="auto" muted={!audioEnabled}
            onWaiting={() => { if (n === i % 2) setBuffering(true); }}
            onCanPlay={() => { if (n === i % 2) setBuffering(false); }}
            onPlaying={() => { if (n === i % 2) setBuffering(false); }}
            onTimeUpdate={(e) => { if (n === i % 2) setPlayhead(e.currentTarget.currentTime); }}
            onEnded={() => { if (n === i % 2) { setBuffering(true); setPlayhead(0); setI((k) => (k + 1 < clips.length ? k + 1 : k)); } }}
            className={`${n === i % 2 ? 'relative' : 'absolute inset-0 opacity-0 pointer-events-none'} w-full max-h-[60vh] bg-black`}
          />
        ))}
        {caption && <div aria-live="polite" className="absolute bottom-14 left-3 right-3 flex justify-center pointer-events-none"><span className="max-w-[92%] rounded-md bg-black/85 px-3 py-2 text-center text-sm sm:text-base font-semibold leading-snug text-white shadow-lg">{caption.text}</span></div>}
        {buffering && <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><span className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 text-[11px] text-slate-200"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading video...</span></div>}
      </div>
      <p className="text-[11px] text-slate-500 text-center">Clip {i + 1} of {clips.length}. Dialogue, music and sound effects come from the generated clip's synchronized soundtrack.</p>
    </div>
  );
};

export const SeriesStudio: React.FC<Props> = ({ nicheName, secondsLeft, onUsageChanged, focusProjectId, onFocusHandled, single }) => {
  const [view, setView] = useState<View>(single ? 'compose' : 'list');
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ---- the form
  const [kind, setKind] = useState<'one' | 'series'>(single ? 'one' : 'series');
  const [writer, setWriter] = useState<'ai' | 'paste'>('ai');
  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const [script, setScript] = useState('');
  const [format, setFormat] = useState<StoryFormat>('drama');
  const [look, setLook] = useState(FORMATS[0].look);
  const [ratio, setRatio] = useState<AspectRatioType>('9:16');
  const [seconds, setSeconds] = useState<number>(60);
  const [sceneSeconds, setSceneSeconds] = useState<10 | 20>(20);
  const [parts, setParts] = useState(3);
  const [deliver, setDeliver] = useState<'all' | 'one'>('one');
  const [mood, setMood] = useState<StoryMoodId>('cinematic_trailer');
  const [camera, setCamera] = useState<CameraProfileId>('kinetic_tracking');
  const [presentation, setPresentation] = useState<PresentationId>('shortdrama');
  const [genre, setGenre] = useState<GenreId>('auto');
  const [intensity, setIntensity] = useState<IntensityId>('balanced');
  const [dialogue, setDialogue] = useState<DialogueId>('normal');
  const [ending, setEnding] = useState<EndingId>('cliffhanger');
  const [cast, setCast] = useState<CastId>('people');
  const [animalsTalk, setAnimalsTalk] = useState(false);
  const [trope, setTrope] = useState<TropeId>('none');
  const [reviewFirst, setReviewFirst] = useState(true);
  // Character portraits/location plates are optional because they spend additional image credits.
  const [characterReferences, setCharacterReferences] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const brandRefsInputRef = useRef<HTMLInputElement | null>(null);
  const startFrameInputRef = useRef<HTMLInputElement | null>(null);
  const endFrameInputRef = useRef<HTMLInputElement | null>(null);
  const [startFrame, setStartFrame] = useState<BrandMediaAsset | null>(null);
  const [endFrame, setEndFrame] = useState<BrandMediaAsset | null>(null);
  const [videoProvider, setVideoProvider] = useState<'fal' | 'deapi' | 'auto'>('fal');
  const [falEnabled, setFalEnabled] = useState(false);
  const [deapiEnabled, setDeapiEnabled] = useState(false);
  const [videoModels, setVideoModels] = useState<{ slug: string; name: string; description: string; supportsImageToVideo: boolean; supportsLastFrame: boolean }[]>([]);
  const [videoModel, setVideoModel] = useState('Ltx2_5_22B_Dist_INT8');
  const [videoModelsLoading, setVideoModelsLoading] = useState(true);
  const [videoModelsError, setVideoModelsError] = useState('');
  const [brandName, setBrandName] = useState('');
  const [brandTagline, setBrandTagline] = useState('');
  const [brandCta, setBrandCta] = useState('');
  const [brandUrl, setBrandUrl] = useState('');
  const [brandColor, setBrandColor] = useState('#2DE0B8');
  const [brandLogo, setBrandLogo] = useState<BrandMediaAsset | null>(null);
  const [brandReferences, setBrandReferences] = useState<BrandMediaAsset[]>([]);
  const [brandUploadBusy, setBrandUploadBusy] = useState(false);
  const [brandUploadMessage, setBrandUploadMessage] = useState('');
  const [brandUploadError, setBrandUploadError] = useState('');
  const uploadBrandAssets = async (selection: FileList | null, role: 'logo' | 'reference' | 'startFrame' | 'endFrame') => {
    const files = selection ? Array.from(selection) : [];
    if (!files.length) return;
    if ((role === 'logo' || role === 'startFrame' || role === 'endFrame') && files.length > 1) { setBrandUploadError('Choose one image for this slot.'); return; }
    if (role === 'reference' && brandReferences.length + files.length > 4) { setBrandUploadError('Add up to four visual reference images.'); return; }
    setBrandUploadBusy(true); setBrandUploadError(''); setBrandUploadMessage('');
    try {
      for (const file of files) {
        const mime = file.type || (/\.png$/i.test(file.name) ? 'image/png' : /\.webp$/i.test(file.name) ? 'image/webp' : 'image/jpeg');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Use a JPG, PNG or WebP image.');
        if (file.size > 15 * 1024 * 1024) throw new Error('Each brand image must be 15 MB or smaller.');
        const before = await api.get<{ assets: BrandMediaAsset[] }>('/media/list');
        await upload('brand-assets/' + Date.now() + '-' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_'), file, {
          access: 'private', handleUploadUrl: '/api/media/upload',
          clientPayload: JSON.stringify({ name: file.name, type: mime, size: file.size }),
        });
        const after = await api.get<{ assets: BrandMediaAsset[] }>('/media/list');
        const oldIds = new Set(before.assets.map((asset) => asset.id));
        const saved = after.assets.find((asset) => !oldIds.has(asset.id) && asset.contentType.startsWith('image/'));
        if (!saved) throw new Error('Upload completed, but its library record was not found. Refresh and try again.');
        const signed = await api.get<{ url: string }>('/media/url?id=' + encodeURIComponent(saved.id));
        const ready = { ...saved, previewUrl: signed.url };
        if (role === 'logo') setBrandLogo(ready);
        else if (role === 'startFrame') setStartFrame(ready);
        else if (role === 'endFrame') setEndFrame(ready);
        else setBrandReferences((current) => [...current, ready].slice(0, 4));
      }
      setBrandUploadMessage(role === 'logo' ? 'Logo saved to your private Brand Library.' : role === 'startFrame' ? 'Opening frame saved to your private media library.' : role === 'endFrame' ? 'Ending frame saved to your private media library.' : 'Visual references saved to your private Brand Library.');
    } catch (e) {
      setBrandUploadError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Brand asset upload failed.');
    } finally { setBrandUploadBusy(false); }
  };
  const [locationEditInstruction, setLocationEditInstruction] = useState('Remove the used dishes and clutter from the table. Keep the exact same table, chairs, kitchen, camera angle, lighting and all other props unchanged.');
  const [locationEditBusy, setLocationEditBusy] = useState(false);
  const [locationEditMessage, setLocationEditMessage] = useState('');
  const [notice, setNotice] = useState('');
  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id); if (!p) return;
    const v = p.set;
    setPresentation(v.presentation); setGenre(v.genre); setIntensity(v.intensity); setDialogue(v.dialogue); setEnding(v.ending); setCast(v.cast); setAnimalsTalk(v.animalsTalk ?? false); setTrope(v.trope ?? 'none'); setMood(v.mood); setCamera(v.camera);
    if (format === 'documentary' && v.presentation !== 'narrated') setFormat('drama');
  };
  const startersFor = () => [...(presentation === 'shortdrama' ? [TROPE_STARTERS[trope]] : []), ...(IDEA_STARTERS[genre] || IDEA_STARTERS.auto)];
  const [lockEnabled, setLockEnabled] = useState(false);
  const [lockName, setLockName] = useState('');
  const [lockDescriptor, setLockDescriptor] = useState('');

  // ---- the part being made
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [editorOrder, setEditorOrder] = useState<string[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(true);
  useEffect(() => {
    setEditorOrder(episode?.status === 'COMPLETED' ? (episode.clipJobIds || []) : []);
  }, [episode?.id, episode?.status, episode?.clipJobIds?.join('|')]);
  const moveEditorClip = (index: number, delta: number) => setEditorOrder((current) => {
    const target = index + delta;
    if (target < 0 || target >= current.length) return current;
    const next = [...current]; [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const removeEditorClip = (index: number) => setEditorOrder((current) => current.filter((_, i) => i !== index));
  const [pollKey, setPollKey] = useState(0);
  const [nextId, setNextId] = useState<string | null>(null); // the next part of a series that is being made by itself
  const [dl, setDl] = useState<{ busy: boolean; msg: string }>({ busy: false, msg: '' });
  // The parent may pass a new function on every render; a ref keeps the polling loop from restarting each time.
  const usageRef = useRef(onUsageChanged);
  usageRef.current = onUsageChanged;

  const continuing = !!detail;
  const partNumber = detail ? detail.nextPartNumber : 1;
  const effective = clampSeconds(seconds, secondsLeft);
  const perPart = effective; // a pasted script is made at the full length chosen, in one part
  const sliderMax = MAX_PART_SECONDS;
  const wholeSeries = !continuing && kind === 'series' && deliver === 'all' ? perPart * parts : perPart;

  const loadList = useCallback(async () => {
    if (single) return;
    try { setProjects(await Series.list()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Your series could not be loaded.'); setProjects((p) => p || []); }
  }, [single]);
  useEffect(() => { void loadList(); }, [loadList]);

  useEffect(() => {
    let active = true;
    api.get<{ provider: 'fal' | 'deapi' | 'auto'; models: { slug: string; name: string; description: string; supportsImageToVideo: boolean; supportsLastFrame: boolean }[]; falEnabled: boolean; deapiEnabled: boolean; availableProviders: string[] }>('/video/models')
      .then((result) => {
        if (!active) return;
        setFalEnabled(result.falEnabled);
        setDeapiEnabled(result.deapiEnabled);
        const defaultChoice = result.availableProviders.includes(result.provider) ? result.provider : (result.falEnabled ? 'fal' : result.deapiEnabled ? 'deapi' : result.provider);
        setVideoProvider(defaultChoice as 'fal' | 'deapi' | 'auto');
        setVideoModels(result.models || []);
        if (result.models?.length && !result.models.some((model) => model.slug === videoModel)) setVideoModel(result.models[0].slug);
        setVideoModelsError('');
      })
      .catch((error) => { if (active) setVideoModelsError(error instanceof Error ? error.message : 'The video model list is unavailable.'); })
      .finally(() => { if (active) setVideoModelsLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => { setNextId(null); }, [episodeId]);

  // Follow the part that is being made. Each poll also moves it one step forward on the server.
  useEffect(() => {
    if (!episodeId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const tick = async () => {
      try {
        const ep = await Series.status(episodeId);
        if (cancelled) return;
        failures = 0; setEpisode(ep);
        if (!isActive(ep.status)) { usageRef.current?.(); void loadList(); return; }
      } catch (e) {
        if (cancelled) return;
        failures++;
        if (e instanceof ApiError && [401, 402, 404].includes(e.status)) { setError(e.message); return; }
        if (failures >= 8) { setError('The connection was lost. Open this part again from your series list to keep following it.'); return; }
      }
      timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [episodeId, pollKey, loadList]);

  // "Make the whole series now": when one part is finished the next one starts by itself, so follow it.
  useEffect(() => {
    if (!episode || episode.status !== 'COMPLETED' || !episode.autoContinue || episode.partNumber >= episode.targetParts) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const d = await Series.get(episode.projectId);
        if (!cancelled && d.activeEpisodeId && d.activeEpisodeId !== episode.id) setNextId(d.activeEpisodeId);
      } catch { /* the list will show it */ }
    }, 2500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [episode]);

  // Opened from the dashboard: go straight to that project's next part once the list is here.
  useEffect(() => {
    if (!focusProjectId || !projects) return;
    const p = projects.find((x) => x.id === focusProjectId);
    onFocusHandled?.();
    if (!p) return;
    if (p.episodes.some((e) => isOpen(e.status))) openActive(p); else void continueSeries(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusProjectId, projects]);

  const resetForm = () => { setTitle(''); setIdea(''); setScript(''); setError(null); setLockEnabled(false); };
  const backToList = () => { setView(single ? 'compose' : 'list'); setDetail(null); setEpisodeId(null); setEpisode(null); setError(null); setDl({ busy: false, msg: '' }); if (single) resetForm(); else void loadList(); };

  const startNewSeries = () => { setDetail(null); resetForm(); setKind('series'); setView('compose'); };

  /** "Generate Next Part / Continue Script": loads the project and shows where the story stopped. */
  const continueSeries = async (p: ProjectSummary) => {
    setError(null); setBusy(true);
    try {
      const d = await Series.get(p.id);
      if (d.activeEpisodeId) { setDetail(d); setEpisode(null); setEpisodeId(d.activeEpisodeId); setView('progress'); return; }
      const def = d.defaults;
      if (def?.format) setFormat(def.format);
      if (def?.look) setLook(def.look);
      if (def?.aspect) setRatio(def.aspect);
      if (def?.brief) { setMood(def.brief.mood); setCamera(def.brief.cameraProfile); if (def.brief.presentation) setPresentation(def.brief.presentation); if (def.brief.genre) setGenre(def.brief.genre); if (def.brief.intensity) setIntensity(def.brief.intensity); if (def.brief.dialogue) setDialogue(def.brief.dialogue); if (def.brief.ending) setEnding(def.brief.ending); if (def.brief.cast) setCast(def.brief.cast); if (def.brief.animalsTalk !== undefined) setAnimalsTalk(def.brief.animalsTalk); if (def.brief.trope) setTrope(def.brief.trope); if (def.brief.requestedSeconds) setSeconds(def.brief.requestedSeconds); if (def.brief.sceneSeconds) setSceneSeconds(def.brief.sceneSeconds); }
      setDetail(d); setIdea(''); setScript(''); setLockEnabled(false); setWriter(d.recap?.hasRemainingScript ? 'paste' : 'ai'); setView('compose');
    } catch (e) { setError(e instanceof Error ? e.message : 'This series could not be opened.'); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (writer === 'ai' && !continuing && idea.trim().length < 10) { setError('Describe your story in a sentence or two: the title and what it is about.'); return; }
    if (writer === 'paste' && script.trim().length < 40 && !(continuing && detail?.recap?.hasRemainingScript)) { setError('Paste your script first. A few lines is enough to start.'); return; }
    const selectedDeapiModel = videoModels.find((model) => model.slug === videoModel);
    if (startFrame && (videoProvider === 'deapi' || videoProvider === 'auto') && selectedDeapiModel && !selectedDeapiModel.supportsImageToVideo) {
      setError('The selected deAPI model does not support image-to-video. Choose a model marked “image-to-video” or remove the opening frame.');
      return;
    }
    if (endFrame && videoProvider !== 'deapi') {
      setError('Ending-frame control is currently available only when DeAPI is selected as the video engine. Select DeAPI for this production.');
      return;
    }
    if (endFrame && selectedDeapiModel && !selectedDeapiModel.supportsLastFrame) {
      setError('The selected DeAPI model does not support a separate ending frame. Choose a model marked “start/end frame” or remove the ending frame.');
      return;
    }
    const built = buildBrief({ seconds, sceneSeconds, mood, camera, presentation: format === 'documentary' ? 'narrated' : presentation, genre, intensity, dialogue, ending, cast, animalsTalk, trope, lockEnabled: !continuing && lockEnabled, lockName, lockDescriptor, secondsLeft });
    if (built.ok === false) { setError(built.error); return; }
    setError(null); setBusy(true);
    try {
      const r = await Series.create({
        projectId: detail?.project.id, title: title.trim() || undefined, idea: idea.trim(), mode: writer, script: writer === 'paste' ? script.trim() : undefined,
        format, look, aspectRatio: ratio, niche: nicheName, brief: built.brief, reviewFirst, characterReferences,
        videoProvider,
        videoModel: videoProvider === 'deapi' || videoProvider === 'auto' ? videoModel : undefined,
        brandKit: (brandName.trim() || brandTagline.trim() || brandCta.trim() || brandUrl.trim() || brandLogo || brandReferences.length || startFrame || endFrame) ? {
          brandName: brandName.trim(), tagline: brandTagline.trim(), primaryColor: brandColor,
          cta: brandCta.trim(), url: brandUrl.trim(),
          logoAssetId: brandLogo?.id, referenceAssetIds: brandReferences.map((asset) => asset.id),
          startFrameAssetId: startFrame?.id,
          endFrameAssetId: endFrame?.id,
        } : undefined,
        series: !continuing && kind === 'series' ? { parts, deliver } : undefined,
      });
      setEpisode(null); setEpisodeId(r.episodeId); setView('progress'); usageRef.current?.();
    } catch (e) { setError(e instanceof Error ? e.message : 'The part could not be started.'); }
    finally { setBusy(false); }
  };

  const openActive = (p: ProjectSummary) => {
    const a = p.episodes.find((e) => isOpen(e.status));
    if (a) { setDetail(null); setEpisode(null); setEpisodeId(a.id); setView('progress'); }
  };
  const openEpisode = (id: string) => { setDetail(null); setEpisode(null); setEpisodeId(id); setView('progress'); };

  const retry = async () => {
    if (!episode) return;
    setBusy(true); setError(null);
    try { await Series.retry(episode.id); setEpisode({ ...episode, status: 'RENDERING', error: null }); setPollKey((k) => k + 1); usageRef.current?.(); }
    catch (e) { setError(e instanceof Error ? e.message : 'This part could not be restarted.'); }
    finally { setBusy(false); }
  };

  const refresh = async (id: string) => { const ep = await Series.status(id); setEpisode(ep); return ep; };
  const pauseNow = async () => {
    if (!episode) return;
    setBusy(true); setError(null); setNotice('');
    try { await Series.pause(episode.id); await refresh(episode.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'This part could not be paused.'); }
    finally { setBusy(false); }
  };
  const resumeNow = async () => {
    if (!episode) return;
    setBusy(true); setError(null); setNotice('');
    try { await Series.resume(episode.id); await refresh(episode.id); setPollKey((k) => k + 1); usageRef.current?.(); }
    catch (e) { setError(e instanceof Error ? e.message : 'This part could not be resumed.'); }
    finally { setBusy(false); }
  };
  const saveScript = async (name: string, scenes: EditableScene[], start: boolean) => {
    if (!episode) return;
    setBusy(true); setError(null); setNotice('');
    try {
      await Series.edit(episode.id, name, scenes, start);
      await refresh(episode.id);
      if (start) { setPollKey((k) => k + 1); usageRef.current?.(); } else setNotice('Your changes are saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Your changes could not be saved.'); }
    finally { setBusy(false); }
  };

  const prepareCleanPlate = async () => {
    if (!detail) return;
    setLocationEditBusy(true); setLocationEditMessage(''); setError(null);
    try {
      const result = await Series.cleanPlate(detail.project.id, locationEditInstruction);
      setDetail((current) => current ? { ...current, project: { ...current.project, referenceAssets: result.referenceAssets } } : current);
      setLocationEditMessage(`Matched clean plate and opening frame prepared for Part ${result.nextPart}. Generate the next part to use them.`);
    } catch (e) {
      setLocationEditMessage(e instanceof Error ? e.message : 'The clean plate could not be prepared.');
    } finally { setLocationEditBusy(false); }
  };

  const downloadFull = async (ep: Episode) => {
    if (!ep.finalVideoUrl) return;
    setDl({ busy: true, msg: 'Step 1 of 2: joining your scenes into one video. This usually takes 10 to 30 seconds.' });
    try {
      const r = await fetch(ep.finalVideoUrl, { credentials: 'same-origin' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({} as { error?: string }));
        throw new Error(d.error || `The clips could not be joined (error ${r.status}). Please try again in a moment.`);
      }
      // the video is ready: show real download progress instead of waiting in silence
      const total = Number(r.headers.get('Content-Length')) || 0;
      const reader = r.body?.getReader();
      let blob: Blob;
      if (reader) {
        const chunks: Uint8Array[] = []; let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) { chunks.push(value); got += value.length; setDl({ busy: true, msg: total ? `Step 2 of 2: downloading ${Math.min(100, Math.round((got / total) * 100))}% (${(got / 1048576).toFixed(1)} MB)` : `Step 2 of 2: downloading ${(got / 1048576).toFixed(1)} MB` }); }
        }
        blob = new Blob(chunks as BlobPart[], { type: 'video/mp4' });
      } else blob = await r.blob();
      saveBlob(blob, `${(ep.title || 'omnipulse-video').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'omnipulse-video'}.mp4`);
      setDl({ busy: false, msg: '' });
    } catch (e) { setDl({ busy: false, msg: e instanceof Error ? e.message : 'The clips could not be joined.' }); }
  };

  const errorBox = error && (
    <div role="alert" className="flex items-start gap-2 text-xs text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></div>
  );

  // ------------------------------------------------------------------ progress
  if (view === 'progress') {
    const stage = !episode ? 'Starting' : episode.status === 'PROCESSING' ? (episode.mode === 'paste' ? 'Preparing your script' : 'Writing the script') : episode.status === 'RENDERING' ? 'Making the scenes' : episode.status === 'COMPLETED' ? 'Finished' : episode.status === 'PAUSED' ? 'Paused' : episode.status === 'REVIEW' ? 'Review your script' : 'Stopped';
    const pct = !episode ? 3 : episode.status === 'PROCESSING' ? 15 : episode.status === 'RENDERING' ? 25 + (episode.partsTotal ? Math.round((episode.partsDone / episode.partsTotal) * 70) : 0) : 100;
    const nextPartPending = !!episode && episode.status === 'COMPLETED' && episode.autoContinue && episode.partNumber < episode.targetParts;
    return (
      <div className="space-y-4">
        {!single && <button type="button" onClick={backToList} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"><ArrowLeft className="w-3.5 h-3.5" />All series</button>}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] text-indigo-300 font-semibold">{episode ? (episode.targetParts > 1 ? `Part ${episode.partNumber} of ${episode.targetParts}` : `Part ${episode.partNumber}`) : 'Your next part'}</p>
              <h3 className="text-base font-bold text-white truncate">{episode?.title || 'Working on it'}</h3>
            </div>
            <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border ${episode?.status === 'COMPLETED' ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : episode?.status === 'FAILED' ? 'bg-red-950 border-red-800 text-red-300' : 'bg-indigo-950 border-indigo-700 text-indigo-200'}`}>{stage}</span>
          </div>

          {(!episode || isActive(episode.status)) && (
            <>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-indigo-500 transition-all duration-700" style={{ width: `${pct}%` }} /></div>
              <p className="text-xs text-slate-300 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />{stage}{episode?.status === 'RENDERING' && episode.partsTotal ? `: ${episode.partsDone} of ${episode.partsTotal} clips ready` : '...'}</p>
              {episode?.note && <p className="text-[11px] text-amber-300 bg-amber-950/30 border border-amber-900/60 rounded-lg px-3 py-2">{episode.note}</p>}
              <p className="text-[11px] text-slate-500">This runs on our servers, so you can leave this page. Errors are retried by themselves, and your part appears here when it is ready.</p>
              {episode && <button type="button" onClick={pauseNow} disabled={busy} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-white flex items-center gap-1.5"><Pause className="w-3.5 h-3.5" />Pause</button>}
            </>
          )}

          {episode?.status === 'PAUSED' && (
            <div className="space-y-3">
              <p className="text-xs text-amber-200 bg-amber-950/30 border border-amber-900/60 rounded-lg px-3 py-2">Paused.{episode.partsTotal ? ` ${episode.partsDone} of ${episode.partsTotal} clips are finished.` : ''} Clips that were already sent keep rendering, and they are collected when you resume.{episode.editable ? ' You can still edit the script below before you resume.' : ''}</p>
              <button type="button" onClick={resumeNow} disabled={busy} className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-1.5">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}Resume</button>
            </div>
          )}
          {episode?.status === 'REVIEW' && <p className="text-xs text-emerald-200 bg-emerald-950/30 border border-emerald-900/60 rounded-lg px-3 py-2">Your script is ready. Read it, change anything you like, then approve it to start making the video. No video seconds are used until you approve.</p>}
          {(episode?.status === 'REVIEW' || episode?.status === 'PAUSED') && episode.editable && (
            <>
              <ScriptEditor key={`${episode.id}-${episode.status}`} title={episode.title} characters={episode.editable.characters} scenes={episode.editable.scenes} canStart={episode.status === 'REVIEW'} busy={busy} onSave={saveScript} />
              {notice && <p role="status" className="text-[11px] text-emerald-300">{notice}</p>}
            </>
          )}

          {episode && (episode.status === 'COMPLETED' || episode.status === 'FAILED') && episode.visualQuality?.length > 0 && (() => {
            const checks = episode.visualQuality;
            const passed = checks.filter((check) => check.status === 'passed').length;
            const warnings = checks.filter((check) => check.status === 'warning' || check.status === 'rejected').length;
            const unavailable = checks.filter((check) => check.status === 'unavailable').length;
            const attention = checks.filter((check) => check.status !== 'passed').slice(0, 6);
            return (
              <section className="rounded-xl border border-slate-700 bg-slate-950/70 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white">AI visual quality review</p>
                  <p className="text-[10px] text-slate-400">{passed}/{checks.length} clips passed · {warnings} warnings · {unavailable} unverified</p>
                </div>
                {attention.length > 0 ? (
                  <div className="space-y-2">
                    {attention.map((check) => (
                      <div key={`${check.scene}-${check.part}`} className="rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[10px] font-semibold text-slate-200">Scene {check.scene} · Clip {check.part}</span>
                          <span className={`text-[9px] font-bold uppercase ${check.status === 'rejected' ? 'text-rose-300' : check.status === 'warning' ? 'text-amber-300' : 'text-slate-400'}`}>{check.status}</span>
                        </div>
                        <p className="mt-1 text-[10px] text-slate-400">{check.summary || 'No additional review details.'}</p>
                        {(check.qualityScore !== null || check.promptMatchScore !== null || check.motionCoherenceScore !== null) && (
                          <p className="mt-1 text-[9px] text-slate-500">
                            {check.qualityScore !== null ? `Visual quality ${check.qualityScore}/100 · ` : ''}
                            {check.promptMatchScore !== null ? `Scene match ${check.promptMatchScore}/100 · ` : ''}
                            {check.motionCoherenceScore !== null ? `Motion coherence ${check.motionCoherenceScore}/100` : ''}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : <p className="text-[10px] text-emerald-300">All reviewed clips passed the automated visual checks.</p>}
                {unavailable > 0 && <p className="text-[10px] text-amber-300">Some clips could not be checked by the vision reviewer. Those clips are marked unverified, not passed.</p>}
              </section>
            );
          })()}

          {episode?.status === 'FAILED' && (
            <div className="space-y-2">
              <div role="alert" className="text-xs text-red-300 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">{episode.error || 'This part could not be made.'}</div>
              <button type="button" onClick={retry} disabled={busy} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" />Retry (finished clips are kept)</button>
            </div>
          )}

          {episode?.status === 'COMPLETED' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-300">{episode.logline}</p>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-500/20 bg-indigo-950/20 p-3">
                <div><p className="text-xs font-semibold text-white">Generated clip soundtrack</p><p className="text-[10px] text-slate-400">DeAPI creates dialogue, ambience and effects together with the video. The player uses that original synced audio instead of layering a second TTS voice over it.</p></div>
                <button type="button" onClick={() => setAudioEnabled((v) => !v)} aria-pressed={audioEnabled} className={`rounded-lg px-3 py-2 text-xs font-semibold ${audioEnabled ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{audioEnabled ? 'Clip audio on' : 'Clip audio off'}</button>
              </div>
              {episode.brief.format === 'commercial' && episode.hasBrandLogo && episode.finalVideoUrl ? (
                <section className="space-y-2">
                  <p className="text-xs font-semibold text-emerald-200">Final branded advert preview</p>
                  <video key={episode.id + episode.finalVideoUrl} src={episode.finalVideoUrl} controls playsInline preload="metadata" className="w-full max-h-[60vh] rounded-xl bg-black" />
                  <p className="text-[11px] text-slate-400">This is the finished MP4 with your exact uploaded logo and clean 8-second closing card. Individual raw scene previews below are not branded.</p>
                  <details className="rounded-lg border border-slate-800 p-2">
                    <summary className="cursor-pointer text-[11px] text-slate-400">View original generated scene clips</summary>
                    <div className="mt-2"><ClipSequence clips={episode.clips} captions={episodeCaptionTracks(episode.scenes)} audioEnabled={audioEnabled} /></div>
                  </details>
                </section>
              ) : (
                <ClipSequence clips={episode.clips} captions={episodeCaptionTracks(episode.scenes)} audioEnabled={audioEnabled} />
              )}
              {episode.clipJobIds?.length > 0 && (
                <section className="rounded-xl border border-indigo-500/30 bg-slate-950/80 p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><h3 className="text-sm font-semibold text-white flex items-center gap-2"><Clapperboard className="w-4 h-4 text-indigo-300" />Episode Timeline Editor</h3><p className="text-[10px] text-slate-400 mt-1">Rearrange or remove generated shots, then export your edited cut.</p></div>
                    <span className="text-[10px] text-slate-400">{editorOrder.length} clips in cut</span>
                  </div>
                  <ol className="space-y-2">
                    {editorOrder.map((jobId, index) => {
                      const originalIndex = episode.clipJobIds.indexOf(jobId);
                      return <li key={jobId} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2">
                        <span className="w-7 shrink-0 text-center text-[10px] font-bold text-indigo-300">{index + 1}</span>
                        <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">Shot {originalIndex + 1}</p><p className="text-[10px] text-slate-500">Generated scene clip · approx. 10 seconds</p></div>
                        <button type="button" onClick={() => moveEditorClip(index, -1)} disabled={index === 0} aria-label="Move clip earlier" className="rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 disabled:opacity-30">↑</button>
                        <button type="button" onClick={() => moveEditorClip(index, 1)} disabled={index === editorOrder.length - 1} aria-label="Move clip later" className="rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 disabled:opacity-30">↓</button>
                        <button type="button" onClick={() => removeEditorClip(index)} aria-label="Remove clip" className="rounded-md border border-rose-900/70 px-2 py-1.5 text-xs text-rose-300">Remove</button>
                      </li>;
                    })}
                  </ol>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" onClick={() => setEditorOrder(episode.clipJobIds)} className="rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-300">Reset order</button>
                    <a href={editorOrder.length ? `/api/video/merge?ids=${encodeURIComponent(editorOrder.join(','))}&name=${encodeURIComponent(episode.title || 'omnipulse-edited')}` : undefined} aria-disabled={editorOrder.length === 0} className={`rounded-lg px-3 py-2 text-[11px] font-semibold text-white ${editorOrder.length ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-slate-700 opacity-40 pointer-events-none'}`}>Export edited MP4</a>
                  </div>
                  <p className="text-[10px] text-slate-500">This episode editor supports shot order and removal. Original dialogue, ambience and music remain attached to their clips when you reorder or remove shots.</p>
                </section>
              )}
              <div className="flex flex-wrap gap-2">
                {episode.finalVideoUrl && (
                  <button type="button" onClick={() => downloadFull(episode)} disabled={dl.busy} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-xs font-semibold text-white flex items-center gap-1.5">
                    {dl.busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}Download full video (one MP4)
                  </button>
                )}
                <button type="button" onClick={() => {
                  const tracks = episodeCaptionTracks(episode.scenes); let offset = 0; const cues: string[] = [];
                  tracks.forEach((track) => { track.forEach((cue) => { cues.push(`${cues.length + 1}\n${vttTime(offset + cue.start)} --> ${vttTime(offset + cue.end)}\n${cue.text}`); }); offset += 10; });
                  const base = (episode.title || 'omnipulse-subtitles').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'omnipulse-subtitles';
                  saveBlob(new Blob([`WEBVTT\n\n${cues.join('\n\n')}`], { type: 'text/vtt' }), `${base}.vtt`);
                }} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Download accurate subtitles (.vtt)</button>
                {single
                  ? <><button type="button" onClick={backToList} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Make another video</button>
                  <button type="button" onClick={() => { backToList(); const pool = startersFor(); setIdea(pool[Math.floor(Math.random() * pool.length)]); }} className="px-3 py-2 rounded-lg bg-linear-to-r from-indigo-600 to-fuchsia-600 hover:opacity-90 text-xs font-semibold text-white flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Remix: new idea, same style</button></>
                  : !nextPartPending && <button type="button" onClick={async () => { const p = projects?.find((x) => x.id === episode.projectId); if (p) await continueSeries(p); else backToList(); }} className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />Generate Next Part / Continue Script</button>}
              </div>
              {dl.msg && <p role={dl.busy ? 'status' : 'alert'} className={`text-[11px] ${dl.busy ? 'text-slate-400' : 'text-red-300'}`}>{dl.msg}</p>}
              {nextPartPending && (nextId
                ? <button type="button" onClick={() => { const id = nextId; setNextId(null); setEpisode(null); setEpisodeId(id); }} className="px-3 py-2 rounded-lg bg-indigo-950 border border-indigo-600 text-xs font-semibold text-indigo-100 flex items-center gap-1.5"><ChevronRight className="w-3.5 h-3.5" />Part {episode.partNumber + 1} of {episode.targetParts} is being made. Tap to follow it.</button>
                : <p className="text-[11px] text-indigo-300 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />Part {episode.partNumber + 1} of {episode.targetParts} is starting by itself...</p>)}
              {episode.hasRemainingScript && <p className="text-[11px] text-amber-300">Part of your script did not fit in this part. It is saved: tap Generate Next Part to carry on with it.</p>}
            </div>
          )}
        </div>

        {episode && episode.characters.length > 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5 mb-2"><Users className="w-3.5 h-3.5 text-indigo-400" />Cast ({episode.characters.length} characters)</p>
            <div className="flex flex-wrap gap-2">
              {episode.characters.map((c) => <span key={c.name} className="text-[11px] rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300"><span className="font-semibold text-white">{c.name}</span> · {c.role || 'character'}{c.voice ? ` · ${c.voice}` : ''}</span>)}
            </div>
          </div>
        )}
        {episode?.status === 'COMPLETED' && (() => {
          const g = episode.brief?.brief?.genre ?? 'auto';
          return <MoviePoster title={episode.title} tagline={episode.logline} cast={episode.characters.filter((c) => c.name.toLowerCase() !== 'narrator').map((c) => c.name)}
            genre={g} genreLabel={GENRE_OPTIONS.find((o) => o.id === g)?.label} partLabel={episode.partNumber > 1 || (episode.targetParts ?? 1) > 1 ? `Part ${episode.partNumber}` : undefined} />;
        })()}
        {episode && episode.notes.length > 0 && <div className="space-y-1">{episode.notes.map((n) => <p key={n} className="text-[11px] text-amber-300">{n}</p>)}</div>}

        {episode && episode.scenes.length > 0 && (
          <ol className="space-y-2">
            {episode.scenes.map((s, i) => {
              const st = episode.sceneStates[i];
              return (
                <li key={s.sceneId} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold text-indigo-300">Scene {s.sceneNumber} <span className="text-slate-500 font-normal">· {s.beat} · {s.clipSeconds} seconds</span></p>
                    <span className="shrink-0">
                      {st === 'done' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : st === 'failed' ? <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> : st === 'rendering' ? <Loader2 className="w-3.5 h-3.5 text-indigo-300 animate-spin" /> : episode.status === 'COMPLETED' ? null : <Clock className="w-3.5 h-3.5 text-slate-500" />}
                    </span>
                  </div>
                  {s.lines.length ? s.lines.map((l, k) => <p key={k} className="text-xs text-slate-200 mt-1"><span className="font-semibold text-white">{l.speaker}:</span> {l.text}</p>) : <p className="text-xs text-slate-400 mt-1 italic">No dialogue in this scene.</p>}
                </li>
              );
            })}
          </ol>
        )}
        {errorBox}
      </div>
    );
  }

  // ------------------------------------------------------------------ compose (new video or series, or the next part)
  if (view === 'compose') {
    const recap = detail?.recap;
    const showSeriesChoice = !single && !continuing;
    const lengthWarn = secondsLeft != null && wholeSeries > secondsLeft;
    return (
      <div className="space-y-4">
        {!single && <button type="button" onClick={backToList} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"><ArrowLeft className="w-3.5 h-3.5" />All series</button>}
        <div>
          <h3 className="text-base font-bold text-white">{continuing ? `${detail!.project.title}: Part ${partNumber}` : single ? 'Make a video' : kind === 'series' ? 'Start a new series' : 'Make a video'}</h3>
          <p className="text-xs text-slate-400">{continuing ? 'We remember the characters, places and ending of the last part, so the story carries on from there.' : 'Choose who writes the script, how long it should be, and the AI does the rest.'}</p>
        </div>
        <section className="overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/40 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-300">OmniPulse Creator Canvas</p><h4 className="mt-1 text-sm font-bold text-white">From first idea to finished cut</h4></div>
            <span className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2.5 py-1 text-[9px] font-semibold text-indigo-200">Studio workflow</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
            {[
              { number: '01', title: 'Creative brief', detail: 'Story, format, duration and visual style', icon: Sparkles },
              { number: '02', title: 'Visual direction', detail: 'Cast, brand assets and opening frame', icon: Camera },
              { number: '03', title: 'Storyboard', detail: 'Review scenes, camera beats and dialogue', icon: FileText },
              { number: '04', title: 'Edit & export', detail: 'Captions, sound, overlays and final MP4', icon: Film },
            ].map((step, index) => {
              const Icon = step.icon;
              return <div key={step.number} className="relative rounded-xl border border-slate-800/90 bg-slate-950/70 p-3">
                <div className="flex items-center justify-between"><span className="text-[10px] font-mono font-bold text-indigo-300">{step.number}</span><Icon className="h-3.5 w-3.5 text-slate-500" /></div>
                <p className="mt-2 text-[11px] font-bold text-white">{step.title}</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">{step.detail}</p>
                {index < 3 && <span className="absolute -right-1.5 top-1/2 z-10 hidden h-3 w-3 -translate-y-1/2 rounded-full border border-indigo-400/30 bg-slate-900 xl:block" />}
              </div>;
            })}
          </div>
        </section>

        {recap && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-200">Where you left off: Part {recap.partNumber}, "{recap.title}"</p>
            {recap.storySoFar && <p className="text-xs text-slate-300">{recap.storySoFar}</p>}
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer text-indigo-300">Script of Part {recap.partNumber} ({recap.scenes.length} scenes)</summary>
              <ol className="mt-2 space-y-1.5 list-decimal list-inside">{recap.scenes.map((s) => <li key={s.sceneId}>{s.voiceoverText}</li>)}</ol>
            </details>
            {detail!.project.characters.length > 0 && <p className="text-[11px] text-slate-500">Cast we will keep consistent: {detail!.project.characters.map((c) => c.name).join(', ')}.</p>}
            {recap.hasRemainingScript && <p className="text-[11px] text-amber-300">Your pasted script was longer than Part {recap.partNumber}. The rest is saved and will be used for this part unless you paste something new.</p>}
          </div>
        )}

        {continuing && detail?.project.referenceAssets?.locationPlateUrl && (
          <section className="rounded-xl border border-indigo-500/30 bg-slate-950/70 p-3 space-y-2.5">
            <div>
              <p className="text-xs font-semibold text-indigo-200 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Prepare a scene change</p>
              <p className="text-[10px] text-slate-400 mt-1">Update the location plate and the previous episode's final frame together. The next part starts from the matching edited frame.</p>
            </div>
            <img src={detail.project.referenceAssets.locationPlateUrl} alt="Saved series location reference" className="w-full max-h-48 object-contain rounded-lg border border-slate-800 bg-slate-900" />
            <label className="block text-[11px] font-medium text-slate-300" htmlFor="series-clean-plate-instruction">What should change?</label>
            <textarea id="series-clean-plate-instruction" value={locationEditInstruction} onChange={(e) => setLocationEditInstruction(e.target.value)} rows={3} maxLength={650}
              className={areaCls} placeholder="For example: clear the table but keep the exact kitchen and camera angle." />
            <button type="button" onClick={() => void prepareCleanPlate()} disabled={locationEditBusy || locationEditInstruction.trim().length < 8} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">
              {locationEditBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {locationEditBusy ? 'Editing both references…' : 'Prepare matching clean plate'}
            </button>
            {locationEditMessage && <p role="status" className="text-[10px] text-slate-300">{locationEditMessage}</p>}
            <p className="text-[10px] text-amber-300/80">This uses two fal.ai image edits and may consume image credits. It does not spend video seconds.</p>
          </section>
        )}

        {showSeriesChoice && (
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="One video or a series">
            <button type="button" onClick={() => setKind('one')} aria-pressed={kind === 'one'} className={chip(kind === 'one')}><span className="block font-bold">One video</span><span className="block text-[10px] text-slate-400 font-normal mt-0.5">A single story from start to end</span></button>
            <button type="button" onClick={() => setKind('series')} aria-pressed={kind === 'series'} className={chip(kind === 'series')}><span className="block font-bold">A series</span><span className="block text-[10px] text-slate-400 font-normal mt-0.5">Several parts that continue the story</span></button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Who writes the script">
          <button type="button" onClick={() => setWriter('ai')} aria-pressed={writer === 'ai'} className={chip(writer === 'ai')}><span className="block font-bold flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />AI writes it</span><span className="block text-[10px] text-slate-400 font-normal mt-0.5">Give a title and instructions</span></button>
          <button type="button" onClick={() => setWriter('paste')} aria-pressed={writer === 'paste'} className={chip(writer === 'paste')}><span className="block font-bold flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />I will paste my script</span><span className="block text-[10px] text-slate-400 font-normal mt-0.5">The AI works with your words</span></button>
        </div>

        {!continuing && (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="series-title">Title {writer === 'ai' ? '' : '(optional)'}</label>
              <input id="series-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder={writer === 'ai' ? 'The name of your story' : 'We will name it from your script if you leave this empty'} className={selectCls} />
            </div>
            <section className="rounded-2xl border border-indigo-400/25 bg-slate-950/75 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-bold text-white flex items-center gap-2"><ImagePlus className="w-4 h-4 text-amber-300" /> Brand kit & visual references</p><p className="mt-1 text-[11px] text-slate-400">Add your real logo, product photos, people and locations before writing the storyboard.</p></div>
                <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">Private</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-400">Brand / business name<input value={brandName} onChange={(e) => setBrandName(e.target.value)} maxLength={80} placeholder="e.g. OmniPulse AI" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" /></label>
                <label className="text-[11px] text-slate-400">Tagline (optional)<input value={brandTagline} onChange={(e) => setBrandTagline(e.target.value)} maxLength={100} placeholder="One AI. A million possibilities." className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" /></label>
                <label className="text-[11px] text-slate-400">Call to action<input value={brandCta} onChange={(e) => setBrandCta(e.target.value)} maxLength={60} placeholder={/omnipulse/i.test(brandName) ? "Start free today" : "Learn more"} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" /></label>
                <label className="text-[11px] text-slate-400">Website / destination URL<input value={brandUrl} onChange={(e) => setBrandUrl(e.target.value)} maxLength={140} placeholder={/omnipulse/i.test(brandName) ? "OmniPulseai.us.ci" : "yourwebsite.com"} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" /></label>
              </div>
              <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">Primary brand colour<input aria-label="Primary brand colour" type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-slate-700 bg-slate-900 p-0.5" /><span className="font-mono text-slate-400">{brandColor.toUpperCase()}</span></label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void uploadBrandAssets(e.target.files, 'logo'); e.target.value = ''; }} />
                  <button type="button" disabled={brandUploadBusy} onClick={() => logoInputRef.current?.click()} className="w-full rounded-lg border border-dashed border-slate-600 px-3 py-3 text-left hover:border-indigo-400 disabled:opacity-50"><span className="flex items-center gap-2 text-xs font-semibold text-white"><ImagePlus className="w-4 h-4 text-amber-300" /> {brandLogo ? 'Replace logo' : 'Upload brand logo'}</span><span className="mt-1 block text-[10px] text-slate-400">PNG, JPG or WebP · max 15 MB</span></button>
                  {brandLogo && <div className="mt-2 flex items-center gap-2">{brandLogo.previewUrl && <img src={brandLogo.previewUrl} alt="Uploaded brand logo preview" className="h-10 w-10 rounded-lg bg-white object-contain p-1" />}<span className="min-w-0 flex-1 truncate text-[10px] text-slate-300">{brandLogo.name}</span><button type="button" aria-label="Remove uploaded logo" onClick={() => setBrandLogo(null)} className="rounded-md p-1 text-slate-400 hover:text-white"><Trash2 className="h-3.5 w-3.5" /></button></div>}
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                  <input ref={brandRefsInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void uploadBrandAssets(e.target.files, 'reference'); e.target.value = ''; }} />
                  <button type="button" disabled={brandUploadBusy || brandReferences.length >= 4} onClick={() => brandRefsInputRef.current?.click()} className="w-full rounded-lg border border-dashed border-slate-600 px-3 py-3 text-left hover:border-indigo-400 disabled:opacity-50"><span className="flex items-center gap-2 text-xs font-semibold text-white"><ImagePlus className="w-4 h-4 text-amber-300" /> Add visual references</span><span className="mt-1 block text-[10px] text-slate-400">Products, people, locations · up to 4</span></button>
                  {brandReferences.length > 0 && <div className="mt-2 grid grid-cols-4 gap-1.5">{brandReferences.map((asset) => <div key={asset.id} className="relative">{asset.previewUrl && <img src={asset.previewUrl} alt={asset.name} title={asset.name} className="h-12 w-full rounded-md bg-slate-800 object-cover" />}<button type="button" aria-label="Remove reference image" onClick={() => setBrandReferences((current) => current.filter((item) => item.id !== asset.id))} className="absolute -right-1 -top-1 rounded-full bg-slate-950 p-0.5 text-white"><Trash2 className="h-3 w-3" /></button></div>)}</div>}
                </div>
              </div>
              {brandUploadBusy && <p className="text-[11px] text-indigo-300 animate-pulse">Uploading securely to your private media library…</p>}
              {brandUploadMessage && <p className="text-[11px] text-emerald-300">{brandUploadMessage}</p>}
              {brandUploadError && <p role="alert" className="text-[11px] text-rose-300">{brandUploadError}</p>}
              <p className="text-[10px] leading-relaxed text-slate-500">Your exact logo is stored privately and automatically composited onto the clean closing card of the final exported Brand Ad MP4; it will not appear in raw generated-shot previews. Product and visual references are prioritised for commercial renders. FAL/Kling can receive multiple references when configured; DeAPI accepts one starting image, so its first commercial shot uses your first visual reference as its opening-frame anchor.</p>
            </section>
            {format === 'commercial' && <p className="rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[11px] text-amber-100">Commercial preset: a 30-second advert built from six directed 5-second shots, with a 4-second branded ending. You will review the storyboard before any video clips render.</p>}
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map((f) => <button key={f.id} type="button" onClick={() => { setFormat(f.id); setLook(f.look); if (f.id === 'documentary' || f.id === 'commercial') setPresentation('narrated'); else if (presentation === 'narrated') setPresentation('movie'); if (f.id === 'commercial') { setSceneSeconds(10); setReviewFirst(true); setSeconds(30); } }} aria-pressed={format === f.id} className={chip(format === f.id)}><span className="block font-bold">{f.title}</span></button>)}
            </div>
            <div className="flex gap-2">{RATIOS.map((r) => <button key={r} type="button" onClick={() => setRatio(r)} aria-pressed={ratio === r} className={chip(ratio === r)}>{r}</button>)}</div>
          </>
        )}

        {writer === 'ai' ? (
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="series-idea">{continuing ? `What should happen in Part ${partNumber}? (optional)` : 'Instructions for the AI'}</label>
            <textarea id="series-idea" value={idea} onChange={(e) => setIdea(e.target.value)} rows={4} maxLength={800}
              placeholder={continuing ? 'Leave this empty and the AI decides what happens next, or tell it: Odalys finds the letter and confronts Bram...' : 'Who is it about, where, what goes wrong, what tone, how it should end...'}
              className={areaCls} />
            {!continuing && (
              <div className="mt-2 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => { const pool = startersFor(); setIdea(pool[Math.floor(Math.random() * pool.length)]); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-linear-to-r from-indigo-600 to-fuchsia-600 text-white text-[11px] font-bold hover:opacity-90">
                    <Sparkles className="w-3 h-3" />Surprise me
                  </button>
                  <span className="text-[11px] text-slate-500">or tap a story starter{genre !== 'auto' ? ` for ${GENRE_OPTIONS.find((g) => g.id === genre)?.label}` : ''}:</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {startersFor().map((t) => (
                    <button key={t} type="button" onClick={() => setIdea(t)} className="text-left text-[11px] leading-snug text-slate-300 px-3 py-2 rounded-lg border border-slate-800 bg-slate-950 hover:border-indigo-500/60 hover:text-white transition-colors">{t}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5" htmlFor="series-script">{continuing ? 'Paste the next scenes or script' : 'Paste your script'}</label>
            <textarea id="series-script" value={script} onChange={(e) => setScript(e.target.value)} rows={9} maxLength={20000}
              placeholder={'INT. HOTEL LOBBY - NIGHT\nRain lashes the glass. Mara rushes in, soaked, clutching a torn photograph. (ACTION: show her searching the room)\nMARA: You said you would come alone.\nJONAH: I had no choice.\nNARRATOR (V.O.): By midnight, everything had changed.\n...'}
              className={`${areaCls} font-mono text-xs`} />
            <p className="text-[11px] text-slate-500 mt-1">{script.length.toLocaleString()} / 20,000 characters. The AI automatically separates visible action, each character's dialogue, narrator / voice-over, thoughts and sound cues. It keeps your plot, names and dialogue wording, then builds a scene-by-scene film storyboard.{continuing && recap?.hasRemainingScript ? ' Leave it empty to carry on with the saved rest of your script.' : ''}</p>
          </div>
        )}

        {showSeriesChoice && kind === 'series' && (
          <fieldset className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
            <legend className="px-1 text-xs font-semibold text-slate-200">How should the series be delivered?</legend>
            <div className="grid sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => setDeliver('all')} aria-pressed={deliver === 'all'} className={chip(deliver === 'all')}><span className="block font-bold">Make the whole series now</span><span className="block text-[10px] text-slate-400 font-normal mt-0.5">All parts, one after another, automatically</span></button>
              <button type="button" onClick={() => setDeliver('one')} aria-pressed={deliver === 'one'} className={chip(deliver === 'one')}><span className="block font-bold">One part at a time</span><span className="block text-[10px] text-slate-400 font-normal mt-0.5">I will ask for the next part when I am ready</span></button>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1" htmlFor="series-parts">{deliver === 'all' ? 'Number of parts' : 'Planned number of parts (you can add more later)'}</label>
              <select id="series-parts" value={parts} onChange={(e) => setParts(Number(e.target.value))} className={selectCls}>{[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} parts</option>)}</select>
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">Feature-film mode: up to 10 continuous parts. At the selected length, this project can run for approximately {formatSeconds(perPart * parts)} in total, with the same story world and cast carried forward.</p>
            </div>
          </fieldset>
        )}

        <fieldset className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
          <legend className="px-1 text-xs font-semibold text-slate-200 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-indigo-400" />{kind === 'series' || continuing ? 'Length of each part' : 'Length of the video'}</legend>
          <div className="grid grid-cols-3 gap-2">
            {LENGTH_CHOICES.map((o) => <button key={o.seconds} type="button" onClick={() => setSeconds(o.seconds)} aria-pressed={effective === o.seconds && seconds === o.seconds} className={chip(seconds === o.seconds)}>{o.label}</button>)}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]"><span className="text-slate-400">{formatSeconds(MIN_PART_SECONDS)}</span><span className="font-mono font-bold text-indigo-300">{formatSeconds(perPart)}</span><span className="text-slate-400">{formatSeconds(sliderMax)}</span></div>
            <input type="range" min={MIN_PART_SECONDS} max={sliderMax} step={10} value={Math.min(Math.max(seconds, MIN_PART_SECONDS), sliderMax)} disabled={sliderMax <= MIN_PART_SECONDS} onChange={(e) => setSeconds(Number(e.target.value))} aria-label="Length in seconds" className="w-full accent-indigo-500" />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1.5">How long is each scene?</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSceneSeconds(20)} aria-pressed={sceneSeconds === 20} className={chip(sceneSeconds === 20)}><span className="block font-bold">20 seconds</span><span className="block text-[10px] text-slate-400 font-normal mt-0.5">Full, unhurried scenes (recommended)</span></button>
              <button type="button" onClick={() => setSceneSeconds(10)} aria-pressed={sceneSeconds === 10} className={chip(sceneSeconds === 10)}><span className="block font-bold">10 seconds</span><span className="block text-[10px] text-slate-400 font-normal mt-0.5">Quicker cuts</span></button>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">
            About {sceneCountFor(perPart, sceneSeconds)} scenes of {sceneSeconds} seconds, {formatSeconds(perPart)} in total, using {perPart} of your video seconds{secondsLeft != null ? ` (${secondsLeft} left)` : ''}.
            
          </p>
          {showSeriesChoice && kind === 'series' && deliver === 'all' && <p className="text-[11px] text-slate-400">The whole series of {parts} parts needs about {formatSeconds(wholeSeries)} of video.</p>}
          {lengthWarn && <p className="text-[11px] text-amber-300">Your selected length is above the {secondsLeft} seconds remaining on your plan. Purchased extra seconds may cover the difference. OmniPulse will not silently shorten the film; if the combined balance is too low, it will explain what is needed.</p>}
        </fieldset>

        {!continuing && (
          <div>
            <p className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />Quick start: pick a style and everything below is set for you</p>
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Quick start styles">
              {PRESETS.map((p) => (
                <button key={p.id} type="button" onClick={() => applyPreset(p.id)} title={p.hint} className="shrink-0 w-32 text-left px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-950 hover:border-fuchsia-500/60 transition-colors">
                  <span className="block text-lg" aria-hidden="true">{p.emoji}</span>
                  <span className="block text-[11px] font-bold text-white leading-tight">{p.label}</span>
                  <span className="block text-[10px] text-slate-400 leading-snug mt-0.5">{p.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <fieldset className="rounded-xl border border-indigo-500/30 bg-linear-to-b from-indigo-950/40 to-slate-950/60 p-3 space-y-3.5">
          <legend className="px-1 text-xs font-bold text-indigo-200 flex items-center gap-1.5"><Clapperboard className="w-3.5 h-3.5" />Director's chair</legend>
          <div>
            <p className="text-xs font-semibold text-slate-300 mb-1.5">Is it a movie?</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" role="group" aria-label="Movie or not">
              {PRESENTATION_OPTIONS.map((o) => {
                const on = (format === 'documentary' ? 'narrated' : presentation) === o.id;
                return (
                  <button key={o.id} type="button" disabled={format === 'documentary' && o.id !== 'narrated'} onClick={() => setPresentation(o.id)} aria-pressed={on}
                    className={`p-3 rounded-xl border text-left transition-all disabled:opacity-40 ${on ? 'bg-linear-to-br from-indigo-600/30 to-fuchsia-600/20 border-indigo-400 text-white shadow-lg shadow-indigo-900/40' : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'}`}>
                    <span className="block text-xl" aria-hidden="true">{o.emoji}</span>
                    <span className="block text-xs font-bold mt-1">{o.label}</span>
                    <span className="block text-[10px] text-slate-400 font-normal mt-0.5 leading-snug">{o.hint}</span>
                  </button>
                );
              })}
            </div>
            {format === 'documentary' && <p className="text-[11px] text-slate-500 mt-1">Documentaries are always narrated. Choose Drama or Animation to make a movie.</p>}
          </div>
          <OptionRow legend="Genre" value={genre} onChange={setGenre} options={GENRE_OPTIONS} cols={5} />
          <OptionRow legend="Who stars in it?" value={cast} onChange={setCast} options={CAST_OPTIONS} cols={4} />
          {cast !== 'people' && (
            <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" checked={animalsTalk} onChange={(e) => setAnimalsTalk(e.target.checked)} className="mt-0.5 accent-indigo-500" />
              <span><span className="font-semibold">Let animals and creatures talk.</span> Off keeps them realistic: they act and make sounds. On gives each one a voice, like an animated film.</span>
            </label>
          )}
          {presentation === 'shortdrama' && format !== 'documentary' && <OptionRow legend="Story engine" value={trope} onChange={setTrope} options={TROPE_OPTIONS} cols={5} />}
          {presentation === 'movie' && format !== 'documentary' && <OptionRow legend="Action level" value={intensity} onChange={setIntensity} options={INTENSITY_OPTIONS} cols={3} />}
          {format !== 'documentary' && presentation !== 'narrated' && <OptionRow legend="Dialogue" value={dialogue} onChange={setDialogue} options={DIALOGUE_OPTIONS} cols={3} />}
          <OptionRow legend="How should it end?" value={ending} onChange={setEnding} options={ENDING_OPTIONS} cols={3} />
        </fieldset>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5" htmlFor="series-mood"><Film className="w-3.5 h-3.5 text-indigo-400" />Story Vibe / Mood</label>
            <select id="series-mood" value={mood} onChange={(e) => setMood(e.target.value as StoryMoodId)} className={selectCls}>{MOOD_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5" htmlFor="series-camera"><Camera className="w-3.5 h-3.5 text-indigo-400" />Camera Direction</label>
            <select id="series-camera" value={camera} onChange={(e) => setCamera(e.target.value as CameraProfileId)} className={selectCls}>{CAMERA_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </div>
        </div>

        {!continuing && writer === 'ai' && (
          <fieldset className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2.5">
            <legend className="px-1 text-xs font-semibold text-slate-200">Main character (optional)</legend>
            <label className="flex items-start gap-2 text-xs text-slate-200 cursor-pointer">
              <input type="checkbox" checked={lockEnabled} onChange={(e) => setLockEnabled(e.target.checked)} className="mt-0.5 accent-indigo-500" />
              <span>Lock the main character's look in every scene of every part</span>
            </label>
            {lockEnabled && (
              <div className="space-y-2">
                <input value={lockName} onChange={(e) => setLockName(e.target.value)} maxLength={30} placeholder="Name" aria-label="Character name" className={selectCls} />
                <textarea value={lockDescriptor} onChange={(e) => setLockDescriptor(e.target.value)} rows={2} maxLength={300} placeholder="Age, hair, clothes and one distinctive detail" aria-label="Character description" className={`${selectCls} text-sm`} />
              </div>
            )}
          </fieldset>
        )}

        <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer">
          <input type="checkbox" checked={reviewFirst} onChange={(e) => setReviewFirst(e.target.checked)} className="mt-0.5 accent-indigo-500" />
          <span><span className="font-semibold">Review and edit the screenplay first (recommended).</span> The script is written, then waits for you. Check every scene and line before any video seconds are spent. No video seconds are used until you approve it.</span>
        </label>
        <label className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <input type="checkbox" checked={characterReferences} onChange={(e) => setCharacterReferences(e.target.checked)} className="mt-0.5 accent-indigo-500" />
          <span><span className="font-semibold text-slate-200">Generate cast and location reference images (optional).</span> This can improve visual continuity, but it uses additional image-generation credits. It is off by default to avoid unexpected charges.</span>
        </label>

        <fieldset className="space-y-3 rounded-xl border border-indigo-500/25 bg-slate-950/60 p-3">
          <legend className="px-1 text-xs font-semibold text-slate-200">Video engine & source image</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-400">Video engine for this production</span>
              <select value={videoProvider} onChange={(event) => setVideoProvider(event.target.value as 'fal' | 'deapi' | 'auto')} className={selectCls}>
                {falEnabled && <option value="fal">FAL · Kling / FAL video models</option>}
                {deapiEnabled && <option value="deapi">DeAPI · select from live model list</option>}
                {falEnabled && deapiEnabled && <option value="auto">Automatic · FAL first, DeAPI backup</option>}
              </select>
              <p className="text-[10px] text-slate-500">The choice is saved on this production. FAL and DeAPI selections are strict; Automatic is the only mode that can fail over between them.</p>
            </label>
            <span className="mb-0.5 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-400">{videoProvider === 'auto' ? 'Automatic failover' : videoProvider === 'deapi' ? 'DeAPI engine' : 'FAL engine'}</span>
          </div>
          {(videoProvider === 'deapi' || videoProvider === 'auto') && deapiEnabled && (
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-400">Video generation model</span>
              <select value={videoModel} onChange={(event) => setVideoModel(event.target.value)} disabled={videoModelsLoading || videoModels.length === 0} className={selectCls}>
                {videoModelsLoading && <option value={videoModel}>Loading available deAPI models…</option>}
                {!videoModelsLoading && videoModels.length === 0 && <option value={videoModel}>No video models returned</option>}
                {videoModels.map((model) => <option key={model.slug} value={model.slug}>{model.name}{model.supportsImageToVideo ? ' · image-to-video' : ''}</option>)}
              </select>
              {videoModels.find((model) => model.slug === videoModel)?.description && <p className="text-[10px] text-slate-500">{videoModels.find((model) => model.slug === videoModel)?.description}</p>}
              {videoModelsError && <p role="alert" className="text-[10px] text-rose-300">{videoModelsError}</p>}
              {videoProvider === 'auto' && <p className="text-[10px] text-amber-300/80">The selected deAPI model is used only when automatic failover reaches deAPI. FAL remains the primary engine.</p>}
            </label>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-white">Image-to-video opening frame</p>
              <p className="text-[10px] text-slate-500">Upload one JPG, PNG or WebP to animate its composition as the first shot. The image is stored privately and attached to this production.</p>
              {startFrame && <p className="mt-1 truncate text-[10px] text-emerald-300">Selected: {startFrame.name}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <input ref={startFrameInputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={brandUploadBusy} onChange={(event) => { void uploadBrandAssets(event.target.files, 'startFrame'); event.currentTarget.value = ''; }} className="hidden" />
              <button type="button" onClick={() => startFrameInputRef.current?.click()} disabled={brandUploadBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-[11px] font-semibold text-indigo-200 disabled:opacity-40"><ImagePlus className="h-3.5 w-3.5" />{startFrame ? 'Replace frame' : 'Upload first frame'}</button>
              {startFrame && <button type="button" onClick={() => setStartFrame(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-300">Remove</button>}
            </div>
          </div>
          {videoProvider === 'deapi' && (
            <div className="border-t border-slate-800 pt-3 space-y-2">
              <div>
                <p className="text-[11px] font-semibold text-white">Optional ending frame</p>
                <p className="text-[10px] text-slate-500">For models marked start/end frame, DeAPI guides the shot from your first image toward this final composition.</p>
                {endFrame && <p className="mt-1 truncate text-[10px] text-emerald-300">Selected: {endFrame.name}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <input ref={endFrameInputRef} type="file" accept="image/jpeg,image/png,image/webp" disabled={brandUploadBusy} onChange={(event) => { void uploadBrandAssets(event.target.files, 'endFrame'); event.currentTarget.value = ''; }} className="hidden" />
                <button type="button" onClick={() => endFrameInputRef.current?.click()} disabled={brandUploadBusy || !videoModels.find((model) => model.slug === videoModel)?.supportsLastFrame} className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-[11px] font-semibold text-indigo-200 disabled:opacity-40">{endFrame ? 'Replace ending frame' : 'Upload ending frame'}</button>
                {endFrame && <button type="button" onClick={() => setEndFrame(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-[11px] text-slate-300">Remove</button>}
              </div>
              {!videoModels.find((model) => model.slug === videoModel)?.supportsLastFrame && <p className="text-[10px] text-slate-500">Choose a model marked “start/end frame” to enable this option.</p>}
            </div>
          )}
          {brandUploadMessage && <p className="text-[10px] text-emerald-300">{brandUploadMessage}</p>}
          {brandUploadError && <p role="alert" className="text-[10px] text-rose-300">{brandUploadError}</p>}
        </fieldset>
        {continuing && (
          <fieldset className="space-y-3 rounded-xl border border-indigo-500/25 bg-slate-950/60 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-200">Video engine for this part</legend>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-slate-400">Choose the rendering provider</span>
              <select value={videoProvider} onChange={(event) => setVideoProvider(event.target.value as 'fal' | 'deapi' | 'auto')} className={selectCls}>
                {falEnabled && <option value="fal">FAL · Kling / FAL video models</option>}
                {deapiEnabled && <option value="deapi">DeAPI · choose model</option>}
                {falEnabled && deapiEnabled && <option value="auto">Automatic · FAL first, DeAPI backup</option>}
              </select>
              <p className="text-[10px] text-slate-500">Saved to this new part. Provider choices are strict unless Automatic is selected.</p>
            </label>
            {(videoProvider === 'deapi' || videoProvider === 'auto') && deapiEnabled && (
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-slate-400">DeAPI video model</span>
                <select value={videoModel} onChange={(event) => setVideoModel(event.target.value)} disabled={videoModelsLoading || videoModels.length === 0} className={selectCls}>
                  {videoModels.map((model) => <option key={model.slug} value={model.slug}>{model.name}{model.supportsImageToVideo ? ' · image-to-video' : ''}</option>)}
                </select>
                {videoModelsError && <p role="alert" className="text-[10px] text-rose-300">{videoModelsError}</p>}
              </label>
            )}
            {!falEnabled && !deapiEnabled && <p role="alert" className="text-[11px] text-rose-300">No video engine is connected. Add FAL_KEY or DEAPI_API_KEY in Vercel before rendering another part.</p>}
          </fieldset>
        )}
        {!falEnabled && !deapiEnabled && !continuing && <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">No video engine is connected. Add FAL_KEY or DEAPI_API_KEY in Vercel before generating a video.</p>}
        {errorBox}
        <button type="button" onClick={submit} disabled={busy || (!falEnabled && !deapiEnabled)} className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clapperboard className="w-4 h-4" />}{continuing ? `Write and make Part ${partNumber}` : kind === 'series' ? (deliver === 'all' ? `Make all ${parts} parts` : 'Write and make Part 1') : 'Write and make the video'}
        </button>
        <p className="text-[11px] text-slate-500 text-center">It starts right away and keeps working on our servers. You do not have to wait on this page.</p>
      </div>
    );
  }

  // ------------------------------------------------------------------ list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">Series projects</h2>
          <p className="text-xs text-slate-400">Make a story in parts, from your own script or written by the AI. Every new part remembers the last one.</p>
        </div>
        <button type="button" onClick={startNewSeries} className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" />New</button>
      </div>
      {errorBox}
      {projects === null && <p className="text-xs text-slate-400 flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading your series...</p>}
      {projects && projects.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center space-y-2">
          <Clapperboard className="w-7 h-7 text-indigo-400 mx-auto" />
          <p className="text-sm text-slate-200 font-semibold">Nothing here yet</p>
          <p className="text-xs text-slate-400">Start Part 1 of your first series, or make a single video. You can come back and add more parts any time.</p>
        </div>
      )}
      <ul className="space-y-3">
        {(projects || []).map((p) => {
          const active = p.episodes.find((e) => isOpen(e.status));
          const failed = !active ? p.episodes.find((e) => e.status === 'FAILED') : undefined;
          const done = p.episodes.filter((e) => e.status === 'COMPLETED').length;
          return (
            <li key={p.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{p.title}</h3>
                  <p className="text-[11px] text-slate-400">{p.genre} · {done} {done === 1 ? 'part' : 'parts'} finished</p>
                </div>
                {active && <span className="shrink-0 px-2 py-1 rounded-full text-[10px] font-bold bg-indigo-950 border border-indigo-700 text-indigo-200 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Part {active.partNumber} {active.status === 'PROCESSING' ? 'writing' : 'rendering'}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.episodes.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => openEpisode(e.id)}
                    aria-label={`Open Part ${e.partNumber}${e.title ? `: ${e.title}` : ''} — ${e.status.toLowerCase()}`}
                    className={`px-2 py-1 rounded-full text-[10px] border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 ${e.status === 'COMPLETED' ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300 hover:bg-emerald-900/70 cursor-pointer' : e.status === 'FAILED' ? 'bg-red-950/50 border-red-900 text-red-300 hover:bg-red-900/50 cursor-pointer' : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500 cursor-pointer'}`}
                  >
                    {e.status === 'COMPLETED' && <Check className="w-2.5 h-2.5 inline mr-0.5" />}Part {e.partNumber}{e.title ? `: ${e.title}` : ''}
                  </button>
                ))}
              </div>
              {active ? (
                <button type="button" onClick={() => openActive(p)} className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-2"><Play className="w-3.5 h-3.5" />See progress</button>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  {failed && <button type="button" onClick={() => openEpisode(failed.id)} className="flex-1 py-2.5 rounded-lg bg-red-950/60 border border-red-900 hover:bg-red-950 text-xs font-semibold text-red-200 flex items-center justify-center gap-2"><RotateCcw className="w-3.5 h-3.5" />Part {failed.partNumber} stopped: open and retry</button>}
                  <button type="button" onClick={() => continueSeries(p)} disabled={busy} className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center justify-center gap-2">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}Generate Next Part / Continue Script
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
