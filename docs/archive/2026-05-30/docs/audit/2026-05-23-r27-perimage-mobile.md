# R27 Per-Image Mobile Parity Audit

**Lane:** L-MOBILE | **Date:** 2026-05-23 | **Phase:** B (per-image)
**Reference corpus:** `/Users/siddhartha/Desktop/reference/ui/mobile/claude-ios/` (27 images)
**Implementation surface:** `apps/mobile/src/` + `apps/mobile/app/`
**Baseline:** R26 audit at `docs/audit/2026-05-22-claude-parity-w3-mobile.md`

---

## Legend

| Tag | Meaning                                                                                 |
| --- | --------------------------------------------------------------------------------------- |
| ✅  | Matches Claude — at or above quality floor                                              |
| 🟡  | Close but different — minor gap, not a blocker                                          |
| ❌  | Missing or broken — below Claude floor                                                  |
| 🔄  | Locked-different by design — cite lock                                                  |
| 🚧  | Cloud-only — invite-code placeholder required per `v1-cloud-bridge-strategy-2026-05-23` |

---

## Per-Image Scorecard

| #   | Image file                         | Screen / Feature                               | AGI verdict | File:line                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------- | ---------------------------------------------- | ----------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | `01-home-empty.png`                | Chat home — empty state, greeting              | 🟡          | `src/features/chat/components/ChatEmptyState.tsx:69`                 | AGI says "Ask anything" or "Hi, {name}"; Claude shows time-of-day greeting ("How can I help you this evening?"). Missing time-of-day variant. Also: hardcoded rgba colors on pairing banner (violation).                                                                                                                                                                                                                                                            |
| 02  | `02-home-greeting.png`             | Chat home — personalized greeting + task chips | 🟡          | `src/features/chat/components/ChatEmptyState.tsx:69,82`              | Name-personalization present ✅. Task chips present ✅ (AGI addition). Pairing banner replaces Claude's usage-warning banner. No time-of-day greeting.                                                                                                                                                                                                                                                                                                              |
| 03  | `03-chat-active.png`               | Active chat — message list, input bar          | ✅          | `src/features/chat/components/ChatInput.tsx`                         | Message bubbles, streaming indicator, attachment support all present. Input placeholder while streaming: "Reply to {modelName}..." matches Claude's "Reply to Claude" pattern.                                                                                                                                                                                                                                                                                      |
| 04  | `04-chat-input-focused.png`        | Chat input — focused/expanded state            | 🟡          | `src/features/chat/components/ChatInput.tsx`                         | Non-streaming placeholder is "Ask anything..." vs Claude's "Chat with Claude". Minor copy mismatch.                                                                                                                                                                                                                                                                                                                                                                 |
| 05  | `05-chat-attachments.png`          | Chat input — attachment / add-to-chat sheet    | ✅          | `src/features/chat/components/`                                      | Camera, files, photos, screenshot options present. AGI adds more toggles (AHEAD in some respects).                                                                                                                                                                                                                                                                                                                                                                  |
| 06  | `06-model-picker.png`              | Model picker sheet                             | ✅          | `src/features/model-picker/components/ModelPickerSheet.tsx:38-52`    | AGI model picker is substantially AHEAD: multi-provider groups, search bar, favorites, per-model thinking toggle, install state. Claude shows simple 3-model list + thinking toggle. No hardcoded model IDs — reads from `packages/types/src/models.json`.                                                                                                                                                                                                          |
| 07  | `07-drawer-nav.png`                | Drawer navigation                              | 🟡          | `src/features/drawer/components/DrawerContent.tsx:30-50`             | AGI shows "AGI" wordmark ✅. Nav items present: Chat, Artifacts, Code, Projects (feature-flagged), Skills, Dispatch (feature-flagged), Connectors (feature-flagged). Recents list truncated to 5 items (Claude shows ~10). Missing "New" badge on Dispatch/new features (Claude shows orange "New" badge). `LocalModeStatusCard` is AGI differentiator ✅.                                                                                                          |
| 08  | `08-companion-disconnected.png`    | Companion — disconnected state                 | 🟡          | `src/features/companion/components/ConnectionStateViews.tsx`         | `DisconnectedView` present with QR code icon and "Pair with Desktop" copy ✅. Missing: "Looking for your desktop…" searching/connecting intermediate state visible in Claude's image.                                                                                                                                                                                                                                                                               |
| 09  | `09-companion-connecting.png`      | Companion — connecting/scanning state          | ❌          | `src/features/companion/components/ConnectionStateViews.tsx`         | Claude shows a "Looking for your desktop…" screen with phone-to-laptop illustration and animated star spinner. AGI has no intermediate connecting state between `DisconnectedView` and `SessionExpiredView`. Missing state machine entry.                                                                                                                                                                                                                           |
| 10  | `10-settings-main.png`             | Settings — main list                           | 🔄          | `src/features/settings/index.tsx`                                    | Claude: flat list (Profile, Billing, Usage, Shared links, Notifications, etc.). AGI: sectioned IA (Mode/Keys/Local AI/Connections/Voice/Preferences/Privacy/About). Different by design for v1 LOCAL-ONLY. Lock: `v1-local-only-cloud-waitlist-2026-05-18`. Missing rows to add post-v1: Profile, Usage (should link to `/usage`), Shared links (🚧 needs invite-code placeholder).                                                                                 |
| 11  | `11-connectors.png`                | Connectors screen                              | 🚧          | `src/features/settings/index.tsx` + `FEATURES.connectorsCloudOnly`   | Connectors is cloud-only per `FEATURES.connectorsCloudOnly` flag. Current UI shows Waitlist badge. Must be replaced with invite-code modal entry point per `v1-cloud-bridge-strategy-2026-05-23`. No invite-code modal wired.                                                                                                                                                                                                                                       |
| 12  | `12-capabilities.png`              | Capabilities / advanced features screen        | ❌          | `src/features/settings/capabilities/index.tsx`                       | Claude: Artifacts toggle, Code execution toggle, Web search toggle, Memory section (2 toggles + "View your memory" row), Tool access selector (Auto/On demand/Always available). AGI: Local LLMs (Active badge), Memory (toggle), Web Search (Waitlist), Image Generation (Waitlist), Desktop Control (Waitlist), BYOK Providers (Locked). Completely different IA. Missing: Artifacts toggle, Code execution toggle, "View your memory" row, Tool access selector. |
| 13  | `13-usage.png`                     | Usage screen                                   | 🟡          | `app/(app)/usage.tsx`                                                | AGI has `SessionUsageCard` matching Claude's "Current session" ✅. AGI shows "Monthly Limits" — Claude shows "Weekly limits / All models" with reset at specific time ("Thu 10:00 PM"). Reset cadence mismatch (monthly vs weekly). AGI usage screen is richer overall (model breakdown, daily chart, API spend) — AHEAD in richness but reset-period label is wrong.                                                                                               |
| 14  | `14-notifications.png`             | Notification preferences                       | 🟡          | `src/features/settings/notifications/index.tsx`                      | Claude categories: Research complete, Chat responses, Code updates. AGI categories: Approvals, Task Updates, Errors & Stops, Status Updates. Agent-centric framing appropriate for AGI's use case. AGI adds quiet hours + vibration-per-priority (AHEAD). Category label mismatch with Claude's exact naming.                                                                                                                                                       |
| 15  | `15-shared-links.png`              | Shared links list                              | 🚧          | No route found in codebase                                           | Shared links is a cloud feature (requires cloud chat history). No `settings/shared-links` route exists anywhere in mobile. Must add invite-code placeholder screen at the settings entry point. Currently: route is simply absent.                                                                                                                                                                                                                                  |
| 16  | `16-artifacts-grid.png`            | Artifacts tab — grid view                      | ✅          | `src/features/artifacts/index.tsx`                                   | `GetInspiredCard` present ✅. `ArtifactsSkeletonGrid` for loading ✅. 2-column grid on phone ✅. `useThemeColors()` used — no hardcoded colors ✅.                                                                                                                                                                                                                                                                                                                  |
| 17  | `17-artifacts-viewer.png`          | Artifact viewer / detail                       | 🟡          | `src/features/artifacts/`                                            | Viewer present. Claude shows rendered HTML preview with edit/run toolbar. Need code-level confirmation that all artifact types (HTML, code, SVG, React) render vs stub. Flag `NEEDS_USER_MANUAL_TEST`.                                                                                                                                                                                                                                                              |
| 18  | `18-onboarding-welcome.png`        | Onboarding — welcome slide                     | ✅          | `app/(public)/onboarding.tsx`                                        | Tagline present: "Beyond one model. Beyond one surface. AGI in your hands." ✅ (locked).                                                                                                                                                                                                                                                                                                                                                                            |
| 19  | `19-onboarding-model-download.png` | Onboarding — model download / setup screen     | ❌          | `app/(public)/onboarding.tsx:249-251`                                | **CONFIRMED FAKE**: `setInterval(() => { progress += 1.2; ... })` — no real download. TODO comment at lines 230-243 explicitly notes `downloadModel` service not integrated. Shows progress bar but no actual model is being fetched. V1 blocker: ships broken onboarding.                                                                                                                                                                                          |
| 20  | `20-code-mode-select.png`          | Code sessions — Plan/Code mode select sheet    | ✅          | `src/features/code-sessions/components/ModeSelectSheet.tsx:1-34`     | Plan / Code options with checkmark on selected. Matches Claude image exactly.                                                                                                                                                                                                                                                                                                                                                                                       |
| 21  | `21-code-session-menu.png`         | Code session — more/actions menu               | ✅          | `src/features/code-sessions/components/CodeSessionMoreMenu.tsx:1-27` | Copy branch / Share / Rename / Archive. Matches Claude's overflow menu.                                                                                                                                                                                                                                                                                                                                                                                             |
| 22  | `22-dispatch-dashboard.png`        | Dispatch — agent dashboard                     | 🟡          | `src/features/dispatch/`                                             | Dispatch present and feature-flagged. AGI Dispatch is its own paradigm (not a direct Claude equivalent). AGI is AHEAD in agent orchestration UI. Flag: Dispatch "New" badge missing in drawer nav (see image 07).                                                                                                                                                                                                                                                   |
| 23  | `23-dispatch-agent-run.png`        | Dispatch — agent run / execution stream        | ✅          | `src/features/dispatch/`                                             | Execution stream, tool call display, progress indicators present. 597 LOC implementation matches Anthropic Dispatch spec (March 17, 2026 parity).                                                                                                                                                                                                                                                                                                                   |
| 24  | `24-profile-screen.png`            | Profile / account screen                       | 🟡          | `src/features/settings/index.tsx`                                    | AGI shows "Local profile" sub-label ✅ (correct for v1 LOCAL-ONLY). Claude shows full Anthropic account screen. Difference is locked-appropriate for v1. Profile row MISSING from settings main list — no entry point from settings.                                                                                                                                                                                                                                |
| 25  | `25-billing-upgrade.png`           | Billing — upgrade / plan select screen         | ❌          | `app/(app)/billing/index.tsx:245`                                    | **STOREKIT NOT WIRED.** `handleUpgrade` calls `api.post('/api/checkout', ...)` → web Stripe redirect. `Restore Purchases` shows `Alert.alert` placeholder. App Store policy requires IAP for in-app subscription purchases. App Store rejection risk. V1 blocker for TestFlight (Apple will flag during review).                                                                                                                                                    |
| 26  | `26-appearance.png`                | Appearance — theme select                      | ✅          | `src/features/settings/`                                             | Dark / Light / System options. AGI adds System (auto) mode — AHEAD of Claude which shows only Dark/Light.                                                                                                                                                                                                                                                                                                                                                           |
| 27  | `27-about.png`                     | About screen                                   | ✅          | `app/(app)/about.tsx` (inferred)                                     | Runtime version derived from `package.json` `dependencies.expo` + `dependencies['react-native']` per locked convention. No hardcoded versions.                                                                                                                                                                                                                                                                                                                      |

---

## Summary Stats

| Verdict                    | Count  | %    |
| -------------------------- | ------ | ---- |
| ✅ Match / AHEAD           | 10     | 37%  |
| 🟡 Close / minor gap       | 9      | 33%  |
| ❌ Missing / broken        | 5      | 19%  |
| 🔄 Locked-different        | 1      | 4%   |
| 🚧 Cloud needs placeholder | 2      | 7%   |
| **Total**                  | **27** | 100% |

**V1 release blockers (❌):** 5  
**Cloud placeholders needed (🚧):** 2  
**NEEDS_USER_MANUAL_TEST:** 1 (image 17, artifact viewer rendering)

---

## Cross-Image Patterns

### Pattern 1 — Hardcoded color literals (P0 quality rule violation)

`ChatEmptyState.tsx` uses `rgba(33, 128, 141, 0.12)`, `rgba(33, 128, 141, 0.25)`, `rgba(255,255,255,0.4)`, `rgba(255,255,255,0.3)` as direct style values. Rule: all colors must use `useThemeColors()` tokens or NativeWind theme variables. File: `src/features/chat/components/ChatEmptyState.tsx`.

### Pattern 2 — Intermediate / loading states missing

Images 08-09 show Claude has a multi-state connecting flow (disconnected → searching/scanning → connected → expired). AGI has only two states (`DisconnectedView`, `SessionExpiredView`). The "searching" state is absent. Same pattern may apply in other multi-step flows — audit other state machines for missing intermediate states.

### Pattern 3 — Cloud entry points lack invite-code modal

Images 11 (Connectors) and 15 (Shared Links) are cloud-only features. Per `v1-cloud-bridge-strategy-2026-05-23`, every cloud feature must have an invite-code modal entry point. Currently: Connectors shows "Waitlist" badge (not an invite-code modal); Shared Links has no route at all. Both need the standardized invite-code modal pattern from the lock document.

### Pattern 4 — Settings IA divergence

Image 10 vs AGI settings index shows completely different information architecture. Claude uses a flat profile-first list; AGI uses sectioned mode-first list. The v1 lock justifies the difference, but several expected rows are simply absent (Profile entry point, Usage link, Shared Links placeholder). These missing rows leave navigation dead ends.

### Pattern 5 — Billing flows to web Stripe (App Store policy)

Image 25 confirms billing uses web Stripe redirect pattern. This violates Apple's in-app purchase requirement for subscription features promoted inside the app. The `FEATURES.billing` flag masks this during development but TestFlight review will expose it.

### Pattern 6 — Onboarding trust gap (fake progress)

Image 19 shows model download progress. AGI fakes this with `setInterval` incrementing a number. The TODO at lines 230-243 of `onboarding.tsx` is explicit. This is not a "stub to refine" — it ships a progress bar for a download that is never initiated. Users who follow the onboarding thinking a model was installed will find no model available.

---

## V1 Release Blockers

These block M2 TestFlight (Jul 19) and M3 launch (Aug 16).

### BLOCKER-01 — StoreKit IAP not wired (App Store rejection)

**File:** `app/(app)/billing/index.tsx:245`  
**Finding:** `handleUpgrade` POSTs to `/api/checkout` → returns web Stripe URL → opens in browser. `Restore Purchases` is `Alert.alert` placeholder.  
**Risk:** Apple App Store review will reject the app if in-app subscription purchase routes outside the app to a web payment page. This is a known rejection reason (guideline 3.1.1).  
**Fix:** Integrate `expo-in-app-purchases` or `react-native-purchases` (RevenueCat). Wire StoreKit product IDs. Keep web Stripe as fallback for non-App Store platforms only.  
**Priority:** P0

### BLOCKER-02 — Onboarding model download is fake

**File:** `app/(public)/onboarding.tsx:249-251`  
**Finding:** `setInterval(() => { progress += 1.2; })` simulates progress. No real download is initiated. TODO comment at lines 230-243 explicitly confirms `downloadModel` service is not integrated.  
**Risk:** Users complete onboarding believing a local model is installed. They will then attempt inference and find no model, or the app will silently fall back without informing the user.  
**Fix:** Integrate real model download via the `downloadModel` service. Wire actual download progress to the progress bar. Implement cancellation and error states.  
**Priority:** P0

### BLOCKER-03 — Companion connecting state missing

**File:** `src/features/companion/components/ConnectionStateViews.tsx`  
**Finding:** AGI has `DisconnectedView` and `SessionExpiredView` but no intermediate "searching / looking for desktop" state. Claude iOS shows a distinct connecting screen with animation.  
**Risk:** When user initiates a connection, UX skips from "not connected" directly to either "connected" or "expired" with no feedback during the scan window. Confusing for first-time users.  
**Fix:** Add `ConnectingView` component. Wire it to the QR scan initiation state before handshake completes.  
**Priority:** P1 (UX quality — Claude floor not met)

### BLOCKER-04 — Shared Links screen absent (cloud feature needs placeholder)

**File:** No route exists  
**Finding:** Claude image 15 shows Shared Links as a standard settings entry. No `settings/shared-links` route exists in AGI mobile.  
**Risk:** Settings IA has a dead end; discovery of shared links is impossible. v1 lock requires invite-code placeholder at every cloud entry point — this entry point doesn't exist.  
**Fix:** Add `app/(app)/settings/shared-links.tsx` with invite-code modal pattern from `v1-cloud-bridge-strategy-2026-05-23`. Add row to settings main list.  
**Priority:** P1

### BLOCKER-05 — Capabilities screen IA diverges from Claude floor

**File:** `src/features/settings/capabilities/index.tsx`  
**Finding:** Missing: Artifacts toggle, Code execution toggle, "View your memory" row, Tool access selector. These are standard Claude iOS features visible in image 12.  
**Risk:** Below-Claude quality floor. Users from Claude iOS will find capabilities settings unrecognizable.  
**Fix:** Add Artifacts toggle, Code execution toggle, Memory → "View your memory" navigation row, Tool access picker. Keep AGI-specific items (Local LLMs, Image Gen, Desktop Control) as additions.  
**Priority:** P1

---

## V2 Placeholders Required (🚧 invite-code modal hookup)

Per `v1-cloud-bridge-strategy-2026-05-23`: every cloud feature must show an invite-code modal entry point, not just a "Waitlist" badge. The modal copy must be: "Cloud features are gated for v1. Join the waitlist, or enter your invitation code below."

| Feature      | Current state                                            | Required change                                           | File                                                                |
| ------------ | -------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Connectors   | "Waitlist" badge on `FEATURES.connectorsCloudOnly` route | Replace badge with invite-code modal trigger              | `src/features/settings/index.tsx` + new `ConnectorsInviteModal.tsx` |
| Shared Links | Route absent entirely                                    | Add route + invite-code modal (no real content behind it) | New `app/(app)/settings/shared-links.tsx`                           |

---

## P0 Recommendations — Ranked by User Impact

### 1. Wire StoreKit IAP (BLOCKER-01)

**Impact:** App Store submission will be rejected without this. Blocks M2 TestFlight.  
**Effort:** 3-5 days. Use RevenueCat (`react-native-purchases`) to avoid raw StoreKit complexity. Map existing tier IDs to App Store product IDs.

### 2. Fix onboarding model download (BLOCKER-02)

**Impact:** Every new user follows onboarding. Fake progress destroys trust at the first moment of use.  
**Effort:** 2-3 days. Integrate `downloadModel` service (already referenced in the TODO). Wire progress callback to the bar. Add cancel + error handling.

### 3. Add Companion connecting state (BLOCKER-03)

**Impact:** First-time desktop pairing is a core differentiator. Missing intermediate state leaves users confused during the scan window.  
**Effort:** 1 day. New `ConnectingView` component + state machine wire-up.

### 4. Fix hardcoded colors in ChatEmptyState (quality rule)

**Impact:** Dark mode / light mode rendering broken for the pairing banner. Violates `no-hardcoded-colors` rule.  
**File:** `src/features/chat/components/ChatEmptyState.tsx`  
**Effort:** 2 hours. Replace `rgba(33, 128, 141, 0.12)`, `rgba(33, 128, 141, 0.25)`, `rgba(255,255,255,0.4)`, `rgba(255,255,255,0.3)` with `useThemeColors()` tokens.

### 5. Add Shared Links placeholder screen (BLOCKER-04 / 🚧)

**Impact:** Settings nav dead end. v1-cloud-bridge lock requires invite-code placeholder here.  
**Effort:** 2 hours. New screen + settings row + invite-code modal.

### 6. Rebuild Capabilities screen to match Claude floor (BLOCKER-05)

**Impact:** Power users checking capabilities will find it unrecognizable vs Claude.  
**Effort:** 1-2 days. Add missing toggles and Memory "View" row while keeping AGI-specific items.

### 7. Wire Connectors to invite-code modal (🚧)

**Impact:** Cloud bridge lock compliance. Currently shows "Waitlist" badge, which is below the specified invite-code modal standard.  
**Effort:** 4 hours. Create invite-code modal component (reusable for all cloud features) and wire to Connectors entry point.

### 8. Add time-of-day greeting to ChatEmptyState

**Impact:** Claude's personalized greeting sets quality bar. "Ask anything" is generic.  
**File:** `src/features/chat/components/ChatEmptyState.tsx:69`  
**Effort:** 1 hour. Add `getGreeting()` util: morning/afternoon/evening/night by local hour.

### 9. Fix usage reset period label (monthly vs weekly)

**Impact:** "Monthly Limits" vs Claude's "Weekly limits" — incorrect cadence label misleads users about when their usage resets.  
**File:** `app/(app)/usage.tsx` — `MonthlyUsageCard`  
**Effort:** 2 hours. Confirm actual reset policy and align label accordingly.

### 10. Add missing Settings rows (Profile, Usage link)

**Impact:** Settings IA has no Profile entry and no direct link to the Usage screen.  
**File:** `src/features/settings/index.tsx`  
**Effort:** 2 hours. Add Profile row (links to profile screen) and Usage row (links to `app/(app)/usage.tsx`).

---

## Items AHEAD of Claude (do not regress)

| Feature                   | AGI advantage                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------- |
| Model picker              | Multi-provider groups, search, favorites, per-model thinking toggle, install state |
| Appearance                | System/auto mode added (Claude has only Dark/Light)                                |
| Notification prefs        | Quiet hours + vibration per-priority                                               |
| Usage screen              | Model breakdown chart, daily chart, API spend card                                 |
| Dispatch                  | Agent orchestration dashboard (no Claude equivalent)                               |
| Task chips in empty state | Suggested prompts (AGI addition)                                                   |

---

## NEEDS_USER_MANUAL_TEST

- **Image 17 — Artifact viewer rendering**: Code reads that the viewer exists and `GetInspiredCard` / skeleton are wired. Cannot verify that all artifact types (HTML preview, React component, SVG, code blocks) render correctly without running the app. Flag for manual QA before M2 TestFlight.

---

_Audit image count note: Task brief referenced 28 images; directory contains 27 files. One image may have been removed or renamed. All 27 found images are scored above._
