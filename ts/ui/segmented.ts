/** A single choice: an `im-seg` of labels over native radios (`label > input[type=radio] + span`), drawn as one of buttons.
 * Native radios provide group semantics, arrow navigation and form reset; disabling the fieldset disables every choice. */
export function segmentedControl(doc: Document, options: {
  label: string;
  choices: readonly { value: string; label: string; disabled?: boolean }[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
}) {
  const element = doc.createElement('fieldset');
  element.className = 'im-seg';
  const legend = doc.createElement('legend');
  legend.className = 'im-visually-hidden';
  legend.textContent = options.label;
  element.append(legend);
  const name = options.name ?? 'im-choice-' + ++serial;
  const inputs = new Map<string, HTMLInputElement>();
  for (const choice of options.choices) {
    if (inputs.has(choice.value)) throw new RangeError('Duplicate segmented choice');
    const label = doc.createElement('label');
    const input = doc.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = choice.value;
    input.defaultChecked = choice.value === options.value;
    input.disabled = Boolean(choice.disabled);
    input.onchange = () => { if (input.checked) options.onChange(choice.value); };
    const text = doc.createElement('span');
    text.textContent = choice.label;
    label.append(input, text);
    element.append(label);
    inputs.set(choice.value, input);
  }
  return { element, inputs };
}

let serial = 0;
