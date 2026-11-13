import assert from 'node:assert/strict';
import test from 'node:test';
import { checkVegaStack } from '../scripts/check-vega-stack.mjs';

const stack = () => ({
  native: { version: '0.83.0' },
  react: { version: '19.2.0' },
  babel: { version: '0.83.0' },
  kepler: { dependencies: { '@react-native/codegen': '0.83.0' } },
  nativeCodegen: { name: '@react-native/codegen', version: '0.83.0' },
  keplerCodegen: { name: '@react-native/codegen', version: '0.83.0' },
});

test('accepts the documented Vega stack', () => {
  assert.doesNotThrow(() => checkVegaStack(stack()));
});

test('rejects independent RN and Babel upgrades and a mismatched Kepler codegen', () => {
  for (const [change, error] of [
    [(s) => { s.native.version = '0.88.1'; }, /React Native 0\.83\.0/],
    [(s) => { s.babel.version = '0.88.1'; }, /Babel preset 0\.88\.1/],
    [(s) => { s.kepler.dependencies['@react-native/codegen'] = '0.88.1'; }, /Kepler codegen 0\.88\.1/],
    [(s) => { s.nativeCodegen.version = '0.88.1'; }, /React Native resolves codegen 0\.88\.1/],
    [(s) => { s.keplerCodegen.version = '0.88.1'; }, /Kepler resolves codegen 0\.88\.1/],
    [(s) => { s.react.version = '19.3.0'; }, /React 19\.2\.0/],
  ]) {
    const candidate = stack();
    change(candidate);
    assert.throws(() => checkVegaStack(candidate), error);
  }
});
