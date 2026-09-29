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
use agiworkforce_protocol::developer_session::{
    ProviderKeySource, ProviderKeySummary, ProviderKeysListResponse,
};

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

fn account_cache_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".agiworkforce")
        .join(ACCOUNT_CACHE_FILE)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn read_account_cache() -> Option<AccountCacheEnvelope> {
    let content = std::fs::read_to_string(account_cache_path()).ok()?;
    let envelope: AccountCacheEnvelope = toml::from_str(&content).ok()?;
    let age = now_secs().saturating_sub(envelope.cached_at);
    (age <= ACCOUNT_CACHE_TTL.as_secs()).then_some(envelope)
}

fn write_account_cache(envelope: &AccountCacheEnvelope) {
    let path = account_cache_path();
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
    let _ = std::fs::remove_file(account_cache_path());
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
        crate::oauth::DeviceSessionRenewal::Unavailable => None,
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
    tier_cache::invalidate_tier_cache();
    clear_account_cache();
    Ok(())
}

const MAX_PROVIDER_KEY_CHARS: usize = 4_096;

pub fn provider_keys() -> Result<ProviderKeysListResponse> {
    let store = AuthStore::load().context("Failed to read the credential store")?;
    let providers = crate::auth::api_key_providers()
        .iter()
        .map(|provider| ProviderKeySummary {
            id: provider.id.to_string(),
            label: provider.label.to_string(),
            env_var: provider.env_var.to_string(),
            source: if matches!(
                store.entries.get(provider.id),
                Some(AuthEntry::ApiKey { .. })
            ) {
                Some(ProviderKeySource::Stored)
            } else if std::env::var(provider.env_var).is_ok_and(|value| !value.trim().is_empty()) {
                Some(ProviderKeySource::Environment)
            } else {
                None
            },
        })
        .collect();
    Ok(ProviderKeysListResponse { providers })
}

pub fn validate_provider_key(key: &str) -> std::result::Result<&str, &'static str> {
    let key = key.trim();
    if key.is_empty() {
        return Err("Paste the API key");
    }
    if key.chars().count() > MAX_PROVIDER_KEY_CHARS {
        return Err("That is longer than any provider's API key");
    }
    if key.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("An API key has no spaces or line breaks");
    }
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

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
