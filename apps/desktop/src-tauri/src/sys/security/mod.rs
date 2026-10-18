//! Security layer: ToolGuard validation, SecretManager encryption, auth, rate limiting.
//!
//! [`tool_guard`] validates every tool execution with per-tool policies and risk levels.
//! [`secret_manager`] encrypts API keys via Argon2id + AES-256-GCM. [`auth`] manages
//! sessions with constant-time token comparison.

pub mod aead_nonce;
pub mod approval_workflow;
pub mod audit_logger;
pub mod blocked_paths;
pub mod command_validator;
pub mod dispatch_hmac;
pub mod egress_policy;
pub mod encryption;
pub mod env_filter;
pub mod exec_gate;
#[cfg(test)]
mod exec_gate_parity_tests;
pub mod log_redaction;
pub mod machine_key;
pub mod machine_key_rewrap;
pub mod master_password;
pub mod master_password_encryption;
pub mod prompt_injection;
pub mod rate_limit;
pub mod sandbox_runtime;
pub mod secret_manager;
pub mod storage;
pub mod tool_guard;
pub mod vault_credentials;

pub use approval_workflow::{
    ApprovalAction, ApprovalDecision, ApprovalRequest, ApprovalStatistics, ApprovalStatus,
    ApprovalWorkflow, RiskLevel as ApprovalRiskLevel,
};
pub use audit_logger::{
    create_tool_execution_event, create_workflow_execution_event, AuditEvent, AuditEventType,
    AuditFilters, AuditIntegrityReport, AuditLogger, AuditStatus,
};
pub use command_validator::{
    requires_confirmation, validate_command, validate_interactive_input, CommandValidationError,
    ValidationConfig,
};
pub use encryption::{
    decrypt_secret, decrypt_secret_with_key, encrypt_secret, EncryptedSecret, SecretStore,
};
pub use machine_key::{
    derive_key, derive_key_base64, get_machine_id_hash, has_install_secret,
    has_machine_only_secrets, load_or_create_install_secret, machine_only_payloads, set_install_id,
    set_install_secret, try_derive_key, InstallSecretError, InstallSecretStore, KeyDerivationError,
    KeyPurpose, OsInstallSecretStore, INSTALL_SECRET_BYTES,
};
pub use machine_key_rewrap::{
    rewrap_legacy_machine_only_files, spawn_legacy_machine_only_file_rewrap,
};
pub use master_password::{MasterPasswordError, MasterPasswordManager, MasterPasswordStatus};
pub use master_password_encryption::MasterPasswordEncryption;
pub use prompt_injection::{PromptInjectionDetector, SecurityAnalysis, SecurityRecommendation};
pub use rate_limit::{RateLimitConfig, RateLimiter};
pub use secret_manager::{SecretError, SecretManager};
pub use storage::{decrypt_file_with_key, encrypt_file_with_key};
pub use tool_guard::{
    SecurityError, ToolConfirmationRequest, ToolConfirmationResponse, ToolExecutionGuard,
    ToolPolicy, ToolSafetyTier,
};
