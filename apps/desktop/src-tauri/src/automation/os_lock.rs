use anyhow::{anyhow, Result};
use std::sync::{Mutex, MutexGuard, OnceLock};

static AUTOMATION_OS_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

pub fn lock_os_automation() -> Result<MutexGuard<'static, ()>> {
    AUTOMATION_OS_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|e| anyhow!("automation OS lock poisoned: {}", e))
}
