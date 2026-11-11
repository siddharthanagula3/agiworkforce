use crate::{
    config::{NativeContracts, Palette},
    conversation_management::{
        update_request, ConversationAction, ConversationManagement, ConversationOperationKind,
    },
    native_controls,
};
use agiworkforce_protocol::account_cloud::{CloudConversationChange, CloudHistoryConversation};
use gpui::{div, prelude::*, rgb, Context, Entity, Window};
use gpui_component::input::{Input, InputState};

pub struct ConversationControlProps<'a> {
    pub contracts: &'a NativeContracts,
    pub scope: &'a str,
    pub conversation: &'a CloudHistoryConversation,
    pub management: &'a ConversationManagement,
    pub title: &'a Entity<InputState>,
    pub enabled: bool,
    pub busy: bool,
}

pub fn controls<V: 'static>(
    props: ConversationControlProps<'_>,
    palette: Palette,
    handler: impl Fn(&mut V, ConversationAction, &mut Window, &mut Context<V>) + Clone + 'static,
    cx: &mut Context<V>,
) -> gpui::Div {
    let button =
        |id: &'static str, label: &'static str, action: ConversationAction, cx: &mut Context<V>| {
            let handler = handler.clone();
            native_controls::button(
                id,
                label,
                move |view, window, cx| handler(view, action.clone(), window, cx),
                props.contracts,
                palette,
                cx,
            )
            .into_any_element()
        };
    let mut panel = div().w_full().min_w_0().flex().flex_col().gap_2();
    if let Some(error) = &props.management.error {
        panel = panel.child(gpui::text!(error.clone()));
    }
    if let Some(operation) = &props.management.operation {
        panel = panel.child(gpui::text!(match operation.kind {
            ConversationOperationKind::Save => "Saving conversation…",
            ConversationOperationKind::Review => "Loading conversation details…",
        }));
    }
    if let Some(edit) = &props.management.editing {
        panel = panel.child(gpui::text!("Conversation title"));
        panel = panel.child(
            Input::new(props.title)
                .aria_label("Conversation title")
                .border_color(rgb(palette.foreground))
                .readonly(props.busy),
        );
        if props.enabled && !props.management.needs_reload {
            panel = panel.child(button(
                "save-cloud-title",
                "Save title",
                ConversationAction::SaveTitle(edit.id),
                cx,
            ));
        }
        if !props.busy {
            panel = panel.child(button(
                "cancel-cloud-title",
                "Cancel rename",
                ConversationAction::CancelTitle(edit.id),
                cx,
            ));
        }
    }
    if props.enabled && (props.management.needs_reload || props.conversation.version.is_none()) {
        return panel.child(button(
            "reload-cloud-metadata",
            "Review latest conversation",
            ConversationAction::ReviewLatest,
            cx,
        ));
    }
    if !props.enabled || props.management.editing.is_some() {
        return panel;
    }
    let mut actions = div().flex().flex_wrap().gap_2();
    for (id, label, change) in [
        (
            "rename-cloud",
            "Rename",
            CloudConversationChange::Rename {
                title: props.conversation.title.clone().unwrap_or_default(),
            },
        ),
        (
            "pin-cloud",
            if props.conversation.pinned {
                "Unpin"
            } else {
                "Pin"
            },
            CloudConversationChange::Pin {
                pinned: !props.conversation.pinned,
            },
        ),
        (
            "archive-cloud",
            if props.conversation.archived {
                "Restore"
            } else {
                "Archive"
            },
            CloudConversationChange::Archive {
                archived: !props.conversation.archived,
            },
        ),
    ] {
        if id == "pin-cloud" && props.conversation.archived {
            continue;
        }
        if let Ok(params) = update_request(props.scope, props.conversation, change) {
            let action = if id == "rename-cloud" {
                ConversationAction::Rename(params)
            } else {
                ConversationAction::Update(params)
            };
            actions = actions.child(button(id, label, action, cx));
        }
    }
    panel.child(actions)
}
