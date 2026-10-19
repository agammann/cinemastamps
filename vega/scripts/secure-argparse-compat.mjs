import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const original = '2e73e7a3167ba840dbcf41feeafc3544a3e2b39220b5e997133c519861febf16';
const patchedHash = '6fcece05b9d4d66d8424cad487c3791e5260a4326befc2c09cfdb4245b0caad1';
const replacements = [
  ['        this.add_help = add_help\n', '        this.add_help = add_help\n        this.version = version\n'],
  ['    enumerable: false\n})\n// end\n', '    enumerable: true\n})\n// end\n'],
];
const digest = content => createHash('sha256').update(content).digest('hex');

export function secureArgparseCompat(
  directory = path.dirname(require.resolve('argparse/package.json')),
) {
  if (JSON.parse(readFileSync(path.join(directory, 'package.json'))).version !== '2.0.1') {
    throw new Error('Argparse changed; review the legacy CLI compatibility bridge.');
  }
  const target = path.join(directory, 'argparse.js');
  const source = readFileSync(target, 'utf8');
  if (digest(source) === patchedHash) return 0;
  if (digest(source) !== original || replacements.some(([before]) => source.split(before).length !== 2)) {
    throw new Error('Unrecognized argparse implementation.');
  }
  let patched = source;
  for (const [before, after] of replacements) patched = patched.replace(before, after);
  // Argparse 2 removes sprintf. Retain its advertised legacy version option and
  // expose Const to the older TypeScript import-star used by Rushstack.
  if (digest(patched) !== patchedHash) throw new Error('Unexpected argparse compatibility output.');
  writeFileSync(target, patched);
  return 1;
}

export function secureRushstackCompat(
  directory = path.dirname(require.resolve('@rushstack/ts-command-line/package.json')),
) {
  if (JSON.parse(readFileSync(path.join(directory, 'package.json'))).version !== '4.22.0') {
    throw new Error('Rushstack changed; review its argparse compatibility bridge.');
  }
  // Use the current writable method so native argparse error/help paths still
  // invoke Rushstack's existing post-parse usage callback. Its shared option
  // builder must omit absent values instead of passing unsupported flag fields.
  const boundary = '        const argumentParser = this._getArgumentParser();\n        let argumentGroup;';
  const updates = [
    {file: 'lib/providers/CommandLineParser.js',
      original: '3d68ac16bd3a326ebcb77b247bb776d0ac2cdb95d450dc0943101b9e1845491d',
      patched: '96a691ca2a495120090a59c5218cb4a24bb8cf3b42f1e9045ed518039b076021',
      before: 'argumentParser.formatUsage', after: 'argumentParser.format_usage', count: 2},
    {file: 'lib/providers/CommandLineParameterProvider.js',
      original: '0a34a882ae0541ad72165a7d261e19c91b84d12de5818e0b14f192a92f21e1a1',
      patched: 'c1edae6c2faf021454d99eca759582c43397538c570360a3f0eb447790baf107', before: boundary, count: 1,
      after: '        for (const key of Object.keys(argparseOptions)) {\n            if (argparseOptions[key] === undefined) delete argparseOptions[key];\n        }\n' + boundary},
  ].map(bundle => {
    const target = path.join(directory, bundle.file);
    const content = readFileSync(target, 'utf8');
    if (digest(content) === bundle.patched) return {target, content, changed: false};
    if (digest(content) !== bundle.original || content.split(bundle.before).length !== bundle.count + 1) {
      throw new Error(`Unrecognized Rushstack implementation: ${bundle.file}`);
    }
    const patched = content.replaceAll(bundle.before, bundle.after);
    if (digest(patched) !== bundle.patched) throw new Error('Unexpected Rushstack compatibility output.');
    return {target, content: patched, changed: true};
  });
  for (const update of updates) if (update.changed) writeFileSync(update.target, update.content);
  return updates.filter(update => update.changed).length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Argparse compatibility bridge verified (${secureArgparseCompat() + secureRushstackCompat()} files updated).`);
}
