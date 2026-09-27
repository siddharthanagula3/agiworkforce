use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::mpsc;

use crate::notification::McpNotification;

const CACHEABLE_METHODS: &[&str] = &[
    "server/discover",
    "tools/list",
    "prompts/list",
    "resources/list",
    "resources/templates/list",
    "resources/read",
];

struct Entry {
    value: Value,
    fresh_until: Instant,
    auth_epoch: Option<u64>,
}

pub(crate) struct Events {
    notifications: mpsc::Sender<McpNotification>,
    cache: Mutex<HashMap<String, Entry>>,
}

impl Events {
    pub(crate) fn new(notifications: mpsc::Sender<McpNotification>) -> Self {
        Self {
            notifications,
            cache: Mutex::new(HashMap::new()),
        }
    }

    pub(crate) fn cache_key(method: &str, params: Option<&Value>) -> Option<String> {
        if !CACHEABLE_METHODS.contains(&method) {
            return None;
        }
        let mut params = params
            .cloned()
            .unwrap_or_else(|| Value::Object(serde_json::Map::new()));
        if let Some(object) = params.as_object_mut() {
            if object.contains_key("inputResponses") || object.contains_key("requestState") {
                return None;
            }
            object.remove("_meta");
        }
        Some(format!("{method} {params}"))
    }

    pub(crate) fn cached(&self, key: &str, auth_epoch: u64) -> Option<Value> {
        let mut cache = self.cache.lock().ok()?;
        let hit = cache
            .get(key)
            .filter(|entry| {
                Instant::now() < entry.fresh_until
                    && entry.auth_epoch.is_none_or(|epoch| epoch == auth_epoch)
            })
            .map(|entry| entry.value.clone());
        if hit.is_none() {
            cache.remove(key);
        }
        hit
    }

    pub(crate) fn store(&self, key: String, value: &Value, auth_epoch: u64) {
        let Some(ttl_ms) = value
            .get("ttlMs")
            .and_then(Value::as_u64)
            .filter(|ttl| *ttl > 0)
        else {
            return;
        };
        let public = value.get("cacheScope").and_then(Value::as_str) == Some("public");
        if let Ok(mut cache) = self.cache.lock() {
            cache.insert(
                key,
                Entry {
                    value: value.clone(),
                    fresh_until: Instant::now() + Duration::from_millis(ttl_ms),
                    auth_epoch: (!public).then_some(auth_epoch),
                },
            );
        }
    }

    pub(crate) fn clear(&self) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.clear();
        }
    }

    pub(crate) fn notify(&self, method: String, params: Value) {
        let stale: &[&str] = match method.as_str() {
            "notifications/tools/list_changed" => &["tools/list "],
            "notifications/prompts/list_changed" => &["prompts/list "],
            "notifications/resources/list_changed" => {
                &["resources/list ", "resources/templates/list "]
            }
            "notifications/resources/updated" => &["resources/read "],
            _ => &[],
        };
        if !stale.is_empty()
            && let Ok(mut cache) = self.cache.lock()
        {
            cache.retain(|key, _| !stale.iter().any(|prefix| key.starts_with(prefix)));
        }
        let _ = self
            .notifications
            .try_send(McpNotification { method, params });
    }
}
