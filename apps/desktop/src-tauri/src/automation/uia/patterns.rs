use super::*;
use serde::{Deserialize, Serialize};
use windows::Win32::UI::Accessibility::{
    IUIAutomationElement, IUIAutomationExpandCollapsePattern, IUIAutomationGridPattern,
    IUIAutomationInvokePattern, IUIAutomationScrollPattern, IUIAutomationSelectionItemPattern,
    IUIAutomationTablePattern, IUIAutomationTextPattern, IUIAutomationTogglePattern,
    IUIAutomationValuePattern, UIA_ExpandCollapsePatternId, UIA_GridPatternId, UIA_InvokePatternId,
    UIA_ScrollPatternId, UIA_SelectionItemPatternId, UIA_TablePatternId, UIA_TextPatternId,
    UIA_TogglePatternId, UIA_ValuePatternId,
};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PatternCapabilities {
    pub invoke: bool,
    pub value: bool,
    pub toggle: bool,
    pub text: bool,
    pub grid: bool,
    pub table: bool,
    pub scroll: bool,
    pub expand_collapse: bool,
    pub selection: bool,
}

impl PatternCapabilities {
    pub fn from_element(element: &IUIAutomationElement) -> PatternCapabilities {
        PatternCapabilities {
            invoke: get_invoke_pattern(element).is_some(),
            value: get_value_pattern(element).is_some(),
            toggle: get_toggle_pattern(element).is_some(),
            text: get_text_pattern(element).is_some(),
            grid: get_grid_pattern(element).is_some(),
            table: get_table_pattern(element).is_some(),
            scroll: get_scroll_pattern(element).is_some(),
            expand_collapse: get_expand_collapse_pattern(element).is_some(),
            selection: get_selection_item_pattern(element).is_some(),
        }
    }
}

pub(super) fn get_invoke_pattern(
    element: &IUIAutomationElement,
) -> Option<IUIAutomationInvokePattern> {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId)
            .ok()
    }
}

pub(super) fn get_value_pattern(
    element: &IUIAutomationElement,
) -> Option<IUIAutomationValuePattern> {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
            .ok()
    }
}

pub(super) fn get_toggle_pattern(
    element: &IUIAutomationElement,
) -> Option<IUIAutomationTogglePattern> {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationTogglePattern>(UIA_TogglePatternId)
            .ok()
    }
}

pub(super) fn get_selection_item_pattern(
    element: &IUIAutomationElement,
) -> Option<IUIAutomationSelectionItemPattern> {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(UIA_SelectionItemPatternId)
            .ok()
    }
}

pub(super) fn get_text_pattern(element: &IUIAutomationElement) -> Option<IUIAutomationTextPattern> {
    unsafe {
        element
            .GetCurrentPattern(UIA_TextPatternId)
            .ok()
            .and_then(|unknown| unknown.cast::<IUIAutomationTextPattern>().ok())
    }
}

pub(super) fn get_grid_pattern(element: &IUIAutomationElement) -> Option<IUIAutomationGridPattern> {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationGridPattern>(UIA_GridPatternId)
            .ok()
    }
}

pub(super) fn get_table_pattern(
    element: &IUIAutomationElement,
) -> Option<IUIAutomationTablePattern> {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationTablePattern>(UIA_TablePatternId)
            .ok()
    }
}

pub(super) fn get_scroll_pattern(
    element: &IUIAutomationElement,
) -> Option<IUIAutomationScrollPattern> {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationScrollPattern>(UIA_ScrollPatternId)
            .ok()
    }
}

pub(super) fn get_expand_collapse_pattern(
    element: &IUIAutomationElement,
) -> Option<IUIAutomationExpandCollapsePattern> {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationExpandCollapsePattern>(UIA_ExpandCollapsePatternId)
            .ok()
    }
}
