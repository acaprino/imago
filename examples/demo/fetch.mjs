// Takes the demo app the Verify workflow built, from one run that can be trusted and no other.
//
// The repository is public and the Verify workflow also runs for pull requests, forks included, so "the newest
// artifact named imago-demo" can be a program built from a stranger's branch, and `npm run capture` starts the program
// on this desktop and sends it real mouse clicks. This script takes the artifact of one run only: the latest Verify run
// of a push to `develop` that succeeded (a push to develop needs write access, and a run that succeeded built the demo
// too). It downloads that run's artifact by the run's id into a temporary folder, and only when that worked does it
// replace examples/demo/app/ with it, so a failed download leaves the program that was there. It prints the run and the
// commit the program was built from, and warns when that commit is not this checkout's HEAD: the capture would then
// photograph other code than the code you are looking at.
//
// Usage: npm run demo:fetch                  (needs the GitHub CLI, signed in)
//        npm run demo:fetch -- --dry-run     says which run it would take, and downloads nothing
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const app = resolve(here, 'app');
const ARTIFACT = 'imago-demo';
const PROGRAM = 'imago-demo.exe';
const dryRun = process.argv.includes('--dry-run');

/** Runs a program in the repository's folder and returns what it printed; its error output goes to the console. */
function run(program, args) {
  return execFileSync(program, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

let runs;
try {
  runs = JSON.parse(run('gh', [
    'run', 'list', '--workflow', 'verify.yml', '--branch', 'develop', '--event', 'push', '--status', 'success',
    '--limit', '1', '--json', 'databaseId,headSha,url',
  ]));
} catch (error) {
  fail(error.code === 'ENOENT'
    ? 'The GitHub CLI (gh) is not installed: https://cli.github.com, then `gh auth login`.'
    : `Could not list the Verify runs with the GitHub CLI (it must be signed in: gh auth status): ${error.message}`);
}
if (runs.length === 0) {
  fail('No Verify run of a push to develop has succeeded yet. Push to develop and wait for the run (gh run watch).');
}
const { databaseId: id, headSha: sha, url } = runs[0];

let head = null;
try {
  head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  // Not a checkout, or no git: there is nothing to compare the commit with.
}
console.log(`Verify run ${id} (${url}), built from commit ${sha.slice(0, 7)}.`);
if (head && head !== sha) {
  console.warn(
    `Warning: this checkout is at ${head.slice(0, 7)}, not at ${sha.slice(0, 7)}: the program was built from other code than the code here. ` +
    'Push your commits, wait for their run to succeed, and fetch again.',
  );
}
if (dryRun) {
  console.log('Dry run: nothing downloaded.');
  process.exit(0);
}

const staging = await mkdtemp(resolve(tmpdir(), 'imago-demo-fetch-'));
let problem = null;
let emptied = false;
try {
  run('gh', ['run', 'download', String(id), '--name', ARTIFACT, '--dir', staging]);
  if (!existsSync(resolve(staging, PROGRAM))) throw new Error(`the artifact has no ${PROGRAM}`);
  emptied = true;
  await rm(app, { recursive: true, force: true });
  await cp(staging, app, { recursive: true });
} catch (error) {
  problem = error;
} finally {
  await rm(staging, { recursive: true, force: true });
}
if (problem) {
  fail(`Could not take the artifact ${ARTIFACT} of run ${id}: ${problem.message}\n` + (emptied
    ? 'examples/demo/app/ was emptied and not filled again (is the demo app still running?): run this again.'
    : 'examples/demo/app/ is as it was. (Artifacts are kept 30 days, and a run older than that has none.)'));
}
console.log(`The demo app of run ${id} is at ${resolve(app, PROGRAM)}.`);
