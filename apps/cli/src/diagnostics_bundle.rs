//! The `agi doctor` report in the shape every surface posts to
//! `/api/support/diagnostics`.

use serde::Serialize;

use crate::doctor::{DoctorReport, DoctorStatus};
use crate::secret_redaction::redact_tool_output;

pub const DIAGNOSTICS_PATH: &str = "/api/support/diagnostics";
pub const MAX_DIAGNOSTIC_EVENTS: usize = 10;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticEvent {
    pub at: String,
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SupportDiagnostics {
    pub collected_at: String,
    pub surface: String,
    pub app_version: Option<String>,
    pub release_sha: Option<String>,
    pub deploy_env: Option<String>,
    pub platform: Option<String>,
    pub locale: Option<String>,
    pub time_zone: Option<String>,
    pub viewport: Option<()>,
    pub online: Option<bool>,
    pub page_path: Option<String>,
    pub conversation_id: Option<String>,
    pub recent_events: Vec<DiagnosticEvent>,
}

fn locale() -> Option<String> {
    for key in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.split('.').next().unwrap_or("").trim().to_string();
            if !trimmed.is_empty() && trimmed != "C" && trimmed != "POSIX" {
                return Some(trimmed.replace('_', "-"));
            }
        }
    }
    None
}

/// Only the checks that did not pass, newest last. A passing check says nothing
/// support needs and the report's `cwd` is a path, so neither is carried.
pub fn diagnostics_from_report(report: &DoctorReport) -> SupportDiagnostics {
    let events: Vec<DiagnosticEvent> = report
        .checks
        .iter()
        .filter_map(|check| {
            let kind = match check.status {
                DoctorStatus::Fail => "error",
                DoctorStatus::Warn | DoctorStatus::Unknown => "warning",
                DoctorStatus::Pass => return None,
            };
            // A failing check names what it read: a provider base URL, an MCP
            // endpoint, a remote. Any of them can carry userinfo or a token.
            Some(DiagnosticEvent {
                at: report.generated_at.clone(),
                kind: kind.to_string(),
                message: redact_tool_output(&format!("{}: {}", check.id, check.message)),
            })
        })
        .collect();

    let start = events.len().saturating_sub(MAX_DIAGNOSTIC_EVENTS);

    SupportDiagnostics {
        collected_at: report.generated_at.clone(),
        surface: "cli".to_string(),
        app_version: Some(report.version.clone()),
        release_sha: None,
        deploy_env: None,
        platform: Some(format!(
            "{} {}",
            std::env::consts::OS,
            std::env::consts::ARCH
        )),
        locale: locale(),
        time_zone: None,
        viewport: None,
        online: None,
        page_path: None,
        conversation_id: None,
        recent_events: events[start..].to_vec(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::doctor::{DoctorCheck, DoctorSummary};

    fn check(id: &str, status: DoctorStatus, message: &str) -> DoctorCheck {
        DoctorCheck {
            id: id.to_string(),
            title: id.to_string(),
            status,
            message: message.to_string(),
            details: Vec::new(),
        }
    }

    fn report(checks: Vec<DoctorCheck>) -> DoctorReport {
        DoctorReport {
            version: "1.7.1".to_string(),
            generated_at: "2026-09-18T10:00:00+00:00".to_string(),
            cwd: "/Users/someone/private-project".to_string(),
            summary: DoctorSummary {
                overall: DoctorStatus::Warn,
                pass: 0,
                warn: 0,
                fail: 0,
                unknown: 0,
            },
            checks,
        }
    }

    /// This payload leaves the machine. A check that failed on a URL quotes
    /// that URL, and the client scrubs it rather than trusting the receiver to.
    #[test]
    fn a_credential_quoted_by_a_failing_check_does_not_leave_the_machine() {
        let bundle = diagnostics_from_report(&report(vec![
            check(
                "providers.base-url",
                DoctorStatus::Fail,
                "anthropic: invalid base URL `https://deploy:PLACEHOLDER_USERINFO@proxy.example.com/v1`",
            ),
            check(
                "mcp.servers",
                DoctorStatus::Warn,
                "notes: invalid SSE URL `https://mcp.example.com/sse?api_key=PLACEHOLDER_QUERY_VALUE`",
            ),
        ]));

        let sent = serde_json::to_string(&bundle).expect("serializes");
        assert!(
            !sent.contains("PLACEHOLDER_USERINFO"),
            "userinfo survived into the support payload: {sent}"
        );
        assert!(
            !sent.contains("PLACEHOLDER_QUERY_VALUE"),
            "a query-string key survived into the support payload: {sent}"
        );
        assert!(sent.contains("CREDENTIALS_REDACTED"));
        assert!(
            sent.contains("providers.base-url"),
            "the check that failed must still be identifiable"
        );
    }

    #[test]
    fn carries_the_fields_the_support_contract_names() {
        let bundle = diagnostics_from_report(&report(Vec::new()));
        let json = serde_json::to_value(&bundle).expect("serializes");
        let object = json.as_object().expect("object");
        let mut keys: Vec<&str> = object.keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            vec![
                "appVersion",
                "collectedAt",
                "conversationId",
                "deployEnv",
                "locale",
                "online",
                "pagePath",
                "platform",
                "recentEvents",
                "releaseSha",
                "surface",
                "timeZone",
                "viewport",
            ]
        );
        assert_eq!(object["surface"], "cli");
    }

    #[test]
    fn never_carries_the_working_directory() {
        let bundle = diagnostics_from_report(&report(Vec::new()));
        let json = serde_json::to_string(&bundle).expect("serializes");
        assert!(!json.contains("private-project"));
    }

    #[test]
    fn keeps_only_failing_checks_and_bounds_them() {
        let mut checks = vec![check("ok", DoctorStatus::Pass, "all good")];
        for index in 0..15 {
            checks.push(check(
                &format!("fail-{index}"),
                DoctorStatus::Fail,
                "not reachable",
            ));
        }

        let bundle = diagnostics_from_report(&report(checks));
        assert_eq!(bundle.recent_events.len(), MAX_DIAGNOSTIC_EVENTS);
        assert_eq!(
            bundle.recent_events.last().expect("event").message,
            "fail-14: not reachable"
        );
        assert!(bundle
            .recent_events
            .iter()
            .all(|event| event.kind == "error"));
    }
}
