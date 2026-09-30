use crate::compaction;
use crate::models::{ContentBlock, Message, MessageContent, ToolCallResponse};

use super::checkpoints::{self, CheckpointSummary, RewindMode, RewindOutcome};
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
        for dir in &self.additional_context_dirs() {
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
        let (message_count, prompt) = match self.messages.last() {
            Some(last) if last.role == "user" => (self.messages.len() - 1, last.text_content()),
            _ => (self.messages.len(), String::new()),
        };
        self.checkpoint_log.push(message_count, prompt);
        self.report_unsaved_checkpoints();
    }

    #[allow(dead_code)]
    pub fn restore_checkpoint(&mut self) -> bool {
        let Some(saved) = self.checkpoint_log.pop() else {
            return false;
        };
        if checkpoints::prompt_position_matches(&self.messages, &saved) {
            self.messages.truncate(saved.message_count);
        }
        self.checkpoint_captures.clear();
        true
    }

    pub fn checkpoint_count(&self) -> usize {
        self.checkpoint_log.len()
    }

    pub fn checkpoint_summaries(&self) -> Vec<CheckpointSummary> {
        self.checkpoint_log.summaries(&self.messages)
    }

    pub fn rewind_to(&mut self, index: usize, mode: RewindMode) -> anyhow::Result<RewindOutcome> {
        let Some(checkpoint) = self.checkpoint_log.checkpoints().get(index) else {
            anyhow::bail!("there is no checkpoint at that point");
        };
        let prompt = checkpoint.prompt.clone();
        let message_count = checkpoint.message_count;
        if mode.restores_conversation()
            && !checkpoints::prompt_position_matches(&self.messages, checkpoint)
        {
            anyhow::bail!(
                "the conversation before that prompt is no longer in this session (it was compacted or cleared), so only its code can be restored"
            );
        }
        let files = mode.restores_code().then(|| {
            self.checkpoint_log
                .restore_files(index, self.checkpoint_file_authority())
        });
        if mode.restores_conversation() {
            self.messages.truncate(message_count);
            self.checkpoint_log.truncate(index);
            self.checkpoint_captures.clear();
            self.report_unsaved_checkpoints();
        }
        Ok(RewindOutcome {
            prompt,
            files,
            conversation_restored: mode.restores_conversation(),
            remaining: self.checkpoint_log.len(),
        })
    }

    pub fn rewind_to_message(
        &mut self,
        message_index: usize,
        mode: RewindMode,
    ) -> anyhow::Result<RewindOutcome> {
        if let Some(index) = self
            .checkpoint_summaries()
            .iter()
            .find(|summary| summary.message_index == Some(message_index))
            .map(|summary| summary.index)
        {
            return self.rewind_to(index, mode);
        }
        anyhow::ensure!(
            !mode.restores_code(),
            "no checkpoint was saved for that message, so only the conversation can be restored"
        );
        let position = self
            .messages
            .iter()
            .enumerate()
            .filter(|(_, message)| !message.role.eq_ignore_ascii_case("system"))
            .nth(message_index)
            .map(|(position, _)| position)
            .ok_or_else(|| {
                anyhow::anyhow!("this thread has no message at index {message_index}")
            })?;
        let prompt = self.messages[position].text_content();
        anyhow::ensure!(
            self.messages[position].role == "user" && !prompt.trim().is_empty(),
            "message {message_index} is not a prompt the user sent"
        );
        let kept = self
            .checkpoint_log
            .checkpoints()
            .iter()
            .take_while(|checkpoint| checkpoint.message_count < position)
            .count();
        self.messages.truncate(position);
        self.checkpoint_log.truncate(kept);
        self.checkpoint_captures.clear();
        self.report_unsaved_checkpoints();
        Ok(RewindOutcome {
            prompt,
            files: None,
            conversation_restored: true,
            remaining: self.checkpoint_log.len(),
        })
    }

    pub(crate) fn note_file_edit_started(
        &mut self,
        call_id: &str,
        tool: &str,
        args: &serde_json::Value,
        root: Option<&std::path::Path>,
    ) {
        let authority = self.checkpoint_file_authority().cloned();
        let captured: Vec<std::path::PathBuf> = checkpoints::edited_paths(tool, args, root)
            .into_iter()
            .filter(|path| self.checkpoint_log.capture(path, authority.as_ref()))
            .collect();
        if !captured.is_empty() {
            self.checkpoint_captures
                .insert(call_id.to_string(), captured);
        }
        self.report_unsaved_checkpoints();
    }

    pub(crate) fn note_file_edit_finished(&mut self, call_id: &str, ok: bool) {
        let Some(captured) = self.checkpoint_captures.remove(call_id) else {
            return;
        };
        if !ok {
            let authority = self.checkpoint_file_authority().cloned();
            self.checkpoint_log
                .forget_unchanged(&captured, authority.as_ref());
            self.report_unsaved_checkpoints();
        }
    }

    fn report_unsaved_checkpoints(&mut self) {
        if let Some(problem) = self.checkpoint_log.take_unsaved() {
            self.emit_turn_notice(format!("Rewind: {problem}."));
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
    close_open_tool_calls(messages, "[Tool call was aborted, no output produced]");
}

pub(crate) fn mark_interrupted_tool_calls(messages: &mut Vec<Message>) -> usize {
    close_open_tool_calls(
        messages,
        "[The session ended before this tool call finished, so its result is unknown. Check what it changed before relying on it or running it again.]",
    )
}

fn close_open_tool_calls(messages: &mut Vec<Message>, note: &str) -> usize {
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
                    ContentBlock::Text { .. }
                    | ContentBlock::Image { .. }
                    | ContentBlock::Document { .. }
                    | ContentBlock::Unknown => {}
                }
            }
        }
    }

    let orphans: Vec<String> = pending_call_ids
        .into_iter()
        .filter(|id| !result_ids.contains(id))
        .collect();
    let count = orphans.len();

    for orphan_id in orphans {
        messages.push(Message::blocks(
            "user",
            vec![ContentBlock::ToolResult {
                tool_use_id: orphan_id,
                content: note.to_string(),
                is_error: true,
            }],
        ));
    }
    count
}
