# How the AGI Workforce codebase fits together

Written for a new engineer and for a QA tester. All paths are relative to the project root `~/Desktop/agiworkforce`. Nothing was built, run or edited to write this page. Citations use `(path)` or `(path:line)`. A line number appears only where the file was opened and the number was visible.

When a document and the code disagree, this page says so and trusts the code. The rank order is in (AGENTS.md:§2). The disagreements found are collected at the end of section 7.

---

## 1. The product in five lines

1. AGI Workforce is one AI product on six apps: Web, Desktop, Mobile, CLI (the command-line app), VS Code extension and Chrome extension (ARCHITECTURE.md:29-41).
2. There are three separate ways of running a chat. Local means a model on your own device and nothing leaves it. Own key (also called BYOK, "bring your own key") means your own provider account, reached directly. Cloud (also called Managed Cloud) means AGI hosts the model access, and it is the only metered path (docs/architecture/trust-boundaries.md:10-20, :64).
3. Not every app offers all three. Web and Chrome are Cloud only. Mobile has Local and Cloud, with no own key. Desktop chat is Cloud only. CLI and VS Code have all three (docs/architecture/trust-boundaries.md:34-41).
4. The user chooses the model, or leaves it on Auto, where routing code picks one (docs/architecture/provider-routing.md:52-58). A named model is never swapped for another by routing (docs/architecture/provider-routing.md:97-98, README.md).
5. One account, one plan and one usage allowance cover the suite. The server owns all quota, credit and plan numbers, and the apps only display them (ARCHITECTURE.md:164-169).

---

## 2. The apps

Terms used here:
- **Monorepo**: one repository holding many apps and libraries.
- **pnpm workspace**: the tool that links the TypeScript packages together.
- **Cargo workspace**: the same idea for Rust.
- **Turborepo**: the task runner that builds the packages in order.

Two workspaces share the repository. The pnpm and Turborepo one covers `apps/*`, `packages/*/*`, `packages/ai/providers/*`, `services/*` and `infrastructure/*` (pnpm-workspace.yaml:1-6). The Cargo one covers `apps/desktop/src-tauri`, `apps/desktop/gpui`, `apps/cli` and `crates/*` (Cargo.toml:2-7).

### Web
- **Folder:** `apps/web`.
- **Built with:** Next.js 16 with the App Router (a file-based routing system) and React 19 (apps/web/package.json; ARCHITECTURE.md:36). The Web UI features live in `apps/web/features` (docs/architecture/overview.md:22).
- **How it starts:** `next dev` for development and `next start` for production (apps/web/package.json scripts).
- **Server code:** the server routes sit in `apps/web/app/api`. The routing middleware is `apps/web/proxy.ts`, which exports `proxy` (AGENTS.md:§5; apps/web/proxy.ts:316). Next.js 16 renamed the old `middleware.ts`, so do not restore that name.
- **Shares:** chat UI (`packages/ui/unified-chat`), types, cloud contracts, routing and provider packages, data layer, identity and key-value packages (apps/web/package.json).

### Desktop
- **Folder:** `apps/desktop`. It builds two programs, and mixing them up is called the most expensive mistake in the tree (ARCHITECTURE.md:43-46).
- **The public Desktop app is Electron.** The host is Node code in `apps/desktop/electron`, and it shows the hosted web app in its window (ARCHITECTURE.md:48-54; apps/desktop/README.md).
  - The window loads `https://agiworkforce.com` by default (apps/desktop/electron/config.ts:17).
  - A packaged build ignores the `AGI_CLOUD_APP_ORIGIN` variable. Only an unpackaged run, or an explicit `--agi-cloud-app-origin=` argument, can point the window at another allowed origin (apps/desktop/electron/config.ts:58-75).
  - Because it shows the hosted web app, a change to `apps/desktop/src` never reaches the Electron window (ARCHITECTURE.md:53-54).
  - Device features cross one bridge, `window.agiHost` (apps/desktop/electron/preload.ts). Its contract is `apps/desktop/src/lib/tauri-electron/bridgeContract.ts`.
  - Privileged calls go through `apps/desktop/electron/runtime/dispatcher.ts`. That file checks a permission grant (`permissionManager.ts`) and contains file paths (`pathGuard.ts`) (ARCHITECTURE.md:82-88).
  - Chat on Desktop is Cloud only. The dispatcher refuses local-inference commands (apps/desktop/electron/runtime/dispatcher.ts:3367). Local coding sessions run the bundled CLI (docs/architecture/desktop.md:112-117).
- **The older retained code is Tauri.** It is a Rust host in `apps/desktop/src-tauri` that loads a Vite and React renderer from `apps/desktop/src`. It is kept for internal value and compatibility, and it is not a second public product (docs/architecture/desktop.md:7-10; docs/architecture/overview.md:24-26).
  - Its React code reaches Rust only through registered Tauri commands. `apps/desktop/check-wiring.sh` fails drift in both directions (ARCHITECTURE.md:79-81).
- **Also present:** `apps/desktop/gpui`, an opt-in native migration host built with GPUI that talks to the CLI over typed process input and output (ARCHITECTURE.md:56-59). Its own docs say it is not a replacement release yet (docs/architecture/desktop.md:30-33).
- **How it starts:**
  - Electron: `pnpm --filter @agiworkforce/desktop dev:electron`, which builds the Node host and runs `electron .`. The package `main` is `electron/dist/bootstrap.cjs` (apps/desktop/package.json).
  - Tauri: `tauri dev` (apps/desktop/package.json `dev`).
- **Shares:** Rust crates by path dependency (apps/desktop/src-tauri/Cargo.toml:32-39) and shared TypeScript packages (section 3).

### Mobile
- **Folder:** `apps/mobile`.
- **Built with:** Expo (a React Native toolkit) and React Native 0.86. Screens are routed by Expo Router from `apps/mobile/app` (apps/mobile/README.md; apps/mobile/package.json). Features live in `apps/mobile/src/features` (docs/architecture/overview.md:23).
- **How it starts:** `expo start`, `expo run:ios` and `expo run:android` (apps/mobile/package.json).
- **Native projects:** apps/mobile/ios (not found) and apps/mobile/android (not found) are generated by prebuild and gitignored. Native changes go through config plugins in `apps/mobile/native` (apps/mobile/README.md).
- **Modes:** Local and Cloud only (docs/architecture/trust-boundaries.md:45).
- **Shares:** `packages/platform/local-llm` for on-device models, plus unified-chat, cloud contracts, sync and others (apps/mobile/package.json:66 and manifests).

### CLI
- **Folder:** `apps/cli`, a Rust program (ARCHITECTURE.md:39).
- **Binaries:** `agi` is the main one, with `agiworkforce` as an alias (apps/cli/Cargo.toml:15-21).
- **How it starts:** running `agi` opens a terminal interface (apps/cli/README.md). `agi login` signs in to an AGI account with a device code. Logging in with a provider name stores your own key (apps/cli/README.md).
- **Also hosts the developer session server.** The CLI runs `agi app-server`, which the VS Code extension and Desktop code sessions use (repo-map.json surfaces; apps/extension-vscode/README.md).
- **Shares:** only Rust crates (apps/cli/Cargo.toml:40-50), not TypeScript packages.

### VS Code extension
- **Folder:** `apps/extension-vscode`. The package name is `agi-workforce` (apps/extension-vscode/package.json).
- **Built with:** TypeScript and esbuild. The entry point is `./out/extension.js`, from `src/extension.ts` (apps/extension-vscode/package.json:83; esbuild.js).
- **How it starts:** VS Code loads it and it starts a local `agi app-server`, but only in a trusted workspace (apps/extension-vscode/README.md).
- **Shares:** `packages/client/ide-runtime`, client-runtime, sync, unified-chat and others (manifests). It reads the CLI binary on the user's machine. It never talks to a model itself for Local or own-key use.

### Chrome extension
- **Folder:** `apps/extension`.
- **Built with:** Manifest V3 (MV3, Chrome's current extension format) and Vite. The background is a service worker, the panel is `src/side_panel.html`, and the permissions include `sidePanel`, `storage`, `nativeMessaging` and `scripting` (apps/extension/manifest.json).
- **How it starts:** `vite build` (and `vite build --watch` for development), then load the folder in Chrome (apps/extension/package.json).
- **Mode:** Cloud only. Its local `chrome.storage.local` copy stays authoritative, and eligible all-Cloud chats are mirrored to the shared account history (docs/architecture/trust-boundaries.md:58).
- **Shares:** cloud contracts, sync, unified-chat, provider-runtime and others (manifests).

---

## 3. Shared packages, services, crates and infrastructure

"Used by" for packages comes from each `package.json` dependency list. Where `docs/agent-context/repo-map.json` lists different consumers, the manifest wins (repo-map.json is rank 4 and the manifest is rank 1, AGENTS.md:§2). The per-provider folders are grouped into one row, because provider vendor names are withheld on this page.

### packages/ai

| Folder | What it is for | Used by |
|---|---|---|
| `packages/ai/agent-core` | Turn-loop orchestration (its manifest names the desktop and CLI harnesses) | web, mobile, Chrome, VS Code, provider-runtime |
| `packages/ai/model-registry` | Canonical model and harness catalog. It compiles `catalog/` into `models.json` and a Rust mirror | desktop, routing, types |
| `packages/ai/provider-protocol` | Turns every provider's requests and replies into one wire shape | web, Chrome, all provider adapters |
| `packages/ai/provider-runtime` | One streaming client with retry, failover and watchdog | web, mobile, Chrome, provider adapters |
| `packages/ai/providers/*` (18 folders, one per provider, plus `factory`) | One adapter per provider behind the protocol. `packages/ai/providers/factory` builds them with caller-owned credentials | web (factory and adapters, apps/web/package.json:46-49, :179-181); the desktop manifest also references a providers package, not traced |
| `packages/ai/routing` | Picks a model and route (pure library, no I/O) | all five apps, unified-chat |
| `packages/ai/search` | Reports which web-search harnesses are wired. It runs no search | web, mobile, routing, unified-chat |

### packages/client

| Folder | What it is for | Used by |
|---|---|---|
| `packages/client/client-runtime` | Detects the runtime, dispatches commands, holds shared state and the offline queue | all five apps, desktop-command-client, unified-chat |
| `packages/client/desktop-command-client` | Typed transport from the desktop renderer to the Rust host | desktop |
| `packages/client/ide-runtime` | IDE-neutral code session shapes (selection, diff, diagnostics) | desktop, VS Code |
| `packages/client/sync` | Validates and applies Cloud changes on a device | web, desktop, mobile, Chrome, VS Code |

### packages/contracts

A "contract" here is a shared schema that every app obeys.

| Folder | What it is for | Used by |
|---|---|---|
| `packages/contracts/cloud-contracts` | Wire schemas, endpoint paths and stream deltas for Cloud | all five apps, client-runtime, sync, artifacts, utils, upload-scanner |
| `packages/contracts/compliance` | Provider disclosure and jurisdiction policy for legal pages | web, mobile, Chrome |
| `packages/contracts/context` | Taxonomy of every kind of context a turn can carry | web, mobile, context-engine |
| `packages/contracts/licensing` | Signed enterprise license verification | nothing declares it yet |
| `packages/contracts/local-runtime` | Typed contract for privileged desktop runtimes (no I/O) | desktop, VS Code, web, client-runtime, utils |
| `packages/contracts/trust-boundaries` | Classifies which hosts are AGI Cloud hosts | desktop, mobile |
| `packages/contracts/types` | Cross-surface types, the generated model catalog and generated Rust bindings | all apps and most packages |

### packages/guardian, platform, tools and ui

| Folder | What it is for | Used by |
|---|---|---|
| `packages/guardian/core` | Findings pipeline: policy, dedupe, ranking | guardian/github |
| `packages/guardian/github` | GitHub check-run surface for those findings | a CI workflow (repo-map.json) |
| `packages/platform/artifacts` | Artifact derivation, client store, publish and merge | all five apps, sync, unified-chat |
| `packages/platform/context-engine` | The one engine every context source passes through, with permission checks and budgets | web |
| `packages/platform/data-layer` | Database boundary with Neon and plain Postgres adapters | web |
| `packages/platform/files` | One file identity, version chain and lineage graph | no manifest declares it (repo-map.json lists none) |
| `packages/platform/identity` | Sign-in port with a Clerk adapter | web |
| `packages/platform/key-value` | Cache, rate-limit and lock store (Upstash, local Redis or none) | web |
| `packages/platform/local-llm` | On-device model loading and inference for Local mode | mobile |
| `packages/platform/object-storage` | Bucket file storage behind an S3-compatible port | web |
| `packages/platform/observability` | Error reporting with scrubbing | desktop, web, Chrome, VS Code |
| `packages/platform/utils` | Pure helpers plus pairing and signaling contracts | all five apps, ide-runtime, guardian-core, unified-chat |
| `packages/tools/apply-patch` | Bounded file patching | desktop, web |
| `packages/tools/browser-tool` | Browser and computer-use actions (repo-map.json calls it unwired) | Chrome (manifest) |
| `packages/tools/mcp` | MCP client transport (MCP is a standard for connecting tools to models) | desktop, web |
| `packages/tools/skills` | Parses and integrity-checks skill metadata, and backs `skills-lock.json` | desktop, web |
| `packages/ui/design-tokens` | The only sanctioned source of color, spacing and type values | all apps, unified-chat |
| `packages/ui/i18n` | Locale catalogues and message lookup | desktop, VS Code, mobile, web |
| `packages/ui/icons` | Hand-made icon family | web, ui |
| `packages/ui/ui` | Shared presentation pieces with no business logic | desktop, web, unified-chat |
| `packages/ui/unified-chat` | Surface-neutral chat UI, stores and hooks | desktop, web, Chrome, VS Code, mobile |

(Descriptions: each package's `package.json`. Consumers: the same manifests. Extra detail: docs/agent-context/repo-map.json.)

### services and infrastructure

| Folder | What it is for | Used by |
|---|---|---|
| `services/signaling-server` | Pairing and an authenticated WebSocket relay that forwards signed messages between two paired devices (docs/architecture/remote-control.md) | desktop host, VS Code host, mobile companion, web pairing route |
| `services/upload-scanner` | Self-hosted malware scanner that answers the web's upload scan hook | web |
| `infrastructure/sandbox` | One static HTML page at a separate origin that renders generated artifacts in isolation | web; the Chrome extension too (apps/extension/README.md) |

### crates (Rust)

| Folder | What it is for | Used by (Cargo path dependencies) |
|---|---|---|
| `crates/agiworkforce-agent-core` | Agent turn loop, budget and tool scheduling | CLI, Tauri |
| `crates/agiworkforce-app-server` | The JSON-RPC and WebSocket developer session server hosted by the CLI | CLI, GPUI host |
| `crates/agiworkforce-command-registry` | Slash-command contracts | CLI |
| `crates/agiworkforce-execpolicy` | Rules for which commands may run | CLI, Tauri, protocol |
| `crates/agiworkforce-licensing` | Offline signed license check | nothing yet (ARCHITECTURE.md:117-118) |
| `crates/agiworkforce-llm` | Request building, stream decoding and error classes for own-key and local models | CLI, Tauri, agent-core |
| `crates/agiworkforce-mcp` | Local and remote MCP, OAuth | CLI, Tauri |
| `crates/agiworkforce-model-registry` | Generated model data for Rust | CLI, Tauri |
| `crates/agiworkforce-protocol` | Developer-session types, the Rust contract crate | CLI, Tauri, GPUI, app-server, mcp |
| `crates/agiworkforce-sandbox-policy` | Local sandbox policy | CLI, Tauri |
| `crates/agiworkforce-utils-absolute-path` | File path validation | execpolicy, protocol |
| `crates/agiworkforce-utils-image` | Image decode and transform | CLI, protocol |
| `crates/agiworkforce-worktree` | Git worktree handling | CLI, Tauri, GPUI |

(Cargo path dependencies: apps/cli/Cargo.toml:40-50, apps/desktop/src-tauri/Cargo.toml:32-39, apps/desktop/gpui/Cargo.toml:20-44. Purposes: docs/agent-context/repo-map.json.)

---

## 4. What happens when a person sends a chat message

### Cloud mode, step by step

1. **The screen.**
   - On web, the chat hook `apps/web/lib/hooks/useChatStream.ts` sends the request (:4572, :5020). The endpoint comes from `chatCompletionEndpoint` (apps/web/features/chat/lib/free-quota-selection.ts:40-46). The normal endpoint is `/api/llm/v1/chat/completions`. Free-quota and promotional models use two other endpoints.
   - Desktop (Electron) is the same web page inside a window (ARCHITECTURE.md:53).
   - Mobile calls the same path with `guardedFetch` (apps/mobile/services/streaming.ts:32, :402).
   - The same route is also reachable as `/v1/chat/completions` on the API host (apps/web/lib/api-host-route-contract.ts:3-4).
2. **The edge.** `apps/web/proxy.ts` runs first for session routes (apps/web/proxy.ts:316-345).
3. **The route.** The handler is `apps/web/app/api/llm/v1/chat/completions/route.ts`. It wraps the work in CORS, rate-limit headers and error handling (route.ts, end of file).
4. **Admission** (route.ts:1475-1480 and `runAuthGate`, apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:139).
   - It checks sign-in, rate limit, CSRF and the subscription.
   - Its imports show further gates: terms acceptance, the 18-and-over decision, multi-factor, and the IP allow list.
5. **A turn slot** limits how many managed turns run at once (lib/turn-slot.ts:109; route.ts:1485-1486).
6. **Workspace policy and spend caps** are checked before any credit is reserved (route.ts, comments near :426-461).
7. **Request processing** (lib/request-processor.ts).
   - It validates the body and resolves the model, using `@agiworkforce/routing` and the workspace model policy.
   - It reserves usage up front with an idempotency key and an estimated cost (`reserveManagedUsageRequest`, request-processor.ts:6148).
8. **Dispatch.**
   - The route builds a managed agent stream (route.ts:1208; lib/managed-agent-stream.ts).
   - It starts the provider stream through an adapter (lib/adapter-factory.ts:132).
   - Adapters sit on the shared streaming client and wire format (ARCHITECTURE.md:180-190).
   - A failover plan can rotate to another route before the first byte (route.ts:75; lib/managed-failover.ts).
9. **Back to the screen.** The answer streams as server-sent events (SSE, a one-way text stream), with heartbeats (lib/sse-heartbeat.ts). Tool approvals and resumes use sibling routes `approve`, `resume-input` and `runs` (the route folder listing).
10. **Storing and settling.**
    - The assistant text is written by `persistAssistantTurn` into table `web_messages` (lib/assistant-turn-persistence.ts:56, :262).
    - It is skipped for temporary chats, or when the request had no assistant message id (assistant-turn-persistence.ts:256-259, :287).
    - Conversations are rows in `web_conversations` (apps/web/app/api/chat/conversations/route.ts:272).
    - Message writes also come through `apps/web/app/api/chat/conversations/[id]/messages/route.ts:156`, using `message-thread.ts:34`, and through `apps/web/app/api/chat/sync/route.ts:272, :647`.
    - A failed turn refunds its reservation (route.ts:195). Cost is finalized onto the usage ledger (docs/architecture/execution-plan-contract.md).
    - The database is Neon Postgres through `packages/platform/data-layer`. Each request uses a user-scoped handle that sets a row-level-security role (`set local role app_rls`) (apps/web/lib/server/claimed-user-scope-db.ts:21-30).
11. **Other devices.** Web, Mobile and Desktop share this Cloud store (docs/architecture/trust-boundaries.md:36-38). Device-side apply is `packages/client/sync`.

### Local mode (short)
- On the phone, a model on the device answers. Loading and generating live in `packages/platform/local-llm`, called from `apps/mobile/src/features/model-picker/localModelRuntime.ts`. Chats are stored in the on-device database `apps/mobile/storage/db.ts`.
- In Local mode the phone's `guardedFetch` refuses nearly every request to an AGI Cloud host. Only account controls, withdrawal controls and a user-sent content report pass (docs/architecture/trust-boundaries.md:47; apps/mobile/lib/egressGuard.ts).
- In the CLI, `apps/cli/src/local_models.rs` probes model servers on the user's own machine (loopback addresses, lines 6-7).

### Own key (short)
- Only the CLI, and VS Code through the CLI, offer it. Requests go straight to the user's provider and never through AGI Cloud, with a visible provider label (docs/architecture/trust-boundaries.md:12, :63).
- The CLI stores keys in the operating system keychain (apps/cli/src/auth.rs:111). The request engine is `crates/agiworkforce-llm`.
- A Local to own-key move is an explicit fork with a preview and consent, never silent (docs/architecture/trust-boundaries.md:66; docs/architecture/overview.md:96).

---

## 5. Accounts, plans and usage

- **Sign-in on the web.** Clerk (a hosted sign-in service) is wrapped by `packages/platform/identity`, a port with a Clerk adapter. In the web app, `apps/web/proxy.ts` and `apps/web/lib/api-auth.ts` (`getClerkAuthUser`) resolve the user.
- **Sign-in on other apps.**
  - Mobile uses `@clerk/expo` (apps/mobile/package.json).
  - Chrome uses `@clerk/chrome-extension` (apps/extension/package.json).
  - The CLI uses a device-code login in the browser (apps/cli/README.md; web side `apps/web/lib/server/device-codes.ts`).
- **Terms and age.** `apps/web/lib/server/terms.ts` and `apps/web/lib/server/adult-eligibility.ts`.
- **Plans.**
  - Plan ids, display labels and prices are in `packages/contracts/types/src/billing-catalog.ts`. The internal id `pro` is labelled Premium, and `max_15x` is labelled Ultra (billing-catalog.ts, plan entries).
  - Which plans are on sale is `billing-plan-catalog.ts` (catalog version 4, line 14).
- **Allowances.**
  - Per-plan 5-hour, weekly and monthly credits are `MANAGED_USAGE_LIMITS` (packages/contracts/types/src/managed-usage-limits.ts:31).
  - One credit is $0.005 of provider cost (docs/architecture/credits.md:7). Credit math is `credits.ts`, top-up packs are `billing-topups.ts`, and action costs are `rate-card.ts` (docs/architecture/credits.md:80-93).
  - `apps/web/lib/server/managed-usage-policy.ts` turns plan credits into ledger budgets.
- **Billing and usage routes.**
  - Checkout: `apps/web/app/api/checkout/route.ts`.
  - Payment webhook: `apps/web/app/api/stripe-webhook/route.ts`.
  - Top-ups, invoices and refunds: `apps/web/app/api/billing/*`.
  - Meters: `apps/web/app/api/usage/*`.
  - The client's view of plan and flags: `apps/web/app/api/me/route.ts`.
- **Server services.** Subscription logic is in `apps/web/lib/services/subscription-service.ts` and `effective-subscription-service.ts`. The Free plan is in `free-trial-service.ts`, `apps/web/lib/services/free-lane/` and `apps/web/config/free-pools.json`. Billing helpers are in `apps/web/lib/billing/`.
- **Mobile sells nothing.** It has `nativePurchases: false` in `apps/mobile/src/features/billing/storePurchases.json` (docs/architecture/trust-boundaries.md:18).
- **Feature flags.** One store and one evaluator serve every surface. The evaluator is `apps/web/lib/feature-flags`, and the write path is `/api/admin/feature-flags` (docs/architecture/overview.md:263-280).

---

## 6. Where data is kept

| Place | What is kept | Source |
|---|---|---|
| Neon Postgres (web backend) | Accounts, conversations (`web_conversations`), messages (`web_messages`), usage ledger and more | apps/web/lib/server/claimed-user-scope-db.ts; packages/platform/data-layer |
| `apps/web/db/neon` | The canonical migration folder, an append-only checksummed chain. Files are numbered up to `0425_adult_eligibility.sql`, with `down/` and `verify/` subfolders. Apply with `pnpm db:migrate`, and production needs `--confirm-production` | AGENTS.md:§5; package.json:206 |
| Object storage | Uploaded and generated files in an S3-compatible bucket, scanned by `services/upload-scanner` before large chat files are sealed | packages/platform/object-storage; docs/architecture/overview.md:151-228 |
| Key-value store | Rate limits, locks and caches. Provider is Upstash, a local Redis, or none, chosen in `packages/platform/key-value/src/factory.ts`; a circuit breaker wraps it | docs/architecture/cache-rules.md:19-35 |
| Server caches and client caches | Listed with isolation and expiry rules | docs/architecture/cache-rules.md:37-50, :56-70 |
| Derived data | Computed copies, never authoritative | docs/architecture/derived-state.md |
| Retention and deletion | Every store, what erases it and how long it lives. The table is generated from code | docs/architecture/RETENTION_MATRIX.md; apps/web/lib/services/deletion-manifest.ts |
| Phone | Encrypted on-device SQLite database `agi_mobile.db`, key held in secure storage; also MMKV (fast key-value store) helpers | apps/mobile/storage/db.ts; apps/mobile/README.md |
| Chrome | `chrome.storage.local`: conversations (capped, 4 MiB total), site allowlist, memories, settings | apps/extension/docs/threat-model.md:501 |
| Desktop (Electron) | A user-data folder named "AGI Cloud" and shell settings | apps/desktop/electron/userDataLocation.ts; settingsStore.ts |
| CLI | `~/.agiworkforce`, holding `auth.json`, `secrets/`, `config.toml`, `conversations/` and more | apps/cli/README.md |
| VS Code | The developer credential sits in VS Code `SecretStorage` | apps/extension-vscode/docs/CONTRIBUTING-NOTES.md:75 |

Cloud conversations and developer sessions are two separate domains. Moving data between them is an explicit handoff and never a background sync (ARCHITECTURE.md:171-178).

---

## 7. The rules the code enforces, and where

| Rule | What it means | Enforced by |
|---|---|---|
| Local, own key and Cloud never cross silently | Local content never reaches AGI Cloud. Own-key calls go direct. Cloud is the only metered path. | `check:trust-boundaries` (package.json:383), `check:rust-egress-boundary` (:187), per-surface `trust-boundary.test.ts`, mobile `apps/mobile/lib/egressGuard.ts`, desktop `apps/desktop/src/lib/egressGuard.ts`, web `apps/web/lib/egress-policy.ts` (AGENTS.md:§6) |
| Model catalog is generated | Edit `packages/ai/model-registry/catalog/models.curation.json`, then run `pnpm sync:models`. Never hand-edit `packages/contracts/types/src/models.json`. A model-id literal in code fails lint | `sync:models:check` (package.json:387), `check:model-id-literals` (:219), `check:model-catalog` (:361), `scripts/check-no-hardcoded-models.sh` for Rust (AGENTS.md:§4) |
| Live model generation is data | Defaults point at a `family:<provider>/<family>` slot owned by `catalog/model-families.json` | AGENTS.md:§4 |
| Protocol types flow Rust to TypeScript | `crates/agiworkforce-protocol` exports bindings into `packages/contracts/types/src/generated/protocol` | `pnpm generate:protocol-types` (package.json:420), `check:protocol-types` (:421) |
| Package boundaries | An import may not reach past a package's published entry | `check:boundaries` (package.json:168) |
| Tauri commands match the React code | Both directions are checked | `apps/desktop/check-wiring.sh`, `apps/desktop/wiring-allowlist.json` |
| Migrations are append-only | Never edit an applied migration; add the next numbered file | `check:neon-migrations` (package.json:201) |
| Database isolation | Row-level security and per-user scope | `check:db-isolation` (:422), `check:rls-boundary` (:423) |
| No hardcoded values | Endpoints, fixture arrays and design values are modelled elsewhere | `check:hardcoded-endpoints` (:218), `check:hardcoded-arrays` (:217), `check:css-tokens` (:424) |
| Secrets | None committed | `check:secrets` (:432) |
| Mocks match real exports | A `vi.mock()` factory may not omit a real export | `check:mock-exports` (:372) |
| Lockfiles never hand-edited | A hook blocks writes to `pnpm-lock.yaml` and `Cargo.lock` | `.claude/hooks/block-lock-files.sh` (CLAUDE.md) |
| Skills pinned | Any edit to a vendored skill fails until the lock is regenerated | `skills-lock.json`, `node scripts/verify-skills-lock.mjs --regenerate` (CLAUDE.md) |

**The guard chain.** `pnpm check:llm-operability` (package.json:397) runs every guard through `scripts/run-guard-chain.mjs` and lists each failure at the end (AGENTS.md:§12).
- The pre-push hook calls it directly only when `AGI_PREPUSH_ON_TREE=1`. Otherwise it runs `scripts/prepush-clean-worktree.sh` (.husky/pre-push).
- Most guards read the working tree. Stage first, then run, then commit (AGENTS.md:§12).

**Where the documents and the code disagree** (the code wins in each case):
- `Cargo.toml:4` includes `apps/desktop/gpui` in the Cargo workspace, but ARCHITECTURE.md:16 and AGENTS.md:§5 list only `src-tauri`, `cli` and `crates`.
- README.md says public Desktop reports no local-MCP capability. The code reports it when the bundled CLI serves MCP (apps/desktop/electron/runtime/dispatcher.ts:2299), which matches docs/architecture/desktop.md:108-111.
- `repo-map.json` lists an "API gateway" under services, but `services/` holds only `signaling-server` and `upload-scanner`.
- `repo-map.json` consumer lists differ from the manifests. Examples are `agent-core`, `ui/i18n`, `browser-tool`, `unified-chat` and `client/sync`. This page uses the manifests.
- `repo-map.json` says `signaling-server` is used by mobile and `src-tauri`. docs/architecture/remote-control.md names the Electron host, the VS Code host, the mobile companion and the web pairing route.

---

## 8. How to build, run and check each app

The commands come from `docs/agent-context/commands.json` (last updated 2026-11-09). The surface sections are lines 89-169 and the repo-wide section is lines 4-88. Where that file is silent, the source is named.

**Owner's testing rule for this work: test on localhost, one surface at a time.** This comes from the request that triggered this page, not from a repo file. The repo adds that heavy jobs (builds, full suites, `tsc`, cargo, dev servers) run one at a time through `scripts/dev/heavy-job.sh` (CLAUDE.md, "Delegation"). I did not open that script.

### Repo-wide (commands.json:4-88)
- Install: `pnpm install`.
- Lint: `pnpm lint`.
- Typecheck every package: `pnpm typecheck:all`. Plain `pnpm typecheck` covers only desktop (AGENTS.md:§12).
- Tests: `pnpm test`, `pnpm test:affected`, `pnpm test:l1`, `pnpm test:security`, `pnpm test:coverage`.
- One package: `pnpm --filter <workspace-package> test <file-or-pattern>`.
- Rust: `cargo check --workspace`, `cargo fmt --all -- --check`, and `cargo clippy --workspace --lib -- -D warnings -D unsafe-code`.
- Seed local test accounts: `pnpm dev:accounts seed`.
- The whole guard chain: `pnpm check:llm-operability`.

### Web (commands.json:125-135)
- Dev: `pnpm --filter @agiworkforce/web dev`.
- Typecheck: `pnpm --filter @agiworkforce/web typecheck`. It needs `NODE_OPTIONS=--max-old-space-size=8192` or it crashes (AGENTS.md:§12).
- Unit tests: `pnpm --filter @agiworkforce/web test`. Web uses its own Vitest version, so run it through the package script (AGENTS.md:§12).
- Browser tests: `pnpm --filter @agiworkforce/web test:e2e`.
- Build: `pnpm --filter @agiworkforce/web build`.
- Localhost: the dev server is `http://localhost:3000`.
  - `pnpm dev:accounts seed` makes one account per plan plus lane accounts (docs/development/local-test-accounts.md).
  - Sign in at `http://localhost:3000/login` with the listed `+clerk_test` address and the code `424242` (same file).
  - The seeding command refuses any non-local database, a preview or production runtime, or a production Clerk key (same file).

### Desktop (commands.json:90-123)
- The inventory's `dev` and `build` entries point at the retained Tauri shell: `pnpm dev:desktop` (commands.json:91) runs `turbo run dev --filter=@agiworkforce/desktop` (package.json:414), and that package's `dev` is `tauri dev`.
- The Electron commands, which are the public Desktop, are not in commands.json. They are in apps/desktop/README.md and apps/desktop/package.json:
  - Dev shell: `pnpm --filter @agiworkforce/desktop dev:electron`.
  - Installer: `pnpm --filter @agiworkforce/desktop dist:electron`.
  - Build the Node host only: `build:electron`.
- Tests: `pnpm --filter @agiworkforce/desktop test`. Typecheck: `pnpm --filter @agiworkforce/desktop typecheck`. Rust tests: `cargo test -p agiworkforce-desktop --lib`. Browser-driver tests: `test:e2e`.
- Native GPUI host: `dev:gpui`, `build:gpui`, `check:gpui`, `test:gpui` (commands.json:100-123).
- Localhost: for an unpackaged Electron run, set `AGI_CLOUD_APP_ORIGIN` to an allowed localhost origin. A packaged build ignores the variable, but `--agi-cloud-app-origin=` is honoured (apps/desktop/electron/config.ts:58-75).

### Mobile (commands.json:136-141)
- Dev server: `pnpm --filter @agiworkforce/mobile dev`.
- Typecheck: `pnpm --filter @agiworkforce/mobile typecheck`.
- Tests: `pnpm --filter @agiworkforce/mobile test`. It runs script tests, then Jest in shards (apps/mobile/README.md; apps/mobile/package.json).
- Run on a device or simulator: `ios` and `android` (apps/mobile/README.md).
- commands.json has no build entry for mobile.
- Localhost: `EXPO_PUBLIC_API_URL` sets the server the phone talks to (apps/mobile/lib/constants.ts:1). The default is the production host.

### CLI (commands.json:142-149)
- Check: `cargo check -p agiworkforce-cli`.
- Tests: `cargo test -p agiworkforce-cli --lib`.
- Build: `cargo build --release -p agiworkforce-cli`.
- Notices: `node apps/cli/scripts/generate-third-party-notices.mjs` (add `--check` to verify).
- commands.json has no run entry. The README shows `cargo install --path apps/cli --bin agi` (apps/cli/README.md).
- Localhost: not established (see the last section).

### Chrome extension (commands.json:150-161)
- Lint: `pnpm lint:extension`. Typecheck, test and build: `pnpm --filter @agiworkforce/extension <typecheck|test|build>`.
- Package: `package`, then `verify:package`.
- Browser smoke test: `test:e2e`.
- Localhost: auth stays at `http://localhost:3000`. Set `VITE_ARTIFACT_SANDBOX_ORIGIN=http://127.0.0.1:3002` in `.env.local` and rebuild. Start the isolated renderer with `node infrastructure/sandbox/dev.mjs --extension-id <id> --port 3002` (apps/extension/README.md).

### VS Code extension (commands.json:162-169)
- Typecheck, test and build: `pnpm --filter agi-workforce <typecheck|test|build>`.
- Also `test:integration` and `test:webview`.
- Localhost: the setting `agiWorkforce.apiEndpoint` holds the API base URL (apps/extension-vscode/package.json:56-58, :1214-1217). It cannot be overridden by an untrusted workspace.

---

## 9. Where to look first

| If you need to change... | Start in |
|---|---|
| How a Cloud chat turn is admitted and run | `apps/web/app/api/llm/v1/chat/completions/route.ts`, then `lib/request-processor.ts` |
| Which model or route Auto picks | `packages/ai/routing`, `apps/web/lib/server/managed-cloud-routing` |
| The list of models, or a model's details | `packages/ai/model-registry/catalog/models.curation.json`, then `pnpm sync:models` |
| Which model generation is live | `packages/ai/model-registry/catalog/model-families.json` (AGENTS.md:§4) |
| A provider adapter or the wire format | `packages/ai/providers/factory`, `packages/ai/provider-protocol`, `packages/ai/provider-runtime` |
| Retry or failover on a model call | `packages/ai/provider-runtime`, `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts` |
| The web chat screen | `apps/web/features/chat`, `apps/web/lib/hooks/useChatStream.ts`, `packages/ui/unified-chat` |
| The phone chat screen and streaming | `apps/mobile/src/features/chat`, `apps/mobile/services/streaming.ts` |
| Saved conversations and cross-device sync | `apps/web/app/api/chat/conversations`, `apps/web/app/api/chat/sync/route.ts`, `packages/client/sync`, `packages/contracts/types/src/sync/object-semantics.ts` |
| A plan name, price or sellability | `packages/contracts/types/src/billing-catalog.ts`, `billing-plan-catalog.ts` |
| Credit allowances and credit math | `packages/contracts/types/src/managed-usage-limits.ts`, `credits.ts`, `docs/architecture/credits.md` |
| Checkout, top-ups, payment events | `apps/web/app/api/checkout`, `apps/web/app/api/billing/top-up`, `apps/web/app/api/stripe-webhook/route.ts` |
| Usage meters and limits | `apps/web/app/api/usage`, `apps/web/lib/server/managed-usage-policy.ts` |
| Free plan behaviour | `apps/web/lib/services/free-trial-service.ts`, `apps/web/lib/services/free-lane`, `apps/web/config/free-pools.json` |
| Web sign-in and session | `apps/web/proxy.ts`, `apps/web/lib/api-auth.ts`, `packages/platform/identity` |
| Terms or age check | `apps/web/lib/server/terms.ts`, `apps/web/lib/server/adult-eligibility.ts` |
| A database table or column | Add the next numbered file in `apps/web/db/neon`, then `pnpm db:migrate` (never edit an applied one) |
| File uploads and malware scanning | `apps/web/app/api/files`, `apps/web/lib/server/chat-file-intake`, `services/upload-scanner` |
| Artifacts and their preview | `packages/platform/artifacts`, `infrastructure/sandbox`, `apps/web/app/api/artifacts` |
| Connectors and MCP on the hosted side | `apps/web/features/connectors`, `apps/web/app/api/connectors`, `packages/tools/mcp` |
| Local MCP in the CLI or Tauri | `crates/agiworkforce-mcp`, `apps/cli/src/mcp` |
| Memory | `apps/web/features/memory`, `apps/web/app/api/memory` |
| Projects | `apps/web/features/projects`, `apps/web/app/api/projects` |
| Scheduled tasks | `apps/web/features/schedules`, `apps/web/app/api/schedules` |
| The Desktop window, menus, tray, updates | `apps/desktop/electron/main.ts`, `tray.ts`, `desktopAutoUpdate.ts` |
| What the Desktop may do on the device | `apps/desktop/electron/runtime/dispatcher.ts`, `permissionManager.ts`, `pathGuard.ts`, `apps/desktop/electron/preload.ts` |
| Desktop dictation | `apps/desktop/electron/voiceDictation.ts`, `dictationBar.ts` |
| Phone controlling a desktop coding session | `docs/architecture/remote-control.md` (it lists every file), `apps/web/app/api/pair/initiate/route.ts`, `services/signaling-server` |
| CLI commands and terminal screen | `apps/cli/src/main.rs`, `cli_options.rs`, `interactive.rs` |
| What the CLI may run | `crates/agiworkforce-execpolicy`, `crates/agiworkforce-sandbox-policy` |
| VS Code extension behaviour | `apps/extension-vscode/src/extension.ts`, `apps/extension-vscode/src/features` |
| Chrome extension behaviour | `apps/extension/manifest.json`, `apps/extension/src/background.ts`, `side_panel.ts`, `apps/extension/docs/threat-model.md` |
| Developer-session types shared by Rust and TypeScript | `crates/agiworkforce-protocol`, then `pnpm generate:protocol-types` |
| On-device models on the phone | `packages/platform/local-llm`, `apps/mobile/src/features/model-picker` |
| What a mode may send to AGI Cloud | `apps/mobile/lib/egressGuard.ts`, `apps/desktop/src/lib/egressGuard.ts`, `apps/web/lib/egress-policy.ts`, `packages/contracts/trust-boundaries` |
| A feature flag | `apps/web/lib/feature-flags`, `/api/admin/feature-flags` (docs/architecture/overview.md:263-280) |
| The admin console | `apps/web/app/admin`, `apps/web/app/api/admin` |
| Public API and API keys | `apps/web/app/api/llm/v1`, `apps/web/app/api/developers`, `apps/web/lib/developer-api` |
| Colors, spacing, fonts | `packages/ui/design-tokens` (guarded by `check:css-tokens`) |
| Translations | `packages/ui/i18n` |
| Skills shipped to customers | `.agents/skills`, `packages/tools/skills`, `skills-lock.json` |
| Account deletion and data export | `apps/web/lib/server/account-erasure.ts`, `data-export-archive.ts`, `docs/architecture/RETENTION_MATRIX.md` |
| Caches and the key-value store | `packages/platform/key-value`, `docs/architecture/cache-rules.md` |
| Error reporting | `packages/platform/observability` |
| Who may edit which paths | `docs/agent-context/lanes.json` |

---

## Not established

- **Which request saves the user's message first on web.** I traced the assistant write and the message route (`messages/route.ts:156`, `message-thread.ts:34`). I did not trace when the web client calls it relative to the streaming POST.
- **The inside of the model call.** I did not open `packages/ai/provider-runtime` or the adapters, so the retry, failover and watchdog behaviour is taken from package descriptions and the route.
- **Provider adapter folder names.** There are 18 folders under `packages/ai/providers`. Their names are vendor names and are withheld here by rule.
- **How the CLI is pointed at a localhost server.** I found no setting or environment variable for it in the files I read.
- **Desktop provider dependency.** The desktop manifest references a providers package, but I did not check which one or whether it is imported.
- **The `models:families` root script.** AGENTS.md names it. I verified only the registry package script `families` (packages/ai/model-registry/package.json).
- **Documents only skimmed.**
  - `docs/architecture/code-knowledge-graph.md` (7,746 lines, a dated snapshot) was read only at the top.
  - `docs/architecture/render-layer.md`, `execution-plan-contract.md`, `byok-provider-strategy.md` and `release-architecture.md` were read only in part.
  - I did not read all of `desktop.md`, `desktop-local-runtime.md` or `cache-rules.md` §3.
- **Not opened.** The internals of most packages, `scripts/`, `tools/`, `.github/workflows`, `scripts/dev/heavy-job.sh`, and the Tauri command code.
- **Files cited only through documents.** `apps/mobile/__tests__/trust-boundary.test.ts`, `deletion-manifest.ts` and `.claude/hooks/*`.
- **The current deploy path.** docs/architecture/release-architecture.md says deploy workflows are disabled and production web is deployed by hand. I did not check the workflows.
- **Mobile build and lint commands.** `commands.json` has no mobile build entry and no CLI run entry. The mobile README lists `lint`, `ios:device:dev` and Detox commands that `commands.json` omits.
