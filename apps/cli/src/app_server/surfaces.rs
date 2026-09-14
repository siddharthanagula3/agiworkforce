//! Workspace surfaces the CLI and an editor client read from one place.
//!
//! Instructions, skills, plugins, MCP servers, hooks, settings and slash
//! commands all resolve through the same CLI code the terminal uses, so the two
//! surfaces cannot drift into describing different state.

use agiworkforce_app_server::DeveloperSessionHostError;
use agiworkforce_command_registry::{CommandSource, RegistryCommand};
use agiworkforce_protocol::developer_session::{
    CommandSourceKind, ContextInstructionsResponse, DeveloperAgentMode, DeveloperReasoningEffort,
    HookConfigScope, HookListResponse, HookSummary, InstructionFile, InstructionFileKind,
    McpServerConfiguredStatus, McpServerListResponse, McpServerScope, McpServerSummary,
    PluginListResponse, PluginScope, PluginSummary, SettingsReadResponse, SettingsWriteParams,
    SkillCatalogScope, SkillConsentResponse, SkillListResponse, SkillSummary,
    SlashCommandListResponse, SlashCommandResultKind, SlashCommandRunResponse, SlashCommandSummary,
};
use std::path::{Path, PathBuf};

use crate::command_registry::registry_from_builtins_skills_and_prompts;
use crate::config::CliConfig;
use crate::features::hooks::hooks;
use crate::mcp::{McpCredentialState, McpServerOrigin};
use crate::plugins::PluginsManager;
use crate::skills::{self, SkillOrigin};

/// Slash commands `commands/run` can execute with no terminal attached.
///
/// Every other command needs a live TUI or a thread, so it is listed with
/// `runnable: false` rather than offered as a control that does nothing.
const RUNNABLE_COMMANDS: [&str; 6] = ["skills", "plugins", "mcp", "hooks", "settings", "model"];

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
    let skills = skills::skill_catalog(workspace_root)
        .into_iter()
        .map(|entry| SkillSummary {
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
    PluginListResponse { plugins }
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
        .map(|server| McpServerSummary {
            transport: server.config.transport_kind().to_string(),
            scope: mcp_scope(server.origin),
            status: mcp_status(server.credential),
            url: server.url,
            name: server.name,
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
        for hook in &user_hooks.hooks[event] {
            summaries.push(HookSummary {
                event: event.clone(),
                command: hook.command.clone(),
                scope: HookConfigScope::User,
                trusted: true,
                source: hooks::hooks_path().ok().as_deref().map(display),
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

    let mut commands: Vec<SlashCommandSummary> = registry
        .commands()
        .iter()
        .filter(|command| command.user_invocable)
        .map(|command| SlashCommandSummary {
            name: command.name.clone(),
            description: command.description.clone(),
            args_hint: command.argument_hint.clone(),
            source: command_source(command),
            aliases: command.aliases.clone(),
            runnable: RUNNABLE_COMMANDS.contains(&command.name.as_str()),
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
                .map(|server| format!("{} ({})", server.name, server.transport))
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

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn instruction_preview_names_exactly_the_files_a_turn_loads() {
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
        let previewed: Vec<String> = preview.files.iter().map(|file| file.path.clone()).collect();

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
}
