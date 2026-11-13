use crate::config::{NativeContracts, Palette};
use gpui::{div, prelude::*, px, rgb, AnyElement, Div, Entity, Stateful};
use gpui_component::input::{Textarea, TextareaState};
use gpui_component::{Sizable, Size};

pub fn compact(width: f32, contracts: &NativeContracts) -> bool {
    width < contracts.frame.compact_breakpoint
}

pub fn composer(
    state: &Entity<TextareaState>,
    label: &'static str,
    disabled: bool,
    readonly: bool,
    action: Option<AnyElement>,
    contracts: &NativeContracts,
    palette: Palette,
) -> Stateful<Div> {
    div()
        .id("composer-frame")
        .w_full()
        .min_w_0()
        .max_w(px(contracts.frame.content_width))
        .min_h(px(contracts.frame.composer_min_height))
        .rounded(px(contracts.panel_radius))
        .border(px(contracts.stroke_width))
        .border_color(rgb(palette.secondary))
        .px(px(contracts.frame.control_gap))
        .py(px(contracts.frame.control_gap))
        .flex()
        .items_end()
        .gap(px(contracts.frame.control_gap))
        .child(
            Textarea::new(state)
                .with_size(Size::Small)
                .appearance(false)
                .bordered(false)
                .aria_label(label)
                .disabled(disabled)
                .readonly(readonly)
                .text_size(px(contracts.body_font_size))
                .line_height(px(contracts.body_line_height))
                .min_h(px(contracts.frame.sidebar_row_height))
                .flex_1()
                .min_w_0(),
        )
        .children(action)
}

pub fn footer(content: AnyElement, contracts: &NativeContracts) -> Stateful<Div> {
    div()
        .id("composer-footer")
        .w_full()
        .flex_none()
        .flex()
        .justify_center()
        .p(px(contracts.frame.viewport_gutter))
        .child(
            div()
                .w_full()
                .min_w_0()
                .max_w(px(contracts.frame.content_width))
                .child(content),
        )
}

pub fn header(
    title: String,
    menu: Option<AnyElement>,
    actions: Vec<AnyElement>,
    contracts: &NativeContracts,
) -> Stateful<Div> {
    div()
        .id("frame-header")
        .w_full()
        .h(px(contracts.frame.header_height))
        .flex_none()
        .px(px(contracts.frame.viewport_gutter))
        .gap(px(contracts.frame.control_gap))
        .flex()
        .items_center()
        .children(menu)
        .child(
            div()
                .flex_1()
                .min_w_0()
                .truncate()
                .child(gpui::text!(title)),
        )
        .children(actions)
}

pub fn main(header: AnyElement, content: AnyElement, footer: Option<AnyElement>) -> Stateful<Div> {
    div()
        .id("native-main")
        .h_full()
        .flex_1()
        .min_w_0()
        .min_h_0()
        .overflow_hidden()
        .flex()
        .flex_col()
        .child(header)
        .child(
            div()
                .id("native-content")
                .w_full()
                .flex_1()
                .min_h_0()
                .overflow_hidden()
                .child(content),
        )
        .children(footer)
}

pub fn layout(
    width: f32,
    navigation_open: bool,
    sidebar: AnyElement,
    main: AnyElement,
    contracts: &NativeContracts,
) -> Div {
    let small = compact(width, contracts);
    let root = div()
        .size_full()
        .min_w_0()
        .min_h_0()
        .flex()
        .overflow_hidden();
    if small && navigation_open {
        root.child(
            div()
                .id("compact-navigation")
                .role(gpui::Role::Dialog)
                .aria_label("Navigation")
                .w_full()
                .h_full()
                .child(sidebar),
        )
    } else if small {
        root.child(main)
    } else {
        root.child(sidebar).child(main)
    }
}
