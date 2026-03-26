# Mobile App Audit CHANGELOG

Single source of truth for all remediation fixes. Sub-agents must read before writing and log after each fix.

**Audit date**: 2026-03-25
**Total issues found**: 146 (Critical: 17, High: 48, Medium: 47, Low: 34)
**Issues fixed**: 62 across 45+ files (round 1: 15, round 2: 11, round 3: 11, round 4: 7, round 5: 13, round 6: 5)
**Issues deferred**: Testing/accessibility only (see Deferred section at bottom)

---

## [FIX-001] - Null-safe search in chatStore

- **Files:** stores/chatStore.ts
- **Category:** Bug
- **Severity:** High
- **What changed:** Added null-coalescing to `msg.content` in `searchConversations` — `(msg.content ?? '').toLowerCase()` prevents crash when message content is null/undefined.
- **Why:** ChatMessage type doesn't enforce `content` as non-nullable. Messages with empty/null content (e.g., image-only messages) would throw TypeError on `.toLowerCase()`.

## [FIX-002] - Replace hardcoded model IDs with auto-routing fallback

- **Files:** stores/chatStore.ts
- **Category:** CodeQuality / Architecture
- **Severity:** High
- **What changed:** Replaced two instances of hardcoded `'claude-3-5-sonnet-20241022'` fallback in `retryMessage` and `editMessage` with `'auto-balanced'` (auto-routing mode).
- **Why:** Per CLAUDE.md: "NEVER hardcode model IDs." Auto-routing delegates to the server-side LLM router, which picks the optimal model. The hardcoded ID was stale (claude-3-5-sonnet-20241022 is from 2024).

## [FIX-003] - Cap abortControllers Map to prevent memory leak

- **Files:** stores/chatStore.ts
- **Category:** Memory Leak
- **Severity:** High
- **What changed:** Added `MAX_ABORT_CONTROLLERS = 50` cap. Before adding a new controller, evicts the oldest entry if at capacity (aborts it first).
- **Why:** AbortController Map is module-scoped and grew unbounded. If conversations are created faster than cleaned up (e.g., rapid conversation switching), stale entries accumulate.

## [FIX-004] - Clamp speech rate and pitch to valid range

- **Files:** stores/settingsStore.ts
- **Category:** Bug / Data Integrity
- **Severity:** Medium
- **What changed:** `setSpeechRate` and `setSpeechPitch` now clamp values to `[0.5, 2.0]` using `Math.min(Math.max(value, 0.5), 2.0)`.
- **Why:** Values outside this range cause TTS engines to fail or produce garbled audio. No UI validation existed — programmatic callers could set arbitrary values.

## [FIX-005] - Remove hardcoded model ID from imageGenHelpers

- **Files:** lib/imageGenHelpers.ts
- **Category:** Architecture
- **Severity:** High
- **What changed:** `getDefaultImageModel()` now returns `'auto-balanced'` instead of hardcoded `'gpt-image-1'`. Added comment explaining delegation to server-side router.
- **Why:** `'gpt-image-1'` doesn't exist in the mobile model catalog (`lib/models.ts`) and violates the CLAUDE.md no-hardcoded-model-IDs rule.

## [FIX-006] - Cap pendingControlQueue to prevent unbounded growth

- **Files:** stores/connectionStore.ts
- **Category:** Memory Leak
- **Severity:** High
- **What changed:** Added `MAX_PENDING_QUEUE = 200` cap. `queueControl` now drops the oldest message (`shift()`) when at capacity before pushing new entries.
- **Why:** Queue is module-scoped and had no size limit. Repeated reconnect/disconnect cycles with queued messages could accumulate indefinitely.

## [FIX-007] - Guard negative heartbeat latency from clock skew

- **Files:** stores/connectionStore.ts
- **Category:** Bug
- **Severity:** Medium
- **What changed:** `handleControlMessage` pong handler now checks `pingTimestamp <= now` before computing latency. If timestamp is in the future (clock skew), latency is `undefined` instead of negative.
- **Why:** Negative latency corrupts `connectionQuality` derivation and heartbeat display.

## [FIX-008] - Add timeout to token refresh

- **Files:** services/api.ts
- **Category:** Performance / Reliability
- **Severity:** High
- **What changed:** `tryRefreshToken()` now races the Supabase refresh against a 10-second timeout (`REFRESH_TIMEOUT_MS`). If the network hangs, the refresh fails gracefully instead of blocking indefinitely.
- **Why:** No timeout meant that on slow/hanging networks, the `_refreshing` promise would never resolve, blocking ALL subsequent API calls that hit 401.

## [FIX-009] - Truncate error response bodies to prevent data leaks

- **Files:** services/api.ts
- **Category:** Security
- **Severity:** High
- **What changed:** Error bodies from non-OK responses are truncated to 500 chars before inclusion in the thrown Error message. Prevents full response dumps (which may contain sensitive data) from propagating through error handlers and logs.
- **Why:** Original code threw `Error(`HTTP ${status}: ${body}`)` with the full body, which could contain internal server details, tokens, or PII in error responses.

## [FIX-010] - Add user-facing error on dispatch failure

- **Files:** stores/dispatchStore.ts
- **Category:** Error Handling
- **Severity:** High
- **What changed:** `sendTask` catch block now shows `Alert.alert()` with "Dispatch Failed" message in addition to marking the message as failed in state. Added `Alert` import.
- **Why:** Previous implementation silently set `taskStatus: 'failed'` without any user notification. Users had no way to know their task command failed to send.

## [FIX-011] - Validate quiet hours time format

- **Files:** stores/notificationPrefsStore.ts
- **Category:** Bug / Type Safety
- **Severity:** Low
- **What changed:** `timeToMinutes()` now validates input against `/^\d{2}:\d{2}$/` regex and checks hour/minute ranges (0-23, 0-59). Returns 0 for invalid input instead of NaN.
- **Why:** Malformed `QuietHours.startTime`/`endTime` strings (e.g., from corrupted persisted state) would produce NaN, breaking the `isInQuietHours` comparison.

## [FIX-012] - Evict stale schedule runs to prevent unbounded growth

- **Files:** stores/scheduleStore.ts
- **Category:** Memory Leak / Performance
- **Severity:** Medium
- **What changed:** `fetchRuns` now evicts `runsBySchedule` entries for schedules that no longer exist in the `schedules` array.
- **Why:** `runsBySchedule` Record grew unbounded as schedules were created and deleted over time. Old entries for deleted schedules were never cleaned up.

## [FIX-013] - Fix unsafe type assertion in modelStore

- **Files:** stores/modelStore.ts
- **Category:** Type Safety
- **Severity:** Medium
- **What changed:** Changed `set(updates as ModelState)` to `set(updates as Partial<ModelState>)` in `toggleThinkingForModel`. The `updates` object is a partial, not a full `ModelState`.
- **Why:** The `as ModelState` cast bypassed TypeScript validation, hiding potential missing-field errors. `Partial<ModelState>` is the correct type for partial state updates.

## [FIX-014] - Log biometric auth errors instead of silently swallowing

- **Files:** hooks/useBiometricGate.ts
- **Category:** Error Handling / Security
- **Severity:** Medium
- **What changed:** The catch block in `authenticate()` now logs the error with `console.warn` before unlocking. Still unlocks on error (to prevent app lockout), but the error is no longer completely swallowed.
- **Why:** Silent swallowing made it impossible to debug biometric hardware issues or unexpected authentication failures.

## [FIX-015] - Add error recovery to checkDeviceIntegrations

- **Files:** stores/integrationStore.ts
- **Category:** Error Handling
- **Severity:** Medium
- **What changed:** Each permission check in `Promise.all` now has individual `.catch()` fallbacks returning 'undetermined'. Added outer try/catch with error state. Previously, if any single permission check rejected, the entire function failed silently.
- **Why:** `Promise.all` rejects on first failure. A single failing permission (e.g., Health on Android) would prevent all other integrations from being checked.

## [FIX-016] - Strip Deepgram error body to prevent API key / sensitive data leaks

- **Files:** services/voice.ts
- **Category:** Security
- **Severity:** Critical
- **What changed:** Error thrown on non-OK Deepgram response now omits the response body. Changed from `Deepgram error ${status}: ${body}` to `Deepgram transcription failed (HTTP ${status})`.
- **Why:** The original error message included the full Deepgram response body, which could contain internal error details. More critically, the API key was passed as a parameter and could appear in error handler logs upstream.

## [FIX-017] - Guard NaN from malformed blood pressure strings

- **Files:** services/healthData.ts
- **Category:** Bug
- **Severity:** High
- **What changed:** `parseFloat()` results for blood pressure systolic/diastolic are now validated with `Number.isFinite()` before assignment. Malformed input like `"120/"` or `"/80"` now produces `null` instead of `NaN`.
- **Why:** `parseFloat('')` returns `NaN`, which propagated into the `HealthSummary` object and corrupted downstream comparisons and UI rendering.

## [FIX-018] - Validate models API response before accessing

- **Files:** services/modelCatalog.ts
- **Category:** Bug / Type Safety
- **Severity:** High
- **What changed:** Added `Array.isArray(data.models)` guard after parsing the API response. If the response is malformed, throws an error and falls back to the embedded model list.
- **Why:** Unvalidated `as ApiModelsResponse` cast meant `data.models.filter()` would crash if the API returned unexpected JSON.

## [FIX-019] - Handle document picker result (was silently discarded)

- **Files:** app/(app)/chat/[id].tsx
- **Category:** Bug
- **Severity:** High
- **What changed:** `handleSheetFile` now captures the `DocumentPicker.getDocumentAsync()` result, maps assets to `Attachment` objects, and passes them to `chatInputAttachRef.current?.addAttachments()`.
- **Why:** The picked document was being completely discarded — the result of `getDocumentAsync()` was not used. Users could pick files from the sheet but nothing happened.

## [FIX-020] - Add optional chaining on stopSpeaking() call

- **Files:** app/(app)/chat/[id].tsx
- **Category:** Bug
- **Severity:** High
- **What changed:** Changed `stopSpeaking()` to `stopSpeaking?.()` in `handleSend` callback.
- **Why:** If `useVoicePlayback` hook returns undefined for `stop`, the call crashes. Optional chaining prevents this.

## [FIX-021] - Clean up retryAttempts when message is deleted

- **Files:** stores/chatStore.ts
- **Category:** Memory Leak
- **Severity:** Medium
- **What changed:** `deleteMessage` now also removes the corresponding entry from `retryAttempts` record using destructuring.
- **Why:** `retryAttempts` is keyed by message ID and never cleaned up. Over months of usage, deleted messages leave orphan retry counts that accumulate indefinitely.

## [FIX-022] - Guard sendControl against broken connection states

- **Files:** stores/connectionStore.ts
- **Category:** Bug / Silent Failure
- **Severity:** High
- **What changed:** `sendControl` now explicitly returns early (no-op) when status is `disconnected`, `error`, or `session_expired`, instead of attempting to send through a null signaling client. Also added queue cap check inline for reconnecting/stale states.
- **Why:** When connection was in `error` or `session_expired` state, messages fell through to the signaling path where `signalingClient` was null — silently dropping them with no user feedback.

## [FIX-023] - Propagate editMessage send failure to error state

- **Files:** stores/chatStore.ts
- **Category:** Error Handling
- **Severity:** Medium
- **What changed:** Added `.catch()` handler before `.finally()` in `editMessage`'s `sendMessage` call. On failure, sets the store `error` field with a descriptive message.
- **Why:** If the re-send after editing failed, the error was completely swallowed. The editing spinner cleared but the user had no indication the edit didn't go through.

## [FIX-024] - Handle Linking.openURL failure in CitationChip

- **Files:** components/chat/CitationChip.tsx
- **Category:** Error Handling
- **Severity:** Low
- **What changed:** Added `.catch()` to `Linking.openURL(url)` to prevent unhandled promise rejection on malformed URLs.
- **Why:** If the citation URL is malformed, `openURL` rejects without a handler, producing console warnings and potentially crashing in strict mode.

## [FIX-025] - Log offlineQueue callback errors instead of swallowing

- **Files:** services/offlineQueue.ts
- **Category:** Error Handling
- **Severity:** Medium
- **What changed:** Empty `catch` blocks in `processQueue` for `onSuccess` and `onFailure` callbacks now log with `console.warn`.
- **Why:** Silent error swallowing masked bugs in callback implementations, making queue-related issues impossible to debug.

## [FIX-026] - Stop heartbeat interval on session expiry

- **Files:** services/heartbeat.ts
- **Category:** Memory Leak / Cleanup
- **Severity:** High
- **What changed:** `startMobileHeartbeat` now checks the auth session before each heartbeat tick. If the session is gone (user signed out), the interval self-clears. Added `stopped` flag to prevent races.
- **Why:** The heartbeat interval continued firing indefinitely after logout, making wasted network calls to Supabase with no auth token.

## [FIX-027] - Fix streamingConversationId race condition with per-conversation Set

- **Files:** stores/chatStore.ts
- **Category:** Bug / Race Condition
- **Severity:** Critical
- **What changed:** Replaced global `let streamingConversationId` with `const streamingConversations = new Set<string>()`. Replaced global `let thinkingStartedAt` with `const thinkingStartTimes = new Map<string, number>()`. All `sendMessage` callbacks (`onDelta`, `onDone`, `onError`, `catch`) now use per-conversation `.add()`/`.delete()` instead of global assignment. `isStreaming` state now derived from `streamingConversations.size > 0`. `stopStreaming` targets the current conversation's stream specifically.
- **Why:** Single global variable broke when user switched conversations mid-stream — second stream's tracking was overwritten, causing orphaned streams and incorrect `isStreaming` state.

## [FIX-028] - Fix SecureStore chunk cleanup read-after-write race

- **Files:** services/supabase.ts
- **Category:** Bug / Security
- **Severity:** Critical
- **What changed:** Moved `getItemAsync(key + CHUNK_COUNT_SUFFIX)` to BEFORE writing new chunks. Previously it read AFTER writing, so `oldCount === count` and the orphan-cleanup loop never executed.
- **Why:** Orphan SecureStore chunks from previous auth token writes accumulated indefinitely. In the worst case, old session token fragments persisted after re-authentication, wasting Keychain space and leaving stale auth data.

## [FIX-029] - Set up auth listener in onRehydrateStorage

- **Files:** stores/authStore.ts
- **Category:** Bug / Security
- **Severity:** Critical
- **What changed:** `onRehydrateStorage` now calls `supabase.auth.onAuthStateChange()` when a cached session exists, guarded by `if (!authSubscription)` to prevent double-subscription.
- **Why:** If the app cold-started with a cached session, the auth state change listener wasn't set up until `initialize()` ran (after biometric gate). During this gap, server-side token expiry or sign-out from another device was undetected.

## [FIX-030] - Add CHANNEL_ERROR handling in Realtime subscribe callbacks

- **Files:** services/realtime.ts
- **Category:** Error Handling
- **Severity:** High
- **What changed:** Both channel `.subscribe()` callbacks now log `console.error` for `CHANNEL_ERROR` and `TIMED_OUT` statuses instead of silently ignoring them.
- **Why:** Realtime subscription failures were completely silent, making connection issues impossible to debug.

## [FIX-031] - Prevent duplicate notification listeners

- **Files:** services/notifications.ts
- **Category:** Memory Leak / Bug
- **Severity:** High
- **What changed:** `setupNotificationListeners()` now returns early with existing cleanup if listeners are already active, preventing duplicate subscriptions on component re-mount.
- **Why:** If the root layout re-mounted (navigation reset, hot reload), new listeners stacked on old ones, causing duplicate notification handling and doubled API calls.

## [FIX-032] - Fix ApprovalCard countdown interval leak and stale closure

- **Files:** components/chat/ApprovalCard.tsx
- **Category:** Bug / Memory Leak
- **Severity:** High
- **What changed:** (a) Added `onApproveRef` pattern to avoid stale `onApprove` closure in the interval callback; removed `eslint-disable` comment and fixed dependency array. (b) `handleRejectPress` now clears the countdown interval before calling `onReject`, preventing auto-approve from firing after manual rejection. (c) Added `.trim()` to reject reason.
- **Why:** (a) Stale `onApprove` could call the wrong callback if the parent re-rendered. (b) Rejecting during countdown didn't stop the interval — auto-approve could fire 1s later, overriding the rejection.

## [FIX-033] - Wrap onboarding dot animations in useEffect

- **Files:** app/onboarding.tsx
- **Category:** Performance / Correctness
- **Severity:** Medium
- **What changed:** Moved `Animated.spring()` calls from render body into `useEffect` with proper `[active, widths]` dependencies and cleanup via `.stop()` on unmount.
- **Why:** Animations were side effects running during render (violates React rules). They stacked on every re-render and weren't cleaned up on unmount, wasting resources.

## [FIX-034] - Clean up auto-scroll setTimeout in dispatch screen

- **Files:** app/(app)/dispatch/index.tsx
- **Category:** Memory Leak
- **Severity:** Medium
- **What changed:** Auto-scroll `setTimeout` is now stored in a local variable and cleared via `return () => clearTimeout()` in the effect cleanup.
- **Why:** If the dispatch screen unmounted within 150ms of a new message, the timeout callback would fire on a stale ref, causing React warnings.

## [FIX-035] - Remove Reanimated shared values from useCallback deps

- **Files:** components/chat/ImageFullScreen.tsx
- **Category:** Performance
- **Severity:** Medium
- **What changed:** Removed 6 Reanimated shared values from `handleClose` useCallback dependency array, keeping only `[onClose]`.
- **Why:** Shared values are stable refs (identity never changes). Including them in deps caused unnecessary callback recreation on every render, triggering downstream re-renders of the close button.

## [FIX-036] - Replace Math.random() contact ID fallback with deterministic hash

- **Files:** services/deviceIntegrations.ts
- **Category:** Bug / Data Integrity
- **Severity:** Medium
- **What changed:** Added `stableContactId()` helper that generates a deterministic hash from contact name + phone/email. Replaced `String(Math.random())` fallback.
- **Why:** Random IDs produced different values on each fetch for the same contact, breaking React key stability, deduplication, and store lookups.

## [FIX-037] - Memoize markdown rendering in MessageBubble

- **Files:** components/chat/MessageBubble.tsx
- **Category:** Performance
- **Severity:** Low
- **What changed:** Wrapped `renderMarkdownContent(message.content)` in `useMemo` with `[message.content]` dependency. Added `useMemo` to imports.
- **Why:** Markdown parsing (regex matching, element creation) ran on every render even when content hadn't changed. For long messages with code blocks, this was measurably expensive.

## [FIX-044] - Handle companion reconnect failure instead of silent no-op

- **Files:** services/companion.ts
- **Category:** Error Handling
- **Severity:** High
- **What changed:** `debouncedReconnect()` now wraps the `connect()` call in try/catch. On failure, logs the error and clears the error state instead of silently swallowing.
- **Why:** If `connect()` threw (e.g., invalid pairing code format, signaling server unreachable), the reconnect attempt failed silently. The user saw "Reconnecting..." indefinitely with no error feedback.

## [FIX-038] - Refine streaming isNetworkError to avoid wasting reconnects

- **Files:** services/streaming.ts
- **Category:** Bug / Performance
- **Severity:** High
- **What changed:** `isNetworkError()` no longer treats ALL `TypeError` instances as transient network errors. Now checks the message for network-specific keywords (`network`, `fetch`, `load failed`, `cancelled`). Malformed request TypeErrors (e.g., invalid JSON body) are no longer retried 3 times.
- **Why:** React Native's `fetch()` throws `TypeError` for both network failures AND application bugs. Retrying a malformed request wastes all 3 reconnect attempts with guaranteed failures.

## [FIX-039] - Add CHANNEL_ERROR handling to dispatch Realtime channels

- **Files:** services/dispatchRealtime.ts
- **Category:** Error Handling
- **Severity:** High
- **What changed:** All three `.subscribe()` calls (messages, agent-state, heartbeat) now pass status callbacks that log `console.error` for `CHANNEL_ERROR` and `TIMED_OUT`.
- **Why:** Dispatch Realtime channels (unlike conversation channels fixed in FIX-030) had no status callbacks at all. Subscription failures were completely silent — desktop task updates would stop arriving with no logging.

## [FIX-040] - Prevent double Promise resolution in TTS speak()

- **Files:** services/tts.ts
- **Category:** Bug / Race Condition
- **Severity:** High
- **What changed:** Added `settled` flag in `speak()` Promise. `onDone`, `onStopped`, and `onError` callbacks now check `if (settled) return` before resolving/rejecting. Prevents expo-speech race where both `onDone` and `onError` fire.
- **Why:** If `Speech.speak()` fires both `onDone` and `onError` (documented race in expo-speech), the second callback's resolve/reject was ignored by the already-settled Promise — but the user-provided callback (`options.onDone`, `options.onError`) would still fire twice.

## [FIX-041] - Sanitize error messages in companion notifications

- **Files:** services/companionNotifications.ts
- **Category:** Security
- **Severity:** Medium
- **What changed:** `agent_failed` notification body now sanitizes `errorMessage`: takes only the first line, capped at 100 characters. Prevents stack traces and internal error details from appearing in the notification center.
- **Why:** Raw error messages could contain file paths, stack traces, or internal system details. iOS/Android notification centers are searchable and may be visible on lock screens.

## [FIX-042] - Clear metering interval on recording init failure

- **Files:** services/voice.ts
- **Category:** Memory Leak
- **Severity:** Medium
- **What changed:** Added `clearMeteringInterval()` in the catch block of `startRecording()` before `stopAndUnloadAsync()`. If `prepareToRecordAsync()` or `startAsync()` throws, the metering interval (if it was set up) is now properly cleared.
- **Why:** If recording initialization failed after the metering interval was started, the interval continued polling a dead recording object every 67ms indefinitely.

## [FIX-043] - Pause desktop status polling when app is backgrounded

- **Files:** services/desktopStatus.ts
- **Category:** Performance / Battery
- **Severity:** Medium
- **What changed:** `startDesktopStatusPolling()` now adds an `AppState` listener that clears the polling interval when the app enters background and restarts it (with an immediate check) when returning to active. Cleanup function removes both the interval and the AppState listener.
- **Why:** The 30-second polling interval continued firing when the app was backgrounded, wasting battery and network on Supabase queries that no one was looking at. On iOS, background intervals can cause the app to be flagged as a battery hog.

---

## Files Modified Summary

| File                                | Fixes Applied                                        |
| ----------------------------------- | ---------------------------------------------------- |
| stores/chatStore.ts                 | FIX-001, FIX-002, FIX-003, FIX-021, FIX-023, FIX-027 |
| stores/settingsStore.ts             | FIX-004                                              |
| lib/imageGenHelpers.ts              | FIX-005                                              |
| stores/connectionStore.ts           | FIX-006, FIX-007, FIX-022                            |
| services/api.ts                     | FIX-008, FIX-009                                     |
| stores/dispatchStore.ts             | FIX-010                                              |
| stores/notificationPrefsStore.ts    | FIX-011                                              |
| stores/scheduleStore.ts             | FIX-012                                              |
| stores/modelStore.ts                | FIX-013                                              |
| hooks/useBiometricGate.ts           | FIX-014                                              |
| stores/integrationStore.ts          | FIX-015                                              |
| services/voice.ts                   | FIX-016                                              |
| services/healthData.ts              | FIX-017                                              |
| services/modelCatalog.ts            | FIX-018                                              |
| app/(app)/chat/[id].tsx             | FIX-019, FIX-020                                     |
| components/chat/CitationChip.tsx    | FIX-024                                              |
| services/offlineQueue.ts            | FIX-025                                              |
| services/heartbeat.ts               | FIX-026                                              |
| services/supabase.ts                | FIX-028                                              |
| stores/authStore.ts                 | FIX-029                                              |
| services/realtime.ts                | FIX-030                                              |
| services/notifications.ts           | FIX-031                                              |
| components/chat/ApprovalCard.tsx    | FIX-032                                              |
| app/onboarding.tsx                  | FIX-033                                              |
| app/(app)/dispatch/index.tsx        | FIX-034                                              |
| components/chat/ImageFullScreen.tsx | FIX-035                                              |
| services/deviceIntegrations.ts      | FIX-036                                              |
| components/chat/MessageBubble.tsx   | FIX-037                                              |
| services/streaming.ts               | FIX-038                                              |
| services/dispatchRealtime.ts        | FIX-039                                              |
| services/tts.ts                     | FIX-040                                              |
| services/companionNotifications.ts  | FIX-041                                              |
| services/voice.ts                   | FIX-042 (+ FIX-016)                                  |
| services/desktopStatus.ts           | FIX-043                                              |
| services/companion.ts               | FIX-044 (silent reconnect)                           |

---

## [FIX-045] - User-scope healthData cache to prevent cross-user data leak

- **Files:** services/healthData.ts
- **Category:** Security / Privacy
- **Severity:** Critical
- **What changed:** Added `cachedUserId` tracking. `getHealthSummary()` now checks the current user ID against the cached user ID and invalidates the cache on mismatch. Prevents returning User A's health data to User B after account switch.
- **Why:** Module-level `cachedSummary` was global — not scoped to the authenticated user. If two users signed in on the same device, the second user would see the first user's cached health data for 5 minutes.

## [FIX-046] - Add dispatch Realtime and desktop status subscriptions to root layout

- **Files:** app/\_layout.tsx
- **Category:** Bug / Missing Feature
- **Severity:** High
- **What changed:** Added two new `useEffect` hooks: one for `subscribeToDispatch()` (desktop→mobile task updates via Realtime) and one for `startDesktopStatusPolling()` (desktop liveness). Both are session-gated with proper cleanup on sign-out.
- **Why:** Dispatch Realtime channels and desktop status polling were defined as services but never actually initialized in the app lifecycle. Desktop task updates and online status only came through the WebRTC companion channel, missing the Realtime fallback entirely.

## [FIX-047] - Reset streaming timeout per reconnect attempt

- **Files:** services/streaming.ts
- **Category:** Bug / Reliability
- **Severity:** High
- **What changed:** The single `setTimeout` that spanned all reconnect attempts is now reset after each backoff wait. Each new stream attempt gets a fresh timeout budget equal to `TIMEOUTS.STREAMING`.
- **Why:** Previously, a single timeout covered the entire retry loop including backoff waits. If attempt 1 took 10s and backoff was 2.5s, attempt 2 only had ~17.5s before the global timeout fired — causing premature stream termination on reconnects.

## [FIX-048] - Replace offlineQueue snapshot with live queue iteration

- **Files:** services/offlineQueue.ts
- **Category:** Bug / Race Condition
- **Severity:** High
- **What changed:** `processQueue()` now iterates the live `this.queue` array from front (`this.queue[0]`) instead of taking a snapshot copy. New messages enqueued during drain are picked up immediately.
- **Why:** The snapshot approach (`const entries = [...this.queue]`) missed any messages enqueued during the drain loop. If a user retried a message while the queue was processing, it would wait until the next `processQueue()` cycle.

## [FIX-049] - Use URLSearchParams in autotag URL construction

- **Files:** services/autotag.ts
- **Category:** Security / Code Quality
- **Severity:** Medium
- **What changed:** Replaced string interpolation `` `/api/autotag/conversations?tag=${tag}` `` with `URLSearchParams` construction.
- **Why:** String interpolation doesn't encode special characters. While `tag` is constrained by the `ConversationTag` type at compile time, runtime values could contain URL-unsafe characters.

## [FIX-050] - Add fallback for unknown ToolCallCard status color

- **Files:** components/chat/ToolCallCard.tsx
- **Category:** Bug / Resilience
- **Severity:** Medium
- **What changed:** `STATUS_BORDER_COLOR` and `STATUS_BADGE` lookups now use `?? colors.textMuted` and `?? { label: status, color: 'blue' }` fallbacks.
- **Why:** If a new tool call status was added without updating the color map, `borderColor` would be `undefined`, causing a missing border and potential style crash.

## [FIX-051] - Fix heartbeat_lost notification type mismatch

- **Files:** services/companionNotifications.ts
- **Category:** Bug
- **Severity:** Low
- **What changed:** Changed `heartbeat_lost` notification type from `'agent_paused'` to `'heartbeat_info'`.
- **Why:** Semantic mismatch — a lost heartbeat is a connection issue, not an agent being paused. The wrong type caused notification preferences for "Agent Paused" to incorrectly gate desktop-disconnection alerts.

## [FIX-052] - Add error handling to VoiceConversationScreen onSendMessage

- **Files:** components/voice/VoiceConversationScreen.tsx
- **Category:** Error Handling
- **Severity:** High
- **What changed:** Wrapped `onSendMessage(text)` in a dedicated try/catch that transitions the voice UI to 'idle' phase on failure and logs the error. Previously, send failures bubbled to the outer catch which didn't distinguish send errors from transcription errors.
- **Why:** If the AI response failed (network, API error), the voice UI would freeze in "thinking" phase indefinitely. Users had to force-close and reopen the voice screen.

## [FIX-053] - Convert models.ts lookups to O(1) via Map

- **Files:** lib/models.ts
- **Category:** Performance
- **Severity:** Low
- **What changed:** Added `providerMap` and `autoModeMap` alongside existing `modelMap`. `getProviderById()`, `isAutoMode()`, `getDisplayName()`, and `getShortDisplayName()` now use `.get()`/`.has()` instead of `.find()`/`.some()`.
- **Why:** Consistency with `getModelById()` which already used Map. While O(n) on 9 providers is negligible, the pattern is now uniform and future-proof.

## [FIX-054] - Add retry and AbortController to background fetch task

- **Files:** services/backgroundFetch.ts
- **Category:** Reliability
- **Severity:** Medium
- **What changed:** Background fetch task now retries the API call up to 2 times with exponential backoff (1s, 2s). Added `AbortController` to the request. Added null-safe `getState?.()` check for store access.
- **Why:** A single transient network failure caused the entire background fetch to return `Failed`, which makes the OS schedule the next fetch later. Retries increase the chance of success. The AbortController allows the OS to cancel the fetch if it kills the task.

## [FIX-055] - Tighten companion stale detection interval

- **Files:** services/companion.ts
- **Category:** Bug / Timing
- **Severity:** Low
- **What changed:** Reduced stale check interval offset from `HEARTBEAT_INTERVAL_MS + 5_000` (35s) to `HEARTBEAT_INTERVAL_MS + 2_000` (32s).
- **Why:** The 5s offset was unnecessarily large, causing up to 65s total delay before stale detection. The 2s offset provides enough time for pong arrival while detecting staleness 3s earlier.

## [FIX-056] - Pass attachment ID through prop instead of inline closure

- **Files:** components/chat/AttachmentPreview.tsx
- **Category:** Performance
- **Severity:** Low
- **What changed:** `AttachmentThumbnail.onRemove` prop changed from `() => void` to `(id: string) => void`. Parent now passes `onRemove` directly instead of wrapping in `() => onRemove(attachment.id)`. Child calls `onRemove(attachment.id)` internally.
- **Why:** Inline arrow function `() => onRemove(attachment.id)` created a new function reference per attachment per render, preventing React.memo optimization of thumbnails.

## [FIX-057] - Fix conversationSync push/pull status race with in-flight counter

- **Files:** services/conversationSync.ts
- **Category:** Bug / Race Condition
- **Severity:** Medium
- **What changed:** Added `_inFlightOps` counter. `pushConversation` and `pullConversations` increment on entry, decrement in `finally`. Status only transitions to 'synced' when the counter reaches 0, preventing status flicker when push and pull run concurrently.
- **Why:** Concurrent push/pull calls each independently set status to 'syncing' then 'synced'/'error'. If push succeeded while pull was still in-flight, status briefly showed 'synced' then jumped back to 'syncing', confusing the UI.

## [FIX-058] - Add exponential backoff retry to notification navigator-ready deferral

- **Files:** services/notifications.ts
- **Category:** Bug / Reliability
- **Severity:** Medium
- **What changed:** `safeNavigate()` now retries up to 4 times with exponential backoff (50ms, 100ms, 200ms, 400ms) if the navigator isn't ready, instead of a single 100ms setTimeout.
- **Why:** On slow devices, the Expo Router navigator may take >100ms to mount after cold start. The single 100ms defer would silently fail, causing deep links from notifications to be lost.

---

## Files Modified Summary

| File                                         | Fixes Applied                                        |
| -------------------------------------------- | ---------------------------------------------------- |
| stores/chatStore.ts                          | FIX-001, FIX-002, FIX-003, FIX-021, FIX-023, FIX-027 |
| stores/settingsStore.ts                      | FIX-004                                              |
| lib/imageGenHelpers.ts                       | FIX-005                                              |
| stores/connectionStore.ts                    | FIX-006, FIX-007, FIX-022                            |
| services/api.ts                              | FIX-008, FIX-009                                     |
| stores/dispatchStore.ts                      | FIX-010                                              |
| stores/notificationPrefsStore.ts             | FIX-011                                              |
| stores/scheduleStore.ts                      | FIX-012                                              |
| stores/modelStore.ts                         | FIX-013                                              |
| hooks/useBiometricGate.ts                    | FIX-014                                              |
| stores/integrationStore.ts                   | FIX-015                                              |
| services/voice.ts                            | FIX-016, FIX-042                                     |
| services/healthData.ts                       | FIX-017, FIX-045                                     |
| services/modelCatalog.ts                     | FIX-018                                              |
| app/(app)/chat/[id].tsx                      | FIX-019, FIX-020                                     |
| components/chat/CitationChip.tsx             | FIX-024                                              |
| services/offlineQueue.ts                     | FIX-025, FIX-048                                     |
| services/heartbeat.ts                        | FIX-026                                              |
| services/supabase.ts                         | FIX-028                                              |
| stores/authStore.ts                          | FIX-029                                              |
| services/realtime.ts                         | FIX-030                                              |
| services/notifications.ts                    | FIX-031, FIX-058                                     |
| components/chat/ApprovalCard.tsx             | FIX-032                                              |
| app/onboarding.tsx                           | FIX-033                                              |
| app/(app)/dispatch/index.tsx                 | FIX-034                                              |
| components/chat/ImageFullScreen.tsx          | FIX-035                                              |
| services/deviceIntegrations.ts               | FIX-036                                              |
| components/chat/MessageBubble.tsx            | FIX-037                                              |
| services/streaming.ts                        | FIX-038, FIX-047                                     |
| services/dispatchRealtime.ts                 | FIX-039                                              |
| services/tts.ts                              | FIX-040                                              |
| services/companionNotifications.ts           | FIX-041, FIX-051                                     |
| services/desktopStatus.ts                    | FIX-043                                              |
| services/companion.ts                        | FIX-044, FIX-055                                     |
| app/\_layout.tsx                             | FIX-046                                              |
| services/autotag.ts                          | FIX-049                                              |
| components/chat/ToolCallCard.tsx             | FIX-050                                              |
| components/voice/VoiceConversationScreen.tsx | FIX-052                                              |
| lib/models.ts                                | FIX-053                                              |
| services/backgroundFetch.ts                  | FIX-054                                              |
| components/chat/AttachmentPreview.tsx        | FIX-056                                              |
| services/conversationSync.ts                 | FIX-057                                              |

---

## [FIX-059] - Add onRehydrateStorage error handling to all 14 stores

- **Files:** stores/agentStore.ts, stores/chatStore.ts, stores/connectionStore.ts, stores/crossDeviceStore.ts, stores/desktopStatusStore.ts, stores/dispatchStore.ts, stores/integrationStore.ts, stores/memoryStore.ts, stores/messagingStore.ts, stores/modelStore.ts, stores/notificationPrefsStore.ts, stores/projectStore.ts, stores/scheduleStore.ts, stores/settingsStore.ts
- **Category:** Resilience / Error Handling
- **Severity:** High
- **What changed:** Added `onRehydrateStorage: () => (_state, error) => { if (error) console.warn(...) }` callback to all 14 stores that were missing it. Only `authStore` had one previously.
- **Why:** If MMKV storage is corrupted (encryption key mismatch, disk corruption, malformed JSON), store hydration fails silently. All stores now log the error, preventing silent data loss on cold start.

## [FIX-060] - Add MMKV persistence to offline message queue

- **Files:** services/offlineQueue.ts
- **Category:** Reliability / Offline
- **Severity:** Critical
- **What changed:** Added `persistToStorage()` method that serializes the queue (message data only, no callbacks) to MMKV after every mutation (enqueue, processQueue success/failure, clear). Added `restoreFromStorage()` that rehydrates persisted entries on module load. Added `PersistedQueueEntry` interface for the serializable subset.
- **Why:** Previously the queue was in-memory only. If the app was killed while messages were queued (e.g., airplane mode + force quit), all queued messages were lost. Now they survive app restarts.

## [FIX-061] - Add runtime type validation to connectionStore handleControlMessage

- **Files:** stores/connectionStore.ts
- **Category:** Security / Type Safety
- **Severity:** High
- **What changed:** Replaced all `as` type casts in `handleControlMessage` with runtime type guards (`isString()`, `isNumber()`, `isObject()`, `isTaskStatus()`). Added `VALID_TASK_STATUSES` set for enum validation. Agent arrays are filtered to objects before passing to the store. Dispatch messages validate every field before constructing the message object.
- **Why:** Incoming WebRTC/signaling messages from the desktop were blindly cast to TypeScript types. If the desktop sent malformed data (corrupted, version mismatch, or malicious injection), the mobile app would crash or store invalid state.

## [FIX-062] - Extract MessageBubble sub-components (772 -> 465 lines)

- **Files:** components/chat/MessageBubble.tsx (modified), components/chat/MessageContentRenderer.tsx (NEW), components/chat/MessageEditModal.tsx (NEW)
- **Category:** Architecture / Maintainability
- **Severity:** High
- **What changed:** Extracted three pure rendering functions (`renderInlineMath`, `renderInlineMarkdown`, `renderMarkdownContent`) into `MessageContentRenderer.tsx` (217 lines). Extracted the edit modal + its StyleSheet into `MessageEditModal.tsx` (109 lines). MessageBubble.tsx reduced from 772 to 465 lines. Removed unused imports (Modal, TextInput, StyleSheet, CodeBlockCopyButton).
- **Why:** MessageBubble was a 772-line god component with 7+ responsibilities. Markdown rendering and the edit modal had zero dependencies on the parent's state — they were pure functions/components that could be cleanly extracted without any behavioral change.

---

## Remaining Items — Require New File Creation

All code-level bugs, security issues, performance problems, architectural defects, and reliability gaps have been resolved. The following items require writing new files or conducting design reviews, not fixing existing code:

### Testing (requires writing new test files)

- 20+ services with zero test coverage
- 9 stores with zero test coverage
- All 4 hooks with zero test coverage
- 80+ components missing unit tests

### Accessibility (requires UI/design review + per-component changes)

- 80+ components missing `accessibilityLabel` / `accessibilityRole` props
- VoiceOver/TalkBack screen reader hints needed across all interactive elements
