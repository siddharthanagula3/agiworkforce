use super::*;
use anyhow::Result;
use std::collections::HashMap;

pub struct ApprovalManager {
    config: AgentConfig,
    approval_rules: Vec<ApprovalRule>,
    auto_approved_tasks: HashMap<String, bool>,
}

#[derive(Debug, Clone)]
pub enum ApprovalRule {
    /// Auto-approve if task description matches pattern
    PatternMatch { pattern: String },
    /// Auto-approve if task has no file system operations
    NoFileSystemOps,
    /// Auto-approve if task has no network operations
    NoNetworkOps,
    /// Auto-approve if task only reads (no writes)
    ReadOnly,
    /// Always require approval
    AlwaysRequire,
}

impl ApprovalManager {
    pub fn new(config: AgentConfig) -> Self {
        let mut approval_rules = Vec::new();

        if config.auto_approve {
            // Add default auto-approval rules
            approval_rules.push(ApprovalRule::ReadOnly);
            approval_rules.push(ApprovalRule::NoFileSystemOps);
            approval_rules.push(ApprovalRule::NoNetworkOps);
        } else {
            approval_rules.push(ApprovalRule::AlwaysRequire);
        }

        Self {
            config,
            approval_rules,
            auto_approved_tasks: HashMap::new(),
        }
    }

    /// Check if a task should be approved automatically
    pub async fn should_approve(&self, task: &Task) -> Result<bool> {
        // Check if already approved
        if let Some(&approved) = self.auto_approved_tasks.get(&task.id) {
            return Ok(approved);
        }

        // If task has auto_approve flag, approve it
        if task.auto_approve {
            return Ok(true);
        }

        // Check against approval rules
        for rule in &self.approval_rules {
            if self.matches_rule(rule, task)? {
                return Ok(true);
            }
        }

        // Check for dangerous operations
        if self.has_dangerous_operations(task)? {
            return Ok(false);
        }

        // Default: require approval if not auto-approved
        Ok(self.config.auto_approve)
    }

    fn matches_rule(&self, rule: &ApprovalRule, task: &Task) -> Result<bool> {
        match rule {
            ApprovalRule::PatternMatch { pattern } => Ok(task
                .description
                .to_lowercase()
                .contains(&pattern.to_lowercase())),
            ApprovalRule::NoFileSystemOps => Ok(!self.has_file_operations(task)),
            ApprovalRule::NoNetworkOps => Ok(!self.has_network_operations(task)),
            ApprovalRule::ReadOnly => Ok(self.is_read_only(task)),
            ApprovalRule::AlwaysRequire => Ok(false),
        }
    }

    fn has_file_operations(&self, task: &Task) -> bool {
        task.steps.iter().any(|step| {
            matches!(
                step.action,
                Action::WriteFile { .. } | Action::ExecuteCommand { .. }
            )
        })
    }

    fn has_network_operations(&self, task: &Task) -> bool {
        task.steps
            .iter()
            .any(|step| matches!(step.action, Action::Navigate { .. }))
    }

    fn is_read_only(&self, task: &Task) -> bool {
        task.steps.iter().all(|step| {
            matches!(
                step.action,
                Action::Screenshot { .. }
                    | Action::ReadFile { .. }
                    | Action::SearchText { .. }
                    | Action::WaitForElement { .. }
            )
        })
    }

    fn has_dangerous_operations(&self, task: &Task) -> Result<bool> {
        // Check for potentially dangerous operations
        let dangerous_patterns = [
            "delete",
            "remove",
            "uninstall",
            "format",
            "wipe",
            "clear",
            "reset",
            "shutdown",
            "restart",
        ];

        let description_lower = task.description.to_lowercase();
        let has_dangerous_keyword = dangerous_patterns
            .iter()
            .any(|pattern| description_lower.contains(pattern));

        // Also check for file deletion operations
        let has_file_deletion = task.steps.iter().any(|step| {
            if let Action::ExecuteCommand { command, .. } = &step.action {
                command.contains("del") || command.contains("rm") || command.contains("remove")
            } else {
                false
            }
        });

        Ok(has_dangerous_keyword || has_file_deletion)
    }

    /// Manually approve a task
    pub fn approve_task(&mut self, task_id: &str) {
        self.auto_approved_tasks.insert(task_id.to_string(), true);
    }

    /// Reject a task
    pub fn reject_task(&mut self, task_id: &str) {
        self.auto_approved_tasks.insert(task_id.to_string(), false);
    }
}
