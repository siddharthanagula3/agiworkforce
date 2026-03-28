//! Signal messaging integration via signal-cli

use std::path::Path;

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::sys::error::{Error, Result};

/// Allowlist of binary names permitted for signal-cli execution.
const ALLOWED_CLI_BINARIES: &[&str] = &["signal-cli"];

/// Validate that a CLI path is a simple binary name on the allowlist,
/// then resolve it to a full path via PATH lookup.
/// Rejects any path containing directory separators to prevent command injection.
fn validate_cli_path(path: &str) -> Result<String> {
    // Reject paths containing directory separators — only bare binary names allowed
    if path.contains('/') || path.contains('\\') {
        return Err(Error::PermissionError(format!(
            "CLI path must be a simple binary name without path separators, got: {}",
            path
        )));
    }

    // Reject empty or whitespace-only input
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err(Error::Config("CLI path must not be empty".to_string()));
    }

    // Validate against allowlist
    if !ALLOWED_CLI_BINARIES.contains(&trimmed) {
        return Err(Error::PermissionError(format!(
            "Binary '{}' is not in the allowed list: {:?}",
            trimmed, ALLOWED_CLI_BINARIES
        )));
    }

    // Resolve the binary to its full path via PATH lookup
    let resolved = which::which(trimmed)
        .map_err(|e| Error::Config(format!("Could not find '{}' in PATH: {}", trimmed, e)))?;

    Ok(resolved.to_string_lossy().into_owned())
}

/// Validate that a config path is safe — it must resolve to a location within
/// the user's home directory to prevent path traversal attacks.
fn validate_config_path(config_path: &str) -> Result<String> {
    let path = Path::new(config_path);

    // Canonicalize to resolve symlinks, .., and other traversal components
    let canonical = path.canonicalize().map_err(|e| {
        Error::InvalidPath(format!(
            "Cannot resolve config path '{}': {}",
            config_path, e
        ))
    })?;

    // The config path must reside within the user's home directory
    let home_dir = dirs::home_dir().ok_or_else(|| {
        Error::Config("Unable to determine home directory for path validation".to_string())
    })?;

    if !canonical.starts_with(&home_dir) {
        return Err(Error::PermissionError(format!(
            "Config path '{}' resolves to '{}' which is outside the home directory",
            config_path,
            canonical.display()
        )));
    }

    Ok(canonical.to_string_lossy().into_owned())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalConfig {
    pub phone_number: Option<String>,
    pub signal_cli_path: Option<String>,
    pub config_path: Option<String>,
}

impl Default for SignalConfig {
    fn default() -> Self {
        Self {
            phone_number: None,
            signal_cli_path: Some("signal-cli".to_string()),
            config_path: None,
        }
    }
}

impl SignalConfig {
    /// Validate all user-supplied paths in this config.
    /// Must be called before constructing a `SignalClient`.
    pub fn validate(&self) -> Result<()> {
        // Validate signal_cli_path if provided
        if let Some(ref cli_path) = self.signal_cli_path {
            validate_cli_path(cli_path)?;
        }

        // Validate config_path if provided
        if let Some(ref config_path) = self.config_path {
            validate_config_path(config_path)?;
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalMessage {
    pub id: String,
    pub sender: String,
    pub recipient: String,
    pub content: String,
    pub timestamp: i64,
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignalContact {
    pub number: String,
    pub name: Option<String>,
    pub profile_name: Option<String>,
}

pub struct SignalClient {
    config: SignalConfig,
    registered: bool,
}

impl SignalClient {
    pub fn new(config: SignalConfig) -> Self {
        Self {
            config,
            registered: false,
        }
    }

    /// Resolve and validate the CLI binary path.
    /// Returns the full resolved path from PATH lookup, never a user-supplied raw path.
    fn get_cli_path(&self) -> Result<String> {
        let raw = self
            .config
            .signal_cli_path
            .as_deref()
            .unwrap_or("signal-cli");
        validate_cli_path(raw)
    }

    /// Validate and resolve the config path, if set.
    fn get_config_path(&self) -> Result<Option<String>> {
        match self.config.config_path.as_deref() {
            Some(p) => validate_config_path(p).map(Some),
            None => Ok(None),
        }
    }

    /// Check if signal-cli is available
    pub async fn check_availability(&self) -> Result<bool> {
        let cli_path = self.get_cli_path()?;
        let output = Command::new(&cli_path).arg("--version").output().await;

        Ok(output.is_ok())
    }

    /// Register/link with Signal
    pub async fn register(&mut self) -> Result<()> {
        let _phone = self
            .config
            .phone_number
            .as_ref()
            .ok_or_else(|| Error::Config("Phone number required".into()))?;

        // This would normally require interactive verification
        // For now, assume already linked via signal-cli link
        self.registered = true;
        Ok(())
    }

    /// Send a message
    pub async fn send_message(&self, recipient: &str, content: &str) -> Result<()> {
        let phone = self
            .config
            .phone_number
            .as_ref()
            .ok_or_else(|| Error::Config("Phone number required".into()))?;

        let cli_path = self.get_cli_path()?;
        let config_path = self.get_config_path()?;

        let mut cmd = Command::new(&cli_path);
        cmd.arg("-a").arg(phone);

        if let Some(ref validated_config_path) = config_path {
            cmd.arg("--config").arg(validated_config_path);
        }

        cmd.arg("send").arg("-m").arg(content).arg(recipient);

        let output = cmd
            .output()
            .await
            .map_err(|e| Error::Generic(format!("signal-cli error: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(Error::Generic(format!("Signal send failed: {}", stderr)));
        }

        Ok(())
    }

    /// Send to a group
    pub async fn send_group_message(&self, group_id: &str, content: &str) -> Result<()> {
        let phone = self
            .config
            .phone_number
            .as_ref()
            .ok_or_else(|| Error::Config("Phone number required".into()))?;

        let cli_path = self.get_cli_path()?;
        let config_path = self.get_config_path()?;

        let mut cmd = Command::new(&cli_path);
        cmd.arg("-a").arg(phone);

        if let Some(ref validated_config_path) = config_path {
            cmd.arg("--config").arg(validated_config_path);
        }

        cmd.arg("send")
            .arg("-m")
            .arg(content)
            .arg("-g")
            .arg(group_id);

        let output = cmd
            .output()
            .await
            .map_err(|e| Error::Generic(format!("signal-cli error: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(Error::Generic(format!(
                "Signal group send failed: {}",
                stderr
            )));
        }

        Ok(())
    }

    /// Receive messages (blocking call)
    pub async fn receive_messages(&self) -> Result<Vec<SignalMessage>> {
        let phone = self
            .config
            .phone_number
            .as_ref()
            .ok_or_else(|| Error::Config("Phone number required".into()))?;

        let cli_path = self.get_cli_path()?;
        let config_path = self.get_config_path()?;

        let mut cmd = Command::new(&cli_path);
        cmd.arg("-a").arg(phone);

        if let Some(ref validated_config_path) = config_path {
            cmd.arg("--config").arg(validated_config_path);
        }

        cmd.arg("receive").arg("--json").arg("-t").arg("1"); // 1 second timeout

        let output = cmd
            .output()
            .await
            .map_err(|e| Error::Generic(format!("signal-cli error: {}", e)))?;

        if output.stdout.is_empty() {
            return Ok(vec![]);
        }

        // Parse JSON output - signal-cli outputs one JSON object per line
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut messages = Vec::new();

        for line in stdout.lines() {
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(envelope) = msg.get("envelope") {
                    if let Some(data_message) = envelope.get("dataMessage") {
                        messages.push(SignalMessage {
                            id: chrono::Utc::now().timestamp_millis().to_string(),
                            sender: envelope["source"].as_str().unwrap_or("").to_string(),
                            recipient: phone.clone(),
                            content: data_message["message"].as_str().unwrap_or("").to_string(),
                            timestamp: envelope["timestamp"].as_i64().unwrap_or(0),
                            group_id: data_message
                                .get("groupInfo")
                                .and_then(|g| g["groupId"].as_str())
                                .map(String::from),
                        });
                    }
                }
            }
        }

        Ok(messages)
    }

    /// List contacts
    pub async fn list_contacts(&self) -> Result<Vec<SignalContact>> {
        let phone = self
            .config
            .phone_number
            .as_ref()
            .ok_or_else(|| Error::Config("Phone number required".into()))?;

        let cli_path = self.get_cli_path()?;
        let config_path = self.get_config_path()?;

        let mut cmd = Command::new(&cli_path);
        cmd.arg("-a").arg(phone);

        if let Some(ref validated_config_path) = config_path {
            cmd.arg("--config").arg(validated_config_path);
        }

        cmd.arg("listContacts");

        let output = cmd
            .output()
            .await
            .map_err(|e| Error::Generic(format!("signal-cli error: {}", e)))?;

        // Parse contacts from output
        let stdout = String::from_utf8_lossy(&output.stdout);
        let contacts: Vec<SignalContact> = stdout
            .lines()
            .filter(|l| !l.is_empty())
            .map(|line| {
                // Format: "Number: +1234567890 Name: John Doe"
                let parts: Vec<&str> = line.split_whitespace().collect();
                SignalContact {
                    number: parts.get(1).unwrap_or(&"").to_string(),
                    name: if parts.len() > 3 {
                        Some(parts[3..].join(" "))
                    } else {
                        None
                    },
                    profile_name: None,
                }
            })
            .collect();

        Ok(contacts)
    }

    pub fn is_registered(&self) -> bool {
        self.registered
    }
}
