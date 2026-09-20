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
    CodeCapability, CodePermissionProfile, PermissionDecision, RepositoryId, RepositoryPolicy,
    RepositorySnapshot,
};
use anyhow::{bail, Context, Result};
use chrono::Utc;
use tokio::process::Command;

use crate::safety::push_consent::PushConsent;

pub use super::worktree::{list_worktree_entries, parse_worktree_porcelain, WorktreeEntry};

const GIT_OPERATION_TIMEOUT: Duration = Duration::from_secs(120);
const GIT_NETWORK_TIMEOUT: Duration = Duration::from_secs(300);

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
                | Self::Stash(StashOperation::List)
        )
    }

    pub fn bypasses_hooks(&self) -> bool {
        match self {
            Self::Merge { hooks, .. } | Self::Rebase { hooks, .. } => hooks.bypasses(),
            _ => false,
        }
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
            Self::Status => vec!["status".into(), "--porcelain".into(), "--branch".into()],
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
            Self::Stash(StashOperation::Pop) => vec!["stash".into(), "pop".into()],
            Self::Stash(StashOperation::List) => vec!["stash".into(), "list".into()],
            Self::Stash(StashOperation::Drop { index }) => {
                vec!["stash".into(), "drop".into(), format!("stash@{{{index}}}")]
            }
            Self::Fetch { remote, prune } => {
                let mut argv = vec!["fetch".into()];
                if *prune {
                    argv.push("--prune".into());
                }
                argv.push(checked_remote(remote)?);
                argv
            }
            Self::Pull { remote, branch } => {
                let mut argv = vec!["pull".into(), "--no-edit".into(), checked_remote(remote)?];
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
                let mut argv = vec!["push".into()];
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

/// A remote is a name or a URL. A URL goes through the one validator the
/// product already has for a git source, which refuses an embedded credential
/// and points at a credential helper or an SSH key: this API never carries a
/// credential of its own.
fn checked_remote(remote: &str) -> Result<String> {
    let remote = checked_ref(remote, "remote")?;
    if remote.contains("://") || remote.starts_with("git@") {
        crate::marketplace::validate_git_clone_url(&remote)?;
    }
    Ok(remote)
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

/// The typed Git API for one repository root.
#[derive(Debug, Clone)]
pub struct GitApi {
    root: PathBuf,
}

impl GitApi {
    pub fn at(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    async fn run(&self, operation: &GitOperation) -> Result<GitOutput> {
        let argv = operation.argv()?;
        let mut command = Command::new("git");
        command.current_dir(&self.root).args(&argv);
        if operation.reaches_network() {
            command.env("GIT_TERMINAL_PROMPT", "0");
        }
        let timeout = if operation.reaches_network() {
            GIT_NETWORK_TIMEOUT
        } else {
            GIT_OPERATION_TIMEOUT
        };
        let output = crate::process_tree::output(command, None, Some(timeout))
            .await
            .with_context(|| format!("invoke git {}", operation.label()))?;
        Ok(GitOutput {
            success: output.status.success(),
            stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
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
        if let Some(consent) = plan.consent() {
            if !consent.covers(plan) {
                bail!(
                    "refusing to push: {}",
                    PushReason::ConsentNotForThisPush.label()
                );
            }
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
        if !plan.is_approved() {
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
            if !pending.is_empty() {
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

    #[tokio::test]
    async fn a_push_sends_only_the_named_branch_and_only_its_own_commits() {
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

        let consent = consent_for(&plan).await;
        git.push(
            &plan.clone().approved(consent),
            &CodePermissionProfile::full_access(),
        )
        .await
        .expect("push");

        let remote = GitApi::at(work.parent().expect("parent").join("remote.git"));
        let branches = remote.branches(false).await.expect("remote branches");
        let names: Vec<&str> = branches.iter().map(|b| b.name.as_str()).collect();
        assert!(names.contains(&"feature"), "{names:?}");
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
}
