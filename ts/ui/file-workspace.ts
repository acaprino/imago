import { uiPart } from './dom-parts.ts';
import { splitter } from './splitter.ts';

/** A document browser with a resizable navigator, actions and one or more editor/preview panes.
 * The application supplies every document, navigation control and operation. */
export function fileWorkspace(options: {
  resizeLabel: string;
  toolbarLabel: string;
  initialWidth: number;
  onWidthCommit?: (pixels: number) => void;
}) {
  const element = uiPart('body', undefined, 'im-file-workspace');
  const navigation = uiPart('stack');
  const main = uiPart('stack');
  const toolbar = uiPart('toolbar');
  toolbar.setAttribute('role', 'group');
  toolbar.setAttribute('aria-label', options.toolbarLabel);
  const location = uiPart('row', undefined, 'im-file-location');
  const panes = uiPart('viewport', undefined, 'im-document-panes');
  const status = uiPart('status');
  toolbar.append(location);
  main.append(toolbar, panes, status);
  const handle = splitter(element.ownerDocument, {
    label: options.resizeLabel, min: 0, max: 1180, value: options.initialWidth,
    onResize: width => element.style.setProperty('--im-navigation-width', width + 'px'),
    onCommit: options.onWidthCommit,
  });
  const observer = new ResizeObserver(([entry]) => {
    const width = entry.contentRect.width;
    if (width <= 0) return;
    const min = Math.min(180, width * .4);
    const max = Math.min(width * .6, Math.max(width * .4, width - 360));
    handle.setBounds(min, max);
  });
  observer.observe(element);
  element.append(navigation, handle.element, main);
  return { element, navigation, toolbar, location, panes, status, destroy: () => observer.disconnect() };
}

export type DocumentPaneKind = 'source' | 'rendered' | 'picture' | 'form';

/** One pane of the document region (`panes` of fileWorkspace). `source` hosts the app's editor, which fills it;
 * `rendered` shows a rendered document (headings, paragraphs, lists, quotes, code, tables, links) in the look's
 * reading type; `picture` shows an image at most as wide as the pane; `form` holds the fields of a visual editor,
 * whose heading, code and kept-source parts take the `documentHeading` (with `data-im-level`), `documentCode`
 * and `documentKept` roles. Panes side by side are divided by a rule; a hidden pane takes no room. */
export function documentPane(kind: DocumentPaneKind, label?: string): HTMLDivElement {
  const pane = document.createElement('div');
  pane.className = `im-document-pane im-document-pane--${kind}`;
  if (label) pane.setAttribute('aria-label', label);
  return pane;
}
