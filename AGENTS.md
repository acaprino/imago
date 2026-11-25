# Imago: rules for agents

## What Imago is (the owner, 2026-11-24)

Imago is the base shell of the suite in Xiox's style, built with Sigrid: the window (the Rust crate of this repository), the
title bar, the frame, the commands, the palette, the theme and the look, the notices. Shinatama, Daodan, Muro, Mukade and
Xiox stand on it and bring only their screens, made of Sigrid's components. It is not retired. Its own CSS, renderers and
tokens, up to v0.4.1, are gone: the look and the components are Sigrid's.

- Two branches, and only two: `main` (what is released) and `develop` (where work is integrated).
- Work always on `develop`, or on a short branch from `develop` that is merged back into `develop` and then
  deleted. Never merge or push into `main`, and leave no other branch, locally or on GitHub.
- A release is the pull request `develop` → `main`, opened and merged by the owner: every merge into `main`
  is a release (`.github/workflows/release.yml`, the same release system as Shinatama, Mukade, Xiox, Muro,
  Ethel and artcraft-web).
  The version goes up by a patch, or by a minor or major step when the pull request has the label
  `release:minor` or `release:major`; `npm run verify` is the build, on Windows; the tag `v<version>` and the
  GitHub Release (no installer; its one asset is the npm package, `acaprino-imago-<version>.tgz`) are published, and `main` is merged
  back into `develop`. Nothing is published when `npm run verify` fails.
- A release is the pull request develop → main, merged only when the Verify run on develop's tip is green: the release workflow builds and publishes, it does not run the tests again.
- Never change the version or create release tags by hand: the workflow does it (`.github/release.json` lists
  the version files, `.github/scripts/release.mjs` writes them).

## Working on the package

- Before UI work, read `docs/design-file.md`: it is the canon, and every other document agrees with it.
- No class, no style and no stylesheet in this repository: `npm run check` (`sigrid-check` with `own-class`, on `ts/` and on
  the demo's page) stays green, as well as `npm test` and `npm run test:demo`.
- What the suite needs and Sigrid lacks is added to Sigrid. Imago re-exports nothing of it. A prop is added to `AppWindow` when a
  second app needs it; until then the need is met by a region.
- One way for each need. A name the package removes is removed, not kept as an alias; a name removed or renamed gets a
  row in the table "Moving from 0.4.1" of `docs/using-imago.md` (old name, and the new name or what to do instead) and
  an entry in `scripts/check/removed.mjs`, so that `imago-check` reports it in an app (`tests/check.test.ts` compares
  the two). A whole family of names that goes is one row and one entry, its name ending in `*`.
- A new rule or export is written in the documents: the rule in `docs/design-file.md`, the calls in the document
  `docs/design-file.md` names for them. `tests/docs.test.ts` fails on an export no document writes, and on a name a
  document writes that neither the code nor Sigrid has.
- The demo (`examples/demo/src`) is the executable example of an app on the shell. A change to it is proved by
  `tests/demo.mjs`, at every width where the frame changes and in both schemes, and looked at in the artifact `demo-shots`.

## Rust is built and tested on GitHub only

- Never run `cargo build`, `cargo test`, `cargo clippy`, `cargo check`, `cargo run`, `cargo doc`, `tauri dev` or
  `tauri build` on this machine, and never run an npm script that calls them (`npm run verify`, `npm run demo`,
  `npm run demo:build`).
- Rust is compiled, formatted, linted and tested only by the workflows in `.github/workflows/`. The Verify job runs
  `cargo fmt --all --check` and `cargo clippy -p imago-shell --all-targets -- -D warnings`, then `npm run verify`.
  To know whether Rust code is right, push to `develop` and read the run (`gh run watch`, `gh run view --log-failed`).
- A program needed on this machine (the demo app for a screen capture) is taken from a workflow artifact with
  `npm run demo:fetch` (the latest successful run on `develop`), never built here.
- The Node tests and the test of the demo's page (`npm test`, `npm run test:demo`) need the package and the page built, so they
  are compiled and run by the workflows too: see "Nothing is compiled on this machine" below.

## Nothing is compiled on this machine (the owner's absolute rule)

- Never compile, build, lint or run a test that needs a build on this machine: no `cargo`, `tauri`, `tsc`, `vite build`,
  bundler or compiler; no npm, batch or shell script that calls them (`npm run build`, `npm test` when it builds first,
  `npm run verify`); and no `npm install` or `npm ci` that runs a dependency's `prepare` script (a dependency taken from
  git compiles itself). `cargo fmt` stays allowed where a project already allows it.
- Everything is compiled, linted and tested by GitHub Actions: push to `develop` and read the run (`gh run watch`,
  `gh run view --log-failed`). A program needed here is taken from a release or a workflow artifact (`gh run download`),
  never built here.
- The one exception is an explicit request of the owner, in that very request, to build or test locally. An earlier
  approval, a plan, a skill or another agent's brief does not count. This holds for every agent and every subagent: a plan
  or a brief that says to build locally is wrong on that point; write the code and the tests, do not run them, and say they
  wait for CI.
