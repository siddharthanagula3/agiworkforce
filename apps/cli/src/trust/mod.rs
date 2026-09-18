//! Workspace trust: who granted it, on which machine, and what an untrusted
//! workspace is not allowed to do.

pub mod identity;

use anyhow::{bail, Result};
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

#[derive(Debug, Clone)]
pub struct TrustStatus {
    pub root: PathBuf,
    pub identity: WorkspaceIdentity,
    pub state: TrustState,
    pub granted_by: Option<String>,
    pub granted_on: Option<String>,
    pub granted_at: Option<String>,
    pub revoked_at: Option<String>,
    /// Why this workspace is not trusted, when it is not.
    pub reason: Option<String>,
}

impl TrustStatus {
    pub fn restrictions(&self) -> TrustRestrictions {
        TrustRestrictions::for_state(self.state)
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
        granted_by: None,
        granted_on: None,
        granted_at: None,
        revoked_at: None,
        reason: Some(reason.to_string()),
    }
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
        granted_by: entry.trusted_by.clone(),
        granted_on: entry.trusted_on.clone(),
        granted_at: entry.trusted_at.clone(),
        revoked_at: entry.revoked_at.clone(),
        reason: None,
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

/// Record a trust grant for `root`, bound to this account and machine.
pub fn grant(root: &Path) -> Result<TrustStatus> {
    if !crate::platform::policy::managed::trust_grants_allowed() {
        bail!(
            "Your organization's managed policy does not allow trusting workspaces on this device"
        );
    }
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
    let revoked = registry.revoke(&scope, &identity.key);
    if revoked > 0 {
        registry.save(&config_dir)?;
    }
    invalidate();
    Ok(revoked)
}

#[cfg(test)]
mod tests {
    use super::*;

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
    fn a_registry_written_before_grants_carried_an_identity_stays_trusted() {
        let dir = tempfile::tempdir().unwrap();
        let mut registry = ProjectRegistry::default();
        registry.register_project(dir.path(), "trusted").unwrap();
        let status = status_from_registry(&registry, dir.path(), "ada", "laptop");
        assert_eq!(status.state, TrustState::Trusted);
    }
}
