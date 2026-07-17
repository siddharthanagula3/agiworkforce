//! c2c OLD-vs-NEW request-body identity oracle (rust-engine-extraction plan,
//! stage c2c; the request-side mirror of `c2a_decode_oracle`).
//!
//! Compares, per provider, the request body the desktop sent BEFORE the c2c
//! serializer switch against the body the shared `agiworkforce-llm` crate
//! serializers produce for the same logical request, and holds the two to
//! BYTE-FOR-BYTE identity of their canonical JSON (recursively key-sorted —
//! JSON object member order is not semantic on any provider wire) modulo the
//! declared [`Delta`] set. Exactly like c2a: every declared delta is a
//! machine-verified structural transformation (never comparison loosening), a
//! declared delta that does not fire FAILS the fixture (stale-exception
//! detection), and any divergence residue not covered by a declared delta
//! fails with a canonical diff.
//!
//! Per-provider status encoded by this oracle (2026-07-16):
//!
//! - **ollama — PROVEN + SWITCHED.** Production (`providers/ollama.rs`, both
//!   send paths) now builds `/api/chat` bodies through the shared crate
//!   serializers (`build_ollama_chat_body`). OLD side here is a frozen
//!   verbatim copy of the retired local `OllamaRequest` builder
//!   ([`old_ollama`]). Deltas: `OllamaImagesPerMessage` (the old builder sent
//!   a TOP-LEVEL `images` field, which Ollama's `/api/chat` ignores — a real
//!   desktop vision bug; the crate emits them per-message, the documented
//!   native format), `OllamaAssistantEmptyContent`, `OllamaZeroNumPredict`,
//!   `OllamaNonObjectToolArgs` (all crate-side hardening, each pinned below).
//!   NOTE: the crate's `compact_ollama_message_values` system-prompt
//!   compaction is deliberately NOT applied on the desktop path (the desktop
//!   never compacted; adopting it is a separate product decision).
//!
//! - **anthropic / openai / openai-responses / gemini — DOCUMENTED, NOT
//!   switched.** OLD side is the live production adapter
//!   (`ProviderAdapterFactory::create_adapter(..).adapt_request(..)`); NEW
//!   side is the crate's pure body builder. Byte-parity is proven here for
//!   the covered common feature surface modulo the enumerated deltas, but the
//!   desktop stays on its adapters because the two sides are not yet
//!   feature-equivalent:
//!     CRATE GAPS (must be fixed before any switch):
//!       * anthropic: keeps `temperature` alongside `thinking` (Anthropic
//!         400s any temperature != 1 with thinking) and has no
//!         max_tokens-vs-thinking-budget floor (`ThinkingKeepsTemperature`,
//!         `ThinkingMaxTokensFloor`);
//!       * openai: no `items:{}` normalization for array tool schemas
//!         (OpenAI rejects with `invalid_function_parameters`;
//!         `ArrayItemsNormalized`) and no `image_url.detail` support;
//!       * openai-responses: no `reasoning.effort` support at all;
//!       * gemini: always sends `generationConfig.maxOutputTokens`, emitting
//!         a literal `0` when the caller has no cap (`AlwaysMaxOutputTokens`)
//!         and has no `thinkingConfig` support
//!       (pinned by `crate_builders_cannot_express_desktop_features`).
//!     DESKTOP-ONLY FEATURES the crate cannot express (caller-level or
//!     future crate API): tool_choice, output_config/response_format, effort,
//!     top_p/top_k, metadata, server tools, audio, background,
//!     previous_response_id, catalog model-id mapping (`get_api_model_id`),
//!     and the FIX-007 max-tokens clamp.
//!     CRATE-SIDE FIXES the desktop would GAIN by switching (pinned as
//!     deltas/divergence tests): anthropic prompt-cache breakpoints (system /
//!     tools / last-message), openai `stream_options.include_usage`, correct
//!     openai chat-completions tool history (the desktop adapter DROPS
//!     assistant `tool_calls` and `tool_call_id` — see
//!     `openai_chat_tool_history_divergence`), and correct gemini
//!     functionResponse role/name (see `gemini_tool_result_divergence`).
//!
//! Model ids in fixtures are deliberately NON-CATALOG so the desktop's
//! catalog model-id mapping (`get_api_model_id`, `get_canonicalized_id`) is
//! the identity and the oracle does not drift with `models.json` edits. The
//! desktop maps catalog ids to wire ids before serialization; the crate
//! expects wire ids from its caller (the CLI already passes them) — a caller
//! contract, not serializer drift.

use serde_json::{Value, json};

use crate::core::llm::provider_adapter::ProviderAdapterFactory;
use crate::core::llm::providers::ollama::build_ollama_chat_body;
use crate::core::llm::{
    ChatMessage, ContentPart, ImageDetail, ImageFormat, ImageInput, LLMRequest, Provider,
    ThinkingParameter, ToolCall, ToolChoice, ToolDefinition,
};

// ---------------------------------------------------------------------------
// OLD side for ollama: frozen verbatim copy of the pre-c2c builder
// ---------------------------------------------------------------------------

/// Verbatim vendored copy of the desktop Ollama request builder as it ran
/// before the c2c switch (`providers/ollama.rs` on this branch prior to
/// 2026-07-16): the `OllamaRequest`/`OllamaOptions`/`OllamaMessage` structs,
/// `to_ollama_messages`, `resolve_ollama_think`, and the inline construction
/// shared by `send_message` (stream=false) and `send_message_streaming`
/// (stream=true). Frozen here so the oracle keeps its teeth after the
/// founder-gated deletion of the retired production twins.
mod old_ollama {
    use serde::Serialize;

    use crate::core::llm::{ChatMessage, LLMRequest, ThinkingParameter, ToolDefinition};

    #[derive(Debug, Clone, Serialize)]
    struct OllamaMessage {
        role: String,
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_calls: Option<Vec<serde_json::Value>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_call_id: Option<String>,
    }

    #[derive(Debug, Clone, Serialize)]
    struct OllamaRequest {
        model: String,
        messages: Vec<OllamaMessage>,
        #[serde(skip_serializing_if = "Option::is_none")]
        stream: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        options: Option<OllamaOptions>,
        #[serde(skip_serializing_if = "Option::is_none")]
        images: Option<Vec<String>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        tools: Option<Vec<serde_json::Value>>,
        #[serde(skip_serializing_if = "Option::is_none")]
        think: Option<bool>,
    }

    #[derive(Debug, Clone, Serialize)]
    struct OllamaOptions {
        #[serde(skip_serializing_if = "Option::is_none")]
        temperature: Option<f32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        num_predict: Option<u32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        num_ctx: Option<u32>,
    }

    const OLLAMA_DEFAULT_NUM_CTX: u32 = 32768;

    fn resolve_ollama_think(thinking: Option<&ThinkingParameter>) -> Option<bool> {
        match thinking {
            Some(ThinkingParameter::Enabled(enabled)) => Some(*enabled),
            Some(_) => Some(true),
            None => None,
        }
    }

    fn to_ollama_messages(messages: &[ChatMessage]) -> Vec<OllamaMessage> {
        messages
            .iter()
            .map(|m| {
                let tool_calls = m.tool_calls.as_ref().map(|calls| {
                    calls
                        .iter()
                        .map(|tc| {
                            let args: serde_json::Value = serde_json::from_str(&tc.arguments)
                                .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
                            serde_json::json!({
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": args
                                }
                            })
                        })
                        .collect()
                });
                OllamaMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                    tool_calls,
                    tool_call_id: m.tool_call_id.clone(),
                }
            })
            .collect()
    }

    fn old_tools_json(tools: &[ToolDefinition]) -> Vec<serde_json::Value> {
        tools
            .iter()
            .map(|tool| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters
                    }
                })
            })
            .collect()
    }

    /// The exact pre-c2c body: the struct construction shared by both send
    /// paths, with `tools`/`images` already caller-gated exactly as today
    /// (capability detection and vision gating were NOT part of the switch).
    pub fn build(
        request: &LLMRequest,
        effective_messages: &[ChatMessage],
        tools: Option<&[ToolDefinition]>,
        images: Option<Vec<String>>,
        stream: bool,
    ) -> serde_json::Value {
        let ollama_request = OllamaRequest {
            model: request.model.clone(),
            messages: to_ollama_messages(effective_messages),
            stream: Some(stream),
            options: Some(OllamaOptions {
                temperature: request.temperature,
                num_predict: request.max_tokens,
                num_ctx: Some(OLLAMA_DEFAULT_NUM_CTX),
            }),
            images,
            tools: tools.map(old_tools_json),
            think: resolve_ollama_think(request.thinking.as_ref()),
        };
        serde_json::to_value(&ollama_request).expect("old OllamaRequest serializes")
    }
}

// ---------------------------------------------------------------------------
// Canonicalization + delta machinery
// ---------------------------------------------------------------------------

/// Recursively key-sort every object so canonical serialization is
/// deterministic regardless of `serde_json` map backing or insertion order.
fn canonicalize(v: &Value) -> Value {
    match v {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let mut sorted = serde_json::Map::new();
            for k in keys {
                sorted.insert(k.clone(), canonicalize(&map[k]));
            }
            Value::Object(sorted)
        }
        Value::Array(items) => Value::Array(items.iter().map(canonicalize).collect()),
        other => other.clone(),
    }
}

fn canonical_json(v: &Value) -> String {
    canonicalize(v).to_string()
}

/// Every way a NEW (crate-serialized) request body is allowed to differ from
/// the OLD (desktop-twin) body. Each variant is a precise machine-checked
/// transformation; anything outside the fixture's declared list fails.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Delta {
    // ---- ollama (PROVEN + switched) ----
    /// Old sent a TOP-LEVEL `images` array (ignored by `/api/chat` — desktop
    /// vision bug); new attaches the EXACT same base64 payloads to the last
    /// user message (Ollama's documented native format). Fix, not a drop.
    OllamaImagesPerMessage,
    /// Old always serialized `content` (`""` on tool-call-only assistant
    /// turns); new omits the empty string. Ollama treats both identically.
    OllamaAssistantEmptyContent,
    /// Old forwarded `max_tokens: Some(0)` as a pathological `num_predict: 0`
    /// (a zero-token cap); new omits it so Ollama's default applies.
    OllamaZeroNumPredict,
    /// Old passed valid-JSON-but-non-object tool-call arguments (e.g. `5`)
    /// through verbatim; new hardens them to `{}` (mirrors the c2a decode-side
    /// invalid-args policy — Ollama 400s non-object arguments).
    OllamaNonObjectToolArgs,
    // ---- anthropic (documented) ----
    /// New adds the crate's last-message prompt-cache breakpoint. Validated
    /// by applying the crate's own exported `add_message_cache_breakpoint` to
    /// the OLD messages and requiring the result to equal NEW's.
    MessageCacheBreakpoint,
    /// Old sends `system` as a plain string; new sends the crate's cached
    /// block form (env-marker split, or a single cached block). Validated by
    /// recomputing the documented split rule from OLD's string.
    SystemPromptCached,
    /// New marks the LAST tool with `cache_control: {type: ephemeral}`.
    ToolsCacheControl,
    /// New serializes `is_error: false` on tool_result blocks; old's
    /// plain-text path omitted the field (Anthropic defaults it to false).
    ToolResultIsErrorField,
    /// CRATE GAP: with `thinking` enabled the desktop removes `temperature`
    /// (Anthropic 400s temperature != 1 with thinking); the crate keeps it.
    ThinkingKeepsTemperature,
    /// CRATE GAP: the desktop floors `max_tokens` to `budget + 1024` when
    /// thinking is enabled (the API requires headroom); the crate sends the
    /// caller's value verbatim.
    ThinkingMaxTokensFloor,
    // ---- shared ----
    /// A desktop-only top-level key the crate cannot express (tool_choice,
    /// top_p, ...). Removed from OLD after asserting NEW truly lacks it.
    DesktopOnlyKey(&'static str),
    // ---- openai-compat (documented) ----
    /// New requests usage on the final SSE chunk
    /// (`stream_options: {include_usage: true}`); old never did (the old
    /// chat-completions stream simply carried no usage).
    StreamOptionsIncludeUsage,
    /// CRATE GAP: old normalizes array tool schemas by inserting `items: {}`
    /// (OpenAI rejects arrays without `items`); new passes schemas verbatim.
    /// Validated by applying the same normalization rule to NEW's tools.
    ArrayItemsNormalized,
    /// Old emits `image_url.detail` on vision parts; the crate has no detail
    /// support (OpenAI defaults to `auto`, the fixture's value).
    ImageDetailField,
    // ---- openai-responses (documented) ----
    /// Old collapses a single text-only user turn to the compact string
    /// `input`; new always sends typed input items.
    CompactSingleTurnInput,
    /// New sends message text as typed `input_text` part arrays; old sends
    /// the plain string. Validated by concatenating NEW's part texts.
    TypedTextParts,
    // ---- gemini (documented) ----
    /// CRATE GAP: new always emits `generationConfig.maxOutputTokens`,
    /// including a literal `0` when the caller has no cap; old omits it.
    AlwaysMaxOutputTokens,
}

/// Apply one delta. Returns whether it fired; panics if the structural claim
/// it makes about the divergence is violated.
#[allow(clippy::too_many_lines)]
fn apply_delta(name: &str, delta: Delta, old: &mut Value, new: &mut Value) -> bool {
    match delta {
        Delta::OllamaImagesPerMessage => {
            let Some(old_images) = old.get("images").cloned() else {
                return false;
            };
            assert!(
                new.get("images").is_none(),
                "[{name}] new body must not carry a top-level images field"
            );
            let new_msgs = new["messages"]
                .as_array()
                .expect("new body has a messages array");
            let carriers: Vec<usize> = new_msgs
                .iter()
                .enumerate()
                .filter(|(_, m)| m.get("images").is_some())
                .map(|(i, _)| i)
                .collect();
            assert_eq!(
                carriers.len(),
                1,
                "[{name}] exactly one new message must carry the images"
            );
            let idx = carriers[0];
            let last_user = new_msgs
                .iter()
                .rposition(|m| m["role"] == "user")
                .expect("a user message exists");
            assert_eq!(
                idx, last_user,
                "[{name}] images must ride on the LAST user message"
            );
            assert_eq!(
                new_msgs[idx]["images"], old_images,
                "[{name}] per-message images must be the exact base64 payloads the old \
                 builder sent top-level"
            );
            old.as_object_mut().unwrap().remove("images");
            new["messages"][idx].as_object_mut().unwrap().remove("images");
            true
        }
        Delta::OllamaAssistantEmptyContent => {
            let old_msgs = old["messages"].as_array().cloned().unwrap_or_default();
            let new_msgs = new["messages"].as_array_mut().expect("messages array");
            assert_eq!(
                old_msgs.len(),
                new_msgs.len(),
                "[{name}] message counts must align"
            );
            let mut fired = false;
            for (o, n) in old_msgs.iter().zip(new_msgs.iter_mut()) {
                if o["role"] == "assistant"
                    && o["content"] == ""
                    && o.get("tool_calls").is_some()
                    && n.get("content").is_none()
                {
                    assert_eq!(n["role"], "assistant", "[{name}] aligned roles");
                    n["content"] = json!("");
                    fired = true;
                }
            }
            fired
        }
        Delta::OllamaZeroNumPredict => {
            if old.pointer("/options/num_predict") != Some(&json!(0)) {
                return false;
            }
            assert!(
                new.pointer("/options/num_predict").is_none(),
                "[{name}] new must omit a zero num_predict, not send it"
            );
            old["options"].as_object_mut().unwrap().remove("num_predict");
            true
        }
        Delta::OllamaNonObjectToolArgs => {
            let new_msgs = new["messages"].as_array().cloned().unwrap_or_default();
            let old_msgs = old["messages"].as_array_mut().expect("messages array");
            let mut fired = false;
            for (o, n) in old_msgs.iter_mut().zip(new_msgs.iter()) {
                let Some(old_tcs) = o.get_mut("tool_calls").and_then(Value::as_array_mut) else {
                    continue;
                };
                let new_tcs = n["tool_calls"].as_array().cloned().unwrap_or_default();
                assert_eq!(old_tcs.len(), new_tcs.len(), "[{name}] tool_call counts");
                for (otc, ntc) in old_tcs.iter_mut().zip(new_tcs.iter()) {
                    let old_args = &otc["function"]["arguments"];
                    if !old_args.is_object() {
                        assert_eq!(
                            ntc["function"]["arguments"],
                            json!({}),
                            "[{name}] new must harden non-object args {old_args} to {{}}"
                        );
                        otc["function"]["arguments"] = json!({});
                        fired = true;
                    }
                }
            }
            fired
        }
        Delta::MessageCacheBreakpoint => {
            let mut transformed = old["messages"].as_array().cloned().unwrap_or_default();
            agiworkforce_llm::serialize::add_message_cache_breakpoint(&mut transformed);
            let transformed = Value::Array(transformed);
            let fired = transformed != old["messages"];
            assert_eq!(
                canonical_json(&transformed),
                canonical_json(&new["messages"]),
                "[{name}] new messages must equal the crate's own \
                 add_message_cache_breakpoint applied to the old messages"
            );
            old["messages"] = new["messages"].clone();
            fired
        }
        Delta::SystemPromptCached => {
            let Some(old_sys) = old.get("system").and_then(Value::as_str).map(str::to_string)
            else {
                return false;
            };
            // Recompute the crate's documented rule from OLD's plain string:
            // split at the last <environment> marker into a cached head + raw
            // tail; no marker (or empty head) degrades as documented.
            let expected = if let Some(pos) = old_sys.rfind("<environment>") {
                let (head, tail) = old_sys.split_at(pos);
                let head_trimmed = head.trim_end();
                if head_trimmed.is_empty() {
                    json!(old_sys)
                } else {
                    json!([
                        {"type": "text", "text": head_trimmed,
                         "cache_control": {"type": "ephemeral"}},
                        {"type": "text", "text": tail}
                    ])
                }
            } else {
                json!([{"type": "text", "text": old_sys,
                        "cache_control": {"type": "ephemeral"}}])
            };
            assert_eq!(
                canonical_json(&expected),
                canonical_json(&new["system"]),
                "[{name}] new system must be the cached-block form of old's string"
            );
            old["system"] = new["system"].clone();
            true
        }
        Delta::ToolsCacheControl => {
            let Some(new_tools) = new.get_mut("tools").and_then(Value::as_array_mut) else {
                return false;
            };
            let Some(last) = new_tools.last_mut() else {
                return false;
            };
            let marker = last.as_object_mut().unwrap().remove("cache_control");
            assert_eq!(
                marker,
                Some(json!({"type": "ephemeral"})),
                "[{name}] new's last tool must carry the ephemeral cache marker"
            );
            true
        }
        Delta::ToolResultIsErrorField => {
            let mut fired = false;
            if let Some(msgs) = new["messages"].as_array_mut() {
                for m in msgs {
                    let Some(blocks) = m.get_mut("content").and_then(Value::as_array_mut) else {
                        continue;
                    };
                    for b in blocks {
                        if b["type"] == "tool_result" {
                            let removed = b.as_object_mut().unwrap().remove("is_error");
                            assert_eq!(
                                removed,
                                Some(json!(false)),
                                "[{name}] only an explicit is_error:false may be dropped \
                                 (true would be a REAL divergence)"
                            );
                            fired = true;
                        }
                    }
                }
            }
            fired
        }
        Delta::ThinkingKeepsTemperature => {
            assert!(
                old.get("thinking").is_some() && new.get("thinking").is_some(),
                "[{name}] delta only applies to thinking requests"
            );
            assert!(
                old.get("temperature").is_none(),
                "[{name}] old must have removed temperature under thinking"
            );
            let removed = new.as_object_mut().unwrap().remove("temperature");
            assert!(
                removed.is_some(),
                "[{name}] new was expected to (wrongly) keep temperature — crate gap \
                 closed? delete this delta and re-evaluate the switch gate"
            );
            true
        }
        Delta::ThinkingMaxTokensFloor => {
            let budget = new
                .pointer("/thinking/budget_tokens")
                .and_then(Value::as_u64)
                .expect("thinking budget present");
            let old_max = old["max_tokens"].as_u64().expect("old max_tokens");
            let new_max = new["max_tokens"].as_u64().expect("new max_tokens");
            assert_eq!(
                old_max,
                budget + 1024,
                "[{name}] old must floor max_tokens to budget + 1024"
            );
            assert!(
                new_max < old_max,
                "[{name}] delta only fires when the caller's cap was below the floor"
            );
            old["max_tokens"] = new["max_tokens"].clone();
            true
        }
        Delta::DesktopOnlyKey(key) => {
            assert!(
                new.get(key).is_none(),
                "[{name}] {key} is declared desktop-only but new carries it — crate \
                 support landed? delete this delta"
            );
            old.as_object_mut().unwrap().remove(key).is_some()
        }
        Delta::StreamOptionsIncludeUsage => {
            let removed = new.as_object_mut().unwrap().remove("stream_options");
            assert_eq!(
                removed,
                Some(json!({"include_usage": true})),
                "[{name}] new's stream_options must be exactly include_usage"
            );
            assert!(
                old.get("stream_options").is_none(),
                "[{name}] old never sent stream_options"
            );
            true
        }
        Delta::ArrayItemsNormalized => {
            fn normalize(schema: &mut Value) -> bool {
                let mut changed = false;
                match schema {
                    Value::Object(map) => {
                        if map.get("type").and_then(Value::as_str) == Some("array")
                            && !map.contains_key("items")
                        {
                            map.insert("items".to_string(), json!({}));
                            changed = true;
                        }
                        for v in map.values_mut() {
                            changed |= normalize(v);
                        }
                    }
                    Value::Array(items) => {
                        for v in items {
                            changed |= normalize(v);
                        }
                    }
                    _ => {}
                }
                changed
            }
            let Some(tools) = new.get_mut("tools") else {
                return false;
            };
            normalize(tools)
        }
        Delta::ImageDetailField => {
            let mut fired = false;
            if let Some(msgs) = old["messages"].as_array_mut() {
                for m in msgs {
                    let Some(parts) = m.get_mut("content").and_then(Value::as_array_mut) else {
                        continue;
                    };
                    for p in parts {
                        if p["type"] == "image_url" {
                            let removed = p["image_url"].as_object_mut().unwrap().remove("detail");
                            assert!(
                                removed.is_some(),
                                "[{name}] old image parts carry a detail field"
                            );
                            fired = true;
                        }
                    }
                }
            }
            fired
        }
        Delta::CompactSingleTurnInput => {
            let Some(old_input) = old.get("input").and_then(Value::as_str).map(str::to_string)
            else {
                return false;
            };
            let new_input = new["input"].as_array().expect("new input is items");
            assert_eq!(new_input.len(), 1, "[{name}] single-turn input");
            assert_eq!(new_input[0]["role"], "user");
            assert_eq!(
                new_input[0]["content"], old_input,
                "[{name}] the typed item must carry the exact old compact string"
            );
            old["input"] = new["input"].clone();
            true
        }
        Delta::TypedTextParts => {
            let old_items = old["input"].as_array().cloned().unwrap_or_default();
            let new_items = new["input"].as_array_mut().expect("input items");
            assert_eq!(old_items.len(), new_items.len(), "[{name}] item counts");
            let mut fired = false;
            for (o, n) in old_items.iter().zip(new_items.iter_mut()) {
                let (Some(old_text), Some(parts)) =
                    (o.get("content").and_then(Value::as_str), n.get("content").and_then(Value::as_array))
                else {
                    continue;
                };
                let folded: String = parts
                    .iter()
                    .map(|p| {
                        assert_eq!(p["type"], "input_text", "[{name}] typed text part");
                        p["text"].as_str().unwrap_or_default().to_string()
                    })
                    .collect();
                assert_eq!(
                    folded, old_text,
                    "[{name}] concatenated typed parts must equal old's plain string"
                );
                n["content"] = json!(old_text);
                fired = true;
            }
            fired
        }
        Delta::AlwaysMaxOutputTokens => {
            if new.pointer("/generationConfig/maxOutputTokens") != Some(&json!(0)) {
                return false;
            }
            assert!(
                old.pointer("/generationConfig/maxOutputTokens").is_none(),
                "[{name}] old omits maxOutputTokens when the caller has no cap"
            );
            new["generationConfig"]
                .as_object_mut()
                .unwrap()
                .remove("maxOutputTokens");
            true
        }
    }
}

/// The core check: apply every declared delta (each must fire), then require
/// canonical byte-equality. Declared order matters where deltas compose (e.g.
/// anthropic `ToolResultIsErrorField` before `MessageCacheBreakpoint`).
fn verify_parity(name: &str, mut old: Value, mut new: Value, deltas: &[Delta]) {
    for delta in deltas {
        let fired = apply_delta(name, *delta, &mut old, &mut new);
        assert!(
            fired,
            "[{name}] declared delta {delta:?} did not fire (stale exception)"
        );
    }
    let (o, n) = (canonical_json(&old), canonical_json(&new));
    assert_eq!(
        o, n,
        "[{name}] UNEXPLAINED request-body divergence after declared deltas \
         {deltas:?}\n  OLD: {o}\n  NEW: {n}"
    );
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

fn msg(role: &str, content: &str) -> ChatMessage {
    ChatMessage {
        role: role.to_string(),
        content: content.to_string(),
        tool_calls: None,
        tool_call_id: None,
        multimodal_content: None,
    }
}

fn assistant_tool_call_msg(content: &str, id: &str, tool: &str, args: &str) -> ChatMessage {
    ChatMessage {
        tool_calls: Some(vec![ToolCall {
            id: id.to_string(),
            name: tool.to_string(),
            arguments: args.to_string(),
        }]),
        ..msg("assistant", content)
    }
}

fn tool_result_msg(id: &str, content: &str) -> ChatMessage {
    ChatMessage {
        tool_call_id: Some(id.to_string()),
        ..msg("tool", content)
    }
}

fn desktop_tool(name: &str, parameters: Value) -> ToolDefinition {
    ToolDefinition {
        name: name.to_string(),
        description: format!("{name} description"),
        parameters,
        strict: None,
    }
}

fn simple_schema() -> Value {
    json!({
        "type": "object",
        "properties": { "path": { "type": "string" } },
        "required": ["path"]
    })
}

fn crate_tool(name: &str, parameters: Value) -> agiworkforce_llm::ToolDefinition {
    agiworkforce_llm::ToolDefinition {
        name: name.to_string(),
        description: format!("{name} description"),
        input_schema: parameters,
        is_read_only: false,
        is_concurrency_safe: false,
        max_result_size_chars: None,
        should_defer: false,
        aliases: Vec::new(),
        owner: String::new(),
        permission_class: String::new(),
        diagnostic_tags: Vec::new(),
    }
}

/// Map the desktop fixture shape (system field + ChatMessages) into the crate
/// wire messages the CLI-style caller would pass for the same conversation.
fn crate_messages(system: Option<&str>, messages: &[ChatMessage]) -> Vec<agiworkforce_llm::Message> {
    use agiworkforce_llm::{ContentBlock, Message};
    let mut out = Vec::new();
    if let Some(system) = system {
        out.push(Message::text("system", system));
    }
    for m in messages {
        if m.role == "tool" {
            // Desktop tool-result messages carry the call id in tool_call_id;
            // the crate wire form is a user-turn ToolResult block.
            out.push(Message::blocks(
                "user",
                vec![ContentBlock::ToolResult {
                    tool_use_id: m.tool_call_id.clone().unwrap_or_default(),
                    content: m.content.clone(),
                    is_error: false,
                }],
            ));
            continue;
        }
        if let Some(tool_calls) = &m.tool_calls {
            let mut blocks = Vec::new();
            if !m.content.is_empty() {
                blocks.push(ContentBlock::Text {
                    text: m.content.clone(),
                });
            }
            for tc in tool_calls {
                blocks.push(ContentBlock::ToolUse {
                    id: tc.id.clone(),
                    name: tc.name.clone(),
                    input: serde_json::from_str(&tc.arguments).unwrap_or_else(|_| json!({})),
                });
            }
            out.push(Message::blocks(&m.role, blocks));
            continue;
        }
        out.push(Message::text(&m.role, m.content.clone()));
    }
    out
}

fn chat_request<'a>(
    model: &'a str,
    messages: &'a [agiworkforce_llm::Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&'a [agiworkforce_llm::ToolDefinition]>,
    thinking_budget: Option<u32>,
) -> agiworkforce_llm::ChatRequest<'a> {
    agiworkforce_llm::ChatRequest {
        model,
        messages,
        max_tokens,
        temperature,
        tools,
        thinking_budget,
        num_ctx: None,
        ollama_think: None,
        idle_timeout: std::time::Duration::from_secs(5),
    }
}

fn adapt_old(provider: Provider, request: &LLMRequest) -> Value {
    ProviderAdapterFactory::create_adapter(provider)
        .adapt_request(request)
        .expect("desktop adapter builds the request")
}

// ---------------------------------------------------------------------------
// ollama — PROVEN (production switched to the crate serializers)
// ---------------------------------------------------------------------------

fn ollama_request(messages: Vec<ChatMessage>) -> LLMRequest {
    LLMRequest {
        messages,
        model: "qwen-oracle-test".to_string(),
        temperature: Some(0.5),
        max_tokens: Some(1024),
        stream: true,
        ..Default::default()
    }
}

#[test]
fn ollama_text_system_temp_max_tokens_is_byte_identical() {
    let request = ollama_request(vec![
        msg("system", "You are AGI Workforce."),
        msg("user", "Hello"),
        msg("assistant", "Hi! How can I help?"),
        msg("user", "Summarize this repo."),
    ]);
    for stream in [true, false] {
        let old = old_ollama::build(&request, &request.messages, None, None, stream);
        let new = build_ollama_chat_body(&request, &request.messages, None, None, stream);
        verify_parity(&format!("ollama_text stream={stream}"), old, new, &[]);
    }
}

#[test]
fn ollama_think_variants_are_byte_identical() {
    for (label, thinking) in [
        ("none", None),
        ("enabled", Some(ThinkingParameter::Enabled(true))),
        ("disabled", Some(ThinkingParameter::Enabled(false))),
        (
            "level",
            Some(ThinkingParameter::Level {
                level: "high".to_string(),
                max_thinking_tokens: None,
            }),
        ),
    ] {
        let request = LLMRequest {
            thinking,
            ..ollama_request(vec![msg("user", "Hello")])
        };
        let old = old_ollama::build(&request, &request.messages, None, None, true);
        let new = build_ollama_chat_body(&request, &request.messages, None, None, true);
        // Pin the exact wire semantics per variant before the byte check.
        match label {
            "none" => assert!(new.get("think").is_none(), "no opinion → field omitted"),
            "enabled" | "level" => assert_eq!(new["think"], true),
            "disabled" => assert_eq!(new["think"], false),
            _ => unreachable!(),
        }
        verify_parity(&format!("ollama_think_{label}"), old, new, &[]);
    }
}

#[test]
fn ollama_max_tokens_edges() {
    for (label, max_tokens, deltas) in [
        ("unset", None, &[][..]),
        ("zero", Some(0), &[Delta::OllamaZeroNumPredict][..]),
        ("large", Some(65536), &[][..]),
    ] {
        let request = LLMRequest {
            max_tokens,
            ..ollama_request(vec![msg("user", "Hello")])
        };
        let old = old_ollama::build(&request, &request.messages, None, None, true);
        let new = build_ollama_chat_body(&request, &request.messages, None, None, true);
        verify_parity(&format!("ollama_max_tokens_{label}"), old, new, deltas);
    }
}

#[test]
fn ollama_native_tools_and_tool_history() {
    let tools = vec![
        desktop_tool("read_file", simple_schema()),
        desktop_tool("run_command", simple_schema()),
    ];
    let request = ollama_request(vec![
        msg("system", "You are AGI Workforce."),
        msg("user", "Read Cargo.toml"),
        assistant_tool_call_msg("", "call_1", "read_file", r#"{"path":"Cargo.toml"}"#),
        tool_result_msg("call_1", "[package]\nname = \"demo\""),
        msg("user", "Thanks — now summarize it."),
    ]);
    let old = old_ollama::build(&request, &request.messages, Some(&tools), None, true);
    let new = build_ollama_chat_body(&request, &request.messages, Some(&tools), None, true);
    verify_parity(
        "ollama_tools_history",
        old,
        new,
        &[Delta::OllamaAssistantEmptyContent],
    );
}

#[test]
fn ollama_non_object_tool_args_are_hardened() {
    let request = ollama_request(vec![
        msg("user", "Do the thing"),
        assistant_tool_call_msg("On it.", "call_9", "run_command", "5"),
        tool_result_msg("call_9", "ok"),
    ]);
    let old = old_ollama::build(&request, &request.messages, None, None, true);
    let new = build_ollama_chat_body(&request, &request.messages, None, None, true);
    verify_parity(
        "ollama_non_object_args",
        old,
        new,
        &[Delta::OllamaNonObjectToolArgs],
    );
}

#[test]
fn ollama_images_move_from_top_level_to_last_user_message() {
    // Caller-level vision gating (extract from the last user message, only
    // for vision-capable models) is unchanged production code; the oracle
    // exercises the builder boundary with the already-gated payload.
    let images = vec!["QUdJIFdPUktGT1JDRQ==".to_string(), "aW1hZ2UtMg==".to_string()];
    let request = ollama_request(vec![
        msg("system", "You are AGI Workforce."),
        msg("user", "What is in these screenshots?"),
    ]);
    let old = old_ollama::build(
        &request,
        &request.messages,
        None,
        Some(images.clone()),
        true,
    );
    let new = build_ollama_chat_body(&request, &request.messages, None, Some(&images), true);
    verify_parity(
        "ollama_images",
        old,
        new,
        &[Delta::OllamaImagesPerMessage],
    );
}

// ---------------------------------------------------------------------------
// anthropic — DOCUMENTED (desktop stays on its adapter)
// ---------------------------------------------------------------------------

const ANTHROPIC_SYSTEM: &str = "You are AGI Workforce. Be terse.\n\n<environment>\nWorking directory: /repo\n</environment>";

fn anthropic_request(messages: Vec<ChatMessage>) -> LLMRequest {
    LLMRequest {
        messages,
        model: "claude-oracle-test".to_string(),
        temperature: Some(0.5),
        max_tokens: Some(1024),
        stream: true,
        system: Some(ANTHROPIC_SYSTEM.to_string()),
        ..Default::default()
    }
}

#[test]
fn anthropic_minimal_parity_modulo_cache_breakpoints() {
    let request = anthropic_request(vec![
        msg("user", "Hello"),
        msg("assistant", "Hi!"),
        msg("user", "Summarize this repo."),
    ]);
    let old = adapt_old(Provider::Anthropic, &request);
    let messages = crate_messages(Some(ANTHROPIC_SYSTEM), &request.messages);
    let new = agiworkforce_llm::build_anthropic_request_body(&chat_request(
        "claude-oracle-test",
        &messages,
        1024,
        Some(0.5),
        None,
        None,
    ));
    verify_parity(
        "anthropic_minimal",
        old,
        new,
        &[Delta::SystemPromptCached, Delta::MessageCacheBreakpoint],
    );
}

#[test]
fn anthropic_tools_parity_modulo_cache_and_tool_choice() {
    let desktop_tools = vec![
        desktop_tool("read_file", simple_schema()),
        desktop_tool("run_command", simple_schema()),
    ];
    let request = LLMRequest {
        tools: Some(desktop_tools),
        tool_choice: Some(ToolChoice::Auto),
        ..anthropic_request(vec![msg("user", "Read Cargo.toml")])
    };
    let old = adapt_old(Provider::Anthropic, &request);
    let messages = crate_messages(Some(ANTHROPIC_SYSTEM), &request.messages);
    let tools = vec![
        crate_tool("read_file", simple_schema()),
        crate_tool("run_command", simple_schema()),
    ];
    let new = agiworkforce_llm::build_anthropic_request_body(&chat_request(
        "claude-oracle-test",
        &messages,
        1024,
        Some(0.5),
        Some(&tools),
        None,
    ));
    verify_parity(
        "anthropic_tools",
        old,
        new,
        &[
            Delta::SystemPromptCached,
            Delta::MessageCacheBreakpoint,
            Delta::ToolsCacheControl,
            Delta::DesktopOnlyKey("tool_choice"),
        ],
    );
}

#[test]
fn anthropic_tool_history_parity_modulo_is_error_and_breakpoints() {
    let request = anthropic_request(vec![
        msg("user", "Read Cargo.toml"),
        assistant_tool_call_msg(
            "Reading it now.",
            "toolu_1",
            "read_file",
            r#"{"path":"Cargo.toml"}"#,
        ),
        tool_result_msg("toolu_1", "[package]\nname = \"demo\""),
    ]);
    let old = adapt_old(Provider::Anthropic, &request);
    let messages = crate_messages(Some(ANTHROPIC_SYSTEM), &request.messages);
    let new = agiworkforce_llm::build_anthropic_request_body(&chat_request(
        "claude-oracle-test",
        &messages,
        1024,
        Some(0.5),
        None,
        None,
    ));
    verify_parity(
        "anthropic_tool_history",
        old,
        new,
        &[
            Delta::SystemPromptCached,
            Delta::ToolResultIsErrorField,
            Delta::MessageCacheBreakpoint,
        ],
    );
}

#[test]
fn anthropic_thinking_pins_crate_temperature_and_floor_gaps() {
    let request = LLMRequest {
        thinking: Some(ThinkingParameter::Enabled(true)), // desktop budget: 8192
        ..anthropic_request(vec![msg("user", "Think hard about this.")])
    };
    let old = adapt_old(Provider::Anthropic, &request);
    let messages = crate_messages(Some(ANTHROPIC_SYSTEM), &request.messages);
    let new = agiworkforce_llm::build_anthropic_request_body(&chat_request(
        "claude-oracle-test",
        &messages,
        1024,
        Some(0.5),
        None,
        Some(8192),
    ));
    verify_parity(
        "anthropic_thinking",
        old,
        new,
        &[
            Delta::SystemPromptCached,
            Delta::MessageCacheBreakpoint,
            Delta::ThinkingKeepsTemperature,
            Delta::ThinkingMaxTokensFloor,
        ],
    );
}

// ---------------------------------------------------------------------------
// openai (chat completions) — DOCUMENTED (desktop stays on its adapter)
// ---------------------------------------------------------------------------

/// Third-party OpenAI-compatible arm on both sides: a non-catalog model id
/// (desktop resolves provider → None → legacy `max_tokens`) and a non-OpenAI
/// URL (crate `OpenAiOpts::for_url` → legacy `max_tokens`). The
/// OpenAI-managed arm differs only in mechanism (catalog provider lookup vs
/// URL match); both then emit `max_completion_tokens`.
fn openai_compat_opts() -> agiworkforce_llm::OpenAiOpts {
    agiworkforce_llm::OpenAiOpts::for_url("https://api.deepseek.com/v1/chat/completions")
}

fn openai_request(messages: Vec<ChatMessage>) -> LLMRequest {
    LLMRequest {
        messages,
        model: "compat-oracle-test".to_string(),
        temperature: Some(0.5),
        max_tokens: Some(1024),
        stream: true,
        system: Some("You are AGI Workforce.".to_string()),
        ..Default::default()
    }
}

#[test]
fn openai_chat_minimal_parity_modulo_stream_options() {
    let request = openai_request(vec![msg("user", "Hello"), msg("assistant", "Hi!"), msg("user", "More.")]);
    let old = adapt_old(Provider::OpenAI, &request);
    let messages = crate_messages(Some("You are AGI Workforce."), &request.messages);
    let new = agiworkforce_llm::build_openai_compat_request_body(
        &chat_request("compat-oracle-test", &messages, 1024, Some(0.5), None, None),
        &openai_compat_opts(),
    );
    verify_parity(
        "openai_chat_minimal",
        old,
        new,
        &[Delta::StreamOptionsIncludeUsage],
    );
}

#[test]
fn openai_chat_array_schema_pins_crate_normalization_gap() {
    // A tool schema with a bare `type: array` property: the desktop injects
    // `items: {}` (OpenAI 400s without it); the crate passes it verbatim.
    let array_schema = json!({
        "type": "object",
        "properties": { "paths": { "type": "array" } }
    });
    let request = LLMRequest {
        tools: Some(vec![desktop_tool("read_many", array_schema.clone())]),
        ..openai_request(vec![msg("user", "Read these files")])
    };
    let old = adapt_old(Provider::OpenAI, &request);
    let messages = crate_messages(Some("You are AGI Workforce."), &request.messages);
    let tools = vec![crate_tool("read_many", array_schema)];
    let new = agiworkforce_llm::build_openai_compat_request_body(
        &chat_request(
            "compat-oracle-test",
            &messages,
            1024,
            Some(0.5),
            Some(&tools),
            None,
        ),
        &openai_compat_opts(),
    );
    verify_parity(
        "openai_chat_array_schema",
        old,
        new,
        &[Delta::StreamOptionsIncludeUsage, Delta::ArrayItemsNormalized],
    );
}

#[test]
fn openai_chat_vision_parity_modulo_detail_field() {
    // A real decodable PNG: the desktop adapter decodes the bytes to compute
    // vision token estimates before serializing.
    let mut png = Vec::new();
    image::DynamicImage::new_rgba8(1, 1)
        .write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png)
        .expect("encode 1x1 png");
    let b64 = {
        use base64::Engine as _;
        base64::engine::general_purpose::STANDARD.encode(&png)
    };

    let request = openai_request(vec![ChatMessage {
        multimodal_content: Some(vec![
            ContentPart::Text {
                text: "Describe this".to_string(),
            },
            ContentPart::Image {
                image: ImageInput {
                    data: png.clone(),
                    format: ImageFormat::Png,
                    detail: ImageDetail::Auto,
                },
            },
        ]),
        ..msg("user", "Describe this")
    }]);
    let old = adapt_old(Provider::OpenAI, &request);

    use agiworkforce_llm::{ContentBlock, Message};
    let messages = vec![
        Message::text("system", "You are AGI Workforce."),
        Message::blocks(
            "user",
            vec![
                ContentBlock::Text {
                    text: "Describe this".to_string(),
                },
                ContentBlock::Image {
                    mime: "image/png".to_string(),
                    data_b64: b64,
                },
            ],
        ),
    ];
    let new = agiworkforce_llm::build_openai_compat_request_body(
        &chat_request("compat-oracle-test", &messages, 1024, Some(0.5), None, None),
        &openai_compat_opts(),
    );
    verify_parity(
        "openai_chat_vision",
        old,
        new,
        &[Delta::StreamOptionsIncludeUsage, Delta::ImageDetailField],
    );
}

/// DIVERGENCE PIN (no parity claim): the desktop chat-completions adapter
/// DROPS tool history — assistant `tool_calls` never serialize (the message
/// falls into the plain `{role, content}` arm) and tool-result messages lose
/// `tool_call_id`, so a replayed tool conversation 400s on OpenAI ("messages
/// with role 'tool' must be a response to a preceding message with
/// 'tool_calls'"). The crate serializer emits the correct shapes. Pinned
/// exactly on both sides so either side changing shape fails this test —
/// switching openai to the crate serializer FIXES a real desktop bug.
#[test]
fn openai_chat_tool_history_divergence() {
    let request = openai_request(vec![
        msg("user", "Read Cargo.toml"),
        assistant_tool_call_msg("", "call_1", "read_file", r#"{"path":"Cargo.toml"}"#),
        tool_result_msg("call_1", "[package]"),
    ]);
    let old = adapt_old(Provider::OpenAI, &request);
    assert_eq!(
        canonical_json(&old["messages"]),
        canonical_json(&json!([
            {"role": "system", "content": "You are AGI Workforce."},
            {"role": "user", "content": "Read Cargo.toml"},
            {"role": "assistant", "content": ""},
            {"role": "tool", "content": "[package]"}
        ])),
        "desktop degraded tool history changed shape — re-derive this pin"
    );

    let messages = crate_messages(Some("You are AGI Workforce."), &request.messages);
    let new = agiworkforce_llm::build_openai_compat_request_body(
        &chat_request("compat-oracle-test", &messages, 1024, Some(0.5), None, None),
        &openai_compat_opts(),
    );
    assert_eq!(
        canonical_json(&new["messages"]),
        canonical_json(&json!([
            {"role": "system", "content": "You are AGI Workforce."},
            {"role": "user", "content": "Read Cargo.toml"},
            // A tool-call-only assistant turn: the crate omits `content`
            // entirely (OpenAI accepts either; `tool_calls` satisfies the
            // content-or-tool_calls requirement).
            {"role": "assistant", "tool_calls": [{
                "id": "call_1", "type": "function",
                "function": {"name": "read_file", "arguments": "{\"path\":\"Cargo.toml\"}"}
            }]},
            {"role": "tool", "tool_call_id": "call_1", "content": "[package]"}
        ])),
        "crate tool-history shape changed — re-derive this pin"
    );
}

// ---------------------------------------------------------------------------
// openai responses — DOCUMENTED (desktop stays on its adapter)
// ---------------------------------------------------------------------------

/// Non-catalog o-series id: the desktop's version heuristic routes it to the
/// Responses API without consulting the catalog.
const RESPONSES_MODEL: &str = "o3-oracle-test";

#[test]
fn openai_responses_single_turn_parity_modulo_compact_input() {
    let request = LLMRequest {
        messages: vec![msg("user", "Hello")],
        model: RESPONSES_MODEL.to_string(),
        temperature: Some(0.5),
        max_tokens: Some(1024),
        stream: true,
        system: Some("You are AGI Workforce.".to_string()),
        ..Default::default()
    };
    let old = adapt_old(Provider::OpenAI, &request);
    let messages = crate_messages(Some("You are AGI Workforce."), &request.messages);
    let new = agiworkforce_llm::build_openai_responses_body(&chat_request(
        RESPONSES_MODEL,
        &messages,
        1024,
        Some(0.5),
        None,
        None,
    ));
    verify_parity(
        "responses_single_turn",
        old,
        new,
        &[Delta::CompactSingleTurnInput],
    );
}

#[test]
fn openai_responses_tool_history_parity_modulo_typed_parts() {
    let tools = vec![desktop_tool("read_file", simple_schema())];
    let request = LLMRequest {
        messages: vec![
            msg("user", "Read Cargo.toml"),
            assistant_tool_call_msg(
                "Reading it.",
                "call_1",
                "read_file",
                r#"{"path":"Cargo.toml"}"#,
            ),
            tool_result_msg("call_1", "[package]"),
            msg("user", "Summarize it."),
        ],
        model: RESPONSES_MODEL.to_string(),
        temperature: Some(0.5),
        max_tokens: Some(1024),
        stream: true,
        system: Some("You are AGI Workforce.".to_string()),
        tools: Some(tools),
        tool_choice: Some(ToolChoice::Auto),
        ..Default::default()
    };
    let old = adapt_old(Provider::OpenAI, &request);
    let messages = crate_messages(Some("You are AGI Workforce."), &request.messages);
    let crate_tools = vec![crate_tool("read_file", simple_schema())];
    let new = agiworkforce_llm::build_openai_responses_body(&chat_request(
        RESPONSES_MODEL,
        &messages,
        1024,
        Some(0.5),
        Some(&crate_tools),
        None,
    ));
    verify_parity(
        "responses_tool_history",
        old,
        new,
        &[Delta::TypedTextParts, Delta::DesktopOnlyKey("tool_choice")],
    );
}

// ---------------------------------------------------------------------------
// gemini — DOCUMENTED (desktop stays on its adapter)
// ---------------------------------------------------------------------------

fn gemini_request(messages: Vec<ChatMessage>) -> LLMRequest {
    LLMRequest {
        messages,
        model: "gemini-oracle-test".to_string(),
        temperature: Some(0.5),
        max_tokens: Some(1024),
        stream: true,
        system: Some("You are AGI Workforce.".to_string()),
        ..Default::default()
    }
}

#[test]
fn gemini_minimal_is_byte_identical() {
    let request = gemini_request(vec![
        msg("user", "Hello"),
        msg("assistant", "Hi!"),
        msg("user", "Summarize this repo."),
    ]);
    let old = adapt_old(Provider::Google, &request);
    let messages = crate_messages(Some("You are AGI Workforce."), &request.messages);
    let new = agiworkforce_llm::build_gemini_request_body(&chat_request(
        "gemini-oracle-test",
        &messages,
        1024,
        Some(0.5),
        None,
        None,
    ));
    verify_parity("gemini_minimal", old, new, &[]);
}

#[test]
fn gemini_tools_are_byte_identical_for_simple_schemas() {
    let request = LLMRequest {
        tools: Some(vec![desktop_tool("read_file", simple_schema())]),
        ..gemini_request(vec![msg("user", "Read Cargo.toml")])
    };
    let old = adapt_old(Provider::Google, &request);
    let messages = crate_messages(Some("You are AGI Workforce."), &request.messages);
    let tools = vec![crate_tool("read_file", simple_schema())];
    let new = agiworkforce_llm::build_gemini_request_body(&chat_request(
        "gemini-oracle-test",
        &messages,
        1024,
        Some(0.5),
        Some(&tools),
        None,
    ));
    verify_parity("gemini_tools", old, new, &[]);
}

#[test]
fn gemini_unset_max_tokens_pins_crate_zero_gap() {
    let request = LLMRequest {
        max_tokens: None,
        ..gemini_request(vec![msg("user", "Hello")])
    };
    let old = adapt_old(Provider::Google, &request);
    let messages = crate_messages(Some("You are AGI Workforce."), &request.messages);
    let new = agiworkforce_llm::build_gemini_request_body(&chat_request(
        "gemini-oracle-test",
        &messages,
        0,
        Some(0.5),
        None,
        None,
    ));
    verify_parity(
        "gemini_unset_max_tokens",
        old,
        new,
        &[Delta::AlwaysMaxOutputTokens],
    );
}

/// DIVERGENCE PIN (no parity claim): tool-result turns. The desktop sends
/// role "function" and — a real bug — puts the tool CALL ID in
/// `functionResponse.name`; Gemini matches responses to calls BY FUNCTION
/// NAME, so the desktop's pairing silently fails. The crate resolves the real
/// function name from the originating ToolUse and uses a "user" turn. Pinned
/// exactly on both sides; switching gemini to the crate serializer fixes it.
#[test]
fn gemini_tool_result_divergence() {
    let request = gemini_request(vec![
        msg("user", "Read Cargo.toml"),
        assistant_tool_call_msg("", "call_1", "read_file", r#"{"path":"Cargo.toml"}"#),
        tool_result_msg("call_1", "[package]"),
    ]);
    let old = adapt_old(Provider::Google, &request);
    assert_eq!(
        canonical_json(&old["contents"]),
        canonical_json(&json!([
            {"role": "user", "parts": [{"text": "Read Cargo.toml"}]},
            {"role": "model", "parts": [{"functionCall": {"name": "read_file", "args": {"path": "Cargo.toml"}}}]},
            {"role": "function", "parts": [{"functionResponse": {"name": "call_1", "response": {"result": "[package]"}}}]}
        ])),
        "desktop gemini tool-result shape changed — re-derive this pin"
    );

    let messages = crate_messages(Some("You are AGI Workforce."), &request.messages);
    let new = agiworkforce_llm::build_gemini_request_body(&chat_request(
        "gemini-oracle-test",
        &messages,
        1024,
        Some(0.5),
        None,
        None,
    ));
    assert_eq!(
        canonical_json(&new["contents"]),
        canonical_json(&json!([
            {"role": "user", "parts": [{"text": "Read Cargo.toml"}]},
            {"role": "model", "parts": [{"functionCall": {"name": "read_file", "args": {"path": "Cargo.toml"}}}]},
            {"role": "user", "parts": [{"functionResponse": {"name": "read_file", "response": {"result": "[package]"}}}]}
        ])),
        "crate gemini tool-result shape changed — re-derive this pin"
    );
}

// ---------------------------------------------------------------------------
// Crate feature-gap pins (the switch gate for the four documented providers)
// ---------------------------------------------------------------------------

/// The crate builders must not silently GROW desktop-only features without
/// this oracle noticing: the day any of these keys appears, the corresponding
/// gap note above is stale and the provider's switch gate must be re-derived.
#[test]
fn crate_builders_cannot_express_desktop_features() {
    let messages = vec![agiworkforce_llm::Message::text("user", "Hello")];
    let req = chat_request("gap-pin", &messages, 512, Some(0.5), None, Some(1024));

    let anthropic = agiworkforce_llm::build_anthropic_request_body(&req);
    for key in ["tool_choice", "output_config", "top_p", "top_k", "effort", "metadata"] {
        assert!(anthropic.get(key).is_none(), "anthropic gained {key}");
    }
    // The crate keeps temperature alongside thinking — the exact gap
    // ThinkingKeepsTemperature pins. If this starts failing the gap is fixed.
    assert!(
        anthropic.get("temperature").is_some() && anthropic.get("thinking").is_some(),
        "crate anthropic thinking/temperature gap closed — update the oracle deltas \
         and re-evaluate the anthropic switch gate"
    );

    let responses = agiworkforce_llm::build_openai_responses_body(&req);
    for key in ["reasoning", "tool_choice", "text", "background", "previous_response_id"] {
        assert!(responses.get(key).is_none(), "responses gained {key}");
    }

    let gemini = agiworkforce_llm::build_gemini_request_body(&req);
    assert!(
        gemini.pointer("/generationConfig/thinkingConfig").is_none(),
        "gemini gained thinkingConfig"
    );
    assert!(gemini.get("toolConfig").is_none(), "gemini gained toolConfig");

    let openai = agiworkforce_llm::build_openai_compat_request_body(&req, &openai_compat_opts());
    for key in ["tool_choice", "response_format", "top_p", "audio"] {
        assert!(openai.get(key).is_none(), "openai gained {key}");
    }
}
