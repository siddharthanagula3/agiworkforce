---
id: "DOC-70-qa-setup-chrome"
type: "setup"
title: "Running the Chrome app locally"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Running the Chrome app locally

Written 2026-11-24 from the project's own documents and scripts by reading them. **The commands below were not run by the session that wrote this page.** Each step names the file it came from; if a step fails, read that file.

**Local web server:** wherever a step below starts the web app, use the compiled build described in `web.md` on port 3000. It is what the Web checks ran against and it behaves like the released app; a development server does not.

## What it is

The AGI Chrome extension is a Manifest V3 side panel that chats with AGI Managed Cloud and, on sites the user approves, reads and acts on the page. For local testing, Vite builds it into apps/extension/dist, Google Chrome loads that folder unpacked, and the extension and the web app both point at http://localhost:3000.

## Needed first

- Node 24 and the pnpm pinned by packageManager (CONTRIBUTING.md:10-13; apps/extension/package.json:74-77 requires node >=24.0.0 and pnpm >=9.15.3).
- Google Chrome 132 or later (docs/runbooks/chrome-web-store-publish.md:296; apps/extension/manifest.json:87). Incognito is not allowed (manifest.json:9).
- Dependencies installed with pnpm install (CONTRIBUTING.md:16).
- apps/web/.env.local from apps/web/.env.local.example, with Clerk development keys (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY), a local DATABASE_URL and the secrets (apps/web/.env.local.example:10-24).
- A local database: a Postgres URL must name 127.0.0.1, localhost, ::1, a *.localhost or a *.test host (docs/development/local-test-accounts.md:71-74).
- A Stripe test-mode key; the account commands stop when it is missing or live-mode (local-test-accounts.md:76-77).
- apps/extension/.env.local from apps/extension/.env.local.example (apps/extension/.env.example:4).
- python3 on the PATH for scripts/dev/heavy-job.sh (scripts/dev/heavy-job.sh:4-5).

## Steps

1. Install the repository dependencies from the repository root.  (from `CONTRIBUTING.md:16`)

   ```bash
   pnpm install
   ```

2. Create apps/web/.env.local from the example. Set NEXT_PUBLIC_APP_URL to http://localhost:3000, fill the Clerk development keys and the local database URL. Leave CLERK_AUTHORIZED_PARTIES for step 8.  (from `apps/web/.env.local.example:2, :5, :10-18`)
3. Create apps/extension/.env.local from the example. It already points the extension at localhost:3000 and needs the Clerk values for the development instance paired with the local web app. Leave CHROME_EXTENSION_PUBLIC_KEY unset.  (from `apps/extension/.env.example:4; apps/extension/.env.local.example:2-4, :10-13, :19-20`)
4. Seed the local test accounts from the repository root. Accounts that exist are left unchanged.  (from `docs/development/local-test-accounts.md:15, :20-21; package.json:415`)

   ```bash
   pnpm dev:accounts seed
   ```

5. List the accounts and their sign-in addresses.  (from `docs/development/local-test-accounts.md:18`)

   ```bash
   pnpm dev:accounts list
   ```

6. Start the local web server on localhost:3000 in its own terminal. It is a dev server, so run it through the heavy-job wrapper.  (from `docs/agent-context/commands.json:126 (web.dev); apps/web/package.json:6 (dev = next dev); scripts/dev/heavy-job.sh:2-3; CLAUDE.md:28`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/web dev
   ```

7. Build the extension. The build runs a main pass and a content-script pass and writes the unpacked folder to apps/extension/dist. Wait for it to finish.  (from `docs/runbooks/chrome-web-store-publish.md:64; docs/agent-context/commands.json:157; apps/extension/package.json:25; apps/extension/vite.config.ts:11, :63`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/extension build
   ```

8. In Chrome, open chrome://extensions, turn on Developer mode (top right), choose Load unpacked, and select apps/extension/dist. The runbook says to pick the candidate folder; dist as the local folder is inferred from vite.config.ts:63.  (from `docs/runbooks/chrome-web-store-publish.md:300-301; apps/extension/vite.config.ts:63`)
9. Copy the extension ID from its card in chrome://extensions. Add chrome-extension://<extension-id> to CLERK_AUTHORIZED_PARTIES in apps/web/.env.local, next to http://localhost:3000. Then restart the web server (the restart is not stated in the docs).  (from `apps/web/.env.local.example:13-15; apps/extension/README.md:55-56; docs/development/troubleshooting.md:62-64`)
10. Pin the extension from the puzzle-piece menu. Open the side panel from the toolbar icon or with Command+Shift+K.  (from `docs/runbooks/chrome-web-store-publish.md:301; apps/extension/manifest.json:67-72`)
11. After any change to the extension source or apps/extension/.env.local, run the build again and reload the unpacked extension.  (from `apps/extension/README.md:49-51`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/extension build
   ```

12. Optional, for artifact previews only: run the isolated artifact renderer on port 3002 with the unpacked extension ID. It is a second local server, so run it through heavy-job too.  (from `apps/extension/README.md:55-59; apps/extension/.env.local.example:7`)

   ```bash
   node infrastructure/sandbox/dev.mjs --extension-id <extension-id> --port 3002
   ```


## Signing in

The web app's local sign-in is documented: open http://localhost:3000/login, enter the account address agi-dev-<name>+clerk_test@example.com (name from pnpm dev:accounts list) and the code 424242. Clerk's development instance accepts that code for +clerk_test addresses and sends no mail (docs/development/local-test-accounts.md:61-64). Accounts are: free, basic, premium, max, ultra, team, team-member, extra-usage, window-nearly-full, stripe-premium, lane-chrome, lane-vscode, lane-desktop, lane-cli, lane-mobile, lane-credits (local-test-accounts.md:30-39). Reset an account with pnpm dev:accounts reset <name> rather than sharing one (local-test-accounts.md:17, :58-59). The side panel is signed in through the web session, because the extension reads the sync host's session cookie (apps/extension/docs/threat-model.md:57; apps/extension/.env.local.example:13 sets CLERK_SYNC_HOST=http://localhost:3000). The order "web login first, then open the side panel" is inferred from those two, not stated in the docs. The docs give no side-panel sign-in steps for local dev; the only in-panel steps are the production candidate checks (chrome-web-store-publish.md:303-304).

## Modes

| Mode | How | From |
|---|---|---|
| Cloud (Managed Cloud chat, following the signed-in web account) | No Cloud switch or label is documented. Chrome chat is Managed-Cloud-only with no Local, BYOK or native fallback, so there is nothing to choose. To send extension chat to the local web server, set VITE_AGI_WEB_API_BASE_URL=http://localhost:3000 in apps/extension/.env.local (the example already does), rebuild, and reload. The chat gateway is FREE_TRIAL_GATEWAY = configuredAgiWebOrigin() ?? DEFAULT_AGI_WEB_ORIGIN, and a localhost http origin is accepted. | `apps/extension/docs/threat-model.md:22, :57, :206-208; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:111; apps/extension/src/lib/webOrigin.ts:14-26, :36-41; apps/extension/.env.local.example:4` |
| Permission modes (Auto default, Ask first, YOLO) for actions, not the Cloud chat runtime | Auto is the default and stops for crucial actions. Ask first confirms every action; choose it in the permission menu to test approval cards. Start a task with -yolo or --always-approve for unattended YOLO on approved sites. | `apps/extension/docs/threat-model.md:26-27; apps/extension/README.md:10-14; docs/runbooks/chrome-web-store-publish.md:320` |

## How to tell it is running

Web server: http://localhost:3000/login opens (docs/development/local-test-accounts.md:61). The docs do not describe the next dev terminal output. Extension: after Load unpacked, an AGI Extension card appears in chrome://extensions with an ID (apps/extension/manifest.json:3; apps/extension/README.md:55-56). The toolbar icon has the title AGI Extension (manifest.json:59). The side panel shows the sign-in prompt, then the account and plan after sign-in. If sign-in appears to succeed but API calls return 401 and the panel falls back to sign-in, the CLERK_AUTHORIZED_PARTIES origin is missing (chrome-web-store-publish.md:175-177). Check accounts with pnpm dev:accounts list (local-test-accounts.md:18).

## Cannot be done on this computer

- Chrome Web Store item creation, publisher registration and the developer account fee: owner steps (docs/runbooks/chrome-web-store-publish.md:42-52, :73-75).
- The production package key and item ID (CHROME_EXTENSION_PUBLIC_KEY, CWS_EXTENSION_ID), which exist only after the store item exists (chrome-web-store-publish.md:33-35, :89-96).
- A production Clerk instance, pk_live key and the production secret key, including the allowed_origins change (chrome-web-store-publish.md:60, :154-166).
- The production web deploy, production migrations, the GitHub chrome-web-store environment and Google Cloud workload identity: owner or repository-admin tasks (chrome-web-store-publish.md:107-136, :205-231).
- Microsoft Edge Add-ons publishing through Partner Center (chrome-web-store-publish.md:496-504).
- The Desktop pairing checks need the AGI Desktop app open on this Mac, plus a second Chrome profile, and a Desktop build with the pairing changes (chrome-web-store-publish.md:306-310). This runs on this Mac but depends on the Desktop build.
- Signing certificate, real phone or another machine: none of the documents I read names these for the unpacked local path.

## Not found in the project's documents

Steps a tester needs that the documents do not give. Work them out on first use and write them here.

- The port next dev uses. Only http://localhost:3000 is named for the web app (local-test-accounts.md:61; apps/web/.env.local.example:5). apps/web/.env.local.example:6 sets NEXT_PUBLIC_API_URL=http://localhost:3001/api, and no doc explains 3001.
- Whether the web server or the extension must restart after .env.local edits. The docs say to rebuild and reload the extension (apps/extension/README.md:49-51), and say nothing about restarting the web server after CLERK_AUTHORIZED_PARTIES changes.
- How to start a local Postgres or Neon branch for development. apps/web/.env.local.example:17-18 says only 'Local or development Neon branch'. The migration commands name production or a target with no local target name (chrome-web-store-publish.md:221-224; docs/development/troubleshooting.md:84-87).
- Where to get the Clerk development keys and the development frontend API domain. apps/extension/.env.local.example:12 has the placeholder replace-with-instance.clerk.accounts.dev, and no doc says where the values come from.
- Where to get the Stripe test-mode key (local-test-accounts.md:76-77 names none).
- A conflict to watch: docs/development/troubleshooting.md:58-60 says a Clerk pk_test_ key forces a handshake redirect so authenticated pages never resolve, while docs/development/local-test-accounts.md:41 uses a Clerk development instance for these accounts. The docs do not say which applies on localhost.
- Whether the unpacked ID of a local build stays the same across rebuilds or folder moves. chrome-web-store-publish.md:284-285 covers only the keyless store draft.
- A local load step: no doc names apps/extension/dist for Load unpacked. The Load unpacked steps are written for a release candidate folder (chrome-web-store-publish.md:300-301).
- Any doc for loading the watch build. The script exists (apps/extension/package.json:24, dev = BUILD_TARGET=content vite build && vite build --watch), but no doc says to load it or how to use it with Chrome.
- A side-panel sign-in procedure for local dev. The only in-panel sign-in steps are the production candidate checks (chrome-web-store-publish.md:303-304). The web-login-first order is inferred from threat-model.md:57 and .env.local.example:13.
- A Cloud mode switch or label. The docs say chat is Managed Cloud only (threat-model.md:22, :206-208) and name no Cloud setting.
- A doc/code mismatch: apps/extension/docs/threat-model.md:206-207 says the chat request goes to https://agiworkforce.com/api/llm/v1/chat/completions. The code uses the configured origin, which can be localhost (src/features/cloud-bridge/freeTrialClient.ts:111; src/lib/webOrigin.ts:36-41). Under AGENTS.md section 2 the code wins.
- The fixture pages in the baseline (fixture-a.html and fixture-b.html on a fixture-only loopback origin; chrome.md:9-11). No document I read says where they are or how to serve them.
- How to create a disposable Chrome profile on a Mac. The baseline asks for one (chrome.md:7), and no doc says how.
- Mac-specific Chrome steps beyond Cmd+Q (chrome-web-store-publish.md:314) and the Command+Shift+K shortcut (manifest.json:67-72).
- A commands.json entry for running the extension locally. It lists build, test, testE2E and package for the extension (docs/agent-context/commands.json:150-160) and has no dev or local-run entry.
- Whether pnpm install falls under the heavy-job rule. CLAUDE.md:28 names builds, full suites, tsc, cargo, dev servers, browsers, emulators and git push, and install is not among them.
- The extension watch build under heavy-job. CLAUDE.md:28 covers builds and dev servers, so wrapping it is the conservative reading. No doc says so directly.
