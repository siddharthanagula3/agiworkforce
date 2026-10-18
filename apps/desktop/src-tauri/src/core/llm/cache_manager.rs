use std::time::Duration;

use chrono::{DateTime, Duration as ChronoDuration, NaiveDateTime, Utc};
use rusqlite::{params, Connection, Result as SqlResult};
use sha2::{Digest, Sha256};

use crate::core::llm::{ChatMessage, Provider};
use crate::data::db::models::CacheEntry;

#[derive(Clone)]
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

    pub fn temperature_aware_expiry(&self, temperature: Option<f32>) -> DateTime<Utc> {
        let duration = match temperature {
            Some(0.0) => ChronoDuration::days(7),
            Some(_) => ChronoDuration::hours(1),
            None => ChronoDuration::hours(1),
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

        if let Some(temp) = temperature {
            hasher.update(format!("temp:{}", temp).as_bytes());
            hasher.update(b"::");
        }

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

    pub fn clear_all(&self, conn: &Connection) -> SqlResult<usize> {
        conn.execute("DELETE FROM cache_entries", [])
    }
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
