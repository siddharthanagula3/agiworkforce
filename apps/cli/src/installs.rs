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
    git_ref: Option<&str>,
) -> Result<plugins::PluginInstallOutcome, String> {
    let name = plugins::derive_plugin_install_name(source, name)?;
    let source = if crate::is_git_plugin_source(source) {
        plugins::PluginSource::Git {
            url: source.to_string(),
            branch: git_ref
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string),
        }
    } else if git_ref.is_some() {
        return Err(
            "--ref pins a version of a plugin installed from git; this source is a local folder."
                .to_string(),
        );
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

#[derive(Debug, Default)]
pub(crate) struct DependencySetup {
    pub enabled: Vec<String>,
    pub installed: Vec<String>,
    pub missing: Vec<String>,
}

impl DependencySetup {
    pub fn notices(&self, root: &str) -> Vec<String> {
        let mut notices = Vec::new();
        if !self.installed.is_empty() {
            notices.push(format!(
                "Installed what '{root}' depends on: {}.",
                self.installed.join(", ")
            ));
        }
        if !self.enabled.is_empty() {
            notices.push(format!(
                "Turned on what '{root}' depends on: {}.",
                self.enabled.join(", ")
            ));
        }
        notices.extend(
            self.missing
                .iter()
                .map(|reason| format!("'{root}' needs {reason}")),
        );
        notices
    }
}

pub(crate) async fn install_dependencies(root: &str) -> DependencySetup {
    use crate::features::plugins::registry::{
        self, HttpRegistryTransport, PluginRegistryClient, ResolveOptions,
    };

    let mut setup = DependencySetup::default();
    let mut manager = plugins::PluginsManager::new();
    let Some((manifest, _)) = plugins::load_manifest_for(&manager.global_dir().join(root)) else {
        return setup;
    };
    if manifest.dependencies.is_empty() {
        return setup;
    }
    if let Err(error) = manager.load_all(std::env::current_dir().ok().as_deref()) {
        setup.missing.push(format!(
            "its dependencies checked, but the installed plugins could not be read: {error:#}"
        ));
        return setup;
    }
    let installed: std::collections::HashMap<String, (bool, Option<String>)> = manager
        .plugins()
        .iter()
        .map(|plugin| {
            (
                plugin.config_name.clone(),
                (
                    plugin.enabled,
                    plugins::load_manifest_for(&plugin.root)
                        .and_then(|(manifest, _)| manifest.version),
                ),
            )
        })
        .collect();
    let client = registry::configured_registry_url().ok().and_then(|url| {
        HttpRegistryTransport::new()
            .ok()
            .and_then(|transport| PluginRegistryClient::new(url, transport).ok())
    });
    let policy = plugins::PluginSignaturePolicy::configured(false).ok();
    for dependency in &manifest.dependencies {
        let reference = dependency.reference();
        let (name, marketplace) = match registry::parse_plugin_reference(&reference) {
            Ok(parsed) => parsed,
            Err(error) => {
                setup.missing.push(format!(
                    "'{reference}', which is not a plugin reference ({error})"
                ));
                continue;
            }
        };
        if let Some((enabled, version)) = installed.get(&name) {
            if let Some(reason) =
                unmet_version(&name, dependency.version_range(), version.as_deref())
            {
                setup.missing.push(reason);
                continue;
            }
            if !enabled {
                match plugins::set_plugin_enabled(&name, true) {
                    Ok(()) => setup.enabled.push(name),
                    Err(error) => setup
                        .missing
                        .push(format!("'{name}' turned on, which failed: {error:#}")),
                }
            }
            continue;
        }
        if let Some(marketplace) = marketplace {
            setup.missing.push(format!(
                "'{name}' from the '{marketplace}' marketplace, which this CLI does not install from. Install {name} yourself first, then install {root} again."
            ));
            continue;
        }
        let Some(client) = client.as_ref() else {
            setup.missing.push(format!(
                "'{name}', which is not installed, and no plugin registry is configured to install it from (plugins.registry_url in config.toml or AGI_PLUGIN_REGISTRY_URL)"
            ));
            continue;
        };
        match client
            .resolve_with_dependencies(&name, ResolveOptions::default())
            .await
        {
            Ok(resolved) => {
                if let Some(reason) = resolved.first().and_then(|root| {
                    unmet_version(
                        &name,
                        dependency.version_range(),
                        root.manifest.version.as_deref(),
                    )
                }) {
                    setup.missing.push(reason);
                    continue;
                }
                for plugin in resolved {
                    if installed.contains_key(&plugin.name)
                        || setup.installed.contains(&plugin.name)
                    {
                        continue;
                    }
                    match install_resolved(&manager, &plugin, policy.as_ref()) {
                        Ok(()) => setup.installed.push(plugin.name),
                        Err(error) => setup.missing.push(format!(
                            "'{}', which could not be installed: {error:#}",
                            plugin.name
                        )),
                    }
                }
            }
            Err(error) => setup.missing.push(format!(
                "'{name}', which the registry could not resolve: {error}"
            )),
        }
    }
    setup
}

fn unmet_version(name: &str, range: Option<&str>, version: Option<&str>) -> Option<String> {
    let range = range?;
    let requirement = match semver::VersionReq::parse(range) {
        Ok(requirement) => requirement,
        Err(error) => {
            return Some(format!(
                "\"{name}\" {range}, which is not a version range ({error})"
            ))
        }
    };
    let satisfied = version
        .and_then(|version| semver::Version::parse(version.trim()).ok())
        .is_some_and(|version| requirement.matches(&version));
    (!satisfied).then(|| {
        format!(
            "\"{name}\" {range}, installed {}",
            version.unwrap_or("with no version")
        )
    })
}

fn install_resolved(
    manager: &plugins::PluginsManager,
    plugin: &crate::features::plugins::registry::ResolvedPlugin,
    policy: Option<&plugins::PluginSignaturePolicy>,
) -> Result<()> {
    plugins::validate_plugin_name(&plugin.name).map_err(anyhow::Error::msg)?;
    plugins::check_plugin_compatibility(&plugin.manifest).map_err(anyhow::Error::msg)?;
    let target = manager.global_dir().join(&plugin.name);
    anyhow::ensure!(!target.exists(), "{} already exists", target.display());
    let manifest_path = target.join(plugins::MANIFEST_PATHS[0].1);
    if let Some(parent) = manifest_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&manifest_path, &plugin.manifest_bytes)?;
    if let Some(policy) = policy {
        if let Err(error) = plugins::evaluate_plugin_signature(&target, policy) {
            let _ = std::fs::remove_dir_all(&target);
            anyhow::bail!(error);
        }
    }
    Ok(())
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

pub(crate) struct UpdatedPlugin {
    pub previous_version: Option<String>,
    pub update: crate::marketplace::PluginCheckoutUpdate,
}

pub(crate) fn update_plugin(name: &str) -> Result<UpdatedPlugin> {
    plugins::validate_plugin_name(name).map_err(anyhow::Error::msg)?;
    let manager = plugins::PluginsManager::new();
    let mut registry = crate::marketplace::InstalledPlugins::load(manager.global_dir());
    let recorded = registry.plugins.get(name).cloned();
    let install_path = recorded
        .as_ref()
        .map(|entry| PathBuf::from(&entry.install_path))
        .unwrap_or_else(|| manager.global_dir().join(name));
    anyhow::ensure!(
        install_path.is_dir(),
        "no plugin named '{name}' is installed"
    );
    anyhow::ensure!(
        crate::marketplace::is_git_checkout(&install_path),
        "'{name}' was installed from a folder, so there is nothing to update it from; install it again from its source"
    );
    let previous_version = recorded
        .as_ref()
        .map(|entry| entry.version.clone())
        .or_else(|| {
            plugins::load_manifest_for(&install_path).and_then(|(manifest, _)| manifest.version)
        });
    let policy = plugins::PluginSignaturePolicy::configured(false).map_err(anyhow::Error::msg)?;
    let update = crate::marketplace::update_plugin_checkout(&install_path, &policy)
        .map_err(anyhow::Error::msg)?;
    if let (
        Some(entry),
        crate::marketplace::PluginCheckoutUpdate::Updated {
            version, signature, ..
        },
    ) = (registry.plugins.get_mut(name), &update)
    {
        entry.version = version.clone();
        entry.signature = Some(signature.clone());
        registry.save(manager.global_dir())?;
    }
    Ok(UpdatedPlugin {
        previous_version,
        update,
    })
}

pub(crate) fn describe_update(name: &str, updated: &UpdatedPlugin) -> String {
    match &updated.update {
        crate::marketplace::PluginCheckoutUpdate::UpToDate => {
            format!("Plugin '{name}' is already up to date.")
        }
        crate::marketplace::PluginCheckoutUpdate::Updated {
            version,
            changed_files,
            ..
        } => format!(
            "{}\nRestart agi to load the new version.",
            crate::marketplace::describe_plugin_update(
                name,
                updated.previous_version.as_deref().unwrap_or("0.0.0"),
                version,
                changed_files,
            )
        ),
    }
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

pub(crate) fn is_plugin_action(args: &str) -> bool {
    let mut words = args.split_whitespace();
    match words.next() {
        Some("enable" | "disable" | "remove" | "uninstall") => true,
        Some("update" | "upgrade") => words.next().is_some(),
        _ => false,
    }
}

pub(crate) fn plugin_command(args: &str) -> Option<String> {
    let (action, name) = args.trim().split_once(char::is_whitespace)?;
    let name = name.trim();
    let outcome = match action {
        "enable" => set_plugin_enabled(name, true),
        "disable" => set_plugin_enabled(name, false),
        "remove" | "uninstall" => remove_plugin(name)
            .map(|path| format!("Removed plugin '{name}' from {}.", path.display())),
        "update" | "upgrade" => update_plugin(name).map(|updated| describe_update(name, &updated)),
        _ => return None,
    };
    Some(outcome.unwrap_or_else(|error| format!("{error:#}")))
}
