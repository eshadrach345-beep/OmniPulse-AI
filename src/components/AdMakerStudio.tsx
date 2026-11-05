import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Sparkles, Wand2, Loader2, X, Check, Film } from 'lucide-react';
import type { AspectRatioType, GeneratedVideo } from '../types';
import { api } from '../services/api';

type Concept = {
  title: string; hook: string; direction: string; videoPrompt: string;
  voiceover: string; onScreenText: string; callToAction: string; imagePrompt: string;
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function compressImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error('Choose a JPG, PNG or WebP image.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('This image could not be opened.')); img.src = objectUrl;
    });
    const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not prepare this image.');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL('image/jpeg', 0.78);
    if (data.length > 1_650_000) {
      const smaller = document.createElement('canvas');
      smaller.width = Math.round(canvas.width * 0.72); smaller.height = Math.round(canvas.height * 0.72);
      const sc = smaller.getContext('2d'); if (!sc) throw new Error('Could not compress this image.');
      sc.drawImage(canvas, 0, 0, smaller.width, smaller.height); data = smaller.toDataURL('image/jpeg', 0.68);
    }
    if (data.length > 1_850_000) throw new Error('This image is still too large after compression. Choose another image.');
    return data;
  } finally { URL.revokeObjectURL(objectUrl); }
}

interface Props {
  nicheName: string;
  onClose: () => void;
  onSaveNewVideo: (video: GeneratedVideo) => void;
}
export const AdMakerStudio: React.FC<Props> = ({ nicheName, onClose, onSaveNewVideo }) => {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [brand, setBrand] = useState('');
  const [product, setProduct] = useState('');
  const [audience, setAudience] = useState('');
  const [brief, setBrief] = useState('');
  const [aspect, setAspect] = useState<AspectRatioType>('9:16');
  const [seconds, setSeconds] = useState<5 | 10>(5);
  const [preview, setPreview] = useState('');
  const [selectedImage, setSelectedImage] = useState('');
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedConcept, setSelectedConcept] = useState(0);
  const [brandImages, setBrandImages] = useState<string[]>([]);
  const [imagePrompt, setImagePrompt] = useState('');
  const [motion, setMotion] = useState('');
  const [voiceover, setVoiceover] = useState('');
  const [voiceGender, setVoiceGender] = useState<'female' | 'male'>('female');
  const [busy, setBusy] = useState<'ideas' | 'images' | 'render' | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const concept = concepts[selectedConcept];
  const chooseFile = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      const data = await compressImage(file);
      setSelectedImage(data);
      const url = URL.createObjectURL(file); setPreview(url); setBrandImages([]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Image upload failed.'); }
  };

  const suggest = async () => {
    if (product.trim().length < 5) { setError('Describe your product or service first.'); return; }
    setBusy('ideas'); setError(''); setStatus('Creative director is developing campaign ideas...');
    try {
      const r = await api.post<{ concepts: Concept[]; brandImagePrompts?: string[] }>('/ai/ad-concepts', { brand, product, audience, brief, aspect, seconds });
      setConcepts(r.concepts); setSelectedConcept(0); setVoiceover(r.concepts[0]?.voiceover || '');
      const firstPrompt = r.brandImagePrompts?.[0] || r.concepts[0]?.imagePrompt || '';
      setImagePrompt(firstPrompt);
      setStatus('Three campaign directions are ready. Choose one to continue.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create ad concepts.'); setStatus(''); }
    finally { setBusy(null); }
  };

  const makeImages = async () => {
    if (!imagePrompt.trim()) { setError('Add a brand image direction first.'); return; }
    setBusy('images'); setError(''); setStatus('Creating premium brand campaign images...');
    try {
      const r = await api.post<{ images: string[] }>('/ad/brand-images', { prompt: imagePrompt, aspect });
      setBrandImages(r.images || []);
      if (r.images?.[0]) setSelectedImage(r.images[0]);
      setStatus('Brand visuals are ready. Select the image you want to animate.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Brand image generation failed.'); setStatus(''); }
    finally { setBusy(null); }
  };

  const render = async () => {
    if (!selectedImage) { setError('Upload a product image or generate a brand image first.'); return; }
    if (!concept && motion.trim().length < 8) { setError('Describe how you want the image to move.'); return; }
    const prompt = [
      concept?.videoPrompt || '',
      motion.trim() ? `User direction: ${motion.trim()}.` : '',
      'Preserve the exact product identity, packaging, label layout and brand colours from the input image. Keep the product recognizable and undistorted. Premium commercial cinematography, smooth controlled camera movement, realistic material detail, clean composition, no invented logos, no gibberish text, no extra products.',
    ].filter(Boolean).join(' ');
    setBusy('render'); setError(''); setStatus('Submitting your image to the video engine...');
    try {
      const r = await api.post<{ jobId: string }>('/ad/render-image', { imageUrl: selectedImage, prompt, seconds, aspect, voiceover, voiceGender });
      const started = Date.now();
      let videoUrl = '';
      while (Date.now() - started < 8 * 60_000) {
        await wait(4500);
        const s = await api.get<{ state: string; videoUrl?: string; error?: string }>(`/video/status?id=${encodeURIComponent(r.jobId)}`);
        if (s.state === 'done' && s.videoUrl) { videoUrl = s.videoUrl; break; }
        if (s.state === 'failed') throw new Error(s.error || 'The ad video could not be rendered.');
        setStatus(s.state === 'queued' ? 'Waiting for the image-to-video engine...' : 'Animating your product image...');
      }
      if (!videoUrl) throw new Error('The render is taking longer than expected. Please try again.');
      const title = concept?.title || `${brand || product} — Brand Ad`;
      const video: GeneratedVideo = {
        id: `ad-${Date.now()}`, title, userPrompt: `${product}. ${brief}`, videoType: 'ad_video', aspectRatio: aspect,
        targetPlatforms: ['tiktok', 'youtube', 'instagram'], nicheId: nicheName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        estimatedDuration: seconds, scenes: [{
          id: `ad-scene-${Date.now()}`, sceneNumber: 1, duration: seconds,
          visualCue: concept?.direction || prompt, motionStyle: 'Dynamic Zoom',
          bgGradient: 'from-slate-950 via-indigo-950 to-black', narration: voiceover,
          onScreenText: concept?.onScreenText || '', soundEffectCue: 'Premium commercial sound design',
        }],
        voiceoverStyle: voiceover.trim() ? 'AI voice-over generated and attached to the ad soundtrack' : 'No voice-over', backgroundMusicTrack: 'Commercial sound design',
        thumbnailUrl: selectedImage, videoUrl, createdAt: new Date().toISOString(), status: 'ready',
        hashtags: [], callToAction: concept?.callToAction || '',
      };
      onSaveNewVideo(video); setStatus('Your image-based ad is ready.'); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Ad rendering failed.'); setStatus(''); }
    finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/85 p-2 sm:p-5 backdrop-blur-sm overflow-y-auto overscroll-contain" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Image-to-video ad maker" className="w-full max-w-4xl mx-auto my-2 sm:my-4 rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl overflow-y-auto overscroll-contain" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900">
          <div><p className="text-[10px] uppercase tracking-[.2em] text-fuchsia-300 font-bold">OmniPulse Creative Lab</p><h2 className="text-lg font-bold text-white flex items-center gap-2"><Sparkles className="w-5 h-5 text-fuchsia-400" />Image-to-Video Ad Maker</h2><p className="text-xs text-slate-400 mt-1">Turn product photos into polished campaign videos and generate matching brand visuals.</p></div>
          <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-800" aria-label="Close ad maker"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid lg:grid-cols-2 gap-5 p-4 sm:p-5">
          <div className="space-y-3">
            <div><label className="block text-xs text-slate-300 font-semibold mb-1">Brand name</label><input value={brand} onChange={e=>setBrand(e.target.value)} maxLength={100} placeholder="Your brand" className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-sm text-white" /></div>
            <div><label className="block text-xs text-slate-300 font-semibold mb-1">Product or service</label><textarea value={product} onChange={e=>setProduct(e.target.value)} rows={2} maxLength={500} placeholder="What are you advertising? Include its real features and benefits." className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-sm text-white" /></div>
            <div><label className="block text-xs text-slate-300 font-semibold mb-1">Target audience</label><input value={audience} onChange={e=>setAudience(e.target.value)} maxLength={160} placeholder="Who should this ad attract?" className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-sm text-white" /></div>
            <div><label className="block text-xs text-slate-300 font-semibold mb-1">How should the ad look?</label><textarea value={brief} onChange={e=>setBrief(e.target.value)} rows={3} maxLength={1200} placeholder="e.g. Luxury studio, glossy close-ups, gold lighting, slow camera orbit, premium and elegant." className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-sm text-white" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-xs text-slate-300 mb-1">Format</label><select value={aspect} onChange={e=>setAspect(e.target.value as AspectRatioType)} className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-sm text-white"><option value="9:16">Vertical 9:16</option><option value="16:9">Landscape 16:9</option><option value="1:1">Square 1:1</option></select></div>
              <div><label className="block text-xs text-slate-300 mb-1">Ad length</label><select value={seconds} onChange={e=>setSeconds(Number(e.target.value) as 5|10)} className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-sm text-white"><option value={5}>5 seconds</option><option value={10}>10 seconds</option></select></div>
            </div>
            <button onClick={suggest} disabled={!!busy} className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-3 text-sm font-bold text-white"><Sparkles className="w-4 h-4" />{busy==='ideas' ? 'Creating concepts...' : 'Suggest 3 ad concepts'}</button>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between mb-2"><p className="text-xs font-semibold text-white">Product / brand image</p><button onClick={()=>fileRef.current?.click()} className="text-xs text-indigo-300 flex items-center gap-1"><ImagePlus className="w-3.5 h-3.5" />Upload image</button></div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e=>chooseFile(e.target.files?.[0])} />
              {preview || selectedImage ? <div className="relative"><img src={selectedImage.startsWith('data:') ? preview : selectedImage} alt="Selected brand asset" className="w-full max-h-64 object-contain rounded-lg bg-black" /><p className="text-[10px] text-slate-400 mt-1">This image will be used as the opening frame of your ad.</p></div> : <button onClick={()=>fileRef.current?.click()} className="w-full min-h-36 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs"><ImagePlus className="w-8 h-8" />Tap to upload a product photo, package or brand image</button>}
              {brandImages.length>0 && <div className="grid grid-cols-2 gap-2 mt-3">{brandImages.map((url,i)=><button key={url} onClick={()=>setSelectedImage(url)} className={`rounded-lg border p-1 ${selectedImage===url?'border-fuchsia-400 ring-1 ring-fuchsia-400':'border-slate-700'}`}><img src={url} alt={`Generated brand visual ${i+1}`} className="w-full aspect-square object-cover rounded" /><span className="text-[10px] text-slate-300 flex items-center justify-center gap-1 py-1">{selectedImage===url?<Check className="w-3 h-3 text-emerald-400"/>:'Select'} Visual {i+1}</span></button>)}</div>}
            </div>
            {concepts.length>0 && <div className="space-y-2"><p className="text-xs font-semibold text-white">AI creative directions</p>{concepts.map((item,i)=><button key={i} onClick={()=>{setSelectedConcept(i);setImagePrompt(item.imagePrompt);setVoiceover(item.voiceover || '');}} className={`w-full text-left rounded-lg border p-3 ${selectedConcept===i?'border-indigo-500 bg-indigo-950/50':'border-slate-800 bg-slate-900'}`}><span className="text-xs font-bold text-white">{i+1}. {item.title}</span><p className="text-[11px] text-slate-400 mt-1">{item.hook}</p><p className="text-[10px] text-slate-500 mt-1">{item.direction}</p></button>)}</div>}
            <div><label className="block text-xs text-slate-300 font-semibold mb-1">Brand image prompt</label><textarea value={imagePrompt} onChange={e=>setImagePrompt(e.target.value)} rows={2} placeholder="AI will suggest premium campaign image directions here." className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-xs text-white" /><button onClick={makeImages} disabled={!!busy || imagePrompt.trim().length<20} className="mt-2 w-full rounded-lg border border-fuchsia-700 text-fuchsia-200 hover:bg-fuchsia-950/40 disabled:opacity-40 px-3 py-2.5 text-xs font-semibold flex items-center justify-center gap-2"><Wand2 className="w-4 h-4" />{busy==='images'?'Generating brand visuals...':'Generate 2 brand campaign images'}</button></div>
          </div>
        </div>
        <div className="px-4 sm:px-5 pb-5 space-y-3">
          <div><label className="block text-xs text-slate-300 font-semibold mb-1">Final motion direction</label><textarea value={motion} onChange={e=>setMotion(e.target.value)} rows={2} placeholder="e.g. Slowly orbit around the bottle as water droplets roll down the glass; dramatic light sweeps across the label." className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-sm text-white" /></div>
          {concept && <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2"><div className="flex items-center justify-between gap-2"><p className="text-xs text-slate-200 font-semibold">Spoken voice-over</p><select value={voiceGender} onChange={e=>setVoiceGender(e.target.value as 'female'|'male')} className="rounded-md bg-slate-800 border border-slate-700 px-2 py-1 text-[11px] text-white"><option value="female">Female voice</option><option value="male">Male voice</option></select></div><textarea value={voiceover} onChange={e=>setVoiceover(e.target.value)} rows={2} maxLength={300} className="w-full rounded-lg bg-slate-950 border border-slate-700 p-2 text-sm text-white" placeholder="Exact words spoken in the ad"/><p className="text-[10px] text-slate-500">This text is converted to speech and attached to the finished ad. Keep it under {seconds===5?10:22} words for the selected length.</p><p className="text-xs text-fuchsia-200">CTA: {concept.callToAction}</p></div>}
          {status && <p role="status" className="text-xs text-indigo-200">{status}</p>}
          {error && <p role="alert" className="text-xs text-red-300 bg-red-950/40 border border-red-900 rounded-lg p-3">{error}</p>}
          <button onClick={render} disabled={!!busy || !selectedImage} className="w-full flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-fuchsia-600 to-indigo-600 hover:opacity-90 disabled:opacity-40 px-4 py-3.5 text-sm font-bold text-white">{busy==='render'?<Loader2 className="w-4 h-4 animate-spin"/>:<Film className="w-4 h-4"/>}{busy==='render'?'Rendering your image-based ad...':'Animate selected image into an ad'}</button>
          <p className="text-[10px] text-slate-500 text-center">Video rendering uses your account's available video seconds. Brand still generation may consume your account's available AI credits.</p>
        </div>
      </div>
    </div>
  );
};
