# 2. Shared Package & Crate Architecture (the SSOT map)

Status: Current
Owner: Platform lead
Last updated: 2026-07-10

This is the "single source of truth" map: what each shared TypeScript package and Rust crate **owns**, its **exports**, and **who consumes it**. The standing constraint (shared-packages decision log §5) is: *no separate per-surface or per-mode implementations of shared concerns — structure around shared packages.* Everything below was read from `package.json` / `Cargo.toml` / source at the branch tip.

Conventions: every TS package is `private`, version `0.0.1`, internal deps are `workspace:*`. Unless a subpath map is listed, `exports` is the single entry `./src/index.ts`.

## 2.1 TypeScript packages (`packages/`)

### Provider / LLM layer

**`packages/providers/` — vendor adapters (no top-level package; a container of 14 leaf packages).**
Leaves: `@agiworkforce/providers-{anthropic, openai, google, groq, mistral, moonshot, zhipu, qwen, openrouter, deepseek, xai, perplexity, ollama, lmstudio}`. Each implements the `ProviderAdapter` contract from `@agiworkforce/types`, translating `ChatRequest` ↔ vendor wire and vendor stream events → canonical `StreamChunk`. Every leaf depends on `llm-normalize`, `llm-runtime`, `types`. `anthropic` uses `@anthropic-ai/sdk`; `openai` + all OpenAI-compatible leaves use the `openai` SDK; `google` and `ollama` have no vendor SDK. The 10 OpenAI-compatible leaves additionally depend on `@agiworkforce/providers-openai` to reuse its base adapter.
**Consumed by:** the web v1 route (`ADAPTER_PROVIDERS`), the api-gateway proxy, unified-chat runtime. This is the *one* provider layer (restructure P2).

**`packages/llm-runtime` — `@agiworkforce/llm-runtime`.** Cross-provider runtime infra: the retry generator with sticky `RetryContext`, stream idle watchdog, session-stable headers, error classifier, gateway fingerprinting, fallback-chain resolution, message-history repair. Wrapped by every provider adapter's `stream()`. Exports one `streamFromProvider` SSE client (replaced four near-duplicates). Deps: `types`.

**`packages/llm-normalize` — `@agiworkforce/llm-normalize`.** Pure (no IO/SDK) per-vendor/per-endpoint request-build quirks: OpenAI Responses payload policy, reasoning-effort mapping, `cache_control`, the `openai-wire-compat` normalizer. Deps: none.

**`packages/routing` — `@agiworkforce/routing`.** Pure, zero-side-effect auto-routing heuristics: local task classifier, 5-turn sticky context pivot, token estimation, Indic-script detector, deprecation/promo guards, effective input/output pricing. Named exports only. Deps: `types`.

**`packages/local-llm` — `@agiworkforce/local-llm`.** On-device inference tier selector (Tier 1 Apple/Gemini Nano, Tier 2 executorch, Tier 3 llama.rn), capability detection, multimodal artifact resolution, shippable-model registry. This is a **separate catalog** from `models.json` by design (RAM gates, artifact URLs, licenses — a different trust axis). Peer dep `react-native`. Deps: `types`.

### Data / contracts / persistence

**`packages/types` — `@agiworkforce/types`.** Canonical shared types for the whole platform (context, Tauri commands/events, errors, tool-events, agent-status, auth, the `ProviderAdapter` contract, suite-contracts, enterprise). Exports map: `"."` → index, `"./models.json"` → the model catalog data, `"./protocol"` → `./src/generated/protocol/index.ts` (ts-rs-generated). Deps: none. **The most-depended-on package.**

**`packages/services` — `@agiworkforce/services`.** Shared cross-surface business-logic services. Its index re-exports internal directory modules — notably **`cloud-contracts/`** (`me.ts`, `sync.ts`, `org-policy.ts` — canonical per-endpoint Zod wire schemas + offline verifier) and **`sync-apply/`** (the pure delta apply + bigint-cursor engine that mirrors the Rust apply). Also artifacts, artifact-derivation, artifact-sync, model-switch-cache. Exports: single `"."` (cloud-contracts / sync-apply are directory modules re-exported through index, **not** package.json export subpaths). Deps: `licensing`, `types`, `zod`.

**`packages/data-layer` — `@agiworkforce/data-layer`.** The cloud-provider-portable persistence/auth/storage/realtime boundary (Neon Postgres + Clerk auth) via adapter interfaces + a factory (`src/factory.ts`, `src/adapters/`). Non-Neon adapters are fail-closed stubs. Optional peer deps `@clerk/backend`, `@neondatabase/serverless`. This is the web/gateway RLS boundary — conversation persistence itself stays per-surface (see area 5). Deps: `types`.

**`packages/apply-patch` — `@agiworkforce/apply-patch`.** Parser + applicator for the `apply_patch` text format over a pluggable `FSBridge` (disk / Tauri / S3 / sandbox). Consumed by web, desktop, api-gateway. (The dead Rust twin was deleted in P0; this TS package is the live one.)

### Runtime / UI / stores

**`packages/runtime` — `@agiworkforce/runtime`.** Runtime-env detection (Tauri / cloud-web / test), capability-aware command dispatch, event-bus abstraction, HTTP cloud routing. Exports map: `"."`, `"./node"`, `"./state"`, `"./queue"`, `"./offline-queue"`, `"./offline-sync"`. The node-only `agentContext` (AsyncLocalStorage) is isolated to `/node`. Optional peer `@tauri-apps/api`. Deps: `types`.

**`packages/ui` — `@agiworkforce/ui`.** Cross-surface **pure presentation** UI: shadcn/Radix primitives + `cn`, provider marks, tool icons. Strict boundary — no store/IO/Next; only pure presentation + plain config data. Ext deps: Radix suite, `@tanstack/react-table`, `cva`, `clsx`, `cmdk`, `tailwind-merge`, `sonner`, `vaul`. Peer `react`, `lucide-react`, `next-themes`. Consumed by web + desktop (+ extension/vscode themes via tokens).

**`packages/design-tokens` — `@agiworkforce/design-tokens`.** Canonical design token source: `agiPalette` (light/dark), radii, typography, shadows, and per-surface CSS-var maps (`agiChatCssVars`, `agiNativeColors`, `agiExtensionCssVars`, `agiVsCodeCssVars`). Exports: `"."` + `"./chat.css"`. Deps: none. See area 8.

**`packages/unified-chat` — `@agiworkforce/unified-chat`.** The shared chat experience: chat/model Zustand stores, host-bridge/runtime/capabilities libs, prompt classifier + routing decision, cloud chat-persistence client, sandboxed-artifact HTML, markdown rendering (`react-markdown` + rehype/remark + `katex`). Deps: `design-tokens`, `runtime`, `types`, `ui`, `utils`; peer `react`/`react-dom`/Radix/`framer-motion`. Consumed by web (~31 files) and desktop (~25 files) — both still keep parallel chat trees on top of it; the job is adoption + deletion (restructure P3).

**`packages/stores` — `@agiworkforce/stores`.** Shared platform-agnostic Zustand stores (currently the artifact store) with all IO injected via adapters. Deps: `api`, `runtime`, `types`, `unified-chat`; ext `zustand`, `immer`. Consumed by desktop/web/mobile. See area 6.

**`packages/api` — `@agiworkforce/api`.** Typed TS wrappers for all Tauri commands (1,062+), one module per Rust command domain (settings, auth, chat, mcp, memory, database, …). Deps: `runtime`, `types`. Desktop-facing. See area 7.

### Tools / capability packages

**`packages/mcp` — `@agiworkforce/mcp`.** Thin MCP **client** wrapper over `@modelcontextprotocol/sdk`: connect over stdio/SSE/streamable-http, discover tools, build catalog, route calls. Consumed by desktop/web/mobile/gateway. (The Rust MCP core is a separate crate — see 2.2.)

**`packages/browser-tool` — `@agiworkforce/browser-tool`.** Agent-controlled headless browser tool (one discriminated-union schema, 10 actions) on isolated named profiles; `evaluate` gated off by default. Ext `playwright-core`. Deps: `types`.

**`packages/skills` — `@agiworkforce/skills`.** Skill loader: parses markdown+YAML-frontmatter skill files, resolves layer precedence (extra > workspace > project > personal > managed-local > bundled), formats as a system-prompt block. Pure, Node fs. Deps: none.

**`packages/utils` — `@agiworkforce/utils`.** Shared pure utilities. Exports map: `"."`, `"./async"`, `"./format"`, `"./privacy-handoff"`, `"./reasoning"`, `"./signaling"`, `"./uuidv7"` (time-ordered cross-device IDs), `"./voice"`. Includes the secret-redacting logger facade. Deps: `types`.

### Compliance / licensing / misc

**`packages/compliance` — `@agiworkforce/compliance`** (PROPRIETARY). EU AI Act Article 50 transparency (first-run AI disclosure + machine-readable provenance markers), an LLM HTTP-client gate, and a Chinese-HQ-provider default-off registry. Deps: `types`.

**`packages/licensing` — `@agiworkforce/licensing`.** Pure offline-verifiable enterprise license primitives (claims schema, signed-container format, `verifyLicense`) — no IO, never throws. Exports `"."` + `"./test-support"`. Ext `@noble/curves`, `zod`. Mirrored byte-for-byte by the Rust `agiworkforce-licensing` crate.

**`packages/react-native-worklets` — `@agiworkforce/react-native-worklets-stub`** (PROPRIETARY). A stub (empty Babel plugin) so jest-expo tests run without the native worklets module. Exports `"."` + `"./plugin"` (JS, not `src/`).

> Note on billing: there is **no** `packages/billing` package. Billing/usage/credit logic lives in `services/api-gateway` (`credits`, `usage` routes + provider-cost ledger), the v1 route's credit reserve/settle (area 3), and enterprise types in `packages/types/src/enterprise`. Tier/pricing math is a tracked residual duplication to consolidate (parity matrix), not yet a package.

## 2.2 Rust crates (`crates/`)

`apps/cli/Cargo.toml` declares 9 crate path-deps (the CLI is the first consumer). Five crates are the "shared contract" crates the **desktop is meant to adopt** — the CLI has adopted them; desktop adoption of several is live-gated (`docs/plans/rust-engine-extraction-2026-07-09.md`, stages c2/c3/c4/d2/e2).

| Crate | Owns | Consumer status |
| ----- | ---- | --------------- |
| `agiworkforce-agent-core` | **Turn-loop engine** — model-stream driving, sequential + parallel read-only tool-call scheduling, runaway/iteration/budget guards, turn-event emission; hosts implement `TurnHost`. Extracted from CLI `agent/chat.rs::Session::send`. | CLI ✓; desktop adoption gated (e2) |
| `agiworkforce-llm` | **LLM provider engine** — per-dialect request serialization, SSE/NDJSON stream decoding, tool-call delta assembly, provider error/paywall classification. Extracted from CLI `models/`. Byte-identical JSONL vs old CLI. | CLI ✓; desktop gated (c2–c4) |
| `agiworkforce-mcp` | **MCP client engine** — JSON-RPC framing/correlation/timeouts, stdio/SSE/Streamable-HTTP transports, RFC 9728/8414/7591 OAuth; UI/persistence injected by host. | CLI ✓; desktop gated (d2) |
| `agiworkforce-execpolicy` | **Exec policy** — prefix-based Starlark rules producing command `Decision`s. Desktop adopted it via a 338-evaluation same-or-stricter parity corpus. | CLI ✓; desktop ✓ |
| `agiworkforce-protocol` | **Wire/protocol types** (approvals, items, mcp, config_types, exec_output, message_history…). Depends on **ts-rs v11** to emit TS bindings → `@agiworkforce/types/protocol` (216 types, `pnpm check:protocol-types` drift guard). | CLI ✓; the TS↔Rust seam |
| `agiworkforce-app-server` | JSON-RPC stdio + WebSocket **transport** exposing the tool catalog + `tools/call`; dispatch injected via `ToolDispatch`. | CLI ✓ |
| `agiworkforce-command-registry` | **Slash-command registry** contracts (`CommandKind`, `CommandSource`, `RegistryCommand`) + built-in catalog. | CLI ✓ |
| `agiworkforce-sandbox-policy` | Shared **sandbox policy** model (`SandboxPolicy` enum) across surfaces. | CLI + desktop |
| `agiworkforce-utils-image` | Image loading/encoding for prompts (`EncodedImage`, `PromptImageMode`). | CLI ✓ |

Non-CLI-direct crates (transitive / other surfaces): `agiworkforce-licensing` (Rust half of offline enterprise licensing, byte-for-byte re-impl of the TS package), `agiworkforce-network-proxy` (proxy config/env, host normalization, `NetworkPolicyDecider`), `agiworkforce-async-utils`, and the utility crates `agiworkforce-utils-{absolute-path, cache, home-dir, rustls-provider, string, template}`.

## 2.3 Services (`services/`)

**`services/api-gateway` — `@agiworkforce/api-gateway`.** Express/tsx TS gateway; the mobile-companion/desktop cloud backend. 17 route modules (`chat`, `cloudChat`, `llm`, `models`, `providerStream`, `agents`, `credits`, `usage`, `enterprise`, `pair`, `deviceAuth`, `desktop`, `dotfile`, `mobile`, `sync`, `auth`), a middleware stack (`auth`, `rateLimit`, `planGate`, `managedComputeGate`, `requestValidation`, `errorHandler`), a WebSocket layer, and an MCP client. It **proxies to LLM providers** via the full `@agiworkforce/providers-*` set + `llm-normalize` + `llm-runtime`. RLS is enforced via `@agiworkforce/data-layer` (`src/lib/neonClients.ts` builds a pooled RLS-capable client, applicationName `agi-gateway-rls`).

**`services/signaling-server` — `@agiworkforce/signaling-server`.** WebRTC signaling/pairing relay backing pairing/companion/collaboration/remote-control flows; hardened with Zod validation, per-IP limits, session expiry, admin API-key auth, `SIGNALING_INTERNAL_SECRET` on `POST /pairings`.

**`services/skill-vetting` — `skillspector`** (Python, not a Node package). Security scanner for AI agent skills: scans git repos/URLs/zips/local dirs for vulnerabilities + malicious patterns via static checks + optional LLM semantic analysis; emits risk-scored terminal/JSON/Markdown reports.

## 2.4 Reading the map as an engineer

- **Adding provider behavior?** It goes behind a `packages/providers/*` leaf, never in an app. The web route and gateway both pick it up.
- **Adding a wire field crossing surfaces?** Add to `packages/services` `cloud-contracts` Zod schema (area 5); web contract tests enforce it.
- **Adding a chat UI concern?** It belongs in `unified-chat` (logic/renderers) + `ui` (primitives) + `design-tokens` (colors), not a per-surface fork.
- **Adding Rust engine behavior?** It belongs in the shared crate (agent-core/llm/mcp/execpolicy), verified against fixtures, then adopted by CLI and desktop — not duplicated per binary.

Residual duplication still being retired (tracked, not aspirational): per-surface chat shells on top of `unified-chat`, ~8 web-divergent `ui` primitive forks, settings sections, connector catalog, billing tier math. See the parity matrix and `docs/plans/monorepo-restructure-2026-07-08.md`.
