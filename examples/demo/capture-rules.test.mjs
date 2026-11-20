// node --test examples/demo/capture-rules.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeSavedTheme, judgeSheetDenser, judgeShowThrough, judgeTitleBar } from './capture-rules.mjs';

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
  assert.deepEqual(judgeShowThrough({ overDark: [23, 26, 37], overBright: [29, 32, 44] }), []);
  const solid = judgeShowThrough({ overDark: [24, 27, 38], overBright: [24, 27, 38] });
  assert.equal(solid.length, 1);
  assert.match(solid[0], /does not show through/);
  assert.equal(judgeShowThrough({ overDark: [24, 27, 38], overBright: [26, 28, 39] }).length, 1, 'two levels is rounding, not the backdrop');
});

test('the backdrop shows through a light frost as it was measured: 11 levels under Smooth, 8 under ONI', () => {
  assert.deepEqual(judgeShowThrough({ overDark: [233, 234, 236], overBright: [244, 245, 247] }), [], 'Smooth light, run 2');
  assert.deepEqual(judgeShowThrough({ overDark: [225, 229, 238], overBright: [233, 237, 246] }), [], 'ONI light, run 2');
});

test('a light frost that is the same over both windows is a solid fallback, as a dark one is', () => {
  const solid = judgeShowThrough({ overDark: [242, 243, 245], overBright: [242, 243, 245] });
  assert.equal(solid.length, 1);
  assert.match(solid[0], /does not show through/);
  assert.equal(judgeShowThrough({ overDark: [242, 243, 245], overBright: [243, 244, 246] }).length, 1, 'two levels is rounding, not the backdrop');
});

test('the work sheet is denser than the frame when the backdrop moves it less', () => {
  const frame = { overDark: [23, 26, 37], overBright: [34, 37, 50] };
  assert.deepEqual(judgeSheetDenser({ frame, sheet: { overDark: [30, 36, 48], overBright: [33, 39, 52] } }), []);
  const thin = judgeSheetDenser({ frame, sheet: { overDark: [30, 36, 48], overBright: [50, 56, 70] } });
  assert.equal(thin.length, 1);
  assert.match(thin[0], /not denser/);
});

// The page's own boot call sends `dark` once it is mounted (gallery/main.ts starts on Smooth dark), so a colour scheme read
// after the restart can come from the saved theme, from Windows' own theme, or from that call.
const saved = (windows, theme, scheme, mounted) => judgeSavedTheme({ saved: theme, windows, scheme, mounted }).verdict;

test('with Windows apps light the saved theme is dark: a light read is a failure, a dark read proves it only before the page mounted', () => {
  assert.equal(saved('light', 'dark', 'light', true), 'failed');
  assert.equal(saved('light', 'dark', 'light', false), 'failed');
  assert.equal(saved('light', 'dark', 'dark', false), 'delivered');
  assert.equal(saved('light', 'dark', 'dark', true), 'unproven', 'the boot call sends dark too');
});

test('with Windows apps dark the saved theme is light: a light read proves delivery, a dark read is a failure only before the page mounted', () => {
  assert.equal(saved('dark', 'light', 'light', true), 'delivered');
  assert.equal(saved('dark', 'light', 'light', false), 'delivered');
  assert.equal(saved('dark', 'light', 'dark', false), 'failed');
  assert.equal(saved('dark', 'light', 'dark', true), 'unproven', 'the boot call may have turned the page dark before the read');
});

test('when Windows theme cannot be read a light read may be Windows own, and a dark read before the mount is still a failure', () => {
  assert.equal(saved(null, 'light', 'light', false), 'unproven');
  assert.equal(saved(null, 'light', 'light', true), 'unproven');
  assert.equal(saved(null, 'light', 'dark', false), 'failed');
  assert.equal(saved(null, 'light', 'dark', true), 'unproven');
});

test('every verdict says why, and a failure names the saved theme and the scheme that was read', () => {
  const failed = judgeSavedTheme({ saved: 'dark', windows: 'light', scheme: 'light', mounted: true });
  assert.match(failed.why, /light/);
  assert.match(failed.why, /saved/);
  for (const mounted of [true, false]) {
    for (const scheme of ['light', 'dark']) assert.ok(judgeSavedTheme({ saved: 'dark', windows: 'light', scheme, mounted }).why.length > 20);
  }
});
