# AGI Canonical Glossary

Status: Current
Owner: Platform lead
Last updated: 2026-06-25
Last verified against implementation: 2026-06-25
Audience: Every human and AI agent; the authoritative source for all AGI terminology
Layer: docs/00-foundation
Document ID: AGI-DOC-0004
Related: [architecture-manifest.md](architecture-manifest.md), [requirement-id-system.md](requirement-id-system.md), `packages/types/src/suite-contracts.ts`, `docs/current/trust-mode-surface-matrix.md`

---

This is the single authoritative definition of every load-bearing AGI term. Other documents **reference** these terms; they do not redefine them ([documentation-constitution.md](documentation-constitution.md) Article III). Each entry cites the implementation that grounds it. "Canonical" = the term to use; "Avoid" = deprecated or ambiguous usage.

## Brand & platform

- **AGI** — The public product brand. Canonical for all user-facing surfaces and copy. Source: `CURRENT_DECISIONS.md` #2.
- **AGI Workforce** — The formal platform/company name and the internal repository name. Used for legal/formal contexts. Source: `AGI_WORKFORCE.md`, `README.md`.
- **`agiworkforce`** — The locked **internal identifier** for repo, packages (`@agiworkforce/*`), crates (`agiworkforce-*`), database identifiers, and on-disk state (`~/.agiworkforce`). Not a user-facing term. **Avoid** renaming in code. Source: `CURRENT_DECISIONS.md` #15; `package.json`.
- **`agi`** — The primary CLI command. `agiworkforce` is a compatibility alias. Source: `CURRENT_DECISIONS.md` #15; `apps/cli`.

## Surfaces (the six first-class clients + sandbox)

The canonical `SourceSurface` set is `'web' | 'desktop' | 'mobile' | 'cli' | 'vscode' | 'chrome'` (`packages/types/src/suite-contracts.ts`).

- **AGI Web** — Next.js 16 surface (`apps/web`): account, synced chat, projects, artifacts, billing/waitlist, admin, OpenAI-compatible API. Cloud-only.
- **AGI Desktop** — Tauri 2 surface (`apps/desktop`): local-private compute host and native bridge; the deepest surface.
- **AGI Mobile** — Expo/React Native surface (`apps/mobile`): on-device Local LLM + Cloud (public alpha, open by default); the first release surface.
- **AGI CLI** — Rust/Ratatui surface (`apps/cli`), binary `agi`: developer engine and shared-engine proving ground.
- **AGI in Chrome** — Chrome MV3 extension (`apps/extension`): browser context, page actions, native bridge.
- **AGI for VS Code** — VS Code extension (`apps/extension-vscode`): IDE-native assistant.
- **AGI Sandbox** — Static cross-origin artifact renderer (`apps/sandbox`); not a client surface — an isolation primitive.

## Trust modes (the core product axis)

The canonical machine vocabulary lives in `packages/types/src/suite-contracts.ts`.

- **Local Mode** — `PrivacyMode = 'local'`. Runs on the local device/host; data never leaves the device; fails closed. Free; no account required. Requirement: `AGI-TRUST-0001`.
- **BYOK** (Bring Your Own Key) — `PrivacyMode = 'byok'`; `ProviderMode = 'DirectByok'`. Requests go **directly to the user's provider**, never through AGI cloud; provider is labeled. Available only on Desktop/CLI/VS Code. Requirement: `AGI-TRUST-0002`, `AGI-TRUST-0004`.
- **Managed Cloud** / **Cloud Mode** — `PrivacyMode = 'managed'`; `ProviderMode = 'ManagedGateway' | 'ManagedNative'`. AGI-hosted, metered inference; the **only** path that crosses into AGI cloud and the **only** writer to the shared cloud chat store. In public alpha and open by default (founder decision, 2026-06-27); the private-beta/waitlist launch gate has been removed, and the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident-response kill-switch. Still a separate trust boundary: Local/BYOK are never silently routed here. Requirement: `AGI-TRUST-0003`, `AGI-BILL-0001`.
- **`ChatExecutionMode`** — `'local_only' | 'byok' | 'cloud_managed'`; the per-conversation execution classification (`suite-contracts.ts`).
- **Trust boundary** — The enforced separation between Local, BYOK, and Managed. Crossing it is never silent.
- **Local→BYOK fork** — The explicit, reviewed transition from a Local conversation to a BYOK continuation: context selection → secret scan/redaction → payload preview → provider label → consent → new branch. **The original Local thread stays Local forever.** Source: `LocalByokHandoffDialog.tsx`, `@agiworkforce/utils buildLocalToByokHandoffDraft`. Requirement: `AGI-TRUST-0002`.
- **Egress guard** — The fail-closed network gate that blocks AGI-cloud hosts when `PrivacyMode !== 'managed'`. Source: `apps/desktop/src/lib/egressGuard.ts` (currently opt-in / fetch-scoped — see [architecture-manifest.md](architecture-manifest.md) §Security). Requirement: `AGI-TRUST-0001`.

## Cloud Mode vs Local Mode as products

- **Local Mode (product)** — defined by **user-owned compute and user-owned storage**; on-device models and BYOK are its two execution strategies, not its definition; never requires AGI cloud inference or an AGI subscription. (A distinct product sharing one platform; see [platform-constitution.md](platform-constitution.md) Part III §23.)
- **Cloud Mode (product)** — AGI-managed models, cloud sync, hosted storage, projects, memories, settings, conversations, usage, subscriptions, collaboration. Requires account + entitlement.
- These are **intentionally separate products sharing one platform** (the shared engine; see **suite spine**). Documentation must keep their boundaries explicit. Requirement: `AGI-PROD-0002`.

## Sync & storage

- **Shared cloud chat store** — Server-side conversation storage shared by **Web + Desktop + Mobile** only. Chrome is isolated; CLI/VS Code coding sessions are separate. Source: `docs/current/trust-mode-surface-matrix.md`. Requirement: `AGI-SYNC-0001`.
- **Sync boundary** — The rule that normal app-chat sync is limited to Web/Desktop/Mobile; developer surfaces require explicit, redacted handoff.
- **Local store** — On-device persistence: SQLCipher SQLite (Desktop/Mobile), JSON/JSONL (CLI), MMKV (Mobile). Source: `apps/desktop/src-tauri/src/data`, `apps/mobile/storage`.

## AI runtime primitives

- **Model catalog (SSOT)** — `packages/types/src/models.json`: the single source of truth for model IDs and capability metadata (57 model entries / 15 populated providers as of 2026-06-23). Model IDs are never hardcoded elsewhere. Requirement: `AGI-AI-0001`.
- **Route object** — `provider + endpoint class + model id + capability metadata + pricing + privacy/retention claim + runtime health`; a model name alone is insufficient. Source: `docs/current/byok-open-model-provider-strategy.md`.
- **Provider adapter** — An AGI-owned adapter wrapping a provider SDK/endpoint into the canonical request/stream contract. "SDKs are adapters, not architecture." Source: `packages/providers/*`, `CURRENT_DECISIONS.md` #7. Requirement: `AGI-ARCH-0001`.
- **`llm-normalize`** — The canonical cross-provider normalization contract. Source: `packages/llm-normalize`, `CURRENT_DECISIONS.md` #12.
- **Suite spine** — `packages/unified-chat`: the shared chat engine/state/UI that every surface composes via an injected runtime. Source: `docs/decisions/2026-05-21-unified-chat-as-suite-spine.md`.
- **Auto-routing** — Explainable task→model selection (`packages/routing`); silent model substitution is rejected. Requirement: `AGI-AI-0002`.

## Work primitives

- **One chat** — A single conversation that also handles files, references, images, artifacts, tools, and connectors; file work is a _state_ of a conversation, not a separate surface. Requirement: `AGI-PROD-0001`.
- **Artifact** — A first-class generated output (html/react/svg/mermaid/markdown/code) rendered in the isolated sandbox; versioned and shareable.
- **Generated file / Compute session** — A produced native file (`GeneratedFile`) with a manifest (owner, source session, privacy mode, checksum, storage, TTL); produced inside a `ComputeSession`. Source: `packages/types`, `PLAN.md` §4A.
- **Project** — A grouping of instructions, knowledge files, sources, memory, and provider defaults. Source: `apps/web/db/neon/0006`, `0035`.
- **Memory** — Saved/reference/project memory; dual-stack (local SQLite FTS5+vector; cloud Neon `user_memories`). Source: `apps/desktop/src-tauri/.../memory_manager.rs`, `0010`/`0040`.
- **Connector / MCP server** — An external capability integration via Model Context Protocol; allowlist-gated. Source: `packages/mcp`.
- **Skill / Plugin / Subagent** — Prompt-context skill loaders, manifest-discovered plugins, and tool-scoped delegated agents. Source: `packages/skills`, `crates/agiworkforce-plugin-runtime`, CLI subagents.
- **Dispatch / Cowork / Scheduled** — Cross-surface task handoff, collaborative task surfaces, and scheduled/automation runs. Source: desktop AgiWork panels.
- **Computer use / Browser use** — Screenshot/action loop over a desktop or browser session, behind an AGI-owned action protocol. Source: `packages/browser-tool`, `apps/extension` CDP driver.

## Commercial

- **Billing plan tier** — Canonical set `'local-only' | 'byok' | 'free' | 'pro' | 'max' | 'team' | 'enterprise'` (`packages/types/src/billing-catalog.ts`). Note: a separate desktop UI list adds `hobby`/`pro_plus`; this divergence is tracked in [documentation-status-inventory.md](documentation-status-inventory.md).
- **Managed credits / waitlist** — Metered cloud usage and its access flow. Managed cloud is in public alpha and open by default (founder decision, 2026-06-27); the private-beta/waitlist launch gate has been removed, and the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env remains only as an incident-response kill-switch. Commercial controls (metering/fraud/refund/retention/deletion) must keep pace with public usage but no longer gate access. The waitlist UX persists only for genuinely unavailable hosted capacity. Requirement: `AGI-BILL-0001`.

## Documentation meta-terms

- **Requirement ID** — `AGI-<DOMAIN>-<NNNN>` (see [requirement-id-system.md](requirement-id-system.md)).
- **Document ID** — `AGI-DOC-<NNNN>`, assigned in front-matter.
- **Doc status** — `Current | Needs Update | Deprecated | Superseded` (see [documentation-standards.md](documentation-standards.md)).
