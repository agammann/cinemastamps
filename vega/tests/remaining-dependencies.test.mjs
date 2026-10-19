import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {secureArgparseCompat} from '../scripts/secure-argparse-compat.mjs';
import {securePrettierBraces} from '../scripts/secure-prettier-braces.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const braces = require('braces');
const unsafe = error => error instanceof SyntaxError && /safe traversal limits/.test(error.message);
const cli = (file, args = [], options = {}) => {
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: root, encoding: 'utf8', timeout: 10000, ...options,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result;
};

test('every installed consumer resolves bounded braces and sprintf-free argparse', () => {
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json')));
  assert.equal(Object.keys(lock.packages).some(location => location.endsWith('/sprintf-js')), false);
  for (const [location, metadata] of Object.entries(lock.packages)) {
    const consumer = createRequire(path.join(root, location, 'package.json'));
    if (metadata.dependencies?.braces) {
      assert.equal(consumer('braces'), braces, `${location} must share the bounded parser`);
      assert.equal(consumer('braces/package.json').name, '@cinemastamps/braces');
    }
    if (metadata.dependencies?.argparse) {
      assert.equal(consumer('argparse/package.json').version, '2.0.1', location);
    }
  }
  assert.throws(() => require.resolve('sprintf-js'), {code: 'MODULE_NOT_FOUND'});
});

test('all string and AST entry points bound nesting, cycles, and traversal work', {timeout: 10000}, () => {
  const verify = () => {
  for (const pattern of [
    '{'.repeat(65) + 'a,b' + '}'.repeat(65),
    '('.repeat(65) + 'a' + ')'.repeat(65),
    '{('.repeat(33) + 'a,b' + ')}'.repeat(33),
    '{'.repeat(4000) + 'a,b' + '}'.repeat(4000),
  ]) {
    for (const operation of [braces, braces.create, braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => operation(pattern, {maxLength: Infinity}), unsafe);
    }
  }
  const deepAst = () => {
    const ast = {type: 'root', nodes: []};
    let node = ast;
    for (let i = 0; i < 65; i++) {
      const child = {type: 'paren', nodes: [], parent: node};
      node.nodes.push(child);
      node = child;
    }
    node.nodes.push({type: 'text', value: 'film'});
    return ast;
  };
  const cycle = () => {
    const ast = {type: 'root', nodes: []};
    ast.nodes.push(ast);
    return ast;
  };
  for (const method of ['compile', 'expand', 'stringify']) {
    for (const operation of [braces[method], require(`braces/lib/${method}`)]) {
      assert.throws(() => operation(deepAst()), unsafe);
      assert.throws(() => operation(cycle()), unsafe);
      assert.throws(() => operation({type: 'root', nodes: Array(200000).fill({type: 'text', value: 'a'})}), unsafe);
    }
  }
  const paren = {type: 'paren', nodes: []};
  paren.parent = paren;
  assert.throws(() => braces.expand({type: 'root', nodes: [paren]}), unsafe);
  const array = [];
  array.push(array);
  assert.throws(() => require('braces/lib/utils').flatten(array), unsafe);
  };
  // A regression in parent-cycle handling must fail the test, not hang the runner.
  const result = cli('-e', [`const assert = require('node:assert/strict');
    const braces = require('braces'); const unsafe = ${unsafe}; (${verify})();`], {timeout: 5000});
  assert.equal(result.status, 0, result.stderr);
});

test('bounded braces preserves ordinary syntax, options, and real glob consumers', () => {
  for (const [pattern, options, expected] of [
    ['src/{film,review}.{ts,tsx}', {}, ['src/film.ts', 'src/film.tsx', 'src/review.ts', 'src/review.tsx']],
    ['{1..5..2}', {}, ['1', '3', '5']],
    ['{a..c}', {}, ['a', 'b', 'c']],
    ['\\{a,b\\}', {}, ['{a,b}']],
    ['\\{a,b\\}', {keepEscaping: true}, ['\\{a,b\\}']],
    ['"{a,b}"', {keepQuotes: true}, ['"{a,b}"']],
    ['{,a,a}', {noempty: true, nodupes: true}, ['a']],
    ['({a,b}', {}, ['(a', '(b']],
    ['{a,b', {}, ['{a,b']],
    ['${a,b}', {}, ['${a,b}']],
  ]) {
    assert.deepEqual(braces.expand(pattern, options), expected, pattern);
    assert.deepEqual(braces(pattern, {...options, expand: true}), expected, pattern);
  }
  for (const pattern of ['{'.repeat(64) + 'a' + '}'.repeat(64), '('.repeat(64) + 'a' + ')'.repeat(64)]) {
    assert.equal(braces.stringify(braces.parse(pattern)), pattern);
    assert.doesNotThrow(() => braces.compile(pattern));
    assert.deepEqual(braces.expand(pattern), [pattern]);
  }
  const literal = '{'.repeat(200) + 'film' + '}'.repeat(200);
  const escapedLiteral = '\\{'.repeat(200) + 'film' + '\\}'.repeat(200);
  for (const pattern of [`"${literal}"`, escapedLiteral]) {
    assert.deepEqual(braces.expand(pattern), [literal]);
    assert.equal(braces.stringify(braces.parse(pattern)), literal);
  }
  assert.equal(braces.compile('x{a,b}'), 'x(a|b)');
  assert.equal(braces.compile(braces.parse('x{a,b}')), 'x(a|b)');
  assert.deepEqual(braces(['x{a,b}', 'y{1..2}'], {expand: true}), ['xa', 'xb', 'y1', 'y2']);
  assert.throws(() => braces.parse(3), TypeError);
  assert.throws(() => braces.parse('films', {maxLength: 2}), SyntaxError);
  assert.throws(() => braces.expand('{1..5}', {rangeLimit: 3}), RangeError);
  assert.deepEqual(braces.expand('{1..5}', {rangeLimit: false}), ['1', '2', '3', '4', '5']);
  const match = require('micromatch');
  assert.deepEqual(match.braces('src/{film,review}.ts'), ['src/(film|review).ts']);
  assert.deepEqual(match.braceExpand('src/{film,review}.ts'), ['src/film.ts', 'src/review.ts']);
  assert.ok(match.parse('src/{film,review}.ts')[0].output.includes('film'));
  assert.ok(require('fast-glob').sync('src/**/*.{ts,tsx}', {cwd: root}).includes('src/App.tsx'));
  const nested = '{'.repeat(65) + 'a,b' + '}'.repeat(65);
  for (const operation of [match.parse, match.braces, match.braceExpand]) assert.throws(() => operation(nested), unsafe);
  assert.throws(() => require('fast-glob').sync(nested, {cwd: root}), unsafe);
});

test('both Prettier bundles share braces and installation refuses unknown bytes', () => {
  const directory = path.dirname(require.resolve('prettier/package.json'));
  assert.equal(securePrettierBraces(), 0);
  const fixture = mkdtempSync(path.join(root, '.prettier-security-'));
  try {
    writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({version: '2.8.8'}));
    for (const file of ['index.js', 'cli.js']) {
      const source = readFileSync(path.join(directory, file), 'utf8');
      const factory = source.match(/"node_modules\/braces\/index\.js"\(exports2, module2\) \{\s*(module2.exports = require\("braces"\);)\s*\}/);
      assert.ok(factory, `${file} must bridge its embedded parser`);
      const module = {exports: {}};
      vm.runInNewContext(`(function(module2, require) {${factory[1]}})(module, require)`, {module, require}, {timeout: 1000});
      assert.equal(module.exports, braces);
      writeFileSync(path.join(fixture, file), source);
    }
    assert.equal(securePrettierBraces(fixture), 0);
    const main = readFileSync(path.join(fixture, 'index.js'), 'utf8');
    writeFileSync(path.join(fixture, 'cli.js'), readFileSync(path.join(fixture, 'cli.js'), 'utf8') + '\nchanged');
    assert.throws(() => securePrettierBraces(fixture), /Unrecognized Prettier bundle/);
    assert.equal(readFileSync(path.join(fixture, 'index.js'), 'utf8'), main);
    writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({version: '2.8.9'}));
    assert.throws(() => securePrettierBraces(fixture), /Prettier changed/);
  } finally {
    rmSync(fixture, {recursive: true, force: true});
  }
});

test('Prettier library and CLI still format and discover brace globs', () => {
  const prettier = require('prettier');
  assert.equal(prettier.format('const film=1', {parser: 'typescript'}), 'const film = 1;\n');
  assert.equal(prettier.getFileInfo.sync(path.join(root, 'src/App.tsx')).inferredParser, 'typescript');
  const fixture = mkdtempSync(path.join(root, '.formatter-security-'));
  try {
    writeFileSync(path.join(fixture, 'film.ts'), 'const film = 1;\n');
    writeFileSync(path.join(fixture, 'tile.tsx'), 'const tile = <div />;\n');
    const bin = require.resolve('prettier/bin-prettier.js');
    const result = cli(bin, ['--no-config', '--list-different', '*.{ts,tsx}'], {cwd: fixture});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    const rejected = cli(bin, ['--no-config', '--list-different', '{'.repeat(65) + 'a,b' + '}'.repeat(65)], {cwd: fixture});
    assert.equal(rejected.status, 2, rejected.stderr);
    assert.match(rejected.stderr, /safe traversal limits/);
    assert.doesNotMatch(rejected.stderr, /Maximum call stack/);
  } finally {
    rmSync(fixture, {recursive: true, force: true});
  }
});

test('argparse compatibility repairs are repeatable and refuse changed implementations', () => {
  const argparse = require('argparse');
  assert.equal(Object.getOwnPropertyDescriptor(argparse, 'Const').enumerable, true);
  assert.equal({...argparse}.Const.REMAINDER, '...');
  assert.equal(secureArgparseCompat(), 0);
  const patched = readFileSync(require.resolve('argparse'), 'utf8');
  const original = patched
    .replace('        this.add_help = add_help\n        this.version = version\n', '        this.add_help = add_help\n')
    .replace('    enumerable: true\n})\n// end\n', '    enumerable: false\n})\n// end\n');
  assert.notEqual(original, patched);
  const fixture = mkdtempSync(path.join(root, '.argparse-security-'));
  const target = path.join(fixture, 'argparse.js');
  try {
    writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({version: '2.0.1'}));
    writeFileSync(target, original);
    assert.equal(secureArgparseCompat(fixture), 1);
    assert.equal(readFileSync(target, 'utf8'), patched);
    assert.equal(secureArgparseCompat(fixture), 0);
    const changed = original + '\nchanged';
    writeFileSync(target, changed);
    assert.throws(() => secureArgparseCompat(fixture), /Unrecognized argparse implementation/);
    assert.equal(readFileSync(target, 'utf8'), changed);
    writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({version: '2.0.2'}));
    assert.throws(() => secureArgparseCompat(fixture), /Argparse changed/);
  } finally {
    rmSync(fixture, {recursive: true, force: true});
  }
});

test('Rushstack and API Extractor retain command parsing, help, and error exits', async () => {
  const {DynamicCommandLineParser, DynamicCommandLineAction} = require('@rushstack/ts-command-line');
  const setup = () => {
    const parser = new DynamicCommandLineParser({toolFilename: 'films', toolDescription: 'Review films'});
    const action = new DynamicCommandLineAction({actionName: 'review', summary: 'Review', documentation: 'Review films'});
    parser.addAction(action);
    const film = action.defineStringParameter({parameterLongName: '--film', argumentName: 'TITLE', description: 'Film', required: true});
    const count = action.defineIntegerParameter({parameterLongName: '--count', argumentName: 'COUNT', description: 'Count', defaultValue: 2});
    const tags = action.defineStringListParameter({parameterLongName: '--tag', argumentName: 'TAG', description: 'Tag'});
    const rest = action.defineCommandLineRemainder({description: 'Extra arguments'});
    return {parser, action, film, count, tags, rest};
  };
  const command = setup();
  await command.parser.executeWithoutErrorHandlingAsync(['review', '--film', 'Arrival', '--tag', 'quiet', '--', '--raw', 'two']);
  assert.equal(command.film.value, 'Arrival');
  assert.equal(command.count.value, 2);
  assert.deepEqual(command.tags.values, ['quiet']);
  assert.deepEqual(command.rest.values, ['--', '--raw', 'two']);
  assert.match(command.action.renderHelpText(), /--film TITLE/);
  await assert.rejects(setup().parser.executeWithoutErrorHandlingAsync(['review']), error => error.exitCode === 2 && /required/.test(error.message));
  await assert.rejects(setup().parser.executeWithoutErrorHandlingAsync(['review', '--film', 'Arrival', '--count', 'bad']), error => error.exitCode === 2 && /--count/.test(error.message));
  const bin = require.resolve('@microsoft/api-extractor/bin/api-extractor');
  for (const args of [['--help'], ['run', '--help']]) {
    const result = cli(bin, args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /api-extractor|--config/);
  }
  const invalid = cli(bin, ['--unknown-cinemastamps-option']);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /unrecognized arguments/);
});

test('js-yaml retains stdin defaults, options, help, version, and parse diagnostics', () => {
  const bin = require.resolve('js-yaml/bin/js-yaml.js');
  for (const args of [[], ['-j'], ['--compact']]) {
    const result = cli(bin, args, {input: 'film: Arrival\ncount: 2\n'});
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {film: 'Arrival', count: 2});
  }
  for (const [args, expected] of [[['--help'], /usage: js-yaml/], [['--version'], /3\.15\.2/]]) {
    const result = cli(bin, args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, expected);
  }
  const compact = cli(bin, ['--compact'], {input: 'film: [\n'});
  assert.equal(compact.status, 1);
  assert.match(compact.stderr, /unexpected end|flow collection/);
  assert.doesNotMatch(compact.stderr, /at .*\.js:/);
  const trace = cli(bin, ['--trace'], {input: 'film: [\n'});
  assert.equal(trace.status, 1);
  assert.match(trace.stderr, /YAMLException/);
  assert.match(trace.stderr, /at /);
});
