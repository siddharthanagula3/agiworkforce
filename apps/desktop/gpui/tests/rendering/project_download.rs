use super::model_picker::{draw, key};
use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Palette},
    native_frame,
    project_download::ProjectDownload,
    project_download_controls::{self, DownloadAction},
    project_upload::ProjectUpload,
    project_upload_controls,
};
use agiworkforce_protocol::{account_cloud::*, project_files::*};
use anyhow::{ensure, Context as _, Result};
use gpui::{div, prelude::*, px, rgb, size, App, Context, FocusHandle, HeadlessAppContext, Window};
use std::sync::Arc;
struct Fixture {
    contracts: Arc<NativeContracts>,
    palette: Palette,
    download: ProjectDownload,
    upload: ProjectUpload,
    focus: FocusHandle,
    actions: Vec<DownloadAction>,
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
                |_: &mut Fixture, _, _, _| {},
                cx,
            ))
            .child(project_download_controls::controls(
                &self.download,
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
fn state() -> ProjectDownload {
    let target = CloudProjectFileTarget {
        project: CloudProjectTarget {
            scope: "account".into(),
            workspace: CloudConversationWorkspace::Personal,
            project_id: "project".into(),
        },
        file_id: "file".into(),
    };
    ProjectDownload {
        target: Some(target.clone()),
        workspace_name: "Original workspace".into(),
        snapshot: Some(CloudProjectDownloadSnapshot {
            review: CloudProjectDownloadReview {
                download: CloudProjectDownloadId {
                    file: target,
                    id: uuid::Uuid::new_v4().to_string(),
                },
                file: CloudProjectFile {
                    id: "file".into(),
                    project_id: "project".into(),
                    file_name: "Source 東京 🦀.pdf".into(),
                    mime_type: "application/pdf".into(),
                    byte_count: 100,
                    checksum_sha256: "a".repeat(64),
                    added_at: "now".into(),
                    added_by_user_id: None,
                    preview_kind: None,
                    indexing: None,
                },
                project_name: "Project 東京".into(),
                destination: std::env::temp_dir()
                    .join("saved.pdf")
                    .to_string_lossy()
                    .into(),
                replaces: true,
            },
            phase: ProjectDownloadPhase::Ready,
            received_bytes: 0,
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
                    download: state(),
                    upload: Default::default(),
                    focus: cx.focus_handle(),
                    actions: Vec::new(),
                });
                fixture = Some(view.clone());
                app.new(|cx| gpui_component::Root::new(view, window, cx))
            })?
            .into();
        let fixture = fixture.context("download fixture missing")?;
        let focus = |cx: &mut HeadlessAppContext| -> Result<()> {
            cx.update_window(window, |_, window, app| {
                let focus = fixture.read(app).focus.clone();
                focus.focus(window, app);
            })?;
            Ok(())
        };
        draw(cx, window)?;
        focus(cx)?;
        key(cx, window, "tab")?;
        key(cx, window, "enter")?;
        cx.update(|app|{let view=fixture.read(app);ensure!(matches!(&view.actions[..],[DownloadAction::Review(id)]if *id==view.download.snapshot.as_ref().unwrap().review.download),"Ready download bypassed save review");Ok::<_,anyhow::Error>(())})?;
        for phase in [
            ProjectDownloadPhase::Downloading,
            ProjectDownloadPhase::Saving,
            ProjectDownloadPhase::Failed,
            ProjectDownloadPhase::Succeeded,
        ] {
            cx.update(|app| {
                fixture.update(app, |view, cx| {
                    let snapshot = view.download.snapshot.as_mut().unwrap();
                    snapshot.phase = phase;
                    snapshot.received_bytes = if phase == ProjectDownloadPhase::Succeeded {
                        100
                    } else {
                        20
                    };
                    snapshot.cancelable = phase == ProjectDownloadPhase::Downloading;
                    snapshot.retryable = phase == ProjectDownloadPhase::Failed;
                    snapshot.uncertain = phase == ProjectDownloadPhase::Failed;
                    snapshot.error = (phase == ProjectDownloadPhase::Failed).then(|| {
                        "Long filesystem failure details remain outside the project frame. "
                            .repeat(2000)
                    });
                    view.actions.clear();
                    cx.notify();
                })
            });
            draw(cx, window)?;
            focus(cx)?;
            key(cx, window, "tab")?;
            key(cx, window, "enter")?;
            if phase == ProjectDownloadPhase::Failed {
                key(cx, window, "tab")?;
                key(cx, window, "enter")?;
            }
            cx.update(|app|{let view=fixture.read(app);let id=&view.download.snapshot.as_ref().unwrap().review.download;match phase{ProjectDownloadPhase::Downloading=>ensure!(matches!(&view.actions[..],[DownloadAction::Cancel(target)]if target==id),"Download Stop lost its target"),ProjectDownloadPhase::Saving=>ensure!(view.actions.is_empty(),"Saving exposed a cancellation or close action"),ProjectDownloadPhase::Failed=>ensure!(matches!(&view.actions[..],[DownloadAction::Details(_),DownloadAction::Start(target)]if target==id),"Retry changed the reviewed save destination"),_=>ensure!(matches!(&view.actions[..],[DownloadAction::Reveal(target)]if target==id),"A saved file was opened automatically or could not be revealed")};Ok::<_,anyhow::Error>(())})?;
        }
        cx.update(|app| {
            fixture.update(app, |view, cx| {
                view.upload = super::project_upload::state();
                let upload = view.upload.snapshot.as_mut().unwrap();
                upload.phase = ProjectUploadPhase::Failed;
                upload.uncertain = true;
                upload.cancelable = false;
                upload.error = Some("Upload uncertainty".into());
                let download = view.download.snapshot.as_mut().unwrap();
                download.phase = ProjectDownloadPhase::Failed;
                download.uncertain = true;
                download.retryable = false;
                download.error = Some("Download uncertainty".repeat(2000));
                cx.notify();
            })
        });
        draw(cx, window)?;
        cx.capture_screenshot(window)?
            .save(format!("/tmp/agi-gpui-download-review-{theme}-{width}.png"))?;
        cx.update_window(window, |_, window, _| window.remove_window())?;
        eprintln!("{theme} {width}px: save review freezes the destination, Stop ends before publication, saving cannot be cancelled, completed files are revealed explicitly and both transfers retain readable content");
    }
    Ok(())
}
