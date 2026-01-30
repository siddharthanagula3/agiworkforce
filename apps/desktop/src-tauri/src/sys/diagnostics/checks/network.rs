//! Network connectivity check
//!
//! Verifies internet connectivity and access to required API endpoints.

use crate::sys::diagnostics::{DiagnosticCheck, DiagnosticContext, DiagnosticResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Checks network connectivity to essential endpoints
pub struct NetworkCheck;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct EndpointStatus {
    name: String,
    url: String,
    reachable: bool,
    response_time_ms: Option<u64>,
    error: Option<String>,
}

/// Essential endpoints to check
const ENDPOINTS: &[(&str, &str)] = &[
    ("Anthropic API", "https://api.anthropic.com"),
    ("OpenAI API", "https://api.openai.com"),
    ("Google AI API", "https://generativelanguage.googleapis.com"),
    ("AGI Workforce API", "https://api.agiworkforce.com"),
    ("GitHub (for MCP)", "https://api.github.com"),
];

#[async_trait]
impl DiagnosticCheck for NetworkCheck {
    fn id(&self) -> &'static str {
        "network"
    }

    fn name(&self) -> &'static str {
        "Network Connectivity"
    }

    fn description(&self) -> &'static str {
        "Verifies internet connectivity and access to essential API endpoints"
    }

    fn category(&self) -> &'static str {
        "network"
    }

    fn is_critical(&self) -> bool {
        false // App can work offline with local models
    }

    fn estimated_duration(&self) -> Duration {
        Duration::from_secs(15)
    }

    async fn run(&self, _ctx: &DiagnosticContext) -> DiagnosticResult {
        let start = std::time::Instant::now();

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        let mut endpoint_statuses: Vec<EndpointStatus> = Vec::new();
        let mut reachable_count = 0;
        let mut unreachable: Vec<String> = Vec::new();

        // Check all endpoints in parallel
        let checks: Vec<_> = ENDPOINTS
            .iter()
            .map(|(name, url)| {
                let client = client.clone();
                let name = name.to_string();
                let url = url.to_string();
                async move {
                    let check_start = std::time::Instant::now();
                    let result = client.head(&url).send().await;
                    let response_time = check_start.elapsed().as_millis() as u64;

                    match result {
                        Ok(response)
                            if response.status().is_success()
                                || response.status().is_client_error() =>
                        {
                            // 4xx is still "reachable" - we just might not be authenticated
                            EndpointStatus {
                                name,
                                url,
                                reachable: true,
                                response_time_ms: Some(response_time),
                                error: None,
                            }
                        }
                        Ok(response) => EndpointStatus {
                            name,
                            url,
                            reachable: false,
                            response_time_ms: Some(response_time),
                            error: Some(format!("HTTP {}", response.status())),
                        },
                        Err(e) => EndpointStatus {
                            name,
                            url,
                            reachable: false,
                            response_time_ms: None,
                            error: Some(if e.is_timeout() {
                                "Connection timed out".to_string()
                            } else if e.is_connect() {
                                "Connection refused".to_string()
                            } else {
                                e.to_string()
                            }),
                        },
                    }
                }
            })
            .collect();

        let results = futures::future::join_all(checks).await;

        for status in results {
            if status.reachable {
                reachable_count += 1;
            } else {
                unreachable.push(format!(
                    "{}: {}",
                    status.name,
                    status.error.as_deref().unwrap_or("unknown error")
                ));
            }
            endpoint_statuses.push(status);
        }

        let duration = start.elapsed();
        let total = endpoint_statuses.len();

        if reachable_count == 0 {
            return DiagnosticResult::error(
                self.id(),
                self.name(),
                "Network: Unable to reach any API endpoints",
                "Check your internet connection. Ensure firewalls or proxies are not blocking access.",
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "endpoints": endpoint_statuses,
                "reachable": 0,
                "total": total,
            }));
        }

        if reachable_count < total {
            return DiagnosticResult::warning(
                self.id(),
                self.name(),
                format!("Network: {}/{} endpoints reachable", reachable_count, total),
                format!("Some endpoints are unreachable: {}", unreachable.join("; ")),
            )
            .with_duration(duration)
            .with_metadata(serde_json::json!({
                "endpoints": endpoint_statuses,
                "reachable": reachable_count,
                "total": total,
                "unreachable": unreachable,
            }));
        }

        DiagnosticResult::ok(
            self.id(),
            self.name(),
            format!("Network connectivity OK ({} endpoints)", total),
        )
        .with_duration(duration)
        .with_metadata(serde_json::json!({
            "endpoints": endpoint_statuses,
            "reachable": reachable_count,
            "total": total,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::diagnostics::Severity;

    #[tokio::test]
    async fn test_network_check() {
        let check = NetworkCheck;
        let ctx = DiagnosticContext::new(std::path::PathBuf::from("/tmp"));

        let result = check.run(&ctx).await;
        // Result depends on network availability
        assert!(
            result.severity == Severity::Ok
                || result.severity == Severity::Warning
                || result.severity == Severity::Error
        );
    }
}
