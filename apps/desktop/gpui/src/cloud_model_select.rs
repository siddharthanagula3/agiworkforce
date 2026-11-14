use std::sync::Arc;

use agiworkforce_protocol::account_cloud::CloudModelSummary;
use gpui::{div, prelude::*, px, App, Context, Entity, SharedString, Window};
use gpui_component::{
    select::{SearchableVec, Select, SelectItem, SelectState},
    ActiveTheme, Sizable, Size,
};

use crate::config::NativeContracts;

#[derive(Clone)]
pub struct ModelOption {
    model: CloudModelSummary,
    contracts: Arc<NativeContracts>,
}

impl ModelOption {
    fn guidance(&self) -> String {
        if self.model.temporarily_unavailable {
            "Temporarily unavailable".into()
        } else if !self.model.admitted {
            self.model
                .minimum_plan_label
                .as_ref()
                .map(|label| format!("Requires {label}"))
                .unwrap_or_else(|| "Unavailable for this account".into())
        } else {
            self.model.developer_label.clone()
        }
    }
}

impl SelectItem for ModelOption {
    type Value = String;

    fn title(&self) -> SharedString {
        format!("{} · {}", self.model.display_name, self.guidance()).into()
    }

    fn display_title(&self) -> Option<gpui::AnyElement> {
        Some(self.model.display_name.clone().into_any_element())
    }

    fn value(&self) -> &String {
        &self.model.id
    }

    fn disabled(&self) -> bool {
        !self.model.selectable()
    }

    fn matches(&self, query: &str) -> bool {
        let query = query.trim().to_lowercase();
        self.model.display_name.to_lowercase().contains(&query)
            || self.model.developer_label.to_lowercase().contains(&query)
    }

    fn render(&self, _: &mut Window, cx: &mut App) -> impl IntoElement {
        crate::native_controls::choice_row(
            self.model.display_name.clone(),
            self.guidance(),
            &self.contracts,
            cx,
        )
    }
}

pub type ModelSelectState = SelectState<SearchableVec<ModelOption>>;

pub fn state(
    models: &[CloudModelSummary],
    selected: Option<&str>,
    contracts: Arc<NativeContracts>,
    window: &mut Window,
    cx: &mut Context<ModelSelectState>,
) -> ModelSelectState {
    let items = models
        .iter()
        .cloned()
        .map(|model| ModelOption {
            model,
            contracts: contracts.clone(),
        })
        .collect::<Vec<_>>();
    let selected = selected
        .and_then(|id| models.iter().position(|model| model.id == id))
        .map(gpui_component::IndexPath::new);
    SelectState::new(SearchableVec::new(items), selected, window, cx).searchable(true)
}

pub fn control(
    state: &Entity<ModelSelectState>,
    contracts: &NativeContracts,
    available_width: f32,
    disabled: bool,
    unavailable_selection: bool,
) -> impl IntoElement {
    let width = (available_width - 2. * contracts.model_picker.viewport_margin)
        .min(contracts.model_picker.menu_width)
        .max(0.);
    Select::new(state)
        .id("cloud-model-select")
        .accessibility_label(if unavailable_selection {
            "Cloud model; selected model unavailable"
        } else {
            "Cloud model"
        })
        .placeholder(if unavailable_selection {
            "Selected model unavailable"
        } else {
            "Choose model"
        })
        .search_placeholder("Search models")
        .empty(|_, cx| {
            div()
                .px_3()
                .py_4()
                .text_color(cx.theme().muted_foreground)
                .child("No models match this search.")
        })
        .menu_width(px(width))
        .menu_max_h(px(contracts.model_picker.menu_max_height))
        .disabled(disabled)
        .with_size(Size::Medium)
        .w(px(width))
        .max_w_full()
}

pub fn row(
    state: &Entity<ModelSelectState>,
    contracts: &NativeContracts,
    available_width: f32,
    disabled: bool,
    unavailable_selection: bool,
    refresh: Option<gpui::AnyElement>,
) -> gpui::Div {
    div()
        .w_full()
        .min_w_0()
        .flex()
        .items_center()
        .gap_2()
        .text_size(px(contracts.model_picker.label_font_size))
        .line_height(px(contracts.model_picker.label_line_height))
        .child(div().min_w_0().flex_1().child(control(
            state,
            contracts,
            available_width,
            disabled,
            unavailable_selection,
        )))
        .when_some(refresh, gpui::ParentElement::child)
}
