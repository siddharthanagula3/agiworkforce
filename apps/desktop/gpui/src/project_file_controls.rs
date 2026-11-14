use crate::{
    config::{NativeContracts, Palette},
    native_controls,
    project_files::ProjectFiles,
};
use agiworkforce_protocol::project_files::*;
use gpui::{div, prelude::*, px, rgb, Context, Focusable, SharedString, Window};
use gpui_component::input::{Textarea, TextareaState};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProjectFileAction {
    Download(CloudProjectFileVersion),
    Reindex(CloudProjectFileVersion),
    Refresh,
    Preview(CloudProjectFileTarget),
    Copy(CloudProjectFilePreview),
    ClosePreview,
}

#[derive(Default, Clone, Copy)]
pub struct FileCapabilities {
    pub download: bool,
    pub reindex: bool,
}

pub fn controls<V: 'static>(
    state: &ProjectFiles,
    capabilities: FileCapabilities,
    contracts: &NativeContracts,
    palette: Palette,
    handler: impl Fn(&mut V, ProjectFileAction, &mut Window, &mut Context<V>) + Clone + 'static,
    window: &mut Window,
    cx: &mut Context<V>,
) -> gpui::Stateful<gpui::Div> {
    let button =
        |id: SharedString, label: SharedString, action: ProjectFileAction, cx: &mut Context<V>| {
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
        .id("project-files")
        .role(gpui::Role::Group)
        .aria_label("Project files")
        .w_full()
        .min_w_0()
        .flex()
        .flex_col()
        .gap_2()
        .child(gpui::text!("Project files"));
    if let Some(notice) = &state.notice {
        panel = panel.child(gpui::text!(notice.clone()));
    }
    if let Some(error) = &state.error {
        panel = panel.child(gpui::text!(error.clone()));
    }
    if state.operation.is_some() {
        return if state.notice.is_some() {
            panel
        } else {
            panel.child(gpui::text!("Loading project files…"))
        };
    }
    panel = panel.child(button(
        "refresh-project-files".into(),
        if state.loaded {
            "Refresh files"
        } else {
            "Load files"
        }
        .into(),
        ProjectFileAction::Refresh,
        cx,
    ));
    if state.loaded && state.rows.is_empty() {
        panel = panel.child(gpui::text!("This project has no files."));
    }
    for file in &state.rows {
        let mut row = div()
            .id(SharedString::from(format!("project-file:{}", file.id)))
            .w_full()
            .min_w_0()
            .flex()
            .flex_col()
            .gap_1()
            .child(
                div()
                    .min_w_0()
                    .truncate()
                    .child(gpui::text!(file.file_name.clone())),
            )
            .child(gpui::text!(format!("{} bytes", file.byte_count)));
        row = row.child(gpui::text!(match &file.indexing {
            Some(index) => match index.status.as_str() {
                "pending" => "Waiting to index",
                "indexing" => "Indexing…",
                "indexed" => "Ready for project search",
                "stale" => "Index needs refresh",
                "failed" => "Could not index this file",
                _ => "Index status unavailable",
            },
            None => "Index status unavailable",
        }));
        if let Some(error) = file
            .indexing
            .as_ref()
            .and_then(|index| index.error.as_ref())
        {
            row = row.child(gpui::text!(error.clone()));
        }
        if file.preview_kind.is_some() {
            if let Some(target) = &state.target {
                row = row.child(
                    button(
                        format!("preview-project-file:{}", file.id).into(),
                        format!("Preview {}", file.file_name).into(),
                        ProjectFileAction::Preview(CloudProjectFileTarget {
                            project: target.clone(),
                            file_id: file.id.clone(),
                        }),
                        cx,
                    )
                    .w_full()
                    .min_w_0()
                    .truncate(),
                );
            }
        } else {
            row = row.child(gpui::text!("Text preview unavailable for this file type."));
        }
        if let Some(target) = &state.target {
            let version = CloudProjectFileVersion {
                target: CloudProjectFileTarget {
                    project: target.clone(),
                    file_id: file.id.clone(),
                },
                checksum_sha256: file.checksum_sha256.clone(),
            };
            let mut actions = div().flex().flex_wrap().gap_2();
            if capabilities.download {
                actions = actions.child(button(
                    format!("download-project-file:{}", file.id).into(),
                    "Download".into(),
                    ProjectFileAction::Download(version.clone()),
                    cx,
                ));
            }
            if capabilities.reindex
                && !state.mutation_uncertain
                && !file
                    .indexing
                    .as_ref()
                    .is_some_and(|index| matches!(index.status.as_str(), "pending" | "indexing"))
            {
                actions = actions.child(button(
                    format!("reindex-project-file:{}", file.id).into(),
                    "Reindex".into(),
                    ProjectFileAction::Reindex(version),
                    cx,
                ));
            }
            row = row.child(actions);
        }
        panel = panel.child(row);
    }
    if let Some(preview) = &state.preview {
        let id = SharedString::from(format!(
            "project-file-preview:{}:{:?}:{}:{}:{}",
            preview.target.project.scope,
            preview.target.project.workspace,
            preview.target.project.project_id,
            preview.target.file_id,
            preview.checksum_sha256
        ));
        let source = window.use_keyed_state(id.clone(), cx, |window, cx| {
            TextareaState::new(window, cx).auto_grow(2, 10)
        });
        if source.read(cx).value().as_str() != preview.text {
            source.update(cx, |input, cx| {
                input.set_value(preview.text.clone(), window, cx)
            });
        }
        let name = state
            .rows
            .iter()
            .find(|file| file.id == preview.target.file_id)
            .map(|file| file.file_name.clone())
            .unwrap_or_default();
        panel = panel.child(gpui::text!(format!("Text preview: {name}")));
        if preview.kind == ProjectFilePreviewKind::Table {
            panel = panel.child(gpui::text!("Table shown as plain text."));
        }
        if preview.truncated {
            panel = panel.child(gpui::text!(
                "This preview is truncated. Copy preview includes only the text shown."
            ));
        }
        panel = panel.child(
            div()
                .id(id)
                .track_focus(&source.read(cx).focus_handle(cx))
                .w_full()
                .min_w_0()
                .border(px(contracts.stroke_width))
                .border_color(gpui::transparent_black())
                .focus(move |style| style.border_color(rgb(palette.foreground)))
                .child(
                    Textarea::new(&source)
                        .aria_label(format!("Project file text preview: {name}"))
                        .readonly(true)
                        .appearance(false)
                        .bordered(false)
                        .w_full()
                        .min_w_0()
                        .truncate(),
                ),
        );
        panel = panel.child(
            div()
                .flex()
                .flex_wrap()
                .gap_2()
                .child(button(
                    "copy-project-file-preview".into(),
                    "Copy preview".into(),
                    ProjectFileAction::Copy(preview.clone()),
                    cx,
                ))
                .child(button(
                    "close-project-file-preview".into(),
                    "Close preview".into(),
                    ProjectFileAction::ClosePreview,
                    cx,
                )),
        );
    }
    panel
}
