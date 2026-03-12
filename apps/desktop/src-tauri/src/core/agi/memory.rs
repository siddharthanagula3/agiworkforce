//! Deprecated in-memory working memory.
//!
//! This module provides a simple VecDeque-backed working memory that was the
//! original AGI memory implementation. It has been superseded by `MemoryManager`
//! and `MemoryStore` (backed by SQLite + vector embeddings) but is still
//! referenced by `AGICore` for lightweight in-process caching during a single
//! session. New code should use `memory_manager` or `memory_persistence` instead.

use anyhow::Result;
use std::collections::VecDeque;
use std::sync::Mutex;

#[deprecated(
    since = "0.1.0",
    note = "Use MemoryManager or MemoryStore for persistent, searchable memory. \
            AGIMemory is retained only for lightweight in-session caching."
)]
pub struct AGIMemory {
    working_memory: Mutex<VecDeque<MemoryEntry>>,
    max_entries: usize,
}

#[derive(Debug, Clone)]
pub struct MemoryEntry {
    pub timestamp: u64,
    pub event: String,
    pub data: serde_json::Value,
    pub importance: f64,
}

#[allow(deprecated)]
impl AGIMemory {
    pub fn new() -> Result<Self> {
        Ok(Self {
            working_memory: Mutex::new(VecDeque::new()),
            max_entries: 1000,
        })
    }

    pub fn add(&self, event: String, data: serde_json::Value, importance: f64) -> Result<()> {
        let mut memory = self
            .working_memory
            .lock()
            .map_err(|_| anyhow::anyhow!("Failed to acquire working memory lock"))?;

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| anyhow::anyhow!("System time error: {}", e))?
            .as_secs();

        let entry = MemoryEntry {
            timestamp,
            event,
            data,
            importance,
        };

        memory.push_back(entry);

        while memory.len() > self.max_entries {
            memory.pop_front();
        }

        Ok(())
    }

    pub fn get_recent(&self, limit: usize) -> Vec<MemoryEntry> {
        self.working_memory
            .lock()
            .map(|memory| memory.iter().rev().take(limit).cloned().collect())
            .unwrap_or_default()
    }

    pub fn search(&self, query: &str) -> Vec<MemoryEntry> {
        self.working_memory
            .lock()
            .map(|memory| {
                memory
                    .iter()
                    .filter(|entry| {
                        entry.event.contains(query) || entry.data.to_string().contains(query)
                    })
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }
}
