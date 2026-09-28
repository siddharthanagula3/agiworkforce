use crate::compaction;
use crate::models::{ContentBlock, Message, MessageContent, ToolCallResponse};

use super::AgentSession;

impl AgentSession {
    pub fn context_usage(&self, reserved_output_tokens: usize) -> compaction::ContextUsage {
        compaction::context_usage(
            &self.messages,
            &self.model,
            reserved_output_tokens,
            self.context_usage_anchor,
        )
    }

    pub fn context_report(&self, reserved_output_tokens: usize) -> String {
        let mut lines = vec![compaction::format_context_report(
            &self.context_usage(reserved_output_tokens),
        )];
        lines.push(String::new());
        lines.push("In context:".to_string());
        let system_chars = self
            .messages
            .first()
            .filter(|message| message.role == "system")
            .map(|message| message.text_content().chars().count())
            .unwrap_or(0);
        lines.push(format!(
            "  System prompt      about {} tokens (instructions, memory, output style, rules)",
            system_chars / 4
        ));
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        for (tier, path, exists) in crate::memory::MemoryManager::new(&cwd).list() {
            if exists {
                lines.push(format!("  Instructions       {tier}: {}", path.display()));
            }
        }
        for rule in &self.workspace_rules {
            lines.push(format!("  Rule               {}", rule.source.display()));
        }
        for file in &self.attached_context_files {
            lines.push(format!("  Attached file      {}", file.display()));
        }
        for dir in &self.additional_context_dirs {
            lines.push(format!("  Added directory    {}", dir.display()));
        }
        let turns = self
            .messages
            .iter()
            .filter(|message| message.role == "user")
            .count();
        lines.push(format!(
            "  Conversation       {} messages over {turns} of your turns",
            self.messages.len().saturating_sub(1)
        ));
        if let Some(tools) = self.mcp_info() {
            lines.push(format!("  MCP tools          {}", tools.len()));
        }
        lines.join("\n")
    }

    /// Save a checkpoint of the current conversation state.
    pub fn save_checkpoint(&mut self) {
        self.checkpoints.push(self.messages.clone());
    }

    /// Restore the most recent checkpoint, returning true if one was available.
    #[allow(dead_code)]
    pub fn restore_checkpoint(&mut self) -> bool {
        if let Some(saved) = self.checkpoints.pop() {
            self.messages = saved;
            true
        } else {
            false
        }
    }

    /// Number of saved checkpoints.
    #[allow(dead_code)]
    pub fn checkpoint_count(&self) -> usize {
        self.checkpoints.len()
    }

    /// Normalize conversation history: ensure every tool_use call has a
    /// matching tool_result. Orphaned calls get synthetic "aborted" results
    /// so the LLM API doesn't reject the malformed history.
    #[allow(dead_code)]
    pub fn normalize_history(&mut self) {
        let mut pending_call_ids: Vec<String> = Vec::new();
        let mut result_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

        for msg in &self.messages {
            if let MessageContent::Blocks(blocks) = &msg.content {
                for block in blocks {
                    match block {
                        ContentBlock::ToolUse { id, .. } => {
                            pending_call_ids.push(id.clone());
                        }
                        ContentBlock::ToolResult { tool_use_id, .. } => {
                            result_ids.insert(tool_use_id.clone());
                        }
                        ContentBlock::Text { .. } | ContentBlock::Image { .. } => {}
                    }
                }
            }
        }

        let orphans: Vec<String> = pending_call_ids
            .into_iter()
            .filter(|id| !result_ids.contains(id))
            .collect();

        for orphan_id in orphans {
            self.messages.push(Message::blocks(
                "user",
                vec![ContentBlock::ToolResult {
                    tool_use_id: orphan_id,
                    content: "[Tool call was aborted, no output produced]".to_string(),
                    is_error: true,
                }],
            ));
        }
    }
}

/// Build an assistant Message that includes both text and tool_use blocks.
pub(super) fn build_assistant_message(text: &str, tool_calls: &[ToolCallResponse]) -> Message {
    if tool_calls.is_empty() {
        return Message::text("assistant", text);
    }

    let mut blocks = Vec::new();
    if !text.is_empty() {
        blocks.push(ContentBlock::Text {
            text: text.to_string(),
        });
    }
    for tc in tool_calls {
        blocks.push(ContentBlock::ToolUse {
            id: tc.id.clone(),
            name: tc.name.clone(),
            input: tc.arguments.clone(),
        });
    }
    Message::blocks("assistant", blocks)
}
