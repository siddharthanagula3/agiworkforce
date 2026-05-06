//! Security layer: ToolGuard validation, SecretManager encryption, auth, RBAC, rate limiting.
//!
//! [`tool_guard`] validates every tool execution with per-tool policies and risk levels.
//! [`secret_manager`] encrypts API keys via Argon2id + AES-256-GCM. [`auth`] and [`auth_db`]
//! manage sessions with constant-time token comparison. [`rbac`] provides role-based access.

pub mod api;
pub mod approval_workflow;
pub mod audit_logger;
pub mod auth;
pub mod auth_db;
pub mod command_validator;
pub mod dispatch_hmac;
pub mod dm_protection;
pub mod encryption;
pub mod guardrails;
pub mod log_redaction;
pub mod machine_key;
pub mod master_password;
pub mod master_password_encryption;
pub mod oauth;
pub mod permissions;
pub mod policy;
pub mod policy_integration;
pub mod prompt_injection;
pub mod rate_limit;
pub mod rbac;
pub mod sandbox;
pub mod sandbox_runtime;
pub mod secret_manager;
pub mod storage;
pub mod tool_guard;
pub mod updater;

pub use api::{ApiKey, ApiSecurityManager, CorsConfig, CspBuilder};
pub use approval_workflow::{
    ApprovalAction, ApprovalDecision, ApprovalRequest, ApprovalStatistics, ApprovalStatus,
    ApprovalWorkflow, RiskLevel as ApprovalRiskLevel,
};
pub use audit_logger::{
    create_tool_execution_event, create_workflow_execution_event, AuditEvent, AuditEventType,
    AuditFilters, AuditIntegrityReport, AuditLogger, AuditStatus,
};
pub use auth::{
    sign_jwt_with_secret, verify_jwt_signature_with_secret, AuthManager, AuthToken, Session, User,
    UserRole,
};
pub use auth_db::{AuthAuditLog, AuthDatabaseManager};
pub use command_validator::{
    requires_confirmation, validate_command, validate_interactive_input, CommandValidationError,
    ValidationConfig,
};
pub use dm_protection::{
    AllowlistedSender, DmProtection, DmProtectionConfig, PairingCode, VerificationMethod,
};
pub use encryption::{decrypt_secret, encrypt_secret, EncryptedSecret, SecretStore};
pub use machine_key::{
    derive_key, derive_key_base64, derive_key_with_password, derive_key_with_password_base64,
    get_machine_id_hash, KeyPurpose,
};
pub use master_password::{MasterPasswordError, MasterPasswordManager, MasterPasswordStatus};
pub use master_password_encryption::MasterPasswordEncryption;
pub use oauth::{
    OAuthAuthorizationUrl, OAuthManager, OAuthProvider, OAuthTokenResult, OAuthUserInfo,
};
pub use permissions::PermissionManager;
pub use policy::{
    ActionCategory, PolicyContext, PolicyDecision, PolicyEngine, RiskLevel, SecurityAction,
    TrustLevel, Workspace,
};
pub use policy_integration::{
    check_clipboard_read, check_clipboard_write, check_database_connect, check_directory_delete,
    check_file_delete, check_file_read, check_file_write, check_input_simulation,
    check_network_request, check_screen_capture, check_shell_command, check_terminal_spawn,
    PolicyError, PolicyState,
};
pub use prompt_injection::{PromptInjectionDetector, SecurityAnalysis, SecurityRecommendation};
pub use rate_limit::{RateLimitConfig, RateLimiter};
pub use rbac::{Permission, RBACManager};
pub use secret_manager::{SecretError, SecretManager};
pub use storage::{
    decrypt_file, decrypt_file_with_key, encrypt_file, encrypt_file_with_key, EncryptedData,
    SecureStorage,
};
pub use tool_guard::{
    SecurityError, ToolConfirmationRequest, ToolConfirmationResponse, ToolExecutionGuard,
    ToolPolicy, ToolSafetyTier,
};
// SEV-DESK-14: `updater` module emptied — Tauri's built-in Ed25519 updater
// handles production update verification. See `updater.rs` for context.
