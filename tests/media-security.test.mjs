import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';

async function companion(options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cinema-media-security-'));
  const dataDir = path.join(root, 'data');
  const webDir = path.join(root, 'web');
  const app = createApp({ dataDir, webDir, ...options });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = async () => {
    app.locals.stopMaintenance();
    await new Promise((resolve) => server.close(resolve));
    rmSync(root, { recursive: true, force: true });
  };
  return { root, dataDir, webDir, base, close };
}

async function createSession(base) {
  const response = await fetch(base + '/api/sessions', { method: 'POST' });
  assert.equal(response.status, 201);
  return (await response.json()).token;
}

async function upload(base, token, bytes, filename = 'clip.mp4') {
  const form = new FormData();
  form.append('video', new Blob([bytes]), filename);
  return fetch(base + '/api/video', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
}

async function source(base, token, kind = 'demo') {
  return fetch(base + '/api/source', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(kind === 'demo' ? { kind } : { kind: 'url', url: 'https://example.com/film.mp4' }),
  });
}

function mediaFiles(dir) {
  return readdirSync(dir).filter((name) => /^(upload-|native-)/.test(name));
}

async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail('Timed out waiting for companion state');
}

test('source changes remove superseded uploads and stale media is pruned without a new session', async () => {
  const { root, dataDir, base, close } = await companion({ pruneIntervalMs: 25 });
  try {
    const token = await createSession(base);
    const dir = path.join(dataDir, token);
    for (let i = 0; i < 4; i++) {
      assert.equal((await upload(base, token, Buffer.alloc(4096, i))).status, 200);
      assert.equal(mediaFiles(dir).filter((name) => name.startsWith('upload-')).length, 1);
      assert.equal((await source(base, token, i % 2 ? 'url' : 'demo')).status, 200);
      assert.deepEqual(mediaFiles(dir), []);
    }
    assert.equal((await upload(base, token, Buffer.alloc(4096))).status, 200);
    const reviewPath = path.join(dir, 'review.json');
    const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
    review.startedAt = Date.now() - 25 * 60 * 60 * 1000;
    writeFileSync(reviewPath, JSON.stringify(review));
    await waitFor(() => !existsSync(dir));
    assert.equal((await fetch(base + '/api/session', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    assert.equal(existsSync(path.join(root, 'data', token)), false);
  } finally { await close(); }
});

test('session and instance quotas reject excess uploads without replacing active media', async () => {
  const { dataDir, base, close } = await companion({
    maxUploadBytes: 8 * 1024,
    maxSessionStorageBytes: 18 * 1024,
    maxInstanceStorageBytes: 24 * 1024,
  });
  try {
    const first = await createSession(base);
    const firstDir = path.join(dataDir, first);
    const active = await upload(base, first, Buffer.alloc(6 * 1024));
    assert.equal(active.status, 200);
    const activeId = (await active.json()).source.id;
    const deniedSession = await upload(base, first, Buffer.alloc(6 * 1024));
    assert.equal(deniedSession.status, 507);
    assert.match((await deniedSession.json()).error, /screening has reached its storage limit/);
    await waitFor(() => mediaFiles(firstDir).filter((name) => name.startsWith('upload-')).length === 1);
    assert.equal((await (await fetch(base + '/api/session', { headers: { Authorization: `Bearer ${first}` } })).json()).source.id, activeId);
    const second = await createSession(base);
    assert.equal((await upload(base, second, Buffer.alloc(6 * 1024))).status, 200);
    const third = await createSession(base);
    const deniedInstance = await upload(base, third, Buffer.alloc(6 * 1024));
    assert.equal(deniedInstance.status, 507);
    assert.match((await deniedInstance.json()).error, /companion has reached its storage limit/);
    await waitFor(() => mediaFiles(path.join(dataDir, third)).length === 0);
  } finally { await close(); }
});

test('one screening cannot overlap uploads or switch source during a stream', async () => {
  const { dataDir, base, close } = await companion();
  try {
    const token = await createSession(base);
    const boundary = 'cinema-stream-test';
    const start = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="clip.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);
    const end = Buffer.from(`\r\n--${boundary}--\r\n`);
    let finish;
    let finished = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.concat([start, Buffer.from([0])]));
        finish = () => {
          if (finished) return;
          finished = true;
          controller.enqueue(Buffer.alloc(1023)); controller.enqueue(end); controller.close();
        };
      },
    });
    const first = fetch(base + '/api/video', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body, duplex: 'half',
    });
    try {
      await waitFor(() => mediaFiles(path.join(dataDir, token)).some((name) => name.startsWith('upload-')));
      assert.equal((await upload(base, token, Buffer.alloc(1024))).status, 409);
      assert.equal((await source(base, token)).status, 409);
      finish();
      assert.equal((await first).status, 200);
      assert.equal(mediaFiles(path.join(dataDir, token)).filter((name) => name.startsWith('upload-')).length, 1);
      assert.equal((await source(base, token)).status, 200);
      assert.deepEqual(mediaFiles(path.join(dataDir, token)), []);
    } finally { finish(); await first; }
  } finally { await close(); }
});

test('expensive media routes enforce per-screening request limits', async () => {
  const { base, close } = await companion();
  try {
    const token = await createSession(base);
    for (let i = 0; i < 10; i++)
      assert.equal((await upload(base, token, Buffer.from('invalid'), 'invalid.txt')).status, 400);
    const blockedUpload = await upload(base, token, Buffer.from('invalid'), 'invalid.txt');
    assert.equal(blockedUpload.status, 429);
    assert.match((await blockedUpload.json()).error, /Too many video uploads/);
    const other = await createSession(base);
    assert.equal((await upload(base, other, Buffer.from('invalid'), 'invalid.txt')).status, 400);
    for (let i = 0; i < 120; i++)
      assert.equal((await fetch(`${base}/api/native/media?source=old`, { headers: { Authorization: `Bearer ${token}` } })).status, 409);
    const blockedNative = await fetch(`${base}/api/native/media?source=old`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(blockedNative.status, 429);
    assert.match((await blockedNative.json()).error, /Too many playback requests/);
  } finally { await close(); }
});

test('session creation is bounded before pruning and remains available within the limit', async () => {
  const { dataDir, base, close } = await companion();
  try {
    for (let i = 0; i < 10; i++)
      assert.equal((await fetch(`${base}/api/sessions`, { method: 'POST' })).status, 201);
    const blocked = await fetch(`${base}/api/sessions`, { method: 'POST' });
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /Too many screenings/);
    assert.equal(readdirSync(dataDir).length, 10);
  } finally { await close(); }
});

test('uploaded video playback is bounded per screening and another screening can still play', async () => {
  const { base, close } = await companion();
  try {
    const first = await createSession(base);
    const second = await createSession(base);
    for (const token of [first, second])
      assert.equal((await upload(base, token, Buffer.from('sample-video'))).status, 200);
    const headers = { Authorization: `Bearer ${first}` };
    const normal = await fetch(`${base}/api/video`, { headers });
    assert.equal(normal.status, 200);
    assert.equal(await normal.text(), 'sample-video');
    for (let i = 1; i < 120; i++) {
      const response = await fetch(`${base}/api/video`, { headers: { ...headers, Range: 'bytes=0-0' } });
      assert.equal(response.status, 206);
      await response.arrayBuffer();
    }
    const blocked = await fetch(`${base}/api/video`, { headers });
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /Too many playback requests/);
    const other = await fetch(`${base}/api/video`, { headers: { Authorization: `Bearer ${second}` } });
    assert.equal(other.status, 200);
    assert.equal(await other.text(), 'sample-video');
  } finally { await close(); }
});

test('upload paths stay inside their screening during expired-upload cleanup and playback', async () => {
  const { root, dataDir, base, close } = await companion();
  try {
    const token = await createSession(base);
    const outside = path.join(root, 'outside.mp4');
    writeFileSync(outside, 'outside-marker');
    const boundary = 'cinema-expired-upload';
    const start = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="../../outside.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);
    const end = Buffer.from(`\r\n--${boundary}--\r\n`);
    let finish;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.concat([start, Buffer.from('sample-video')]));
        finish = () => { controller.enqueue(end); controller.close(); };
      },
    });
    const pending = fetch(`${base}/api/video`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body, duplex: 'half',
    });
    const dir = path.join(dataDir, token);
    try {
      await waitFor(() => mediaFiles(dir).length === 1);
      const reviewPath = path.join(dir, 'review.json');
      const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
      review.startedAt = Date.now() - 25 * 60 * 60 * 1000;
      writeFileSync(reviewPath, JSON.stringify(review));
    } finally { finish(); }
    assert.equal((await pending).status, 401);
    await waitFor(() => mediaFiles(dir).length === 0);
    assert.equal(readFileSync(outside, 'utf8'), 'outside-marker');

    const fresh = await createSession(base);
    assert.equal((await upload(base, fresh, Buffer.from('safe-video'))).status, 200);
    const freshDir = path.join(dataDir, fresh);
    const reviewPath = path.join(freshDir, 'review.json');
    const review = JSON.parse(readFileSync(reviewPath, 'utf8'));
    review.source.file = '../../outside.mp4';
    writeFileSync(reviewPath, JSON.stringify(review));
    const rejected = await fetch(`${base}/api/video`, { headers: { Authorization: `Bearer ${fresh}` } });
    assert.equal(rejected.status, 400);
    assert.deepEqual(await rejected.json(), { error: 'Invalid uploaded video path.' });
    assert.equal(readFileSync(outside, 'utf8'), 'outside-marker');
  } finally { await close(); }
});

let ffmpeg = true;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { ffmpeg = false; }
test('native conversion rejects disguised local playlists and prepares real MP4 and WebM', {
  skip: !ffmpeg && 'Run in the Docker companion with FFmpeg installed.',
}, async () => {
  const { root, dataDir, base, close } = await companion();
  try {
    const token = await createSession(base);
    const dir = path.join(dataDir, token);
    const outside = path.join(root, 'outside.mp4');
    const webm = path.join(root, 'valid.webm');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=128x72:r=10', '-t', '1', '-c:v', 'libx264', outside]);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=128x72:r=10', '-t', '1', '-c:v', 'libvpx', webm]);
    const headers = { Authorization: `Bearer ${token}` };
    for (const disguised of [
      `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1.0,\n${outside}\n#EXT-X-ENDLIST\n`,
      `ffconcat version 1.0\nfile '${outside}'\n`,
    ]) {
      const uploaded = await upload(base, token, Buffer.from(disguised));
      assert.equal(uploaded.status, 200);
      const review = await uploaded.json();
      const prepared = await fetch(`${base}/api/native/media?source=${review.source.id}`, { headers });
      assert.equal(prepared.status, 400);
      assert.match((await prepared.json()).error, /MP4 or WebM/);
      assert.equal(mediaFiles(dir).filter((name) => name.startsWith('native-')).length, 0);
    }
    for (const [fixture, filename] of [[outside, 'valid.mp4'], [webm, 'valid.webm']]) {
      const uploaded = await upload(base, token, readFileSync(fixture), filename);
      assert.equal(uploaded.status, 200);
      const review = await uploaded.json();
      const prepared = await fetch(`${base}/api/native/media?source=${review.source.id}`, { headers });
      assert.equal(prepared.status, 200);
      const bytes = Buffer.from(await prepared.arrayBuffer());
      assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
      const native = path.join(dir, `native-${review.source.id}.mp4`);
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'json', native], { encoding: 'utf8' }));
      assert.equal(probe.streams[0].codec_name, 'h264');
      assert.equal(mediaFiles(dir).filter((name) => name.startsWith('native-')).length, 1);
      assert.equal((await source(base, token)).status, 200);
      assert.deepEqual(mediaFiles(dir), []);
    }
  } finally { await close(); }
});
