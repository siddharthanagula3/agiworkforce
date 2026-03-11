use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Project-level configuration that can be overridden at multiple levels.
///
/// Fields use `Option<T>` so that partial configs can be merged with
/// project > global > default precedence. A `None` value means "not set
/// at this level; fall through to the next."
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectConfig {
    pub default_model: Option<String>,
    pub theme: Option<String>,
    pub auto_approve_tools: Option<bool>,
    pub allowed_directories: Option<Vec<String>>,
    pub custom_instructions: Option<String>,
    pub auto_format_on_save: Option<bool>,
    pub agent_mode: Option<String>,
    pub language: Option<String>,
}

/// Three-tier configuration hierarchy: project > global > defaults.
///
/// Load once via [`ConfigHierarchy::load`], then query resolved values
/// through the accessor methods. Each accessor walks the chain
/// (project, then global, then defaults) and returns the first `Some`.
pub struct ConfigHierarchy {
    project_config: Option<ProjectConfig>,
    global_config: Option<ProjectConfig>,
    defaults: ProjectConfig,
}

impl ConfigHierarchy {
    /// Build the hierarchy by reading config files from disk.
    ///
    /// * Global config: `~/.agiworkforce/config.json`
    /// * Project config: `{project_root}/.agiworkforce/config.json`
    ///
    /// Missing or malformed files are silently ignored (treated as absent).
    pub fn load(project_root: Option<&Path>) -> Self {
        let defaults = ProjectConfig::default();

        let global_config = dirs::home_dir()
            .map(|h| h.join(".agiworkforce").join("config.json"))
            .and_then(|p| Self::load_config_file(&p));

        let project_config = project_root
            .and_then(|root| Self::load_config_file(&root.join(".agiworkforce").join("config.json")));

        Self {
            project_config,
            global_config,
            defaults,
        }
    }

    /// Attempt to read and deserialize a single config file.
    fn load_config_file(path: &Path) -> Option<ProjectConfig> {
        if !path.exists() {
            return None;
        }
        let content = std::fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    }

    // ── Resolved accessors ───────────────────────────────────────────

    /// Resolved `defaultModel` (project > global > default).
    pub fn default_model(&self) -> Option<&str> {
        self.project_config
            .as_ref()
            .and_then(|c| c.default_model.as_deref())
            .or(self.global_config
                .as_ref()
                .and_then(|c| c.default_model.as_deref()))
            .or(self.defaults.default_model.as_deref())
    }

    /// Resolved `theme` (project > global > default).
    pub fn theme(&self) -> Option<&str> {
        self.project_config
            .as_ref()
            .and_then(|c| c.theme.as_deref())
            .or(self.global_config
                .as_ref()
                .and_then(|c| c.theme.as_deref()))
            .or(self.defaults.theme.as_deref())
    }

    /// Resolved `autoApproveTools` (project > global > default `false`).
    pub fn auto_approve_tools(&self) -> bool {
        self.project_config
            .as_ref()
            .and_then(|c| c.auto_approve_tools)
            .or(self.global_config
                .as_ref()
                .and_then(|c| c.auto_approve_tools))
            .or(self.defaults.auto_approve_tools)
            .unwrap_or(false)
    }

    /// Resolved `customInstructions` (project > global > default).
    pub fn custom_instructions(&self) -> Option<&str> {
        self.project_config
            .as_ref()
            .and_then(|c| c.custom_instructions.as_deref())
            .or(self.global_config
                .as_ref()
                .and_then(|c| c.custom_instructions.as_deref()))
            .or(self.defaults.custom_instructions.as_deref())
    }

    /// Resolved `autoFormatOnSave` (project > global > default `true`).
    pub fn auto_format_on_save(&self) -> bool {
        self.project_config
            .as_ref()
            .and_then(|c| c.auto_format_on_save)
            .or(self.global_config
                .as_ref()
                .and_then(|c| c.auto_format_on_save))
            .or(self.defaults.auto_format_on_save)
            .unwrap_or(true)
    }

    /// Resolved `agentMode` (project > global > default).
    pub fn agent_mode(&self) -> Option<&str> {
        self.project_config
            .as_ref()
            .and_then(|c| c.agent_mode.as_deref())
            .or(self.global_config
                .as_ref()
                .and_then(|c| c.agent_mode.as_deref()))
            .or(self.defaults.agent_mode.as_deref())
    }

    /// Resolved `language` (project > global > default).
    pub fn language(&self) -> Option<&str> {
        self.project_config
            .as_ref()
            .and_then(|c| c.language.as_deref())
            .or(self.global_config
                .as_ref()
                .and_then(|c| c.language.as_deref()))
            .or(self.defaults.language.as_deref())
    }

    /// Resolved `allowedDirectories` (project > global > default).
    pub fn allowed_directories(&self) -> Option<&[String]> {
        self.project_config
            .as_ref()
            .and_then(|c| c.allowed_directories.as_deref())
            .or(self.global_config
                .as_ref()
                .and_then(|c| c.allowed_directories.as_deref()))
            .or(self.defaults.allowed_directories.as_deref())
    }

    /// Build a fully-resolved [`ProjectConfig`] by merging all three layers.
    pub fn resolved(&self) -> ProjectConfig {
        ProjectConfig {
            default_model: self.default_model().map(|s| s.to_string()),
            theme: self.theme().map(|s| s.to_string()),
            auto_approve_tools: Some(self.auto_approve_tools()),
            allowed_directories: self
                .allowed_directories()
                .map(|dirs| dirs.to_vec()),
            custom_instructions: self.custom_instructions().map(|s| s.to_string()),
            auto_format_on_save: Some(self.auto_format_on_save()),
            agent_mode: self.agent_mode().map(|s| s.to_string()),
            language: self.language().map(|s| s.to_string()),
        }
    }

    // ── Persistence helpers ──────────────────────────────────────────

    /// Persist a config to the global location (`~/.agiworkforce/config.json`).
    pub fn save_global(config: &ProjectConfig) -> anyhow::Result<()> {
        let dir = dirs::home_dir()
            .map(|h| h.join(".agiworkforce"))
            .ok_or_else(|| anyhow::anyhow!("Cannot determine home directory"))?;
        Self::write_config(config, &dir)
    }

    /// Persist a config to a project location (`{root}/.agiworkforce/config.json`).
    pub fn save_project(config: &ProjectConfig, project_root: &Path) -> anyhow::Result<()> {
        let dir = project_root.join(".agiworkforce");
        Self::write_config(config, &dir)
    }

    /// Return the resolved path for global config.
    pub fn global_config_path() -> Option<PathBuf> {
        dirs::home_dir().map(|h| h.join(".agiworkforce").join("config.json"))
    }

    /// Return the resolved path for a project config.
    pub fn project_config_path(project_root: &Path) -> PathBuf {
        project_root.join(".agiworkforce").join("config.json")
    }

    /// Shared writer: ensures directory exists, serializes to pretty JSON.
    fn write_config(config: &ProjectConfig, dir: &Path) -> anyhow::Result<()> {
        std::fs::create_dir_all(dir)?;
        let content = serde_json::to_string_pretty(config)?;
        std::fs::write(dir.join("config.json"), content)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// When no config files exist, all accessors return their defaults.
    #[test]
    fn test_defaults_when_no_files_exist() {
        let tmp = TempDir::new().expect("tempdir");
        let hierarchy = ConfigHierarchy::load(Some(tmp.path()));

        assert_eq!(hierarchy.default_model(), None);
        assert_eq!(hierarchy.theme(), None);
        assert!(!hierarchy.auto_approve_tools());
        assert!(hierarchy.auto_format_on_save());
        assert_eq!(hierarchy.custom_instructions(), None);
        assert_eq!(hierarchy.agent_mode(), None);
        assert_eq!(hierarchy.language(), None);
        assert_eq!(hierarchy.allowed_directories(), None);
    }

    /// Global config values are picked up when there is no project config.
    #[test]
    fn test_global_config_override() {
        let tmp = TempDir::new().expect("tempdir");
        let global_dir = tmp.path().join("global").join(".agiworkforce");
        std::fs::create_dir_all(&global_dir).expect("mkdir");

        let global_config = ProjectConfig {
            default_model: Some("claude-3-opus".to_string()),
            theme: Some("dark".to_string()),
            auto_approve_tools: Some(true),
            ..Default::default()
        };
        let json = serde_json::to_string_pretty(&global_config).expect("serialize");
        std::fs::write(global_dir.join("config.json"), json).expect("write");

        // Build hierarchy with an explicit global path by using the struct directly
        let hierarchy = ConfigHierarchy {
            project_config: None,
            global_config: ConfigHierarchy::load_config_file(
                &global_dir.join("config.json"),
            ),
            defaults: ProjectConfig::default(),
        };

        assert_eq!(hierarchy.default_model(), Some("claude-3-opus"));
        assert_eq!(hierarchy.theme(), Some("dark"));
        assert!(hierarchy.auto_approve_tools());
        // Default for auto_format_on_save should still be true
        assert!(hierarchy.auto_format_on_save());
    }

    /// Project config takes precedence over global config.
    #[test]
    fn test_project_overrides_global() {
        let tmp = TempDir::new().expect("tempdir");

        let global_config = ProjectConfig {
            default_model: Some("claude-3-opus".to_string()),
            theme: Some("dark".to_string()),
            auto_approve_tools: Some(true),
            language: Some("en".to_string()),
            ..Default::default()
        };

        let project_config = ProjectConfig {
            default_model: Some("gpt-4o".to_string()),
            // theme intentionally not set at project level
            auto_approve_tools: Some(false),
            ..Default::default()
        };

        // Write project config to disk for the load_config_file path
        let project_dir = tmp.path().join("project").join(".agiworkforce");
        std::fs::create_dir_all(&project_dir).expect("mkdir");
        let project_json = serde_json::to_string_pretty(&project_config).expect("serialize");
        std::fs::write(project_dir.join("config.json"), project_json).expect("write");

        let hierarchy = ConfigHierarchy {
            project_config: ConfigHierarchy::load_config_file(
                &project_dir.join("config.json"),
            ),
            global_config: Some(global_config),
            defaults: ProjectConfig::default(),
        };

        // Project-level value wins
        assert_eq!(hierarchy.default_model(), Some("gpt-4o"));
        // Falls through to global
        assert_eq!(hierarchy.theme(), Some("dark"));
        // Project explicitly sets false, overriding global true
        assert!(!hierarchy.auto_approve_tools());
        // Falls through to global
        assert_eq!(hierarchy.language(), Some("en"));
    }

    /// Partial project config only overrides the fields it sets.
    #[test]
    fn test_partial_override() {
        let global_config = ProjectConfig {
            default_model: Some("claude-3-sonnet".to_string()),
            theme: Some("light".to_string()),
            auto_approve_tools: Some(false),
            auto_format_on_save: Some(false),
            language: Some("fr".to_string()),
            agent_mode: Some("autonomous".to_string()),
            ..Default::default()
        };

        let project_config = ProjectConfig {
            theme: Some("solarized".to_string()),
            ..Default::default()
        };

        let hierarchy = ConfigHierarchy {
            project_config: Some(project_config),
            global_config: Some(global_config),
            defaults: ProjectConfig::default(),
        };

        // Only theme is overridden at project level
        assert_eq!(hierarchy.theme(), Some("solarized"));
        // Everything else falls through to global
        assert_eq!(hierarchy.default_model(), Some("claude-3-sonnet"));
        assert!(!hierarchy.auto_approve_tools());
        assert!(!hierarchy.auto_format_on_save());
        assert_eq!(hierarchy.language(), Some("fr"));
        assert_eq!(hierarchy.agent_mode(), Some("autonomous"));
    }

    /// `resolved()` produces a fully merged config.
    #[test]
    fn test_resolved_config() {
        let global_config = ProjectConfig {
            default_model: Some("claude-3-opus".to_string()),
            theme: Some("dark".to_string()),
            language: Some("en".to_string()),
            ..Default::default()
        };

        let project_config = ProjectConfig {
            default_model: Some("gpt-4o".to_string()),
            custom_instructions: Some("Be concise".to_string()),
            ..Default::default()
        };

        let hierarchy = ConfigHierarchy {
            project_config: Some(project_config),
            global_config: Some(global_config),
            defaults: ProjectConfig::default(),
        };

        let resolved = hierarchy.resolved();
        assert_eq!(resolved.default_model.as_deref(), Some("gpt-4o"));
        assert_eq!(resolved.theme.as_deref(), Some("dark"));
        assert_eq!(resolved.custom_instructions.as_deref(), Some("Be concise"));
        assert_eq!(resolved.language.as_deref(), Some("en"));
        assert_eq!(resolved.auto_approve_tools, Some(false));
        assert_eq!(resolved.auto_format_on_save, Some(true));
    }

    /// Round-trip: save then load a project config.
    #[test]
    fn test_save_and_load_project() {
        let tmp = TempDir::new().expect("tempdir");
        let project_root = tmp.path().join("my-project");
        std::fs::create_dir_all(&project_root).expect("mkdir");

        let config = ProjectConfig {
            default_model: Some("gpt-4o".to_string()),
            theme: Some("monokai".to_string()),
            auto_approve_tools: Some(true),
            ..Default::default()
        };

        ConfigHierarchy::save_project(&config, &project_root).expect("save");

        let expected_path = ConfigHierarchy::project_config_path(&project_root);
        assert!(expected_path.exists());

        let loaded = ConfigHierarchy::load_config_file(&expected_path)
            .expect("load should succeed");
        assert_eq!(loaded.default_model.as_deref(), Some("gpt-4o"));
        assert_eq!(loaded.theme.as_deref(), Some("monokai"));
        assert_eq!(loaded.auto_approve_tools, Some(true));
    }
}
