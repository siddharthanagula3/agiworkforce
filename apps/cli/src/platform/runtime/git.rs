//! A typed Git API.
//!
//! Every operation is a value with structured arguments, run as an argv the
//! caller cannot inject into, and parsed into a typed result. Nothing here
//! builds a shell string, and nothing returns raw stdout for a caller to guess
//! at: a parse that fails is an error, never a repository state reported wrong.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

use agiworkforce_protocol::code_domain::{
    ChangeKind, CodeCapability, CodePermissionProfile, PermissionDecision, RepositoryId,
    RepositoryPolicy, RepositorySnapshot,
};
use agiworkforce_worktree::config_guard::ConfigUse;
use anyhow::{bail, Context, Result};
use chrono::Utc;

use crate::safety::push_consent::PushConsent;

pub use super::worktree::{list_worktree_entries, parse_worktree_porcelain, WorktreeEntry};

pub(crate) const GIT_OPERATION_TIMEOUT: Duration = Duration::from_secs(120);

/// How long a host git that holds its caller's thread may run.
pub(crate) const HOST_GIT_BLOCKING_TIMEOUT: Duration = Duration::from_secs(30);

/// The output of a host git that blocks this thread, killed at
/// [`HOST_GIT_BLOCKING_TIMEOUT`]. A FIFO a sandboxed command left where git
/// reads, such as `.gitattributes`, would otherwise hold the thread forever.
pub(crate) fn host_git_output(
    command: std::process::Command,
) -> std::io::Result<std::process::Output> {
    agiworkforce_worktree::host_git_output_blocking(command, HOST_GIT_BLOCKING_TIMEOUT)
}

/// [`host_git_output`] for a clone, fetch or pull, which may take as long
/// as [`GIT_NETWORK_TIMEOUT`] and never waits on a prompt. There is no
/// repository yet, or none whose configuration was checked, so ssh is
/// configured from the user's own global configuration only.
pub(crate) fn host_git_network_output(
    mut command: std::process::Command,
) -> std::io::Result<std::process::Output> {
    for (name, value) in
        non_interactive_network_env(|| agiworkforce_worktree::user_config_value("core.sshCommand"))
    {
        command.env(name, value);
    }
    agiworkforce_worktree::host_git_output_blocking(command, GIT_NETWORK_TIMEOUT)
        .map(|mut output| {
            if !output.status.success() {
                output.stderr = with_batch_ssh_hint(&output.stderr).into_bytes();
            }
            output
        })
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::TimedOut {
                std::io::Error::new(std::io::ErrorKind::TimedOut, RemoteDidNotAnswer)
            } else {
                error
            }
        })
}

/// Why a clone, fetch, pull or push was stopped at its deadline. A network
/// git waits on the remote, not on a file in the work tree, or on a custom
/// `core.sshCommand` that asks on the terminal, which batch mode cannot
/// reach and only [`GIT_NETWORK_TIMEOUT`] ends.
#[derive(Debug)]
struct RemoteDidNotAnswer;

impl std::fmt::Display for RemoteDidNotAnswer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "the remote did not answer within {} minutes, so git was stopped. An ssh command \
             of your own that asks for a passphrase or host key on the terminal waits that long; \
             load the key with ssh-add, or connect once from a terminal",
            GIT_NETWORK_TIMEOUT.as_secs() / 60
        )
    }
}

impl std::error::Error for RemoteDidNotAnswer {}

/// The environment that keeps a network git from waiting on a terminal
/// nobody is watching: git asks for no credentials there, ssh never starts
/// an askpass program, and plain ssh runs in batch mode, failing instead of
/// asking for a passphrase or a host key. Git's stdin is already null on
/// both paths that use this. `configured` is the effective
/// `core.sshCommand`, read on every call and only when the environment does
/// not already decide.
fn non_interactive_network_env(
    configured: impl FnOnce() -> Option<String>,
) -> Vec<(&'static str, String)> {
    let mut env = vec![
        ("GIT_TERMINAL_PROMPT", "0".to_string()),
        ("SSH_ASKPASS_REQUIRE", "never".to_string()),
    ];
    if let Some(ssh) = batch_ssh_command(
        std::env::var("GIT_SSH_COMMAND").ok(),
        std::env::var_os("GIT_SSH").is_some(),
        configured,
    ) {
        env.push(("GIT_SSH_COMMAND", ssh));
    }
    env
}

/// The ssh command for a network git, in `GIT_SSH_COMMAND`, which overrides
/// `core.sshCommand`. The user's own command, from the environment or else
/// their git configuration, keeps working: plain `ssh` gets
/// `-o BatchMode=yes` appended, and anything else, or a `GIT_SSH` program,
/// is left as it is, with no `GIT_SSH_COMMAND` set at all.
fn batch_ssh_command(
    environment: Option<String>,
    git_ssh_set: bool,
    configured: impl FnOnce() -> Option<String>,
) -> Option<String> {
    let current = match environment.filter(|command| !command.trim().is_empty()) {
        Some(command) => Some(command),
        None if git_ssh_set => return None,
        None => configured().filter(|command| !command.trim().is_empty()),
    };
    match current {
        None => Some("ssh -o BatchMode=yes".to_string()),
        Some(command) if is_plain_ssh(&command) => {
            Some(format!("{} -o BatchMode=yes", command.trim()))
        }
        Some(_) => None,
    }
}

fn is_plain_ssh(command: &str) -> bool {
    command
        .split_whitespace()
        .next()
        .and_then(|program| Path::new(program).file_name())
        .is_some_and(|name| name == "ssh" || name.eq_ignore_ascii_case("ssh.exe"))
}

/// What ssh says when batch mode stopped it short of a prompt.
const BATCH_SSH_REFUSALS: [&str; 2] = [
    "Permission denied (publickey",
    "Host key verification failed",
];

/// A failed network git's stderr, with how to get past batch mode added when
/// ssh refused for want of a prompt.
fn with_batch_ssh_hint(stderr: &[u8]) -> String {
    let text = String::from_utf8_lossy(stderr).into_owned();
    if !BATCH_SSH_REFUSALS
        .iter()
        .any(|refusal| text.contains(refusal))
    {
        return text;
    }
    format!(
        "{}\nnetwork git runs ssh without prompts; load the key with ssh-add, or connect once \
         from a terminal",
        text.trim_end()
    )
}

/// The sentence to show when a host git could not start or did not finish.
pub(crate) fn host_git_failure(error: &std::io::Error) -> String {
    if let Some(remote) = error
        .get_ref()
        .and_then(|inner| inner.downcast_ref::<RemoteDidNotAnswer>())
    {
        return remote.to_string();
    }
    if error.kind() == std::io::ErrorKind::TimedOut {
        "git did not finish in time and was stopped. A file git reads in this repository may \
         be a pipe or device that never ends."
            .to_string()
    } else {
        format!("Could not run git: {error}")
    }
}

/// Hooks git runs on the host while an operation updates a ref, writes the
/// index, makes a commit, rewrites history, checks out files, or starts its
/// automatic garbage collection. Each operation names the ones it can reach.
/// A fetch or pull runs with automatic maintenance off
/// ([`GitOperation::host_settings`]), so neither reaches `pre-auto-gc`.
const REF_HOOKS: &[&str] = &["reference-transaction"];
const FETCH_HOOKS: &[&str] = &["reference-transaction"];
const INDEX_HOOKS: &[&str] = &["post-index-change"];
const REF_AND_INDEX_HOOKS: &[&str] = &["reference-transaction", "post-index-change"];
const COMMIT_HOOKS: &[&str] = &[
    "pre-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
    "reference-transaction",
    "post-index-change",
    "pre-auto-gc",
];
const REPLAY_HOOKS: &[&str] = &[
    "pre-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
    "post-rewrite",
    "reference-transaction",
    "post-index-change",
    "pre-auto-gc",
];
const MERGE_HOOKS: &[&str] = &[
    "pre-merge-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-merge",
    "reference-transaction",
    "post-index-change",
    "pre-auto-gc",
];
const REBASE_HOOKS: &[&str] = &[
    "pre-rebase",
    "pre-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
    "post-rewrite",
    "post-checkout",
    "reference-transaction",
    "post-index-change",
    "pre-auto-gc",
];
const PULL_HOOKS: &[&str] = &[
    "pre-merge-commit",
    "pre-rebase",
    "pre-commit",
    "prepare-commit-msg",
    "commit-msg",
    "post-commit",
    "post-merge",
    "post-rewrite",
    "post-checkout",
    "reference-transaction",
    "post-index-change",
];
/// What a push can run on this machine: the pre-push hook, and the update of
/// the remote-tracking ref afterwards.
pub const PUSH_HOOKS: &[&str] = &["pre-push", "reference-transaction"];

pub(crate) const GIT_NETWORK_TIMEOUT: Duration = Duration::from_secs(300);

/// NUL-separated fields, body last and terminated, so a multi-line commit
/// message cannot be mistaken for the file list that follows it.
const COMMIT_FORMAT: &str = "--pretty=format:%H%x00%an%x00%aI%x00%s%x00%b%x00";

/// One line per commit for a listing: the sha, then the subject.
const COMMIT_SUMMARY_FORMAT: &str = "--pretty=format:%H%x00%s";

/// Whether an operation runs the repository's hooks. Bypassing them is its own
/// decision with its own name, never a side effect of some other flag.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum HookPolicy {
    #[default]
    Respect,
    Bypass,
}

impl HookPolicy {
    fn bypasses(self) -> bool {
        self == Self::Bypass
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StashOperation {
    Push {
        message: Option<String>,
        include_untracked: bool,
    },
    Pop,
    List,
    Drop {
        index: usize,
    },
}

/// How far back a reset reaches. Only `Hard` touches the working tree, and it
/// is the only one that can lose an edit git never recorded.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ResetMode {
    Soft,
    #[default]
    Mixed,
    Hard,
}

impl ResetMode {
    pub fn label(self) -> &'static str {
        match self {
            Self::Soft => "soft",
            Self::Mixed => "mixed",
            Self::Hard => "hard",
        }
    }

    pub fn parse(value: &str) -> Result<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "soft" => Ok(Self::Soft),
            "" | "mixed" => Ok(Self::Mixed),
            "hard" => Ok(Self::Hard),
            other => bail!("git reset mode must be soft, mixed or hard, not {other:?}"),
        }
    }

    fn flag(self) -> &'static str {
        match self {
            Self::Soft => "--soft",
            Self::Mixed => "--mixed",
            Self::Hard => "--hard",
        }
    }

    /// Whether the working tree is overwritten, losing anything uncommitted.
    pub fn discards_working_tree(self) -> bool {
        self == Self::Hard
    }
}

/// What a diff is read against. The same working tree differs from its index,
/// from the last commit and from any older commit, and each answers a
/// different question about what changed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DiffBaseline {
    /// Edits the index does not hold yet.
    Unstaged,
    /// What the next commit would record.
    Staged,
    /// Everything since the last commit, staged or not.
    Head,
    /// Everything since a commit, branch or tag.
    Revision(String),
}

impl DiffBaseline {
    /// The baselines that need no revision named.
    pub const NAMED: &'static [DiffBaseline] = &[Self::Unstaged, Self::Staged, Self::Head];

    /// Read the word a person types after `/diff`. Anything that is not one of
    /// the named baselines is a revision.
    pub fn parse(value: &str) -> Result<Self> {
        Ok(match value.trim() {
            "" | "unstaged" => Self::Unstaged,
            "staged" | "cached" => Self::Staged,
            "head" | "HEAD" => Self::Head,
            revision => Self::Revision(checked_ref(revision, "diff baseline")?),
        })
    }

    pub fn describe(&self) -> String {
        match self {
            Self::Unstaged => "unstaged changes".to_string(),
            Self::Staged => "staged changes".to_string(),
            Self::Head => "changes since the last commit".to_string(),
            Self::Revision(revision) => format!("changes since {revision}"),
        }
    }

    fn args(&self) -> Result<Vec<String>> {
        Ok(match self {
            Self::Unstaged => Vec::new(),
            Self::Staged => vec!["--cached".into()],
            Self::Head => vec!["HEAD".into()],
            Self::Revision(revision) => vec![checked_ref(revision, "diff baseline")?],
        })
    }
}

/// A diff read against one baseline: the patch text as git wrote it and the
/// structure every surface summarises it from.
#[derive(Debug, Clone)]
pub struct BaselineDiff {
    pub baseline: DiffBaseline,
    pub text: String,
    pub diff: crate::diff_model::Diff,
}

impl BaselineDiff {
    fn from_patch(baseline: DiffBaseline, text: String) -> Self {
        let diff = crate::diff_model::Diff::parse(&text);
        Self {
            baseline,
            text,
            diff,
        }
    }

    /// The per-file summary a slash command prints.
    pub fn summary(&self) -> String {
        if self.diff.is_empty() {
            return format!("No {}.", self.baseline.describe());
        }
        let mut summary = format!(
            "{} ({}):",
            capitalized(&self.baseline.describe()),
            self.diff.stat()
        );
        for file in &self.diff.files {
            summary.push_str("\n  ");
            summary.push_str(&file.summary());
        }
        summary
    }
}

fn capitalized(text: &str) -> String {
    let mut chars = text.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

pub const DIFF_COMMAND_USAGE: &str =
    "Usage: /diff [staged | head | <commit, branch or tag>]. On its own, /diff shows unstaged changes.";

/// What `/diff <baseline>` reads in the working directory, or the sentence to
/// show instead when it cannot.
pub fn diff_for_command(arg: &str) -> std::result::Result<BaselineDiff, String> {
    let baseline = DiffBaseline::parse(arg).map_err(|_| DIFF_COMMAND_USAGE.to_string())?;
    let cwd = std::env::current_dir()
        .map_err(|error| format!("Could not read the working directory: {error}"))?;
    diff_blocking(&cwd, baseline).map_err(|error| error.to_string())
}

pub fn diff_summary_for_command(arg: &str) -> String {
    match diff_for_command(arg) {
        Ok(read) => read.summary(),
        Err(message) => message,
    }
}

/// [`GitApi::diff`] for the slash commands, which run on the terminal's own
/// thread rather than inside the async runtime.
pub fn diff_blocking(root: &Path, baseline: DiffBaseline) -> Result<BaselineDiff> {
    check_repository_config_blocking(root, ConfigUse::DIFF)?;
    let mut command = agiworkforce_worktree::host_git();
    command.current_dir(root).args(diff_argv(&baseline, &[])?);
    let output = match host_git_output(command) {
        Ok(output) => output,
        Err(error) => bail!("{}", host_git_failure(&error)),
    };
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        match detail.trim() {
            "" => bail!("git diff failed."),
            detail => bail!("git diff failed: {detail}"),
        }
    }
    Ok(BaselineDiff::from_patch(
        baseline,
        String::from_utf8_lossy(&output.stdout).into_owned(),
    ))
}

/// Status and diffs never look inside a submodule. Its `.git` file is in
/// the work tree, so a sandboxed command can point it at a git directory
/// whose filters git would then run on the host, and a `.gitmodules` the
/// command wrote can override any configured `ignore`; only this flag wins
/// over both. `dirty` still compares each submodule's recorded commit with
/// the one its `HEAD` names, which runs nothing there, so a moved submodule
/// pointer shows, stages and commits like any other change.
const IGNORE_SUBMODULES: &str = "--ignore-submodules=dirty";

/// A fetch, pull or push never recurses into submodules, for the same reason.
const NO_RECURSE_SUBMODULES: &str = "--no-recurse-submodules";

fn diff_argv(baseline: &DiffBaseline, paths: &[PathBuf]) -> Result<Vec<String>> {
    let mut argv = vec![
        "diff".to_string(),
        "--no-color".to_string(),
        "--no-ext-diff".to_string(),
        IGNORE_SUBMODULES.to_string(),
    ];
    argv.extend(baseline.args()?);
    argv.push("--".to_string());
    if !paths.is_empty() {
        argv.extend(checked_paths(paths)?);
    }
    Ok(argv)
}

/// Where the CLI keeps each repository's recorded git settings and its
/// private index locks: inside its config root, and named on its own in
/// [`crate::sandbox::protected_paths_for`] so every sandbox keeps it
/// read-only, even one whose workspace is inside the config root.
pub(crate) fn git_state_dir() -> Option<PathBuf> {
    crate::config::CliConfig::config_dir()
        .ok()
        .map(|dir| dir.join("git-state"))
}

/// Point the shared crate at [`git_state_dir`]. Every entry into host git
/// calls this first; the first call in a process names the directory.
pub(crate) fn use_git_state_dir() {
    if let Some(dir) = git_state_dir() {
        agiworkforce_worktree::set_host_state_dir(dir);
    }
}

/// Record the code-running git settings of the repository at `dir`, unless
/// one was recorded before. Called once at session start, before any
/// sandboxed command runs, so what a command writes later is told apart
/// from what was there. See [`agiworkforce_worktree::config_guard`].
pub(crate) async fn record_config_baseline_at_start(dir: &Path) {
    use_git_state_dir();
    let runner = super::worktree::ProcessTreeRunner;
    let recorded = match agiworkforce_worktree::checkpoint::Workspace::discover(&runner, dir).await
    {
        Ok(Some(workspace)) => {
            agiworkforce_worktree::config_guard::ensure_baseline(&runner, &workspace).await
        }
        Ok(None) => Ok(()),
        Err(error) => Err(error),
    };
    if let Err(error) = recorded {
        tracing::warn!(folder = %dir.display(), %error, "repository git settings not recorded");
    }
}

/// Refuse when `root`'s repository sets anything that would run code under
/// host git and that it did not set when its settings were recorded, or,
/// unless the user trusts the folder, anything in its work tree. See
/// [`agiworkforce_worktree::config_guard`].
pub(crate) async fn check_repository_config(root: &Path, uses: ConfigUse) -> Result<()> {
    use_git_state_dir();
    let runner = super::worktree::ProcessTreeRunner;
    if crate::trust::restrictions_for(root).repository_config {
        let trusted = agiworkforce_worktree::TrustedConfigRunner(&runner);
        agiworkforce_worktree::config_guard::check_repository_config_at(&trusted, root, uses).await
    } else {
        agiworkforce_worktree::config_guard::check_repository_config_at(&runner, root, uses).await
    }
}

/// [`check_repository_config`] for a caller off the async runtime.
pub(crate) fn check_repository_config_blocking(root: &Path, uses: ConfigUse) -> Result<()> {
    use_git_state_dir();
    agiworkforce_worktree::config_guard::check_repository_config_blocking(
        root,
        uses,
        crate::trust::restrictions_for(root).repository_config,
    )
}

/// Everything this API can do, as values rather than command strings.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GitOperation {
    Show {
        rev: String,
    },
    /// One of the three versions git keeps in the index for an unmerged path.
    ShowStage {
        path: PathBuf,
        stage: u8,
    },
    BranchList {
        include_remote: bool,
    },
    WorktreeList,
    /// The branch HEAD points at, which fails when HEAD is detached.
    HeadBranch,
    RevParse {
        spec: String,
    },
    Status,
    Stage {
        paths: Vec<PathBuf>,
    },
    Unstage {
        paths: Vec<PathBuf>,
    },
    /// Record what the index holds as a new commit on the current branch.
    /// Nothing unstaged goes in, and the repository's commit hooks run.
    Commit {
        message: String,
    },
    BranchCreate {
        name: String,
        base: Option<String>,
    },
    Merge {
        rev: String,
        hooks: HookPolicy,
    },
    Rebase {
        onto: String,
        hooks: HookPolicy,
    },
    CherryPick {
        rev: String,
    },
    Revert {
        rev: String,
    },
    Stash(StashOperation),
    Fetch {
        remote: String,
        prune: bool,
    },
    Pull {
        remote: String,
        branch: Option<String>,
    },
    Push {
        remote: String,
        branch: String,
        set_upstream: bool,
        force: PushForce,
    },
    /// Commits reachable from `branch` that `exclude` does not already hold.
    RevList {
        branch: String,
        exclude: Vec<String>,
    },
    /// The patch between the working tree and `baseline`, narrowed to `paths`
    /// when any are named.
    Diff {
        baseline: DiffBaseline,
        paths: Vec<PathBuf>,
    },
    /// Move the current branch to `rev`. `Hard` also overwrites the working
    /// tree, which is why it is a mode rather than a flag on some other call.
    Reset {
        mode: ResetMode,
        rev: String,
    },
    /// Delete files git is not tracking. Nothing here is recoverable from the
    /// repository, so `ignored` is separate: it reaches build output and
    /// local environment files a `.gitignore` deliberately hides.
    Clean {
        directories: bool,
        ignored: bool,
    },
    BranchDelete {
        name: String,
        force: bool,
    },
}

/// Whether a push may move a remote branch to a commit that is not a
/// descendant of what is there. A plain `--force` overwrites whatever arrived
/// since the last fetch, so it is not offered.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum PushForce {
    #[default]
    Never,
    WithLease,
}

impl GitOperation {
    pub fn label(&self) -> &'static str {
        match self {
            Self::Show { .. } => "show",
            Self::ShowStage { .. } => "show stage",
            Self::BranchList { .. } => "branch list",
            Self::WorktreeList => "worktree list",
            Self::HeadBranch => "head branch",
            Self::RevParse { .. } => "rev-parse",
            Self::Status => "status",
            Self::Stage { .. } => "stage",
            Self::Unstage { .. } => "unstage",
            Self::Commit { .. } => "commit",
            Self::BranchCreate { .. } => "branch create",
            Self::Merge { .. } => "merge",
            Self::Rebase { .. } => "rebase",
            Self::CherryPick { .. } => "cherry-pick",
            Self::Revert { .. } => "revert",
            Self::Stash(_) => "stash",
            Self::Fetch { .. } => "fetch",
            Self::Pull { .. } => "pull",
            Self::Push { .. } => "push",
            Self::RevList { .. } => "rev-list",
            Self::Diff { .. } => "diff",
            Self::Reset { .. } => "reset",
            Self::Clean { .. } => "clean",
            Self::BranchDelete { .. } => "branch delete",
        }
    }

    /// An operation that throws work away with nothing in the repository left
    /// to recover it from. These never run on an implied approval.
    pub fn is_destructive(&self) -> bool {
        match self {
            Self::Reset { mode, .. } => mode.discards_working_tree(),
            Self::Clean { .. }
            | Self::BranchDelete { .. }
            | Self::Stash(StashOperation::Drop { .. }) => true,
            Self::Push { force, .. } => *force == PushForce::WithLease,
            _ => false,
        }
    }

    pub fn is_write(&self) -> bool {
        !matches!(
            self,
            Self::Show { .. }
                | Self::ShowStage { .. }
                | Self::BranchList { .. }
                | Self::WorktreeList
                | Self::HeadBranch
                | Self::RevParse { .. }
                | Self::Status
                | Self::RevList { .. }
                | Self::Diff { .. }
                | Self::Stash(StashOperation::List)
        )
    }

    pub fn bypasses_hooks(&self) -> bool {
        match self {
            Self::Merge { hooks, .. } | Self::Rebase { hooks, .. } => hooks.bypasses(),
            _ => false,
        }
    }

    /// The repository hooks this operation can run on the host, outside any
    /// sandbox.
    pub fn host_hooks(&self) -> &'static [&'static str] {
        match self {
            Self::Commit { .. } => COMMIT_HOOKS,
            Self::Merge { .. } => MERGE_HOOKS,
            Self::Rebase { .. } => REBASE_HOOKS,
            Self::Pull { .. } => PULL_HOOKS,
            Self::CherryPick { .. } | Self::Revert { .. } => REPLAY_HOOKS,
            Self::Push { .. } => PUSH_HOOKS,
            Self::Fetch { .. } => FETCH_HOOKS,
            Self::BranchCreate { .. } | Self::BranchDelete { .. } => REF_HOOKS,
            Self::Status | Self::Stage { .. } | Self::Unstage { .. } => INDEX_HOOKS,
            Self::Reset { .. }
            | Self::Stash(StashOperation::Push { .. })
            | Self::Stash(StashOperation::Pop)
            | Self::Stash(StashOperation::Drop { .. }) => REF_AND_INDEX_HOOKS,
            Self::Show { .. }
            | Self::ShowStage { .. }
            | Self::BranchList { .. }
            | Self::WorktreeList
            | Self::HeadBranch
            | Self::RevParse { .. }
            | Self::RevList { .. }
            | Self::Diff { .. }
            | Self::Stash(StashOperation::List)
            | Self::Clean { .. } => &[],
        }
    }

    /// Which of the repository's code-running settings this operation would
    /// obey, for [`check_repository_config`].
    pub fn config_use(&self) -> ConfigUse {
        match self {
            Self::Show { .. } => ConfigUse::SHOW,
            Self::Diff { .. } => ConfigUse::DIFF,
            Self::Commit { .. } => ConfigUse::COMMIT,
            Self::Status
            | Self::Stage { .. }
            | Self::Unstage { .. }
            | Self::Stash(StashOperation::Push { .. })
            | Self::Stash(StashOperation::Drop { .. })
            | Self::Reset { .. }
            | Self::Clean { .. } => ConfigUse::CONTENT,
            Self::Merge { .. }
            | Self::Rebase { .. }
            | Self::CherryPick { .. }
            | Self::Revert { .. }
            | Self::Stash(StashOperation::Pop) => ConfigUse::MERGE,
            Self::Pull { .. } => ConfigUse::PULL,
            Self::Fetch { .. } => ConfigUse::NETWORK,
            Self::Push { .. } => ConfigUse::PUSH,
            Self::RevList { .. } | Self::Stash(StashOperation::List) => ConfigUse::LOG,
            Self::BranchCreate { .. } | Self::BranchDelete { .. } => ConfigUse::REFS,
            Self::ShowStage { .. }
            | Self::BranchList { .. }
            | Self::WorktreeList
            | Self::HeadBranch
            | Self::RevParse { .. } => ConfigUse::NONE,
        }
    }

    /// Settings this operation runs with ahead of its own arguments. A fetch
    /// or pull would start automatic maintenance, which runs `pre-auto-gc`,
    /// a hook husky installs, so every fetch would ask about hooks; with it
    /// off, they reach only the hooks [`Self::host_hooks`] names. Nothing
    /// that talks to a remote may reach a repository on this machine: git
    /// runs the other side's own hooks and settings for a local path, with
    /// none of this side's hardening.
    fn host_settings(&self) -> &'static [&'static str] {
        match self {
            Self::Fetch { .. } | Self::Pull { .. } => &[
                "-c",
                "gc.auto=0",
                "-c",
                "maintenance.auto=false",
                "-c",
                "protocol.file.allow=never",
            ],
            Self::Push { .. } => &["-c", "protocol.file.allow=never"],
            _ => &[],
        }
    }

    /// The remote a fetch, pull or push names.
    fn remote(&self) -> Option<&str> {
        match self {
            Self::Fetch { remote, .. } | Self::Pull { remote, .. } | Self::Push { remote, .. } => {
                Some(remote.as_str())
            }
            _ => None,
        }
    }

    /// Whether git may run `git status` inside a submodule for this
    /// operation, whatever it is told: a commit with nothing staged prints
    /// the status, and a stash reads every submodule's. [`GitApi::commit`]
    /// refuses an empty commit before git runs, so only a stash still does;
    /// no setting short of naming every submodule stops it. Its submodules'
    /// git directories are checked first, and one a sandboxed command swaps
    /// between that check and the stash is not seen.
    fn reads_submodule_status(&self) -> bool {
        matches!(
            self,
            Self::Commit { .. } | Self::Stash(StashOperation::Push { .. })
        )
    }

    fn reaches_network(&self) -> bool {
        matches!(
            self,
            Self::Fetch { .. } | Self::Pull { .. } | Self::Push { .. }
        )
    }

    /// The permission capabilities this operation spends. A caller asks the
    /// session's profile about each one before running it.
    pub fn capabilities(&self) -> Vec<CodeCapability> {
        let mut capabilities = Vec::new();
        match self {
            Self::Stage { .. }
            | Self::Unstage { .. }
            | Self::Commit { .. }
            | Self::BranchCreate { .. }
            | Self::CherryPick { .. }
            | Self::Revert { .. }
            | Self::Stash(_)
            | Self::Merge { .. } => capabilities.push(CodeCapability::FileWrite),
            Self::Rebase { .. } => {
                capabilities.push(CodeCapability::FileWrite);
                capabilities.push(CodeCapability::GitHistoryRewrite);
            }
            Self::Pull { .. } => capabilities.push(CodeCapability::FileWrite),
            Self::Clean { .. } => capabilities.push(CodeCapability::FileWrite),
            Self::Reset { .. } | Self::BranchDelete { .. } => {
                capabilities.push(CodeCapability::FileWrite);
                capabilities.push(CodeCapability::GitHistoryRewrite);
            }
            Self::Push { force, .. } => {
                capabilities.push(CodeCapability::GitPush);
                if *force == PushForce::WithLease {
                    capabilities.push(CodeCapability::GitHistoryRewrite);
                }
            }
            _ => {}
        }
        if self.reaches_network() {
            capabilities.push(CodeCapability::NetworkAccess);
        }
        if self.bypasses_hooks() {
            capabilities.push(CodeCapability::GitHookBypass);
        }
        capabilities.dedup();
        capabilities
    }

    /// The argv this operation runs. A ref or a path that would be read as an
    /// option is refused rather than escaped, and positional arguments are
    /// separated with `--`.
    pub fn argv(&self) -> Result<Vec<String>> {
        let argv = match self {
            Self::Show { rev } => {
                vec![
                    "show".into(),
                    "--no-color".into(),
                    "--name-only".into(),
                    IGNORE_SUBMODULES.into(),
                    COMMIT_FORMAT.into(),
                    checked_ref(rev, "rev")?,
                ]
            }
            Self::ShowStage { path, stage } => {
                if !(1..=3).contains(stage) {
                    bail!("git index stage must be 1, 2 or 3, not {stage}");
                }
                let display = checked_text(&path.to_string_lossy(), "path")?.replace('\\', "/");
                if display.starts_with('/') || display.starts_with("..") {
                    bail!("git stage path must be relative to the repository root: {display:?}");
                }
                vec!["show".into(), format!(":{stage}:{display}")]
            }
            Self::BranchList { include_remote } => {
                let mut argv = vec![
                    "branch".into(),
                    "--list".into(),
                    "--no-color".into(),
                    "--format=%(HEAD)%00%(refname:short)%00%(objectname:short)%00%(upstream:short)"
                        .into(),
                ];
                if *include_remote {
                    argv.push("--all".into());
                }
                argv
            }
            Self::WorktreeList => vec!["worktree".into(), "list".into(), "--porcelain".into()],
            Self::HeadBranch => vec![
                "symbolic-ref".into(),
                "--quiet".into(),
                "--short".into(),
                "HEAD".into(),
            ],
            Self::RevParse { spec } => vec![
                "rev-parse".into(),
                "--verify".into(),
                checked_ref(spec, "spec")?,
            ],
            Self::Status => vec![
                "status".into(),
                "--porcelain".into(),
                "--branch".into(),
                IGNORE_SUBMODULES.into(),
            ],
            Self::Stage { paths } => {
                let mut argv = vec!["add".into(), "--".into()];
                argv.extend(checked_paths(paths)?);
                argv
            }
            Self::Unstage { paths } => {
                let mut argv = vec!["restore".into(), "--staged".into(), "--".into()];
                argv.extend(checked_paths(paths)?);
                argv
            }
            Self::Commit { message } => vec![
                "commit".into(),
                format!("--message={}", checked_message(message)?),
            ],
            Self::BranchCreate { name, base } => {
                let mut argv = vec!["branch".into(), checked_ref(name, "branch")?];
                if let Some(base) = base {
                    argv.push(checked_ref(base, "base")?);
                }
                argv
            }
            Self::Merge { rev, hooks } => {
                let mut argv = vec!["merge".into(), "--no-edit".into()];
                if hooks.bypasses() {
                    argv.push("--no-verify".into());
                }
                argv.push(checked_ref(rev, "rev")?);
                argv
            }
            Self::Rebase { onto, hooks } => {
                let mut argv = vec!["rebase".into()];
                if hooks.bypasses() {
                    argv.push("--no-verify".into());
                }
                argv.push(checked_ref(onto, "onto")?);
                argv
            }
            Self::CherryPick { rev } => vec!["cherry-pick".into(), checked_ref(rev, "rev")?],
            Self::Revert { rev } => vec![
                "revert".into(),
                "--no-edit".into(),
                checked_ref(rev, "rev")?,
            ],
            Self::Stash(StashOperation::Push {
                message,
                include_untracked,
            }) => {
                let mut argv = vec!["stash".into(), "push".into()];
                if *include_untracked {
                    argv.push("--include-untracked".into());
                }
                if let Some(message) = message {
                    argv.push("--message".into());
                    argv.push(checked_text(message, "message")?);
                }
                argv
            }
            Self::Stash(StashOperation::Pop) => {
                vec!["stash".into(), "pop".into(), "--quiet".into()]
            }
            Self::Stash(StashOperation::List) => vec!["stash".into(), "list".into()],
            Self::Stash(StashOperation::Drop { index }) => {
                vec!["stash".into(), "drop".into(), format!("stash@{{{index}}}")]
            }
            Self::Fetch { remote, prune } => {
                let mut argv = vec!["fetch".into(), NO_RECURSE_SUBMODULES.into()];
                if *prune {
                    argv.push("--prune".into());
                }
                argv.push(checked_remote(remote)?);
                argv
            }
            Self::Pull { remote, branch } => {
                let mut argv = vec![
                    "pull".into(),
                    "--no-edit".into(),
                    NO_RECURSE_SUBMODULES.into(),
                    checked_remote(remote)?,
                ];
                if let Some(branch) = branch {
                    argv.push(checked_ref(branch, "branch")?);
                }
                argv
            }
            Self::Push {
                remote,
                branch,
                set_upstream,
                force,
            } => {
                let mut argv = vec!["push".into(), NO_RECURSE_SUBMODULES.into()];
                if *force == PushForce::WithLease {
                    argv.push("--force-with-lease".into());
                }
                if *set_upstream {
                    argv.push("--set-upstream".into());
                }
                argv.push(checked_remote(remote)?);
                let branch = checked_ref(branch, "branch")?;
                argv.push(format!("refs/heads/{branch}:refs/heads/{branch}"));
                argv
            }
            Self::RevList { branch, exclude } => {
                let mut argv = vec![
                    "log".into(),
                    "--no-color".into(),
                    COMMIT_SUMMARY_FORMAT.into(),
                    checked_ref(branch, "branch")?,
                ];
                for spec in exclude {
                    argv.push(format!("^{}", checked_ref(spec, "exclude")?));
                }
                argv
            }
            Self::Diff { baseline, paths } => diff_argv(baseline, paths)?,
            Self::Reset { mode, rev } => vec![
                "reset".into(),
                mode.flag().into(),
                NO_RECURSE_SUBMODULES.into(),
                checked_ref(rev, "rev")?,
            ],
            Self::Clean {
                directories,
                ignored,
            } => {
                let mut argv = vec!["clean".into(), "--force".into()];
                if *directories {
                    argv.push("-d".into());
                }
                if *ignored {
                    argv.push("-x".into());
                }
                argv
            }
            Self::BranchDelete { name, force } => vec![
                "branch".into(),
                if *force { "-D" } else { "--delete" }.into(),
                checked_ref(name, "branch")?,
            ],
        };
        Ok(argv)
    }
}

fn checked_text(value: &str, field: &str) -> Result<String> {
    if value.trim().is_empty() {
        bail!("git {field} must not be empty");
    }
    if value.contains('\n') || value.contains('\r') || value.contains('\0') {
        bail!("git {field} must not contain a control character");
    }
    Ok(value.to_string())
}

/// A commit message keeps its line breaks, since a body is paragraphs, but
/// nothing else a terminal or git would read as control.
fn checked_message(value: &str) -> Result<String> {
    if value.trim().is_empty() {
        bail!("git commit message must not be empty");
    }
    if value
        .chars()
        .any(|ch| ch.is_control() && ch != '\n' && ch != '\t')
    {
        bail!("git commit message must not contain a control character other than a line break");
    }
    Ok(value.to_string())
}

/// A hook git would run: a file, and on Unix one with an execute bit. Git for
/// Windows runs a hook file whatever its mode.
fn is_runnable_hook(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.is_file() && meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        meta.is_file()
    }
}

/// The hook files an approval pins, sorted by path, each with its mode and
/// content hash. A hooks directory outside `work_tree` holds only what git
/// runs: every runnable file directly in it but a `.sample`. One inside the
/// work tree, where a sandboxed command can write, is pinned whole: every
/// regular file below it, since a hook can run any of them, and for a husky
/// layout (the directory is `<x>/_` or holds an `h` launcher) the regular
/// files directly in `<x>`, where the scripts its stubs run live. A missing
/// directory holds none.
fn hook_files(dir: &Path, work_tree: &Path) -> Result<Vec<HookFile>> {
    let canonical =
        |path: &Path| std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let mut paths = Vec::new();
    if canonical(dir).starts_with(canonical(work_tree)) {
        regular_files_below(dir, &mut paths)?;
        let husky = dir.file_name().is_some_and(|name| name == "_") || dir.join("h").is_file();
        if let Some(parent) = dir.parent().filter(|_| husky) {
            paths.extend(
                read_dir_or_empty(parent)?.into_iter().filter(|path| {
                    std::fs::symlink_metadata(path).is_ok_and(|meta| meta.is_file())
                }),
            );
        }
    } else {
        paths.extend(read_dir_or_empty(dir)?.into_iter().filter(|path| {
            path.extension()
                .is_none_or(|extension| extension != "sample")
                && is_runnable_hook(path)
        }));
    }
    paths.sort();
    paths.dedup();
    paths.into_iter().map(hook_file).collect()
}

/// The entries directly in `dir`; none when it does not exist.
fn read_dir_or_empty(dir: &Path) -> Result<Vec<PathBuf>> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::NotFound | std::io::ErrorKind::NotADirectory
            ) =>
        {
            return Ok(Vec::new())
        }
        Err(error) => return Err(error).with_context(|| format!("read {}", dir.display())),
    };
    entries
        .map(|entry| {
            entry
                .map(|entry| entry.path())
                .with_context(|| format!("read {}", dir.display()))
        })
        .collect()
}

/// Every regular file below `dir`, without following a symlinked directory.
fn regular_files_below(dir: &Path, found: &mut Vec<PathBuf>) -> Result<()> {
    for path in read_dir_or_empty(dir)? {
        let meta = std::fs::symlink_metadata(&path)
            .with_context(|| format!("inspect {}", path.display()))?;
        if meta.is_dir() {
            regular_files_below(&path, found)?;
        } else if meta.is_file() {
            found.push(path);
        }
    }
    Ok(())
}

fn hook_file(path: PathBuf) -> Result<HookFile> {
    use sha2::{Digest, Sha256};

    let content = std::fs::read(&path).with_context(|| format!("read {}", path.display()))?;
    #[cfg(unix)]
    let mode = {
        use std::os::unix::fs::PermissionsExt;
        std::fs::metadata(&path)
            .with_context(|| format!("inspect {}", path.display()))?
            .permissions()
            .mode()
    };
    #[cfg(not(unix))]
    let mode = 0;
    Ok(HookFile {
        path,
        mode,
        sha256: crate::hex::encode(&Sha256::digest(&content)),
    })
}

fn checked_ref(value: &str, field: &str) -> Result<String> {
    let value = checked_text(value, field)?;
    if value.starts_with('-') {
        bail!("git {field} must not start with '-': {value:?}");
    }
    Ok(value)
}

fn checked_paths(paths: &[PathBuf]) -> Result<Vec<String>> {
    if paths.is_empty() {
        bail!("git path list must name at least one path");
    }
    paths
        .iter()
        .map(|path| {
            let display = path.to_string_lossy();
            checked_text(&display, "path")
        })
        .collect()
}

/// Why a remote that is not a configured name or a network URL is refused.
const LOCAL_REMOTE_UNSUPPORTED: &str = "Local-path remotes aren't supported for agent git: git \
     would run that repository's own hooks and settings on this machine, outside the sandbox. \
     Use a configured remote, or an https, ssh or git URL.";

/// A remote is a name or a URL. A URL goes through the one validator the
/// product already has for a git source, which refuses an embedded credential
/// and points at a credential helper or an SSH key: this API never carries a
/// credential of its own, and refuses a `file://` one. Anything else must be
/// a remote the repository configures, which [`GitApi::configured_remote`]
/// checks before git runs; one spelled as a path never is.
fn checked_remote(remote: &str) -> Result<String> {
    let remote = checked_ref(remote, "remote")?;
    if is_remote_url(&remote) {
        crate::marketplace::validate_git_clone_url(&remote)?;
    } else if remote.starts_with(['.', '/', '~', '\\'])
        || remote.contains(['\\', ':'])
        || Path::new(&remote).is_absolute()
    {
        bail!("refusing git remote {remote:?}: {LOCAL_REMOTE_UNSUPPORTED}");
    }
    Ok(remote)
}

fn is_remote_url(remote: &str) -> bool {
    remote.contains("://") || remote.starts_with("git@")
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitDetail {
    pub commit: String,
    pub author: String,
    pub authored_at: String,
    pub subject: String,
    pub body: String,
    pub files: Vec<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BranchRef {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub commit: String,
    pub upstream: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RevParsed {
    pub spec: String,
    pub commit: String,
}

/// A path git left with conflict markers, and which side each change came from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConflictedPath {
    pub path: PathBuf,
    pub kind: ConflictKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictKind {
    BothModified,
    BothAdded,
    BothDeleted,
    DeletedByUs,
    DeletedByThem,
    AddedByUs,
    AddedByThem,
}

impl ConflictKind {
    pub fn label(self) -> &'static str {
        match self {
            Self::BothModified => "both modified",
            Self::BothAdded => "both added",
            Self::BothDeleted => "both deleted",
            Self::DeletedByUs => "deleted by us",
            Self::DeletedByThem => "deleted by them",
            Self::AddedByUs => "added by us",
            Self::AddedByThem => "added by them",
        }
    }

    fn from_codes(index: char, worktree: char) -> Option<Self> {
        match (index, worktree) {
            ('U', 'U') => Some(Self::BothModified),
            ('A', 'A') => Some(Self::BothAdded),
            ('D', 'D') => Some(Self::BothDeleted),
            ('D', 'U') => Some(Self::DeletedByUs),
            ('U', 'D') => Some(Self::DeletedByThem),
            ('A', 'U') => Some(Self::AddedByUs),
            ('U', 'A') => Some(Self::AddedByThem),
            _ => None,
        }
    }
}

/// What a merge, rebase, cherry-pick, revert or pull did. A conflict is a
/// result the caller can branch on, not prose in a stdout blob.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MergeOutcome {
    AlreadyUpToDate,
    Merged { head: Option<String> },
    Conflicted { paths: Vec<ConflictedPath> },
}

impl MergeOutcome {
    pub fn is_conflicted(&self) -> bool {
        matches!(self, Self::Conflicted { .. })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StagedOutcome {
    pub paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StashOutcome {
    Saved { message: String },
    Restored,
    Dropped,
    Listed { entries: Vec<String> },
    NothingToStash,
}

pub fn parse_commit_detail(text: &str) -> Result<CommitDetail> {
    let mut fields = text.split('\0');
    let commit = fields
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .context("git show returned no commit id")?
        .to_string();
    let author = fields.next().unwrap_or_default().to_string();
    let authored_at = fields.next().unwrap_or_default().to_string();
    let subject = fields.next().unwrap_or_default().to_string();
    let body = fields.next().unwrap_or_default().trim().to_string();
    let files = fields
        .next()
        .unwrap_or_default()
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .collect();

    Ok(CommitDetail {
        commit,
        author,
        authored_at,
        subject,
        body,
        files,
    })
}

pub fn parse_branch_list(text: &str) -> Vec<BranchRef> {
    text.lines()
        .filter_map(|line| {
            let mut fields = line.split('\0');
            let head = fields.next().unwrap_or_default();
            let name = fields.next().unwrap_or_default().trim();
            if name.is_empty() {
                return None;
            }
            let commit = fields.next().unwrap_or_default().trim().to_string();
            let upstream = fields
                .next()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            Some(BranchRef {
                name: name.to_string(),
                is_current: head.trim() == "*",
                is_remote: name.starts_with("remotes/") || name.starts_with("origin/"),
                commit,
                upstream,
            })
        })
        .collect()
}

/// Conflicted paths from `git status --porcelain`.
pub fn parse_conflicts(text: &str) -> Vec<ConflictedPath> {
    text.lines()
        .filter_map(|line| {
            if line.len() < 4 || !line.is_char_boundary(3) {
                return None;
            }
            let mut columns = line.chars();
            let index = columns.next()?;
            let worktree = columns.next()?;
            let kind = ConflictKind::from_codes(index, worktree)?;
            let path = line[3..].trim().trim_matches('"');
            if path.is_empty() {
                return None;
            }
            Some(ConflictedPath {
                path: PathBuf::from(path),
                kind,
            })
        })
        .collect()
}

/// A commit as a listing shows it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommitSummary {
    pub commit: String,
    pub subject: String,
}

pub fn parse_commit_summaries(text: &str) -> Vec<CommitSummary> {
    text.lines()
        .filter_map(|line| {
            let (commit, subject) = line.split_once('\0')?;
            let commit = commit.trim();
            (!commit.is_empty()).then(|| CommitSummary {
                commit: commit.to_string(),
                subject: subject.trim().to_string(),
            })
        })
        .collect()
}

/// Why a push needs a decision before it runs. A reason is either something
/// the user must approve or something that stops the push outright.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PushReason {
    NoUpstream,
    ProtectedBranch,
    DefaultBranch,
    ForcePush,
    DetachedHead,
    NotOnPlannedBranch { head: String },
    BranchMoved { planned: String, head: String },
    NothingToPush,
    ConsentNotForThisPush,
    NotApproved,
}

impl PushReason {
    pub fn label(&self) -> String {
        match self {
            Self::NoUpstream => {
                "this branch has no upstream, so the push would create one".to_string()
            }
            Self::ProtectedBranch => "the repository marks this branch protected".to_string(),
            Self::DefaultBranch => {
                "the repository does not allow a direct push to its default branch".to_string()
            }
            Self::ForcePush => {
                "a force push moves the remote branch off the commits it holds".to_string()
            }
            Self::DetachedHead => "HEAD is detached, so there is no branch to push".to_string(),
            Self::NotOnPlannedBranch { head } => {
                format!("the checkout is on {head}, not the branch this push was planned for")
            }
            Self::BranchMoved { planned, head } => {
                format!("the branch moved from {planned} to {head} after the push was planned")
            }
            Self::NothingToPush => "the remote already holds every commit here".to_string(),
            Self::ConsentNotForThisPush => {
                "the approval on record was given for a different push".to_string()
            }
            Self::NotApproved => "nobody has approved this push".to_string(),
        }
    }

    /// A reason that stops the push, as opposed to one the user can approve.
    pub fn blocks(&self) -> bool {
        matches!(
            self,
            Self::DetachedHead
                | Self::NotOnPlannedBranch { .. }
                | Self::BranchMoved { .. }
                | Self::NothingToPush
                | Self::ConsentNotForThisPush
        )
    }
}

/// Exactly what a push would send, where, and what has to be decided first.
/// Building this reaches the repository only for reads; nothing leaves the
/// machine until [`GitApi::push`] runs the plan.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushPlan {
    pub remote: String,
    pub branch: String,
    pub head: String,
    pub upstream: Option<String>,
    pub force: PushForce,
    pub commits: Vec<CommitSummary>,
    pub reasons: Vec<PushReason>,
    consent: Option<PushConsent>,
}

impl PushPlan {
    pub fn sets_upstream(&self) -> bool {
        self.upstream.is_none()
    }

    pub fn operation(&self) -> GitOperation {
        GitOperation::Push {
            remote: self.remote.clone(),
            branch: self.branch.clone(),
            set_upstream: self.sets_upstream(),
            force: self.force,
        }
    }

    pub fn capabilities(&self) -> Vec<CodeCapability> {
        self.operation().capabilities()
    }

    pub fn blocked_by(&self) -> Option<&PushReason> {
        self.reasons.iter().find(|reason| reason.blocks())
    }

    /// Reasons the user is asked about, in the order they are shown.
    pub fn approvals(&self) -> Vec<&PushReason> {
        self.reasons
            .iter()
            .filter(|reason| !reason.blocks())
            .collect()
    }

    pub fn needs_approval(&self) -> bool {
        !self.approvals().is_empty()
    }

    /// Attach the consent the user gave. Only the approval path mints one, and
    /// [`GitApi::push`] checks that it was given for this plan.
    pub fn approved(mut self, consent: PushConsent) -> Self {
        self.consent = Some(consent);
        self
    }

    pub fn is_approved(&self) -> bool {
        self.consent.is_some()
    }

    pub fn consent(&self) -> Option<&PushConsent> {
        self.consent.as_ref()
    }

    /// One line naming the remote, the branch and how many commits go with it.
    pub fn summary(&self) -> String {
        format!(
            "push {} commit(s) from {} to {}/{}",
            self.commits.len(),
            self.branch,
            self.remote,
            self.branch
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushOutcome {
    pub remote: String,
    pub branch: String,
    pub head: String,
    pub commits: Vec<CommitSummary>,
}

/// Submodule paths declared in a `.gitmodules` file.
pub fn parse_submodule_paths(gitmodules: &str) -> BTreeSet<PathBuf> {
    gitmodules
        .lines()
        .filter_map(|line| {
            let (key, value) = line.split_once('=')?;
            if key.trim() != "path" {
                return None;
            }
            Some(PathBuf::from(value.trim()))
        })
        .collect()
}

#[derive(Debug, Clone)]
struct GitOutput {
    success: bool,
    stdout: String,
    stderr: String,
}

/// One hook file as the user approved it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HookFile {
    pub path: PathBuf,
    /// The file's permission bits; always zero where there are none.
    pub mode: u32,
    pub sha256: String,
}

/// Everything git could run as a hook in one repository: every runnable file
/// in its hooks directory, and every `hook.*` setting. An operation that keeps
/// its hooks can reach any of them, so an approval names all of them, and
/// the operation runs only while they are exactly what was approved.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct HostHooks {
    pub files: Vec<HookFile>,
    pub configured: Vec<String>,
}

impl HostHooks {
    /// Whether git would run any of these for one of `events`.
    pub fn reaches(&self, events: &[&str]) -> bool {
        self.files.iter().any(|file| {
            file.path
                .file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| events.contains(&name))
        }) || self.configured.iter().any(|entry| {
            entry.split_once(' ').is_some_and(|(key, value)| {
                key.ends_with(".event") && events.contains(&value.trim())
            })
        })
    }

    /// One line per hook, for the approval prompt.
    pub fn describe(&self) -> Vec<String> {
        self.files
            .iter()
            .map(|file| format!("{} (sha256 {})", file.path.display(), &file.sha256[..12]))
            .chain(
                self.configured
                    .iter()
                    .map(|entry| format!("configured {entry}")),
            )
            .collect()
    }
}

/// Hooks for an operation. Off unless the user approved the exact set.
#[derive(Debug, Clone, Default)]
enum HookMode {
    #[default]
    Off,
    Approved(HostHooks),
}

/// The typed Git API for one repository root.
#[derive(Debug, Clone)]
pub struct GitApi {
    root: PathBuf,
    hooks: HookMode,
}

impl GitApi {
    /// The API for `root`, with every hook off.
    pub fn at(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            hooks: HookMode::Off,
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// This API with every hook turned off: hooks are looked for in an
    /// empty place, so one planted after [`Self::host_hooks`] found none
    /// cannot run. Hooks defined in configuration have no switch to turn
    /// them off; only the repository's and the user's own configuration
    /// define them, and [`check_repository_config`] refuses a repository
    /// configuration a sandboxed command could have written.
    pub fn with_hooks_disabled(&self) -> Self {
        Self {
            root: self.root.clone(),
            hooks: HookMode::Off,
        }
    }

    /// This API running the repository's hooks for an operation that can
    /// reach them, while they are exactly `approved`: each run reads them
    /// again first and refuses when any file, mode or setting differs.
    pub fn with_approved_hooks(&self, approved: HostHooks) -> Self {
        Self {
            root: self.root.clone(),
            hooks: HookMode::Approved(approved),
        }
    }

    /// Refuse a remote that is neither a URL [`checked_remote`] passed nor a
    /// remote this repository configures: git would read any other word as a
    /// path to a repository on this machine.
    async fn configured_remote(&self, remote: &str) -> Result<()> {
        if is_remote_url(remote) {
            return Ok(());
        }
        let mut command = agiworkforce_worktree::host_git_async();
        command.current_dir(&self.root).arg("remote");
        let output = crate::process_tree::output(command, None, Some(GIT_OPERATION_TIMEOUT))
            .await
            .context("invoke git remote")?;
        if !output.status.success() {
            bail!(
                "git remote failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            );
        }
        if String::from_utf8_lossy(&output.stdout)
            .lines()
            .any(|name| name.trim() == remote)
        {
            return Ok(());
        }
        bail!(
            "refusing git remote {remote:?}: it is not a remote this repository configures. \
             {LOCAL_REMOTE_UNSUPPORTED}"
        )
    }

    /// The `core.sshCommand` git would use in this repository, whose
    /// configuration [`check_repository_config`] has passed, with every file
    /// it includes, conditionally or not. `None` when nothing sets it.
    async fn configured_ssh_command(&self) -> Result<Option<String>> {
        let mut command = agiworkforce_worktree::host_git_async();
        command
            .current_dir(&self.root)
            .args(["config", "--get", "core.sshCommand"]);
        let output = crate::process_tree::output(command, None, Some(HOST_GIT_BLOCKING_TIMEOUT))
            .await
            .map_err(|error| anyhow::anyhow!(host_git_failure(&error)))
            .context("read core.sshCommand")?;
        if output.status.code() == Some(1) {
            return Ok(None);
        }
        if !output.status.success() {
            bail!(
                "git config --get core.sshCommand failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            );
        }
        let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok((!value.is_empty()).then_some(value))
    }

    async fn run(&self, operation: &GitOperation) -> Result<GitOutput> {
        let argv = operation.argv()?;
        check_repository_config(&self.root, operation.config_use()).await?;
        if let Some(remote) = operation.remote() {
            self.configured_remote(remote).await?;
        }
        if operation.reads_submodule_status() {
            let root = self.root.clone();
            tokio::task::spawn_blocking(move || {
                agiworkforce_worktree::config_guard::check_submodule_git_dirs_blocking(&root)
            })
            .await
            .context("check the repository's submodules")??;
        }
        let mut command = match &self.hooks {
            HookMode::Approved(approved) if !operation.host_hooks().is_empty() => {
                let found = self.host_hooks().await?;
                if found != *approved {
                    let now = found.describe();
                    bail!(
                        "the repository's hooks changed after they were approved, so git {} did \
                         not run. They are now: {}",
                        operation.label(),
                        if now.is_empty() {
                            "none".to_string()
                        } else {
                            now.join(", ")
                        }
                    );
                }
                agiworkforce_worktree::host_git_keeping_hooks_async()
            }
            _ => agiworkforce_worktree::host_git_async(),
        };
        command.current_dir(&self.root);
        command.args(operation.host_settings());
        command.args(&argv);
        if operation.reaches_network() {
            let configured = self.configured_ssh_command().await?;
            for (name, value) in non_interactive_network_env(|| configured) {
                command.env(name, value);
            }
        }
        let timeout = if operation.reaches_network() {
            GIT_NETWORK_TIMEOUT
        } else {
            GIT_OPERATION_TIMEOUT
        };
        let output = match crate::process_tree::output(command, None, Some(timeout)).await {
            Ok(output) => output,
            Err(error)
                if operation.reaches_network() && error.kind() == std::io::ErrorKind::TimedOut =>
            {
                bail!("git {}: {}", operation.label(), RemoteDidNotAnswer)
            }
            Err(error) => {
                return Err(anyhow::Error::new(error))
                    .with_context(|| format!("invoke git {}", operation.label()))
            }
        };
        if !output.status.success()
            && String::from_utf8_lossy(&output.stderr).contains("transport 'file' not allowed")
        {
            bail!(
                "git {} did not run: remote {:?} names a repository on this machine. {}",
                operation.label(),
                operation.remote().unwrap_or_default(),
                LOCAL_REMOTE_UNSUPPORTED
            );
        }
        let stderr = if operation.reaches_network() && !output.status.success() {
            with_batch_ssh_hint(&output.stderr)
        } else {
            String::from_utf8_lossy(&output.stderr).into_owned()
        };
        Ok(GitOutput {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr,
        })
    }

    async fn run_checked(&self, operation: GitOperation) -> Result<String> {
        let output = self.run(&operation).await?;
        if !output.success {
            bail!("git {} failed: {}", operation.label(), output.stderr.trim());
        }
        Ok(output.stdout)
    }

    pub async fn show(&self, rev: &str) -> Result<CommitDetail> {
        let stdout = self
            .run_checked(GitOperation::Show {
                rev: rev.to_string(),
            })
            .await?;
        parse_commit_detail(&stdout)
            .with_context(|| format!("read the commit git show returned for {rev}"))
    }

    /// The blob git holds for one side of an unmerged path. `None` when that
    /// side does not exist, which is what an add/add or delete/modify conflict
    /// looks like in the index.
    pub async fn show_stage(&self, path: &Path, stage: u8) -> Result<Option<String>> {
        let operation = GitOperation::ShowStage {
            path: path.to_path_buf(),
            stage,
        };
        let output = self.run(&operation).await?;
        Ok(output.success.then_some(output.stdout))
    }

    pub async fn branches(&self, include_remote: bool) -> Result<Vec<BranchRef>> {
        let stdout = self
            .run_checked(GitOperation::BranchList { include_remote })
            .await?;
        Ok(parse_branch_list(&stdout))
    }

    pub async fn worktrees(&self) -> Result<Vec<WorktreeEntry>> {
        list_worktree_entries(&self.root).await
    }

    pub async fn rev_parse(&self, spec: &str) -> Result<RevParsed> {
        let stdout = self
            .run_checked(GitOperation::RevParse {
                spec: spec.to_string(),
            })
            .await?;
        let commit = stdout.trim().to_string();
        if commit.is_empty() {
            bail!("git rev-parse resolved {spec} to nothing");
        }
        Ok(RevParsed {
            spec: spec.to_string(),
            commit,
        })
    }

    /// The working tree as a [`RepositorySnapshot`], the same record every
    /// other surface stores git state in.
    pub async fn status(&self, repository_id: RepositoryId) -> Result<RepositorySnapshot> {
        let stdout = self.run_checked(GitOperation::Status).await?;
        let mut snapshot = RepositorySnapshot::new(repository_id, Utc::now());
        let mut body = String::new();
        for line in stdout.lines() {
            if let Some(header) = line.strip_prefix("## ") {
                let branch = header
                    .split("...")
                    .next()
                    .unwrap_or_default()
                    .split(' ')
                    .next()
                    .unwrap_or_default()
                    .trim();
                if branch == "HEAD" || branch.is_empty() {
                    snapshot.detached_head = branch == "HEAD";
                } else {
                    snapshot.branch = Some(branch.to_string());
                }
                continue;
            }
            body.push_str(line);
            body.push('\n');
        }
        snapshot.changes = crate::context::parse_porcelain_status(&body);
        snapshot.head_commit = self.rev_parse("HEAD").await.ok().map(|head| head.commit);
        Ok(snapshot)
    }

    pub async fn diff(&self, baseline: DiffBaseline, paths: &[PathBuf]) -> Result<BaselineDiff> {
        let stdout = self
            .run_checked(GitOperation::Diff {
                baseline: baseline.clone(),
                paths: paths.to_vec(),
            })
            .await?;
        Ok(BaselineDiff::from_patch(baseline, stdout))
    }

    /// The paths in `touched` that the user, rather than the agent, wrote and
    /// that an operation about to run would overwrite. `baseline` is the
    /// snapshot taken when the session opened: anything already dirty then is
    /// the user's. A caller that finds any must name them instead of
    /// discarding them.
    pub async fn user_changes_at_risk(
        &self,
        baseline: &RepositorySnapshot,
        touched: &[PathBuf],
    ) -> Result<Vec<PathBuf>> {
        let mut current = self.status(baseline.repository_id.clone()).await?;
        current.attribute_against(baseline);
        Ok(current
            .user_changes_at_risk(touched)
            .into_iter()
            .map(Path::to_path_buf)
            .collect())
    }

    pub async fn conflicts(&self) -> Result<Vec<ConflictedPath>> {
        let stdout = self.run_checked(GitOperation::Status).await?;
        Ok(parse_conflicts(&stdout))
    }

    fn submodule_paths(&self) -> BTreeSet<PathBuf> {
        std::fs::read_to_string(self.root.join(".gitmodules"))
            .map(|text| parse_submodule_paths(&text))
            .unwrap_or_default()
    }

    /// Stage paths. A submodule's gitlink is refused here: staging it records a
    /// new submodule pointer, which is a change to another repository's
    /// checkout that nobody asked for.
    pub async fn stage(&self, paths: &[PathBuf]) -> Result<StagedOutcome> {
        let submodules = self.submodule_paths();
        for path in paths {
            let relative = path.strip_prefix(&self.root).unwrap_or(path);
            if submodules.contains(relative) {
                bail!(
                    "{} is a submodule pointer; staging it would move the submodule for everyone. \
                     Commit inside the submodule first, then stage the pointer deliberately.",
                    relative.display()
                );
            }
        }
        self.run_checked(GitOperation::Stage {
            paths: paths.to_vec(),
        })
        .await?;
        Ok(StagedOutcome {
            paths: paths.to_vec(),
        })
    }

    pub async fn unstage(&self, paths: &[PathBuf]) -> Result<StagedOutcome> {
        self.run_checked(GitOperation::Unstage {
            paths: paths.to_vec(),
        })
        .await?;
        Ok(StagedOutcome {
            paths: paths.to_vec(),
        })
    }

    /// Every hook git could run here, as git resolves them: runnable files in
    /// the hooks directory, which `core.hooksPath` may put inside the working
    /// tree where a sandboxed command can write, each with its mode and a
    /// hash of its content, and every `hook.*` setting. Git never runs a
    /// `.sample` file, so those are left out.
    pub async fn host_hooks(&self) -> Result<HostHooks> {
        let mut command = agiworkforce_worktree::host_git_keeping_hooks_async();
        command
            .current_dir(&self.root)
            .args(["rev-parse", "--git-path", "hooks"]);
        let output = crate::process_tree::output(command, None, Some(GIT_OPERATION_TIMEOUT))
            .await
            .context("invoke git rev-parse --git-path hooks")?;
        if !output.status.success() {
            bail!(
                "git rev-parse --git-path hooks failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            );
        }
        let dir = PathBuf::from(String::from_utf8_lossy(&output.stdout).trim());
        let dir = if dir.is_absolute() {
            dir
        } else {
            self.root.join(dir)
        };
        let work_tree = self.root.clone();
        let files = tokio::task::spawn_blocking(move || hook_files(&dir, &work_tree))
            .await
            .context("read the hooks directory")??;

        let mut command = agiworkforce_worktree::host_git_async();
        command
            .current_dir(&self.root)
            .args(["config", "--get-regexp", r"^hook\."]);
        let configured = crate::process_tree::output(command, None, Some(GIT_OPERATION_TIMEOUT))
            .await
            .context("invoke git config --get-regexp hook")?;
        if !matches!(configured.status.code(), Some(0) | Some(1)) {
            bail!(
                "git config --get-regexp hook failed: {}",
                String::from_utf8_lossy(&configured.stderr).trim()
            );
        }
        let mut configured: Vec<String> = String::from_utf8_lossy(&configured.stdout)
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(str::to_string)
            .collect();
        configured.sort();
        Ok(HostHooks { files, configured })
    }

    /// Commit what is staged, and only that. A hook that refuses stops the
    /// commit exactly as it stops the user's own `git commit`.
    pub async fn commit(&self, message: &str) -> Result<CommitDetail> {
        if self.diff(DiffBaseline::Staged, &[]).await?.diff.is_empty() {
            bail!("nothing is staged to commit; stage the paths with git_stage first");
        }
        self.run_checked(GitOperation::Commit {
            message: message.to_string(),
        })
        .await?;
        self.show("HEAD").await
    }

    pub async fn branch_create(&self, name: &str, base: Option<&str>) -> Result<BranchRef> {
        self.run_checked(GitOperation::BranchCreate {
            name: name.to_string(),
            base: base.map(str::to_string),
        })
        .await?;
        let commit = self.rev_parse(name).await?.commit;
        Ok(BranchRef {
            name: name.to_string(),
            is_current: false,
            is_remote: false,
            commit,
            upstream: None,
        })
    }

    async fn integrating(&self, operation: GitOperation) -> Result<MergeOutcome> {
        let output = self.run(&operation).await?;
        if output.success {
            if output.stdout.contains("Already up to date") {
                return Ok(MergeOutcome::AlreadyUpToDate);
            }
            let head = self.rev_parse("HEAD").await.ok().map(|head| head.commit);
            return Ok(MergeOutcome::Merged { head });
        }
        let conflicts = self.conflicts().await.unwrap_or_default();
        if conflicts.is_empty() {
            bail!("git {} failed: {}", operation.label(), output.stderr.trim());
        }
        Ok(MergeOutcome::Conflicted { paths: conflicts })
    }

    pub async fn merge(&self, rev: &str, hooks: HookPolicy) -> Result<MergeOutcome> {
        self.integrating(GitOperation::Merge {
            rev: rev.to_string(),
            hooks,
        })
        .await
    }

    pub async fn rebase(&self, onto: &str, hooks: HookPolicy) -> Result<MergeOutcome> {
        self.integrating(GitOperation::Rebase {
            onto: onto.to_string(),
            hooks,
        })
        .await
    }

    pub async fn cherry_pick(&self, rev: &str) -> Result<MergeOutcome> {
        self.integrating(GitOperation::CherryPick {
            rev: rev.to_string(),
        })
        .await
    }

    pub async fn revert(&self, rev: &str) -> Result<MergeOutcome> {
        self.integrating(GitOperation::Revert {
            rev: rev.to_string(),
        })
        .await
    }

    pub async fn pull(&self, remote: &str, branch: Option<&str>) -> Result<MergeOutcome> {
        self.integrating(GitOperation::Pull {
            remote: remote.to_string(),
            branch: branch.map(str::to_string),
        })
        .await
    }

    /// The branch HEAD is on, or `None` when HEAD is detached.
    pub async fn current_branch(&self) -> Result<Option<String>> {
        let output = self.run(&GitOperation::HeadBranch).await?;
        if !output.success {
            return Ok(None);
        }
        let branch = output.stdout.trim().to_string();
        Ok((!branch.is_empty()).then_some(branch))
    }

    /// The commits on `branch` that none of `exclude` already holds.
    pub async fn commits_not_in(
        &self,
        branch: &str,
        exclude: &[String],
    ) -> Result<Vec<CommitSummary>> {
        let stdout = self
            .run_checked(GitOperation::RevList {
                branch: branch.to_string(),
                exclude: exclude.to_vec(),
            })
            .await?;
        Ok(parse_commit_summaries(&stdout))
    }

    /// Decide a push without running one: which branch, which remote, which
    /// commits go with it, and what the repository's policy says about it.
    pub async fn push_plan(
        &self,
        remote: &str,
        force: PushForce,
        policy: &RepositoryPolicy,
    ) -> Result<PushPlan> {
        let Some(branch) = self.current_branch().await? else {
            return Ok(PushPlan {
                remote: remote.to_string(),
                branch: String::new(),
                head: String::new(),
                upstream: None,
                force,
                commits: Vec::new(),
                reasons: vec![PushReason::DetachedHead],
                consent: None,
            });
        };
        let head = self.rev_parse(&branch).await?.commit;
        let upstream = self
            .branches(false)
            .await?
            .into_iter()
            .find(|entry| entry.name == branch)
            .and_then(|entry| entry.upstream);
        let exclude = match &upstream {
            Some(upstream) => vec![upstream.clone()],
            None => self
                .branches(true)
                .await?
                .into_iter()
                .filter(|entry| entry.is_remote && entry.name.starts_with(&format!("{remote}/")))
                .map(|entry| entry.name)
                .collect(),
        };
        let commits = self.commits_not_in(&branch, &exclude).await?;

        let mut reasons = Vec::new();
        if upstream.is_none() {
            reasons.push(PushReason::NoUpstream);
        }
        if policy.is_protected(&branch) {
            reasons.push(PushReason::ProtectedBranch);
        }
        if !policy.allow_direct_push_to_default
            && policy.default_branch.as_deref() == Some(branch.as_str())
        {
            reasons.push(PushReason::DefaultBranch);
        }
        if force == PushForce::WithLease {
            reasons.push(PushReason::ForcePush);
        }
        if commits.is_empty() {
            reasons.push(PushReason::NothingToPush);
        }
        Ok(PushPlan {
            remote: remote.to_string(),
            branch,
            head,
            upstream,
            force,
            commits,
            reasons,
            consent: None,
        })
    }

    /// Run a plan. The checkout is re-read first: a plan is consent for the
    /// commits it enumerated, so a branch that moved or a checkout that
    /// switched branches invalidates it rather than pushing something else.
    pub async fn push(
        &self,
        plan: &PushPlan,
        profile: &CodePermissionProfile,
    ) -> Result<PushOutcome> {
        if let Some(reason) = plan.blocked_by() {
            bail!("refusing to push: {}", reason.label());
        }
        let mut denied = Vec::new();
        let mut ungranted = Vec::new();
        for capability in plan.capabilities() {
            match profile.decision(capability) {
                PermissionDecision::Deny => denied.push(capability.label()),
                PermissionDecision::Ask => ungranted.push(capability.label()),
                PermissionDecision::Allow => {}
            }
        }
        if !denied.is_empty() {
            bail!(
                "refusing to push: this session may not {}",
                denied.join(", ")
            );
        }
        // Consent is not optional. A plan nobody had to approve is still a plan
        // nobody did approve, so the absence of a reason to ask is not a reason
        // to go ahead.
        match plan.consent() {
            Some(consent) if !consent.covers(plan) => bail!(
                "refusing to push: {}",
                PushReason::ConsentNotForThisPush.label()
            ),
            Some(_) => {}
            None => {
                let mut pending: Vec<String> = plan
                    .approvals()
                    .iter()
                    .map(|reason| reason.label())
                    .collect();
                pending.extend(
                    ungranted
                        .iter()
                        .map(|label| format!("permission to {label} has not been granted")),
                );
                if pending.is_empty() {
                    pending.push(PushReason::NotApproved.label());
                }
                bail!("refusing to push: {}", pending.join("; "));
            }
        }

        match self.current_branch().await? {
            None => bail!("refusing to push: {}", PushReason::DetachedHead.label()),
            Some(branch) if branch != plan.branch => {
                bail!(
                    "refusing to push: {}",
                    PushReason::NotOnPlannedBranch { head: branch }.label()
                );
            }
            Some(_) => {}
        }
        let head = self.rev_parse(&plan.branch).await?.commit;
        if head != plan.head {
            bail!(
                "refusing to push: {}",
                PushReason::BranchMoved {
                    planned: plan.head.clone(),
                    head,
                }
                .label()
            );
        }

        self.run_checked(plan.operation()).await?;
        Ok(PushOutcome {
            remote: plan.remote.clone(),
            branch: plan.branch.clone(),
            head: plan.head.clone(),
            commits: plan.commits.clone(),
        })
    }

    /// Move the current branch to `rev`. A hard reset overwrites the working
    /// tree, so the caller names what goes with it first: [`Self::discarded_by`]
    /// is the same read the approval prompt is built from.
    pub async fn reset(&self, mode: ResetMode, rev: &str) -> Result<String> {
        self.run_checked(GitOperation::Reset {
            mode,
            rev: rev.to_string(),
        })
        .await?;
        Ok(self.rev_parse("HEAD").await?.commit)
    }

    pub async fn clean(&self, directories: bool, ignored: bool) -> Result<Vec<PathBuf>> {
        let removing = self
            .discarded_by(&GitOperation::Clean {
                directories,
                ignored,
            })
            .await
            .unwrap_or_default();
        self.run_checked(GitOperation::Clean {
            directories,
            ignored,
        })
        .await?;
        Ok(removing)
    }

    /// Delete a branch. The repository's own policy decides first: a protected
    /// or default branch is refused here rather than offered for approval.
    pub async fn branch_delete(
        &self,
        name: &str,
        force: bool,
        policy: &RepositoryPolicy,
    ) -> Result<BranchRef> {
        if policy.is_protected(name) {
            bail!(
                "refusing to delete {name}: {}",
                PushReason::ProtectedBranch.label()
            );
        }
        if self.current_branch().await?.as_deref() == Some(name) {
            bail!("refusing to delete {name}: it is the branch this checkout is on");
        }
        let commit = self.rev_parse(name).await?.commit;
        self.run_checked(GitOperation::BranchDelete {
            name: name.to_string(),
            force,
        })
        .await?;
        Ok(BranchRef {
            name: name.to_string(),
            is_current: false,
            is_remote: false,
            commit,
            upstream: None,
        })
    }

    /// The paths `operation` would throw away, so a prompt can name them
    /// instead of asking the user to imagine them. An operation that discards
    /// nothing returns an empty list.
    pub async fn discarded_by(&self, operation: &GitOperation) -> Result<Vec<PathBuf>> {
        let snapshot = self.status(RepositoryId::new("workspace")).await?;
        let paths = |tracked: bool| {
            snapshot
                .changes
                .iter()
                .filter(move |change| (change.kind == ChangeKind::Untracked) != tracked)
                .map(|change| change.path.clone())
                .collect::<Vec<_>>()
        };
        Ok(match operation {
            GitOperation::Reset { mode, .. } if mode.discards_working_tree() => paths(true),
            GitOperation::Clean { .. } => paths(false),
            _ => Vec::new(),
        })
    }

    pub async fn fetch(&self, remote: &str, prune: bool) -> Result<()> {
        self.run_checked(GitOperation::Fetch {
            remote: remote.to_string(),
            prune,
        })
        .await?;
        Ok(())
    }

    pub async fn stash(&self, operation: StashOperation) -> Result<StashOutcome> {
        let listing = operation == StashOperation::List;
        let restoring = operation == StashOperation::Pop;
        let dropping = matches!(operation, StashOperation::Drop { .. });
        let stdout = self.run_checked(GitOperation::Stash(operation)).await?;
        if listing {
            return Ok(StashOutcome::Listed {
                entries: stdout.lines().map(str::to_string).collect(),
            });
        }
        if restoring {
            return Ok(StashOutcome::Restored);
        }
        if dropping {
            return Ok(StashOutcome::Dropped);
        }
        if stdout.contains("No local changes to save") {
            return Ok(StashOutcome::NothingToStash);
        }
        Ok(StashOutcome::Saved {
            message: stdout.trim().to_string(),
        })
    }
}

/// Plan values for tests that exercise the approval path without a checkout.
#[cfg(test)]
pub(crate) mod test_support {
    use super::{CommitSummary, PushForce, PushPlan, PushReason};

    pub(crate) fn push_plan_fixture(
        remote: &str,
        branch: &str,
        head: &str,
        commits: usize,
    ) -> PushPlan {
        let commits: Vec<CommitSummary> = (0..commits)
            .map(|index| CommitSummary {
                commit: format!("{head}{index}"),
                subject: format!("commit {index}"),
            })
            .collect();
        let mut reasons = vec![PushReason::NoUpstream];
        if commits.is_empty() {
            reasons.push(PushReason::NothingToPush);
        }
        PushPlan {
            remote: remote.to_string(),
            branch: branch.to_string(),
            head: head.to_string(),
            upstream: None,
            force: PushForce::Never,
            commits,
            reasons,
            consent: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::safety::push_consent::{request_push_consent, PushApprovalPrompt, PushApprover};
    use crate::tui::approval_broker::ApprovalDecision;
    use std::process::Command as SyncCommand;

    struct UserAllows;

    #[async_trait::async_trait]
    impl PushApprover for UserAllows {
        async fn ask(&self, _prompt: &PushApprovalPrompt) -> ApprovalDecision {
            ApprovalDecision::AllowOnce
        }
    }

    async fn consent_for(plan: &PushPlan) -> crate::safety::push_consent::PushConsent {
        request_push_consent(&UserAllows, plan)
            .await
            .expect("the user allowed the push")
    }

    fn init_repo(dir: &Path) {
        let run = |args: &[&str]| {
            SyncCommand::new("git")
                .current_dir(dir)
                .args(args)
                .output()
                .expect("git available");
        };
        run(&["init", "-q", "-b", "main"]);
        run(&["config", "user.email", "test@example.invalid"]);
        run(&["config", "user.name", "Test"]);
        run(&["config", "core.autocrlf", "false"]);
        std::fs::write(dir.join("README.md"), "hello\n").unwrap();
        run(&["add", "README.md"]);
        run(&["commit", "-q", "-m", "init"]);
    }

    #[test]
    fn every_operation_builds_an_argv_not_a_shell_string() {
        assert_eq!(
            GitOperation::Stage {
                paths: vec![PathBuf::from("a b.rs")],
            }
            .argv()
            .unwrap(),
            vec!["add", "--", "a b.rs"]
        );
        assert_eq!(
            GitOperation::Unstage {
                paths: vec![PathBuf::from("a.rs")],
            }
            .argv()
            .unwrap(),
            vec!["restore", "--staged", "--", "a.rs"]
        );
        assert_eq!(
            GitOperation::BranchCreate {
                name: "feature".into(),
                base: Some("main".into()),
            }
            .argv()
            .unwrap(),
            vec!["branch", "feature", "main"]
        );
        assert_eq!(
            GitOperation::Stash(StashOperation::Drop { index: 2 })
                .argv()
                .unwrap(),
            vec!["stash", "drop", "stash@{2}"]
        );
        assert!(GitOperation::Fetch {
            remote: "origin".into(),
            prune: true,
        }
        .argv()
        .unwrap()
        .contains(&"--prune".to_string()));
    }

    #[test]
    fn an_option_shaped_ref_is_refused_rather_than_escaped() {
        assert!(GitOperation::Merge {
            rev: "--upload-pack=touch /tmp/pwn".into(),
            hooks: HookPolicy::Respect,
        }
        .argv()
        .is_err());
        assert!(GitOperation::BranchCreate {
            name: "-D".into(),
            base: None,
        }
        .argv()
        .is_err());
        assert!(GitOperation::Show {
            rev: "HEAD\nrm -rf /".into(),
        }
        .argv()
        .is_err());
    }

    #[test]
    fn a_remote_carrying_a_credential_is_refused() {
        let error = GitOperation::Fetch {
            remote: "https://user:ghp_secret@github.com/acme/widgets.git".into(),
            prune: false,
        }
        .argv()
        .expect_err("a credential in a remote must be refused");

        assert!(error.to_string().contains("credential helper"));
        assert!(!error.to_string().contains("ghp_secret"));
        assert!(GitOperation::Fetch {
            remote: "origin".into(),
            prune: false,
        }
        .argv()
        .is_ok());
    }

    #[test]
    fn hook_bypass_is_its_own_flag_and_its_own_capability() {
        let respecting = GitOperation::Merge {
            rev: "feature".into(),
            hooks: HookPolicy::Respect,
        };
        let bypassing = GitOperation::Merge {
            rev: "feature".into(),
            hooks: HookPolicy::Bypass,
        };

        assert!(!respecting
            .argv()
            .unwrap()
            .contains(&"--no-verify".to_string()));
        assert!(bypassing
            .argv()
            .unwrap()
            .contains(&"--no-verify".to_string()));
        assert!(!respecting.bypasses_hooks());
        assert!(bypassing.bypasses_hooks());
        assert!(bypassing
            .capabilities()
            .contains(&CodeCapability::GitHookBypass));
        assert!(!respecting
            .capabilities()
            .contains(&CodeCapability::GitHookBypass));

        let bypassing_rebase = GitOperation::Rebase {
            onto: "main".into(),
            hooks: HookPolicy::Bypass,
        };
        assert!(bypassing_rebase
            .argv()
            .unwrap()
            .contains(&"--no-verify".to_string()));
        assert!(bypassing_rebase
            .capabilities()
            .contains(&CodeCapability::GitHookBypass));
    }

    #[test]
    fn a_commit_records_the_message_whole_and_never_skips_hooks() {
        let commit = GitOperation::Commit {
            message: "Fix the parser\n\nThe tokenizer dropped -x flags.".into(),
        };
        assert_eq!(
            commit.argv().unwrap(),
            vec![
                "commit",
                "--message=Fix the parser\n\nThe tokenizer dropped -x flags."
            ]
        );
        assert!(!commit.argv().unwrap().contains(&"--no-verify".to_string()));
        assert!(!commit.argv().unwrap().contains(&"--all".to_string()));
        assert!(!commit.bypasses_hooks());
        assert!(commit.is_write());
        assert!(!commit.is_destructive());
        assert_eq!(commit.capabilities(), vec![CodeCapability::FileWrite]);
        assert!(GitOperation::Commit {
            message: "  ".into()
        }
        .argv()
        .is_err());
        assert!(GitOperation::Commit {
            message: "subject\u{1b}[2J".into()
        }
        .argv()
        .is_err());
    }

    #[tokio::test]
    async fn a_commit_takes_only_what_is_staged_and_runs_the_hooks() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let git = GitApi::at(dir.path());
        assert!(git
            .commit("nothing yet")
            .await
            .expect_err("an empty index is refused")
            .to_string()
            .contains("nothing is staged"));

        git_run(dir.path(), &["config", "core.hooksPath", ".git/hooks"]);
        let marker = dir.path().join("pre-commit-ran");
        let hook = dir.path().join(".git/hooks/pre-commit");
        std::fs::create_dir_all(hook.parent().unwrap()).unwrap();
        std::fs::write(&hook, format!("#!/bin/sh\ntouch '{}'\n", marker.display())).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        std::fs::write(dir.path().join("staged.txt"), "staged\n").unwrap();
        std::fs::write(dir.path().join("README.md"), "edited, not staged\n").unwrap();
        git.stage(&[PathBuf::from("staged.txt")])
            .await
            .expect("stage");

        let approved = git.with_approved_hooks(git.host_hooks().await.expect("hooks"));
        let detail = approved.commit("Add staged.txt").await.expect("commit");

        assert_eq!(detail.subject, "Add staged.txt");
        assert_eq!(detail.files, vec![PathBuf::from("staged.txt")]);
        #[cfg(unix)]
        assert!(marker.exists(), "the pre-commit hook did not run");
        let snapshot = git.status(RepositoryId::new("test")).await.expect("status");
        assert_eq!(snapshot.staged().count(), 0);
        assert_eq!(
            std::fs::read_to_string(dir.path().join("README.md")).unwrap(),
            "edited, not staged\n"
        );
    }

    #[test]
    fn every_operation_that_can_run_a_hook_names_the_hooks_it_reaches() {
        assert!(GitOperation::Commit {
            message: "m".into()
        }
        .host_hooks()
        .contains(&"pre-commit"));
        assert!(GitOperation::Merge {
            rev: "feature".into(),
            hooks: HookPolicy::Respect,
        }
        .host_hooks()
        .contains(&"post-merge"));
        assert!(GitOperation::Rebase {
            onto: "main".into(),
            hooks: HookPolicy::Respect,
        }
        .host_hooks()
        .contains(&"post-checkout"));
        assert!(GitOperation::Pull {
            remote: "origin".into(),
            branch: None,
        }
        .host_hooks()
        .contains(&"post-merge"));
        assert!(GitOperation::CherryPick { rev: "x".into() }
            .host_hooks()
            .contains(&"post-rewrite"));
        assert!(GitOperation::Revert { rev: "x".into() }
            .host_hooks()
            .contains(&"commit-msg"));
        assert_eq!(PUSH_HOOKS, &["pre-push", "reference-transaction"]);
        assert_eq!(
            GitOperation::Fetch {
                remote: "origin".into(),
                prune: false,
            }
            .host_hooks(),
            FETCH_HOOKS,
            "a fetch runs with automatic maintenance off, so it never reaches pre-auto-gc"
        );
        assert!(GitOperation::Show { rev: "HEAD".into() }
            .host_hooks()
            .is_empty());
    }

    #[tokio::test]
    async fn hooks_off_means_a_hook_planted_after_the_check_does_not_run() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        git_run(dir.path(), &["config", "core.hooksPath", ".hooks"]);
        let git = GitApi::at(dir.path());
        assert!(!git.host_hooks().await.expect("hooks").reaches(COMMIT_HOOKS));

        let marker = dir.path().join("planted-ran");
        let hook = dir.path().join(".hooks/pre-commit");
        std::fs::create_dir_all(hook.parent().unwrap()).unwrap();
        std::fs::write(&hook, format!("#!/bin/sh\ntouch '{}'\n", marker.display())).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        std::fs::write(dir.path().join("new.txt"), "new\n").unwrap();
        let quiet = git.with_hooks_disabled();
        quiet
            .stage(&[PathBuf::from("new.txt")])
            .await
            .expect("stage");
        quiet.commit("Add new.txt").await.expect("commit");

        assert!(!marker.exists(), "a hook planted after the check ran");
        #[cfg(unix)]
        {
            let found = git.host_hooks().await.expect("hooks");
            assert!(found.reaches(COMMIT_HOOKS));
            assert_eq!(found.files.len(), 1);
            assert!(found.files[0].path.ends_with(".hooks/pre-commit"));
        }
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn an_approval_names_every_hook_and_a_hook_changed_after_it_refuses_the_run() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        git_run(dir.path(), &["config", "core.hooksPath", ".husky/_"]);
        git_run(dir.path(), &["config", "hook.lint.command", "true"]);
        git_run(dir.path(), &["config", "hook.lint.event", "post-commit"]);
        let hooks = dir.path().join(".husky/_");
        std::fs::create_dir_all(&hooks).unwrap();
        let marker = dir.path().join("post-index-change-ran");
        for (name, body) in [
            ("pre-commit", "#!/bin/sh\nexit 0\n".to_string()),
            (
                "post-index-change",
                format!("#!/bin/sh\ntouch '{}'\n", marker.display()),
            ),
            ("pre-push.sample", "#!/bin/sh\nexit 0\n".to_string()),
        ] {
            let path = hooks.join(name);
            std::fs::write(&path, body).unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let git = GitApi::at(dir.path());

        let found = git.host_hooks().await.expect("hooks");
        let named = found.describe().join("\n");
        assert!(named.contains("post-index-change"), "{named}");
        assert!(named.contains("pre-commit"), "{named}");
        assert!(
            named.contains("configured hook.lint.event post-commit"),
            "{named}"
        );
        assert!(
            named.contains("pre-push.sample"),
            "a hooks folder in the work tree is pinned whole: {named}"
        );

        std::fs::write(dir.path().join("new.txt"), "new\n").unwrap();
        let configured = git
            .with_approved_hooks(found)
            .stage(&[PathBuf::from("new.txt")])
            .await
            .expect_err("a hook set in an untrusted folder's configuration is refused");
        assert!(configured.to_string().contains("hook.lint"), "{configured}");
        git_run(dir.path(), &["config", "--remove-section", "hook.lint"]);

        let approved = git.with_approved_hooks(git.host_hooks().await.expect("hooks"));
        std::fs::write(
            hooks.join("post-index-change"),
            format!("#!/bin/sh\ntouch '{}'; echo changed\n", marker.display()),
        )
        .unwrap();
        let refused = approved
            .stage(&[PathBuf::from("new.txt")])
            .await
            .expect_err("a hook changed since the approval");
        assert!(refused
            .to_string()
            .contains("changed after they were approved"));
        assert!(!marker.exists(), "a changed hook ran");

        std::fs::set_permissions(
            hooks.join("pre-commit"),
            std::fs::Permissions::from_mode(0o700),
        )
        .unwrap();
        let rehashed = git.host_hooks().await.expect("hooks");
        let mode_changed = git.with_approved_hooks(rehashed.clone());
        std::fs::set_permissions(
            hooks.join("pre-commit"),
            std::fs::Permissions::from_mode(0o755),
        )
        .unwrap();
        assert!(mode_changed
            .stage(&[PathBuf::from("new.txt")])
            .await
            .is_err());

        let current = git.with_approved_hooks(git.host_hooks().await.expect("hooks"));
        current
            .stage(&[PathBuf::from("new.txt")])
            .await
            .expect("hooks exactly as approved run");
        assert!(marker.exists(), "the approved index hook did not run");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_husky_script_changed_after_the_approval_refuses_the_run() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        git_run(dir.path(), &["config", "core.hooksPath", ".husky/_"]);
        let husky = dir.path().join(".husky");
        std::fs::create_dir_all(husky.join("_")).unwrap();
        let marker = dir.path().join("husky-script-ran");
        let stub = husky.join("_/pre-commit");
        std::fs::write(
            &stub,
            "#!/bin/sh\nexec \"$(dirname \"$0\")/../pre-commit\"\n",
        )
        .unwrap();
        let script = husky.join("pre-commit");
        std::fs::write(&script, "#!/bin/sh\nexit 0\n").unwrap();
        for path in [&stub, &script] {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        std::fs::write(dir.path().join("new.txt"), "new\n").unwrap();
        let git = GitApi::at(dir.path());
        git.stage(&[PathBuf::from("new.txt")]).await.expect("stage");

        let found = git.host_hooks().await.expect("hooks");
        assert!(
            found
                .files
                .iter()
                .any(|file| file.path.ends_with(".husky/pre-commit")),
            "the script the stub runs is pinned: {:?}",
            found.files
        );
        let approved = git.with_approved_hooks(found);
        std::fs::write(
            &script,
            format!("#!/bin/sh\ntouch '{}'\n", marker.display()),
        )
        .unwrap();

        let refused = approved
            .commit("Add new.txt")
            .await
            .expect_err("the husky script changed since the approval");
        assert!(refused
            .to_string()
            .contains("changed after they were approved"));
        assert!(!marker.exists(), "a changed husky script ran");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn an_operation_without_hooks_never_runs_one_even_from_a_writable_hooks_path() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        git_run(dir.path(), &["config", "core.hooksPath", ".husky/_"]);
        let hook = dir.path().join(".husky/_/post-index-change");
        std::fs::create_dir_all(hook.parent().unwrap()).unwrap();
        let marker = dir.path().join("planted-ran");
        std::fs::write(&hook, format!("#!/bin/sh\ntouch '{}'\n", marker.display())).unwrap();
        std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::write(dir.path().join("README.md"), "touched\n").unwrap();

        let git = GitApi::at(dir.path());
        git.diff(DiffBaseline::Unstaged, &[]).await.expect("diff");
        git.status(RepositoryId::new("test")).await.expect("status");
        git.stage(&[PathBuf::from("README.md")])
            .await
            .expect("stage");

        assert!(!marker.exists(), "a hook ran without an approval");
    }

    #[tokio::test]
    async fn a_local_credential_helper_is_refused_only_where_git_would_run_it() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        git_run(
            dir.path(),
            &["config", "credential.helper", "!./planted.sh"],
        );
        git_run(
            dir.path(),
            &[
                "remote",
                "add",
                "origin",
                "https://example.invalid/repo.git",
            ],
        );
        let git = GitApi::at(dir.path());

        git.status(RepositoryId::new("test"))
            .await
            .expect("status never runs a credential helper");
        let refused = git
            .fetch("origin", false)
            .await
            .expect_err("a fetch would run the repository's credential helper");
        assert!(
            refused.to_string().contains("credential.helper"),
            "{refused}"
        );
        assert_eq!(
            GitOperation::Status.config_use(),
            agiworkforce_worktree::config_guard::ConfigUse::CONTENT
        );
    }

    #[tokio::test]
    async fn a_filter_planted_in_the_repository_configuration_refuses_the_typed_api() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let marker = dir.path().join("filter-ran");
        git_run(
            dir.path(),
            &[
                "config",
                "filter.planted.clean",
                &format!("touch '{}'; cat", marker.display()),
            ],
        );
        std::fs::write(dir.path().join(".gitattributes"), "* filter=planted\n").unwrap();
        std::fs::write(dir.path().join("README.md"), "touched\n").unwrap();

        let refused = GitApi::at(dir.path())
            .stage(&[PathBuf::from("README.md")])
            .await
            .expect_err("an untrusted folder's filter is refused");

        assert!(
            refused.to_string().contains("filter.planted.clean"),
            "{refused}"
        );
        assert!(!marker.exists(), "a planted filter ran under host git");
    }

    #[test]
    fn ref_writes_signatures_and_stash_restores_are_checked_for_what_they_obey() {
        let branch = GitOperation::BranchCreate {
            name: "topic".into(),
            base: None,
        };
        assert_eq!(branch.config_use(), ConfigUse::REFS);
        assert!(branch.config_use().obeys("hook.planted.command"));
        assert_eq!(
            GitOperation::BranchDelete {
                name: "topic".into(),
                force: false,
            }
            .config_use(),
            ConfigUse::REFS
        );
        assert_eq!(
            GitOperation::Stash(StashOperation::Pop).config_use(),
            ConfigUse::MERGE
        );
        assert!(GitOperation::Commit {
            message: "x".into()
        }
        .config_use()
        .obeys("gpg.program"));
        assert!(GitOperation::RevList {
            branch: "main".into(),
            exclude: Vec::new(),
        }
        .config_use()
        .obeys("log.showsignature"));
    }

    #[test]
    fn a_fetch_or_pull_runs_without_automatic_maintenance_or_its_hook() {
        let fetch = GitOperation::Fetch {
            remote: "origin".into(),
            prune: false,
        };
        let pull = GitOperation::Pull {
            remote: "origin".into(),
            branch: None,
        };
        for operation in [&fetch, &pull] {
            assert_eq!(
                operation.host_settings(),
                [
                    "-c",
                    "gc.auto=0",
                    "-c",
                    "maintenance.auto=false",
                    "-c",
                    "protocol.file.allow=never"
                ]
            );
            assert!(!operation.host_hooks().contains(&"pre-auto-gc"));
        }
        assert!(!HostHooks {
            files: Vec::new(),
            configured: vec!["hook.husky.event pre-auto-gc".into()],
        }
        .reaches(fetch.host_hooks()));
        assert!(GitOperation::Status.host_settings().is_empty());
    }

    #[test]
    fn nothing_that_talks_to_a_remote_recurses_into_submodules_or_reaches_a_local_path() {
        let push = GitOperation::Push {
            remote: "origin".into(),
            branch: "main".into(),
            set_upstream: false,
            force: PushForce::Never,
        };
        let fetch = GitOperation::Fetch {
            remote: "origin".into(),
            prune: true,
        };
        let pull = GitOperation::Pull {
            remote: "origin".into(),
            branch: None,
        };
        let reset = GitOperation::Reset {
            mode: ResetMode::Hard,
            rev: "HEAD".into(),
        };
        for operation in [&push, &fetch, &pull, &reset] {
            assert!(
                operation
                    .argv()
                    .unwrap()
                    .contains(&"--no-recurse-submodules".to_string()),
                "{operation:?}"
            );
        }
        for operation in [&push, &fetch, &pull] {
            assert!(operation
                .host_settings()
                .windows(2)
                .any(|pair| pair == ["-c", "protocol.file.allow=never"]));
            assert_eq!(operation.remote(), Some("origin"));
        }
        for reads in [
            GitOperation::Status,
            GitOperation::Show { rev: "HEAD".into() },
            GitOperation::Diff {
                baseline: DiffBaseline::Head,
                paths: Vec::new(),
            },
        ] {
            assert!(
                reads
                    .argv()
                    .unwrap()
                    .contains(&"--ignore-submodules=dirty".to_string()),
                "{reads:?}"
            );
        }
        assert!(agiworkforce_worktree::HOST_GIT_HARDENING_KEEPING_HOOKS
            .contains(&"submodule.recurse=false"));
    }

    #[test]
    fn a_remote_spelled_as_a_path_on_this_machine_is_refused() {
        for remote in [
            "./evil.git",
            "../evil.git",
            "/tmp/evil.git",
            "~/evil.git",
            "C:\\evil.git",
            "host:evil.git",
            "file:///tmp/evil.git",
        ] {
            assert!(
                GitOperation::Fetch {
                    remote: remote.into(),
                    prune: false,
                }
                .argv()
                .is_err(),
                "{remote}"
            );
        }
        for remote in [
            "origin",
            "upstream",
            "https://example.invalid/repo.git",
            "git@example.invalid:acme/repo.git",
        ] {
            assert!(
                GitOperation::Fetch {
                    remote: remote.into(),
                    prune: false,
                }
                .argv()
                .is_ok(),
                "{remote}"
            );
        }
    }

    #[tokio::test]
    async fn a_remote_that_is_a_repository_on_this_machine_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        git_run(dir.path(), &["init", "-q", "--bare", "evil.git"]);
        let git = GitApi::at(dir.path());

        let unnamed = git
            .fetch("evil.git", false)
            .await
            .expect_err("a word no remote is configured as is read by git as a path");
        assert!(
            unnamed
                .to_string()
                .contains("not a remote this repository configures"),
            "{unnamed}"
        );

        git_run(dir.path(), &["remote", "add", "origin", "evil.git"]);
        let configured = git
            .fetch("origin", false)
            .await
            .expect_err("a configured remote on this machine");
        assert!(
            configured
                .to_string()
                .contains("names a repository on this machine"),
            "{configured}"
        );
    }

    #[tokio::test]
    async fn a_moved_submodule_pointer_shows_diffs_and_commits() {
        let dir = tempfile::tempdir().unwrap();
        let library = dir.path().join("library");
        std::fs::create_dir(&library).unwrap();
        init_repo(&library);
        let work = dir.path().join("work");
        std::fs::create_dir(&work).unwrap();
        init_repo(&work);
        git_run(
            &work,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                "-q",
                library.to_str().unwrap(),
                "lib",
            ],
        );
        git_run(&work, &["commit", "-q", "-m", "add lib"]);
        git_run(
            &work.join("lib"),
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "bump",
            ],
        );
        let git = GitApi::at(&work);

        let status = git.status(RepositoryId::new("test")).await.expect("status");
        assert!(
            status
                .changes
                .iter()
                .any(|change| change.path == Path::new("lib")),
            "{:?}",
            status.changes
        );
        let unstaged = git.diff(DiffBaseline::Head, &[]).await.expect("diff");
        assert!(
            unstaged.text.contains("Subproject commit"),
            "{}",
            unstaged.text
        );

        git_run(&work, &["add", "lib"]);
        let staged = git.diff(DiffBaseline::Staged, &[]).await.expect("diff");
        assert!(staged.text.contains("Subproject commit"), "{}", staged.text);
        let detail = git.commit("Move lib").await.expect("commit the pointer");
        assert_eq!(detail.files, vec![PathBuf::from("lib")]);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn a_submodule_pointed_at_a_planted_git_directory_runs_none_of_its_filters() {
        let dir = tempfile::tempdir().unwrap();
        let library = dir.path().join("library");
        std::fs::create_dir(&library).unwrap();
        init_repo(&library);
        let work = dir.path().join("work");
        std::fs::create_dir(&work).unwrap();
        init_repo(&work);
        git_run(
            &work,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                "-q",
                library.to_str().unwrap(),
                "lib",
            ],
        );
        git_run(&work, &["commit", "-q", "-m", "add lib"]);
        let marker = dir.path().join("filter-ran");
        let planted = work.join("planted");
        let copied = SyncCommand::new("cp")
            .arg("-R")
            .arg(work.join(".git/modules/lib"))
            .arg(&planted)
            .status()
            .unwrap();
        assert!(copied.success());
        let planted_config = planted.join("config");
        let planted_config = planted_config.to_str().unwrap();
        git_run(
            dir.path(),
            &[
                "config",
                "--file",
                planted_config,
                "filter.planted.clean",
                &format!("touch '{}'; cat", marker.display()),
            ],
        );
        git_run(
            dir.path(),
            &[
                "config",
                "--file",
                planted_config,
                "core.worktree",
                "../lib",
            ],
        );
        std::fs::write(work.join("lib/.git"), "gitdir: ../planted\n").unwrap();
        std::fs::write(work.join("lib/.gitattributes"), "* filter=planted\n").unwrap();
        std::fs::write(work.join("lib/README.md"), "touched\n").unwrap();
        std::fs::write(
            work.join(".gitmodules"),
            "[submodule \"lib\"]\n\tpath = lib\n\turl = ../library\n\tignore = none\n",
        )
        .unwrap();
        let git = GitApi::at(&work);

        git.status(RepositoryId::new("test"))
            .await
            .expect("status reads the superproject only");
        git.diff(DiffBaseline::Head, &[]).await.expect("diff");
        git.show("HEAD").await.expect("show");
        assert!(
            !marker.exists(),
            "a planted submodule filter ran under host git"
        );

        let committed = git
            .commit("nothing staged")
            .await
            .expect_err("nothing is staged");
        assert!(committed.to_string().contains("nothing is staged"));
        std::fs::write(work.join("README.md"), "edited\n").unwrap();
        git.stage(&[PathBuf::from("README.md")])
            .await
            .expect("stage");
        for refused in [
            git.commit("edit").await.expect_err("commit"),
            git.stash(StashOperation::Push {
                message: None,
                include_untracked: false,
            })
            .await
            .expect_err("stash"),
        ] {
            assert!(refused.to_string().contains("planted"), "{refused}");
        }
        assert!(
            !marker.exists(),
            "a planted submodule filter ran under host git"
        );
    }

    #[test]
    fn writes_reads_and_capabilities_are_classified_per_operation() {
        assert!(!GitOperation::Status.is_write());
        assert!(!GitOperation::WorktreeList.is_write());
        assert!(!GitOperation::Stash(StashOperation::List).is_write());
        assert!(GitOperation::Stash(StashOperation::Pop).is_write());
        assert!(GitOperation::Rebase {
            onto: "main".into(),
            hooks: HookPolicy::Respect,
        }
        .capabilities()
        .contains(&CodeCapability::GitHistoryRewrite));
        assert!(GitOperation::Pull {
            remote: "origin".into(),
            branch: None,
        }
        .capabilities()
        .contains(&CodeCapability::NetworkAccess));
    }

    #[test]
    fn conflicts_are_parsed_into_typed_sides() {
        let conflicts = parse_conflicts(
            "UU src/both.rs\n\
             AA src/added.rs\n\
             DU src/ours.rs\n\
             M  src/clean.rs\n",
        );

        assert_eq!(conflicts.len(), 3);
        assert_eq!(conflicts[0].kind, ConflictKind::BothModified);
        assert_eq!(conflicts[1].kind, ConflictKind::BothAdded);
        assert_eq!(conflicts[2].kind, ConflictKind::DeletedByUs);
        assert_eq!(conflicts[2].kind.label(), "deleted by us");
    }

    #[test]
    fn branch_list_is_a_struct_not_a_line_of_text() {
        let branches = parse_branch_list(
            "*\0main\0abc1234\0origin/main\n\
             \0feature\0def5678\0\n",
        );

        assert_eq!(branches.len(), 2);
        assert!(branches[0].is_current);
        assert_eq!(branches[0].upstream.as_deref(), Some("origin/main"));
        assert!(!branches[1].is_current);
        assert!(branches[1].upstream.is_none());
        assert_eq!(branches[1].commit, "def5678");
    }

    #[test]
    fn a_commit_is_parsed_into_fields_and_files() {
        let detail = parse_commit_detail(
            "abc123\u{0}Ada\u{0}2026-09-17T10:00:00+00:00\u{0}Fix the parser\u{0}It was wrong.\n\
             \n\
             And here is why.\u{0}\n\
             src/parser.rs\n\
             src/lib.rs\n",
        )
        .unwrap();

        assert_eq!(detail.commit, "abc123");
        assert_eq!(detail.author, "Ada");
        assert_eq!(detail.subject, "Fix the parser");
        assert!(detail.body.ends_with("And here is why."));
        assert_eq!(
            detail.files,
            vec![PathBuf::from("src/parser.rs"), PathBuf::from("src/lib.rs")],
            "a multi-line body must not be read as a file list"
        );
        assert!(parse_commit_detail("").is_err());
    }

    #[test]
    fn submodule_paths_are_read_from_gitmodules() {
        let paths = parse_submodule_paths(
            "[submodule \"vendor/lib\"]\n\
             \tpath = vendor/lib\n\
             \turl = https://example.invalid/lib.git\n",
        );

        assert!(paths.contains(&PathBuf::from("vendor/lib")));
        assert_eq!(paths.len(), 1);
    }

    #[tokio::test]
    async fn reads_return_typed_records_from_a_real_repository() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let git = GitApi::at(dir.path());

        let head = git.rev_parse("HEAD").await.expect("rev-parse");
        assert!(head.commit.len() >= 40);

        let branches = git.branches(false).await.expect("branch list");
        assert!(branches
            .iter()
            .any(|branch| branch.name == "main" && branch.is_current));

        let commit = git.show("HEAD").await.expect("show");
        assert_eq!(commit.subject, "init");
        assert_eq!(commit.files, vec![PathBuf::from("README.md")]);

        std::fs::write(dir.path().join("staged.txt"), "staged\n").unwrap();
        git.stage(&[PathBuf::from("staged.txt")])
            .await
            .expect("stage");

        let snapshot = git.status(RepositoryId::new("test")).await.expect("status");
        assert_eq!(snapshot.branch.as_deref(), Some("main"));
        assert_eq!(snapshot.staged().count(), 1);
        assert!(snapshot.head_commit.is_some());

        git.unstage(&[PathBuf::from("staged.txt")])
            .await
            .expect("unstage");
        let after = git.status(RepositoryId::new("test")).await.expect("status");
        assert_eq!(after.staged().count(), 0);

        assert!(git.conflicts().await.expect("conflicts").is_empty());
        assert_eq!(git.worktrees().await.expect("worktrees").len(), 1);
    }

    #[tokio::test]
    async fn an_operation_that_discards_work_names_what_it_would_take_first() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let git = GitApi::at(dir.path());
        std::fs::write(dir.path().join("README.md"), "edited\n").unwrap();
        std::fs::write(dir.path().join("staged.rs"), "the user staged this\n").unwrap();
        git.stage(&[PathBuf::from("staged.rs")])
            .await
            .expect("stage");
        std::fs::write(dir.path().join("scratch.txt"), "untracked\n").unwrap();

        let hard = GitOperation::Reset {
            mode: ResetMode::Hard,
            rev: "HEAD".into(),
        };
        assert_eq!(
            git.discarded_by(&hard).await.unwrap(),
            vec![PathBuf::from("README.md"), PathBuf::from("staged.rs")],
            "a hard reset takes the tracked edit and the staged one, not the untracked file"
        );
        let cleaning = GitOperation::Clean {
            directories: true,
            ignored: false,
        };
        assert_eq!(
            git.discarded_by(&cleaning).await.unwrap(),
            vec![PathBuf::from("scratch.txt")]
        );
        assert!(
            git.discarded_by(&GitOperation::Reset {
                mode: ResetMode::Soft,
                rev: "HEAD".into(),
            })
            .await
            .unwrap()
            .is_empty(),
            "only a hard reset reaches the working tree"
        );

        git.reset(ResetMode::Hard, "HEAD").await.expect("reset");
        assert_eq!(
            std::fs::read_to_string(dir.path().join("README.md")).unwrap(),
            "hello\n"
        );
        assert_eq!(
            git.clean(true, false).await.expect("clean"),
            vec![PathBuf::from("scratch.txt")]
        );
        assert!(!dir.path().join("scratch.txt").exists());
    }

    #[tokio::test]
    async fn a_branch_delete_refuses_the_policys_branch_and_the_one_checked_out() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let git = GitApi::at(dir.path());
        git.branch_create("feature", None).await.expect("branch");

        let guarded = RepositoryPolicy {
            default_branch: Some("main".into()),
            protected_branches: vec!["feature".into()],
            ..RepositoryPolicy::default()
        };
        assert!(git
            .branch_delete("feature", true, &guarded)
            .await
            .unwrap_err()
            .to_string()
            .contains("protected"));
        assert!(git
            .branch_delete("main", true, &RepositoryPolicy::default())
            .await
            .unwrap_err()
            .to_string()
            .contains("checkout is on"));

        let deleted = git
            .branch_delete("feature", true, &RepositoryPolicy::default())
            .await
            .expect("delete");
        assert_eq!(deleted.name, "feature");
        assert!(!git
            .branches(false)
            .await
            .unwrap()
            .iter()
            .any(|branch| branch.name == "feature"));
    }

    #[tokio::test]
    async fn the_users_own_edits_are_named_before_anything_overwrites_them() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let git = GitApi::at(dir.path());
        std::fs::write(dir.path().join("README.md"), "the user was here\n").unwrap();
        let baseline = git
            .status(RepositoryId::new("test"))
            .await
            .expect("baseline");

        std::fs::write(dir.path().join("generated.txt"), "the agent was here\n").unwrap();

        let at_risk = git
            .user_changes_at_risk(
                &baseline,
                &[PathBuf::from("README.md"), PathBuf::from("generated.txt")],
            )
            .await
            .expect("at-risk read");

        assert_eq!(
            at_risk,
            vec![PathBuf::from("README.md")],
            "only the file the user had already edited is theirs to lose"
        );
    }

    #[tokio::test]
    async fn a_conflicting_merge_returns_the_conflicted_paths() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let run = |args: &[&str]| {
            SyncCommand::new("git")
                .current_dir(dir.path())
                .args(args)
                .output()
                .expect("git available");
        };
        run(&["checkout", "-q", "-b", "feature"]);
        std::fs::write(dir.path().join("README.md"), "feature\n").unwrap();
        run(&["commit", "-qam", "feature"]);
        run(&["checkout", "-q", "main"]);
        std::fs::write(dir.path().join("README.md"), "main\n").unwrap();
        run(&["commit", "-qam", "main"]);

        let git = GitApi::at(dir.path());
        let outcome = git
            .merge("feature", HookPolicy::Respect)
            .await
            .expect("merge reports a conflict rather than failing");

        assert!(outcome.is_conflicted());
        let MergeOutcome::Conflicted { paths } = outcome else {
            unreachable!("asserted above");
        };
        assert_eq!(paths[0].path, PathBuf::from("README.md"));
        assert_eq!(paths[0].kind, ConflictKind::BothModified);
    }

    #[tokio::test]
    async fn show_stage_reads_all_three_sides_of_an_unmerged_path() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let run = |args: &[&str]| {
            SyncCommand::new("git")
                .current_dir(dir.path())
                .args(args)
                .output()
                .expect("git available");
        };
        run(&["checkout", "-q", "-b", "feature"]);
        std::fs::write(dir.path().join("README.md"), "feature\n").unwrap();
        run(&["commit", "-qam", "feature"]);
        run(&["checkout", "-q", "main"]);
        std::fs::write(dir.path().join("README.md"), "main\n").unwrap();
        run(&["commit", "-qam", "main"]);

        let git = GitApi::at(dir.path());
        assert!(git
            .merge("feature", HookPolicy::Respect)
            .await
            .unwrap()
            .is_conflicted());

        let readme = PathBuf::from("README.md");
        assert_eq!(
            git.show_stage(&readme, 1).await.unwrap().as_deref(),
            Some("hello\n")
        );
        assert_eq!(
            git.show_stage(&readme, 2).await.unwrap().as_deref(),
            Some("main\n")
        );
        assert_eq!(
            git.show_stage(&readme, 3).await.unwrap().as_deref(),
            Some("feature\n")
        );
        assert_eq!(
            git.show_stage(&PathBuf::from("absent.rs"), 2)
                .await
                .unwrap(),
            None,
            "a side git does not hold reads as absent, not as an error"
        );
    }

    #[test]
    fn a_stage_read_refuses_an_out_of_range_stage_or_an_escaping_path() {
        assert!(GitOperation::ShowStage {
            path: PathBuf::from("README.md"),
            stage: 0,
        }
        .argv()
        .is_err());
        assert!(GitOperation::ShowStage {
            path: PathBuf::from("../outside.rs"),
            stage: 2,
        }
        .argv()
        .is_err());
        assert_eq!(
            GitOperation::ShowStage {
                path: PathBuf::from("src/main.rs"),
                stage: 3,
            }
            .argv()
            .unwrap(),
            vec!["show", ":3:src/main.rs"]
        );
    }

    #[tokio::test]
    async fn a_submodule_pointer_is_not_staged_by_accident() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        std::fs::write(
            dir.path().join(".gitmodules"),
            "[submodule \"vendor/lib\"]\n\tpath = vendor/lib\n\turl = https://example.invalid/lib.git\n",
        )
        .unwrap();
        std::fs::create_dir_all(dir.path().join("vendor/lib")).unwrap();

        let git = GitApi::at(dir.path());
        let error = git
            .stage(&[PathBuf::from("vendor/lib")])
            .await
            .expect_err("a submodule pointer must not be staged silently");

        assert!(error.to_string().contains("submodule pointer"));
    }

    #[tokio::test]
    async fn stash_round_trips_through_typed_outcomes() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        std::fs::write(dir.path().join("README.md"), "changed\n").unwrap();
        let git = GitApi::at(dir.path());

        let saved = git
            .stash(StashOperation::Push {
                message: Some("work in progress".into()),
                include_untracked: false,
            })
            .await
            .expect("stash push");
        assert!(matches!(saved, StashOutcome::Saved { .. }));

        let listed = git.stash(StashOperation::List).await.expect("stash list");
        let StashOutcome::Listed { entries } = listed else {
            unreachable!("list returns a listing");
        };
        assert_eq!(entries.len(), 1);

        assert_eq!(
            git.stash(StashOperation::Pop).await.expect("stash pop"),
            StashOutcome::Restored
        );
    }

    fn git_run(dir: &Path, args: &[&str]) {
        let output = SyncCommand::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .expect("git available");
        assert!(
            output.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    /// A checkout with a real remote it can push to, and one commit waiting.
    fn repo_with_remote() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().expect("temp dir");
        let remote = dir.path().join("remote.git");
        std::fs::create_dir_all(&remote).expect("remote dir");
        git_run(&remote, &["init", "-q", "--bare", "-b", "main"]);
        let work = dir.path().join("work");
        std::fs::create_dir_all(&work).expect("work dir");
        init_repo(&work);
        git_run(
            &work,
            &["remote", "add", "origin", &remote.display().to_string()],
        );
        git_run(&work, &["push", "-q", "--set-upstream", "origin", "main"]);
        git_run(&work, &["checkout", "-q", "-b", "feature"]);
        std::fs::write(work.join("feature.txt"), "work\n").unwrap();
        git_run(&work, &["add", "feature.txt"]);
        git_run(&work, &["commit", "-q", "-m", "add the feature"]);
        (dir, work)
    }

    fn policy() -> RepositoryPolicy {
        RepositoryPolicy {
            default_branch: Some("main".to_string()),
            protected_branches: vec!["release".to_string()],
            allow_force_push: false,
            allow_direct_push_to_default: false,
        }
    }

    #[tokio::test]
    async fn a_push_plan_names_the_branch_the_upstream_and_every_commit_it_would_send() {
        let (_dir, work) = repo_with_remote();
        let git = GitApi::at(&work);

        let plan = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");

        assert_eq!(plan.branch, "feature");
        assert_eq!(plan.remote, "origin");
        assert!(plan.upstream.is_none());
        assert!(plan.sets_upstream());
        assert_eq!(plan.commits.len(), 1, "{:?}", plan.commits);
        assert_eq!(plan.commits[0].subject, "add the feature");
        assert_eq!(plan.head, plan.commits[0].commit);
        assert!(plan.reasons.contains(&PushReason::NoUpstream));
        assert!(plan.summary().contains("1 commit(s)"));
    }

    /// The remote here is a second repository on this machine, so the push
    /// itself is refused once consent is given: git would run that
    /// repository's own hooks outside the sandbox.
    #[tokio::test]
    async fn a_push_names_only_its_own_branch_and_never_reaches_a_repository_on_this_machine() {
        let (_dir, work) = repo_with_remote();
        git_run(&work, &["checkout", "-q", "-b", "unrelated"]);
        std::fs::write(work.join("unrelated.txt"), "other\n").unwrap();
        git_run(&work, &["add", "unrelated.txt"]);
        git_run(&work, &["commit", "-q", "-m", "an unrelated commit"]);
        git_run(&work, &["checkout", "-q", "feature"]);
        let git = GitApi::at(&work);

        let plan = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");
        let subjects: Vec<&str> = plan
            .commits
            .iter()
            .map(|commit| commit.subject.as_str())
            .collect();
        assert_eq!(subjects, vec!["add the feature"]);

        let argv = plan.operation().argv().expect("argv");
        assert_eq!(
            argv.last().map(String::as_str),
            Some("refs/heads/feature:refs/heads/feature"),
            "a push names the ref it sends: {argv:?}"
        );

        assert!(argv.contains(&"--no-recurse-submodules".to_string()));

        let consent = consent_for(&plan).await;
        let refused = git
            .push(
                &plan.clone().approved(consent),
                &CodePermissionProfile::full_access(),
            )
            .await
            .expect_err("a remote on this machine is refused");
        assert!(
            refused
                .to_string()
                .contains("Local-path remotes aren't supported"),
            "{refused}"
        );

        let remote = GitApi::at(work.parent().expect("parent").join("remote.git"));
        let branches = remote.branches(false).await.expect("remote branches");
        let names: Vec<&str> = branches.iter().map(|b| b.name.as_str()).collect();
        assert!(!names.contains(&"feature"), "{names:?}");
        assert!(!names.contains(&"unrelated"), "{names:?}");
    }

    #[tokio::test]
    async fn a_push_is_refused_when_the_profile_does_not_grant_it() {
        let (_dir, work) = repo_with_remote();
        let git = GitApi::at(&work);
        let plan = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");

        assert!(plan.capabilities().contains(&CodeCapability::GitPush));

        let consent = consent_for(&plan).await;
        let denied = git
            .push(
                &plan.clone().approved(consent),
                &CodePermissionProfile::read_only(),
            )
            .await
            .expect_err("a read-only session may not push");
        assert!(denied.to_string().contains("may not push"), "{denied}");

        let unapproved = git
            .push(&plan, &CodePermissionProfile::standard())
            .await
            .expect_err("an unapproved plan does not run");
        assert!(
            unapproved.to_string().contains("refusing to push"),
            "{unapproved}"
        );
    }

    /// A push nobody had to approve is still a push nobody did approve. Every
    /// reason to ask can be absent and the consent is still required.
    #[tokio::test]
    async fn a_plan_with_nothing_to_approve_still_does_not_push_without_consent() {
        use agiworkforce_protocol::code_domain::CodeCapabilities;

        let mut granted = CodePermissionProfile::full_access();
        granted.capabilities = CodeCapabilities::uniform(PermissionDecision::Allow);
        let (_dir, work) = repo_with_remote();
        let git = GitApi::at(&work);
        git_run(
            &work,
            &["push", "-q", "--set-upstream", "origin", "feature"],
        );
        std::fs::write(work.join("feature.txt"), "more\n").unwrap();
        git_run(&work, &["add", "feature.txt"]);
        git_run(&work, &["commit", "-q", "-m", "follow-up"]);

        let plan = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");
        assert!(
            !plan.needs_approval(),
            "this plan is the one with no reason to ask: {:?}",
            plan.reasons
        );

        let refused = git
            .push(&plan, &granted)
            .await
            .expect_err("consent is not optional");
        assert!(
            refused.to_string().contains("nobody has approved"),
            "{refused}"
        );

        let consent = consent_for(&plan).await;
        let reached = git
            .push(&plan.approved(consent), &granted)
            .await
            .expect_err("the remote is a repository on this machine");
        assert!(
            reached
                .to_string()
                .contains("names a repository on this machine"),
            "once allowed, the same push reaches git, which refuses only the local remote: \
             {reached}"
        );
    }

    #[tokio::test]
    async fn the_repository_policy_decides_a_push_to_a_protected_or_default_branch() {
        let (_dir, work) = repo_with_remote();
        git_run(&work, &["checkout", "-q", "main"]);
        std::fs::write(work.join("README.md"), "second\n").unwrap();
        git_run(&work, &["add", "README.md"]);
        git_run(&work, &["commit", "-q", "-m", "second"]);
        let git = GitApi::at(&work);

        let plan = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");
        assert_eq!(plan.branch, "main");
        assert!(plan.upstream.is_some(), "main tracks its remote");
        assert!(plan.reasons.contains(&PushReason::DefaultBranch));
        assert!(plan.needs_approval());

        let refused = git
            .push(&plan, &CodePermissionProfile::full_access())
            .await
            .expect_err("the default branch is not pushed without a decision");
        assert!(refused.to_string().contains("default branch"), "{refused}");

        git_run(&work, &["checkout", "-q", "-b", "release"]);
        let protected = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");
        assert!(protected.reasons.contains(&PushReason::ProtectedBranch));
    }

    #[tokio::test]
    async fn a_plan_stops_being_consent_once_the_branch_moves_under_it() {
        let (_dir, work) = repo_with_remote();
        let git = GitApi::at(&work);
        let planned = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");
        let consent = consent_for(&planned).await;
        let plan = planned.approved(consent);

        std::fs::write(work.join("feature.txt"), "more\n").unwrap();
        git_run(&work, &["add", "feature.txt"]);
        git_run(
            &work,
            &["commit", "-q", "-m", "a commit the user never saw"],
        );

        let refused = git
            .push(&plan, &CodePermissionProfile::full_access())
            .await
            .expect_err("the plan no longer describes the branch");
        assert!(refused.to_string().contains("moved"), "{refused}");

        git_run(&work, &["checkout", "-q", "main"]);
        let elsewhere = git
            .push(&plan, &CodePermissionProfile::full_access())
            .await
            .expect_err("the checkout is on another branch");
        assert!(
            elsewhere.to_string().contains("not the branch"),
            "{elsewhere}"
        );
    }

    #[tokio::test]
    async fn consent_given_for_one_branch_does_not_send_another() {
        let (_dir, work) = repo_with_remote();
        let git = GitApi::at(&work);
        let feature = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");
        let consent = consent_for(&feature).await;

        git_run(&work, &["checkout", "-q", "-b", "other"]);
        std::fs::write(work.join("other.txt"), "other\n").unwrap();
        git_run(&work, &["add", "other.txt"]);
        git_run(
            &work,
            &["commit", "-q", "-m", "a branch the user never saw"],
        );
        let other = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");
        assert_eq!(other.branch, "other");

        let refused = git
            .push(
                &other.approved(consent),
                &CodePermissionProfile::full_access(),
            )
            .await
            .expect_err("consent for feature is not consent for other");
        assert!(
            refused.to_string().contains("a different push"),
            "{refused}"
        );

        let remote = GitApi::at(work.parent().expect("parent").join("remote.git"));
        let names: Vec<String> = remote
            .branches(false)
            .await
            .expect("remote branches")
            .into_iter()
            .map(|branch| branch.name)
            .collect();
        assert!(!names.iter().any(|name| name == "other"), "{names:?}");
    }

    #[tokio::test]
    async fn consent_stops_covering_a_plan_once_the_head_it_named_moves() {
        let (_dir, work) = repo_with_remote();
        let git = GitApi::at(&work);
        let planned = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");
        let consent = consent_for(&planned).await;

        std::fs::write(work.join("feature.txt"), "more\n").unwrap();
        git_run(&work, &["add", "feature.txt"]);
        git_run(
            &work,
            &["commit", "-q", "-m", "a commit the user never saw"],
        );

        let replanned = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");
        assert_ne!(replanned.head, planned.head);
        assert!(!consent.covers(&replanned));

        let refused = git
            .push(
                &replanned.approved(consent),
                &CodePermissionProfile::full_access(),
            )
            .await
            .expect_err("the consent named a head that has moved");
        assert!(
            refused.to_string().contains("a different push"),
            "{refused}"
        );
    }

    #[tokio::test]
    async fn a_detached_head_and_an_up_to_date_branch_both_stop_a_push() {
        let (_dir, work) = repo_with_remote();
        let git = GitApi::at(&work);
        git_run(&work, &["checkout", "-q", "main"]);

        let nothing = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");
        assert!(nothing.commits.is_empty());
        assert!(nothing.reasons.contains(&PushReason::NothingToPush));
        assert_eq!(nothing.blocked_by(), Some(&PushReason::NothingToPush));

        let head = git.rev_parse("HEAD").await.expect("head").commit;
        git_run(&work, &["checkout", "-q", &head]);
        let detached = git
            .push_plan("origin", PushForce::Never, &policy())
            .await
            .expect("plan");
        assert_eq!(detached.blocked_by(), Some(&PushReason::DetachedHead));
        assert!(
            request_push_consent(&UserAllows, &detached).await.is_none(),
            "a detached HEAD is never offered for approval"
        );
        let refused = git
            .push(&detached, &CodePermissionProfile::full_access())
            .await
            .expect_err("a detached HEAD has no branch to push");
        assert!(refused.to_string().contains("detached"), "{refused}");
    }

    #[test]
    fn a_force_push_spends_the_history_rewrite_capability_and_never_overwrites_blind() {
        let plan = GitOperation::Push {
            remote: "origin".into(),
            branch: "feature".into(),
            set_upstream: false,
            force: PushForce::WithLease,
        };
        let argv = plan.argv().expect("argv");
        assert!(argv.contains(&"--force-with-lease".to_string()), "{argv:?}");
        assert!(!argv.iter().any(|arg| arg == "--force"), "{argv:?}");
        let capabilities = plan.capabilities();
        assert!(capabilities.contains(&CodeCapability::GitPush));
        assert!(capabilities.contains(&CodeCapability::GitHistoryRewrite));
        assert!(capabilities.contains(&CodeCapability::NetworkAccess));
    }

    #[test]
    fn every_push_reason_says_what_it_is_and_whether_it_stops_the_push() {
        let reasons = [
            PushReason::NoUpstream,
            PushReason::ProtectedBranch,
            PushReason::DefaultBranch,
            PushReason::ForcePush,
            PushReason::DetachedHead,
            PushReason::NotOnPlannedBranch {
                head: "main".into(),
            },
            PushReason::BranchMoved {
                planned: "abc".into(),
                head: "def".into(),
            },
            PushReason::NothingToPush,
        ];
        for reason in &reasons {
            assert!(!reason.label().is_empty(), "{reason:?} has no label");
        }
        let blocking: Vec<bool> = reasons.iter().map(PushReason::blocks).collect();
        assert_eq!(
            blocking,
            vec![false, false, false, false, true, true, true, true]
        );
    }

    /// A checkout with one staged edit, one unstaged edit and a commit behind
    /// the last one, so every baseline has a different answer.
    fn checkout_with_layered_changes(dir: &Path) {
        init_repo(dir);
        let run = |args: &[&str]| {
            let output = SyncCommand::new("git")
                .current_dir(dir)
                .args(args)
                .output()
                .expect("git available");
            assert!(output.status.success(), "git {args:?} failed");
        };
        std::fs::write(dir.join("notes.txt"), "one\n").unwrap();
        run(&["add", "notes.txt"]);
        run(&["commit", "-q", "-m", "notes"]);
        std::fs::write(dir.join("README.md"), "staged\n").unwrap();
        run(&["add", "README.md"]);
        std::fs::write(dir.join("notes.txt"), "two\n").unwrap();
    }

    fn changed_paths(read: &BaselineDiff) -> Vec<String> {
        let mut paths: Vec<String> = read
            .diff
            .files
            .iter()
            .map(|file| file.path().display().to_string())
            .collect();
        paths.sort();
        paths
    }

    #[tokio::test]
    async fn every_baseline_answers_a_different_question_about_the_same_checkout() {
        let dir = tempfile::tempdir().unwrap();
        checkout_with_layered_changes(dir.path());
        let git = GitApi::at(dir.path());

        let mut baselines = DiffBaseline::NAMED.to_vec();
        baselines.push(DiffBaseline::Revision("HEAD~1".into()));
        let mut answers = Vec::new();
        for baseline in baselines {
            let expected: &[&str] = match &baseline {
                DiffBaseline::Unstaged => &["notes.txt"],
                DiffBaseline::Staged => &["README.md"],
                DiffBaseline::Head | DiffBaseline::Revision(_) => &["README.md", "notes.txt"],
            };
            let read = git.diff(baseline.clone(), &[]).await.expect("diff");
            assert_eq!(changed_paths(&read), expected, "{baseline:?}");
            let blocking = diff_blocking(dir.path(), baseline.clone()).expect("diff");
            assert_eq!(
                changed_paths(&blocking),
                changed_paths(&read),
                "the slash command and the tool disagree about {baseline:?}"
            );
            answers.push((baseline, read));
        }

        let since_parent = &answers.last().expect("revision").1;
        let notes = since_parent
            .diff
            .file(Path::new("notes.txt"))
            .expect("notes");
        assert_eq!(
            notes.kind,
            crate::diff_model::FileChangeKind::Added,
            "notes.txt did not exist one commit back"
        );
        let since_head = &answers[2].1;
        assert_eq!(
            since_head
                .diff
                .file(Path::new("notes.txt"))
                .expect("notes")
                .kind,
            crate::diff_model::FileChangeKind::Modified
        );
    }

    #[tokio::test]
    async fn a_diff_can_be_narrowed_to_the_paths_named() {
        let dir = tempfile::tempdir().unwrap();
        checkout_with_layered_changes(dir.path());
        let read = GitApi::at(dir.path())
            .diff(DiffBaseline::Head, &[PathBuf::from("README.md")])
            .await
            .expect("diff");
        assert_eq!(changed_paths(&read), vec!["README.md".to_string()]);
    }

    #[test]
    fn a_baseline_is_read_from_what_a_person_types_and_never_as_an_option() {
        assert_eq!(DiffBaseline::parse("").unwrap(), DiffBaseline::Unstaged);
        assert_eq!(
            DiffBaseline::parse(" staged ").unwrap(),
            DiffBaseline::Staged
        );
        assert_eq!(DiffBaseline::parse("head").unwrap(), DiffBaseline::Head);
        assert_eq!(
            DiffBaseline::parse("origin/main").unwrap(),
            DiffBaseline::Revision("origin/main".into())
        );
        for smuggled in ["--output=/tmp/x", "-R"] {
            assert!(
                DiffBaseline::parse(smuggled).is_err(),
                "{smuggled} would reach git as an option"
            );
        }
        let argv = GitOperation::Diff {
            baseline: DiffBaseline::Revision("main".into()),
            paths: vec![PathBuf::from("-p")],
        }
        .argv()
        .expect("argv");
        let separator = argv.iter().position(|arg| arg == "--").expect("--");
        assert_eq!(&argv[separator + 1..], ["-p"], "{argv:?}");
        assert!(!GitOperation::Diff {
            baseline: DiffBaseline::Head,
            paths: Vec::new(),
        }
        .is_write());
    }

    #[tokio::test]
    async fn a_clean_baseline_says_there_is_nothing_rather_than_listing_nothing() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let git = GitApi::at(dir.path());
        for baseline in DiffBaseline::NAMED {
            let read = git.diff(baseline.clone(), &[]).await.expect("diff");
            assert_eq!(
                read.summary(),
                format!("No {}.", baseline.describe()),
                "{baseline:?}"
            );
        }
        std::fs::write(dir.path().join("README.md"), "changed\n").unwrap();
        let read = git.diff(DiffBaseline::Head, &[]).await.expect("diff");
        assert_eq!(
            read.summary(),
            "Changes since the last commit (1 file changed, +1 -1):\n  M  README.md  +1 -1"
        );
    }

    #[tokio::test]
    async fn a_snapshot_keeps_what_the_repository_held_when_it_was_taken() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let run = |args: &[&str]| {
            SyncCommand::new("git")
                .current_dir(dir.path())
                .args(args)
                .output()
                .expect("git available");
        };
        let git = GitApi::at(dir.path());
        std::fs::write(dir.path().join("README.md"), "the user was here\n").unwrap();
        let snapshot = git.status(RepositoryId::new("test")).await.expect("status");
        let as_taken = snapshot.clone();

        run(&["commit", "-qam", "later"]);
        run(&["checkout", "-q", "-b", "elsewhere"]);
        std::fs::write(dir.path().join("new.txt"), "new\n").unwrap();
        git.user_changes_at_risk(&snapshot, &[PathBuf::from("README.md")])
            .await
            .expect("at-risk read");
        let now = git.status(RepositoryId::new("test")).await.expect("status");

        assert_eq!(
            snapshot, as_taken,
            "a snapshot changed after the repository did"
        );
        assert_ne!(now.branch, snapshot.branch);
        assert_ne!(now.head_commit, snapshot.head_commit);
        assert_ne!(now.changes, snapshot.changes);
        let stored = serde_json::to_string(&snapshot).expect("serialise");
        assert_eq!(
            serde_json::from_str::<RepositorySnapshot>(&stored).expect("read back"),
            as_taken
        );
    }
}

#[cfg(test)]
mod network_prompt_tests {
    use super::*;

    #[test]
    fn network_git_never_waits_on_a_prompt() {
        let env = non_interactive_network_env(|| None);
        assert!(env.contains(&("GIT_TERMINAL_PROMPT", "0".to_string())));
        assert!(env.contains(&("SSH_ASKPASS_REQUIRE", "never".to_string())));
    }

    #[test]
    fn a_configured_command_that_is_not_plain_ssh_sets_no_ssh_override() {
        if std::env::var_os("GIT_SSH_COMMAND").is_some() || std::env::var_os("GIT_SSH").is_some() {
            return;
        }
        let env = non_interactive_network_env(|| Some("ssh-agent-wrapper --profile work".into()));
        assert!(env.iter().all(|(name, _)| *name != "GIT_SSH_COMMAND"));
        let env = non_interactive_network_env(|| Some("ssh -F ~/.ssh/work_config".into()));
        assert!(env.contains(&(
            "GIT_SSH_COMMAND",
            "ssh -F ~/.ssh/work_config -o BatchMode=yes".to_string()
        )));
    }

    #[test]
    fn an_empty_configured_command_is_plain_ssh() {
        assert_eq!(
            batch_ssh_command(None, false, || Some("  ".to_string())).as_deref(),
            Some("ssh -o BatchMode=yes")
        );
        assert!(is_plain_ssh("ssh.exe -i key"));
        assert!(is_plain_ssh("/usr/local/bin/ssh"));
        assert!(!is_plain_ssh("sshpass -p x ssh"));
    }

    #[test]
    fn a_batch_mode_refusal_says_how_to_get_past_it() {
        let hinted = with_batch_ssh_hint(
            b"git@github.com: Permission denied (publickey).\nfatal: Could not read from remote\n",
        );
        assert!(hinted.contains("load the key with ssh-add"));
        assert!(with_batch_ssh_hint(b"Host key verification failed.\n").contains("ssh-add"));
        assert_eq!(
            with_batch_ssh_hint(b"fatal: repository not found\n"),
            "fatal: repository not found\n"
        );
    }

    fn git_in(dir: &Path, args: &[&str]) {
        let status = std::process::Command::new("git")
            .current_dir(dir)
            .args(args)
            .status()
            .expect("git available");
        assert!(status.success(), "git {args:?}");
    }

    #[tokio::test]
    async fn the_repository_ssh_command_is_read_through_its_includes() {
        let dir = tempfile::tempdir().expect("tempdir");
        git_in(dir.path(), &["init", "-q"]);
        let included = dir.path().join("ssh.config");
        std::fs::write(
            &included,
            "[core]\n\tsshCommand = plink -batch -load work\n",
        )
        .unwrap();
        git_in(
            dir.path(),
            &[
                "config",
                "include.path",
                included.to_str().expect("utf-8 path"),
            ],
        );
        let configured = GitApi::at(dir.path())
            .configured_ssh_command()
            .await
            .expect("read core.sshCommand");
        assert_eq!(configured.as_deref(), Some("plink -batch -load work"));
    }

    #[tokio::test]
    async fn a_repository_that_sets_no_ssh_command_is_not_an_error() {
        let dir = tempfile::tempdir().expect("tempdir");
        git_in(dir.path(), &["init", "-q"]);
        GitApi::at(dir.path())
            .configured_ssh_command()
            .await
            .expect("an unset key is not an error");
    }

    #[test]
    fn ssh_runs_in_batch_mode_and_a_users_own_command_is_respected() {
        assert_eq!(
            batch_ssh_command(None, false, || None).as_deref(),
            Some("ssh -o BatchMode=yes")
        );
        assert_eq!(
            batch_ssh_command(None, false, || Some("ssh -i ~/.ssh/work".to_string())).as_deref(),
            Some("ssh -i ~/.ssh/work -o BatchMode=yes")
        );
        let configuration_unread =
            || -> Option<String> { panic!("the environment wins over configuration") };
        assert_eq!(
            batch_ssh_command(
                Some("/usr/bin/ssh -p 2222".to_string()),
                false,
                configuration_unread,
            )
            .as_deref(),
            Some("/usr/bin/ssh -p 2222 -o BatchMode=yes")
        );
        assert_eq!(
            batch_ssh_command(None, false, || Some("plink -batch".to_string())),
            None,
            "a command that is not plain ssh is left alone"
        );
        assert_eq!(batch_ssh_command(None, true, || None), None);
    }

    #[test]
    fn a_network_timeout_says_the_remote_did_not_answer() {
        let error = std::io::Error::new(std::io::ErrorKind::TimedOut, RemoteDidNotAnswer);
        let message = host_git_failure(&error);
        assert!(
            message.contains("the remote did not answer within 5 minutes"),
            "{message}"
        );
        assert!(message.contains("ssh-add"), "{message}");
        let local = std::io::Error::new(std::io::ErrorKind::TimedOut, "pipe");
        assert!(host_git_failure(&local).contains("pipe or device"));
    }
}
