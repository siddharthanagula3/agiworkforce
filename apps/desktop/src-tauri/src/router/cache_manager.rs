use std::time::Duration;

use chrono::{DateTime, Duration as ChronoDuration, NaiveDateTime, Utc};
use rusqlite::{params, Connection, Result as SqlResult};
use sha2::{Digest, Sha256};

use crate::db::models::CacheEntry;
use crate::router::{ChatMessage, Provider};

/// Manages caching of LLM responses in SQLite.
pub struct CacheManager {
    ttl: Duration,
    max_entries: usize,
}

pub struct CacheRecord<'a> {
    pub cache_key: &'a str,
    pub provider: Provider,
    pub model: &'a str,
    pub prompt_hash: &'a str,
    pub response: &'a str,
    pub tokens: Option<u32>,
    pub cost: Option<f64>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub expires_at: DateTime<Utc>,
}

impl CacheManager {
    pub fn new(ttl: Duration, max_entries: usize) -> Self {
        Self { ttl, max_entries }
    }

    pub fn ttl(&self) -> Duration {
        self.ttl
    }

    pub fn default_expiry(&self) -> DateTime<Utc> {
        let duration =
            ChronoDuration::from_std(self.ttl).unwrap_or_else(|_| ChronoDuration::hours(24));
        Utc::now() + duration
    }

    /// Calculate expiry based on temperature (deterministic requests get longer TTL)
    /// - temperature == 0.0: 7 days (deterministic)
    /// - temperature > 0.0: 1 hour (creative/non-deterministic)
    pub fn temperature_aware_expiry(&self, temperature: Option<f32>) -> DateTime<Utc> {
        let duration = match temperature {
            Some(temp) if temp == 0.0 => ChronoDuration::days(7),
            Some(_) => ChronoDuration::hours(1),
            None => ChronoDuration::hours(1), // Default to 1 hour if not specified
        };
        Utc::now() + duration
    }

    pub fn compute_hash(messages: &[ChatMessage]) -> String {
        let mut hasher = Sha256::new();
        for message in messages {
            hasher.update(message.role.as_bytes());
            hasher.update(b"::");
            hasher.update(message.content.as_bytes());
            hasher.update(b"\n");
        }
        format!("{:x}", hasher.finalize())
    }

    pub fn compute_cache_key(
        provider: Provider,
        model: &str,
        messages: &[ChatMessage],
        temperature: Option<f32>,
        max_tokens: Option<u32>,
    ) -> String {
        let mut hasher = Sha256::new();
        hasher.update(provider.as_string().as_bytes());
        hasher.update(b"::");
        hasher.update(model.as_bytes());
        hasher.update(b"::");

        // Include temperature in hash for better cache differentiation
        if let Some(temp) = temperature {
            hasher.update(format!("temp:{}", temp).as_bytes());
            hasher.update(b"::");
        }

        // Include max_tokens in hash
        if let Some(max_tok) = max_tokens {
            hasher.update(format!("max_tokens:{}", max_tok).as_bytes());
            hasher.update(b"::");
        }

        for message in messages {
            hasher.update(message.role.as_bytes());
            hasher.update(b":");
            hasher.update(message.content.as_bytes());
            hasher.update(b"\n");
        }
        format!("{:x}", hasher.finalize())
    }

    pub fn fetch(&self, conn: &Connection, cache_key: &str) -> SqlResult<Option<CacheEntry>> {
        let mut stmt = conn.prepare(
            "SELECT id, cache_key, provider, model, prompt_hash, response, tokens, cost,
                    created_at, last_used_at, expires_at, hit_count, tokens_saved, cost_saved,
                    temperature, max_tokens
             FROM cache_entries
             WHERE cache_key = ?1",
        )?;

        let mut rows = stmt.query(params![cache_key])?;
        if let Some(row) = rows.next()? {
            let expires_at = parse_datetime(&row.get::<_, String>(10)?);
            if expires_at < Utc::now() {
                // Entry expired, remove it
                conn.execute(
                    "DELETE FROM cache_entries WHERE cache_key = ?1",
                    params![cache_key],
                )?;
                return Ok(None);
            }

            let entry = CacheEntry {
                id: row.get(0)?,
                cache_key: row.get(1)?,
                provider: row.get::<_, String>(2)?,
                model: row.get(3)?,
                prompt_hash: row.get(4)?,
                response: row.get(5)?,
                tokens: row.get::<_, Option<i32>>(6)?,
                cost: row.get(7)?,
                created_at: parse_datetime(&row.get::<_, String>(8)?),
                last_used_at: parse_datetime(&row.get::<_, String>(9)?),
                expires_at,
                hit_count: row.get::<_, Option<i32>>(11)?.unwrap_or(0),
                tokens_saved: row.get::<_, Option<i32>>(12)?.unwrap_or(0),
                cost_saved: row.get::<_, Option<f64>>(13)?.unwrap_or(0.0),
                temperature: row.get::<_, Option<f64>>(14)?.map(|v| v as f32),
                max_tokens: row.get::<_, Option<i32>>(15)?,
            };

            // Update last_used_at timestamp (cache hit tracking happens in update_cache_hit)
            conn.execute(
                "UPDATE cache_entries
                 SET last_used_at = CURRENT_TIMESTAMP
                 WHERE cache_key = ?1",
                params![cache_key],
            )?;

            Ok(Some(entry))
        } else {
            Ok(None)
        }
    }

    pub fn upsert(&self, conn: &Connection, record: CacheRecord<'_>) -> SqlResult<()> {
        conn.execute(
            "INSERT INTO cache_entries (
                cache_key, provider, model, prompt_hash, response, tokens, cost,
                temperature, max_tokens, created_at, last_used_at, expires_at,
                hit_count, tokens_saved, cost_saved
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?10, 0, 0, 0.0
            )
            ON CONFLICT(cache_key) DO UPDATE SET
                provider = excluded.provider,
                model = excluded.model,
                prompt_hash = excluded.prompt_hash,
                response = excluded.response,
                tokens = excluded.tokens,
                cost = excluded.cost,
                temperature = excluded.temperature,
                max_tokens = excluded.max_tokens,
                last_used_at = CURRENT_TIMESTAMP,
                expires_at = excluded.expires_at",
            params![
                record.cache_key,
                record.provider.as_string(),
                record.model,
                record.prompt_hash,
                record.response,
                record.tokens.map(|t| t as i32),
                record.cost,
                record.temperature.map(|t| t as f64),
                record.max_tokens.map(|t| t as i32),
                to_sqlite_timestamp(record.expires_at),
            ],
        )?;

        self.prune_expired(conn)?;
        self.enforce_capacity(conn)?;

        Ok(())
    }

    pub fn prune_expired(&self, conn: &Connection) -> SqlResult<usize> {
        conn.execute(
            "DELETE FROM cache_entries WHERE expires_at <= CURRENT_TIMESTAMP",
            [],
        )
    }

    fn enforce_capacity(&self, conn: &Connection) -> SqlResult<()> {
        if self.max_entries == 0 {
            return Ok(());
        }

        let current_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM cache_entries", [], |row| row.get(0))?;

        if current_count <= self.max_entries as i64 {
            return Ok(());
        }

        let surplus = current_count - self.max_entries as i64;
        conn.execute(
            "DELETE FROM cache_entries
             WHERE id IN (
                SELECT id FROM cache_entries
                ORDER BY last_used_at ASC
                LIMIT ?1
             )",
            params![surplus],
        )?;

        Ok(())
    }

    /// Update cache hit statistics (called when a cache entry is used)
    /// Increments hit_count and accumulates tokens_saved and cost_saved
    pub fn update_cache_hit(
        &self,
        conn: &Connection,
        cache_key: &str,
        tokens_saved: u32,
        cost_saved: f64,
    ) -> SqlResult<()> {
        conn.execute(
            "UPDATE cache_entries
             SET hit_count = hit_count + 1,
                 tokens_saved = tokens_saved + ?2,
                 cost_saved = cost_saved + ?3,
                 last_used_at = CURRENT_TIMESTAMP
             WHERE cache_key = ?1",
            params![cache_key, tokens_saved as i32, cost_saved],
        )?;
        Ok(())
    }

    /// Get overall cache statistics
    pub fn get_overall_stats(&self, conn: &Connection) -> SqlResult<OverallCacheStats> {
        let mut stmt = conn.prepare(
            "SELECT
                COUNT(*) as total_entries,
                SUM(hit_count) as total_hits,
                SUM(tokens_saved) as total_tokens_saved,
                SUM(cost_saved) as total_cost_saved,
                AVG(CASE WHEN hit_count > 0 THEN hit_count ELSE NULL END) as avg_hits_per_entry
             FROM cache_entries",
        )?;

        let stats = stmt.query_row([], |row| {
            Ok(OverallCacheStats {
                total_entries: row.get::<_, i64>(0)?,
                total_hits: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                total_tokens_saved: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                total_cost_saved: row.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
                avg_hits_per_entry: row.get::<_, Option<f64>>(4)?.unwrap_or(0.0),
            })
        })?;

        Ok(stats)
    }

    /// Get cache statistics grouped by provider and model
    pub fn get_provider_stats(&self, conn: &Connection) -> SqlResult<Vec<ProviderCacheStats>> {
        let mut stmt = conn.prepare(
            "SELECT
                provider,
                model,
                COUNT(*) as entry_count,
                SUM(hit_count) as total_hits,
                SUM(tokens_saved) as total_tokens_saved,
                SUM(cost_saved) as total_cost_saved
             FROM cache_entries
             GROUP BY provider, model
             ORDER BY total_cost_saved DESC",
        )?;

        let stats = stmt
            .query_map([], |row| {
                Ok(ProviderCacheStats {
                    provider: row.get(0)?,
                    model: row.get(1)?,
                    entry_count: row.get(2)?,
                    total_hits: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                    total_tokens_saved: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
                    total_cost_saved: row.get::<_, Option<f64>>(5)?.unwrap_or(0.0),
                })
            })?
            .collect::<SqlResult<Vec<_>>>()?;

        Ok(stats)
    }

    /// Clear all cache entries
    pub fn clear_all(&self, conn: &Connection) -> SqlResult<usize> {
        conn.execute("DELETE FROM cache_entries", [])
    }

    /// Clear cache entries for a specific provider
    pub fn clear_provider(&self, conn: &Connection, provider: Provider) -> SqlResult<usize> {
        conn.execute(
            "DELETE FROM cache_entries WHERE provider = ?1",
            params![provider.as_string()],
        )
    }

    /// Clear cache entries for a specific model
    pub fn clear_model(&self, conn: &Connection, model: &str) -> SqlResult<usize> {
        conn.execute("DELETE FROM cache_entries WHERE model = ?1", params![model])
    }
}

#[derive(Debug, Clone)]
pub struct OverallCacheStats {
    pub total_entries: i64,
    pub total_hits: i64,
    pub total_tokens_saved: i64,
    pub total_cost_saved: f64,
    pub avg_hits_per_entry: f64,
}

#[derive(Debug, Clone)]
pub struct ProviderCacheStats {
    pub provider: String,
    pub model: String,
    pub entry_count: i64,
    pub total_hits: i64,
    pub total_tokens_saved: i64,
    pub total_cost_saved: f64,
}

fn parse_datetime(value: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| {
            NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
                .map(|dt| dt.and_utc())
                .unwrap_or_else(|_| Utc::now())
        })
}

fn to_sqlite_timestamp(dt: DateTime<Utc>) -> String {
    dt.format("%Y-%m-%d %H:%M:%S").to_string()
}
