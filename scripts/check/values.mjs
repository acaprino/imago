// The attributes of the package that take a closed set of values. The package draws these values and no other: a value
// outside its set draws nothing, and the app loses its look without an error. The rule unknown-value reports one; a
// value built at run time (a template with a substitution) is not judged.

/** @type {Record<string, string[]>} */
export const VALUES = {
  // The four status tones, and the accent: the accent on a chip, a dot and a summary only, as a mark of data.
  'data-im-tone': ['ok', 'warn', 'err', 'info', 'accent'],
  // The two looks.
  'data-im-look': ['smooth', 'oni'],
  // The two themes.
  'data-im-theme': ['dark', 'light'],
  // The five apps, which give the hue of the accent.
  'data-im-app': ['shinatama', 'xiox', 'mukade', 'muro', 'daodan'],
  // Whether the shell has a sidebar.
  'data-im-sidebar': ['on', 'off'],
  // The wide inspector (360); without the attribute it is 300.
  'data-im-inspector': ['wide'],
  // The four surfaces.
  'data-im-surface': ['ground', 'sheet', 'dense', 'float'],
  // The state of a step of im-steps.
  'data-im-step': ['done', 'now', 'todo'],
};
