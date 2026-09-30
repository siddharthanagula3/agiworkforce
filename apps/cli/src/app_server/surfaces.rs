//! Workspace surfaces the CLI and an editor client read from one place.
//!
//! Instructions, skills, plugins, MCP servers, hooks, settings and slash
//! commands all resolve through the same CLI code the terminal uses, so the two
//! surfaces cannot drift into describing different state.

use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_command_registry::{CommandSource, RegistryCommand};
use agiworkforce_protocol::developer_session::{
    CommandSourceKind, ContextInstructionsResponse, DeveloperAgentMode, DeveloperReasoningEffort,
    HookAddParams, HookConfigScope, HookListResponse, HookRemoveParams, HookSummary,
    InstructionFile, InstructionFileKind, LocalModelProvider, LocalServerHealth, LocalServerStatus,
    McpAddParams, McpPromptArgumentSummary, McpPromptSummary, McpRemoteTransport,
    McpResourceSummary, McpServerConfiguredStatus, McpServerInspectResponse, McpServerListResponse,
    McpServerParams, McpServerScope, McpServerSummary, McpServerTestResponse,
    McpServerToolsResponse, McpToolSummary, MemoryAddParams, MemoryAddResponse, MemoryScope,
    PermissionRule, PermissionRuleDecision, PermissionRuleKind, PermissionRulesResponse,
    PermissionsAddParams, PermissionsListResponse, PluginInstallParams, PluginListResponse,
    PluginRemoveParams, PluginScope, PluginSummary, PluginUpdateResponse, ProviderKeySummary,
    ProvidersListResponse, SavedPermission, SavedPermissionDecision, SavedPermissionKind,
    SettingsReadResponse, SettingsWriteParams, SkillCatalogScope, SkillConsentResponse,
    SkillInstallParams, SkillListResponse, SkillRemoveParams, SkillSummary,
    SlashCommandListResponse, SlashCommandResultKind, SlashCommandRunResponse, SlashCommandSummary,
    TrustListResponse, TrustedFolder,
};
use std::path::{Path, PathBuf};

use crate::command_registry::registry_from_builtins_skills_and_prompts;
use crate::config::CliConfig;
use crate::features::hooks::hooks;
use crate::local_models::{LocalProbeHealth, LocalProviderProbe};
use crate::mcp::{McpCredentialState, McpServerOrigin};
use crate::memory::{MemoryManager, MemoryTier};
use crate::plugins::PluginsManager;
use crate::skills::{self, SkillOrigin};

/// Slash commands `commands/run` can execute with no terminal attached.
///
/// Every other command needs a live TUI or a thread, so it is listed with
/// `runnable: false` rather than offered as a control that does nothing.
const RUNNABLE_COMMANDS: [&str; 6] = ["skills", "plugins", "mcp", "hooks", "settings", "model"];

const MAX_MEMORY_TEXT_CHARS: usize = 4_000;

fn invalid(message: impl Into<String>) -> DeveloperSessionHostError {
    DeveloperSessionHostError::invalid_request(message)
}

fn internal(error: impl std::fmt::Display) -> DeveloperSessionHostError {
    DeveloperSessionHostError::internal(error.to_string())
}

fn display(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

fn instruction_kind(path: &Path) -> Option<InstructionFileKind> {
    match path.file_name().and_then(|name| name.to_str())? {
        "AGENTS.md" => Some(InstructionFileKind::Agents),
        "CLAUDE.md" => Some(InstructionFileKind::Claude),
        "instructions.md" => Some(InstructionFileKind::AgiInstructions),
        _ => None,
    }
}

/// The instruction files a turn in `cwd` loads, in load order.
pub fn context_instructions(cwd: &Path) -> ContextInstructionsResponse {
    let (sources, truncated) = crate::compaction::instruction_sources(cwd);
    let files = sources
        .into_iter()
        .filter_map(|source| {
            Some(InstructionFile {
                kind: instruction_kind(&source.path)?,
                bytes: u32::try_from(source.content.len()).unwrap_or(u32::MAX),
                root: display(&source.dir),
                path: display(&source.path),
            })
        })
        .collect();

    ContextInstructionsResponse {
        files,
        project_root: crate::compaction::find_project_root(cwd)
            .as_deref()
            .map(display),
        truncated,
    }
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

fn skill_scope(origin: SkillOrigin) -> SkillCatalogScope {
    match origin {
        SkillOrigin::Project => SkillCatalogScope::Project,
        SkillOrigin::User => SkillCatalogScope::User,
        SkillOrigin::Plugin => SkillCatalogScope::Plugin,
    }
}

pub fn list_skills(workspace_root: &Path) -> SkillListResponse {
    let available_tools: Vec<String> = crate::runtime::tool_catalog::all_builtin_tool_definitions()
        .into_iter()
        .map(|definition| definition.name)
        .collect();
    let skills = skills::skill_catalog(workspace_root)
        .into_iter()
        .map(|entry| SkillSummary {
            missing_tools: skills::missing_tool_dependencies(&entry.skill, &available_tools),
            missing_env_vars: entry.skill.check_env_deps().err().unwrap_or_default(),
            required_tools: entry.skill.required_tools.clone(),
            required_env_vars: entry.skill.required_env_vars.clone(),
            name: entry.skill.name,
            description: entry.skill.description,
            scope: skill_scope(entry.origin),
            path: display(&entry.skill.path),
            enabled: entry.enabled,
            consented: entry.consented,
        })
        .collect();
    SkillListResponse { skills }
}

pub fn set_skill_enabled(
    workspace_root: &Path,
    name: &str,
    enabled: bool,
) -> Result<SkillListResponse, DeveloperSessionHostError> {
    let catalog = list_skills(workspace_root);
    if !catalog.skills.iter().any(|skill| skill.name == name) {
        return Err(DeveloperSessionHostError::not_found(format!(
            "No skill named '{name}' is installed for this workspace"
        )));
    }
    skills::set_skill_enabled(name, enabled).map_err(internal)?;
    Ok(list_skills(workspace_root))
}

pub fn project_skills_dir(workspace_root: &Path) -> PathBuf {
    workspace_root.join(".agiworkforce").join("skills")
}

pub fn set_skill_consent(
    workspace_root: &Path,
    granted: bool,
) -> Result<SkillConsentResponse, DeveloperSessionHostError> {
    let dir = project_skills_dir(workspace_root);
    if granted {
        if !dir.exists() {
            return Err(DeveloperSessionHostError::not_found(format!(
                "This workspace has no project skills at {}",
                display(&dir)
            )));
        }
        skills::grant_project_skills_consent(&dir).map_err(internal)?;
    } else {
        skills::revoke_project_skills_consent(&dir).map_err(internal)?;
    }
    Ok(SkillConsentResponse {
        consented: skills::project_skills_consent_recorded(&dir),
        path: display(&skills::project_skills_consent_path(&dir)),
    })
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

pub fn list_plugins(workspace_root: &Path) -> PluginListResponse {
    let mut manager = PluginsManager::new();
    if manager.load_all(Some(workspace_root)).is_err() {
        return PluginListResponse {
            plugins: Vec::new(),
            notices: Vec::new(),
        };
    }
    let installed = crate::marketplace::InstalledPlugins::load(manager.global_dir());

    let mut plugins: Vec<PluginSummary> = manager
        .plugins()
        .iter()
        .map(|plugin| PluginSummary {
            name: plugin
                .manifest_name
                .clone()
                .unwrap_or_else(|| plugin.config_name.clone()),
            version: installed
                .plugins
                .get(&plugin.config_name)
                .map(|entry| entry.version.clone()),
            enabled: plugin.enabled,
            source: if plugin.from_project_dir {
                PluginScope::Project
            } else {
                PluginScope::User
            },
            path: display(&plugin.root),
            format: plugin.format.map(|format| format.short_tag().to_string()),
            id: plugin.config_name.clone(),
        })
        .collect();
    plugins.sort_by(|left, right| left.id.cmp(&right.id));
    PluginListResponse {
        plugins,
        notices: Vec::new(),
    }
}

pub fn set_plugin_enabled(
    workspace_root: &Path,
    id: &str,
    enabled: bool,
) -> Result<PluginListResponse, DeveloperSessionHostError> {
    let catalog = list_plugins(workspace_root);
    if !catalog.plugins.iter().any(|plugin| plugin.id == id) {
        return Err(DeveloperSessionHostError::not_found(format!(
            "No plugin named '{id}' is installed"
        )));
    }
    crate::plugins::set_plugin_enabled(id, enabled).map_err(internal)?;
    Ok(list_plugins(workspace_root))
}

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

fn mcp_scope(origin: McpServerOrigin) -> McpServerScope {
    match origin {
        McpServerOrigin::Project => McpServerScope::Project,
        McpServerOrigin::User => McpServerScope::User,
        McpServerOrigin::Plugin => McpServerScope::Plugin,
    }
}

fn mcp_status(state: McpCredentialState) -> McpServerConfiguredStatus {
    match state {
        McpCredentialState::Configured => McpServerConfiguredStatus::Configured,
        McpCredentialState::Authorized => McpServerConfiguredStatus::Authorized,
        McpCredentialState::NeedsAuth => McpServerConfiguredStatus::NeedsAuth,
    }
}

pub fn list_mcp_servers(workspace_root: &Path) -> McpServerListResponse {
    let servers = crate::mcp::discover_servers(workspace_root)
        .into_iter()
        .map(|server| {
            let policy_refusal = crate::mcp::policy_refusal(&server.name, &server.config);
            McpServerSummary {
                transport: server.config.transport_kind().to_string(),
                scope: mcp_scope(server.origin),
                status: if policy_refusal.is_some() {
                    McpServerConfiguredStatus::Blocked
                } else {
                    mcp_status(server.credential)
                },
                policy_refusal,
                url: server.url,
                name: server.name,
            }
        })
        .collect();
    McpServerListResponse { servers }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

fn hook_command_text(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::String(command) => Some(command.clone()),
        serde_json::Value::Object(fields) => fields
            .get("command")
            .and_then(|command| command.as_str())
            .map(str::to_string),
        _ => None,
    }
}

pub fn list_hooks(workspace_root: &Path) -> HookListResponse {
    let mut summaries = Vec::new();

    let user_hooks = hooks::read_user_hooks_file().unwrap_or_default();
    let mut events: Vec<&String> = user_hooks.hooks.keys().collect();
    events.sort();
    for event in events {
        for (index, hook) in user_hooks.hooks[event].iter().enumerate() {
            summaries.push(HookSummary {
                event: event.clone(),
                command: hook.command.clone(),
                scope: HookConfigScope::User,
                trusted: true,
                source: hooks::hooks_path().ok().as_deref().map(display),
                position: u32::try_from(index + 1).ok(),
            });
        }
    }

    let mut manager = PluginsManager::new();
    if manager.load_all(Some(workspace_root)).is_ok() {
        for (event, values, from_project_dir) in manager.hook_configs_with_trust() {
            for value in values {
                let Some(command) = hook_command_text(&value) else {
                    continue;
                };
                summaries.push(HookSummary {
                    event: event.clone(),
                    command,
                    scope: HookConfigScope::Plugin,
                    trusted: !from_project_dir,
                    source: None,
                    position: None,
                });
            }
        }
    }

    HookListResponse { hooks: summaries }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

fn user_instructions_path() -> Result<PathBuf, DeveloperSessionHostError> {
    Ok(CliConfig::config_dir()
        .map_err(internal)?
        .join("instructions.md"))
}

fn project_instructions_path(workspace_root: &Path) -> PathBuf {
    workspace_root.join(".agiworkforce").join("instructions.md")
}

fn read_instruction_file(path: &Path) -> Option<String> {
    std::fs::read_to_string(path).ok()
}

fn effort_from_config(raw: &str) -> Option<DeveloperReasoningEffort> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "low" => Some(DeveloperReasoningEffort::Low),
        "medium" => Some(DeveloperReasoningEffort::Medium),
        "high" => Some(DeveloperReasoningEffort::High),
        "max" => Some(DeveloperReasoningEffort::Max),
        _ => None,
    }
}

fn effort_to_config(effort: DeveloperReasoningEffort) -> &'static str {
    match effort {
        DeveloperReasoningEffort::Low => "low",
        DeveloperReasoningEffort::Medium => "medium",
        DeveloperReasoningEffort::High => "high",
        DeveloperReasoningEffort::Max => "max",
    }
}

fn permission_mode_from_config(raw: &str) -> Option<DeveloperAgentMode> {
    match raw
        .trim()
        .to_ascii_lowercase()
        .replace(['-', '_'], "")
        .as_str()
    {
        "default" | "ask" => Some(DeveloperAgentMode::Ask),
        "plan" => Some(DeveloperAgentMode::Plan),
        "acceptedits" | "auto" => Some(DeveloperAgentMode::Auto),
        _ => None,
    }
}

fn permission_mode_to_config(
    mode: DeveloperAgentMode,
) -> Result<&'static str, DeveloperSessionHostError> {
    match mode {
        DeveloperAgentMode::Ask => Ok("default"),
        DeveloperAgentMode::Plan => Ok("plan"),
        DeveloperAgentMode::Auto => Ok("acceptEdits"),
        DeveloperAgentMode::Bypass => Err(invalid(
            "bypass cannot be stored as a default: a saved setting must not disable every approval on a machine whose owner never chose it. Send agentMode: bypass on the turn instead",
        )),
    }
}

pub fn read_settings(
    workspace_root: &Path,
) -> Result<SettingsReadResponse, DeveloperSessionHostError> {
    let config = CliConfig::load().map_err(internal)?;
    let user_path = user_instructions_path()?;
    let project_path = project_instructions_path(workspace_root);

    Ok(SettingsReadResponse {
        default_model: Some(config.default.model.clone()),
        default_effort: config
            .default
            .reasoning_effort
            .as_deref()
            .and_then(effort_from_config),
        permission_mode: config
            .default
            .permission_mode
            .as_deref()
            .and_then(permission_mode_from_config),
        user_instructions: read_instruction_file(&user_path),
        project_instructions: read_instruction_file(&project_path),
        user_instructions_path: display(&user_path),
        project_instructions_path: display(&project_path),
        config_path: CliConfig::config_path()
            .map(|path| display(&path))
            .map_err(internal)?,
    })
}

fn write_instruction_file(path: &Path, contents: &str) -> Result<(), DeveloperSessionHostError> {
    if contents.is_empty() {
        return match std::fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(internal(error)),
        };
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(internal)?;
    }
    std::fs::write(path, contents).map_err(internal)
}

pub fn write_settings(
    workspace_root: &Path,
    params: SettingsWriteParams,
) -> Result<SettingsReadResponse, DeveloperSessionHostError> {
    let mut config = CliConfig::load().map_err(internal)?;
    let mut config_changed = false;

    if let Some(model) = params.default_model.as_deref() {
        let model = model.trim();
        if model.is_empty() {
            return Err(invalid("defaultModel cannot be empty"));
        }
        if crate::model_catalog::find(model).is_none() {
            return Err(invalid(format!(
                "'{model}' is not in this build's model catalog"
            )));
        }
        config.default.model = model.to_string();
        config_changed = true;
    }

    if let Some(effort) = params.default_effort {
        config.default.reasoning_effort = Some(effort_to_config(effort).to_string());
        config_changed = true;
    }

    if let Some(mode) = params.permission_mode {
        config.default.permission_mode = Some(permission_mode_to_config(mode)?.to_string());
        config_changed = true;
    }

    if config_changed {
        config.save().map_err(internal)?;
    }

    if let Some(contents) = params.user_instructions.as_deref() {
        write_instruction_file(&user_instructions_path()?, contents)?;
    }
    if let Some(contents) = params.project_instructions.as_deref() {
        write_instruction_file(&project_instructions_path(workspace_root), contents)?;
    }

    read_settings(workspace_root)
}

// ---------------------------------------------------------------------------
// Slash commands
// ---------------------------------------------------------------------------

fn command_source(command: &RegistryCommand) -> CommandSourceKind {
    match command.source {
        CommandSource::Builtin => CommandSourceKind::Builtin,
        CommandSource::Plugin => CommandSourceKind::Plugin,
        CommandSource::Mcp => CommandSourceKind::Mcp,
        CommandSource::User
        | CommandSource::Project
        | CommandSource::Bundled
        | CommandSource::Managed => {
            if command.loaded_from.as_deref() == Some("skills") {
                CommandSourceKind::Skill
            } else {
                CommandSourceKind::Prompt
            }
        }
    }
}

pub fn list_commands(workspace_root: &Path) -> SlashCommandListResponse {
    let catalog: Vec<crate::skills::Skill> = skills::skill_catalog(workspace_root)
        .into_iter()
        .filter(|entry| entry.enabled)
        .map(|entry| entry.skill)
        .collect();
    let registry = registry_from_builtins_skills_and_prompts(&catalog, &[]);
    let custom: std::collections::HashSet<String> =
        crate::custom_commands::discover_custom_slash_commands()
            .into_iter()
            .map(|command| command.name.to_ascii_lowercase())
            .collect();

    let mut commands: Vec<SlashCommandSummary> = registry
        .commands()
        .iter()
        .filter(|command| command.user_invocable)
        .map(|command| {
            let source = command_source(command);
            SlashCommandSummary {
                name: command.name.clone(),
                description: command.description.clone(),
                args_hint: command.argument_hint.clone(),
                source,
                aliases: command.aliases.clone(),
                runnable: RUNNABLE_COMMANDS.contains(&command.name.as_str()),
                prompt: source == CommandSourceKind::Skill
                    || custom.contains(&command.name.to_ascii_lowercase())
                    || command.name == SEARCH_COMMAND
                    || BUILTIN_PROMPTS
                        .iter()
                        .any(|(name, _)| *name == command.name.as_str()),
            }
        })
        .collect();
    commands.sort_by(|left, right| left.name.cmp(&right.name));
    SlashCommandListResponse { commands }
}

fn structured(
    kind: SlashCommandResultKind,
    text: String,
    payload: impl serde::Serialize,
) -> Result<SlashCommandRunResponse, DeveloperSessionHostError> {
    Ok(SlashCommandRunResponse {
        kind,
        text,
        payload: Some(serde_json::to_value(payload).map_err(internal)?),
    })
}

pub fn run_command(
    workspace_root: &Path,
    name: &str,
    args: Option<&str>,
) -> Result<SlashCommandRunResponse, DeveloperSessionHostError> {
    let name = name.trim().trim_start_matches('/');
    let args = args.map(str::trim).filter(|value| !value.is_empty());
    if args.is_some() {
        return Err(invalid(format!(
            "'{name}' takes no arguments over the app server; use the typed method for changes"
        )));
    }

    match name {
        "skills" => {
            let skills = list_skills(workspace_root);
            let text = skills
                .skills
                .iter()
                .map(|skill| format!("{}: {}", skill.name, skill.description))
                .collect::<Vec<_>>()
                .join("\n");
            structured(SlashCommandResultKind::Skills, text, skills)
        }
        "plugins" => {
            let plugins = list_plugins(workspace_root);
            let text = plugins
                .plugins
                .iter()
                .map(|plugin| {
                    format!(
                        "{} ({})",
                        plugin.name,
                        if plugin.enabled { "enabled" } else { "disabled" }
                    )
                })
                .collect::<Vec<_>>()
                .join("\n");
            structured(SlashCommandResultKind::Plugins, text, plugins)
        }
        "mcp" => {
            let servers = list_mcp_servers(workspace_root);
            let text = servers
                .servers
                .iter()
                .map(|server| match &server.policy_refusal {
                    Some(reason) => format!("{} (blocked): {reason}", server.name),
                    None => format!("{} ({})", server.name, server.transport),
                })
                .collect::<Vec<_>>()
                .join("\n");
            structured(SlashCommandResultKind::Mcp, text, servers)
        }
        "hooks" => {
            let listed = list_hooks(workspace_root);
            let text = hooks::format_hooks_list(&hooks::load_hooks_or_default());
            structured(SlashCommandResultKind::Hooks, text, listed)
        }
        "settings" | "model" => {
            let settings = read_settings(workspace_root)?;
            let text = settings
                .default_model
                .clone()
                .unwrap_or_else(|| "no default model configured".to_string());
            structured(SlashCommandResultKind::Settings, text, settings)
        }
        other => Err(DeveloperSessionHostError::not_found(format!(
            "'{other}' needs a terminal or a thread; call the typed method for it, or run it in `agi`"
        ))),
    }
}

async fn startable_server(
    workspace_root: &Path,
    name: &str,
) -> Result<crate::mcp::DiscoveredMcpServer, DeveloperSessionHostError> {
    let server = crate::mcp::discover_servers(workspace_root)
        .into_iter()
        .find(|server| server.name == name)
        .ok_or_else(|| {
            DeveloperSessionHostError::not_found(format!(
                "No MCP server named '{name}' is configured for this workspace"
            ))
        })?;
    if server.origin == McpServerOrigin::Project
        && !crate::trust::restrictions_for(workspace_root).mcp_autostart
    {
        return Err(DeveloperSessionHostError::conflict(format!(
            "'{name}' comes from this workspace's .mcp.json, and project servers start only once the workspace is trusted. Run /trust grant in agi, then try again."
        )));
    }
    if let Some(reason) =
        crate::cloud::workspace_policy::mcp_server_refusal(&server.name, server.url.as_deref())
            .await
    {
        return Err(DeveloperSessionHostError::conflict(reason));
    }
    Ok(server)
}

fn elapsed_ms(started: std::time::Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

pub async fn test_mcp_server(
    workspace_root: &Path,
    name: &str,
    limit: std::time::Duration,
) -> Result<McpServerTestResponse, DeveloperSessionHostError> {
    let server = startable_server(workspace_root, name).await?;
    let started = std::time::Instant::now();
    let outcome = tokio::time::timeout(limit, async {
        let mut connection =
            crate::mcp::McpConnection::connect(&server.name, &server.config).await?;
        let tools = connection.list_tools().await;
        let _ = connection.shutdown().await;
        tools
    })
    .await;
    let (connected, tool_count, error) = match outcome {
        Ok(Ok(tools)) => (true, u32::try_from(tools.len()).unwrap_or(u32::MAX), None),
        Ok(Err(error)) => (false, 0, Some(format!("{error:#}"))),
        Err(_) => (
            false,
            0,
            Some(format!(
                "it did not answer within {} seconds",
                limit.as_secs()
            )),
        ),
    };
    Ok(McpServerTestResponse {
        name: server.name,
        connected,
        elapsed_ms: elapsed_ms(started),
        tool_count,
        error,
    })
}

pub async fn inspect_connection(
    name: &str,
    connection: &mut crate::mcp::McpConnection,
    live: bool,
) -> McpServerInspectResponse {
    let responding = connection.responding().await;
    let negotiated = connection.negotiated();
    let mut capabilities: Vec<String> = negotiated
        .capabilities
        .as_object()
        .map(|advertised| advertised.keys().cloned().collect())
        .unwrap_or_default();
    capabilities.sort();
    let protocol_version =
        Some(negotiated.protocol_version.clone()).filter(|version| !version.is_empty());
    let server_name = negotiated
        .server_info
        .as_ref()
        .map(|info| info.name.clone());
    let server_version = negotiated
        .server_info
        .as_ref()
        .map(|info| info.version.clone());
    let instructions = negotiated.instructions.clone();
    McpServerInspectResponse {
        name: name.to_string(),
        connected: true,
        live,
        responding,
        protocol_version,
        server_name,
        server_version,
        capabilities,
        instructions,
        logs: connection.recent_logs(),
        error: None,
    }
}

pub async fn inspect_mcp_server(
    workspace_root: &Path,
    name: &str,
    limit: std::time::Duration,
) -> Result<McpServerInspectResponse, DeveloperSessionHostError> {
    let server = startable_server(workspace_root, name).await?;
    let outcome = tokio::time::timeout(limit, async {
        let mut connection =
            crate::mcp::McpConnection::connect(&server.name, &server.config).await?;
        let report = inspect_connection(&server.name, &mut connection, false).await;
        let _ = connection.shutdown().await;
        anyhow::Ok(report)
    })
    .await;
    let error = match outcome {
        Ok(Ok(report)) => return Ok(report),
        Ok(Err(error)) => format!("{error:#}"),
        Err(_) => format!("it did not answer within {} seconds", limit.as_secs()),
    };
    Ok(McpServerInspectResponse {
        name: server.name,
        connected: false,
        live: false,
        responding: false,
        protocol_version: None,
        server_name: None,
        server_version: None,
        capabilities: Vec::new(),
        instructions: None,
        logs: Vec::new(),
        error: Some(error),
    })
}

pub async fn mcp_server_tools(
    workspace_root: &Path,
    name: &str,
    limit: std::time::Duration,
) -> Result<McpServerToolsResponse, DeveloperSessionHostError> {
    let server = startable_server(workspace_root, name).await?;
    let listed = tokio::time::timeout(limit, async {
        let mut connection =
            crate::mcp::McpConnection::connect(&server.name, &server.config).await?;
        let tools = connection.list_tools().await;
        let prompts = connection.list_prompts().await;
        let resources = if connection.serves_resources() {
            Some(connection.list_resources().await)
        } else {
            None
        };
        let _ = connection.shutdown().await;
        anyhow::Ok((tools?, prompts, resources))
    })
    .await
    .map_err(|_| {
        DeveloperSessionHostError::unavailable(format!(
            "MCP server '{name}' did not answer within {} seconds",
            limit.as_secs()
        ))
    })?
    .map_err(|error| {
        DeveloperSessionHostError::unavailable(format!("MCP server '{name}': {error:#}"))
    })?;
    let (tools, prompts, resources) = listed;
    let mut warnings = Vec::new();
    let prompts = match prompts {
        Ok(prompts) => prompts,
        Err(error) => {
            warnings.push(format!("Its prompts could not be listed: {error:#}"));
            Vec::new()
        }
    };
    let resources = match resources {
        Some(Ok(resources)) => resources,
        Some(Err(error)) => {
            warnings.push(format!("Its resources could not be listed: {error:#}"));
            Vec::new()
        }
        None => Vec::new(),
    };
    Ok(McpServerToolsResponse {
        name: server.name,
        tools: tools
            .into_iter()
            .map(|tool| McpToolSummary {
                name: tool.original_name,
                description: tool.description,
                input_schema: tool.input_schema,
            })
            .collect(),
        prompts: prompts
            .into_iter()
            .map(|prompt| McpPromptSummary {
                name: prompt.original_name,
                description: prompt.description,
                arguments: prompt
                    .arguments
                    .into_iter()
                    .map(|argument| McpPromptArgumentSummary {
                        name: argument.name,
                        description: argument.description,
                        required: argument.required,
                    })
                    .collect(),
            })
            .collect(),
        resources: resources
            .into_iter()
            .map(|resource| McpResourceSummary {
                uri: resource.uri,
                name: resource.title.unwrap_or(resource.name),
                description: resource.description,
                mime_type: resource.mime_type,
            })
            .collect(),
        warnings,
    })
}

pub fn install_skill(
    workspace_root: &Path,
    params: SkillInstallParams,
) -> Result<SkillListResponse, DeveloperSessionHostError> {
    let source = crate::path_security::expand_home(params.source.trim());
    skills::import_skill(Path::new(&source)).map_err(invalid)?;
    Ok(list_skills(workspace_root))
}

pub fn remove_skill(
    workspace_root: &Path,
    params: SkillRemoveParams,
) -> Result<SkillListResponse, DeveloperSessionHostError> {
    crate::installs::remove_skill(workspace_root, params.name.trim())
        .map_err(|error| invalid(format!("{error:#}")))?;
    Ok(list_skills(workspace_root))
}

pub fn install_plugin(
    workspace_root: &Path,
    params: PluginInstallParams,
) -> Result<PluginListResponse, DeveloperSessionHostError> {
    use crate::features::plugins::plugins::{
        PluginInstallOutcome, PluginIntegrity, PluginSignaturePolicy,
    };
    let integrity = match params.integrity.as_deref().map(str::trim) {
        Some(claim) if claim.starts_with("sha256:") => {
            PluginIntegrity::PinnedSha256(claim.to_string())
        }
        Some(claim) => {
            return Err(invalid(format!(
                "Unsupported integrity claim '{claim}'; use sha256:<hex>"
            )))
        }
        None => PluginIntegrity::PublisherSignature,
    };
    let signature = PluginSignaturePolicy::configured(false).map_err(invalid)?;
    match crate::installs::install_plugin(
        params.source.trim(),
        params.name.as_deref(),
        integrity,
        signature,
        None,
    )
    .map_err(invalid)?
    {
        PluginInstallOutcome::Installed { .. } | PluginInstallOutcome::AlreadyInstalled { .. } => {
            Ok(list_plugins(workspace_root))
        }
        PluginInstallOutcome::Failed { error } => Err(invalid(error)),
    }
}

pub fn update_plugin(
    workspace_root: &Path,
    params: PluginRemoveParams,
) -> Result<PluginUpdateResponse, DeveloperSessionHostError> {
    let plugin = list_plugins(workspace_root)
        .plugins
        .into_iter()
        .find(|plugin| plugin.id == params.id)
        .ok_or_else(|| {
            DeveloperSessionHostError::not_found(format!("No plugin '{}' is installed", params.id))
        })?;
    if plugin.source == PluginScope::Project {
        return Err(DeveloperSessionHostError::conflict(format!(
            "'{}' comes from this workspace's plugin folder; update it in the repository instead",
            plugin.id
        )));
    }
    let updated = crate::installs::update_plugin(&plugin.id)
        .map_err(|error| invalid(format!("{error:#}")))?;
    let (was_updated, version, changed_files) = match updated.update {
        crate::marketplace::PluginCheckoutUpdate::UpToDate => (false, plugin.version, Vec::new()),
        crate::marketplace::PluginCheckoutUpdate::Updated {
            version,
            changed_files,
            ..
        } => (true, Some(version), changed_files),
    };
    Ok(PluginUpdateResponse {
        id: plugin.id,
        updated: was_updated,
        previous_version: updated.previous_version,
        version,
        changed_files,
        plugins: list_plugins(workspace_root).plugins,
    })
}

pub fn remove_plugin(
    workspace_root: &Path,
    params: PluginRemoveParams,
) -> Result<PluginListResponse, DeveloperSessionHostError> {
    let plugin = list_plugins(workspace_root)
        .plugins
        .into_iter()
        .find(|plugin| plugin.id == params.id)
        .ok_or_else(|| {
            DeveloperSessionHostError::not_found(format!("No plugin '{}' is installed", params.id))
        })?;
    if plugin.source == PluginScope::Project {
        return Err(DeveloperSessionHostError::conflict(format!(
            "'{}' comes from this workspace's plugin folder; remove it from the repository instead",
            plugin.id
        )));
    }
    crate::installs::remove_plugin(&plugin.id).map_err(|error| invalid(format!("{error:#}")))?;
    Ok(list_plugins(workspace_root))
}

pub fn add_mcp_server(
    workspace_root: &Path,
    params: McpAddParams,
) -> Result<McpServerListResponse, DeveloperSessionHostError> {
    let target = match (params.command, params.url) {
        (Some(command), None) => crate::installs::McpServerTarget::Stdio {
            command,
            args: params.args,
        },
        (None, Some(url)) => crate::installs::McpServerTarget::Remote {
            url,
            sse: params.transport == Some(McpRemoteTransport::Sse),
        },
        _ => {
            return Err(invalid(
                "mcp/add takes a command for a local server or a url for a remote one",
            ))
        }
    };
    let pairs = |map: std::collections::BTreeMap<String, String>| {
        map.into_iter()
            .map(|(key, value)| (key.trim().to_string(), value))
            .collect::<Vec<_>>()
    };
    let env = pairs(params.env);
    let headers = pairs(params.headers);
    if env
        .iter()
        .chain(headers.iter())
        .any(|(key, _)| key.is_empty())
    {
        return Err(invalid("An environment variable or header needs a name"));
    }
    crate::installs::add_mcp_server(&crate::installs::McpServerSpec {
        name: params.name.trim().to_string(),
        target,
        env,
        headers,
        overwrite: params.overwrite,
    })
    .map_err(|error| invalid(format!("{error:#}")))?;
    Ok(list_mcp_servers(workspace_root))
}

pub fn remove_mcp_server(
    workspace_root: &Path,
    params: McpServerParams,
) -> Result<McpServerListResponse, DeveloperSessionHostError> {
    let server = crate::mcp::discover_servers(workspace_root)
        .into_iter()
        .find(|server| server.name == params.name)
        .ok_or_else(|| {
            DeveloperSessionHostError::not_found(format!(
                "No MCP server named '{}' is configured",
                params.name
            ))
        })?;
    match server.origin {
        McpServerOrigin::Project => {
            return Err(DeveloperSessionHostError::conflict(format!(
                "'{}' comes from this workspace's .mcp.json; remove it there",
                params.name
            )))
        }
        McpServerOrigin::Plugin => {
            return Err(DeveloperSessionHostError::conflict(format!(
                "'{}' comes from a plugin; remove or disable that plugin",
                params.name
            )))
        }
        McpServerOrigin::User => {}
    }
    crate::installs::remove_mcp_server(&params.name)
        .map_err(|error| invalid(format!("{error:#}")))?;
    Ok(list_mcp_servers(workspace_root))
}

pub fn add_hook(
    workspace_root: &Path,
    params: HookAddParams,
) -> Result<HookListResponse, DeveloperSessionHostError> {
    let event = params.event.trim();
    if event.is_empty() || event.contains(char::is_whitespace) {
        return Err(invalid("A hook needs a single event name"));
    }
    hooks::apply_hooks_command(&format!("add {event} {}", params.command.trim()))
        .map_err(|error| invalid(format!("{error:#}")))?;
    Ok(list_hooks(workspace_root))
}

pub fn remove_hook(
    workspace_root: &Path,
    params: HookRemoveParams,
) -> Result<HookListResponse, DeveloperSessionHostError> {
    let event = params.event.trim();
    if event.is_empty() || event.contains(char::is_whitespace) {
        return Err(invalid("A hook needs a single event name"));
    }
    hooks::apply_hooks_command(&format!("remove {event} {}", params.position))
        .map_err(|error| invalid(format!("{error:#}")))?;
    Ok(list_hooks(workspace_root))
}

pub fn list_saved_permissions() -> Result<PermissionsListResponse, DeveloperSessionHostError> {
    let store = crate::permissions::PermissionStore::load().map_err(internal)?;
    let mut permissions = Vec::new();
    for (scope, rules, decision) in [
        ("allow", &store.always_allow, SavedPermissionDecision::Allow),
        ("deny", &store.always_deny, SavedPermissionDecision::Deny),
    ] {
        let mut rules: Vec<&String> = rules.iter().collect();
        rules.sort();
        for rule in rules {
            let (kind, label) = match rule
                .strip_prefix("file:")
                .and_then(|rest| rest.split_once(':'))
            {
                Some((operation, path)) => (
                    SavedPermissionKind::File,
                    format!("{} {path}", file_operation_label(operation)),
                ),
                None => (SavedPermissionKind::Command, rule.clone()),
            };
            permissions.push(SavedPermission {
                id: saved_permission_id(scope, rule),
                kind,
                label,
                decision,
            });
        }
    }
    for rule in crate::features::exec::exec_policy::user_approved_rules().map_err(internal)? {
        permissions.push(SavedPermission {
            id: saved_permission_id("exec_policy", &rule.line),
            kind: SavedPermissionKind::ExecPolicy,
            label: rule.prefix.join(" "),
            decision: if rule.allow {
                SavedPermissionDecision::Allow
            } else {
                SavedPermissionDecision::Deny
            },
        });
    }
    Ok(PermissionsListResponse { permissions })
}

pub fn remove_saved_permission(
    id: &str,
) -> Result<PermissionsListResponse, DeveloperSessionHostError> {
    let mut store = crate::permissions::PermissionStore::load().map_err(internal)?;
    let stored = [("allow", false), ("deny", true)]
        .into_iter()
        .find_map(|(scope, deny)| {
            let rules = if deny {
                &store.always_deny
            } else {
                &store.always_allow
            };
            rules
                .iter()
                .find(|rule| saved_permission_id(scope, rule) == id)
                .map(|rule| (deny, rule.clone()))
        });
    let mcp_rule = crate::platform::policy::user_mcp_rules()
        .into_iter()
        .find(|(target, _)| saved_permission_id(MCP_RULE_SCOPE, target) == id);
    if let Some((target, _)) = mcp_rule {
        crate::platform::policy::remove_user_mcp_rule(&target).map_err(internal)?;
        return list_saved_permissions();
    }
    let removed = if let Some((deny, rule)) = stored {
        if deny {
            store.always_deny.remove(&rule);
        } else {
            store.always_allow.remove(&rule);
        }
        store.save().map_err(internal)?;
        true
    } else {
        match crate::features::exec::exec_policy::user_approved_rules()
            .map_err(internal)?
            .into_iter()
            .find(|rule| saved_permission_id("exec_policy", &rule.line) == id)
        {
            Some(rule) => crate::features::exec::exec_policy::remove_user_approved_rule(&rule.line)
                .map_err(internal)?,
            None => false,
        }
    };
    if !removed {
        return Err(DeveloperSessionHostError::not_found(
            "No saved approval has that id; list them again",
        ));
    }
    list_saved_permissions()
}

const MCP_RULE_SCOPE: &str = "mcp";
const MCP_TARGET_SEPARATOR: char = '/';

pub fn list_permission_rules() -> Result<PermissionRulesResponse, DeveloperSessionHostError> {
    let mut rules: Vec<PermissionRule> = list_saved_permissions()?
        .permissions
        .into_iter()
        .map(|saved| {
            let decision = match saved.decision {
                SavedPermissionDecision::Allow => PermissionRuleDecision::Allow,
                SavedPermissionDecision::Deny => PermissionRuleDecision::Deny,
            };
            let (kind, target) = match saved.kind {
                SavedPermissionKind::File => (PermissionRuleKind::File, saved.label.clone()),
                SavedPermissionKind::ExecPolicy => {
                    (PermissionRuleKind::ExecPolicy, saved.label.clone())
                }
                SavedPermissionKind::Command => {
                    match saved
                        .label
                        .strip_prefix(crate::permissions::DOMAIN_RULE_PREFIX)
                    {
                        Some(host) => (PermissionRuleKind::Domain, host.to_string()),
                        None => (PermissionRuleKind::Command, saved.label.clone()),
                    }
                }
            };
            PermissionRule {
                id: saved.id,
                kind,
                target,
                label: saved.label,
                decision,
            }
        })
        .collect();
    let server_prefix = crate::platform::policy::mcp_rule_target("", None);
    for (target, decision) in crate::platform::policy::user_mcp_rules() {
        let shown = target
            .strip_prefix(&server_prefix)
            .unwrap_or(&target)
            .trim_end_matches("__*");
        let (server, tool) = match shown.split_once("__") {
            Some((server, tool)) => (server.to_string(), Some(tool.to_string())),
            None => (shown.to_string(), None),
        };
        rules.push(PermissionRule {
            id: saved_permission_id(MCP_RULE_SCOPE, &target),
            kind: PermissionRuleKind::Mcp,
            target: match &tool {
                Some(tool) => format!("{server}{MCP_TARGET_SEPARATOR}{tool}"),
                None => server.clone(),
            },
            label: match &tool {
                Some(tool) => format!("{tool} from {server}"),
                None => format!("every tool from {server}"),
            },
            decision: match decision {
                crate::platform::policy::PolicyDecision::Allow => PermissionRuleDecision::Allow,
                crate::platform::policy::PolicyDecision::Ask => PermissionRuleDecision::Ask,
                crate::platform::policy::PolicyDecision::Deny => PermissionRuleDecision::Deny,
            },
        });
    }
    Ok(PermissionRulesResponse { rules })
}

pub fn add_permission(
    params: PermissionsAddParams,
) -> Result<PermissionRulesResponse, DeveloperSessionHostError> {
    let target = params.target.trim();
    if target.is_empty() || target.len() > 512 || target.chars().any(char::is_control) {
        return Err(invalid("Name what the rule applies to"));
    }
    match params.kind {
        PermissionRuleKind::Mcp => {
            let (server, tool) = match target.split_once(MCP_TARGET_SEPARATOR) {
                Some((server, tool)) => (server.trim(), Some(tool.trim())),
                None => (target, None),
            };
            let valid = |name: &str| {
                !name.is_empty()
                    && !name.contains("__")
                    && name.chars().all(|character| {
                        character.is_ascii_alphanumeric() || "-_.".contains(character)
                    })
            };
            if !valid(server) || tool.is_some_and(|tool| !valid(tool)) {
                return Err(invalid(
                    "An MCP rule names a server, or server/tool, using letters, digits, dots, dashes and underscores",
                ));
            }
            let decision = match params.decision {
                PermissionRuleDecision::Allow => crate::platform::policy::PolicyDecision::Allow,
                PermissionRuleDecision::Ask => crate::platform::policy::PolicyDecision::Ask,
                PermissionRuleDecision::Deny => crate::platform::policy::PolicyDecision::Deny,
            };
            crate::platform::policy::set_user_mcp_rule(server, tool, Some(decision))
                .map_err(internal)?;
        }
        PermissionRuleKind::Command | PermissionRuleKind::Domain => {
            let rule = if params.kind == PermissionRuleKind::Domain {
                if target.contains(['/', ':', ' ']) {
                    return Err(invalid(
                        "A site rule names a host such as example.com or *.example.com",
                    ));
                }
                if params.decision == PermissionRuleDecision::Allow {
                    if let Some(message) = crate::permissions::website_allow_error(target) {
                        return Err(invalid(message));
                    }
                }
                format!(
                    "{}{}",
                    crate::permissions::DOMAIN_RULE_PREFIX,
                    target.to_ascii_lowercase()
                )
            } else {
                if params.decision == PermissionRuleDecision::Allow {
                    if let Some(message) = crate::permissions::open_ended_allow_error(target) {
                        return Err(invalid(message));
                    }
                }
                target.to_string()
            };
            let mut store = crate::permissions::PermissionStore::load().map_err(internal)?;
            match params.decision {
                PermissionRuleDecision::Allow => {
                    store.remove_always_deny(&rule);
                    store.allow_always(&rule);
                }
                PermissionRuleDecision::Deny => {
                    store.remove_always_allow(&rule);
                    store.deny_always(&rule);
                }
                PermissionRuleDecision::Ask => {
                    store.remove_always_allow(&rule);
                    store.remove_always_deny(&rule);
                }
            }
            store.save().map_err(internal)?;
        }
        PermissionRuleKind::File | PermissionRuleKind::ExecPolicy => {
            return Err(invalid(
                "File and exec-policy rules are saved from an approval prompt, not added here",
            ));
        }
    }
    list_permission_rules()
}

pub fn list_provider_keys() -> Result<ProvidersListResponse, DeveloperSessionHostError> {
    let providers = crate::auth::api_key_providers()
        .map_err(internal)?
        .into_iter()
        .map(|provider| ProviderKeySummary {
            provider: provider.id.to_string(),
            label: provider.label.to_string(),
            env_var: provider.env_var.to_string(),
            configured: provider.configured,
        })
        .collect();
    Ok(ProvidersListResponse {
        providers,
        storage: crate::auth::credential_storage_label().to_string(),
    })
}

pub fn list_trusted_folders() -> Result<TrustListResponse, DeveloperSessionHostError> {
    let config_dir = CliConfig::config_dir().map_err(internal)?;
    let registry = crate::project_registry::ProjectRegistry::load(&config_dir).map_err(internal)?;
    let mut folders: Vec<TrustedFolder> = registry
        .projects
        .iter()
        .filter(|(_, entry)| entry.trust_level == "trusted" && entry.revoked_at.is_none())
        .map(|(path, entry)| TrustedFolder {
            path: path.clone(),
            trusted_at: entry.trusted_at.clone(),
            trusted_by: entry.trusted_by.clone(),
        })
        .collect();
    folders.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(TrustListResponse { folders })
}

pub fn revoke_trusted_folder(path: &str) -> Result<TrustListResponse, DeveloperSessionHostError> {
    let listed = list_trusted_folders()?;
    if !listed.folders.iter().any(|folder| folder.path == path) {
        return Err(DeveloperSessionHostError::not_found(
            "That folder is not trusted; list them again",
        ));
    }
    crate::trust::revoke(std::path::Path::new(path)).map_err(internal)?;
    list_trusted_folders()
}

fn saved_permission_id(scope: &str, rule: &str) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(format!("{scope}\n{rule}").as_bytes());
    crate::hex::encode(&digest[..8])
}

fn file_operation_label(operation: &str) -> &str {
    match operation {
        "write" => "Write",
        "edit" | "multiedit" => "Edit",
        "patch" => "Patch",
        other => other,
    }
}

pub const SEARCH_COMMAND: &str = "search";

pub fn search_command(text: &str) -> Result<Option<String>, DeveloperSessionHostError> {
    let invocation = text.trim_start();
    let (command, question) = invocation
        .split_once(char::is_whitespace)
        .unwrap_or((invocation, ""));
    if command.strip_prefix('/') != Some(SEARCH_COMMAND) {
        return Ok(None);
    }
    let question = question.trim();
    if question.is_empty() {
        return Err(invalid("Usage: /search <question>"));
    }
    Ok(Some(question.to_string()))
}

pub fn expand_prompt_command(text: &str) -> Result<Option<String>, DeveloperSessionHostError> {
    let invocation = text.trim_start();
    if !invocation.starts_with('/') {
        return Ok(None);
    }
    if let Some(prompt) = crate::custom_commands::expand_custom_slash_invocation(invocation) {
        return Ok(Some(prompt));
    }
    let (command, args) = invocation
        .split_once(char::is_whitespace)
        .unwrap_or((invocation, ""));
    if let Some(prompt) = builtin_prompt_command(command.trim_start_matches('/'), args) {
        return Ok(Some(prompt));
    }
    match skills::skill_command_prompt(command.trim_start_matches('/'), args) {
        Some(Ok(prompt)) => Ok(Some(prompt)),
        Some(Err(reason)) => Err(invalid(reason)),
        None => Ok(None),
    }
}

const BUILTIN_PROMPTS: [(&str, fn(&str) -> String); 9] = [
    ("review", crate::claude_parity::review_prompt),
    (
        "security-review",
        crate::claude_parity::security_review_prompt,
    ),
    ("pr-comments", crate::claude_parity::pr_comments_prompt),
    ("ultrareview", crate::claude_parity::ultrareview_prompt),
    ("think-back", crate::claude_parity::think_back_prompt),
    ("recap", crate::claude_parity::recap_prompt),
    ("powerup", crate::claude_parity::powerup_prompt),
    ("save-skill", crate::claude_parity::save_skill_prompt),
    ("save-routine", crate::claude_parity::save_routine_prompt),
];

fn builtin_prompt_command(command: &str, args: &str) -> Option<String> {
    BUILTIN_PROMPTS
        .iter()
        .find(|(name, _)| *name == command)
        .map(|(_, prompt)| prompt(args))
}

// ---------------------------------------------------------------------------
// Local model servers
// ---------------------------------------------------------------------------

pub fn local_server_status(probe: &LocalProviderProbe) -> Option<LocalServerStatus> {
    let (provider, name) = match probe.provider.as_str() {
        "ollama" => (LocalModelProvider::Ollama, "Ollama"),
        "lmstudio" => (LocalModelProvider::Lmstudio, "LM Studio"),
        _ => return None,
    };
    let model_count = u32::try_from(probe.models.len()).unwrap_or(u32::MAX);
    let (health, message) = match probe.health {
        LocalProbeHealth::Running if model_count == 0 => (
            LocalServerHealth::Running,
            Some(format!(
                "{name} is running but has no model yet. Download or load one, then refresh."
            )),
        ),
        LocalProbeHealth::Running => (LocalServerHealth::Running, None),
        LocalProbeHealth::Unreachable => (
            LocalServerHealth::NotRunning,
            Some(format!(
                "{name} is not running on this computer. Start it, then refresh."
            )),
        ),
        LocalProbeHealth::Faulty => (
            LocalServerHealth::Unhealthy,
            Some(format!(
                "{name} answered but could not list its models. Restart it, then refresh."
            )),
        ),
        LocalProbeHealth::Blocked => (
            LocalServerHealth::Blocked,
            Some(format!(
                "{name} is set to an address that is not on this computer, so the CLI does not contact it."
            )),
        ),
    };
    Some(LocalServerStatus {
        provider,
        health,
        model_count,
        message,
    })
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

pub fn add_memory(
    workspace_root: &Path,
    params: MemoryAddParams,
) -> Result<MemoryAddResponse, DeveloperSessionHostError> {
    let text = params.text.trim();
    if text.is_empty() {
        return Err(invalid("memory/add needs the text to remember"));
    }
    if text.chars().count() > MAX_MEMORY_TEXT_CHARS {
        return Err(invalid(format!(
            "A memory can be at most {MAX_MEMORY_TEXT_CHARS} characters"
        )));
    }
    let scope = params.scope.unwrap_or(MemoryScope::Project);
    let tier = match scope {
        MemoryScope::User => MemoryTier::Global,
        MemoryScope::Project => MemoryTier::Project,
        MemoryScope::Local => MemoryTier::Local,
    };
    let path = MemoryManager::new(workspace_root)
        .save(&tier, text)
        .map_err(invalid)?;
    Ok(MemoryAddResponse {
        scope,
        path: display(&path),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn instruction_preview_names_exactly_the_files_a_turn_loads() {
        let home = tempfile::tempdir().expect("config home");
        crate::compaction::with_config_home(home.path(), || {
            let root = tempdir().expect("fixture root");
            let root_path = root.path();
            std::fs::create_dir_all(root_path.join(".git")).expect("root marker");
            std::fs::write(root_path.join("AGENTS.md"), "root contract").expect("root AGENTS.md");

            let nested = root_path.join("apps").join("web");
            std::fs::create_dir_all(nested.join(".agiworkforce")).expect("nested dirs");
            std::fs::write(nested.join("CLAUDE.md"), "nested adapter").expect("nested CLAUDE.md");
            std::fs::write(
                nested.join(".agiworkforce").join("instructions.md"),
                "nested instructions",
            )
            .expect("nested instructions");

            let preview = context_instructions(&nested);
            let previewed: Vec<String> =
                preview.files.iter().map(|file| file.path.clone()).collect();

            let loaded =
                crate::compaction::load_instructions(&nested).expect("turn loads instructions");
            for path in &previewed {
                assert!(
                    loaded.contains(path.as_str()),
                    "preview names {path}, which the turn never loaded"
                );
            }
            let loaded_count = loaded.matches("<!-- Instructions from: ").count();
            assert_eq!(
                loaded_count,
                previewed.len(),
                "the turn loaded {loaded_count} files but the preview named {}",
                previewed.len()
            );

            assert!(previewed
                .iter()
                .any(|path| path.ends_with("AGENTS.md") && path.starts_with(&display(root_path))));
            assert!(previewed.iter().any(|path| path.ends_with("CLAUDE.md")));
            assert!(previewed
                .iter()
                .any(|path| path.ends_with("instructions.md")));
            assert_eq!(
                preview.project_root.as_deref(),
                Some(display(root_path).as_str())
            );
            assert!(!preview.truncated);

            let root_first = preview
                .files
                .first()
                .expect("at least one instruction file");
            assert_eq!(root_first.kind, InstructionFileKind::Agents);
            assert_eq!(root_first.root, display(root_path));
        })
    }

    #[test]
    fn bypass_is_never_stored_as_a_default_permission_mode() {
        assert_eq!(
            permission_mode_to_config(DeveloperAgentMode::Ask).expect("ask is storable"),
            "default"
        );
        assert_eq!(
            permission_mode_to_config(DeveloperAgentMode::Auto).expect("auto is storable"),
            "acceptEdits"
        );
        assert_eq!(
            permission_mode_to_config(DeveloperAgentMode::Plan).expect("plan is storable"),
            "plan"
        );
        let refused = permission_mode_to_config(DeveloperAgentMode::Bypass)
            .expect_err("bypass must not be storable");
        assert_eq!(refused.code(), -32602);

        // Every mode this surface can store round-trips, and none of them
        // resolves to a permission mode that skips approvals.
        for stored in ["default", "plan", "acceptEdits"] {
            let resolved = crate::cli_options::persisted_permission_mode(stored)
                .expect("a stored mode the CLI startup path understands");
            assert_ne!(
                resolved,
                crate::cli_options::PermissionMode::BypassPermissions
            );
        }
        assert!(crate::cli_options::persisted_permission_mode("bypassPermissions").is_none());
    }

    #[test]
    fn an_allow_for_a_bare_interpreter_is_refused_before_anything_is_saved() {
        for target in ["bash", "python3", "npm exec", "/usr/bin/env"] {
            let error = add_permission(PermissionsAddParams {
                kind: PermissionRuleKind::Command,
                target: target.to_string(),
                decision: PermissionRuleDecision::Allow,
            })
            .expect_err(target);
            assert!(
                error.to_string().contains("without asking"),
                "{target}: {error}"
            );
        }
    }

    #[test]
    fn a_site_allow_for_a_metadata_address_is_refused() {
        for target in ["169.254.169.254", "localhost", "*"] {
            let error = add_permission(PermissionsAddParams {
                kind: PermissionRuleKind::Domain,
                target: target.to_string(),
                decision: PermissionRuleDecision::Allow,
            })
            .expect_err(target);
            assert!(
                error.to_string().contains("cannot be allowed")
                    || error.to_string().contains("names a host"),
                "{target}: {error}"
            );
        }
    }
}

#[cfg(test)]
mod workspace_mcp_refusal_tests {
    use super::*;
    use crate::cloud::workspace_policy::with_test_policy;
    use crate::mcp::{with_test_configs, McpServerConfig};
    use std::collections::HashMap;

    fn server_configs() -> HashMap<String, McpServerConfig> {
        HashMap::from([
            (
                "blocked-local-fixture".to_string(),
                McpServerConfig::stdio(
                    "/nonexistent/agi-mcp-policy-fixture",
                    Vec::new(),
                    HashMap::new(),
                ),
            ),
            (
                "allowed-remote-fixture".to_string(),
                McpServerConfig::http("https://mcp.example.test/mcp", HashMap::new()),
            ),
            (
                "blocked-apex-fixture".to_string(),
                McpServerConfig::http("https://example.test/mcp", HashMap::new()),
            ),
        ])
    }

    fn policy() -> serde_json::Value {
        serde_json::json!({"code": {"allowedMcpServers": ["*.example.test"]}})
    }

    #[test]
    fn workspace_mcp_listing_reports_policy_refusal_before_connecting() {
        with_test_policy(policy(), || {
            with_test_configs(server_configs(), || {
                let listed = serde_json::to_value(list_mcp_servers(Path::new("/unused"))).unwrap();
                for name in ["blocked-local-fixture", "blocked-apex-fixture"] {
                    let row = listed["servers"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .find(|row| row["name"] == name)
                        .unwrap();
                    assert_eq!(row["status"], "blocked");
                    assert!(row["policyRefusal"].as_str().unwrap().contains(name));
                    assert!(row["policyRefusal"]
                        .as_str()
                        .unwrap()
                        .contains("not started"));
                }
                let allowed = listed["servers"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|row| row["name"] == "allowed-remote-fixture")
                    .unwrap();
                assert_eq!(allowed["status"], "needs_auth");
                assert!(allowed.get("policyRefusal").is_none());
            })
        });
    }

    #[test]
    fn workspace_mcp_admission_reports_conflict_for_disconnected_probes() {
        with_test_policy(policy(), || {
            with_test_configs(server_configs(), || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .unwrap();
                runtime.block_on(async {
                    let root = Path::new("/unused");
                    let limit = std::time::Duration::from_secs(1);
                    let test = test_mcp_server(root, "blocked-local-fixture", limit)
                        .await
                        .unwrap_err();
                    let inspect = inspect_mcp_server(root, "blocked-local-fixture", limit)
                        .await
                        .unwrap_err();
                    let tools = mcp_server_tools(root, "blocked-local-fixture", limit)
                        .await
                        .unwrap_err();
                    for error in [test, inspect, tools] {
                        assert_eq!(error.code(), -32009);
                        assert!(error.to_string().contains("allows only listed MCP hosts"));
                    }
                    let config = server_configs().remove("blocked-local-fixture").unwrap();
                    let error =
                        crate::mcp::McpConnection::connect("blocked-local-fixture", &config)
                            .await
                            .err()
                            .expect("transport must remain blocked");
                    assert!(error.to_string().contains("allows only listed MCP hosts"));
                });
            })
        });
    }
}
