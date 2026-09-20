use std::collections::BTreeMap;
use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command;

use agiworkforce_protocol::code_domain::RepositoryRemote;
use anyhow::{bail, Context, Result};

use super::workspace::{workspace_graph, WorkspaceGraph};
use crate::context::{detect_monorepo_type, parse_git_remotes};

const MAX_NESTED_SCAN_DEPTH: usize = 4;
const MAX_NESTED_ROOTS: usize = 64;

/// Config a repository's behaviour actually depends on, as opposed to the
/// user's global preferences.
pub const REPOSITORY_CONFIG_KEYS: &[&str] = &[
    "checkout.defaultremote",
    "core.autocrlf",
    "core.bare",
    "core.filemode",
    "core.hookspath",
    "core.ignorecase",
    "core.worktree",
    "init.defaultbranch",
    "merge.conflictstyle",
    "pull.rebase",
    "push.default",
];

/// Where HEAD points. A detached HEAD and a branch that has no commit yet are
/// distinct states, and both are routinely mistaken for "branch unknown".
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HeadState {
    Branch(String),
    Detached {
        commit: String,
        describe: Option<String>,
    },
    Unborn(String),
}

impl HeadState {
    pub fn branch(&self) -> Option<&str> {
        match self {
            Self::Branch(branch) | Self::Unborn(branch) => Some(branch.as_str()),
            Self::Detached { .. } => None,
        }
    }

    pub fn is_detached(&self) -> bool {
        matches!(self, Self::Detached { .. })
    }

    pub fn commit(&self) -> Option<&str> {
        match self {
            Self::Detached { commit, .. } => Some(commit.as_str()),
            _ => None,
        }
    }

    /// The short commit a detached HEAD sits on, for a display that has room
    /// for one token rather than a sentence.
    pub fn short_commit(&self) -> Option<&str> {
        self.commit().map(|commit| &commit[..commit.len().min(7)])
    }
}

impl fmt::Display for HeadState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Branch(branch) => write!(f, "{branch}"),
            Self::Unborn(branch) => write!(f, "{branch} (no commits yet)"),
            Self::Detached { describe, .. } => {
                let short = self.short_commit().unwrap_or("unknown");
                match describe {
                    Some(label) if label != short => write!(f, "detached at {short} ({label})"),
                    _ => write!(f, "detached at {short}"),
                }
            }
        }
    }
}

/// The version control system a directory is under. Recognising one this
/// product does not drive is not the same as finding no repository at all.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum VersionControl {
    Git,
    Mercurial,
    Subversion,
    Jujutsu,
    Fossil,
}

impl VersionControl {
    pub const ALL: &'static [VersionControl] = &[
        Self::Git,
        Self::Mercurial,
        Self::Subversion,
        Self::Jujutsu,
        Self::Fossil,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Git => "git",
            Self::Mercurial => "mercurial",
            Self::Subversion => "subversion",
            Self::Jujutsu => "jujutsu",
            Self::Fossil => "fossil",
        }
    }

    /// The entry at a working-copy root that identifies this system.
    pub fn marker(self) -> &'static str {
        match self {
            Self::Git => ".git",
            Self::Mercurial => ".hg",
            Self::Subversion => ".svn",
            Self::Jujutsu => ".jj",
            Self::Fossil => ".fslckout",
        }
    }

    /// Whether this product drives the system, as opposed to only naming it.
    pub fn is_driven(self) -> bool {
        self == Self::Git
    }
}

/// The version control system covering `dir`, searched upwards the way each
/// system finds its own root.
pub fn detect_version_control(dir: &Path) -> Option<(VersionControl, PathBuf)> {
    let mut current = Some(dir);
    while let Some(candidate) = current {
        for vcs in VersionControl::ALL.iter().copied() {
            if candidate.join(vcs.marker()).exists() {
                return Some((vcs, candidate.to_path_buf()));
            }
        }
        current = candidate.parent();
    }
    None
}

/// Work a caller asks the checkout whether it can do, before doing it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RepositoryOperation {
    ReadFiles,
    EditFiles,
    ReadHistory,
    DeepenHistory,
    Commit,
    CreateBranch,
    UpdateSubmodulePointer,
}

impl RepositoryOperation {
    pub const ALL: &'static [RepositoryOperation] = &[
        Self::ReadFiles,
        Self::EditFiles,
        Self::ReadHistory,
        Self::DeepenHistory,
        Self::Commit,
        Self::CreateBranch,
        Self::UpdateSubmodulePointer,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::ReadFiles => "read files",
            Self::EditFiles => "edit files",
            Self::ReadHistory => "read history",
            Self::DeepenHistory => "fetch deeper history",
            Self::Commit => "commit",
            Self::CreateBranch => "create a branch",
            Self::UpdateSubmodulePointer => "move a submodule pointer",
        }
    }
}

/// What this checkout can do about one operation. Every answer but
/// `Available` carries the reason, so no caller has to guess at a state and no
/// surface invents its own wording for it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OperationAvailability {
    Available,
    /// Works, with a limit worth saying out loud.
    Degraded(String),
    /// Possible, once the user decides.
    NeedsApproval(String),
    Unavailable(String),
}

impl OperationAvailability {
    pub fn is_available(&self) -> bool {
        matches!(self, Self::Available | Self::Degraded(_))
    }

    pub fn reason(&self) -> Option<&str> {
        match self {
            Self::Available => None,
            Self::Degraded(reason) | Self::NeedsApproval(reason) | Self::Unavailable(reason) => {
                Some(reason.as_str())
            }
        }
    }
}

/// Everything about the checkout the working directory sits in that more than
/// one surface needs: the app server persists it on a thread, `agi doctor`.
#[derive(Debug, Clone)]
pub struct RepositoryLayout {
    pub root: PathBuf,
    pub opened_at: PathBuf,
    pub vcs: VersionControl,
    pub git_dir: PathBuf,
    pub common_dir: PathBuf,
    pub bare: bool,
    pub shallow: bool,
    pub linked_worktree: bool,
    pub head: HeadState,
    pub remotes: Vec<RepositoryRemote>,
    pub default_remote: Option<String>,
    pub default_branch: Option<String>,
    pub parent_root: Option<PathBuf>,
    pub nested_roots: Vec<PathBuf>,
    pub submodules: Vec<PathBuf>,
    pub workspace: Option<WorkspaceGraph>,
    pub config: BTreeMap<String, String>,
}

impl RepositoryLayout {
    pub fn is_nested(&self) -> bool {
        self.parent_root.is_some()
    }

    /// True when the user opened a directory below the repository root. The
    /// checkout is still the whole repository, and the caller has to say which
    /// of the two it means rather than taking the root by default.
    pub fn opened_below_root(&self) -> bool {
        self.opened_at != self.root && self.opened_at.starts_with(&self.root)
    }

    /// The workspace package the opened directory sits in, when the repository
    /// declares one.
    pub fn opened_member(&self) -> Option<&super::workspace::WorkspaceMember> {
        self.workspace
            .as_ref()
            .and_then(|workspace| workspace.member_for(&self.opened_at))
    }

    /// The directory a task should be scoped to: what the user opened, which
    /// is the root only when that is what they opened.
    pub fn task_scope(&self) -> &Path {
        &self.opened_at
    }

    /// What this checkout can do about `operation`, and why not when it
    /// cannot. One decision, read by the tools, the app server and the TUI.
    pub fn availability(&self, operation: RepositoryOperation) -> OperationAvailability {
        use OperationAvailability::{Available, Degraded, NeedsApproval, Unavailable};
        if !self.vcs.is_driven() {
            return Unavailable(format!(
                "this checkout is under {}, which this product does not drive",
                self.vcs.label()
            ));
        }
        match operation {
            RepositoryOperation::ReadFiles | RepositoryOperation::EditFiles => {
                if self.bare {
                    return Unavailable(
                        "a bare repository has no working tree to read or edit".to_string(),
                    );
                }
                Available
            }
            RepositoryOperation::ReadHistory => {
                if matches!(self.head, HeadState::Unborn(_)) {
                    return Unavailable("this branch has no commits yet".to_string());
                }
                if self.shallow {
                    return Degraded(
                        "this is a shallow clone, so history stops at the depth it was cloned to"
                            .to_string(),
                    );
                }
                Available
            }
            RepositoryOperation::DeepenHistory => {
                if !self.shallow {
                    return Unavailable("this checkout already has full history".to_string());
                }
                NeedsApproval(
                    "fetching deeper history reaches the remote over the network".to_string(),
                )
            }
            RepositoryOperation::Commit => {
                if self.bare {
                    return Unavailable(
                        "a bare repository has no working tree to commit from".to_string(),
                    );
                }
                if self.head.is_detached() {
                    return NeedsApproval(
                        "HEAD is detached, so a commit would not land on any branch".to_string(),
                    );
                }
                Available
            }
            RepositoryOperation::CreateBranch => {
                if self.bare {
                    return Unavailable(
                        "a bare repository has no working tree to branch from".to_string(),
                    );
                }
                if matches!(self.head, HeadState::Unborn(_)) {
                    return Unavailable(
                        "there is no commit yet for a branch to start from".to_string(),
                    );
                }
                Available
            }
            RepositoryOperation::UpdateSubmodulePointer => {
                if self.submodules.is_empty() {
                    return Unavailable("this checkout has no submodules".to_string());
                }
                NeedsApproval(
                    "moving a submodule pointer changes which commit everyone checks out"
                        .to_string(),
                )
            }
        }
    }

    /// The branch a write task should be offered when HEAD is detached, so the
    /// work lands somewhere it can be found again.
    pub fn branch_offer_for_write(&self) -> Option<String> {
        if !self.head.is_detached() || self.bare {
            return None;
        }
        let short = self.head.short_commit()?;
        Some(format!("work/from-{short}"))
    }

    pub fn default_remote_url(&self) -> Option<&str> {
        let name = self.default_remote.as_deref()?;
        self.remotes
            .iter()
            .find(|remote| remote.name == name)
            .map(|remote| remote.url.as_str())
    }

    /// One line naming the state a user would otherwise have to run three git
    /// commands to learn.
    pub fn summary(&self) -> String {
        let mut parts = vec![format!("HEAD {}", self.head)];
        if self.bare {
            parts.push("bare repository".to_string());
        }
        if self.linked_worktree {
            parts.push("linked worktree".to_string());
        }
        if self.shallow {
            parts.push("shallow clone".to_string());
        }
        if !self.submodules.is_empty() {
            parts.push(format!("{} submodule(s)", self.submodules.len()));
        }
        if let Some(parent) = &self.parent_root {
            parts.push(format!("nested inside {}", parent.display()));
        }
        match self.remotes.len() {
            0 => parts.push("no remotes".to_string()),
            count => parts.push(match &self.default_remote {
                Some(name) => format!("{count} remote(s), default {name}"),
                None => format!("{count} remote(s), no default"),
            }),
        }
        if let Some(workspace) = &self.workspace {
            parts.push(format!("{} workspace member(s)", workspace.members.len()));
        }
        if !self.nested_roots.is_empty() {
            parts.push(format!("{} nested repo(s)", self.nested_roots.len()));
        }
        parts.join(", ")
    }
}

fn git(dir: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!value.is_empty()).then_some(value)
}

fn git_raw(dir: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Parse `git config --list -z`: NUL-terminated records whose key and value are
/// separated by a newline, so a value containing a newline stays one value.
pub fn parse_git_config_list(text: &str) -> BTreeMap<String, String> {
    let mut config = BTreeMap::new();
    for record in text.split('\0') {
        if record.is_empty() {
            continue;
        }
        let (key, value) = record.split_once('\n').unwrap_or((record, ""));
        config.insert(key.to_ascii_lowercase(), value.to_string());
    }
    config
}

/// Every git config value in effect for `dir`, keyed lowercase the way git
/// itself compares key names.
pub fn git_config(dir: &Path) -> BTreeMap<String, String> {
    git_raw(dir, &["config", "--list", "-z"])
        .map(|text| parse_git_config_list(&text))
        .unwrap_or_default()
}

/// Narrow a full config to the keys a repository's behaviour depends on.
pub fn repository_config(config: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    REPOSITORY_CONFIG_KEYS
        .iter()
        .filter_map(|key| {
            config
                .get(*key)
                .map(|value| ((*key).to_string(), value.clone()))
        })
        .collect()
}

/// Which remote a command with no remote argument should use.
///.
pub fn resolve_default_remote(
    remotes: &[RepositoryRemote],
    configured: Option<&str>,
) -> Option<String> {
    if remotes.is_empty() {
        return None;
    }
    if let Some(configured) = configured.map(str::trim).filter(|name| !name.is_empty()) {
        if remotes.iter().any(|remote| remote.name == configured) {
            return Some(configured.to_string());
        }
    }
    if remotes.len() == 1 {
        return Some(remotes[0].name.clone());
    }
    for preferred in ["origin", "upstream"] {
        if let Some(remote) = remotes.iter().find(|remote| remote.name == preferred) {
            return Some(remote.name.clone());
        }
    }
    remotes.first().map(|remote| remote.name.clone())
}

fn head_state(dir: &Path) -> HeadState {
    let symbolic = git(dir, &["symbolic-ref", "--quiet", "--short", "HEAD"]);
    let commit = git(dir, &["rev-parse", "--verify", "HEAD"]);
    match (symbolic, commit) {
        (Some(branch), Some(_)) => HeadState::Branch(branch),
        (Some(branch), None) => HeadState::Unborn(branch),
        (None, Some(commit)) => HeadState::Detached {
            describe: git(dir, &["describe", "--tags", "--always", "HEAD"]),
            commit,
        },
        (None, None) => HeadState::Unborn("HEAD".to_string()),
    }
}

fn default_branch(
    dir: &Path,
    default_remote: Option<&str>,
    config: &BTreeMap<String, String>,
) -> Option<String> {
    if let Some(remote) = default_remote {
        let head_ref = format!("refs/remotes/{remote}/HEAD");
        if let Some(branch) = git(dir, &["symbolic-ref", "--short", &head_ref]) {
            let prefix = format!("{remote}/");
            return Some(branch.trim_start_matches(&prefix).to_string());
        }
    }
    config.get("init.defaultbranch").cloned()
}

fn scan_nested_roots(dir: &Path, depth: usize, found: &mut Vec<PathBuf>) {
    if depth > MAX_NESTED_SCAN_DEPTH || found.len() >= MAX_NESTED_ROOTS {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if found.len() >= MAX_NESTED_ROOTS {
            return;
        }
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }
        if super::index_policy::scan_skipped_directory_names().contains(&name) {
            continue;
        }
        if path.join(".git").exists() {
            found.push(path);
            continue;
        }
        scan_nested_roots(&path, depth + 1, found);
    }
}

/// Repositories checked out inside `root` that are their own git roots. A
/// submodule and a stray clone look the same from here, and both mean a write.
pub fn nested_git_roots(root: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();
    scan_nested_roots(root, 0, &mut found);
    found.sort();
    found
}

/// The repository containing `root`, when `root` is itself checked out inside
/// another one.
pub fn parent_repository_root(root: &Path) -> Option<PathBuf> {
    let parent = root.parent()?;
    let outer = git(parent, &["rev-parse", "--show-toplevel"])?;
    let outer = PathBuf::from(outer);
    (outer != root).then_some(outer)
}

/// True when `dir` is inside a repository with no working tree of its own.
pub fn is_bare_repository(dir: &Path) -> bool {
    git(dir, &["rev-parse", "--is-bare-repository"]).is_some_and(|value| value == "true")
}

/// True when the checkout holds only part of its history.
pub fn is_shallow_repository(dir: &Path) -> bool {
    git(dir, &["rev-parse", "--is-shallow-repository"]).is_some_and(|value| value == "true")
}

/// Submodules the repository declares, read through the one `.gitmodules`
/// parser the Git API already uses.
pub fn declared_submodules(root: &Path) -> Vec<PathBuf> {
    std::fs::read_to_string(root.join(".gitmodules"))
        .map(|text| {
            crate::platform::runtime::git::parse_submodule_paths(&text)
                .into_iter()
                .collect()
        })
        .unwrap_or_default()
}

/// The single repository detector the app server, `agi doctor` and the prompt
/// context all read. Returns `None` when `cwd` is not inside a repository.
pub fn detect_repository_layout(cwd: &Path) -> Option<RepositoryLayout> {
    let git_dir = git(cwd, &["rev-parse", "--absolute-git-dir"])?;
    let git_dir = PathBuf::from(git_dir);
    let opened_at = std::fs::canonicalize(cwd).unwrap_or_else(|_| cwd.to_path_buf());
    let common_dir = git(
        cwd,
        &["rev-parse", "--path-format=absolute", "--git-common-dir"],
    )
    .map(PathBuf::from)
    .unwrap_or_else(|| git_dir.clone());
    let bare = is_bare_repository(cwd);
    let root = if bare {
        common_dir.clone()
    } else {
        git(cwd, &["rev-parse", "--show-toplevel"]).map_or_else(|| cwd.to_path_buf(), PathBuf::from)
    };

    let config = git_config(cwd);
    let remotes = git_raw(cwd, &["remote", "-v"])
        .map(|text| parse_git_remotes(&text))
        .unwrap_or_default();
    let default_remote = resolve_default_remote(
        &remotes,
        config.get("checkout.defaultremote").map(String::as_str),
    );
    let default_branch = default_branch(cwd, default_remote.as_deref(), &config);

    let (parent_root, nested_roots, submodules, workspace) = if bare {
        (None, Vec::new(), Vec::new(), None)
    } else {
        (
            parent_repository_root(&root),
            nested_git_roots(&root),
            declared_submodules(&root),
            workspace_graph(&root, detect_monorepo_type(&root.to_string_lossy())),
        )
    };

    Some(RepositoryLayout {
        head: head_state(cwd),
        linked_worktree: common_dir != git_dir,
        shallow: is_shallow_repository(cwd),
        vcs: VersionControl::Git,
        opened_at,
        root,
        git_dir,
        common_dir,
        bare,
        remotes,
        default_remote,
        default_branch,
        parent_root,
        nested_roots,
        submodules,
        workspace,
        config: repository_config(&config),
    })
}

/// A directory that is under a version control system this product does not
/// drive, which is distinct from a directory under none.
pub fn unsupported_version_control(cwd: &Path) -> Option<(VersionControl, PathBuf)> {
    detect_version_control(cwd).filter(|(vcs, _)| !vcs.is_driven())
}

/// Start a repository in `root`. Detection never reaches this: a directory
/// under no version control stays that way until the user asks for one.
pub fn initialize_repository(root: &Path, default_branch: &str) -> Result<RepositoryLayout> {
    if default_branch.trim().is_empty() || default_branch.starts_with('-') {
        bail!("a default branch name must not be empty or start with '-'");
    }
    if let Some((vcs, existing)) = detect_version_control(root) {
        bail!(
            "{} is already under {} at {}",
            root.display(),
            vcs.label(),
            existing.display()
        );
    }
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["init", "-q", "-b", default_branch])
        .output()
        .context("run git init")?;
    if !output.status.success() {
        bail!(
            "git init failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
    }
    detect_repository_layout(root).context("read the repository git init just created")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn remote(name: &str) -> RepositoryRemote {
        RepositoryRemote::new(name, &format!("https://example.test/{name}.git"))
    }

    fn run(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .arg("-C")
            .arg(dir)
            .args(args)
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env("GIT_CONFIG_SYSTEM", "/dev/null")
            .env("GIT_AUTHOR_NAME", "t")
            .env("GIT_AUTHOR_EMAIL", "t@example.test")
            .env("GIT_COMMITTER_NAME", "t")
            .env("GIT_COMMITTER_EMAIL", "t@example.test")
            .output()
            .expect("git runs");
        assert!(
            status.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&status.stderr)
        );
    }

    fn init_repo(dir: &Path) {
        run(dir, &["init", "--initial-branch=main", "."]);
        std::fs::write(dir.join("README.md"), "seed\n").unwrap();
        run(dir, &["add", "README.md"]);
        run(dir, &["-c", "commit.gpgsign=false", "commit", "-m", "seed"]);
    }

    #[test]
    fn a_configured_default_remote_wins_over_the_origin_convention() {
        let remotes = vec![remote("origin"), remote("fork")];
        assert_eq!(
            resolve_default_remote(&remotes, Some("fork")),
            Some("fork".to_string())
        );
        assert_eq!(
            resolve_default_remote(&remotes, Some("absent")),
            Some("origin".to_string())
        );
        assert_eq!(
            resolve_default_remote(&[remote("fork")], None),
            Some("fork".to_string())
        );
        assert_eq!(
            resolve_default_remote(&[remote("upstream"), remote("fork")], None),
            Some("upstream".to_string())
        );
        assert_eq!(resolve_default_remote(&[], Some("origin")), None);
    }

    #[test]
    fn config_list_records_survive_a_newline_inside_a_value() {
        let config = parse_git_config_list("core.bare\nfalse\0alias.x\none\ntwo\0");
        assert_eq!(config.get("core.bare"), Some(&"false".to_string()));
        assert_eq!(config.get("alias.x"), Some(&"one\ntwo".to_string()));
    }

    #[test]
    fn head_states_render_distinctly() {
        assert_eq!(HeadState::Branch("main".into()).to_string(), "main");
        assert_eq!(
            HeadState::Unborn("main".into()).to_string(),
            "main (no commits yet)"
        );
        let detached = HeadState::Detached {
            commit: "1a2b3c4d5e6f".into(),
            describe: Some("v1.2.0".into()),
        };
        assert_eq!(detached.to_string(), "detached at 1a2b3c4 (v1.2.0)");
        assert!(detached.is_detached());
        assert!(detached.branch().is_none());
        let bare_sha = HeadState::Detached {
            commit: "1a2b3c4d5e6f".into(),
            describe: Some("1a2b3c4".into()),
        };
        assert_eq!(bare_sha.to_string(), "detached at 1a2b3c4");
    }

    #[test]
    fn every_remote_is_enumerated_and_one_is_resolved_as_the_default() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        run(
            dir.path(),
            &["remote", "add", "origin", "https://example.test/origin.git"],
        );
        run(
            dir.path(),
            &["remote", "add", "fork", "https://example.test/fork.git"],
        );

        let layout = detect_repository_layout(dir.path()).expect("inside a repository");

        let names: Vec<&str> = layout
            .remotes
            .iter()
            .map(|remote| remote.name.as_str())
            .collect();
        assert!(names.contains(&"origin") && names.contains(&"fork"));
        assert_eq!(layout.default_remote.as_deref(), Some("origin"));
        assert_eq!(
            layout.default_remote_url(),
            Some("https://example.test/origin.git")
        );
        assert!(!layout.bare);
        assert_eq!(layout.head.branch(), Some("main"));
    }

    #[test]
    fn a_nested_checkout_is_its_own_root_and_names_the_outer_one() {
        let dir = tempfile::tempdir().unwrap();
        let outer = dir.path().join("outer");
        std::fs::create_dir_all(&outer).unwrap();
        init_repo(&outer);
        let inner = outer.join("vendor").join("inner");
        std::fs::create_dir_all(&inner).unwrap();
        init_repo(&inner);

        let inner_layout = detect_repository_layout(&inner).expect("inner repository");
        assert_eq!(
            inner_layout.root.canonicalize().unwrap(),
            inner.canonicalize().unwrap()
        );
        assert_eq!(
            inner_layout
                .parent_root
                .as_ref()
                .map(|path| path.canonicalize().unwrap()),
            Some(outer.canonicalize().unwrap())
        );
        assert!(inner_layout.is_nested());

        let outer_layout = detect_repository_layout(&outer).expect("outer repository");
        assert!(outer_layout
            .nested_roots
            .iter()
            .any(|path| path.canonicalize().unwrap() == inner.canonicalize().unwrap()));
    }

    #[test]
    fn a_bare_repository_and_a_detached_head_are_both_reported() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source");
        std::fs::create_dir_all(&source).unwrap();
        init_repo(&source);
        let head = git(&source, &["rev-parse", "HEAD"]).unwrap();
        run(&source, &["checkout", "--detach", &head]);

        let detached = detect_repository_layout(&source).expect("source repository");
        assert!(detached.head.is_detached());
        assert!(detached.summary().contains("detached at"));

        let bare = dir.path().join("mirror.git");
        run(
            dir.path(),
            &["clone", "--bare", source.to_str().unwrap(), "mirror.git"],
        );
        let bare_layout = detect_repository_layout(&bare).expect("bare repository");
        assert!(bare_layout.bare);
        assert!(bare_layout.summary().contains("bare repository"));
        assert!(bare_layout.nested_roots.is_empty());
    }

    #[test]
    fn a_linked_worktree_keeps_the_common_dir_of_its_origin() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("source");
        std::fs::create_dir_all(&source).unwrap();
        init_repo(&source);
        let linked = dir.path().join("linked");
        run(
            &source,
            &["worktree", "add", linked.to_str().unwrap(), "-b", "side"],
        );

        let layout = detect_repository_layout(&linked).expect("linked worktree");

        assert!(layout.linked_worktree);
        assert_ne!(layout.git_dir, layout.common_dir);
        assert_eq!(layout.head.branch(), Some("side"));
        assert!(layout.summary().contains("linked worktree"));
    }

    #[test]
    fn a_workspace_graph_is_read_from_the_repository_root() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        std::fs::write(
            dir.path().join("pnpm-workspace.yaml"),
            "packages:\n  - 'packages/*'\n",
        )
        .unwrap();
        std::fs::create_dir_all(dir.path().join("packages/alpha")).unwrap();
        std::fs::write(
            dir.path().join("packages/alpha").join("package.json"),
            r#"{"name":"alpha"}"#,
        )
        .unwrap();

        let layout = detect_repository_layout(dir.path()).expect("repository");
        let workspace = layout.workspace.expect("workspace graph");

        assert_eq!(workspace.tool.as_deref(), Some("pnpm workspaces"));
        assert_eq!(workspace.patterns, vec!["packages/*".to_string()]);
        assert_eq!(workspace.members.len(), 1);
        assert_eq!(workspace.members[0].name, "alpha");
    }

    #[test]
    fn repository_config_keeps_only_the_keys_a_repository_depends_on() {
        let mut config = BTreeMap::new();
        config.insert("core.bare".to_string(), "false".to_string());
        config.insert("user.email".to_string(), "someone@example.test".to_string());

        let narrowed = repository_config(&config);

        assert_eq!(narrowed.get("core.bare"), Some(&"false".to_string()));
        assert!(!narrowed.contains_key("user.email"));
    }

    #[test]
    fn a_directory_outside_any_repository_has_no_layout() {
        let dir = tempfile::tempdir().unwrap();
        let outside = dir.path().join("plain");
        std::fs::create_dir_all(&outside).unwrap();
        if detect_repository_layout(&outside).is_some() {
            // The temp dir itself sits inside a repository on some machines.
            return;
        }
        assert!(detect_repository_layout(&outside).is_none());
    }

    #[test]
    fn every_operation_has_a_decision_and_every_refusal_says_why() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let layout = detect_repository_layout(dir.path()).expect("layout");

        for operation in RepositoryOperation::ALL.iter().copied() {
            assert!(!operation.label().is_empty(), "{operation:?} has no label");
            let availability = layout.availability(operation);
            if availability != OperationAvailability::Available {
                let reason = availability
                    .reason()
                    .unwrap_or_else(|| panic!("{operation:?} refused without a reason"));
                assert!(
                    reason.len() > 10,
                    "{operation:?} gives no usable reason: {reason:?}"
                );
            }
        }
        assert_eq!(
            layout.availability(RepositoryOperation::EditFiles),
            OperationAvailability::Available
        );
        assert_eq!(
            layout.availability(RepositoryOperation::Commit),
            OperationAvailability::Available
        );
    }

    #[test]
    fn a_bare_repository_refuses_edits_and_still_reads_its_history() {
        let dir = tempfile::tempdir().unwrap();
        let work = dir.path().join("work");
        std::fs::create_dir_all(&work).unwrap();
        init_repo(&work);
        let bare = dir.path().join("bare.git");
        run(
            dir.path(),
            &[
                "clone",
                "--bare",
                "-q",
                &work.display().to_string(),
                "bare.git",
            ],
        );

        let layout = detect_repository_layout(&bare).expect("bare layout");
        assert!(layout.bare);
        for blocked in [
            RepositoryOperation::EditFiles,
            RepositoryOperation::ReadFiles,
            RepositoryOperation::Commit,
        ] {
            let availability = layout.availability(blocked);
            assert!(
                !availability.is_available(),
                "{blocked:?} should be refused in a bare repository"
            );
            assert!(availability
                .reason()
                .expect("a reason")
                .contains("bare repository"));
        }
        assert!(layout
            .availability(RepositoryOperation::ReadHistory)
            .is_available());
    }

    #[test]
    fn a_detached_head_asks_before_committing_and_offers_a_branch_to_land_on() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        run(dir.path(), &["checkout", "--detach", "-q", "HEAD"]);

        let layout = detect_repository_layout(dir.path()).expect("layout");
        assert!(layout.head.is_detached());
        let commit = layout.availability(RepositoryOperation::Commit);
        assert!(
            matches!(commit, OperationAvailability::NeedsApproval(_)),
            "{commit:?}"
        );
        assert!(commit.reason().expect("reason").contains("detached"));
        assert_eq!(
            layout.availability(RepositoryOperation::CreateBranch),
            OperationAvailability::Available
        );
        let offer = layout.branch_offer_for_write().expect("a branch to offer");
        assert!(
            offer.contains(layout.head.short_commit().expect("short commit")),
            "{offer}"
        );
    }

    #[test]
    fn an_attached_head_is_not_offered_a_branch_it_does_not_need() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let layout = detect_repository_layout(dir.path()).expect("layout");
        assert!(layout.branch_offer_for_write().is_none());
    }

    #[test]
    fn a_shallow_clone_reads_the_history_it_has_and_asks_before_fetching_more() {
        let dir = tempfile::tempdir().unwrap();
        let origin = dir.path().join("origin");
        std::fs::create_dir_all(&origin).unwrap();
        init_repo(&origin);
        std::fs::write(origin.join("second.txt"), "two\n").unwrap();
        run(&origin, &["add", "second.txt"]);
        run(
            &origin,
            &["-c", "commit.gpgsign=false", "commit", "-m", "second"],
        );
        let shallow = dir.path().join("shallow");
        run(
            dir.path(),
            &[
                "clone",
                "-q",
                "--depth",
                "1",
                &format!("file://{}", origin.display()),
                &shallow.display().to_string(),
            ],
        );

        let layout = detect_repository_layout(&shallow).expect("shallow layout");
        assert!(layout.shallow, "{}", layout.summary());
        assert!(layout.summary().contains("shallow clone"));

        let history = layout.availability(RepositoryOperation::ReadHistory);
        assert!(history.is_available(), "{history:?}");
        assert!(matches!(history, OperationAvailability::Degraded(_)));
        assert!(history.reason().expect("reason").contains("shallow"));

        let deepen = layout.availability(RepositoryOperation::DeepenHistory);
        assert!(
            matches!(deepen, OperationAvailability::NeedsApproval(_)),
            "{deepen:?}"
        );
        assert!(deepen.reason().expect("reason").contains("network"));
    }

    #[test]
    fn a_full_clone_has_no_deeper_history_to_fetch() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let layout = detect_repository_layout(dir.path()).expect("layout");
        assert!(!layout.shallow);
        assert_eq!(
            layout.availability(RepositoryOperation::ReadHistory),
            OperationAvailability::Available
        );
        assert!(!layout
            .availability(RepositoryOperation::DeepenHistory)
            .is_available());
    }

    #[test]
    fn declared_submodules_are_detected_and_moving_one_is_never_automatic() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        assert!(!detect_repository_layout(dir.path())
            .expect("layout")
            .availability(RepositoryOperation::UpdateSubmodulePointer)
            .is_available());

        std::fs::write(
            dir.path().join(".gitmodules"),
            "[submodule \"vendor/lib\"]\n\tpath = vendor/lib\n\turl = https://example.test/lib.git\n",
        )
        .unwrap();
        let layout = detect_repository_layout(dir.path()).expect("layout");
        assert_eq!(layout.submodules, vec![PathBuf::from("vendor/lib")]);
        assert!(layout.summary().contains("1 submodule(s)"));
        let pointer = layout.availability(RepositoryOperation::UpdateSubmodulePointer);
        assert!(
            matches!(pointer, OperationAvailability::NeedsApproval(_)),
            "{pointer:?}"
        );
    }

    #[test]
    fn opening_a_subfolder_scopes_the_task_there_and_still_names_the_repository_root() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        std::fs::write(
            dir.path().join("package.json"),
            r#"{"workspaces":["packages/*"]}"#,
        )
        .unwrap();
        let member = dir.path().join("packages").join("alpha");
        std::fs::create_dir_all(&member).unwrap();
        std::fs::write(member.join("package.json"), r#"{"name":"alpha"}"#).unwrap();

        let layout = detect_repository_layout(&member).expect("layout");
        let root = std::fs::canonicalize(dir.path()).unwrap();
        assert_eq!(layout.root, root, "the repository root is still the root");
        assert!(layout.opened_below_root());
        assert_eq!(
            layout.task_scope(),
            std::fs::canonicalize(&member).unwrap().as_path()
        );
        assert_eq!(
            layout.opened_member().map(|member| member.name.as_str()),
            Some("alpha")
        );

        let at_root = detect_repository_layout(&root).expect("layout");
        assert!(!at_root.opened_below_root());
        assert_eq!(at_root.task_scope(), at_root.root.as_path());
    }

    #[test]
    fn every_version_control_system_is_recognised_and_only_git_is_driven() {
        for vcs in VersionControl::ALL.iter().copied() {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path().join("checkout");
            std::fs::create_dir_all(root.join(vcs.marker())).unwrap();
            let (found, at) = detect_version_control(&root).expect("a version control system");
            assert_eq!(found, vcs, "{} marker", vcs.label());
            assert_eq!(at, root);
            assert!(!vcs.label().is_empty());
            assert_eq!(vcs.is_driven(), vcs == VersionControl::Git);
            assert_eq!(
                unsupported_version_control(&root).is_some(),
                !vcs.is_driven()
            );
        }
    }

    #[test]
    fn detection_never_starts_a_repository_and_init_refuses_one_that_exists() {
        let dir = tempfile::tempdir().unwrap();
        let plain = dir.path().join("plain");
        std::fs::create_dir_all(&plain).unwrap();

        let _ = detect_repository_layout(&plain);
        let _ = detect_version_control(&plain);
        assert!(
            !plain.join(".git").exists(),
            "looking at a directory started a repository in it"
        );

        let layout = initialize_repository(&plain, "main").expect("an explicit init");
        assert_eq!(layout.head.branch(), Some("main"));
        assert!(plain.join(".git").exists());
        assert!(initialize_repository(&plain, "main").is_err());
        assert!(initialize_repository(&plain, "--upload-pack=x").is_err());
    }
}
