// Makes the icon set of each app into icons/<app>/ from tokens/imago.tokens.json.
//   node scripts/icons.mjs            write the files (draws the PNGs: Windows, with Segoe UI Variable Display, and
//                                     Playwright's Chromium; anywhere else it refuses, and says why)
//   node scripts/icons.mjs --check    compare the SVGs and the list of files with what the tokens give, the size in the
//                                     header of each PNG with its name, and each .ico with the container of the
//                                     folder's PNGs, without drawing; exit 1 on a difference
//   --tokens <file> and --out <dir> point at other files (the tests check a copy). Any other argument is exit 2.
//
// The icon is the mark of the title bar: a rounded square (corner 70 of 256, as 6 of 22) in the accent of the app's
// dark theme, holding the capital initial of its name, weight 700, in the accent's ink. Both colours are read from the
// tokens through color.mjs, the way css/tokens.css gets them, never typed. An app copies its own files from the
// package; `imago-check` reports a copy that differs (rule app-icon).
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colorValueToHex } from './color.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The five apps: the id of the token file and the name the title bar writes. The initial of the name is the letter. */
export const APPS = [
  ['shinatama', 'Shinatama'],
  ['xiox', 'Xiox'],
  ['mukade', 'Mukade'],
  ['muro', 'Muro'],
  ['daodan', 'Daodan'],
];

export const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512];
/** The sizes of icon.ico (what Windows shows for the program) and of favicon.ico (what a browser tab asks for). */
export const ICON_SIZES = [16, 24, 32, 48, 64, 256];
export const FAVICON_SIZES = [16, 32, 48];

/** Every file of an app's folder. */
export const FILES = [
  'icon.svg', 'favicon.svg',
  ...PNG_SIZES.map((size) => `${size}x${size}.png`),
  'icon.png', 'icon.ico', 'favicon.ico',
];

/** The fill and the ink of an app: its `--im-accent` and `--im-accent-on` in the dark theme, as #RRGGBB. */
export function coloursOf(tokens, app) {
  const hue = tokens.app?.[app]?.hue?.$value;
  if (typeof hue !== 'number') throw new Error(`app.${app}.hue: no such token`);
  const dark = tokens.accent?.dark;
  if (!dark?.accent || !dark['accent-on']) throw new Error('accent.dark.accent and accent.dark.accent-on: no such tokens');
  return { fill: colorValueToHex(dark.accent.$value, hue), ink: colorValueToHex(dark['accent-on'].$value, hue) };
}

/**
 * The source of an icon: one line with no line break, so that a checkout that changes line endings cannot change a
 * byte of it, and the copy an app keeps stays the same bytes.
 *
 * The letter is centred on x by its advance and on y by its capitals: `dominant-baseline: middle` puts the baseline
 * half an x-height under y, so y 144 puts the middle of the capitals (0.7 em, 119 units at 170) at 128. At y 134, the
 * value of the first preview, they stood 10 units, 4% of the square, too high.
 */
export function iconSvg({ letter, fill, ink }) {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">',
    `<rect width="256" height="256" rx="70" fill="${fill}"/>`,
    `<text x="128" y="144" text-anchor="middle" dominant-baseline="middle" font-family="'Segoe UI Variable Display', 'Segoe UI', sans-serif" font-size="170" font-weight="700" fill="${ink}">${letter}</text>`,
    '</svg>',
  ].join('');
}

/** An .ico: a header, one directory entry per image (0 stands for 256), then the PNG files as they are. */
export function icoFile(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2); // type 1: icons
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, k) => {
    const at = 6 + 16 * k;
    header[at] = size === 256 ? 0 : size;
    header[at + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4); // planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

/** The SVGs of every app, from the tokens: { app: svg }. */
export function svgsOf(tokens) {
  return Object.fromEntries(APPS.map(([app, name]) => [app, iconSvg({ letter: name[0].toUpperCase(), ...coloursOf(tokens, app) })]));
}

/** The PNGs of each SVG, one per size of PNG_SIZES, drawn at their own size by Chromium on a transparent background: { app: { size: bytes } }. */
async function drawAll(svgs) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const drawn = {};
    for (const [app, svg] of Object.entries(svgs)) {
      drawn[app] = {};
      for (const size of PNG_SIZES) {
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${svg}</body></html>`);
        await page.evaluate(() => document.fonts.ready);
        drawn[app][size] = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
      }
    }
    return drawn;
  } finally {
    await browser.close();
  }
}

/** The files of an app, from its SVG and its PNGs: { name: bytes }. */
function filesOf(svg, pngs) {
  const pick = (sizes) => icoFile(sizes.map((size) => ({ size, png: pngs[size] })));
  return {
    'icon.svg': Buffer.from(svg),
    'favicon.svg': Buffer.from(svg),
    ...Object.fromEntries(PNG_SIZES.map((size) => [`${size}x${size}.png`, pngs[size]])),
    'icon.png': pngs[512],
    'icon.ico': pick(ICON_SIZES),
    'favicon.ico': pick(FAVICON_SIZES),
  };
}

// A text file may arrive with CRLF line endings or a line break at its end, from a checkout or an editor: the SVG is the same.
const normal = (text) => text.replace(/\r\n/g, '\n').replace(/\n+$/, '');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The width and height a PNG's header (its IHDR chunk) gives, or null when the bytes are not a PNG. */
function pngSize(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE) || bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The size a PNG of the set has by its name: `48x48.png` is 48, and `icon.png` is the 512 one. */
const sizeByName = (name) => (name === 'icon.png' ? 512 : Number(/^(\d+)x\1\.png$/.exec(name)?.[1] ?? NaN));

/** What is wrong in the icons folder `out`: the list of files, the SVGs, the headers of the PNGs and the .ico containers, without drawing. */
export function problems(tokens, out) {
  const found = [];
  const svgs = svgsOf(tokens);
  const apps = new Set(APPS.map(([app]) => app));
  const there = existsSync(out) ? readdirSync(out).sort() : [];
  for (const name of there) if (!apps.has(name)) found.push(`${name}: not one of the apps (${[...apps].join(', ')})`);
  for (const [app] of APPS) {
    const folder = join(out, app);
    if (!existsSync(folder)) {
      found.push(`${app}/: missing`);
      continue;
    }
    const present = readdirSync(folder);
    for (const name of FILES) if (!present.includes(name)) found.push(`${app}/${name}: missing`);
    for (const name of present) if (!FILES.includes(name)) found.push(`${app}/${name}: not a file of the icon set`);
    for (const name of ['icon.svg', 'favicon.svg']) {
      if (!present.includes(name)) continue;
      if (normal(readFileSync(join(folder, name), 'utf8')) !== svgs[app]) found.push(`${app}/${name}: not what the tokens give`);
    }
    for (const name of FILES.filter((file) => file.endsWith('.png') && present.includes(file))) {
      const size = pngSize(readFileSync(join(folder, name)));
      const want = sizeByName(name);
      if (!size) found.push(`${app}/${name}: not a PNG`);
      else if (size.width !== want || size.height !== want) found.push(`${app}/${name}: its header gives ${size.width}x${size.height}, not ${want}x${want}`);
    }
    for (const [name, sizes] of [['icon.ico', ICON_SIZES], ['favicon.ico', FAVICON_SIZES]]) {
      const pngs = sizes.map((size) => `${size}x${size}.png`);
      if (!present.includes(name) || !pngs.every((png) => present.includes(png))) continue;
      const built = icoFile(sizes.map((size) => ({ size, png: readFileSync(join(folder, `${size}x${size}.png`)) })));
      if (!built.equals(readFileSync(join(folder, name)))) found.push(`${app}/${name}: not the container of the folder's ${pngs.join(', ')}`);
    }
  }
  return found;
}

/** A bad argument: exit 2, and nothing is drawn or written. */
class ArgumentError extends Error {}

/** The arguments: --check, --tokens <file> and --out <dir>, and nothing else. */
function parseArguments(args) {
  const options = { check: false, tokens: undefined, out: undefined };
  for (let k = 0; k < args.length; k++) {
    const arg = args[k];
    if (arg === '--check') options.check = true;
    else if (arg === '--tokens' || arg === '--out') {
      const value = args[++k];
      if (!value || value.startsWith('--')) throw new ArgumentError(`${arg} needs a path`);
      options[arg.slice(2)] = value;
    } else throw new ArgumentError(`unknown argument ${arg}: the arguments are --check, --tokens <file> and --out <dir>`);
  }
  return options;
}

// The font of the letter, and the file Windows keeps it in (in its own fonts folder, or in the user's).
const FONT = 'Segoe UI Variable Display';
const FONT_FILE = 'SegUIVar.ttf';

/** Whether this machine has the font of the letter. */
function fontFound() {
  const folders = [join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'), process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts') : null];
  return folders.some((folder) => folder && existsSync(join(folder, FONT_FILE)));
}

/**
 * Why this machine cannot draw the icons, or null when it can: the PNGs are drawn on Windows, in Segoe UI Variable
 * Display. Drawn elsewhere, the letter would be another font, and every app would copy it.
 * @param {string} platform @param {boolean} hasFont
 */
export function drawingRefusal(platform, hasFont) {
  if (platform !== 'win32') return `npm run icons draws the PNGs on Windows only, where the letter's font, ${FONT}, is; here it would draw another font. Compare without drawing: npm run icons -- --check`;
  if (!hasFont) return `the font ${FONT} (${FONT_FILE}) is not on this machine: the PNGs would be drawn in another font. Install it, or draw on a Windows 11 machine`;
  return null;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const tokensFile = args.tokens ?? join(root, 'tokens', 'imago.tokens.json');
  const out = args.out ?? join(root, 'icons');
  const name = relative(process.cwd(), out) || out;
  const tokens = JSON.parse(readFileSync(tokensFile, 'utf8'));

  if (args.check) {
    const found = problems(tokens, out);
    if (found.length) {
      console.error(`${name} is out of date with ${relative(process.cwd(), tokensFile) || tokensFile}: run "npm run icons".\n${found.map((line) => `  ${line}`).join('\n')}`);
      process.exitCode = 1;
    }
    return;
  }

  const refusal = drawingRefusal(process.platform, process.platform === 'win32' && fontFound());
  if (refusal) throw new Error(refusal);
  const svgs = svgsOf(tokens);
  const drawn = await drawAll(svgs);
  for (const [app, svg] of Object.entries(svgs)) {
    mkdirSync(join(out, app), { recursive: true });
    for (const [file, bytes] of Object.entries(filesOf(svg, drawn[app]))) writeFileSync(join(out, app, file), bytes);
  }
  console.log(`wrote ${FILES.length} files for each of ${APPS.length} apps in ${name}`);
}

/** Whether node runs this file, and not a test that imports it. */
function invoked() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invoked()) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = error instanceof ArgumentError ? 2 : 1;
  }
}
