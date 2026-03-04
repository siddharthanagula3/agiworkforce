//! SQLite Connection Pool using r2d2-style pooling
//!
//! This module provides a proper connection pool for SQLite that:
//! - Creates connections at startup
//! - Reuses connections across commands
//! - Properly handles concurrent access with WAL mode
//! - Includes health checks and connection validation
//! - DAT-003 fix: Uses condition variable instead of sleep polling

use parking_lot::{Condvar, Mutex};
use rusqlite::{Connection, OpenFlags};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::sys::error::{Error, Result};

/// Configuration for the SQLite connection pool
#[derive(Debug, Clone)]
pub struct SqlitePoolConfig {
    /// Maximum number of connections in the pool
    pub max_connections: usize,
    /// Minimum number of connections to maintain
    pub min_connections: usize,
    /// How long to wait for a connection before timing out
    pub connection_timeout: Duration,
    /// How long a connection can be idle before being closed
    pub idle_timeout: Duration,
    /// Maximum lifetime of a connection
    pub max_lifetime: Duration,
    /// Whether to run PRAGMA optimizations on new connections
    pub optimize_pragmas: bool,
    /// Busy timeout for SQLite (ms)
    pub busy_timeout_ms: u32,
}

impl Default for SqlitePoolConfig {
    fn default() -> Self {
        Self {
            max_connections: 10,
            min_connections: 2,
            connection_timeout: Duration::from_secs(30),
            idle_timeout: Duration::from_secs(600), // 10 minutes
            max_lifetime: Duration::from_secs(3600), // 1 hour
            optimize_pragmas: true,
            busy_timeout_ms: 5000,
        }
    }
}

/// A pooled connection wrapper
struct PooledConnection {
    conn: Connection,
    created_at: Instant,
    last_used: Instant,
}

impl PooledConnection {
    fn new(conn: Connection) -> Self {
        let now = Instant::now();
        Self {
            conn,
            created_at: now,
            last_used: now,
        }
    }

    fn is_expired(&self, config: &SqlitePoolConfig) -> bool {
        let now = Instant::now();

        // Check idle timeout
        if now.duration_since(self.last_used) > config.idle_timeout {
            return true;
        }

        // Check max lifetime
        if now.duration_since(self.created_at) > config.max_lifetime {
            return true;
        }

        false
    }

    fn is_valid(&self) -> bool {
        // Simple health check - try to execute a simple query
        self.conn.execute_batch("SELECT 1").is_ok()
    }

    fn touch(&mut self) {
        self.last_used = Instant::now();
    }
}

/// Statistics for the connection pool
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct PoolStats {
    pub total_connections: usize,
    pub idle_connections: usize,
    pub active_connections: usize,
    pub total_acquired: u64,
    pub total_released: u64,
    pub total_created: u64,
    pub total_closed: u64,
    pub connection_errors: u64,
    pub timeout_errors: u64,
}

/// A connection guard that returns the connection to the pool on drop
pub struct ConnectionGuard {
    conn: Option<PooledConnection>,
    pool: Arc<SqlitePoolInner>,
}

impl ConnectionGuard {
    /// Try to get a reference to the underlying connection.
    ///
    /// Returns `None` if the connection has already been returned to the pool.
    /// Prefer this method over [`get`] to avoid panics in production code.
    pub fn try_get(&self) -> Option<&Connection> {
        self.conn.as_ref().map(|c| &c.conn)
    }

    /// Try to get a mutable reference to the underlying connection.
    ///
    /// Returns `None` if the connection has already been returned to the pool.
    /// Prefer this method over [`get_mut`] to avoid panics in production code.
    pub fn try_get_mut(&mut self) -> Option<&mut Connection> {
        self.conn.as_mut().map(|c| &mut c.conn)
    }

    /// Get a reference to the underlying connection.
    ///
    /// # Panics
    ///
    /// Panics if the connection was already returned to the pool. In debug
    /// builds the assertion fires eagerly; in release builds the code path
    /// should never be reached because `ConnectionGuard` is consumed on drop.
    /// Prefer [`try_get`] in any code that may encounter a returned connection.
    pub fn get(&self) -> &Connection {
        debug_assert!(
            self.conn.is_some(),
            "ConnectionGuard::get() called after connection was returned to pool"
        );
        match self.conn.as_ref() {
            Some(c) => &c.conn,
            None => {
                tracing::error!(
                    "ConnectionGuard::get() called after connection was returned to pool; \
                     this is a bug — use try_get() for fallible access"
                );
                // SAFETY: unreachable in correct usage; debug_assert fires first in debug builds.
                panic!("Connection already returned to pool");
            }
        }
    }

    /// Get a mutable reference to the underlying connection.
    ///
    /// # Panics
    ///
    /// Panics if the connection was already returned to the pool. In debug
    /// builds the assertion fires eagerly; in release builds the code path
    /// should never be reached because `ConnectionGuard` is consumed on drop.
    /// Prefer [`try_get_mut`] in any code that may encounter a returned connection.
    pub fn get_mut(&mut self) -> &mut Connection {
        debug_assert!(
            self.conn.is_some(),
            "ConnectionGuard::get_mut() called after connection was returned to pool"
        );
        match self.conn.as_mut() {
            Some(c) => &mut c.conn,
            None => {
                tracing::error!(
                    "ConnectionGuard::get_mut() called after connection was returned to pool; \
                     this is a bug — use try_get_mut() for fallible access"
                );
                // SAFETY: unreachable in correct usage; debug_assert fires first in debug builds.
                panic!("Connection already returned to pool");
            }
        }
    }
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        if let Some(mut conn) = self.conn.take() {
            conn.touch();
            self.pool.return_connection(conn);
        }
    }
}

impl std::ops::Deref for ConnectionGuard {
    type Target = Connection;

    fn deref(&self) -> &Self::Target {
        self.get()
    }
}

impl std::ops::DerefMut for ConnectionGuard {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.get_mut()
    }
}

/// Inner pool state
struct SqlitePoolInner {
    db_path: PathBuf,
    config: SqlitePoolConfig,
    // Using Mutex instead of RwLock because rusqlite::Connection is not Sync
    idle_connections: Mutex<VecDeque<PooledConnection>>,
    stats: Mutex<PoolStats>,
    active_count: Mutex<usize>,
    /// DAT-003 fix: Condition variable to signal when connections are available
    /// This avoids CPU spinning with sleep-based polling
    connection_available: Condvar,
}

impl SqlitePoolInner {
    fn return_connection(&self, conn: PooledConnection) {
        let mut idle = self.idle_connections.lock();
        let mut stats = self.stats.lock();
        let mut active = self.active_count.lock();

        *active = active.saturating_sub(1);
        stats.total_released += 1;

        // Only return if not expired and valid
        if !conn.is_expired(&self.config) && conn.is_valid() {
            idle.push_back(conn);
            stats.idle_connections = idle.len();
        } else {
            stats.total_closed += 1;
        }

        stats.active_connections = *active;

        // DAT-003 fix: Notify one waiting thread that a connection is available
        self.connection_available.notify_one();
    }
}

/// SQLite Connection Pool
///
/// This pool manages SQLite connections efficiently, allowing multiple
/// concurrent reads while ensuring thread safety.
#[derive(Clone)]
pub struct SqlitePool {
    inner: Arc<SqlitePoolInner>,
}

impl SqlitePool {
    /// Create a new connection pool for the given database path
    pub fn new<P: AsRef<Path>>(db_path: P, config: SqlitePoolConfig) -> Result<Self> {
        let db_path = db_path.as_ref().to_path_buf();

        tracing::info!(
            db_path = %db_path.display(),
            max_connections = config.max_connections,
            min_connections = config.min_connections,
            "Creating SQLite connection pool"
        );

        let inner = Arc::new(SqlitePoolInner {
            db_path,
            config: config.clone(),
            idle_connections: Mutex::new(VecDeque::with_capacity(config.max_connections)),
            stats: Mutex::new(PoolStats::default()),
            active_count: Mutex::new(0),
            connection_available: Condvar::new(),
        });

        let pool = Self { inner };

        // Pre-populate with minimum connections
        pool.ensure_min_connections()?;

        Ok(pool)
    }

    /// Create a pool for an in-memory database (useful for testing)
    pub fn in_memory(config: SqlitePoolConfig) -> Result<Self> {
        Self::new(":memory:", config)
    }

    /// Get the database path
    pub fn db_path(&self) -> &Path {
        &self.inner.db_path
    }

    /// Acquire a connection from the pool
    ///
    /// This will block until a connection is available or timeout occurs.
    pub fn acquire(&self) -> Result<ConnectionGuard> {
        let start = Instant::now();
        let timeout = self.inner.config.connection_timeout;

        loop {
            // Try to get an idle connection
            {
                let mut idle = self.inner.idle_connections.lock();
                let mut stats = self.inner.stats.lock();

                // Clean up expired connections while we have the lock
                while let Some(front) = idle.front() {
                    if front.is_expired(&self.inner.config) {
                        idle.pop_front();
                        stats.total_closed += 1;
                    } else {
                        break;
                    }
                }

                // Try to get a valid connection
                while let Some(mut conn) = idle.pop_front() {
                    if conn.is_valid() {
                        conn.touch();
                        stats.total_acquired += 1;
                        stats.idle_connections = idle.len();

                        let mut active = self.inner.active_count.lock();
                        *active += 1;
                        stats.active_connections = *active;

                        return Ok(ConnectionGuard {
                            conn: Some(conn),
                            pool: self.inner.clone(),
                        });
                    } else {
                        stats.total_closed += 1;
                        stats.connection_errors += 1;
                    }
                }
            }

            // No idle connection available, try to create a new one
            let total = {
                let idle = self.inner.idle_connections.lock();
                let active = self.inner.active_count.lock();
                idle.len() + *active
            };

            if total < self.inner.config.max_connections {
                match self.create_connection() {
                    Ok(conn) => {
                        let mut stats = self.inner.stats.lock();
                        stats.total_acquired += 1;

                        let mut active = self.inner.active_count.lock();
                        *active += 1;
                        stats.active_connections = *active;

                        return Ok(ConnectionGuard {
                            conn: Some(conn),
                            pool: self.inner.clone(),
                        });
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "Failed to create new connection");
                        let mut stats = self.inner.stats.lock();
                        stats.connection_errors += 1;
                    }
                }
            }

            // Check timeout
            if start.elapsed() >= timeout {
                let mut stats = self.inner.stats.lock();
                stats.timeout_errors += 1;
                return Err(Error::Database(format!(
                    "Connection pool timeout after {:?}",
                    timeout
                )));
            }

            // DAT-003 fix: Use condition variable instead of sleep polling
            // Wait for a connection to be returned (with remaining timeout)
            let remaining_timeout = timeout.saturating_sub(start.elapsed());
            if remaining_timeout.is_zero() {
                continue; // Will hit the timeout check above
            }

            // Wait on the condition variable with timeout
            // This is more efficient than sleep polling as it wakes immediately
            // when a connection becomes available
            let mut idle = self.inner.idle_connections.lock();
            let result = self
                .inner
                .connection_available
                .wait_for(&mut idle, remaining_timeout);

            // If we timed out, the next iteration will handle the timeout error
            // If we were notified, we'll try to acquire a connection in the next iteration
            drop(idle);
            let _ = result; // Ignore the WaitTimeoutResult, loop will re-check
        }
    }

    /// Try to acquire a connection without blocking
    pub fn try_acquire(&self) -> Option<ConnectionGuard> {
        let mut idle = self.inner.idle_connections.lock();
        let mut stats = self.inner.stats.lock();

        while let Some(mut conn) = idle.pop_front() {
            if !conn.is_expired(&self.inner.config) && conn.is_valid() {
                conn.touch();
                stats.total_acquired += 1;
                stats.idle_connections = idle.len();

                let mut active = self.inner.active_count.lock();
                *active += 1;
                stats.active_connections = *active;

                return Some(ConnectionGuard {
                    conn: Some(conn),
                    pool: self.inner.clone(),
                });
            } else {
                stats.total_closed += 1;
            }
        }

        None
    }

    /// Get pool statistics
    pub fn stats(&self) -> PoolStats {
        self.inner.stats.lock().clone()
    }

    /// Perform a health check on all connections
    pub fn health_check(&self) -> Result<()> {
        let mut idle = self.inner.idle_connections.lock();
        let mut stats = self.inner.stats.lock();

        // Remove invalid/expired connections
        let before = idle.len();
        idle.retain(|conn| !conn.is_expired(&self.inner.config) && conn.is_valid());
        let removed = before - idle.len();

        if removed > 0 {
            stats.total_closed += removed as u64;
            tracing::info!(
                removed = removed,
                remaining = idle.len(),
                "Health check removed stale connections"
            );
        }

        stats.idle_connections = idle.len();
        drop(idle);
        drop(stats);

        // Ensure minimum connections
        self.ensure_min_connections()?;

        Ok(())
    }

    /// Close all connections in the pool
    pub fn close_all(&self) {
        let mut idle = self.inner.idle_connections.lock();
        let mut stats = self.inner.stats.lock();

        let count = idle.len();
        idle.clear();

        stats.total_closed += count as u64;
        stats.idle_connections = 0;

        tracing::info!(closed = count, "Closed all pooled connections");
    }

    /// Create a new connection with proper configuration
    fn create_connection(&self) -> Result<PooledConnection> {
        let flags = OpenFlags::SQLITE_OPEN_READ_WRITE
            | OpenFlags::SQLITE_OPEN_CREATE
            | OpenFlags::SQLITE_OPEN_NO_MUTEX;

        let conn = Connection::open_with_flags(&self.inner.db_path, flags)
            .map_err(|e| Error::Database(format!("Failed to open database: {}", e)))?;

        // Apply performance pragmas
        if self.inner.config.optimize_pragmas {
            let pragmas = format!(
                "PRAGMA busy_timeout = {};
                 PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA cache_size = -64000;
                 PRAGMA temp_store = MEMORY;",
                self.inner.config.busy_timeout_ms
            );

            conn.execute_batch(&pragmas)
                .map_err(|e| Error::Database(format!("Failed to set pragmas: {}", e)))?;
        }

        let mut stats = self.inner.stats.lock();
        stats.total_created += 1;
        stats.total_connections = stats.total_created as usize - stats.total_closed as usize;

        tracing::debug!(
            db_path = %self.inner.db_path.display(),
            total_created = stats.total_created,
            "Created new SQLite connection"
        );

        Ok(PooledConnection::new(conn))
    }

    /// Ensure minimum number of connections exist
    fn ensure_min_connections(&self) -> Result<()> {
        let current = {
            let idle = self.inner.idle_connections.lock();
            let active = self.inner.active_count.lock();
            idle.len() + *active
        };

        let needed = self.inner.config.min_connections.saturating_sub(current);

        for _ in 0..needed {
            let conn = self.create_connection()?;
            let mut idle = self.inner.idle_connections.lock();
            idle.push_back(conn);

            let mut stats = self.inner.stats.lock();
            stats.idle_connections = idle.len();
        }

        if needed > 0 {
            tracing::debug!(
                created = needed,
                total = current + needed,
                "Pre-populated connection pool"
            );
        }

        Ok(())
    }
}

/// Managed state wrapper for Tauri
pub struct SqlitePoolState {
    pool: SqlitePool,
}

impl SqlitePoolState {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    /// Convenience method to acquire a connection
    pub fn acquire(&self) -> Result<ConnectionGuard> {
        self.pool.acquire()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_pool() -> (SqlitePool, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");

        let config = SqlitePoolConfig {
            max_connections: 5,
            min_connections: 2,
            ..Default::default()
        };

        let pool = SqlitePool::new(&db_path, config).unwrap();
        (pool, temp_dir)
    }

    #[test]
    fn test_pool_creation() {
        let (pool, _temp_dir) = create_test_pool();
        let stats = pool.stats();

        assert!(stats.total_created >= 2); // min_connections
        assert_eq!(stats.idle_connections, 2);
    }

    #[test]
    fn test_acquire_and_release() {
        let (pool, _temp_dir) = create_test_pool();

        // Acquire a connection
        let conn = pool.acquire().unwrap();
        let stats = pool.stats();
        assert_eq!(stats.active_connections, 1);

        // Execute a query
        conn.execute_batch("CREATE TABLE test (id INTEGER PRIMARY KEY)")
            .unwrap();

        // Drop releases back to pool
        drop(conn);

        let stats = pool.stats();
        assert_eq!(stats.active_connections, 0);
        assert!(stats.idle_connections >= 1);
    }

    #[test]
    fn test_multiple_connections() {
        let (pool, _temp_dir) = create_test_pool();

        // Acquire multiple connections
        let _conn1 = pool.acquire().unwrap();
        let _conn2 = pool.acquire().unwrap();
        let _conn3 = pool.acquire().unwrap();

        let stats = pool.stats();
        assert_eq!(stats.active_connections, 3);
    }

    #[test]
    fn test_connection_reuse() {
        let (pool, _temp_dir) = create_test_pool();

        // Acquire and release
        let conn = pool.acquire().unwrap();
        drop(conn);

        // Acquire again - should reuse
        let _conn = pool.acquire().unwrap();

        let stats = pool.stats();
        assert!(stats.total_acquired >= 2);
    }

    #[test]
    fn test_health_check() {
        let (pool, _temp_dir) = create_test_pool();

        // Health check should succeed
        assert!(pool.health_check().is_ok());
    }

    #[test]
    fn test_close_all() {
        let (pool, _temp_dir) = create_test_pool();

        pool.close_all();

        let stats = pool.stats();
        assert_eq!(stats.idle_connections, 0);
    }

    #[test]
    fn test_try_acquire() {
        let (pool, _temp_dir) = create_test_pool();

        // Should succeed since we have min_connections
        let conn = pool.try_acquire();
        assert!(conn.is_some());
    }

    #[test]
    fn test_in_memory() {
        let config = SqlitePoolConfig {
            max_connections: 1,
            min_connections: 1,
            ..Default::default()
        };

        let pool = SqlitePool::in_memory(config).unwrap();
        let conn = pool.acquire().unwrap();

        conn.execute_batch("CREATE TABLE test (id INTEGER)")
            .unwrap();
        conn.execute_batch("INSERT INTO test VALUES (1)").unwrap();
    }
}
