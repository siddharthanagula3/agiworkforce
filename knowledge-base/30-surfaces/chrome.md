---
id: "SURF-chrome"
type: "surface"
title: "chrome app"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# chrome app

The Chrome extension (surface:chrome) is a Manifest V3 side panel that reads pages and, on sites the user approves, clicks and types. It signs in through Clerk, needs an AGI account (free or paid), and talks to Managed Cloud only. No own-key mode. Version 0.0.6. Web status shows Coming soon. Release workflow exists; no store release is proven in the tree.

## What it is and who uses it

The Chrome extension is a browser side panel assistant. It chats, reads the current page, selected text and other tabs, and, on sites the user approved, clicks, types and fills forms. [code] (apps/extension/package.json:4 description; apps/extension/manifest.json:5)

**Users.** Anyone with an AGI account, free or paid. The store listing says "Needs a free or paid AGI account. Not available in incognito windows." [code] (apps/extension/docs/chrome-web-store-listing.md:91; apps/extension/manifest.json:7 `incognito: not_allowed`). The product suite page calls it a "Cloud-only browser assistant, page context, extension/native-host bridge". [requirement] (docs/product/suite.md:36)

**Names.** Manifest name is "AGI Extension"; the package is `@agiworkforce/extension`; the release archive is named `agi-browser-companion-<version>.zip`. [code] (apps/extension/manifest.json:3; apps/extension/package.json:2; .github/workflows/release-chrome-extension.yml, metadata step). The name shown to users should come from the product-names registry (packages/contracts/types/src/product-names.ts). [requirement] (AGENTS.md section 4)

**Main features** (all [code], folders under apps/extension/src/features):
- Chat in the side panel with history, projects, memory, artifacts, voice, read aloud, share.
- Page context: current page, selection, several tabs (features/browser-tools, features/side-panel/tabContext.ts).
- Browser control by a Chrome DevTools Protocol driver (features/computer-use/cdpDriver.ts) with approval modes. Auto stops for crucial actions; Ask first confirms every action; no mode completes a purchase. [code] (apps/extension/docs/threat-model.md objectives; features/computer-use/approvalPolicy.ts, crucialActions.ts)
- Unattended tasks with `-yolo` or `--always-approve`, scheduled tasks, recorded shortcuts, job-application autofill (features/content/autofill, src/jobAutofill.ts). [code] (apps/extension/README.md; features/background/scheduled-task-runs.ts)
- Close finished tabs without reading them (features/browser-tools/tabCleanup.ts). [code] (README.md)
- A bridge to AGI Desktop through native messaging (features/native-bridge). [code]

## How it is built

- **Language and bundler.** TypeScript, built with Vite. Two passes: the main pass builds the service worker, side panel, options page and welcome page as ES modules; a second pass (`BUILD_TARGET=content`) builds the content script as a self-contained classic script. [code] (apps/extension/vite.config.ts:25-45, 70-85; package.json scripts `build`, `dev`)
- **Platform.** Chrome Manifest V3, `minimum_chrome_version` 132, service worker `src/background.js`, side panel `src/side_panel.html`, options page `src/options.html`, content script on all `http://*/*` and `https://*/*` top frames. [code] (apps/extension/manifest.json)
- **UI.** Plain DOM code, not React: `side_panel.ts` builds elements with helper functions (`el`). Markdown uses markdown-it, KaTeX and DOMPurify. [code] (package.json dependencies; features/side-panel/dom.ts) The shared chat package `@agiworkforce/unified-chat` is also imported (16 import sites). [code] (grep of src)
- **Size.** `src/background.ts` is about 9,300 lines, `src/side_panel.ts` about 16,800 lines, `src/content.ts` about 1,800 lines. [code] (wc -l)
- **Permissions.** activeTab, tabs, storage, nativeMessaging, alarms, contextMenus, sidePanel, scripting, cookies, notifications, tabGroups, debugger, downloads. Optional: history and any http(s) host. Fixed hosts: localhost, 127.0.0.1, agiworkforce.com, api.agiworkforce.com. [code] (manifest.json)
- **Security design.** The content script is treated as possibly compromised. Storage areas are set to trusted contexts only, so a page cannot read the session token or the approved-sites list. The agent refuses to operate the user's own AGI account origins. [code] (docs/threat-model.md; features/background/storageAccess.ts; features/computer-use/accountOrigins.ts; test:apps/extension/__tests__/content-storage-boundary.test.ts)
- **Package manager.** Node 24 or newer, pnpm workspace member. [code] (package.json engines)

## Folder map and entry points

All paths are under `apps/extension`.

| Path | What it holds |
|---|---|
| `manifest.json`, `managed-schema.json` | Source manifest and the enterprise managed-storage schema |
| `src/background.ts` | Service worker: message routing, tabs, alarms, scheduled tasks, native bridge, managed chat dispatch |
| `src/side_panel.ts`, `side_panel.html/.css` | The main UI |
| `src/content.ts` | Content script (page reader, in-page launcher, run overlay) |
| `src/options.ts`, `options.html` | Settings: approved sites, browser control grant, data handling, shortcuts, desktop pairing |
| `src/welcome.ts`, `welcome.html` | First-run page |
| `src/webmcp.ts` | Exposes the open page to a model as tools (partial MCP) |
| `src/background/` | `policy.ts` (sender and origin gates), `memory-bridge.ts`, `site-policy-publication.ts`, `task-notifications.ts` |
| `src/features/cloud-bridge/` | Everything that talks to AGI Cloud: `clerkAuth.ts`, `freeTrialClient.ts` (chat transport), `managedChatHandler.ts`, `conversationSync*.ts`, `memoryClient.ts`, `projectsClient.ts`, `schedulesClient.ts`, `skillsClient.ts`, `shareClient.ts`, `deviceHeartbeat.ts`, `videoGenerationClient.ts` |
| `src/features/computer-use/` | Browser agent: `agentLoop.ts`, `cdpDriver.ts`, `approvalPolicy.ts`, `browserControlConsent.ts`, `cloudAgentClient.ts` |
| `src/features/browser-tools/` | Tab, console, network, download and page-watch tools |
| `src/features/native-bridge/` | Desktop pairing and commands (`pairing.ts`, `desktopCommands.ts`, `nativeBrowserDriver.ts`) |
| `src/features/side-panel/` | Panel parts: chat state, artifacts, voice, memory sheet, tasks sheet, free-plan notices |
| `src/features/content/` | Page element reading, form fill, job autofill |
| `src/features/site-policy/`, `features/options/` | Approved and blocked sites; settings rows |
| `src/features/observability/` | Opt-in crash reports, audit trail, analytics |
| `native-host/` | Native messaging host manifest template and `install.sh` |
| `scripts/` | `manifest-config.mjs`, `prepare-package.mjs`, `verify-package.mjs`, store publish scripts, guards |
| `e2e/` | `smoke.mjs`, `extension-harness.mjs` (Chromium smoke) |
| `__tests__/` | About 300 Vitest files |
| `docs/` | `threat-model.md`, `chrome-web-store-listing.md` |
| `store-assets/`, `icons/`, `_locales/` | Store images, icons, translations |

Build entries are four: background, side_panel, options, welcome, plus content. [code] (vite.config.ts:72-85, 41)

## Sign-in

- **Provider.** Clerk, through `@clerk/chrome-extension`. The extension builds a Clerk client with the publishable key and a sync host, so it acts as the account already signed in on the web. [code] (src/features/cloud-bridge/clerkAuth.ts:1-80)
- **Flow.** The panel's sign-in opens a tab at the web app `/sign-in` with `redirectTo=/auth/chrome-extension`. The extension then reads the sync-host session. [code] (clerkAuth.ts:215-223). The `cookies` permission exists for this. [code] (docs/threat-model.md capability table)
- **Configuration names (no values).** `CLERK_PUBLISHABLE_KEY`, `CLERK_FRONTEND_API`, `CLERK_SYNC_HOST`, `VITE_AGI_WEB_API_BASE_URL`, `VITE_ARTIFACT_SANDBOX_ORIGIN`, `VITE_SENTRY_DSN`, `CHROME_EXTENSION_PUBLIC_KEY`. [code] (apps/extension/.env.example)
- **Fail closed.** If the key or sync host is missing or malformed, sign-in throws. [code] (clerkAuth.ts:60-70)
- **Stable extension ID.** Production builds need `CHROME_EXTENSION_PUBLIC_KEY` so the ID matches the store item; Clerk sync depends on it. [code] (.env.example; scripts/manifest-config.mjs) [requirement] (docs/runbooks/chrome-web-store-publish.md:33)
- **Token use.** Chat requests carry the Clerk session token. A development-only bearer token in local storage is honoured only when the build is a Vite dev build. [code] (features/cloud-bridge/freeTrialClient.ts:360-425)
- **Verification.** Register row EXT-CRX-KEY-MISSING-BLOCKS-CLERK-SYNC-01 says authenticated sign-in with the Store identity is not yet verified; only the signed-out bridge was answered in Chromium (2026-11-24). [requirement] (audit/registers/known-flaws.md:363)
- **Account changes.** Managed-cloud owner is tracked (`managedCloudAuthority.ts`) so a switch of account does not mix data. [code]

## Modes: Local, own key, Cloud

| Mode | Chat in this app | Basis |
|---|---|---|
| mode:cloud (Managed Cloud) | Yes. The only chat route. Chat posts to `/api/llm/v1/chat/completions` on the AGI web origin; models list from `/api/llm/v1/models`; usage from `/api/usage`. | [code] (freeTrialClient.ts:112-116) |
| mode:own-key (BYOK) | No. A leftover stored provider key is purged. The threat model says a failed cloud turn must not fall back to Desktop, Local or BYOK. | [code] (features/security/legacyProviderCredentials.ts:1-25) [requirement] (docs/threat-model.md objectives) |
| mode:local | No local inference in the extension. The Desktop bridge runs page actions requested by a paired desktop; it is not a chat model route. | [code] (features/native-bridge/desktopCommands.ts header comment) [inferred] |

**Free and subscribed users.** Both use Managed Cloud after sign-in. The server decides admission, plan, usage and model routing; the client shows plan notices and quota recovery (top up, upgrade, view usage). [code] (freeTrialClient.ts:122-160 quota types; features/side-panel/freePlanNotices.ts; docs/threat-model.md trust table: "Server admission, plan, usage and model routing remain authoritative"). The default model comes from the shared catalog helper `getDefaultModelFor` for the free tier, not a literal. [code] (freeTrialClient.ts:~60 FREE_TRIAL_MODEL) Model list comes from the catalog in packages/contracts/types/src/models.json (generated; do not edit by hand). [requirement] (AGENTS.md section 4)

**Local-inference requirement.** The product requirement that local inference on mobile and desktop is free of any subscription does not apply to this app because it has no local inference. [inferred]

**Execution boundaries.** On the device: page reading, DOM actions, DevTools-protocol driver, approved-site list, conversation store (authoritative copy), recordings. On AGI servers: all model inference, usage and quota, memory, projects, schedules, skills, share, video generation. [code] (cloud-bridge clients; docs/threat-model.md)

**Sync rule.** A conversation is mirrored into the account store only when every turn has Managed Cloud provenance; unknown, Local or BYOK turns stay browser-local. [requirement] (docs/architecture/overview.md:75; docs/product/suite.md:70-74) [code] (features/cloud-bridge/conversationSync.ts)

The guard `check:no-cloud-ipc` stops cloud IPC calls outside the cloud-bridge folder. [code] (scripts/check-no-cloud-ipc-v1.mjs)

## Shared code

Workspace packages imported by `src` (count of import sites), all [code] (grep of apps/extension/src):

| Package | Sites | Used for |
|---|---|---|
| @agiworkforce/types | 64 | Contract types, plan tier helpers, browser command protocol, model catalog access |
| @agiworkforce/cloud-contracts | 51 | Request and response schemas for the cloud API, schedules, web-domain rules |
| @agiworkforce/unified-chat | 16 | Shared chat UI logic (also used by desktop, web, VS Code) |
| @agiworkforce/utils | 14 | Helpers |
| @agiworkforce/client-runtime | 14 | Client runtime pieces |
| @agiworkforce/routing | 4 | Routing metadata |
| @agiworkforce/provider-protocol | 3 | Stream parsing (thinking-tag splitter) |
| @agiworkforce/design-tokens | 3 | Design tokens |
| @agiworkforce/agent-core | 3 | Agent core |
| @agiworkforce/compliance, sync, observability, artifacts | 1-2 each | Compliance, sync, telemetry, artifacts |

package.json also lists browser-tool and provider-runtime as dependencies; no import of them was found in src. [code] (package.json vs grep) [unknown] whether they are used by tests or are leftovers.

The web API is the shared backend: the extension calls `/api/csrf`, `/api/me`, `/api/llm/v1/*`, `/api/usage`, `/api/memory`, `/api/memory/commands`, `/api/skills`, `/api/share`, `/api/media/video/generate`, `/api/media/video/status`, `/api/settings/sessions/`. [code] (grep of features/cloud-bridge)

Device listing: the extension appears in the web devices panel through a heartbeat. [code] (features/cloud-bridge/deviceHeartbeat.ts) [requirement] (audit/registers/known-flaws.md:50)

`unified-chat` rule: nothing in it may assume one surface. [requirement] (AGENTS.md section 5)

## Build, run and test

Commands come from docs/agent-context/commands.json (chromeExtension block, lines ~150-161). [requirement] Heavy jobs must go through `scripts/dev/heavy-job.sh`. [requirement] (CLAUDE.md)

| Task | Command |
|---|---|
| Build | `pnpm --filter @agiworkforce/extension build` (Vite main pass, then content pass) |
| Watch dev | `pnpm --filter @agiworkforce/extension dev` |
| Typecheck | `pnpm --filter @agiworkforce/extension typecheck` |
| Unit tests | `pnpm --filter @agiworkforce/extension test` (Vitest, jsdom, `__tests__/**/*.test.ts`; `pretest` checks for conflict markers) |
| Lint | `pnpm lint:extension` |
| Guards | `check:no-hex`, `check:no-cloud-ipc` |
| Chromium smoke | `test:e2e` (build, then `e2e/smoke.mjs`); `test:e2e:package` against `extension.zip` |
| Package | `pnpm --filter @agiworkforce/extension package` (build, prepare, zip, verify) |

[code] (package.json scripts; vitest.config.ts:15-21)

**Load unpacked.** Build, then in Chrome load apps/extension/dist (not found) as an unpacked extension. [inferred] from dist/manifest.json being the build output.

**Local artifact previews.** Set `VITE_ARTIFACT_SANDBOX_ORIGIN=http://127.0.0.1:3002` in `.env.local`, run `node infrastructure/sandbox/dev.mjs --extension-id <id> --port 3002`, keep the web app on `http://localhost:3000`. [code] (README.md)

**Native host.** `native-host/install.sh` and `scripts/install-native-host.*` install the messaging host manifest. [code]

I did not run any of these (read-only task); test status is [unknown] here.

## Release state

**Implementation status.** Code is broad and connected; version 0.0.6 in both package.json and manifest.json (they must equal the tag). [code] (package.json:3; manifest.json:4; release workflow metadata step)

**Public status.** The web app marks Chrome as "Coming soon" and sends the call to action to `/chrome-extension`, with a notify list. [code] (apps/web/lib/surface-status.ts:12, 69-73)

**Pipeline.** `.github/workflows/release-chrome-extension.yml` runs on tags `v-ext-X.Y.Z` or manual dispatch, checks that tag, package and manifest versions agree, builds, verifies one ZIP, and submits only after protected-environment approval when `publish` is true. Publishing uses Chrome Web Store API v2 with workload identity, no stored keys. [code] [requirement] (docs/runbooks/chrome-web-store-publish.md:11-14) The first version must be uploaded by hand in the Developer Dashboard. [requirement] (same, line 14, 46+)

**Whether it has ever run or been published is not in the tree.** [requirement] (docs/product/surface-feature-matrix.md:28) The 2026-11-03 live audit states it is "not evidence of a published Chrome Web Store release". [requirement] (audit/live-check/chrome-assistant-parity-2026-11-03.md:6)

**Verification status.** Real Chromium runs are recorded for many flows in audit/registers/known-flaws.md (for example a local 0.0.6 ZIP on 2026-11-24 answered the signed-out bridge). Authenticated sign-in with the store identity and the tagged release remain unverified. [requirement] (known-flaws.md:363)

## Differences from the unified experience

- **Cloud only.** No Local or BYOK chat; the other apps offer them per the suite model. [code] [requirement] (docs/product/suite.md:36)
- **Local store is authoritative.** Chat history stays in the browser; only all-Managed-Cloud conversations are mirrored to the account. Web, Desktop and Mobile treat the account store as the main copy. [requirement] (docs/architecture/overview.md:48, 75)
- **Not the shared chat shell.** UI is vanilla DOM in a 16,800-line `side_panel.ts` using only part of `unified-chat`. [code] [inferred]
- **Missing features** per the matrix: library of artifacts, research reports, study mode, image and video generation, camera, connectors, skills and plugins, apps, code sessions, help (links out to web), Fast mode. [code] (docs/product/surface-feature-matrix.md lines 199, 259, 269-319, 339, 359-379, 409, 419)
- **Partial:** MCP is page tools only (`webmcp.ts`), with no server connection. [code] (matrix line 389)
- **Unique to Chrome:** page reading, DOM and DevTools actions on approved sites, tab management, job autofill, desktop native bridge. [code]
- **Design.** Uses `@agiworkforce/design-tokens`; `check:no-hex` blocks raw colours. [code] (package.json)
- **Platform list** on the web: macOS, Windows, Linux. [code] (surface-status.ts:46)

## Gaps

All rows are from audit/registers/known-flaws.md unless stated.

| Gap | Severity | Basis |
|---|---|---|
| EXT-UNATTENDED-FAILED-RUN-SUCCESS-01: a failed, timed-out, partial or cancelled unattended run is reported as success, so schedules are marked finished instead of retried (managedChatHandler.ts:~480-502) | High | [requirement] line 372 |
| EXT-CRX-KEY-MISSING-BLOCKS-CLERK-SYNC-01: production sign-in with store identity unverified | High | line 363 |
| EXT-SIGNOUT-DELETES-RECORDINGS-01: source fixed; live two-account run pending | High | line 373 |
| EXT-TYPED-SECRET-IN-ACTIVITY-01: fixed locally; release validation pending | High | line 375 |
| CLOUD-UPLOAD-RELAY-AUTH-01: Chrome fixed; Mobile and CLI equivalents untested | High | line 360 |
| EXT-CONTENT-SCRIPT-ALL-SITES-01: content script on every http(s) page; store review risk | Medium | line 364 |
| EXT-APPLICATION-TARGET-RETRY-01: stale or covered target recovery; EXT-AUTOFILL-PHANTOM-FILE-ESCALATION-01 | Medium | lines 361, 367 |
| EXT-MIXED-HOSTED-TOOL-HANDOFF-01: caller tool handoff only for scoped admissions; native acceptance not run | Medium | line 369 |
| CLIENT-MODEL-NOT-AVAILABLE-RECOVERY-01: Chrome drops the required plan on `model_not_available`; owner wants a plan gate everywhere; not built | Medium | line 370 |
| EXT-STREAM-TABLE-RETENTION-01 | Low | line 371 |
| Feature absence listed in the previous section; no plan or quota display found in the panel | n/a | [code] matrix line 249 (unverified) |
| Public status still Coming soon; first store upload is a manual owner step | n/a | [code] surface-status.ts:12; [requirement] runbook |

## How to verify

1. Read `apps/extension/manifest.json` and `package.json` for version, permissions and scripts.
2. Confirm Cloud-only: open `src/features/cloud-bridge/freeTrialClient.ts` (endpoints at lines 112-116) and `features/security/legacyProviderCredentials.ts`; search `src` for any provider key use.
3. Confirm sign-in: `clerkAuth.ts` (`openClerkSignIn`, line 215).
4. Run unit tests with `pnpm --filter @agiworkforce/extension test`, typecheck, lint, and the two guards (through `scripts/dev/heavy-job.sh` on the 16 GB laptop).
5. Run `pnpm --filter @agiworkforce/extension test:e2e` for the Chromium smoke test.
6. Key tests: test:apps/extension/__tests__/manifest-contract.test.ts (permissions frozen), test:apps/extension/__tests__/content-storage-boundary.test.ts, test:apps/extension/__tests__/auth-interop.test.ts.
7. For release: check `docs/runbooks/chrome-web-store-publish.md` and the workflow; check `SURFACE_STATUS.chrome` in apps/web/lib/surface-status.ts.
8. For gaps, open the cited rows in audit/registers/known-flaws.md.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| The Chrome extension is Manifest V3, version 0.0.6, minimum Chrome 132, with a side panel, options page, service worker and content script. | read in the code | `apps/extension/manifest.json`; `apps/extension/package.json:3` |
| Chat is Managed Cloud only: it posts to /api/llm/v1/chat/completions on the AGI web origin; models from /api/llm/v1/models; usage from /api/usage. | read in the code | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112-116` |
| There is no own-key (BYOK) or Local chat; a legacy stored provider key is purged from local, session and sync storage. | read in the code | `apps/extension/src/features/security/legacyProviderCredentials.ts:1-25`; `apps/extension/docs/threat-model.md` |
| A failed cloud turn must not fall back to Desktop, Local or BYOK inference. | stated requirement | `apps/extension/docs/threat-model.md (Security objectives)` |
| Sign-in uses Clerk (@clerk/chrome-extension) with a sync host; the panel opens web /sign-in?redirectTo=/auth/chrome-extension. | read in the code | `apps/extension/src/features/cloud-bridge/clerkAuth.ts:1-80, 215-223` |
| An AGI account (free or paid) is required; incognito is not allowed. | read in the code | `apps/extension/docs/chrome-web-store-listing.md:91`; `apps/extension/manifest.json (incognito not_allowed)` |
| A development bearer token in local storage is honoured only in a Vite dev build. | read in the code | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts:360-425` |
| Build is Vite in two passes: main (background, side_panel, options, welcome) then content as an IIFE. | read in the code | `apps/extension/vite.config.ts:25-85`; `apps/extension/package.json scripts.build` |
| The side panel is vanilla DOM TypeScript, not React; side_panel.ts is about 16,800 lines and background.ts about 9,300. | read in the code | `wc -l apps/extension/src/side_panel.ts, background.ts` (not found) |
| Most-used shared packages: types (64 import sites), cloud-contracts (51), unified-chat (16), utils (14), client-runtime (14). | read in the code | `grep of apps/extension/src imports` (not found) |
| Conversations are mirrored to the account store only when every turn has Managed Cloud provenance; Chrome keeps its local copy authoritative. | stated requirement | `docs/architecture/overview.md:75`; `docs/product/suite.md:70-74`; `apps/extension/docs/threat-model.md` |
| Browser control needs a per-origin Chrome host-permission grant plus stored consent; the AGI account origins are refused for every browser-control capability. | read in the code | `apps/extension/src/features/computer-use/browserControlConsent.ts`; `apps/extension/src/features/computer-use/accountOrigins.ts`; `apps/extension/docs/threat-model.md` |
| Approval modes: Auto (default) stops for crucial actions, Ask first confirms every action, no mode completes a purchase; -yolo runs routine actions unattended on approved sites. | stated requirement | `apps/extension/docs/threat-model.md`; `apps/extension/README.md` |
| Web surface status marks chrome as Coming soon with CTA href /chrome-extension and a notify list. | read in the code | `apps/web/lib/surface-status.ts:12,69-73` |
| Release workflow triggers on tags v-ext-X.Y.Z, requires tag, package.json and manifest versions to match, and publishes only after protected-environment approval. | read in the code | `.github/workflows/release-chrome-extension.yml` |
| Whether the release workflow has ever run, or the extension is in the Chrome Web Store, is not established in the tree. | stated requirement | `docs/product/surface-feature-matrix.md:28`; `audit/live-check/chrome-assistant-parity-2026-11-03.md:6` |
| The first Chrome Web Store version must be uploaded manually in the Developer Dashboard; the API cannot create the item. | stated requirement | `docs/runbooks/chrome-web-store-publish.md:14` |
| Unattended Chrome Cloud runs that fail, time out, are partial or cancelled are reported as success (High, open). | stated requirement | `audit/registers/known-flaws.md:372 (EXT-UNATTENDED-FAILED-RUN-SUCCESS-01)`; `apps/extension/src/features/cloud-bridge/managedChatHandler.ts:480-502` |
| Production sign-in with the Chrome Web Store identity is unverified; only the signed-out bridge answered in Chromium on 2026-11-24. | stated requirement | `audit/registers/known-flaws.md:363` |
| The content script matches all http and https pages; on unapproved pages it injects no UI and only asks the worker whether the site is approved. | read in the code | `apps/extension/manifest.json`; `apps/extension/docs/threat-model.md`; `audit/registers/known-flaws.md:364` |
| The extension has a desktop bridge over native messaging with HMAC-SHA256 envelopes after a negotiated session secret; desktop-issued actions are still held to the extension's own approved-sites and consent bar. | read in the code | `apps/extension/src/features/native-bridge/desktopCommands.ts`; `apps/extension/docs/threat-model.md (Local Desktop bridge row)` |
| Features absent per the matrix: artifact library, research reports, study mode, image and video generation UI, camera, connectors, skills, plugins, apps, code sessions, Fast mode. | read in the code | `docs/product/surface-feature-matrix.md:199,279,289,309,319,339,359,369,379,409,419,269` |
| MCP is partial: webmcp.ts exposes page tools; no MCP server connection exists. | read in the code | `docs/product/surface-feature-matrix.md:389`; `apps/extension/src/webmcp.ts` |
| Unit tests are about 300 Vitest files in jsdom; a Chromium smoke test runs through e2e/smoke.mjs. | read in the code | `apps/extension/vitest.config.ts:15-21`; `apps/extension/__tests__`; `apps/extension/e2e/smoke.mjs` |
| Free-tier default model is derived through getDefaultModelFor from shared types, not a literal in the extension. | read in the code | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts (FREE_TRIAL_MODEL)` |
| Crash reporting is off by default, needs a consent toggle, and scrubs messages, file names and URLs before sending. | read in the code | `apps/extension/README.md`; `apps/extension/src/features/observability/errorReporting.ts` |
| The extension registers with the account device list through a heartbeat. | read in the code | `apps/extension/src/features/cloud-bridge/deviceHeartbeat.ts`; `audit/registers/known-flaws.md:50` |
| No tests, builds or app runs were performed for this page; test status is unknown from this session. | unknown | `read-only task` (not found) |

## Open questions

- Has the release workflow ever run, and is the extension published in the Chrome Web Store? Not in the tree.
- Does the side panel show plan or remaining quota? Matrix marks it unverified; free-plan notices exist, but a meter or plan label was not found.
- Are @agiworkforce/browser-tool and @agiworkforce/provider-runtime used? They are in package.json but no import was found in src.
- Which exact tests cover free versus subscribed behaviour in the extension? Not enumerated here.
- Product choice: should Chrome ever offer own-key or a Desktop-routed Local chat? Code and threat model say no; the product requirement set does not decide it.
- Product choice: narrow the content script match to approved origins (EXT-CONTENT-SCRIPT-ALL-SITES-01) versus keep the broad match.
- The public name: manifest says AGI Extension; whether it matches the product-names registry was not checked.
- Whether account sign-in is required before any chat (signed-out chat route) was not traced beyond the listing statement and the null-token path in getAuthToken.

## Project documents found out of date

- `docs/product/surface-feature-matrix.md (chrome, settings row, line 239)`: Says nothing under apps/extension/src imports or declares options.ts, so the settings page is unverified. The code says: options.ts is a Vite build entry and manifest options_page points to src/options.html. (apps/extension/vite.config.ts:75; apps/extension/manifest.json options_page)
- `docs/product/surface-feature-matrix.md (chrome, plan or quota row, line 249)`: Says nothing renders the plan. The code says: features/side-panel/freePlanNotices.ts branches on the free billing tier and freeTrialClient.ts handles plan tier and quota recovery; a plan label itself was not found, so the row is only partly stale. (apps/extension/src/features/side-panel/freePlanNotices.ts:193; freeTrialClient.ts:122-160)
- `apps/extension/docs/threat-model.md (capability table)`: Links `src/features/cloud-bridge/clerkAuth.ts` relative to docs/, which resolves to a wrong path (docs/src/...), a broken link rather than a wrong claim. The code says: The file is at apps/extension/src/features/cloud-bridge/clerkAuth.ts. (apps/extension/docs/threat-model.md cookies row; apps/extension/src/features/cloud-bridge/clerkAuth.ts)
- `apps/extension/README.md`: Title is the bare string 'agiworkforce' and does not use the product name. The code says: Manifest name is 'AGI Extension'; product names are owned by the registry. (apps/extension/README.md:1; apps/extension/manifest.json:3)
