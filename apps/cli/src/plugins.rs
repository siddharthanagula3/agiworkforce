#![allow(dead_code, unused_imports)]
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct LoadedPlugin {
    pub config_name: String,
    pub manifest_name: Option<String>,
    pub root: PathBuf,
    pub enabled: bool,
    pub skill_roots: Vec<PathBuf>,
    pub mcp_servers: HashMap<String, McpServerConfig>,
    pub apps: Vec<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub command: String,
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub name: Option<String>,
    #[serde(default)]
    pub mcp_servers: HashMap<String, McpServerConfig>,
    #[serde(default)]
    pub apps: Vec<String>,
}

pub struct PluginsManager {
    global_dir: PathBuf,
    plugins: Vec<LoadedPlugin>,
}

pub enum PluginSource {
    Local(PathBuf),
    Git { url: String, branch: Option<String> },
}
pub struct PluginInstallRequest {
    pub source: PluginSource,
    pub name: String,
}
pub enum PluginInstallOutcome {
    Installed { path: PathBuf },
    AlreadyInstalled { path: PathBuf },
    Failed { error: String },
}

const AGIWORKFORCE_DIR: &str = ".agiworkforce";
const PLUGINS_DIR: &str = "plugins";

impl PluginsManager {
    pub fn new() -> Self {
        let global_dir = match dirs::home_dir() {
            Some(home) => home.join(AGIWORKFORCE_DIR).join(PLUGINS_DIR),
            None => {
                eprintln!(
                    "[plugins] warning: could not determine home directory, using current dir"
                );
                PathBuf::from(".").join(AGIWORKFORCE_DIR).join(PLUGINS_DIR)
            }
        };
        Self {
            global_dir,
            plugins: Vec::new(),
        }
    }
    pub fn load_all(&mut self, project_dir: Option<&Path>) -> Result<&[LoadedPlugin]> {
        self.plugins.clear();
        if self.global_dir.exists() {
            self.load_from_dir(&self.global_dir.clone())?;
        }
        if let Some(p) = project_dir {
            let pp = p.join(".agiworkforce").join("plugins");
            if pp.exists() {
                self.load_from_dir(&pp)?;
            }
        }
        Ok(&self.plugins)
    }
    fn load_from_dir(&mut self, dir: &Path) -> Result<()> {
        for entry in std::fs::read_dir(dir)? {
            let path = entry?.path();
            if !path.is_dir() {
                continue;
            }
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let manifest: Option<PluginManifest> =
                [".app.json", ".mcp.json"].iter().find_map(|f| {
                    let mp = path.join(f);
                    if mp.exists() {
                        std::fs::read_to_string(&mp)
                            .ok()
                            .and_then(|c| serde_json::from_str::<PluginManifest>(&c).ok())
                            .map(|mut m| {
                                // Validate MCP server commands — reject shell metacharacters
                                m.mcp_servers.retain(|sname, cfg| {
                                    let has_metachar = cfg.command.contains(&['|', ';', '&', '$', '`', '\0'][..]);
                                    if has_metachar {
                                        eprintln!(
                                            "[plugins] Rejected MCP server '{}' in plugin '{}': command contains shell metacharacters",
                                            sname, name
                                        );
                                    }
                                    !has_metachar
                                });
                                m
                            })
                    } else {
                        None
                    }
                });
            self.plugins.push(LoadedPlugin {
                config_name: name,
                manifest_name: manifest.as_ref().and_then(|m| m.name.clone()),
                root: path,
                enabled: true,
                skill_roots: vec![],
                mcp_servers: manifest
                    .as_ref()
                    .map(|m| m.mcp_servers.clone())
                    .unwrap_or_default(),
                apps: manifest
                    .as_ref()
                    .map(|m| m.apps.clone())
                    .unwrap_or_default(),
                error: None,
            });
        }
        Ok(())
    }
    pub fn plugins(&self) -> &[LoadedPlugin] {
        &self.plugins
    }

    /// Collect MCP server configs from all loaded plugins, converted to
    /// `crate::mcp::McpServerConfig` so callers can pass them to `McpManager`.
    pub fn mcp_configs(&self) -> HashMap<String, crate::mcp::McpServerConfig> {
        let mut out = HashMap::new();
        for p in &self.plugins {
            for (name, cfg) in &p.mcp_servers {
                out.insert(name.clone(), crate::mcp::McpServerConfig {
                    command: cfg.command.clone(),
                    args: cfg.args.clone(),
                    env: cfg.env.clone(),
                });
            }
        }
        out
    }
    pub fn install(&self, req: PluginInstallRequest) -> PluginInstallOutcome {
        let target = self.global_dir.join(&req.name);
        if target.exists() {
            return PluginInstallOutcome::AlreadyInstalled { path: target };
        }
        match req.source {
            PluginSource::Local(src) => match copy_dir(&src, &target) {
                Ok(()) => PluginInstallOutcome::Installed { path: target },
                Err(e) => PluginInstallOutcome::Failed {
                    error: format!("{}", e),
                },
            },
            PluginSource::Git { url, branch } => {
                let mut cmd = std::process::Command::new("git");
                cmd.arg("clone").arg("--depth").arg("1");
                if let Some(b) = branch {
                    cmd.args(["--branch", &b]);
                }
                cmd.arg(&url).arg(&target);
                match cmd.output() {
                    Ok(o) if o.status.success() => PluginInstallOutcome::Installed { path: target },
                    Ok(o) => PluginInstallOutcome::Failed {
                        error: String::from_utf8_lossy(&o.stderr).to_string(),
                    },
                    Err(e) => PluginInstallOutcome::Failed {
                        error: format!("{}", e),
                    },
                }
            }
        }
    }
}

fn copy_dir(src: &Path, dst: &Path) -> Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let e = entry?;
        let d = dst.join(e.file_name());
        if e.path().is_dir() {
            copy_dir(&e.path(), &d)?;
        } else {
            std::fs::copy(e.path(), d)?;
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoverableTool {
    pub name: String,
    pub description: String,
    pub tool_type: DiscoverableToolType,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DiscoverableToolType {
    Function,
    Plugin,
    Skill,
    Mcp,
}

pub fn build_discoverable_tools(
    builtins: &[String],
    mcp: &[String],
    plugins: &[String],
) -> Vec<DiscoverableTool> {
    let mut tools = Vec::new();
    for n in builtins {
        tools.push(DiscoverableTool {
            name: n.clone(),
            description: format!("Built-in: {}", n),
            tool_type: DiscoverableToolType::Function,
            source: "builtin".into(),
        });
    }
    for n in mcp {
        tools.push(DiscoverableTool {
            name: n.clone(),
            description: format!("MCP: {}", n),
            tool_type: DiscoverableToolType::Mcp,
            source: "mcp".into(),
        });
    }
    for n in plugins {
        tools.push(DiscoverableTool {
            name: n.clone(),
            description: format!("Plugin: {}", n),
            tool_type: DiscoverableToolType::Plugin,
            source: "plugin".into(),
        });
    }
    tools
}
