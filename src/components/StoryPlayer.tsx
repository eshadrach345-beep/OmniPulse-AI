import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX, Download, Loader2, AlertTriangle } from 'lucide-react';
import { GeneratedVideo, SceneLine } from '../types';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** How long a line takes to say, so captions follow the speech. */
const lineMs = (text: string) => Math.max(900, (text.trim().split(/\s+/).length / 2.3 + 0.5) * 1000);
const saveBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
};

/**
 * Plays a multi-character production. The video engine makes the pictures and the voices together, so the sound always matches.
 * Two video elements take turns: while one plays, the other already loads the next scene, so scene changes do not stall.
 */
export const StoryPlayer: React.FC<{ video: GeneratedVideo }> = ({ video }) => {
  const scenes = video.scenes;
  const characters = video.characters || [];
  const [idx, setIdx] = useState(0);
  const [front, setFront] = useState<0 | 1>(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState<SceneLine | null>(null);
  const [join, setJoin] = useState<{ state: 'idle' | 'working' | 'error'; msg: string }>({ state: 'idle', msg: '' });
  const run = useRef(0);
  const mutedRef = useRef(false);
  const refs = [useRef<HTMLVideoElement | null>(null), useRef<HTMLVideoElement | null>(null)];

  const load = (el: HTMLVideoElement | null, url?: string) => {
    if (!el || !url) return;
    if (el.dataset.src !== url) { el.dataset.src = url; el.src = url; el.preload = 'auto'; el.load(); }
  };

  useEffect(() => {
    run.current++;
    setIdx(0); setFront(0); setPlaying(false); setCaption(null);
    load(refs[0].current, scenes[0]?.clipUrl);
    load(refs[1].current, scenes[1]?.clipUrl);
    return () => { run.current++; refs.forEach((r) => r.current?.pause()); };
  }, [video.id]);

  useEffect(() => { mutedRef.current = muted; refs.forEach((r, i) => { if (r.current && i === front) r.current.muted = muted; }); }, [muted, front]);

  const stop = () => {
    run.current++;
    refs.forEach((r) => r.current?.pause());
    setPlaying(false);
    setCaption(null);
  };

  const playFrom = async (start: number) => {
    const myRun = ++run.current;
    setPlaying(true);
    // Warm up the other video element inside the tap, so the browser lets it play by itself later.
    const warm = refs[(start + 1) % 2].current;
    if (warm) { warm.muted = true; warm.play().then(() => warm.pause()).catch(() => undefined); }
    for (let i = start; i < scenes.length; i++) {
      if (run.current !== myRun) return;
      const sc = scenes[i];
      const el = refs[i % 2].current, other = refs[(i + 1) % 2].current;
      if (!el || !sc.clipUrl) continue;
      setIdx(i); setFront((i % 2) as 0 | 1);
      load(el, sc.clipUrl);
      other?.pause();
      el.muted = mutedRef.current;
      try { el.currentTime = 0; } catch { /* not ready yet */ }
      const ended = new Promise<void>((res) => { el.onended = () => res(); setTimeout(res, (sc.duration + 3) * 1000); });
      try { await el.play(); } catch { setPlaying(false); return; }
      load(other, scenes[i + 1]?.clipUrl); // start loading the next scene right away
      const captions = (async () => {
        for (const line of sc.lines || []) { if (run.current !== myRun) return; setCaption(line); await wait(lineMs(line.text)); }
        setCaption(null);
      })();
      await Promise.all([ended, captions]);
    }
    if (run.current === myRun) { setPlaying(false); setCaption(null); }
  };

  const jump = (i: number) => {
    const was = playing;
    stop();
    setIdx(i); setFront((i % 2) as 0 | 1);
    load(refs[i % 2].current, scenes[i]?.clipUrl);
    if (was) playFrom(i);
  };

  const ids = scenes.map((s) => s.clipJobId).filter(Boolean) as string[];
  const fileName = (video.title || 'omnipulse-video').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'omnipulse-video';
  const downloadAll = async () => {
    setJoin({ state: 'working', msg: 'Joining your scenes into one video. This can take up to a minute.' });
    try {
      const r = await fetch(`/api/video/merge?ids=${encodeURIComponent(ids.join(','))}&name=${encodeURIComponent(fileName)}`, { credentials: 'same-origin' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({} as { error?: string }));
        throw new Error(d.error || `The scenes could not be joined (error ${r.status}). You can still download each scene below.`);
      }
      saveBlob(await r.blob(), `${fileName}.mp4`);
      setJoin({ state: 'idle', msg: '' });
    } catch (e) { setJoin({ state: 'error', msg: e instanceof Error ? e.message : 'The scenes could not be joined.' }); }
  };

  const ratio = video.aspectRatio === '16:9' ? '16 / 9' : video.aspectRatio === '1:1' ? '1 / 1' : '9 / 16';
  const maxW = video.aspectRatio === '9:16' ? 300 : 560;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-white">{video.title}</h2>
          <p className="text-xs text-slate-400">{video.format ? video.format[0].toUpperCase() + video.format.slice(1) : 'Production'} · {scenes.length} scenes · {video.estimatedDuration} seconds · {characters.length} characters</p>
        </div>
        <button onClick={() => setMuted((m) => !m)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200" aria-pressed={muted}>
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}{muted ? 'Sound off' : 'Sound on'}
        </button>
      </div>

      <div className="relative mx-auto bg-black rounded-xl overflow-hidden border border-slate-800" style={{ aspectRatio: ratio, width: '100%', maxWidth: maxW, maxHeight: 520 }}>
        {[0, 1].map((n) => (
          <video key={n} ref={refs[n]} playsInline preload="auto" className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-150 ${front === n ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
        ))}
        {caption && (
          <div className="absolute inset-x-0 bottom-0 p-3 bg-linear-to-t from-black/85 to-transparent text-center pointer-events-none">
            <p className="text-[11px] font-bold text-indigo-300">{caption.speaker}</p>
            <p className="text-sm text-white leading-snug">{caption.text}</p>
          </div>
        )}
        {!playing && (
          <button onClick={() => playFrom(idx)} aria-label="Play" className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg"><Play className="w-6 h-6 text-white ml-0.5" /></span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <button onClick={() => jump(Math.max(0, idx - 1))} disabled={idx === 0} aria-label="Previous scene" className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={() => (playing ? stop() : playFrom(idx))} className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2">
          {playing ? <><Pause className="w-4 h-4" />Pause</> : <><Play className="w-4 h-4" />Play from scene {idx + 1}</>}
        </button>
        <button onClick={() => jump(Math.min(scenes.length - 1, idx + 1))} disabled={idx >= scenes.length - 1} aria-label="Next scene" className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
        <button onClick={downloadAll} disabled={join.state === 'working' || !ids.length} className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-2">
          {join.state === 'working' ? <><Loader2 className="w-4 h-4 animate-spin" />Joining scenes...</> : <><Download className="w-4 h-4" />Download full video (one MP4)</>}
        </button>
        {join.msg && (
          <p role={join.state === 'error' ? 'alert' : 'status'} className={`text-[11px] flex items-start gap-1.5 ${join.state === 'error' ? 'text-rose-300' : 'text-slate-400'}`}>
            {join.state === 'error' && <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}{join.msg}
          </p>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-300 mb-2">Cast</p>
        <div className="flex flex-wrap gap-2">
          {characters.map((c) => (
            <span key={c.id} className="text-[11px] rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-slate-300"><span className="font-semibold text-white">{c.name}</span> · {c.role || 'character'}</span>
          ))}
        </div>
      </div>

      <ol className="space-y-2">
        {scenes.map((s, i) => (
          <li key={s.id} className={`rounded-lg border p-3 ${i === idx ? 'border-indigo-500 bg-indigo-950/30' : 'border-slate-800 bg-slate-950'}`}>
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => jump(i)} className="text-[11px] font-semibold text-indigo-300 text-left">Scene {i + 1}{s.beat ? ` · ${s.beat}` : ''} · {s.duration}s</button>
              {(s.clipJobId || s.clipUrl) && (
                <a href={s.clipJobId ? `/api/video/download?id=${encodeURIComponent(s.clipJobId)}&name=${encodeURIComponent(`${fileName} scene ${i + 1}`)}` : s.clipUrl} download target={s.clipJobId ? undefined : '_blank'} rel="noopener noreferrer"
                  className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1" aria-label={`Download scene ${i + 1}`}><Download className="w-3 h-3" />Download</a>
              )}
            </div>
            {s.cameraMotion && <p className="text-[11px] text-slate-500 mt-1">Camera: {s.cameraMotion}</p>}
            {(s.lines || []).map((l, k) => <p key={k} className="text-xs text-slate-300 mt-1"><span className="font-semibold text-white">{l.speaker}:</span> {l.text}</p>)}
          </li>
        ))}
      </ol>
    </div>
  );
};
