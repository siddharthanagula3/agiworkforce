#![cfg(not(target_os = "windows"))]

use std::sync::Arc;

use anyhow::Result;
use agiworkforce_core::AgiworkforceThread;
use agiworkforce_protocol::protocol::EventMsg;
use agiworkforce_protocol::protocol::Op;
use agiworkforce_protocol::protocol::UndoCompletedEvent;
use core_test_support::test_codex::TestAgiworkforceHarness;
use core_test_support::test_codex::test_codex;
use core_test_support::wait_for_event_match;
use pretty_assertions::assert_eq;

async fn undo_harness() -> Result<TestAgiworkforceHarness> {
    TestAgiworkforceHarness::with_builder(test_codex().with_model("gpt-5.4")).await
}

async fn invoke_undo(codex: &Arc<AgiworkforceThread>) -> Result<UndoCompletedEvent> {
    codex.submit(Op::Undo).await?;
    let event = wait_for_event_match(codex, |msg| match msg {
        EventMsg::UndoCompleted(done) => Some(done.clone()),
        _ => None,
    })
    .await;
    Ok(event)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn undo_reports_feature_removal() -> Result<()> {
    let harness = undo_harness().await?;
    let codex = Arc::clone(&harness.test().codex);

    let event = invoke_undo(&codex).await?;

    assert!(!event.success, "expected undo to fail");
    assert_eq!(
        event.message.as_deref(),
        Some("Undo is no longer available.")
    );

    Ok(())
}
