// The icons of the executables: icons/<app>/ is what scripts/icons.mjs wrote, and what an app copies.
//   node --experimental-strip-types --test tests/icons.test.ts
// The tests read the committed files and never draw: the PNGs are drawn on a Windows machine that has the fonts
// (`npm run icons`), and these tests say what they must be.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { APPS as GALLERY_APPS, APP_IDS } from '../gallery/apps.ts';
import { colorValueToHex, contrast } from '../scripts/color.mjs';
import { APPS, FAVICON_SIZES, FILES, ICON_SIZES, PNG_SIZES, drawingRefusal, icoFile, iconSvg } from '../scripts/icons.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'icons.mjs');
const iconsDir = join(root, 'icons');
const tokens = JSON.parse(readFileSync(join(root, 'tokens', 'imago.tokens.json'), 'utf8'));
const tokensCss = readFileSync(join(root, 'css', 'tokens.css'), 'utf8');

type Rgba = { width: number; height: number; at: (x: number, y: number) => number[] };

/** An 8-bit RGBA PNG that is not interlaced (what Chromium writes), decoded to its pixels. */
function decodePng(bytes: Buffer): Rgba {
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'not a PNG');
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  for (let at = 8; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('ascii', at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      assert.deepEqual([body[8], body[9], body[12]], [8, 6, 0], 'the PNG is not 8-bit RGBA without interlacing');
    } else if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const left = i >= 4 ? pixels[y * stride + i - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const upLeft = y > 0 && i >= 4 ? pixels[(y - 1) * stride + i - 4] : 0;
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predicted = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + i] = (x + predicted) & 255;
    }
  }
  return { width, height, at: (x, y) => [...pixels.subarray(y * stride + x * 4, y * stride + x * 4 + 4)] };
}

const bytesOf = (parts: string[]): number[] => parts.flatMap((hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)));

/** What the tokens say an app's dark accent and its ink are: the two colours of the icon, read the way the build reads them. */
function coloursOf(app: string): { fill: string; ink: string } {
  const hue = tokens.app[app].hue.$value;
  return {
    fill: colorValueToHex(tokens.accent.dark.accent.$value, hue),
    ink: colorValueToHex(tokens.accent.dark['accent-on'].$value, hue),
  };
}

/** The entries of an .ico: size, the PNG it holds and the directory fields. */
function readIco(bytes: Buffer) {
  assert.equal(bytes.readUInt16LE(0), 0, 'reserved');
  assert.equal(bytes.readUInt16LE(2), 1, 'type 1 is an icon');
  const count = bytes.readUInt16LE(4);
  return Array.from({ length: count }, (_, k) => {
    const at = 6 + 16 * k;
    const size = bytes.readUInt32LE(at + 8);
    const offset = bytes.readUInt32LE(at + 12);
    return {
      width: bytes[at] || 256,
      height: bytes[at + 1] || 256,
      colours: bytes[at + 2],
      reserved: bytes[at + 3],
      planes: bytes.readUInt16LE(at + 4),
      bits: bytes.readUInt16LE(at + 6),
      size,
      offset,
      png: bytes.subarray(offset, offset + size),
    };
  });
}

const ids = APPS.map(([id]: [string, string]) => id);
const file = (app: string, name: string): Buffer => readFileSync(join(iconsDir, app, name));

describe('the apps', () => {
  test('the script lists the five apps of the tokens and of the gallery, with the gallery\'s names', () => {
    assert.deepEqual([...ids].sort(), Object.keys(tokens.app).sort());
    assert.deepEqual([...ids].sort(), [...APP_IDS].sort());
    for (const [id, name] of APPS as [string, string][]) assert.equal(name, (GALLERY_APPS as Record<string, { name: string }>)[id].name, `the name of ${id}`);
  });

  test('icons/ holds a folder for each app and nothing else', () => {
    assert.deepEqual(readdirSync(iconsDir).sort(), [...ids].sort());
  });
});

describe('the files of an app', () => {
  test('the sizes are the ones of the brief', () => {
    assert.deepEqual(PNG_SIZES, [16, 24, 32, 48, 64, 128, 256, 512]);
    assert.deepEqual(ICON_SIZES, [16, 24, 32, 48, 64, 256]);
    assert.deepEqual(FAVICON_SIZES, [16, 32, 48]);
  });

  for (const app of ids) {
    test(`${app} has exactly the files, and no other`, () => {
      const expected = ['icon.svg', 'favicon.svg', ...PNG_SIZES.map((n: number) => `${n}x${n}.png`), 'icon.png', 'icon.ico', 'favicon.ico'];
      assert.deepEqual([...FILES].sort(), [...expected].sort());
      assert.deepEqual(readdirSync(join(iconsDir, app)).sort(), [...expected].sort());
    });

    test(`${app}: the header of every PNG gives its size, and the pixels are RGBA`, () => {
      for (const size of PNG_SIZES) {
        const png = decodePng(file(app, `${size}x${size}.png`));
        assert.deepEqual([png.width, png.height], [size, size], `${size}x${size}.png`);
      }
      assert.deepEqual(file(app, 'icon.png'), file(app, '512x512.png'), 'icon.png is the 512 pixel icon');
    });

    test(`${app}: the corners are transparent and the square is its accent`, () => {
      const { fill } = coloursOf(app);
      for (const size of PNG_SIZES) {
        const png = decodePng(file(app, `${size}x${size}.png`));
        assert.equal(png.at(0, 0)[3], 0, `${size}: the top left corner is not transparent`);
        assert.equal(png.at(size - 1, size - 1)[3], 0, `${size}: the bottom right corner is not transparent`);
        assert.deepEqual(png.at(Math.floor(size / 2), 1), [...bytesOf([fill]), 255], `${size}: the square at the top is not the accent ${fill}`);
      }
    });

    test(`${app}: icon.ico holds ${ICON_SIZES.join(', ')} as PNG entries, the files of the folder`, () => {
      const entries = readIco(file(app, 'icon.ico'));
      assert.deepEqual(entries.map((entry) => entry.width), ICON_SIZES);
      assert.deepEqual(entries.map((entry) => entry.height), ICON_SIZES);
      for (const entry of entries) {
        assert.deepEqual([entry.colours, entry.reserved, entry.planes, entry.bits], [0, 0, 1, 32], `the directory entry of ${entry.width}`);
        assert.deepEqual(entry.png, file(app, `${entry.width}x${entry.width}.png`), `the entry of ${entry.width} is ${entry.width}x${entry.width}.png as it is`);
      }
      const last = entries[entries.length - 1];
      assert.equal(last.offset + last.size, file(app, 'icon.ico').length, 'the file ends with its last image');
    });

    test(`${app}: favicon.ico holds ${FAVICON_SIZES.join(', ')}`, () => {
      const entries = readIco(file(app, 'favicon.ico'));
      assert.deepEqual(entries.map((entry) => entry.width), FAVICON_SIZES);
      for (const entry of entries) assert.deepEqual(entry.png, file(app, `${entry.width}x${entry.width}.png`));
    });
  }
});

describe('the SVG', () => {
  for (const [app, name] of APPS as [string, string][]) {
    test(`${app}: the letter is ${name[0]}, the fill and the ink are the dark accent and its ink from the tokens`, () => {
      const { fill, ink } = coloursOf(app);
      const svg = file(app, 'icon.svg').toString('utf8');
      assert.match(svg, /^<svg [^>]*width="256" height="256" viewBox="0 0 256 256"/, 'a 256 by 256 square');
      assert.match(svg, new RegExp(`<rect width="256" height="256" rx="70" fill="${fill}"/>`), `the square, rx 70, filled ${fill}`);
      assert.match(svg, new RegExp(`<text [^>]*fill="${ink}"[^>]*>${name[0]}</text>`), `the letter ${name[0]} in ${ink}`);
      assert.match(svg, /font-family="'Segoe UI Variable Display', 'Segoe UI', sans-serif"/);
      assert.match(svg, /font-weight="700"/);
      assert.match(svg, /text-anchor="middle"/);
      assert.equal(svg.match(/<text /g)?.length, 1, 'one letter');
      assert.deepEqual(file(app, 'favicon.svg'), file(app, 'icon.svg'), 'the favicon is the icon');
    });

    test(`${app}: the fill and the ink are the sRGB values css/tokens.css carries for the app in the dark theme`, () => {
      const { fill, ink } = coloursOf(app);
      const block = new RegExp(`\\[data-im-app="${app}"\\]\\[data-im-theme="dark"\\] \\{([^}]*)\\}`).exec(tokensCss)?.[1] ?? '';
      assert.ok(block.includes(`--im-accent: ${fill};`), `tokens.css does not give ${app} the accent ${fill}`);
      assert.ok(block.includes(`--im-accent-on: ${ink};`), `tokens.css does not give ${app} the ink ${ink}`);
    });

    test(`${app}: the SVG is one line without a line break, so that no checkout changes a byte of it`, () => {
      assert.ok(!/[\r\n]/.test(file(app, 'icon.svg').toString('utf8')));
    });

    test(`${app}: the ink has 4.5:1 or more on the fill`, () => {
      const { fill, ink } = coloursOf(app);
      assert.ok(contrast(ink, fill) >= 4.5, `${ink} on ${fill} is ${contrast(ink, fill).toFixed(2)}:1`);
    });
  }

  test('iconSvg takes the letter, the fill and the ink it is given', () => {
    const svg = iconSvg({ letter: 'Q', fill: '#123456', ink: '#ABCDEF' });
    assert.ok(svg.includes('fill="#123456"') && svg.includes('fill="#ABCDEF"') && svg.includes('>Q</text>'));
  });
});

describe('the letter is centred in the square', () => {
  /** The box of the pixels nearer the ink than the fill, as a fraction of the size: the centre of the letter and its height. */
  function letter(app: string, size: number) {
    const { fill, ink } = coloursOf(app);
    const png = decodePng(file(app, `${size}x${size}.png`));
    const [f, i] = [bytesOf([fill]), bytesOf([ink])];
    const along = i.map((value, k) => value - f[k]);
    const norm = along.reduce((sum, value) => sum + value * value, 0);
    let box = { x0: size, y0: size, x1: -1, y1: -1 };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const pixel = png.at(x, y);
        if (pixel[3] < 255) continue;
        const t = along.reduce((sum, value, k) => sum + value * (pixel[k] - f[k]), 0) / norm;
        if (t > 0.5) box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
      }
    }
    assert.ok(box.x1 >= 0, `${app} ${size}: no letter found`);
    return { cx: (box.x0 + box.x1 + 1) / 2 / size, cy: (box.y0 + box.y1 + 1) / 2 / size, h: (box.y1 - box.y0 + 1) / size };
  }

  for (const app of ids) {
    for (const size of [16, 256]) {
      // 1.5% of the size, rounded up to the half pixel the measure tells apart (the box is in whole pixels, so its middle
      // is in halves), and never less than three quarters of a pixel: a letter at 16 pixels sits on whole pixels. At 256
      // that is 4 pixels, which Daodan's D takes: the letter is centred by its advance, and the D's ink sits 4 pixels right.
      const allowed = Math.max(Math.ceil(0.015 * size * 2) / 2, 0.75) / size;
      test(`${app} at ${size}: the middle of the letter is within ${(allowed * 100).toFixed(1)}% of the middle of the square, and it fills a third to a half of it`, () => {
        const { cx, cy, h } = letter(app, size);
        assert.ok(Math.abs(cx - 0.5) <= allowed, `horizontal middle ${cx.toFixed(3)}`);
        assert.ok(Math.abs(cy - 0.5) <= allowed, `vertical middle ${cy.toFixed(3)}`);
        assert.ok(h >= 0.33 && h <= 0.55, `height ${h.toFixed(3)}`);
      });
    }
  }
});

describe('the .ico container', () => {
  test('a header, one 16 byte entry per image with 0 for 256, then the PNG bytes as they are', () => {
    const png16 = Buffer.from('sixteen');
    const png256 = Buffer.from('two hundred and fifty-six');
    const ico = icoFile([{ size: 16, png: png16 }, { size: 256, png: png256 }]);
    assert.equal(ico.length, 6 + 2 * 16 + png16.length + png256.length);
    assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 2, 0]);
    assert.deepEqual([...ico.subarray(6, 22)], [16, 16, 0, 0, 1, 0, 32, 0, png16.length, 0, 0, 0, 38, 0, 0, 0]);
    assert.deepEqual([...ico.subarray(22, 38)], [0, 0, 0, 0, 1, 0, 32, 0, png256.length, 0, 0, 0, 38 + png16.length, 0, 0, 0]);
    assert.deepEqual(ico.subarray(38, 38 + png16.length), png16);
    assert.deepEqual(ico.subarray(38 + png16.length), png256);
  });
});

describe('npm run icons -- --check', () => {
  const made: string[] = [];
  after(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  });
  const copy = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'imago-icons-'));
    made.push(dir);
    cpSync(iconsDir, dir, { recursive: true });
    return dir;
  };
  const run = (out: string) => spawnSync(process.execPath, [script, '--check', '--out', out], { encoding: 'utf8' });

  test('passes on the committed icons', () => {
    const result = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  test('passes on a copy, and exits 1 on a changed SVG, a missing file, an extra file and a folder that is not an app', () => {
    const dir = copy();
    assert.equal(run(dir).status, 0);

    const svg = join(dir, 'muro', 'icon.svg');
    const original = readFileSync(svg, 'utf8');
    writeFileSync(svg, original.replace('>M<', '>W<'));
    const changed = run(dir);
    assert.equal(changed.status, 1);
    assert.match(changed.stderr, /muro[\\/]icon\.svg/);
    writeFileSync(svg, original);

    unlinkSync(join(dir, 'xiox', '48x48.png'));
    const missing = run(dir);
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /xiox[\\/]48x48\.png/);
    cpSync(join(iconsDir, 'xiox', '48x48.png'), join(dir, 'xiox', '48x48.png'));

    writeFileSync(join(dir, 'mukade', 'old-logo.png'), 'x');
    const extra = run(dir);
    assert.equal(extra.status, 1);
    assert.match(extra.stderr, /mukade[\\/]old-logo\.png/);
    unlinkSync(join(dir, 'mukade', 'old-logo.png'));

    mkdtempSync(join(dir, 'ethel-'));
    assert.equal(run(dir).status, 1);
  });

  test('exits 1, without drawing, on a PNG whose header does not give the size of its name, and on an .ico that is not the container of the folder\'s PNGs', () => {
    const dir = copy();
    writeFileSync(join(dir, 'shinatama', '16x16.png'), readFileSync(join(iconsDir, 'shinatama', '24x24.png')));
    const swapped = run(dir);
    assert.equal(swapped.status, 1);
    assert.match(swapped.stderr, /shinatama[\\/]16x16\.png: .*24x24/);
    assert.match(swapped.stderr, /shinatama[\\/]icon\.ico/, 'icon.ico no longer holds the folder\'s 16x16.png');
    cpSync(join(iconsDir, 'shinatama', '16x16.png'), join(dir, 'shinatama', '16x16.png'));

    writeFileSync(join(dir, 'muro', 'icon.png'), Buffer.from('not a png'));
    const corrupt = run(dir);
    assert.equal(corrupt.status, 1);
    assert.match(corrupt.stderr, /muro[\\/]icon\.png: not a PNG/);
    cpSync(join(iconsDir, 'muro', 'icon.png'), join(dir, 'muro', 'icon.png'));

    const ico = readFileSync(join(dir, 'xiox', 'favicon.ico'));
    ico[ico.length - 1] ^= 0xff;
    writeFileSync(join(dir, 'xiox', 'favicon.ico'), ico);
    const changed = run(dir);
    assert.equal(changed.status, 1);
    assert.match(changed.stderr, /xiox[\\/]favicon\.ico/);
    assert.doesNotMatch(changed.stderr, /xiox[\\/]icon\.ico/, 'icon.ico is still the container of its PNGs');
  });

  test('an unknown argument, or an option without its value, exits 2 and writes nothing', () => {
    const dir = copy();
    const before = readFileSync(join(dir, 'daodan', '256x256.png'));
    for (const args of [['--chek', '--out', dir], ['--check', '--out'], ['--out', dir, 'extra']]) {
      const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
      assert.equal(result.status, 2, `${args.join(' ')}: ${result.stdout}${result.stderr}`);
      assert.match(result.stderr, /\S/);
    }
    assert.deepEqual(readFileSync(join(dir, 'daodan', '256x256.png')), before);
  });

  test('drawing refuses, with a message, off Windows or without the font Segoe UI Variable Display', () => {
    assert.match(drawingRefusal('linux', true) ?? '', /Windows/);
    assert.match(drawingRefusal('darwin', true) ?? '', /Windows/);
    assert.match(drawingRefusal('win32', false) ?? '', /Segoe UI Variable Display/);
    assert.equal(drawingRefusal('win32', true), null);
  });

  test('a line break at the end of an SVG, in a CRLF checkout too, does not make it another SVG', () => {
    const dir = copy();
    const svg = join(dir, 'daodan', 'icon.svg');
    writeFileSync(svg, `${readFileSync(svg, 'utf8')}\r\n`);
    assert.equal(run(dir).status, 0);
  });

  test('does not draw: it does not need the browser', () => {
    assert.ok(!/playwright/.test(readFileSync(script, 'utf8').split('\n').filter((line) => /^import /.test(line)).join('\n')), 'playwright is imported at the top of scripts/icons.mjs');
    assert.ok(existsSync(join(root, 'node_modules', 'playwright')), 'the script draws with Playwright, a dev dependency');
  });
});

describe('the package', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string>; files: string[]; exports: Record<string, string> };

  test('npm run icons, the icons folder in "files", and the export of icons/*', () => {
    assert.equal(manifest.scripts.icons, 'node scripts/icons.mjs');
    assert.ok(manifest.files.includes('icons'));
    assert.equal(manifest.exports['./icons/*'], './icons/*');
  });
});
