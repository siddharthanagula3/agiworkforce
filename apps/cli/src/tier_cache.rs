//! Tier cache — async managed-account tier query with 1-hour on-disk TTL.
//!
//! The CLI calls `resolve_user_tier()` at startup to determine which model pool
//! to default to.  It writes the result to
//! `~/.agiworkforce/cache/tier.toml` so subsequent runs don't block on a
//! network call.
//!
//! ## Tier model
//! Canonical `ProductTier` (from `packages/contracts/types/src/model-catalog.ts`):
//!   `free` | `pro` | `max` | `enterprise`
//! The CLI also tracks `byok` for Local/BYOK sessions (not a server-side tier).
//! Subscription is a flat model — NO token caps, NO credits, NO usage cents.
//! The single source of truth for tier strings is `normalizeProductTier` in
//! `packages/contracts/types/src/model-catalog.ts`: team→Pro, else unknown→Free (fail-closed).
//!
//! ## Flow
//! 1. Check `~/.agiworkforce/cache/tier.toml` — if present and < 1 h old, return cached tier.
//! 2. Query `AGIWORKFORCE_API_BASE/api/me` with `Authorization: Bearer <AGIWORKFORCE_JWT>`.
//! 3. Write result to cache.  On any error, return `None` (caller uses config default).
//!
//! ## Security
//! - JWT is read from `AGIWORKFORCE_JWT`, then `~/.agiworkforce/auth.json`
//!   written by `agi login`, then the legacy `~/.agiworkforce/auth.toml`.
//! - Request always uses HTTPS, and only to an allowlisted `*.agiworkforce.com` host.
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
/// `/api/me` lives on the root host (verified: apps/web/app/api/me/route.ts).
const DEFAULT_API_BASE: &str = "https://agiworkforce.com";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// User's current subscription tier as returned by the AGI Workforce API.
///
/// Mirrors the canonical `ProductTier` union in `packages/contracts/types/src/model-catalog.ts`:
///   `free` | `pro` | `max` | `enterprise`
/// Plus `Byok` which is a CLI-side classification for Local/BYOK sessions (no server tier).
///
/// Keep in sync with `normalizeProductTier` in `packages/contracts/types/src/model-catalog.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum UserTier {
    #[default]
    Free,
    Pro,
    Max,
    Enterprise,
    /// BYOK / Local mode — tier enforcement is the user's responsibility.
    Byok,
}

impl UserTier {
    /// Returns the economy-bucket model ID that the CLI should default to when
    /// no explicit `--model` is specified for this tier.
    ///
    /// All managed tiers (Free/Pro/Max/Enterprise) default to the economy workhorse
    /// (first `tierAllowedModels.economy` entry in models.json).  The economy default
    /// is the safest choice for a CLI where the user hasn't pinned a model; it does NOT
    /// restrict which models the user can select via `--model`.
    ///
    /// BYOK → `None` (no managed-cloud default; callers must require `--model`).
    pub fn default_model_id(&self) -> Option<&'static str> {
        match self {
            UserTier::Free | UserTier::Pro | UserTier::Max | UserTier::Enterprise => {
                Some(crate::model_catalog::economy_default_model())
            }
            UserTier::Byok => None,
        }
    }

    /// Human-readable tier label for status-bar display.
    pub fn label(&self) -> &'static str {
        match self {
            UserTier::Free => "Free",
            UserTier::Pro => "Pro",
            UserTier::Max => "Max",
            UserTier::Enterprise => "Enterprise",
            UserTier::Byok => "BYOK",
        }
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
/// Only the tier string and timestamp are persisted — no token/credit fields
/// (the flat subscription model has no usage metering on the CLI side).
#[derive(Debug, Serialize, Deserialize)]
struct TierCacheEnvelope {
    /// The resolved tier string (must parse as `UserTier`).
    tier: String,
    /// Unix timestamp (seconds) when the cache was written.
    cached_at: u64,
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
    Some(CachedTier { tier })
}

/// Write a fresh tier to the disk cache.  Errors are silently swallowed — a
/// failed cache write is never fatal.
pub fn write_tier_cache(tier: &UserTier) {
    let path = tier_cache_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let envelope = TierCacheEnvelope {
        tier: tier_to_str(tier),
        cached_at: now_secs(),
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
/// The web route nests subscription details under `plan`.
/// We no longer read `credits` — the flat subscription model has no per-use credits.
#[derive(Debug, Deserialize)]
struct MeApiResponse {
    plan: Option<MePlan>,
}

#[derive(Debug, Deserialize)]
struct MePlan {
    /// e.g. `"free"`, `"pro"`, `"max"`, `"enterprise"`, `"team"`.
    tier: Option<String>,
}

// ---------------------------------------------------------------------------
// Resolution result
// ---------------------------------------------------------------------------

/// The resolved tier (from cache or network) and whether a 401 was seen.
/// A 401 means the managed token has expired and the user should re-authenticate.
#[derive(Debug, Clone, Default)]
pub struct TierResolution {
    /// The resolved tier, if available (from cache or network).
    pub cached: Option<CachedTier>,
    /// True when the network returned HTTP 401 — signals the caller to print a
    /// re-auth hint.  Callers MUST NOT block Local/BYOK runs when this is true.
    pub needs_reauth: bool,
}

/// The resolved tier (from cache or network).
#[derive(Debug, Clone)]
pub struct CachedTier {
    pub tier: UserTier,
}

impl CachedTier {
    /// Format a short status string for the TUI footer showing tier label only.
    /// The flat subscription model has no per-session token counters.
    pub fn status_label(&self) -> String {
        self.tier.label().to_string()
    }
}

// ---------------------------------------------------------------------------
// Host allowlist helper
// ---------------------------------------------------------------------------

/// Resolve the API base URL, applying an allowlist that requires:
/// - https:// scheme, AND
/// - host that ends with `agiworkforce.com` (exact match or subdomain).
///
/// This closes the JWT-exfiltration risk where an attacker-controlled
/// `AGIWORKFORCE_API_BASE` env var would cause the CLI to send the Bearer
/// token to an arbitrary host.
///
/// Returns `None` (skip fetch, log warning) if the URL fails the allowlist.
/// Pass `raw` as the raw env-var value (or `DEFAULT_API_BASE` as the default).
pub fn resolve_agi_api_base(raw: &str) -> Option<String> {
    if !raw.starts_with("https://") {
        tracing::warn!(
            "[tier_cache] API base '{}' is not HTTPS — skipping tier fetch",
            raw
        );
        return None;
    }

    // Extract the host portion: everything after "https://" up to the first "/" or end.
    let after_scheme = &raw["https://".len()..];
    let host = after_scheme.split('/').next().unwrap_or("");

    // Host must be exactly "agiworkforce.com" or end with ".agiworkforce.com".
    let host_ok = host == "agiworkforce.com" || host.ends_with(".agiworkforce.com");

    if !host_ok {
        tracing::warn!(
            "[tier_cache] AGIWORKFORCE_API_BASE host '{}' is not an agiworkforce.com domain — skipping tier fetch to prevent token exfiltration",
            host
        );
        return None;
    }

    Some(raw.trim_end_matches('/').to_string())
}

// ---------------------------------------------------------------------------
// Tier rank helper (for free-doesn't-clobber-higher logic)
// ---------------------------------------------------------------------------

/// Numeric rank for reconcile logic: higher rank = higher privilege.
/// Byok is orthogonal (not a managed tier), ranked 0.
/// Enterprise is ranked >= Max.
fn tier_rank(t: &UserTier) -> u8 {
    match t {
        UserTier::Byok => 0,
        UserTier::Free => 1,
        UserTier::Pro => 2,
        UserTier::Max => 3,
        UserTier::Enterprise => 4,
    }
}

/// Reconcile a freshly-fetched tier against a still-valid cached tier.
///
/// `/api/me` fails OPEN to `plan.tier='free'` on transient DB/auth errors,
/// so a freshly-fetched `Free` is non-authoritative when a higher tier is
/// still valid in the cache.  Prefer the cached tier in that case.
///
/// If the fetched tier is higher (or equal), use the fetched tier (cache refresh).
pub fn reconcile_fetched_tier(fetched: &UserTier, cached: &UserTier) -> UserTier {
    if tier_rank(fetched) >= tier_rank(cached) {
        fetched.clone()
    } else {
        // fetched is lower (e.g. Free returned on a DB hiccup) — keep cached.
        cached.clone()
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
/// Returns a `TierResolution` with:
///   - `cached`: the resolved tier (from cache or network)
///   - `needs_reauth`: true when the network returned HTTP 401
///
/// # Arguments
/// * `jwt` — AGI Workforce JWT (Bearer token).  If `None`, we skip
///   the network call and return only what's in the cache.
pub async fn resolve_user_tier(jwt: Option<&str>) -> TierResolution {
    // Fast path: return fresh cache without touching the network.
    if let Some(cached) = read_tier_cache() {
        return TierResolution {
            cached: Some(cached),
            needs_reauth: false,
        };
    }

    // No cache or expired — try the network if we have credentials.
    let jwt = match jwt {
        Some(j) if !j.is_empty() => j,
        _ => {
            return TierResolution {
                cached: None,
                needs_reauth: false,
            }
        }
    };

    let raw_base =
        std::env::var("AGIWORKFORCE_API_BASE").unwrap_or_else(|_| DEFAULT_API_BASE.to_string());

    let api_base = match resolve_agi_api_base(&raw_base) {
        Some(b) => b,
        None => {
            return TierResolution {
                cached: None,
                needs_reauth: false,
            }
        }
    };

    let url = format!("{}/api/me", api_base);

    let result = tokio::time::timeout(TIER_FETCH_TIMEOUT, fetch_tier_from_api(&url, jwt)).await;

    match result {
        Ok(Ok(resp)) => {
            let tier_str = match resp.plan.as_ref().and_then(|p| p.tier.as_deref()) {
                Some(s) => s.to_string(),
                None => {
                    tracing::debug!("[tier_cache] /api/me returned no plan.tier");
                    return TierResolution {
                        cached: None,
                        needs_reauth: false,
                    };
                }
            };

            // Fail-closed: unknown tier strings → Free (never crash, never silently grant
            // a higher tier).
            let fetched_tier = parse_tier_str(&tier_str);

            // If fetch returns Free, prefer any valid higher-ranked cache entry
            // (handles /api/me failing-open to 'free' on transient DB errors).
            // Note: we just checked the cache above (fast path); if we reach here the
            // cache was expired/absent, so no live cached tier to protect.
            // We still run reconcile in case a stale-but-readable entry exists.
            let existing_cache = read_tier_cache();
            let resolved = match (fetched_tier, existing_cache) {
                (Some(fetched), Some(existing)) => reconcile_fetched_tier(&fetched, &existing.tier),
                (Some(fetched), None) => fetched,
                (None, Some(existing)) => existing.tier, // unknown string → keep cache
                (None, None) => {
                    // Unknown server tier string — fail-closed to Free.
                    tracing::debug!(
                        "[tier_cache] Unknown tier string '{}' from /api/me — defaulting to Free (fail-closed)",
                        tier_str
                    );
                    UserTier::Free
                }
            };

            write_tier_cache(&resolved);
            TierResolution {
                cached: Some(CachedTier { tier: resolved }),
                needs_reauth: false,
            }
        }
        Ok(Err(FetchError::Unauthorized)) => {
            tracing::debug!("[tier_cache] /api/me returned 401 — managed token expired");
            // Do NOT write 'free' to cache on a 401; the token is expired, not the tier.
            TierResolution {
                cached: None,
                needs_reauth: true,
            }
        }
        Ok(Err(FetchError::Other(e))) => {
            tracing::debug!("[tier_cache] tier fetch failed: {e}");
            TierResolution {
                cached: None,
                needs_reauth: false,
            }
        }
        Err(_) => {
            tracing::debug!("[tier_cache] tier fetch timed out after {TIER_FETCH_TIMEOUT:?}");
            TierResolution {
                cached: None,
                needs_reauth: false,
            }
        }
    }
}

#[derive(Debug)]
enum FetchError {
    Unauthorized,
    Other(anyhow::Error),
}

impl From<anyhow::Error> for FetchError {
    fn from(e: anyhow::Error) -> Self {
        FetchError::Other(e)
    }
}

async fn fetch_tier_from_api(url: &str, jwt: &str) -> Result<MeApiResponse, FetchError> {
    let client = reqwest::Client::builder()
        .timeout(TIER_FETCH_TIMEOUT)
        .build()
        .map_err(|e| FetchError::Other(anyhow::anyhow!("{e}")))?;

    let resp = client
        .get(url)
        .header("Authorization", format!("Bearer {jwt}"))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| FetchError::Other(anyhow::anyhow!("{e}")))?;

    if resp.status().as_u16() == 401 {
        return Err(FetchError::Unauthorized);
    }

    if !resp.status().is_success() {
        return Err(FetchError::Other(anyhow::anyhow!(
            "tier API returned HTTP {}",
            resp.status().as_u16()
        )));
    }

    let body: MeApiResponse = resp
        .json()
        .await
        .map_err(|e| FetchError::Other(anyhow::anyhow!("{e}")))?;
    Ok(body)
}

// ---------------------------------------------------------------------------
// String ↔ UserTier helpers
// ---------------------------------------------------------------------------

/// Map a server-returned tier string to `UserTier`.
///
/// Mirrors `normalizeProductTier` in `packages/contracts/types/src/model-catalog.ts`:
///   "free"             → `Free`
///   "pro" | "team"     → `Pro`   (Clerk "team" plan normalizes to Pro)
///   "max"              → `Max`
///   "enterprise"       → `Enterprise`
///   "byok" | "local"   → `Byok`  (CLI-only, never emitted by the server)
///   <unknown>          → `None`  (callers should treat as fail-closed Free)
///
/// FAIL-CLOSED: an unrecognized server string returns `None` so it is never
/// silently promoted to a higher tier.  Callers default unresolved strings to
/// `UserTier::Free`.
fn parse_tier_str(s: &str) -> Option<UserTier> {
    match s.to_lowercase().as_str() {
        "free" => Some(UserTier::Free),
        "pro" | "team" => Some(UserTier::Pro),
        "max" => Some(UserTier::Max),
        "enterprise" => Some(UserTier::Enterprise),
        "byok" | "local" => Some(UserTier::Byok),
        _ => None,
    }
}

fn tier_to_str(t: &UserTier) -> String {
    match t {
        UserTier::Free => "free",
        UserTier::Pro => "pro",
        UserTier::Max => "max",
        UserTier::Enterprise => "enterprise",
        UserTier::Byok => "byok",
    }
    .to_string()
}

fn jwt_from_auth_store(store: &crate::auth::AuthStore) -> Option<String> {
    for key in ["managed_cloud", "agiworkforce"] {
        let Some(entry) = store.entries.get(key) else {
            continue;
        };
        let token = match entry {
            crate::auth::AuthEntry::OAuth { access, .. } => access,
            crate::auth::AuthEntry::ApiKey { key } => key,
        };
        if !token.is_empty() {
            return Some(token.clone());
        }
    }
    None
}

fn jwt_from_legacy_auth_toml(content: &str) -> Option<String> {
    let table: toml::Value = toml::from_str(content).ok()?;
    let entries = table.get("entries")?.as_table()?;
    for key in ["managed_cloud", "agiworkforce"] {
        if let Some(entry) = entries.get(key) {
            if let Some(token) = entry.get("token").and_then(|t| t.as_str()) {
                if !token.is_empty() {
                    return Some(token.to_string());
                }
            }
        }
    }
    None
}

/// Load the user's JWT from `AGIWORKFORCE_JWT` env var or from the auth store.
/// Returns `None` if no credential is found.
pub fn load_jwt() -> Option<String> {
    // Env var takes priority.
    if let Ok(jwt) = std::env::var("AGIWORKFORCE_JWT") {
        if !jwt.is_empty() {
            return Some(jwt);
        }
    }

    // Primary CLI auth store written by `agi login`.
    if let Ok(store) = crate::auth::load_auth() {
        if let Some(token) = jwt_from_auth_store(&store) {
            return Some(token);
        }
    }

    // Legacy auth store — look for a `managed_cloud` or `agiworkforce` token.
    let auth_path = dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".agiworkforce")
        .join("auth.toml");
    let content = std::fs::read_to_string(&auth_path).ok()?;
    jwt_from_legacy_auth_toml(&content)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // -- parse_tier_str tests -----------------------------------------------

    #[test]
    fn parse_tier_str_canonical_variants() {
        assert_eq!(parse_tier_str("free"), Some(UserTier::Free));
        assert_eq!(parse_tier_str("pro"), Some(UserTier::Pro));
        assert_eq!(parse_tier_str("max"), Some(UserTier::Max));
        assert_eq!(parse_tier_str("enterprise"), Some(UserTier::Enterprise));
        assert_eq!(parse_tier_str("byok"), Some(UserTier::Byok));
        assert_eq!(parse_tier_str("local"), Some(UserTier::Byok));
    }

    #[test]
    fn parse_tier_str_team_normalizes_to_pro() {
        // Mirrors packages/contracts/types normalizeProductTier: "team" → Pro
        assert_eq!(parse_tier_str("team"), Some(UserTier::Pro));
    }

    #[test]
    fn parse_tier_str_enterprise_is_distinct() {
        // Enterprise is NOT collapsed to Max — it has its own variant.
        assert_eq!(parse_tier_str("enterprise"), Some(UserTier::Enterprise));
    }

    #[test]
    fn parse_tier_str_unknown_is_none_fail_closed() {
        // Unknown strings return None (fail-closed — callers default to Free).
        assert_eq!(parse_tier_str("unknown_tier"), None);
        assert_eq!(parse_tier_str(""), None);
        assert_eq!(parse_tier_str("hobby"), None);
        assert_eq!(parse_tier_str("pro_plus"), None);
    }

    // -- default_model_id tests ---------------------------------------------

    #[test]
    fn free_tier_default_model_is_economy() {
        let model = UserTier::Free.default_model_id();
        assert!(model.is_some(), "Free tier must have a default model ID");
        assert!(
            !model.unwrap().is_empty(),
            "Default model ID must not be empty"
        );
    }

    #[test]
    fn enterprise_tier_default_model_is_economy() {
        let model = UserTier::Enterprise.default_model_id();
        assert!(
            model.is_some(),
            "Enterprise tier must have a default model ID"
        );
    }

    #[test]
    fn byok_has_no_default_model() {
        assert_eq!(UserTier::Byok.default_model_id(), None);
    }

    // -- status_label tests -------------------------------------------------

    #[test]
    fn status_label_shows_tier_only() {
        // Flat subscription: no token counters, just the label.
        let cached = CachedTier {
            tier: UserTier::Pro,
        };
        assert_eq!(cached.status_label(), "Pro");

        let cached = CachedTier {
            tier: UserTier::Max,
        };
        assert_eq!(cached.status_label(), "Max");

        let cached = CachedTier {
            tier: UserTier::Enterprise,
        };
        assert_eq!(cached.status_label(), "Enterprise");

        let cached = CachedTier {
            tier: UserTier::Free,
        };
        assert_eq!(cached.status_label(), "Free");
    }

    // -- resolve_agi_api_base allowlist tests --------------------------------

    #[test]
    fn resolve_agi_api_base_accepts_root_host() {
        assert_eq!(
            resolve_agi_api_base("https://agiworkforce.com"),
            Some("https://agiworkforce.com".to_string())
        );
    }

    #[test]
    fn resolve_agi_api_base_accepts_subdomain() {
        assert_eq!(
            resolve_agi_api_base("https://api.agiworkforce.com"),
            Some("https://api.agiworkforce.com".to_string())
        );
    }

    #[test]
    fn resolve_agi_api_base_rejects_evil_host() {
        // An attacker-set env var must not cause the JWT to be sent to evil.com.
        assert_eq!(resolve_agi_api_base("https://evil.com"), None);
        assert_eq!(
            resolve_agi_api_base("https://evil.agiworkforce.com.evil.com"),
            None
        );
    }

    #[test]
    fn resolve_agi_api_base_rejects_http() {
        assert_eq!(resolve_agi_api_base("http://agiworkforce.com"), None);
    }

    #[test]
    fn resolve_agi_api_base_strips_trailing_slash() {
        assert_eq!(
            resolve_agi_api_base("https://agiworkforce.com/"),
            Some("https://agiworkforce.com".to_string())
        );
    }

    // -- reconcile_fetched_tier tests ----------------------------------------

    #[test]
    fn reconcile_fetched_free_does_not_clobber_higher_cached_tier() {
        // /api/me fails-open to 'free' on transient errors; cached Pro must survive.
        let result = reconcile_fetched_tier(&UserTier::Free, &UserTier::Pro);
        assert_eq!(result, UserTier::Pro);

        let result = reconcile_fetched_tier(&UserTier::Free, &UserTier::Max);
        assert_eq!(result, UserTier::Max);

        let result = reconcile_fetched_tier(&UserTier::Free, &UserTier::Enterprise);
        assert_eq!(result, UserTier::Enterprise);
    }

    #[test]
    fn reconcile_higher_fetched_tier_upgrades_cache() {
        // A genuine tier upgrade from the server should be reflected.
        let result = reconcile_fetched_tier(&UserTier::Max, &UserTier::Pro);
        assert_eq!(result, UserTier::Max);

        let result = reconcile_fetched_tier(&UserTier::Pro, &UserTier::Free);
        assert_eq!(result, UserTier::Pro);
    }

    #[test]
    fn reconcile_same_tier_is_idempotent() {
        let result = reconcile_fetched_tier(&UserTier::Pro, &UserTier::Pro);
        assert_eq!(result, UserTier::Pro);
    }

    // -- JWT helpers tests --------------------------------------------------

    #[test]
    fn jwt_from_auth_store_reads_agiworkforce_oauth_access_token() {
        let mut store = crate::auth::AuthStore::default();
        store.entries.insert(
            "agiworkforce".to_string(),
            crate::auth::AuthEntry::OAuth {
                refresh: "refresh-token".to_string(),
                access: "access-token".to_string(),
                expires: 0,
                account_id: None,
            },
        );

        assert_eq!(jwt_from_auth_store(&store).as_deref(), Some("access-token"));
    }

    #[test]
    fn jwt_from_legacy_auth_toml_reads_managed_cloud_token() {
        let content = r#"
            [entries.managed_cloud]
            token = "legacy-token"
        "#;

        assert_eq!(
            jwt_from_legacy_auth_toml(content).as_deref(),
            Some("legacy-token")
        );
    }

    // -- TOML round-trip test -----------------------------------------------

    #[test]
    fn tier_cache_roundtrip_toml() {
        let envelope = TierCacheEnvelope {
            tier: "pro".to_string(),
            cached_at: 1_746_000_000,
        };
        let serialized = toml::to_string(&envelope).expect("should serialize");
        let back: TierCacheEnvelope = toml::from_str(&serialized).expect("should deserialize");
        assert_eq!(back.tier, "pro");
        assert_eq!(back.cached_at, 1_746_000_000);
    }
}
