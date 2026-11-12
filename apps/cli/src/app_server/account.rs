//! Account surface shared by the CLI and the editor client.
//!
//! Every answer comes from the CLI's own credential store and caches, so both
//! surfaces report the same identity, the same plan, and the same balance
//! without a second login.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::auth::{AuthEntry, AuthStore};
use crate::tier_cache;

const ACCOUNT_CACHE_FILE: &str = "cache/account.toml";
const ACCOUNT_CACHE_TTL: Duration = Duration::from_secs(300);
const ME_FETCH_TIMEOUT: Duration = Duration::from_secs(5);
const MANAGED_AUTH_KEYS: [&str; 2] = ["managed_cloud", "agiworkforce"];

#[derive(Debug, Clone, Default)]
pub struct AccountSnapshot {
    pub signed_in: bool,
    pub email: Option<String>,
    pub tier: Option<String>,
    pub balance_credits: Option<f64>,
    pub purchased_credits: Option<f64>,
    pub cached: bool,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct AccountCacheEnvelope {
    #[serde(default)]
    owner: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    balance_credits: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    purchased_credits: Option<f64>,
    cached_at: u64,
}

#[derive(Debug, Deserialize)]
struct MeResponse {
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    plan: Option<MePlan>,
}

#[derive(Debug, Deserialize)]
struct MePlan {
    #[serde(default)]
    tier: Option<String>,
    #[serde(default)]
    effective_tier: Option<String>,
}

fn account_cache_path() -> Option<PathBuf> {
    crate::config::CliConfig::config_dir()
        .ok()
        .map(|dir| dir.join(ACCOUNT_CACHE_FILE))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn read_account_cache(context: &tier_cache::ManagedRequestContext) -> Option<AccountCacheEnvelope> {
    let owner = context.owner.as_ref()?;
    let content = std::fs::read_to_string(account_cache_path()?).ok()?;
    let envelope: AccountCacheEnvelope = toml::from_str(&content).ok()?;
    let now = now_secs();
    (envelope.owner.as_ref() == Some(owner)
        && envelope.cached_at <= now
        && now - envelope.cached_at <= ACCOUNT_CACHE_TTL.as_secs())
    .then_some(envelope)
}

fn write_account_cache(envelope: &AccountCacheEnvelope) {
    let Some(path) = account_cache_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let Ok(content) = toml::to_string(envelope) else {
        return;
    };
    let temp = path.with_extension("tmp");
    if std::fs::write(&temp, &content).is_ok() {
        let _ = std::fs::rename(&temp, &path);
    }
}

fn clear_account_cache() {
    if let Some(path) = account_cache_path() {
        let _ = std::fs::remove_file(path);
    }
}

fn forget_account_caches() {
    tier_cache::invalidate_tier_cache();
    clear_account_cache();
    crate::claude_parity::connectors::forget_local_tool_policy();
}

fn forget_account_on_this_device() {
    forget_account_caches();
    if let Ok(config_dir) = crate::config::CliConfig::config_dir() {
        crate::cloud::forget_account_data(&config_dir);
    }
}

/// The managed credential this machine holds, with its expiry in epoch
/// milliseconds when the stored entry states one.
pub fn managed_credential() -> Option<(String, Option<i64>)> {
    if let Ok(token) = std::env::var("AGIWORKFORCE_JWT") {
        if !token.is_empty() {
            return Some((token, None));
        }
    }
    let store = AuthStore::load().ok()?;
    for key in MANAGED_AUTH_KEYS {
        match store.entries.get(key) {
            Some(AuthEntry::OAuth {
                access, expires, ..
            }) if !access.is_empty() => {
                return Some((access.clone(), (*expires > 0).then_some(*expires)));
            }
            Some(AuthEntry::ApiKey { key: value }) if !value.is_empty() => {
                return Some((value.clone(), None));
            }
            _ => continue,
        }
    }
    None
}

/// Fingerprint of the account this machine holds, for records that travel to
/// another surface. Never the token and never the subject itself: a receiver
/// only has to answer "is this the same account", and a record in a log then
/// names nobody.
pub fn account_fingerprint() -> Option<String> {
    use sha2::{Digest, Sha256};
    let (token, _) = managed_credential()?;
    let subject = crate::auth::jwt_subject(&token)?;
    let digest = Sha256::digest(subject.as_bytes());
    Some(crate::hex::encode(&digest)[..32].to_string())
}

pub fn epoch_millis_to_rfc3339(millis: i64) -> Option<String> {
    chrono::DateTime::from_timestamp_millis(millis).map(|instant| instant.to_rfc3339())
}

/// Read the account, cache-first.
///
/// With `refresh` unset this touches the network only once a cache has
/// expired, which is the same rule `agi` itself applies at startup.
pub async fn account_status(refresh: bool) -> AccountSnapshot {
    let Ok(context) = tier_cache::ManagedRequestContext::capture() else {
        return AccountSnapshot::default();
    };
    account_status_for(context, crate::account_privacy_mode(), refresh).await
}

async fn account_status_for(
    context: tier_cache::ManagedRequestContext,
    privacy: crate::platform::runtime::session::PrivacyMode,
    refresh: bool,
) -> AccountSnapshot {
    let Some(_) = context.jwt.as_deref() else {
        return AccountSnapshot {
            cached: true,
            ..AccountSnapshot::default()
        };
    };
    if crate::cloud::CloudClient::admit(privacy).is_err() {
        return AccountSnapshot {
            signed_in: true,
            tier: context
                .with_current(|| tier_cache::read_tier_for(&context))
                .flatten()
                .map(|cached| tier_cache::tier_slug(&cached.tier)),
            cached: true,
            ..AccountSnapshot::default()
        };
    }
    if refresh {
        context.with_current(|| {
            tier_cache::invalidate_tier_cache();
            clear_account_cache();
        });
    }
    let tier_was_cached = context
        .with_current(|| tier_cache::read_tier_for(&context))
        .flatten()
        .is_some();
    let resolved = tier_cache::resolve_user_tier_for(&context).await;
    let tier = resolved
        .cached
        .map(|cached| tier_cache::tier_slug(&cached.tier));
    if let Some(snapshot) = context
        .with_current(|| {
            read_account_cache(&context).map(|envelope| AccountSnapshot {
                signed_in: true,
                email: envelope.email,
                tier: tier.clone(),
                balance_credits: envelope.balance_credits,
                purchased_credits: envelope.purchased_credits,
                cached: tier_was_cached,
            })
        })
        .flatten()
    {
        return snapshot;
    }
    if !context.is_current() {
        return AccountSnapshot::default();
    }
    let email = fetch_email(&context).await;
    let (balance_credits, purchased_credits) =
        match crate::usage_summary::fetch_account_usage_for(&context).await {
            Ok(usage) => match usage.credits {
                Some(credits) => (Some(credits.monthly.remaining), credits.purchased.remaining),
                None => (None, None),
            },
            Err(_) => (None, None),
        };
    context
        .with_current(|| {
            if context.owner.is_some() {
                write_account_cache(&AccountCacheEnvelope {
                    owner: context.owner.clone(),
                    email: email.clone(),
                    balance_credits,
                    purchased_credits,
                    cached_at: now_secs(),
                });
            }
            AccountSnapshot {
                signed_in: true,
                email,
                tier,
                balance_credits,
                purchased_credits,
                cached: false,
            }
        })
        .unwrap_or_default()
}

async fn fetch_email(context: &tier_cache::ManagedRequestContext) -> Option<String> {
    let jwt = context.jwt.as_deref()?;
    let client = reqwest::Client::builder()
        .timeout(ME_FETCH_TIMEOUT)
        .build()
        .ok()?;
    let response = client
        .get(format!("{}/api/me", context.base))
        .header("Authorization", format!("Bearer {jwt}"))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body: MeResponse = response.json().await.ok()?;
    if let Some(plan_tier) = body
        .plan
        .as_ref()
        .and_then(|plan| plan.effective_tier.as_deref().or(plan.tier.as_deref()))
    {
        tier_cache::adopt_server_plan(context, plan_tier);
    }
    context
        .with_current(|| body.email.filter(|email| !email.is_empty()))
        .flatten()
}

/// Base URL of the device-grant endpoints, honouring the same override the
/// terminal login flow honours.
pub fn device_auth_base() -> String {
    std::env::var("AGI_AUTH_BASE")
        .ok()
        .filter(|base| !base.trim().is_empty())
        .and_then(|base| tier_cache::resolve_agi_api_base(&base))
        .unwrap_or_else(|| crate::auth::agiworkforce_api_base().to_string())
}

fn install_device_grant(store: &mut AuthStore, entry: AuthEntry) {
    store.entries.remove("managed_cloud");
    store.entries.insert("agiworkforce".to_string(), entry);
}

pub fn save_device_grant(entry: AuthEntry) -> Result<()> {
    AuthStore::transaction_replacing_unreadable(
        |store, unreadable| {
            forget_unreadable_managed(unreadable);
            install_device_grant(store, entry);
            Ok(())
        },
        |_| forget_account_on_this_device(),
    )
}

fn forget_managed(store: &mut AuthStore) {
    for key in MANAGED_AUTH_KEYS {
        store.entries.remove(key);
    }
}

fn forget_unreadable_managed(unreadable: &mut BTreeSet<String>) -> bool {
    let mut forgot = false;
    for key in MANAGED_AUTH_KEYS {
        forgot |= unreadable.remove(key);
    }
    forgot
}

const RENEW_WITHIN_MS: i64 = 24 * 60 * 60 * 1000;

#[derive(Clone, PartialEq, Eq)]
struct ManagedGrant {
    key: String,
    entry: AuthEntry,
}

impl ManagedGrant {
    fn access(&self) -> &str {
        match &self.entry {
            AuthEntry::OAuth { access, .. } => access,
            AuthEntry::ApiKey { key } => key,
        }
    }

    fn refresh(&self) -> &str {
        match &self.entry {
            AuthEntry::OAuth { refresh, .. } => refresh,
            AuthEntry::ApiKey { .. } => "",
        }
    }
}

fn stored_managed_grant(store: &AuthStore) -> Option<ManagedGrant> {
    MANAGED_AUTH_KEYS.iter().find_map(|key| {
        let grant = ManagedGrant {
            key: (*key).to_string(),
            entry: store.entries.get(*key)?.clone(),
        };
        (!grant.access().is_empty()).then_some(grant)
    })
}

fn replace_grant(
    store: &mut AuthStore,
    expected: &ManagedGrant,
    replacement: Option<AuthEntry>,
) -> bool {
    if stored_managed_grant(store).as_ref() != Some(expected) {
        return false;
    }
    for key in MANAGED_AUTH_KEYS {
        if store.entries.get(key) == Some(&expected.entry) {
            store.entries.remove(key);
        }
    }
    if let Some(entry) = replacement {
        store.entries.insert(expected.key.clone(), entry);
    }
    true
}

fn persist_replacement(expected: &ManagedGrant, replacement: Option<AuthEntry>) -> Result<bool> {
    AuthStore::transaction_with_commit(
        |store| Ok(replace_grant(store, expected, replacement)),
        |changed| {
            if *changed {
                forget_account_caches();
            }
        },
    )
}

fn same_managed_session(left: &str, right: &str) -> bool {
    match (
        crate::auth::jwt_session_identity(left),
        crate::auth::jwt_session_identity(right),
    ) {
        (Some(left), Some(right)) => left == right,
        _ => false,
    }
}

pub fn managed_api_base() -> Option<String> {
    let raw = std::env::var("AGIWORKFORCE_API_BASE")
        .unwrap_or_else(|_| tier_cache::default_api_base().to_string());
    tier_cache::resolve_agi_api_base(&raw)
}

fn matching_deployment(api_base: &str, auth_base: &str) -> bool {
    let expected = reqwest::Url::parse(&format!("{}/api", api_base.trim_end_matches('/')));
    let actual = reqwest::Url::parse(auth_base.trim_end_matches('/'));
    matches!((expected, actual), (Ok(expected), Ok(actual)) if expected == actual)
}

fn recovery_deployment_unchanged(api_base: &str, auth_base: &str) -> bool {
    managed_api_base().as_deref() == Some(api_base)
        && device_auth_base() == auth_base
        && matching_deployment(api_base, auth_base)
}

async fn lock_device_session() -> Result<std::fs::File> {
    let dir = crate::config::CliConfig::config_dir()?;
    tokio::task::spawn_blocking(move || -> Result<std::fs::File> {
        std::fs::create_dir_all(&dir).context("Failed to create config directory")?;
        let mut options = std::fs::OpenOptions::new();
        options.create(true).truncate(false).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = options
            .open(dir.join("device-session.lock"))
            .context("Failed to open the session renewal lock")?;
        file.lock().context("Failed to lock session renewal")?;
        Ok(file)
    })
    .await
    .context("Session renewal lock task failed")?
}

pub async fn renew_managed_session_if_expiring() -> Option<String> {
    if std::env::var("AGIWORKFORCE_JWT").is_ok_and(|jwt| !jwt.is_empty()) {
        return None;
    }
    let _lock = match lock_device_session().await {
        Ok(lock) => lock,
        Err(error) => return Some(format!("Session renewal could not be locked: {error:#}")),
    };
    if std::env::var("AGIWORKFORCE_JWT").is_ok_and(|jwt| !jwt.is_empty()) {
        return None;
    }
    let store = match AuthStore::load() {
        Ok(store) => store,
        Err(error) => return Some(format!("The credential store could not be read: {error:#}")),
    };
    let grant = stored_managed_grant(&store)?;
    match &grant.entry {
        AuthEntry::OAuth {
            refresh, expires, ..
        } if !refresh.is_empty()
            && *expires > 0
            && *expires - chrono::Utc::now().timestamp_millis() < RENEW_WITHIN_MS => {}
        _ => return None,
    }
    let api_base = managed_api_base()?;
    let auth_base = device_auth_base();
    if !recovery_deployment_unchanged(&api_base, &auth_base) {
        return Some("The account and device-auth deployments differ. Sign in again with matching endpoints.".to_string());
    }
    renewal_result(&grant, &api_base, &auth_base)
        .await
        .message()
}

pub enum RejectedSessionRecovery {
    Renewed(String),
    Ended(String),
    Refused(String),
    Unavailable,
}

impl RejectedSessionRecovery {
    fn message(self) -> Option<String> {
        match self {
            Self::Ended(message) | Self::Refused(message) => Some(message),
            Self::Renewed(_) | Self::Unavailable => None,
        }
    }
}

pub const SESSION_ENDED_MESSAGE: &str = "Your AGI session ended. Sign in again to continue.";

fn forget_expected_grant(grant: &ManagedGrant) -> RejectedSessionRecovery {
    match persist_replacement(grant, None) {
        Ok(true) => RejectedSessionRecovery::Ended(SESSION_ENDED_MESSAGE.to_string()),
        Ok(false) => RejectedSessionRecovery::Unavailable,
        Err(error) => RejectedSessionRecovery::Refused(format!(
            "The rejected credential could not be removed: {error:#}. Run agi logout."
        )),
    }
}

async fn renewal_result(
    grant: &ManagedGrant,
    api_base: &str,
    auth_base: &str,
) -> RejectedSessionRecovery {
    let result = crate::oauth::renew_device_session(auth_base, grant.refresh()).await;
    if !recovery_deployment_unchanged(api_base, auth_base)
        || std::env::var("AGIWORKFORCE_JWT").is_ok_and(|jwt| !jwt.is_empty())
    {
        return RejectedSessionRecovery::Unavailable;
    }
    match result {
        crate::oauth::DeviceSessionRenewal::Renewed(entry) => {
            let access = match &entry {
                AuthEntry::OAuth { access, .. } => access.clone(),
                _ => return RejectedSessionRecovery::Unavailable,
            };
            if !same_managed_session(grant.access(), &access) {
                return RejectedSessionRecovery::Refused(
                    "The renewed credential does not belong to the original device session. Sign in again.".to_string(),
                );
            }
            match persist_replacement(grant, Some(entry)) {
                Ok(true) => RejectedSessionRecovery::Renewed(access),
                Ok(false) => RejectedSessionRecovery::Unavailable,
                Err(error) => RejectedSessionRecovery::Refused(format!(
                    "The renewed AGI session could not be saved: {error:#}. Run agi login."
                )),
            }
        }
        crate::oauth::DeviceSessionRenewal::Revoked => forget_expected_grant(grant),
        crate::oauth::DeviceSessionRenewal::Refused(reason) => {
            RejectedSessionRecovery::Refused(reason.unwrap_or_else(|| {
                "AGI did not renew this session. Sign in again on agiworkforce.com.".to_string()
            }))
        }
        crate::oauth::DeviceSessionRenewal::Unavailable => RejectedSessionRecovery::Unavailable,
    }
}

pub async fn recover_rejected_session(
    rejected_access: &str,
    api_base: &str,
    auth_base: &str,
) -> RejectedSessionRecovery {
    if std::env::var("AGIWORKFORCE_JWT").is_ok_and(|jwt| !jwt.is_empty())
        || !recovery_deployment_unchanged(api_base, auth_base)
    {
        return RejectedSessionRecovery::Unavailable;
    }
    let _lock = match lock_device_session().await {
        Ok(lock) => lock,
        Err(error) => {
            return RejectedSessionRecovery::Refused(format!(
                "Session recovery could not be locked: {error:#}"
            ))
        }
    };
    if !recovery_deployment_unchanged(api_base, auth_base)
        || std::env::var("AGIWORKFORCE_JWT").is_ok_and(|jwt| !jwt.is_empty())
    {
        return RejectedSessionRecovery::Unavailable;
    }
    let grant = match AuthStore::load() {
        Ok(store) => stored_managed_grant(&store),
        Err(error) => {
            return RejectedSessionRecovery::Refused(format!(
                "The credential store could not be read: {error:#}"
            ))
        }
    };
    let Some(grant) = grant else {
        return RejectedSessionRecovery::Unavailable;
    };
    if grant.access() != rejected_access {
        return if same_managed_session(rejected_access, grant.access()) {
            RejectedSessionRecovery::Renewed(grant.access().to_string())
        } else {
            RejectedSessionRecovery::Unavailable
        };
    }
    if grant.refresh().is_empty() {
        return forget_expected_grant(&grant);
    }
    renewal_result(&grant, api_base, auth_base).await
}

fn forget_access(store: &mut AuthStore, rejected_access: &str) -> bool {
    if rejected_access.is_empty() {
        return false;
    }
    let mut changed = false;
    for key in MANAGED_AUTH_KEYS {
        let matches = store.entries.get(key).is_some_and(|entry| match entry {
            AuthEntry::OAuth { access, .. } => access == rejected_access,
            AuthEntry::ApiKey { key } => key == rejected_access,
        });
        if matches {
            store.entries.remove(key);
            changed = true;
        }
    }
    changed
}

pub fn forget_refused_session(rejected_access: &str) -> Result<()> {
    AuthStore::transaction_with_commit(
        |store| Ok(forget_access(store, rejected_access)),
        |changed| {
            if *changed {
                forget_account_on_this_device();
            }
        },
    )
    .map(|_| ())
}

async fn revoke_snapshot(
    base: &str,
    entries: &std::collections::HashMap<String, AuthEntry>,
) -> bool {
    let mut confirmed = true;
    for key in MANAGED_AUTH_KEYS {
        if let Some(AuthEntry::OAuth {
            access, refresh, ..
        }) = entries.get(key)
        {
            if !access.is_empty() || !refresh.is_empty() {
                confirmed &= crate::oauth::revoke_device_session(base, access, refresh).await;
            }
        }
    }
    confirmed
}

pub async fn sign_out() -> Result<bool> {
    Ok(sign_out_of_account().await?.revoked)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CliSignOut {
    pub providers: usize,
    pub revoked: bool,
}

fn holds_managed_grant(store: &AuthStore) -> bool {
    MANAGED_AUTH_KEYS
        .iter()
        .any(|key| store.entries.contains_key(*key))
}

pub async fn sign_out_of_account() -> Result<CliSignOut> {
    let (base, entries, held, unread) = AuthStore::transaction_replacing_unreadable(
        |store, unreadable| {
            let base = device_auth_base();
            let entries = store.entries.clone();
            let held = holds_managed_grant(store);
            let unread = forget_unreadable_managed(unreadable);
            forget_managed(store);
            Ok((base, entries, held, unread))
        },
        |_| forget_account_on_this_device(),
    )?;
    let revoked = revoke_snapshot(&base, &entries).await && !unread;
    Ok(CliSignOut {
        providers: usize::from(held || unread),
        revoked,
    })
}

impl CliSignOut {
    pub fn message(&self) -> String {
        let mut message = match self.providers {
            0 => "No active sessions to log out from.".to_string(),
            1 => "Logged out from 1 provider.".to_string(),
            count => format!("Logged out from {count} providers."),
        };
        if !self.revoked {
            message.push_str(
                " AGI Cloud did not confirm the sign-out. The device session ends when it expires, or unlink it in Settings, Account, Linked devices.",
            );
        }
        message
    }
}

fn forget_every_provider(store: &mut AuthStore) -> usize {
    let providers = store.entries.len();
    store.entries.clear();
    providers
}

// Remove locally before awaiting revocation, so a concurrent renewal cannot
// restore the removed grant and a subsequent login is not removed afterward.
pub async fn sign_out_of_every_provider() -> Result<CliSignOut> {
    let (base, entries, providers, unread) = AuthStore::transaction_replacing_unreadable(
        |store, unreadable| {
            let base = device_auth_base();
            let entries = store.entries.clone();
            let unread = forget_unreadable_managed(unreadable);
            let providers = forget_every_provider(store) + unreadable.len() + usize::from(unread);
            unreadable.clear();
            Ok((base, entries, providers, unread))
        },
        |(_, _, providers, _)| {
            if *providers > 0 {
                crate::onboarding::forget_setup();
            }
            forget_account_on_this_device();
        },
    )?;
    let revoked = revoke_snapshot(&base, &entries).await && !unread;
    Ok(CliSignOut { providers, revoked })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token(subject: &str, session: &str, generation: u8) -> String {
        use base64::Engine;
        let payload = serde_json::json!({ "sub": subject, "sid": session, "iat": generation });
        format!(
            "fixture.{}.signature",
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload.to_string())
        )
    }

    fn grant(access: &str, refresh: &str) -> AuthEntry {
        AuthEntry::OAuth {
            access: access.to_string(),
            refresh: refresh.to_string(),
            expires: 1,
        }
    }

    #[test]
    fn retry_continuity_requires_both_account_and_device_session() {
        let original = token("account-a", "session-a", 1);
        assert!(same_managed_session(
            &original,
            &token("account-a", "session-a", 2)
        ));
        for replacement in [
            token("account-b", "session-a", 2),
            token("account-a", "session-b", 2),
            token("", "session-a", 2),
            token("account-a", "", 2),
            "malformed".to_string(),
        ] {
            assert!(!same_managed_session(&original, &replacement));
        }
    }

    #[test]
    fn recovery_deployment_comparison_is_separate_from_token_identity() {
        assert!(matching_deployment(
            "https://agiworkforce.com",
            "https://agiworkforce.com/api"
        ));
        assert!(matching_deployment(
            "http://localhost:8080",
            "http://localhost:8080/api"
        ));
        assert!(!matching_deployment(
            "http://localhost:8080",
            "http://localhost:8081/api"
        ));
        assert!(!matching_deployment(
            "https://agiworkforce.com",
            "https://preview.agiworkforce.com/api"
        ));
    }

    #[test]
    fn renewal_compare_and_swap_requires_the_selected_exact_pair() {
        let original = grant("old-access", "old-refresh");
        let mut store = AuthStore::default();
        store
            .entries
            .insert("agiworkforce".to_string(), original.clone());
        let expected = stored_managed_grant(&store).unwrap();
        store.entries.insert(
            "agiworkforce".to_string(),
            grant("old-access", "new-refresh"),
        );
        assert!(!replace_grant(
            &mut store,
            &expected,
            Some(grant("renewed", "rotated"))
        ));
        store
            .entries
            .insert("agiworkforce".to_string(), original.clone());
        store.entries.insert(
            "managed_cloud".to_string(),
            grant("other-access", "other-refresh"),
        );
        assert!(!replace_grant(&mut store, &expected, None));
        store.entries.remove("managed_cloud");
        assert!(replace_grant(
            &mut store,
            &expected,
            Some(grant("renewed", "rotated"))
        ));
        assert_eq!(
            store.entries.get("agiworkforce"),
            Some(&grant("renewed", "rotated"))
        );
    }

    #[test]
    fn login_replaces_the_shadow_alias_without_removing_other_providers() {
        let mut store = AuthStore::default();
        store
            .entries
            .insert("managed_cloud".to_string(), grant("old", "old-refresh"));
        store.entries.insert(
            "anthropic".to_string(),
            AuthEntry::ApiKey {
                key: "byok".to_string(),
            },
        );
        install_device_grant(&mut store, grant("new", "new-refresh"));
        assert!(!store.entries.contains_key("managed_cloud"));
        assert_eq!(
            store.entries.get("agiworkforce"),
            Some(&grant("new", "new-refresh"))
        );
        assert_eq!(
            store.entries.get("anthropic"),
            Some(&AuthEntry::ApiKey {
                key: "byok".to_string()
            })
        );
    }

    #[test]
    fn renewal_reconciles_only_duplicate_aliases() {
        let mut store = AuthStore::default();
        let original = grant("old", "old-refresh");
        for key in MANAGED_AUTH_KEYS {
            store.entries.insert(key.to_string(), original.clone());
        }
        let expected = stored_managed_grant(&store).unwrap();
        assert!(replace_grant(
            &mut store,
            &expected,
            Some(grant("renewed", "rotated"))
        ));
        assert_eq!(store.entries.len(), 1);
        assert_eq!(
            store.entries.get("managed_cloud"),
            Some(&grant("renewed", "rotated"))
        );
        store.entries.insert(
            "agiworkforce".to_string(),
            grant("unrelated", "unrelated-refresh"),
        );
        let expected = stored_managed_grant(&store).unwrap();
        assert!(replace_grant(&mut store, &expected, None));
        assert_eq!(
            store.entries.get("agiworkforce"),
            Some(&grant("unrelated", "unrelated-refresh"))
        );
    }

    #[test]
    fn refused_access_removal_preserves_replacement_and_unrelated_alias() {
        let mut store = AuthStore::default();
        store.entries.insert(
            "agiworkforce".to_string(),
            grant("new-access", "new-refresh"),
        );
        store.entries.insert(
            "managed_cloud".to_string(),
            grant("rejected", "old-refresh"),
        );
        assert!(forget_access(&mut store, "rejected"));
        assert_eq!(
            store.entries.get("agiworkforce"),
            Some(&grant("new-access", "new-refresh"))
        );
        assert!(!forget_access(&mut store, "rejected"));
        assert!(!forget_access(&mut store, ""));
    }

    #[test]
    fn signout_removal_prevents_pending_renewal_from_restoring_a_grant() {
        let mut store = AuthStore::default();
        store
            .entries
            .insert("agiworkforce".to_string(), grant("old", "old-refresh"));
        let expected = stored_managed_grant(&store).unwrap();
        let snapshot = store.entries.clone();
        forget_managed(&mut store);
        assert!(!replace_grant(
            &mut store,
            &expected,
            Some(grant("rotated", "rotated-refresh"))
        ));
        store.entries.insert(
            "agiworkforce".to_string(),
            grant("new-login", "new-refresh"),
        );
        assert!(!replace_grant(&mut store, &expected, None));
        assert_eq!(
            snapshot.get("agiworkforce"),
            Some(&grant("old", "old-refresh"))
        );
        assert_eq!(
            store.entries.get("agiworkforce"),
            Some(&grant("new-login", "new-refresh"))
        );
    }

    /// Signing out has to reach every key a sign-in wrote, and the caches the
    /// signed-in answer was kept in, or the next run reports the account of
    /// somebody who is no longer here.
    #[test]
    fn signing_out_drops_every_key_a_managed_credential_is_written_under() {
        let mut store = AuthStore::default();
        for key in MANAGED_AUTH_KEYS {
            store.entries.insert(
                (*key).to_string(),
                AuthEntry::ApiKey {
                    key: "held".to_string(),
                },
            );
        }
        store.entries.insert(
            "anthropic".to_string(),
            AuthEntry::ApiKey {
                key: "the user's own key".to_string(),
            },
        );

        forget_managed(&mut store);

        assert_eq!(
            store.entries.keys().collect::<Vec<_>>(),
            vec!["anthropic"],
            "sign-out left a managed credential behind, or took a key the user set themselves"
        );
    }

    #[test]
    fn signing_out_of_the_cli_drops_every_provider_and_says_so() {
        let mut store = AuthStore::default();
        for key in ["agiworkforce", "anthropic", "copilot"] {
            store.entries.insert(
                key.to_string(),
                AuthEntry::ApiKey {
                    key: "held".to_string(),
                },
            );
        }
        assert_eq!(forget_every_provider(&mut store), 3);
        assert!(store.entries.is_empty());
        assert_eq!(forget_every_provider(&mut store), 0);

        let report = |providers, revoked| CliSignOut { providers, revoked }.message();
        assert_eq!(report(0, true), "No active sessions to log out from.");
        assert_eq!(report(1, true), "Logged out from 1 provider.");
        assert_eq!(report(3, true), "Logged out from 3 providers.");
        assert!(report(1, false).contains("did not confirm the sign-out"));
    }

    #[test]
    fn account_state_follows_the_config_root_agiworkforce_home_selects() {
        let home_dir = concat!("dirs::", "home_dir()");
        for (file, source) in [
            ("app_server/account.rs", include_str!("account.rs")),
            ("tier_cache.rs", include_str!("../tier_cache.rs")),
            ("mcp/oauth_store.rs", include_str!("../mcp/oauth_store.rs")),
        ] {
            assert!(
                !source.contains(home_dir),
                "{file} keeps account state under the home directory, where a second AGIWORKFORCE_HOME reads the first account's"
            );
        }
    }

    /// The key a device grant is saved under is the key sign-out removes.
    #[test]
    fn the_key_a_sign_in_writes_is_one_sign_out_forgets() {
        let mut store = AuthStore::default();
        store.entries.insert(
            "agiworkforce".to_string(),
            AuthEntry::ApiKey {
                key: "granted".to_string(),
            },
        );
        forget_managed(&mut store);
        assert!(
            store.entries.is_empty(),
            "a device grant survives sign-out: save_device_grant writes a key MANAGED_AUTH_KEYS does not name"
        );
    }

    #[tokio::test]
    async fn a_local_or_byok_session_reads_no_account_status_from_the_cloud() {
        use crate::platform::runtime::session::PrivacyMode;
        use std::sync::atomic::{AtomicUsize, Ordering};
        use std::sync::Arc;

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let connections = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&connections);
        let server = tokio::spawn(async move {
            while let Ok((stream, _)) = listener.accept().await {
                counted.fetch_add(1, Ordering::SeqCst);
                drop(stream);
            }
        });
        let context = |base: &str| tier_cache::ManagedRequestContext {
            jwt: Some(token("account-a", "session-a", 1)),
            base: base.to_string(),
            owner: None,
        };

        for mode in [PrivacyMode::Local, PrivacyMode::Byok] {
            let snapshot = account_status_for(context(&base), mode, true).await;
            assert!(snapshot.signed_in);
            assert!(snapshot.cached);
            assert_eq!(snapshot.email, None);
            assert_eq!(snapshot.balance_credits, None);
            assert_eq!(snapshot.purchased_credits, None);
        }
        assert_eq!(
            connections.load(Ordering::SeqCst),
            0,
            "a Local or BYOK session reached the account for its status"
        );

        account_status_for(context(&base), PrivacyMode::Managed, false).await;
        assert!(
            connections.load(Ordering::SeqCst) > 0,
            "the probe never saw the managed read, so it proves nothing about the refused modes"
        );
        server.abort();
    }

    #[test]
    fn signing_out_of_the_account_counts_only_the_managed_grant() {
        let mut store = AuthStore::default();
        store.entries.insert(
            "anthropic".to_string(),
            AuthEntry::ApiKey {
                key: "the user's own key".to_string(),
            },
        );
        assert!(!holds_managed_grant(&store));

        store
            .entries
            .insert("agiworkforce".to_string(), grant("granted", "refresh"));
        assert!(holds_managed_grant(&store));

        forget_managed(&mut store);
        assert!(!holds_managed_grant(&store));
        assert!(store.entries.contains_key("anthropic"));
    }

    #[test]
    fn signing_in_or_out_forgets_a_managed_grant_the_store_would_not_return() {
        let mut unreadable = BTreeSet::from([
            "agiworkforce".to_string(),
            "managed_cloud".to_string(),
            "openai".to_string(),
        ]);
        assert!(forget_unreadable_managed(&mut unreadable));
        assert_eq!(
            unreadable.into_iter().collect::<Vec<_>>(),
            vec!["openai".to_string()],
            "a provider key the store would not return stays for its own sign-in"
        );

        let mut none = BTreeSet::from(["openai".to_string()]);
        assert!(!forget_unreadable_managed(&mut none));
        assert_eq!(none.len(), 1);
    }
}
