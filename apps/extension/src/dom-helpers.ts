export function setText(el: Element, text: string): void {
  el.textContent = text;
}

export function clearChildren(el: Element): void {
  el.replaceChildren();
}

export interface CreateElementOptions {
  tag: string;
  className?: string;
  text?: string;
  id?: string;
  attrs?: Record<string, string>;
}

export function createElementWith(opts: CreateElementOptions): HTMLElement {
  const el = document.createElement(opts.tag);
  if (opts.className) el.className = opts.className;
  if (opts.id) el.id = opts.id;
  if (opts.text !== undefined) el.textContent = opts.text;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      const key = k.toLowerCase();
      if (key.startsWith('on')) continue;
      if (
        (key === 'href' || key === 'src' || key === 'xlink:href' || key === 'formaction') &&
        /^\s*(?:javascript|data|vbscript):/i.test(v)
      ) {
        continue;
      }
      el.setAttribute(k, v);
    }
  }
  return el;
}

export function setChild(parent: Element, opts: CreateElementOptions): void {
  parent.replaceChildren(createElementWith(opts));
}

const _svgParser: DOMParser | null = typeof DOMParser !== 'undefined' ? new DOMParser() : null;

export function appendSvgString(parent: Element, svgString: string): void {
  if (!_svgParser) {
    return;
  }
  try {
    const doc = _svgParser.parseFromString(svgString, 'image/svg+xml');
    const root = doc.documentElement;
    if (root.nodeName.toLowerCase() === 'svg') {
      parent.appendChild(document.importNode(root, true));
    }
  } catch {
    return;
  }
}
