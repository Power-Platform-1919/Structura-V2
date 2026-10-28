/* The pieces of CodeMirror 6 that the app uses, in one place.
   tools/build-editor.mjs turns this file into src/libs/codemirror6/ (npm run build:editor). The result is committed, so
   running or deploying the app needs no build step: this runs only when the library is upgraded or a piece is added here.

   Only the pieces are exported. How a code box behaves (colours, folding, suggestions, shading) is written in
   src/core/code-view.js, where it can be read next to the rest of the app.

   Languages are loaded on demand: each loadLanguage entry becomes its own file, fetched the first time that language is used.
*/

export { EditorState, EditorSelection, Compartment, StateEffect, StateField, RangeSetBuilder, Prec } from '@codemirror/state';
export { EditorView, ViewPlugin, Decoration, WidgetType, keymap, lineNumbers, gutter, GutterMarker, drawSelection, placeholder, highlightSpecialChars } from '@codemirror/view';
export { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
export {
  syntaxHighlighting, HighlightStyle, StreamLanguage, bracketMatching, foldGutter, foldService, foldEffect, unfoldEffect,
  foldedRanges, codeFolding, foldKeymap, foldAll, unfoldAll,
} from '@codemirror/language';
export { tags, highlightCode } from '@lezer/highlight';
export {
  autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, acceptCompletion, startCompletion, closeCompletion, completionStatus,
} from '@codemirror/autocomplete';

export const loadLanguage = {
  sql: () => import('@codemirror/lang-sql'),
  javascript: () => import('@codemirror/lang-javascript'),
  xml: () => import('@codemirror/lang-xml'),
  yaml: () => import('@codemirror/lang-yaml'),
  python: () => import('@codemirror/lang-python'),
  java: () => import('@codemirror/lang-java'),
  go: () => import('@codemirror/lang-go'),
  rust: () => import('@codemirror/lang-rust'),
  clike: () => import('@codemirror/legacy-modes/mode/clike'),     // C#
  toml: () => import('@codemirror/legacy-modes/mode/toml'),
};
