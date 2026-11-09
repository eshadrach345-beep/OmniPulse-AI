export interface VideoQualityReport {
  frozenSegments: Array<{ start: number; end?: number; duration?: number }>;
  silenceSegments: Array<{ start: number; end?: number; duration?: number }>;
  integratedLufs: number | null;
  truePeakDbfs: number | null;
  hasAudio: boolean;
  warnings: string[];
}

const lastNumber = (pattern: RegExp, source: string): number | null => {
  const matches = [...source.matchAll(pattern)];
  if (!matches.length) return null;
  const value = Number(matches[matches.length - 1][1]);
  return Number.isFinite(value) ? value : null;
};

export function parseVideoQualityOutput(output: string, hasAudio = true): VideoQualityReport {
  const frozenSegments: VideoQualityReport['frozenSegments'] = [];
  const silenceSegments: VideoQualityReport['silenceSegments'] = [];
  const freezeStarts = [...output.matchAll(/freeze_start:\s*(-?\d+(?:\.\d+)?)/g)];
  const freezeEnds = [...output.matchAll(/freeze_end:\s*(-?\d+(?:\.\d+)?)(?:\s*\|\s*freeze_duration:\s*(-?\d+(?:\.\d+)?))?/g)];
  for (let i = 0; i < freezeStarts.length; i++) {
    const start = Number(freezeStarts[i][1]);
    const endMatch = freezeEnds[i];
    frozenSegments.push({
      start,
      ...(endMatch ? { end: Number(endMatch[1]), duration: Number(endMatch[2] || (Number(endMatch[1]) - start).toFixed(3)) } : {}),
    });
  }
  const silenceStarts = [...output.matchAll(/silence_start:\s*(-?\d+(?:\.\d+)?)/g)];
  const silenceEnds = [...output.matchAll(/silence_end:\s*(-?\d+(?:\.\d+)?)(?:\s*\|\s*silence_duration:\s*(-?\d+(?:\.\d+)?))?/g)];
  for (let i = 0; i < silenceStarts.length; i++) {
    const start = Number(silenceStarts[i][1]);
    const endMatch = silenceEnds[i];
    silenceSegments.push({
      start,
      ...(endMatch ? { end: Number(endMatch[1]), duration: Number(endMatch[2] || (Number(endMatch[1]) - start).toFixed(3)) } : {}),
    });
  }

  const integratedLufs = hasAudio ? lastNumber(/\bI:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g, output) : null;
  const truePeakDbfs = hasAudio ? lastNumber(/\bPeak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g, output) : null;
  const warnings: string[] = [];
  if (frozenSegments.some((segment) => (segment.duration || 0) >= 1)) warnings.push('Possible frozen frame lasting at least 1 second.');
  if (silenceSegments.some((segment) => (segment.duration || 0) >= 0.7 || segment.end === undefined)) warnings.push('Audio contains a silence gap of at least 0.7 seconds.');
  if (hasAudio && integratedLufs !== null && (integratedLufs < -16 || integratedLufs > -13)) warnings.push('Integrated loudness is outside the recommended -14 LUFS delivery window.');
  if (hasAudio && truePeakDbfs !== null && truePeakDbfs > -1.5) warnings.push('True peak exceeds the -1.5 dBFS delivery ceiling.');
  if (hasAudio && integratedLufs === null) warnings.push('Audio loudness could not be measured.');
  if (hasAudio && truePeakDbfs === null) warnings.push('Audio true peak could not be measured.');
  return { frozenSegments, silenceSegments, integratedLufs, truePeakDbfs, hasAudio, warnings };
}

async function execute(bin: string, args: string[], timeoutMs = 90_000): Promise<string> {
  const { spawn } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); if (stderr.length > 180_000) stderr = stderr.slice(-120_000); });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('VIDEO_QA_TIMEOUT')); }, timeoutMs);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr.slice(-1800) || `VIDEO_QA_FFMPEG_EXIT_${code}`));
    });
  });
}

/** CPU-only delivery checks. Findings are warnings, not silent render failures. */
export async function runVideoQualityChecks(file: string, bin: string): Promise<VideoQualityReport> {
  const probe = await execute(bin, ['-hide_banner', '-i', file, '-f', 'null', '-']);
  const hasAudio = /Audio:\s/.test(probe);
  const filters = ['-vf', 'freezedetect=n=0.003:d=1'];
  if (hasAudio) filters.push('-af', 'silencedetect=n=-45dB:d=0.5,ebur128=peak=true');
  const output = await execute(bin, ['-hide_banner', '-i', file, ...filters, '-f', 'null', '-']);
  return parseVideoQualityOutput(output, hasAudio);
}
