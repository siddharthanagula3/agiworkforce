use super::model_picker::{draw, input, key};
use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Palette},
    project_form::*,
    projects::ProjectEdit,
};
use agiworkforce_protocol::account_cloud::*;
use anyhow::{ensure, Context as _, Result};
use gpui::{
    div, prelude::*, px, rgb, size, App, Context, Entity, Focusable, HeadlessAppContext, Window,
};
use gpui_component::input::{InputState, TextareaState};
use std::sync::Arc;

struct Fixture {
    contracts: Arc<NativeContracts>,
    palette: Palette,
    edit: ProjectEdit,
    name: Entity<InputState>,
    description: Entity<TextareaState>,
    instructions: Entity<TextareaState>,
    busy: bool,
    review: bool,
    actions: Vec<ProjectFormAction>,
}
impl Render for Fixture {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .id("project-form-scroll")
            .size_full()
            .overflow_y_scroll()
            .p(px(self.contracts.frame.viewport_gutter))
            .bg(rgb(self.palette.background))
            .text_color(rgb(self.palette.foreground))
            .text_size(px(self.contracts.body_font_size))
            .line_height(px(self.contracts.body_line_height))
            .child(form(
                ProjectFormProps {
                    edit: &self.edit,
                    fields: ProjectFormFields {
                        name: &self.name,
                        description: &self.description,
                        instructions: &self.instructions,
                    },
                    busy: self.busy,
                    needs_review: self.review,
                    contracts: &self.contracts,
                },
                self.palette,
                |view: &mut Fixture, action, _, cx| {
                    view.actions.push(action);
                    cx.notify();
                },
                cx,
            ))
    }
}
fn original() -> CloudProject {
    CloudProject {
        id: "fixture-project".into(),
        name: "Original".into(),
        description: None,
        instructions: None,
        organization_id: None,
        version: Some("\"4\"".into()),
        archived: false,
        can_edit: true,
        can_archive: true,
        default_model_id: None,
        conversation_count: None,
        knowledge_file_count: None,
        can_start_chat: true,
    }
}
pub fn run(
    cx: &mut HeadlessAppContext,
    contracts: &Arc<NativeContracts>,
    theme: &str,
    palette: Palette,
) -> Result<()> {
    for width in [768., 320.] {
        let mut fixture = None;
        let window = cx
            .open_window(size(px(width), px(760.)), |window, app: &mut App| {
                let view = app.new(|cx| Fixture {
                    contracts: contracts.clone(),
                    palette,
                    edit: ProjectEdit {
                        id: uuid::Uuid::new_v4(),
                        scope: "account".into(),
                        workspace: CloudConversationWorkspace::Personal,
                        original: Some(original()),
                    },
                    name: cx.new(|cx| InputState::new(window, cx)),
                    description: cx.new(|cx| TextareaState::new(window, cx).auto_grow(2, 4)),
                    instructions: cx.new(|cx| TextareaState::new(window, cx).auto_grow(3, 8)),
                    busy: false,
                    review: false,
                    actions: Vec::new(),
                });
                fixture = Some(view.clone());
                app.new(|cx| gpui_component::Root::new(view, window, cx))
            })?
            .into();
        let fixture = fixture.context("project form fixture missing")?;
        draw(cx, window)?;
        cx.update_window(window, |_, window, app| {
            fixture
                .read(app)
                .name
                .read(app)
                .focus_handle(app)
                .focus(window, app)
        })?;
        input(cx, window, "Project 東京 🦀")?;
        key(cx, window, "tab")?;
        input(cx, window, "Description 東京\nsecond line")?;
        key(cx, window, "tab")?;
        input(cx, window, "Preserve these instructions 🦀\nsecond line")?;
        key(cx, window, "tab")?;
        key(cx, window, "enter")?;
        cx.update(|app| {
            let view = fixture.read(app);
            ensure!(view.name.read(app).value().as_str() == "Project 東京 🦀", "Project name changed during input");
            ensure!(view.description.read(app).value().as_str() == "Description 東京\nsecond line", "Project description lost exact input");
            ensure!(view.instructions.read(app).value().as_str() == "Preserve these instructions 🦀\nsecond line", "Project instructions lost exact input");
            ensure!(matches!(view.actions.last(), Some(ProjectFormAction::Save(id)) if *id == view.edit.id), "Save did not freeze the visible form identity");
            Ok::<_, anyhow::Error>(())
        })?;
        let image = cx.capture_screenshot(window)?;
        image.save(format!("/tmp/agi-gpui-project-form-{theme}-{width}.png"))?;
        cx.update_window(window, |_, window, app| {
            fixture.update(app, |view, cx| {
                view.busy = true;
                view.actions.clear();
                cx.notify();
            });
            fixture
                .read(app)
                .name
                .read(app)
                .focus_handle(app)
                .focus(window, app);
        })?;
        draw(cx, window)?;
        key(
            cx,
            window,
            if cfg!(target_os = "macos") {
                "cmd-a"
            } else {
                "ctrl-a"
            },
        )?;
        input(cx, window, "must not replace a pending save")?;
        cx.update(|app| {
            let view = fixture.read(app);
            ensure!(
                view.name.read(app).value().as_str() == "Project 東京 🦀"
                    && view.actions.is_empty(),
                "A saving project accepted a conflicting edit"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update_window(window, |_, window, app| {
            fixture.update(app, |view, cx| {
                view.busy = false;
                view.review = true;
                cx.notify();
            });
            fixture
                .read(app)
                .name
                .read(app)
                .focus_handle(app)
                .focus(window, app);
        })?;
        draw(cx, window)?;
        for _ in 0..3 {
            key(cx, window, "tab")?;
        }
        key(cx, window, "enter")?;
        cx.update(|app| {
            let view = fixture.read(app);
            ensure!(
                matches!(&view.actions[..], [ProjectFormAction::Cancel(id)] if *id == view.edit.id),
                "A project awaiting review still offered a save, or Cancel lost its form identity"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update_window(window, |_, window, app| {
            fixture.update(app, |view, cx| {
                view.review = false;
                view.edit.original.as_mut().unwrap().can_edit = false;
                view.actions.clear();
                cx.notify();
            });
            fixture
                .read(app)
                .instructions
                .read(app)
                .focus_handle(app)
                .focus(window, app);
        })?;
        draw(cx, window)?;
        input(cx, window, "must not change read-only instructions")?;
        key(cx, window, "tab")?;
        key(cx, window, "enter")?;
        cx.update(|app| {
            let view = fixture.read(app);
            ensure!(
                view.instructions.read(app).value().as_str()
                    == "Preserve these instructions 🦀\nsecond line",
                "A revoked editor changed the read-only proposal"
            );
            ensure!(
                view.actions
                    .iter()
                    .all(|action| matches!(action, ProjectFormAction::Cancel(_))),
                "Read-only access still dispatched Save"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        eprintln!("{theme} {width}px: project fields preserve Unicode/newlines, keyboard actions freeze form identity, saving/review/read-only states prevent writes");
        cx.update_window(window, |_, window, _| window.remove_window())?;
    }
    Ok(())
}
