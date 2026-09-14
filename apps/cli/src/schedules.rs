//! Hosted schedules client.
//!
//! Reads and writes the same `/api/schedules` records the web and mobile
//! surfaces use, so a schedule created here fires in AGI Cloud and appears on
//! every surface. Nothing about a schedule is stored in this process.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::tier_cache;

const SCHEDULES_TIMEOUT: Duration = Duration::from_secs(15);
const SCHEDULES_PATH: &str = "/api/schedules";

pub const DEFAULT_SCHEDULE_LIMIT: u32 = 50;
pub const DEFAULT_RUN_LIMIT: u32 = 20;

#[derive(Debug)]
pub enum ScheduleError {
    SignedOut,
    SessionExpired,
    LocalPrivacy,
    ApiBase(String),
    Transport(String),
    Api { status: u16, message: String },
    Decode(String),
}

impl std::fmt::Display for ScheduleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ScheduleError::SignedOut => f.write_str(
                "no AGI Workforce credential: schedules live in your cloud account, sign in with `agi login`",
            ),
            ScheduleError::SessionExpired => {
                f.write_str("your AGI Workforce session expired, sign in again with `agi login`")
            }
            ScheduleError::LocalPrivacy => f.write_str(
                "schedules are unavailable in Local privacy mode: a scheduled task runs in AGI cloud, \
                 so its prompt must leave this device. Switch to Managed mode to use schedules.",
            ),
            ScheduleError::ApiBase(base) => write!(
                f,
                "AGIWORKFORCE_API_BASE must be an https agiworkforce.com host or a loopback dev server, got '{base}'"
            ),
            ScheduleError::Transport(message) => {
                write!(f, "could not reach the schedules API: {message}")
            }
            ScheduleError::Api { status, message } => write!(f, "{message} (HTTP {status})"),
            ScheduleError::Decode(message) => {
                write!(f, "the schedules API returned an unreadable response: {message}")
            }
        }
    }
}

pub fn require_jwt(jwt: Option<String>) -> Result<String, ScheduleError> {
    match jwt {
        Some(jwt) if !jwt.trim().is_empty() => Ok(jwt),
        _ => Err(ScheduleError::SignedOut),
    }
}

pub fn local_timezone() -> String {
    iana_time_zone::get_timezone().unwrap_or_else(|_| "UTC".to_string())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleCreateRequest {
    pub name: String,
    pub prompt: String,
    pub recurrence: String,
    pub cron_expression: String,
    pub timezone: String,
    pub is_active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// A cron expression is a `custom` recurrence to the hosted service: the other
/// recurrences are built by the web form from a time-of-day and day picker, and
/// sending one of those without its picker fields is rejected.
pub fn cron_create_request(
    name: &str,
    cron_expression: &str,
    prompt: &str,
    enabled: bool,
    timezone: &str,
    model: Option<&str>,
    description: Option<&str>,
) -> ScheduleCreateRequest {
    ScheduleCreateRequest {
        name: name.trim().to_string(),
        prompt: prompt.trim().to_string(),
        recurrence: "custom".to_string(),
        cron_expression: cron_expression.trim().to_string(),
        timezone: timezone.trim().to_string(),
        is_active: enabled,
        description: description
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        model: model
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub id: String,
    pub name: String,
    pub schedule_type: String,
    #[serde(default)]
    pub cron_expression: Option<String>,
    #[serde(default)]
    pub execute_at: Option<String>,
    #[serde(default)]
    pub interval_ms: Option<i64>,
    pub timezone: String,
    pub is_enabled: bool,
    pub status: String,
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub last_executed_at: Option<String>,
    #[serde(default)]
    pub next_execution_at: Option<String>,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub execution_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleRun {
    pub id: String,
    pub status: String,
    pub trigger_source: String,
    pub started_at: String,
    #[serde(default)]
    pub completed_at: Option<String>,
    #[serde(default)]
    pub duration_ms: Option<i64>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub attempt_count: i64,
}

#[derive(Deserialize)]
struct ScheduleListBody {
    schedules: Vec<Schedule>,
}

#[derive(Deserialize)]
struct ScheduleBody {
    schedule: Schedule,
}

#[derive(Deserialize)]
struct RunListBody {
    runs: Vec<ScheduleRun>,
}

pub struct SchedulesClient {
    base: String,
    jwt: String,
    http: reqwest::Client,
}

impl SchedulesClient {
    pub fn connect() -> Result<Self, ScheduleError> {
        let jwt = require_jwt(tier_cache::load_jwt())?;
        let raw_base = std::env::var("AGIWORKFORCE_API_BASE")
            .unwrap_or_else(|_| tier_cache::default_api_base().to_string());
        let base = tier_cache::resolve_agi_api_base(&raw_base)
            .ok_or_else(|| ScheduleError::ApiBase(raw_base.clone()))?;
        let http = reqwest::Client::builder()
            .timeout(SCHEDULES_TIMEOUT)
            .build()
            .map_err(|error| ScheduleError::Transport(error.to_string()))?;
        Ok(Self { base, jwt, http })
    }

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.http
            .request(method, format!("{}{path}", self.base))
            .header("Authorization", format!("Bearer {}", self.jwt))
            .header("Accept", "application/json")
            .header("X-AGI-Surface", "cli")
    }

    async fn send<T: serde::de::DeserializeOwned>(
        builder: reqwest::RequestBuilder,
    ) -> Result<T, ScheduleError> {
        let response = builder
            .send()
            .await
            .map_err(|error| ScheduleError::Transport(error.to_string()))?;
        let status = response.status().as_u16();
        let body = response
            .text()
            .await
            .map_err(|error| ScheduleError::Transport(error.to_string()))?;
        if status == 401 {
            tier_cache::invalidate_tier_cache();
            return Err(ScheduleError::SessionExpired);
        }
        if !(200..300).contains(&status) {
            return Err(ScheduleError::Api {
                status,
                message: api_error_message(&body),
            });
        }
        serde_json::from_str(&body).map_err(|error| ScheduleError::Decode(error.to_string()))
    }

    pub async fn list(&self, limit: u32, offset: u32) -> Result<Vec<Schedule>, ScheduleError> {
        let body: ScheduleListBody = Self::send(
            self.request(reqwest::Method::GET, SCHEDULES_PATH)
                .query(&[("limit", limit.to_string()), ("offset", offset.to_string())]),
        )
        .await?;
        Ok(body.schedules)
    }

    pub async fn create(&self, request: &ScheduleCreateRequest) -> Result<Schedule, ScheduleError> {
        let body: ScheduleBody = Self::send(
            self.request(reqwest::Method::POST, SCHEDULES_PATH)
                .json(request),
        )
        .await?;
        Ok(body.schedule)
    }

    pub async fn delete(&self, schedule_id: &str) -> Result<(), ScheduleError> {
        let _: serde_json::Value =
            Self::send(self.request(reqwest::Method::DELETE, &schedule_path(schedule_id))).await?;
        Ok(())
    }

    pub async fn runs(
        &self,
        schedule_id: &str,
        limit: u32,
        offset: u32,
    ) -> Result<Vec<ScheduleRun>, ScheduleError> {
        let body: RunListBody = Self::send(
            self.request(reqwest::Method::GET, &runs_path(schedule_id))
                .query(&[("limit", limit.to_string()), ("offset", offset.to_string())]),
        )
        .await?;
        Ok(body.runs)
    }

    pub async fn resolve_id(&self, id_or_name: &str) -> Result<String, ScheduleError> {
        let schedules = self.list(DEFAULT_SCHEDULE_LIMIT, 0).await?;
        if let Some(found) = schedules.iter().find(|schedule| schedule.id == id_or_name) {
            return Ok(found.id.clone());
        }
        schedules
            .iter()
            .find(|schedule| schedule.name == id_or_name)
            .map(|schedule| schedule.id.clone())
            .ok_or_else(|| ScheduleError::Api {
                status: 404,
                message: format!("No schedule named '{id_or_name}' in this account"),
            })
    }
}

fn schedule_path(schedule_id: &str) -> String {
    format!("{SCHEDULES_PATH}/{}", urlencoding::encode(schedule_id))
}

fn runs_path(schedule_id: &str) -> String {
    format!("{}/runs", schedule_path(schedule_id))
}

pub fn api_error_message(body: &str) -> String {
    let parsed: serde_json::Value = match serde_json::from_str(body) {
        Ok(value) => value,
        Err(_) => return "the schedules API rejected the request".to_string(),
    };
    for candidate in [
        parsed.get("error").and_then(|error| error.get("message")),
        parsed.get("error").filter(|error| error.is_string()),
        parsed.get("message"),
    ] {
        if let Some(text) = candidate.and_then(serde_json::Value::as_str) {
            if !text.trim().is_empty() {
                return text.trim().to_string();
            }
        }
    }
    "the schedules API rejected the request".to_string()
}

pub fn schedule_cadence(schedule: &Schedule) -> String {
    match schedule.schedule_type.as_str() {
        "cron" => schedule
            .cron_expression
            .clone()
            .unwrap_or_else(|| "cron".to_string()),
        "once" => schedule
            .execute_at
            .clone()
            .map(|at| format!("once at {at}"))
            .unwrap_or_else(|| "once".to_string()),
        "interval" => schedule
            .interval_ms
            .map(|ms| format!("every {}s", ms / 1_000))
            .unwrap_or_else(|| "interval".to_string()),
        other => other.to_string(),
    }
}

pub fn render_schedules(schedules: &[Schedule]) -> String {
    if schedules.is_empty() {
        return "No schedules in this account. Create one with `agi schedules create`.".to_string();
    }
    let mut lines = Vec::with_capacity(schedules.len() * 2);
    for schedule in schedules {
        lines.push(format!(
            "{}  {}  [{}]",
            schedule.id, schedule.name, schedule.status
        ));
        lines.push(format!(
            "  {} ({})  next: {}  last: {}",
            schedule_cadence(schedule),
            schedule.timezone,
            schedule
                .next_execution_at
                .as_deref()
                .unwrap_or("not scheduled"),
            schedule.last_executed_at.as_deref().unwrap_or("never"),
        ));
        if let Some(error) = schedule.last_error.as_deref() {
            lines.push(format!("  last error: {error}"));
        }
    }
    lines.join("\n")
}

pub fn render_runs(runs: &[ScheduleRun]) -> String {
    if runs.is_empty() {
        return "This schedule has not run yet.".to_string();
    }
    runs.iter()
        .map(|run| {
            let duration = run
                .duration_ms
                .map(|ms| format!("{ms}ms"))
                .unwrap_or_else(|| "unfinished".to_string());
            let mut line = format!(
                "{}  {}  {}  started {}  {}",
                run.id, run.status, run.trigger_source, run.started_at, duration
            );
            if let Some(error) = run.error.as_deref() {
                line.push_str(&format!("\n  error: {error}"));
            }
            line
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_credential_names_the_login_command() {
        let error = require_jwt(None).expect_err("no credential must not resolve");
        assert!(matches!(error, ScheduleError::SignedOut));
        assert!(
            error.to_string().contains("agi login"),
            "the signed-out error must tell the user how to sign in: {error}"
        );
    }

    #[test]
    fn a_blank_credential_is_treated_as_signed_out() {
        assert!(matches!(
            require_jwt(Some("   ".to_string())).expect_err("blank must not resolve"),
            ScheduleError::SignedOut
        ));
        assert_eq!(
            require_jwt(Some("token".to_string())).expect("a real token resolves"),
            "token"
        );
    }

    #[test]
    fn a_cron_request_carries_only_fields_the_hosted_schema_accepts() {
        let request = cron_create_request(
            "  Morning digest  ",
            " 0 9 * * * ",
            "  Summarize my inbox  ",
            true,
            "America/New_York",
            None,
            None,
        );
        let value = serde_json::to_value(&request).expect("serializes");
        let object = value.as_object().expect("object");

        assert_eq!(object["name"], serde_json::json!("Morning digest"));
        assert_eq!(object["prompt"], serde_json::json!("Summarize my inbox"));
        assert_eq!(object["recurrence"], serde_json::json!("custom"));
        assert_eq!(object["cronExpression"], serde_json::json!("0 9 * * *"));
        assert_eq!(object["timezone"], serde_json::json!("America/New_York"));
        assert_eq!(object["isActive"], serde_json::json!(true));
        assert!(
            !object.contains_key("model") && !object.contains_key("description"),
            "an absent model or description must be omitted so the account default applies: {value}"
        );

        let allowed = [
            "name",
            "description",
            "prompt",
            "model",
            "recurrence",
            "cronExpression",
            "scheduledAt",
            "intervalMs",
            "timeOfDay",
            "daysOfWeek",
            "dayOfMonth",
            "timezone",
            "isActive",
            "expiresAt",
            "maxExecutions",
            "projectId",
        ];
        for key in object.keys() {
            assert!(
                allowed.contains(&key.as_str()),
                "the hosted service rejects unknown schedule fields, found '{key}'"
            );
        }
    }

    #[test]
    fn a_paused_request_with_a_model_keeps_both() {
        let request = cron_create_request(
            "Nightly",
            "0 3 * * *",
            "Check the build",
            false,
            "UTC",
            Some("some-model"),
            Some("nightly build check"),
        );
        let value = serde_json::to_value(&request).expect("serializes");
        assert_eq!(value["isActive"], serde_json::json!(false));
        assert_eq!(value["model"], serde_json::json!("some-model"));
        assert_eq!(
            value["description"],
            serde_json::json!("nightly build check")
        );
    }

    #[test]
    fn schedule_paths_encode_the_identifier() {
        assert_eq!(schedule_path("abc"), "/api/schedules/abc");
        assert_eq!(runs_path("a b"), "/api/schedules/a%20b/runs");
    }

    #[test]
    fn an_api_error_prefers_the_servers_own_message() {
        assert_eq!(
            api_error_message(r#"{"error":{"message":"Name is required","code":"VALIDATION"}}"#),
            "Name is required"
        );
        assert_eq!(
            api_error_message(r#"{"message":"Schedule not found"}"#),
            "Schedule not found"
        );
        assert_eq!(
            api_error_message("<html>502</html>"),
            "the schedules API rejected the request"
        );
    }

    #[test]
    fn the_local_privacy_refusal_explains_where_the_prompt_would_go() {
        let message = ScheduleError::LocalPrivacy.to_string();
        assert!(message.contains("Local privacy mode"), "{message}");
        assert!(message.contains("must leave this device"), "{message}");
    }

    fn sample_schedule() -> Schedule {
        Schedule {
            id: "sched_1".to_string(),
            name: "Morning digest".to_string(),
            schedule_type: "cron".to_string(),
            cron_expression: Some("0 9 * * *".to_string()),
            execute_at: None,
            interval_ms: None,
            timezone: "UTC".to_string(),
            is_enabled: true,
            status: "active".to_string(),
            prompt: Some("Summarize".to_string()),
            model: None,
            last_executed_at: None,
            next_execution_at: Some("2026-09-14T09:00:00.000Z".to_string()),
            last_error: None,
            execution_count: 0,
        }
    }

    #[test]
    fn a_hosted_schedule_decodes_from_the_wire_shape() {
        let wire = serde_json::json!({
            "id": "sched_1",
            "userId": "user_1",
            "name": "Morning digest",
            "description": null,
            "scheduleType": "cron",
            "cronExpression": "0 9 * * *",
            "executeAt": null,
            "intervalMs": null,
            "timezone": "UTC",
            "isEnabled": true,
            "expiresAt": null,
            "maxExecutions": null,
            "executionCount": 0,
            "actionType": "agent",
            "actionConfig": null,
            "prompt": "Summarize",
            "model": null,
            "status": "active",
            "lastExecutedAt": null,
            "nextExecutionAt": "2026-09-14T09:00:00.000Z",
            "lastError": null,
            "metadata": null,
            "createdAt": "2026-09-13T09:00:00.000Z",
            "updatedAt": "2026-09-13T09:00:00.000Z"
        });
        let schedule: Schedule = serde_json::from_value(wire).expect("decodes");
        assert_eq!(schedule, sample_schedule());
    }

    #[test]
    fn an_empty_listing_says_so_rather_than_printing_nothing() {
        assert!(render_schedules(&[]).contains("No schedules"));
        assert!(render_runs(&[]).contains("has not run yet"));
    }

    #[test]
    fn a_rendered_schedule_names_its_cadence_and_next_run() {
        let rendered = render_schedules(&[sample_schedule()]);
        assert!(rendered.contains("sched_1"), "{rendered}");
        assert!(rendered.contains("0 9 * * *"), "{rendered}");
        assert!(rendered.contains("2026-09-14T09:00:00.000Z"), "{rendered}");
        assert!(rendered.contains("never"), "{rendered}");
    }

    #[test]
    fn cadence_reads_each_schedule_type() {
        let mut once = sample_schedule();
        once.schedule_type = "once".to_string();
        once.cron_expression = None;
        once.execute_at = Some("2026-10-01T00:00:00.000Z".to_string());
        assert_eq!(schedule_cadence(&once), "once at 2026-10-01T00:00:00.000Z");

        let mut interval = sample_schedule();
        interval.schedule_type = "interval".to_string();
        interval.cron_expression = None;
        interval.interval_ms = Some(900_000);
        assert_eq!(schedule_cadence(&interval), "every 900s");
    }
}
