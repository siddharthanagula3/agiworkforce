//! Custom slash commands loaded from project/user markdown files.
//!
//! Supported roots:
//! - `.agiworkforce/commands/**/*.md`
//! - `~/.agiworkforce/commands/**/*.md`
//! - `~/.agiworkforce/prompts/claude/**/*.md` for commands imported from Claude Code
//! - `.claude/commands/**/*.md` and `~/.claude/commands/**/*.md` for direct compatibility

use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CustomCommandSource {
    ProjectAgi,
    UserAgi,
    ImportedClaude,
    ProjectClaude,
    UserClaude,
}

impl CustomCommandSource {
    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::ProjectAgi => "project .agiworkforce/commands",
            Self::UserAgi => "user .agiworkforce/commands",
            Self::ImportedClaude => "imported Claude commands",
            Self::ProjectClaude => "project .claude/commands",
            Self::UserClaude => "user .claude/commands",
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct CustomSlashCommand {
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) argument_hint: Option<String>,
    pub(crate) content: String,
    pub(crate) path: PathBuf,
    pub(crate) source: CustomCommandSource,
}

#[derive(Debug, Clone)]
struct CustomCommandRoot {
    path: PathBuf,
    source: CustomCommandSource,
}

pub(crate) fn discover_custom_slash_commands() -> Vec<CustomSlashCommand> {
    discover_custom_slash_commands_from_roots(default_roots())
}

pub(crate) fn expand_custom_slash_invocation(input: &str) -> Option<String> {
    let (name, args) = parse_custom_invocation(input)?;
    let commands = discover_custom_slash_commands();
    let command = commands
        .iter()
        .find(|command| command.name.eq_ignore_ascii_case(name))?;
    Some(expand_custom_command(command, args))
}

pub(crate) fn expand_custom_command(command: &CustomSlashCommand, args: &str) -> String {
    let positional = split_positional_args(args);
    let mut out = command.content.clone();

    if out.contains("$ARGUMENTS") {
        out = out.replace("$ARGUMENTS", args);
    }
    for index in 1..=9 {
        let placeholder = format!("${index}");
        let replacement = positional.get(index - 1).map(String::as_str).unwrap_or("");
        out = out.replace(&placeholder, replacement);
    }

    if out == command.content && !args.trim().is_empty() {
        out.push_str("\n\n");
        out.push_str(args.trim());
    }

    out
}

fn default_roots() -> Vec<CustomCommandRoot> {
    let mut roots = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(CustomCommandRoot {
            path: cwd.join(".agiworkforce").join("commands"),
            source: CustomCommandSource::ProjectAgi,
        });
        roots.push(CustomCommandRoot {
            path: cwd.join(".claude").join("commands"),
            source: CustomCommandSource::ProjectClaude,
        });
    }
    if let Some(home) = dirs::home_dir() {
        roots.push(CustomCommandRoot {
            path: home.join(".agiworkforce").join("commands"),
            source: CustomCommandSource::UserAgi,
        });
        roots.push(CustomCommandRoot {
            path: home.join(".agiworkforce").join("prompts").join("claude"),
            source: CustomCommandSource::ImportedClaude,
        });
        roots.push(CustomCommandRoot {
            path: home.join(".claude").join("commands"),
            source: CustomCommandSource::UserClaude,
        });
    }
    roots
}

fn discover_custom_slash_commands_from_roots(
    roots: Vec<CustomCommandRoot>,
) -> Vec<CustomSlashCommand> {
    let mut seen = HashSet::new();
    let mut commands = Vec::new();

    for root in roots {
        if !root.path.is_dir() {
            continue;
        }
        for path in markdown_files_recursive(&root.path) {
            let Some(name) = command_name_for_path(&root.path, &path) else {
                continue;
            };
            if !seen.insert(name.clone()) {
                continue;
            }
            let Ok(raw) = std::fs::read_to_string(&path) else {
                continue;
            };
            let parsed = parse_command_markdown(&raw);
            commands.push(CustomSlashCommand {
                name,
                description: parsed.description,
                argument_hint: parsed.argument_hint,
                content: parsed.content,
                path,
                source: root.source,
            });
        }
    }

    commands.sort_by(|left, right| left.name.cmp(&right.name));
    commands
}

fn markdown_files_recursive(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(current) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                out.push(path);
            }
        }
    }
    out.sort();
    out
}

fn command_name_for_path(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let mut parts = Vec::new();
    for component in relative.components() {
        let value = component.as_os_str().to_string_lossy();
        let value = value.strip_suffix(".md").unwrap_or(&value);
        let normalized = normalize_command_component(value);
        if normalized.is_empty() {
            return None;
        }
        parts.push(normalized);
    }
    (!parts.is_empty()).then(|| parts.join(":"))
}

fn normalize_command_component(value: &str) -> String {
    let mut out = String::new();
    let mut last_was_dash = false;
    for ch in value.trim().chars() {
        if ch.is_ascii_alphanumeric() || ch == '.' {
            out.push(ch.to_ascii_lowercase());
            last_was_dash = false;
        } else if matches!(ch, '-' | '_' | ' ' | '\t') && !last_was_dash && !out.is_empty() {
            out.push('-');
            last_was_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

struct ParsedCommandMarkdown {
    description: String,
    argument_hint: Option<String>,
    content: String,
}

fn parse_command_markdown(raw: &str) -> ParsedCommandMarkdown {
    let (frontmatter, content) = split_frontmatter(raw);
    let description = frontmatter
        .iter()
        .find_map(|(key, value)| (key == "description").then(|| value.clone()))
        .or_else(|| first_content_description(&content))
        .unwrap_or_else(|| "Custom slash command".to_string());
    let argument_hint = frontmatter.iter().find_map(|(key, value)| {
        matches!(key.as_str(), "argument-hint" | "argument_hint" | "args").then(|| value.clone())
    });

    ParsedCommandMarkdown {
        description,
        argument_hint,
        content,
    }
}

fn split_frontmatter(raw: &str) -> (Vec<(String, String)>, String) {
    let mut lines = raw.lines();
    if lines.next() != Some("---") {
        return (Vec::new(), raw.trim().to_string());
    }

    let mut frontmatter = Vec::new();
    let mut body = Vec::new();
    let mut in_frontmatter = true;
    for line in lines {
        if in_frontmatter {
            if line.trim() == "---" {
                in_frontmatter = false;
                continue;
            }
            if let Some((key, value)) = line.split_once(':') {
                frontmatter.push((
                    key.trim().to_ascii_lowercase(),
                    value.trim().trim_matches('"').to_string(),
                ));
            }
        } else {
            body.push(line);
        }
    }

    if in_frontmatter {
        return (Vec::new(), raw.trim().to_string());
    }

    (frontmatter, body.join("\n").trim().to_string())
}

fn first_content_description(content: &str) -> Option<String> {
    content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.trim_start_matches('#').trim().to_string())
        .filter(|line| !line.is_empty())
}

fn parse_custom_invocation(input: &str) -> Option<(&str, &str)> {
    let trimmed = input.trim();
    let without_slash = trimmed.strip_prefix('/')?;
    let (name, args) = without_slash
        .split_once(char::is_whitespace)
        .unwrap_or((without_slash, ""));
    (!name.is_empty()).then_some((name, args.trim()))
}

fn split_positional_args(args: &str) -> Vec<String> {
    args.split_whitespace().map(str::to_string).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_name_uses_colons_for_nested_markdown() {
        let root = Path::new("/repo/.agiworkforce/commands");
        let path = root.join("review").join("security_check.md");

        assert_eq!(
            command_name_for_path(root, &path).as_deref(),
            Some("review:security-check")
        );
    }

    #[test]
    fn markdown_frontmatter_is_removed_and_used_for_metadata() {
        let parsed = parse_command_markdown(
            "---\ndescription: Draft PR\nargument-hint: [base]\n---\nBody $ARGUMENTS",
        );

        assert_eq!(parsed.description, "Draft PR");
        assert_eq!(parsed.argument_hint.as_deref(), Some("[base]"));
        assert_eq!(parsed.content, "Body $ARGUMENTS");
    }

    #[test]
    fn expansion_supports_arguments_and_numeric_placeholders() {
        let command = CustomSlashCommand {
            name: "draft-pr".into(),
            description: "Draft PR".into(),
            argument_hint: None,
            content: "Review $1 then $ARGUMENTS".into(),
            path: PathBuf::from("draft-pr.md"),
            source: CustomCommandSource::ProjectAgi,
        };

        assert_eq!(
            expand_custom_command(&command, "main release"),
            "Review main then main release"
        );
    }

    #[test]
    fn invocation_matching_is_case_insensitive() {
        assert_eq!(
            parse_custom_invocation("/Draft-PR main").map(|(name, args)| {
                let command = CustomSlashCommand {
                    name: "draft-pr".into(),
                    description: "Draft PR".into(),
                    argument_hint: None,
                    content: "Review $ARGUMENTS".into(),
                    path: PathBuf::from("draft-pr.md"),
                    source: CustomCommandSource::ProjectAgi,
                };
                (
                    command.name.eq_ignore_ascii_case(name),
                    expand_custom_command(&command, args),
                )
            }),
            Some((true, "Review main".to_string()))
        );
    }

    #[test]
    fn discovery_prefers_first_root_for_duplicate_names() {
        let temp = tempfile::tempdir().unwrap();
        let first = temp.path().join("first");
        let second = temp.path().join("second");
        std::fs::create_dir_all(&first).unwrap();
        std::fs::create_dir_all(&second).unwrap();
        std::fs::write(first.join("ship.md"), "First").unwrap();
        std::fs::write(second.join("ship.md"), "Second").unwrap();

        let commands = discover_custom_slash_commands_from_roots(vec![
            CustomCommandRoot {
                path: first,
                source: CustomCommandSource::ProjectAgi,
            },
            CustomCommandRoot {
                path: second,
                source: CustomCommandSource::UserAgi,
            },
        ]);

        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].content, "First");
        assert_eq!(commands[0].source, CustomCommandSource::ProjectAgi);
    }
}
