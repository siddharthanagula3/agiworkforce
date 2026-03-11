use super::*;

use std::sync::LazyLock;
use tokio::sync::oneshot;
use tokio::sync::Mutex as TokioMutex;

/// Global map of pending question IDs to their oneshot response senders.
///
/// When the agent executes the `question` tool, a oneshot channel is created
/// and the sender is stored here. The frontend receives the question via a
/// Tauri event, collects the user's answer, and calls the `question_answer`
/// Tauri command which resolves the pending sender.
static PENDING_QUESTIONS: LazyLock<TokioMutex<HashMap<String, oneshot::Sender<Value>>>> =
    LazyLock::new(|| TokioMutex::new(HashMap::new()));

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
        {
            let mut pending = PENDING_QUESTIONS.lock().await;
            pending.insert(question_id.clone(), tx);
        }

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
                let mut pending = PENDING_QUESTIONS.lock().await;
                pending.remove(&question_id);
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
            // No app handle available — cannot ask user
            let mut pending = PENDING_QUESTIONS.lock().await;
            pending.remove(&question_id);
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

        // Wait for the user's response with a 60-second timeout
        let answer = match tokio::time::timeout(std::time::Duration::from_secs(60), rx).await {
            Ok(Ok(value)) => value,
            Ok(Err(_)) => {
                // Channel closed unexpectedly (sender dropped)
                return Ok(ToolResult {
                    success: false,
                    data: json!({
                        "success": false,
                        "error": "Question channel closed unexpectedly"
                    }),
                    error: Some("Question channel closed unexpectedly".to_string()),
                    metadata: HashMap::from([("tool_name".to_string(), json!("question"))]),
                });
            }
            Err(_) => {
                // Timeout — clean up pending entry
                let mut pending = PENDING_QUESTIONS.lock().await;
                pending.remove(&question_id);
                return Ok(ToolResult {
                    success: false,
                    data: json!({
                        "success": false,
                        "error": "Question timed out after 60 seconds"
                    }),
                    error: Some("Question timed out after 60 seconds".to_string()),
                    metadata: HashMap::from([("tool_name".to_string(), json!("question"))]),
                });
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

/// Called by the `question_answer` Tauri command when the user submits their answer.
///
/// Resolves the pending oneshot channel for the given question ID, unblocking
/// the `execute_question_tool` future that is waiting for the response.
#[allow(dead_code)]
pub async fn submit_question_answer(id: String, answer: Value) -> Result<()> {
    let mut pending = PENDING_QUESTIONS.lock().await;
    if let Some(tx) = pending.remove(&id) {
        // send() returns Err if receiver was dropped, but we don't need to surface that
        let _ = tx.send(answer);
        Ok(())
    } else {
        Err(anyhow!("No pending question with id: {}", id))
    }
}
