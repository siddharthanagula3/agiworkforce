//! Signal messaging integration via signal-cli

use serde::{Deserialize, Serialize};
use std::process::Command;

use crate::sys::error::{Error, Result};

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

    fn get_cli_path(&self) -> &str {
        self.config
            .signal_cli_path
            .as_deref()
            .unwrap_or("signal-cli")
    }

    /// Check if signal-cli is available
    pub fn check_availability(&self) -> Result<bool> {
        let output = Command::new(self.get_cli_path()).arg("--version").output();

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

        let mut cmd = Command::new(self.get_cli_path());
        cmd.arg("-a").arg(phone);

        if let Some(ref config_path) = self.config.config_path {
            cmd.arg("--config").arg(config_path);
        }

        cmd.arg("send").arg("-m").arg(content).arg(recipient);

        let output = cmd
            .output()
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

        let mut cmd = Command::new(self.get_cli_path());
        cmd.arg("-a").arg(phone);

        if let Some(ref config_path) = self.config.config_path {
            cmd.arg("--config").arg(config_path);
        }

        cmd.arg("send")
            .arg("-m")
            .arg(content)
            .arg("-g")
            .arg(group_id);

        let output = cmd
            .output()
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

        let mut cmd = Command::new(self.get_cli_path());
        cmd.arg("-a").arg(phone);

        if let Some(ref config_path) = self.config.config_path {
            cmd.arg("--config").arg(config_path);
        }

        cmd.arg("receive").arg("--json").arg("-t").arg("1"); // 1 second timeout

        let output = cmd
            .output()
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

        let mut cmd = Command::new(self.get_cli_path());
        cmd.arg("-a").arg(phone);

        if let Some(ref config_path) = self.config.config_path {
            cmd.arg("--config").arg(config_path);
        }

        cmd.arg("listContacts");

        let output = cmd
            .output()
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
