use super::model_picker::{draw, input, key};
use agiworkforce_desktop_gpui::{
    config::{NativeContracts, Palette},
    project_file_controls::{self, ProjectFileAction},
    project_files::ProjectFiles,
};
use agiworkforce_protocol::{account_cloud::*, project_files::*};
use anyhow::{ensure, Context as _, Result};
use gpui::{div, prelude::*, px, rgb, size, App, Context, FocusHandle, HeadlessAppContext, Window};
use std::sync::Arc;
struct Fixture {
    contracts: Arc<NativeContracts>,
    palette: Palette,
    files: ProjectFiles,
    capabilities: project_file_controls::FileCapabilities,
    focus: FocusHandle,
    actions: Vec<ProjectFileAction>,
}
impl Render for Fixture {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div()
            .id("fixture-files")
            .track_focus(&self.focus)
            .size_full()
            .overflow_y_scroll()
            .p(px(self.contracts.frame.viewport_gutter))
            .bg(rgb(self.palette.background))
            .text_color(rgb(self.palette.foreground))
            .text_size(px(self.contracts.body_font_size))
            .child(project_file_controls::controls(
                &self.files,
                self.capabilities,
                &self.contracts,
                self.palette,
                |view: &mut Fixture, action, _, cx| {
                    view.actions.push(action);
                    cx.notify();
                },
                window,
                cx,
            ))
    }
}
fn state() -> ProjectFiles {
    let target = CloudProjectTarget {
        scope: "fixture".into(),
        workspace: CloudConversationWorkspace::Personal,
        project_id: "project".into(),
    };
    let file = CloudProjectFile {
        id: "file".into(),
        project_id: "project".into(),
        file_name: "Notes 東京 🦀.md".into(),
        mime_type: "text/markdown".into(),
        byte_count: 90,
        checksum_sha256: "a".repeat(64),
        added_at: "today".into(),
        added_by_user_id: None,
        preview_kind: Some(ProjectFilePreviewKind::Text),
        indexing: None,
    };
    let mut state = ProjectFiles::default();
    state
        .accept_list(
            &target,
            CloudProjectFilesResponse {
                target: target.clone(),
                files: vec![file.clone()],
            },
        )
        .unwrap();
    let target = CloudProjectFileTarget {
        project: target,
        file_id: file.id,
    };
    state
        .accept_preview(
            &target,
            CloudProjectFilePreview {
                target: target.clone(),
                checksum_sha256: file.checksum_sha256,
                kind: ProjectFilePreviewKind::Text,
                text: "Exact Tokyo 東京 🦀\n<script>literal text</script>".into(),
                truncated: true,
            },
        )
        .unwrap();
    state
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
            .open_window(size(px(width), px(1000.)), |window, app: &mut App| {
                let view = app.new(|cx| Fixture {
                    contracts: contracts.clone(),
                    palette,
                    files: state(),
                    capabilities: Default::default(),
                    focus: cx.focus_handle(),
                    actions: Vec::new(),
                });
                fixture = Some(view.clone());
                app.new(|cx| gpui_component::Root::new(view, window, cx))
            })?
            .into();
        let fixture = fixture.context("project files fixture missing")?;
        draw(cx, window)?;
        cx.update_window(window, |_, window, app| {
            let focus = fixture.read(app).focus.clone();
            focus.focus(window, app);
        })?;
        key(cx, window, "tab")?;
        key(cx, window, "enter")?;
        key(cx, window, "tab")?;
        key(cx, window, "enter")?;
        key(cx, window, "tab")?;
        input(cx, window, "must not edit a project source")?;
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
                    == Some("Exact Tokyo 東京 🦀\n<script>literal text</script>"),
                "The actual readonly source buffer changed or could not be copied"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        key(cx, window, "tab")?;
        key(cx, window, "enter")?;
        cx.update(|app| {
            let view = fixture.read(app);
            ensure!(matches!(&view.actions[..], [ProjectFileAction::Refresh, ProjectFileAction::Preview(target), ProjectFileAction::Copy(preview)] if target == &preview.target && preview.text == "Exact Tokyo 東京 🦀\n<script>literal text</script>" && preview.truncated), "Project file keyboard actions lost source identity, preview text or truncation: {:?}", view.actions);
            Ok::<_, anyhow::Error>(())
        })?;
        let image = cx.capture_screenshot(window)?;
        image.save(format!("/tmp/agi-gpui-project-files-{theme}-{width}.png"))?;
        key(cx, window, "tab")?;
        key(cx, window, "enter")?;
        cx.update(|app| {
            ensure!(
                matches!(
                    fixture.read(app).actions.last(),
                    Some(ProjectFileAction::ClosePreview)
                ),
                "Close preview was not keyboard reachable"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update_window(window, |_, window, app| {
            fixture.update(app, |view, cx| {
                view.files.operation = Some(uuid::Uuid::new_v4());
                view.actions.clear();
                cx.notify();
            });
            {
                let focus = fixture.read(app).focus.clone();
                focus.focus(window, app);
            };
        })?;
        draw(cx, window)?;
        key(cx, window, "tab")?;
        key(cx, window, "enter")?;
        cx.update(|app| {
            ensure!(
                fixture.read(app).actions.is_empty(),
                "Pending file read exposed a stale control"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update_window(window, |_, window, app| {
            fixture.update(app, |view, cx| {
                view.files.operation = None;
                view.files.preview = None;
                view.capabilities = project_file_controls::FileCapabilities {
                    download: true,
                    reindex: true,
                };
                view.actions.clear();
                cx.notify();
            });
            let focus = fixture.read(app).focus.clone();
            focus.focus(window, app);
        })?;
        draw(cx, window)?;
        for _ in 0..4 {
            key(cx, window, "tab")?;
            key(cx, window, "enter")?;
        }
        cx.update(|app| { let view=fixture.read(app); ensure!(matches!(&view.actions[..], [ProjectFileAction::Refresh,ProjectFileAction::Preview(_),ProjectFileAction::Download(download),ProjectFileAction::Reindex(index)] if download==index && download.checksum_sha256==view.files.rows[0].checksum_sha256), "Download or owner reindex lost its file checksum or target"); Ok::<_,anyhow::Error>(()) })?;
        cx.update_window(window, |_, window, app| {
            fixture.update(app, |view, cx| {
                view.capabilities.reindex = false;
                view.actions.clear();
                cx.notify();
            });
            let focus = fixture.read(app).focus.clone();
            focus.focus(window, app);
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
                    .all(|action| !matches!(action, ProjectFileAction::Reindex(_))),
                "A reader received an owner reindex control"
            );
            Ok::<_, anyhow::Error>(())
        })?;
        cx.update_window(window, |_, window, _| window.remove_window())?;
        eprintln!("{theme} {width}px: project source preview keyboard actions preserve exact text/identity and hide stale controls during reads");
    }
    Ok(())
}
