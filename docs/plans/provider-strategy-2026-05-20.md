# Provider Strategy — Multi-LLM Market

Date: 2026-05-20

## Recommendation

AGI Workforce should treat the next provider cycle as an access-layer and onboarding project, not a logo-collection project.

First wave:

- OpenRouter as a first-class router provider.
- Groq as the speed-first free-start provider.
- Mistral direct as the first-class missing model family.
- Azure OpenAI / Foundry Models as a guided enterprise connector.
- Amazon Bedrock as a guided enterprise connector.

Preset wave:

- Together AI, Fireworks AI, and Hugging Face Inference Providers as OpenAI-compatible endpoint presets.
- Cohere stays optional.
- Replicate stays deprioritized for chat-first workflows.

## Primary-Source Ground Truth

- OpenRouter documents schemas that are very similar to the OpenAI Chat API and normalizes across providers: https://openrouter.ai/docs/api-reference/overview
- Groq documents OpenAI-compatible setup with `https://api.groq.com/openai/v1`: https://console.groq.com/docs/openai
- Mistral exposes `https://api.mistral.ai/v1/chat/completions`: https://docs.mistral.ai/api
- Together documents OpenAI REST/SDK compatibility with `https://api.together.ai/v1`: https://docs.together.ai/docs/inference/openai-compatibility
- Fireworks documents OpenAI SDK compatibility with `https://api.fireworks.ai/inference/v1`: https://docs.fireworks.ai/tools-sdks/openai-compatibility
- Hugging Face Inference Providers document a chat-only OpenAI-compatible endpoint at `https://router.huggingface.co/v1`: https://huggingface.co/docs/inference-providers/index
- Azure Foundry/OpenAI v1 uses resource endpoints and `/openai/v1/...`, so it needs endpoint/deployment/auth setup rather than only a generic base URL: https://learn.microsoft.com/en-us/azure/foundry/openai/latest
- Bedrock supports multiple runtime API families, including Converse and OpenAI-compatible Chat Completions/Responses, and needs AWS region/auth/model setup: https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html

## Implemented Foundation

- Added shared provider onboarding metadata in `packages/types/src/provider-presets.ts`.
- Exported provider presets from `@agiworkforce/types`.
- Added tests locking first-wave, preset-wave, goal recommendations, and Azure/Bedrock enterprise setup behavior.
- Pre-registered CLI OpenAI-compatible endpoints for OpenRouter, Groq, Together, Fireworks, and Hugging Face.
- Fixed Desktop BYOK key list to use canonical `open_router` instead of `openrouter`.
- Added Desktop BYOK rows for Groq, Together, Fireworks, and optional Cohere.
- Updated Web and Desktop custom endpoint presets to derive common OpenAI-compatible hosts from `provider-presets.ts`.
- Updated api-gateway provider health defaults to the current Together endpoint.
- Expanded the Web AI configuration provider list only where catalog-backed model choices exist today: Mistral and OpenRouter.
- Added a shared provider-stream runtime allowlist for Anthropic, OpenAI, Google, Ollama, xAI, DeepSeek, OpenRouter, Groq, Mistral, Together, and Fireworks.
- Added api-gateway OpenAI-compatible preset adapters for xAI, DeepSeek, OpenRouter, Groq, Mistral, Together, and Fireworks using the shared preset metadata.
- Expanded Web, Mobile, Chrome, and VS Code provider-stream client typing/inference to match the shared runtime allowlist.
- Populated catalog picker presets for existing Mistral and OpenRouter model entries.

## System Design

Provider setup should be split into three layers:

1. Shared preset metadata:
   - Source: `packages/types/src/provider-presets.ts`
   - Owns labels, docs links, endpoint presets, onboarding-goal rankings, rollout priority, privacy notes, and enterprise setup fields.

2. Runtime adapters:
   - Native: Anthropic, Google, Ollama, Azure, Bedrock where protocol/auth requires special handling.
   - OpenAI-compatible: OpenAI, xAI, DeepSeek, Qwen, Moonshot, Zhipu, Mistral, OpenRouter, Groq, Together, Fireworks, Hugging Face.
   - Optional later: Cohere native.

3. Surface onboarding:
   - Goal-first chooser: Start free, Best for coding, Fastest responses, Enterprise account, Local/offline, Broadest catalog.
   - Provider cards derive from shared preset metadata.
   - Custom URL remains an advanced escape hatch, not the primary path for common hosts.

## Remaining Work

- Populate `models.json` model entries for Groq, Together, Fireworks, Azure, Bedrock, and optional Cohere before surfacing them in catalog-driven model pickers.
- Decide whether Hugging Face becomes a canonical `Provider` or remains a custom endpoint preset.
- Add visual provider-management cards that consume `provider-presets.ts` directly instead of surface-local copy.
- Add OpenRouter model browser, free-model badge, routing/fallback controls, and privacy/provider routing controls.
- Build Azure setup wizard: endpoint, deployment/model, API version, API key or Entra ID.
- Build Bedrock setup wizard: region, model ID or inference profile, credentials/role auth, and Converse/OpenAI-compatible mode.
- Add native runtime adapters for Azure, Bedrock, and optional Cohere; do not fake these as flat API-key-only OpenAI-compatible rows.
