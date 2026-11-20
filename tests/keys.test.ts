import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextIndex } from '../ts/ui/keys.ts';

test('a vertical list stops at its first row on ArrowUp', () => {
  assert.equal(nextIndex(0, 3, 'ArrowUp', 'vertical'), 0);
});

test('a vertical list stops at its last row on ArrowDown', () => {
  assert.equal(nextIndex(2, 3, 'ArrowDown', 'vertical'), 2);
});

test('a vertical list moves one row at a time', () => {
  assert.equal(nextIndex(1, 3, 'ArrowDown', 'vertical'), 2);
  assert.equal(nextIndex(1, 3, 'ArrowUp', 'vertical'), 0);
});

test('End goes to the last row and Home to the first, in both orientations', () => {
  assert.equal(nextIndex(1, 3, 'End', 'vertical'), 2);
  assert.equal(nextIndex(1, 3, 'Home', 'vertical'), 0);
  assert.equal(nextIndex(1, 3, 'End', 'horizontal'), 2);
  assert.equal(nextIndex(1, 3, 'Home', 'horizontal'), 0);
});

test('a vertical list ignores ArrowLeft and ArrowRight', () => {
  assert.equal(nextIndex(1, 3, 'ArrowLeft', 'vertical'), -1);
  assert.equal(nextIndex(1, 3, 'ArrowRight', 'vertical'), -1);
});

test('a horizontal list moves on ArrowLeft and ArrowRight, clamps, and ignores ArrowUp and ArrowDown', () => {
  assert.equal(nextIndex(1, 3, 'ArrowRight', 'horizontal'), 2);
  assert.equal(nextIndex(1, 3, 'ArrowLeft', 'horizontal'), 0);
  assert.equal(nextIndex(0, 3, 'ArrowLeft', 'horizontal'), 0);
  assert.equal(nextIndex(2, 3, 'ArrowRight', 'horizontal'), 2);
  assert.equal(nextIndex(1, 3, 'ArrowUp', 'horizontal'), -1);
  assert.equal(nextIndex(1, 3, 'ArrowDown', 'horizontal'), -1);
});

test('an empty list has nowhere to go', () => {
  assert.equal(nextIndex(-1, 0, 'ArrowDown', 'vertical'), -1);
  assert.equal(nextIndex(0, 0, 'Home', 'vertical'), -1);
  assert.equal(nextIndex(0, 0, 'End', 'horizontal'), -1);
});

test('with no current row, ArrowDown and ArrowUp land on the first row', () => {
  assert.equal(nextIndex(-1, 3, 'ArrowDown', 'vertical'), 0);
  assert.equal(nextIndex(-1, 3, 'ArrowUp', 'vertical'), 0);
});

test('a current index past the end is clamped to the last row', () => {
  assert.equal(nextIndex(7, 3, 'ArrowDown', 'vertical'), 2);
  assert.equal(nextIndex(7, 3, 'ArrowUp', 'vertical'), 2);
});

test('a single row stays where it is', () => {
  assert.equal(nextIndex(0, 1, 'ArrowDown', 'vertical'), 0);
  assert.equal(nextIndex(0, 1, 'ArrowUp', 'vertical'), 0);
  assert.equal(nextIndex(0, 1, 'End', 'vertical'), 0);
});
