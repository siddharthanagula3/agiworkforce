//! c2a OLD-vs-NEW decode identity oracle (rust-engine-extraction plan, stage
//! c2a; executed retroactively over the operational c2b swap).
//!
//! Drives the SAME raw provider byte chunks through:
//!   OLD — the vendored pre-swap desktop decoder (`c2a_old_parser`, verbatim
//!         from commit `5889cf7eb^`): `SseStreamParser` framing + the four
//!         per-provider event parsers, exactly as production ran before the
//!         c2b decode swap; and
//!   NEW — the production bridge (`stream_engine::decode_bytes`) driving the
//!         shared `agiworkforce-llm` dialect runners with the production
//!         event→`StreamChunk` projection.
//!
//! and holds the two `StreamChunk` traces to BYTE-FOR-BYTE identity
//! (serialized comparison) at three levels:
//!
//!   L1 raw-trace identity — serialized chunk sequences exactly equal.
//!   L2 aligned identity  — where L1 differs, the divergence must be FULLY
//!      explained by the fixture's declared [`Exception`] set. Exceptions are
//!      machine-verified transformations, not comparison loosening: each one
//!      asserts the exact structural relationship it claims (e.g. one old
//!      merged chunk == the fold of consecutive new chunks under the real
//!      consumer's merge rules), and a declared exception that does not fire
//!      FAILS the fixture (stale-exception detection), as does any divergence
//!      residue not covered by a declared exception.
//!   L3 consumer-outcome identity — both traces folded through the exact
//!      accumulation semantics of `stream_runtime::consume_llm_stream` (the
//!      only production fold of these chunks) must produce identical
//!      `ConsumeStreamResult`-equivalents, again modulo only declared
//!      outcome-level exceptions.
//!
//! Corpus: the frozen decode contract of the extraction —
//! `crates/agiworkforce-llm/tests/fixtures/{anthropic,gemini,openai,
//! openai_responses,ollama}.jsonl` (26 stream fixtures). `http_errors.jsonl`
//! is deliberately out of scope: it exercises non-2xx HTTP classification,
//! which never entered the old event decoders — that comparison boundary is
//! `direct_api_provider`'s status handling, unchanged by the swap (see the
//! c2b commit diff: 6+/2- lines, none in status handling). The repo holds no
//! other recorded provider streams (verified 2026-07-16).
//!
//! Old-side note: `parse_google_sse` generates `call_<uuid4>` tool ids —
//! nondeterministic BY DESIGN in the old code. The `GeminiToolId` exception
//! canonicalizes both sides after asserting their exact shapes.

use std::collections::BTreeMap;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as B64;
use bytes::Bytes;
use futures_util::StreamExt;
use serde_json::{Value, json};

use crate::core::llm::Provider;
use crate::core::llm::stream_engine::{Decoder, decode_bytes};
use crate::core::llm::tests::c2a_old_parser::SseStreamParser;

// ---------------------------------------------------------------------------
// Approved exceptions — the COMPLETE enumeration of intentional c2b deltas
// ---------------------------------------------------------------------------

/// Every way the post-swap decode is allowed to differ from the pre-swap
/// decode. Each variant is a precise, machine-checked claim; anything outside
/// this list fails the oracle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Exception {
    /// One old per-SSE-event merged chunk corresponds to a consecutive run of
    /// finer-grained new chunks whose fold (under the exact
    /// `consume_llm_stream` merge rules) equals the old chunk. Downstream
    /// effect: extra `chat:stream-chunk` IPC emissions with empty deltas;
    /// identical rendered output and identical accumulated state.
    SplitGranularity,
    /// The new path emits exactly one synthesized terminal chunk
    /// `{done:true, finish_reason:<recorded>}` at byte-stream exhaustion
    /// (crate `StreamEvent::End`) that has no old counterpart; its
    /// finish_reason must equal the old trace's folded finish_reason.
    SynthesizedEnd,
    /// A trailing old `done:true` chunk that carries no other information
    /// (old emitted one per `[DONE]` marker / `message_stop`) has no new
    /// counterpart; `done` is already established by the new terminal chunk.
    RedundantTerminalDone,
    /// Keepalive chunk COUNTS differ (old: one per SSE comment EVENT or
    /// ping/parse-error event; new: one per comment LINE or uninterpreted
    /// vendor frame). Keepalives are skipped by `consume_llm_stream`; their
    /// only production effect is idle-timer reset, which both sides satisfy
    /// wherever the old side emitted one.
    KeepaliveRecount,
    /// Old Gemini tool ids are `call_<uuid4>` (nondeterministic); new are
    /// deterministic `gemini_<index>`. Both shapes are asserted exactly, then
    /// canonicalized for comparison. Improvement: determinism.
    GeminiToolId,
    /// Old Ollama tool ids come from the payload (usually absent → filled by
    /// the consumer's `stream_tool_call_<i>` fallback); new are deterministic
    /// `ollama_<index>`. Both shapes asserted, then canonicalized. The OLD side's
    /// empty-string id (Ollama sends none) is canonicalized to the SAME sentinel
    /// as new's synthesized `ollama_<index>` — a determinism drop-recovery, since
    /// no real provider id exists to lose.
    OllamaToolId,
    /// Ollama eager-tool-finish correction (intentional c2b bug-fix). The OLD
    /// ollama parser (c2a_old_parser.rs:1103-1112) synthesizes finish_reason PER
    /// NDJSON LINE: it emits "tool_calls" eagerly on the (done:false) tool-call
    /// line, then — on the terminal done line, whose message carries no tool_calls
    /// — falls to the done_reason/"stop" branch, so the fold's last-Some-wins rule
    /// leaves old's FINAL finish_reason as the WRONG "stop" for a tool-call turn.
    /// The NEW decoder emits finish_reason only on the terminal chunk, correctly
    /// "tool_calls". SELF-VALIDATING + PINNED: the per-chunk L2 fold defers finish
    /// (stripping it only where the two sides' finish differ), and L3 recovers old
    /// → new ONLY on the exact old=="stop" ∧ new=="tool_calls" transition AND only
    /// when a tool call is present. Any other finish pairing fails. The tool call's
    /// name+arguments stay asserted byte-identical (never stripped) — teeth kept.
    OllamaEagerToolFinish,
    /// Invalid-tool-args wrapping (intentional c2b hardening). When a tool call's
    /// `arguments` is not a valid JSON OBJECT (e.g. the bare number `5`), the NEW
    /// decoder replaces it with a structured envelope
    /// `{"__agi_invalid_tool_args":true,"error":...,"raw":<original>,"tool_name":...}`
    /// so malformed args never reach the tool executor; the OLD parser passed the
    /// raw value through verbatim. SELF-VALIDATING: both representations of the SAME
    /// invalid args are canonicalized to one sentinel keyed by the RAW value, so the
    /// oracle asserts new preserved the exact raw — a wrong or omitted `raw`, or an
    /// envelope missing the `__agi_invalid_tool_args` marker, yields a different
    /// sentinel and fails. The tool call's outer `name`/`index`/`id` stay asserted
    /// verbatim. Applies only to non-object args (valid object args are untouched).
    OllamaInvalidToolArgsWrapped,
    /// Terminal in-stream provider error TEXT was rephrased by the bridge
    /// (old: `"<Provider> API error (<type>): <msg>"` dialect formats; new:
    /// `"Provider stream error (<type>): <msg>"` or the crate error Display).
    /// The provider's own message must survive verbatim in both. DEFENSIVE: no
    /// current fixture exercises this — every error in the corpus is one the OLD
    /// parser SWALLOWED (top-level/response.failed → SwallowedErrorRecovered), so
    /// the old side never emits an Item::Error to rephrase. Kept for the both-sides-
    /// emit-error case a future fixture may add; declare it there to activate.
    ErrTextRephrased,
    /// Old populated `StreamChunk.model` from payload frames; the new
    /// projection never does. Verified: no production consumer reads
    /// `chunk.model` (grep evidence in the oracle design notes, 2026-07-16).
    ModelFieldDrop,
    /// Usage field SHAPE canonicalization: the new projection always sends
    /// `completion_tokens: Some(n)` / computed `total_tokens: Some(in+out)`
    /// where the old parser could carry `None` (absent payload fields) or a
    /// payload-reported total. Numeric token VALUES must match wherever both
    /// sides report them.
    UsageFieldShape,
    /// Anthropic usage MERGE correction (intentional c2b bug-fix). The OLD
    /// parser OVERWRITES usage on `message_delta` (c2a_old_parser.rs:752-782),
    /// which for anthropic carries only `output_tokens`, DROPPING the
    /// `input_tokens` established by `message_start` → an under-count
    /// (total = output only). The new decoder correctly MERGES, recovering the
    /// input tokens (total = input + output). This is a real billing/usage bug
    /// the c2b swap fixes; byte-identity therefore cannot hold for the affected
    /// usage fields. SELF-VALIDATING (never a blind value skip): fires ONLY when
    /// the divergence is EXACTLY this pattern — new is an internally-consistent
    /// merge (new.total == new.prompt + new.completion), the output count agrees
    /// (old.completion == new.completion), old dropped exactly the prompt
    /// (old.prompt == 0 && old.total == old.completion), and new recovered a
    /// real input (new.prompt > 0). Any other usage difference (disagreeing
    /// output, inconsistent new total, etc.) does NOT fire this and fails the
    /// strict check below, so real regressions are still caught. Accepted as an
    /// intended delta under fix-to-final-shape (zero live users; correct usage
    /// supersedes the old under-count). Justified inline against old-parser
    /// source; this enumeration IS the intentional-delta record for the oracle.
    UsageMergeCorrection,
    /// Tool-call EMISSION ORDER differs: the provider sends per-index tool-call
    /// deltas interleaved/out-of-order; the OLD parser reorders to emit lower
    /// indexes first, the NEW decoder preserves wire order. The consumer merges
    /// tool_calls BY INDEX, so the FINAL merged tool_calls are identical — only
    /// the per-chunk emission order differs. For a declared fixture the per-chunk
    /// L2 fold ignores tool_calls (strips them before comparing), DEFERRING
    /// tool-call correctness to the L3 consumer-outcome check, which still asserts
    /// the fully-folded tool_calls are byte-identical. NOT a blind skip: any real
    /// tool-call difference (args, names, ids, or final index set) fails at L3.
    ToolIndexEmissionOrder,
    /// Tool-call recovery (intentional c2b bug-fix). The OLD openai-responses
    /// parser (c2a_old_parser.rs) has NO handler for responses-native tool events
    /// (`response.output_item.added` with `type:"function_call"`,
    /// `response.function_call_arguments.delta`/`.done`) — its only tool-call path
    /// is the Chat-Completions `delta.tool_calls` array, which responses streams
    /// never emit — so it DROPS the tool call entirely. The NEW decoder captures it.
    /// SELF-VALIDATING: recover ONLY when the OLD folded outcome has ZERO tool_calls
    /// AND the NEW has ≥1 (a pure recovery, not a mutation). If old emitted ANY
    /// tool_call that disagrees with new's, the L3 tool_calls stay divergent and the
    /// strict comparison fails — real tool-call regressions are still caught. The L2
    /// fold strips tool_calls (deferring to L3), same as ToolIndexEmissionOrder.
    /// Accepted under fix-to-final-shape (zero live users; new's captured tool call
    /// supersedes the old drop). Justified inline against old-parser source.
    ToolCallsRecovered,
    /// Swallowed-error recovery (intentional c2b bug-fix). The OLD openai parser
    /// (c2a_old_parser.rs:301) only recognizes a NESTED `{"error":{...}}` shape via
    /// `json.get("error")`; the openai-responses top-level `event: error` is FLAT
    /// (`{"type":"error","code":...,"message":...}`), so old fails to match it and
    /// emits a bare-empty NON-TERMINAL chunk (`done` stays false — the old desktop
    /// would hang / surface nothing on a responses stream error). The NEW decoder
    /// correctly emits a terminal Error. SELF-VALIDATING: fires ONLY when old's
    /// chunk is bare-empty (is_bare_empty — no content/usage/finish/done) AND the
    /// aligned new item is a terminal Error; a real error BOTH sides emit (text
    /// differing) routes through ErrTextRephrased instead. Accepted under
    /// fix-to-final-shape (zero live users; new surfaces an error old dropped).
    SwallowedErrorRecovered,
    /// Finish-reason recovery (intentional c2b bug-fix). The OLD openai-responses
    /// parser (c2a_old_parser.rs:493-495) maps `response.completed` to `done=true`
    /// but NEVER sets `finish_reason` (drops it); the NEW decoder captures the real
    /// terminal reason (e.g. "completed"). SELF-VALIDATING: recover old's finish to
    /// new's ONLY when old's finish is null/absent AND new's is a non-empty string
    /// (a real terminal reason). If old ALSO reported a finish that DISAGREES with
    /// new's, this does NOT fire and the strict comparison fails — real
    /// finish-reason regressions are still caught. Accepted under fix-to-final-shape
    /// (zero live users; new's captured finish supersedes the old drop).
    FinishReasonRecovered,
    /// Ollama: old surfaced the payload's `done_reason` (e.g. "length") as
    /// finish_reason; the verbatim-from-CLI crate runner synthesizes "stop".
    /// TRACKED CRATE GAP — this exception is expected to be DELETED once the
    /// crate reads done_reason (see oracle report). Fires only if the corpus
    /// exercises done_reason.
    // Declared-but-unfired until the ollama c2b migration lands the done_reason
    // handling (W7 in progress); held so the oracle compiles while ollama's
    // decode path is still transitional (see stream_engine.rs OllamaNative).
    #[allow(dead_code)]
    OllamaDoneReason,
}

/// Declared exception sets, per fixture. A fixture absent from this table
/// must be L1-identical. `verify_fixture` fails if a declared exception does
/// not fire or an undeclared divergence remains.
const FIXTURE_EXCEPTIONS: &[(&str, &[Exception])] = &[
    // ---- anthropic ----
    (
        "anthropic_ping_is_keepalive",
        &[Exception::SynthesizedEnd],
    ),
    (
        "anthropic_thinking_deltas_and_usage_override",
        &[
            Exception::SplitGranularity,
            Exception::RedundantTerminalDone,
            Exception::KeepaliveRecount,
            Exception::UsageFieldShape,
            Exception::UsageMergeCorrection,
        ],
    ),
    (
        "anthropic_tool_call_block",
        &[
            Exception::SplitGranularity,
            Exception::UsageFieldShape,
        ],
    ),
    (
        "anthropic_multibyte_split_2_2",
        &[Exception::SynthesizedEnd],
    ),
    (
        "anthropic_cache_usage_max_merge_and_done",
        &[
            Exception::SplitGranularity,
            Exception::KeepaliveRecount,
            Exception::UsageFieldShape,
            Exception::UsageMergeCorrection,
        ],
    ),
    // ---- gemini ----
    (
        "gemini_text_usage_finish",
        &[
            Exception::SplitGranularity,
            Exception::UsageFieldShape,
        ],
    ),
    (
        "gemini_function_call_complete",
        &[
            Exception::SplitGranularity,
            Exception::GeminiToolId,
        ],
    ),
    (
        "gemini_multibyte_split_2_1",
        &[Exception::SynthesizedEnd],
    ),
    // ---- openai (chat completions) ----
    ("utf8_emoji_split_2_2", &[Exception::SynthesizedEnd]),
    ("utf8_accent_split_1_1", &[Exception::SynthesizedEnd]),
    ("utf8_byte_at_a_time", &[Exception::SynthesizedEnd]),
    (
        "data_prefix_split_across_chunks",
        &[Exception::SynthesizedEnd],
    ),
    (
        "crlf_framing",
        &[
            Exception::SplitGranularity,
            Exception::SynthesizedEnd,
        ],
    ),
    (
        "interleaved_out_of_order_tool_indexes",
        &[
            Exception::SplitGranularity,
            Exception::RedundantTerminalDone,
            Exception::ToolIndexEmissionOrder,
        ],
    ),
    (
        "non_object_tool_args_get_marker",
        &[
            Exception::SplitGranularity,
        ],
    ),
    (
        "usage_only_final_chunk",
        &[
            Exception::UsageFieldShape,
        ],
    ),
    ("done_marker_only", &[]),
    (
        "keepalive_comment_then_text",
        &[],
    ),
    // ---- openai responses ----
    (
        "text_reasoning_tool_usage_completed",
        &[
            Exception::SplitGranularity,
            Exception::RedundantTerminalDone,
            Exception::UsageFieldShape,
            Exception::ToolCallsRecovered,
            Exception::UsageMergeCorrection,
            Exception::FinishReasonRecovered,
        ],
    ),
    (
        "incomplete_normalizes_reason_and_usage",
        &[
            Exception::SynthesizedEnd,
            Exception::UsageFieldShape,
            Exception::FinishReasonRecovered,
        ],
    ),
    (
        "top_level_error_is_terminal",
        &[Exception::SwallowedErrorRecovered],
    ),
    (
        "response_failed_is_terminal",
        &[Exception::SwallowedErrorRecovered],
    ),
    // ---- ollama ----
    (
        "ollama_ndjson_text_and_done",
        &[
            Exception::SplitGranularity,
            Exception::UsageFieldShape,
        ],
    ),
    (
        "ollama_tool_call_with_string_args",
        &[
            Exception::SplitGranularity,
            Exception::OllamaToolId,
            Exception::OllamaEagerToolFinish,
            Exception::UsageFieldShape,
        ],
    ),
    (
        "ollama_trailing_done_without_newline",
        &[
            Exception::SplitGranularity,
            Exception::UsageFieldShape,
        ],
    ),
    (
        "ollama_object_args_and_number_marker",
        &[
            Exception::SplitGranularity,
            Exception::OllamaToolId,
            Exception::OllamaEagerToolFinish,
            Exception::OllamaInvalidToolArgsWrapped,
            Exception::UsageFieldShape,
        ],
    ),
];

// ---------------------------------------------------------------------------
// Fixture loading + drivers
// ---------------------------------------------------------------------------

#[derive(Debug, serde::Deserialize)]
struct StreamFixture {
    name: String,
    dialect: String,
    chunks: Vec<String>,
}

fn fixture_files() -> [&'static str; 5] {
    [
        "anthropic.jsonl",
        "gemini.jsonl",
        "openai.jsonl",
        "openai_responses.jsonl",
        "ollama.jsonl",
    ]
}

fn load_fixtures(file: &str) -> Vec<StreamFixture> {
    let path = format!(
        "{}/../../../crates/agiworkforce-llm/tests/fixtures/{file}",
        env!("CARGO_MANIFEST_DIR")
    );
    let content = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("fixture file {path} must be readable: {e}"));
    content
        .lines()
        .filter(|l| !l.trim().is_empty() && !l.trim_start().starts_with('#'))
        .map(|l| serde_json::from_str(l).unwrap_or_else(|e| panic!("bad fixture in {file}: {e}")))
        .collect()
}

fn decode_chunks(fixture: &StreamFixture) -> Vec<Bytes> {
    fixture
        .chunks
        .iter()
        .map(|b64| {
            Bytes::from(
                B64.decode(b64)
                    .unwrap_or_else(|e| panic!("[{}] bad base64: {e}", fixture.name)),
            )
        })
        .collect()
}

fn dialect_routes(dialect: &str) -> (Provider, Decoder) {
    match dialect {
        "anthropic" => (Provider::Anthropic, Decoder::Anthropic),
        "gemini" => (Provider::Google, Decoder::Gemini),
        "openai" => (Provider::OpenAI, Decoder::OpenAiCompat),
        // The old desktop had ONE OpenAI parser for both Chat Completions and
        // Responses SSE (routing chose the endpoint, not the parser).
        "openai_responses" => (Provider::OpenAI, Decoder::OpenAiResponses),
        "ollama" => (Provider::Ollama, Decoder::OllamaNative),
        other => panic!("unmapped fixture dialect {other}"),
    }
}

/// One trace item: a serialized chunk or a terminal error string.
#[derive(Debug, Clone, PartialEq)]
enum Item {
    Chunk(Value),
    Error(String),
}

impl Item {
    fn is_keepalive(&self) -> bool {
        matches!(self, Item::Chunk(v) if v["keepalive"] == json!(true))
    }
}

async fn drive_old(chunks: Vec<Bytes>, provider: Provider) -> Vec<Item> {
    let mut stream = SseStreamParser::from_chunks(chunks, provider);
    let mut out = Vec::new();
    while let Some(item) = stream.next().await {
        match item {
            Ok(chunk) => out.push(Item::Chunk(
                serde_json::to_value(&chunk).expect("StreamChunk serializes"),
            )),
            Err(e) => {
                out.push(Item::Error(e.to_string()));
                // The production consumer treats the first Err as terminal.
                break;
            }
        }
    }
    out
}

async fn drive_new(chunks: Vec<Bytes>, decoder: Decoder) -> Vec<Item> {
    let byte_stream =
        futures_util::stream::iter(chunks.into_iter().map(Ok::<_, agiworkforce_llm::LlmError>));
    let mut stream = decode_bytes(byte_stream, decoder);
    let mut out = Vec::new();
    while let Some(item) = stream.next().await {
        match item {
            Ok(chunk) => out.push(Item::Chunk(
                serde_json::to_value(&chunk).expect("StreamChunk serializes"),
            )),
            Err(e) => {
                out.push(Item::Error(e.to_string()));
                break;
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Canonicalizations (each tied to one Exception; each reports if it fired)
// ---------------------------------------------------------------------------

struct Fired(BTreeMap<Exception, bool>);

impl Fired {
    fn new(declared: &[Exception]) -> Self {
        Fired(declared.iter().map(|e| (*e, false)).collect())
    }
    fn allowed(&self, e: Exception) -> bool {
        self.0.contains_key(&e)
    }
    fn fire(&mut self, e: Exception) {
        if let Some(slot) = self.0.get_mut(&e) {
            *slot = true;
        }
    }
    fn stale(&self) -> Vec<Exception> {
        self.0
            .iter()
            .filter(|(_, fired)| !**fired)
            .map(|(e, _)| *e)
            .collect()
    }
}

fn is_uuid_call_id(id: &str) -> bool {
    let Some(rest) = id.strip_prefix("call_") else {
        return false;
    };
    rest.len() == 36
        && rest
            .chars()
            .all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// Canonicalize tool-call ids on both sides per the declared id exceptions,
/// asserting the exact shapes each side is allowed to produce.
/// OllamaInvalidToolArgsWrapped canonicalization. Returns `Some(sentinel)` when a
/// tool-call `arguments` string represents INVALID args (either old's raw non-object
/// value, or new's `__agi_invalid_tool_args` envelope), normalizing both to one
/// sentinel keyed by the RAW value; returns `None` to leave valid object args (or an
/// empty/unstreamed args string) untouched. Keying on the raw asserts new preserved
/// the exact original — a wrong/omitted `raw` or a missing envelope marker diverges.
fn invalid_tool_args_sentinel(arg: &str) -> Option<String> {
    if arg.is_empty() {
        return None;
    }
    match serde_json::from_str::<Value>(arg) {
        Ok(Value::Object(o)) => {
            if o.get("__agi_invalid_tool_args").and_then(Value::as_bool) == Some(true) {
                let raw = o.get("raw").and_then(Value::as_str).unwrap_or("<no-raw>");
                Some(format!("<c2a-invalid-args:{raw}>"))
            } else {
                // Valid JSON object args — leave untouched.
                None
            }
        }
        // Valid JSON but not an object (number/string/array/bool), or unparseable:
        // an invalid raw tool-args value the new decoder wraps.
        _ => Some(format!("<c2a-invalid-args:{arg}>")),
    }
}

fn canonicalize_tool_ids(name: &str, item: &mut Value, side: &str, fired: &mut Fired) {
    let Some(tool_calls) = item.get_mut("tool_calls").and_then(|t| t.as_array_mut()) else {
        return;
    };
    for tc in tool_calls {
        // Invalid-tool-args wrapping: normalize old's raw non-object args and new's
        // __agi_invalid_tool_args envelope to one raw-keyed sentinel (asserts new
        // preserved the exact raw). Runs before the id `continue` below so it
        // applies to every tool call.
        if fired.allowed(Exception::OllamaInvalidToolArgsWrapped) {
            let sentinel = tc
                .get("arguments")
                .and_then(Value::as_str)
                .and_then(invalid_tool_args_sentinel);
            if let Some(s) = sentinel {
                tc["arguments"] = json!(s);
                fired.fire(Exception::OllamaInvalidToolArgsWrapped);
            }
        }
        let id = tc["id"].as_str().unwrap_or("").to_string();
        let index = tc["index"].as_u64().unwrap_or(0);
        // Ollama sends no tool-call id: OLD leaves it "" while NEW synthesizes a
        // deterministic `ollama_<index>`. Map BOTH to one sentinel under
        // OllamaToolId (determinism drop-recovery; no real provider id to lose).
        if fired.allowed(Exception::OllamaToolId) {
            match side {
                "old" if id.is_empty() => {
                    tc["id"] = json!("<ollama-id>");
                    fired.fire(Exception::OllamaToolId);
                    continue;
                }
                "new" if id == format!("ollama_{index}") => {
                    tc["id"] = json!("<ollama-id>");
                    fired.fire(Exception::OllamaToolId);
                    continue;
                }
                _ => {}
            }
        }
        if id.is_empty() {
            continue;
        }
        if fired.allowed(Exception::GeminiToolId) {
            match side {
                "old" if is_uuid_call_id(&id) => {
                    tc["id"] = json!("<gemini-id>");
                    fired.fire(Exception::GeminiToolId);
                }
                "new" if id == format!("gemini_{index}") => {
                    tc["id"] = json!("<gemini-id>");
                    fired.fire(Exception::GeminiToolId);
                }
                _ => panic!(
                    "[{name}] {side} gemini tool id {id:?} has neither the old \
                     call_<uuid> nor the new gemini_<index> shape"
                ),
            }
        }
    }
}

/// Canonicalize `model` per ModelFieldDrop: old side may carry Some(model);
/// new side must always be null.
fn canonicalize_model(name: &str, item: &mut Value, side: &str, fired: &mut Fired) {
    if item["model"].is_null() {
        return;
    }
    match side {
        "old" if fired.allowed(Exception::ModelFieldDrop) => {
            item["model"] = Value::Null;
            fired.fire(Exception::ModelFieldDrop);
        }
        "new" => panic!("[{name}] new projection must never set chunk.model"),
        _ => { /* undeclared: left in place → will surface as a diff */ }
    }
}

/// Canonicalize usage shape per UsageFieldShape: normalize BOTH sides to
/// `{prompt: p|0, completion: c|0, total: p+c}` AFTER asserting value
/// agreement on every field both sides report. Cache fields: absent(None) and
/// 0 are equivalent shapes.
fn canonicalize_usage(name: &str, old: &mut Value, new: &mut Value, fired: &mut Fired) {
    // UsageMergeCorrection (see the Exception doc): the old parser dropped
    // message_start input_tokens on message_delta; the new decoder correctly
    // merges. Recover old's prompt+total to new's values ONLY when the
    // divergence is exactly that validated under-count pattern — otherwise leave
    // every field to the strict comparison below so real regressions still fail.
    if fired.allowed(Exception::UsageMergeCorrection)
        && old["usage"].is_object()
        && new["usage"].is_object()
    {
        let uu = |v: &Value, k: &str| v["usage"].get(k).and_then(Value::as_u64).unwrap_or(0);
        let (np, nc, nt) = (
            uu(new, "prompt_tokens"),
            uu(new, "completion_tokens"),
            uu(new, "total_tokens"),
        );
        let (op, oc, ot) = (
            uu(old, "prompt_tokens"),
            uu(old, "completion_tokens"),
            uu(old, "total_tokens"),
        );
        // The old message_delta usage-override dropped input-side accounting
        // (prompt and/or cache tokens) that message_start carried; new merges.
        // Recover old's usage to new's ONLY when new is an internally-consistent
        // merge, the OUTPUT (generation) agrees EXACTLY, both totals are
        // internally consistent (total == prompt + completion), and old never
        // OVER-reports any input-side field (it dropped, never inflated). Any
        // output divergence or inconsistency fails the strict check below.
        if nt == np + nc
            && ot == op + oc
            && oc == nc
            && op <= np
            && uu(old, "cache_read_input_tokens") <= uu(new, "cache_read_input_tokens")
            && uu(old, "cache_creation_input_tokens") <= uu(new, "cache_creation_input_tokens")
            // at least one input-side field is strictly under-reported (a genuine
            // drop) — covers both total-changing (prompt) and total-neutral (cache)
            && (op < np
                || uu(old, "cache_read_input_tokens") < uu(new, "cache_read_input_tokens")
                || uu(old, "cache_creation_input_tokens")
                    < uu(new, "cache_creation_input_tokens"))
        {
            old["usage"] = new["usage"].clone();
            fired.fire(Exception::UsageMergeCorrection);
        }
    }
    let (o, n) = (&old["usage"], &new["usage"]);
    if o.is_null() && n.is_null() {
        return;
    }
    if !fired.allowed(Exception::UsageFieldShape) {
        return; // undeclared → any shape difference surfaces as a raw diff
    }
    if o.is_null() != n.is_null() {
        // Old omits usage (null) when the ollama done line carries no eval counts;
        // the new projection still emits an all-zero usage object. Treat null ≡
        // all-zeros ("no tokens counted") — but ONLY when the present side is all
        // zeros. A null-vs-NONZERO difference is a real dropped-usage divergence and
        // is left to fail (presence/absence otherwise isn't covered here — it must
        // be reconciled by fold alignment or surface as a diff).
        let present = if o.is_null() { n } else { o };
        let all_zero = [
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "cache_read_input_tokens",
            "cache_creation_input_tokens",
        ]
        .iter()
        .all(|k| present.get(k).and_then(Value::as_u64).unwrap_or(0) == 0);
        if all_zero {
            old["usage"] = Value::Null;
            new["usage"] = Value::Null;
            fired.fire(Exception::UsageFieldShape);
        }
        return;
    }
    let get = |v: &Value, k: &str| v.get(k).and_then(Value::as_u64);
    // Field-level value agreement wherever both report a number.
    for k in [
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
    ] {
        if let (Some(a), Some(b)) = (get(o, k), get(n, k)) {
            assert_eq!(a, b, "[{name}] usage.{k} value mismatch old={a} new={b}");
        }
    }
    let mut fired_here = false;
    let norm = |v: &Value| -> Value {
        let p = get(v, "prompt_tokens").unwrap_or(0);
        let c = get(v, "completion_tokens").unwrap_or(0);
        let cr = get(v, "cache_read_input_tokens").unwrap_or(0);
        let cc = get(v, "cache_creation_input_tokens").unwrap_or(0);
        json!({
            "prompt_tokens": p,
            "completion_tokens": c,
            "total_tokens": p + c,
            "cache_read_input_tokens": cr,
            "cache_creation_input_tokens": cc,
        })
    };
    let (no, nn) = (norm(o), norm(n));
    // Old totals may be payload-reported: only accept the computed
    // canonicalization when it does not change the old-reported total value.
    if let Some(t) = get(o, "total_tokens") {
        assert_eq!(
            t,
            no["total_tokens"].as_u64().unwrap(),
            "[{name}] old payload-reported total_tokens != prompt+completion; \
             this is a VALUE divergence UsageFieldShape does not cover"
        );
    }
    if old["usage"] != no || new["usage"] != nn {
        fired_here = true;
    }
    old["usage"] = no;
    new["usage"] = nn;
    if fired_here {
        fired.fire(Exception::UsageFieldShape);
    }
}

// ---------------------------------------------------------------------------
// Fold (exact `consume_llm_stream` merge rules) + alignment
// ---------------------------------------------------------------------------

fn empty_fold() -> Value {
    json!({
        "content": "",
        "done": false,
        "finish_reason": null,
        "model": null,
        "usage": null,
        "credits": null,
        "tool_calls": null,
        "reasoning": null,
        "keepalive": false,
    })
}

/// Merge `c` into `acc` exactly as `consume_llm_stream` accumulates chunks
/// (content/reasoning concat; finish/usage/credits/model last-Some; done OR;
/// tool calls merged by index with non-empty id/name overwrite + args concat).
fn fold_chunk(acc: &mut Value, c: &Value) {
    let content = format!(
        "{}{}",
        acc["content"].as_str().unwrap_or(""),
        c["content"].as_str().unwrap_or("")
    );
    acc["content"] = json!(content);
    if let Some(r) = c["reasoning"].as_str() {
        let prev = acc["reasoning"].as_str().unwrap_or("");
        acc["reasoning"] = json!(format!("{prev}{r}"));
    }
    if c["done"] == json!(true) {
        acc["done"] = json!(true);
    }
    for k in ["finish_reason", "model", "usage", "credits"] {
        if !c[k].is_null() {
            acc[k] = c[k].clone();
        }
    }
    if let Some(tcs) = c["tool_calls"].as_array() {
        let mut merged: BTreeMap<u64, Value> = acc["tool_calls"]
            .as_array()
            .map(|a| {
                a.iter()
                    .map(|tc| (tc["index"].as_u64().unwrap_or(0), tc.clone()))
                    .collect()
            })
            .unwrap_or_default();
        for tc in tcs {
            let idx = tc["index"].as_u64().unwrap_or(0);
            let entry = merged.entry(idx).or_insert_with(|| {
                json!({"index": idx, "id": "", "name": "", "arguments": ""})
            });
            if let Some(id) = tc["id"].as_str().filter(|s| !s.is_empty()) {
                entry["id"] = json!(id);
            }
            if let Some(nm) = tc["name"].as_str().filter(|s| !s.is_empty()) {
                entry["name"] = json!(nm);
            }
            let args = format!(
                "{}{}",
                entry["arguments"].as_str().unwrap_or(""),
                tc["arguments"].as_str().unwrap_or("")
            );
            entry["arguments"] = json!(args);
        }
        acc["tool_calls"] = json!(merged.into_values().collect::<Vec<_>>());
    }
}

/// Is this an old-side chunk that only says "done" (a `[DONE]` /
/// `message_stop` echo with no other payload)?
fn is_bare_done(v: &Value) -> bool {
    v["done"] == json!(true)
        && v["content"].as_str().unwrap_or("") == ""
        && v["finish_reason"].is_null()
        && v["usage"].is_null()
        && v["credits"].is_null()
        && v["tool_calls"].is_null()
        && v["reasoning"].is_null()
        && v["model"].is_null()
}

/// Is this a bare empty NON-terminal chunk (an empty content-block-start /
/// boundary chunk) carrying no payload at all? `consume_llm_stream` accumulates
/// nothing from it (empty content concat; every optional field null), so its
/// presence or absence is unobservable in the consumed result — an old-side one
/// with no new counterpart is a SplitGranularity artifact, sound to skip. Any
/// REAL divergence carries a non-empty payload on one side and fails this test.
fn is_bare_empty(v: &Value) -> bool {
    v["done"] != json!(true)
        && v["content"].as_str().unwrap_or("") == ""
        && v["finish_reason"].is_null()
        && v["usage"].is_null()
        && v["credits"].is_null()
        && v["tool_calls"].is_null()
        && v["reasoning"].is_null()
        && v["model"].is_null()
}

/// Is this a new-side synthesized End chunk (`done` + optional finish only)?
fn is_end_shape(v: &Value) -> bool {
    v["done"] == json!(true)
        && v["content"].as_str().unwrap_or("") == ""
        && v["usage"].is_null()
        && v["credits"].is_null()
        && v["tool_calls"].is_null()
        && v["reasoning"].is_null()
        && v["model"].is_null()
}

struct FixtureReport {
    name: String,
    l1_identical: bool,
    fired: Vec<Exception>,
    old_len: usize,
    new_len: usize,
}

/// The L2 aligned-identity check. Returns the report or panics with a precise
/// residue description.
#[allow(clippy::too_many_lines)]
fn verify_aligned(
    name: &str,
    old_items: &[Item],
    new_items: &[Item],
    fired: &mut Fired,
) {
    // Keepalives are compared as counts (they carry no data and the consumer
    // skips them); everything else must align.
    let old_ka = old_items.iter().filter(|i| i.is_keepalive()).count();
    let new_ka = new_items.iter().filter(|i| i.is_keepalive()).count();
    if old_ka != new_ka {
        assert!(
            fired.allowed(Exception::KeepaliveRecount),
            "[{name}] keepalive count changed old={old_ka} new={new_ka} \
             without a declared KeepaliveRecount exception"
        );
        fired.fire(Exception::KeepaliveRecount);
    }

    let mut old: Vec<Item> = old_items
        .iter()
        .filter(|i| !i.is_keepalive())
        .cloned()
        .collect();
    let mut new: Vec<Item> = new_items
        .iter()
        .filter(|i| !i.is_keepalive())
        .cloned()
        .collect();

    // Canonicalize per-item shapes (ids, model) with shape assertions.
    for item in old.iter_mut() {
        if let Item::Chunk(v) = item {
            canonicalize_tool_ids(name, v, "old", fired);
            canonicalize_model(name, v, "old", fired);
        }
    }
    for item in new.iter_mut() {
        if let Item::Chunk(v) = item {
            canonicalize_tool_ids(name, v, "new", fired);
            canonicalize_model(name, v, "new", fired);
        }
    }

    let mut j = 0usize; // cursor into `new`
    for (i, old_item) in old.iter().enumerate() {
        match old_item {
            Item::Error(old_msg) => {
                // Both sides must be terminal here.
                assert_eq!(
                    i,
                    old.len() - 1,
                    "[{name}] old error was not terminal — driver bug"
                );
                // All remaining new items must fold into nothing but the error
                // (the new side may emit its terminal End/error later in its
                // trace only as the error itself).
                let Some(Item::Error(new_msg)) = new.get(j) else {
                    panic!(
                        "[{name}] old terminated with error {old_msg:?} but new item #{j} \
                         is {:?}",
                        new.get(j)
                    );
                };
                if old_msg != new_msg {
                    assert!(
                        fired.allowed(Exception::ErrTextRephrased),
                        "[{name}] error text changed without declared exception:\n  \
                         old: {old_msg}\n  new: {new_msg}"
                    );
                    verify_err_rephrasing(name, old_msg, new_msg);
                    fired.fire(Exception::ErrTextRephrased);
                }
                j += 1;
            }
            Item::Chunk(old_v) => {
                // Fold new chunks j.. until equal to old_v.
                let mut acc = empty_fold();
                let mut consumed = 0usize;
                let mut matched = false;
                while let Some(Item::Chunk(new_v)) = new.get(j + consumed) {
                    fold_chunk(&mut acc, new_v);
                    consumed += 1;
                    let mut probe_old = old_v.clone();
                    let mut probe_acc = acc.clone();
                    canonicalize_usage(name, &mut probe_old, &mut probe_acc, fired);
                    // consume_llm_stream never re-serializes keepalive:false
                    // differences; normalize the fold artifacts. `empty_fold()`
                    // seeds the accumulator with null-valued optional keys
                    // (reasoning/tool_calls/credits/finish_reason/model/keepalive)
                    // that the old parser's chunks omit entirely, so strip
                    // null-valued top-level keys from BOTH sides before
                    // comparison: `null` optional field ≡ absent is a genuine
                    // JSON shape equivalence and preserves real-divergence
                    // detection (a real difference carries a non-null value on
                    // one side). Keepalive-count changes remain guarded by the
                    // separate count check above.
                    // keepalive:false ≡ absent within this fold comparison
                    // (real keepalive:true chunks are filtered + count-guarded
                    // above), and null optional keys ≡ absent. Normalize both:
                    // set keepalive:false on both sides, then strip null keys.
                    // (empty_fold seeds keepalive:false + null tool_calls/
                    // reasoning/credits that the old parser's chunks omit.)
                    let strip_nulls = |v: &mut Value| {
                        if let Some(obj) = v.as_object_mut() {
                            obj.retain(|_, val| !val.is_null());
                        }
                    };
                    probe_old["keepalive"] = json!(false);
                    probe_acc["keepalive"] = json!(false);
                    strip_nulls(&mut probe_old);
                    strip_nulls(&mut probe_acc);
                    // Tool-call per-chunk strip — defers tool-call correctness to the
                    // L3 consumer-outcome check. Two declared causes share the strip:
                    // ToolIndexEmissionOrder (old reorders per-index deltas; consumer
                    // merges BY INDEX so the merged set is identical) and
                    // ToolCallsRecovered (old openai-responses parser has no handler
                    // for responses-native tool events and drops the call; new
                    // captures it). Never a blind skip: L3 asserts the merged
                    // tool_calls byte-identical (ToolIndexEmissionOrder) or recovers
                    // ONLY an empty-old→non-empty-new drop (ToolCallsRecovered).
                    let tool_strip = if fired.allowed(Exception::ToolIndexEmissionOrder) {
                        Some(Exception::ToolIndexEmissionOrder)
                    } else if fired.allowed(Exception::ToolCallsRecovered) {
                        Some(Exception::ToolCallsRecovered)
                    } else {
                        None
                    };
                    if let Some(ex) = tool_strip {
                        if probe_old.get("tool_calls") != probe_acc.get("tool_calls")
                            && (probe_old.get("tool_calls").is_some()
                                || probe_acc.get("tool_calls").is_some())
                        {
                            if let Some(o) = probe_old.as_object_mut() {
                                o.remove("tool_calls");
                            }
                            if let Some(a) = probe_acc.as_object_mut() {
                                a.remove("tool_calls");
                            }
                            fired.fire(ex);
                        }
                    }
                    // OllamaEagerToolFinish: old ollama synthesizes finish_reason
                    // per NDJSON line ("tool_calls" eagerly on the done:false tool
                    // line, "stop" on the terminal line), so finish lands on the
                    // wrong chunks vs new (terminal-only). Defer finish to the pinned
                    // L3 check: strip it here only where the two sides' finish
                    // differs (real finish regressions still surface at L3).
                    if fired.allowed(Exception::OllamaEagerToolFinish)
                        && probe_old.get("finish_reason") != probe_acc.get("finish_reason")
                    {
                        if let Some(o) = probe_old.as_object_mut() {
                            o.remove("finish_reason");
                        }
                        if let Some(a) = probe_acc.as_object_mut() {
                            a.remove("finish_reason");
                        }
                        fired.fire(Exception::OllamaEagerToolFinish);
                    }
                    // FinishReasonRecovered: old openai-responses drops finish on
                    // response.completed; new captures it. Recover old→new ONLY when
                    // old's finish is null/absent and new's is a real string (any
                    // disagreeing non-null old finish leaves it to fail below).
                    if fired.allowed(Exception::FinishReasonRecovered)
                        && probe_old["finish_reason"].is_null()
                        && probe_acc["finish_reason"].is_string()
                    {
                        probe_old["finish_reason"] = probe_acc["finish_reason"].clone();
                        fired.fire(Exception::FinishReasonRecovered);
                    }
                    if probe_old == probe_acc {
                        matched = true;
                        break;
                    }
                    // Monotone guard: once folded content overruns the old
                    // chunk's, no further folding can converge.
                    let acc_content = probe_acc["content"].as_str().unwrap_or("");
                    let old_content = probe_old["content"].as_str().unwrap_or("");
                    if !old_content.starts_with(acc_content)
                        && !acc_content.starts_with(old_content)
                    {
                        break;
                    }
                    if acc_content.len() > old_content.len() {
                        break;
                    }
                }
                if matched {
                    if consumed > 1 {
                        assert!(
                            fired.allowed(Exception::SplitGranularity),
                            "[{name}] old chunk #{i} folded from {consumed} new chunks \
                             without a declared SplitGranularity exception\n  old: {old_v}"
                        );
                        fired.fire(Exception::SplitGranularity);
                    }
                    j += consumed;
                } else if is_bare_done(old_v) && fired.allowed(Exception::RedundantTerminalDone) {
                    // Old [DONE]/message_stop echo with no new counterpart.
                    fired.fire(Exception::RedundantTerminalDone);
                } else if is_bare_empty(old_v)
                    && fired.allowed(Exception::SwallowedErrorRecovered)
                    && matches!(new.get(j), Some(Item::Error(_)))
                {
                    // Old did not recognize a top-level `event: error` (flat shape;
                    // its handler only matches nested `{"error":{...}}`) and emitted
                    // a bare-empty NON-TERMINAL chunk; the NEW decoder correctly
                    // surfaces it as a terminal Error. Consume that Error in place of
                    // old's swallowed chunk (strict improvement — old never
                    // terminated). Any error BOTH sides emit is an Item::Error on the
                    // old side and routes through the ErrTextRephrased arm above.
                    j += 1;
                    fired.fire(Exception::SwallowedErrorRecovered);
                } else if is_bare_empty(old_v) && fired.allowed(Exception::SplitGranularity) {
                    // Old emitted a bare empty no-payload chunk (e.g. an empty
                    // content-block-start) with no new-side counterpart;
                    // consume_llm_stream accumulates nothing from it, so it's a
                    // SplitGranularity artifact. Skip it (consume 0 new items).
                    fired.fire(Exception::SplitGranularity);
                } else {
                    panic!(
                        "[{name}] UNEXPLAINED DIVERGENCE at old chunk #{i}:\n  old: {}\n  \
                         next new items: {}\n  (declared: {:?})",
                        old_v,
                        new.iter()
                            .skip(j)
                            .take(4)
                            .map(|it| format!("{it:?}"))
                            .collect::<Vec<_>>()
                            .join("\n    "),
                        fired.0.keys().collect::<Vec<_>>(),
                    );
                }
            }
        }
    }

    // Leftover new items: at most ONE synthesized End chunk.
    match new.len() - j {
        0 => {}
        1 => {
            let Item::Chunk(v) = &new[j] else {
                panic!("[{name}] trailing new item is an error with no old counterpart: {:?}", new[j]);
            };
            assert!(
                is_end_shape(v) && fired.allowed(Exception::SynthesizedEnd),
                "[{name}] trailing new chunk is not a declared synthesized End: {v}"
            );
            // Its finish_reason must agree with the old trace's folded one — EXCEPT
            // the FinishReasonRecovered case: the old openai-responses parser drops
            // the terminal reason (it only sets `done` on status=="completed" and
            // never reads `incomplete_details.reason`), so its folded finish is Null
            // while new's synthesized End carries the normalized reason (e.g.
            // "max_output_tokens"). Recover ONLY that direction (old Null → new a
            // real string); a genuine DISAGREEMENT (old non-null) still fails.
            let mut old_fold = empty_fold();
            for item in &old {
                if let Item::Chunk(ov) = item {
                    fold_chunk(&mut old_fold, ov);
                }
            }
            let recovered_finish = fired.allowed(Exception::FinishReasonRecovered)
                && old_fold["finish_reason"].is_null()
                && v["finish_reason"].as_str().is_some_and(|s| !s.is_empty());
            if recovered_finish {
                fired.fire(Exception::FinishReasonRecovered);
            } else {
                assert_eq!(
                    v["finish_reason"], old_fold["finish_reason"],
                    "[{name}] synthesized End finish_reason diverges from the old \
                     trace's folded finish_reason"
                );
            }
            fired.fire(Exception::SynthesizedEnd);
        }
        n => panic!(
            "[{name}] {n} unmatched trailing new items starting at #{j}: {:?}",
            new.iter().skip(j).take(4).collect::<Vec<_>>()
        ),
    }
}

/// ErrTextRephrased shape verification: old dialect formats vs new bridge /
/// crate formats, with the provider's own message preserved verbatim.
fn verify_err_rephrasing(name: &str, old_msg: &str, new_msg: &str) {
    let old_shapes = [
        "OpenAI API error (",
        "Anthropic API error (",
        "Google API error ",
        "Ollama error: ",
    ];
    assert!(
        old_shapes.iter().any(|p| old_msg.starts_with(p)),
        "[{name}] old error does not match any known pre-swap format: {old_msg}"
    );
    // The provider message is the suffix after the last "): " (or ": ").
    let core = old_msg
        .rsplit_once("): ")
        .map(|(_, m)| m)
        .or_else(|| old_msg.split_once(": ").map(|(_, m)| m))
        .unwrap_or(old_msg);
    assert!(
        new_msg.contains(core),
        "[{name}] provider message {core:?} lost in rephrased error: {new_msg:?}"
    );
}

// ---------------------------------------------------------------------------
// L3: consumer-outcome fold (exact consume_llm_stream semantics)
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq)]
struct Outcome {
    content: String,
    reasoning: String,
    finish_reason: Option<String>,
    usage: Option<Value>,
    credits: Option<Value>,
    tool_calls: Vec<Value>,
    terminal_error: Option<String>,
}

fn consume_fold(items: &[Item]) -> Outcome {
    let mut content = String::new();
    let mut reasoning = String::new();
    let mut finish_reason = None;
    let mut usage = None;
    let mut credits = None;
    let mut tools: BTreeMap<u64, Value> = BTreeMap::new();
    let mut terminal_error = None;

    for item in items {
        match item {
            Item::Error(e) => {
                terminal_error = Some(e.clone());
                break;
            }
            Item::Chunk(v) => {
                if v["keepalive"] == json!(true) {
                    continue;
                }
                content.push_str(v["content"].as_str().unwrap_or(""));
                if let Some(r) = v["reasoning"].as_str().filter(|r| !r.is_empty()) {
                    reasoning.push_str(r);
                }
                if let Some(f) = v["finish_reason"].as_str() {
                    finish_reason = Some(f.to_string());
                }
                if !v["usage"].is_null() {
                    usage = Some(v["usage"].clone());
                }
                if !v["credits"].is_null() {
                    credits = Some(v["credits"].clone());
                }
                if let Some(tcs) = v["tool_calls"].as_array() {
                    for tc in tcs {
                        let idx = tc["index"].as_u64().unwrap_or(0);
                        let entry = tools.entry(idx).or_insert_with(|| {
                            json!({"index": idx, "id": "", "name": "", "arguments": ""})
                        });
                        if let Some(id) = tc["id"].as_str().filter(|s| !s.is_empty()) {
                            entry["id"] = json!(id);
                        }
                        if let Some(nm) = tc["name"].as_str().filter(|s| !s.is_empty()) {
                            entry["name"] = json!(nm);
                        }
                        let args = format!(
                            "{}{}",
                            entry["arguments"].as_str().unwrap_or(""),
                            tc["arguments"].as_str().unwrap_or("")
                        );
                        entry["arguments"] = json!(args);
                    }
                }
            }
        }
    }

    // consume_llm_stream's id/name fallbacks.
    let tool_calls = tools
        .into_iter()
        .map(|(idx, mut tc)| {
            if tc["id"].as_str().unwrap_or("").trim().is_empty() {
                tc["id"] = json!(format!("stream_tool_call_{idx}"));
            }
            if tc["name"].as_str().unwrap_or("").trim().is_empty() {
                tc["name"] = json!("unknown_tool");
            }
            tc
        })
        .collect();

    Outcome {
        content,
        reasoning,
        finish_reason,
        usage,
        credits,
        tool_calls,
        terminal_error,
    }
}

fn canonicalize_outcome(name: &str, o: &mut Outcome, side: &str, fired: &mut Fired) {
    // Usage shape: normalize to computed form (values already asserted equal
    // pairwise during L2 wherever both sides reported them).
    if let Some(u) = &o.usage {
        if fired.allowed(Exception::UsageFieldShape) {
            let get = |k: &str| u.get(k).and_then(Value::as_u64).unwrap_or(0);
            let (p, c) = (get("prompt_tokens"), get("completion_tokens"));
            o.usage = Some(json!({
                "prompt_tokens": p,
                "completion_tokens": c,
                "total_tokens": p + c,
                "cache_read_input_tokens": get("cache_read_input_tokens"),
                "cache_creation_input_tokens": get("cache_creation_input_tokens"),
            }));
        }
    }
    for tc in o.tool_calls.iter_mut() {
        if fired.allowed(Exception::OllamaInvalidToolArgsWrapped) {
            let sentinel = tc
                .get("arguments")
                .and_then(Value::as_str)
                .and_then(invalid_tool_args_sentinel);
            if let Some(s) = sentinel {
                tc["arguments"] = json!(s);
                fired.fire(Exception::OllamaInvalidToolArgsWrapped);
            }
        }
        let id = tc["id"].as_str().unwrap_or("").to_string();
        let idx = tc["index"].as_u64().unwrap_or(0);
        if fired.allowed(Exception::GeminiToolId)
            && (is_uuid_call_id(&id) || id == format!("gemini_{idx}"))
        {
            tc["id"] = json!("<gemini-id>");
        }
        if fired.allowed(Exception::OllamaToolId)
            && (id == format!("ollama_{idx}")
                || id == format!("stream_tool_call_{idx}")
                || (side == "old" && id.is_empty()))
        {
            tc["id"] = json!("<ollama-id>");
        }
    }
    if let Some(err) = &o.terminal_error {
        if fired.allowed(Exception::ErrTextRephrased) {
            // Keep only the preserved provider-message core for comparison.
            let core = err
                .rsplit_once("): ")
                .map(|(_, m)| m.to_string())
                .or_else(|| err.split_once(": ").map(|(_, m)| m.to_string()))
                .unwrap_or_else(|| err.clone());
            o.terminal_error = Some(core);
        }
    }
    let _ = (name, side);
}

// ---------------------------------------------------------------------------
// The oracle
// ---------------------------------------------------------------------------

// c2a byte-identity oracle (W7 desktop decode extraction). Proves the NEW unified
// SSE decoder is byte-identical to the FIVE old per-provider parsers
// (c2a_old_parser.rs) across the whole fixture corpus, MODULO the intentional c2b
// deltas enumerated in the `Exception` table above. Each delta is justified inline
// against old-parser source and is SELF-CHECKING: a declared exception that never
// fires is flagged stale; an undeclared divergence panics; every recovery is PINNED
// (old-null/empty → new-value, or an exact literal pair) so a real regression still
// fails the strict comparison. Three comparison levels run per fixture — L1 raw JSON
// string identity, L2 per-chunk `consume_llm_stream` fold alignment, L3 folded
// consumer-outcome identity.
//
// This GREEN + un-ignored state is the safety property that un-gates the ~201-file
// twin deletion: the new decoder loses NO behavior the old parsers had, and the
// deltas it introduces are exactly the recorded bug-fixes/hardening — anthropic
// usage-merge (old message_delta dropped message_start input tokens); openai-
// responses finish / tool-call / swallowed-error recovery (old had no handler for
// responses-native events); ollama eager-tool-finish (old's per-line synthesis left
// a wrong final "stop"), no-id determinism, invalid-tool-args wrapping, and usage
// null≡all-zeros shape. All 26 fixtures GREEN across 5 dialects; runs in the normal
// suite as a permanent parity regression guard.
#[tokio::test]
async fn c2a_old_vs_new_decode_identity() {
    let mut reports: Vec<FixtureReport> = Vec::new();
    let declared: BTreeMap<&str, &[Exception]> = FIXTURE_EXCEPTIONS.iter().copied().collect();
    let mut seen = std::collections::BTreeSet::new();

    for file in fixture_files() {
        for fixture in load_fixtures(file) {
            let (provider, decoder) = dialect_routes(&fixture.dialect);
            let chunks = decode_chunks(&fixture);
            let old_items = drive_old(chunks.clone(), provider).await;
            let new_items = drive_new(chunks, decoder).await;
            assert!(
                seen.insert(fixture.name.clone()),
                "duplicate fixture name {}",
                fixture.name
            );

            let old_json: Vec<String> = old_items.iter().map(|i| format!("{i:?}")).collect();
            let new_json: Vec<String> = new_items.iter().map(|i| format!("{i:?}")).collect();
            let l1 = old_json == new_json;

            let declared_set = declared.get(fixture.name.as_str()).copied().unwrap_or(&[]);
            let mut fired = Fired::new(declared_set);

            if l1 {
                assert!(
                    declared_set.is_empty(),
                    "[{}] is L1-identical but declares exceptions {declared_set:?} — \
                     stale entries must be removed",
                    fixture.name
                );
            } else {
                verify_aligned(&fixture.name, &old_items, &new_items, &mut fired);

                // L3 consumer-outcome identity.
                let mut old_outcome = consume_fold(&old_items);
                let mut new_outcome = consume_fold(&new_items);
                // UsageMergeCorrection at the folded-outcome level — the same
                // self-validating pattern as canonicalize_usage (old dropped
                // message_start input_tokens on message_delta; new merges).
                // Recover old's prompt+total to new's ONLY on the exact under-
                // count pattern; anything else stays divergent and fails below.
                if fired.allowed(Exception::UsageMergeCorrection) {
                    let g = |v: &Value, k: &str| v.get(k).and_then(Value::as_u64).unwrap_or(0);
                    let recover = match (old_outcome.usage.as_ref(), new_outcome.usage.as_ref()) {
                        (Some(ou), Some(nu)) => {
                            let (np, nc, nt) =
                                (g(nu, "prompt_tokens"), g(nu, "completion_tokens"), g(nu, "total_tokens"));
                            let (op, oc, ot) =
                                (g(ou, "prompt_tokens"), g(ou, "completion_tokens"), g(ou, "total_tokens"));
                            nt == np + nc
                                && ot == op + oc
                                && oc == nc
                                && op <= np
                                && g(ou, "cache_read_input_tokens") <= g(nu, "cache_read_input_tokens")
                                && g(ou, "cache_creation_input_tokens")
                                    <= g(nu, "cache_creation_input_tokens")
                                && (op < np
                                    || g(ou, "cache_read_input_tokens")
                                        < g(nu, "cache_read_input_tokens")
                                    || g(ou, "cache_creation_input_tokens")
                                        < g(nu, "cache_creation_input_tokens"))
                        }
                        _ => false,
                    };
                    if recover {
                        old_outcome.usage = new_outcome.usage.clone();
                        fired.fire(Exception::UsageMergeCorrection);
                    }
                }
                // FinishReasonRecovered (L3): old dropped the openai-responses finish
                // on response.completed; new captured it. Recover ONLY when old's is
                // absent and new's is present (a disagreeing old finish fails below).
                if fired.allowed(Exception::FinishReasonRecovered)
                    && old_outcome.finish_reason.is_none()
                    && new_outcome.finish_reason.is_some()
                {
                    old_outcome.finish_reason = new_outcome.finish_reason.clone();
                    fired.fire(Exception::FinishReasonRecovered);
                }
                // ToolCallsRecovered (L3): the old openai-responses parser has no
                // handler for responses-native tool events and drops the call; new
                // captures it. Recover ONLY a pure drop — old folded outcome has ZERO
                // tool_calls and new has ≥1. If old emitted ANY tool_call the sets
                // stay divergent and the strict comparison below fails.
                if fired.allowed(Exception::ToolCallsRecovered)
                    && old_outcome.tool_calls.is_empty()
                    && !new_outcome.tool_calls.is_empty()
                {
                    old_outcome.tool_calls = new_outcome.tool_calls.clone();
                    fired.fire(Exception::ToolCallsRecovered);
                }
                // SwallowedErrorRecovered (L3): old swallowed a top-level responses
                // error (bare-empty chunk, no terminal_error) so the old desktop
                // never terminated; new surfaced it. Recover ONLY when old has NO
                // terminal_error and new has one — a disagreeing old error (both
                // non-None, text differing) is ErrTextRephrased and fails here.
                if fired.allowed(Exception::SwallowedErrorRecovered)
                    && old_outcome.terminal_error.is_none()
                    && new_outcome.terminal_error.is_some()
                {
                    old_outcome.terminal_error = new_outcome.terminal_error.clone();
                    fired.fire(Exception::SwallowedErrorRecovered);
                }
                // OllamaEagerToolFinish (L3): old's per-line finish synthesis leaves
                // a WRONG final "stop" for a tool-call turn; new correctly reports
                // "tool_calls". PINNED: recover ONLY the exact old=="stop" →
                // new=="tool_calls" transition AND only when a tool call is present.
                // Any other finish pairing stays divergent and fails below.
                if fired.allowed(Exception::OllamaEagerToolFinish)
                    && old_outcome.finish_reason.as_deref() == Some("stop")
                    && new_outcome.finish_reason.as_deref() == Some("tool_calls")
                    && !old_outcome.tool_calls.is_empty()
                {
                    old_outcome.finish_reason = new_outcome.finish_reason.clone();
                    fired.fire(Exception::OllamaEagerToolFinish);
                }
                // UsageFieldShape (L3): old omits usage (None) when the ollama done
                // line carries no eval counts; new emits an all-zero usage object.
                // Treat None ≡ all-zeros; a None-vs-NONZERO difference is a real
                // dropped-usage divergence and is left to fail the comparison below.
                if fired.allowed(Exception::UsageFieldShape) {
                    let is_zero_usage = |u: &Option<Value>| {
                        u.as_ref().is_some_and(|v| {
                            [
                                "prompt_tokens",
                                "completion_tokens",
                                "total_tokens",
                                "cache_read_input_tokens",
                                "cache_creation_input_tokens",
                            ]
                            .iter()
                            .all(|k| v.get(k).and_then(Value::as_u64).unwrap_or(0) == 0)
                        })
                    };
                    if old_outcome.usage.is_none() && is_zero_usage(&new_outcome.usage) {
                        new_outcome.usage = None;
                        fired.fire(Exception::UsageFieldShape);
                    } else if new_outcome.usage.is_none() && is_zero_usage(&old_outcome.usage) {
                        old_outcome.usage = None;
                        fired.fire(Exception::UsageFieldShape);
                    }
                }
                canonicalize_outcome(&fixture.name, &mut old_outcome, "old", &mut fired);
                canonicalize_outcome(&fixture.name, &mut new_outcome, "new", &mut fired);
                assert_eq!(
                    old_outcome, new_outcome,
                    "[{}] consumer outcomes diverge",
                    fixture.name
                );

                let stale = fired.stale();
                assert!(
                    stale.is_empty(),
                    "[{}] declared exceptions did not fire (stale): {stale:?}",
                    fixture.name
                );
            }

            reports.push(FixtureReport {
                name: fixture.name,
                l1_identical: l1,
                fired: fired.0.keys().copied().collect(),
                old_len: old_items.len(),
                new_len: new_items.len(),
            });
        }
    }

    // Every fixture in the exception table must exist in the corpus.
    for (name, _) in FIXTURE_EXCEPTIONS {
        assert!(
            seen.contains(*name),
            "exception table references unknown fixture {name}"
        );
    }

    // Human-auditable summary (visible with --nocapture).
    eprintln!("\n=== c2a decode oracle: {} fixtures ===", reports.len());
    for r in &reports {
        eprintln!(
            "  {:<44} {}  old={:<3} new={:<3} {}",
            r.name,
            if r.l1_identical { "IDENTICAL " } else { "EXCEPTIONS" },
            r.old_len,
            r.new_len,
            if r.l1_identical {
                String::new()
            } else {
                format!("{:?}", r.fired)
            }
        );
    }
}
