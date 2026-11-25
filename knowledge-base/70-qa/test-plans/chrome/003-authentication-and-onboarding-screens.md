---
id: "PLAN-chrome-003"
type: "test-plan"
title: "Chrome · 3. Authentication and onboarding screens"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "3"
---
# Chrome · 3. Authentication and onboarding screens

7 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S3.01 Sign-in screen.

- **Expected:** The surface offers a sign-in entry that authenticates the user to their AGI account, in-app or through a browser/device handoff that returns a session to the surface.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:14129; apps/extension/src/features/cloud-bridge/clerkAuth.ts:231 (quoted code not found in the file now)
- **Where to find it:** Side panel > composer area shows "Sign in to start chatting in Chrome." > Sign in (labels found in the code)
- **Needs:** an AGI account (email or outside provider login)
- **Steps:**
  1. Open the AGI side panel in Chrome while signed out (click the AGI toolbar icon).
  2. Read the notice in the composer area: "Sign in to start chatting in Chrome."
  3. Click the "Sign in" button. A new tab opens on the AGI sign-in page.
  4. Finish signing in in that tab, return to the side panel and click "Check sign-in".
  5. Compare: the side panel should show you as signed in and the chat should be usable, as Expected says.

## S3.02 Create-account screen.

- **Expected:** A new user can create an account (email or provider) from a sign-up screen on the surface, or is handed to one.
- **Code:** done. Evidence present: apps/web/features/auth/authRoutes.ts:47; apps/web/features/auth/authRoutes.ts:32; apps/web/features/auth/authRoutes.ts:80
- **Where to find it:** Side panel > Sign in > create a new account on the AGI sign-in page that opens in a new tab (labels found in the code)
- **Needs:** a new email address or an outside account (Google)
- **Steps:**
  1. Open the AGI side panel while signed out.
  2. Click "Sign in" in the composer area.
  3. In the new tab that opens, look for the option to create a new account (wording not verified in the extension code).
  4. Create an account with email or a provider, then return to the side panel and click "Check sign-in".
  5. Compare: the new account should reach a signed-in state in the side panel, as Expected says.

## S3.19 Terms-acceptance screen.

- **Expected:** Before first use the user reviews and accepts the current Terms (versioned), acceptance is recorded, and a terms change re-prompts.
- **Code:** partial. Evidence none: the ledger gives no code location
- **Known to be unfinished:** after Codex commits: apply post-codex/w-auth-S3.19-mobile-terms-acceptance.patch, remove 'mobile' from TERMS_GATE_EXEMPT_SURFACES in auth-gate.ts, and make Codex's GET /api/terms/accept report the standing (readTermsStanding) instead of strict current, or mobile sign-in hard-blocks every revision
- **Where to find it:** not found in the code. The extension has no Terms acceptance screen. apps/extension/src/features/cloud-bridge/freeTrialClient.ts only turns a TERMS_ACCEPTANCE_REQUIRED error into a block message to accept the updated Terms on agiworkforce.com. Acceptance is recorded on the web at apps/web/app/signup/complete/RecordTermsAcceptance.tsx. I searched apps/extension/src for terms, Terms of Service and terms_required and found no acceptance control.
- **Needs:** a Free account, with the Terms version changed on the server

## S3.25 Memory setup.

- **Expected:** During setup the user is told about memory and chooses whether and how it is used, with the choice changeable later.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:8463 (quoted code not found in the file now); apps/extension/src/side_panel.ts:8565 (quoted code not found in the file now); apps/extension/src/side_panel.ts:11117 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/memoryClient.ts:251 (quoted code not found in the file now)
- **Where to find it:** not found in the code. No memory setup step or memory-use choice was found in apps/extension/src. The closest screens are the side panel account menu > Memory (apps/extension/src/side_panel.ts, label "Memory", sheet intro "What AGI remembers about you in every app...") and Options > Account > Your account > Memory > Open, which opens the web memory settings. I searched apps/extension/src for memory, spMemory and remember strings.
- **Needs:** a signed-in account

## S3.30 Browser-extension pairing.

- **Expected:** The browser extension can be paired with the desktop app (or account) through a guided code/confirm step, with a way to unpair.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:7321 (quoted code not found in the file now); apps/extension/src/features/native-bridge/pairing.ts:400
- **Where to find it:** Options > Account > Desktop app > Pair with Desktop (labels found in the code)
- **Needs:** AGI Desktop app open and showing a pairing code
- **Steps:**
  1. Open the Options page: click "Open settings" on the welcome page, or open the AGI extension's Options from Chrome's extensions menu.
  2. Click "Account" in the left navigation and scroll to "Desktop app".
  3. Click "Pair with Desktop", type the code shown by AGI Desktop in the field (placeholder ABCD-EFGH), then click "Confirm Code".
  4. Compare: the status should change from "Not paired" to paired, and the "Unpair" button should appear, as Expected says.
  5. Click "Unpair", read the message "Unpair the desktop app? ...", then click "Unpair" again or "Keep paired" to check the way back out.

## S3.32 Optional notification setup.

- **Expected:** The user is offered an optional, declinable way to turn on notifications (primer or setup step), and can change it later.
- **Code:** done. Evidence moved: apps/extension/src/options.ts:1040 (quoted code not found in the file now); apps/extension/src/background.ts:2482
- **Where to find it:** Options > Options > Task completion notifications (labels found in the code)
- **Steps:**
  1. Open the Options page: click "Open settings" on the welcome page, or open the AGI extension's Options from Chrome's extensions menu.
  2. Click "Options" in the left navigation.
  3. Find the "Task completion notifications" row and read its hint.
  4. Switch the toggle off and back on. Compare: the status reads "Task completion notifications are off." or "...are on."
  5. Compare the toggle with Expected: it is optional and can be changed later.

## S3.35 First-conversation introduction.

- **Expected:** New users get an introduction to their first conversation (what to try, how it works) that leads into a first chat.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:5633 (quoted code not found in the file now); apps/extension/src/side_panel.ts:10889 (quoted code not found in the file now)
- **Where to find it:** Side panel, first open after install > "Getting started with AGI" bar above the composer > Next > Let's go (labels found in the code)
- **Needs:** a fresh install or a profile whose tour is not finished
- **Steps:**
  1. Install AGI, or use a profile where the side panel tour has not been finished, then open the AGI side panel.
  2. Read the first tour step above the composer: "AGI reads a page only when you attach it or ask it to act there."
  3. Click "Next" and read the shortcuts step.
  4. Click "Let's go" to finish the tour.
  5. Compare: the bar should go away and the composer should be ready for a first chat, as Expected says.
