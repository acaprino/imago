# Imago: rules for agents

- Two branches, and only two: `main` (what is released) and `develop` (where work is integrated).
- Work always on `develop`, or on a short branch from `develop` that is merged back into `develop` and then
  deleted. Never merge or push into `main`, and leave no other branch, locally or on GitHub.
- A release is the pull request `develop` → `main`, opened and merged by the owner: every merge into `main`
  is a release (`.github/workflows/release.yml`, the same release system as Shinatama, Mukade, Xiox, Muro,
  Ethel and artcraft-web).
  The version goes up by a patch, or by a minor or major step when the pull request has the label
  `release:minor` or `release:major`; `npm run verify` is the build, on Windows; the tag `v<version>` and the
  GitHub Release (no installer and no assets: an app depends on the tag) are published, and `main` is merged
  back into `develop`. Nothing is published when `npm run verify` fails.
- Never change the version or create release tags by hand: the workflow does it (`.github/release.json` lists
  the version files, `.github/scripts/release.mjs` writes them).

## Working on the package

- Before UI work, read `docs/design-file.md`: it is the canon, and every other document agrees with it.
- A change to `css/` or `ts/` keeps `npm run check` green (the package's own `css/` against the rules of `imago-check`),
  as well as `npm test` and `node tests/gallery/run.mjs`.
- One way for each need. A name the package removes is removed, not kept as an alias; a name removed or renamed gets a
  row in the table "Moving from 0.1.4" of `docs/using-imago.md` (old name, and the new name or what to do instead) and
  an entry in `scripts/check/removed.mjs`, so that `imago-check` reports it in an app (`tests/check.test.ts` compares
  the two).
- A new rule, class, attribute, token or export is written in the documents: the rule in `docs/design-file.md`, the
  calls in the document `docs/design-file.md` names for them. `tests/docs.test.ts` fails on a name of the code that no
  document writes, and on a name a document writes that the code does not have.
- The gallery shows every class `css/` defines, in both looks and both themes, and its contrast test covers it; a class
  nothing uses is listed, with its reason, as pending removal in `tests/gallery/coverage.mjs` until it is removed (with
  its row and its entry).

## Rust is built and tested on GitHub only

- Never run `cargo build`, `cargo test`, `cargo clippy`, `cargo check`, `cargo run`, `cargo doc`, `tauri dev` or
  `tauri build` on this machine, and never run an npm script that calls them (`npm run verify`, `npm run demo`,
  `npm run demo:build`).
- Rust is compiled, formatted, linted and tested only by the workflows in `.github/workflows/`. The Verify job runs
  `cargo fmt --all --check` and `cargo clippy -p imago-shell --all-targets -- -D warnings`, then `npm run verify`.
  To know whether Rust code is right, push to `develop` and read the run (`gh run watch`, `gh run view --log-failed`).
- A program needed on this machine (the demo app for a screen capture) is taken from a workflow artifact with
  `npm run demo:fetch` (the latest successful run on `develop`), never built here.
- Node tests and the gallery tests (`npm test`, `node tests/gallery/run.mjs`) do run locally.
