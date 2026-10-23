//! Workspace trust: who granted it, on which machine, and what an untrusted
//! workspace is not allowed to do.

pub mod identity;

use anyhow::{bail, Context, Result};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};
use std::time::SystemTime;

pub use identity::{workspace_identity, IdentityKind, WorkspaceIdentity};

use crate::config::CliConfig;
use crate::project_registry::ProjectRegistry;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrustState {
    Trusted,
    Untrusted,
    /// No decision on record for this account and machine.
    Ask,
}

impl TrustState {
    pub fn label(self) -> &'static str {
        match self {
            Self::Trusted => "trusted",
            Self::Untrusted => "untrusted",
            Self::Ask => "ask",
        }
    }

    pub fn is_trusted(self) -> bool {
        matches!(self, Self::Trusted)
    }
}

/// What the current trust state permits. Each field is checked at the point
/// that capability is used, so a state change takes effect on the next call.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrustRestrictions {
    /// Start locally configured MCP servers on session start.
    pub mcp_autostart: bool,
    /// Run shell commands without a per-call trust prompt, and outside the
    /// sandbox when the user asked for that.
    pub unrestricted_shell: bool,
    /// Let a command reach the network from inside the sandbox.
    pub unrestricted_network: bool,
    /// Pass this machine's environment, including credentials, to a command.
    pub secret_injection: bool,
    /// Read repository-controlled configuration and policy as the user's own.
    pub repository_config: bool,
}

impl TrustRestrictions {
    pub const TRUSTED: Self = Self {
        mcp_autostart: true,
        unrestricted_shell: true,
        unrestricted_network: true,
        secret_injection: true,
        repository_config: true,
    };

    pub const RESTRICTED: Self = Self {
        mcp_autostart: false,
        unrestricted_shell: false,
        unrestricted_network: false,
        secret_injection: false,
        repository_config: false,
    };

    pub fn for_state(state: TrustState) -> Self {
        if state.is_trusted() {
            Self::TRUSTED
        } else {
            Self::RESTRICTED
        }
    }

    /// The restrictions in force, named the way the user sees them.
    pub fn withheld(&self) -> Vec<&'static str> {
        let mut withheld = Vec::new();
        if !self.mcp_autostart {
            withheld.push("local MCP servers do not auto-start");
        }
        if !self.unrestricted_shell {
            withheld.push("shell commands need approval and stay sandboxed");
        }
        if !self.unrestricted_network {
            withheld.push("commands have no network access");
        }
        if !self.secret_injection {
            withheld.push("commands run with a scrubbed environment");
        }
        if !self.repository_config {
            withheld.push("repository config and policy are not applied");
        }
        withheld
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrustGrantSource {
    Registry,
    NativeHostProcess,
}

#[derive(Debug, Clone)]
pub struct TrustStatus {
    pub root: PathBuf,
    pub identity: WorkspaceIdentity,
    pub state: TrustState,
    pub grant_source: Option<TrustGrantSource>,
    pub granted_by: Option<String>,
    pub granted_on: Option<String>,
    pub granted_at: Option<String>,
    pub revoked_at: Option<String>,
    /// Why this workspace is not trusted, when it is not.
    pub reason: Option<String>,
    /// Whether the grant was made in this checkout, or in one sharing its git
    /// directory, so the repository configuration it covers is the one here.
    pub grant_covers_checkout: bool,
}

impl TrustStatus {
    /// A grant keyed by the remote also matches a clone at another path,
    /// including one a sandboxed command made, whose configuration the user
    /// never saw; there the repository's configuration stays untrusted.
    pub fn restrictions(&self) -> TrustRestrictions {
        let mut restrictions = TrustRestrictions::for_state(self.state);
        restrictions.repository_config &= self.grant_covers_checkout;
        if self.grant_source == Some(TrustGrantSource::NativeHostProcess) {
            restrictions.mcp_autostart &= self.grant_covers_checkout;
        }
        restrictions
    }

    /// What a successful grant prints, safe to write to a terminal.
    pub fn granted_message(&self) -> String {
        crate::terminal_text::sanitize_terminal_text(&format!(
            "Trusted {}\n{}",
            self.identity.describe(),
            self.render()
        ))
        .into_owned()
    }

    pub fn render(&self) -> String {
        let mut lines = vec![
            format!("Workspace: {}", self.root.display()),
            format!("Identity:  {}", self.identity.describe()),
            format!("Trust:     {}", self.state.label()),
        ];
        if let (Some(actor), Some(machine)) = (&self.granted_by, &self.granted_on) {
            lines.push(format!("Granted:   {actor} on {machine}"));
        }
        if let Some(at) = &self.granted_at {
            lines.push(format!("Granted at: {at}"));
        }
        if let Some(at) = &self.revoked_at {
            lines.push(format!("Revoked at: {at}"));
        }
        if self.grant_source == Some(TrustGrantSource::NativeHostProcess) {
            lines.push("Consent: native host, for this app-server process only".to_string());
        }
        if let Some(reason) = &self.reason {
            lines.push(format!("Reason:    {reason}"));
        }
        let restrictions = self.restrictions();
        if !self.state.is_trusted() {
            lines.push("Restricted:".to_string());
            for item in restrictions.withheld() {
                lines.push(format!("  - {item}"));
            }
        }
        lines.join("\n")
    }
}

fn restricted(root: PathBuf, identity: WorkspaceIdentity, reason: &str) -> TrustStatus {
    TrustStatus {
        root,
        identity,
        state: TrustState::Ask,
        grant_source: None,
        granted_by: None,
        granted_on: None,
        granted_at: None,
        revoked_at: None,
        reason: Some(reason.to_string()),
        grant_covers_checkout: false,
    }
}

/// Whether a trusted grant for `identity` was made at `scope`, or in a
/// checkout whose git directory `scope` shares, where the repository
/// configuration is the same file.
fn grant_covers_checkout(
    registry: &ProjectRegistry,
    identity: &WorkspaceIdentity,
    scope: &Path,
) -> bool {
    if identity.kind == IdentityKind::Path {
        return true;
    }
    let resolved = |path: &Path| path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let granted = registry.trusted_paths(&identity.key);
    let here = resolved(scope);
    if granted.iter().any(|path| resolved(path) == here) {
        return true;
    }
    let common_dir = |path: &Path| {
        crate::repo::detect_repository_layout(path).map(|layout| resolved(&layout.common_dir))
    };
    let Some(here) = common_dir(scope) else {
        return false;
    };
    granted
        .iter()
        .any(|path| common_dir(path).as_deref() == Some(here.as_path()))
}

/// Resolve the trust state a registry records for one workspace root.
pub fn status_from_registry(
    registry: &ProjectRegistry,
    root: &Path,
    actor: &str,
    machine: &str,
) -> TrustStatus {
    let scope = crate::project_scope::resolve_project_scope(root);
    let identity = identity::workspace_identity(&scope);
    let Some(entry) = registry.entry_for(&scope, &identity.key) else {
        return restricted(
            scope,
            identity,
            "no trust decision is on record for this workspace",
        );
    };
    let state = match entry.trust_level.as_str() {
        "trusted" => TrustState::Trusted,
        "untrusted" => TrustState::Untrusted,
        _ => TrustState::Ask,
    };
    let mut status = TrustStatus {
        root: scope,
        identity,
        state,
        grant_source: Some(TrustGrantSource::Registry),
        granted_by: entry.trusted_by.clone(),
        granted_on: entry.trusted_on.clone(),
        granted_at: entry.trusted_at.clone(),
        revoked_at: entry.revoked_at.clone(),
        reason: None,
        grant_covers_checkout: false,
    };
    if status.state.is_trusted() {
        // A grant carries who made it and where. A grant that travelled to
        // another account or machine (a synced home directory, a shared image)
        // is not this account's decision, so it does not carry trust with it.
        if let Some(granted_by) = status.granted_by.as_deref() {
            if granted_by != actor {
                status.state = TrustState::Ask;
                status.reason = Some(format!(
                    "granted by {granted_by}, not by the current account"
                ));
                return status;
            }
        }
        if let Some(granted_on) = status.granted_on.as_deref() {
            if granted_on != machine {
                status.state = TrustState::Ask;
                status.reason = Some("granted on another machine".to_string());
                return status;
            }
        }
    }
    if status.state == TrustState::Untrusted && status.revoked_at.is_some() {
        status.reason = Some("trust was revoked for this repository".to_string());
    }
    if status.state.is_trusted() {
        status.grant_covers_checkout = entry.identity.is_none()
            || grant_covers_checkout(registry, &status.identity, &status.root);
        if !status.grant_covers_checkout {
            status.state = TrustState::Ask;
            status.reason = Some(format!(
                "trust was granted to another checkout of {}, not this folder",
                status.identity.describe()
            ));
        }
    }
    status
}

struct Cached {
    stamp: Option<SystemTime>,
    status: TrustStatus,
}

/// Keyed by the root the caller passed, not by the resolved scope: resolving it
/// shells out to git, and this sits on the per-tool-call path where the cwd and
/// the workspace root alternate.
fn cache() -> &'static RwLock<HashMap<PathBuf, Cached>> {
    static CACHE: OnceLock<RwLock<HashMap<PathBuf, Cached>>> = OnceLock::new();
    CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

/// Drop the cached decisions so the next check re-reads the registry.
pub fn invalidate() {
    if let Ok(mut cached) = cache().write() {
        cached.clear();
    }
}

fn registry_stamp(config_dir: &Path) -> Option<SystemTime> {
    std::fs::metadata(config_dir.join("projects.json"))
        .and_then(|meta| meta.modified())
        .ok()
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TrustDecision {
    level: String,
    actor: Option<String>,
    machine: Option<String>,
    granted_at: Option<String>,
    revoked_at: Option<String>,
}

fn registry_decision(
    registry: &ProjectRegistry,
    scope: &Path,
    identity: &WorkspaceIdentity,
) -> Option<TrustDecision> {
    registry
        .entry_for(scope, &identity.key)
        .map(|entry| TrustDecision {
            level: entry.trust_level.clone(),
            actor: entry.trusted_by.clone(),
            machine: entry.trusted_on.clone(),
            granted_at: entry.trusted_at.clone(),
            revoked_at: entry.revoked_at.clone(),
        })
}

#[derive(Debug, Clone)]
struct ProcessTrustGrant {
    root: PathBuf,
    identity: WorkspaceIdentity,
    actor: String,
    machine: String,
    granted_at: String,
    registry_stamp: Option<SystemTime>,
    decision: Option<TrustDecision>,
}

impl ProcessTrustGrant {
    fn new(root: PathBuf, registry: &ProjectRegistry, stamp: Option<SystemTime>) -> Self {
        let scope = crate::project_scope::resolve_project_scope(&root);
        let identity = identity::workspace_identity(&scope);
        Self {
            decision: registry_decision(registry, &scope, &identity),
            root,
            identity,
            actor: identity::current_actor(),
            machine: identity::current_machine(),
            granted_at: chrono::Utc::now().to_rfc3339(),
            registry_stamp: stamp,
        }
    }

    fn status(
        &self,
        root: &Path,
        actor: &str,
        machine: &str,
        grants_allowed: bool,
        changed_decision: Option<Option<TrustDecision>>,
    ) -> Option<TrustStatus> {
        let root = root.canonicalize().ok()?;
        if !root.starts_with(&self.root) {
            return None;
        }
        let scope = crate::project_scope::resolve_project_scope(&root);
        let current_identity =
            identity::workspace_identity(&crate::project_scope::resolve_project_scope(&self.root));
        let reason = if !grants_allowed {
            Some("managed policy no longer allows workspace consent")
        } else if actor != self.actor || machine != self.machine {
            Some("native workspace consent belongs to another account or machine")
        } else if current_identity != self.identity {
            Some("the workspace identity changed after native consent")
        } else if changed_decision.is_some_and(|decision| {
            decision != self.decision
                && decision.as_ref().is_none_or(|decision| {
                    decision.level == "untrusted" && decision.revoked_at.is_some()
                })
        }) {
            Some("workspace trust was withdrawn after native consent")
        } else {
            None
        };
        Some(TrustStatus {
            root: self.root.clone(),
            identity: current_identity,
            state: if reason.is_none() {
                TrustState::Trusted
            } else {
                TrustState::Ask
            },
            grant_source: Some(TrustGrantSource::NativeHostProcess),
            granted_by: Some(self.actor.clone()),
            granted_on: Some(self.machine.clone()),
            granted_at: Some(self.granted_at.clone()),
            revoked_at: None,
            reason: reason.map(str::to_string),
            // A selected subfolder does not authorize a repository's config above it.
            grant_covers_checkout: scope.starts_with(&self.root),
        })
    }
}

fn process_grant() -> &'static RwLock<Option<ProcessTrustGrant>> {
    static GRANT: OnceLock<RwLock<Option<ProcessTrustGrant>>> = OnceLock::new();
    GRANT.get_or_init(|| RwLock::new(None))
}

/// Borrow the native host's explicit folder consent for this stdio server only.
/// The caller checks the transport before loading any project configuration.
/// No registry decision is saved, and a native revocation stops the owning server.
pub fn grant_for_process(root: &Path, consent_at_ms: i64) -> Result<()> {
    if !grants_allowed() {
        bail!(
            "Your organization's managed policy does not allow trusting workspaces on this device"
        );
    }
    let cwd = std::env::current_dir()?.canonicalize()?;
    if !root.is_absolute() || !root.is_dir() || std::fs::symlink_metadata(root)?.is_symlink() {
        bail!("Native workspace consent requires an absolute directory, not a symlink");
    }
    let canonical = root.canonicalize()?;
    if canonical != cwd {
        bail!("Native workspace consent must name exactly this app-server's working directory");
    }
    let config_dir = CliConfig::config_dir()?;
    let registry = ProjectRegistry::load(&config_dir)?;
    let decided_at = chrono::DateTime::from_timestamp_millis(consent_at_ms)
        .context("Native workspace consent has an invalid decision time")?;
    if consent_at_ms < 0 || decided_at > chrono::Utc::now() {
        bail!("Native workspace consent cannot have a future decision time");
    }
    let mut grant = ProcessTrustGrant::new(canonical, &registry, registry_stamp(&config_dir));
    if let Some(revoked_at) = grant
        .decision
        .as_ref()
        .and_then(|decision| decision.revoked_at.as_deref())
    {
        let revoked_at = chrono::DateTime::parse_from_rfc3339(revoked_at)
            .context("The workspace revocation marker could not be read")?;
        if revoked_at.timestamp_millis() >= consent_at_ms {
            bail!("Workspace trust was revoked after this Desktop consent. Revoke the folder's command permission in Desktop and allow it again.");
        }
    }
    grant.granted_at = decided_at.to_rfc3339();
    crate::platform::runtime::git::use_git_state_dir();
    agiworkforce_worktree::config_guard::record_baseline_blocking(&grant.root)?;
    *process_grant()
        .write()
        .map_err(|_| anyhow::anyhow!("Workspace consent is unavailable"))? = Some(grant);
    invalidate();
    Ok(())
}

fn process_status(root: &Path, config_dir: &Path) -> Option<TrustStatus> {
    let grant = process_grant().read().ok()?.clone()?;
    if !root.canonicalize().ok()?.starts_with(&grant.root) {
        return None;
    }
    let changed = if registry_stamp(config_dir) != grant.registry_stamp {
        match ProjectRegistry::load(config_dir) {
            Ok(registry) => Some(registry_decision(
                &registry,
                &grant.identity.root,
                &grant.identity,
            )),
            Err(_) => {
                return Some(restricted(
                    grant.root,
                    grant.identity,
                    "the project registry could not be read",
                ))
            }
        }
    } else {
        None
    };
    grant.status(
        root,
        &identity::current_actor(),
        &identity::current_machine(),
        grants_allowed(),
        changed,
    )
}

/// The trust status for a workspace root.
///
/// The result is cached against the registry file's timestamp, so a revoke from
/// this process or another one is seen by the next tool call rather than at the
/// next session start.
pub fn status_for(root: &Path) -> TrustStatus {
    let Ok(config_dir) = CliConfig::config_dir() else {
        let scope = crate::project_scope::resolve_project_scope(root);
        let identity = identity::workspace_identity(&scope);
        return restricted(
            scope,
            identity,
            "the configuration directory is unavailable",
        );
    };
    if let Some(status) = process_status(root, &config_dir) {
        return status;
    }
    let stamp = registry_stamp(&config_dir);
    if let Ok(cached) = cache().read() {
        if let Some(entry) = cached.get(root) {
            if entry.stamp == stamp {
                return entry.status.clone();
            }
        }
    }
    let status = match ProjectRegistry::load(&config_dir) {
        Ok(registry) => status_from_registry(
            &registry,
            root,
            &identity::current_actor(),
            &identity::current_machine(),
        ),
        Err(_) => {
            let scope = crate::project_scope::resolve_project_scope(root);
            let identity = identity::workspace_identity(&scope);
            restricted(scope, identity, "the project registry could not be read")
        }
    };
    if let Ok(mut cached) = cache().write() {
        cached.insert(
            root.to_path_buf(),
            Cached {
                stamp,
                status: status.clone(),
            },
        );
    }
    status
}

/// The trust status of the current working directory.
pub fn current_status() -> TrustStatus {
    match std::env::current_dir() {
        Ok(cwd) => status_for(&cwd),
        Err(_) => restricted(
            PathBuf::new(),
            WorkspaceIdentity {
                key: String::new(),
                kind: IdentityKind::Path,
                root: PathBuf::new(),
            },
            "the current directory is unavailable",
        ),
    }
}

pub fn restrictions_for(root: &Path) -> TrustRestrictions {
    status_for(root).restrictions()
}

/// The restrictions in force for the current working directory.
pub fn restrictions() -> TrustRestrictions {
    current_status().restrictions()
}

pub fn is_trusted(root: &Path) -> bool {
    status_for(root).state.is_trusted()
}

/// Record a trust grant for `root`, bound to this account and machine, and
/// record its repository's code-running git settings as they are now, which
/// host git then obeys there. See [`agiworkforce_worktree::config_guard`].
/// When the settings cannot be recorded the folder is not trusted either:
/// host git would go on refusing what the user meant to trust.
pub fn grant(root: &Path) -> Result<TrustStatus> {
    if !crate::platform::policy::managed::trust_grants_allowed() {
        bail!(
            "Your organization's managed policy does not allow trusting workspaces on this device"
        );
    }
    crate::platform::runtime::git::use_git_state_dir();
    agiworkforce_worktree::config_guard::record_baseline_blocking(root).with_context(|| {
        format!(
            "{} was not trusted, because its repository's git settings could not be recorded",
            root.display()
        )
    })?;
    let config_dir = CliConfig::config_dir()?;
    let scope = crate::project_scope::resolve_project_scope(root);
    let identity = identity::workspace_identity(&scope);
    let mut registry = ProjectRegistry::load(&config_dir)?;
    registry.trust(
        &scope,
        &identity.key,
        &identity::current_actor(),
        &identity::current_machine(),
    )?;
    registry.save(&config_dir)?;
    invalidate();
    Ok(status_for(root))
}

/// Record that the user chose not to trust `root`, without implying a grant
/// ever existed.
pub fn decline(root: &Path) -> Result<()> {
    let config_dir = CliConfig::config_dir()?;
    let scope = crate::project_scope::resolve_project_scope(root);
    let mut registry = ProjectRegistry::load(&config_dir)?;
    registry.register_project(&scope, "untrusted")?;
    registry.save(&config_dir)?;
    invalidate();
    Ok(())
}

/// Whether this device may record new trust grants at all.
pub fn grants_allowed() -> bool {
    crate::platform::policy::managed::trust_grants_allowed()
}

/// Revoke trust for `root` and for every other checkout of the same repository.
pub fn revoke(root: &Path) -> Result<usize> {
    let config_dir = CliConfig::config_dir()?;
    let scope = crate::project_scope::resolve_project_scope(root);
    let identity = identity::workspace_identity(&scope);
    let mut registry = ProjectRegistry::load(&config_dir)?;
    if registry.entry_for(&scope, &identity.key).is_none() {
        registry.register_project(&scope, "untrusted")?;
    }
    let process_revoked = if let Ok(mut active) = process_grant().write() {
        if active
            .as_ref()
            .is_some_and(|grant| grant.identity == identity)
        {
            active.take();
            1
        } else {
            0
        }
    } else {
        0
    };
    let revoked = registry.revoke(&scope, &identity.key);
    registry.save(&config_dir)?;
    invalidate();
    Ok(revoked.max(process_revoked))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_consent_stays_in_its_folder_and_out_of_the_registry() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("approved");
        let sibling = temp.path().join("sibling");
        std::fs::create_dir_all(root.join("child")).unwrap();
        std::fs::create_dir(&sibling).unwrap();
        let root = root.canonicalize().unwrap();
        let registry = ProjectRegistry::default();
        let grant = ProcessTrustGrant::new(root.clone(), &registry, None);
        let status = grant
            .status(&root, &grant.actor, &grant.machine, true, None)
            .unwrap();
        assert!(status.state.is_trusted());
        assert_eq!(
            status.grant_source,
            Some(TrustGrantSource::NativeHostProcess)
        );
        assert!(status.render().contains("for this app-server process only"));
        assert!(grant
            .status(
                &root.join("child"),
                &grant.actor,
                &grant.machine,
                true,
                None
            )
            .unwrap()
            .state
            .is_trusted());
        assert!(grant
            .status(&sibling, &grant.actor, &grant.machine, true, None)
            .is_none());
        assert!(grant
            .status(temp.path(), &grant.actor, &grant.machine, true, None)
            .is_none());
        assert!(registry
            .entry_for(&grant.identity.root, &grant.identity.key)
            .is_none());
        assert!(!root.join("projects.json").exists());
    }

    #[test]
    fn native_consent_obeys_policy_identity_and_later_withdrawal() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let grant = ProcessTrustGrant::new(root.clone(), &ProjectRegistry::default(), None);
        for (actor, machine, allowed) in [
            ("another-actor", grant.machine.as_str(), true),
            (grant.actor.as_str(), "another-machine", true),
            (grant.actor.as_str(), grant.machine.as_str(), false),
        ] {
            assert!(!grant
                .status(&root, actor, machine, allowed, None)
                .unwrap()
                .state
                .is_trusted());
        }
        let discovery = TrustDecision {
            level: "ask".into(),
            actor: None,
            machine: None,
            granted_at: None,
            revoked_at: None,
        };
        assert!(grant
            .status(
                &root,
                &grant.actor,
                &grant.machine,
                true,
                Some(Some(discovery))
            )
            .unwrap()
            .state
            .is_trusted());
        let withdrawal = TrustDecision {
            level: "untrusted".into(),
            actor: Some(grant.actor.clone()),
            machine: Some(grant.machine.clone()),
            granted_at: None,
            revoked_at: Some("later".into()),
        };
        assert!(!grant
            .status(
                &root,
                &grant.actor,
                &grant.machine,
                true,
                Some(Some(withdrawal))
            )
            .unwrap()
            .state
            .is_trusted());
        assert!(std::process::Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success());
        assert!(std::process::Command::new("git")
            .args([
                "remote",
                "add",
                "origin",
                "https://example.invalid/changed/project.git"
            ])
            .current_dir(&root)
            .status()
            .unwrap()
            .success());
        let status = grant
            .status(&root, &grant.actor, &grant.machine, true, None)
            .unwrap();
        assert!(!status.state.is_trusted());
        assert!(status.reason.unwrap().contains("identity changed"));
    }

    #[test]
    fn native_subfolder_consent_does_not_load_parent_repository_configuration() {
        let temp = tempfile::tempdir().unwrap();
        assert!(std::process::Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(temp.path())
            .status()
            .unwrap()
            .success());
        let root = temp.path().join("selected");
        std::fs::create_dir(&root).unwrap();
        let root = root.canonicalize().unwrap();
        let grant = ProcessTrustGrant::new(root.clone(), &ProjectRegistry::default(), None);
        let status = grant
            .status(&root, &grant.actor, &grant.machine, true, None)
            .unwrap();
        assert!(status.state.is_trusted());
        assert!(!status.restrictions().repository_config);
        assert!(!status.restrictions().mcp_autostart);
    }

    fn registry_with(path: &Path, actor: &str, machine: &str) -> ProjectRegistry {
        let mut registry = ProjectRegistry::default();
        registry
            .trust(
                path,
                &identity::workspace_identity(path).key,
                actor,
                machine,
            )
            .unwrap();
        registry
    }

    #[test]
    fn a_granted_workspace_is_trusted_for_the_account_that_granted_it() {
        let dir = tempfile::tempdir().unwrap();
        let registry = registry_with(dir.path(), "ada", "laptop");
        let status = status_from_registry(&registry, dir.path(), "ada", "laptop");
        assert_eq!(status.state, TrustState::Trusted);
        assert_eq!(status.restrictions(), TrustRestrictions::TRUSTED);
    }

    #[test]
    fn a_grant_does_not_travel_to_another_account_or_machine() {
        let dir = tempfile::tempdir().unwrap();
        let registry = registry_with(dir.path(), "ada", "laptop");

        let other_account = status_from_registry(&registry, dir.path(), "mallory", "laptop");
        assert_eq!(other_account.state, TrustState::Ask);
        assert!(other_account.reason.unwrap().contains("ada"));

        let other_machine = status_from_registry(&registry, dir.path(), "ada", "build-box");
        assert_eq!(other_machine.state, TrustState::Ask);
        assert_eq!(other_machine.restrictions(), TrustRestrictions::RESTRICTED);
    }

    #[test]
    fn a_workspace_with_no_decision_gets_every_restriction() {
        let dir = tempfile::tempdir().unwrap();
        let status = status_from_registry(&ProjectRegistry::default(), dir.path(), "ada", "laptop");
        assert_eq!(status.state, TrustState::Ask);
        assert_eq!(status.restrictions(), TrustRestrictions::RESTRICTED);
        assert_eq!(status.restrictions().withheld().len(), 5);
    }

    #[test]
    fn revoking_puts_every_restriction_back() {
        let dir = tempfile::tempdir().unwrap();
        let mut registry = registry_with(dir.path(), "ada", "laptop");
        assert_eq!(
            status_from_registry(&registry, dir.path(), "ada", "laptop").state,
            TrustState::Trusted
        );

        let key = identity::workspace_identity(dir.path()).key;
        assert_eq!(registry.revoke(dir.path(), &key), 1);

        let status = status_from_registry(&registry, dir.path(), "ada", "laptop");
        assert_eq!(status.state, TrustState::Untrusted);
        assert!(status.revoked_at.is_some());
        assert_eq!(status.restrictions(), TrustRestrictions::RESTRICTED);
    }

    /// The package's verification: an untrusted repository has MCP auto-start,
    /// unrestricted shell, network and secret injection all blocked; trusting
    /// it unblocks every one of them, and revoking blocks them again.
    #[test]
    fn trusting_and_revoking_flips_every_restriction() {
        let dir = tempfile::tempdir().unwrap();
        let key = identity::workspace_identity(dir.path()).key;
        let mut registry = ProjectRegistry::default();

        let before = status_from_registry(&registry, dir.path(), "ada", "laptop");
        assert!(!before.restrictions().mcp_autostart);
        assert!(!before.restrictions().unrestricted_shell);
        assert!(!before.restrictions().unrestricted_network);
        assert!(!before.restrictions().secret_injection);
        assert!(!before.restrictions().repository_config);

        registry.trust(dir.path(), &key, "ada", "laptop").unwrap();
        let granted = status_from_registry(&registry, dir.path(), "ada", "laptop");
        assert!(granted.restrictions().mcp_autostart);
        assert!(granted.restrictions().unrestricted_shell);
        assert!(granted.restrictions().unrestricted_network);
        assert!(granted.restrictions().secret_injection);
        assert!(granted.restrictions().repository_config);

        registry.revoke(dir.path(), &key);
        let revoked = status_from_registry(&registry, dir.path(), "ada", "laptop");
        assert_eq!(revoked.restrictions(), TrustRestrictions::RESTRICTED);
    }

    #[test]
    fn a_status_names_the_workspace_the_identity_and_what_is_withheld() {
        let dir = tempfile::tempdir().unwrap();
        let status = status_from_registry(&ProjectRegistry::default(), dir.path(), "ada", "laptop");
        let rendered = status.render();
        assert!(rendered.contains("Trust:     ask"));
        assert!(rendered.contains("Restricted:"));
        assert!(rendered.contains("commands have no network access"));
    }

    #[test]
    fn a_remote_grant_does_not_trust_the_configuration_of_a_clone_elsewhere() {
        let original = tempfile::tempdir().unwrap();
        let clone = tempfile::tempdir().unwrap();
        for dir in [original.path(), clone.path()] {
            let init = std::process::Command::new("git")
                .args(["init", "-q"])
                .current_dir(dir)
                .status()
                .unwrap();
            assert!(init.success());
            let remote = std::process::Command::new("git")
                .args(["remote", "add", "origin", "https://example.test/o/r.git"])
                .current_dir(dir)
                .status()
                .unwrap();
            assert!(remote.success());
        }
        let key = identity::workspace_identity(original.path()).key;
        assert_eq!(key, identity::workspace_identity(clone.path()).key);
        let mut registry = ProjectRegistry::default();
        registry
            .trust(original.path(), &key, "ada", "laptop")
            .unwrap();

        let here = status_from_registry(&registry, original.path(), "ada", "laptop");
        assert!(here.restrictions().repository_config);

        let elsewhere = status_from_registry(&registry, clone.path(), "ada", "laptop");
        assert_eq!(elsewhere.state, TrustState::Ask);
        assert_eq!(elsewhere.restrictions(), TrustRestrictions::RESTRICTED);
        assert!(elsewhere.reason.unwrap().contains("another checkout"));

        registry.trust(clone.path(), &key, "ada", "laptop").unwrap();
        let granted_here = status_from_registry(&registry, clone.path(), "ada", "laptop");
        assert_eq!(granted_here.state, TrustState::Trusted);
        assert_eq!(granted_here.restrictions(), TrustRestrictions::TRUSTED);
    }

    #[test]
    fn an_unrelated_folder_naming_a_trusted_remote_gets_no_shell_network_or_secrets() {
        let trusted = tempfile::tempdir().unwrap();
        let unrelated = tempfile::tempdir().unwrap();
        for dir in [trusted.path(), unrelated.path()] {
            assert!(std::process::Command::new("git")
                .args(["init", "-q"])
                .current_dir(dir)
                .status()
                .unwrap()
                .success());
        }
        let config = unrelated.path().join(".git/config");
        let mut text = std::fs::read_to_string(&config).unwrap();
        text.push_str("[remote \"origin\"]\n\turl = https://example.test/trusted/repo.git\n");
        std::fs::write(&config, text).unwrap();
        assert!(std::process::Command::new("git")
            .args([
                "remote",
                "add",
                "origin",
                "https://example.test/trusted/repo.git"
            ])
            .current_dir(trusted.path())
            .status()
            .unwrap()
            .success());
        let key = identity::workspace_identity(trusted.path()).key;
        assert_eq!(key, identity::workspace_identity(unrelated.path()).key);
        let mut registry = ProjectRegistry::default();
        registry
            .trust(trusted.path(), &key, "ada", "laptop")
            .unwrap();

        let status = status_from_registry(&registry, unrelated.path(), "ada", "laptop");
        let restrictions = status.restrictions();
        assert!(!status.state.is_trusted());
        assert!(!restrictions.unrestricted_shell);
        assert!(!restrictions.unrestricted_network);
        assert!(!restrictions.secret_injection);
        assert!(!restrictions.mcp_autostart);
        assert!(!restrictions.repository_config);
    }

    // Windows rejects control characters in file names, so this hostile
    // workspace cannot exist there.
    #[cfg(unix)]
    #[test]
    fn a_grant_message_cannot_carry_terminal_escapes() {
        let dir = tempfile::tempdir().unwrap();
        let hostile = dir.path().join("repo\u{1b}]0;owned\u{7}\u{1b}[2J");
        std::fs::create_dir(&hostile).unwrap();
        let registry = registry_with(&hostile, "ada", "laptop");
        let status = status_from_registry(&registry, &hostile, "ada", "laptop");

        let message = status.granted_message();

        assert!(message.starts_with("Trusted "), "{message}");
        assert!(!message.contains('\u{1b}'), "{message:?}");
        assert!(!message.contains('\u{7}'), "{message:?}");
    }

    #[test]
    fn a_registry_written_before_grants_carried_an_identity_stays_trusted() {
        let dir = tempfile::tempdir().unwrap();
        let mut registry = ProjectRegistry::default();
        registry.register_project(dir.path(), "trusted").unwrap();
        let status = status_from_registry(&registry, dir.path(), "ada", "laptop");
        assert_eq!(status.state, TrustState::Trusted);
    }
}
