# Audit remediation — apps/extension (Chrome extension) — 2026-06-13

Scope: ONLY `apps/extension/` (Chrome). Other surfaces handled by other agents.
Source batches scanned for extension files: 038, 058, 219–223, 278–280, 325.
Method: each finding fact-checked against **current** code before action (many had drifted/resolved since the 2026-06-11 audit). Verified after fixes: `typecheck EXIT=0`, `41 files / 886 tests pass`, `check:no-hex clean`.

## FIXED (code changed + verified green)

| #   | Sev  | Finding                                                                           | File                                              | Fix                                                                                            |
| --- | ---- | --------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 220 | HIGH | Autofill profile (PII) persisted to `chrome.storage.sync` (off-device)            | `src/features/content/autofill/filler.ts`         | `loadAutofillProfile`/`saveAutofillProfile` switched to `chrome.storage.local` (device-scoped) |
| 221 | HIGH | `createElementWith` set arbitrary attrs (`on*`/`javascript:`)                     | `src/features/content/dom-helpers.ts`             | drop `on*` handler attrs + reject `javascript:`/`data:`/`vbscript:` on url-bearing attrs       |
| 220 | MED  | `handleUpdateScheduledTask` skipped action validation + allowed id/origin rewrite | `src/features/background/tasks.ts`                | validate `updates.actions` via `validateShortcutActions`; strip `id`/`createdByOrigin`         |
| 220 | MED  | `getCloudUnlockState` trusted raw stored `unlocked` flag                          | `src/features/cloud-bridge/desktopBridge.ts`      | require validated shape + non-empty `inviteId`; malformed → locked                             |
| 221 | MED  | `collectJsonLdTypes` no recursion depth cap                                       | `src/features/content/page-metadata.ts`           | added `MAX_JSONLD_RECURSION_DEPTH=10` guard (mirrors nlweb.ts)                                 |
| 221 | MED  | webmcp imperative tools not name/length-hardened                                  | `src/features/content/webmcp.ts`                  | apply `isValidToolName` + `TOOL_DESCRIPTION_MAX_CHARS` to both imperative loops                |
| 223 | LOW  | same, duplicate tree                                                              | `src/webmcp.ts`                                   | same hardening applied                                                                         |
| 220 | LOW  | conversation IDs used `Math.random`                                               | `src/features/background/conversation-history.ts` | `crypto.randomUUID().slice(0,8)`                                                               |
| 222 | LOW  | hardcoded `'13+ providers'` badge                                                 | `src/side_panel.ts`                               | derive count from distinct providers in `SIDE_PANEL_MODEL_OPTIONS`                             |
| 325 | LOW  | invalid placeholder extension ID in doc                                           | `native-host/INSTALL.md`                          | replaced with `<EXTENSION_ID>`                                                                 |

## RESOLVED ALREADY (verified — no change needed)

- **222 [HIGH] jobAutofill auto-submit without confirmation** — `content.ts:1310-1321` already forces a `window.confirm()` gate and sets `autoSubmit=false` if declined (`EXT-AUTOSUBMIT-NO-CONFIRM`). The runtime's auto-submit path is unreachable without explicit human confirmation.

## BY-DESIGN (documented; not a defect)

- **219 [LOW] host_permissions / all-urls breadth** — audit itself states "None required while documented mitigations hold" (`validateBridgeUrl` + `isAllowlistedSender`). No change.
- **220 [LOW] `shouldExecuteScheduledTask` legacy permit** (`policy.ts:454`) — deliberate legacy-compat fail-open for pre-stamp tasks, documented. Tightening requires a deprecation window (tracked, not done here).

## DEFERRED / NOTED (real but lower-priority; NOT fixed this pass)

- **222 [HIGH] `allowSubmitWithMissingRequired`** — gated behind the autoSubmit confirm above; its _default value_ was not independently re-verified. Recommend confirming it defaults `false`.
- **038 [MED/LOW] `providerStreamClient.streamFromProvider` no timeout + swallowed malformed SSE** — prior analysis flagged this function as having zero call sites (dead). Recommend confirm-and-(fix-or-delete) rather than patch dead code.
- **221 [MED] in-page-panel `history.pushState` monkey-patch not restored** (`in-page-panel/panel.ts`).
- **222 [MED] `PAYWALL_FEATURE_LABELS` hardcodes `opus_4_7`/`gpt_5_5`** (`popup.ts`) — derive from `models.json` catalog (more involved).
- **220 [LOW] recorded-actions storage error swallowed** (`content.ts`); **221 [LOW] `sendQueue` swallowed exceptions** — add observability logging.
- **219 [LOW] `handleClearCookies` leading-dot domain** — current `handleClearCookies` location drifted from cited line; re-confirm before fixing.
- **222/223 [LOW] empty barrels** (`integrations/index.ts`, `platform/index.ts`, `ui/index.ts`) — harmless placeholders.
- **278/279 test-drift (~14, MED/LOW)** — mirror-test anti-pattern (tests re-implement production logic instead of importing). Real per the repo's H-02 anti-mirror policy, but a separate refactor (export production helpers from `background.ts`/`policy.ts` + import in tests). NOT done here.

## NOTE ON FILE UPDATES

In-place annotation of the per-batch `AUDIT_PARTS/batch-*.md` files was intentionally skipped: batches 219/278 (and others) mix VS Code / mobile findings being remediated concurrently by other agents, so editing those shared files risks clobbering parallel work. This log is the authoritative extension-surface resolution record.
