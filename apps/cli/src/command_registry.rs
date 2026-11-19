//! CLI slash-command composition.
//!
//! Built-in command contracts live in `agiworkforce-command-registry`. This
//! module only adapts CLI-owned dynamic sources: skills, custom prompts, MCP
//! prompts, and plugin command files.

pub(crate) use agiworkforce_command_registry::{
    builtin_slash_registry_commands, CommandRegistry, CommandSource, RegistryCommand,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ShortcutHelp {
    Repl,
    Tui,
}

fn registry_command_from_skill(
    skill: &crate::skills::Skill,
    source: CommandSource,
) -> RegistryCommand {
    let mut command =
        RegistryCommand::prompt(&skill.name, &skill.description, source, Some("skills"));
    command.when_to_use = skill.category.clone();
    command
}

fn registry_command_from_custom_prompt(
    prompt: &agiworkforce_protocol::custom_prompts::CustomPrompt,
    source: CommandSource,
) -> RegistryCommand {
    let name = format!(
        "{}:{}",
        agiworkforce_protocol::custom_prompts::PROMPTS_CMD_PREFIX,
        prompt.name
    );
    let description = prompt
        .description
        .clone()
        .unwrap_or_else(|| "send saved prompt".to_string());
    let mut command = RegistryCommand::prompt(name, description, source, Some("prompts"));
    command.argument_hint = prompt.argument_hint.clone();
    command
}

pub(crate) fn registry_from_builtins_and_skills(
    skills: &[crate::skills::Skill],
) -> CommandRegistry {
    let mut registry = CommandRegistry::default();
    registry.extend(builtin_slash_registry_commands());
    for skill in skills {
        if registry.find(&skill.name).is_some() {
            tracing::warn!(skill = %skill.name, "a skill shares its name with a command already listed, so the slash command keeps running that command");
            continue;
        }
        registry.push(registry_command_from_skill(skill, CommandSource::Project));
    }
    registry
}

pub(crate) fn registry_from_builtins_skills_and_prompts(
    skills: &[crate::skills::Skill],
    prompts: &[agiworkforce_protocol::custom_prompts::CustomPrompt],
) -> CommandRegistry {
    let mut registry = registry_from_builtins_and_skills(skills);
    let mut reserved_names: std::collections::HashSet<String> = registry
        .commands()
        .iter()
        .map(|command| command.name.clone())
        .collect();

    let mut prompt_commands: Vec<RegistryCommand> = prompts
        .iter()
        .filter(|prompt| !reserved_names.contains(&prompt.name))
        .map(|prompt| registry_command_from_custom_prompt(prompt, CommandSource::Project))
        .collect();
    prompt_commands.sort_by(|left, right| left.name.cmp(&right.name));
    for cmd in &prompt_commands {
        reserved_names.insert(cmd.name.clone());
    }
    registry.extend(prompt_commands);

    let mut plugin_commands: Vec<RegistryCommand> =
        plugin_command_registry_entries(&reserved_names);
    plugin_commands.sort_by(|left, right| left.name.cmp(&right.name));
    registry.extend(plugin_commands);

    registry
}

/// Discover slash commands declared by installed plugins.
///
/// Each plugin manifest's `commands:` field points to markdown files or
/// directories. Built-in, skill, and custom prompt names take precedence.
fn plugin_command_registry_entries(
    reserved_names: &std::collections::HashSet<String>,
) -> Vec<RegistryCommand> {
    let mut out: Vec<RegistryCommand> = Vec::new();
    for path in plugin_command_files() {
        push_plugin_command(&path, reserved_names, &mut out);
    }
    out
}

fn plugin_command_files() -> Vec<std::path::PathBuf> {
    let mut files: Vec<std::path::PathBuf> = Vec::new();
    let mut plugins_mgr = crate::plugins::PluginsManager::new();
    if plugins_mgr
        .load_all(std::env::current_dir().ok().as_deref())
        .is_err()
    {
        return files;
    }
    for entry in plugins_mgr.command_path_entries() {
        let plugin_root = entry.plugin_root;
        let command_path = entry.path;
        if !crate::plugins::plugin_path_stays_within_root(&plugin_root, &command_path) {
            continue;
        }
        if command_path.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&command_path) {
                let mut children: Vec<std::path::PathBuf> = entries
                    .flatten()
                    .map(|dir_entry| dir_entry.path())
                    .collect();
                children.sort();
                for path in children {
                    if !crate::plugins::plugin_path_stays_within_root(&plugin_root, &path) {
                        continue;
                    }
                    if path.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("md")
                    {
                        files.push(path);
                    }
                }
            }
        } else if command_path.is_file() {
            files.push(command_path);
        }
    }
    files
}

fn plugin_command_name(path: &std::path::Path) -> Option<String> {
    match path.file_stem().and_then(|stem| stem.to_str()) {
        Some(stem) if !stem.is_empty() => Some(stem.to_string()),
        _ => None,
    }
}

pub(crate) fn expand_plugin_command_invocation(input: &str) -> Option<String> {
    let (name, args) = crate::custom_commands::parse_custom_invocation(input)?;
    expand_plugin_command_from_files(&plugin_command_files(), name, args)
}

fn expand_plugin_command_from_files(
    files: &[std::path::PathBuf],
    name: &str,
    args: &str,
) -> Option<String> {
    let path = files.iter().find(|path| {
        plugin_command_name(path).is_some_and(|candidate| candidate.eq_ignore_ascii_case(name))
    })?;
    crate::custom_commands::expand_command_file(path, args)
}

/// The prompt a non-builtin slash command resolves to, in the precedence the
/// palette registers its entries: skill, then plugin command, then custom
/// command. `Err` is a skill that matched but cannot load.
pub(crate) fn expand_dynamic_slash_invocation(
    input: &str,
    name: &str,
    request: &str,
) -> Option<std::result::Result<String, String>> {
    if is_builtin_slash_name(name) {
        return None;
    }
    resolve_dynamic_slash_invocation(
        || crate::skills::skill_command_prompt(name, request),
        || expand_plugin_command_invocation(input),
        || crate::custom_commands::expand_custom_slash_invocation(input),
    )
}

fn is_builtin_slash_name(name: &str) -> bool {
    builtin_slash_registry_commands()
        .iter()
        .any(|command| command.matches_name(name))
}

fn resolve_dynamic_slash_invocation(
    skill: impl FnOnce() -> Option<std::result::Result<String, String>>,
    plugin: impl FnOnce() -> Option<String>,
    custom: impl FnOnce() -> Option<String>,
) -> Option<std::result::Result<String, String>> {
    skill()
        .or_else(|| plugin().map(Ok))
        .or_else(|| custom().map(Ok))
}

fn push_plugin_command(
    path: &std::path::Path,
    reserved_names: &std::collections::HashSet<String>,
    out: &mut Vec<RegistryCommand>,
) {
    let Some(name) = plugin_command_name(path) else {
        return;
    };
    if reserved_names.contains(&name) {
        return;
    }

    let description = std::fs::read_to_string(path)
        .ok()
        .and_then(|content| {
            content
                .lines()
                .find(|line| !line.trim().is_empty() && !line.trim().starts_with("---"))
                .map(|line| line.trim().to_string())
        })
        .unwrap_or_else(|| format!("Plugin command: {}", name));
    let loaded_from = path.to_string_lossy().to_string();
    out.push(RegistryCommand::prompt(
        name,
        description,
        CommandSource::Plugin,
        Some(&loaded_from),
    ));
}

pub(crate) fn format_command_help(registry: &CommandRegistry, shortcuts: ShortcutHelp) -> String {
    use std::fmt::Write as _;

    let mut help = String::from("Commands:\n");
    for cmd in registry.commands().iter().filter(|cmd| cmd.user_invocable) {
        let aliases = cmd.slash_aliases();
        let aliases = if aliases.is_empty() {
            String::new()
        } else {
            format!(" ({})", aliases.join(", "))
        };
        let argument_hint = cmd
            .argument_hint
            .as_deref()
            .filter(|hint| !hint.trim().is_empty())
            .map(|hint| format!(" {hint}"))
            .unwrap_or_default();
        let _ = writeln!(
            help,
            "  {:<22} {}{}",
            format!("{}{}", cmd.slash_name(), argument_hint),
            cmd.description,
            aliases
        );
    }

    match shortcuts {
        ShortcutHelp::Repl => append_repl_shortcuts(&mut help),
        ShortcutHelp::Tui => append_tui_shortcuts(&mut help),
    }

    help
}

fn append_repl_shortcuts(help: &mut String) {
    use std::fmt::Write as _;

    help.push_str("\nShortcuts:\n");
    let _ = writeln!(
        help,
        "  {:<22} Run shell command (output added to context)",
        "! <command>"
    );
    let _ = writeln!(
        help,
        "  {:<22} Append text to project AGENTS.md",
        "# <text>"
    );
    let _ = writeln!(help, "  {:<22} Multi-line input", "\\");
    let _ = writeln!(
        help,
        "  {:<22} Search previous prompts (reverse history search)",
        "Ctrl-R"
    );
    let _ = writeln!(help, "  {:<22} Previous / next prompt", "Up/Down");
    let _ = writeln!(help, "  {:<22} Cancel input / Ctrl-D exits", "Ctrl-C");
    let _ = writeln!(help, "  {:<22} Enable vi editing", "ui.edit_mode = \"vi\"");
    let _ = writeln!(help, "  {:<22} Show active bindings", "/keybindings");
}

fn append_tui_shortcuts(help: &mut String) {
    use std::fmt::Write as _;

    help.push_str("\nKeyboard shortcuts:\n");
    let _ = writeln!(
        help,
        "  {:<14} Cycle mode: {} -> {} -> {}, then {} -> {} when started with --allow-dangerously-skip-permissions",
        "Shift+Tab",
        crate::tui::MODE_DEFAULT,
        crate::tui::MODE_PLAN,
        crate::tui::MODE_AUTO,
        crate::tui::MODE_BYPASS,
        crate::tui::MODE_FULL_AUTO
    );
    let _ = writeln!(help, "  {:<14} Open command palette", "/");
    let _ = writeln!(
        help,
        "  {:<14} Close the open panel, then clear the composer, then quit (twice)",
        "Esc"
    );
    let _ = writeln!(
        help,
        "  {:<14} Previous / next prompt, or scroll when there is none",
        "Up/Down"
    );
    let _ = writeln!(help, "  {:<14} Scroll chat history", "PageUp/Down");
    let _ = writeln!(help, "  {:<14} Jump to the latest output", "Ctrl-End");
    let _ = writeln!(help, "  {:<14} Insert a newline", "Ctrl-J");
    let _ = writeln!(help, "  {:<14} Delete to line start", "Ctrl-U");
    let _ = writeln!(
        help,
        "  {:<14} Undo the last edit (Ctrl-Shift-Z redoes)",
        "Ctrl-_"
    );
    let _ = writeln!(
        help,
        "  {:<14} Edit the prompt in $VISUAL or $EDITOR",
        "Ctrl-G/Ctrl-E"
    );
    let _ = writeln!(help, "  {:<14} Show or hide full tool output", "Ctrl-O");
    let _ = writeln!(
        help,
        "  {:<14} While a turn runs: queue a message, or /btw to ask aside",
        "Type + Enter"
    );
    let _ = writeln!(help, "  {:<14} Redraw the screen", "Ctrl-L");
    let _ = writeln!(
        help,
        "  {:<14} Stop a running turn; otherwise clear the composer, or quit when pressed twice on an empty one",
        "Ctrl-C"
    );
    let _ = writeln!(help, "  Customize global actions with [ui.keybindings]");

    help.push_str("\nModes (cycle with Shift+Tab):\n");
    let _ = writeln!(
        help,
        "  {:<14} Normal conversation (grey)",
        crate::tui::MODE_DEFAULT
    );
    let _ = writeln!(
        help,
        "  {:<14} Read-only planning, no edits (blue)",
        crate::tui::MODE_PLAN
    );
    let _ = writeln!(
        help,
        "  {:<14} Auto-accept file edits (green)",
        crate::tui::MODE_AUTO
    );
    let _ = writeln!(
        help,
        "  {:<14} Skip all tool confirmation (yellow)",
        crate::tui::MODE_BYPASS
    );
    let _ = writeln!(
        help,
        "  {:<14} No prompts at all - extreme caution (red)",
        crate::tui::MODE_FULL_AUTO
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use agiworkforce_command_registry::CommandKind;

    #[test]
    fn cli_uses_shared_builtin_registry() {
        let commands = builtin_slash_registry_commands();

        assert_eq!(commands.len(), 104);
        assert_eq!(commands[0].name, "model");
        assert_eq!(
            commands
                .iter()
                .find(|command| command.name == "doctor")
                .map(|command| command.aliases.as_slice()),
            Some(&["diagnose".to_string(), "health".to_string()][..])
        );
    }

    #[test]
    fn skill_commands_are_prompt_registry_entries() {
        let skill = crate::skills::Skill {
            name: "rust-reviewer".to_string(),
            description: "Review Rust changes for correctness".to_string(),
            content: "---\nname: rust-reviewer\n---\nBody".to_string(),
            body: "Body".to_string(),
            path: std::path::PathBuf::from(".agiworkforce/skills/rust-reviewer.md"),
            allow_implicit: true,
            category: Some("review".to_string()),
            required_env_vars: vec![],
            required_tools: vec![],
            required_connections: vec![],
            version: None,
            content_hash: crate::skills::hash_skill_content(b""),
            tree_hash: None,
        };

        let command = registry_command_from_skill(&skill, CommandSource::Project);

        assert_eq!(command.kind, CommandKind::Prompt);
        assert_eq!(command.source, CommandSource::Project);
        assert_eq!(command.name, "rust-reviewer");
        assert_eq!(command.description, "Review Rust changes for correctness");
        assert_eq!(command.loaded_from.as_deref(), Some("skills"));
        assert_eq!(command.when_to_use.as_deref(), Some("review"));
        assert!(command.user_invocable);
        assert!(!command.disable_model_invocation);
    }

    #[test]
    fn command_registry_preserves_provider_order_and_finds_aliases() {
        let mut registry = CommandRegistry::default();
        registry.extend(builtin_slash_registry_commands());
        registry.push(RegistryCommand::prompt(
            "plugin:lint",
            "Run plugin lint workflow",
            CommandSource::Plugin,
            Some("plugin"),
        ));

        assert_eq!(registry.commands()[0].name, "model");
        assert_eq!(
            registry
                .find("plugin:lint")
                .map(|command| command.description.as_str()),
            Some("Run plugin lint workflow")
        );
        assert_eq!(
            registry.find("/m").map(|command| command.name.as_str()),
            Some("model")
        );
    }

    #[test]
    fn command_help_renders_from_registry_metadata() {
        let mut registry = CommandRegistry::default();
        registry.extend(builtin_slash_registry_commands());
        registry.push(RegistryCommand::prompt(
            "plugin:lint",
            "Run plugin lint workflow",
            CommandSource::Plugin,
            Some("plugin"),
        ));

        let repl_help = format_command_help(&registry, ShortcutHelp::Repl);
        assert!(repl_help.contains("/model"));
        assert!(repl_help.contains("(/m)"));
        assert!(repl_help.contains("/doctor"));
        assert!(repl_help.contains("(/diagnose, /health)"));
        assert!(repl_help.contains("/plugin:lint"));
        assert!(repl_help.contains("Run plugin lint workflow"));
        assert!(repl_help.contains("Shortcuts:"));

        let tui_help = format_command_help(&registry, ShortcutHelp::Tui);
        assert!(tui_help.contains("Keyboard shortcuts:"));
        assert!(tui_help.contains("Modes (cycle with Shift+Tab):"));
    }

    #[test]
    fn registry_builder_appends_skills_after_builtins() {
        let skills = vec![crate::skills::Skill {
            name: "ship-notes".to_string(),
            description: "Draft release notes".to_string(),
            content: String::new(),
            body: String::new(),
            path: std::path::PathBuf::from(".agiworkforce/skills/ship-notes.md"),
            allow_implicit: true,
            category: None,
            required_env_vars: vec![],
            required_tools: vec![],
            required_connections: vec![],
            version: None,
            content_hash: crate::skills::hash_skill_content(b""),
            tree_hash: None,
        }];

        let registry = registry_from_builtins_and_skills(&skills);

        assert_eq!(registry.commands()[0].name, "model");
        assert_eq!(
            registry
                .commands()
                .last()
                .map(|command| (command.name.as_str(), command.kind)),
            Some(("ship-notes", CommandKind::Prompt))
        );
    }

    #[test]
    fn custom_prompts_are_prompt_registry_entries() {
        let prompt = agiworkforce_protocol::custom_prompts::CustomPrompt {
            name: "draft-pr".to_string(),
            path: "/tmp/draft-pr.md".into(),
            content: "Draft a pull request".to_string(),
            description: Some("Draft a PR from current changes".to_string()),
            argument_hint: Some("[base_branch]".to_string()),
        };

        let command = registry_command_from_custom_prompt(&prompt, CommandSource::Project);

        assert_eq!(command.kind, CommandKind::Prompt);
        assert_eq!(command.source, CommandSource::Project);
        assert_eq!(command.name, "prompts:draft-pr");
        assert_eq!(command.description, "Draft a PR from current changes");
        assert_eq!(command.argument_hint.as_deref(), Some("[base_branch]"));
        assert_eq!(command.loaded_from.as_deref(), Some("prompts"));
        assert!(command.matches_name("/prompts:draft-pr"));
    }

    #[test]
    fn registry_builder_appends_prompts_after_skills_and_drops_builtin_collisions() {
        let skills = vec![crate::skills::Skill {
            name: "ship-notes".to_string(),
            description: "Draft release notes".to_string(),
            content: String::new(),
            body: String::new(),
            path: std::path::PathBuf::from(".agiworkforce/skills/ship-notes.md"),
            allow_implicit: true,
            category: None,
            required_env_vars: vec![],
            required_tools: vec![],
            required_connections: vec![],
            version: None,
            content_hash: crate::skills::hash_skill_content(b""),
            tree_hash: None,
        }];
        let prompts = vec![
            agiworkforce_protocol::custom_prompts::CustomPrompt {
                name: "status".to_string(),
                path: "/tmp/status.md".into(),
                content: "collision".to_string(),
                description: None,
                argument_hint: None,
            },
            agiworkforce_protocol::custom_prompts::CustomPrompt {
                name: "draft-pr".to_string(),
                path: "/tmp/draft-pr.md".into(),
                content: "draft".to_string(),
                description: None,
                argument_hint: None,
            },
        ];

        let registry = registry_from_builtins_skills_and_prompts(&skills, &prompts);

        assert!(registry.find("/status").is_some());
        assert!(registry.find("/prompts:status").is_none());
        assert_eq!(
            registry
                .commands()
                .iter()
                .rev()
                .take(2)
                .map(|command| command.name.as_str())
                .collect::<Vec<_>>(),
            vec!["prompts:draft-pr", "ship-notes"]
        );
    }

    #[test]
    fn cli_registry_resolves_plugin_aliases_and_late_parity_commands() {
        let mut registry = CommandRegistry::default();
        registry.extend(builtin_slash_registry_commands());

        for alias in ["plugin", "plugins", "marketplace", "market"] {
            assert_eq!(
                registry.find(alias).map(|command| command.name.as_str()),
                Some("plugin"),
                "/{alias} must resolve to canonical /plugin"
            );
        }

        for name in [
            "agents",
            "chrome",
            "ide",
            "usage",
            "sandbox",
            "doctor",
            "recap",
            "release-notes",
            "keybindings",
            "remote-env",
            "add-dir",
            "desktop",
            "effort",
            "files",
            "install-github-app",
            "mobile",
            "passes",
            "pr-comments",
            "privacy-settings",
            "privacy-mode",
            "continue-with-byok",
            "continue-with-cloud",
            "rate-limit-options",
            "auto-mode-setup",
            "security-review",
            "stats",
            "statusline",
            "tag",
            "think-back",
            "ultrareview",
            "upgrade",
            "vim",
        ] {
            assert!(registry.find(name).is_some(), "/{name} must be registered");
        }

        assert_eq!(
            registry.find("ios").map(|command| command.name.as_str()),
            Some("mobile")
        );
        assert_eq!(
            registry.find("app").map(|command| command.name.as_str()),
            Some("desktop")
        );
    }

    #[test]
    fn plugin_command_invocation_loads_the_command_body() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("registry-audit-example.md");
        std::fs::write(
            &file,
            "---\ndescription: Audit the registry\n---\nAudit $1 against $ARGUMENTS",
        )
        .unwrap();
        let files = vec![file];

        assert_eq!(
            expand_plugin_command_from_files(&files, "registry-audit-example", "main release"),
            Some("Audit main against main release".to_string())
        );
        assert_eq!(
            expand_plugin_command_from_files(&files, "Registry-Audit-Example", ""),
            Some("Audit  against ".to_string())
        );
    }

    #[test]
    fn a_colliding_name_runs_the_entry_the_palette_shows() {
        let skill = || Some(Ok("skill body".to_string()));
        let plugin = || Some("plugin body".to_string());
        let custom = || Some("custom body".to_string());

        assert_eq!(
            resolve_dynamic_slash_invocation(skill, plugin, custom),
            Some(Ok("skill body".to_string()))
        );
        assert_eq!(
            resolve_dynamic_slash_invocation(|| None, plugin, custom),
            Some(Ok("plugin body".to_string()))
        );
        assert_eq!(
            resolve_dynamic_slash_invocation(|| None, || None, custom),
            Some(Ok("custom body".to_string()))
        );
        assert_eq!(
            resolve_dynamic_slash_invocation(|| None, || None, || None),
            None
        );
    }

    #[test]
    fn a_skill_named_like_a_built_in_leaves_the_built_in_alone() {
        let skill = |name: &str| crate::skills::Skill {
            name: name.to_string(),
            description: "A user skill".to_string(),
            content: String::new(),
            body: String::new(),
            path: std::path::PathBuf::from(format!(".agiworkforce/skills/{name}.md")),
            allow_implicit: true,
            category: None,
            required_env_vars: vec![],
            required_tools: vec![],
            required_connections: vec![],
            version: None,
            content_hash: crate::skills::hash_skill_content(b""),
            tree_hash: None,
        };
        let registry = registry_from_builtins_and_skills(&[skill("review"), skill("tools")]);
        for name in ["review", "tools"] {
            let matching: Vec<&RegistryCommand> = registry
                .commands()
                .iter()
                .filter(|command| command.matches_name(name))
                .collect();
            assert_eq!(matching.len(), 1, "/{name} is listed once");
            assert_eq!(
                matching[0].kind,
                CommandKind::Local,
                "/{name} stays built in"
            );
            assert!(
                expand_dynamic_slash_invocation(&format!("/{name}"), name, "").is_none(),
                "/{name} is never answered by a skill"
            );
        }
    }

    #[test]
    fn a_skill_that_cannot_load_does_not_fall_through_to_a_custom_command() {
        assert_eq!(
            resolve_dynamic_slash_invocation(
                || Some(Err("missing tools".to_string())),
                || None,
                || Some("custom body".to_string()),
            ),
            Some(Err("missing tools".to_string()))
        );
    }

    #[test]
    fn plugin_command_invocation_ignores_unknown_names_and_unreadable_files() {
        let temp = tempfile::tempdir().unwrap();
        let file = temp.path().join("known.md");
        std::fs::write(&file, "Body").unwrap();
        let missing = temp.path().join("gone.md");
        let files = vec![file, missing];

        assert_eq!(expand_plugin_command_from_files(&files, "other", ""), None);
        assert_eq!(expand_plugin_command_from_files(&files, "gone", ""), None);
        assert_eq!(
            expand_plugin_command_from_files(&files, "known", ""),
            Some("Body".to_string())
        );
    }
}
