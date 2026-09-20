//! The typed Git API as tools the agent can call.
//!
//! One spec per operation, so the catalog entry, the permission class and the
//! argv the operation builds all come from the same row. A tool never composes
//! a git command line: it parses its arguments into a [`GitOperation`] and the
//! API runs that.

use std::collections::HashMap;

use anyhow::{bail, Result};
use serde_json::{json, Value};

use super::git::{GitOperation, HookPolicy, PushForce, ResetMode, StashOperation};

/// What a git tool may do, and therefore what has to happen before it runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum GitToolClass {
    /// Reads the repository and changes nothing. Never prompts.
    Read,
    /// Changes the repository under the session's normal approval flow.
    Mutating,
    /// Throws work away with nothing left to recover it from. Always prompts,
    /// whatever the session's permission mode says.
    Destructive,
    /// A push. Consent comes from `safety::push_consent` and nowhere else.
    Push,
}

impl GitToolClass {
    pub fn label(self) -> &'static str {
        match self {
            Self::Read => "read_only",
            Self::Mutating => "mutating",
            Self::Destructive => "destructive",
            Self::Push => "push",
        }
    }

    /// Whether a human has to answer before this runs, regardless of the
    /// session's permission mode or any saved allow rule.
    pub fn always_asks(self) -> bool {
        matches!(self, Self::Destructive | Self::Push)
    }
}

pub struct GitToolSpec {
    pub name: &'static str,
    pub description: &'static str,
    pub class: GitToolClass,
    pub schema: fn() -> Value,
}

/// `GitOperation` variants that deliberately have no tool of their own, and
/// what answers them instead.
pub const GIT_OPERATIONS_WITHOUT_A_TOOL: &[(&str, &str)] = &[
    (
        "ShowStage",
        "one side of a conflicted path; the resolve_conflict tool reads all three",
    ),
    ("HeadBranch", "the branch name, which git_status reports"),
    (
        "RevParse",
        "resolving a ref to a commit, which git_show and git_log already do",
    ),
];

pub fn git_tool_specs() -> &'static [GitToolSpec] {
    &[
        GitToolSpec {
            name: "git_status",
            description: "Report the working tree: the branch, the head commit, and every staged, unstaged and untracked change.",
            class: GitToolClass::Read,
            schema: || json!({"type": "object", "properties": {}, "additionalProperties": false}),
        },
        GitToolSpec {
            name: "git_show",
            description: "Read one commit: its author, date, subject, body and the files it touched.",
            class: GitToolClass::Read,
            schema: || json!({
                "type": "object",
                "properties": {"rev": {"type": "string", "description": "Commit, tag or ref to read. Defaults to HEAD."}},
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_log",
            description: "List the commits on a branch that the given refs do not already hold. With no exclusions it lists the branch's own history.",
            class: GitToolClass::Read,
            schema: || json!({
                "type": "object",
                "properties": {
                    "branch": {"type": "string", "description": "Branch or ref to list. Defaults to HEAD."},
                    "exclude": {"type": "string", "description": "Comma-separated refs whose commits to leave out, e.g. origin/main."}
                },
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_branches",
            description: "List branches with their head commit and upstream, marking the one this checkout is on.",
            class: GitToolClass::Read,
            schema: || json!({
                "type": "object",
                "properties": {"include_remote": {"type": "boolean", "description": "Also list remote-tracking branches."}},
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_worktrees",
            description: "List the worktrees attached to this repository, with the branch each one has checked out.",
            class: GitToolClass::Read,
            schema: || json!({"type": "object", "properties": {}, "additionalProperties": false}),
        },
        GitToolSpec {
            name: "git_stash_list",
            description: "List the stash entries this repository holds.",
            class: GitToolClass::Read,
            schema: || json!({"type": "object", "properties": {}, "additionalProperties": false}),
        },
        GitToolSpec {
            name: "git_stage",
            description: "Stage paths for the next commit. A submodule pointer is refused: staging it moves another repository for everyone.",
            class: GitToolClass::Mutating,
            schema: || json!({
                "type": "object",
                "properties": {"paths": {"type": "string", "description": "Comma-separated paths, relative to the repository root."}},
                "required": ["paths"],
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_unstage",
            description: "Remove paths from the index, leaving the working tree exactly as it is.",
            class: GitToolClass::Mutating,
            schema: || json!({
                "type": "object",
                "properties": {"paths": {"type": "string", "description": "Comma-separated paths, relative to the repository root."}},
                "required": ["paths"],
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_branch_create",
            description: "Create a branch at a base ref without switching to it.",
            class: GitToolClass::Mutating,
            schema: || json!({
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "New branch name."},
                    "base": {"type": "string", "description": "Ref to branch from. Defaults to HEAD."}
                },
                "required": ["name"],
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_merge",
            description: "Merge a ref into the current branch. A conflict comes back as the conflicted paths and which side each change came from, not as an error.",
            class: GitToolClass::Mutating,
            schema: || json!({
                "type": "object",
                "properties": {
                    "rev": {"type": "string", "description": "Branch or commit to merge in."},
                    "bypass_hooks": {"type": "boolean", "description": "Run without the repository's hooks. Needs its own approval; leave it out to respect them."}
                },
                "required": ["rev"],
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_rebase",
            description: "Replay the current branch onto another ref. This rewrites the branch's commits, so it needs the history-rewrite permission.",
            class: GitToolClass::Mutating,
            schema: || json!({
                "type": "object",
                "properties": {
                    "onto": {"type": "string", "description": "Ref to rebase onto."},
                    "bypass_hooks": {"type": "boolean", "description": "Run without the repository's hooks. Needs its own approval; leave it out to respect them."}
                },
                "required": ["onto"],
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_cherry_pick",
            description: "Apply one commit from elsewhere onto the current branch.",
            class: GitToolClass::Mutating,
            schema: || json!({
                "type": "object",
                "properties": {"rev": {"type": "string", "description": "Commit to apply."}},
                "required": ["rev"],
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_revert",
            description: "Add a commit that undoes an earlier one, leaving the history it undoes in place.",
            class: GitToolClass::Mutating,
            schema: || json!({
                "type": "object",
                "properties": {"rev": {"type": "string", "description": "Commit to revert."}},
                "required": ["rev"],
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_stash",
            description: "Put the working tree aside (save) or bring the most recent entry back (pop).",
            class: GitToolClass::Mutating,
            schema: || json!({
                "type": "object",
                "properties": {
                    "action": {"type": "string", "enum": ["save", "pop"], "description": "Save the working tree or restore the last entry."},
                    "message": {"type": "string", "description": "Label for the entry; save only."},
                    "include_untracked": {"type": "boolean", "description": "Also stash files git is not tracking; save only."}
                },
                "required": ["action"],
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_fetch",
            description: "Fetch refs from a remote. Nothing in the working tree changes.",
            class: GitToolClass::Mutating,
            schema: || json!({
                "type": "object",
                "properties": {
                    "remote": {"type": "string", "description": "Remote name or URL. Defaults to origin."},
                    "prune": {"type": "boolean", "description": "Drop remote-tracking refs the remote no longer has."}
                },
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_pull",
            description: "Fetch from a remote and merge the result into the current branch. A conflict comes back as the conflicted paths.",
            class: GitToolClass::Mutating,
            schema: || json!({
                "type": "object",
                "properties": {
                    "remote": {"type": "string", "description": "Remote name or URL. Defaults to origin."},
                    "branch": {"type": "string", "description": "Branch to pull. Defaults to the tracking branch."}
                },
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_stash_drop",
            description: "Delete a stash entry. Nothing in the repository holds it afterwards.",
            class: GitToolClass::Destructive,
            schema: || json!({
                "type": "object",
                "properties": {"index": {"type": "integer", "minimum": 0, "description": "Entry to drop, as git_stash_list numbers them."}},
                "required": ["index"],
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_reset",
            description: "Move the current branch to another commit. Mode hard also overwrites the working tree, losing every uncommitted change.",
            class: GitToolClass::Destructive,
            schema: || json!({
                "type": "object",
                "properties": {
                    "rev": {"type": "string", "description": "Commit to move the branch to."},
                    "mode": {"type": "string", "enum": ["soft", "mixed", "hard"], "description": "soft keeps the index, mixed clears it, hard also overwrites the working tree."}
                },
                "required": ["rev"],
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_clean",
            description: "Delete files git is not tracking. They are not in any commit, so nothing can bring them back.",
            class: GitToolClass::Destructive,
            schema: || json!({
                "type": "object",
                "properties": {
                    "directories": {"type": "boolean", "description": "Also remove untracked directories."},
                    "ignored": {"type": "boolean", "description": "Also remove files .gitignore hides, such as build output and local environment files."}
                },
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_branch_delete",
            description: "Delete a branch. A protected or default branch, and the branch this checkout is on, are refused rather than offered.",
            class: GitToolClass::Destructive,
            schema: || json!({
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Branch to delete."},
                    "force": {"type": "boolean", "description": "Delete it even when its commits are on no other branch."}
                },
                "required": ["name"],
                "additionalProperties": false
            }),
        },
        GitToolSpec {
            name: "git_push",
            description: "Send the current branch's commits to a remote. The user is shown the branch, the remote, every commit and every reason it needs a decision, and answers before anything leaves this machine.",
            class: GitToolClass::Push,
            schema: || json!({
                "type": "object",
                "properties": {
                    "remote": {"type": "string", "description": "Remote name or URL. Defaults to origin."},
                    "force": {"type": "boolean", "description": "Move the remote branch off the commits it holds, refusing if anything arrived since the last fetch."}
                },
                "additionalProperties": false
            }),
        },
    ]
}

pub fn git_tool_spec(name: &str) -> Option<&'static GitToolSpec> {
    git_tool_specs().iter().find(|spec| spec.name == name)
}

pub fn is_git_tool(name: &str) -> bool {
    git_tool_spec(name).is_some()
}

fn text<'a>(args: &'a HashMap<String, String>, key: &str) -> Option<&'a str> {
    args.get(key)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
}

fn required<'a>(args: &'a HashMap<String, String>, key: &str) -> Result<&'a str> {
    text(args, key).ok_or_else(|| anyhow::anyhow!("missing required argument: {key}"))
}

fn flag(args: &HashMap<String, String>, key: &str) -> Result<bool> {
    match text(args, key) {
        None => Ok(false),
        Some(value) => match value.to_ascii_lowercase().as_str() {
            "true" | "yes" | "1" => Ok(true),
            "false" | "no" | "0" => Ok(false),
            other => bail!("{key} must be true or false, not {other:?}"),
        },
    }
}

fn paths(args: &HashMap<String, String>, key: &str) -> Result<Vec<std::path::PathBuf>> {
    let list: Vec<std::path::PathBuf> = required(args, key)?
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(std::path::PathBuf::from)
        .collect();
    if list.is_empty() {
        bail!("{key} must name at least one path");
    }
    Ok(list)
}

fn hooks(args: &HashMap<String, String>) -> Result<HookPolicy> {
    Ok(if flag(args, "bypass_hooks")? {
        HookPolicy::Bypass
    } else {
        HookPolicy::Respect
    })
}

pub fn push_force(args: &HashMap<String, String>) -> Result<PushForce> {
    Ok(if flag(args, "force")? {
        PushForce::WithLease
    } else {
        PushForce::Never
    })
}

pub fn remote_of(args: &HashMap<String, String>) -> String {
    text(args, "remote").unwrap_or("origin").to_string()
}

/// The typed operation a tool call means. `git_push` is absent on purpose: a
/// push is planned against the checkout first, so it has no argument-only form.
pub fn git_operation_for(tool_name: &str, args: &HashMap<String, String>) -> Result<GitOperation> {
    Ok(match tool_name {
        "git_status" => GitOperation::Status,
        "git_show" => GitOperation::Show {
            rev: text(args, "rev").unwrap_or("HEAD").to_string(),
        },
        "git_log" => GitOperation::RevList {
            branch: text(args, "branch").unwrap_or("HEAD").to_string(),
            exclude: text(args, "exclude")
                .unwrap_or_default()
                .split(',')
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
                .map(str::to_string)
                .collect(),
        },
        "git_branches" => GitOperation::BranchList {
            include_remote: flag(args, "include_remote")?,
        },
        "git_worktrees" => GitOperation::WorktreeList,
        "git_stash_list" => GitOperation::Stash(StashOperation::List),
        "git_stage" => GitOperation::Stage {
            paths: paths(args, "paths")?,
        },
        "git_unstage" => GitOperation::Unstage {
            paths: paths(args, "paths")?,
        },
        "git_branch_create" => GitOperation::BranchCreate {
            name: required(args, "name")?.to_string(),
            base: text(args, "base").map(str::to_string),
        },
        "git_merge" => GitOperation::Merge {
            rev: required(args, "rev")?.to_string(),
            hooks: hooks(args)?,
        },
        "git_rebase" => GitOperation::Rebase {
            onto: required(args, "onto")?.to_string(),
            hooks: hooks(args)?,
        },
        "git_cherry_pick" => GitOperation::CherryPick {
            rev: required(args, "rev")?.to_string(),
        },
        "git_revert" => GitOperation::Revert {
            rev: required(args, "rev")?.to_string(),
        },
        "git_stash" => match required(args, "action")? {
            "save" => GitOperation::Stash(StashOperation::Push {
                message: text(args, "message").map(str::to_string),
                include_untracked: flag(args, "include_untracked")?,
            }),
            "pop" => GitOperation::Stash(StashOperation::Pop),
            other => bail!("git_stash action must be save or pop, not {other:?}"),
        },
        "git_stash_drop" => GitOperation::Stash(StashOperation::Drop {
            index: required(args, "index")?
                .parse()
                .map_err(|_| anyhow::anyhow!("index must be a whole number"))?,
        }),
        "git_fetch" => GitOperation::Fetch {
            remote: remote_of(args),
            prune: flag(args, "prune")?,
        },
        "git_pull" => GitOperation::Pull {
            remote: remote_of(args),
            branch: text(args, "branch").map(str::to_string),
        },
        "git_reset" => GitOperation::Reset {
            mode: ResetMode::parse(text(args, "mode").unwrap_or_default())?,
            rev: required(args, "rev")?.to_string(),
        },
        "git_clean" => GitOperation::Clean {
            directories: flag(args, "directories")?,
            ignored: flag(args, "ignored")?,
        },
        "git_branch_delete" => GitOperation::BranchDelete {
            name: required(args, "name")?.to_string(),
            force: flag(args, "force")?,
        },
        other => bail!("{other} is not a typed git operation"),
    })
}

/// What the approval prompt names as the thing being acted on.
pub fn git_tool_target(tool_name: &str, args: &HashMap<String, String>) -> String {
    match git_operation_for(tool_name, args) {
        Ok(operation) => operation
            .argv()
            .map(|argv| format!("git {}", argv.join(" ")))
            .unwrap_or_else(|_| tool_name.to_string()),
        Err(_) => tool_name.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn args(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect()
    }

    /// Every variant of the typed API is reachable as a tool, or is named here
    /// with what answers it instead. The variant list is read out of git.rs, so
    /// a new operation with no tool and no exception fails this.
    #[test]
    fn every_typed_operation_is_either_a_tool_or_a_named_exception() {
        let source = std::fs::read_to_string(
            Path::new(env!("CARGO_MANIFEST_DIR")).join("src/platform/runtime/git.rs"),
        )
        .expect("read git.rs");
        let body = source
            .split_once("pub enum GitOperation {")
            .expect("GitOperation enum")
            .1;
        let body = body.split_once("\n}\n").expect("enum end").0;

        let variants: Vec<String> = body
            .lines()
            .map(str::trim)
            .filter(|line| {
                line.chars().next().is_some_and(char::is_uppercase)
                    && (line.ends_with('{') || line.ends_with(','))
            })
            .map(|line| {
                line.trim_end_matches(['{', ',', ' '])
                    .split(['(', ' '])
                    .next()
                    .unwrap_or_default()
                    .to_string()
            })
            .collect();
        assert!(
            variants.len() >= 20,
            "parsed too few variants out of git.rs: {variants:?}"
        );

        let covered: Vec<String> = git_tool_specs()
            .iter()
            .filter(|spec| spec.name != "git_push")
            .map(|spec| {
                let operation = git_operation_for(spec.name, &example_args(spec.name))
                    .unwrap_or_else(|error| panic!("{} example args: {error}", spec.name));
                format!("{operation:?}")
                    .split(['(', ' '])
                    .next()
                    .unwrap_or_default()
                    .to_string()
            })
            .collect();

        for variant in &variants {
            let excused = GIT_OPERATIONS_WITHOUT_A_TOOL
                .iter()
                .any(|(name, _)| name == variant);
            assert!(
                covered.contains(variant) || excused || variant == "Push",
                "{variant} has no git tool and no recorded reason for having none"
            );
        }
        for (excused, reason) in GIT_OPERATIONS_WITHOUT_A_TOOL {
            assert!(
                variants.contains(&excused.to_string()),
                "{excused} is excused but is not a GitOperation any more"
            );
            assert!(!reason.is_empty());
        }
    }

    pub(super) fn example_args(tool_name: &str) -> HashMap<String, String> {
        match tool_name {
            "git_stage" | "git_unstage" => args(&[("paths", "src/lib.rs")]),
            "git_branch_create" | "git_branch_delete" => args(&[("name", "feature")]),
            "git_merge" | "git_cherry_pick" | "git_revert" => args(&[("rev", "feature")]),
            "git_rebase" => args(&[("onto", "main")]),
            "git_stash" => args(&[("action", "save")]),
            "git_stash_drop" => args(&[("index", "0")]),
            "git_reset" => args(&[("rev", "HEAD~1"), ("mode", "hard")]),
            _ => HashMap::new(),
        }
    }

    /// A tool's declared class is what the executor enforces, so it may never
    /// sit below what the operation it builds actually does.
    #[test]
    fn no_tool_declares_a_class_milder_than_the_operation_it_builds() {
        for spec in git_tool_specs() {
            if spec.name == "git_push" {
                assert_eq!(spec.class, GitToolClass::Push);
                continue;
            }
            let operation = git_operation_for(spec.name, &example_args(spec.name))
                .unwrap_or_else(|error| panic!("{} example args: {error}", spec.name));
            if operation.is_destructive() {
                assert_eq!(
                    spec.class,
                    GitToolClass::Destructive,
                    "{} builds a destructive operation",
                    spec.name
                );
            }
            if spec.class == GitToolClass::Read {
                assert!(
                    !operation.is_write(),
                    "{} is offered as a read but writes",
                    spec.name
                );
            }
        }
    }

    #[test]
    fn a_read_tool_never_prompts_and_a_destructive_one_always_does() {
        assert!(!GitToolClass::Read.always_asks());
        assert!(!GitToolClass::Mutating.always_asks());
        assert!(GitToolClass::Destructive.always_asks());
        assert!(GitToolClass::Push.always_asks());
    }

    #[test]
    fn arguments_become_a_typed_operation_rather_than_a_command_line() {
        let operation =
            git_operation_for("git_reset", &args(&[("rev", "HEAD~2"), ("mode", "hard")])).unwrap();
        assert_eq!(
            operation.argv().unwrap(),
            vec!["reset", "--hard", "HEAD~2"],
            "the mode is a flag the API chooses, never text a caller supplies"
        );
        assert!(operation.is_destructive());

        let soft =
            git_operation_for("git_reset", &args(&[("rev", "HEAD~2"), ("mode", "soft")])).unwrap();
        assert!(!soft.is_destructive());

        assert!(git_operation_for(
            "git_reset",
            &args(&[("rev", "HEAD"), ("mode", "--hard; rm")])
        )
        .is_err());
        assert!(
            git_operation_for("git_merge", &args(&[("rev", "--upload-pack=touch /tmp/x")]))
                .unwrap()
                .argv()
                .is_err(),
            "an option-shaped ref is refused by the argv builder"
        );
    }

    #[test]
    fn bypassing_hooks_is_an_explicit_argument_and_nothing_else_turns_it_on() {
        let respecting = git_operation_for("git_merge", &args(&[("rev", "feature")])).unwrap();
        assert!(!respecting.bypasses_hooks());

        let bypassing = git_operation_for(
            "git_merge",
            &args(&[("rev", "feature"), ("bypass_hooks", "true")]),
        )
        .unwrap();
        assert!(bypassing.bypasses_hooks());

        assert!(
            git_operation_for(
                "git_merge",
                &args(&[("rev", "feature"), ("bypass_hooks", "maybe")])
            )
            .is_err(),
            "an unreadable flag must not fall back to the permissive answer"
        );
    }

    #[test]
    fn a_push_is_planned_rather_than_assembled_from_arguments() {
        assert!(git_operation_for("git_push", &HashMap::new()).is_err());
        assert_eq!(
            push_force(&args(&[("force", "true")])).unwrap(),
            PushForce::WithLease
        );
        assert_eq!(push_force(&HashMap::new()).unwrap(), PushForce::Never);
        assert_eq!(remote_of(&HashMap::new()), "origin");
        assert_eq!(remote_of(&args(&[("remote", "upstream")])), "upstream");
    }

    #[test]
    fn the_prompt_names_the_argv_the_operation_would_run() {
        assert_eq!(
            git_tool_target(
                "git_clean",
                &args(&[("directories", "true"), ("ignored", "true")])
            ),
            "git clean --force -d -x"
        );
    }
}
