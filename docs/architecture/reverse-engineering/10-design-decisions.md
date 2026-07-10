# 10. Design Decisions (load-bearing choices + rationale)

Status: Current
Owner: Founder + platform lead
Last updated: 2026-07-10

These are the decisions that constrain everything else. Each is stated with its rationale and a cross-reference to where it is ratified. Change any of these and large parts of the architecture move — so they are documented as first-class.

## D1. Byte-stable v1 OpenAI-compatible contract

**Decision:** the public `POST /v1/chat/completions` wire (`apps/web/app/api/llm/v1/chat/completions/route.ts`) is a byte-for-byte stable contract. When provider streaming was migrated from 4,721 LOC of hand-written `lib/llm-providers` code onto the shared adapter layer, the new path had to reproduce the legacy bytes exactly (`wireMode: 'legacy-web'` via `OpenAIWireAssembler`), proven by per-provider golden byte-parity tests.

**Rationale:** external clients and satellite surfaces depend on the exact wire. A refactor that changed a byte would silently break them. Byte-parity tests let the team delete 4,721 LOC of duplication with confidence — the migration surfaced and fixed ~11 latent bugs (money-path 200-on-failure, Gemini finish_reason, OpenAI include_usage/logprobs fidelity) without changing the contract.

**Ratified:** `docs/current/technical-architecture.md` P2; areas 3–4 here.

## D2. Three trust boundaries (Local / BYOK / Managed)

**Decision:** Local, BYOK, and Managed Cloud are separate, non-negotiable trust boundaries. Local never silently routes to BYOK/Managed; Local → BYOK is an explicit fork (context selection, secret scan, payload preview, consent, visible provider label) that persists a redacted payload, not the original messages.

**Rationale:** the product's locked differentiation is "your models, no markup, private, everywhere." Trust honesty is the wedge — a single silent cross-boundary route would break the core promise (and, for Local, leak private data). This is enforced in code (`check:boundaries`, mobile `guardedFetch`/`remoteChatGate` fail-closed, desktop `desktopCloudGate`, CLI privacy modes) and by policy tests, not just docs.

**Ratified:** `AGENTS.md` non-negotiables, `CLAUDE.md` critical rules, `docs/current/source-of-truth.md`, `packages/types/src/suite-contracts.ts`; areas 1, 6, 7 here.

## D3. Managed cloud is public alpha, open by default

**Decision (founder, 2026-06-27):** the private-beta/waitlist launch gate is removed; signed-in users can use managed compute now. `AGI_MANAGED_COMPUTE_PRIVATE_BETA` remains only as an incident kill-switch. Billing/metering/abuse/fraud/refunds/retention must keep pace but no longer gate access.

**Rationale:** the GTM is a freemium wedge — free Local + no-markup BYOK convert to paid managed cloud. Gating access behind a waitlist starves the conversion funnel. Only genuinely unavailable hosted capacity routes to a request-access flow. Supersedes the older `CLOUD-01` locked rule (known-flaws marks it "Superseded 2026-06-27").

**Ratified:** `AGENTS.md`, `CLAUDE.md`, matrix "Managed cloud mode = Public alpha."

## D4. No-markup BYOK GTM

**Decision:** BYOK charges no markup — the user's key goes directly to the provider; AGI does not proxy or margin it. AGI competes on "your models, no markup, private, everywhere," **not** on frontier models.

**Rationale:** the durable moat is trust + reach + price transparency, not a better base model (which AGI does not own). No-markup BYOK is the credibility proof for the whole privacy-first pitch; the paid product is managed convenience, not a key tax.

**Ratified:** `docs/current/byok-open-model-provider-strategy.md`, GTM memory, `docs/current/source-of-truth.md`.

## D5. Capability-first, catalog-owned model IDs

**Decision:** controls are gated by capability metadata (function calling, vision, image gen, search, code exec, structured output, reasoning/effort), and model IDs are read from `packages/types/src/models.json` + capability metadata — never invented or hardcoded.

**Rationale:** the product spans 12+ providers with different capabilities; hardcoding per surface guarantees drift, fake availability badges, and stale IDs (a repeated failure class — `WEB-PROVIDER-DRIFT-01`, `MODELS-CURATION-DRIFT-01` "Fixed, RECURRED once, re-fixed"). A single catalog + capability gating is the only way capability honesty scales across six surfaces.

**Ratified:** `AGENTS.md`/`CLAUDE.md` locked rule; `packages/types` (`models.json`, `model-catalog.ts`, `suite-contracts.ts`); area 3 here.

## D6. Capability-first shared architecture, zero duplication

**Decision:** no per-surface or per-mode implementations of shared concerns — structure around shared packages/crates. One provider layer, one streaming client, one UI layer, one wire/data seam, one Rust engine crate-set.

**Rationale:** six surfaces × duplicated logic = six drifting copies of every bug fix and every trust check. The restructure (P0–P6) is the enforcement: P2 one TS provider path, P3 one UI layer, P4 shared Rust crates, P5 one wire/data seam. `check:boundaries` + policy tests make it durable. The shared-packages decision log adjudicates every consolidation item with file-level evidence (accept/modify/reject).

**Ratified:** `docs/architecture/shared-packages-decision-log.md` §5, `docs/plans/monorepo-restructure-2026-07-08.md`; areas 1–2 here.

## D7. Per-surface persistence joined by one wire + one apply engine (not one DB)

**Decision:** conversation persistence is deliberately per-surface (Neon / Tauri SQLite / expo-sqlite), joined by `cloud-contracts` (one Zod wire truth) + `sync-apply` (one pure apply engine), with desktop's Rust apply pinned to the TS golden fixtures. A cross-surface DAG store was explicitly **rejected** (decision log R3).

**Rationale:** each surface has a native, offline-capable local store already working; re-platforming onto a shared cross-surface store re-platforms working persistence for no user-visible gain. The correct seam is the wire + apply logic, which *can* be single-sourced and cross-language-verified (fixtures). This is server-authoritative delta sync (the 0038 pattern), reused across chat/artifact/memory/projects/settings.

**Ratified:** decision log R3, `docs/plans/cross-device-cloud-sync-design-2026-06-20.md`; area 5 here.

## D8. Desktop/CLI cloud modes ride the web REST API (no separate backend)

**Decision (founder, 2026-07-03):** desktop/CLI/VS Code Cloud modes call the web app's real REST API directly with the existing Bearer JWT — they do not run a separate cloud backend. Clerk auth on web; satellites ride web REST with Bearer JWT (decision log R9 defers an auth package until after P2–P5).

**Rationale:** one backend, one billing/metering/RLS path, one wire to keep byte-stable (D1). A second backend would double the trust-boundary surface and split the money path. Desktop Cloud is a fast-follow ("coming soon") precisely because it must verify against this shared backend before claiming availability (DCL-1…4).

**Ratified:** desktop cloud-mode architecture memory (founder 2026-07-03), matrix "Cloud mode onboarding."

## D9. Cross-language via protocol crate + ts-rs (Strategy B, no WASM/uniffi)

**Decision:** TS packages + Rust crates joined by `agiworkforce-protocol` as the seam; ts-rs codegen emits `@agiworkforce/types/protocol` (216 types, drift-guarded by `pnpm check:protocol-types`). No WASM/uniffi; the only C-candidate (apply-patch) dissolved when its dead Rust twin was deleted.

**Rationale:** the two runtimes (TS cloud/web/mobile, Rust CLI/desktop) need identical types without a fragile hand-mirrored copy or a heavyweight FFI. Codegen from one Rust source of truth + golden-fixture behavioral pinning (D7) gives type + behavior parity at low cost.

**Ratified:** decision log §7, `docs/current/technical-architecture.md` P4, `docs/plans/rust-engine-extraction-2026-07-09.md`.

## D10. Single-window, modal-first surface philosophy

**Decision:** AGI Desktop is one tab + folder selection + Local/Cloud modes (not Claude-style multi-tab nav). Common flows (settings/connector/plugin/search/project-edit/file-preview) open as focused modals before escalating to full-screen workspaces; full-screen is reserved for deep artifact viewing, code dashboards, project indexes, long-running traces.

**Rationale:** a single-window model matches the "one chat" product lock and keeps the surface legible; the industry converged here too (Codex merged into one ChatGPT app, 2026-07-09). Modal-first keeps the common case fast and the deep case available.

**Ratified:** desktop single-tab architecture memory, `docs/current/technical-architecture.md`; area 8 here.

## Decision cross-reference index

| Decision | Primary source of truth |
| -------- | ----------------------- |
| D1 byte-stable v1 | `technical-architecture.md` P2 |
| D2 three trust boundaries | `AGENTS.md`, `suite-contracts.ts` |
| D3 managed public alpha | `AGENTS.md` (founder 2026-06-27) |
| D4 no-markup BYOK | `byok-open-model-provider-strategy.md` |
| D5 catalog-owned model IDs | `packages/types/src/models.json` |
| D6 zero-duplication shared arch | `shared-packages-decision-log.md` |
| D7 per-surface persistence + one wire/apply | decision log R3, cross-device-sync design |
| D8 satellites ride web REST | desktop cloud-mode architecture (founder 2026-07-03) |
| D9 protocol crate + ts-rs | decision log §7, rust-engine-extraction plan |
| D10 single-window modal-first | desktop single-tab architecture |
