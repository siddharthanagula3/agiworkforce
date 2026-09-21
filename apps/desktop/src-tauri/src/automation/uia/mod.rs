// SAFETY: This module wraps Windows UI Automation COM interfaces which require unsafe FFI calls.
#![allow(unsafe_code)]

use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::{mpsc, OnceLock};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};
use windows::core::{Interface, BSTR, VARIANT};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoInitializeSecurity, CoUninitialize, CLSCTX_INPROC_SERVER,
    COINIT_MULTITHREADED, EOAC_NONE, RPC_C_AUTHN_LEVEL_DEFAULT, RPC_C_IMP_LEVEL_IDENTIFY,
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

static COM_SECURITY_INITIALIZED: OnceLock<()> = OnceLock::new();

#[derive(Clone)]
struct CachedElement {
    element: IUIAutomationElement,
    cached_at: Instant,
}

struct UIAutomationState {
    automation: Mutex<IUIAutomation>,
    cache: Mutex<HashMap<String, CachedElement>>,
    cache_ttl: Duration,
}

struct ComApartment;

impl ComApartment {
    fn initialize() -> Result<Self> {
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }
            .ok()
            .map_err(|error| anyhow!("Failed to initialize UI Automation apartment: {error}"))?;
        COM_SECURITY_INITIALIZED.get_or_init(|| unsafe {
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
        Ok(Self)
    }
}

impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

type AutomationTask = Box<dyn FnOnce(&UIAutomationState) + Send>;

pub struct UIAutomationService {
    sender: Option<mpsc::SyncSender<AutomationTask>>,
    worker: Option<JoinHandle<()>>,
}

impl UIAutomationService {
    pub fn new() -> Result<Self> {
        let (sender, receiver) = mpsc::sync_channel::<AutomationTask>(0);
        let (ready_sender, ready_receiver) = mpsc::sync_channel(0);
        let worker = std::thread::Builder::new()
            .name("windows-ui-automation".into())
            .spawn(move || {
                let apartment = ComApartment::initialize();
                let _apartment = match apartment {
                    Ok(apartment) => apartment,
                    Err(error) => {
                        let _ = ready_sender.send(Err(error));
                        return;
                    }
                };
                // Native interfaces must be released before the apartment shuts down.
                let state = match UIAutomationState::new() {
                    Ok(state) => state,
                    Err(error) => {
                        let _ = ready_sender.send(Err(error));
                        return;
                    }
                };
                if ready_sender.send(Ok(())).is_err() {
                    return;
                }
                for task in receiver {
                    task(&state);
                }
            })?;
        let ready = ready_receiver
            .recv()
            .map_err(|error| anyhow!("UI Automation worker failed during initialization: {error}"))
            .and_then(|result| result);
        if let Err(error) = ready {
            drop(sender);
            let _ = worker.join();
            return Err(error);
        }
        Ok(Self {
            sender: Some(sender),
            worker: Some(worker),
        })
    }

    fn call<R: Send + 'static>(
        &self,
        operation: impl FnOnce(&UIAutomationState) -> Result<R> + Send + 'static,
    ) -> Result<R> {
        let (sender, receiver) = mpsc::sync_channel(0);
        self.sender
            .as_ref()
            .ok_or_else(|| anyhow!("UI Automation worker is stopped"))?
            .send(Box::new(move |state| {
                let _ = sender.send(operation(state));
            }))
            .map_err(|_| anyhow!("UI Automation worker is unavailable"))?;
        receiver
            .recv()
            .map_err(|_| anyhow!("UI Automation worker stopped before responding"))?
    }

    pub fn list_windows(&self) -> Result<Vec<UIElementInfo>> {
        self.call(UIAutomationState::list_windows)
    }

    pub fn find_elements(
        &self,
        parent_id: Option<String>,
        query: &ElementQuery,
    ) -> Result<Vec<UIElementInfo>> {
        let query = query.clone();
        self.call(move |state| state.find_elements(parent_id, &query))
    }

    fn is_element_enabled(&self, element_id: &str) -> Result<bool> {
        let element_id = element_id.to_owned();
        self.call(move |state| {
            let element = state.get_element(&element_id)?;
            unsafe { element.CurrentIsEnabled() }
                .map(|value| value.as_bool())
                .map_err(|error| anyhow!("CurrentIsEnabled failed: {error}"))
        })
    }
    pub fn check_patterns(&self, element_id: &str) -> Result<PatternCapabilities> {
        let element_id = element_id.to_owned();
        self.call(move |state| state.check_patterns(&element_id))
    }

    pub fn invoke(&self, element_id: &str) -> Result<()> {
        let element_id = element_id.to_owned();
        self.call(move |state| state.invoke(&element_id))
    }

    pub fn get_value(&self, element_id: &str) -> Result<String> {
        let element_id = element_id.to_owned();
        self.call(move |state| state.get_value(&element_id))
    }

    pub fn toggle(&self, element_id: &str) -> Result<()> {
        let element_id = element_id.to_owned();
        self.call(move |state| state.toggle(&element_id))
    }

    pub fn bounding_rect(&self, element_id: &str) -> Result<Option<BoundingRectangle>> {
        let element_id = element_id.to_owned();
        self.call(move |state| state.bounding_rect(&element_id))
    }

    pub fn set_focus(&self, element_id: &str) -> Result<()> {
        let element_id = element_id.to_owned();
        self.call(move |state| state.set_focus(&element_id))
    }

    pub fn focus_window(&self, element_id: &str) -> Result<()> {
        let element_id = element_id.to_owned();
        self.call(move |state| state.focus_window(&element_id))
    }

    pub fn scroll_to_element(&self, element_id: &str) -> Result<()> {
        let element_id = element_id.to_owned();
        self.call(move |state| state.scroll_to_element(&element_id))
    }

    pub fn get_grid_row_count(&self, element_id: &str) -> Result<i32> {
        let element_id = element_id.to_owned();
        self.call(move |state| state.get_grid_row_count(&element_id))
    }

    pub fn get_grid_column_count(&self, element_id: &str) -> Result<i32> {
        let element_id = element_id.to_owned();
        self.call(move |state| state.get_grid_column_count(&element_id))
    }

    pub fn set_value(&self, element_id: &str, value: &str) -> Result<()> {
        let element_id = element_id.to_owned();
        let value = value.to_owned();
        self.call(move |state| state.set_value(&element_id, &value))
    }

    pub fn get_table_cell(&self, element_id: &str, row: i32, column: i32) -> Result<String> {
        let element_id = element_id.to_owned();
        self.call(move |state| state.get_table_cell(&element_id, row, column))
    }

    pub fn expand_tree_node(&self, element_id: &str, expand: bool) -> Result<()> {
        let element_id = element_id.to_owned();
        self.call(move |state| state.expand_tree_node(&element_id, expand))
    }

    pub fn clear_expired_cache(&self) {
        if let Err(error) = self.call(|state| {
            state.clear_expired_cache();
            Ok(())
        }) {
            tracing::warn!(%error, "Unable to expire UI Automation cache");
        }
    }

    pub fn clear_cache(&self) {
        if let Err(error) = self.call(|state| {
            state.clear_cache();
            Ok(())
        }) {
            tracing::warn!(%error, "Unable to clear UI Automation cache");
        }
    }
}

impl Drop for UIAutomationService {
    fn drop(&mut self) {
        drop(self.sender.take());
        if let Some(worker) = self.worker.take() {
            if worker.join().is_err() {
                tracing::warn!("UI Automation worker terminated unexpectedly");
            }
        }
    }
}

impl UIAutomationState {
    fn new() -> Result<Self> {
        let automation: IUIAutomation = unsafe {
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)
                .map_err(|err| anyhow!("Failed to create CUIAutomation: {err:?}"))?
        };
        Ok(Self {
            automation: Mutex::new(automation),
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
        f(&guard)
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
