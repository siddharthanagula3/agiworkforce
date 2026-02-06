//! Authentication health check
//!
//! Validates authentication status for managed cloud access.

use crate::sys::diagnostics::{DiagnosticCheck, DiagnosticContext, DiagnosticResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Checks authentication validity for managed cloud access
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
        "Cloud Authentication"
    }

    fn description(&self) -> &'static str {
        "Validates managed cloud authentication status"
    }

    fn category(&self) -> &'static str {
        "security"
    }

    fn is_critical(&self) -> bool {
        false // App can still work with local models (Ollama)
    }

    fn estimated_duration(&self) -> Duration {
        Duration::from_secs(3)
    }

    async fn run(&self, _ctx: &DiagnosticContext) -> DiagnosticResult {
        let start = std::time::Instant::now();

        let cloud_auth_status = check_cloud_auth().await;
        let configured_count = if cloud_auth_status.configured { 1 } else { 0 };
        let valid_count = if cloud_auth_status.valid { 1 } else { 0 };

        let statuses = vec![ProviderStatus {
            name: "managed_cloud".to_string(),
            configured: cloud_auth_status.configured,
            valid: cloud_auth_status.valid,
            error: cloud_auth_status.error.clone(),
        }];

        let duration = start.elapsed();

        if configured_count == 0 {
            return DiagnosticResult::warning(
                self.id(),
                self.name(),
                "Cloud authentication not configured",
                "Sign in to use cloud credits for managed LLM access",
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "providers": statuses,
                "cloud_auth": cloud_auth_status,
            }));
        }

        if !cloud_auth_status.valid {
            return DiagnosticResult::error(
                self.id(),
                self.name(),
                "Cloud authentication failed".to_string(),
                "Sign in again to refresh your session",
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "providers": statuses,
                "cloud_auth": cloud_auth_status,
            }));
        }

        DiagnosticResult::ok(self.id(), self.name(), "Cloud authentication active".to_string())
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "providers": statuses,
                "cloud_auth": cloud_auth_status,
                "configured": configured_count,
                "valid": valid_count,
            }))
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
            user_email: None,
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

    #[tokio::test]
    async fn test_auth_health_check() {
        let check = AuthHealthCheck;
        let ctx = DiagnosticContext::new(std::path::PathBuf::from("/tmp"));

        let result = check.run(&ctx).await;
        assert!(result.severity == Severity::Ok || result.severity == Severity::Warning);
    }
}
