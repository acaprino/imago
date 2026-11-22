// A DOM just big enough for the renderers that build elements (setPanelState, stepList, stepProgress): elements, text,
// attributes in the order they are set, inline style, dataset, focus, a few selectors, and an outerHTML that serializes as
// a browser does. A test compares what those renderers build with what their string twins write. Not a test file itself.

type Child = StubElement | StubText;

const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'embed', 'track']);
const kebab = (name: string): string => name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
// What a browser escapes when it serializes: in text &, < and >; in an attribute the same and ".
const escapeText = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (text: string): string => escapeText(text).replace(/"/g, '&quot;');
const decode = (text: string): string => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name]!);

export class StubText {
  data: string;
  parentNode: StubElement | null = null;
  constructor(data: string) { this.data = data; }
  get textContent(): string { return this.data; }
  remove(): void { this.parentNode?.detach(this); }
}

export class StubDocument {
  activeElement: StubElement | null = null;
  body: StubElement;
  constructor() { this.body = new StubElement(this, 'body'); }
  createElement(tag: string): StubElement { return new StubElement(this, tag.toLowerCase()); }
}

/** One selector of the few the renderers use: `tag`, `.class`, `[name]` or `[name="value"]`. */
function matches(element: StubElement, selector: string): boolean {
  const attribute = /^\[([a-z-]+)(?:="([^"]*)")?\]$/.exec(selector);
  if (attribute) return attribute[2] === undefined ? element.hasAttribute(attribute[1]) : element.getAttribute(attribute[1]) === attribute[2];
  if (selector.startsWith('.')) return element.className.split(/\s+/).includes(selector.slice(1));
  const tagged = /^([a-z]+)((?:\[[^\]]+\])*)$/.exec(selector);
  if (!tagged) throw new Error(`dom-stub: unsupported selector ${selector}`);
  return element.localName === tagged[1] && [...tagged[2].matchAll(/\[[^\]]+\]/g)].every((part) => matches(element, part[0]));
}

export class StubElement {
  ownerDocument: StubDocument;
  localName: string;
  parentNode: StubElement | null = null;
  childNodes: Child[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, (() => void)[]>();
  onclick: (() => void) | null = null;
  style: Record<string, string>;
  dataset: Record<string, string>;

  constructor(doc: StubDocument, localName: string) {
    this.ownerDocument = doc;
    this.localName = localName;
    // Inline style: a list of declarations kept in the order they are set, written back to the style attribute as a browser does.
    const declarations = (): [string, string][] => (this.attrs.get('style') ?? '').split(';').map((part) => part.trim()).filter(Boolean)
      .map((part) => [part.slice(0, part.indexOf(':')).trim(), part.slice(part.indexOf(':') + 1).trim()] as [string, string]);
    const write =(key: string, value: unknown): void => {
      const list = declarations();
      const at = list.findIndex(([other]) => other === key);
      if (value === '') { if (at >= 0) list.splice(at, 1); }
      else if (at >= 0) list[at][1] = String(value);
      else list.push([key, String(value)]);
      this.attrs.set('style', list.map(([k, v]) => `${k}: ${v};`).join(' '));
    };
    this.style = new Proxy({} as Record<string, string>, {
      get: (_, name) => {
        if (typeof name !== 'string') return undefined;
        // `style.x = …` cannot write a custom property (`--im-x`) in a browser: `setProperty` does.
        if (name === 'setProperty') return (property: string, value: string): void => write(property, value);
        if (name === 'getPropertyValue') return (property: string): string => declarations().find(([key]) => key === property)?.[1] ?? '';
        return declarations().find(([key]) => key === kebab(name))?.[1] ?? '';
      },
      set: (_, name, value) => {
        write(kebab(String(name)), value);
        return true;
      },
    });
    this.dataset = new Proxy({} as Record<string, string>, {
      get: (_, name) => (typeof name === 'string' ? this.attrs.get('data-' + kebab(name)) : undefined),
      set: (_, name, value) => { this.attrs.set('data-' + kebab(String(name)), String(value)); return true; },
      deleteProperty: (_, name) => { this.attrs.delete('data-' + kebab(String(name))); return true; },
    });
  }

  getAttribute(name: string): string | null { return this.attrs.get(name) ?? null; }
  setAttribute(name: string, value: string): void { this.attrs.set(name, String(value)); }
  hasAttribute(name: string): boolean { return this.attrs.has(name); }
  removeAttribute(name: string): void { this.attrs.delete(name); }

  get className(): string { return this.attrs.get('class') ?? ''; }
  set className(value: string) { this.attrs.set('class', value); }
  get id(): string { return this.attrs.get('id') ?? ''; }
  set id(value: string) { this.attrs.set('id', value); }
  get type(): string { return this.attrs.get('type') ?? ''; }
  set type(value: string) { this.attrs.set('type', value); }
  get disabled(): boolean { return this.attrs.has('disabled'); }
  set disabled(value: boolean) { if (value) this.attrs.set('disabled', ''); else this.attrs.delete('disabled'); }
  get tabIndex(): number { return Number(this.attrs.get('tabindex') ?? -1); }
  set tabIndex(value: number) { this.attrs.set('tabindex', String(value)); }

  get children(): StubElement[] { return this.childNodes.filter((node): node is StubElement => node instanceof StubElement); }
  get firstElementChild(): StubElement | null { return this.children[0] ?? null; }
  get textContent(): string { return this.childNodes.map((node) => node.textContent).join(''); }
  set textContent(value: string) {
    for (const node of [...this.childNodes]) node.remove();
    if (value !== '') this.append(value);
  }

  detach(node: Child): void {
    this.childNodes.splice(this.childNodes.indexOf(node), 1);
    node.parentNode = null;
  }
  insert(nodes: (Child | string)[], at: number): void {
    const list = nodes.map((node) => (typeof node === 'string' ? new StubText(node) : node));
    for (const node of list) node.remove();
    this.childNodes.splice(at, 0, ...list);
    for (const node of list) node.parentNode = this;
  }
  append(...nodes: (Child | string)[]): void { this.insert(nodes, this.childNodes.length); }
  prepend(...nodes: (Child | string)[]): void { this.insert(nodes, 0); }
  remove(): void { this.parentNode?.detach(this); }
  contains(node: unknown): boolean {
    for (let at = node as Child | null; at; at = at.parentNode) if (at === this) return true;
    return false;
  }
  closest(selector: string): StubElement | null {
    for (let at: StubElement | null = this; at; at = at.parentNode) if (matches(at, selector)) return at;
    return null;
  }

  /** `:scope > X` looks at the children only; `X` at every descendant. */
  querySelectorAll(selector: string): StubElement[] {
    const direct = selector.startsWith(':scope > ');
    const simple = direct ? selector.slice(':scope > '.length) : selector;
    const found: StubElement[] = [];
    const walk = (parent: StubElement): void => {
      for (const child of parent.children) {
        if (matches(child, simple)) found.push(child);
        if (!direct) walk(child);
      }
    };
    walk(this);
    return found;
  }
  querySelector(selector: string): StubElement | null { return this.querySelectorAll(selector)[0] ?? null; }

  addEventListener(type: string, listener: () => void): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  click(): void {
    for (const listener of this.listeners.get('click') ?? []) listener();
    this.onclick?.();
  }
  focus(): void { this.ownerDocument.activeElement = this; }

  get outerHTML(): string {
    const attributes = [...this.attrs].map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('');
    return VOID.has(this.localName) ? `<${this.localName}${attributes}>` : `<${this.localName}${attributes}>${this.innerHTML}</${this.localName}>`;
  }
  get innerHTML(): string {
    return this.childNodes.map((node) => (node instanceof StubText ? escapeText(node.data) : node.outerHTML)).join('');
  }
  /** Parses the well-formed markup the string renderers write. */
  set innerHTML(html: string) {
    for (const node of [...this.childNodes]) node.remove();
    const open: StubElement[] = [this];
    for (const [, close, tag, attributes, text] of html.matchAll(/<\/([a-z0-9-]+)\s*>|<([a-z0-9-]+)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/gi)) {
      const parent = open[open.length - 1];
      if (text !== undefined) parent.append(decode(text));
      else if (close) {
        while (open.length > 1) if (open.pop()!.localName === close.toLowerCase()) break;
      } else {
        const element = this.ownerDocument.createElement(tag);
        for (const [, name, value] of attributes.matchAll(/([^\s=]+)(?:="([^"]*)")?/g)) element.setAttribute(name, decode(value ?? ''));
        parent.append(element);
        if (!VOID.has(element.localName)) open.push(element);
      }
    }
  }
}

/**
 * Installs the `getComputedStyle` the renderers call (an element is `display: none` when its inline style or `hidden`
 * says so) and returns the function that removes it.
 */
export function installComputedStyle(): () => void {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'getComputedStyle');
  Object.defineProperty(globalThis, 'getComputedStyle', {
    configurable: true,
    writable: true,
    value: (element: StubElement) => ({ display: element.hasAttribute('hidden') ? 'none' : element.style.display || 'block' }),
  });
  return () => {
    if (before) Object.defineProperty(globalThis, 'getComputedStyle', before);
    else Reflect.deleteProperty(globalThis, 'getComputedStyle');
  };
}
