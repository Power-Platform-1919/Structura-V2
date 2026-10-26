# V1 Input Overlay / Landing Page - Complete Analysis

## Architecture Overview

The input overlay is a **full-screen landing page** (`z-index: 200`) that covers the entire app on load. It acts as the single entry point for all data ingestion. The JS logic lives in `window.App.inputHandler` - an IIFE module exposing `{ init, loadFromHash, readFile }`. It receives three callbacks at init time: `parseJsonAsync`, `onJsonLoaded(data, text, name)`, and internally creates `readFileFn`. All five input methods funnel through `onJsonLoaded()` as the unified exit point.

**Data flow:**
```
User Input → Tab Handler → Parse/Convert → onJsonLoaded(data, text, name) → App renders
```

---

## Complete Element Inventory

### Overlay Container

| Element | Tag | Class | ID | Notes |
|---------|-----|-------|----|-------|
| Overlay root | `div` | `.input-overlay` | `#inputOverlay` | `position:fixed; inset:0; z-index:200` |
| Theme toggle | `button` | `.overlay-theme-toggle` | `#overlayThemeToggle` | Absolute top-right corner |
| Content card | `div` | `.input-box` | - | `width:560px`, centered, 12px border-radius |
| Title | `h2` | - | - | Contains inline SVG brand icon + "Structra" |
| Subtitle | `div` | `.sub` | - | "Explore your JSON data, navigate paths, and generate code" |
| Tab strip | `div` | `.input-tabs` | - | Flex row, no gap, pill-group shape |
| Error bar | `div` | `.input-error` | `#inputError` | Hidden by default, shown via `.show` class |

### Tab Buttons (5 total)

| Button Text | `data-t` | Activates Panel |
|-------------|----------|-----------------|
| Upload File | `file` | `#ip-file` |
| Paste JSON | `text` | `#ip-text` |
| Import CSV | `csv` | `#ip-csv` |
| Load URL | `url` | `#ip-url` |
| Recent | `recent` | `#ip-recent` |

All share class `.input-tab-btn`. Active state via `.active` class → primary color bg, white text.

---

## Tab Panels - Complete Structure

### 1. Upload File (`#ip-file`)

```
div.input-panel#ip-file
├── div.drop-area#dropArea
│   ├── div.icon          → 📄 emoji (&#128196;)
│   └── p                 → "Drop JSON file here or click to browse"
└── input[type=file]#fileInput  → accept=".json,.txt", display:none
```

**Behavior:** Click triggers file picker. Drag/drop adds `.dragover` class. File read via `FileReader.readAsText()` → `loadText()`.

### 2. Paste JSON (`#ip-text`)

```
div.input-panel#ip-text
├── textarea.paste-input#pasteInput   → placeholder="Paste your JSON here..."
└── button.btn-go#btnGo              → "▶ Load & Explore"
```

**Behavior:** Two click handlers on `#btnGo`:
1. **YAML auto-detect** (capture phase, `stopImmediatePropagation` if YAML) - calls `App.formatConvert.yamlToJson()`
2. **Standard JSON parse** - calls `loadText()` → `parseJsonAsync()`

### 3. Import CSV (`#ip-csv`)

```
div.input-panel#ip-csv
├── textarea.paste-input#csvInput     → placeholder="Paste CSV/TSV data here..."
└── button.btn-go#btnCsvGo           → "▶ Parse CSV & Load"
```

**Behavior:** Lazy-loads PapaParse via `App.libLoader.require('papaparse')`. Parses with `{ header: true, skipEmptyLines: true, dynamicTyping: true }`. Converts CSV rows to JSON array.

### 4. Load URL (`#ip-url`) - Landing API Client

```
div.input-panel#ip-url
├── div.api-row
│   ├── select.api-method#apiMethod       → GET|POST|PUT|PATCH|DELETE
│   ├── input.api-url#apiUrlInput         → placeholder URL, monospace
│   └── button.btn-go.api-send#btnApiSend → "▶ Send"
├── div.api-options
│   ├── div.api-option-tabs
│   │   ├── button.api-opt-tab[data-ap="auth"]     → "Auth" (active)
│   │   ├── button.api-opt-tab[data-ap="headers"]  → "Headers"
│   │   └── button.api-opt-tab[data-ap="body"]     → "Body"
│   ├── div.api-opt-panel#ap-auth (active)
│   │   ├── div.api-auth-row
│   │   │   └── select.api-auth-type#apiAuthType → none|bearer|basic|apikey
│   │   └── div.api-auth-fields#apiAuthFields    → dynamically rendered
│   ├── div.api-opt-panel#ap-headers
│   │   ├── div.api-kv-list#apiHeadersList
│   │   │   └── div.api-kv-row (default 1 row)
│   │   │       ├── input.api-kv-key  → placeholder="Header name"
│   │   │       ├── input.api-kv-val  → placeholder="Value"
│   │   │       └── button.api-kv-remove → "✕"
│   │   └── button.api-add-row#apiAddHeader → "+ Add Header"
│   └── div.api-opt-panel#ap-body
│       ├── div.api-body-type-row
│       │   └── select.api-body-type#apiBodyType → none|json|text|form
│       └── textarea.api-body-editor#apiBodyEditor → hidden when type=none
├── div.api-status#apiStatus     → response badge area
└── div.url-error#urlLandingError
```

### 5. Recent (`#ip-recent`)

```
div.input-panel#ip-recent
└── div.recent-list#recentList
    └── div.recent-empty → "No recent files" (default)
```

**Rendered state** (when entries exist):
```
div.recent-list#recentList
├── div.recent-item[data-idx="0"]
│   ├── div.recent-item-name       → file name
│   ├── div.recent-item-meta       → size · relative time
│   └── div.recent-item-preview    → first N chars, monospace
├── div.recent-item[data-idx="1"]  ...
└── div.recent-clear
    └── button.btn-clear-recent#btnClearRecent → "Clear History"
```

**Behavior:** Uses `App.storage.getRecent()` and `App.storage.loadRecentData(entry)`. If stored data unavailable, prompts a fresh file picker. Click on item loads from IndexedDB/localStorage.

---

## URL/API Modal (Toolbar Version - `#urlModal`)

Opened from toolbar button `#btnUrl`. Identical API client structure as landing, but with `modal` prefix IDs:

```
div.modal-overlay#urlModal
└── div.modal-box (width:560px)
    ├── div.modal-header
    │   ├── h3 → "Load JSON from API"
    │   └── button.toolbar-btn#urlClose → "✕"
    └── div.modal-body
        ├── div.api-row
        │   ├── select.api-method#modalApiMethod
        │   ├── input.api-url#modalApiUrl
        │   └── button.btn-go.api-send#modalApiSend
        ├── div.api-options (same sub-tab structure, `data-mp` prefix)
        ├── div.api-status#modalApiStatus
        └── div.url-error#urlError
```

Key difference: `cfg.onSuccess` callback closes the modal on successful load.

---

## API Client Sub-Tabs Detail

Both landing and modal API clients use the **same `setupApiPanel(cfg)` function** with a config object that maps element IDs. The sub-tab switching uses `data-ap` (landing) / `data-mp` (modal) attributes.

### Auth Tab - Dynamic Rendering (`renderAuthFields()`)

| Auth Type | Fields Rendered | Notes |
|-----------|----------------|-------|
| `none` | Empty | Clears `authFields` |
| `bearer` | `input[data-role="token"]` + `button.api-decode-jwt` + `div.api-jwt-claims` | JWT decoder built in |
| `basic` | `input[data-role="user"]` + `input[type=password][data-role="pass"]` | Base64-encodes `user:pass` |
| `apikey` | `input[data-role="keyname"]` + `input[data-role="keyval"]` | Custom header name + value |

### Headers Tab
- Default 1 empty key/value row (`.api-kv-row`)
- "+ Add Header" button appends rows dynamically
- "✕" button removes rows via event delegation on `.api-kv-remove`

### Body Tab
- `select` toggles body type: none / JSON / Plain Text / Form URL-Encoded
- Textarea hidden when `none`, shown otherwise
- Placeholder updates contextually per type
- `Content-Type` header auto-set
- Body only sent for non-GET/DELETE methods

---

## JWT Decoder Detail

Activated from Bearer Auth panel's "Decode Token" button. Inline - no external library.

**Process:**
1. Strips `Bearer ` prefix (case-insensitive)
2. Validates 3-part JWT structure (header.payload.signature)
3. Base64URL-decodes header and payload
4. Parses both as JSON

**Rendered UI** (inside `.api-jwt-claims`):
```
div.api-jwt-claims
├── div.api-jwt-header-bar
│   ├── span.api-jwt-title     → "Decoded Token"
│   └── button.api-jwt-close   → "✕"
├── div.api-jwt-section (Header)
│   ├── span.api-jwt-label     → "HEADER"
│   ├── button.api-jwt-copy    → Copy header
│   └── pre.api-jwt-json       → formatted JSON
├── div.api-jwt-section (Payload)
│   ├── span.api-jwt-label     → "PAYLOAD"
│   ├── button.api-jwt-copy    → Copy payload
│   └── pre.api-jwt-json       → formatted JSON
├── div.api-jwt-meta           → ⛔ Expired / ✅ Valid + date
├── div.api-jwt-meta           → Issued date
└── button.api-jwt-copy-all    → "Copy Full Decoded Token"
```

---

## CSV Parser Detail

- **Library:** PapaParse (lazy-loaded)
- **Config:** `{ header: true, skipEmptyLines: true, dynamicTyping: true }`
- **Output:** Array of row objects → JSON array → `onJsonLoaded()`
- **V2 Note:** V2 uses built-in parser (no PapaParse dependency), supports TSV auto-detect

---

## Clipboard Auto-Detect Detail

Runs on **window focus** events. Passive - no user action required.

**Flow:**
1. Queries `navigator.permissions` for `clipboard-read`
2. On focus: reads clipboard text (if permission granted)
3. Validates: 2–500k chars, starts with `{`/`[`, valid JSON
4. Deduplicates via `lastClipHash`
5. Shows floating banner at bottom center

**Banner:** "📋 JSON on clipboard: {preview}..." with Load/Dismiss buttons. Auto-dismisses after 8s.

---

## Error Handling & Auto-Repair

### Input Error Bar (`#inputError`)
- Hidden by default, shown via `.show` class
- When JSON parse fails with raw text: renders inline `🔧 Auto-Repair` button
- Repair steps: lazy-loads `jsonrepair` → `jsonrepair(text)` → parse → load
- **V2 Note:** V2 uses built-in repair (trailing commas, single quotes, unquoted keys)

### URL Error
- Shown below API status on fetch failure
- Displays `err.message`

### API Status Bar
- Colored badge: 2xx green, 3xx yellow, 4xx/5xx red
- Shows: `{status} {statusText}` + `{elapsed}ms` + `{size}`

---

## `input-handler.js` Function List

| Function | Scope | Purpose |
|----------|-------|---------|
| `init(opts)` | Public | Wires all handlers, receives callbacks |
| `setupInputTabs()` | Private | Tab switching |
| `setupDropArea()` | Private | Drag/drop + click-to-browse |
| `setupPasteHandler()` | Private | Paste textarea + YAML auto-detect |
| `loadText(text, name)` | Private | Core parse → `parseJsonAsync` → `onJsonLoaded` |
| `readFile(file)` | Private | `FileReader` wrapper → `loadText()` |
| `showInputError(msg, rawText)` | Private | Error display + auto-repair |
| `setupCsvImport()` | Private | PapaParse CSV/TSV parsing |
| `setupUrlModal()` | Private | Wires landing + modal API clients |
| `setupApiPanel(cfg)` | Private | Shared API client setup |
| `buildFetchOptions()` | Closure | Assembles fetch options from form |
| `renderAuthFields()` | Closure | Dynamic auth form rendering |
| `addHeaderRow()` | Closure | Appends header key/value row |
| `formatBytes(b)` | Closure | Human-readable byte formatting |
| `setupClipboardDetect()` | Private | Clipboard permission + focus listener |
| `showClipboardBanner(text)` | Private | Floating "JSON on clipboard" banner |
| `renderRecentPanel()` | Private | Recent file list from storage |
| `loadFromHash()` | Public | Decodes `#data=` URL hash |

---

## Complete CSS Class Inventory

**Overlay:** `.input-overlay`, `.overlay-theme-toggle`
**Card:** `.input-box`, `.sub`
**Tabs:** `.input-tabs`, `.input-tab-btn`, `.input-tab-btn.active`
**Panels:** `.input-panel`, `.input-panel.active`
**Drop area:** `.drop-area`, `.drop-area.dragover`, `.icon`
**Paste:** `.paste-input`, `.btn-go`
**API:** `.api-row`, `.api-method`, `.api-url`, `.api-send`
**API options:** `.api-options`, `.api-option-tabs`, `.api-opt-tab`, `.api-opt-panel`
**API auth:** `.api-auth-row`, `.api-auth-type`, `.api-auth-fields`
**API headers:** `.api-kv-list`, `.api-kv-row`, `.api-kv-key`, `.api-kv-val`, `.api-kv-remove`, `.api-add-row`
**API body:** `.api-body-type-row`, `.api-body-type`, `.api-body-editor`
**API status:** `.api-status`, `.status-badge`, `.status-2xx/3xx/4xx/5xx`, `.status-time`, `.status-size`
**JWT:** `.api-jwt-claims`, `.api-jwt-header-bar`, `.api-jwt-title`, `.api-jwt-close`, `.api-jwt-section`, `.api-jwt-section-header`, `.api-jwt-label`, `.api-jwt-copy`, `.api-jwt-json`, `.api-jwt-meta`, `.api-jwt-error`, `.api-jwt-copy-all`
**Error:** `.input-error`, `.input-error.show`, `.btn-repair`
**Recent:** `.recent-list`, `.recent-empty`, `.recent-item`, `.recent-item-name`, `.recent-item-meta`, `.recent-item-preview`, `.recent-clear`, `.btn-clear-recent`
**Clipboard:** `#clipBanner` (inline styles in V1)
**Modal:** `.modal-overlay`, `.modal-box`, `.modal-header`, `.modal-body`

---

## V2 Mapping

| V1 Feature | V2 Component | Status |
|------------|-------------|--------|
| Input overlay | `<structra-input-overlay>` | ✅ Complete |
| Input zone (in-canvas) | `<structra-input-zone>` | ✅ Complete - mirrors overlay tabs |
| URL modal (toolbar) | Part of overlay | Merged into single component |
| Clipboard banner | Built into overlay | ✅ Complete |
| Recent files | Built into overlay | ✅ Complete (localStorage) |
