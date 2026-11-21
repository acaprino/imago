import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTROLS, NATIVE_TWINS } from '../gallery/manifest.ts';

// The manifest is the matrix of controls and their states. These names of the control set are not in it, each proven
// where it is drawn:
//   inspector, sheet, dialog  surfaces drawn by css/surfaces.css and ts/ui; tests/gallery/surfaces.mjs proves them
//   menu                      its item is the `menu-item` row; tests/gallery/surfaces.mjs proves the menu itself
//   tooltip                   the `title` attribute, nothing is drawn; tests/gallery/controls.mjs checks the titles of long labels
const SURFACES_PROVEN_ELSEWHERE = ['inspector', 'sheet', 'dialog', 'tooltip', 'menu'];

// Each name of the control set of docs/design.md, and the manifest ids that draw it.
const MANIFEST_IDS: Record<string, string[]> = {
  button: ['button-primary', 'button-secondary', 'button-ghost', 'button-danger', 'button-confirm-danger', 'icon-button'],
  'key cap': ['key'],
  count: ['count'],
  field: ['field', 'field-bare', 'textarea'],
  search: ['search'],
  select: ['select', 'select-native'],
  checkbox: ['checkbox', 'checkbox-native'],
  radio: ['radio', 'radio-native'],
  switch: ['switch', 'switch-native'],
  tabs: ['tab'],
  segmented: ['segmented', 'segmented-native'],
  menu: ['menu-item'],
  tooltip: [],
  row: ['row'],
  table: ['table-row'],
  facts: ['facts'],
  tree: ['tree'],
  avatar: ['avatar'],
  'status chip': ['chip'],
  notice: ['note'],
  progress: ['progress'],
  steps: ['steps'],
  inspector: [],
  sheet: [],
  dialog: [],
};

// Controls the keyboard never reaches: display only, so there is no focus state to draw.
const NOT_FOCUSABLE = ['chip', 'count', 'key', 'avatar', 'progress', 'note', 'steps', 'facts'];

const STATES = ['rest', 'hover', 'press', 'focus', 'selected', 'disabled', 'busy', 'invalid', 'readonly'];

const byId = new Map(CONTROLS.map((control) => [control.id, control]));

// The control set as the design names it: "Set: Button (primary, ...), Key cap, Count; Field, ... Dialog."
function specControlSet(): string[] {
  const design = readFileSync(new URL('../docs/design.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const match = design.match(/^Set: ([\s\S]*?)\.\n/m);
  assert.ok(match, 'docs/design.md has no "Set:" line for the control set');
  return match[1]
    .replace(/\([^)]*\)/g, '')
    .split(/[,;]\s*|\s*\n\s*/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
}

test('the control set of the spec is the manifest plus the names proven elsewhere', () => {
  const spec = specControlSet();
  assert.ok(spec.length >= 20, `only ${spec.length} names were read from the spec: ${spec.join(', ')}`);
  assert.deepEqual([...spec].sort(), Object.keys(MANIFEST_IDS).sort(), 'a control was added to or removed from the spec; map it to the manifest or to SURFACES_PROVEN_ELSEWHERE');
  const drawn = Object.entries(MANIFEST_IDS).filter(([, ids]) => ids.length > 0).map(([name]) => name);
  const named = [...new Set([...drawn, ...SURFACES_PROVEN_ELSEWHERE])].sort();
  assert.deepEqual([...spec].sort(), named, 'every name of the spec is either in the manifest or in SURFACES_PROVEN_ELSEWHERE, and nothing else is listed');
});

test('every manifest id belongs to a name of the spec, and every id a name lists exists', () => {
  const claimed = Object.values(MANIFEST_IDS).flat();
  for (const id of claimed) assert.ok(byId.has(id), `no manifest entry "${id}"`);
  for (const { id } of CONTROLS) assert.ok(claimed.includes(id), `"${id}" is in the manifest but in no name of the control set`);
  assert.equal(new Set(claimed).size, claimed.length, 'a manifest id is claimed by two names');
});

test('the manifest names no control twice', () => {
  assert.equal(byId.size, CONTROLS.length, 'an id appears twice');
});

test('every entry has rest and focus unless it is not focusable', () => {
  for (const { id, states } of CONTROLS) {
    assert.ok(states.includes('rest'), `${id} has no rest state`);
    if (NOT_FOCUSABLE.includes(id)) assert.ok(!states.includes('focus'), `${id} is display only and must not list focus`);
    else assert.ok(states.includes('focus'), `${id} has no focus state`);
  }
});

test('every state is a known state, listed once', () => {
  for (const { id, states } of CONTROLS) {
    assert.equal(new Set(states).size, states.length, `${id} lists a state twice`);
    for (const state of states) assert.ok(STATES.includes(state), `${id}: unknown state "${state}"`);
  }
});

test('the states a control can only have once it is interactive are listed where they apply', () => {
  const has = (id: string, state: string) => byId.get(id)?.states.includes(state as never);
  for (const id of ['button-primary', 'button-secondary', 'button-ghost', 'button-danger', 'button-confirm-danger']) {
    for (const state of ['hover', 'press', 'focus', 'disabled', 'busy']) assert.ok(has(id, state), `${id} lacks ${state}`);
  }
  assert.ok(has('field', 'invalid') && has('field', 'readonly'), 'a field can be invalid and read-only');
  for (const id of ['tab', 'row', 'tree', 'table-row', 'menu-item', 'checkbox', 'radio', 'switch', 'segmented']) {
    assert.ok(has(id, 'selected'), `${id} lacks selected`);
  }
  assert.ok(has('steps', 'selected'), 'steps show the current step as selected');
  assert.ok(has('progress', 'busy'), 'progress shows the indeterminate one as busy');
  for (const id of ['button-primary', 'button-secondary', 'button-ghost', 'button-danger', 'button-confirm-danger']) {
    assert.ok(has(id, 'selected'), `${id} can be pressed (aria-pressed) and shows it as selected`);
  }
});

// A control drawn on a native element and on an ARIA element is drawn once: the matrix shows both, in the same states, and
// tests/gallery/controls.mjs measures that each native cell is drawn as its twin's.
test('each native control has the states of the control it is drawn as', () => {
  assert.deepEqual(Object.keys(NATIVE_TWINS).sort(), ['checkbox-native', 'field-bare', 'radio-native', 'segmented-native', 'select-native', 'switch-native', 'textarea']);
  for (const [native, twin] of Object.entries(NATIVE_TWINS)) {
    assert.ok(byId.has(native) && byId.has(twin), `${native} and ${twin} are both in the manifest`);
    assert.deepEqual(byId.get(native)?.states, byId.get(twin)?.states, `${native} has the states of ${twin}`);
  }
});
