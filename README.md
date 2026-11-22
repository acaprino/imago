# Imago

The shared design system of Shinatama, Xiox, Mukade, Muro and Daodan: one set of tokens, CSS, behaviour modules and a
Rust desktop shell, so the apps of the suite look and behave alike. There is no UI framework in it (the one exception is
a React binding for Daodan's viewer). Each app depends on a tag of this repository.

What exists: the tokens and their CSS, the layout shell with its seven regions and three breakpoints, every control
in every state in two looks (Smooth and ONI, each dark and light) and five accents, the page patterns of the content
region, the behaviour modules (command registry, keys, menus, sheets, dialogs, notices, the inspector, the palette,
panel states, the sidebar, `mountApp`), the page side of the desktop shell, the crate `imago-shell`, the icons of the
apps' executables, the check `imago-check`, the gallery, and a demo app that shows the gallery in a real glass window.
The version is set by the release workflow, not by hand.

## The documents

[docs/design-file.md](docs/design-file.md) is the canon: every rule, and the name in the code that stands for it. Read it
before UI work. It links every other document, and none of them states a rule it does not.

| Document | What it is |
|---|---|
| [docs/design-file.md](docs/design-file.md) | The design file, for people and coding agents: looks, colour, type, measures, the one frame, controls and their states, page patterns, surfaces, behaviour, what a program checks and what a person checks. It is not called `DESIGN.md` because on Windows that name is the same file as `design.md` |
| [docs/using-imago.md](docs/using-imago.md) | How an app adopts the package: the dependency lines, the imports, the markup, the calls, `mountApp`, the order of adoption, the lines for its `AGENTS.md` and `CLAUDE.md`, the `"imago"` block of its check, and the table "Moving from 0.1.4" |
| [docs/desktop-shell.md](docs/desktop-shell.md) | The glass technique on Windows 11, the window techniques, the wiring order of an app, WebView2 recovery and the rebuilding contract |
| [docs/verification.md](docs/verification.md) | What has been run on a real window, and what has not |
| [docs/html-composition.md](docs/html-composition.md), [docs/content-composition.md](docs/content-composition.md), [docs/native-forms.md](docs/native-forms.md), [docs/inspection.md](docs/inspection.md), [docs/graphs.md](docs/graphs.md) | The calls of the string renderers, the page patterns and the workspace controls, forms and dialogs, inspection content and the React binding, and graphs |
| [docs/design.md](docs/design.md) | The approved design with its reasons, and the corrections made after the build |
| `docs/reference/` | The proposal and the toolkit preview the design came from |

`tests/docs.test.ts` checks the documents against the code: every `--im-*` name, every `im-` class and `data-im-*`
attribute, every export they import or call, every Rust name they call or write as `Type::name`, every item the crate
re-exports from its root (the documents must name it), the permissions of the demo's capability file, and every
relative link. It also checks that the documents are complete: every class of `css/`, every attribute, every token,
every export of the six entry points and every rule of `imago-check` is in a document, and no document writes a name of
the table "Moving from 0.1.4" outside it.

## What is where

| Folder | What |
|---|---|
| `tokens/` | `imago.tokens.json`, the single source of the tokens. |
| `css/` | The stylesheets: tokens (generated), base, primitives, controls, surfaces, the page patterns, the workspace and graph controls, and the ONI look. |
| `ts/ui/` | Behaviour modules and renderers without a framework: commands, keys, menus, sheets, dialogs, notices, the inspector, the palette, panel states, the sidebar, `mountApp`, the string renderers and DOM builders. |
| `ts/shell/` | The desktop shell in the page: look, window theme, zoom, window buttons, desktop guard. |
| `react/` | The React binding, for Daodan's viewer. |
| `icons/` | The icons of each app's executables, made by `npm run icons`. |
| `crates/imago-shell/` | The Rust side of the shell: acrylic and theme, Snap Layouts, navigation guard, WebView2 recovery, window state. |
| `gallery/` | The gallery page: the live shell of each app at any width, and every control in every state, in both looks and themes. |
| `examples/demo/` | The demo app: the gallery in a real Tauri window with the glass material, and the screen capture that checks it. |
| `docs/` | The documents above. |
| `tests/` | The tests of the package and of the gallery. |
| `scripts/` | The token build, the icon build, and `scripts/check/`, the program `imago-check`. |
| `.github/` | The verify and release workflows, and `release.json`, which says what a release writes. |

## Scripts

| Command | What |
|---|---|
| `npm test` | The unit tests (`node --test`), the document tests and the tests of `imago-check` included. |
| `npm run check` | `imago-check --package`: the package's own `css/` against the rules a program can check. |
| `npm run tokens` | Builds `css/tokens.css` from `tokens/imago.tokens.json`; `-- --check` only compares. |
| `npm run icons` | Draws the icons of the apps' executables into `icons/<app>/`, on Windows with the font Segoe UI Variable Display; `-- --check` only compares. |
| `npm run gallery` | Serves the gallery with Vite. |
| `npm run build` | Type-checks, then builds the gallery. |
| `npm run test:gallery` | Opens the gallery in a browser and checks every control, contrast included. |
| `npm run demo:fetch` | Downloads the demo app that the Verify workflow built (the artifact `imago-demo`) to `examples/demo/app/`, from the latest successful run of a push to `develop` and no other (a pull request's artifact is never taken: `capture` starts the program and clicks it). Prints the run and the commit it was built from, and warns when that is not this checkout's `HEAD`; `-- --dry-run` only says which. Needs the `gh` CLI, signed in. |
| `npm run capture` | Photographs the demo window from the screen in both looks and themes over a dark and a bright window, and checks the frame is glass. Run `npm run demo:fetch` first. Needs a Windows 11 desktop session. |
| `npm run demo` | Starts the demo app in development. It builds Rust, so only on a machine where Rust may be built; the Verify workflow builds it otherwise. Needs a Windows 11 desktop session. |
| `npm run demo:build` | Builds the demo program with `tauri build` (it builds Rust). It is the Verify workflow's `demo` job: for CI, not for a developer's machine. |
| `npm run demo:web` | Builds the gallery as the page the demo program embeds, into `examples/demo/dist`. `demo:build` runs it first, so it is for CI too; it builds no Rust. |
| `npm run verify` | The checks of CI: tokens, tests, `npm run check`, build, the gallery tests and `cargo test -p imago-shell`. |

## The gallery

`npm run gallery` serves one page. Pick the app (its accent), the look, the theme and the glass, and set the width of
the window from 250 to 1160 to see the breakpoints. Under the window are the state matrix (every control in every
state) and the panel states. The surfaces open on the live window: `Ctrl+K`, the menus and the destructive actions. The
gallery is the acceptance surface: a control is done when its row is complete and its contrast test passes.

## The demo app

`examples/demo` loads the gallery in a Tauri window built with `glass_window_config`, with the wiring of
[docs/desktop-shell.md](docs/desktop-shell.md), section 3. It is the executable example for an app that adopts the
shell, and what `npm run capture` photographs. It is never built on a developer's machine: the `demo` job of the
Verify workflow builds it and keeps it as the artifact `imago-demo`, `npm run demo:fetch` downloads the one of the
latest successful run on `develop`, and `npm run capture` photographs that program. What it showed on a real window is in
[docs/verification.md](docs/verification.md).

## Using it

An app depends on a tag (`"@acaprino/imago": "github:acaprino/imago#v<x>"` and `imago-shell = { git =
"https://github.com/acaprino/imago", tag = "v<x>" }`), imports `@acaprino/imago/css/imago.css`, `@acaprino/imago/ui`
and `@acaprino/imago/shell`, calls `mountApp` once for its shell, and runs `npx imago-check` before it says UI work is
done. [docs/using-imago.md](docs/using-imago.md) has the rest.

## Releases

Work happens on `develop`. A release is the pull request develop → main, merged only when the Verify run on develop's tip is green: the release workflow builds and publishes, it does not run the tests again. Imago has no program to build, so the workflow's build is `npm run verify`; it then sets the version and the tag `v<version>`, and publishes a GitHub Release with no
installer. See [AGENTS.md](AGENTS.md).
