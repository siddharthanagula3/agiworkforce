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

/// Forget the managed credential on this machine.
pub fn logout() -> Result<()> {
    let mut store = AuthStore::load().context("Failed to read the credential store")?;
    for key in MANAGED_AUTH_KEYS {
        store.entries.remove(key);
    }
    store
        .save()
        .context("Failed to update the credential store")?;
    tier_cache::invalidate_tier_cache();
    clear_account_cache();
    Ok(())
}
