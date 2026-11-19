use agiworkforce_desktop_gpui::mcp_servers::{
    apply_accepted, apply_refused, enable_request, project, McpRow,
};
use agiworkforce_protocol::developer_session::{
    McpServerConfiguredStatus, McpServerListResponse, McpServerScope, McpServerSummary,
    McpSetEnabledParams,
};

fn server(name: &str, disabled: bool) -> McpServerSummary {
    McpServerSummary {
        name: name.into(),
        transport: "stdio".into(),
        scope: McpServerScope::User,
        status: McpServerConfiguredStatus::Configured,
        policy_refusal: None,
        url: None,
        disabled,
    }
}

fn listed(disabled: bool) -> McpServerListResponse {
    McpServerListResponse {
        servers: vec![server("local", disabled)],
    }
}

#[test]
fn enabling_an_mcp_server_waits_for_the_host_and_a_refusal_keeps_the_previous_state() {
    let previous = project(&listed(true)).unwrap();
    assert!(!previous[0].enabled);
    let request = enable_request(&previous, "local", true).unwrap();
    assert_eq!(
        request,
        McpSetEnabledParams {
            name: "local".into(),
            enabled: true,
        }
    );
    assert!(apply_accepted(&previous, &listed(true), &request).is_err());
    assert_eq!(apply_refused(previous.clone()), previous);
    let accepted = apply_accepted(&previous, &listed(false), &request).unwrap();
    assert!(accepted[0].enabled);
    assert!(enable_request(&accepted, "local", true).is_err());
    let _ = McpRow {
        name: "local".into(),
        enabled: true,
        transport: "stdio".into(),
        scope: McpServerScope::User,
    };
}
