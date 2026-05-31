# src-4 round-2 self-QA — apps/mobile frontend audit

Author: `src-4`
Round 1 report: `audit/anthropic-apps-parity/team-2026-05-21/src-4-report.md`
Verification mode: re-grep specific claims, read files I cited only partially in round 1, find rubric areas I omitted.

## Changes from round 1

### Empirical errors (corrected against the source)

1. **Voice transcript preview rendering — FACTUAL ERROR**
   Round 1 said: _"AGI shows a `transcriptPreview` state but its rendering is not visible at lines 1-200 read."_
   Verified: `apps/mobile/src/features/voice/components/VoiceConversationScreen.tsx:414-423` **does** render `transcriptPreview` as a centered card under the orb with `numberOfLines={3}`. I only read the first 200 lines of a 200+ line file in round 1. The polish gap "no real-time transcription overlay" was wrong — overlay exists.
   **Correction:** Voice severity could drop to P2 with hours 3 (instead of 5); the surviving polish gap is just voice-picker location (BottomSheet vs settings row) and onboarding to voice cancellation cues.

2. **"Restore Purchases" + "Manage Subscription" buttons — already implemented**
   Round 1 implied these were missing in the StoreKit P0 finding.
   Verified: `apps/mobile/app/(app)/usage.tsx:500-507` already renders **both** action rows with proper icons (`CreditCard`, `RotateCcw`). `handleRestorePurchases` (line 414-420) currently shows an Alert ("Purchase restoration will be available when the app launches on the App Store."). `handleManageSubscription` (line 395-412) hits a `/api/portal` endpoint, falls back to opening `https://agiworkforce.com/billing`.
   The **screen short-circuits with `if (!FEATURES.billing) return null;`** at line 422 — so visually it's invisible in v1, but the UI scaffolding exists.
   **Correction:** P0 finding stands (no StoreKit wiring) but **hours estimate should drop from 40 → 24h**, since the UI shell exists; the work is the StoreKit IAP integration (product fetch, purchase flow, receipt validation, transaction listener), entitlement entitlements changes, App Store Connect product setup, and replacing the Alert with `requestPurchase()`. Not the full UI build.

3. **Settings → Account/Subscription gap — partial mistake**
   Round 1 said: _"No Account/Subscription row exposed at all — `FEATURES.auth = false` and `FEATURES.billing = false` mean the user has nowhere to view tier/usage/payment from Settings."_
   Verified: `apps/mobile/app/(app)/usage.tsx` exists with full usage UI (session/monthly progress bars, API spend, daily chart, model breakdown). Settings (`apps/mobile/src/features/settings/index.tsx`) does **not** link to `/usage` (no row, even disabled, in any of the 8 sections).
   **Correction:** The gap reframes to "Settings doesn't link to existing `/usage` screen" + "no account avatar row" rather than "nothing built". Hours drop from 12 → 8.

4. **Projects per-project instructions — partial mistake**
   Round 1 hypothesized: _"per-project files/instructions feature may be absent."_
   Verified: `apps/mobile/src/features/projects/store.ts:5-12` defines `Project { id, name, description, instructions, ... }` — **`instructions` IS in the schema**. Files are NOT. The gap is narrower than I stated.
   **Correction:** Projects hours drop from 10 → 6 (only file attachment, not instructions).

5. **Conversation sidebar Swipeable interactions — not surfaced in round 1**
   Verified: `apps/mobile/src/features/sidebar/components/ConversationItem.tsx:5` imports `Swipeable` from `react-native-gesture-handler`. AGI Mobile likely has swipe-to-pin / swipe-to-delete on sidebar rows; round 1 did not credit this.
   **Correction:** Sidebar exceeds Claude iOS more than I credited. No hours change, but the gap delta should note "AGI has gesture-driven row actions Claude iOS lacks".

### Rubric areas missed in round 1

These are areas listed in the brief rubric that round 1 did NOT have explicit sections for:

6. **`history/projects` — round 1 collapsed into "Sidebar / History"**
   The brief lists `history/projects` and the source has a full `projects` feature. Round 1 did include a Projects section (lines 241-256) but did not split History from Projects. No new evidence — split is cosmetic.

7. **Memory — round 1 surveyed superficially**
   Verified: Memory feature has `store.ts`, `services/`, settings rows + nav, and `AddMemorySheet` UI. Source-side breadth is adequate; round-1 "no gap" stands but I never confirmed whether Memory honors the same MMKV-rehydrate pattern. Spot-checked: `projects/store.ts:78-90` uses `mmkvStorage` and `rehydrateWhenMmkvReady`; memory store likely follows the same pattern (not verified, low risk).

8. **Markdown rendering (multi-modal complement)**
   Verified: `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx` is 452 lines and is **a custom inline markdown renderer** (`renderInlineMarkdown` at line 53, `renderMarkdownContent` at line 363). Handles headers, blockquotes, ordered/unordered lists. **No KaTeX/MathJax** for inline math; no Mermaid; no full HTML. This is consistent with the artifacts gap I already cited but I missed it as a parity item under "multi-modal".
   **Add:** P2, 6h — add KaTeX inline math + table rendering (Claude iOS handles both via WebView-backed renderer).

9. **Conversation export / share**
   Verified: `apps/mobile/src/features/chat/components/ConversationExportSheet.tsx` exists; `FileExportButton.tsx` exposes share + export. Claude iOS exposes "Share chat" → link to a shared.claude.ai URL. AGI Mobile shares **local file** instead. Round 1 missed this as its own item.
   **Add:** P2, 4h — add server-backed "share link" (requires cloudChat).

10. **Accessibility — round 1 mentioned but didn't quantify**
    Verified: `MessageBubble.tsx` uses `useReducedMotion()` (line 106) and gates `FadeInDown` (line 273). Voice screen uses `useReducedMotion` (line 187). **No font-scale handling** found (`grep -rn fontScale` returned 0 hits in src/ and app/). No high-contrast theme. Voice/reduce-motion grep also returned only OfflineBanner — most components don't gate animations.
    **Add:** P2, 8h — add `Dynamic Type` honoring + global `accessibilityFontSizeMultiplier` propagation. Higher than I implied in round 1 (Settings gap covered the "Accessibility section" but not the wiring).

### Severity reclassification proposals

- **Connectors (round 1 P1)** — On further reflection, Claude iOS has shipped Connected Apps (Drive, Calendar) as a P0 feature. AGI Mobile having the UI but no working OAuth is more visible than "P1". **Bump to P0 if the lead's product target includes Claude-style Connected Apps**. Otherwise stays P1.
- **StoreKit P0** — confirmed (no `react-native-iap`, no `expo-store-kit`, no `requestPurchase`). Hours adjusted down to 24h per finding (2).
- **All other severity assignments** — re-verified, no changes.

## Refined gap table

| Surface area                                  | R1 sev | R1 hrs  | R2 sev       | R2 hrs                 | Delta reason                                         |
| --------------------------------------------- | ------ | ------- | ------------ | ---------------------- | ---------------------------------------------------- |
| Composer                                      | P1     | 8       | P1           | 8                      | unchanged                                            |
| Sidebar / Drawer / History                    | P2     | 6       | P2           | 5                      | credit Swipeable row actions                         |
| Model picker                                  | —      | 0       | —            | 0                      | unchanged                                            |
| Tool-call rendering                           | P2     | 4       | P2           | 4                      | unchanged (duplicate renderer note still valid)      |
| Settings                                      | P1     | 12      | P1           | 8                      | usage screen exists, just unlink                     |
| Onboarding                                    | P2     | 6       | P2           | 6                      | unchanged                                            |
| Billing / Paywall (StoreKit IAP)              | **P0** | 40      | **P0**       | 24                     | UI shell exists; only IAP wiring                     |
| Artifacts                                     | P1     | 24      | P1           | 24                     | unchanged                                            |
| Computer-use / Connectors                     | P1     | 16      | P1 (or P0)\* | 16                     | severity depends on Cloud Managed target             |
| Voice                                         | P2     | 5       | P2           | 3                      | transcript overlay exists                            |
| Agents                                        | —      | 0       | —            | 0                      | unchanged                                            |
| Auth (runtime exposure)                       | P1     | 8       | P1           | 8                      | unchanged                                            |
| Projects                                      | P1     | 10      | P1           | 6                      | `instructions` already in schema, only files missing |
| Memory                                        | —      | 0       | —            | 0                      | unchanged                                            |
| Search                                        | P1     | 8       | P1           | 8                      | unchanged                                            |
| Attachments / Multi-modal (OCR)               | P2     | 6       | P2           | 6                      | unchanged                                            |
| Slash commands                                | P2     | 3       | P2           | 3                      | unchanged                                            |
| Keyboard shortcuts                            | P2     | 4       | P2           | 4                      | unchanged                                            |
| Push notifications                            | P2     | 4       | P2           | 4                      | unchanged                                            |
| Native storage / Secrets                      | —      | 0       | —            | 0                      | unchanged                                            |
| **NEW** Markdown rendering (KaTeX/tables)     | —      | —       | P2           | 6                      | round-1 omission                                     |
| **NEW** Share chat (server-backed share link) | —      | —       | P2           | 4                      | round-1 omission                                     |
| **NEW** Accessibility wiring (Dynamic Type)   | —      | —       | P2           | 8                      | round-1 underspecified                               |
| **R2 Total**                                  |        | **164** |              | **143 + 18 new = 161** | net –3 hours                                         |

\*Connectors severity P0/P1 depends on whether the lead's parity target treats Claude Connected Apps as a P0 feature. I lean P1 in current v1 stance because Mobile v1 is local-only by lock; but the **inventory UI without working OAuth is more user-visible** than the round-1 P1 implies.

## Confidence in round-1 estimates

**High confidence (>90%) — verified, no change:**

- StoreKit IAP P0 finding (re-grepped: no `react-native-iap`, no `expo-store-kit`, no `requestPurchase` anywhere in `apps/mobile/src/` or `apps/mobile/lib/`).
- No push permission ask in onboarding (re-grepped: no `expo-notifications` import in `apps/(public)/onboarding.tsx` or `src/features/onboarding/`).
- v1FeatureFlags.ts being the single source of runtime gating (verified all `FEATURES.*` references hit the same file).
- Composer feature surface (re-read `ChatInput.tsx` and `AddToChatSheet.tsx` against round-1 description).
- Duplicate tool-call renderer (`InlineToolCall.tsx` vs `ToolCallCard.tsx`) — both are still present at the cited line counts.

**Medium confidence (60–80%) — verified with corrections:**

- Voice gap delta (corrected: transcript preview exists, severity drops one notch in scope).
- Settings → Account/Subscription gap (corrected: existing `/usage` screen, just unwired).
- Projects feature scope (corrected: `instructions` in schema, only files missing).
- Billing/Paywall hours (corrected: 40h → 24h, because UI shell exists).

**Low confidence (<60%) — hypothesized, still un-verified:**

- All Claude iOS comparison claims rely on prior knowledge of Claude iOS UX, since I did NOT read PNGs (per brief: source-side only). I tagged these as "hypothesized" in round 1; this remains a structural limitation.
- "AGI Mobile has the inventory UI but no working OAuth" — verified inventory at `connectorData.ts:78-152`; OAuth wiring not exhaustively checked.
- Connectors severity (P0 vs P1) — depends on lead's product target, flagged as `*` in table.
- Search comprehensiveness — `ConversationList.tsx:108` confirms title-only filtering, but I did not check whether `services/search.ts` or similar provides snippet/server search. Likely waitlisted (`cloudChat: false`).

## Round-1 errors NOT present (explicit honesty check)

These were claims I considered re-verifying but found correct on second look:

- ✅ `FEATURES.billing = false` — verified at `lib/v1FeatureFlags.ts:32`.
- ✅ Pro+ paywall opens external URL — verified at `ProPlusPaywall.tsx:78-84`.
- ✅ MMKV+SecureStore+biometric pattern — verified all three imports.
- ✅ Multi-image up to 5 in `ImagePicker` — verified `selectionLimit: 5` in chat.tsx and chat/[id].tsx.
- ✅ Apple Sign-In with hashed nonce — verified `OAuthButtons.tsx:17-34`.
- ✅ Google OAuth via HTTPS App Link + PKCE — verified `OAuthButtons.tsx:46-115`.
- ✅ Conversation grouping Pinned/Today/Yesterday/This Week/Older — verified at `ConversationList.tsx:30-77` and `lib/constants.ts:73-77`.

## Net delta

- **3 new rubric items added** (markdown rendering, share chat, accessibility wiring) — 18 hours.
- **4 hour estimates reduced** (voice –2, settings –4, billing –16, projects –4) — net –26 hours.
- **2 hour estimates reduced** (sidebar –1) — net –1 hour.
- **Round-1 total 164h → Round-2 total 161h** (−3h net).
- **P0 count: 1 (unchanged).** Note: Connectors could plausibly be argued to P0 by the lead.
- **No round-1 severity reduced** (Voice from P2 stays P2 even with corrections).

## Summary for lead

The round-1 audit's framework and headline findings are correct (StoreKit IAP P0, local-only product locks dominate runtime exposure, AGI Mobile exceeds Claude iOS on voice/composer richness). Three rubric items were missed (markdown KaTeX/tables, server-backed share link, full accessibility/Dynamic-Type wiring). Four hour estimates were too high because I didn't read complete file bodies (Voice, Settings, Projects, Billing — all had more code already shipped than I credited). The headline P0 (no StoreKit) survives unchanged; estimated implementation effort drops from 40h to 24h because the Manage-Subscription and Restore-Purchases UI rows already exist in `apps/mobile/app/(app)/usage.tsx`.
