import React, { useEffect, useMemo, useState } from 'react';
import { GeneratedVideo, VideoScene } from '../types';
import { api } from '../services/api';
import { ArrowDown, ArrowUp, Clapperboard, Copy, Film, Layers3, Scissors, Undo2, Redo2, Plus, Trash2, Sparkles, Wand2, Loader2, Check } from 'lucide-react';

interface DirectorEdit { scene: number; reason: string; visualDirection: string; overlayText: string; soundEffect: string; transition: string }
interface DirectorPlan { summary: string; edits: DirectorEdit[] }
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
  const [directorError, setDirectorError] = useState('');

  useEffect(() => { setScenes(video.scenes || []); setSelected(0); setUndoStack([]); setRedoStack([]); }, [video.id]);
  const totalSeconds = useMemo(() => scenes.reduce((sum, scene) => sum + Math.max(0, Number(scene.duration) || 0), 0), [scenes]);
  const current = scenes[selected];

  const commit = (next: VideoScene[]) => {
    // Keep scene numbering aligned with the actual edited join order after every operation.
    const ordered = next.map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));
    setUndoStack((stack) => [...stack.slice(-19), scenes]);
    setRedoStack([]);
    setScenes(ordered);
    onSave({ ...video, scenes: ordered, estimatedDuration: Math.round(ordered.reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0)) });
    setSaved(true);
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
    <section className="rounded-2xl border border-indigo-500/25 bg-slate-950/90 p-4 sm:p-5 space-y-4">
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
          {current?.clipUrl && <div className="overflow-hidden rounded-lg border border-slate-700 bg-black"><video src={current.clipUrl} controls playsInline preload="metadata" className="max-h-56 w-full object-contain" aria-label="Selected scene preview" /></div>}
          {current && <>
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
          </>}
          <p className="text-[10px] leading-relaxed text-slate-500">Reordering and removing clips changes the scene sequence used by the film joiner. Text overlays and subtitle edits are saved and previewed in the studio; they do not alter the original generated audio or burn into the exported MP4 yet.</p>
        </div>
      </div>
      {saved && <p className="text-[10px] text-emerald-400" role="status">Edits saved to your video library.</p>}
    </section>
  );
};
