use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use colored::Colorize;
use serde::{Deserialize, Serialize};

use crate::agent::AgentSession;
use crate::config::CliConfig;
use crate::models::{ContentBlock, Message, MessageContent};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedConversation {
    pub id: String,
    pub title: String,
    pub model: String,
    pub created_at: String,
    pub updated_at: String,
    pub messages: Vec<SavedMessage>,
    pub total_input_tokens: u32,
    pub total_output_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedMessage {
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

/// Lightweight summary for listing conversations.
#[derive(Debug, Serialize, Deserialize)]
pub struct ConversationSummary {
    pub id: String,
    pub title: String,
    pub model: String,
    pub updated_at: String,
    pub message_count: usize,
}

/// Aggregate statistics for a conversation session.
#[derive(Debug, Clone, PartialEq, Eq)]
#[allow(dead_code)]
pub struct ConversationStats {
    pub total_messages: usize,
    pub user_messages: usize,
    pub assistant_messages: usize,
    pub system_messages: usize,
    pub total_input_tokens: u32,
    pub total_output_tokens: u32,
    pub tool_calls_count: usize,
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/// Directory where conversations are stored: ~/.agiworkforce/conversations/
fn conversations_dir() -> Result<PathBuf> {
    let dir = CliConfig::config_dir()?.join("conversations");
    Ok(dir)
}

/// Save the current agent session to disk as JSON.
/// Returns the conversation ID (timestamp-based).
///
/// **Deprecated**: JSON storage is deprecated in favour of SQLite.
/// Use `/migrate` to move existing conversations.
pub fn save_conversation(session: &AgentSession) -> Result<String> {
    eprintln!(
        "{}",
        "Note: JSON storage is deprecated. Use /migrate to move to SQLite.".dimmed()
    );
    save_conversation_in_dir(session, &conversations_dir()?)
}

/// Save a conversation into `dir`. Extracted so tests can supply a temp directory.
fn save_conversation_in_dir(session: &AgentSession, dir: &std::path::Path) -> Result<String> {
    std::fs::create_dir_all(dir).context("Failed to create conversations directory")?;

    let now = chrono::Utc::now();
    let id = format!("{}", now.format("%Y%m%d_%H%M%S"));

    // Auto-title from first user message (skip system prompt at index 0)
    let title = session
        .messages
        .iter()
        .find(|m| m.role == "user")
        .map(|m| {
            let text = m.text_content();
            let truncated: String = text.chars().take(50).collect();
            if text.chars().count() > 50 {
                format!("{}...", truncated)
            } else {
                truncated
            }
        })
        .unwrap_or_else(|| "Untitled conversation".to_string());

    let now_iso = now.to_rfc3339();

    let saved_messages: Vec<SavedMessage> = session
        .messages
        .iter()
        .map(|m| SavedMessage {
            role: m.role.clone(),
            content: m.text_content(),
            timestamp: now_iso.clone(),
        })
        .collect();

    let conversation = SavedConversation {
        id: id.clone(),
        title,
        model: session.model.clone(),
        created_at: now_iso.clone(),
        updated_at: now_iso,
        messages: saved_messages,
        total_input_tokens: session.total_input_tokens,
        total_output_tokens: session.total_output_tokens,
    };

    let path = dir.join(format!("{}.json", id));
    let json =
        serde_json::to_string_pretty(&conversation).context("Failed to serialize conversation")?;
    std::fs::write(&path, json).context("Failed to write conversation file")?;

    Ok(id)
}

/// Load a saved conversation by ID.
pub fn load_conversation(id: &str) -> Result<SavedConversation> {
    load_conversation_in_dir(id, &conversations_dir()?)
}

fn load_conversation_in_dir(id: &str, dir: &std::path::Path) -> Result<SavedConversation> {
    let path = dir.join(format!("{}.json", id));

    if !path.exists() {
        bail!("Conversation '{}' not found", id);
    }

    let contents = std::fs::read_to_string(&path).context("Failed to read conversation file")?;
    let conversation: SavedConversation =
        serde_json::from_str(&contents).context("Failed to parse conversation file")?;
    Ok(conversation)
}

/// List all saved conversations, sorted by most recent first.
pub fn list_conversations() -> Result<Vec<ConversationSummary>> {
    list_conversations_in_dir(&conversations_dir()?)
}

fn list_conversations_in_dir(dir: &std::path::Path) -> Result<Vec<ConversationSummary>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut summaries = Vec::new();

    for entry in std::fs::read_dir(dir).context("Failed to read conversations directory")? {
        let entry = entry?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let contents = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let conv: SavedConversation = match serde_json::from_str(&contents) {
            Ok(c) => c,
            Err(_) => continue,
        };

        summaries.push(ConversationSummary {
            id: conv.id,
            title: conv.title,
            model: conv.model,
            updated_at: conv.updated_at,
            message_count: conv.messages.len(),
        });
    }

    // Sort by updated_at descending (most recent first)
    summaries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(summaries)
}

/// Delete a saved conversation by ID.
pub fn delete_conversation(id: &str) -> Result<()> {
    delete_conversation_in_dir(id, &conversations_dir()?)
}

fn delete_conversation_in_dir(id: &str, dir: &std::path::Path) -> Result<()> {
    let path = dir.join(format!("{}.json", id));

    if !path.exists() {
        bail!("Conversation '{}' not found", id);
    }

    std::fs::remove_file(&path).context("Failed to delete conversation file")?;
    Ok(())
}

/// Restore a saved conversation into an AgentSession.
/// Replaces the session's messages, model, and token counts.
pub fn restore_into_session(session: &mut AgentSession, conv: &SavedConversation) {
    session.messages = conv
        .messages
        .iter()
        .map(|m| Message::text(&m.role, &m.content))
        .collect();

    session.switch_model(&conv.model);
    session.total_input_tokens = conv.total_input_tokens;
    session.total_output_tokens = conv.total_output_tokens;

    // Count user messages as turns (exclude system prompt)
    session.turn_count = conv.messages.iter().filter(|m| m.role == "user").count() as u32;
}

/// Export the current session as a markdown string.
///
/// Includes tool call information when messages contain `ToolUse` or
/// `ToolResult` content blocks (rendered as blockquotes below the
/// assistant/user text).
pub fn export_as_markdown(session: &AgentSession) -> String {
    let mut md = String::new();
    md.push_str(&format!("# Conversation — {}\n\n", session.model));
    md.push_str(&format!(
        "Tokens: {} in / {} out | {} turns\n\n---\n\n",
        session.total_input_tokens, session.total_output_tokens, session.turn_count
    ));

    for msg in &session.messages {
        match msg.role.as_str() {
            "system" => {
                // Skip system prompt in export
            }
            "user" => {
                md.push_str("## User\n\n");
                render_message_content(&msg.content, &mut md);
            }
            "assistant" => {
                md.push_str("## Assistant\n\n");
                render_message_content(&msg.content, &mut md);
            }
            other => {
                md.push_str(&format!("## {}\n\n", other));
                render_message_content(&msg.content, &mut md);
            }
        }
    }

    md
}

/// Render message content blocks into markdown, including tool metadata.
fn render_message_content(content: &MessageContent, md: &mut String) {
    match content {
        MessageContent::Text(text) => {
            md.push_str(text);
            md.push_str("\n\n");
        }
        MessageContent::Blocks(blocks) => {
            for block in blocks {
                match block {
                    ContentBlock::Text { text } => {
                        md.push_str(text);
                        md.push_str("\n\n");
                    }
                    ContentBlock::ToolUse { name, input, .. } => {
                        let args_preview = format_tool_args(input);
                        md.push_str(&format!("> **Tool: {}** (`{}`)\n\n", name, args_preview));
                    }
                    ContentBlock::ToolResult {
                        content, is_error, ..
                    } => {
                        let status = if *is_error {
                            "\u{2717} Error"
                        } else {
                            "\u{2713} Success"
                        };
                        let preview = output_preview(content);
                        md.push_str(&format!("> {} (output: {})\n\n", status, preview));
                    }
                }
            }
        }
    }
}

/// Format tool input arguments as a compact `key: value, ...` string.
fn format_tool_args(input: &serde_json::Value) -> String {
    match input.as_object() {
        Some(obj) if !obj.is_empty() => obj
            .iter()
            .map(|(k, v)| {
                let val = match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                };
                // Truncate long values
                let truncated = if val.len() > 60 {
                    // Find a char-safe boundary at or before byte 57 to avoid UTF-8 panics
                    let safe_end = val.char_indices()
                        .take_while(|(i, _)| *i < 57)
                        .last()
                        .map(|(i, c)| i + c.len_utf8())
                        .unwrap_or(val.len().min(57));
                    format!("{}...", &val[..safe_end])
                } else {
                    val
                };
                format!("{}: {}", k, truncated)
            })
            .collect::<Vec<_>>()
            .join(", "),
        _ => "no args".to_string(),
    }
}

/// Produce a short preview of tool output (line count or truncated text).
fn output_preview(output: &str) -> String {
    let line_count = output.lines().count();
    if line_count > 3 {
        format!("{} lines", line_count)
    } else if output.len() > 80 {
        format!("{}...", &output[..77])
    } else {
        output.to_string()
    }
}

/// Export the session as a clean JSON string suitable for import by other tools.
///
/// The output includes model, messages (with content blocks preserved),
/// token counts, and a timestamp.
#[allow(dead_code)]
pub fn export_as_json(session: &AgentSession) -> Result<String> {
    let now = chrono::Utc::now().to_rfc3339();

    #[derive(Serialize)]
    struct ExportedConversation {
        model: String,
        exported_at: String,
        total_input_tokens: u32,
        total_output_tokens: u32,
        turn_count: u32,
        messages: Vec<ExportedMessage>,
    }

    #[derive(Serialize)]
    struct ExportedMessage {
        role: String,
        content: MessageContent,
    }

    let messages: Vec<ExportedMessage> = session
        .messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| ExportedMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    let export = ExportedConversation {
        model: session.model.clone(),
        exported_at: now,
        total_input_tokens: session.total_input_tokens,
        total_output_tokens: session.total_output_tokens,
        turn_count: session.turn_count,
        messages,
    };

    serde_json::to_string_pretty(&export).context("Failed to serialize conversation to JSON")
}

/// Compute aggregate statistics for a conversation session.
#[allow(dead_code)]
pub fn conversation_stats(session: &AgentSession) -> ConversationStats {
    let mut user_messages = 0usize;
    let mut assistant_messages = 0usize;
    let mut system_messages = 0usize;
    let mut tool_calls_count = 0usize;

    for msg in &session.messages {
        match msg.role.as_str() {
            "user" => user_messages += 1,
            "assistant" => assistant_messages += 1,
            "system" => system_messages += 1,
            _ => {}
        }

        // Count tool_use blocks in any message
        if let MessageContent::Blocks(blocks) = &msg.content {
            for block in blocks {
                if matches!(block, ContentBlock::ToolUse { .. }) {
                    tool_calls_count += 1;
                }
            }
        }
    }

    ConversationStats {
        total_messages: session.messages.len(),
        user_messages,
        assistant_messages,
        system_messages,
        total_input_tokens: session.total_input_tokens,
        total_output_tokens: session.total_output_tokens,
        tool_calls_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::AgentSession;
    use crate::context::SystemContext;

    fn test_ctx() -> SystemContext {
        SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "test".to_string(),
            shell: "/bin/sh".to_string(),
        }
    }

    #[test]
    fn test_export_markdown() {
        let ctx = test_ctx();
        let mut session = AgentSession::new("test-model", &ctx, None);
        session.messages.push(Message::text("user", "Hello"));
        session
            .messages
            .push(Message::text("assistant", "Hi there!"));
        session.turn_count = 1;

        let md = export_as_markdown(&session);
        assert!(md.contains("# Conversation"));
        assert!(md.contains("## User"));
        assert!(md.contains("Hello"));
        assert!(md.contains("## Assistant"));
        assert!(md.contains("Hi there!"));
        // System prompt should not appear
        assert!(!md.contains("## system"));
    }

    #[test]
    fn test_save_load_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();

        let ctx = test_ctx();
        let mut session = AgentSession::new("claude-opus-4-6", &ctx, None);
        session
            .messages
            .push(Message::text("user", "What is Rust?"));
        session.messages.push(Message::text(
            "assistant",
            "Rust is a systems programming language.",
        ));
        session.total_input_tokens = 10;
        session.total_output_tokens = 25;

        let id = save_conversation_in_dir(&session, dir).unwrap();
        let loaded = load_conversation_in_dir(&id, dir).unwrap();

        assert_eq!(loaded.id, id);
        assert_eq!(loaded.model, "claude-opus-4-6");
        assert_eq!(loaded.total_input_tokens, 10);
        assert_eq!(loaded.total_output_tokens, 25);
        // system + user + assistant = 3 messages
        assert_eq!(loaded.messages.len(), 3);
        assert_eq!(loaded.messages[1].role, "user");
        assert_eq!(loaded.messages[1].content, "What is Rust?");
        assert_eq!(loaded.messages[2].role, "assistant");
        assert!(loaded.messages[2].content.contains("systems programming"));
        // Title auto-derived from first user message
        assert_eq!(loaded.title, "What is Rust?");
    }

    #[test]
    fn test_list_conversations_returns_summaries() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();

        let ctx = test_ctx();
        let mut session = AgentSession::new("gpt-4o", &ctx, None);
        session.messages.push(Message::text("user", "Hello world"));
        session.messages.push(Message::text("assistant", "Hi!"));

        let id = save_conversation_in_dir(&session, dir).unwrap();
        let summaries = list_conversations_in_dir(dir).unwrap();

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].id, id);
        assert_eq!(summaries[0].model, "gpt-4o");
        assert_eq!(summaries[0].title, "Hello world");
        // system + user + assistant = 3 messages
        assert_eq!(summaries[0].message_count, 3);
    }

    #[test]
    fn test_delete_conversation_removes_file() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();

        let ctx = test_ctx();
        let session = AgentSession::new("test-model", &ctx, None);

        let id = save_conversation_in_dir(&session, dir).unwrap();
        // File exists before delete
        assert!(dir.join(format!("{}.json", id)).exists());

        delete_conversation_in_dir(&id, dir).unwrap();
        // File is gone
        assert!(!dir.join(format!("{}.json", id)).exists());
        // Deleting again should error
        assert!(delete_conversation_in_dir(&id, dir).is_err());
    }

    #[test]
    fn test_export_markdown_with_tool_calls() {
        let ctx = test_ctx();
        let mut session = AgentSession::new("test-model", &ctx, None);
        session
            .messages
            .push(Message::text("user", "Read /tmp/test.txt"));

        // Assistant message with text + tool_use
        session.messages.push(Message::blocks(
            "assistant",
            vec![
                ContentBlock::Text {
                    text: "Let me read that file.".to_string(),
                },
                ContentBlock::ToolUse {
                    id: "tc_1".to_string(),
                    name: "read_file".to_string(),
                    input: serde_json::json!({ "path": "/tmp/test.txt" }),
                },
            ],
        ));

        // Tool result message
        session.messages.push(Message::blocks(
            "user",
            vec![ContentBlock::ToolResult {
                tool_use_id: "tc_1".to_string(),
                content: "line 1\nline 2\nline 3\nline 4\nline 5".to_string(),
                is_error: false,
            }],
        ));

        session.turn_count = 1;

        let md = export_as_markdown(&session);
        assert!(
            md.contains("**Tool: read_file**"),
            "should contain tool name"
        );
        assert!(md.contains("path: /tmp/test.txt"), "should contain args");
        assert!(
            md.contains("\u{2713} Success"),
            "should contain success marker"
        );
        assert!(md.contains("5 lines"), "should contain line count");
    }

    #[test]
    fn test_export_markdown_tool_error() {
        let ctx = test_ctx();
        let mut session = AgentSession::new("test-model", &ctx, None);
        session.messages.push(Message::blocks(
            "user",
            vec![ContentBlock::ToolResult {
                tool_use_id: "tc_err".to_string(),
                content: "Permission denied".to_string(),
                is_error: true,
            }],
        ));

        let md = export_as_markdown(&session);
        assert!(md.contains("\u{2717} Error"), "should contain error marker");
        assert!(
            md.contains("Permission denied"),
            "should contain error output"
        );
    }

    #[test]
    fn test_export_as_json_basic() {
        let ctx = test_ctx();
        let mut session = AgentSession::new("claude-opus-4-6", &ctx, None);
        session.messages.push(Message::text("user", "Hello"));
        session
            .messages
            .push(Message::text("assistant", "Hi there!"));
        session.total_input_tokens = 10;
        session.total_output_tokens = 20;
        session.turn_count = 1;

        let json_str = export_as_json(&session).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();

        assert_eq!(parsed["model"], "claude-opus-4-6");
        assert_eq!(parsed["total_input_tokens"], 10);
        assert_eq!(parsed["total_output_tokens"], 20);
        assert_eq!(parsed["turn_count"], 1);
        // System message should be excluded
        let messages = parsed["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0]["role"], "user");
        assert_eq!(messages[1]["role"], "assistant");
        // exported_at timestamp should be present
        assert!(parsed["exported_at"].as_str().is_some());
    }

    #[test]
    fn test_export_as_json_with_tool_blocks() {
        let ctx = test_ctx();
        let mut session = AgentSession::new("test-model", &ctx, None);
        session.messages.push(Message::blocks(
            "assistant",
            vec![
                ContentBlock::Text {
                    text: "Reading file.".to_string(),
                },
                ContentBlock::ToolUse {
                    id: "tc_1".to_string(),
                    name: "read_file".to_string(),
                    input: serde_json::json!({ "path": "/tmp/a.txt" }),
                },
            ],
        ));

        let json_str = export_as_json(&session).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json_str).unwrap();
        let messages = parsed["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 1);
        let blocks = messages[0]["content"].as_array().unwrap();
        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0]["type"], "text");
        assert_eq!(blocks[1]["type"], "tool_use");
        assert_eq!(blocks[1]["name"], "read_file");
    }

    #[test]
    fn test_conversation_stats_empty_session() {
        let ctx = test_ctx();
        let session = AgentSession::new("test-model", &ctx, None);

        let stats = conversation_stats(&session);
        // Only the system prompt
        assert_eq!(stats.total_messages, 1);
        assert_eq!(stats.system_messages, 1);
        assert_eq!(stats.user_messages, 0);
        assert_eq!(stats.assistant_messages, 0);
        assert_eq!(stats.tool_calls_count, 0);
    }

    #[test]
    fn test_conversation_stats_with_messages_and_tools() {
        let ctx = test_ctx();
        let mut session = AgentSession::new("test-model", &ctx, None);
        session.messages.push(Message::text("user", "Hello"));
        session.messages.push(Message::blocks(
            "assistant",
            vec![
                ContentBlock::Text {
                    text: "Let me help.".to_string(),
                },
                ContentBlock::ToolUse {
                    id: "tc_1".to_string(),
                    name: "read_file".to_string(),
                    input: serde_json::json!({}),
                },
                ContentBlock::ToolUse {
                    id: "tc_2".to_string(),
                    name: "run_command".to_string(),
                    input: serde_json::json!({}),
                },
            ],
        ));
        session.messages.push(Message::text("user", "Thanks"));
        session.total_input_tokens = 50;
        session.total_output_tokens = 100;

        let stats = conversation_stats(&session);
        // system + user + assistant + user = 4
        assert_eq!(stats.total_messages, 4);
        assert_eq!(stats.system_messages, 1);
        assert_eq!(stats.user_messages, 2);
        assert_eq!(stats.assistant_messages, 1);
        assert_eq!(stats.tool_calls_count, 2);
        assert_eq!(stats.total_input_tokens, 50);
        assert_eq!(stats.total_output_tokens, 100);
    }

    #[test]
    fn test_restore_into_session() {
        let conv = SavedConversation {
            id: "20260317_120000".to_string(),
            title: "Test restore".to_string(),
            model: "claude-sonnet-4-20250514".to_string(),
            created_at: "2026-03-17T12:00:00Z".to_string(),
            updated_at: "2026-03-17T12:00:00Z".to_string(),
            messages: vec![
                SavedMessage {
                    role: "user".to_string(),
                    content: "Question one".to_string(),
                    timestamp: "2026-03-17T12:00:00Z".to_string(),
                },
                SavedMessage {
                    role: "assistant".to_string(),
                    content: "Answer one".to_string(),
                    timestamp: "2026-03-17T12:00:01Z".to_string(),
                },
                SavedMessage {
                    role: "user".to_string(),
                    content: "Question two".to_string(),
                    timestamp: "2026-03-17T12:00:02Z".to_string(),
                },
                SavedMessage {
                    role: "assistant".to_string(),
                    content: "Answer two".to_string(),
                    timestamp: "2026-03-17T12:00:03Z".to_string(),
                },
            ],
            total_input_tokens: 100,
            total_output_tokens: 200,
        };

        let ctx = test_ctx();
        let mut session = AgentSession::new("gpt-4o", &ctx, None);
        restore_into_session(&mut session, &conv);

        assert_eq!(session.model, "claude-sonnet-4-20250514");
        assert_eq!(session.total_input_tokens, 100);
        assert_eq!(session.total_output_tokens, 200);
        // 2 user messages = 2 turns
        assert_eq!(session.turn_count, 2);
        assert_eq!(session.messages.len(), 4);
        assert_eq!(session.messages[0].text_content(), "Question one");
        assert_eq!(session.messages[3].text_content(), "Answer two");
    }
}
