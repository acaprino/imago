# One canon: Imago says one thing, and the apps follow it

Date: 2026-11-21. Status: approved by the owner on 2026-11-21 ("ok fallo"), after the audit of the five apps.
Every decision marked *(call)* was made by the agent, not agreed with the owner.

> This is the design as approved, before the build. Where it differs from the built package (a name, a signature, a tone on a notice, which calls `mountApp` makes), [design-file.md](../../design-file.md) wins.

## Intent

The five apps still look and behave differently, and not only because they adopted Imago to different degrees.
From v0.1.2 to v0.1.4 the package gained a second family of layouts, controls and patterns that contradicts
[design-file.md](../../design-file.md), and the design file was not updated. Muro has no stylesheet of its own,
uses only v0.1.4, and still breaks the design file, because it follows that second family.

The style the owner wants is the approved one: Smooth and ONI, one accent per app, the seven regions and three
breakpoints, every control with every state, the same keys and surfaces in every app. Where the package offers
something that contradicts it, the design file wins and the package changes.

## What the audit found

In the package:

- Four window frames: `im-shell` with its seven regions (the design), `im-app-layout` with `im-main` (made for Muro),
  `im-desktop-frame` with `im-resizable-nav` and `im-docked-inspector` (made for Shinatama), `im-page-frame` with
  `im-workbench`, `im-navigation-panel` and `im-detail-panel` (made for Daodan). `shellFrameHtml` emits only the
  title bar and the content.
- Several controls for one need, drawn differently: checkbox and radio (`im-check` on ARIA elements, `im-native-*`
  with the browser's own drawing); segmented (`im-seg`, `im-seg--native`, `im-seg--choice`); message (`im-note`,
  `im-banner`, `im-callout`); loading (`setPanelState`, `im-busy`, `loadingStateHtml`, `loader`); empty (`im-empty`
  in two files, `im-zero-state`, `im-empty-message`); steps (`im-steps`, `im-step-nav`); a side panel (`im-inspector`,
  `im-docked-inspector`, `im-inspection-rail`, `im-detail-panel`, the modal drawers `im-content-drawer`,
  `im-sectioned-drawer`, `im-padded-drawer`).
- Rules of the design file that the package's own CSS breaks: disabled by opacity, selection by colour alone
  (`aria-pressed`, `aria-current`), a hand cursor, breakpoints on the viewport (`@media (max-width…)`), sizes of text
  outside the scale (22, 15, 1.65rem), literal spacing, a literal colour, the tones `danger`, `good` and `bad`.
  (Corrected on 2026-11-21: the first text of this audit also named `accent`. That was wrong: the approved preview
  has an accent chip, and the CSS of v0.1.1 already drew `data-im-tone="accent"`. It stays.)
- `ts/shell/shinatama-palette.ts` in the package, although the design file says the skins stay in Shinatama.
- A React entry, although the design says no framework.
- Documents the design file does not name, whose names no test checks, and patterns the gallery does not show.
- No token for the size of text and none for categorical colours, so apps write literals.

In the apps: each pins a different Imago (Xiox none); four of five lack the agent rules; `Ctrl+K`, `Ctrl+F`, the
command registry, notices, panel states, the inspector and the wording of destructive actions are missing or
different in each. Nothing checks an app against the rules.

## Goals

- `design-file.md` is the one canon: complete, without alternatives, and every other document agrees with it.
- One way to do each thing in the package. What duplicated it is removed, not deprecated.
- A rule is checked by a program wherever a program can check it, in the package and in each app.
- The five apps on the same Imago, with the same layout, controls and behaviour.

## Non-goals

- No change to what the approved design looks like: colours, accents, measures, fonts, the two looks.
- No change to an app's features or content.
- No release: the owner merges `develop` into `main`. Until then an app's `develop` pins a commit of Imago's `develop`.
- Daodan's viewer is not rewritten without React.

## Anti-goals

- A canon that says "or": two accepted ways are two looks in a year.
- Keeping a removed class alive "for compatibility". An app is pinned to a version; it moves when it migrates.
- A check that only warns.
- An app that looks right and has lost a function in the move.

## Constraints

- `AGENTS.md` of each repository: work on `develop` or a short branch from it, never `main`; no hand-made version.
- Rust is built and tested only by GitHub Actions. A change to Rust is known to be right when the run on `develop`
  is green.
- Mukade, Muro and Shinatama have another branch checked out with work in progress. The work on each app happens in a
  separate worktree, on a short branch from its `develop`, and does not touch what is checked out.
- Text contrast 4.5:1 on the composited colour, as today, tests included.

## Approaches

1. **The design file wins; the package converges to it; then each app** (chosen). The cause is in the package, so
   the package is fixed first, and each app then has one thing to follow and a program that says where it does not.
2. **Accept the second family as allowed variants and document it.** Cheapest. It makes the differences official.
3. **Fix the apps only.** It cannot work: Muro already follows the package to the letter.

## Decisions

### The canon

- `design-file.md` holds every rule, and a table that names every other document and what it is for. The topic
  documents (`content-composition.md`, `html-composition.md`, `native-forms.md`, `inspection.md`, `graphs.md`) stay
  as references of calls, rewritten to agree with it; none of them states a rule the design file does not.
- `design.md` gains its corrections: React, the page patterns, what moved.
- `tests/docs.test.ts` checks the names in every document under `docs/` (not `docs/reference/`, not
  `docs/superpowers/`).

### One frame

- The only frame is `im-shell` with the seven regions. `im-app-layout`, `im-main`, `im-desktop-frame`,
  `im-desktop-content`, `im-page-frame`, `im-page-view`, `im-workbench`, `im-work-column`, `im-work-area`,
  `im-navigation-panel`, `im-resizable-nav`, `im-nav-rail` are removed.
- `shellFrameHtml` emits all seven regions from its options (a region not given is left out; the inspector is
  always there, hidden). `renderShellFrame` keeps the title bar, the body and the inspector mounted across repaints.
- A resizable sidebar is `im-sidebar` with `sidebarResize`, which exists.
- One side panel: `im-inspector`, not modal, docked from 1000 up and a drawer under it. `im-docked-inspector`,
  `im-inspection-rail`, `im-detail-panel` and the three modal drawers are removed. The inspector's width is
  `--im-w-inspector` (300); `data-im-inspector="wide"` on the shell makes it 360, the top of the range the design
  allows *(call)*.
  (Added when the owner's `drawer` was merged: "no drawers" is about the modal drawers, the forms that blocked the
  window while they saved, which are a dialog with `canDismiss` or `lock`. `openDialogDrawer` is another thing: an
  app-owned `dialog`, not modal, a layer of the one stack beside live panels, which blocks nothing and holds no form that
  must not be left. It keeps the class `im-content-drawer`; the modal ones stay removed.)
- Page content inside the content region (Muro's pages, Daodan's documents) keeps its helpers: `im-page-content`,
  `im-page-heading`, `im-section-heading`, `im-content-toolbar`, `im-definition-list` and the lists. `im-document`
  and `im-toolbar` merge into `im-page-content` and `im-content-toolbar` *(call)*.
- Every breakpoint in the package is a container query on `im-shell`, at 1000, 850 or 620. No `@media` on a width.
- The React entry stays as a binding for Daodan's viewer *(call)*: its components emit the canonical classes and
  nothing else (`Workbench` renders the shell's sidebar, content and inspector). It is the one exception to "no
  framework", written in `design.md`.

### The mark at the top left

The audit of 2026-11-21 found five different things at the left of the title bar: the gallery's square with a drawn
symbol, Muro's PNG logo with no name, Mukade's own drawing with no square, Shinatama's name alone, Xiox's own amber
square, Daodan's square with the text "d.". The owner asked for one treatment, saw three of them side by side for
the five apps in both looks and themes (Shinatama's name alone, Daodan's lowercase letter with a dot, a capital
initial), and chose the capital initial on 2026-11-21 ("C. Quadrato + iniziale maiuscola"):

- The mark is `im-mark`: the 22px square in the app's accent (rounded in Smooth, cut in ONI) holding **one letter**,
  the initial of the product's name in capitals, in the head font, weight 700, in `--im-accent-on`. No drawn symbol,
  no image. The name (`im-wordmark`) is always beside it.
- Mukade and Muro both show M; the hue and the name beside it tell them apart *(call)*.
- `titlebarHtml` always writes the mark and the name from `brand.name`; `brand.image` and `im-brand-image` are
  removed. The gallery's `MARKS` symbols go. An app's logo image stays what Windows shows (taskbar, executable),
  not what the title bar shows.
- `imago-check` reports a title bar whose brand is not that markup (rule `brand-mark`).

### The icon of the executables

The owner asked on 2026-11-21 that the icons of the executables follow the mark too, "sia cli sia ui": the program
of the command line and the program of the window. The owner saw two fills at the real sizes of Windows (16 to 96
pixels) on a dark and on a light taskbar, was advised the first, and answered "ok".

- The icon is the mark: a square with rounded corners (6 of 22, as the mark in Smooth) holding the capital initial,
  weight 700. The fill is the app's accent of the dark themes, `oklch(0.82 0.12 H)`, and the letter its ink,
  `oklch(0.2 0.04 H)`, both as the sRGB values `css/tokens.css` already carries. One icon per app, the same for its
  command-line program and its window program *(call)*, and the favicon of a page served in a browser.
- Mukade and Muro both show M, and on a taskbar no name stands beside the icon: the hue alone tells them apart
  (violet and mint). The owner was told and did not object *(call)*.
- The icons are made in the package by one script for the five apps and committed, so that they are the same
  construction; an app copies its own from the package, and `imago-check` reports an app whose icon files differ
  (rule `app-icon`).
- How each app embeds an icon in its command-line program is the app's own plan: Mukade and Xiox already compile a
  resource file; for Shinatama, Muro and Daodan the plan first finds out how the program is built and says whether an
  icon can be embedded.

### One control for one need

| Need | Stays | Removed or merged |
|---|---|---|
| Checkbox, radio, switch | One drawing, on `im-check`, `im-radio`, `im-switch`. The class goes on an ARIA element (`aria-checked`) or on a native `input` (`:checked`, `:indeterminate`, `:disabled`). In a `form` the input is native | `im-native-check`, `im-native-radio`, `im-native-choice`, the `accent-color` drawing |
| Text field, select, textarea | `im-input` round a native control, `im-select` on a button or a native `select`, `im-textarea`; one drawing | `im-native-input`, `im-native-select`, `im-native-textarea`, `im-native-controls` |
| Segmented | `im-seg`, with buttons (`aria-selected`) or with labels over native radios; one drawing | `im-seg--native`, `im-seg--choice` as separate drawings |
| A message that stays in the page | `im-note`, with `im-note--block` for a title, a paragraph, a list and actions; `noteHtml` | `im-banner`, `im-callout`, `bannerHtml` |
| Loading | A panel: `setPanelState` and its string twin `panelStateHtml` (skeleton, after 300ms). A running operation in the content: `loader` (`im-loader`, inline). A button: `aria-busy` | `im-busy`, `busyIndicatorHtml`, `loadingStateHtml` |
| Empty | `im-empty`, the markup of `setPanelState`; `emptyStateHtml` writes the same | `im-zero-state`, `im-empty-message`, the second `im-empty` |
| Steps | `im-steps`; an item that can be opened is a button inside it | `im-step-nav` as a separate drawing |
| Selected | Fill, weight and the accent mark, the same whatever attribute says it: `aria-selected`, `aria-current`, `aria-pressed`, `:checked` | The colour-only rules |
| Dialog | `confirm` for a decision, `openFormDialog` for a form, `openContentDialog` for an app-owned `dialog` element; one drawing (`im-dialog`), centred | The drawer variants |
| Tone | The status tones `ok`, `warn`, `err`, `info`, on a chip, a dot, a note or a notice. `accent` on a chip, a dot or a summary only: it is not a status, it marks data in the app's colour, as the approved preview and the first gallery do ("lead", "Demo") | `danger` (becomes `err`), `good`, `bad`; `accent` on a note or a notice |
| Zoom | 50 to 200% in steps of 10 | The `levels` option |

A drawing that the native element and the ARIA element share is done once in `css/controls.css`; the gallery shows
both in the same row, and the gallery test measures both.

### Rules the package now obeys

- Disabled is never an opacity. No control has a hand cursor. Every class of the package starts with `im-`
  (`wm-drop-preview` is renamed).
- New tokens *(call)*: `--im-fs-micro` 11, `--im-fs-meta` 12, `--im-fs-body` 13, `--im-fs-title` 14,
  `--im-fs-display` 18; and eight categorical colours `--im-cat-1` to `--im-cat-8`, with the accent's lightness and
  strength in each theme and the hues 25, 75, 125, 170, 215, 255, 300, 345, with `--im-cat-on` for text on them.
- Every size of text, every space, radius and colour in `css/` is a token. A page title is 18, a section title 14.
  The exceptions are written in the check's own list, each with its reason (the 1px hairline, the 2px ring, an
  icon's box).
- `shinatama-palette.ts` and its test leave the package; Shinatama carries them.
- The classes made for one app that are a pattern any app could use stay, under a name that says the pattern
  *(call)*: an app may have no stylesheet at all. `design-file.md` says so: a list, a card or a summary is common
  from the start; only content no other app has (a terminal, a graph of teams, a matrix) is the app's own.

### Behaviour every app gets the same way

- `standardCommands(registry, shell, { search, labels })` registers `Ctrl+K` (the palette) and `Ctrl+F` (search in
  the current view) with the same ids in every app, and returns what undoes it.
- `footerKeys(footer, registry, ids)` writes the footer's key list from the registry, and `keyCaps` stays the only
  source of a key cap.
- `mountApp(shell, registry, options)` *(call)* makes the calls of `using-imago.md` section 6.5 in one place:
  `attachLayers`, `registry.attach`, `regions`, `sidebarDrawer`, `standardCommands`. An app that calls it cannot
  forget one.

### The check

`imago-check`, a program in the package (`bin`), run by each app's CI and by Imago on its own gallery and demo. It
fails, with file and line, on:

- a selector in the app's CSS that contains an `im-` class, or a custom property that starts with `--im-`;
- a literal colour, a literal size of text, a literal space or radius outside the allowed list, in CSS and in
  `style` written from TypeScript;
- `cursor: pointer`, `opacity` on a disabled selector, `@media` on a width, `showModal(`;
- a class `im-…` or an attribute `data-im-…` that the pinned package does not define (a removed or mistyped name);
- the npm pin and the Cargo pin of Imago not being the same commit or tag;
- `AGENTS.md` and `CLAUDE.md` without the lines of `using-imago.md` section 9;
- no call of `mountApp`.

An exception is a comment on the line, `imago-check: allow <rule> — <reason>`; the program prints every exception
it accepted. What a program cannot judge (the wording of a destructive button, one primary action per window) stays
a rule in the design file and a line in the app's review.

### The gallery

Every class the package defines appears in the gallery, in both looks and themes, and the contrast test covers it.
A test fails when `css/` defines an `im-` class the gallery never renders.

### The window code of the crate

Xiox's own window code does three things the crate `imago-shell` did not: it trims the WebView2 context menu to
the editing commands, it tints the acrylic for light and for dark (which shows on Windows 10 only), and it ignores
the failures WebView2 reports while the application closes. The owner asked for the three in the crate on
2026-11-21 ("Sì certo"), knowing they are Rust and proved only by the run on GitHub. Xiox then drops its own code
for them when it adopts the crate. Task 18 of the package plan.

### The apps

One short branch per app from its `develop`, in a worktree, in this order *(call)*: Muro and Shinatama (already on
v0.1.4, the least distance), Mukade, Daodan, Xiox (not started; part 1 and part 2 of `using-imago.md` section 8).
For each app:

1. Pin the commit of Imago's `develop` that holds this work, in npm and in Cargo.
2. `mountApp`, the seven regions, the inspector in place of drawers and detail boxes, notices through `notify`,
   panel states through `setPanelState`.
3. The removed names replaced with the canonical ones; the app's own CSS on tokens only.
4. The words: a destructive button carries the verb and the object; an icon button has a tooltip.
5. `AGENTS.md` and `CLAUDE.md` carry the lines of section 9; CI runs `imago-check`.
6. The app's own tests pass locally where they may run; the branch is merged into `develop`, pushed, and the run on
   GitHub is read.

Minimum window width 500 in every `tauri.conf.json`. Shinatama gains ONI light or its absence is written in the
design file as Shinatama's own; the builder reads why it is forced dark before choosing.

## Left to the builder

- The exact markup that lets one drawing serve an ARIA element and a native input.
- The names of the patterns that are renamed, and the mapping table old name to new name, which goes in
  `using-imago.md` as "Moving from 0.1.4".
- How `imago-check` parses CSS and TypeScript (no new runtime dependency in the package if it can be avoided).
- The order of the commits inside the package, as long as `npm test`, `npm run build` and `npm run test:gallery`
  pass at each.

## Needs the owner

- The release of Imago and of each app (the pull request `develop` to `main`).
- A look at the real windows after each app moves: a capture cannot be taken for an app whose Rust is not built on
  this machine, so the agent checks the page in a browser and the owner the window.
