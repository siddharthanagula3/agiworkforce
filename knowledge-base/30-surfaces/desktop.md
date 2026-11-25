---
id: "SURF-desktop"
type: "surface"
title: "desktop app"
basis: "code inspection and project documents"
second_reader: "not challenged; corrected after the consistency check across pages"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# desktop app

The desktop app is a Mac Electron shell that loads the hosted web app (Managed Cloud chat only) and adds device features: approved folders, Code sessions through a bundled CLI, terminal, browser pane, simulator, computer use and dictation. Retained internal Tauri and an opt-in GPUI native host share the folder. A 2026-10-24 decision note says Tauri will ship as a second public app, but the repository still treats it as internal and the code conflicts with the note; its public status is an owner question. The site still labels Desktop "Coming soon". Release workflow exists; no run is recorded.

## What it is and who uses it

**Basis summary.** The public Desktop is the Electron app in `apps/desktop/electron`. It opens a window on the hosted web app and adds device powers the web cannot have. [requirement] (docs/decisions/2026-09-15-founder-decisions.md, D-2026-09-15-04; apps/desktop/README.md:1-20).

**Users.** People who want the AGI chat app as a Mac app, plus developers who want AGI Code on local folders (Code sessions, terminal, git, browser pane, iOS simulator pane, computer use, dictation). [code] (apps/desktop/electron/runtime/developerSessionService.ts; apps/desktop/electron/runtime/computerUseService.ts; apps/desktop/electron/voiceDictation.ts; docs/product/surface-feature-matrix.md lines 325, 415, 435, 515).

**Three codebases live in `apps/desktop`:**

| Name | Host process | What the window shows | Public? |
|---|---|---|---|
| Electron | `apps/desktop/electron` (Node) | The hosted web app | Yes, the public Desktop [requirement] (apps/desktop/README.md; ARCHITECTURE.md:43-56) |
| Tauri | `apps/desktop/src-tauri` (Rust) + `apps/desktop/src` (Vite/React) | The Vite app in `src` [code] (apps/desktop/README.md; hostHasLocalMode in packages/contracts/local-runtime/src/host-bridge.ts) | Retained internal code: the README and AGENTS.md section 5 say it is not a second public product [requirement]. A 2026-10-24 note in D-2026-09-15-04 says the owner chose to ship it as a second public app later, loading the hosted web app (docs/decisions/2026-09-15-founder-decisions.md:78-99). That conflicts with the code, where the Tauri window shows the Vite renderer, not the hosted web app. Its public status is an open owner question [unknown] |
| GPUI | `apps/desktop/gpui` (Rust, native, no webview) | Native UI over the shared CLI app-server protocol | Opt-in migration host, does not replace either shell [requirement] (apps/desktop/README.md:17-27) |

Product definition: Account-synced Cloud shell plus Desktop Code on the shared host-owned developer runtime [requirement] (docs/product/suite.md:32).

## How it is built

- **Electron main process** in TypeScript, built by `electron/build-main.mjs` into `electron/dist/bootstrap.cjs` (package.json `main`). [code] (apps/desktop/package.json; scripts `build:electron`, `dev:electron`).
- **Window.** `BrowserWindow` with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, and a persistent session partition `persist:agi-cloud` so the site login survives restarts. [code] (apps/desktop/electron/main.ts:1104-1116; apps/desktop/electron/config.ts REMOTE_SESSION_PARTITION).
- **Where it loads.** `CLOUD_APP_ORIGIN` defaults to the production web origin. A packaged build ignores the `AGI_CLOUD_APP_ORIGIN` environment variable; only an allowlisted `--agi-cloud-app-origin=` argument can change it (localhost or first-party hosts only). [code] (apps/desktop/electron/config.ts, `cloudAppOriginFrom`).
- **One bridge.** `preload.ts` exposes a single object, `agiHost`, to the page. All privileged work goes through `electron/runtime/dispatcher.ts`, which checks a capability grant (`permissionManager.ts`) and contains paths (`pathGuard.ts`). [code] (apps/desktop/electron/preload.ts:201; ARCHITECTURE.md:79-91).
- **Code sessions** run in the bundled `agi` CLI (the CLI app-server) started per approved folder; the dispatcher talks to it over JSON lines. [code] (apps/desktop/electron/runtime/developerSessionService.ts `startDeveloperSession`, `readyServer`; apps/desktop/electron-builder.yml extraResources `agi-cli/agi`).
- **Packaging.** electron-builder, app id `com.agiworkforce.desktop.cloud`, mac targets dmg and zip, security fuses (no runAsNode, asar integrity). [code] (apps/desktop/electron-builder.yml).
- **Chrome native-messaging host** is the same binary started with `AGI_NATIVE_MESSAGING_HOST=1`. [code] (electron-builder.yml fuse comment).
- **Tauri** is Rust (`src-tauri`) with a React/Vite renderer; `check-wiring.sh` fails drift between the renderer and registered Tauri commands in both directions. [requirement] (ARCHITECTURE.md:79-81).

## Folder map and entry points

| Path | What it holds |
|---|---|
| `apps/desktop/electron/main.ts` | Electron main entry (2775 lines): windows, menus, deep links, IPC handlers, sign-in screens, updates |
| `apps/desktop/electron/config.ts` | Cloud origin, allowlists (API base, relay host, Clerk dev host), partition, deep-link scheme |
| `apps/desktop/electron/preload.ts` | Exposes `agiHost` bridge |
| `apps/desktop/electron/runtime/dispatcher.ts` | Command router: refuses local inference, gates capabilities, calls services |
| `apps/desktop/electron/runtime/` | Services: developerSessionService (CLI sessions), filesystemService, gitService, shellService/shellSandbox, computerUse*, sshSessionService, localRoutine*, simulatorService, permissionManager, pathGuard, deviceIdentity |
| `apps/desktop/electron/remote/` | Remote control (phone pairing) |
| `apps/desktop/electron/browserSignIn.ts`, `signInScreen.ts` | Browser-based sign-in |
| `apps/desktop/electron/desktopAutoUpdate.ts`, `desktopCloudUpdate.ts` | In-place updates and download URLs |
| `apps/desktop/electron/browserPane.ts`, `previewWindow.ts`, `quickAsk.ts`, `dictationBar.ts`, `voiceDictation.ts`, `tray.ts` | Panes, quick ask, dictation, tray |
| `apps/desktop/electron/__tests__` | 109 files in the folder listing (Electron tests) |
| `apps/desktop/electron-builder.yml`, `electron/bundleBinaries.mjs`, `electron/verifyReleaseArtifact.mjs`, `electron/notarizeInstallers.mjs` | Packaging, binary bundling, release check, notarization |
| `apps/desktop/src/` | Retained Tauri renderer: `App.tsx`, `Main.tsx`, `features/*` (v3 shell, chat, code, terminal, settings, byok, ...), `api/`, `stores/` |
| `apps/desktop/src-tauri/` | Retained Tauri Rust host, `tauri.conf.json`, migrations, MCP registry |
| `apps/desktop/gpui/` | GPUI native migration host (`src/main.rs`, `src/ui`, `src/runtime.rs`, scripts) |
| `apps/desktop/e2e`, `playwright*`, `wdio*` | End-to-end specs (Playwright DOM, WebdriverIO for Tauri) |
| `apps/desktop/check-wiring.sh`, `wiring-allowlist.json` | Tauri wiring guard |

All [code] from directory listings of apps/desktop and apps/desktop/electron. Note: apps/desktop/AGENTS.md (not found) does not exist, though electron-builder.yml and the release workflow comments cite it.

## Sign-in

**Electron.** Sign-in happens in the user's browser, not in the window. A signed-out window shows a local `data:` screen with Start and Cancel buttons. Start opens the system browser at the web sign-in path with a PKCE-style challenge (random verifier, SHA-256 challenge); a pending sign-in lasts 10 minutes; the shell completes it from a deep link using scheme `agiworkforce-cloud`. [code] (apps/desktop/electron/signInScreen.ts:1-14; apps/desktop/electron/browserSignIn.ts:1-40; apps/desktop/electron-builder.yml `protocols`).

The web app's own identity provider is Clerk. The main process only allows navigation through the Clerk host named by this build's publishable key variable `VITE_CLERK_PUBLISHABLE_KEY` (development hosts only) plus first-party hosts. [code] (apps/desktop/electron/config.ts `clerkDevelopmentHost`).

**Bundled CLI account.** After the shell is signed in, `developerAccountSync.ts` reconciles the bundled CLI's account (`account/*` calls, device-code approval) with the shell identity before a Code thread starts. Sign-out without a running app-server runs `agi logout --account-only`, which forgets only the account grant and keeps provider keys the user saved in the terminal. [code] (apps/desktop/electron/runtime/developerAccountSync.ts; developerSessionService.ts:1203-1222, 1279-1300; cliAccountStore.ts).

**Required?** The signed-out screen replaces the site's sign-in pages, so chat needs an account [inferred]. Whether Code on a local folder works fully signed-out is [unknown]; the code comment says a thread started before the CLI is signed in is pinned to the user's own provider keys (developerSessionService.ts:2770).

**Tauri** has its own account module (`src-tauri/src/sys/account`) and refresh-token flow; a known flaw says a lost refresh reply revokes the sign-in family (DESKTOP-REFRESH-LOST-REPLY-01 in audit/registers/known-flaws.md:270).

## Modes: Local, own key, Cloud

| Mode | Electron Desktop chat | Electron Desktop Code (bundled CLI) | Retained Tauri |
|---|---|---|---|
| mode:cloud | Yes. Every chat request is Managed Cloud by construction (hosted web app) [code] (config.ts header comment; dispatcher.ts:3244 comment) | Yes, when the CLI is signed in to the account; the thread takes its model route at start [code] (developerSessionService.ts:2770) | Yes (`AppMode = 'local' \| 'cloud'`) [code] (src/stores/appModeStore.ts:9) |
| mode:own-key | No in chat. The dispatcher refuses on-device inference; own-key chat is not described for Electron [inferred] | Yes via provider keys saved in the CLI terminal, which survive account sign-out [code] (developerSessionService.ts:1203-1213, 2770 comment) | Retained BYOK code in `src/features/byok`, `src/api/byok.ts` [code] |
| mode:local | **No.** Commands in `LOCAL_INFERENCE_COMMANDS` return an `unsupported-platform` failure. The device profile reports `localModels: false` [code] (dispatcher.ts:3244-3246, 3366-3368; packages/contracts/local-runtime/src/inference.ts:3; dispatcher.ts ~2297) | Local models reachable through the bundled CLI, not through the shell commands [code] (dispatcher.ts:3238-3243 comment) | Yes; local mode only when `supportsLocalAppMode` (Tauri) [code] (src/lib/runtimeEnvironment.ts:21) |

The web app's Local mode row appears only when the host shell is `tauri`: `hostHasLocalMode` returns `bridge?.shell === 'tauri'`, and its comment says AGI Cloud is the Electron shell and offers no on-device model. [code] (packages/contracts/local-runtime/src/host-bridge.ts:680-692).

**Free versus subscribed.** The Electron shell code contains no plan check. Plan limits live in the hosted web app and the managed gateway, not in the shell [inferred]. Which plans can use Desktop Code, and what a Free user gets from the bundled CLI, is [unknown]; docs/product/surface-feature-matrix.md:245 marks plan status on desktop "unverified".

**Requirement mismatch to flag.** The established requirement says local inference on desktop is free of any paid subscription. The Electron chat refuses local inference by decision D-2026-09-15-04 ("Inference stays Managed Cloud"), so that requirement is met on Electron only through local coding sessions in the CLI, and in retained Tauri. [requirement] (docs/decisions/2026-09-15-founder-decisions.md:78-95) vs [code] (dispatcher.ts:3244).

MCP: the Electron shell reports `localMcp` from whether the bundled CLI serves MCP; connectors for chat use the hosted account connector service. [code] (dispatcher.ts:2299; docs/architecture/overview.md:136).

## Shared code

The Electron shell shows `apps/web`, so the whole chat UI is shared with surface:web, and with mobile through the shared contracts. [requirement] (ARCHITECTURE.md:53; docs/architecture/overview.md:24-26).

`apps/desktop/package.json` workspace dependencies (all [code]): `@agiworkforce/local-runtime-contract` (commands, deep-link and sign-in paths, `LOCAL_INFERENCE_COMMANDS`, env protections; used by Electron and GPUI), `@agiworkforce/types` (product names, model catalog), `@agiworkforce/ui` and `@agiworkforce/unified-chat` (shared chat UI, also used by web, Chrome, VS Code per AGENTS.md section 5), `@agiworkforce/client-runtime`, `ide-runtime`, `cloud-contracts`, `design-tokens`, `desktop-command-client`, `i18n`, `mcp`, `providers-ollama`, `providers-lmstudio`, `routing`, `skills`, `sync`, `trust-boundaries`, `artifacts`, `apply-patch`, `utils`, `observability`.

Rust: the bundled CLI binary (`apps/cli`, surface:cli) is the Code engine; GPUI and Tauri path-depend on shared `crates/*` (ARCHITECTURE.md:22, 114). Release feeds come from `apps/web` routes `/api/download` and `/api/releases/desktop-cloud/*` [code] (apps/web/app/api/download/route.ts; apps/web/app/api/releases/desktop-cloud).

## Build, run and test

Commands from apps/desktop/README.md and docs/agent-context/commands.json (read them before guessing filters). Per the project rules, heavy jobs run through `scripts/dev/heavy-job.sh`. None of these was run for this page.

| Task | Command |
|---|---|
| Electron dev | `pnpm --filter @agiworkforce/desktop dev:electron` |
| Electron installer | `pnpm --filter @agiworkforce/desktop dist:electron` |
| Typecheck (renderer then Electron main) | `pnpm --filter @agiworkforce/desktop typecheck` (Electron only: `typecheck:electron`) |
| Unit tests (Vitest) | `pnpm --filter @agiworkforce/desktop test` |
| Tauri dev / build | `dev` / `build` (`build:local` for unsigned) |
| GPUI | `dev:gpui`, `build:gpui`, `check:gpui`, `test:gpui`, `test:gpui:render` (needs Node 24, pinned Rust, macOS Metal toolchain) |
| Rust tests | `cargo test -p agiworkforce-desktop --lib` |
| End to end | `test:e2e` (WebdriverIO, Tauri), `test:e2e:dom` and `test:smoke` (Playwright) |
| Release checks | `check:release-binary`, `check:no-devtools`, `verify:updater-key` |

Electron test files sit in `electron/__tests__` and beside sources; the retained renderer has about 365 test files under `src` (counted by find). Known flaw: the Electron test files are never typechecked (DESKTOP-ELECTRON-TESTS-UNTYPECHECKED-01, known-flaws.md:225). A change to `apps/desktop/src` is invisible in the Electron window. [code] for all, from package.json and README.

## Release state

- **Implementation status.** A release workflow exists: `.github/workflows/release-desktop-cloud.yml` on tags `v-cloud-desktop-<semver>`. Version comes from the tag. Never attach these assets to `v-desktop-*` releases (Tauri feed). [code] (workflow header).
- **Platform.** Public platform list for desktop is macOS only: `SURFACE_PLATFORMS.desktop = ['macOS']`. Auto-update is supported only for packaged macOS builds. [code] (apps/web/lib/surface-status.ts:42; apps/desktop/electron/desktopAutoUpdate.ts `autoUpdateSupported`). electron-builder.yml defines only a `mac:` section (dmg and zip) [code].
- **Updates.** Daily check against `/api/releases/desktop-cloud/update/<arch>/<version>`; first install is `/api/download?platform=mac&app=cloud&arch=<arch>`. [code] (desktopCloudUpdate.ts; desktopAutoUpdate.ts:AUTO_UPDATE_CHECK_INTERVAL_MS).
- **Public label.** `SURFACE_STATUS.desktop` is `Coming soon`, so the website shows Desktop as not yet available. [code] (apps/web/lib/surface-status.ts:8).
- **Verification status.** Whether the release workflow has ever run is not in the tree [requirement] (docs/product/surface-feature-matrix.md:24). Some pieces have recorded checks: the simulator service was run in a real Electron process on 2026-11-13, and the installed apps were observed on 2026-11-23 (audit/flows/desktop-code-tab-parity-2026-11-13.md). Signed, notarized builds in users' hands are [unknown].

## Differences from the unified experience

- **Chat is the web app**, so chat features match surface:web by construction. Gaps are device features the web lacks and web features the shell blocks.
- **No on-device chat models** on Electron (web and Electron chat are Cloud only), whereas mobile and the retained Tauri app offer local inference. [code] (dispatcher.ts:3244; docs/product/suite.md:33).
- **Feature matrix cells for desktop** (docs/product/surface-feature-matrix.md): present for projects, library, tasks, skills, memory, voice dictation, terminal, git, diff viewer, computer use, BYOK settings (Tauri), deep research (Tauri `src`), media tools (Tauri Rust). Absent: study mode, video generation, local MCP in chat (public Electron reports `localMcp` through the CLI separately), hosted app publishing in the window, renderer browser automation (deleted). Unverified: search mode, camera, plan status, help centre, context handoff. Many "present" cells point to retained Tauri files under `apps/desktop/src`, which the public Electron window does not show [requirement] (matrix line 24 and apps/desktop/README.md), so check the cell path before treating a feature as public.
- **Device registry.** Desktop sends no heartbeat, so a Desktop sign-in never shows in the devices panel (WEB-DESKTOP-DEVICES-NEVER-WRITTEN-01, known-flaws.md:50) [requirement]; `describeDeviceForRegistry` exists in dispatcher.ts:~2290 [code]. Treat the flaw row as possibly stale [unknown].
- **Two continuity domains.** Desktop chats join Account Cloud sync; Desktop Code sessions join the Host Developer domain with CLI and VS Code and are never merged implicitly. [requirement] (docs/product/suite.md:45; ARCHITECTURE.md:172-176).

## Gaps

| Gap | Basis and source |
|---|---|
| Site still says Desktop is Coming soon; macOS only; no recorded release run | [code] surface-status.ts:8,42; [requirement] matrix line 24 |
| No local or own-key chat in Electron; subscription rules for Free vs paid Code unclear | [code] dispatcher.ts:3244; [unknown] plan gating |
| Tauri public status: a 2026-10-24 decision says second public app loading the hosted web app, but the README and AGENTS.md say internal and the code shows the Vite renderer; owner question | [requirement] docs/decisions/2026-09-15-founder-decisions.md:78-99 vs apps/desktop/README.md; [unknown] |
| Installed Electron builds fall back to command mode on the interactive workspace terminal protocol | [requirement] DESKTOP-ELECTRON-WORKSPACE-TERMINAL-WIRE-01 (known-flaws.md:224) |
| Electron tests not typechecked | [requirement] known-flaws.md:225 |
| Credential files such as `.env` in an approved folder refused only by name and only by the app's own file commands | [requirement] DESKTOP-WORKSPACE-CREDENTIAL-READS-01 (known-flaws.md:265) |
| Remote-control messages are signed, not encrypted; the relay can read them | [requirement] DESKTOP-REMOTE-CONTROL-RELAY-READS-PAYLOADS-01 (known-flaws.md:264) |
| System dictation was unwired in the retained renderer; spec gates release | [requirement] DESKTOP-SYSTEM-DICTATION-UNWIRED-01; Electron `voiceDictation.ts` exists [code] |
| Code tab behind Claude's desktop app: sidebar toggles, side-by-side panes, task panel, browser sign-in import, agent in browser pane, simulator tap and type | [requirement] audit/flows/desktop-code-tab-parity-2026-11-13.md |
| Browser pane sets no rule for page-started downloads; simulator pane screen not seen in a built app | [requirement] same file |
| Linux and Windows integration thin; computer use pointer steps missing on Linux | [requirement] DESKTOP-LINUX-PLATFORM-GAP-01, DESKTOP-COMPUTER-USE-POINTER-HIT-TEST-01 |
| GPUI host: accessibility acceptance open (DESKTOP-GPUI-ACCESSIBILITY-01), Windows ConPTY, many Cloud features in development | [requirement] apps/desktop/README.md |
| Package named for the trust mode (`com.agiworkforce.desktop.cloud`); rename pending | [requirement] D-2026-09-15-04 derived note; [code] electron-builder.yml |

## How to verify

1. Read `apps/desktop/electron/config.ts` for where the window loads and what it allows.
2. Read `apps/desktop/electron/runtime/dispatcher.ts` near `LOCAL_INFERENCE_UNSUPPORTED` and `describeDeviceForRegistry` for the mode and device profile.
3. Read `apps/web/lib/surface-status.ts` for the public label and platforms.
4. Read `apps/desktop/electron-builder.yml` and `.github/workflows/release-desktop-cloud.yml` for packaging and tags.
5. Run `pnpm --filter @agiworkforce/desktop typecheck` and `test` (via `scripts/dev/heavy-job.sh` and `light-job.sh`), then the Electron fixture specs. To prove release state, check GitHub for a `v-cloud-desktop-*` tag; the repo cannot show it.
6. Check `audit/registers/known-flaws.md` rows prefixed DESKTOP- for current defects.

Nothing in this page was executed; it comes from reading files.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| The public Desktop is the Electron shell; its window shows the hosted web app, so changes in apps/desktop/src never reach it. | stated requirement | `apps/desktop/README.md:1-30`; `ARCHITECTURE.md:43-56`; `docs/decisions/2026-09-15-founder-decisions.md:78` |
| Tauri (src-tauri + src) is retained internal code per the README and AGENTS.md; its window shows the Vite renderer in src. A 2026-10-24 decision note says the owner chose to ship it as a second public app loading the hosted web app, which conflicts with the code, so its public status is an open owner question. GPUI (apps/desktop/gpui) is an opt-in native migration host that replaces neither. | stated requirement | `apps/desktop/README.md:1-27`; `AGENTS.md section 5`; `ARCHITECTURE.md:56`; `docs/decisions/2026-09-15-founder-decisions.md:78-99` |
| The web status map labels Desktop 'Coming soon' and lists macOS as its only platform. | read in the code | `apps/web/lib/surface-status.ts:8`; `apps/web/lib/surface-status.ts:42` |
| Electron chat is Cloud-only: dispatcher refuses every command in LOCAL_INFERENCE_COMMANDS with an unsupported-platform failure. | read in the code | `apps/desktop/electron/runtime/dispatcher.ts:3244`; `apps/desktop/electron/runtime/dispatcher.ts:3366`; `packages/contracts/local-runtime/src/inference.ts:3` |
| The web Local mode appears only when the host shell is tauri: hostHasLocalMode returns bridge?.shell === 'tauri', and its comment says AGI Cloud is the Electron shell with no on-device model. | read in the code | `packages/contracts/local-runtime/src/host-bridge.ts:680-692` |
| The device registry profile reports localModels false and localMcp from whether the bundled CLI serves MCP. | read in the code | `apps/desktop/electron/runtime/dispatcher.ts:2299` |
| Window security: contextIsolation true, sandbox true, nodeIntegration false, persistent partition persist:agi-cloud. | read in the code | `apps/desktop/electron/main.ts:1104-1116`; `apps/desktop/electron/config.ts` |
| A packaged build ignores AGI_CLOUD_APP_ORIGIN; only an allowlisted --agi-cloud-app-origin argument can redirect the window; default is production origin. | read in the code | `apps/desktop/electron/config.ts cloudAppOriginFrom` |
| Sign-in happens in the system browser with a verifier/challenge and a 10-minute pending window; the window shows a data: sign-in screen with no bridge; deep link scheme is agiworkforce-cloud. | read in the code | `apps/desktop/electron/browserSignIn.ts:1-40`; `apps/desktop/electron/signInScreen.ts:1-14`; `apps/desktop/electron-builder.yml` |
| Code sessions run in a bundled agi CLI app-server per approved folder; the shell syncs the CLI account to the shell identity before thread start. | read in the code | `apps/desktop/electron/runtime/developerSessionService.ts:1279-1300`; `apps/desktop/electron/runtime/developerSessionService.ts:2755-2780`; `apps/desktop/electron/runtime/developerAccountSync.ts` |
| Sign-out without an app-server runs the CLI's logout --account-only, which keeps provider keys saved in the terminal. | read in the code | `apps/desktop/electron/runtime/developerSessionService.ts:1203-1222` |
| A single bridge object agiHost is exposed by the preload; privileged commands pass through dispatcher.ts, permissionManager.ts and pathGuard.ts. | read in the code | `apps/desktop/electron/preload.ts:201`; `ARCHITECTURE.md:79-91` |
| Packaging is electron-builder with app id com.agiworkforce.desktop.cloud, mac dmg and zip only, fuses runAsNode off and asar integrity on. | read in the code | `apps/desktop/electron-builder.yml` |
| Release workflow release-desktop-cloud.yml triggers on tags v-cloud-desktop-*; whether it has ever run is not in the tree. | stated requirement | `.github/workflows/release-desktop-cloud.yml`; `docs/product/surface-feature-matrix.md:24` |
| Auto-update works only in packaged macOS builds, checks daily, and uses /api/releases/desktop-cloud/update/<arch>/<version>. | read in the code | `apps/desktop/electron/desktopAutoUpdate.ts`; `apps/desktop/electron/desktopCloudUpdate.ts` |
| The Electron shell has no plan or entitlement check in the files read; plan gating is not established for Desktop Code. | unknown | `docs/product/surface-feature-matrix.md:245`; `apps/desktop/electron/runtime/developerSessionService.ts` |
| Retained Tauri app has AppMode local/cloud and allows local mode only in Tauri (supportsLocalAppMode). | read in the code | `apps/desktop/src/stores/appModeStore.ts:9`; `apps/desktop/src/lib/runtimeEnvironment.ts:21` |
| Local MCP in the public Electron Desktop runs through the bundled agi app-server, managed on a Developer settings page; project servers need approval. | stated requirement | `docs/decisions/2026-09-15-founder-decisions.md:78-95`; `docs/architecture/overview.md:136` |
| Feature matrix desktop cells often cite retained Tauri files, which are not shown in the public Electron window. | stated requirement | `docs/product/surface-feature-matrix.md:24`; `apps/desktop/README.md` |
| Known flaw: installed Electron builds fall back to command mode on the interactive workspace terminal protocol. | stated requirement | `audit/registers/known-flaws.md:224` |
| Known flaw: Electron test files are not typechecked. | stated requirement | `audit/registers/known-flaws.md:225` |
| Known flaw: remote-control messages are signed but not encrypted, so the relay can read them. | stated requirement | `audit/registers/known-flaws.md:264` |
| Desktop Code tab trails Claude's: no side-by-side panes, task panel, sign-in import, or agent in browser pane; checks owed on the running app. | stated requirement | `audit/flows/desktop-code-tab-parity-2026-11-13.md` |
| Desktop chats sync in Account Cloud; Desktop Code sessions share the Host Developer domain with CLI and VS Code and are not merged implicitly. | stated requirement | `docs/product/suite.md:45`; `ARCHITECTURE.md:172-176` |
| The relay host for remote control is allowlisted to the fly.dev signaling host or first-party hosts; ws only for local origin. | read in the code | `apps/desktop/electron/config.ts isAllowedRelayUrl` |
| Build commands: dev:electron, dist:electron, typecheck, test; the Rust CLI engine is bundled via bundleBinaries.mjs. | read in the code | `apps/desktop/package.json`; `apps/desktop/electron-builder.yml beforePack` |

## Open questions

- Has release-desktop-cloud.yml ever produced a signed, notarized build, and when will web SURFACE_STATUS.desktop change from Coming soon?
- Which plans (Free, subscribed) can use Desktop Code through the bundled CLI, and does Code require sign-in to the account? No entitlement check was found in the Electron shell.
- Is own-key (BYOK) chat intended for the public Electron Desktop, given D-2026-09-15-04 keeps inference Managed Cloud while the product requirement says local inference on desktop is free of any subscription?
- Is Tauri a second public app? The 2026-10-24 decision note says yes and says it loads the hosted web app; the README and AGENTS.md still call Tauri internal, and the Tauri window shows the Vite renderer. This is an owner question.
- Will Windows and Linux Electron builds ship? electron-builder.yml has only a mac section.
- Is the desktop-devices flaw (no heartbeat) still true, since describeDeviceForRegistry exists in dispatcher.ts?
- What is the shipped product name and bundle name (productName is 'Desktop', app id contains 'cloud')?

## Project documents found out of date

- `apps/desktop/electron/config.ts header comment and electron-builder.yml comments`: They cite apps/desktop/AGENTS.md as the source for 'one Desktop surface, two shells'. The code says: apps/desktop/AGENTS.md does not exist; the owning documents are apps/desktop/README.md and ARCHITECTURE.md. (ls apps/desktop/AGENTS.md returned no such file)
- `docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-04 (Tauri not a public product, Electron sole public Desktop)`: The same entry says it was superseded on 2026-10-24 to ship Tauri as a second public app loading the hosted web app, while README, ARCHITECTURE.md and AGENTS.md section 5 still say Tauri is internal only. The code says: The Tauri window shows the Vite renderer in src, not the hosted web app (apps/desktop/README.md; hostHasLocalMode is true only for the tauri shell). Release workflows and download routes cover only the Electron 'cloud' channel in the Desktop path read; Tauri public status is unproven and is an owner question. (docs/decisions/2026-09-15-founder-decisions.md:78-99 versus apps/desktop/README.md:1-12)
- `audit/registers/known-flaws.md WEB-DESKTOP-DEVICES-NEVER-WRITTEN-01`: Says the Electron Desktop sends no device heartbeat. The code says: dispatcher.ts defines describeDeviceForRegistry with capabilities; whether it is sent was not traced, so the row may be stale. (apps/desktop/electron/runtime/dispatcher.ts ~2290; audit/registers/known-flaws.md:50)
