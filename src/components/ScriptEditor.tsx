import React, { useState } from 'react';
import { Loader2, Plus, Trash2, Play, Save, Info } from 'lucide-react';
import type { EditableLine, EditableScene } from '../services/seriesService';

// Lets the person read and change the script before any video is made: what the camera shows, what each person says, how it is said,
// and the sounds. Actions belong in "What happens", never in the spoken lines.

const MAX_WORDS_PER_CLIP = 19; // keep in step with server/lib/prompts.ts
const inputCls = 'w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600';
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

interface Props {
  title: string;
  characters: string[];
  scenes: EditableScene[];
  /** True when pressing the main button should start making the video (the script was waiting for review). */
  canStart: boolean;
  busy: boolean;
  onSave: (title: string, scenes: EditableScene[], start: boolean) => void;
}

export const ScriptEditor: React.FC<Props> = ({ title, characters, scenes, canStart, busy, onSave }) => {
  const [name, setName] = useState(title);
  const [draft, setDraft] = useState<EditableScene[]>(() => scenes.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l })) })));

  const patchScene = (i: number, patch: Partial<EditableScene>) => setDraft((d) => d.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const patchLine = (i: number, j: number, patch: Partial<EditableLine>) => setDraft((d) => d.map((s, k) => (k === i ? { ...s, lines: s.lines.map((l, m) => (m === j ? { ...l, ...patch } : l)) } : s)));
  const addLine = (i: number) => setDraft((d) => d.map((s, k) => (k === i && s.lines.length < 6 ? { ...s, lines: [...s.lines, { speaker: characters[0] || 'Narrator', text: '', emotion: '', doing: '', half: 1 }] } : s)));
  const removeLine = (i: number, j: number) => setDraft((d) => d.map((s, k) => (k === i ? { ...s, lines: s.lines.filter((_, m) => m !== j) } : s)));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-[11px] text-indigo-200 bg-indigo-950/40 border border-indigo-800/60 rounded-lg px-3 py-2">
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>Write what <b>happens</b> in the first box of each scene: the camera shows it and the actors perform it. Only put words in <b>Spoken lines</b> that a person would really say out loud. Nobody reads an action aloud.</span>
      </div>

      <div>
        <label htmlFor="se-title" className="text-xs font-semibold text-slate-300 mb-1.5 block">Title</label>
        <input id="se-title" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputCls} />
      </div>

      {draft.map((sc, i) => {
        const total = sc.lines.reduce((n, l) => n + words(l.text), 0), cap = MAX_WORDS_PER_CLIP * sc.halves;
        return (
          <fieldset key={sc.number} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-3">
            <legend className="px-1 text-xs font-bold text-indigo-300">Scene {sc.number} <span className="text-slate-500 font-normal">({sc.halves * 10} seconds)</span></legend>
            <div>
              <label htmlFor={`se-v-${i}`} className="text-[11px] font-semibold text-slate-300 mb-1 block">What happens (the camera shows this)</label>
              <textarea id={`se-v-${i}`} rows={4} maxLength={900} value={sc.visual} onChange={(e) => patchScene(i, { visual: e.target.value })} className={inputCls} />
            </div>
            {sc.halves === 2 && (
              <div>
                <label htmlFor={`se-s-${i}`} className="text-[11px] font-semibold text-slate-300 mb-1 block">Then, in the second half</label>
                <textarea id={`se-s-${i}`} rows={2} maxLength={300} value={sc.second} onChange={(e) => patchScene(i, { second: e.target.value })} className={inputCls} />
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`se-c-${i}`} className="text-[11px] font-semibold text-slate-300 mb-1 block">Camera</label>
                <input id={`se-c-${i}`} maxLength={200} value={sc.camera} onChange={(e) => patchScene(i, { camera: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor={`se-n-${i}`} className="text-[11px] font-semibold text-slate-300 mb-1 block">Sounds you hear</label>
                <input id={`se-n-${i}`} maxLength={160} value={sc.sound} onChange={(e) => patchScene(i, { sound: e.target.value })} placeholder="footsteps, a distant roar, rain" className={inputCls} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-300">Spoken lines</p>
              {sc.lines.length === 0 && <p className="text-[11px] text-slate-500">No one speaks in this scene. The action and the sounds carry it.</p>}
              {sc.lines.map((l, j) => (
                <div key={j} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 space-y-2">
                  <div className="flex gap-2">
                    <select aria-label={`Scene ${sc.number} line ${j + 1} speaker`} value={l.speaker} onChange={(e) => patchLine(i, j, { speaker: e.target.value })} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-xs text-slate-100 max-w-[40%]">
                      {Array.from(new Set([...characters, l.speaker])).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input aria-label={`Scene ${sc.number} line ${j + 1} words`} value={l.text} maxLength={260} onChange={(e) => patchLine(i, j, { text: e.target.value })} placeholder="What they say" className={`${inputCls} flex-1`} />
                    <button type="button" onClick={() => removeLine(i, j)} aria-label={`Remove line ${j + 1} of scene ${sc.number}`} className="shrink-0 px-2 rounded-lg border border-slate-700 text-slate-400 hover:text-red-300 hover:border-red-800"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <input aria-label={`Scene ${sc.number} line ${j + 1} how it is said`} value={l.emotion} maxLength={30} onChange={(e) => patchLine(i, j, { emotion: e.target.value })} placeholder="How it is said (whispering)" className={inputCls} />
                    <input aria-label={`Scene ${sc.number} line ${j + 1} what they do while speaking`} value={l.doing} maxLength={70} onChange={(e) => patchLine(i, j, { doing: e.target.value })} placeholder="What they do (backing away)" className={inputCls} />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => addLine(i)} disabled={sc.lines.length >= 6} className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-indigo-500 disabled:opacity-40 flex items-center gap-1"><Plus className="w-3 h-3" />Add a line</button>
                <span className={`text-[11px] ${total > cap ? 'text-amber-300' : 'text-slate-500'}`}>{total} of {cap} words{total > cap ? ': the extra words will be cut so nobody is cut off mid-sentence' : ''}</span>
              </div>
            </div>
          </fieldset>
        );
      })}

      <div className="flex flex-wrap gap-2 sticky bottom-2">
        <button type="button" disabled={busy} onClick={() => onSave(name, draft, false)} className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-white flex items-center gap-1.5">{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Save changes</button>
        {canStart && <button type="button" disabled={busy} onClick={() => onSave(name, draft, true)} className="px-4 py-2.5 rounded-lg bg-linear-to-r from-indigo-600 to-fuchsia-600 hover:opacity-90 disabled:opacity-50 text-xs font-bold text-white flex items-center gap-1.5"><Play className="w-3.5 h-3.5" />Approve and make the video</button>}
      </div>
    </div>
  );
};
