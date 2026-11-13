import assert from 'node:assert/strict';

const base = 'http://127.0.0.1:4318';
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    ready = (await fetch(base + '/')).ok;
    if (ready) break;
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 1000));
}
assert.ok(ready, 'Container server did not start');
assert.equal((await fetch(base + '/api/session')).status, 401);
const created = await fetch(base + '/api/sessions', {method: 'POST'});
assert.equal(created.status, 201);
const {token} = await created.json();
assert.match(token, /^[a-f0-9]{48}$/);
const headers = {Authorization: 'Bearer ' + token};
const contents = new Uint8Array([0, 1, 2, 3, 255]);
const form = new FormData();
form.append('video', new Blob([contents]), 'clip.mp4');
const uploaded = await fetch(base + '/api/video', {method: 'POST', headers, body: form});
assert.equal(uploaded.status, 200);
const retrieved = await fetch(base + '/api/video', {headers});
assert.equal(retrieved.status, 200);
assert.deepEqual(new Uint8Array(await retrieved.arrayBuffer()), contents);
console.log('Container served the app and accepted and returned an isolated upload');
