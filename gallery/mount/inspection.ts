import { metric, segmentedControl, setProgress, stepList } from '../../ts/ui/index.ts';
import type { MountContext } from '../main.ts';

export default function mount({ root, sections }: MountContext) {
  const section = document.createElement('section');
  section.setAttribute('aria-label', 'Inspection controls');
  section.className = 'g-block im-stack';
  for (const attr of root.attributes) if (attr.name.startsWith('data-im-')) section.setAttribute(attr.name, attr.value);
  const heading = document.createElement('h2');
  heading.textContent = 'Inspection controls';
  const meter = document.createElement('div');
  meter.setAttribute('aria-label', 'Checks completed');
  const output = document.createElement('div');
  output.setAttribute('aria-live', 'polite');
  const counts = { files: 12, folders: 4 };
  const card = (value: string) => metric(document, String(counts[value as keyof typeof counts]), value, 'In this project');
  const choice = segmentedControl(document, {
    label: 'Group by', value: 'files', choices: [{ value: 'files', label: 'Files' }, { value: 'folders', label: 'Folders' }],
    onChange: value => output.replaceChildren(card(value)),
  });
  const stages = stepList(document, 'Checks', [
    { label: 'Read', state: 'done' }, { label: 'Check', state: 'now', detail: 'In progress' },
    { label: 'Publish', state: 'todo', action: { disabled: true, activate() {} } },
  ]);
  output.append(card('files'));
  setProgress(meter, 50);
  section.append(heading, choice.element, output, stages, meter);
  sections.append(section);
  return () => section.remove();
}
