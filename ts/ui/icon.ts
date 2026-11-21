/** Decorative symbols for controls. The control supplies its own accessible name. */
const shapes = {
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 7v10M8 15h4a6 6 0 0 0 6-6V8"/>',
  chart: '<path d="M4 19V9m8 10V4m8 15v-7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="1"/><path d="M16 8V3H3v13h5"/>',
  document: '<path d="M14 3H5v18h14V8z"/><path d="M14 3v6h5M8 13h8M8 17h5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  external: '<path d="M14 3h7v7M21 3 10 14M10 5H4v15h15v-6"/>',
  file: '<path d="M14 3H5v18h14V8zM14 3v6h5"/>',
  graph: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h9v9M6 9v9h9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  layers: '<path d="m12 3 10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  reload: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 2M4 17l2 2a7 7 0 0 0 12-2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  shield: '<path d="m12 3 8 3v6c0 4-8 9-8 9s-8-5-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  warning: '<path d="m12 3 10 18H2zM12 9v5m0 3h.01"/>',
  box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.9-3M4 5v3.5h3.5M4 13a8 8 0 0 0 14.9 3M20 19v-3.5h-3.5"/>',
  sliders: '<path d="M4 7h8M16 7h4M4 12h3M11 12h9M4 17h10M18 17h2"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="17" r="2"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  spark: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5L9 9M15 15l2.5 2.5M17.5 6.5L15 9M9 15l-2.5 2.5"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
} as const;

// Keep the original string-composition names as aliases of the shared symbol set.
const aliases = { x: 'close', alert: 'warning', chev: 'chevron' } as const;
export type IconName = keyof typeof shapes | keyof typeof aliases | 'spinner';
export function isIconName(name: string): name is IconName {
  return name === 'spinner' || Object.hasOwn(shapes, name) || Object.hasOwn(aliases, name);
}
export function iconMarkup(name: IconName): string {
  if (name === 'spinner') return '<span class="im-spinner" aria-hidden="true"></span>';
  const key = Object.hasOwn(aliases, name) ? aliases[name as keyof typeof aliases] : name;
  const shape = Object.hasOwn(shapes, key) ? shapes[key as keyof typeof shapes] : '';
  return '<svg class="im-icon" viewBox="0 0 24 24" aria-hidden="true">' + shape + '</svg>';
}

