use std::cell::RefCell;
use std::future::Future;

use serde::Deserialize;
use serde_json::Value;

pub const TOOL_RESULT_EVENT: &str = "x_tool_result";
const AUTHORIZATION_REQUIRED_KEY: &str = "agi_connector_authorization_required";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorReconnect {
    #[serde(default)]
    pub tool_call_id: String,
    pub connector_id: String,
    pub connector_name: String,
    pub tool_name: String,
    #[serde(default)]
    pub connect_url: Option<String>,
}

impl ConnectorReconnect {
    pub fn notice(&self) -> String {
        match &self.connect_url {
            Some(url) => format!(
                "{} needs reconnecting before {} can run. Open {url} to reconnect it, then ask again and the task continues from there.",
                self.connector_name, self.tool_name
            ),
            None => format!(
                "{} cannot be connected from this deployment, so {} did not run.",
                self.connector_name, self.tool_name
            ),
        }
    }
}

tokio::task_local! {
    static RECONNECTS: RefCell<Vec<ConnectorReconnect>>;
}

pub async fn collecting<F: Future>(future: F) -> (F::Output, Vec<ConnectorReconnect>) {
    RECONNECTS
        .scope(RefCell::new(Vec::new()), async {
            let output = future.await;
            let reconnects = RECONNECTS
                .try_with(|reconnects| reconnects.take())
                .unwrap_or_default();
            (output, reconnects)
        })
        .await
}

pub fn observe_tool_result(data: &Value) {
    let Some(reconnect) = reconnect_from_tool_result(data) else {
        return;
    };
    let unrecorded = RECONNECTS
        .try_with(|reconnects| reconnects.borrow_mut().push(reconnect.clone()))
        .is_err();
    if unrecorded {
        crate::output::print_warn(&reconnect.notice());
    }
}

fn reconnect_from_tool_result(data: &Value) -> Option<ConnectorReconnect> {
    let content = data.get("content").and_then(Value::as_str)?;
    if !content.contains(AUTHORIZATION_REQUIRED_KEY) {
        return None;
    }
    let payload: Value = serde_json::from_str(content).ok()?;
    if payload.get(AUTHORIZATION_REQUIRED_KEY) != Some(&Value::Bool(true)) {
        return None;
    }
    let mut reconnect: ConnectorReconnect = serde_json::from_value(payload).ok()?;
    if let Some(tool_call_id) = data.get("tool_call_id").and_then(Value::as_str) {
        reconnect.tool_call_id = tool_call_id.to_string();
    }
    reconnect.connect_url = reconnect.connect_url.and_then(|url| absolute_url(&url));
    Some(reconnect)
}

fn absolute_url(url: &str) -> Option<String> {
    if url.starts_with("https://") || url.starts_with("http://") {
        return Some(url.to_string());
    }
    let raw_base = std::env::var("AGIWORKFORCE_API_BASE")
        .unwrap_or_else(|_| crate::tier_cache::default_api_base().to_string());
    let base = crate::tier_cache::resolve_agi_api_base(&raw_base)?;
    Some(format!("{base}/{}", url.trim_start_matches('/')))
}
