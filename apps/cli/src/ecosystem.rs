
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A detected AI tool or IDE on the user's machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedTool {
    pub name: String,
    pub path: PathBuf,
    pub has_mcp: bool,
    pub has_skills: bool,
    pub has_instructions: bool,
    pub has_settings: bool,
    pub mcp_config_path: Option<PathBuf>,
    pub skills_paths: Vec<PathBuf>,
    pub instructions_path: Option<PathBuf>,
}

/// An MCP server config imported from another tool.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportedMcpServer {
    /// Prefixed name: "claude:stripe"
    pub name: String,
    /// Source tool identifier: "claude", "codex", etc.
    pub source: String,
    /// Original server name from the source config
    pub original_name: String,
    /// Command to launch the server (stdio transport)
    pub command: Option<String>,
    /// Command arguments
    pub args: Vec<String>,
    /// Environment variables
    pub env: HashMap<String, String>,
    /// URL for HTTP/SSE transport servers
    pub url: Option<String>,
}

/// Reference to an instruction file from another tool.
#[derive(Debug, Clone, Serialize)]
pub struct InstructionRef {
    pub tool: String,
    pub path: PathBuf,
    pub size_bytes: u64,
}

/// Full ecosystem scan result.
#[derive(Debug, Clone, Serialize)]
pub struct EcosystemContext {
    pub detected_tools: Vec<DetectedTool>,
    pub available_instructions: Vec<InstructionRef>,
    pub imported_mcp_count: usize,
    pub imported_skills_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpImportWriteReport {
    pub path: PathBuf,
    pub added: Vec<String>,
    pub skipped_existing: Vec<String>,
    pub dry_run: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileCopyReport {
    pub source: Option<PathBuf>,
    pub target: PathBuf,
    pub status: FileCopyStatus,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub enum FileCopyStatus {
    MissingSource,
    Created,
    ExistingTarget,
    DryRunCreate,
}

#[derive(Debug, Clone, Serialize)]
pub struct PromptImportReport {
    pub source_dir: PathBuf,
    pub target_dir: PathBuf,
    pub added: Vec<PathBuf>,
    pub skipped_existing: Vec<PathBuf>,
    pub missing_source: bool,
    pub dry_run: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileImportReport {
    pub source_dir: PathBuf,
    pub target_dir: PathBuf,
    pub added: Vec<PathBuf>,
    pub skipped_existing: Vec<PathBuf>,
    pub missing_source: bool,
    pub dry_run: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClaudeMigrationReport {
    pub claude_dir: PathBuf,
    pub mcp: McpImportWriteReport,
    pub global_memory: FileCopyReport,
    pub prompts: PromptImportReport,
    pub skills: PromptImportReport,
    pub agents: PromptImportReport,
    pub hooks: FileCopyReport,
    pub settings: FileImportReport,
    pub settings_files_detected: Vec<PathBuf>,
    pub plugins_detected: Vec<PathBuf>,
    pub dry_run: bool,
}

// ---------------------------------------------------------------------------
// Internal tool registry
// ---------------------------------------------------------------------------

struct ToolDefinition {
    name: &'static str,
    /// Short identifier used as prefix in imported names
    source_id: &'static str,
    /// Paths to check (first found wins). Relative to home.
    home_relative_paths: Vec<&'static str>,
    /// MCP config path relative to the tool's home dir
    mcp_relative: Option<&'static str>,
    /// Glob patterns for skill files relative to tool home
    skills_globs: Vec<&'static str>,
    /// Instruction file path relative to tool home
    instructions_relative: Option<&'static str>,
    /// Whether this is a file-only check (no directory)
    is_file_check: bool,
}

fn tool_registry() -> Vec<ToolDefinition> {
    vec![
        // --- AI CLIs ---
        ToolDefinition {
            name: "Claude Code",
            source_id: "claude",
            home_relative_paths: vec![".claude"],
            mcp_relative: Some("mcp.json"),
            skills_globs: vec!["plugins/cache/*/skills/*/SKILL.md"],
            instructions_relative: Some("CLAUDE.md"),
            is_file_check: false,
        },
        ToolDefinition {
            name: "Codex CLI",
            source_id: "codex",
            home_relative_paths: vec![".codex"],
            mcp_relative: Some("config.toml"),
            skills_globs: vec![
                "skills/*.md",
                "vendor_imports/skills/skills/.curated/*/SKILL.md",
            ],
            instructions_relative: Some("AGENTS.md"),
            is_file_check: false,
        },
        ToolDefinition {
            name: "Gemini CLI",
            source_id: "gemini",
            home_relative_paths: vec![".gemini"],
            mcp_relative: Some("config.yaml"),
            skills_globs: vec!["skills/*/SKILL.md", "commands/*.md"],
            instructions_relative: Some("GEMINI.md"),
            is_file_check: false,
        },
        ToolDefinition {
            name: "OpenCode",
            source_id: "opencode",
            home_relative_paths: vec![".config/opencode"],
            mcp_relative: Some("opencode.jsonc"),
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "Copilot CLI",
            source_id: "copilot",
            home_relative_paths: vec![".copilot"],
            mcp_relative: Some("mcp-config.json"),
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "Aider",
            source_id: "aider",
            home_relative_paths: vec![".aider.conf.yml"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: true,
        },
        ToolDefinition {
            name: "Continue.dev",
            source_id: "continue",
            home_relative_paths: vec![".continue"],
            mcp_relative: Some("config.json"),
            skills_globs: vec!["checks/*.md"],
            instructions_relative: None,
            is_file_check: false,
        },
        // --- IDEs ---
        ToolDefinition {
            name: "VS Code",
            source_id: "vscode",
            #[cfg(target_os = "macos")]
            home_relative_paths: vec![".vscode", "Library/Application Support/Code"],
            #[cfg(not(target_os = "macos"))]
            home_relative_paths: vec![".vscode"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "Cursor",
            source_id: "cursor",
            home_relative_paths: vec![".cursor"],
            mcp_relative: Some("mcp.json"),
            skills_globs: vec!["skills-cursor/*/SKILL.md"],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "Windsurf",
            source_id: "windsurf",
            home_relative_paths: vec![".windsurf"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "Zed",
            source_id: "zed",
            home_relative_paths: vec![".config/zed"],
            mcp_relative: Some("settings.json"),
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "JetBrains",
            source_id: "jetbrains",
            #[cfg(target_os = "macos")]
            home_relative_paths: vec!["Library/Application Support/JetBrains"],
            #[cfg(not(target_os = "macos"))]
            home_relative_paths: vec![".local/share/JetBrains"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        ToolDefinition {
            name: "Cline",
            source_id: "cline",
            home_relative_paths: vec![".vscode/extensions"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
        // --- Terminal ---
        ToolDefinition {
            name: "Warp",
            source_id: "warp",
            home_relative_paths: vec![".warp"],
            mcp_relative: None,
            skills_globs: vec![],
            instructions_relative: None,
            is_file_check: false,
        },
    ]
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

pub fn scan() -> Vec<DetectedTool> {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return Vec::new(),
    };

    let registry = tool_registry();
    let mut detected = Vec::new();

    for def in &registry {
        if let Some(tool) = detect_tool(&home, def) {
            detected.push(tool);
        }
    }

    detected
}

fn detect_tool(home: &Path, def: &ToolDefinition) -> Option<DetectedTool> {
    // Special case for Cline: look for specific extension directory pattern
    if def.source_id == "cline" {
        return detect_cline(home);
    }

    // Find the first existing path
    let tool_path = def.home_relative_paths.iter().find_map(|rel| {
        let p = home.join(rel);
        if def.is_file_check {
            if p.is_file() {
                Some(p)
            } else {
                None
            }
        } else if p.is_dir() {
            Some(p)
        } else {
            None
        }
    })?;

    let mcp_config_path = def.mcp_relative.and_then(|rel| {
        let p = tool_path.join(rel);
        if p.is_file() {
            Some(p)
        } else {
            None
        }
    });

    let instructions_path = def.instructions_relative.and_then(|rel| {
        // Instructions may be in tool home or project root
        let in_tool = tool_path.join(rel);
        if in_tool.is_file() {
            return Some(in_tool);
        }
        // Also check home dir root (e.g. ~/CLAUDE.md)
        let in_home = home.join(rel);
        if in_home.is_file() {
            return Some(in_home);
        }
        None
    });

    // Check skills paths exist (just check if any glob pattern has results)
    let has_skills = !def.skills_globs.is_empty() && {
        def.skills_globs.iter().any(|pattern| {
            let full_pattern = tool_path.join(pattern);
            glob::glob(&full_pattern.to_string_lossy())
                .ok()
                .map(|mut iter| iter.next().is_some())
                .unwrap_or(false)
        })
    };

    // Collect concrete skill paths from globs
    let skills_paths: Vec<PathBuf> = def
        .skills_globs
        .iter()
        .flat_map(|pattern| {
            let full = tool_path.join(pattern);
            glob::glob(&full.to_string_lossy())
                .ok()
                .into_iter()
                .flatten()
                .filter_map(|r| r.ok())
        })
        .collect();

    Some(DetectedTool {
        name: def.name.to_string(),
        path: tool_path.clone(),
        has_mcp: mcp_config_path.is_some(),
        has_skills,
        has_instructions: instructions_path.is_some(),
        has_settings: mcp_config_path.is_some(), // settings ≈ config presence
        mcp_config_path,
        skills_paths,
        instructions_path,
    })
}

/// Special detection for Cline (VS Code extension).
fn detect_cline(home: &Path) -> Option<DetectedTool> {
    let ext_dir = home.join(".vscode").join("extensions");
    if !ext_dir.is_dir() {
        return None;
    }

    // Look for saoudrizwan.claude-dev-* directory
    let pattern = ext_dir.join("saoudrizwan.claude-dev-*");
    let cline_path = glob::glob(&pattern.to_string_lossy())
        .ok()?
        .filter_map(|r| r.ok())
        .find(|p| p.is_dir())?;

    Some(DetectedTool {
        name: "Cline".to_string(),
        path: cline_path,
        has_mcp: false,
        has_skills: false,
        has_instructions: false,
        has_settings: false,
        mcp_config_path: None,
        skills_paths: Vec::new(),
        instructions_path: None,
    })
}

// ---------------------------------------------------------------------------
// MCP Import
// ---------------------------------------------------------------------------

/// Import MCP server configs from all detected tools.
/// Best-effort: silently skips unparseable configs.
pub fn import_mcp_servers(detected: &[DetectedTool]) -> Vec<ImportedMcpServer> {
    let mut servers = Vec::new();

    for tool in detected {
        if let Some(ref mcp_path) = tool.mcp_config_path {
            let source_id = source_id_for(&tool.name);
            if let Ok(contents) = std::fs::read_to_string(mcp_path) {
                let imported = parse_mcp_config(&source_id, &contents, mcp_path);
                servers.extend(imported);
            }
        }
    }

    servers
}

pub fn global_mcp_config_path() -> Result<PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join(".mcp.json"))
}

pub fn import_mcp_servers_to_global(
    servers: &[ImportedMcpServer],
    dry_run: bool,
) -> Result<McpImportWriteReport> {
    merge_imported_mcp_servers_to_file(servers, &global_mcp_config_path()?, dry_run)
}

pub fn merge_imported_mcp_servers_to_file(
    servers: &[ImportedMcpServer],
    path: &Path,
    dry_run: bool,
) -> Result<McpImportWriteReport> {
    let mut root = if path.exists() {
        let contents = std::fs::read_to_string(path)
            .with_context(|| format!("read MCP config {}", path.display()))?;
        serde_json::from_str::<serde_json::Value>(&contents)
            .with_context(|| format!("parse MCP config {}", path.display()))?
    } else {
        serde_json::json!({})
    };

    if !root.is_object() {
        root = serde_json::json!({});
    }

    if root.get("mcpServers").is_none() {
        root["mcpServers"] = serde_json::json!({});
    }

    let mcp_servers = root
        .get_mut("mcpServers")
        .and_then(|value| value.as_object_mut())
        .context("mcpServers must be a JSON object")?;

    let mut added = Vec::new();
    let mut skipped_existing = Vec::new();

    for server in servers {
        if mcp_servers.contains_key(&server.name) {
            skipped_existing.push(server.name.clone());
            continue;
        }
        added.push(server.name.clone());
        if !dry_run {
            mcp_servers.insert(server.name.clone(), imported_mcp_server_to_json(server));
        }
    }

    if !dry_run && !added.is_empty() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("create MCP config dir {}", parent.display()))?;
        }
        let contents = serde_json::to_string_pretty(&root).context("serialize MCP config")?;
        std::fs::write(path, format!("{contents}\n"))
            .with_context(|| format!("write MCP config {}", path.display()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
        }
    }

    Ok(McpImportWriteReport {
        path: path.to_path_buf(),
        added,
        skipped_existing,
        dry_run,
    })
}

fn imported_mcp_server_to_json(server: &ImportedMcpServer) -> serde_json::Value {
    if let Some(command) = &server.command {
        let mut value = serde_json::json!({
            "command": command,
            "args": server.args,
        });
        if !server.env.is_empty() {
            value["env"] =
                serde_json::to_value(&server.env).unwrap_or_else(|_| serde_json::json!({}));
        }
        return value;
    }

    if let Some(url) = &server.url {
        return serde_json::json!({
            "transport": "sse",
            "url": url,
        });
    }

    serde_json::json!({})
}

pub fn migrate_claude_code(dry_run: bool) -> Result<ClaudeMigrationReport> {
    let home = dirs::home_dir().context("Could not determine home directory")?;
    let agi_config_dir = crate::config::CliConfig::config_dir()?;
    migrate_claude_code_from_home(&home, &agi_config_dir, dry_run)
}

pub fn migrate_claude_code_from_home(
    home: &Path,
    agi_config_dir: &Path,
    dry_run: bool,
) -> Result<ClaudeMigrationReport> {
    let claude_dir = home.join(".claude");
    let claude_mcp = claude_dir.join("mcp.json");
    let mcp_servers = if claude_mcp.is_file() {
        let contents = std::fs::read_to_string(&claude_mcp)
            .with_context(|| format!("read Claude MCP config {}", claude_mcp.display()))?;
        parse_json_mcp("claude", &contents, &claude_mcp)
    } else {
        Vec::new()
    };
    let mcp = merge_imported_mcp_servers_to_file(
        &mcp_servers,
        &agi_config_dir.join(".mcp.json"),
        dry_run,
    )?;

    let global_memory = copy_if_missing(
        &claude_dir.join("CLAUDE.md"),
        &home.join(".agiworkforce").join("CLAUDE.md"),
        dry_run,
    )?;

    let prompts = import_markdown_prompts(
        &claude_dir.join("commands"),
        &agi_config_dir.join("prompts").join("claude"),
        dry_run,
    )?;

    let skills = import_markdown_prompts(
        &claude_dir.join("skills"),
        &agi_config_dir.join("skills").join("claude"),
        dry_run,
    )?;

    let agents = import_markdown_prompts(
        &claude_dir.join("agents"),
        &agi_config_dir.join("agents").join("claude"),
        dry_run,
    )?;

    let hooks = copy_if_missing(
        &claude_dir.join("hooks.json"),
        &agi_config_dir
            .join("hooks")
            .join("claude")
            .join("hooks.json"),
        dry_run,
    )?;

    let settings = import_named_files(
        &claude_dir,
        &agi_config_dir.join("settings").join("claude"),
        &["settings.json", "settings.local.json"],
        dry_run,
    )?;

    let mut settings_files_detected: Vec<PathBuf> = ["settings.json", "settings.local.json"]
        .iter()
        .map(|name| claude_dir.join(name))
        .filter(|path| path.is_file())
        .collect();
    let legacy_settings = home.join(".claude.json");
    if legacy_settings.is_file() {
        settings_files_detected.push(legacy_settings);
    }

    let plugins_detected = ["plugins", "plugins.json"]
        .iter()
        .map(|name| claude_dir.join(name))
        .filter(|path| path.exists())
        .collect();

    Ok(ClaudeMigrationReport {
        claude_dir,
        mcp,
        global_memory,
        prompts,
        skills,
        agents,
        hooks,
        settings,
        settings_files_detected,
        plugins_detected,
        dry_run,
    })
}

pub fn format_claude_migration_report(report: &ClaudeMigrationReport) -> String {
    let mut out = String::new();
    if report.dry_run {
        out.push_str("Claude Code migration dry run\n");
    } else {
        out.push_str("Claude Code migration complete\n");
    }
    out.push_str(&format!("Source: {}\n", report.claude_dir.display()));
    out.push_str(&format!(
        "MCP:    {} added, {} already present -> {}\n",
        report.mcp.added.len(),
        report.mcp.skipped_existing.len(),
        report.mcp.path.display()
    ));
    out.push_str(&format!(
        "Memory: {} -> {}\n",
        format_file_copy_status(&report.global_memory.status),
        report.global_memory.target.display()
    ));
    out.push_str(&format!(
        "Prompts: {} added, {} already present -> {}\n",
        report.prompts.added.len(),
        report.prompts.skipped_existing.len(),
        report.prompts.target_dir.display()
    ));
    out.push_str(&format!(
        "Skills: {} added, {} already present -> {}\n",
        report.skills.added.len(),
        report.skills.skipped_existing.len(),
        report.skills.target_dir.display()
    ));
    out.push_str(&format!(
        "Agents: {} added, {} already present -> {}\n",
        report.agents.added.len(),
        report.agents.skipped_existing.len(),
        report.agents.target_dir.display()
    ));
    out.push_str(&format!(
        "Hooks:  {} -> {}\n",
        format_file_copy_status(&report.hooks.status),
        report.hooks.target.display()
    ));
    out.push_str(&format!(
        "Settings: {} added, {} already present -> {}\n",
        report.settings.added.len(),
        report.settings.skipped_existing.len(),
        report.settings.target_dir.display()
    ));
    if !report.settings_files_detected.is_empty() {
        out.push_str("Detected Claude settings:\n");
        for path in &report.settings_files_detected {
            out.push_str(&format!("  {}\n", path.display()));
        }
    }
    if !report.plugins_detected.is_empty() {
        out.push_str("Detected Claude plugins for manual review:\n");
        for path in &report.plugins_detected {
            out.push_str(&format!("  {}\n", path.display()));
        }
    }
    if report.mcp.added.is_empty()
        && report.prompts.added.is_empty()
        && report.skills.added.is_empty()
        && report.agents.added.is_empty()
        && report.settings.added.is_empty()
        && !matches!(
            report.global_memory.status,
            FileCopyStatus::Created | FileCopyStatus::DryRunCreate
        )
        && !matches!(
            report.hooks.status,
            FileCopyStatus::Created | FileCopyStatus::DryRunCreate
        )
    {
        out.push_str("No new files were imported.\n");
    }
    out
}

fn format_file_copy_status(status: &FileCopyStatus) -> &'static str {
    match status {
        FileCopyStatus::MissingSource => "source missing",
        FileCopyStatus::Created => "created",
        FileCopyStatus::ExistingTarget => "already present",
        FileCopyStatus::DryRunCreate => "would create",
    }
}

fn copy_if_missing(source: &Path, target: &Path, dry_run: bool) -> Result<FileCopyReport> {
    if !source.is_file() {
        return Ok(FileCopyReport {
            source: None,
            target: target.to_path_buf(),
            status: FileCopyStatus::MissingSource,
        });
    }

    if target.exists() {
        return Ok(FileCopyReport {
            source: Some(source.to_path_buf()),
            target: target.to_path_buf(),
            status: FileCopyStatus::ExistingTarget,
        });
    }

    if !dry_run {
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("create directory {}", parent.display()))?;
        }
        std::fs::copy(source, target)
            .with_context(|| format!("copy {} to {}", source.display(), target.display()))?;
    }

    Ok(FileCopyReport {
        source: Some(source.to_path_buf()),
        target: target.to_path_buf(),
        status: if dry_run {
            FileCopyStatus::DryRunCreate
        } else {
            FileCopyStatus::Created
        },
    })
}

fn import_named_files(
    source_dir: &Path,
    target_dir: &Path,
    names: &[&str],
    dry_run: bool,
) -> Result<FileImportReport> {
    if !source_dir.is_dir() {
        return Ok(FileImportReport {
            source_dir: source_dir.to_path_buf(),
            target_dir: target_dir.to_path_buf(),
            added: Vec::new(),
            skipped_existing: Vec::new(),
            missing_source: true,
            dry_run,
        });
    }

    let mut added = Vec::new();
    let mut skipped_existing = Vec::new();
    for name in names {
        let source = source_dir.join(name);
        if !source.is_file() {
            continue;
        }

        let target = target_dir.join(name);
        if target.exists() {
            skipped_existing.push(target);
            continue;
        }

        added.push(target.clone());
        if !dry_run {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)
                    .with_context(|| format!("create import dir {}", parent.display()))?;
            }
            std::fs::copy(&source, &target).with_context(|| {
                format!(
                    "copy import file {} to {}",
                    source.display(),
                    target.display()
                )
            })?;
        }
    }

    Ok(FileImportReport {
        source_dir: source_dir.to_path_buf(),
        target_dir: target_dir.to_path_buf(),
        added,
        skipped_existing,
        missing_source: false,
        dry_run,
    })
}

fn import_markdown_prompts(
    source_dir: &Path,
    target_dir: &Path,
    dry_run: bool,
) -> Result<PromptImportReport> {
    if !source_dir.is_dir() {
        return Ok(PromptImportReport {
            source_dir: source_dir.to_path_buf(),
            target_dir: target_dir.to_path_buf(),
            added: Vec::new(),
            skipped_existing: Vec::new(),
            missing_source: true,
            dry_run,
        });
    }

    let mut added = Vec::new();
    let mut skipped_existing = Vec::new();
    for source in markdown_files_recursive(source_dir)? {
        let relative = source.strip_prefix(source_dir).unwrap_or(source.as_path());
        let target = target_dir.join(relative);
        if target.exists() {
            skipped_existing.push(target);
            continue;
        }
        added.push(target.clone());
        if !dry_run {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent)
                    .with_context(|| format!("create prompt dir {}", parent.display()))?;
            }
            std::fs::copy(&source, &target).with_context(|| {
                format!("copy prompt {} to {}", source.display(), target.display())
            })?;
        }
    }

    Ok(PromptImportReport {
        source_dir: source_dir.to_path_buf(),
        target_dir: target_dir.to_path_buf(),
        added,
        skipped_existing,
        missing_source: false,
        dry_run,
    })
}

fn markdown_files_recursive(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_path_buf()];
    while let Some(current) = stack.pop() {
        for entry in std::fs::read_dir(&current)
            .with_context(|| format!("read prompt directory {}", current.display()))?
        {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                out.push(path);
            }
        }
    }
    out.sort();
    Ok(out)
}

/// Determine the short source ID from a tool name.
fn source_id_for(name: &str) -> String {
    match name {
        "Claude Code" => "claude".to_string(),
        "Codex CLI" => "codex".to_string(),
        "Gemini CLI" => "gemini".to_string(),
        "OpenCode" => "opencode".to_string(),
        "Copilot CLI" => "copilot".to_string(),
        "Continue.dev" => "continue".to_string(),
        "Cursor" => "cursor".to_string(),
        "Zed" => "zed".to_string(),
        other => other.to_lowercase().replace(' ', "-"),
    }
}

/// Parse MCP server configs from a file, dispatching by format.
fn parse_mcp_config(source: &str, contents: &str, path: &Path) -> Vec<ImportedMcpServer> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    match ext {
        "toml" => parse_toml_mcp(source, contents),
        "json" | "jsonc" => parse_json_mcp(source, contents, path),
        "yaml" | "yml" => Vec::new(),
        _ => parse_json_mcp(source, contents, path),
    }
}

/// Parse JSON-based MCP configs (Claude Code, Cursor, Copilot, Continue.dev, OpenCode).
fn parse_json_mcp(source: &str, contents: &str, path: &Path) -> Vec<ImportedMcpServer> {
    // Strip JSONC comments (// and /* */) for opencode.jsonc
    let clean = strip_jsonc_comments(contents);

    let parsed: serde_json::Value = match serde_json::from_str(&clean) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let mut servers = Vec::new();

    // Try "mcpServers" key (Claude Code, Cursor, Copilot standard)
    if let Some(mcp_obj) = parsed.get("mcpServers").and_then(|v| v.as_object()) {
        for (name, config) in mcp_obj {
            if let Some(srv) = json_server_entry(source, name, config) {
                servers.push(srv);
            }
        }
    }

    // Zed format: "context_servers" key
    if let Some(ctx_obj) = parsed.get("context_servers").and_then(|v| v.as_object()) {
        for (name, config) in ctx_obj {
            if let Some(srv) = json_server_entry(source, name, config) {
                servers.push(srv);
            }
        }
    }

    // Continue.dev: may have mcpServers nested inside the config
    if servers.is_empty() {
        // Try top-level flat format: { "server_name": { "command": "...", ... } }
        if let Some(obj) = parsed.as_object() {
            for (name, config) in obj {
                if name == "mcpServers" || name == "context_servers" {
                    continue;
                }
                // Only treat as server if it has a "command" or "url" key
                if config.get("command").is_some() || config.get("url").is_some() {
                    if let Some(srv) = json_server_entry(source, name, config) {
                        servers.push(srv);
                    }
                }
            }
        }
    }

    // If this is a Zed settings.json, log the path context
    let _ = path; // used for format dispatch above

    servers
}

/// Reject imported MCP server commands containing shell metacharacters to
/// prevent command injection from an untrusted config file. Returns `None`
/// (skipping the command) when metacharacters are present, regardless of the
/// source format (JSON or TOML).
fn sanitize_imported_command(source: &str, name: &str, command: &str) -> Option<String> {
    if command.contains(&['|', ';', '&', '$', '`', '\0'][..]) {
        eprintln!(
            "[ecosystem] Skipping imported MCP server '{}:{}': command contains shell metacharacters",
            source, name
        );
        return None;
    }
    Some(String::from(command))
}

/// Extract a single server entry from a JSON config value.
fn json_server_entry(
    source: &str,
    name: &str,
    config: &serde_json::Value,
) -> Option<ImportedMcpServer> {
    let command = config
        .get("command")
        .and_then(|v| v.as_str())
        .and_then(|c| sanitize_imported_command(source, name, c));

    let args: Vec<String> = config
        .get("args")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let env: HashMap<String, String> = config
        .get("env")
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default();

    let url = config.get("url").and_then(|v| v.as_str()).map(String::from);

    // Must have at least a command or URL
    if command.is_none() && url.is_none() {
        return None;
    }

    Some(ImportedMcpServer {
        name: format!("{}:{}", source, name),
        source: source.to_string(),
        original_name: name.to_string(),
        command,
        args,
        env,
        url,
    })
}

/// Parse TOML-based MCP configs (Codex CLI config.toml).
fn parse_toml_mcp(source: &str, contents: &str) -> Vec<ImportedMcpServer> {
    let parsed: toml::Value = match contents.parse() {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let mut servers = Vec::new();

    // Look for [mcp_servers."server-name"] tables
    if let Some(mcp_table) = parsed.get("mcp_servers").and_then(|v| v.as_table()) {
        for (name, config) in mcp_table {
            let command = config
                .get("command")
                .and_then(|v| v.as_str())
                .and_then(|c| sanitize_imported_command(source, name, c));

            let args: Vec<String> = config
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            let env: HashMap<String, String> = config
                .get("env")
                .and_then(|v| v.as_table())
                .map(|tbl| {
                    tbl.iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect()
                })
                .unwrap_or_default();

            let url = config.get("url").and_then(|v| v.as_str()).map(String::from);

            if command.is_none() && url.is_none() {
                continue;
            }

            servers.push(ImportedMcpServer {
                name: format!("{}:{}", source, name),
                source: source.to_string(),
                original_name: name.to_string(),
                command,
                args,
                env,
                url,
            });
        }
    }

    servers
}

/// Strip single-line (//) and multi-line (/* */) comments from JSONC content.
fn strip_jsonc_comments(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut in_string = false;
    let mut escape_next = false;

    while let Some(c) = chars.next() {
        if escape_next {
            out.push(c);
            escape_next = false;
            continue;
        }

        if in_string {
            out.push(c);
            if c == '\\' {
                escape_next = true;
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }

        if c == '"' {
            in_string = true;
            out.push(c);
            continue;
        }

        if c == '/' {
            if chars.peek() == Some(&'/') {
                chars.next();
                for ch in chars.by_ref() {
                    if ch == '\n' {
                        out.push('\n');
                        break;
                    }
                }
                continue;
            } else if chars.peek() == Some(&'*') {
                chars.next();
                let mut prev = ' ';
                for ch in chars.by_ref() {
                    if prev == '*' && ch == '/' {
                        break;
                    }
                    prev = ch;
                }
                continue;
            }
        }

        out.push(c);
    }

    out
}

// ---------------------------------------------------------------------------
// Skills Import
// ---------------------------------------------------------------------------

/// Discover skill file paths from all detected tools.
/// Returns paths to SKILL.md files (or other .md skill files).
pub fn discover_external_skills(detected: &[DetectedTool]) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for tool in detected {
        for skill_path in &tool.skills_paths {
            if skill_path.is_file() {
                paths.push(skill_path.clone());
            }
        }
    }
    paths
}

// ---------------------------------------------------------------------------
// Ecosystem Context Builder
// ---------------------------------------------------------------------------

/// Build the full ecosystem context from a scan.
pub fn build_context(detected: &[DetectedTool]) -> EcosystemContext {
    let mut instructions = Vec::new();

    for tool in detected {
        if let Some(ref ipath) = tool.instructions_path {
            let size = std::fs::metadata(ipath).map(|m| m.len()).unwrap_or(0);
            instructions.push(InstructionRef {
                tool: tool.name.clone(),
                path: ipath.clone(),
                size_bytes: size,
            });
        }
    }

    let mcp_count = detected.iter().filter(|t| t.has_mcp).count();
    let skills_count: usize = detected.iter().map(|t| t.skills_paths.len()).sum();

    EcosystemContext {
        detected_tools: detected.to_vec(),
        available_instructions: instructions,
        imported_mcp_count: mcp_count,
        imported_skills_count: skills_count,
    }
}

/// Format ecosystem context as a system prompt section.
#[allow(dead_code)]
pub fn format_ecosystem_prompt(ctx: &EcosystemContext) -> String {
    if ctx.detected_tools.is_empty() {
        return String::new();
    }

    let mut out = String::from("\n<ecosystem>\nDetected AI tools on this machine:\n");

    for tool in &ctx.detected_tools {
        let mut features = Vec::new();

        if tool.has_mcp {
            features.push("MCP config".to_string());
        }
        if !tool.skills_paths.is_empty() {
            features.push(format!("{} skills", tool.skills_paths.len()));
        }
        if let Some(ref ipath) = tool.instructions_path {
            let filename = ipath
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or("instructions");
            features.push(format!("{} available", filename));
        }
        if features.is_empty() {
            features.push("installed".to_string());
        }

        out.push_str(&format!(
            "- {} ({}), {}\n",
            tool.name,
            tool.path.display(),
            features.join(", ")
        ));
    }

    out.push_str(
        "\nTo read instructions from another tool, use the file path directly.\n</ecosystem>",
    );
    out
}

/// Format a CLI-friendly table of detected tools.
pub fn format_table(detected: &[DetectedTool]) -> String {
    if detected.is_empty() {
        return "No AI tools or IDEs detected on this machine.".to_string();
    }

    let mut out = String::new();
    out.push_str(&format!(
        "{:<18} {:<45} {:>4} {:>6} {:>6}\n",
        "Tool", "Path", "MCP", "Skills", "Instr"
    ));
    out.push_str(&"-".repeat(83));
    out.push('\n');

    for tool in detected {
        let path_str = tool.path.to_string_lossy();
        let path_display = if path_str.len() > 42 {
            format!("...{}", &path_str[path_str.len() - 39..])
        } else {
            path_str.to_string()
        };

        out.push_str(&format!(
            "{:<18} {:<45} {:>4} {:>6} {:>6}\n",
            tool.name,
            path_display,
            if tool.has_mcp { "yes" } else { "-" },
            if tool.skills_paths.is_empty() {
                "-".to_string()
            } else {
                tool.skills_paths.len().to_string()
            },
            if tool.has_instructions { "yes" } else { "-" },
        ));
    }

    out.push_str(&format!("\n{} tools detected.", detected.len()));

    out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_no_crash() {
        // Should not crash even if no tools exist
        let detected = scan();
        let _ = detected;
    }

    #[test]
    fn test_import_mcp_empty() {
        let servers = import_mcp_servers(&[]);
        assert!(servers.is_empty());
    }

    #[test]
    fn test_parse_json_mcp_claude_format() {
        let json = r#"{"mcpServers":{"stripe":{"command":"npx","args":["-y","@stripe/mcp"],"env":{"STRIPE_KEY":"sk_test"}}}}"#;
        let servers = parse_json_mcp("claude", json, Path::new("mcp.json"));
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "claude:stripe");
        assert_eq!(servers[0].original_name, "stripe");
        assert_eq!(servers[0].command, Some("npx".to_string()));
        assert_eq!(servers[0].args, vec!["-y", "@stripe/mcp"]);
        assert_eq!(
            servers[0].env.get("STRIPE_KEY"),
            Some(&"sk_test".to_string())
        );
    }

    #[test]
    fn test_parse_json_mcp_zed_format() {
        let json = r#"{"context_servers":{"my-server":{"command":"node","args":["server.js"]}}}"#;
        let servers = parse_json_mcp("zed", json, Path::new("settings.json"));
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "zed:my-server");
    }

    #[test]
    fn test_parse_toml_mcp_codex_format() {
        let toml_str = r#"
[mcp_servers."playwright"]
command = "npx"
args = ["-y", "@playwright/mcp"]

[mcp_servers."github"]
command = "gh"
args = ["mcp"]
"#;
        let servers = parse_toml_mcp("codex", toml_str);
        assert_eq!(servers.len(), 2);
        let names: Vec<&str> = servers.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"codex:playwright"));
        assert!(names.contains(&"codex:github"));
    }

    #[test]
    fn test_parse_json_mcp_invalid_json() {
        let servers = parse_json_mcp("test", "not json {{{", Path::new("bad.json"));
        assert!(servers.is_empty());
    }

    #[test]
    fn test_parse_toml_mcp_invalid_toml() {
        let servers = parse_toml_mcp("test", "not valid toml [[[");
        assert!(servers.is_empty());
    }

    #[test]
    fn test_strip_jsonc_comments() {
        let input = r#"{
  // This is a comment
  "key": "value", // inline comment
  /* multi
     line */
  "key2": "val2"
}"#;
        let clean = strip_jsonc_comments(input);
        let parsed: serde_json::Value = serde_json::from_str(&clean).unwrap();
        assert_eq!(parsed["key"], "value");
        assert_eq!(parsed["key2"], "val2");
    }

    #[test]
    fn test_strip_jsonc_preserves_strings() {
        let input = r#"{"url": "https://example.com/path"}"#;
        let clean = strip_jsonc_comments(input);
        let parsed: serde_json::Value = serde_json::from_str(&clean).unwrap();
        assert_eq!(parsed["url"], "https://example.com/path");
    }

    #[test]
    fn test_source_id_for() {
        assert_eq!(source_id_for("Claude Code"), "claude");
        assert_eq!(source_id_for("Codex CLI"), "codex");
        assert_eq!(source_id_for("Zed"), "zed");
        assert_eq!(source_id_for("VS Code"), "vs-code");
    }

    #[test]
    fn test_format_table_empty() {
        let out = format_table(&[]);
        assert!(out.contains("No AI tools"));
    }

    #[test]
    fn test_format_table_with_tools() {
        let tools = vec![DetectedTool {
            name: "TestTool".to_string(),
            path: PathBuf::from("/home/user/.test"),
            has_mcp: true,
            has_skills: true,
            has_instructions: false,
            has_settings: true,
            mcp_config_path: Some(PathBuf::from("/home/user/.test/mcp.json")),
            skills_paths: vec![PathBuf::from("/home/user/.test/skills/a.md")],
            instructions_path: None,
        }];
        let out = format_table(&tools);
        assert!(out.contains("TestTool"));
        assert!(out.contains("yes")); // MCP
        assert!(out.contains("1 tools detected"));
    }

    #[test]
    fn test_format_ecosystem_prompt_empty() {
        let ctx = EcosystemContext {
            detected_tools: vec![],
            available_instructions: vec![],
            imported_mcp_count: 0,
            imported_skills_count: 0,
        };
        assert!(format_ecosystem_prompt(&ctx).is_empty());
    }

    #[test]
    fn test_format_ecosystem_prompt_with_tools() {
        let ctx = EcosystemContext {
            detected_tools: vec![DetectedTool {
                name: "Claude Code".to_string(),
                path: PathBuf::from("/home/.claude"),
                has_mcp: true,
                has_skills: false,
                has_instructions: true,
                has_settings: true,
                mcp_config_path: Some(PathBuf::from("/home/.claude/mcp.json")),
                skills_paths: vec![],
                instructions_path: Some(PathBuf::from("/home/.claude/CLAUDE.md")),
            }],
            available_instructions: vec![InstructionRef {
                tool: "Claude Code".to_string(),
                path: PathBuf::from("/home/.claude/CLAUDE.md"),
                size_bytes: 1024,
            }],
            imported_mcp_count: 1,
            imported_skills_count: 0,
        };
        let prompt = format_ecosystem_prompt(&ctx);
        assert!(prompt.contains("<ecosystem>"));
        assert!(prompt.contains("Claude Code"));
        assert!(prompt.contains("CLAUDE.md available"));
        assert!(prompt.contains("</ecosystem>"));
    }

    #[test]
    fn test_discover_external_skills_empty() {
        let paths = discover_external_skills(&[]);
        assert!(paths.is_empty());
    }

    #[test]
    fn test_build_context_no_tools() {
        let ctx = build_context(&[]);
        assert!(ctx.detected_tools.is_empty());
        assert_eq!(ctx.imported_mcp_count, 0);
        assert_eq!(ctx.imported_skills_count, 0);
    }

    #[test]
    fn test_json_server_entry_command() {
        let config = serde_json::json!({"command": "npx", "args": ["-y", "foo"]});
        let srv = json_server_entry("test", "myserver", &config).unwrap();
        assert_eq!(srv.name, "test:myserver");
        assert_eq!(srv.command, Some("npx".to_string()));
        assert_eq!(srv.args, vec!["-y", "foo"]);
    }

    #[test]
    fn test_json_server_entry_url() {
        let config = serde_json::json!({"url": "http://localhost:3000/sse"});
        let srv = json_server_entry("test", "remote", &config).unwrap();
        assert_eq!(srv.url, Some("http://localhost:3000/sse".to_string()));
        assert!(srv.command.is_none());
    }

    #[test]
    fn test_json_server_entry_no_command_or_url() {
        let config = serde_json::json!({"description": "just metadata"});
        let srv = json_server_entry("test", "empty", &config);
        assert!(srv.is_none());
    }

    #[test]
    fn test_merge_imported_mcp_servers_writes_nested_loader_compatible_json() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = tmp.path().join(".mcp.json");
        let servers = vec![
            ImportedMcpServer {
                name: "claude:stripe".into(),
                source: "claude".into(),
                original_name: "stripe".into(),
                command: Some("npx".into()),
                args: vec!["-y".into(), "@stripe/mcp".into()],
                env: HashMap::new(),
                url: None,
            },
            ImportedMcpServer {
                name: "claude:remote".into(),
                source: "claude".into(),
                original_name: "remote".into(),
                command: None,
                args: Vec::new(),
                env: HashMap::new(),
                url: Some("http://localhost:3000/sse".into()),
            },
        ];

        let report = merge_imported_mcp_servers_to_file(&servers, &path, false).unwrap();

        assert_eq!(report.added, vec!["claude:stripe", "claude:remote"]);
        let parsed: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(parsed["mcpServers"]["claude:stripe"]["command"], "npx");
        assert_eq!(parsed["mcpServers"]["claude:remote"]["transport"], "sse");

        let second = merge_imported_mcp_servers_to_file(&servers, &path, false).unwrap();
        assert!(second.added.is_empty());
        assert_eq!(
            second.skipped_existing,
            vec!["claude:stripe", "claude:remote"]
        );
    }

    #[test]
    fn test_migrate_claude_code_imports_memory_mcp_and_commands() {
        let home = tempfile::tempdir().expect("home");
        let agi = tempfile::tempdir().expect("agi");
        let claude = home.path().join(".claude");
        std::fs::create_dir_all(claude.join("commands/nested")).unwrap();
        std::fs::create_dir_all(claude.join("skills/reviewer")).unwrap();
        std::fs::create_dir_all(claude.join("agents")).unwrap();
        std::fs::create_dir_all(claude.join("plugins/cache/example")).unwrap();
        std::fs::write(
            claude.join("mcp.json"),
            r#"{"mcpServers":{"docs":{"command":"node","args":["server.js"]}}}"#,
        )
        .unwrap();
        std::fs::write(claude.join("CLAUDE.md"), "global instructions").unwrap();
        std::fs::write(claude.join("commands/review.md"), "review prompt").unwrap();
        std::fs::write(claude.join("commands/nested/fix.md"), "fix prompt").unwrap();
        std::fs::write(claude.join("skills/reviewer/SKILL.md"), "review skill").unwrap();
        std::fs::write(claude.join("agents/explorer.md"), "explorer agent").unwrap();
        std::fs::write(claude.join("hooks.json"), r#"{"hooks":[]}"#).unwrap();
        std::fs::write(claude.join("settings.json"), "{}").unwrap();
        std::fs::write(claude.join("settings.local.json"), "{}").unwrap();
        std::fs::write(home.path().join(".claude.json"), "{}").unwrap();

        let report = migrate_claude_code_from_home(home.path(), agi.path(), false).unwrap();

        assert_eq!(report.mcp.added, vec!["claude:docs"]);
        assert_eq!(report.global_memory.status, FileCopyStatus::Created);
        assert!(home.path().join(".agiworkforce/CLAUDE.md").is_file());
        assert!(agi.path().join("prompts/claude/review.md").is_file());
        assert!(agi.path().join("prompts/claude/nested/fix.md").is_file());
        assert!(agi.path().join("skills/claude/reviewer/SKILL.md").is_file());
        assert!(agi.path().join("agents/claude/explorer.md").is_file());
        assert!(agi.path().join("hooks/claude/hooks.json").is_file());
        assert!(agi.path().join("settings/claude/settings.json").is_file());
        assert!(agi
            .path()
            .join("settings/claude/settings.local.json")
            .is_file());
        assert_eq!(report.prompts.added.len(), 2);
        assert_eq!(report.skills.added.len(), 1);
        assert_eq!(report.agents.added.len(), 1);
        assert_eq!(report.hooks.status, FileCopyStatus::Created);
        assert_eq!(report.settings.added.len(), 2);
        assert_eq!(report.settings_files_detected.len(), 3);
        assert_eq!(report.plugins_detected.len(), 1);
    }

    #[test]
    fn test_migrate_claude_code_dry_run_does_not_write() {
        let home = tempfile::tempdir().expect("home");
        let agi = tempfile::tempdir().expect("agi");
        let claude = home.path().join(".claude");
        std::fs::create_dir_all(claude.join("commands")).unwrap();
        std::fs::write(
            claude.join("mcp.json"),
            r#"{"mcpServers":{"docs":{"command":"node"}}}"#,
        )
        .unwrap();
        std::fs::write(claude.join("CLAUDE.md"), "global instructions").unwrap();
        std::fs::write(claude.join("commands/review.md"), "review prompt").unwrap();
        std::fs::create_dir_all(claude.join("skills/reviewer")).unwrap();
        std::fs::write(claude.join("skills/reviewer/SKILL.md"), "review skill").unwrap();
        std::fs::write(claude.join("hooks.json"), r#"{"hooks":[]}"#).unwrap();
        std::fs::write(claude.join("settings.json"), "{}").unwrap();

        let report = migrate_claude_code_from_home(home.path(), agi.path(), true).unwrap();

        assert!(report.dry_run);
        assert_eq!(report.global_memory.status, FileCopyStatus::DryRunCreate);
        assert_eq!(report.hooks.status, FileCopyStatus::DryRunCreate);
        assert!(!home.path().join(".agiworkforce/CLAUDE.md").exists());
        assert!(!agi.path().join(".mcp.json").exists());
        assert!(!agi.path().join("prompts/claude/review.md").exists());
        assert!(!agi.path().join("skills/claude/reviewer/SKILL.md").exists());
        assert!(!agi.path().join("hooks/claude/hooks.json").exists());
        assert!(!agi.path().join("settings/claude/settings.json").exists());
    }
}
