use super::*;
use windows::Win32::UI::Accessibility::{
    IUIAutomationElement, IUIAutomationExpandCollapsePattern, IUIAutomationGridPattern,
    IUIAutomationInvokePattern, IUIAutomationScrollPattern, IUIAutomationSelectionItemPattern,
    IUIAutomationTablePattern, IUIAutomationTextPattern, IUIAutomationTogglePattern,
    IUIAutomationValuePattern, UIA_ExpandCollapsePatternId, UIA_GridPatternId, UIA_InvokePatternId,
    UIA_ScrollPatternId, UIA_SelectionItemPatternId, UIA_TablePatternId, UIA_TextPatternId,
    UIA_TogglePatternId, UIA_ValuePatternId,
};

#[derive(Debug, Clone, Copy, Serialize)]
pub struct PatternCapabilities {
    pub invoke: bool,
    pub value: bool,
    pub toggle: bool,
    pub text: bool,
    pub grid: bool,
    pub table: bool,
    pub scroll: bool,
    pub expand_collapse: bool,
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

/// Get the Grid pattern for the element.
///
/// The Grid pattern is used for controls that act as containers for a collection
/// of child elements organized in a two-dimensional logical coordinate system
/// (rows and columns). Examples include:
/// - Spreadsheet applications (Excel)
/// - Data grids
/// - Calendars
pub(super) fn get_grid_pattern(element: &IUIAutomationElement) -> Option<IUIAutomationGridPattern> {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationGridPattern>(UIA_GridPatternId)
            .ok()
    }
}

/// Get the Table pattern for the element.
///
/// The Table pattern extends the Grid pattern and provides additional functionality
/// for tables with row/column headers. Supported by:
/// - Excel spreadsheets
/// - Data tables with headers
/// - Grid controls with header information
pub(super) fn get_table_pattern(
    element: &IUIAutomationElement,
) -> Option<IUIAutomationTablePattern> {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationTablePattern>(UIA_TablePatternId)
            .ok()
    }
}

/// Get the Scroll pattern for the element.
///
/// The Scroll pattern is used for controls that can scroll. This includes:
/// - Scrollable containers
/// - List boxes
/// - Tree views
/// - Document viewers
///
/// Note: Many applications support this pattern for scrolling elements into view.
pub(super) fn get_scroll_pattern(
    element: &IUIAutomationElement,
) -> Option<IUIAutomationScrollPattern> {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationScrollPattern>(UIA_ScrollPatternId)
            .ok()
    }
}

/// Get the ExpandCollapse pattern for the element.
///
/// The ExpandCollapse pattern is used for controls that can expand or collapse.
/// Common examples include:
/// - Tree view nodes
/// - Menu items with submenus
/// - Combo boxes
/// - Accordion controls
pub(super) fn get_expand_collapse_pattern(
    element: &IUIAutomationElement,
) -> Option<IUIAutomationExpandCollapsePattern> {
    unsafe {
        element
            .GetCurrentPatternAs::<IUIAutomationExpandCollapsePattern>(UIA_ExpandCollapsePatternId)
            .ok()
    }
}
