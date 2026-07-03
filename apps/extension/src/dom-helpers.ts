/**
 * Minimal DOM helpers to eliminate innerHTML for static/numeric content.
 * All functions produce elements via the safe DOM API — no parser involved.
 *
 * This is the canonical, live implementation — imported by src/side_panel.ts
 * and src/features/side-panel/voice.ts. (A stale, less-hardened duplicate at
 * src/features/content/dom-helpers.ts existed with no importers and has been
 * removed; see docs/agent-context/known-flaws.md EXT-DUPLICATE-MODULE-FORKS-01.)
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

/**
 * Parse a static SVG string with `DOMParser` and append the root element to
 * `parent`. Use this in place of `parent.innerHTML = svgString` so the
 * HTML parser is never invoked.
 *
 * L-11 audit 2026-05-19: the SVG strings in this codebase are all static
 * literals (the AGI logo, the empty-state icon, Lucide icons in
 * `assets/icons.ts`). Switching to DOMParser is defense-in-depth — any
 * future refactor that accidentally passes attacker-controlled SVG
 * through gets a parser path that can't produce <script> execution.
 */
const _svgParser: DOMParser | null = typeof DOMParser !== 'undefined' ? new DOMParser() : null;

export function appendSvgString(parent: Element, svgString: string): void {
  if (!_svgParser) {
    return; // No DOMParser in this environment — skip rather than fall back to innerHTML.
  }
  try {
    const doc = _svgParser.parseFromString(svgString, 'image/svg+xml');
    const root = doc.documentElement;
    if (root.nodeName.toLowerCase() === 'svg') {
      parent.appendChild(document.importNode(root, true));
    }
  } catch {
    // Malformed SVG — render nothing rather than fall back to innerHTML.
  }
}
