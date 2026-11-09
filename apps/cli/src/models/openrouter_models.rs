//! OpenRouter live model catalog.
//!
//! OpenRouter is a BYOK gateway that proxies hundreds of models, so they can't
//! be hand-curated into `models.json`. Instead we fetch OpenRouter's public
//! `/models` list at runtime and map recent models into catalog [`Model`]s the
//! BYOK picker can list. Only *new* models are surfaced, legacy/old models are
//! dropped, and the result is cached on disk so the picker reads it instantly.

use std::path::PathBuf;
use std::time::Duration;

use anyhow::Result;
use serde::{Deserialize, Serialize};

use crate::model_catalog::Model;

const OPENROUTER_MODELS_URL: &str = "https://openrouter.ai/api/v1/models";
const CACHE_FILE: &str = "cache/openrouter_models.json";
/// How long a cached OpenRouter model list stays fresh.
const CACHE_TTL_SECS: i64 = 6 * 3600;
/// Only surface models created within this window ("new, not old"). Drops
/// legacy entries (e.g. multi-year-old base models) from the picker.
const NEW_WINDOW_DAYS: i64 = 730;

#[derive(Debug, Serialize, Deserialize)]
struct CacheFile {
    fetched_at: String,
    models: Vec<Model>,
}

fn cache_path() -> Option<PathBuf> {
    crate::config::CliConfig::config_dir()
        .ok()
        .map(|dir| dir.join(CACHE_FILE))
}

fn parse_price_per_million(pricing: Option<&serde_json::Value>, key: &str) -> f64 {
    pricing
        .and_then(|p| p.get(key))
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .map(|per_token| per_token * 1_000_000.0)
        .unwrap_or(0.0)
}

/// Map one OpenRouter `/models` entry into a catalog [`Model`], or `None` if it
/// is too old or malformed.
fn map_entry(entry: &serde_json::Value, cutoff_unix: i64) -> Option<Model> {
    let created = entry.get("created").and_then(|c| c.as_i64()).unwrap_or(0);
    if created != 0 && created < cutoff_unix {
        return None; // old model, skip
    }
    let id = entry.get("id").and_then(|v| v.as_str())?.trim().to_string();
    if id.is_empty() {
        return None;
    }
    let display_name = entry
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(&id)
        .to_string();
    let context_window = entry
        .get("context_length")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let pricing = entry.get("pricing");
    let architecture = entry.get("architecture");
    let supports_vision = architecture
        .and_then(|a| a.get("input_modalities"))
        .and_then(|v| v.as_array())
        .map(|mods| mods.iter().any(|m| m.as_str() == Some("image")))
        .unwrap_or(false);
    // Only surface chat/text models. Drop generators that output media (e.g. the
    // music model lyria outputs ["text","audio"], image models output "image"):
    // they can't be used as a normal chat model and fail on selection.
    let outputs_media = architecture
        .and_then(|a| a.get("output_modalities"))
        .and_then(|v| v.as_array())
        .map(|mods| {
            mods.iter()
                .any(|m| matches!(m.as_str(), Some("audio") | Some("image") | Some("video")))
        })
        .unwrap_or(false);
    if outputs_media {
        return None;
    }
    let max_output_tokens = entry
        .get("top_provider")
        .and_then(|t| t.get("max_completion_tokens"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;
    let input_price_per_1m = parse_price_per_million(pricing, "prompt");
    let output_price_per_1m = parse_price_per_million(pricing, "completion");
    // OpenRouter uses a negative sentinel (-1) for its internal variable-priced
    // router models. Those aren't standard selectable models and would render
    // as negative cost, drop them.
    if input_price_per_1m < 0.0 || output_price_per_1m < 0.0 {
        return None;
    }

    Some(Model {
        id,
        provider: "openrouter".to_string(),
        display_name,
        context_window,
        max_output_tokens,
        input_price_per_1m,
        output_price_per_1m,
        cache_read_price_per_1m: parse_price_per_million(pricing, "input_cache_read"),
        cache_write_price_per_1m: parse_price_per_million(pricing, "input_cache_write"),
        supports_tools: true,
        supports_vision,
        supports_reasoning: false,
        supports_audio_input: false,
        supports_audio_output: false,
        supports_pdf: false,
        release_date: String::new(),
        status: "active".to_string(),
        cloud_eligible: false,
        requires_environment: None,
    })
}

/// Fetch OpenRouter's live model list and map recent models into catalog
/// `Model`s. Network call; intended to run off the UI path (background task).
pub async fn fetch_openrouter_models() -> Result<Vec<Model>> {
    let response = reqwest::Client::new()
        .get(OPENROUTER_MODELS_URL)
        .timeout(Duration::from_secs(12))
        .send()
        .await?
        .error_for_status()?;
    let json: serde_json::Value = response.json().await?;
    let data = json
        .get("data")
        .and_then(|d| d.as_array())
        .cloned()
        .unwrap_or_default();

    let cutoff = chrono::Utc::now().timestamp() - NEW_WINDOW_DAYS * 86_400;
    let mut models: Vec<Model> = data
        .iter()
        .filter_map(|entry| map_entry(entry, cutoff))
        .collect();
    // Stable, useful order: cheapest input price first (free/cheap models on top).
    models.sort_by(|a, b| {
        a.input_price_per_1m
            .partial_cmp(&b.input_price_per_1m)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.id.cmp(&b.id))
    });
    Ok(models)
}

/// Persist a fetched model list to the on-disk cache.
pub fn save_cache(models: &[Model], now_rfc3339: &str) {
    let Some(path) = cache_path() else { return };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let payload = CacheFile {
        fetched_at: now_rfc3339.to_string(),
        models: models.to_vec(),
    };
    if let Ok(json) = serde_json::to_string(&payload) {
        let _ = std::fs::write(&path, json);
    }
    if let Ok(mut guard) = MEMO.lock() {
        *guard = None;
    }
}

#[derive(Debug, Clone, Default)]
struct CachedCatalog {
    models: Vec<Model>,
    fresh: bool,
}

/// In-memory memo of the parsed cache so the model picker (which reloads on
/// every keystroke) doesn't re-read + re-parse the ~160KB cache file each time.
static MEMO: std::sync::Mutex<Option<(i64, CachedCatalog)>> = std::sync::Mutex::new(None);
const MEMO_TTL_SECS: i64 = 3;

static LAST_REFRESH_ATTEMPT: std::sync::atomic::AtomicI64 =
    std::sync::atomic::AtomicI64::new(i64::MIN);
const REFRESH_RETRY_SECS: i64 = 60;

/// Load the last cached OpenRouter models, fresh or past their TTL, so a
/// listed model keeps its picker row and its route while a refresh runs.
/// Memoized in memory for a few seconds so hot paths (picker keystrokes) are
/// cheap. Returns an empty vec when the cache is missing or unreadable.
pub fn load_cached_models() -> Vec<Model> {
    load_cached_catalog().models
}

/// Start one background fetch when the cache is missing or past its TTL.
/// Attempts are spaced by `REFRESH_RETRY_SECS`, so a failing network is not
/// retried on every picker keystroke. No-op outside a Tokio runtime.
pub fn refresh_cache_if_stale() {
    if load_cached_catalog().fresh {
        return;
    }
    let Ok(runtime) = tokio::runtime::Handle::try_current() else {
        return;
    };
    if !claim_refresh_attempt(chrono::Utc::now().timestamp()) {
        return;
    }
    runtime.spawn(async {
        if let Ok(models) = fetch_openrouter_models().await {
            save_cache(&models, &chrono::Utc::now().to_rfc3339());
        }
    });
}

fn refresh_due(last_attempt: i64, now: i64) -> bool {
    now.saturating_sub(last_attempt) >= REFRESH_RETRY_SECS
}

fn claim_refresh_attempt(now: i64) -> bool {
    use std::sync::atomic::Ordering;
    let last = LAST_REFRESH_ATTEMPT.load(Ordering::Acquire);
    refresh_due(last, now)
        && LAST_REFRESH_ATTEMPT
            .compare_exchange(last, now, Ordering::AcqRel, Ordering::Acquire)
            .is_ok()
}

fn load_cached_catalog() -> CachedCatalog {
    let now = chrono::Utc::now().timestamp();
    if let Ok(guard) = MEMO.lock() {
        if let Some((loaded_at, catalog)) = guard.as_ref() {
            if now - *loaded_at < MEMO_TTL_SECS {
                return catalog.clone();
            }
        }
    }
    let catalog = cache_path()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|content| parse_cache(&content, chrono::Utc::now()))
        .unwrap_or_default();
    if let Ok(mut guard) = MEMO.lock() {
        *guard = Some((now, catalog.clone()));
    }
    catalog
}

fn parse_cache(content: &str, now: chrono::DateTime<chrono::Utc>) -> Option<CachedCatalog> {
    let cache = serde_json::from_str::<CacheFile>(content).ok()?;
    let fresh = chrono::DateTime::parse_from_rfc3339(&cache.fetched_at)
        .map(|fetched| now.signed_duration_since(fetched).num_seconds() < CACHE_TTL_SECS)
        .unwrap_or(false);
    Some(CachedCatalog {
        models: cache.models,
        fresh,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_entry_drops_old_models_and_keeps_new() {
        let cutoff = 1_700_000_000;
        let old = serde_json::json!({"id": "legacy/model", "created": 1_600_000_000});
        assert!(
            map_entry(&old, cutoff).is_none(),
            "old model should be dropped"
        );

        let new = serde_json::json!({
            "id": "vendor/new-model",
            "name": "New Model",
            "created": 1_750_000_000,
            "context_length": 128000,
            "pricing": {"prompt": "0.0000025", "completion": "0.00001"},
            "architecture": {"input_modalities": ["text", "image"]}
        });
        let model = map_entry(&new, cutoff).expect("new model should map");
        assert_eq!(model.id, "vendor/new-model");
        assert_eq!(model.provider, "openrouter");
        assert_eq!(model.context_window, 128000);
        assert!(model.supports_vision, "image modality → vision");
        // 0.0000025 * 1e6 = 2.5 per 1M
        assert!((model.input_price_per_1m - 2.5).abs() < 1e-9);
        assert!((model.output_price_per_1m - 10.0).abs() < 1e-9);
    }

    fn cache_json(fetched_at: &str) -> String {
        let model = map_entry(
            &serde_json::json!({"id": "fixture-vendor/dynamic-model", "created": 0}),
            0,
        )
        .expect("fixture model maps");
        serde_json::to_string(&CacheFile {
            fetched_at: fetched_at.to_string(),
            models: vec![model],
        })
        .expect("cache serializes")
    }

    #[test]
    fn expired_cache_keeps_its_models_and_reports_stale() {
        let now = chrono::Utc::now();
        let expired = (now - chrono::Duration::seconds(CACHE_TTL_SECS + 1)).to_rfc3339();
        let catalog = parse_cache(&cache_json(&expired), now).expect("cache parses");
        assert!(!catalog.fresh);
        assert_eq!(catalog.models.len(), 1);
        assert_eq!(catalog.models[0].id, "fixture-vendor/dynamic-model");
    }

    #[test]
    fn cache_within_ttl_is_fresh() {
        let now = chrono::Utc::now();
        let recent = (now - chrono::Duration::seconds(CACHE_TTL_SECS - 60)).to_rfc3339();
        let catalog = parse_cache(&cache_json(&recent), now).expect("cache parses");
        assert!(catalog.fresh);
        assert_eq!(catalog.models.len(), 1);
    }

    #[test]
    fn unreadable_fetch_time_is_stale_and_malformed_cache_is_absent() {
        let now = chrono::Utc::now();
        let catalog = parse_cache(&cache_json("not-a-time"), now).expect("cache parses");
        assert!(!catalog.fresh);
        assert!(parse_cache("{", now).is_none());
    }

    #[test]
    fn refresh_attempts_are_spaced() {
        assert!(refresh_due(i64::MIN, 1_700_000_000));
        let last = 1_700_000_000;
        assert!(!refresh_due(last, last + REFRESH_RETRY_SECS - 1));
        assert!(refresh_due(last, last + REFRESH_RETRY_SECS));
    }

    #[test]
    fn map_entry_requires_id() {
        let no_id = serde_json::json!({"created": 9_999_999_999i64});
        assert!(map_entry(&no_id, 0).is_none());
    }

    // Network test, run with `cargo test -- --ignored openrouter_live`.
    #[tokio::test]
    #[ignore = "live network test; run with: cargo test -- --ignored openrouter_live"]
    async fn openrouter_live_fetch_returns_new_models() {
        let models = fetch_openrouter_models().await.expect("fetch");
        assert!(!models.is_empty(), "expected some OpenRouter models");
        assert!(models.iter().all(|m| m.provider == "openrouter"));
        eprintln!("fetched {} new OpenRouter models; sample:", models.len());
        for m in models.iter().take(5) {
            eprintln!(
                "  {} | ctx {} | ${}/{} per 1M",
                m.id, m.context_window, m.input_price_per_1m, m.output_price_per_1m
            );
        }
    }
}
