# Provider Capability Matrix

Status: Current
Owner: Provider/platform
Last updated: 2026-09-06

This matrix is the product contract for routing and UI labels. It records what AGI may claim in Local/BYOK/Managed modes. Provider SDK details can change; surfaces must read capability metadata instead of hardcoding provider assumptions.

Legend: `Yes` means AGI may expose the capability when provider credentials and model metadata allow it. `Partial` means model/endpoint-specific. `Managed only` means the capability must stay behind explicit Managed consent. `No claim` means AGI must not market or imply it without a provider/account contract.

| Route class                            | Responses           | Chat Completions | Reasoning      | Tools   | Native tools | Vision         | Files            | Structured output | Server state | ZDR compatibility                                                                                   |
| -------------------------------------- | ------------------- | ---------------- | -------------- | ------- | ------------ | -------------- | ---------------- | ----------------- | ------------ | --------------------------------------------------------------------------------------------------- |
| OpenAI native                          | Yes                 | Yes              | Partial        | Yes     | Partial      | Partial        | Partial          | Yes               | Partial      | No claim unless the account contract says so; Local/BYOK defaults keep `store: false`.              |
| Anthropic native                       | No                  | Yes              | Partial        | Yes     | Partial      | Partial        | Partial          | Yes               | Partial      | No claim unless the account contract says so; prompt-cache and retention settings must be explicit. |
| Google native                          | No                  | Yes              | Partial        | Yes     | Partial      | Partial        | Partial          | Partial           | Partial      | No claim unless the account contract says so.                                                       |
| xAI native                             | No                  | Yes              | Partial        | Yes     | Partial      | Partial        | Partial          | Partial           | No           | No claim unless the account contract says so.                                                       |
| OpenAI-compatible providers            | No                  | Yes              | Partial        | Partial | No           | Partial        | No               | Partial           | No           | No claim; strip unsupported Responses/native parameters.                                            |
| Vercel AI Gateway or AGI-managed proxy | Depends on upstream | Yes              | Partial        | Partial | Partial      | Partial        | Partial          | Partial           | Managed only | Managed only; never default for Local or strict BYOK.                                               |
| Local Ollama/LMStudio                  | No                  | Yes              | Model-specific | Partial | No           | Model-specific | Local files only | Partial           | Local only   | Local privacy boundary, not provider ZDR.                                                           |

The harness wiring behind these rules is generated into
[`docs/generated/provider-capability-matrix.md`](../generated/provider-capability-matrix.md).
Routing policy, privacy claims and the ZDR position stay here as prose; they
are not derivable from the catalog.

## Enforcement Rules

- Local and BYOK routes must default to no provider-side storage unless a user explicitly enables a provider feature that requires it.
- OpenAI native routes should prefer Responses only when capability metadata says the model and endpoint support it and privacy defaults are proven by tests.
- OpenAI-compatible providers must use Chat Completions-style payloads unless their metadata explicitly says otherwise.
- Native provider tools must be modeled separately from AGI tools so UI copy can say which system executes the action.
- File upload, generated-file, and Code Interpreter-style features must attach `ComputeSession`, `GeneratedFile`, and `ArtifactManifest` metadata before surfacing in Web/Desktop/Mobile.
- OpenAI Code Interpreter container-file citations are adapted in `@agiworkforce/providers-openai` only after caller-supplied file materialization provides URI, byte count, checksum, privacy mode, provider mode, storage scope, owner, and source context.
- Surfaces show capability labels from shared metadata; they do not infer capabilities from model-name substrings.

## Model identity and serving routes

A canonical model (`models.curation.json`) has one developer, resolved from
`catalog/developers.json`, and one or more serving routes compiled from
`model-routes.json`, `harnesses.json` and `gateways.json`. The developer answers
who trained the model; the route answers where a request executes, at what
price sheet, under which commercial status, data retention and cache class. A
host that serves other developers' models (Groq, OpenRouter, Cheaper Inference,
DeepInfra, Together, Novita, NVIDIA NIM) is never a developer, and Alibaba
Model Studio is the provider that serves Qwen alongside third-party models.

Routing order is fixed: workspace policy, commercial status, trust mode,
harness reachability, lifecycle stage, zero data retention and required
capabilities admit a route; only then do health, credentials and expected cost
rank the survivors. An explicit selection rotates through same-model routes
before any substitution; Auto may change both model and route. Managed traffic
admits models at lifecycle stage `registered` or later; a discovered upstream
model stays internal.

Prices, discounts, quotas and expiries are route metadata: a gateway discount
policy prices its routes at list minus the guaranteed minimum, a promotional
allocation is a quota pool with an expiry in `apps/web/config/free-pools.json`,
and an exhausted allocation is a routing event (`quota_exhausted`), never a
credential failure. The operator Routes tab renders all of it; the chat picker
shows the model, its developer and the routes that can serve it now.
