---
id: "DOC-70-qa-setup-vscode"
type: "setup"
title: "Running the VS Code app locally"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Running the VS Code app locally

Written 2026-11-24 from the project's own documents and scripts by reading them. **The commands below were not run by the session that wrote this page.** Each step names the file it came from; if a step fails, read that file.

**Local web server:** wherever a step below starts the web app, use the compiled build described in `web.md` on port 3000. It is what the Web checks ran against and it behaves like the released app; a development server does not.

## What it is

AGI Code is a VS Code extension (publisher agiworkforce, version 0.0.2, public preview) that puts an AGI chat in the Activity Bar and an @agi participant in VS Code Chat. Chat, agent runs and session history run through the local `agi` CLI (`agi app-server`), not through the web app; the web app at localhost:3000 is used for sign-in, the Cloud account, usage and the Cloud API the extension can be pointed at. (apps/extension-vscode/README.md:17-19, 23-38; docs/development/local-test-accounts.md:7-9)

## Needed first

- macOS with VS Code 1.100 or newer (apps/extension-vscode/README.md:25; apps/extension-vscode/package.json:16-18 engines.vscode ^1.100.0).
- Repository dependencies installed from the root with pnpm install (docs/agent-context/commands.json:5 repoWide.install).
- AGI CLI 0.0.1 or newer available as `agi` on PATH, or installed with the extension command Code: Install AGI CLI, or agiWorkforce.cliPath pointing at a binary (apps/extension-vscode/README.md:26-29; package.json:1232-1236 cliPath default agi). To build the CLI from source the repo gives: cargo install --path apps/cli --bin agi (apps/cli/README.md:61). Cargo is a heavy job.
- apps/web/.env.local, created from apps/web/.env.local.example (its header says: Copy to .env.local and replace blank credential values; apps/web/.env.local.example:2). The local stack needs a Clerk development-instance key, a Stripe test-mode key and a loopback DATABASE_URL (docs/development/local-test-accounts.md:20, 66-79). The file already exists in this checkout; its contents were not read because they are secrets.
- A Postgres database on loopback. The docs name one route: node scripts/dev-db-ws-proxy.mjs against a loopback Postgres, with AGI_DATABASE_WS_PROXY=127.0.0.1:5433 (apps/web/.env.example:75-76). How to install or start Postgres is not documented.
- A trusted VS Code workspace folder. In a restricted workspace the local app-server is not started, so chat waits (apps/extension-vscode/README.md:30-34).
- Heavy local work goes through scripts/dev/heavy-job.sh, one job at a time on this 16 GB machine (scripts/dev/heavy-job.sh:1-5; CLAUDE.md Delegation section). The docs do not say whether pnpm install or pnpm dev:accounts count as heavy.

## Steps

1. Install the repository dependencies from the repository root.  (from `docs/agent-context/commands.json:5 (repoWide.install)`)

   ```bash
   pnpm install
   ```

2. Create apps/web/.env.local from the example and fill the blank credential values (Clerk development key, Stripe test key, DATABASE_URL, secrets). The copy command itself is not written in the docs.  (from `apps/web/.env.local.example:2; docs/development/local-test-accounts.md:20`)
3. Start the local Postgres route the docs name: the websocket proxy to a loopback Postgres, with AGI_DATABASE_WS_PROXY set to 127.0.0.1:5433 in the env file. Starting Postgres itself is not documented.  (from `apps/web/.env.example:75-76`)

   ```bash
   node scripts/dev-db-ws-proxy.mjs
   ```

4. Start the local web server, through the heavy-job gate. The docs name the command but do not state the port; localhost:3000 is taken from docs/development/local-test-accounts.md:61.  (from `docs/agent-context/commands.json:126 (surfaces.web.dev); apps/web/package.json:6 (dev: next dev); scripts/dev/heavy-job.sh:1-7 (usage)`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/web dev
   ```

5. Seed the local test accounts (one per plan and per lane). Run from the repository root.  (from `docs/development/local-test-accounts.md:13-15; docs/agent-context/commands.json:26`)

   ```bash
   pnpm dev:accounts seed
   ```

6. List the accounts, their live state and how to sign in as each.  (from `docs/development/local-test-accounts.md:18; docs/agent-context/commands.json:28`)

   ```bash
   pnpm dev:accounts list
   ```

7. Check the local stack is reachable: open the sign-in page in a browser.  (from `docs/development/local-test-accounts.md:61`)
8. Build the VS Code extension package (VSIX). The package script cleans out/, bundles for production and runs vsce packaging, writing agi-workforce-<version>.vsix into the extension folder. Run through the heavy-job gate. A 0.0.2 file already exists in apps/extension-vscode.  (from `apps/extension-vscode/package.json:1571 (package script); apps/extension-vscode/src/test/runTests.ts:142 (VSIX file name pattern)`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter agi-workforce package
   ```

9. Verify the VSIX before installing it: safe paths, no source or maps, the four runtime files, manifest identity, icon, README and license.  (from `apps/extension-vscode/package.json:1572; docs/runbooks/vscode-marketplace-publish.md:47-50`)

   ```bash
   pnpm --filter agi-workforce verify:package
   ```

10. Install the built .vsix into VS Code. The docs give only a Marketplace-ID install into a named clean profile; installing a local .vsix by file path is not documented. The clean-profile form is the one the docs use for release smoke checks.  (from `docs/runbooks/vscode-marketplace-publish.md:251-254 (documented for the Marketplace ID only; the path form is not in the docs)`)

   ```bash
   code --profile agi-release-smoke --install-extension agiworkforce.agi-workforce
   ```

11. Make sure the AGI CLI is available: run Code: Check the CLI in This Environment, or Code: Install AGI CLI if it is missing. Install needs a signed release (see cannot_be_done).  (from `apps/extension-vscode/package.json:122-128 (commands checkCli, installCli); apps/extension-vscode/README.md:43; docs/runbooks/vscode-marketplace-publish.md:68-71`)
12. Open the AGI Code panel in a trusted folder. The keyboard shortcut on macOS is Cmd+Shift+A.  (from `apps/extension-vscode/README.md:42-45; apps/extension-vscode/package.json:1487-1490 (keybinding chat cmd+shift+a)`)
13. Sign in or set credentials for the mode being tested (see modes). For the local web stack, the local test accounts sign in at the web login page.  (from `docs/development/local-test-accounts.md:54-64`)
14. Point the extension's Cloud API at the local server, for Cloud testing. The validator accepts http://localhost, 127.0.0.1 and [::1]. The docs do not say to do this for local testing; the value http://localhost:3000/api/llm/v1 is composed from the default path and is unverified.  (from `apps/extension-vscode/src/utils/api.ts:727-750 (ENDPOINT_ALLOWED_HOSTS, validateEndpointUrl); apps/extension-vscode/package.json:1214-1217 (agiWorkforce.apiEndpoint default https://agiworkforce.com/api/llm/v1)`)
15. Reset a test account to its seed after a session, so it is not shared.  (from `docs/development/local-test-accounts.md:17; docs/agent-context/commands.json:27`)

   ```bash
   pnpm dev:accounts reset <name|all>
   ```


## Signing in

The documented route is the local Clerk development instance. Open http://localhost:3000/login, enter the account's address agi-dev-<name>+clerk_test@example.com (the name is shown by `pnpm dev:accounts list`), and enter the code 424242. Clerk's development instance accepts that fixed code for +clerk_test addresses and sends no mail (docs/development/local-test-accounts.md:61-64). Accounts are: free, basic, premium, max, ultra, team, team-member, extra-usage, window-nearly-full, stripe-premium, lane-chrome, lane-vscode, lane-desktop, lane-cli, lane-mobile, lane-credits (docs/development/local-test-accounts.md:30-39). Use one account per tester run and reset it afterwards. The extension's own sign-in is Code: Sign In to AGI Cloud, which uses a browser-approved device flow and stores the credential in VS Code SecretStorage (apps/extension-vscode/package.json:157-160; apps/extension-vscode/docs/CONTRIBUTING-NOTES.md:74-76). Which web host that device flow calls on a local setup is not documented.

## Modes

| Mode | How | From |
|---|---|---|
| Local model | Chat runs through the local agi CLI on this machine, and local models stay on the device. The CLI docs name Ollama as a pre-registered provider and say custom providers go in ~/.agiworkforce/config.toml. They do not give steps for installing or starting a local model. Choose the model with Code: Select Model (setting agiWorkforce.model, default auto). A Local default model is never swapped for a cloud model. The chat header shows the Local boundary label. | `apps/extension-vscode/README.md:166-170, 185-188; apps/cli/README.md:159-176; apps/extension-vscode/package.json:187-190, 1219-1222; apps/extension-vscode/docs/CONTRIBUTING-NOTES.md:96` |
| Own key (BYOK) | Set a provider key from inside the editor with Code: Set API Key (package.json:177-180), Code: Manage Provider Keys (package.json:257-260), or Code: Sign In with Provider (package.json:330-333). On the CLI side, `agi login anthropic` stores a provider key (apps/cli/README.md:64-68). Provider keys send directly to the named provider, and the chat header names BYOK. The docs do not say which keys the extension stores in SecretStorage for this mode. | `apps/extension-vscode/package.json:177-180, 257-260, 330-333; apps/cli/README.md:64-68; apps/extension-vscode/README.md:166-170` |
| Managed Cloud for a subscribed user | Sign in with a subscribed local test account. Use Code: Sign In to AGI Cloud (package.json:157-160), which runs the browser device flow, then Code: Account & Usage, which reads /api/usage (apps/extension-vscode/docs/CONTRIBUTING-NOTES.md:74-78; apps/extension-vscode/README.md:126). Pick a paid account from the list, for example lane-vscode, which the docs describe as the top individual plan (docs/development/local-test-accounts.md:37-38). To send requests to the local server, set agiWorkforce.apiEndpoint to the local URL (package.json:1214-1217; src/utils/api.ts:727-750). That last step is not in the docs and is unverified. Managed Cloud sends to AGI infrastructure, and the chat header names it before a request is sent. | `apps/extension-vscode/package.json:157-160, 1214-1217; apps/extension-vscode/docs/CONTRIBUTING-NOTES.md:74-78; docs/development/local-test-accounts.md:37-38; apps/extension-vscode/src/utils/api.ts:727-750; apps/extension-vscode/README.md:166-170` |

## How to tell it is running

Web: the local stack answers at http://localhost:3000, and http://localhost:3000/login shows the sign-in page for the +clerk_test address (docs/development/local-test-accounts.md:61). The text the dev server prints is not in the docs. Account state: `pnpm dev:accounts list` prints each account, its live state and how to sign in (docs/development/local-test-accounts.md:18). Extension: the AGI Code icon shows in the Activity Bar, and the panel opens from it or from Cmd+Shift+A (apps/extension-vscode/README.md:44-45). The status bar shows the active model and any non-default agent mode (README.md:81-82). The chat header names the boundary in use before each request: Local, BYOK or Managed Cloud (README.md:166-170). Code: Check the CLI in This Environment reports whether the CLI is found (package.json:122-124). The baseline pass for chat (task V-2 in the leader-docs baseline vscode.md) is a correct streamed answer with a visible stop control.

## Cannot be done on this computer

- Installing the CLI through Code: Install AGI CLI needs a signed release: it downloads from https://agiworkforce.com/install.sh, which accepts only a signed release. Until the first signed CLI release exists, a Marketplace install has no working chat (docs/runbooks/vscode-marketplace-publish.md:66-73). The blocker is recorded in audit/blockers/14-desktop-and-vscode-need-unpublished-cli.md (named in that runbook).
- Publishing or updating the Marketplace listing needs the owner's Microsoft, Azure and Eclipse accounts, the publisher agiworkforce and an Azure federated credential. The owner approves the publish job (docs/runbooks/vscode-marketplace-publish.md:90-107, 157-163). A tester cannot do this step.
- Verifying the published listing needs the Marketplace listing and a clean profile after publication (docs/runbooks/vscode-marketplace-publish.md:244-258). This is for the owner after release.
- Native test runs with a VS Code executable: the test runner downloads a pinned VS Code version unless --vscode-executable is passed (apps/extension-vscode/docs/CONTRIBUTING-NOTES.md:60-64). This is a test path, not the hands-on path.
- Real AGI accounts and live Clerk or Stripe keys: local-test-accounts refuses production Clerk keys and live-mode Stripe keys, and refuses non-loopback databases (docs/development/local-test-accounts.md:66-79).
- No signing certificate, real phone or second machine is named for the hands-on VS Code path in the files read. The CLI docs name macOS's sandbox-exec (Seatbelt) as shipped with macOS for sandboxed commands (apps/cli/README.md:82). No VSIX code-signing requirement is documented.

## Not found in the project's documents

Steps a tester needs that the documents do not give. Work them out on first use and write them here.

- The dev-server port. The docs name `pnpm --filter @agiworkforce/web dev` (docs/agent-context/commands.json:126) and `next dev` (apps/web/package.json:6), but no file says the server binds to localhost:3000 or gives the output text to expect.
- How to install or start Postgres. Only the websocket proxy route to a loopback Postgres is named (apps/web/.env.example:75-76).
- Node and pnpm version requirements for the repo or the extension. The extension engine is only VS Code ^1.100.0 (apps/extension-vscode/package.json:16-18).
- A command to install a local .vsix by file path. The docs show only `code --profile agi-release-smoke --install-extension agiworkforce.agi-workforce` for the Marketplace ID (docs/runbooks/vscode-marketplace-publish.md:254).
- Where the `code` VS Code CLI is on PATH, and the VS Code UI steps for Install from VSIX.
- A documented way to point the extension at http://localhost:3000 for local testing. The validator allows localhost (src/utils/api.ts:727-750), but no doc says to set agiWorkforce.apiEndpoint that way.
- Which host the Code: Sign In to AGI Cloud device flow and the agi login device flow use on a local stack. Not documented.
- Steps for a Local model: installing Ollama or another local model, starting it, and selecting it in the extension. Only the provider name is listed (apps/cli/README.md:176).
- A fixed sample project, the sum.py fixture and a 'fresh fixture' for baseline tasks V-3 and V-6 (leader-docs baseline vscode.md). Not found in the docs read.
- The shared run protocol and scorecard that the baseline script refers to ('Run protocol', ../README.md in the baseline folder). Not read by this task.
- A troubleshooting section for the VS Code extension. docs/development/troubleshooting.md has no VS Code entry; its local-run entries (docs/development/troubleshooting.md:56-80) cover the web stack only.
- Whether `pnpm dev:accounts` or `pnpm install` count as heavy jobs under the heavy-job rule. The docs do not classify them. The rule covers builds, full suites, tsc, cargo, dev servers, browsers, emulators and git push (scripts/dev/heavy-job.sh:3-4).
- Inconsistency in docs/agent-context/commands.json: the surfaces.extension block (lines 159-160) uses the filter @agiworkforce/extension, but the extension's package name is agi-workforce (apps/extension-vscode/package.json:2). Use the vscodeExtension block (lines 162-169), which uses agi-workforce.
- The heavy-job gate's minimum free memory and wait. Defaults are AGI_HEAVY_MIN_FREE_GB=3 and a 900-second wait (scripts/dev/heavy-job.sh:30, 34). These come from the script; the docs do not mention them.
