use crate::{
    config::{NativeContracts, Palette},
    native_controls,
    project_upload::ProjectUpload,
};
use agiworkforce_protocol::project_files::*;
use gpui::{div, prelude::*, px, Context, SharedString, Window};
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum UploadAction {
    Reconnect,
    Details(uuid::Uuid),
    CloseSelection(uuid::Uuid),
    Review(CloudProjectUploadId),
    Start(CloudProjectUploadId),
    Read(CloudProjectUploadId),
    Cancel(CloudProjectUploadId),
    Close(CloudProjectUploadId),
}
pub fn controls<V: 'static>(
    state: &ProjectUpload,
    contracts: &NativeContracts,
    palette: Palette,
    handler: impl Fn(&mut V, UploadAction, &mut Window, &mut Context<V>) + Clone + 'static,
    cx: &mut Context<V>,
) -> gpui::Stateful<gpui::Div> {
    let mut panel = div()
        .id("project-upload-progress")
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
        .aria_label("Project file upload")
        .text_size(px(contracts.frame.sidebar_font_size))
        .line_height(px(contracts.frame.sidebar_line_height));
    let Some(snapshot) = &state.snapshot else {
        if state.operation.is_some() {
            return panel.child(gpui::text!("Preparing selected file for review…"));
        }
        let action = if state.preparation_unknown {
            UploadAction::Reconnect
        } else {
            UploadAction::CloseSelection(state.selection)
        };
        let label = if state.preparation_unknown {
            "Reconnect account"
        } else {
            "Close file selection"
        };
        panel = panel.child(gpui::text!("The file selection could not be prepared."));
        let details = handler.clone();
        let selection = state.selection;
        panel = panel.child(native_controls::compact_button(
            "upload-selection-error",
            "Details",
            move |view, window, cx| details(view, UploadAction::Details(selection), window, cx),
            contracts,
            palette,
            cx,
        ));
        return panel.child(native_controls::compact_button(
            "close-upload-selection",
            label,
            move |view, window, cx| handler(view, action.clone(), window, cx),
            contracts,
            palette,
            cx,
        ));
    };
    let review = &snapshot.review;
    if review.upload.target != *target {
        return panel.child(gpui::text!("This upload requires a fresh account check."));
    }
    panel = panel.aria_label(format!(
        "Project file upload: {} to {} / {}",
        review.file_name, state.workspace_name, review.project_name
    ));
    panel = panel
        .child(
            div()
                .min_w_0()
                .truncate()
                .child(gpui::text!(format!("Upload to {}", review.project_name))),
        )
        .child(div().min_w_0().truncate().child(gpui::text!(format!(
            "{} · {}",
            state.workspace_name, review.file_name
        ))));
    panel = panel.child(gpui::text!(match snapshot.phase {
        ProjectUploadPhase::Ready => "File ready for upload review".into(),
        ProjectUploadPhase::Uploading => format!(
            "Uploading: {} of {} bytes",
            snapshot.uploaded_bytes, review.byte_count
        ),
        ProjectUploadPhase::Completing => "Confirming the stored project file…".into(),
        ProjectUploadPhase::Cancelling => "Stopping upload…".into(),
        ProjectUploadPhase::Succeeded => "File added to the Cloud project".into(),
        ProjectUploadPhase::Cancelled => "Upload stopped before completion".into(),
        ProjectUploadPhase::Failed => if snapshot.uncertain {
            "Upload status unconfirmed. Refresh project files before selecting this file again."
        } else {
            "Upload paused. The reviewed file snapshot is retained."
        }
        .into(),
    }));

    if state.operation.is_some() {
        return panel;
    }
    let button =
        |id: &'static str, label: &'static str, action: UploadAction, cx: &mut Context<V>| {
            let handler = handler.clone();
            native_controls::compact_button(
                SharedString::from(id),
                label,
                move |view, window, cx| handler(view, action.clone(), window, cx),
                contracts,
                palette,
                cx,
            )
        };
    let id = &review.upload;
    let mut actions = div().flex().flex_wrap().gap_2();
    if state.error.is_some() || snapshot.error.is_some() {
        actions = actions.child(button(
            "project-upload-error",
            "Details",
            UploadAction::Details(state.selection),
            cx,
        ));
    }
    if state.error.is_some() {
        actions = actions.child(button(
            "read-project-upload",
            "Refresh upload status",
            UploadAction::Read(id.clone()),
            cx,
        ));
    }

    if snapshot.phase == ProjectUploadPhase::Ready {
        actions = actions.child(button(
            "review-project-upload",
            "Review upload",
            UploadAction::Review(id.clone()),
            cx,
        ));
    }
    if snapshot.phase == ProjectUploadPhase::Failed && snapshot.retryable {
        actions = actions.child(button(
            "retry-project-upload",
            if snapshot.uncertain {
                "Check status"
            } else {
                "Resume"
            },
            UploadAction::Start(id.clone()),
            cx,
        ));
    }
    if snapshot.cancelable && snapshot.phase != ProjectUploadPhase::Ready {
        actions = actions.child(button(
            "stop-project-upload",
            "Stop",
            UploadAction::Cancel(id.clone()),
            cx,
        ));
    }
    if !snapshot.phase.running() {
        actions = actions.child(button(
            "close-project-upload",
            "Close",
            UploadAction::Close(id.clone()),
            cx,
        ));
    }
    panel.child(actions)
}
