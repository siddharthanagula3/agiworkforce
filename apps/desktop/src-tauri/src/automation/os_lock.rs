use anyhow::{anyhow, Result};
use std::sync::{Mutex, MutexGuard, OnceLock};

static AUTOMATION_OS_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

/// Serialize access to OS-level automation APIs (screen capture, input, clipboard).
///
/// Some macOS/Windows APIs used by third-party crates are not reliably safe under
/// heavy parallelism (e.g., test runners). A single global lock avoids crashes
/// and undefined behavior.
pub fn lock_os_automation() -> Result<MutexGuard<'static, ()>> {
    AUTOMATION_OS_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|e| anyhow!("automation OS lock poisoned: {}", e))
}
