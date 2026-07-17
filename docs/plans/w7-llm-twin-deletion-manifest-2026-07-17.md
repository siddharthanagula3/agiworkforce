# W7 LLM Twin-Deletion Manifest (founder-gated)

Status: Manifest only — NO deletions performed. Founder commit-sequencing
decision required before any item below is removed.
Owner: W7 desktop-engine-extraction lane
Last updated: 2026-07-17
Scope: the desktop LLM request/decode twins duplicated by the shared
`agiworkforce-llm` crate after c2a/c2b (decode) and c2c/c3 (request) plus the
c4 ManagedCloud decision. This manifest does NOT cover the broader ~201
copied-file inventory from the original extraction mapping — that
host-owned-file manifest remains an orchestrator deliverable.

Oracle gate: every entry below is guarded by
`apps/desktop/src-tauri/src/core/llm/tests/c2c_request_oracle.rs` (30/30) and
`tests/c2a_decode_oracle.rs` (26 fixtures). The oracles vendor their own
frozen copies of retired code, so deletion does not weaken them.

## A. Deletable NOW (retired, `#[allow(dead_code)]`, zero live callers)

| Item                                                                 | Location                                                  | Evidence                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OllamaRequest` struct                                               | `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs` | Retired by c2c; production builds via `build_ollama_chat_body` → crate serializers. Oracle holds a frozen verbatim copy (`old_ollama` module).                                                                                                             |
| `OllamaOptions` struct                                               | same file                                                 | Same.                                                                                                                                                                                                                                                      |
| `OllamaProvider::to_ollama_messages`                                 | same file                                                 | Same.                                                                                                                                                                                                                                                      |
| `parse_ollama_sse` + the `Provider::Ollama` arm of `parse_sse_event` | `apps/desktop/src-tauri/src/core/llm/sse_parser.rs`       | Retired by c2b; live Ollama decode goes through `decode_direct_stream` → crate `run_ollama_stream`. Byte-identity proven by the c2a oracle. Deleting the arm requires re-pointing it at the openai fallback or an unreachable marker (the match is total). |

NOT deletable in that file: `OllamaMessage` (still deserializes
`OllamaResponse` on the non-streaming path).

## B. NOT deletable — live FALLBACK arms (feature-gap conditional)

These are no longer twins-in-waiting; they are production fallbacks for
request shapes the crate cannot express. Deleting any of them silently drops
features. Each fallback predicate + a routing pin lives in the c2c oracle
(`*_inexpressible_shapes_fall_back_to_legacy`, `*_exotic_tool_schema_*`).

| Legacy arm                                     | Falls back for                                                                                                                                           | Unblock condition                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `AnthropicAdapter::adapt_request_legacy`       | output_config / response_format, explicit cache_control, server tools (typed defs), Document/Audio/Video parts, audio_output, background, continuity ids | Crate gains structured-output + server-tool + document support, or product drops them on desktop |
| `OpenAIAdapter::adapt_to_chat_completions_api` | output_config / response_format, OpenAI server tools, non-auto `image_url.detail`, image-less multimodal, audio                                          | Same class                                                                                       |
| `OpenAIAdapter::adapt_to_responses_api`        | output_config / response_format, server tools, per-tool `strict`, ALL multimodal, audio, background, previous_response_id/conversation_id                | Same class; multimodal needs a parity audit of the typed input-part shapes first                 |
| `GoogleAdapter::adapt_request_legacy`          | tool schemas the google normalizer would change (or `parametersJsonSchema` form), Audio/Video/Document parts                                             | Crate gains google schema normalization, or schemas are normalized upstream                      |

Note: no production `LLMRequest` construction site currently sets
output_config / response_format / cache_control / audio / background /
continuity / top_p / top_k / metadata / effort (audited 2026-07-16), so the
fallbacks are effectively cold except for server-tool names and exotic
multimodal — but "cold" is not "dead"; the adapter API allows them.

## C. Permanently retained (not twins)

| Item                                                                                                                                                                                        | Why it stays                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parse_sse_stream` / `parse_openai_sse` (+ `parse_sse_event` non-Ollama arms)                                                                                                               | c4 DECISION: ManagedCloud stays on the desktop decoder — the managed gateway envelope carries a per-chunk `credits` billing object the crate cannot represent. Pinned by `c4_pin_managed_cloud_credits_extraction_from_openai_shaped_sse`. Unblock: add a vendor-meta event to the crate, then revisit. |
| `tests/c2a_old_parser.rs`, oracle `old_ollama` module                                                                                                                                       | Frozen OLD-side copies that keep the parity oracles honest after deletion.                                                                                                                                                                                                                              |
| Desktop-side policy in the crate-path wrappers (model-id mapping, FIX-007 clamp, capability detection, prompt tool injection, vision gating, reasoning-effort + gemini-thinking resolution) | Deliberately caller-owned policy, not serialization twins.                                                                                                                                                                                                                                              |

## Suggested deletion sequence (when the founder gates open)

1. Section A items (one commit; rerun c2c + c2a oracles + full core::llm).
2. Re-audit Section B when the crate gains the missing features; flip each
   fallback pin to a parity test as its arm becomes deletable (the oracle
   fails loudly if a pin goes stale).
