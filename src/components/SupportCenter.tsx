import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { MessageSquare, Plus, Send, RefreshCw } from 'lucide-react';

type Thread = { id: string; subject: string; status: string; last_message?: string; updated_at: string };
type Message = { id: string; sender_role: 'user' | 'owner'; body: string; created_at: string };

export const SupportCenter: React.FC = () => {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [subject, setSubject] = useState('');
  const [draft, setDraft] = useState('');
  const [newThread, setNewThread] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => { try { const r = await api.get<{ threads: Thread[] }>('/support/threads'); setThreads(r.threads || []); } catch (e) { setError(e instanceof Error ? e.message : 'Support could not be loaded.'); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const open = async (thread: Thread) => { setSelected(thread); setNewThread(false); setError(''); try { const r = await api.get<{ messages: Message[] }>(`/support/messages?threadId=${encodeURIComponent(thread.id)}`); setMessages(r.messages || []); } catch (e) { setError(e instanceof Error ? e.message : 'Conversation could not be loaded.'); } };
  const send = async (e: React.FormEvent) => { e.preventDefault(); if (!draft.trim()) return; setBusy(true); setError(''); try { const r = await api.post<{ threadId?: string }>('/support/messages', { threadId: selected?.id, subject: subject.trim() || 'Support request', message: draft.trim() }); setDraft(''); setSubject(''); await refresh(); if (r.threadId) { const thread = { id: r.threadId, subject: subject.trim() || 'Support request', status: 'open', updated_at: new Date().toISOString() }; await open(thread); } else if (selected) await open(selected); setNewThread(false); } catch (e) { setError(e instanceof Error ? e.message : 'Message could not be sent.'); } finally { setBusy(false); } };
  return <section className="space-y-5" aria-labelledby="support-heading">
    <div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[.2em] text-indigo-300 font-semibold">We're here to help</p><h1 id="support-heading" className="text-2xl font-bold text-white mt-1">Support Center</h1><p className="text-sm text-slate-400 mt-1">Send a private message to the OmniPulse team.</p></div><button onClick={() => void refresh()} className="rounded-xl border border-slate-700 p-2 text-slate-300" aria-label="Refresh support"><RefreshCw className="w-4 h-4"/></button></div>
    {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
    <div className="grid md:grid-cols-[minmax(210px,.7fr)_minmax(0,1.5fr)] rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden min-h-[480px]">
      <aside className="border-b md:border-b-0 md:border-r border-slate-800"><div className="p-3 border-b border-slate-800"><button onClick={() => { setSelected(null); setMessages([]); setNewThread(true); setError(''); }} className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"><Plus className="w-4 h-4"/> New message</button></div>{threads.map((t) => <button key={t.id} onClick={() => void open(t)} className={`w-full text-left p-4 border-b border-slate-800/70 hover:bg-slate-800/60 ${selected?.id === t.id ? 'bg-indigo-500/10' : ''}`}><p className="text-sm font-medium text-white truncate">{t.subject}</p><p className="text-xs text-slate-500 mt-1">{t.status}</p><p className="text-xs text-slate-400 mt-1 truncate">{t.last_message || 'Open conversation'}</p></button>)}</aside>
      <div className="flex flex-col min-h-[420px]">{!selected && !newThread ? <div className="flex-1 grid place-items-center p-6 text-center text-sm text-slate-500"><div><MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-50"/>Choose a conversation or start a new message.</div></div> : <>
        <div className="p-4 border-b border-slate-800"><p className="font-semibold text-white">{selected?.subject || 'New support request'}</p><p className="text-xs text-slate-400">Replies are visible only to you and the support team.</p></div>
        <div className="flex-1 max-h-[330px] overflow-y-auto p-4 space-y-3">{messages.map((m) => <div key={m.id} className={`max-w-[90%] rounded-xl p-3 text-sm ${m.sender_role === 'user' ? 'ml-auto bg-indigo-600/20 border border-indigo-500/20' : 'bg-slate-800'}`}><p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">{m.sender_role === 'user' ? 'You' : 'OmniPulse Support'}</p><p className="whitespace-pre-wrap break-words text-slate-100">{m.body}</p><p className="text-[10px] text-slate-500 mt-2">{new Date(m.created_at).toLocaleString()}</p></div>)}</div>
        <form onSubmit={send} className="p-3 border-t border-slate-800 space-y-2">{newThread && <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Subject (optional)" className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-indigo-500"/>}<div className="flex gap-2"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} rows={2} placeholder="How can we help?" className="min-w-0 flex-1 resize-y rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-indigo-500"/><button disabled={busy || !draft.trim()} className="self-end rounded-xl bg-indigo-600 px-3 py-2 text-white disabled:opacity-40" aria-label="Send message"><Send className="w-4 h-4"/></button></div></form>
      </>}</div>
    </div>
  </section>;
};
