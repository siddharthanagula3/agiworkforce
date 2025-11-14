pub mod api;
pub mod approval_workflow;
pub mod audit;
pub mod audit_logger;
pub mod auth;
pub mod auth_db;
pub mod encryption;
pub mod guardrails;
pub mod injection_detector;
pub mod oauth;
pub mod permissions;
pub mod prompt_injection;
pub mod rate_limit;
pub mod rbac;
pub mod sandbox;
pub mod secret_manager;
pub mod storage;
pub mod tool_guard;
pub mod updater;
pub mod validator;

pub use api::{ApiKey, ApiSecurityManager, CorsConfig, CspBuilder};
pub use approval_workflow::{
    ApprovalAction, ApprovalDecision, ApprovalRequest, ApprovalStatistics, ApprovalStatus,
    ApprovalWorkflow, RiskLevel as ApprovalRiskLevel,
};
pub use audit::{AuditFilters, AuditLogger, AutomationStats};
pub use audit_logger::{
    create_tool_execution_event, create_workflow_execution_event, AuditEvent, AuditEventType,
    AuditIntegrityReport, AuditLogger as EnhancedAuditLogger, AuditStatus,
};
pub use auth::{AuthManager, AuthToken, Session, User, UserRole};
pub use auth_db::{AuthAuditLog, AuthDatabaseManager};
pub use encryption::{EncryptedSecret, SecretStore};
pub use oauth::{
    OAuthAuthorizationUrl, OAuthManager, OAuthProvider, OAuthTokenResult, OAuthUserInfo,
};
pub use permissions::PermissionManager;
pub use prompt_injection::{PromptInjectionDetector, SecurityAnalysis, SecurityRecommendation};
pub use rate_limit::{RateLimitConfig, RateLimiter};
pub use rbac::{Permission, RBACManager};
pub use secret_manager::{SecretError, SecretManager};
pub use storage::{decrypt_file, encrypt_file, EncryptedData, SecureStorage};
pub use tool_guard::{RiskLevel, SecurityError, ToolExecutionGuard, ToolPolicy};
pub use updater::{UpdateMetadata, UpdateSecurityManager, VerificationResult};
pub use validator::{CommandValidator, SafetyLevel};
