use super::model_picker::{draw, key};
use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Palette},
    native_frame,
    project_upload::ProjectUpload,
    project_upload_controls::{self, UploadAction},
};
use agiworkforce_protocol::{account_cloud::*, project_files::*};
use anyhow::{ensure, Context as _, Result};
use gpui::{div, prelude::*, px, rgb, size, App, Context, FocusHandle, HeadlessAppContext, Window};
use std::sync::Arc;
struct Fixture {
    contracts: Arc<NativeContracts>,
    palette: Palette,
    upload: ProjectUpload,
    focus: FocusHandle,
    actions: Vec<UploadAction>,
}
impl Render for Fixture {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let header = div()
            .flex()
            .flex_col()
            .flex_shrink_0()
            .min_w_0()
            .child(native_frame::header(
                "Project".into(),
                None,
                vec![],
                &self.contracts,
            ))
            .child(project_upload_controls::controls(
                &self.upload,
                &self.contracts,
                self.palette,
                |view: &mut Fixture, action, _, cx| {
                    view.actions.push(action);
                    cx.notify();
                },
                cx,
            ));
        div()
            .size_full()
            .track_focus(&self.focus)
            .bg(rgb(self.palette.background))
            .text_color(rgb(self.palette.foreground))
            .text_size(px(self.contracts.body_font_size))
            .child(native_frame::main(
                header.into_any_element(),
                div()
                    .size_full()
                    .p_4()
                    .child(gpui::text!("Project content remains available"))
                    .into_any_element(),
                None,
            ))
    }
}
pub(super) fn state() -> ProjectUpload {
    let target = CloudProjectTarget {
        scope: "account".into(),
        workspace: CloudConversationWorkspace::Personal,
        project_id: "project".into(),
    };
    let review = CloudProjectUploadReview {
        upload: CloudProjectUploadId {
            target: target.clone(),
            id: uuid::Uuid::new_v4().to_string(),
        },
        project_name: "Project 東京 🦀 with a long name".into(),
        file_name: "Selected notes 東京 🦀.md".into(),
        mime_type: "text/markdown".into(),
        byte_count: 100,
        checksum_sha256: "a".repeat(64),
    };
    ProjectUpload {
        target: Some(target),
        workspace_name: "Original workspace".into(),
        snapshot: Some(CloudProjectUploadSnapshot {
            review,
            phase: ProjectUploadPhase::Ready,
            uploaded_bytes: 0,
            file: None,
            error: None,
            uncertain: false,
            retryable: true,
            cancelable: true,
        }),
        ..Default::default()
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
            .open_window(size(px(width), px(600.)), |window, app: &mut App| {
                let view = app.new(|cx| Fixture {
                    contracts: contracts.clone(),
                    palette,
                    upload: state(),
                    focus: cx.focus_handle(),
                    actions: Vec::new(),
                });
                fixture = Some(view.clone());
                app.new(|cx| gpui_component::Root::new(view, window, cx))
            })?
            .into();
        let fixture = fixture.context("upload fixture missing")?;
        let reset_focus = |cx: &mut HeadlessAppContext| -> Result<()> {
            cx.update_window(window, |_, window, app| {
                let focus = fixture.read(app).focus.clone();
                focus.focus(window, app);
            })?;
            Ok(())
        };
        draw(cx, window)?;
        reset_focus(cx)?;
        key(cx, window, "tab")?;
        key(cx, window, "enter")?;
        cx.update(|app| { let view = fixture.read(app); ensure!(matches!(&view.actions[..], [UploadAction::Review(id)] if *id == view.upload.snapshot.as_ref().unwrap().review.upload), "Ready upload bypassed review or changed its target"); Ok::<_, anyhow::Error>(()) })?;
        for phase in [
            ProjectUploadPhase::Uploading,
            ProjectUploadPhase::Completing,
            ProjectUploadPhase::Failed,
        ] {
            cx.update(|app| {
                fixture.update(app, |view, cx| {
                    let snapshot = view.upload.snapshot.as_mut().unwrap();
                    snapshot.phase = phase;
                    snapshot.uploaded_bytes = 25;
                    snapshot.cancelable = phase == ProjectUploadPhase::Uploading;
                    snapshot.uncertain = phase == ProjectUploadPhase::Failed;
                    snapshot.error = (phase == ProjectUploadPhase::Failed).then(|| {
                        "Long storage failure details must not consume the project view. "
                            .repeat(2000)
                    });
                    view.actions.clear();
                    cx.notify();
                })
            });
            draw(cx, window)?;
            reset_focus(cx)?;
            key(cx, window, "tab")?;
            key(cx, window, "enter")?;
            if phase == ProjectUploadPhase::Failed {
                key(cx, window, "tab")?;
                key(cx, window, "enter")?;
            }
            cx.update(|app| { let view=fixture.read(app); let id=&view.upload.snapshot.as_ref().unwrap().review.upload;
                match phase { ProjectUploadPhase::Uploading => ensure!(matches!(&view.actions[..], [UploadAction::Cancel(target)] if target==id), "Upload Stop lost its identity"), ProjectUploadPhase::Completing => ensure!(view.actions.is_empty(), "Finalizing upload exposed Stop or Close"), _ => ensure!(matches!(&view.actions[..], [UploadAction::Details(_), UploadAction::Start(target)] if target==id), "Uncertain completion replay control changed its frozen upload identity") }; Ok::<_, anyhow::Error>(()) })?;
            if phase == ProjectUploadPhase::Failed {
                cx.capture_screenshot(window)?
                    .save(format!("/tmp/agi-gpui-upload-review-{theme}-{width}.png"))?;
            }
        }
        cx.update_window(window, |_, window, _| window.remove_window())?;
        eprintln!("{theme} {width}px: upload controls require review, retain the immutable target, stop before completion and keep long error details outside the project view");
    }
    Ok(())
}
