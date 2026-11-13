import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This is the stack currently documented for Vega 2.0. Moving to a different
// runtime requires an explicit SDK migration and validation on Vega.
const supported = { native: '0.83.0', react: '19.2.0' };

export function checkVegaStack({ native, react, babel, kepler, nativeCodegen, keplerCodegen }) {
  if (native.version !== supported.native)
    throw Error(`Vega requires React Native ${supported.native} for this SDK configuration; found ${native.version}`);
  if (react.version !== supported.react)
    throw Error(`Vega requires React ${supported.react} for this SDK configuration; found ${react.version}`);
  if (babel.version !== native.version)
    throw Error(`React Native ${native.version} and Babel preset ${babel.version} do not match`);
  if (kepler.dependencies?.['@react-native/codegen'] !== native.version)
    throw Error(`Kepler codegen ${kepler.dependencies?.['@react-native/codegen'] ?? 'missing'} does not match React Native ${native.version}`);
  for (const [owner, codegen] of [['React Native', nativeCodegen], ['Kepler', keplerCodegen]]) {
    if (codegen.name !== '@react-native/codegen' || codegen.version !== native.version)
      throw Error(`${owner} resolves codegen ${codegen.version} instead of ${native.version}`);
  }
}

export function checkInstalledVegaStack(root) {
  const read = (name) => JSON.parse(readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'));
  const readCodegen = (owner) => {
    const ownerPackage = path.join(root, 'node_modules', owner, 'package.json');
    const resolved = createRequire(ownerPackage).resolve('@react-native/codegen/package.json');
    return JSON.parse(readFileSync(resolved, 'utf8'));
  };
  checkVegaStack({
    native: read('react-native'),
    react: read('react'),
    babel: read('@react-native/babel-preset'),
    kepler: read('@amazon-devices/react-native-kepler'),
    nativeCodegen: readCodegen('react-native'),
    keplerCodegen: readCodegen('@amazon-devices/react-native-kepler'),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkInstalledVegaStack(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  console.log('Installed Vega React Native, React, Babel and Kepler codegen versions are aligned.');
}
