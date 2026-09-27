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

    // The unauthenticated discovery probe drew the 401; every request after
    // the flow, the retried probe and the legacy initialize included, carries
    // the issued bearer.
    let reqs = rec.requests.lock().unwrap();
    let first = reqs.first().expect("requests recorded");
    assert_eq!(first.method, "server/discover");
    assert!(first.authorization.is_none(), "the first probe is the 401");
    let inits: Vec<_> = reqs.iter().filter(|r| r.method == "initialize").collect();
    assert!(!inits.is_empty(), "the legacy fallback must initialize");
    assert!(
        inits
            .iter()
            .all(|r| r.authorization.as_deref() == Some("Bearer sim-access-token")),
        "initialize must carry the issued bearer"
    );
    let list = reqs.iter().rfind(|r| r.method == "tools/list").unwrap();
    assert_eq!(
        list.authorization.as_deref(),
        Some("Bearer sim-access-token")
    );
}
