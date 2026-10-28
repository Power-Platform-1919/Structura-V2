# Third-party code

Every library the app ships, with its version, licence, where it comes from and how its file in the repository was made. All of it is served from the app's own folder: nothing is downloaded from another site while the app runs, and no document data leaves the page.

When a library is added or upgraded, change this file in the same pull request. `tests/unit/third-party.test.js` fails when something in `src/libs` or `src/vendor` is not listed here.

| Library | Version | Licence | Source | Folder or file | How the file was made | Used for |
|---|---|---|---|---|---|---|
| CodeMirror 6 (several packages, see the notice) | see `src/libs/codemirror6/NOTICE.txt` | MIT | https://codemirror.net | `src/libs/codemirror6/` | `node tools/build-editor.mjs` (esbuild, from `tools/editor/entry.js`) | every code box |
| DuckDB-Wasm | 1.1.1 | MIT | https://github.com/duckdb/duckdb-wasm | `src/libs/duckdb/` | copied from the npm package `@duckdb/duckdb-wasm` | SQL, filter, pivot |
| jsondiffpatch | 0.7.6 | MIT | https://github.com/benjamine/jsondiffpatch | `src/libs/jsondiffpatch/` | the npm package's `lib/` folder, unchanged, without the unused text and HTML parts | Compare |
| Ajv | 6.12.6 | MIT | https://github.com/ajv-validator/ajv | `src/libs/ajv.min.js` | the npm package's `dist/ajv.min.js` | JSON Schema validation |
| jsonrepair | see the file | ISC | https://github.com/josdejong/jsonrepair | `src/libs/jsonrepair.min.js` | the npm package's UMD build | "Fix it for me" |
| uFuzzy | 1.0.19 | MIT | https://github.com/leeoniya/uFuzzy | `src/libs/ufuzzy/` | the npm package's `dist/uFuzzy.iife.min.js` | close matches in the command palette |
| PapaParse | 5.5.3 | MIT | https://github.com/mholt/PapaParse | `src/libs/papaparse.min.js` | the npm package's minified file | CSV reading and writing |
| yaml | 2.9.1 | ISC | https://github.com/eemeli/yaml | `src/libs/yaml/` | `node tools/build-yaml.mjs` (esbuild; only parseAllDocuments and stringify) | YAML reading and writing, through `Structra.yamlIo` |
| toml | 4.1.1 | MIT | https://github.com/BinaryMuse/toml-node | `src/libs/toml.min.js` | jsDelivr's bundle of the npm package | TOML |
| modern-screenshot | 4.7.0 | MIT | https://github.com/qq15725/modern-screenshot | `src/libs/modern-screenshot/` | the npm package's `dist/index.js`, unchanged | Save as PNG |
| json-p3 | 3.0.1 | MIT | https://github.com/jg-rp/json-p3 | `src/libs/json-p3/` | the npm package's minified ES module, one file | JSONPath (RFC 9535) |
| jsonc-parser | 3.3.1 | MIT | https://github.com/microsoft/node-jsonc-parser | `src/libs/jsonc-parser.min.js` | `node tools/build-jsonc-parser.mjs` (esbuild) | where JSON is broken |
| @tanstack/virtual-core | 3.19.8 | MIT | https://github.com/TanStack/virtual | `src/libs/virtual-core/` | `node tools/build-virtual-core.mjs` (esbuild) | the Table's true scrollbar |
| Lucide | 1.63.0 | ISC | https://lucide.dev | `src/libs/lucide/` | `node tools/build-lucide.mjs` (only the icons the code names) | the icons |
| IBM Plex Sans, JetBrains Mono | self-hosted woff2 | SIL Open Font Licence 1.1 | https://github.com/IBM/plex, https://github.com/JetBrains/JetBrainsMono | `src/fonts/` (named in `src/css/fonts.css`) | copied | text and code fonts |

`src/libs/csv-typing.js` is not third-party: it is our own code and sits beside the libraries only because it is loaded the same way.

Test tools (Playwright, axe-core, ESLint) are development dependencies listed in `package.json`; they are not shipped.
