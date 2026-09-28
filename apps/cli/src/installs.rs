use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::features::plugins::plugins;
use crate::mcp::registry::{self, McpRegistry, TransportKind};

pub(crate) enum McpServerTarget {
    Stdio { command: String, args: Vec<String> },
    Remote { url: String, sse: bool },
}

pub(crate) struct McpServerSpec {
    pub name: String,
    pub target: McpServerTarget,
    pub env: Vec<(String, String)>,
    pub headers: Vec<(String, String)>,
    pub overwrite: bool,
}

pub(crate) struct RemovedMcpServer {
    pub kind: String,
    pub target: String,
}

pub(crate) fn add_mcp_server(spec: &McpServerSpec) -> Result<PathBuf> {
    let mut registry_file = McpRegistry::load()?;
    let mut entry = match &spec.target {
        McpServerTarget::Stdio { command, args } => {
            registry::build_server_entry(TransportKind::Stdio, command, args)?
        }
        McpServerTarget::Remote { url, sse } => registry::build_server_entry(
            if *sse {
                TransportKind::Sse
            } else {
                TransportKind::Http
            },
            url,
            &[],
        )?,
    };
    let as_object = |pairs: &[(String, String)]| {
        serde_json::Value::Object(
            pairs
                .iter()
                .map(|(key, value)| (key.clone(), serde_json::json!(value)))
                .collect(),
        )
    };
    if !spec.env.is_empty() {
        entry["env"] = as_object(&spec.env);
    }
    if !spec.headers.is_empty() {
        entry["headers"] = as_object(&spec.headers);
    }
    registry_file.add(&spec.name, entry, spec.overwrite)?;
    registry_file.save()?;
    let path = McpRegistry::default_path()?;
    #[cfg(unix)]
    if !spec.env.is_empty() || !spec.headers.is_empty() {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(path)
}

pub(crate) fn remove_mcp_server(name: &str) -> Result<RemovedMcpServer> {
    let mut registry_file = McpRegistry::load()?;
    let Some(row) = registry_file
        .list()
        .into_iter()
        .find(|row| row.name == name)
    else {
        anyhow::bail!("no MCP server named '{name}' in the registry")
    };
    registry_file.remove(name);
    registry_file.save()?;
    Ok(RemovedMcpServer {
        kind: row.kind,
        target: row.target,
    })
}

pub(crate) fn install_plugin(
    source: &str,
    name: Option<&str>,
    integrity: plugins::PluginIntegrity,
    signature: plugins::PluginSignaturePolicy,
) -> Result<plugins::PluginInstallOutcome, String> {
    let name = plugins::derive_plugin_install_name(source, name)?;
    let source = if crate::is_git_plugin_source(source) {
        plugins::PluginSource::Git {
            url: source.to_string(),
            branch: None,
        }
    } else {
        plugins::PluginSource::Local(PathBuf::from(source))
    };
    Ok(
        plugins::PluginsManager::new().install(plugins::PluginInstallRequest {
            source,
            name,
            integrity,
            signature,
        }),
    )
}

pub(crate) fn remove_plugin(name: &str) -> Result<PathBuf> {
    plugins::validate_plugin_name(name).map_err(anyhow::Error::msg)?;
    let home = crate::config::CliConfig::config_dir()?;
    let manager = plugins::PluginsManager::new();
    let target = manager.global_dir().join(name);
    if crate::marketplace::InstalledPlugins::load(manager.global_dir())
        .plugins
        .contains_key(name)
    {
        crate::marketplace::Marketplace::new_production().uninstall(name, &home)?;
        return Ok(target);
    }
    let metadata = std::fs::symlink_metadata(&target)
        .with_context(|| format!("no plugin named '{name}' is installed"))?;
    anyhow::ensure!(
        metadata.is_dir() && !metadata.file_type().is_symlink(),
        "{} is not a plugin directory this CLI installed",
        target.display()
    );
    std::fs::remove_dir_all(&target).with_context(|| format!("removing {}", target.display()))?;
    Ok(target)
}

pub(crate) fn remove_skill(project_root: &Path, name: &str) -> Result<PathBuf> {
    let entry = crate::skills::skill_catalog(project_root)
        .into_iter()
        .find(|entry| entry.skill.name.eq_ignore_ascii_case(name))
        .with_context(|| format!("no skill named '{name}' is installed"))?;
    anyhow::ensure!(
        matches!(entry.origin, crate::skills::SkillOrigin::User),
        "'{name}' is not one of your own skills: a project skill lives in the repository and a plugin skill goes with its plugin"
    );
    let skills_dir = crate::config::CliConfig::config_dir()?
        .join("skills")
        .canonicalize()
        .context("reading your skills folder")?;
    let file = entry
        .skill
        .path
        .canonicalize()
        .with_context(|| format!("reading {}", entry.skill.path.display()))?;
    let parent = file.parent().map(Path::to_path_buf).unwrap_or_default();
    let target = if file.file_name().is_some_and(|name| name == "SKILL.md")
        && parent.parent() == Some(skills_dir.as_path())
    {
        std::fs::remove_dir_all(&parent)
            .with_context(|| format!("removing {}", parent.display()))?;
        parent
    } else {
        anyhow::ensure!(
            parent == skills_dir,
            "{} is outside your skills folder",
            file.display()
        );
        std::fs::remove_file(&file).with_context(|| format!("removing {}", file.display()))?;
        file
    };
    Ok(target)
}

pub(crate) fn set_plugin_enabled(name: &str, enabled: bool) -> Result<String> {
    let mut manager = plugins::PluginsManager::new();
    manager.load_all(std::env::current_dir().ok().as_deref())?;
    let plugin = manager
        .plugins()
        .iter()
        .find(|plugin| plugin.config_name == name)
        .with_context(|| format!("no plugin named '{name}' is installed"))?;
    plugins::set_plugin_enabled(&plugin.config_name, enabled)
        .with_context(|| format!("saving whether '{name}' is enabled"))?;
    Ok(format!(
        "{} plugin '{name}'. Restart agi for its skills, commands, MCP servers and hooks to {}.",
        if enabled { "Enabled" } else { "Disabled" },
        if enabled { "load" } else { "stop loading" }
    ))
}

pub(crate) fn plugin_command(args: &str) -> Option<String> {
    let (action, name) = args.trim().split_once(char::is_whitespace)?;
    let name = name.trim();
    let outcome = match action {
        "enable" => set_plugin_enabled(name, true),
        "disable" => set_plugin_enabled(name, false),
        "remove" | "uninstall" => remove_plugin(name)
            .map(|path| format!("Removed plugin '{name}' from {}.", path.display())),
        _ => return None,
    };
    Some(outcome.unwrap_or_else(|error| format!("{error:#}")))
}
