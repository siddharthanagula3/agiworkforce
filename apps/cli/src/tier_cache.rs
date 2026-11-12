//! Tier cache, async managed-account tier query with a short on-disk TTL.
//!
//! The CLI calls `resolve_user_tier()` at startup to determine which model pool
//! to default to.  It writes the result to
//! `~/.agiworkforce/cache/tier.toml` so subsequent runs don't block on a
//! network call.
//!
//! ## Tier model
//! Canonical billing tiers (from `packages/contracts/types/src/billing-catalog.ts`):
//!   `free` | `basic` | `pro` | `max` | `max_15x` | `team` | `enterprise`
//! The CLI also tracks `byok` for Local/BYOK sessions (not a server-side tier).
//! Customer-facing tier identity stays exact here. Model routing may group
//! Team with Pro and Max 20x with Max, but account/status UI must not relabel
//! what the customer purchased.
//!
//! ## Flow
//! 1. Check `~/.agiworkforce/cache/tier.toml`, if present and younger than
//!    `TIER_CACHE_TTL`, return cached tier.
//! 2. Query `AGIWORKFORCE_API_BASE/api/me` with `Authorization: Bearer <AGIWORKFORCE_JWT>`.
//! 3. Write result to cache.  On any error, return `None` (caller uses config default).
//!
//! ## Security
//! - JWT is read from `AGIWORKFORCE_JWT`, then the OS credential store populated
//!   by `agi login`, then the legacy `~/.agiworkforce/auth.toml`.
//! - Request always uses HTTPS, and only to an allowlisted `*.agiworkforce.com` host.
//! - Cache file is written atomically via temp-file + rename.
//! - Timeout: 3 seconds, never blocks interactive startup visibly.

#![allow(dead_code)]

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Time-to-live for the on-disk tier cache before we re-query. Owned here and
/// nowhere else: a plan change must surface within this window.
const TIER_CACHE_TTL: Duration = Duration::from_secs(300);

/// Maximum time to wait for the tier API call.  If the server doesn't respond
/// within this window we return `None` and let the caller use a sensible default.
const TIER_FETCH_TIMEOUT: Duration = Duration::from_secs(3);

/// Cache file path relative to `~/.agiworkforce/`.
const TIER_CACHE_FILE: &str = "cache/tier.toml";

/// Default API base used when `AGIWORKFORCE_API_BASE` is not set.
/// `/api/me` lives on the root host (verified: apps/web/app/api/me/route.ts).
const DEFAULT_API_BASE: &str = "https://agiworkforce.com";

pub fn default_api_base() -> &'static str {
    DEFAULT_API_BASE
}

#[derive(Clone)]
pub(crate) struct ManagedRequestContext {
    pub(crate) jwt: Option<String>,
    pub(crate) base: String,
    pub(crate) owner: Option<String>,
}

fn cache_owner(base: &str, jwt: Option<&str>) -> Option<String> {
    use sha2::{Digest, Sha256};
    let identity = match jwt {
        None => vec!["anonymous".to_string()],
        Some(jwt) => match crate::auth::jwt_session_identity(jwt) {
            Some((subject, session)) => vec!["session".to_string(), subject, session],
            None => {
                let subject = crate::auth::jwt_subject(jwt)?;
                vec![
                    "legacy".to_string(),
                    subject,
                    crate::hex::encode(&Sha256::digest(jwt.as_bytes())),
                ]
            }
        },
    };
    let serialized = serde_json::to_vec(&("managed-cache-v1", base, identity)).ok()?;
    Some(crate::hex::encode(&Sha256::digest(serialized)))
}

fn optional_environment(name: &str) -> Result<Option<String>> {
    match std::env::var(name) {
        Ok(value) => Ok(Some(value)),
        Err(std::env::VarError::NotPresent) => Ok(None),
        Err(std::env::VarError::NotUnicode(_)) => {
            anyhow::bail!("Managed configuration is not valid Unicode")
        }
    }
}

impl ManagedRequestContext {
    fn from_store(store: Result<crate::auth::AuthStore>) -> Result<Self> {
        let jwt = match optional_environment("AGIWORKFORCE_JWT")?.filter(|jwt| !jwt.is_empty()) {
            Some(jwt) => Some(jwt),
            None => jwt_from_auth_store(&store?),
        };
        let raw = optional_environment("AGIWORKFORCE_API_BASE")?
            .unwrap_or_else(|| DEFAULT_API_BASE.to_string());
        let base = resolve_agi_api_base(&raw)
            .ok_or_else(|| anyhow::anyhow!("Managed API endpoint is not trusted"))?;
        let owner = cache_owner(&base, jwt.as_deref());
        Ok(Self { jwt, base, owner })
    }

    pub(crate) fn capture() -> Result<Self> {
        crate::auth::AuthStore::with_snapshot(Self::from_store)?
    }

    pub(crate) fn for_token(jwt: &str) -> Result<Self> {
        let context = Self::capture()?;
        anyhow::ensure!(
            context.jwt.as_deref() == Some(jwt),
            "Managed account changed; retry the request"
        );
        Ok(context)
    }

    // The callback holds the auth lock and must not capture or reload credentials.
    pub(crate) fn with_current<T>(&self, read: impl FnOnce() -> T) -> Option<T> {
        crate::auth::AuthStore::with_snapshot(|store| {
            let current = Self::from_store(store).ok()?;
            self.matches_current(&current).then(read)
        })
        .ok()
        .flatten()
    }

    fn with_current_token<T>(&self, read: impl FnOnce() -> T) -> Option<T> {
        crate::auth::AuthStore::with_snapshot(|store| {
            let current = Self::from_store(store).ok()?;
            (self.base == current.base && self.jwt == current.jwt).then(read)
        })
        .ok()
        .flatten()
    }

    fn matches_current(&self, current: &Self) -> bool {
        self.base == current.base
            && match (&self.owner, &current.owner) {
                (Some(expected), Some(actual)) => expected == actual,
                _ => self.jwt == current.jwt,
            }
    }

    pub(crate) fn is_current(&self) -> bool {
        self.with_current(|| ()).is_some()
    }

    pub(crate) fn invalidate_if_current_token(&self) {
        if let Some(jwt) = self.jwt.as_deref() {
            invalidate_for_request(&self.base, jwt);
        }
    }
}

pub(crate) fn invalidate_for_request(base: &str, jwt: &str) {
    let _ = crate::auth::AuthStore::with_snapshot(|store| {
        if let Ok(current) = ManagedRequestContext::from_store(store) {
            if current.base == base && current.jwt.as_deref() == Some(jwt) {
                invalidate_tier_cache();
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// User's current subscription tier as returned by the AGI Workforce API.
///
/// Mirrors the managed tiers in `packages/contracts/types/src/billing-catalog.ts`:
///   `free` | `basic` | `pro` | `max` | `max_15x` | `team` | `team_premium` | `enterprise`
/// Plus `Byok` which is a CLI-side classification for Local/BYOK sessions (no server tier).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum UserTier {
    #[default]
    Free,
    Basic,
    Pro,
    Max,
    #[serde(rename = "max_15x")]
    Max15x,
    Team,
    #[serde(rename = "team_premium")]
    TeamPremium,
    Enterprise,
    /// BYOK / Local mode, tier enforcement is the user's responsibility.
    Byok,
}

impl UserTier {
    /// Returns the economy-bucket model ID that the CLI should default to when
    /// no explicit `--model` is specified for this tier.
    ///
    /// All managed tiers default to the economy workhorse
    /// (first `tierAllowedModels.economy` entry in models.json).  The economy default
    /// is the safest choice for a CLI where the user hasn't pinned a model; it does NOT
    /// restrict which models the user can select via `--model`.
    ///
    /// BYOK → `None` (no managed-cloud default; callers must require `--model`).
    pub fn default_model_id(&self) -> Option<&'static str> {
        match self {
            UserTier::Free
            | UserTier::Basic
            | UserTier::Pro
            | UserTier::Max
            | UserTier::Max15x
            | UserTier::Team
            | UserTier::TeamPremium
            | UserTier::Enterprise => Some(crate::model_catalog::economy_default_model()),
            UserTier::Byok => None,
        }
    }

    /// Human-readable tier label for status-bar display.
    pub fn label(&self) -> &'static str {
        match self {
            UserTier::Free => "Free",
            UserTier::Basic => "Basic",
            UserTier::Pro => "Premium",
            UserTier::Max => "Max",
            UserTier::Max15x => "Ultra",
            UserTier::Team => "Team",
            UserTier::TeamPremium => "Team Premium",
            UserTier::Enterprise => "Enterprise",
            UserTier::Byok => "BYOK",
        }
    }

    /// Canonical bucket used by the shared managed-cloud Auto router.
    ///
    /// This deliberately does not change the customer-facing tier identity:
    /// Team receives the Pro model roster, Max 20x receives the Max roster,
    /// and tiers without managed developer-surface access fail closed.
    pub fn managed_auto_routing_tier(&self) -> &'static str {
        match self {
            UserTier::Free | UserTier::Basic | UserTier::Byok => "free",
            UserTier::Pro | UserTier::Team => "pro",
            UserTier::Max | UserTier::Max15x | UserTier::TeamPremium => "max",
            UserTier::Enterprise => "enterprise",
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
/// Only the tier string and timestamp are persisted, no token/credit fields
/// (the flat subscription model has no usage metering on the CLI side).
#[derive(Debug, Serialize, Deserialize)]
struct TierCacheEnvelope {
    #[serde(default)]
    owner: Option<String>,
    /// The resolved tier string (must parse as `UserTier`).
    tier: String,
    /// Unix timestamp (seconds) when the cache was written.
    cached_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    capability_handshake: Option<CapabilityDocumentWire>,
}

pub const CLOUD_MODELS_CAPABILITY: &str = "canUseCloudModels";
pub const IMAGES_CAPABILITY: &str = "canUseImages";
pub const WEB_SEARCH_CAPABILITY: &str = "canUseWebSearch";
pub const VOICE_CAPABILITY: &str = "canUseVoice";
pub const CONNECTORS_CAPABILITY: &str = "canUseConnectors";
pub const PLUGINS_CAPABILITY: &str = "canUsePlugins";
pub const SKILLS_CAPABILITY: &str = "canUseSkills";
pub const MARKETPLACE_CAPABILITY: &str = "canUseMarketplace";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct CapabilityDocumentWire {
    #[serde(default)]
    pub granted: Vec<String>,
    #[serde(default, rename = "deniedBy")]
    pub denied_by: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub sources: HashMap<String, String>,
    #[serde(default)]
    pub limits: Vec<CapabilityLimitWire>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityLimitWire {
    pub id: String,
    #[serde(default)]
    pub capability_id: Option<String>,
    #[serde(default)]
    pub limit: Option<f64>,
    pub unit: String,
    pub window: String,
    #[serde(default)]
    pub resets_at: Option<String>,
    pub policy_source: String,
}

impl CapabilityDocumentWire {
    pub fn allows(&self, capability: &str) -> bool {
        self.granted.iter().any(|granted| granted == capability)
            && self.denied_by.get(capability).is_none_or(Vec::is_empty)
    }

    pub fn denying_layer(&self, capability: &str) -> Option<&str> {
        self.denied_by
            .get(capability)
            .and_then(|layers| layers.first())
            .map(String::as_str)
    }
}

fn tier_cache_path() -> Option<PathBuf> {
    crate::config::CliConfig::config_dir()
        .ok()
        .map(|dir| dir.join(TIER_CACHE_FILE))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn cache_is_fresh(cached_at: u64, now: u64) -> bool {
    cached_at <= now && now - cached_at <= TIER_CACHE_TTL.as_secs()
}

fn read_fresh_envelope(context: &ManagedRequestContext) -> Option<TierCacheEnvelope> {
    let owner = context.owner.as_ref()?;
    let content = std::fs::read_to_string(tier_cache_path()?).ok()?;
    let envelope: TierCacheEnvelope = toml::from_str(&content).ok()?;
    (envelope.owner.as_ref() == Some(owner) && cache_is_fresh(envelope.cached_at, now_secs()))
        .then_some(envelope)
}

/// Read the cached tier from disk, returning `None` if absent or expired.
pub fn read_tier_cache() -> Option<CachedTier> {
    let context = ManagedRequestContext::capture().ok()?;
    context.with_current(|| read_tier_for(&context)).flatten()
}

pub fn cached_capabilities() -> Option<CapabilityDocumentWire> {
    let context = ManagedRequestContext::capture().ok()?;
    context
        .with_current(|| capabilities_for(&context))
        .flatten()
}

pub(crate) fn read_tier_for(context: &ManagedRequestContext) -> Option<CachedTier> {
    let tier = parse_tier_str(&read_fresh_envelope(context)?.tier)?;
    Some(CachedTier { tier })
}

pub(crate) fn capabilities_for(context: &ManagedRequestContext) -> Option<CapabilityDocumentWire> {
    read_fresh_envelope(context)?.capability_handshake
}

pub fn capability_refusal(capability: &str, feature: &str) -> Option<String> {
    let document = cached_capabilities()?;
    let layer = document
        .denied_by
        .get(capability)
        .and_then(|layers| layers.first())?;
    let why = match layer.as_str() {
        "tier" => " on your plan",
        "settings" => {
            ", because it is switched off in your account or workspace settings, or paused for now"
        }
        "surface" => " on this kind of device",
        "model" => " with the current model",
        _ => " on this account right now",
    };
    Some(format!("{feature} is not available{why}."))
}

pub fn capability_allowed(capability: &str) -> Option<bool> {
    cached_capabilities().map(|document| document.allows(capability))
}

/// Write a fresh tier to the disk cache.  Errors are silently swallowed, a
/// failed cache write is never fatal.
fn write_tier_cache(
    context: &ManagedRequestContext,
    tier: &UserTier,
    capabilities: Option<&CapabilityDocumentWire>,
) {
    if context.owner.is_none() {
        return;
    }
    let Some(path) = tier_cache_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let envelope = TierCacheEnvelope {
        owner: context.owner.clone(),
        tier: tier_to_str(tier),
        cached_at: now_secs(),
        capability_handshake: capabilities.cloned(),
    };
    if let Ok(content) = toml::to_string(&envelope) {
        // Atomic write: temp file → rename
        let tmp = path.with_extension("tmp");
        if std::fs::write(&tmp, &content).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }
}

/// Drop the cached tier so the next resolve re-reads it from the server.
pub fn invalidate_tier_cache() {
    crate::models::gateway_models::clear_live_catalog();
    if let Some(path) = tier_cache_path() {
        let _ = std::fs::remove_file(path);
    }
    if let Some(path) = plan_models_cache_path() {
        let _ = std::fs::remove_file(path);
    }
}

fn plan_models_cache_path() -> Option<PathBuf> {
    Some(tier_cache_path()?.with_file_name("plan-models.toml"))
}

#[derive(Debug, Serialize, Deserialize)]
struct PlanModelsEnvelope {
    #[serde(default)]
    owner: Option<String>,
    models: Vec<String>,
    cached_at: u64,
}

/// The models the hosted list said this account can run, written beside the
/// tier and kept until the account changes: the bundled tier table names only
/// the models a plan lists by hand, while the list also admits every model the
/// plan reaches through its price floor.
pub fn read_plan_models_cache() -> Option<Vec<String>> {
    let context = ManagedRequestContext::capture().ok()?;
    context.with_current(|| plan_models_for(&context)).flatten()
}

pub(crate) fn plan_models_for(context: &ManagedRequestContext) -> Option<Vec<String>> {
    let owner = context.owner.as_ref()?;
    let content = std::fs::read_to_string(plan_models_cache_path()?).ok()?;
    let envelope: PlanModelsEnvelope = toml::from_str(&content).ok()?;
    (envelope.owner.as_ref() == Some(owner)).then_some(envelope.models)
}

/// Whether the hosted list named this model for the signed-in account.
pub fn plan_lists_model(model: &str) -> bool {
    read_plan_models_cache().is_some_and(|models| {
        plan_lists(&models, model)
            || plan_lists(&models, &crate::model_catalog::canonical_model_id(model))
    })
}

pub fn plan_lists(models: &[String], model: &str) -> bool {
    let wanted = model.to_lowercase();
    models
        .iter()
        .any(|listed| listed.eq_ignore_ascii_case(&wanted))
}

fn write_plan_models_cache(context: &ManagedRequestContext, models: &[String]) {
    if context.owner.is_none() {
        return;
    }
    let Some(path) = plan_models_cache_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let envelope = PlanModelsEnvelope {
        owner: context.owner.clone(),
        models: models.iter().map(|id| id.to_lowercase()).collect(),
        cached_at: now_secs(),
    };
    if let Ok(content) = toml::to_string(&envelope) {
        let tmp = path.with_extension("tmp");
        if std::fs::write(&tmp, &content).is_ok() {
            let _ = std::fs::rename(&tmp, &path);
        }
    }
}

/// A signed-in account whose plan list is not cached yet fetches it before any
/// route is judged, so the first verdict a client asks for reads the plan
/// rather than the bundled vendor rule.
pub async fn ensure_plan_models_cached() {
    if !plan_models_fetch_admitted(crate::account_privacy_mode()) {
        return;
    }
    let Ok(context) = ManagedRequestContext::capture() else {
        return;
    };
    if context.jwt.is_none()
        || context
            .with_current(|| plan_models_for(&context))
            .flatten()
            .is_some()
    {
        return;
    }
    refresh_plan_models_cache(&context).await;
}

fn plan_models_fetch_admitted(privacy: crate::platform::runtime::session::PrivacyMode) -> bool {
    crate::cloud::CloudClient::admit(privacy).is_ok()
}

async fn refresh_plan_models_cache(context: &ManagedRequestContext) {
    match crate::models::gateway_models::discover_gateway_models_for(context).await {
        Ok(catalog) => {
            let ids: Vec<String> = catalog.models.into_iter().map(|model| model.id).collect();
            context.with_current(|| write_plan_models_cache(context, &ids));
        }
        Err(error) => tracing::debug!("[tier_cache] plan model list fetch failed: {error:#}"),
    }
}

pub(crate) fn adopt_server_plan(context: &ManagedRequestContext, plan_tier: &str) -> bool {
    context
        .with_current(|| {
            let cached = read_tier_for(context).map(|cached| cached.tier);
            match tier_to_adopt(plan_tier, cached.as_ref()) {
                Some(server_tier) => {
                    invalidate_tier_cache();
                    write_tier_cache(context, &server_tier, None);
                    true
                }
                None => false,
            }
        })
        .unwrap_or(false)
}

/// The tier the cache should hold once the server states `plan_tier`, or `None`
/// when the cache already agrees and nothing needs rewriting.
pub fn tier_to_adopt(plan_tier: &str, cached: Option<&UserTier>) -> Option<UserTier> {
    let server_tier = parse_tier_str(plan_tier)?;
    if cached == Some(&server_tier) {
        return None;
    }
    Some(server_tier)
}

/// HTTP answers that prove the cached tier no longer describes the account.
pub fn status_invalidates_tier(status: u16) -> bool {
    matches!(status, 401..=403)
}

// ---------------------------------------------------------------------------
// Tier API response shape
// ---------------------------------------------------------------------------

/// Minimal shape returned by `GET /api/me`.
/// The web route nests subscription details under `plan`.
/// We no longer read `credits`, the flat subscription model has no per-use credits.
#[derive(Debug, Deserialize)]
pub(crate) struct MeApiResponse {
    pub(crate) plan: Option<MePlan>,
    #[serde(default)]
    pub(crate) capability_handshake: Option<CapabilityDocumentWire>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct MePlan {
    /// e.g. `"free"`, `"basic"`, `"pro"`, `"max"`, `"max_15x"`,
    /// `"team"`, `"enterprise"`.
    pub(crate) tier: Option<String>,
    #[serde(default)]
    pub(crate) effective_tier: Option<String>,
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
    /// True when the network returned HTTP 401, signals the caller to print a
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

/// Resolve the API base URL, applying an allowlist that requires either:
/// - `https://` and a host that is `agiworkforce.com` or a subdomain of it, or
/// - a loopback host (`localhost`, `127.0.0.1`, `[::1]`) over `http://`.
///
/// This closes the JWT-exfiltration risk where an attacker-controlled
/// `AGIWORKFORCE_API_BASE` env var would cause the CLI to send the Bearer
/// token to an arbitrary host. A loopback base cannot carry the token off the
/// machine, and is what a `next dev` web server is reached on, so it is
/// allowed on the same terms the VS Code extension already allows it
/// (`apps/extension-vscode/src/utils/api.ts`, `validateEndpointUrl`).
///
/// Returns `None` (skip fetch, log warning) if the URL fails the allowlist.
/// Pass `raw` as the raw env-var value (or `DEFAULT_API_BASE` as the default).
pub fn resolve_agi_api_base(raw: &str) -> Option<String> {
    let after_scheme = if let Some(rest) = raw.strip_prefix("https://") {
        rest
    } else if let Some(rest) = raw.strip_prefix("http://") {
        let host = host_of(rest);
        if !is_loopback_host(host) {
            tracing::warn!(
                "[tier_cache] API base '{}' is not HTTPS and not a loopback host, skipping tier fetch",
                raw
            );
            return None;
        }
        return Some(raw.trim_end_matches('/').to_string());
    } else {
        tracing::warn!(
            "[tier_cache] API base '{}' is not HTTPS, skipping tier fetch",
            raw
        );
        return None;
    };

    let host = host_of(after_scheme);
    let host_ok =
        host == "agiworkforce.com" || host.ends_with(".agiworkforce.com") || is_loopback_host(host);

    if !host_ok {
        tracing::warn!(
            "[tier_cache] AGIWORKFORCE_API_BASE host '{}' is not an agiworkforce.com domain, skipping tier fetch to prevent token exfiltration",
            host
        );
        return None;
    }

    Some(raw.trim_end_matches('/').to_string())
}

fn host_of(after_scheme: &str) -> &str {
    after_scheme.split('/').next().unwrap_or("")
}

fn is_loopback_host(host: &str) -> bool {
    let bare = host.rsplit_once(':').map_or(host, |(head, port)| {
        if port.chars().all(|c| c.is_ascii_digit()) && !port.is_empty() {
            head
        } else {
            host
        }
    });
    matches!(bare, "localhost" | "127.0.0.1" | "[::1]")
}

// ---------------------------------------------------------------------------
// Tier rank helper (for free-doesn't-clobber-higher logic)
// ---------------------------------------------------------------------------

/// Numeric rank for reconcile logic: higher rank = higher privilege.
/// Byok is orthogonal (not a managed tier), ranked 0.
/// Team shares Pro's model-access rank. Max 20x has Max model access but keeps
/// its higher customer-facing usage tier.
fn tier_rank(t: &UserTier) -> u8 {
    match t {
        UserTier::Byok => 0,
        UserTier::Free => 1,
        UserTier::Basic => 2,
        UserTier::Pro | UserTier::Team => 3,
        UserTier::Max | UserTier::TeamPremium => 4,
        UserTier::Max15x => 5,
        UserTier::Enterprise => 6,
    }
}

/// Reconcile a freshly-fetched tier against a still-valid cached tier.
///
/// `/api/me` now errors instead of reporting `free` when a workspace member's
/// seat lookup fails, but a lower fetched tier is still not trusted over a
/// higher one the cache holds within its lifetime: prefer the cached tier.
///
/// If the fetched tier is higher (or equal), use the fetched tier (cache refresh).
pub fn reconcile_fetched_tier(fetched: &UserTier, cached: &UserTier) -> UserTier {
    if tier_rank(fetched) >= tier_rank(cached) {
        fetched.clone()
    } else {
        // fetched is lower (e.g. Free returned on a DB hiccup), keep cached.
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
/// * `jwt`, AGI Workforce JWT (Bearer token).  If `None`, we skip
///   the network call and return only what's in the cache.
pub async fn managed_auto_routing_tier() -> &'static str {
    let jwt = load_jwt();
    tokio::time::timeout(
        std::time::Duration::from_secs(3),
        resolve_user_tier(jwt.as_deref()),
    )
    .await
    .unwrap_or_default()
    .cached
    .map(|cached| cached.tier.managed_auto_routing_tier())
    .unwrap_or("free")
}

pub async fn resolve_user_tier(jwt: Option<&str>) -> TierResolution {
    let Ok(context) = ManagedRequestContext::capture() else {
        return TierResolution::default();
    };
    if jwt != context.jwt.as_deref() {
        return TierResolution::default();
    }
    resolve_user_tier_for(&context).await
}

pub(crate) async fn resolve_user_tier_for(context: &ManagedRequestContext) -> TierResolution {
    if let Some(cached) = context.with_current(|| read_tier_for(context)).flatten() {
        if context
            .with_current(|| plan_models_for(context))
            .flatten()
            .is_none()
            && context.jwt.is_some()
        {
            refresh_plan_models_cache(context).await;
        }
        return context
            .with_current(|| TierResolution {
                cached: Some(cached),
                needs_reauth: false,
            })
            .unwrap_or_default();
    }
    let Some(jwt) = context.jwt.as_deref() else {
        return TierResolution::default();
    };
    let url = format!("{}/api/me", context.base);
    let result = tokio::time::timeout(TIER_FETCH_TIMEOUT, fetch_tier_from_api(&url, jwt)).await;
    match result {
        Ok(Ok(resp)) => {
            let Some(tier_str) = resp
                .plan
                .as_ref()
                .and_then(|plan| plan.effective_tier.as_deref().or(plan.tier.as_deref()))
            else {
                return TierResolution::default();
            };
            let fetched = parse_tier_str(tier_str);
            let resolved = context.with_current(|| {
                let existing = read_tier_for(context);
                let tier = match (fetched.clone(), existing) {
                    (Some(fetched), Some(existing)) => {
                        reconcile_fetched_tier(&fetched, &existing.tier)
                    }
                    (Some(fetched), None) => fetched,
                    (None, Some(existing)) => existing.tier,
                    (None, None) => UserTier::Free,
                };
                let capabilities = if fetched.as_ref() == Some(&tier) {
                    resp.capability_handshake
                } else {
                    capabilities_for(context)
                };
                write_tier_cache(context, &tier, capabilities.as_ref());
                tier
            });
            let Some(tier) = resolved else {
                return TierResolution::default();
            };
            refresh_plan_models_cache(context).await;
            context
                .with_current(|| TierResolution {
                    cached: Some(CachedTier { tier }),
                    needs_reauth: false,
                })
                .unwrap_or_default()
        }
        Ok(Err(FetchError::Unauthorized)) => context
            .with_current_token(|| {
                invalidate_tier_cache();
                TierResolution {
                    cached: None,
                    needs_reauth: true,
                }
            })
            .unwrap_or_default(),
        Ok(Err(FetchError::Other(error))) => {
            tracing::debug!("[tier_cache] tier fetch failed: {error}");
            TierResolution::default()
        }
        Err(_) => TierResolution::default(),
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
/// Keeps every canonical billing tier distinct for customer-facing status.
/// Model-routing call sites explicitly collapse Team→Pro and Max 20x→Max.
///
/// FAIL-CLOSED: an unrecognized server string returns `None` so it is never
/// silently promoted to a higher tier.  Callers default unresolved strings to
/// `UserTier::Free`.
pub fn parse_tier(s: &str) -> Option<UserTier> {
    parse_tier_str(s)
}

fn parse_tier_str(s: &str) -> Option<UserTier> {
    match s.to_lowercase().as_str() {
        "free" => Some(UserTier::Free),
        "basic" => Some(UserTier::Basic),
        "pro" => Some(UserTier::Pro),
        "max" => Some(UserTier::Max),
        "max_15x" | "max-15x" | "max15x" => Some(UserTier::Max15x),
        "team" => Some(UserTier::Team),
        "team_premium" => Some(UserTier::TeamPremium),
        "enterprise" => Some(UserTier::Enterprise),
        "byok" | "local" => Some(UserTier::Byok),
        _ => None,
    }
}

/// Canonical wire slug for a tier, the same string the server uses.
pub fn tier_slug(tier: &UserTier) -> String {
    tier_to_str(tier)
}

fn tier_to_str(t: &UserTier) -> String {
    match t {
        UserTier::Free => "free",
        UserTier::Basic => "basic",
        UserTier::Pro => "pro",
        UserTier::Max => "max",
        UserTier::Max15x => "max_15x",
        UserTier::Team => "team",
        UserTier::TeamPremium => "team_premium",
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

pub(crate) fn jwt_from_legacy_auth_toml(content: &str) -> Option<String> {
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

    None
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn cache_token(subject: Option<&str>, session: Option<&str>, generation: u8) -> String {
        use base64::Engine;
        let claims = serde_json::json!({"sub": subject, "sid": session, "iat": generation});
        format!(
            "fixture.{}.signature",
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(claims.to_string())
        )
    }

    fn cache_context(base: &str, jwt: Option<String>) -> ManagedRequestContext {
        ManagedRequestContext {
            owner: cache_owner(base, jwt.as_deref()),
            jwt,
            base: base.to_string(),
        }
    }

    #[test]
    fn cache_identity_preserves_session_renewal_but_not_account_session_or_deployment_switches() {
        let first = cache_context(
            DEFAULT_API_BASE,
            Some(cache_token(Some("a"), Some("s1"), 1)),
        );
        let renewed = cache_context(
            DEFAULT_API_BASE,
            Some(cache_token(Some("a"), Some("s1"), 2)),
        );
        assert!(first.matches_current(&renewed));
        assert_ne!(first.jwt, renewed.jwt);
        for replacement in [
            cache_context(
                DEFAULT_API_BASE,
                Some(cache_token(Some("b"), Some("s1"), 1)),
            ),
            cache_context(
                DEFAULT_API_BASE,
                Some(cache_token(Some("a"), Some("s2"), 1)),
            ),
            cache_context("https://api.agiworkforce.com", first.jwt.clone()),
            cache_context(DEFAULT_API_BASE, None),
        ] {
            assert!(!first.matches_current(&replacement));
        }
    }

    #[test]
    fn legacy_cache_identity_requires_subject_and_never_persists_token() {
        let token = cache_token(Some("legacy"), None, 1);
        let owner =
            cache_owner(DEFAULT_API_BASE, Some(&token)).expect("subject-bound legacy owner");
        assert!(!owner.contains(&token));
        assert_ne!(
            Some(owner),
            cache_owner(
                DEFAULT_API_BASE,
                Some(&cache_token(Some("legacy"), None, 2))
            )
        );
        assert!(cache_owner(DEFAULT_API_BASE, Some("opaque-token")).is_none());
        assert!(cache_owner(DEFAULT_API_BASE, Some(&cache_token(None, Some("s"), 1))).is_none());
    }

    #[test]
    fn anonymous_cache_is_distinct_from_unidentified_authenticated_request() {
        let anonymous = cache_context(DEFAULT_API_BASE, None);
        let opaque = cache_context(DEFAULT_API_BASE, Some("opaque-token".to_string()));
        assert!(anonymous.owner.is_some());
        assert!(opaque.owner.is_none());
        assert!(!anonymous.matches_current(&opaque));
        assert!(!opaque.matches_current(&anonymous));
    }

    #[test]
    fn legacy_envelopes_do_not_acquire_the_current_owner() {
        let tier: TierCacheEnvelope =
            toml::from_str("tier = 'pro'\ncached_at = 1").expect("legacy tier");
        let models: PlanModelsEnvelope =
            toml::from_str("models = []\ncached_at = 1").expect("legacy models");
        assert!(tier.owner.is_none());
        assert!(models.owner.is_none());
        assert!(!cache_is_fresh(101, 100));
    }

    // -- parse_tier_str tests -----------------------------------------------

    #[test]
    fn parse_tier_str_canonical_variants() {
        assert_eq!(parse_tier_str("free"), Some(UserTier::Free));
        assert_eq!(parse_tier_str("basic"), Some(UserTier::Basic));
        assert_eq!(parse_tier_str("pro"), Some(UserTier::Pro));
        assert_eq!(parse_tier_str("max"), Some(UserTier::Max));
        assert_eq!(parse_tier_str("max_15x"), Some(UserTier::Max15x));
        assert_eq!(parse_tier_str("team"), Some(UserTier::Team));
        assert_eq!(parse_tier_str("enterprise"), Some(UserTier::Enterprise));
        assert_eq!(parse_tier_str("byok"), Some(UserTier::Byok));
        assert_eq!(parse_tier_str("local"), Some(UserTier::Byok));
    }

    #[test]
    fn canonical_paid_tiers_keep_their_customer_facing_identity() {
        assert_eq!(parse_tier_str("basic"), Some(UserTier::Basic));
        assert_eq!(parse_tier_str("team"), Some(UserTier::Team));
        assert_eq!(parse_tier_str("max_15x"), Some(UserTier::Max15x));
        assert_eq!(UserTier::Basic.label(), "Basic");
        assert_eq!(UserTier::Team.label(), "Team");
        assert_eq!(UserTier::Max.label(), "Max");
        assert_eq!(UserTier::Max15x.label(), "Ultra");
        assert_eq!(tier_to_str(&UserTier::Max15x), "max_15x");
    }

    #[test]
    fn managed_auto_routing_groups_tiers_without_relabeling_accounts() {
        assert_eq!(UserTier::Free.managed_auto_routing_tier(), "free");
        assert_eq!(UserTier::Basic.managed_auto_routing_tier(), "free");
        assert_eq!(UserTier::Byok.managed_auto_routing_tier(), "free");
        assert_eq!(UserTier::Pro.managed_auto_routing_tier(), "pro");
        assert_eq!(UserTier::Team.managed_auto_routing_tier(), "pro");
        assert_eq!(UserTier::Max.managed_auto_routing_tier(), "max");
        assert_eq!(UserTier::Max15x.managed_auto_routing_tier(), "max");
        assert_eq!(
            UserTier::Enterprise.managed_auto_routing_tier(),
            "enterprise"
        );
    }

    #[test]
    fn parse_tier_str_enterprise_is_distinct() {
        // Enterprise is NOT collapsed to Max, it has its own variant.
        assert_eq!(parse_tier_str("enterprise"), Some(UserTier::Enterprise));
    }

    #[test]
    fn parse_tier_str_unknown_is_none_fail_closed() {
        // Unknown strings return None (fail-closed, callers default to Free).
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
        assert_eq!(cached.status_label(), "Premium");

        let cached = CachedTier {
            tier: UserTier::Max,
        };
        assert_eq!(cached.status_label(), "Max");

        let cached = CachedTier {
            tier: UserTier::Max15x,
        };
        assert_eq!(cached.status_label(), "Ultra");

        let cached = CachedTier {
            tier: UserTier::Basic,
        };
        assert_eq!(cached.status_label(), "Basic");

        let cached = CachedTier {
            tier: UserTier::Team,
        };
        assert_eq!(cached.status_label(), "Team");

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

    #[test]
    fn resolve_agi_api_base_accepts_a_loopback_dev_server() {
        for base in [
            "http://localhost:3100",
            "http://127.0.0.1:3100",
            "http://[::1]:3100",
        ] {
            assert_eq!(
                resolve_agi_api_base(base),
                Some(base.to_string()),
                "a loopback base cannot carry the token off the machine: {base}"
            );
        }
    }

    #[test]
    fn resolve_agi_api_base_rejects_a_host_that_only_looks_loopback() {
        // The token must not reach a remote host whose name merely embeds one
        // of the loopback spellings.
        for base in [
            "http://localhost.evil.com:3100",
            "http://127.0.0.1.evil.com",
            "http://notlocalhost",
            "http://10.0.0.5:3100",
        ] {
            assert_eq!(resolve_agi_api_base(base), None, "{base} must be refused");
        }
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

    // -- cache freshness and invalidation tests ------------------------------

    #[test]
    fn tier_cache_ttl_is_five_minutes() {
        assert_eq!(TIER_CACHE_TTL.as_secs(), 300);
    }

    #[test]
    fn a_plan_list_matches_ids_regardless_of_case() {
        let listed = vec![
            "listed-model-one".to_string(),
            "Listed-Model-Two".to_string(),
        ];
        assert!(plan_lists(&listed, "Listed-Model-One"));
        assert!(plan_lists(&listed, "listed-model-two"));
        assert!(!plan_lists(&listed, "unlisted-model"));
        assert!(!plan_lists(&[], "listed-model-one"));
    }

    #[test]
    fn cache_expires_once_past_the_ttl() {
        let now = 1_746_000_000;
        assert!(cache_is_fresh(now, now));
        assert!(cache_is_fresh(now - TIER_CACHE_TTL.as_secs(), now));
        assert!(!cache_is_fresh(now - TIER_CACHE_TTL.as_secs() - 1, now));
    }

    #[test]
    fn a_changed_server_plan_replaces_the_cached_tier() {
        assert_eq!(
            tier_to_adopt("max_15x", Some(&UserTier::Pro)),
            Some(UserTier::Max15x)
        );
        assert_eq!(
            tier_to_adopt("free", Some(&UserTier::Max)),
            Some(UserTier::Free),
            "a downgrade must not be held back by the cached higher tier"
        );
        assert_eq!(tier_to_adopt("pro", None), Some(UserTier::Pro));
    }

    #[test]
    fn an_unchanged_or_unknown_plan_leaves_the_cache_alone() {
        assert_eq!(tier_to_adopt("pro", Some(&UserTier::Pro)), None);
        assert_eq!(tier_to_adopt("hobby", Some(&UserTier::Pro)), None);
    }

    #[test]
    fn only_auth_and_payment_answers_invalidate_the_tier() {
        for status in [401, 402, 403] {
            assert!(status_invalidates_tier(status), "HTTP {status}");
        }
        for status in [200, 404, 429, 500, 503] {
            assert!(!status_invalidates_tier(status), "HTTP {status}");
        }
    }

    // -- TOML round-trip test -----------------------------------------------

    #[test]
    fn tier_cache_roundtrip_toml() {
        let envelope = TierCacheEnvelope {
            owner: None,
            tier: "pro".to_string(),
            cached_at: 1_746_000_000,
            capability_handshake: None,
        };
        let serialized = toml::to_string(&envelope).expect("should serialize");
        let back: TierCacheEnvelope = toml::from_str(&serialized).expect("should deserialize");
        assert_eq!(back.tier, "pro");
        assert_eq!(back.cached_at, 1_746_000_000);
    }

    #[test]
    fn only_a_managed_session_fetches_the_plan_model_list() {
        use crate::platform::runtime::session::PrivacyMode;
        assert!(!plan_models_fetch_admitted(PrivacyMode::Local));
        assert!(!plan_models_fetch_admitted(PrivacyMode::Byok));
        assert!(plan_models_fetch_admitted(PrivacyMode::Managed));
    }
}
