// node --test examples/demo/capture-rules.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeSheetDenser, judgeShowThrough, judgeTitleBar } from './capture-rules.mjs';

const bar = (look, theme, backdrop, pixel) => judgeTitleBar({ look, theme, backdrop, pixel });

test('Smooth dark over a dark window passes at the measured slate and fails at a neutral grey far from it', () => {
  assert.deepEqual(bar('smooth', 'dark', 'over-dark', [23, 26, 37]), []);
  assert.deepEqual(bar('smooth', 'dark', 'over-dark', [33, 35, 45]), [], '10 levels away is inside the 12');
  const grey = bar('smooth', 'dark', 'over-dark', [40, 40, 40]);
  assert.equal(grey.length, 1);
  assert.match(grey[0], /more than 12 levels from 23,26,37/);
});

test('Smooth light over a dark window passes at the measured frost and fails when the acrylic was dark under it', () => {
  assert.deepEqual(bar('smooth', 'light', 'over-dark', [241, 241, 242]), []);
  assert.equal(bar('smooth', 'light', 'over-dark', [225, 226, 230]).length, 1);
});

test('the number of Shinatama is the judgement over the dark window only', () => {
  assert.deepEqual(bar('smooth', 'dark', 'over-bright', [34, 37, 48]), []);
  assert.deepEqual(bar('smooth', 'light', 'over-bright', [250, 250, 251]), []);
});

test('a title bar that is the solid opaque ground fails in every look and theme: the material was not painted', () => {
  for (const [look, theme, ground] of [['smooth', 'dark', [18, 22, 30]], ['smooth', 'light', [246, 247, 249]], ['oni', 'dark', [11, 4, 22]], ['oni', 'light', [233, 238, 248]]]) {
    for (const backdrop of ['over-dark', 'over-bright']) {
      const problems = bar(look, theme, backdrop, ground);
      assert.ok(problems.some((text) => /opaque ground/.test(text)), `${look} ${theme} ${backdrop}: ${problems.join(' | ')}`);
    }
  }
});

test('a black title bar is a screen that could not be read, and says so instead of a wrong colour', () => {
  const black = bar('smooth', 'dark', 'over-dark', [0, 0, 0]);
  assert.equal(black.length, 1);
  assert.match(black[0], /screen cannot be read/);
});

test('one level of rounding off the ground is still the ground, five levels is glass', () => {
  assert.equal(bar('oni', 'dark', 'over-dark', [12, 5, 21]).length, 1);
  assert.deepEqual(bar('oni', 'dark', 'over-dark', [16, 9, 27]), []);
});

test('the backdrop shows through a dark frame: the same pixel over both windows is a solid fallback', () => {
  assert.deepEqual(judgeShowThrough({ theme: 'dark', overDark: [23, 26, 37], overBright: [29, 32, 44] }), []);
  const solid = judgeShowThrough({ theme: 'dark', overDark: [24, 27, 38], overBright: [24, 27, 38] });
  assert.equal(solid.length, 1);
  assert.match(solid[0], /does not show through/);
  assert.equal(judgeShowThrough({ theme: 'dark', overDark: [24, 27, 38], overBright: [26, 28, 39] }).length, 1, 'two levels is rounding, not the backdrop');
});

test('a light frost is not judged by the backdrop: its acrylic moves too little for two windows to tell', () => {
  assert.deepEqual(judgeShowThrough({ theme: 'light', overDark: [242, 243, 245], overBright: [242, 243, 245] }), []);
});

test('the work sheet is denser than the frame when the backdrop moves it less', () => {
  const frame = { overDark: [23, 26, 37], overBright: [34, 37, 50] };
  assert.deepEqual(judgeSheetDenser({ frame, sheet: { overDark: [30, 36, 48], overBright: [33, 39, 52] } }), []);
  const thin = judgeSheetDenser({ frame, sheet: { overDark: [30, 36, 48], overBright: [50, 56, 70] } });
  assert.equal(thin.length, 1);
  assert.match(thin[0], /not denser/);
});
