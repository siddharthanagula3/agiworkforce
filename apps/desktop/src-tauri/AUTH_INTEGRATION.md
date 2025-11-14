# Authentication System Integration

## Overview

The AuthManager has been successfully integrated into `main.rs` and is now available via Tauri's state management system. This document explains how to use it to protect commands.

## Integration Status

✅ **Completed:**
- SecretManager initialized with database connection (line 66-68)
- AuthManager initialized with SecretManager (line 70-74)
- State properly managed via `AuthManagerState` wrapper
- Compatible with existing security commands in `/commands/security.rs`

## Available Authentication Commands

The following Tauri commands are available for authentication:

```rust
// Registration
auth_register(email: String, password: String, role: String) -> Result<String, String>

// Login (returns JWT token)
auth_login(email: String, password: String) -> Result<AuthToken, String>

// Logout
auth_logout(access_token: String) -> Result<(), String>

// Token refresh
auth_refresh_token(refresh_token: String) -> Result<AuthToken, String>

// Token validation
auth_validate_token(access_token: String) -> Result<bool, String>

// Password change
auth_change_password(user_id: String, old_password: String, new_password: String) -> Result<(), String>
```

## How to Protect Commands

### Option 1: Manual Token Validation (Inline)

Add token validation directly in your command:

```rust
use tauri::State;
use crate::commands::security::AuthManagerState;

#[tauri::command]
pub async fn protected_command(
    access_token: String,
    auth_state: State<'_, AuthManagerState>,
    // ... other parameters
) -> Result<String, String> {
    // Validate token first
    let manager = auth_state.0.read();
    let user = manager.validate_token(&access_token)
        .map_err(|e| format!("Authentication failed: {}", e))?;

    // Check permissions (optional)
    if user.role != UserRole::Admin {
        return Err("Insufficient permissions".to_string());
    }

    // Proceed with protected operation
    Ok("Operation successful".to_string())
}
```

### Option 2: Helper Function Pattern (Recommended)

Create a reusable authentication helper:

```rust
// In commands/security.rs or a new commands/auth_helpers.rs

use crate::commands::security::AuthManagerState;
use crate::security::{User, UserRole};
use tauri::State;

/// Validate token and return the authenticated user
pub fn authenticate(
    access_token: &str,
    auth_state: &State<'_, AuthManagerState>,
) -> Result<User, String> {
    let manager = auth_state.0.read();
    manager.validate_token(access_token)
        .map_err(|e| format!("Authentication failed: {}", e))
}

/// Validate token and check if user has required role
pub fn authorize(
    access_token: &str,
    required_role: UserRole,
    auth_state: &State<'_, AuthManagerState>,
) -> Result<User, String> {
    let user = authenticate(access_token, auth_state)?;

    // Check if user has sufficient permissions
    let user_level = match user.role {
        UserRole::Viewer => 0,
        UserRole::Editor => 1,
        UserRole::Admin => 2,
    };

    let required_level = match required_role {
        UserRole::Viewer => 0,
        UserRole::Editor => 1,
        UserRole::Admin => 2,
    };

    if user_level < required_level {
        return Err("Insufficient permissions".to_string());
    }

    Ok(user)
}

// Then use in your commands:
#[tauri::command]
pub async fn protected_operation(
    access_token: String,
    auth_state: State<'_, AuthManagerState>,
) -> Result<String, String> {
    // Authenticate and authorize in one line
    let user = authorize(&access_token, UserRole::Editor, &auth_state)?;

    // User is authenticated and authorized, proceed with operation
    Ok(format!("Hello, {}!", user.email))
}
```

### Option 3: Macro-Based Protection (Future Enhancement)

For a more elegant solution, consider creating a procedural macro:

```rust
// Future implementation idea (requires proc-macro crate)
#[protected(role = "Editor")]
#[tauri::command]
pub async fn my_command(
    access_token: String,
    auth_state: State<'_, AuthManagerState>,
    // ... other parameters
) -> Result<String, String> {
    // Command automatically protected, access_token validated
    Ok("Protected content".to_string())
}
```

## Session Management

### Token Expiration

- **Access tokens:** Valid for 60 minutes
- **Refresh tokens:** Valid for 30 days
- **Inactive sessions:** Timeout after 15 minutes of inactivity

### Token Refresh Flow

```rust
// Frontend should implement this flow:
// 1. Store access_token and refresh_token
// 2. On 401/authentication error, attempt refresh:
let new_tokens = auth_refresh_token(stored_refresh_token).await?;
// 3. Update stored tokens
// 4. Retry original request
```

## Security Features

1. **Password Hashing:** Argon2 with per-user salt
2. **Account Lockout:** 5 failed attempts = 15-minute lockout
3. **JWT Secrets:** Stored in OS keyring (Windows Credential Manager) with database fallback
4. **Token Rotation:** `rotate_jwt_secret()` invalidates all sessions (emergency use)
5. **Audit Logging:** All auth events logged via telemetry

## Frontend Integration Example

```typescript
// Frontend service (TypeScript)
import { invoke } from '@tauri-apps/api/tauri';

class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  async login(email: string, password: string) {
    const result = await invoke<AuthToken>('auth_login', { email, password });
    this.accessToken = result.access_token;
    this.refreshToken = result.refresh_token;
    localStorage.setItem('refresh_token', result.refresh_token);
  }

  async callProtectedCommand(params: any) {
    try {
      return await invoke('protected_command', {
        access_token: this.accessToken,
        ...params
      });
    } catch (error) {
      // If auth failed, try refreshing
      if (error.toString().includes('Authentication failed')) {
        await this.refreshAccessToken();
        // Retry with new token
        return await invoke('protected_command', {
          access_token: this.accessToken,
          ...params
        });
      }
      throw error;
    }
  }

  private async refreshAccessToken() {
    const result = await invoke<AuthToken>('auth_refresh_token', {
      refresh_token: this.refreshToken
    });
    this.accessToken = result.access_token;
    this.refreshToken = result.refresh_token;
  }
}
```

## Next Steps

### To Enable Authentication on Existing Commands:

1. **Identify sensitive commands** that need protection (e.g., file operations, automation, API calls)
2. **Add `access_token` parameter** to command signatures
3. **Add `AuthManagerState` to state parameters**
4. **Call authentication helper** at the start of the command
5. **Update frontend** to pass tokens with requests

### Recommended Protection Priority:

**High Priority (Admin only):**
- Settings changes
- User management
- System configuration
- Workflow creation/deletion

**Medium Priority (Editor+):**
- File operations
- Automation commands
- API integrations
- Database operations

**Low Priority (Viewer+):**
- Read-only operations
- Status checks
- Logs viewing

## Testing

Run the authentication tests:

```bash
cd apps/desktop/src-tauri
cargo test auth_flow --package agiworkforce-desktop -- --nocapture
```

## Security Considerations

⚠️ **Important:**
- Never log access tokens or refresh tokens
- Always use HTTPS for token transmission (in production)
- Rotate JWT secrets on suspected compromise
- Implement rate limiting on login attempts (already done: 5 attempts max)
- Consider implementing API key authentication for external integrations
- Add CSRF protection for web-based frontends

## Migration Path

Since authentication is now initialized but NOT enforced, you can:

1. **Test authentication commands** without breaking existing functionality
2. **Gradually migrate commands** to require authentication
3. **Add role-based permissions** incrementally
4. **Enable global authentication** via middleware once ready

This allows for a smooth transition without immediate breaking changes.
