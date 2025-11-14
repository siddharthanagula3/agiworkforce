# JWT Secret Rotation Guide

This document describes the secure secret management system and procedures for rotating JWT secrets in the AGI Workforce application.

## Overview

The application uses a secure secret management system for JWT (JSON Web Token) secrets that:

- **Generates cryptographically secure random secrets** (512-bit/64-byte secrets)
- **Stores secrets in OS keyring** (primary storage - Windows Credential Manager, macOS Keychain, Linux Secret Service)
- **Falls back to encrypted database storage** if keyring is unavailable
- **Never logs or exposes secrets** in error messages or logs
- **Supports secret rotation** to invalidate all existing sessions

## Architecture

### Components

1. **SecretManager** (`apps/desktop/src-tauri/src/security/secret_manager.rs`)
   - Handles secret generation, storage, and retrieval
   - Manages dual storage (keyring + database)
   - Provides rotation functionality

2. **AuthManager** (`apps/desktop/src-tauri/src/security/auth.rs`)
   - Uses SecretManager to retrieve JWT secrets
   - Implements authentication logic
   - Provides rotation API that invalidates all sessions

### Storage Hierarchy

```
Priority 1: OS Keyring (Most Secure)
├── Windows: Credential Manager (DPAPI encryption)
├── macOS: Keychain (Hardware-backed when available)
└── Linux: Secret Service API (GNOME Keyring, KWallet)

Priority 2: Database Fallback
└── SQLite settings table with encrypted flag
```

## When to Rotate Secrets

### Mandatory Rotation Scenarios

1. **Security Breach Suspected**
   - If you suspect the secret has been compromised
   - If unauthorized access is detected
   - After a security incident

2. **Employee Offboarding**
   - When removing administrative access
   - After role changes that reduce permissions

3. **Compliance Requirements**
   - Regular rotation as required by security policy
   - Industry compliance standards (PCI-DSS, HIPAA, etc.)

### Recommended Rotation Scenarios

1. **Regular Maintenance**
   - Quarterly rotation as a security best practice
   - After major version upgrades

2. **Before Production Deployment**
   - Rotate secrets when moving from development to production
   - Ensure development secrets are never used in production

## How to Rotate Secrets

### Via Code (Tauri Command)

```rust
// In your Rust code
use crate::security::AuthManager;

#[tauri::command]
pub async fn rotate_jwt_secret(
    state: State<'_, AuthManagerState>,
) -> Result<(), String> {
    let manager = state.0.read();
    manager.rotate_jwt_secret()?;
    Ok(())
}
```

### Via Frontend (TypeScript)

```typescript
import { invoke } from '@tauri-apps/api/tauri';

async function rotateJWTSecret() {
  try {
    await invoke('rotate_jwt_secret');
    console.log('JWT secret rotated successfully');
    // Redirect users to login page
    window.location.href = '/login';
  } catch (error) {
    console.error('Failed to rotate JWT secret:', error);
  }
}
```

### Manual Rotation Process

1. **Backup Current State**
   ```bash
   # Backup the database before rotation
   cp ~/.local/share/agiworkforce/agiworkforce.db \
      ~/.local/share/agiworkforce/agiworkforce.db.backup
   ```

2. **Notify Users**
   - Send advance notice to all users
   - Schedule rotation during low-usage period
   - Prepare support documentation

3. **Execute Rotation**
   - Call the rotation API
   - All sessions will be immediately invalidated
   - Users will need to re-authenticate

4. **Verify Success**
   - Check logs for rotation confirmation
   - Verify new secret is stored in keyring
   - Test user authentication flow

5. **Monitor**
   - Watch for authentication errors
   - Check user login metrics
   - Review security audit logs

## Emergency Rotation Procedure

If you need to immediately rotate the secret due to a security incident:

```bash
# Connect to the application and execute rotation
# This can be done via the admin interface or CLI

# Example CLI approach (if implemented):
./agiworkforce-cli security rotate-jwt-secret --force --reason "security-incident"
```

### Post-Emergency Steps

1. **Verify rotation completed successfully**
2. **Force logout all users** (automatically done by rotation)
3. **Review audit logs** for suspicious activity
4. **Update incident response documentation**
5. **Notify security team and stakeholders**

## Secret Storage Details

### OS Keyring Storage

**Windows (Credential Manager)**
- Service: "AGI Workforce"
- Key: "agiworkforce.jwt_secret"
- Encryption: DPAPI (Data Protection API)
- Access: Current user only

**macOS (Keychain)**
- Service: "AGI Workforce"
- Account: "agiworkforce.jwt_secret"
- Access Control: Application-specific

**Linux (Secret Service)**
- Collection: Default keyring
- Schema: "AGI Workforce"
- Attribute: "agiworkforce.jwt_secret"

### Database Fallback

If keyring is unavailable, the secret is stored in SQLite:

```sql
-- Settings table
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    encrypted INTEGER NOT NULL DEFAULT 0
);

-- Secret stored with key 'jwt_secret' and encrypted flag set to 1
INSERT INTO settings (key, value, encrypted)
VALUES ('jwt_secret', '[base64-encoded-secret]', 1);
```

## Security Best Practices

### DO

✅ Rotate secrets regularly (quarterly recommended)
✅ Use OS keyring when available (automatic)
✅ Backup database before rotation
✅ Monitor authentication logs after rotation
✅ Test rotation in staging before production
✅ Document rotation in change management system
✅ Notify users before scheduled rotation

### DON'T

❌ Never log or print the secret value
❌ Don't share secrets between environments
❌ Don't skip notification for scheduled rotations
❌ Don't rotate during peak usage hours
❌ Don't hardcode secrets in configuration files
❌ Don't disable keyring storage without good reason

## Troubleshooting

### Secret Not Found After Rotation

**Symptoms:** Users cannot authenticate, "Secret not found" errors

**Resolution:**
1. Check keyring service is running
2. Verify database connection
3. Check application logs for storage errors
4. Manually trigger secret generation:
   ```rust
   // In emergency, force regeneration
   secret_manager.rotate_jwt_secret()?;
   ```

### Keyring Access Denied

**Symptoms:** Secret falls back to database, keyring errors in logs

**Resolution:**
1. **Windows:** Check Credential Manager permissions
2. **macOS:** Grant Keychain access to application
3. **Linux:** Verify Secret Service daemon is running
4. Application will work with database fallback

### Database Locked During Rotation

**Symptoms:** Rotation fails with "database is locked" error

**Resolution:**
1. Ensure no long-running transactions
2. Close all database connections
3. Retry rotation
4. Check for file system issues

### All Users Logged Out Unexpectedly

**Symptoms:** Mass logout event, user complaints

**Likely Cause:** Secret rotation or corruption

**Resolution:**
1. Check audit logs for rotation events
2. Verify secret exists and is valid
3. If secret corrupted, rotate again
4. Communicate with users about re-authentication

## Monitoring and Auditing

### Key Metrics to Monitor

1. **Authentication Success Rate**
   - Should remain stable after rotation
   - Drop indicates rotation issues

2. **Secret Retrieval Time**
   - Keyring: < 100ms
   - Database: < 50ms

3. **Storage Fallback Rate**
   - Track how often database fallback is used
   - Investigate if rate increases

### Audit Log Entries

The following events are logged:

```
- JWT secret retrieved from keyring
- JWT secret retrieved from database (fallback)
- JWT secret rotation initiated
- JWT secret rotation completed
- Secret storage error
- Keyring access error
```

## API Reference

### SecretManager Methods

```rust
impl SecretManager {
    /// Get or create JWT secret (automatic generation if not exists)
    pub fn get_or_create_jwt_secret(&self) -> Result<String, SecretError>

    /// Rotate JWT secret (generates new secret, invalidates old)
    pub fn rotate_jwt_secret(&self) -> Result<String, SecretError>

    /// Delete JWT secret (for testing only)
    #[cfg(test)]
    pub fn delete_jwt_secret(&self) -> Result<(), SecretError>
}
```

### AuthManager Methods

```rust
impl AuthManager {
    /// Create AuthManager with SecretManager
    pub fn new(secret_manager: Arc<SecretManager>) -> Self

    /// Rotate JWT secret and invalidate all sessions
    pub fn rotate_jwt_secret(&self) -> Result<(), String>
}
```

## Migration from Hardcoded Secrets

If migrating from a version with hardcoded secrets:

1. **Before Migration**
   - Backup all user data
   - Notify users of upcoming re-authentication
   - Schedule during maintenance window

2. **During Migration**
   - Deploy new version with SecretManager
   - First run will generate new secret automatically
   - All existing sessions invalidated

3. **After Migration**
   - Users must re-authenticate
   - Monitor authentication success rate
   - Verify keyring storage working

## Testing Secret Rotation

### Unit Tests

```rust
#[test]
fn test_secret_rotation() {
    let manager = create_test_manager();
    let secret1 = manager.get_or_create_jwt_secret().unwrap();

    manager.rotate_jwt_secret().unwrap();

    let secret2 = manager.get_or_create_jwt_secret().unwrap();
    assert_ne!(secret1, secret2);
}
```

### Integration Tests

1. Create test user and authenticate
2. Verify token works
3. Rotate secret
4. Verify old token no longer works
5. Verify new authentication succeeds

## Support and Resources

- **Security Team Contact:** security@agiworkforce.com
- **Incident Response:** [Internal incident response runbook]
- **Compliance Questions:** compliance@agiworkforce.com

## Changelog

- **2024-11-14:** Initial implementation of secure secret management system
  - Added OS keyring integration
  - Implemented automatic secret generation
  - Added rotation API
  - Created documentation

---

**Last Updated:** 2024-11-14
**Document Version:** 1.0
**Reviewed By:** Security Team
