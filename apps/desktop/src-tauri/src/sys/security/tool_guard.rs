use crate::sys::security::rate_limit::{RateLimitConfig, RateLimiter};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tracing::{debug, warn};

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

pub struct ToolExecutionGuard {
    allowed_tools: HashMap<String, ToolPolicy>,
    rate_limiters: Arc<Mutex<HashMap<String, RateLimiter>>>,
    allowed_paths: Vec<PathBuf>,
    blocked_domains: Vec<String>,
}

impl ToolExecutionGuard {
    pub fn new() -> Self {
        let mut allowed_tools = HashMap::new();

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
            allowed_paths: vec![PathBuf::from("/tmp"), std::env::temp_dir()],
            blocked_domains: vec![
                "localhost".to_string(),
                "127.0.0.1".to_string(),
                "0.0.0.0".to_string(),
                "169.254.169.254".to_string(),
            ],
        }
    }

    pub async fn validate_tool_call(
        &self,
        tool_name: &str,
        parameters: &Value,
    ) -> std::result::Result<(), SecurityError> {
        debug!(
            "Validating tool call: {} with params: {:?}",
            tool_name, parameters
        );

        let policy = self
            .allowed_tools
            .get(tool_name)
            .ok_or_else(|| SecurityError::UnauthorizedTool(tool_name.to_string()))?;

        self.check_rate_limit(tool_name, policy).await?;

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

    async fn check_rate_limit(
        &self,
        tool_name: &str,
        policy: &ToolPolicy,
    ) -> std::result::Result<(), SecurityError> {
        let mut limiters = self.rate_limiters.lock().await;

        let limiter = limiters.entry(tool_name.to_string()).or_insert_with(|| {
            RateLimiter::new(RateLimitConfig {
                max_requests: policy.max_rate_per_minute,
                window: Duration::from_secs(60),
            })
        });

        if let Err(_err) = limiter.check_rate_limit(tool_name) {
            warn!("Rate limit exceeded for tool: {}", tool_name);
            return Err(SecurityError::RateLimitExceeded(tool_name.to_string()));
        }

        Ok(())
    }

    fn validate_file_path(&self, path: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating file path: {}", path);

        // SECSYS-004 fix: Check for path traversal patterns (including URL-encoded)
        let normalized_path = path.replace("%2e%2e", "..").replace("%2f", "/");
        if normalized_path.contains("..") {
            warn!("Path traversal detected: {}", path);
            return Err(SecurityError::PathTraversal(path.to_string()));
        }

        // SECSYS-004 fix: Block null bytes (path truncation attack)
        if path.contains('\0') {
            warn!("Null byte in path detected: {}", path);
            return Err(SecurityError::PathTraversal(
                "Null byte in path not allowed".to_string(),
            ));
        }

        let path_buf = PathBuf::from(path);

        // SECSYS-004 fix: Block network paths (UNC paths on Windows, NFS/SMB mounts)
        #[cfg(target_os = "windows")]
        {
            if path.starts_with("\\\\") || path.starts_with("//") {
                warn!("Network path detected: {}", path);
                return Err(SecurityError::InvalidParameter(
                    "Network paths (UNC) are not allowed".to_string(),
                ));
            }
        }

        // SECSYS-004 fix: Block common network mount points
        let blocked_mount_prefixes = vec![
            "/mnt/",      // Linux mount points
            "/media/",    // Linux removable media
            "/net/",      // NFS automount
            "/Volumes/",  // macOS external volumes (use with caution)
            "/run/user/", // Linux user runtime mounts
        ];

        for prefix in &blocked_mount_prefixes {
            if path.starts_with(prefix) {
                // Allow /Volumes/ on macOS if it's under a known safe path
                #[cfg(target_os = "macos")]
                if prefix == &"/Volumes/" {
                    // Allow if it's a well-known volume name (not arbitrary network share)
                    let path_lower = path.to_lowercase();
                    if path_lower.starts_with("/volumes/macintosh hd")
                        || path_lower.starts_with("/volumes/data")
                    {
                        continue;
                    }
                }
                warn!("Mount point path detected: {}", path);
                return Err(SecurityError::InvalidParameter(format!(
                    "Paths under '{}' are not allowed for security reasons",
                    prefix
                )));
            }
        }

        // SECSYS-004 fix: Block device files
        #[cfg(not(target_os = "windows"))]
        {
            if path.starts_with("/dev/") {
                warn!("Device path detected: {}", path);
                return Err(SecurityError::InvalidParameter(
                    "Device paths are not allowed".to_string(),
                ));
            }
            if path.starts_with("/proc/") || path.starts_with("/sys/") {
                warn!("System pseudo-filesystem path detected: {}", path);
                return Err(SecurityError::InvalidParameter(
                    "System paths (/proc, /sys) are not allowed".to_string(),
                ));
            }
        }

        // AUDIT-003-005 fix: Canonicalize relative paths against CWD before validation
        // instead of immediately returning Ok(()) which bypasses security checks
        if path_buf.is_relative() {
            // Get current working directory and resolve the relative path
            if let Ok(cwd) = std::env::current_dir() {
                let absolute_path = cwd.join(&path_buf);
                // Recursively validate the absolute path
                // But first check for path traversal in the resolved path
                if let Ok(canonical) = absolute_path.canonicalize() {
                    let canonical_str = canonical.to_string_lossy();
                    // Check if canonicalized path contains traversal or escapes allowed dirs
                    if canonical_str.contains("..") {
                        warn!(
                            "Path traversal detected in resolved relative path: {}",
                            path
                        );
                        return Err(SecurityError::PathTraversal(path.to_string()));
                    }
                    // Continue with absolute path validation below using the canonicalized path
                    // For now, allow relative paths that resolve within the CWD
                    if canonical.starts_with(&cwd) {
                        return Ok(());
                    }
                    // If it resolves outside CWD, convert to absolute and continue validation
                    // by falling through to the absolute path checks below
                }
            }
            // If we can't determine CWD or canonicalize, fall through to absolute path checks
            // which will handle it based on the path content
        }

        let is_allowed = self
            .allowed_paths
            .iter()
            .any(|allowed| path_buf.starts_with(allowed));

        if !is_allowed {
            if let Some(home_dir) = dirs::home_dir() {
                if path_buf.starts_with(&home_dir) {
                    return Ok(());
                }
            }

            // SECSYS-004 fix: Expanded list of allowed prefixes with more specific patterns
            let allowed_prefixes = vec![
                "/home/",        // Linux home directories
                "/Users/",       // macOS home directories
                "C:\\Users\\",   // Windows home directories
                "D:\\Users\\",   // Windows secondary drive users
                "/workspace/",   // CI/CD workspace
                "/project/",     // Project directories
                "/var/folders/", // macOS temp folders (sandboxed)
            ];

            for prefix in allowed_prefixes {
                if path.starts_with(prefix) {
                    return Ok(());
                }
            }

            // SECSYS-004 fix: On Windows, check for drive letters but block system drives
            #[cfg(target_os = "windows")]
            {
                if let Some(first_char) = path.chars().next() {
                    if first_char.is_ascii_alphabetic() && path.chars().nth(1) == Some(':') {
                        let drive = first_char.to_ascii_uppercase();
                        // Block Windows system drive except Users folder (already handled above)
                        if drive == 'C' && !path.starts_with("C:\\Users\\") {
                            // Allow specific safe Windows paths
                            let safe_windows_paths = vec!["C:\\Temp\\", "C:\\temp\\"];
                            if !safe_windows_paths.iter().any(|p| path.starts_with(p)) {
                                warn!("System drive path outside Users: {}", path);
                                return Err(SecurityError::InvalidParameter(format!(
                                    "Path '{}' on system drive is not allowed",
                                    path
                                )));
                            }
                        }
                    }
                }
            }

            warn!("Path not in allowed directories: {}", path);
            return Err(SecurityError::InvalidParameter(format!(
                "Path '{}' is not in allowed directories",
                path
            )));
        }

        // SECSYS-004 fix: Canonicalize and re-validate to catch symlink attacks
        if path_buf.exists() {
            match path_buf.canonicalize() {
                Ok(canonical) => {
                    let canonical_str = canonical.to_string_lossy();

                    // Check canonical path doesn't contain traversal
                    if canonical_str.contains("..") {
                        warn!("Symlink path traversal detected: {}", path);
                        return Err(SecurityError::PathTraversal(path.to_string()));
                    }

                    // SECSYS-004 fix: Re-validate the canonical path against blocked prefixes
                    for prefix in &blocked_mount_prefixes {
                        if canonical_str.starts_with(prefix) {
                            warn!(
                                "Symlink resolves to blocked mount point: {} -> {}",
                                path, canonical_str
                            );
                            return Err(SecurityError::PathTraversal(format!(
                                "Path resolves to blocked location: {}",
                                prefix
                            )));
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to canonicalize path: {}", e);
                }
            }
        }

        Ok(())
    }

    fn validate_url(&self, url: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating URL: {}", url);

        let parsed = url::Url::parse(url)
            .map_err(|_| SecurityError::InvalidParameter(format!("Invalid URL format: {}", url)))?;

        let scheme = parsed.scheme();
        if scheme != "http" && scheme != "https" {
            warn!("Insecure protocol detected: {}", scheme);
            return Err(SecurityError::InsecureProtocol(scheme.to_string()));
        }

        if let Some(host) = parsed.host_str() {
            for blocked in &self.blocked_domains {
                if host == blocked || host.starts_with(&format!("{}.", blocked)) {
                    warn!("Blocked domain detected: {}", host);
                    return Err(SecurityError::BlockedDomain(host.to_string()));
                }
            }

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

    fn validate_code(&self, code: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating code execution");

        let dangerous_patterns = vec![
            "rm -rf",
            "del /f /s /q",
            "format ",
            "mkfs",
            "dd if=",
            "shutdown",
            "reboot",
            ":(){ :|:& };:",
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

    fn validate_sql(&self, query: &str) -> std::result::Result<(), SecurityError> {
        debug!("Validating SQL query");

        let query_lower = query.to_lowercase();

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
            }
        }

        // SECSYS-005 fix: Expanded SQL injection patterns to catch more bypass attempts
        let injection_patterns = vec![
            // Classic injection patterns
            "'; --",
            "' or '1'='1",
            "' or 1=1",
            "admin'--",
            "' union select",
            // Hex encoding (common bypass)
            "0x",
            // Comment variations
            "/**/",
            "/* */",
            "#",
            // Boolean-based injection
            "' and '1'='1",
            "' and 1=1",
            "\" or \"1\"=\"1",
            "\" and \"1\"=\"1",
            // Time-based injection
            "waitfor delay",
            "sleep(",
            "benchmark(",
            "pg_sleep(",
            // Stacked queries
            "'; drop",
            "\"; drop",
            "; drop",
            "; delete",
            "; insert",
            "; update",
            // Unicode escaping (common bypass)
            "\\u0027",
            "\\x27",
            "%27",
            "&#39;",
            "&#x27;",
            // SQL Server specific
            "xp_cmdshell",
            "sp_executesql",
            // Comment-based SQL injection
            "'--",
            "\"--",
            "/*",
            "*/",
        ];

        for pattern in &injection_patterns {
            if query_lower.contains(pattern) {
                warn!("SQL injection pattern detected: {}", pattern);
                return Err(SecurityError::CommandInjection(pattern.to_string()));
            }
        }

        // SECSYS-005 fix: Additional check for encoded/obfuscated patterns
        // Check for URL-encoded quotes
        if query.contains("%27") || query.contains("%22") {
            warn!("URL-encoded SQL injection pattern detected");
            return Err(SecurityError::CommandInjection(
                "URL-encoded injection".to_string(),
            ));
        }

        // Check for excessive whitespace (potential obfuscation)
        let normalized = query_lower.split_whitespace().collect::<Vec<_>>().join(" ");
        if normalized.contains(" or ")
            && (normalized.contains("1=1") || normalized.contains("'1'='1"))
        {
            warn!("Normalized SQL injection pattern detected");
            return Err(SecurityError::CommandInjection(
                "Whitespace-obfuscated injection".to_string(),
            ));
        }

        Ok(())
    }

    pub fn get_risk_level(&self, tool_name: &str) -> Option<RiskLevel> {
        self.allowed_tools.get(tool_name).map(|p| p.risk_level)
    }

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
        let result = guard.validate_tool_call("unknown_tool", &json!({})).await;
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
            .validate_tool_call("browser_navigate", &json!({"url": "http://localhost:3000"}))
            .await;
        assert!(matches!(result, Err(SecurityError::BlockedDomain(_))));
    }

    #[tokio::test]
    async fn test_command_injection() {
        let guard = ToolExecutionGuard::new();
        let result = guard
            .validate_tool_call(
                "code_execute",
                &json!({"language": "bash", "code": "rm -rf /"}),
            )
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
        assert_eq!(
            guard.get_risk_level("browser_navigate"),
            Some(RiskLevel::High)
        );
        assert_eq!(
            guard.get_risk_level("code_execute"),
            Some(RiskLevel::Critical)
        );
    }

    #[test]
    fn test_approval_requirements() {
        let guard = ToolExecutionGuard::new();

        assert!(!guard.requires_approval("file_read"));
        assert!(guard.requires_approval("file_write"));
        assert!(guard.requires_approval("code_execute"));
    }
}
