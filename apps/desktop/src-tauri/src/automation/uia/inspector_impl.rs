use anyhow::{anyhow, Result};
use std::collections::HashMap;

use windows::Win32::Foundation::POINT;
use windows::Win32::UI::Accessibility::{IUIAutomationElement, TreeScope_Children};

use crate::automation::inspector::UIInspector;
use crate::automation::types::{
    BasicElementInfo, DetailedElementInfo, ElementQuery, ElementSelector, SelectorType,
    UIElementInfo,
};

use super::{read_bstr, UIAutomationService};

pub struct InspectorService {
    native: UIAutomationService,
}

impl InspectorService {
    pub fn new() -> Result<Self> {
        Ok(Self {
            native: UIAutomationService::new()?,
        })
    }

    fn get_detailed_info(&self, element: &IUIAutomationElement) -> Result<DetailedElementInfo> {
        let id = self.native.register_element(element)?;

        let name = read_bstr(|| unsafe { element.CurrentName().ok() }).unwrap_or_default();
        let class_name =
            read_bstr(|| unsafe { element.CurrentClassName().ok() }).unwrap_or_default();

        let control_type = unsafe {
            elemen
                .CurrentControlType()
                .map(|id| format!("ControlType_{:?}", id))
                .unwrap_or_else(|_| "Unknown".to_string())
        };

        let automation_id = read_bstr(|| unsafe { element.CurrentAutomationId().ok() });
        let bounding_rect = self.native.bounding_rect(&id).ok().flatten();

        let is_enabled = unsafe {
            elemen
                .CurrentIsEnabled()
                .map(|b| b.as_bool())
                .unwrap_or(false)
        };
        let is_offscreen = unsafe {
            elemen
                .CurrentIsOffscreen()
                .map(|b| b.as_bool())
                .unwrap_or(false)
        };
        let has_keyboard_focus = unsafe {
            elemen
                .CurrentHasKeyboardFocus()
                .map(|b| b.as_bool())
                .unwrap_or(false)
        };

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

    fn get_parent(&self, element: &IUIAutomationElement) -> Result<BasicElementInfo> {
        let parent = unsafe {
            self.native
                .automation()
                .ControlViewWalker()
                .map_err(|err| anyhow!("ControlViewWalker failed: {err:?}"))?
                .GetParentElement(element)
                .map_err(|err| anyhow!("GetParentElement failed: {err:?}"))?
        };

        self.get_basic_info(&parent)
    }

    fn get_children(&self, element: &IUIAutomationElement) -> Result<Vec<BasicElementInfo>> {
        let condition = unsafe {
            self.native
                .automation()
                .CreateTrueCondition()
                .map_err(|err| anyhow!("CreateTrueCondition failed: {err:?}"))?
        };

        let children_array = unsafe {
            elemen
                .FindAll(TreeScope_Children, &condition)
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

    fn get_basic_info(&self, element: &IUIAutomationElement) -> Result<BasicElementInfo> {
        let id = self.native.register_element(element)?;

        let name = read_bstr(|| unsafe { element.CurrentName().ok() }).unwrap_or_default();
        let class_name =
            read_bstr(|| unsafe { element.CurrentClassName().ok() }).unwrap_or_default();
        let control_type = unsafe {
            elemen
                .CurrentControlType()
                .map(|id| format!("ControlType_{:?}", id))
                .unwrap_or_else(|_| "Unknown".to_string())
        };

        Ok(BasicElementInfo {
            id,
            name,
            class_name,
            control_type,
        })
    }
}

impl UIInspector for InspectorService {
    fn inspect_element_at_point(&self, x: i32, y: i32) -> Result<DetailedElementInfo> {
        let point = POINT { x, y };

        let element = unsafe {
            self.native
                .automation()
                .ElementFromPoint(point)
                .map_err(|err| anyhow!("ElementFromPoint failed: {err:?}"))?
        };

        self.get_detailed_info(&element)
    }

    fn inspect_element_by_id(&self, element_id: &str) -> Result<DetailedElementInfo> {
        let element = self.native.get_element(element_id)?;
        self.get_detailed_info(&element)
    }

    fn get_focused_element(&self) -> Result<DetailedElementInfo> {
        let element = unsafe {
            self.native
                .automation()
                .GetFocusedElement()
                .map_err(|err| anyhow!("GetFocusedElement failed: {err:?}"))?
        };
        self.get_detailed_info(&element)
    }

    fn find_elements(
        &self,
        parent_id: Option<String>,
        query: &ElementQuery,
    ) -> Result<Vec<UIElementInfo>> {
        self.native.find_elements(parent_id, query)
    }

    fn find_element_by_selector(&self, selector: &ElementSelector) -> Result<Option<String>> {
        match selector.selector_type {
            SelectorType::AutomationId => {
                let mut query = ElementQuery::default();
                query.automation_id = Some(selector.value.clone());
                let elements = self.native.find_elements(None, &query)?;
                Ok(elements.first().map(|e| e.id.clone()))
            }
            SelectorType::Name => {
                let mut query = ElementQuery::default();
                query.name = Some(selector.value.clone());
                let elements = self.native.find_elements(None, &query)?;
                Ok(elements.first().map(|e| e.id.clone()))
            }
            SelectorType::ClassName => {
                let mut query = ElementQuery::default();
                query.class_name = Some(selector.value.clone());
                let elements = self.native.find_elements(None, &query)?;
                Ok(elements.first().map(|e| e.id.clone()))
            }
            SelectorType::Coordinates => {
                let parts: Vec<&str> = selector.value.split(',').collect();
                if parts.len() != 2 {
                    return Err(anyhow!("Invalid coordinate format: {}", selector.value));
                }
                let x: i32 = parts[0].trim().parse()?;
                let y: i32 = parts[1].trim().parse()?;
                let info = self.inspect_element_at_point(x, y)?;
                Ok(Some(info.id))
            }
            SelectorType::XPath => Err(anyhow!("XPath selectors not supported")),
        }
    }

    fn generate_selector(&self, element_id: &str) -> Result<Vec<ElementSelector>> {
        let element = self.native.get_element(element_id)?;
        let mut selectors = Vec::new();

        if let Some(automation_id) = read_bstr(|| unsafe { element.CurrentAutomationId().ok() }) {
            if !automation_id.is_empty() {
                selectors.push(ElementSelector {
                    selector_type: SelectorType::AutomationId,
                    value: automation_id,
                });
            }
        }

        if let Some(name) = read_bstr(|| unsafe { element.CurrentName().ok() }) {
            if !name.is_empty() {
                selectors.push(ElementSelector {
                    selector_type: SelectorType::Name,
                    value: name,
                });
            }
        }

        if let Some(class_name) = read_bstr(|| unsafe { element.CurrentClassName().ok() }) {
            if !class_name.is_empty() {
                selectors.push(ElementSelector {
                    selector_type: SelectorType::ClassName,
                    value: class_name,
                });
            }
        }

        if let Ok(Some(rect)) = self.native.bounding_rect(element_id) {
            let x = (rect.left + rect.width / 2.0).round() as i32;
            let y = (rect.top + rect.height / 2.0).round() as i32;
            selectors.push(ElementSelector {
                selector_type: SelectorType::Coordinates,
                value: format!("{},{}", x, y),
            });
        }

        Ok(selectors)
    }

    fn get_element_tree(
        &self,
        element_id: &str,
    ) -> Result<(Option<BasicElementInfo>, Vec<BasicElementInfo>)> {
        let element = self.native.get_element(element_id)?;

        let parent = self.get_parent(&element).ok();
        let children = self.get_children(&element).unwrap_or_default();

        Ok((parent, children))
    }
}
