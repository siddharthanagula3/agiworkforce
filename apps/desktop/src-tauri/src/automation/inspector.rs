use anyhow::Result;

use super::types::{
    BasicElementInfo, DetailedElementInfo, ElementQuery, ElementSelector, UIElementInfo,
};

pub trait UIInspector: Send + Sync {
    fn inspect_element_at_point(&self, x: i32, y: i32) -> Result<DetailedElementInfo>;

    fn inspect_element_by_id(&self, element_id: &str) -> Result<DetailedElementInfo>;

    fn get_focused_element(&self) -> Result<DetailedElementInfo>;

    fn find_elements(
        &self,
        parent_id: Option<String>,
        query: &ElementQuery,
    ) -> Result<Vec<UIElementInfo>>;

    fn find_element_by_selector(&self, selector: &ElementSelector) -> Result<Option<String>>;

    fn generate_selector(&self, element_id: &str) -> Result<Vec<ElementSelector>>;

    fn get_element_tree(
        &self,
        element_id: &str,
    ) -> Result<(Option<BasicElementInfo>, Vec<BasicElementInfo>)>;
}
