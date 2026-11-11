use std::sync::Arc;

use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Palette},
    conversation_controls::{controls, ConversationControlProps},
    conversation_management::*,
};
use agiworkforce_protocol::account_cloud::*;
use anyhow::{ensure, Context as _, Result};
use gpui::{
    div, prelude::*, px, rgb, size, App, Context, Entity, Focusable, HeadlessAppContext, Window,
};
use gpui_component::input::InputState;

use super::model_picker::{click, draw, input, key};

struct Fixture {
    conversation: CloudHistoryConversation,
    management: ConversationManagement,
    title: Entity<InputState>,
    actions: Vec<ConversationAction>,
    contracts: Arc<NativeContracts>,
    palette: Palette,
}

impl Render for Fixture {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .size_full()
            .p_4()
            .bg(rgb(self.palette.background))
            .text_color(rgb(self.palette.foreground))
            .text_size(px(self.contracts.body_font_size))
            .line_height(px(self.contracts.body_line_height))
            .flex()
            .flex_col()
            .gap_2()
            .child(gpui::text!(self
                .conversation
                .title
                .clone()
                .unwrap_or_default()))
            .child(controls(
                ConversationControlProps {
                    contracts: &self.contracts,
                    scope: "account",
                    conversation: &self.conversation,
                    management: &self.management,
                    title: &self.title,
                    enabled: self.management.operation.is_none(),
                    busy: self.management.operation.is_some(),
                },
                self.palette,
                |view: &mut Fixture, action, window, cx| {
                    view.actions.push(action.clone());
                    match action {
                        ConversationAction::Rename(request) => {
                            if let CloudConversationChange::Rename { title } = &request.change {
                                view.title.update(cx, |input, cx| {
                                    input.set_value(title.clone(), window, cx);
                                    input.focus(window, cx);
                                });
                            }
                            view.management.editing = Some(TitleEdit {
                                id: uuid::Uuid::new_v4(),
                                request,
                            });
                        }
                        ConversationAction::CancelTitle(id)
                            if view
                                .management
                                .editing
                                .as_ref()
                                .is_some_and(|edit| edit.id == id) =>
                        {
                            view.management.editing = None;
                            view.management.error = None;
                        }
                        _ => {}
                    }
                    cx.notify();
                },
                cx,
            ))
    }
}

pub fn run(
    cx: &mut HeadlessAppContext,
    contracts: &Arc<NativeContracts>,
    name: &str,
    palette: Palette,
) -> Result<()> {
    for width in [768., 320.] {
        let mut fixture = None;
        let window = cx
            .open_window(size(px(width), px(500.)), |window, app: &mut App| {
                let view = app.new(|cx| Fixture {
                    conversation: CloudHistoryConversation {
                        temporary: Some(false),
                        id: "selected".into(),
                        title: Some("Saved conversation".into()),
                        model: None,
                        project_id: None,
                        organization_id: None,
                        updated_at: "2026-11-09T00:00:00Z".into(),
                        work_mode: None,
                        pinned: true,
                        archived: false,
                        version: Some("\"1\"".into()),
                    },
                    management: Default::default(),
                    title: cx.new(|cx| InputState::new(window, cx)),
                    actions: Vec::new(),
                    contracts: contracts.clone(),
                    palette,
                });
                fixture = Some(view.clone());
                app.new(|cx| gpui_component::Root::new(view, window, cx))
            })?
            .into();
        let fixture = fixture.context("conversation fixture missing")?;
        draw(cx, window)?;
        cx.capture_screenshot(window)?.save(format!(
            "/tmp/agi-gpui-conversation-actions-{name}-{width}.png"
        ))?;
        click(cx, window, 40., 64.)?;
        cx.update(|app| {
            let view = fixture.read(app);
            let edit = view
                .management
                .editing
                .as_ref()
                .context("Rename did not open")?;
            ensure!(
                edit.request.scope == "account"
                    && edit.request.conversation_id == "selected"
                    && edit.request.expected_version == "\"1\"",
                "Rename did not freeze its displayed target and revision"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        key(
            cx,
            window,
            if cfg!(target_os = "macos") {
                "cmd-a"
            } else {
                "ctrl-a"
            },
        )?;
        input(cx, window, "Proposed title 🦀")?;
        key(cx, window, "tab")?;
        key(cx, window, "enter")?;
        cx.update(|app| {
            let view = fixture.read(app);
            ensure!(matches!(view.actions.last(), Some(ConversationAction::SaveTitle(id)) if Some(*id) == view.management.editing.as_ref().map(|edit| edit.id)), "Keyboard save did not target the current edit");
            ensure!(view.title.read(app).value().as_str() == "Proposed title 🦀", "The title input lost Unicode text");
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update(|app| fixture.update(app, |view, cx| {
            view.conversation.title = Some("Changed elsewhere".into()); view.conversation.version = Some("\"2\"".into());
            view.management.needs_reload = true; view.management.error = Some("Someone changed this conversation. Review the latest saved title before retrying.".into()); cx.notify();
        }));
        draw(cx, window)?;
        cx.capture_screenshot(window)?.save(format!(
            "/tmp/agi-gpui-conversation-conflict-{name}-{width}.png"
        ))?;
        cx.update(|app| {
            ensure!(
                fixture.read(app).title.read(app).value().as_str() == "Proposed title 🦀",
                "A conflict discarded the proposed title"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update_window(window, |_, window, app| {
            fixture.update(app, |view, cx| {
                view.management.operation = Some(ConversationOperation {
                    id: uuid::Uuid::new_v4(),
                    kind: ConversationOperationKind::Save,
                });
                cx.notify();
            });
            fixture
                .read(app)
                .title
                .read(app)
                .focus_handle(app)
                .focus(window, app);
        })?;
        draw(cx, window)?;
        input(cx, window, "must not be added")?;
        cx.update(|app| {
            ensure!(
                fixture.read(app).title.read(app).value().as_str() == "Proposed title 🦀",
                "The disabled title field accepted edits while saving"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update(|app| {
            fixture.update(app, |view, cx| {
                view.management = Default::default();
                view.conversation.archived = true;
                view.conversation.pinned = false;
                view.conversation.version = Some("\"3\"".into());
                cx.notify();
            })
        });
        draw(cx, window)?;
        cx.capture_screenshot(window)?.save(format!(
            "/tmp/agi-gpui-conversation-archived-{name}-{width}.png"
        ))?;
        click(cx, window, 150., 64.)?;
        cx.update(|app| {
            ensure!(matches!(fixture.read(app).actions.last(), Some(ConversationAction::Update(request)) if request.expected_version == "\"3\"" && matches!(request.change, CloudConversationChange::Archive { archived: false })), "Restore did not freeze the archived conversation version");
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update_window(window, |_, window, _| window.remove_window())?;
        eprintln!("{name} {width}px: conversation actions, versioned rename, Unicode, keyboard save, conflict retention, disabled editing and restore pass");
    }
    Ok(())
}
