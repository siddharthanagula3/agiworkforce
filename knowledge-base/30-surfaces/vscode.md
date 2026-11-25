---
id: "SURF-vscode"
type: "surface"
title: "vscode app"
basis: "code inspection and project documents"
second_reader: "not challenged; corrected after the consistency check across pages"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# vscode app

The VS Code extension (display name AGI Code, package agi-workforce, version 0.0.2) is a chat and agent panel inside VS Code. It does not run the agent itself: it starts the AGI CLI's local app-server per workspace. It supports Local, own-key and Cloud, but Cloud models need Premium (`pro`) or a higher plan. It is a preview. The Marketplace release is unproven, and the web page marks it Coming soon.

## What it is and who uses it

**What it is.** AGI Code is the VS Code surface (surface:vscode) of AGI Workforce. It gives developers a sidebar chat, an editor-tab chat, and an `@agi` participant in VS Code's own Chat view. It also adds editor helpers: explain, fix, refactor, tests, docs, code review, terminal help, hover, CodeLens and inline completions. [code] (apps/extension-vscode/package.json:2-4, 62-70; apps/extension-vscode/README.md)

**Who uses it.** Developers who want an agent scoped to the repository they have open. Chat, agent runs and history are scoped to the workspace folder and run through the AGI CLI on the user's machine. [code] (apps/extension-vscode/README.md:19-24; apps/extension-vscode/docs/CONTRIBUTING-NOTES.md Purpose)

**Where it sits in the product.** The suite doc calls it the IDE-native developer assistant, workspace scoped. It belongs to the "Host Developer" domain with Desktop Code and the CLI. It is not part of the consumer "Account Cloud" domain. [requirement] (docs/product/suite.md:35; docs/product/surface-feature-matrix.md:19)

**Platforms.** The web status helper lists macOS, Windows and Linux. The manifest needs VS Code `^1.100.0`, runs in the workspace extension host (`extensionKind: workspace`), and does not support virtual workspaces. [code] (apps/web/lib/surface-status.ts:45; apps/extension-vscode/package.json:34-39, 107-111)

**Names.** Display name is "AGI Code", marketplace id `agiworkforce.agi-workforce`, publisher `agiworkforce`, pricing field "Free", flagged `preview: true`. Command titles start with "Code:". [code] (apps/extension-vscode/package.json:3,6,31-33; .github/workflows/release-vscode-extension.yml publish job url)

## How it is built

**Language and host.** TypeScript, bundled by esbuild into one Node CommonJS file (`out/extension.js`, target node18, `vscode` external). Two browser bundles are built for the webviews: `out/webview/render.js` and `out/webview/dictation.js`. [code] (apps/extension-vscode/esbuild.js:20-60)

**The agent lives in the CLI, not the extension.** The extension spawns `agi app-server` (a local JSON-RPC style process of the Rust CLI) once per workspace root through `LocalRuntimePool` and `LocalRuntimeClient`. That process owns threads, turns, streamed output, approvals, cancellation and session history. Multi-root windows keep one runtime per root. Changing `agiWorkforce.cliPath` disposes the processes. [code] (apps/extension-vscode/src/integrations/localRuntimeClient.ts:2575; src/extension.ts:104-122; docs/CONTRIBUTING-NOTES.md Developer-session architecture)

**Three UI paths share one pool.** The `@agi` chat participant, the sidebar webview (`agi-workforce.sidebar`) and the editor chat panel all use the same `LocalRuntimePool`. [code] (docs/CONTRIBUTING-NOTES.md; src/extension.ts:44-58 imports)

**Cloud-backed editor utilities.** Inline completions, code review, suggest-terminal-command, feedback, memory, usage and dictation call AGI web APIs directly with the account token. Completions stream from `<apiEndpoint>/chat/completions` (default endpoint `https://agiworkforce.com/api/llm/v1`). [code] (src/utils/api.ts:1115, 324, 1545; package.json:1214-1218)

**Activation is fault tolerant.** `activate()` guards `setupProviders` and `setupChat` separately, records failures in subsystem health, and falls back to a degraded provider state so the sidebar view always registers. Tests lock this in. [code] (src/extension.ts:76-90, 117-135; docs/CONTRIBUTING-NOTES.md Activation contract)

**Size.** 149 commands are contributed. The extension contributes one Activity Bar container `agi-workforce-sidebar` and one chat participant `agiworkforce.agi`. `src/extension.ts` is 526 lines and `ChatStateManager.ts` is the largest UI file. [code] (package.json contributes; src/features/sidebar-webview/ChatStateManager.ts)

**Workspace trust.** In an untrusted workspace the local runtime is not started, and settings such as API endpoint, CLI path, model and inline completion cannot be overridden by workspace settings. [code] (package.json:49-90)

## Folder map and entry points

All paths are under `apps/extension-vscode/`.

| Path | What it holds |
| --- | --- |
| `package.json` | Manifest: activation events, 149 commands, settings, chat participant, scripts. Package name `agi-workforce`. |
| `esbuild.js` | Build script for the extension and webview bundles, codicon copy, test build (`--tests`). |
| `src/extension.ts` | `activate()` entry point (`main` is `./out/extension.js`). Wires analytics, device heartbeat, providers, runtime pool, chat, URI handler, remote control. |
| `src/core/` | Setup and wiring: `commandSetup.ts` (commands incl. sign in/out), `chatSetup.ts`, `providerSetup.ts`, `subsystemHealth.ts`, `cloudModelBoundary.ts`, `statusBar.ts`, `outboundContentGuard.ts`. |
| `src/integrations/` | `localRuntimeClient.ts` and `localRuntimePool.ts` (CLI app-server), `tierResolver.ts`, `providerSwitchGuard.ts`, `cliInstaller.ts`, `developerSessionHandoff.ts`. |
| `src/features/sidebar-webview/` | Sidebar chat: `sidebarProvider.ts`, `ChatStateManager.ts`, `webviewContent.ts`. |
| `src/features/account-auth/` | `deviceAuth.ts` (browser device sign-in), plan labels and comparison. |
| `src/features/model-picker/` | Model list, plan gating (`modelConstants.ts`), reachability by trust mode. |
| `src/features/cloud-tasks/`, `connectors/`, `projects/`, `artifacts/`, `schedules/`, `remote-control/` | Tree views and clients for account data. |
| `src/features/context-handoff/` | URI handler and developer-session links. |
| `src/features/inline-completions/`, `hover/`, `code-lens/`, `editor-utilities/` | Editor helpers. |
| `src/features/permissions/` | Agent-mode consent, approval history, proposed-change review, workspace consent. |
| `src/providers/` | Editor panel, diff decorations, diagnostics, terminal, code actions. |
| `src/memory/` | Account memory client and store. |
| `src/utils/api.ts` | Account token custody, `/api/me`, usage, completion streaming (1,584 lines). |
| `src/webview/` | Browser-side `render.ts` and `dictationPage.ts`. |
| `src/__tests__/` | 193 Vitest files. |
| `src/test/` | Native Extension Host test runner. |
| `scripts/` | `vsce-package.js`, `verify-vsix.mjs`, `check-vscode-theme-tokens.mjs`, `a11y-audit.mjs`, icon generation. |
| `media/` | Icons and `walkthrough/*.md`. |
| `docs/CONTRIBUTING-NOTES.md` | Contributor notes (excluded from the VSIX). |
| `README.md` | Marketplace listing copy (ships inside the VSIX). |

**Activation events.** Chat participant, sidebar view, chat panel, URI, a workspace file `.agiworkforce/instructions.md`, and `onStartupFinished`. [code] (package.json:44-51)

Untracked build leftovers also sit in the folder (`agi-workforce-0.0.2.vsix`, an older 0.3.0 `.vsix`, `out/`, `.vscode-test/`). [code] (directory listing, apps/extension-vscode)

## Sign-in

**Sign-in is optional for Local and own-key use.** The README says an AGI Cloud account is needed only for Managed Cloud and cloud-backed extras (inline completions, memory, feedback). Local models and provider keys work through the CLI without an AGI subscription. [code] (README.md:35-38; docs/CONTRIBUTING-NOTES.md Quick start)

**Command.** `agi-workforce.signIn` calls `signIn` in `features/surfaces/accountAccess.ts`. If the CLI can start the login (`account/login` over the app-server), the extension opens the verification URL and waits via `account/login/wait`. If the CLI cannot, it falls back to its own device flow. [code] (src/core/commandSetup.ts:1221-1230; src/features/surfaces/accountAccess.ts:27-67; src/integrations/localRuntimeClient.ts:2091-2103)

**Device flow.** The extension requests a code with surface `vscode`, opens a browser approval page (on the user's own computer even in a remote window), and polls for the token. The paths and logic come from the shared `@agiworkforce/client-runtime` package. [code] (src/features/account-auth/deviceAuth.ts:60-110, 190-230; packages/client/client-runtime/src/deviceAuthorization.ts:24, 62-68)

**Where the credential lives.** In VS Code `SecretStorage`. The extension can also borrow the CLI's account token (`account/token`) when it holds none, after checking the owner through `GET /api/me?surface=vscode`. [code] (src/utils/api.ts:300-345, 380-395; src/extension.ts:111-123; README.md Privacy)

**Refresh and sign-out.** Expired sessions renew through the shared refresh endpoint. `agi-workforce.signOut` calls `POST /api/auth/logout`, clears the tier cache and memory cache, and also signs the CLI out. [code] (src/features/account-auth/deviceAuth.ts:127-146; src/core/commandSetup.ts:1243-1256)

**Own-key sign-in.** `agi-workforce.signInProvider <id>` runs `agi login <id>` in a terminal. The id is checked against a strict pattern first because it reaches a shell. The app-server has no login call for providers. [code] (src/providers/terminalProvider.ts:383-404)

**Other credential.** `agi-workforce.setApiKey` stores an AGI API key in SecretStorage. [code] (src/core/commandSetup.ts:1259-1280)

**Provider.** Account identity is the AGI web account (identity handled by the web app; Clerk details are [unknown] from this folder).

## Modes: Local, own key, Cloud

The code names the three modes as trust modes `local`, `byok` and `managed` (Managed Cloud). The chat header names the boundary before a request is sent. [code] (src/features/model-picker/reachability.ts:6; README.md Privacy)

| Mode | Supported | Who | How |
| --- | --- | --- | --- |
| mode:local | Yes, through the CLI app-server. The runtime schema names Ollama and LM Studio providers. | Anyone, no AGI account or subscription. Free and signed-out users included. | The CLI runs local models on the device. [code] (README.md:35-38; src/integrations/localRuntimeClient.ts:724-731) |
| mode:own-key | Yes (BYOK, bring your own key). | Anyone with a provider key, no AGI subscription. | Keys are held and used by the CLI. Calls go straight to the named provider. `signInProvider` runs `agi login <id>`. [code] (README.md Privacy; src/providers/terminalProvider.ts:383-404) |
| mode:cloud | Yes (Managed Cloud). | Plans that include the `developer_surfaces` capability: Premium (`pro`), Max (`max`), Ultra (`max_15x`), Team (`team`), Team Premium (`team_premium`), Enterprise (`enterprise`). Free and Basic are blocked from managed models. | Models route through AGI servers. [code] (packages/contracts/types/src/billing-catalog.ts:341, 359; src/features/model-picker/modelConstants.ts:100-109) |

The harness catalog marks `vscode/local-chat` and `vscode/byok-chat` as `unwired`. That flag lags the implementation: the extension code above does run Local and own-key through the CLI. [code] (packages/ai/model-registry/catalog/harnesses.json:703-725; src/integrations/localRuntimeClient.ts:724-731; src/providers/terminalProvider.ts:383-404)

**Free users.** Free can use Local and own-key. Managed models are refused for Free (the test names this) and Auto is kept off Free. Cloud-backed utilities such as inline completions need an account and a model the cloud picker offers. [code] (src/features/model-picker/modelConstants.ts:67-109; src/__tests__/modelPickerTierGate.test.ts:36-60)

**Unresolved tier.** With no known tier the extension treats the account as `byok`, which admits the whole catalog for provider admission by the app-server. [code] (src/integrations/tierResolver.ts:197-221; src/__tests__/modelPickerTierGate.test.ts)

**Tier source.** `GET /api/me?surface=vscode` returns the tier and a capability document. The tier is cached for 300 seconds, matching the CLI's own cache. Plan ids the extension accepts include local, byok, free, basic, pro (Premium), max, max_15x (Ultra), team, team_premium, enterprise. [code] (src/utils/api.ts:324, 1409; src/integrations/tierResolver.ts:14-39, 56; packages/contracts/types/src/billing-catalog.ts:181-227)

**Boundary rules.** A Local default model is never swapped for a Cloud model. Cloud-only utilities (code review, suggest terminal command, inline completions) refuse and send nothing when the default is Local. Switching provider mid-thread across a boundary starts a new thread. Provider-switch inside one thread needs a plan that allows it (`canSwitchProviderInThread`). The privacy mode allows local only, local plus byok, or all three. [code] (src/core/cloudModelBoundary.ts:12-40; src/integrations/providerSwitchGuard.ts:19-43; src/features/model-picker/reachability.ts:30-34; README.md Privacy)

**Execution boundary.** Local runtime and tools run on the user's machine. Managed Cloud chat, inline completions, memory, usage, feedback, dictation and cloud tasks need AGI servers. Cloud dictation opens a browser page, since a webview has no microphone. [code] (README.md; docs/product/surface-feature-matrix.md:328)

Whether the free Local use needs the CLI's own sign-in is decided inside the CLI, not here: [unknown] (apps/cli not read in depth).

## Shared code

**Workspace packages the extension depends on** (all `workspace:*`): agent-core, artifacts, client-runtime, cloud-contracts, design-tokens, i18n, ide-runtime, local-runtime-contract, observability, routing, sync, types, unified-chat, utils. [code] (package.json:1586-1600)

Import counts in `src/` show what is really used: `@agiworkforce/types` in 146 files (plans, model catalog, product names), `cloud-contracts` in 42 files, `local-runtime-contract` in 23, `ide-runtime` in 6, `agent-core` in 4, `client-runtime` in 3, and `routing`, `sync`, `artifacts` and `design-tokens` in 2 to 3 each. `i18n`, `observability`, `utils` have no direct import in `src/` ([inferred] they are declared but may be unused or reached through other packages). `unified-chat` is imported only by `src/webview/render.ts` (markdown plugins, math, assistant fences). [code] (grep of imports, apps/extension-vscode/src)

**Notable reuse.** Device sign-in logic in `client-runtime` is shared with CLI, Desktop and Chrome (surface type `cli|desktop|vscode|chrome`). The managed chat client comes from `cloud-contracts` (`createManagedCloudChatClient`). Memory sync uses `@agiworkforce/sync`. Task classification uses `@agiworkforce/routing`. Terminal, diagnostics and glob helpers come from `ide-runtime`. [code] (packages/client/client-runtime/src/deviceAuthorization.ts:24; src/utils/managedCloudChat.ts; src/memory/accountMemoryClient.ts:9; src/integrations/routingTask.ts:1; src/providers/terminalProvider.ts:13)

**The biggest shared piece is the CLI.** The Rust `apps/cli` app-server is the same engine behind Desktop local sessions. The extension is a client of it. [requirement] (docs/product/suite.md:76; audit/overview.md:206)

**Model catalog.** Model IDs come from `@agiworkforce/types` (catalog owner: packages/contracts/types/src/model-catalog.ts, generated models file). The extension holds no model literal of its own in the code read. [code] (src/features/model-picker/modelConstants.ts; AGENTS.md section 4)

**Not shared.** The sidebar UI itself is its own webview (`ChatStateManager.ts`, `webviewContent.ts`), not the shared unified-chat React UI. [code] (src/features/sidebar-webview/; grep of unified-chat imports)

**Boundary.** The Marketplace listing is also the contributor's constraint: `README.md` ships in the VSIX, contributor notes do not. [code] (.vscodeignore; README.md header comment)

## Build, run and test

Commands come from `docs/agent-context/commands.json` (key `vscodeExtension`) and `package.json` scripts. The filter name is `agi-workforce`. [code] (docs/agent-context/commands.json:162-170; package.json:1568-1585)

| Goal | Command |
| --- | --- |
| Typecheck | `pnpm --filter agi-workforce typecheck` |
| Unit tests | `pnpm --filter agi-workforce test` (Vitest, `src/__tests__/**/*.test.ts`, `vscode` aliased to a mock) |
| One test | `pnpm --filter agi-workforce test <file-or-pattern>` |
| Webview tests | `pnpm --filter agi-workforce test:webview` (separate Vitest config) |
| Lint | `pnpm --filter agi-workforce lint` (theme-token check then ESLint with zero warnings) |
| Build | `pnpm --filter agi-workforce build` (runs clean, typecheck, then `node esbuild.js`) |
| Watch | `pnpm run watch` |
| Package VSIX | `pnpm run package` (production esbuild plus `scripts/vsce-package.js`) |
| Verify VSIX | `pnpm run verify:package` |
| Native tests | `pnpm --filter agi-workforce test:integration` (starts a real VS Code Extension Host; pinned test host, or `--vscode-executable=`) |
| Native tests on the VSIX | `test:integration:vsix`, `test:integration:package` |

**To run it by hand:** build, install the CLI so `agi` is on PATH (or set `agiWorkforce.cliPath`), open a trusted folder, open the AGI Code icon in the Activity Bar. [code] (docs/CONTRIBUTING-NOTES.md Quick start)

**Machine rule.** Heavy jobs on the owner's 16 GB laptop go through `scripts/dev/heavy-job.sh`. [requirement] (CLAUDE.md Delegation)

**Test set.** 193 files in `src/__tests__` (examples: `modelPickerTierGate.test.ts`, `tierStatus.test.ts`, `security.test.ts`, `localRuntimePool.test.ts`, `activationResilience.test.ts`, `outboundContentGuard.test.ts`), plus native suites `cloudTasks`, `inlineEdit`, `pathLinks`, `sidebarSurfaces`, `extension.smoke` built into `out/test/suite`. [code] (src/__tests__ listing; out/test/suite listing)

**Verification status.** No run result was observed by this page. Nothing here is [executed]. A `.vscode-test` folder holding a VS Code 1.131 download and a built 0.0.2 VSIX exist locally, which suggests native tests and packaging were run on this machine, but no log was read. [inferred]

## Release state

**Implementation status.** Code is present and wired: the manifest, activation, sign-in, runtime pool, model picker, tree views and a release workflow all exist. [code] (package.json; src/extension.ts; .github/workflows/release-vscode-extension.yml)

**Version.** `package.json` is `0.0.2`, flagged preview. A git tag `v-vscode-0.0.1` exists. Tag format for releases is `v-vscode-X.Y.Z` (stable) or `v-vscode-X.Y.Z-<beta|rc|nightly|alpha|canary>.N` (pre-release channel), and the tag version must equal the manifest version. [code] (package.json:5; git tag list; release-vscode-extension.yml tag check)

**Release pipeline.** On a tag push or manual dispatch: typecheck, lint, tests, webview tests, release-guard self test, production package, `verify:package`, SHA-256, secret and dev-endpoint scan of the unpacked VSIX, install of the exact VSIX in a clean VS Code profile under xvfb, upload. Publish job (protected environment `vscode-marketplace`) logs in to Microsoft Entra by GitHub OIDC and runs `vsce publish`. An optional Open VSX job (for VS Code forks) stays off until the variable `OPEN_VSX_PUBLISH` is `true`. [code] (release-vscode-extension.yml)

**Is it published? [unknown].** The surface matrix says the workflow had no GitHub runs or matching release and that Marketplace publication was not independently proven. The web status map marks `vscode` as "Coming soon", and the web page `/vscode-extension` shows that label. [requirement] (docs/product/suite.md; docs/product/surface-feature-matrix.md:27, 74; apps/web/lib/surface-status.ts:11; apps/web/app/vscode-extension/page.tsx:34)

**Blocked by the CLI.** The extension chat needs the AGI CLI, which has no signed release yet. Until then VS Code chat works only from a source build. [requirement] (audit/blockers/14-desktop-and-vscode-need-unpublished-cli.md; docs/product/suite.md:72) The installer command `Code: Install AGI CLI` reads `/api/releases/cli/latest`. [code] (src/integrations/cliInstaller.ts:6)

**Verification status.** The 2026-09 audit judged VS Code "solid" for editor integration but "needs the local CLI". No live run is recorded in the files read. [requirement] (audit/overview.md:229, 398)

## Differences from the unified experience

The product goal is one consistent experience across six apps. The extension differs on purpose and by gap.

**By design (Host Developer domain).**
- Sessions are workspace scoped and local. They are not synced into Web, Mobile or Desktop chat history. Any move to the cloud is an explicit handoff. [code] (README.md Privacy; docs/CONTRIBUTING-NOTES.md Purpose)
- Chat, history and tools depend on the local CLI process. The other consumer apps use Managed Cloud directly. [code] (src/integrations/localRuntimePool.ts)
- Cloud tasks, projects, schedules, connectors, artifacts and memory show as account tree views, not as the shared web UI. [code] (src/features/*/\*Tree.ts; surface-feature-matrix.md)

**Absent here (per the matrix).** Image, video, research reports, study mode, voice recording, camera, screen capture, skills, plugins, published apps, browser driving, desktop driving, provider Fast mode, in-editor auto-update (the Marketplace updates it), and library artifacts. [requirement] (docs/product/surface-feature-matrix.md lines 198, 268-348, 368-378, 408, 468, 518, 538)

**Unverified in the matrix.** Search interaction mode, MCP client role, settings and onboarding entry points, context handoff UI, git client role, hooks, account sign-in and config cells. These matrix cells are now outdated in part, see outdated documents. [requirement] (surface-feature-matrix.md lines 218, 238, 258, 388, 428, 448, 558, 588, 598)

**UI.** The editor has its own webview and theme tokens (checked by `check-vscode-theme-tokens.mjs`) rather than the shared React chat, using `unified-chat` only for markdown, math and fence helpers. [code] (src/webview/render.ts:2-12; package.json lint script)

**Plan gate difference.** Managed models need Premium (`pro`) or a higher plan (`developer_surfaces`), while Basic includes managed chat on web. Basic cannot use managed developer models here. [code] (billing-catalog.ts:341-359; src/__tests__/modelPickerTierGate.test.ts:36-45)

## Gaps

| Gap | Basis and source |
| --- | --- |
| The CLI the extension needs has no signed release, so a normal user cannot run chat. | [requirement] audit/blockers/14-desktop-and-vscode-need-unpublished-cli.md; docs/product/suite.md:72 |
| Marketplace publication is unproven; web page says Coming soon; the release workflow has no recorded run. | [requirement] surface-feature-matrix.md:27, 74; apps/web/lib/surface-status.ts:11 |
| Audit defects (2026-09, may be fixed since): the `/` menu runs only six built-ins; unsaved edits dropped; attachment removal fails for odd filenames; memory off switch does not stop the runtime; no per-answer copy or feedback; ordered lists show bullets; Enter sends mid-IME composition. | [requirement] audit/overview.md:72, 398-403, 436-438. Not re-checked in code here: [unknown] |
| Free and Basic users cannot use Cloud models in the editor; Free sees only the upgrade path. | [code] billing-catalog.ts:341, 359 |
| Several features are absent: image, video, research, voice recording, skills, plugins, browser and desktop driving. | [requirement] surface-feature-matrix.md |
| Cloud-only utilities (code review, terminal suggestion, inline completions) cannot run on a Local model. | [code] src/core/cloudModelBoundary.ts:12-40 |
| Inline completions send code to AGI Cloud, so no fully local completion path exists. | [code] README.md Privacy |
| Audit says web search in CLI and VS Code needs the user's own search key. | [requirement] audit/overview.md:141 |
| Live verification queue still holds unverified and spot-check cells for vscode (accessibility, undo/redo, background work, task lists, session picker). | [requirement] audit/live-check/codex-live-verification-queue.md |
| Stale build files in the folder (an old 0.3.0 VSIX). | [code] directory listing |

## How to verify

1. **Manifest facts.** Read `apps/extension-vscode/package.json` (version, engines, activation, commands, settings, scripts).
2. **Entry point.** Read `src/extension.ts` `activate()`; confirm sidebar and runtime pool registration.
3. **Modes.** Read `src/features/model-picker/modelConstants.ts:60-110` and `src/__tests__/modelPickerTierGate.test.ts`. Run that test with the single-test command above, through `scripts/dev/light-job.sh` on the owner's machine.
4. **Plan gate.** Read `packages/contracts/types/src/billing-catalog.ts` (`developer_surfaces`, `PRO_TIERS`).
5. **Sign-in.** Read `src/features/surfaces/accountAccess.ts`, `src/features/account-auth/deviceAuth.ts`, and `packages/client/client-runtime/src/deviceAuthorization.ts`.
6. **Release.** Read `.github/workflows/release-vscode-extension.yml`. Check `git tag` for `v-vscode-*`, the Actions run list, and the Marketplace page. Those last two were not available to this page.
7. **Whole-app check.** Run `pnpm --filter agi-workforce test:integration` for a real Extension Host, and install the VSIX with an `agi` binary on PATH, then try Local, own-key and Cloud with a Free and a Premium account. Not done by this page.
8. **Companion pages.** For the CLI runtime see the CLI surface page; for the plan system see the subscription pages of this knowledge base.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| The extension is named AGI Code, package name agi-workforce, version 0.0.2, publisher agiworkforce, preview, pricing Free. | read in the code | `apps/extension-vscode/package.json:2-8,31-33` |
| It requires VS Code ^1.100.0 and runs in the workspace extension host; virtual workspaces are not supported. | read in the code | `apps/extension-vscode/package.json:34-39,107-111` |
| Entry point is src/extension.ts activate(), bundled to out/extension.js by esbuild (CJS, node18, vscode external). | read in the code | `apps/extension-vscode/esbuild.js:20-35`; `apps/extension-vscode/src/extension.ts:69` |
| Chat and agent runs run in a local `agi app-server` process of the AGI CLI, one per workspace root, managed by LocalRuntimePool. | read in the code | `apps/extension-vscode/src/integrations/localRuntimeClient.ts:2575`; `apps/extension-vscode/src/extension.ts:104-122`; `apps/extension-vscode/docs/CONTRIBUTING-NOTES.md` |
| Local models and own provider keys work without an AGI account or subscription; an account is needed only for Managed Cloud and cloud-backed extras. The harness catalog entries vscode/local-chat and vscode/byok-chat are flagged 'unwired' but lag the implementation. | read in the code | `apps/extension-vscode/README.md:35-38`; `apps/extension-vscode/docs/CONTRIBUTING-NOTES.md Quick start`; `apps/extension-vscode/src/integrations/localRuntimeClient.ts:724-731`; `apps/extension-vscode/src/providers/terminalProvider.ts:383-404`; `packages/ai/model-registry/catalog/harnesses.json:703-725` |
| Managed models in the editor need a plan with the developer_surfaces capability: Premium (`pro`), Max (`max`), Ultra (`max_15x`), Team (`team`), Team Premium (`team_premium`), Enterprise (`enterprise`). Free and Basic are blocked. | read in the code | `packages/contracts/types/src/billing-catalog.ts:181-227,341,359`; `apps/extension-vscode/src/features/model-picker/modelConstants.ts:100-109`; `apps/extension-vscode/src/__tests__/modelPickerTierGate.test.ts:36-45` |
| Tier comes from GET /api/me?surface=vscode, cached 300 seconds (same as the CLI cache); an unresolved tier defaults to byok. | read in the code | `apps/extension-vscode/src/utils/api.ts:324,1409`; `apps/extension-vscode/src/integrations/tierResolver.ts:56,197-221` |
| Sign-in uses a browser device-approval flow with surface 'vscode', preferring the CLI's account/login and falling back to the extension's own flow; the credential is kept in VS Code SecretStorage. | read in the code | `apps/extension-vscode/src/features/surfaces/accountAccess.ts:27-67`; `apps/extension-vscode/src/features/account-auth/deviceAuth.ts`; `packages/client/client-runtime/src/deviceAuthorization.ts:24,62-68` |
| Sign-out calls POST /api/auth/logout and also signs the CLI out. | read in the code | `apps/extension-vscode/src/features/account-auth/deviceAuth.ts:127-146`; `apps/extension-vscode/src/core/commandSetup.ts:1243-1256` |
| Own-key sign-in runs `agi login <provider>` in a terminal, since the app-server has no provider login RPC. | read in the code | `apps/extension-vscode/src/providers/terminalProvider.ts:383-404` |
| A Local default model is never swapped for a Cloud model; cloud-only utilities refuse and send nothing when the default is Local. | read in the code | `apps/extension-vscode/src/core/cloudModelBoundary.ts:12-40`; `apps/extension-vscode/README.md Privacy` |
| Inline completions are off by default and send surrounding code to AGI Cloud via <apiEndpoint>/chat/completions (default https://agiworkforce.com/api/llm/v1). | read in the code | `apps/extension-vscode/package.json:1214-1218`; `apps/extension-vscode/src/utils/api.ts:1115`; `apps/extension-vscode/README.md Privacy` |
| The extension contributes 149 commands, one Activity Bar container agi-workforce-sidebar and one chat participant agiworkforce.agi. | read in the code | `apps/extension-vscode/package.json contributes (node query)` |
| 193 Vitest test files exist in src/__tests__, plus native Extension Host suites and webview tests. | read in the code | `apps/extension-vscode/src/__tests__`; `apps/extension-vscode/vitest.config.ts`; apps/extension-vscode/out/test/suite (not found) (not found) |
| Commands: typecheck, test, testWebview, testIntegration, build use the filter agi-workforce. | read in the code | `docs/agent-context/commands.json:162-170` |
| A release workflow exists (tag v-vscode-X.Y.Z or with channel suffix), verifies the VSIX and publishes via OIDC to the Marketplace; Open VSX publish is off until OPEN_VSX_PUBLISH is true. | read in the code | `.github/workflows/release-vscode-extension.yml` |
| Whether the extension is published on the Marketplace is not proven; the surface matrix says the workflow had no runs, and the web status map says Coming soon. | stated requirement | `docs/product/surface-feature-matrix.md:27,74`; `apps/web/lib/surface-status.ts:11` |
| The CLI that the extension needs has no signed release, so VS Code chat works only from a source build. | stated requirement | `audit/blockers/14-desktop-and-vscode-need-unpublished-cli.md`; `docs/product/suite.md:72` |
| Sessions are workspace scoped and not synced into Web, Mobile or Desktop chat history; Desktop Code, CLI and VS Code share the Host Developer domain. | read in the code | `apps/extension-vscode/README.md Privacy`; `docs/architecture/overview.md:49`; `docs/product/surface-feature-matrix.md:19` |
| Shared packages: types (146 importing files), cloud-contracts (42), local-runtime-contract (23), ide-runtime (6), agent-core (4), client-runtime (3), routing, sync, artifacts, design-tokens; unified-chat only for markdown and math helpers in the webview. | read in the code | `grep of @agiworkforce imports in apps/extension-vscode/src` (not found); `apps/extension-vscode/src/webview/render.ts:2-12` |
| Untrusted workspaces: the local runtime is not started and endpoint, CLI path, model and completion settings cannot be set by the workspace. | read in the code | `apps/extension-vscode/package.json:49-90` |
| Absent in the editor: image, video, research, study mode, voice recording, camera, screen capture, skills, plugins, published apps, browser and desktop driving. | stated requirement | `docs/product/surface-feature-matrix.md lines 268-348, 368-378, 408, 468, 518` |
| Provider switching inside one thread across providers is allowed only when canSwitchProviderInThread(tier) is true; Auto and unknown providers are always allowed. | read in the code | `apps/extension-vscode/src/integrations/providerSwitchGuard.ts:19-43` |
| Model picker marks models as reachable or 'Needs setup on this machine' using host trust modes local, byok, managed and the privacy mode. | read in the code | `apps/extension-vscode/src/features/model-picker/reachability.ts:6-34,53-102` |
| Free plan usage view shows only an upgrade path and no meters in the Account & Usage command. | read in the code | `apps/extension-vscode/src/core/commandSetup.ts:2227-2263` |
| No verification run was observed for this page; no fact here is executed. | unknown | `Project folder was read only` (not found) |

## Open questions

- Is the extension published on the VS Code Marketplace or Open VSX? Only the workflow and the tag v-vscode-0.0.1 are visible; no run history or listing was checked.
- Is the AGI CLI sign-in or account required for Local mode inside the CLI itself? Only the extension side was read.
- Which of the audit defects from 2026-09 (six built-in slash commands, dropped unsaved edits, memory switch not stopping the runtime, IME Enter) are fixed in current code? Not re-checked.
- Are the declared dependencies i18n, observability and utils actually used? No direct import was found in src.
- Product choice: should Basic and Free get any Cloud model access in the editor, or only Local and own-key? Code gates on developer_surfaces (Pro and up).
- Product choice: should VS Code become available before the CLI has a signed release, for example by bundling a runtime?
- The identity provider behind the device-approval page (for example Clerk) is not visible from this folder.
- Whether the 0.0.2 manifest version and the only tag v-vscode-0.0.1 indicate an intended release is undecided.

## Project documents found out of date

- `docs/product/surface-feature-matrix.md`: Several vscode cells are marked unverified because features/settings, onboarding, context-handoff, editor-utilities, account-auth and config are 'directories, not entry points'. The code says: Those folders hold files that are imported and wired: features/account-auth/deviceAuth.ts is used by commandSetup.ts, features/context-handoff/index.ts is imported by extension.ts, features/editor-utilities is imported by extension.ts, features/settings/SettingsPanel.ts exists. (apps/extension-vscode/src/extension.ts:2-14,50-54; apps/extension-vscode/src/core/commandSetup.ts:1221; docs/product/surface-feature-matrix.md:238,258,428,528,588)
- `audit/overview.md`: Dated 2026-09-27; lists VS Code defects and says its sessions are shared with the CLI; later code has added many features and the doc is a point-in-time audit. The code says: The extension has 149 commands and 193 test files; the defect list was not re-verified here. (audit/overview.md:398-403; apps/extension-vscode/package.json)
- `apps/extension-vscode/README.md`: Not clearly outdated, but says extension files lack a CLI path for provider-free use without stating that the CLI is unpublished; also says Marketplace Q&A and docs links as if live. The code says: The web status map shows VS Code as Coming soon, and the CLI has no signed release. (apps/web/lib/surface-status.ts:11; audit/blockers/14-desktop-and-vscode-need-unpublished-cli.md)
