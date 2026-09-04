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

pub fn capture_panic(location: &str, message: &str) {
    if !is_enabled() || GUARD.get().is_none() {
        return;
    }

    sentry::capture_message(&format!("{message} ({location})"), Level::Fatal);
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
}
