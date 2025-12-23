use super::*;
use crate::automation::uia::patterns::{
    get_expand_collapse_pattern, get_grid_pattern, get_invoke_pattern, get_scroll_pattern,
    get_selection_item_pattern, get_text_pattern, get_toggle_pattern, get_value_pattern,
    PatternCapabilities,
};
use windows::Win32::UI::Accessibility::{
    ExpandCollapseState_Collapsed, ExpandCollapseState_Expanded, ScrollAmount_LargeIncrement,
    ScrollAmount_NoAmount,
};
use windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow;

impl UIAutomationService {
    pub fn check_patterns(&self, element_id: &str) -> Result<PatternCapabilities> {
        let element = self.get_element(element_id)?;
        Ok(PatternCapabilities::from_element(&element))
    }

    pub fn invoke(&self, element_id: &str) -> Result<()> {
        let element = self.get_element(element_id)?;
        if let Some(pattern) = get_invoke_pattern(&element) {
            unsafe { pattern.Invoke() }.map_err(|err| anyhow!("Invoke failed: {err:?}"))?;
            return Ok(());
        }

        if let Some(pattern) = get_selection_item_pattern(&element) {
            unsafe { pattern.Select() }.map_err(|err| anyhow!("Select failed: {err:?}"))?;
            return Ok(());
        }

        Err(anyhow!(
            "Element {element_id} does not support Invoke or SelectionItem patterns"
        ))
    }

    pub fn set_value(&self, element_id: &str, value: &str) -> Result<()> {
        let element = self.get_element(element_id)?;
        if let Some(pattern) = get_value_pattern(&element) {
            unsafe { pattern.SetValue(&BSTR::from(value)) }
                .map_err(|err| anyhow!("SetValue failed: {err:?}"))?;
            return Ok(());
        }

        Err(anyhow!("Element does not support ValuePattern"))
    }

    pub fn get_value(&self, element_id: &str) -> Result<String> {
        let element = self.get_element(element_id)?;

        if let Some(pattern) = get_value_pattern(&element) {
            let value = unsafe { pattern.CurrentValue() }
                .map_err(|err| anyhow!("CurrentValue failed: {err:?}"))?;
            return Ok(value.to_string());
        }

        if let Some(pattern) = get_text_pattern(&element) {
            let range = unsafe { pattern.DocumentRange() }
                .map_err(|err| anyhow!("DocumentRange: {err:?}"))?;
            let text =
                unsafe { range.GetText(-1) }.map_err(|err| anyhow!("GetText failed: {err:?}"))?;
            return Ok(text.to_string());
        }

        Err(anyhow!(
            "Element {element_id} does not provide text content"
        ))
    }

    pub fn toggle(&self, element_id: &str) -> Result<()> {
        let element = self.get_element(element_id)?;
        if let Some(pattern) = get_toggle_pattern(&element) {
            unsafe { pattern.Toggle() }.map_err(|err| anyhow!("Toggle failed: {err:?}"))?;
            return Ok(());
        }
        Err(anyhow!("Element does not support TogglePattern"))
    }

    pub fn bounding_rect(&self, element_id: &str) -> Result<Option<BoundingRectangle>> {
        let element = self.get_element(element_id)?;
        self.extract_bounds(&element)
    }

    pub fn set_focus(&self, element_id: &str) -> Result<()> {
        let element = self.get_element(element_id)?;

        unsafe { element.SetFocus() }.map_err(|err| anyhow!("SetFocus failed: {err:?}"))
    }

    pub fn focus_window(&self, element_id: &str) -> Result<()> {
        let element = self.get_element(element_id)?;
        let hwnd = unsafe { element.CurrentNativeWindowHandle() }
            .map_err(|err| anyhow!("CurrentNativeWindowHandle: {err:?}"))?;
        unsafe { SetForegroundWindow(hwnd) }
            .ok()
            .map_err(|err| anyhow!("SetForegroundWindow failed: {err:?}"))
    }

    pub fn get_table_cell(&self, element_id: &str, row: i32, column: i32) -> Result<String> {
        let element = self.get_element(element_id)?;

        if let Some(grid_pattern) = get_grid_pattern(&element) {
            let cell = unsafe { grid_pattern.GetItem(row, column) }
                .map_err(|err| anyhow!("GetItem failed: {err:?}"))?;

            if let Some(value_pattern) = get_value_pattern(&cell) {
                let value = unsafe { value_pattern.CurrentValue() }
                    .map_err(|err| anyhow!("CurrentValue failed: {err:?}"))?;
                return Ok(value.to_string());
            }

            if let Some(text_pattern) = get_text_pattern(&cell) {
                let range = unsafe { text_pattern.DocumentRange() }
                    .map_err(|err| anyhow!("DocumentRange failed: {err:?}"))?;
                let text = unsafe { range.GetText(-1) }
                    .map_err(|err| anyhow!("GetText failed: {err:?}"))?;
                return Ok(text.to_string());
            }

            let name = unsafe { cell.CurrentName() }
                .map_err(|err| anyhow!("CurrentName failed: {err:?}"))?;
            return Ok(name.to_string());
        }

        Err(anyhow!(
            "Element {element_id} does not support Grid or Table pattern"
        ))
    }

    pub fn scroll_to_element(&self, element_id: &str) -> Result<()> {
        let element = self.get_element(element_id)?;

        if let Ok(pattern) = unsafe {
            element.GetCurrentPatternAs::<windows::Win32::UI::Accessibility::IUIAutomationScrollItemPattern>(
                windows::Win32::UI::Accessibility::UIA_ScrollItemPatternId,
            )
        } {
            unsafe { pattern.ScrollIntoView() }
                .map_err(|err| anyhow!("ScrollIntoView failed: {err:?}"))?;
            return Ok(());
        }

        let mut current = element.clone();
        for _ in 0..10 {
            let parent_result = unsafe {
                self.automation()
                    .ControlViewWalker()
                    .map_err(|err| anyhow!("ControlViewWalker: {err:?}"))?
                    .GetParentElement(&current)
            };

            let parent = match parent_result {
                Ok(p) => p,
                Err(_) => break,
            };

            if let Some(scroll_pattern) = get_scroll_pattern(&parent) {
                if let Some(_bounds) = self.extract_bounds(&element)? {
                    let can_scroll_vertical =
                        unsafe { scroll_pattern.CurrentVerticallyScrollable() }
                            .unwrap_or(windows::Win32::Foundation::BOOL(0))
                            .as_bool();

                    if can_scroll_vertical {
                        let _ = unsafe {
                            scroll_pattern
                                .Scroll(ScrollAmount_NoAmount, ScrollAmount_LargeIncrement)
                        };
                        return Ok(());
                    }
                }
            }

            current = parent;
        }

        Err(anyhow!(
            "Element {element_id} or its parents do not support scrolling patterns"
        ))
    }

    pub fn expand_tree_node(&self, element_id: &str, expand: bool) -> Result<()> {
        let element = self.get_element(element_id)?;

        if let Some(pattern) = get_expand_collapse_pattern(&element) {
            let current_state = unsafe { pattern.CurrentExpandCollapseState() }
                .map_err(|err| anyhow!("CurrentExpandCollapseState failed: {err:?}"))?;

            if expand && current_state == ExpandCollapseState_Collapsed {
                unsafe { pattern.Expand() }.map_err(|err| anyhow!("Expand failed: {err:?}"))?;
            } else if !expand && current_state == ExpandCollapseState_Expanded {
                unsafe { pattern.Collapse() }.map_err(|err| anyhow!("Collapse failed: {err:?}"))?;
            }

            return Ok(());
        }

        Err(anyhow!(
            "Element {element_id} does not support ExpandCollapse pattern"
        ))
    }

    pub fn get_grid_row_count(&self, element_id: &str) -> Result<i32> {
        let element = self.get_element(element_id)?;

        if let Some(grid_pattern) = get_grid_pattern(&element) {
            let count = unsafe { grid_pattern.CurrentRowCount() }
                .map_err(|err| anyhow!("CurrentRowCount failed: {err:?}"))?;
            return Ok(count);
        }

        Err(anyhow!(
            "Element {element_id} does not support Grid pattern"
        ))
    }

    pub fn get_grid_column_count(&self, element_id: &str) -> Result<i32> {
        let element = self.get_element(element_id)?;

        if let Some(grid_pattern) = get_grid_pattern(&element) {
            let count = unsafe { grid_pattern.CurrentColumnCount() }
                .map_err(|err| anyhow!("CurrentColumnCount failed: {err:?}"))?;
            return Ok(count);
        }

        Err(anyhow!(
            "Element {element_id} does not support Grid pattern"
        ))
    }
}
