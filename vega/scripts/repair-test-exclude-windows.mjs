import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const original = '2efc00ea24843849d9c0bf0967b3dc199f6a03fdbd4fc38e417a5317922cc6c5';
const patchedHash = 'b3999e9c62ae3eebf6239f130c9e60a64f3b3a557825cae277c0845995e9ccce';
const before = '        const dot = { dot: true };';
const after = "        if (path.sep !== '/') pathToCheck = pathToCheck.split(path.sep).join('/');\n\n" + before;
const outsideOriginal = 'e6dc6974dce0ed2f3a54827226d564fbb0483a091a07da9df0cfc88d98db4eaf';
const outsidePatchedHash = '715e9173812c47532154111d5c5b52e5acb47b3095b7f67e264baaf0381c0b3b';
const outsidePatched = "'use strict';\n\nconst path = require('path');\n\nmodule.exports = function(dir, filename) {\n    const relative = path.relative(dir, path.resolve(dir, filename));\n    return relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative);\n};\n";
const digest = content => createHash('sha256').update(content).digest('hex');

export function repairTestExcludeWindows(
  directory = path.dirname(require.resolve('test-exclude/package.json')),
) {
  if (JSON.parse(readFileSync(path.join(directory, 'package.json'))).version !== '6.0.0') {
    throw new Error('test-exclude changed; review its Windows path compatibility bridge.');
  }
  const updates = [
    {file: 'index.js', original, patchedHash,
      transform: source => {
        if (source.split(before).length !== 2) throw new Error('Unexpected test-exclude match site.');
        // minimatch treats backslashes as escapes, not Windows path separators.
        return source.replace(before, after);
      }},
    {file: 'is-outside-dir-win32.js', original: outsideOriginal, patchedHash: outsidePatchedHash,
      // Resolve containment using native paths instead of a glob with backslashes.
      transform: () => outsidePatched},
  ].map(update => {
    const target = path.join(directory, update.file);
    const source = readFileSync(target, 'utf8');
    if (digest(source) === update.patchedHash) return {target, changed: false};
    if (digest(source) !== update.original) throw new Error('Unrecognized test-exclude implementation.');
    const content = update.transform(source);
    if (digest(content) !== update.patchedHash) throw new Error('Unexpected test-exclude compatibility output.');
    return {target, content, changed: true};
  });
  for (const update of updates) if (update.changed) writeFileSync(update.target, update.content);
  return updates.filter(update => update.changed).length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('test-exclude Windows compatibility verified (' + repairTestExcludeWindows() + ' files updated).');
}
