//! Extension repository (database persistence)
//!
//! Handles storage and retrieval of extension metadata in SQLite.
//! Uses the same database as the rest of the application.

use super::{ExtensionError, ExtensionManifest, ExtensionResult};
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Status of an installed extension
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ExtensionStatus {
    /// Extension is installed but not enabled
    #[default]
    Disabled,

    /// Extension is enabled and ready to use
    Enabled,

    /// Extension is currently running
    Running,

    /// Extension failed to start
    Error,

    /// Extension is being updated
    Updating,

    /// Extension is pending removal
    PendingRemoval,
}

impl std::fmt::Display for ExtensionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Disabled => write!(f, "disabled"),
            Self::Enabled => write!(f, "enabled"),
            Self::Running => write!(f, "running"),
            Self::Error => write!(f, "error"),
            Self::Updating => write!(f, "updating"),
            Self::PendingRemoval => write!(f, "pending_removal"),
        }
    }
}

impl std::str::FromStr for ExtensionStatus {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "disabled" => Ok(Self::Disabled),
            "enabled" => Ok(Self::Enabled),
            "running" => Ok(Self::Running),
            "error" => Ok(Self::Error),
            "updating" => Ok(Self::Updating),
            "pending_removal" => Ok(Self::PendingRemoval),
            _ => Err(format!("Unknown status: {}", s)),
        }
    }
}

/// Database record for an installed extension
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionRecord {
    /// Extension ID (from manifest)
    pub id: String,

    /// Extension name
    pub name: String,

    /// Installed version
    pub version: String,

    /// Extension description
    pub description: String,

    /// Author
    pub author: String,

    /// Installation path
    pub install_path: PathBuf,

    /// Raw manifest JSON
    pub manifest_json: String,

    /// Current status
    pub status: ExtensionStatus,

    /// Last error message (if status is Error)
    pub last_error: Option<String>,

    /// User configuration values (JSON)
    pub config_json: Option<String>,

    /// Package SHA-256 hash
    pub package_hash: String,

    /// Installation timestamp
    pub installed_at: DateTime<Utc>,

    /// Last updated timestamp
    pub updated_at: DateTime<Utc>,

    /// Last time the extension was started
    pub last_started_at: Option<DateTime<Utc>>,

    /// Number of times the extension has been used
    pub use_count: u64,
}

/// Repository for managing extension persistence
pub struct ExtensionRepository {
    conn: Arc<Mutex<Connection>>,
}

impl ExtensionRepository {
    /// Create a new repository with the given database connection
    pub fn new(conn: Arc<Mutex<Connection>>) -> ExtensionResult<Self> {
        let repo = Self { conn };
        repo.ensure_tables()?;
        Ok(repo)
    }

    /// Ensure the required tables exist
    fn ensure_tables(&self) -> ExtensionResult<()> {
        let conn = self.conn.lock().map_err(|e| {
            ExtensionError::DatabaseError(format!("Failed to lock database: {}", e))
        })?;

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS mcp_extensions (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                version TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                author TEXT NOT NULL DEFAULT '',
                install_path TEXT NOT NULL,
                manifest_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'disabled',
                last_error TEXT,
                config_json TEXT,
                package_hash TEXT NOT NULL,
                installed_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_started_at TEXT,
                use_count INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_mcp_extensions_status ON mcp_extensions(status);
            CREATE INDEX IF NOT EXISTS idx_mcp_extensions_name ON mcp_extensions(name);
            "#,
        )?;

        Ok(())
    }

    /// Insert a new extension record
    pub fn insert(&self, record: &ExtensionRecord) -> ExtensionResult<()> {
        let conn = self.conn.lock().map_err(|e| {
            ExtensionError::DatabaseError(format!("Failed to lock database: {}", e))
        })?;

        conn.execute(
            r#"
            INSERT INTO mcp_extensions (
                id, name, version, description, author, install_path,
                manifest_json, status, last_error, config_json, package_hash,
                installed_at, updated_at, last_started_at, use_count
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            "#,
            params![
                record.id,
                record.name,
                record.version,
                record.description,
                record.author,
                record.install_path.to_string_lossy(),
                record.manifest_json,
                record.status.to_string(),
                record.last_error,
                record.config_json,
                record.package_hash,
                record.installed_at.to_rfc3339(),
                record.updated_at.to_rfc3339(),
                record.last_started_at.map(|dt| dt.to_rfc3339()),
                record.use_count as i64,
            ],
        )?;

        Ok(())
    }

    /// Update an existing extension record
    pub fn update(&self, record: &ExtensionRecord) -> ExtensionResult<()> {
        let conn = self.conn.lock().map_err(|e| {
            ExtensionError::DatabaseError(format!("Failed to lock database: {}", e))
        })?;

        let rows = conn.execute(
            r#"
            UPDATE mcp_extensions SET
                name = ?2,
                version = ?3,
                description = ?4,
                author = ?5,
                install_path = ?6,
                manifest_json = ?7,
                status = ?8,
                last_error = ?9,
                config_json = ?10,
                package_hash = ?11,
                updated_at = ?12,
                last_started_at = ?13,
                use_count = ?14
            WHERE id = ?1
            "#,
            params![
                record.id,
                record.name,
                record.version,
                record.description,
                record.author,
                record.install_path.to_string_lossy(),
                record.manifest_json,
                record.status.to_string(),
                record.last_error,
                record.config_json,
                record.package_hash,
                record.updated_at.to_rfc3339(),
                record.last_started_at.map(|dt| dt.to_rfc3339()),
                record.use_count as i64,
            ],
        )?;

        if rows == 0 {
            return Err(ExtensionError::NotFound(record.id.clone()));
        }

        Ok(())
    }

    /// Get an extension by ID
    pub fn get(&self, id: &str) -> ExtensionResult<Option<ExtensionRecord>> {
        let conn = self.conn.lock().map_err(|e| {
            ExtensionError::DatabaseError(format!("Failed to lock database: {}", e))
        })?;

        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, version, description, author, install_path,
                   manifest_json, status, last_error, config_json, package_hash,
                   installed_at, updated_at, last_started_at, use_count
            FROM mcp_extensions
            WHERE id = ?1
            "#,
        )?;

        let result = stmt.query_row([id], |row| {
            Ok(ExtensionRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                version: row.get(2)?,
                description: row.get(3)?,
                author: row.get(4)?,
                install_path: PathBuf::from(row.get::<_, String>(5)?),
                manifest_json: row.get(6)?,
                status: row
                    .get::<_, String>(7)?
                    .parse()
                    .unwrap_or(ExtensionStatus::Disabled),
                last_error: row.get(8)?,
                config_json: row.get(9)?,
                package_hash: row.get(10)?,
                installed_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(11)?)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(12)?)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now()),
                last_started_at: row.get::<_, Option<String>>(13)?.and_then(|s| {
                    DateTime::parse_from_rfc3339(&s)
                        .map(|dt| dt.with_timezone(&Utc))
                        .ok()
                }),
                use_count: row.get::<_, i64>(14)? as u64,
            })
        });

        match result {
            Ok(record) => Ok(Some(record)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    /// Get all installed extensions
    pub fn list_all(&self) -> ExtensionResult<Vec<ExtensionRecord>> {
        let conn = self.conn.lock().map_err(|e| {
            ExtensionError::DatabaseError(format!("Failed to lock database: {}", e))
        })?;

        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, version, description, author, install_path,
                   manifest_json, status, last_error, config_json, package_hash,
                   installed_at, updated_at, last_started_at, use_count
            FROM mcp_extensions
            ORDER BY name ASC
            "#,
        )?;

        let records = stmt
            .query_map([], |row| {
                Ok(ExtensionRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    version: row.get(2)?,
                    description: row.get(3)?,
                    author: row.get(4)?,
                    install_path: PathBuf::from(row.get::<_, String>(5)?),
                    manifest_json: row.get(6)?,
                    status: row
                        .get::<_, String>(7)?
                        .parse()
                        .unwrap_or(ExtensionStatus::Disabled),
                    last_error: row.get(8)?,
                    config_json: row.get(9)?,
                    package_hash: row.get(10)?,
                    installed_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(11)?)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                    updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(12)?)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                    last_started_at: row.get::<_, Option<String>>(13)?.and_then(|s| {
                        DateTime::parse_from_rfc3339(&s)
                            .map(|dt| dt.with_timezone(&Utc))
                            .ok()
                    }),
                    use_count: row.get::<_, i64>(14)? as u64,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(records)
    }

    /// Get extensions by status
    pub fn list_by_status(&self, status: ExtensionStatus) -> ExtensionResult<Vec<ExtensionRecord>> {
        let conn = self.conn.lock().map_err(|e| {
            ExtensionError::DatabaseError(format!("Failed to lock database: {}", e))
        })?;

        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, version, description, author, install_path,
                   manifest_json, status, last_error, config_json, package_hash,
                   installed_at, updated_at, last_started_at, use_count
            FROM mcp_extensions
            WHERE status = ?1
            ORDER BY name ASC
            "#,
        )?;

        let records = stmt
            .query_map([status.to_string()], |row| {
                Ok(ExtensionRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    version: row.get(2)?,
                    description: row.get(3)?,
                    author: row.get(4)?,
                    install_path: PathBuf::from(row.get::<_, String>(5)?),
                    manifest_json: row.get(6)?,
                    status: row
                        .get::<_, String>(7)?
                        .parse()
                        .unwrap_or(ExtensionStatus::Disabled),
                    last_error: row.get(8)?,
                    config_json: row.get(9)?,
                    package_hash: row.get(10)?,
                    installed_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(11)?)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                    updated_at: DateTime::parse_from_rfc3339(&row.get::<_, String>(12)?)
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(|_| Utc::now()),
                    last_started_at: row.get::<_, Option<String>>(13)?.and_then(|s| {
                        DateTime::parse_from_rfc3339(&s)
                            .map(|dt| dt.with_timezone(&Utc))
                            .ok()
                    }),
                    use_count: row.get::<_, i64>(14)? as u64,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(records)
    }

    /// Delete an extension record
    pub fn delete(&self, id: &str) -> ExtensionResult<bool> {
        let conn = self.conn.lock().map_err(|e| {
            ExtensionError::DatabaseError(format!("Failed to lock database: {}", e))
        })?;

        let rows = conn.execute("DELETE FROM mcp_extensions WHERE id = ?1", [id])?;

        Ok(rows > 0)
    }

    /// Update extension status
    pub fn update_status(
        &self,
        id: &str,
        status: ExtensionStatus,
        error: Option<&str>,
    ) -> ExtensionResult<()> {
        let conn = self.conn.lock().map_err(|e| {
            ExtensionError::DatabaseError(format!("Failed to lock database: {}", e))
        })?;

        let now = Utc::now().to_rfc3339();
        let rows = conn.execute(
            r#"
            UPDATE mcp_extensions
            SET status = ?2, last_error = ?3, updated_at = ?4
            WHERE id = ?1
            "#,
            params![id, status.to_string(), error, now],
        )?;

        if rows == 0 {
            return Err(ExtensionError::NotFound(id.to_string()));
        }

        Ok(())
    }

    /// Update extension configuration
    pub fn update_config(
        &self,
        id: &str,
        config: &HashMap<String, serde_json::Value>,
    ) -> ExtensionResult<()> {
        let conn = self.conn.lock().map_err(|e| {
            ExtensionError::DatabaseError(format!("Failed to lock database: {}", e))
        })?;

        let config_json = serde_json::to_string(config)?;
        let now = Utc::now().to_rfc3339();

        let rows = conn.execute(
            r#"
            UPDATE mcp_extensions
            SET config_json = ?2, updated_at = ?3
            WHERE id = ?1
            "#,
            params![id, config_json, now],
        )?;

        if rows == 0 {
            return Err(ExtensionError::NotFound(id.to_string()));
        }

        Ok(())
    }

    /// Increment use count and update last started time
    pub fn record_start(&self, id: &str) -> ExtensionResult<()> {
        let conn = self.conn.lock().map_err(|e| {
            ExtensionError::DatabaseError(format!("Failed to lock database: {}", e))
        })?;

        let now = Utc::now().to_rfc3339();

        let rows = conn.execute(
            r#"
            UPDATE mcp_extensions
            SET use_count = use_count + 1,
                last_started_at = ?2,
                updated_at = ?2
            WHERE id = ?1
            "#,
            params![id, now],
        )?;

        if rows == 0 {
            return Err(ExtensionError::NotFound(id.to_string()));
        }

        Ok(())
    }

    /// Check if an extension exists
    pub fn exists(&self, id: &str) -> ExtensionResult<bool> {
        let conn = self.conn.lock().map_err(|e| {
            ExtensionError::DatabaseError(format!("Failed to lock database: {}", e))
        })?;

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM mcp_extensions WHERE id = ?1",
            [id],
            |row| row.get(0),
        )?;

        Ok(count > 0)
    }

    /// Get the parsed manifest for an extension
    pub fn get_manifest(&self, id: &str) -> ExtensionResult<Option<ExtensionManifest>> {
        let record = self.get(id)?;

        match record {
            Some(rec) => {
                let manifest: ExtensionManifest = serde_json::from_str(&rec.manifest_json)?;
                Ok(Some(manifest))
            }
            None => Ok(None),
        }
    }

    /// Get configuration for an extension
    pub fn get_config(&self, id: &str) -> ExtensionResult<HashMap<String, serde_json::Value>> {
        let record = self.get(id)?;

        match record {
            Some(rec) => match rec.config_json {
                Some(json) => {
                    let config: HashMap<String, serde_json::Value> = serde_json::from_str(&json)?;
                    Ok(config)
                }
                None => Ok(HashMap::new()),
            },
            None => Err(ExtensionError::NotFound(id.to_string())),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_repo() -> ExtensionRepository {
        let conn = Connection::open_in_memory().unwrap();
        ExtensionRepository::new(Arc::new(Mutex::new(conn))).unwrap()
    }

    fn create_test_record() -> ExtensionRecord {
        ExtensionRecord {
            id: "test-extension".to_string(),
            name: "Test Extension".to_string(),
            version: "1.0.0".to_string(),
            description: "A test extension".to_string(),
            author: "Test Author".to_string(),
            install_path: PathBuf::from("/tmp/extensions/test-extension"),
            manifest_json: r#"{"id":"test-extension","name":"Test Extension","version":"1.0.0","description":"A test extension"}"#.to_string(),
            status: ExtensionStatus::Disabled,
            last_error: None,
            config_json: None,
            package_hash: "abc123".to_string(),
            installed_at: Utc::now(),
            updated_at: Utc::now(),
            last_started_at: None,
            use_count: 0,
        }
    }

    #[test]
    fn test_insert_and_get() {
        let repo = create_test_repo();
        let record = create_test_record();

        repo.insert(&record).unwrap();

        let retrieved = repo.get(&record.id).unwrap().unwrap();
        assert_eq!(retrieved.id, record.id);
        assert_eq!(retrieved.name, record.name);
        assert_eq!(retrieved.version, record.version);
    }

    #[test]
    fn test_update_status() {
        let repo = create_test_repo();
        let record = create_test_record();

        repo.insert(&record).unwrap();
        repo.update_status(&record.id, ExtensionStatus::Enabled, None)
            .unwrap();

        let retrieved = repo.get(&record.id).unwrap().unwrap();
        assert_eq!(retrieved.status, ExtensionStatus::Enabled);
    }

    #[test]
    fn test_delete() {
        let repo = create_test_repo();
        let record = create_test_record();

        repo.insert(&record).unwrap();
        assert!(repo.exists(&record.id).unwrap());

        let deleted = repo.delete(&record.id).unwrap();
        assert!(deleted);
        assert!(!repo.exists(&record.id).unwrap());
    }

    #[test]
    fn test_list_by_status() {
        let repo = create_test_repo();

        let mut record1 = create_test_record();
        record1.id = "ext-1".to_string();
        record1.status = ExtensionStatus::Enabled;

        let mut record2 = create_test_record();
        record2.id = "ext-2".to_string();
        record2.status = ExtensionStatus::Disabled;

        repo.insert(&record1).unwrap();
        repo.insert(&record2).unwrap();

        let enabled = repo.list_by_status(ExtensionStatus::Enabled).unwrap();
        assert_eq!(enabled.len(), 1);
        assert_eq!(enabled[0].id, "ext-1");
    }
}
