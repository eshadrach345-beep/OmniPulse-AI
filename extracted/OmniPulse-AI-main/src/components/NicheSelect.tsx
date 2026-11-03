import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, Check, Plus } from 'lucide-react';
import { NicheCategory } from '../types';
import { customNiche } from '../data/niches';

interface Props {
  niches: NicheCategory[];
  activeNiche: NicheCategory;
  onSelect: (niche: NicheCategory) => void;
  disabled?: boolean;
}

/** Scrollable, searchable niche dropdown grouped by category. If nothing matches, the user can use what they typed as their own niche. */
export const NicheSelect: React.FC<Props> = ({ niches, activeNiche, onSelect, disabled }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); };
  }, [open]);

  const term = q.trim().toLowerCase();
  const grouped = useMemo(() => {
    const hits = term ? niches.filter((n) => `${n.name} ${n.group || ''}`.toLowerCase().includes(term)) : niches;
    const map = new Map<string, NicheCategory[]>();
    hits.forEach((n) => { const g = n.group || 'Other'; map.set(g, [...(map.get(g) || []), n]); });
    return [...map.entries()];
  }, [niches, term]);
  const exact = term && niches.some((n) => n.name.toLowerCase() === term);

  const pick = (n: NicheCategory) => { onSelect(n); setOpen(false); setQ(''); };

  return (
    <div ref={box} className="relative w-full">
      <button
        type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 bg-slate-950 border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-2.5 text-xs text-left text-slate-100 disabled:opacity-50"
      >
        <span className="truncate"><span className="text-slate-400">Niche: </span><span className="font-semibold">{activeNiche.name}</span></span>
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
          <div className="relative border-b border-slate-800">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (grouped[0]?.[1][0] && term) pick(grouped[0][1][0]); else if (term) pick(customNiche(q)); } if (e.key === 'Escape') setOpen(false); }}
              placeholder={`Search ${niches.length}+ niches or type your own…`}
              className="w-full bg-transparent pl-9 pr-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden"
            />
          </div>
          <div role="listbox" className="max-h-72 overflow-y-auto overscroll-contain">
            {term && !exact && q.trim().length >= 2 && (
              <button type="button" onClick={() => pick(customNiche(q))} className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left text-indigo-300 hover:bg-slate-800 border-b border-slate-800">
                <Plus className="w-3.5 h-3.5" /> Use “{q.trim()}” as my niche
              </button>
            )}
            {grouped.length === 0 && !term && <p className="px-3 py-4 text-xs text-slate-500">No niches available.</p>}
            {grouped.map(([group, items]) => (
              <div key={group}>
                <div className="sticky top-0 bg-slate-900/95 backdrop-blur px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{group}</div>
                {items.map((n) => {
                  const on = n.id === activeNiche.id;
                  return (
                    <button key={n.id} type="button" role="option" aria-selected={on} onClick={() => pick(n)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left hover:bg-slate-800 ${on ? 'text-white bg-indigo-950/60' : 'text-slate-300'}`}>
                      <span className="truncate">{n.name}</span>
                      {on && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
