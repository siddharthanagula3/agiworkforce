use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, RwLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use super::{cloud_dir, read_cache, write_cache, CloudClient, CloudError};
use crate::config::CliConfig;
use crate::platform::runtime::session::PrivacyMode;

const EFFECTIVE_POLICY_PATH: &str = "/api/settings/organization/policy/effective";
const REFRESH_INTERVAL: Duration = Duration::from_secs(60 * 60);
const FIRST_FETCH_WAIT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EffectiveWorkspacePolicy {
    #[serde(default)]
    governed: bool,
    #[serde(default)]
    controls: Option<WorkspaceControls>,
    #[serde(default)]
    code: Option<WorkspaceCodeControls>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCodeControls {
    #[serde(default)]
    allow_mcp_servers: Option<bool>,
    #[serde(default)]
    allowed_mcp_servers: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceControls {
    #[serde(default)]
    feature_access: HashMap<String, bool>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct CachedPolicy {
    owner: String,
    policy: EffectiveWorkspacePolicy,
}

impl EffectiveWorkspacePolicy {
    fn feature_enabled(&self, feature: &str) -> bool {
        self.controls
            .as_ref()
            .and_then(|controls| controls.feature_access.get(feature))
            .copied()
            != Some(false)
    }
}

static CURRENT: RwLock<Option<EffectiveWorkspacePolicy>> = RwLock::new(None);
static LAST_REFRESH: Mutex<Option<Instant>> = Mutex::new(None);
static HOOKS_REFUSAL_REPORTED: AtomicBool = AtomicBool::new(false);
/// Set when a signed-in account on a workspace plan has no readable policy:
/// its administrator's switches are unknown, so they are treated as off.
static UNREADABLE_FOR_WORKSPACE: AtomicBool = AtomicBool::new(false);

fn cache_path(config_dir: &Path) -> PathBuf {
    cloud_dir(config_dir).join("workspace-policy.json")
}

fn signed_in_owner() -> Option<String> {
    crate::tier_cache::load_jwt()
        .filter(|jwt| !jwt.trim().is_empty())
        .map(|jwt| crate::auth::jwt_subject(&jwt).unwrap_or_else(|| "unknown".to_string()))
}

fn load_cached() -> Option<EffectiveWorkspacePolicy> {
    let owner = signed_in_owner()?;
    let config_dir = CliConfig::config_dir().ok()?;
    let cached: CachedPolicy = read_cache(&cache_path(&config_dir));
    (cached.owner == owner).then_some(cached.policy)
}

fn with_current<R>(read: impl FnOnce(&EffectiveWorkspacePolicy) -> R) -> R {
    if let Ok(current) = CURRENT.read() {
        if let Some(policy) = current.as_ref() {
            return read(policy);
        }
    }
    match load_cached() {
        Some(policy) => {
            let value = read(&policy);
            if let Ok(mut current) = CURRENT.write() {
                current.get_or_insert(policy);
            }
            value
        }
        None => read(&EffectiveWorkspacePolicy::default()),
    }
}

fn policy_known() -> bool {
    CURRENT
        .read()
        .map(|current| current.is_some())
        .unwrap_or(false)
        || load_cached().is_some()
}

fn on_workspace_plan() -> bool {
    matches!(
        crate::tier_cache::read_tier_cache().map(|cached| cached.tier),
        Some(crate::tier_cache::UserTier::Team | crate::tier_cache::UserTier::Enterprise)
    )
}

pub fn feature_enabled(feature: &str) -> bool {
    if UNREADABLE_FOR_WORKSPACE.load(Ordering::Relaxed) && !policy_known() {
        return false;
    }
    with_current(|policy| policy.feature_enabled(feature))
}

/// Whether a failed read leaves this account's controls unknown: only an
/// account on a workspace plan has an administrator to answer to. A personal
/// account, or one whose policy was read before, keeps what it has.
fn closes_on_failed_read(signed_in: bool, known: bool, workspace_plan: bool) -> bool {
    signed_in && !known && workspace_plan
}

pub fn governed() -> bool {
    with_current(|policy| policy.governed)
}

pub async fn mcp_server_refusal(name: &str, url: Option<&str>) -> Option<String> {
    if signed_in_owner().is_some() && !policy_known() {
        let fetched = tokio::time::timeout(FIRST_FETCH_WAIT, fetch(PrivacyMode::Managed)).await;
        if !matches!(fetched, Ok(Ok(()))) && on_workspace_plan() {
            return Some(format!(
                "MCP server '{name}' was not started: your workspace policy could not be read, so MCP servers stay off until it can be. Check your connection and try again"
            ));
        }
    }
    with_current(|policy| {
        policy
            .code
            .as_ref()
            .and_then(|code| code_controls_refusal(code, name, url))
    })
}

fn host_allowed(allowed: &[String], host: &str) -> bool {
    allowed.iter().any(|entry| match entry.strip_prefix("*.") {
        Some(domain) => host
            .strip_suffix(domain)
            .is_some_and(|prefix| prefix.len() > 1 && prefix.ends_with('.')),
        None => entry == host,
    })
}

fn code_controls_refusal(
    code: &WorkspaceCodeControls,
    name: &str,
    url: Option<&str>,
) -> Option<String> {
    if code.allow_mcp_servers == Some(false) {
        return Some(format!(
            "MCP server '{name}' was not started: your workspace administrator has turned MCP servers off"
        ));
    }
    if code.allowed_mcp_servers.is_empty() {
        return None;
    }
    let host = url
        .and_then(|url| reqwest::Url::parse(url).ok())
        .and_then(|url| url.host_str().map(str::to_ascii_lowercase));
    match host {
        Some(host) if host_allowed(&code.allowed_mcp_servers, &host) => None,
        Some(host) => Some(format!(
            "MCP server '{name}' was not started: your workspace allows only listed MCP hosts, and {host} is not one of them"
        )),
        None => Some(format!(
            "MCP server '{name}' was not started: your workspace allows only listed MCP hosts, and this server has no host on that list"
        )),
    }
}

#[cfg(test)]
mod failed_read_tests {
    use super::closes_on_failed_read;

    #[test]
    fn only_a_signed_in_workspace_account_with_no_known_policy_closes() {
        assert!(closes_on_failed_read(true, false, true));
        assert!(!closes_on_failed_read(true, false, false));
        assert!(!closes_on_failed_read(true, true, true));
        assert!(!closes_on_failed_read(false, false, true));
    }
}

#[cfg(test)]
mod mcp_control_tests {
    use super::*;

    fn allow_list(hosts: &[&str]) -> WorkspaceCodeControls {
        WorkspaceCodeControls {
            allow_mcp_servers: Some(true),
            allowed_mcp_servers: hosts.iter().map(|host| host.to_string()).collect(),
        }
    }

    #[test]
    fn an_allow_list_refuses_local_and_unparseable_servers() {
        let code = allow_list(&["mcp.example.com"]);
        assert!(code_controls_refusal(&code, "local", None).is_some());
        assert!(code_controls_refusal(&code, "odd", Some("not a url")).is_some());
        assert!(code_controls_refusal(&code, "ok", Some("https://mcp.example.com/mcp")).is_none());
        assert!(code_controls_refusal(&code, "other", Some("https://evil.test/mcp")).is_some());
    }

    #[test]
    fn a_wildcard_host_admits_subdomains_only() {
        let code = allow_list(&["*.example.com"]);
        assert!(code_controls_refusal(&code, "a", Some("https://mcp.example.com")).is_none());
        assert!(code_controls_refusal(&code, "b", Some("https://a.b.example.com")).is_none());
        assert!(code_controls_refusal(&code, "c", Some("https://example.com")).is_some());
        assert!(code_controls_refusal(&code, "d", Some("https://badexample.com")).is_some());
    }

    #[test]
    fn servers_off_refuses_everything_and_no_list_allows_everything() {
        let off = WorkspaceCodeControls {
            allow_mcp_servers: Some(false),
            allowed_mcp_servers: Vec::new(),
        };
        assert!(code_controls_refusal(&off, "local", None).is_some());
        let open = WorkspaceCodeControls::default();
        assert!(code_controls_refusal(&open, "local", None).is_none());
        assert!(code_controls_refusal(&open, "remote", Some("https://any.test")).is_none());
    }
}

pub fn hooks_allowed() -> bool {
    if feature_enabled("hooks") {
        return true;
    }
    if !HOOKS_REFUSAL_REPORTED.swap(true, Ordering::Relaxed) {
        crate::output::print_warn(
            "hooks did not run: your workspace administrator has turned hooks off",
        );
    }
    false
}

pub async fn refresh(privacy: PrivacyMode) -> Result<(), CloudError> {
    if let Ok(mut last) = LAST_REFRESH.lock() {
        *last = Some(Instant::now());
    }
    fetch(privacy).await
}

async fn fetch(privacy: PrivacyMode) -> Result<(), CloudError> {
    let client = CloudClient::connect(privacy)?;
    let policy: EffectiveWorkspacePolicy = client.get(EFFECTIVE_POLICY_PATH, &[]).await?;
    let cached = CachedPolicy {
        owner: client.owner().to_string(),
        policy,
    };
    let config_dir =
        CliConfig::config_dir().map_err(|error| CloudError::Transport(error.to_string()))?;
    if let Err(error) = write_cache(&cache_path(&config_dir), &cached) {
        crate::output::print_warn(&format!(
            "could not remember the workspace policy on this device: {error}"
        ));
    }
    if let Ok(mut current) = CURRENT.write() {
        *current = Some(cached.policy);
    }
    Ok(())
}

fn claim_refresh() -> Option<bool> {
    let mut last = LAST_REFRESH.lock().ok()?;
    let first = match *last {
        None => true,
        Some(at) if at.elapsed() >= REFRESH_INTERVAL => false,
        Some(_) => return None,
    };
    *last = Some(Instant::now());
    Some(first)
}

/// Read at most hourly for any signed-in account, in every privacy mode: the
/// read sends only the bearer token, nothing of the session, and the
/// administrator's switches bind Local and BYOK sessions as they bind Managed.
pub async fn refresh_when_due() {
    let Some(first) = claim_refresh() else {
        return;
    };
    let fetching = tokio::spawn(async {
        match fetch(PrivacyMode::Managed).await {
            Ok(()) => UNREADABLE_FOR_WORKSPACE.store(false, Ordering::Relaxed),
            Err(error) => {
                tracing::debug!("[workspace_policy] refresh failed: {error}");
                let signed_in = !matches!(error, CloudError::SignedOut);
                UNREADABLE_FOR_WORKSPACE.store(
                    closes_on_failed_read(signed_in, policy_known(), on_workspace_plan()),
                    Ordering::Relaxed,
                );
            }
        }
    });
    if first && load_cached().is_none() {
        let _ = tokio::time::timeout(FIRST_FETCH_WAIT, fetching).await;
    }
}
