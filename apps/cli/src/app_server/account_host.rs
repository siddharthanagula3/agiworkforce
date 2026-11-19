use super::account_service::AccountService;
use agiworkforce_app_server::{
    DeveloperConnectionTrust, DeveloperSessionHost, DeveloperSessionHostError,
};
use agiworkforce_protocol::developer_session::{
    AccountLoginResponse, AccountLoginWaitParams, AccountLoginWaitResponse, AccountStatusParams,
    AccountStatusResponse, AccountTokenResponse, AppServerCapabilities, AppServerClientInfo,
    AppServerNotification, ApprovalResponseParams, LocalModelListResponse, ModelListParams,
    ThreadForkParams, ThreadIdParams, ThreadListParams, ThreadListResponse, ThreadReadResponse,
    ThreadStartParams, ThreadSummary, TurnInterruptParams, TurnStartParams, TurnSteerParams,
    TurnSummary,
};
use async_trait::async_trait;
use std::sync::Arc;
use tokio::sync::broadcast;

pub struct CliAccountHost {
    accounts: Arc<AccountService>,
    turns: Arc<super::cloud_turns::CloudTurns>,
    uploads: super::account_uploads::AccountUploads,
    downloads: super::project_downloads::ProjectDownloads,
    notifications: broadcast::Sender<AppServerNotification>,
}

impl CliAccountHost {
    pub fn new() -> Self {
        Self {
            accounts: Arc::new(AccountService::new()),
            turns: Arc::new(super::cloud_turns::CloudTurns::default()),
            uploads: Default::default(),
            downloads: Default::default(),
            notifications: broadcast::channel(1).0,
        }
    }

    pub fn capabilities(&self) -> AppServerCapabilities {
        AppServerCapabilities {
            account: true,
            account_login_cancel: true,
            cloud_conversation_update: true,
            cloud_drafts: true,
            cloud_projects: true,
            cloud_project_files: true,
            cloud_project_uploads: true,
            cloud_uploads: true,
            cloud_attachment_recovery: super::attachment_recovery::supported(),
            cloud_project_downloads: true,
            cloud_project_file_reindex: true,
            cloud_workspaces: true,
            cloud_models: true,
            cloud_history: true,
            cloud_history_tail: true,
            cloud_turns: true,
            cloud_turn_resume: true,
            cloud_work: true,
            cloud_work_start: true,
            ..Default::default()
        }
    }
}

impl Default for CliAccountHost {
    fn default() -> Self {
        Self::new()
    }
}

fn no_workspace() -> DeveloperSessionHostError {
    DeveloperSessionHostError::unavailable("This account connection has no coding workspace. Open a folder through the desktop's consent flow to use local coding tools.")
}

#[async_trait]
impl DeveloperSessionHost for CliAccountHost {
    async fn cloud_work_plan_update(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudWorkPlanUpdateParams,
    ) -> Result<agiworkforce_protocol::account_cloud::CloudWorkPlanReview, DeveloperSessionHostError>
    {
        self.accounts.run(self.turns.update_plan(params)).await
    }
    async fn cloud_run_list(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudRunListParams,
    ) -> Result<agiworkforce_protocol::account_cloud::CloudRunListResponse, DeveloperSessionHostError>
    {
        self.accounts.run(super::cloud_turns::list(params)).await
    }
    async fn cloud_run_attach(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudRunAttachParams,
        client: Option<&AppServerClientInfo>,
    ) -> Result<
        agiworkforce_protocol::account_cloud::CloudRunAttachResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(
                self.turns
                    .attach(params, super::account_service::device_surface(client)),
            )
            .await
    }
    async fn cloud_turn_detach(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudTurnIdParams,
    ) -> Result<(), DeveloperSessionHostError> {
        self.accounts.run(self.turns.detach(params)).await
    }
    async fn cloud_project_download_prepare(
        &self,
        params: agiworkforce_protocol::project_files::CloudProjectDownloadPrepareParams,
    ) -> Result<
        agiworkforce_protocol::project_files::CloudProjectDownloadSnapshot,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(async { self.downloads.prepare(params).await })
            .await
    }
    async fn cloud_project_download_start(
        &self,
        params: agiworkforce_protocol::project_files::CloudProjectDownloadId,
    ) -> Result<
        agiworkforce_protocol::project_files::CloudProjectDownloadSnapshot,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(async { self.downloads.start(params).await })
            .await
    }
    async fn cloud_project_download_read(
        &self,
        params: agiworkforce_protocol::project_files::CloudProjectDownloadId,
    ) -> Result<
        agiworkforce_protocol::project_files::CloudProjectDownloadSnapshot,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(async { self.downloads.read(params).await })
            .await
    }
    async fn cloud_project_download_cancel(
        &self,
        params: agiworkforce_protocol::project_files::CloudProjectDownloadId,
    ) -> Result<
        agiworkforce_protocol::project_files::CloudProjectDownloadSnapshot,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(async { self.downloads.cancel(params).await })
            .await
    }
    async fn cloud_project_download_release(
        &self,
        params: agiworkforce_protocol::project_files::CloudProjectDownloadId,
    ) -> Result<
        agiworkforce_protocol::developer_session::AcknowledgedResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(async {
                self.downloads.release(params).await?;
                Ok(
                    agiworkforce_protocol::developer_session::AcknowledgedResponse {
                        acknowledged: true,
                    },
                )
            })
            .await
    }
    async fn cloud_attachment_recovery_read(
        &self,
        params: agiworkforce_protocol::cloud_uploads::CloudChatTarget,
    ) -> Result<
        agiworkforce_protocol::attachment_recovery::AttachmentRecoveryReadResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(super::attachment_recovery::read(params))
            .await
    }
    async fn cloud_attachment_recovery_list(
        &self,
        params: agiworkforce_protocol::attachment_recovery::AttachmentRecoveryListParams,
    ) -> Result<
        agiworkforce_protocol::attachment_recovery::AttachmentRecoveryListResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(super::attachment_recovery::list(params))
            .await
    }
    async fn cloud_attachment_recovery_change(
        &self,
        params: agiworkforce_protocol::attachment_recovery::AttachmentRecoveryChangeParams,
    ) -> Result<
        agiworkforce_protocol::attachment_recovery::AttachmentRecoveryChangeResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(super::attachment_recovery::change(params))
            .await
    }
    async fn cloud_upload_prepare(
        &self,
        params: agiworkforce_protocol::cloud_uploads::CloudUploadPrepareParams,
        client: Option<&AppServerClientInfo>,
    ) -> Result<agiworkforce_protocol::cloud_uploads::CloudUploadSnapshot, DeveloperSessionHostError>
    {
        self.accounts
            .run(
                self.uploads
                    .prepare(params, super::account_service::device_surface(client)),
            )
            .await
    }
    async fn cloud_upload_start(
        &self,
        params: agiworkforce_protocol::cloud_uploads::CloudUploadId,
    ) -> Result<agiworkforce_protocol::cloud_uploads::CloudUploadSnapshot, DeveloperSessionHostError>
    {
        self.accounts.run(self.uploads.start(params)).await
    }
    async fn cloud_upload_read(
        &self,
        params: agiworkforce_protocol::cloud_uploads::CloudUploadId,
    ) -> Result<agiworkforce_protocol::cloud_uploads::CloudUploadSnapshot, DeveloperSessionHostError>
    {
        self.accounts.run(self.uploads.read(params)).await
    }
    async fn cloud_upload_cancel(
        &self,
        params: agiworkforce_protocol::cloud_uploads::CloudUploadId,
    ) -> Result<agiworkforce_protocol::cloud_uploads::CloudUploadSnapshot, DeveloperSessionHostError>
    {
        self.accounts.run(self.uploads.cancel(params)).await
    }
    async fn cloud_upload_release(
        &self,
        params: agiworkforce_protocol::cloud_uploads::CloudUploadId,
    ) -> Result<
        agiworkforce_protocol::developer_session::AcknowledgedResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(async {
                self.uploads.release(params).await?;
                Ok(
                    agiworkforce_protocol::developer_session::AcknowledgedResponse {
                        acknowledged: true,
                    },
                )
            })
            .await
    }
    async fn cloud_project_upload_prepare(
        &self,
        params: agiworkforce_protocol::project_files::CloudProjectUploadPrepareParams,
    ) -> Result<
        agiworkforce_protocol::project_files::CloudProjectUploadSnapshot,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(async {
                self.uploads
                    .prepare(super::project_uploads::prepare(params), "desktop")
                    .await
                    .and_then(super::project_uploads::snapshot)
            })
            .await
    }
    async fn cloud_project_upload_start(
        &self,
        params: agiworkforce_protocol::project_files::CloudProjectUploadId,
    ) -> Result<
        agiworkforce_protocol::project_files::CloudProjectUploadSnapshot,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(async {
                self.uploads
                    .start(super::project_uploads::id(params))
                    .await
                    .and_then(super::project_uploads::snapshot)
            })
            .await
    }
    async fn cloud_project_upload_read(
        &self,
        params: agiworkforce_protocol::project_files::CloudProjectUploadId,
    ) -> Result<
        agiworkforce_protocol::project_files::CloudProjectUploadSnapshot,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(async {
                self.uploads
                    .read(super::project_uploads::id(params))
                    .await
                    .and_then(super::project_uploads::snapshot)
            })
            .await
    }
    async fn cloud_project_upload_cancel(
        &self,
        params: agiworkforce_protocol::project_files::CloudProjectUploadId,
    ) -> Result<
        agiworkforce_protocol::project_files::CloudProjectUploadSnapshot,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(async {
                self.uploads
                    .cancel(super::project_uploads::id(params))
                    .await
                    .and_then(super::project_uploads::snapshot)
            })
            .await
    }
    async fn cloud_project_upload_release(
        &self,
        params: agiworkforce_protocol::project_files::CloudProjectUploadId,
    ) -> Result<
        agiworkforce_protocol::developer_session::AcknowledgedResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(async {
                self.uploads
                    .release(super::project_uploads::id(params))
                    .await?;
                Ok(
                    agiworkforce_protocol::developer_session::AcknowledgedResponse {
                        acknowledged: true,
                    },
                )
            })
            .await
    }
    async fn cloud_project_file_reindex(
        &self,
        params: agiworkforce_protocol::project_files::CloudProjectFileVersion,
    ) -> Result<
        agiworkforce_protocol::project_files::CloudProjectFileReindexResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(super::cloud_projects::reindex(params))
            .await
    }
    async fn cloud_project_files_list(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudProjectTarget,
    ) -> Result<
        agiworkforce_protocol::project_files::CloudProjectFilesResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(super::cloud_projects::files(params))
            .await
    }
    async fn cloud_project_file_preview(
        &self,
        params: agiworkforce_protocol::project_files::CloudProjectFileTarget,
    ) -> Result<
        agiworkforce_protocol::project_files::CloudProjectFilePreview,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(super::cloud_projects::preview(params))
            .await
    }
    async fn cloud_project_list(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudProjectListParams,
    ) -> Result<
        agiworkforce_protocol::account_cloud::CloudProjectListResponse,
        DeveloperSessionHostError,
    > {
        self.accounts.run(super::cloud_projects::list(params)).await
    }
    async fn cloud_project_read(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudProjectTarget,
    ) -> Result<agiworkforce_protocol::account_cloud::CloudProjectResponse, DeveloperSessionHostError>
    {
        self.accounts.run(super::cloud_projects::read(params)).await
    }
    async fn cloud_project_create(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudProjectCreateParams,
    ) -> Result<agiworkforce_protocol::account_cloud::CloudProjectResponse, DeveloperSessionHostError>
    {
        self.accounts
            .run(super::cloud_projects::create(params))
            .await
    }
    async fn cloud_project_update(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudProjectUpdateParams,
    ) -> Result<agiworkforce_protocol::account_cloud::CloudProjectResponse, DeveloperSessionHostError>
    {
        self.accounts
            .run(super::cloud_projects::update(params))
            .await
    }
    async fn cloud_draft_save(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudDraftSaveParams,
    ) -> Result<
        agiworkforce_protocol::account_cloud::CloudDraftSaveResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(super::account_cloud::save_draft(params))
            .await
    }
    async fn cloud_conversation_update(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudConversationUpdateParams,
    ) -> Result<
        agiworkforce_protocol::account_cloud::CloudConversationUpdateResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(super::account_cloud::update(params))
            .await
    }
    async fn cloud_workspaces_list(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudWorkspacesListParams,
    ) -> Result<
        agiworkforce_protocol::account_cloud::CloudWorkspacesListResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(super::cloud_workspaces::list(params))
            .await
    }
    async fn cloud_workspace_select(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudWorkspaceSelectParams,
    ) -> Result<
        agiworkforce_protocol::account_cloud::CloudWorkspaceSelectResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(super::cloud_workspaces::select(params))
            .await
    }
    async fn cloud_model_list(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudModelListParams,
    ) -> Result<
        agiworkforce_protocol::account_cloud::CloudModelListResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(super::account_cloud::models(params))
            .await
    }
    async fn cloud_history_list(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudHistoryListParams,
    ) -> Result<
        agiworkforce_protocol::account_cloud::CloudHistoryListResponse,
        DeveloperSessionHostError,
    > {
        self.accounts.run(super::account_cloud::list(params)).await
    }
    async fn cloud_history_read(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudHistoryReadParams,
    ) -> Result<
        agiworkforce_protocol::account_cloud::CloudHistoryReadResponse,
        DeveloperSessionHostError,
    > {
        self.accounts.run(super::account_cloud::read(params)).await
    }
    async fn cloud_conversation_create(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudConversationCreateParams,
    ) -> Result<
        agiworkforce_protocol::account_cloud::CloudConversationCreateResponse,
        DeveloperSessionHostError,
    > {
        self.accounts
            .run(async {
                uuid::Uuid::parse_str(&params.id).map_err(|_| {
                    DeveloperSessionHostError::invalid_request("Conversation IDs must be UUIDs")
                })?;
                let (client, context, scope) = super::account_cloud::connect(Some(&params.scope))?;
                let client = client.with_workspace(params.workspace.as_ref()).map_err(super::account_cloud::failure)?;
                if !context.is_current() {
                    return Err(super::account_cloud::changed());
                }
                let project = if let Some(id) = &params.project_id {
                    let workspace = params.workspace.clone().ok_or_else(|| DeveloperSessionHostError::invalid_request("Choose a workspace before starting a project conversation"))?;
                    let project = crate::cloud::projects::api::read(&client, &agiworkforce_protocol::account_cloud::CloudProjectTarget {
                        scope: params.scope.clone(), workspace, project_id: id.clone(),
                    }).await.map_err(super::account_cloud::failure)?.project;
                    if !project.can_start_chat { return Err(DeveloperSessionHostError::invalid_request("A new native conversation is unavailable for this project's access or saved tool settings. Its existing conversations remain available.")); }
                    Some(project)
                } else { None };
                let model = project.as_ref().and_then(|project| project.default_model_id.as_deref());
                if let Some(id) = model.filter(|id| !agiworkforce_model_registry::is_auto_routing_selection(id)) {
                    let catalogue = super::account_cloud::models(agiworkforce_protocol::account_cloud::CloudModelListParams { scope: params.scope.clone() }).await?;
                    if !catalogue.models.iter().any(|model| model.id == id && model.selectable()) {
                        return Err(DeveloperSessionHostError::invalid_request("The project's saved default model is unavailable. Choose an available project default before starting a conversation."));
                    }
                }
                if !context.is_current() { return Err(super::account_cloud::changed()); }
                let conversation =
                    crate::cloud::chat::create_history_conversation(&client, &params, model)
                        .await
                        .map_err(super::account_cloud::failure)?;
                if !context.is_current() {
                    return Err(super::account_cloud::changed());
                }
                if params.workspace.as_ref().is_some_and(|workspace| agiworkforce_protocol::account_cloud::CloudConversationWorkspace::from_organization(conversation.organization_id.as_deref()) != *workspace) { return Err(DeveloperSessionHostError::unavailable("The account created the conversation in a different workspace; reload history before continuing.")); }
                Ok(
                    agiworkforce_protocol::account_cloud::CloudConversationCreateResponse {
                        scope,
                        conversation,
                    },
                )
            })
            .await
    }
    async fn cloud_turn_start(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudTurnStartParams,
        client: Option<&AppServerClientInfo>,
    ) -> Result<agiworkforce_protocol::account_cloud::CloudTurnSnapshot, DeveloperSessionHostError>
    {
        self.accounts
            .run(
                self.turns
                    .start(params, super::account_service::device_surface(client)),
            )
            .await
    }
    async fn cloud_turn_read(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudTurnIdParams,
    ) -> Result<agiworkforce_protocol::account_cloud::CloudTurnSnapshot, DeveloperSessionHostError>
    {
        self.accounts.run(self.turns.read(params)).await
    }
    async fn cloud_turn_stop(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudTurnIdParams,
    ) -> Result<agiworkforce_protocol::account_cloud::CloudTurnSnapshot, DeveloperSessionHostError>
    {
        self.accounts.run(self.turns.stop(params)).await
    }
    async fn cloud_turn_resume(
        &self,
        params: agiworkforce_protocol::account_cloud::CloudTurnResumeParams,
    ) -> Result<agiworkforce_protocol::account_cloud::CloudTurnSnapshot, DeveloperSessionHostError>
    {
        self.accounts.run(self.turns.resume(params)).await
    }
    fn server_version(&self) -> &'static str {
        env!("CARGO_PKG_VERSION")
    }

    async fn start_thread(
        &self,
        _: ThreadStartParams,
        _: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        Err(no_workspace())
    }
    async fn list_threads(
        &self,
        _: ThreadListParams,
    ) -> Result<ThreadListResponse, DeveloperSessionHostError> {
        Err(no_workspace())
    }
    async fn list_local_models(
        &self,
        _: ModelListParams,
        _: DeveloperConnectionTrust,
    ) -> Result<LocalModelListResponse, DeveloperSessionHostError> {
        Err(no_workspace())
    }
    async fn resume_thread(
        &self,
        _: ThreadIdParams,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        Err(no_workspace())
    }
    async fn read_thread(
        &self,
        _: ThreadIdParams,
    ) -> Result<ThreadReadResponse, DeveloperSessionHostError> {
        Err(no_workspace())
    }
    async fn fork_thread(
        &self,
        _: ThreadForkParams,
        _: AppServerClientInfo,
    ) -> Result<ThreadSummary, DeveloperSessionHostError> {
        Err(no_workspace())
    }
    async fn archive_thread(&self, _: ThreadIdParams) -> Result<(), DeveloperSessionHostError> {
        Err(no_workspace())
    }
    async fn start_turn(
        &self,
        _: TurnStartParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError> {
        Err(no_workspace())
    }
    async fn steer_turn(
        &self,
        _: TurnSteerParams,
    ) -> Result<TurnSummary, DeveloperSessionHostError> {
        Err(no_workspace())
    }
    async fn interrupt_turn(
        &self,
        _: TurnInterruptParams,
    ) -> Result<(), DeveloperSessionHostError> {
        Err(no_workspace())
    }
    async fn respond_to_approval(
        &self,
        _: ApprovalResponseParams,
    ) -> Result<(), DeveloperSessionHostError> {
        Err(no_workspace())
    }

    async fn account_status(
        &self,
        params: AccountStatusParams,
    ) -> Result<AccountStatusResponse, DeveloperSessionHostError> {
        self.accounts.account_status(params).await
    }
    async fn account_login(&self) -> Result<AccountLoginResponse, DeveloperSessionHostError> {
        self.accounts.account_login().await
    }
    async fn account_login_for_client(
        &self,
        client: Option<&AppServerClientInfo>,
    ) -> Result<AccountLoginResponse, DeveloperSessionHostError> {
        self.accounts.account_login_for_client(client).await
    }
    async fn account_login_wait(
        &self,
        params: AccountLoginWaitParams,
    ) -> Result<AccountLoginWaitResponse, DeveloperSessionHostError> {
        self.accounts.account_login_wait(params).await
    }
    async fn account_login_cancel(
        &self,
        params: AccountLoginWaitParams,
    ) -> Result<(), DeveloperSessionHostError> {
        self.accounts.account_login_cancel(params).await
    }
    async fn account_logout(&self) -> Result<(), DeveloperSessionHostError> {
        let _pause = self.downloads.pause().await;
        self.uploads.logout(&self.accounts).await
    }
    async fn account_token(&self) -> Result<AccountTokenResponse, DeveloperSessionHostError> {
        self.accounts.account_token().await
    }
    async fn shutdown(&self) -> Result<(), DeveloperSessionHostError> {
        self.downloads.shutdown().await;
        self.uploads.shutdown().await;
        self.turns.shutdown().await;
        self.accounts.shutdown().await;
        Ok(())
    }
    fn subscribe(&self) -> broadcast::Receiver<AppServerNotification> {
        self.notifications.subscribe()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agiworkforce_app_server::{DeveloperConnectionTrust, DeveloperSessionProcessor};
    use agiworkforce_protocol::developer_session::{
        method, AppServerRequest, InitializeParams, DEVELOPER_SESSION_PROTOCOL_VERSION,
    };

    #[tokio::test]
    async fn the_account_host_advertises_and_enforces_its_scope_for_an_owner() {
        let host = Arc::new(CliAccountHost::new());
        let caps = host.capabilities();
        let advertised = serde_json::to_value(&caps).unwrap();
        for (name, value) in advertised.as_object().unwrap() {
            assert_eq!(
                value.as_bool().unwrap(),
                name == "cloudAttachmentRecovery" && cfg!(unix)
                    || matches!(
                        name.as_str(),
                        "account"
                            | "accountLoginCancel"
                            | "cloudHistory"
                            | "cloudHistoryTail"
                            | "cloudTurns"
                            | "cloudTurnResume"
                            | "cloudWork"
                            | "cloudWorkStart"
                            | "cloudWorkspaces"
                            | "cloudModels"
                            | "cloudConversationUpdate"
                            | "cloudDrafts"
                            | "cloudProjects"
                            | "cloudProjectFiles"
                            | "cloudProjectUploads"
                            | "cloudUploads"
                            | "cloudProjectDownloads"
                            | "cloudProjectFileReindex"
                    ),
                "{name}"
            );
        }
        let mut processor = DeveloperSessionProcessor::new_with_trust(
            host,
            caps,
            DeveloperConnectionTrust::LoopbackOwner,
        );
        let initialized = processor
            .process(
                AppServerRequest::new(
                    serde_json::json!(0),
                    method::INITIALIZE,
                    InitializeParams {
                        client_info: AppServerClientInfo {
                            name: "desktop-account-test".into(),
                            title: "Account test".into(),
                            version: "0.0.1".into(),
                        },
                        experimental_api: false,
                        user_input: false,
                        protocol_version: Some(DEVELOPER_SESSION_PROTOCOL_VERSION),
                    },
                )
                .unwrap(),
            )
            .await;
        assert!(initialized.error.is_none());
        let requests = [
            (method::THREAD_LIST, serde_json::json!({})),
            (method::THREAD_START, serde_json::json!({})),
            (method::MODEL_LIST, serde_json::json!({})),
            (
                method::TURN_START,
                serde_json::json!({"threadId":"fixture", "input":[{"type":"text", "text":"A valid message"}]}),
            ),
            (
                method::APPROVAL_RESPOND,
                serde_json::json!({"threadId":"fixture", "turnId":"fixture", "requestId":"fixture", "decision":"approved"}),
            ),
        ];
        for (index, (method, params)) in requests.into_iter().enumerate() {
            let response = processor
                .process(
                    AppServerRequest::new(serde_json::json!(index + 1), method, params).unwrap(),
                )
                .await;
            let error = response.error.unwrap();
            assert_eq!(
                error.code,
                DeveloperSessionHostError::unavailable("").code(),
                "{method}"
            );
            assert!(
                error.message.contains("no coding workspace"),
                "{method}: {}",
                error.message
            );
        }
    }
}
