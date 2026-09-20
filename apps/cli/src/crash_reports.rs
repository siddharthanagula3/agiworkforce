use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::config::CliConfig;
use crate::platform::runtime::session::PrivacyMode;

pub mod startup_metrics;

use startup_metrics::TerminalErrorKind;

pub const CRASH_REPORTS_ENV: &str = "AGI_CRASH_REPORTS";

const CRASH_REPORT_DIR: &str = "crash-reports";
const CRASH_REPORT_EXTENSION: &str = "json";
const MAX_PENDING_REPORTS: usize = 20;
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(5);
const RELEASE_DSN: Option<&str> = option_env!("AGI_CLI_SENTRY_DSN");
const SENTRY_PROTOCOL_VERSION: &str = "7";
const SENTRY_ENVELOPE_CONTENT_TYPE: &str = "application/x-sentry-envelope";
const RELEASE_PREFIX: &str = "agiworkforce-cli@";
const PANIC_EXCEPTION_TYPE: &str = "panic";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CrashReport {
    pub version: String,
    pub os: String,
    pub arch: String,
    pub location: Option<String>,
    pub thread: Option<String>,
    pub occurred_at_ms: u64,
}

pub fn reporting_enabled(config: &CliConfig, env_value: Option<&str>) -> bool {
    let privacy = config
        .ui
        .privacy_mode
        .as_deref()
        .and_then(PrivacyMode::from_arg)
        .unwrap_or(PrivacyMode::Managed);
    if privacy != PrivacyMode::Managed {
        return false;
    }
    match env_value.map(|value| value.trim().to_ascii_lowercase()) {
        Some(value) if matches!(value.as_str(), "0" | "false" | "off") => false,
        Some(value) if matches!(value.as_str(), "1" | "true" | "on") => true,
        _ => config.telemetry.crash_reports,
    }
}

pub fn report_dir(config_root: &Path) -> PathBuf {
    config_root.join(CRASH_REPORT_DIR)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| u64::try_from(elapsed.as_millis()).unwrap_or(u64::MAX))
        .unwrap_or_default()
}

pub fn build_report(location: Option<String>, thread: Option<String>) -> CrashReport {
    CrashReport {
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        location,
        thread,
        occurred_at_ms: now_ms(),
    }
}

fn describe_location(at: &std::panic::Location<'_>) -> String {
    format!("{}:{}:{}", at.file(), at.line(), at.column())
}

/// The panic payload is deliberately left out: it routinely carries a path, a
/// prompt fragment or a tool argument, and the location already identifies the.
pub fn install_panic_hook(dir: PathBuf) {
    let _ = startup_metrics::record_ready(&dir);
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let location = info.location().map(describe_location);
        let thread = std::thread::current().name().map(str::to_string);
        let written = write_report(&dir, &build_report(location, thread));
        let _ = startup_metrics::record_terminal_error(
            &dir,
            if written.is_ok() {
                TerminalErrorKind::Unhandled
            } else {
                TerminalErrorKind::ReportUnwritable
            },
        );
        previous(info);
    }));
}

pub fn write_report(dir: &Path, report: &CrashReport) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    let path = dir.join(format!(
        "{}-{}.{CRASH_REPORT_EXTENSION}",
        report.occurred_at_ms,
        std::process::id()
    ));
    let body = serde_json::to_vec(report).map_err(std::io::Error::other)?;
    std::fs::write(&path, body)?;
    prune_reports(dir);
    Ok(path)
}

fn report_paths(dir: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let ledger = startup_metrics::metrics_path(dir);
    let mut paths: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path != &ledger
                && path.extension().and_then(|ext| ext.to_str()) == Some(CRASH_REPORT_EXTENSION)
        })
        .collect();
    paths.sort();
    paths
}

fn prune_reports(dir: &Path) {
    let paths = report_paths(dir);
    let excess = paths.len().saturating_sub(MAX_PENDING_REPORTS);
    for path in paths.into_iter().take(excess) {
        let _ = std::fs::remove_file(path);
    }
}

pub fn pending_reports(dir: &Path) -> Vec<(PathBuf, CrashReport)> {
    report_paths(dir)
        .into_iter()
        .filter_map(|path| {
            let bytes = std::fs::read(&path).ok()?;
            let report = serde_json::from_slice::<CrashReport>(&bytes).ok()?;
            Some((path, report))
        })
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SentryEnvelope {
    pub url: String,
    pub body: String,
}

pub fn sentry_envelope(dsn: &str, report: &CrashReport, event_id: &str) -> Option<SentryEnvelope> {
    let parsed = reqwest::Url::parse(dsn).ok()?;
    if parsed.scheme() != "https" {
        return None;
    }
    let public_key = parsed.username();
    let project_id = parsed.path().trim_matches('/');
    let host = parsed.host_str()?;
    if public_key.is_empty() || project_id.is_empty() || project_id.contains('/') {
        return None;
    }
    let port = parsed
        .port()
        .map(|port| format!(":{port}"))
        .unwrap_or_default();
    let url = format!(
        "https://{host}{port}/api/{project_id}/envelope/?sentry_key={public_key}&sentry_version={SENTRY_PROTOCOL_VERSION}"
    );
    let timestamp = report.occurred_at_ms as f64 / 1000.0;
    let header = serde_json::json!({ "event_id": event_id });
    let item = serde_json::json!({ "type": "event" });
    let event = serde_json::json!({
        "event_id": event_id,
        "timestamp": timestamp,
        "platform": "native",
        "level": "fatal",
        "release": format!("{RELEASE_PREFIX}{}", report.version),
        "tags": { "os": report.os, "arch": report.arch, "thread": report.thread },
        "exception": {
            "values": [{
                "type": PANIC_EXCEPTION_TYPE,
                "value": report.location,
                "mechanism": { "type": PANIC_EXCEPTION_TYPE, "handled": false },
            }],
        },
    });
    Some(SentryEnvelope {
        url,
        body: format!("{header}\n{item}\n{event}"),
    })
}

fn crash_upload_client() -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .timeout(UPLOAD_TIMEOUT)
        .build()
}

pub async fn upload_pending(dir: PathBuf) {
    let Some(dsn) = RELEASE_DSN.map(str::trim).filter(|dsn| !dsn.is_empty()) else {
        return;
    };
    let reports = pending_reports(&dir);
    if reports.is_empty() {
        return;
    }
    let Ok(client) = crash_upload_client() else {
        return;
    };
    for (path, report) in reports {
        let event_id = uuid::Uuid::new_v4().simple().to_string();
        let Some(envelope) = sentry_envelope(dsn, &report, &event_id) else {
            return;
        };
        let sent = client
            .post(&envelope.url)
            .header(reqwest::header::CONTENT_TYPE, SENTRY_ENVELOPE_CONTENT_TYPE)
            .body(envelope.body)
            .send()
            .await
            .map(|response| response.status().is_success())
            .unwrap_or(false);
        if sent {
            let _ = std::fs::remove_file(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_with(privacy: Option<&str>, crash_reports: bool) -> CliConfig {
        let mut config = CliConfig::default();
        config.ui.privacy_mode = privacy.map(str::to_string);
        config.telemetry.crash_reports = crash_reports;
        config
    }

    #[test]
    fn crash_reporting_is_off_until_the_user_opts_in() {
        assert!(!reporting_enabled(&config_with(None, false), None));
        assert!(reporting_enabled(&config_with(None, true), None));
        assert!(reporting_enabled(&config_with(None, false), Some("1")));
        assert!(!reporting_enabled(&config_with(None, true), Some("off")));
    }

    #[test]
    fn local_and_byok_never_report_even_when_opted_in() {
        for privacy in ["local", "byok"] {
            assert!(!reporting_enabled(&config_with(Some(privacy), true), None));
            assert!(!reporting_enabled(
                &config_with(Some(privacy), true),
                Some("true")
            ));
        }
        assert!(reporting_enabled(&config_with(Some("managed"), true), None));
    }

    #[test]
    fn a_project_config_cannot_opt_the_user_in() {
        let mut global = config_with(None, false);
        let project = config_with(None, true);
        global.merge_from(&project);
        assert!(!reporting_enabled(&global, None));
    }

    #[test]
    fn crash_reports_round_trip_through_the_config_keys() {
        let mut config = CliConfig::default();
        config.set_value("crash-reports", "true").unwrap();
        assert_eq!(config.get_value("crash-reports").as_deref(), Some("true"));
        assert!(config.set_value("crash-reports", "maybe").is_err());
    }

    #[test]
    fn a_written_report_is_pending_and_the_directory_stays_bounded() {
        let dir = tempfile::tempdir().unwrap();
        for index in 0..(MAX_PENDING_REPORTS + 5) {
            let mut report = build_report(Some(format!("src/lib.rs:{index}:1")), None);
            report.occurred_at_ms = 1_000 + index as u64;
            write_report(dir.path(), &report).unwrap();
        }
        let pending = pending_reports(dir.path());
        assert_eq!(pending.len(), MAX_PENDING_REPORTS);
        assert_eq!(
            pending.last().unwrap().1.location.as_deref(),
            Some(format!("src/lib.rs:{}:1", MAX_PENDING_REPORTS + 4).as_str())
        );
    }

    #[test]
    fn a_panic_is_recorded_by_its_source_location_alone() {
        let location = describe_location(std::panic::Location::caller());
        assert!(location.contains("src/crash_reports.rs:"), "{location}");
        assert_eq!(location.split(':').count(), 3);
    }

    #[test]
    fn installing_the_hook_records_a_ready_launch_without_writing_a_crash_report() {
        let dir = tempfile::tempdir().unwrap();
        startup_metrics::record_ready(dir.path()).unwrap();

        let metrics = startup_metrics::load(dir.path());
        assert_eq!(metrics.ready_count(&startup_metrics::current_version()), 1);
        assert!(pending_reports(dir.path()).is_empty());
    }

    #[test]
    fn the_startup_ledger_is_never_pruned_or_uploaded_as_a_crash_report() {
        let dir = tempfile::tempdir().unwrap();
        startup_metrics::record_ready(dir.path()).unwrap();
        for index in 0..(MAX_PENDING_REPORTS + 5) {
            let mut report = build_report(None, None);
            report.occurred_at_ms = 2_000 + index as u64;
            write_report(dir.path(), &report).unwrap();
        }

        assert_eq!(pending_reports(dir.path()).len(), MAX_PENDING_REPORTS);
        assert!(startup_metrics::metrics_path(dir.path()).exists());
        assert_eq!(
            startup_metrics::load(dir.path()).ready_count(&startup_metrics::current_version()),
            1
        );
    }

    #[test]
    fn the_envelope_targets_the_dsn_project_and_carries_no_payload() {
        let report = CrashReport {
            version: "1.2.3".to_string(),
            os: "macos".to_string(),
            arch: "aarch64".to_string(),
            location: Some("src/tui/mod.rs:10:5".to_string()),
            thread: Some("main".to_string()),
            occurred_at_ms: 1_700_000_000_000,
        };
        let envelope = sentry_envelope(
            "https://publickey@o42.ingest.example.com/7",
            &report,
            "abc123",
        )
        .unwrap();
        assert_eq!(
            envelope.url,
            "https://o42.ingest.example.com/api/7/envelope/?sentry_key=publickey&sentry_version=7"
        );
        let lines: Vec<&str> = envelope.body.lines().collect();
        assert_eq!(lines.len(), 3);
        let event: serde_json::Value = serde_json::from_str(lines[2]).unwrap();
        assert_eq!(event["release"], "agiworkforce-cli@1.2.3");
        assert_eq!(
            event["exception"]["values"][0]["value"],
            "src/tui/mod.rs:10:5"
        );
    }

    #[tokio::test]
    async fn upload_transport_refuses_plaintext_before_connecting() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!("http://{}/envelope", listener.local_addr().unwrap());
        let error = crash_upload_client()
            .unwrap()
            .post(endpoint)
            .send()
            .await
            .unwrap_err();
        assert!(error.is_builder());
        assert_eq!(
            listener.accept().unwrap_err().kind(),
            std::io::ErrorKind::WouldBlock
        );
    }

    #[test]
    fn a_malformed_or_insecure_dsn_produces_no_envelope() {
        let report = build_report(None, None);
        assert!(sentry_envelope("not a url", &report, "id").is_none());
        assert!(sentry_envelope("http://key@host.example.com/7", &report, "id").is_none());
        assert!(sentry_envelope("https://host.example.com/7", &report, "id").is_none());
        assert!(sentry_envelope("https://key@host.example.com/", &report, "id").is_none());
    }
}
