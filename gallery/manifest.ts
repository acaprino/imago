// The state matrix of the gallery: every control and the states it can be in. It is the list of the preview's
// matrix (docs/reference/toolkit-preview.html, `ROWS`) plus the controls the preview did not draw. The matrix
// (gallery/matrix.ts) renders one cell for every pair named here, and tests/gallery/controls.mjs checks them.
// Erasable TypeScript only: tests/manifest.test.ts imports this file with Node's type stripping.

export type State = 'rest' | 'hover' | 'press' | 'focus' | 'selected' | 'disabled' | 'busy' | 'invalid' | 'readonly';

export interface Control {
  id: string;
  states: State[];
}

const PUSH: State[] = ['rest', 'hover', 'press', 'focus', 'disabled', 'busy'];
const PICK: State[] = ['rest', 'hover', 'focus', 'selected', 'disabled'];

const FIELD: State[] = ['rest', 'hover', 'focus', 'disabled', 'invalid', 'readonly'];
const SELECT: State[] = ['rest', 'hover', 'focus', 'disabled'];

/** The controls drawn on a native element (an input, a select, a text area, radios under labels), each with the control it
 * is drawn as: one drawing serves both markups, and tests/gallery/controls.mjs measures that the two cells of a state match. */
export const NATIVE_TWINS: Record<string, string> = {
  'checkbox-native': 'checkbox',
  'radio-native': 'radio',
  'switch-native': 'switch',
  'select-native': 'select',
  'segmented-native': 'segmented',
  textarea: 'field',
};

export const CONTROLS: Control[] = [
  { id: 'button-primary', states: PUSH },
  // A neutral and a ghost button can be pressed (aria-pressed): selected is that state.
  { id: 'button-secondary', states: [...PUSH, 'selected'] },
  { id: 'button-ghost', states: [...PUSH, 'selected'] },
  { id: 'button-danger', states: PUSH },
  { id: 'button-confirm-danger', states: PUSH },
  { id: 'icon-button', states: ['rest', 'hover', 'press', 'focus', 'disabled'] },
  { id: 'field', states: FIELD },
  { id: 'textarea', states: FIELD },
  { id: 'search', states: ['rest', 'hover', 'focus', 'disabled'] },
  { id: 'select', states: SELECT },
  { id: 'select-native', states: SELECT },
  { id: 'checkbox', states: PICK },
  { id: 'checkbox-native', states: PICK },
  { id: 'radio', states: PICK },
  { id: 'radio-native', states: PICK },
  { id: 'switch', states: PICK },
  { id: 'switch-native', states: PICK },
  { id: 'tab', states: PICK },
  { id: 'segmented', states: PICK },
  { id: 'segmented-native', states: PICK },
  { id: 'row', states: PICK },
  { id: 'tree', states: PICK },
  { id: 'table-row', states: ['rest', 'hover', 'focus', 'selected'] },
  { id: 'menu-item', states: PICK },
  { id: 'steps', states: ['rest', 'selected'] },
  { id: 'progress', states: ['rest', 'busy'] },
  // Display only: nothing to focus, press or select.
  { id: 'key', states: ['rest'] },
  { id: 'count', states: ['rest'] },
  { id: 'chip', states: ['rest'] },
  { id: 'avatar', states: ['rest'] },
  { id: 'facts', states: ['rest'] },
  { id: 'note', states: ['rest'] },
];
