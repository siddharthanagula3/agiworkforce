# Mobile Cloud Mode vs ChatGPT Mobile — Parity Audit

> Generated 2026-06-23. Depth-first, code-grounded audit of `apps/mobile` **cloud mode** vs ChatGPT mobile.
> Reference = 10 founder-provided ChatGPT mobile screenshots (S1–S10) only; anything not screenshot-backed is marked uncertain, not a gap.
> Method: 6 shared-state surfaces deeply analyzed, each adversarially re-verified (every cited `file:line` re-opened), divergences triaged, then synthesized. 14 agents.
> Scope: Mobile trust model = Local + Cloud (no BYOK), cloud = managed-cloud shared-state behind invite gate, mobile is not the heavy-compute surface. Pro/Max/₹299 ≠ ChatGPT Go/Plus.

## Bottom line

Cloud mode works end-to-end today, behind the invite gate. A message sent with `appMode=cloud` creates a server-side conversation, streams a real SSE reply from the managed gateway with bridged Clerk auth, and persists via a genuine 4-surface delta-sync engine (chat/memory/projects/settings) with independent cursors, LWW, and tombstones — this is the strongest part of the build and the trust boundary is clean (no silent Local→Cloud leak). The shared-state _core_ is close to parity; the gaps are in the surrounding UX shell and two correctness defects, not in the transport. The biggest live regressions: the empty-home suggestion starters and the project detail screen — both are finished code that is dead-wired or mis-gated, so the user hits a blank home and a synced cloud project that mislabels itself "Local" with a raw UUID. Settings/account is the thinnest surface (entitlement is a spoofable MMKV boolean with a hardcoded invite string, tier pinned to Free by flag), and a latent sign-out isolation bug will leak personalization across accounts the moment real auth ships.

## Cloud-mode functional status

| Shared-state surface       | Status  | Evidence                                                                                                                                                                              |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud send                 | wired   | `chatExecutionStore.ts:467-499` resolves cloud branch; `streaming.ts:177-186` POSTs `/api/llm/v1/chat/completions` with Clerk bearer + SSE                                            |
| Sync engine                | wired   | `cloudSyncEngine.ts:177-281` (chat), `:321-400` (memory), `:447-535` (projects), `:578-643` (settings); started `_layout.tsx:182`, fires after each turn `chatExecutionStore.ts:1004` |
| Chat UX (composer/actions) | partial | Send/stop/model-picker/copy/edit/retry wired (`ChatInput.tsx:358-423`, `MessageBubble.tsx:192-237`); empty-home starters dead-wired (`chat/[id].tsx:85` comment-only)                 |
| Memory                     | partial | Cloud CRUD wired (`src/features/memory/store.ts:103-227`); no enable toggle, no summary, import/pin write to local SQLite in cloud mode                                               |
| Personalization            | partial | warmth/enthusiasm/custom-instructions/profile sync (`cloudSettingsMapping.ts:136-142`); headers/lists + emoji absent from projection `:52-62`; no base-style, no fast-answers         |
| Projects                   | partial | Sync + list + create + composer-attach wired (`cloudSyncEngine.ts:447-535`, `ProjectSelectorBar.tsx:95-129`); detail screen mis-gated `[id].tsx:135-148`                              |
| Settings/account           | partial | Device settings wired (`src/features/settings/index.tsx:286-504`); entitlement spoofable, tier pinned Free `billing/store.ts:87`                                                      |
| Cloud-bridge handoff       | stubbed | WebRTC/HMAC engine real but `connectionStore.ts:191-193` no-ops (dispatch+companion off); `desktopStatusStore`/`crossDeviceStore` zero importers                                      |

## Prioritized parity gaps

### P0 — cloud mode broken / blocker

None. The core send→stream→persist→sync loop is real and functional when entitled. No verified P0 remains.

### P1 — core screenshot-backed capability missing/broken

**Empty-home suggestion starters absent (S3).** ChatGPT's empty chat home shows tappable suggestion chips ("Create an image for my presentation"). We have a complete 6-card `ConversationStarters` component plus `TaskChips`, but grep confirms **zero JSX renders** — `chat/[id].tsx:85` references it only in a comment; `Composer.tsx:62-80` renders only `<ChatInput>` and `showChips` merely flips `isThreadActive`. The primary cloud home offers no quick-start affordance. _Fix:_ render `<ConversationStarters />` in the `chat.tsx` empty state, or render `TaskChips` when `showChips` is true. Wire the existing component, don't rebuild. (matrix_drift)

**Project detail screen mislabels synced cloud projects as "Local" (S4).** `[id].tsx:135-148` gates `fetchProject` on `FEATURES.crossDeviceSync` (hard-false at `v1FeatureFlags.ts:84`), so a cloud project always falls to `LocalOnlyFallback`, which renders a "Local project" label and `localProject?.name ?? projectId` — for a synced cloud project with no local row, that prints the **raw UUID**. Reachable in cloud mode via `DrawerContent.tsx:426`. This is a stale/misleading-label correctness defect, and the gate is inconsistent with the rest of the surface (sync is gated on `cloudChat`, which is on). _Fix:_ drive the cloud detail header from `cloudProjectStore` when `appMode==='cloud'` instead of `fetchProject` — this kills the stale label and unblocks the chats tab (which already renders below the fallback and is mode-aware) in one change. (matrix_drift)

### P2 — partial / polish

**Personalization headers/lists + emoji don't sync (S7).** Both sliders render and persist locally (`personalization/index.tsx:32-33`) but are absent from `CloudPersonalization` (`cloudSettingsMapping.ts:52-62`) — not in `toCloudSettings` (`:135-142`) nor `applyCloudSettings` (`:183-194`). Two of four S7 style axes silently don't cross devices. _Fix:_ add `headersLists` + `emoji` to the cloud projection, coordinating key names with web/desktop.

**Memory enable toggle missing (S8).** `memory.tsx` has only search/filter/list/FAB; grep for `memoryEnabled`/`enableMemory` returns zero. Matrix line 131 lists "disable" as in-scope. _Fix:_ add a cloud-safe `memoryEnabled` flag in `settingsStore` + `cloudSettingsMapping`, gate retrieval/consolidation on it. (matrix_drift)

**Personalization base style/tone (S7) and fast-answers toggle (S7) absent.** `personalization/index.tsx:29-34` has only 4 sliders + free-text; no `baseStyle` enum, no `fastAnswers` boolean (grep zero hits for both). _Fix:_ add a `baseStyle` segmented selector and a `fastAnswers` Switch, both in the cloud projection.

**More-about-you field missing (S8) / memory summary missing (S8).** No `moreAboutYou` field anywhere (custom instructions partially overlaps); no memory-summary row. Both low — the raw memories list and custom-instructions cover the core need.

**Pinned section absent in live drawer (S9).** `DrawerContent.tsx` has no pinned reference; the `pinned`-grouping `ConversationList` in `features/sidebar/` is dead code (never imported). Data model supports it (`chatMessageStore.ts:311`). _Fix:_ render a Pinned section from `conversation.pinned`, add pin/unpin to the long-press menu. (matrix_drift)

**No proactive Upgrade entry (S3, S6).** Grep finds no upgrade pill in `DrawerContent` or the `chat.tsx` home; `PaywallBottomSheet` is reactive on a 429 only. Paywall _structure_ parity is in-scope. `ProPlusPaywall`/billing routes exist but aren't surfaced. _Fix:_ add an Upgrade pill in the chat-home header/drawer routing to existing billing.

**Voice-mode discoverability (S3).** `ChatInput.tsx:403-414` renders a single `VoiceInputButton`; live voice is reachable only via long-press, and S3's distinct second voice-mode control + top-right conversation icon are absent. _Fix:_ add a dedicated voice-mode button beside the mic.

**Title-only chat search (S9).** `DrawerContent` `SearchBox` filters titles only, not message content. Adequate for S9's basic search; extend to bodies/global for full parity.

**Streaming granularity unverified (engineering caveat, not a screenshot gap).** Genuine internal contradiction: `streaming.ts:217-224` falls back to `response.text()` (whole-reply) assuming RN exposes no `response.body`, while `providerStreamClient.ts:1-11` asserts `getReader()` is available on current Expo; `USE_PROVIDER_STREAM` defaults OFF. Only one is true on RN 0.83.6. _Fix:_ verify at runtime; if no streaming body, wire `expo/fetch` for the completions path or default the provider-stream flag on for cloud. (ChatGPT streaming granularity not in any screenshot — low parity severity.)

## Matrix drift

`docs/current/parity-implementation-matrix.md` is stale vs code on:

- **Create project (cloud):** matrix says Partial; cloud create + delta-sync is fully wired (`store.ts:59-84`, `cloudSyncEngine.ts:481-535`). Only color/icon/privacy sub-fields missing.
- **Cloud sync of projects:** matrix's blanket Partial understates a genuine delta-sync with independent cursor, LWW, and tombstones. Record that mobile project create/edit/delete/tombstone sync is wired.
- **Project sources/detail:** matrix Partial overstates reality — the detail screen dead-ends to a mislabeled Local fallback in cloud mode.
- **Enable-memory toggle:** matrix line 131 lists "disable" as in-scope but there is no implementation.
- **Import memory:** matrix says Missing, but a local implementation exists and the cloud path is silently broken (writes to wrong store), not absent.
- **Branch/fork & Pinned (mobile):** matrix Partial; both are Missing in the live cloud UI (`MessageBubble` action sheet has no branch; `DrawerContent` has no pinned).
- **Account/entitlement:** matrix Partial; tier is pinned Free by flag and invite is a hardcoded `ALPHATESTER` string compare, not the `validate_and_redeem_invite_code` RPC.
- **Cloud-bridge handoff:** matrix Partial; flag-dark and orphaned (no reachable pairing UI, `desktopStatusStore`/`crossDeviceStore` have zero importers).

## Intentional divergences (NOT gaps)

- **BYOK on mobile** — mobile trust mode is Local + Cloud only by design.
- **Heavy local generation (image/video/PDF/PPTX)** — `imageGen=false` is deliberate; mobile previews/shares, heavy-gen delegates to Desktop.
- **Cloud invite gate / fail-closed gating** — by design; gating itself is not scored as a bug.
- **ChatGPT Go/Plus tier names, prices, "may include ads" note** — AGI uses Pro/Max/India-Cheapest; only paywall _structure_ is in-scope.
- **Ads / Parental / Trusted-contact controls (S1)** — outside the Local+Cloud trust model and product scope.
- **Codex device-host strings and ChatGPT-branded IA verbatim (S4)** — AGI owns its design system; the handoff _capability_ stays in-scope.
- **Cross-device thread store / companion channel** — `dispatch`/`companion` intentionally off in v1; `crossDeviceStore` is a transport-less skeleton awaiting the companion channel.
- **Artifacts pull-only on mobile** — by design; mobile is a puller, not an author.

## Next 3 moves

1. **Unblock the project detail screen** — drive the cloud detail header from `cloudProjectStore` when `appMode==='cloud'` instead of the `crossDeviceSync`-gated `fetchProject` (`[id].tsx:135-148`). One change kills the stale "Local"/raw-UUID label and unblocks the already-wired chats tab. Highest user-visible correctness win.
2. **Render the empty-home suggestion starters** — wire the finished `<ConversationStarters />`/`TaskChips` into the `chat.tsx` empty state. Removes the blank-home regression on the primary cloud surface; pure wiring, no new code.
3. **Close the settings shared-state holes before auth ships** — (a) add `headersLists`+`emoji` to the cloud personalization projection so all four S7 axes sync; (b) call `resetSettingsSync()` + clear `settingsStore` in the `src/features/auth/store.ts:106-131` sign-out teardown to stop the latent cross-account personalization leak. Both are quiet shared-state defects that compound once real auth lands.

---

## Appendix — sign-out cross-account isolation defect (sync-engine surface, medium)

The 4-surface delta-sync engine is the strongest part of the build, but `src/features/auth/store.ts:108-130` resets the chat, memory, and project cloud stores + sync cursors on sign-out and **never** resets settings: it does not call `useSettingsSyncStateStore.resetSettingsSync()` (the action exists at `settingsSyncStateStore.ts:54` but has zero callers) and never clears the live `useSettingsStore`, which persists personalization/profile (nickname, occupation, custom instructions) to MMKV `settings-store` with no `partialize` and no reset action. Consequence on the same device: account B inherits account A's personalization in the live store before any pull, and a stale `settingsCursor` (`since=<A's high-water>`) can prevent B's cloud settings from ever pulling down. Asymmetric with chat/memory/projects, which all reset correctly. Add a regression test alongside `__tests__/cloud-settings-sync.test.ts`.
