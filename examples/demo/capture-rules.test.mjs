// node --test examples/demo/capture-rules.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeOpaque, judgeSavedTheme, judgeThemes } from './capture-rules.mjs';

test('an opaque page is the same over a dark and over a bright window; one level of rounding is still the same', () => {
  assert.deepEqual(judgeOpaque({ overDark: [240, 241, 243], overBright: [240, 241, 243] }), []);
  assert.deepEqual(judgeOpaque({ overDark: [240, 241, 243], overBright: [241, 241, 242] }), []);
});

test('a page the backdrop shows through, or a window in front of it, fails', () => {
  const problems = judgeOpaque({ overDark: [23, 26, 35], overBright: [40, 43, 52] });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /shows through/);
});

test('a black pixel is a screen that could not be read, and says so', () => {
  assert.match(judgeOpaque({ overDark: [0, 0, 0], overBright: [0, 0, 0] })[0], /screen cannot be read/);
});

test('light is brighter than dark', () => {
  assert.deepEqual(judgeThemes({ dark: [30, 31, 33], light: [240, 241, 243] }), []);
  assert.match(judgeThemes({ dark: [240, 241, 243], light: [240, 241, 243] })[0], /did not reach the page/);
});

// The page's own boot call sends the choice it keeps, which is the saved theme, once it is mounted.
const saved = (windows, theme, scheme, mounted) => judgeSavedTheme({ saved: theme, windows, scheme, mounted }).verdict;

test('a scheme that is not the saved one is a failure, whenever it was read and whatever Windows says', () => {
  for (const windows of ['light', 'dark', null]) {
    for (const mounted of [true, false]) {
      assert.equal(saved(windows, 'dark', 'light', mounted), 'failed');
      assert.equal(saved(windows, 'light', 'dark', mounted), 'failed');
    }
  }
});

test('the saved scheme proves delivery only before the page mounted, and only when it is not Windows\' own', () => {
  assert.equal(saved('light', 'dark', 'dark', false), 'delivered');
  assert.equal(saved('dark', 'light', 'light', false), 'delivered');
  assert.equal(saved('light', 'dark', 'dark', true), 'unproven', 'the boot call sends dark too');
  assert.equal(saved('dark', 'dark', 'dark', false), 'unproven', 'Windows is dark too');
  assert.equal(saved(null, 'light', 'light', false), 'unproven', 'Windows may be light too');
});

test('every verdict says why, and a failure names the saved theme and the scheme that was read', () => {
  const failed = judgeSavedTheme({ saved: 'dark', windows: 'light', scheme: 'light', mounted: true });
  assert.match(failed.why, /light/);
  assert.match(failed.why, /saved/);
  for (const mounted of [true, false]) {
    for (const scheme of ['light', 'dark']) assert.ok(judgeSavedTheme({ saved: 'dark', windows: 'light', scheme, mounted }).why.length > 20);
  }
});
