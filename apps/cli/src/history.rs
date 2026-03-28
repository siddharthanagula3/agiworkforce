use anyhow::Result;
use serde::Serialize;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct HistoryEntry {
    pub session_id: String,
    pub timestamp: String,
    pub role: String,
    pub content_preview: String,
    pub model: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub tool_calls_count: u32,
}

impl HistoryEntry {
    /// Append a single entry to ~/.agiworkforce/history.jsonl.
    /// Errors are logged to stderr but never block the agent loop.
    pub fn append(home: &Path, entry: &HistoryEntry) {
        if let Err(e) = Self::append_inner(home, entry) {
            eprintln!("[history] failed to append entry: {}", e);
        }
    }

    fn append_inner(home: &Path, entry: &HistoryEntry) -> Result<()> {
        let path = home.join("history.jsonl");
        let mut file = OpenOptions::new().create(true).append(true).open(&path)?;
        let json = serde_json::to_string(entry)?;
        writeln!(file, "{}", json)?;
        Ok(())
    }
}
