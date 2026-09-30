import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat, rename, rm } from 'node:fs/promises';
import path from 'node:path';
const run = promisify(execFile);
const MAX_BYTES = 32 * 1024 * 1024;

// Local, finite clips only. No network protocols or user-supplied command arguments.
export function createNativeMedia() {
  const pending = new Map();
  return async function prepare(input, output) {
    try { await stat(output); return output; } catch { }
    if (pending.has(output)) return pending.get(output);
    if (pending.size >= 2) throw new Error('Two films are already preparing. Try again shortly.');
    const task = (async () => {
      const temporary = output + '.tmp.mp4';
      try {
        const { stdout } = await run('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration', '-of', 'json', input], { timeout: 15000 });
        const duration = Number(JSON.parse(stdout).format?.duration);
        if (!Number.isFinite(duration) || duration <= 0 || duration > 300) throw new Error('Vega preview supports clips up to five minutes. Upload a shorter MP4 or WebM.');
        await run('ffmpeg', ['-nostdin', '-y', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', input,
          '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=960:540:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=960:540:(ow-iw)/2:(oh-ih)/2',
          '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'baseline', '-level:v', '3.1', '-pix_fmt', 'yuv420p', '-r', '24',
          '-b:v', '600k', '-maxrate', '800k', '-bufsize', '1600k', '-c:a', 'aac', '-b:a', '96k', '-ac', '2', '-ar', '48000',
          '-movflags', 'empty_moov+default_base_moof+frag_keyframe', '-fs', String(MAX_BYTES + 1), temporary], { timeout: 120000, maxBuffer: 1024 * 1024 });
        if ((await stat(temporary)).size > MAX_BYTES) throw new Error('Prepared clip is too large for the Vega preview. Use a shorter clip.');
        await rename(temporary, output);
        return output;
      } catch (error) {
        await rm(temporary, { force: true });
        if (error.code === 'ENOENT') throw new Error('Vega playback needs FFmpeg. Start the supplied Docker companion.');
        if (error.killed) throw new Error('Preparing this film took too long. Try a shorter clip.');
        if (error.code) throw new Error('This video could not be prepared. Use an MP4 or WebM with a video track.');
        throw error;
      }
    })();
    pending.set(output, task);
    try { return await task; } finally { pending.delete(output); }
  };
}

export function nativePaths(review, sessionDirectory, webDir) {
  if (!['demo', 'upload'].includes(review.source.kind)) throw new Error('For Vega, send a local video from the phone companion. Direct web links remain available in the browser app.');
  const input = review.source.kind === 'demo'
    ? path.join(webDir, 'media', 'sintel-trailer.mp4')
    : path.join(sessionDirectory, path.basename(review.source.file));
  return { input, output: path.join(sessionDirectory, `native-${review.source.id}.mp4`) };
}
