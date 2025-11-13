use crate::error::{Error, Result};
use crate::security::rate_limit::RateLimiter;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{debug, warn};

/// Tool execution policy defining allowed operations and limits
#[derive(Debug, Clone)]
pub struct ToolPolicy {
    pub max_rate_per_minute: usize,
    pub requires_approval: bool,
    pub allowed_parameters: Vec<String>,
    pub risk_level: RiskLevel,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

/// Security errors for tool execution
#[derive(Debug, thiserror::Error)]
pub enum SecurityError {
    #[error("Unauthorized tool: {0}")]
    UnauthorizedTool(String),

    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),

    #[error("Rate limit exceeded for tool: {0}")]
    RateLimitExceeded(String),

    #[error("Path traversal detected: {0}")]
    PathTraversal(String),

    #[error("Command injection detected: {0}")]
    CommandInjection(String),

    #[error("Approval required but not granted")]
    ApprovalRequired,

    #[error("Blocked domain: {0}")]
    BlockedDomain(String),

    #[error("Insecure protocol: {0}")]
    InsecureProtocol(String),
}

/// Tool execution guard providing security validation
pub struct ToolExecutionGuard {
    allowed_tools: HashMap<String, ToolPolicy>,
    rate_limiters: Arc<Mutex<HashMap<String, RateLimiter>>>,
    allowed_paths: Vec<PathBuf>,
    blocked_domains: Vec<String>,
}

impl ToolExecutionGuard {
    pub fn new() -> Self {
        let mut allowed_tools = HashMap::new();

        // Define policies for each tool
        allowed_tools.insert(
            "file_read".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec!["path".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "file_write".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: true,
                allowed_parameters: vec!["path".to_string(), "content".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "ui_screenshot".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: false,
                allowed_parameters: vec!["region".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        allowed_tools.insert(
            "ui_click".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec!["x".to_string(), "y".to_string(), "button".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "ui_type".to_string(),
            ToolPolicy {
                max_rate_per_minute: 60,
                requires_approval: false,
                allowed_parameters: vec!["text".to_string(), "delay_ms".to_string()],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "browser_navigate".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: true,
                allowed_parameters: vec!["url".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "code_execute".to_string(),
            ToolPolicy {
                max_rate_per_minute: 5,
                requires_approval: true,
                allowed_parameters: vec!["language".to_string(), "code".to_string()],
                risk_level: RiskLevel::Critical,
            },
        );

        allowed_tools.insert(
            "db_query".to_string(),
            ToolPolicy {
                max_rate_per_minute: 20,
                requires_approval: true,
                allowed_parameters: vec!["query".to_string(), "params".to_string()],
                risk_level: RiskLevel::High,
            },
        );

        allowed_tools.insert(
            "api_call".to_string(),
            ToolPolicy {
                max_rate_per_minute: 30,
                requires_approval: false,
                allowed_parameters: vec![
                    "url".to_string(),
                    "method".to_string(),
                    "headers".to_string(),
                    "body".to_string(),
                ],
                risk_level: RiskLevel::Medium,
            },
        );

        allowed_tools.insert(
            "image_ocr".to_string(),
            ToolPolicy {
                max_rate_per_minute: 10,
                requires_approval: false,
                allowed_parameters: vec!["image_path".to_string()],
                risk_level: RiskLevel::Low,
            },
        );

        Self {
            allowed_tools,
            rate_limiters: Arc::new(Mutex::new(HashMap::new())),
            allowed_paths: vec![
                PathBuf::from("/tmp"),
                PathBuf::from(std::env::temp_dir()),
            ],
            blocked_domains: vec![
                "localhost".to_string(),
                "127.0.0.1".to_string(),
                "0.0.0.0".to_string(),
                "169.254.169.254".to_string(), // AWS metadata endpoint
            ],
        }
    }

    /// Validate a tool call before execution
    pub async fn validate_tool_call(
        &self,
        tool_name: &str,
        parameters: &Value,
    ) -> std::result::Result<(), SecurityError> {
        debug!("Validating tool call: {} with params: {:?}", tool_name, parameters);

        // 1. Check if tool is allowed
        let policy = self
            .allowed_tools
            .get(tool_name)
            .ok_or_else(|| SecurityError::UnauthorizedTool(tool_name.to_string()))?;

        // 2. Check rate limits
        self.check_rate_limit(tool_name, policy).await?;

        // 3. Validate parameters based on tool type
        match tool_name {
            "file_read" | "file_write" => {
                if let Some(path) = parameters.get("path").and_then(|p| p.as_str()) {
                    self.validate_file_path(path)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'path' parameter".to_string(),
                    ));
                }
            }
            "browser_navigate" => {
                if let Some(url) = parameters.get("url").and_then(|u| u.as_str()) {
                    self.validate_url(url)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'url' parameter".to_string(),
                    ));
                }
            }
            "code_execute" => {
                if let Some(code) = parameters.get("code").and_then(|c| c.as_str()) {
                    self.validate_code(code)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'code' parameter".to_string(),
                    ));
                }
            }
            "db_query" => {
                if let Some(query) = parameters.get("query").and_then(|q| q.as_str()) {
                    self.validate_sql(query)?;
                } else {
                    return Err(SecurityError::InvalidParameter(
                        "Missing or invalid 'query' parameter".to_string(),
                    ));
                }
            }
            _ => {
                // Generic parameter validation
                if let Some(params_obj) = parameters.as_object() {
                    for key in params_obj.keys() {
                        if !policy.allowed_parameters.contains(key) {
                            warn!("Unexpected parameter '{}' for tool '{}'", key, tool_name);
                        }
                    }
                }
            }
        }

        debug!("Tool call validation passed for: {}", tool_name);
        Ok(())
    }

    /// Check rate limits for a tool
    async fn check_rate_limit(
        &self,
        tool_name: &str,
        policy: &ToolPolicy,
    ) -> std::result::Result<(), SecurityError> {
        let mut limiters = self.rate_limiters.lock().await;

        let limiter = limiters
            .entry(tool_name.to_string())
            .or_insert_with(|| RateLimiter::new(policy.max_rate_per_minute, 60));

        if !limiter.check() {
            warn!("Rate limit exceeded for tool: {}", tool_name);
            return Err(SecurityError::RateLimitExceeded(tool_name.to_string()));
        }

        Ok(())
    }

    /// Validate file path for security issues
    fn validate_file_path(&self, path: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating file path: {}", path);

        // 1. Prevent path traversal
        if path.contains("..") {
            warn!("Path traversal detected: {}", path);
            return Err(SecurityError::PathTraversal(path.to_string()));
        }

        // 2. Check against allowed directories
        let path_buf = PathBuf::from(path);

        // Allow relative paths in workspace
        if path_buf.is_relative() {
            return Ok(());
        }

        // For absolute paths, check if they're in allowed directories
        let is_allowed = self
            .allowed_paths
            .iter()
            .any(|allowed| path_buf.starts_with(allowed));

        if !is_allowed {
            // Check if it's a user directory (allow user's home and common directories)
            if let Some(home_dir) = dirs::home_dir() {
                if path_buf.starts_with(&home_dir) {
                    return Ok(());
                }
            }

            // Check common allowed directories
            let allowed_prefixes = vec![
                "/home/",
                "/Users/",
                "C:\\Users\\",
                "/workspace/",
                "/project/",
            ];

            for prefix in allowed_prefixes {
                if path.starts_with(prefix) {
                    return Ok(());
                }
            }

            warn!("Path not in allowed directories: {}", path);
            return Err(SecurityError::InvalidParameter(format!(
                "Path '{}' is not in allowed directories",
                path
            )));
        }

        // 3. Canonicalize to prevent symlink attacks
        if path_buf.exists() {
            match path_buf.canonicalize() {
                Ok(canonical) => {
                    if canonical.to_string_lossy().contains("..") {
                        warn!("Symlink path traversal detected: {}", path);
                        return Err(SecurityError::PathTraversal(path.to_string()));
                    }
                }
                Err(e) => {
                    warn!("Failed to canonicalize path: {}", e);
                }
            }
        }

        Ok(())
    }

    /// Validate URL for security issues
    fn validate_url(&self, url: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating URL: {}", url);

        // Parse URL
        let parsed = url::Url::parse(url).map_err(|_| {
            SecurityError::InvalidParameter(format!("Invalid URL format: {}", url))
        })?;

        // 1. Check protocol (only allow http/https)
        let scheme = parsed.scheme();
        if scheme != "http" && scheme != "https" {
            warn!("Insecure protocol detected: {}", scheme);
            return Err(SecurityError::InsecureProtocol(scheme.to_string()));
        }

        // 2. Check for blocked domains (SSRF protection)
        if let Some(host) = parsed.host_str() {
            for blocked in &self.blocked_domains {
                if host == blocked || host.starts_with(&format!("{}.", blocked)) {
                    warn!("Blocked domain detected: {}", host);
                    return Err(SecurityError::BlockedDomain(host.to_string()));
                }
            }

            // Check for private IP ranges
            if host.starts_with("192.168.")
                || host.starts_with("10.")
                || host.starts_with("172.16.")
            {
                warn!("Private IP address detected: {}", host);
                return Err(SecurityError::BlockedDomain(host.to_string()));
            }
        }

        Ok(())
    }

    /// Validate code for dangerous patterns
    fn validate_code(&self, code: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating code execution");

        // Check for dangerous patterns
        let dangerous_patterns = vec![
            "rm -rf",
            "del /f /s /q",
            "format ",
            "mkfs",
            "dd if=",
            "shutdown",
            "reboot",
            ":(){ :|:& };:", // fork bomb
            "__import__('os')",
            "eval(",
            "exec(",
            "system(",
            "shell_exec",
            "subprocess.",
        ];

        for pattern in dangerous_patterns {
            if code.contains(pattern) {
                warn!("Dangerous code pattern detected: {}", pattern);
                return Err(SecurityError::CommandInjection(pattern.to_string()));
            }
        }

        Ok(())
    }

    /// Validate SQL query for injection attempts
    fn validate_sql(&self, query: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating SQL query");

        let query_lower = query.to_lowercase();

        // Check for dangerous SQL operations
        let dangerous_operations = vec![
            "drop table",
            "drop database",
            "truncate table",
            "delete from",
            "update ",
            "insert into",
            "create table",
            "alter table",
            "grant ",
            "revoke ",
        ];

        for op in dangerous_operations {
            if query_lower.contains(op) {
                warn!("Potentially dangerous SQL operation: {}", op);
                // Don't block, but log for review
            }
        }

        // Check for SQL injection patterns
        let injection_patterns = vec![
            "'; --",
            "' or '1'='1",
            "' or 1=1",
            "admin'--",
            "' union select",
            "0x",
        ];

        for pattern in injection_patterns {
            if query_lower.contains(pattern) {
                warn!("SQL injection pattern detected: {}", pattern);
                return Err(SecurityError::CommandInjection(pattern.to_string()));
            }
        }

        Ok(())
    }

    /// Get the risk level for a tool
    pub fn get_risk_level(&self, tool_name: &str) -> Option<RiskLevel> {
        self.allowed_tools.get(tool_name).map(|p| p.risk_level)
    }

    /// Check if a tool requires approval
    pub fn requires_approval(&self, tool_name: &str) -> bool {
        self.allowed_tools
            .get(tool_name)
            .map(|p| p.requires_approval)
            .unwrap_or(true)
    }
}

impl Default for ToolExecutionGuard {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_allowed_tool() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call("file_read", &json!({"path": "/home/user/test.txt"}))
            .await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_unauthorized_tool() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call("unknown_tool", &json!({}))
            .await;
        assert!(matches!(result, Err(SecurityError::UnauthorizedTool(_))));
    }

    #[tokio::test]
    async fn test_path_traversal() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call("file_read", &json!({"path": "../../../etc/passwd"}))
            .await;
        assert!(matches!(result, Err(SecurityError::PathTraversal(_))));
    }

    #[tokio::test]
    async fn test_blocked_domain() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call("browser_navigate", &json!({"url": "http://localhost:8080"}))
            .await;
        assert!(matches!(result, Err(SecurityError::BlockedDomain(_))));
    }

    #[tokio::test]
    async fn test_command_injection() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call("code_execute", &json!({"language": "bash", "code": "rm -rf /"}))
            .await;
        assert!(matches!(result, Err(SecurityError::CommandInjection(_))));
    }

    #[tokio::test]
    async fn test_sql_injection() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call(
                "db_query",
                &json!({"query": "SELECT * FROM users WHERE id = '1' OR '1'='1'"}),
            )
            .await;
        assert!(matches!(result, Err(SecurityError::CommandInjection(_))));
    }

    #[test]
    fn test_risk_levels() {
        let guard = ToolExecutionGuard::new();

        assert_eq!(guard.get_risk_level("file_read"), Some(RiskLevel::Low));
        assert_eq!(guard.get_risk_level("file_write"), Some(RiskLevel::Medium));
        assert_eq!(guard.get_risk_level("browser_navigate"), Some(RiskLevel::High));
        assert_eq!(guard.get_risk_level("code_execute"), Some(RiskLevel::Critical));
    }

    #[test]
    fn test_approval_requirements() {
        let guard = ToolExecutionGuard::new();

        assert!(!guard.requires_approval("file_read"));
        assert!(guard.requires_approval("file_write"));
        assert!(guard.requires_approval("code_execute"));
    }
}
