use anyhow::Result;
use std::sync::MutexGuard;

/// `enigo` interacts with OS-level input APIs that may not be thread-safe across
/// concurrent calls. Serialize all `enigo` usage to avoid crashes (SIGSEGV) in
/// tests and production.
pub fn lock_enigo() -> Result<MutexGuard<'static, ()>> {
    crate::automation::os_lock::lock_os_automation()
}
