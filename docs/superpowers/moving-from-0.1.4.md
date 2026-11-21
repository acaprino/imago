# Moving from 0.1.4

Version 0.1.4 had more than one way to do several things: four window frames, several drawings of one control, more
than one message, loading and empty state. The next version keeps one of each, the one `docs/design-file.md` names, and
removes the others; a removed name is not kept as an alias. Each row below is a name an app may still write, with the
name that replaces it or what to do instead. An app moves when it pins the new version: search its markup, its
TypeScript and its CSS for the names in the first column.

| Old name | New name, or what to do instead |
|---|---|
| `im-app-layout` | Remove it. The window is `im-shell` with its seven regions; a shell placed directly in `<body>` fills the window, and the document defaults it gave (no margins on headings, paragraphs, lists and fieldsets, no bullets, `[hidden]`) apply in every `im-shell` |
| `im-main` | The content region, `main.im-panel.im-content`, whose `im-panel-body` scrolls; `shellFrameHtml` writes it. The padding went to `im-page-content` |
| `im-desktop-frame` | `im-shell` |
| `im-desktop-content` | `im-work`: the status row, the columns, the action bar and the footer |
| `im-page` | Remove it: a page sits in the content region of `im-shell`, and its headings are the shell's (h1 18, h2 14, h3 13) |
| `im-skip-link` | `im-shell-skip-link`, which `shellFrameHtml` writes first |
| `im-page-frame` | `im-shell` |
| `im-page-view` | `im-content` |
| `im-work-column` | `im-content`: a panel, with `im-panel-header` above `im-panel-body` |
| `im-workbench` | The shell's `im-sidebar`, `im-content` and `im-inspector` |
| `im-work-area` | `im-columns` |
| `im-workspace-area` | `im-content` |
| `im-navigation-panel` | `im-sidebar`, from `sidebarHtml` |
| `im-resizable-nav` | `im-sidebar`, made resizable by `sidebarResize` |
| `--im-nav-width` | `--im-w-sidebar`, which `sidebarResize` sets on the shell |
| `data-im-compact` on `im-resizable-nav` | The rail: `sidebarCollapse` folds the sidebar and sets `data-im-sidebar-collapsed` on the shell |
| `im-nav-rail` | The sidebar's rail: every row carries an `im-rail-item` (its icon, or an `im-avatar` with its initials) |
| `im-nav-entry` | `im-row` with `role="option"` in the sidebar's `im-list`; the current one has `aria-selected="true"` |
| `im-nav-line` | `im-row`, with `im-row-text` (`im-row-title`, `im-row-sub`) and `im-row-meta`; the row's other actions go in a menu (`openMenu`) or in the inspector |
| `im-nav-mark` | `im-dot` in the row, coloured with a categorical colour (`background: var(--im-cat-1)` to `var(--im-cat-8)`); a mark that turns on and off is an `im-check` |
| `im-nav-detail` | `im-row-sub`, the row's second line; more goes in the inspector |
| `im-signal` | `im-dot` with `data-im-tone`, and the word for the state beside it |
| `data-im-badge` | `im-count` in the row for a number, or `im-dot` with `data-im-tone` and a word in `im-row-sub` |
| `--im-item-color`, `--im-item-ink` | The categorical colours `--im-cat-1` to `--im-cat-8`, and `--im-cat-on` for text on them |
| `im-docked-inspector` | `im-inspector` (`inspector(shell)`): docked from 1000 up, a drawer under it. `data-im-inspector="wide"` on the shell makes it 360 |
| `--im-inspector-size` | `--im-w-inspector` (300), or `data-im-inspector="wide"` on the shell (360) |
| `im-inspection-rail` | `im-inspector` |
| `im-detail-panel` | `im-inspector` |
| `im-document` | `im-page-content` |
| `im-toolbar` | `im-content-toolbar` |
| `im-panel-strip` | `im-content-toolbar`; at the head of a panel, `im-panel-tools` |
| `im-master-detail` | Remove it: the detail is the inspector |
| `shellFrameHtml({ mainHtml })` | `contentHtml`, with `contentLabel` (the content region's name) and `inspectorLabel`; `sidebarHtml`, `statusHtml`, `actionsHtml` and `footerHtml` add the other regions |
| `shellFrameHtml({ mainId })` | `contentId` |
| `uiPart('main')` gave `main.im-main` | It gives a `main` with no class: the frame owns the content region |

None of the parts of a sidebar row of 0.1.4 keeps its name: each has a part of `im-row` that does its job. `im-aside-layout`
stays: it is a column of controls beside content, inside the content region. The breakpoints of what stays follow the
shell (`@container im-shell` at 1000, 850 and 620), not the screen.
