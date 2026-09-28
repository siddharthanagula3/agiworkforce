use crate::compaction;
use crate::models::{ContentBlock, Message, MessageContent, ToolCallResponse};

use super::checkpoints::{self, Checkpoint, CheckpointSummary, RewindMode, RewindOutcome};
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

    pub fn save_checkpoint(&mut self) {
        let (messages, prompt) = match self.messages.last() {
            Some(last) if last.role == "user" => (
                self.messages[..self.messages.len() - 1].to_vec(),
                last.text_content(),
            ),
            _ => (self.messages.clone(), String::new()),
        };
        self.checkpoints.push(Checkpoint::new(messages, prompt));
        if self.checkpoints.len() > checkpoints::MAX_CHECKPOINTS {
            self.checkpoints.remove(0);
        }
    }

    #[allow(dead_code)]
    pub fn restore_checkpoint(&mut self) -> bool {
        match self.checkpoints.pop() {
            Some(saved) => {
                self.messages = saved.messages;
                true
            }
            None => false,
        }
    }

    pub fn checkpoint_count(&self) -> usize {
        self.checkpoints.len()
    }

    pub fn checkpoint_summaries(&self) -> Vec<CheckpointSummary> {
        self.checkpoints
            .iter()
            .enumerate()
            .map(|(index, checkpoint)| CheckpointSummary {
                index,
                created_at: checkpoint.created_at,
                prompt: checkpoint.prompt.clone(),
                tracked_files: checkpoints::tracked_files(&self.checkpoints[index..]),
            })
            .collect()
    }

    pub fn rewind_to(&mut self, index: usize, mode: RewindMode) -> anyhow::Result<RewindOutcome> {
        let Some(checkpoint) = self.checkpoints.get(index) else {
            anyhow::bail!("there is no checkpoint at that point");
        };
        let prompt = checkpoint.prompt.clone();
        let files = mode
            .restores_code()
            .then(|| checkpoints::restore_files(&self.checkpoints[index..]));
        if mode.restores_conversation() {
            self.messages = self.checkpoints[index].messages.clone();
            self.checkpoints.truncate(index);
            self.checkpoint_captures.clear();
        }
        Ok(RewindOutcome {
            prompt,
            files,
            conversation_restored: mode.restores_conversation(),
            remaining: self.checkpoints.len(),
        })
    }

    pub(crate) fn note_file_edit_started(
        &mut self,
        call_id: &str,
        tool: &str,
        args: &serde_json::Value,
        root: Option<&std::path::Path>,
    ) {
        let paths = checkpoints::edited_paths(tool, args, root);
        let Some(checkpoint) = self.checkpoints.last_mut() else {
            return;
        };
        let captured: Vec<std::path::PathBuf> = paths
            .into_iter()
            .filter(|path| checkpoint.capture(path))
            .collect();
        if !captured.is_empty() {
            self.checkpoint_captures
                .insert(call_id.to_string(), captured);
        }
    }

    pub(crate) fn note_file_edit_finished(&mut self, call_id: &str, ok: bool) {
        let Some(captured) = self.checkpoint_captures.remove(call_id) else {
            return;
        };
        if !ok {
            if let Some(checkpoint) = self.checkpoints.last_mut() {
                checkpoint.forget_unchanged(&captured);
            }
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

pub(crate) fn close_orphaned_tool_calls(messages: &mut Vec<Message>) {
    let mut pending_call_ids: Vec<String> = Vec::new();
    let mut result_ids: std::collections::HashSet<String> = std::collections::HashSet::new();

    for msg in messages.iter() {
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
        messages.push(Message::blocks(
            "user",
            vec![ContentBlock::ToolResult {
                tool_use_id: orphan_id,
                content: "[Tool call was aborted, no output produced]".to_string(),
                is_error: true,
            }],
        ));
    }
}
