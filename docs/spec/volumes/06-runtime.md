# Volume 06 — Runtime (Cloud / Local / Hybrid)

Status: Canonical depth for Master Spec Vol 6
Authority: `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 6, `docs/strategy/04-scaling-to-1M-architecture.md`, `docs/strategy/10-oss-corpus-port-plan.md`, `packages/contracts/types/src/models.json`.

## Philosophy & Cloud/Local stance

There is one runtime concept — an LLM execution loop with streaming, tool calling, and recovery — instantiated three ways: **cloud** (AGI-managed, proxied through one hardened gateway), **local** (on-device, never requiring an AGI account), and **hybrid** (trust-aware routing across them). Build it once and reuse it everywhere; the four runtime depth gaps in `docs/strategy/10` §2 all have license-clean Rust donors (codex-rs), so the work is porting and hardening, not invention.

The Cloud/Local stance is the company's structural cost advantage (`docs/strategy/04` §1): Local and BYOK push inference — the dominant cost and hardest-to-scale component — onto the user's device or provider account, so AGI's backend only scales for the Managed slice. Architect Local/BYOK as the _encouraged, first-class_ path, not a fallback (ADR-3). The runtime must never silently cross a trust boundary: a Local request stays Local; Local→BYOK is an explicit reviewed fork (Vol 3).

## Binding rules

1. Cloud inference flows through exactly one hardened streaming gateway with exactly-once metering; no surface talks to a Managed provider directly.
2. Local runtime never requires an AGI account and never emits a non-local network call in `local_only` mode (egress contract tests gate this).
3. Hybrid routing is capability-, cost-, health-, and trust-aware; it must explain its choice and never silently cross Local→BYOK→Managed.
4. All model IDs, capabilities, and tier membership come from `packages/contracts/types/src/models.json`; routing reads `capabilities.{tools,vision,thinking,...}` and never assumes a feature a model lacks.
5. Default casual Managed traffic to the economy tier; routing tiers (`auto-economy`/`auto-balanced`/`auto-premium`) are a margin lever, not just UX (`04` §4).
6. Failover across providers is transparent (< 1 request, per `04` §7) with a per-provider circuit breaker; provider outages are routine, not exceptional.
7. On context-window overflow, recover (drain → compact → escalate) instead of erroring (Vol 24); long-running/background work checkpoints so it can resume.
8. Tool calling is fail-closed: read-only tools may dispatch mid-stream; destructive/boundary-crossing tools require approval (Vol 17, Vol 18).

## Repository map

- **Cloud runtime:** `services/api-gateway/src/routes/providerStream.ts` (real SSE streaming proxy), credits/metering, worker assignment, MCP, enterprise routes; `services/signaling-server` for sync/realtime fan-out.
- **Shared LLM runtime (TS):** `packages/ai/provider-runtime/src/` — `gateway.ts`, `fallback.ts`, `retry.ts`, `retry-after-internal.ts`, `watchdog.ts`, `history.ts`, `errors.ts`, `headers.ts`.
- **Routing:** `packages/ai/routing/src/` — `classify.ts`, `pricing.ts`, `indic.ts`, `types.ts`; tier logic referenced as `three-tier-router` (see `models.json` `tokenizer_drift_warning`).
- **Local runtime:** `packages/platform/local-llm/src/` — `tier1.ts` (system models), `tier2.ts` (ExecuTorch), `tier3.ts` (llama.cpp/llama.rn), `selector.ts`, `capabilities.ts`, `catalog.ts`.
- **Mobile native ladder:** `apps/mobile/services/{llmGate.ts,modelDownload.ts,remoteChatGate.ts}`; iOS Foundation Models stub `apps/mobile/ios/.../AGIFoundationModels.swift`.
- **Rust loop/sandbox:** `crates/agiworkforce-{task-runtime,command-registry,execpolicy,sandbox-policy,network-proxy}`; CLI loop `apps/cli/src/agent/mod.rs`.

## Competitor notes

Anthropic's "thinnest possible shell over the model" harness — tool loop, subagents with isolated context, sessions/checkpoints, HITL approvals, an MCP client with tool deferral, and a permission engine its engineers call the hardest part — is the shape to match (`docs/strategy/01` §4). OpenAI's Responses API is a stateful agent runtime with built-in tools, context compaction, and a hosted container workspace (`01` §3). AGI's divergence: **multi-provider failover as a product feature** (incumbents are single-lab), a **true local sandbox** (codex/gemini-cli are the only OSS sandbox references; goose/crush/opencode ship none — `10` §2), and **trust-aware routing** that is also the margin control (ADR-2). AGI rents models, so model-versioning discipline (pinned IDs in `models.json`, tokenizer-drift handling) is non-negotiable.

## Checklists

### Cloud runtime

- [ ] All Managed inference proxied through `providerStream.ts`; no direct client→provider Managed path.
- [ ] Metering is idempotent on retries/partial runs (reserve-then-settle); a daily drift audit reconciles usage vs. ledger.
- [ ] Per-user/per-IP/per-provider rate limiting + a per-provider circuit breaker at the edge.
- [ ] A global request ID traces every token to a usage event.
- [ ] Background/queued tasks checkpoint and resume; scheduling honors quotas.
- [ ] Prompt caching + batch are on by default where the model supports them (`models.json` `caching`).

### Local runtime

- [ ] Tier ladder selects highest viable tier for the device (`packages/platform/local-llm/src/selector.ts`): system → ExecuTorch → llama.cpp/llama.rn.
- [ ] GPU/CPU/NPU paths chosen by capability detection; ONNX/MLX/Ollama/LM Studio honored where present; never assume an accelerator.
- [ ] No AGI account required; `local_only` emits zero non-local calls (egress test).
- [ ] Model downloads are checksum-verified and resumable (`apps/mobile/services/modelDownload.ts`).
- [ ] Thermal/RAM checks gate large local models; fits-this-device shown before download.
- [ ] vLLM/TensorRT paths apply only where applicable (server/desktop), behind capability checks.

### Hybrid routing

- [ ] Routing decision is capability-, cost-, health-, and trust-scoped and is explained to the user.
- [ ] No silent boundary crossing; Local→BYOK requires the explicit fork (Vol 3).
- [ ] Failover/fallback across providers is transparent and order is deterministic (`packages/ai/provider-runtime/src/fallback.ts`).
- [ ] Offline mode degrades to Local cleanly; no hung requests when the network drops.
- [ ] Tokenizer drift (e.g. Claude Opus 4.8, +0–35% tokens) is budgeted in estimates so cached prompts don't overshoot the window.

### Reliability gate

- [ ] Chat send → first token (Managed) p95 < 2.5 s; stream completion success > 99.5% (`04` §7).
- [ ] Provider failover < 1 request, transparent to the user.
- [ ] Trust-boundary violations = 0 (any is a P0 incident).
- [ ] Watchdog (`packages/ai/provider-runtime/src/watchdog.ts`) detects stalled streams and recovers.

## Definition of Done

The runtime is production-ready when: Managed inference proxies through one gateway with drift-audited exactly-once metering; Local runs fully offline with no account and no egress in `local_only`; hybrid routing makes explained, trust-safe, cost-aware choices with transparent failover; recovery (compaction + retry) handles overflow without erroring; and the reliability targets in `04` §7 are met under load test. Model IDs and capabilities resolve only from `models.json`.

## Anti-patterns

- Re-implementing the agent loop, streaming, or recovery per surface instead of consuming the shared runtime.
- Letting a client call a Managed provider directly, bypassing the gateway and its metering.
- Routing that silently upgrades a Local/BYOK request to Managed for convenience or revenue (inverts the cost advantage and breaks trust).
- Defaulting casual traffic to frontier models (turns a $27K bill into $2.3M — `04` §4).
- Hardcoding a model ID, context window, or capability instead of reading `models.json`.
- Erroring on context overflow instead of draining → compacting → escalating.
- Assuming a GPU/NPU exists; shipping a local path that crashes on CPU-only devices.
