/**
 * Side-panel DOM primitives.
 *
 * Extracted verbatim from `side_panel.ts` so they can be unit-tested (the entry
 * module runs `chrome.*` at import scope and can't be loaded in jsdom) and
 * reused by the bubble builders. Behaviour is unchanged.
 */

/**
 * Create an element with attributes and children. Routes the `style` attribute
 * through the CSSOM (`element.style.cssText`) rather than `setAttribute('style')`:
 * on extension pages the CSP `style-src 'self'` blocks inline-style *attributes*
 * (`style-src-attr`), but the CSSOM path is exempt.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

/** Format a millisecond timestamp as a short local wall-clock time (e.g. "02:05 PM"). */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
