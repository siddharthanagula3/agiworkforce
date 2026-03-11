// apps/desktop/src-tauri/src/sys/commands/interactive.rs

//! Tauri IPC commands for interactive tool features (e.g., question prompts).

use crate::core::llm::tool_executor::interactive_tools;

/// Submit the user's answer to a pending interactive question.
///
/// Called by the frontend when the user selects choice(s) for a question
/// that was emitted via the `question:ask` event channel.
#[tauri::command]
pub async fn question_answer(id: String, answer: serde_json::Value) -> Result<(), String> {
    interactive_tools::submit_question_answer(id, answer)
        .await
        .map_err(|e| e.to_string())
}
