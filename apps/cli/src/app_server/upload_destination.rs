use crate::cloud::{
    attachments,
    client::{CloudClient, CloudError},
    project_files::upload,
    uploads,
};
use agiworkforce_protocol::{
    account_cloud::CloudHistoryReadParams, cloud_uploads::*, project_files::*,
};
use bytes::Bytes;

pub(super) async fn writable(
    client: &CloudClient,
    target: &CloudUploadTarget,
) -> Result<String, CloudError> {
    match target {
        CloudUploadTarget::Project { project } => upload::writable(client, project).await,
        CloudUploadTarget::Chat { chat } => {
            let page = crate::cloud::chat::read_history_page(
                client,
                CloudHistoryReadParams {
                    scope: chat.scope.clone(),
                    workspace: Some(chat.workspace.clone()),
                    conversation_id: chat.conversation_id.clone(),
                    limit: 1,
                    offset: 0,
                    latest: false,
                    before: None,
                },
            )
            .await?;
            if page.conversation.archived {
                return Err(CloudError::LocalFile(
                    "This conversation is archived. Restore it before uploading files.".into(),
                ));
            }
            Ok(page.conversation.title.unwrap_or_default())
        }
    }
}

pub(super) fn snapshot(
    target: &CloudUploadTarget,
    path: &str,
    selected_at_ms: i64,
) -> Result<(String, String, Bytes), CloudError> {
    match target {
        CloudUploadTarget::Project { .. } => upload::snapshot(path, selected_at_ms),
        CloudUploadTarget::Chat { .. } => attachments::snapshot(path, selected_at_ms),
    }
}

fn project_review(review: &CloudUploadReview) -> Result<CloudProjectUploadReview, CloudError> {
    let CloudUploadTarget::Project { project } = &review.upload.target else {
        return Err(CloudError::Decode(
            "The upload is not a project upload".into(),
        ));
    };
    Ok(CloudProjectUploadReview {
        upload: CloudProjectUploadId {
            target: project.clone(),
            id: review.upload.id.clone(),
        },
        project_name: review.destination_name.clone(),
        file_name: review.file_name.clone(),
        mime_type: review.mime_type.clone(),
        byte_count: review.byte_count,
        checksum_sha256: review.checksum_sha256.clone(),
    })
}

pub(super) async fn create(
    client: &CloudClient,
    review: &CloudUploadReview,
) -> Result<uploads::Session, CloudError> {
    match &review.upload.target {
        CloudUploadTarget::Project { .. } => upload::create(client, &project_review(review)?).await,
        CloudUploadTarget::Chat { .. } => attachments::create_upload(client, review).await,
    }
}

pub(super) async fn complete(
    client: &CloudClient,
    session: &uploads::Session,
    review: &CloudUploadReview,
) -> Result<CloudUploadedFile, CloudError> {
    match &review.upload.target {
        CloudUploadTarget::Project { .. } => Ok(CloudUploadedFile::Project {
            file: upload::complete(client, session, &project_review(review)?).await?,
        }),
        CloudUploadTarget::Chat { .. } => Ok(CloudUploadedFile::Chat {
            attachment: attachments::complete_upload(client, session, review).await?,
        }),
    }
}
