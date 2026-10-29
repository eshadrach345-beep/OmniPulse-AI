// Joins several short clips into one MP4 using ffmpeg. Everything is imported lazily so a missing ffmpeg never breaks the rest of the API.

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
    // Download every scene at the same time. Long productions have up to 12 scenes, and one after another would eat the 60 second limit.
    // Each clip is inspected as soon as it has arrived, in parallel with the others, instead of one after another at the end.
    const info: ClipInfo[] = new Array(urls.length);
    const files: string[] = await Promise.all(urls.map(async (url, i) => {
      let r: Response | null = null;
      for (let attempt = 0; attempt < 2 && !r?.ok; attempt++) { try { r = await fetch(url, { signal: AbortSignal.timeout(20_000) }); } catch { r = null; } } // one quick retry for a network hiccup
      if (!r || !r.ok) throw new Error(`Scene ${i + 1} could not be downloaded${r ? ` (${r.status})` : ''}.`);
      const f = path.join(dir, `c${i}.mp4`);
      await fs.writeFile(f, Buffer.from(await r.arrayBuffer()));
      if (urls.length > 1) info[i] = await inspect(bin, f);
      return f;
    }));
    const out = path.join(dir, 'out.mp4');
    if (files.length === 1) { await fs.copyFile(files[0], out); return { file: out, cleanup }; }

    const same = info.every((c) => c.video && c.video === info[0].video && c.size === info[0].size && c.audio === info[0].audio);

    // Fast path: the clips share the same format, so they can be joined without re-encoding.
    // The manifest (list.txt) is the file list read by ffmpeg's concat demuxer ("-f concat").
    const fluent = await loadFluent(bin);
    if (same) {
      const list = path.join(dir, 'list.txt');
      await fs.writeFile(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
      let ok = false;
      if (fluent) {
        try { await fluentRun(fluent().input(list).inputOptions(['-f concat', '-safe 0']).outputOptions(['-c copy', ...WEB_FLAGS]), out, 40_000); ok = true; }
        catch (e: any) { console.error('fluent concat failed, trying plain ffmpeg:', e?.message); }
      } else {
        const r = await run(bin, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out], 40_000);
        ok = r.code === 0;
      }
      const st = await fs.stat(out).catch(() => null);
      if (ok && st && st.size > 2000) return { file: out, cleanup };
    }

    // Safe path: make every clip the same size and sound layout, then join (re-encodes, a little slower).
    const [W, H] = (info[0].size || '512x896').split('x').map(Number);
    const parts: string[] = [];
    const labels: string[] = [];
    info.forEach((c, i) => {
      parts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p[v${i}]`);
      if (c.audio) parts.push(`[${i}:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
      else parts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${c.seconds.toFixed(2)}[a${i}]`);
      labels.push(`[v${i}][a${i}]`);
    });
    parts.push(`${labels.join('')}concat=n=${files.length}:v=1:a=1[v][a]`);
    const graph = parts.join(';');
    const encodeOpts = ['-c:v libx264', '-preset ultrafast', '-crf 26', '-c:a aac', '-b:a 128k', ...WEB_FLAGS];
    let r2ok = false;
    if (fluent) {
      try {
        const cmd = fluent();
        files.forEach((f) => cmd.input(f));
        await fluentRun(cmd.complexFilter([graph], ['v', 'a']).outputOptions(encodeOpts), out, 45_000);
        r2ok = true;
      } catch (e: any) { console.error('fluent re-encode failed:', e?.message); }
    } else {
      const args: string[] = ['-y'];
      files.forEach((f) => args.push('-i', f));
      args.push('-filter_complex', graph, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out);
      r2ok = (await run(bin, args, 45_000)).code === 0;
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
