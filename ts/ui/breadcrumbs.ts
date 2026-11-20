/** Parent buttons reveal their location. The final segment identifies the current item. */
export function breadcrumbs(doc: Document, label: string, segments: readonly { label: string; id: string }[], reveal: (id: string) => void) {
  const nav = doc.createElement('nav');
  nav.className = 'im-breadcrumbs';
  nav.setAttribute('aria-label', label);
  const list = doc.createElement('ol');
  for (const [index, segment] of segments.entries()) {
    const item = doc.createElement('li');
    const current = index === segments.length - 1;
    const name = current ? doc.createElement('span') : doc.createElement('button');
    if (name instanceof HTMLButtonElement) {
      name.type = 'button';
      name.onclick = () => reveal(segment.id);
    } else name.setAttribute('aria-current', 'location');
    name.textContent = name.title = segment.label;
    item.append(name);
    list.append(item);
  }
  nav.append(list);
  return nav;
}
