# Structra V2 - CSS System Reference

## File Structure
- `src/css/variables.css` - Single source of truth for ALL design tokens
- `src/css/layout.css` - Grid shell (header, tab-bar, workspace, status)
- `src/css/components.css` - Shared UI component styles

## Rule: Zero Hardcoded Values
- **No hex colors** in layout.css or components.css - use `--var` from variables.css
- **No px sizes** (except `1px` borders, `2px` indicators, `@media` breakpoints)
- All font sizes use `--fs-xxs` to `--fs-xl` scale
- All icon sizes use `--icon-xs` to `--icon-xl` scale
- All spacing uses `--sp-1` to `--sp-8`

## Token Categories in variables.css

### Sizing
`--header-h`, `--tab-bar-h`, `--rail-w`, `--status-h`, `--canvas-header-h`, `--insight-strip-h`, `--query-panel-w`, `--context-panel-w`

### Font Scale
`--fs-xxs: 9px`, `--fs-xs: 10px`, `--fs-sm: 11px`, `--fs-base: 12px`, `--fs-md: 13px`, `--fs-lg: 14px`, `--fs-xl: 16px`

### Icon Scale
`--icon-xs: 10px`, `--icon-sm: 14px`, `--icon-md: 15px`, `--icon-lg: 18px`, `--icon-xl: 48px`

### Component Sizes
`--btn-icon-size`, `--rail-btn-size`, `--tab-max-w`, `--tab-add-w`, `--find-input-w`, `--cmd-box-w`, `--cmd-list-max-h`, `--iz-textarea-max-w`, `--iz-textarea-h`, `--qp-input-h`, `--cov-bar-min-w`

### Responsive
`--rail-w-sm`, `--query-panel-w-sm`, `--context-panel-w-sm`

### Colors (light/dark pairs defined in :root and [data-theme="dark"])
- Surfaces: `--bg`, `--surface`, `--surface-alt`, `--surface-hover`
- Borders: `--border`, `--border-subtle`
- Text: `--text`, `--text-sec`, `--text-muted`, `--text-faint`, `--text-on-accent`
- Accent: `--accent`, `--accent-hover`, `--accent-soft`, `--accent-muted`
- Semantic: `--success`, `--warning`, `--error`, `--danger`, `--info` (each has `-soft` variant)
- Syntax (tree): `--syn-string`, `--syn-number`, `--syn-boolean`, `--syn-null`, `--syn-key`, `--syn-bracket`
- Syntax (schema): `--syn-schema-key`, `--syn-schema-type`
- Overlay: `--overlay-bg`

### Tree/Drawer
`--tree-indent`, `--tree-line-h`, `--drawer-collapsed`, `--drawer-md`, `--drawer-lg`

## Where Components Live in components.css
- Buttons: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-icon`, `.toolbar-btn`, `.rail-btn`
- Tabs: `.view-tab`, `.doc-tab`, `.doc-tab-add`
- Tree: `.tree-view`, `.tree-line`, `.tree-key/string/number/boolean/null/bracket`, `.tree-badge`
- Chips: `.insight-chip`
- Find: `.find-bar`
- Input zone: `.input-zone`, `.iz-*`
- Toast: `.toast`
- Separators: `.sep`, `.sep-h`
- Drawer: `.drawer-nav`, `.drawer-nav-btn`
- Context panel: `.ctx-header`, `.ctx-section`, `.ctx-label`, `.ctx-value`
- Query panel: `.qp-header`, `.qp-modes`, `.qp-mode`, `.qp-input`
- Command palette: `.cmd-overlay`, `.cmd-box`, `.cmd-input`, `.cmd-list`, `.cmd-item`
- Tables: `.data-table`, `.cov-table`, `.arr-table`
- Badges: `.bool-badge`, `.bool-true`, `.bool-false`
- Pills: `.type-pill`
- Stats: `.stats-section`, `.stats-section-title`
- Graph: `.graph-container`, `.graph-node`, `.graph-edge`
- Schema: `.schema-container`, `.s-key`, `.s-type`, `.s-req`
- Editor: `.editor-container`, `.editor-toolbar`, `.editor-textarea`, `.ed-status`
- View panels: `.view-panel`
- Kbd: `kbd`

## When Adding New Components
1. Define any new tokens in `variables.css` (both `:root` and `[data-theme="dark"]`)
2. Use only `var(--*)` references in layout/components
3. Update this file with new tokens/components
