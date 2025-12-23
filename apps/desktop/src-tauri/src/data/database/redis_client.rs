use redis::{aio::ConnectionManager, AsyncCommands, Client};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::data::database::ConnectionConfig;
use crate::sys::error::{Error, Result};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RedisValue {
    String(String),
    Integer(i64),
    Float(f64),
    Boolean(bool),
    Null,
}

pub struct RedisClient {
    connections: Arc<RwLock<HashMap<String, RedisConnection>>>,
}

struct RedisConnection {
    manager: ConnectionManager,
    db: u8,
}

impl RedisClient {
    async fn prepare_manager(manager: &ConnectionManager, db: u8) -> Result<ConnectionManager> {
        let mut clone = manager.clone();
        if db != 0 {
            redis::cmd("SELECT")
                .arg(db)
                .query_async::<()>(&mut clone)
                .await
                .map_err(|e| Error::Other(format!("Redis SELECT error: {}", e)))?;
        }
        Ok(clone)
    }

    pub fn new() -> Self {
        Self {
            connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn connect(&self, connection_id: &str, config: ConnectionConfig) -> Result<()> {
        tracing::info!("Connecting to Redis: {}", connection_id);

        config.validate()?;

        let db = config
            .options
            .get("db")
            .and_then(|s| s.parse::<u8>().ok())
            .unwrap_or(0);

        let connection_string = config.build_connection_string()?;

        let client = Client::open(connection_string.as_str())
            .map_err(|e| Error::Other(format!("Failed to create Redis client: {}", e)))?;

        let manager = ConnectionManager::new(client)
            .await
            .map_err(|e| Error::Other(format!("Failed to connect to Redis: {}", e)))?;

        let mut test_conn = manager.clone();
        redis::cmd("PING")
            .query_async::<String>(&mut test_conn)
            .await
            .map_err(|e| Error::Other(format!("Redis PING failed: {}", e)))?;

        let connection = RedisConnection { manager, db };

        let mut connections = self.connections.write().await;
        connections.insert(connection_id.to_string(), connection);

        tracing::info!("Redis connection established: {}", connection_id);

        Ok(())
    }

    pub async fn get(&self, connection_id: &str, key: &str) -> Result<Option<String>> {
        tracing::debug!("Redis GET: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let result: Option<String> = manager
            .get(key)
            .await
            .map_err(|e| Error::Other(format!("Redis GET error: {}", e)))?;

        Ok(result)
    }

    pub async fn set(
        &self,
        connection_id: &str,
        key: &str,
        value: &str,
        expiration_seconds: Option<u64>,
    ) -> Result<()> {
        tracing::debug!("Redis SET: {} (expiration: {:?})", key, expiration_seconds);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        if let Some(seconds) = expiration_seconds {
            manager
                .set_ex::<_, _, ()>(key, value, seconds)
                .awai
                .map_err(|e| Error::Other(format!("Redis SET error: {}", e)))?;
        } else {
            manager
                .set::<_, _, ()>(key, value)
                .awai
                .map_err(|e| Error::Other(format!("Redis SET error: {}", e)))?;
        }

        Ok(())
    }

    pub async fn del(&self, connection_id: &str, keys: &[String]) -> Result<u64> {
        tracing::debug!("Redis DEL: {} keys", keys.len());

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let deleted: u64 = manager
            .del(keys)
            .awai
            .map_err(|e| Error::Other(format!("Redis DEL error: {}", e)))?;

        Ok(deleted)
    }

    pub async fn exists(&self, connection_id: &str, key: &str) -> Result<bool> {
        tracing::debug!("Redis EXISTS: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let exists: bool = manager
            .exists(key)
            .awai
            .map_err(|e| Error::Other(format!("Redis EXISTS error: {}", e)))?;

        Ok(exists)
    }

    pub async fn expire(&self, connection_id: &str, key: &str, seconds: u64) -> Result<bool> {
        tracing::debug!("Redis EXPIRE: {} ({}s)", key, seconds);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let set: bool = manager
            .expire(key, seconds as i64)
            .awai
            .map_err(|e| Error::Other(format!("Redis EXPIRE error: {}", e)))?;

        Ok(set)
    }

    pub async fn ttl(&self, connection_id: &str, key: &str) -> Result<i64> {
        tracing::debug!("Redis TTL: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let ttl: i64 = manager
            .ttl(key)
            .awai
            .map_err(|e| Error::Other(format!("Redis TTL error: {}", e)))?;

        Ok(ttl)
    }

    pub async fn incr(&self, connection_id: &str, key: &str) -> Result<i64> {
        tracing::debug!("Redis INCR: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let value: i64 = manager
            .incr(key, 1)
            .awai
            .map_err(|e| Error::Other(format!("Redis INCR error: {}", e)))?;

        Ok(value)
    }

    pub async fn decr(&self, connection_id: &str, key: &str) -> Result<i64> {
        tracing::debug!("Redis DECR: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let value: i64 = manager
            .decr(key, 1)
            .awai
            .map_err(|e| Error::Other(format!("Redis DECR error: {}", e)))?;

        Ok(value)
    }

    pub async fn mget(&self, connection_id: &str, keys: &[String]) -> Result<Vec<Option<String>>> {
        tracing::debug!("Redis MGET: {} keys", keys.len());

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let values: Vec<Option<String>> = manager
            .get(keys)
            .awai
            .map_err(|e| Error::Other(format!("Redis MGET error: {}", e)))?;

        Ok(values)
    }

    pub async fn mset(&self, connection_id: &str, pairs: &HashMap<String, String>) -> Result<()> {
        tracing::debug!("Redis MSET: {} pairs", pairs.len());

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let items: Vec<(&String, &String)> = pairs.iter().collect();

        manager
            .mset::<_, _, ()>(&items)
            .awai
            .map_err(|e| Error::Other(format!("Redis MSET error: {}", e)))?;

        Ok(())
    }

    pub async fn lpush(&self, connection_id: &str, key: &str, value: &str) -> Result<u64> {
        tracing::debug!("Redis LPUSH: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let length: u64 = manager
            .lpush(key, value)
            .awai
            .map_err(|e| Error::Other(format!("Redis LPUSH error: {}", e)))?;

        Ok(length)
    }

    pub async fn rpush(&self, connection_id: &str, key: &str, value: &str) -> Result<u64> {
        tracing::debug!("Redis RPUSH: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let length: u64 = manager
            .rpush(key, value)
            .awai
            .map_err(|e| Error::Other(format!("Redis RPUSH error: {}", e)))?;

        Ok(length)
    }

    pub async fn lpop(&self, connection_id: &str, key: &str) -> Result<Option<String>> {
        tracing::debug!("Redis LPOP: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let value: Option<String> = manager
            .lpop(key, None)
            .awai
            .map_err(|e| Error::Other(format!("Redis LPOP error: {}", e)))?;

        Ok(value)
    }

    pub async fn rpop(&self, connection_id: &str, key: &str) -> Result<Option<String>> {
        tracing::debug!("Redis RPOP: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let value: Option<String> = manager
            .rpop(key, None)
            .awai
            .map_err(|e| Error::Other(format!("Redis RPOP error: {}", e)))?;

        Ok(value)
    }

    pub async fn llen(&self, connection_id: &str, key: &str) -> Result<u64> {
        tracing::debug!("Redis LLEN: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let length: u64 = manager
            .llen(key)
            .awai
            .map_err(|e| Error::Other(format!("Redis LLEN error: {}", e)))?;

        Ok(length)
    }

    pub async fn lrange(
        &self,
        connection_id: &str,
        key: &str,
        start: i64,
        stop: i64,
    ) -> Result<Vec<String>> {
        tracing::debug!("Redis LRANGE: {} {}..{}", key, start, stop);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let values: Vec<String> = manager
            .lrange(key, start as isize, stop as isize)
            .awai
            .map_err(|e| Error::Other(format!("Redis LRANGE error: {}", e)))?;

        Ok(values)
    }

    pub async fn hset(
        &self,
        connection_id: &str,
        key: &str,
        field: &str,
        value: &str,
    ) -> Result<bool> {
        tracing::debug!("Redis HSET: {} {}", key, field);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let created: bool = manager
            .hset(key, field, value)
            .awai
            .map_err(|e| Error::Other(format!("Redis HSET error: {}", e)))?;

        Ok(created)
    }

    pub async fn hget(
        &self,
        connection_id: &str,
        key: &str,
        field: &str,
    ) -> Result<Option<String>> {
        tracing::debug!("Redis HGET: {} {}", key, field);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let value: Option<String> = manager
            .hget(key, field)
            .awai
            .map_err(|e| Error::Other(format!("Redis HGET error: {}", e)))?;

        Ok(value)
    }

    pub async fn hdel(&self, connection_id: &str, key: &str, field: &str) -> Result<bool> {
        tracing::debug!("Redis HDEL: {} {}", key, field);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let deleted: bool = manager
            .hdel(key, field)
            .awai
            .map_err(|e| Error::Other(format!("Redis HDEL error: {}", e)))?;

        Ok(deleted)
    }

    pub async fn hgetall(&self, connection_id: &str, key: &str) -> Result<HashMap<String, String>> {
        tracing::debug!("Redis HGETALL: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let hash: HashMap<String, String> = manager
            .hgetall(key)
            .awai
            .map_err(|e| Error::Other(format!("Redis HGETALL error: {}", e)))?;

        Ok(hash)
    }

    pub async fn hexists(&self, connection_id: &str, key: &str, field: &str) -> Result<bool> {
        tracing::debug!("Redis HEXISTS: {} {}", key, field);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let exists: bool = manager
            .hexists(key, field)
            .awai
            .map_err(|e| Error::Other(format!("Redis HEXISTS error: {}", e)))?;

        Ok(exists)
    }

    pub async fn sadd(&self, connection_id: &str, key: &str, member: &str) -> Result<bool> {
        tracing::debug!("Redis SADD: {} {}", key, member);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let added: bool = manager
            .sadd(key, member)
            .awai
            .map_err(|e| Error::Other(format!("Redis SADD error: {}", e)))?;

        Ok(added)
    }

    pub async fn srem(&self, connection_id: &str, key: &str, member: &str) -> Result<bool> {
        tracing::debug!("Redis SREM: {} {}", key, member);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let removed: bool = manager
            .srem(key, member)
            .awai
            .map_err(|e| Error::Other(format!("Redis SREM error: {}", e)))?;

        Ok(removed)
    }

    pub async fn sismember(&self, connection_id: &str, key: &str, member: &str) -> Result<bool> {
        tracing::debug!("Redis SISMEMBER: {} {}", key, member);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let is_member: bool = manager
            .sismember(key, member)
            .awai
            .map_err(|e| Error::Other(format!("Redis SISMEMBER error: {}", e)))?;

        Ok(is_member)
    }

    pub async fn smembers(&self, connection_id: &str, key: &str) -> Result<Vec<String>> {
        tracing::debug!("Redis SMEMBERS: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let members: Vec<String> = manager
            .smembers(key)
            .awai
            .map_err(|e| Error::Other(format!("Redis SMEMBERS error: {}", e)))?;

        Ok(members)
    }

    pub async fn scard(&self, connection_id: &str, key: &str) -> Result<u64> {
        tracing::debug!("Redis SCARD: {}", key);

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let count: u64 = manager
            .scard(key)
            .awai
            .map_err(|e| Error::Other(format!("Redis SCARD error: {}", e)))?;

        Ok(count)
    }

    pub async fn flushdb(&self, connection_id: &str) -> Result<()> {
        tracing::warn!("Redis FLUSHDB called - this will delete all keys!");

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        redis::cmd("FLUSHDB")
            .query_async::<()>(&mut manager)
            .awai
            .map_err(|e| Error::Other(format!("Redis FLUSHDB error: {}", e)))?;

        Ok(())
    }

    pub async fn dbsize(&self, connection_id: &str) -> Result<u64> {
        tracing::debug!("Redis DBSIZE");

        let connections = self.connections.read().await;
        let conn = connections
            .get(connection_id)
            .ok_or_else(|| Error::Other("Connection not found".to_string()))?;

        let mut manager = Self::prepare_manager(&conn.manager, conn.db).await?;

        let size: u64 = redis::cmd("DBSIZE")
            .query_async(&mut manager)
            .awai
            .map_err(|e| Error::Other(format!("Redis DBSIZE error: {}", e)))?;

        Ok(size)
    }

    pub async fn disconnect(&self, connection_id: &str) -> Result<()> {
        tracing::info!("Disconnecting Redis: {}", connection_id);

        let mut connections = self.connections.write().await;

        if connections.remove(connection_id).is_some() {
            Ok(())
        } else {
            Err(Error::Other("Connection not found".to_string()))
        }
    }

    pub async fn list_connections(&self) -> Vec<String> {
        let connections = self.connections.read().await;
        connections.keys().cloned().collect()
    }
}

impl Default for RedisClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_redis_client_creation() {
        let client = RedisClient::new();
        let connections = client.list_connections().await;
        assert_eq!(connections.len(), 0);
    }

    #[tokio::test]
    #[ignore]
    async fn test_disconnect() {
        let client = RedisClient::new();
        let config = ConnectionConfig::redis("localhost", 6379, None, Some(0));

        if client.connect("test_conn", config).await.is_ok() {
            client.disconnect("test_conn").await.unwrap();
            let connections = client.list_connections().await;
            assert_eq!(connections.len(), 0);
        }
    }

    #[tokio::test]
    #[ignore]
    async fn test_string_operations() {
        let client = RedisClient::new();
        let config = ConnectionConfig::redis("localhost", 6379, None, Some(15));

        if client.connect("test_conn", config).await.is_ok() {
            client
                .set("test_conn", "test_key", "test_value", None)
                .await
                .ok();
            let value = client.get("test_conn", "test_key").await.ok();
            assert_eq!(value, Some(Some("test_value".to_string())));

            let exists = client.exists("test_conn", "test_key").await.ok();
            assert_eq!(exists, Some(true));

            let deleted = client
                .del("test_conn", &vec!["test_key".to_string()])
                .await
                .ok();
            assert_eq!(deleted, Some(1));

            client.disconnect("test_conn").await.ok();
        }
    }

    #[tokio::test]
    #[ignore]
    async fn test_list_operations() {
        let client = RedisClient::new();
        let config = ConnectionConfig::redis("localhost", 6379, None, Some(15));

        if client.connect("test_conn", config).await.is_ok() {
            client.lpush("test_conn", "test_list", "item1").await.ok();
            client.lpush("test_conn", "test_list", "item2").await.ok();

            let items = client.lrange("test_conn", "test_list", 0, -1).await.ok();
            assert_eq!(items, Some(vec!["item2".to_string(), "item1".to_string()]));

            let length = client.llen("test_conn", "test_list").await.ok();
            assert_eq!(length, Some(2));

            client
                .del("test_conn", &vec!["test_list".to_string()])
                .await
                .ok();
            client.disconnect("test_conn").await.ok();
        }
    }

    #[tokio::test]
    #[ignore]
    async fn test_hash_operations() {
        let client = RedisClient::new();
        let config = ConnectionConfig::redis("localhost", 6379, None, Some(15));

        if client.connect("test_conn", config).await.is_ok() {
            client
                .hset("test_conn", "test_hash", "field1", "value1")
                .await
                .ok();
            client
                .hset("test_conn", "test_hash", "field2", "value2")
                .await
                .ok();

            let value = client.hget("test_conn", "test_hash", "field1").await.ok();
            assert_eq!(value, Some(Some("value1".to_string())));

            let hash = client.hgetall("test_conn", "test_hash").await.ok();
            if let Some(hash) = hash {
                assert_eq!(hash.len(), 2);
                assert_eq!(hash.get("field1"), Some(&"value1".to_string()));
            }

            client
                .del("test_conn", &vec!["test_hash".to_string()])
                .await
                .ok();
            client.disconnect("test_conn").await.ok();
        }
    }
}
