use crate::config::NativeContracts;
use agiworkforce_protocol::account_cloud::{CloudConversationWorkspace, CloudWorkspaceSummary};
use gpui::{div, prelude::*, px, App, Context, Entity, SharedString, Window};
use gpui_component::{
    select::{SearchableVec, Select, SelectItem, SelectState},
    ActiveTheme, Sizable, Size,
};
use std::sync::Arc;

#[derive(Clone)]
pub struct WorkspaceOption {
    workspace: CloudWorkspaceSummary,
    contracts: Arc<NativeContracts>,
}

impl SelectItem for WorkspaceOption {
    type Value = String;
    fn title(&self) -> SharedString {
        match self.workspace.selector {
            CloudConversationWorkspace::Personal => self.workspace.name.clone().into(),
            CloudConversationWorkspace::Organization { .. } => {
                format!("{} · {}", self.workspace.name, guidance(&self.workspace)).into()
            }
        }
    }
    fn display_title(&self) -> Option<gpui::AnyElement> {
        Some(self.workspace.name.clone().into_any_element())
    }
    fn value(&self) -> &String {
        &self.workspace.id
    }
    fn matches(&self, query: &str) -> bool {
        let query = query.trim().to_lowercase();
        self.workspace.name.to_lowercase().contains(&query)
            || self.workspace.slug.to_lowercase().contains(&query)
    }
    fn render(&self, _: &mut Window, cx: &mut App) -> impl IntoElement {
        crate::native_controls::choice_row(
            self.workspace.name.clone(),
            guidance(&self.workspace),
            &self.contracts,
            cx,
        )
    }
}

pub fn guidance(workspace: &CloudWorkspaceSummary) -> String {
    match &workspace.selector {
        CloudConversationWorkspace::Personal => "Personal".to_string(),
        CloudConversationWorkspace::Organization { .. } => format!(
            "{}{}",
            workspace.slug,
            workspace
                .role
                .as_ref()
                .filter(|role| !role.trim().is_empty())
                .map(|role| format!(" ({role})"))
                .unwrap_or_default()
        ),
    }
}

pub type WorkspaceSelectState = SelectState<SearchableVec<WorkspaceOption>>;

pub fn state(
    choices: &[CloudWorkspaceSummary],
    selected: Option<&str>,
    contracts: Arc<NativeContracts>,
    window: &mut Window,
    cx: &mut Context<WorkspaceSelectState>,
) -> WorkspaceSelectState {
    let selected = selected
        .and_then(|id| choices.iter().position(|choice| choice.id == id))
        .map(gpui_component::IndexPath::new);
    let choices = choices
        .iter()
        .cloned()
        .map(|workspace| WorkspaceOption {
            workspace,
            contracts: contracts.clone(),
        })
        .collect::<Vec<_>>();
    SelectState::new(SearchableVec::new(choices), selected, window, cx).searchable(true)
}

pub fn control(
    state: &Entity<WorkspaceSelectState>,
    contracts: &NativeContracts,
    width: f32,
    disabled: bool,
) -> impl IntoElement {
    let width = (width - 2. * contracts.model_picker.viewport_margin)
        .min(contracts.model_picker.menu_width)
        .max(0.);
    Select::new(state)
        .id("cloud-workspace-select")
        .accessibility_label("Cloud workspace")
        .placeholder("Choose workspace")
        .search_placeholder("Search workspaces")
        .menu_width(px(width))
        .menu_max_h(px(contracts.model_picker.menu_max_height))
        .with_size(Size::Medium)
        .disabled(disabled)
        .w(px(width))
        .max_w_full()
        .empty(|_, cx| {
            div()
                .px_3()
                .py_4()
                .text_color(cx.theme().muted_foreground)
                .child("No workspaces match this search.")
        })
}
