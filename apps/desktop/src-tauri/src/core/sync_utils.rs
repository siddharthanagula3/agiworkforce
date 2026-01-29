//! Synchronization utilities for safe concurrent access
//!
//! This module provides extension traits for safer handling of synchronization primitives,
//! avoiding panics on poisoned mutexes.

use crate::sys::error::Error;
use std::sync::{Mutex, MutexGuard, PoisonError, RwLock, RwLockReadGuard, RwLockWriteGuard};

/// Extension trait for safe mutex locking that returns Result instead of panicking
pub trait MutexExt<T> {
    /// Attempt to acquire the lock, returning an error if the mutex is poisoned
    fn safe_lock(&self) -> Result<MutexGuard<'_, T>, Error>;

    /// Attempt to acquire the lock without blocking, returning an error if unavailable or poisoned
    fn try_safe_lock(&self) -> Result<MutexGuard<'_, T>, Error>;
}

impl<T> MutexExt<T> for Mutex<T> {
    fn safe_lock(&self) -> Result<MutexGuard<'_, T>, Error> {
        self.lock().map_err(|e: PoisonError<MutexGuard<'_, T>>| {
            tracing::error!("Mutex poisoned: {}", e);
            Error::Other(format!("Mutex lock poisoned: {}", e))
        })
    }

    fn try_safe_lock(&self) -> Result<MutexGuard<'_, T>, Error> {
        match self.try_lock() {
            Ok(guard) => Ok(guard),
            Err(std::sync::TryLockError::Poisoned(e)) => {
                tracing::error!("Mutex poisoned: {}", e);
                Err(Error::Other(format!("Mutex lock poisoned: {}", e)))
            }
            Err(std::sync::TryLockError::WouldBlock) => {
                Err(Error::Other("Mutex would block".to_string()))
            }
        }
    }
}

/// Extension trait for safe RwLock access that returns Result instead of panicking
pub trait RwLockExt<T> {
    /// Attempt to acquire a read lock, returning an error if poisoned
    fn safe_read(&self) -> Result<RwLockReadGuard<'_, T>, Error>;

    /// Attempt to acquire a write lock, returning an error if poisoned
    fn safe_write(&self) -> Result<RwLockWriteGuard<'_, T>, Error>;
}

impl<T> RwLockExt<T> for RwLock<T> {
    fn safe_read(&self) -> Result<RwLockReadGuard<'_, T>, Error> {
        self.read().map_err(|e| {
            tracing::error!("RwLock read poisoned: {}", e);
            Error::Other(format!("RwLock read poisoned: {}", e))
        })
    }

    fn safe_write(&self) -> Result<RwLockWriteGuard<'_, T>, Error> {
        self.write().map_err(|e| {
            tracing::error!("RwLock write poisoned: {}", e);
            Error::Other(format!("RwLock write poisoned: {}", e))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    #[test]
    fn test_safe_lock_success() {
        let mutex = Mutex::new(42);
        let guard = mutex.safe_lock().expect("Lock should succeed");
        assert_eq!(*guard, 42);
    }

    #[test]
    fn test_try_safe_lock_success() {
        let mutex = Mutex::new(42);
        let guard = mutex.try_safe_lock().expect("Try lock should succeed");
        assert_eq!(*guard, 42);
    }

    #[test]
    fn test_safe_read_success() {
        let rwlock = RwLock::new(42);
        let guard = rwlock.safe_read().expect("Read lock should succeed");
        assert_eq!(*guard, 42);
    }

    #[test]
    fn test_safe_write_success() {
        let rwlock = RwLock::new(42);
        let mut guard = rwlock.safe_write().expect("Write lock should succeed");
        *guard = 100;
        assert_eq!(*guard, 100);
    }

    #[test]
    fn test_poisoned_mutex() {
        let mutex = Arc::new(Mutex::new(42));
        let mutex_clone = Arc::clone(&mutex);

        // Poison the mutex by panicking while holding the lock
        let handle = thread::spawn(move || {
            let _guard = mutex_clone.lock().unwrap();
            panic!("Intentional panic to poison mutex");
        });

        let _ = handle.join();

        // Now try to lock - should return an error, not panic
        let result = mutex.safe_lock();
        assert!(result.is_err());
    }
}
