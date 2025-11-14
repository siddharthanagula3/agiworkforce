# JWT Secret Management - Quick Reference

## For Developers

### Creating AuthManager (New Pattern)

```rust
// ❌ OLD (Broken)
let auth_manager = AuthManager::new();

// ✅ NEW (Correct)
use crate::security::{SecretManager, AuthManager};
use std::sync::{Arc, Mutex};

let db_conn = Arc::new(Mutex::new(connection));
let secret_manager = Arc::new(SecretManager::new(db_conn));
let auth_manager = AuthManager::new(secret_manager);
```

### In Tests

```rust
#[test]
fn test_auth() {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute(
        "CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            encrypted INTEGER NOT NULL DEFAULT 0
        )",
        [],
    ).unwrap();

    let secret_manager = Arc::new(SecretManager::new(Arc::new(Mutex::new(conn))));
    let auth_manager = AuthManager::new(secret_manager);

    // Your test code here
}
```

### Rotating Secrets (API)

```rust
// Rust
#[tauri::command]
pub async fn admin_rotate_secret(
    state: State<'_, AuthManagerState>,
) -> Result<(), String> {
    let manager = state.0.read();
    manager.rotate_jwt_secret()?;
    Ok(())
}
```

```typescript
// TypeScript/Frontend
import { invoke } from '@tauri-apps/api/tauri';

async function rotateSecret() {
  await invoke('admin_rotate_secret');
  // Redirect to login
  window.location.href = '/login';
}
```

## For Operations

### Check Secret Storage

**Windows:**
```powershell
# Open Credential Manager
control /name Microsoft.CredentialManager
# Look for: "AGI Workforce" -> "agiworkforce.jwt_secret"
```

**macOS:**
```bash
# Open Keychain Access
open -a "Keychain Access"
# Search for: "agiworkforce.jwt_secret"
```

**Linux:**
```bash
# For GNOME Keyring
secret-tool search service "AGI Workforce"
```

### Emergency Secret Rotation

```bash
# If secret compromised, rotate immediately
# Via admin interface or API call
# All users will need to re-authenticate
```

### Verify Secret in Database (Fallback)

```sql
-- Check if secret exists in database
SELECT key, encrypted FROM settings WHERE key = 'jwt_secret';
-- Should return: jwt_secret | 1

-- ⚠️ NEVER query the actual value in production
```

## For Security Team

### Incident Response

If JWT secret compromised:

1. **Immediate Actions (< 5 min)**
   - Call `rotate_jwt_secret()` API
   - All sessions invalidated automatically
   - Monitor authentication logs

2. **Investigation (< 1 hour)**
   - Review audit logs for unauthorized access
   - Identify compromise vector
   - Assess blast radius

3. **Communication (< 2 hours)**
   - Notify affected users
   - Document incident
   - Update security advisories

### Compliance Checks

```bash
# Verify secret not in version control
git log --all --full-history -- "*auth*" | grep -i "secret"

# Verify secret not in logs
grep -r "jwt_secret" /var/log/agiworkforce/

# Verify keyring usage
# Check application logs for:
# "JWT secret retrieved from OS keyring" (good)
# "JWT secret retrieved from database (fallback)" (acceptable)
```

## Security Properties

| Property | Status | Verification |
|----------|--------|--------------|
| No hardcoded secrets | ✅ | Code review |
| OS keyring storage | ✅ | Check keyring tools |
| Database fallback | ✅ | Test with keyring disabled |
| Rotation support | ✅ | Call rotation API |
| No log exposure | ✅ | Review logs |
| 512-bit entropy | ✅ | Secret length > 80 chars |

## Common Issues

### "Secret not found" error
- **Cause:** Database not initialized or corrupted
- **Fix:** App will auto-generate on next start
- **Prevention:** Regular database backups

### "Keyring access denied"
- **Cause:** OS keyring permissions
- **Fix:** Grant app keyring access, or use DB fallback
- **Impact:** Reduced security, but functional

### All users logged out
- **Cause:** Secret rotation or corruption
- **Fix:** Users re-authenticate (normal)
- **Prevention:** Notify users before scheduled rotation

## Monitoring Metrics

Key metrics to track:

```
- authentication_success_rate: > 99%
- secret_retrieval_time: < 100ms
- keyring_fallback_rate: < 5%
- rotation_events: Track for compliance
```

## Support Contacts

- **Security Issues:** security@agiworkforce.com
- **General Support:** support@agiworkforce.com
- **Docs:** /docs/SECURITY_SECRET_ROTATION.md

---

**Last Updated:** 2024-11-14
**Version:** 1.0
