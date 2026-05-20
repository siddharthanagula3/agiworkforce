# SDK Strategy: OpenAI, Anthropic, And Vercel AI SDK

Last updated: 2026-05-20.

This ledger records the SDK decision for AGI Workforce. It is based on current
official OpenAI, Anthropic, and Vercel documentation plus the existing AGI
provider code.

## Executive Decision

AGI Workforce should use vendor SDKs, but only behind AGI-owned adapters or UI
edges.

The core runtime must remain AGI-owned:

- AGI owns the conversation/session/artifact/tool schemas.
- AGI owns the normalized stream event protocol.
- AGI owns Local/BYOK/Managed privacy boundaries.
- AGI owns routing, model capability metadata, usage accounting, and replay.
- SDKs are transport helpers or web UI helpers, not the agent architecture.

## Current Repo Reality

The codebase already points in the right direction.

| Area | Current state | Implication |
| --- | --- | --- |
| Web app | `apps/web` depends on `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `openai`, and `@anthropic-ai/sdk`. | Keep the AI SDK path for Web streaming, but translate to AGI schemas. |
| Web AI SDK path | `apps/web/lib/ai-sdk/providers.ts` and `apps/web/lib/ai-sdk/stream-handler.ts` wrap Vercel AI SDK v6. | Treat this as a Web transport path, not a shared runtime replacement. |
| OpenAI provider package | `packages/providers/openai` wraps the official `openai` SDK and has both Chat Completions and Responses translation paths. | Make Responses first-class for native OpenAI, keep Chat Completions for compatible endpoints. |
| Anthropic provider package | `packages/providers/anthropic` wraps `@anthropic-ai/sdk` and translates SDK stream events to AGI `StreamChunk`. | Good pattern. Update versions later, but keep the adapter boundary. |
| Rust/Desktop code | Rust code calls provider APIs directly in places. | Long term, route through shared provider contracts or generated protocol bindings. |
| API gateway | `services/api-gateway` has direct provider HTTP calls and provider health logic. | Do not introduce Vercel Gateway as the default AGI gateway. Preserve AGI's own gateway boundary. |

## Source Findings

| Source | Finding | AGI decision |
| --- | --- | --- |
| OpenAI SDKs and CLI | OpenAI says official SDKs are for direct API requests. The docs separately say to use the Agents SDK when code-first orchestration needs agents, tools, handoffs, guardrails, tracing, or sandbox execution. | Use official OpenAI SDK inside provider adapters. Do not use OpenAI Agents SDK as the AGI runtime. |
| OpenAI Responses API | OpenAI recommends Responses for new projects. Responses adds built-in tools, multi-turn state, multimodal input, structured output changes, and native agentic primitives. | Native OpenAI provider should prefer Responses for `api.openai.com` when feature parity matters. Keep stateless mode by default unless the user selected managed/cloud state. |
| OpenAI Sandbox Agents | OpenAI separates harness/control plane from sandbox/compute plane. The harness owns agent loop, tool routing, approvals, tracing, recovery, and run state; compute owns filesystem/shell/packages/ports/snapshots. | Adopt the boundary concept. AGI's harness should stay in AGI runtime; sandbox providers are interchangeable execution backends. |
| Anthropic Client SDKs | Anthropic official SDKs provide idiomatic interfaces, type safety, streaming, retries, and error handling. | Keep Anthropic SDK inside the Anthropic adapter. Do not make Anthropic Agent SDK the platform core. |
| Vercel AI SDK | Vercel AI SDK abstracts model-provider differences, supports text, structured data, tools, and web UI integration. | Use it in Web/Next.js paths where it speeds streaming UI, but keep AGI schemas as source of truth. |
| Vercel AI Gateway | AI Gateway provides one endpoint, budgets, usage monitoring, load balancing, and fallbacks. Its docs say AI SDK string model names default to Gateway unless another default provider is configured. | Use only for explicit Managed mode experiments. Do not use it for Local or BYOK privacy modes by default. |
| Vercel Gateway BYOK | Vercel BYOK credentials can be team-scoped or request-scoped. Docs say requests may fall back to system credentials if provided credentials fail. | This fallback is not acceptable for strict AGI BYOK unless users explicitly consent to managed fallback. |

## SDK Use Matrix

| SDK/API | Use in AGI? | Allowed scope | Not allowed scope |
| --- | --- | --- | --- |
| OpenAI official SDK | Yes | `OpenAIProvider` adapter, service-side direct OpenAI calls, tests. | Central agent runtime, shared AGI schema definition. |
| OpenAI Responses API | Yes | Preferred native OpenAI path for modern models, reasoning, tool items, and multimodal work. | Provider-compatible proxies unless verified; Local mode cloud sends. |
| OpenAI Agents SDK | Limited | Research, prototypes, sandbox architecture study, optional hosted-agent experiments. | Core AGI engine, CLI runtime, cross-surface session model. |
| Anthropic official SDK | Yes | `AnthropicProvider` adapter transport, streaming, retries, error handling. | Core runtime or provider-neutral tool/session schema. |
| Anthropic Agent SDK | No by default | Compatibility research only. | AGI core, CLI core, migration-dependent runtime. |
| Vercel AI SDK Core | Yes, selectively | Web/Next.js streaming, structured output, tool streaming adapters. | Rust engine, CLI runtime, canonical event schema. |
| Vercel AI SDK UI | Maybe | Web chat UI helpers if wrapped behind AGI conversation state. | Replacing AGI synced conversation schema. |
| Vercel AI Gateway | Later | Explicit Managed mode, admin-enabled gateway experiments, fallback/budget studies. | Default BYOK, Local mode, privacy-sensitive developer sessions. |

## Architecture Rule

Use this layering:

```text
AGI UI surface
  -> AGI conversation/session/artifact schema
  -> AGI normalized event stream
  -> AGI provider adapter interface
  -> vendor SDK or direct HTTP transport
  -> provider API
```

Do not invert it into:

```text
UI surface
  -> Vercel/OpenAI/Anthropic agent runtime
  -> AGI tries to adapt afterward
```

That would make AGI dependent on another company's runtime semantics, pricing
decisions, persistence model, and privacy boundary.

## OpenAI-Specific Plan

1. Keep `packages/providers/openai` as the source of truth for OpenAI transport.
2. Upgrade/consolidate the `openai` package version across the monorepo after a
   focused compatibility pass.
3. Make `useResponsesApi` the preferred path for native `api.openai.com`
   models that need reasoning, native tools, or modern multimodal behavior.
4. Keep Chat Completions support for OpenAI-compatible providers such as xAI,
   DeepSeek, LM Studio, Perplexity, local vLLM/sglang, Azure-compatible
   deployments, and older proxy surfaces.
5. Keep `store: false` as the default for Local/BYOK privacy. Allow
   server-side `store: true` only in explicit managed/synced app chat modes.
6. Normalize Responses items into AGI `StreamChunk` and future AGI `ModelItem`
   types before exposing them to CLI/Desktop/Mobile/Web.

## Vercel-Specific Plan

1. Keep `apps/web/lib/ai-sdk/*` as the Web v2 streaming path.
2. Do not move Vercel AI SDK into `packages/llm-runtime` as the core runtime.
3. Add an adapter that converts AI SDK UI/data stream events into AGI's
   normalized event stream, so Web can share behavior with Desktop/Mobile.
4. Configure direct providers explicitly in BYOK mode. Do not rely on string
   model names that default to Vercel AI Gateway unless the mode is Managed.
5. If Gateway is added later, make it an explicit `ProviderMode::ManagedGateway`
   with UI labeling, consent, usage accounting, and admin policy controls.
6. Do not use Gateway BYOK fallback to system credentials in strict BYOK mode.

## Anthropic-Specific Plan

1. Keep `packages/providers/anthropic` wrapping `@anthropic-ai/sdk`.
2. Consolidate SDK versions across `apps/web` and `packages/providers/anthropic`
   after verifying stream type changes.
3. Keep Claude-compatible behavior at AGI's tool, permission, command, and MCP
   layers instead of coupling to Anthropic Agent SDK.
4. Continue using Anthropic docs and public behavior as parity references, but
   do not copy proprietary code, private prompts, unique UI strings, endpoint
   names, or telemetry names.

## Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Runtime lock-in | Agents SDKs encode vendor-specific agent loop semantics. | Use only behind experiments; AGI owns runtime. |
| Privacy leakage | Gateway BYOK or hosted state can silently move traffic outside expected boundary. | Require explicit mode labels, consent, and no fallback for strict BYOK. |
| Schema drift | AI SDK UI messages, OpenAI Responses items, and Anthropic Messages blocks differ. | Normalize into AGI-owned event/item schemas. |
| Version drift | Current repo has multiple OpenAI/Anthropic SDK versions. | Consolidate versions in one dependency-maintenance slice. |
| Proxy incompatibility | Responses features do not map to every OpenAI-compatible endpoint. | Feature-gate Responses by endpoint class and capability metadata. |
| Cost surprises | Native tools, server state, gateway fallbacks, and reasoning can change costs. | Attach provider, mode, usage, and consent metadata to every turn. |

## Immediate Implementation Tasks

1. Define `ProviderMode`: `Local`, `DirectByok`, `ManagedGateway`, `ManagedNative`.
2. Add a provider capability matrix for `responses`, `chatCompletions`,
   `reasoning`, `toolCalling`, `nativeTools`, `vision`, `fileInput`,
   `structuredOutput`, `serverState`, and `zdrCompatible`.
3. Make `packages/providers/openai` default to Responses for native OpenAI
   models when capability metadata says it is supported.
4. Add tests proving `store: false` remains default for Local/BYOK OpenAI turns.
5. Add tests proving Vercel AI Gateway is never selected unless provider mode is
   explicitly Managed.
6. Add an AI SDK event-to-AGI-event adapter for Web.
7. Consolidate `openai`, `@anthropic-ai/sdk`, and `ai` dependency versions after
   the adapter tests exist.

## Sources

- OpenAI SDKs and CLI: `https://developers.openai.com/api/docs/libraries`
- OpenAI Responses migration: `https://developers.openai.com/api/docs/guides/migrate-to-responses`
- OpenAI Sandbox Agents: `https://developers.openai.com/api/docs/guides/agents/sandboxes`
- Anthropic Client SDKs: `https://platform.claude.com/docs/en/api/client-sdks`
- Anthropic TypeScript SDK: `https://platform.claude.com/docs/en/api/sdks/typescript`
- Vercel AI SDK: `https://vercel.com/docs/ai-sdk`
- Vercel AI Gateway SDKs and APIs: `https://vercel.com/docs/ai-gateway/sdks-and-apis`
- Vercel AI Gateway BYOK: `https://vercel.com/docs/ai-gateway/authentication-and-byok/byok`
- Vercel AI Gateway models/providers: `https://vercel.com/docs/ai-gateway/models-and-providers`
