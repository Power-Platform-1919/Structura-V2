# Structra V2 Logger

## File: `src/core/logger.js`
- Loaded FIRST in index.html (before component-base.js, app-state-and-events.js)
- 3 modes: `dev` (all logs), `normal` (info/warn/error), `off` (errors only)
- Persisted in localStorage key `structra-log-mode`
- Console toggle: `Structra.log.setMode('dev')`

## API
- `Structra.log.debug(tag, msg, ...data)` - dev only
- `Structra.log.info(tag, msg, ...data)` - dev + normal
- `Structra.log.warn(tag, msg, ...data)` - dev + normal
- `Structra.log.error(tag, msg, ...data)` - always
- `Structra.log.perf(tag, action, durationMs)` - dev only
- `Structra.log.group(tag, label)` / `groupEnd()` - dev only

## Color-coded tags
Each component has a unique color in console output.
Tags: App, State, EventBus, WorkerPool, Tree, Editor, Table, Stats, Schema, Graph, InputPanel, Drawer, Header, Tabs, ViewSwitcher, CanvasHeader, InsightStrip, Find, Query, Context, Command, Loading, Toast, Rail, Status, JsonView, DomShim, Path

## Workers
Workers use plain `console.log('[Worker:JSON]')` / `console.log('[Worker:CSV]')` since they can't access Structra.log.

## Performance fix (same session)
- Editor/Table/Stats/Schema/Graph: deferred rendering with `_stale` flag - only render when view is active
- InsightStrip: capped at 200k nodes
- Table: capped at 1000 rows
- Editor: 10MB size guard for JSON.stringify
