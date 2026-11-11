use crate::{
    config::{NativeContracts, Palette},
    drafts::DraftState,
    native_controls,
};
use agiworkforce_protocol::account_cloud::CloudConversationDraft;
use gpui::{div, prelude::*, px, rgb, Context, Focusable, Window};
use gpui_component::{
    input::{Textarea, TextareaState},
    Sizable, Size,
};

#[derive(Clone)]
pub enum DraftAction {
    Save,
    Copy(CloudConversationDraft),
    Resolve(CloudConversationDraft, bool),
}

pub fn controls<V: 'static>(
    state: &DraftState,
    enabled: bool,
    contracts: &NativeContracts,
    palette: Palette,
    handler: impl Fn(&mut V, DraftAction, &mut Window, &mut Context<V>) + Clone + 'static,
    window: &mut Window,
    cx: &mut Context<V>,
) -> gpui::Div {
    let button =
        |id: &'static str, label: &'static str, action: DraftAction, cx: &mut Context<V>| {
            let handler = handler.clone();
            native_controls::compact_button(
                id,
                label,
                move |view, window, cx| handler(view, action.clone(), window, cx),
                contracts,
                palette,
                cx,
            )
        };
    let mut panel = div()
        .w_full()
        .min_w_0()
        .flex()
        .flex_col()
        .gap_2()
        .text_size(px(contracts.frame.sidebar_font_size))
        .line_height(px(contracts.frame.sidebar_line_height));
    if state.operation.is_some() {
        return panel.child(gpui::text!("Saving draft…"));
    }
    if let Some(error) = &state.error {
        panel = panel.child(gpui::text!(error.clone()));
    }
    if let Some(conflict) = &state.conflict {
        let review = window.use_keyed_state("cloud-saved-draft-source", cx, |window, cx| {
            TextareaState::new(window, cx)
                .placeholder("The saved draft is empty.")
                .auto_grow(1, 4)
        });
        if review.read(cx).value().as_str() != conflict.text {
            review.update(cx, |input, cx| {
                input.set_value(conflict.text.clone(), window, cx)
            });
        }
        panel = panel.child(gpui::text!("Draft changed elsewhere")).child(
            div()
                .id("saved-draft-review")
                .role(gpui::Role::Group)
                .aria_label("Saved draft")
                .track_focus(&review.read(cx).focus_handle(cx))
                .border(px(contracts.stroke_width))
                .border_color(gpui::transparent_black())
                .focus(move |style| style.border_color(rgb(palette.foreground)))
                .w_full()
                .min_w_0()
                .max_h(px(contracts.body_line_height * 4.))
                .overflow_y_scroll()
                .p(px(contracts.frame.control_gap))
                .bg(rgb(palette.code))
                .child(
                    Textarea::new(&review)
                        .aria_label("Saved draft")
                        .readonly(true)
                        .appearance(false)
                        .bordered(false)
                        .with_size(Size::Small)
                        .w_full()
                        .min_w_0()
                        .text_size(px(contracts.frame.sidebar_font_size))
                        .line_height(px(contracts.frame.sidebar_line_height)),
                ),
        );
        let mut actions = div().flex().flex_wrap().gap_2().child(button(
            "copy-saved-cloud-draft",
            "Copy saved draft",
            DraftAction::Copy(conflict.clone()),
            cx,
        ));
        if enabled {
            actions = actions
                .child(button(
                    "keep-local-cloud-draft",
                    "Keep my draft",
                    DraftAction::Resolve(conflict.clone(), true),
                    cx,
                ))
                .child(button(
                    "use-saved-cloud-draft",
                    "Use saved draft",
                    DraftAction::Resolve(conflict.clone(), false),
                    cx,
                ));
        }
        panel = panel.child(actions);
    } else if state.error.is_some() {
        if enabled && state.saved.is_some() {
            panel = panel.child(button(
                "retry-cloud-draft",
                "Retry draft save",
                DraftAction::Save,
                cx,
            ));
        }
    } else if state.dirty() {
        panel = panel.child(gpui::text!(if state.saved.is_none() {
            "Draft saving is unavailable for this conversation. Keep a copy before leaving."
        } else {
            "Draft not saved yet"
        }));
        if enabled && state.saved.is_some() {
            panel = panel.child(button(
                "save-cloud-draft",
                "Save draft",
                DraftAction::Save,
                cx,
            ));
        }
    } else if !state.text.is_empty() {
        panel = panel.child(gpui::text!("Draft saved"));
    }
    panel
}
