type VideoMediaLayer = { kind: 'video' | 'image' | 'audio'; sourceIn: number; duration: number; startAt: number; scale: number; opacity: number; x: number; y: number; volume: number };
type VideoCaptionCue = { start: number; end: number; text: string };

export interface CompositionInput {
  base: string;
  baseIsImage?: boolean;
  baseSourceIn?: number;
  overlays: Array<{ layer: VideoMediaLayer; file: string }>;
  audio: Array<{ layer: VideoMediaLayer; file: string }>;
  captions: VideoCaptionCue[];
  title?: string;
  titlePosition?: 'top' | 'center' | 'bottom';
  titleStyle?: 'cinematic' | 'minimal' | 'lower_third';
  duration: number;
  width: number;
  height: number;
  output: string;
  audioGain?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  quality?: 'high' | 'standard' | 'small';
}

async function ffmpegPath(): Promise<string> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const mod: any = await import('ffmpeg-static');
  const path = mod.default || mod;
  if (typeof path !== 'string' || !path) throw new Error('FFMPEG_NOT_AVAILABLE');
  return path;
}

async function run(bin: string, args: string[], timeoutMs: number): Promise<string> {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); if (stderr.length > 120_000) stderr = stderr.slice(-80_000); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('RENDER_TIMEOUT')); }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); if (code === 0) resolve(stderr); else reject(new Error(stderr.slice(-1800) || `FFMPEG_EXIT_${code}`)); });
  });
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000), m = Math.floor(ms / 60_000) % 60, s = Math.floor(ms / 1000) % 60, milli = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
}

export async function renderComposition(input: CompositionInput): Promise<void> {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const bin = await ffmpegPath();
  const duration = Math.max(1, Math.min(90, input.duration));
  const width = Math.max(480, Math.min(1920, Math.round(input.width / 2) * 2));
  const height = Math.max(480, Math.min(1920, Math.round(input.height / 2) * 2));
  const args = ['-hide_banner', '-y'];
  const audioGain = Math.max(0, Math.min(2.5, Number(input.audioGain ?? 1)));
  const brightness = Math.max(-0.15, Math.min(0.15, Number(input.brightness ?? 0)));
  const contrast = Math.max(0.5, Math.min(1.8, Number(input.contrast ?? 1)));
  const saturation = Math.max(0, Math.min(2, Number(input.saturation ?? 1)));
  const qualityCrf = input.quality === 'high' ? 18 : input.quality === 'small' ? 28 : 23;
  if (input.baseIsImage) args.push('-loop', '1', '-t', String(duration), '-i', input.base);
  else args.push('-ss', String(Math.max(0, input.baseSourceIn || 0)), '-t', String(duration), '-i', input.base);
  const filter: string[] = [`[0:v]tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${duration},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation},format=yuv420p[v0]`];
  let videoLabel = 'v0';
  let nextInput = 1;

  for (const { layer, file } of input.overlays) {
    const index = nextInput++;
    if (layer.kind === 'image') args.push('-loop', '1', '-t', String(duration), '-i', file);
    else args.push('-ss', String(Math.max(0, layer.sourceIn || 0)), '-t', String(Math.max(0.1, layer.duration)), '-i', file);
    const nextLabel = `v${index}`;
    const start = Math.max(0, Math.min(duration, layer.startAt || 0));
    const end = Math.max(start + 0.1, Math.min(duration, start + Math.max(0.1, layer.duration)));
    const scale = Math.max(10, Math.min(100, Number(layer.scale) || 55));
    const opacity = Math.max(0, Math.min(1, Number(layer.opacity) || 0));
    const rawX = Number(layer.x), rawY = Number(layer.y);
    const x = Math.max(0, Math.min(100, Number.isFinite(rawX) ? rawX : 50)) / 100;
    const y = Math.max(0, Math.min(100, Number.isFinite(rawY) ? rawY : 50)) / 100;
    filter.push(`[${index}:v]scale=${Math.round(width * scale / 100 / 2) * 2}:-2,format=rgba,colorchannelmixer=aa=${opacity},setpts=PTS-STARTPTS+${start}/TB[ov${index}]`);
    filter.push(`[${videoLabel}][ov${index}]overlay=x=(W-w)*${x}:y=(H-h)*${y}:enable='between(t,${start},${end})':eof_action=pass:shortest=0[${nextLabel}]`);
    videoLabel = nextLabel;
  }

  if (input.captions.length || input.title?.trim()) {
    const cues = input.captions.slice(0, 500).filter((cue) => cue.text && cue.end > cue.start && cue.start < duration);
    const titlePosition = input.titlePosition === 'top' ? 8 : input.titlePosition === 'center' ? 5 : 2;
    const safeText = (value: string, max: number) => value.replace(/[{}\\\r\n]+/g, ' ').slice(0, max);
    const entries = input.title?.trim()
      ? [`1\n${srtTime(0)} --> ${srtTime(duration)}\n{\\an${titlePosition}}${safeText(input.title, 180)}\n`]
      : [];
    entries.push(...cues.map((cue, i) => `${i + (entries.length ? 2 : 1)}\n${srtTime(Math.max(0, cue.start))} --> ${srtTime(Math.min(duration, cue.end))}\n${safeText(String(cue.text), 500)}\n`));
    const srt = entries.join('\n');
    if (srt) {
      const captionPath = path.join(path.dirname(input.output), `captions-${Date.now()}.srt`);
      await fs.writeFile(captionPath, srt, 'utf8');
      const escaped = captionPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
      const style = input.titleStyle === 'minimal'
        ? 'FontName=Arial,FontSize=20,PrimaryColour=&H00FFFFFF,Outline=0,Shadow=1,Alignment=2,MarginV=42'
        : input.titleStyle === 'lower_third'
          ? 'FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,BackColour=&HCC111827,BorderStyle=3,Outline=1,Shadow=0,Alignment=1,MarginL=54,MarginV=54'
          : 'FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,BackColour=&HCC090D18,BorderStyle=3,Outline=2,Shadow=1,Alignment=2,MarginV=42';
      filter.push(`[${videoLabel}]subtitles=filename='${escaped}':force_style='${style}'[vfinal]`);
      videoLabel = 'vfinal';
    }
  }

  const audioInputs: Array<{ index: number; layer: VideoMediaLayer }> = [];
  for (const { layer, file } of input.audio) {
    const index = nextInput++;
    args.push('-ss', String(Math.max(0, layer.sourceIn || 0)), '-t', String(Math.max(0.1, layer.duration)), '-i', file);
    audioInputs.push({ index, layer });
  }

  const probe = await new Promise<string>((resolve) => {
    import('node:child_process').then(({ spawn }) => {
    const child = spawn(bin, ['-hide_banner', '-i', input.base], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = ''; child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('close', () => resolve(stderr)); child.on('error', () => resolve(''));
    });
  });
  const hasBaseAudio = /Audio:\s/.test(probe);
  const audioLabels: string[] = [];
  if (hasBaseAudio) { filter.push(`[0:a]atrim=duration=${duration},apad=pad_dur=${duration},atrim=duration=${duration},asetpts=PTS-STARTPTS,volume=${audioGain}[abase]`); audioLabels.push('[abase]'); }
  for (const { index, layer } of audioInputs) {
    const label = `a${index}`;
    const startMs = Math.round(Math.max(0, Math.min(duration, layer.startAt || 0)) * 1000);
    const volume = Math.max(0, Math.min(2, Number(layer.volume) || 0));
    filter.push(`[${index}:a]atrim=duration=${Math.max(0.1, layer.duration)},asetpts=PTS-STARTPTS,adelay=${startMs}|${startMs},volume=${volume}[${label}]`);
    audioLabels.push(`[${label}]`);
  }
  if (audioLabels.length > 1) filter.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]`);
  else if (audioLabels.length === 1) filter.push(`${audioLabels[0]}anull[aout]`);

  args.push('-filter_complex', filter.join(';'), '-map', `[${videoLabel}]`);
  if (audioLabels.length) args.push('-map', '[aout]');
  else if (hasBaseAudio) args.push('-map', '0:a?');
  args.push('-t', String(duration), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(qualityCrf), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-max_muxing_queue_size', '2048', input.output);
  await run(bin, args, 240_000);
}
