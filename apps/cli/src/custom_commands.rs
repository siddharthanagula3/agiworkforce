//! Custom slash commands loaded from project/user markdown files.
//!
//! Supported roots:
//! - `.agiworkforce/commands/**/*.md`
//! - `~/.agiworkforce/commands/**/*.md`
//! - `~/.agiworkforce/prompts/claude/**/*.md` for commands imported from Claude Code
//! - `.claude/commands/**/*.md` and `~/.claude/commands/**/*.md` for direct compatibility
//!
//! A command body is injected verbatim into the agent prompt, and project roots
//! come from a possibly untrusted checkout, so user roots are searched first: a
//! project-local file can never take over a name the user already defined
//! globally.

use std::collections::HashMap;
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

    fn is_project(self) -> bool {
        matches!(self, Self::ProjectAgi | Self::ProjectClaude)
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

#[derive(Debug, Clone, PartialEq, Eq)]
struct ShadowedProjectCommand {
    name: String,
    ignored_path: PathBuf,
    ignored_source: CustomCommandSource,
    kept_path: PathBuf,
    kept_source: CustomCommandSource,
}

pub(crate) fn discover_custom_slash_commands() -> Vec<CustomSlashCommand> {
    let (commands, shadowed) = discover_custom_slash_commands_from_roots(default_roots());
    for entry in &shadowed {
        tracing::warn!(
            command = %entry.name,
            ignored = %entry.ignored_path.display(),
            ignored_source = entry.ignored_source.label(),
            kept = %entry.kept_path.display(),
            kept_source = entry.kept_source.label(),
            "ignoring project-local slash command that collides with your own command"
        );
    }
    commands
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
    expand_command_body(&command.content, args)
}

pub(crate) fn expand_command_file(path: &Path, args: &str) -> Option<String> {
    let raw = std::fs::read_to_string(path).ok()?;
    Some(expand_command_body(
        &parse_command_markdown(&raw).content,
        args,
    ))
}

fn expand_command_body(content: &str, args: &str) -> String {
    const ALL_ARGUMENTS: &str = "$ARGUMENTS";
    let positional = split_positional_args(args);
    let mut out = String::with_capacity(content.len() + args.len());
    let mut substituted = false;
    let mut rest = content;

    while let Some(offset) = rest.find('$') {
        out.push_str(&rest[..offset]);
        let tail = &rest[offset..];
        if let Some(after_all_arguments) = tail.strip_prefix(ALL_ARGUMENTS) {
            out.push_str(args);
            substituted = true;
            rest = after_all_arguments;
            continue;
        }
        let digit = tail[1..]
            .chars()
            .next()
            .and_then(|ch| ch.to_digit(10))
            .filter(|digit| (1..=9).contains(digit));
        if let Some(digit) = digit {
            if let Some(value) = positional.get(digit as usize - 1) {
                out.push_str(value);
            }
            substituted = true;
            rest = &tail[2..];
            continue;
        }
        out.push('$');
        rest = &tail[1..];
    }
    out.push_str(rest);

    if !substituted && !args.trim().is_empty() {
        out.push_str("\n\n");
        out.push_str(args.trim());
    }

    out
}

fn default_roots() -> Vec<CustomCommandRoot> {
    roots_for(std::env::current_dir().ok(), dirs::home_dir())
}

fn roots_for(cwd: Option<PathBuf>, home: Option<PathBuf>) -> Vec<CustomCommandRoot> {
    let mut roots = Vec::new();
    if let Some(home) = home {
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
    if let Some(cwd) = cwd {
        roots.push(CustomCommandRoot {
            path: cwd.join(".agiworkforce").join("commands"),
            source: CustomCommandSource::ProjectAgi,
        });
        roots.push(CustomCommandRoot {
            path: cwd.join(".claude").join("commands"),
            source: CustomCommandSource::ProjectClaude,
        });
    }
    roots
}

fn discover_custom_slash_commands_from_roots(
    roots: Vec<CustomCommandRoot>,
) -> (Vec<CustomSlashCommand>, Vec<ShadowedProjectCommand>) {
    let mut seen: HashMap<String, (PathBuf, CustomCommandSource)> = HashMap::new();
    let mut commands = Vec::new();
    let mut shadowed = Vec::new();

    for root in roots {
        if !root.path.is_dir() {
            continue;
        }
        for path in markdown_files_recursive(&root.path) {
            let Some(name) = command_name_for_path(&root.path, &path) else {
                continue;
            };
            if let Some((kept_path, kept_source)) = seen.get(&name) {
                if root.source.is_project() && !kept_source.is_project() {
                    shadowed.push(ShadowedProjectCommand {
                        name,
                        ignored_path: path,
                        ignored_source: root.source,
                        kept_path: kept_path.clone(),
                        kept_source: *kept_source,
                    });
                }
                continue;
            }
            seen.insert(name.clone(), (path.clone(), root.source));
            let raw = if root.source.is_project() {
                root.path
                    .parent()
                    .and_then(Path::parent)
                    .and_then(|project| crate::project_text::read_within(project, &path))
            } else {
                std::fs::read_to_string(&path).ok()
            };
            let Some(raw) = raw else {
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
    (commands, shadowed)
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

pub(crate) fn parse_custom_invocation(input: &str) -> Option<(&str, &str)> {
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
    fn argument_text_is_never_read_back_as_a_placeholder() {
        assert_eq!(
            expand_command_body("Explain this amount: $ARGUMENTS", "$5"),
            "Explain this amount: $5"
        );
        assert_eq!(
            expand_command_body("Compare $1 with $2", "$2 beta"),
            "Compare $2 with beta"
        );
        assert_eq!(
            expand_command_body("Echo $ARGUMENTS then $1", "$ARGUMENTS"),
            "Echo $ARGUMENTS then $ARGUMENTS"
        );
    }

    #[test]
    fn missing_positional_arguments_expand_to_nothing_and_stray_dollars_stay() {
        assert_eq!(
            expand_command_body("Cost $1 or $9 in $USD, $0 and $", "only"),
            "Cost only or  in $USD, $0 and $"
        );
        assert_eq!(expand_command_body("Review $1", ""), "Review ");
    }

    #[test]
    fn arguments_are_appended_when_the_body_names_no_placeholder() {
        assert_eq!(
            expand_command_body("Review the diff", " main "),
            "Review the diff\n\nmain"
        );
        assert_eq!(
            expand_command_body("Review the diff", "  "),
            "Review the diff"
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

        let (commands, shadowed) = discover_custom_slash_commands_from_roots(vec![
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
        assert!(shadowed.is_empty());
    }

    #[test]
    fn user_roots_are_searched_before_project_roots() {
        let roots = roots_for(
            Some(PathBuf::from("/repo")),
            Some(PathBuf::from("/home/user")),
        );

        let first_project = roots
            .iter()
            .position(|root| root.source.is_project())
            .expect("project roots are registered");
        let last_user = roots
            .iter()
            .rposition(|root| !root.source.is_project())
            .expect("user roots are registered");

        assert!(
            last_user < first_project,
            "project roots must come last: {:?}",
            roots.iter().map(|root| root.source).collect::<Vec<_>>()
        );
    }

    #[test]
    fn project_command_cannot_shadow_user_command() {
        let home = tempfile::tempdir().unwrap();
        let cwd = tempfile::tempdir().unwrap();
        let user_dir = home.path().join(".agiworkforce").join("commands");
        let project_dir = cwd.path().join(".agiworkforce").join("commands");
        std::fs::create_dir_all(&user_dir).unwrap();
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::write(user_dir.join("deploy.md"), "Trusted deploy").unwrap();
        std::fs::write(project_dir.join("deploy.md"), "Attacker deploy").unwrap();

        let (commands, shadowed) = discover_custom_slash_commands_from_roots(roots_for(
            Some(cwd.path().to_path_buf()),
            Some(home.path().to_path_buf()),
        ));

        let deploy = commands
            .iter()
            .find(|command| command.name == "deploy")
            .expect("deploy command is discovered");
        assert_eq!(deploy.content, "Trusted deploy");
        assert_eq!(deploy.source, CustomCommandSource::UserAgi);
        assert_eq!(shadowed.len(), 1);
        assert_eq!(shadowed[0].name, "deploy");
        assert_eq!(shadowed[0].ignored_path, project_dir.join("deploy.md"));
        assert_eq!(shadowed[0].ignored_source, CustomCommandSource::ProjectAgi);
        assert_eq!(shadowed[0].kept_source, CustomCommandSource::UserAgi);
    }

    #[test]
    fn project_command_without_user_collision_is_kept() {
        let home = tempfile::tempdir().unwrap();
        let cwd = tempfile::tempdir().unwrap();
        let project_dir = cwd.path().join(".claude").join("commands");
        std::fs::create_dir_all(&project_dir).unwrap();
        std::fs::write(project_dir.join("bench.md"), "Project bench").unwrap();

        let (commands, shadowed) = discover_custom_slash_commands_from_roots(roots_for(
            Some(cwd.path().to_path_buf()),
            Some(home.path().to_path_buf()),
        ));

        assert_eq!(commands.len(), 1);
        assert_eq!(commands[0].name, "bench");
        assert_eq!(commands[0].content, "Project bench");
        assert_eq!(commands[0].source, CustomCommandSource::ProjectClaude);
        assert!(shadowed.is_empty());
    }
}
