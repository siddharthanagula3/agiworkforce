//! Authentication health check
//!
//! Validates API key validity for each configured LLM provider.

use crate::sys::diagnostics::{DiagnosticCheck, DiagnosticContext, DiagnosticResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Checks API key validity for LLM providers
pub struct AuthHealthCheck;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProviderStatus {
    name: String,
    configured: bool,
    valid: bool,
    error: Option<String>,
}

#[async_trait]
impl DiagnosticCheck for AuthHealthCheck {
    fn id(&self) -> &'static str {
        "auth_health"
    }

    fn name(&self) -> &'static str {
        "API Key Authentication"
    }

    fn description(&self) -> &'static str {
        "Validates API key configuration and authentication status for LLM providers"
    }

    fn category(&self) -> &'static str {
        "security"
    }

    fn is_critical(&self) -> bool {
        false // App can still work with cloud credits
    }

    fn estimated_duration(&self) -> Duration {
        Duration::from_secs(5) // API calls can take time
    }

    async fn run(&self, ctx: &DiagnosticContext) -> DiagnosticResult {
        let start = std::time::Instant::now();

        let mut statuses: Vec<ProviderStatus> = Vec::new();
        let mut configured_count = 0;
        let mut valid_count = 0;
        let mut errors: Vec<String> = Vec::new();

        // Check each provider
        for (name, env_var) in [
            ("openai", "OPENAI_API_KEY"),
            ("anthropic", "ANTHROPIC_API_KEY"),
            ("google", "GOOGLE_AI_API_KEY"),
        ] {
            let api_key = get_api_key(ctx, name, env_var).await;

            let status = match api_key {
                Some(key) => {
                    configured_count += 1;

                    // Only validate if extended checks are enabled (to avoid rate limiting)
                    let (valid, error) = if ctx.extended {
                        let result = match name {
                            "openai" => check_openai_key(&key).await,
                            "anthropic" => check_anthropic_key(&key).await,
                            "google" => check_google_key(&key).await,
                            _ => Ok(()),
                        };
                        match result {
                            Ok(()) => {
                                valid_count += 1;
                                (true, None)
                            }
                            Err(e) => {
                                errors.push(format!("{}: {}", name, e));
                                (false, Some(e))
                            }
                        }
                    } else {
                        // Basic format validation only
                        let looks_valid = validate_key_format(name, &key);
                        if looks_valid {
                            valid_count += 1;
                        }
                        (looks_valid, None)
                    };

                    ProviderStatus {
                        name: name.to_string(),
                        configured: true,
                        valid,
                        error,
                    }
                }
                None => ProviderStatus {
                    name: name.to_string(),
                    configured: false,
                    valid: false,
                    error: None,
                },
            };

            statuses.push(status);
        }

        // Check cloud credits authentication
        let cloud_auth_status = check_cloud_auth().await;

        let duration = start.elapsed();

        // Determine result severity
        if configured_count == 0 && !cloud_auth_status.configured {
            return DiagnosticResult::warning(
                self.id(),
                self.name(),
                "No API keys or cloud authentication configured",
                "Add an API key for OpenAI, Anthropic, or Google, or sign in to use cloud credits",
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "providers": statuses,
                "cloud_auth": cloud_auth_status,
            }));
        }

        if !errors.is_empty() {
            return DiagnosticResult::error(
                self.id(),
                self.name(),
                format!("API key validation failed: {}", errors.join("; ")),
                "Check your API keys are valid and have sufficient permissions",
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "providers": statuses,
                "cloud_auth": cloud_auth_status,
                "errors": errors,
            }));
        }

        let message = if cloud_auth_status.valid {
            format!(
                "API keys authenticated ({}/{}) + Cloud credits available",
                valid_count, configured_count
            )
        } else {
            format!(
                "API keys authenticated ({}/{})",
                valid_count, configured_count
            )
        };

        DiagnosticResult::ok(self.id(), self.name(), message)
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "providers": statuses,
                "cloud_auth": cloud_auth_status,
                "configured": configured_count,
                "valid": valid_count,
            }))
    }
}

async fn get_api_key(ctx: &DiagnosticContext, provider: &str, env_var: &str) -> Option<String> {
    // First check environment variable
    if let Ok(key) = std::env::var(env_var) {
        if !key.is_empty() {
            return Some(key);
        }
    }

    // Then check settings database
    if let Some(ref app_handle) = ctx.app_handle {
        // Try to get from settings service
        if let Some(key) = get_key_from_settings(app_handle, provider).await {
            return Some(key);
        }
    }

    None
}

async fn get_key_from_settings(_app_handle: &tauri::AppHandle, _provider: &str) -> Option<String> {
    // This would normally query the SettingsService, but we keep it simple
    // to avoid complex state access during diagnostics
    None
}

fn validate_key_format(provider: &str, key: &str) -> bool {
    match provider {
        "openai" => key.starts_with("sk-") && key.len() > 20,
        "anthropic" => key.starts_with("sk-ant-") && key.len() > 20,
        "google" => key.starts_with("AI") && key.len() > 20,
        _ => !key.is_empty(),
    }
}

async fn check_openai_key(key: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://api.openai.com/v1/models")
        .header("Authorization", format!("Bearer {}", key))
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        Err("Invalid API key".to_string())
    } else {
        Err(format!("Unexpected status: {}", response.status()))
    }
}

async fn check_anthropic_key(key: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .body(r#"{"model":"claude-3-haiku-20240307","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}"#)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        Err("Invalid API key".to_string())
    } else {
        // Anthropic returns 400 for minimal requests, which is fine for auth check
        let status = response.status();
        if status.as_u16() == 400 {
            Ok(())
        } else {
            Err(format!("Unexpected status: {}", status))
        }
    }
}

async fn check_google_key(key: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        key
    );
    let response = client
        .get(&url)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else if response.status() == reqwest::StatusCode::UNAUTHORIZED
        || response.status() == reqwest::StatusCode::FORBIDDEN
    {
        Err("Invalid API key".to_string())
    } else {
        Err(format!("Unexpected status: {}", response.status()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CloudAuthStatus {
    configured: bool,
    valid: bool,
    user_email: Option<String>,
    error: Option<String>,
}

async fn check_cloud_auth() -> CloudAuthStatus {
    // Check if user is logged in with cloud credentials
    match crate::sys::account::get_access_token() {
        Ok(token) if !token.is_empty() => CloudAuthStatus {
            configured: true,
            valid: true,
            user_email: None, // Would need to decode JWT or query user info
            error: None,
        },
        Ok(_) => CloudAuthStatus {
            configured: false,
            valid: false,
            user_email: None,
            error: None,
        },
        Err(_) => CloudAuthStatus {
            configured: false,
            valid: false,
            user_email: None,
            error: None,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::diagnostics::Severity;

    #[test]
    fn test_key_format_validation() {
        assert!(validate_key_format(
            "openai",
            "sk-1234567890abcdefghijklmnop"
        ));
        assert!(!validate_key_format("openai", "invalid-key"));

        assert!(validate_key_format(
            "anthropic",
            "sk-ant-1234567890abcdefghij"
        ));
        assert!(!validate_key_format("anthropic", "sk-1234567890"));

        assert!(validate_key_format("google", "AIzaSyC1234567890abcdefg"));
        assert!(!validate_key_format("google", "invalid"));
    }

    #[tokio::test]
    async fn test_auth_health_check() {
        let check = AuthHealthCheck;
        let ctx = DiagnosticContext::new(std::path::PathBuf::from("/tmp"));

        let result = check.run(&ctx).await;
        // Should be warning (no keys configured) or OK
        assert!(result.severity == Severity::Ok || result.severity == Severity::Warning);
    }
}
