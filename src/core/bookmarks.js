/* ============================================================
   STRUCTRA V2 — Bookmarks
   Structra.bookmarks — saved paths, kept per file name.

   Stored in localStorage key "structra_bookmarks" as an array of
   { path, fileName, preview, ts } (the workspace export reads the same key).

   API:
     Structra.bookmarks.list()          → bookmarks for the open file
     Structra.bookmarks.paths()         → just the paths for the open file
     Structra.bookmarks.has(path)       → boolean
     Structra.bookmarks.toggle(path)    → add or remove, returns true when added
     Structra.bookmarks.add(path, preview)
     Structra.bookmarks.remove(path)
     Structra.bookmarks.clear()         → remove all for the open file

   Events:
     'bookmarks:changed'
   ============================================================ */

window.Structra = window.Structra || {};

Structra.bookmarks = (() => {
  const KEY = 'structra_bookmarks';

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      Structra.log.warn('Bookmarks', 'Stored bookmarks unreadable, starting empty', err.message);
      return [];
    }
  }

  function save(all) {
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (err) {
      Structra.log.warn('Bookmarks', 'Could not save bookmarks', err.message);
    }
    Structra.events.emit('bookmarks:changed');
  }

  const file = () => Structra.state.fileName || '';
  const mine = (b) => (b.fileName || '') === file();

  const list = () => load().filter(mine);
  const paths = () => list().map((b) => b.path);
  const has = (path) => list().some((b) => b.path === path);

  function add(path, preview) {
    if (!path || path === '$') return false;
    if (has(path)) return false;
    const all = load();
    all.push({ path, fileName: file(), preview: preview || '', ts: Date.now() });
    save(all);
    return true;
  }

  function remove(path) {
    save(load().filter((b) => !(mine(b) && b.path === path)));
  }

  function toggle(path) {
    if (!path || path === '$') return false;
    if (has(path)) { remove(path); return false; }
    return add(path);
  }

  function clear() {
    save(load().filter((b) => !mine(b)));
  }

  // The tree's context menu announces bookmarks through this event
  Structra.events.on('bookmark:add', (d) => {
    if (!d || !d.path) return;
    if (add(d.path, d.preview)) Structra.toast('Bookmarked ' + d.path);
    else Structra.toast('Already bookmarked');
  });

  return { list, paths, has, add, remove, toggle, clear };
})();
