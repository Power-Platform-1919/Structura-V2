# Structra V2 Architecture Decision

## Pattern: Custom Elements (W3C Web Components standard, NO Shadow DOM)
- Decided: 2026-06-20
- Reason: Future-proof (W3C standard), modular (one break ≠ all break), works from file:// and GitHub Pages, zero dependencies

## Key Rules
- No Shadow DOM (shared CSS theming via custom properties)
- No ES Modules (won't work from file://) - use regular <script> tags
- No frameworks/libraries - vanilla only
- Global state via `window.Structra` namespace
- Base class: `StructraComponent extends HTMLElement` (~30 lines)
- Each component: one file, one class, one custom element tag
- Console access: `Structra.state.*`, `Structra.tabs.*`, or `document.querySelector('structra-*')`

## File Structure
- index.html - thin shell (~50 lines of tags + script refs)
- src/core/component-base.js - StructraComponent base class
- src/core/app-state-and-events.js - Structra global state + event bus
- src/core/app-constants.js - MAX_TABS, shortcuts map
- src/components/structra-*.js - one per UI panel
- src/css/variables.css, layout.css, components.css

## Components Planned
- structra-header, structra-tabs, structra-rail
- structra-tree, structra-table, structra-graph
- structra-query, structra-find, structra-drawer
- structra-context, structra-input, structra-stats

## Prototype Reference
- structra-v2.html - working single-file prototype with all CSS/design finalized
