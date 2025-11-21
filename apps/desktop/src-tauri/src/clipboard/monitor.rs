use anyhow::{anyhow, Result};
use clipboard_win::{formats, get_clipboard_string, set_clipboard};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, RwLock};
use tokio::time::interval;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ClipboardDataType {
    Text,
    Image,
    File,
    Html,
    Rtf,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardEntry {
    pub id: String,
    pub data_type: ClipboardDataType,
    pub content: Option<String>,
    pub file_path: Option<String>,
    pub thumbnail: Option<String>,
    pub size: usize,
    pub timestamp: String,
    pub source_app: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardMonitorConfig {
    pub enabled: bool,
    pub check_interval_ms: u64,
    pub max_history: usize,
    pub track_images: bool,
    pub track_files: bool,
    pub exclude_apps: Vec<String>,
}

impl Default for ClipboardMonitorConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            check_interval_ms: 500,
            max_history: 1000,
            track_images: true,
            track_files: true,
            exclude_apps: vec![],
        }
    }
}

pub struct ClipboardMonitor {
    config: ClipboardMonitorConfig,
    is_running: Arc<RwLock<bool>>,
    last_content: Arc<Mutex<Option<String>>>,
    history: Arc<Mutex<Vec<ClipboardEntry>>>,
    db_path: PathBuf,
}

impl ClipboardMonitor {
    pub fn new(config: ClipboardMonitorConfig, db_path: PathBuf) -> Result<Self> {
        let monitor = Self {
            config,
            is_running: Arc::new(RwLock::new(false)),
            last_content: Arc::new(Mutex::new(None)),
            history: Arc::new(Mutex::new(Vec::new())),
            db_path,
        };

        monitor.init_database()?;
        Ok(monitor)
    }

    fn init_database(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS clipboard_history (
                id TEXT PRIMARY KEY,
                data_type TEXT NOT NULL,
                content TEXT,
                file_path TEXT,
                thumbnail TEXT,
                size INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                source_app TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_clipboard_timestamp ON clipboard_history(timestamp DESC)",
            [],
        )?;

        Ok(())
    }

    pub async fn start(&self) -> Result<()> {
        let mut is_running = self.is_running.write().await;
        if *is_running {
            return Err(anyhow!("Clipboard monitor already running"));
        }

        *is_running = true;
        drop(is_running);

        let is_running_clone = Arc::clone(&self.is_running);
        let last_content_clone = Arc::clone(&self.last_content);
        let history_clone = Arc::clone(&self.history);
        let config = self.config.clone();
        let db_path = self.db_path.clone();

        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_millis(config.check_interval_ms));

            loop {
                ticker.tick().await;

                if !*is_running_clone.read().await {
                    break;
                }

                if let Err(e) = Self::check_clipboard_change(
                    &last_content_clone,
                    &history_clone,
                    &config,
                    &db_path,
                )
                .await
                {
                    eprintln!("Clipboard monitoring error: {}", e);
                }
            }
        });

        Ok(())
    }

    async fn check_clipboard_change(
        last_content: &Arc<Mutex<Option<String>>>,
        history: &Arc<Mutex<Vec<ClipboardEntry>>>,
        config: &ClipboardMonitorConfig,
        db_path: &PathBuf,
    ) -> Result<()> {
        // Try to get text from clipboard
        if let Ok(current_text) = get_clipboard_string() {
            let mut last = last_content.lock().await;

            if last.as_ref() != Some(&current_text) {
                *last = Some(current_text.clone());

                let text_len = current_text.len();
                let entry = ClipboardEntry {
                    id: uuid::Uuid::new_v4().to_string(),
                    data_type: ClipboardDataType::Text,
                    content: Some(current_text),
                    file_path: None,
                    thumbnail: None,
                    size: text_len,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                    source_app: Self::get_foreground_app_name(),
                };

                // Save to database
                Self::save_to_database(db_path, &entry)?;

                // Add to in-memory history
                let mut hist = history.lock().await;
                hist.push(entry);

                // Limit history size
                if hist.len() > config.max_history {
                    hist.remove(0);
                }
            }
        }

        // Check for images if enabled
        if config.track_images {
            // TODO: Implement image clipboard tracking using clipboard_win formats
        }

        // Check for files if enabled
        if config.track_files {
            // TODO: Implement file clipboard tracking
        }

        Ok(())
    }

    fn save_to_database(db_path: &PathBuf, entry: &ClipboardEntry) -> Result<()> {
        let conn = Connection::open(db_path)?;

        conn.execute(
            "INSERT INTO clipboard_history (id, data_type, content, file_path, thumbnail, size, timestamp, source_app)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                &entry.id,
                format!("{:?}", entry.data_type),
                &entry.content,
                &entry.file_path,
                &entry.thumbnail,
                entry.size as i64,
                &entry.timestamp,
                &entry.source_app,
            ],
        )?;

        Ok(())
    }

    pub async fn stop(&self) -> Result<()> {
        let mut is_running = self.is_running.write().await;
        if !*is_running {
            return Err(anyhow!("Clipboard monitor not running"));
        }

        *is_running = false;
        Ok(())
    }

    pub async fn get_history(&self, limit: usize) -> Result<Vec<ClipboardEntry>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, data_type, content, file_path, thumbnail, size, timestamp, source_app
             FROM clipboard_history
             ORDER BY timestamp DESC
             LIMIT ?1",
        )?;

        let entries = stmt.query_map([limit], |row| {
            Ok(ClipboardEntry {
                id: row.get(0)?,
                data_type: match row.get::<_, String>(1)?.as_str() {
                    "Text" => ClipboardDataType::Text,
                    "Image" => ClipboardDataType::Image,
                    "File" => ClipboardDataType::File,
                    "Html" => ClipboardDataType::Html,
                    "Rtf" => ClipboardDataType::Rtf,
                    _ => ClipboardDataType::Unknown,
                },
                content: row.get(2)?,
                file_path: row.get(3)?,
                thumbnail: row.get(4)?,
                size: row.get::<_, i64>(5)? as usize,
                timestamp: row.get(6)?,
                source_app: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for entry in entries {
            result.push(entry?);
        }

        Ok(result)
    }

    pub async fn search_history(&self, query: &str, limit: usize) -> Result<Vec<ClipboardEntry>> {
        let conn = Connection::open(&self.db_path)?;

        let mut stmt = conn.prepare(
            "SELECT id, data_type, content, file_path, thumbnail, size, timestamp, source_app
             FROM clipboard_history
             WHERE content LIKE ?1
             ORDER BY timestamp DESC
             LIMIT ?2",
        )?;

        let search_pattern = format!("%{}%", query);
        let entries = stmt.query_map(params![search_pattern, limit], |row| {
            Ok(ClipboardEntry {
                id: row.get(0)?,
                data_type: match row.get::<_, String>(1)?.as_str() {
                    "Text" => ClipboardDataType::Text,
                    "Image" => ClipboardDataType::Image,
                    "File" => ClipboardDataType::File,
                    "Html" => ClipboardDataType::Html,
                    "Rtf" => ClipboardDataType::Rtf,
                    _ => ClipboardDataType::Unknown,
                },
                content: row.get(2)?,
                file_path: row.get(3)?,
                thumbnail: row.get(4)?,
                size: row.get::<_, i64>(5)? as usize,
                timestamp: row.get(6)?,
                source_app: row.get(7)?,
            })
        })?;

        let mut result = Vec::new();
        for entry in entries {
            result.push(entry?);
        }

        Ok(result)
    }

    pub async fn clear_history(&self) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute("DELETE FROM clipboard_history", [])?;
        self.history.lock().await.clear();
        Ok(())
    }

    pub async fn delete_entry(&self, entry_id: &str) -> Result<()> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute("DELETE FROM clipboard_history WHERE id = ?1", [entry_id])?;

        let mut history = self.history.lock().await;
        history.retain(|e| e.id != entry_id);

        Ok(())
    }

    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }

    fn get_foreground_app_name() -> Option<String> {
        // TODO: Implement using Windows API to get foreground window app name
        None
    }

    pub async fn set_clipboard_text(&self, text: &str) -> Result<()> {
        set_clipboard(formats::Unicode, text)?;
        Ok(())
    }

    pub async fn get_current_clipboard(&self) -> Result<Option<String>> {
        match get_clipboard_string() {
            Ok(text) => Ok(Some(text)),
            Err(_) => Ok(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_clipboard_monitor_creation() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("clipboard.db");
        let config = ClipboardMonitorConfig::default();
        let monitor = ClipboardMonitor::new(config, db_path);
        assert!(monitor.is_ok());
    }

    #[tokio::test]
    async fn test_database_initialization() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("clipboard.db");
        let config = ClipboardMonitorConfig::default();
        let monitor = ClipboardMonitor::new(config, db_path.clone()).unwrap();

        // Check that database file was created
        assert!(db_path.exists());
    }
}
