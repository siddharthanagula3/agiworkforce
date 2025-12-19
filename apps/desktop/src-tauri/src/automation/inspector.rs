use anyhow::Result;

use super::types::{
    BasicElementInfo, DetailedElementInfo, ElementQuery, ElementSelector, UIElementInfo,
};

/// Platform-agnostic UI inspection interface.
///
/// Implementations are expected to pull live data from the OS accessibility tree
/// (Windows UIA, macOS AX, etc.).
pub trait UIInspector: Send + Sync {
    /// Inspect the UI element at global screen coordinates.
    fn inspect_element_at_point(&self, x: i32, y: i32) -> Result<DetailedElementInfo>;

    /// Inspect a previously returned element by its opaque ID.
    fn inspect_element_by_id(&self, element_id: &str) -> Result<DetailedElementInfo>;

    /// Return the currently focused UI element.
    fn get_focused_element(&self) -> Result<DetailedElementInfo>;

    /// Find elements matching a query.
    fn find_elements(
        &self,
        parent_id: Option<String>,
        query: &ElementQuery,
    ) -> Result<Vec<UIElementInfo>>;

    /// Find a single element by a selector (best-effort) and return its ID.
    fn find_element_by_selector(&self, selector: &ElementSelector) -> Result<Option<String>>;

    /// Generate a set of selectors for an element (best → worst).
    fn generate_selector(&self, element_id: &str) -> Result<Vec<ElementSelector>>;

    /// Return a lightweight parent + children view for an element.
    fn get_element_tree(
        &self,
        element_id: &str,
    ) -> Result<(Option<BasicElementInfo>, Vec<BasicElementInfo>)>;
}
