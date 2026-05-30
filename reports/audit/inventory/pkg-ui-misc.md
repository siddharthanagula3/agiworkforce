# Inventory Audit — TS UI/misc slice

Slice: `packages/design-tokens`, `packages/compliance`, `packages/utils`, `packages/react-native-worklets`
Auditor: inventory recon (read-only)
Date: 2026-05-29
Anchor doc consulted: `docs/current/commercial-and-launch.md` (Local/BYOK/managed-cloud trust-boundary posture; no stale claims that bear directly on these four packages).

Method: every source file in all four packages was read in full. Aliveness was confirmed by grepping real importers and (for the security-relevant helpers) actual call sites in paren form, excluding `node_modules`, `dist`, `dist-web`, `.next`, `public`, tests, and local shadow implementations. Test coverage was assessed by file presence + size, NOT by reading every assertion (stated honestly below). No builds were run. No source was edited.

---

## Purpose & Architecture

### packages/design-tokens (`@agiworkforce/design-tokens`)
Pure design-token source of truth. `src/index.ts` exports `agiPalette` (light/dark surface/text/border/accent/state), `agiRadii`, `agiTypography`, `agiShadows`, and per-surface CSS-variable maps: `agiChatCssVars`, `agiExtensionCssVars`, `agiVsCodeCssVars`, plus `agiNativeColors` (React Native) and a `cssVarsToString()` serializer. `src/chat.css` is the static `:root` / `.dark` CSS mirror of the chat var map. This package is the mechanism that lets the repo's "no hardcoded colors" rule hold — consumers reference tokens instead of literals. The hex/rgba literals inside this package are the legitimate single definition point, NOT a violation.

### packages/compliance (`@agiworkforce/compliance`)
EU AI Act Article 50 transparency machinery, UI-free (ships strings + pure functions only; host apps render). Modules:
- `article50-text.ts` — verbatim Art. 50(1)/(2)/(4) citations + penalty text + source URL.
- `article50-disclosure.ts` — first-run "you are interacting with AI" disclosure copy composer, ledger gate (`isDisclosureSatisfied`), SHA-256 copy hash (with FNV-1a fallback), acceptance recorder.
- `article50-marker.ts` — C2PA-style provenance claim builder + `<meta name="agi:ai-generated">` HTML tag renderer/injector + text-export wrapper + detector.
- `provider-jurisdiction.ts` — Chinese-HQ provider default-off registry (deepseek/moonshot/qwen/zhipu), `isProviderRoutingAllowed` (fail-closed).
- `llm-gate.ts` — `assertLlmGate` / `isLlmGateOpen` run before every `/api/llm/*` call; typed sentinel errors.
- `index.ts` — barrel + frozen `Article50Disclosure` / `Article50Marker` namespace aliases.

### packages/utils (`@agiworkforce/utils`)
Cross-surface helper grab-bag. Modules: `crypto` (token/UUID/sha256/sha1/hmac/timingSafeEqual), `validation` (email/url/filePath/password/apiKey/json/sqlQuery/sanitizeCommandArgs/checkForInjection), `async` (sleep/debounce/throttle/retry/timeout), `errors` (AppError + friendly-error mapping for chat UI), `format` (date/number/bytes/duration), `voice` (transcription helpers), `logger` (secret-redacting console/Sentry facade), `performance` (measure + tracker), `sensitiveFiles` (denylist regexes), `pathContainment` (`resolveContained`/`isContainedIn`), `privacyHandoff` (Local→BYOK redacted handoff draft builder), `fence` (untrusted-content prompt fencing), `signaling` (WebRTC signaling WebSocket client). `retry.ts` and `debounce.ts` are pure re-export shims over `async.ts`.

### packages/react-native-worklets
Intentional local **stub** (not a vendored copy). `index.js` exports `{}`; `plugin.js` returns a no-op Babel plugin. Exists so `react-native-reanimated`'s Babel plugin can `require('react-native-worklets')` in jest-expo test env without the native module. README/package.json explicitly document this as test/build plumbing. NOT dead code, NOT slop.

---

## Alive vs Dead

| Package / module | Status | Evidence |
|---|---|---|
| design-tokens (index + chat.css) | ALIVE | Imported by web (`app/globals.css`), desktop (`src/styles/globals.css`), mobile (`src/ui/theme/tokens.ts`, `stores/chat/chatExecutionStore.ts`, `MathBlock.tsx`), extension (`src/tokens.ts`), vscode (`sidebar-webview/webviewContent.ts`). |
| compliance (all modules) | ALIVE | Mobile wires it heavily: `app/(public)/onboarding.tsx`, `services/llmGate.ts`, `services/complianceLedger.ts`, `services/dsarExport.ts`, `app/legal/article-50.tsx`, `FirstRunDisclosureModal.tsx`. Dep declared in `apps/mobile/package.json`. |
| utils — fence | ALIVE (user-reachable) | `apps/desktop/src/features/chat/index.tsx:1049,1077`, `apps/desktop/src/stores/memoryStore.ts:1051` — fences untrusted content into LLM prompts. |
| utils — sensitiveFiles | ALIVE (user-reachable) | vscode ext: `inlineCompletionProvider.ts:117`, `agentMode/agentUI.ts:54`, `ChatStateManager.ts:737,751`, `utils/pathSafety.ts:65`. Gates agent/inline file reads. |
| utils — pathContainment | ALIVE (user-reachable) | vscode ext: `agentMode/agentUI.ts:134,583,657`, `patchEngine.ts:417`, `utils/pathSafety.ts:62,73`. Gates agent file write/patch targets. |
| utils — privacyHandoff | ALIVE (LOCKED rule path) | `apps/web/features/chat/lib/localByokHandoff.ts:183`, `apps/desktop/src/features/chat/LocalByokHandoffDialog.tsx:51`. Builds the Local→BYOK redaction preview. |
| utils — logger/crypto/errors/async/format/voice/performance/signaling | ALIVE | `@agiworkforce/utils` has 124 importing files across surfaces. |
| utils — `checkForInjection`, `validateFilePath`, `validateSqlQuery`, `sanitizeCommandArgs` | **VESTIGIAL / effectively dead exports** | Zero real call sites. Paren-form grep across app source (excluding tests/dist/.next/local shadows) returns nothing. Desktop barrel-re-exports them (`apps/desktop/src/utils/validation.ts:15-20,30`) but the actual desktop call sites use **local** `./security` + `embeddings.ts` implementations that shadow them. |
| utils — `validateUrl` | ALIVE but low-reach | Reached only via the deprecated desktop boolean wrapper (`TeamInvitation.tsx:53`). The other live caller (`ModelsKeys/index.tsx:232`) passes `{ allowLocalhost: true }`, an option the shared `validateUrl` does NOT support (it uses `blockPrivateNetworks`), so that site resolves to desktop's own `security.ts` `validateUrl`, not the utils one. Both reachable uses are client-side desktop input validation, not a server-side fetch SSRF guard. |
| react-native-worklets | ALIVE (test/build plumbing) | Resolved by jest-expo / reanimated Babel plugin; intentional stub. |

No truly orphaned modules. The four vestigial validation exports are the only dead-ish surface and they are quality-cleanup, not risk.

---

## Test Coverage

Tests present (line counts; assertions NOT individually read — coverage judged by existence + size):

- compliance: `article50-disclosure.test.ts` (119), `article50-marker.test.ts` (125), `llm-gate.integration.test.ts` (202), `provider-jurisdiction.test.ts` (63), `test-ledger.ts` (45 helper). The four highest-risk compliance modules all have dedicated tests, including an integration test for the gate.
- utils: `fence.test.ts` (48), `pathContainment.test.ts` (95), `privacyHandoff.test.ts` (68), `sensitiveFiles.test.ts` (107). Exactly the four security-relevant helpers are covered.

**Untested** (no `__tests__` file): utils `crypto`, `validation`, `errors`, `async`, `format`, `voice`, `performance`, `signaling`, `logger`. The `logger` secret-redactor is the most notable untested module given its role. design-tokens and react-native-worklets have no package-local tests (design-tokens is data; worklets is a stub — acceptable).

---

## Panic / Crash sites

No Rust in this slice (no `panic!`/`unwrap!`/`expect`/`todo!`). TS `throw` sites reviewed:

- `performance.ts:143` — `throw new Error("no active timer for label")` in `PerformanceTracker.end()`. User-reachable only via developer misuse (end without start); it is a programming-contract guard, acceptable. Low concern.
- `async.ts:253,258,276` — `throw lastError` / `throw new RetryError(...)`. These are the documented retry-exhaustion / abort contract, expected and caught by callers. Not crashes.
- `crypto.sha256/sha1/hmacSha256` call `crypto.subtle.digest(...)` which **rejects** (not throws synchronously) in environments lacking Web Crypto. Callers that `await` without try/catch could see an unhandled rejection, but all known consumers are in Web Crypto-capable runtimes. Low concern.

No user-common-path crash sites found.

---

## TODO / FIXME / HACK

Zero `TODO`/`FIXME`/`HACK`/`XXX` across all four packages (grep clean). The `signature: null` in `article50-marker.ts` is a documented, intentional pre-signing placeholder (the signing service attaches a JWS later) — not a TODO and not slop.

---

## Security-sensitive code (with concrete assessment)

1. **`logger.ts` REDACTION_PATTERNS (lines 40-154)** — the secret-redaction engine. Covers Anthropic/OpenAI/Google/Groq/Stripe/AWS/GitHub/xAI keys, JWT, bearer, named-secret, DB-URL credentials, payment-card, password-line. Applied before console output and before the Sentry `captureMessage` breadcrumb (lines 247, 256, 270). This is a genuine defense and it is wired (the prod sink redacts). Pattern-based = best-effort: novel/unknown secret formats are not caught. The `payment-card-number` (`:142`) and `password-line` (`:151`) patterns **over-redact** (any 13-19 digit run, any line containing "password") — over-redaction is the safe/fail-closed direction for a redactor, so this is a quality note not a hole. NOTE: this is NOT the same thing as the anchor doc's "Sentry beforeSend >40-char strip / PostHog mask_all_text" — that telemetry config lives in `apps/desktop/src/services/errorTracking.ts` and web app code, OUT OF SLICE.

2. **`provider-jurisdiction.ts` / `llm-gate.ts`** — R-023 Chinese-HQ default-off gate. `isProviderRoutingAllowed` fails closed (missing ledger entry = deny, `:101`). `assertLlmGate` enforces disclosure-then-provider order. Logic is correct **as a mechanism**. Enforcement depends on host callers actually invoking the gate before every `/api/llm/*` request — that wiring is out of slice (verified mobile imports it; web/desktop enforcement not audited here).

3. **`privacyHandoff.ts` buildLocalToByokHandoffDraft** — implements the LOCKED Local→BYOK redaction-preview rule. Runs `redactSecretsWithReport` over each context item, computes SHA-256 checksums, sets `consentRequired: true`, and a `blocked` flag when findings exist and `blockOnFindings` (default true). Correct mechanism. It only produces the preview/flag; whether the caller HONORS `blocked` and the consent gate is out of slice (web `localByokHandoff.ts`, desktop `LocalByokHandoffDialog.tsx`). Redaction is the same pattern-based best-effort as #1.

4. **`sensitiveFiles.ts`** — denylist of `.env`, keys/certs, `.ssh`/`.aws`/`.gcloud`/`.kube`, git-credentials, etc. Normalizes backslashes, anchors on `(^|/)`. Reasonable coverage. Does NOT follow symlinks (caller responsibility) — documented. Could miss e.g. `*.p8` (Apple) or `terraform.tfvars`; minor gap.

5. **`pathContainment.ts`** — correct separator-aware containment via `path.relative` (the F-05 adjacent-dir bypass is handled). Explicitly does NOT resolve symlinks (documented; `pathSafety.ts` layers a realpath re-check on top). Good.

6. **`validation.ts validateUrl` (`:61`)** — SSRF-style private-network block is literal-hostname-pattern only: no DNS resolution (rebinding bypass possible) and misses `0.0.0.0`, decimal IP (`http://2130706433`), octal/hex IPs, and IPv6-mapped IPv4 (`::ffff:127.0.0.1`). This WOULD be P1/P2 if used as a server-side fetch guard, but its only reachable uses are client-side desktop input validation (invite URL, key endpoint), so impact is low. See issues table.

7. **`fence.ts`** — strips zero-width/bidi controls + NFC-normalizes + removes the fence tag from content before wrapping. Solid trust-boundary fencing. The tag-strip regex `</?${tag}>` is built from a caller-supplied `tag`; all known callers pass static literals, so no injected-regex concern in practice.

8. **`crypto.ts`** — uses Web Crypto `getRandomValues`/`randomUUID`/`subtle`. `timingSafeEqual` is constant-time only when lengths match (early `false` on length mismatch leaks length — standard and acceptable). Module docstring correctly steers sensitive ops to the Rust SecretManager. `sha1` clearly labeled non-security.

---

## AI-slop

- **Vestigial validation exports** (`checkForInjection`, `validateFilePath`, `validateSqlQuery`, `sanitizeCommandArgs`): present in `index.ts` (`:31-43`), re-exported by desktop, never actually called. Classic "shared util that consumers reimplemented locally and the shared one was orphaned." Cleanup, low risk.
- **Over-broad denylist design** in `checkForInjection` (`validation.ts:333`): flags any input containing `SELECT`/`;`/`&`/`<script`/etc. If it were ever wired to gate user chat input it would be a false-positive generator. Currently inert (no callers), so it is latent slop, not an active bug.
- **`validateFilePath` (`:120`)**: rejects any path containing the `..` substring — would reject legitimate names like `my..notes.txt`. Inferior to and inconsistent with `pathContainment.resolveContained` (the actual SSOT). Inert (no callers).
- **Inconsistent path-safety approaches**: `validateFilePath` (substring `..`), `pathContainment` (relative-based, correct), desktop `embeddings.ts`/`security.ts` (local copies). The repo already consolidated path-containment into `pathContainment.ts`; `validateFilePath` is the leftover.
- **Stale doc reference**: `article50-disclosure.ts:8-10` and the PRD-quote comment reference an enforcer file `packages/compliance/src/article50.ts` which does not exist (the real files are `article50-disclosure.ts` / `llm-gate.ts`). Comment-only drift.
- No hardcoded/RNG/fabricated data rendered to users in any of these packages. The hex literals in design-tokens are the legitimate token definitions. The `crypto` RNG helpers are ID/nonce generators (calibration false-positive class — ignored).

---

## Broken / half-built features

None functionally broken. The closest items:
- The four vestigial validation exports (orphaned, not broken).
- `validateUrl`'s SSRF block is incomplete but its reachable uses don't depend on it as a security boundary.

No dead buttons, empty shells, or stubbed user-facing returns in this slice. The `react-native-worklets` "empty" implementation is intentional and documented, not a half-built feature.

---

## Severity-ranked issues

### P1
_None._ The genuinely security-sensitive code (compliance gate, privacy-handoff redaction, fence, pathContainment, sensitiveFiles) is correct as a mechanism and is wired; the over-broad/incomplete validators are not reachable as security boundaries.

### P2
- **P2 — `validation.ts:61` `validateUrl` private-network block is bypassable.** No DNS resolution (rebinding), and misses `0.0.0.0`, decimal/octal/hex IP encodings, and `::ffff:127.0.0.1`. Evidence: `privatePatterns` at `validation.ts:84-94`. Currently low-impact because reachable callers (`apps/desktop/.../TeamInvitation.tsx:53`, and the deprecated boolean wrapper) are client-side desktop input validation, not server-side fetch guards. Fix hint: if it must serve as an SSRF guard anywhere server-side, resolve the hostname and check the resolved IP against private ranges including all alt-encodings; otherwise document it as input-validation-only and rename to avoid implying SSRF protection.
- **P2 — `logger.ts` secret redactor is untested and pattern-only.** It is the prod telemetry/console redactor (Sentry breadcrumb at `:270`) yet has no `__tests__`. Pattern-based, so novel secret formats leak. Fix hint: add a redaction test suite (each pattern + a "secret survives unknown format" expectation) and document the best-effort limitation where it backs the Local→BYOK / telemetry boundaries.

### P3
- **P3 — Orphaned/over-broad validators (`checkForInjection`, `validateFilePath`, `validateSqlQuery`, `sanitizeCommandArgs`).** Exported (`index.ts:31-43`), re-exported by desktop, zero real call sites (paren-form grep clean). `validateFilePath:120` uses naive `..` substring; `checkForInjection:333` is an over-broad denylist. Fix hint: delete from utils (and the desktop barrel re-export) or, if kept, replace `validateFilePath` internals with `resolveContained` and document `checkForInjection` as advisory-only.
- **P3 — Stale enforcer path in compliance comments.** `article50-disclosure.ts:8-10` cites `packages/compliance/src/article50.ts` (nonexistent). Fix hint: update comment to `article50-disclosure.ts` + `llm-gate.ts`.
- **P3 — `sensitiveFiles.ts` denylist gaps.** Misses `*.p8`, `*.tfvars`, `*.kdbx`, possibly `.env.*.local` ordering edge cases. Fix hint: extend pattern list; add tests for the new entries.
- **P3 — Over-redaction in `logger.ts` payment-card/password patterns** (`:142`, `:151`): any 13-19 digit run / any "password" line is masked. Safe direction for a redactor but can mangle benign log content (order IDs, "password reset email sent"). Fix hint: tighten with Luhn check for card numbers; scope password-line to key=value forms.

---

## Open questions / uncertainty

1. **Enforcement of locked trust boundaries is out of slice.** `assertLlmGate` and `buildLocalToByokHandoffDraft` provide the gate and the redacted preview + `blocked` flag, but whether web/desktop callers actually call the gate before every LLM request and honor `blocked`/`consentRequired` lives in `apps/web` and `apps/desktop` — not verified here. These packages provide the mechanism, not the enforcement.
2. **Telemetry redaction per the anchor doc** ("Sentry beforeSend >40-char strip, PostHog mask_all_text") is NOT in this slice — it is in `apps/desktop/src/services/errorTracking.ts` and web app config. The `logger.ts` redactor is a separate, complementary mechanism. Framed as scoping, not a gap.
3. **Test assertions not individually read** — coverage above is judged by test-file presence and size, not by confirming each assertion exercises the security-relevant branch. The compliance gate has an explicit integration test (202 lines) which is reassuring but unverified line-by-line.
4. Did not exhaustively diff desktop's local `security.ts validateUrl`/`checkForInjection` against the utils versions — only confirmed they shadow the utils exports at the call sites. The desktop local impls may or may not have the same SSRF gap (out of slice).
