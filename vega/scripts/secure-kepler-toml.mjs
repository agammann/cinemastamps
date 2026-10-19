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
    original: 'ca14e2a3a2002166a87c423fe7736b79a561fb87f3ee6012f1d18683371bda45',
    patched: 'f15be8094439b76042c979b92c5dc28324ec1e900f27f09f4697bae05f4f3885',
    entry: '1293:(e,t,r)=>{var s=r(5546),n=r(2708);e.exports={parse:function(e){var t=s.parse(e.toString());return n.compile(t)}}}',
  },
  {
    file: 'dist/formatters/default.js',
    original: '5a272d1cf26162b5bb4b9960d1e6490c0d0efcda83e1487d4742a8c064b434bb',
    patched: 'f74b9a341a89f8294b075b76ae820b52ae674a3935ce0a6789b3f8ec6e3e412d',
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
  if (manifest.version !== '0.1.15') {
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
  if (pluginRequire('toml/package.json').version !== '4.3.0') {
    throw new Error('The Kepler TOML bridge requires toml 4.3.0.');
  }
  for (const update of updates) {
    if (update.changed) writeFileSync(update.target, update.content);
  }
  return updates.filter(update => update.changed).length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Kepler TOML bridge verified (${secureKeplerToml()} bundles updated).`);
}
