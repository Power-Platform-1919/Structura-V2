/* Code checks (npm run lint).
   ESLint reads the code without running it and reports things that are almost always mistakes: a name that does not exist,
   code that can never run, a variable that is never used, a comparison that can never be true.

   The app is plain scripts in the browser (no modules), so the app files share one global object, Structra, and a few
   libraries that put their own names on the page. They are listed here so they are not reported as missing.
*/
const js = require('@eslint/js');
const globals = require('globals');

const appGlobals = {
  Structra: 'writable',
  // Libraries loaded by <script> tags or on demand (src/libs, src/core/library-loader.js)
  CodeMirror: 'readonly',
  Papa: 'readonly',
  jsyaml: 'readonly',
  TOML: 'readonly',
  Ajv: 'readonly',
  JSONRepair: 'readonly',
  html2canvas: 'readonly',
  csvRetype: 'readonly',                 // src/libs/csv-typing.js
  lucide: 'readonly',
  // Classes every component and dialog extends (core/component-base.js, core/dialog-base.js)
  StructraComponent: 'readonly',
  StructraDialog: 'readonly',
};

module.exports = [
  {
    // Third-party code and generated files are not ours to check
    ignores: ['node_modules/**', 'src/libs/**', 'src/vendor/**', 'samples/**', 'docs/**', '.playwright-mcp/**', 'test-results/**', 'structra-v2.html'],
  },
  js.configs.recommended,
  {
    // The app: plain scripts that run in the browser
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.worker, ...appGlobals },
    },
    rules: {
      // Things that are almost always a mistake: these stop the build
      'no-undef': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-self-assign': 'error',
      'no-unsafe-finally': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      // Worth knowing about, but not worth stopping for
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
      'no-useless-escape': 'off',          // an extra backslash in a pattern does no harm
      'no-control-regex': 'off',
      'no-misleading-character-class': 'off',
    },
  },
  {
    // These two files declare the classes that the global list above names
    files: ['src/core/component-base.js', 'src/core/dialog-base.js'],
    rules: { 'no-redeclare': 'off', 'no-unused-vars': 'off' },
  },
  {
    // The build script for the editor library runs in Node and is written as a module
    files: ['tools/**/*.mjs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-undef': 'error' },
  },
  {
    // The entry file is only read by the build script
    files: ['tools/editor/entry.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },
  {
    // The tests run in Node (and drive a browser)
    files: ['tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.browser, ...appGlobals },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'off',             // in the tests an unused name is usually a helper kept for the next test
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
      'no-control-regex': 'off',
    },
  },
];
