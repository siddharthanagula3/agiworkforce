# AGI Architecture Manifest

Status: Current
Owner: Platform lead
Last updated: 2026-07-30
Last verified against implementation: 2026-07-30
Audience: Architects, surface engineers, and AI agents making structural changes
Layer: docs/00-foundation
Document ID: AGI-DOC-0003
Related: [canonical-glossary.md](canonical-glossary.md), [requirement-id-system.md](requirement-id-system.md), [documentation-migration-plan.md](documentation-migration-plan.md), `docs/current/technical-architecture.md`, `docs/current/trust-mode-surface-matrix.md`, `AGI_WORKFORCE.md`

---

This manifest is the canonical architecture description. It separates **Current** (implementation-grounded, with source paths) from **Target** (the AGI-platform vision) per [documentation-constitution.md](documentation-constitution.md) Article II. The gap is owned by [documentation-migration-plan.md](documentation-migration-plan.md).

## 1. Platform shape (Current)

A polyglot monorepo: **pnpm workspace** (`apps/*`, `packages/*`, `packages/ai/providers/*`, `services/*`) + **Cargo workspace** (`apps/desktop/src-tauri`, `apps/cli`, `crates/*`). Node 24 LTS, Rust edition 2021.

- **Surfaces** (`apps/`): web, desktop, mobile, cli, extension (Chrome), extension-vscode, sandbox. (`AGI-SURF-0001`.)
- **Shared TypeScript** (`packages/`, 21): contracts (`types`), suite spine (`unified-chat`), provider adapters (`providers/*`), `provider-protocol`, `provider-runtime`, `routing`, `mcp`, `browser-tool`, `local-llm`, `compliance`, `runtime`, `data-layer`, `ui`, `stores`, `skills`, `api`, etc.
- **Shared Rust** (`crates/`, 12): `agent-core`, `app-server`, `command-registry`, `execpolicy`, `licensing`, `llm`, `mcp`, `model-registry`, `protocol`, `sandbox-policy`, and two utility crates.
- **Services** (`services/`): `api-gateway` (Express 5 managed-compute proxy), `signaling-server` (WebRTC pairing).
- **Database**: `apps/web/db/neon` (canonical Neon Postgres migrations, `0001`–`0042`).

## 2. Layering (Current)

1. **Contracts** — `packages/contracts/types` (`suite-contracts.ts`, `models.json` SSOT), `crates/agiworkforce-protocol`.
2. **Mechanics** — provider adapters, `provider-protocol`, `provider-runtime`, `routing`, `mcp`, `browser-tool`; Rust `execpolicy` and `sandbox-policy`.
3. **Orchestration** — `packages/ui/unified-chat` (suite spine) + per-surface runtimes.
4. **Surfaces** — the seven apps.

**Dependency rules (enforced, `AGI-ARCH-0002`):** apps must not import apps; packages must not import apps; services must not import UI. Verified by `pnpm check:boundaries` (passing as of 2026-06-24).

## 3. Trust-mode state machine (Current — the core architecture)

The organizing axis is not classic DDD but a trust-mode state machine encoded in `packages/contracts/types/src/suite-contracts.ts` and `docs/current/trust-mode-surface-matrix.md`:

| Surface | Local | BYOK | Managed Cloud | Shared cloud chat sync     |
| ------- | :---: | :--: | :-----------: | -------------------------- |
| Mobile  |  ✅   |  ❌  |      ✅       | shared (web+desktop)       |
| Web     |  ❌   |  ❌  |      ✅       | shared (desktop+mobile)    |
| Desktop |  ✅   |  ✅  |      ✅       | shared (web+mobile)        |
| CLI     |  ✅   |  ✅  |      ✅       | separate (coding sessions) |
| VS Code |  ✅   |  ✅  |      ✅       | separate (coding sessions) |
| Chrome  |  ❌   |  ❌  |      ✅       | isolated store             |

Invariants: `AGI-TRUST-0001`…`AGI-TRUST-0004`, `AGI-SYNC-0001` ([requirement-id-system.md](requirement-id-system.md)).

## 4. Execution model (Current)

- **Local** — on-device inference (Ollama/LM Studio on desktop; Apple Foundation Models / ExecuTorch / llama.rn on mobile via `packages/platform/local-llm`). Fails closed.
- **BYOK** — direct-to-provider via adapters; "Native First" tool orchestration where supported (`CURRENT_DECISIONS.md` #21).
- **Managed** — via `services/api-gateway`; the only metered egress.
- **Streaming** — provider stream → 8 canonical `StreamChunk` variants → surface runtime → state. 90s idle watchdog; gateway-aware retry/fallback (`packages/ai/provider-runtime`).

## 5. Provider architecture (Current)

- SSOT catalog `packages/contracts/types/src/models.json` (57 models / 15 populated providers; ~10 provider definitions with no entries yet — `docs/current/byok-open-model-provider-strategy.md`).
- 8 native adapters (`anthropic, openai, google, deepseek, xai, perplexity, ollama, lmstudio`); other providers via OpenAI-wire-compat path + `provider-protocol`. (`AGI-AI-0001`, `AGI-ARCH-0001`.)

## 6. Synchronization (Current)

- Shared cloud chat store (Neon) for Web/Desktop/Mobile; delta sync with UUIDv7 + tombstones (migrations `0038`–`0042`). Managed-mode only. Chrome isolated; CLI/VS Code separate. (`AGI-SYNC-0001`.)

## 7. Storage & data (Current)

- Cloud: Neon Postgres (raw SQL, no ORM); access via `@agiworkforce/data-layer`. Local: SQLCipher SQLite (desktop/mobile), JSON/JSONL (CLI), MMKV (mobile). Vercel Blob for web media.
- Row-level security policies exist (`0037`, `0039`) but are **dormant on the live path** (the app binds tenant isolation at the application layer, `where user_id = $1`). This is the **real** state (`AGI-SEC-0001`); see [documentation-status-inventory.md](documentation-status-inventory.md).

## 8. Security model (Current)

- Trust boundaries enforced in code (`suite-contracts.ts`; CLI `agent/mod.rs::validate_privacy_boundary`; desktop `egressGuard.ts`). Egress guard is **opt-in / fetch-scoped** today, not a global interceptor.
- Secrets: OS keychain + Stronghold vault (desktop), secure-store (mobile), keyring (CLI). Rust policy crates (`execpolicy`, `sandbox-policy`). Extension threat model in `apps/extension/THREAT_MODEL.md`.
- Compliance: EU AI Act Article 50 disclosure + provenance + Chinese-HQ-provider opt-in (`packages/contracts/compliance`, `AGI-COMP-0001`).

## 9. Identity (Current)

- **Clerk** for managed identity (web/mobile/gateway); 2FA; device-authorization flow for desktop/CLI token handoff. Source: `apps/web/proxy.ts`, `0025`, `0029`.

## 10. Infrastructure & DX (Current)

- Web + sandbox on Vercel; signaling on Fly.io (GHCR Docker); Neon DB; Upstash Redis. api-gateway deploy target **UNKNOWN** (Dockerfile only).
- Agent-native operability: `AGENTS.md` + `docs/agent-context/*` + 20+ `check:*` guardrails + multi-tool agent configs (`.claude/agents/*`, `.codex/agents/*.toml`, `.cursor/hooks/*`).

## 11. Known structural risks (Current — honest state)

Documented so no future doc repeats an aspirational claim:

- Local desktop chat invoke path is broken end-to-end (`docs/agent-context/known-flaws.md`: `LOCAL-CHAT-NOINVOKE-01`).
- RLS dormant on live path (§7). Egress guard opt-in (§8). Pricing has divergent sources (see inventory). CI currently red. Desktop macOS/Windows release builds disabled.

## 12. Target architecture (AGI platform vision)

The platform evolves toward **Local Mode and Cloud Mode as two intentionally separate products sharing one platform** (`AGI-PROD-0002`):

- **Local Mode product** — Local LLMs + BYOK + local storage, no AGI subscription required.
- **Cloud Mode product** — AGI-managed models, cloud sync, hosted storage, projects, memories, settings, conversations, usage, subscriptions, collaboration — a Claude/ChatGPT/Codex/Gemini/Perplexity-class experience that remains provider-agnostic.
- The **shared platform** is the suite spine (`unified-chat`), the SSOT contracts (`types`), provider abstraction, and the sync engine.

Target deltas from Current (owned by the migration plan): activate RLS on the live path; make egress enforcement global; unify the pricing SSOT; restore desktop release builds; define the managed-cloud commercial control plane; specify the Local↔Cloud product separation in code and UX without weakening the trust boundary.

## 13. Architecture change rules

- Preserve existing architecture unless there is **clear evidence of improvement** (objective; mirrors `documentation-constitution.md` Article I).
- Do not weaken a trust-boundary invariant for convenience. Any change touching `AGI-TRUST-*` requires an ADR ([adr-index.md](adr-index.md)).
- Do not combine file moves with behavior changes (`AGI_WORKFORCE.md` architecture lock).
