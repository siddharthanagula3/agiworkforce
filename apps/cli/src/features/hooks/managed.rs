use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::hooks::{glob_match, parse_event_name, Hook, HookSource, HooksConfig};

pub const MANAGED_SETTINGS_FILE: &str = "managed-settings.json";

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedHookPolicy {
    #[serde(default)]
    pub managed_hooks_only: bool,
    #[serde(default = "default_allow_plugin_hooks")]
    pub allow_plugin_hooks: bool,
    #[serde(default)]
    pub allowed_commands: Option<Vec<String>>,
    #[serde(default)]
    pub hooks: HashMap<String, Vec<Hook>>,
}

fn default_allow_plugin_hooks() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedPluginPolicy {
    #[serde(default)]
    pub require_signed: bool,
    #[serde(default = "default_allow_unsigned_override")]
    pub allow_unsigned_override: bool,
}

fn default_allow_unsigned_override() -> bool {
    true
}

#[derive(Debug, Clone)]
pub enum ManagedPluginPolicyState {
    Absent,
    Loaded(ManagedPluginPolicy),
    Invalid(String),
}

#[derive(Debug, Default, Deserialize)]
struct ManagedSettingsDocument {
    #[serde(default)]
    hooks: Option<ManagedHookPolicy>,
    #[serde(default)]
    plugins: Option<ManagedPluginPolicy>,
}

fn read_managed_document(path: &Path) -> Result<Option<ManagedSettingsDocument>, String> {
    let raw = match std::fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("cannot read {}: {error}", path.display())),
    };
    serde_json::from_str::<ManagedSettingsDocument>(&raw)
        .map(Some)
        .map_err(|error| format!("{}: {error}", path.display()))
}

pub fn load_managed_plugin_policy() -> ManagedPluginPolicyState {
    match managed_settings_path() {
        Some(path) => load_managed_plugin_policy_from(&path),
        None => ManagedPluginPolicyState::Absent,
    }
}

pub fn load_managed_plugin_policy_from(path: &Path) -> ManagedPluginPolicyState {
    match read_managed_document(path) {
        Ok(Some(ManagedSettingsDocument {
            plugins: Some(policy),
            ..
        })) => ManagedPluginPolicyState::Loaded(policy),
        Ok(_) => ManagedPluginPolicyState::Absent,
        Err(error) => ManagedPluginPolicyState::Invalid(error),
    }
}

#[derive(Debug, Clone)]
pub enum ManagedHookPolicyState {
    Absent,
    Loaded(ManagedHookPolicy),
    Invalid(String),
}

impl ManagedHookPolicyState {
    pub fn has_managed_hooks(&self) -> bool {
        matches!(self, Self::Loaded(policy) if policy.hooks.values().any(|hooks| !hooks.is_empty()))
    }
}

pub fn managed_settings_path() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        Some(PathBuf::from("/Library/Application Support/AGIWorkforce").join(MANAGED_SETTINGS_FILE))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("ProgramData").map(|root| {
            PathBuf::from(root)
                .join("AGIWorkforce")
                .join(MANAGED_SETTINGS_FILE)
        })
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Some(PathBuf::from("/etc/agiworkforce").join(MANAGED_SETTINGS_FILE))
    }
}

pub fn load_managed_hook_policy() -> ManagedHookPolicyState {
    match managed_settings_path() {
        Some(path) => load_managed_hook_policy_from(&path),
        None => ManagedHookPolicyState::Absent,
    }
}

pub fn load_managed_hook_policy_from(path: &Path) -> ManagedHookPolicyState {
    match read_managed_document(path) {
        Ok(Some(ManagedSettingsDocument {
            hooks: Some(policy),
            ..
        })) => match validate_policy(policy) {
            Ok(policy) => ManagedHookPolicyState::Loaded(policy),
            Err(error) => ManagedHookPolicyState::Invalid(format!("{}: {error}", path.display())),
        },
        Ok(_) => ManagedHookPolicyState::Absent,
        Err(error) => ManagedHookPolicyState::Invalid(error),
    }
}

fn validate_policy(mut policy: ManagedHookPolicy) -> Result<ManagedHookPolicy, String> {
    let mut hooks = HashMap::new();
    for (event, entries) in policy.hooks.drain() {
        let canonical = parse_event_name(&event)
            .map_err(|error| error.to_string())?
            .to_string();
        let entries: Vec<Hook> = entries
            .into_iter()
            .map(|mut hook| {
                hook.source = HookSource::Managed;
                hook
            })
            .collect();
        hooks
            .entry(canonical)
            .or_insert_with(Vec::new)
            .extend(entries);
    }
    policy.hooks = hooks;
    Ok(policy)
}

fn command_allowed(policy: &ManagedHookPolicy, command: &str) -> bool {
    match &policy.allowed_commands {
        None => true,
        Some(patterns) => patterns
            .iter()
            .any(|pattern| glob_match(pattern, command.trim())),
    }
}

pub fn apply_managed_hook_policy(
    config: HooksConfig,
    state: &ManagedHookPolicyState,
) -> HooksConfig {
    let policy = match state {
        ManagedHookPolicyState::Absent => return config,
        ManagedHookPolicyState::Invalid(error) => {
            eprintln!(
                "{} managed hook policy is invalid ({}); only managed hooks may run, and none could be read",
                crate::terminal_style::danger_header("warning:"),
                crate::terminal_text::sanitize_terminal_text(error)
            );
            return HooksConfig::default();
        }
        ManagedHookPolicyState::Loaded(policy) => policy,
    };

    let mut merged: HashMap<String, Vec<Hook>> = policy.hooks.clone();
    if policy.managed_hooks_only {
        return HooksConfig { hooks: merged };
    }
    let mut refused = 0usize;
    for (event, hooks) in config.hooks {
        for hook in hooks {
            let permitted = match hook.source {
                HookSource::Managed => true,
                HookSource::Plugin => {
                    policy.allow_plugin_hooks && command_allowed(policy, &hook.command)
                }
                HookSource::User => command_allowed(policy, &hook.command),
            };
            if permitted {
                merged.entry(event.clone()).or_default().push(hook);
            } else {
                refused += 1;
            }
        }
    }
    if refused > 0 {
        eprintln!(
            "{} {} hook(s) were not loaded because the managed hook policy does not permit them",
            crate::terminal_style::warning("note:"),
            refused
        );
    }
    HooksConfig { hooks: merged }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hook(command: &str, source: HookSource) -> Hook {
        Hook {
            command: command.to_string(),
            args: Vec::new(),
            timeout: 5,
            blocking: true,
            matcher: None,
            if_condition: None,
            source,
        }
    }

    fn user_and_plugin_config() -> HooksConfig {
        let mut hooks = HashMap::new();
        hooks.insert(
            "PreToolUse".to_string(),
            vec![
                hook("./scripts/lint.sh", HookSource::User),
                hook("curl https://evil.example", HookSource::User),
                hook("./scripts/plugin.sh", HookSource::Plugin),
            ],
        );
        HooksConfig { hooks }
    }

    fn write_policy(json: &str) -> (tempfile::TempDir, ManagedHookPolicyState) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(MANAGED_SETTINGS_FILE);
        std::fs::write(&path, json).unwrap();
        let state = load_managed_hook_policy_from(&path);
        (dir, state)
    }

    fn commands(config: &HooksConfig, event: &str) -> Vec<(String, HookSource)> {
        config
            .hooks
            .get(event)
            .map(|hooks| {
                hooks
                    .iter()
                    .map(|hook| (hook.command.clone(), hook.source))
                    .collect()
            })
            .unwrap_or_default()
    }

    #[test]
    fn no_managed_file_leaves_hooks_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let state = load_managed_hook_policy_from(&dir.path().join(MANAGED_SETTINGS_FILE));
        assert!(matches!(state, ManagedHookPolicyState::Absent));
        let config = apply_managed_hook_policy(user_and_plugin_config(), &state);
        assert_eq!(commands(&config, "PreToolUse").len(), 3);
    }

    #[test]
    fn managed_hooks_run_first_and_the_allowlist_filters_the_rest() {
        let (_dir, state) = write_policy(
            r#"{"hooks":{
                "allowPluginHooks": false,
                "allowedCommands": ["./scripts/*"],
                "hooks": {"BeforeToolUse": [{"command": "/opt/corp/audit.sh"}]}
            }}"#,
        );
        let config = apply_managed_hook_policy(user_and_plugin_config(), &state);
        assert_eq!(
            commands(&config, "PreToolUse"),
            vec![
                ("/opt/corp/audit.sh".to_string(), HookSource::Managed),
                ("./scripts/lint.sh".to_string(), HookSource::User),
            ]
        );
    }

    #[test]
    fn managed_hooks_only_drops_every_user_and_plugin_hook() {
        let (_dir, state) = write_policy(
            r#"{"hooks":{"managedHooksOnly": true,"hooks":{"Stop":[{"command":"/opt/corp/stop.sh"}]}}}"#,
        );
        let config = apply_managed_hook_policy(user_and_plugin_config(), &state);
        assert!(commands(&config, "PreToolUse").is_empty());
        assert_eq!(
            commands(&config, "Stop"),
            vec![("/opt/corp/stop.sh".to_string(), HookSource::Managed)]
        );
    }

    #[test]
    fn an_unreadable_policy_fails_closed() {
        let (_dir, state) = write_policy(r#"{"hooks":{"managedHooksOnly": "yes"}}"#);
        assert!(matches!(state, ManagedHookPolicyState::Invalid(_)));
        let config = apply_managed_hook_policy(user_and_plugin_config(), &state);
        assert!(config.hooks.is_empty());

        let (_dir, state) = write_policy(r#"{"hooks":{"hooks":{"NotAnEvent":[]}}}"#);
        assert!(matches!(state, ManagedHookPolicyState::Invalid(_)));
    }

    #[test]
    fn the_plugin_section_loads_independently_of_hooks() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(MANAGED_SETTINGS_FILE);
        std::fs::write(
            &path,
            r#"{"plugins":{"requireSigned":true,"allowUnsignedOverride":false}}"#,
        )
        .unwrap();
        let ManagedPluginPolicyState::Loaded(policy) = load_managed_plugin_policy_from(&path)
        else {
            panic!("plugin policy should load");
        };
        assert!(policy.require_signed);
        assert!(!policy.allow_unsigned_override);
        assert!(matches!(
            load_managed_hook_policy_from(&path),
            ManagedHookPolicyState::Absent
        ));

        std::fs::write(&path, r#"{"plugins":{"requireSigned":"yes"}}"#).unwrap();
        assert!(matches!(
            load_managed_plugin_policy_from(&path),
            ManagedPluginPolicyState::Invalid(_)
        ));
    }

    #[test]
    fn a_managed_hook_cannot_be_relabelled_by_its_json() {
        let (_dir, state) = write_policy(
            r#"{"hooks":{"hooks":{"Stop":[{"command":"/opt/corp/stop.sh","source":"user"}]}}}"#,
        );
        let ManagedHookPolicyState::Loaded(policy) = state else {
            panic!("policy should load");
        };
        assert_eq!(policy.hooks["Stop"][0].source, HookSource::Managed);
    }
}
