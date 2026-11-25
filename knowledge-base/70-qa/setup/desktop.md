---
id: "DOC-70-qa-setup-desktop"
type: "setup"
title: "Running the Desktop app locally"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Running the Desktop app locally

Written 2026-11-24 from the project's own documents and scripts by reading them. **The commands below were not run by the session that wrote this page.** Each step names the file it came from; if a step fails, read that file.

**Local web server:** wherever a step below starts the web app, use the compiled build described in `web.md` on port 3000. It is what the Web checks ran against and it behaves like the released app; a development server does not.

## What it is

The public AGI Desktop is an Electron shell. Its window loads the hosted web app (production https://agiworkforce.com by default). For local testing, an unpackaged build can be pointed at localhost with the AGI_CLOUD_APP_ORIGIN environment variable. AGI Code (coding sessions on local folders) runs in a bundled CLI process that the Electron shell starts.

## Needed first

- macOS with pnpm available and the repository checked out at ~/Desktop/agiworkforce (docs/agent-context/commands.json:5 runs pnpm install). The docs in the files do not state a required Node or pnpm version for this path (apps/desktop/README.md:163 says Node 24 is needed only for the GPUI build).
- Dependencies installed (pnpm install). The Electron dependency is electron ^44.10.2 (apps/desktop/package.json:168).
- apps/web/.env.local present, with Clerk development keys and Stripe test-mode keys. The dev-accounts commands refuse to run without them (docs/development/local-test-accounts.md:70-78). The example file is apps/web/.env.local.example.
- CLERK_AUTHORIZED_PARTIES set (docs/development/troubleshooting.md:62-64; apps/web/lib/validate-env.ts:68).
- A running local web server (step 4 below). The Electron window loads whatever origin it is given, so the web server must be up first.
- A local database for the local stack. The documents refer to it (local-test-accounts.md:41-45, 'the local database') but do not say how to start it.

## Steps

1. From the repository root, install workspace dependencies. The docs list this as the install command. It is not named as a heavy job in the docs.  (from `docs/agent-context/commands.json:5`)

   ```bash
   pnpm install
   ```

2. Check that apps/web/.env.local exists and holds the Clerk development and Stripe test-mode keys. The dev-accounts commands read this file, and the local web server reads the same file.  (from `docs/development/local-test-accounts.md:20-21 and :70-78; apps/web/.env.local.example:5 (NEXT_PUBLIC_APP_URL=http://localhost:3000), :11, :15 (CLERK_AUTHORIZED_PARTIES)`)
3. From the repository root, create the local test accounts. This makes every account that does not exist yet. Existing accounts are left as they are.  (from `docs/development/local-test-accounts.md:15; package.json:415`)

   ```bash
   pnpm dev:accounts seed
   ```

4. Start the local web server in its own terminal and leave it running. Wrap it in the heavy-job lock, because dev servers are heavy jobs and only one may run at a time. The web app then serves http://localhost:3000.  (from `docs/agent-context/commands.json:126 (the command is pnpm --filter @agiworkforce/web dev); apps/web/package.json:6 (dev is next dev); scripts/dev/heavy-job.sh:2-4 (usage and heavy-job rule); http://localhost:3000 from apps/web/.env.local.example:5 and docs/development/local-test-accounts.md:61`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/web dev
   ```

5. Build the Electron main process. Run this through the heavy-job lock. The dev:electron script in step 6 also builds, so this step is only needed if you want the build done first.  (from `apps/desktop/package.json:15 (build:electron = node electron/build-main.mjs); scripts/dev/heavy-job.sh:2-4`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/desktop build:electron
   ```

6. Set the Clerk development publishable key in the shell that will launch Electron. Without it, the window sends that Clerk tenant's sign-in host to the browser instead of showing it. The key's value is not in the docs; the owner supplies it.  (from `docs/architecture/desktop-local-runtime.md:346-348; apps/desktop/electron/config.ts:20 and :127`)

   ```bash
   export VITE_CLERK_PUBLISHABLE_KEY=<development publishable key from the Clerk dev instance>
   ```

7. Launch the Electron shell pointed at the local web server. The environment variable is honored only in an unpackaged build, which is what this is. Plain http is allowed only for localhost. The example in the docs uses port 3100, which conflicts with port 3000 used everywhere else; this step uses 3000.  (from `docs/architecture/desktop-local-runtime.md:343 (the same command with port 3100); apps/desktop/electron/config.ts:58-73 (cloudAppOriginFrom: env honored only when not packaged; otherwise production); apps/desktop/electron/config.ts:46-52 (http only for localhost); docs/architecture/desktop.md:141`)

   ```bash
   cd ~/Desktop/agiworkforce/apps/desktop && AGI_CLOUD_APP_ORIGIN=http://localhost:3000 pnpm exec electron .
   ```

8. The equivalent launch that also builds first, using the package script. The variable is set on the same line.  (from `apps/desktop/README.md:40 (Electron dev shell = pnpm --filter @agiworkforce/desktop dev:electron); apps/desktop/package.json:16 (build:electron then electron .)`)

   ```bash
   AGI_CLOUD_APP_ORIGIN=http://localhost:3000 pnpm --filter @agiworkforce/desktop dev:electron
   ```

9. Find the account address to sign in with. The list command prints each account, its seed, its live state, and how to sign in as it.  (from `docs/development/local-test-accounts.md:18; package.json:415`)

   ```bash
   pnpm dev:accounts list
   ```

10. Sign in inside the Electron window with the account address and the fixed code.  (from `docs/development/local-test-accounts.md:61-64 (open http://localhost:3000/login, use agi-dev-<name>+clerk_test@example.com, code 424242)`)
11. After a test session, put the account back to its seed. Conversations, projects and files survive a reset; plan, usage, credits and settings go back to the seed.  (from `docs/development/local-test-accounts.md:17 and :20-21; docs/agent-context/commands.json:27`)

   ```bash
   pnpm dev:accounts reset <name|all>
   ```


## Signing in

Use a seeded local test account, one per plan and one per lane (docs/development/local-test-accounts.md:30-38). Names include free, basic, premium, max, ultra, team, team-member, and lane-desktop (the top individual plan for the Desktop lane). Get the exact address from pnpm dev:accounts list (local-test-accounts.md:18). Address format: agi-dev-<name>+clerk_test@example.com. Code: 424242. The Clerk development instance accepts that fixed code for +clerk_test addresses and sends no mail (local-test-accounts.md:61-64). The Playwright helper signInAsDevAccount in apps/web/e2e/qa-capability-harness.ts is for specs, not hand testing (local-test-accounts.md:56-58). Use one account per tester or lane and reset it afterwards (local-test-accounts.md:56-58).

## Modes

| Mode | How | From |
|---|---|---|
| Cloud, for a subscribed user | Launch Electron with AGI_CLOUD_APP_ORIGIN=http://localhost:3000 (step 6 or 7) and sign in as a paid seeded account, such as premium, or lane-desktop for the Desktop lane (local-test-accounts.md:30-38). Desktop chat is Managed Cloud only: it does not accept provider API keys or expose Local/BYOK chat (docs/architecture/desktop.md:100-109). Cloud conversations and account state are shared with the web app (desktop.md:100-109). The plan a seeded account has is set by its seed, and pnpm dev:accounts reset <name> puts it back (local-test-accounts.md:17). | `docs/architecture/desktop.md:100-109; docs/development/local-test-accounts.md:17, :30-38; apps/desktop/electron/config.ts:58-73` |
| AGI Code on a local model | In the Electron window, add a local folder to AGI Code first. A session cannot open until its folder is added (apps/desktop/electron/main.ts:797-798). A coding session runs the bundled CLI, which can use a local model set up in the CLI (docs/architecture/desktop.md:110-119 under Host Developer). The public Electron dispatcher refuses local-inference commands and reports localModels: false (docs/architecture/desktop.md:100-109; docs/architecture/desktop-local-runtime.md:14-17). The docs do not give the steps to choose or set up a local model inside the app. The Electron package lists @agiworkforce/providers-ollama and @agiworkforce/providers-lmstudio as dependencies (apps/desktop/package.json:73-74); that is the only mention of these providers. | `apps/desktop/electron/main.ts:797-798; docs/architecture/desktop.md:100-119; docs/architecture/desktop-local-runtime.md:14-17; apps/desktop/README.md:226-233; apps/desktop/package.json:73-74` |
| AGI Code on the user's own key | Same path as local-model Code: add a folder, then a coding session runs the bundled CLI, which can use a provider key set up in the CLI (docs/architecture/desktop.md:110-119). Desktop Cloud chat accepts no provider keys (desktop.md:100-109). Provider or tool secrets stay in the operating-system credential store (desktop.md:110-119). The baseline test protocol D-9 describes supplying a test provider key in a native secret field, with a visible provider label on turns (docs/development baseline at ~/.cache/agi-audit/leader-docs/2026-11-22/results/baseline/scripts/desktop.md:15). That is a test protocol, not a setup guide, and the docs do not describe that field in the Electron app. | `docs/architecture/desktop.md:100-119; apps/desktop/README.md:135-136 (no provider key or Local session is moved into Cloud); ~/.cache/agi-audit/leader-docs/2026-11-22/results/baseline/scripts/desktop.md:15` |

## How to tell it is running

The web server is up when http://localhost:3000 opens the AGI web app in a browser. The docs do not give the exact ready message that next dev prints. The Electron window loads the origin it was given. With the variable set, it shows the web app at localhost:3000, not agiworkforce.com (apps/desktop/README.md:28-30; docs/architecture/desktop.md:141). The sign-in page at /login should load and accept the fixed code 424242 for a +clerk_test address (local-test-accounts.md:61-64). If the sign-in page hands off to the browser instead of loading in the window, VITE_CLERK_PUBLISHABLE_KEY is missing from the shell (desktop-local-runtime.md:346-348). If the window shows production, AGI_CLOUD_APP_ORIGIN was not set in the environment of that launch (config.ts:58-73). The docs do not describe any other visible indicator, such as the origin shown in the UI or a tray icon.

## Cannot be done on this computer

- A signed, notarized public release (DMG or ZIP) needs the Developer ID Application certificate (AGI AUTOMATION LLC, D2PR62RLT4) in the login keychain and an App Store Connect .p8 key file, plus notarization (docs/runbooks/desktop-electron-macos-release.md:13-17, 21-32). The local release script runs only on an Apple silicon Mac (scripts/release/build-desktop-mac-local.sh:20-25). It refuses a dirty tree, a missing certificate or an unreadable key (runbook:41-42). It never publishes (runbook:43-46), and publishing is a separate owner-approved step (runbook:45-46).
- GitHub Actions release (.github/workflows/release-desktop-cloud.yml) needs the macos-release environment secrets APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_API_KEY, APPLE_API_ISSUER and APPLE_API_PRIVATE_KEY (runbook:50-55). Environment secrets on a private repository need a paid GitHub plan (runbook:54-55). Not on this machine.
- Post-release verification on a Mac that did not build the release: codesign --verify, spctl --assess and xcrun stapler validate, install from the published DMG, and an update check (runbook:57-62). The runbook requires a different Mac for this step.
- Auto-update to a newer signed build needs an already-published newer signed build (docs/development/desktop baseline D-10: ~/.cache/agi-audit/leader-docs/2026-11-22/results/baseline/scripts/desktop.md:15-16). The baseline says to record blocked and defer to the owner if none exists.
- Installing the owner-supplied signed release through the normal OS installer (baseline D-1, desktop.md:7). Requires that release.
- Native screen-reader acceptance and physical IME acceptance are open gates (apps/desktop/README.md:97-98 and :289-292). These are listed for the GPUI and Terminal surfaces, and the docs say they need live checks on a real machine.
- Real phone or mobile testing: the Desktop docs do not cover it, and nothing in the Desktop files runs on a phone.
- Live Stripe billing: the dev-accounts refusal list blocks a live-mode Stripe key (docs/development/local-test-accounts.md:76-77). Only Stripe test mode is allowed locally.
- Production or live Clerk instances: the dev-accounts tooling refuses a Clerk key that belongs to a production instance (local-test-accounts.md:75).

## Not found in the project's documents

Steps a tester needs that the documents do not give. Work them out on first use and write them here.

- The port the web server listens on is not set in apps/web/package.json (line 6 is next dev with no port). Port 3000 comes only from apps/web/.env.local.example:5 and the local-test-accounts.md:61 link.
- The example launch in docs/architecture/desktop-local-runtime.md:343 uses AGI_CLOUD_APP_ORIGIN=http://localhost:3100. This conflicts with port 3000 in apps/web/.env.local.example:5 and local-test-accounts.md:61. The docs do not say which is right. This plan uses 3000.
- Environment variable name conflict: apps/web/.env.local.example:11 uses NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, but the Electron shell reads VITE_CLERK_PUBLISHABLE_KEY from the shell (desktop-local-runtime.md:346-348; config.ts:20). The docs do not say whether both must be set.
- apps/web/.env.local.example:6 sets NEXT_PUBLIC_API_URL to http://localhost:3001/api. The docs do not say what runs on port 3001, or whether it must be started for this path.
- Conflict in the troubleshooting doc: docs/development/troubleshooting.md:58-60 says a Clerk development publishable key (pk_test_) forces a handshake redirect and that a live-format key is needed for automation. The local-test-accounts doc uses the Clerk development instance (local-test-accounts.md:41-42). The docs do not reconcile these.
- How to start the local database (Postgres) that the local stack needs. The docs refer to it but give no command.
- A readiness message from the web server or the Electron window to confirm the app is up.
- How to stop the web server, the Electron process and the dev environment cleanly.
- pnpm dev:desktop is the Tauri app, not Electron: apps/desktop/package.json:8 (dev = tauri dev) and docs/agent-context/commands.json:91. A tester who wants the Electron window must use dev:electron or pnpm exec electron ., not dev:desktop.
- Setting a local model in the Electron app: the docs do not say how to download, select or start a local model (Ollama or LM Studio) for AGI Code.
- Setting a provider key in the Electron app's CLI: the docs do not give the screen, command or field. The baseline D-9 mentions a native secret field, but no doc describes it for Electron.
- How to choose AGI Code's mode (Local or BYOK) in the window, and how a visible provider label is displayed. docs/architecture/desktop.md only states it in general terms.
- Electron's window-level indicators of the active origin, mode or account. The docs describe none.
- A test folder for AGI Code. The baseline D-4 names a disposable code-bench repository, but no doc in the files I read gives its location or how to create it.
- Whether the Electron launch itself (not the build) counts as a heavy job under scripts/dev/heavy-job.sh. The header of that script lists builds, full suites, tsc, cargo, dev servers, browsers, emulators and git push, and does not name the Electron window. The CLAUDE.md delegation section adds the same list.
- A Node version for the Electron path. The only Node version in the desktop docs is Node 24 for the GPUI build (apps/desktop/README.md:163).
- Any document that combines the web server, the Electron launch and the account seed in one checked procedure. The pieces are in local-test-accounts.md, desktop-local-runtime.md:340-343 and the desktop README, and the steps above join them.
