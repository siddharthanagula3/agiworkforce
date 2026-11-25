---
id: "DOC-70-qa-setup-mobile"
type: "setup"
title: "Running the Mobile app locally"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Running the Mobile app locally

Written 2026-11-24 from the project's own documents and scripts by reading them. **The commands below were not run by the session that wrote this page.** Each step names the file it came from; if a step fails, read that file.

**Local web server:** wherever a step below starts the web app, use the compiled build described in `web.md` on port 3000. It is what the Web checks ran against and it behaves like the released app; a development server does not.

## What it is

AGI Mobile is the Expo and React Native phone app. Its Local mode runs a model on the device with no account. Its Cloud mode signs in through Clerk and calls the web backend; with the local env file it points at http://localhost:3000. The repo documents local test accounts (one per plan, made by pnpm dev:accounts) for trying Cloud on the Free plan or a subscribed plan without touching production.

## Needed first

- Repository at ~/Desktop/agiworkforce with dependencies installed by `pnpm install` (docs/agent-context/commands.json, repoWide.install).
- pnpm available (all documented commands are pnpm scripts: package.json, docs/agent-context/commands.json).
- apps/mobile/.env.local present with APP_ENV=development, EXPO_PUBLIC_APP_ENV=development, EXPO_PUBLIC_API_URL=http://localhost:3000 (apps/mobile/.env.local:1-3; template at apps/mobile/.env.local.example:1-9).
- apps/web/.env.local present: the dev-accounts commands read it, and the local web server reads it (docs/development/local-test-accounts.md:20-22).
- The local web server running on localhost:3000 (docs/development/local-test-accounts.md:61; apps/mobile/.env.local.example:9). The docs do not state a port setting for next dev.
- For the iOS Simulator: Xcode. The store runbook says the local simulator builds were made with Xcode 27.1 (docs/runbooks/mobile-store-first-release.md:85). The docs do not give an install or minimum version.
- For the Android emulator: the Android SDK and an emulator image. No document says how to install them; the baseline only says adb is on PATH (scripts/mobile.md Fixtures section).
- Every heavy job (dev server, Metro, simulator, emulator, build) goes through scripts/dev/heavy-job.sh, one at a time, because the machine has 16 GB (CLAUDE.md, Delegation section; scripts/dev/heavy-job.sh lines 2-4).

## Steps

1. Start the local web server. Each command is wrapped in the heavy-job lock as the repo requires. The web dev script runs next dev.  (from `docs/agent-context/commands.json:126 (surfaces.web.dev); apps/web/package.json:6 ("dev": "next dev"); scripts/dev/heavy-job.sh:2-4`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/web dev
   ```

2. Make the local test accounts on the local stack. Run from the repo root. This is idempotent: existing accounts are left as they are. It is not in the heavy-job list, so it runs unwrapped.  (from `docs/development/local-test-accounts.md:11-15; package.json:415 (dev:accounts)`)

   ```bash
   pnpm dev:accounts seed
   ```

3. List the accounts, their plans and how to sign in as each one. The list output is the source of truth for names.  (from `docs/development/local-test-accounts.md:18 and :26`)

   ```bash
   pnpm dev:accounts list
   ```

4. Check the local mobile env file. It must set the API URL to localhost:3000 and the APP_ENV values. The template says to copy .env.local.example to .env.local; the working copy already exists in the tree. The file is not a command.  (from `apps/mobile/.env.local:1-4; apps/mobile/.env.local.example:1-9`)
5. Start the Expo dev server (Metro) for the mobile app, wrapped in the heavy-job lock.  (from `apps/mobile/package.json:8 ("dev": "expo start"); apps/mobile/README.md:40; scripts/dev/heavy-job.sh:2-4`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/mobile dev
   ```

6. Build and launch the app on the iOS Simulator. This is a local native build through expo run:ios; it is heavy and must be wrapped.  (from `apps/mobile/package.json:10 ("ios": "expo run:ios"); apps/mobile/README.md:41`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/mobile ios
   ```

7. Build and launch the app on the Android emulator. The docs name only the command; the emulator setup is not documented.  (from `apps/mobile/package.json:9 ("android": "expo run:android"); apps/mobile/README.md:42`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/mobile android
   ```

8. Optional, for a physical iPhone only. The script refuses to run without an Apple Development signing identity for the AGI team. It also runs an expo prebuild with --clean, which regenerates the native ios folder.  (from `apps/mobile/package.json:11; apps/mobile/README.md:43; apps/mobile/scripts/ios-device-dev.sh:22-24 (signing check), and the prebuild line in the same script`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/mobile ios:device:dev
   ```

9. Sign in as a local test account (see sign_in below). Then check the mode and plan in the app. The docs do not give the exact control labels.  (from `docs/development/local-test-accounts.md:54-64; scripts/mobile.md M-1 (baseline)`)
10. Reset one account to its seed between runs, so plan, usage, credits and settings go back. Conversations, projects and files survive a reset.  (from `docs/development/local-test-accounts.md:17 and :22`)

   ```bash
   pnpm dev:accounts reset <name>
   ```

11. For the age step, clear the five adult_eligibility_* columns on the account's profiles row in the local database and sign in again. Re-run the reset command to restore the decision.  (from `docs/development/local-test-accounts.md:48-52`)

## Signing in

Local test accounts are Clerk development-instance users with the address agi-dev-<name>+clerk_test@example.com. Open http://localhost:3000/login in a browser, enter that address and the code 424242. The Clerk development instance accepts that fixed code for +clerk_test addresses and sends no mail (docs/development/local-test-accounts.md:61-64). The name comes from pnpm dev:accounts list (md:18). Accounts: free, basic, premium, max, ultra, team, team-member, extra-usage, window-nearly-full, stripe-premium, lane-chrome, lane-vscode, lane-desktop, lane-cli, lane-mobile, lane-credits (md:30-39). The mobile app's own sign-in is described only as an "actual browser handoff" in the baseline (scripts/mobile.md, M-1). The 424242 code is documented for the web /login page only.

## Modes

| Mode | How | From |
|---|---|---|
| Local on the device | The app needs no account. Start the mobile app with the steps above and choose the Local mode in the app. Local mode is also documented as needing no account and running the model on the device (docs/runbooks/mobile-store-first-release.md:59). The baseline's M-7 needs a compatible local model downloaded while online, then the device set offline; the files do not say how the model is downloaded or where the Local control is. A simulator can check the UI only, not the real on-device model result (scripts/mobile.md M-7, line 13). | `docs/runbooks/mobile-store-first-release.md:59; scripts/mobile.md M-1 (line 7) and M-7 (line 13)` |
| Cloud on the Free plan | Start the app as above. Sign in with the free account (agi-dev-free+clerk_test@example.com, code 424242 at localhost:3000/login). Choose Cloud where the app offers it, and check that the route label and plan read Free. The baseline says choose Cloud where applicable. The local env points the API at http://localhost:3000 (apps/mobile/.env.local:3). The docs describe Cloud as talking to https://agiworkforce.com (store runbook:60); the files do not say what happens to Cloud when the API URL is localhost. | `docs/development/local-test-accounts.md:30 (free account); apps/mobile/.env.local:3; scripts/mobile.md M-1 (line 7)` |
| Cloud for a subscribed user | Start the app as above. Sign in with an entitled account: premium (the subscribed plan with extra usage), or lane-mobile, which the docs name as the top individual plan for the mobile lane (md:30-37). Check that the plan and the Cloud route show entitled usage. The baseline fixture needs an already-entitled account with available Cloud credit. For a Stripe-billed test account use stripe-premium or lane-credits (md:36-39). | `docs/development/local-test-accounts.md:30-39; scripts/mobile.md Fixtures section` |

## How to tell it is running

The dev server (expo start) runs as a Metro bundler, and the simulator or emulator launches the app after expo run:ios or expo run:android. The docs do not describe the Metro terminal output or the first screen. The baseline's success test for M-1 is a usable chat composer in under 60 seconds, on the correct route. Local: the chat works with no sign-in. Cloud: after sign-in the app shows the correct route label. On the web side, dev:accounts list prints each account's live state as the meters read it (local-test-accounts.md:18). The on-screen route and plan label text is not documented.

## Cannot be done on this computer

- A physical iPhone build with the company signing identity. ios:device:dev refuses without an Apple Development certificate for team D2PR62RLT4 (apps/mobile/scripts/ios-device-dev.sh:22-24; docs/runbooks/mobile-eas-signing.md). The team ID is listed at mobile-eas-signing.md:14.
- EAS cloud builds (build:dev, build:preview, build:prod). They need the EAS CLI authenticated with the release-owner account (docs/runbooks/mobile-eas-signing.md:25-27; apps/mobile/package.json build scripts).
- Store signing, TestFlight and Google Play submissions. Those need the App Store Connect key in apps/mobile/secrets and the Play service account (docs/runbooks/mobile-eas-signing.md:37-40; docs/runbooks/mobile-store-first-release.md).
- Local-mode proof of the on-device model with the network off. M-7 must be run on each real iPhone and Android phone; a simulator run checks the UI only (scripts/mobile.md:13).
- The built-in Apple model generating a reply on the simulator. The store runbook says it shows ready on the simulator but cannot generate there (docs/runbooks/mobile-store-first-release.md:87 and :1853).
- Real camera, real microphone and real file picks. The baseline fixture notes a virtual camera proves UI flow only (scripts/mobile.md Fixtures section, M-4 and M-5).
- Any iPad coverage. The store runbook records that no iPad screen was exercised (docs/runbooks/mobile-store-first-release.md:88).
- Clerk production sign-in. Local accounts are on the development instance only (docs/development/local-test-accounts.md:41).

## Not found in the project's documents

Steps a tester needs that the documents do not give. Work them out on first use and write them here.

- The exact in-app control, label or screen where a tester chooses Local or Cloud, and the label text of the route and plan indicators. The baseline says only select Local, choose Cloud, switch to Cloud (scripts/mobile.md M-1, M-7, M-8).
- The mobile sign-in steps: the browser handoff URL, whether the 424242 code works through the mobile handoff, and where it returns. The code is documented only for http://localhost:3000/login in a browser (local-test-accounts.md:61-64).
- Whether the Clerk key in apps/mobile/.env.local (a pk_test_ key) belongs to the same development instance that dev:accounts seeds. The template says a blank key uses the built-in development instance and to set the key when the local API validates another instance (apps/mobile/.env.local.example:13-15). The files do not confirm the match.
- Whether Expo or Metro must be restarted after editing apps/mobile/.env.local. The troubleshooting doc covers only clearing the Metro cache for className issues (docs/development/troubleshooting.md:111-113).
- What the local ports 3001 (EXPO_PUBLIC_GATEWAY_URL) and 4000 (EXPO_PUBLIC_WS_URL) serve, and whether any of them is needed for chat. Nothing starts them (apps/mobile/.env.local.example:10-11). Nothing in the docs names a command for them.
- Android emulator setup: installing the SDK, creating an AVD, starting the emulator, or PATH setup. The repo has no emulator command, only expo run:android (apps/mobile/package.json:9).
- How the Android emulator reaches the host's localhost:3000. The files say to use a LAN IP for a physical device (apps/mobile/.env.local.example:7-8) and say nothing about the emulator.
- A simulator boot command (xcrun simctl or similar) or a choice of simulator device. expo run:ios is the only documented path (apps/mobile/package.json:10). The baseline says only that xcrun is on PATH (scripts/mobile.md Fixtures section).
- How a local Free or subscribed account reaches the age step on mobile. The docs describe the web database columns to clear (local-test-accounts.md:48-52), not a mobile screen.
- How the Local on-device model is downloaded, which models are compatible, and where to see the offline indicator. The baseline says to download one while online (scripts/mobile.md M-7), and no file names the steps.
- A documented expected Metro or Expo terminal output, and the first screen on a fresh launch.
- The docs describe Cloud as talking to https://agiworkforce.com (mobile-store-first-release.md:60). The files do not say how the local API URL in apps/mobile/.env.local changes that, or whether Cloud calls go to localhost when it is set.
- The request in the task was to update all documentation with the Haiku 5.5 model. This read-only step did not change any document. That work is not covered by this result.
