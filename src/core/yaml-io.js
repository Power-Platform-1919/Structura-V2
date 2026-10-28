/* ============================================================
   STRUCTRA V2 - YAML in and out
   Structra.yamlIo - the one door to the yaml library (src/libs/yaml). Everything that reads or writes YAML calls this.

   It runs on the page and inside the YAML worker (the worker loads this same file), so the rules exist once.

   API:
     Structra.yamlIo.parse(text)       → { data, documents, tagsIgnored }
                                           data       the value; with several documents ("---" between them) a list with one entry each
                                           documents  how many documents the text holds (0 for an empty text)
                                           tagsIgnored true when the text used tags the library does not know (!Ref, !GetAtt, !vault ...):
                                                      their values are kept, the tag names are dropped
                                         Throws an error with a short reason and the place: "Implicit keys need to be on a single line (line 3, column 5)".
     Structra.yamlIo.stringify(value)  → YAML text for a value, 2 spaces per level, lines up to 120 characters
   ============================================================ */
(function (root) {
  'use strict';

  root.Structra = root.Structra || {};

  // merge: the << key that copies another mapping in (Docker Compose, Kubernetes and CI files are full of it)
  // logLevel silent: the library's own notes (a list used as a key) are not for the page console
  const READ_OPTIONS = { version: '1.2', merge: true, logLevel: 'silent' };

  /** The reason of a YAML error without its code frame, with the place at the end */
  function describe(error) {
    const reason = String(error.message || 'Unknown YAML error').split('\n')[0].replace(/\s+at line \d+, column \d+:?\s*$/, '').replace(/:\s*$/, '');
    const place = Array.isArray(error.linePos) && error.linePos[0] ? ` (line ${error.linePos[0].line}, column ${error.linePos[0].col})` : '';
    return reason + place;
  }

  function parse(text) {
    const parsed = root.YAML.parseAllDocuments(String(text), READ_OPTIONS);
    const documents = Array.isArray(parsed) ? parsed : [parsed];
    for (const document of documents) if (document.errors && document.errors.length) throw new Error(describe(document.errors[0]));
    const values = documents.map((document) => document.toJS({ mapAsMap: false }));
    const tagsIgnored = documents.some((document) => (document.warnings || []).some((warning) => warning.code === 'TAG_RESOLVE_FAILED'));
    return { data: values.length === 0 ? null : (values.length === 1 ? values[0] : values), documents: values.length, tagsIgnored };
  }

  function stringify(value) {
    return root.YAML.stringify(value, { indent: 2, lineWidth: 120, aliasDuplicateObjects: false });
  }

  root.Structra.yamlIo = { parse, stringify };
})(typeof self !== 'undefined' ? self : globalThis);
