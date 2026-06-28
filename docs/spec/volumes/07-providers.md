# Volume 07 — Providers & Abstraction

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 7)
Authority: `docs/current/byok-open-model-provider-strategy.md`, `packages/types/src/models.json`, `packages/types/src/provider-adapter.ts`

## Philosophy & Cloud/Local stance

Multi-provider neutrality is AGI's wedge: 15 providers in the catalog, one shared abstraction, no single-lab lock-in (`docs/strategy/02` §2). The non-negotiable rule (`byok-open-model-provider-strategy.md`) is that **a model name is not enough.** AGI treats every route as `provider + endpoint class + model id + capability metadata + pricing metadata + privacy/retention claim + runtime health` — because the same model from two providers can differ in context window, tool calling, structured output, reasoning format, modalities, latency, price, moderation, and retention.

Cloud/Local stance: providers fall into three classes (`byok-open-model-provider-strategy.md`) — direct frontier keys, hosted open-model clouds, and local runtimes (Ollama/LM Studio). In **BYOK**, requests carry the user's key directly to the provider; AGI must SSRF-guard any user-supplied base URL. In **Local**, the runtime adapter (Ollama/LM Studio) keeps execution on-device — never silently fall back to a cloud provider when local is offline; show install/run/upgrade guidance. In **Managed**, AGI-managed provider access routes through `services/api-gateway` under entitlement. Provider honesty is mandatory: if a route cannot call tools, do not show tool parity; if it cannot do vision, do not accept images; if retention is unknown, show "provider policy unknown."

## Binding rules

1. **Add providers through the provider abstraction; never scatter provider literals.** The adapter contract is `packages/types/src/provider-adapter.ts`.
2. **Auth shapes are per-provider.** Anthropic uses the official `@anthropic-ai/sdk` with `anthropic-beta` headers (and `X-API-Key` semantics) — **not** a Bearer token. Encode each provider's `AuthMethod` (`api-key`/`oauth`/`oauth-device-code`/`aws-signature`).
3. **BYOK base URLs pass an SSRF guard** before any request (block private/loopback/link-local/metadata addresses).
4. **Capability normalization is required per provider** (tools, parallel tools, JSON/schema, reasoning/thinking format, vision, image, audio, file upload, caching, server-side state, streaming format, usage reporting, pricing units, retention) — `byok-open-model-provider-strategy.md` Adapter Requirements.
5. **Custom providers go through the provider SDK / `customModel.ts`**, with a verified base URL and declared capabilities.
6. **Do not add an SDK dependency speculatively.** Add it only when an implemented path uses it, with provider-doc references (`byok-open-model-provider-strategy.md` Provider SDK Policy).
7. **Do not assume OpenAI-compatible means full OpenAI parity.** Gate each compatible route to the subset its docs confirm.
8. **Aggregators (OpenRouter, HF) must persist the actual upstream provider** when returned, and must be labeled as routed.

## Repository map

- `packages/types/src/models.json` — the 15-provider catalog (managed_cloud, openai, anthropic, google, xai, deepseek, qwen, moonshot, perplexity, zhipu, mistral, groq, nvidia_nim, open_router, runway) plus catalog-only definitions (together, fireworks, cerebras, deepinfra, cohere, ai21, sambanova, azure, bedrock, ollama) and per-provider `aliases`, `modelPrefixes`, `tokenMultiplier`, `defaultModel`, `taskRouting`.
- `packages/types/src/provider-adapter.ts` — the single `ProviderAdapter` interface: `AuthMethod`, `ChatRequest`, `StreamChunk`, and the optional cross-vendor hooks (`buildReplayPolicy`, `normalizeToolSchemas`, `wrapStreamFn`).
- `packages/types/src/customModel.ts` — `CustomModelConfig` (baseUrl, modelId, apiKeyRef, declared capabilities, connection status).
- `packages/providers/<vendor>/` — implementations: `anthropic` (official SDK + `anthropic-beta`), `openai`, `google` (REST for API-key Gemini), `deepseek`, `xai`, `perplexity`, `lmstudio`, `ollama`.
- `packages/llm-normalize/` — production-tested cross-vendor normalization feeding the adapter hooks.
- `services/api-gateway/src/mcp/mcpConfig.ts`, `services/signaling-server/src/index.ts` — server-side outbound guards (SSRF-relevant).

## Competitor notes

- **Claude & ChatGPT are single-lab** — multi-provider choice is a non-feature for them and a structural impossibility (`docs/strategy/01` §5). Their provider story is "our models only."
- **OpenAI** ships a stateful Responses API with provider-native tools (web search, file search, code interpreter, computer use, remote MCP, shell) — AGI must not assume hosted open-model routes expose the same; gate per provider (`byok-open-model-provider-strategy.md`).
- **AGI divergence:** AGI is the neutral application layer over _any_ capable route — direct keys, hosted open clouds, or local runtimes — with honest per-route capability labels. Neutral aggregators (OpenRouter/HF) are explicitly not conflicted out; treat them as routed providers and persist the real upstream (`docs/strategy/01` §5, `byok-open-model-provider-strategy.md`).

## Checklists

### Add/extend a provider (build)

- [ ] Provider entered in `models.json` with aliases, prefixes, defaultPricing, and (if applicable) a `defaultModel`.
- [ ] Adapter implements `ProviderAdapter` (`provider-adapter.ts`); no provider literals leak into surfaces.
- [ ] Correct `AuthMethod` encoded (e.g., Anthropic = SDK + `anthropic-beta` headers, not Bearer).
- [ ] Capability normalizer covers tools/JSON/reasoning/vision/audio/files/caching/usage for this provider.
- [ ] Pricing units and retention/ZDR claim recorded with a source URL + checked date.
- [ ] No SDK added unless an implemented path uses it (with doc references).

### Security review (BYOK / custom providers)

- [ ] User-supplied base URL passes the SSRF guard (private/loopback/link-local/`169.254.x.x`/metadata blocked).
- [ ] BYOK keys never transit AGI servers; stored only in the OS keystore (Vol 25/30).
- [ ] Custom provider declares capabilities; AGI does not show parity it cannot verify.
- [ ] Aggregator routes persist the actual upstream provider and are labeled as routed.

### Honesty/capability review

- [ ] Tool UI hidden for routes that cannot call tools.
- [ ] Image input rejected for non-vision routes.
- [ ] "Provider policy unknown" shown when retention is unverified.
- [ ] Quantized/moderated/aggregated routes are labeled.
- [ ] Local runtime offline → install/run/upgrade guidance, never a silent cloud fallback.

### Per-surface

- [ ] Desktop BYOK selector groups: direct keys / open-model clouds / local runtimes / managed.
- [ ] Web exposes no BYOK provider keys (Vol 3).
- [ ] CLI local discovery (Ollama/LM Studio) works without an account.

## Definition of Done

The provider layer is "production-ready" when: the provider is in `models.json` with full capability + pricing + retention metadata; the adapter implements the shared contract with the correct per-provider auth shape; BYOK base URLs are SSRF-guarded; capabilities are normalized and honestly surfaced (no faked parity); aggregators persist the real upstream; provider-contract tests pass for the provider (Vol 32); and no provider literal is scattered outside the abstraction.

## Anti-patterns

- Using a Bearer token for Anthropic instead of the SDK + `anthropic-beta` header shape.
- Treating "OpenAI-compatible" as full OpenAI parity (tools/files/reasoning often differ).
- Scattering provider `if` branches across surfaces instead of one adapter per provider.
- Skipping the SSRF guard on a user-supplied base URL.
- Inventing or hardcoding a model ID instead of reading `models.json` (Operating Law 2).
- Silently falling back from a Local runtime to a cloud provider when local is offline.
- Adding an SDK dependency "to be ready" with no code path using it.
