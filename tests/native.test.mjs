import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync, readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/app.mjs';

test('native pairing is private and stale source stamps are rejected', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cinema-native-'));
  const server = createApp({dataDir: dir, webDir: dir, publicBase: 'http://localhost:4320'}).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/api/native/pair')).status, 401);
    assert.equal((await fetch(base + '/api/native/media?source=sintel-demo')).status, 401);
    const {token} = await (await fetch(base + '/api/sessions', {method: 'POST'})).json();
    const headers = {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'};
    const pairing = await fetch(base + '/api/native/pair', {headers});
    assert.equal(pairing.headers.get('cache-control'), 'no-store');
    const pair = await pairing.json();
    assert.equal(pair.url, `http://localhost:4320/?companion=1#token=${token}`);
    assert.match(pair.qr, /^data:image\/png;base64,/);
    assert.equal((await fetch(base + '/api/native/media?source=old', {headers})).status, 409);
    assert.equal((await fetch(base + '/api/stamps', {headers, method: 'POST', body: JSON.stringify({id: 'stale', kind: 'great', time: 1, note: '', sourceId: 'old'})})).status, 409);
    assert.equal((await (await fetch(base + '/api/session', {headers})).json()).stamps.length, 0);
  } finally {await new Promise(resolve => server.close(resolve)); rmSync(dir, {recursive: true, force: true});}
});

let ffmpeg = true;
try {execFileSync('ffmpeg', ['-version'], {stdio: 'ignore'});} catch {ffmpeg = false;}
test('real native media pipeline prepares muxed fragmented video, caches it, and rejects unsupported sources', {skip: !ffmpeg && 'Run this test in the Docker companion with FFmpeg installed.'}, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cinema-media-'));
  mkdirSync(path.join(dir, 'web/media'), {recursive: true});
  const fixture = path.join(dir, 'web/media/sintel-trailer.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '1.5', '-c:v', 'libx264', '-c:a', 'aac', fixture]);
  const server = createApp({dataDir: path.join(dir, 'data'), webDir: path.join(dir, 'web')}).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const {token} = await (await fetch(base + '/api/sessions', {method: 'POST'})).json();
    const headers = {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'};
    const responses = await Promise.all([0, 1].map(() => fetch(base + '/api/native/media?source=sintel-demo', {headers})));
    for (const response of responses) {
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
      assert.ok(bytes.includes(Buffer.from('moof')));
    }
    const file = path.join(dir, 'data', token, 'native-sintel-demo.mp4');
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {encoding: 'utf8'}));
    assert.equal(probe.streams[0].codec_name, 'h264');
    assert.equal(probe.streams[0].level, 31);
    assert.equal(probe.streams[1].codec_name, 'aac');
    assert.ok(Number(probe.format.duration) >= 1.4 && Number(probe.format.duration) < 1.7);
    assert.deepEqual(Buffer.from(await (await fetch(base + '/api/native/media?source=sintel-demo', {headers})).arrayBuffer()), readFileSync(file));
    const source = await (await fetch(base + '/api/source', {method: 'PUT', headers, body: JSON.stringify({kind: 'url', url: 'https://example.com/video.mp4'})})).json();
    const denied = await fetch(base + '/api/native/media?source=' + source.source.id, {headers});
    assert.equal(denied.status, 400);
    assert.match((await denied.json()).error, /send a local video/);
  } finally {await new Promise(resolve => server.close(resolve)); rmSync(dir, {recursive: true, force: true});}
});
