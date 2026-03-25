use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelsCache {
    pub fetched_at: String,
    pub client_version: String,
    pub models: serde_json::Value,
}

impl ModelsCache {
    const TTL_SECS: u64 = 3600; // 1 hour

    /// Load cached model data if it exists and is within TTL.
    pub fn load(home: &Path) -> Option<Self> {
        let path = home.join("models_cache.json");
        let content = std::fs::read_to_string(&path).ok()?;
        let cache: Self = serde_json::from_str(&content).ok()?;

        // Check TTL using chrono (available as a dependency)
        if let Ok(fetched) = chrono::DateTime::parse_from_rfc3339(&cache.fetched_at) {
            let age = chrono::Utc::now().signed_duration_since(fetched);
            if age.num_seconds() < Self::TTL_SECS as i64 {
                return Some(cache);
            }
        }
        None
    }

    /// Save model data to the cache file.
    pub fn save(home: &Path, models: &serde_json::Value) -> Result<()> {
        let cache = Self {
            fetched_at: chrono::Utc::now().to_rfc3339(),
            client_version: env!("CARGO_PKG_VERSION").to_string(),
            models: models.clone(),
        };
        let path = home.join("models_cache.json");
        let json = serde_json::to_string_pretty(&cache)?;
        std::fs::write(&path, json)?;
        Ok(())
    }
}
