use super::{chat, CloudClient, CloudError, Route};
use agiworkforce_protocol::account_cloud::CloudWorkPlanReview;
use serde::Deserialize;
use std::collections::HashSet;

fn error(message: &str) -> CloudError {
    CloudError::Decode(message.into())
}

fn fingerprint(plan: &CloudWorkPlanReview) -> Result<String, CloudError> {
    let namespace = uuid::Uuid::parse_str(&plan.planning_message_id)
        .map_err(|_| error("The planning message ID is invalid"))?;
    let steps: Vec<_> = plan
        .steps
        .iter()
        .map(|step| (&step.id, &step.description))
        .collect();
    let content = serde_json::to_vec(&(
        &plan.conversation_id,
        &plan.run_id,
        &plan.model,
        &plan.mode,
        &plan.goal,
        steps,
    ))
    .map_err(|error| CloudError::Decode(error.to_string()))?;
    Ok(uuid::Uuid::new_v5(&namespace, &content).to_string())
}

pub(crate) fn validate(plan: &CloudWorkPlanReview) -> Result<(), CloudError> {
    if plan.goal.goal.trim().is_empty()
        || plan.model.is_empty()
        || plan.mode.is_empty()
        || plan.steps.is_empty()
    {
        return Err(error("The Work plan is incomplete"));
    }
    let mut ids = HashSet::new();
    if plan.steps.iter().any(|step| {
        step.id.is_empty() || step.description.trim().is_empty() || !ids.insert(&step.id)
    }) {
        return Err(error("The Work plan repeats or omits a step"));
    }
    if fingerprint(plan)? != plan.review_id {
        return Err(error("The saved Work plan is incomplete or changed"));
    }
    Ok(())
}

pub(crate) fn seal(mut plan: CloudWorkPlanReview) -> Result<CloudWorkPlanReview, CloudError> {
    plan.review_id = fingerprint(&plan)?;
    validate(&plan)?;
    Ok(plan)
}

pub(crate) fn same_plan(left: &CloudWorkPlanReview, right: &CloudWorkPlanReview) -> bool {
    validate(left).is_ok() && validate(right).is_ok() && left.same_content(right)
}

pub(crate) fn from_metadata(metadata: Option<&serde_json::Value>) -> Option<CloudWorkPlanReview> {
    let plan: CloudWorkPlanReview =
        serde_json::from_value(metadata?.get("agiWorkPlanReview")?.clone()).ok()?;
    validate(&plan).ok()?;
    Some(plan)
}

pub(crate) fn continuation_ids(plan: &CloudWorkPlanReview) -> Result<(String, String), CloudError> {
    validate(plan)?;
    let id = uuid::Uuid::parse_str(&plan.review_id)
        .map_err(|_| error("The plan review ID is invalid"))?;
    Ok((
        id.to_string(),
        uuid::Uuid::new_v5(&id, b"user-message").to_string(),
    ))
}

async fn message(
    client: &CloudClient,
    plan: &CloudWorkPlanReview,
) -> Result<chat::ConversationMessageRow, CloudError> {
    let path = format!(
        "{}/{}",
        super::chat::CONVERSATIONS_PATH,
        urlencoding::encode(&plan.conversation_id)
    );
    let mut offset = 0;
    let mut bytes = 0usize;
    loop {
        let page = chat::fetch_history_page(
            client,
            &path,
            &plan.conversation_id,
            chat::CONVERSATION_PAGE as u32,
            offset,
            None,
        )
        .await?;
        if page.messages.is_empty() {
            return Err(error("The planning reply is no longer available"));
        }
        for message in page.messages {
            bytes = bytes.saturating_add(message.content.len());
            if bytes > crate::app_server::TRANSCRIPT_JSON_BUDGET {
                return Err(error(
                    "The planning history exceeds the native context budget",
                ));
            }
            if message.id == plan.planning_message_id {
                if message.role != "assistant" {
                    return Err(error("The planning reply changed role"));
                }
                return Ok(message);
            }
            offset += 1;
        }
        if !page.has_more {
            return Err(error("The planning reply is no longer available"));
        }
    }
}

async fn load_inner(
    client: &CloudClient,
    plan: &CloudWorkPlanReview,
) -> Result<CloudWorkPlanReview, CloudError> {
    let message = message(client, plan).await?;
    let stored = from_metadata(message.metadata.as_ref())
        .ok_or_else(|| error("The saved plan review is incomplete"))?;
    if !same_plan(&stored, plan) {
        return Err(error("The plan changed. Review it again before deciding."));
    }
    Ok(stored)
}

async fn stored_inner(
    client: &CloudClient,
    plan: &CloudWorkPlanReview,
) -> Result<Option<CloudWorkPlanReview>, CloudError> {
    let message = message(client, plan).await?;
    if message
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.get("agiWorkPlanReview"))
        .is_none()
    {
        return Ok(None);
    }
    let stored = from_metadata(message.metadata.as_ref())
        .ok_or_else(|| error("The saved plan is incomplete. Reopen it before deciding."))?;
    if !same_plan(&stored, plan) {
        return Err(error(
            "The saved plan changed. Review it again before deciding.",
        ));
    }
    Ok(Some(stored))
}

async fn find_for_run_inner(
    client: &CloudClient,
    conversation: &str,
    run: &str,
) -> Result<Option<CloudWorkPlanReview>, CloudError> {
    let path = format!(
        "{}/{}",
        chat::CONVERSATIONS_PATH,
        urlencoding::encode(conversation)
    );
    let mut offset = 0u32;
    let mut bytes = 0usize;
    loop {
        let page = chat::fetch_history_page(
            client,
            &path,
            conversation,
            chat::CONVERSATION_PAGE as u32,
            offset,
            None,
        )
        .await?;
        if page.has_more && page.messages.is_empty() {
            return Err(error("The plan history cursor did not advance"));
        }
        for message in page.messages {
            bytes = bytes.saturating_add(message.content.len());
            if bytes > crate::app_server::TRANSCRIPT_JSON_BUDGET {
                return Err(error("The plan history exceeds the native context budget"));
            }
            if let Some(plan) = from_metadata(message.metadata.as_ref()).filter(|plan| {
                plan.run_id == run
                    && plan.conversation_id == conversation
                    && plan.planning_message_id == message.id
            }) {
                return Ok(Some(plan));
            }
            offset = offset
                .checked_add(1)
                .ok_or_else(|| error("The plan history cursor is exhausted"))?;
        }
        if !page.has_more {
            return Ok(None);
        }
    }
}

async fn save_inner(client: &CloudClient, plan: &CloudWorkPlanReview) -> Result<(), CloudError> {
    validate(plan)?;
    let message = message(client, plan).await?;
    if message.content.trim().is_empty() {
        return Err(error("The planning reply has no saved content"));
    }
    let expected = from_metadata(message.metadata.as_ref());
    if expected
        .as_ref()
        .is_some_and(|stored| !same_plan(stored, plan))
    {
        return Err(error(
            "The saved Work plan changed. Reopen it before deciding.",
        ));
    }
    let body = serde_json::json!({ "workPlanReview": plan, "expectedWorkPlanReview": expected });
    #[derive(Deserialize)]
    struct Saved {
        id: String,
        review: CloudWorkPlanReview,
    }
    let path = format!(
        "{}/{}/messages/{}",
        super::chat::CONVERSATIONS_PATH,
        urlencoding::encode(&plan.conversation_id),
        urlencoding::encode(&plan.planning_message_id)
    );
    let saved: Saved = client.call(&Route::patch(path), &[], Some(&body)).await?;
    if saved.id != plan.planning_message_id || &saved.review != plan {
        return Err(error("The plan review could not be saved completely."));
    }
    Ok(())
}

async fn bounded<T>(
    future: impl std::future::Future<Output = Result<T, CloudError>>,
) -> Result<T, CloudError> {
    tokio::time::timeout(super::client::CLOUD_TIMEOUT, future)
        .await
        .map_err(|_| {
            CloudError::Transport("The Work plan operation exceeded its deadline".into())
        })?
}
pub(crate) async fn load(
    client: &CloudClient,
    plan: &CloudWorkPlanReview,
) -> Result<CloudWorkPlanReview, CloudError> {
    bounded(load_inner(client, plan)).await
}
pub(crate) async fn stored(
    client: &CloudClient,
    plan: &CloudWorkPlanReview,
) -> Result<Option<CloudWorkPlanReview>, CloudError> {
    bounded(stored_inner(client, plan)).await
}
pub(crate) async fn find_for_run(
    client: &CloudClient,
    conversation: &str,
    run: &str,
) -> Result<Option<CloudWorkPlanReview>, CloudError> {
    bounded(find_for_run_inner(client, conversation, run)).await
}
pub(crate) async fn save(
    client: &CloudClient,
    plan: &CloudWorkPlanReview,
) -> Result<(), CloudError> {
    bounded(save_inner(client, plan)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use agiworkforce_protocol::account_cloud::{CloudWorkGoal, CloudWorkPlanStep};
    fn plan() -> CloudWorkPlanReview {
        seal(CloudWorkPlanReview {
            review_id: String::new(),
            planning_message_id: uuid::Uuid::new_v4().to_string(),
            run_id: uuid::Uuid::new_v4().to_string(),
            conversation_id: uuid::Uuid::new_v4().to_string(),
            model: "fixture".into(),
            mode: "fixture-mode".into(),
            goal: CloudWorkGoal {
                goal: "Prepare a report".into(),
                constraints: None,
                deliverable: None,
                excluded_tools: None,
            },
            steps: vec![CloudWorkPlanStep {
                id: "first".into(),
                description: "Read the supplied material".into(),
                status: "pending".into(),
            }],
            awaiting_approval: true,
            declined: false,
        })
        .unwrap()
    }
    #[test]
    fn the_review_seal_detects_truncation_and_changed_instructions() {
        let original = plan();
        let mut changed = original.clone();
        changed.steps[0].description = "A different action".into();
        assert!(validate(&changed).is_err());
        assert!(!same_plan(&original, &changed));
        let mut changed = original.clone();
        changed.goal.goal.push_str(" with a changed goal");
        assert!(validate(&changed).is_err());
    }
    #[test]
    fn decisions_and_status_updates_keep_one_continuation_identity() {
        let original = plan();
        let ids = continuation_ids(&original).unwrap();
        let mut decided = original.clone();
        decided.awaiting_approval = false;
        decided.steps[0].status = "completed".into();
        assert!(same_plan(&original, &decided));
        assert_eq!(continuation_ids(&decided).unwrap(), ids);
        decided.declined = true;
        assert!(validate(&decided).is_ok());
    }
}
