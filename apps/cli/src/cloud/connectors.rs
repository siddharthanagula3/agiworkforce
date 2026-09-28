use std::cell::RefCell;
use std::future::Future;

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{CloudClient, CloudError, Route};

pub const TOOL_RESULT_EVENT: &str = "x_tool_result";
const CONNECTORS_PATH: &str = "/api/connectors";
const OAUTH_START_PATH: &str = "/api/connectors/oauth/start";
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectorConnection {
    pub connector_id: String,
    #[serde(default)]
    pub name: Option<String>,
    pub connected_at: String,
    #[serde(default)]
    pub needs_reauthorization: bool,
    #[serde(default)]
    pub health: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectorList {
    pub connectors: Vec<ConnectorConnection>,
    #[serde(default)]
    pub available: Vec<String>,
}

pub async fn list(client: &CloudClient) -> Result<ConnectorList, CloudError> {
    client.get(CONNECTORS_PATH, &[]).await
}

pub async fn disconnect(client: &CloudClient, connector_id: &str) -> Result<(), CloudError> {
    let _: Value = client
        .call(
            &Route::delete(CONNECTORS_PATH),
            &[("connectorId", connector_id.to_string())],
            None,
        )
        .await?;
    Ok(())
}

pub fn connect_url(connector_id: &str) -> Option<String> {
    absolute_url(&format!(
        "{OAUTH_START_PATH}?connectorId={}",
        urlencoding::encode(connector_id)
    ))
}

pub fn render_list(list: &ConnectorList) -> String {
    let sanitize = |text: &str| crate::terminal_text::sanitize_terminal_text(text).into_owned();
    let mut lines = vec!["Your account's connectors".to_string()];
    if list.connectors.is_empty() {
        lines.push("  None connected yet.".to_string());
    }
    for connection in &list.connectors {
        let name = sanitize(
            connection
                .name
                .as_deref()
                .unwrap_or(&connection.connector_id),
        );
        let state = if connection.needs_reauthorization {
            match connect_url(&connection.connector_id) {
                Some(url) => format!("needs reconnecting: open {url}"),
                None => "needs reconnecting".to_string(),
            }
        } else {
            let since = sanitize(
                connection
                    .connected_at
                    .get(..10)
                    .unwrap_or(&connection.connected_at),
            );
            match connection.health.as_deref() {
                Some(health) if health != "healthy" => {
                    format!("connected since {since}, {}", sanitize(health))
                }
                _ => format!("connected since {since}"),
            }
        };
        lines.push(format!("  {name:<20} {state}"));
    }
    let connected: std::collections::HashSet<&str> = list
        .connectors
        .iter()
        .map(|connection| connection.connector_id.as_str())
        .collect();
    let available: Vec<String> = list
        .available
        .iter()
        .filter(|connector_id| !connected.contains(connector_id.as_str()))
        .map(|connector_id| sanitize(connector_id))
        .collect();
    if !available.is_empty() {
        lines.push(String::new());
        lines.push(format!("Available to connect: {}", available.join(", ")));
        if let Some(url) = connect_url(&available[0]) {
            lines.push(format!(
                "  Connect one in your browser, for example {} at {url}",
                available[0]
            ));
        }
    }
    lines
        .push("  agi connectors disconnect <connector> removes one from your account.".to_string());
    lines.join("\n")
}
