use anyhow::Result;
use std::collections::VecDeque;
use std::sync::Mutex;

/// AGI Memory - short-term and working memory
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

impl AGIMemory {
    pub fn new() -> Result<Self> {
        Ok(Self {
            working_memory: Mutex::new(VecDeque::new()),
            max_entries: 1000,
        })
    }

    pub fn add(&self, event: String, data: serde_json::Value, importance: f64) -> Result<()> {
        let mut memory = self.working_memory.lock().unwrap();

        let entry = MemoryEntry {
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            event,
            data,
            importance,
        };

        memory.push_back(entry);

        // Remove oldest entries if over limit
        while memory.len() > self.max_entries {
            memory.pop_front();
        }

        Ok(())
    }

    pub fn get_recent(&self, limit: usize) -> Vec<MemoryEntry> {
        let memory = self.working_memory.lock().unwrap();
        memory.iter().rev().take(limit).cloned().collect()
    }

    pub fn search(&self, query: &str) -> Vec<MemoryEntry> {
        let memory = self.working_memory.lock().unwrap();
        memory
            .iter()
            .filter(|entry| {
                entry.event.contains(query) || entry.data.to_string().contains(query)
            })
            .cloned()
            .collect()
    }
}

