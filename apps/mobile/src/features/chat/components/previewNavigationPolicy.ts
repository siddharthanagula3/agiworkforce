/**
 * Navigation policy for the artifact preview WebView.
 *
 * Kept in its own React-free module so the security predicate can be tested
 * without importing `react-native-webview`. A guard that is awkward to test is
 * a guard that does not get tested.
 */

/**
 * The mermaid bundle's origin.
 *
 * The TRAILING SLASH in the prefix below is the security boundary, and it was
 * missing. Written as `https://cdn.jsdelivr.net`, a plain `startsWith` also
 * accepts `https://cdn.jsdelivr.net.evil.com/payload.js` — an attacker
 * registers a domain whose name merely BEGINS with ours and the guard waves it
 * through. Mermaid artifacts are model-generated, so the string being matched
 * is attacker-influenced.
 *
 * `https://cdn.jsdelivr.net/` cannot be extended that way: the character after
 * the host must be `/`, which terminates the authority component.
 */
export const MERMAID_CDN_ORIGIN = 'https://cdn.jsdelivr.net';
const MERMAID_CDN_PREFIX = `${MERMAID_CDN_ORIGIN}/`;

/**
 * True only for the in-memory document the component itself supplied, plus —
 * for mermaid, which needs scripting — the pinned CDN.
 */
export function isAllowedPreviewNavigation(url: string, isMermaid: boolean): boolean {
  return (
    url === 'about:blank' ||
    url === 'about:srcdoc' ||
    url.startsWith('data:') ||
    (isMermaid && url.startsWith(MERMAID_CDN_PREFIX))
  );
}
