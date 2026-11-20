import { fileSelector, fileTree, loader, pathField, stepProgress } from '../../ts/ui/index.ts';
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
  section.append(heading, tree, output, upload, path, steps.element, next, loader(document, 'Reading files…'));
  sections.append(section);
  return () => section.remove();
}
