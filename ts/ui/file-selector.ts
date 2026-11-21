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
  /**
   * Acts on the chosen path at once (open that folder, add that root) instead of writing it into the field,
   * which keeps what was typed. It runs while the button is still busy, and its failure goes to `onError`.
   * The choice is dropped when the field was removed or disabled meanwhile; an edit does not drop it.
   */
  commit?: (path: string) => void | Promise<void>;
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
    const live = () => root.isConnected && root.contains(input) && !input.disabled && !input.readOnly;
    // A choice written into the field yields to an edit made meanwhile; one acted on does not touch the field.
    const current = () => live() && (options.commit !== undefined || (!edited && input.value === original));
    try {
      const path = await options.choose();
      if (path !== null && current()) {
        if (options.commit) await options.commit(path);
        else {
          input.value = path;
          for (const type of ['input', 'change']) input.dispatchEvent(new Event(type, { bubbles: true }));
        }
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
