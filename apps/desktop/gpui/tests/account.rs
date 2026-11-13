use agiworkforce_desktop_gpui::account::{AccountView, DeviceLogin};
use agiworkforce_protocol::developer_session::{
    AccountLoginResponse, AccountSource, AccountStatusResponse,
};
use chrono::{TimeZone, Utc};
use std::time::Duration;

fn challenge(url: &str) -> AccountLoginResponse {
    AccountLoginResponse {
        login_id: "fixture-login".into(),
        verification_url: url.into(),
        user_code: Some("TEST-CODE".into()),
        expires_at: Some("2026-11-08T00:15:00Z".into()),
    }
}

#[test]
fn the_wait_deadline_comes_from_the_server_expiry_and_the_request_grace() {
    let now = Utc.with_ymd_and_hms(2026, 11, 8, 0, 0, 0).unwrap();
    let login = DeviceLogin::new(
        challenge("https://account.example/auth/device?code=TEST-CODE"),
        now,
        Duration::from_secs(30),
    )
    .unwrap();
    assert_eq!(login.wait_timeout, Duration::from_secs(930));
    assert_eq!(login.user_code.as_deref(), Some("TEST-CODE"));
}

#[test]
fn unsafe_browser_targets_are_rejected_before_the_platform_can_open_them() {
    let now = Utc.with_ymd_and_hms(2026, 11, 8, 0, 0, 0).unwrap();
    for url in [
        "file:///tmp/test",
        "javascript:alert(1)",
        "custom-app://authorize",
        "http://account.example/auth/device",
        "https://username:password@account.example/auth/device",
        "https://account.example/auth/device#untrusted",
    ] {
        assert!(
            DeviceLogin::new(challenge(url), now, Duration::from_secs(30)).is_err(),
            "{url}"
        );
    }
    for url in [
        "http://localhost:3000/auth/device",
        "http://127.0.0.1:3000/auth/device",
        "http://[::1]:3000/auth/device",
    ] {
        assert!(
            DeviceLogin::new(challenge(url), now, Duration::from_secs(30)).is_ok(),
            "{url}"
        );
    }
}

#[test]
fn missing_expired_or_malformed_challenges_are_not_offered() {
    let now = Utc.with_ymd_and_hms(2026, 11, 8, 0, 15, 0).unwrap();
    let response = challenge("https://account.example/auth/device");
    assert!(DeviceLogin::new(response.clone(), now, Duration::from_secs(30)).is_err());
    let mut missing = response.clone();
    missing.expires_at = None;
    assert!(DeviceLogin::new(missing, now, Duration::from_secs(30)).is_err());
    let mut malformed = response;
    malformed.login_id.clear();
    assert!(DeviceLogin::new(malformed, now, Duration::from_secs(30)).is_err());
}

#[test]
fn signed_out_status_discards_stale_identity_and_does_not_invent_balances() {
    let status = AccountStatusResponse {
        signed_in: false,
        email: Some("stale@example.test".into()),
        tier: Some("fixture-tier".into()),
        balance_credits: Some(50.0),
        purchased_credits: None,
        cached: true,
        source: AccountSource::Cli,
        web_search_key: Some("secret-that-the-panel-must-not-retain".into()),
        web_search_logins: vec![],
    };
    let view = AccountView::from(status);
    assert!(!view.signed_in);
    assert!(view.email.is_none());
    assert!(view.tier.is_none());
    assert!(view.balance_credits.is_none());
    assert!(view.purchased_credits.is_none());
}
