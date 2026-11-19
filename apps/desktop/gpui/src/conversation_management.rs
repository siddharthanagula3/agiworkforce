use agiworkforce_protocol::account_cloud::{
    CloudConversationChange, CloudConversationUpdateParams, CloudHistoryConversation,
};
use anyhow::{ensure, Result};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ConversationOperationKind {
    Save,
    Review,
}

pub struct ConversationOperation {
    pub id: uuid::Uuid,
    pub kind: ConversationOperationKind,
}

#[derive(Clone)]
pub enum ConversationAction {
    Rename(CloudConversationUpdateParams),
    SaveTitle(uuid::Uuid),
    CancelTitle(uuid::Uuid),
    Update(CloudConversationUpdateParams),
    ReviewLatest,
}

pub struct TitleEdit {
    pub id: uuid::Uuid,
    pub request: CloudConversationUpdateParams,
}

#[derive(Default)]
pub struct ConversationManagement {
    pub editing: Option<TitleEdit>,
    pub operation: Option<ConversationOperation>,
    pub needs_reload: bool,
    pub error: Option<String>,
}

pub fn update_request(
    scope: &str,
    conversation: &CloudHistoryConversation,
    change: CloudConversationChange,
) -> Result<CloudConversationUpdateParams> {
    let version = conversation.version.clone().ok_or_else(|| {
        anyhow::anyhow!("Reload the latest messages to obtain this conversation's revision")
    })?;
    Ok(CloudConversationUpdateParams {
        scope: scope.into(),
        conversation_id: conversation.id.clone(),
        organization_id: conversation.organization_id.clone(),
        expected_version: version,
        change,
    })
}

pub fn same_target(
    scope: &str,
    conversation: &CloudHistoryConversation,
    request: &CloudConversationUpdateParams,
) -> bool {
    scope == request.scope
        && conversation.id == request.conversation_id
        && conversation.organization_id == request.organization_id
}

pub fn require_unchanged(
    scope: &str,
    conversation: &CloudHistoryConversation,
    request: &CloudConversationUpdateParams,
) -> Result<()> {
    ensure!(
        same_target(scope, conversation, request)
            && conversation.version.as_ref() == Some(&request.expected_version),
        "The selected conversation changed. Review its latest metadata before editing."
    );
    Ok(())
}

impl crate::cloud_history::CloudHistory {
    pub fn accept_metadata(
        &mut self,
        scope: &str,
        original: &CloudHistoryConversation,
        updated: CloudHistoryConversation,
    ) -> Result<()> {
        let detail = self
            .detail
            .as_mut()
            .ok_or_else(|| anyhow::anyhow!("The conversation is no longer selected"))?;
        ensure!(
            detail.scope == scope
                && detail.conversation.id == original.id
                && detail.conversation.organization_id == original.organization_id
                && updated.id == original.id
                && updated.organization_id == original.organization_id,
            "The metadata belongs to a different account, conversation or organization"
        );
        detail.conversation = updated.clone();
        let belongs = if self.archived_only {
            updated.archived
        } else {
            !updated.archived || !self.query.trim().is_empty()
        };
        if !belongs {
            self.conversations.retain(|row| row.id != updated.id);
        } else if let Some(row) = self
            .conversations
            .iter_mut()
            .find(|row| row.id == updated.id)
        {
            *row = updated;
        }
        Ok(())
    }
}

impl ConversationManagement {
    pub fn is_saving(&self) -> bool {
        self.operation
            .as_ref()
            .is_some_and(|operation| operation.kind == ConversationOperationKind::Save)
    }
}
