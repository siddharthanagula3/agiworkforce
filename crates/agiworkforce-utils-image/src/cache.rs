use std::borrow::Borrow;
use std::hash::Hash;
use std::num::NonZeroUsize;

use lru::LruCache;
use sha1::Digest;
use sha1::Sha1;
use tokio::sync::Mutex;
use tokio::sync::MutexGuard;

/// A minimal LRU cache protected by a Tokio mutex.
/// Calls outside a Tokio runtime are no-ops.
pub struct BlockingLruCache<K, V> {
    inner: Mutex<LruCache<K, V>>,
}

impl<K, V> BlockingLruCache<K, V>
where
    K: Eq + Hash,
{
    /// Creates a cache with the provided non-zero capacity.
    #[must_use]
    pub fn new(capacity: NonZeroUsize) -> Self {
        Self {
            inner: Mutex::new(LruCache::new(capacity)),
        }
    }

    /// Returns a clone of the cached value for `key`, or computes and inserts it.
    pub fn get_or_insert_with(&self, key: K, value: impl FnOnce() -> V) -> V
    where
        V: Clone,
    {
        if let Some(mut guard) = lock_if_runtime(&self.inner) {
            if let Some(v) = guard.get(&key) {
                return v.clone();
            }
            let v = value();
            // Insert and return a clone to keep ownership in the cache.
            guard.put(key, v.clone());
            return v;
        }
        value()
    }

    /// Like `get_or_insert_with`, but the value factory may fail.
    pub fn get_or_try_insert_with<E>(
        &self,
        key: K,
        value: impl FnOnce() -> Result<V, E>,
    ) -> Result<V, E>
    where
        V: Clone,
    {
        if let Some(mut guard) = lock_if_runtime(&self.inner) {
            if let Some(v) = guard.get(&key) {
                return Ok(v.clone());
            }
            let v = value()?;
            guard.put(key, v.clone());
            return Ok(v);
        }
        value()
    }

    /// Builds a cache if `capacity` is non-zero, returning `None` otherwise.
    #[must_use]
    pub fn try_with_capacity(capacity: usize) -> Option<Self> {
        NonZeroUsize::new(capacity).map(Self::new)
    }

    /// Returns a clone of the cached value corresponding to `key`, if present.
    pub fn get<Q>(&self, key: &Q) -> Option<V>
    where
        K: Borrow<Q>,
        Q: Hash + Eq + ?Sized,
        V: Clone,
    {
        let mut guard = lock_if_runtime(&self.inner)?;
        guard.get(key).cloned()
    }

    /// Inserts `value` for `key`, returning the previous entry if it existed.
    pub fn insert(&self, key: K, value: V) -> Option<V> {
        let mut guard = lock_if_runtime(&self.inner)?;
        guard.put(key, value)
    }

    /// Removes the entry for `key` if it exists, returning it.
    pub fn remove<Q>(&self, key: &Q) -> Option<V>
    where
        K: Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        let mut guard = lock_if_runtime(&self.inner)?;
        guard.pop(key)
    }

    /// Clears all entries from the cache.
    pub fn clear(&self) {
        if let Some(mut guard) = lock_if_runtime(&self.inner) {
            guard.clear();
        }
    }

    /// Executes `callback` with a mutable reference to the underlying cache.
    pub fn with_mut<R>(&self, callback: impl FnOnce(&mut LruCache<K, V>) -> R) -> R {
        if let Some(mut guard) = lock_if_runtime(&self.inner) {
            callback(&mut guard)
        } else {
            let mut disabled = LruCache::unbounded();
            callback(&mut disabled)
        }
    }

    /// Provides direct access to the cache guard when a Tokio runtime is available.
    pub fn blocking_lock(&self) -> Option<MutexGuard<'_, LruCache<K, V>>> {
        lock_if_runtime(&self.inner)
    }
}

fn lock_if_runtime<K, V>(m: &Mutex<LruCache<K, V>>) -> Option<MutexGuard<'_, LruCache<K, V>>>
where
    K: Eq + Hash,
{
    // `block_in_place` panics on a current-thread runtime (it has no other
    // worker thread to hand work off to), and `blocking_lock` itself panics
    // when called from within an async context on any flavor. So branch on the
    // runtime flavor: on the multi-threaded runtime keep the faithful blocking
    // path; on a current-thread runtime (or any future flavor) take a
    // non-blocking `try_lock`. The guard is never held across an `.await` here,
    // so an uncontended single-thread lock always succeeds and semantics are
    // preserved without risking a panic.
    let handle = tokio::runtime::Handle::try_current().ok()?;
    match handle.runtime_flavor() {
        tokio::runtime::RuntimeFlavor::MultiThread => {
            Some(tokio::task::block_in_place(|| m.blocking_lock()))
        }
        _ => m.try_lock().ok(),
    }
}

/// Computes the SHA-1 digest of `bytes`.
///
/// Useful for content-based cache keys when you want to avoid staleness
/// caused by path-only keys.
#[must_use]
pub fn sha1_digest(bytes: &[u8]) -> [u8; 20] {
    let mut hasher = Sha1::new();
    hasher.update(bytes);
    let result = hasher.finalize();
    let mut out = [0; 20];
    out.copy_from_slice(&result);
    out
}

#[cfg(test)]
mod tests {
    use super::BlockingLruCache;
    use std::num::NonZeroUsize;

    #[tokio::test(flavor = "multi_thread")]
    async fn stores_and_retrieves_values() {
        let cache = BlockingLruCache::new(NonZeroUsize::new(2).expect("capacity"));

        assert!(cache.get(&"first").is_none());
        cache.insert("first", 1);
        assert_eq!(cache.get(&"first"), Some(1));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn evicts_least_recently_used() {
        let cache = BlockingLruCache::new(NonZeroUsize::new(2).expect("capacity"));
        cache.insert("a", 1);
        cache.insert("b", 2);
        assert_eq!(cache.get(&"a"), Some(1));

        cache.insert("c", 3);

        assert!(cache.get(&"b").is_none());
        assert_eq!(cache.get(&"a"), Some(1));
        assert_eq!(cache.get(&"c"), Some(3));
    }

    // Regression test for P1-CACHE-PANIC: on a current-thread runtime the old
    // `block_in_place(|| m.blocking_lock())` path panicked with "can call
    // blocking only when running on the multi-threaded runtime". This test
    // exercises the cache under a current_thread runtime and asserts both that
    // it does not panic AND that the cache actually functions (a real HIT), so
    // a "disable-on-current-thread" facade cannot pass it.
    #[tokio::test(flavor = "current_thread")]
    async fn works_on_current_thread_runtime() {
        let cache = BlockingLruCache::new(NonZeroUsize::new(2).expect("capacity"));

        // Would panic on the old implementation; must succeed now.
        assert!(cache.get(&"first").is_none());
        cache.insert("first", 1);
        assert_eq!(cache.get(&"first"), Some(1));

        // Exercise the insert-with paths under current_thread too.
        assert_eq!(cache.get_or_insert_with("second", || 2), 2);
        assert_eq!(cache.get(&"second"), Some(2));
        assert_eq!(cache.get_or_insert_with("second", || 99), 2);

        let computed = cache
            .get_or_try_insert_with::<()>("third", || Ok(3))
            .expect("factory ok");
        assert_eq!(computed, 3);
        assert_eq!(cache.get(&"third"), Some(3));

        // Eviction still works (capacity 2): "first" should have been pushed out.
        assert!(cache.get(&"first").is_none());

        assert_eq!(cache.remove(&"second"), Some(2));
        assert!(cache.blocking_lock().is_some());
    }

    #[test]
    fn disabled_without_runtime() {
        let cache = BlockingLruCache::new(NonZeroUsize::new(2).expect("capacity"));
        cache.insert("first", 1);
        assert!(cache.get(&"first").is_none());

        assert_eq!(cache.get_or_insert_with("first", || 2), 2);
        assert!(cache.get(&"first").is_none());

        assert!(cache.remove(&"first").is_none());
        cache.clear();

        let result = cache.with_mut(|inner| {
            inner.put("tmp", 3);
            inner.get(&"tmp").cloned()
        });
        assert_eq!(result, Some(3));
        assert!(cache.get(&"tmp").is_none());

        assert!(cache.blocking_lock().is_none());
    }
}
