<!-- GENERATED FILE, do not edit.
     Source: packages/ai/model-registry/catalog/harnesses.json
     Render: node scripts/generate-doc-matrices.mjs
     Verify: pnpm check:doc-matrices -->

# Provider capability matrix

Rendered from `packages/ai/model-registry/catalog/harnesses.json`, 30 harnesses in 4 groups.

Each row is one provider route. The feature columns report what the catalog
says is **implemented** on that route, not what the provider is capable of.

Routing policy, privacy claims and the ZDR position are prose in
`docs/architecture/provider-routing.md`. This table only reports the wiring.

Legend: ✅ implemented · ◐ partial · - unwired · · planned

| Harness | Provider | API family | Trust modes | Group | applyPatch | codeExecution | computerUse | fileSearch | hostedShell | imageGeneration | mcp | memory | skills | toolDiscovery | webSearch | webSearchInjection | zeroDataRetentionOnRequest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `anthropic/messages` | anthropic | messages | managed_cloud, byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ✅ | ✅ | ,  |
| `cheaperinference-anthropic/messages` | cheaperinference_anthropic | messages | managed_cloud | managed-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `cheaperinference/chat-completions` | cheaperinference | chat_completions | managed_cloud | managed-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `deepseek-anthropic/messages` | deepseek_anthropic | messages | managed_cloud, byok | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `deepseek/chat-completions` | deepseek | chat_completions | managed_cloud, byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `google/embeddings` | google | embed_content | managed_cloud, byok | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `google/generate-content` | google | generate_content | managed_cloud, byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ✅ | ✅ | ,  |
| `google/media` | google | media | managed_cloud, byok | managed-media | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `groq/chat-completions` | groq | chat_completions | managed_cloud, byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `lmstudio/chat-completions` | lmstudio | chat_completions | local | local-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `managed-cloud/gateway` | managed_cloud | managed_gateway | managed_cloud | managed-media | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ✅ | ,  | ,  |
| `minimax/chat-completions` | minimax | chat_completions | managed_cloud, byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `mistral/chat-completions` | mistral | chat_completions | managed_cloud, byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `moonshot-anthropic/messages` | moonshot_anthropic | messages | managed_cloud, byok | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `moonshot/chat-completions` | moonshot | chat_completions | managed_cloud, byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `nvidia-nim/chat-completions` | nvidia_nim | chat_completions | byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `ollama/chat` | ollama | ollama_chat | local | local-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `open_router/media` | open_router | media | managed_cloud | managed-media | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `open-router/chat-completions` | open_router | chat_completions | byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ✅ |
| `open-router/chat-completions-managed` | open_router | chat_completions | managed_cloud, byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ✅ |
| `openai/chat-completions` | openai | chat_completions | managed_cloud, byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `openai/media` | openai | media | managed_cloud, byok | managed-media | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `openai/responses` | openai | responses | managed_cloud, byok | byok-text | - | - | - | - | - | - | - | - | - | - | ✅ | ✅ | ,  |
| `perplexity/chat-completions` | perplexity | chat_completions | managed_cloud, byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ✅ | ,  | ,  |
| `qwen/chat-completions` | qwen | chat_completions | managed_cloud, byok | byok-text | ,  | - | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | - | ,  | ,  |
| `runway/media` | runway | media | managed_cloud | managed-media | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `vercel_gateway/chat-completions` | vercel_gateway | chat_completions | byok | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `xai/chat-completions` | xai | chat_completions | managed_cloud, byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `zhipu-anthropic/messages` | zhipu_anthropic | messages | managed_cloud, byok | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
| `zhipu/chat-completions` | zhipu | chat_completions | managed_cloud, byok | byok-text | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  | ,  |
