/**
 * Minimal DOM helpers to eliminate innerHTML for static/numeric content.
 * All functions produce elements via the safe DOM API — no parser involved.
 */

/** Set textContent on an element (safe alternative to innerHTML = string). */
export function setText(el: Element, text: string): void {
  el.textContent = text;
}

/** Remove all children from an element (safe alternative to innerHTML = ''). */
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

/**
 * Create an element with optional className, textContent, id, and arbitrary attrs.
 * Safe replacement for innerHTML templates that produce a single element.
 */
export function createElementWith(opts: CreateElementOptions): HTMLElement {
  const el = document.createElement(opts.tag);
  if (opts.className) el.className = opts.className;
  if (opts.id) el.id = opts.id;
  if (opts.text !== undefined) el.textContent = opts.text;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      // SECURITY (audit batch-221 [HIGH] insecure output handling, fixed
      // 2026-06-13): defensively drop event-handler attributes (on*) and
      // javascript:/data:/vbscript: URL schemes on url-bearing attributes so a
      // caller cannot inject executable attributes through this helper. All
      // current callers pass only static presentational attrs.
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

/**
 * Replace element children with a single child built from opts.
 * Equivalent to: el.innerHTML = '<tag class="...">text</tag>'
 */
export function setChild(parent: Element, opts: CreateElementOptions): void {
  parent.replaceChildren(createElementWith(opts));
}
