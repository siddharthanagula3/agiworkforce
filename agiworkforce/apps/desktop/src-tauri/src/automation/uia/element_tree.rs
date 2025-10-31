use super::*;
use windows::Win32::UI::Accessibility::{
    IUIAutomationCondition, TreeScope_Children, TreeScope_Subtree, UIA_AutomationIdPropertyId,
    UIA_ButtonControlTypeId, UIA_CheckBoxControlTypeId, UIA_ClassNamePropertyId,
    UIA_ComboBoxControlTypeId, UIA_ControlTypePropertyId, UIA_DataItemControlTypeId,
    UIA_EditControlTypeId, UIA_ListItemControlTypeId, UIA_MenuItemControlTypeId,
    UIA_NamePropertyId, UIA_TextControlTypeId, UIA_WindowControlTypeId, UIA_CONTROLTYPE_ID,
    UIA_PROPERTY_ID,
};

#[derive(Debug, Serialize, Clone)]
pub struct BoundingRectangle {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Serialize, Clone)]
pub struct UIElementInfo {
    pub id: String,
    pub name: String,
    pub class_name: String,
    pub control_type: String,
    pub bounding_rect: Option<BoundingRectangle>,
}

#[derive(Debug, Deserialize)]
pub struct ElementQuery {
    #[serde(default)]
    pub window: Option<String>,
    #[serde(default)]
    pub window_class: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub class_name: Option<String>,
    #[serde(default)]
    pub automation_id: Option<String>,
    #[serde(default)]
    pub control_type: Option<String>,
    #[serde(default)]
    pub max_results: Option<usize>,
}

impl UIAutomationService {
    pub fn list_windows(&self) -> Result<Vec<UIElementInfo>> {
        let desktop = self.root_element()?;
        let true_condition =
            unsafe { self.automation().CreateTrueCondition() }.map_err(|err| anyhow!("{err:?}"))?;
        let array = unsafe { desktop.FindAll(TreeScope_Children, &true_condition) }
            .map_err(|err| anyhow!("FindAll: {err:?}"))?;

        let count = unsafe { array.Length() }
            .map_err(|err| anyhow!("Failed to read array length: {err:?}"))?;

        let mut results = Vec::new();
        for index in 0..count {
            let element =
                unsafe { array.GetElement(index) }.map_err(|err| anyhow!("GetElement: {err:?}"))?;
            results.push(self.describe_element(&element)?);
        }

        Ok(results)
    }

    pub fn find_elements(
        &self,
        parent_id: Option<String>,
        query: &ElementQuery,
    ) -> Result<Vec<UIElementInfo>> {
        let parent = if let Some(parent_id) = parent_id {
            self.get_element(&parent_id)?
        } else if let Some(window_name) = &query.window {
            self.find_window(window_name.as_str(), query.window_class.as_deref())?
                .ok_or_else(|| anyhow!("Window '{window_name}' not found"))?
        } else {
            self.root_element()?
        };

        let condition = self.build_condition(query)?;
        let collection = unsafe { parent.FindAll(TreeScope_Subtree, &condition) }
            .map_err(|err| anyhow!("FindAll: {err:?}"))?;

        let count = unsafe { collection.Length() }
            .map_err(|err| anyhow!("Failed to read collection length: {err:?}"))?;

        let max_results = query.max_results.unwrap_or(50);
        let mut results = Vec::new();

        for index in 0..count {
            if results.len() >= max_results {
                break;
            }
            let element = unsafe { collection.GetElement(index) }
                .map_err(|err| anyhow!("GetElement: {err:?}"))?;
            results.push(self.describe_element(&element)?);
        }

        Ok(results)
    }

    pub(super) fn extract_bounds(
        &self,
        element: &IUIAutomationElement,
    ) -> Result<Option<BoundingRectangle>> {
        let rect =
            unsafe { element.CurrentBoundingRectangle() }.map_err(|err| anyhow!("{err:?}"))?;
        if rect.left == 0 && rect.right == 0 && rect.top == 0 && rect.bottom == 0 {
            return Ok(None);
        }
        let left = rect.left as f64;
        let top = rect.top as f64;
        let right = rect.right as f64;
        let bottom = rect.bottom as f64;
        Ok(Some(BoundingRectangle {
            left,
            top,
            width: (right - left).max(0.0),
            height: (bottom - top).max(0.0),
        }))
    }

    fn describe_element(&self, element: &IUIAutomationElement) -> Result<UIElementInfo> {
        let id = self.register_element(element)?;
        let name = read_bstr(|| unsafe { element.CurrentName() }).unwrap_or_default();
        let class_name =
            read_bstr(|| unsafe { element.CurrentClassName() }).unwrap_or_else(|| "Unknown".into());
        let control_type_id = unsafe { element.CurrentControlType() }
            .map_err(|err| anyhow!("CurrentControlType: {err:?}"))?;
        let control_type = self.control_type_to_string(control_type_id);
        let bounding_rect = self.extract_bounds(element)?;

        Ok(UIElementInfo {
            id,
            name,
            class_name,
            control_type,
            bounding_rect,
        })
    }

    fn find_window(
        &self,
        title: &str,
        class_name: Option<&str>,
    ) -> Result<Option<IUIAutomationElement>> {
        let root = self.root_element()?;
        let mut conditions = Vec::new();

        let name_condition = self.create_property_condition(UIA_NamePropertyId, title)?;
        conditions.push(name_condition);

        if let Some(class) = class_name {
            let class_condition = self.create_property_condition(UIA_ClassNamePropertyId, class)?;
            conditions.push(class_condition);
        }

        let condition = self.combine_conditions(&conditions, true)?;
        let element = unsafe { root.FindFirst(TreeScope_Children, &condition) }
            .map_err(|err| anyhow!("{err:?}"))?;
        Ok(if element.as_raw().is_null() {
            None
        } else {
            Some(element)
        })
    }

    fn build_condition(&self, query: &ElementQuery) -> Result<IUIAutomationCondition> {
        let mut conditions = Vec::new();

        if let Some(name) = &query.name {
            conditions.push(self.create_property_condition(UIA_NamePropertyId, name)?);
        }

        if let Some(class_name) = &query.class_name {
            conditions.push(self.create_property_condition(UIA_ClassNamePropertyId, class_name)?);
        }

        if let Some(automation_id) = &query.automation_id {
            conditions
                .push(self.create_property_condition(UIA_AutomationIdPropertyId, automation_id)?);
        }

        if let Some(control_type) = &query.control_type {
            if let Some(control_type_id) = self.control_type_by_name(control_type) {
                let variant = VARIANT::from(control_type_id.0);
                let condition = unsafe {
                    self.automation
                        .CreatePropertyCondition(UIA_ControlTypePropertyId, &variant)
                }
                .map_err(|err| anyhow!("CreatePropertyCondition: {err:?}"))?;
                conditions.push(condition);
            }
        }

        if conditions.is_empty() {
            unsafe { self.automation.CreateTrueCondition() }.map_err(|err| anyhow!("{err:?}"))
        } else {
            self.combine_conditions(&conditions, true)
        }
    }

    fn create_property_condition(
        &self,
        property_id: UIA_PROPERTY_ID,
        value: &str,
    ) -> Result<IUIAutomationCondition> {
        let variant = VARIANT::from(BSTR::from(value));
        unsafe {
            self.automation
                .CreatePropertyCondition(property_id, &variant)
        }
        .map_err(|err| anyhow!("CreatePropertyCondition: {err:?}"))
    }

    fn combine_conditions(
        &self,
        conditions: &[IUIAutomationCondition],
        and: bool,
    ) -> Result<IUIAutomationCondition> {
        if conditions.len() == 1 {
            return Ok(conditions[0].clone());
        }

        let mut combined = conditions[0].clone();
        for condition in &conditions[1..] {
            combined = if and {
                unsafe { self.automation.CreateAndCondition(&combined, condition) }
            } else {
                unsafe { self.automation.CreateOrCondition(&combined, condition) }
            }
            .map_err(|err| anyhow!("Combine conditions: {err:?}"))?;
        }
        Ok(combined)
    }

    fn control_type_by_name(&self, name: &str) -> Option<UIA_CONTROLTYPE_ID> {
        let normalized = name.trim().to_lowercase();
        match normalized.as_str() {
            "button" => Some(UIA_ButtonControlTypeId),
            "edit" | "textbox" | "text box" => Some(UIA_EditControlTypeId),
            "checkbox" | "check box" => Some(UIA_CheckBoxControlTypeId),
            "combo" | "combobox" | "dropdown" => Some(UIA_ComboBoxControlTypeId),
            "listitem" | "list item" => Some(UIA_ListItemControlTypeId),
            "menuitem" | "menu item" => Some(UIA_MenuItemControlTypeId),
            "dataitem" | "data item" => Some(UIA_DataItemControlTypeId),
            "text" | "label" => Some(UIA_TextControlTypeId),
            "window" => Some(UIA_WindowControlTypeId),
            _ => None,
        }
    }

    fn control_type_to_string(&self, control_type: UIA_CONTROLTYPE_ID) -> String {
        match control_type {
            UIA_ButtonControlTypeId => "Button".to_string(),
            UIA_EditControlTypeId => "Edit".to_string(),
            UIA_TextControlTypeId => "Text".to_string(),
            UIA_CheckBoxControlTypeId => "CheckBox".to_string(),
            UIA_ListItemControlTypeId => "ListItem".to_string(),
            UIA_ComboBoxControlTypeId => "ComboBox".to_string(),
            UIA_MenuItemControlTypeId => "MenuItem".to_string(),
            UIA_DataItemControlTypeId => "DataItem".to_string(),
            UIA_WindowControlTypeId => "Window".to_string(),
            other => format!("Control({})", other.0),
        }
    }
}
