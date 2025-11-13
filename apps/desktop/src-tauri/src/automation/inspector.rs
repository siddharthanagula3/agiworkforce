use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use windows::Win32::Foundation::{BOOL, POINT};
use windows::Win32::UI::Accessibility::{
    IUIAutomationElement, UIA_AutomationIdPropertyId, UIA_ClassNamePropertyId,
    UIA_ControlTypePropertyId, UIA_HasKeyboardFocusPropertyId, UIA_IsEnabledPropertyId,
    UIA_IsOffscreenPropertyId, UIA_NamePropertyId,
};

use super::uia::{read_bstr, BoundingRectangle, UIAutomationService};

/// Detailed element information with all properties
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetailedElementInfo {
    pub id: String,
    pub name: String,
    pub class_name: String,
    pub control_type: String,
    pub bounding_rect: Option<BoundingRectangle>,
    pub properties: HashMap<String, serde_json::Value>,
    pub automation_id: Option<String>,
    pub parent: Option<BasicElementInfo>,
    pub children: Vec<BasicElementInfo>,
    pub is_enabled: bool,
    pub is_offscreen: bool,
    pub has_keyboard_focus: bool,
}

/// Basic element info (used for parent/children to avoid recursion)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BasicElementInfo {
    pub id: String,
    pub name: String,
    pub class_name: String,
    pub control_type: String,
}

/// Element selector for finding elements
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementSelector {
    pub selector_type: SelectorType,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SelectorType {
    AutomationId,
    Name,
    ClassName,
    XPath,
    Coordinates,
}

/// Inspector service for element inspection
pub struct InspectorService {
    uia: UIAutomationService,
}

impl InspectorService {
    pub fn new() -> Result<Self> {
        Ok(Self {
            uia: UIAutomationService::new()?,
        })
    }

    /// Get detailed information about element at specific coordinates
    pub fn inspect_element_at_point(&self, x: i32, y: i32) -> Result<DetailedElementInfo> {
        let point = POINT { x, y };

        let element = unsafe {
            self.uia
                .automation()
                .ElementFromPoint(point)
                .map_err(|err| anyhow!("ElementFromPoint failed: {err:?}"))?
        };

        self.get_detailed_info(&element)
    }

    /// Get detailed information about a cached element by ID
    pub fn inspect_element_by_id(&self, element_id: &str) -> Result<DetailedElementInfo> {
        let element = self.uia.get_element(element_id)?;
        self.get_detailed_info(&element)
    }

    /// Find element by selector
    pub fn find_element_by_selector(&self, selector: &ElementSelector) -> Result<Option<String>> {
        match selector.selector_type {
            SelectorType::AutomationId => {
                let query = crate::automation::uia::ElementQuery {
                    automation_id: Some(selector.value.clone()),
                    ..Default::default()
                };
                let elements = self.uia.find_elements(None, &query)?;
                Ok(elements.first().map(|e| e.id.clone()))
            }
            SelectorType::Name => {
                let query = crate::automation::uia::ElementQuery {
                    name: Some(selector.value.clone()),
                    ..Default::default()
                };
                let elements = self.uia.find_elements(None, &query)?;
                Ok(elements.first().map(|e| e.id.clone()))
            }
            SelectorType::ClassName => {
                let query = crate::automation::uia::ElementQuery {
                    class_name: Some(selector.value.clone()),
                    ..Default::default()
                };
                let elements = self.uia.find_elements(None, &query)?;
                Ok(elements.first().map(|e| e.id.clone()))
            }
            SelectorType::Coordinates => {
                // Parse "x,y" format
                let parts: Vec<&str> = selector.value.split(',').collect();
                if parts.len() != 2 {
                    return Err(anyhow!("Invalid coordinate format: {}", selector.value));
                }
                let x: i32 = parts[0].trim().parse()?;
                let y: i32 = parts[1].trim().parse()?;

                let info = self.inspect_element_at_point(x, y)?;
                Ok(Some(info.id))
            }
            SelectorType::XPath => {
                // XPath is not directly supported by UIA, return error
                Err(anyhow!("XPath selectors not supported"))
            }
        }
    }

    /// Generate selector for an element
    pub fn generate_selector(&self, element_id: &str) -> Result<Vec<ElementSelector>> {
        let element = self.uia.get_element(element_id)?;
        let mut selectors = Vec::new();

        // Try automation ID (best selector)
        if let Some(automation_id) = read_bstr(|| unsafe {
            element
                .GetCurrentPropertyValue(UIA_AutomationIdPropertyId)
                .ok()?
                .try_into()
                .ok()
        }) {
            if !automation_id.is_empty() {
                selectors.push(ElementSelector {
                    selector_type: SelectorType::AutomationId,
                    value: automation_id,
                });
            }
        }

        // Try name (second best)
        if let Some(name) = read_bstr(|| unsafe {
            element
                .GetCurrentPropertyValue(UIA_NamePropertyId)
                .ok()?
                .try_into()
                .ok()
        }) {
            if !name.is_empty() {
                selectors.push(ElementSelector {
                    selector_type: SelectorType::Name,
                    value: name,
                });
            }
        }

        // Try class name (less reliable)
        if let Some(class_name) = read_bstr(|| unsafe {
            element
                .GetCurrentPropertyValue(UIA_ClassNamePropertyId)
                .ok()?
                .try_into()
                .ok()
        }) {
            if !class_name.is_empty() {
                selectors.push(ElementSelector {
                    selector_type: SelectorType::ClassName,
                    value: class_name,
                });
            }
        }

        // Fallback to coordinates
        if let Ok(Some(rect)) = self.uia.bounding_rect(element_id) {
            let x = (rect.left + rect.width / 2.0).round() as i32;
            let y = (rect.top + rect.height / 2.0).round() as i32;
            selectors.push(ElementSelector {
                selector_type: SelectorType::Coordinates,
                value: format!("{},{}", x, y),
            });
        }

        Ok(selectors)
    }

    /// Get element tree (parent and children)
    pub fn get_element_tree(
        &self,
        element_id: &str,
    ) -> Result<(Option<BasicElementInfo>, Vec<BasicElementInfo>)> {
        let element = self.uia.get_element(element_id)?;

        // Get parent
        let parent = self.get_parent(&element).ok();

        // Get children
        let children = self.get_children(&element).unwrap_or_default();

        Ok((parent, children))
    }

    /// Get detailed information from element
    fn get_detailed_info(&self, element: &IUIAutomationElement) -> Result<DetailedElementInfo> {
        let id = self.uia.register_element(element)?;

        let name = read_bstr(|| unsafe {
            element
                .GetCurrentPropertyValue(UIA_NamePropertyId)
                .ok()?
                .try_into()
                .ok()
        })
        .unwrap_or_default();

        let class_name = read_bstr(|| unsafe {
            element
                .GetCurrentPropertyValue(UIA_ClassNamePropertyId)
                .ok()?
                .try_into()
                .ok()
        })
        .unwrap_or_default();

        let control_type = unsafe {
            element
                .GetCurrentPropertyValue(UIA_ControlTypePropertyId)
                .ok()
                .and_then(|v| v.try_into().ok())
                .map(|id: i32| format!("ControlType_{}", id))
                .unwrap_or_else(|| "Unknown".to_string())
        };

        let automation_id = read_bstr(|| unsafe {
            element
                .GetCurrentPropertyValue(UIA_AutomationIdPropertyId)
                .ok()?
                .try_into()
                .ok()
        });

        let bounding_rect = self.uia.bounding_rect(&id).ok().flatten();

        let is_enabled = unsafe {
            element
                .GetCurrentPropertyValue(UIA_IsEnabledPropertyId)
                .ok()
                .and_then(|v| v.try_into().ok())
                .map(|b: BOOL| b.as_bool())
                .unwrap_or(false)
        };

        let is_offscreen = unsafe {
            element
                .GetCurrentPropertyValue(UIA_IsOffscreenPropertyId)
                .ok()
                .and_then(|v| v.try_into().ok())
                .map(|b: BOOL| b.as_bool())
                .unwrap_or(false)
        };

        let has_keyboard_focus = unsafe {
            element
                .GetCurrentPropertyValue(UIA_HasKeyboardFocusPropertyId)
                .ok()
                .and_then(|v| v.try_into().ok())
                .map(|b: BOOL| b.as_bool())
                .unwrap_or(false)
        };

        // Collect all properties
        let mut properties = HashMap::new();
        properties.insert("name".to_string(), serde_json::json!(name));
        properties.insert("class_name".to_string(), serde_json::json!(class_name));
        properties.insert("control_type".to_string(), serde_json::json!(control_type));
        if let Some(ref aid) = automation_id {
            properties.insert("automation_id".to_string(), serde_json::json!(aid));
        }
        properties.insert("is_enabled".to_string(), serde_json::json!(is_enabled));
        properties.insert("is_offscreen".to_string(), serde_json::json!(is_offscreen));
        properties.insert(
            "has_keyboard_focus".to_string(),
            serde_json::json!(has_keyboard_focus),
        );

        let parent = self.get_parent(element).ok();
        let children = self.get_children(element).unwrap_or_default();

        Ok(DetailedElementInfo {
            id,
            name,
            class_name,
            control_type,
            bounding_rect,
            properties,
            automation_id,
            parent,
            children,
            is_enabled,
            is_offscreen,
            has_keyboard_focus,
        })
    }

    /// Get parent element
    fn get_parent(&self, element: &IUIAutomationElement) -> Result<BasicElementInfo> {
        let condition = unsafe {
            self.uia
                .automation()
                .CreateTrueCondition()
                .map_err(|err| anyhow!("CreateTrueCondition failed: {err:?}"))?
        };

        let parent = unsafe {
            self.uia
                .automation()
                .GetParentElementBuildCache(element, &condition)
                .map_err(|err| anyhow!("GetParentElementBuildCache failed: {err:?}"))?
        };

        self.get_basic_info(&parent)
    }

    /// Get children elements
    fn get_children(&self, element: &IUIAutomationElement) -> Result<Vec<BasicElementInfo>> {
        let condition = unsafe {
            self.uia
                .automation()
                .CreateTrueCondition()
                .map_err(|err| anyhow!("CreateTrueCondition failed: {err:?}"))?
        };

        let children_array = unsafe {
            element
                .FindAll(
                    windows::Win32::UI::Accessibility::TreeScope_Children,
                    &condition,
                )
                .map_err(|err| anyhow!("FindAll children failed: {err:?}"))?
        };

        let length = unsafe { children_array.Length().unwrap_or(0) };
        let mut children = Vec::new();

        for i in 0..length {
            if let Ok(child) = unsafe { children_array.GetElement(i) } {
                if let Ok(info) = self.get_basic_info(&child) {
                    children.push(info);
                }
            }
        }

        Ok(children)
    }

    /// Get basic info from element
    fn get_basic_info(&self, element: &IUIAutomationElement) -> Result<BasicElementInfo> {
        let id = self.uia.register_element(element)?;

        let name = read_bstr(|| unsafe {
            element
                .GetCurrentPropertyValue(UIA_NamePropertyId)
                .ok()?
                .try_into()
                .ok()
        })
        .unwrap_or_default();

        let class_name = read_bstr(|| unsafe {
            element
                .GetCurrentPropertyValue(UIA_ClassNamePropertyId)
                .ok()?
                .try_into()
                .ok()
        })
        .unwrap_or_default();

        let control_type = unsafe {
            element
                .GetCurrentPropertyValue(UIA_ControlTypePropertyId)
                .ok()
                .and_then(|v| v.try_into().ok())
                .map(|id: i32| format!("ControlType_{}", id))
                .unwrap_or_else(|| "Unknown".to_string())
        };

        Ok(BasicElementInfo {
            id,
            name,
            class_name,
            control_type,
        })
    }
}
