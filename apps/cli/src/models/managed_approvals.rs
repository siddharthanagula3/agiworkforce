use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use crate::tools::{self, ApprovalCallback};
use crate::tui::approval_broker::{ApprovalRequest, ApprovalRequestKind};

const TOOL_APPROVAL_REQUEST_EVENT: &str = "x_tool_approval_request";
const AGENT_EVENT: &str = "x_agent_event";
const APPROVAL_REQUESTED: &str = "approval-requested";
const CONNECTOR_HOST: &str = "AGI Workforce";

tokio::task_local! {
    static MANAGED_TOOL_APPROVAL: ManagedToolApproval;
}

#[derive(Clone)]
pub struct ManagedToolApproval {
    pub callback: Option<ApprovalCallback>,
    pub require_confirmation: bool,
}

pub async fn with_managed_tool_approval<F: std::future::Future>(
    approval: ManagedToolApproval,
    future: F,
) -> F::Output {
    MANAGED_TOOL_APPROVAL.scope(approval, future).await
}

pub(super) struct PendingCall {
    tool_call_id: String,
    name: String,
    args: Value,
    summary: Option<String>,
}

#[derive(Default)]
pub(super) struct ManagedApprovalPause {
    run_id: Option<String>,
    calls: Vec<PendingCall>,
}

impl ManagedApprovalPause {
    pub(super) fn observe(&mut self, event: &str, data: &Value) {
        match event {
            agiworkforce_llm::AGENT_RUN_ID_EVENT => {
                if let Some(run_id) = data.get("value").and_then(Value::as_str) {
                    self.run_id = Some(run_id.to_string());
                }
            }
            TOOL_APPROVAL_REQUEST_EVENT => {
                if let (Some(id), Some(name)) =
                    (text_field(data, "tool_call_id"), text_field(data, "name"))
                {
                    self.record(id, name, data.get("args").cloned(), None);
                }
            }
            AGENT_EVENT => {
                let Some(event) = data.get("event") else {
                    return;
                };
                if event.get("type").and_then(Value::as_str) != Some(APPROVAL_REQUESTED) {
                    return;
                }
                if let (Some(id), Some(name)) =
                    (text_field(event, "toolCallId"), text_field(event, "name"))
                {
                    self.record(
                        id,
                        name,
                        event.get("input").cloned(),
                        text_field(event, "summary").map(str::to_string),
                    );
                }
            }
            _ => {}
        }
    }

    pub(super) fn take_pending(&mut self) -> Result<Option<(String, Vec<PendingCall>)>> {
        if self.calls.is_empty() {
            return Ok(None);
        }
        let calls = std::mem::take(&mut self.calls);
        let run_id = self.run_id.take().ok_or_else(|| {
            anyhow!(
                "AGI Workforce paused this turn for approval but did not say which run to resume."
            )
        })?;
        Ok(Some((run_id, calls)))
    }

    fn record(&mut self, id: &str, name: &str, args: Option<Value>, summary: Option<String>) {
        if let Some(existing) = self.calls.iter_mut().find(|call| call.tool_call_id == id) {
            if existing.summary.is_none() {
                existing.summary = summary;
            }
            if existing.args.is_null() {
                existing.args = args.unwrap_or(Value::Null);
            }
            return;
        }
        self.calls.push(PendingCall {
            tool_call_id: id.to_string(),
            name: name.to_string(),
            args: args.unwrap_or(Value::Null),
            summary,
        });
    }
}

pub(super) async fn decide(calls: &[PendingCall]) -> Vec<Value> {
    let approval = MANAGED_TOOL_APPROVAL.try_with(Clone::clone).ok();
    let mut decisions = Vec::with_capacity(calls.len());
    for call in calls {
        let approved = match &approval {
            Some(approval) if !approval.require_confirmation => true,
            Some(approval) => ask(approval.callback.as_ref(), call).await,
            None => ask(None, call).await,
        };
        decisions.push(json!({
            "tool_call_id": call.tool_call_id,
            "decision": if approved { "approved" } else { "rejected" },
        }));
    }
    decisions
}

async fn ask(callback: Option<&ApprovalCallback>, call: &PendingCall) -> bool {
    let title = match &call.summary {
        Some(summary) => format!("{summary}: allow '{}'?", call.name),
        None => format!("Allow connector action '{}'?", call.name),
    };
    let request = ApprovalRequest::new(
        ApprovalRequestKind::McpTool {
            server_name: CONNECTOR_HOST.to_string(),
            tool_name: call.name.clone(),
        },
        title.clone(),
        crate::approval_details::approval_detail(&call.args),
    );
    if let Some(decision) = tools::request_approval(callback, request).await {
        return tools::approval_allows(decision);
    }
    if !crate::interactive::can_prompt() {
        return false;
    }
    dialoguer::Confirm::new()
        .with_prompt(title)
        .default(false)
        .interact()
        .unwrap_or(false)
}

fn text_field<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .get(key)
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
}
