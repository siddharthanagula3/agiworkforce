//! Lightweight async wrapper around rusqlite::Connection.
//!
//! Drop-in replacement for `tokio-rusqlite` that avoids a second `libsqlite3-sys`
//! version in the workspace dependency graph. All blocking SQLite work runs on a
//! dedicated Tokio thread via `spawn_blocking`.

use rusqlite::Connection as RawConnection;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Async-friendly handle around a rusqlite `Connection`.
///
/// All operations run on a blocking Tokio thread. The inner connection is
/// protected by a `tokio::sync::Mutex` so it is `Send + Sync`.
#[derive(Clone)]
pub struct AsyncConnection {
    inner: Arc<Mutex<RawConnection>>,
}

impl AsyncConnection {
    /// Open (or create) a database at `path`.
    pub async fn open(path: &str) -> Result<Self, rusqlite::Error> {
        let path = path.to_string();
        let conn = tokio::task::spawn_blocking(move || RawConnection::open(&path))
            .await
            .expect("spawn_blocking join")?;
        Ok(Self {
            inner: Arc::new(Mutex::new(conn)),
        })
    }

    /// Run a closure that has exclusive access to the underlying `rusqlite::Connection`.
    ///
    /// Signature matches `tokio_rusqlite::Connection::call` so migration is a
    /// find-and-replace of the import.
    pub async fn call<F, R>(&self, func: F) -> Result<R, rusqlite::Error>
    where
        F: FnOnce(&RawConnection) -> Result<R, rusqlite::Error> + Send + 'static,
        R: Send + 'static,
    {
        let conn = Arc::clone(&self.inner);
        tokio::task::spawn_blocking(move || {
            let guard = conn.blocking_lock();
            func(&guard)
        })
        .await
        .expect("spawn_blocking join")
    }
}
