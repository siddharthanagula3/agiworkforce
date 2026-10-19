//! Hosted chat history: the same `/api/chat/sync` records the web app, the
//! Chrome extension and mobile read, so a CLI turn appears in the sidebar of
//! every other client signed in to the account.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::client::{CloudClient, CloudError};
use super::state::{SyncSection, SyncState, INITIAL_CURSOR};

pub const CHAT_SYNC_PATH: &str = "/api/chat/sync";
pub const SYNC_PROTOCOL_VERSION: u8 = 2;
const MESSAGE_CONTENT_MAX_CHARS: usize = 1_000_000;
const TITLE_MAX_CHARS: usize = 500;

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
            truncate(trimmed, TITLE_MAX_CHARS)
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
/// Applied rows record the version the server assigned. A conflict means the
/// hosted row moved on without this device, so the hosted copy wins: its
/// version is adopted so the next push is an update of the server's row rather
/// than a losing re-insert, and nothing local is deleted. The pull cursor is
/// left alone: the push reply's cursor can pass rows another device wrote since
/// the last pull, and only a pull may move it.
pub fn apply_push_response(response: &ChatPushResponse, state: &mut SyncState) {
    for row in &response.applied.conversations {
        state.conversations.record(&row.id, &row.server_version);
    }
    for row in &response.applied.messages {
        state.messages.record(&row.id, &row.server_version);
    }
    for conflict in &response.conflicts.conversations {
        if let Some(current) = conflict.current.as_ref() {
            state
                .conversations
                .record(&conflict.id, &current.server_version);
        }
    }
    for conflict in &response.conflicts.messages {
        if let Some(current) = conflict.current.as_ref() {
            state.messages.record(&conflict.id, &current.server_version);
        }
    }
}

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
const CONVERSATION_PAGE: usize = 500;

#[derive(Debug, Deserialize)]
struct ConversationRow {
    id: String,
    title: String,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    archived: bool,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
struct ConversationMessageRow {
    id: String,
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConversationPage {
    conversation: ConversationRow,
    #[serde(default)]
    messages: Vec<ConversationMessageRow>,
    #[serde(default)]
    has_more: bool,
}

/// One conversation read by id. Reading it out of a full pull fetched the
/// whole account's history to open a single chat. These rows carry no server
/// versions, so none are recorded; a first push of a row is answered as a
/// conflict that records it.
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
            title: page.conversation.title,
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
            merged
                .conversations
                .extend(page.conversations.iter().cloned());
            merged.messages.extend(page.messages.iter().cloned());
            let advanced = page.cursor != cursor;
            cursor = page.cursor.clone();
            merged.cursor = cursor.clone();
            if !page.has_more || !advanced {
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
    use std::collections::HashSet;

    #[test]
    fn a_conversation_page_reads_the_shape_the_server_sends() {
        let page: ConversationPage = serde_json::from_value(serde_json::json!({
            "conversation": {
                "id": "65df4496-5071-4d69-a0a9-c1bb380a4baf",
                "organization_id": null,
                "title": "Started on the web",
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
        assert_eq!(page.conversation.title, "Started on the web");
        assert_eq!(page.messages[0].content, "name two planets");
        assert!(!page.has_more);

        let mut state = SyncState::default();
        record_hosted(
            &HostedConversation {
                id: "c1".to_string(),
                title: String::new(),
                model: None,
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
            id: "797344c5-5eb4-4e1c-a268-4a01d656c16d".to_string(),
            title: "Started on the web".to_string(),
            model: None,
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
    fn a_conflict_adopts_the_hosted_version_so_the_next_push_updates_it() {
        let mut state = SyncState::default();
        let request = build_push(&snapshot(), &state);
        let conversation_id = request.conversations[0].id.clone();
        let response = ChatPushResponse {
            applied: AppliedGroups::default(),
            conflicts: ConflictGroups {
                conversations: vec![ConversationConflict {
                    id: conversation_id.clone(),
                    current: Some(ConversationDelta {
                        id: conversation_id.clone(),
                        title: "Renamed on the web".to_string(),
                        model: None,
                        project_id: None,
                        updated_at: "2026-09-13T00:00:00Z".to_string(),
                        deleted_at: None,
                        archived: false,
                        server_version: "99".to_string(),
                    }),
                }],
                messages: Vec::new(),
            },
            cursor: "99".to_string(),
        };
        apply_push_response(&response, &mut state);
        assert_eq!(state.conversations.base_version(&conversation_id), "99");
    }

    #[test]
    fn a_conflict_the_server_could_not_describe_leaves_the_record_alone() {
        let mut state = SyncState::default();
        state.messages.record("m1", "4");
        let response = ChatPushResponse {
            applied: AppliedGroups::default(),
            conflicts: ConflictGroups {
                conversations: Vec::new(),
                messages: vec![MessageConflict {
                    id: "m1".to_string(),
                    current: None,
                }],
            },
            cursor: INITIAL_CURSOR.to_string(),
        };
        apply_push_response(&response, &mut state);
        assert_eq!(state.messages.base_version("m1"), "4");
    }

    #[test]
    fn assemble_groups_messages_under_their_conversation_and_drops_tombstones() {
        let response = ChatPullResponse {
            conversations: vec![
                ConversationDelta {
                    id: "c1".to_string(),
                    title: "Older".to_string(),
                    model: None,
                    project_id: None,
                    updated_at: "2026-09-12T00:00:00Z".to_string(),
                    deleted_at: None,
                    archived: false,
                    server_version: "1".to_string(),
                },
                ConversationDelta {
                    id: "c2".to_string(),
                    title: "Newer".to_string(),
                    model: None,
                    project_id: None,
                    updated_at: "2026-09-13T00:00:00Z".to_string(),
                    deleted_at: None,
                    archived: false,
                    server_version: "2".to_string(),
                },
                ConversationDelta {
                    id: "c3".to_string(),
                    title: "Deleted".to_string(),
                    model: None,
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
                id: "c1".to_string(),
                title: "Title".to_string(),
                model: None,
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
                id: "c1".to_string(),
                title: "Title".to_string(),
                model: None,
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
