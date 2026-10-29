import React, { useEffect, useRef, useState } from 'react';
import { Download, Image as ImageIcon } from 'lucide-react';
import type { GenreId } from '../types';

// A movie poster for a finished story, drawn in the browser from the title, tagline, cast and genre.
// No image service is involved, so it is instant, free and works offline. The PNG can be shared on any network.

interface Palette { top: string; bottom: string; glow: string; accent: string }
const PALETTES: Record<GenreId, Palette> = {
  auto: { top: '#1e1b4b', bottom: '#020617', glow: '#a855f7', accent: '#f0abfc' },
  action: { top: '#431407', bottom: '#0c0a09', glow: '#f97316', accent: '#fdba74' },
  thriller: { top: '#0f172a', bottom: '#020617', glow: '#38bdf8', accent: '#bae6fd' },
  scifi: { top: '#082f49', bottom: '#020617', glow: '#22d3ee', accent: '#a5f3fc' },
  fantasy: { top: '#3b0764', bottom: '#0f0a1f', glow: '#facc15', accent: '#fde68a' },
  horror: { top: '#2a0a0a', bottom: '#000000', glow: '#dc2626', accent: '#fca5a5' },
  romance: { top: '#4c0519', bottom: '#1c0a14', glow: '#fb7185', accent: '#fecdd3' },
  comedy: { top: '#713f12', bottom: '#1c1917', glow: '#fbbf24', accent: '#fef08a' },
  noir: { top: '#27272a', bottom: '#000000', glow: '#d4d4d8', accent: '#f4f4f5' },
  western: { top: '#7c2d12', bottom: '#1c0f08', glow: '#fb923c', accent: '#fed7aa' },
  superhero: { top: '#1e3a8a', bottom: '#0b0f2a', glow: '#ef4444', accent: '#fecaca' },
  mystery: { top: '#134e4a', bottom: '#020617', glow: '#2dd4bf', accent: '#99f6e4' },
  adventure: { top: '#14532d', bottom: '#052e16', glow: '#a3e635', accent: '#d9f99d' },
  heist: { top: '#1c1917', bottom: '#000000', glow: '#fbbf24', accent: '#fde68a' },
  disaster: { top: '#450a0a', bottom: '#0c0a09', glow: '#f59e0b', accent: '#fde68a' },
  wildlife: { top: '#422006', bottom: '#0a0a05', glow: '#f59e0b', accent: '#fcd34d' },
  mythical: { top: '#312e81', bottom: '#0b0720', glow: '#8b5cf6', accent: '#ddd6fe' },
  monster: { top: '#052e16', bottom: '#010a05', glow: '#22c55e', accent: '#bbf7d0' },
};

const W = 800, H = 1200;

/** Breaks text into lines that fit a width, at most maxLines (the last line gets an ellipsis if it is cut). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[\s,.;:!?-]+$/, '') + '…';
    return kept;
  }
  return lines;
}

/** Small deterministic random so a poster looks the same every time it is drawn. */
function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hash = (t: string) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function drawPoster(canvas: HTMLCanvasElement, o: { title: string; tagline: string; cast: string[]; genre: GenreId; partLabel?: string; genreLabel?: string }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = W; canvas.height = H;
  const p = PALETTES[o.genre] || PALETTES.auto;
  const rand = rng(hash(o.title + o.genre));

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, p.top); bg.addColorStop(0.6, p.bottom); bg.addColorStop(1, '#000');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // glow behind the title area
  const glow = ctx.createRadialGradient(W / 2, H * 0.42, 20, W / 2, H * 0.42, W * 0.75);
  glow.addColorStop(0, p.glow + 'aa'); glow.addColorStop(0.5, p.glow + '33'); glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // light beams
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const x = rand() * W, wdt = 40 + rand() * 120;
    const g = ctx.createLinearGradient(x, 0, x + 200, H);
    g.addColorStop(0, p.glow + '30'); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x + wdt, 0); ctx.lineTo(x + wdt + 320, H); ctx.lineTo(x + 320, H); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // film grain
  for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(255,255,255,${(rand() * 0.07).toFixed(3)})`; ctx.fillRect(rand() * W, rand() * H, 2, 2); }

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.8);
  vg.addColorStop(0, 'transparent'); vg.addColorStop(1, 'rgba(0,0,0,0.65)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';

  // top line
  ctx.fillStyle = p.accent; ctx.font = '600 26px system-ui, Arial, sans-serif';
  const top = [o.genreLabel && o.genre !== 'auto' ? o.genreLabel.toUpperCase() : 'A STORY', o.partLabel ? o.partLabel.toUpperCase() : ''].filter(Boolean).join('   •   ');
  ctx.fillText(top, W / 2, 96);
  ctx.fillRect(W / 2 - 60, 118, 120, 3);

  // title: shrink the type until the whole title fits the title area (nothing is cut unless it is extremely long)
  const title = (o.title || 'Untitled').toUpperCase();
  const MAX_BLOCK = 600;
  let size = 150, lines: string[] = [];
  for (; size >= 44; size -= 4) {
    ctx.font = `900 ${size}px Impact, 'Arial Black', system-ui, sans-serif`;
    lines = wrap(ctx, title, W - 120, 99);
    if (lines.length * size * 1.02 <= MAX_BLOCK && lines.every((l) => ctx.measureText(l).width <= W - 100)) break;
  }
  if (size < 44) { size = 44; ctx.font = `900 ${size}px Impact, 'Arial Black', system-ui, sans-serif`; lines = wrap(ctx, title, W - 120, Math.floor(MAX_BLOCK / (size * 1.02)));
    // a single huge word: shrink until it fits the width
    while (size > 20 && lines.some((l) => ctx.measureText(l).width > W - 100)) { size -= 2; ctx.font = `900 ${size}px Impact, 'Arial Black', system-ui, sans-serif`; }
  }
  const lh = size * 1.02, blockH = lines.length * lh;
  let y = 480 - blockH / 2 + size * 0.8;
  ctx.shadowColor = p.glow; ctx.shadowBlur = 40; ctx.fillStyle = '#fff';
  for (const l of lines) { ctx.fillText(l, W / 2, y); y += lh; }
  ctx.shadowBlur = 0;

  // tagline
  ctx.fillStyle = p.accent; ctx.font = 'italic 400 30px Georgia, serif';
  const tag = wrap(ctx, o.tagline || '', W - 200, 3);
  let ty = y + 40;
  for (const l of tag) { ctx.fillText(l, W / 2, ty); ty += 42; }

  // credits
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '600 24px system-ui, Arial, sans-serif';
  if (o.cast.length) {
    const starring = 'STARRING  ' + o.cast.slice(0, 3).join('  •  ').toUpperCase();
    wrap(ctx, starring, W - 120, 2).forEach((l, i) => ctx.fillText(l, W / 2, H - 150 + i * 32));
  }
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '500 20px system-ui, Arial, sans-serif';
  ctx.fillText('MADE WITH OMNIPULSE AI', W / 2, H - 56);

  // frame
  ctx.strokeStyle = p.accent + '55'; ctx.lineWidth = 3; ctx.strokeRect(24, 24, W - 48, H - 48);
}

interface Props { title: string; tagline: string; cast: string[]; genre?: GenreId; genreLabel?: string; partLabel?: string }

export const MoviePoster: React.FC<Props> = ({ title, tagline, cast, genre = 'auto', genreLabel, partLabel }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');
  const castKey = cast.join('|');

  useEffect(() => {
    if (!ref.current) return;
    try { drawPoster(ref.current, { title, tagline, cast, genre, genreLabel, partLabel }); setError(''); }
    catch { setError('The poster could not be drawn in this browser.'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, tagline, castKey, genre, genreLabel, partLabel]);

  const download = () => {
    ref.current?.toBlob((blob) => {
      if (!blob) { setError('The poster could not be saved. Try again.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${(title || 'poster').replace(/[^\w-]+/g, '-').slice(0, 60)}-poster.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-3">
      <p className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5 text-indigo-400" />Movie poster</p>
      <canvas ref={ref} role="img" aria-label={`Poster for ${title}`} className="w-full max-w-xs mx-auto rounded-lg border border-slate-800 shadow-xl shadow-black/50" style={{ aspectRatio: `${W} / ${H}` }} />
      {error && <p role="alert" className="text-[11px] text-red-300">{error}</p>}
      <button type="button" onClick={download} className="w-full sm:w-auto px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5"><Download className="w-3.5 h-3.5" />Download poster (PNG)</button>
    </div>
  );
};
