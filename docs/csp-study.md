# Content-Security-Policy study (2026-10-28)

**Question:** can the app ship a Content-Security-Policy (CSP), and what would it break? A CSP is a list the page gives the browser of where code, styles, images and connections may come from. It limits the damage if something ever injects code into the page.

**Method:** `tests/perf/csp-study.js` loads the app in Edge under a policy sent as a header, uses every feature that could need more than the page's own files (open a document, five views, JSON Schema validation, SQL, JSONPath, user code in a worker, code on the page, compare, save as image, YAML, the command palette) and prints every violation the browser reports. Run it again with `PW_CHANNEL=msedge node tests/perf/csp-study.js` (strict) or `... relaxed`.

## Result with a strict policy

`default-src 'self'; script-src 'self'; style-src 'self'; ...` (no inline anything, no eval, no WebAssembly compiling)

| What broke | Why | Which directive fixes it |
|---|---|---|
| **JSON Schema validation (Ajv)** | Ajv turns a schema into a JavaScript function with `new Function` | `script-src 'unsafe-eval'` |
| **SQL (DuckDB-Wasm)** | the engine is WebAssembly and the browser must compile it. The step did not fail: it never answered | `script-src 'wasm-unsafe-eval'` |
| **Styles** (about 70 reports) | CodeMirror and our own code set `style="..."` attributes and add `<style>` elements | `style-src 'unsafe-inline'` |
| **One inline script** in `index.html` | an old fallback line for loading the icon library | removed in this change (the library is local, there is nothing to fall back to) |

User code (Query panel, Transform steps, the blob worker for "try this code") also uses `new Function`, so it needs `'unsafe-eval'` too.

## Result with the relaxed policy

`default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'`

**Everything works and nothing is reported** except the inline script line, now removed.

## What the relaxed policy still protects, and what it does not

Protects: scripts, styles, fonts, images and workers can only come from the app's own files; no plug-in objects; no `<base>` trick; no form posting. An injected `<script src="https://evil">` would not run.

Does not protect: `'unsafe-eval'` lets injected text become code, so it is a weaker script rule than it looks. And **Load from URL** uses `fetch` to an address the person types, so `connect-src` cannot be limited to the app's own files: it would need `https:`. That means the policy cannot promise that data cannot be sent out. Our promise ("your data never leaves the page") stays what it is today: the app makes no requests of its own; the one request is the person's own Load from URL.

## Recommendation

1. **Do not add the policy yet.** Question 17 said to decide after the sandbox worker (task 19). Today it would be a weak policy because of `'unsafe-eval'`.
2. After task 19, user code runs in one sandbox worker. Then `'unsafe-eval'` is needed only for Ajv. Options then: upgrade to Ajv 8 and generate its validators ahead of time for the schemas we know, or accept the one directive. Decide with the numbers then (task 30.4 on the watch list).
3. When it is added, add it as a `<meta http-equiv="Content-Security-Policy">` tag (GitHub Pages cannot send headers) with `connect-src 'self' blob: data: https:`, and extend `tests/perf/csp-study.js` into a smoke test that fails on any violation.
4. Done now: the inline script line in `index.html` is removed, so the page already has no inline script.
