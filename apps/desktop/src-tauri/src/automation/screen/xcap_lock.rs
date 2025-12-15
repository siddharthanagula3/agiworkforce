use anyhow::Result;
use std::sync::MutexGuard;

pub fn lock_xcap() -> Result<MutexGuard<'static, ()>> {
    crate::automation::os_lock::lock_os_automation()
}
