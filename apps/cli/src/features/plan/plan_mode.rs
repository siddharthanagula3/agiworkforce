//! Real plan mode: model-driven plan -> approve -> execute flow.
//!
//! Sprint B4 of `~/.claude/plans/cli-competitive-floor.md`. Replaces the
//! previous boolean toggle with a structured plan that the model writes via
//! the `update_plan` tool. The user reviews and approves the plan before
//! mutating tools (Bash/Edit/Write/apply_patch/MCP) are unlocked. Mirrors
//! the Codex `update_plan` tool surface.
//!
//! State lives on `AgentSession` (`current_plan`, `current_plan_path`,
//! `plan_approved`, `plan_rejection_feedback`); this module owns only the
//! data types, markdown rendering, and on-disk persistence under
//! `~/.agiworkforce/plans/<session-id>.md`.
//!
//! See also:
//!   - `apps/cli/src/tools.rs` -- `update_plan` tool dispatch + mutating gate
//!   - `apps/cli/src/repl.rs`  -- 3-state `/plan` slash command
//!   - `apps/cli/src/agent.rs` -- session fields + system prompt addendum
//!   - `~/Desktop/reference/codex-cli/codex-rs/core/src/tools/handlers/plan.rs`
//!     -- reference implementation we match for tool schema parity

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// One discrete step in the plan. Status is a bare string (not enum) so we
/// can accept whatever the model produces without churn; renderers default
/// unknown values to the "pending" icon.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub description: String,
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub notes: Option<String>,
}

/// The plan itself: an ordered list of steps. Empty plans are valid (the
/// model occasionally clears the plan; we keep the file so callers can see
/// the empty state).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Plan {
    pub steps: Vec<PlanStep>,
}

fn default_status() -> String {
    "pending".to_string()
}

impl Plan {
    /// Render the plan as Markdown. Used both for on-disk persistence and
    /// for `/plan show` in the REPL.
    pub fn render_markdown(&self) -> String {
        if self.steps.is_empty() {
            return "# Plan\n\n(empty)\n".to_string();
        }
        let mut s = String::with_capacity(64 + self.steps.len() * 64);
        s.push_str("# Plan\n\n");
        for (i, step) in self.steps.iter().enumerate() {
            let icon = match step.status.as_str() {
                "complete" | "completed" | "done" => "[x]",
                "in_progress" | "active" => "[~]",
                _ => "[ ]",
            };
            s.push_str(&format!("{} {}. {}\n", icon, i + 1, step.description));
            if let Some(notes) = &step.notes {
                if !notes.trim().is_empty() {
                    s.push_str(&format!("    > {}\n", notes));
                }
            }
        }
        s
    }

    /// Persist the plan to `~/.agiworkforce/plans/<session-id>.md` and
    /// return the resolved path. Creates the directory if needed.
    pub fn write_to_disk(&self, session_id: &str) -> Result<PathBuf> {
        let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("no home dir"))?;
        let plans_dir = home.join(".agiworkforce").join("plans");
        std::fs::create_dir_all(&plans_dir)?;
        let safe_id: String = session_id
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
            .collect();
        let path = plans_dir.join(format!("{}.md", safe_id));
        std::fs::write(&path, self.render_markdown())?;
        Ok(path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_empty_plan() {
        let p = Plan::default();
        let md = p.render_markdown();
        assert!(md.contains("(empty)"));
    }

    #[test]
    fn render_with_steps() {
        let p = Plan {
            steps: vec![
                PlanStep {
                    description: "do thing".into(),
                    status: "complete".into(),
                    notes: None,
                },
                PlanStep {
                    description: "do other thing".into(),
                    status: "in_progress".into(),
                    notes: Some("blocked on X".into()),
                },
                PlanStep {
                    description: "third".into(),
                    status: "pending".into(),
                    notes: None,
                },
            ],
        };
        let md = p.render_markdown();
        assert!(md.contains("[x] 1. do thing"));
        assert!(md.contains("[~] 2. do other thing"));
        assert!(md.contains("    > blocked on X"));
        assert!(md.contains("[ ] 3. third"));
    }
}
