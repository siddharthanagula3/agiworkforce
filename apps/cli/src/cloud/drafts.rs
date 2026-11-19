use agiworkforce_protocol::account_cloud::{
    CloudConversationDraft, CloudConversationWorkspace, CloudDraftSaveOutcome,
    CloudDraftSaveParams, CloudDraftSaveResponse,
};
use serde::{Deserialize, Deserializer};

use super::{
    chat::CONVERSATIONS_PATH,
    client::{CloudClient, CloudError},
};

#[derive(Debug, Default)]
enum DraftField {
    #[default]
    Missing,
    Present(Option<String>),
}

impl<'de> Deserialize<'de> for DraftField {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Option::<String>::deserialize(deserializer).map(Self::Present)
    }
}

#[derive(Debug, Default, Deserialize)]
pub(super) struct DraftFields {
    #[serde(default)]
    draft: DraftField,
    #[serde(default)]
    draft_updated_at: DraftField,
    is_temporary: Option<bool>,
}

impl DraftFields {
    pub(super) fn temporary(&self) -> Option<bool> {
        self.is_temporary
    }

    pub(super) fn snapshot(&self) -> Result<Option<CloudConversationDraft>, CloudError> {
        let (DraftField::Present(text), DraftField::Present(revision), Some(false)) =
            (&self.draft, &self.draft_updated_at, self.is_temporary)
        else {
            return Ok(None);
        };
        let draft = CloudConversationDraft {
            text: text.clone().unwrap_or_default(),
            revision: revision.clone(),
        };
        validate_draft(&draft).map_err(CloudError::Decode)?;
        Ok(Some(draft))
    }
}

fn validate_draft(draft: &CloudConversationDraft) -> Result<(), String> {
    if draft.text.encode_utf16().count() > super::conversation_contract::contract().draft_max_length
    {
        return Err(
            "The draft exceeds the account draft limit. Copy it before shortening it.".into(),
        );
    }
    if draft
        .revision
        .as_ref()
        .is_some_and(|value| chrono::DateTime::parse_from_rfc3339(value).is_err())
    {
        return Err("The saved draft revision is invalid. Reload this conversation.".into());
    }
    Ok(())
}

pub fn validate(params: &CloudDraftSaveParams) -> Result<(), String> {
    if uuid::Uuid::parse_str(&params.conversation_id).is_err()
        || matches!(&params.workspace, CloudConversationWorkspace::Organization { id } if uuid::Uuid::parse_str(id).is_err())
    {
        return Err("The draft conversation or workspace identity is invalid".into());
    }
    validate_draft(&params.draft)
}

pub async fn save(
    client: &CloudClient,
    params: CloudDraftSaveParams,
) -> Result<CloudDraftSaveResponse, CloudError> {
    validate(&params).map_err(CloudError::Decode)?;
    let client = client.with_workspace(Some(&params.workspace))?;
    let path = format!(
        "{CONVERSATIONS_PATH}/{}",
        urlencoding::encode(&params.conversation_id)
    );
    let reply = client
        .put_reply_bounded(
            &path,
            &serde_json::json!({
                "draft": if params.draft.text.is_empty() { None } else { Some(&params.draft.text) },
                "draftUpdatedAt": params.draft.revision,
            }),
            crate::app_server::TRANSCRIPT_JSON_BUDGET,
        )
        .await?;
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Saved {
        saved: bool,
        #[serde(default)]
        draft_updated_at: DraftField,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Current {
        draft: String,
        #[serde(default)]
        draft_updated_at: DraftField,
    }
    #[derive(Deserialize)]
    struct Conflict {
        saved: bool,
        conflict: bool,
        current: Current,
    }
    let outcome = if reply.status == 409 {
        let conflict: Conflict = serde_json::from_str(&reply.body)
            .map_err(|error| CloudError::Decode(error.to_string()))?;
        let DraftField::Present(revision) = conflict.current.draft_updated_at else {
            return Err(CloudError::Decode(
                "The draft conflict has no revision".into(),
            ));
        };
        let current = CloudConversationDraft {
            text: conflict.current.draft,
            revision,
        };
        validate_draft(&current).map_err(CloudError::Decode)?;
        if conflict.saved || !conflict.conflict {
            return Err(CloudError::Decode("The draft conflict is invalid".into()));
        }
        CloudDraftSaveOutcome::Conflict { current }
    } else {
        let saved: Saved = reply.decode()?;
        let DraftField::Present(revision) = saved.draft_updated_at else {
            return Err(CloudError::Decode(
                "The account did not confirm a draft revision".into(),
            ));
        };
        if !saved.saved || (!params.draft.text.is_empty() && revision.is_none()) {
            return Err(CloudError::Decode(
                "The account did not confirm that this draft was saved".into(),
            ));
        }
        validate_draft(&CloudConversationDraft {
            text: String::new(),
            revision: revision.clone(),
        })
        .map_err(CloudError::Decode)?;
        CloudDraftSaveOutcome::Saved { revision }
    };
    Ok(CloudDraftSaveResponse {
        scope: params.scope,
        workspace: params.workspace,
        conversation_id: params.conversation_id,
        outcome,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wire_fields_distinguish_known_empty_drafts_from_missing_support_and_temporary_chats() {
        for value in [
            serde_json::json!({}),
            serde_json::json!({ "draft": null, "is_temporary": false }),
            serde_json::json!({ "draft": "Temporary text", "draft_updated_at": null, "is_temporary": true }),
            serde_json::json!({ "draft": null, "draft_updated_at": null }),
        ] {
            let wire: DraftFields = serde_json::from_value(value).unwrap();
            assert!(wire.snapshot().unwrap().is_none());
        }
        let known: DraftFields = serde_json::from_value(
            serde_json::json!({ "draft": null, "draft_updated_at": null, "is_temporary": false }),
        )
        .unwrap();
        assert_eq!(
            known.snapshot().unwrap(),
            Some(CloudConversationDraft {
                text: String::new(),
                revision: None
            })
        );
    }

    #[test]
    fn wire_drafts_validate_the_shared_utf16_limit_and_server_clock_without_truncation() {
        let max = super::super::conversation_contract::contract().draft_max_length;
        let exact = format!(
            "{}{}",
            "🦀".repeat(max / 2),
            if max.is_multiple_of(2) { "" } else { "x" }
        );
        let wire: DraftFields = serde_json::from_value(serde_json::json!({ "draft": exact, "draft_updated_at": "2026-11-09T00:00:00Z", "is_temporary": false })).unwrap();
        assert_eq!(wire.snapshot().unwrap().unwrap().text, exact);
        for (text, clock) in [
            (format!("{exact}x"), None),
            ("Retain invalid input".into(), Some("invalid")),
        ] {
            let wire: DraftFields = serde_json::from_value(serde_json::json!({ "draft": text, "draft_updated_at": clock, "is_temporary": false })).unwrap();
            assert!(wire.snapshot().is_err());
        }
    }
}
