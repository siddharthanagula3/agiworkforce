/**
 * The theme bootstrap, inlined as the first child of <body> so it runs before
 * page content is parsed and before first paint.
 *
 * It must not be fetched. Loading it as an external file, which is what
 * `next/script src="/theme-init.js"` did, costs a network round-trip the
 * browser will not wait for, so the first paint uses the wrong theme and the
 * page visibly flips once the file lands. `async` made that certain rather
 * than merely likely.
 *
 * It also must not go through `next/script` at all. `strategy="beforeInteractive"`
 * hoists the tag into <head> during SSR, where it collided with the JSON-LD
 * block already rendered there; React then reconciled the two <script> elements
 * against each other and the whole tree failed hydration. The root layout
 * deliberately leaves <head> to the App Router and places this inline script
 * first in <body>.
 *
 * `public/theme-init.js` stays the published artifact, /cookies cites that path
 * as the source of the only pre-consent storage read, and the behaviour tests
 * execute that file. `theme-init-script.test.ts` asserts this constant and that
 * file are byte-identical, so the disclosure can never drift from what ships.
 */
export const THEME_INIT_SCRIPT = `/* global document, localStorage, window */

(() => {
  const root = document.documentElement;
  let selected = 'system';

  try {
    selected = localStorage.getItem('theme') || selected;
  } catch {
    // Storage can be unavailable in hardened or private browsing contexts.
  }

  const resolved =
    selected === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : selected;
  const theme = resolved === 'light' ? 'light' : 'dark';

  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;

  const host = window.agiHost;
  if (host && typeof host.platform === 'string') {
    root.setAttribute('data-desktop-host', host.platform);
  }
})();
`;
