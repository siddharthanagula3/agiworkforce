# AGI VS Code Extension — Volume 21 — API Specification

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/extension-vscode/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `docs/surfaces/vscode-extension.md`. Grounded in real repo paths: `apps/extension-vscode/package.json`, `apps/extension-vscode/src/utils/api.ts`, `apps/extension-vscode/src/integrations/providerStreamClient.ts`, `apps/extension-vscode/src/features/account-auth/deviceAuth.ts`, `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`, `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts`, `apps/extension-vscode/src/core/{chatSetup,providerSetup}.ts`, `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`, `packages/types/src/models.json`.

## Overview & stance

This volume specifies the four API planes the VS Code extension consumes or exposes: the **AGI gateway/subscription APIs** (Managed Cloud), the **provider APIs** used by BYOK, the extension's **own contributed surface** (commands, webviews, bridge protocol), and the **VS Code host APIs** it registers against (chat participant, Language Model, inline completion).

Three trust rules shape every boundary. First, the surface is workspace-scoped: no API call auto-syncs IDE context into Web/Mobile/Desktop app chat — Neon delta-sync is off here, and any handoff is explicit and redacted (`chatParticipant.ts` SYNC-RULE header; `packages/types` surface guard). Second, all three trust modes coexist (Local + BYOK + Managed) with visible labels; Local is never silently routed to BYOK or Cloud. Third, secrets stay in `SecretStorage` and localhost bridge frames are allowlisted and authenticated. Model IDs are read only from `packages/types/src/models.json`.

## AGI APIs — gateway/subscription

Two Managed-Cloud entry points exist today, both HTTP over the account bearer token.

- **LLM proxy (legacy).** `streamChatCompletion` / `chatCompletion` POST to `agiWorkforce.apiEndpoint`, default `https://agiworkforce.com/api/llm/v1` ✅ (`apps/extension-vscode/src/utils/api.ts`, `DEFAULT_ENDPOINT`; `package.json` config). SSE streaming is toggled by `agiWorkforce.streamingEnabled`.
- **Subscription verification.** `fetchTierInfo(secrets)` derives the origin from the endpoint and calls `GET /api/auth/me` ✅ (`apps/extension-vscode/src/utils/api.ts`). Plans are always server-resolved; `agi-workforce.showTierStatus` / `showAccountUsage` render them. There is no checkout inside the extension.
- **Device sign-in.** `POST /api/device/poll {device_id, device_fingerprint}` polls until `{status:'approved', access_token}`, then stores the Clerk token via `setAccountToken` ✅ (`apps/extension-vscode/src/features/account-auth/deviceAuth.ts`).
- **Provider-stream gateway.** `agiWorkforce.gatewayUrl` (default `https://api.agiworkforce.com`) fronts `POST /api/v1/providers/:id/stream`; selection is gated by `agiWorkforce.useProviderStream`, whose own description states web auth "is not wired in the VS Code extension yet" 🟡 (`package.json`, `apps/extension-vscode/src/utils/api.ts` `streamChatCompletionViaProvider`).

Requirements: the account token is sent only on Managed calls; tier/quota fields are authoritative only from the server (never fabricated); no credit top-ups. Endpoint/gateway overrides are in `capabilities.untrustedWorkspaces.restrictedConfigurations` and cannot be set by an untrusted workspace ✅ (`package.json`). Canon-pricing gap: `agiWorkforce.tier` still enumerates removed `hobby`/`pro_plus` — reconciliation to Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise is a separate tracked task 🟡.

## Provider APIs — BYOK

BYOK routes a user's own key directly at a provider through the gateway adapter, available on Desktop/CLI/VS Code only (never Web/Mobile).

- **Transport.** `streamFromProvider` issues `POST ${gatewayUrl}/api/v1/providers/${providerId}/stream` and consumes an SSE body 🟡 (`apps/extension-vscode/src/integrations/providerStreamClient.ts`). Adapters wired today cover `anthropic | openai | google | ollama`; the full account-gated path via `streamChatCompletionViaProvider` still throws "not available in the VS Code extension yet" 🔭 (`apps/extension-vscode/src/utils/api.ts`).
- **Provider selection.** `agiWorkforce.providerStreamProvider` enumerates `auto, anthropic, openai, google, ollama, ollama-cloud, xai, deepseek, perplexity, qwen, moonshot, zhipu, lmstudio, custom`; `auto` infers from the model-id prefix ✅ (`package.json`).
- **Keys.** Stored in `SecretStorage` via `setApiKey`/`getApiKey`/`clearApiKey` under `agiWorkforce.apiKey` ✅ (`apps/extension-vscode/src/utils/api.ts`, commands `agi-workforce.setApiKey`/`clearApiKey`). Per-provider labeled key vaulting is 🔭.
- **Models.** All model IDs come from `packages/types/src/models.json`; the client must not hardcode or invent an LLM ID. Any Local→BYOK transition is an explicit fork (context selection, secret scan, payload preview, consent, visible provider label) — never automatic.

## Extension APIs — commands/webviews

The manifest contributes **71 commands, 14 keybindings, 26 configuration properties, and 1 activity-bar container hosting 4 side-bar views** ✅ (`apps/extension-vscode/package.json`). Command IDs use the `agi-workforce.*` / `agi.*` namespace (e.g. `agi-workforce.chat`, `agentMode`, `selectModel`, `acceptCurrentDiff`, `createCheckpoint`, `memory.*`).

- **Webviews.** `agi-workforce.sidebar` is a `webview` view registered via `registerWebviewViewProvider` ✅ (`apps/extension-vscode/src/core/chatSetup.ts`, `SidebarProvider`); an editor-tab chat panel is provided by `chatEditorPanel.ts`. The webview↔extension message channel is `postMessage`-based; HTML is sanitized with DOMPurify (dependency in `package.json`). A typed, versioned webview message schema is 🔭.
- **Tree views.** `agi-workforce.conversations` (History), `contextPanel` (Context Files), and `memory` are `registerTreeDataProvider` trees ✅ (`chatSetup.ts`).
- **Desktop bridge protocol.** The extension speaks an authenticated localhost WebSocket to the desktop host at `ws://127.0.0.1:8787/ws`, port from `agiWorkforce.desktopBridge.port` ✅ (`apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts`). Auth is Bearer + `X-AGI-Bridge-Token` from `~/.agiworkforce/bridge-token` (0600, TOCTOU-safe read). Frames are strictly allowlisted: `ALLOWED_OUTBOUND_TYPES`, `ALLOWED_INBOUND_TYPES`, and `ALLOWED_BRIDGE_COMMANDS`, with a 50 ms debounce and 30 cmd/min rate limit; unknown types and unlisted command IDs are dropped ✅. Bridge args are never forwarded (injection defense). Migration to a Unix domain socket / named pipe is 🔭 (documented in the file header). Programmatic, cross-surface handoff to app chat stays explicit and redacted (never automatic).

## VS Code APIs — chat participant, LM/inline completion APIs

- **Chat participant.** Registered as `@agi` via `vscode.chat.createChatParticipant('agiworkforce.agi', handler)` ✅ (`apps/extension-vscode/src/features/chat-participant/chatParticipant.ts`; `contributes.chatParticipants` with `isSticky:true`, 6 slash commands `/explain /fix /refactor /tests /docs /model`, and disambiguation categories). The handler gathers editor context, builds a system prompt, and writes tokens to the `ChatResponseStream`.
- **Language Model API fallback.** When the AGI API is unavailable and `agiWorkforce.fallbackToVscodeLm` is on, the participant calls `vscode.lm.selectChatModels(...)` and `model.sendRequest(...)` ✅ (`chatParticipant.ts`). This is a fallback, not the default path.
- **Inline completion.** `vscode.languages.registerInlineCompletionItemProvider` supplies ghost-text, gated by `agiWorkforce.inlineCompletions.enabled` with `debounceMs`/`maxLength` tuning and a bounded LRU cache; sensitive/secret-named files are refused ✅ (`apps/extension-vscode/src/core/providerSetup.ts`, `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts`).
- **Language-feature providers.** Hover (`agiWorkforce.hoverEnabled`), CodeLens (`agiWorkforce.codeLensEnabled`), diff-decoration CodeLens, and a code-action provider are registered against `'*'` ✅ (`providerSetup.ts`).
- **LM Tools.** Registering AGI tools through the VS Code `lm` tool API (`lm.registerTool`) is 🔭 — not present in source; MCP tool integration exists only behind `agiWorkforce.mcp.enabled` (default false).

## Repository map

- `apps/extension-vscode/package.json` — commands, keybindings, views, config, chat participant, untrusted-workspace restrictions.
- `apps/extension-vscode/src/utils/api.ts` — gateway/subscription calls, SecretStorage helpers, tier fetch.
- `apps/extension-vscode/src/integrations/providerStreamClient.ts` — BYOK provider-stream transport.
- `apps/extension-vscode/src/features/account-auth/deviceAuth.ts` — device sign-in.
- `apps/extension-vscode/src/features/chat-participant/chatParticipant.ts` — `@agi` participant + `vscode.lm` fallback.
- `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts` — inline completion API.
- `apps/extension-vscode/src/core/{chatSetup,providerSetup}.ts` — participant, webview, tree, hover, code-lens registration.
- `apps/extension-vscode/src/features/desktop-bridge/desktopBridge.ts` — localhost bridge protocol + token.
- `packages/types/src/models.json` — model catalog SSOT.

## Competitor notes

Claude Code and Codex IDE extensions expose a first-party chat/edit/agent API bound to a single vendor account and cloud; provider and model are effectively fixed. AGI diverges deliberately: **multi-provider** APIs sourced from `models.json`, **BYOK where the trust boundary allows** (Desktop/CLI/VS Code), **per-surface trust** with visible labels, and **local-first** backends so the same command surface works with no account. Where competitors assume "signed in = cloud," AGI keeps Local and BYOK as free access modes; the gateway APIs are one path among three, and the bridge keeps compute on the host rather than moving IDE data to the cloud.

## Acceptance / Definition of Done

Production-ready when every documented API has a stable contract, a visible trust label, allowlist/auth enforcement, and no plaintext secret leakage — and unbuilt paths (provider-stream, LM tools, socket transport) are labeled 🔭, not implied shipped.

- [ ] **Build:** `pnpm --filter agi-workforce typecheck` and `pnpm --filter agi-workforce test` pass; api, chatParticipant, inlineCompletion, and bridge-allowlist tests green.
- [ ] **Trust:** Managed calls send the account token only; BYOK routes the user key; Local never auto-routed; no IDE context synced to app chat; active mode always labeled.
- [ ] **Security:** tokens/keys in `SecretStorage`; endpoint/gateway overrides blocked in untrusted workspaces; bridge frames auth'd + allowlisted + rate-limited; bridge args never forwarded.

## Anti-patterns

- Inventing routes, gateway paths, env vars, or command IDs not in `package.json`/source.
- Claiming provider-stream, LM tool registration, or the socket transport as shipped without a wired path.
- Hardcoding or inventing model IDs instead of reading `packages/types/src/models.json`.
- Storing tokens/keys anywhere but `SecretStorage`; logging secrets; forwarding bridge-supplied args.
- Silently routing Local to BYOK/Cloud, or auto-syncing IDE context into Web/Mobile/Desktop app chat.
- Referencing removed tiers (`Plus`, `pro_plus`, `Hobby`) or inventing INR for Pro/Max; adding credit top-ups.
- Referencing Supabase, or renaming `proxy.ts` to `middleware.ts` on the web side.
