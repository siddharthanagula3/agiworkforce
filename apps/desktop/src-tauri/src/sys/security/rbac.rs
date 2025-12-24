use anyhow::{anyhow, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use super::auth::UserRole;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Permission {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub category: String,
}

pub struct RBACManager {
    db: Arc<parking_lot::Mutex<Connection>>,

    role_permissions_cache: Arc<parking_lot::RwLock<HashMap<UserRole, HashSet<String>>>>,
}

impl RBACManager {
    pub fn new(db: Arc<parking_lot::Mutex<Connection>>) -> Self {
        let manager = Self {
            db,
            role_permissions_cache: Arc::new(parking_lot::RwLock::new(HashMap::new())),
        };

        let _ = manager.refresh_cache();

        manager
    }

    pub fn refresh_cache(&self) -> Result<()> {
        let db = self.db.lock();
        let mut cache = self.role_permissions_cache.write();
        cache.clear();

        let mut stmt = db.prepare(
            "SELECT rp.role, p.name
             FROM role_permissions rp
             JOIN permissions p ON rp.permission_id = p.id
             WHERE rp.granted = 1",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;

        for row in rows {
            let (role_str, permission_name) = row?;
            if let Some(role) = UserRole::from_str(&role_str) {
                cache.entry(role).or_default().insert(permission_name);
            }
        }

        Ok(())
    }

    pub fn has_permission(&self, user_id: &str, permission_name: &str) -> Result<bool> {
        let db = self.db.lock();

        let user_override: Option<bool> = db
            .query_row(
                "SELECT up.granted FROM user_permissions up
                 JOIN permissions p ON up.permission_id = p.id
                 WHERE up.user_id = ?1 AND p.name = ?2",
                params![user_id, permission_name],
                |row| {
                    let granted: i32 = row.get(0)?;
                    Ok(granted != 0)
                },
            )
            .optional()?;

        if let Some(granted) = user_override {
            return Ok(granted);
        }

        let role: UserRole =
            db.query_row("SELECT role FROM users WHERE id = ?1", [user_id], |row| {
                let role_str: String = row.get(0)?;
                Ok(UserRole::from_str(&role_str).unwrap_or(UserRole::Viewer))
            })?;

        let cache = self.role_permissions_cache.read();
        let role_perms = cache.get(&role);

        match role_perms {
            Some(perms) => Ok(perms.contains(permission_name)),
            None => Ok(false),
        }
    }

    pub fn has_all_permissions(&self, user_id: &str, permission_names: &[&str]) -> Result<bool> {
        for perm in permission_names {
            if !self.has_permission(user_id, perm)? {
                return Ok(false);
            }
        }
        Ok(true)
    }

    pub fn has_any_permission(&self, user_id: &str, permission_names: &[&str]) -> Result<bool> {
        for perm in permission_names {
            if self.has_permission(user_id, perm)? {
                return Ok(true);
            }
        }
        Ok(false)
    }

    pub fn get_user_permissions(&self, user_id: &str) -> Result<Vec<String>> {
        let db = self.db.lock();

        let role: UserRole =
            db.query_row("SELECT role FROM users WHERE id = ?1", [user_id], |row| {
                let role_str: String = row.get(0)?;
                Ok(UserRole::from_str(&role_str).unwrap_or(UserRole::Viewer))
            })?;

        let mut permissions = HashSet::new();

        let cache = self.role_permissions_cache.read();
        if let Some(role_perms) = cache.get(&role) {
            permissions.extend(role_perms.iter().cloned());
        }

        let mut stmt = db.prepare(
            "SELECT p.name, up.granted FROM user_permissions up
             JOIN permissions p ON up.permission_id = p.id
             WHERE up.user_id = ?1",
        )?;

        let overrides = stmt.query_map([user_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)? != 0))
        })?;

        for override_result in overrides {
            let (perm_name, granted) = override_result?;
            if granted {
                permissions.insert(perm_name);
            } else {
                permissions.remove(&perm_name);
            }
        }

        Ok(permissions.into_iter().collect())
    }

    pub fn grant_user_permission(&self, user_id: &str, permission_name: &str) -> Result<()> {
        let db = self.db.lock();

        let permission_id: String = db.query_row(
            "SELECT id FROM permissions WHERE name = ?1",
            [permission_name],
            |row| row.get(0),
        )?;

        db.execute(
            "INSERT INTO user_permissions (user_id, permission_id, granted, created_at)
             VALUES (?1, ?2, 1, datetime('now'))
             ON CONFLICT(user_id, permission_id) DO UPDATE SET granted = 1",
            params![user_id, &permission_id],
        )?;

        Ok(())
    }

    pub fn revoke_user_permission(&self, user_id: &str, permission_name: &str) -> Result<()> {
        let db = self.db.lock();

        let permission_id: String = db.query_row(
            "SELECT id FROM permissions WHERE name = ?1",
            [permission_name],
            |row| row.get(0),
        )?;

        db.execute(
            "INSERT INTO user_permissions (user_id, permission_id, granted, created_at)
             VALUES (?1, ?2, 0, datetime('now'))
             ON CONFLICT(user_id, permission_id) DO UPDATE SET granted = 0",
            params![user_id, &permission_id],
        )?;

        Ok(())
    }

    pub fn remove_user_permission_override(
        &self,
        user_id: &str,
        permission_name: &str,
    ) -> Result<()> {
        let db = self.db.lock();

        db.execute(
            "DELETE FROM user_permissions
             WHERE user_id = ?1 AND permission_id = (
                 SELECT id FROM permissions WHERE name = ?2
             )",
            params![user_id, permission_name],
        )?;

        Ok(())
    }

    pub fn list_permissions(&self) -> Result<Vec<Permission>> {
        let db = self.db.lock();

        let mut stmt = db.prepare(
            "SELECT id, name, description, category FROM permissions ORDER BY category, name",
        )?;

        let permissions = stmt
            .query_map([], |row| {
                Ok(Permission {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    category: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(permissions)
    }

    pub fn list_permissions_by_category(&self, category: &str) -> Result<Vec<Permission>> {
        let db = self.db.lock();

        let mut stmt = db.prepare(
            "SELECT id, name, description, category FROM permissions
             WHERE category = ?1 ORDER BY name",
        )?;

        let permissions = stmt
            .query_map([category], |row| {
                Ok(Permission {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    category: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(permissions)
    }

    pub fn get_role_permissions(&self, role: UserRole) -> Result<Vec<String>> {
        let cache = self.role_permissions_cache.read();

        match cache.get(&role) {
            Some(perms) => Ok(perms.iter().cloned().collect()),
            None => Ok(vec![]),
        }
    }

    pub fn is_admin(&self, user_id: &str) -> Result<bool> {
        let db = self.db.lock();

        let role: UserRole =
            db.query_row("SELECT role FROM users WHERE id = ?1", [user_id], |row| {
                let role_str: String = row.get(0)?;
                Ok(UserRole::from_str(&role_str).unwrap_or(UserRole::Viewer))
            })?;

        Ok(role == UserRole::Admin)
    }

    pub fn require_permission(&self, user_id: &str, permission_name: &str) -> Result<()> {
        if !self.has_permission(user_id, permission_name)? {
            return Err(anyhow!(
                "Insufficient permissions: {} required",
                permission_name
            ));
        }
        Ok(())
    }

    pub fn require_admin(&self, user_id: &str) -> Result<()> {
        if !self.is_admin(user_id)? {
            return Err(anyhow!("Admin privileges required"));
        }
        Ok(())
    }
}

#[macro_export]
macro_rules! require_permission {
    ($rbac:expr, $user_id:expr, $permission:expr) => {
        $rbac
            .require_permission($user_id, $permission)
            .map_err(|e| e.to_string())?
    };
}

#[macro_export]
macro_rules! require_admin {
    ($rbac:expr, $user_id:expr) => {
        $rbac.require_admin($user_id).map_err(|e| e.to_string())?
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Arc<parking_lot::Mutex<Connection>> {
        let conn = Connection::open_in_memory().unwrap();
        crate::data::db::migrations::run_migrations(&conn).unwrap();
        Arc::new(parking_lot::Mutex::new(conn))
    }

    #[test]
    fn test_role_permissions() {
        let db = setup_test_db();
        let rbac = RBACManager::new(db.clone());

        let user_id = "test_user_id";
        {
            let conn = db.lock();
            conn.execute(
                "INSERT INTO users (id, email, password_hash, role, created_at)
                 VALUES (?1, ?2, ?3, ?4, datetime('now'))",
                params![user_id, "test@example.com", "hash", "editor"],
            )
            .unwrap();
        }

        assert!(rbac.has_permission(user_id, "chat:write").unwrap());

        assert!(!rbac
            .has_permission(user_id, "admin:user_management")
            .unwrap());
    }

    #[test]
    fn test_user_permission_override() {
        let db = setup_test_db();
        let rbac = RBACManager::new(db.clone());

        let user_id = "test_user_id";
        {
            let conn = db.lock();
            conn.execute(
                "INSERT INTO users (id, email, password_hash, role, created_at)
                 VALUES (?1, ?2, ?3, ?4, datetime('now'))",
                params![user_id, "test@example.com", "hash", "viewer"],
            )
            .unwrap();
        }

        assert!(!rbac.has_permission(user_id, "chat:write").unwrap());

        rbac.grant_user_permission(user_id, "chat:write").unwrap();

        assert!(rbac.has_permission(user_id, "chat:write").unwrap());

        rbac.revoke_user_permission(user_id, "chat:write").unwrap();

        assert!(!rbac.has_permission(user_id, "chat:write").unwrap());
    }

    #[test]
    fn test_list_permissions() {
        let db = setup_test_db();
        let rbac = RBACManager::new(db);

        let permissions = rbac.list_permissions().unwrap();
        assert!(!permissions.is_empty());

        assert!(permissions.iter().any(|p| p.name == "chat:read"));
        assert!(permissions.iter().any(|p| p.name == "chat:write"));
    }

    #[test]
    fn test_admin_check() {
        let db = setup_test_db();
        let rbac = RBACManager::new(db.clone());

        let admin_id = "admin_user_id";
        {
            let conn = db.lock();
            conn.execute(
                "INSERT INTO users (id, email, password_hash, role, created_at)
                 VALUES (?1, ?2, ?3, ?4, datetime('now'))",
                params![admin_id, "admin@example.com", "hash", "admin"],
            )
            .unwrap();
        }

        assert!(rbac.is_admin(admin_id).unwrap());

        assert!(rbac
            .has_permission(admin_id, "admin:user_management")
            .unwrap());
        assert!(rbac
            .has_permission(admin_id, "admin:system_config")
            .unwrap());
    }
}
