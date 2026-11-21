# HTML composition

Imago supports applications that compose HTML strings as well as applications
that mount controls through DOM APIs. Import the renderers from
`@acaprino/imago/ui`; their markup and appearance belong to Imago.

```ts
import { buttonHtml, pageHeadingHtml, textFieldHtml } from '@acaprino/imago/ui';

const heading = pageHeadingHtml('Library', 'Your saved items',
  buttonHtml('Add item', 'add-item', { primary: true, icon: 'plus' }));
const name = textFieldHtml('Name', 'name', item.name, {
  id: 'item-name', required: true, hint: 'Shown in the list',
});
```

Text, action identifiers and attribute values are escaped. Only parameters whose
names end in `Html` accept trusted component output. Do not pass user content
into those slots: pass it as a text parameter or escape it with `escapeHtml`.
Extension `attrs` accept data/ARIA and common native control attributes, reject
event handlers, and cannot override structural attributes such as a button's
action. These renderers do not parse or execute HTML.

The shared renderers include `iconHtml`, `avatarHtml`, `initialsAvatarHtml`,
`chipHtml`, `buttonHtml`, `iconButtonHtml`, `pageHeadingHtml`, `emptyStateHtml`, `switchHtml`,
`segmentedHtml` and `textFieldHtml`; `spinnerHtml` is a decorative fragment.
Icons and avatars are decorative by default. Give a standalone icon a text label
with the second `iconHtml` argument. Switches expose their checked state;
segmented choices use native radio inputs. Text fields preserve native validation,
provide linked hints and live error slots, and use a real `required` attribute.
Use a distinct field `id` for repeated names. An application may opt into its own
validation presentation with a native form's `novalidate` attribute.

Applications own the labels, action handlers, field values and screen composition.
Imago owns the rendered controls. A domain-specific initial such as a provider's
abbreviation is data passed to `avatarHtml`, not a new avatar component.

## Repainting content

`captureDomState(root, { scroll: ['#main', '[data-im-scroll]'] })` captures focused
control identity and selection, expanded and collapsed details, and the scroll
offset of each matching region. Call `restoreDomState` after replacing the
content. An explicit `data-im-key` or `id` is the strongest identity; otherwise
controls are identified by their action or name and, for radios and checkboxes,
their value. Ensure those identities are unique in the captured root.

Keep the shell and modal boundary stable when repainting. Restoring DOM state
does not preserve form values: those belong to the application's state or to a
form whose element is retained. `captureFocus`, `focusKey` and `restoreFocus`
are also available separately when an application must retain a pending focus
target during a request. Disabled, hidden and inert targets are skipped; a
caller may supply a focusable `fallback`. Selection is restored only to the
matched text control, never to that fallback.

`replaceHtmlRegion(region, html, { fallbackFocus })` performs capture, replacement
and restoration for a single region. The trusted fragment must have one root
element. It restores focus only when focus was originally inside that region,
and uses the optional fallback only if the former control disappeared. An
unrelated input being edited elsewhere keeps its focus and selection.
