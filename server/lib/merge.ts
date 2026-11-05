// Joins scene clips into one MP4. Inputs are streamed to disk to avoid buffering an entire production in function memory.

interface ClipInfo { video: string; audio: string; size: string; seconds: number }

async function ffmpegBinary(): Promise<string> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const m: any = await import('ffmpeg-static');
    const p = m.default || m;
    if (typeof p === 'string' && p) return p;
  } catch { /* not installed */ }
  throw new Error('NO_FFMPEG');
}

async function run(bin: string, args: string[], timeoutMs: number): Promise<{ code: number; err: string }> {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d: Buffer) => { err += d.toString(); if (err.length > 200_000) err = err.slice(-100_000); });
    const t = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* ignore */ } }, timeoutMs);
    p.on('close', (code: number | null) => { clearTimeout(t); resolve({ code: code ?? 1, err }); });
    p.on('error', () => { clearTimeout(t); resolve({ code: 1, err: 'spawn failed' }); });
  });
}

/** Reads codec, size, length and whether there is sound, from what ffmpeg prints about a file. */
async function inspect(bin: string, file: string): Promise<ClipInfo> {
  const { err } = await run(bin, ['-hide_banner', '-i', file], 15_000);
  const v = err.match(/Video:\s*([a-z0-9_]+)[^\n]*?(\d{2,5})x(\d{2,5})/i);
  const a = err.match(/Audio:\s*([a-z0-9_]+)[^\n]*?(\d+) Hz[^\n]*?,\s*([a-z0-9.\s()]+?),/i);
  const d = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return {
    video: v ? v[1] : '',
    size: v ? `${v[2]}x${v[3]}` : '',
    audio: a ? `${a[1]}/${a[2]}/${a[3].trim()}` : '',
    seconds: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 5,
  };
}

/**
 * fluent-ffmpeg is loaded on demand, so a missing package never breaks the rest of the API.
 * Returns null when it is not installed; the plain ffmpeg command line below is then used instead.
 */
async function loadFluent(bin: string): Promise<any | null> {
  try {
    // @ts-ignore fluent-ffmpeg ships no type declarations; it is used untyped here
    const m: any = await import('fluent-ffmpeg');
    const f = m.default || m;
    f.setFfmpegPath(bin);
    return f;
  } catch { return null; }
}

/** Runs one fluent-ffmpeg command to completion with a time limit. */
function fluentRun(cmd: any, outPath: string, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { try { cmd.kill('SIGKILL'); } catch { /* ignore */ } reject(new Error('Joining the scenes took too long.')); }, timeoutMs);
    cmd.on('error', (e: Error) => { clearTimeout(timer); reject(e); })
      .on('end', () => { clearTimeout(timer); resolve(); })
      .save(outPath);
  });
}

/** Web-friendly output flags: the moov atom goes first so the file starts playing before it has fully downloaded. */
const WEB_FLAGS = ['-movflags +faststart'];

export interface MergeResult { file: string; cleanup: () => Promise<void>; cached?: boolean }

/**
 * A recently joined video is kept in the server's temporary folder (a few files, for a short time), so pressing Download again,
 * or downloading after a retry, is instant instead of joining the scenes all over again.
 */
const CACHE_KEEP = 3, CACHE_MS = 20 * 60_000;
async function cachePaths(urls: string[]) {
  const crypto = await import('node:crypto'), os = await import('node:os'), path = await import('node:path');
  const dir = path.join(os.tmpdir(), 'op-merge-cache');
  return { dir, file: path.join(dir, `${crypto.createHash('sha1').update(urls.join('|')).digest('hex')}.mp4`) };
}
async function cacheTrim(dir: string) {
  const fs = await import('node:fs/promises'), path = await import('node:path');
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const stats = (await Promise.all(names.map(async (n: string) => ({ n, st: await fs.stat(path.join(dir, n)).catch(() => null) })))).filter((x) => x.st) as { n: string; st: any }[];
  stats.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  await Promise.all(stats.filter((x, i) => i >= CACHE_KEEP || Date.now() - x.st.mtimeMs > CACHE_MS).map((x) => fs.rm(path.join(dir, x.n), { force: true }).catch(() => undefined)));
}

export async function mergeClips(urls: string[]): Promise<MergeResult> {
  if (!urls.length) throw new Error('No clips to join.');
  const fs = await import('node:fs/promises');
  const cache = await cachePaths(urls);
  const hit = await fs.stat(cache.file).catch(() => null);
  if (hit && hit.size > 2000 && Date.now() - hit.mtimeMs < CACHE_MS) return { file: cache.file, cleanup: async () => undefined, cached: true };
  const made = await mergeClipsFresh(urls);
  try { await fs.mkdir(cache.dir, { recursive: true }); await fs.copyFile(made.file, cache.file); await cacheTrim(cache.dir); } catch { /* the cache is only a speed-up */ }
  return made;
}

async function mergeClipsFresh(urls: string[]): Promise<MergeResult> {
  const bin = await ffmpegBinary();
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'op-merge-'));
  const cleanup = async () => { await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined); };
  try {
    // Stream downloads concurrently, but keep a strict aggregate size ceiling and cancel peers on any failure.
    const MAX_INPUT_BYTES = 400 * 1024 * 1024;
    const { Readable, Transform } = await import('node:stream');
    const { pipeline } = await import('node:stream/promises');
    const { createWriteStream } = await import('node:fs');
    const controller = new AbortController();
    let downloadedBytes = 0;
    let declaredBytesTotal = 0;
    const info: ClipInfo[] = new Array(urls.length);
    const downloadTasks = urls.map(async (url, i) => {
      try {
        let r: Response | null = null;
        for (let attempt = 0; attempt < 2 && !r?.ok; attempt++) {
          try { r = await fetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]) }); }
          catch (error) { if (controller.signal.aborted) throw error; r = null; }
        }
        if (!r || !r.ok) throw new Error(`Scene ${i + 1} could not be downloaded${r ? ` (${r.status})` : ''}.`);
        const declaredBytes = Number(r.headers.get('content-length') || 0);
        if (declaredBytes > 0) {
          declaredBytesTotal += declaredBytes;
          if (declaredBytesTotal > MAX_INPUT_BYTES) throw new Error('The combined scene files exceed the 400 MB assembly limit.');
        }
        if (!r.body) throw new Error(`Scene ${i + 1} returned an empty download.`);
        const f = path.join(dir, `c${i}.mp4`);
        const meter = new Transform({ transform(chunk, _encoding, callback) {
          downloadedBytes += chunk.length;
          if (downloadedBytes > MAX_INPUT_BYTES) callback(new Error('The combined scene files exceed the 400 MB assembly limit.'));
          else callback(null, chunk);
        } });
        await pipeline((Readable as any).fromWeb(r.body as any), meter, createWriteStream(f, { flags: 'wx' }), { signal: controller.signal });
        return f;
      } catch (error) { controller.abort(error); throw error; }
    });
    let files: string[];
    try { files = await Promise.all(downloadTasks); }
    catch (error) { controller.abort(); await Promise.allSettled(downloadTasks); throw error; }
    // Probe clips in small batches; spawning one FFmpeg process per scene at once can exhaust Hobby memory.
    if (urls.length > 1) {
      for (let i = 0; i < files.length; i += 2) {
        const batch = files.slice(i, i + 2);
        const results = await Promise.all(batch.map((file) => inspect(bin, file)));
        results.forEach((result, offset) => { info[i + offset] = result; });
      }
    }
    const out = path.join(dir, 'out.mp4');
    if (files.length === 1) { await fs.copyFile(files[0], out); return { file: out, cleanup }; }

    const same = info.every((c) => c.video && c.video === info[0].video && c.size === info[0].size && c.audio === info[0].audio);

    // Keep the zero-audio fast path. When generated clips contain audio, re-encode
    // the joined soundtrack so clip boundaries are softened and loudness is consistent.
    const fluent = await loadFluent(bin);
    if (same && info.every((c) => !c.audio)) {
      const list = path.join(dir, 'list.txt');
      await fs.writeFile(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\\n'));
      let ok = false;
      if (fluent) {
        try { await fluentRun(fluent().input(list).inputOptions(['-f concat', '-safe 0']).outputOptions(['-c copy', ...WEB_FLAGS]), out, 45_000); ok = true; }
        catch (e: any) { console.error('fluent concat failed, trying plain ffmpeg:', e?.message); }
      } else {
        const r = await run(bin, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], 40_000);
        ok = r.code === 0;
      }
      const st = await fs.stat(out).catch(() => null);
      if (ok && st && st.size > 2000) return { file: out, cleanup };
    }

    // Standardize video streams and audio layout. Short equal-power crossfades
    // soften abrupt soundtrack cuts; mild loudness normalization reduces jumps
    // between clips without changing the spoken words.
    const [W, H] = (info[0].size || '512x896').split('x').map(Number);
    const parts: string[] = [];
    const videoLabels: string[] = [];
    const audioLabels: string[] = [];
    const totalDuration = info.reduce((sum, clip) => sum + Math.max(0.1, clip.seconds), 0);
    info.forEach((c, i) => {
      parts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p,setpts=PTS-STARTPTS[v${i}]`);
      videoLabels.push(`[v${i}]`);
      if (c.audio) {
        // Match each audio segment to its video's measured duration before concatenating.
        // This prevents short/long provider audio tracks from shifting later dialogue out of sync.
        const clipDuration = c.seconds.toFixed(2);
        parts.push(`[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,dynaudnorm=f=150:g=7:p=0.8,apad,atrim=duration=${clipDuration},asetpts=PTS-STARTPTS[a${i}]`);
      } else {
        parts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${c.seconds.toFixed(2)},aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`);
      }
      audioLabels.push(`[a${i}]`);
    });
    parts.push(`${videoLabels.join('')}concat=n=${files.length}:v=1:a=0[v]`);
    // Concatenate audio at the same scene boundaries as video. An acrossfade overlaps and shortens
    // every boundary, progressively shifting dialogue earlier than the matching picture.
    parts.push(`${audioLabels.join('')}concat=n=${files.length}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=duration=${totalDuration.toFixed(2)}[aout]`);
    const graph = parts.join(';');
    const encodeOpts = ['-c:v libx264', '-preset ultrafast', '-crf 24', '-c:a aac', '-b:a 160k', ...WEB_FLAGS];
    let r2ok = false;
    if (fluent) {
      try {
        const cmd = fluent();
        files.forEach((f) => cmd.input(f));
        await fluentRun(cmd.complexFilter([graph], ['v', 'aout']).outputOptions(encodeOpts), out, 50_000);
        r2ok = true;
      } catch (e: any) { console.error('fluent audio crossfade failed:', e?.message); }
    } else {
      const args: string[] = ['-y'];
      files.forEach((f) => args.push('-i', f));
      args.push('-filter_complex', graph, '-map', '[v]', '-map', '[aout]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '24', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out);
      r2ok = (await run(bin, args, 50_000)).code === 0;
    }
    const st2 = await fs.stat(out).catch(() => null);
    if (!r2ok || !st2 || st2.size < 2000) throw new Error('The scenes could not be joined.');
    return { file: out, cleanup };
  } catch (e) {
    await cleanup();
    throw e;
  }
}

/** Downloads a finished clip and returns its last picture as a JPEG. The next part of a scene starts from this picture, so the scene carries on without a visible jump. */
export async function lastFrameJpeg(url: string): Promise<Buffer> {
  const bin = await ffmpegBinary();
  const fs = await import('node:fs/promises');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'op-frame-'));
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    if (!r.ok) throw new Error(`The clip could not be downloaded (${r.status}).`);
    const input = path.join(dir, 'in.mp4'), out = path.join(dir, 'last.jpg');
    await fs.writeFile(input, Buffer.from(await r.arrayBuffer()));
    // seek to just before the end; if the clip is very short, fall back to its first second
    for (const seek of ['-0.25', '-0.8']) {
      await run(bin, ['-y', '-sseof', seek, '-i', input, '-frames:v', '1', '-q:v', '3', out], 20_000);
      const st = await fs.stat(out).catch(() => null);
      if (st && st.size > 1500) return await fs.readFile(out);
    }
    throw new Error('No picture could be taken from the clip.');
  } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined); }
}
