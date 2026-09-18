//! The canonical coding domain every surface speaks: one `CodeSession` per coding
//! conversation, local and cloud as `ExecutionLocation`s of the same session.

use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::developer_session::{
    DeveloperSessionSource, DeveloperSessionTrustMode, ThreadStatus, ThreadSummary, TurnFailure,
};

macro_rules! domain_id {
    ($(#[$meta:meta])* $name:ident) => {
        $(#[$meta])*
        #[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Self {
                Self(value.into())
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str(&self.0)
            }
        }

        impl From<&str> for $name {
            fn from(value: &str) -> Self {
                Self(value.to_string())
            }
        }

        impl From<String> for $name {
            fn from(value: String) -> Self {
                Self(value)
            }
        }
    };
}

domain_id!(
    /// Identity of a coding session, stable across model, provider, client and
    /// execution-location changes.
    CodeSessionId
);
domain_id!(
    /// Identity of one task inside a session.
    CodeTaskId
);
domain_id!(
    /// Identity of a repository, derived from its primary remote when it has
    /// one and from its local root when it does not.
    RepositoryId
);
domain_id!(
    /// Identity of a named permission profile.
    PermissionProfileId
);

/// Where a session or a task actually runs. Not a product boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionLocation {
    Local,
    Cloud,
}

impl ExecutionLocation {
    pub fn label(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Cloud => "cloud",
        }
    }
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

/// Strip any credential embedded in a remote URL.
///
/// A token pasted into an `https://` remote is a secret that would otherwise
/// reach session files, thread listings and tool output. An `ssh://git@host`
/// username is not a credential and survives.
pub fn redact_remote_credentials(url: &str) -> String {
    let Some(scheme_end) = url.find("://") else {
        return url.to_string();
    };
    let scheme = &url[..scheme_end];
    let rest = &url[scheme_end + 3..];
    let authority_end = rest.find('/').unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    let Some(at) = authority.rfind('@') else {
        return url.to_string();
    };
    let userinfo = &authority[..at];
    let host = &authority[at + 1..];
    let is_web = scheme.eq_ignore_ascii_case("http") || scheme.eq_ignore_ascii_case("https");
    if !is_web && !userinfo.contains(':') {
        return url.to_string();
    }
    format!("{scheme}://{host}{}", &rest[authority_end..])
}

/// One remote of a repository. A repository may have many.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryRemote {
    pub name: String,
    /// Always credential-free: [`RepositoryRemote::new`] redacts on the way in.
    pub url: String,
    pub fetch: bool,
    pub push: bool,
}

impl RepositoryRemote {
    pub fn new(name: impl Into<String>, url: &str) -> Self {
        Self {
            name: name.into(),
            url: redact_remote_credentials(url),
            fetch: true,
            push: true,
        }
    }

    pub fn fetch_only(name: impl Into<String>, url: &str) -> Self {
        Self {
            push: false,
            ..Self::new(name, url)
        }
    }
}

/// Policy attached to a repository rather than to a session, so every session
/// working in it inherits the same rules.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryPolicy {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_branch: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub protected_branches: Vec<String>,
    #[serde(default)]
    pub allow_force_push: bool,
    #[serde(default)]
    pub allow_direct_push_to_default: bool,
}

impl RepositoryPolicy {
    pub fn is_protected(&self, branch: &str) -> bool {
        if self
            .default_branch
            .as_deref()
            .is_some_and(|default| default == branch)
            && !self.allow_direct_push_to_default
        {
            return true;
        }
        self.protected_branches
            .iter()
            .any(|protected| protected == branch)
    }
}

/// A repository the product works in. `local_root` is absent for a repository
/// that exists only remotely, which is how a cloud task starts before its
/// runner has checked anything out.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub id: RepositoryId,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_root: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub remotes: Vec<RepositoryRemote>,
    #[serde(default)]
    pub policy: RepositoryPolicy,
}

impl Repository {
    pub fn local(id: impl Into<RepositoryId>, name: impl Into<String>, root: PathBuf) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            local_root: Some(root),
            remotes: Vec::new(),
            policy: RepositoryPolicy::default(),
        }
    }

    pub fn remote_only(
        id: impl Into<RepositoryId>,
        name: impl Into<String>,
        remote: RepositoryRemote,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            local_root: None,
            remotes: vec![remote],
            policy: RepositoryPolicy::default(),
        }
    }

    pub fn with_remote(mut self, remote: RepositoryRemote) -> Self {
        self.remotes.retain(|existing| existing.name != remote.name);
        self.remotes.push(remote);
        self
    }

    pub fn with_policy(mut self, policy: RepositoryPolicy) -> Self {
        self.policy = policy;
        self
    }

    pub fn is_remote_only(&self) -> bool {
        self.local_root.is_none()
    }

    pub fn remote(&self, name: &str) -> Option<&RepositoryRemote> {
        self.remotes.iter().find(|remote| remote.name == name)
    }

    /// The remote a bare `git fetch`/`git push` would reach: `origin` when it
    /// exists, otherwise the first declared remote.
    pub fn primary_remote(&self) -> Option<&RepositoryRemote> {
        self.remote("origin").or_else(|| self.remotes.first())
    }

    pub fn push_remotes(&self) -> impl Iterator<Item = &RepositoryRemote> {
        self.remotes.iter().filter(|remote| remote.push)
    }
}

// ---------------------------------------------------------------------------
// RepositorySnapshot
// ---------------------------------------------------------------------------

/// Who wrote a change. The distinction is what lets a destructive operation
/// name what the user, rather than the agent, would lose.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeAuthor {
    User,
    Agent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    Untracked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryChange {
    pub path: PathBuf,
    pub kind: ChangeKind,
    pub staged: bool,
    pub author: ChangeAuthor,
}

impl RepositoryChange {
    pub fn new(path: impl Into<PathBuf>, kind: ChangeKind, staged: bool) -> Self {
        Self {
            path: path.into(),
            kind,
            staged,
            author: ChangeAuthor::User,
        }
    }

    pub fn by(mut self, author: ChangeAuthor) -> Self {
        self.author = author;
        self
    }
}

/// What a repository held at one moment: an immutable record, not a live read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySnapshot {
    pub repository_id: RepositoryId,
    pub captured_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub head_commit: Option<String>,
    #[serde(default)]
    pub detached_head: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub changes: Vec<RepositoryChange>,
}

impl RepositorySnapshot {
    pub fn new(repository_id: impl Into<RepositoryId>, captured_at: DateTime<Utc>) -> Self {
        Self {
            repository_id: repository_id.into(),
            captured_at,
            branch: None,
            head_commit: None,
            detached_head: false,
            changes: Vec::new(),
        }
    }

    pub fn on_branch(mut self, branch: impl Into<String>) -> Self {
        self.branch = Some(branch.into());
        self
    }

    pub fn at_commit(mut self, commit: impl Into<String>) -> Self {
        self.head_commit = Some(commit.into());
        self
    }

    pub fn with_change(mut self, change: RepositoryChange) -> Self {
        self.changes.push(change);
        self
    }

    pub fn is_clean(&self) -> bool {
        self.changes.is_empty()
    }

    pub fn staged(&self) -> impl Iterator<Item = &RepositoryChange> {
        self.changes.iter().filter(|change| change.staged)
    }

    pub fn unstaged(&self) -> impl Iterator<Item = &RepositoryChange> {
        self.changes.iter().filter(|change| !change.staged)
    }

    pub fn authored_by(&self, author: ChangeAuthor) -> impl Iterator<Item = &RepositoryChange> {
        self.changes
            .iter()
            .filter(move |change| change.author == author)
    }

    /// Attribute this snapshot against the one taken when the session opened:
    /// anything already dirty then is the user's, anything new is the agent's.
    pub fn attribute_against(&mut self, baseline: &RepositorySnapshot) {
        for change in &mut self.changes {
            let pre_existing = baseline
                .changes
                .iter()
                .any(|earlier| earlier.path == change.path);
            change.author = if pre_existing {
                ChangeAuthor::User
            } else {
                ChangeAuthor::Agent
            };
        }
    }

    pub fn user_changed_paths(&self) -> Vec<&Path> {
        self.authored_by(ChangeAuthor::User)
            .map(|change| change.path.as_path())
            .collect()
    }

    /// The user-authored paths an operation over `touched` would overwrite.
    /// A caller that finds any must name them before proceeding rather than
    /// discarding them silently.
    pub fn user_changes_at_risk<'a>(&'a self, touched: &[PathBuf]) -> Vec<&'a Path> {
        self.authored_by(ChangeAuthor::User)
            .filter(|change| touched.iter().any(|path| path == &change.path))
            .map(|change| change.path.as_path())
            .collect()
    }
}

// ---------------------------------------------------------------------------
// CodeEnvironment
// ---------------------------------------------------------------------------

/// The interactive shell a session's commands run under.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

impl ShellInfo {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            path: None,
            version: None,
        }
    }

    pub fn at(mut self, path: impl Into<PathBuf>) -> Self {
        self.path = Some(path.into());
        self
    }

    pub fn versioned(mut self, version: impl Into<String>) -> Self {
        self.version = Some(version.into());
        self
    }
}

/// A binary found on the environment's path, not a binary the product hoped
/// would be there.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredBinary {
    pub name: String,
    pub path: PathBuf,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

impl DiscoveredBinary {
    pub fn new(name: impl Into<String>, path: impl Into<PathBuf>) -> Self {
        Self {
            name: name.into(),
            path: path.into(),
            version: None,
        }
    }

    pub fn versioned(mut self, version: impl Into<String>) -> Self {
        self.version = Some(version.into());
        self
    }
}

/// Whether a container is merely configured or actually running. A
/// `.devcontainer` directory answers the first question and not the second.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContainerRuntimeState {
    Configured,
    Running,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerState {
    pub kind: String,
    pub state: ContainerRuntimeState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identifier: Option<String>,
}

impl ContainerState {
    pub fn configured(kind: impl Into<String>) -> Self {
        Self {
            kind: kind.into(),
            state: ContainerRuntimeState::Configured,
            identifier: None,
        }
    }

    pub fn running(kind: impl Into<String>, identifier: impl Into<String>) -> Self {
        Self {
            kind: kind.into(),
            state: ContainerRuntimeState::Running,
            identifier: Some(identifier.into()),
        }
    }

    pub fn is_running(&self) -> bool {
        self.state == ContainerRuntimeState::Running
    }
}

/// What the environment may reach over the network. `Restricted` carries both
/// lists because a real policy has both shapes: an allow-list of the only
/// hosts a runner may reach, and a general approval that still refuses the
/// loopback interface.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "access", rename_all = "snake_case")]
pub enum NetworkCapability {
    Offline,
    Restricted {
        #[serde(default)]
        allowed_hosts: Vec<String>,
        #[serde(default)]
        denied_hosts: Vec<String>,
    },
    Full,
}

impl NetworkCapability {
    /// Everything except the named hosts.
    pub fn except(denied_hosts: Vec<String>) -> Self {
        Self::Restricted {
            allowed_hosts: Vec::new(),
            denied_hosts,
        }
    }

    /// Only the named hosts.
    pub fn only(allowed_hosts: Vec<String>) -> Self {
        Self::Restricted {
            allowed_hosts,
            denied_hosts: Vec::new(),
        }
    }

    pub fn allows(&self, host: &str) -> bool {
        match self {
            Self::Offline => false,
            Self::Full => true,
            Self::Restricted {
                allowed_hosts,
                denied_hosts,
            } => {
                if denied_hosts.iter().any(|denied| denied == host) {
                    return false;
                }
                allowed_hosts.is_empty() || allowed_hosts.iter().any(|allowed| allowed == host)
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialSource {
    Environment,
    Keychain,
    ConfigFile,
    OauthToken,
    GitCredentialHelper,
}

/// A *reference* to a credential. There is deliberately nowhere to put the
/// value: an environment is never represented as a raw `.env` dump, so a
/// session record, a thread listing and a bug report carry the fact that a
/// credential exists and never the credential.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialRef {
    pub name: String,
    pub source: CredentialSource,
    pub present: bool,
}

impl CredentialRef {
    pub fn new(name: impl Into<String>, source: CredentialSource, present: bool) -> Self {
        Self {
            name: name.into(),
            source,
            present,
        }
    }
}

/// Where code runs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeEnvironment {
    pub location: ExecutionLocation,
    pub os: String,
    pub arch: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_directory: Option<PathBuf>,
    #[serde(default)]
    pub shell: ShellInfo,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub binaries: Vec<DiscoveredBinary>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub containers: Vec<ContainerState>,
    pub network: NetworkCapability,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub credentials: Vec<CredentialRef>,
}

impl Default for CodeEnvironment {
    fn default() -> Self {
        Self {
            location: ExecutionLocation::Local,
            os: String::new(),
            arch: String::new(),
            working_directory: None,
            shell: ShellInfo::default(),
            binaries: Vec::new(),
            containers: Vec::new(),
            network: NetworkCapability::Full,
            credentials: Vec::new(),
        }
    }
}

impl CodeEnvironment {
    pub fn new(
        location: ExecutionLocation,
        os: impl Into<String>,
        arch: impl Into<String>,
    ) -> Self {
        Self {
            location,
            os: os.into(),
            arch: arch.into(),
            ..Self::default()
        }
    }

    pub fn binary(&self, name: &str) -> Option<&DiscoveredBinary> {
        self.binaries.iter().find(|binary| binary.name == name)
    }

    pub fn has_binary(&self, name: &str) -> bool {
        self.binary(name).is_some()
    }

    pub fn running_containers(&self) -> impl Iterator<Item = &ContainerState> {
        self.containers
            .iter()
            .filter(|container| container.is_running())
    }

    pub fn credential(&self, name: &str) -> Option<&CredentialRef> {
        self.credentials
            .iter()
            .find(|credential| credential.name == name)
    }

    /// Record credentials by name only. The caller passes names it read from a
    /// key store or a process environment; the values stay where they are.
    pub fn record_credential_names<I, S>(&mut self, names: I, source: CredentialSource)
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        for name in names {
            let name = name.into();
            if self.credential(&name).is_none() {
                self.credentials
                    .push(CredentialRef::new(name, source, true));
            }
        }
    }
}

// ---------------------------------------------------------------------------
// CodePermissionProfile
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionDecision {
    Allow,
    Ask,
    Deny,
}

impl PermissionDecision {
    fn strictness(self) -> u8 {
        match self {
            Self::Allow => 0,
            Self::Ask => 1,
            Self::Deny => 2,
        }
    }

    /// The stricter of the two. An admin ceiling can only narrow what a user
    /// chose, never widen it.
    pub fn capped_by(self, ceiling: Self) -> Self {
        if ceiling.strictness() > self.strictness() {
            ceiling
        } else {
            self
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Allow => "allow",
            Self::Ask => "ask",
            Self::Deny => "deny",
        }
    }
}

/// The capabilities a profile decides, one decision each. Committing and
/// pushing are separate: one is local and reversible, the other publishes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeCapabilities {
    pub file_write: PermissionDecision,
    pub shell_exec: PermissionDecision,
    pub git_commit: PermissionDecision,
    pub git_push: PermissionDecision,
    pub git_history_rewrite: PermissionDecision,
    pub git_hook_bypass: PermissionDecision,
    pub external_api_write: PermissionDecision,
    pub network_access: PermissionDecision,
}

/// One addressable capability, for display and for lookup by name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CodeCapability {
    FileWrite,
    ShellExec,
    GitCommit,
    GitPush,
    GitHistoryRewrite,
    GitHookBypass,
    ExternalApiWrite,
    NetworkAccess,
}

impl CodeCapability {
    pub const ALL: &[CodeCapability] = &[
        Self::FileWrite,
        Self::ShellExec,
        Self::GitCommit,
        Self::GitPush,
        Self::GitHistoryRewrite,
        Self::GitHookBypass,
        Self::ExternalApiWrite,
        Self::NetworkAccess,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::FileWrite => "write files",
            Self::ShellExec => "run commands",
            Self::GitCommit => "commit",
            Self::GitPush => "push",
            Self::GitHistoryRewrite => "rewrite history",
            Self::GitHookBypass => "bypass git hooks",
            Self::ExternalApiWrite => "write through external APIs",
            Self::NetworkAccess => "reach the network",
        }
    }
}

impl CodeCapabilities {
    pub fn uniform(decision: PermissionDecision) -> Self {
        Self {
            file_write: decision,
            shell_exec: decision,
            git_commit: decision,
            git_push: decision,
            git_history_rewrite: decision,
            git_hook_bypass: decision,
            external_api_write: decision,
            network_access: decision,
        }
    }

    pub fn get(&self, capability: CodeCapability) -> PermissionDecision {
        match capability {
            CodeCapability::FileWrite => self.file_write,
            CodeCapability::ShellExec => self.shell_exec,
            CodeCapability::GitCommit => self.git_commit,
            CodeCapability::GitPush => self.git_push,
            CodeCapability::GitHistoryRewrite => self.git_history_rewrite,
            CodeCapability::GitHookBypass => self.git_hook_bypass,
            CodeCapability::ExternalApiWrite => self.external_api_write,
            CodeCapability::NetworkAccess => self.network_access,
        }
    }

    pub fn set(&mut self, capability: CodeCapability, decision: PermissionDecision) {
        match capability {
            CodeCapability::FileWrite => self.file_write = decision,
            CodeCapability::ShellExec => self.shell_exec = decision,
            CodeCapability::GitCommit => self.git_commit = decision,
            CodeCapability::GitPush => self.git_push = decision,
            CodeCapability::GitHistoryRewrite => self.git_history_rewrite = decision,
            CodeCapability::GitHookBypass => self.git_hook_bypass = decision,
            CodeCapability::ExternalApiWrite => self.external_api_write = decision,
            CodeCapability::NetworkAccess => self.network_access = decision,
        }
    }

    pub fn capped_by(self, ceiling: Self) -> Self {
        let mut capped = self;
        for capability in CodeCapability::ALL {
            capped.set(
                *capability,
                self.get(*capability).capped_by(ceiling.get(*capability)),
            );
        }
        capped
    }
}

/// A ceiling set by an administrator. It narrows the user's profile and can
/// never widen it, and it names itself so a person can see why a capability
/// they chose is unavailable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminPolicyCap {
    pub source: String,
    pub capabilities: CodeCapabilities,
}

impl AdminPolicyCap {
    pub fn new(source: impl Into<String>, capabilities: CodeCapabilities) -> Self {
        Self {
            source: source.into(),
            capabilities,
        }
    }
}

/// A named set of capabilities a session runs under.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodePermissionProfile {
    pub id: PermissionProfileId,
    pub name: String,
    pub capabilities: CodeCapabilities,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub admin_cap: Option<AdminPolicyCap>,
}

impl CodePermissionProfile {
    pub fn new(
        id: impl Into<PermissionProfileId>,
        name: impl Into<String>,
        capabilities: CodeCapabilities,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            capabilities,
            admin_cap: None,
        }
    }

    /// Reads anything, writes nothing.
    pub fn read_only() -> Self {
        Self::new(
            "read-only",
            "Read only",
            CodeCapabilities::uniform(PermissionDecision::Deny),
        )
    }

    /// The default: edits and commits after a prompt, never publishes or
    /// rewrites without one, never bypasses a hook.
    pub fn standard() -> Self {
        Self::new(
            "standard",
            "Standard",
            CodeCapabilities {
                file_write: PermissionDecision::Ask,
                shell_exec: PermissionDecision::Ask,
                git_commit: PermissionDecision::Ask,
                git_push: PermissionDecision::Ask,
                git_history_rewrite: PermissionDecision::Deny,
                git_hook_bypass: PermissionDecision::Deny,
                external_api_write: PermissionDecision::Ask,
                network_access: PermissionDecision::Ask,
            },
        )
    }

    /// Everything without a prompt except the two that cannot be taken back
    /// without someone noticing.
    pub fn full_access() -> Self {
        Self::new(
            "full-access",
            "Full access",
            CodeCapabilities {
                file_write: PermissionDecision::Allow,
                shell_exec: PermissionDecision::Allow,
                git_commit: PermissionDecision::Allow,
                git_push: PermissionDecision::Ask,
                git_history_rewrite: PermissionDecision::Ask,
                git_hook_bypass: PermissionDecision::Deny,
                external_api_write: PermissionDecision::Allow,
                network_access: PermissionDecision::Allow,
            },
        )
    }

    pub fn under_admin_cap(mut self, cap: AdminPolicyCap) -> Self {
        self.admin_cap = Some(cap);
        self
    }

    /// What the session may actually do: the profile, narrowed by admin policy.
    pub fn effective(&self) -> CodeCapabilities {
        match &self.admin_cap {
            Some(cap) => self.capabilities.capped_by(cap.capabilities),
            None => self.capabilities,
        }
    }

    pub fn decision(&self, capability: CodeCapability) -> PermissionDecision {
        self.effective().get(capability)
    }

    /// True when admin policy, not the user's own choice, is what blocks this.
    pub fn capped_by_admin(&self, capability: CodeCapability) -> bool {
        self.admin_cap.as_ref().is_some_and(|cap| {
            cap.capabilities
                .get(capability)
                .capped_by(self.capabilities.get(capability))
                != self.capabilities.get(capability)
        })
    }

    /// What a session shows for its active profile.
    pub fn display_label(&self) -> String {
        match &self.admin_cap {
            Some(cap) => format!("{} (capped by {})", self.name, cap.source),
            None => self.name.clone(),
        }
    }
}

// ---------------------------------------------------------------------------
// CodeTask
// ---------------------------------------------------------------------------

/// The worktree a task works in, when it does not share the session's.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskWorktree {
    pub path: PathBuf,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    /// True when the product created the worktree for this task and may
    /// remove it when the task is done.
    #[serde(default)]
    pub created_for_task: bool,
}

impl TaskWorktree {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            branch: None,
            created_for_task: false,
        }
    }

    pub fn on_branch(mut self, branch: impl Into<String>) -> Self {
        self.branch = Some(branch.into());
        self
    }

    pub fn created_for_task(mut self) -> Self {
        self.created_for_task = true;
        self
    }
}

/// A task's lifecycle. A task fails on its own: the session that holds it, and
/// its sibling tasks, are untouched.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum CodeTaskState {
    Queued,
    Running,
    Paused,
    AwaitingInput,
    Completed,
    Cancelled,
    Failed { failure: Box<TurnFailure> },
}

impl CodeTaskState {
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Cancelled | Self::Failed { .. }
        )
    }

    pub fn is_active(&self) -> bool {
        matches!(self, Self::Queued | Self::Running | Self::Paused)
    }
}

/// One unit of work inside a session. A session holds many, in order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeTask {
    pub id: CodeTaskId,
    pub session_id: CodeSessionId,
    pub title: String,
    pub location: ExecutionLocation,
    pub state: CodeTaskState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repository_id: Option<RepositoryId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree: Option<TaskWorktree>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default)]
    pub reopened_count: u32,
}

impl CodeTask {
    pub fn new(
        id: impl Into<CodeTaskId>,
        session_id: impl Into<CodeSessionId>,
        title: impl Into<String>,
        location: ExecutionLocation,
        created_at: DateTime<Utc>,
    ) -> Self {
        Self {
            id: id.into(),
            session_id: session_id.into(),
            title: title.into(),
            location,
            state: CodeTaskState::Queued,
            repository_id: None,
            worktree: None,
            created_at,
            updated_at: created_at,
            reopened_count: 0,
        }
    }

    pub fn in_repository(mut self, repository_id: impl Into<RepositoryId>) -> Self {
        self.repository_id = Some(repository_id.into());
        self
    }

    pub fn in_worktree(mut self, worktree: TaskWorktree) -> Self {
        self.worktree = Some(worktree);
        self
    }

    pub fn transition(&mut self, state: CodeTaskState, at: DateTime<Utc>) {
        self.state = state;
        self.updated_at = at;
    }

    pub fn fail(&mut self, failure: TurnFailure, at: DateTime<Utc>) {
        self.transition(
            CodeTaskState::Failed {
                failure: Box::new(failure),
            },
            at,
        );
    }

    pub fn failure(&self) -> Option<&TurnFailure> {
        match &self.state {
            CodeTaskState::Failed { failure } => Some(failure),
            _ => None,
        }
    }

    /// Put a finished task back to work. Returns false for a task that never
    /// finished, which needs no reopening.
    pub fn reopen(&mut self, at: DateTime<Utc>) -> bool {
        if !self.state.is_terminal() {
            return false;
        }
        self.reopened_count += 1;
        self.transition(CodeTaskState::Queued, at);
        true
    }
}

// ---------------------------------------------------------------------------
// CodeSession
// ---------------------------------------------------------------------------

/// The client currently attached to a session. A session runs without one:
/// closing the editor or losing the connection detaches the client and leaves
/// every task exactly as it was.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionClient {
    pub name: String,
    pub source: DeveloperSessionSource,
    pub attached_at: DateTime<Utc>,
}

/// The canonical coding session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeSession {
    pub id: CodeSessionId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub source: DeveloperSessionSource,
    pub trust_mode: DeveloperSessionTrustMode,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primary_repository_id: Option<RepositoryId>,
    pub environment: CodeEnvironment,
    pub permission_profile_id: PermissionProfileId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub git: Option<RepositorySnapshot>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tasks: Vec<CodeTask>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client: Option<SessionClient>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<DateTime<Utc>>,
}

impl CodeSession {
    pub fn new(
        id: impl Into<CodeSessionId>,
        source: DeveloperSessionSource,
        trust_mode: DeveloperSessionTrustMode,
        created_at: DateTime<Utc>,
    ) -> Self {
        Self {
            id: id.into(),
            title: None,
            source,
            trust_mode,
            created_at,
            updated_at: created_at,
            primary_repository_id: None,
            environment: CodeEnvironment::default(),
            permission_profile_id: CodePermissionProfile::standard().id,
            git: None,
            tasks: Vec::new(),
            model: None,
            provider: None,
            client: None,
            archived_at: None,
        }
    }

    pub fn in_repository(mut self, repository_id: impl Into<RepositoryId>) -> Self {
        self.primary_repository_id = Some(repository_id.into());
        self
    }

    pub fn with_environment(mut self, environment: CodeEnvironment) -> Self {
        self.environment = environment;
        self
    }

    pub fn under_profile(mut self, profile_id: impl Into<PermissionProfileId>) -> Self {
        self.permission_profile_id = profile_id.into();
        self
    }

    pub fn with_git(mut self, snapshot: RepositorySnapshot) -> Self {
        self.git = Some(snapshot);
        self
    }

    pub fn task(&self, id: &CodeTaskId) -> Option<&CodeTask> {
        self.tasks.iter().find(|task| &task.id == id)
    }

    pub fn task_mut(&mut self, id: &CodeTaskId) -> Option<&mut CodeTask> {
        self.tasks.iter_mut().find(|task| &task.id == id)
    }

    pub fn push_task(&mut self, task: CodeTask) {
        self.updated_at = task.updated_at.max(self.updated_at);
        self.tasks.push(task);
    }

    pub fn active_tasks(&self) -> impl Iterator<Item = &CodeTask> {
        self.tasks.iter().filter(|task| task.state.is_active())
    }

    pub fn failed_tasks(&self) -> impl Iterator<Item = &CodeTask> {
        self.tasks
            .iter()
            .filter(|task| matches!(task.state, CodeTaskState::Failed { .. }))
    }

    /// Point the session at a different model or provider. The session, its
    /// tasks and its history are the same session afterwards.
    pub fn retarget(&mut self, model: Option<String>, provider: Option<String>, at: DateTime<Utc>) {
        self.model = model;
        self.provider = provider;
        self.updated_at = at;
    }

    pub fn attach_client(&mut self, client: SessionClient) {
        self.updated_at = client.attached_at.max(self.updated_at);
        self.client = Some(client);
    }

    /// Detach the client that was driving the session. Task state is not the
    /// client's to change, so nothing else moves.
    pub fn detach_client(&mut self) {
        self.client = None;
    }

    pub fn status(&self) -> ThreadStatus {
        if self.archived_at.is_some() {
            return ThreadStatus::Archived;
        }
        if self
            .tasks
            .iter()
            .any(|task| task.state == CodeTaskState::AwaitingInput)
        {
            return ThreadStatus::AwaitingApproval;
        }
        if self.active_tasks().next().is_some() {
            return ThreadStatus::Running;
        }
        if self.failed_tasks().next().is_some() {
            return ThreadStatus::Failed;
        }
        ThreadStatus::Idle
    }

    /// Project the session onto the developer-session wire type every client
    /// already speaks, so the CLI and the app server serve one shape.
    pub fn to_thread_summary(&self, repository: Option<&Repository>) -> ThreadSummary {
        ThreadSummary {
            id: self.id.as_str().to_string(),
            title: self.title.clone().unwrap_or_default(),
            model: self.model.clone(),
            cwd: self
                .environment
                .working_directory
                .as_ref()
                .map(|path| path.display().to_string()),
            provider: self.provider.clone(),
            trust_mode: self.trust_mode,
            created_at: self.created_at.to_rfc3339(),
            updated_at: self.updated_at.to_rfc3339(),
            created_by: self.source,
            status: self.status(),
            git_branch: self
                .git
                .as_ref()
                .and_then(|snapshot| snapshot.branch.clone()),
            worktree_root: repository
                .and_then(|repository| repository.local_root.as_ref())
                .map(|path| path.display().to_string()),
            client: self.client.as_ref().map(|client| client.name.clone()),
            repository: repository
                .and_then(Repository::primary_remote)
                .map(|remote| remote.url.clone()),
            writer: None,
        }
    }

    /// Read a listing entry back as a session. Timestamps a peer sent are
    /// parsed, never guessed.
    pub fn from_thread_summary(summary: &ThreadSummary) -> Result<Self, chrono::ParseError> {
        let created_at = DateTime::parse_from_rfc3339(&summary.created_at)?.with_timezone(&Utc);
        let updated_at = DateTime::parse_from_rfc3339(&summary.updated_at)?.with_timezone(&Utc);
        let repository_id = summary
            .repository
            .as_deref()
            .map(|remote| RepositoryId::new(redact_remote_credentials(remote)));
        let mut session = Self::new(
            summary.id.as_str(),
            summary.created_by,
            summary.trust_mode,
            created_at,
        );
        session.updated_at = updated_at;
        session.title = (!summary.title.is_empty()).then(|| summary.title.clone());
        session.model = summary.model.clone();
        session.provider = summary.provider.clone();
        session.primary_repository_id = repository_id.clone();
        session.environment.working_directory = summary.cwd.as_deref().map(PathBuf::from);
        session.archived_at = (summary.status == ThreadStatus::Archived).then_some(updated_at);
        session.client = summary.client.as_ref().map(|name| SessionClient {
            name: name.clone(),
            source: summary.created_by,
            attached_at: updated_at,
        });
        if let Some(branch) = summary.git_branch.clone() {
            let id = repository_id.unwrap_or_else(|| RepositoryId::new(summary.id.as_str()));
            session.git = Some(RepositorySnapshot::new(id, updated_at).on_branch(branch));
        }
        Ok(session)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::developer_session::TurnFailureCode;

    fn at(seconds: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(1_700_000_000 + seconds, 0).expect("valid timestamp")
    }

    fn environment() -> CodeEnvironment {
        let mut environment = CodeEnvironment::new(ExecutionLocation::Local, "macos", "aarch64");
        environment.working_directory = Some(PathBuf::from("/work/repo"));
        environment.shell = ShellInfo::new("zsh").at("/bin/zsh").versioned("5.9");
        environment
            .binaries
            .push(DiscoveredBinary::new("git", "/usr/bin/git").versioned("2.43.0"));
        environment
            .containers
            .push(ContainerState::running("devcontainer", "abc123"));
        environment.network = NetworkCapability::only(vec!["github.com".to_string()]);
        environment.record_credential_names(["GITHUB_TOKEN"], CredentialSource::Keychain);
        environment
    }

    fn session() -> CodeSession {
        CodeSession::new(
            "s-1",
            DeveloperSessionSource::Cli,
            DeveloperSessionTrustMode::Byok,
            at(0),
        )
        .in_repository("github.com/acme/widgets")
        .with_environment(environment())
        .with_git(
            RepositorySnapshot::new("github.com/acme/widgets", at(1))
                .on_branch("main")
                .at_commit("deadbeef")
                .with_change(RepositoryChange::new(
                    "src/main.rs",
                    ChangeKind::Modified,
                    true,
                )),
        )
    }

    #[test]
    fn every_domain_type_round_trips_through_serde() {
        let mut session = session();
        session.push_task(
            CodeTask::new(
                "t-1",
                "s-1",
                "Fix the parser",
                ExecutionLocation::Cloud,
                at(2),
            )
            .in_repository("github.com/acme/widgets")
            .in_worktree(
                TaskWorktree::new("/work/wt-1")
                    .on_branch("task/parser")
                    .created_for_task(),
            ),
        );
        session.attach_client(SessionClient {
            name: "agi-vscode".to_string(),
            source: DeveloperSessionSource::Vscode,
            attached_at: at(2),
        });

        let repository = Repository::local(
            "github.com/acme/widgets",
            "widgets",
            PathBuf::from("/work/repo"),
        )
        .with_remote(RepositoryRemote::new(
            "origin",
            "https://github.com/acme/widgets.git",
        ))
        .with_policy(RepositoryPolicy {
            default_branch: Some("main".to_string()),
            protected_branches: vec!["release".to_string()],
            allow_force_push: false,
            allow_direct_push_to_default: false,
        });
        let profile = CodePermissionProfile::standard().under_admin_cap(AdminPolicyCap::new(
            "org policy",
            CodeCapabilities::uniform(PermissionDecision::Ask),
        ));

        for (label, json) in [
            ("session", serde_json::to_string(&session).unwrap()),
            ("task", serde_json::to_string(&session.tasks[0]).unwrap()),
            ("repository", serde_json::to_string(&repository).unwrap()),
            (
                "snapshot",
                serde_json::to_string(session.git.as_ref().unwrap()).unwrap(),
            ),
            (
                "environment",
                serde_json::to_string(&session.environment).unwrap(),
            ),
            ("profile", serde_json::to_string(&profile).unwrap()),
        ] {
            assert!(!json.is_empty(), "{label} serialized empty");
        }

        assert_eq!(
            serde_json::from_str::<CodeSession>(&serde_json::to_string(&session).unwrap()).unwrap(),
            session
        );
        assert_eq!(
            serde_json::from_str::<CodeTask>(&serde_json::to_string(&session.tasks[0]).unwrap())
                .unwrap(),
            session.tasks[0]
        );
        assert_eq!(
            serde_json::from_str::<Repository>(&serde_json::to_string(&repository).unwrap())
                .unwrap(),
            repository
        );
        assert_eq!(
            serde_json::from_str::<RepositorySnapshot>(
                &serde_json::to_string(session.git.as_ref().unwrap()).unwrap()
            )
            .unwrap(),
            *session.git.as_ref().unwrap()
        );
        assert_eq!(
            serde_json::from_str::<CodeEnvironment>(
                &serde_json::to_string(&session.environment).unwrap()
            )
            .unwrap(),
            session.environment
        );
        assert_eq!(
            serde_json::from_str::<CodePermissionProfile>(
                &serde_json::to_string(&profile).unwrap()
            )
            .unwrap(),
            profile
        );
    }

    #[test]
    fn a_session_survives_a_model_and_provider_change() {
        let mut session = session();
        session.push_task(CodeTask::new(
            "t-1",
            "s-1",
            "Fix the parser",
            ExecutionLocation::Local,
            at(2),
        ));
        let before = session.id.clone();

        session.retarget(
            Some("other-model".to_string()),
            Some("other-provider".to_string()),
            at(3),
        );

        assert_eq!(session.id, before);
        assert_eq!(session.tasks.len(), 1);
        assert_eq!(
            session.git.as_ref().unwrap().branch.as_deref(),
            Some("main")
        );
    }

    #[test]
    fn a_cloud_task_keeps_running_when_its_client_goes_away() {
        let mut session = session();
        let mut task = CodeTask::new("t-1", "s-1", "Long build", ExecutionLocation::Cloud, at(2));
        task.transition(CodeTaskState::Running, at(2));
        session.push_task(task);
        session.attach_client(SessionClient {
            name: "agi-vscode".to_string(),
            source: DeveloperSessionSource::Vscode,
            attached_at: at(2),
        });

        session.detach_client();

        assert!(session.client.is_none());
        assert_eq!(session.tasks[0].state, CodeTaskState::Running);
        assert_eq!(session.status(), ThreadStatus::Running);
    }

    #[test]
    fn a_task_fails_and_reopens_without_ending_its_session() {
        let mut session = session();
        session.push_task(CodeTask::new(
            "t-1",
            "s-1",
            "Fails",
            ExecutionLocation::Local,
            at(2),
        ));
        session.push_task(CodeTask::new(
            "t-2",
            "s-1",
            "Keeps going",
            ExecutionLocation::Local,
            at(2),
        ));
        let failing = CodeTaskId::new("t-1");

        session.task_mut(&failing).unwrap().fail(
            TurnFailure::new(TurnFailureCode::Network, "the request never left"),
            at(3),
        );

        assert_eq!(
            session.task(&failing).unwrap().failure().unwrap().code,
            TurnFailureCode::Network
        );
        assert_eq!(session.tasks[1].state, CodeTaskState::Queued);
        assert_eq!(session.status(), ThreadStatus::Running);

        assert!(session.task_mut(&failing).unwrap().reopen(at(4)));
        assert_eq!(session.task(&failing).unwrap().state, CodeTaskState::Queued);
        assert_eq!(session.task(&failing).unwrap().reopened_count, 1);
        assert!(!session.task_mut(&failing).unwrap().reopen(at(5)));
    }

    #[test]
    fn a_repository_holds_many_remotes_and_can_be_remote_only() {
        let repository = Repository::local("r", "widgets", PathBuf::from("/work/repo"))
            .with_remote(RepositoryRemote::new(
                "origin",
                "https://github.com/acme/widgets.git",
            ))
            .with_remote(RepositoryRemote::fetch_only(
                "upstream",
                "https://github.com/upstream/widgets.git",
            ));

        assert_eq!(repository.remotes.len(), 2);
        assert_eq!(repository.primary_remote().unwrap().name, "origin");
        assert_eq!(repository.push_remotes().count(), 1);
        assert!(!repository.is_remote_only());

        let cloud = Repository::remote_only(
            "r",
            "widgets",
            RepositoryRemote::new("origin", "https://github.com/acme/widgets.git"),
        );
        assert!(cloud.is_remote_only());
    }

    #[test]
    fn a_remote_url_never_carries_its_credential() {
        assert_eq!(
            redact_remote_credentials("https://user:ghp_secret@github.com/acme/widgets.git"),
            "https://github.com/acme/widgets.git"
        );
        assert_eq!(
            redact_remote_credentials("https://ghp_secret@github.com/acme/widgets.git"),
            "https://github.com/acme/widgets.git"
        );
        assert_eq!(
            redact_remote_credentials("ssh://git@github.com/acme/widgets.git"),
            "ssh://git@github.com/acme/widgets.git"
        );
        assert_eq!(
            redact_remote_credentials("git@github.com:acme/widgets.git"),
            "git@github.com:acme/widgets.git"
        );

        let remote = RepositoryRemote::new("origin", "https://user:ghp_secret@github.com/a/b.git");
        assert!(
            !serde_json::to_string(&remote)
                .unwrap()
                .contains("ghp_secret")
        );
    }

    #[test]
    fn repository_policy_protects_the_default_branch() {
        let policy = RepositoryPolicy {
            default_branch: Some("main".to_string()),
            protected_branches: vec!["release".to_string()],
            allow_force_push: false,
            allow_direct_push_to_default: false,
        };

        assert!(policy.is_protected("main"));
        assert!(policy.is_protected("release"));
        assert!(!policy.is_protected("feature/x"));
    }

    #[test]
    fn a_snapshot_tells_the_users_changes_from_the_agents() {
        let baseline = RepositorySnapshot::new("r", at(0))
            .on_branch("main")
            .with_change(RepositoryChange::new(
                "src/user.rs",
                ChangeKind::Modified,
                false,
            ));
        let mut later = RepositorySnapshot::new("r", at(10))
            .on_branch("main")
            .with_change(RepositoryChange::new(
                "src/user.rs",
                ChangeKind::Modified,
                false,
            ))
            .with_change(RepositoryChange::new(
                "src/agent.rs",
                ChangeKind::Added,
                true,
            ));

        later.attribute_against(&baseline);

        assert_eq!(
            later.user_changed_paths(),
            vec![Path::new("src/user.rs")],
            "a file the user had already touched stays theirs"
        );
        assert_eq!(later.authored_by(ChangeAuthor::Agent).count(), 1);
        assert_eq!(later.staged().count(), 1);
        assert_eq!(later.unstaged().count(), 1);
        assert!(!later.is_clean());

        let at_risk = later
            .user_changes_at_risk(&[PathBuf::from("src/user.rs"), PathBuf::from("src/agent.rs")]);
        assert_eq!(at_risk, vec![Path::new("src/user.rs")]);
    }

    #[test]
    fn an_environment_records_credentials_by_name_and_never_by_value() {
        let mut environment = environment();
        environment.record_credential_names(
            ["ANTHROPIC_API_KEY", "GITHUB_TOKEN"],
            CredentialSource::Environment,
        );

        let json = serde_json::to_string(&environment).unwrap();
        assert!(json.contains("ANTHROPIC_API_KEY"));
        assert!(environment.credential("GITHUB_TOKEN").unwrap().present);
        assert_eq!(
            environment.credential("GITHUB_TOKEN").unwrap().source,
            CredentialSource::Keychain,
            "the first source recorded for a name is not overwritten"
        );
        assert_eq!(environment.credentials.len(), 2);

        assert!(environment.has_binary("git"));
        assert_eq!(
            environment.binary("git").unwrap().version.as_deref(),
            Some("2.43.0")
        );
        assert_eq!(environment.running_containers().count(), 1);
        assert_eq!(environment.shell.version.as_deref(), Some("5.9"));
        assert!(environment.network.allows("github.com"));
        assert!(!environment.network.allows("evil.test"));

        let general = NetworkCapability::except(vec!["127.0.0.1".to_string()]);
        assert!(general.allows("github.com"));
        assert!(!general.allows("127.0.0.1"));
        assert!(!NetworkCapability::Offline.allows("github.com"));
    }

    #[test]
    fn commit_and_push_are_decided_separately() {
        let profile = CodePermissionProfile::full_access();

        assert_eq!(
            profile.decision(CodeCapability::GitCommit),
            PermissionDecision::Allow
        );
        assert_eq!(
            profile.decision(CodeCapability::GitPush),
            PermissionDecision::Ask
        );
        assert_eq!(
            profile.decision(CodeCapability::GitHookBypass),
            PermissionDecision::Deny
        );
        assert_eq!(
            profile.decision(CodeCapability::ExternalApiWrite),
            PermissionDecision::Allow
        );
    }

    #[test]
    fn admin_policy_only_narrows_what_the_user_chose() {
        let profile = CodePermissionProfile::full_access().under_admin_cap(AdminPolicyCap::new(
            "org policy",
            CodeCapabilities {
                git_push: PermissionDecision::Deny,
                external_api_write: PermissionDecision::Allow,
                ..CodeCapabilities::uniform(PermissionDecision::Allow)
            },
        ));

        assert_eq!(
            profile.decision(CodeCapability::GitPush),
            PermissionDecision::Deny
        );
        assert!(profile.capped_by_admin(CodeCapability::GitPush));
        assert_eq!(
            profile.decision(CodeCapability::GitHookBypass),
            PermissionDecision::Deny,
            "a permissive ceiling cannot widen a denied capability"
        );
        assert!(!profile.capped_by_admin(CodeCapability::GitHookBypass));
        assert_eq!(
            profile.display_label(),
            "Full access (capped by org policy)"
        );
        assert_eq!(
            CodePermissionProfile::read_only().display_label(),
            "Read only"
        );
    }

    #[test]
    fn a_session_projects_onto_the_thread_summary_clients_already_read() {
        let mut session = session();
        session.title = Some("Parser work".to_string());
        session.model = Some("fixture-session-model".to_string());
        session.provider = Some("fixture-provider".to_string());
        let mut task = CodeTask::new("t-1", "s-1", "Work", ExecutionLocation::Local, at(2));
        task.transition(CodeTaskState::Running, at(2));
        session.push_task(task);
        let repository = Repository::local(
            "github.com/acme/widgets",
            "widgets",
            PathBuf::from("/work/repo"),
        )
        .with_remote(RepositoryRemote::new(
            "origin",
            "https://ghp_secret@github.com/acme/widgets.git",
        ));

        let summary = session.to_thread_summary(Some(&repository));

        assert_eq!(summary.id, "s-1");
        assert_eq!(summary.title, "Parser work");
        assert_eq!(summary.status, ThreadStatus::Running);
        assert_eq!(summary.git_branch.as_deref(), Some("main"));
        assert_eq!(summary.cwd.as_deref(), Some("/work/repo"));
        assert_eq!(
            summary.repository.as_deref(),
            Some("https://github.com/acme/widgets.git")
        );
        assert_eq!(summary.worktree_root.as_deref(), Some("/work/repo"));

        let read_back = CodeSession::from_thread_summary(&summary).unwrap();
        assert_eq!(read_back.id, session.id);
        assert_eq!(read_back.title, session.title);
        assert_eq!(read_back.model, session.model);
        assert_eq!(read_back.trust_mode, session.trust_mode);
        assert_eq!(
            read_back.git.as_ref().unwrap().branch.as_deref(),
            Some("main")
        );
        assert_eq!(read_back.created_at, session.created_at);
    }

    #[test]
    fn an_archived_session_reports_archived_over_its_tasks() {
        let mut session = session();
        session.push_task(CodeTask::new(
            "t-1",
            "s-1",
            "Work",
            ExecutionLocation::Local,
            at(2),
        ));
        session.archived_at = Some(at(9));

        assert_eq!(session.status(), ThreadStatus::Archived);
    }
}
