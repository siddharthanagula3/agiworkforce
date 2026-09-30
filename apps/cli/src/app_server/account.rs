//! Account surface shared by the CLI and the editor client.
//!
//! Every answer comes from the CLI's own credential store and caches, so both
//! surfaces report the same identity, the same plan, and the same balance
//! without a second login.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
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

fn read_account_cache() -> Option<AccountCacheEnvelope> {
    let content = std::fs::read_to_string(account_cache_path()?).ok()?;
    let envelope: AccountCacheEnvelope = toml::from_str(&content).ok()?;
    let age = now_secs().saturating_sub(envelope.cached_at);
    (age <= ACCOUNT_CACHE_TTL.as_secs()).then_some(envelope)
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
    let credential = managed_credential();
    let Some((jwt, _)) = credential else {
        return AccountSnapshot {
            signed_in: false,
            cached: true,
            ..AccountSnapshot::default()
        };
    };

    if refresh {
        tier_cache::invalidate_tier_cache();
        clear_account_cache();
    }

    let tier_was_cached = tier_cache::read_tier_cache().is_some();
    let resolved = tier_cache::resolve_user_tier(Some(&jwt)).await;
    let tier = resolved
        .cached
        .map(|cached| tier_cache::tier_slug(&cached.tier));

    if let Some(envelope) = read_account_cache() {
        return AccountSnapshot {
            signed_in: true,
            email: envelope.email,
            tier,
            balance_credits: envelope.balance_credits,
            purchased_credits: envelope.purchased_credits,
            cached: tier_was_cached,
        };
    }

    let email = fetch_email(&jwt).await;
    let (balance_credits, purchased_credits) = fetch_credits(&jwt).await;
    write_account_cache(&AccountCacheEnvelope {
        email: email.clone(),
        balance_credits,
        purchased_credits,
        cached_at: now_secs(),
    });

    AccountSnapshot {
        signed_in: true,
        email,
        tier,
        balance_credits,
        purchased_credits,
        cached: false,
    }
}

async fn fetch_email(jwt: &str) -> Option<String> {
    let raw_base = std::env::var("AGIWORKFORCE_API_BASE")
        .unwrap_or_else(|_| tier_cache::default_api_base().to_string());
    let base = tier_cache::resolve_agi_api_base(&raw_base)?;
    let client = reqwest::Client::builder()
        .timeout(ME_FETCH_TIMEOUT)
        .build()
        .ok()?;
    let response = client
        .get(format!("{base}/api/me"))
        .header("Authorization", format!("Bearer {jwt}"))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body: MeResponse = response.json().await.ok()?;
    if let Some(plan_tier) = body.plan.as_ref().and_then(|plan| plan.tier.as_deref()) {
        tier_cache::adopt_server_plan(plan_tier);
    }
    body.email.filter(|email| !email.is_empty())
}

/// Plan allowance left this month and the separately purchased balance.
async fn fetch_credits(jwt: &str) -> (Option<f64>, Option<f64>) {
    match crate::usage_summary::fetch_account_usage(jwt).await {
        Ok(usage) => match usage.credits {
            Some(credits) => (Some(credits.monthly.remaining), credits.purchased.remaining),
            None => (None, None),
        },
        Err(_) => (None, None),
    }
}

/// Base URL of the device-grant endpoints, honouring the same override the
/// terminal login flow honours.
pub fn device_auth_base() -> String {
    std::env::var("AGI_AUTH_BASE")
        .ok()
        .filter(|base| !base.trim().is_empty())
        .unwrap_or_else(|| crate::auth::agiworkforce_api_base().to_string())
}

/// Persist a completed device grant under the CLI's own credential key, so the
/// next `agi` run in a terminal is signed in too.
pub fn save_device_grant(entry: AuthEntry) -> Result<()> {
    let mut store = AuthStore::load().context("Failed to read the credential store")?;
    store.entries.insert("agiworkforce".to_string(), entry);
    store.save().context("Failed to save the credential")?;
    tier_cache::invalidate_tier_cache();
    clear_account_cache();
    Ok(())
}

/// Every key a managed credential is held under, dropped from the store.
fn forget_managed(store: &mut AuthStore) {
    for key in MANAGED_AUTH_KEYS {
        store.entries.remove(key);
    }
}

const RENEW_WITHIN_MS: i64 = 24 * 60 * 60 * 1000;

fn expiring_refresh_token(store: &AuthStore) -> Option<String> {
    match store.entries.get("agiworkforce") {
        Some(AuthEntry::OAuth {
            refresh, expires, ..
        }) if !refresh.is_empty()
            && *expires > 0
            && *expires - chrono::Utc::now().timestamp_millis() < RENEW_WITHIN_MS =>
        {
            Some(refresh.clone())
        }
        _ => None,
    }
}

async fn lock_device_session() -> Option<std::fs::File> {
    let path = crate::config::CliConfig::config_dir()
        .ok()?
        .join("device-session.lock");
    tokio::task::spawn_blocking(move || {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(path)
            .ok()?;
        file.lock().ok()?;
        Some(file)
    })
    .await
    .ok()
    .flatten()
}

pub async fn renew_managed_session_if_expiring() -> Option<String> {
    expiring_refresh_token(&AuthStore::load().ok()?)?;
    let _lock = lock_device_session().await?;
    let refresh = expiring_refresh_token(&AuthStore::load().ok()?)?;
    match crate::oauth::renew_device_session(&device_auth_base(), &refresh).await {
        crate::oauth::DeviceSessionRenewal::Renewed(entry) => save_device_grant(entry)
            .err()
            .map(|error| format!("The renewed AGI Workforce session could not be saved: {error:#}. Run agi login.")),
        crate::oauth::DeviceSessionRenewal::Refused(reason) => reason,
        crate::oauth::DeviceSessionRenewal::Revoked => Some(match logout() {
            Ok(()) => "Your AGI Workforce session ended. Sign in again to continue.".to_string(),
            Err(error) => format!(
                "Your AGI Workforce session ended, and the saved credential could not be removed: {error:#}. Run agi logout, then sign in again."
            ),
        }),
        crate::oauth::DeviceSessionRenewal::Unavailable => None,
    }
}

/// What became of a session the server refused (401) before its access token
/// was due to expire, as happens when the account enrolls a passkey or the
/// device is unlinked on the web.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RejectedSessionRecovery {
    /// A fresh access token is stored; the call can be made again once.
    Renewed,
    /// The credential is gone and was forgotten here: sign in again.
    Ended(String),
    /// The account has to act on the web first; the credential is kept.
    Refused(String),
    /// Nothing could be decided now; the refusal stands for this call.
    Unavailable,
}

pub const SESSION_ENDED_MESSAGE: &str =
    "Your AGI Workforce session ended. Sign in again to continue.";

fn stored_managed_grant(store: &AuthStore) -> Option<(String, String)> {
    match store.entries.get("agiworkforce") {
        Some(AuthEntry::OAuth {
            access, refresh, ..
        }) => Some((access.clone(), refresh.clone())),
        _ => None,
    }
}

#[derive(Debug, PartialEq, Eq)]
enum RecoveryStep {
    AlreadyRenewed,
    NothingStored,
    Forget,
    Refresh(String),
}

/// A stored token other than the refused one was renewed by another process;
/// a grant with no refresh credential cannot be renewed and is forgotten.
fn next_recovery_step(stored: Option<(String, String)>, rejected_access: &str) -> RecoveryStep {
    match stored {
        None => RecoveryStep::NothingStored,
        Some((access, _)) if !access.is_empty() && access != rejected_access => {
            RecoveryStep::AlreadyRenewed
        }
        Some((_, refresh)) if refresh.is_empty() => RecoveryStep::Forget,
        Some((_, refresh)) => RecoveryStep::Refresh(refresh),
    }
}

fn forget_session() -> RejectedSessionRecovery {
    RejectedSessionRecovery::Ended(match logout() {
        Ok(()) => SESSION_ENDED_MESSAGE.to_string(),
        Err(error) => format!(
            "{SESSION_ENDED_MESSAGE} The saved credential could not be removed: {error:#}. Run agi logout."
        ),
    })
}

/// Try one refresh after a 401, under the same lock renewal takes. A token
/// another process already replaced counts as renewed. A refresh credential the
/// server also refuses (invalid_grant), or none at all, is forgotten so the
/// account reads as signed out and the desktop signs this machine in again.
pub async fn recover_rejected_session(rejected_access: &str) -> RejectedSessionRecovery {
    // A token given in the environment is not this store's to renew or forget.
    if std::env::var("AGIWORKFORCE_JWT").is_ok_and(|jwt| !jwt.is_empty()) {
        return RejectedSessionRecovery::Unavailable;
    }
    let Some(_lock) = lock_device_session().await else {
        return RejectedSessionRecovery::Unavailable;
    };
    let stored = AuthStore::load()
        .ok()
        .as_ref()
        .and_then(stored_managed_grant);
    let refresh = match next_recovery_step(stored, rejected_access) {
        RecoveryStep::AlreadyRenewed => return RejectedSessionRecovery::Renewed,
        RecoveryStep::NothingStored => return RejectedSessionRecovery::Unavailable,
        RecoveryStep::Forget => return forget_session(),
        RecoveryStep::Refresh(refresh) => refresh,
    };
    match crate::oauth::renew_device_session(&device_auth_base(), &refresh).await {
        crate::oauth::DeviceSessionRenewal::Renewed(entry) => match save_device_grant(entry) {
            Ok(()) => RejectedSessionRecovery::Renewed,
            Err(error) => RejectedSessionRecovery::Refused(format!(
                "The renewed AGI Workforce session could not be saved: {error:#}. Run agi login."
            )),
        },
        crate::oauth::DeviceSessionRenewal::Revoked => forget_session(),
        crate::oauth::DeviceSessionRenewal::Refused(reason) => {
            RejectedSessionRecovery::Refused(reason.unwrap_or_else(|| {
                "AGI Workforce did not renew this session. Sign in again on agiworkforce.com."
                    .to_string()
            }))
        }
        crate::oauth::DeviceSessionRenewal::Unavailable => RejectedSessionRecovery::Unavailable,
    }
}

/// A second 401 right after a renewal means the account itself refuses this
/// device, so the credential is forgotten rather than retried for ever.
pub fn forget_refused_session() -> String {
    match forget_session() {
        RejectedSessionRecovery::Ended(message) => message,
        _ => SESSION_ENDED_MESSAGE.to_string(),
    }
}

pub async fn revoke_managed_sessions() -> bool {
    let Ok(store) = AuthStore::load() else {
        return true;
    };
    let base = device_auth_base();
    let mut confirmed = true;
    for key in MANAGED_AUTH_KEYS {
        if let Some(AuthEntry::OAuth {
            access, refresh, ..
        }) = store.entries.get(key)
        {
            if access.is_empty() && refresh.is_empty() {
                continue;
            }
            confirmed &= crate::oauth::revoke_device_session(&base, access, refresh).await;
        }
    }
    confirmed
}

pub async fn sign_out() -> Result<bool> {
    let confirmed = revoke_managed_sessions().await;
    logout()?;
    Ok(confirmed)
}

/// Forget the managed credential on this machine.
pub fn logout() -> Result<()> {
    let mut store = AuthStore::load().context("Failed to read the credential store")?;
    forget_managed(&mut store);
    store
        .save()
        .context("Failed to update the credential store")?;
    forget_account_caches();
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CliSignOut {
    pub providers: usize,
    pub revoked: bool,
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

/// `agi logout`, and /logout in the TUI and the REPL: the AGI Cloud sessions
/// are revoked, then every stored credential, the caches that answered for the
/// account and, as Claude Code's /logout does, the first-run setup are dropped.
pub async fn sign_out_of_every_provider() -> Result<CliSignOut> {
    let revoked = revoke_managed_sessions().await;
    let mut store = AuthStore::load().context("Failed to read the credential store")?;
    let providers = forget_every_provider(&mut store);
    if providers > 0 {
        store
            .save()
            .context("Failed to update the credential store")?;
        crate::onboarding::forget_setup();
    }
    forget_account_caches();
    Ok(CliSignOut { providers, revoked })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_refused_session_is_renewed_once_or_forgotten() {
        let grant = |access: &str, refresh: &str| Some((access.to_string(), refresh.to_string()));
        assert_eq!(
            next_recovery_step(grant("refused", "r-1"), "refused"),
            RecoveryStep::Refresh("r-1".to_string())
        );
        assert_eq!(
            next_recovery_step(grant("newer", "r-2"), "refused"),
            RecoveryStep::AlreadyRenewed
        );
        assert_eq!(
            next_recovery_step(grant("refused", ""), "refused"),
            RecoveryStep::Forget
        );
        assert_eq!(
            next_recovery_step(None, "refused"),
            RecoveryStep::NothingStored
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
}
