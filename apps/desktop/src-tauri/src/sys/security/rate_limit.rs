use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::VecDeque;
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

// AUDIT-003-007 fix: Use VecDeque with bounded capacity as a ring buffer
// to prevent unbounded memory growth within each rate limit window.
struct RequestRecord {
    // Ring buffer with fixed capacity equal to max_requests + 1
    // This bounds memory usage while maintaining accurate rate limiting
    timestamps: VecDeque<Instant>,
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

    // AUDIT-003-007 fix: Bounded ring buffer implementation to prevent memory exhaustion
    pub fn check_rate_limit(&self, key: &str) -> Result<(), String> {
        let now = Instant::now();
        let mut records = self.records.lock();

        let record = records
            .entry(key.to_string())
            .or_insert_with(|| RequestRecord {
                // Pre-allocate with bounded capacity
                timestamps: VecDeque::with_capacity(self.config.max_requests + 1),
            });

        // Remove expired timestamps from front of deque (oldest first)
        while let Some(&oldest) = record.timestamps.front() {
            if now.duration_since(oldest) >= self.config.window {
                record.timestamps.pop_front();
            } else {
                break;
            }
        }

        if record.timestamps.len() >= self.config.max_requests {
            return Err(format!(
                "Rate limit exceeded: {} requests in {:?}",
                self.config.max_requests, self.config.window
            ));
        }

        // Add new timestamp; VecDeque handles capacity efficiently
        record.timestamps.push_back(now);

        // Safety cap: if somehow capacity is exceeded, remove oldest
        // This ensures bounded memory even under edge cases
        while record.timestamps.len() > self.config.max_requests + 1 {
            record.timestamps.pop_front();
        }

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

        assert!(limiter.check_rate_limit("test").is_ok());
        assert!(limiter.check_rate_limit("test").is_ok());
        assert!(limiter.check_rate_limit("test").is_ok());

        assert!(limiter.check_rate_limit("test").is_err());

        std::thread::sleep(Duration::from_secs(1));

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

        limiter.reset("test");
        assert!(limiter.check_rate_limit("test").is_ok());
    }
}
