use super::*;
use agiworkforce_protocol::agent_events::AgentEventApprovalRequested;
use serde::Deserialize;

#[derive(Default, Clone)]
pub(super) struct Journal {
    next_sequence: u64,
    output: String,
    approvals: Vec<AgentEventApprovalRequested>,
    session_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingApproval {
    requested_at: String,
    tool_calls: Vec<PendingCall>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingCall {
    tool_call_id: String,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Run {
    #[serde(flatten)]
    summary: CloudRunSummary,
    #[serde(default)]
    pending_approval: Option<PendingApproval>,
    #[serde(default)]
    last_event_sequence: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunReply {
    run: Run,
    #[serde(default)]
    events: Vec<AgentEventEnvelope>,
    #[serde(default)]
    next_after_sequence: Option<i64>,
}

fn failure(message: &str) -> DeveloperSessionHostError {
    DeveloperSessionHostError::unavailable(message)
}

pub(super) async fn read_summary(
    client: &CloudClient,
    run_id: &str,
) -> Result<CloudRunSummary, DeveloperSessionHostError> {
    let path = client
        .gateway_run_path(run_id)
        .map_err(account_cloud::failure)?;
    let reply: RunReply = client
        .get_bounded(
            &path,
            &[("after", "-1".into()), ("limit", "1".into())],
            TRANSCRIPT_JSON_BUDGET,
        )
        .await
        .map_err(account_cloud::failure)?;
    if reply.run.summary.id != run_id || reply.run.summary.request_id.is_empty() {
        return Err(failure("The gateway returned a different or invalid run"));
    }
    Ok(reply.run.summary)
}

impl Journal {
    fn apply(
        &mut self,
        event: AgentEventEnvelope,
        conversation: Option<&str>,
    ) -> Result<(), DeveloperSessionHostError> {
        if event.schema_version != AGENT_EVENT_SCHEMA_VERSION
            || conversation.is_some_and(|id| event.session_id != id)
            || self
                .session_id
                .as_ref()
                .is_some_and(|id| *id != event.session_id)
            || event.sequence != self.next_sequence
        {
            return Err(failure(
                "The durable run journal changed identity, schema or sequence",
            ));
        }
        let next_sequence = self
            .next_sequence
            .checked_add(1)
            .ok_or_else(|| failure("The durable journal cursor overflowed"))?;
        match event.event {
            AgentEvent::TextDelta(delta) => {
                if self.output.len().saturating_add(delta.delta.len()) > TRANSCRIPT_JSON_BUDGET {
                    return Err(failure(
                        "The durable reply exceeds the native display budget",
                    ));
                }
                self.output.push_str(&delta.delta);
            }
            AgentEvent::ApprovalRequested(request) => {
                let mut approvals = self.approvals.clone();
                approvals.retain(|call| call.tool_call_id != request.tool_call_id);
                approvals.push(request);
                if serde_json::to_vec(&approvals)
                    .map_err(|error| failure(&error.to_string()))?
                    .len()
                    > TRANSCRIPT_JSON_BUDGET
                {
                    return Err(failure(
                        "The pending actions exceed the native review budget",
                    ));
                }
                self.approvals = approvals;
            }
            AgentEvent::ApprovalResolved(resolved) => self
                .approvals
                .retain(|call| call.approval_id != resolved.approval_id),
            _ => {}
        }
        self.next_sequence = next_sequence;
        self.session_id = Some(event.session_id);
        Ok(())
    }
}

pub(super) async fn refresh_run(
    active: &Active,
    cancel: bool,
) -> Result<(), DeveloperSessionHostError> {
    let mut locked = active.journal.lock().await;
    let mut journal = locked.clone();
    if !active.context.is_current() {
        return Err(account_cloud::changed());
    }
    let run_id = active
        .snapshot()
        .run_id
        .ok_or_else(|| failure("The gateway did not report a run ID"))?;
    let path = active
        .client
        .gateway_run_path(&run_id)
        .map_err(account_cloud::failure)?;
    let after =
        i64::try_from(journal.next_sequence).map_err(|error| failure(&error.to_string()))? - 1;
    let mut reply: RunReply = active
        .client
        .get_bounded(
            &path,
            &[
                ("after", after.to_string()),
                (
                    "limit",
                    if cancel { 1 } else { active.identity.page_size }.to_string(),
                ),
            ],
            TRANSCRIPT_JSON_BUDGET,
        )
        .await
        .map_err(account_cloud::failure)?;
    let matches = |run: &Run| {
        run.summary.id == run_id && run.summary.conversation_id == active.identity.conversation_id
    };
    if !active.context.is_current() {
        return Err(account_cloud::changed());
    }
    if !matches(&reply.run) {
        return Err(failure("The gateway returned a different run"));
    }
    if cancel {
        reply = active
            .client
            .post(&path, &serde_json::json!({}))
            .await
            .map_err(account_cloud::failure)?;
        if !active.context.is_current() {
            return Err(account_cloud::changed());
        }
        if !matches(&reply.run) {
            return Err(failure("The gateway cancelled a different run"));
        }
        active.update(|snapshot| {
            snapshot.state = reply.run.summary.effective_state();
            snapshot.progress = Some("Cancellation requested".into());
            snapshot.approvals.clear();
            snapshot.approval_checkpoint = None;
            snapshot.catching_up = false;
        });
        return Ok(());
    }
    for event in reply.events {
        journal.apply(event, active.identity.conversation_id.as_deref())?;
    }
    let cursor =
        i64::try_from(journal.next_sequence).map_err(|error| failure(&error.to_string()))? - 1;
    if reply.next_after_sequence.is_some_and(|next| next != cursor)
        || reply
            .run
            .last_event_sequence
            .is_some_and(|last| last < cursor)
    {
        return Err(failure(
            "The durable run journal reported an inconsistent cursor",
        ));
    }
    let catching_up = reply
        .run
        .last_event_sequence
        .is_some_and(|last| last > cursor);
    if catching_up && cursor == after {
        return Err(failure(
            "The durable run journal stopped before its reported end",
        ));
    }
    let mut approvals = Vec::new();
    let mut checkpoint = None;
    if !catching_up {
        if let Some(pending) = reply.run.pending_approval {
            for call in pending.tool_calls {
                let Some(full) = journal
                    .approvals
                    .iter()
                    .find(|full| full.tool_call_id == call.tool_call_id && full.name == call.name)
                else {
                    return Err(failure("The pending action's complete details are missing from the run journal. Approval is unavailable."));
                };
                if approvals
                    .iter()
                    .any(|previous: &AgentEventApprovalRequested| {
                        previous.tool_call_id == call.tool_call_id
                    })
                {
                    return Err(failure("The pending approval repeats an action ID"));
                }
                approvals.push(full.clone());
            }
            if !approvals.is_empty() {
                checkpoint = Some(pending.requested_at);
            }
        }
    }
    let previous = active.snapshot();
    if !journal.output.is_empty()
        && !previous.output.starts_with(&journal.output)
        && !journal.output.starts_with(&previous.output)
    {
        return Err(failure(
            "The durable journal disagrees with the streamed reply",
        ));
    }
    let output = if journal.output.len() >= previous.output.len() {
        journal.output.clone()
    } else {
        previous.output
    };
    if output.len().saturating_add(
        serde_json::to_vec(&approvals)
            .map_err(|error| failure(&error.to_string()))?
            .len(),
    ) > TRANSCRIPT_JSON_BUDGET
    {
        return Err(failure(
            "The reply and pending actions exceed the native review budget",
        ));
    }
    active.update(|snapshot| {
        snapshot.state = reply.run.summary.effective_state();
        snapshot.catching_up = catching_up;
        snapshot.output = output;
        snapshot.approvals = approvals;
        snapshot.approval_checkpoint = checkpoint;
        snapshot.error = None;
    });
    *locked = journal;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn envelope(sequence: u64, event: serde_json::Value) -> AgentEventEnvelope {
        serde_json::from_value(json!({ "schemaVersion": AGENT_EVENT_SCHEMA_VERSION, "sessionId": "conversation", "turnId": "turn", "sequence": sequence, "emittedAtMs": 0, "event": event })).unwrap()
    }

    #[test]
    fn durable_output_is_ordered_and_other_sessions_and_gaps_cannot_change_it() {
        let mut journal = Journal::default();
        journal
            .apply(
                envelope(0, json!({ "type": "text-delta", "delta": "First 🦀" })),
                Some("conversation"),
            )
            .unwrap();
        assert!(journal
            .apply(
                envelope(2, json!({ "type": "text-delta", "delta": "gap" })),
                Some("conversation")
            )
            .is_err());
        assert!(journal
            .apply(
                envelope(1, json!({ "type": "text-delta", "delta": "other" })),
                Some("another")
            )
            .is_err());
        assert_eq!(journal.output, "First 🦀");
        assert_eq!(journal.next_sequence, 1);
        journal
            .apply(
                envelope(1, json!({ "type": "text-delta", "delta": " second" })),
                Some("conversation"),
            )
            .unwrap();
        assert_eq!(journal.output, "First 🦀 second");
    }

    #[test]
    fn resolved_actions_leave_the_review_and_new_requests_replace_their_details() {
        let mut journal = Journal::default();
        let request = |content: &str| json!({ "type": "approval-requested", "approvalId": "approval", "toolCallId": "tool", "name": "write", "category": "filesystem", "summary": "Write a file", "input": { "content": content } });
        journal
            .apply(envelope(0, request("old")), Some("conversation"))
            .unwrap();
        journal
            .apply(envelope(1, request("new")), Some("conversation"))
            .unwrap();
        assert_eq!(journal.approvals.len(), 1);
        assert_eq!(journal.approvals[0].input["content"], "new");
        journal.apply(envelope(2, json!({ "type": "approval-resolved", "approvalId": "approval", "decision": "approved" })), Some("conversation")).unwrap();
        assert!(journal.approvals.is_empty());
    }

    #[test]
    fn an_oversized_delta_cannot_advance_the_durable_cursor() {
        let mut journal = Journal::default();
        let event = envelope(
            0,
            json!({ "type": "text-delta", "delta": "a".repeat(TRANSCRIPT_JSON_BUDGET + 1) }),
        );
        assert!(journal.apply(event, Some("conversation")).is_err());
        assert_eq!(journal.next_sequence, 0);
        assert!(journal.output.is_empty());
    }

    #[test]
    fn an_unlinked_run_still_cannot_mix_two_journal_sessions() {
        let mut journal = Journal::default();
        journal
            .apply(
                envelope(0, json!({ "type": "text-delta", "delta": "Owned output" })),
                None,
            )
            .unwrap();
        let mut other = envelope(1, json!({ "type": "text-delta", "delta": "Other output" }));
        other.session_id = "another-session".into();
        assert!(journal.apply(other, None).is_err());
        assert_eq!(journal.output, "Owned output");
        assert_eq!(journal.next_sequence, 1);
    }
}
