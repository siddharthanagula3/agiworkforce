use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub max_requests: usize,
    pub window: Duration,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            max_requests: 100,
            window: Duration::from_secs(60),
        }
    }
}

struct RequestRecord {
    timestamps: Vec<Instant>,
}

pub struct RateLimiter {
    config: RateLimitConfig,
    records: Mutex<HashMap<String, RequestRecord>>,
}

impl RateLimiter {
    pub fn new(config: RateLimitConfig) -> Self {
        Self {
            config,
            records: Mutex::new(HashMap::new()),
        }
    }

    pub fn check_rate_limit(&self, key: &str) -> Result<(), String> {
        let now = Instant::now();
        let mut records = self.records.lock();

        let record = records
            .entry(key.to_string())
            .or_insert_with(|| RequestRecord {
                timestamps: Vec::new(),
            });

        // Remove timestamps outside the window
        record
            .timestamps
            .retain(|&timestamp| now.duration_since(timestamp) < self.config.window);

        // Check if limit exceeded
        if record.timestamps.len() >= self.config.max_requests {
            return Err(format!(
                "Rate limit exceeded: {} requests in {:?}",
                self.config.max_requests, self.config.window
            ));
        }

        // Record this request
        record.timestamps.push(now);

        Ok(())
    }

    pub fn reset(&self, key: &str) {
        let mut records = self.records.lock();
        records.remove(key);
    }

    pub fn reset_all(&self) {
        let mut records = self.records.lock();
        records.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rate_limiting() {
        let config = RateLimitConfig {
            max_requests: 3,
            window: Duration::from_secs(1),
        };
        let limiter = RateLimiter::new(config);

        // First 3 requests should succeed
        assert!(limiter.check_rate_limit("test").is_ok());
        assert!(limiter.check_rate_limit("test").is_ok());
        assert!(limiter.check_rate_limit("test").is_ok());

        // 4th request should fail
        assert!(limiter.check_rate_limit("test").is_err());

        // Wait for window to expire
        std::thread::sleep(Duration::from_secs(1));

        // Should work again
        assert!(limiter.check_rate_limit("test").is_ok());
    }

    #[test]
    fn test_reset() {
        let config = RateLimitConfig {
            max_requests: 2,
            window: Duration::from_secs(10),
        };
        let limiter = RateLimiter::new(config);

        limiter.check_rate_limit("test").unwrap();
        limiter.check_rate_limit("test").unwrap();
        assert!(limiter.check_rate_limit("test").is_err());

        // Reset and try again
        limiter.reset("test");
        assert!(limiter.check_rate_limit("test").is_ok());
    }
}
