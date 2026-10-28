/* The type definitions the app writes (TypeScript, Python, Go, C#, Rust, Java) are given to the real compilers: they must compile, and for
   Python the module must also import (a class that names one defined further down fails only when it runs).

   Documents: a realistic list of records, the first list of every test fixture, and one record whose keys are all the awkward names
   (hostile-keys.js) and every reserved word of the languages, so the way a key becomes a name is tried against each compiler.

   A language whose compiler is not installed is skipped with a note, unless REQUIRE_COMPILERS=1 (the CI job sets it).
   Needs: node; typescript (npm, a dev dependency); python; dotnet; go; cargo (the first run downloads serde); javac.

   Run:  node tests/compile/type-compile.js [language ...]        e.g.  node tests/compile/type-compile.js typescript python */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const { load } = require('../unit/harness');
const { fixtureLists } = require('../unit/test-utils');
const { HOSTILE_KEYS } = require('../hostile-keys');
load(['shared-helpers', 'type-code-generator']);
const generator = global.Structra.typeCodeGenerator;

const REQUIRE = process.env.REQUIRE_COMPILERS === '1';
const WANTED = process.argv.slice(2);

const RESERVED = [
  'class', 'type', 'default', 'int', 'float', 'string', 'return', 'async', 'await', 'fn', 'let', 'match', 'use', 'mod', 'struct', 'def', 'from', 'import',
  'None', 'True', 'False', 'new', 'namespace', 'object', 'event', 'public', 'private', 'var', 'yield', 'package', 'interface', 'enum', 'const', 'static',
  'final', 'abstract', 'self', 'Self', 'super', 'crate', '_', 'in', 'is', 'as', 'do', 'if', 'else', 'for', 'while', 'goto', 'select', 'chan', 'go', 'range',
  'func', 'map', 'switch', 'case', 'break', 'continue', 'null', 'true', 'false', 'void', 'double', 'long', 'char', 'byte', 'bool', 'delegate', 'lock',
  'ref', 'out', 'params', 'this', 'base', 'where', 'impl', 'trait', 'pub', 'mut', 'move', 'box', 'dyn', 'loop', 'unsafe', 'extern', 'try', 'catch',
  'finally', 'throw', 'throws', 'extends', 'implements', 'instanceof', 'native', 'synchronized', 'transient', 'volatile', 'strictfp', 'lambda', 'global',
  'nonlocal', 'pass', 'raise', 'with', 'del', 'assert', 'except', 'exec', 'print', 'not', 'and', 'or', 'defer', 'fallthrough', 'virtual', 'override',
  'sealed', 'internal', 'protected', 'readonly', 'sizeof', 'typeof', 'checked', 'unchecked', 'fixed', 'implicit', 'explicit', 'operator', 'stackalloc',
  'Object', 'String', 'Integer', 'List', 'Optional', 'Any', 'Vec', 'Option', 'Box', 'Result', 'Serialize', 'Deserialize', 'JsonProperty', 'Task',
  'Equals', 'GetHashCode', 'ToString', 'GetType', 'Root', 'RootItem',
];


function documents() {
  const out = [];
  out.push({ name: 'realistic', rows: [
    { id: 1, name: 'Pen', qty: 3, price: 1.5, dept: null, tags: ['a'], owner: { mail: 'x@y.com', roles: [{ id: 1, level: 'admin' }] }, active: true, created: '2024-01-01T00:00:00Z' },
    { id: 2, name: 'Ink', qty: null, price: 9.25, dept: 'HR', tags: [], owner: null, active: false, extra: { deep: [1, 2, 3] } },
  ] });
  // names that meet: two keys that become the same name, a key like the class that holds it, lists of lists, big numbers, numbers then decimals
  out.push({ name: 'colliding names', rows: [
    { 'a b': 1, a_b: 2, 'a-b': 3, 'A B': 4, Root: 5, RootItem: 6, matrix: [[1, 2], [3]], big: 3000000000, mixed: 1, owner: { owner: { owner: 1 } }, 'owner ': { x: 1 }, Owner: { y: 'z' } },
    { mixed: 1.5, big: 5, 'a b': null },
  ] });
  for (const { name, rows } of fixtureLists({ max: 200 })) out.push({ name: 'fixture ' + name, rows });
  const hostile = {};
  HOSTILE_KEYS.filter((key) => key.length < 200 && !key.includes('\u0000')).forEach((key, i) => { hostile[key] = i % 3 ? 'text' : i; });
  out.push({ name: 'hostile keys', rows: [hostile] });
  const reserved = {};
  RESERVED.forEach((key, i) => { reserved[key] = i % 2 ? 1.5 : 'x'; });
  out.push({ name: 'reserved words', rows: [reserved, { class: null }] });
  return out;
}

function have(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  return { ok: !result.error && result.status === 0, output: ((result.stdout || '') + (result.stderr || '')).trim() };
}

const scratch = (name) => fs.mkdtempSync(path.join(os.tmpdir(), 'structra-compile-' + name + '-'));

/* Every language: write the files, run the compiler, return the errors (an empty list is a pass) */
const LANGUAGES = {
  typescript: {
    available: () => fs.existsSync(path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')),
    check(docs) {
      const folder = scratch('ts');
      const files = docs.map((doc, i) => {
        const file = path.join(folder, 'd' + i + '.ts');
        fs.writeFileSync(file, 'export {};\n' + generator.generate('typescript', doc.rows, 'Root') + '\n');
        return file;
      });
      const result = run('node', [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '--strict', '--target', 'es2020', ...files]);
      return result.ok ? [] : [result.output];
    },
  },
  python: {
    available: () => have('python', ['--version']),
    check(docs) {
      const errors = [];
      docs.forEach((doc, i) => {
        const folder = scratch('py');
        const file = path.join(folder, 'd' + i + '.py');
        fs.writeFileSync(file, generator.generate('python', doc.rows, 'Root') + '\n');
        // importing runs the class definitions, which is where a name used before it is defined fails
        const result = run('python', ['-I', '-c', "import importlib.util,sys;s=importlib.util.spec_from_file_location('m', sys.argv[1]);m=importlib.util.module_from_spec(s);sys.modules['m']=m;s.loader.exec_module(m)", file]);
        if (!result.ok) errors.push(doc.name + ': ' + result.output.split('\n').slice(-3).join(' | '));
      });
      return errors;
    },
  },
  csharp: {
    available: () => have('dotnet', ['--version']),
    check(docs) {
      const folder = scratch('cs');
      fs.writeFileSync(path.join(folder, 'App.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Library</OutputType><TargetFramework>net8.0</TargetFramework><Nullable>enable</Nullable><ImplicitUsings>disable</ImplicitUsings><TreatWarningsAsErrors>false</TreatWarningsAsErrors></PropertyGroup></Project>\n');
      // every document is its own namespace, so class names from different documents do not meet
      docs.forEach((doc, i) => {
        const source = generator.generate('csharp', doc.rows, 'Root');
        const isTop = (line) => /^(using |#nullable)/.test(line);
        const top = source.split('\n').filter(isTop).join('\n');
        const body = source.split('\n').filter((line) => !isTop(line)).join('\n');
        fs.writeFileSync(path.join(folder, 'd' + i + '.cs'), top + '\nnamespace D' + i + ' {\n' + body + '\n}\n');
      });
      const result = run('dotnet', ['build', '--nologo', '-v', 'q', '-clp:ErrorsOnly'], { cwd: folder });
      return result.ok ? [] : [result.output.split('\n').filter((line) => /error/.test(line)).map((line) => line.replace(/\[.*\]$/, '').replace(/^.*[\\/]/, '')).slice(0, 12).join('\n')];
    },
  },
  go: {
    available: () => have('go', ['version']),
    check(docs) {
      const errors = [];
      docs.forEach((doc, i) => {
        const folder = scratch('go');
        fs.writeFileSync(path.join(folder, 'go.mod'), 'module generated\n\ngo 1.21\n');
        fs.writeFileSync(path.join(folder, 'types.go'), 'package generated\n\n' + generator.generate('go', doc.rows, 'Root') + '\n');
        const result = run('go', ['vet', './...'], { cwd: folder });
        if (!result.ok) errors.push(doc.name + ' (' + i + '): ' + result.output.split('\n').slice(0, 4).join(' | '));
      });
      return errors;
    },
  },
  rust: {
    available: () => have('cargo', ['--version']),
    check(docs) {
      const folder = scratch('rs');
      fs.mkdirSync(path.join(folder, 'src'));
      fs.writeFileSync(path.join(folder, 'Cargo.toml'), '[package]\nname = "generated"\nversion = "0.1.0"\nedition = "2021"\n\n[dependencies]\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n');
      const mods = docs.map((doc, i) => {
        fs.writeFileSync(path.join(folder, 'src', 'd' + i + '.rs'), generator.generate('rust', doc.rows, 'Root') + '\n');
        return 'pub mod d' + i + ';';
      });
      fs.writeFileSync(path.join(folder, 'src', 'lib.rs'), mods.join('\n') + '\n');
      const result = run('cargo', ['check', '--quiet'], { cwd: folder });
      return result.ok ? [] : [result.output.split('\n').filter((line) => /^error/.test(line)).slice(0, 12).join('\n')];
    },
  },
  java: {
    available: () => have('javac', ['-version']),
    check(docs) {
      const errors = [];
      docs.forEach((doc, i) => {
        const folder = scratch('java');
        // the annotation the code imports, so no download is needed
        fs.mkdirSync(path.join(folder, 'com', 'fasterxml', 'jackson', 'annotation'), { recursive: true });
        fs.writeFileSync(path.join(folder, 'com', 'fasterxml', 'jackson', 'annotation', 'JsonProperty.java'), 'package com.fasterxml.jackson.annotation;\nimport java.lang.annotation.*;\n@Retention(RetentionPolicy.RUNTIME)\npublic @interface JsonProperty { String value(); }\n');
        fs.writeFileSync(path.join(folder, 'Types.java'), generator.generate('java', doc.rows, 'Root') + '\n');
        const result = run('javac', ['-encoding', 'UTF-8', '-d', path.join(folder, 'out'), 'com/fasterxml/jackson/annotation/JsonProperty.java', 'Types.java'], { cwd: folder });
        if (!result.ok) errors.push(doc.name + ' (' + i + '): ' + result.output.split('\n').filter((line) => /error/.test(line)).slice(0, 4).join(' | '));
      });
      return errors;
    },
  },
};

(async () => {
  const docs = documents();
  console.log('type definitions through the real compilers: ' + docs.length + ' documents');
  let failed = 0;
  for (const [name, language] of Object.entries(LANGUAGES)) {
    if (WANTED.length && !WANTED.includes(name)) continue;
    if (!language.available()) {
      if (REQUIRE) { console.log('  FAIL  ' + name + ': the compiler is not installed (REQUIRE_COMPILERS=1)'); failed++; } else console.log('  skip  ' + name + ': the compiler is not installed');
      continue;
    }
    const started = Date.now();
    const errors = language.check(docs);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (errors.length) { failed++; console.log('  FAIL  ' + name + ' (' + seconds + ' s)\n        ' + errors.join('\n').split('\n').join('\n        ').slice(0, 3000)); } else console.log('  ok    ' + name + ' (' + seconds + ' s)');
  }
  process.exit(failed ? 1 : 0);
})();
