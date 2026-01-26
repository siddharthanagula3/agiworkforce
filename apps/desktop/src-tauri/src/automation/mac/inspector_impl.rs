use super::service::{AXElement, MacAutomationService};
use crate::automation::inspector::UIInspector;
use crate::automation::types::{
    BasicElementInfo, DetailedElementInfo, ElementQuery, ElementSelector, SelectorType,
    UIElementInfo,
};
use anyhow::Result;
use std::collections::HashMap;

pub struct InspectorService {
    service: MacAutomationService,
}

impl InspectorService {
    pub fn new() -> Result<Self> {
        Ok(Self {
            service: MacAutomationService::new()?,
        })
    }

    fn get_detailed_info(&self, element: &AXElement) -> Result<DetailedElementInfo> {
        let id = element.with_element(|ptr| self.service.register_element(ptr))?;

        let name = "Mac Element".to_string();
        let control_type = "AXElement".to_string();
        let class_name = "AXUIElement".to_string();

        let mut properties = HashMap::new();
        properties.insert("name".to_string(), serde_json::json!(name));

        Ok(DetailedElementInfo {
            id: id.clone(),
            name,
            class_name,
            control_type,
            bounding_rect: self.service.bounding_rect(&id)?,
            properties,
            automation_id: None,
            parent: None,
            children: vec![],
            is_enabled: true,
            is_offscreen: false,
            has_keyboard_focus: false,
        })
    }
}

impl UIInspector for InspectorService {
    fn inspect_element_at_point(&self, x: i32, y: i32) -> Result<DetailedElementInfo> {
        let element = self.service.element_at_point(x as f32, y as f32)?;
        self.get_detailed_info(&element)
    }

    fn inspect_element_by_id(&self, element_id: &str) -> Result<DetailedElementInfo> {
        let element = self.service.get_element(element_id)?;
        self.get_detailed_info(&element)
    }

    fn get_focused_element(&self) -> Result<DetailedElementInfo> {
        let element = self.service.focused_element()?;
        self.get_detailed_info(&element)
    }

    fn find_elements(
        &self,
        _parent_id: Option<String>,
        _query: &ElementQuery,
    ) -> Result<Vec<UIElementInfo>> {
        Ok(vec![])
    }

    fn find_element_by_selector(&self, selector: &ElementSelector) -> Result<Option<String>> {
        if selector.selector_type == SelectorType::Coordinates {
            let parts: Vec<&str> = selector.value.split(',').collect();
            if parts.len() == 2 {
                if let (Ok(x), Ok(y)) = (
                    parts[0].trim().parse::<i32>(),
                    parts[1].trim().parse::<i32>(),
                ) {
                    let info = self.inspect_element_at_point(x, y)?;
                    return Ok(Some(info.id));
                }
            }
        }
        Ok(None)
    }

    fn generate_selector(&self, element_id: &str) -> Result<Vec<ElementSelector>> {
        let mut selectors = Vec::new();

        if let Ok(Some(rect)) = self.service.bounding_rect(element_id) {
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
        _element_id: &str,
    ) -> Result<(Option<BasicElementInfo>, Vec<BasicElementInfo>)> {
        Ok((None, vec![]))
    }
}
