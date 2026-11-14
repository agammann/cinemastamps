import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const replacement = '1293:e=>{e.exports=require("toml")}';
const bundles = [
  {
    file: 'dist/index.js',
    original: '5639bc2b98555f64f27e3567e23f47577ce4c45b8389cbd45061f13d35fabc53',
    patched: 'a5f9adbad4cc9aa5361a6c783a572b527bbe204e882f37f1f3bb5025eed513e5',
    entry: '1293:(e,t,r)=>{var s=r(5546),n=r(2708);e.exports={parse:function(e){var t=s.parse(e.toString());return n.compile(t)}}}',
  },
  {
    file: 'dist/formatters/default.js',
    original: '7fd44302b7d02c3fcd4c9246a70022e7b0ee4a0174af5776b75a18c21e9223f5',
    patched: '1f89ecf598ef2bdb46dfe23ec0ead3c619b7063f09ee7fcd5a46d8fcdc100b64',
    entry: '1293:(e,t,r)=>{var n=r(5546),o=r(2708);e.exports={parse:function(e){var t=n.parse(e.toString());return o.compile(t)}}}',
  },
];
const digest = content => createHash('sha256').update(content).digest('hex');

// The published plugin embeds its own TOML parser. npm overrides alone cannot
// update it. Keep every lint rule and route both bundles to the patched parser.
export function secureKeplerToml(
  pluginDir = path.dirname(
    require.resolve('@amazon-devices/eslint-plugin-kepler/package.json'),
  ),
) {
  const manifest = JSON.parse(readFileSync(path.join(pluginDir, 'package.json')));
  if (manifest.version !== '0.1.16') {
    throw new Error('Kepler ESLint changed; review the TOML bridge before installing.');
  }
  // Validate every bundle before writing either one; unexpected upstream bytes
  // must fail installation, including a partially modified or corrupted bundle.
  const updates = bundles.map(bundle => {
    const target = path.join(pluginDir, bundle.file);
    const content = readFileSync(target, 'utf8');
    const hash = digest(content);
    if (hash === bundle.patched) return {target, content, changed: false};
    if (hash !== bundle.original || content.split(bundle.entry).length !== 2) {
      throw new Error(`Unrecognized Kepler ESLint bundle: ${bundle.file}`);
    }
    const patched = content.replace(bundle.entry, replacement);
    if (digest(patched) !== bundle.patched) {
      throw new Error(`Unexpected TOML bridge output: ${bundle.file}`);
    }
    return {target, content: patched, changed: true};
  });
  const pluginRequire = createRequire(path.join(pluginDir, 'package.json'));
  if (pluginRequire('toml/package.json').version !== '5.0.1') {
    throw new Error('The Kepler TOML bridge requires toml 5.0.1.');
  }
  for (const update of updates) {
    if (update.changed) writeFileSync(update.target, update.content);
  }
  return updates.filter(update => update.changed).length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Kepler TOML bridge verified (${secureKeplerToml()} bundles updated).`);
}
