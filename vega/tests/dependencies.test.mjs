import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {secureKeplerToml} from '../scripts/secure-kepler-toml.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const pluginDir = path.dirname(require.resolve('@amazon-devices/eslint-plugin-kepler/package.json'));
const pollution = '[a.b]\ny = 1\n[a.b.y.__proto__.__proto__]\ncinemastampsPolluted = "yes"\n';
const nesting = 'value=' + '['.repeat(3000) + '1' + ']'.repeat(3000);
const validManifest = readFileSync(path.join(root, 'manifest.toml'), 'utf8');
const privilege = 'com.amazon.device-messaging.privilege.access';

test('Kepler manifest lint still enforces privileges and rejects unsafe TOML', () => {
  const fixture = mkdtempSync(path.join(root, '.manifest-security-'));
  const check = manifest => {
    writeFileSync(path.join(fixture, 'manifest.toml'), manifest);
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
      import {createRequire} from 'node:module';
      const require = createRequire(${JSON.stringify(path.join(root, 'package.json'))});
      const plugin = require('@amazon-devices/eslint-plugin-kepler');
      const rule = Object.values(plugin.rules).find(rule => rule.meta?.docs?.description ===
        'Checks that APIs requiring permissions have proper manifest.toml entries');
      if (!rule) throw new Error('Kepler privilege rule is missing');
      const linter = new (require('eslint').Linter)();
      linter.defineRule('privileges', rule);
      const messages = linter.verify("import messaging from '@amazon-devices/kepler-amazon-device-messaging';", {
        parserOptions: {ecmaVersion: 2022, sourceType: 'module'}, rules: {privileges: 'error'},
      });
      console.log(JSON.stringify({messages: messages.map(message => message.message),
        polluted: Object.prototype.cinemastampsPolluted ?? null}));
    `], {cwd: fixture, encoding: 'utf8', timeout: 5000});
    return JSON.parse(output.trim());
  };
  try {
    assert.equal(check(`[[needs.privilege]]\nid = "${privilege}"`).messages.length, 0);
    for (const manifest of [validManifest, '[invalid', pollution, nesting]) {
      const result = check(manifest);
      assert.equal(result.messages.length, 1);
      assert.match(result.messages[0], /requires the \[\[needs.privilege\]\]/);
      assert.equal(result.polluted, null);
    }
  } finally {
    rmSync(fixture, {recursive: true, force: true});
  }
});

test('both embedded TOML entry points use the patched parser', () => {
  const toml = require('toml');
  const expected = JSON.parse(JSON.stringify(toml.parse(validManifest)));
  assert.equal(expected.package.id, 'com.agammann.cinemastamps.native');
  assert.equal(expected.needs.module.length, 6);
  for (const bundle of ['dist/index.js', 'dist/formatters/default.js']) {
    const source = readFileSync(path.join(pluginDir, bundle), 'utf8');
    const entry = source.match(/1293:(e=>\{e.exports=require\("toml"\)\})/);
    assert.ok(entry, `${bundle} must bridge its parser`);
    const module = {exports: {}};
    vm.runInNewContext(`(${entry[1]})(module)`, {module, require}, {timeout: 1000});
    assert.equal(module.exports, toml);
    assert.deepEqual(JSON.parse(JSON.stringify(module.exports.parse(validManifest))), expected);
    assert.throws(() => module.exports.parse(pollution));
    assert.equal(Object.prototype.cinemastampsPolluted, undefined);
    assert.throws(() => module.exports.parse(nesting), error => !(error instanceof RangeError));
  }
});

test('the install bridge is repeatable and refuses changed bundles before writing', () => {
  assert.equal(secureKeplerToml(), 0);
  const fixture = mkdtempSync(path.join(root, '.bridge-security-'));
  try {
    writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({version: '0.1.15'}));
    mkdirSync(path.join(fixture, 'dist/formatters'), {recursive: true});
    const main = readFileSync(path.join(pluginDir, 'dist/index.js'), 'utf8');
    const formatter = readFileSync(path.join(pluginDir, 'dist/formatters/default.js'), 'utf8');
    const original = main.replace('1293:e=>{e.exports=require("toml")}',
      '1293:(e,t,r)=>{var s=r(5546),n=r(2708);e.exports={parse:function(e){var t=s.parse(e.toString());return n.compile(t)}}}');
    writeFileSync(path.join(fixture, 'dist/index.js'), original);
    writeFileSync(path.join(fixture, 'dist/formatters/default.js'), formatter + '\nchanged');
    assert.throws(() => secureKeplerToml(fixture), /Unrecognized Kepler ESLint bundle/);
    assert.equal(readFileSync(path.join(fixture, 'dist/index.js'), 'utf8'), original);
    writeFileSync(path.join(fixture, 'dist/formatters/default.js'), formatter);
    assert.equal(secureKeplerToml(fixture), 1);
    assert.equal(secureKeplerToml(fixture), 0);
    writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({version: '0.1.16'}));
    assert.throws(() => secureKeplerToml(fixture), /Kepler ESLint changed/);
  } finally {
    rmSync(fixture, {recursive: true, force: true});
  }
});

test('patched dependency branches retain caller APIs and reject security triggers', () => {
  const uuid = require('uuid');
  assert.ok(uuid.validate(uuid.v4()));
  const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  for (const create of [uuid.v3, uuid.v5]) {
    assert.throws(() => create('film', namespace, new Uint8Array(8), 4), RangeError);
    assert.equal(create('film', namespace, new Uint8Array(16), 0).length, 16);
  }
  assert.throws(() => uuid.v6({}, new Uint8Array(8), 4), RangeError);
  const merge = require('lodash/merge');
  assert.deepEqual(merge({}, {kepler: {targets: ['tv']}}, {kepler: {appName: 'Cinemastamps'}}),
    {kepler: {targets: ['tv'], appName: 'Cinemastamps'}});
  assert.throws(() => require('lodash').template('', {imports: {'bad,key': 1}}));
  const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json')));
  const allowedVersions = new Set(['8.0.7', '9.0.9', '10.2.6']);
  for (const [location, metadata] of Object.entries(lock.packages)) {
    if (location.endsWith('/minimatch')) {
      assert.ok(allowedVersions.has(metadata.version), `${location}: unsafe locked version`);
    }
    if (!metadata.dependencies?.minimatch) continue;
    const consumerManifest = path.join(root, location, 'package.json');
    const consumerRequire = createRequire(consumerManifest);
    const dependency = consumerRequire('minimatch');
    let directory = path.dirname(consumerRequire.resolve('minimatch'));
    let installed;
    while (directory !== path.dirname(directory)) {
      try {
        const metadata = JSON.parse(readFileSync(path.join(directory, 'package.json')));
        if (metadata.name === 'minimatch') { installed = metadata.version; break; }
      } catch {}
      directory = path.dirname(directory);
    }
    assert.ok(allowedVersions.has(installed), `${location}: unsafe installed version ${installed}`);
    const requested = metadata.dependencies.minimatch;
    const expected = /^[~^]?10\./.test(requested) ? '10.2.6'
      : /^[~^]?9\./.test(requested) ? '9.0.9' : '8.0.7';
    assert.equal(installed, expected, `${location}: preserve the consumer's API branch`);
    const minimatch = typeof dependency === 'function' ? dependency : dependency.minimatch;
    assert.equal(minimatch('film.ts', '**/*.ts'), true);
    assert.equal(minimatch('src/film.tsx', '**/*.{ts,tsx}'), true);
    assert.equal(dependency.defaults({nocase: true})('FILM.TS', '*.ts'), true);
    assert.equal(dependency.filter('*.ts')('film.ts'), true);
    assert.deepEqual(dependency.braceExpand('film.{ts,tsx}'), ['film.ts', 'film.tsx']);
    assert.equal(dependency.makeRe('@amazon-devices/*').test('@amazon-devices/library'), true);
    assert.equal(new dependency.Minimatch('**/*.tsx').match('src/App.tsx'), true);
    assert.equal(minimatch('abab', '*(*(*(a|b)))'), true);
    const child = execFileSync(process.execPath, ['-e', `
      const {createRequire} = require('node:module');
      const requireFrom = createRequire(${JSON.stringify(consumerManifest)});
      const dependency = requireFrom('minimatch');
      const match = typeof dependency === 'function' ? dependency : dependency.minimatch;
      if (match('a'.repeat(50), '*'.repeat(34) + 'z')) process.exit(1);
      if (match('a'.repeat(30) + 'c', '*(*(*(a|b)))')) process.exit(1);
    `], {encoding: 'utf8', timeout: 5000});
    assert.equal(child, '');
  }
  assert.ok(require('glob').sync('src/**/*.tsx', {cwd: root}).includes('src/App.tsx'));
  const matchTasks = require('npm-run-all/lib/match-tasks');
  assert.deepEqual(matchTasks(['build:release', 'test'], ['build:*']), ['build:release']);
  assert.throws(() => matchTasks(['a'.repeat(18) + 'z'], ['*(*(*(a|b)))']), /Task not found/);
  const TestExclude = require('test-exclude');
  assert.equal(new TestExclude({cwd: root, include: ['src/**/*.tsx'], exclude: []})
    .shouldInstrument(path.join(root, 'src/App.tsx')), true);
  assert.equal(new TestExclude({relativePath: false, extension: [], include: ['*(*(*(a|b)))'], exclude: []})
    .shouldInstrument('a'.repeat(18) + 'z'), false);
});
