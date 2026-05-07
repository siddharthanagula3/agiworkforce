//! Tier cache — async Supabase tier query with 1-hour on-disk TTL.
//!
//! The CLI calls `resolve_user_tier()` at startup to determine which model pool
//! to default to.  It writes the result to
//! `~/.agiworkforce/cache/tier.toml` so subsequent runs don't block on a
//! network call.
//!
//! ## Flow
//! 1. Check `~/.agiworkforce/cache/tier.toml` — if present and < 1 h old, return cached tier.
//! 2. Query `AGIWORKFORCE_API_BASE/api/me` with `Authorization: Bearer <AGIWORKFORCE_JWT>`.
//! 3. Write result to cache.  On any error, return `None` (caller uses config default).
//!
//! ## Security
//! - JWT is read from `AGIWORKFORCE_JWT` env var or `~/.agiworkforce/auth.toml`.
//! - Request always uses HTTPS.
//! - Cache file is written atomically via temp-file + rename.
//! - Timeout: 3 seconds — never blocks interactive startup visibly.

#![allow(dead_code)]

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Time-to-live for the on-disk tier cache before we re-query.
const TIER_CACHE_TTL: Duration = Duration::from_secs(3_600); // 1 hour

/// Maximum time to wait for the tier API call.  If the server doesn't respond
/// within this window we return `None` and let the caller use a sensible default.
const TIER_FETCH_TIMEOUT: Duration = Duration::from_secs(3);

/// Cache file path relative to `~/.agiworkforce/`.
const TIER_CACHE_FILE: &str = "cache/tier.toml";

/// Default API base used when `AGIWORKFORCE_API_BASE` is not set.
const DEFAULT_API_BASE: &str = "https://agiworkforce.com";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// User's current subscription tier as returned by the AGI Workforce API.
///
/// Maps to the `plan_tier` column in `supabase/migrations/…/subscriptions`.
/// Keep in sync with the TypeScript `ProductTier` union in
/// `packages/types/src/model-catalog.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserTier {
    Free,
    Hobby,
    Pro,
    #[serde(rename = "pro_plus")]
    ProPlus,
    Max,
    /// BYOK / Local mode — tier enforcement is the user's responsibility.
    Byok,
}

impl UserTier {
    /// Returns the economy-bucket model ID that the CLI should default to when
    /// no explicit `--model` is specified for this tier.
    ///
    /// Free / Hobby → economy workhorse (first `tierAllowedModels.economy` entry).
    /// Pro and above → the user chose a managed-cloud tier; auto-economy is still
    /// the safest default for a CLI where the user hasn't pinned a model.
    /// BYOK → no managed-cloud default; callers must require `--model`.
    pub fn default_model_id(&self) -> Option<&'static str> {
        match self {
            UserTier::Free | UserTier::Hobby | UserTier::Pro | UserTier::ProPlus | UserTier::Max => {
                Some(crate::model_catalog::economy_default_model())
            }
            UserTier::Byok => None,
        }
    }

    /// Human-readable tier label for status-bar display (e.g. "Pro · 2.1M/10M tokens").
    pub fn label(&self) -> &'static str {
        match self {
            UserTier::Free => "Free",
            UserTier::Hobby => "Hobby",
            UserTier::Pro => "Pro",
            UserTier::ProPlus => "Pro+",
            UserTier::Max => "Max",
            UserTier::Byok => "BYOK",
        }
    }

    /// Monthly token cap for this tier (None = unlimited / user-managed).
    pub fn token_cap(&self) -> Option<u64> {
        match self {
            UserTier::Free => Some(100_000),
            UserTier::Hobby => Some(2_000_000),
            UserTier::Pro | UserTier::ProPlus => Some(10_000_000),
            UserTier::Max => Some(50_000_000),
            UserTier::Byok => None,
        }
    }
}

impl Default for UserTier {
    fn default() -> Self {
        UserTier::Free
    }
}

impl std::fmt::Display for UserTier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.label())
    }
}

// ---------------------------------------------------------------------------
// On-disk cache envelope
// ---------------------------------------------------------------------------

/// TOML file written to `~/.agiworkforce/cache/tier.toml`.
#[derive(Debug, Serialize, Deserialize)]
struct TierCacheEnvelope {
    /// The resolved tier string (must parse as `UserTier`).
    tier: String,
    /// Unix timestamp (seconds) when the cache was written.
    cached_at: u64,
    /// Monthly token usage at cache time (optional — for status-bar display).
    tokens_used: Option<u64>,
    /// Monthly token cap at cache time (mirrors `UserTier::token_cap()`).
    tokens_cap: Option<u64>,
}

fn tier_cache_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".agiworkforce")
        .join(TIER_CACHE_FILE)
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Read the cached tier from disk, returning `None` if absent or expired.
pub fn read_tier_cache() -> Option<CachedTier> {
    let path = tier_cache_path();
    let content = std::fs::read_to_string(&path).ok()?;
    let envelope: TierCacheEnvelope = toml::from_str(&content).ok()?;

    // Expire after TTL
    let age = now_secs().saturating_sub(envelope.cached_at);
    if age > TIER_CACHE_TTL.as_secs() {
        return None;
    }

    let tier = parse_tier_str(&envelope.tier)?;
    Some(CachedTier {
        tier,
        tokens_used: envelope.tokens_used,
        tokens_cap: envelope.tokens_cap,
    })
}

/// Write a fresh tier to the disk cache.  Errors are silently swallowed — a
/// failed cache write is never fatal.
pub fn write_tier_cache(tier: &UserTier, tokens_used: Option<u64>, tokens_cap: Option<u64>) {
    let path = tier_cache_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let envelope = TierCacheEnvelope {
        tier: tier_to_str(tier),
        cached_at: now_secs(),
        tokens_used,
        tokens_cap,
    };
    if let Ok(content) = toml::to_string(&envelope) {
        // Atomic write: temp file → rename
        let tmp = path.with_extension("tmp");
        if std::fs::write(&tmp, &content).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }
}

// ---------------------------------------------------------------------------
// Tier API response shape
// ---------------------------------------------------------------------------

/// Minimal shape returned by `GET /api/me`.
/// The web route nests subscription details under `plan`. Token usage is in
/// `credits` if present (the response also has user, feature_flags, etc. that
/// we don't need here).
#[derive(Debug, Deserialize)]
struct MeApiResponse {
    plan: Option<MePlan>,
    #[serde(default)]
    credits: Option<MeCredits>,
}

#[derive(Debug, Deserialize)]
struct MePlan {
    /// e.g. `"hobby"`, `"pro"`, `"free"`.
    tier: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MeCredits {
    #[serde(default)]
    used_cents: Option<u64>,
    #[serde(default)]
    allocated_cents: Option<u64>,
}

// ---------------------------------------------------------------------------
// Public resolved type
// ---------------------------------------------------------------------------

/// The resolved tier (from cache or network) plus optional usage figures for
/// the status-bar display.
#[derive(Debug, Clone)]
pub struct CachedTier {
    pub tier: UserTier,
    /// Tokens consumed in the current billing period (None if unknown).
    pub tokens_used: Option<u64>,
    /// Monthly cap (None for BYOK/Local).
    pub tokens_cap: Option<u64>,
}

impl CachedTier {
    /// Format a short status string for the TUI footer: `"Hobby · 1.3M/2M"`.
    pub fn status_label(&self) -> String {
        match (self.tokens_used, self.tokens_cap) {
            (Some(used), Some(cap)) => format!(
                "{} · {}/{}",
                self.tier.label(),
                format_token_count(used),
                format_token_count(cap),
            ),
            _ => self.tier.label().to_string(),
        }
    }
}

fn format_token_count(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.1}M", n as f64 / 1_000_000.0)
    } else if n >= 1_000 {
        format!("{:.0}K", n as f64 / 1_000.0)
    } else {
        n.to_string()
    }
}

// ---------------------------------------------------------------------------
// Network fetch
// ---------------------------------------------------------------------------

/// Resolve the user's tier: cache-first, then network, then `None`.
///
/// This function is intentionally non-blocking at the call site: it uses
/// `tokio::time::timeout` so it never exceeds `TIER_FETCH_TIMEOUT` (3 s).
///
/// # Arguments
/// * `jwt` — Supabase / AGI Workforce JWT (Bearer token).  If `None`, we skip
///   the network call and return only what's in the cache.
pub async fn resolve_user_tier(jwt: Option<&str>) -> Option<CachedTier> {
    // Fast path: return fresh cache without touching the network.
    if let Some(cached) = read_tier_cache() {
        return Some(cached);
    }

    // No cache or expired — try the network if we have credentials.
    let jwt = jwt?;
    if jwt.is_empty() {
        return None;
    }

    let api_base = std::env::var("AGIWORKFORCE_API_BASE")
        .unwrap_or_else(|_| DEFAULT_API_BASE.to_string());

    // Safety: only HTTPS allowed.
    if !api_base.starts_with("https://") {
        tracing::warn!(
            "[tier_cache] AGIWORKFORCE_API_BASE is not HTTPS — skipping tier fetch"
        );
        return None;
    }

    let url = format!(
        "{}/api/me",
        api_base.trim_end_matches('/')
    );

    let result = tokio::time::timeout(
        TIER_FETCH_TIMEOUT,
        fetch_tier_from_api(&url, jwt),
    )
    .await;

    match result {
        Ok(Ok(resp)) => {
            // Extract tier from nested plan object (apps/web /api/me shape).
            let tier_str = resp.plan.as_ref().and_then(|p| p.tier.clone())?;
            let tier = parse_tier_str(&tier_str)?;
            // Tokens used/cap come from credits object if present. We expose
            // these in the status bar; cents → tokens conversion is approximate
            // (1 cent ≈ 1K tokens for budget models — not exact but useful for
            // the rough "X / Y" status display).
            let tokens_used = resp.credits.as_ref().and_then(|c| c.used_cents).map(|c| c * 1000);
            let tokens_cap = resp.credits.as_ref().and_then(|c| c.allocated_cents).map(|c| c * 1000);
            write_tier_cache(&tier, tokens_used, tokens_cap);
            Some(CachedTier {
                tier,
                tokens_used,
                tokens_cap,
            })
        }
        Ok(Err(e)) => {
            tracing::debug!("[tier_cache] tier fetch failed: {e}");
            None
        }
        Err(_) => {
            tracing::debug!("[tier_cache] tier fetch timed out after {TIER_FETCH_TIMEOUT:?}");
            None
        }
    }
}

async fn fetch_tier_from_api(url: &str, jwt: &str) -> Result<MeApiResponse> {
    let client = reqwest::Client::builder()
        .timeout(TIER_FETCH_TIMEOUT)
        .build()?;

    let resp = client
        .get(url)
        .header("Authorization", format!("Bearer {jwt}"))
        .header("Accept", "application/json")
        .send()
        .await?;

    if !resp.status().is_success() {
        anyhow::bail!(
            "tier API returned HTTP {}",
            resp.status().as_u16()
        );
    }

    let body: MeApiResponse = resp.json().await?;
    Ok(body)
}

// ---------------------------------------------------------------------------
// String ↔ UserTier helpers
// ---------------------------------------------------------------------------

fn parse_tier_str(s: &str) -> Option<UserTier> {
    match s.to_lowercase().as_str() {
        "free" => Some(UserTier::Free),
        "hobby" => Some(UserTier::Hobby),
        "pro" => Some(UserTier::Pro),
        "pro_plus" | "pro+" => Some(UserTier::ProPlus),
        "max" | "enterprise" => Some(UserTier::Max),
        "byok" | "local" => Some(UserTier::Byok),
        _ => None,
    }
}

fn tier_to_str(t: &UserTier) -> String {
    match t {
        UserTier::Free => "free",
        UserTier::Hobby => "hobby",
        UserTier::Pro => "pro",
        UserTier::ProPlus => "pro_plus",
        UserTier::Max => "max",
        UserTier::Byok => "byok",
    }
    .to_string()
}

/// Load the user's JWT from `AGIWORKFORCE_JWT` env var or from the auth store
/// (`~/.agiworkforce/auth.toml`).  Returns `None` if no credential is found.
pub fn load_jwt() -> Option<String> {
    // Env var takes priority.
    if let Ok(jwt) = std::env::var("AGIWORKFORCE_JWT") {
        if !jwt.is_empty() {
            return Some(jwt);
        }
    }

    // Fall back to auth store — look for a `managed_cloud` or `agiworkforce` entry.
    let auth_path = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".agiworkforce")
        .join("auth.toml");
    let content = std::fs::read_to_string(&auth_path).ok()?;
    let table: toml::Value = toml::from_str(&content).ok()?;

    // Auth store shape: [entries.managed_cloud] / [entries.agiworkforce]
    // We look for a `token` key.
    let entries = table.get("entries")?.as_table()?;
    for key in &["managed_cloud", "agiworkforce"] {
        if let Some(entry) = entries.get(*key) {
            if let Some(token) = entry.get("token").and_then(|t| t.as_str()) {
                if !token.is_empty() {
                    return Some(token.to_string());
                }
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_tier_str_recognizes_all_variants() {
        assert_eq!(parse_tier_str("free"), Some(UserTier::Free));
        assert_eq!(parse_tier_str("hobby"), Some(UserTier::Hobby));
        assert_eq!(parse_tier_str("pro"), Some(UserTier::Pro));
        assert_eq!(parse_tier_str("pro_plus"), Some(UserTier::ProPlus));
        assert_eq!(parse_tier_str("pro+"), Some(UserTier::ProPlus));
        assert_eq!(parse_tier_str("max"), Some(UserTier::Max));
        assert_eq!(parse_tier_str("enterprise"), Some(UserTier::Max));
        assert_eq!(parse_tier_str("byok"), Some(UserTier::Byok));
        assert_eq!(parse_tier_str("local"), Some(UserTier::Byok));
        assert_eq!(parse_tier_str("unknown"), None);
    }

    #[test]
    fn free_tier_default_model_is_economy() {
        // The free tier's default model must exist in the economy bucket.
        let model = UserTier::Free.default_model_id();
        assert!(
            model.is_some(),
            "Free tier must have a default model ID"
        );
        // Verify it's not empty
        assert!(
            !model.unwrap().is_empty(),
            "Default model ID must not be empty"
        );
    }

    #[test]
    fn byok_has_no_default_model() {
        assert_eq!(UserTier::Byok.default_model_id(), None);
    }

    #[test]
    fn status_label_formats_token_counts() {
        let cached = CachedTier {
            tier: UserTier::Hobby,
            tokens_used: Some(1_320_000),
            tokens_cap: Some(2_000_000),
        };
        let label = cached.status_label();
        assert!(
            label.contains("Hobby"),
            "Label should contain tier name: {label}"
        );
        assert!(
            label.contains("1.3M"),
            "Label should format used tokens: {label}"
        );
        assert!(
            label.contains("2.0M"),
            "Label should format cap tokens: {label}"
        );
    }

    #[test]
    fn status_label_no_tokens_shows_tier_only() {
        let cached = CachedTier {
            tier: UserTier::Pro,
            tokens_used: None,
            tokens_cap: None,
        };
        assert_eq!(cached.status_label(), "Pro");
    }

    #[test]
    fn format_token_count_scales_correctly() {
        assert_eq!(format_token_count(500), "500");
        assert_eq!(format_token_count(1_500), "2K");
        assert_eq!(format_token_count(1_000_000), "1.0M");
        assert_eq!(format_token_count(2_100_000), "2.1M");
    }

    #[test]
    fn tier_cache_roundtrip_toml() {
        // Verify TOML serialization round-trips cleanly.
        let envelope = TierCacheEnvelope {
            tier: "hobby".to_string(),
            cached_at: 1_746_000_000,
            tokens_used: Some(500_000),
            tokens_cap: Some(2_000_000),
        };
        let serialized = toml::to_string(&envelope).expect("should serialize");
        let back: TierCacheEnvelope =
            toml::from_str(&serialized).expect("should deserialize");
        assert_eq!(back.tier, "hobby");
        assert_eq!(back.tokens_used, Some(500_000));
    }
}
