//! Real plan mode: model-driven plan -> approve -> execute flow.
//!
//! Replaces the previous boolean toggle with a structured plan that the model
//! writes via the `update_plan` tool. The user reviews and approves the plan
//! before mutating tools (Bash/Edit/Write/apply_patch/MCP) are unlocked. Mirrors
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
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::path::{Path, PathBuf};

/// The lifecycle of one step. Blocked, skipped and superseded are distinct
/// states, not pending: collapsing them hides whether the plan is on track.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum StepStatus {
    #[default]
    Pending,
    InProgress,
    Done,
    Blocked,
    Skipped,
    Superseded,
}

impl StepStatus {
    /// Every variant, in lifecycle order. The tool schema advertises exactly
    /// this set, so any status the model sends is one a renderer draws.
    pub const ALL: [StepStatus; 6] = [
        StepStatus::Pending,
        StepStatus::InProgress,
        StepStatus::Done,
        StepStatus::Blocked,
        StepStatus::Skipped,
        StepStatus::Superseded,
    ];

    /// The canonical names, for a JSON-schema `enum`.
    pub fn schema_enum() -> Vec<&'static str> {
        StepStatus::ALL.iter().map(|s| s.as_str()).collect()
    }

    /// Canonical wire name: what is serialized and what the schema advertises.
    pub fn as_str(self) -> &'static str {
        match self {
            StepStatus::Pending => "pending",
            StepStatus::InProgress => "in_progress",
            StepStatus::Done => "done",
            StepStatus::Blocked => "blocked",
            StepStatus::Skipped => "skipped",
            StepStatus::Superseded => "superseded",
        }
    }

    /// The marker for this state. Must stay distinct per variant: a shared
    /// glyph is a state the user cannot tell apart.
    pub fn marker(self) -> &'static str {
        match self {
            StepStatus::Pending => "[ ]",
            StepStatus::InProgress => "[~]",
            StepStatus::Done => "[x]",
            StepStatus::Blocked => "[!]",
            StepStatus::Skipped => "[-]",
            StepStatus::Superseded => "[=]",
        }
    }

    /// Word appended for the states a marker alone does not explain; the three
    /// conventional checkbox glyphs need no gloss.
    pub fn annotation(self) -> Option<&'static str> {
        match self {
            StepStatus::Blocked => Some("blocked"),
            StepStatus::Skipped => Some("skipped"),
            StepStatus::Superseded => Some("superseded"),
            _ => None,
        }
    }

    /// A step that will not move on its own, so a progress count must not
    /// report it as outstanding.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            StepStatus::Done | StepStatus::Skipped | StepStatus::Superseded
        )
    }

    /// The model writes free text, so synonyms map onto a variant and anything
    /// unrecognized falls back to pending instead of failing `update_plan`.
    pub fn parse(raw: &str) -> StepStatus {
        match raw
            .trim()
            .to_ascii_lowercase()
            .replace([' ', '-'], "_")
            .as_str()
        {
            "complete" | "completed" | "done" | "finished" | "x" => StepStatus::Done,
            "in_progress" | "active" | "started" | "doing" | "current" => StepStatus::InProgress,
            "blocked" | "stuck" | "waiting" | "needs_input" => StepStatus::Blocked,
            "skipped" | "skip" | "wont_do" | "not_needed" => StepStatus::Skipped,
            "superseded" | "replaced" | "obsolete" => StepStatus::Superseded,
            _ => StepStatus::Pending,
        }
    }
}

impl std::fmt::Display for StepStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl Serialize for StepStatus {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for StepStatus {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> std::result::Result<Self, D::Error> {
        let raw = String::deserialize(deserializer)?;
        Ok(StepStatus::parse(&raw))
    }
}

/// One discrete step in the plan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanStep {
    pub description: String,
    #[serde(default)]
    pub status: StepStatus,
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

fn render_step(out: &mut String, index: usize, status: StepStatus, text: &str) {
    match status.annotation() {
        Some(word) => out.push_str(&format!(
            "{} {}. {} ({})\n",
            status.marker(),
            index + 1,
            text,
            word
        )),
        None => out.push_str(&format!("{} {}. {}\n", status.marker(), index + 1, text)),
    }
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
            render_step(&mut s, i, step.status, &step.description);
            if let Some(notes) = &step.notes {
                if !notes.trim().is_empty() {
                    s.push_str(&format!("    > {}\n", notes));
                }
            }
        }
        s
    }

    /// Steps still expected to move, over the total. Terminal states must not
    /// inflate the outstanding count.
    pub fn outstanding(&self) -> (usize, usize) {
        let remaining = self
            .steps
            .iter()
            .filter(|step| !step.status.is_terminal())
            .count();
        (remaining, self.steps.len())
    }

    /// Persist the plan to `~/.agiworkforce/plans/<session-id>.md` and
    /// return the resolved path. Creates the directory if needed.
    pub fn write_to_disk(&self, session_id: &str) -> Result<PathBuf> {
        let path = plans_dir()?.join(format!("{}.md", sanitize_id(session_id)));
        std::fs::write(&path, self.render_markdown())?;
        Ok(path)
    }
}

/// One entry on the working todo list. A plan is the approved shape of the
/// work; a todo list is the running checklist kept while executing it.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoItem {
    pub content: String,
    #[serde(default)]
    pub status: StepStatus,
    #[serde(default = "default_priority")]
    pub priority: String,
}

fn default_priority() -> String {
    "medium".to_string()
}

/// The persisted todo list. It must survive a restart: a checklist held only
/// in process memory is gone exactly when a resumed session needs it.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TodoList {
    #[serde(default)]
    pub items: Vec<TodoItem>,
}

impl TodoList {
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn render(&self) -> String {
        if self.items.is_empty() {
            return "No todos. Use todo_write to create a task list.".to_string();
        }
        let mut out = String::with_capacity(self.items.len() * 48);
        for (i, item) in self.items.iter().enumerate() {
            render_step(
                &mut out,
                i,
                item.status,
                &format!("[{}] {}", item.priority, item.content),
            );
        }
        let remaining = self
            .items
            .iter()
            .filter(|item| !item.status.is_terminal())
            .count();
        out.push_str(&format!(
            "\n{} of {} outstanding",
            remaining,
            self.items.len()
        ));
        out
    }

    pub fn path_for(session_id: &str) -> Result<PathBuf> {
        Ok(plans_dir()?.join(format!("{}.todos.json", sanitize_id(session_id))))
    }

    /// Keyed by the caller's workspace root, never the process cwd: the
    /// app-server hosts concurrent sessions whose workspaces differ from it.
    pub fn path_for_workspace(root: &Path) -> Result<PathBuf> {
        let dir = plans_dir()?.join("todos");
        std::fs::create_dir_all(&dir)?;
        Ok(dir.join(format!("{}.json", workspace_key(root))))
    }

    pub fn load_for_workspace(root: &Path) -> TodoList {
        match Self::path_for_workspace(root) {
            Ok(path) => Self::load_from(&path),
            Err(_) => TodoList::default(),
        }
    }

    pub fn save_for_workspace(&self, root: &Path) -> Result<PathBuf> {
        let path = Self::path_for_workspace(root)?;
        self.save_to(&path)?;
        Ok(path)
    }

    /// A missing or unreadable file reads as an empty list, never an error: a
    /// corrupt checklist must not stop the turn.
    pub fn load(session_id: &str) -> TodoList {
        let Ok(path) = Self::path_for(session_id) else {
            return TodoList::default();
        };
        Self::load_from(&path)
    }

    pub fn load_from(path: &Path) -> TodoList {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, session_id: &str) -> Result<PathBuf> {
        let path = Self::path_for(session_id)?;
        self.save_to(&path)?;
        Ok(path)
    }

    pub fn save_to(&self, path: &Path) -> Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }
}

fn plans_dir() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("no home dir"))?;
    let plans_dir = home.join(".agiworkforce").join("plans");
    std::fs::create_dir_all(&plans_dir)?;
    Ok(plans_dir)
}

/// A stable file name for a workspace. The digest of the canonical path is
/// what keeps two same-named checkouts distinct.
fn workspace_key(root: &Path) -> String {
    use sha2::Digest;
    let canonical = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let digest = sha2::Sha256::digest(canonical.to_string_lossy().as_bytes());
    let hex: String = crate::hex::encode(&digest).chars().take(16).collect();
    let name = canonical
        .file_name()
        .map(|n| sanitize_id(&n.to_string_lossy()))
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "workspace".to_string());
    let name: String = name.chars().take(48).collect();
    format!("{name}-{hex}")
}

/// A session id reaches this as a path component, so anything that is not
/// alphanumeric, `-` or `_` is replaced rather than escaped.
fn sanitize_id(session_id: &str) -> String {
    session_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(description: &str, status: StepStatus) -> PlanStep {
        PlanStep {
            description: description.into(),
            status,
            notes: None,
        }
    }

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
                step("do thing", StepStatus::Done),
                PlanStep {
                    description: "do other thing".into(),
                    status: StepStatus::InProgress,
                    notes: Some("blocked on X".into()),
                },
                step("third", StepStatus::Pending),
            ],
        };
        let md = p.render_markdown();
        assert!(md.contains("[x] 1. do thing"));
        assert!(md.contains("[~] 2. do other thing"));
        assert!(md.contains("    > blocked on X"));
        assert!(md.contains("[ ] 3. third"));
    }

    /// Blocked, skipped and superseded used to render as the pending box, so a
    /// stalled plan looked identical to one that had not started.
    #[test]
    fn every_status_renders_distinctly() {
        let all = [
            StepStatus::Pending,
            StepStatus::InProgress,
            StepStatus::Done,
            StepStatus::Blocked,
            StepStatus::Skipped,
            StepStatus::Superseded,
        ];
        let plan = Plan {
            steps: all.iter().map(|s| step("work", *s)).collect(),
        };
        let rendered: Vec<String> = plan
            .render_markdown()
            .lines()
            .filter(|line| line.contains("work"))
            .map(|line| line[..line.find('.').expect("numbered line")].to_string())
            .collect();
        assert_eq!(rendered.len(), all.len());
        let mut unique = rendered.clone();
        unique.sort();
        unique.dedup();
        assert_eq!(unique.len(), all.len(), "duplicate markers in {rendered:?}");

        let md = plan.render_markdown();
        assert!(md.contains("[!] 4. work (blocked)"), "{md}");
        assert!(md.contains("[-] 5. work (skipped)"), "{md}");
        assert!(md.contains("[=] 6. work (superseded)"), "{md}");
    }

    #[test]
    fn model_status_spellings_map_onto_variants() {
        assert_eq!(StepStatus::parse("COMPLETED"), StepStatus::Done);
        assert_eq!(StepStatus::parse("in progress"), StepStatus::InProgress);
        assert_eq!(StepStatus::parse("in-progress"), StepStatus::InProgress);
        assert_eq!(StepStatus::parse("Blocked"), StepStatus::Blocked);
        assert_eq!(StepStatus::parse("skip"), StepStatus::Skipped);
        assert_eq!(StepStatus::parse("replaced"), StepStatus::Superseded);
        assert_eq!(StepStatus::parse("nonsense"), StepStatus::Pending);
    }

    /// Plans written before the enum existed carry a free string, and a session
    /// resumed after an upgrade must not fail to parse its own plan file.
    #[test]
    fn legacy_free_string_status_still_deserializes() {
        let plan: Plan = serde_json::from_str(
            r#"{"steps":[{"description":"a","status":"complete"},{"description":"b","status":"whatever"}]}"#,
        )
        .expect("legacy plan must parse");
        assert_eq!(plan.steps[0].status, StepStatus::Done);
        assert_eq!(plan.steps[1].status, StepStatus::Pending);
        assert!(serde_json::to_string(&plan)
            .expect("serialize")
            .contains("\"done\""));
    }

    #[test]
    fn outstanding_excludes_terminal_states() {
        let plan = Plan {
            steps: vec![
                step("a", StepStatus::Done),
                step("b", StepStatus::Skipped),
                step("c", StepStatus::Superseded),
                step("d", StepStatus::Blocked),
                step("e", StepStatus::Pending),
            ],
        };
        assert_eq!(plan.outstanding(), (2, 5));
    }

    #[test]
    fn a_todo_list_survives_a_round_trip_through_disk() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("nested").join("session.todos.json");
        let list = TodoList {
            items: vec![
                TodoItem {
                    content: "write the parser".into(),
                    status: StepStatus::Done,
                    priority: "high".into(),
                },
                TodoItem {
                    content: "wire the flag".into(),
                    status: StepStatus::Blocked,
                    priority: "medium".into(),
                },
            ],
        };

        list.save_to(&path).expect("save todo list");
        let reloaded = TodoList::load_from(&path);

        assert_eq!(reloaded.items.len(), 2);
        assert_eq!(reloaded.items[1].status, StepStatus::Blocked);
        let rendered = reloaded.render();
        assert!(
            rendered.contains("[x] 1. [high] write the parser"),
            "{rendered}"
        );
        assert!(
            rendered.contains("[!] 2. [medium] wire the flag (blocked)"),
            "{rendered}"
        );
        assert!(rendered.contains("1 of 2 outstanding"), "{rendered}");
    }

    #[test]
    fn an_unreadable_todo_file_reads_as_an_empty_list() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("broken.todos.json");
        std::fs::write(&path, "{not json").expect("write fixture");

        assert!(TodoList::load_from(&path).is_empty());
        assert!(TodoList::load_from(&dir.path().join("absent.json")).is_empty());
    }

    #[test]
    fn a_session_id_never_escapes_the_plans_directory() {
        assert_eq!(sanitize_id("../../etc/passwd"), "______etc_passwd");
        assert_eq!(sanitize_id("ok-id_1"), "ok-id_1");
    }
}
