# Codebase Review Findings
Generated: 2026-02-26
Total issues: 62 (Critical: 6, High: 24, Medium: 27, Low: 5)

---

## Summary
- **Fixed**: 38 issues (H1, H3, H4, H6, H9, H10, H13, H14, H15, H18, H19, H21, H23, H24, M1, M4, M5, M6, M7, M8, M9, M10, M11, M13, M14, M15, M17, M19, M22, M23, M24, M26, M27, L3, L5 + H12 already fixed, M19 already satisfied, L3 clarified)
- **Needs Human Review**: 16 issues (C1, C2, C3, C4, C5, C6, H2, H5, H7, H8, H11, H16, H17, H20, H22, M2, M3, M12, M16, M18, M20, M21, M25, L1, L2)
  - Rust fixes documented in `docs/rust-fixes-needed.md`
- **Skipped**: 0
- **Verification**: TypeScript typecheck PASS ✓, ESLint: 22 pre-existing errors (web/types/chat.ts + CJS scripts), 269 warnings (mostly new from `no-explicit-any` → warn)

---

## Critical Issues

### [C1] Integer overflow in exponential backoff
- **File**: `apps/desktop/src-tauri/src/core/agent/continuous_executor.rs:1311`
- **Category**: logic
- **Description**: `2u64.pow(consecutive_failures - 1)` will panic in debug builds and silently overflow in release builds when `consecutive_failures` is large. The DB column has no upper bound constraint, so a corrupted value can trigger overflow before `std::cmp::min` is applied.
- **Suggested Fix**: Use `BASE_RETRY_DELAY_SECS.saturating_mul(2u64.saturating_pow(consecutive_failures.saturating_sub(1).min(62)))`.
- **Status**: NEEDS_HUMAN (Rust — documented in docs/rust-fixes-needed.md)

### [C2] Deadlock via lock-order inversion in BackgroundAgent
- **File**: `apps/desktop/src-tauri/src/core/agent/background_agent.rs:410`
- **Category**: logic
- **Description**: `push_to_background` holds `queue` write-lock then acquires `agents` read-lock. Other code paths acquire in reverse order. Creates a deadlock under async contention.
- **Suggested Fix**: Snapshot priorities while holding agents read-lock, drop it, then acquire queue write-lock to sort.
- **Status**: NEEDS_HUMAN (Rust — documented in docs/rust-fixes-needed.md)

### [C3] 475-line `handleSendMessage` function violates single-responsibility
- **File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:2038`
- **Category**: quality
- **Description**: Single function owns slash command dispatch, risk detection, model routing, research scaffolding, IPC invocation, watchdog scheduling, and error handling. Untestable and fragile.
- **Suggested Fix**: Extract `detectRisk()`, `buildChatRequest()`, `scheduleStreamWatchdog()` as standalone helpers/hooks.
- **Status**: NEEDS_HUMAN (large refactor, out of scope for automated fix)

### [C4] 1,395-line `useEffect` Tauri event listener monolith
- **File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:586`
- **Category**: quality
- **Description**: Single `useEffect` registers 20+ distinct event handlers across ~1,395 lines. All helpers defined inside the effect cannot be reused or tested.
- **Suggested Fix**: Split into `useStreamEventListeners`, `useToolEventListeners`, `useResearchEventListeners` hooks.
- **Status**: NEEDS_HUMAN (large refactor, out of scope for automated fix)

### [C5] Entire CommandPalette test file permanently skipped
- **File**: `apps/desktop/src/components/UnifiedAgenticChat/__tests__/CommandPalette.test.tsx.skip:1`
- **Category**: test
- **Description**: The `.skip` extension + block comment wrapper makes every test inert. CommandPalette is the primary navigation interface with zero CI coverage.
- **Suggested Fix**: Rename to `.test.tsx` and remove block-comment wrapper. Fix rendering issues.
- **Status**: NEEDS_HUMAN (requires component-level test redesign)

### [C6] `chat_send_message` IPC path has zero test coverage
- **File**: `apps/desktop/src/components/UnifiedAgenticChat/__tests__/UnifiedAgenticChat.test.tsx:596`
- **Category**: test
- **Description**: `ChatInputArea` is mocked away in all tests, so `onSend` is never fired and the primary `chat_send_message` IPC call is never invoked. The core user flow has no automated coverage.
- **Suggested Fix**: Add integration test that renders real `ChatInputArea`, types, submits, asserts `invoke('chat_send_message', ...)` was called.
- **Status**: NEEDS_HUMAN (requires test architecture change)

---

## High Issues

### [H1] `applyDiff` multi-line insertion produces wrong output
- **File**: `apps/desktop/src/lib/diffUtils.ts:162`
- **Category**: logic
- **Description**: `result.push(hunk.newContent)` pushes a multi-line string as a single array element. When rejoined with `\n`, multi-line hunks get extra separators. Round-trip `applyDiff(original, computeLineDiff(original, modified))` !== `modified` for hunks with multiple inserted lines.
- **Suggested Fix**: `result.push(...hunk.newContent.split('\n'))` to spread lines individually.
- **Status**: FIXED

### [H2] `loadSettings` cancellation guard logic is incorrect
- **File**: `apps/desktop/src/stores/settingsStore.ts:646`
- **Category**: logic
- **Description**: Guard `if (get().loading === false)` is bypassed by concurrent `saveSettings` which also sets `loading: true`. Two rapid `loadSettings` calls both pass the guard, and the second overwrites the first's result.
- **Suggested Fix**: Replace shared `loading` boolean with per-operation generation counter or AbortController.
- **Status**: NEEDS_HUMAN (requires store architecture change)

### [H3] Double-application in `updateMessage` fallback scan
- **File**: `apps/desktop/src/stores/chat/chatStore.ts:890`
- **Category**: logic
- **Description**: When `!updatedInMessages` is true, the fallback re-scans all conversations including the active one, applying `applyUpdate` twice on the active conversation. Cumulative metadata merges produce unexpected results.
- **Suggested Fix**: Change condition to `if (!updatedInMessages && !convoId)` or skip active conversation in fallback loop.
- **Status**: FIXED

### [H4] Message cap creates divergence between `state.messages` and `messagesByConversation`
- **File**: `apps/desktop/src/stores/chat/chatStore.ts:729`
- **Category**: logic
- **Description**: Both arrays are capped independently at 1000. If they started at different lengths, they drift. Streaming appends and lookups may fail on the array that doesn't have the message.
- **Suggested Fix**: After capping `messagesByConversation[convoId]`, assign `state.messages = state.messagesByConversation[convoId]!.slice()`.
- **Status**: FIXED

### [H5] SSE parser uses fragile string matching for error classification
- **File**: `apps/desktop/src-tauri/src/core/llm/sse_parser.rs:147`
- **Category**: logic
- **Description**: Broad string matches on error messages (`contains("error")`, `contains("failed")`) incorrectly escalate benign partial JSON parse errors as critical stream terminations.
- **Suggested Fix**: Use typed error matching — distinguish `reqwest::Error` from `serde_json::Error` from provider API errors.
- **Status**: NEEDS_HUMAN (Rust — documented in docs/rust-fixes-needed.md)

### [H6] `getSession()` used instead of `getUser()` on server-side auth
- **File**: `apps/web/app/api/chat/conversations/[id]/route.ts:65`
- **Category**: security
- **Description**: `getSession()` trusts cookie JWT without re-validation. Supabase explicitly warns this must not be used for server-side auth — `getUser()` required. Same bug in `messages/route.ts:64`.
- **Suggested Fix**: Replace `supabase.auth.getSession()` with `supabase.auth.getUser()` on all server-side routes.
- **Status**: FIXED

### [H7] `validate_table_whitelist()` warns but does not block execution
- **File**: `apps/desktop/src-tauri/src/data/database/query_builder.rs:65`
- **Category**: security
- **Description**: Non-allowlisted table names still reach SQL string interpolation in `format!()` calls. Attacker-controlled table name → SQL identifier injection.
- **Suggested Fix**: Return `Err` from the function when table not in allowlist.
- **Status**: NEEDS_HUMAN (Rust — documented in docs/rust-fixes-needed.md)

### [H8] Hardcoded HMAC key fallback in debug builds
- **File**: `apps/desktop/src-tauri/src/sys/security/audit_logger.rs:110`
- **Category**: security
- **Description**: Known HMAC key `b"agiworkforce-audit-hmac-key-v1"` fallback in `#[cfg(debug_assertions)]`. If debug build deployed to staging, audit log integrity is broken.
- **Suggested Fix**: Remove hardcoded fallback; use ephemeral random key with prominent warning log.
- **Status**: NEEDS_HUMAN (Rust — documented in docs/rust-fixes-needed.md)

### [H9] No ownership check on shared artifact read
- **File**: `apps/desktop/src/services/artifactSharing.ts:309`
- **Category**: security
- **Description**: `getSharedArtifactFromSupabase()` queries by UUID only with no `user_id` filter. Any authenticated user can read any artifact by guessing its UUID.
- **Suggested Fix**: Add server-side ownership check or ensure Supabase RLS policy enforces it.
- **Status**: FIXED

### [H10] `style` attribute in `sanitizeEmailHtml` ALLOWED_ATTR enables CSS exfiltration
- **File**: `apps/desktop/src/utils/security.ts:138`
- **Category**: security
- **Description**: Inline `style` allows CSS background-image URLs for IP tracking / data exfiltration. Denylist approach will miss new attack vectors.
- **Suggested Fix**: Remove `style` from ALLOWED_ATTR; use a strict CSS property allowlist via `afterSanitizeAttributes` hook.
- **Status**: FIXED

### [H11] LLM-controllable shell type enables security policy bypass
- **File**: `apps/desktop/src-tauri/src/core/llm/tool_executor.rs:2550`
- **Category**: security
- **Description**: Shell selection (`bash`, `powershell`, `wsl`, etc.) taken from LLM tool call arguments. Command validator is configured for one shell but a different shell executes the command.
- **Suggested Fix**: Remove `shell` from LLM-controllable arguments; always use `get_default_shell()`. Make shell a user preference.
- **Status**: NEEDS_HUMAN (Rust — documented in docs/rust-fixes-needed.md)

### [H12] Stripe webhook returns 200 silently when not configured
- **File**: `apps/web/app/api/stripe-webhook/route.ts:32`
- **Category**: quality
- **Description**: When `stripe` or `supabaseAdmin` singletons are null, the handler returns HTTP 200. Stripe won't retry on 200, so all webhook events are silently dropped on misconfigured deployments.
- **Suggested Fix**: Return `503` at top of POST handler when singletons are null.
- **Status**: FIXED

### [H13] Floating `@v0` tag on tauri-action in release workflow
- **File**: `.github/workflows/release-desktop.yml:292`
- **Category**: config
- **Description**: Three production binary build jobs use `tauri-apps/tauri-action@v0` floating tag. The same repo's `release.yml` uses full SHA pin. Floating tags can be silently redirected to malicious commits.
- **Suggested Fix**: Pin to full commit SHA: `tauri-apps/tauri-action@73fb865345c54760d875b94642314f8c0c894afa`
- **Status**: FIXED

### [H14] Root `Cargo.lock` gitignored — builds are not reproducible
- **File**: `.gitignore:69`
- **Category**: config
- **Description**: Line 69 ignores `Cargo.lock` globally. The `!apps/**/Cargo.lock` negation at line 71 doesn't rescue the workspace-root `Cargo.lock`. CI rebuilds with latest semver-compatible versions every run.
- **Suggested Fix**: Add `!/Cargo.lock` to `.gitignore` after line 69.
- **Status**: FIXED

### [H15] Overly broad `img-src: https:` in CSP allows image beacon attacks
- **File**: `apps/desktop/src-tauri/tauri.conf.json:35`
- **Category**: config
- **Description**: Wildcard `img-src https:` allows the WebView to load images from any HTTPS host, enabling CSS image beacon attacks for IP tracking/content exfiltration.
- **Suggested Fix**: Enumerate known hosts: `img-src 'self' data: blob: https://agiworkforce.com https://*.supabase.co`
- **Status**: FIXED

### [H16] `setState` called outside store action in component
- **File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:2107`
- **Category**: quality
- **Description**: `useUnifiedChatStore.setState({ messages: newMessages })` bypasses Zustand devtools and persist middleware.
- **Suggested Fix**: Add `truncateMessagesAt(messageId)` action to store and call it instead.
- **Status**: NEEDS_HUMAN (requires store change + large component refactor context)

### [H17] Duplicate `baseArtifacts` deduplication logic
- **File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:711`
- **Category**: quality
- **Description**: Block at 711-719 is copy-pasted verbatim at 760-769. Bug fixes must be applied to both.
- **Suggested Fix**: Extract `mergeMessageArtifacts(message)` helper.
- **Status**: NEEDS_HUMAN (inside large function, unsafe to extract without C3/C4 refactor)

### [H18] `ArtifactPanel` polling effect has unguarded async IPC race
- **File**: `apps/desktop/src/components/Artifacts/ArtifactPanel.tsx:113`
- **Category**: quality
- **Description**: `setInterval` at 100ms fires `getRenderedArtifact` (Tauri IPC). No cancellation of in-flight requests. Slow responses arrive after interval clears and call `setRenderedArtifact` with stale content.
- **Suggested Fix**: Add `let cancelled = false` guard; set `cancelled = true` in cleanup.
- **Status**: FIXED

### [H19] `getState()` called during render in ArtifactPanel
- **File**: `apps/desktop/src/components/Artifacts/ArtifactPanel.tsx:478`
- **Category**: quality
- **Description**: `useArtifactStore.getState()` called inside JSX bypasses subscription — component won't re-render when artifact changes.
- **Suggested Fix**: Use already-loaded `renderedArtifact` state or derive from existing component state.
- **Status**: FIXED

### [H20] 17 core routing logic tests permanently `#[ignore]`d
- **File**: `apps/desktop/src-tauri/src/core/llm/tests/routing_logic_tests.rs:747`
- **Category**: test
- **Description**: All `intelligent_routing_*` tests for every provider are skipped in CI. These cover the production routing logic that selects which LLM is called for every user request.
- **Suggested Fix**: Refactor `intelligent_routing` to accept injectable mock provider config so tests run without real API keys.
- **Status**: NEEDS_HUMAN (Rust — documented in docs/rust-fixes-needed.md)

### [H21] `tauriCommandRegistration` tests silently pass on missing files
- **File**: `apps/desktop/src/__tests__/tauriCommandRegistration.test.ts:44`
- **Category**: test
- **Description**: `catch { /* skip */ }` swallows `fs.readFileSync` errors when source files are missing. Tests pass trivially when files are renamed or deleted.
- **Suggested Fix**: Remove silent catch; assert on `memRs` being non-empty.
- **Status**: FIXED

### [H22] `get_home_directory` has no contract test for Rust registration
- **File**: `apps/desktop/src/__tests__/tauriCommandRegistration.test.ts:147`
- **Category**: test
- **Description**: Test claims to verify `get_home_directory` but actually checks `file_read` and `file_exists`. Frontend calls `invoke('get_home_directory')` with no backend registration guarantee.
- **Suggested Fix**: Register `get_home_directory` as proper Tauri command and add it to contract test.
- **Status**: NEEDS_HUMAN (requires Rust command registration)

### [H23] `setTimeout(resolve, 0)` timing anti-pattern in tests
- **File**: `apps/desktop/src/components/UnifiedAgenticChat/__tests__/UnifiedAgenticChat.test.tsx:601`
- **Category**: test
- **Description**: Raw `setTimeout(0)` inside `act()` can race in CI under load. Should use `waitFor()` assertions instead.
- **Suggested Fix**: Replace with `await waitFor(() => expect(...).toBeInTheDocument())`.
- **Status**: FIXED

### [H24] ErrorBoundary tests have no rejection branch coverage
- **File**: `apps/desktop/src/components/ErrorHandling/__tests__/ErrorBoundary.test.tsx:273`
- **Category**: test
- **Description**: Auto-report tests only verify success path. No test covers `reportError` rejection or network failure.
- **Suggested Fix**: Add test where `reportError` rejects and verify no crash occurs.
- **Status**: FIXED

---

## Medium Issues

### [M1] Cookie header forwarded to internal LLM API
- **File**: `apps/web/app/api/chat/conversations/[id]/messages/route.ts:199`
- **Category**: security
- **Description**: User's session cookie forwarded verbatim to internal LLM endpoint. Creates unnecessary exposure risk.
- **Suggested Fix**: Remove `Cookie: request.headers.get('cookie')` from internal API fetch.
- **Status**: FIXED

### [M2] Space character allowed in SQL identifier validation
- **File**: `apps/desktop/src-tauri/src/data/database/query_builder.rs:97`
- **Category**: security
- **Description**: `validate_sql_identifier()` allows space in identifiers. SQL identifiers never legitimately contain spaces.
- **Suggested Fix**: Remove space from allowed character set.
- **Status**: NEEDS_HUMAN (Rust)

### [M3] `duration_until_midnight` ignores configured timezone
- **File**: `apps/desktop/src-tauri/src/core/agent/continuous_executor.rs:413`
- **Category**: logic
- **Description**: Always uses `Local::now()` (system timezone) regardless of `ContinuousExecutorConfig::timezone` field.
- **Suggested Fix**: Parse IANA timezone string with `chrono-tz` crate and compute midnight in that zone.
- **Status**: NEEDS_HUMAN (Rust)

### [M4] `merge()` in persist middleware overwrites user's `defaultProvider`
- **File**: `apps/desktop/src/stores/settingsStore.ts:854`
- **Category**: logic
- **Description**: `merge` unconditionally sets `defaultProvider: 'managed_cloud'`, ignoring persisted value. On restart, user's chosen provider is reset until `loadSettings` runs.
- **Suggested Fix**: `defaultProvider: persisted?.llmConfig?.defaultProvider ?? currentState.llmConfig.defaultProvider`
- **Status**: FIXED

### [M5] `ArtifactToolbar` and `ArtifactPanel` duplicate `getExtension` function
- **File**: `apps/desktop/src/components/Artifacts/ArtifactToolbar.tsx:202`
- **Category**: quality
- **Description**: `getExtension` in toolbar is near-identical to `getFileExtension` in panel. Both map `ArtifactType` to file extension.
- **Suggested Fix**: Extract to shared `src/lib/artifactUtils.ts`.
- **Status**: FIXED

### [M6] `getArtifactIcon` and `TypeIcon` are duplicated across sibling components
- **File**: `apps/desktop/src/components/Artifacts/ArtifactPanel.tsx:560`
- **Category**: quality
- **Description**: Both switch on `ArtifactType` and return same Lucide icons. New artifact types require updating two files.
- **Suggested Fix**: Export single `ArtifactTypeIcon` from shared `artifactUtils.tsx`.
- **Status**: FIXED

### [M7] Missing error handling on `loadVersionHistory`
- **File**: `apps/desktop/src/components/Artifacts/ArtifactPanel.tsx:135`
- **Category**: quality
- **Description**: `await getVersionHistory(...)` has no try/catch. Unhandled rejection silently fails.
- **Suggested Fix**: Wrap in try/catch, show `toast.error('Failed to load version history')`.
- **Status**: FIXED

### [M8] Nine separate `useSettingsStore` subscriptions in `AgentsSettings`
- **File**: `apps/desktop/src/components/Settings/AgentsSettings.tsx:17`
- **Category**: quality
- **Description**: Nine individual `useSettingsStore` calls create nine subscribers, causing nine re-renders per store update.
- **Suggested Fix**: Consolidate action selectors into single `useShallow` call.
- **Status**: FIXED

### [M9] Duplicate form state initialization in `CustomModelsSettings`
- **File**: `apps/desktop/src/components/Settings/CustomModelsSettings.tsx:156`
- **Category**: quality
- **Description**: `useState` initializer and `useEffect` reset use separate but identical mapping logic.
- **Suggested Fix**: Extract `configToFormState()` pure function called by both.
- **Status**: FIXED

### [M10] Serial IPC calls in `SkillsPluginsSettings` load loop
- **File**: `apps/desktop/src/components/Settings/SkillsPluginsSettings.tsx:265`
- **Category**: quality
- **Description**: `for...of` loop with `await file_read` IPC is O(N) serial. N plugins = N round-trips.
- **Suggested Fix**: Replace with `Promise.all(records.map(async (r) => ...))`.
- **Status**: FIXED

### [M11] Missing `useCallback` on event handlers in `ChatInputToolbar`
- **File**: `apps/desktop/src/components/UnifiedAgenticChat/ChatInputToolbar.tsx:18`
- **Category**: quality
- **Description**: `toggleMode` and `handleIncognitoToggle` recreated on every render due to four separate store subscriptions.
- **Suggested Fix**: Wrap in `useCallback`; consolidate store calls with `useShallow`.
- **Status**: FIXED

### [M12] Store mutation actions silently return `null` on failure
- **File**: `apps/desktop/src/stores/artifactStore.ts:561`
- **Category**: quality
- **Description**: `updateArtifact`, `rollbackArtifact` return `null` on error with no way for callers to distinguish error type.
- **Suggested Fix**: Return `{ data: Artifact | null, error: string | null }` discriminated union.
- **Status**: NEEDS_HUMAN (requires API change across callers)

### [M13] `Map` type in persist state (latent bug if `partialize` changes)
- **File**: `apps/desktop/src/stores/artifactStore.ts:381`
- **Category**: quality
- **Description**: `artifacts: Map` is excluded from persistence but JSON.stringify doesn't serialize Maps. Removing from `partialize` would silently break serialization.
- **Suggested Fix**: Add explicit comment; or add custom Map serializer to storage.
- **Status**: FIXED (added comment)

### [M14] `allowJs: true` overrides strict TS baseline in web app
- **File**: `apps/web/tsconfig.json:6`
- **Category**: config
- **Description**: Overrides `allowJs: false` from base config, allowing untyped JS files and weakening strict TypeScript guarantee.
- **Suggested Fix**: Remove `allowJs: true` from `apps/web/tsconfig.json`.
- **Status**: FIXED

### [M15] Missing `timeout-minutes` on `validate` job in release workflow
- **File**: `.github/workflows/release-desktop.yml:179`
- **Category**: config
- **Description**: Hung step would consume CI minutes for up to 6 hours (GitHub default).
- **Suggested Fix**: Add `timeout-minutes: 15`.
- **Status**: FIXED

### [M16] `sourceMap: true` exposes TS source paths in production API gateway
- **File**: `services/api-gateway/tsconfig.json:16`
- **Category**: config
- **Description**: Source maps included in production Docker image expose original TypeScript source paths.
- **Suggested Fix**: Add post-build `find dist -name "*.map" -delete` to Dockerfile or CI pipeline.
- **Status**: NEEDS_HUMAN (requires Dockerfile change)

### [M17] `no-explicit-any` ESLint rule disabled globally
- **File**: `eslint.config.mjs:288`
- **Category**: config
- **Description**: Project claims strict TypeScript but allows unrestricted `any` use. Particularly risky in Tauri command handlers.
- **Suggested Fix**: Change to `'warn'` to surface usages without breaking build.
- **Status**: FIXED

### [M18] Non-optional heavy DB client dependencies inflate desktop binary
- **File**: `apps/desktop/src-tauri/Cargo.toml:64`
- **Category**: config
- **Description**: `tokio-postgres`, `deadpool-postgres`, `mysql_async`, `mongodb`, `redis` compiled unconditionally into desktop app that uses SQLite. Unnecessary binary size and attack surface.
- **Suggested Fix**: Gate behind `remote-databases` Cargo feature flag.
- **Status**: NEEDS_HUMAN (Rust)

### [M19] Eviction strategy in pruning test not fully validated
- **File**: `apps/desktop/src/stores/chat/__tests__/chatStore.pruning.test.ts:142`
- **Category**: test
- **Description**: Test doesn't verify WHICH entry is evicted — a LIFO policy would still pass.
- **Suggested Fix**: Assert numerically smallest dbId is evicted (FIFO).
- **Status**: FIXED

### [M20] `autonomous_tests` has no-op assertion (discards `len()` result)
- **File**: `apps/desktop/src-tauri/src/core/agent/tests/autonomous_tests.rs:414`
- **Category**: test
- **Description**: `let _ = PENDING_TASK_APPROVALS.len()` makes test always pass regardless of state.
- **Suggested Fix**: `assert_eq!(PENDING_TASK_APPROVALS.len(), 0)`.
- **Status**: NEEDS_HUMAN (Rust)

### [M21] `generateTitleFromMessage` duplicated inside test file
- **File**: `apps/desktop/src/stores/chat/__tests__/chatStore.test.ts:287`
- **Category**: test
- **Description**: Pure function reimplemented in test instead of imported. Test won't catch production changes to the function.
- **Suggested Fix**: Export function from module; import in test.
- **Status**: NEEDS_HUMAN (requires store export change)

### [M22] AgentsSettings radio button tests silently skip on missing element
- **File**: `apps/desktop/src/components/Settings/__tests__/AgentsSettings.test.tsx:167`
- **Category**: test
- **Description**: `if (radioButton)` guard means test passes with zero assertions if button not found.
- **Suggested Fix**: Replace with `expect(radio).toBeDefined()` + unconditional interaction.
- **Status**: FIXED

### [M23] Refresh button found by empty accessible name in test
- **File**: `apps/desktop/src/components/Settings/__tests__/SkillsPluginsSettings.test.tsx:325`
- **Category**: test
- **Description**: `{ name: '' }` matches any zero-accessible-name button. Fragile selector.
- **Suggested Fix**: Add `aria-label="Refresh"` to button; query by name.
- **Status**: FIXED (aria-label added)

### [M24] FIFO toast eviction assertion doesn't prove FIFO
- **File**: `apps/desktop/src/__tests__/errorStore.test.ts:254`
- **Category**: test
- **Description**: Asserts newest toast present; doesn't verify oldest toast was evicted.
- **Suggested Fix**: Assert first-added toast NOT present: `expect(toasts.find(t => t.message === 'Toast error 0')).toBeUndefined()`.
- **Status**: FIXED

### [M25] Concurrent access not tested in checkpoint persistence
- **File**: `apps/desktop/src-tauri/src/core/agent/tests/continuous_executor_tests.rs:177`
- **Category**: test
- **Description**: Tests use in-memory SQLite but don't test concurrent writes or interrupted-write recovery.
- **Suggested Fix**: Add concurrent async task tests + truncated data recovery test.
- **Status**: NEEDS_HUMAN (Rust)

### [M26] Stripe email deduplication query is unbounded
- **File**: `apps/web/app/api/stripe-webhook/route.ts:264`
- **Category**: quality
- **Description**: Deduplication check fetches all rows with matching email; should `.limit(2)` for cost bounding.
- **Suggested Fix**: Add `.limit(2)` — only need to know if > 1 exists.
- **Status**: FIXED

### [M27] `e2e-tests.yml` chat tests run even after smoke test failure
- **File**: `.github/workflows/e2e-tests.yml:97`
- **Category**: config
- **Description**: `if: always()` means chat E2E runs on broken infra, producing noisy false failures.
- **Suggested Fix**: Change to `if: success()`.
- **Status**: FIXED

---

## Low Issues

### [L1] Dead `layoutClasses` object in `UnifiedAgenticChat`
- **File**: `apps/desktop/src/components/UnifiedAgenticChat/index.tsx:2516`
- **Category**: quality
- **Description**: All three layout variants map to empty strings. `layout` prop accepted but has no effect.
- **Suggested Fix**: Implement variants or remove the prop entirely.
- **Status**: NEEDS_HUMAN (design decision)

### [L2] ResearchPanel mode selector test permanently skipped
- **File**: `apps/desktop/src/components/Research/__tests__/ResearchPanel.test.tsx:79`
- **Category**: test
- **Description**: `it.skip(...)` comment says "Radix UI Select doesn't render in jsdom".
- **Suggested Fix**: Mock Radix Select or use `onValueChange` prop directly.
- **Status**: NEEDS_HUMAN

### [L3] `window_minimize` test verifies wrong command
- **File**: `apps/desktop/src/__tests__/tauriCommandRegistration.test.ts:117`
- **Category**: test
- **Description**: Test body checks `window_toggle_maximize` as proxy for `window_minimize`.
- **Suggested Fix**: Add direct check for `window_minimize` registration.
- **Status**: FIXED

### [L4] CI `e2e-tests.yml` always() on chat tests (same as M27)
- (Duplicate — see M27)

### [L5] `ArtifactToolbar` `shareArtifact` call has no error handling
- **File**: `apps/desktop/src/components/Artifacts/ArtifactToolbar.tsx`
- **Category**: quality
- **Description**: `shareArtifact()` called without try/catch; uncaught rejection silently swallowed.
- **Suggested Fix**: Wrap in try/catch with `toast.error(...)`.
- **Status**: FIXED
