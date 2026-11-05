import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { Activity, RefreshCw, Send, Users, CreditCard, MessageSquare, Clock3 } from 'lucide-react';

type Thread = { id: string; subject: string; status: string; user_id: string; user_name: string; user_email: string; last_message?: string; last_sender?: string; updated_at: string };
type Message = { id: string; sender_role: 'user' | 'owner'; body: string; created_at: string };
type Overview = { users: { total?: number; active_trials?: number; expired_trials?: number; paid_active?: number; free_or_inactive?: number; new_last_7_days?: number }; payments: { successful_count?: number; successful_total?: number | string; currency?: string }; support: { open_threads?: number } };

export const OwnerConsole: React.FC = () => {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selected, setSelected] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [stats, inbox] = await Promise.all([
        api.get<Overview>('/owner/overview'), api.get<{ threads: Thread[] }>('/owner/support'),
      ]);
      setOverview(stats); setThreads(inbox.threads || []);
      if (selected) {
        const latest = (inbox.threads || []).find((t) => t.id === selected.id);
        if (latest) setSelected(latest);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Owner data could not be loaded.'); }
    finally { setBusy(false); }
  }, [selected]);

  useEffect(() => { void refresh(); }, []);
  const openThread = async (thread: Thread) => {
    setSelected(thread); setError('');
    try { const result = await api.get<{ messages: Message[] }>(`/owner/support/messages?threadId=${encodeURIComponent(thread.id)}`); setMessages(result.messages || []); }
    catch (e) { setError(e instanceof Error ? e.message : 'Conversation could not be loaded.'); }
  };
  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selected || !reply.trim()) return;
    setBusy(true); setError('');
    try {
      await api.post('/owner/support/reply', { threadId: selected.id, message: reply.trim() });
      setReply(''); await openThread(selected); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Reply could not be sent.'); }
    finally { setBusy(false); }
  };
  const statCards = [
    { label: 'Total accounts', value: overview?.users.total, icon: Users },
    { label: 'Paid subscribers', value: overview?.users.paid_active, icon: CreditCard },
    { label: 'Active trials', value: overview?.users.active_trials, icon: Clock3 },
    { label: 'Open support', value: overview?.support.open_threads, icon: MessageSquare },
    { label: 'Free / inactive', value: overview?.users.free_or_inactive, icon: Users },
  ];

  return <section className="space-y-6" aria-labelledby="owner-console-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs uppercase tracking-[.2em] text-indigo-300 font-semibold">Private administration</p><h1 id="owner-console-heading" className="text-2xl font-bold text-white mt-1">Owner Console</h1><p className="text-sm text-slate-400 mt-1">Account health, payments and customer conversations.</p></div>
      <button onClick={() => void refresh()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Refresh</button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
    <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
      {statCards.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4"><div className="flex items-center justify-between text-slate-400"><span className="text-xs">{label}</span><Icon className="w-4 h-4" /></div><p className="text-2xl font-bold text-white mt-3">{value ?? '—'}</p></div>)}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"><p className="text-xs text-slate-400">Expired trials</p><p className="text-xl font-semibold mt-1">{overview?.users.expired_trials ?? '—'}</p></div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"><p className="text-xs text-slate-400">New accounts · 7 days</p><p className="text-xl font-semibold mt-1">{overview?.users.new_last_7_days ?? '—'}</p></div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4"><p className="text-xs text-slate-400">Successful payments</p><p className="text-xl font-semibold mt-1">{overview?.payments.successful_count ?? '—'}</p><p className="text-xs text-slate-500 mt-1">{overview?.payments.currency || ''} {overview?.payments.successful_total ?? ''} recorded</p></div>
    </div>
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="flex items-center gap-2 p-4 border-b border-slate-800"><MessageSquare className="w-4 h-4 text-indigo-300"/><h2 className="font-semibold">Private support inbox</h2><span className="ml-auto text-xs text-slate-500">{threads.length} conversations</span></div>
      <div className="grid md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.5fr)] min-h-[420px]">
        <div className="border-b md:border-b-0 md:border-r border-slate-800 max-h-[420px] overflow-y-auto">
          {threads.length === 0 ? <p className="p-5 text-sm text-slate-500">No support conversations yet.</p> : threads.map((thread) => <button key={thread.id} onClick={() => void openThread(thread)} className={`w-full text-left p-4 border-b border-slate-800/70 hover:bg-slate-800/60 ${selected?.id === thread.id ? 'bg-indigo-500/10' : ''}`}><div className="flex items-center justify-between gap-2"><span className="font-medium text-sm text-white truncate">{thread.user_name}</span><span className="text-[10px] uppercase text-indigo-300">{thread.status}</span></div><p className="text-xs text-slate-400 truncate mt-1">{thread.subject}</p><p className="text-xs text-slate-500 truncate mt-1">{thread.last_message || thread.user_email}</p></button>)}
        </div>
        <div className="flex flex-col min-h-[360px]">
          {!selected ? <div className="flex-1 grid place-items-center p-6 text-sm text-slate-500"><span>Select a conversation to reply.</span></div> : <>
            <div className="p-4 border-b border-slate-800"><p className="font-semibold text-white">{selected.user_name}</p><p className="text-xs text-slate-400">{selected.user_email} · {selected.subject}</p></div>
            <div className="flex-1 max-h-[300px] overflow-y-auto p-4 space-y-3">{messages.map((m) => <div key={m.id} className={`max-w-[90%] rounded-xl p-3 text-sm ${m.sender_role === 'owner' ? 'ml-auto bg-indigo-600/20 border border-indigo-500/20' : 'bg-slate-800'}`}><p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">{m.sender_role === 'owner' ? 'You' : 'Customer'}</p><p className="whitespace-pre-wrap break-words text-slate-100">{m.body}</p><p className="text-[10px] text-slate-500 mt-2">{new Date(m.created_at).toLocaleString()}</p></div>)}</div>
            <form onSubmit={sendReply} className="p-3 border-t border-slate-800 flex gap-2"><input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={4000} placeholder="Write a private reply..." className="min-w-0 flex-1 rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-indigo-500"/><button disabled={busy || !reply.trim()} className="rounded-xl bg-indigo-600 px-3 text-white disabled:opacity-40" aria-label="Send reply"><Send className="w-4 h-4"/></button></form>
          </>}
        </div>
      </div>
    </div>
    <p className="text-xs text-slate-500 flex items-center gap-2"><Activity className="w-3.5 h-3.5"/> Owner-only information is verified by the server on every request.</p>
  </section>;
};
