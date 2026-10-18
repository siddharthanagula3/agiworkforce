//! Desktop surface for MCP `elicitation/create` (spec 2025-11-25).
//!
//! The shared engine dispatches server-initiated elicitation requests through
//! [`agiworkforce_mcp::ElicitationHandler`]. [`BrokerElicitationHandler`] hands
//! each one to the [`ElicitationBroker`], which emits a Tauri event, waits for
//! the user's answer through `mcp_respond_elicitation`, and converts every
//! other ending (decline, cancel, timeout, shutdown, no window) into an
//! explicit response so the server never hangs.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant};

use agiworkforce_mcp::{
    ElicitationAction, ElicitationHandler, ElicitationMode, ElicitationRequest, ElicitationResponse,
};
use parking_lot::{Mutex, RwLock};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Emitter;
use tokio::sync::oneshot;

pub const ELICITATION_REQUEST_EVENT: &str = "mcp:elicitation-request";
pub const ELICITATION_RESOLVED_EVENT: &str = "mcp:elicitation-resolved";

/// A server that floods prompts gets declined beyond this many open at once.
const MAX_PENDING_PER_SERVER: usize = 3;

/// Prompt shown to the user. `url_host` is the part the card highlights so a
/// look-alike subdomain cannot hide behind a long path.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ElicitationPrompt {
    pub id: String,
    pub server_name: String,
    pub message: String,
    pub mode: ElicitationMode,
    pub requested_schema: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url_host: Option<String>,
    pub url_host_is_punycode: bool,
    pub expires_at_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElicitationAnswer {
    pub id: String,
    pub action: ElicitationAction,
    #[serde(default)]
    pub content: Option<Value>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ElicitationOutcome {
    Accepted,
    Declined,
    Cancelled,
    TimedOut,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ElicitationResolved {
    id: String,
    server_name: String,
    outcome: ElicitationOutcome,
}

struct PendingElicitation {
    prompt: ElicitationPrompt,
    sender: oneshot::Sender<ElicitationResponse>,
    url_opened: bool,
}

#[derive(Default)]
pub struct ElicitationBroker {
    app: RwLock<Option<tauri::AppHandle>>,
    pending: Mutex<HashMap<String, PendingElicitation>>,
    activity: Mutex<HashMap<String, Instant>>,
}

impl ElicitationBroker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Without a window there is nobody to ask, so requests decline until the
    /// app attaches its handle.
    pub fn attach(&self, app: tauri::AppHandle) {
        *self.app.write() = Some(app);
    }

    fn touch(&self, server_name: &str) {
        self.activity
            .lock()
            .insert(server_name.to_string(), Instant::now());
    }

    /// When a prompt from `server_name` last opened or closed. A transport
    /// measures its request deadline from here, so the user's time with an
    /// open prompt is not charged against the server's response time.
    pub fn last_activity(&self, server_name: &str) -> Option<Instant> {
        self.activity.lock().get(server_name).copied()
    }

    /// True while `server_name` has a prompt waiting for the user.
    pub fn has_pending(&self, server_name: &str) -> bool {
        self.pending
            .lock()
            .values()
            .any(|pending| pending.prompt.server_name == server_name)
    }

    pub fn pending_prompts(&self) -> Vec<ElicitationPrompt> {
        let mut prompts: Vec<ElicitationPrompt> = self
            .pending
            .lock()
            .values()
            .map(|pending| pending.prompt.clone())
            .collect();
        prompts.sort_by_key(|prompt| prompt.expires_at_ms);
        prompts
    }

    pub fn handler(self: &Arc<Self>, timeout: Duration) -> Arc<dyn ElicitationHandler> {
        Arc::new(BrokerElicitationHandler {
            broker: Arc::clone(self),
            timeout,
        })
    }

    async fn request(
        &self,
        server_name: &str,
        request: ElicitationRequest,
        timeout: Duration,
    ) -> ElicitationResponse {
        let Some(app) = self.app.read().clone() else {
            tracing::warn!(
                "[MCP Elicitation] Declining request from '{}': no window attached",
                server_name
            );
            return ElicitationResponse::decline();
        };

        let (url, url_host, url_host_is_punycode) = match request.mode {
            ElicitationMode::Form => {
                if let Err(reason) = validate_form_schema(&request.requested_schema) {
                    tracing::warn!(
                        "[MCP Elicitation] Declining form from '{}': {}",
                        server_name,
                        reason
                    );
                    return ElicitationResponse::decline();
                }
                (None, None, false)
            }
            ElicitationMode::Url => {
                let raw = request.url.clone().unwrap_or_default();
                match validate_elicitation_url(&raw) {
                    Ok(host) => {
                        let punycode = host.split('.').any(|label| label.starts_with("xn--"));
                        (Some(raw), Some(host), punycode)
                    }
                    Err(reason) => {
                        tracing::warn!(
                            "[MCP Elicitation] Declining URL request from '{}': {}",
                            server_name,
                            reason
                        );
                        return ElicitationResponse::decline();
                    }
                }
            }
        };

        let id = uuid::Uuid::new_v4().to_string();
        let expires_at_ms = chrono::Utc::now().timestamp_millis() + timeout.as_millis() as i64;
        let prompt = ElicitationPrompt {
            id: id.clone(),
            server_name: server_name.to_string(),
            message: request.message,
            mode: request.mode,
            requested_schema: request.requested_schema,
            url,
            url_host,
            url_host_is_punycode,
            expires_at_ms,
        };

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock();
            let open_for_server = pending
                .values()
                .filter(|p| p.prompt.server_name == server_name)
                .count();
            if open_for_server >= MAX_PENDING_PER_SERVER {
                tracing::warn!(
                    "[MCP Elicitation] Declining request from '{}': {} prompts already open",
                    server_name,
                    open_for_server
                );
                return ElicitationResponse::decline();
            }
            pending.insert(
                id.clone(),
                PendingElicitation {
                    prompt: prompt.clone(),
                    sender: tx,
                    url_opened: false,
                },
            );
        }
        self.touch(server_name);

        let mut guard = PendingGuard {
            broker: self,
            app: app.clone(),
            id: id.clone(),
            server_name: server_name.to_string(),
            armed: true,
        };

        if let Err(e) = app.emit(ELICITATION_REQUEST_EVENT, &prompt) {
            tracing::warn!(
                "[MCP Elicitation] Could not show request from '{}': {}",
                server_name,
                e
            );
            guard.finish(ElicitationOutcome::Declined);
            return ElicitationResponse::decline();
        }

        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(response)) => {
                guard.armed = false;
                response
            }
            Ok(Err(_)) => {
                guard.finish(ElicitationOutcome::Cancelled);
                ElicitationResponse::cancel()
            }
            Err(_) => {
                tracing::info!(
                    "[MCP Elicitation] Request '{}' from '{}' timed out after {}s",
                    id,
                    server_name,
                    timeout.as_secs()
                );
                guard.finish(ElicitationOutcome::TimedOut);
                ElicitationResponse::cancel()
            }
        }
    }

    /// Deliver the user's answer. An invalid form answer is rejected and the
    /// prompt stays open so the user can correct it.
    pub fn respond(&self, answer: ElicitationAnswer) -> Result<(), String> {
        let mut pending = self.pending.lock();
        let entry = pending
            .get(&answer.id)
            .ok_or_else(|| "This request is no longer waiting for an answer.".to_string())?;

        let (response, outcome) = match answer.action {
            ElicitationAction::Accept => match entry.prompt.mode {
                ElicitationMode::Form => {
                    let content = answer.content.unwrap_or_else(|| serde_json::json!({}));
                    validate_form_content(&entry.prompt.requested_schema, &content)?;
                    (
                        ElicitationResponse::accept(content),
                        ElicitationOutcome::Accepted,
                    )
                }
                ElicitationMode::Url => {
                    if !entry.url_opened {
                        return Err("Open the link first, then continue.".to_string());
                    }
                    (
                        ElicitationResponse::accept_without_content(),
                        ElicitationOutcome::Accepted,
                    )
                }
            },
            ElicitationAction::Decline => {
                (ElicitationResponse::decline(), ElicitationOutcome::Declined)
            }
            ElicitationAction::Cancel => {
                (ElicitationResponse::cancel(), ElicitationOutcome::Cancelled)
            }
        };

        let Some(entry) = pending.remove(&answer.id) else {
            return Err("This request is no longer waiting for an answer.".to_string());
        };
        drop(pending);

        let server_name = entry.prompt.server_name.clone();
        if entry.sender.send(response).is_err() {
            return Err("The server stopped waiting for this answer.".to_string());
        }
        self.emit_resolved(&answer.id, &server_name, outcome);
        Ok(())
    }

    /// Open a URL-mode prompt's address in the system browser. The address is
    /// the one the server sent and the app validated, never one supplied by
    /// the window, and the app does not read the page.
    pub fn open_url(&self, id: &str) -> Result<(), String> {
        let url = {
            let pending = self.pending.lock();
            let entry = pending
                .get(id)
                .ok_or_else(|| "This request is no longer waiting for an answer.".to_string())?;
            entry
                .prompt
                .url
                .clone()
                .ok_or_else(|| "This request has no link to open.".to_string())?
        };
        open::that_detached(&url).map_err(|e| format!("Could not open the browser: {}", e))?;
        if let Some(entry) = self.pending.lock().get_mut(id) {
            entry.url_opened = true;
        }
        Ok(())
    }

    /// Cancel every open prompt from a server that is shutting down.
    pub fn cancel_server(&self, server_name: &str) {
        let cancelled: Vec<(String, PendingElicitation)> = {
            let mut pending = self.pending.lock();
            let ids: Vec<String> = pending
                .iter()
                .filter(|(_, p)| p.prompt.server_name == server_name)
                .map(|(id, _)| id.clone())
                .collect();
            ids.into_iter()
                .filter_map(|id| pending.remove(&id).map(|p| (id, p)))
                .collect()
        };
        for (id, entry) in cancelled {
            let _ = entry.sender.send(ElicitationResponse::cancel());
            self.emit_resolved(&id, server_name, ElicitationOutcome::Cancelled);
        }
    }

    fn emit_resolved(&self, id: &str, server_name: &str, outcome: ElicitationOutcome) {
        self.touch(server_name);
        if let Some(app) = self.app.read().as_ref() {
            let _ = app.emit(
                ELICITATION_RESOLVED_EVENT,
                ElicitationResolved {
                    id: id.to_string(),
                    server_name: server_name.to_string(),
                    outcome,
                },
            );
        }
    }
}

/// Removes the prompt and tells the window it is gone when the wait ends
/// without an answer, including when the engine drops the request future
/// because the surrounding tool call timed out or the server shut down.
struct PendingGuard<'a> {
    broker: &'a ElicitationBroker,
    app: tauri::AppHandle,
    id: String,
    server_name: String,
    armed: bool,
}

impl PendingGuard<'_> {
    fn finish(&mut self, outcome: ElicitationOutcome) {
        if !self.armed {
            return;
        }
        self.armed = false;
        self.broker.touch(&self.server_name);
        if self.broker.pending.lock().remove(&self.id).is_some() {
            let _ = self.app.emit(
                ELICITATION_RESOLVED_EVENT,
                ElicitationResolved {
                    id: self.id.clone(),
                    server_name: self.server_name.clone(),
                    outcome,
                },
            );
        }
    }
}

impl Drop for PendingGuard<'_> {
    fn drop(&mut self) {
        self.finish(ElicitationOutcome::Cancelled);
    }
}

struct BrokerElicitationHandler {
    broker: Arc<ElicitationBroker>,
    timeout: Duration,
}

impl ElicitationHandler for BrokerElicitationHandler {
    fn handle<'a>(
        &'a self,
        server_name: &'a str,
        request: ElicitationRequest,
    ) -> Pin<Box<dyn Future<Output = ElicitationResponse> + Send + 'a>> {
        Box::pin(self.broker.request(server_name, request, self.timeout))
    }
}

/// Only https, a real host and no embedded credentials: `https://bank.com@evil.io`
/// must never read as bank.com.
pub fn validate_elicitation_url(raw: &str) -> Result<String, String> {
    let parsed = url::Url::parse(raw).map_err(|e| format!("invalid URL: {}", e))?;
    if parsed.scheme() != "https" {
        return Err(format!("scheme '{}' is not https", parsed.scheme()));
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("URL embeds credentials".to_string());
    }
    let host = parsed
        .host_str()
        .filter(|host| !host.is_empty())
        .ok_or_else(|| "URL has no host".to_string())?;
    Ok(host.to_ascii_lowercase())
}

fn property_kind(property: &Value) -> Option<&str> {
    property.get("type").and_then(Value::as_str)
}

fn enum_options(schema: &Value) -> Option<Vec<Value>> {
    if let Some(values) = schema.get("enum").and_then(Value::as_array) {
        return Some(values.clone());
    }
    let choices = schema
        .get("oneOf")
        .or_else(|| schema.get("anyOf"))
        .and_then(Value::as_array)?;
    Some(
        choices
            .iter()
            .filter_map(|choice| choice.get("const").cloned())
            .collect(),
    )
}

/// Form mode allows a flat object of string, number, integer, boolean and
/// enum (single or multi-select) properties. Anything nested is declined.
pub fn validate_form_schema(schema: &Value) -> Result<(), String> {
    if schema.get("type").and_then(Value::as_str) != Some("object") {
        return Err("requestedSchema must be an object schema".to_string());
    }
    let properties = match schema.get("properties") {
        None => return Ok(()),
        Some(Value::Object(properties)) => properties,
        Some(_) => return Err("properties must be an object".to_string()),
    };
    for (name, property) in properties {
        match property_kind(property) {
            Some("string") | Some("number") | Some("integer") | Some("boolean") => {}
            Some("array") => {
                let items = property
                    .get("items")
                    .ok_or_else(|| format!("'{}' is an array without items", name))?;
                if enum_options(items).is_none_or(|options| options.is_empty()) {
                    return Err(format!("'{}' is an array that is not a multi-select", name));
                }
            }
            other => {
                return Err(format!(
                    "'{}' has unsupported type {:?}",
                    name,
                    other.unwrap_or("none")
                ))
            }
        }
    }
    if let Some(required) = schema.get("required") {
        let required = required
            .as_array()
            .ok_or_else(|| "required must be an array".to_string())?;
        for field in required {
            let field = field
                .as_str()
                .ok_or_else(|| "required entries must be strings".to_string())?;
            if !properties.contains_key(field) {
                return Err(format!("required field '{}' is not defined", field));
            }
        }
    }
    Ok(())
}

fn label(property: &Value, name: &str) -> String {
    property
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or(name)
        .to_string()
}

fn validate_string(property: &Value, field: &str, value: &str) -> Result<(), String> {
    let length = value.chars().count() as u64;
    if let Some(min) = property.get("minLength").and_then(Value::as_u64) {
        if length < min {
            return Err(format!("{} needs at least {} characters.", field, min));
        }
    }
    if let Some(max) = property.get("maxLength").and_then(Value::as_u64) {
        if length > max {
            return Err(format!("{} allows at most {} characters.", field, max));
        }
    }
    if let Some(pattern) = property.get("pattern").and_then(Value::as_str) {
        if let Ok(regex) = regex::Regex::new(pattern) {
            if !regex.is_match(value) {
                return Err(format!("{} is not in the expected format.", field));
            }
        }
    }
    let format_ok = match property.get("format").and_then(Value::as_str) {
        Some("email") => value
            .split_once('@')
            .is_some_and(|(local, domain)| !local.is_empty() && domain.contains('.')),
        Some("uri") => url::Url::parse(value).is_ok(),
        Some("date") => chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok(),
        Some("date-time") => chrono::DateTime::parse_from_rfc3339(value).is_ok(),
        _ => true,
    };
    if !format_ok {
        return Err(format!("{} is not a valid value.", field));
    }
    if let Some(options) = enum_options(property) {
        if !options.iter().any(|option| option.as_str() == Some(value)) {
            return Err(format!("{} must be one of the listed choices.", field));
        }
    }
    Ok(())
}

fn validate_number(
    property: &Value,
    field: &str,
    value: &Value,
    integer: bool,
) -> Result<(), String> {
    let number = value
        .as_f64()
        .ok_or_else(|| format!("{} must be a number.", field))?;
    if integer && number.fract() != 0.0 {
        return Err(format!("{} must be a whole number.", field));
    }
    if let Some(min) = property.get("minimum").and_then(Value::as_f64) {
        if number < min {
            return Err(format!("{} must be at least {}.", field, min));
        }
    }
    if let Some(max) = property.get("maximum").and_then(Value::as_f64) {
        if number > max {
            return Err(format!("{} must be at most {}.", field, max));
        }
    }
    Ok(())
}

fn validate_multi_select(property: &Value, field: &str, value: &Value) -> Result<(), String> {
    let selected = value
        .as_array()
        .ok_or_else(|| format!("{} must be a list of choices.", field))?;
    let options = property
        .get("items")
        .and_then(enum_options)
        .unwrap_or_default();
    for (index, item) in selected.iter().enumerate() {
        if !options.contains(item) {
            return Err(format!("{} contains a choice that is not offered.", field));
        }
        if selected[..index].contains(item) {
            return Err(format!("{} lists the same choice twice.", field));
        }
    }
    let count = selected.len() as u64;
    if let Some(min) = property.get("minItems").and_then(Value::as_u64) {
        if count < min {
            return Err(format!("Choose at least {} for {}.", min, field));
        }
    }
    if let Some(max) = property.get("maxItems").and_then(Value::as_u64) {
        if count > max {
            return Err(format!("Choose at most {} for {}.", max, field));
        }
    }
    Ok(())
}

/// Checks a submitted form against the schema the server sent, so a broken or
/// tampered answer never reaches the server as "accept".
pub fn validate_form_content(schema: &Value, content: &Value) -> Result<(), String> {
    let submitted = content
        .as_object()
        .ok_or_else(|| "The answer must be a set of fields.".to_string())?;
    let empty = serde_json::Map::new();
    let properties = schema
        .get("properties")
        .and_then(Value::as_object)
        .unwrap_or(&empty);

    if let Some(unknown) = submitted.keys().find(|key| !properties.contains_key(*key)) {
        return Err(format!("'{}' was not requested.", unknown));
    }

    let required: Vec<&str> = schema
        .get("required")
        .and_then(Value::as_array)
        .map(|fields| fields.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    for field in &required {
        let missing = match submitted.get(*field) {
            None | Some(Value::Null) => true,
            Some(Value::String(s)) => s.is_empty(),
            _ => false,
        };
        if missing {
            let field_label = properties
                .get(*field)
                .map_or_else(|| field.to_string(), |property| label(property, field));
            return Err(format!("{} is required.", field_label));
        }
    }

    for (name, value) in submitted {
        let property = &properties[name];
        let field = label(property, name);
        match property_kind(property) {
            Some("string") => {
                let text = value
                    .as_str()
                    .ok_or_else(|| format!("{} must be text.", field))?;
                validate_string(property, &field, text)?;
            }
            Some("number") => validate_number(property, &field, value, false)?,
            Some("integer") => validate_number(property, &field, value, true)?,
            Some("boolean") => {
                if !value.is_boolean() {
                    return Err(format!("{} must be yes or no.", field));
                }
            }
            Some("array") => validate_multi_select(property, &field, value)?,
            _ => return Err(format!("{} has an unsupported type.", field)),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn contact_schema() -> Value {
        json!({
            "type": "object",
            "properties": {
                "name": {"type": "string", "title": "Name", "minLength": 2},
                "email": {"type": "string", "format": "email"},
                "age": {"type": "integer", "minimum": 18},
                "subscribe": {"type": "boolean"},
                "color": {"type": "string", "oneOf": [{"const": "r", "title": "Red"}, {"const": "g", "title": "Green"}]},
                "tags": {"type": "array", "maxItems": 2, "items": {"type": "string", "enum": ["a", "b", "c"]}}
            },
            "required": ["name", "email"]
        })
    }

    #[test]
    fn flat_primitive_schema_is_accepted() {
        assert!(validate_form_schema(&contact_schema()).is_ok());
    }

    #[test]
    fn nested_object_schema_is_rejected() {
        let schema = json!({
            "type": "object",
            "properties": {"address": {"type": "object", "properties": {}}}
        });
        assert!(validate_form_schema(&schema).is_err());
    }

    #[test]
    fn array_without_enum_items_is_rejected() {
        let schema = json!({
            "type": "object",
            "properties": {"list": {"type": "array", "items": {"type": "string"}}}
        });
        assert!(validate_form_schema(&schema).is_err());
    }

    #[test]
    fn required_field_must_be_declared() {
        let schema = json!({"type": "object", "properties": {}, "required": ["ghost"]});
        assert!(validate_form_schema(&schema).is_err());
    }

    #[test]
    fn valid_content_passes() {
        let content = json!({
            "name": "Ada",
            "email": "ada@example.com",
            "age": 36,
            "subscribe": true,
            "color": "g",
            "tags": ["a", "c"]
        });
        assert!(validate_form_content(&contact_schema(), &content).is_ok());
    }

    #[test]
    fn missing_required_field_fails_with_its_title() {
        let err = validate_form_content(&contact_schema(), &json!({"email": "a@b.co"}))
            .expect_err("name is required");
        assert!(err.contains("Name"));
    }

    #[test]
    fn content_type_and_range_errors_fail() {
        let schema = contact_schema();
        for content in [
            json!({"name": "Ada", "email": "not-an-email"}),
            json!({"name": "Ada", "email": "a@b.co", "age": 17}),
            json!({"name": "Ada", "email": "a@b.co", "age": 20.5}),
            json!({"name": "Ada", "email": "a@b.co", "subscribe": "yes"}),
            json!({"name": "Ada", "email": "a@b.co", "color": "blue"}),
            json!({"name": "Ada", "email": "a@b.co", "tags": ["a", "b", "c"]}),
            json!({"name": "Ada", "email": "a@b.co", "tags": ["a", "a"]}),
            json!({"name": "Ada", "email": "a@b.co", "extra": 1}),
        ] {
            assert!(
                validate_form_content(&schema, &content).is_err(),
                "expected rejection for {content}"
            );
        }
    }

    #[test]
    fn url_must_be_https_without_credentials() {
        assert_eq!(
            validate_elicitation_url("https://MCP.Example.com/connect?id=1").unwrap(),
            "mcp.example.com"
        );
        assert!(validate_elicitation_url("http://mcp.example.com").is_err());
        assert!(validate_elicitation_url("javascript:alert(1)").is_err());
        assert!(validate_elicitation_url("https://bank.com@evil.example").is_err());
        assert!(validate_elicitation_url("not a url").is_err());
    }

    #[tokio::test]
    async fn unattached_broker_declines() {
        let broker = Arc::new(ElicitationBroker::new());
        let handler = broker.handler(Duration::from_secs(1));
        let response = handler
            .handle(
                "srv",
                ElicitationRequest {
                    message: "Name?".into(),
                    requested_schema: json!({"type": "object", "properties": {}}),
                    mode: ElicitationMode::Form,
                    url: None,
                    elicitation_id: None,
                },
            )
            .await;
        assert_eq!(response.action, ElicitationAction::Decline);
        assert!(broker.pending_prompts().is_empty());
    }

    #[test]
    fn activity_is_recorded_per_server() {
        let broker = ElicitationBroker::new();
        assert!(broker.last_activity("srv").is_none());
        assert!(!broker.has_pending("srv"));
        broker.touch("srv");
        assert!(broker.last_activity("srv").is_some());
        assert!(broker.last_activity("other").is_none());
    }

    #[test]
    fn opening_an_unknown_prompt_is_rejected() {
        let broker = ElicitationBroker::new();
        assert!(broker.open_url("missing").is_err());
    }

    #[test]
    fn answer_for_unknown_id_is_rejected() {
        let broker = ElicitationBroker::new();
        let err = broker
            .respond(ElicitationAnswer {
                id: "missing".into(),
                action: ElicitationAction::Decline,
                content: None,
            })
            .expect_err("no pending prompt");
        assert!(err.contains("no longer waiting"));
    }
}
