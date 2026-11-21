# Moving: the React binding (`@acaprino/imago/react`)

The components write the package's canonical markup and nothing of their own. Each row is a name an app may still
write, with the name that replaces it or what to do instead.

| Old name | New name, or what to do instead |
|---|---|
| `DetailPanel` | Remove it. The details are the children of the inspector: give them to `Workbench` as `details`, with `detailsLabel` for the inspector's name. The inspector is `hidden` while `details` is empty |
| `Workbench` as a `main` (`im-workbench`) | `Workbench` writes `div.im-body`, the body of a shell: put it in `Shell`, or in any element with `im-shell`. The sidebar, the content region (`main.im-panel.im-content`, id `main`) and the inspector (`section.im-panel.im-inspector`) are its regions |
| `Workbench`, the attributes of its `main` | They go on the content region. Its `id` is `main` and its `tabIndex` is `-1` (the skip link's target), and `Workbench` does not take them |
| `Workbench`'s `navigation` in an `aside` (`im-navigation-panel`) | The sidebar, `section.im-panel.im-sidebar` with the id `sidebar`: a panel header with `navigationLabel` as its title, and the rows in `im-panel-body im-list`. `navigationLabel` is required with `navigation`; without `navigation` there is no sidebar, and `Shell` takes no `sidebar` |
| `Workbench`'s `details` required | `details` is optional, and `detailsLabel` (the inspector's accessible name) is required |
| `Workbench`'s `wide` | `inspector="wide"` on `Shell`, which writes `data-im-inspector="wide"`. `Workbench` accepts `wide` and ignores it: a component cannot reach the shell it is in |
| `Workbench` as the window | `Shell`: `div.im-shell` with `app` (`data-im-app`), `sidebar` (`data-im-sidebar="on"`, or `"off"`), `inspector`, `titlebar` and, with `skipLabel`, the skip link |
