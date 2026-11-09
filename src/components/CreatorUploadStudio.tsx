import React, { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { api, ApiError } from '../services/api';
import { CloudUpload, Film, Image as ImageIcon, Music2, ShieldCheck, RefreshCw, Loader2, CheckCircle2, AlertCircle, HardDrive } from 'lucide-react';

type MediaAsset = { id: string; name: string; contentType: string; size: number; createdAt: string };
const ACCEPT = 'video/mp4,video/quicktime,video/webm,video/x-matroska,audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/ogg,audio/flac,audio/x-flac,image/jpeg,image/png,image/webp';
const inferredMime = (file: File) => {
  const declared = file.type.toLowerCase();
  if (declared && declared !== 'application/octet-stream') return declared;
  const extension = file.name.toLowerCase().split('.').pop() || '';
  const byExtension: Record<string, string> = {
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  };
  return byExtension[extension] || declared;
};
const prettySize = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export const CreatorUploadStudio: React.FC<{ onEditVideo?: (asset: MediaAsset) => void }> = ({ onEditVideo }) => {
  const input = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ id: string; url: string; contentType: string; name: string } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const result = await api.get<{ assets: MediaAsset[] }>('/media/list');
      setAssets(result.assets || []);
    } catch (e) {
      if (e instanceof ApiError && e.status !== 402) setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);


  const openPreview = async (asset: MediaAsset) => {
    setPreviewing(asset.id);
    setError('');
    try {
      const result = await api.get<{ url: string }>(`/media/url?id=${encodeURIComponent(asset.id)}`);
      setPreview({ id: asset.id, url: result.url, contentType: asset.contentType, name: asset.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open this media file.');
    } finally { setPreviewing(null); }
  };

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = [];
    const selectedFiles = event.target.files;
    if (selectedFiles) {
      for (let index = 0; index < selectedFiles.length; index++) {
        const file = selectedFiles.item(index);
        if (file) files.push(file);
      }
    }
    event.target.value = '';
    if (!files.length) return;
    setError('');
    setMessage('');
    setProgress(0);
    setBusy(true);
    const totalBytes = Math.max(1, files.reduce((sum, file) => sum + file.size, 0));
    let completedBytes = 0;
    const failed: string[] = [];
    try {
      for (const file of files) {
        try {
          await upload(`creator-media/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`, file, {
            access: 'private',
            handleUploadUrl: '/api/media/upload',
            clientPayload: JSON.stringify({ name: file.name, type: inferredMime(file), size: file.size }),
            multipart: file.size > 100 * 1024 ** 2,
            onUploadProgress: ({ percentage }) => setProgress(Math.min(100, Math.round(((completedBytes + file.size * percentage / 100) / totalBytes) * 100))),
          });
          completedBytes += file.size;
          setProgress(Math.min(100, Math.round((completedBytes / totalBytes) * 100)));
        } catch (e) {
          failed.push(`${file.name}: ${e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Upload failed'}`);
        }
      }
      await refresh();
      if (failed.length) setError(`Could not upload ${failed.length} file(s). ${failed.slice(0, 3).join(' · ')}`);
      else setMessage(files.length === 1 ? 'Upload completed. Your private media is ready in the library.' : `All ${files.length} files uploaded to your private media library.`);
    } finally { setBusy(false); setProgress(0); }
  };

  return (
    <section className="rounded-2xl border border-indigo-500/25 bg-slate-950/90 p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/15 p-2.5 text-indigo-300"><CloudUpload className="w-5 h-5" /></div>
          <div>
            <h2 className="text-base font-bold text-white">Creator Upload Studio</h2>
            <p className="text-xs text-slate-400">Bring your own footage, images and audio into OmniPulse</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300"><ShieldCheck className="w-3.5 h-3.5" /> Private storage</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">Upload your original media</p>
          <p className="text-xs leading-relaxed text-slate-400">Choose one or several video clips, voice recordings, music files or images. Files upload directly to your private cloud library, not through your phone's local storage or the app server.</p>
          <p className="text-[10px] text-slate-500">Supported: MP4, MOV, WebM, MKV, MP3, WAV, OGG, FLAC, JPG, PNG and WebP. Per-file limits depend on your subscription.</p>
        </div>
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
          {busy ? 'Uploading…' : 'Choose media'}
        </button>
        <input ref={input} type="file" accept={ACCEPT} multiple className="hidden" onChange={handleFiles} />
      </div>

      {busy && <div className="space-y-1.5" role="status" aria-live="polite"><div className="flex justify-between text-[11px] text-slate-300"><span>Uploading securely</span><span>{progress}%</span></div><div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} /></div></div>}
      {message && <p className="flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 className="h-4 w-4 shrink-0" />{message}</p>}
      {error && <p role="alert" className="flex items-center gap-2 text-xs text-rose-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}

      {preview && <div className="rounded-xl border border-indigo-500/30 bg-slate-900 p-3 space-y-2"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold text-white">Preview: {preview.name}</p><button type="button" onClick={() => setPreview(null)} className="text-xs text-slate-400 hover:text-white">Close</button></div>{preview.contentType.startsWith('video/') ? <video src={preview.url} controls playsInline className="max-h-72 w-full rounded-lg bg-black" /> : preview.contentType.startsWith('audio/') ? <audio src={preview.url} controls className="w-full" /> : <img src={preview.url} alt={preview.name} className="max-h-72 max-w-full rounded-lg object-contain" />}</div>}

      <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
        <div className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-indigo-300" /><h3 className="text-xs font-semibold text-slate-200">Your media library</h3><span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">{assets.length}</span></div>
        <button type="button" onClick={() => { setLoading(true); void refresh(); }} disabled={loading} className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-white disabled:opacity-40"><RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
      </div>
      {loading ? <p className="text-xs text-slate-500">Loading your private media…</p> : assets.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {assets.map((asset) => {
            const video = asset.contentType.startsWith('video/');
            const audio = asset.contentType.startsWith('audio/');
            const Icon = video ? Film : audio ? Music2 : ImageIcon;
            return <div key={asset.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="rounded-lg bg-slate-800 p-2 text-indigo-300"><Icon className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-200">{asset.name}</p><p className="mt-0.5 text-[10px] text-slate-500">{prettySize(Number(asset.size) || 0)} · {new Date(asset.createdAt).toLocaleDateString()}</p></div>
              <div className="flex shrink-0 items-center gap-1.5">{video && onEditVideo && <button type="button" onClick={() => onEditVideo(asset)} className="rounded-md bg-indigo-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-indigo-500">Edit video</button>}<button type="button" onClick={() => void openPreview(asset)} disabled={previewing === asset.id} className="rounded-md border border-slate-700 px-2 py-1 text-[10px] text-indigo-200 hover:border-indigo-500 disabled:opacity-50">{previewing === asset.id ? 'Opening…' : 'Preview'}</button></div>
            </div>;
          })}
        </div>
      ) : <div className="rounded-lg border border-dashed border-slate-800 px-4 py-6 text-center"><CloudUpload className="mx-auto h-6 w-6 text-slate-600" /><p className="mt-2 text-xs text-slate-400">No creator media uploaded yet</p><p className="mt-1 text-[10px] text-slate-600">Your files will appear here after upload.</p></div>}
      <p className="text-[10px] leading-relaxed text-slate-600">Uploads are private and linked to your signed-in account. Select Edit video to open an uploaded clip in the AI Director timeline, add your own supporting media, transcribe speech and render an edited MP4.</p>
    </section>
  );
};
