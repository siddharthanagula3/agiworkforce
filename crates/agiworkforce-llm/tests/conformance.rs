//! Conformance fixtures: replay raw provider byte chunks through the dialect
//! stream runners and assert the exact StreamEvent sequence + assembled
//! ChatOutcome; replay canned HTTP error responses through the classifier.
//!
//! Fixture files live in `tests/fixtures/*.jsonl`:
//!
//! Stream replay:
//!   {"name", "dialect", "chunks": [base64 raw bytes...],
//!    "expected_events": [StreamEvent JSON...], "expected_outcome": {...}}
//!
//! HTTP classification:
//!   {"name", "provider", "model"?, "status", "retry_after"?, "body",
//!    "expected": {"kind", "retry_after"?, "required_tier"?, "feature"?,
//!                 "message_contains"?}}
//!
//! These byte sequences are the frozen decode contract for stage c2's desktop
//! swap: the desktop parser must produce the same events from the same bytes.

use std::time::Duration;

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as B64;
use bytes::Bytes;
use serde::Deserialize;

use agiworkforce_llm::{
    LlmError, StreamEvent, classify_error_response, run_anthropic_stream, run_gemini_stream,
    run_ollama_stream, run_openai_compat_stream,
};

const IDLE_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Deserialize)]
struct StreamFixture {
    name: String,
    dialect: String,
    chunks: Vec<String>,
    expected_events: Vec<serde_json::Value>,
    expected_outcome: Option<serde_json::Value>,
}

fn load_fixtures<T: serde::de::DeserializeOwned>(file: &str) -> Vec<T> {
    let path = format!("{}/tests/fixtures/{file}", env!("CARGO_MANIFEST_DIR"));
    let content = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("fixture file {path} must be readable: {e}"));
    let fixtures: Vec<T> = content
        .lines()
        .filter(|l| !l.trim().is_empty() && !l.trim_start().starts_with('#'))
        .map(|l| {
            serde_json::from_str(l).unwrap_or_else(|e| panic!("bad fixture line in {file}: {e}\n{l}"))
        })
        .collect();
    assert!(!fixtures.is_empty(), "{file} must contain fixtures");
    fixtures
}

async fn replay(fixture: StreamFixture) {
    let name = fixture.name.clone();
    let chunks: Vec<Result<Bytes, LlmError>> = fixture
        .chunks
        .iter()
        .map(|b64| {
            Ok(Bytes::from(B64.decode(b64).unwrap_or_else(|e| {
                panic!("[{name}] chunk must be valid base64: {e}")
            })))
        })
        .collect();
    let stream = futures_util::stream::iter(chunks);

    let mut events: Vec<serde_json::Value> = Vec::new();
    let mut on_event = |event: StreamEvent| {
        events.push(serde_json::to_value(&event).expect("StreamEvent serializes"));
    };

    let outcome = match fixture.dialect.as_str() {
        "anthropic" => run_anthropic_stream(stream, IDLE_TIMEOUT, &mut on_event).await,
        "gemini" => run_gemini_stream(stream, IDLE_TIMEOUT, &mut on_event).await,
        "ollama" => run_ollama_stream(stream, IDLE_TIMEOUT, &mut on_event).await,
        "openai" => run_openai_compat_stream(stream, IDLE_TIMEOUT, &mut on_event).await,
        other => panic!("[{name}] unknown dialect {other}"),
    }
    .unwrap_or_else(|e| panic!("[{name}] stream replay must succeed, got error: {e}"));

    assert_eq!(
        events, fixture.expected_events,
        "[{name}] event sequence mismatch"
    );

    if let Some(expected_outcome) = fixture.expected_outcome {
        let got = serde_json::to_value(&outcome).expect("ChatOutcome serializes");
        assert_eq!(got, expected_outcome, "[{name}] outcome mismatch");
    }
}

async fn replay_file(file: &str) {
    for fixture in load_fixtures::<StreamFixture>(file) {
        replay(fixture).await;
    }
}

#[tokio::test]
async fn openai_stream_fixtures() {
    replay_file("openai.jsonl").await;
}

#[tokio::test]
async fn anthropic_stream_fixtures() {
    replay_file("anthropic.jsonl").await;
}

#[tokio::test]
async fn gemini_stream_fixtures() {
    replay_file("gemini.jsonl").await;
}

#[tokio::test]
async fn ollama_stream_fixtures() {
    replay_file("ollama.jsonl").await;
}

// ---------------------------------------------------------------------------
// HTTP error classification fixtures
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct HttpFixture {
    name: String,
    provider: String,
    #[serde(default)]
    model: Option<String>,
    status: u16,
    #[serde(default)]
    retry_after: Option<String>,
    body: String,
    expected: HttpExpectation,
}

#[derive(Debug, Deserialize)]
struct HttpExpectation {
    kind: String,
    #[serde(default)]
    retry_after: Option<u64>,
    #[serde(default)]
    required_tier: Option<String>,
    #[serde(default)]
    feature: Option<String>,
    #[serde(default)]
    message_contains: Option<String>,
}

#[test]
fn http_error_classification_fixtures() {
    for fixture in load_fixtures::<HttpFixture>("http_errors.jsonl") {
        let name = &fixture.name;
        let err = classify_error_response(
            &fixture.provider,
            fixture.model.as_deref().unwrap_or("test-model"),
            fixture.status,
            fixture.retry_after.as_deref(),
            &fixture.body,
        );
        assert_eq!(err.kind(), fixture.expected.kind, "[{name}] kind mismatch: {err}");
        if let Some(expected_retry) = fixture.expected.retry_after {
            assert_eq!(
                err.retry_after(),
                Some(expected_retry),
                "[{name}] retry_after mismatch"
            );
        }
        if let Some(expected_tier) = &fixture.expected.required_tier {
            let LlmError::Paywall { required_tier, .. } = &err else {
                panic!("[{name}] expected paywall, got {err}");
            };
            assert_eq!(required_tier, expected_tier, "[{name}] tier mismatch");
        }
        if let Some(expected_feature) = &fixture.expected.feature {
            let LlmError::Paywall { feature, .. } = &err else {
                panic!("[{name}] expected paywall, got {err}");
            };
            assert_eq!(feature, expected_feature, "[{name}] feature mismatch");
        }
        if let Some(fragment) = &fixture.expected.message_contains {
            let msg = err.to_string();
            assert!(
                msg.contains(fragment.as_str()),
                "[{name}] message must contain {fragment:?}, got: {msg}"
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Idle-timeout stall (not fixture-encodable: needs a stream that hangs)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn idle_timeout_stall_yields_structured_error() {
    let stream = futures_util::stream::pending::<Result<Bytes, LlmError>>();
    let mut events = Vec::new();
    let mut on_event = |event: StreamEvent| events.push(event);
    let err = run_openai_compat_stream(stream, Duration::from_millis(50), &mut on_event)
        .await
        .expect_err("a silent stream must time out");
    assert!(matches!(err, LlmError::IdleTimeout { .. }), "got: {err}");
    assert!(err.to_string().starts_with("Streaming timed out: no data received for"));
    assert!(events.is_empty(), "no events on a silent stream");
}

// ---------------------------------------------------------------------------
// Mid-stream read error surfaces as LlmError::Read
// ---------------------------------------------------------------------------

#[tokio::test]
async fn mid_stream_read_error_propagates() {
    let chunks: Vec<Result<Bytes, LlmError>> = vec![
        Ok(Bytes::from_static(
            b"data: {\"choices\":[{\"delta\":{\"content\":\"par\"}}]}\n\n",
        )),
        Err(LlmError::Read {
            message: "connection reset by peer".into(),
        }),
    ];
    let stream = futures_util::stream::iter(chunks);
    let mut seen_text = String::new();
    let mut on_event = |event: StreamEvent| {
        if let StreamEvent::TextDelta { text } = event {
            seen_text.push_str(&text);
        }
    };
    let err = run_openai_compat_stream(stream, IDLE_TIMEOUT, &mut on_event)
        .await
        .expect_err("read error must propagate");
    assert!(matches!(err, LlmError::Read { .. }), "got: {err}");
    assert_eq!(seen_text, "par", "deltas before the failure still stream");
}
