//! 401 -> RFC 9728/8414 discovery -> RFC 7591 registration -> PKCE -> retry.
//!
//! The driving browser shortcuts the interactive approval by hitting the
//! loopback redirect_uri with a fake code + the real state, so the full flow
//! runs end-to-end against the axum sim.

mod support;

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::Ordering;

use agiworkforce_mcp::{McpClient, McpTimeouts, OAuthConfig, TransportConfig};

#[tokio::test]
async fn http_401_triggers_discovery_registration_and_retry() {
    let (app, rec) = support::http_oauth();
    let addr = support::spawn(app).await;

    let browser = Arc::new(support::DrivingBrowser::new());
    let hooks = support::hooks_with(
        Arc::new(agiworkforce_mcp::AutoDeclineHandler),
        browser.clone(),
    );

    let cfg = TransportConfig::Http {
        url: format!("http://{addr}/"),
        headers: HashMap::new(),
        // Empty OAuth config → discovery + dynamic registration.
        oauth: Some(OAuthConfig::default()),
    };

    // The initialize POST returns 401 first; the client runs the OAuth flow and
    // retries. Connect only succeeds if the whole dance works.
    let mut client = McpClient::connect("oauth-sim", cfg, McpTimeouts::default(), hooks)
        .await
        .expect("connect should succeed after OAuth");

    // A follow-up call carries the bearer and succeeds.
    let tools = client.list_tools().await.expect("list_tools after auth");
    assert_eq!(tools.len(), 1);

    // The browser was opened exactly once (the authorization step).
    assert_eq!(browser.opened.load(Ordering::SeqCst), 1);

    // The server saw an unauthenticated initialize (the 401) followed by an
    // authenticated one (the retry), then an authenticated tools/list.
    let reqs = rec.requests.lock().unwrap();
    let inits: Vec<_> = reqs.iter().filter(|r| r.method == "initialize").collect();
    assert!(
        inits.len() >= 2,
        "expected an unauthed + authed initialize, got {}",
        inits.len()
    );
    assert!(inits[0].authorization.is_none(), "first initialize is the 401");
    assert!(
        inits.last().unwrap().authorization.as_deref() == Some("Bearer sim-access-token"),
        "retry initialize must carry the issued bearer"
    );
    let list = reqs.iter().rfind(|r| r.method == "tools/list").unwrap();
    assert_eq!(
        list.authorization.as_deref(),
        Some("Bearer sim-access-token")
    );
}
