# Manifest design & threat-model notes

These notes previously lived as `_`-prefixed keys inside `manifest.json`. Chrome flags
every unrecognized manifest key as an error, which surfaced a red **Errors** badge on the
extension card (and draws Chrome Web Store review scrutiny). The notes are kept here instead;
`manifest.json` now contains only standard keys.

## `debugger` permission

Added for the CDP-based computer-use agent (Day-1 foundation). `chrome.debugger` is required
to call `Page.captureScreenshot`, `Input.dispatchMouseEvent`, `Input.insertText`, and
`Page.navigate` via the Chrome DevTools Protocol — the content-script executor cannot reliably
implement these at demo quality.

Scope: the `cdpDriver` attaches only to tabs that pass the existing
`GATEWAY_URL_ALLOWLIST_EXACT` / site-allowlist policy gate and detaches on completion or error.

Threat-model impact: adds the ability to attach to and instrument any tab the user has open;
mitigated by (a) requiring the tab to be on an approved origin before the agent loop runs,
(b) the debugger detaching on every code path, and (c) the feature being reachable only from
the service worker under explicit user invocation. Update `THREAT_MODEL.md` accordingly before
Chrome Web Store submission.

## `host_permissions` (localhost only)

Broad `localhost/*` is intentional: the bridge port is user-configurable via
`chrome.storage.local` `agi_bridge_url` (default 8787, matches the VS Code extension and the
desktop bridge). Restricting to a fixed port would break configurability. Runtime enforcement:
`validateBridgeUrl()` in `background.ts` rejects any non-local URL.

## `content_security_policy`

M-08 FULL (audit 2026-05-19). `style-src 'unsafe-inline'` was DROPPED. `popup.html` and
`side_panel.html` now load styles via `<link rel="stylesheet">` (`popup.css`, `side_panel.css`).
`side_panel.ts:injectStyles` uses Constructable Stylesheets
(`new CSSStyleSheet().replaceSync()` + `document.adoptedStyleSheets`), which is a DOM API, not
CSS-source delivery, so it bypasses `style-src`. Combined hardening: `default-src 'self'` caps to
the extension origin; `img-src` adds `data:` for attachment previews; `connect-src` enumerates
the local bridge + AGI web/API origins only; `base-uri 'self'` blocks `<base>` hijack;
`form-action 'self'` blocks form submission to attacker origins; `frame-ancestors 'none'` blocks
clickjacking. Content scripts on web pages are governed by the page's CSP, not this one, so the
shadow-DOM `<style>` elements in `content.ts` are unaffected.
