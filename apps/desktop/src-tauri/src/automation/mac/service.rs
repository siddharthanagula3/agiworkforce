#![allow(unsafe_code)]
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::Mutex;

use accessibility_sys::{
    AXUIElementCopyAttributeValue, AXUIElementCopyElementAtPosition, AXUIElementCreateSystemWide,
    AXUIElementPerformAction, AXUIElementRef, AXValueGetValue,
};
use core_foundation::base::{CFTypeRef, TCFType};
use core_foundation::string::{CFString, CFStringRef};

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

#[derive(Debug, Clone)]
pub struct AXElement(pub AXUIElementRef);

// SAFETY: AXUIElementRef is not officially documented as thread-safe by Apple.
// The Accessibility API should ideally be accessed from the main thread.
//
// CURRENT WORKAROUND: In practice, this is mitigated by:
// 1. The MacAutomationService is created once in AppState
// 2. All automation commands are serialized through Tauri's command system
// 3. We use CFRetain/CFRelease for proper reference counting
//
// TODO(SAFETY): For full correctness, use a dedicated automation thread with channels.
unsafe impl Send for AXElement {}
unsafe impl Sync for AXElement {}

impl Drop for AXElement {
    fn drop(&mut self) {
        unsafe {
            if !self.0.is_null() {
                core_foundation::base::CFRelease(self.0 as *const c_void);
            }
        }
    }
}

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
                system_wide: AXElement(system_wide_ref),
                cache: Mutex::new(HashMap::new()),
            })
        }
    }

    pub fn register_element(&self, element_ref: AXUIElementRef) -> Result<String> {
        unsafe {
            core_foundation::base::CFRetain(element_ref as *const c_void);
            let ptr_val = element_ref as usize;
            let id = format!("{:x}", ptr_val);

            let mut cache = self.cache.lock().map_err(|_| anyhow!("Lock poisoned"))?;
            cache.insert(id.clone(), AXElement(element_ref));
            Ok(id)
        }
    }

    pub fn get_element(&self, id: &str) -> Result<AXElement> {
        let cache = self.cache.lock().map_err(|_| anyhow!("Lock poisoned"))?;
        if let Some(el) = cache.get(id) {
            unsafe {
                core_foundation::base::CFRetain(el.0 as *const c_void);
            }
            Ok(AXElement(el.0))
        } else {
            Err(anyhow!("Element not found in cache: {}", id))
        }
    }

    pub fn element_at_point(&self, x: f32, y: f32) -> Result<AXElement> {
        unsafe {
            let mut element_ref: AXUIElementRef = std::ptr::null_mut();
            let error =
                AXUIElementCopyElementAtPosition(self.system_wide.0, x, y, &mut element_ref);
            if error == 0 && !element_ref.is_null() {
                Ok(AXElement(element_ref))
            } else {
                Err(anyhow!(
                    "Failed to get element at position: error {}",
                    error
                ))
            }
        }
    }

    pub fn focused_element(&self) -> Result<AXElement> {
        let attr = CFString::new("AXFocusedUIElement");
        unsafe {
            let mut value_ref: *const c_void = std::ptr::null();
            let error = AXUIElementCopyAttributeValue(
                self.system_wide.0,
                attr.as_concrete_TypeRef(),
                &mut value_ref,
            );
            if error == 0 && !value_ref.is_null() {
                let element_ref = value_ref as AXUIElementRef;
                Ok(AXElement(element_ref))
            } else {
                Err(anyhow!("Failed to get focused element: error {}", error))
            }
        }
    }

    pub fn invoke(&self, element_id: &str) -> Result<()> {
        let element = self.get_element(element_id)?;
        let action = CFString::new("AXPress");
        unsafe {
            AXUIElementPerformAction(element.0, action.as_concrete_TypeRef());
        }
        Ok(())
    }

    pub fn bounding_rect(&self, element_id: &str) -> Result<Option<BoundingRectangle>> {
        let element = self.get_element(element_id)?;

        let pos_attr = CFString::new("AXPosition");
        let size_attr = CFString::new("AXSize");

        unsafe {
            let pos_val = self.get_attribute_value(element.0, pos_attr.as_concrete_TypeRef())?;

            let size_val = self.get_attribute_value(element.0, size_attr.as_concrete_TypeRef())?;

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
        }
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

    pub fn set_focus(&self, _element_id: &str) -> Result<()> {
        Err(anyhow!("Unimplemented: set_focus"))
    }

    pub fn find_elements(
        &self,
        _parent_id: Option<String>,
        _query: &ElementQuery,
    ) -> Result<Vec<UIElementInfo>> {
        Err(anyhow!(
            "Unimplemented: find_elements (recursive search is heavy)"
        ))
    }

    pub fn toggle(&self, _element_id: &str) -> Result<()> {
        Err(anyhow!("Unimplemented"))
    }

    pub fn set_value(&self, _element_id: &str, _value: &str) -> Result<()> {
        Err(anyhow!("Unimplemented"))
    }

    pub fn list_windows(&self) -> Result<Vec<UIElementInfo>> {
        Err(anyhow!("Unimplemented"))
    }

    pub fn get_value(&self, element_id: &str) -> Result<String> {
        let _element = self.get_element(element_id)?;
        Err(anyhow!("Unimplemented: get_value"))
    }

    pub fn focus_window(&self, _window_name: &str) -> Result<()> {
        Err(anyhow!("Unimplemented"))
    }
}
