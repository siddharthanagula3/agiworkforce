//! Git worktrees, workspace snapshots and per-turn checkpoints.
//!
//! One owner for what used to be two copies: the CLI's `EnterWorktree` /
//! `ExitWorktree` tools, the desktop's slug-named worktree tools, and the
//! app-server's managed worktrees and checkpoints all drive git through this
//! crate. It shells out to `git` rather than linking libgit2, so the result is
//! exactly what the user's own `git` would do with the same repository.
//!
//! Every subprocess goes through a [`CommandRunner`] so a host that owns a
//! process-tree lifecycle (the CLI cancels a turn by dropping its future) keeps
//! that guarantee for git too.

mod basic;
pub mod checkpoint;
pub mod config_guard;
mod git;
mod include;
pub mod managed;
mod named;
mod porcelain;
mod runner;
pub mod snapshot;

pub use basic::{
    enter_worktree, exit_worktree, list_worktree_entries, list_worktrees, Worktree, WorktreeOptions,
};
pub use git::{
    add_sandbox_writable_roots, host_git, host_git_async, host_git_config_dir, host_git_hardening,
    host_git_keeping_hooks_async, host_git_output_blocking, host_git_path, host_path,
    register_workspace_root, set_host_state_dir, user_config_value,
    HOST_GIT_HARDENING_KEEPING_HOOKS,
};
pub use named::{
    create_or_resume_named_worktree, list_named_worktrees, remove_named_worktree,
    validate_worktree_slug, NamedWorktree,
};
pub use porcelain::{parse_worktree_porcelain, WorktreeEntry};
pub use runner::{CommandRunner, Held, TokioCommandRunner, TrustedConfigRunner};
