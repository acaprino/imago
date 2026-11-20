// node tests/gallery/run.mjs [file.mjs ...]
//
// Builds the gallery with Vite into a fresh temporary folder (never the shared dist/), serves it on a free port,
// opens each test file in a fresh browser context and page, and calls its default export `async (page, url) => void`.
// With no argument it runs every tests/gallery/*.mjs except this file. One line per file; exit code 1 on any failure.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const self = basename(fileURLToPath(import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function testFiles(args) {
  if (args.length) return args.map((name) => (existsSync(resolve(name)) ? resolve(name) : resolve(here, name)));
  return readdirSync(here)
    .filter((name) => name.endsWith('.mjs') && name !== self)
    .sort()
    .map((name) => join(here, name));
}

function build(outDir) {
  return new Promise((done, fail) => {
    const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
    const child = spawn(
      process.execPath,
      [vite, 'build', '--config', 'gallery/vite.config.ts', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (out += chunk));
    child.on('error', fail);
    child.on('close', (code) => (code === 0 ? done() : fail(new Error(`the gallery build failed (exit ${code})\n${out}`))));
  });
}

function serve(folder) {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(folder, '.' + path);
    if (file !== folder && !file.startsWith(folder + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      if (!statSync(file).isFile()) throw new Error('not a file');
      response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(readFileSync(file));
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

async function runFile(browser, file, url) {
  const label = basename(file);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
  });
  try {
    const test = (await import(pathToFileURL(file).href)).default;
    if (typeof test !== 'function') throw new Error('the default export is not a function');
    await page.goto(url);
    await page.waitForFunction(() => Boolean(window.__imago && window.__imago.ready));
    await test(page, url);
    if (problems.length) throw new Error(problems.join('\n'));
    console.log(`ok   ${label}`);
    return true;
  } catch (error) {
    const detail = String(error?.stack ?? error).split('\n').slice(0, 14).join('\n      ');
    console.log(`FAIL ${label}\n      ${detail}`);
    if (problems.length && !String(error?.message ?? '').includes(problems[0])) console.log(`      ${problems.join('\n      ')}`);
    return false;
  } finally {
    await context.close();
  }
}

const files = testFiles(process.argv.slice(2));
const outDir = mkdtempSync(join(tmpdir(), 'imago-gallery-'));
let server;
let browser;
let failed = false;
try {
  await build(outDir);
  const served = await serve(outDir);
  server = served.server;
  const { chromium } = await import('playwright');
  browser = await chromium.launch();
  const url = `http://127.0.0.1:${served.port}/`;
  for (const file of files) {
    if (!(await runFile(browser, file, url))) failed = true;
  }
} catch (error) {
  console.log(`FAIL ${String(error?.stack ?? error).split('\n').slice(0, 20).join('\n      ')}`);
  failed = true;
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise((done) => server.close(done)); }
  rmSync(outDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
