use agiworkforce_agent_core::context::{
    ContextCompactionConfig, ContextSummarizer, ContextUsageAnchor, SummaryRequest, SummarySource,
    UNTRUSTED_SUMMARY_MARKER, compact_context, context_budget, format_summary_input,
};
use agiworkforce_agent_core::{ContentBlock, Message};
use anyhow::Result;
use async_trait::async_trait;
use std::sync::Mutex;

struct RecordingSummarizer {
    requests: Mutex<Vec<SummaryRequest>>,
    response: Result<String, String>,
}

#[async_trait]
impl ContextSummarizer for RecordingSummarizer {
    async fn summarize(&self, request: SummaryRequest) -> Result<String> {
        self.requests.lock().expect("request lock").push(request);
        self.response.clone().map_err(anyhow::Error::msg)
    }
}

#[test]
fn provider_usage_anchor_calibrates_the_estimate() {
    let messages = vec![
        Message::text("system", "s".repeat(100)),
        Message::text("user", "x".repeat(300)),
    ];
    let estimated = context_budget(&messages, 1_000, 0, None).estimated_tokens;
    let anchor = ContextUsageAnchor {
        observed_input_tokens: estimated * 2,
        estimated_tokens_at_observation: estimated,
    };

    let budget = context_budget(&messages, 1_000, 0, Some(anchor));

    assert_eq!(budget.used_tokens, estimated * 2);
    assert!(budget.provider_anchored);
}

#[test]
fn summary_input_never_includes_image_bytes() {
    let messages = vec![Message::blocks(
        "user",
        vec![ContentBlock::Image {
            mime: "image/png".to_string(),
            data_b64: "sensitive-image-bytes".to_string(),
        }],
    )];

    let formatted = format_summary_input(&messages);

    assert!(formatted.contains("[image: image/png]"));
    assert!(!formatted.contains("sensitive-image-bytes"));
}

#[tokio::test]
async fn shared_compactor_summarizes_untrusted_history_and_preserves_recent_turns() {
    let summarizer = RecordingSummarizer {
        requests: Mutex::new(Vec::new()),
        response: Ok("Decision: keep the Local trust boundary.".to_string()),
    };
    let system = Message::text("system", "trusted system policy");
    let recent_user = Message::text("user", "recent request");
    let recent_assistant = Message::text("assistant", "recent answer");
    let messages = vec![
        system.clone(),
        Message::text("user", "old request ".repeat(160)),
        Message::text("assistant", "old answer ".repeat(160)),
        Message::text("user", "untrusted web output ".repeat(240)),
        recent_user.clone(),
        recent_assistant.clone(),
    ];
    let config = ContextCompactionConfig {
        context_window_tokens: 900,
        reserved_output_tokens: 100,
        preserve_recent_messages: 2,
        ..ContextCompactionConfig::default()
    };

    let result = compact_context(&messages, &config, None, Some(&summarizer)).await;

    assert!(result.compacted);
    assert_eq!(result.summary_source, SummarySource::Model);
    assert_eq!(
        result.messages.first().map(|message| message.role.as_str()),
        Some("system")
    );
    assert_eq!(
        result
            .messages
            .get(result.messages.len() - 2)
            .map(Message::text_content),
        Some(recent_user.text_content())
    );
    assert_eq!(
        result.messages.last().map(Message::text_content),
        Some(recent_assistant.text_content())
    );
    let summary = result.messages.get(1).expect("summary message");
    assert_eq!(summary.role, "assistant");
    assert!(summary.text_content().contains(UNTRUSTED_SUMMARY_MARKER));
    assert!(
        summary
            .text_content()
            .contains("keep the Local trust boundary")
    );
    let requests = summarizer.requests.lock().expect("request lock");
    assert_eq!(requests.len(), 1);
    assert!(requests[0].content_is_untrusted);
    assert_eq!(result.stages.len(), 5);
}

#[tokio::test]
async fn shared_compactor_falls_back_without_losing_the_latest_message() {
    let summarizer = RecordingSummarizer {
        requests: Mutex::new(Vec::new()),
        response: Err("offline".to_string()),
    };
    let latest = Message::text("user", "latest");
    let messages = vec![
        Message::text("system", "policy"),
        Message::text("user", "first ".repeat(220)),
        Message::text("assistant", "second ".repeat(220)),
        latest.clone(),
    ];
    let config = ContextCompactionConfig {
        context_window_tokens: 700,
        reserved_output_tokens: 100,
        preserve_recent_messages: 1,
        ..ContextCompactionConfig::default()
    };

    let result = compact_context(&messages, &config, None, Some(&summarizer)).await;

    assert!(result.compacted);
    assert_eq!(result.summary_source, SummarySource::DeterministicFallback);
    assert_eq!(
        result.messages.last().map(Message::text_content),
        Some(latest.text_content())
    );
    assert!(result.after.used_tokens < result.before.used_tokens);
}
