use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PermissionLevel {
    Allow,
    Deny,
    AskEveryTime,
    AskOnce,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    pub max_memory_mb: Option<u64>,
    pub max_cpu_percent: Option<u8>,
    pub max_execution_time_ms: Option<u64>,
    pub max_file_size_mb: Option<u64>,
    pub max_network_requests: Option<u32>,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_memory_mb: Some(1024),       // 1GB
            max_cpu_percent: Some(80),
            max_execution_time_ms: Some(60000), // 1 minute
            max_file_size_mb: Some(100),
            max_network_requests: Some(100),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilePermission {
    pub read: bool,
    pub write: bool,
    pub delete: bool,
    pub allowed_paths: Vec<String>,
    pub blocked_paths: Vec<String>,
    pub allowed_extensions: Vec<String>,
}

impl Default for FilePermission {
    fn default() -> Self {
        Self {
            read: false,
            write: false,
            delete: false,
            allowed_paths: vec![],
            blocked_paths: vec![
                "C:\\Windows\\System32".to_string(),
                "C:\\Program Files".to_string(),
            ],
            allowed_extensions: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkPermission {
    pub allow_http: bool,
    pub allow_https: bool,
    pub allowed_domains: Vec<String>,
    pub blocked_domains: Vec<String>,
    pub allowed_ports: Vec<u16>,
}

impl Default for NetworkPermission {
    fn default() -> Self {
        Self {
            allow_http: false,
            allow_https: true,
            allowed_domains: vec![],
            blocked_domains: vec![],
            allowed_ports: vec![443, 80],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPermissionPolicy {
    pub tool_id: String,
    pub tool_name: String,
    pub permission_level: PermissionLevel,
    pub file_permissions: FilePermission,
    pub network_permissions: NetworkPermission,
    pub resource_limits: ResourceLimits,
    pub allow_system_commands: bool,
    pub allow_ui_automation: bool,
    pub require_approval: bool,
    pub auto_approve_after_first: bool,
    pub expires_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl ToolPermissionPolicy {
    pub fn new(tool_id: String, tool_name: String) -> Self {
        Self {
            tool_id,
            tool_name,
            permission_level: PermissionLevel::AskEveryTime,
            file_permissions: FilePermission::default(),
            network_permissions: NetworkPermission::default(),
            resource_limits: ResourceLimits::default(),
            allow_system_commands: false,
            allow_ui_automation: false,
            require_approval: true,
            auto_approve_after_first: false,
            expires_at: None,
            created_at: chrono::Utc::now().to_rfc3339(),
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    pub fn is_file_path_allowed(&self, path: &str) -> bool {
        // Check blocked paths first
        for blocked in &self.file_permissions.blocked_paths {
            if path.starts_with(blocked) {
                return false;
            }
        }

        // If there are allowed paths, check if path is in one of them
        if !self.file_permissions.allowed_paths.is_empty() {
            return self.file_permissions.allowed_paths.iter().any(|allowed| path.starts_with(allowed));
        }

        // Default: allow if not in blocklist
        true
    }

    pub fn is_file_extension_allowed(&self, extension: &str) -> bool {
        if self.file_permissions.allowed_extensions.is_empty() {
            return true; // No restrictions
        }

        self.file_permissions.allowed_extensions.contains(&extension.to_string())
    }

    pub fn is_domain_allowed(&self, domain: &str) -> bool {
        // Check blocked domains first
        if self.network_permissions.blocked_domains.contains(&domain.to_string()) {
            return false;
        }

        // If there are allowed domains, check if domain is in list
        if !self.network_permissions.allowed_domains.is_empty() {
            return self.network_permissions.allowed_domains.contains(&domain.to_string());
        }

        // Default: allow if not in blocklist
        true
    }

    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = &self.expires_at {
            if let Ok(expiry_time) = chrono::DateTime::parse_from_rfc3339(expires_at) {
                return chrono::Utc::now() > expiry_time;
            }
        }
        false
    }

    pub fn should_request_approval(&self) -> bool {
        if self.is_expired() {
            return true;
        }

        match self.permission_level {
            PermissionLevel::Allow => false,
            PermissionLevel::Deny => false,
            PermissionLevel::AskEveryTime => true,
            PermissionLevel::AskOnce => self.require_approval,
        }
    }

    pub fn grant_permanent_access(&mut self) {
        self.permission_level = PermissionLevel::Allow;
        self.require_approval = false;
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }

    pub fn revoke_access(&mut self) {
        self.permission_level = PermissionLevel::Deny;
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }

    pub fn grant_temporary_access(&mut self, duration_hours: u32) {
        self.permission_level = PermissionLevel::Allow;
        self.expires_at = Some(
            (chrono::Utc::now() + chrono::Duration::hours(duration_hours as i64)).to_rfc3339()
        );
        self.updated_at = chrono::Utc::now().to_rfc3339();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_permission_policy_creation() {
        let policy = ToolPermissionPolicy::new("test-tool".to_string(), "Test Tool".to_string());
        assert_eq!(policy.tool_id, "test-tool");
        assert!(matches!(policy.permission_level, PermissionLevel::AskEveryTime));
    }

    #[test]
    fn test_file_path_allowed() {
        let mut policy = ToolPermissionPolicy::new("test-tool".to_string(), "Test Tool".to_string());
        policy.file_permissions.allowed_paths = vec!["C:\\Users\\".to_string()];
        policy.file_permissions.blocked_paths = vec!["C:\\Windows\\".to_string()];

        assert!(policy.is_file_path_allowed("C:\\Users\\test\\file.txt"));
        assert!(!policy.is_file_path_allowed("C:\\Windows\\System32\\file.txt"));
    }

    #[test]
    fn test_expiration() {
        let mut policy = ToolPermissionPolicy::new("test-tool".to_string(), "Test Tool".to_string());

        // Set expiry in the past
        policy.expires_at = Some("2020-01-01T00:00:00Z".to_string());
        assert!(policy.is_expired());

        // Set expiry in the future
        policy.grant_temporary_access(24);
        assert!(!policy.is_expired());
    }
}
