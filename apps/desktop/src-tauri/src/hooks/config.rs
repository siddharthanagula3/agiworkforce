use super::types::Hook;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Hook configuration file structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookConfig {
    pub hooks: Vec<Hook>,
}

impl HookConfig {
    /// Load hooks configuration from YAML file
    pub fn load_from_file<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref();

        if !path.exists() {
            // Return empty config if file doesn't exist
            return Ok(Self { hooks: Vec::new() });
        }

        let contents = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read hooks config from {:?}", path))?;

        let config: Self = serde_yaml::from_str(&contents)
            .with_context(|| format!("Failed to parse hooks config from {:?}", path))?;

        Ok(config)
    }

    /// Save hooks configuration to YAML file
    pub fn save_to_file<P: AsRef<Path>>(&self, path: P) -> Result<()> {
        let path = path.as_ref();

        // Create parent directory if it doesn't exist
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create directory {:?}", parent))?;
        }

        let yaml = serde_yaml::to_string(&self)
            .context("Failed to serialize hooks config to YAML")?;

        std::fs::write(path, yaml)
            .with_context(|| format!("Failed to write hooks config to {:?}", path))?;

        Ok(())
    }

    /// Get default hooks configuration path
    pub fn default_config_path() -> Result<PathBuf> {
        let home_dir = dirs::home_dir().context("Failed to get home directory")?;
        Ok(home_dir.join(".agiworkforce").join("hooks.yaml"))
    }

    /// Load from default location
    pub fn load_default() -> Result<Self> {
        let path = Self::default_config_path()?;
        Self::load_from_file(path)
    }

    /// Save to default location
    pub fn save_default(&self) -> Result<()> {
        let path = Self::default_config_path()?;
        self.save_to_file(path)
    }

    /// Add a hook to the configuration
    pub fn add_hook(&mut self, hook: Hook) -> Result<()> {
        // Check for duplicate names
        if self.hooks.iter().any(|h| h.name == hook.name) {
            return Err(anyhow::anyhow!("Hook with name '{}' already exists", hook.name));
        }

        self.hooks.push(hook);
        Ok(())
    }

    /// Remove a hook from the configuration
    pub fn remove_hook(&mut self, name: &str) -> Result<()> {
        let initial_len = self.hooks.len();
        self.hooks.retain(|h| h.name != name);

        if self.hooks.len() == initial_len {
            return Err(anyhow::anyhow!("Hook '{}' not found", name));
        }

        Ok(())
    }

    /// Update a hook in the configuration
    pub fn update_hook(&mut self, hook: Hook) -> Result<()> {
        if let Some(existing) = self.hooks.iter_mut().find(|h| h.name == hook.name) {
            *existing = hook;
            Ok(())
        } else {
            Err(anyhow::anyhow!("Hook '{}' not found", hook.name))
        }
    }

    /// Toggle a hook's enabled status
    pub fn toggle_hook(&mut self, name: &str, enabled: bool) -> Result<()> {
        if let Some(hook) = self.hooks.iter_mut().find(|h| h.name == name) {
            hook.enabled = enabled;
            Ok(())
        } else {
            Err(anyhow::anyhow!("Hook '{}' not found", name))
        }
    }

    /// Create example configuration
    pub fn create_example() -> Self {
        use super::types::HookEventType;
        use std::collections::HashMap;

        Self {
            hooks: vec![
                Hook {
                    name: "Log All Tools".to_string(),
                    events: vec![HookEventType::PreToolUse, HookEventType::PostToolUse],
                    priority: 10,
                    command: if cfg!(windows) {
                        "echo Tool executed: %HOOK_EVENT_TYPE%".to_string()
                    } else {
                        "echo \"Tool executed: $HOOK_EVENT_TYPE\"".to_string()
                    },
                    enabled: true,
                    timeout_secs: 30,
                    env: HashMap::new(),
                    working_dir: None,
                    continue_on_error: true,
                },
                Hook {
                    name: "Session Logger".to_string(),
                    events: vec![HookEventType::SessionStart, HookEventType::SessionEnd],
                    priority: 5,
                    command: if cfg!(windows) {
                        "echo [%date% %time%] Session event: %HOOK_EVENT_TYPE% >> session.log".to_string()
                    } else {
                        "echo \"[$(date)] Session event: $HOOK_EVENT_TYPE\" >> session.log".to_string()
                    },
                    enabled: true,
                    timeout_secs: 10,
                    env: HashMap::new(),
                    working_dir: None,
                    continue_on_error: true,
                },
                Hook {
                    name: "Goal Completion Notifier".to_string(),
                    events: vec![HookEventType::GoalCompleted],
                    priority: 20,
                    command: if cfg!(windows) {
                        "echo Goal completed!".to_string()
                    } else {
                        "echo \"Goal completed!\"".to_string()
                    },
                    enabled: true,
                    timeout_secs: 15,
                    env: HashMap::new(),
                    working_dir: None,
                    continue_on_error: true,
                },
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_load_save_config() {
        let config = HookConfig::create_example();

        let mut temp_file = NamedTempFile::new().unwrap();
        let path = temp_file.path().to_path_buf();

        config.save_to_file(&path).unwrap();

        let loaded_config = HookConfig::load_from_file(&path).unwrap();
        assert_eq!(loaded_config.hooks.len(), config.hooks.len());
    }

    #[test]
    fn test_add_remove_hook() {
        let mut config = HookConfig { hooks: Vec::new() };

        let hook = Hook {
            name: "test".to_string(),
            events: vec![],
            priority: 50,
            command: "echo test".to_string(),
            enabled: true,
            timeout_secs: 30,
            env: std::collections::HashMap::new(),
            working_dir: None,
            continue_on_error: true,
        };

        config.add_hook(hook.clone()).unwrap();
        assert_eq!(config.hooks.len(), 1);

        config.remove_hook("test").unwrap();
        assert_eq!(config.hooks.len(), 0);
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

        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(yaml.as_bytes()).unwrap();
        temp_file.flush().unwrap();

        let config = HookConfig::load_from_file(temp_file.path()).unwrap();
        assert_eq!(config.hooks.len(), 1);
        assert_eq!(config.hooks[0].name, "Test Hook");
    }
}
