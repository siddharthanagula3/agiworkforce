use crate::settings::models::{Setting, SettingCategory, SettingValue};
use chrono::Utc;
use rusqlite::{Connection, Result, Row};

/// Create or update a setting
pub fn upsert_setting(
    conn: &Connection,
    key: String,
    value: SettingValue,
    category: SettingCategory,
    encrypted: bool,
) -> Result<()> {
    let value_json = value
        .to_json_string()
        .unwrap_or_else(|_| "null".to_string());
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            category = excluded.category,
            encrypted = excluded.encrypted,
            updated_at = excluded.updated_at",
        rusqlite::params![key, value_json, category.as_str(), encrypted as i32, now],
    )?;

    Ok(())
}

/// Batch upsert multiple settings
pub fn upsert_settings_batch(
    conn: &Connection,
    settings: Vec<(String, SettingValue, SettingCategory, bool)>,
) -> Result<()> {
    let tx = conn.unchecked_transaction()?;

    for (key, value, category, encrypted) in settings {
        let value_json = value
            .to_json_string()
            .unwrap_or_else(|_| "null".to_string());
        let now = Utc::now().to_rfc3339();

        tx.execute(
            "INSERT INTO settings_v2 (key, value, category, encrypted, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)
             ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                category = excluded.category,
                encrypted = excluded.encrypted,
                updated_at = excluded.updated_at",
            rusqlite::params![key, value_json, category.as_str(), encrypted as i32, now],
        )?;
    }

    tx.commit()?;
    Ok(())
}

/// Get a single setting by key
pub fn get_setting(conn: &Connection, key: &str) -> Result<Setting> {
    conn.query_row(
        "SELECT key, value, category, encrypted, created_at, updated_at
         FROM settings_v2
         WHERE key = ?1",
        [key],
        map_setting_row,
    )
}

/// Get all settings in a category
pub fn get_settings_by_category(
    conn: &Connection,
    category: SettingCategory,
) -> Result<Vec<Setting>> {
    let mut stmt = conn.prepare(
        "SELECT key, value, category, encrypted, created_at, updated_at
         FROM settings_v2
         WHERE category = ?1
         ORDER BY key",
    )?;

    let settings = stmt
        .query_map(rusqlite::params![category.as_str()], map_setting_row)?
        .collect::<Result<Vec<_>>>()?;

    Ok(settings)
}

/// Get all settings
pub fn list_all_settings(conn: &Connection) -> Result<Vec<Setting>> {
    let mut stmt = conn.prepare(
        "SELECT key, value, category, encrypted, created_at, updated_at
         FROM settings_v2
         ORDER BY category, key",
    )?;

    let settings = stmt
        .query_map([], map_setting_row)?
        .collect::<Result<Vec<_>>>()?;

    Ok(settings)
}

/// Get settings matching a key prefix
pub fn get_settings_by_prefix(conn: &Connection, prefix: &str) -> Result<Vec<Setting>> {
    let mut stmt = conn.prepare(
        "SELECT key, value, category, encrypted, created_at, updated_at
         FROM settings_v2
         WHERE key LIKE ?1
         ORDER BY key",
    )?;

    let pattern = format!("{}%", prefix);
    let settings = stmt
        .query_map(rusqlite::params![pattern], map_setting_row)?
        .collect::<Result<Vec<_>>>()?;

    Ok(settings)
}

/// Delete a setting by key
pub fn delete_setting(conn: &Connection, key: &str) -> Result<usize> {
    conn.execute("DELETE FROM settings_v2 WHERE key = ?1", [key])
}

/// Delete all settings in a category
pub fn delete_settings_by_category(conn: &Connection, category: SettingCategory) -> Result<usize> {
    conn.execute(
        "DELETE FROM settings_v2 WHERE category = ?1",
        rusqlite::params![category.as_str()],
    )
}

/// Delete settings matching a key prefix
pub fn delete_settings_by_prefix(conn: &Connection, prefix: &str) -> Result<usize> {
    let pattern = format!("{}%", prefix);
    conn.execute(
        "DELETE FROM settings_v2 WHERE key LIKE ?1",
        rusqlite::params![pattern],
    )
}

/// Check if a setting exists
pub fn setting_exists(conn: &Connection, key: &str) -> Result<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM settings_v2 WHERE key = ?1",
        [key],
        |row| row.get(0),
    )?;

    Ok(count > 0)
}

/// Get count of settings by category
pub fn count_settings_by_category(conn: &Connection) -> Result<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT category, COUNT(*) as count
         FROM settings_v2
         GROUP BY category
         ORDER BY category",
    )?;

    let counts = stmt
        .query_map([], |row| {
            let category: String = row.get(0)?;
            let count: i64 = row.get(1)?;
            Ok((category, count))
        })?
        .collect::<Result<Vec<_>>>()?;

    Ok(counts)
}

/// Helper function to map database row to Setting
fn map_setting_row(row: &Row) -> Result<Setting> {
    let created_at_str: String = row.get(4)?;
    let updated_at_str: String = row.get(5)?;
    let category_str: String = row.get(2)?;
    let encrypted_int: i32 = row.get(3)?;

    Ok(Setting {
        key: row.get(0)?,
        value: row.get(1)?,
        category: SettingCategory::from_str(&category_str).unwrap_or(SettingCategory::System),
        encrypted: encrypted_int != 0,
        created_at: created_at_str.parse().unwrap_or_else(|_| Utc::now()),
        updated_at: updated_at_str.parse().unwrap_or_else(|_| Utc::now()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();

        // Create settings table
        conn.execute(
            "CREATE TABLE settings_v2 (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                category TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_upsert_and_get_setting() {
        let conn = setup_test_db();

        // Insert
        upsert_setting(
            &conn,
            "test_key".to_string(),
            SettingValue::String("test_value".to_string()),
            SettingCategory::System,
            false,
        )
        .unwrap();

        // Get
        let setting = get_setting(&conn, "test_key").unwrap();
        assert_eq!(setting.key, "test_key");
        assert_eq!(setting.category, SettingCategory::System);
        assert!(!setting.encrypted);

        // Update
        upsert_setting(
            &conn,
            "test_key".to_string(),
            SettingValue::String("updated_value".to_string()),
            SettingCategory::System,
            false,
        )
        .unwrap();

        let updated = get_setting(&conn, "test_key").unwrap();
        let value = updated.get_value().unwrap();
        assert_eq!(value.as_string(), Some("updated_value"));
    }

    #[test]
    fn test_batch_upsert() {
        let conn = setup_test_db();

        let settings = vec![
            (
                "key1".to_string(),
                SettingValue::String("value1".to_string()),
                SettingCategory::Llm,
                false,
            ),
            (
                "key2".to_string(),
                SettingValue::Integer(42),
                SettingCategory::Ui,
                false,
            ),
            (
                "key3".to_string(),
                SettingValue::Boolean(true),
                SettingCategory::Security,
                false,
            ),
        ];

        upsert_settings_batch(&conn, settings).unwrap();

        let all_settings = list_all_settings(&conn).unwrap();
        assert_eq!(all_settings.len(), 3);
    }

    #[test]
    fn test_get_by_category() {
        let conn = setup_test_db();

        upsert_setting(
            &conn,
            "llm_key".to_string(),
            SettingValue::String("value".to_string()),
            SettingCategory::Llm,
            false,
        )
        .unwrap();

        upsert_setting(
            &conn,
            "ui_key".to_string(),
            SettingValue::String("value".to_string()),
            SettingCategory::Ui,
            false,
        )
        .unwrap();

        let llm_settings = get_settings_by_category(&conn, SettingCategory::Llm).unwrap();
        assert_eq!(llm_settings.len(), 1);
        assert_eq!(llm_settings[0].key, "llm_key");
    }

    #[test]
    fn test_delete_setting() {
        let conn = setup_test_db();

        upsert_setting(
            &conn,
            "delete_me".to_string(),
            SettingValue::String("value".to_string()),
            SettingCategory::System,
            false,
        )
        .unwrap();

        assert!(setting_exists(&conn, "delete_me").unwrap());

        delete_setting(&conn, "delete_me").unwrap();

        assert!(!setting_exists(&conn, "delete_me").unwrap());
    }

    #[test]
    fn test_prefix_operations() {
        let conn = setup_test_db();

        upsert_setting(
            &conn,
            "provider.openai.key".to_string(),
            SettingValue::String("value".to_string()),
            SettingCategory::Llm,
            true,
        )
        .unwrap();

        upsert_setting(
            &conn,
            "provider.anthropic.key".to_string(),
            SettingValue::String("value".to_string()),
            SettingCategory::Llm,
            true,
        )
        .unwrap();

        let provider_settings = get_settings_by_prefix(&conn, "provider.").unwrap();
        assert_eq!(provider_settings.len(), 2);

        delete_settings_by_prefix(&conn, "provider.openai").unwrap();

        let remaining = get_settings_by_prefix(&conn, "provider.").unwrap();
        assert_eq!(remaining.len(), 1);
    }
}
