//! Hosted chat history: the same `/api/chat/sync` records the web app, the
//! Chrome extension and mobile read, so a CLI turn appears in the sidebar of
//! every other client signed in to the account.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::client::{CloudClient, CloudError};
use super::state::{SyncSection, SyncState, INITIAL_CURSOR};

pub const CHAT_SYNC_PATH: &str = "/api/chat/sync";
pub const SYNC_PROTOCOL_VERSION: u8 = 2;
const MESSAGE_CONTENT_MAX_CHARS: usize = 1_000_000;
fn title_max_chars() -> usize {
    super::conversation_contract::contract().title_max_length
}

/// Roles the hosted schema stores. A CLI message with any other role is a
/// transport detail of this process and is not part of the account's history.
const SYNCED_ROLES: [&str; 2] = ["user", "assistant"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TurnMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionSnapshot {
    pub session_id: String,
    pub title: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub project_id: Option<String>,
    pub messages: Vec<TurnMessage>,
    /// The account already holds these rows; pushing them under new ids would
    /// duplicate the history.
    pub hosted_message_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationPushItem {
    pub id: String,
    pub title: String,
    pub model: Option<String>,
    pub project_id: Option<String>,
    pub base_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePushItem {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub metadata: serde_json::Value,
    pub base_version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPushRequest {
    pub protocol_version: u8,
    pub conversations: Vec<ConversationPushItem>,
    pub messages: Vec<MessagePushItem>,
}

impl ChatPushRequest {
    pub fn is_empty(&self) -> bool {
        self.conversations.is_empty() && self.messages.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct AppliedRow {
    pub id: String,
    pub server_version: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct ConversationDelta {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub project_id: Option<String>,
    pub updated_at: String,
    #[serde(default)]
    pub deleted_at: Option<String>,
    #[serde(default)]
    pub archived: bool,
    pub server_version: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct MessageDelta {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub deleted_at: Option<String>,
    pub server_version: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatPullResponse {
    #[serde(default)]
    pub conversations: Vec<ConversationDelta>,
    #[serde(default)]
    pub messages: Vec<MessageDelta>,
    pub cursor: String,
    #[serde(default)]
    pub has_more: bool,
}

trait SyncRow {
    fn id(&self) -> &str;
    fn version(&self) -> &str;
}

impl SyncRow for ConversationDelta {
    fn id(&self) -> &str {
        &self.id
    }
    fn version(&self) -> &str {
        &self.server_version
    }
}

impl SyncRow for MessageDelta {
    fn id(&self) -> &str {
        &self.id
    }
    fn version(&self) -> &str {
        &self.server_version
    }
}

fn absorb_newest<T: SyncRow>(rows: &mut Vec<T>, page: Vec<T>) {
    let mut positions: HashMap<String, usize> = rows
        .iter()
        .enumerate()
        .map(|(index, row)| (row.id().to_string(), index))
        .collect();
    for row in page {
        match positions.get(row.id()) {
            Some(&index) => {
                let superseded = match (
                    rows[index].version().parse::<u128>(),
                    row.version().parse::<u128>(),
                ) {
                    (Ok(kept), Ok(incoming)) => incoming >= kept,
                    _ => true,
                };
                if superseded {
                    rows[index] = row;
                }
            }
            None => {
                positions.insert(row.id().to_string(), rows.len());
                rows.push(row);
            }
        }
    }
}

impl ChatPullResponse {
    /// Pages deliberately overlap at the slowest table's frontier, so a row can
    /// arrive on more than one page; keep one copy of each, the newest.
    fn absorb(&mut self, page: ChatPullResponse) {
        absorb_newest(&mut self.conversations, page.conversations);
        absorb_newest(&mut self.messages, page.messages);
        self.cursor = page.cursor;
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct AppliedGroups {
    #[serde(default)]
    pub conversations: Vec<AppliedRow>,
    #[serde(default)]
    pub messages: Vec<AppliedRow>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConversationConflict {
    pub id: String,
    #[serde(default)]
    pub current: Option<ConversationDelta>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MessageConflict {
    pub id: String,
    #[serde(default)]
    pub current: Option<MessageDelta>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ConflictGroups {
    #[serde(default)]
    pub conversations: Vec<ConversationConflict>,
    #[serde(default)]
    pub messages: Vec<MessageConflict>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatPushResponse {
    #[serde(default)]
    pub applied: AppliedGroups,
    #[serde(default)]
    pub conflicts: ConflictGroups,
    pub cursor: String,
}

/// The hosted conversation id for a CLI session. A session created by this CLI
/// already carries a UUID, and that UUID *is* the conversation, so the same
/// turn pushed twice from two processes lands on one row. A session id from an
/// older build is not a UUID, so it is projected into one deterministically
/// rather than being given a fresh id on every push.
pub fn conversation_id_for(session_id: &str) -> String {
    match Uuid::parse_str(session_id) {
        Ok(parsed) => parsed.to_string(),
        Err(_) => Uuid::new_v5(
            &Uuid::NAMESPACE_URL,
            format!("agiworkforce:cli:session:{session_id}").as_bytes(),
        )
        .to_string(),
    }
}

/// The hosted id for the message at `index` of a conversation. Derived from
/// position so re-pushing a session updates the rows it already wrote instead
/// of appending the whole transcript again.
pub fn message_id_for(conversation_id: &str, index: usize) -> String {
    Uuid::new_v5(
        &Uuid::NAMESPACE_URL,
        format!("agiworkforce:cli:message:{conversation_id}:{index}").as_bytes(),
    )
    .to_string()
}

/// Keyed on the last account message, so ids from separate imports never collide.
fn continued_message_id_for(conversation_id: &str, last_hosted_id: &str, ordinal: usize) -> String {
    Uuid::new_v5(
        &Uuid::NAMESPACE_URL,
        format!("agiworkforce:cli:message:{conversation_id}:after:{last_hosted_id}:{ordinal}")
            .as_bytes(),
    )
    .to_string()
}

fn truncate(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    value.chars().take(max_chars).collect()
}

pub fn message_metadata(session_id: &str) -> serde_json::Value {
    serde_json::json!({
        "surface": "cli",
        "runtime": "managed-cloud",
        "localSessionId": truncate(session_id, 200),
    })
}

/// Build the push body for a session. Records whose base version the hosted
/// side already told us about are sent as updates; everything else is an
/// insert. System messages and messages with no text carry no history and are
/// left out entirely.
pub fn build_push(snapshot: &SessionSnapshot, state: &SyncState) -> ChatPushRequest {
    let conversation_id = conversation_id_for(&snapshot.session_id);
    let title = {
        let trimmed = snapshot.title.trim();
        if trimmed.is_empty() {
            "Untitled".to_string()
        } else {
            truncate(trimmed, title_max_chars())
        }
    };

    let conversations = vec![ConversationPushItem {
        id: conversation_id.clone(),
        title,
        model: snapshot.model.clone(),
        project_id: snapshot.project_id.clone(),
        base_version: state.conversations.base_version(&conversation_id),
    }];

    let metadata = message_metadata(&snapshot.session_id);
    let last_hosted_id = snapshot.hosted_message_ids.last();
    let messages = snapshot
        .messages
        .iter()
        .enumerate()
        .filter(|(_, message)| SYNCED_ROLES.contains(&message.role.as_str()))
        .filter(|(_, message)| !message.content.trim().is_empty())
        .enumerate()
        .map(|(ordinal, (index, message))| {
            let id = match (snapshot.hosted_message_ids.get(ordinal), last_hosted_id) {
                (Some(hosted), _) => hosted.clone(),
                (None, Some(last)) => continued_message_id_for(&conversation_id, last, ordinal),
                (None, None) => message_id_for(&conversation_id, index),
            };
            MessagePushItem {
                base_version: state.messages.base_version(&id),
                id,
                conversation_id: conversation_id.clone(),
                role: message.role.clone(),
                content: truncate(&message.content, MESSAGE_CONTENT_MAX_CHARS),
                model: snapshot.model.clone(),
                provider: snapshot.provider.clone(),
                metadata: metadata.clone(),
            }
        })
        .collect();

    ChatPushRequest {
        protocol_version: SYNC_PROTOCOL_VERSION,
        conversations,
        messages,
    }
}

/// Fold a push response into the device's sync state.
///
/// Only applied rows advance their versions. A conflict does not replace the
/// local content, so adopting its version would let the next push overwrite
/// the hosted edit with that stale content. The pull cursor stays unchanged:
/// a push reply can pass rows another device wrote since the last pull.
pub fn apply_push_response(response: &ChatPushResponse, state: &mut SyncState) {
    for row in &response.applied.conversations {
        state.conversations.record(&row.id, &row.server_version);
    }
    for row in &response.applied.messages {
        state.messages.record(&row.id, &row.server_version);
    }
}

/// Record versions only after adopting the corresponding content into the
/// local snapshots that will be pushed. Listing hosted rows alone is not adoption.
pub fn apply_pull_response(response: &ChatPullResponse, state: &mut SyncState) {
    for conversation in &response.conversations {
        state
            .conversations
            .record(&conversation.id, &conversation.server_version);
    }
    for message in &response.messages {
        state.messages.record(&message.id, &message.server_version);
    }
    state.conversations.advance(&response.cursor);
}

/// A hosted conversation with the messages this pull carried for it.
#[derive(Debug, Clone, PartialEq)]
pub struct HostedConversation {
    pub id: String,
    pub title: String,
    pub model: Option<String>,
    pub project_id: Option<String>,
    pub updated_at: String,
    pub archived: bool,
    pub server_version: String,
    pub messages: Vec<HostedMessage>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HostedMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub server_version: String,
}

/// Nonempty versions require prior adoption of the corresponding local content.
/// The single-conversation response rows currently supply no sync versions.
pub fn record_hosted(conversation: &HostedConversation, state: &mut SyncState) {
    if !conversation.server_version.is_empty() {
        state
            .conversations
            .record(&conversation.id, &conversation.server_version);
    }
    for message in conversation
        .messages
        .iter()
        .filter(|message| !message.server_version.is_empty())
    {
        state.messages.record(&message.id, &message.server_version);
    }
}

/// The server version changes on every edit, so only creation time keeps turn order.
fn turn_position(message: &MessageDelta) -> (Option<chrono::DateTime<chrono::Utc>>, u128) {
    (
        message
            .created_at
            .as_deref()
            .and_then(|created| chrono::DateTime::parse_from_rfc3339(created).ok())
            .map(|created| created.with_timezone(&chrono::Utc)),
        message.server_version.parse().unwrap_or(u128::MAX),
    )
}

/// Assemble whole conversations out of a delta pull, dropping tombstoned rows.
pub fn assemble(response: &ChatPullResponse) -> Vec<HostedConversation> {
    let mut conversations: Vec<HostedConversation> = response
        .conversations
        .iter()
        .filter(|conversation| conversation.deleted_at.is_none())
        .map(|conversation| HostedConversation {
            id: conversation.id.clone(),
            title: conversation.title.clone(),
            model: conversation.model.clone(),
            project_id: conversation.project_id.clone(),
            updated_at: conversation.updated_at.clone(),
            archived: conversation.archived,
            server_version: conversation.server_version.clone(),
            messages: Vec::new(),
        })
        .collect();

    let mut messages: Vec<&MessageDelta> = response.messages.iter().collect();
    messages.sort_by_key(|message| turn_position(message));
    for message in messages {
        if message.deleted_at.is_some() {
            continue;
        }
        if let Some(conversation) = conversations
            .iter_mut()
            .find(|conversation| conversation.id == message.conversation_id)
        {
            conversation.messages.push(HostedMessage {
                id: message.id.clone(),
                role: message.role.clone(),
                content: message.content.clone(),
                server_version: message.server_version.clone(),
            });
        }
    }

    conversations.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    conversations
}

pub const CONVERSATIONS_PATH: &str = "/api/chat/conversations";

pub fn normalize_conversation_revision(value: &str) -> Option<String> {
    let value = value.trim().strip_prefix("W/").unwrap_or(value.trim());
    let value = if value.starts_with('"') || value.ends_with('"') {
        value.strip_prefix('"')?.strip_suffix('"')?
    } else {
        value
    };
    if value.is_empty()
        || value.len() > i64::MAX.to_string().len()
        || !value.bytes().all(|byte| byte.is_ascii_digit())
    {
        return None;
    }
    let value = value.parse::<i64>().ok()?;
    Some(format!("\"{value}\""))
}

pub fn validate_conversation_update(
    params: &agiworkforce_protocol::account_cloud::CloudConversationUpdateParams,
) -> Result<(), String> {
    if Uuid::parse_str(&params.conversation_id).is_err()
        || params
            .organization_id
            .as_ref()
            .is_some_and(|id| Uuid::parse_str(id).is_err())
    {
        return Err("The conversation or organization identity is invalid".into());
    }
    if normalize_conversation_revision(&params.expected_version).is_none() {
        return Err("An exact conversation revision is required".into());
    }
    if let agiworkforce_protocol::account_cloud::CloudConversationChange::Rename { title } =
        &params.change
    {
        if title.trim().is_empty() || title.encode_utf16().count() > title_max_chars() {
            return Err(format!(
                "Enter a nonempty title with {} characters or fewer.",
                title_max_chars()
            ));
        }
    }
    if let agiworkforce_protocol::account_cloud::CloudConversationChange::Model { model } =
        &params.change
    {
        if model.trim().is_empty() || model != model.trim() {
            return Err("Choose an available model from the account catalogue".into());
        }
    }
    Ok(())
}

pub async fn update_conversation(
    client: &CloudClient,
    params: agiworkforce_protocol::account_cloud::CloudConversationUpdateParams,
) -> Result<agiworkforce_protocol::account_cloud::CloudConversationUpdateResponse, CloudError> {
    use agiworkforce_protocol::account_cloud::{
        CloudConversationChange, CloudConversationUpdateResponse,
    };
    validate_conversation_update(&params).map_err(CloudError::Decode)?;
    let version = normalize_conversation_revision(&params.expected_version)
        .ok_or_else(|| CloudError::Decode("An exact conversation revision is required".into()))?;
    let client = client.with_workspace(Some(
        &agiworkforce_protocol::account_cloud::CloudConversationWorkspace::from_organization(
            params.organization_id.as_deref(),
        ),
    ))?;
    let body = match &params.change {
        CloudConversationChange::Rename { title } => {
            serde_json::json!({"title": title})
        }
        CloudConversationChange::Model { model } => serde_json::json!({"model": model}),
        CloudConversationChange::Pin { pinned } => serde_json::json!({"pinned": pinned}),
        CloudConversationChange::Archive { archived } => serde_json::json!({"archived": archived}),
    };
    #[derive(Deserialize)]
    struct Updated {
        conversation: ConversationRow,
    }
    let path = format!(
        "{CONVERSATIONS_PATH}/{}",
        urlencoding::encode(&params.conversation_id)
    );
    let (updated, etag): (Updated, _) = client
        .put_versioned(
            &path,
            &body,
            &version,
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await?;
    if updated.conversation.id != params.conversation_id
        || updated.conversation.organization_id != params.organization_id
    {
        return Err(CloudError::Decode("The account returned metadata for a different conversation or organization; reload history".into()));
    }
    let mut conversation: CloudHistoryConversation = updated.conversation.into();
    let applied = match &params.change {
        CloudConversationChange::Rename { title } => conversation.title.as_ref() == Some(title),
        CloudConversationChange::Model { model } => conversation.model.as_ref() == Some(model),
        CloudConversationChange::Pin { pinned } => conversation.pinned == *pinned,
        CloudConversationChange::Archive { archived } => conversation.archived == *archived,
    };
    if !applied {
        return Err(CloudError::Decode(
            "The account did not confirm the requested conversation change; reload history".into(),
        ));
    }
    conversation.version = etag
        .map(|tag| {
            normalize_conversation_revision(&tag).ok_or_else(|| {
                CloudError::Decode("The account returned an invalid conversation revision".into())
            })
        })
        .transpose()?;
    Ok(CloudConversationUpdateResponse {
        scope: params.scope,
        conversation,
    })
}
use agiworkforce_protocol::account_cloud::{
    CloudHistoryConversation, CloudHistoryListParams, CloudHistoryListResponse,
    CloudHistoryMessage, CloudHistoryReadParams, CloudHistoryReadResponse,
};
pub(super) const CONVERSATION_PAGE: usize = 500;

#[derive(Debug, Deserialize)]
struct ConversationRow {
    #[serde(flatten)]
    draft_fields: super::drafts::DraftFields,
    #[serde(skip)]
    version: Option<String>,
    id: String,
    title: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    project_id: Option<String>,
    archived: bool,
    updated_at: String,
    #[serde(default)]
    organization_id: Option<String>,
    #[serde(default)]
    work_mode: Option<String>,
    pinned: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub(super) struct ConversationMessageRow {
    pub(super) id: String,
    pub(super) role: String,
    pub(super) content: String,
    #[serde(default)]
    pub(super) metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ConversationPage {
    conversation: ConversationRow,
    pub(super) messages: Vec<ConversationMessageRow>,
    pub(super) has_more: bool,
    #[serde(default)]
    total: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConversationListPage {
    conversations: Vec<ConversationRow>,
    has_more: bool,
    next_offset: u32,
    #[serde(default)]
    next_cursor: Option<String>,
}

#[derive(Deserialize)]
struct CreatedConversation {
    conversation: ConversationRow,
}

pub async fn create_history_conversation(
    client: &CloudClient,
    params: &agiworkforce_protocol::account_cloud::CloudConversationCreateParams,
    model: Option<&str>,
) -> Result<CloudHistoryConversation, CloudError> {
    let mut body = serde_json::json!({ "id": params.id });
    if let Some(project) = &params.project_id {
        body["projectId"] = serde_json::json!(project);
    }
    if let Some(model) = model {
        body["model"] = serde_json::json!(model);
    }
    let created: CreatedConversation = client
        .post_bounded(
            CONVERSATIONS_PATH,
            &body,
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await?;
    if created.conversation.id != params.id || created.conversation.project_id != params.project_id
    {
        return Err(CloudError::Decode(
            "The account created a different conversation".into(),
        ));
    }
    Ok(created.conversation.into())
}

pub async fn gateway_history(
    client: &CloudClient,
    id: &str,
    page_size: u32,
) -> Result<(CloudHistoryConversation, Vec<serde_json::Value>), CloudError> {
    gateway_history_until(client, id, page_size, None).await
}

pub async fn gateway_history_until(
    client: &CloudClient,
    id: &str,
    page_size: u32,
    plan: Option<&agiworkforce_protocol::account_cloud::CloudWorkPlanReview>,
) -> Result<(CloudHistoryConversation, Vec<serde_json::Value>), CloudError> {
    if page_size == 0 {
        return Err(CloudError::Decode(
            "The context page size must be positive".into(),
        ));
    }
    let path = format!("{CONVERSATIONS_PATH}/{}", urlencoding::encode(id));
    let mut messages = Vec::new();
    let mut conversation = None;
    let mut offset = 0u32;
    let mut bytes = 2usize;
    loop {
        let page =
            fetch_history_page(client, &path, id, page_size, offset, client.workspace()).await?;
        if page.has_more && page.messages.is_empty() {
            return Err(CloudError::Decode(
                "The context page did not advance".into(),
            ));
        }
        if conversation.is_none() {
            conversation = Some(page.conversation.into());
        }
        for message in page.messages {
            let end = plan.is_some_and(|plan| message.id == plan.planning_message_id);
            if let Some(plan) = plan.filter(|_| end) {
                let stored = super::work_plan::from_metadata(message.metadata.as_ref()).ok_or_else(|| CloudError::Decode("The saved plan review is incomplete. Reopen the plan before continuing.".into()))?;
                if !super::work_plan::same_plan(&stored, plan) || stored.declined {
                    return Err(CloudError::Decode("The saved plan changed or was declined. Review it again before continuing.".into()));
                }
            }
            let content = super::attachments::history_content(
                &message.role,
                &message.content,
                message.metadata.as_ref(),
            )?;
            let projected = serde_json::json!({ "role": message.role, "content": content });
            bytes = bytes.saturating_add(
                serde_json::to_vec(&projected)
                    .map_err(|error| CloudError::Decode(error.to_string()))?
                    .len()
                    .saturating_add(1),
            );
            if bytes > crate::app_server::TRANSCRIPT_JSON_BUDGET {
                return Err(CloudError::Decode(
                    "This conversation needs context compaction before the native app can send it"
                        .into(),
                ));
            }
            messages.push(projected);
            if end {
                return Ok((
                    conversation.ok_or_else(|| {
                        CloudError::Decode("The conversation metadata is missing".into())
                    })?,
                    messages,
                ));
            }
            offset = offset
                .checked_add(1)
                .ok_or_else(|| CloudError::Decode("The context cursor is exhausted".into()))?;
        }
        if !page.has_more {
            break;
        }
    }
    if plan.is_some() {
        return Err(CloudError::Decode(
            "The planning reply is no longer in this conversation".into(),
        ));
    }
    Ok((
        conversation
            .ok_or_else(|| CloudError::Decode("The account returned no conversation".into()))?,
        messages,
    ))
}

impl From<ConversationRow> for CloudHistoryConversation {
    fn from(row: ConversationRow) -> Self {
        Self {
            temporary: row.draft_fields.temporary(),
            archived: row.archived,
            version: row.version,
            id: row.id,
            title: row.title,
            model: row.model,
            project_id: row.project_id,
            organization_id: row.organization_id,
            updated_at: row.updated_at,
            work_mode: row.work_mode,
            pinned: row.pinned,
        }
    }
}

pub async fn list_history_page(
    client: &CloudClient,
    params: CloudHistoryListParams,
    scope: String,
) -> Result<CloudHistoryListResponse, CloudError> {
    let mut query = vec![
        ("limit", params.limit.to_string()),
        ("offset", params.offset.to_string()),
        (
            "archived",
            params
                .archive_filter
                .unwrap_or(agiworkforce_protocol::account_cloud::CloudHistoryArchiveFilter::Exclude)
                .as_str()
                .into(),
        ),
    ];
    if let Some(cursor) = &params.cursor {
        query.push(("cursor", cursor.clone()));
    }
    if let Some(project) = &params.project_id {
        if Uuid::parse_str(project).is_err() {
            return Err(CloudError::Decode("The project identity is invalid".into()));
        }
        query.push(("projectId", project.clone()));
    }

    if let Some(search) = params.query.filter(|query| !query.trim().is_empty()) {
        query.push(("q", search));
    }
    let page: ConversationListPage = client
        .get_bounded(
            CONVERSATIONS_PATH,
            &query,
            crate::app_server::TRANSCRIPT_JSON_BUDGET * 2,
        )
        .await?;
    if params.project_id.as_ref().is_some_and(|project| {
        page.conversations
            .iter()
            .any(|row| row.project_id.as_ref() != Some(project))
    }) {
        return Err(CloudError::Decode(
            "The project history returned conversations from another project".into(),
        ));
    }
    if page.has_more && page.next_offset <= params.offset && page.next_cursor == params.cursor {
        return Err(CloudError::Decode(
            "The Cloud history cursor did not advance".into(),
        ));
    }
    if params.workspace.as_ref().is_some_and(|workspace| {
        page.conversations.iter().any(|row| {
            agiworkforce_protocol::account_cloud::CloudConversationWorkspace::from_organization(
                row.organization_id.as_deref(),
            ) != *workspace
        })
    }) {
        return Err(CloudError::Decode(
            "The account returned history from a different workspace".into(),
        ));
    }
    Ok(CloudHistoryListResponse {
        workspace: params.workspace,
        scope,
        conversations: page.conversations.into_iter().map(Into::into).collect(),
        has_more: page.has_more,
        next_offset: page.next_offset,
        next_cursor: page.next_cursor,
    })
}

pub async fn read_history_page(
    client: &CloudClient,
    params: CloudHistoryReadParams,
) -> Result<CloudHistoryReadResponse, CloudError> {
    if params.limit == 0
        || (params.latest && params.before.is_some())
        || ((params.latest || params.before.is_some()) && params.offset != 0)
        || params.before == Some(0)
    {
        return Err(CloudError::Decode("Invalid Cloud history window".into()));
    }
    if params.workspace.as_ref().is_some_and(|workspace| matches!(workspace, agiworkforce_protocol::account_cloud::CloudConversationWorkspace::Organization { id } if Uuid::parse_str(id).is_err())) { return Err(CloudError::Decode("The conversation workspace identity is invalid".into())); }
    let scoped_client = client.with_workspace(params.workspace.as_ref())?;
    let client = &scoped_client;
    let path = format!(
        "{CONVERSATIONS_PATH}/{}",
        urlencoding::encode(&params.conversation_id)
    );
    let read = async {
        if !params.latest && params.before.is_none() {
            let page = fetch_history_page(
                client,
                &path,
                &params.conversation_id,
                params.limit,
                params.offset,
                params.workspace.as_ref(),
            )
            .await?;
            return history_projection(page, params.scope, params.offset);
        }
        let mut end = if let Some(before) = params.before {
            before
        } else {
            let probe = fetch_history_page(
                client,
                &path,
                &params.conversation_id,
                1,
                0,
                params.workspace.as_ref(),
            )
            .await?;
            let total = probe.total.ok_or_else(|| {
                CloudError::Decode(
                    "The account did not report the conversation's message count".into(),
                )
            })?;
            if total == 0 {
                if !probe.messages.is_empty() {
                    return Err(CloudError::Decode(
                        "The empty conversation returned messages".into(),
                    ));
                }
                return history_window_projection(probe, params.scope, 0, true);
            }
            total
        };
        for _ in 0..2 {
            let limit = params.limit.min(end);
            let offset = end - limit;
            let page = fetch_history_page(
                client,
                &path,
                &params.conversation_id,
                limit,
                offset,
                params.workspace.as_ref(),
            )
            .await?;
            let total = page.total.ok_or_else(|| {
                CloudError::Decode(
                    "The account did not report the conversation's message count".into(),
                )
            })?;
            if params.latest && total != end {
                if total == 0 && page.messages.is_empty() {
                    return history_window_projection(page, params.scope, 0, true);
                }
                end = total;
                continue;
            }
            if total < end || page.messages.len() != limit as usize {
                return Err(CloudError::Decode("The conversation changed while its history was loading. Reload the latest messages.".into()));
            }
            return history_window_projection(page, params.scope, offset, true);
        }
        Err(CloudError::Decode("The conversation kept changing while its latest history was loading. Reload the latest messages.".into()))
    };
    tokio::time::timeout(super::client::CLOUD_TIMEOUT, read)
        .await
        .map_err(|_| {
            CloudError::Transport("Loading the conversation history exceeded its deadline".into())
        })?
}

pub(super) async fn fetch_history_page(
    client: &CloudClient,
    path: &str,
    id: &str,
    limit: u32,
    offset: u32,
    workspace: Option<&agiworkforce_protocol::account_cloud::CloudConversationWorkspace>,
) -> Result<ConversationPage, CloudError> {
    let (mut page, version): (ConversationPage, _) = client
        .get_versioned(
            path,
            &[("limit", limit.to_string()), ("offset", offset.to_string())],
            crate::app_server::TRANSCRIPT_JSON_BUDGET * 2,
        )
        .await?;
    if page.conversation.id != id {
        return Err(CloudError::Decode(
            "The account returned a different conversation".into(),
        ));
    }
    let expected_organization = workspace.map(|workspace| match workspace {
        agiworkforce_protocol::account_cloud::CloudConversationWorkspace::Personal => None,
        agiworkforce_protocol::account_cloud::CloudConversationWorkspace::Organization { id } => {
            Some(id.as_str())
        }
    });
    if expected_organization.is_some_and(|id| id != page.conversation.organization_id.as_deref()) {
        return Err(CloudError::Decode(
            "The account returned a different conversation workspace".into(),
        ));
    }
    page.conversation.version = version
        .map(|version| {
            normalize_conversation_revision(&version).ok_or_else(|| {
                CloudError::Decode("The account returned an invalid conversation revision".into())
            })
        })
        .transpose()?;
    Ok(page)
}

fn history_projection(
    page: ConversationPage,
    scope: String,
    offset: u32,
) -> Result<CloudHistoryReadResponse, CloudError> {
    history_window_projection(page, scope, offset, false)
}

fn history_window_projection(
    mut page: ConversationPage,
    scope: String,
    offset: u32,
    backward: bool,
) -> Result<CloudHistoryReadResponse, CloudError> {
    let read = page.messages.len();
    if backward {
        page.messages.reverse();
    }
    if page.has_more && read == 0 {
        return Err(CloudError::Decode(
            "The Cloud message page did not advance".into(),
        ));
    }
    let mut response = CloudHistoryReadResponse {
        draft: page.conversation.draft_fields.snapshot()?,
        scope,
        conversation: page.conversation.into(),
        messages: Vec::new(),
        has_more: !backward && page.has_more,
        next_offset: offset,
        start_offset: offset,
        previous_before: None,
    };
    'messages: for message in page.messages {
        let plan = super::work_plan::from_metadata(message.metadata.as_ref()).filter(|plan| {
            plan.planning_message_id == message.id
                && plan.conversation_id == response.conversation.id
        });
        let incomplete = message
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("agiWorkPlanReview"))
            .is_some()
            && plan.is_none();
        let attachments = super::attachments::persisted(message.metadata.as_ref());
        let attachments_incomplete = attachments.is_err()
            || (message.role != "user"
                && attachments.as_ref().is_ok_and(|files| !files.is_empty()));
        let mut projected = CloudHistoryMessage {
            id: message.id,
            role: message.role,
            content: message.content,
            content_truncated: false,
            attachments: attachments.unwrap_or_default(),
            attachments_incomplete,
            work_plan: plan,
            work_plan_incomplete: incomplete,
        };
        loop {
            response.messages.push(projected.clone());
            history_window_cursor(&mut response, offset, read, backward)?;
            let size = serde_json::to_vec(&response)
                .map_err(|error| CloudError::Decode(error.to_string()))?
                .len();
            response.messages.pop();
            history_window_cursor(&mut response, offset, read, backward)?;
            if size <= crate::app_server::TRANSCRIPT_JSON_BUDGET {
                break;
            }
            if !response.messages.is_empty() {
                response.has_more = !backward;
                break 'messages;
            }
            let chars = projected.content.chars().count();
            if chars == 0 {
                return Err(CloudError::Decode(
                    "The conversation metadata exceeds the response budget".into(),
                ));
            }
            let end = projected
                .content
                .char_indices()
                .nth(chars / 2)
                .map_or(0, |(index, _)| index);
            projected.content.truncate(end);
            projected.content_truncated = true;
        }
        response.messages.push(projected);
        history_window_cursor(&mut response, offset, read, backward)?;
    }
    response.has_more |= !backward && response.messages.len() < read;
    if backward {
        response.messages.reverse();
    }
    Ok(response)
}

fn history_window_cursor(
    response: &mut CloudHistoryReadResponse,
    offset: u32,
    read: usize,
    backward: bool,
) -> Result<(), CloudError> {
    let count = if backward {
        read
    } else {
        response.messages.len()
    };
    response.next_offset = offset
        .checked_add(u32::try_from(count).map_err(|error| CloudError::Decode(error.to_string()))?)
        .ok_or_else(|| CloudError::Decode("The message cursor is exhausted".into()))?;
    response.start_offset = if backward {
        response.next_offset - response.messages.len() as u32
    } else {
        offset
    };
    response.previous_before =
        (backward && response.start_offset > 0).then_some(response.start_offset);
    Ok(())
}

/// One conversation read by id. Reading it out of a full pull fetched the
/// whole account's history to open a single chat. These rows carry no server
/// versions, so none are recorded. Any push conflict remains unresolved until
/// local and hosted content are reconciled; it cannot supply a safe base version.
pub async fn fetch_conversation(
    client: &CloudClient,
    conversation_id: &str,
) -> Result<Option<HostedConversation>, CloudError> {
    let path = format!(
        "{CONVERSATIONS_PATH}/{}",
        urlencoding::encode(conversation_id)
    );
    let mut found: Option<HostedConversation> = None;
    let mut offset = 0usize;
    loop {
        let query = [
            ("limit", CONVERSATION_PAGE.to_string()),
            ("offset", offset.to_string()),
        ];
        let page: ConversationPage = match client.get(&path, &query).await {
            Ok(page) => page,
            Err(CloudError::Api { status: 404, .. }) => return Ok(None),
            Err(error) => return Err(error),
        };
        let read = page.messages.len();
        let conversation = found.get_or_insert_with(|| HostedConversation {
            id: page.conversation.id,
            title: page.conversation.title.unwrap_or_default(),
            model: page.conversation.model,
            project_id: page.conversation.project_id,
            updated_at: page.conversation.updated_at,
            archived: page.conversation.archived,
            server_version: String::new(),
            messages: Vec::new(),
        });
        conversation
            .messages
            .extend(page.messages.into_iter().map(|message| HostedMessage {
                id: message.id,
                role: message.role,
                content: message.content,
                server_version: String::new(),
            }));
        offset += read;
        if !page.has_more || read == 0 {
            return Ok(found);
        }
    }
}

pub struct ChatSync<'a> {
    client: &'a CloudClient,
}

impl<'a> ChatSync<'a> {
    pub fn new(client: &'a CloudClient) -> Self {
        Self { client }
    }

    pub async fn pull(&self, since: &str) -> Result<ChatPullResponse, CloudError> {
        self.client
            .get(CHAT_SYNC_PATH, &[("since", since.to_string())])
            .await
    }

    /// Pull every page from `since` forward, so a listing is the account's
    /// history rather than one page of it.
    pub async fn pull_all(&self, since: &str) -> Result<ChatPullResponse, CloudError> {
        let mut cursor = since.to_string();
        let mut merged = ChatPullResponse {
            conversations: Vec::new(),
            messages: Vec::new(),
            cursor: cursor.clone(),
            has_more: false,
        };
        loop {
            let page = self.pull(&cursor).await?;
            let advanced = page.cursor != cursor;
            let has_more = page.has_more;
            cursor = page.cursor.clone();
            merged.absorb(page);
            if !has_more || !advanced {
                break;
            }
        }
        Ok(merged)
    }

    pub async fn push(&self, request: &ChatPushRequest) -> Result<ChatPushResponse, CloudError> {
        if request.is_empty() {
            return Ok(ChatPushResponse {
                applied: AppliedGroups::default(),
                conflicts: ConflictGroups::default(),
                cursor: INITIAL_CURSOR.to_string(),
            });
        }
        self.client.post(CHAT_SYNC_PATH, request).await
    }
}

/// Sections a caller can hand to `SyncSection::base_version` without knowing
/// which record kind it is looking at.
pub fn section_for_conversations(state: &SyncState) -> &SyncSection {
    &state.conversations
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversation_revisions_never_accept_wildcards_or_malformed_tags() {
        for bad in [
            "",
            "*",
            "\"*\"",
            "\"",
            "W/\"",
            "-1",
            "\"1",
            "1\"",
            "\"1\n\"",
            "\"9223372036854775808\"",
            "\"1\",\"2\"",
        ] {
            assert_eq!(normalize_conversation_revision(bad), None, "{bad:?}");
        }
        for tag in ["42", "\"42\"", "W/\"42\"", " \"0042\" "] {
            assert_eq!(
                normalize_conversation_revision(tag).as_deref(),
                Some("\"42\"")
            );
        }
        assert_eq!(
            normalize_conversation_revision("\"0\"").as_deref(),
            Some("\"0\"")
        );
    }

    #[test]
    fn metadata_title_validation_matches_the_cloud_utf16_limit() {
        use agiworkforce_protocol::account_cloud::{
            CloudConversationChange, CloudConversationUpdateParams,
        };
        let mut request = CloudConversationUpdateParams {
            scope: "owner".into(),
            conversation_id: Uuid::new_v4().to_string(),
            organization_id: None,
            expected_version: "\"1\"".into(),
            change: CloudConversationChange::Rename {
                title: "a".repeat(title_max_chars()),
            },
        };
        assert!(validate_conversation_update(&request).is_ok());
        request.change = CloudConversationChange::Rename {
            title: "a".repeat(title_max_chars() + 1),
        };
        assert!(validate_conversation_update(&request).is_err());
        request.change = CloudConversationChange::Rename {
            title: "🦀".repeat(title_max_chars() / 2),
        };
        assert!(validate_conversation_update(&request).is_ok());
        request.change = CloudConversationChange::Rename {
            title: "🦀".repeat(title_max_chars() / 2 + 1),
        };
        assert!(validate_conversation_update(&request).is_err());
        request.change = CloudConversationChange::Rename {
            title: " \n\t".into(),
        };
        assert!(validate_conversation_update(&request).is_err());
    }

    #[test]
    fn native_history_reads_the_same_golden_wire_as_the_cloud_schema() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!("../../../../packages/contracts/cloud-contracts/src/__fixtures__/cloud-history-pages.golden.json")).unwrap();
        let list: ConversationListPage = serde_json::from_value(fixture["list"].clone()).unwrap();
        assert!(list.conversations[0].title.is_none());
        assert!(list.has_more);
        let page: ConversationPage = serde_json::from_value(fixture["read"].clone()).unwrap();
        let projected = history_projection(page, "owner".into(), 0).unwrap();
        assert_eq!(projected.messages[0].content, "你好 🦀");
        assert_eq!(projected.next_offset, 1);
        assert!(!projected.has_more);
        for missing in ["messages", "hasMore"] {
            let mut malformed = fixture["read"].clone();
            malformed.as_object_mut().unwrap().remove(missing);
            assert!(
                serde_json::from_value::<ConversationPage>(malformed).is_err(),
                "{missing}"
            );
        }
    }

    #[test]
    fn history_keeps_saved_file_names_and_marks_unreadable_references() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!("../../../../packages/contracts/cloud-contracts/src/__fixtures__/cloud-history-pages.golden.json")).unwrap();
        let mut page: ConversationPage = serde_json::from_value(fixture["read"].clone()).unwrap();
        page.messages[0].role = "user".into();
        page.messages[0].metadata = Some(serde_json::json!({ "attachments": [{
            "id": "saved-file", "assetId": "77777777-7777-4777-8777-777777777777", "type": "file", "name": "report 東京.pdf", "mimeType": "application/pdf", "size": 1024
        }] }));
        let projected = history_projection(page, "owner".into(), 0).unwrap();
        assert_eq!(projected.messages[0].attachments[0].name, "report 東京.pdf");
        assert!(!projected.messages[0].attachments_incomplete);
        let mut page: ConversationPage = serde_json::from_value(fixture["read"].clone()).unwrap();
        page.messages[0].metadata =
            Some(serde_json::json!({ "attachments": [{ "name": "missing-id.pdf" }] }));
        let projected = history_projection(page, "owner".into(), 0).unwrap();
        assert!(projected.messages[0].attachments_incomplete);
        assert!(projected.messages[0].attachments.is_empty());
        assert_eq!(projected.messages[0].content, "你好 🦀");
    }

    #[test]
    fn native_history_bounds_unicode_previews_without_corrupting_text_or_advancing_past_unread_rows(
    ) {
        let fixture: serde_json::Value = serde_json::from_str(include_str!("../../../../packages/contracts/cloud-contracts/src/__fixtures__/cloud-history-pages.golden.json")).unwrap();
        let mut page: ConversationPage = serde_json::from_value(fixture["read"].clone()).unwrap();
        page.messages[0].content = "🦀".repeat(900_000);
        let projected = history_projection(page, "owner".into(), 0).unwrap();
        assert!(projected.messages[0].content_truncated);
        assert!(projected.messages[0]
            .content
            .chars()
            .all(|character| character == '🦀'));
        assert!(
            serde_json::to_vec(&projected).unwrap().len()
                <= crate::app_server::TRANSCRIPT_JSON_BUDGET
        );
        let mut page: ConversationPage = serde_json::from_value(fixture["read"].clone()).unwrap();
        page.messages[0].content = "x".repeat(2_000_000);
        page.messages.push(ConversationMessageRow {
            id: "next-message".into(),
            role: "user".into(),
            content: "y".repeat(2_000_000),
            metadata: None,
        });
        let projected = history_projection(page, "owner".into(), 10).unwrap();
        assert_eq!(projected.next_offset, 11);
        assert!(projected.has_more);
        assert_eq!(projected.messages.len(), 1);
    }

    #[test]
    fn backward_history_prioritizes_the_newest_rows_and_keeps_an_exact_older_cursor() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!("../../../../packages/contracts/cloud-contracts/src/__fixtures__/cloud-history-pages.golden.json")).unwrap();
        let mut page: ConversationPage = serde_json::from_value(fixture["read"].clone()).unwrap();
        page.messages[0].id = "older".into();
        page.messages[0].content = "x".repeat(2_000_000);
        page.messages.push(ConversationMessageRow {
            id: "newest".into(),
            role: "assistant".into(),
            content: "🦀".repeat(500_000),
            metadata: None,
        });
        let projected = history_window_projection(page, "owner".into(), 10, true).unwrap();
        assert_eq!(projected.messages.len(), 1);
        assert_eq!(projected.messages[0].id, "newest");
        assert_eq!(projected.start_offset, 11);
        assert_eq!(projected.next_offset, 12);
        assert_eq!(projected.previous_before, Some(11));
        assert!(!projected.has_more);
        assert!(projected.messages[0]
            .content
            .chars()
            .all(|character| character == '🦀'));
        assert!(
            serde_json::to_vec(&projected).unwrap().len()
                <= crate::app_server::TRANSCRIPT_JSON_BUDGET
        );
    }
    use std::collections::HashSet;

    #[test]
    fn a_conversation_page_reads_the_shape_the_server_sends() {
        let page: ConversationPage = serde_json::from_value(serde_json::json!({
            "conversation": {
                "id": "65df4496-5071-4d69-a0a9-c1bb380a4baf",
                "organization_id": null,
                "title": "Started on the web",
                "pinned": false,
                "model": "some-model",
                "project_id": null,
                "archived": false,
                "created_at": "2026-10-19T08:05:22.133Z",
                "updated_at": "2026-10-19T08:08:18.898Z",
                "work_mode": "chat"
            },
            "messages": [{
                "id": "8cedd90e-df0f-4a84-b671-1e648659d6a9",
                "parent_id": null,
                "role": "user",
                "content": "name two planets",
                "created_at": "2026-10-19T08:05:22.353Z",
                "metadata": {}
            }],
            "total": 1,
            "hasMore": false
        }))
        .expect("parses");
        assert_eq!(
            page.conversation.title.as_deref(),
            Some("Started on the web")
        );
        assert_eq!(page.messages[0].content, "name two planets");
        assert!(!page.has_more);

        let mut state = SyncState::default();
        record_hosted(
            &HostedConversation {
                model: None,
                id: "c1".to_string(),
                title: String::new(),
                project_id: None,
                updated_at: String::new(),
                archived: false,
                server_version: String::new(),
                messages: vec![hosted("m1", "user", "q", "")],
            },
            &mut state,
        );
        assert_eq!(state.conversations.base_version("c1"), INITIAL_CURSOR);
        assert_eq!(state.messages.base_version("m1"), INITIAL_CURSOR);
    }

    fn snapshot() -> SessionSnapshot {
        SessionSnapshot {
            session_id: "3f1d2c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f".to_string(),
            title: "Refactor the parser".to_string(),
            model: Some("some-model".to_string()),
            provider: Some("agiworkforce".to_string()),
            project_id: None,
            messages: vec![
                TurnMessage {
                    role: "system".to_string(),
                    content: "a very long system prompt".to_string(),
                },
                TurnMessage {
                    role: "user".to_string(),
                    content: "hello".to_string(),
                },
                TurnMessage {
                    role: "assistant".to_string(),
                    content: "hi".to_string(),
                },
                TurnMessage {
                    role: "assistant".to_string(),
                    content: "   ".to_string(),
                },
            ],
            hosted_message_ids: Vec::new(),
        }
    }

    #[test]
    fn a_uuid_session_id_is_the_conversation_id() {
        let id = "3f1d2c4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
        assert_eq!(conversation_id_for(id), id);
    }

    #[test]
    fn a_legacy_session_id_maps_to_one_stable_uuid() {
        let first = conversation_id_for("20260101_120000");
        let second = conversation_id_for("20260101_120000");
        assert_eq!(first, second);
        assert!(Uuid::parse_str(&first).is_ok());
        assert_ne!(first, conversation_id_for("20260101_120001"));
    }

    #[test]
    fn message_ids_are_stable_per_position_and_conversation() {
        let conversation = conversation_id_for("20260101_120000");
        assert_eq!(
            message_id_for(&conversation, 3),
            message_id_for(&conversation, 3)
        );
        assert_ne!(
            message_id_for(&conversation, 3),
            message_id_for(&conversation, 4)
        );
        assert_ne!(message_id_for(&conversation, 3), message_id_for("other", 3));
        assert!(Uuid::parse_str(&message_id_for(&conversation, 0)).is_ok());
    }

    #[test]
    fn the_system_prompt_and_empty_turns_are_not_account_history() {
        let request = build_push(&snapshot(), &SyncState::default());
        assert_eq!(request.messages.len(), 2);
        assert_eq!(request.messages[0].role, "user");
        assert_eq!(request.messages[1].role, "assistant");
        assert_eq!(request.protocol_version, SYNC_PROTOCOL_VERSION);
    }

    #[test]
    fn a_message_keeps_the_index_it_had_in_the_session() {
        let request = build_push(&snapshot(), &SyncState::default());
        let conversation = conversation_id_for(&snapshot().session_id);
        assert_eq!(request.messages[0].id, message_id_for(&conversation, 1));
        assert_eq!(request.messages[1].id, message_id_for(&conversation, 2));
    }

    fn hosted(id: &str, role: &str, content: &str, version: &str) -> HostedMessage {
        HostedMessage {
            id: id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            server_version: version.to_string(),
        }
    }

    #[test]
    fn a_conversation_from_the_account_updates_its_rows_and_adds_only_new_turns() {
        let conversation = HostedConversation {
            model: None,
            id: "797344c5-5eb4-4e1c-a268-4a01d656c16d".to_string(),
            title: "Started on the web".to_string(),
            project_id: None,
            updated_at: "2026-10-18T00:00:00Z".to_string(),
            archived: false,
            server_version: "40".to_string(),
            messages: vec![
                hosted(
                    "2565e84a-ce7b-41f7-a8f3-7ebfb2950af9",
                    "user",
                    "web question",
                    "41",
                ),
                hosted(
                    "afb1caa9-6dec-4825-bdcf-612c216f9a12",
                    "assistant",
                    "web answer",
                    "42",
                ),
            ],
        };
        let turn = |role: &str, content: &str| TurnMessage {
            role: role.to_string(),
            content: content.to_string(),
        };
        let continued = SessionSnapshot {
            session_id: conversation.id.clone(),
            title: conversation.title.clone(),
            model: Some("some-model".to_string()),
            provider: None,
            project_id: None,
            messages: vec![
                turn("system", "prompt"),
                turn("user", "web question"),
                turn("assistant", "web answer"),
                turn("user", "asked in the editor"),
                turn("assistant", "answered in the editor"),
            ],
            hosted_message_ids: conversation
                .messages
                .iter()
                .map(|message| message.id.clone())
                .collect(),
        };
        let mut state = SyncState::default();
        record_hosted(&conversation, &mut state);

        let request = build_push(&continued, &state);
        let ids: Vec<&str> = request.messages.iter().map(|m| m.id.as_str()).collect();
        assert_eq!(
            ids[..2],
            [
                conversation.messages[0].id.as_str(),
                conversation.messages[1].id.as_str()
            ]
        );
        assert_eq!(request.messages[0].base_version, "41");
        assert_eq!(request.messages[1].base_version, "42");
        assert_eq!(request.conversations[0].base_version, "40");
        assert!(request.messages[2..]
            .iter()
            .all(|message| message.base_version == INITIAL_CURSOR));
        let new_ids: HashSet<&str> = ids[2..].iter().copied().collect();
        assert_eq!(new_ids.len(), 2);
        for index in 0..continued.messages.len() {
            assert!(!new_ids.contains(message_id_for(&conversation.id, index).as_str()));
        }
        assert_eq!(build_push(&continued, &state).messages[2].id, ids[2]);
    }

    #[test]
    fn an_unsynced_session_pushes_as_an_insert() {
        let request = build_push(&snapshot(), &SyncState::default());
        assert_eq!(request.conversations[0].base_version, INITIAL_CURSOR);
        assert!(request
            .messages
            .iter()
            .all(|message| message.base_version == INITIAL_CURSOR));
    }

    #[test]
    fn a_second_push_updates_the_rows_the_server_returned() {
        let mut state = SyncState::default();
        let first = build_push(&snapshot(), &state);
        let response = ChatPushResponse {
            applied: AppliedGroups {
                conversations: vec![AppliedRow {
                    id: first.conversations[0].id.clone(),
                    server_version: "11".to_string(),
                }],
                messages: first
                    .messages
                    .iter()
                    .map(|message| AppliedRow {
                        id: message.id.clone(),
                        server_version: "12".to_string(),
                    })
                    .collect(),
            },
            conflicts: ConflictGroups::default(),
            cursor: "12".to_string(),
        };
        apply_push_response(&response, &mut state);

        let second = build_push(&snapshot(), &state);
        assert_eq!(second.conversations[0].base_version, "11");
        assert!(second
            .messages
            .iter()
            .all(|message| message.base_version == "12"));
        assert_eq!(state.conversations.cursor, INITIAL_CURSOR);
    }

    #[test]
    fn repeated_conflicts_cannot_rebase_unchanged_local_content() {
        for known_version in [None, Some("7")] {
            for deleted_at in [None, Some("2026-09-13T00:00:00Z")] {
                let local = snapshot();
                let mut state = SyncState::default();
                let request = build_push(&local, &state);
                let conversation_id = request.conversations[0].id.clone();
                let message_id = request.messages[0].id.clone();
                if let Some(version) = known_version {
                    state.conversations.record(&conversation_id, version);
                    state.messages.record(&message_id, version);
                }
                state.conversations.advance("5");
                state.messages.advance("6");
                let before = state.clone();
                let original_request = build_push(&local, &state);
                let response = ChatPushResponse {
                    applied: AppliedGroups::default(),
                    conflicts: ConflictGroups {
                        conversations: vec![ConversationConflict {
                            id: conversation_id.clone(),
                            current: Some(ConversationDelta {
                                model: None,
                                id: conversation_id.clone(),
                                title: "Renamed on the web".to_string(),
                                project_id: None,
                                updated_at: "2026-09-13T00:00:00Z".to_string(),
                                deleted_at: deleted_at.map(str::to_string),
                                archived: false,
                                server_version: "99".to_string(),
                            }),
                        }],
                        messages: vec![MessageConflict {
                            id: message_id.clone(),
                            current: Some(MessageDelta {
                                id: message_id.clone(),
                                conversation_id: conversation_id.clone(),
                                role: "user".to_string(),
                                content: "Edited on the web".to_string(),
                                created_at: None,
                                deleted_at: deleted_at.map(str::to_string),
                                server_version: "100".to_string(),
                            }),
                        }],
                    },
                    cursor: "100".to_string(),
                };

                for _ in 0..2 {
                    apply_push_response(&response, &mut state);
                    assert_eq!(state, before);
                    assert_eq!(build_push(&local, &state), original_request);
                }
                assert_eq!(local, snapshot());
            }
        }
    }

    #[test]
    fn applied_rows_advance_while_conflicted_rows_keep_their_original_bases() {
        let local = snapshot();
        let mut state = SyncState::default();
        let request = build_push(&local, &state);
        let conversation_id = request.conversations[0].id.clone();
        let applied_message_id = request.messages[0].id.clone();
        let conflicted_message_id = request.messages[1].id.clone();
        state.messages.record(&conflicted_message_id, "4");
        state.conversations.advance("3");
        let response = ChatPushResponse {
            applied: AppliedGroups {
                conversations: vec![AppliedRow {
                    id: conversation_id.clone(),
                    server_version: "8".to_string(),
                }],
                messages: vec![AppliedRow {
                    id: applied_message_id.clone(),
                    server_version: "9".to_string(),
                }],
            },
            conflicts: ConflictGroups {
                conversations: Vec::new(),
                messages: vec![MessageConflict {
                    id: conflicted_message_id.clone(),
                    current: Some(MessageDelta {
                        id: conflicted_message_id,
                        conversation_id,
                        role: "assistant".to_string(),
                        content: "Edited on another device".to_string(),
                        created_at: None,
                        deleted_at: None,
                        server_version: "10".to_string(),
                    }),
                }],
            },
            cursor: "10".to_string(),
        };

        apply_push_response(&response, &mut state);
        let next = build_push(&local, &state);
        assert_eq!(next.conversations[0].base_version, "8");
        assert_eq!(next.messages[0].base_version, "9");
        assert_eq!(next.messages[1].base_version, "4");
        assert_eq!(next.messages[1].content, request.messages[1].content);
        assert_eq!(state.conversations.cursor, "3");
        assert_eq!(state.messages.cursor, INITIAL_CURSOR);
    }

    #[test]
    fn a_conflict_the_server_could_not_describe_leaves_the_record_alone() {
        let mut state = SyncState::default();
        state.conversations.record("c1", "3");
        state.messages.record("m1", "4");
        let before = state.clone();
        let response = ChatPushResponse {
            applied: AppliedGroups::default(),
            conflicts: ConflictGroups {
                conversations: vec![ConversationConflict {
                    id: "c1".to_string(),
                    current: None,
                }],
                messages: vec![MessageConflict {
                    id: "m1".to_string(),
                    current: None,
                }],
            },
            cursor: INITIAL_CURSOR.to_string(),
        };
        apply_push_response(&response, &mut state);
        assert_eq!(state, before);
    }

    #[test]
    fn assemble_groups_messages_under_their_conversation_and_drops_tombstones() {
        let response = ChatPullResponse {
            conversations: vec![
                ConversationDelta {
                    model: None,
                    id: "c1".to_string(),
                    title: "Older".to_string(),
                    project_id: None,
                    updated_at: "2026-09-12T00:00:00Z".to_string(),
                    deleted_at: None,
                    archived: false,
                    server_version: "1".to_string(),
                },
                ConversationDelta {
                    model: None,
                    id: "c2".to_string(),
                    title: "Newer".to_string(),
                    project_id: None,
                    updated_at: "2026-09-13T00:00:00Z".to_string(),
                    deleted_at: None,
                    archived: false,
                    server_version: "2".to_string(),
                },
                ConversationDelta {
                    model: None,
                    id: "c3".to_string(),
                    title: "Deleted".to_string(),
                    project_id: None,
                    updated_at: "2026-09-13T00:00:00Z".to_string(),
                    deleted_at: Some("2026-09-13T01:00:00Z".to_string()),
                    archived: false,
                    server_version: "3".to_string(),
                },
            ],
            messages: vec![
                MessageDelta {
                    id: "m1".to_string(),
                    conversation_id: "c1".to_string(),
                    role: "user".to_string(),
                    content: "one".to_string(),
                    created_at: None,
                    deleted_at: None,
                    server_version: "4".to_string(),
                },
                MessageDelta {
                    id: "m2".to_string(),
                    conversation_id: "c1".to_string(),
                    role: "assistant".to_string(),
                    content: "two".to_string(),
                    created_at: None,
                    deleted_at: None,
                    server_version: "5".to_string(),
                },
                MessageDelta {
                    id: "m3".to_string(),
                    conversation_id: "c1".to_string(),
                    role: "user".to_string(),
                    content: "gone".to_string(),
                    created_at: None,
                    deleted_at: Some("2026-09-13T01:00:00Z".to_string()),
                    server_version: "6".to_string(),
                },
                MessageDelta {
                    id: "m4".to_string(),
                    conversation_id: "c3".to_string(),
                    role: "user".to_string(),
                    content: "orphan".to_string(),
                    created_at: None,
                    deleted_at: None,
                    server_version: "7".to_string(),
                },
            ],
            cursor: "7".to_string(),
            has_more: false,
        };

        let assembled = assemble(&response);
        assert_eq!(assembled.len(), 2);
        assert_eq!(assembled[0].id, "c2");
        assert_eq!(assembled[1].id, "c1");
        assert_eq!(
            assembled[1]
                .messages
                .iter()
                .map(|message| message.content.as_str())
                .collect::<Vec<_>>(),
            vec!["one", "two"]
        );
    }

    #[test]
    fn overlapping_pull_pages_list_each_conversation_and_message_once() {
        let conversation = |title: &str, version: &str, deleted: bool| ConversationDelta {
            id: "c1".to_string(),
            title: title.to_string(),
            model: None,
            project_id: None,
            updated_at: "2026-09-12T00:00:00Z".to_string(),
            deleted_at: deleted.then(|| "2026-09-13T00:00:00Z".to_string()),
            archived: false,
            server_version: version.to_string(),
        };
        let message = |id: &str, content: &str, version: &str| MessageDelta {
            id: id.to_string(),
            conversation_id: "c1".to_string(),
            role: "user".to_string(),
            content: content.to_string(),
            created_at: None,
            deleted_at: None,
            server_version: version.to_string(),
        };
        let page = |conversations, messages, cursor: &str, has_more| ChatPullResponse {
            conversations,
            messages,
            cursor: cursor.to_string(),
            has_more,
        };
        let mut merged = page(Vec::new(), Vec::new(), INITIAL_CURSOR, false);

        merged.absorb(page(
            vec![conversation("Trip", "12", false)],
            vec![message("m1", "one", "1"), message("m2", "two", "2")],
            "2",
            true,
        ));
        merged.absorb(page(
            vec![conversation("Trip", "12", false)],
            vec![message("m2", "two", "2")],
            "12",
            false,
        ));
        let assembled = assemble(&merged);
        assert_eq!(assembled.len(), 1);
        assert_eq!(assembled[0].messages.len(), 2);
        assert_eq!(merged.cursor, "12");

        merged.absorb(page(
            vec![conversation("Old title", "3", false)],
            vec![message("m1", "edited", "13")],
            "13",
            false,
        ));
        let assembled = assemble(&merged);
        assert_eq!(assembled[0].title, "Trip");
        assert_eq!(assembled[0].messages.len(), 2);
        assert!(assembled[0]
            .messages
            .iter()
            .any(|message| message.id == "m1" && message.content == "edited"));

        merged.absorb(page(
            vec![conversation("Trip", "14", true)],
            Vec::new(),
            "14",
            false,
        ));
        assert!(assemble(&merged).is_empty());
    }

    #[test]
    fn an_answer_changed_after_a_later_question_stays_in_its_turn() {
        let message = |id: &str, role: &str, created: &str, version: &str| MessageDelta {
            id: id.to_string(),
            conversation_id: "c1".to_string(),
            role: role.to_string(),
            content: id.to_string(),
            created_at: Some(created.to_string()),
            deleted_at: None,
            server_version: version.to_string(),
        };
        let response = ChatPullResponse {
            conversations: vec![ConversationDelta {
                model: None,
                id: "c1".to_string(),
                title: "Title".to_string(),
                project_id: None,
                updated_at: "2026-10-18T00:00:03Z".to_string(),
                deleted_at: None,
                archived: false,
                server_version: "20".to_string(),
            }],
            messages: vec![
                message("q1", "user", "2026-10-18T00:00:00.000Z", "11"),
                message("q2", "user", "2026-10-18T00:00:02.000Z", "13"),
                message("a2", "assistant", "2026-10-18T00:00:02.001Z", "14"),
                message("a1", "assistant", "2026-10-18T00:00:00.001Z", "19"),
            ],
            cursor: "20".to_string(),
            has_more: false,
        };
        let order: Vec<String> = assemble(&response)[0]
            .messages
            .iter()
            .map(|message| message.id.clone())
            .collect();
        assert_eq!(order, ["q1", "a1", "q2", "a2"]);
    }

    #[test]
    fn a_pull_records_the_versions_it_delivered() {
        let mut state = SyncState::default();
        let response = ChatPullResponse {
            conversations: vec![ConversationDelta {
                model: None,
                id: "c1".to_string(),
                title: "Title".to_string(),
                project_id: None,
                updated_at: "2026-09-13T00:00:00Z".to_string(),
                deleted_at: None,
                archived: false,
                server_version: "8".to_string(),
            }],
            messages: vec![MessageDelta {
                id: "m1".to_string(),
                conversation_id: "c1".to_string(),
                role: "user".to_string(),
                content: "one".to_string(),
                created_at: None,
                deleted_at: None,
                server_version: "9".to_string(),
            }],
            cursor: "9".to_string(),
            has_more: false,
        };
        apply_pull_response(&response, &mut state);
        assert_eq!(state.conversations.base_version("c1"), "8");
        assert_eq!(state.messages.base_version("m1"), "9");
        assert_eq!(section_for_conversations(&state).cursor, "9");
    }

    #[test]
    fn a_push_request_serializes_to_the_hosted_field_names() {
        let request = build_push(&snapshot(), &SyncState::default());
        let json = serde_json::to_value(&request).expect("serializes");
        assert_eq!(json["protocolVersion"], 2);
        assert!(json["conversations"][0]["baseVersion"].is_string());
        assert!(json["conversations"][0]["projectId"].is_null());
        assert_eq!(
            json["messages"][0]["conversationId"],
            json["conversations"][0]["id"]
        );
        assert_eq!(json["messages"][0]["metadata"]["surface"], "cli");
    }
}
