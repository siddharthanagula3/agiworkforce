//! Event triggers on hosted schedules.
//!
//! Reads and writes the same `/api/triggers` records the web schedule page
//! uses, so an event trigger added here starts the schedule's task in AGI
//! cloud whenever the named GitHub, Slack, Gmail, Calendar or connector event
//! arrives. Which sources and event types exist is the server's to decide; this
//! client passes them through and reports the server's own refusal.

use serde::{Deserialize, Serialize};

use super::{ScheduleError, SchedulesClient};

const TRIGGERS_PATH: &str = "/api/triggers";

pub const DEFAULT_TRIGGER_LIMIT: u32 = 50;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TriggerCondition {
    pub field: String,
    pub operator: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventTrigger {
    pub id: String,
    pub task_id: String,
    pub name: String,
    pub source: String,
    pub event_types: Vec<String>,
    #[serde(default)]
    pub source_account: Option<String>,
    #[serde(default)]
    pub conditions: Vec<TriggerCondition>,
    #[serde(default)]
    pub debounce_seconds: i64,
    pub is_enabled: bool,
    pub verification_status: String,
    #[serde(default)]
    pub watch_expires_at: Option<String>,
    #[serde(default)]
    pub watch_error: Option<String>,
    #[serde(default)]
    pub last_fired_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerCreateRequest {
    pub task_id: String,
    pub name: String,
    pub source: String,
    pub event_types: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_account: Option<String>,
    pub conditions: Vec<TriggerCondition>,
    pub debounce_seconds: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedTrigger {
    pub trigger: EventTrigger,
    #[serde(default)]
    pub verification_code: Option<String>,
    #[serde(default)]
    pub signing_secret: Option<String>,
    pub webhook_path: String,
}

#[derive(Deserialize)]
struct TriggerListBody {
    triggers: Vec<EventTrigger>,
}

#[derive(Deserialize)]
struct TriggerBody {
    trigger: EventTrigger,
}

pub fn trigger_create_request(
    task_id: &str,
    source: &str,
    event_types: &[String],
    account: Option<&str>,
    name: Option<&str>,
    conditions: Vec<TriggerCondition>,
    debounce_seconds: u32,
) -> TriggerCreateRequest {
    let source = source.trim().to_ascii_lowercase();
    let mut types: Vec<String> = event_types
        .iter()
        .flat_map(|entry| entry.split(','))
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_string)
        .collect();
    if types.is_empty() {
        types.push("*".to_string());
    }
    let name = name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("{} trigger", source_label(&source)));
    TriggerCreateRequest {
        task_id: task_id.to_string(),
        name,
        source,
        event_types: types,
        source_account: account
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        conditions,
        debounce_seconds,
    }
}

pub fn parse_condition(spec: &str) -> Result<TriggerCondition, String> {
    let spec = spec.trim();
    let mut parts = spec.splitn(3, char::is_whitespace);
    let field = parts.next().unwrap_or_default().trim();
    let operator = parts.next().unwrap_or_default().trim().to_ascii_lowercase();
    let raw = parts.next().map(str::trim).unwrap_or_default();
    if field.is_empty() || operator.is_empty() {
        return Err(format!(
            "'{spec}' is not a condition: write FIELD OPERATOR VALUE, such as `data.baseRef equals main`"
        ));
    }
    let value = match operator.as_str() {
        "exists" | "not_exists" => {
            if !raw.is_empty() {
                return Err(format!("{operator} does not take a value"));
            }
            None
        }
        _ if raw.is_empty() => {
            return Err(format!("'{spec}' needs a value to compare against"));
        }
        "greater_than" | "less_than" => {
            let number: f64 = raw
                .parse()
                .ok()
                .filter(|number: &f64| number.is_finite())
                .ok_or_else(|| format!("{operator} compares against a number, got '{raw}'"))?;
            Some(serde_json::json!(number))
        }
        "in" => Some(serde_json::Value::Array(
            raw.split(',')
                .map(str::trim)
                .filter(|item| !item.is_empty())
                .map(|item| serde_json::Value::String(item.to_string()))
                .collect(),
        )),
        _ => Some(serde_json::Value::String(raw.to_string())),
    };
    Ok(TriggerCondition {
        field: field.to_string(),
        operator,
        value,
    })
}

impl SchedulesClient {
    pub async fn triggers(
        &self,
        schedule_id: &str,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<EventTrigger>, ScheduleError> {
        let body: TriggerListBody =
            Self::send(self.request(reqwest::Method::GET, TRIGGERS_PATH).query(&[
                ("taskId", schedule_id.to_string()),
                ("limit", limit.to_string()),
                ("offset", offset.to_string()),
            ]))
            .await?;
        Ok(body.triggers)
    }

    pub async fn create_trigger(
        &self,
        request: &TriggerCreateRequest,
    ) -> Result<CreatedTrigger, ScheduleError> {
        Self::send(
            self.request(reqwest::Method::POST, TRIGGERS_PATH)
                .json(request),
        )
        .await
    }

    pub async fn set_trigger_enabled(
        &self,
        trigger_id: &str,
        enabled: bool,
    ) -> Result<EventTrigger, ScheduleError> {
        let body: TriggerBody = Self::send(
            self.request(reqwest::Method::PATCH, &trigger_path(trigger_id))
                .json(&serde_json::json!({ "isEnabled": enabled })),
        )
        .await?;
        Ok(body.trigger)
    }

    pub async fn register_trigger_watch(
        &self,
        trigger_id: &str,
    ) -> Result<EventTrigger, ScheduleError> {
        let body: TriggerBody = Self::send(self.request(
            reqwest::Method::POST,
            &format!("{}/watch", trigger_path(trigger_id)),
        ))
        .await?;
        Ok(body.trigger)
    }

    pub async fn delete_trigger(&self, trigger_id: &str) -> Result<(), ScheduleError> {
        let _: serde_json::Value =
            Self::send(self.request(reqwest::Method::DELETE, &trigger_path(trigger_id))).await?;
        Ok(())
    }

    pub fn api_url(&self, path: &str) -> String {
        format!("{}{path}", self.base)
    }
}

fn trigger_path(trigger_id: &str) -> String {
    format!("{TRIGGERS_PATH}/{}", urlencoding::encode(trigger_id))
}

fn source_label(source: &str) -> &str {
    match source {
        "github" => "GitHub",
        "slack" => "Slack",
        "gmail" => "Gmail",
        "google_calendar" => "Google Calendar",
        "connector" => "Connector",
        other => other,
    }
}

fn condition_text(condition: &TriggerCondition) -> String {
    let value = match condition.value.as_ref() {
        None => return format!("{} {}", condition.field, condition.operator),
        Some(serde_json::Value::String(text)) => text.clone(),
        Some(serde_json::Value::Array(items)) => items
            .iter()
            .map(|item| {
                item.as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| item.to_string())
            })
            .collect::<Vec<_>>()
            .join(", "),
        Some(other) => other.to_string(),
    };
    format!("{} {} {value}", condition.field, condition.operator)
}

fn trigger_notice(trigger: &EventTrigger, now: chrono::DateTime<chrono::Utc>) -> Option<String> {
    if trigger.source == "gmail" {
        if let Some(error) = trigger.watch_error.as_deref() {
            return Some(format!(
                "{error} Register it again with `agi schedules triggers watch {}`.",
                trigger.id
            ));
        }
        if trigger.verification_status == "pending" {
            return Some(format!(
                "The mailbox watch is not registered yet, so nothing fires. Register it with `agi schedules triggers watch {}`.",
                trigger.id
            ));
        }
        let lapsed = trigger
            .watch_expires_at
            .as_deref()
            .and_then(|at| chrono::DateTime::parse_from_rfc3339(at).ok())
            .is_some_and(|at| at <= now);
        if lapsed {
            return Some(format!(
                "The mailbox watch lapsed, so new mail no longer starts this task. Register it again with `agi schedules triggers watch {}`.",
                trigger.id
            ));
        }
        return None;
    }
    (trigger.verification_status == "pending")
        .then(|| "Waiting until this account is verified; nothing fires until then.".to_string())
}

pub fn render_triggers(schedule_id: &str, triggers: &[EventTrigger]) -> String {
    render_triggers_at(schedule_id, triggers, chrono::Utc::now())
}

fn render_triggers_at(
    schedule_id: &str,
    triggers: &[EventTrigger],
    now: chrono::DateTime<chrono::Utc>,
) -> String {
    if triggers.is_empty() {
        return format!(
            "No event triggers on this schedule. Add one with `agi schedules triggers add {schedule_id} --source <source>`."
        );
    }
    let mut lines = Vec::with_capacity(triggers.len() * 3);
    for trigger in triggers {
        lines.push(format!(
            "{}  {}  [{}]",
            trigger.id,
            crate::terminal_text::sanitize_terminal_text(&trigger.name),
            if trigger.is_enabled { "on" } else { "off" }
        ));
        let account = trigger
            .source_account
            .as_deref()
            .map(|account| format!(" {account}"))
            .unwrap_or_default();
        lines.push(format!(
            "  {}{account}: {}  last fired: {}",
            source_label(&trigger.source),
            trigger.event_types.join(", "),
            trigger.last_fired_at.as_deref().unwrap_or("never"),
        ));
        if !trigger.conditions.is_empty() {
            let conditions = trigger
                .conditions
                .iter()
                .map(condition_text)
                .collect::<Vec<_>>()
                .join("; ");
            lines.push(format!(
                "  only when {}",
                crate::terminal_text::sanitize_terminal_text(&conditions)
            ));
        }
        if trigger.debounce_seconds > 0 {
            lines.push(format!(
                "  repeats ignored for {}s",
                trigger.debounce_seconds
            ));
        }
        if trigger.is_enabled {
            if let Some(notice) = trigger_notice(trigger, now) {
                lines.push(format!(
                    "  {}",
                    crate::terminal_text::sanitize_terminal_text(&notice)
                ));
            }
        }
    }
    lines.join("\n")
}

pub fn created_has_secrets(created: &CreatedTrigger) -> bool {
    created.signing_secret.is_some() || created.verification_code.is_some()
}

pub fn withhold_secrets(created: &CreatedTrigger) -> CreatedTrigger {
    CreatedTrigger {
        signing_secret: None,
        verification_code: None,
        ..created.clone()
    }
}

pub fn withheld_secrets_notice(trigger_id: &str) -> String {
    format!(
        "The signing secret and verification code are shown only once, and only in an interactive terminal, so they were not printed here. \
To get them, run `agi schedules triggers remove {trigger_id}` in your own terminal and add the trigger again there, \
or add it from the schedule's triggers on agiworkforce.com, which shows them once."
    )
}

pub fn render_created_trigger(
    created: &CreatedTrigger,
    endpoint: &str,
    show_secrets: bool,
) -> String {
    let mut lines = vec![render_triggers(
        &created.trigger.task_id,
        std::slice::from_ref(&created.trigger),
    )];
    lines.push(format!("  Endpoint: {endpoint}"));
    if !created_has_secrets(created) {
        return lines.join("\n");
    }
    if !show_secrets {
        lines.push(withheld_secrets_notice(&created.trigger.id));
        return lines.join("\n");
    }
    lines.push("Shown once. Copy what you need now.".to_string());
    if let Some(secret) = created.signing_secret.as_deref() {
        lines.push(format!("  signingSecret: {secret}"));
    }
    if let Some(code) = created.verification_code.as_deref() {
        lines.push(format!(
            "  verificationCode: {code}  (post this code in the Slack workspace to verify it)"
        ));
    }
    lines.join("\n")
}

pub fn removal_refusal(trigger_id: &str, interactive: bool) -> Option<String> {
    (!interactive).then(|| {
        format!(
            "Removing a trigger needs a confirmation in an interactive terminal, and --yes does not replace it here. \
Ask the user to run `agi schedules triggers remove {trigger_id}` in their own terminal."
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_trigger() -> EventTrigger {
        EventTrigger {
            id: "0b9f6a52-4c1d-4e8a-9d3e-2f1a7c6b5e40".to_string(),
            task_id: "sched_1".to_string(),
            name: "PR review".to_string(),
            source: "github".to_string(),
            event_types: vec!["pull_request.opened".to_string()],
            source_account: Some("acme/webapp".to_string()),
            conditions: vec![TriggerCondition {
                field: "data.baseRef".to_string(),
                operator: "equals".to_string(),
                value: Some(serde_json::json!("main")),
            }],
            debounce_seconds: 0,
            is_enabled: true,
            verification_status: "verified".to_string(),
            watch_expires_at: None,
            watch_error: None,
            last_fired_at: None,
        }
    }

    fn at(stamp: &str) -> chrono::DateTime<chrono::Utc> {
        chrono::DateTime::parse_from_rfc3339(stamp)
            .expect("valid stamp")
            .with_timezone(&chrono::Utc)
    }

    #[test]
    fn a_create_request_carries_only_fields_the_trigger_route_accepts() {
        let request = trigger_create_request(
            "sched_1",
            "GitHub",
            &["pull_request.opened, pull_request.reopened".to_string()],
            Some(" acme/webapp "),
            None,
            vec![parse_condition("data.baseRef equals main").expect("parses")],
            0,
        );
        let wire = serde_json::to_value(&request).expect("serializes");
        assert_eq!(
            wire,
            serde_json::json!({
                "taskId": "sched_1",
                "name": "GitHub trigger",
                "source": "github",
                "eventTypes": ["pull_request.opened", "pull_request.reopened"],
                "sourceAccount": "acme/webapp",
                "conditions": [{ "field": "data.baseRef", "operator": "equals", "value": "main" }],
                "debounceSeconds": 0
            })
        );
    }

    #[test]
    fn no_event_types_listens_to_every_event_like_the_web_form() {
        let request = trigger_create_request(
            "sched_1",
            "google_calendar",
            &[],
            None,
            Some("Cal"),
            vec![],
            30,
        );
        assert_eq!(request.event_types, vec!["*".to_string()]);
        let wire = serde_json::to_value(&request).expect("serializes");
        assert!(wire.get("sourceAccount").is_none(), "{wire}");
        assert_eq!(wire["debounceSeconds"], 30);
    }

    #[test]
    fn conditions_take_the_value_shape_their_operator_needs() {
        assert_eq!(
            parse_condition("data.author in alice, bob")
                .expect("parses")
                .value,
            Some(serde_json::json!(["alice", "bob"]))
        );
        assert_eq!(
            parse_condition("data.count greater_than 3")
                .expect("parses")
                .value,
            Some(serde_json::json!(3.0))
        );
        assert_eq!(
            parse_condition("data.draft exists").expect("parses").value,
            None
        );
        assert_eq!(
            parse_condition("data.title contains fix the build")
                .expect("parses")
                .value,
            Some(serde_json::json!("fix the build"))
        );
    }

    #[test]
    fn a_malformed_condition_says_what_is_missing() {
        assert!(parse_condition("data.baseRef")
            .unwrap_err()
            .contains("FIELD OPERATOR VALUE"));
        assert!(parse_condition("data.baseRef equals")
            .unwrap_err()
            .contains("needs a value"));
        assert!(parse_condition("data.draft exists yes")
            .unwrap_err()
            .contains("does not take a value"));
        assert!(parse_condition("data.count less_than many")
            .unwrap_err()
            .contains("number"));
    }

    #[test]
    fn a_hosted_trigger_decodes_from_the_wire_shape() {
        let wire = serde_json::json!({
            "id": "0b9f6a52-4c1d-4e8a-9d3e-2f1a7c6b5e40",
            "userId": "user_1",
            "organizationId": null,
            "taskId": "sched_1",
            "name": "PR review",
            "source": "github",
            "eventTypes": ["pull_request.opened"],
            "sourceAccount": "acme/webapp",
            "conditions": [{ "field": "data.baseRef", "operator": "equals", "value": "main" }],
            "debounceSeconds": 0,
            "maxAttempts": 5,
            "isEnabled": true,
            "verificationStatus": "verified",
            "verifiedAt": "2026-09-28T09:00:00.000Z",
            "watchExpiresAt": null,
            "watchError": null,
            "lastFiredAt": null,
            "createdAt": "2026-09-28T09:00:00.000Z",
            "updatedAt": "2026-09-28T09:00:00.000Z"
        });
        let trigger: EventTrigger = serde_json::from_value(wire).expect("decodes");
        assert_eq!(trigger, sample_trigger());
    }

    #[test]
    fn a_rendered_trigger_names_its_source_events_and_conditions() {
        let rendered =
            render_triggers_at("sched_1", &[sample_trigger()], at("2026-09-28T10:00:00Z"));
        assert!(rendered.contains("[on]"), "{rendered}");
        assert!(
            rendered.contains("GitHub acme/webapp: pull_request.opened"),
            "{rendered}"
        );
        assert!(
            rendered.contains("only when data.baseRef equals main"),
            "{rendered}"
        );
        assert!(rendered.contains("last fired: never"), "{rendered}");
    }

    #[test]
    fn an_empty_listing_says_how_to_add_one() {
        let rendered = render_triggers_at("sched_1", &[], at("2026-09-28T10:00:00Z"));
        assert!(
            rendered.contains("agi schedules triggers add sched_1"),
            "{rendered}"
        );
    }

    #[test]
    fn a_gmail_trigger_without_a_live_watch_says_nothing_fires_and_how_to_fix_it() {
        let mut gmail = sample_trigger();
        gmail.source = "gmail".to_string();
        gmail.verification_status = "verified".to_string();
        gmail.watch_expires_at = Some("2026-09-27T10:00:00.000Z".to_string());
        let rendered = render_triggers_at("sched_1", &[gmail.clone()], at("2026-09-28T10:00:00Z"));
        assert!(rendered.contains("watch lapsed"), "{rendered}");
        assert!(
            rendered.contains("agi schedules triggers watch"),
            "{rendered}"
        );

        gmail.watch_error = Some("Gmail refused the watch.".to_string());
        let rendered = render_triggers_at("sched_1", &[gmail], at("2026-09-28T10:00:00Z"));
        assert!(rendered.contains("Gmail refused the watch."), "{rendered}");
    }

    #[test]
    fn a_pending_slack_trigger_waits_for_verification() {
        let mut slack = sample_trigger();
        slack.source = "slack".to_string();
        slack.verification_status = "pending".to_string();
        let rendered = render_triggers_at("sched_1", &[slack.clone()], at("2026-09-28T10:00:00Z"));
        assert!(rendered.contains("nothing fires until then"), "{rendered}");

        slack.is_enabled = false;
        let rendered = render_triggers_at("sched_1", &[slack], at("2026-09-28T10:00:00Z"));
        assert!(rendered.contains("[off]"), "{rendered}");
        assert!(!rendered.contains("nothing fires"), "{rendered}");
    }

    fn created_with_secrets() -> CreatedTrigger {
        CreatedTrigger {
            trigger: sample_trigger(),
            verification_code: Some("a1b2c3d4e5f6".to_string()),
            signing_secret: Some("whsec_example".to_string()),
            webhook_path: "/api/webhooks/connectors/0b9f".to_string(),
        }
    }

    #[test]
    fn a_terminal_sees_the_one_time_secrets_with_the_full_endpoint() {
        let rendered = render_created_trigger(
            &created_with_secrets(),
            "https://agiworkforce.com/api/webhooks/connectors/0b9f",
            true,
        );
        assert!(rendered.contains("Shown once"), "{rendered}");
        assert!(
            rendered.contains("Endpoint: https://agiworkforce.com/api/webhooks/connectors/0b9f"),
            "{rendered}"
        );
        assert!(
            rendered.contains("signingSecret: whsec_example"),
            "{rendered}"
        );
        assert!(
            rendered.contains("verificationCode: a1b2c3d4e5f6"),
            "{rendered}"
        );
        let redacted = crate::secret_redaction::redact_tool_output(&rendered);
        assert!(!redacted.contains("whsec_example"), "{redacted}");
        assert!(!redacted.contains("a1b2c3d4e5f6"), "{redacted}");
    }

    #[test]
    fn output_that_is_not_a_terminal_never_carries_the_secrets() {
        let created = created_with_secrets();
        let rendered = render_created_trigger(&created, "https://agiworkforce.com/x", false);
        assert!(!rendered.contains("whsec_example"), "{rendered}");
        assert!(!rendered.contains("a1b2c3d4e5f6"), "{rendered}");
        assert!(
            rendered.contains("only in an interactive terminal"),
            "{rendered}"
        );
        assert!(
            rendered.contains("agi schedules triggers remove"),
            "{rendered}"
        );

        let wire = serde_json::to_value(withhold_secrets(&created)).expect("serializes");
        let text = wire.to_string();
        assert!(!text.contains("whsec_example"), "{text}");
        assert!(!text.contains("a1b2c3d4e5f6"), "{text}");
        assert!(wire["signingSecret"].is_null(), "{text}");
    }

    #[test]
    fn a_trigger_without_secrets_prints_no_secret_notice() {
        let created = CreatedTrigger {
            verification_code: None,
            signing_secret: None,
            ..created_with_secrets()
        };
        let rendered = render_created_trigger(&created, "https://agiworkforce.com/x", false);
        assert!(!rendered.contains("interactive terminal"), "{rendered}");
        assert!(!rendered.contains("Shown once"), "{rendered}");
    }

    #[test]
    fn removal_outside_a_terminal_is_refused_even_with_yes() {
        let refusal = removal_refusal("trig-1", false).expect("refused");
        assert!(refusal.contains("interactive terminal"), "{refusal}");
        assert!(
            refusal.contains("agi schedules triggers remove trig-1"),
            "{refusal}"
        );
        assert!(removal_refusal("trig-1", true).is_none());
    }

    #[test]
    fn trigger_paths_encode_the_identifier() {
        assert_eq!(trigger_path("a b"), "/api/triggers/a%20b");
    }
}
