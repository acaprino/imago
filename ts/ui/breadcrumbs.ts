/** Parent buttons reveal their location. The final segment identifies the current item. */
export function breadcrumbs(doc: Document, label: string, segments: readonly { label: string; id: string }[], reveal: (id: string) => void) {
  const nav = doc.createElement('nav');
  nav.className = 'im-breadcrumbs';
  nav.setAttribute('aria-label', label);
  const list = doc.createElement('ol');
  for (const [index, segment] of segments.entries()) {
    const item = doc.createElement('li');
    const current = index === segments.length - 1;
    let name: HTMLElement;
    if (current) {
      name = doc.createElement('span');
      name.setAttribute('aria-current', 'location');
    } else {
      const button = doc.createElement('button');
      button.type = 'button';
      button.onclick = () => reveal(segment.id);
      name = button;
    }
    name.textContent = name.title = segment.label;
    item.append(name);
    list.append(item);
  }
  nav.append(list);
  return nav;
}
