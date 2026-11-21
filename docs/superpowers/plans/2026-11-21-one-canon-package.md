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
- Status tones are `ok`, `warn`, `err`, `info`. `accent` is allowed on a chip, a dot and a summary only (data in the app's colour, as the approved preview draws it); no other value. (Corrected on 2026-11-21: the first text removed `accent`.)
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
- `ChipTone` is `'' | Tone | 'accent'`. `chipHtml`, `actionChipHtml`, `statusButtonHtml` and `summaryHtml` take `ChipTone`; `noteHtml`, `statusTextHtml`, `settingsMessageHtml` and a notice take `Tone`. (Corrected on 2026-11-21.)
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
- `design-file.md` gains: where Settings live (the last view tab of the title bar, when an app has settings; they save themselves) and the five look and theme commands every app has through `mountApp` (Task 17); the mark and the icon of the executables; the categorical colour and the badge of a row (Task 16); the document table; "One frame" (what the removed frames were, in one line, for readers who meet them in an old app); the control table with native and ARIA forms; "Page patterns" with every class of Task 10; the type and categorical tokens; "Selected" by any of the four attributes; `mountApp`; "What a program checks" with the rule ids of `imago-check`; "What a person checks" (wording of destructive buttons, one primary action, Undo bound, the real window); the React exception.
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

### Task 15: `imago-check` sees what the five app plans showed it misses (independent; any time)

The planners of the five apps ran the check on a copy of each app and listed what it let through. Source of each item: the ledger's entries F6, F7, F8, F10, F11, F20, and the minors parked by the reviews of Tasks 2 and 14.

**Files:**
- Modify: `scripts/check/cli.mjs`, `scripts/check/rules.mjs`, `scripts/check/css.mjs`, `scripts/check/source.mjs`, `scripts/check/names.mjs`, `scripts/check/allowed.mjs`, `scripts/icons.mjs`
- Create: `scripts/check/removed.mjs` (the names the canon removed, each with what replaces it), `scripts/check/values.mjs` (the attributes that take a closed set of values)
- Test: `tests/check.test.ts`, `tests/icons.test.ts`

**Interfaces:**
- New rules, app mode:
  - `removed-name`: a name of `scripts/check/removed.mjs` (a class with or without the `im-` prefix, a `data-im-` attribute, a `--im-` custom property, an export of the package) anywhere in the app's CSS, markup or script, tests included. The message gives the replacement. The file starts with the rows of `docs/superpowers/moving-from-0.1.4.md` and `docs/superpowers/moving/*.md` as they are on the branch, as `export const REMOVED = [{ old, kind, now }]`; a test asserts every "old" name of those tables is in it.
  - `unknown-value`: a value outside the set, for the attributes of `scripts/check/values.mjs`: `data-im-tone` (`ok`, `warn`, `err`, `info`, `accent`), `data-im-look` (`smooth`, `oni`), `data-im-theme` (`dark`, `light`), `data-im-app` (the five ids), `data-im-sidebar` (`on`, `off`), `data-im-inspector` (`wide`), `data-im-surface` (`ground`, `sheet`, `dense`, `float`), `data-im-step` (`done`, `now`, `todo`). A value built at run time (a template with a substitution) is not judged.
  - `own-keydown`: `addEventListener('keydown' | 'keyup' | 'keypress', …)` on `document`, `window` or `document.body`, and `onkeydown =` on them. An app's widget that runs its own keys (a terminal) carries the exception comment.
  - `literal-case`: `text-transform` other than `none` or `var(--im-case)`, and `letter-spacing` other than `0`, `normal` or `var(--im-track)`, in the app's CSS and in style written from script.
- Changed rules:
  - `media-width` also reports `matchMedia(` whose query holds `width`, in script.
  - `literal-font-size`, `literal-space` and `literal-color` resolve the app's own custom properties where they are used: `font-size: var(--x)` is judged by the value the app's CSS gives `--x` (through as many `var()` steps as it takes; a property the app never defines is not judged). The finding is on the line that uses it and names the line that defines it.
  - `literal-color` in script judges style-shaped places only: a `style` attribute, a `.style.x =` assignment, `setProperty`, `cssText`, the values of a React `style={{ … }}` object, and a `<meta name="theme-color">`. A string such as `'Issue #123'` or `location.hash = '#bad'` is not a finding. Colour words are judged only in properties that take a colour.
  - `literal-space`, `literal-font-size` and `cursor-pointer` also read a React `style={{ … }}` object.
  - `mount-app` requires that the entry or a file it imports imports `mountApp` from `@acaprino/imago/ui` and calls that binding; an app's own function of the same name does not pass.
  - `agent-rules`: the path written in each agent file, resolved against the folder of that file and against the root, must exist. The `"imago"` block gains `"package"` (where the package is installed, default `node_modules/@acaprino/imago`), used here and wherever the installed package is read.
  - `app`: validated against the list of folders of the package's `icons/`, exactly (no `..`, no other case).
- The scanner: a custom property whose value holds `{ … }` no longer breaks the rules after it; a declaration without a final `;` ends on its own last line.
- Errors: an entry whose `stat` or read fails is skipped with a note; any other system error is one line on stderr and exit 2, never a stack and never exit 1.
- `scripts/check/allowed.mjs` is the one place for what is allowed: `rules.mjs` holds no list of its own.
- `scripts/icons.mjs`: `--check` also verifies, without drawing, that each PNG's header gives the size of its name and that each `.ico` equals the container built from the folder's PNGs; an unknown argument is exit 2; drawing refuses, with a message, off Windows or when the font `Segoe UI Variable Display` is not found. `tests/icons.test.ts`: the centring tolerance is 1.5%.
- Revert the stray whitespace change at `scripts/check/rules.mjs` (`const EXCEPTION =/…` back to `= /…`).

- [ ] **Step 1:** Tests: each new and changed rule with one string that must be found and one that must not, taken from what the planners saw: `--fs-md: 13.5px` then `font-size: var(--fs-md)`; `wm-drop-preview` in a test file; `data-im-tone="good"`; an app's own `function mountApp()`; `document.addEventListener('keydown', …)`; `matchMedia('(max-width: 899px)')`; `text-transform: uppercase`; `'Issue #123 closed'`; `animation: red 1s`; `style={{ padding: '12px' }}`; a dangling symlink in `src`; an agent file whose path does not exist; `"app": ".."`.
- [ ] **Step 2:** Run; they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` and `npm run build` pass; `node scripts/check/cli.mjs --package` still runs and its count of findings is reported.
- [ ] **Step 5:** Commit.

### Task 16: The frame and the rows hold what the apps need (after Tasks 4, 5 and 13 are merged)

Source: the ledger's entries F1, F2, F3, F4, F13, F14, F19, F21, F22, and the minors parked by the reviews of Tasks 3 and 9.

**Files:**
- Modify: `css/primitives.css`, `css/content.css`, `css/controls.css`, `ts/ui/shell-markup.ts`, `ts/ui/shell-frame.ts`, `ts/ui/inspector.ts`, `react/index.js`, `react/index.d.ts`, `gallery/apps.ts`, `tokens/imago.tokens.json`, `docs/superpowers/moving/task-16.md`
- Test: `tests/shell-markup.test.ts`, `tests/react.test.ts`, `tests/tokens.test.ts`, `tests/gallery/layout.mjs`, `tests/gallery/controls.mjs`, `tests/gallery/workspace-integration.mjs`

**Interfaces:**
- A shell fills the window wherever it is mounted: `html` and `body` take the window's height when they hold an `im-shell` at any depth, and a wrapper between `body` and the shell carries `im-root` (`block-size: 100%`). The React `Shell` is documented as mounted in a root that carries `im-root`. Test: a shell inside `<div id="app" class="im-root">` is as tall as the viewport and its content region is not 0 pixels tall.
- Page content is content: text inside `im-page-content` can be selected; the controls in it (buttons, tabs, the chrome of rows) cannot, as everywhere. Test with `getComputedStyle(…).userSelect` on a paragraph, a `code`, a button.
- A categorical colour: `data-im-cat="1"` … `"8"` on an `im-row`, an `im-rail-item`, an `im-avatar`, an `im-dot` or an `im-chip` sets `--im-item-color` to `--im-cat-n`. A row draws it as a 3px mark at its start edge; an avatar, a rail item and a dot take it as their fill, with `--im-cat-on` for text; a chip takes it as its tone. The mark is beside, never instead of, the selection mark. Contrast 4.5:1 in both looks, both themes, on a row at rest, hovered and selected.
- A badge: `data-im-badge` on a row shows a dot at the corner of its `im-rail-item` in the rail and at the row's end otherwise; its tone is the row's `data-im-tone` (default `warn`). The row's accessible name must say what the badge says: the test asserts the gallery's badged row has it in its text.
- A row whose control is a check shows the check in the rail: `im-check im-rail-item` is ticked there as in the full sidebar.
- `sidebarHtml` gains `count?: number` (an `im-count` in the header) and `footHtml?: string` (an `im-panel-foot` under the list), both repainted by `renderShellFrame`.
- `inspector(shell).open(content, opener?)`: `content` may be one element or a fragment whose children are an `im-panel-header`, an `im-panel-body` and an `im-panel-foot`; the inspector lays them out as a panel. Documented in the function's comment and tested with both shapes.
- React: `Workbench` gains `status`, `actions` and `footer` (the children of `im-status`, `im-actions` and `im-footer`), and `contentId` and `sidebarId` (defaults `main` and `sidebar`); `skipLabel` on `Shell` and `aria-label` on `Workbench` are required in the types. `ListAction` gains `tooltip` (the HTML `title`) and `rail` (the children of a `span.im-rail-item`). A test compares the exported names of `react/index.js` with those `react/index.d.ts` declares.
- `renderShellFrame`: a kept control or region that held focus holds it after the repaint; the sidebar's list keeps its scroll; the fold button's `aria-expanded` follows the shell's state as its label does. The comment of `takeAttributes` says an attribute the markup drops is not removed.
- `--im-w-inspector-wide: 360px` is a token (in `tokens/imago.tokens.json`), used by `data-im-inspector="wide"`.

- [ ] **Step 1:** Tests for each line above.
- [ ] **Step 2:** Run; they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npm run build`, `node tests/gallery/run.mjs` pass.
- [ ] **Step 5:** Commit.

### Task 17: The same keys, look, theme and tooltips in every app (after Task 8 is merged; in parallel with Task 16)

Source: the ledger's entries F9, F12, F15, F16, F18, and the minors parked by the review of Task 8.

**Files:**
- Modify: `ts/ui/app.ts`, `ts/ui/commands.ts`, `ts/ui/layers.ts`, `ts/ui/inspector.ts` (only its Escape handling), `ts/ui/shell-markup.ts` (`windowButtonsHtml`), `ts/ui/form-markup.ts` (`formHeaderHtml`), `gallery/apps.ts`, `gallery/mount/surfaces.ts`, `gallery/main.ts`, `docs/superpowers/moving/task-17.md`
- Test: `tests/app.test.ts`, `tests/commands.test.ts`, `tests/layers.test.ts`, `tests/shell-markup.test.ts`, `tests/form-markup.test.ts`, `tests/gallery/keys.mjs`, `tests/gallery/surfaces.mjs`

**Interfaces:**
- A key is answered once. A handler of the package that acts on a key (Escape that closes a surface, the inspector or the sidebar drawer) calls `preventDefault()`; `registry.attach` does not run a command for an event whose default is already prevented. `mountApp` attaches the layers before the registry, so the order holds. Test: with the inspector open and a command bound to Escape, one Escape closes the inspector and the command does not run; a second Escape runs it.
- The look and the theme, alike in every app:
  ```ts
  export const LOOK_SMOOTH = 'imago.look.smooth'; export const LOOK_ONI = 'imago.look.oni';
  export const THEME_SYSTEM = 'imago.theme.system'; export const THEME_LIGHT = 'imago.theme.light'; export const THEME_DARK = 'imago.theme.dark';
  export interface AppearanceOptions {
    get: () => { look: 'smooth' | 'oni'; theme: 'system' | 'light' | 'dark' };
    set: (next: { look: 'smooth' | 'oni'; theme: 'system' | 'light' | 'dark' }) => void;
    labels?: Partial<Record<'smooth' | 'oni' | 'system' | 'light' | 'dark' | 'group', string>>;
  }
  // AppOptions gains: appearance?: AppearanceOptions
  ```
  With `appearance`, `mountApp` registers the five commands in the group `labels.group` (default `Appearance`; default titles `Smooth look`, `ONI look`, `Follow Windows`, `Light theme`, `Dark theme`); each calls `set` with the other half of `get()` unchanged. The command of the current choice is not available (`when`). The app keeps the choice and calls `applyLook`; the package stores nothing. No key is bound.
- `footerKeys(doc, registry, entries)`: an entry is a command id or `{ keys: string; title: string }`, for the keys of a list that are not commands (arrows, Space, Enter).
- `windowButtonsHtml` writes `title` on each button (`Minimize`, `Maximize`, `Close` by default, beside the accessible names it has; the labels object gains the three titles); `formHeaderHtml` takes the close button's label and writes it as `aria-label` and `title`.
- `mountApp`'s errors start with `mountApp: ` and, when the cause is a key or an id the app registered itself, say which.
- The gallery: the title bar's command button runs the registered command (`registry.get(PALETTE_COMMAND)`), one footer is written by `footerKeys` from the registry, each fixture passes `appearance` and the gallery's own look and theme controls call the same `set`; the Xiox fixture's tabs are the three Xiox has today (read `git -C D:/Projects/xiox show develop:apps/desktop/index.html`, the element `#sections`; read-only).
- `tests/app.test.ts`: the `openLayer` helper's default `close` no longer refers to a body binding; the palette test closes its layer in a `finally`.

- [ ] **Step 1:** Tests for each line above.
- [ ] **Step 2:** Run; they fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npm run build`, `node tests/gallery/run.mjs` pass.
- [ ] **Step 5:** Commit.

### Task 18: The crate does the three things Xiox's window code does and it did not (independent; Rust, proved only by CI)

The owner asked for them on 2026-11-21 ("Sì certo"), after being told they are changes to the Rust of the package that only GitHub can verify. Source: the Xiox plan's "Open points for the package" and Xiox's `develop` (`apps/desktop/src-tauri/src/desktop.rs` and `chrome.rs`, read with `git -C D:/Projects/xiox show develop:<path>`; read-only).

**Files:**
- Modify: `crates/imago-shell/src/guard.rs` (the context menu), `crates/imago-shell/src/theme.rs` (the tint), `crates/imago-shell/src/recovery.rs` (closing), `crates/imago-shell/src/lib.rs` (re-exports and the crate's own tests of them), `examples/demo/src-tauri/src/main.rs` (the wiring, as an app would do it), `docs/desktop-shell.md` (sections 1, 3 and 4), `docs/verification.md` ("Not run on a real window"), `docs/using-imago.md` only if it lists the crate's items
- Test: the `#[cfg(test)]` modules of the three source files; `tests/docs.test.ts` already requires every item the crate re-exports to be named in the documents

**Interfaces:**
- The context menu. A pure function, testable without a window, decides which entries of a WebView2 context menu stay: the editing commands, in a field or on selected text (take Xiox's list and its rule for separators as they are in `desktop.rs:90-114`, with its unit test `the_context_menu_keeps_editing_only`); when nothing is left no menu is shown. A public function installs it on a webview (`ICoreWebView2_11::add_ContextMenuRequested`, as Xiox's `desktop.rs:352-378`), named in the style of `guard_navigation` and `disable_browser_accelerators`, and the demo calls it where it calls those. The page's `guardDesktop` keeps doing what it does; the documents say which of the two does what.
- The tint. A pure function gives the acrylic tint (RGBA) for a look and a resolved theme, and the function of the crate that gives the window its theme applies the tint with it, so a window on Windows 10, where the acrylic takes its colour from the tint and not from the system backdrop, is light under a light look and dark under a dark one. The four values are the grounds of the looks under glass, the ones `docs/desktop-shell.md` section 1.3 and `tokens/imago.tokens.json` (`glass` extension of each ground) already give: do not invent a value, and write in the code where each comes from. On Windows 11 22H2 and later nothing may change: read `theme.rs` and section 1 of the document first, keep the rule "the window theme follows the look, set before the first frame", and say in the function's comment why the tint is harmless there. A unit test pins the four values against the document's.
- Closing. WebView2 reports its processes as failed while the application closes; that is not a failure to recover from. `Recovery` learns that the application is closing (a method the app calls when its exit begins, or what `desktop.rs:38-47` and `:165` do, whichever fits the crate's `Recovery` per window better) and from then on answers every failure with no action: no reload, no rebuild, no question. A unit test: a browser-process exit before closing asks for a rebuild, the same after closing asks for nothing. Section 4 of `docs/desktop-shell.md` says it, and the rebuilding contract's text (prevent the exit, do not save the window's state while rebuilding) stays true.
- `docs/verification.md` gains three lines under "Not run on a real window": the trimmed context menu, the tint on Windows 10 (no machine of the suite runs it), failures ignored while closing.

**How this task is proved.** Rust is never compiled, formatted or linted on this machine. Write as `rustfmt` would format and as `clippy -D warnings` would accept (the crate's existing files are the model: imports, `unsafe` blocks with their `// SAFETY:` comments, error handling); every `unsafe` call copies the pattern of an existing call in the crate or in Xiox's file. The Verify workflow (`cargo fmt --all --check`, `cargo clippy -p imago-shell --all-targets -- -D warnings`, `cargo test -p imago-shell`) runs when the branch reaches GitHub; the controller reads the run and sends back what fails. The crate pins `tauri = "=2.12.5"`, `webview2-com = "=0.39.1"`, `windows-core = "=0.62.2"`: use only items those versions have (Xiox's `Cargo.lock` on `develop` resolves the same ones, so an item Xiox's file uses exists).

- [ ] **Step 1:** Write the three pure functions' unit tests first, in the files' test modules.
- [ ] **Step 2:** Implement; wire the demo; write the documents.
- [ ] **Step 3:** `npm test` passes (the document tests: every re-exported item is named, every Rust name written as `name(` exists). `npm run build` passes. Do NOT run cargo, rustfmt, clippy or any script that calls them.
- [ ] **Step 4:** Read your own Rust once more against the compiler: every import used, every type in scope, every `?` in a function that returns `Result`, every `match` exhaustive, no unused variable.
- [ ] **Step 5:** Commit.

### Task 12: CI and `develop`

**Files:**
- Modify: `.github/workflows/verify.yml` only if `npm run verify` does not already reach `npm run check` through Task 7's change

- [ ] **Step 1:** `npm test`, `npm run build`, `node tests/gallery/run.mjs`, `npm run check` pass on `canon`.
- [ ] **Step 2:** A fresh reviewer reads the whole branch against the spec (the `code-review` of the repository's habit); findings are fixed.
- [ ] **Step 3:** Merge `canon` into `develop` (fast-forward or a merge commit), delete `canon`, push `develop`.
- [ ] **Step 4:** `gh run watch` on the Verify run; a red job is read with `gh run view --log-failed` and fixed on a new short branch.
- [ ] **Step 5:** Note the commit of `develop` the apps will pin, in the first line of the next plan.
