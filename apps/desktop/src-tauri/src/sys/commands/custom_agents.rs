use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAgentConfig {
    pub name: String,
    pub model: Option<String>,
    pub description: String,
    pub system_prompt: String,
    pub allowed_tools: Option<Vec<String>>,
    pub scope: String, // "global" or "project"
}

/// Internal frontmatter structure matching the .md file YAML header.
///
/// `tools` is the canonical tool-allowlist key: the agent files written here are
/// consumed by the CLI, whose frontmatter reader only recognises `tools:`
/// (`apps/cli/src/agents.rs`, `parse_agent_frontmatter`). `allowed_tools` is
/// read as well so agent files written by earlier desktop builds keep showing
/// their allowlist in the editor; it is never written any more.
#[derive(Debug, Deserialize, Serialize)]
struct AgentFrontmatter {
    name: Option<String>,
    model: Option<String>,
    description: Option<String>,
    tools: Option<Vec<String>>,
    allowed_tools: Option<Vec<String>>,
}

/// Parse a .md agent file that uses YAML frontmatter.
/// Format:
/// ---
/// name: my-agent
/// model: claude-sonnet-5
/// description: Does things
/// ---
///
/// System prompt body here.
fn parse_agent_file(path: &PathBuf, scope: &str) -> Result<CustomAgentConfig, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;

    let content = content.trim_start();

    if let Some(rest) = content.strip_prefix("---") {
        // Find the closing ---
        if let Some(end_idx) = rest.find("\n---") {
            let yaml_str = &rest[..end_idx];
            let body_start = end_idx + 4; // skip "\n---"
            let body = rest[body_start..].trim_start().to_string();

            let fm: AgentFrontmatter = serde_yaml::from_str(yaml_str).map_err(|e| {
                format!(
                    "Failed to parse YAML frontmatter in {}: {e}",
                    path.display()
                )
            })?;

            let name = fm.name.unwrap_or_else(|| {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_string()
            });

            return Ok(CustomAgentConfig {
                name,
                model: fm.model,
                description: fm.description.unwrap_or_default(),
                system_prompt: body,
                allowed_tools: fm.tools.or(fm.allowed_tools),
                scope: scope.to_string(),
            });
        }
    }

    // No frontmatter — treat the whole file as the system prompt, use the filename as name.
    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(CustomAgentConfig {
        name,
        model: None,
        description: String::new(),
        system_prompt: content.to_string(),
        allowed_tools: None,
        scope: scope.to_string(),
    })
}

/// Read all .md agent files from a directory and return their parsed configs.
fn read_agents_from_dir(dir: &PathBuf, scope: &str) -> Result<Vec<CustomAgentConfig>, String> {
    let mut agents = Vec::new();

    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {}: {e}", dir.display()))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Directory entry error: {e}"))?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) == Some("md") {
            match parse_agent_file(&path, scope) {
                Ok(agent) => agents.push(agent),
                Err(e) => {
                    tracing::warn!("Skipping malformed agent file {}: {e}", path.display());
                }
            }
        }
    }

    Ok(agents)
}

/// Resolve the agents directory for the given scope.
fn agents_dir(scope: &str) -> Result<PathBuf, String> {
    match scope {
        "global" => dirs::home_dir()
            .map(|h| h.join(".claude").join("agents"))
            .ok_or_else(|| "Cannot determine home directory".to_string()),
        "project" => std::env::current_dir()
            .map(|d| d.join(".claude").join("agents"))
            .map_err(|e| format!("Cannot determine current directory: {e}")),
        other => Err(format!(
            "Unknown scope '{other}'. Expected 'global' or 'project'"
        )),
    }
}

/// Quote a YAML scalar value if it contains special characters that would
/// break plain (unquoted) YAML. Uses double-quoting with backslash escapes.
/// Safe values are returned as-is to keep frontmatter readable.
fn quote_yaml_value(value: &str) -> String {
    // Characters that require quoting in YAML plain scalars
    let needs_quoting = value.is_empty()
        || value.starts_with(' ')
        || value.ends_with(' ')
        || value.contains(|c: char| {
            [
                ':', '#', '"', '\'', '[', ']', '{', '}', ',', '&', '*', '!', '|', '>', '%', '@',
                '`', '\n', '\r',
            ]
            .contains(&c)
        });

    if needs_quoting {
        let escaped = value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r");
        format!("\"{escaped}\"")
    } else {
        value.to_string()
    }
}

/// Sanitize an agent name so it is safe to use as a filename.
/// Allows alphanumerics, hyphens, underscores, and dots. Strips everything else.
fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect()
}

/// List all custom agent configurations from global (~/.claude/agents/) and
/// project (.claude/agents/) directories.
#[tauri::command]
pub async fn list_custom_agents() -> Result<Vec<CustomAgentConfig>, String> {
    let mut agents = Vec::new();

    let global_dir = dirs::home_dir()
        .map(|h| h.join(".claude").join("agents"))
        .unwrap_or_default();

    if global_dir.exists() {
        agents.extend(read_agents_from_dir(&global_dir, "global")?);
    }

    let project_dir = std::env::current_dir()
        .map(|d| d.join(".claude").join("agents"))
        .unwrap_or_default();

    if project_dir.exists() {
        agents.extend(read_agents_from_dir(&project_dir, "project")?);
    }

    Ok(agents)
}

/// Render one agent config as the `.md` file that goes on disk.
///
/// The on-disk format is the interface: nothing in the desktop app runs a custom
/// agent, so the only consumer of these files is the CLI's agent loader
/// (`apps/cli/src/agents.rs`, `discover_agents`). Two details are therefore
/// dictated by that reader rather than by taste:
///
///   * the tool allowlist key is `tools`, not `allowed_tools` — the CLI's
///     line-based frontmatter parser matches on `tools:` only;
///   * it is written as an INLINE list (`tools: [Read, Bash]`), because the same
///     parser reads values off a single line and would see a YAML block sequence
///     as an empty list, silently dropping the allowlist.
///
/// Tool names come from a fixed identifier set in the editor
/// (`CustomAgentEditor.tsx`, `TOOL_OPTIONS`), so the inline form cannot be
/// broken by a comma inside a name.
fn build_agent_markdown(config: &CustomAgentConfig) -> String {
    let mut frontmatter = format!("name: {}\n", quote_yaml_value(config.name.trim()));

    if let Some(model) = &config.model {
        if !model.trim().is_empty() {
            frontmatter.push_str(&format!("model: {}\n", quote_yaml_value(model.trim())));
        }
    }

    if !config.description.trim().is_empty() {
        // Use block scalar if multiline, otherwise inline
        if config.description.contains('\n') {
            frontmatter.push_str("description: |\n");
            for line in config.description.trim().lines() {
                frontmatter.push_str(&format!("  {line}\n"));
            }
        } else {
            frontmatter.push_str(&format!(
                "description: {}\n",
                quote_yaml_value(config.description.trim())
            ));
        }
    }

    if let Some(tools) = &config.allowed_tools {
        if !tools.is_empty() {
            let rendered = tools
                .iter()
                .map(|tool| quote_yaml_value(tool))
                .collect::<Vec<_>>()
                .join(", ");
            frontmatter.push_str(&format!("tools: [{rendered}]\n"));
        }
    }

    format!(
        "---\n{frontmatter}---\n\n{}",
        config.system_prompt.trim_start()
    )
}

/// Save (create or overwrite) a custom agent configuration as a .md file with YAML frontmatter.
#[tauri::command]
pub async fn save_custom_agent(config: CustomAgentConfig) -> Result<(), String> {
    if config.name.trim().is_empty() {
        return Err("Agent name cannot be empty".to_string());
    }

    let dir = agents_dir(&config.scope)?;

    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Failed to create agents directory: {e}"))?;

    let filename = sanitize_filename(config.name.trim());
    let path = dir.join(format!("{filename}.md"));

    tokio::fs::write(&path, build_agent_markdown(&config))
        .await
        .map_err(|e| format!("Failed to write agent file: {e}"))?;

    tracing::info!("Custom agent '{}' saved to {:?}", config.name, path);
    Ok(())
}

/// Delete a custom agent configuration file.
#[tauri::command]
pub async fn delete_custom_agent(name: String, scope: String) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("Agent name cannot be empty".to_string());
    }

    let dir = agents_dir(&scope)?;
    let filename = sanitize_filename(name.trim());
    let path = dir.join(format!("{filename}.md"));

    if !path.exists() {
        return Err(format!("Agent file not found: {}", path.display()));
    }

    tokio::fs::remove_file(&path)
        .await
        .map_err(|e| format!("Failed to delete agent file: {e}"))?;

    tracing::info!("Custom agent '{}' deleted from {:?}", name, path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_with_tools(tools: Option<Vec<String>>) -> CustomAgentConfig {
        CustomAgentConfig {
            name: "reviewer".to_string(),
            model: None,
            description: "Reviews diffs".to_string(),
            system_prompt: "You review code.".to_string(),
            allowed_tools: tools,
            scope: "global".to_string(),
        }
    }

    /// The CLI's frontmatter reader, reproduced exactly as
    /// `apps/cli/src/agents.rs` implements it: line-based, matching on `tools:`
    /// and parsing the remainder of THAT line as an inline list. If the desktop
    /// writer drifts from what this accepts, an allowlist a user set in the
    /// editor is silently dropped when the agent runs under the CLI.
    fn cli_reads_tool_allowlist(markdown: &str) -> Option<Vec<String>> {
        let trimmed = markdown.trim_start();
        let after_first = trimmed.strip_prefix("---")?.trim_start_matches('\n');
        let end = after_first.find("\n---")?;
        for line in after_first[..end].lines() {
            if let Some(value) = line.trim().strip_prefix("tools:") {
                let value = value.trim();
                let inner = value
                    .strip_prefix('[')
                    .and_then(|s| s.strip_suffix(']'))
                    .unwrap_or(value);
                return Some(
                    inner
                        .split(',')
                        .map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
                        .filter(|s| !s.is_empty())
                        .collect(),
                );
            }
        }
        None
    }

    #[test]
    fn written_allowlist_is_readable_by_the_cli_agent_loader() {
        let markdown = build_agent_markdown(&config_with_tools(Some(vec![
            "Read".to_string(),
            "Bash".to_string(),
        ])));

        assert_eq!(
            cli_reads_tool_allowlist(&markdown),
            Some(vec!["Read".to_string(), "Bash".to_string()]),
            "the CLI must see the allowlist the desktop editor saved; got:\n{markdown}"
        );
    }

    #[test]
    fn an_empty_allowlist_writes_no_tools_key() {
        let markdown = build_agent_markdown(&config_with_tools(None));
        assert!(
            cli_reads_tool_allowlist(&markdown).is_none(),
            "no allowlist must stay absent rather than become an empty whitelist:\n{markdown}"
        );
    }

    #[test]
    fn round_trips_through_the_desktop_reader() {
        let dir = tempfile::TempDir::new().expect("temp dir");
        let path = dir.path().join("reviewer.md");
        let markdown = build_agent_markdown(&config_with_tools(Some(vec!["Grep".to_string()])));
        std::fs::write(&path, markdown).expect("write agent");

        let parsed = parse_agent_file(&path, "global").expect("parse agent");
        assert_eq!(parsed.allowed_tools, Some(vec!["Grep".to_string()]));
        assert_eq!(parsed.name, "reviewer");
    }

    #[test]
    fn still_reads_the_legacy_allowed_tools_key() {
        let dir = tempfile::TempDir::new().expect("temp dir");
        let path = dir.path().join("legacy.md");
        std::fs::write(
            &path,
            "---\nname: legacy\nallowed_tools:\n  - Read\n---\n\nBody.\n",
        )
        .expect("write legacy agent");

        let parsed = parse_agent_file(&path, "global").expect("parse legacy agent");
        assert_eq!(
            parsed.allowed_tools,
            Some(vec!["Read".to_string()]),
            "agent files written by earlier desktop builds must keep their allowlist"
        );
    }
}
