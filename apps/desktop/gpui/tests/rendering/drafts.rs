use super::model_picker::{draw, input, key};
use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Palette},
    draft_controls::{self, DraftAction},
    drafts::{DraftState, DraftTarget},
    native_frame,
};
use agiworkforce_protocol::account_cloud::*;
use anyhow::{ensure, Context as _, Result};
use gpui::{
    div, prelude::*, px, rgb, size, App, Context, Entity, Focusable, HeadlessAppContext, Window,
};
use gpui_component::input::{InputEvent, TextareaState};
use std::sync::Arc;

struct Fixture {
    contracts: Arc<NativeContracts>,
    palette: Palette,
    cloud: agiworkforce_desktop_gpui::cloud_history::CloudHistory,
    composer: Entity<TextareaState>,
    enabled: bool,
    actions: Vec<DraftAction>,
}
impl Render for Fixture {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let controls = draft_controls::controls(
            &self.cloud.draft,
            self.enabled && !self.cloud.navigation_busy(),
            &self.contracts,
            self.palette,
            |view: &mut Fixture, action, _, cx| {
                view.actions.push(action);
                cx.notify();
            },
            window,
            cx,
        );
        let footer = native_frame::footer(
            div()
                .w_full()
                .min_w_0()
                .flex()
                .flex_col()
                .gap_2()
                .child(native_frame::composer(
                    &self.composer,
                    "Draft",
                    self.cloud.busy(),
                    false,
                    None,
                    &self.contracts,
                    self.palette,
                ))
                .child(controls)
                .into_any_element(),
            &self.contracts,
        );
        div()
            .size_full()
            .bg(rgb(self.palette.background))
            .text_color(rgb(self.palette.foreground))
            .child(native_frame::main(
                native_frame::header("Draft recovery".into(), None, vec![], &self.contracts)
                    .into_any_element(),
                div()
                    .size_full()
                    .child(gpui::text!("Saved conversation history"))
                    .into_any_element(),
                Some(footer.into_any_element()),
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
            .open_window(size(px(width), px(640.)), |window, app: &mut App| {
                let view = app.new(|cx| {
                    let composer = cx.new(|cx| TextareaState::new(window, cx).auto_grow(1, 8));
                    cx.subscribe_in(
                        &composer,
                        window,
                        |view: &mut Fixture, input, event: &InputEvent, _, cx| {
                            if matches!(event, InputEvent::Change) {
                                view.cloud.draft.edit(input.read(cx).value().to_string());
                                cx.notify();
                            }
                        },
                    )
                    .detach();
                    let mut draft = DraftState::default();
                    draft
                        .observe(
                            DraftTarget {
                                scope: "account".into(),
                                conversation_id: "conversation".into(),
                                workspace: CloudConversationWorkspace::Personal,
                            },
                            Some(CloudConversationDraft {
                                text: String::new(),
                                revision: None,
                            }),
                        )
                        .unwrap();
                    Fixture {
                        contracts: contracts.clone(),
                        palette,
                        cloud: {
                            let mut cloud =
                                agiworkforce_desktop_gpui::cloud_history::CloudHistory::new(
                                    contracts.max_frame_bytes.get(),
                                );
                            cloud.draft = draft;
                            cloud
                        },
                        composer,
                        enabled: true,
                        actions: Vec::new(),
                    }
                });
                fixture = Some(view.clone());
                app.new(|cx| gpui_component::Root::new(view, window, cx))
            })?
            .into();
        let fixture = fixture.context("draft fixture missing")?;
        draw(cx, window)?;
        cx.update_window(window, |_, window, app| {
            fixture
                .read(app)
                .composer
                .read(app)
                .focus_handle(app)
                .focus(window, app)
        })?;
        input(cx, window, "Unsent 東京 🦀")?;
        let job = cx.update(|app| {
            fixture.update(app, |view, cx| {
                let job = view
                    .cloud
                    .draft
                    .begin(contracts.draft_max_length)
                    .unwrap()
                    .unwrap();
                cx.notify();
                job
            })
        });
        draw(cx, window)?;
        input(cx, window, " while saving")?;
        cx.update(|app| {
            let view = fixture.read(app);
            ensure!(
                view.composer.read(app).value().as_str() == "Unsent 東京 🦀 while saving"
                    && view.cloud.draft.text == "Unsent 東京 🦀 while saving",
                "Autosave locked or lost a newer edit"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update(|app| {
            fixture.update(app, |view, cx| {
                view.cloud
                    .draft
                    .finish(
                        &job,
                        CloudDraftSaveResponse {
                            scope: job.request.scope.clone(),
                            workspace: job.request.workspace.clone(),
                            conversation_id: job.request.conversation_id.clone(),
                            outcome: CloudDraftSaveOutcome::Saved {
                                revision: Some("2026-11-09T00:00:01Z".into()),
                            },
                        },
                    )
                    .unwrap();
                cx.notify();
            })
        });
        draw(cx, window)?;
        key(cx, window, "tab")?;
        key(cx, window, "enter")?;
        cx.update(|app| {
            ensure!(
                matches!(fixture.read(app).actions.last(), Some(DraftAction::Save)),
                "Save draft did not activate from the keyboard"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        let reviewed = CloudConversationDraft {
            text: "Saved on another device 東京 🦀\n".repeat(16),
            revision: Some("2026-11-09T00:00:02Z".into()),
        };
        cx.update_window(window, |_, window, app| {
            fixture.update(app, |view, cx| {
                view.cloud.draft.conflict = Some(reviewed.clone());
                view.actions.clear();
                cx.notify();
            });
            fixture
                .read(app)
                .composer
                .read(app)
                .focus_handle(app)
                .focus(window, app);
        })?;
        draw(cx, window)?;
        let first = cx.capture_screenshot(window)?;
        first.save(format!("/tmp/agi-gpui-draft-conflict-{name}-{width}.png"))?;
        draw(cx, window)?;
        let second = cx.capture_screenshot(window)?;
        ensure!(
            first == second,
            "The draft conflict changed during an unchanged repaint"
        );
        key(cx, window, "tab")?;
        key(
            cx,
            window,
            if cfg!(target_os = "macos") {
                "cmd-a"
            } else {
                "ctrl-a"
            },
        )?;
        key(
            cx,
            window,
            if cfg!(target_os = "macos") {
                "cmd-c"
            } else {
                "ctrl-c"
            },
        )?;
        cx.update(|app| {
            ensure!(
                app.read_from_clipboard()
                    .and_then(|item| item.text())
                    .as_deref()
                    == Some(reviewed.text.as_str()),
                "The keyboard could not copy the full saved draft"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        input(cx, window, "must not replace the saved draft")?;
        key(
            cx,
            window,
            if cfg!(target_os = "macos") {
                "cmd-a"
            } else {
                "ctrl-a"
            },
        )?;
        key(
            cx,
            window,
            if cfg!(target_os = "macos") {
                "cmd-c"
            } else {
                "ctrl-c"
            },
        )?;
        cx.update(|app| {
            ensure!(
                app.read_from_clipboard()
                    .and_then(|item| item.text())
                    .as_deref()
                    == Some(reviewed.text.as_str()),
                "The read-only saved draft accepted an edit"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        for _ in 0..3 {
            key(cx, window, "tab")?;
            key(cx, window, "enter")?;
        }
        cx.update(|app| {
            let view = fixture.read(app);
            ensure!(matches!(&view.actions[..], [DraftAction::Copy(copy), DraftAction::Resolve(mine, true), DraftAction::Resolve(theirs, false)]
                if copy == &reviewed && mine == &reviewed && theirs == &reviewed), "Draft controls lost their reviewed revision or keyboard order");
            ensure!(view.cloud.draft.text == "Unsent 東京 🦀 while saving", "Reviewing actions discarded the local draft before confirmation");
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update_window(window, |_, window, app| {
            fixture.update(app, |view, cx| {
                view.enabled = false;
                view.actions.clear();
                cx.notify();
            });
            fixture
                .read(app)
                .composer
                .read(app)
                .focus_handle(app)
                .focus(window, app);
        })?;
        draw(cx, window)?;
        for _ in 0..4 {
            key(cx, window, "tab")?;
            key(cx, window, "enter")?;
        }
        cx.update(|app| {
            ensure!(
                fixture
                    .read(app)
                    .actions
                    .iter()
                    .all(|action| matches!(action, DraftAction::Copy(_))),
                "A disabled draft resolution still dispatched"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        eprintln!("{name} {width}px: draft typing during save, exact conflict review, stable repaint, keyboard requests and disabled resolution pass");
        cx.update_window(window, |_, window, _| window.remove_window())?;
    }
    Ok(())
}
