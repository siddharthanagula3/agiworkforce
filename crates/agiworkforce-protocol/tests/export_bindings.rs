//! TypeScript binding export for the protocol crate (restructure Wave 5 stage b).
//!
//! Run via `scripts/generate-protocol-types.mjs`, which sets
//! `TS_RS_EXPORT_DIR` to an isolated staging directory and then generates the
//! barrel. `pnpm check:protocol-types` compares that export with the committed
//! working tree without mutating it; `pnpm generate:protocol-types` publishes
//! an updated tree.
//!
//! `export_all_to` walks each root type's dependency graph recursively, so
//! new types reachable from these roots are exported without touching this
//! file. Add a root here only when a type family is NOT reachable from the
//! existing envelopes.

use ts_rs::TS;

#[test]
fn export_typescript_bindings() {
    let dir = std::env::var("TS_RS_EXPORT_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("agiworkforce-protocol-bindings"));
    let dir = dir.as_path();

    // Event envelope, pulls in the bulk of the wire graph (session events,
    // approvals, items, permissions, config views). NOTE: the client->server
    // `Op` envelope does NOT derive TS today (only its payload types do);
    // adding it is tracked follow-up work, not a wiring prerequisite.
    agiworkforce_protocol::protocol::EventMsg::export_all_to(dir).expect("export EventMsg graph");

    // MCP wire types (Tool etc.), consumed by the agiworkforce-mcp crate
    // plan (stage d) and by TS surfaces via the generated barrel.
    agiworkforce_protocol::mcp::Tool::export_all_to(dir).expect("export mcp Tool graph");

    // Local developer-session app-server envelopes. These are consumed by
    // AGI for VS Code and must be generated from the Rust owner rather than
    // copied into extension-only protocol files.
    agiworkforce_protocol::developer_session::AppServerRequest::export_all_to(dir)
        .expect("export developer-session request graph");
    agiworkforce_protocol::developer_session::AppServerResponse::export_all_to(dir)
        .expect("export developer-session response graph");
    agiworkforce_protocol::developer_session::AppServerNotification::export_all_to(dir)
        .expect("export developer-session notification graph");
    agiworkforce_protocol::developer_session::InitializeParams::export_all_to(dir)
        .expect("export developer-session initialize params graph");
    agiworkforce_protocol::developer_session::InitializeResponse::export_all_to(dir)
        .expect("export developer-session initialize graph");
    agiworkforce_protocol::developer_session::ThreadStartParams::export_all_to(dir)
        .expect("export developer-session thread start params graph");
    agiworkforce_protocol::developer_session::ThreadStartResponse::export_all_to(dir)
        .expect("export developer-session thread start graph");
    agiworkforce_protocol::developer_session::ThreadListParams::export_all_to(dir)
        .expect("export developer-session thread list params graph");
    agiworkforce_protocol::developer_session::ThreadListResponse::export_all_to(dir)
        .expect("export developer-session thread graph");
    agiworkforce_protocol::developer_session::LocalModelListResponse::export_all_to(dir)
        .expect("export developer-session local model graph");
    agiworkforce_protocol::developer_session::ThreadReadResponse::export_all_to(dir)
        .expect("export developer-session thread history graph");
    agiworkforce_protocol::developer_session::ThreadIdParams::export_all_to(dir)
        .expect("export developer-session thread id graph");
    agiworkforce_protocol::developer_session::ThreadForkParams::export_all_to(dir)
        .expect("export developer-session thread fork graph");
    agiworkforce_protocol::developer_session::TurnStartParams::export_all_to(dir)
        .expect("export developer-session turn graph");
    agiworkforce_protocol::developer_session::TurnSteerParams::export_all_to(dir)
        .expect("export developer-session steer graph");
    agiworkforce_protocol::developer_session::TurnStartResponse::export_all_to(dir)
        .expect("export developer-session turn response graph");
    agiworkforce_protocol::developer_session::TurnInterruptParams::export_all_to(dir)
        .expect("export developer-session interrupt graph");
    // `turn/completed` and `turn/failed` params, and with them the typed
    // failure a client branches on. No envelope references them.
    agiworkforce_protocol::developer_session::TurnEndedNotification::export_all_to(dir)
        .expect("export developer-session turn ended graph");
    agiworkforce_protocol::developer_session::ApprovalResponseParams::export_all_to(dir)
        .expect("export developer-session approval graph");
    agiworkforce_protocol::developer_session::AcknowledgedResponse::export_all_to(dir)
        .expect("export developer-session acknowledgement graph");

    // v8 developer-session surfaces. Each response is its own root: no
    // envelope references them, so none is reachable from the roots above.
    agiworkforce_protocol::developer_session::AccountStatusParams::export_all_to(dir)
        .expect("export developer-session account status params graph");
    agiworkforce_protocol::developer_session::AccountStatusResponse::export_all_to(dir)
        .expect("export developer-session account status graph");
    agiworkforce_protocol::developer_session::AccountLoginResponse::export_all_to(dir)
        .expect("export developer-session account login graph");
    agiworkforce_protocol::developer_session::AccountLoginWaitParams::export_all_to(dir)
        .expect("export developer-session account login wait params graph");
    agiworkforce_protocol::developer_session::AccountLoginWaitResponse::export_all_to(dir)
        .expect("export developer-session account login wait graph");
    agiworkforce_protocol::developer_session::AccountTokenResponse::export_all_to(dir)
        .expect("export developer-session account token graph");
    agiworkforce_protocol::developer_session::ContextInstructionsParams::export_all_to(dir)
        .expect("export developer-session instruction params graph");
    agiworkforce_protocol::developer_session::ContextInstructionsResponse::export_all_to(dir)
        .expect("export developer-session instruction graph");
    agiworkforce_protocol::developer_session::SkillListResponse::export_all_to(dir)
        .expect("export developer-session skill graph");
    agiworkforce_protocol::developer_session::SkillSetEnabledParams::export_all_to(dir)
        .expect("export developer-session skill toggle graph");
    agiworkforce_protocol::developer_session::SkillConsentParams::export_all_to(dir)
        .expect("export developer-session skill consent params graph");
    agiworkforce_protocol::developer_session::SkillConsentResponse::export_all_to(dir)
        .expect("export developer-session skill consent graph");
    agiworkforce_protocol::developer_session::PluginListResponse::export_all_to(dir)
        .expect("export developer-session plugin graph");
    agiworkforce_protocol::developer_session::PluginSetEnabledParams::export_all_to(dir)
        .expect("export developer-session plugin toggle graph");
    agiworkforce_protocol::developer_session::McpServerListResponse::export_all_to(dir)
        .expect("export developer-session mcp graph");
    agiworkforce_protocol::developer_session::McpLoginParams::export_all_to(dir)
        .expect("export developer-session mcp login params graph");
    agiworkforce_protocol::developer_session::McpLoginResponse::export_all_to(dir)
        .expect("export developer-session mcp login graph");
    agiworkforce_protocol::developer_session::HookListResponse::export_all_to(dir)
        .expect("export developer-session hook graph");
    agiworkforce_protocol::developer_session::SettingsReadResponse::export_all_to(dir)
        .expect("export developer-session settings graph");
    agiworkforce_protocol::developer_session::SettingsWriteParams::export_all_to(dir)
        .expect("export developer-session settings write graph");
    agiworkforce_protocol::developer_session::SlashCommandListResponse::export_all_to(dir)
        .expect("export developer-session command graph");
    agiworkforce_protocol::developer_session::SlashCommandRunParams::export_all_to(dir)
        .expect("export developer-session command run params graph");
    agiworkforce_protocol::developer_session::SlashCommandRunResponse::export_all_to(dir)
        .expect("export developer-session command run graph");

    // One versioned agent event envelope (W5 discipline-wave item 4), not
    // reachable from any root above (a new, independent top-level type), so
    // it needs its own root per this file's own doc comment.
    agiworkforce_protocol::agent_events::AgentEventEnvelope::export_all_to(dir)
        .expect("export agent event envelope graph");

    // The tool primitive (decision D-P0-5). Definition, permission, approval,
    // result and audit are five independent roots: no envelope references
    // them, so none is reachable from the roots above.
    agiworkforce_protocol::tool_primitive::ToolDefinition::export_all_to(dir)
        .expect("export tool definition graph");
    agiworkforce_protocol::tool_primitive::ToolPermission::export_all_to(dir)
        .expect("export tool permission graph");
    agiworkforce_protocol::tool_primitive::ToolApprovalRequest::export_all_to(dir)
        .expect("export tool approval request graph");
    agiworkforce_protocol::tool_primitive::ToolApprovalDecision::export_all_to(dir)
        .expect("export tool approval decision graph");
    agiworkforce_protocol::tool_primitive::ToolResult::export_all_to(dir)
        .expect("export tool result graph");
    agiworkforce_protocol::tool_primitive::ToolAuditRecord::export_all_to(dir)
        .expect("export tool audit record graph");
}
