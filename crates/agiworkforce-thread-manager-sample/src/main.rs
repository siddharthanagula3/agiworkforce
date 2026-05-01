use std::collections::BTreeMap;
use std::collections::HashMap;
use std::io::IsTerminal;
use std::io::Read;
use std::io::Write;
use std::sync::Arc;

use anyhow::Context;
use anyhow::bail;
use clap::Parser;
use agiworkforce_core_api::AbsolutePathBuf;
use agiworkforce_core_api::AltScreenMode;
use agiworkforce_core_api::ApprovalsReviewer;
use agiworkforce_core_api::Arg0DispatchPaths;
use agiworkforce_core_api::AskForApproval;
use agiworkforce_core_api::AuthCredentialsStoreMode;
use agiworkforce_core_api::AuthManager;
use agiworkforce_core_api::AgiworkforceThread;
use agiworkforce_core_api::Config;
use agiworkforce_core_api::ConfigLayerStack;
use agiworkforce_core_api::Constrained;
use agiworkforce_core_api::EnvironmentManager;
use agiworkforce_core_api::EnvironmentManagerArgs;
use agiworkforce_core_api::EventMsg;
use agiworkforce_core_api::ExecServerRuntimePaths;
use agiworkforce_core_api::GhostSnapshotConfig;
use agiworkforce_core_api::History;
use agiworkforce_core_api::MemoriesConfig;
use agiworkforce_core_api::ModelAvailabilityNuxConfig;
use agiworkforce_core_api::MultiAgentV2Config;
use agiworkforce_core_api::NewThread;
use agiworkforce_core_api::Notice;
use agiworkforce_core_api::OAuthCredentialsStoreMode;
use agiworkforce_core_api::OPENAI_PROVIDER_ID;
use agiworkforce_core_api::Op;
use agiworkforce_core_api::OtelConfig;
use agiworkforce_core_api::PermissionProfile;
use agiworkforce_core_api::Permissions;
use agiworkforce_core_api::ProjectConfig;
use agiworkforce_core_api::RealtimeAudioConfig;
use agiworkforce_core_api::RealtimeConfig;
use agiworkforce_core_api::SessionSource;
use agiworkforce_core_api::ShellEnvironmentPolicy;
use agiworkforce_core_api::TerminalResizeReflowConfig;
use agiworkforce_core_api::ThreadManager;
use agiworkforce_core_api::ThreadStoreConfig;
use agiworkforce_core_api::ToolSuggestConfig;
use agiworkforce_core_api::TuiKeymap;
use agiworkforce_core_api::TuiNotificationSettings;
use agiworkforce_core_api::UriBasedFileOpener;
use agiworkforce_core_api::UserInput;
use agiworkforce_core_api::WebSearchMode;
use agiworkforce_core_api::arg0_dispatch_or_else;
use agiworkforce_core_api::built_in_model_providers;
use agiworkforce_core_api::find_agiworkforce_home;
use agiworkforce_core_api::set_default_originator;
use agiworkforce_core_api::thread_store_from_config;

#[derive(Debug, Parser)]
#[command(
    name = "agiworkforce-thread-manager-sample",
    about = "Run one Agiworkforce turn through ThreadManager and print the final assistant output."
)]
struct Args {
    /// Override the model for this run.
    #[arg(long, value_name = "MODEL")]
    model: Option<String>,

    /// Prompt text. If omitted, the prompt is read from piped stdin.
    #[arg(value_name = "PROMPT", num_args = 0.., trailing_var_arg = true)]
    prompt: Vec<String>,
}

fn main() -> anyhow::Result<()> {
    arg0_dispatch_or_else(run_main)
}

async fn run_main(arg0_paths: Arg0DispatchPaths) -> anyhow::Result<()> {
    if let Err(err) = set_default_originator("agiworkforce_thread_manager_sample".to_string()) {
        tracing::warn!("failed to set originator: {err:?}");
    }

    let args = Args::parse();
    let prompt = if args.prompt.is_empty() {
        if std::io::stdin().is_terminal() {
            bail!("no prompt provided; pass a prompt argument or pipe one into stdin");
        }

        let mut prompt = String::new();
        std::io::stdin()
            .read_to_string(&mut prompt)
            .context("read prompt from stdin")?;
        let prompt = prompt.replace("\r\n", "\n").replace('\r', "\n");
        if prompt.trim().is_empty() {
            bail!("no prompt provided via stdin");
        }
        prompt
    } else {
        args.prompt.join(" ")
    };

    let config = new_config(args.model, arg0_paths)?;

    let auth_manager =
        AuthManager::shared_from_config(&config, /*enable_agiworkforce_api_key_env*/ false).await;
    let local_runtime_paths = ExecServerRuntimePaths::from_optional_paths(
        config.agiworkforce_self_exe.clone(),
        config.agiworkforce_linux_sandbox_exe.clone(),
    )?;
    let thread_store = thread_store_from_config(&config);
    let environment_manager =
        Arc::new(EnvironmentManager::new(EnvironmentManagerArgs::new(local_runtime_paths)).await);
    let thread_manager = ThreadManager::new(
        &config,
        auth_manager,
        SessionSource::Exec,
        environment_manager,
        /*analytics_events_client*/ None,
    );

    let NewThread {
        thread_id, thread, ..
    } = thread_manager
        .start_thread(config, thread_store)
        .await
        .context("start Agiworkforce thread")?;

    let turn_output = run_turn(&thread, prompt).await;
    let shutdown_result = thread.shutdown_and_wait().await;
    let _ = thread_manager.remove_thread(&thread_id).await;

    let output = turn_output?;
    shutdown_result.context("shut down Agiworkforce thread")?;

    let mut stdout = std::io::stdout().lock();
    stdout.write_all(output.as_bytes())?;
    if !output.ends_with('\n') {
        stdout.write_all(b"\n")?;
    }

    Ok(())
}

fn new_config(model: Option<String>, arg0_paths: Arg0DispatchPaths) -> anyhow::Result<Config> {
    let agiworkforce_home = find_agiworkforce_home().context("find Agiworkforce home")?;
    let cwd = AbsolutePathBuf::current_dir().context("resolve current directory")?;
    let model_provider_id = OPENAI_PROVIDER_ID.to_string();
    let model_providers = built_in_model_providers(/*openai_base_url*/ None);
    let model_provider = model_providers
        .get(&model_provider_id)
        .context("OpenAI model provider should be available")?
        .clone();

    Ok(Config {
        config_layer_stack: ConfigLayerStack::default(),
        startup_warnings: Vec::new(),
        model,
        service_tier: None,
        review_model: None,
        model_context_window: None,
        model_auto_compact_token_limit: None,
        model_provider_id,
        model_provider,
        personality: None,
        permissions: Permissions {
            approval_policy: Constrained::allow_any(AskForApproval::Never),
            permission_profile: Constrained::allow_any(PermissionProfile::default()),
            network: None,
            allow_login_shell: true,
            shell_environment_policy: ShellEnvironmentPolicy::default(),
            windows_sandbox_mode: None,
            windows_sandbox_private_desktop: true,
        },
        approvals_reviewer: ApprovalsReviewer::User,
        enforce_residency: Constrained::allow_any(/*initial_value*/ None),
        hide_agent_reasoning: false,
        show_raw_agent_reasoning: false,
        user_instructions: None,
        base_instructions: None,
        developer_instructions: None,
        guardian_policy_config: None,
        include_permissions_instructions: false,
        include_apps_instructions: false,
        include_skill_instructions: false,
        include_environment_context: false,
        compact_prompt: None,
        commit_attribution: None,
        notify: None,
        tui_notifications: TuiNotificationSettings::default(),
        animations: true,
        show_tooltips: true,
        model_availability_nux: ModelAvailabilityNuxConfig::default(),
        tui_alternate_screen: AltScreenMode::Auto,
        tui_status_line: None,
        tui_terminal_title: None,
        tui_theme: None,
        terminal_resize_reflow: TerminalResizeReflowConfig::default(),
        tui_keymap: TuiKeymap::default(),
        cwd,
        cli_auth_credentials_store_mode: AuthCredentialsStoreMode::File,
        mcp_servers: Constrained::allow_any(HashMap::new()),
        mcp_oauth_credentials_store_mode: OAuthCredentialsStoreMode::File,
        mcp_oauth_callback_port: None,
        mcp_oauth_callback_url: None,
        model_providers,
        project_doc_max_bytes: 32 * 1024,
        project_doc_fallback_filenames: Vec::new(),
        tool_output_token_limit: None,
        agent_max_threads: Some(6),
        agent_job_max_runtime_seconds: None,
        agent_interrupt_message_enabled: false,
        agent_max_depth: 1,
        agent_roles: BTreeMap::new(),
        memories: MemoriesConfig::default(),
        sqlite_home: agiworkforce_home.to_path_buf(),
        log_dir: agiworkforce_home.join("log").to_path_buf(),
        agiworkforce_home,
        history: History::default(),
        ephemeral: true,
        file_opener: UriBasedFileOpener::VsCode,
        agiworkforce_self_exe: arg0_paths.agiworkforce_self_exe,
        agiworkforce_linux_sandbox_exe: arg0_paths.agiworkforce_linux_sandbox_exe,
        main_execve_wrapper_exe: arg0_paths.main_execve_wrapper_exe,
        zsh_path: None,
        model_reasoning_effort: None,
        plan_mode_reasoning_effort: None,
        model_reasoning_summary: None,
        model_supports_reasoning_summaries: None,
        model_catalog: None,
        model_verbosity: None,
        chatgpt_base_url: "https://chatgpt.com/backend-api/".to_string(),
        apps_mcp_path_override: None,
        realtime_audio: RealtimeAudioConfig::default(),
        experimental_realtime_ws_base_url: None,
        experimental_realtime_ws_model: None,
        realtime: RealtimeConfig::default(),
        experimental_realtime_ws_backend_prompt: None,
        experimental_realtime_ws_startup_context: None,
        experimental_realtime_start_instructions: None,
        experimental_thread_config_endpoint: None,
        experimental_thread_store: ThreadStoreConfig::Local,
        forced_chatgpt_workspace_id: None,
        forced_login_method: None,
        include_apply_patch_tool: false,
        web_search_mode: Constrained::allow_any(WebSearchMode::Disabled),
        web_search_config: None,
        use_experimental_unified_exec_tool: false,
        background_terminal_max_timeout: 300_000,
        ghost_snapshot: GhostSnapshotConfig::default(),
        multi_agent_v2: MultiAgentV2Config::default(),
        features: Default::default(),
        suppress_unstable_features_warning: false,
        active_profile: None,
        active_project: ProjectConfig { trust_level: None },
        windows_wsl_setup_acknowledged: false,
        notices: Notice::default(),
        check_for_update_on_startup: false,
        disable_paste_burst: false,
        analytics_enabled: Some(false),
        feedback_enabled: false,
        tool_suggest: ToolSuggestConfig::default(),
        otel: OtelConfig::default(),
    })
}

async fn run_turn(thread: &AgiworkforceThread, prompt: String) -> anyhow::Result<String> {
    thread
        .submit(Op::UserInput {
            items: vec![UserInput::Text {
                text: prompt,
                text_elements: Vec::new(),
            }],
            environments: None,
            final_output_json_schema: None,
            responsesapi_client_metadata: None,
        })
        .await
        .context("submit user input")?;

    let mut last_agent_message = String::new();
    loop {
        let event = thread.next_event().await.context("read Agiworkforce event")?;
        match event.msg {
            EventMsg::TurnComplete(event) => {
                return Ok(event.last_agent_message.unwrap_or(last_agent_message));
            }
            EventMsg::AgentMessage(event) => {
                last_agent_message = event.message;
            }
            EventMsg::Error(event) => {
                bail!(event.message);
            }
            EventMsg::TurnAborted(_) => {
                bail!("turn aborted");
            }
            EventMsg::ExecApprovalRequest(_) => {
                bail!("turn requested exec approval");
            }
            EventMsg::ApplyPatchApprovalRequest(_) => {
                bail!("turn requested patch approval");
            }
            EventMsg::RequestPermissions(_) => {
                bail!("turn requested permissions");
            }
            EventMsg::RequestUserInput(_) => {
                bail!("turn requested user input");
            }
            EventMsg::DynamicToolCallRequest(_) => {
                bail!("turn requested a dynamic tool call");
            }
            _ => {}
        }
    }
}
