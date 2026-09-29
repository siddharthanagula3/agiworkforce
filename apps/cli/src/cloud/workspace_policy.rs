use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, RwLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{cloud_dir, read_cache, write_cache, CloudClient, CloudError};
use crate::config::CliConfig;
use crate::platform::runtime::session::PrivacyMode;

const EFFECTIVE_POLICY_PATH: &str = "/api/settings/organization/policy/effective";
const REFRESH_INTERVAL: Duration = Duration::from_secs(60 * 60);
const FIRST_FETCH_WAIT: Duration = Duration::from_secs(5);
const CACHE_KEY_SERVICE: &str = "com.agiworkforce.cli.workspace-policy";
const CACHE_KEY_ACCOUNT: &str = "cache-seal";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EffectiveWorkspacePolicy {
    #[serde(default)]
    organization_id: Option<String>,
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

/// The policy as the server sent it, sealed to the account and workspace with a
/// key held in the OS credential store. A cache edited by hand, or read by
/// another account or for another workspace, no longer matches its seal and is
/// ignored. This keeps honest clients honest; it is not a security boundary,
/// since whoever controls the machine controls the binary that enforces it.
/// Where no credential store answers (a headless Linux box without a session
/// keyring), nothing is cached and an offline start fails closed.
#[derive(Debug, Default, Serialize, Deserialize)]
struct CachedPolicy {
    owner: String,
    #[serde(default)]
    organization: String,
    policy: String,
    seal: String,
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
/// Set when a signed-in account has no readable policy: whether an
/// administrator governs it is unknown, so the switches are treated as off.
static UNREADABLE_FOR_WORKSPACE: AtomicBool = AtomicBool::new(false);

fn cache_path(config_dir: &Path) -> PathBuf {
    cloud_dir(config_dir).join("workspace-policy.json")
}

fn signed_in_owner() -> Option<String> {
    crate::tier_cache::load_jwt()
        .filter(|jwt| !jwt.trim().is_empty())
        .map(|jwt| crate::auth::jwt_subject(&jwt).unwrap_or_else(|| "unknown".to_string()))
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut block = [0u8; 64];
    if key.len() > block.len() {
        block[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        block[..key.len()].copy_from_slice(key);
    }
    let inner = Sha256::new()
        .chain_update(block.map(|byte| byte ^ 0x36))
        .chain_update(message)
        .finalize();
    Sha256::new()
        .chain_update(block.map(|byte| byte ^ 0x5c))
        .chain_update(inner)
        .finalize()
        .into()
}

fn seal_for(key: &[u8], owner: &str, organization: &str, policy: &str) -> String {
    let message = [
        owner.as_bytes(),
        b"\n",
        organization.as_bytes(),
        b"\n",
        policy.as_bytes(),
    ]
    .concat();
    crate::hex::encode(&hmac_sha256(key, &message))
}

fn seal_matches(expected: &str, actual: &str) -> bool {
    expected.len() == actual.len()
        && expected
            .bytes()
            .zip(actual.bytes())
            .fold(0u8, |diff, (a, b)| diff | (a ^ b))
            == 0
}

fn open_sealed(key: &[u8], owner: &str, cached: &CachedPolicy) -> Option<EffectiveWorkspacePolicy> {
    let expected = seal_for(key, owner, &cached.organization, &cached.policy);
    if cached.owner != owner || !seal_matches(&expected, &cached.seal) {
        return None;
    }
    let policy: EffectiveWorkspacePolicy = serde_json::from_str(&cached.policy).ok()?;
    (policy.organization_id.as_deref().unwrap_or_default() == cached.organization).then_some(policy)
}

fn cache_key_entry() -> Option<keyring::Entry> {
    keyring::Entry::new(CACHE_KEY_SERVICE, CACHE_KEY_ACCOUNT).ok()
}

fn cache_key() -> Option<Vec<u8>> {
    let stored = cache_key_entry()?.get_password().ok()?;
    let key: Option<Vec<u8>> = (stored.len() == 64)
        .then(|| {
            (0..64)
                .step_by(2)
                .map(|at| u8::from_str_radix(stored.get(at..at + 2)?, 16).ok())
                .collect()
        })
        .flatten();
    key
}

fn cache_key_or_create() -> Option<Vec<u8>> {
    if let Some(key) = cache_key() {
        return Some(key);
    }
    use rand::Rng;
    let mut key = [0u8; 32];
    rand::rng().fill_bytes(&mut key);
    cache_key_entry()?
        .set_password(&crate::hex::encode(&key))
        .ok()?;
    Some(key.to_vec())
}

fn load_cached() -> Option<EffectiveWorkspacePolicy> {
    let owner = signed_in_owner()?;
    let config_dir = CliConfig::config_dir().ok()?;
    let cached: CachedPolicy = read_cache(&cache_path(&config_dir));
    if cached.seal.is_empty() {
        return None;
    }
    open_sealed(&cache_key()?, &owner, &cached)
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

pub fn feature_enabled(feature: &str) -> bool {
    if UNREADABLE_FOR_WORKSPACE.load(Ordering::Relaxed) && !policy_known() {
        return false;
    }
    with_current(|policy| policy.feature_enabled(feature))
}

/// Whether a failed read leaves this account's controls unknown. Only the
/// policy reply itself says whether an administrator governs the account, so a
/// signed-in account with neither a fresh reply nor a sealed one counts as
/// governed with its switches off.
fn closes_on_failed_read(signed_in: bool, known: bool) -> bool {
    signed_in && !known
}

pub fn governed() -> bool {
    with_current(|policy| policy.governed)
}

pub async fn mcp_server_refusal(name: &str, url: Option<&str>) -> Option<String> {
    if signed_in_owner().is_some() && !policy_known() {
        let fetched = tokio::time::timeout(FIRST_FETCH_WAIT, fetch(PrivacyMode::Managed)).await;
        let signed_in = !matches!(fetched, Ok(Err(CloudError::SignedOut)));
        if !matches!(fetched, Ok(Ok(()))) && closes_on_failed_read(signed_in, policy_known()) {
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
    fn a_signed_in_account_with_no_known_policy_closes() {
        assert!(closes_on_failed_read(true, false));
        assert!(!closes_on_failed_read(true, true));
        assert!(!closes_on_failed_read(false, false));
    }
}

#[cfg(test)]
mod sealed_cache_tests {
    use super::*;

    const KEY: [u8; 32] = [7u8; 32];

    fn sealed(owner: &str, policy: &str) -> CachedPolicy {
        let organization = serde_json::from_str::<EffectiveWorkspacePolicy>(policy)
            .ok()
            .and_then(|parsed| parsed.organization_id)
            .unwrap_or_default();
        CachedPolicy {
            owner: owner.to_string(),
            seal: seal_for(&KEY, owner, &organization, policy),
            organization,
            policy: policy.to_string(),
        }
    }

    #[test]
    fn hmac_matches_the_rfc_4231_vector() {
        let key = [0x0bu8; 20];
        assert_eq!(
            crate::hex::encode(&hmac_sha256(&key, b"Hi There")),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
    }

    #[test]
    fn a_sealed_policy_opens_for_its_owner() {
        let cached = sealed(
            "user_1",
            r#"{"governed":true,"code":{"allowMcpServers":false}}"#,
        );
        let policy = open_sealed(&KEY, "user_1", &cached).expect("opens");
        assert!(policy.governed);
        assert_eq!(
            policy.code.and_then(|code| code.allow_mcp_servers),
            Some(false)
        );
    }

    #[test]
    fn a_hand_edited_policy_or_another_owner_is_ignored() {
        let mut cached = sealed(
            "user_1",
            r#"{"governed":true,"code":{"allowMcpServers":false}}"#,
        );
        assert!(open_sealed(&KEY, "user_2", &cached).is_none());
        cached.policy = r#"{"governed":true,"code":{"allowMcpServers":true}}"#.to_string();
        assert!(open_sealed(&KEY, "user_1", &cached).is_none());
        let other_key = sealed("user_1", &cached.policy);
        assert!(open_sealed(&[8u8; 32], "user_1", &other_key).is_none());
    }

    #[test]
    fn a_policy_sealed_for_one_workspace_does_not_open_for_another() {
        let mut cached = sealed(
            "user_1",
            r#"{"organizationId":"org_a","governed":true,"code":{"allowMcpServers":false}}"#,
        );
        assert!(open_sealed(&KEY, "user_1", &cached).is_some());
        cached.organization = "org_b".to_string();
        assert!(open_sealed(&KEY, "user_1", &cached).is_none());
        let mut moved = sealed(
            "user_1",
            r#"{"organizationId":"org_a","governed":true,"code":{"allowMcpServers":false}}"#,
        );
        moved.policy =
            r#"{"organizationId":"org_b","governed":true,"code":{"allowMcpServers":false}}"#
                .to_string();
        assert!(open_sealed(&KEY, "user_1", &moved).is_none());
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
    remember(client.owner(), &policy);
    if let Ok(mut current) = CURRENT.write() {
        *current = Some(policy);
    }
    Ok(())
}

fn remember(owner: &str, policy: &EffectiveWorkspacePolicy) {
    let (Ok(config_dir), Ok(serialized)) = (CliConfig::config_dir(), serde_json::to_string(policy))
    else {
        return;
    };
    let Some(key) = cache_key_or_create() else {
        tracing::debug!("[workspace_policy] no credential store key; the policy is not cached");
        return;
    };
    let organization = policy.organization_id.clone().unwrap_or_default();
    let cached = CachedPolicy {
        owner: owner.to_string(),
        seal: seal_for(&key, owner, &organization, &serialized),
        organization,
        policy: serialized,
    };
    if let Err(error) = write_cache(&cache_path(&config_dir), &cached) {
        crate::output::print_warn(&format!(
            "could not remember the workspace policy on this device: {error}"
        ));
    }
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
    // Until the first read lands, the account's switches are unknown, so they
    // count as off rather than defaulting open while the read is in flight.
    if closes_on_failed_read(signed_in_owner().is_some(), policy_known()) {
        UNREADABLE_FOR_WORKSPACE.store(true, Ordering::Relaxed);
    }
    let fetching = tokio::spawn(async {
        match fetch(PrivacyMode::Managed).await {
            Ok(()) => UNREADABLE_FOR_WORKSPACE.store(false, Ordering::Relaxed),
            Err(error) => {
                tracing::debug!("[workspace_policy] refresh failed: {error}");
                let signed_in = !matches!(error, CloudError::SignedOut);
                UNREADABLE_FOR_WORKSPACE.store(
                    closes_on_failed_read(signed_in, policy_known()),
                    Ordering::Relaxed,
                );
            }
        }
    });
    if first && load_cached().is_none() {
        let _ = tokio::time::timeout(FIRST_FETCH_WAIT, fetching).await;
    }
}

#[cfg(test)]
mod credential_store_tests {
    /// Run twice, with AGI_KEYRING_PROBE=write and then =read, to show an entry
    /// written by one process is read by the next: the mock store never is.
    #[test]
    #[ignore = "touches the real OS credential store"]
    fn an_entry_survives_a_new_process() {
        let entry = keyring::Entry::new(super::CACHE_KEY_SERVICE, "persistence-probe").unwrap();
        match std::env::var("AGI_KEYRING_PROBE").as_deref() {
            Ok("write") => entry.set_password("probe").unwrap(),
            Ok("read") => {
                assert_eq!(entry.get_password().unwrap(), "probe");
                entry.delete_credential().unwrap();
            }
            _ => {}
        }
    }
}
