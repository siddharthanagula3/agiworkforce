# Mobile Bug Hunt — 2026-06-20

Status: Current
Owner: Mobile lead
Surface: `apps/mobile` (@agiworkforce/mobile, Expo ~55, RN 0.83)

Method: 14 domain-partitioned finder agents → adversarial re-read verification (verbatim-excerpt grounding, by-design exclusions, critical/high double-verified) → manual self-confirmation against source before fixing. 28 findings confirmed (1 critical/9 high/10 medium/8 low); 5 refuted, 2 disputed, 0 excerpt-mismatch.

Verification after fixes: `pnpm --filter @agiworkforce/mobile typecheck` ✅, `lint` ✅, `test` ✅ (124 suites, 1381 passed, 9 skipped).

## Fixed (20 findings)

| # | Sev | Area | File(s) | Fix |
|---|-----|------|---------|-----|
| 1/10 | crit→high | Notification deep-links dead | `app/_layout.tsx`, `services/notifications.ts` | Gate notification routing on the real Clerk signal (`isClerkSignedIn`) via new `setSignedIn`, not the always-null legacy `session`. Every tap previously fell through to `/(auth)/login`. |
| 3/9 | high | Share-to-chat dead | `app/_layout.tsx` | Removed always-null `session` gate from the share-intent effect; share is local-first and only needs `isInitialized`. |
| 2 | high | Minor-safe filter never enforced | `stores/chat/chatExecutionStore.ts`, `src/features/auth/services/ageGate.ts` | Wired `checkContentFilter` into `sendMessage` (single chokepoint for chat/scan/voice) gated on `isMinorMode()`; hardened `ageGate.readRecord` against uninitialized MMKV. |
| 6 | high | MathBlock WebView script injection | `src/features/chat/components/MathBlock.tsx` | LaTeX no longer interpolated into an inline `<script>` (JSON.stringify does not neutralize `</script>`); passed as HTML-escaped text, read via `textContent`. |
| 8 | high | Model-download resume broken | `services/modelDownload.ts` | Store the opaque `resumeData` token, not the whole serialized `DownloadPauseState` JSON — HTTP Range resume now works. |
| 5/23 | high/low | Dead retry button + messageCount drift | `stores/chat/chatExecutionStore.ts` | `retryMessage` now resolves the user/assistant pair from either id (banner passes user id); messageCount decremented correctly on trim. |
| 7 | high | "Delete everything" left chat exports | `services/fileCreation.ts`, `services/dsarExport.ts` | Centralized PDF/TXT/MD exports into `${documentDirectory}exports/`; wipe removes it. |
| 11 | medium | streamChat preflight hangs Compare | `services/streaming.ts` | Fatal preflight errors delivered via `callbacks.onError` (matching the terminal-error contract) instead of throwing. |
| 12 | medium | `agent_update` skipped validation | `stores/connectionStore.ts` | Patch validated through `parseAgent` (merged onto existing agent), matching the `agents_update` path. |
| 14 | medium | Non-atomic DB migrations | `storage/db.ts` | Each migration body + `PRAGMA user_version` bump wrapped in one transaction. |
| 16 | medium | Stop aborts arbitrary conversation | `stores/chat/chatExecutionStore.ts` | `stopStreaming` only targets the current conversation; no arbitrary-fallback abort; global flag recomputed. |
| 18 | medium | Stale permission radio after revoke | `stores/permissionsStore.ts` | `setObservedStatus` re-syncs `userIntent` to OS truth on external revoke, not only first observe. |
| 19 | medium | Voice mic/recognizer leak on unmount | `src/features/voice/components/VoiceConversationScreen.tsx` | Added unmount cleanup effect (visibility else-branch never ran on unmount). |
| 21 | low | rekeyDb could brick DB | `storage/db.ts` | Persist new key to SecureStore before `PRAGMA rekey`; roll back stored key on rekey failure. |
| 22 | low | RAG result order lost | `storage/docChunks.ts` | `getDocChunksByIds` preserves caller (relevance) ordering instead of `ORDER BY chunk_index`. |
| 25 | low | Orphan "Scan" conversations | `app/(app)/scan.tsx` | Empty-content guard moved before `createConversation`. |
| 26 | low | Routeless chat_message dead tap | `services/notifications.ts` | Falls back to the chat tab. |
| 27 | low | Offline retry budget reset on kill | `services/offlineQueue.ts` | Persist incremented `retryCount` before backoff. |
| 28 | low | New memory invisible while searching | `src/features/memory/store.ts` | `addMemory` updates `filteredEntries` when a matching search is active. |

## Deferred (needs product decision / migration / larger work)

- **#4 (high, security) — MMKV encryption key truncated to ~64-bit entropy** (`lib/mmkv.ts:118`). The fix changes the key passed to MMKV, which makes existing encrypted MMKV stores unreadable. Needs: (a) confirm react-native-mmkv truncation behavior for the pinned version, (b) a re-key migration (recrypt) to avoid data loss. Do not change blindly.
- **#13 (medium) — Cloud account UI reads always-null `useAuthStore.user`** (`app/(app)/profile/index.tsx:72`). Same `session`/`user` root cause as #1/#3; needs a Clerk→store user bridge (populate `user` from Clerk `useUser()` in `ClerkTokenBridge`). Wiring fix, not a one-liner.
- **#15 (medium) — `markStale` requires two calls to reach 'stale'** (`stores/connectionStore.ts:980`). Lives in the v1-disabled dispatch/companion subsystem (`FEATURES.dispatch=false`, `companion=false`) and an existing test (`dispatch-defense.test.ts`) asserts the current 2-missed-heartbeat behavior. Revisit when dispatch ships.
- **#20 (medium→low) — Project "Sources" stored but never used as chat context** (`src/features/projects/components/ProjectSourcesTab.tsx`). Feature gap; requires wiring source ingestion into RAG retrieval/injection.
- **#24 (low) — MathBlock loads KaTeX from CDN with no offline/local-mode gate** (`MathBlock.tsx:23`). Mitigated for the injection risk by #6; eliminating the network fetch requires bundling KaTeX as a local asset.

## Notes / by-design (not bugs)

Managed cloud intentionally waitlisted (CLOUD-01); mobile has no client-direct BYOK (`remoteChatGate` discards the byok flag on purpose); `conversationSync`/`realtime`/`dispatchRealtime`/`heartbeat` are intentional no-ops gated by `FEATURES.crossDeviceSync=false`. Three previously-known bugs (titles-only sync, offline-composer block, push-token POST in local mode) were excluded from this hunt and remain tracked in the three-tier topology audit.
