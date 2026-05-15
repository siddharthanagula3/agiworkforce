//! Plugin I/O helpers — embedded app-server client lifecycle and fetch wrappers.
//!
//! Each `fetch_plugin_*` method on `App` spawns a Tokio task that calls an
//! `async fn request_plugin_*` helper here, then sends the result back via
//! `AppEventSender`. The helpers start a short-lived `InProcessAppServerClient`,
//! issue a single typed request, and shut it down.

use std::path::PathBuf;
use std::sync::Arc;

use agiworkforce_app_server_client::DEFAULT_IN_PROCESS_CHANNEL_CAPACITY;
use agiworkforce_app_server_client::InProcessAppServerClient;
use agiworkforce_app_server_client::InProcessClientStartArgs;
use agiworkforce_app_server_protocol::ClientRequest;
use agiworkforce_app_server_protocol::ConfigWarningNotification;
use agiworkforce_app_server_protocol::PluginInstallParams;
use agiworkforce_app_server_protocol::PluginInstallResponse;
use agiworkforce_app_server_protocol::PluginListParams;
use agiworkforce_app_server_protocol::PluginListResponse;
use agiworkforce_app_server_protocol::PluginReadParams;
use agiworkforce_app_server_protocol::PluginReadResponse;
use agiworkforce_app_server_protocol::PluginUninstallParams;
use agiworkforce_app_server_protocol::PluginUninstallResponse;
use agiworkforce_app_server_protocol::RequestId;
use agiworkforce_arg0::Arg0DispatchPaths;
use agiworkforce_core::config::Config;
use agiworkforce_core::config_loader::CloudRequirementsLoader;
use agiworkforce_core::config_loader::LoaderOverrides;
use agiworkforce_protocol::protocol::SessionSource;
use agiworkforce_utils_absolute_path::AbsolutePathBuf;
use color_eyre::eyre::Result;
use color_eyre::eyre::WrapErr;
use toml::Value as TomlValue;
use uuid::Uuid;

use crate::app_event::AppEvent;

fn config_warning_notifications(config: &Config) -> Vec<ConfigWarningNotification> {
    config
        .startup_warnings
        .iter()
        .map(|warning| ConfigWarningNotification {
            summary: warning.clone(),
            details: None,
            path: None,
            range: None,
        })
        .collect()
}

async fn start_plugin_request_client(
    arg0_paths: Arg0DispatchPaths,
    config: Config,
    cli_kv_overrides: Vec<(String, TomlValue)>,
    loader_overrides: LoaderOverrides,
    cloud_requirements: CloudRequirementsLoader,
    feedback: agiworkforce_feedback::AgiWorkforceFeedback,
) -> Result<InProcessAppServerClient> {
    InProcessAppServerClient::start(InProcessClientStartArgs {
        arg0_paths,
        config_warnings: config_warning_notifications(&config),
        config: Arc::new(config),
        cli_overrides: cli_kv_overrides,
        loader_overrides,
        cloud_requirements,
        feedback,
        session_source: SessionSource::Cli,
        enable_api_key_env: false,
        client_name: "agiworkforce-tui".to_string(),
        client_version: env!("CARGO_PKG_VERSION").to_string(),
        experimental_api: true,
        opt_out_notification_methods: Vec::new(),
        channel_capacity: DEFAULT_IN_PROCESS_CHANNEL_CAPACITY,
    })
    .await
    .wrap_err("failed to start embedded app server for plugin request")
}

pub(super) async fn request_plugins_list(
    arg0_paths: Arg0DispatchPaths,
    config: Config,
    cli_kv_overrides: Vec<(String, TomlValue)>,
    loader_overrides: LoaderOverrides,
    cloud_requirements: CloudRequirementsLoader,
    feedback: agiworkforce_feedback::AgiWorkforceFeedback,
    cwd: PathBuf,
) -> Result<PluginListResponse> {
    let client = start_plugin_request_client(
        arg0_paths,
        config,
        cli_kv_overrides,
        loader_overrides,
        cloud_requirements,
        feedback,
    )
    .await?;
    let request_handle = client.request_handle();
    let cwd = AbsolutePathBuf::try_from(cwd).wrap_err("plugin list cwd must be absolute")?;
    let request_id = RequestId::String(format!("plugin-list-{}", Uuid::new_v4()));
    let response = request_handle
        .request_typed(ClientRequest::PluginList {
            request_id,
            params: PluginListParams {
                cwds: Some(vec![cwd]),
                force_remote_sync: false,
            },
        })
        .await
        .wrap_err("plugin/list failed in legacy TUI");
    if let Err(err) = client.shutdown().await {
        tracing::warn!(%err, "failed to shut down embedded app server after plugin/list");
    }
    response
}

pub(super) async fn request_plugin_detail(
    arg0_paths: Arg0DispatchPaths,
    config: Config,
    cli_kv_overrides: Vec<(String, TomlValue)>,
    loader_overrides: LoaderOverrides,
    cloud_requirements: CloudRequirementsLoader,
    feedback: agiworkforce_feedback::AgiWorkforceFeedback,
    params: PluginReadParams,
) -> Result<PluginReadResponse> {
    let client = start_plugin_request_client(
        arg0_paths,
        config,
        cli_kv_overrides,
        loader_overrides,
        cloud_requirements,
        feedback,
    )
    .await?;
    let request_handle = client.request_handle();
    let request_id = RequestId::String(format!("plugin-read-{}", Uuid::new_v4()));
    let response = request_handle
        .request_typed(ClientRequest::PluginRead { request_id, params })
        .await
        .wrap_err("plugin/read failed in legacy TUI");
    if let Err(err) = client.shutdown().await {
        tracing::warn!(%err, "failed to shut down embedded app server after plugin/read");
    }
    response
}

pub(super) async fn request_plugin_install(
    arg0_paths: Arg0DispatchPaths,
    config: Config,
    cli_kv_overrides: Vec<(String, TomlValue)>,
    loader_overrides: LoaderOverrides,
    cloud_requirements: CloudRequirementsLoader,
    feedback: agiworkforce_feedback::AgiWorkforceFeedback,
    params: PluginInstallParams,
) -> Result<PluginInstallResponse> {
    let client = start_plugin_request_client(
        arg0_paths,
        config,
        cli_kv_overrides,
        loader_overrides,
        cloud_requirements,
        feedback,
    )
    .await?;
    let request_handle = client.request_handle();
    let request_id = RequestId::String(format!("plugin-install-{}", Uuid::new_v4()));
    let response = request_handle
        .request_typed(ClientRequest::PluginInstall { request_id, params })
        .await
        .wrap_err("plugin/install failed in legacy TUI");
    if let Err(err) = client.shutdown().await {
        tracing::warn!(%err, "failed to shut down embedded app server after plugin/install");
    }
    response
}

pub(super) async fn request_plugin_uninstall(
    arg0_paths: Arg0DispatchPaths,
    config: Config,
    cli_kv_overrides: Vec<(String, TomlValue)>,
    loader_overrides: LoaderOverrides,
    cloud_requirements: CloudRequirementsLoader,
    feedback: agiworkforce_feedback::AgiWorkforceFeedback,
    plugin_id: String,
) -> Result<PluginUninstallResponse> {
    let client = start_plugin_request_client(
        arg0_paths,
        config,
        cli_kv_overrides,
        loader_overrides,
        cloud_requirements,
        feedback,
    )
    .await?;
    let request_handle = client.request_handle();
    let request_id = RequestId::String(format!("plugin-uninstall-{}", Uuid::new_v4()));
    let response = request_handle
        .request_typed(ClientRequest::PluginUninstall {
            request_id,
            params: PluginUninstallParams {
                plugin_id,
                force_remote_sync: false,
            },
        })
        .await
        .wrap_err("plugin/uninstall failed in legacy TUI");
    if let Err(err) = client.shutdown().await {
        tracing::warn!(%err, "failed to shut down embedded app server after plugin/uninstall");
    }
    response
}

impl super::App {
    pub(super) fn fetch_plugins_list(&mut self, cwd: PathBuf) {
        let config = self.config.clone();
        let arg0_paths = self.arg0_paths.clone();
        let cli_kv_overrides = self.cli_kv_overrides.clone();
        let loader_overrides = self.loader_overrides.clone();
        let cloud_requirements = self.cloud_requirements.clone();
        let feedback = self.feedback.clone();
        let app_event_tx = self.app_event_tx.clone();
        tokio::spawn(async move {
            let cwd_for_event = cwd.clone();
            let result = request_plugins_list(
                arg0_paths,
                config,
                cli_kv_overrides,
                loader_overrides,
                cloud_requirements,
                feedback,
                cwd,
            )
            .await
            .map_err(|err| format!("Failed to load plugins: {err}"));
            app_event_tx.send(AppEvent::PluginsLoaded {
                cwd: cwd_for_event,
                result,
            });
        });
    }

    pub(super) fn fetch_plugin_detail(&mut self, cwd: PathBuf, params: PluginReadParams) {
        let config = self.config.clone();
        let arg0_paths = self.arg0_paths.clone();
        let cli_kv_overrides = self.cli_kv_overrides.clone();
        let loader_overrides = self.loader_overrides.clone();
        let cloud_requirements = self.cloud_requirements.clone();
        let feedback = self.feedback.clone();
        let app_event_tx = self.app_event_tx.clone();
        tokio::spawn(async move {
            let cwd_for_event = cwd.clone();
            let result = request_plugin_detail(
                arg0_paths,
                config,
                cli_kv_overrides,
                loader_overrides,
                cloud_requirements,
                feedback,
                params,
            )
            .await
            .map_err(|err| format!("Failed to load plugin details: {err}"));
            app_event_tx.send(AppEvent::PluginDetailLoaded {
                cwd: cwd_for_event,
                result,
            });
        });
    }

    pub(super) fn fetch_plugin_install(
        &mut self,
        cwd: PathBuf,
        marketplace_path: AbsolutePathBuf,
        plugin_name: String,
        plugin_display_name: String,
    ) {
        let config = self.config.clone();
        let arg0_paths = self.arg0_paths.clone();
        let cli_kv_overrides = self.cli_kv_overrides.clone();
        let loader_overrides = self.loader_overrides.clone();
        let cloud_requirements = self.cloud_requirements.clone();
        let feedback = self.feedback.clone();
        let app_event_tx = self.app_event_tx.clone();
        tokio::spawn(async move {
            let cwd_for_event = cwd.clone();
            let marketplace_path_for_event = marketplace_path.clone();
            let plugin_name_for_event = plugin_name.clone();
            let result = request_plugin_install(
                arg0_paths,
                config,
                cli_kv_overrides,
                loader_overrides,
                cloud_requirements,
                feedback,
                PluginInstallParams {
                    marketplace_path,
                    plugin_name,
                    force_remote_sync: false,
                },
            )
            .await
            .map_err(|err| format!("Failed to install plugin: {err}"));
            app_event_tx.send(AppEvent::PluginInstallLoaded {
                cwd: cwd_for_event,
                marketplace_path: marketplace_path_for_event,
                plugin_name: plugin_name_for_event,
                plugin_display_name,
                result,
            });
        });
    }

    pub(super) fn fetch_plugin_uninstall(
        &mut self,
        cwd: PathBuf,
        plugin_id: String,
        plugin_display_name: String,
    ) {
        let config = self.config.clone();
        let arg0_paths = self.arg0_paths.clone();
        let cli_kv_overrides = self.cli_kv_overrides.clone();
        let loader_overrides = self.loader_overrides.clone();
        let cloud_requirements = self.cloud_requirements.clone();
        let feedback = self.feedback.clone();
        let app_event_tx = self.app_event_tx.clone();
        tokio::spawn(async move {
            let cwd_for_event = cwd.clone();
            let plugin_id_for_event = plugin_id.clone();
            let result = request_plugin_uninstall(
                arg0_paths,
                config,
                cli_kv_overrides,
                loader_overrides,
                cloud_requirements,
                feedback,
                plugin_id,
            )
            .await
            .map_err(|err| format!("Failed to uninstall plugin: {err}"));
            app_event_tx.send(AppEvent::PluginUninstallLoaded {
                cwd: cwd_for_event,
                plugin_id: plugin_id_for_event,
                plugin_display_name,
                result,
            });
        });
    }
}
