use super::types::Hook;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookConfig {
    pub hooks: Vec<Hook>,
}

impl HookConfig {
    pub fn from_yaml(text: &str) -> Result<Self> {
        serde_yaml::from_str(text).context("Failed to parse hooks config")
    }

    /// Writes the configuration and returns the exact text written, which is
    /// what consent to these hooks is recorded against. The text goes to a
    /// temporary file beside the target and is renamed over it, so a write
    /// that fails part-way leaves the old hooks.yaml whole.
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<String> {
        let path = path.as_ref();
        let folder = path.parent().unwrap_or_else(|| Path::new(""));

        if !folder.as_os_str().is_empty() {
            std::fs::create_dir_all(folder)
                .with_context(|| format!("Failed to create directory {:?}", folder))?;
        }

        let yaml =
            serde_yaml::to_string(&self).context("Failed to serialize hooks config to YAML")?;

        let file_name = path
            .file_name()
            .with_context(|| format!("{:?} does not name a file", path))?
            .to_string_lossy();
        let temporary = folder.join(format!(".{}.{}.tmp", file_name, uuid::Uuid::new_v4()));
        let written = std::fs::write(&temporary, &yaml)
            .and_then(|()| std::fs::rename(&temporary, path))
            .with_context(|| format!("Failed to write hooks config to {:?}", path));
        if written.is_err() {
            let _ = std::fs::remove_file(&temporary);
        }
        written?;

        Ok(yaml)
    }

    pub fn default_config_path() -> Result<PathBuf> {
        let home_dir = dirs::home_dir().context("Failed to get home directory")?;
        Ok(home_dir.join(".agiworkforce").join("hooks.yaml"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    #[test]
    fn test_load_save_config() {
        let config = HookConfig {
            hooks: vec![Hook {
                name: "Log tools".to_string(),
                events: vec![
                    super::super::types::HookEventType::PreToolUse,
                    super::super::types::HookEventType::PostToolUse,
                ],
                priority: 10,
                command: "echo tool".to_string(),
                enabled: true,
                timeout_secs: 30,
                env: std::collections::HashMap::new(),
                working_dir: Some("/tmp".to_string()),
                continue_on_error: false,
            }],
        };

        let temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path().to_path_buf();

        let written = config.save_to_file(&path).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), written);

        let loaded_config = HookConfig::from_yaml(&written).unwrap();
        assert_eq!(loaded_config.hooks.len(), 1);
        assert_eq!(loaded_config.hooks[0].name, "Log tools");
        assert_eq!(loaded_config.hooks[0].events, config.hooks[0].events);
        assert_eq!(loaded_config.hooks[0].working_dir.as_deref(), Some("/tmp"));
        assert!(!loaded_config.hooks[0].continue_on_error);
    }

    #[test]
    fn test_parse_yaml() {
        let yaml = r#"
hooks:
  - name: "Test Hook"
    events: [SessionStart, SessionEnd]
    priority: 10
    command: "echo test"
    enabled: true
    timeout_secs: 30
    continue_on_error: true
"#;

        let config = HookConfig::from_yaml(yaml).unwrap();
        assert_eq!(config.hooks.len(), 1);
        assert_eq!(config.hooks[0].name, "Test Hook");
    }

    #[test]
    fn a_saved_hook_keeps_the_choice_it_was_saved_with() {
        let yaml = r#"
hooks:
  - name: must-run
    events: [PreToolUse]
    command: "true"
    continue_on_error: false
  - name: optional
    events: [PreToolUse]
    command: "true"
    continue_on_error: true
  - name: written-before-the-choice-existed
    events: [PreToolUse]
    command: "true"
"#;

        let hooks = HookConfig::from_yaml(yaml).unwrap().hooks;

        assert!(!hooks[0].continue_on_error);
        assert!(hooks[1].continue_on_error);
        assert!(
            hooks[2].continue_on_error,
            "an entry with no stored choice behaves as it always has"
        );
    }

    #[test]
    fn text_that_is_not_a_hooks_file_is_an_error() {
        assert!(HookConfig::from_yaml("hooks: 3").is_err());
    }
}
