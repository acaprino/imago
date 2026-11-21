# One canon, part 1: the package — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the package say one thing: one frame, one control per need, every value a token, the rules checked by a program, and `design-file.md` the one canon.

**Architecture:** The CSS of the second family is folded into the first (`css/controls.css`, `css/primitives.css`) or renamed to pattern names; the string renderers and the DOM builders emit the same markup; a small Node program, `imago-check`, reads CSS and TypeScript as text and fails on what the design file forbids. The apps are separate plans, one per app, written after this one is on `develop`.

**Tech Stack:** TypeScript 7 (erasable only, Node 24 type stripping), plain CSS with container queries, `node --test`, Playwright for the gallery tests, Vite 8 for the gallery. No new dependency.

**Spec:** [docs/superpowers/specs/2026-11-21-one-canon-design.md](../specs/2026-11-21-one-canon-design.md)

## Global Constraints

- Work on the branch `canon`, from `develop`; merged back into `develop` and deleted. Never `main`. No version change by hand.
- Never run `cargo`, `tauri dev`, `tauri build`, `npm run verify`, `npm run demo`, `npm run demo:build` on this machine.
- After each task: `npm test`, `npm run build` and `node tests/gallery/run.mjs` pass. A task that removes a class updates the gallery fixture and the gallery test that used it in the same commit.
- Text contrast 4.5:1 on the composited colour, disabled text included; the gallery contrast test stays green in both looks, both themes and the five apps.
- Colours, accents, measures, fonts and the two looks of the approved design do not change.
- Every class of the package starts with `im-`; every custom property with `--im-`; every attribute with `data-im-`.
- Breakpoints only as `@container im-shell` at 1000, 850 and 620.
- Tones are `ok`, `warn`, `err`, `info`, and no other.
- A removed name is removed, not kept as an alias. Every removal is a row of the table "Moving from 0.1.4" in `docs/using-imago.md` (old name, new name or what to do).
- English, in the plain voice of the existing documents. Commit messages say what the user of the package gets.

## Review Focus

- A native `<input type="checkbox" class="im-check">` that is `:indeterminate` or `:disabled:checked` draws exactly as the ARIA element in `mixed` or disabled-checked: the gallery test compares the computed box, border, fill and mark of both in every cell (Task 4).
- `renderShellFrame` called while a dialog is open, the inspector holds a form with typed text, or a region that existed is now absent: the dialog stays, the inspector's content and its values stay, the absent region is removed and later comes back (Task 3).
- `imago-check` on a CSS file with comments that contain braces, strings that contain `#fff`, nested `@container` blocks, and a declaration split over lines: no false finding, right line numbers (Task 2).
- An app pinned by tag in npm and by `rev` in Cargo that point to the same commit, and a `Cargo.toml` that takes `imago-shell` from the workspace (`imago-shell.workspace = true`): `pin-mismatch` resolves the workspace entry and does not fail when it cannot resolve a tag to a commit offline; it compares what it can and says what it could not (Task 2).
- A shell 250 CSS px wide (a 500px window at 200%) with all seven regions, a sidebar and an open inspector: the window buttons and the primary action stay inside the shell, as `tests/gallery/layout.mjs` asserts today (Task 3).

---

### Task 1: Tokens for the size of text and for categorical colours

**Files:**
- Modify: `tokens/imago.tokens.json`, `scripts/build-tokens.mjs` (only if the new groups need a rule), `css/tokens.css` (generated: `npm run tokens`)
- Test: `tests/tokens.test.ts`

**Interfaces:**
- Produces: `--im-fs-micro: 11px`, `--im-fs-meta: 12px`, `--im-fs-body: 13px`, `--im-fs-title: 14px`, `--im-fs-display: 18px` (shared, both looks). `--im-cat-1` … `--im-cat-8` and `--im-cat-on`, per theme: dark `oklch(0.82 0.12 H)` with `--im-cat-on: oklch(0.2 0.04 0)`-like dark text, light `oklch(0.47 0.13 H)` with `--im-cat-on: #FFFFFF`; hues 25, 75, 125, 170, 215, 255, 300, 345. Hex fallbacks as the accents have.

- [ ] **Step 1:** Tests: the five sizes have those values; each `--im-cat-n` has the accent's lightness and chroma for its theme; `--im-cat-on` on each `--im-cat-n` is 4.5:1 or more in both themes; each `--im-cat-n` as text on `--im-sheet-solid` is 4.5:1 or more (it is used as a mark and as text).
- [ ] **Step 2:** Run `npm test`; the new tests fail.
- [ ] **Step 3:** Add the tokens to the JSON, run `npm run tokens`. If a hue cannot reach chroma 0.12 in sRGB at that lightness, take the nearest hue that does and write it in the JSON's description.
- [ ] **Step 4:** `npm test` passes; `npm run tokens -- --check` passes.
- [ ] **Step 5:** Commit.

### Task 2: `imago-check`

**Files:**
- Create: `scripts/check/cli.mjs` (arguments, files, output, exit code), `scripts/check/css.mjs` (text of a stylesheet into rules: selector list, declarations, at-rule chain, line), `scripts/check/rules.mjs` (one pure function per rule), `scripts/check/names.mjs` (the `im-` classes, `data-im-` attributes and `--im-` properties the package defines, read from its `css/` and `ts/`), `scripts/check/allowed.mjs` (the literals that are not findings, each with its reason)
- Modify: `package.json` (`"bin": { "imago-check": "./scripts/check/cli.mjs" }`, `"files"` gains `"scripts/check"`, script `"check": "node scripts/check/cli.mjs --package"`)
- Test: `tests/check.test.ts`

**Interfaces:**
- Produces: `imago-check [--root <dir>] [--package]`. In an app it reads `"imago"` from the app's `package.json`: `{ "src": ["apps/desktop/src"], "cargo": "apps/desktop/src-tauri/Cargo.toml", "agents": ["AGENTS.md", "CLAUDE.md"], "entry": "apps/desktop/src/main.ts" }`; `src` defaults to `["src"]`, `agents` to those two, `cargo` and `entry` are optional (their rules are skipped and the program says so).
- Produces: a finding is `{ file, line, rule, message }`, printed as `file:line  rule  message`. Exit 1 on any finding, 0 otherwise, 2 on bad arguments.
- Rule ids, app mode: `im-selector` (a selector in the app's CSS contains `.im-…`, or sets a `--im-…` property), `literal-color` (hex, `rgb(`, `hsl(`, `oklch(`, `color-mix(` over a literal, in CSS values and in quoted strings of `.ts`/`.tsx`/`.js`/`.html` `style`), `literal-font-size` (`font-size` or the `font` shorthand with a length that is not a `var(--im-fs-…)`), `literal-space` (`padding*`, `margin*`, `gap`, `row-gap`, `column-gap`, `border-radius` with a length other than `0`, `1px`, `2px`, a percentage, or `var(…)`/`calc(…)` over tokens), `cursor-pointer`, `disabled-opacity` (`opacity` in a rule whose selector has `:disabled`, `[disabled]` or `aria-disabled`), `media-width` (`@media` with `width`), `show-modal` (`showModal(` in script), `unknown-name` (an `im-…` class or `data-im-…` attribute in the app's markup, script or CSS that the installed package does not define), `pin-mismatch`, `agent-rules` (the files lack the path `node_modules/@acaprino/imago/docs/design-file.md`), `mount-app` (`entry` and the files it imports never call `mountApp(`).
- Rule ids, `--package` mode, over `css/` of the package: `literal-color`, `literal-font-size`, `literal-space`, `cursor-pointer`, `disabled-opacity`, `media-width`, and `class-prefix` (a class that does not start with `im-`). `css/tokens.css` is exempt from the literal rules.
- An exception is a comment on the same line or the line above: `imago-check: allow <rule> — <reason>` (a hyphen is accepted for the dash; a reason is required). Every accepted exception is printed after the findings.

- [ ] **Step 1:** Tests, each rule with one string that must be found and one that must not, plus the Review Focus cases: braces in a comment, `#fff` inside `content: "#fff"` and inside `url(#clip)`, nested `@container` in `@media (forced-colors: active)`, a declaration over three lines, an exception with and without a reason, system colours (`Highlight`, `ButtonText`) inside `forced-colors`, `transparent`, `currentColor`, `inherit`; the Cargo cases (tag and tag: equal; tag and rev: reported as "cannot compare offline", not a finding; `workspace = true` resolved through the root `Cargo.toml`).
- [ ] **Step 2:** `npm test` fails on them.
- [ ] **Step 3:** Write the five files. No dependency: the CSS reader is a hand-written scanner that keeps line numbers.
- [ ] **Step 4:** `npm test` passes. `node scripts/check/cli.mjs --package` runs and prints the package's own findings (it will fail until Task 7: that is the list Tasks 3 to 7 burn down). Do not add it to `verify` yet.
- [ ] **Step 5:** Commit.

### Task 3: One frame

**Files:**
- Modify: `ts/ui/shell-markup.ts`, `ts/ui/shell-frame.ts`, `css/primitives.css`, `css/content.css`, `css/dom-parts.css`, `css/inspection.css`, `css/navigation-panels.css`, `css/patterns.css`, `css/file-workspace.css`, `gallery/apps.ts`, `gallery/mount/*.ts`
- Test: `tests/shell-markup.test.ts`, `tests/content-layout.test.ts`, `tests/gallery/layout.mjs`, `tests/gallery/content-inspection.mjs`, `tests/gallery/workspace-integration.mjs`

**Interfaces:**
- Produces:
  ```ts
  export interface ShellFrameOptions {
    titlebarHtml: string;
    contentHtml: string;        // was mainHtml
    contentLabel: string;       // the accessible name of the content region
    contentId?: string;         // default 'main' (was mainId)
    skipLabel: string;
    inspectorLabel: string;
    busy?: boolean;
    sidebarHtml?: string;       // from sidebarHtml()
    statusHtml?: string;        // the children of .im-status
    actionsHtml?: string;       // the children of .im-actions
    footerHtml?: string;        // the children of .im-footer
  }
  export function shellFrameHtml(options: ShellFrameOptions): string;
  export function sidebarHtml(options: { id: string; label: string; rowsHtml: string; collapse?: { collapse: string; expand: string } }): string;
  export function renderShellFrame(shell: HTMLElement, markup: string): void;
  ```
- Markup of the frame, in this order: skip link, title bar, `div.im-body` holding `[section.im-panel.im-sidebar]` and `div.im-work`, which holds `[div.im-status]`, `div.im-columns` (`main#<id>.im-panel.im-content[tabindex=-1][aria-label]` holding, in this order, an optional `im-panel-header`, an optional `im-panel-tools`, the `div.im-panel-body` and an optional `im-panel-foot`, from the options `contentHeaderHtml`, `contentToolsHtml` and `contentFootHtml` — a correction of 2026-11-21: the first text said "one child", which the design file's panel contradicts; then `section.im-panel.im-inspector[aria-label][hidden]`), `[div.im-actions]`, `[footer.im-footer]`. This is the markup of `docs/using-imago.md` section 4.
- `renderShellFrame` sets `data-im-sidebar` to `on` or `off` on the shell from the markup; replaces the children of the title bar, the sidebar, the status row, the content's `im-panel-body`, the action bar and the footer; adds or removes an optional region that appeared or went; never touches the inspector element or its children.
- Removed classes: `im-app-layout`, `im-main`, `im-desktop-frame`, `im-desktop-content`, `im-page`, `im-page-frame`, `im-page-view`, `im-workbench`, `im-work-column`, `im-work-area`, `im-workspace-area` (its role is `im-content`), `im-navigation-panel`, `im-resizable-nav`, `im-nav-rail`, `im-docked-inspector`, `im-inspection-rail`, `im-detail-panel`, `im-document` (use `im-page-content`), `im-toolbar` and `im-panel-strip` (use `im-content-toolbar`), `im-master-detail` (the detail is the inspector), `im-aside-layout` stays (a control column beside content, inside the content region).
- `im-page-content` gains the padding `im-main` had, from tokens: `--im-s-5` (24), and `--im-s-4` (16) under 620.
- `data-im-inspector="wide"` on the shell: the inspector is 360px. A shell with it and a sidebar docks the inspector from 1012 up; the existing rule at 1000 stays for the default width.
- What `im-nav-entry`, `im-nav-line`, `im-nav-mark`, `im-nav-detail`, `im-signal`, `data-im-badge` drew is kept as parts of a sidebar row (`im-row` and its parts); the names that stay are listed in the mapping table.

- [ ] **Step 1:** Unit tests for `shellFrameHtml` (the order and classes above; a region not given is absent; text escaped) and for `renderShellFrame` with a DOM stub as the existing test uses (the Review Focus cases). Gallery tests: Muro's, Shinatama's and Daodan's fixtures in `gallery/apps.ts` are the canonical frame; at 1160, 900, 700, 500 and 250 the regions are where `layout.mjs` expects; no element in the gallery carries a removed class.
- [ ] **Step 2:** Run; they fail.
- [ ] **Step 3:** Implement. Every `@media (max-width…)` in the files above becomes `@container im-shell` at 1000, 850 or 620 (980 → 1000, 760 → 850, 61.25rem → 1000, 56.2rem → 850, 480px → 620).
- [ ] **Step 4:** `npm test`, `npm run build`, `node tests/gallery/run.mjs` pass.
- [ ] **Step 5:** Commit.

### Task 4: One drawing for each form control and for selection

**Files:**
- Modify: `css/controls.css`, `css/forms.css` (what remains is form layout only), `css/inspection.css`, `css/looks/oni.css`, `ts/ui/markup.ts`, `ts/ui/form-markup.ts`, `ts/ui/dom-parts.ts`, `ts/ui/segmented.ts`, `gallery/matrix.ts`, `gallery/manifest.ts`
- Test: `tests/markup.test.ts`, `tests/form-markup.test.ts`, `tests/manifest.test.ts`, `tests/gallery/controls.mjs`, `tests/gallery/content-dialog.mjs`

**Interfaces:**
- `im-check`, `im-radio`, `im-switch` draw the same on an ARIA element and on `input[type=checkbox|radio]` with the class (`:checked` as `aria-checked="true"`, `:indeterminate` as `mixed`, `:disabled` as `aria-disabled`). The input has `appearance: none` and its mark is drawn with `::after`; WebView2 and Chromium draw pseudo-elements of such an input, and the gallery test proves it.
- `im-input` wraps `input`; `im-textarea` is new, a `textarea` with the field's drawing; `im-select` draws the same on `button` and on a native `select`.
- `im-seg` draws the same with `button[aria-selected]` children and with `label > input[type=radio] + span` children.
- Selected is drawn once: `:is([aria-selected="true"], [aria-current]:not([aria-current="false"]), [aria-pressed="true"])` on `im-row`, `im-tab`, `im-tree-item`, `im-menu-item`, `im-seg > *`; a pressed `im-btn` takes the selection fill and weight 600.
- Removed: `im-native-controls`, `im-native-input`, `im-native-select`, `im-native-textarea`, `im-native-check`, `im-native-radio`, `im-native-choice`, `im-seg--native`, `im-seg--choice`, `im-picker-mark`'s own check (it is an `im-check`), `im-choice-row`'s own selection rule.
- The renderers write the classes: `checkboxOptionHtml` and `choiceRowsHtml` give `input.im-check`; `switchHtml` gives the switch; `segmentedHtml` and `segmentedControl` give `im-seg` over radios; `textFieldHtml`, `inputHtml`, `settingInputHtml` give `span.im-input > input`; `selectHtml` gives `select.im-select`; `uiInput`, `uiSelect`, `uiTextarea` give the same.
- `gallery/manifest.ts` gains the controls `checkbox-native`, `radio-native`, `switch-native`, `select-native`, `segmented-native`, `textarea`, with the states of their ARIA twins.

- [ ] **Step 1:** Gallery test: for each native control and each state, the computed `width`, `height`, `border`, `border-radius`, `background-color` and the `::after` box and colour equal those of its ARIA twin's cell, in both looks and themes; the focus ring is where the table of the design file says; contrast as for the twin. Unit tests for the renderers' classes.
- [ ] **Step 2:** Run; they fail.
- [ ] **Step 3:** Implement, by extending each existing selector in `css/controls.css` with its native form, not by a second block.
- [ ] **Step 4:** The three commands pass.
- [ ] **Step 5:** Commit.

### Task 5: One message, one loading, one empty, one steps, four tones

**Files:**
- Modify: `css/controls.css`, `css/patterns.css`, `css/forms.css`, `css/content.css`, `css/inspection.css`, `css/file-workspace.css`, `ts/ui/shell-markup.ts`, `ts/ui/markup.ts`, `ts/ui/form-markup.ts`, `ts/ui/content-markup.ts`, `ts/ui/wizard-markup.ts`, `ts/ui/progress.ts`, `ts/ui/panel-state.ts`, gallery fixtures
- Test: `tests/panel-state.test.ts`, `tests/markup.test.ts`, `tests/wizard-markup.test.ts`, `tests/content-markup.test.ts`, `tests/gallery/panel-state.mjs`

**Interfaces:**
- Produces:
  ```ts
  export type Tone = 'ok' | 'warn' | 'err' | 'info';
  export function noteHtml(options: { title?: string; message?: string; items?: readonly { label: string; message: string }[]; actionsHtml?: string; tone?: Tone }): string; // im-note, im-note--block when it has more than a message; role alert for err and warn, status otherwise
  export type PanelStateMarkup =
    | { kind: 'loading'; rows: number }
    | { kind: 'empty'; text: string; actionHtml?: string }
    | { kind: 'error'; text: string; retryHtml: string; errorWord?: string };
  export function panelStateHtml(state: PanelStateMarkup): string; // the layer setPanelState builds, as a string
  ```
- `emptyStateHtml(title, description, actionHtml)` writes the `im-empty` of `setPanelState` (a title in `strong` is allowed there and in `setPanelState`'s `empty` through a new optional `title`).
- `stepNavigationHtml` writes `ol.im-steps` whose items hold a `button`; `stepList` and `stepProgress` write the same list; `im-steps` draws an item with a button with the common hover, press, focus (2px inside) and selected.
- `ChipTone` is `'' | Tone`. `statusButtonHtml`, `summaryHtml`, `chipHtml`, `actionChipHtml`, `statusTextHtml`, `settingsMessageHtml` take `Tone`.
- Removed: `bannerHtml`, `im-banner`, `im-callout`, `busyIndicatorHtml`, `im-busy`, `loadingStateHtml`, `im-zero-state`, `im-empty-message`, the `im-empty` of `css/forms.css`, `im-step-nav`, the tones `accent`, `danger`, `good`, `bad`, and the classes `im-text-accent`, `im-accent`, `im-kicker`'s accent colour, `im-warning`, `im-error` (use `im-text-warn`, `im-text-err`).

- [ ] **Step 1:** Tests: `panelStateHtml` for each kind equals `setPanelState`'s layer (`outerHTML` in the DOM stub, without the handlers); `noteHtml` roles and classes; a tone outside the four is a type error and, at run time, is written as no tone; steps markup; the gallery's panel-state test runs on a panel filled by `panelStateHtml` too.
- [ ] **Step 2:** Run; they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The three commands pass.
- [ ] **Step 5:** Commit.

### Task 6: Dialogs without drawers, zoom in steps of 10, the skins leave

**Files:**
- Modify: `ts/ui/dialog.ts`, `ts/ui/content-dialog.ts`, `ts/ui/sheet.ts`, `css/surfaces.css`, `css/content-surfaces.css`, `css/navigation-panels.css`, `ts/shell/zoom.ts`, `ts/shell/index.ts`
- Delete: `ts/shell/shinatama-palette.ts`, `tests/shinatama-palette.test.ts` (their text is kept for Shinatama's plan: copy both to the scratchpad before deleting, and say where in the commit message)
- Test: `tests/zoom-controller.test.ts`, `tests/shell.test.ts`, `tests/gallery/content-dialog.mjs`, `tests/gallery/surfaces.mjs`

**Interfaces:**
- `openContentDialog`, `createContentDialog` and `openFormDialog` draw one centred `im-dialog`. Removed: `im-content-dialog--drawer`, `im-content-drawer`, `im-sectioned-drawer`, `im-padded-drawer`, the `drawer` option of `createContentDialog`.
- `inspector(shell).open(content, opener?)` is how a side panel opens; `tests/gallery/surfaces.mjs` already covers it.
- `ZoomOptions` loses `levels`; `clampZoom(value)` and `stepZoom(current, direction)` lose their second parameter. A saved level that is not a multiple of 10 between 50 and 200 is rounded to the nearest one.
- `@acaprino/imago/shell` no longer exports `applyShinatamaPalette`, `SHINATAMA_PALETTES`, `ShinatamaPaletteTokens`.

- [ ] **Step 1:** Tests: a saved 67 becomes 70, 175 becomes 180 (half up), 125 becomes 130; no export of the palette (`tests/package.test.ts`); a content dialog is centred in both looks.
- [ ] **Step 2:** Run; they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The three commands pass.
- [ ] **Step 5:** Commit.

### Task 7: The package obeys its own check

**Files:**
- Modify: every file in `css/` except `tokens.css`; `css/tiling-workspace.css` and `ts/ui/tiling-workspace.ts` (`wm-…` → `im-…`); `scripts/check/allowed.mjs`; `package.json` (`verify` runs `npm run check` after `npm test`)
- Test: `tests/package-css.test.ts` (new: runs the `--package` rules and expects no finding)

**Interfaces:**
- Consumes: Task 1's tokens, Task 2's `--package` mode.
- Sizes of text: 11 → `--im-fs-micro`, 12 and .8rem → `--im-fs-meta`, 13 and .95rem → `--im-fs-body`, 14, 15 and 1.1rem → `--im-fs-title`, 18, 22, 1.65rem and the `clamp(1.55rem…)` → `--im-fs-display`. The wordmark's 15px becomes `--im-fs-title`.
- Spaces: each literal goes to the nearest of 4, 8, 12, 16, 24 (ties go down); 1px and 2px stay.
- `cursor: pointer` is removed everywhere; `opacity` on a disabled state becomes the muted colour and a dashed edge; `#111827` becomes `--im-cat-on`; `--im-item-color` (a row's own colour) takes a `--im-cat-n`.

- [ ] **Step 1:** Write `tests/package-css.test.ts`; it fails with the list of findings.
- [ ] **Step 2:** Fix file by file; after each file run `node tests/gallery/run.mjs layout.mjs controls.mjs` (the contrast and the measures).
- [ ] **Step 3:** The three commands and `npm run check` pass.
- [ ] **Step 4:** Commit.

### Task 8: `mountApp`, `standardCommands`, `footerKeys`

**Files:**
- Create: `ts/ui/app.ts`
- Modify: `ts/ui/index.ts`, `gallery/main.ts` and `gallery/mount/keys.ts` (the gallery uses `mountApp`)
- Test: `tests/app.test.ts`, `tests/gallery/keys.mjs`

**Interfaces:**
- Produces:
  ```ts
  export const PALETTE_COMMAND = 'imago.palette';   // Ctrl+K
  export const SEARCH_COMMAND = 'imago.search';     // Ctrl+F
  export interface StandardLabels { palette: string; search: string; palettePlaceholder?: string; paletteEmpty?: string }
  export function standardCommands(registry: Registry, shell: HTMLElement, options: { search: () => void; labels?: Partial<StandardLabels> }): () => void;
  export function footerKeys(doc: Document, registry: Registry, ids: readonly string[]): HTMLElement; // span.im-footer-keys: for each id that is registered and has keys, its key caps and its title
  export interface AppOptions { search: () => void; labels?: Partial<StandardLabels>; sidebar?: { collapsed?: boolean; onChange?: (collapsed: boolean) => void } }
  export function mountApp(shell: HTMLElement, registry: Registry, options: AppOptions): () => void;
  ```
- `mountApp` calls, in this order, `attachLayers(shell)`, `registry.attach(shell.ownerDocument)`, `regions(shell)`, `sidebarDrawer(shell)` and `sidebarCollapse(shell, options.sidebar)` when the shell has a sidebar, `standardCommands`; the returned function undoes all of them in reverse order. A second `mountApp` on the same shell throws.
- Default labels: `Commands`, `Search in this view`.

- [ ] **Step 1:** Tests with the stubs of `tests/commands.test.ts`: the two commands exist with those ids and keys; undo removes them and detaches; a shell without a sidebar mounts; a second mount throws; `footerKeys` skips an id that is not registered. Gallery: `Ctrl+K` opens the palette and `Ctrl+F` calls `search` in each app fixture.
- [ ] **Step 2:** Run; they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The three commands pass.
- [ ] **Step 5:** Commit.

### Task 9: The React binding emits the canon

**Files:**
- Modify: `react/index.js`, `react/index.d.ts`, `gallery/mount/inspection.ts`
- Test: `tests/react.test.ts` (new; renders with `react-dom/server` only if `react` is installed as a dev dependency, otherwise calls the components with a stub `createElement` passed through a module mock: pick the first that works without adding a runtime dependency; `react` and `react-dom` as dev dependencies are allowed)

**Interfaces:**
- `Workbench({ navigation, navigationLabel, children, details, detailsLabel, wide })` renders `div.im-body` > `[section.im-panel.im-sidebar]`, `div.im-work` > `div.im-columns` > `main.im-panel.im-content`, `[section.im-panel.im-inspector]` (`hidden` when `details` is empty). It goes inside an element with `im-shell`.
- `DetailPanel` is removed (the details are the inspector's children). `ListAction` renders `button.im-row` with `aria-pressed`; `Timeline`, `TabList`, `Disclosure` keep their markup. New: `Shell({ app, titlebar, children })` renders `div.im-shell` with `data-im-sidebar`.

- [ ] **Step 1:** Test the markup of each component against the classes above; no class outside what `scripts/check/names.mjs` reports for the package.
- [ ] **Step 2:** Run; fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The three commands pass.
- [ ] **Step 5:** Commit.

### Task 10: The gallery shows every class

**Files:**
- Create: `gallery/mount/patterns.ts` (the page patterns: heading, toolbar, summary, settings rows, stack list, definition list, task card, timeline, metrics, note in its tones, wizard, repeat rows, file list, code view; in the content region of an app fixture), `tests/gallery/coverage.mjs`
- Modify: `gallery/main.ts`, `gallery/index.html`, `tests/gallery/controls.mjs` (contrast over the patterns)

**Interfaces:**
- Consumes: `scripts/check/names.mjs` for the list of classes the package defines.
- `tests/gallery/coverage.mjs`: after every surface of the gallery was opened once (the hooks the other tests use), every `im-` class defined in `css/` is on at least one element; the test prints the ones that are not and fails. A class that only exists while something runs (a drag preview) is in a list in the test with its reason.

- [ ] **Step 1:** Write `coverage.mjs`; it fails with the list.
- [ ] **Step 2:** Add the patterns to the gallery until it passes; a class nothing renders and no renderer writes is deleted from `css/` and added to the mapping table.
- [ ] **Step 3:** Contrast over the new section passes in both looks, both themes, five apps.
- [ ] **Step 4:** The three commands pass.
- [ ] **Step 5:** Commit.

### Task 11: The canon in words

**Files:**
- Modify: `docs/design-file.md`, `docs/using-imago.md`, `docs/design.md` (corrections of 2026-11-21), `docs/content-composition.md`, `docs/html-composition.md`, `docs/native-forms.md`, `docs/inspection.md`, `docs/graphs.md`, `README.md`, `AGENTS.md` (the lines for agents of the package: read `docs/design-file.md` before UI work; run `npm run check`)
- Test: `tests/docs.test.ts`

**Interfaces:**
- `docs.test.ts`: the name checks (`--im-*`, `im-` classes, `data-im-*`, imported and called exports) run over every `docs/*.md`; a new test asserts `design-file.md` links every other `docs/*.md`; a new test asserts no document contains a name of the mapping table's "old" column outside that table.
- `design-file.md` gains: the document table; "One frame" (what the removed frames were, in one line, for readers who meet them in an old app); the control table with native and ARIA forms; "Page patterns" with every class of Task 10; the type and categorical tokens; "Selected" by any of the four attributes; `mountApp`; "What a program checks" with the rule ids of `imago-check`; "What a person checks" (wording of destructive buttons, one primary action, Undo bound, the real window); the React exception.
- `using-imago.md` gains "Moving from 0.1.4" (the whole mapping table), section 6 rewritten round `mountApp`, section 9's lines extended with `Run npx imago-check before you say UI work is done.` and the `"imago"` block for `package.json`.

- [ ] **Step 1:** Extend `docs.test.ts`; it fails on the topic documents.
- [ ] **Step 2:** Rewrite the documents.
- [ ] **Step 3:** `npm test` passes.
- [ ] **Step 4:** Commit.

### Task 13: One mark at the top left (runs before Task 10)

**Files:**
- Modify: `ts/ui/shell-markup.ts` (`titlebarHtml`), `css/primitives.css` (`.im-mark`), `css/content.css` (drop `im-brand-image`), `css/looks/oni.css` if the mark's letter needs ONI's font, `gallery/apps.ts` (drop `MARKS`), `react/index.js` if `Shell` writes a brand, `scripts/check/rules.mjs` and `scripts/check/cli.mjs` (rule `brand-mark`), `docs/using-imago.md` section 4 and `docs/design-file.md` "Layout" (the sentence on the mark), `docs/superpowers/moving/task-13.md`
- Test: `tests/shell-markup.test.ts`, `tests/check.test.ts`, `tests/gallery/layout.mjs`, `tests/gallery/controls.mjs` (contrast of the letter on the accent, five apps, both looks and themes)

**Interfaces:**
- `TitlebarOptions.brand` is `{ name: string }`; `image` is removed. `titlebarHtml` writes `<div class="im-brand" data-tauri-drag-region><span class="im-mark" aria-hidden="true" data-tauri-drag-region>M</span><span class="im-wordmark" data-tauri-drag-region>Muro</span></div>`: the letter is the first letter of `name`, in capitals (`Array.from(name.trim())[0].toLocaleUpperCase()`); a name with no letter writes no mark.
- `.im-mark` keeps its box (22px, accent fill, radius of a control, ONI's cut) and draws text: `font: 700 var(--im-fs-body)/1 var(--im-font-head)`, colour `--im-accent-on`, no letter spacing, no text transform. The `svg` rules of the mark are removed.
- `imago-check` rule `brand-mark`, app mode: an element with class `im-brand` in the app's markup or script whose content is not exactly one `im-mark` holding one letter followed by one `im-wordmark`; an `img` or `svg` inside `im-brand`; a class `im-brand-image`.
- Mapping rows: `brand.image` and `im-brand-image` → the mark and the name; a drawn symbol in `im-mark` → the initial.

- [ ] **Step 1:** Tests: `titlebarHtml({ brand: { name: 'muro' } })` writes the markup above with `M`; a name that starts with a space or an emoji; the gallery shows a letter in each app's mark and its contrast on the accent is 4.5:1 or more in both looks and themes; at 340 and under the brand is gone as before; the check rule on one string that must be found (an `img` in `im-brand`) and one that must not.
- [ ] **Step 2:** Run; they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npm run build`, `node tests/gallery/run.mjs` pass.
- [ ] **Step 5:** Commit.

### Task 14: The icons of the executables (independent; runs any time after Task 2 is merged)

**Files:**
- Create: `scripts/icons.mjs` (makes the icon set of each app), `icons/<app>/` for `shinatama`, `xiox`, `mukade`, `muro`, `daodan` (generated, committed), `docs/superpowers/moving/task-14.md`
- Modify: `package.json` (`"icons": "node scripts/icons.mjs"`, `"files"` gains `"icons"`, export `"./icons/*": "./icons/*"`), `scripts/check/rules.mjs` and `scripts/check/cli.mjs` (rule `app-icon`), `docs/using-imago.md` (a short section: where the icons are, which file goes where in a Tauri app, in a resource file of a command-line program and as a favicon)
- Test: `tests/icons.test.ts`, `tests/check.test.ts`

**Interfaces:**
- `npm run icons` writes, for each app, `icons/<app>/icon.svg` (the source: a 256 by 256 square, `rx` 70, the fill and the ink below, the letter as text), the PNGs `16`, `24`, `32`, `48`, `64`, `128`, `256`, `512` named `<n>x<n>.png`, `icon.png` (512), `icon.ico` (16, 24, 32, 48, 64 and 256, each entry a PNG), `favicon.ico` (16, 32, 48) and `favicon.svg`. `npm run icons -- --check` compares the SVGs and the list of files without drawing, and exits 1 on a difference.
- Fill: the sRGB hex of the app's `--im-accent` in the dark theme; ink: the sRGB hex of its `--im-accent-on` in the dark theme; both read from `tokens/imago.tokens.json` through `scripts/color.mjs`, never typed. Letter: the capital initial of the app's name, `font-family: 'Segoe UI Variable Display', 'Segoe UI', sans-serif`, weight 700, centred.
- The PNGs are drawn from the SVG with Playwright (already a dev dependency), so the script runs on a Windows machine that has the fonts; the files are committed and no test draws them again.
- The `.ico` container is written by the script itself (a header, one directory entry per size, the PNG bytes); no dependency.
- `imago-check` rule `app-icon`, app mode: the `"imago"` block of the app's `package.json` gains `"icons": { "<path in the app>": "<file name in icons/<app>/>" }`; each listed file must equal, byte for byte, the package's file. Without the key the rule is skipped and the program says so.

- [ ] **Step 1:** Tests: each app has the files above; every PNG's header gives its size; `icon.ico` holds the six sizes and `favicon.ico` the three; each SVG holds the right letter, the fill and the ink of that app's tokens; the contrast of the ink on the fill is 4.5:1 or more for the five; the check rule finds a changed file and passes an equal one.
- [ ] **Step 2:** Run; they fail.
- [ ] **Step 3:** Write the script, run it, commit what it wrote.
- [ ] **Step 4:** `npm test`, `npm run build`, `node tests/gallery/run.mjs` pass.
- [ ] **Step 5:** Commit.

### Task 12: CI and `develop`

**Files:**
- Modify: `.github/workflows/verify.yml` only if `npm run verify` does not already reach `npm run check` through Task 7's change

- [ ] **Step 1:** `npm test`, `npm run build`, `node tests/gallery/run.mjs`, `npm run check` pass on `canon`.
- [ ] **Step 2:** A fresh reviewer reads the whole branch against the spec (the `code-review` of the repository's habit); findings are fixed.
- [ ] **Step 3:** Merge `canon` into `develop` (fast-forward or a merge commit), delete `canon`, push `develop`.
- [ ] **Step 4:** `gh run watch` on the Verify run; a red job is read with `gh run view --log-failed` and fixed on a new short branch.
- [ ] **Step 5:** Note the commit of `develop` the apps will pin, in the first line of the next plan.
