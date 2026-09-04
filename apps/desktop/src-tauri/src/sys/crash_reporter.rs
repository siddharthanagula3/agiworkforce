use crate::sys::security::log_redaction::redact_secrets;
use once_cell::sync::OnceCell;
use sentry::protocol::Level;
use sentry::types::Dsn;
use sentry::ClientOptions;
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

const DSN_ENV_VAR: &str = "SENTRY_DSN";
const FLUSH_TIMEOUT: Duration = Duration::from_secs(2);

static ENABLED: AtomicBool = AtomicBool::new(false);
static GUARD: OnceCell<sentry::ClientInitGuard> = OnceCell::new();

pub fn init() -> bool {
    let Ok(raw_dsn) = std::env::var(DSN_ENV_VAR) else {
        return false;
    };
    let dsn = match Dsn::from_str(&raw_dsn) {
        Ok(dsn) => dsn,
        Err(error) => {
            tracing::warn!("Crash reporting DSN is malformed, disabling: {error}");
            return false;
        }
    };

    let environment = if cfg!(debug_assertions) {
        "development"
    } else {
        "production"
    };
    let mut options = ClientOptions::default();
    options.dsn = Some(dsn);
    options.release = Some(env!("CARGO_PKG_VERSION").into());
    options.environment = Some(environment.into());
    options.attach_stacktrace = true;
    options.send_default_pii = false;
    let guard = sentry::init(options);

    let enabled = guard.is_enabled();
    if GUARD.set(guard).is_err() {
        tracing::warn!("Crash reporter was already initialized");
    }
    enabled
}

pub fn set_enabled(enabled: bool) {
    ENABLED.store(enabled, Ordering::SeqCst);
}

pub fn is_enabled() -> bool {
    ENABLED.load(Ordering::SeqCst)
}

fn redacted_panic_report(location: &str, message: &str) -> String {
    let redacted_message = redact_secrets(message);
    let redacted_location = redact_secrets(location);
    format!("{redacted_message} ({redacted_location})")
}

pub fn capture_panic(location: &str, message: &str) {
    if !is_enabled() || GUARD.get().is_none() {
        return;
    }

    sentry::capture_message(&redacted_panic_report(location, message), Level::Fatal);
    if let Some(client) = sentry::Hub::current().client() {
        client.flush(Some(FLUSH_TIMEOUT));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    #[serial]
    fn defaults_to_disabled() {
        set_enabled(false);
        assert!(!is_enabled());
    }

    #[test]
    #[serial]
    fn set_enabled_flips_the_gate() {
        set_enabled(true);
        assert!(is_enabled());
        set_enabled(false);
        assert!(!is_enabled());
    }

    #[test]
    #[serial]
    fn capture_panic_without_init_does_not_panic() {
        set_enabled(true);
        capture_panic("test.rs:1:1", "boom");
        set_enabled(false);
    }

    #[test]
    fn redacted_panic_report_leaves_ordinary_messages_untouched() {
        let report = redacted_panic_report("src/lib.rs:42:9", "index out of bounds: len 3");
        assert_eq!(report, "index out of bounds: len 3 (src/lib.rs:42:9)");
    }

    #[test]
    fn redacted_panic_report_scrubs_a_bearer_token_from_the_message() {
        let report = redacted_panic_report(
            "src/net.rs:10:1",
            "request failed: Authorization: Bearer sk-1234567890abcdef1234567890abcdef",
        );
        assert!(!report.contains("sk-1234567890abcdef1234567890abcdef"));
        assert!(report.contains("[REDACTED"));
    }

    #[test]
    fn redacted_panic_report_scrubs_a_provider_api_key_from_the_message() {
        let report = redacted_panic_report(
            "src/providers/anthropic.rs:88:5",
            "unwrap on None: api_key=sk-ant-abcdefghijklmnopqrstuvwxyz012345",
        );
        assert!(!report.contains("sk-ant-abcdefghijklmnopqrstuvwxyz012345"));
        assert!(report.contains("[REDACTED_ANTHROPIC_KEY]"));
    }

    #[test]
    fn redacted_panic_report_scrubs_a_jwt_from_the_message() {
        let report = redacted_panic_report(
            "src/auth/session.rs:5:5",
            "token decode failed for eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
        );
        assert!(!report.contains("eyJhbGciOiJIUzI1NiJ9"));
        assert!(report.contains("[REDACTED_JWT]"));
    }
}
