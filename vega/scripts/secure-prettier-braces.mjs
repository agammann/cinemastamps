import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const bundles = [
  {file: 'index.js', original: 'e64e063bfc2ecd44d431fda461fc1e67d1515b4163a1a1b08ba64ecde25cbf10',
    patched: '9901e3de773293d1030dac1156abae222efceb09af0d408237994376c8904b35'},
  {file: 'cli.js', original: 'dbd8bcb36f076aae76c323797adfd9cadfc3a4a097e637324465e800e786af9c',
    patched: 'b9f92c7eb4bb38a9e8372dc8dd924673376b7d072e454bfda84686e23dcd2206'},
];
const digest = content => createHash('sha256').update(content).digest('hex');
const factory = /var require_braces = (__commonJS\d*)\(\{\n  "node_modules\/braces\/index\.js"\(exports2, module2\) \{[\s\S]*?\n  \}\n\}\);/g;

export function securePrettierBraces(
  directory = path.dirname(require.resolve('prettier/package.json')),
) {
  if (JSON.parse(readFileSync(path.join(directory, 'package.json'))).version !== '2.8.8') {
    throw new Error('Prettier changed; review the braces bridge before installing.');
  }
  const local = createRequire(path.join(directory, 'package.json'))('braces/package.json');
  if (local.name !== '@cinemastamps/braces' || local.version !== '3.0.3-cinemastamps.1') {
    throw new Error('Prettier requires the repository-local bounded braces implementation.');
  }
  // Both library plugin discovery and CLI globbing embed a separate parser.
  // Validate both bundles before writing either, including repeat installations.
  const updates = bundles.map(bundle => {
    const target = path.join(directory, bundle.file);
    const content = readFileSync(target, 'utf8');
    const hash = digest(content);
    if (hash === bundle.patched) return {target, content, changed: false};
    if (hash !== bundle.original || [...content.matchAll(factory)].length !== 1) {
      throw new Error(`Unrecognized Prettier bundle: ${bundle.file}`);
    }
    const patched = content.replace(factory, (_, helper) =>
      `var require_braces = ${helper}({\n  "node_modules/braces/index.js"(exports2, module2) {\n    module2.exports = require("braces");\n  }\n});`);
    if (digest(patched) !== bundle.patched) throw new Error(`Unexpected braces bridge output: ${bundle.file}`);
    return {target, content: patched, changed: true};
  });
  for (const update of updates) if (update.changed) writeFileSync(update.target, update.content);
  return updates.filter(update => update.changed).length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Prettier braces bridge verified (${securePrettierBraces()} bundles updated).`);
}
