import { documentPane, fileSelector, fileTree, fileWorkspace, loader, pathField, stepProgress, uiTraits } from '../../ts/ui/index.ts';
import type { MountContext } from '../main.ts';

export default function mount({ root, sections }: MountContext): () => void {
  const section = document.createElement('section');
  section.className = 'g-block g-files';
  section.setAttribute('aria-label', 'File controls');
  for (const { name, value } of Array.from(root.attributes)) {
    if (name.startsWith('data-im-')) section.setAttribute(name, value);
  }
  const heading = document.createElement('h2');
  heading.textContent = 'Files and process status';
  const output = document.createElement('output');
  const tree = fileTree(document, [
    { id: 'src', name: 'src', children: [{ id: 'index', name: 'index.ts' }] },
    { id: 'readme', name: 'README.md' },
  ], { label: 'Project files', onOpen: file => { output.value = file.name; } });
  const upload = document.createElement('label');
  upload.textContent = 'Select documents ';
  upload.append(fileSelector(document, { label: 'Select documents', multiple: true }));
  const input = document.createElement('input');
  input.setAttribute('aria-label', 'Document path');
  // A browser cannot return a native absolute path. Demonstrate the host callback with a sample.
  const path = pathField(input, { buttonLabel: 'Choose sample path', choose: async () => 'src/index.ts',
    onError: error => { output.value = String(error); } });
  // With commit the choice is acted on at once (here: opened) and the field keeps what was typed.
  const folderInput = document.createElement('input');
  folderInput.setAttribute('aria-label', 'Folder to open');
  const openFolder = pathField(folderInput, { buttonLabel: 'Open sample folder…', choose: async () => 'examples/demo',
    commit: folder => { output.value = `Opened ${folder}`; }, onError: error => { output.value = String(error); } });
  const titles = ['Select', 'Review', 'Import'];
  const steps = stepProgress(document, 'Import steps', titles);
  let current = 0;
  const next = document.createElement('button');
  next.className = 'im-btn';
  next.type = 'button';
  next.textContent = 'Next step';
  next.onclick = () => {
    current = (current + 1) % (titles.length + 1);
    steps.setCurrent(current);
    next.textContent = current === titles.length ? 'Start again' : 'Next step';
  };
  // The document region of a file tool: the editor's pane beside the rendered document, a picture and a visual
  // editor's fields. The app loads the document and mounts its editor; Imago draws the panes.
  const documents = fileWorkspace({ resizeLabel: 'Resize the sample tree', toolbarLabel: 'Sample file actions', initialWidth: 160 });
  documents.element.setAttribute('aria-label', 'Document panes');
  documents.element.style.height = '420px';
  const source = documentPane('source', 'File source');
  const editor = document.createElement('div');
  editor.className = 'g-sample-editor';
  editor.textContent = '# Guide';
  source.append(editor);
  const rendered = documentPane('rendered', 'Rendered Markdown');
  rendered.innerHTML = '<h1>Guide</h1><h2>Install</h2><p>Run the installer, then <a data-path="docs/next.md">read on</a>.</p>'
    + '<ul><li>One</li><li>Two</li></ul><blockquote>Quoted</blockquote><pre><code>npm test</code></pre>'
    + '<table><tr><th>Key</th><td>Value</td></tr></table>';
  const picture = documentPane('picture', 'Picture');
  picture.hidden = true;
  const image = document.createElement('img');
  image.alt = 'Sample picture';
  image.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="80"><rect width="2000" height="80" fill="gray"/></svg>');
  picture.append(image);
  const form = documentPane('form', 'Visual editor');
  form.hidden = true;
  const title = uiTraits(document.createElement('input'), 'documentHeading');
  title.dataset.imLevel = '1';
  title.value = 'Guide';
  const code = uiTraits(document.createElement('textarea'), 'documentCode');
  code.value = 'npm test';
  const kept = uiTraits(document.createElement('pre'), 'documentKept');
  kept.textContent = '<details>kept as source</details>';
  form.append(title, code, kept);
  documents.panes.append(source, rendered, picture, form);
  section.append(heading, tree, output, upload, path, openFolder, steps.element, next, loader(document, 'Reading files…'), documents.element);
  sections.append(section);
  return () => {
    documents.destroy();
    section.remove();
  };
}
