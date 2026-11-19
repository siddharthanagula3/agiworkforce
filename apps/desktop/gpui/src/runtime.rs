use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use agiworkforce_app_server::{
    BackgroundDeveloperSessionClient, DeveloperSessionClient, DeveloperSessionClientEvent,
};
use agiworkforce_protocol::developer_session::{
    method, AcknowledgedResponse, AppServerCapabilities, AppServerClientInfo, ThreadIdParams,
    ThreadListParams, ThreadListResponse, ThreadReadResponse, ThreadSearchParams,
    ThreadSearchResponse,
};
use anyhow::{Context, Result};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tokio::sync::Mutex;

use crate::config::{NativeContracts, Settings};

pub struct RuntimeSession {
    child: Child,
    client: BackgroundDeveloperSessionClient,
    events: Option<mpsc::Receiver<DeveloperSessionClientEvent>>,
    workspace: Option<PathBuf>,
    settings: Settings,
    capabilities: AppServerCapabilities,
}

pub async fn shutdown_sessions(
    executor: Arc<tokio::runtime::Runtime>,
    sessions: [Arc<Mutex<Option<RuntimeSession>>>; 2],
) -> Result<()> {
    let task = executor.spawn(async move {
        let [code, account] = sessions;
        let stop = |session: Arc<Mutex<Option<RuntimeSession>>>| async move {
            match session.lock().await.take() {
                Some(session) => session.shutdown().await,
                None => Ok(()),
            }
        };
        let (code, account) = tokio::join!(stop(code), stop(account));
        code.context("The Code runtime could not shut down")?;
        account.context("The account runtime could not shut down")
    });
    let result = task.await.context("Runtime shutdown stopped")?;
    drop(executor);
    result
}

impl RuntimeSession {
    pub async fn connect(
        binary: &Path,
        workspace: &Path,
        consent_at_ms: i64,
        contracts: &NativeContracts,
        settings: Settings,
    ) -> Result<Self> {
        Self::connect_inner(
            binary,
            Some((workspace, consent_at_ms)),
            contracts,
            settings,
        )
        .await
    }

    pub async fn connect_account(
        binary: &Path,
        contracts: &NativeContracts,
        settings: Settings,
    ) -> Result<Self> {
        Self::connect_inner(binary, None, contracts, settings).await
    }

    async fn connect_inner(
        binary: &Path,
        workspace: Option<(&Path, i64)>,
        contracts: &NativeContracts,
        settings: Settings,
    ) -> Result<Self> {
        let binary = tokio::fs::canonicalize(binary)
            .await
            .context("The bundled CLI executable is unavailable")?;
        let mut command = Command::new(&binary);
        command.arg("app-server").arg("--listen").arg("stdio");
        let workspace = match workspace {
            Some((path, consent_at_ms)) => {
                let path = tokio::fs::canonicalize(path)
                    .await
                    .context("The selected folder is unavailable")?;
                anyhow::ensure!(path.is_dir(), "The selected path must be a folder");
                command
                    .current_dir(&path)
                    .arg("--workspace-consent")
                    .arg(&path)
                    .arg("--workspace-consent-at-ms")
                    .arg(consent_at_ms.to_string());
                Some(path)
            }
            None => {
                command
                    .current_dir(
                        binary
                            .parent()
                            .context("The runtime has no executable directory")?,
                    )
                    .arg("--account-only");
                None
            }
        };
        command
            .env_clear()
            .envs(guarded_environment(
                std::env::vars_os(),
                &contracts.guard_lifting_environment,
            ))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .kill_on_drop(true);
        let mut child = command.spawn().context("The CLI runtime could not start")?;
        let stdin = child.stdin.take().context("Runtime stdin is unavailable")?;
        let stdout = child
            .stdout
            .take()
            .context("Runtime stdout is unavailable")?;
        let mut client =
            DeveloperSessionClient::new(stdout, stdin, settings.client_limits(contracts));
        let handshake = client
            .initialize(AppServerClientInfo {
                name: env!("CARGO_PKG_NAME").to_owned(),
                title: contracts.desktop_name.clone(),
                version: env!("CARGO_PKG_VERSION").to_owned(),
            })
            .await
            .context("The CLI runtime handshake failed")?;
        if workspace.is_some() {
            anyhow::ensure!(
                handshake.capabilities.threads
                    && handshake.capabilities.turns
                    && handshake.capabilities.streaming
                    && handshake.capabilities.approvals
                    && handshake.capabilities.models
                    && handshake.capabilities.reconnect,
                "This runtime lacks required native coding-session capabilities"
            );
        } else {
            anyhow::ensure!(
                handshake.capabilities
                    == (AppServerCapabilities {
                        account: true,
                        account_login_cancel: true,
                        cloud_conversation_update: true,
                        cloud_drafts: true,
                        cloud_projects: true,
                        cloud_project_files: true,
                        cloud_project_uploads: true,
                        cloud_uploads: true,
                        cloud_attachment_recovery: cfg!(unix),
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
                    }),
                "The runtime did not establish an account-only connection"
            );
        }
        let (client, events) = client.into_background(settings.max_pending_requests)?;
        Ok(Self {
            child,
            client,
            events: Some(events),
            workspace,
            settings,
            capabilities: handshake.capabilities,
        })
    }

    pub fn client(&self) -> BackgroundDeveloperSessionClient {
        self.client.clone()
    }

    pub fn capabilities(&self) -> &AppServerCapabilities {
        &self.capabilities
    }

    pub fn take_events(&mut self) -> Option<mpsc::Receiver<DeveloperSessionClientEvent>> {
        self.events.take()
    }

    pub async fn list_sessions(&mut self, cursor: Option<String>) -> Result<ThreadListResponse> {
        let workspace = self
            .workspace
            .as_ref()
            .context("This connection has no coding workspace")?;
        let response = self
            .client
            .request(
                method::THREAD_LIST,
                ThreadListParams {
                    cursor,
                    limit: Some(self.settings.session_page_size),
                    cwd: Some(workspace.to_string_lossy().into_owned()),
                    include_archived: false,
                    include_cloud: false,
                },
            )
            .await?;
        Ok(response)
    }

    pub async fn search_sessions(&mut self, query: String) -> Result<ThreadSearchResponse> {
        anyhow::ensure!(
            self.workspace.is_some(),
            "This connection has no coding workspace"
        );
        let response = self
            .client
            .request(
                method::THREAD_SEARCH,
                ThreadSearchParams {
                    query,
                    limit: Some(self.settings.session_page_size),
                    include_archived: false,
                },
            )
            .await?;
        Ok(response)
    }

    pub async fn read_session(&mut self, thread_id: String) -> Result<ThreadReadResponse> {
        anyhow::ensure!(
            self.workspace.is_some(),
            "This connection has no coding workspace"
        );
        let response = self
            .client
            .request(method::THREAD_READ, ThreadIdParams { thread_id })
            .await?;
        Ok(response)
    }

    pub async fn shutdown(mut self) -> Result<()> {
        let budget = Duration::from_millis(self.settings.shutdown_timeout_ms);
        let result = tokio::time::timeout(budget, async {
            if self.client.is_connected() {
                let result = self
                    .client
                    .request::<AcknowledgedResponse>(method::SHUTDOWN, serde_json::json!({}))
                    .await;
                match result {
                    Ok(response) => anyhow::ensure!(
                        response.acknowledged,
                        "Runtime did not acknowledge shutdown"
                    ),
                    Err(_) if !self.client.is_connected() => {}
                    Err(error) => return Err(error.into()),
                }
            }
            self.child.wait().await?;
            Ok::<_, anyhow::Error>(())
        })
        .await;
        let failure = match result {
            Ok(Ok(())) => return Ok(()),
            Ok(Err(error)) => error,
            Err(error) => error.into(),
        };
        if self.child.try_wait()?.is_none() {
            self.child
                .kill()
                .await
                .context("The runtime could not be stopped")?;
        }
        Err(failure)
    }
}

pub fn consent_timestamp_ms() -> Result<i64> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)?
        .as_millis()
        .try_into()?)
}

fn guarded_environment<'a>(
    environment: impl Iterator<Item = (OsString, OsString)> + 'a,
    blocked: &'a [String],
) -> impl Iterator<Item = (OsString, OsString)> + 'a {
    environment.filter(|(key, _)| {
        !blocked
            .iter()
            .any(|name| key.to_string_lossy().eq_ignore_ascii_case(name))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inherited_environment_cannot_lift_the_runtime_guards() {
        let contracts = NativeContracts::load().unwrap();
        let unsafe_variables = contracts
            .guard_lifting_environment
            .iter()
            .map(|name| (OsString::from(name.to_lowercase()), OsString::from("1")));
        let safe = (OsString::from("PATH"), OsString::from("/usr/bin"));
        let environment = unsafe_variables.chain(std::iter::once(safe.clone()));
        assert_eq!(
            guarded_environment(environment, &contracts.guard_lifting_environment)
                .collect::<Vec<_>>(),
            vec![safe]
        );
    }
}
