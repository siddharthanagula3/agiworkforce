use std::collections::VecDeque;
use std::io::{self, Write};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::Value;
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use crate::config::{McpTimeouts, READ_CACHE_PRUNE_INTERVAL};
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
    key: String,
    value: Value,
    fresh_until: Instant,
    auth_epoch: Option<u64>,
    bytes: usize,
}

struct ReadCache {
    entries: VecDeque<Entry>,
    bytes: usize,
    entry_cap: usize,
    byte_cap: usize,
    ttl_cap: Duration,
}

impl ReadCache {
    fn new(timeouts: &McpTimeouts) -> Self {
        Self {
            entries: VecDeque::new(),
            bytes: 0,
            entry_cap: timeouts.read_cache_entries_cap(),
            byte_cap: timeouts.read_cache_bytes_cap(),
            ttl_cap: timeouts.read_cache_ttl_cap(),
        }
    }

    fn prune(&mut self, now: Instant) {
        let bytes = &mut self.bytes;
        self.entries.retain(|entry| {
            if now < entry.fresh_until {
                true
            } else {
                *bytes -= entry.bytes;
                false
            }
        });
    }

    fn cached(&mut self, key: &str, auth_epoch: u64, now: Instant) -> Option<Value> {
        self.prune(now);
        let index = self.entries.iter().position(|entry| entry.key == key)?;
        let entry = self.entries.remove(index)?;
        if entry.auth_epoch.is_some_and(|epoch| epoch != auth_epoch) {
            self.bytes -= entry.bytes;
            return None;
        }
        let value = entry.value.clone();
        self.entries.push_back(entry);
        Some(value)
    }

    fn store(&mut self, key: String, value: &Value, auth_epoch: u64, now: Instant) {
        self.prune(now);
        if self.entry_cap == 0 || self.byte_cap == 0 || self.ttl_cap.is_zero() {
            return;
        }
        let Some(ttl_ms) = value
            .get("ttlMs")
            .and_then(Value::as_u64)
            .filter(|ttl| *ttl > 0)
        else {
            return;
        };
        let Some(fresh_until) = now.checked_add(Duration::from_millis(ttl_ms).min(self.ttl_cap))
        else {
            return;
        };
        let Some(bytes) = entry_bytes(&key, value, self.byte_cap) else {
            return;
        };
        if let Some(index) = self.entries.iter().position(|entry| entry.key == key)
            && let Some(entry) = self.entries.remove(index)
        {
            self.bytes -= entry.bytes;
        }
        while self.entries.len() >= self.entry_cap
            || bytes > self.byte_cap.saturating_sub(self.bytes)
        {
            let Some(entry) = self.entries.pop_front() else {
                break;
            };
            self.bytes -= entry.bytes;
        }
        let public = value.get("cacheScope").and_then(Value::as_str) == Some("public");
        self.entries.push_back(Entry {
            key,
            value: value.clone(),
            fresh_until,
            auth_epoch: (!public).then_some(auth_epoch),
            bytes,
        });
        self.bytes += bytes;
    }

    fn clear(&mut self) {
        self.entries.clear();
        self.bytes = 0;
    }

    fn invalidate(&mut self, prefixes: &[&str]) {
        let bytes = &mut self.bytes;
        self.entries.retain(|entry| {
            if prefixes.iter().any(|prefix| entry.key.starts_with(prefix)) {
                *bytes -= entry.bytes;
                false
            } else {
                true
            }
        });
    }
}

struct ByteCounter {
    bytes: usize,
    cap: usize,
}

impl Write for ByteCounter {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > self.cap.saturating_sub(self.bytes) {
            return Err(io::Error::other("cache entry exceeds byte budget"));
        }
        self.bytes += bytes.len();
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

fn entry_bytes(key: &str, value: &Value, cap: usize) -> Option<usize> {
    let mut counter = ByteCounter {
        bytes: 0,
        cap: cap.checked_sub(key.len())?,
    };
    serde_json::to_writer(&mut counter, value).ok()?;
    key.len().checked_add(counter.bytes)
}

pub(crate) struct Events {
    notifications: mpsc::Sender<McpNotification>,
    cache: Arc<Mutex<ReadCache>>,
    pruner: Option<JoinHandle<()>>,
}

impl Events {
    pub(crate) fn new(
        notifications: mpsc::Sender<McpNotification>,
        timeouts: &McpTimeouts,
    ) -> Self {
        let cache = Arc::new(Mutex::new(ReadCache::new(timeouts)));
        let pruner = if timeouts.read_cache_entries_cap() > 0
            && timeouts.read_cache_bytes_cap() > 0
            && !timeouts.read_cache_ttl_cap().is_zero()
        {
            let cache = Arc::downgrade(&cache);
            Some(tokio::spawn(async move {
                let mut interval = tokio::time::interval(READ_CACHE_PRUNE_INTERVAL);
                interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
                loop {
                    interval.tick().await;
                    let Some(cache) = cache.upgrade() else {
                        return;
                    };
                    if let Ok(mut cache) = cache.try_lock() {
                        cache.prune(Instant::now());
                    }
                }
            }))
        } else {
            None
        };
        Self {
            notifications,
            cache,
            pruner,
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
        self.cache
            .lock()
            .ok()?
            .cached(key, auth_epoch, Instant::now())
    }

    pub(crate) fn store(&self, key: String, value: &Value, auth_epoch: u64) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.store(key, value, auth_epoch, Instant::now());
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
            cache.invalidate(stale);
        }
        let _ = self
            .notifications
            .try_send(McpNotification { method, params });
    }
}

impl Drop for Events {
    fn drop(&mut self) {
        if let Some(pruner) = self.pruner.take() {
            pruner.abort();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn limits(entries: usize, bytes: usize, ttl: Duration) -> McpTimeouts {
        McpTimeouts {
            max_read_cache_entries: Some(entries),
            max_read_cache_bytes: Some(bytes),
            max_read_cache_ttl: Some(ttl),
            ..McpTimeouts::default()
        }
    }

    fn value(text: &str) -> Value {
        json!({ "ttlMs": 10_000, "contents": text })
    }

    fn assert_bounded(cache: &ReadCache) {
        assert!(cache.entries.len() <= cache.entry_cap);
        assert!(cache.bytes <= cache.byte_cap);
        assert_eq!(
            cache.bytes,
            cache.entries.iter().map(|entry| entry.bytes).sum::<usize>()
        );
        assert_eq!(
            cache.bytes,
            cache
                .entries
                .iter()
                .map(|entry| { entry.key.len() + serde_json::to_vec(&entry.value).unwrap().len() })
                .sum::<usize>()
        );
    }

    #[test]
    fn count_and_byte_eviction_preserve_most_recently_used_values() {
        let now = Instant::now();
        let mut cache = ReadCache::new(&limits(2, 512, Duration::from_secs(1)));
        cache.store("a".into(), &value("first"), 1, now);
        cache.store("b".into(), &value("second"), 1, now);
        assert_eq!(cache.cached("a", 1, now), Some(value("first")));
        cache.store("c".into(), &value("third"), 1, now);
        assert!(cache.cached("b", 1, now).is_none());
        assert_eq!(cache.cached("a", 1, now), Some(value("first")));
        assert_eq!(cache.cached("c", 1, now), Some(value("third")));
        assert_bounded(&cache);
        cache.store("a".into(), &value("replacement"), 1, now);
        assert_eq!(cache.entries.len(), 2);
        assert_eq!(cache.cached("a", 1, now), Some(value("replacement")));
        assert_bounded(&cache);
    }

    #[test]
    fn byte_measure_counts_unicode_keys_and_payload_without_a_serialized_buffer() {
        let item = value("λ🙂\n\"");
        let bytes = "λ".len() + serde_json::to_vec(&item).unwrap().len();
        assert_eq!(entry_bytes("λ", &item, bytes), Some(bytes));
        assert!(entry_bytes("λ", &item, bytes - 1).is_none());
        assert!(entry_bytes("λ", &item, 1).is_none());
        let mut counter = ByteCounter { bytes: 0, cap: 2 };
        assert!(counter.write_all(b"abc").is_err());
        assert_eq!(counter.bytes, 0);
        let now = Instant::now();
        let mut cache = ReadCache::new(&limits(10, bytes, Duration::from_secs(1)));
        cache.store("λ".into(), &item, 1, now);
        cache.store("λ".into(), &value(&"x".repeat(bytes)), 1, now);
        assert_eq!(cache.cached("λ", 1, now), Some(item));
        assert_bounded(&cache);
    }

    #[test]
    fn unrelated_access_and_store_prune_all_expired_keys() {
        let now = Instant::now();
        let mut cache = ReadCache::new(&limits(10, 4096, Duration::from_millis(10)));
        for key in ["a", "b", "c"] {
            cache.store(key.into(), &value(key), 1, now);
        }
        assert!(
            cache
                .cached("unrelated", 1, now + Duration::from_millis(11))
                .is_none()
        );
        assert!(cache.entries.is_empty());
        assert_eq!(cache.bytes, 0);
        cache.store("a".into(), &value("old"), 1, now);
        cache.store(
            "fresh".into(),
            &value("new"),
            1,
            now + Duration::from_millis(11),
        );
        assert_eq!(cache.entries.len(), 1);
        assert_eq!(cache.entries[0].key, "fresh");
        assert_bounded(&cache);
    }

    #[test]
    fn ttl_is_clamped_and_cache_hits_do_not_extend_expiry() {
        let now = Instant::now();
        let mut cache = ReadCache::new(&limits(10, 4096, Duration::from_millis(10)));
        let huge_ttl = json!({ "ttlMs": u64::MAX, "contents": "large ttl" });
        cache.store("a".into(), &huge_ttl, 1, now);
        assert_eq!(
            cache.entries[0].fresh_until,
            now + Duration::from_millis(10)
        );
        assert_eq!(
            cache.cached("a", 1, now + Duration::from_millis(5)),
            Some(huge_ttl)
        );
        assert!(
            cache
                .cached("a", 1, now + Duration::from_millis(10))
                .is_none()
        );
        cache.store("missing".into(), &json!({ "contents": "no ttl" }), 1, now);
        for ttl in [json!(0), json!(-1), json!(1.5), json!("100")] {
            cache.store("invalid".into(), &json!({ "ttlMs": ttl }), 1, now);
        }
        assert!(cache.entries.is_empty());
    }

    #[test]
    fn public_scope_and_private_auth_epoch_remain_distinct() {
        let now = Instant::now();
        let mut cache = ReadCache::new(&limits(10, 4096, Duration::from_secs(1)));
        let public = json!({ "ttlMs": 1000, "cacheScope": "public", "contents": "public" });
        let private = json!({ "ttlMs": 1000, "cacheScope": "private", "contents": "private" });
        cache.store("public".into(), &public, 1, now);
        cache.store("private".into(), &private, 1, now);
        assert_eq!(cache.cached("private", 1, now), Some(private));
        assert!(cache.cached("private", 2, now).is_none());
        assert_eq!(cache.cached("public", 2, now), Some(public));
        assert_bounded(&cache);
    }

    #[tokio::test]
    async fn notification_invalidation_preserves_other_methods_and_updates_byte_totals() {
        let (tx, mut rx) = mpsc::channel(1);
        let events = Events::new(tx, &limits(10, 4096, Duration::from_secs(1)));
        for key in ["resources/read a", "resources/read b", "tools/list c"] {
            events.store(key.into(), &value(key), 1);
        }
        events.notify(
            "notifications/resources/updated".into(),
            json!({ "uri": "a" }),
        );
        assert!(events.cached("resources/read a", 1).is_none());
        assert!(events.cached("resources/read b", 1).is_none());
        assert_eq!(
            events.cached("tools/list c", 1),
            Some(value("tools/list c"))
        );
        assert_eq!(
            rx.try_recv().unwrap().method,
            "notifications/resources/updated"
        );
        assert_bounded(&events.cache.lock().unwrap());
        events.clear();
        let cache = events.cache.lock().unwrap();
        assert!(cache.entries.is_empty());
        assert_eq!(cache.bytes, 0);
    }

    #[tokio::test]
    async fn idle_pruner_removes_expired_entries_without_another_read() {
        let (tx, _) = mpsc::channel(1);
        let events = Events::new(tx, &limits(10, 4096, Duration::from_millis(10)));
        for key in ["a", "b", "c"] {
            events.store(key.into(), &value(key), 1);
        }
        assert_eq!(events.cache.lock().unwrap().entries.len(), 3);
        tokio::time::timeout(
            READ_CACHE_PRUNE_INTERVAL * 2 + Duration::from_secs(1),
            async {
                loop {
                    {
                        let cache = events.cache.lock().unwrap();
                        if cache.entries.is_empty() {
                            assert_eq!(cache.bytes, 0);
                            break;
                        }
                    }
                    tokio::time::sleep(Duration::from_millis(10)).await;
                }
            },
        )
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn owner_drop_aborts_pruner_and_releases_cache_without_a_strong_task_owner() {
        let (tx, _) = mpsc::channel(1);
        let events = Events::new(tx, &McpTimeouts::default());
        let cache = Arc::downgrade(&events.cache);
        let task = events.pruner.as_ref().unwrap().abort_handle();
        tokio::task::yield_now().await;
        drop(events);
        tokio::time::timeout(Duration::from_secs(1), async {
            while !task.is_finished() {
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        assert!(cache.upgrade().is_none());
    }

    #[tokio::test]
    async fn zero_limits_disable_retention_and_do_not_start_a_pruner() {
        for timeouts in [
            limits(0, 4096, Duration::from_secs(1)),
            limits(10, 0, Duration::from_secs(1)),
            limits(10, 4096, Duration::ZERO),
        ] {
            let (tx, _) = mpsc::channel(1);
            let events = Events::new(tx, &timeouts);
            events.store("a".into(), &value("value"), 1);
            assert!(events.cached("a", 1).is_none());
            assert!(events.pruner.is_none());
            assert_bounded(&events.cache.lock().unwrap());
        }
    }

    #[test]
    fn cache_key_eligibility_preserves_metadata_and_interaction_boundaries() {
        assert_eq!(
            Events::cache_key(
                "resources/read",
                Some(&json!({ "uri": "sim://a", "_meta": { "a": 1 } }))
            ),
            Events::cache_key("resources/read", Some(&json!({ "uri": "sim://a" })))
        );
        assert!(Events::cache_key("tools/call", None).is_none());
        for field in ["inputResponses", "requestState"] {
            assert!(
                Events::cache_key("resources/read", Some(&json!({ field: "state" }))).is_none()
            );
        }
    }
}
