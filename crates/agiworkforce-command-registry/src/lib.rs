//! Claude-style command registry contracts for AGI Workforce CLI and TUI.
//!
//! Pure data types and the built-in slash command catalog. Composition with
//! cli-internal types (skills, plugins, custom prompts) lives in the cli crate
//! at `apps/cli/src/command_registry.rs`, which re-exports this crate's types.
//!
//! The TypeScript reference (Claude Code v2.1.128) models commands as
//! metadata-rich records rather than scattered enum variants. This crate gives
//! the Rust CLI the same contract so built-ins, skills, plugins, and MCP
//! prompts can all be loaded through one path.

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandKind {
    Prompt,
    Local,
    Ui,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandSource {
    Builtin,
    User,
    Project,
    Plugin,
    Mcp,
    Bundled,
    Managed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegistryCommand {
    pub name: String,
    pub description: String,
    pub kind: CommandKind,
    pub source: CommandSource,
    pub aliases: Vec<String>,
    pub supports_non_interactive: bool,
    pub supports_inline_args: bool,
    pub available_during_task: bool,
    pub user_invocable: bool,
    pub disable_model_invocation: bool,
    pub is_sensitive: bool,
    pub loaded_from: Option<String>,
    pub allowed_tools: Vec<String>,
    pub argument_hint: Option<String>,
    pub model: Option<String>,
    pub when_to_use: Option<String>,
    pub version: Option<String>,
    pub agent: Option<String>,
}

impl RegistryCommand {
    pub fn builtin_slash(
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

    pub fn prompt(
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

    pub fn slash_name(&self) -> String {
        format!("/{}", self.name)
    }

    pub fn slash_aliases(&self) -> Vec<String> {
        self.aliases
            .iter()
            .map(|alias| format!("/{alias}"))
            .collect()
    }

    pub fn matches_name(&self, candidate: &str) -> bool {
        let normalized = candidate.trim_start_matches('/');
        self.name == normalized || self.aliases.iter().any(|alias| *alias == normalized)
    }

    pub fn matches_filter(&self, filter: &str) -> bool {
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
pub struct CommandRegistry {
    commands: Vec<RegistryCommand>,
}

impl CommandRegistry {
    pub fn push(&mut self, command: RegistryCommand) {
        self.commands.push(command);
    }

    pub fn extend(&mut self, commands: Vec<RegistryCommand>) {
        self.commands.extend(commands);
    }

    pub fn commands(&self) -> &[RegistryCommand] {
        &self.commands
    }

    pub fn find(&self, name: &str) -> Option<&RegistryCommand> {
        self.commands
            .iter()
            .find(|command| command.matches_name(name))
    }
}

pub fn builtin_slash_registry_commands() -> Vec<RegistryCommand> {
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
            "agents",
            "Browse and manage agents",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "permissions",
            "Manage tool permissions",
            false,
            false,
            vec!["perms", "approvals"],
        ),
        RegistryCommand::builtin_slash("hooks", "Manage hooks configuration", true, false, vec![]),
        RegistryCommand::builtin_slash(
            "chrome",
            "Manage Chrome extension integration",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "ide",
            "Connect to an IDE for integrated features",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "plugin",
            "Manage plugins",
            true,
            false,
            vec!["plugins", "marketplace", "market"],
        ),
        RegistryCommand::builtin_slash(
            "tasks",
            "View background tasks",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "status",
            "Show session info (model, tokens, mode)",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash("cost", "Show session cost summary", true, false, vec![]),
        RegistryCommand::builtin_slash(
            "usage",
            "Tokens, cost, and plan usage for this session",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "sandbox",
            "Show or toggle sandbox mode (read-only / contained / unrestricted)",
            true,
            true,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "doctor",
            "Run diagnostics: providers, MCP, plugins, version",
            true,
            false,
            vec!["diagnose", "health"],
        ),
        RegistryCommand::builtin_slash(
            "recap",
            "Summarize the recent turns of this session",
            true,
            true,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "release-notes",
            "Show release notes for the current AGI Workforce version",
            true,
            false,
            vec!["changelog"],
        ),
        RegistryCommand::builtin_slash(
            "keybindings",
            "Show all keybindings for the TUI",
            true,
            false,
            vec!["keys"],
        ),
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
        RegistryCommand::builtin_slash(
            "focus",
            "Toggle focus view (hide chrome, full-width composer)",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "background",
            "Continue current task in background",
            false,
            false,
            vec!["bg"],
        ),
        RegistryCommand::builtin_slash(
            "advisor",
            "Consult a higher-tier model on a side question",
            false,
            true,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "team-onboarding",
            "Generate codebase onboarding guide for a new teammate",
            false,
            true,
            vec!["onboarding"],
        ),
        RegistryCommand::builtin_slash(
            "terminal-setup",
            "Print shell-integration snippet (bash/zsh/fish)",
            true,
            true,
            vec!["shell-setup"],
        ),
        RegistryCommand::builtin_slash(
            "reload-plugins",
            "Reload plugin manifests without restarting",
            true,
            false,
            vec![],
        ),
        RegistryCommand::builtin_slash(
            "extra-usage",
            "Show pricing + how to extend usage limits",
            true,
            false,
            vec!["pricing"],
        ),
        RegistryCommand::builtin_slash(
            "remote-env",
            "Show or set remote-environment defaults",
            true,
            true,
            vec![],
        ),
    ]
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
    fn plugin_canonical_renamed_with_aliases() {
        let commands = builtin_slash_registry_commands();
        let plugin = commands
            .iter()
            .find(|command| command.name == "plugin")
            .expect("plugin command should be registered as canonical");

        assert_eq!(plugin.aliases, vec!["plugins", "marketplace", "market"]);
        assert!(plugin.matches_name("plugin"));
        assert!(plugin.matches_name("/plugin"));
        assert!(plugin.matches_name("plugins"));
        assert!(plugin.matches_name("/plugins"));
        assert!(plugin.matches_name("marketplace"));
        assert!(plugin.matches_name("/market"));

        // The old canonical /plugins should not exist as a separate command.
        let plugins_duplicate = commands
            .iter()
            .filter(|command| command.name == "plugins")
            .count();
        assert_eq!(
            plugins_duplicate, 0,
            "/plugins must be an alias of /plugin, not a separate canonical command"
        );
    }

    #[test]
    fn parity_commands_chrome_ide_tasks_agents_are_registered() {
        let commands = builtin_slash_registry_commands();
        for name in ["chrome", "ide", "tasks", "agents"] {
            assert!(
                commands.iter().any(|command| command.name == name),
                "/{name} must be registered (added for Claude Code v2.1.128 parity)"
            );
        }
    }

    #[test]
    fn registry_find_resolves_plugin_aliases() {
        let mut registry = CommandRegistry::default();
        registry.extend(builtin_slash_registry_commands());

        for alias in ["plugin", "plugins", "marketplace", "market"] {
            let resolved = registry.find(alias);
            assert_eq!(
                resolved.map(|command| command.name.as_str()),
                Some("plugin"),
                "/{alias} must resolve to canonical /plugin"
            );
        }
    }

    // M11: audit-driven parity additions (Claude Code v2.1.128).
    #[test]
    fn audit_driven_parity_commands_are_registered() {
        let commands = builtin_slash_registry_commands();
        for name in [
            "usage",
            "sandbox",
            "doctor",
            "recap",
            "release-notes",
            "keybindings",
        ] {
            assert!(
                commands.iter().any(|command| command.name == name),
                "/{name} must be registered (M11 — 2026-05-14 — for Claude Code parity)"
            );
        }
    }

    #[test]
    fn doctor_keybindings_release_notes_have_aliases() {
        let commands = builtin_slash_registry_commands();
        let doctor = commands.iter().find(|c| c.name == "doctor").unwrap();
        assert_eq!(doctor.aliases, vec!["diagnose", "health"]);
        let kb = commands.iter().find(|c| c.name == "keybindings").unwrap();
        assert_eq!(kb.aliases, vec!["keys"]);
        let rn = commands.iter().find(|c| c.name == "release-notes").unwrap();
        assert_eq!(rn.aliases, vec!["changelog"]);
    }
}
