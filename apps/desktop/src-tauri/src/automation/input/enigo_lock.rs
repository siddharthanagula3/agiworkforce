use anyhow::Result;
use std::sync::MutexGuard;

pub fn lock_enigo() -> Result<MutexGuard<'static, ()>> {
    crate::automation::os_lock::lock_os_automation()
}
