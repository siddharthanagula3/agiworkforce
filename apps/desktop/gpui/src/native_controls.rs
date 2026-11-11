use crate::config::{NativeContracts, Palette};
use gpui::{div, prelude::*, rgb, App, Context, SharedString, Window};
use gpui_component::ActiveTheme;

pub fn button<V: 'static>(
    id: impl Into<SharedString>,
    label: impl Into<SharedString>,
    handler: impl Fn(&mut V, &mut Window, &mut Context<V>) + Clone + 'static,
    contracts: &NativeContracts,
    palette: Palette,
    cx: &mut Context<V>,
) -> gpui::Stateful<gpui::Div> {
    let key_action = handler.clone();
    let label = label.into();
    let id = id.into();
    div()
        .id(id.clone())
        .accessibility_id(id)
        .role(gpui::Role::Button)
        .aria_label(label.clone())
        .tab_index(0)
        .cursor_pointer()
        .px_3()
        .py_2()
        .rounded_md()
        .border(gpui::px(contracts.stroke_width))
        .border_color(gpui::transparent_black())
        .hover(move |style| style.bg(rgb(palette.hover)))
        .focus(move |style| {
            style
                .bg(rgb(palette.hover))
                .border_color(rgb(palette.foreground))
        })
        .on_click(cx.listener(move |view, _, window, cx| handler(view, window, cx)))
        .on_key_down(
            cx.listener(move |view, event: &gpui::KeyDownEvent, window, cx| {
                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                    cx.stop_propagation();
                    key_action(view, window, cx);
                }
            }),
        )
        .child(label)
}

pub fn compact_button<V: 'static>(
    id: impl Into<SharedString>,
    label: impl Into<SharedString>,
    handler: impl Fn(&mut V, &mut Window, &mut Context<V>) + Clone + 'static,
    contracts: &NativeContracts,
    palette: Palette,
    cx: &mut Context<V>,
) -> gpui::Stateful<gpui::Div> {
    button(id, label, handler, contracts, palette, cx)
        .py_0()
        .h(gpui::px(contracts.frame.sidebar_row_height))
        .flex()
        .items_center()
        .text_size(gpui::px(contracts.frame.sidebar_font_size))
        .line_height(gpui::px(contracts.frame.sidebar_line_height))
}

pub fn choice_row(
    title: impl Into<SharedString>,
    guidance: impl Into<SharedString>,
    contracts: &NativeContracts,
    cx: &App,
) -> gpui::Div {
    let geometry = &contracts.model_picker;
    // The pinned Select adds Medium row padding outside the item content.
    div()
        .min_w_0()
        .w_full()
        .flex()
        .flex_col()
        .justify_center()
        .h(gpui::px(
            geometry.row_height - 2. * geometry.row_padding_block,
        ))
        .child(
            div()
                .min_w_0()
                .truncate()
                .text_size(gpui::px(geometry.label_font_size))
                .line_height(gpui::px(geometry.label_line_height))
                .child(gpui::text!(title.into())),
        )
        .child(
            div()
                .min_w_0()
                .truncate()
                .text_color(cx.theme().muted_foreground)
                .text_size(gpui::px(geometry.guidance_font_size))
                .line_height(gpui::px(geometry.guidance_line_height))
                .child(gpui::text!(guidance.into())),
        )
}
