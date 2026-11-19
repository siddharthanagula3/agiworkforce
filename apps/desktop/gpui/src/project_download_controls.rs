use crate::{
    config::{NativeContracts, Palette},
    native_controls,
    project_download::ProjectDownload,
};
use agiworkforce_protocol::project_files::*;
use gpui::{div, prelude::*, px, Context, Window};
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DownloadAction {
    Review(CloudProjectDownloadId),
    Start(CloudProjectDownloadId),
    Read(CloudProjectDownloadId),
    Cancel(CloudProjectDownloadId),
    Close(CloudProjectDownloadId),
    Details(uuid::Uuid),
    CloseSelection(uuid::Uuid),
    Reconnect,
    Reveal(CloudProjectDownloadId),
}
pub fn controls<V: 'static>(
    state: &ProjectDownload,
    contracts: &NativeContracts,
    palette: Palette,
    handler: impl Fn(&mut V, DownloadAction, &mut Window, &mut Context<V>) + Clone + 'static,
    cx: &mut Context<V>,
) -> gpui::Stateful<gpui::Div> {
    let mut panel = div()
        .id("project-download-progress")
        .w_full()
        .min_w_0()
        .flex()
        .flex_col()
        .gap_1()
        .px(px(contracts.frame.viewport_gutter));
    let Some(target) = &state.target else {
        return panel;
    };
    panel = panel
        .role(gpui::Role::Group)
        .aria_label("Project file download")
        .text_size(px(contracts.frame.sidebar_font_size))
        .line_height(px(contracts.frame.sidebar_line_height));
    let button =
        |id: &'static str, label: &'static str, action: DownloadAction, cx: &mut Context<V>| {
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
    let Some(snapshot) = &state.snapshot else {
        if state.operation.is_some() {
            return panel.child(gpui::text!("Preparing the selected save destination…"));
        }
        return panel
            .child(gpui::text!("The file could not be prepared for saving."))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap_2()
                    .child(button(
                        "download-prepare-error",
                        "Details",
                        DownloadAction::Details(state.selection),
                        cx,
                    ))
                    .child(button(
                        "download-close-selection",
                        if state.preparation_unknown {
                            "Reconnect account"
                        } else {
                            "Close"
                        },
                        if state.preparation_unknown {
                            DownloadAction::Reconnect
                        } else {
                            DownloadAction::CloseSelection(state.selection)
                        },
                        cx,
                    )),
            );
    };
    if snapshot.review.download.file != *target {
        return panel.child(gpui::text!("This download needs a fresh account check."));
    }
    let review = &snapshot.review;
    let id = &review.download;
    panel = panel
        .aria_label(format!(
            "Download {} from {} / {} to {}",
            review.file.file_name, state.workspace_name, review.project_name, review.destination
        ))
        .child(div().min_w_0().truncate().child(gpui::text!(format!(
            "Download from {}",
            review.project_name
        ))))
        .child(div().min_w_0().truncate().child(gpui::text!(format!(
            "{} · {}",
            state.workspace_name, review.file.file_name
        ))))
        .child(gpui::text!(match snapshot.phase {
            ProjectDownloadPhase::Ready => "Save destination ready for review".into(),
            ProjectDownloadPhase::Downloading => format!(
                "Downloading: {} of {} bytes",
                snapshot.received_bytes, review.file.byte_count
            ),
            ProjectDownloadPhase::Saving => "Saving the verified file…".into(),
            ProjectDownloadPhase::Cancelling => "Stopping download…".into(),
            ProjectDownloadPhase::Succeeded => "File saved to the selected destination".into(),
            ProjectDownloadPhase::Cancelled => "Download stopped before saving".into(),
            ProjectDownloadPhase::Failed => if snapshot.uncertain {
                "Save status unconfirmed. Check the destination before selecting it again."
            } else {
                "Download could not be saved."
            }
            .into(),
        }));
    if state.operation.is_some() {
        return panel;
    }
    let mut actions = div().flex().flex_wrap().gap_2();
    if state.error.is_some() || snapshot.error.is_some() {
        actions = actions.child(button(
            "download-error",
            "Details",
            DownloadAction::Details(state.selection),
            cx,
        ));
    }
    if state.error.is_some() {
        actions = actions.child(button(
            "download-read-status",
            "Check status",
            DownloadAction::Read(id.clone()),
            cx,
        ));
    }
    if snapshot.phase == ProjectDownloadPhase::Ready {
        actions = actions.child(button(
            "review-project-download",
            "Review save",
            DownloadAction::Review(id.clone()),
            cx,
        ));
    }
    if snapshot.phase == ProjectDownloadPhase::Failed && snapshot.retryable {
        actions = actions.child(button(
            "retry-project-download",
            "Retry",
            DownloadAction::Start(id.clone()),
            cx,
        ));
    }
    if snapshot.phase == ProjectDownloadPhase::Downloading && snapshot.cancelable {
        actions = actions.child(button(
            "stop-project-download",
            "Stop",
            DownloadAction::Cancel(id.clone()),
            cx,
        ));
    }
    if snapshot.phase == ProjectDownloadPhase::Succeeded {
        actions = actions.child(button(
            "reveal-project-download",
            "Show file",
            DownloadAction::Reveal(id.clone()),
            cx,
        ));
    }
    if !snapshot.phase.running() {
        actions = actions.child(button(
            "close-project-download",
            "Close",
            DownloadAction::Close(id.clone()),
            cx,
        ));
    }
    panel.child(actions)
}
