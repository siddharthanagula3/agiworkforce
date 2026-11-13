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
    agiworkforce_protocol::worktree_apply::WorktreeApplyResultParams::export_all_to(dir)
        .expect("worktree apply result params");
    agiworkforce_protocol::worktree_apply::WorktreeApplyResultPage::export_all_to(dir)
        .expect("worktree apply result page");
    agiworkforce_protocol::worktree_apply::WorktreeApplyPlanParams::export_all_to(dir)
        .expect("worktree apply plan params");
    agiworkforce_protocol::worktree_apply::WorktreeApplyPlan::export_all_to(dir)
        .expect("worktree apply plan");
    agiworkforce_protocol::worktree_apply::WorktreeApplyCommitParams::export_all_to(dir)
        .expect("worktree apply commit params");
    agiworkforce_protocol::worktree_apply::WorktreeApplyResult::export_all_to(dir)
        .expect("worktree apply result");
    agiworkforce_protocol::worktree_apply::WorktreeApplyCommitFailure::export_all_to(dir)
        .expect("worktree apply failure");
    agiworkforce_protocol::project_files::CloudProjectFileReindexResponse::export_all_to(dir)
        .expect("project file reindex");
    agiworkforce_protocol::project_files::CloudProjectDownloadPrepareParams::export_all_to(dir)
        .expect("project downloads");
    agiworkforce_protocol::project_files::CloudProjectDownloadId::export_all_to(dir)
        .expect("project downloads");
    agiworkforce_protocol::project_files::CloudProjectDownloadSnapshot::export_all_to(dir)
        .expect("project downloads");

    agiworkforce_protocol::project_files::CloudProjectUploadPrepareParams::export_all_to(dir)
        .expect("project upload");
    agiworkforce_protocol::project_files::CloudProjectUploadId::export_all_to(dir)
        .expect("project upload");
    agiworkforce_protocol::project_files::CloudProjectUploadSnapshot::export_all_to(dir)
        .expect("project upload");

    agiworkforce_protocol::project_files::CloudProjectFilesResponse::export_all_to(dir)
        .expect("project files");
    agiworkforce_protocol::project_files::CloudProjectFileTarget::export_all_to(dir)
        .expect("project file target");
    agiworkforce_protocol::project_files::CloudProjectFilePreview::export_all_to(dir)
        .expect("project file preview");
    agiworkforce_protocol::workspace_terminal::TerminalPlanParams::export_all_to(dir)
        .expect("TerminalPlanParams");
    agiworkforce_protocol::workspace_terminal::TerminalPlan::export_all_to(dir)
        .expect("TerminalPlan");
    agiworkforce_protocol::workspace_terminal::TerminalIdParams::export_all_to(dir)
        .expect("TerminalIdParams");
    agiworkforce_protocol::workspace_terminal::TerminalListParams::export_all_to(dir)
        .expect("TerminalListParams");
    agiworkforce_protocol::workspace_terminal::TerminalListResponse::export_all_to(dir)
        .expect("TerminalListResponse");
    agiworkforce_protocol::workspace_terminal::TerminalReadParams::export_all_to(dir)
        .expect("TerminalReadParams");
    agiworkforce_protocol::workspace_terminal::TerminalReadResponse::export_all_to(dir)
        .expect("TerminalReadResponse");
    agiworkforce_protocol::workspace_terminal::TerminalWriteParams::export_all_to(dir)
        .expect("TerminalWriteParams");
    agiworkforce_protocol::workspace_terminal::TerminalResizeParams::export_all_to(dir)
        .expect("TerminalResizeParams");
    agiworkforce_protocol::workspace_files::WorkspaceDirectoryParams::export_all_to(dir)
        .expect("directory params");
    agiworkforce_protocol::workspace_files::WorkspaceDirectoryResponse::export_all_to(dir)
        .expect("directory response");
    agiworkforce_protocol::workspace_files::WorkspaceFileParams::export_all_to(dir)
        .expect("file params");
    agiworkforce_protocol::workspace_files::WorkspaceFileResponse::export_all_to(dir)
        .expect("file response");
    agiworkforce_protocol::workspace_files::WorkspaceFileWriteParams::export_all_to(dir)
        .expect("file write params");
    agiworkforce_protocol::workspace_files::WorkspaceFileWriteResponse::export_all_to(dir)
        .expect("file write response");
    agiworkforce_protocol::workspace_files::WorkspaceFileRecoveryWriteParams::export_all_to(dir)
        .expect("file recovery write params");
    agiworkforce_protocol::workspace_files::WorkspaceFileRecoveryWriteResponse::export_all_to(dir)
        .expect("file recovery write response");
    agiworkforce_protocol::workspace_files::WorkspaceFileRecoveryListParams::export_all_to(dir)
        .expect("file recovery list params");
    agiworkforce_protocol::workspace_files::WorkspaceFileRecoveryListResponse::export_all_to(dir)
        .expect("file recovery list response");
    agiworkforce_protocol::workspace_files::WorkspaceFileRecoveryRestoreParams::export_all_to(dir)
        .expect("file recovery restore params");
    agiworkforce_protocol::workspace_files::WorkspaceFileRecoveryRestoreResponse::export_all_to(
        dir,
    )
    .expect("file recovery restore response");
    agiworkforce_protocol::workspace_files::WorkspaceFileRecoveryRestoreFailure::export_all_to(dir)
        .expect("file recovery restore failure");
    agiworkforce_protocol::account_cloud::CloudWorkRequest::export_all_to(dir)
        .expect("work request");
    agiworkforce_protocol::account_cloud::CloudWorkPlanUpdateParams::export_all_to(dir)
        .expect("work plan decline");
    agiworkforce_protocol::account_cloud::CloudRunListParams::export_all_to(dir)
        .expect("cloud run list params");
    agiworkforce_protocol::account_cloud::CloudRunListResponse::export_all_to(dir)
        .expect("cloud run list response");
    agiworkforce_protocol::account_cloud::CloudRunAttachParams::export_all_to(dir)
        .expect("cloud run attach params");
    agiworkforce_protocol::account_cloud::CloudRunAttachResponse::export_all_to(dir)
        .expect("cloud run attach response");
    agiworkforce_protocol::account_cloud::CloudProjectListParams::export_all_to(dir)
        .expect("cloud projects");
    agiworkforce_protocol::account_cloud::CloudProjectListResponse::export_all_to(dir)
        .expect("cloud projects");
    agiworkforce_protocol::account_cloud::CloudProjectTarget::export_all_to(dir)
        .expect("cloud projects");
    agiworkforce_protocol::account_cloud::CloudProjectResponse::export_all_to(dir)
        .expect("cloud projects");
    agiworkforce_protocol::account_cloud::CloudProjectCreateParams::export_all_to(dir)
        .expect("cloud projects");
    agiworkforce_protocol::account_cloud::CloudProjectUpdateParams::export_all_to(dir)
        .expect("cloud projects");
    agiworkforce_protocol::account_cloud::CloudDraftSaveParams::export_all_to(dir)
        .expect("draft save params");
    agiworkforce_protocol::account_cloud::CloudDraftSaveResponse::export_all_to(dir)
        .expect("draft save response");
    agiworkforce_protocol::account_cloud::CloudConversationUpdateParams::export_all_to(dir)
        .expect("conversation update params");
    agiworkforce_protocol::account_cloud::CloudConversationUpdateResponse::export_all_to(dir)
        .expect("conversation update response");
    agiworkforce_protocol::account_cloud::CloudConversationCreateParams::export_all_to(dir)
        .expect("cloud create params");
    agiworkforce_protocol::account_cloud::CloudConversationCreateResponse::export_all_to(dir)
        .expect("cloud create response");
    agiworkforce_protocol::account_cloud::CloudTurnStartParams::export_all_to(dir)
        .expect("cloud turn start");
    agiworkforce_protocol::account_cloud::CloudTurnIdParams::export_all_to(dir)
        .expect("cloud turn id");
    agiworkforce_protocol::account_cloud::CloudTurnSnapshot::export_all_to(dir)
        .expect("cloud turn snapshot");
    agiworkforce_protocol::account_cloud::CloudTurnResumeParams::export_all_to(dir)
        .expect("cloud turn resume");
    agiworkforce_protocol::account_cloud::CloudHistoryListParams::export_all_to(dir)
        .expect("cloud history list request");
    agiworkforce_protocol::account_cloud::CloudHistoryReadParams::export_all_to(dir)
        .expect("cloud history read request");
    agiworkforce_protocol::account_cloud::CloudWorkspacesListParams::export_all_to(dir)
        .expect("workspaces list");
    agiworkforce_protocol::account_cloud::CloudWorkspacesListResponse::export_all_to(dir)
        .expect("workspaces response");
    agiworkforce_protocol::account_cloud::CloudWorkspaceSelectParams::export_all_to(dir)
        .expect("workspace selection");
    agiworkforce_protocol::account_cloud::CloudWorkspaceSelectResponse::export_all_to(dir)
        .expect("workspace selection response");
    agiworkforce_protocol::account_cloud::CloudModelListParams::export_all_to(dir)
        .expect("cloud model params");
    agiworkforce_protocol::account_cloud::CloudModelListResponse::export_all_to(dir)
        .expect("cloud model response");
    agiworkforce_protocol::account_cloud::CloudHistoryListResponse::export_all_to(dir)
        .expect("cloud history list response");
    agiworkforce_protocol::attachment_recovery::AttachmentRecoveryReadResponse::export_all_to(dir)
        .expect("attachment recovery");
    agiworkforce_protocol::attachment_recovery::AttachmentRecoveryChangeParams::export_all_to(dir)
        .expect("attachment recovery");
    agiworkforce_protocol::attachment_recovery::AttachmentRecoveryChangeResponse::export_all_to(
        dir,
    )
    .expect("attachment recovery");
    agiworkforce_protocol::attachment_recovery::AttachmentRecoveryListParams::export_all_to(dir)
        .expect("attachment recovery");
    agiworkforce_protocol::attachment_recovery::AttachmentRecoveryListResponse::export_all_to(dir)
        .expect("attachment recovery");
    agiworkforce_protocol::cloud_uploads::CloudUploadPrepareParams::export_all_to(dir)
        .expect("upload prepare");
    agiworkforce_protocol::cloud_uploads::CloudUploadSnapshot::export_all_to(dir)
        .expect("upload snapshot");
    agiworkforce_protocol::account_cloud::CloudHistoryReadResponse::export_all_to(dir)
        .expect("cloud history read response");
    agiworkforce_protocol::developer_session::DeveloperWorkspaceIdentity::export_all_to(dir)
        .expect("workspace identity bindings");

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
    agiworkforce_protocol::developer_session::ProtocolVersionUnsupportedData::export_all_to(dir)
        .expect("export developer-session version refusal graph");
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
    agiworkforce_protocol::developer_session::ModelListParams::export_all_to(dir)
        .expect("export developer-session model list params graph");
    agiworkforce_protocol::developer_session::ThreadReadResponse::export_all_to(dir)
        .expect("export developer-session thread history graph");
    agiworkforce_protocol::developer_session::ThreadIdParams::export_all_to(dir)
        .expect("export developer-session thread id graph");
    agiworkforce_protocol::developer_session::ThreadForkParams::export_all_to(dir)
        .expect("export developer-session thread fork graph");
    agiworkforce_protocol::developer_session::ThreadCompactParams::export_all_to(dir)
        .expect("export developer-session thread compact params graph");
    agiworkforce_protocol::developer_session::ThreadCompactResponse::export_all_to(dir)
        .expect("export developer-session thread compact response graph");
    agiworkforce_protocol::developer_session::ThreadHandoffParams::export_all_to(dir)
        .expect("export developer-session handoff params graph");
    agiworkforce_protocol::developer_session::ThreadHandoffAcceptParams::export_all_to(dir)
        .expect("export developer-session handoff accept graph");
    agiworkforce_protocol::developer_session::TurnStartParams::export_all_to(dir)
        .expect("export developer-session turn graph");
    agiworkforce_protocol::developer_session::TurnSteerParams::export_all_to(dir)
        .expect("export developer-session steer graph");
    agiworkforce_protocol::developer_session::TurnStartResponse::export_all_to(dir)
        .expect("export developer-session turn response graph");
    agiworkforce_protocol::developer_session::TurnStartedNotification::export_all_to(dir)
        .expect("export developer-session turn started notification");
    agiworkforce_protocol::developer_session::TurnOutputDeltaNotification::export_all_to(dir)
        .expect("export developer-session output delta notification");
    agiworkforce_protocol::developer_session::ApprovalRequestedNotification::export_all_to(dir)
        .expect("export developer-session approval notification");
    agiworkforce_protocol::developer_session::TurnInterruptParams::export_all_to(dir)
        .expect("export developer-session interrupt graph");
    // `turn/completed` and `turn/failed` params, and with them the typed
    // failure a client branches on. No envelope references them.
    agiworkforce_protocol::developer_session::TurnEndedNotification::export_all_to(dir)
        .expect("export developer-session turn ended graph");
    agiworkforce_protocol::developer_session::ApprovalResponseParams::export_all_to(dir)
        .expect("export developer-session approval graph");
    agiworkforce_protocol::developer_session::UserInputRequestedParams::export_all_to(dir)
        .expect("export developer-session user input request graph");
    agiworkforce_protocol::developer_session::UserInputResponseParams::export_all_to(dir)
        .expect("export developer-session user input response graph");
    agiworkforce_protocol::developer_session::AcknowledgedResponse::export_all_to(dir)
        .expect("export developer-session acknowledgement graph");
    // Session lifecycle and concurrency: `thread/reconnect`, the writer lease
    // notification and conflict data, and the `turn/model` route report.
    agiworkforce_protocol::developer_session::ThreadReconnectResponse::export_all_to(dir)
        .expect("export developer-session reconnect graph");
    agiworkforce_protocol::developer_session::ThreadWriterChangedNotification::export_all_to(dir)
        .expect("export developer-session writer change graph");
    agiworkforce_protocol::developer_session::ThreadWriterConflictData::export_all_to(dir)
        .expect("export developer-session writer conflict graph");
    agiworkforce_protocol::developer_session::PrivacyBoundaryRefusalData::export_all_to(dir)
        .expect("export developer-session privacy boundary refusal graph");
    agiworkforce_protocol::developer_session::TurnModelNotification::export_all_to(dir)
        .expect("export developer-session turn model graph");

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
    agiworkforce_protocol::developer_session::McpSetEnabledParams::export_all_to(dir)
        .expect("export developer-session mcp toggle graph");
    agiworkforce_protocol::developer_session::McpLoginParams::export_all_to(dir)
        .expect("export developer-session mcp login params graph");
    agiworkforce_protocol::developer_session::McpLoginResponse::export_all_to(dir)
        .expect("export developer-session mcp login graph");
    agiworkforce_protocol::developer_session::McpApprovalReadParams::export_all_to(dir)
        .expect("export developer-session mcp approval read params graph");
    agiworkforce_protocol::developer_session::McpApprovalRequest::export_all_to(dir)
        .expect("export developer-session mcp approval request graph");
    agiworkforce_protocol::developer_session::McpApprovalGrantParams::export_all_to(dir)
        .expect("export developer-session mcp approval grant params graph");
    agiworkforce_protocol::developer_session::HookListResponse::export_all_to(dir)
        .expect("export developer-session hook graph");
    agiworkforce_protocol::developer_session::SettingsReadResponse::export_all_to(dir)
        .expect("export developer-session settings graph");
    agiworkforce_protocol::developer_session::SettingsWriteParams::export_all_to(dir)
        .expect("export developer-session settings write graph");
    agiworkforce_protocol::instruction_settings::InstructionSettingsReadParams::export_all_to(dir)
        .expect("instruction settings read");
    agiworkforce_protocol::instruction_settings::InstructionSettingsWriteParams::export_all_to(dir)
        .expect("instruction settings write");
    agiworkforce_protocol::instruction_settings::InstructionSettingsWriteResponse::export_all_to(
        dir,
    )
    .expect("instruction settings response");
    agiworkforce_protocol::developer_session::SlashCommandListResponse::export_all_to(dir)
        .expect("export developer-session command graph");
    agiworkforce_protocol::developer_session::SlashCommandRunParams::export_all_to(dir)
        .expect("export developer-session command run params graph");
    agiworkforce_protocol::developer_session::SlashCommandRunResponse::export_all_to(dir)
        .expect("export developer-session command run graph");
    agiworkforce_protocol::developer_session::ThreadSearchParams::export_all_to(dir)
        .expect("export developer-session thread search params graph");
    agiworkforce_protocol::developer_session::ThreadRenameParams::export_all_to(dir)
        .expect("export developer-session thread rename params graph");
    agiworkforce_protocol::developer_session::ThreadRenameResponse::export_all_to(dir)
        .expect("export developer-session thread rename graph");
    agiworkforce_protocol::developer_session::ThreadPinParams::export_all_to(dir)
        .expect("export developer-session thread pin params graph");
    agiworkforce_protocol::developer_session::ThreadPinResponse::export_all_to(dir)
        .expect("export developer-session thread pin graph");
    agiworkforce_protocol::developer_session::ThreadPinnedNotification::export_all_to(dir)
        .expect("export developer-session thread pinned notification graph");
    agiworkforce_protocol::developer_session::McpLogsParams::export_all_to(dir)
        .expect("export developer-session mcp logs params graph");
    agiworkforce_protocol::developer_session::McpLogsResponse::export_all_to(dir)
        .expect("export developer-session mcp logs graph");
    agiworkforce_protocol::developer_session::TerminalOpenParams::export_all_to(dir)
        .expect("export developer-session terminal open params graph");
    agiworkforce_protocol::developer_session::TerminalOpenResponse::export_all_to(dir)
        .expect("export developer-session terminal open graph");
    agiworkforce_protocol::developer_session::TerminalWriteParams::export_all_to(dir)
        .expect("export developer-session terminal write params graph");
    agiworkforce_protocol::developer_session::TerminalResizeParams::export_all_to(dir)
        .expect("export developer-session terminal resize params graph");
    agiworkforce_protocol::developer_session::TerminalCloseParams::export_all_to(dir)
        .expect("export developer-session terminal close params graph");
    agiworkforce_protocol::developer_session::TerminalOutputNotification::export_all_to(dir)
        .expect("export developer-session terminal output notification graph");
    agiworkforce_protocol::developer_session::TerminalExitedNotification::export_all_to(dir)
        .expect("export developer-session terminal exited notification graph");
    agiworkforce_protocol::developer_session::ThreadSideQuestionParams::export_all_to(dir)
        .expect("export developer-session side question params graph");
    agiworkforce_protocol::developer_session::ThreadSideQuestionResponse::export_all_to(dir)
        .expect("export developer-session side question graph");
    agiworkforce_protocol::developer_session::ThreadSideQuestionDelta::export_all_to(dir)
        .expect("export developer-session side question delta graph");
    agiworkforce_protocol::developer_session::ThreadSearchResponse::export_all_to(dir)
        .expect("export developer-session thread search graph");
    agiworkforce_protocol::developer_session::MemoryAddParams::export_all_to(dir)
        .expect("export developer-session memory add params graph");
    agiworkforce_protocol::developer_session::MemoryAddResponse::export_all_to(dir)
        .expect("export developer-session memory add graph");
    agiworkforce_protocol::developer_session::ThreadCheckpointsResponse::export_all_to(dir)
        .expect("export developer-session checkpoint list graph");
    agiworkforce_protocol::developer_session::ThreadRewindParams::export_all_to(dir)
        .expect("export developer-session rewind params graph");
    agiworkforce_protocol::developer_session::ThreadRewindResponse::export_all_to(dir)
        .expect("export developer-session rewind graph");
    agiworkforce_protocol::developer_session::ThreadPlanNotification::export_all_to(dir)
        .expect("export developer-session plan notification graph");
    agiworkforce_protocol::developer_session::McpServerParams::export_all_to(dir)
        .expect("export developer-session mcp server params graph");
    agiworkforce_protocol::developer_session::McpServerTestResponse::export_all_to(dir)
        .expect("export developer-session mcp test graph");
    agiworkforce_protocol::developer_session::McpServerToolsResponse::export_all_to(dir)
        .expect("export developer-session mcp tools graph");
    agiworkforce_protocol::developer_session::HookAddParams::export_all_to(dir)
        .expect("export developer-session hook add params graph");
    agiworkforce_protocol::developer_session::HookRemoveParams::export_all_to(dir)
        .expect("export developer-session hook remove params graph");
    agiworkforce_protocol::developer_session::SkillInstallParams::export_all_to(dir)
        .expect("export developer-session skill install params graph");
    agiworkforce_protocol::developer_session::SkillRemoveParams::export_all_to(dir)
        .expect("export developer-session skill remove params graph");
    agiworkforce_protocol::developer_session::PluginInstallParams::export_all_to(dir)
        .expect("export developer-session plugin install params graph");
    agiworkforce_protocol::developer_session::PluginRemoveParams::export_all_to(dir)
        .expect("export developer-session plugin remove params graph");
    agiworkforce_protocol::developer_session::PluginUpdateResponse::export_all_to(dir)
        .expect("export developer-session plugin update graph");
    agiworkforce_protocol::developer_session::McpAddParams::export_all_to(dir)
        .expect("export developer-session mcp add params graph");
    agiworkforce_protocol::developer_session::WorktreeCreateParams::export_all_to(dir)
        .expect("export developer-session worktree create params graph");
    agiworkforce_protocol::developer_session::WorktreeSummary::export_all_to(dir)
        .expect("export developer-session worktree summary graph");
    agiworkforce_protocol::developer_session::WorktreeListResponse::export_all_to(dir)
        .expect("export developer-session worktree list graph");
    agiworkforce_protocol::developer_session::WorktreeRemoveParams::export_all_to(dir)
        .expect("export developer-session worktree remove params graph");
    agiworkforce_protocol::developer_session::McpAuthRequiredNotification::export_all_to(dir)
        .expect("export developer-session mcp auth required graph");
    agiworkforce_protocol::developer_session::McpServerInspectResponse::export_all_to(dir)
        .expect("export developer-session mcp inspect graph");
    agiworkforce_protocol::developer_session::PermissionsListResponse::export_all_to(dir)
        .expect("export developer-session permissions list graph");
    agiworkforce_protocol::developer_session::PermissionsRemoveParams::export_all_to(dir)
        .expect("export developer-session permissions remove params graph");
    agiworkforce_protocol::developer_session::PlanDecideParams::export_all_to(dir)
        .expect("export developer-session plan decide params graph");
    agiworkforce_protocol::developer_session::GitPullRequestPlanParams::export_all_to(dir)
        .expect("export developer-session pull request plan params graph");
    agiworkforce_protocol::developer_session::GitPullRequestPlanResponse::export_all_to(dir)
        .expect("export developer-session pull request plan graph");
    agiworkforce_protocol::developer_session::GitPullRequestParams::export_all_to(dir)
        .expect("export developer-session pull request params graph");
    agiworkforce_protocol::developer_session::GitPullRequestResponse::export_all_to(dir)
        .expect("export developer-session pull request graph");

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

    // Session handoff. The record and what a receiving surface makes of it are
    // three independent roots: no envelope above carries them as typed params.
    agiworkforce_protocol::developer_session::DeveloperSessionHandoff::export_all_to(dir)
        .expect("export session handoff graph");
    agiworkforce_protocol::developer_session::HandoffAdmission::export_all_to(dir)
        .expect("export session handoff admission graph");
    agiworkforce_protocol::developer_session::HandoffRefusal::export_all_to(dir)
        .expect("export session handoff refusal graph");

    // Worktrees and per-turn checkpoints. Every params and response type is
    // its own root: no envelope carries them as typed params.
    agiworkforce_protocol::developer_session::ManagedWorktreeCreateParams::export_all_to(dir)
        .expect("export developer-session worktree create params graph");
    agiworkforce_protocol::developer_session::WorktreeCreateResponse::export_all_to(dir)
        .expect("export developer-session worktree create graph");
    agiworkforce_protocol::developer_session::ManagedWorktreeListResponse::export_all_to(dir)
        .expect("export developer-session worktree list graph");
    agiworkforce_protocol::developer_session::WorktreeIdParams::export_all_to(dir)
        .expect("export developer-session worktree id graph");
    agiworkforce_protocol::developer_session::WorktreeKeepParams::export_all_to(dir)
        .expect("export developer-session worktree keep params graph");
    agiworkforce_protocol::developer_session::WorktreeKeepResponse::export_all_to(dir)
        .expect("export developer-session worktree keep graph");
    agiworkforce_protocol::developer_session::WorktreePinParams::export_all_to(dir)
        .expect("export developer-session worktree pin graph");
    agiworkforce_protocol::developer_session::WorktreeApplyParams::export_all_to(dir)
        .expect("export developer-session worktree apply params graph");
    agiworkforce_protocol::developer_session::WorktreeApplyResponse::export_all_to(dir)
        .expect("export developer-session worktree apply graph");
    agiworkforce_protocol::developer_session::WorktreeArchive::export_all_to(dir)
        .expect("export developer-session worktree archive graph");
    agiworkforce_protocol::developer_session::WorktreeSetupRunParams::export_all_to(dir)
        .expect("export developer-session worktree setup params graph");
    agiworkforce_protocol::developer_session::WorktreeSetupFinishedNotification::export_all_to(dir)
        .expect("export developer-session worktree setup finished graph");
    agiworkforce_protocol::developer_session::WorktreeSetupLogNotification::export_all_to(dir)
        .expect("export developer-session worktree setup log graph");
    agiworkforce_protocol::developer_session::CheckpointListResponse::export_all_to(dir)
        .expect("export developer-session checkpoint list graph");
    agiworkforce_protocol::developer_session::CheckpointTurnParams::export_all_to(dir)
        .expect("export developer-session checkpoint turn params graph");
    agiworkforce_protocol::developer_session::CheckpointDiffResponse::export_all_to(dir)
        .expect("export developer-session checkpoint diff graph");
    agiworkforce_protocol::developer_session::CheckpointSectionsParams::export_all_to(dir)
        .expect("export developer-session checkpoint sections params graph");
    agiworkforce_protocol::developer_session::CheckpointSectionsResponse::export_all_to(dir)
        .expect("export developer-session checkpoint sections graph");
    agiworkforce_protocol::developer_session::ThreadRevertParams::export_all_to(dir)
        .expect("export developer-session thread revert params graph");
    agiworkforce_protocol::developer_session::ThreadRevertResponse::export_all_to(dir)
        .expect("export developer-session thread revert graph");
    agiworkforce_protocol::developer_session::ThreadDeleteParams::export_all_to(dir)
        .expect("export developer-session thread delete params graph");
    agiworkforce_protocol::developer_session::ThreadDeleteResponse::export_all_to(dir)
        .expect("export developer-session thread delete graph");
}
