// The names the package removed, each with what replaces it: the rule removed-name reports one wherever an app writes it,
// its tests included. They are the names of the table "Moving from 0.4.1" of docs/using-imago.md, and tests/check.test.ts
// compares the two. A name that ends in `*` is a family: every name that starts with what comes before the star.

/** @typedef {{ old: string, kind: 'class' | 'attribute' | 'property' | 'entry', now: string }} Removed */

/** @type {Removed[]} */
export const REMOVED = [
  { old: 'im-*', kind: 'class', now: 'a part of @acaprino/sigrid' },
  { old: 'data-im-*', kind: 'attribute', now: 'the props of a part of @acaprino/sigrid' },
  { old: '--im-*', kind: 'property', now: 'the theme of @acaprino/sigrid' },
  { old: '@acaprino/imago/css/*', kind: 'entry', now: '@acaprino/sigrid/styles.css' },
  { old: '@acaprino/imago/ui', kind: 'entry', now: '@acaprino/sigrid/primitives, /components, /layout, /assemblies' },
  { old: '@acaprino/imago/shell', kind: 'entry', now: '@acaprino/sigrid/tauri' },
  { old: '@acaprino/imago/tauri', kind: 'entry', now: '@acaprino/sigrid/tauri' },
  { old: '@acaprino/imago/graph', kind: 'entry', now: '@acaprino/sigrid/graph' },
  { old: '@acaprino/imago/graph-layout', kind: 'entry', now: '@acaprino/sigrid/graph' },
  { old: '@acaprino/imago/react', kind: 'entry', now: '@acaprino/sigrid/layout' },
  { old: '@acaprino/imago/tokens', kind: 'entry', now: 'colorTheme of @acaprino/sigrid' },
];
