use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Tracks where each config value originated (global file, project file, or env var).
#[derive(Debug, Clone, Default)]
pub struct ConfigSource {
    pub global_path: Option<PathBuf>,
    pub project_path: Option<PathBuf>,
    pub env_overrides: Vec<String>,
}

/// Top-level CLI configuration, loaded from ~/.agiworkforce/config.toml
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliConfig {
    #[serde(default = "DefaultConfig::new")]
    pub default: DefaultConfig,

    #[serde(default)]
    pub providers: HashMap<String, ProviderConfig>,

    /// Tracks provenance of configuration values. Excluded from serialization.
    #[serde(skip)]
    pub source: ConfigSource,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefaultConfig {
    #[serde(default = "default_model")]
    pub model: String,

    #[serde(default = "default_provider")]
    pub provider: String,

    #[serde(default = "default_stream")]
    pub stream: bool,

    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,

    /// Temperature for LLM sampling (0.0 - 1.0). None uses provider default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,

    /// Ordered list of fallback models to try on failure.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallback_chain: Vec<String>,

    /// Model to use in fast mode (cheaper/faster alternative).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fast_model: Option<String>,

    /// Approval mode: suggest (default), auto-edit, full-auto.
    #[serde(default = "default_approval_mode")]
    pub approval_mode: String,

    /// Sandbox mode: off, read-only, workspace, full-auto.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sandbox_mode: Option<String>,

    /// Model for code review (defaults to main model).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub review_model: Option<String>,

    /// Cloud mode default model (top agentic coding models only).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cloud_model: Option<String>,

    /// MCP server initialize timeout in seconds (default: 30).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp_initialize_timeout: Option<u64>,

    /// MCP tool call timeout in seconds (default: 120).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mcp_call_tool_timeout: Option<u64>,
}

fn default_approval_mode() -> String {
    "suggest".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// Environment variable name holding the API key
    pub api_key_env: Option<String>,

    /// Base URL override (used for Ollama, local LLMs, proxies)
    pub base_url: Option<String>,
}

fn default_model() -> String {
    crate::model_catalog::default_model().to_string()
}

fn default_provider() -> String {
    crate::model_catalog::default_provider().to_string()
}

fn default_stream() -> bool {
    true
}

fn default_max_tokens() -> u32 {
    8192
}

impl DefaultConfig {
    fn new() -> Self {
        Self {
            model: default_model(),
            provider: default_provider(),
            stream: default_stream(),
            max_tokens: default_max_tokens(),
            temperature: None,
            fallback_chain: Vec::new(),
            fast_model: None,
            approval_mode: default_approval_mode(),
            sandbox_mode: None,
            review_model: None,
            cloud_model: None,
            mcp_initialize_timeout: None,
            mcp_call_tool_timeout: None,
        }
    }
}

impl Default for CliConfig {
    fn default() -> Self {
        let mut providers = HashMap::new();

        providers.insert(
            "anthropic".to_string(),
            ProviderConfig {
                api_key_env: Some("ANTHROPIC_API_KEY".to_string()),
                base_url: None,
            },
        );
        providers.insert(
            "openai".to_string(),
            ProviderConfig {
                api_key_env: Some("OPENAI_API_KEY".to_string()),
                base_url: None,
            },
        );
        providers.insert(
            "google".to_string(),
            ProviderConfig {
                api_key_env: Some("GOOGLE_API_KEY".to_string()),
                base_url: None,
            },
        );
        providers.insert(
            "ollama".to_string(),
            ProviderConfig {
                api_key_env: None,
                base_url: Some("http://localhost:11434".to_string()),
            },
        );
        providers.insert(
            "mistral".to_string(),
            ProviderConfig {
                api_key_env: Some("MISTRAL_API_KEY".to_string()),
                base_url: None,
            },
        );
        providers.insert(
            "xai".to_string(),
            ProviderConfig {
                api_key_env: Some("XAI_API_KEY".to_string()),
                base_url: None,
            },
        );
        providers.insert(
            "deepseek".to_string(),
            ProviderConfig {
                api_key_env: Some("DEEPSEEK_API_KEY".to_string()),
                base_url: None,
            },
        );
        providers.insert(
            "ollama-cloud".to_string(),
            ProviderConfig {
                api_key_env: Some("OLLAMA_API_KEY".to_string()),
                base_url: Some("https://api.ollama.com/v1".to_string()),
            },
        );

        Self {
            default: DefaultConfig::new(),
            providers,
            source: ConfigSource::default(),
        }
    }
}

impl CliConfig {
    /// Returns the path to the config directory: ~/.agiworkforce/
    /// Creates the directory with mode 0o700 (owner-only) if it doesn't exist.
    pub fn config_dir() -> Result<PathBuf> {
        let home = dirs::home_dir().context("Could not determine home directory")?;
        let dir = home.join(".agiworkforce");
        if !dir.exists() {
            std::fs::create_dir_all(&dir).context("Failed to create config directory")?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
            }
        }
        Ok(dir)
    }

    /// Returns the path to the config file: ~/.agiworkforce/config.toml
    pub fn config_path() -> Result<PathBuf> {
        Ok(Self::config_dir()?.join("config.toml"))
    }

    /// Load config from disk, falling back to defaults if file doesn't exist.
    pub fn load() -> Result<Self> {
        let path = Self::config_path()?;

        if !path.exists() {
            return Ok(Self::default());
        }

        let contents = std::fs::read_to_string(&path).context("Failed to read config file")?;
        let mut config: CliConfig =
            toml::from_str(&contents).context("Failed to parse config.toml")?;
        config.source.global_path = Some(path);
        Ok(config)
    }

    /// Load project-level config from `.agiworkforce/config.toml` in the current directory.
    #[allow(dead_code)]
    pub fn load_project_config() -> Option<CliConfig> {
        let cwd = std::env::current_dir().ok()?;
        let project_config = cwd.join(".agiworkforce").join("config.toml");
        if !project_config.exists() {
            return None;
        }
        let contents = std::fs::read_to_string(&project_config).ok()?;
        let mut config: CliConfig = toml::from_str(&contents).ok()?;
        config.source.project_path = Some(project_config);
        Some(config)
    }

    /// Load project-level config from a specific directory (useful for testing).
    #[cfg(test)]
    fn load_project_config_from(dir: &std::path::Path) -> Option<CliConfig> {
        let project_config = dir.join(".agiworkforce").join("config.toml");
        if !project_config.exists() {
            return None;
        }
        let contents = std::fs::read_to_string(&project_config).ok()?;
        let mut config: CliConfig = toml::from_str(&contents).ok()?;
        config.source.project_path = Some(project_config);
        Some(config)
    }

    /// Returns true if the given project config contains overrides for
    /// sensitive fields that could be used for credential exfiltration:
    ///   - providers.*.base_url override (routes API calls to attacker server)
    ///
    /// MED-1: A malicious repo can ship `.agiworkforce/config.toml` with
    /// `[providers.anthropic] base_url = "https://attacker.com/v1"`. When the
    /// developer clones the repo and runs `agiworkforce`, their API key is
    /// silently exfiltrated on the first LLM call.
    pub fn has_sensitive_project_overrides(project: &CliConfig) -> bool {
        for (_name, provider) in &project.providers {
            if provider.base_url.is_some() {
                return true;
            }
        }
        false
    }

    /// Load merged config: global config -> project overrides -> env overrides.
    ///
    /// Precedence (highest wins): env vars > project config > global config > defaults.
    ///
    /// MED-1: When a project config overrides sensitive fields (provider base_url),
    /// a warning is printed to stderr. This is a defense-in-depth measure; callers
    /// that need interactive confirmation should call `load_project_config()` and
    /// `has_sensitive_project_overrides()` separately.
    #[allow(dead_code)]
    pub fn load_merged() -> Result<Self> {
        let mut config = Self::load()?;
        if let Some(project) = Self::load_project_config() {
            if Self::has_sensitive_project_overrides(&project) {
                let project_path = project
                    .source
                    .project_path
                    .as_ref()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|| ".agiworkforce/config.toml".to_string());
                // SECURITY: warn loudly — project config is overriding provider base_url,
                // which can route API calls (and credentials) to an attacker-controlled server.
                eprintln!(
                    "security warning: project config at {:?} overrides provider base_url. \
                     This can route your API keys to a third-party server. \
                     Only load project configs from repositories you trust. \
                     Use --trust-project-config to suppress this warning.",
                    project_path
                );
            }
            config.merge_from(&project);
        }
        config.merge_env_overrides();
        Ok(config)
    }

    /// Merge values from another config, using `other`'s non-default values as overrides.
    #[allow(dead_code)]
    pub fn merge_from(&mut self, other: &CliConfig) {
        // If other has a non-default model, use it
        if other.default.model != default_model() {
            self.default.model = other.default.model.clone();
        }
        // If other has a non-default provider, use it
        if other.default.provider != default_provider() {
            self.default.provider = other.default.provider.clone();
        }
        // If other has a non-default max_tokens, use it
        if other.default.max_tokens != default_max_tokens() {
            self.default.max_tokens = other.default.max_tokens;
        }
        // If other has a non-default stream, use it
        if other.default.stream != default_stream() {
            self.default.stream = other.default.stream;
        }
        // If other has temperature set, use it
        if other.default.temperature.is_some() {
            self.default.temperature = other.default.temperature;
        }
        // If other has fallback chain, use it
        if !other.default.fallback_chain.is_empty() {
            self.default.fallback_chain = other.default.fallback_chain.clone();
        }
        // If other has fast_model, use it
        if other.default.fast_model.is_some() {
            self.default.fast_model = other.default.fast_model.clone();
        }
        // Merge approval_mode if non-default
        if other.default.approval_mode != default_approval_mode() {
            self.default.approval_mode = other.default.approval_mode.clone();
        }
        // Merge sandbox_mode if set
        if other.default.sandbox_mode.is_some() {
            self.default.sandbox_mode = other.default.sandbox_mode.clone();
        }
        // Merge review_model if set
        if other.default.review_model.is_some() {
            self.default.review_model = other.default.review_model.clone();
        }
        // Merge cloud_model if set
        if other.default.cloud_model.is_some() {
            self.default.cloud_model = other.default.cloud_model.clone();
        }
        // Merge providers: other's entries override self's for matching keys
        for (key, value) in &other.providers {
            self.providers.insert(key.clone(), value.clone());
        }
        // Preserve project path from other's source
        if other.source.project_path.is_some() {
            self.source.project_path = other.source.project_path.clone();
        }
    }

    /// Write the current config to disk, creating the directory if needed.
    pub fn save(&self) -> Result<()> {
        let dir = Self::config_dir()?;
        std::fs::create_dir_all(&dir).context("Failed to create config directory")?;

        let path = Self::config_path()?;
        let contents = toml::to_string_pretty(self).context("Failed to serialize config")?;
        std::fs::write(&path, contents).context("Failed to write config file")?;
        Ok(())
    }

    /// Resolve the API key for a given provider by reading the environment variable.
    pub fn resolve_api_key(&self, provider: &str) -> Option<String> {
        let provider_config = self.providers.get(provider)?;
        let env_var = provider_config.api_key_env.as_ref()?;
        std::env::var(env_var).ok()
    }

    /// Get the base URL for a provider, if configured.
    pub fn base_url(&self, provider: &str) -> Option<String> {
        self.providers.get(provider)?.base_url.clone()
    }

    /// Display the config as a formatted string for --config output.
    ///
    /// Shows which values came from global config, project config, or env overrides.
    pub fn display(&self) -> String {
        let mut out = String::new();

        // Source information
        out.push_str("Sources:\n");
        match &self.source.global_path {
            Some(p) => out.push_str(&format!("  Global:  {}\n", p.display())),
            None => out.push_str(&format!(
                "  Global:  {} (defaults)\n",
                Self::config_path()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| "unknown".to_string())
            )),
        }
        match &self.source.project_path {
            Some(p) => out.push_str(&format!("  Project: {}\n", p.display())),
            None => out.push_str("  Project: none\n"),
        }
        if self.source.env_overrides.is_empty() {
            out.push_str("  Env:     none\n");
        } else {
            out.push_str(&format!(
                "  Env:     {}\n",
                self.source.env_overrides.join(", ")
            ));
        }

        out.push('\n');

        // Current effective values
        out.push_str(&format!("Model:      {}\n", self.default.model));
        out.push_str(&format!("Provider:   {}\n", self.default.provider));
        out.push_str(&format!("Stream:     {}\n", self.default.stream));
        out.push_str(&format!("Max tokens: {}\n", self.default.max_tokens));
        if let Some(temp) = self.default.temperature {
            out.push_str(&format!("Temperature: {}\n", temp));
        }
        if !self.default.fallback_chain.is_empty() {
            out.push_str(&format!(
                "Fallback:   {}\n",
                self.default.fallback_chain.join(" -> ")
            ));
        }
        if let Some(ref fast) = self.default.fast_model {
            out.push_str(&format!("Fast model: {}\n", fast));
        }

        out.push_str("\nProviders:\n");
        for (name, pc) in &self.providers {
            let key_status = if let Some(env_var) = &pc.api_key_env {
                if std::env::var(env_var).is_ok() {
                    format!("{} (set)", env_var)
                } else {
                    format!("{} (not set)", env_var)
                }
            } else {
                "no key needed".to_string()
            };
            let url = pc.base_url.as_deref().unwrap_or("default");
            out.push_str(&format!(
                "  {:<12} key: {:<35} url: {}\n",
                name, key_status, url
            ));
        }
        out
    }

    /// Validate the configuration, returning an error if any field is out of range.
    pub fn validate(&self) -> Result<()> {
        if self.default.model.is_empty() {
            bail!("model name must not be empty");
        }
        if self.default.provider.is_empty() {
            bail!("provider name must not be empty");
        }
        if !(1..=200_000).contains(&self.default.max_tokens) {
            bail!(
                "max_tokens must be between 1 and 200000, got {}",
                self.default.max_tokens
            );
        }
        if let Some(temp) = self.default.temperature {
            if !(0.0..=1.0).contains(&temp) {
                bail!("temperature must be between 0.0 and 1.0, got {}", temp);
            }
        }
        Ok(())
    }

    /// Get a configuration value by key name.
    #[allow(dead_code)]
    pub fn get_value(&self, key: &str) -> Option<String> {
        match key {
            "model" | "default-model" => Some(self.default.model.clone()),
            "provider" | "default-provider" => Some(self.default.provider.clone()),
            "max-tokens" => Some(self.default.max_tokens.to_string()),
            "temperature" => self.default.temperature.map(|t| t.to_string()),
            "stream" => Some(self.default.stream.to_string()),
            "fallback-model" => self.default.fallback_chain.first().cloned(),
            "fallback-chain" => {
                if self.default.fallback_chain.is_empty() {
                    None
                } else {
                    Some(self.default.fallback_chain.join(","))
                }
            }
            "fast-model" => self.default.fast_model.clone(),
            _ => None,
        }
    }

    /// Set a configuration value by key name. Returns an error for unknown keys.
    #[allow(dead_code)]
    pub fn set_value(&mut self, key: &str, value: &str) -> Result<()> {
        match key {
            "model" | "default-model" => {
                self.default.model = value.to_string();
            }
            "provider" | "default-provider" => {
                self.default.provider = value.to_string();
            }
            "max-tokens" => {
                self.default.max_tokens = value
                    .parse::<u32>()
                    .context("max-tokens must be a positive integer")?;
            }
            "temperature" => {
                self.default.temperature = Some(
                    value
                        .parse::<f32>()
                        .context("temperature must be a float")?,
                );
            }
            "stream" => {
                self.default.stream = value
                    .parse::<bool>()
                    .context("stream must be true or false")?;
            }
            "fallback-model" => {
                if self.default.fallback_chain.is_empty() {
                    self.default.fallback_chain.push(value.to_string());
                } else {
                    self.default.fallback_chain[0] = value.to_string();
                }
            }
            "fallback-chain" => {
                self.default.fallback_chain = value
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
            }
            "fast-model" => {
                self.default.fast_model = if value.is_empty() {
                    None
                } else {
                    Some(value.to_string())
                };
            }
            _ => bail!(
                "Unknown config key: '{}'. Valid keys: model, provider, max-tokens, temperature, stream, fallback-model, fallback-chain, fast-model",
                key
            ),
        }
        Ok(())
    }

    /// Apply environment variable overrides on top of the loaded config.
    ///
    /// Reads:
    /// - `AGIWORKFORCE_MODEL` -> `default.model`
    /// - `AGIWORKFORCE_PROVIDER` -> `default.provider`
    /// - `AGIWORKFORCE_MAX_TOKENS` -> `default.max_tokens`
    pub fn merge_env_overrides(&mut self) {
        if let Ok(model) = std::env::var("AGIWORKFORCE_MODEL") {
            if !model.is_empty() {
                self.default.model = model;
                self.source
                    .env_overrides
                    .push("AGIWORKFORCE_MODEL".to_string());
            }
        }
        if let Ok(provider) = std::env::var("AGIWORKFORCE_PROVIDER") {
            if !provider.is_empty() {
                self.default.provider = provider;
                self.source
                    .env_overrides
                    .push("AGIWORKFORCE_PROVIDER".to_string());
            }
        }
        if let Ok(tokens_str) = std::env::var("AGIWORKFORCE_MAX_TOKENS") {
            if let Ok(tokens) = tokens_str.parse::<u32>() {
                self.default.max_tokens = tokens;
                self.source
                    .env_overrides
                    .push("AGIWORKFORCE_MAX_TOKENS".to_string());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Tests that mutate process environment variables must hold this mutex.
    /// Cargo runs tests in parallel by default, and AGIWORKFORCE_* env vars
    /// are process-global — without serialization, set/remove from one test
    /// can race the assertions in another. (Was producing intermittent
    /// failures in test_merge_env_no_vars_keeps_defaults.)
    static ENV_MUTEX: Mutex<()> = Mutex::new(());

    #[test]
    fn test_default_config_is_valid() {
        let config = CliConfig::default();
        assert_eq!(config.default.model, "claude-opus-4-7");
        assert_eq!(config.default.provider, "anthropic");
        assert!(config.default.stream);
        assert_eq!(config.default.max_tokens, 8192);
        assert!(config.providers.contains_key("anthropic"));
        assert!(config.providers.contains_key("openai"));
        assert!(config.providers.contains_key("google"));
        assert!(config.providers.contains_key("ollama"));
        assert!(config.providers.contains_key("mistral"));
        assert!(config.providers.contains_key("xai"));
        assert!(config.providers.contains_key("deepseek"));
        assert!(config.providers.contains_key("ollama-cloud"));
    }

    #[test]
    fn test_roundtrip_toml() {
        let config = CliConfig::default();
        let serialized = toml::to_string_pretty(&config).unwrap();
        let deserialized: CliConfig = toml::from_str(&serialized).unwrap();
        assert_eq!(deserialized.default.model, config.default.model);
    }

    // --- Validation tests ---

    #[test]
    fn test_default_config_passes_validation() {
        let config = CliConfig::default();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_validate_rejects_zero_max_tokens() {
        let mut config = CliConfig::default();
        config.default.max_tokens = 0;
        let err = config.validate().unwrap_err();
        assert!(
            err.to_string().contains("max_tokens"),
            "error should mention max_tokens: {}",
            err
        );
    }

    #[test]
    fn test_validate_rejects_excessive_max_tokens() {
        let mut config = CliConfig::default();
        config.default.max_tokens = 200_001;
        let err = config.validate().unwrap_err();
        assert!(err.to_string().contains("max_tokens"));
    }

    #[test]
    fn test_validate_accepts_boundary_max_tokens() {
        let mut config = CliConfig::default();

        config.default.max_tokens = 1;
        assert!(config.validate().is_ok());

        config.default.max_tokens = 200_000;
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_validate_rejects_negative_temperature() {
        let mut config = CliConfig::default();
        config.default.temperature = Some(-0.1);
        let err = config.validate().unwrap_err();
        assert!(err.to_string().contains("temperature"));
    }

    #[test]
    fn test_validate_rejects_temperature_above_one() {
        let mut config = CliConfig::default();
        config.default.temperature = Some(1.01);
        let err = config.validate().unwrap_err();
        assert!(err.to_string().contains("temperature"));
    }

    #[test]
    fn test_validate_accepts_boundary_temperatures() {
        let mut config = CliConfig::default();

        config.default.temperature = Some(0.0);
        assert!(config.validate().is_ok());

        config.default.temperature = Some(1.0);
        assert!(config.validate().is_ok());

        config.default.temperature = Some(0.7);
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_validate_accepts_none_temperature() {
        let config = CliConfig::default();
        // temperature is None by default
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_validate_rejects_empty_model() {
        let mut config = CliConfig::default();
        config.default.model = String::new();
        let err = config.validate().unwrap_err();
        assert!(err.to_string().contains("model"));
    }

    #[test]
    fn test_validate_rejects_empty_provider() {
        let mut config = CliConfig::default();
        config.default.provider = String::new();
        let err = config.validate().unwrap_err();
        assert!(err.to_string().contains("provider"));
    }

    // --- TOML roundtrip with all fields ---

    #[test]
    fn test_roundtrip_toml_all_fields() {
        let mut config = CliConfig::default();
        config.default.model = "gpt-5.5".to_string();
        config.default.provider = "openai".to_string();
        config.default.stream = false;
        config.default.max_tokens = 4096;
        config.default.temperature = Some(0.5);
        config.providers.insert(
            "custom".to_string(),
            ProviderConfig {
                api_key_env: Some("CUSTOM_KEY".to_string()),
                base_url: Some("http://localhost:9999".to_string()),
            },
        );

        let serialized = toml::to_string_pretty(&config).unwrap();
        let deserialized: CliConfig = toml::from_str(&serialized).unwrap();

        assert_eq!(deserialized.default.model, "gpt-5.5");
        assert_eq!(deserialized.default.provider, "openai");
        assert!(!deserialized.default.stream);
        assert_eq!(deserialized.default.max_tokens, 4096);
        assert_eq!(deserialized.default.temperature, Some(0.5));
        assert!(deserialized.providers.contains_key("custom"));
        let custom = deserialized.providers.get("custom").unwrap();
        assert_eq!(custom.api_key_env.as_deref(), Some("CUSTOM_KEY"));
        assert_eq!(custom.base_url.as_deref(), Some("http://localhost:9999"));
    }

    #[test]
    fn test_roundtrip_toml_none_temperature_omitted() {
        let config = CliConfig::default();
        let serialized = toml::to_string_pretty(&config).unwrap();
        // temperature = None should be skipped via skip_serializing_if
        assert!(
            !serialized.contains("temperature"),
            "None temperature should be omitted from TOML"
        );
        let deserialized: CliConfig = toml::from_str(&serialized).unwrap();
        assert_eq!(deserialized.default.temperature, None);
    }

    // --- config_dir / config_path ---

    #[test]
    fn test_config_dir_is_inside_home() {
        let dir = CliConfig::config_dir().unwrap();
        assert!(
            dir.ends_with(".agiworkforce"),
            "config_dir should end with .agiworkforce, got: {:?}",
            dir
        );
        // Must be an absolute path
        assert!(dir.is_absolute());
    }

    #[test]
    fn test_config_path_is_toml_inside_config_dir() {
        let path = CliConfig::config_path().unwrap();
        assert!(path.is_absolute());
        assert_eq!(path.file_name().unwrap().to_str().unwrap(), "config.toml");
        assert_eq!(path.parent().unwrap(), CliConfig::config_dir().unwrap());
    }

    // --- display() output ---

    #[test]
    fn test_display_contains_key_fields() {
        let config = CliConfig::default();
        let out = config.display();
        assert!(out.contains("Model:"));
        assert!(out.contains("claude-opus-4-7"));
        assert!(out.contains("Provider:"));
        assert!(out.contains("anthropic"));
        assert!(out.contains("Stream:"));
        assert!(out.contains("true"));
        assert!(out.contains("Max tokens:"));
        assert!(out.contains("8192"));
        assert!(out.contains("Sources:"));
        assert!(out.contains("Global:"));
        assert!(out.contains("Providers:"));
    }

    #[test]
    fn test_display_shows_all_providers() {
        let config = CliConfig::default();
        let out = config.display();
        for provider in &[
            "anthropic",
            "openai",
            "google",
            "ollama",
            "mistral",
            "xai",
            "deepseek",
        ] {
            assert!(
                out.contains(provider),
                "display() should list provider '{}'",
                provider
            );
        }
    }

    // --- merge_env_overrides ---

    #[test]
    fn test_merge_env_model_override() {
        let _guard = ENV_MUTEX.lock().unwrap();
        let mut config = CliConfig::default();
        std::env::set_var("AGIWORKFORCE_MODEL", "gpt-5.5");
        config.merge_env_overrides();
        assert_eq!(config.default.model, "gpt-5.5");
        std::env::remove_var("AGIWORKFORCE_MODEL");
    }

    #[test]
    fn test_merge_env_provider_override() {
        let _guard = ENV_MUTEX.lock().unwrap();
        let mut config = CliConfig::default();
        std::env::set_var("AGIWORKFORCE_PROVIDER", "openai");
        config.merge_env_overrides();
        assert_eq!(config.default.provider, "openai");
        std::env::remove_var("AGIWORKFORCE_PROVIDER");
    }

    #[test]
    fn test_merge_env_max_tokens_override() {
        let _guard = ENV_MUTEX.lock().unwrap();
        let mut config = CliConfig::default();
        std::env::set_var("AGIWORKFORCE_MAX_TOKENS", "16384");
        config.merge_env_overrides();
        assert_eq!(config.default.max_tokens, 16384);
        std::env::remove_var("AGIWORKFORCE_MAX_TOKENS");
    }

    #[test]
    fn test_merge_env_ignores_empty_values() {
        let _guard = ENV_MUTEX.lock().unwrap();
        let mut config = CliConfig::default();
        let original_model = config.default.model.clone();
        let original_provider = config.default.provider.clone();

        std::env::set_var("AGIWORKFORCE_MODEL", "");
        std::env::set_var("AGIWORKFORCE_PROVIDER", "");
        config.merge_env_overrides();
        assert_eq!(config.default.model, original_model);
        assert_eq!(config.default.provider, original_provider);

        std::env::remove_var("AGIWORKFORCE_MODEL");
        std::env::remove_var("AGIWORKFORCE_PROVIDER");
    }

    #[test]
    fn test_merge_env_ignores_invalid_max_tokens() {
        let _guard = ENV_MUTEX.lock().unwrap();
        let mut config = CliConfig::default();
        std::env::set_var("AGIWORKFORCE_MAX_TOKENS", "not_a_number");
        config.merge_env_overrides();
        // Should keep the default
        assert_eq!(config.default.max_tokens, 8192);
        std::env::remove_var("AGIWORKFORCE_MAX_TOKENS");
    }

    #[test]
    fn test_merge_env_no_vars_keeps_defaults() {
        let _guard = ENV_MUTEX.lock().unwrap();
        // Ensure vars are unset
        std::env::remove_var("AGIWORKFORCE_MODEL");
        std::env::remove_var("AGIWORKFORCE_PROVIDER");
        std::env::remove_var("AGIWORKFORCE_MAX_TOKENS");

        let mut config = CliConfig::default();
        config.merge_env_overrides();
        assert_eq!(config.default.model, "claude-opus-4-7");
        assert_eq!(config.default.provider, "anthropic");
        assert_eq!(config.default.max_tokens, 8192);
    }

    // --- Project config loading ---

    #[test]
    fn test_load_project_config_from_temp_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let config_dir = tmp.path().join(".agiworkforce");
        std::fs::create_dir_all(&config_dir).unwrap();
        let config_file = config_dir.join("config.toml");
        std::fs::write(
            &config_file,
            r#"
[default]
model = "gpt-5.5"
provider = "openai"
max_tokens = 2048
"#,
        )
        .unwrap();

        let project = CliConfig::load_project_config_from(tmp.path()).unwrap();
        assert_eq!(project.default.model, "gpt-5.5");
        assert_eq!(project.default.provider, "openai");
        assert_eq!(project.default.max_tokens, 2048);
        assert!(project.source.project_path.is_some());
        assert_eq!(project.source.project_path.unwrap(), config_file);
    }

    #[test]
    fn test_load_project_config_returns_none_when_missing() {
        let tmp = tempfile::tempdir().unwrap();
        // No .agiworkforce/config.toml exists
        let result = CliConfig::load_project_config_from(tmp.path());
        assert!(result.is_none());
    }

    #[test]
    fn test_load_project_config_returns_none_on_invalid_toml() {
        let tmp = tempfile::tempdir().unwrap();
        let config_dir = tmp.path().join(".agiworkforce");
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(config_dir.join("config.toml"), "not valid { toml }}}").unwrap();

        let result = CliConfig::load_project_config_from(tmp.path());
        assert!(result.is_none());
    }

    // --- merge_from semantics ---

    #[test]
    fn test_merge_from_overrides_non_default_model() {
        let mut base = CliConfig::default();
        let mut other = CliConfig::default();
        other.default.model = "gpt-5.5".to_string();

        base.merge_from(&other);
        assert_eq!(base.default.model, "gpt-5.5");
    }

    #[test]
    fn test_merge_from_keeps_base_when_other_is_default() {
        let mut base = CliConfig::default();
        base.default.model = "custom-model".to_string();
        let other = CliConfig::default(); // all defaults

        base.merge_from(&other);
        // Other has the default model, so base should keep its custom value
        assert_eq!(base.default.model, "custom-model");
    }

    #[test]
    fn test_merge_from_overrides_provider() {
        let mut base = CliConfig::default();
        let mut other = CliConfig::default();
        other.default.provider = "openai".to_string();

        base.merge_from(&other);
        assert_eq!(base.default.provider, "openai");
    }

    #[test]
    fn test_merge_from_overrides_max_tokens() {
        let mut base = CliConfig::default();
        let mut other = CliConfig::default();
        other.default.max_tokens = 4096;

        base.merge_from(&other);
        assert_eq!(base.default.max_tokens, 4096);
    }

    #[test]
    fn test_merge_from_overrides_stream() {
        let mut base = CliConfig::default();
        assert!(base.default.stream); // default is true
        let mut other = CliConfig::default();
        other.default.stream = false;

        base.merge_from(&other);
        assert!(!base.default.stream);
    }

    #[test]
    fn test_merge_from_overrides_temperature() {
        let mut base = CliConfig::default();
        assert!(base.default.temperature.is_none());
        let mut other = CliConfig::default();
        other.default.temperature = Some(0.3);

        base.merge_from(&other);
        assert_eq!(base.default.temperature, Some(0.3));
    }

    #[test]
    fn test_merge_from_does_not_clear_temperature_with_none() {
        let mut base = CliConfig::default();
        base.default.temperature = Some(0.8);
        let other = CliConfig::default(); // temperature = None

        base.merge_from(&other);
        // None in other should NOT clear base's temperature
        assert_eq!(base.default.temperature, Some(0.8));
    }

    #[test]
    fn test_merge_from_merges_providers() {
        let mut base = CliConfig::default();
        let mut other = CliConfig::default();
        other.providers.clear();
        other.providers.insert(
            "custom".to_string(),
            ProviderConfig {
                api_key_env: Some("CUSTOM_KEY".to_string()),
                base_url: Some("http://custom:8080".to_string()),
            },
        );

        base.merge_from(&other);
        // Base should still have all its original providers plus the new one
        assert!(base.providers.contains_key("anthropic"));
        assert!(base.providers.contains_key("custom"));
        let custom = base.providers.get("custom").unwrap();
        assert_eq!(custom.api_key_env.as_deref(), Some("CUSTOM_KEY"));
    }

    #[test]
    fn test_merge_from_provider_override_replaces_existing() {
        let mut base = CliConfig::default();
        let mut other = CliConfig::default();
        other.providers.clear();
        other.providers.insert(
            "ollama".to_string(),
            ProviderConfig {
                api_key_env: None,
                base_url: Some("http://remote-ollama:11434".to_string()),
            },
        );

        base.merge_from(&other);
        let ollama = base.providers.get("ollama").unwrap();
        assert_eq!(
            ollama.base_url.as_deref(),
            Some("http://remote-ollama:11434")
        );
    }

    // --- Source tracking ---

    #[test]
    fn test_default_config_has_empty_source() {
        let config = CliConfig::default();
        assert!(config.source.global_path.is_none());
        assert!(config.source.project_path.is_none());
        assert!(config.source.env_overrides.is_empty());
    }

    #[test]
    fn test_env_overrides_tracked_in_source() {
        let _guard = ENV_MUTEX.lock().unwrap();
        let mut config = CliConfig::default();
        std::env::set_var("AGIWORKFORCE_MODEL", "gpt-5.5");
        std::env::set_var("AGIWORKFORCE_PROVIDER", "openai");
        config.merge_env_overrides();

        assert!(config
            .source
            .env_overrides
            .contains(&"AGIWORKFORCE_MODEL".to_string()));
        assert!(config
            .source
            .env_overrides
            .contains(&"AGIWORKFORCE_PROVIDER".to_string()));
        assert_eq!(config.source.env_overrides.len(), 2);

        std::env::remove_var("AGIWORKFORCE_MODEL");
        std::env::remove_var("AGIWORKFORCE_PROVIDER");
    }

    #[test]
    fn test_empty_env_not_tracked() {
        let _guard = ENV_MUTEX.lock().unwrap();
        let mut config = CliConfig::default();
        std::env::set_var("AGIWORKFORCE_MODEL", "");
        config.merge_env_overrides();

        assert!(config.source.env_overrides.is_empty());
        std::env::remove_var("AGIWORKFORCE_MODEL");
    }

    #[test]
    fn test_invalid_max_tokens_not_tracked() {
        let _guard = ENV_MUTEX.lock().unwrap();
        let mut config = CliConfig::default();
        std::env::set_var("AGIWORKFORCE_MAX_TOKENS", "bad");
        config.merge_env_overrides();

        assert!(config.source.env_overrides.is_empty());
        std::env::remove_var("AGIWORKFORCE_MAX_TOKENS");
    }

    #[test]
    fn test_merge_from_preserves_project_path() {
        let mut base = CliConfig::default();
        base.source.global_path = Some(PathBuf::from("/home/user/.agiworkforce/config.toml"));

        let mut other = CliConfig::default();
        other.default.model = "gpt-5.5".to_string();
        other.source.project_path = Some(PathBuf::from("/project/.agiworkforce/config.toml"));

        base.merge_from(&other);
        assert_eq!(
            base.source.global_path.as_deref(),
            Some(std::path::Path::new("/home/user/.agiworkforce/config.toml"))
        );
        assert_eq!(
            base.source.project_path.as_deref(),
            Some(std::path::Path::new("/project/.agiworkforce/config.toml"))
        );
    }

    // --- Display with sources ---

    #[test]
    fn test_display_shows_sources_section() {
        let config = CliConfig::default();
        let out = config.display();
        assert!(out.contains("Sources:"));
        assert!(out.contains("Global:"));
        assert!(out.contains("Project: none"));
        assert!(out.contains("Env:     none"));
    }

    #[test]
    fn test_display_shows_project_path() {
        let mut config = CliConfig::default();
        config.source.project_path = Some(PathBuf::from("/my/project/.agiworkforce/config.toml"));

        let out = config.display();
        assert!(
            out.contains("/my/project/.agiworkforce/config.toml"),
            "display should show the project config path"
        );
    }

    #[test]
    fn test_display_shows_global_path_when_loaded() {
        let mut config = CliConfig::default();
        config.source.global_path = Some(PathBuf::from("/home/user/.agiworkforce/config.toml"));

        let out = config.display();
        assert!(
            out.contains("/home/user/.agiworkforce/config.toml"),
            "display should show the global config path"
        );
    }

    #[test]
    fn test_display_shows_env_overrides() {
        let mut config = CliConfig::default();
        config.source.env_overrides = vec![
            "AGIWORKFORCE_MODEL".to_string(),
            "AGIWORKFORCE_PROVIDER".to_string(),
        ];

        let out = config.display();
        assert!(out.contains("AGIWORKFORCE_MODEL"));
        assert!(out.contains("AGIWORKFORCE_PROVIDER"));
    }

    #[test]
    fn test_display_shows_temperature_when_set() {
        let mut config = CliConfig::default();
        config.default.temperature = Some(0.7);
        let out = config.display();
        assert!(out.contains("Temperature: 0.7"));
    }

    #[test]
    fn test_display_omits_temperature_when_none() {
        let config = CliConfig::default();
        let out = config.display();
        assert!(!out.contains("Temperature:"));
    }

    // --- File-based load test ---

    #[test]
    fn test_load_from_file_sets_global_path() {
        let tmp = tempfile::tempdir().unwrap();
        let config_dir = tmp.path().join(".agiworkforce");
        std::fs::create_dir_all(&config_dir).unwrap();
        let config_file = config_dir.join("config.toml");
        let config = CliConfig::default();
        let serialized = toml::to_string_pretty(&config).unwrap();
        std::fs::write(&config_file, serialized).unwrap();

        // Read it back using the raw file (can't override config_path, so test via project loader)
        let contents = std::fs::read_to_string(&config_file).unwrap();
        let mut loaded: CliConfig = toml::from_str(&contents).unwrap();
        loaded.source.global_path = Some(config_file.clone());

        assert_eq!(loaded.source.global_path.unwrap(), config_file);
    }

    // --- Serialization does not include source ---

    #[test]
    fn test_source_excluded_from_serialization() {
        let mut config = CliConfig::default();
        config.source.global_path = Some(PathBuf::from("/some/path"));
        config.source.project_path = Some(PathBuf::from("/project/path"));
        config.source.env_overrides = vec!["FOO".to_string()];

        let serialized = toml::to_string_pretty(&config).unwrap();
        assert!(
            !serialized.contains("source"),
            "source should be excluded from TOML output"
        );
        assert!(!serialized.contains("global_path"));
        assert!(!serialized.contains("project_path"));
        assert!(!serialized.contains("env_overrides"));
    }

    // --- get_value / set_value ---

    #[test]
    fn test_set_value_model() {
        let mut config = CliConfig::default();
        config.set_value("model", "gpt-5.5").unwrap();
        assert_eq!(config.default.model, "gpt-5.5");
    }

    #[test]
    fn test_set_value_unknown_key() {
        let mut config = CliConfig::default();
        assert!(config.set_value("nonexistent", "value").is_err());
    }

    #[test]
    fn test_get_value_model() {
        let config = CliConfig::default();
        assert_eq!(
            config.get_value("model"),
            Some("claude-opus-4-7".to_string())
        );
    }

    #[test]
    fn test_get_value_unknown_key() {
        let config = CliConfig::default();
        assert_eq!(config.get_value("nonexistent"), None);
    }

    #[test]
    fn test_set_get_fallback_chain() {
        let mut config = CliConfig::default();
        config
            .set_value("fallback-chain", "gpt-5.5, gemini-2.0-flash")
            .unwrap();
        assert_eq!(
            config.default.fallback_chain,
            vec!["gpt-5.5", "gemini-2.0-flash"]
        );
        assert_eq!(
            config.get_value("fallback-chain"),
            Some("gpt-5.5,gemini-2.0-flash".to_string())
        );
    }

    #[test]
    fn test_set_get_fast_model() {
        let mut config = CliConfig::default();
        config
            .set_value("fast-model", "claude-haiku-4-5-20251001")
            .unwrap();
        assert_eq!(
            config.get_value("fast-model"),
            Some("claude-haiku-4-5-20251001".to_string())
        );
    }

    #[test]
    fn test_fallback_chain_serialization() {
        let mut config = CliConfig::default();
        config.default.fallback_chain = vec!["gpt-5.5".to_string(), "gemini-2.0-flash".to_string()];
        let serialized = toml::to_string_pretty(&config).unwrap();
        assert!(serialized.contains("fallback_chain"));
        let deserialized: CliConfig = toml::from_str(&serialized).unwrap();
        assert_eq!(
            deserialized.default.fallback_chain,
            vec!["gpt-5.5", "gemini-2.0-flash"]
        );
    }

    #[test]
    fn test_empty_fallback_chain_omitted() {
        let config = CliConfig::default();
        let serialized = toml::to_string_pretty(&config).unwrap();
        assert!(!serialized.contains("fallback_chain"));
    }

    // -----------------------------------------------------------------------
    // MED-1: Project-local config sensitive override detection
    // -----------------------------------------------------------------------

    fn make_project_with_base_url(provider: &str, url: &str) -> CliConfig {
        let mut config = CliConfig::default();
        config.providers.insert(
            provider.to_string(),
            ProviderConfig {
                api_key_env: None,
                base_url: Some(url.to_string()),
            },
        );
        config
    }

    #[test]
    fn project_config_with_base_url_is_sensitive() {
        let project = make_project_with_base_url("anthropic", "https://attacker.com/v1");
        assert!(
            CliConfig::has_sensitive_project_overrides(&project),
            "base_url override should be detected as sensitive"
        );
    }

    #[test]
    fn project_config_model_only_not_sensitive() {
        let mut project = CliConfig::default();
        project.default.model = "claude-sonnet-4-6".to_string();
        // Remove any base_url entries so this is truly just a model override.
        for v in project.providers.values_mut() {
            v.base_url = None;
        }
        assert!(
            !CliConfig::has_sensitive_project_overrides(&project),
            "model-only override must not trigger sensitive flag"
        );
    }

    #[test]
    fn project_config_any_provider_base_url_is_sensitive() {
        let project = make_project_with_base_url("openai", "https://evil.com/v1");
        assert!(CliConfig::has_sensitive_project_overrides(&project));
    }

    #[test]
    fn project_config_api_key_env_only_not_sensitive() {
        let mut project = CliConfig::default();
        for v in project.providers.values_mut() {
            v.base_url = None;
        }
        project.providers.insert(
            "anthropic".to_string(),
            ProviderConfig {
                api_key_env: Some("MY_KEY".to_string()),
                base_url: None,
            },
        );
        assert!(
            !CliConfig::has_sensitive_project_overrides(&project),
            "api_key_env-only is not sensitive"
        );
    }

    #[test]
    fn project_config_no_providers_not_sensitive() {
        let mut project = CliConfig::default();
        // Strip all providers — a project config with no providers is safe.
        project.providers.clear();
        assert!(!CliConfig::has_sensitive_project_overrides(&project));
    }
}
