import { openDialogSheet } from '../../ts/ui/sheet.ts';
import { openContentDialog } from '../../ts/ui/dialog.ts';
import { uiButton, uiPart } from '../../ts/ui/dom-parts.ts';
import { textFieldHtml } from '../../ts/ui/markup.ts';
import type { MountContext } from '../main.ts';
import {
  feedbackPageHtml, filesPageHtml, fillPatterns, fixtureHtml, formPageHtml, inspectionPageHtml, PATTERNS_CSS, recordsPageHtml, settingsPageHtml, wizardPageHtml,
} from '../patterns.ts';
import { mountTilingWorkspace } from '../tiling.ts';

/** The four sections of the patterns, in the order of the page: each holds one or more app windows reduced to a page. */
const SECTIONS: { id: string; group: string; title: string; intro: string; windows: { id: string; label: string; html: () => string; narrow?: boolean }[] }[] = [
  {
    id: 'page', group: 'patterns', title: 'Page patterns',
    intro: 'What an app puts in its content region: the head of a page and of a record, a toolbar, summaries, lists, tables, text and code, a task card, an aside; and an inspection page of sections, metrics and a canvas.',
    windows: [{ id: 'records', label: 'Projects', html: recordsPageHtml }, { id: 'inspection', label: 'Analysis', html: inspectionPageHtml }],
  },
  {
    id: 'forms', group: 'forms', title: 'Forms',
    intro: 'A wizard, a form with its groups, operations and footer, settings rows, repeat rows, a grid of fields and a sheet.',
    windows: [{ id: 'wizard', label: 'Add a plugin', html: wizardPageHtml }, { id: 'form', label: 'Plugin', html: () => formPageHtml() + settingsPageHtml(), narrow: true }],
  },
  {
    id: 'feedback', group: 'feedback', title: 'Feedback',
    intro: 'Notes in the four status tones, the text helpers on the ground and on a sheet, a status in the title bar, a log that scrolls on its own, a banner and the notice of a detached window.',
    windows: [{ id: 'feedback', label: 'Status', html: feedbackPageHtml }],
  },
  {
    id: 'files', group: 'files', title: 'Files and workspaces',
    intro: 'A file workspace with its tree, location, document and render view; the file dialog; the graph editor of a team map; and the tiling workspace of a terminal app, whose tabs drag to another pane or to a side.',
    windows: [{ id: 'files', label: 'Files', html: filesPageHtml }],
  },
];

declare global {
  interface Window {
    /** For tests/gallery/coverage.mjs: opens the surfaces of the patterns, the file dialog and the sheet of a form. */
    __imagoPatterns?: { openFileDialog(): () => void; openFormSheet(): () => void };
  }
}

// The sections of the page patterns under the window. Each window is an `im-shell` reduced to its content region, with the
// root attributes of the window above (`data-im-app|look|theme`, and `im-glass`) for the tokens to apply.
export default function mount({ root, sections }: MountContext): () => void {
  const made: HTMLElement[] = [];
  for (const [index, section] of SECTIONS.entries()) {
    const element = document.createElement('section');
    element.id = `g-patterns-${section.id}`;
    element.className = 'g-block g-patterns';
    element.dataset.gGroup = section.group;
    element.setAttribute('aria-labelledby', `g-h-patterns-${section.id}`);
    element.innerHTML = (index === 0 ? `<style>${PATTERNS_CSS}</style>` : '') + `<h2 id="g-h-patterns-${section.id}">${section.title}</h2><p>${section.intro}</p>`
      + section.windows.map((w) => `<div class="g-fixture" data-g-fixture="${w.id}">${fixtureHtml({ id: `g-fixture-${w.id}`, label: w.label, pageHtml: w.html(), narrow: w.narrow })}</div>`).join('');
    for (const fixture of Array.from(element.querySelectorAll<HTMLElement>('.g-fixture'))) {
      for (const { name, value } of Array.from(root.attributes)) if (name.startsWith('data-im-')) fixture.setAttribute(name, value);
      fixture.classList.toggle('im-glass', root.classList.contains('im-glass'));
    }
    sections.append(element);
    made.push(element);
  }
  const undo = made.map((element) => fillPatterns(element));
  const tiling = document.querySelector<HTMLElement>('#g-patterns-files [data-g-tiling]');
  if (tiling) undo.push(mountTilingWorkspace(tiling));

  // The file dialog (Shinatama, files-panel.ts: im-file-dialog): a native dialog in the layer stack of its window.
  const filesShell = document.querySelector<HTMLElement>('[data-g-fixture="files"] .im-shell');
  const openFileDialog = (): (() => void) => {
    if (!filesShell) return () => {};
    const dialog = uiPart('dialog', undefined, 'im-file-dialog');
    dialog.setAttribute('aria-labelledby', 'g-file-dialog-title');
    const header = uiPart('header');
    const close = uiButton('Close');
    header.append(uiPart('heading', 'Files of billing-service'), close);
    header.firstElementChild!.id = 'g-file-dialog-title';
    const body = uiPart('scroll');
    body.append(uiPart('pre', 'src/payments/retry.ts\nsrc/payments/charge.ts\nREADME.md'));
    dialog.append(header, body);
    const control = openContentDialog(filesShell, dialog);
    close.addEventListener('click', () => control.close());
    return () => control.close();
  };
  // A native form docked as a sheet under its anchor (openDialogSheet: im-form-sheet).
  const formShell = document.querySelector<HTMLElement>('[data-g-fixture="form"] .im-shell');
  const openFormSheet = (): (() => void) => {
    const anchor = formShell?.querySelector<HTMLElement>('.im-form-head .im-icon-btn');
    if (!formShell || !anchor) return () => {};
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Rename');
    dialog.innerHTML = `<form method="dialog" class="im-stack">${textFieldHtml('New name', 'g-sheet-name', 'Marionette', { id: 'g-sheet-name', error: false })}<div class="im-sheet-actions"><button class="im-btn" value="cancel">Cancel</button><button class="im-btn im-btn--primary" value="save">Rename</button></div></form>`;
    if (!openDialogSheet(dialog, { anchor: () => anchor, placement: 'below' })) return () => {};
    return () => { if (dialog.open) dialog.close(); dialog.remove(); };
  };
  const fileButton = document.querySelector<HTMLElement>('#g-patterns-files [data-action="g-file-dialog"]');
  fileButton?.addEventListener('click', () => void openFileDialog());
  window.__imagoPatterns = { openFileDialog, openFormSheet };

  return () => {
    for (const stop of undo) stop();
    for (const element of made) element.remove();
    delete window.__imagoPatterns;
  };
}
