# AGI Workforce — Unified Launch Plan

**Effective:** 2026-05-04
**Authority:** Replaces master remediation plan + sprint1-vault-rewire (both in repo `docs/plans/` and in `~/.claude/plans/`).
**Companion plans (still active):** `docs/plans/wave2-desktop-v1.md`, `docs/plans/wave3-mobile-extensions-web.md` — but see corrections in §5.
**Inputs verified:** `~/.claude/plans/code-review-2026-05-03.md` (11 P0s + 27 P1s) + `~/.claude/plans/architecture-analysis-2026-05-04.md` + iteration 1 supervisor audit + 7-agent team gate-check + direct verification 2026-05-04.

## Decisions log (locked by user 2026-05-04 via /ralph-loop:ralph-loop)

1. **Scope** = ship-blocker audit (verify code-review-2026-05-03 P0/P1 list against current code; no from-scratch architectural re-audit).
2. **Output** = this single file at `docs/plans/UNIFIED_LAUNCH_PLAN.md` (version-controlled).
3. **Authority** = read-only. Agents read + report findings. No inline fixes during the audit.
4. **Source of truth** = code wins when memory/docs disagree. Memory + SSOT corrections (Appendix C) applied in a follow-up sprint.

---

## TL;DR — go/no-go per track

| Track                                                       | Verdict         | ETA        | Gating P0s                                                |
| ----------------------------------------------------------- | --------------- | ---------- | --------------------------------------------------------- |
| **Demo today (curated)**                                    | GO              | 0 days     | None (hide stale Chrome zip + macOS/Win download paths)   |
| **Public MVP launch** (Local + BYOK free tiers, no payment) | GO-WITH-CAVEATS | 3-5 days   | 4 security P0s + 4 operational P0s                        |
| **Paid Hobby launch**                                       | GO-WITH-CAVEATS | 10-14 days | All P0s + Stripe idempotency + key isolation + audit pass |
| **Mobile App Store + Google Play**                          | NO-GO this week | 4-6 weeks  | Apple Dev enrollment + screenshots + reviewer tests       |
| **Chrome Web Store**                                        | NO-GO this week | 1-2 weeks  | Rebuild zip + dev account + per-permission justifications |
| **VS Code Marketplace**                                     | NO-GO this week | 1 week     | Multi-MODEL→Multi-PROVIDER copy + vsce packaging          |

---

## 1. Ship-blocker punch list — 11 P0s (verified 2026-05-04)

### Security (4) — file:line evidence

| #   | ID                        | File:line                                                          | Status   | Fix                                                                                                                                                                                  |
| --- | ------------------------- | ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | WEB-RLS-BYPASS            | `apps/web/app/api/llm/v1/chat/completions/route.ts:226-247`        | **OPEN** | Service-role client reused for downstream DB ops after JWT verify. Split into `supabaseAdmin` (verify only) + `supabaseUser` (anon-key + token, RLS-bound).                          |
| 2   | WEB-SET-TOKEN-UNVALIDATED | `apps/web/app/api/auth/set-token/route.ts:13-35`                   | **OPEN** | Body.token written to `agi_access_token` cookie with no JWT validation, no length cap, no Zod. Add `supabase.auth.getUser(body.token)` before set; reject on failure.                |
| 3   | WEB-CSRF-ANON-FORGE       | `apps/web/app/api/csrf/route.ts:20-22` + `lib/csrf.ts:215-218`     | **OPEN** | CSRF tokens bound to anonymous session — combined with #2, anon users can forge auth cookies (GET /csrf → POST /set-token). Require authenticated session for cookie-mode mutations. |
| 4   | DESK-SQLITE-PANIC         | `apps/desktop/src-tauri/src/data/database/sqlite_pool.rs:153, 179` | **OPEN** | Literal `panic!()` in production paths; `debug_assert` is no-op in release. Replace with `Err`, audit all callers to use `try_get*()` variants (already exist in same file).         |

### Operational (4) — must fix to actually ship

| #   | ID                        | File:line                                                                                                                                                                                                                                                                              | Status                                                                                                                                                                                                                       | Fix                                                                                                                                                       |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | CHROME-EXT-ZIP-STALE      | `apps/extension/extension.zip` (89,393 bytes, Mar 18 — 47 days old) — file EXISTS but predates the provider-stream addition shipped after Mar 18. Earlier "missing" finding was a path error (chrome-engineer checked `apps/extension.zip`; actual is `apps/extension/extension.zip`). | **OPEN**                                                                                                                                                                                                                     | Rebuild before Chrome Web Store submission: `cd apps/extension && pnpm build && (cd dist && zip -r ../extension.zip .)`. **5 min.**                       |
| 6   | CLI-TESTS-STALE           | `apps/cli/src/config.rs:573, 761, 864, 1230` (assertions check `claude-opus-4-6`, live default `claude-opus-4-7`)                                                                                                                                                                      | **PROBABLY-FIXED** by commit `25f1f4cf fix(desktop,ci): repair 8 stale rust tests` — awaiting `cli` agent fresh `cargo test` output. **15 min if not.**                                                                      |
| 7   | WEB-DOWNLOAD-PLACEHOLDERS | `apps/web/public/downloads/agi-workforce-linux.AppImage` (45 bytes literal text) + `agi-workforce-win.exe` (49 bytes text); fallback at `apps/web/app/api/download/route.ts:135-142`                                                                                                   | **OPEN**                                                                                                                                                                                                                     | Delete placeholders + fail loud, OR replace with real artifacts. **10 min.**                                                                              |
| 8   | DESK-SIGNING-DEFERRED     | `.github/workflows/release-desktop.yml` (APPLE\_\* secrets + Windows EV cert)                                                                                                                                                                                                          | **DELIBERATE** per commits `82463ae4 fix(ci): defer macos to v1.2.1` + `93d4cc31 fix(ci): unblock v1.2.0 release - skip windows builds`. `docs/plans/wave2-desktop-v1.md:13` confirms "DEFERRED to v1.1 (Q3 2026)" decision. | **Status:** intentional. Document on `/download` page: "Windows: Coming Q3 2026" (already in wave2 plan). For macOS: target v1.2.1 with cert acquisition. |

### Marketing-page contradictions (newly elevated 2026-05-04 by web marketing sweep)

These are TRUST-DESTROYING for YC review and MUST be fixed before any public launch post / submission. Found by comprehensive sweep of 21 marketing pages.

| #   | ID                            | File:line                                                                                                                                                                                                                                                                                                  | Status   | Fix                                                                                                                                                                                                                                                                               |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MK1 | FAQ-HOBBY-FREE                | `apps/web/app/faq/page.tsx:39` says **"we offer a free Hobby tier"**                                                                                                                                                                                                                                       | **OPEN** | WRONG — Hobby is paid ($5/mo target). Free tiers are Local-only and BYOK. Replace copy.                                                                                                                                                                                           |
| MK2 | FAQ-BYOK-CONTRADICTION        | `apps/web/app/faq/page.tsx:77` says **"managed proxy model — no need to manage your own API keys"**                                                                                                                                                                                                        | **OPEN** | Direct contradiction of BYOK positioning across every other page. Rewrite to acknowledge BYOK + managed cloud as parallel options per `docs/PRICING.md`.                                                                                                                          |
| MK3 | AGENTS-DISPATCH-FALSE-CLAIM   | `apps/web/app/features/agents/page.tsx:330` says **"the only AI platform with a dedicated mobile companion"**                                                                                                                                                                                              | **OPEN** | FALSE — Anthropic Dispatch shipped March 17, 2026 (per `MEMORY.md:23`). Reword to claim differentiator that's actually true (e.g., "multi-provider mobile companion").                                                                                                            |
| MK4 | OS-OVERSTATED                 | JSON-LD `operatingSystem: 'macOS, Windows, Linux'` in 5 pages: `app/page.tsx:68`, `features/agents/page.tsx:62`, `features/tools/page.tsx:81`, `features/ai-skills/page.tsx:82`, `features/plugins/page.tsx:76`; trust bar `page.tsx:198` `macOS · Windows · Linux · Web · CLI`; FAQ `:57`; download `:29` | **OPEN** | v-desktop-1.2.0 is **Linux only** per `v1-2-0-release-state.md`. macOS deferred to v1.2.1; Windows deferred Q3 2026. Either fix all to "Linux (macOS + Windows coming Q3 2026)" or qualify with "Coming soon".                                                                    |
| MK5 | PROVIDER-TRUSTBAR-WRONG       | `app/page.tsx:265-288` provider trust bar includes **Mistral and Groq** logos                                                                                                                                                                                                                              | **OPEN** | Mistral was DROPPED 2026-05-03 (per `apps/cli/src/models.rs:310` comment). Groq is not in the canonical 9-cloud list (`marketing-constants.ts:7-9`). Reduce trust bar to: Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu + Ollama + LMStudio.        |
| MK6 | LAUNCH-POSTS-INVENT-PROVIDERS | `docs/launch/show-hn.md:35`, `twitter.md:13`, `r-localllama.md:47`, store-listings list `Mistral, Groq, Together, Fireworks, Azure, Bedrock, Cohere, AI21, SambaNova, OpenRouter` as wired                                                                                                                 | **OPEN** | Misleading. Mistral dropped; Groq/Together/Fireworks/Azure/Bedrock/Cohere/AI21/SambaNova/OpenRouter are NOT first-party wired in the CLI per `models.rs:287-304`. Replace with actual list + "unlimited custom OpenAI-compatible BYO endpoints" per `marketing-constants.ts:7-9`. |
| MK7 | LAUNCH-POSTS-STALE-NUMBERS    | `show-hn.md:42,49,65`, `twitter.md:52,65,67`, `r-localllama.md:30,61` use `914 tests` / `19 hook events` / `gpt-5.4` example                                                                                                                                                                               | **OPEN** | Truth: 2,161 tests, 22 hook events. Replace globally. (See Appendix C patches.)                                                                                                                                                                                                   |
| MK8 | PRICING-ALPHA-LABEL-STALE     | `apps/web/app/pricing/page.tsx:854-855` Hobby card says **"during our public ALPHA"**                                                                                                                                                                                                                      | **OPEN** | Product is post-alpha (v1.2.0 Linux shipped, CLI v1.0.0 GA). Remove ALPHA label or clarify scope.                                                                                                                                                                                 |

**MK note (false-positive flagged but actually correct):** `apps/web/components/marketing/CliShowcase.tsx:315` says CLI MCP ships `stdio · SSE · HTTP · OAuth`. Docs-sweep flagged this as wrong based on stale `cli-audit-2026-05-03.md:46` ("only stdio transport"). Verified by cli-engineer this audit: **all 3 transports + OAuth ARE shipped** at `apps/cli/src/mcp/{mod.rs,sse.rs,http.rs,oauth_flow.rs}`. CliShowcase is correct; the stale memory file is wrong. (Memory correction patches in Appendix C cover this.)

### Feature regressions / locked-fact violations (3)

| #   | ID                      | File:line                                     | Status             | Fix                                                                                                                                                                                                                          |
| --- | ----------------------- | --------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | VSCODE-MARKETPLACE-COPY | `apps/extension-vscode/package.json:4`        | **OPEN**           | Description says `"Multi-model AI coding assistant — GPT, Claude, Gemini, and 10+ LLM providers"`. Locked spec: `Multi-PROVIDER`. Line 321 (settings description) IS correct; line 4 ships to Marketplace. **One-line fix.** |
| 10  | CLI-DUAL-PLAN-MODE      | `apps/cli/src/tools.rs:193, 2198, 2548, 2557` | **OPEN**           | Legacy `plan_mode` boolean toggle still wired alongside new `update_plan` tool. System prompt dilution. Delete `execute_plan_mode` + remove `"plan_mode"` from builtins.                                                     |
| 11  | MODEL-IDS-HARDCODED     | (multiple — see breakdown)                    | **PARTIALLY-OPEN** | Single `getProviderDefaultModel()` helper + replace all sites + CI grep gate. **3-4 hours total.**                                                                                                                           |

#### MODEL-IDS-HARDCODED breakdown (rule-models-json.md violations)

- **Web (P0 priority):**
  - `apps/web/core/ai/llm/unified-language-model.ts:89` (`?? 'gpt-5.4'`)
  - `apps/web/core/ai/llm/user-ai-preferences.ts:15, 18`
  - `apps/web/app/chat-multi/page.tsx:26-28`
  - `apps/web/app/features/ai-chat/page.tsx:175-401`
  - `apps/web/features/settings/hooks/use-settings-queries.ts:131`
  - `apps/web/features/settings/services/user-preferences.ts:643`
  - `apps/web/features/chat/hooks/use-chat-interface.ts:156`
  - `apps/web/app/api/github/webhook/route.ts:155` (`'claude-haiku-4-5-20251001'`)
- **Desktop:**
  - `apps/desktop/src-tauri/src/sys/prompt_enhancement/api_router.rs:137, 141, 143`
  - `apps/desktop/src-tauri/src/core/mcp/server/tools.rs:19` (user-facing MCP tool description)
  - `apps/desktop/src-tauri/src/data/db/repository.rs:982, 995` (`gpt-4o`, `gemini-1.5-flash`)
  - `apps/desktop/src-tauri/src/sys/commands/chat/prompt_context.rs:300-301` — **NOTE:** line 284 comment marks these as "intentionally generic prefixes" — may be deliberate (verify before fix)
- **Extensions:**
  - `apps/extension/src/side_panel.ts:59-63` (display labels)
  - `apps/extension-vscode/src/extension.ts:1188` (welcome copy)
- **CLI:**
  - `apps/cli/src/model_catalog.rs` `FALLBACK_DEFAULT_MODEL = "claude-opus-4-6"` (and stale per CLI-TESTS-STALE P0 #6)
  - `apps/cli/src/onboarding.rs:102, 289`
  - `apps/cli/tui/chatwidget.rs:6953`
  - `apps/cli/tui/app.rs:7266-7281`

---

## 2. P1 punch list — should fix this sprint

(Trimmed from code-review-2026-05-03.md's 27 P1s + iteration 1 + direct verification.)

### Web (3 open, 2 retired by 2026-05-04 verification)

- [ ] `apps/web/app/api/llm/v1/chat/completions/route.ts` — 1407-line monolith (auth + billing + routing + streaming). Extract.
- [ ] `apps/web/lib/.../user-preferences.ts:56-62, :84` — `TOTP_ENCRYPTION_KEY` reused via SHA-256 for unrelated AES-GCM. Use HKDF with context labels.
- [ ] **NEW P1** Pricing page missing Local-only + BYOK tier cards. `apps/web/app/pricing/page.tsx` shows only Hobby/Pro/Max/Enterprise (lines 825/916/997/1078). Locked 6-tier spec per `docs/PRICING.md` requires Local-only + BYOK as free-tier cards. Add before launch announcement.
- [ ] **NEW P1** `apps/web/app/about/page.tsx:249` hardcodes `"10+"` instead of importing `MARKETING.providers.display`. SSOT violation; minor.
- ~~Stripe webhook idempotency lock~~ — **VERIFIED FIXED**: atomic `rpc('process_stripe_event_idempotent', ...)` at `stripe-webhook/route.ts:1247-1263` runs BEFORE the switch at `:1266`. No race window remains.
- ~~Body size enforcement buffers full ArrayBuffer~~ — **VERIFIED FALSE-POSITIVE**: `route.ts:285-288` does `Content-Length` pre-check; only falls through to `arrayBuffer()` at `:305` when header is missing, then checks `byteLength > MAX_BODY_BYTES` at `:306` before `JSON.parse`. Defense-in-depth present.
- [ ] CSP `unsafe-inline` for styles still in `apps/web/proxy.ts:20` (WEB-11 known, deferred per code comment).

### Desktop (5)

- [ ] `apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs:709-714` — TODO blocks per-app blocklist enforcement (Cowork parity gap). 1-day fix per architecture-analysis-2026-05-04.
- [ ] Tier taxonomy was P0 #12-13 in code review — **VERIFIED RESOLVED** at `apps/desktop/src-tauri/src/sys/billing/models.rs:8-24` and `apps/desktop/src/types/pricing.ts:10-19`. (Removed from P0.)
- [ ] `apps/desktop/src/stores/triggerStore.ts:17` — TODO re: divergent local types.
- [ ] `apps/desktop/src/lib/supabase.ts:187` PlanTier order vs `subscriptionGate.ts:14` PLAN_TIER_HIERARCHY documentation gap.
- [ ] `apps/desktop/src/components/SettingsPanel.tsx` (1970 LOC) + `App.tsx` (1493 LOC) monoliths to split.

### CLI (5)

- [ ] `apps/cli/src/sandbox.rs:159` silent fallthrough — Windows runs commands with NO sandboxing. Either remove `WindowsRestrictedToken` enum stub or `#[cfg]` panic.
- [ ] `~/.agiworkforce/auth.json` plaintext (CLI-5 known, mitigated by 0o600). Move to keyring.
- [ ] MCP OAuth `dynamic_register` uses placeholder `127.0.0.1/callback` (no port). RFC 8252 §7.3 risk.
- [ ] `apps/cli/src/plugins.rs:1` `#![allow(dead_code, unused_imports)]` defeats workspace lint.
- [ ] No SHA-256 / signature verification on plugin manifest discovery (acceptable for local; not for Git source).

### Mobile (4 open, 1 retired)

- [ ] 3 unwired buttons in Dispatch screen — verified at `apps/mobile/app/.../dispatch/index.tsx:179-200` (Preview, Open on Mac) + `:278-285` (attachment +).
- [ ] `setNavigatorReady` defined at `apps/mobile/services/notifications.ts:276` but **never called** — 50ms penalty per push tap (timeout fallback at `:306-308`). 1-line fix in root `_layout.tsx` `useEffect` after `isInitialized` becomes true.
- [ ] Profile screen re-fetches `/api/user/stats` — `apps/mobile/.../profile/index.tsx:92` `useEffect` deps `[conversations.length, agents.length]`. Change to `[]` (mount-only).
- ~~Unused lucide imports~~ — **VERIFIED FALSE-POSITIVE**: every imported icon has at least one JSX usage in same file; Metro + `lucide-react-native` already tree-shakes per-icon.
- [ ] `_layout.tsx` `as any` casts on `/onboarding` route at `apps/mobile/app/_layout.tsx:188,197` — Expo Router typed routes excludes root-level files outside groups. Move `onboarding.tsx` into a group OR add typed route override. Low-risk; no runtime impact.

**Mobile correction:** iOS minimum version is **15.1** (SDK-derived from `.expo/xcodebuild.log` IPHONEOS_DEPLOYMENT_TARGET), NOT the "iOS 12.0" claimed in `MEMORY.md:34`. Not a ship-blocker but should be documented explicitly in `app.json` for App Store submission clarity.

### Chrome ext (3 open, 1 retired)

- [ ] `EVALUATE_SCRIPT` listed in `DOM_MUTATION_MESSAGE_TYPES` at `background.ts:740` but **no content-script handler** in `content.ts:192-244` (`EXECUTE_SCRIPT` exists at `:216` — different name, suggests rename not propagated). Silent drop. Either rename to `EXECUTE_SCRIPT` everywhere OR add the handler.
- ~~`sanitizeHtml` `<a>` href accepts `javascript:`~~ — **VERIFIED FALSE-POSITIVE**: `side_panel.ts:982` passes `ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i` to DOMPurify; `src` is in `FORBID_ATTR` at `:977`. Fully mitigated.
- [ ] 40 `innerHTML = '<static>'` sites total (`side_panel.ts` 39 + `content.ts` 1; review said 15+, actual 40). Static strings safe today; regression risk on copy-paste. P2-grade per chrome-engineer; not P1.
- [ ] `nativeMessaging` permission declared at `apps/extension/manifest.json` + `NATIVE_HOST_NAME = 'com.agiworkforce.browser'` at `background.ts:106`, called at `:242` with reconnect loop at `:181` — but **no `com.agiworkforce.browser.json` host manifest in repo**. Reconnect loop will silently fail until desktop ships manifest + binary to `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`. Either ship the host OR remove the permission (and the reconnect loop) before Chrome Web Store submission.

**Chrome correction:** test suite count is **12** (not 14 as memory claims). Monolith sizes: `background.ts` = 2,519 LOC (review said ~2,341), `side_panel.ts` = 2,681 LOC ✓, `content.ts` = 2,067 LOC ✓.

### VS Code ext (3 open, 1 retired)

- ~~Fallback chain references `gpt-5.5` which doesn't exist~~ — **VERIFIED FALSE-POSITIVE**: `gpt-5.5` IS in `apps/extension-vscode/models.json:42` as `defaultModel`. The `?? 'gpt-5.5'` at `modelConstants.ts:28` is a safety-net fallback to a real catalog entry.
- [ ] **Line correction** `apps/extension-vscode/package.json:513` (NOT :503) — settings description pins `gpt-5.4`: `"description": "Default LLM model (e.g. auto-balanced, claude-sonnet-4.6, gpt-5.4, gemini-3.1-pro-preview)"`. Replace with provider-agnostic example.
- [ ] Keybinding **guaranteed conflict** (worse than reported): `ctrl+shift+a` is bound to TWO commands simultaneously (`agi-workforce.chat` AND `agi-workforce.acceptCurrentDiff`); `agi-workforce.rejectDiff` on `escape` has no `when` clause (intrusive across all VS Code contexts). Pick one for `ctrl+shift+a`; gate `escape` with `when: agi.diffActive`.
- [ ] **NEW P1** Telemetry hardcodes `'0.1.0'` version fallback in **6 sites across 3 files** (review said 3): `telemetry.ts:62,121,135`, `extension.ts:758,774`, `api.ts:408`. Read from `context.extension.packageJSON.version`. Under-reports the actual 0.3.0.

**VSCode corrections (numbers all wrong in MEMORY.md):**

- Commands = **53** (memory said 54+, code-review said 51)
- Settings = **21** (memory said 11)
- Keybindings = **13** ✓
- Source files = **42** total / 29 non-test (memory said 30)
- P0-2 line is `extension.ts:1225`, NOT `:1188` as cited in code-review
- P0 #9 line `package.json:321` is **partially fixed** (says "Multi-provider … 10+ providers (GPT, Claude, Gemini, and more)") but still names model families, vs locked spec which forbids them. Top-level `:4` is fully broken.

---

## 3. Wave 3 launch checklist (mobile + chrome + vscode + Hobby)

(Tactical detail in `docs/plans/wave3-mobile-extensions-web.md` — this section is the launch-readiness gate.)

### Pre-requisites still pending

- [ ] Apple Developer Program membership active ($99/yr) — **DO IMMEDIATELY** for v1.2.1 desktop signing AND mobile launch
- [ ] Google Play Developer account active ($25 one-time)
- [ ] Stripe Hobby price configured (`scripts/create-hobby-price.js`)
- [ ] Chrome Web Store developer account ($5)
- [ ] Microsoft Partner Center / Azure DevOps PAT for VS Code Marketplace

### Mobile (3-4 weeks)

- [ ] Bundle ID `com.agiworkforce.app` registered in Apple Developer
- [ ] Distribution provisioning profile created
- [ ] App Store screenshots (6 required): empty state, dispatch view, settings, model picker, voice input, agent task list
- [ ] Privacy questionnaire: declare email, device ID, usage analytics
- [ ] EAS build → .ipa upload → review (1-7 days)
- [ ] Google Play Data Safety questionnaire + AAB upload + closed→open→prod track promotion (1-3 days each)
- [ ] **Already done:** drawer nav, auth, push, realtime, deep linking, MMKV+biometric, Dispatch (597+181 LOC), iOS bundle + privacy manifest, EAS profiles

### Chrome ext (1-2 weeks)

- [ ] **Rebuild extension.zip** (P0 #5)
- [ ] Listing copy: "AGI Workforce Browser — Multi-provider AI assistant in your browser sidebar"
- [ ] 5 screenshots (sidebar empty state, model selector, attachment menu, action mode toggle)
- [ ] Per-permission justifications for `cookies`, `nativeMessaging`, `tabs`, `tabGroups`, `scripting`
- [ ] LinkedIn + Lever scraper data-collection disclosure (may trigger extended review)
- [ ] **Already done:** MV3 v1.2.0, dist/, 14 test suites, P0 audit fixes (sender allowlist + same-tab DOM)

### VS Code ext (1 week)

- [ ] **Fix package.json:4 description** (P0 #9 — Multi-MODEL → Multi-PROVIDER)
- [ ] Resolve `vsce package` minimatch error (`npx --yes @vscode/vsce@latest package`)
- [ ] Publisher verification on Microsoft Partner Center
- [ ] README.md + screenshots + CHANGELOG.md + categories/tags
- [ ] LICENSE placeholder `[your-contact-info]` fix

### Hobby tier launch

- [ ] All P0s closed (§1)
- [ ] All P1 web security closed (§2 web items)
- [ ] Stripe webhook idempotency dedupe by `event.id` verified
- [ ] CLI auth.json moved to keyring
- [ ] CSP `unsafe-inline` removed (WEB-11)
- [ ] Pricing page + checkout flow live + Pro/Max waitlist functional
- [ ] Independent security audit pass

---

## 4. v1.2.1 desktop blocker resolution

Per `docs/plans/wave2-desktop-v1.md:13` and `~/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/v1-2-0-release-state.md`:

### macOS (target v1.2.1)

1. Apple Developer Program enrollment (if not active)
2. Acquire `D2PR62RLT4` Team ID Apple Developer ID Application certificate (per `tauri.conf.json`)
3. Add to GitHub Actions secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`
4. Re-enable macOS job in `.github/workflows/release-desktop.yml`
5. Tag `v-desktop-1.2.1` → CI builds + signs + notarizes DMG
6. Update `agiworkforce.com/download` macOS link

### Windows (deferred to Q3 2026 per locked decision)

- $249/yr Sectigo/SSL.com EV cert procurement (1-3 day clock)
- Add `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` secrets
- Wire AzureSignTool/SignTool in release pipeline
- Currently `/download` page reads "Windows: Coming Q3 2026" — keep this language until cert acquired

---

## 5. Stale plan / doc references discovered

These items in active plans contradict current code reality. **Apply these corrections in a follow-up sprint** (per Decision #4 — read-only audit).

### `docs/plans/wave2-desktop-v1.md` — STALE references

- **Line 18-37 (Task 1.1 — Migrate UnifiedAgenticChat web monolith):** **TASK ALREADY DONE.** `apps/web/components/UnifiedAgenticChat/` does NOT exist; web uses `apps/web/features/chat/` (183 files). Mark Task 1.1 as completed.
- **Line 45 (Task 1.2 triage rules — keep ModeSelectionDialog as overlay):** **FILE GONE.** Update to reference `OnboardingWizard.tsx` instead.
- **Line 59 ("1,469 IPC commands in 132 files"):** Numbers vary across docs (1,478 vs 1,469; 132 vs 134 vs 151 files). Run `find apps/desktop/src-tauri/src -name "*.rs" | xargs grep -l "#\[tauri::command\]" | wc -l` and reconcile.

### `AGI_WORKFORCE.md` (SSOT) — STALE references

(Detail in Appendix C correction patches.)

- Line 47: `Mode picker: apps/desktop/src/components/Onboarding/ModeSelectionDialog` — **WRONG**. File deleted. → `OnboardingWizard.tsx`.
- Line 184: `P1 20/25 closed` (SSOT) vs `P1 25/25 closed` (MEMORY.md) — pick one.
- Line 21: CLI stats (`195 .rs / 22 subcommands / 19 hook events / 914 tests`) vs MEMORY (`192 / 22 / 23 / 2,161`) — reconcile.
- Line 26: VSCode `54+ commands` vs code-review `51` vs iteration 1 `85` — reconcile via `grep -c '"command":' apps/extension-vscode/package.json`.

### `~/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/MEMORY.md` — WRONG claims

(Detail in Appendix C.)

- "ThinkingBlock NOT wired into MessageBubble" → IS wired at `apps/web/features/chat/components/messages/MessageBubble.tsx:60, 402-405`.
- "UnifiedAgenticChat 141-file monolith in apps/web" → directory does not exist in apps/web.
- "Sprint 1 vault rewire is current focus" → vault FULLY SHIPPED at `apps/desktop/src-tauri/src/sys/security/master_password.rs:1-769`.
- "8 providers wired in CLI" → 11+ wired in `apps/cli/src/models.rs:70-138`.
- "ModeSelectionDialog component" → file gone, → `OnboardingWizard.tsx`.
- "WEB-4 Stripe webhook middleware open" → resolved at `apps/web/proxy.ts:71-83` + `route.ts:1-80`.

---

## 6. Plans archived by this document

These plans are superseded; move to `docs/archive/`:

| Source                                              | Reason                                                                                  | Target                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `~/.claude/plans/make-a-plan-to-purrfect-papert.md` | Sprint 0+1 done (CI green, vault shipped); Sprints 2-5 partial; superseded by this plan | `docs/archive/2026-05-02-master-remediation.md`        |
| `~/.claude/plans/sprint1-vault-rewire.md`           | Vault fully shipped (master_password.rs:1-769)                                          | `docs/archive/2026-05-02-sprint1-vault-rewire.md`      |
| `docs/plans/master-remediation.md`                  | Duplicate of master remediation                                                         | `docs/archive/2026-05-02-master-remediation-repo.md`   |
| `docs/plans/sprint1-vault-rewire.md`                | Duplicate                                                                               | `docs/archive/2026-05-02-sprint1-vault-rewire-repo.md` |
| `~/.claude/plans/cli-competitive-floor.md`          | Sprint A+B mostly shipped per architecture-analysis-2026-05-04                          | Keep but mark "Phase 0 done" — re-evaluate             |

**Kept active (referenced by this plan):**

- `docs/plans/wave2-desktop-v1.md` (apply §5 corrections — Task 1.1 already done; refs gone files)
- `docs/plans/wave3-mobile-extensions-web.md` (patch test count 14→12)
- `~/.claude/plans/code-review-2026-05-03.md` (input artifact)
- `~/.claude/plans/architecture-analysis-2026-05-04.md` (input artifact)

**Additional plans to archive (discovered by 2026-05-04 docs sweep):**

| Source                                                           | Reason                                                                 | Target                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| `docs/planning/cli-modernization-spec.md`                        | Describes abandoned codex-rs port; 70 crates already deleted in Wave 0 | `docs/archive/2026-04-29-cli-modernization-spec.md` |
| `docs/superpowers/plans/2026-05-01-cli-reference-port.md`        | Same — port abandoned                                                  | `docs/archive/`                                     |
| `docs/superpowers/specs/2026-05-01-cli-reference-port-design.md` | Same                                                                   | `docs/archive/`                                     |

---

## 7. Execution sequence

### Day 1 (parallel, ~2 hours total)

- [ ] CHROME-EXT-ZIP-STALE — rebuild + zip (5 min)
- [ ] WEB-DOWNLOAD-PLACEHOLDERS — delete fallbacks (10 min)
- [ ] VSCODE-MARKETPLACE-COPY — one-line fix (1 min)
- [ ] CLI-TESTS-STALE — run `cargo test` to confirm fixed by `25f1f4cf`; if not, update assertions (15 min worst case)
- [ ] APPLE\_\* secrets to GitHub Actions (30 min if cert exists)

### Day 2 — Security pass (1 day)

- [ ] WEB-RLS-BYPASS — split admin/user clients (3 hr)
- [ ] WEB-SET-TOKEN-UNVALIDATED — JWT validation + Zod (1 hr)
- [ ] WEB-CSRF-ANON-FORGE — auth-required for cookie mutations (1 hr)
- [ ] DESK-SQLITE-PANIC — replace `panic!()` with `Err` + caller audit (3 hr)

### Day 3 — Rule violations sweep (1 day)

- [ ] Add `getProviderDefaultModel(provider)` helper backed by `models.json`
- [ ] Replace all hardcoded model IDs (web first — paid tier dependency)
- [ ] Add CI grep gate for `\b(gpt-[0-9]|claude-(opus|sonnet|haiku)-[0-9]|gemini-[0-9])` outside models.json + tests

### Day 4 — CLI cleanup (0.5 day)

- [ ] CLI-DUAL-PLAN-MODE — delete legacy `execute_plan_mode` + remove from builtins
- [ ] CLI-SANDBOX-WIN-STUB — remove or `#[cfg]` panic
- [ ] CLI-AUTH-PLAINTEXT — move to keyring (P1, can defer to paid-launch sprint)

### Day 5 — Verification + docs

- [ ] Apply Appendix C correction patches to AGI_WORKFORCE.md + MEMORY.md
- [ ] Move plans to `docs/archive/` per §6
- [ ] Run final team gate-check verification
- [ ] Tag `v1.2.1` for desktop (if APPLE\_\* secrets in)

### Week 2-3 — Public MVP launch

- All P0 closed
- Hobby tier paywall configured (Stripe price + checkout)
- Pro/Max waitlist live
- HN + Twitter + r/LocalLLaMA launch posts (already drafted per commit `efadb563`)

### Week 3-6 — Wave 3 stores

- Mobile App Store + Play submission (4-6 weeks total)
- Chrome Web Store submission (1-2 weeks)
- VS Code Marketplace submission (1 week)

---

## 8. Verified foundations (do NOT re-do)

| Capability                                                                                                                           | File:line                                                                                           | Status  |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------- |
| Master password vault (Argon2id+HKDF)                                                                                                | `apps/desktop/src-tauri/src/sys/security/master_password.rs:1-769`                                  | SHIPPED |
| Tier taxonomy (6-tier + 2 legacy aliases)                                                                                            | `apps/desktop/src-tauri/src/sys/billing/models.rs:8-24` + `apps/desktop/src/types/pricing.ts:10-19` | SHIPPED |
| Stripe webhook HMAC                                                                                                                  | `apps/web/app/api/stripe-webhook/route.ts:1224, 1233`                                               | SHIPPED |
| Stripe webhook middleware exclusion + Node runtime pin                                                                               | `apps/web/proxy.ts:71-83` + `route.ts:1-80`                                                         | SHIPPED |
| RLS coverage                                                                                                                         | All 17 Supabase migrations                                                                          | 100%    |
| ThinkingBlock wiring                                                                                                                 | `apps/web/features/chat/components/messages/MessageBubble.tsx:60, 402-405`                          | SHIPPED |
| Provider adapters (S1-S10)                                                                                                           | `packages/providers/{anthropic,google,ollama,openai}`                                               | SHIPPED |
| OnboardingWizard mode picker                                                                                                         | `apps/desktop/src/components/Onboarding/OnboardingWizard.tsx`                                       | SHIPPED |
| Wave 3 launch posts (HN + Twitter + r/LocalLLaMA)                                                                                    | commit `efadb563`                                                                                   | DRAFTED |
| Wave 3 store listings + Hobby checklist                                                                                              | commit `476fd424`                                                                                   | DRAFTED |
| 13 providers wired in CLI (Anthropic, OpenAI, Google, Ollama×2, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, LMStudio + Custom) | `apps/cli/src/models.rs:133-139, :287-304`                                                          | SHIPPED |
| LMStudio CLI integration (memory + cli-audit-2026-05-03 said "NOT wired" — both wrong)                                               | `apps/cli/src/models.rs:133-139, :303`                                                              | SHIPPED |
| 22 hook events (memory said 19 / 23 — both wrong)                                                                                    | `apps/cli/src/hooks.rs:179-200`                                                                     | SHIPPED |
| 3 MCP transports (stdio + SSE + Streamable HTTP) + OAuth/PKCE                                                                        | `apps/cli/src/mcp/{mod.rs,sse.rs,http.rs,oauth_flow.rs}`                                            | SHIPPED |
| `update_plan` plan mode (Codex pattern)                                                                                              | `apps/cli/src/agent.rs:1657, :813-832`, `apps/cli/src/plan_mode.rs:5,7`                             | SHIPPED |
| Mobile drawer nav + Dispatch parity                                                                                                  | `apps/mobile/` (597 + 181 LOC Dispatch)                                                             | SHIPPED |

---

## 9. Open questions for user (decisions needed before paid launch)

1. **Hobby tier price** — `MEMORY.md` says "TBD ($5/mo target)" — final?
2. **Pro/Max tier waitlist behavior** — keep "join waitlist" only, or open to selected users?
3. **Apple Developer Program enrollment status** — do APPLE\_\* certs exist or need to enroll?
4. **External security audit budget** for paid Hobby gate?
5. **Memory + SSOT correction sprint** (Appendix C) — apply this week or after MVP launch?

---

## Appendix A — Surface state (verified 2026-05-04)

**POPULATED 2026-05-04** from 6 parallel surface-engineer agent reports.

| Surface         | Path                     | Files                              | Tests | Headline finding (verified this audit)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------- | ------------------------ | ---------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CLI**         | `apps/cli/`              | 192-195 .rs                        | 2,161 | **13 providers** wired (NOT 8 as memory claimed), **LMStudio IS wired** at `models.rs:133-139, :303` (memory + cli-audit-2026-05-03 BOTH wrong), **22 hook events** (NOT 19 or 23), 3 MCP transports + OAuth/PKCE shipped, `update_plan` matches Codex; legacy `plan_mode` dual-shipped (P0); auth.json plaintext (P0 deferred per audit)                                                                                                                                                                                                |
| **Desktop**     | `apps/desktop/`          | 737 .rs + 430 tsx                  | —     | **Master vault SHIPPED** at `master_password.rs:1-769` (Sprint1 plan claim of dead code is wrong — 11 IPC commands registered); **PlanTier 7 variants + PricingModel 6+2 SHIPPED** (P0 #6, #7 fixed); 4 of 5 model-id P0s already FIXED; computer-use is Anthropic-locked by design (`anthropic_agent.rs:450`); sqlite_pool "panic" is FALSE-POSITIVE (defensive pattern with `try_get` fallible variant); `ModeSelectionDialog` GONE; `UnifiedAgenticChat/` partially-dead but `CommandPalette`/`SearchModal` still imported            |
| **Web**         | `apps/web/`              | 231 routes / 86 API / 392 features | —     | 4 security P0s CONFIRMED (RLS bypass, set-token unvalidated, CSRF anon-binding, gh webhook hardcoded model); UnifiedAgenticChat GONE; live chat = `apps/web/features/chat/` (**183 files**, NOT 113); ThinkingBlock IS wired at `MessageBubble.tsx:60, :402-413`; pricing page **missing Local-only + BYOK tier cards** (W4 NEW); `marketing-constants.ts:15` is canonical "10+"; about page hardcodes "10+" (minor SSOT violation)                                                                                                      |
| **Mobile**      | `apps/mobile/`           | 41-42 tsx                          | —     | iOS bundle id `com.agiworkforce.app` ✓; **iOS min = 15.1** (SDK-derived, NOT 12.0 as memory claims); 4 P1s open (3 unwired Dispatch buttons, `setNavigatorReady` never called, profile re-fetch, route casts); lucide unused-imports P1 is FALSE-POSITIVE; Dispatch 596+180 LOC ✓; `providerStreamClient.ts` 115 LOC ✓                                                                                                                                                                                                                   |
| **Chrome ext**  | `apps/extension/`        | 12 test suites (NOT 14)            | —     | MV3 v1.2.0 ✓; **`extension.zip` DOES NOT EXIST** on disk (P0-G NEW); native messaging host manifest NOT shipped — reconnect loop will silently fail in prod; `EVALUATE_SCRIPT` listed but no handler (silent drop, name mismatch with `EXECUTE_SCRIPT`); `sanitizeHtml` javascript: P1 is FALSE-POSITIVE (DOMPurify URI whitelist); 40 innerHTML sites (NOT 15+); monolith sizes confirmed (bg=2519, side=2681, content=2067)                                                                                                            |
| **VS Code ext** | `apps/extension-vscode/` | 42 src files                       | —     | v0.3.0 ✓; **Multi-MODEL** `package.json:4` P0 STILL OPEN; `:321` partially fixed but still names model families; first-run welcome `extension.ts:1225` (NOT :1188) hardcodes "GPT-5.4" P0 OPEN; settings desc `package.json:513` (NOT :503) lists `gpt-5.4` P1 OPEN; **53 commands** (NOT 51 or 54+); **21 settings** (NOT 11); 13 keybindings; ctrl+shift+a bound to 2 commands = guaranteed conflict; telemetry 0.1.0 fallback in 6 sites (NOT 3) across 3 files; gpt-5.5 fallback P1 is FALSE-POSITIVE (gpt-5.5 IS in models.json:42) |

---

## Appendix B — Memory file inventory

**POPULATED 2026-05-04** from docs reconciliation. Actual count = **45 files** in `~/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/` (memory's claim of 38 is wrong).

**Stale / wrong (need rewrite or archive):**

- `MEMORY.md` — 10+ corrections needed; see Appendix C
- `dual-store-root-cause.md` — 41 days old; auto-flagged stale by harness; web chat moved to `features/chat/` so root cause may be obsolete — verify or archive
- `web-search-tool-loop-needed.md` — likely superseded by web chat migration; verify or archive
- `ui-parity-audit-2026-03-26.md` — 39 days old; many gaps closed in coherence sprint; verify or archive
- `feedback-desktop-ux-gaps.md` — verify against current ChatInterface; archive if resolved
- `cli-audit-2026-05-03.md` — line 44 says "LMStudio NOT WIRED — no port 1234 references" — **WRONG**; LMStudio IS wired at `models.rs:133-139, :303`. Update or strike that line.

**Current (durable references — keep as-is):**

- `agent-architecture.md`, `anthropic-cookbook.md`, `claude-api-deep.md`, `claude-config-files.md`, `model-catalog.md`, `openai-api.md`, `rule-models-json.md`, `dev-methodology.md`, `release-pipeline.md`, `tauri-build-deploy.md`, `oauth-providers.md`, `skills-catalog.md`, `mobile-decisions.md`, `mobile-plan.md`, `desktop-onboarding-requirements.md`, `feedback-stop-building.md`, `web-chat-parity-directive.md`, `product-vision.md`, `user-hxf-app.md`
- All 12 `comp-*` competitor reference files (CURRENT — used as design north stars)
- `v1-2-0-release-state.md` (CURRENT — canonical for v1.2.x release status + APPLE\_\* gap)
- `cli-benchmarks.md` (CURRENT)

---

## Appendix C — Memory + SSOT correction patches

**POPULATED 2026-05-04.** Apply in a follow-up read-write sprint after this plan is approved.

### `MEMORY.md` patches

```
LINE 5
OLD: > Last refresh: 2026-05-03 (verified against current code via 9 parallel exploration agents).
NEW: > Last refresh: 2026-05-04 (verified by 6-surface ship-blocker audit; canonical findings at docs/plans/UNIFIED_LAUNCH_PLAN.md).

LINE 15-18 (replace block)
OLD: 25 providers (BYOK + Local + Hobby cloud + Pro/Max waitlist).
     ...
     1. **Multi-provider in one UI** — 25 providers, switch mid-conversation.
     2. **BYOK + Local LLM (Ollama wired; LMStudio NOT wired in CLI per audit 2026-05-03)**
NEW: 10+ Providers (canonical per apps/web/lib/marketing-constants.ts:15).
     ...
     1. **Multi-provider in one UI** — 10+ Providers (CLI ships 13 named: Anthropic, OpenAI, Google, Ollama×2, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, LMStudio at models.rs:287-304), switch mid-conversation.
     2. **BYOK + Local LLM (BOTH Ollama AND LMStudio wired in CLI at models.rs:133-139, :303).**

LINE 33 (apps/web row)
OLD: **UnifiedAgenticChat is a 141-file monolith** (still active here, vs commented out in desktop).
NEW: Live web chat is `apps/web/features/chat/` (183 files). UnifiedAgenticChat directory deleted from apps/web/. Desktop's apps/desktop/src/components/UnifiedAgenticChat/ is partially-dead — main chat lazy-import commented in App.tsx:153-155, but App.tsx:26,90,95 still import CommandPalette and SearchModal from it (live).

LINE 34 (apps/mobile row)
OLD: iOS bundle id `com.agiworkforce.app`, min iOS 12.0.
NEW: iOS bundle id `com.agiworkforce.app`, iOS min = 15.1 (SDK-derived from Expo, not declared in app.json).

LINE 35 (apps/cli row, three changes inline)
OLD: 8 providers wired in CLI (web/desktop = 25): Anthropic, OpenAI, Google, Ollama, Mistral, XAI, DeepSeek, OllamaCloud.
NEW: 13 providers wired in CLI (per models.rs:287-304): Anthropic, OpenAI, Google, Ollama (Local + Cloud), xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, LMStudio + Custom.

OLD (same line): Hooks: 23 events shipped (`hooks.rs:62-94`)
NEW: Hooks: 22 canonical event names (`hooks.rs:179-200`)

OLD (same line): 23+ modules `#[allow(dead_code)]`
NEW: ~6 modules with `#[allow(dead_code)]` retained (DEFER markers); deleted in Sprint A: cloud, sync, ecosystem, policy, project_registry, project_scope; ungated: sdk_io, skills, provider; shipped: init.

LINE 36 (apps/extension row)
OLD: 14 test suites (~200K LOC tests).
NEW: 12 test suites.

OLD (same line): dist/ + extension.zip (87K) ready.
NEW: dist/ exists; extension.zip is NOT built — add `pnpm --filter @agiworkforce/extension package` script before Chrome Web Store submission.

LINE 37 (apps/extension-vscode row)
OLD: v0.3.0. **54+ commands, 11 settings, 11 keybindings**.
NEW: v0.3.0. 53 commands, 21 settings, 13 keybindings.

OLD (same line): 13 providers, 30 source files.
NEW: 13 providers, 42 source files (29 non-test + 13 test).

LINE 65
OLD: - Mode picker: `apps/desktop/src/components/Onboarding/ModeSelectionDialog`.
NEW: - Mode picker: `apps/desktop/src/components/Onboarding/OnboardingWizard.tsx` (ModeSelectionDialog file does not exist; consolidated into OnboardingWizard).

LINES 70-72
OLD: `~/.claude/plans/make-a-plan-to-purrfect-papert.md` (master remediation, 6 sprints).
     `~/.claude/plans/sprint1-vault-rewire.md` (Sprint 1 detail: master password vault).
     `~/.claude/plans/cli-competitive-floor.md` (CLI vs Claude Code/Codex/OpenCode...)
NEW: `docs/plans/UNIFIED_LAUNCH_PLAN.md` (canonical, replaces the 5 prior plans listed in §8 of that file).

LINES 124-132 (Web Chat Status / Critical gap section)
DELETE entirely. ThinkingBlock IS wired at apps/web/features/chat/components/messages/MessageBubble.tsx:60, :402-413.

LINE 137
DELETE: 875 CLI tests green (now 1,848 per latest count) — superseded by 2,161.

LINES 157-160 (PENDING section)
DELETE entirely. All items done per ROADMAP.md:7 Wave 0 (2026-05-03).
```

### `AGI_WORKFORCE.md` patches

```
LINE 21 (CLI surface row)
OLD: Rust monolith, 195 .rs / 155,029 LOC, Ratatui TUI 125 files, 22 subcommands, 19 hook events, 914 tests, 10+ Providers
NEW: Rust monolith, 195 .rs / 155,029 LOC, Ratatui TUI 125 files, 22 subcommands, 22 hook events, 2,161 tests, 10+ Providers (13 named registrations: Anthropic, OpenAI, Google, Ollama×2, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, LMStudio)

LINE 26 (VS Code ext row)
OLD: v0.3.0, 54+ commands, @agi chat participant, 13 providers
NEW: v0.3.0, 53 commands, 21 settings, 13 keybindings, @agi chat participant, 13 providers
```

### `docs/PRICING.md` patches

```
LINE 10 (BYOK provider list — reconcile to actual)
OLD: Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Groq, Together, Fireworks, Perplexity, Azure, Bedrock, OpenRouter, AI21, SambaNova, Cohere — **10+ Providers**
NEW: Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, plus local Ollama and LMStudio — **10+ Providers** (matches apps/cli/src/models.rs:287-304 and apps/web/lib/marketing-constants.ts)

LINE 25
OLD: - **Mode picker**: `apps/desktop/src/components/Onboarding/ModeSelectionDialog`
NEW: - **Mode picker**: `apps/desktop/src/components/Onboarding/OnboardingWizard.tsx`
```

### `apps/cli/README.md` + `apps/cli/ARCHITECTURE.md` patches (visible to CLI users on GitHub)

```
apps/cli/README.md:33
OLD: 19 hook events
NEW: 22 hook events

apps/cli/README.md:34
OLD: ⚠️ tool-allowlist toggle (real plan mode in Phase 1)
NEW: ✅ real plan mode via `update_plan` tool (Codex pattern, shipped Sprint B4)

apps/cli/ARCHITECTURE.md:6
OLD: 115 crates / 110 excluded
NEW: 14 active workspace members; the 70 codex-rs port crates were deleted in Wave 0 (2026-05-03)
```

### `docs/ROADMAP.md` patches

```
LINE 67 (Wave 2 Week 1 task)
OLD: **Chat consolidation**: pick `packages/chat` as canonical. Migrate apps/web's 141-file UnifiedAgenticChat to use ChatInterface...
NEW: ~~**Chat consolidation**~~ — DONE per Wave 0. apps/web/components/UnifiedAgenticChat/ deleted; live web chat is apps/web/features/chat/ (183 files). Remaining: triage desktop's partially-dead apps/desktop/src/components/UnifiedAgenticChat/ (CommandPalette + SearchModal still imported).
```

### `docs/launch/show-hn.md` + `twitter.md` + `r-localllama.md` patches

```
Replace globally:
  914 tests        → 2,161 tests
  19 hook events   → 22 hook events
  gpt-5.4 (in example commands)  → consider gpt-5.5 (current default) or generic `<model>`
```

---

## Appendix E — Additional verifications (2026-05-04, beyond surface audits)

These were verified directly during the unified-plan synthesis pass. All read-only checks against current code.

### Backend / infra

| Check                        | Verified value                         | Source                                                                                                                                                            | Memory claim                                                                   | Status                         |
| ---------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| Supabase migrations          | 17 (Mar 8 → Mar 24, 2026)              | `supabase/migrations/`                                                                                                                                            | 17 ✓                                                                           | MATCHES                        |
| API gateway routes           | 15                                     | `services/api-gateway/src/routes/` (agents, auth, chat, cloudChat, credits, desktop, deviceAuth, dotfile, llm, mobile, models, pair, providerStream, sync, usage) | 14                                                                             | MEMORY OFF-BY-1                |
| Cargo workspace members      | 14 packages                            | `cargo metadata --no-deps`                                                                                                                                        | 12                                                                             | MEMORY OFF-BY-2                |
| Codex-rs port crates removed | **70** (per Cargo.toml:4-9 comment)    | `Cargo.toml` workspace comment                                                                                                                                    | "102" (ROADMAP.md:7) / "110" (MEMORY.md:42,158) — three sources, three numbers | RECONCILE NEEDED — truth is 70 |
| `cargo check --workspace`    | GREEN (verified 2026-05-03 per MEMORY) | last build                                                                                                                                                        | GREEN                                                                          | MATCHES                        |

### packages/chat (canonical chat package)

| Component     | Wired in `packages/chat/src/components/MessageBubble.tsx`? | Wired in `apps/web/features/chat/components/messages/MessageBubble.tsx`?                                            |
| ------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| ThinkingBlock | ✓                                                          | ✓ (`:60, :402-413`)                                                                                                 |
| WebSearchCard | ✓                                                          | **NOT WIRED** (file exists at `apps/web/features/chat/components/WebSearchCard.tsx` but no import in MessageBubble) |
| CitationPill  | ✓                                                          | **NOT WIRED** (same — file exists, not rendered)                                                                    |

**Action:** Either migrate `apps/web` to consume `@agiworkforce/chat` (Wave 2 task in ROADMAP.md, partially done) OR add the two missing imports to `apps/web/features/chat/components/messages/MessageBubble.tsx`. P2-grade since memory claim "ThinkingBlock not wired" is stale and the simpler fix is to wire the remaining two blocks. Total dead code today across web + desktop: `WebSearchCard.tsx` + `CitationPill.tsx` exist but only `packages/chat` actually renders them.

### `packages/types/src/models.json` (canonical model catalog)

| Field                                         | Value                    | Status                                                    |
| --------------------------------------------- | ------------------------ | --------------------------------------------------------- |
| `lastUpdated`                                 | `2026-05-04` (today)     | FRESH                                                     |
| `version`                                     | `1`                      | OK                                                        |
| `managed_cloud.taskRouting.code_generation`   | `deepseek-chat`          | current era                                               |
| `managed_cloud.taskRouting.complex_reasoning` | `claude-sonnet-4.6`      | current era                                               |
| `managed_cloud.taskRouting.chat`              | `gpt-5.4-mini`           | current era (consistent with `MEMORY.md` Era rule line 8) |
| `managed_cloud.taskRouting.vision`            | `gemini-3.1-pro-preview` | current era                                               |
| Catalog completeness                          | All providers populated  | OK                                                        |

`models.json` is healthy and serves as the SSOT for `rule-models-json.md`. The 11 model-id literal violations in §1 P0 #11 should all be remediated by a `getProviderDefaultModel()` helper backed by this file.

### Repo-root metadata for YC submission

| File               | Status                                                            | Action                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LICENSE`          | EXISTS — proprietary, "© 2026 AGI Workforce. All Rights Reserved" | OK; consistent with README.md:113-115                                                                                                                                                       |
| `BUILD.md`         | EXISTS                                                            | OK per README references                                                                                                                                                                    |
| `CONTRIBUTING.md`  | EXISTS                                                            | OK                                                                                                                                                                                          |
| `LICENSE-APACHE`   | **DOES NOT EXIST**                                                | `cli-competitive-floor.md` Sprint A3 proposed Apache-2.0 dual-license for the CLI (binary distribution). Not shipped. If OSS positioning is wanted for the YC narrative, this remains open. |
| `NOTICE`           | **DOES NOT EXIST**                                                | Same Sprint A3 — third-party attribution (`cargo about generate`) not produced. Open.                                                                                                       |
| `apps/cli/LICENSE` | unverified this pass                                              | Sprint A3 also proposed `apps/cli/LICENSE` copy.                                                                                                                                            |

**Decision-needed for YC narrative:** keep proprietary across the board OR dual-license the CLI as Apache-2.0 (matches Codex CLI's Apache-2.0 + provides patent grant). `cli-competitive-floor.md:19` proposed Apache-2.0 — never shipped. Add to §9 open questions.

### Sprint status reality check (per architecture-analysis-2026-05-04.md + this audit)

| Sprint                                                    | Plan file                                         | Status today                                                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave 0 cleanup                                            | ROADMAP.md:7 + MEMORY.md:42                       | SHIPPED 2026-05-03 (70 dead crates removed; not 102/110 as multiple docs claim)                                                                                                                                                                                           |
| Wave 1 CLI v1.0                                           | ROADMAP.md:14-29                                  | SHIPPED `v-cli-1.0.0`; 4/5 install paths live (`brew`, `install.sh`, `cargo install`, GitHub binaries); npm pending NPM_TOKEN secret                                                                                                                                      |
| Wave 2 Desktop v1.0                                       | docs/plans/wave2-desktop-v1.md                    | PARTIALLY shipped — v-desktop-1.2.0 is **Linux only** (Linux .AppImage + .deb + .rpm). macOS deferred to v1.2.1 (APPLE\_\* secrets); Windows deferred Q3 2026 (EV cert).                                                                                                  |
| Wave 3 Mobile + Ext + Web                                 | docs/plans/wave3-mobile-extensions-web.md         | NOT yet submitted to any store. Hobby tier code wired, Stripe price not configured.                                                                                                                                                                                       |
| Master remediation 6-sprint                               | ~/.claude/plans/make-a-plan-to-purrfect-papert.md | OBSOLETE — Sprint 0 (codex-rs port) abandoned; Sprint 1 (vault) mostly shipped (`master_password.rs:1-769`, 11 IPC commands); Sprint 4 partial; superseded by THIS document.                                                                                              |
| Sprint 1 vault rewire                                     | ~/.claude/plans/sprint1-vault-rewire.md           | MOSTLY SHIPPED — vault infrastructure done; only call-site rewire of `mcp_oauth.rs:1269` + `messaging.rs:71-237` + `supabase.ts` Tauri-routing remains. Demote to Phase 2.                                                                                                |
| CLI Phase 0+1 (decommission + MCP transports + plan mode) | ~/.claude/plans/cli-competitive-floor.md          | MOSTLY SHIPPED — 3 MCP transports + OAuth/PKCE shipped (`apps/cli/src/mcp/{mod.rs,sse.rs,http.rs,oauth_flow.rs}`); `update_plan` matches Codex; LMStudio shipped (corrects memory claim); plugin manifest discovery unverified this pass; Apache-2.0 license NOT shipped. |

---

## Appendix D — Inputs

- `~/.claude/plans/code-review-2026-05-03.md` — 6-agent cross-surface review, 11 P0 + 27 P1 + 23 P2 + 16 P3 = 77 findings
- `~/.claude/plans/architecture-analysis-2026-05-04.md` — 4-agent architecture deep-dive (desktop ≠ CLI parent; Cowork parity at 85%)
- Iteration 1 supervisor audit (this conversation) — 4 critical operational P0s + verified-foundations table
- Team gate-check (this conversation) — 7 named agents in team `agi-launch-audit`; docs agent Phase 1 complete; surface engineers in flight
- Direct verification by team-lead (this conversation) — 4 security P0s confirmed open at file:line; tier taxonomy confirmed RESOLVED; ModeSelectionDialog confirmed gone; recent commits checked

---

**END.** This document is canonical for AGI Workforce launch readiness as of 2026-05-04. Update via PR; do not duplicate. Wave-level tactical plans (`wave2-desktop-v1.md`, `wave3-mobile-extensions-web.md`) execute under the gates defined here.
