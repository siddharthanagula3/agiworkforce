use super::*;

use std::sync::{LazyLock, Mutex as StdMutex, MutexGuard};
use tokio::sync::oneshot;

/// Global map of pending question IDs to their oneshot response senders.
///
/// When the agent executes the `question` tool, a oneshot channel is created
/// and the sender is stored here. The frontend receives the question via a
/// Tauri event, collects the user's answer, and calls the `question_answer`
/// Tauri command which resolves the pending sender.
///
/// A std mutex, never held across an await, so `PendingQuestionGuard::drop`
/// can always take it.
static PENDING_QUESTIONS: LazyLock<StdMutex<HashMap<String, oneshot::Sender<Value>>>> =
    LazyLock::new(|| StdMutex::new(HashMap::new()));

fn pending_questions() -> MutexGuard<'static, HashMap<String, oneshot::Sender<Value>>> {
    PENDING_QUESTIONS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl ToolExecutor {
    /// Execute the `question` tool: emit a question event to the frontend and
    /// wait for the user's answer via a oneshot channel.
    ///
    /// Expected arguments:
    /// - `question` (String, required): The question text to display to the user.
    /// - `choices` (Array, required): Array of string choices for the user to pick from.
    /// - `multi_select` (Boolean, optional): Whether the user can select multiple choices.
    ///   Defaults to `false`.
    pub(super) async fn execute_question_tool(
        &self,
        args: &HashMap<String, Value>,
    ) -> Result<ToolResult> {
        let question = args
            .get("question")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'question' string parameter"))?;

        let choices = args
            .get("choices")
            .and_then(|v| v.as_array())
            .ok_or_else(|| anyhow!("Missing required 'choices' array parameter"))?;

        if choices.is_empty() {
            return Ok(ToolResult {
                success: false,
                data: json!({
                    "success": false,
                    "error": "The 'choices' array must contain at least one item"
                }),
                error: Some("The 'choices' array must contain at least one item".to_string()),
                metadata: HashMap::from([("tool_name".to_string(), json!("question"))]),
            });
        }

        // Validate that all choices are strings
        let choice_strings: Vec<String> = choices
            .iter()
            .enumerate()
            .map(|(i, c)| {
                c.as_str()
                    .map(|s| s.to_string())
                    .ok_or_else(|| anyhow!("Choice at index {} is not a string", i))
            })
            .collect::<Result<Vec<String>>>()?;

        let multi_select = args
            .get("multi_select")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let question_id = Uuid::new_v4().to_string();

        // Create oneshot channel for the user's response
        let (tx, rx) = oneshot::channel();

        // Store sender in pending questions map
        pending_questions().insert(question_id.clone(), tx);

        // Emit question event to the frontend
        if let Some(ref app_handle) = self.app_handle {
            if let Err(e) = app_handle.emit(
                "question:ask",
                json!({
                    "id": question_id,
                    "question": question,
                    "choices": choice_strings,
                    "multiSelect": multi_select,
                }),
            ) {
                // Clean up the pending entry on emission failure
                pending_questions().remove(&question_id);
                return Ok(ToolResult {
                    success: false,
                    data: json!({
                        "success": false,
                        "error": format!("Failed to emit question event: {}", e)
                    }),
                    error: Some(format!("Failed to emit question event: {}", e)),
                    metadata: HashMap::from([("tool_name".to_string(), json!("question"))]),
                });
            }
        } else {
            pending_questions().remove(&question_id);
            return Ok(ToolResult {
                success: false,
                data: json!({
                    "success": false,
                    "error": "No app handle available to emit question event"
                }),
                error: Some("No app handle available to emit question event".to_string()),
                metadata: HashMap::from([("tool_name".to_string(), json!("question"))]),
            });
        }

        let _pending = PendingQuestionGuard(question_id.clone());
        let _waiting_on_user = crate::sys::commands::chat::state::UserWaitGuard::start();
        let mut rx = rx;
        let deadline = tokio::time::sleep(std::time::Duration::from_secs(
            crate::sys::commands::chat::state::USER_ANSWER_TIMEOUT_SECS,
        ));
        tokio::pin!(deadline);
        let mut stop_poll = tokio::time::interval(std::time::Duration::from_millis(200));
        stop_poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let answer = loop {
            tokio::select! {
                received = &mut rx => match received {
                    Ok(value) => break value,
                    Err(_) => return Ok(question_failure("Question channel closed unexpectedly")),
                },
                _ = &mut deadline => {
                    return Ok(question_failure(&format!(
                        "The user did not answer within {} minutes",
                        crate::sys::commands::chat::state::USER_ANSWER_TIMEOUT_SECS / 60
                    )));
                }
                _ = stop_poll.tick() => {
                    let stopped = self.conversation_id.is_some_and(
                        crate::sys::commands::chat::state::should_stop_for_conversation,
                    );
                    if stopped {
                        return Ok(question_failure("The user stopped the reply before answering"));
                    }
                }
            }
        };

        Ok(ToolResult {
            success: true,
            data: json!({
                "success": true,
                "question": question,
                "answer": answer,
            }),
            error: None,
            metadata: HashMap::from([("tool_name".to_string(), json!("question"))]),
        })
    }
}

/// Removes a question from the pending map however its wait ends, including
/// when the chat aborts the tool because the user stopped or cancelled it.
struct PendingQuestionGuard(String);

impl Drop for PendingQuestionGuard {
    fn drop(&mut self) {
        pending_questions().remove(&self.0);
    }
}

fn question_failure(error: &str) -> ToolResult {
    ToolResult {
        success: false,
        data: json!({ "success": false, "error": error }),
        error: Some(error.to_string()),
        metadata: HashMap::from([("tool_name".to_string(), json!("question"))]),
    }
}

/// Called by the `question_answer` Tauri command when the user submits their answer.
///
/// Resolves the pending oneshot channel for the given question ID, unblocking
/// the `execute_question_tool` future that is waiting for the response.
pub async fn submit_question_answer(id: String, answer: Value) -> Result<()> {
    let sender = pending_questions().remove(&id);
    if let Some(tx) = sender {
        // send() returns Err if receiver was dropped, but we don't need to surface that
        let _ = tx.send(answer);
        Ok(())
    } else {
        Err(anyhow!("No pending question with id: {}", id))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn an_abandoned_question_leaves_the_pending_map() {
        let (tx, _rx) = oneshot::channel();
        pending_questions().insert("q-abandoned".to_string(), tx);

        drop(PendingQuestionGuard("q-abandoned".to_string()));

        assert!(!pending_questions().contains_key("q-abandoned"));
        assert!(
            submit_question_answer("q-abandoned".to_string(), json!("late"))
                .await
                .is_err()
        );
    }
}
