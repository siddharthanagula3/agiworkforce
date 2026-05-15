use std::path::PathBuf;

use agiworkforce_core::config::types::Notifications;

use crate::diff_render::display_path_for;
use crate::text_formatting::truncate_text;

pub(super) const AGENT_NOTIFICATION_PREVIEW_GRAPHEMES: usize = 200;

pub(super) const PLACEHOLDERS: [&str; 8] = [
    "Explain this codebase",
    "Summarize recent commits",
    "Implement {feature}",
    "Find and fix a bug in @filename",
    "Write tests for @filename",
    "Improve documentation in @filename",
    "Run /review on my current changes",
    "Use /skills to list available skills",
];

#[derive(Debug)]
pub(super) enum Notification {
    AgentTurnComplete {
        response: String,
    },
    ExecApprovalRequested {
        command: String,
    },
    EditApprovalRequested {
        cwd: PathBuf,
        changes: Vec<PathBuf>,
    },
    ElicitationRequested {
        server_name: String,
    },
    PlanModePrompt {
        title: String,
    },
    UserInputRequested {
        question_count: usize,
        summary: Option<String>,
    },
}

impl Notification {
    pub(super) fn display(&self) -> String {
        match self {
            Notification::AgentTurnComplete { response } => {
                Notification::agent_turn_preview(response)
                    .unwrap_or_else(|| "Agent turn complete".to_string())
            }
            Notification::ExecApprovalRequested { command } => {
                format!(
                    "Approval requested: {}",
                    truncate_text(command, /*max_graphemes*/ 30)
                )
            }
            Notification::EditApprovalRequested { cwd, changes } => {
                format!(
                    "AGI Workforce wants to edit {}",
                    if changes.len() == 1 {
                        #[allow(clippy::unwrap_used)]
                        display_path_for(changes.first().unwrap(), cwd)
                    } else {
                        format!("{} files", changes.len())
                    }
                )
            }
            Notification::ElicitationRequested { server_name } => {
                format!("Approval requested by {server_name}")
            }
            Notification::PlanModePrompt { title } => {
                format!("Plan mode prompt: {title}")
            }
            Notification::UserInputRequested {
                question_count,
                summary,
            } => match (*question_count, summary.as_deref()) {
                (1, Some(summary)) => format!("Question requested: {summary}"),
                (1, None) => "Question requested".to_string(),
                (count, _) => format!("Questions requested: {count}"),
            },
        }
    }

    fn type_name(&self) -> &str {
        match self {
            Notification::AgentTurnComplete { .. } => "agent-turn-complete",
            Notification::ExecApprovalRequested { .. }
            | Notification::EditApprovalRequested { .. }
            | Notification::ElicitationRequested { .. } => "approval-requested",
            Notification::PlanModePrompt { .. } => "plan-mode-prompt",
            Notification::UserInputRequested { .. } => "user-input-requested",
        }
    }

    pub(super) fn priority(&self) -> u8 {
        match self {
            Notification::AgentTurnComplete { .. } => 0,
            Notification::ExecApprovalRequested { .. }
            | Notification::EditApprovalRequested { .. }
            | Notification::ElicitationRequested { .. }
            | Notification::PlanModePrompt { .. }
            | Notification::UserInputRequested { .. } => 1,
        }
    }

    pub(super) fn allowed_for(&self, settings: &Notifications) -> bool {
        match settings {
            Notifications::Enabled(enabled) => *enabled,
            Notifications::Custom(allowed) => allowed.iter().any(|a| a == self.type_name()),
        }
    }

    pub(super) fn agent_turn_preview(response: &str) -> Option<String> {
        let mut normalized = String::new();
        for part in response.split_whitespace() {
            if !normalized.is_empty() {
                normalized.push(' ');
            }
            normalized.push_str(part);
        }
        let trimmed = normalized.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(truncate_text(trimmed, AGENT_NOTIFICATION_PREVIEW_GRAPHEMES))
        }
    }

    pub(super) fn user_input_request_summary(
        questions: &[agiworkforce_protocol::request_user_input::RequestUserInputQuestion],
    ) -> Option<String> {
        let first_question = questions.first()?;
        let summary = if first_question.header.trim().is_empty() {
            first_question.question.trim()
        } else {
            first_question.header.trim()
        };
        if summary.is_empty() {
            None
        } else {
            Some(truncate_text(summary, /*max_graphemes*/ 30))
        }
    }
}

/// Extract the first bold (Markdown) element in the form **...** from `s`.
/// Returns the inner text if found; otherwise `None`.
pub(super) fn extract_first_bold(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut i = 0usize;
    while i + 1 < bytes.len() {
        if bytes[i] == b'*' && bytes[i + 1] == b'*' {
            let start = i + 2;
            let mut j = start;
            while j + 1 < bytes.len() {
                if bytes[j] == b'*' && bytes[j + 1] == b'*' {
                    // Found closing **
                    let inner = &s[start..j];
                    let trimmed = inner.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    } else {
                        return None;
                    }
                }
                j += 1;
            }
            // No closing; stop searching (wait for more deltas)
            return None;
        }
        i += 1;
    }
    None
}

pub(super) fn hook_event_label(
    event_name: agiworkforce_protocol::protocol::HookEventName,
) -> &'static str {
    match event_name {
        agiworkforce_protocol::protocol::HookEventName::PreToolUse => "PreToolUse",
        agiworkforce_protocol::protocol::HookEventName::SessionStart => "SessionStart",
        agiworkforce_protocol::protocol::HookEventName::UserPromptSubmit => "UserPromptSubmit",
        agiworkforce_protocol::protocol::HookEventName::Stop => "Stop",
    }
}
