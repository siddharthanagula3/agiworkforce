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

    pub fn compute_cache_key(provider: Provider, model: &str, messages: &[ChatMessage]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(provider.as_string().as_bytes());
        hasher.update(b"::");
        hasher.update(model.as_bytes());
        hasher.update(b"::");
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
            "SELECT id, cache_key, provider, model, prompt_hash, response, tokens, cost, created_at, last_used_at, expires_at
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
                cache_key, provider, model, prompt_hash, response, tokens, cost, created_at, last_used_at, expires_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?8
            )
            ON CONFLICT(cache_key) DO UPDATE SET
                provider = excluded.provider,
                model = excluded.model,
                prompt_hash = excluded.prompt_hash,
                response = excluded.response,
                tokens = excluded.tokens,
                cost = excluded.cost,
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
