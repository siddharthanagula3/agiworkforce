use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use crate::router::{ChatMessage, LLMResponse, Provider};

/// LLM Response Cache - manages caching of LLM API responses
pub struct LLMResponseCache {
    conn: Arc<Mutex<Connection>>,
    ttl: Duration,
    max_entries: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedLLMResponse {
    pub response: LLMResponse,
    pub cache_key: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl LLMResponseCache {
    pub fn new(conn: Arc<Mutex<Connection>>, ttl: Duration, max_entries: usize) -> Result<Self> {
        Ok(Self {
            conn,
            ttl,
            max_entries,
        })
    }

    /// Compute cache key from provider, model, and messages
    pub fn compute_cache_key(
        provider: Provider,
        model: &str,
        messages: &[ChatMessage],
    ) -> String {
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

    /// Get cached response if available and not expired
    pub fn get(
        &self,
        provider: Provider,
        model: &str,
        messages: &[ChatMessage],
    ) -> Result<Option<LLMResponse>> {
        let cache_key = Self::compute_cache_key(provider, model, messages);
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT response, tokens, cost, model, created_at, expires_at
             FROM cache_entries
             WHERE cache_key = ?1",
        )?;

        let mut rows = stmt.query([&cache_key])?;
        if let Some(row) = rows.next()? {
            let expires_at: String = row.get(5)?;
            let expires_at = chrono::DateTime::parse_from_rfc3339(&expires_at)
                .map(|dt| dt.with_timezone(&chrono::Utc))
                .unwrap_or_else(|_| chrono::Utc::now());

            if expires_at < chrono::Utc::now() {
                // Entry expired, remove it - collect data first
                let cache_key_owned = cache_key.clone();
                drop(rows);
                drop(stmt);
                conn.execute("DELETE FROM cache_entries WHERE cache_key = ?1", [&cache_key_owned])?;
                return Ok(None);
            }

            // Collect data before dropping rows/stmt
            let content: String = row.get(0)?;
            let tokens: Option<i32> = row.get(1)?;
            let cost: Option<f64> = row.get(2)?;
            let model: String = row.get(3)?;
            let created_at: String = row.get(4)?;

            // Now we can safely drop and update
            let cache_key_owned = cache_key.clone();
            drop(rows);
            drop(stmt);
            conn.execute(
                "UPDATE cache_entries SET last_used_at = CURRENT_TIMESTAMP WHERE cache_key = ?1",
                [&cache_key_owned],
            )?;

            let response = LLMResponse {
                content,
                tokens: tokens.map(|t| t as u32),
                prompt_tokens: None,
                completion_tokens: None,
                cost,
                model,
                cached: true,
                tool_calls: None,
                finish_reason: None,
            };

            Ok(Some(response))
        } else {
            Ok(None)
        }
    }

    /// Store LLM response in cache
    pub fn set(
        &self,
        provider: Provider,
        model: &str,
        messages: &[ChatMessage],
        response: &LLMResponse,
    ) -> Result<()> {
        let cache_key = Self::compute_cache_key(provider, model, messages);
        let prompt_hash = Self::compute_prompt_hash(messages);
        let expires_at = chrono::Utc::now() + chrono::Duration::from_std(self.ttl)?;

        let conn = self.conn.lock().unwrap();

        conn.execute(
            "INSERT INTO cache_entries (
                cache_key, provider, model, prompt_hash, response, tokens, cost,
                created_at, last_used_at, expires_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?8
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
            rusqlite::params![
                cache_key,
                provider.as_string(),
                model,
                prompt_hash,
                &response.content,
                response.tokens.map(|t| t as i32),
                response.cost,
                expires_at.format("%Y-%m-%d %H:%M:%S").to_string(),
            ],
        )?;

        self.prune_expired(&conn)?;
        self.enforce_capacity(&conn)?;

        Ok(())
    }

    fn compute_prompt_hash(messages: &[ChatMessage]) -> String {
        let mut hasher = Sha256::new();
        for message in messages {
            hasher.update(message.role.as_bytes());
            hasher.update(b"::");
            hasher.update(message.content.as_bytes());
            hasher.update(b"\n");
        }
        format!("{:x}", hasher.finalize())
    }

    fn prune_expired(&self, conn: &Connection) -> Result<usize> {
        Ok(conn.execute(
            "DELETE FROM cache_entries WHERE expires_at <= CURRENT_TIMESTAMP",
            [],
        )?)
    }

    fn enforce_capacity(&self, conn: &Connection) -> Result<()> {
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
            [surplus],
        )?;

        Ok(())
    }

    /// Clear all cache entries
    pub fn clear(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM cache_entries", [])?;
        Ok(())
    }

    /// Get cache statistics
    pub fn stats(&self) -> Result<CacheStats> {
        let conn = self.conn.lock().unwrap();
        let total_entries: i64 =
            conn.query_row("SELECT COUNT(*) FROM cache_entries", [], |row| row.get(0))?;

        let expired_entries: i64 = conn.query_row(
            "SELECT COUNT(*) FROM cache_entries WHERE expires_at <= CURRENT_TIMESTAMP",
            [],
            |row| row.get(0),
        )?;

        Ok(CacheStats {
            total_entries: total_entries as usize,
            expired_entries: expired_entries as usize,
            max_entries: self.max_entries,
            ttl_seconds: self.ttl.as_secs(),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_entries: usize,
    pub expired_entries: usize,
    pub max_entries: usize,
    pub ttl_seconds: u64,
}
