# Moving: the mark at the top left (task 13)

The title bar shows one brand in every app: the mark (`im-mark`), the initial of the product's name in capitals in the
square of the app's accent, and the name (`im-wordmark`) beside it. `titlebarHtml` writes both from `brand.name`, and
`imago-check` reports a brand that is not that markup (rule `brand-mark`). Each row is a name an app may still write,
with the name that replaces it or what to do instead.

| Old name | New name, or what to do instead |
|---|---|
| `brand.image` of `titlebarHtml` (`titlebarHtml({ brand: { name, image } })`) | `titlebarHtml({ brand: { name } })`: the title bar shows the mark and the name. The app's logo stays what Windows shows: the icons of its executables (`using-imago.md`, "The icons of the executables") |
| `im-brand-image` (an `img` in `im-brand`) | The mark and the name: `<span class="im-mark" aria-hidden="true">M</span><span class="im-wordmark">Muro</span>` in `im-brand`, as `titlebarHtml` writes them |
| A drawn symbol in `im-mark` (an `svg`, the gallery's `MARKS`) | The initial of the name in capitals as the text of `im-mark`: `<span class="im-mark" aria-hidden="true">X</span>`. The `svg` rule of `im-mark` is removed |
| Text other than one capital letter in `im-mark` (`d.`) | The initial in capitals, `D` |
| The name alone in `im-brand`, or an app's own mark in it (`<i class="brand-mark">`, an `svg` of its own) | `im-mark` with the initial, then `im-wordmark` with the name |
