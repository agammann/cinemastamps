import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionFor} from '../vega/src/api.ts';

test('retrying the same companion preserves the restored review session', () => {
  const saved = {base: 'http://10.0.2.2:8091', token: 'saved-review'};
  assert.deepEqual(connectionFor('  http://10.0.2.2:8091/ ', saved), saved);
  assert.deepEqual(connectionFor(saved.base, null, saved.token), saved);
  assert.equal(connectionFor(saved.base, saved, '').token, '');
});

test('a different companion starts a separate session without reusing credentials', () => {
  const saved = {base: 'http://10.0.2.2:8091', token: 'saved-review'};
  for (const base of ['http://10.0.2.2:8092', 'http://192.168.1.20:8091', 'https://10.0.2.2:8091']) {
    assert.deepEqual(connectionFor(base, saved), {base, token: ''});
  }
  assert.equal(saved.token, 'saved-review');
});

test('invalid companion addresses are rejected before a connection is made', () => {
  for (const base of ['', 'localhost', 'file:///tmp/app', 'http://host/path', 'http://host?query=1']) {
    assert.throws(() => connectionFor(base, null), /Enter a service address/);
  }
});
