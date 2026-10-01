import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackHealth} from '../vega/src/playbackHealth.ts';

test('stalled playback reports once after eight seconds without progress', () => {
  const check = createPlaybackHealth();
  assert.equal(check(0, true, 0), false);
  assert.equal(check(6, true, 6000), false);
  assert.equal(check(6, true, 13999), false);
  assert.equal(check(6, true, 14000), true);
  assert.equal(check(6, true, 18000), false);
});

test('pause, ended playback, and a backward seek reset the stall window', () => {
  const check = createPlaybackHealth();
  assert.equal(check(40, true, 0), false);
  assert.equal(check(40, false, 60000), false);
  assert.equal(check(40, true, 61000), false);
  assert.equal(check(5, true, 65000), false);
  assert.equal(check(5, true, 72999), false);
  assert.equal(check(52, false, 90000), false);
});

test('normal progress never triggers recovery and can resume after a stall', () => {
  const check = createPlaybackHealth();
  for (let second = 0; second < 60; second++) {
    assert.equal(check(second, true, second * 1000), false);
  }
  assert.equal(check(59, true, 67000), true);
  assert.equal(check(60, true, 68000), false);
  assert.equal(check(61, true, 69000), false);
});
