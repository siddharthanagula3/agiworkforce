
use std::error::Error;
use std::time::Duration;

use agiworkforce_llm::{
    run_anthropic_stream, run_gemini_stream, run_ollama_stream, run_openai_compat_stream,
    run_openai_responses_stream, LlmError, StreamEvent, Usage as CrateUsage,
};
use futures_util::{Stream, StreamExt};
use tokio_stream::wrappers::UnboundedReceiverStream;

use crate::core::llm::sse_parser::{StreamChunk, StreamingToolCall, TokenUsage};
use crate::core::llm::Provider;

type ChunkResult = Result<StreamChunk, Box<dyn Error + Send + Sync>>;

/// Which shared decoder to drive for a desktop provider.
///
/// Anthropic (Messages API), Google (Gemini `generateContent`), and native
/// OpenAI catalog models that require Responses get specialized dialects.
/// Every other BYOK cloud provider served by `DirectApiProvider` speaks
/// OpenAI-compatible Chat Completions. Ollama's native NDJSON path
/// (`providers/ollama.rs`) never reaches `DirectApiProvider`; its decoder is
/// driven through [`decode_bytes`] directly.
#[derive(Clone, Copy)]
pub(crate) enum Decoder {
    Anthropic,
    Gemini,
    OpenAiResponses,
    OpenAiCompat,
    // Ollama native NDJSON (`/api/chat`). The Ollama provider adapter builds its
    // own local request and decodes the response stream through the shared engine
    // (`decode_direct_stream` → `decoder_for(Ollama)` → this variant →
    // `run_ollama_stream`), the same strangler path Anthropic/Google/OpenAI use.
    // Byte-identity with the retired `parse_ollama_sse` is proven by the c2a
    // oracle (modulo the enumerated intentional c2b decode fixes).
    OllamaNative,
}

fn decoder_for(provider: Provider, model: &str) -> Decoder {
    match provider {
        Provider::Anthropic => Decoder::Anthropic,
        Provider::Google => Decoder::Gemini,
        Provider::Ollama => Decoder::OllamaNative,
        Provider::OpenAI if super::models_config::model_uses_responses_api(model) => {
            Decoder::OpenAiResponses
        }
        _ => Decoder::OpenAiCompat,
    }
}

fn empty_chunk() -> StreamChunk {
    StreamChunk {
        content: String::new(),
        done: false,
        finish_reason: None,
        model: None,
        usage: None,
        credits: None,
        tool_calls: None,
        reasoning: None,
        keepalive: false,
    }
}

/// Map the crate's cumulative [`CrateUsage`] onto desktop's `TokenUsage`.
/// Only called when the provider actually reported usage (the crate emits
/// `StreamEvent::Usage` only on seeing a usage object), so the values are real
/// rather than defaulted.
fn map_usage(u: &CrateUsage) -> TokenUsage {
    let input = u.input_tokens;
    let output = u.output_tokens;
    TokenUsage {
        prompt_tokens: Some(input),
        completion_tokens: Some(output),
        total_tokens: Some(input.saturating_add(output)),
        cache_read_input_tokens: (u.cache_read_input_tokens > 0)
            .then_some(u.cache_read_input_tokens),
        cache_creation_input_tokens: (u.cache_creation_input_tokens > 0)
            .then_some(u.cache_creation_input_tokens),
    }
}

/// Surface an in-stream provider error frame as a terminal error, preserving
/// the pre-swap desktop behavior where `parse_*_sse` returned `Err` on
/// `{"error": ...}`. The crate reports such frames it does not interpret as
/// `StreamEvent::Vendor`, carrying the raw payload.
fn extract_stream_error(data: &serde_json::Value) -> Option<Box<dyn Error + Send + Sync>> {
    let err = data.get("error")?;
    let msg = if let Some(s) = err.as_str() {
        s.to_string()
    } else {
        let message = err
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error");
        match err.get("type").and_then(|t| t.as_str()) {
            Some(t) if !t.is_empty() => format!("Provider stream error ({t}): {message}"),
            _ => format!("Provider stream error: {message}"),
        }
    };
    Some(msg.into())
}

/// Reproduce desktop's user-facing errors for Gemini safety/recitation blocks.
/// The crate carries the raw `finishReason` through to `StreamEvent::End`; the
/// pre-swap `parse_google_sse` turned these into terminal errors with these
/// exact strings.
fn gemini_block_error(reason: &str) -> Option<&'static str> {
    match reason {
        "SAFETY" | "BLOCKLIST" | "PROHIBITED_CONTENT" | "SPII" => Some(
            "Response was blocked by Google's safety filters. Try rephrasing your request or adjusting safety settings.",
        ),
        "RECITATION" => {
            Some("Response was blocked due to recitation concerns. Try rephrasing your request.")
        }
        "MALFORMED_FUNCTION_CALL" => Some(
            "Google returned a malformed function call. Try simplifying your request or tool definitions.",
        ),
        _ => None,
    }
}

/// Drive the shared `agiworkforce-llm` decoder for `provider` over an already
/// opened (HTTP 200) streaming response and re-project it into desktop's
/// `StreamChunk` stream. The returned stream is a drop-in replacement for the
/// old `sse_parser::parse_sse_stream(res, provider)`.
///
/// Cancellation is preserved: when the consumer drops the returned stream
/// (user stop / early return), byte pulling halts and the backing connection
/// is released, matching the pre-swap lazy-poll behavior.
pub fn decode_direct_stream(
    response: reqwest::Response,
    provider: Provider,
    model: &str,
) -> impl Stream<Item = ChunkResult> + Send {
    let byte_stream = response.bytes_stream().map(|r| {
        r.map_err(|e| LlmError::Read {
            message: e.to_string(),
        })
    });
    decode_bytes(Box::pin(byte_stream), decoder_for(provider, model))
}

pub(crate) fn project_stream_event(
    event: StreamEvent,
    is_gemini: bool,
    tx: &tokio::sync::mpsc::UnboundedSender<ChunkResult>,
) {
    match event {
        StreamEvent::TextDelta { text } => {
            let mut c = empty_chunk();
            c.content = text;
            let _ = tx.send(Ok(c));
        }
        StreamEvent::ReasoningDelta { text } => {
            let mut c = empty_chunk();
            c.reasoning = Some(text);
            let _ = tx.send(Ok(c));
        }
        StreamEvent::ToolCallStart { index, id, name } => {
            let mut c = empty_chunk();
            c.tool_calls = Some(vec![StreamingToolCall {
                index,
                id,
                name,
                arguments: String::new(),
            }]);
            let _ = tx.send(Ok(c));
        }
        StreamEvent::ToolCallArgsDelta { index, fragment } => {
            let mut c = empty_chunk();
            c.tool_calls = Some(vec![StreamingToolCall {
                index,
                id: String::new(),
                name: String::new(),
                arguments: fragment,
            }]);
            let _ = tx.send(Ok(c));
        }
        StreamEvent::Usage { usage } => {
            let mut c = empty_chunk();
            c.usage = Some(map_usage(&usage));
            let _ = tx.send(Ok(c));
        }
        StreamEvent::Keepalive => {
            let mut c = empty_chunk();
            c.keepalive = true;
            let _ = tx.send(Ok(c));
        }
        StreamEvent::Vendor { event: _, data } => {
            if let Some(err) = extract_stream_error(&data) {
                let _ = tx.send(Err(err));
            } else {
                // Non-error vendor frame the crate did not interpret
                // (e.g. role-only openers). Treat as a keepalive: no
                // content, but the stream is alive.
                let mut c = empty_chunk();
                c.keepalive = true;
                let _ = tx.send(Ok(c));
            }
        }
        StreamEvent::End { stop_reason } => {
            if is_gemini {
                if let Some(msg) = stop_reason.as_deref().and_then(gemini_block_error) {
                    let _ = tx.send(Err(msg.into()));
                    return;
                }
            }
            let mut c = empty_chunk();
            c.done = true;
            c.finish_reason = stop_reason;
            let _ = tx.send(Ok(c));
        }
    }
}

/// The reqwest-decoupled core of the swap: drive the shared dialect runner
/// over a byte stream and project its [`StreamEvent`]s into desktop
/// `StreamChunk`s. Separated from [`decode_direct_stream`] so the projection +
/// crate-runner integration can be regression-tested with canned byte fixtures
/// (no network). Cancellation is preserved: when the consumer drops the
/// receiver, byte pulling halts and the backing connection is released.
pub(crate) fn decode_bytes<S>(
    byte_stream: S,
    decoder: Decoder,
) -> UnboundedReceiverStream<ChunkResult>
where
    S: Stream<Item = Result<bytes::Bytes, LlmError>> + Send + Unpin + 'static,
{
    let is_gemini = matches!(decoder, Decoder::Gemini);
    let (tx, rx) = tokio::sync::mpsc::unbounded_channel::<ChunkResult>();

    // Stop draining the provider once the consumer drops the receiver.
    let tx_probe = tx.clone();
    let byte_stream = Box::pin(byte_stream.take_while(move |_| {
        let open = !tx_probe.is_closed();
        async move { open }
    }));

    tokio::spawn(async move {
        // Idle governance stays with `consume_llm_stream`; keep the crate
        // watchdog effectively unbounded so idle-timeout behavior is unchanged.
        let idle = Duration::from_secs(86_400);
        let tx_events = tx.clone();
        let mut on_event =
            move |event: StreamEvent| project_stream_event(event, is_gemini, &tx_events);

        let result = match decoder {
            Decoder::Anthropic => run_anthropic_stream(byte_stream, idle, &mut on_event).await,
            Decoder::Gemini => run_gemini_stream(byte_stream, idle, &mut on_event).await,
            Decoder::OpenAiResponses => {
                run_openai_responses_stream(byte_stream, idle, &mut on_event).await
            }
            Decoder::OpenAiCompat => {
                run_openai_compat_stream(byte_stream, idle, &mut on_event).await
            }
            Decoder::OllamaNative => run_ollama_stream(byte_stream, idle, &mut on_event).await,
        };

        if let Err(err) = result {
            let _ = tx.send(Err(Box::<dyn Error + Send + Sync>::from(err.to_string())));
        }
    });

    UnboundedReceiverStream::new(rx)
}

#[cfg(test)]
mod tests {
    use super::*;
    use bytes::Bytes;
    use std::collections::BTreeMap;

    /// Split a byte fixture into fixed-size pieces so the test exercises the
    /// crate's line + UTF-8 reassembly across chunk boundaries through the
    /// desktop adapter, then wrap each piece as a `Result<Bytes, LlmError>`.
    fn chunked(raw: &[u8], size: usize) -> Vec<Result<Bytes, LlmError>> {
        raw.chunks(size)
            .map(|c| Ok(Bytes::copy_from_slice(c)))
            .collect()
    }

    /// Mirror of `stream_runtime::consume_llm_stream`'s accumulation so the
    /// assertion is against the exact end-to-end contract the frontend sees,
    /// not the intermediate per-chunk shape.
    #[derive(Default)]
    struct Acc {
        content: String,
        reasoning: String,
        finish: Option<String>,
        usage: Option<TokenUsage>,
        tools: BTreeMap<usize, StreamingToolCall>,
        err: Option<String>,
    }

    async fn accumulate(pieces: Vec<Result<Bytes, LlmError>>, decoder: Decoder) -> Acc {
        let stream = futures_util::stream::iter(pieces);
        let mut out = Box::pin(decode_bytes(stream, decoder));
        let mut a = Acc::default();
        while let Some(item) = out.next().await {
            match item {
                Ok(chunk) => {
                    if chunk.keepalive {
                        continue;
                    }
                    a.content.push_str(&chunk.content);
                    if let Some(r) = chunk.reasoning {
                        a.reasoning.push_str(&r);
                    }
                    if let Some(fr) = chunk.finish_reason {
                        a.finish = Some(fr);
                    }
                    if let Some(u) = chunk.usage {
                        a.usage = Some(u);
                    }
                    if let Some(tcs) = chunk.tool_calls {
                        for tc in tcs {
                            let e = a.tools.entry(tc.index).or_insert(StreamingToolCall {
                                index: tc.index,
                                id: String::new(),
                                name: String::new(),
                                arguments: String::new(),
                            });
                            if !tc.id.is_empty() {
                                e.id = tc.id;
                            }
                            if !tc.name.is_empty() {
                                e.name = tc.name;
                            }
                            e.arguments.push_str(&tc.arguments);
                        }
                    }
                }
                Err(e) => {
                    a.err = Some(e.to_string());
                    break;
                }
            }
        }
        a
    }

    #[tokio::test]
    async fn openai_compat_text_and_usage_accumulate() {
        let raw = concat!(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"content\":\"lo \\u00e9\"}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
            "data: {\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":2}}\n\n",
            "data: [DONE]\n\n",
        );
        // 7-byte pieces force mid-line and mid-JSON splits.
        let a = accumulate(chunked(raw.as_bytes(), 7), Decoder::OpenAiCompat).await;
        assert!(a.err.is_none(), "unexpected error: {:?}", a.err);
        assert_eq!(a.content, "Hello \u{e9}");
        assert_eq!(a.finish.as_deref(), Some("stop"));
        let usage = a.usage.expect("usage present");
        assert_eq!(usage.prompt_tokens, Some(5));
        assert_eq!(usage.completion_tokens, Some(2));
    }

    #[tokio::test]
    async fn openai_compat_tool_call_args_accumulate_by_index() {
        let raw = concat!(
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":1,\"id\":\"call_x\",\"type\":\"function\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"path\\\":\\\"src/\"}}]}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":1,\"function\":{\"arguments\":\"main.rs\\\"}\"}}]}}]}\n\n",
            "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}]}\n\n",
            "data: [DONE]\n\n",
        );
        let a = accumulate(chunked(raw.as_bytes(), 11), Decoder::OpenAiCompat).await;
        assert!(a.err.is_none(), "unexpected error: {:?}", a.err);
        assert_eq!(a.finish.as_deref(), Some("tool_calls"));
        assert_eq!(a.tools.len(), 1);
        let tc = a.tools.get(&1).expect("tool at index 1");
        assert_eq!(tc.id, "call_x");
        assert_eq!(tc.name, "read_file");
        assert_eq!(tc.arguments, "{\"path\":\"src/main.rs\"}");
    }

    #[tokio::test]
    async fn openai_responses_text_reasoning_tool_usage_and_completion_accumulate() {
        let raw = concat!(
            "event: response.reasoning_summary_text.delta\n",
            "data: {\"type\":\"response.reasoning_summary_text.delta\",\"output_index\":0,\"delta\":\"Plan\"}\n\n",
            "event: response.output_item.added\n",
            "data: {\"type\":\"response.output_item.added\",\"output_index\":1,\"item\":{\"type\":\"function_call\",\"id\":\"fc_1\",\"call_id\":\"call_1\",\"name\":\"read_file\",\"arguments\":\"\"}}\n\n",
            "event: response.function_call_arguments.delta\n",
            "data: {\"type\":\"response.function_call_arguments.delta\",\"output_index\":1,\"delta\":\"{\\\"path\\\":\\\"a.txt\\\"}\"}\n\n",
            "event: response.output_text.delta\n",
            "data: {\"type\":\"response.output_text.delta\",\"output_index\":2,\"delta\":\"Done\"}\n\n",
            "event: response.completed\n",
            "data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":10,\"output_tokens\":7,\"output_tokens_details\":{\"reasoning_tokens\":3}}}}\n\n",
        );

        let a = accumulate(chunked(raw.as_bytes(), 9), Decoder::OpenAiResponses).await;
        assert!(a.err.is_none(), "unexpected error: {:?}", a.err);
        assert_eq!(a.reasoning, "Plan");
        assert_eq!(a.content, "Done");
        assert_eq!(a.finish.as_deref(), Some("completed"));
        let tool = a.tools.get(&1).expect("Responses function call");
        assert_eq!(tool.id, "call_1");
        assert_eq!(tool.name, "read_file");
        assert_eq!(tool.arguments, "{\"path\":\"a.txt\"}");
        let usage = a.usage.expect("Responses completion usage");
        assert_eq!(usage.prompt_tokens, Some(10));
        assert_eq!(usage.completion_tokens, Some(7));
    }

    #[tokio::test]
    async fn openai_responses_error_event_is_terminal() {
        let raw = concat!(
            "event: error\n",
            "data: {\"type\":\"error\",\"code\":\"server_error\",\"message\":\"stream exploded\"}\n\n",
        );

        let a = accumulate(chunked(raw.as_bytes(), 5), Decoder::OpenAiResponses).await;
        assert!(
            a.err
                .as_deref()
                .is_some_and(|error| error.contains("stream exploded")),
            "Responses error must terminate the Desktop stream: {:?}",
            a.err
        );
    }

    #[test]
    fn decoder_routing_uses_catalog_model_type_without_affecting_chat_tier() {
        let catalog = super::super::models_config::get_all_model_entries();
        let reasoning = catalog
            .values()
            .find(|entry| entry.provider == "openai" && entry.model_type == "reasoning")
            .expect("catalog must contain an OpenAI reasoning model");
        // No `chat`-type OpenAI model remains after the latest-family-only
        // sweep; any non-reasoning OpenAI
        // model exercises the OpenAiCompat (non-Responses) decoder branch.
        let non_reasoning = catalog
            .values()
            .find(|entry| entry.provider == "openai" && entry.model_type != "reasoning")
            .expect("catalog must contain a non-reasoning OpenAI model");

        assert!(matches!(
            decoder_for(Provider::OpenAI, &reasoning.id),
            Decoder::OpenAiResponses
        ));
        assert!(matches!(
            decoder_for(Provider::OpenAI, &non_reasoning.id),
            Decoder::OpenAiCompat
        ));
        assert!(matches!(
            decoder_for(Provider::OpenRouter, &reasoning.id),
            Decoder::OpenAiCompat
        ));
    }

    #[tokio::test]
    async fn gemini_safety_finish_reason_is_terminal_error() {
        // Desktop's pre-swap parse_google_sse turned a SAFETY finishReason into
        // a user-facing terminal error; the adapter reproduces that from the
        // crate's End{stop_reason}.
        let raw =
            "data: {\"candidates\":[{\"finishReason\":\"SAFETY\",\"content\":{\"parts\":[]}}]}\n\n";
        let a = accumulate(chunked(raw.as_bytes(), 9), Decoder::Gemini).await;
        let err = a
            .err
            .expect("safety block should surface as terminal error");
        assert!(err.contains("safety filters"), "unexpected error: {err}");
    }

    #[tokio::test]
    async fn anthropic_text_and_stop_reason_accumulate() {
        let raw = concat!(
            "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"model\":\"m\",\"usage\":{\"input_tokens\":10,\"output_tokens\":1}}}\n\n",
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hi\"}}\n\n",
            "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\"},\"usage\":{\"output_tokens\":3}}\n\n",
            "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n",
        );
        let a = accumulate(chunked(raw.as_bytes(), 13), Decoder::Anthropic).await;
        assert!(a.err.is_none(), "unexpected error: {:?}", a.err);
        assert_eq!(a.content, "Hi");
        assert_eq!(a.finish.as_deref(), Some("end_turn"));
        assert!(a.usage.is_some());
    }
}
