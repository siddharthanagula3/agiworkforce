---
id: "DOC-70-qa-setup-cli"
type: "setup"
title: "Running the CLI app locally"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Running the CLI app locally

Written 2026-11-24 from the project's own documents and scripts by reading them. **The commands below were not run by the session that wrote this page.** Each step names the file it came from; if a step fails, read that file.

**Local web server:** wherever a step below starts the web app, use the compiled build described in `web.md` on port 3000. It is what the Web checks ran against and it behaves like the released app; a development server does not.

## What it is

The AGI CLI is a Rust terminal AI coding agent (binary `agi`, with `agiworkforce` as an alias) with three trust modes: Local (nothing leaves the device), Your key (BYOK, sent straight to a provider key the user owns), and Managed (AGI cloud, which needs a plan that includes Cloud in the CLI). The local test setup points the Managed mode and sign-in at the local Next.js web server on localhost:3000, using accounts seeded by `pnpm dev:accounts`.

## Needed first

- macOS on this computer; the sandbox backend on macOS is `sandbox-exec`, which ships with macOS (apps/cli/README.md:79-82).
- Node >=24.15.0 <25 and pnpm >=10.16.0, the engines in package.json:14-16; packageManager pins pnpm@10.34.7 (package.json:12).
- Rust/cargo is needed to build the CLI from source (apps/cli/README.md:58-62; docs/agent-context/commands.json:148). The docs read do not say how to install Rust.
- The repository's local web stack must be running on localhost:3000 (see the web server steps). The docs say the local web server reads apps/web/.env.local (docs/development/local-test-accounts.md:20-21).
- apps/web/.env.local must exist and be filled in. CLERK_AUTHORIZED_PARTIES is required, or sign-in fails with no useful error (docs/development/troubleshooting.md:62-64). The docs do not give the local value.
- The local database must be reachable on loopback. The accounts tooling refuses any Postgres host other than 127.0.0.1, localhost, ::1, *.localhost or *.test (docs/development/local-test-accounts.md:71-74).
- Heavy jobs (builds, dev servers, cargo, tsc) run one at a time through scripts/dev/heavy-job.sh on this 16 GB machine (CLAUDE.md:25-31; scripts/dev/heavy-job.sh:1-5).

## Steps

1. Install JavaScript dependencies from the repository root, using the frozen lockfile.  (from `docs/development/troubleshooting.md:18-19 (names the command; it is the only install command in the files read)`)

   ```bash
   pnpm install --frozen-lockfile
   ```

2. Seed the local test accounts (one per plan and lane). Run from the repository root. This reads apps/web/.env.local and refuses any non-local database, Clerk production instance or Stripe live key.  (from `docs/development/local-test-accounts.md:13-21, 66-79; package.json:415`)

   ```bash
   pnpm dev:accounts seed
   ```

3. Print the seeded accounts, their live state, and how to sign in as each one. Use this to get the exact address for each account.  (from `docs/development/local-test-accounts.md:18`)

   ```bash
   pnpm dev:accounts list
   ```

4. Start the local web server, the Next.js dev server that serves http://localhost:3000. Wrap it in the heavy-job gate because it is a dev server. Note that the gate holds its lock until the wrapped command exits, so stop the server when done.  (from `docs/agent-context/commands.json:126 (web dev command); apps/web/package.json:6 ("dev": "next dev"); CLAUDE.md:25-31 (dev servers go through heavy-job.sh); scripts/dev/heavy-job.sh:40-41 (the lock is held while the child runs)`)

   ```bash
   scripts/dev/heavy-job.sh pnpm --filter @agiworkforce/web dev
   ```

5. Confirm the web server is answering. The docs name this page as the local sign-in page. Do not use the root `pnpm dev`, which starts the desktop app, not the web server.  (from `docs/development/local-test-accounts.md:61 (open http://localhost:3000/login); docs/agent-context/commands.json:126 vs package.json:414 (root dev is dev:desktop)`)
6. Build the CLI binary from source in release mode, wrapped in the heavy-job gate. Use the command the README gives for a source build of the primary binary.  (from `apps/cli/README.md:406 (build command); docs/agent-context/commands.json:148 (cli build); CLAUDE.md:25-31 (cargo is a heavy job)`)

   ```bash
   scripts/dev/heavy-job.sh cargo build --release -p agiworkforce-cli --bin agi
   ```

7. Alternative to the previous step: install the binary from source with cargo. The README gives this as the source-build route; the doc does not say where cargo puts the binary.  (from `apps/cli/README.md:58-62`)

   ```bash
   scripts/dev/heavy-job.sh cargo install --path apps/cli --bin agi
   ```

8. Check the built binary. The smoke script looks for the release binary at the repository's target folder, so this is the path the repository itself expects.  (from `apps/cli/scripts/cli-smoke.mjs:17 (candidate path ../../target/release/agi); apps/cli/README.md:16 (the README shows `agi` as the start command); docs/runbooks/cli-release.md:280-283 (expect `agi 0.0.1`)`)

   ```bash
   target/release/agi --version
   ```

9. Run the health check. It reports local diagnostics, including the sandbox backend; `--json` gives machine-readable output.  (from `apps/cli/README.md:342-344 (agi doctor, agi doctor --json); apps/cli/README.md:85-86 (agi doctor reports sandbox.os)`)

   ```bash
   target/release/agi doctor
   ```

10. Start the interactive terminal UI from a project folder. This is the default start, with no arguments.  (from `apps/cli/README.md:15-20 and 188-190 (`agi` opens the interactive TUI)`)

   ```bash
   target/release/agi
   ```


## Signing in

The docs describe two sign-in paths. (1) The local web account: open http://localhost:3000/login, enter the account's address, which is agi-dev-<name>+clerk_test@example.com (run `pnpm dev:accounts list` to get it), and enter the code 424242. Clerk's development instance accepts that fixed code for +clerk_test addresses and sends no mail (docs/development/local-test-accounts.md:61-64). (2) The CLI sign-in: `agi login` runs a device-code sign-in in the browser for an AGI account, and `agi login <provider>` stores a provider key (apps/cli/README.md:64-70; apps/cli/src/lib.rs:987-992). The docs do not say that the device-code page accepts a +clerk_test account. A Playwright helper, signInAsDevAccount in apps/web/e2e/qa-capability-harness.ts, signs in with a Clerk ticket, but that is for Playwright specs, not a hands-on tester (docs/development/local-test-accounts.md:56-59). Use one account per lane and reset it afterwards: `pnpm dev:accounts reset <name>` (docs/development/local-test-accounts.md:17, 56-59). The CLI lane account is lane-cli, the top individual plan (docs/development/local-test-accounts.md:37-39). Check sign-in with `agi auth-status` (apps/cli/README.md:69)."

## Modes

| Mode | How | From |
|---|---|---|
| Local model (no sign-in, no plan, nothing leaves the device) | 1) Start a local model server outside this repository. The source defaults are Ollama at http://localhost:11434 and LM Studio at http://localhost:1234/v1. 2) Discover models: `target/release/agi models scan`, `agi models status` or `agi models list` (subcommands in apps/cli/src/lib.rs:1862-1890). 3) Start a session on a local model: `target/release/agi --provider ollama -m <model>` (the --provider help names ollama, apps/cli/src/lib.rs:194-196; the -m model must come from the local list). 4) Or set the default: `target/release/agi models set <model> --provider ollama` (apps/cli/src/lib.rs:1876-1886). 5) Inside the TUI, `/privacy-mode local` switches the boundary (apps/cli/src/claude_parity.rs:225 and the tests at 3792-3820). Local means no prompt, chat or file context should leave the device (apps/cli/src/platform/runtime/session.rs:283-290). | `apps/cli/src/local_models.rs:7-8 (default URLs); apps/cli/src/lib.rs:194-196, 772-776, 1862-1890; apps/cli/src/claude_parity.rs:225, 3792; apps/cli/README.md:335-336 (Local needs no plan); apps/cli/src/platform/runtime/session.rs:283-290` |
| Your own key (BYOK) | 1) Store the key: `target/release/agi login anthropic` (or another provider name). The prompt enters the key under 'Your Key' (apps/cli/src/lib.rs:987-990; apps/cli/README.md:68). 2) Confirm: `target/release/agi auth-status` (apps/cli/README.md:69). 3) Inside the TUI, `/login <provider>` does the same (apps/cli/src/repl/slash_commands.rs:599-601). 4) Switch the boundary: `/privacy-mode byok` (apps/cli/src/claude_parity.rs:225; test at 3809). BYOK sends selected context straight to the user's own provider key (apps/cli/src/platform/runtime/session.rs:280-285). It does not go through localhost:3000, and needs no plan (apps/cli/README.md:335-336). | `apps/cli/README.md:64-70, 335-336; apps/cli/src/lib.rs:987-992; apps/cli/src/repl/slash_commands.rs:599-601; apps/cli/src/claude_parity.rs:225, 3809; apps/cli/src/platform/runtime/session.rs:280-285` |
| Managed Cloud for a subscribed user (pointed at localhost:3000) | 1) The plan must include 'Cloud in the CLI and VS Code'. Check with `target/release/agi plans` (apps/cli/README.md:333-335). Use the lane-cli account, or another paid one from `pnpm dev:accounts list` (docs/development/local-test-accounts.md:30-39). 2) Export the local API base before the CLI starts: `AGIWORKFORCE_API_BASE=http://localhost:3000`. The source accepts a loopback http base (apps/cli/src/tier_cache.rs:641-663, 651). The CLI then sends its token to that loopback address (apps/cli/src/cloud/client.rs:380-383). 3) For sign-in, the device-grant base is AGI_AUTH_BASE. The source says it must include /api, so set `AGI_AUTH_BASE=http://localhost:3000/api` (apps/cli/src/auth.rs:1016-1020; apps/cli/src/app_server/account.rs:287-293). Then run `target/release/agi login`. 4) Switch into Cloud mode with `/model` or `/privacy-mode managed` inside the TUI (apps/cli/src/cloud/client.rs:51 says 'Switch to Cloud mode with /model'; apps/cli/src/claude_parity.rs:3820). 5) Verify with `target/release/agi usage` (docs/runbooks/cli-release.md:300-301; apps/cli/README.md:336-338). Account commands refuse in Local and BYOK modes. | `apps/cli/README.md:64-70, 333-340; apps/cli/src/cloud/client.rs:51, 57, 380-383; apps/cli/src/tier_cache.rs:19, 641-663; apps/cli/src/auth.rs:1016-1020; apps/cli/src/app_server/account.rs:287-293; apps/cli/src/claude_parity.rs:3820; docs/runbooks/cli-release.md:300-301; docs/development/local-test-accounts.md:30-39` |

## How to tell it is running

Web server: opening http://localhost:3000/login in a browser shows the sign-in page (docs/development/local-test-accounts.md:61). The dev server prints its output in the terminal where it was started (the docs do not describe the message). The CLI: `agi --version` prints `agi <version>`, which is `agi 0.0.1` for the current Cargo.toml version (docs/runbooks/cli-release.md:280-283; apps/cli/Cargo.toml:4). The interactive TUI shows a header line with `AGI CLI v<version> │ model │ provider │ branch │ ctx` and a top-right cost HUD with tokens in/out, $ cost and context percent; the README shows this layout as an example (apps/cli/README.md:15-20, 182-190). `agi doctor` gives local diagnostics (apps/cli/README.md:342-344). `agi auth-status` shows the sign-in state for each provider (apps/cli/README.md:69; apps/cli/src/lib.rs:1004-1005). In Managed mode `agi usage` answers, and the same command is refused after switching to Local or BYOK (docs/runbooks/cli-release.md:300-302)."

## Cannot be done on this computer

- The one-command installer (curl ... install.sh) cannot be used yet: until the first signed release is published, the installer stops with 'No signed AGI CLI release is published yet' (apps/cli/README.md:28-34). The release workflow has never completed successfully (docs/runbooks/cli-release.md:108-111). Use the source build instead.
- Publishing a CLI release needs the owner's GitHub admin rights, the release signing key (kept offline), the protected cli-release environment, and two owner approvals in the workflow run (docs/runbooks/cli-release.md:46-51, 98-100, 196-207, 258-263).
- Platform code signing: the binaries carry no Apple Developer ID and no notarization, and no Windows Authenticode signature. The signed checksum manifest is the integrity check (docs/runbooks/cli-release.md:33-40). A browser-downloaded archive gets Gatekeeper warnings (docs/runbooks/cli-release.md:38-40).
- Homebrew: the tap is private and not advertised; npm, WinGet and apt/dnf channels produce nothing (docs/runbooks/cli-release.md:71-76; apps/cli/README.md:32-33).
- Release verification needs a Mac, a Linux machine and Windows Git Bash (docs/runbooks/cli-release.md:265-266). Windows has no sandbox, and its installer needs Git Bash, MSYS2, Cygwin or WSL (apps/cli/README.md:45, 52-54, 136-137). Linux sandboxing needs bubblewrap (apps/cli/README.md:81).
- Editor integrations (Zed, JetBrains) need those editors (apps/cli/README.md:364-378). The VS Code install route is documented separately (docs/runbooks/cli-release.md:68).
- The voice feature (/voice, /dictate) is off in the default build and needs an audio stack (apps/cli/Cargo.toml:126-132; apps/cli/src/lib.rs:73-106).
- No store account, real phone or Apple certificate is needed for the source build and local testing; the docs name none for the CLI.

## Not found in the project's documents

Steps a tester needs that the documents do not give. Work them out on first use and write them here.

- Rust or cargo installation steps. The docs call for cargo but do not say how to install it.
- How to create apps/web/.env.local from its examples, and the values for a local run. apps/web/.env.local.example and .env.example exist in the repository, but no document in the files read describes filling them in for localhost.
- The local value of CLERK_AUTHORIZED_PARTIES for localhost:3000. The docs say it is required (docs/development/troubleshooting.md:62-64). .env.example:45 lists only the production and extension origins.
- How to start or reset the local Postgres database, and the local DATABASE_URL value. apps/web/.env.example:72-76 shows a remote host with sslmode=require. docs/development/local-test-accounts.md:71-74 requires loopback, but no setup steps.
- A port flag for next dev. apps/web/package.json:6 runs `next dev` with no port, and the docs say localhost:3000 without saying how it is set.
- A documented way to point the CLI at localhost. AGIWORKFORCE_API_BASE and AGI_AUTH_BASE appear only in source comments and error messages (apps/cli/src/cloud/client.rs:57, 380-383; apps/cli/src/auth.rs:1016-1020; apps/cli/src/app_server/account.rs:287-293). They are not in apps/cli/README.md or any development doc.
- Whether `agi login` (device code) works with a +clerk_test local account. The docs describe the web /login sign-in for local accounts, not the CLI device-code flow.
- Installing Ollama or LM Studio, pulling a model, or starting their servers. Only their default URLs appear in source (apps/cli/src/local_models.rs:7-8).
- Built-in provider key variable names, for example which environment variable holds an Anthropic key. apps/cli/README.md:161-178 documents api_key_env only for custom OpenAI-compatible providers.
- Where `cargo install --path apps/cli --bin agi` puts the binary. The docs give no install folder.
- A first-run walkthrough: the trust prompt for a new folder, onboarding and first-time setup (`agi onboarding` is listed in apps/cli/README.md:321-329, but its flow is not described).
- The fixture and step-by-step tasks in the baseline (code-bench fixture, keep.txt marker, C-1 to C-12) are in ~/.cache/agi-audit/leader-docs/2026-11-22/results/baseline/scripts/cli.md, not in the project. The project files do not define the fixture.
- A keyboard-shortcut list for the TUI. The files read do not include one.
- How to stop the local web server and release the heavy-job lock. The gate's lock is held until the wrapped command exits (scripts/dev/heavy-job.sh:40-41), but the docs do not describe stopping a dev server.
