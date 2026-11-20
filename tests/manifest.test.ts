import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTROLS } from '../gallery/manifest.ts';

// The control set of docs/design.md, section "Controls", as manifest ids. Inspector, Sheet and Dialog are surfaces:
// css/surfaces.css draws them and the gallery shows them live, so the state matrix does not repeat them. Menu is
// there as its item; Tooltip is the `title` attribute, with nothing to draw.
const CONTROL_SET: Record<string, string[]> = {
  Button: ['button-primary', 'button-secondary', 'button-ghost', 'button-danger', 'button-confirm-danger', 'icon-button'],
  'Key cap': ['key'],
  Count: ['count'],
  Field: ['field'],
  Search: ['search'],
  Select: ['select'],
  Checkbox: ['checkbox'],
  Radio: ['radio'],
  Switch: ['switch'],
  Tabs: ['tab'],
  Segmented: ['segmented'],
  Menu: ['menu-item'],
  Row: ['row'],
  Table: ['table-row'],
  Facts: ['facts'],
  Tree: ['tree'],
  Avatar: ['avatar'],
  'Status chip': ['chip'],
  Notice: ['note'],
  Progress: ['progress'],
  Steps: ['steps'],
};

// Controls the keyboard never reaches: display only, so there is no focus state to draw.
const NOT_FOCUSABLE = ['chip', 'count', 'key', 'avatar', 'progress', 'note', 'steps', 'facts'];

const STATES = ['rest', 'hover', 'press', 'focus', 'selected', 'disabled', 'busy', 'invalid', 'readonly'];

const byId = new Map(CONTROLS.map((control) => [control.id, control]));

test('every control of the spec has a manifest entry', () => {
  for (const [name, ids] of Object.entries(CONTROL_SET)) {
    for (const id of ids) assert.ok(byId.has(id), `${name}: no manifest entry "${id}"`);
  }
});

test('the manifest names no control twice and no control outside the set', () => {
  assert.equal(byId.size, CONTROLS.length, 'an id appears twice');
  const known = new Set(Object.values(CONTROL_SET).flat());
  for (const { id } of CONTROLS) assert.ok(known.has(id), `"${id}" is not in the control set of the spec`);
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
});
