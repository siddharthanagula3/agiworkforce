use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use windows::core::{Interface, BSTR, VARIANT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoInitializeSecurity, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED, EOAC_NONE, RPC_C_AUTHN_LEVEL_DEFAULT, RPC_C_IMP_LEVEL_IDENTIFY,
    SAFEARRAY,
};
use windows::Win32::System::Ole::{
    SafeArrayAccessData, SafeArrayDestroy, SafeArrayGetLBound, SafeArrayGetUBound,
    SafeArrayUnaccessData,
};
use windows::Win32::UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationElement};

mod actions;
mod element_tree;
mod patterns;
mod wait;

#[cfg(test)]
mod tests;

pub use element_tree::{BoundingRectangle, ElementQuery, UIElementInfo};
pub use patterns::PatternCapabilities;
pub use wait::WaitConfig;

static COM_INITIALIZED: OnceLock<()> = OnceLock::new();

#[derive(Clone)]
struct CachedElement {
    element: IUIAutomationElement,
    cached_at: Instant,
}

pub struct UIAutomationService {
    automation: IUIAutomation,
    cache: Mutex<HashMap<String, CachedElement>>,
    cache_ttl: Duration,
}

unsafe impl Send for UIAutomationService {}
unsafe impl Sync for UIAutomationService {}

impl UIAutomationService {
    pub fn new() -> Result<Self> {
        // Thread-safe COM initialization using OnceLock
        COM_INITIALIZED.get_or_try_init(|| unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(|err| anyhow!("CoInitializeEx failed: {err:?}"))?;
            let _ = CoInitializeSecurity(
                None,
                -1,
                None,
                None,
                RPC_C_AUTHN_LEVEL_DEFAULT,
                RPC_C_IMP_LEVEL_IDENTIFY,
                None,
                EOAC_NONE,
                None,
            )
            .ok();
            Ok(())
        })?;

        let automation: IUIAutomation = unsafe {
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                .map_err(|err| anyhow!("Failed to create CUIAutomation: {err:?}"))?
        };

        Ok(Self {
            automation,
            cache: Mutex::new(HashMap::new()),
            cache_ttl: Duration::from_secs(30), // 30 second TTL for cached elements
        })
    }

    pub(super) fn automation(&self) -> &IUIAutomation {
        &self.automation
    }

    pub(super) fn root_element(&self) -> Result<IUIAutomationElement> {
        unsafe { self.automation.GetRootElement() }
            .map_err(|err| anyhow!("GetRootElement: {err:?}"))
    }

    pub(super) fn register_element(&self, element: &IUIAutomationElement) -> Result<String> {
        let runtime_id =
            unsafe { element.GetRuntimeId() }.map_err(|err| anyhow!("GetRuntimeId: {err:?}"))?;
        let id = safe_array_to_runtime_id(runtime_id)?;

        let mut cache = self
            .cache
            .lock()
            .map_err(|_| anyhow!("Failed to acquire cache lock"))?;
        cache.insert(
            id.clone(),
            CachedElement {
                element: element.clone(),
                cached_at: Instant::now(),
            },
        );
        Ok(id)
    }

    pub(super) fn get_element(&self, id: &str) -> Result<IUIAutomationElement> {
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| anyhow!("Failed to acquire cache lock"))?;

        // Clean expired entries
        cache.retain(|_, cached| cached.cached_at.elapsed() < self.cache_ttl);

        cache
            .get(id)
            .map(|cached| cached.element.clone())
            .ok_or_else(|| anyhow!("Unknown element id: {id}"))
    }

    /// Clear expired cache entries
    pub fn clear_expired_cache(&self) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.retain(|_, cached| cached.cached_at.elapsed() < self.cache_ttl);
        }
    }

    /// Clear all cache entries
    pub fn clear_cache(&self) {
        if let Ok(mut cache) = self.cache.lock() {
            cache.clear();
        }
    }
}

// Note: We don't uninitialize COM in Drop because:
// 1. COM is initialized once per process using OnceLock
// 2. Multiple UIAutomationService instances may exist
// 3. COM will be cleaned up when the process exits
// impl Drop for UIAutomationService {
//     fn drop(&mut self) {
//         // Cannot safely uninitialize COM with OnceLock
//     }
// }

pub(super) fn read_bstr<F>(mut f: F) -> Option<String>
where
    F: FnMut() -> windows::core::Result<BSTR>,
{
    f().ok().map(|b| b.to_string())
}

pub(super) fn safe_array_to_runtime_id(array: *mut SAFEARRAY) -> Result<String> {
    unsafe {
        if array.is_null() {
            return Err(anyhow!("runtime id array is null"));
        }

        let lower =
            SafeArrayGetLBound(array, 1).map_err(|err| anyhow!("SafeArrayGetLBound: {err:?}"))?;
        let upper =
            SafeArrayGetUBound(array, 1).map_err(|err| anyhow!("SafeArrayGetUBound: {err:?}"))?;
        let length = (upper - lower + 1) as usize;

        let mut data_ptr: *mut i32 = std::ptr::null_mut();
        SafeArrayAccessData(array, &mut data_ptr as *mut *mut i32 as *mut *mut _)
            .map_err(|err| anyhow!("SafeArrayAccessData: {err:?}"))?;

        let slice = std::slice::from_raw_parts(data_ptr, length);
        let id = slice
            .iter()
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join("-");

        SafeArrayUnaccessData(array).map_err(|err| anyhow!("SafeArrayUnaccessData: {err:?}"))?;
        SafeArrayDestroy(array).map_err(|err| anyhow!("SafeArrayDestroy: {err:?}"))?;

        Ok(id)
    }
}
