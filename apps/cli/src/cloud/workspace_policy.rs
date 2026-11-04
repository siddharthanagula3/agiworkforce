use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::{cloud_dir, read_cache, write_cache, CloudClient, CloudError};
use crate::config::CliConfig;
use crate::platform::runtime::session::PrivacyMode;
use crate::tier_cache::ManagedRequestContext;

const EFFECTIVE_POLICY_PATH: &str = "/api/settings/organization/policy/effective";
const REFRESH_INTERVAL: Duration = Duration::from_secs(60 * 60);
const FIRST_FETCH_WAIT: Duration = Duration::from_secs(5);
const CACHE_KEY_SERVICE: &str = "com.agiworkforce.cli.workspace-policy";
const CACHE_KEY_ACCOUNT: &str = "cache-seal";
/// A sealed policy older than this needs a fresh read before it counts.
const SEALED_POLICY_MAX_AGE_SECS: u64 = 7 * 24 * 60 * 60;
const CLOCK_SKEW_SECS: u64 = 5 * 60;
const CACHE_VERSION: u32 = 2;
const EFFECTIVE_POLICY_SCHEMA_VERSION: u32 = 3;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EffectiveWorkspacePolicy {
    #[serde(default, deserialize_with = "deserialize_optional_authority")]
    schema_version: Option<u32>,
    #[serde(default)]
    organization_id: Option<String>,
    #[serde(default)]
    revision: u64,
    #[serde(default, deserialize_with = "deserialize_optional_authority")]
    governed: Option<bool>,
    #[serde(default)]
    controls: Option<WorkspaceControls>,
    #[serde(default = "unknown_code_controls", deserialize_with = "deserialize_code_controls")]
    code: Option<WorkspaceCodeControls>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCodeControls {
    #[serde(default)]
    allow_mcp_servers: Option<bool>,
    #[serde(default)]
    allowed_mcp_servers: Option<Vec<String>>,
    #[serde(default)]
    mcp_restriction_active: Option<bool>,
}

fn deserialize_optional_authority<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: serde::de::DeserializeOwned,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(serde_json::from_value(value).ok())
}

fn unknown_code_controls() -> Option<WorkspaceCodeControls> {
    Some(WorkspaceCodeControls::default())
}

fn deserialize_code_controls<'de, D>(deserializer: D) -> Result<Option<WorkspaceCodeControls>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    if value.is_null() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_value(value).unwrap_or_default()))
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceControls {
    #[serde(default)]
    feature_access: HashMap<String, bool>,
}

// The seal binds deployment/session ownership and the server-reported workspace,
// not the workspace's live selection. Legacy subject-only seals require an
// authenticated refresh; an offline upgrade therefore fails closed. The OS
// credential store guards tampering and rollback, not control of this binary.
#[derive(Debug, Default, Serialize, Deserialize)]
struct CachedPolicy {
    #[serde(default)]
    version: u32,
    owner: String,
    #[serde(default)]
    organization: String,
    #[serde(default)]
    fetched_at: u64,
    policy: String,
    seal: String,
}

impl EffectiveWorkspacePolicy {
    fn signed_out() -> Self {
        Self { schema_version: Some(EFFECTIVE_POLICY_SCHEMA_VERSION), governed: Some(false), ..Self::default() }
    }

    fn mcp_policy_known(&self) -> bool {
        self.schema_version == Some(EFFECTIVE_POLICY_SCHEMA_VERSION)
            && self.governed.is_some()
            && match self.code.as_ref() {
                Some(code) => code.allow_mcp_servers.is_some()
                    && code.allowed_mcp_servers.is_some()
                    && code.mcp_restriction_active.is_some(),
                None => self.governed == Some(false) && self.organization_id.is_none(),
            }
    }

    fn feature_enabled(&self, feature: &str) -> bool {
        self.controls
            .as_ref()
            .and_then(|controls| controls.feature_access.get(feature))
            .copied()
            != Some(false)
    }
}

struct PolicyRead {
    owner: String,
    fetched_at: u64,
    policy: EffectiveWorkspacePolicy,
}

impl PolicyRead {
    fn reusable_for(&self, owner: &str, now: u64) -> bool {
        self.owner == owner && policy_fresh(self.fetched_at, now)
    }
}

struct RefreshRead {
    owner: String,
    at: Instant,
}

static CURRENT: RwLock<Option<PolicyRead>> = RwLock::new(None);
static LAST_REFRESH: Mutex<Option<RefreshRead>> = Mutex::new(None);
static HOOKS_REFUSAL_REPORTED: Mutex<Option<String>> = Mutex::new(None);

fn cache_path(config_dir: &Path) -> PathBuf {
    cloud_dir(config_dir).join("workspace-policy.json")
}

fn account_changed() -> CloudError {
    CloudError::Transport("Managed account changed; retry the policy read".to_string())
}

fn policy_fresh(fetched_at: u64, now: u64) -> bool {
    fetched_at <= now.saturating_add(CLOCK_SKEW_SECS)
        && now.saturating_sub(fetched_at) <= SEALED_POLICY_MAX_AGE_SECS
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

fn seal_for(key: &[u8], owner: &str, organization: &str, fetched_at: u64, policy: &str) -> String {
    let message = [
        b"workspace-policy-v2\n",
        owner.as_bytes(),
        b"\n",
        organization.as_bytes(),
        b"\n",
        fetched_at.to_string().as_bytes(),
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

/// The one policy read this account last took from the server, kept in the
/// credential store. Only the sealed copy of exactly that read opens, so an
/// older copy from any workspace, the personal one included, is refused.
#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
struct NewestPolicyRead {
    revision: u64,
    organization: String,
    fetched_at: u64,
}

fn open_sealed(
    key: &[u8],
    owner: &str,
    cached: &CachedPolicy,
    now: u64,
    newest: &NewestPolicyRead,
) -> Option<EffectiveWorkspacePolicy> {
    let expected = seal_for(
        key,
        owner,
        &cached.organization,
        cached.fetched_at,
        &cached.policy,
    );
    if cached.version != CACHE_VERSION || cached.owner != owner || !seal_matches(&expected, &cached.seal) {
        return None;
    }
    let fresh = policy_fresh(cached.fetched_at, now);
    let policy: EffectiveWorkspacePolicy = serde_json::from_str(&cached.policy).ok()?;
    let read = NewestPolicyRead {
        revision: policy.revision,
        organization: policy.organization_id.clone().unwrap_or_default(),
        fetched_at: cached.fetched_at,
    };
    (fresh && read.organization == cached.organization && &read == newest).then_some(policy)
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default()
}

fn newest_read_account(owner: &str) -> String {
    format!("newest-read:v2:{owner}")
}

fn newest_read(owner: &str) -> Option<NewestPolicyRead> {
    let stored =
        crate::secure_store::get(CACHE_KEY_SERVICE, &newest_read_account(owner)).ok()??;
    serde_json::from_str(&stored).ok()
}

fn cache_key() -> Option<Vec<u8>> {
    let stored = crate::secure_store::get(CACHE_KEY_SERVICE, CACHE_KEY_ACCOUNT).ok()??;
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
    crate::secure_store::set(
        CACHE_KEY_SERVICE,
        CACHE_KEY_ACCOUNT,
        &crate::hex::encode(&key),
    )
    .ok()?;
    Some(key.to_vec())
}

fn load_cached(owner: &str) -> Option<PolicyRead> {
    let config_dir = CliConfig::config_dir().ok()?;
    let cached: CachedPolicy = read_cache(&cache_path(&config_dir));
    if cached.seal.is_empty() {
        return None;
    }
    let newest = newest_read(owner)?;
    let policy = open_sealed(&cache_key()?, owner, &cached, now_secs(), &newest)?;
    Some(PolicyRead { owner: owner.to_string(), fetched_at: cached.fetched_at, policy })
}

fn current_policy(owner: &str) -> Option<EffectiveWorkspacePolicy> {
    if let Ok(current) = CURRENT.read() {
        if let Some(read) = current.as_ref().filter(|read| read.reusable_for(owner, now_secs())) {
            return Some(read.policy.clone());
        }
    }
    let read = load_cached(owner)?;
    let policy = read.policy.clone();
    if let Ok(mut current) = CURRENT.write() {
        *current = Some(read);
    }
    Some(policy)
}

fn with_current<R>(read: impl FnOnce(Option<&EffectiveWorkspacePolicy>) -> R) -> Result<R, CloudError> {
    #[cfg(test)]
    if let Some(policy) = TEST_POLICY.with(|cell| cell.borrow().clone()) {
        return Ok(read(Some(&policy)));
    }
    let context = CloudClient::policy_context()?;
    context.with_current(|| {
        let policy = if context.jwt.is_none() {
            Some(EffectiveWorkspacePolicy::signed_out())
        } else {
            context.owner.as_deref().and_then(current_policy)
        };
        read(policy.as_ref())
    }).ok_or_else(account_changed)
}

fn mcp_policy_known() -> bool {
    with_current(|policy| policy.is_some_and(EffectiveWorkspacePolicy::mcp_policy_known)).unwrap_or(false)
}

/// A switch a signed-in account's administrator might have turned off counts
/// as off until a policy is known, including for hooks that run before the
/// first read of the session.
pub fn feature_enabled(feature: &str) -> bool {
    with_current(|policy| feature_allowed(policy, feature)).unwrap_or(false)
}

fn feature_allowed(policy: Option<&EffectiveWorkspacePolicy>, feature: &str) -> bool {
    policy.is_some_and(|policy| policy.feature_enabled(feature))
}

pub fn governed() -> bool {
    with_current(|policy| policy.is_none_or(|policy| policy.governed == Some(true))).unwrap_or(true)
}

pub async fn mcp_server_refusal(name: &str, url: Option<&str>) -> Option<String> {
    if !mcp_policy_known() {
        let _ = tokio::time::timeout(FIRST_FETCH_WAIT, refresh(PrivacyMode::Managed)).await;
    }
    cached_mcp_server_refusal(name, url)
}

pub fn cached_mcp_server_refusal(name: &str, url: Option<&str>) -> Option<String> {
    with_current(|policy| {
        let Some(policy) = policy else {
            return Some(unread_mcp_policy_refusal(name));
        };
        if !policy.mcp_policy_known() {
            return Some(unread_mcp_policy_refusal(name));
        }
        policy
            .code
            .as_ref()
            .and_then(|code| code_controls_refusal(code, name, url))
    }).unwrap_or_else(|_| Some(unread_mcp_policy_refusal(name)))
}

fn unread_mcp_policy_refusal(name: &str) -> String {
    format!(
        "MCP server '{name}' was not started: your workspace policy could not be read, so MCP servers stay off until it can be. Check your connection and try again"
    )
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
    let allowed = code.allowed_mcp_servers.as_deref().unwrap_or(&[]);
    if allowed.is_empty() && code.mcp_restriction_active != Some(true) {
        return None;
    }
    let host = url
        .and_then(|url| reqwest::Url::parse(url).ok())
        .and_then(|url| url.host_str().map(str::to_ascii_lowercase));
    match host {
        Some(host) if host_allowed(allowed, &host) => None,
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
    use super::*;

    #[test]
    fn a_signed_in_account_with_no_known_policy_closes() {
        assert!(!feature_allowed(None, "hooks"));
        assert!(feature_allowed(Some(&EffectiveWorkspacePolicy::default()), "hooks"));
    }
}

#[cfg(test)]
mod sealed_cache_tests {
    use super::*;

    const KEY: [u8; 32] = [7u8; 32];
    const NOW: u64 = 1_790_000_000;
    const DAY: u64 = 24 * 60 * 60;

    fn sealed(owner: &str, policy: &str) -> CachedPolicy {
        let organization = serde_json::from_str::<EffectiveWorkspacePolicy>(policy)
            .ok()
            .and_then(|parsed| parsed.organization_id)
            .unwrap_or_default();
        CachedPolicy {
            version: CACHE_VERSION,
            owner: owner.to_string(),
            seal: seal_for(&KEY, owner, &organization, NOW, policy),
            organization,
            fetched_at: NOW,
            policy: policy.to_string(),
        }
    }

    fn newest_of(cached: &CachedPolicy) -> NewestPolicyRead {
        NewestPolicyRead {
            revision: serde_json::from_str::<EffectiveWorkspacePolicy>(&cached.policy)
                .map(|policy| policy.revision)
                .unwrap_or_default(),
            organization: cached.organization.clone(),
            fetched_at: cached.fetched_at,
        }
    }

    #[test]
    fn policy_semantics_survive_serialization_and_sealing_without_trusting_legacy_mcp() {
        for version in [None, Some(2), Some(EFFECTIVE_POLICY_SCHEMA_VERSION), Some(999)] {
            let wire = serde_json::json!({
                "schemaVersion": version,
                "governed": true,
                "controls": {"featureAccess": {"hooks": false}},
                "code": {"allowMcpServers": true, "allowedMcpServers": [], "mcpRestrictionActive": true}
            });
            let fresh: EffectiveWorkspacePolicy = serde_json::from_value(wire).unwrap();
            let serialized = serde_json::to_string(&fresh).unwrap();
            let cached = sealed("user_1", &serialized);
            let restored = open_sealed(&KEY, "user_1", &cached, NOW, &newest_of(&cached)).unwrap();
            assert!(!restored.feature_enabled("hooks"));
            assert_eq!(restored.schema_version, version);
            assert_eq!(restored.mcp_policy_known(), version == Some(EFFECTIVE_POLICY_SCHEMA_VERSION));
            assert_eq!(restored.code.as_ref().unwrap().mcp_restriction_active, Some(true));
            assert!(code_controls_refusal(restored.code.as_ref().unwrap(), "local", None).is_some());
        }
    }

    #[test]
    fn malformed_mcp_and_schema_authority_preserves_feature_denials_through_sealing() {
        let valid_code = serde_json::json!({
            "allowMcpServers": true, "allowedMcpServers": [], "mcpRestrictionActive": false
        });
        for malformed in [
            serde_json::json!(42),
            serde_json::json!({"allowMcpServers": "yes", "allowedMcpServers": [], "mcpRestrictionActive": false}),
            serde_json::json!({"allowMcpServers": true, "allowedMcpServers": [42], "mcpRestrictionActive": false}),
            serde_json::json!({"allowMcpServers": true, "allowedMcpServers": [], "mcpRestrictionActive": "true"}),
        ] {
            let wire = serde_json::json!({
                "schemaVersion": 3, "governed": false,
                "controls": {"featureAccess": {"hooks": false}}, "code": malformed
            });
            let fresh: EffectiveWorkspacePolicy = serde_json::from_value(wire).unwrap();
            assert!(!fresh.mcp_policy_known());
            assert!(!fresh.feature_enabled("hooks"));
            let cached = sealed("user_1", &serde_json::to_string(&fresh).unwrap());
            let restored = open_sealed(&KEY, "user_1", &cached, NOW, &newest_of(&cached)).unwrap();
            assert!(!restored.mcp_policy_known());
            assert!(!restored.feature_enabled("hooks"));
        }
        for wire in [
            serde_json::json!({"schemaVersion": "3", "governed": true, "code": valid_code}),
            serde_json::json!({"schemaVersion": 3, "governed": "false", "code": null}),
            serde_json::json!({"schemaVersion": 3, "governed": "false", "code": valid_code}),
            serde_json::json!({"schemaVersion": 3, "governed": false}),
        ] {
            let mut wire = wire;
            wire["controls"] = serde_json::json!({"featureAccess": {"hooks": false}});
            let policy: EffectiveWorkspacePolicy = serde_json::from_value(wire).unwrap();
            assert!(!policy.mcp_policy_known());
            assert!(!policy.feature_enabled("hooks"));
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
        let policy = open_sealed(&KEY, "user_1", &cached, NOW, &newest_of(&cached)).expect("opens");
        assert_eq!(policy.governed, Some(true));
        assert_eq!(
            policy.code.and_then(|code| code.allow_mcp_servers),
            Some(false)
        );
    }

    #[test]
    fn legacy_seals_require_an_authenticated_refetch() {
        let mut cached = sealed("deployment_session_a", r#"{"governed":false}"#);
        let newest = newest_of(&cached);
        cached.version = 0;
        assert!(open_sealed(&KEY, "deployment_session_a", &cached, NOW, &newest).is_none());
        assert_ne!(newest_read_account("deployment_session_a"), "newest-read:deployment_session_a");
    }

    #[test]
    fn memory_policy_requires_matching_authority_and_freshness() {
        let read = PolicyRead {
            owner: "deployment_session_a".to_string(),
            fetched_at: NOW,
            policy: EffectiveWorkspacePolicy::default(),
        };
        assert!(read.reusable_for("deployment_session_a", NOW));
        assert!(!read.reusable_for("deployment_session_b", NOW));
        assert!(!read.reusable_for("deployment_session_a", NOW + 8 * DAY));
        assert!(!read.reusable_for("deployment_session_a", NOW - DAY));
    }

    #[test]
    fn a_hand_edited_policy_or_another_owner_is_ignored() {
        let original = sealed(
            "user_1",
            r#"{"governed":true,"code":{"allowMcpServers":false}}"#,
        );
        let newest = newest_of(&original);
        assert!(open_sealed(&KEY, "user_2", &original, NOW, &newest).is_none());
        let mut edited = sealed(
            "user_1",
            r#"{"governed":true,"code":{"allowMcpServers":false}}"#,
        );
        edited.policy = r#"{"governed":true,"code":{"allowMcpServers":true}}"#.to_string();
        assert!(open_sealed(&KEY, "user_1", &edited, NOW, &newest).is_none());
        assert!(open_sealed(&[8u8; 32], "user_1", &original, NOW, &newest).is_none());
    }

    #[test]
    fn a_sealed_policy_expires_and_is_refused_when_dated_ahead() {
        let cached = sealed(
            "user_1",
            r#"{"organizationId":"org_a","revision":4,"governed":true}"#,
        );
        let newest = newest_of(&cached);
        assert!(open_sealed(&KEY, "user_1", &cached, NOW + 6 * DAY, &newest).is_some());
        assert!(open_sealed(&KEY, "user_1", &cached, NOW + 8 * DAY, &newest).is_none());
        assert!(open_sealed(&KEY, "user_1", &cached, NOW - DAY, &newest).is_none());
    }

    #[test]
    fn only_the_newest_read_opens_so_an_older_copy_from_any_workspace_is_refused() {
        let workspace = sealed(
            "user_1",
            r#"{"organizationId":"org_a","revision":4,"governed":true,"code":{"allowMcpServers":false}}"#,
        );
        let newest = newest_of(&workspace);
        let personal = sealed("user_1", r#"{"revision":0,"governed":false}"#);
        assert!(open_sealed(&KEY, "user_1", &personal, NOW, &newest).is_none());
        let older = sealed(
            "user_1",
            r#"{"organizationId":"org_a","revision":3,"governed":true}"#,
        );
        assert!(open_sealed(&KEY, "user_1", &older, NOW, &newest).is_none());
        let mut earlier = sealed(
            "user_1",
            r#"{"organizationId":"org_a","revision":4,"governed":true,"code":{"allowMcpServers":false}}"#,
        );
        earlier.fetched_at = NOW - DAY;
        earlier.seal = seal_for(&KEY, "user_1", "org_a", NOW - DAY, &earlier.policy);
        assert!(open_sealed(&KEY, "user_1", &earlier, NOW, &newest).is_none());
        assert!(open_sealed(&KEY, "user_1", &workspace, NOW, &newest).is_some());
    }

    #[test]
    fn a_policy_sealed_for_one_workspace_does_not_open_for_another() {
        let mut cached = sealed(
            "user_1",
            r#"{"organizationId":"org_a","governed":true,"code":{"allowMcpServers":false}}"#,
        );
        let newest = newest_of(&cached);
        cached.organization = "org_b".to_string();
        assert!(open_sealed(&KEY, "user_1", &cached, NOW, &newest).is_none());
    }
}

#[cfg(test)]
mod mcp_control_tests {
    use super::*;

    fn allow_list(hosts: &[&str]) -> WorkspaceCodeControls {
        WorkspaceCodeControls {
            allow_mcp_servers: Some(true),
            allowed_mcp_servers: Some(hosts.iter().map(|host| host.to_string()).collect()),
            mcp_restriction_active: Some(!hosts.is_empty()),
        }
    }

    #[test]
    fn active_empty_refuses_local_remote_and_missing_hosts() {
        let code = WorkspaceCodeControls {
            allow_mcp_servers: Some(true),
            allowed_mcp_servers: Some(Vec::new()),
            mcp_restriction_active: Some(true),
        };
        for url in [None, Some("invalid"), Some("https://any.example/mcp")] {
            assert!(code_controls_refusal(&code, "restricted", url).is_some());
        }
        let mut nonempty = allow_list(&["only.example"]);
        nonempty.mcp_restriction_active = Some(false);
        assert!(code_controls_refusal(&nonempty, "other", Some("https://other.example")).is_some());
    }

    #[test]
    fn mcp_authority_is_distinct_from_feature_policy_presence() {
        for wire in [
            serde_json::json!({"schemaVersion": 2, "code": {"allowMcpServers": true, "allowedMcpServers": ["reopened.example"]}}),
            serde_json::json!({"schemaVersion": 3, "governed": true, "code": null}),
            serde_json::json!({"schemaVersion": 3}),
            serde_json::json!({"schemaVersion": 3, "governed": true, "code": {"allowMcpServers": true, "mcpRestrictionActive": false}}),
            serde_json::json!({"schemaVersion": 3, "governed": true, "code": {"allowMcpServers": true, "allowedMcpServers": []}}),
            serde_json::json!({"schemaVersion": 999, "code": {"allowMcpServers": true, "allowedMcpServers": [], "mcpRestrictionActive": false}}),
        ] {
            with_test_policy(wire, || {
                assert!(!mcp_policy_known());
                assert!(cached_mcp_server_refusal("local", None).is_some());
                assert!(feature_enabled("hooks"));
            });
        }
        let signed_out = EffectiveWorkspacePolicy::signed_out();
        assert!(signed_out.mcp_policy_known());
        assert!(signed_out.feature_enabled("hooks"));
        with_test_policy(serde_json::to_value(signed_out).unwrap(), || {
            assert!(mcp_policy_known());
            assert!(cached_mcp_server_refusal("local", None).is_none());
        });
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
            allowed_mcp_servers: Some(Vec::new()),
            mcp_restriction_active: Some(false),
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
    #[cfg(test)]
    if TEST_POLICY.with(|cell| cell.borrow().is_some()) {
        return false;
    }
    let report = CloudClient::policy_context().ok().and_then(|context| {
        context.with_current(|| {
            let mut reported = HOOKS_REFUSAL_REPORTED.lock().ok()?;
            if reported.as_ref() == context.owner.as_ref() {
                return Some(false);
            }
            *reported = context.owner.clone();
            Some(true)
        }).flatten()
    }).unwrap_or(true);
    if report {
        crate::output::print_warn(
            "hooks did not run: your workspace policy disallows them or could not be checked",
        );
    }
    false
}

pub async fn refresh(privacy: PrivacyMode) -> Result<(), CloudError> {
    if privacy != PrivacyMode::Managed {
        return Err(CloudError::NotManaged(privacy));
    }
    let context = CloudClient::policy_context()?;
    context.with_current(|| {
        if let (Some(owner), Ok(mut last)) = (context.owner.as_ref(), LAST_REFRESH.lock()) {
            *last = Some(RefreshRead { owner: owner.clone(), at: Instant::now() });
        }
    }).ok_or_else(account_changed)?;
    fetch(&context).await
}

async fn fetch(context: &ManagedRequestContext) -> Result<(), CloudError> {
    let client = CloudClient::from_managed_context(context)?;
    let policy: EffectiveWorkspacePolicy = client.get(EFFECTIVE_POLICY_PATH, &[]).await?;
    context.with_current(|| {
        let owner = context.owner.as_ref().ok_or_else(account_changed)?;
        let fetched_at = now_secs();
        remember(owner, &policy, fetched_at);
        if let Ok(mut current) = CURRENT.write() {
            *current = Some(PolicyRead { owner: owner.clone(), fetched_at, policy });
        }
        Ok(())
    }).ok_or_else(account_changed)?
}

fn remember(owner: &str, policy: &EffectiveWorkspacePolicy, fetched_at: u64) {
    let (Ok(config_dir), Ok(serialized)) = (CliConfig::config_dir(), serde_json::to_string(policy))
    else {
        return;
    };
    let Some(key) = cache_key_or_create() else {
        tracing::debug!("[workspace_policy] no credential store key; the policy is not cached");
        return;
    };
    let organization = policy.organization_id.clone().unwrap_or_default();
    let newest = NewestPolicyRead {
        revision: policy.revision,
        organization: organization.clone(),
        fetched_at,
    };
    let Ok(newest) = serde_json::to_string(&newest) else {
        return;
    };
    if let Err(error) =
        crate::secure_store::set(CACHE_KEY_SERVICE, &newest_read_account(owner), &newest)
    {
        tracing::debug!("[workspace_policy] could not record the policy revision: {error}");
        return;
    }
    let cached = CachedPolicy {
        version: CACHE_VERSION,
        owner: owner.to_string(),
        seal: seal_for(&key, owner, &organization, fetched_at, &serialized),
        organization,
        fetched_at,
        policy: serialized,
    };
    if let Err(error) = write_cache(&cache_path(&config_dir), &cached) {
        crate::output::print_warn(&format!(
            "could not remember the workspace policy on this device: {error}"
        ));
    }
}

fn refresh_due(last: Option<&RefreshRead>, owner: &str) -> Option<bool> {
    match last {
        None => Some(true),
        Some(read) if read.owner != owner => Some(true),
        Some(read) if read.at.elapsed() >= REFRESH_INTERVAL => Some(false),
        Some(_) => None,
    }
}

fn claim_refresh(owner: &str) -> Option<bool> {
    let mut last = LAST_REFRESH.lock().ok()?;
    let first = refresh_due(last.as_ref(), owner)?;
    *last = Some(RefreshRead { owner: owner.to_string(), at: Instant::now() });
    Some(first)
}

#[cfg(test)]
mod refresh_owner_tests {
    use super::*;

    #[test]
    fn another_session_does_not_inherit_the_refresh_delay() {
        let recent = RefreshRead { owner: "session_a".to_string(), at: Instant::now() };
        assert_eq!(refresh_due(Some(&recent), "session_a"), None);
        assert_eq!(refresh_due(Some(&recent), "session_b"), Some(true));
        assert_eq!(refresh_due(None, "session_a"), Some(true));
        let expired = RefreshRead {
            owner: "session_a".to_string(),
            at: Instant::now() - REFRESH_INTERVAL,
        };
        assert_eq!(refresh_due(Some(&expired), "session_a"), Some(false));
    }
}

/// Read at most hourly for any signed-in account, in every privacy mode: the
/// read sends only the bearer token, nothing of the session, and the
/// administrator's switches bind Local and BYOK sessions as they bind Managed.
pub async fn refresh_when_due() {
    let Ok(context) = CloudClient::policy_context() else {
        return;
    };
    if context.jwt.is_none() {
        return;
    }
    let Some(wait) = context.with_current(|| {
        let owner = context.owner.as_deref()?;
        let first = claim_refresh(owner)?;
        Some(first && current_policy(owner).is_none())
    }).flatten() else {
        return;
    };
    let fetching = tokio::spawn(async move {
        if let Err(error) = fetch(&context).await {
            tracing::debug!("[workspace_policy] refresh failed: {error}");
        }
    });
    if wait {
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
        let service = super::CACHE_KEY_SERVICE;
        match std::env::var("AGI_KEYRING_PROBE").as_deref() {
            Ok("write") => crate::secure_store::set(service, "persistence-probe", "probe").unwrap(),
            Ok("read") => assert_eq!(
                crate::secure_store::get(service, "persistence-probe")
                    .unwrap()
                    .as_deref(),
                Some("probe")
            ),
            _ => {}
        }
    }
}

#[cfg(test)]
thread_local! {
    static TEST_POLICY: std::cell::RefCell<Option<EffectiveWorkspacePolicy>> =
        const { std::cell::RefCell::new(None) };
}

#[cfg(test)]
pub(crate) fn with_test_policy<T>(policy: serde_json::Value, run: impl FnOnce() -> T) -> T {
    struct Restore(Option<EffectiveWorkspacePolicy>);
    impl Drop for Restore {
        fn drop(&mut self) {
            TEST_POLICY.with(|cell| cell.replace(self.0.take()));
        }
    }
    let policy = serde_json::from_value(policy).expect("workspace policy fixture");
    let previous = TEST_POLICY.with(|cell| cell.replace(Some(policy)));
    let _restore = Restore(previous);
    run()
}

#[cfg(test)]
mod scoped_mcp_policy_tests {
    use super::*;

    #[test]
    fn workspace_mcp_test_policy_is_scoped_and_restored_after_panics() {
        with_test_policy(
            serde_json::json!({"schemaVersion": 3, "governed": true, "code": {"allowMcpServers": true, "mcpRestrictionActive": false, "allowedMcpServers": []}}),
            || {
                let result = std::panic::catch_unwind(|| {
                    with_test_policy(
                        serde_json::json!({"schemaVersion": 3, "governed": true, "code": {"allowMcpServers": false, "mcpRestrictionActive": false, "allowedMcpServers": []}}),
                        || {
                            assert!(cached_mcp_server_refusal("fixture", None).is_some());
                            panic!("fixture unwind");
                        },
                    );
                });
                assert!(result.is_err());
                assert!(cached_mcp_server_refusal("fixture", None).is_none());
            },
        );
    }

    #[test]
    fn workspace_mcp_parallel_fixtures_do_not_share_policy_state() {
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let jobs: Vec<_> = [true, false]
            .into_iter()
            .map(|allowed| {
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    with_test_policy(
                        serde_json::json!({"schemaVersion": 3, "governed": true, "code": {"allowMcpServers": allowed, "mcpRestrictionActive": false, "allowedMcpServers": []}}),
                        || {
                            barrier.wait();
                            assert_eq!(
                                cached_mcp_server_refusal("fixture", None).is_none(),
                                allowed
                            );
                        },
                    );
                })
            })
            .collect();
        for job in jobs {
            job.join().unwrap();
        }
    }
}
