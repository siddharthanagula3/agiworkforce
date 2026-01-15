# Security Architecture

> Comprehensive security documentation for the AGI Workforce Rust backend

## Table of Contents

- [Security Overview](#security-overview)
- [Threat Model](#threat-model)
- [Security Layers](#security-layers)
- [Authentication & Authorization](#authentication--authorization)
- [Secret Management](#secret-management)
- [Policy Engine](#policy-engine)
- [Approval Workflows](#approval-workflows)
- [Audit Logging](#audit-logging)
- [Encryption](#encryption)
- [LLM Security](#llm-security)
- [Rate Limiting](#rate-limiting)
- [Secure Coding Practices](#secure-coding-practices)
- [Security Checklist](#security-checklist)

## Security Overview

The AGI Workforce desktop application implements defense-in-depth security with multiple overlapping layers:

```
┌─────────────────────────────────────────────┐
│         Frontend (React/TypeScript)         │
└─────────────────┬───────────────────────────┘
                  │ Tauri IPC
┌─────────────────▼───────────────────────────┐
│     Policy Engine (Access Control)          │
├─────────────────────────────────────────────┤
│     Approval Workflows (Human-in-loop)      │
├─────────────────────────────────────────────┤
│     Audit Logging (Tamper-proof)            │
├─────────────────────────────────────────────┤
│     RBAC (Role-based Access)                │
├─────────────────────────────────────────────┤
│     Secret Management (Encrypted Storage)    │
├─────────────────────────────────────────────┤
│     Rate Limiting (Abuse Prevention)        │
└─────────────────────────────────────────────┘
```

**Key Security Principles**:
- **Least Privilege**: Grant minimum necessary permissions
- **Defense in Depth**: Multiple security layers
- **Zero Trust**: Verify every operation
- **Audit Everything**: Complete audit trail
- **Fail Secure**: Default to denial on errors
- **Transparency**: User visibility into AI actions

## Threat Model

### Threats We Protect Against

1. **Unauthorized File Access**
   - Threat: AI agents reading sensitive files
   - Mitigation: Policy engine, approval workflows, path validation

2. **Code Execution**
   - Threat: Malicious code execution
   - Mitigation: Sandboxing, approval for shell commands, code review

3. **Data Exfiltration**
   - Threat: Sensitive data sent to external services
   - Mitigation: Network policy, approval for API calls, audit logging

4. **Prompt Injection**
   - Threat: User manipulating AI to bypass restrictions
   - Mitigation: Prompt injection detection, output validation

5. **Privilege Escalation**
   - Threat: Agent gaining higher permissions
   - Mitigation: RBAC, approval workflows, audit trail

6. **Credential Theft**
   - Threat: Exposure of API keys and secrets
   - Mitigation: Encrypted storage, machine-derived keys

7. **Denial of Service**
   - Threat: Resource exhaustion
   - Mitigation: Rate limiting, resource quotas, timeouts

### Out of Scope

- Network-level attacks (firewall responsibility)
- Physical access to machine
- OS kernel vulnerabilities
- Browser zero-days (Tauri webview updates)

## Security Layers

### Layer 1: Policy Engine

**Location**: `src/sys/security/policy/`

The policy engine evaluates every operation against security policies.

**Policy Decision Flow**:
```rust
pub enum PolicyDecision {
    Allow,
    Deny { reason: String },
    RequestApproval { risk_level: RiskLevel },
}
```

**Risk Levels**:
- **Low**: Read public files, basic queries
- **Medium**: Write files in workspace, database queries
- **High**: Shell commands, network requests
- **Critical**: Delete operations, system modifications

**Example Policy Check**:
```rust
use crate::sys::security::{PolicyEngine, PolicyContext, ActionCategory};

let engine = PolicyEngine::new();

let context = PolicyContext {
    action: ActionCategory::FileWrite,
    target: "/path/to/file.txt".to_string(),
    user: user_id.to_string(),
    workspace: Some(workspace_path.clone()),
    request_origin: "ai_agent".to_string(),
};

match engine.evaluate(&context) {
    PolicyDecision::Allow => {
        // Proceed with operation
        write_file(&context.target, content)?;
    },
    PolicyDecision::Deny { reason } => {
        return Err(format!("Access denied: {}", reason));
    },
    PolicyDecision::RequestApproval { risk_level } => {
        // Create approval request
        let request_id = approval_workflow
            .create_approval_request(
                &context.user,
                &context.action,
                &context,
                risk_level,
            )
            .await?;

        // Wait for user approval
        approval_workflow.wait_for_approval(request_id).await?;

        // Proceed after approval
        write_file(&context.target, content)?;
    },
}
```

**Workspace Scoping**:
Operations are restricted to workspace directories:
```rust
impl PolicyEngine {
    fn is_within_workspace(&self, path: &str, workspace: &str) -> bool {
        let path = Path::new(path).canonicalize().ok();
        let workspace = Path::new(workspace).canonicalize().ok();

        match (path, workspace) {
            (Some(p), Some(w)) => p.starts_with(w),
            _ => false,
        }
    }
}
```

**Trust Levels**:
- **Unknown**: New/unverified sources
- **Low**: Basic verification
- **Medium**: Approved workflows
- **High**: Signed/verified code
- **Verified**: Cryptographically signed

### Layer 2: Approval Workflows

**Location**: `src/sys/security/approval_workflow.rs`

Human-in-the-loop approval for risky operations.

**Approval Request**:
```rust
pub struct ApprovalRequest {
    pub id: String,
    pub user_id: String,
    pub action: String,
    pub context: serde_json::Value,
    pub risk_level: RiskLevel,
    pub status: ApprovalStatus,
    pub created_at: i64,
    pub expires_at: Option<i64>,
    pub approved_by: Option<String>,
    pub approved_at: Option<i64>,
    pub rejection_reason: Option<String>,
}
```

**Approval Flow**:
```rust
// 1. Check if approval needed
if workflow.requires_approval(&action, &context)? {
    // 2. Create approval request
    let request_id = workflow.create_approval_request(
        user_id,
        action,
        context,
        RiskLevel::High,
    ).await?;

    // 3. Emit event to frontend
    app.emit("approval-requested", ApprovalRequestedEvent {
        request_id: request_id.clone(),
        action,
        risk_level: RiskLevel::High,
    })?;

    // 4. Wait for approval (with timeout)
    let timeout = Duration::from_secs(300); // 5 minutes
    let result = tokio::time::timeout(
        timeout,
        workflow.wait_for_approval(request_id.clone()),
    ).await;

    match result {
        Ok(Ok(decision)) => {
            if !decision.approved {
                return Err("Operation rejected by user".into());
            }
        },
        Ok(Err(e)) => return Err(format!("Approval error: {}", e)),
        Err(_) => {
            workflow.expire_request(request_id).await?;
            return Err("Approval timeout".into());
        },
    }
}
```

**Trusted Workflows**:
Users can mark workflows as trusted to skip approvals:
```rust
// Check if workflow is trusted
if workflow.is_workflow_trusted(workflow_hash)? {
    // Skip approval for this workflow
    return Ok(true);
}

// Mark workflow as trusted
workflow.set_workflow_hash(workflow_hash, true)?;
```

**Approval Statistics**:
Track approval patterns:
```rust
pub struct ApprovalStatistics {
    pub total_requests: i64,
    pub approved: i64,
    pub rejected: i64,
    pub expired: i64,
    pub approval_rate: f64,
    pub average_response_time_seconds: f64,
}
```

### Layer 3: Audit Logging

**Location**: `src/sys/security/audit_logger.rs`

Tamper-proof audit trail of all security-relevant events.

**Audit Event**:
```rust
pub struct AuditEvent {
    pub id: String,
    pub timestamp: i64,
    pub user_id: String,
    pub event_type: AuditEventType,
    pub resource: String,
    pub action: String,
    pub details: serde_json::Value,
    pub status: AuditStatus,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub previous_hash: Option<String>,
    pub event_hash: String,
}
```

**Event Types**:
```rust
pub enum AuditEventType {
    Authentication,
    Authorization,
    DataAccess,
    DataModification,
    ToolExecution,
    WorkflowExecution,
    ConfigurationChange,
    ApprovalRequest,
    ApprovalDecision,
    SecurityViolation,
}
```

**Tamper Detection**:
Each event includes hash of previous event:
```rust
fn calculate_event_hash(event: &AuditEvent) -> String {
    use sha2::{Sha256, Digest};

    let mut hasher = Sha256::new();
    hasher.update(event.id.as_bytes());
    hasher.update(event.timestamp.to_le_bytes());
    hasher.update(event.user_id.as_bytes());
    // ... other fields

    if let Some(prev_hash) = &event.previous_hash {
        hasher.update(prev_hash.as_bytes());
    }

    format!("{:x}", hasher.finalize())
}
```

**Integrity Verification**:
```rust
pub struct AuditIntegrityReport {
    pub total_events: usize,
    pub verified_events: usize,
    pub tampered_events: Vec<String>,
    pub missing_events: Vec<String>,
    pub is_valid: bool,
}

impl EnhancedAuditLogger {
    pub async fn verify_integrity(&self) -> Result<AuditIntegrityReport> {
        // Verify hash chain
        // Detect gaps in sequence
        // Report any tampering
    }
}
```

**Common Audit Operations**:
```rust
// Log tool execution
logger.log_tool_execution(
    user_id,
    "file_read",
    json!({ "path": "/path/to/file" }),
    json!({ "content": "..." }),
    true,
).await?;

// Log workflow execution
logger.log_workflow_execution(
    user_id,
    workflow_id,
    json!({ "steps": [...] }),
    json!({ "result": "success" }),
    true,
).await?;

// Log security violation
logger.log_event(
    user_id,
    AuditEventType::SecurityViolation,
    "file_system",
    "unauthorized_access",
    json!({ "path": "/etc/passwd", "reason": "outside workspace" }),
    AuditStatus::Failure,
).await?;
```

### Layer 4: Role-Based Access Control (RBAC)

**Location**: `src/sys/security/rbac.rs`

Role-based permissions for users and agents.

**Roles**:
```rust
pub enum UserRole {
    Guest,      // Read-only
    User,       // Standard operations
    PowerUser,  // Advanced features
    Admin,      // Full access
}
```

**Permissions**:
```rust
pub enum Permission {
    FileRead,
    FileWrite,
    FileDelete,
    ShellExecute,
    NetworkAccess,
    DatabaseAccess,
    SystemModify,
    ConfigEdit,
    UserManage,
    AuditView,
}
```

**Permission Checks**:
```rust
let rbac = RBACManager::new(conn);

// Check permission
if !rbac.has_permission(user_id, Permission::FileDelete)? {
    return Err("Insufficient permissions".into());
}

// Get all permissions for role
let permissions = rbac.get_role_permissions(UserRole::User)?;
```

**Custom Roles**:
```rust
// Create custom role
rbac.create_role("developer", vec![
    Permission::FileRead,
    Permission::FileWrite,
    Permission::ShellExecute,
])?;

// Assign role to user
rbac.assign_role(user_id, "developer")?;
```

## Authentication & Authorization

### Authentication Manager

**Location**: `src/sys/security/auth.rs`

Manages user sessions and authentication tokens.

**User Authentication**:
```rust
pub struct User {
    pub id: String,
    pub username: String,
    pub email: String,
    pub role: UserRole,
    pub created_at: i64,
    pub last_login: Option<i64>,
}

pub struct AuthManager {
    secret_manager: Arc<SecretManager>,
    sessions: Arc<RwLock<HashMap<String, Session>>>,
}

impl AuthManager {
    pub async fn login(&self, username: &str, password: &str) -> Result<AuthToken> {
        // Verify credentials
        let user = self.verify_credentials(username, password).await?;

        // Create session
        let session = Session {
            id: Uuid::new_v4().to_string(),
            user_id: user.id.clone(),
            created_at: now(),
            expires_at: now() + SESSION_DURATION,
            ip_address: None,
        };

        // Generate token
        let token = self.generate_token(&session)?;

        // Store session
        self.sessions.write().insert(session.id.clone(), session);

        Ok(token)
    }

    pub async fn verify_token(&self, token: &str) -> Result<User> {
        let session_id = self.decode_token(token)?;

        let sessions = self.sessions.read();
        let session = sessions.get(&session_id)
            .ok_or_else(|| anyhow!("Invalid session"))?;

        if session.expires_at < now() {
            return Err(anyhow!("Session expired"));
        }

        self.get_user(&session.user_id).await
    }
}
```

**OAuth Integration**:
```rust
// OAuth for third-party services
pub struct OAuthManager {
    providers: HashMap<OAuthProvider, OAuthConfig>,
}

impl OAuthManager {
    pub async fn get_authorization_url(
        &self,
        provider: OAuthProvider,
        scopes: Vec<String>,
    ) -> Result<OAuthAuthorizationUrl> {
        // Generate OAuth authorization URL
    }

    pub async fn exchange_code(
        &self,
        provider: OAuthProvider,
        code: &str,
    ) -> Result<OAuthTokenResult> {
        // Exchange authorization code for token
    }
}
```

### Session Management

**Session Storage**:
```rust
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub created_at: i64,
    pub expires_at: i64,
    pub ip_address: Option<String>,
    pub last_activity: i64,
}
```

**Session Persistence**:
Sessions are stored in SQLite for persistence across restarts:
```sql
CREATE TABLE auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    ip_address TEXT,
    last_activity INTEGER NOT NULL
);
```

**Session Cleanup**:
```rust
// Periodic cleanup of expired sessions
async fn cleanup_expired_sessions(auth_manager: Arc<AuthManager>) {
    loop {
        tokio::time::sleep(Duration::from_secs(3600)).await;

        if let Err(e) = auth_manager.cleanup_expired_sessions().await {
            tracing::error!("Session cleanup failed: {}", e);
        }
    }
}
```

## Secret Management

**Location**: `src/sys/security/secret_manager.rs`

Encrypted storage for API keys, passwords, and tokens.

**Architecture**:
- **Encryption**: AES-256-GCM
- **Key Derivation**: Machine-derived key (no keyring dependency)
- **Storage**: SQLite with encrypted values

**Machine-Derived Key**:
```rust
use crate::sys::security::machine_key;

// Derive key from machine ID and hostname
let key = machine_key::derive_key(KeyPurpose::SecretEncryption)?;

// This ensures secrets can only be decrypted on the same machine
```

**Secret Operations**:
```rust
pub struct SecretManager {
    db: Arc<Mutex<Connection>>,
    encryption_key: Vec<u8>,
}

impl SecretManager {
    pub fn new(db: Arc<Mutex<Connection>>) -> Self {
        let encryption_key = machine_key::derive_key(KeyPurpose::SecretEncryption)
            .expect("Failed to derive encryption key");

        Self { db, encryption_key }
    }

    pub async fn set(&self, service: &str, key: &str, value: &str) -> Result<()> {
        // Encrypt value
        let encrypted = self.encrypt(value)?;

        // Store in database
        let conn = self.db.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO secrets (service, key, encrypted_value, updated_at)
             VALUES (?1, ?2, ?3, ?4)",
            params![service, key, encrypted, now()],
        )?;

        Ok(())
    }

    pub async fn get(&self, service: &str, key: &str) -> Result<String> {
        let conn = self.db.lock().unwrap();

        let encrypted: Vec<u8> = conn.query_row(
            "SELECT encrypted_value FROM secrets WHERE service = ?1 AND key = ?2",
            params![service, key],
            |row| row.get(0),
        )?;

        // Decrypt value
        self.decrypt(&encrypted)
    }

    pub async fn delete(&self, service: &str, key: &str) -> Result<()> {
        let conn = self.db.lock().unwrap();
        conn.execute(
            "DELETE FROM secrets WHERE service = ?1 AND key = ?2",
            params![service, key],
        )?;
        Ok(())
    }
}
```

**Encryption Implementation**:
```rust
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::Rng;

impl SecretManager {
    fn encrypt(&self, plaintext: &str) -> Result<Vec<u8>> {
        let cipher = Aes256Gcm::new_from_slice(&self.encryption_key)?;

        // Generate random nonce
        let nonce_bytes: [u8; 12] = rand::thread_rng().gen();
        let nonce = Nonce::from_slice(&nonce_bytes);

        // Encrypt
        let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| anyhow!("Encryption failed: {}", e))?;

        // Prepend nonce to ciphertext
        let mut result = nonce_bytes.to_vec();
        result.extend_from_slice(&ciphertext);

        Ok(result)
    }

    fn decrypt(&self, encrypted: &[u8]) -> Result<String> {
        if encrypted.len() < 12 {
            return Err(anyhow!("Invalid encrypted data"));
        }

        let cipher = Aes256Gcm::new_from_slice(&self.encryption_key)?;

        // Extract nonce and ciphertext
        let (nonce_bytes, ciphertext) = encrypted.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);

        // Decrypt
        let plaintext = cipher.decrypt(nonce, ciphertext)
            .map_err(|e| anyhow!("Decryption failed: {}", e))?;

        Ok(String::from_utf8(plaintext)?)
    }
}
```

**Usage Example**:
```rust
// Store API key
secret_manager.set("openai", "api_key", "sk-...").await?;

// Retrieve API key
let api_key = secret_manager.get("openai", "api_key").await?;

// Delete API key
secret_manager.delete("openai", "api_key").await?;
```

## Policy Engine

**Location**: `src/sys/security/policy/`

Context-aware access control system.

**Policy Structure**:
```rust
pub struct Policy {
    pub id: String,
    pub name: String,
    pub action: ActionCategory,
    pub scope: PolicyScope,
    pub decision: PolicyDecision,
    pub conditions: Vec<PolicyCondition>,
}

pub enum PolicyScope {
    Global,
    Workspace(String),
    User(String),
    Role(String),
}

pub struct PolicyCondition {
    pub field: String,
    pub operator: ConditionOperator,
    pub value: serde_json::Value,
}

pub enum ConditionOperator {
    Equals,
    NotEquals,
    Contains,
    StartsWith,
    Matches, // Regex
    GreaterThan,
    LessThan,
}
```

**Policy Evaluation**:
```rust
impl PolicyEngine {
    pub fn evaluate(&self, context: &PolicyContext) -> PolicyDecision {
        // 1. Find applicable policies
        let policies = self.find_policies(&context);

        // 2. Evaluate conditions
        for policy in policies {
            if self.evaluate_conditions(&policy, context) {
                return policy.decision.clone();
            }
        }

        // 3. Default deny
        PolicyDecision::Deny {
            reason: "No matching policy".to_string(),
        }
    }

    fn evaluate_conditions(
        &self,
        policy: &Policy,
        context: &PolicyContext,
    ) -> bool {
        for condition in &policy.conditions {
            if !self.evaluate_condition(condition, context) {
                return false;
            }
        }
        true
    }
}
```

**Policy Examples**:
```rust
// Allow reading files in workspace
Policy {
    name: "Allow workspace file reads".to_string(),
    action: ActionCategory::FileRead,
    scope: PolicyScope::Workspace(workspace_path),
    decision: PolicyDecision::Allow,
    conditions: vec![
        PolicyCondition {
            field: "target".to_string(),
            operator: ConditionOperator::StartsWith,
            value: json!(workspace_path),
        }
    ],
}

// Require approval for shell commands
Policy {
    name: "Approve shell commands".to_string(),
    action: ActionCategory::ShellExecute,
    scope: PolicyScope::Global,
    decision: PolicyDecision::RequestApproval {
        risk_level: RiskLevel::High,
    },
    conditions: vec![],
}

// Deny access to sensitive directories
Policy {
    name: "Deny sensitive directories".to_string(),
    action: ActionCategory::FileRead,
    scope: PolicyScope::Global,
    decision: PolicyDecision::Deny {
        reason: "Sensitive directory".to_string(),
    },
    conditions: vec![
        PolicyCondition {
            field: "target".to_string(),
            operator: ConditionOperator::Matches,
            value: json!("^/(etc|root|System)/.*"),
        }
    ],
}
```

## LLM Security

### Prompt Injection Detection

**Location**: `src/sys/security/prompt_injection.rs`

Detects attempts to manipulate LLM behavior.

**Detection Patterns**:
```rust
pub struct PromptInjectionDetector {
    patterns: Vec<InjectionPattern>,
}

struct InjectionPattern {
    pattern: regex::Regex,
    severity: Severity,
    description: String,
}

impl PromptInjectionDetector {
    fn detect(&self, input: &str) -> Vec<SecurityRecommendation> {
        let mut recommendations = Vec::new();

        for pattern in &self.patterns {
            if pattern.pattern.is_match(input) {
                recommendations.push(SecurityRecommendation {
                    severity: pattern.severity,
                    message: pattern.description.clone(),
                    suggestion: "Review input for potential injection".to_string(),
                });
            }
        }

        recommendations
    }
}
```

**Common Injection Patterns**:
- System prompt override attempts: "Ignore previous instructions"
- Role confusion: "You are now a different assistant"
- Context injection: "The following is from the system:"
- Encoding tricks: Base64, Unicode, obfuscation
- Delimiter injection: Fake message boundaries

### Output Validation

**Location**: `src/sys/security/guardrails.rs`

Validates LLM outputs before execution.

**Guardrails**:
```rust
pub struct OutputGuardrail {
    validators: Vec<Box<dyn Validator>>,
}

trait Validator {
    fn validate(&self, output: &str) -> Result<()>;
}

// Example: Code execution validator
struct CodeValidator;

impl Validator for CodeValidator {
    fn validate(&self, output: &str) -> Result<()> {
        // Check for dangerous patterns
        let dangerous = [
            "rm -rf",
            ":(){ :|:& };:", // Fork bomb
            "dd if=/dev/zero",
            "mkfs.",
        ];

        for pattern in dangerous {
            if output.contains(pattern) {
                return Err(anyhow!("Dangerous command detected: {}", pattern));
            }
        }

        Ok(())
    }
}
```

## Rate Limiting

**Location**: `src/sys/security/rate_limit.rs`

Prevents abuse and resource exhaustion.

**Rate Limiter**:
```rust
pub struct RateLimiter {
    config: RateLimitConfig,
    buckets: Arc<DashMap<String, TokenBucket>>,
}

pub struct RateLimitConfig {
    pub requests_per_minute: u32,
    pub requests_per_hour: u32,
    pub burst_size: u32,
}

struct TokenBucket {
    tokens: f64,
    last_refill: Instant,
}

impl RateLimiter {
    pub async fn check_rate_limit(&self, key: &str) -> Result<bool> {
        let mut bucket = self.buckets
            .entry(key.to_string())
            .or_insert_with(|| TokenBucket {
                tokens: self.config.burst_size as f64,
                last_refill: Instant::now(),
            });

        // Refill tokens based on time elapsed
        let now = Instant::now();
        let elapsed = now.duration_since(bucket.last_refill).as_secs_f64();
        let tokens_to_add = elapsed * (self.config.requests_per_minute as f64 / 60.0);

        bucket.tokens = (bucket.tokens + tokens_to_add)
            .min(self.config.burst_size as f64);
        bucket.last_refill = now;

        // Check if we have tokens
        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            Ok(true)
        } else {
            Ok(false)
        }
    }
}
```

**Usage**:
```rust
#[tauri::command]
async fn rate_limited_operation(
    rate_limiter: State<'_, RateLimiter>,
    user_id: String,
) -> Result<Response, String> {
    if !rate_limiter.check_rate_limit(&user_id).await? {
        return Err("Rate limit exceeded".to_string());
    }

    // Proceed with operation
    Ok(perform_operation()?)
}
```

## Encryption

### File Encryption

**Location**: `src/sys/security/storage.rs`

Encrypt sensitive files at rest.

**Encryption**:
```rust
pub async fn encrypt_file(
    input_path: &Path,
    output_path: &Path,
    password: &str,
) -> Result<()> {
    // Derive key from password
    let key = derive_key_from_password(password)?;

    // Read file
    let plaintext = tokio::fs::read(input_path).await?;

    // Encrypt
    let encrypted = encrypt_data(&plaintext, &key)?;

    // Write encrypted file
    tokio::fs::write(output_path, encrypted).await?;

    Ok(())
}

pub async fn decrypt_file(
    input_path: &Path,
    output_path: &Path,
    password: &str,
) -> Result<()> {
    // Derive key from password
    let key = derive_key_from_password(password)?;

    // Read encrypted file
    let encrypted = tokio::fs::read(input_path).await?;

    // Decrypt
    let plaintext = decrypt_data(&encrypted, &key)?;

    // Write decrypted file
    tokio::fs::write(output_path, plaintext).await?;

    Ok(())
}
```

### Key Derivation

**Location**: `src/sys/security/machine_key.rs`

Derive cryptographic keys from machine identity.

**Machine Key**:
```rust
pub fn get_machine_id_hash() -> Result<String> {
    use sha2::{Sha256, Digest};

    // Get machine-unique identifier
    let machine_id = machine_uid::get()
        .map_err(|e| anyhow!("Failed to get machine ID: {}", e))?;

    // Get hostname for additional entropy
    let hostname = hostname::get()
        .map_err(|e| anyhow!("Failed to get hostname: {}", e))?
        .to_string_lossy()
        .to_string();

    // Hash machine ID + hostname
    let mut hasher = Sha256::new();
    hasher.update(machine_id.as_bytes());
    hasher.update(hostname.as_bytes());

    Ok(format!("{:x}", hasher.finalize()))
}

pub fn derive_key(purpose: KeyPurpose) -> Result<Vec<u8>> {
    use pbkdf2::pbkdf2_hmac;
    use sha2::Sha256;

    let machine_id_hash = get_machine_id_hash()?;

    // Add purpose-specific salt
    let salt = format!("agiworkforce-{:?}-{}", purpose, machine_id_hash);

    // Derive key using PBKDF2
    let mut key = vec![0u8; 32]; // 256 bits
    pbkdf2_hmac::<Sha256>(
        machine_id_hash.as_bytes(),
        salt.as_bytes(),
        100_000, // iterations
        &mut key,
    );

    Ok(key)
}
```

## Secure Coding Practices

### Input Validation

**Always validate and sanitize input**:
```rust
// Path validation
fn validate_path(path: &str, workspace: &Path) -> Result<PathBuf> {
    let path = Path::new(path)
        .canonicalize()
        .context("Invalid path")?;

    // Ensure path is within workspace
    if !path.starts_with(workspace) {
        return Err(anyhow!("Path outside workspace"));
    }

    Ok(path)
}

// SQL injection prevention
fn safe_query(conn: &Connection, table: &str) -> Result<()> {
    // Whitelist table names
    if !ALLOWED_TABLES.contains(&table) {
        return Err(anyhow!("Invalid table name"));
    }

    // Use parameterized queries
    let query = format!("SELECT * FROM {} WHERE id = ?1", table);
    conn.query_row(&query, [id], |row| {
        // Process row
    })?;

    Ok(())
}
```

### Error Handling

**Never expose internal details**:
```rust
// Bad: Exposes internal error
#[tauri::command]
async fn bad_command() -> Result<Data, String> {
    let data = internal_function()?; // Leaks stack trace
    Ok(data)
}

// Good: Generic error message
#[tauri::command]
async fn good_command() -> Result<Data, String> {
    internal_function()
        .map_err(|e| {
            tracing::error!("Internal error: {:#}", e); // Log internally
            "Operation failed".to_string() // Generic to user
        })
}
```

### Resource Limits

**Always set limits**:
```rust
// Timeout for operations
async fn with_timeout<F, T>(future: F, timeout: Duration) -> Result<T>
where
    F: Future<Output = Result<T>>,
{
    tokio::time::timeout(timeout, future)
        .await
        .map_err(|_| anyhow!("Operation timed out"))?
}

// Memory limits
fn process_with_limit(data: &[u8], max_size: usize) -> Result<()> {
    if data.len() > max_size {
        return Err(anyhow!("Data exceeds size limit"));
    }
    // Process
    Ok(())
}
```

### Secure Defaults

**Default to most secure option**:
```rust
#[derive(Default)]
pub struct SecurityConfig {
    pub require_approval: bool, // Default: false
    pub audit_logging: bool,    // Default: false
}

// Better:
impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            require_approval: true,  // Secure default
            audit_logging: true,     // Secure default
        }
    }
}
```

## Security Checklist

### Before Deploying

- [ ] All secrets encrypted with machine-derived keys
- [ ] Audit logging enabled for all security events
- [ ] Policy engine configured for workspace
- [ ] Approval workflows tested
- [ ] Rate limiting configured
- [ ] Input validation on all commands
- [ ] Error messages don't leak internals
- [ ] Resource limits in place
- [ ] RBAC roles configured
- [ ] Prompt injection detection enabled
- [ ] Database backups configured
- [ ] Session timeouts configured
- [ ] Integrity checks pass

### Code Review Checklist

- [ ] No hardcoded secrets
- [ ] Path traversal prevention
- [ ] SQL injection prevention
- [ ] Command injection prevention
- [ ] XSS prevention in output
- [ ] CSRF tokens where needed
- [ ] Proper error handling
- [ ] Resource cleanup (no leaks)
- [ ] Concurrent access safe
- [ ] Audit logging for sensitive ops

### Incident Response

1. **Detection**: Monitor audit logs for anomalies
2. **Containment**: Revoke compromised credentials
3. **Investigation**: Review audit trail
4. **Remediation**: Patch vulnerabilities
5. **Prevention**: Update policies

## Security Contact

For security issues, please contact: security@agiworkforce.com

Do not open public GitHub issues for security vulnerabilities.
