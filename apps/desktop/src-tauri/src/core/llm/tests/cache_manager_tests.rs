#[cfg(test)]
mod tests {
    use crate::core::llm::cache_manager::CacheManager;
    use crate::core::llm::ChatMessage;
    use chrono::{Duration as ChronoDuration, Utc};
    use std::time::Duration;

    fn make_msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.to_string(),
            content: content.to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }
    }

    // C10: compute_hash returns consistent hashes for the same input
    #[test]
    fn compute_hash_is_deterministic() {
        let messages = vec![
            make_msg("user", "Hello"),
            make_msg("assistant", "Hi there"),
        ];
        let hash1 = CacheManager::compute_hash(&messages);
        let hash2 = CacheManager::compute_hash(&messages);
        assert_eq!(hash1, hash2, "Same messages must produce the same hash");
    }

    // C10: different inputs produce different hashes
    #[test]
    fn compute_hash_differs_for_different_inputs() {
        let messages_a = vec![make_msg("user", "Hello")];
        let messages_b = vec![make_msg("user", "Goodbye")];
        let hash_a = CacheManager::compute_hash(&messages_a);
        let hash_b = CacheManager::compute_hash(&messages_b);
        assert_ne!(
            hash_a, hash_b,
            "Different messages must produce different hashes"
        );
    }

    #[test]
    fn compute_hash_differs_by_role() {
        let messages_a = vec![make_msg("user", "Hello")];
        let messages_b = vec![make_msg("assistant", "Hello")];
        let hash_a = CacheManager::compute_hash(&messages_a);
        let hash_b = CacheManager::compute_hash(&messages_b);
        assert_ne!(
            hash_a, hash_b,
            "Same content with different roles must produce different hashes"
        );
    }

    #[test]
    fn compute_hash_empty_messages() {
        let messages: Vec<ChatMessage> = vec![];
        let hash = CacheManager::compute_hash(&messages);
        assert!(!hash.is_empty(), "Hash of empty messages must not be empty");
    }

    // C10: temperature_aware_expiry returns 7 days for Some(0.0)
    #[test]
    fn temperature_aware_expiry_zero_temp_is_seven_days() {
        let cm = CacheManager::new(Duration::from_secs(3600), 100);
        let before = Utc::now();
        let expiry = cm.temperature_aware_expiry(Some(0.0));
        let after = Utc::now();

        // 7 days = 604800 seconds. Allow 2 second tolerance for test execution time.
        let seven_days = ChronoDuration::days(7);
        assert!(
            expiry >= before + seven_days - ChronoDuration::seconds(2),
            "Expiry for temp=0.0 should be ~7 days from now"
        );
        assert!(
            expiry <= after + seven_days + ChronoDuration::seconds(2),
            "Expiry for temp=0.0 should be ~7 days from now"
        );
    }

    // C10: temperature_aware_expiry returns 1 hour for non-zero temps
    #[test]
    fn temperature_aware_expiry_nonzero_temp_is_one_hour() {
        let cm = CacheManager::new(Duration::from_secs(3600), 100);
        let before = Utc::now();
        let expiry = cm.temperature_aware_expiry(Some(0.7));
        let after = Utc::now();

        let one_hour = ChronoDuration::hours(1);
        assert!(
            expiry >= before + one_hour - ChronoDuration::seconds(2),
            "Expiry for temp=0.7 should be ~1 hour from now"
        );
        assert!(
            expiry <= after + one_hour + ChronoDuration::seconds(2),
            "Expiry for temp=0.7 should be ~1 hour from now"
        );
    }

    // C10: temperature_aware_expiry returns 1 hour for None
    #[test]
    fn temperature_aware_expiry_none_is_one_hour() {
        let cm = CacheManager::new(Duration::from_secs(3600), 100);
        let before = Utc::now();
        let expiry = cm.temperature_aware_expiry(None);
        let after = Utc::now();

        let one_hour = ChronoDuration::hours(1);
        assert!(
            expiry >= before + one_hour - ChronoDuration::seconds(2),
            "Expiry for temp=None should be ~1 hour from now"
        );
        assert!(
            expiry <= after + one_hour + ChronoDuration::seconds(2),
            "Expiry for temp=None should be ~1 hour from now"
        );
    }

    #[test]
    fn compute_cache_key_is_deterministic() {
        let messages = vec![make_msg("user", "test")];
        let key1 = CacheManager::compute_cache_key(
            crate::core::llm::Provider::OpenAI,
            "gpt-4",
            &messages,
            Some(0.7),
            Some(1024),
        );
        let key2 = CacheManager::compute_cache_key(
            crate::core::llm::Provider::OpenAI,
            "gpt-4",
            &messages,
            Some(0.7),
            Some(1024),
        );
        assert_eq!(key1, key2, "Same inputs must produce the same cache key");
    }

    #[test]
    fn compute_cache_key_differs_by_provider() {
        let messages = vec![make_msg("user", "test")];
        let key_openai = CacheManager::compute_cache_key(
            crate::core::llm::Provider::OpenAI,
            "gpt-4",
            &messages,
            None,
            None,
        );
        let key_anthropic = CacheManager::compute_cache_key(
            crate::core::llm::Provider::Anthropic,
            "gpt-4",
            &messages,
            None,
            None,
        );
        assert_ne!(
            key_openai, key_anthropic,
            "Different providers must produce different cache keys"
        );
    }

    #[test]
    fn default_expiry_uses_ttl() {
        let cm = CacheManager::new(Duration::from_secs(7200), 100);
        let before = Utc::now();
        let expiry = cm.default_expiry();
        let after = Utc::now();

        let two_hours = ChronoDuration::hours(2);
        assert!(
            expiry >= before + two_hours - ChronoDuration::seconds(2),
            "Default expiry should be ~2 hours (ttl=7200s) from now"
        );
        assert!(
            expiry <= after + two_hours + ChronoDuration::seconds(2),
            "Default expiry should be ~2 hours (ttl=7200s) from now"
        );
    }

    #[test]
    fn ttl_accessor_returns_configured_value() {
        let cm = CacheManager::new(Duration::from_secs(3600), 100);
        assert_eq!(cm.ttl(), Duration::from_secs(3600));
    }
}
