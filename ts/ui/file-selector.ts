/** A native file input. Its FileList works with FormData and the standard input/change events. */
export function fileSelector(doc: Document, options: {
  label: string; accept?: string; multiple?: boolean; directory?: boolean;
}): HTMLInputElement {
  const input = doc.createElement('input');
  input.type = 'file';
  input.className = 'im-file-selector';
  input.setAttribute('aria-label', options.label);
  input.accept = options.accept ?? '';
  input.multiple = options.multiple ?? false;
  if (options.directory) input.setAttribute('webkitdirectory', '');
  return input;
}

/** A desktop path field delegates the native open, save or directory dialog to its host. */
export function pathField(input: HTMLInputElement, options: {
  buttonLabel: string;
  choose: () => Promise<string | null>;
  onError: (error: unknown) => void;
}): HTMLElement {
  const doc = input.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'im-path-field';
  const field = doc.createElement('span');
  field.className = 'im-input im-input--code';
  field.append(input);
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'im-btn';
  button.textContent = options.buttonLabel;
  let pending = false;
  button.addEventListener('click', async () => {
    if (pending || input.disabled || input.readOnly) return;
    pending = true;
    button.setAttribute('aria-busy', 'true');
    const original = input.value;
    let edited = false;
    const markEdited = () => { edited = true; };
    input.addEventListener('input', markEdited);
    input.addEventListener('change', markEdited);
    const current = () => !edited && input.value === original && root.isConnected &&
      root.contains(input) && !input.disabled && !input.readOnly;
    try {
      const path = await options.choose();
      if (path !== null && current()) {
        input.value = path;
        for (const type of ['input', 'change']) input.dispatchEvent(new Event(type, { bubbles: true }));
      }
    } catch (error) {
      if (current()) options.onError(error);
    } finally {
      input.removeEventListener('input', markEdited);
      input.removeEventListener('change', markEdited);
      pending = false;
      button.removeAttribute('aria-busy');
    }
  });
  root.append(field, button);
  return root;
}
