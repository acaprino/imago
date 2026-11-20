import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { colorValueToHex, contrast, hexToOklab, oklchToHex, over } from '../scripts/color.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokensFile = join(root, 'tokens', 'imago.tokens.json');
const cssFile = join(root, 'css', 'tokens.css');
const buildScript = join(root, 'scripts', 'build-tokens.mjs');

// The JSON is walked as plain data; a token is any object with "$value".
type Tree = { [key: string]: any };
const tokens: Tree = JSON.parse(readFileSync(tokensFile, 'utf8'));
const css = (): string => readFileSync(cssFile, 'utf8').replace(/\r\n/g, '\n');

const apps = ['shinatama', 'xiox', 'mukade', 'muro', 'daodan'];
const looks = ['smooth', 'oni'];
const themes = ['dark', 'light'];
const hues = [75, 355, 300, 170, 235];

const at = (path: string): Tree => path.split('.').reduce((node: Tree, key) => {
  assert.ok(node && key in node, `${path}: no "${key}" in the token file`);
  return node[key];
}, tokens);

// Resolves a colour token to #RRGGBB (or #RRGGBBAA), following aliases; `hue` fills an oklch hue left as "none".
function hexOf(path: string, hue?: number, glass = false): string {
  const token = at(path);
  assert.equal(token.$type, 'color', `${path} is not a colour`);
  assert.equal(token.$extensions?.imago?.mix, undefined, `${path} is a mix, which the tests do not resolve`);
  const value = glass ? (token.$extensions?.imago?.glass ?? token.$value) : token.$value;
  const alias = typeof value === 'string' ? /^\{(.+)\}$/.exec(value) : null;
  return alias ? hexOf(alias[1], hue, glass) : colorValueToHex(value, hue);
}

// The value of a colour of a look and theme where no glass is on: what the tests check contrast against.
const lookColor = (look: string, theme: string, name: string): string => hexOf(`look.${look}.${theme}.${name}`);
const accentColor = (theme: string, name: string, app: string): string => hexOf(`accent.${theme}.${name}`, at(`app.${app}.hue`).$value);

test('oklchToHex clips into sRGB and agrees with the sRGB primaries', () => {
  assert.match(oklchToHex(0.47, 0.13, 355), /^#[0-9A-F]{6}$/);
  assert.equal(oklchToHex(1, 0, 0), '#FFFFFF');
  assert.equal(oklchToHex(0, 0, 0), '#000000');
  assert.equal(oklchToHex(0.6279553606, 0.2576833077, 29.2338851923), '#FF0000');
  assert.equal(oklchToHex(0.8664396115, 0.2948272403, 142.4953388878), '#00FF00');
  assert.equal(oklchToHex(0.4520137184, 0.3132143717, 264.0520206381), '#0000FF');
  assert.match(oklchToHex(0.5, 0.4, 30), /^#[0-9A-F]{6}$/, 'a colour outside sRGB is clipped, not rejected');
});

test('contrast is the WCAG ratio and over composites in sRGB', () => {
  assert.equal(contrast('#FFFFFF', '#000000'), 21);
  assert.equal(contrast('#336699', '#336699'), 1);
  assert.equal(contrast('#000000', '#FFFFFF'), contrast('#FFFFFF', '#000000'));
  assert.equal(over('#FF000080', '#000000'), '#800000');
  assert.equal(over('#12345600', '#ABCDEF'), '#ABCDEF');
  assert.equal(over('#123456FF', '#ABCDEF'), '#123456');
  assert.equal(over('#123456', '#ABCDEF'), '#123456');
});

test('the accent fill on light takes white text at 4.5:1 for every hue', () => {
  for (const h of hues) {
    const fill = oklchToHex(0.47, 0.13, h);
    assert.ok(contrast('#FFFFFF', fill) >= 4.5, `hue ${h}: white on ${fill} is ${contrast('#FFFFFF', fill).toFixed(2)}`);
  }
});

test('the text on the dark accent reaches 4.5:1 for every hue', () => {
  for (const h of hues) {
    const text = oklchToHex(0.2, 0.04, h);
    const fill = oklchToHex(0.82, 0.12, h);
    assert.ok(contrast(text, fill) >= 4.5, `hue ${h}: ${text} on ${fill} is ${contrast(text, fill).toFixed(2)}`);
  }
});

test('the five dark accents differ by less than 0.02 in OKLab lightness after clipping', () => {
  const lightness = hues.map((h) => hexToOklab(oklchToHex(0.82, 0.12, h))[0]);
  const spread = Math.max(...lightness) - Math.min(...lightness);
  assert.ok(spread < 0.02, `spread ${spread.toFixed(4)} (${lightness.map((l) => l.toFixed(4)).join(', ')})`);
});

test('the accent tokens carry the formulas of the Global Constraints', () => {
  const oklch = (l: number, c: number) => ({ colorSpace: 'oklch', components: [l, c, 'none'] });
  assert.deepEqual(at('accent.dark.accent').$value, oklch(0.82, 0.12));
  assert.deepEqual(at('accent.dark.accent-on').$value, oklch(0.2, 0.04));
  assert.deepEqual(at('accent.dark.accent-hi').$value, oklch(0.9, 0.08));
  assert.deepEqual(at('accent.light.accent').$value, oklch(0.47, 0.13));
  assert.equal(hexOf('accent.light.accent-on'), '#FFFFFF');
  for (const theme of themes) assert.equal(at(`accent.${theme}.accent-text`).$value, `{accent.${theme}.accent}`);
  assert.deepEqual(Object.fromEntries(apps.map((app) => [app, at(`app.${app}.hue`).$value])), {
    shinatama: 355, xiox: 75, mukade: 300, muro: 170, daodan: 235,
  });
});

const onSurfaces = ['text', 'text-2', 'text-hi', 'muted', 'accent-text', 'ok', 'warn', 'err', 'info'];
const surfaces = ['ground', 'sheet', 'float'];

for (const look of looks) {
  for (const theme of themes) {
    for (const app of apps) {
      test(`contrast: ${look} ${theme} ${app}`, () => {
        const colour = (name: string): string => (name === 'accent-text' ? accentColor(theme, name, app) : lookColor(look, theme, name));
        const failures: string[] = [];
        const need = (what: string, fg: string, bg: string): void => {
          const ratio = contrast(fg, bg);
          if (ratio < 4.5) failures.push(`${what}: ${fg} on ${bg} is ${ratio.toFixed(2)}`);
        };
        for (const text of onSurfaces) {
          for (const surface of surfaces) need(`${text} on ${surface}`, colour(text), lookColor(look, theme, surface));
        }
        need('accent-on on accent', accentColor(theme, 'accent-on', app), accentColor(theme, 'accent', app));
        need('danger-on on danger', lookColor(look, theme, 'danger-on'), lookColor(look, theme, 'danger'));
        const chip = over(lookColor(look, theme, 'chip'), lookColor(look, theme, 'sheet'));
        need('muted on chip', lookColor(look, theme, 'muted'), chip);
        need('chip-text on chip', lookColor(look, theme, 'chip-text'), chip);
        // A key cap in a button and a placeholder in a field are muted text on a control, which may be translucent.
        for (const control of ['button', 'field']) {
          need(`muted on ${control}`, lookColor(look, theme, 'muted'), over(lookColor(look, theme, control), lookColor(look, theme, 'sheet')));
        }
        assert.deepEqual(failures, []);
      });
    }
  }
}

// The custom properties of the stylesheet, by rule. Rules are written one selector per line, one declaration per line.
function declarations(sheet: string, selector: string): Map<string, string> {
  const start = `\n${selector} {\n`;
  const from = ('\n' + sheet).indexOf(start);
  assert.notEqual(from, -1, `css/tokens.css has no rule "${selector}"`);
  const body = ('\n' + sheet).slice(from + start.length).split('\n}')[0];
  const found = new Map<string, string>();
  for (const line of body.split('\n')) {
    const match = /^\s+(--im-[a-z0-9-]+): (.+);$/.exec(line);
    if (match) found.set(match[1], match[2]);
  }
  return found;
}

const colourNames = [
  'ground', 'sheet', 'float', 'field', 'button', 'line', 'line-soft', 'line-strong', 'text', 'text-2', 'text-hi', 'muted',
  'hover', 'press', 'selected', 'chip', 'chip-text', 'skeleton', 'terminal', 'scrim', 'shadow', 'edge',
  'ok', 'warn', 'err', 'info', 'danger', 'danger-on',
];
const accentNames = ['accent', 'accent-on', 'accent-hi', 'accent-text', 'accent-hover'];

test('every look and theme has the colour tokens twice: opaque and under .im-glass', () => {
  const sheet = css();
  for (const look of looks) {
    for (const theme of themes) {
      for (const selector of [`[data-im-look="${look}"][data-im-theme="${theme}"]`, `.im-glass[data-im-look="${look}"][data-im-theme="${theme}"]`]) {
        const found = declarations(sheet, selector);
        const missing = colourNames.filter((name) => !found.has(`--im-${name}`));
        assert.deepEqual(missing, [], `${selector} lacks ${missing.join(', ')}`);
      }
    }
  }
});

test('the glass values differ from the opaque ones exactly where the JSON says so', () => {
  const sheet = css();
  for (const look of looks) {
    for (const theme of themes) {
      const opaque = declarations(sheet, `[data-im-look="${look}"][data-im-theme="${theme}"]`);
      const glass = declarations(sheet, `.im-glass[data-im-look="${look}"][data-im-theme="${theme}"]`);
      const differing = colourNames.filter((name) => opaque.get(`--im-${name}`) !== glass.get(`--im-${name}`)).sort();
      const declared = colourNames.filter((name) => at(`look.${look}.${theme}.${name}`).$extensions?.imago?.glass).sort();
      assert.deepEqual(differing, declared, `${look} ${theme}`);
      for (const name of ['ground', 'sheet', 'float']) assert.ok(declared.includes(name), `${look} ${theme}: ${name} has a glass value`);
      for (const name of ['ground', 'sheet', 'float']) assert.match(opaque.get(`--im-${name}`) ?? '', /^#[0-9A-F]{6}$/, `${look} ${theme}: opaque ${name} is a plain colour`);
    }
  }
});

test('the glass values are the measured ones, and the opaque ground and sheet those of the preview', () => {
  assert.equal(hexOf('look.smooth.dark.ground', undefined, true), '#0C111DCC');
  assert.equal(hexOf('look.smooth.dark.sheet', undefined, true), '#1A202CF0');
  assert.equal(at('look.smooth.dark.sheet').$extensions.imago.glass.alpha, 0.94);
  assert.equal(at('look.smooth.dark.float').$extensions.imago.glass.alpha, 0.96);
  assert.equal(at('look.smooth.light.ground').$extensions.imago.glass.alpha, 0.88);
  assert.equal(hexOf('look.smooth.dark.ground'), '#12161E');
  assert.equal(hexOf('look.smooth.dark.sheet'), '#1A202C');
  assert.equal(hexOf('look.smooth.light.ground'), '#F6F7F9');
  assert.equal(hexOf('look.smooth.light.sheet'), '#FFFFFF');
  assert.equal(hexOf('look.oni.dark.ground'), '#0B0416');
  assert.equal(hexOf('look.oni.dark.sheet'), '#0D0A22');
  assert.equal(hexOf('look.oni.light.ground'), '#E9EEF8');
  assert.equal(hexOf('look.oni.light.sheet'), '#FFFFFF');
});

test('a translucent surface is opaque by being composited over the opaque ground', () => {
  for (const look of looks) {
    for (const theme of themes) {
      const ground = lookColor(look, theme, 'ground');
      for (const name of ['float', 'field', 'terminal']) {
        const glass = hexOf(`look.${look}.${theme}.${name}`, undefined, true);
        assert.equal(lookColor(look, theme, name), over(glass, ground), `${look} ${theme} ${name}`);
      }
    }
  }
});

test('the accent tokens are computed from --im-hue per theme, with a hex fallback where oklch is missing', () => {
  const sheet = css();
  for (const theme of themes) {
    const found = declarations(sheet, `[data-im-theme="${theme}"]`);
    for (const name of accentNames) assert.ok(found.has(`--im-${name}`), `[data-im-theme="${theme}"] lacks --im-${name}`);
    assert.match(found.get('--im-accent') ?? '', /^oklch\([0-9.]+ [0-9.]+ var\(--im-hue\)\)$/);
    assert.equal(found.get('--im-accent-text'), 'var(--im-accent)');
  }
  assert.match(declarations(sheet, '[data-im-theme="dark"]').get('--im-accent-hover') ?? '', /^color-mix\(in srgb, var\(--im-accent\) 84%, #FFFFFF\)$/);
  assert.match(declarations(sheet, '[data-im-theme="light"]').get('--im-accent-hover') ?? '', /^color-mix\(in srgb, var\(--im-accent\) 86%, #000000\)$/);
  for (const app of apps) {
    assert.equal(declarations(sheet, `[data-im-app="${app}"]`).get('--im-hue'), String(at(`app.${app}.hue`).$value));
  }
  const fallback = sheet.slice(sheet.indexOf('@supports not (color: oklch('));
  assert.ok(fallback.startsWith('@supports not'), 'css/tokens.css has the @supports fallback');
  for (const app of apps) {
    for (const theme of themes) {
      const hue = at(`app.${app}.hue`).$value;
      const l = theme === 'dark' ? 0.82 : 0.47;
      const c = theme === 'dark' ? 0.12 : 0.13;
      assert.ok(fallback.includes(`[data-im-app="${app}"][data-im-theme="${theme}"] {\n    --im-accent: ${oklchToHex(l, c, hue)};`), `${app} ${theme}: hex fallback of the accent`);
    }
  }
});

// The measures of the Global Constraints, in px.
const measures: Record<string, Record<string, number>> = {
  smooth: {
    'h-titlebar': 46, 'h-control': 32, 'h-control-sm': 24, 'h-row': 32, 'h-row-2': 44, 'h-table-row': 36, 'h-panel-header': 42, 'h-footer': 30,
    'r-chip': 4, 'r-control': 6, 'r-sheet': 10, 'cut-sm': 0, 'cut-md': 0, 'cut-lg': 0,
  },
  oni: {
    'h-titlebar': 38, 'h-control': 28, 'h-control-sm': 22, 'h-row': 28, 'h-row-2': 40, 'h-table-row': 32, 'h-panel-header': 40, 'h-footer': 26,
    'r-chip': 0, 'r-control': 0, 'r-sheet': 0, 'cut-sm': 6, 'cut-md': 8, 'cut-lg': 14,
  },
};
const shared: Record<string, number> = { 'w-sidebar': 232, 'w-rail': 56, 's-1': 4, 's-2': 8, 's-3': 12, 's-4': 16, 's-5': 24 };

test('the measures equal the Global Constraints table, per look', () => {
  const sheet = css();
  const everyLook = declarations(sheet, '[data-im-look]');
  for (const [name, px] of Object.entries(shared)) {
    assert.deepEqual(at(`shared.${name}`).$value, { value: px, unit: 'px' }, name);
    assert.equal(everyLook.get(`--im-${name}`), `${px}px`, name);
  }
  assert.deepEqual(at('shared.t-fast').$value, { value: 120, unit: 'ms' });
  assert.deepEqual(at('shared.t-base').$value, { value: 180, unit: 'ms' });
  assert.deepEqual(at('shared.ease').$value, [0.16, 1, 0.3, 1]);
  assert.equal(everyLook.get('--im-t-fast'), '120ms');
  assert.equal(everyLook.get('--im-t-base'), '180ms');
  assert.equal(everyLook.get('--im-ease'), 'cubic-bezier(0.16, 1, 0.3, 1)');
  assert.equal(everyLook.get('--im-w-inspector'), '300px');
  for (const look of looks) {
    const found = declarations(sheet, `[data-im-look="${look}"]`);
    for (const [name, px] of Object.entries(measures[look])) {
      assert.deepEqual(at(`measure.${look}.${name}`).$value, { value: px, unit: 'px' }, `${look} ${name}`);
      assert.equal(found.get(`--im-${name}`), `${px}px`, `${look} ${name}`);
    }
  }
});

test('fonts are the local Windows stacks, and the head font is text in Smooth and display in ONI', () => {
  const everyLook = declarations(css(), '[data-im-look]');
  assert.equal(everyLook.get('--im-font-text'), '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif');
  assert.equal(everyLook.get('--im-font-display'), 'Bahnschrift, "Segoe UI Variable Display", "Segoe UI", sans-serif');
  assert.equal(everyLook.get('--im-font-code'), '"Cascadia Mono", "Cascadia Code", Consolas, monospace');
  const smooth = declarations(css(), '[data-im-look="smooth"]');
  const oni = declarations(css(), '[data-im-look="oni"]');
  assert.equal(smooth.get('--im-font-head'), 'var(--im-font-text)');
  assert.equal(oni.get('--im-font-head'), 'var(--im-font-display)');
  assert.equal(smooth.get('--im-case'), 'none');
  assert.equal(oni.get('--im-case'), 'uppercase');
  assert.equal(smooth.get('--im-track'), '0');
  assert.equal(oni.get('--im-track'), '0.06em');
});

test('nothing in the stylesheet needs the network', () => {
  assert.doesNotMatch(css(), /url\(|@import|https?:/);
});

const run = (args: string[]): { status: number | null; stderr: string } => {
  const result = spawnSync(process.execPath, [buildScript, ...args], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
};

test('build-tokens --check passes on the committed stylesheet', () => {
  const result = run(['--check']);
  assert.equal(result.status, 0, result.stderr);
});

test('build-tokens --check fails after one value of the JSON changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'imago-tokens-'));
  try {
    const json = join(dir, 'tokens.json');
    const sheet = join(dir, 'tokens.css');
    cpSync(tokensFile, json);
    assert.equal(run(['--tokens', json, '--css', sheet]).status, 0, 'the build writes the stylesheet');
    assert.equal(run(['--check', '--tokens', json, '--css', sheet]).status, 0, 'the fresh stylesheet matches');
    const changed = JSON.parse(readFileSync(json, 'utf8'));
    changed.app.xiox.hue.$value = 76;
    writeFileSync(json, JSON.stringify(changed, null, 2));
    const stale = run(['--check', '--tokens', json, '--css', sheet]);
    assert.equal(stale.status, 1, 'a changed value makes the stylesheet stale');
    assert.match(stale.stderr, /out of date/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('build-tokens refuses a colour whose hex and components disagree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'imago-tokens-'));
  try {
    const json = join(dir, 'tokens.json');
    const changed = JSON.parse(readFileSync(tokensFile, 'utf8'));
    changed.look.smooth.dark.line.$value.hex = '#2A3241';
    writeFileSync(json, JSON.stringify(changed, null, 2));
    const result = run(['--check', '--tokens', json, '--css', join(dir, 'tokens.css')]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /look\.smooth\.dark\.line/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
