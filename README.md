# Imago

The shared design system of Shinatama, Xiox, Mukade, Muro and Daodan: one set of tokens, CSS, behaviour
modules and a Rust desktop shell, so the apps of the suite look and behave alike. Each app depends on a tag of
this repository.

Under construction: this is version 0.0.0, the repository and its release workflow. The design is in
[docs/design.md](docs/design.md).

## What is where

| Folder | What |
|---|---|
| `tokens/` | `imago.tokens.json`, the single source of the tokens. |
| `css/` | The stylesheets: tokens, base, primitives, controls and the ONI look. |
| `ts/ui/` | Behaviour modules without a framework: commands, menu, inspector, sheet, dialog, notice, keys. |
| `ts/shell/` | The desktop shell in the WebView: window controls, zoom, desktop guard, window theme. |
| `crates/imago-shell/` | The Rust side of the shell: acrylic, theme, Snap Layouts, guard, WebView2 recovery. |
| `gallery/` | The gallery page: every control in every state, in both looks and themes. |
| `docs/` | `design.md` is the design; `reference/` holds the proposal and the toolkit preview it came from. |
| `tests/` | The tests of the package and of the gallery. |
| `scripts/` | The token build. |
| `.github/` | The verify and release workflows, and `release.json`, which says what a release writes. |

## Scripts

| Command | What |
|---|---|
| `npm test` | The unit tests (`node --test`). |
| `npm run tokens` | Builds `css/tokens.css` from `tokens/imago.tokens.json`; `-- --check` only compares. |
| `npm run gallery` | Serves the gallery with Vite. |
| `npm run build` | Type-checks, then builds the gallery. |
| `npm run test:gallery` | Opens the gallery in a browser and checks every control, contrast included. |
| `npm run verify` | All of the above and `cargo test -p imago-shell`: what CI runs. |

## Releases

Work happens on `develop`. A release is the pull request `develop` to `main`, merged by the owner; the workflow
runs `npm run verify`, sets the version and the tag `v<version>`, and publishes a GitHub Release with no
installer. See [AGENTS.md](AGENTS.md).
