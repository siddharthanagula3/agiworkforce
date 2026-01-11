use crate::db::models::{Permission, PermissionState, PermissionType};
use crate::error::{Error, Result};
use chrono::Utc;
use rusqlite::Connection;
use std::sync::Mutex;
use tracing::{debug, info, warn};

/// Permission manager for system automation operations
pub struct PermissionManager {
    conn: Mutex<Connection>,
}

impl PermissionManager {
    pub fn new(conn: Connection) -> Self {
        Self {
            conn: Mutex::new(conn),
        }
    }

    /// Check if a permission is granted for a specific operation
    pub fn check_permission(
        &self,
        permission_type: PermissionType,
        pattern: Option<&str>,
    ) -> Result<PermissionState> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        // First check for pattern-specific permission
        if let Some(pattern_str) = pattern {
            let state = conn.query_row(
                "SELECT state FROM permissions
                 WHERE permission_type = ?1 AND pattern = ?2",
                [permission_type.as_str(), pattern_str],
                |row| {
                    let state_str: String = row.get(0)?;
                    Ok(PermissionState::from_str(&state_str))
                },
            );

            if let Ok(Some(perm_state)) = state {
                debug!(
                    "Pattern-specific permission found: {:?} for {:?}",
                    perm_state, permission_type
                );
                return Ok(perm_state);
            }
        }

        // Fall back to default permission
        let state = conn.query_row(
            "SELECT state FROM permissions
             WHERE permission_type = ?1 AND pattern IS NULL",
            [permission_type.as_str()],
            |row| {
                let state_str: String = row.get(0)?;
                Ok(PermissionState::from_str(&state_str))
            },
        )?;

        match state {
            Some(perm_state) => Ok(perm_state),
            None => {
                warn!(
                    "No permission found for {:?}, defaulting to Prompt",
                    permission_type
                );
                Ok(PermissionState::Prompt)
            }
        }
    }

    /// Set permission state for a permission type
    pub fn set_permission(
        &self,
        permission_type: PermissionType,
        state: PermissionState,
        pattern: Option<String>,
    ) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO permissions (permission_type, state, pattern, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(permission_type, pattern)
             DO UPDATE SET state = ?2, updated_at = ?5",
            rusqlite::params![permission_type.as_str(), state.as_str(), pattern, now, now],
        )?;

        info!(
            "Permission updated: {:?} set to {:?} (pattern: {:?})",
            permission_type, state, pattern
        );

        Ok(())
    }

    /// Get all permissions
    pub fn get_all_permissions(&self) -> Result<Vec<Permission>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        let mut stmt = conn.prepare(
            "SELECT id, permission_type, state, pattern, created_at, updated_at
             FROM permissions
             ORDER BY permission_type",
        )?;

        let permissions = stmt
            .query_map([], |row| {
                let perm_type_str: String = row.get(1)?;
                let state_str: String = row.get(2)?;
                let pattern: Option<String> = row.get(3)?;
                let created_str: String = row.get(4)?;
                let updated_str: String = row.get(5)?;

                Ok(Permission {
                    id: row.get(0)?,
                    permission_type: PermissionType::from_str(&perm_type_str)
                        .unwrap_or(PermissionType::FileRead),
                    state: PermissionState::from_str(&state_str).unwrap_or(PermissionState::Prompt),
                    pattern,
                    created_at: chrono::DateTime::parse_from_rfc3339(&created_str)
                        .unwrap()
                        .with_timezone(&Utc),
                    updated_at: chrono::DateTime::parse_from_rfc3339(&updated_str)
                        .unwrap()
                        .with_timezone(&Utc),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(permissions)
    }

    /// Reset all permissions to defaults
    pub fn reset_permissions(&self) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| Error::Other(format!("Failed to acquire database lock: {}", e)))?;

        // Delete all permissions
        conn.execute("DELETE FROM permissions", [])?;

        // Re-insert defaults
        let default_permissions = vec![
            (PermissionType::FileRead, PermissionState::Prompt),
            (PermissionType::FileWrite, PermissionState::Prompt),
            (PermissionType::FileDelete, PermissionState::Prompt),
            (PermissionType::FileExecute, PermissionState::Prompt),
            (PermissionType::CommandExecute, PermissionState::Prompt),
            (PermissionType::AppLaunch, PermissionState::Prompt),
            (PermissionType::AppTerminate, PermissionState::Prompt),
            (PermissionType::ClipboardRead, PermissionState::Allowed),
            (PermissionType::ClipboardWrite, PermissionState::Allowed),
            (PermissionType::ProcessList, PermissionState::Allowed),
            (PermissionType::ProcessTerminate, PermissionState::Prompt),
        ];

        let now = Utc::now().to_rfc3339();

        for (perm_type, state) in default_permissions {
            conn.execute(
                "INSERT INTO permissions (permission_type, state, pattern, created_at, updated_at)
                 VALUES (?1, ?2, NULL, ?3, ?4)",
                rusqlite::params![perm_type.as_str(), state.as_str(), now, now],
            )?;
        }

        info!("All permissions reset to defaults");

        Ok(())
    }

    /// Check if permission should prompt user
    pub fn requires_prompt(
        &self,
        permission_type: PermissionType,
        pattern: Option<&str>,
    ) -> Result<bool> {
        let state = self.check_permission(permission_type, pattern)?;
        Ok(matches!(
            state,
            PermissionState::Prompt | PermissionState::PromptOnce
        ))
    }

    /// Check if permission is denied
    pub fn is_denied(
        &self,
        permission_type: PermissionType,
        pattern: Option<&str>,
    ) -> Result<bool> {
        let state = self.check_permission(permission_type, pattern)?;
        Ok(state == PermissionState::Denied)
    }

    /// Check if permission is allowed
    pub fn is_allowed(
        &self,
        permission_type: PermissionType,
        pattern: Option<&str>,
    ) -> Result<bool> {
        let state = self.check_permission(permission_type, pattern)?;
        Ok(state == PermissionState::Allowed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> PermissionManager {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        // Create permissions table
        conn.execute(
            "CREATE TABLE permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                permission_type TEXT NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('allowed', 'prompt', 'prompt_once', 'denied')),
                pattern TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(permission_type, pattern)
            )",
            [],
        )
        .unwrap();

        PermissionManager::new(conn)
    }

    #[test]
    fn test_set_and_check_permission() {
        let pm = setup_test_db();

        pm.set_permission(PermissionType::FileRead, PermissionState::Allowed, None)
            .unwrap();

        let state = pm.check_permission(PermissionType::FileRead, None).unwrap();
        assert_eq!(state, PermissionState::Allowed);
    }

    #[test]
    fn test_pattern_specific_permission() {
        let pm = setup_test_db();

        // Set default to prompt
        pm.set_permission(PermissionType::FileRead, PermissionState::Prompt, None)
            .unwrap();

        // Set pattern-specific to allowed
        pm.set_permission(
            PermissionType::FileRead,
            PermissionState::Allowed,
            Some("/safe/path".to_string()),
        )
        .unwrap();

        // Check pattern-specific permission
        let state = pm
            .check_permission(PermissionType::FileRead, Some("/safe/path"))
            .unwrap();
        assert_eq!(state, PermissionState::Allowed);

        // Check default permission
        let state = pm.check_permission(PermissionType::FileRead, None).unwrap();
        assert_eq!(state, PermissionState::Prompt);
    }

    #[test]
    fn test_requires_prompt() {
        let pm = setup_test_db();

        pm.set_permission(PermissionType::FileWrite, PermissionState::Prompt, None)
            .unwrap();

        assert!(pm.requires_prompt(PermissionType::FileWrite, None).unwrap());
    }

    #[test]
    fn test_is_denied() {
        let pm = setup_test_db();

        pm.set_permission(PermissionType::FileDelete, PermissionState::Denied, None)
            .unwrap();

        assert!(pm.is_denied(PermissionType::FileDelete, None).unwrap());
    }

    #[test]
    fn test_is_allowed() {
        let pm = setup_test_db();

        pm.set_permission(
            PermissionType::ClipboardRead,
            PermissionState::Allowed,
            None,
        )
        .unwrap();

        assert!(pm.is_allowed(PermissionType::ClipboardRead, None).unwrap());
    }

    #[test]
    fn test_reset_permissions() {
        let pm = setup_test_db();

        // Set some custom permissions
        pm.set_permission(PermissionType::FileRead, PermissionState::Allowed, None)
            .unwrap();

        // Reset
        pm.reset_permissions().unwrap();

        // Check that defaults are restored
        let state = pm.check_permission(PermissionType::FileRead, None).unwrap();
        assert_eq!(state, PermissionState::Prompt);

        let state = pm
            .check_permission(PermissionType::ClipboardRead, None)
            .unwrap();
        assert_eq!(state, PermissionState::Allowed);
    }
}
