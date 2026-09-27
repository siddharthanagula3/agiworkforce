# Chrome Web Store release blockers

Lifted on 2026-09-27 from "Release blockers and required evidence" in `apps/extension/docs/chrome-web-store-publish-runbook.md`, whose release steps now point here. `audit/prior-audits/chrome-extension-public-release-audit.md` holds the wider audit of the same surface. Delete this file when a tagged ZIP has passed every row below and the extension is public.

A candidate is not release-ready until every item below has current evidence for
the exact tagged ZIP. Source review, unit tests, or an unpacked development build
do not substitute for these checks.

- **Stable identity:** `CHROME_EXTENSION_PUBLIC_KEY` must be the Store item's
  single-line base64 DER public key. The packaged manifest-derived extension ID,
  `CWS_EXTENSION_ID`, the public listing item, and Clerk's allowed
  `chrome-extension://<id>` origin must all match. Without this value the exact
  Store ZIP and its production authentication origin cannot be proven.
- **Production authentication and subscription:** use a clean Chrome profile to
  verify signed-out, successful Clerk sign-in, entitled Managed Cloud chat,
  exhausted/inactive-plan recovery, Manage usage/upgrade navigation, sign-out,
  and return sign-in. Development bearer-token fallback is not release evidence.
- **Conversation persistence truth:** with the same live account on Chrome, Web,
  Mobile Cloud, Tauri Cloud, and Electron Cloud, verify that an all-Managed-Cloud
  conversation mirrors append-only, survives reload, and propagates deletion.
  Verify separately that any Local, BYOK, or unknown-provenance turn permanently
  prevents cloud persistence while `chrome.storage.local` remains authoritative.
- **Browser-control boundary:** on an approved ordinary HTTPS site, verify the
  default Ask-before-acting gate, Allow, Skip, 30-second expiry, Stop, tab close,
  navigation, debugger detach, recording/replay origin binding, and typed-value
  capture acknowledgement. Repeat native-host pairing plus missing/disconnected
  host recovery; Chrome-internal pages and the Web Store must fail closed.
- **Responsive and accessible UI:** check side-panel widths 320, 390, and 500 px
  and Options at narrow/tablet/desktop widths in light and dark modes, 200% zoom,
  reduced motion, keyboard-only navigation, visible focus, menu/dialog focus
  return, screen-reader names/status announcements, long content, and empty,
  loading, error, disabled, and success states. Confirm Chrome's user-rebound
  command values, not only manifest defaults, are shown in Options.
- **Permissions and privacy:** manually compare every packaged permission, host,
  approved-site capture disclosure, debugger use, native messaging boundary,
  Managed Cloud endpoint, local storage record, and deletion behavior with
  `manifest.json`, `docs/threat-model.md`, the Store Privacy tab, and listing copy.

Record the Chrome version, OS, account/plan state, tagged commit, ZIP SHA-256,
Store item ID, and pass/fail evidence. A failure must be fixed and the entire
affected row repeated on the newly packaged artifact.
