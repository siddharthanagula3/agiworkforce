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
    code: Option<CodeControls>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CodeControls {
    #[serde(default = "allowed_by_default")]
    allow_mcp_servers: bool,
    #[serde(default)]
    allowed_mcp_servers: Vec<String>,
}

fn allowed_by_default() -> bool {
    true
}

fn host_matches(pattern: &str, host: &str) -> bool {
    let host = host.trim().to_ascii_lowercase();
    let rule = pattern.trim().to_ascii_lowercase();
    if rule.is_empty() || host.is_empty() {
        return false;
    }
    match rule.strip_prefix("*.") {
        Some(domain) => host == domain || host.ends_with(&rule[1..]),
        None => host == rule,
    }
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
    let policy = load_cached().unwrap_or_default();
    let value = read(&policy);
    if let Ok(mut current) = CURRENT.write() {
        current.get_or_insert(policy);
    }
    value
}

pub fn feature_enabled(feature: &str) -> bool {
    with_current(|policy| policy.feature_enabled(feature))
}

pub fn governed() -> bool {
    with_current(|policy| policy.governed)
}

pub fn mcp_server_refusal(host: Option<&str>) -> Option<String> {
    with_current(|policy| {
        let code = policy.code.as_ref()?;
        if !code.allow_mcp_servers {
            return Some("your workspace administrator has turned off MCP servers".to_string());
        }
        if code.allowed_mcp_servers.is_empty()
            || host.is_some_and(|host| {
                code.allowed_mcp_servers
                    .iter()
                    .any(|pattern| host_matches(pattern, host))
            })
        {
            return None;
        }
        Some(format!(
            "your workspace administrator allows MCP servers only at {}, and {}",
            code.allowed_mcp_servers.join(", "),
            match host {
                Some(host) => format!("this one is at {host}"),
                None => "this one runs as a local command".to_string(),
            }
        ))
    })
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

pub async fn refresh_when_due() {
    let Some(first) = claim_refresh() else {
        return;
    };
    let fetching = tokio::spawn(async {
        if let Err(error) = fetch(PrivacyMode::Managed).await {
            tracing::debug!("[workspace_policy] refresh failed: {error}");
        }
    });
    if first && load_cached().is_none() {
        let _ = tokio::time::timeout(FIRST_FETCH_WAIT, fetching).await;
    }
}
