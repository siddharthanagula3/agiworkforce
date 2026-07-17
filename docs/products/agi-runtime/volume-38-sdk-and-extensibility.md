# AGI Runtime — Volume 38 — SDK & Extensibility

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root); the nearest surface `AGENTS.md` files (`apps/cli/AGENTS.md`, `apps/desktop/AGENTS.md`, `services/AGENTS.md`); `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); and the real repo paths this volume grounds in — `crates/agiworkforce-app-server/src/lib.rs`, `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs`, `crates/agiworkforce-command-registry/src/lib.rs`, `packages/client/client-runtime/src/{http,events,registry}.ts`, `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `apps/desktop/src-tauri/src/bin/native_messaging_host.rs`, `services/signaling-server/src/index.ts`, `services/api-gateway/src/routes/{mobile,pair}.ts`.

## Overview & stance

This volume specifies the toolkits by which third parties — and AGI's own surfaces — build **against**, **into**, and **on top of** the Runtime: a public SDK, a plugin authoring SDK, a native-tool SDK, and an extension SDK for new client interfaces. These are adapter/UI-edge dependencies, not the Runtime architecture itself, so almost everything here is **🔭 Planned** by design. What exists today are the internal contracts the SDKs would wrap — a Rust tool-dispatch trait, a plugin manifest schema, a TS runtime package, and the paired transports — not published, versioned, externally supported products.

Trust modes bind every SDK. An SDK is an attack surface for trust-boundary bypass, so the non-negotiable rule is that **no SDK may do what the surface itself may not**: no SDK path exposes **BYOK** on Web or Mobile (BYOK is Desktop/CLI/VS Code only); none silently promotes a **Local** chat, file, or session to BYOK or **Managed Cloud** — that crossing is always the explicit Local→BYOK fork (context selection, secret scan, payload preview, visible provider label, consent). Remote-attach SDKs build **windows**, not a fourth trust mode: compute stays on the host, connections are outbound-only, QR + HMAC paired, and approval-gated. Model IDs come only from `packages/contracts/types/src/models.json`; an SDK that hardcodes one is wrong. Building against the Runtime carries no plan gate — the Free / Basic ($8 · ₹399) / Pro ($20) / Max ($100 and $200) / Enterprise ladder meters managed-cloud usage, not authorship.

## Public SDK — build against the Runtime

**🟡 Partial (internal) / 🔭 Planned (public product)** — the de-facto SDK today is the internal `packages/client/client-runtime` package: a command registry (`packages/client/client-runtime/src/registry.ts`), `http.ts` `routeToCloud` with `X-AGI-Runtime` / `X-AGI-Command` headers, an event helper (`packages/client/client-runtime/src/events.ts`), and offline-queue/sync primitives. It is TS-only, shared across surfaces, and **unversioned as a public product**. The Rust `ToolDispatch` trait is the internal embedding SDK for hosts (see below). **✅ Built** for both as internal contracts (`packages/client/client-runtime/src/http.ts`, `crates/agiworkforce-app-server/src/lib.rs`).

Requirements for the public SDK (all 🔭): semver'd and multi-language; **capability discovery** (which engines/tools a host exposes) rather than assumed availability; authentication via Clerk-issued tokens; per-plan **quota surfacing** against the ladder above; strict refusal to expose BYOK on Web/Mobile clients; and model IDs read from `models.json`, never embedded. It must expose no endpoint that moves Local data off-host without the explicit fork.

## Plugin SDK — develop runtime plugins

**✅ Built (authoring contract) / 🔭 Planned (authoring toolkit)** — the plugin **manifest schema** and discovery are real: `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` defines `PluginManifest` (commands, agents, skills, hooks, `mcpServers`, dependencies) and `load_manifest_for` probing five formats in priority order — `.agiworkforce-plugin/plugin.json` (preferred), `.claude-plugin/` and `.codex-plugin/` (Claude Code / Codex interop), and legacy `.app.json` / `.mcp.json`. Unknown keys land in `extra` via serde-flatten, so foreign-format manifests load without error. That schema **is** the author-facing contract, and full lifecycle/install/isolation live in Volume 25.

Requirements for the authoring toolkit (🔭): a scaffold/validate/package/publish flow (e.g. planned subcommands under the existing `agi plugin` namespace, `crates/agiworkforce-command-registry/src/lib.rs`) that lints a manifest against `PluginManifest`, emits the required SHA-256 integrity claim consumed at install, and prints the `[agi]`/`[claude]`/`[codex]` format tag. A plugin SDK must never generate a manifest whose declared MCP server or hook auto-runs — declaration is not execution consent — and it must never author a Local→BYOK/Cloud crossing that skips the fork.

## Tool SDK — create native tools

**✅ Built (internal trait) / 🔭 Planned (public tool SDK)** — native tools plug in through the `ToolDispatch` trait (`crates/agiworkforce-app-server/src/lib.rs`): `list_tools()` returns MCP-style `{name, description, inputSchema}` entries and `call_tool(name, args)` returns `{content, isError}`. Dispatch is injected (the CLI supplies `CliToolDispatch`), so the transport never depends on tool implementations. **✅ Built.** Slash-command-style tools register through `RegistryCommand::builtin_slash` / `prompt` in `crates/agiworkforce-command-registry/src/lib.rs`. **✅ Built.**

Requirements for the public native-tool SDK (🔭): every tool declares a typed `inputSchema` and validates arguments before dispatch (unvalidated tool inputs are a taxonomy violation per `AGENTS.md`); every tool executes under the Permission Engine (Volume 21) with consent before first run; every tool declares its **trust reach** (local filesystem, network, provider) and honors the surface boundary — a tool that would reach a BYOK provider or the cloud gateway triggers the explicit fork, and no tool is reachable in a mode the surface forbids. Tools must not embed model IDs; provider selection flows through the Model Router (Volume 14).

## Extension SDK — build new client interfaces

**✅ Built (transports) / 🔭 Planned (client SDK)** — a "new client interface" attaches to the Runtime over its existing paired transports. Real anchors: the Desktop `127.0.0.1` realtime host already accepts the Chrome extension, the VS Code extension, and the Tauri webview, hardened with `MAX_CONNECTIONS = 32`, an IP lockout after repeated auth failures, a 4 MiB max frame, and constant-time token checks (`apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`); the native-messaging host `com.agiworkforce.browser` bridges Chrome (`apps/desktop/src-tauri/src/bin/native_messaging_host.rs`); and the signaling relay pairs roles `desktop|mobile` with QR codes, per-role HMAC pair tokens, and a strict control-verb allowlist (`services/signaling-server/src/index.ts`, `services/api-gateway/src/routes/{mobile,pair}.ts`). **✅ Built** as transports.

Requirements for the client SDK (🔭): a documented, versioned protocol with pairing helpers and capability negotiation so a third party can build a new window (a new editor integration, a kiosk, a phone client) without re-deriving the wire format. Any such client must be a **remote window** — compute stays on the host, connection outbound-only, paired, approval-gated — never a fourth trust mode, and a Web/Mobile-class client must never gain BYOK. Cross-device **data** sync stays the separate Neon delta-sync path (Managed-Cloud chats only), never a side effect of attaching a client.

## Repository map

- `packages/client/client-runtime/src/{http,events,registry}.ts` — internal TS runtime SDK primitives (`routeToCloud`, event helper, command registry).
- `crates/agiworkforce-app-server/src/lib.rs` — `ToolDispatch` trait (native-tool injection), JSON-RPC/MCP + WS host.
- `crates/agiworkforce-plugin-runtime (REMOVED 2026-07-08, zero dependents — no replacement crate exists yet; treat as an unbuilt gap, not a live path)/src/lib.rs` — `PluginManifest` schema, five-format discovery (plugin authoring contract).
- `crates/agiworkforce-command-registry/src/lib.rs` — `RegistryCommand` slash/tool registration, `agi plugin` namespace.
- `apps/desktop/src-tauri/src/integrations/realtime/websocket_server.rs`, `.../bin/native_messaging_host.rs` — client-attach transports (WS host, native messaging).
- `services/signaling-server/src/index.ts`, `services/api-gateway/src/routes/{mobile,pair}.ts` — pairing/relay + device endpoints for new clients.

## Competitor notes

Claude Code ships an Agent SDK and a plugin/MCP ecosystem; Codex exposes a CLI/SDK and remote connections; ChatGPT has plugins and an Apps SDK. All assume a single-vendor trust context and route connectors through the vendor cloud. AGI diverges deliberately: the SDKs are **multi-provider**, encode **per-surface trust** in the wire contract (Web/Mobile can never reach BYOK), stay **local-first** (the tool trait, plugin discovery, and client transports need no cloud round-trip), and **interoperate** by loading `.claude-plugin` and `.codex-plugin` manifests directly so authors migrate without a rewrite. Remote-attach SDKs mirror Claude Code Remote Control and Codex remote connections — a QR-paired window over a host that keeps running locally — rather than a hosted-session default.

## Acceptance / Definition of Done

Production-ready when each SDK is versioned, documented, and provably unable to cross a trust boundary the surface forbids.

- [ ] **Build:** `cargo test -p agiworkforce-app-server` and `-p agiworkforce-plugin-runtime` (crate REMOVED 2026-07-08, zero dependents — this check is stale until a replacement crate exists) green; `packages/client/client-runtime` builds; a sample native tool round-trips through `tools/list`/`tools/call`; a sample plugin loads via `load_manifest_for`; a sample client attaches to the `127.0.0.1` host.
- [ ] **Trust:** no SDK exposes BYOK on Web/Mobile; no SDK path promotes Local→BYOK/Cloud without the explicit fork; every remote-attach client is a window (compute on host); model IDs read only from `packages/contracts/types/src/models.json`.
- [ ] **Security:** every tool declares and validates a typed `inputSchema`; tools/plugins run under the Permission Engine with consent before first execution; client transports keep auth (Bearer/IPC/pair token, constant-time), origin allowlist, connection caps, lockouts, and frame limits; the SHA-256 plugin integrity gate holds.

## Anti-patterns

- Claiming a public, versioned SDK, plugin authoring toolkit, native-tool SDK, or client SDK exists today — they are 🔭; only the internal trait, manifest schema, TS package, and transports are real. Do not invent a monolithic runtime daemon behind them.
- Any SDK that exposes BYOK on Web/Mobile, auto-runs a declared MCP server or hook, or moves Local data off-host without the explicit fork; treating a remote-attach client as a fourth trust mode.
- Hardcoding or inventing model IDs, routes, env vars, or command names; shipping a tool with an unvalidated `inputSchema`.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby"), inventing INR prices for Pro/Max, or adding credit top-ups.
- Referencing Supabase, or renaming Next.js `proxy.ts` back to `middleware.ts`.
