// SAFETY: This module wraps Windows UI Automation COM interfaces which require unsafe FFI calls.
#![allow(unsafe_code)]

use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
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
pub mod inspector_impl;
mod patterns;
mod wait;

#[cfg(test)]
mod tests;

pub use crate::automation::types::{BoundingRectangle, ElementQuery, UIElementInfo};
pub use patterns::PatternCapabilities;
pub use wait::WaitConfig;

static COM_INITIALIZED: OnceLock<()> = OnceLock::new();

#[derive(Clone)]
struct CachedElement {
    element: IUIAutomationElement,
    cached_at: Instant,
}

/// Thread-safe UI Automation service for Windows.
///
/// # Safety
///
/// The `IUIAutomation` COM interface is wrapped in an `Arc<Mutex<>>` to ensure
/// serialized access from any thread. While Windows COM objects created in STA
/// (Single-Threaded Apartment) mode ideally should be accessed from their creating
/// thread, wrapping in a Mutex ensures:
///
/// 1. No concurrent access to the COM interface occurs
/// 2. All operations are serialized through the mutex
/// 3. The service can safely be shared across Tauri's async runtime
///
/// The `IUIAutomation` interface is documented as "thread-agile" by Microsoft,
/// meaning it can be called from any thread as long as COM is initialized on that
/// thread. The mutex provides additional safety by preventing any concurrent access.
///
/// Reference: <https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/>
pub struct UIAutomationService {
    /// The UI Automation COM interface, wrapped in Arc<Mutex> for thread safety.
    /// All access must go through `with_automation()` to ensure proper synchronization.
    automation: Arc<Mutex<IUIAutomation>>,
    /// Cache of discovered UI elements, keyed by runtime ID.
    /// Uses parking_lot::Mutex for better performance than std::sync::Mutex.
    cache: Mutex<HashMap<String, CachedElement>>,
    /// Time-to-live for cached elements.
    cache_ttl: Duration,
}

// SAFETY: UIAutomationService is safe to Send and Sync because:
//
// 1. The `IUIAutomation` COM interface is wrapped in `Arc<Mutex<>>` ensuring:
//    - No concurrent access (mutex serializes all operations)
//    - Exclusive access pattern matches COM STA requirements
//
// 2. Microsoft documents IUIAutomation as "thread-agile", meaning it can be
//    called from any thread as long as COM is initialized on that thread.
//    See: https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/
//
// 3. All access goes through `with_automation()` which holds the lock for
//    the duration of any COM operation, preventing data races.
//
// 4. The cache uses parking_lot::Mutex which is inherently Send + Sync.
//
// The unsafe impls are required because IUIAutomation is a raw COM pointer
// that doesn't implement Send/Sync in the windows crate. The Mutex wrapper
// provides the synchronization that makes these impls sound.

// SAFETY: The Mutex ensures exclusive access to the COM interface.
// IUIAutomation is thread-agile per Microsoft documentation.
unsafe impl Send for UIAutomationService {}

// SAFETY: The Mutex serializes all access to the COM interface.
// No concurrent access to IUIAutomation can occur.
unsafe impl Sync for UIAutomationService {}

impl UIAutomationService {
    /// Creates a new UI Automation service.
    ///
    /// Initializes COM in apartment-threaded mode and creates the IUIAutomation
    /// interface. The interface is wrapped in a mutex for thread-safe access.
    pub fn new() -> Result<Self> {
        COM_INITIALIZED.get_or_init(|| unsafe {
            if let Err(err) = CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok() {
                tracing::error!("CoInitializeEx failed: {:?}", err);
                return;
            }

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
        });

        let automation: IUIAutomation = unsafe {
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                .map_err(|err| anyhow!("Failed to create CUIAutomation: {err:?}"))?
        };

        Ok(Self {
            automation: Arc::new(Mutex::new(automation)),
            cache: Mutex::new(HashMap::new()),
            cache_ttl: Duration::from_secs(30),
        })
    }

    /// Executes an operation with exclusive access to the UI Automation interface.
    ///
    /// This method ensures thread-safe access to the COM interface by acquiring
    /// the mutex lock before invoking the provided closure.
    ///
    /// # Arguments
    ///
    /// * `f` - A closure that receives a reference to the `IUIAutomation` interface
    ///
    /// # Returns
    ///
    /// The result of the closure execution
    pub(crate) fn with_automation<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&IUIAutomation) -> R,
    {
        let guard = self.automation.lock();
        f(&*guard)
    }

    /// Gets the desktop root element.
    ///
    /// This is the top-level element from which all UI element searches begin.
    pub(super) fn root_element(&self) -> Result<IUIAutomationElement> {
        self.with_automation(|auto| unsafe { auto.GetRootElement() })
            .map_err(|err| anyhow!("GetRootElement: {err:?}"))
    }

    /// Registers a UI element in the cache and returns its runtime ID.
    ///
    /// The runtime ID is used as a key to retrieve the element later.
    pub(super) fn register_element(&self, element: &IUIAutomationElement) -> Result<String> {
        let runtime_id =
            unsafe { element.GetRuntimeId() }.map_err(|err| anyhow!("GetRuntimeId: {err:?}"))?;
        let id = safe_array_to_runtime_id(runtime_id)?;

        let mut cache = self.cache.lock();
        cache.insert(
            id.clone(),
            CachedElement {
                element: element.clone(),
                cached_at: Instant::now(),
            },
        );
        Ok(id)
    }

    /// Retrieves a cached UI element by its runtime ID.
    ///
    /// Also cleans up expired entries from the cache.
    pub(super) fn get_element(&self, id: &str) -> Result<IUIAutomationElement> {
        let mut cache = self.cache.lock();

        // Clean up expired entries
        let ttl = self.cache_ttl;
        cache.retain(|_, cached| cached.cached_at.elapsed() < ttl);

        cache
            .get(id)
            .map(|cached| cached.element.clone())
            .ok_or_else(|| anyhow!("Unknown element id: {id}"))
    }

    /// Removes expired entries from the element cache.
    pub fn clear_expired_cache(&self) {
        let mut cache = self.cache.lock();
        let ttl = self.cache_ttl;
        cache.retain(|_, cached| cached.cached_at.elapsed() < ttl);
    }

    /// Clears all entries from the element cache.
    pub fn clear_cache(&self) {
        let mut cache = self.cache.lock();
        cache.clear();
    }
}

pub(super) fn read_bstr<F>(mut f: F) -> Option<String>
where
    F: FnMut() -> Option<BSTR>,
{
    f().map(|b| b.to_string())
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
