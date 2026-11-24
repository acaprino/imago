# Imago

The base shell of Shinatama, Xiox, Mukade, Muro and Daodan, built with the design system
[Sigrid](https://github.com/acaprino/sigrid): the window of a Tauri app on Windows 11, the identity and the icon of each app,
and the one frame they share. The look and the components are Sigrid's. Each app depends on a tag of this repository.

What exists: the crate `imago-shell` (the native side of the window), `defineApp` (the typed identity of an app), the icons of
the apps' executables, the check `imago-check`, and a demo app, one page on Sigrid in a real window. The React shell is not here
yet. The version is set by the release workflow, not by hand.

The design system Imago was up to 0.4.1 (CSS, string renderers, tokens, gallery) is at the tag `v0.4.1`.

## The documents

[docs/design-file.md](docs/design-file.md) is the canon. Read it before UI work.

| Document | What it is |
|---|---|
| [docs/design-file.md](docs/design-file.md) | Who owns what, the look, the frame, the window, what a program checks and what a person checks |
| [docs/using-imago.md](docs/using-imago.md) | How an app adopts the package: the dependency lines, the imports, the window's wiring, the icons, the lines for its `AGENTS.md` and `CLAUDE.md`, the `"imago"` block of its check, and the table "Moving from 0.4.1" |
| [docs/desktop-shell.md](docs/desktop-shell.md) | The window techniques, the crate, the wiring order of an app, WebView2 recovery and the rebuilding contract |
| [docs/verification.md](docs/verification.md) | What has been run on a real window, and what has not |

`tests/docs.test.ts` checks the documents against the code and against the installed Sigrid: every import and every call they
write, every Rust name, every item the crate re-exports, the permissions of the demo's capability file, every relative link and
every rule of `imago-check`. It also checks that no document writes a removed name outside the table "Moving from 0.4.1".

## What is where

| Folder | What |
|---|---|
| `ts/` | The package: the root entry, `@acaprino/imago`. |
| `icons/` | The icons of each app's executables, made by `npm run icons`. |
| `crates/imago-shell/` | The Rust side of the shell: material and theme, Snap Layouts, navigation guard, WebView2 recovery, window state. |
| `examples/demo/` | The demo app: a page on Sigrid in a real Tauri window, and the screen capture that checks it. |
| `docs/` | The documents above. |
| `tests/` | The tests of the package, of the documents and of the demo's page. |
| `scripts/` | The icon build, and `scripts/check/`, the program `imago-check`. |
| `.github/` | The verify and release workflows, and `release.json`, which says what a release writes. |

## Scripts

They compile or test, so GitHub Actions runs them and no developer's machine does, but for `demo:fetch`, `capture` and `icons`
([AGENTS.md](AGENTS.md)).

| Command | What |
|---|---|
| `npm run build` | Compiles the package into `lib/`, type-checks it and the demo's page, and builds the page. |
| `npm run check` | `sigrid-check`, with the rule `own-class`, on `ts/` and on the demo's page. |
| `npm run test:demo` | Opens the built page in a browser, in both schemes and at the widths where the frame changes, and in a window that pretends to be Tauri's. |
| `npm test` | The unit tests (`node --test`), the document tests and the tests of `imago-check` included. |
| `npm run verify` | The checks of CI: all of the above and `cargo test -p imago-shell`. |
| `npm run icons` | Draws the icons of the apps' executables into `icons/<app>/`, on Windows with the font Segoe UI Variable Display; `-- --check` only compares. |
| `npm run demo:web` | Builds the demo's page into `examples/demo/dist`. `demo:build` runs it first. |
| `npm run demo:serve` | Serves the demo's page with Vite, for `npm run demo`. |
| `npm run demo` | Starts the demo app in development. It builds Rust. |
| `npm run demo:build` | Builds the demo program with `tauri build`. It is the Verify workflow's `demo` job. |
| `npm run demo:fetch` | Downloads the demo app that the Verify workflow built (the artifact `imago-demo`) to `examples/demo/app/`, from the latest successful run of a push to `develop` and no other (a pull request's artifact is never taken: `capture` starts the program and clicks it). Prints the run and the commit it was built from, and warns when that is not this checkout's `HEAD`; `-- --dry-run` only says which. Needs the `gh` CLI, signed in. |
| `npm run capture` | Photographs the demo window from the screen in both themes over a dark and a bright window, and drives it with the real mouse. Run `npm run demo:fetch` first. Needs a Windows 11 desktop session. |

## Using it

An app pins a tag (`"@acaprino/imago": "github:acaprino/imago#v<x>"` and `imago-shell = { git =
"https://github.com/acaprino/imago", tag = "v<x>" }`), with Sigrid 6 and React 19 as peers, and runs `npx imago-check` before it
says UI work is done. [docs/using-imago.md](docs/using-imago.md) has the rest.

## Releases

Work happens on `develop`. A release is the pull request develop → main, merged only when the Verify run on develop's tip is
green: the release workflow builds and publishes, it does not run the tests again. Imago has no program to build, so the
workflow's build is `npm run verify`; it then sets the version and the tag `v<version>`, and publishes a GitHub Release with no
installer. See [AGENTS.md](AGENTS.md).
