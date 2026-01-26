#![allow(unsafe_code)]
use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::Arc;

use accessibility_sys::{
    kAXChildrenAttribute, kAXDescriptionAttribute, kAXFocusedAttribute, kAXPressAction,
    kAXRaiseAction, kAXRoleAttribute, kAXTitleAttribute, kAXValueAttribute, kAXWindowsAttribute,
    AXIsProcessTrusted, AXUIElementCopyAttributeValue, AXUIElementCopyAttributeValues,
    AXUIElementCopyElementAtPosition, AXUIElementCreateApplication, AXUIElementCreateSystemWide,
    AXUIElementGetAttributeValueCount, AXUIElementPerformAction, AXUIElementRef,
    AXUIElementSetAttributeValue, AXValueGetValue,
};
use core_foundation::array::{CFArrayGetCount, CFArrayGetValueAtIndex};
use core_foundation::base::{CFTypeRef, TCFType};
use core_foundation::string::{CFString, CFStringRef};
use sysinfo::System;

use crate::automation::types::{BoundingRectangle, ElementQuery, UIElementInfo};

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct CGPoint {
    pub x: f64,
    pub y: f64,
}

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct CGSize {
    pub width: f64,
    pub height: f64,
}

const K_AXVALUE_CGPOINT_TYPE: u32 = 1;
const K_AXVALUE_CGSIZE_TYPE: u32 = 2;

/// Thread-safe wrapper for AXUIElementRef.
///
/// SAFETY: Access to the underlying AXUIElementRef is serialized through a Mutex.
/// All automation operations go through this wrapper, preventing data races.
/// The AXUIElement API is not officially documented as thread-safe by Apple,
/// but we ensure single-threaded access at any given time through this synchronization.
///
/// The wrapper uses `Arc<Mutex<_>>` which is inherently `Send + Sync` when the inner
/// type is `Send`, eliminating the need for manual unsafe trait implementations.
/// While `AXUIElementRef` (a raw pointer) is not inherently `Send`, our usage pattern
/// ensures safety:
/// 1. The pointer is only accessed through the `with_element` method which holds the lock
/// 2. Reference counting (CFRetain/CFRelease) is properly managed
/// 3. All operations are serialized through the mutex
#[derive(Clone)]
pub struct AXElement {
    inner: Arc<Mutex<AXUIElementRef>>,
}

impl std::fmt::Debug for AXElement {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let ptr = self.inner.lock();
        f.debug_struct("AXElement")
            .field("ptr", &format!("{:p}", *ptr))
            .finish()
    }
}

impl AXElement {
    /// Create a new AXElement from a raw AXUIElementRef.
    ///
    /// SAFETY: The caller must ensure that `element` is a valid AXUIElementRef
    /// that has been properly retained (or is newly created with ownership transferred).
    #[allow(clippy::arc_with_non_send_sync)]
    pub fn new(element: AXUIElementRef) -> Self {
        Self {
            inner: Arc::new(Mutex::new(element)),
        }
    }

    /// Execute an operation with the underlying AXUIElementRef.
    ///
    /// This method ensures serialized access to the AXUIElementRef,
    /// preventing concurrent access from multiple threads.
    pub fn with_element<F, R>(&self, f: F) -> R
    where
        F: FnOnce(AXUIElementRef) -> R,
    {
        let guard = self.inner.lock();
        f(*guard)
    }

    /// Get the raw pointer value for use as a cache key or identifier.
    /// This does not provide access to the element itself.
    pub fn ptr_value(&self) -> usize {
        let guard = self.inner.lock();
        *guard as usize
    }
}

impl Drop for AXElement {
    fn drop(&mut self) {
        // Only release if this is the last reference to the Arc
        if Arc::strong_count(&self.inner) == 1 {
            let guard = self.inner.lock();
            unsafe {
                if !(*guard).is_null() {
                    core_foundation::base::CFRelease(*guard as *const c_void);
                }
            }
        }
    }
}

// SAFETY: We use Arc<Mutex<_>> to ensure synchronized access to the AXUIElementRef.
// While AXUIElementRef is a raw pointer (not Send), our wrapper ensures that:
// 1. Only one thread can access the pointer at a time (via Mutex)
// 2. The Arc provides shared ownership with proper reference counting
// 3. CFRetain/CFRelease handle the underlying Core Foundation reference counting
//
// This is safe because we never allow unsynchronized access to the raw pointer,
// and the Mutex serializes all operations that interact with the Accessibility API.
unsafe impl Send for AXElement {}
unsafe impl Sync for AXElement {}

pub struct MacAutomationService {
    system_wide: AXElement,
    cache: Mutex<HashMap<String, AXElement>>,
}

impl MacAutomationService {
    pub fn new() -> Result<Self> {
        unsafe {
            let system_wide_ref = AXUIElementCreateSystemWide();
            if system_wide_ref.is_null() {
                return Err(anyhow!("Failed to create system-wide AX element"));
            }
            Ok(Self {
                system_wide: AXElement::new(system_wide_ref),
                cache: Mutex::new(HashMap::new()),
            })
        }
    }

    pub fn register_element(&self, element_ref: AXUIElementRef) -> Result<String> {
        unsafe {
            core_foundation::base::CFRetain(element_ref as *const c_void);
        }
        let ptr_val = element_ref as usize;
        let id = format!("{:x}", ptr_val);

        let mut cache = self.cache.lock();
        cache.insert(id.clone(), AXElement::new(element_ref));
        Ok(id)
    }

    pub fn get_element(&self, id: &str) -> Result<AXElement> {
        let cache = self.cache.lock();
        if let Some(el) = cache.get(id) {
            el.with_element(|ptr| unsafe {
                core_foundation::base::CFRetain(ptr as *const c_void);
            });
            Ok(el.clone())
        } else {
            Err(anyhow!("Element not found in cache: {}", id))
        }
    }

    pub fn element_at_point(&self, x: f32, y: f32) -> Result<AXElement> {
        self.system_wide.with_element(|system_wide_ptr| unsafe {
            let mut element_ref: AXUIElementRef = std::ptr::null_mut();
            let error = AXUIElementCopyElementAtPosition(system_wide_ptr, x, y, &mut element_ref);
            if error == 0 && !element_ref.is_null() {
                Ok(AXElement::new(element_ref))
            } else {
                Err(anyhow!(
                    "Failed to get element at position: error {}",
                    error
                ))
            }
        })
    }

    pub fn focused_element(&self) -> Result<AXElement> {
        let attr = CFString::new("AXFocusedUIElement");
        self.system_wide.with_element(|system_wide_ptr| unsafe {
            let mut value_ref: *const c_void = std::ptr::null();
            let error = AXUIElementCopyAttributeValue(
                system_wide_ptr,
                attr.as_concrete_TypeRef(),
                &mut value_ref,
            );
            if error == 0 && !value_ref.is_null() {
                let element_ref = value_ref as AXUIElementRef;
                Ok(AXElement::new(element_ref))
            } else {
                Err(anyhow!("Failed to get focused element: error {}", error))
            }
        })
    }

    pub fn invoke(&self, element_id: &str) -> Result<()> {
        let element = self.get_element(element_id)?;
        let action = CFString::new("AXPress");
        element.with_element(|ptr| unsafe {
            AXUIElementPerformAction(ptr, action.as_concrete_TypeRef());
        });
        Ok(())
    }

    pub fn bounding_rect(&self, element_id: &str) -> Result<Option<BoundingRectangle>> {
        let element = self.get_element(element_id)?;

        let pos_attr = CFString::new("AXPosition");
        let size_attr = CFString::new("AXSize");

        element.with_element(|ptr| unsafe {
            let pos_val = self.get_attribute_value(ptr, pos_attr.as_concrete_TypeRef())?;
            let size_val = self.get_attribute_value(ptr, size_attr.as_concrete_TypeRef())?;

            let point = self.ax_value_to_point(pos_val)?;
            let size = self.ax_value_to_size(size_val)?;

            if let (Some(p), Some(s)) = (point, size) {
                Ok(Some(BoundingRectangle {
                    left: p.x,
                    top: p.y,
                    width: s.width,
                    height: s.height,
                }))
            } else {
                Ok(None)
            }
        })
    }

    unsafe fn get_attribute_value(
        &self,
        element: AXUIElementRef,
        attribute: CFStringRef,
    ) -> Result<CFTypeRef> {
        let mut value_ref: *const c_void = std::ptr::null();
        let error = AXUIElementCopyAttributeValue(element, attribute, &mut value_ref);
        if error == 0 && !value_ref.is_null() {
            Ok(value_ref as CFTypeRef)
        } else {
            Err(anyhow!("Failed to list attribute"))
        }
    }

    unsafe fn ax_value_to_point(&self, value_ref: CFTypeRef) -> Result<Option<CGPoint>> {
        let ax_value = value_ref as accessibility_sys::AXValueRef;
        let mut point = CGPoint { x: 0.0, y: 0.0 };
        let success = AXValueGetValue(
            ax_value,
            K_AXVALUE_CGPOINT_TYPE,
            &mut point as *mut _ as *mut c_void,
        );
        if success {
            Ok(Some(point))
        } else {
            Ok(None)
        }
    }

    unsafe fn ax_value_to_size(&self, value_ref: CFTypeRef) -> Result<Option<CGSize>> {
        let ax_value = value_ref as accessibility_sys::AXValueRef;
        let mut size = CGSize {
            width: 0.0,
            height: 0.0,
        };
        let success = AXValueGetValue(
            ax_value,
            K_AXVALUE_CGSIZE_TYPE,
            &mut size as *mut _ as *mut c_void,
        );
        if success {
            Ok(Some(size))
        } else {
            Ok(None)
        }
    }

    /// Check if the application has accessibility permissions
    pub fn check_accessibility_permissions() -> bool {
        unsafe { AXIsProcessTrusted() }
    }

    /// Get a string attribute value from an element
    unsafe fn get_string_attribute(
        &self,
        element: AXUIElementRef,
        attribute: &str,
    ) -> Result<Option<String>> {
        let attr = CFString::new(attribute);
        let mut value_ref: *const c_void = std::ptr::null();
        let error =
            AXUIElementCopyAttributeValue(element, attr.as_concrete_TypeRef(), &mut value_ref);

        if error != 0 || value_ref.is_null() {
            return Ok(None);
        }

        // Check if it's a CFString
        let type_id = core_foundation::base::CFGetTypeID(value_ref as CFTypeRef);
        let string_type_id = core_foundation::string::CFString::type_id();

        if type_id == string_type_id {
            let cf_string: CFString = TCFType::wrap_under_create_rule(value_ref as CFStringRef);
            Ok(Some(cf_string.to_string()))
        } else {
            // Release the reference since it's not a string
            core_foundation::base::CFRelease(value_ref);
            Ok(None)
        }
    }

    /// Get the number of children for an element
    unsafe fn get_children_count(&self, element: AXUIElementRef) -> Result<isize> {
        let attr = CFString::new(kAXChildrenAttribute);
        let mut count: core_foundation::base::CFIndex = 0;
        let error =
            AXUIElementGetAttributeValueCount(element, attr.as_concrete_TypeRef(), &mut count);

        if error != 0 {
            return Err(anyhow!("Failed to get children count: error {}", error));
        }
        Ok(count)
    }

    /// Get children elements from a parent element
    unsafe fn get_children(
        &self,
        element: AXUIElementRef,
        max_children: usize,
    ) -> Result<Vec<AXUIElementRef>> {
        let count = self.get_children_count(element)?;
        if count == 0 {
            return Ok(vec![]);
        }

        let limit = std::cmp::min(count as usize, max_children);
        let attr = CFString::new(kAXChildrenAttribute);
        let mut array_ref: core_foundation::array::CFArrayRef = std::ptr::null();

        let error = AXUIElementCopyAttributeValues(
            element,
            attr.as_concrete_TypeRef(),
            0,
            limit as core_foundation::base::CFIndex,
            &mut array_ref,
        );

        if error != 0 || array_ref.is_null() {
            return Err(anyhow!("Failed to get children: error {}", error));
        }

        let count = CFArrayGetCount(array_ref);
        let mut children = Vec::with_capacity(count as usize);

        for i in 0..count {
            let child_ref = CFArrayGetValueAtIndex(array_ref, i) as AXUIElementRef;
            if !child_ref.is_null() {
                // Retain the reference since we're extracting it from the array
                core_foundation::base::CFRetain(child_ref as *const c_void);
                children.push(child_ref);
            }
        }

        // Release the array
        core_foundation::base::CFRelease(array_ref as *const c_void);

        Ok(children)
    }

    /// Convert an AXUIElementRef to UIElementInfo
    fn element_to_info(&self, element: AXUIElementRef) -> Result<UIElementInfo> {
        let id = self.register_element(element)?;

        unsafe {
            let name = self
                .get_string_attribute(element, kAXTitleAttribute)?
                .or_else(|| {
                    self.get_string_attribute(element, kAXDescriptionAttribute)
                        .ok()
                        .flatten()
                })
                .unwrap_or_default();

            let role = self
                .get_string_attribute(element, kAXRoleAttribute)?
                .unwrap_or_else(|| "Unknown".to_string());

            let bounding_rect = self.bounding_rect(&id).ok().flatten();

            Ok(UIElementInfo {
                id,
                name,
                class_name: role.clone(),
                control_type: role,
                bounding_rect,
            })
        }
    }

    /// Check if an element matches the query criteria
    fn element_matches_query(&self, element: AXUIElementRef, query: &ElementQuery) -> bool {
        unsafe {
            // Check name filter
            if let Some(ref name_filter) = query.name {
                let name = self
                    .get_string_attribute(element, kAXTitleAttribute)
                    .ok()
                    .flatten()
                    .or_else(|| {
                        self.get_string_attribute(element, kAXDescriptionAttribute)
                            .ok()
                            .flatten()
                    });

                if let Some(name) = name {
                    if !name.to_lowercase().contains(&name_filter.to_lowercase()) {
                        return false;
                    }
                } else {
                    return false;
                }
            }

            // Check role/control_type filter
            if let Some(ref control_type) = query.control_type {
                let role = self
                    .get_string_attribute(element, kAXRoleAttribute)
                    .ok()
                    .flatten();

                if let Some(role) = role {
                    if !role.to_lowercase().contains(&control_type.to_lowercase()) {
                        return false;
                    }
                } else {
                    return false;
                }
            }

            // Check class_name filter (maps to role on macOS)
            if let Some(ref class_name) = query.class_name {
                let role = self
                    .get_string_attribute(element, kAXRoleAttribute)
                    .ok()
                    .flatten();

                if let Some(role) = role {
                    if !role.to_lowercase().contains(&class_name.to_lowercase()) {
                        return false;
                    }
                } else {
                    return false;
                }
            }

            true
        }
    }

    pub fn set_focus(&self, element_id: &str) -> Result<()> {
        if !Self::check_accessibility_permissions() {
            return Err(anyhow!(
                "Accessibility permissions not granted. Please enable in System Preferences > Privacy & Security > Accessibility"
            ));
        }

        let element = self.get_element(element_id)?;

        // First, try to raise the element (bring window to front if it's a window)
        let raise_action = CFString::new(kAXRaiseAction);
        element.with_element(|ptr| unsafe {
            AXUIElementPerformAction(ptr, raise_action.as_concrete_TypeRef());
        });

        // Then set the focused attribute to true
        let focused_attr = CFString::new(kAXFocusedAttribute);
        let true_value = core_foundation::boolean::CFBoolean::true_value();

        element.with_element(|ptr| unsafe {
            let error = AXUIElementSetAttributeValue(
                ptr,
                focused_attr.as_concrete_TypeRef(),
                true_value.as_concrete_TypeRef() as CFTypeRef,
            );

            if error != 0 {
                // Some elements can't be focused directly, but raise may have worked
                tracing::debug!(
                    "Could not set focus directly (error {}), raise may have succeeded",
                    error
                );
            }
        });

        Ok(())
    }

    pub fn find_elements(
        &self,
        parent_id: Option<String>,
        query: &ElementQuery,
    ) -> Result<Vec<UIElementInfo>> {
        if !Self::check_accessibility_permissions() {
            return Err(anyhow!(
                "Accessibility permissions not granted. Please enable in System Preferences > Privacy & Security > Accessibility"
            ));
        }

        let max_results = query.max_results.unwrap_or(100);
        let mut results = Vec::new();

        // Determine the root element to search from
        let root_element = if let Some(ref parent_id) = parent_id {
            self.get_element(parent_id)?
        } else if let Some(ref window_name) = query.window {
            // Find the window by name first
            let windows = self.list_windows()?;
            let window = windows
                .iter()
                .find(|w| w.name.to_lowercase().contains(&window_name.to_lowercase()));

            if let Some(window) = window {
                self.get_element(&window.id)?
            } else {
                return Err(anyhow!("Window not found: {}", window_name));
            }
        } else {
            // Use focused element as root
            self.focused_element()?
        };

        // Perform breadth-first search through the element tree
        // Extract the raw pointer from the root element for the queue
        let root_ptr = root_element.with_element(|ptr| ptr);
        let mut queue = vec![root_ptr];
        let max_depth = 10; // Limit recursion depth
        let mut current_depth = 0;
        let max_elements_per_level = 50;

        while !queue.is_empty() && results.len() < max_results && current_depth < max_depth {
            let mut next_level = Vec::new();

            for element in queue.iter().take(max_elements_per_level) {
                // Check if this element matches the query
                if self.element_matches_query(*element, query) {
                    // Retain for registration
                    unsafe {
                        core_foundation::base::CFRetain(*element as *const c_void);
                    }
                    if let Ok(info) = self.element_to_info(*element) {
                        results.push(info);
                        if results.len() >= max_results {
                            break;
                        }
                    }
                }

                // Get children for next level
                if let Ok(children) = unsafe { self.get_children(*element, max_elements_per_level) }
                {
                    next_level.extend(children);
                }
            }

            // Clean up current level elements (except root which is managed by AXElement)
            if current_depth > 0 {
                for element in &queue {
                    unsafe {
                        if !(*element).is_null() {
                            core_foundation::base::CFRelease(*element as *const c_void);
                        }
                    }
                }
            }

            queue = next_level;
            current_depth += 1;
        }

        // Clean up remaining elements in queue
        for element in &queue {
            unsafe {
                if !(*element).is_null() {
                    core_foundation::base::CFRelease(*element as *const c_void);
                }
            }
        }

        Ok(results)
    }

    pub fn toggle(&self, element_id: &str) -> Result<()> {
        if !Self::check_accessibility_permissions() {
            return Err(anyhow!(
                "Accessibility permissions not granted. Please enable in System Preferences > Privacy & Security > Accessibility"
            ));
        }

        let element = self.get_element(element_id)?;

        // Toggle is typically done with AXPress action for checkboxes/buttons
        let action = CFString::new(kAXPressAction);
        element.with_element(|ptr| unsafe {
            let error = AXUIElementPerformAction(ptr, action.as_concrete_TypeRef());
            if error != 0 {
                return Err(anyhow!("Failed to toggle element: error {}", error));
            }
            Ok(())
        })
    }

    pub fn set_value(&self, element_id: &str, value: &str) -> Result<()> {
        if !Self::check_accessibility_permissions() {
            return Err(anyhow!(
                "Accessibility permissions not granted. Please enable in System Preferences > Privacy & Security > Accessibility"
            ));
        }

        let element = self.get_element(element_id)?;
        let value_attr = CFString::new(kAXValueAttribute);
        let cf_value = CFString::new(value);

        element.with_element(|ptr| unsafe {
            let error = AXUIElementSetAttributeValue(
                ptr,
                value_attr.as_concrete_TypeRef(),
                cf_value.as_concrete_TypeRef() as CFTypeRef,
            );

            if error != 0 {
                return Err(anyhow!(
                    "Failed to set value on element: error {}. The element may not be editable.",
                    error
                ));
            }
            Ok(())
        })
    }

    pub fn list_windows(&self) -> Result<Vec<UIElementInfo>> {
        if !Self::check_accessibility_permissions() {
            return Err(anyhow!(
                "Accessibility permissions not granted. Please enable in System Preferences > Privacy & Security > Accessibility"
            ));
        }

        let mut windows = Vec::new();

        // Use sysinfo to get running processes
        let mut system = System::new();
        system.refresh_processes();

        // Get all running app PIDs
        for (pid, process) in system.processes() {
            let pid_i32 = pid.as_u32() as i32;

            unsafe {
                let app_ref = AXUIElementCreateApplication(pid_i32);
                if app_ref.is_null() {
                    continue;
                }

                // Get windows for this application
                let windows_attr = CFString::new(kAXWindowsAttribute);
                let mut value_ref: *const c_void = std::ptr::null();
                let error = AXUIElementCopyAttributeValue(
                    app_ref,
                    windows_attr.as_concrete_TypeRef(),
                    &mut value_ref,
                );

                if error == 0 && !value_ref.is_null() {
                    // Check if it's an array
                    let type_id = core_foundation::base::CFGetTypeID(value_ref as CFTypeRef);
                    let array_type_id = core_foundation::array::CFArray::<*const c_void>::type_id();

                    if type_id == array_type_id {
                        let array_ref = value_ref as core_foundation::array::CFArrayRef;
                        let count = CFArrayGetCount(array_ref);

                        for i in 0..count {
                            let window_ref = CFArrayGetValueAtIndex(array_ref, i) as AXUIElementRef;
                            if window_ref.is_null() {
                                continue;
                            }
                            core_foundation::base::CFRetain(window_ref as *const c_void);

                            if let Ok(info) = self.element_to_info(window_ref) {
                                // Include app name for context
                                let app_name = process.name().to_string();
                                let window_info = UIElementInfo {
                                    id: info.id,
                                    name: if info.name.is_empty() {
                                        app_name
                                    } else {
                                        format!("{} - {}", app_name, info.name)
                                    },
                                    class_name: info.class_name,
                                    control_type: info.control_type,
                                    bounding_rect: info.bounding_rect,
                                };
                                windows.push(window_info);
                            }
                        }
                        // Release the array
                        core_foundation::base::CFRelease(value_ref);
                    } else {
                        core_foundation::base::CFRelease(value_ref);
                    }
                }

                core_foundation::base::CFRelease(app_ref as *const c_void);
            }
        }

        Ok(windows)
    }

    pub fn get_value(&self, element_id: &str) -> Result<String> {
        if !Self::check_accessibility_permissions() {
            return Err(anyhow!(
                "Accessibility permissions not granted. Please enable in System Preferences > Privacy & Security > Accessibility"
            ));
        }

        let element = self.get_element(element_id)?;

        element.with_element(|ptr| unsafe {
            if let Some(value) = self.get_string_attribute(ptr, kAXValueAttribute)? {
                return Ok(value);
            }

            // Try title as fallback
            if let Some(title) = self.get_string_attribute(ptr, kAXTitleAttribute)? {
                return Ok(title);
            }

            // Try description as last resort
            if let Some(desc) = self.get_string_attribute(ptr, kAXDescriptionAttribute)? {
                return Ok(desc);
            }

            Err(anyhow!("No value found for element"))
        })
    }

    pub fn focus_window(&self, window_name: &str) -> Result<()> {
        if !Self::check_accessibility_permissions() {
            return Err(anyhow!(
                "Accessibility permissions not granted. Please enable in System Preferences > Privacy & Security > Accessibility"
            ));
        }

        // Find windows matching the name
        let windows = self.list_windows()?;
        let matching_window = windows
            .iter()
            .find(|w| w.name.to_lowercase().contains(&window_name.to_lowercase()));

        if let Some(window) = matching_window {
            // Focus the found window
            self.set_focus(&window.id)?;
            Ok(())
        } else {
            Err(anyhow!(
                "Window not found: '{}'. Available windows: {:?}",
                window_name,
                windows.iter().map(|w| &w.name).collect::<Vec<_>>()
            ))
        }
    }
}
