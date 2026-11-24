// The look of the suite (ts/preset.ts): what it states is exactly what was approved, and what Sigrid's engine makes of it
// holds every contrast, for the five apps and in both schemes.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { contrast, over, tokensFor } from '@acaprino/sigrid';
import { defineApp } from '../lib/app.js';
import { accentsOf, SHELL_TONE, shellTheme } from '../lib/preset.js';

/** The accent of each app as it was approved: its hue, and the accent of each scheme. */
const ACCENTS = [
  { id: 'daodan', hue: 235, dark: '#6ed0ff', light: '#006398' },
  { id: 'xiox', hue: 75, dark: '#f2b966', light: '#844c00' },
  { id: 'muro', hue: 170, dark: '#68ddb8', light: '#00714f' },
  { id: 'shinatama', hue: 355, dark: '#ffa3c8', light: '#90355e' },
  { id: 'mukade', hue: 300, dark: '#d0b2ff', light: '#674698' },
];
const SCHEMES = ['dark', 'light'] as const;

describe('the accent', () => {
  for (const { id, hue, dark, light } of ACCENTS) {
    test(`${id}: from either of its two colours comes its hue, and both`, () => {
      for (const accent of [dark, light, light.toUpperCase()]) assert.deepEqual(accentsOf(accent), { hue, dark, light });
    });
  }

  test('a colour that is not one of the suite gives its hue at the suite\'s lightness and saturation', () => {
    const { hue, dark, light } = accentsOf('#ff0000');
    assert.ok(hue >= 15 && hue <= 45, `the hue of red is ${hue}`);
    assert.notEqual(light, '#ff0000');
    assert.ok(contrast(dark, '#1a202c') >= 4.5 && contrast(light, '#ffffff') >= 4.5);
  });

  test('defineApp refuses what is not a colour', () => {
    const app = { id: 'x', name: 'X', lang: 'en', storage: { scheme: 'x.theme', zoom: 'x.zoom' } };
    for (const accent of ['red', '#fff', '006398', '']) assert.throws(() => defineApp({ ...app, accent }), /#rrggbb/);
    assert.equal(defineApp({ ...app, accent: '#006398' }).theme.label, 'X');
  });
});

describe('what the preset states', () => {
  const theme = shellTheme({ id: 'daodan', name: 'Daodan', accent: '#006398' });

  test('the surfaces, the corners, the keys, the controls and the tone are those approved', () => {
    assert.deepEqual(theme.surfaces, {
      dark: { paper: '#1a202c', sidebar: '#12161e', raised: '#232834', line: '#2a3240', ink: '#e8ecf3', input: '#8791a6', accent: '#6ed0ff', fill: '#6ed0ff' },
      light: { paper: '#ffffff', sidebar: '#f6f7f9', raised: '#ffffff', line: '#e3e6ea', ink: '#111827', input: '#767e8b', accent: '#006398', fill: '#006398' },
    });
    const { shape, radii, keys, controls, tabs, statusStrip } = theme;
    assert.deepEqual({ shape, radii, keys, controls, tabs, statusStrip }, { shape: 'soft', radii: { sm: 4, md: 6, lg: 10, xl: 10, chip: 4 }, keys: 'boxed', controls: 'strong', tabs: 'bold', statusStrip: 'tall' });
    assert.deepEqual(SHELL_TONE, { intensity: 'theme', light: 'theme' });
  });

  for (const { id, dark, light } of ACCENTS) {
    for (const scheme of SCHEMES) {
      test(`${id}, ${scheme}: the engine keeps every stated colour as it is written`, () => {
        const { colors, attributes, corrected } = tokensFor(shellTheme({ id, name: id, accent: light }), scheme, SHELL_TONE);
        const stated = theme.surfaces![scheme];
        assert.deepEqual(corrected, []);
        assert.equal(attributes['data-keys'], 'boxed');
        assert.equal(attributes['data-controls'], 'strong');
        assert.equal(attributes['data-tabs'], 'bold');
        assert.equal(attributes['data-status-strip'], 'tall');
        assert.deepEqual(
          { paper: colors.paper, ground: colors['sidebar-paper'], raised: colors.raised, line: colors.line, ink: colors.ink, input: colors.input, accent: colors.accent, primary: colors.primary },
          { paper: stated.paper, ground: stated.sidebar, raised: stated.raised, line: stated.line, ink: stated.ink, input: stated.input, accent: scheme === 'dark' ? dark : light, primary: scheme === 'dark' ? dark : light },
        );
      });
    }
  }
});

describe('contrast', () => {
  /** Every pair that must hold, with what it needs: text at 4.5, a part of the interface at 3. */
  function pairs(c: Record<string, string>): [string, number, number][] {
    const out: [string, number, number][] = [];
    const text = (name: string, on: string, under: string) => out.push([name, contrast(on, under), 4.5]);
    const part = (name: string, on: string, under: string) => out.push([name, contrast(on, under), 3]);
    for (const ground of ['paper', 'paper-2', 'raised', 'sidebar-paper']) {
      const bg = c[ground];
      for (const ink of ['ink', 'ink-soft', 'ink-mute', 'accent', 'success', 'warning', 'destructive', 'info']) text(`${ink} on ${ground}`, c[ink], bg);
      text(`ink-mute on a hovered row of ${ground}`, c['ink-mute'], over(c.selected, bg, 0.6));
      for (const line of ['input', 'ring', 'primary']) part(`${line} on ${ground}`, c[line], bg);
    }
    text('the text of a chosen row', c['selected-ink'], c.selected);
    text('the second line of a chosen row', over(c['selected-ink'], c.selected, 0.8), c.selected);
    for (const ink of ['ink-soft', 'ink-mute']) text(`${ink} on a chosen row`, c[ink], c.selected);
    for (const fill of ['primary', 'accent-hover']) text(`the label on ${fill}`, c['primary-foreground'], c[fill]);
    for (const tone of ['success', 'warning', 'destructive', 'info']) {
      text(`the badge ${tone}`, c[tone], c[`${tone}-soft`]);
      text(`ink on ${tone}-soft`, c.ink, c[`${tone}-soft`]);
    }
    text('the neutral badge', c.ink, over(c.ink, c.paper, 0.06));
    text('a notice', c.paper, c.ink);
    text('the chosen item of a segment', c.ink, over(c.accent, c['paper-2'], 0.16));
    for (const line of ['input', 'ring']) part(`${line} on a chosen row`, c[line], c.selected);
    return out;
  }

  for (const { id, light } of ACCENTS) {
    for (const scheme of SCHEMES) {
      test(`${id}, ${scheme}: every text is 4.5:1 or more and every part 3:1`, (t) => {
        const measured = pairs(tokensFor(shellTheme({ id, name: id, accent: light }), scheme, SHELL_TONE).colors as Record<string, string>);
        assert.ok(measured.length >= 60, `only ${measured.length} pairs`);
        const worst = (needs: number) => measured.filter((pair) => pair[2] === needs).reduce((a, b) => (b[1] < a[1] ? b : a));
        for (const needs of [4.5, 3]) t.diagnostic(`least of ${needs}: ${worst(needs)[0]}, ${worst(needs)[1].toFixed(2)}`);
        assert.deepEqual(measured.filter(([, ratio, needs]) => !(ratio >= needs)).map(([name, ratio]) => `${name} ${ratio.toFixed(2)}`), []);
      });
    }
  }
});
