use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_protocol::{cloud_uploads::*, project_files::*};

pub(super) fn prepare(params: CloudProjectUploadPrepareParams) -> CloudUploadPrepareParams {
    CloudUploadPrepareParams {
        target: CloudUploadTarget::Project {
            project: params.target,
        },
        path: params.path,
        selected_at_ms: params.selected_at_ms,
    }
}
pub(super) fn id(id: CloudProjectUploadId) -> CloudUploadId {
    CloudUploadId {
        target: CloudUploadTarget::Project { project: id.target },
        id: id.id,
    }
}
pub(super) fn snapshot(
    snapshot: CloudUploadSnapshot,
) -> Result<CloudProjectUploadSnapshot, DeveloperSessionHostError> {
    let review = snapshot.review;
    let CloudUploadTarget::Project { project } = review.upload.target else {
        return Err(DeveloperSessionHostError::invalid_request(
            "This upload is not a project upload",
        ));
    };
    let file = match snapshot.file {
        Some(CloudUploadedFile::Project { file }) => Some(file),
        None => None,
        Some(_) => {
            return Err(DeveloperSessionHostError::invalid_request(
                "This receipt is not a project file",
            ))
        }
    };
    let phase = match snapshot.phase {
        CloudUploadPhase::Ready => ProjectUploadPhase::Ready,
        CloudUploadPhase::Uploading => ProjectUploadPhase::Uploading,
        CloudUploadPhase::Completing => ProjectUploadPhase::Completing,
        CloudUploadPhase::Cancelling => ProjectUploadPhase::Cancelling,
        CloudUploadPhase::Succeeded => ProjectUploadPhase::Succeeded,
        CloudUploadPhase::Failed => ProjectUploadPhase::Failed,
        CloudUploadPhase::Cancelled => ProjectUploadPhase::Cancelled,
    };
    Ok(CloudProjectUploadSnapshot {
        review: CloudProjectUploadReview {
            upload: CloudProjectUploadId {
                target: project,
                id: review.upload.id,
            },
            project_name: review.destination_name,
            file_name: review.file_name,
            mime_type: review.mime_type,
            byte_count: review.byte_count,
            checksum_sha256: review.checksum_sha256,
        },
        phase,
        uploaded_bytes: snapshot.uploaded_bytes,
        file,
        error: snapshot.error,
        uncertain: snapshot.uncertain,
        retryable: snapshot.retryable,
        cancelable: snapshot.cancelable,
    })
}
