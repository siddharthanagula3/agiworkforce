//! Claude-style command registry contracts for CLI and slash command surfaces.
//!
//! The TypeScript reference models commands as metadata-rich records rather than
//! scattered enum variants. This module gives the Rust CLI the same contract so
//! built-ins, skills, plugins, and MCP prompts can be loaded through one path.

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CommandKind {
    Prompt,
    Local,
    Ui,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CommandSource {
    Builtin,
    User,
    Project,
    Plugin,
    Mcp,
    Bundled,
    Managed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct RegistryCommand {
    pub(crate) name: String,
    pub(crate) description: String,
    pub(crate) kind: CommandKind,
    pub(crate) source: CommandSource,
    pub(crate) aliases: Vec<String>,
    pub(crate) supports_non_interactive: bool,
    pub(crate) supports_inline_args: bool,
    pub(crate) available_during_task: bool,
    pub(crate) user_invocable: bool,
    pub(crate) disable_model_invocation: bool,
    pub(crate) is_sensitive: bool,
    pub(crate) loaded_from: Option<String>,
    pub(crate) allowed_tools: Vec<String>,
    pub(crate) argument_hint: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) when_to_use: Option<String>,
    pub(crate) version: Option<String>,
    pub(crate) agent: Option<String>,
}

impl RegistryCommand {
    pub(crate) fn builtin_slash(
        name: &'static str,
        description: &'static str,
        available_during_task: bool,
        supports_inline_args: bool,
        aliases: Vec<&'static str>,
    ) -> Self {
        Self {
            name: name.to_string(),
            description: description.to_string(),
            kind: CommandKind::Local,
            source: CommandSource::Builtin,
            aliases: aliases.into_iter().map(str::to_string).collect(),
            supports_non_interactive: false,
            supports_inline_args,
            available_during_task,
            user_invocable: true,
            disable_model_invocation: false,
            is_sensitive: false,
            loaded_from: Some("builtin".to_string()),
            allowed_tools: Vec::new(),
            argument_hint: None,
            model: None,
            when_to_use: None,
            version: None,
            agent: None,
        }
    }

    pub(crate) fn prompt(
        name: impl Into<String>,
        description: impl Into<String>,
        source: CommandSource,
        loaded_from: Option<&str>,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            kind: CommandKind::Prompt,
            source,
            aliases: Vec::new(),
            supports_non_interactive: true,
            supports_inline_args: true,
            available_during_task: false,
            user_invocable: true,
            disable_model_invocation: false,
            is_sensitive: false,
            loaded_from: loaded_from.map(str::to_string),
            allowed_tools: Vec::new(),
            argument_hint: None,
            model: None,
            when_to_use: None,
            version: None,
            agent: None,
        }
    }

    pub(crate) fn from_skill(skill: &crate::skills::Skill, source: CommandSource) -> Self {
        let mut command = Self::prompt(&skill.name, &skill.description, source, Some("skills"));
        command.when_to_use = skill.category.clone();
        command
    }

    pub(crate) fn from_custom_prompt(
        prompt: &agiworkforce_protocol::custom_prompts::CustomPrompt,
        source: CommandSource,
    ) -> Self {
        let name = format!(
            "{}:{}",
            agiworkforce_protocol::custom_prompts::PROMPTS_CMD_PREFIX,
            prompt.name
        );
        let description = prompt
            .description
            .clone()
            .unwrap_or_else(|| "send saved prompt".to_string());
        let mut command = Self::prompt(name, description, source, Some("prompts"));
        command.argument_hint = prompt.argument_hint.clone();
        command
    }

    pub(crate) fn slash_name(&self) -> String {
        format!("/{}", self.name)
    }

    pub(crate) fn slash_aliases(&self) -> Vec<String> {
        self.aliases
            .iter()
            .map(|alias| format!("/{alias}"))
            .collect()
    }

    pub(crate) fn matches_name(&self, candidate: &str) -> bool {
        let normalized = candidate.trim_start_matches('/');
        self.name == normalized || self.aliases.iter().any(|alias| *alias == normalized)
    }

    pub(crate) fn matches_filter(&self, filter: &str) -> bool {
        if filter.is_empty() {
            return true;
        }

        let normalized = filter.trim_start_matches('/').to_lowercase();
        self.name.to_lowercase().contains(&normalized)
            || self.description.to_lowercase().contains(&normalized)
            || self
                .aliases
                .iter()
                .any(|alias| alias.to_lowercase().contains(&normalized))
    }
}

#[derive(Debug, Default, Clone)]
pub(crate) struct CommandRegistry {
    commands: Vec<RegistryCommand>,
}

impl CommandRegistry {
    pub(crate) fn push(&mut self, command: RegistryCommand) {
        self.commands.push(command);
    }

    pub(crate) fn extend(&mut self, commands: Vec<RegistryCommand>) {
        self.commands.extend(commands);
    }

    pub(crate) fn commands(&self) -> &[RegistryCommand] {
        &self.commands
    }

    pub(crate) fn find(&self, name: &str) -> Option<&RegistryCommand> {
        self.commands
            .iter()
            .find(|command| command.matches_name(name))
    }
}

pub(crate) fn builtin_slash_registry_commands() -> Vec<RegistryCommand> {
    vec![
        RegistryCommand::builtin_slash(
            "model",
            "Switch model (e.g. /model gpt-5.5)",
            false,
            true,
            vec!["m"],
        ),
        RegistryCommand::builtin_slash("plan", "Toggle plan mode", false, true, vec![]),
        RegistryCommand::builtin_slash("fast", "Toggle fast mode (2x speed)", false, true, vec![]),
        RegistryCommand::builtin_slash(
            "compact",
            "Compact context to free space",
            false,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "clear",
            "Clear conversation and context",
            false,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "review",
            "Review current code changes",
            false,
            true,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "diff",
            "Show git diff (incl. untracked)",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "copy",
            "Copy last response to clipboard",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "init",
            "Create CLAUDE.md for this project",
            false,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash("new", "Start a new conversation", false, false, vec![]),
        RegistryCommand::builtin_slash(
            "resume",
            "Resume a saved session",
            false,
            true,
            vec!["sessions"],
        ),
        RegistryCommand::builtin_slash(
            "fork",
            "Fork current conversation",
            false,
            false,
            vec!["branch"],
        ),
        RegistryCommand::builtin_slash("rename", "Rename current session", true, true, vec![]),
        RegistryCommand::builtin_slash("save", "Save session checkpoint", true, false, vec![]),
        RegistryCommand::builtin_slash("history", "List saved conversations", true, false, vec![]),
        RegistryCommand::builtin_slash(
            "export",
            "Export conversation to file",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash("rewind", "Undo last code changes", false, false, vec![]),
        RegistryCommand::builtin_slash("mcp", "List MCP servers and tools", true, false, vec![]),
        RegistryCommand::builtin_slash("skills", "Browse available skills", true, false, vec![]),
        RegistryCommand::builtin_slash(
            "permissions",
            "Manage tool permissions",
            false,
            false,
            vec!["perms", "approvals"],
        ),
        RegistryCommand::builtin_slash("hooks", "Manage hooks configuration", true, false, vec![]),
        RegistryCommand::builtin_slash("plugins", "Manage plugins", true, false, vec![]),
        RegistryCommand::builtin_slash(
            "status",
            "Show session info (model, tokens, mode)",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash("cost", "Show session cost summary", true, false, vec![]),
        RegistryCommand::builtin_slash(
            "output-style",
            "Switch output style (default | explanatory | learning)",
            false,
            true,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "fallback",
            "Show or set the multi-model fallback chain",
            false,
            true,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "replay",
            "Open the turn picker to fork from an earlier point",
            false,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "insights",
            "Dump JSON event log for the current session",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "context",
            "Show context window usage",
            true,
            false,
            vec!["ctx"],
        ),
        RegistryCommand::builtin_slash("config", "Show current configuration", true, false, vec![]),
        RegistryCommand::builtin_slash(
            "models",
            "List all available models",
            true,
            false,
            vec!["providers"],
        ),
        RegistryCommand::builtin_slash(
            "memory",
            "Show/manage auto-memory",
            true,
            false,
            vec!["mem"],
        ),
        RegistryCommand::builtin_slash(
            "btw",
            "Ask a side question without interrupting",
            true,
            true,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "voice",
            "Toggle voice input (Whisper)",
            true,
            false,
            vec!["v"],
        ),
        RegistryCommand::builtin_slash(
            "theme",
            "Change syntax highlighting theme",
            false,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash("login", "Login to a provider", true, false, vec![]),
        RegistryCommand::builtin_slash("logout", "Logout from providers", true, false, vec![]),
        RegistryCommand::builtin_slash(
            "feedback",
            "Send feedback / report bug",
            true,
            false,
            vec!["bug"],
        ),
        RegistryCommand::builtin_slash(
            "help",
            "Show all commands and keybindings",
            true,
            false,
            vec!["h", "?"],
        ),
        RegistryCommand::builtin_slash(
            "exit",
            "Exit AGI Workforce",
            true,
            false,
            vec!["quit", "q"],
        ),
    ]
}

pub(crate) fn registry_from_builtins_and_skills(
    skills: &[crate::skills::Skill],
) -> CommandRegistry {
    let mut registry = CommandRegistry::default();
    registry.extend(builtin_slash_registry_commands());
    for skill in skills {
        registry.push(RegistryCommand::from_skill(skill, CommandSource::Project));
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
        .map(|prompt| RegistryCommand::from_custom_prompt(prompt, CommandSource::Project))
        .collect();
    prompt_commands.sort_by(|left, right| left.name.cmp(&right.name));
    for cmd in &prompt_commands {
        reserved_names.insert(cmd.name.clone());
    }
    registry.extend(prompt_commands);

    // Sprint B6: surface plugin-declared commands. Each plugin's manifest
    // lists `commands:` paths (relative to plugin root) — typically markdown
    // files whose filename becomes the slash command name. Built-in /
    // skill / prompt names take precedence; conflicts are dropped silently.
    let mut plugin_commands: Vec<RegistryCommand> =
        plugin_command_registry_entries(&reserved_names);
    plugin_commands.sort_by(|left, right| left.name.cmp(&right.name));
    registry.extend(plugin_commands);

    registry
}

/// Sprint B6: discover commands from installed plugins.
///
/// Each plugin manifest's `commands:` field is a list of paths (relative to
/// plugin root). For each path:
///   - If it's a `.md` file, the filename stem becomes the command name.
///   - If it's a directory, every `.md` file inside it is enumerated.
///
/// Names already in `reserved_names` (built-ins, skills, custom prompts)
/// are skipped to avoid shadowing.
fn plugin_command_registry_entries(
    reserved_names: &std::collections::HashSet<String>,
) -> Vec<RegistryCommand> {
    let mut out: Vec<RegistryCommand> = Vec::new();
    let mut plugins_mgr = crate::plugins::PluginsManager::new();
    if plugins_mgr
        .load_all(std::env::current_dir().ok().as_deref())
        .is_err()
    {
        return out;
    }
    for command_path in plugins_mgr.command_paths() {
        if command_path.is_dir() {
            if let Ok(entries) = std::fs::read_dir(&command_path) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file()
                        && p.extension().and_then(|e| e.to_str()) == Some("md")
                    {
                        push_plugin_command(&p, reserved_names, &mut out);
                    }
                }
            }
        } else if command_path.is_file() {
            push_plugin_command(&command_path, reserved_names, &mut out);
        }
    }
    out
}

fn push_plugin_command(
    path: &std::path::Path,
    reserved_names: &std::collections::HashSet<String>,
    out: &mut Vec<RegistryCommand>,
) {
    let name = match path.file_stem().and_then(|s| s.to_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => return,
    };
    if reserved_names.contains(&name) {
        return;
    }
    // Description: use first non-empty line of the file as a fallback.
    let description = std::fs::read_to_string(path)
        .ok()
        .and_then(|c| {
            c.lines()
                .find(|l| !l.trim().is_empty() && !l.trim().starts_with("---"))
                .map(|l| l.trim().to_string())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_registry_preserves_claude_style_command_metadata() {
        let commands = builtin_slash_registry_commands();
        let compact = commands
            .iter()
            .find(|command| command.name == "compact")
            .expect("compact command should be registered");

        assert_eq!(compact.kind, CommandKind::Local);
        assert_eq!(compact.source, CommandSource::Builtin);
        assert_eq!(compact.description, "Compact context to free space");
        assert!(!compact.supports_non_interactive);
        assert!(compact.user_invocable);
        assert!(!compact.disable_model_invocation);
        assert_eq!(compact.loaded_from.as_deref(), Some("builtin"));
    }

    #[test]
    fn builtin_registry_keeps_aliases_with_canonical_names() {
        let commands = builtin_slash_registry_commands();
        let permissions = commands
            .iter()
            .find(|command| command.name == "permissions")
            .expect("permissions command should be registered");

        assert_eq!(permissions.aliases, vec!["perms", "approvals"]);
        assert_eq!(permissions.slash_aliases(), vec!["/perms", "/approvals"]);
    }

    #[test]
    fn registry_command_matching_uses_aliases_and_exact_names() {
        let command =
            RegistryCommand::builtin_slash("exit", "Exit AGI Workforce", true, false, vec!["quit"]);

        assert!(command.matches_name("exit"));
        assert!(command.matches_name("/exit"));
        assert!(command.matches_name("quit"));
        assert!(command.matches_name("/quit"));
        assert!(!command.matches_name("status"));
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
        };

        let command = RegistryCommand::from_skill(&skill, CommandSource::Project);

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
    fn registry_builder_appends_skills_after_builtins() {
        let skills = vec![crate::skills::Skill {
            name: "release-notes".to_string(),
            description: "Draft release notes".to_string(),
            content: String::new(),
            body: String::new(),
            path: std::path::PathBuf::from(".agiworkforce/skills/release-notes.md"),
            allow_implicit: true,
            category: None,
            required_env_vars: vec![],
        }];

        let registry = registry_from_builtins_and_skills(&skills);

        assert_eq!(registry.commands()[0].name, "model");
        assert_eq!(
            registry
                .commands()
                .last()
                .map(|command| (command.name.as_str(), command.kind)),
            Some(("release-notes", CommandKind::Prompt))
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

        let command = RegistryCommand::from_custom_prompt(&prompt, CommandSource::Project);

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
            name: "release-notes".to_string(),
            description: "Draft release notes".to_string(),
            content: String::new(),
            body: String::new(),
            path: std::path::PathBuf::from(".agiworkforce/skills/release-notes.md"),
            allow_implicit: true,
            category: None,
            required_env_vars: vec![],
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
            vec!["prompts:draft-pr", "release-notes"]
        );
    }
}
