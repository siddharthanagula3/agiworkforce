#![deny(unsafe_code)]

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use agiworkforce_app_server::{BackgroundDeveloperSessionClient, DeveloperSessionClientEvent};

use self::code_worktrees::CodeWorktreeMutation;
use crate::account::{AccountOperation, AccountPanel, DeviceLogin};
use crate::cloud_history::CloudHistory;
use crate::config::{NativeContracts, Palette, Settings};
use crate::conversation::Conversation;
use crate::rich_text;
use crate::runtime::{consent_timestamp_ms, RuntimeSession};
use agiworkforce_protocol::account_cloud::CloudTurnResumeAction;
use agiworkforce_protocol::developer_session::{
    method, AppServerCapabilities, AppServerNotification, HostModelSummary, ThreadListResponse,
    ThreadSummary,
};
use anyhow::{Context as _, Result};
use gpui::{
    actions, div, prelude::*, px, rgb, size, App, Bounds, Context, FocusHandle, KeyBinding,
    PathPromptOptions, PromptLevel, SharedString, Window, WindowAppearance, WindowBounds,
    WindowOptions,
};
use gpui_component::input::{EditorState, Input, InputEvent, InputState, Textarea, TextareaState};
use tokio::sync::Mutex;

mod account;
mod attachment_recovery;
mod changes;
mod chat_upload;
mod cloud;
mod cloud_controls;
mod cloud_models;
mod cloud_sends;
mod code_settings;
mod code_worktrees;
mod conversation_management;
mod conversations;
mod drafts;
mod file_recovery;
mod files;
mod frame;
mod project_download;
mod project_files;
mod project_upload;
mod projects;
mod recovery_browser;
mod terminal;
mod work;
mod work_plans;
mod workspaces;
mod worktree_apply;

actions!(
    desktop,
    [
        Quit,
        CloseWindow,
        OpenFolder,
        Refresh,
        SaveFile,
        OpenTerminal
    ]
);

#[derive(Clone, Copy)]
enum HistoryReadIntent {
    Latest,
    Older,
    Refresh,
}

#[derive(Clone)]
enum UiAction {
    ToggleNavigation,
    CloseNavigation,
    Code,
    Terminal,
    NewTerminal,
    BackFromTerminal,
    RefreshTerminals,
    SelectTerminal(String),
    CloseTerminal(agiworkforce_protocol::workspace_terminal::TerminalIdParams),
    ScrollTerminal(bool),
    FitTerminal,
    CopyTerminal,
    PasteTerminal,
    ConfirmTerminalPaste,
    CancelTerminalPaste,
    Files,
    BackFromFiles,
    BrowseFiles(String, Option<String>),
    ReadFile(String),
    OpenFilePath,
    CodeSettings,
    CodeWorktrees,
    CloseCodeWorktrees,
    CreateWorktree(agiworkforce_protocol::developer_session::WorktreeStartPoint),
    PinWorktree(String, bool),
    ArchiveWorktree(String),
    OpenWorktree(String),
    OpenWorktreeRepository(String),
    ReviewWorktreeApply(String),
    CommitWorktreeApply,
    SelectWorktreeApplyFile(String),
    BackFromWorktreeApply,
    ShowWorktreeApply,
    CopyWorktreeApplyResult,
    ReadWorktreeApplyResult,
    CloseCodeSettings,
    InstructionScope(agiworkforce_protocol::instruction_settings::InstructionSettingsScope),
    ReloadCodeSettings,
    SaveCodeInstructions,
    UseStoredCodeInstructions,
    KeepCodeInstructionEdits,
    CodeInstructionSources,
    SaveFile,
    CloseFile,
    ReloadFileRecovery,
    ResolveFileRecovery(bool),
    CopyFileRecovery,
    RecoveredFiles,
    BackFromRecoveredFiles,
    RefreshRecoveredFiles,
    ReadRecoveredFile(String),
    CopyRecoveredText,
    SaveRecoveryCopy,
    DiscardRecoveryCopy,
    OpenRecoveredOriginal(String),
    Changes,
    CloseChanges,
    ReviewTurn(String),
    ReviewFile(String),
    ChangeSection(String, Option<u32>, bool),
    OpenFolder,
    Refresh,
    NextPage,
    SearchSessions,
    ClearSessionSearch,
    ReadSession(String),
    NewSession,
    CreateSession(usize),
    CancelModelPicker,
    Send,
    Stop,
    Approval(String, bool),
    Account,
    ReconnectAccount,
    CloseAccount,
    RefreshAccount,
    SignIn,
    OpenSignIn,
    CopySignInCode,
    CancelSignIn,
    SignOut,
    CloudHistory,
    ScopedCloudHistory,
    ProjectFile(crate::project_file_controls::ProjectFileAction),
    ChooseProjectUpload(String),
    ChooseChatUpload,
    AttachmentRecovery(attachment_recovery::RecoveryAction),
    ChatUpload(uuid::Uuid, chat_upload::ChatUploadAction),
    ProjectUpload(crate::project_upload_controls::UploadAction),
    ProjectDownload(crate::project_download_controls::DownloadAction),
    Projects,
    RefreshProjects,
    MoreProjects,
    ReadProject(String),
    ReviewProject,
    EditProject(bool),
    CancelProjectEdit(uuid::Uuid),
    SaveProject(uuid::Uuid),
    ArchiveProject(agiworkforce_protocol::account_cloud::CloudProjectUpdateParams),
    ProjectChats(String, Option<bool>),
    ReloadCloudWorkspaces,

    ToggleArchivedCloud,
    RenameCloud(agiworkforce_protocol::account_cloud::CloudConversationUpdateParams),
    SaveCloudTitle(uuid::Uuid),
    CancelCloudTitle(uuid::Uuid),
    UpdateCloudConversation(agiworkforce_protocol::account_cloud::CloudConversationUpdateParams),
    ReloadCloudMetadata,

    SearchCloud,
    CloudModels,
    SaveCloudDraft,
    CopySavedCloudDraft(agiworkforce_protocol::account_cloud::CloudConversationDraft),
    ResolveCloudDraft(
        agiworkforce_protocol::account_cloud::CloudConversationDraft,
        bool,
    ),
    MoreCloudHistory,
    ReadCloud(String),
    MoreCloudMessages,
    NewCloud,
    NewWork,
    RunWorkPlan(agiworkforce_protocol::account_cloud::CloudWorkPlanReview),
    UpdateWorkPlan(
        agiworkforce_protocol::account_cloud::CloudWorkPlanReview,
        bool,
    ),
    EditRejectedMessage,
    SendCloud,
    StopCloud(agiworkforce_protocol::account_cloud::CloudTurnIdParams),
    ResumeCloud(agiworkforce_protocol::account_cloud::CloudTurnResumeParams),
    RefreshCloudTurn,
    Work,
    MoreWork,
    FilterWork(Option<agiworkforce_protocol::task_state::AgentTaskState>),
    OpenWork(String),
    LeaveWork,
}

struct Desktop {
    navigation_open: bool,
    navigation_menu_focus: FocusHandle,
    navigation_close_focus: FocusHandle,
    history_viewport: crate::viewport::HistoryViewport,
    contracts: Arc<NativeContracts>,
    settings: Settings,
    code_settings: crate::code_settings::CodeSettings,
    code_worktrees: crate::code_worktrees::CodeWorktrees,
    instruction_buffer: gpui::Entity<EditorState>,
    executor: Arc<tokio::runtime::Runtime>,
    runtime: Arc<Mutex<Option<RuntimeSession>>>,
    account_runtime: Arc<Mutex<Option<RuntimeSession>>>,
    binary: PathBuf,
    workspace: Option<PathBuf>,
    threads: Vec<ThreadSummary>,
    code_query: gpui::Entity<InputState>,
    code_search: crate::code_search::CodeSearch,
    conversation: Option<Conversation>,
    changes: crate::changes::Changes,
    editor: crate::editor::FileEditor,
    editor_buffer: gpui::Entity<EditorState>,
    editor_path: gpui::Entity<InputState>,
    recovery_destination: gpui::Entity<InputState>,
    file_recovery_task: Option<gpui::Task<()>>,
    terminal: crate::terminal::TerminalPanel,
    terminal_view: Option<gpui::Entity<crate::terminal_view::TerminalView>>,
    terminal_poll_task: Option<gpui::Task<()>>,
    terminal_paste: gpui::Entity<TextareaState>,
    pending_terminal_paste: Option<(
        agiworkforce_protocol::workspace_terminal::TerminalIdParams,
        String,
    )>,
    composer: gpui::Entity<TextareaState>,
    drafts: HashMap<String, String>,
    models: Option<Vec<HostModelSummary>>,
    submitting: bool,
    stopping: bool,
    approval_pending: Option<String>,
    pending_events: Vec<AppServerNotification>,
    closing: bool,
    next_cursor: Option<String>,
    code_search_reset: bool,
    loading: bool,
    error: Option<String>,
    focus: FocusHandle,
    connection_client: Option<BackgroundDeveloperSessionClient>,
    event_task: Option<gpui::Task<()>>,
    generation: u64,
    capabilities: Option<AppServerCapabilities>,
    account: AccountPanel,
    account_generation: u64,
    account_capabilities: Option<AppServerCapabilities>,
    account_connection_client: Option<BackgroundDeveloperSessionClient>,
    account_event_task: Option<gpui::Task<()>>,
    cloud: CloudHistory,
    cloud_query: gpui::Entity<InputState>,
    cloud_model_select: Option<cloud_models::BoundModelSelect>,
    cloud_workspace_select: Option<workspaces::BoundWorkspaceSelect>,
    cloud_composer: gpui::Entity<TextareaState>,
    cloud_title: gpui::Entity<InputState>,
    project_name: gpui::Entity<InputState>,
    project_description: gpui::Entity<TextareaState>,
    project_instructions: gpui::Entity<TextareaState>,
    project_upload: crate::project_upload::ProjectUpload,
    upload_poll_task: Option<gpui::Task<()>>,
    chat_upload: crate::chat_upload::ChatUpload,
    attachment_recovery: crate::attachment_recovery::AttachmentRecovery,
    chat_upload_poll_task: Option<gpui::Task<()>>,
    project_download: crate::project_download::ProjectDownload,
    download_poll_task: Option<gpui::Task<()>>,
    cloud_poll_task: Option<gpui::Task<()>>,
    cloud_draft_task: Option<gpui::Task<()>>,
}

impl Desktop {
    fn can_change_code_folder(&mut self, window: &mut Window, cx: &mut Context<Self>) -> bool {
        if self.code_worktrees.mutating {
            self.open_code_worktrees(window, cx);
            self.code_worktrees.notice = Some(
                "Wait for the worktree change to finish before changing coding folders.".into(),
            );
            cx.notify();
            return false;
        }
        if self.code_settings.writing
            || self
                .code_settings
                .dirty(self.instruction_buffer.read(cx).value().as_str())
        {
            self.open_code_settings(window, cx);
            self.code_settings.notice =
                Some("Save or discard instruction edits before changing coding folders.".into());
            cx.notify();
            return false;
        }
        if self.editor.recovery_browser.mutating {
            self.editor.visible = true;
            self.cloud.visible = false;
            self.account.visible = false;
            self.editor.recovery_browser.error =
                Some("Wait for recovery completion before changing coding folders.".into());
            cx.notify();
            return false;
        }
        if self
            .editor
            .dirty(self.editor_buffer.read(cx).value().as_str())
            || self.editor.recovery.operation.is_some()
        {
            self.editor.visible = true;
            self.terminal.visible = false;
            self.terminal.epoch = uuid::Uuid::new_v4();
            self.terminal_poll_task = None;
            self.cloud.visible = false;
            self.account.visible = false;
            self.editor.error =
                Some("Save or close the edited file before changing coding folders.".into());
            cx.notify();
            return false;
        }
        if self.loading
            || self.submitting
            || (self.code_busy()
                && self
                    .connection_client
                    .as_ref()
                    .is_some_and(BackgroundDeveloperSessionClient::is_connected))
        {
            self.fail(
                anyhow::anyhow!("Stop the current turn before changing folders."),
                cx,
            );
            return false;
        }
        true
    }

    fn open_folder(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.can_change_code_folder(window, cx) {
            return;
        }
        let paths = cx.prompt_for_paths(PathPromptOptions {
            files: false,
            directories: true,
            multiple: false,
            prompt: Some("Choose a folder for coding sessions".into()),
        });
        cx.spawn_in(window, async move |view, cx| {
            let result: Result<()> = async {
                let Some(paths) = paths.await?? else { return Ok(()); };
                let Some(path) = paths.into_iter().next() else { return Ok(()); };
                let detail = format!(
                    "The current runtime and its terminal jobs, if any, will stop. The CLI runtime will start in {}. Folder hooks and MCP configuration may run. Existing tool approvals and sandbox rules remain in force.",
                    path.display()
                );
                let answer = cx.update(|window, cx| window.prompt(
                    PromptLevel::Warning, "Allow the coding runtime in this folder?",
                    Some(&detail), &["Allow", "Cancel"], cx,
                ))?;
                if answer.await? == 0 {
                    let consent_at_ms = consent_timestamp_ms()?;
                    view.update_in(cx, |view, window, cx| { if view.can_change_code_folder(window, cx) { view.save_draft(cx); view.connect(path, consent_at_ms, cx); } })?;
                }
                Ok(())
            }.await;
            let _ = cx.update(|window, cx| {
                window.refresh();
                view.update(cx, |view, cx| {
                    if let Err(error) = result { view.fail(error, cx); }
                    cx.notify();
                })
            });
        }).detach();
    }

    fn connect(&mut self, workspace: PathBuf, consent_at_ms: i64, cx: &mut Context<Self>) {
        if self.loading {
            return;
        }
        let Some(generation) = self.generation.checked_add(1) else {
            self.fail(
                anyhow::anyhow!("The connection generation is exhausted"),
                cx,
            );
            return;
        };
        self.generation = generation;
        self.connection_client = None;
        self.cloud.visible = false;
        self.account.visible = false;
        self.capabilities = None;
        self.loading = true;
        self.error = None;
        self.conversation = None;
        self.changes = crate::changes::Changes::default();
        self.editor = crate::editor::FileEditor::default();
        self.code_settings = Default::default();
        self.code_worktrees = Default::default();
        self.file_recovery_task = None;
        self.terminal = crate::terminal::TerminalPanel::default();
        self.terminal_view = None;
        self.terminal_poll_task = None;
        self.pending_terminal_paste = None;
        self.models = None;
        self.threads.clear();
        self.code_search.reset();
        self.code_search_reset = true;
        self.next_cursor = None;
        self.workspace = Some(workspace.clone());
        let binary = self.binary.clone();
        let contracts = Arc::clone(&self.contracts);
        let settings = self.settings;
        let runtime = Arc::clone(&self.runtime);
        let task = self.executor.spawn(async move {
            let mut guard = runtime.lock().await;
            if let Some(previous) = guard.take() {
                previous.shutdown().await?;
            }
            let mut session =
                RuntimeSession::connect(&binary, &workspace, consent_at_ms, &contracts, settings)
                    .await?;
            let response = session.list_sessions(None).await?;
            let events = session
                .take_events()
                .context("The runtime event stream is unavailable")?;
            let client = session.client();
            let capabilities = session.capabilities().clone();
            *guard = Some(session);
            Ok::<_, anyhow::Error>((response, client, events, capabilities))
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("The runtime task stopped")
                .and_then(|result| result);
            let _ = view.update(cx, |view, cx| match result {
                Ok((response, client, events, capabilities)) => {
                    view.connection_client = Some(client);
                    view.capabilities = Some(capabilities);
                    view.finish_list(Ok(response), false, cx);
                    view.watch_events(events, generation, cx);
                }
                Err(error) => view.finish_list(Err(error), false, cx),
            });
        })
        .detach();
        cx.notify();
    }

    fn watch_events(
        &mut self,
        mut events: tokio::sync::mpsc::Receiver<DeveloperSessionClientEvent>,
        generation: u64,
        cx: &mut Context<Self>,
    ) {
        self.event_task = Some(cx.spawn(async move |view, cx| {
            while let Some(event) = events.recv().await {
                let applied = view.update(cx, |view, cx| {
                    if view.generation != generation { return false; }
                    match event {
                        DeveloperSessionClientEvent::Disconnected(reason) => {
                            view.fail(anyhow::anyhow!(reason), cx);
                            return false;
                        }
                        DeveloperSessionClientEvent::Notification(notification) => {
                            let result: Result<()> = (|| {
                                if notification.method == method::SERVER_WARNING {
                                        let code = notification.params.get("code").and_then(serde_json::Value::as_str)
                                            .context("The runtime warning had no code")?;
                                        anyhow::bail!("Runtime warning: {code}. Reopen the folder to recover its current state.");
                                }
                                if view.loading {
                                    anyhow::ensure!(view.pending_events.len() < view.settings.max_queued_notifications.get(), "Too many events arrived while opening the session. Reopen the folder to recover.");
                                    view.pending_events.push(notification);
                                } else if let Some(conversation) = &mut view.conversation {
                                    conversation.apply(notification)?;
                                    cx.notify();
                                }
                                Ok(())
                            })();
                            if let Err(error) = result {
                                if let Some(client) = &view.connection_client { client.disconnect(); }
                                view.fail(error, cx);
                                return false;
                            }
                        }
                    }
                    true
                });
                if !matches!(applied, Ok(true)) { return; }
            }
            let _ = view.update(cx, |view, cx| {
                if view.generation == generation {
                    view.fail(anyhow::anyhow!("The runtime event stream closed. Reopen the folder to reconnect."), cx);
                }
            });
        }));
    }

    fn load_sessions(&mut self, more: bool, cx: &mut Context<Self>) {
        if self.loading || self.code_busy() || self.workspace.is_none() {
            return;
        }
        self.loading = true;
        self.error = None;
        let cursor = if more { self.next_cursor.clone() } else { None };
        let runtime = Arc::clone(&self.runtime);
        let task = self.executor.spawn(async move {
            runtime
                .lock()
                .await
                .as_mut()
                .context("Open the folder again to reconnect the runtime")?
                .list_sessions(cursor)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("The runtime task stopped")
                .and_then(|result| result);
            let _ = view.update(cx, |view, cx| view.finish_list(result, more, cx));
        })
        .detach();
        cx.notify();
    }

    fn search_sessions(&mut self, cx: &mut Context<Self>) {
        if self.loading || self.code_busy() || self.workspace.is_none() {
            return;
        }
        let Some((generation, query)) = self.code_search.begin() else {
            cx.notify();
            return;
        };
        self.error = None;
        let runtime = Arc::clone(&self.runtime);
        let task = self.executor.spawn(async move {
            runtime
                .lock()
                .await
                .as_mut()
                .context("Open the folder again to reconnect the runtime")?
                .search_sessions(query)
                .await
        });
        cx.spawn(async move |view, cx| {
            let result = task
                .await
                .context("The runtime task stopped")
                .and_then(|result| result);
            let _ = view.update(cx, |view, cx| {
                match result {
                    Ok(response) => {
                        view.code_search.finish(generation, response);
                    }
                    Err(error) => {
                        if view.code_search.fail(generation) {
                            view.error = Some(format!("{error:#}"));
                        }
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    fn finish_list(
        &mut self,
        result: Result<ThreadListResponse>,
        more: bool,
        cx: &mut Context<Self>,
    ) {
        self.loading = false;
        match result {
            Ok(response) => {
                if !more {
                    self.threads.clear();
                }
                self.threads.extend(response.threads);
                self.next_cursor = response.next_cursor;
            }
            Err(error) => self.fail(error, cx),
        }
        cx.notify();
    }

    fn fail(&mut self, error: anyhow::Error, cx: &mut Context<Self>) {
        self.error = Some(format!("{error:#}"));
        self.loading = false;
        cx.notify();
    }

    fn dispatch(&mut self, action: UiAction, window: &mut Window, cx: &mut Context<Self>) {
        if matches!(
            action,
            UiAction::ToggleNavigation | UiAction::CloseNavigation
        ) {
            self.navigation_open =
                matches!(action, UiAction::ToggleNavigation) && !self.navigation_open;
            if self.navigation_open {
                self.navigation_close_focus.focus(window, cx);
            } else if crate::native_frame::compact(
                window.bounds().size.width.into(),
                &self.contracts,
            ) {
                self.navigation_menu_focus.focus(window, cx);
            } else {
                self.focus.focus(window, cx);
            }
            cx.notify();
            return;
        }
        if self.cloud.projects.edit.is_some()
            && !matches!(
                &action,
                UiAction::Projects
                    | UiAction::ProjectUpload(_)
                    | UiAction::ProjectDownload(_)
                    | UiAction::ReconnectAccount
                    | UiAction::RefreshProjects
                    | UiAction::ReviewProject
                    | UiAction::SaveProject(_)
                    | UiAction::CancelProjectEdit(_)
            )
        {
            let message = "Save or cancel the project edit before leaving it.".to_string();
            self.cloud.projects.error = Some(message.clone());
            if self.account.visible {
                self.account.notice = Some(message);
            }
            cx.notify();
            return;
        }
        if matches!(action, UiAction::Code) && self.surface() == frame::Surface::Code {
            self.navigation_open = false;
            self.focus.focus(window, cx);
            cx.notify();
            return;
        }
        if matches!(
            &action,
            UiAction::Account
                | UiAction::Code
                | UiAction::CloudHistory
                | UiAction::Projects
                | UiAction::Work
                | UiAction::ReadCloud(_)
                | UiAction::OpenWork(_)
                | UiAction::ReadSession(_)
                | UiAction::Files
                | UiAction::Terminal
                | UiAction::NewCloud
                | UiAction::NewWork
                | UiAction::NewSession
        ) {
            self.navigation_open = false;
        }
        if matches!(
            &action,
            UiAction::Files
                | UiAction::Code
                | UiAction::Account
                | UiAction::CloudHistory
                | UiAction::Projects
                | UiAction::Work
                | UiAction::ReadSession(_)
                | UiAction::NewSession
                | UiAction::Changes
                | UiAction::NewCloud
                | UiAction::NewWork
                | UiAction::ReadCloud(_)
                | UiAction::OpenWork(_)
        ) {
            self.cloud.workspaces.pending_new = None;
            self.terminal.visible = false;
            self.terminal.epoch = uuid::Uuid::new_v4();
            self.terminal_poll_task = None;
        }
        if matches!(
            &action,
            UiAction::Account
                | UiAction::Code
                | UiAction::CloudHistory
                | UiAction::Projects
                | UiAction::Work
                | UiAction::ReadSession(_)
                | UiAction::NewSession
                | UiAction::Changes
                | UiAction::NewCloud
                | UiAction::NewWork
                | UiAction::ReadCloud(_)
                | UiAction::OpenWork(_)
        ) {
            self.attachment_recovery.visible = false;
            self.editor.visible = false;
            if !self.editor.saving {
                self.editor.operation = None;
            }
        }
        match action {
            UiAction::Code => self.open_code(window, cx),
            UiAction::ToggleNavigation | UiAction::CloseNavigation => unreachable!(),
            UiAction::Terminal => self.open_terminal(window, cx),
            UiAction::NewTerminal => self.new_terminal(window, cx),
            UiAction::BackFromTerminal => {
                self.terminal.visible = false;
                self.terminal.epoch = uuid::Uuid::new_v4();
                self.terminal_poll_task = None;
                self.focus.focus(window, cx);
                cx.notify();
            }
            UiAction::RefreshTerminals => self.watch_terminal(window, cx),
            UiAction::SelectTerminal(id) => {
                if self.terminal.operation.is_none()
                    && self
                        .terminal
                        .terminals
                        .iter()
                        .any(|terminal| terminal.plan.terminal_id == id)
                {
                    self.terminal.selected = Some(id);
                    self.terminal.frame = None;
                    self.terminal.scrollback = 0;
                    self.terminal_view = None;
                    self.watch_terminal(window, cx);
                }
            }
            UiAction::CloseTerminal(id) => self.close_terminal(id, window, cx),
            UiAction::ScrollTerminal(older) => {
                if let Some(screen) = self
                    .terminal
                    .frame
                    .as_ref()
                    .and_then(|frame| frame.screen.as_ref())
                {
                    self.terminal.scrollback = if older {
                        self.terminal
                            .scrollback
                            .saturating_add(usize::from(screen.size.rows))
                            .min(screen.scrollback_len)
                    } else {
                        0
                    };
                    self.terminal.frame = None;
                    self.watch_terminal(window, cx);
                }
            }
            UiAction::FitTerminal => {
                if let Some(view) = &self.terminal_view {
                    let size = view.read(cx).desired_size();
                    self.resize_terminal(size, cx);
                }
            }
            UiAction::CopyTerminal => self.copy_terminal(cx),
            UiAction::PasteTerminal => self.paste_terminal(None, window, cx),
            UiAction::ConfirmTerminalPaste => self.confirm_terminal_paste(window, cx),
            UiAction::CancelTerminalPaste => {
                self.pending_terminal_paste = None;
                cx.notify();
            }
            UiAction::Files => self.open_files(cx),
            UiAction::CodeSettings => self.open_code_settings(window, cx),
            UiAction::CodeWorktrees => self.open_code_worktrees(window, cx),
            UiAction::CloseCodeWorktrees => {
                if self.code_worktrees.operation.is_none() {
                    self.code_worktrees.visible = false;
                    self.focus.focus(window, cx);
                    cx.notify();
                }
            }
            UiAction::CreateWorktree(start) => {
                self.change_code_worktree(CodeWorktreeMutation::Create(start), window, cx)
            }
            UiAction::PinWorktree(id, pinned) => {
                self.change_code_worktree(CodeWorktreeMutation::Pin(id, pinned), window, cx)
            }
            UiAction::ArchiveWorktree(id) => {
                self.change_code_worktree(CodeWorktreeMutation::Archive(id), window, cx)
            }
            UiAction::OpenWorktree(id) => self.open_managed_worktree(
                id,
                code_worktrees::WorktreeFolderTarget::Checkout,
                window,
                cx,
            ),
            UiAction::OpenWorktreeRepository(id) => self.open_managed_worktree(
                id,
                code_worktrees::WorktreeFolderTarget::Repository,
                window,
                cx,
            ),
            UiAction::ReviewWorktreeApply(id) => self.review_worktree_apply(id, window, cx),
            UiAction::CommitWorktreeApply => self.commit_worktree_apply(window, cx),
            UiAction::ReadWorktreeApplyResult => self.read_worktree_apply_result(window, cx),
            UiAction::SelectWorktreeApplyFile(path) => {
                if self
                    .code_worktrees
                    .apply_plan
                    .as_ref()
                    .is_some_and(|plan| plan.files.iter().any(|file| file.path == path))
                {
                    self.code_worktrees.apply_path = Some(path);
                    cx.notify();
                }
            }
            UiAction::BackFromWorktreeApply => {
                if self.code_worktrees.operation.is_none() {
                    self.code_worktrees.apply_visible = false;
                    self.focus.focus(window, cx);
                    cx.notify();
                }
            }
            UiAction::ShowWorktreeApply => {
                self.code_worktrees.apply_visible = true;
                self.focus.focus(window, cx);
                cx.notify();
            }
            UiAction::CopyWorktreeApplyResult => {
                if let Some(result) = &self.code_worktrees.apply_result {
                    match serde_json::to_string_pretty(result) {
                        Ok(text) => {
                            cx.write_to_clipboard(gpui::ClipboardItem::new_string(text));
                            self.code_worktrees.notice = Some("Apply receipt copied.".into());
                        }
                        Err(error) => self.code_worktrees.error = Some(error.to_string()),
                    }
                    cx.notify();
                }
            }
            UiAction::CloseCodeSettings => {
                if self.code_settings.operation.is_none() {
                    self.code_settings.visible = false;
                    cx.notify();
                }
            }
            UiAction::InstructionScope(scope) => self.read_code_settings(scope, window, cx),
            UiAction::ReloadCodeSettings => {
                if let Some(current) = &self.code_settings.snapshot {
                    self.read_code_settings(current.scope, window, cx);
                }
            }
            UiAction::SaveCodeInstructions => self.save_code_instructions(window, cx),
            UiAction::UseStoredCodeInstructions => self.use_stored_code_instructions(window, cx),
            UiAction::KeepCodeInstructionEdits => {
                if self.code_settings.operation.is_none() {
                    self.focus.focus(window, cx);
                    if let Err(error) = self.code_settings.keep_edits() {
                        self.code_settings.error = Some(error.to_string());
                    }
                    cx.notify();
                }
            }
            UiAction::CodeInstructionSources => {
                self.focus.focus(window, cx);
                self.load_code_instruction_sources(cx);
            }
            UiAction::BackFromFiles => {
                if !self.editor.saving && !self.editor.recovery_browser.mutating {
                    self.editor.visible = false;
                    self.editor.operation = None;
                    cx.notify();
                }
            }
            UiAction::BrowseFiles(path, after) => self.browse_files(path, after, cx),
            UiAction::ReadFile(path) => self.read_file(path, window, cx),
            UiAction::OpenFilePath => {
                self.read_file(self.editor_path.read(cx).value().to_string(), window, cx)
            }
            UiAction::SaveFile => self.save_file(cx),
            UiAction::CloseFile => self.close_file(window, cx),
            UiAction::RecoveredFiles => self.open_recovered_files(window, cx),
            UiAction::BackFromRecoveredFiles => {
                if self.editor.recovery_browser.operation.is_none() {
                    self.editor.recovery_browser.visible = false;
                    cx.notify();
                }
            }
            UiAction::RefreshRecoveredFiles => self.refresh_recovered_files(cx),
            UiAction::ReadRecoveredFile(path) => self.read_recovered_file(path, window, cx),
            UiAction::SaveRecoveryCopy => self.save_recovery_copy(window, cx),
            UiAction::DiscardRecoveryCopy => self.discard_recovery_copy(window, cx),
            UiAction::CopyRecoveredText => {
                if let Some(value) = self
                    .editor
                    .recovery_browser
                    .selected
                    .as_ref()
                    .and_then(|snapshot| snapshot.recovery.as_ref())
                {
                    cx.write_to_clipboard(gpui::ClipboardItem::new_string(value.content.clone()));
                }
            }
            UiAction::OpenRecoveredOriginal(path) => {
                if self.editor.recovery_browser.operation.is_none() {
                    self.editor.recovery_browser.visible = false;
                    self.read_file(path, window, cx);
                }
            }
            UiAction::ReloadFileRecovery => self.reload_file_recovery(cx),
            UiAction::ResolveFileRecovery(restore) => {
                self.resolve_file_recovery(restore, window, cx)
            }
            UiAction::CopyFileRecovery => {
                if let Some(value) = self
                    .editor
                    .recovery
                    .review
                    .as_ref()
                    .and_then(|snapshot| snapshot.recovery.as_ref())
                {
                    cx.write_to_clipboard(gpui::ClipboardItem::new_string(value.content.clone()));
                }
            }
            UiAction::Changes => self.open_changes(cx),
            UiAction::CloseChanges => {
                if !self.changes.applying {
                    self.changes.visible = false;
                    self.changes.operation = None;
                    cx.notify();
                }
            }
            UiAction::ReviewTurn(id) => self.review_turn(id, cx),
            UiAction::ReviewFile(path) => {
                if self.changes.operation.is_none()
                    && self
                        .changes
                        .diff
                        .as_ref()
                        .is_some_and(|diff| diff.files.iter().any(|file| file.path == path))
                {
                    self.changes.selected_path = Some(path);
                    cx.notify();
                }
            }
            UiAction::ChangeSection(path, hunk, stage) => {
                self.change_section(path, hunk, stage, window, cx)
            }
            UiAction::OpenFolder => self.open_folder(window, cx),
            UiAction::Refresh => self.load_sessions(false, cx),
            UiAction::NextPage => self.load_sessions(true, cx),
            UiAction::SearchSessions => self.search_sessions(cx),
            UiAction::ClearSessionSearch => {
                self.code_search.reset();
                self.code_search_reset = true;
                cx.notify();
            }
            UiAction::ReadSession(id) => self.read_session(id, window, cx),
            UiAction::NewSession => self.new_session(cx),
            UiAction::CreateSession(index) => self.create_session(index, window, cx),
            UiAction::CancelModelPicker => {
                self.models = None;
                cx.notify();
            }
            UiAction::Send => self.send(window, cx),
            UiAction::Stop => self.stop(cx),
            UiAction::Approval(id, allow) => self.approval(id, allow, window, cx),
            UiAction::Account => self.open_account(window, cx),
            UiAction::CloudHistory => self.open_cloud(window, cx),
            UiAction::ReloadCloudWorkspaces => self.load_cloud_workspaces(cx),
            UiAction::ToggleArchivedCloud => self.toggle_archived_cloud(cx),
            UiAction::RenameCloud(params) => self.rename_cloud(params, window, cx),
            UiAction::SaveCloudTitle(id) => self.save_cloud_title(id, cx),
            UiAction::CancelCloudTitle(id) => {
                if self
                    .cloud
                    .management
                    .editing
                    .as_ref()
                    .is_some_and(|edit| edit.id == id)
                    && !self.cloud.navigation_busy()
                {
                    self.cloud.management.editing = None;
                    self.cloud.management.error = None;
                    cx.notify();
                }
            }
            UiAction::UpdateCloudConversation(params) => self.update_cloud_conversation(params, cx),
            UiAction::ReloadCloudMetadata => self.reload_cloud_metadata(cx),

            UiAction::ScopedCloudHistory => self.load_cloud(false, cx),
            UiAction::AttachmentRecovery(action) => {
                self.attachment_recovery_action(action, window, cx)
            }
            UiAction::ChooseChatUpload => self.choose_chat_upload(window, cx),
            UiAction::ChatUpload(selection, action) => {
                self.chat_upload_action(selection, action, window, cx)
            }
            UiAction::ChooseProjectUpload(id) => self.choose_project_upload(id, window, cx),
            UiAction::ProjectUpload(action) => self.upload_action(action, window, cx),
            UiAction::ProjectDownload(action) => self.download_action(action, window, cx),
            UiAction::ProjectFile(crate::project_file_controls::ProjectFileAction::Download(
                file,
            )) => self.choose_project_download(file, window, cx),
            UiAction::ProjectFile(action) => self.project_file_action(action, cx),
            UiAction::Projects => self.open_projects(window, cx),
            UiAction::RefreshProjects => {
                if self.cloud.projects.edit.is_none() {
                    self.cloud.projects.selected = None;
                }
                self.load_projects(false, cx);
            }
            UiAction::MoreProjects => self.load_projects(true, cx),
            UiAction::ReadProject(id) => self.read_project(id, false, cx),
            UiAction::ReviewProject => {
                if let Some(project) = &self.cloud.projects.selected {
                    self.read_project(project.id.clone(), true, cx);
                }
            }
            UiAction::EditProject(new) => self.edit_project(new, window, cx),
            UiAction::CancelProjectEdit(id) => self.cancel_project_edit(id, window, cx),
            UiAction::SaveProject(id) => self.save_project(id, cx),
            UiAction::ArchiveProject(request) => self.archive_project(request, cx),
            UiAction::ProjectChats(id, new) => self.project_chats(id, new, window, cx),
            UiAction::CloudModels => self.open_cloud_models(cx),
            UiAction::SaveCloudDraft => self.save_cloud_draft(cx),
            UiAction::ResolveCloudDraft(reviewed, mine) => {
                self.resolve_cloud_draft(reviewed, mine, window, cx)
            }
            UiAction::CopySavedCloudDraft(reviewed) => {
                if self.cloud.draft.conflict.as_ref() == Some(&reviewed) {
                    cx.write_to_clipboard(gpui::ClipboardItem::new_string(reviewed.text));
                }
            }
            UiAction::NewCloud => self.new_cloud(false, window, cx),
            UiAction::NewWork => self.new_cloud(true, window, cx),
            UiAction::RunWorkPlan(plan) => self.run_work_plan(plan, window, cx),
            UiAction::UpdateWorkPlan(plan, decline) => {
                self.update_work_plan(plan, decline, window, cx)
            }
            UiAction::EditRejectedMessage => {
                if self
                    .cloud
                    .turn
                    .as_ref()
                    .is_some_and(|turn| turn.rejected && !turn.accepted)
                {
                    self.cloud.clear_turn();
                    self.cloud.error = None;
                    self.cloud_composer
                        .update(cx, |state, cx| state.focus(window, cx));
                    cx.notify();
                }
            }
            UiAction::SendCloud => self.send_cloud(window, cx),
            UiAction::StopCloud(params) => self.stop_cloud(params, cx),
            UiAction::ResumeCloud(action) => self.resume_cloud(action, window, cx),
            UiAction::RefreshCloudTurn => self.poll_cloud(window, cx),
            UiAction::Work => self.open_work(window, cx),
            UiAction::MoreWork => self.load_work(true, cx),
            UiAction::FilterWork(state) => {
                if !self.cloud.work_loading {
                    self.cloud.work_states = state.into_iter().collect();
                    self.load_work(false, cx);
                }
            }
            UiAction::OpenWork(id) => self.attach_work(id, window, cx),
            UiAction::LeaveWork => self.leave_work(frame::WorkDestination::List, window, cx),
            UiAction::SearchCloud => self.load_cloud(false, cx),
            UiAction::MoreCloudHistory => self.load_cloud(true, cx),
            UiAction::ReadCloud(id) => self.read_cloud(id, HistoryReadIntent::Latest, cx),
            UiAction::MoreCloudMessages => {
                if let Some(detail) = &self.cloud.detail {
                    self.read_cloud(detail.conversation.id.clone(), HistoryReadIntent::Older, cx);
                }
            }
            UiAction::ReconnectAccount => self.reconnect_upload_account(window, cx),
            UiAction::CloseAccount => {
                self.account.visible = false;
                self.focus.focus(window, cx);
                cx.notify();
            }
            UiAction::RefreshAccount => self.refresh_account(true, cx),
            UiAction::SignIn => self.sign_in(cx),
            UiAction::OpenSignIn => self.open_sign_in(cx),
            UiAction::CopySignInCode => self.copy_sign_in_code(cx),
            UiAction::CancelSignIn => self.cancel_sign_in(cx),
            UiAction::SignOut => self.sign_out(window, cx),
        }
    }

    fn button(
        &self,
        id: impl Into<SharedString>,
        label: impl Into<SharedString>,
        action: UiAction,
        palette: Palette,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<gpui::Div> {
        crate::native_controls::button(
            id,
            label,
            move |view: &mut Desktop, window, cx| view.dispatch(action.clone(), window, cx),
            &self.contracts,
            palette,
            cx,
        )
    }
}

impl Render for Desktop {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.cloud.visible
            && (if self.cloud.work_visible {
                self.cloud.work_selected.is_some()
            } else {
                self.cloud.detail.is_some()
            })
        {
            self.history_viewport.keep_latest();
        }
        let dark = matches!(
            window.appearance(),
            WindowAppearance::Dark | WindowAppearance::VibrantDark
        );
        let palette = if dark {
            self.contracts.dark
        } else {
            self.contracts.light
        };
        rich_text::sync_theme(&self.contracts, palette, dark, cx);
        let width: f32 = window.bounds().size.width.into();
        let small = crate::native_frame::compact(width, &self.contracts);
        if !small && self.navigation_open {
            self.navigation_open = false;
            self.focus.focus(window, cx);
        }
        let mut content = div()
            .id("transcript")
            .role(gpui::Role::Document)
            .aria_label(if self.terminal.visible {
                "Workspace terminal"
            } else if self.editor.visible {
                "Coding files"
            } else if self.account.visible {
                "Account settings"
            } else if self.cloud.visible && self.cloud.projects.visible {
                "Projects"
            } else {
                "Conversation"
            })
            .flex_1()
            .min_h_0()
            .min_w_0()
            .h_full()
            .overflow_y_scroll()
            .track_scroll(&self.history_viewport.scroll)
            .flex()
            .flex_col()
            .items_center()
            .p(px(self.contracts.frame.viewport_gutter))
            .gap_4();
        if let Some(workspace) = self
            .workspace
            .as_ref()
            .filter(|_| !self.account.visible && !self.cloud.visible)
        {
            content = content.child(
                div()
                    .w_full()
                    .max_w(px(self.contracts.frame.content_width))
                    .text_color(rgb(palette.secondary))
                    .child(gpui::text!(workspace.display().to_string())),
            );
        }
        if let Some(error) = self
            .error
            .as_ref()
            .filter(|_| !self.account.visible && !self.cloud.visible)
        {
            content = content.child(
                div()
                    .w_full()
                    .max_w(px(self.contracts.frame.content_width))
                    .text_color(rgb(palette.danger))
                    .child(gpui::text!(error.clone())),
            );
        }
        if self.loading && !self.account.visible && !self.cloud.visible {
            content = content.child(gpui::text!("Loading…"));
        }
        if self.code_search_reset {
            self.code_search_reset = false;
            self.code_query
                .update(cx, |state, cx| state.set_value("", window, cx));
        }
        if self.cloud.reset_query {
            self.cloud.reset_query = false;
            self.cloud_query
                .update(cx, |state, cx| state.set_value("", window, cx));
        }
        self.sync_cloud_draft(window, cx);
        self.pump_cloud_workspace(window, cx);
        self.sync_cloud_workspace_select(window, cx);
        self.sync_cloud_model_select(window, cx);
        if self.terminal.visible {
            content = content.child(self.render_terminal(palette, dark, window, cx));
        } else if self.editor.visible {
            content = content.child(self.render_files(palette, window, cx));
        } else if self.cloud.visible {
            content = content.child(if self.attachment_recovery.visible {
                self.render_attachment_recovery(palette, cx)
                    .into_any_element()
            } else {
                self.render_cloud(window, palette, cx)
            });
        } else if self.account.visible {
            content = content.child(self.render_account(palette, cx));
        } else if self.code_settings.visible {
            content = content.child(self.render_code_settings(palette, window, cx));
        } else if self.code_worktrees.visible {
            content = content.child(if self.code_worktrees.apply_visible {
                self.render_worktree_apply(palette, window, cx)
            } else {
                self.render_code_worktrees(palette, cx)
            });
        } else if self.changes.visible {
            content = content.child(self.render_changes(window, palette, cx));
        } else if let Some(models) = &self.models {
            content = content.child(gpui::text!("Choose a model for a new conversation"));
            content = content.child(gpui::text!(
                "Your existing conversation stays in its current privacy boundary."
            ));
            for (index, model) in models.iter().enumerate() {
                let label = format!(
                    "{} · {} · {}",
                    model.id,
                    model.provider,
                    self.contracts.trust_labels.label(model.trust_mode)
                );
                content = content.child(if model.reachable && model.trust_mode != agiworkforce_protocol::developer_session::DeveloperSessionTrustMode::Unknown {
                    self.button(SharedString::from(format!("model:{index}")), label, UiAction::CreateSession(index), palette, cx).into_any_element()
                } else {
                    div().w_full().max_w(px(self.contracts.frame.content_width)).text_color(rgb(palette.secondary))
                        .id(("unavailable-model", index))
                        .child(gpui::text!(format!("{label} · Unavailable on this host"))).into_any_element()
                });
            }
            if models.is_empty() {
                content = content.child(gpui::text!("No models are available. Sign in from Account, or configure a provider key or local server in the command-line client, then try again."));
            }
            content = content.child(self.button(
                "cancel-model-picker",
                "Cancel",
                UiAction::CancelModelPicker,
                palette,
                cx,
            ));
        } else if let Some(conversation) = &self.conversation {
            let transcript = &conversation.transcript;
            let trust = self
                .contracts
                .trust_labels
                .label(transcript.thread.trust_mode);
            let provenance = match &transcript.thread.provider {
                Some(provider) => format!(
                    "{trust} · {provider} · {}",
                    transcript
                        .thread
                        .model
                        .as_deref()
                        .unwrap_or("Model unavailable")
                ),
                None => trust.to_owned(),
            };
            content = content.child(
                div()
                    .w_full()
                    .max_w(px(self.contracts.frame.content_width))
                    .child(
                        div()
                            .text_color(rgb(palette.secondary))
                            .child(gpui::text!(provenance)),
                    ),
            );
            if self
                .capabilities
                .as_ref()
                .is_some_and(|caps| caps.checkpoints && caps.managed_worktrees)
            {
                content = content.child(self.button(
                    "code-changes",
                    "Changes",
                    UiAction::Changes,
                    palette,
                    cx,
                ));
            }
            if transcript.transcript_truncated {
                content = content.child(gpui::text!(
                    "Showing the most recent messages returned by the runtime."
                ));
            }
            for (index, message) in transcript.messages.iter().enumerate() {
                content = content.child(
                    div()
                        .id(("message", index))
                        .w_full()
                        .max_w(px(self.contracts.frame.content_width))
                        .flex()
                        .flex_col()
                        .gap_2()
                        .child(
                            div()
                                .text_color(rgb(palette.secondary))
                                .child(gpui::text!(message.role.clone())),
                        )
                        .child(if message.role == "assistant" {
                            rich_text::markdown(
                                SharedString::from(format!(
                                    "code:{}:{}:message:{}",
                                    self.generation,
                                    transcript.thread.id,
                                    message.index.map_or(index, |value| value as usize)
                                )),
                                message.text.clone(),
                                &self.contracts,
                                window,
                                cx,
                            )
                            .into_any_element()
                        } else {
                            gpui::text!(message.text.clone()).into_any_element()
                        }),
                );
            }
            if let Some(turn) = &conversation.turn {
                if let Some(text) = &turn.submitted_text {
                    if !transcript.messages.iter().any(|message| {
                        message.role == "user"
                            && message.turn_id.as_deref() == Some(turn.id.as_str())
                    }) {
                        content = content.child(
                            div()
                                .w_full()
                                .max_w(px(self.contracts.frame.content_width))
                                .child(gpui::text!("You"))
                                .child(gpui::text!(text.clone())),
                        );
                    }
                }
                content = content.child(
                    div()
                        .w_full()
                        .max_w(px(self.contracts.frame.content_width))
                        .child(rich_text::markdown(
                            SharedString::from(format!(
                                "code:{}:{}:turn:{}",
                                self.generation, transcript.thread.id, turn.id
                            )),
                            turn.output.clone(),
                            &self.contracts,
                            window,
                            cx,
                        )),
                );
                if conversation.is_running() {
                    content = content.child(gpui::text!(if turn.approvals.is_empty() {
                        turn.progress.as_deref().unwrap_or("Working…")
                    } else {
                        "Waiting for your approval"
                    }
                    .to_owned()));
                } else if turn.status
                    == agiworkforce_protocol::developer_session::TurnStatus::Interrupted
                {
                    content = content.child(gpui::text!("Stopped"));
                }
                for request in &turn.approvals {
                    let mut approval = div()
                        .id(SharedString::from(format!(
                            "code-approval:{}",
                            request.request_id
                        )))
                        .w_full()
                        .max_w(px(self.contracts.frame.content_width))
                        .flex()
                        .flex_col()
                        .gap_2()
                        .child(gpui::text!(request.summary.clone()))
                        .child(gpui::text!(request.detail.clone()))
                        .child(gpui::text!(match request.reversible {
                            Some(true) => "Reversible",
                            Some(false) => "Cannot be undone",
                            None => "Reversibility not stated",
                        }));
                    if let Some(risk) = request.risk_level {
                        approval = approval.child(gpui::text!(match risk {
                            agiworkforce_protocol::agent_events::AgentEventApprovalRiskLevel::Low => "Low risk",
                            agiworkforce_protocol::agent_events::AgentEventApprovalRiskLevel::Medium => "Medium risk",
                            agiworkforce_protocol::agent_events::AgentEventApprovalRiskLevel::High => "High risk",
                        }));
                    }
                    if let Some(proposed) = &request.proposed_content {
                        approval = approval.child(gpui::text!(proposed.clone()));
                    }
                    if let Some(question) = &request.question {
                        approval = approval.child(gpui::text!(question.to_string()));
                    }
                    if self.approval_pending.is_none() {
                        approval = approval
                            .child(self.button(
                                SharedString::from(format!("allow:{}", request.request_id)),
                                "Review and allow once",
                                UiAction::Approval(request.request_id.clone(), true),
                                palette,
                                cx,
                            ))
                            .child(self.button(
                                SharedString::from(format!("deny:{}", request.request_id)),
                                "Deny",
                                UiAction::Approval(request.request_id.clone(), false),
                                palette,
                                cx,
                            ));
                    }
                    content = content.child(approval);
                }
            }
            if let Some(error) = &conversation.error {
                content = content.child(
                    div()
                        .text_color(rgb(palette.danger))
                        .child(gpui::text!(error.clone())),
                );
            }
            if transcript.messages.is_empty() && conversation.turn.is_none() {
                content = content.child(gpui::text!("This session has no messages yet."));
            }
        } else if self.error.is_none() {
            content = content.child(gpui::text!(if self.workspace.is_none() {
                "Open a folder to view its coding sessions."
            } else if self.threads.is_empty() {
                "No coding sessions in this folder yet."
            } else {
                "Select a session to read its conversation."
            }));
        }
        if self.chat_upload.generation != self.account_generation
            || self
                .account
                .status
                .as_ref()
                .is_some_and(|account| !account.signed_in)
        {
            self.chat_upload = Default::default();
            self.attachment_recovery = Default::default();
            self.chat_upload_poll_task = None;
        }
        if self.project_upload.target.is_some()
            && (self.project_upload.generation != self.account_generation
                || self
                    .project_upload
                    .target
                    .as_ref()
                    .is_some_and(|target| self.cloud.scope.as_ref() != Some(&target.scope))
                || self
                    .account
                    .status
                    .as_ref()
                    .is_some_and(|account| !account.signed_in))
        {
            self.project_upload = Default::default();
            self.upload_poll_task = None;
        }
        if self.project_download.target.is_some()
            && (self.project_download.generation != self.account_generation
                || self
                    .project_download
                    .target
                    .as_ref()
                    .is_some_and(|target| self.cloud.scope.as_ref() != Some(&target.project.scope))
                || self
                    .account
                    .status
                    .as_ref()
                    .is_some_and(|account| !account.signed_in))
        {
            self.project_download = Default::default();
            self.download_poll_task = None;
        }
        let header = div()
            .flex()
            .flex_col()
            .min_w_0()
            .flex_shrink_0()
            .child(self.render_header(small, palette, cx))
            .child(self.render_chat_upload(palette, cx))
            .child(crate::project_upload_controls::controls(
                &self.project_upload,
                &self.contracts,
                palette,
                |view: &mut Desktop, action, window, cx| {
                    view.dispatch(UiAction::ProjectUpload(action), window, cx)
                },
                cx,
            ))
            .child(crate::project_download_controls::controls(
                &self.project_download,
                &self.contracts,
                palette,
                |view: &mut Desktop, action, window, cx| {
                    view.dispatch(UiAction::ProjectDownload(action), window, cx)
                },
                cx,
            ))
            .into_any_element();
        let footer = self.render_composer(window, palette, cx);
        let main = crate::native_frame::main(header, content.into_any_element(), footer);
        let sidebar = self.render_sidebar(small, palette, cx);
        let frame = crate::native_frame::layout(
            width,
            self.navigation_open,
            sidebar,
            main.into_any_element(),
            &self.contracts,
        );
        div()
            .size_full()
            .flex()
            .bg(rgb(palette.background))
            .text_color(rgb(palette.foreground))
            .text_size(px(self.contracts.body_font_size))
            .line_height(px(self.contracts.body_line_height))
            .track_focus(&self.focus)
            .on_key_down(cx.listener(|view, event: &gpui::KeyDownEvent, window, cx| {
                if view.navigation_open && event.keystroke.key == "escape" {
                    cx.stop_propagation();
                    view.dispatch(UiAction::CloseNavigation, window, cx);
                }
            }))
            .on_action(cx.listener(|view, _: &OpenFolder, window, cx| view.open_folder(window, cx)))
            .on_action(cx.listener(|view, _: &Refresh, _, cx| view.load_sessions(false, cx)))
            .on_action(cx.listener(|view, _: &SaveFile, window, cx| {
                if view.cloud.visible
                    && view.cloud.projects.visible
                    && view.cloud.projects.edit.is_some()
                {
                    if let Some(edit) = &view.cloud.projects.edit {
                        view.save_project(edit.id, cx);
                    }
                } else if view.code_settings.visible
                    && !view.cloud.visible
                    && !view.account.visible
                    && !view.editor.visible
                    && !view.terminal.visible
                {
                    view.save_code_instructions(window, cx);
                } else if !(view.code_worktrees.visible
                    && !view.cloud.visible
                    && !view.account.visible
                    && !view.editor.visible
                    && !view.terminal.visible)
                {
                    view.save_file(cx);
                }
            }))
            .on_action(
                cx.listener(|view, _: &OpenTerminal, window, cx| view.open_terminal(window, cx)),
            )
            .on_action(
                cx.listener(|view, _: &Quit, window, cx| view.request_close(true, window, cx)),
            )
            .on_action(cx.listener(|view, _: &CloseWindow, window, cx| {
                view.request_close(false, window, cx)
            }))
            .child(frame)
    }
}

pub fn bind_application_shortcuts(cx: &mut App) -> Result<()> {
    let actions: [(&str, Box<dyn gpui::Action>); 6] = [
        ("secondary-q", Box::new(Quit)),
        ("secondary-w", Box::new(CloseWindow)),
        ("secondary-o", Box::new(OpenFolder)),
        ("secondary-r", Box::new(Refresh)),
        ("secondary-s", Box::new(SaveFile)),
        ("ctrl-`", Box::new(OpenTerminal)),
    ];
    let bindings = actions
        .into_iter()
        .map(|(key, action)| {
            KeyBinding::load(key, action, None, false, None, cx).map_err(anyhow::Error::from)
        })
        .collect::<Result<Vec<_>>>()?;
    cx.bind_keys(bindings);
    Ok(())
}

pub fn run(runtime: PathBuf, initial_size: Option<(f32, f32)>) -> Result<()> {
    let binary =
        std::fs::canonicalize(runtime).context("Pass an existing CLI executable to --runtime")?;
    let contracts = Arc::new(NativeContracts::load()?);
    let mut settings = Settings::load()?;
    if let Some((width, height)) = initial_size {
        settings.window_width = width;
        settings.window_height = height;
    }
    anyhow::ensure!(
        settings.window_width.is_finite()
            && settings.window_height.is_finite()
            && settings.window_width > 0.
            && settings.window_height > 0.,
        "Window dimensions must be positive and finite"
    );
    let executor = Arc::new(tokio::runtime::Runtime::new()?);
    let runtime = Arc::new(Mutex::new(None::<RuntimeSession>));
    let account_runtime = Arc::new(Mutex::new(None::<RuntimeSession>));
    gpui_platform::application()
        .with_assets(gpui_kit_assets::Assets)
        .run(move |cx: &mut App| {
            gpui_component::init(cx);
            if let Err(error) = bind_application_shortcuts(cx) {
                eprintln!("Application shortcuts could not be loaded: {error:#}");
                cx.quit();
                return;
            }
            cx.on_window_closed(|cx, _| {
                if cx.windows().is_empty() {
                    cx.quit();
                }
            })
            .detach();
            let shutdown_runtime = Arc::clone(&runtime);
            let shutdown_executor = Arc::clone(&executor);
            let shutdown_account = Arc::clone(&account_runtime);
            cx.on_app_quit(move |_| {
                let runtime = Arc::clone(&shutdown_runtime);
                let account = Arc::clone(&shutdown_account);
                let executor = Arc::clone(&shutdown_executor);
                async move {
                    if let Err(error) =
                        crate::runtime::shutdown_sessions(executor, [runtime, account]).await
                    {
                        eprintln!("Runtime shutdown: {error:#}");
                    }
                }
            })
            .detach();
            let opened = cx.open_window(
                WindowOptions {
                    titlebar: Some(gpui::TitlebarOptions {
                        title: Some(contracts.desktop_name.clone().into()),
                        ..Default::default()
                    }),
                    window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                        None,
                        size(px(settings.window_width), px(settings.window_height)),
                        cx,
                    ))),
                    ..Default::default()
                },
                |window, cx| {
                    let desktop = cx.new(|cx| {
                        let focus = cx.focus_handle();
                        focus.focus(window, cx);
                        let editor_buffer = cx.new(|cx| EditorState::new(window, cx));
                        let instruction_buffer = cx.new(|cx| EditorState::new(window, cx));
                        cx.subscribe_in(
                            &instruction_buffer,
                            window,
                            |_: &mut Desktop, _, _: &InputEvent, _, cx| cx.notify(),
                        )
                        .detach();
                        let editor_path = cx.new(|cx| {
                            InputState::new(window, cx).placeholder("Relative file path")
                        });
                        let recovery_destination = cx.new(|cx| {
                            InputState::new(window, cx).placeholder("New relative file path")
                        });
                        cx.subscribe_in(
                            &recovery_destination,
                            window,
                            |view: &mut Desktop, _, event: &InputEvent, window, cx| {
                                if matches!(event, InputEvent::PressEnter { .. })
                                    && view.editor.recovery_browser.visible
                                {
                                    view.save_recovery_copy(window, cx);
                                }
                            },
                        )
                        .detach();
                        let terminal_paste = cx.new(|cx| TextareaState::new(window, cx));
                        cx.subscribe_in(
                            &editor_buffer,
                            window,
                            |view: &mut Desktop, _, event: &InputEvent, _, cx| {
                                if matches!(event, InputEvent::Change) {
                                    view.changed_file_recovery(cx);
                                }
                                cx.notify();
                            },
                        )
                        .detach();
                        cx.subscribe_in(
                            &editor_path,
                            window,
                            |view: &mut Desktop, _, event: &InputEvent, window, cx| {
                                if matches!(event, InputEvent::PressEnter { .. })
                                    && view.editor.visible
                                {
                                    view.read_file(
                                        view.editor_path.read(cx).value().to_string(),
                                        window,
                                        cx,
                                    );
                                }
                            },
                        )
                        .detach();
                        let composer = cx.new(|cx| {
                            TextareaState::new(window, cx)
                                .placeholder("Message")
                                .auto_grow(1, 8)
                                .submit_on_enter(true)
                        });
                        let project_name =
                            cx.new(|cx| InputState::new(window, cx).placeholder("Project name"));
                        let project_description =
                            cx.new(|cx| TextareaState::new(window, cx).auto_grow(2, 4));
                        let project_instructions =
                            cx.new(|cx| TextareaState::new(window, cx).auto_grow(3, 8));
                        cx.subscribe_in(
                            &project_name,
                            window,
                            |view: &mut Desktop, _, event: &InputEvent, _, cx| {
                                if matches!(event, InputEvent::PressEnter { .. }) {
                                    if let Some(edit) = &view.cloud.projects.edit {
                                        view.save_project(edit.id, cx);
                                    }
                                }
                                cx.notify();
                            },
                        )
                        .detach();
                        cx.subscribe_in(
                            &project_description,
                            window,
                            |_: &mut Desktop, _, _: &InputEvent, _, cx| cx.notify(),
                        )
                        .detach();
                        cx.subscribe_in(
                            &project_instructions,
                            window,
                            |_: &mut Desktop, _, _: &InputEvent, _, cx| cx.notify(),
                        )
                        .detach();
                        let cloud_title = cx.new(|cx| {
                            InputState::new(window, cx).placeholder("Conversation title")
                        });
                        cx.subscribe_in(
                            &cloud_title,
                            window,
                            |view: &mut Desktop, _, event: &InputEvent, _, cx| {
                                if let InputEvent::PressEnter { .. } = event {
                                    if let Some(edit) = &view.cloud.management.editing {
                                        view.save_cloud_title(edit.id, cx);
                                    }
                                }
                                cx.notify();
                            },
                        )
                        .detach();
                        let cloud_composer = cx.new(|cx| {
                            TextareaState::new(window, cx)
                                .placeholder("Message")
                                .auto_grow(1, 8)
                                .submit_on_enter(true)
                        });
                        cx.subscribe_in(
                            &cloud_composer,
                            window,
                            |view: &mut Desktop, _, event: &InputEvent, window, cx| match event {
                                InputEvent::PressEnter { shift: false, .. } => {
                                    view.send_cloud(window, cx)
                                }
                                InputEvent::Change => view.changed_cloud_draft(cx),
                                _ => {}
                            },
                        )
                        .detach();
                        let cloud_query = cx.new(|cx| {
                            InputState::new(window, cx).placeholder("Search Cloud conversations")
                        });
                        cx.subscribe_in(
                            &cloud_query,
                            window,
                            |view: &mut Desktop, input, event: &InputEvent, _, cx| match event {
                                InputEvent::Change if !view.cloud.reset_query => {
                                    view.cloud.query = input.read(cx).value().to_string()
                                }
                                InputEvent::PressEnter { .. } => view.load_cloud(false, cx),
                                _ => {}
                            },
                        )
                        .detach();
                        cx.subscribe_in(
                            &composer,
                            window,
                            |view: &mut Desktop, _, event: &InputEvent, window, cx| match event {
                                InputEvent::PressEnter { shift: false, .. } => {
                                    view.send(window, cx)
                                }
                                InputEvent::Change => cx.notify(),
                                _ => {}
                            },
                        )
                        .detach();
                        let code_query = cx.new(|cx| {
                            InputState::new(window, cx).placeholder("Search coding sessions")
                        });
                        cx.subscribe_in(
                            &code_query,
                            window,
                            |view: &mut Desktop, input, event: &InputEvent, _, cx| match event {
                                InputEvent::Change if !view.code_search_reset => {
                                    view.code_search.set_query(input.read(cx).value().as_str());
                                    cx.notify();
                                }
                                InputEvent::PressEnter { .. } => view.search_sessions(cx),
                                _ => {}
                            },
                        )
                        .detach();
                        let cloud = CloudHistory::new(contracts.max_frame_bytes.get());
                        Desktop {
                            navigation_open: false,
                            navigation_menu_focus: cx.focus_handle(),
                            navigation_close_focus: cx.focus_handle(),
                            history_viewport: crate::viewport::HistoryViewport::default(),
                            contracts,
                            settings,
                            code_settings: Default::default(),
                            code_worktrees: Default::default(),
                            instruction_buffer,
                            executor,
                            runtime,
                            account_runtime,
                            binary,
                            workspace: None,
                            threads: Vec::new(),
                            conversation: None,
                            changes: crate::changes::Changes::default(),
                            editor: crate::editor::FileEditor::default(),
                            editor_buffer,
                            editor_path,
                            recovery_destination,
                            file_recovery_task: None,
                            terminal: crate::terminal::TerminalPanel::default(),
                            terminal_view: None,
                            terminal_poll_task: None,
                            terminal_paste,
                            pending_terminal_paste: None,
                            composer,
                            drafts: HashMap::new(),
                            models: None,
                            submitting: false,
                            stopping: false,
                            approval_pending: None,
                            pending_events: Vec::new(),
                            closing: false,
                            next_cursor: None,
                            code_query,
                            code_search: Default::default(),
                            code_search_reset: false,
                            loading: false,
                            error: None,
                            focus,
                            connection_client: None,
                            event_task: None,
                            generation: 0,
                            capabilities: None,
                            account: AccountPanel {
                                visible: true,
                                ..Default::default()
                            },
                            account_generation: 0,
                            account_capabilities: None,
                            account_connection_client: None,
                            account_event_task: None,
                            cloud,
                            cloud_query,
                            cloud_model_select: None,
                            cloud_workspace_select: None,
                            cloud_composer,
                            cloud_title,
                            project_name,
                            project_description,
                            project_instructions,
                            project_upload: Default::default(),
                            upload_poll_task: None,
                            chat_upload: Default::default(),
                            attachment_recovery: Default::default(),
                            chat_upload_poll_task: None,
                            project_download: Default::default(),
                            download_poll_task: None,
                            cloud_poll_task: None,
                            cloud_draft_task: None,
                        }
                    });
                    desktop.update(cx, Desktop::connect_account);
                    let weak = desktop.downgrade();
                    window.on_window_should_close(cx, move |window, cx| {
                        weak.update(cx, |view, cx| {
                            if view.needs_close_confirmation(cx) {
                                view.request_close(false, window, cx);
                                false
                            } else {
                                true
                            }
                        })
                        .unwrap_or(true)
                    });
                    cx.new(|cx| gpui_component::Root::new(desktop, window, cx))
                },
            );
            match opened {
                Ok(_) => cx.activate(true),
                Err(error) => {
                    eprintln!("Desktop window could not open: {error:#}");
                    cx.quit();
                }
            }
        });
    Ok(())
}
