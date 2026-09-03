
use std::collections::HashMap;

use anyhow::Result;
use async_trait::async_trait;

use super::ToolResult;

/// A single agent tool: self-describing and independently invocable.
#[async_trait]
pub trait Tool: Send + Sync {
    /// Canonical tool name (must match the dispatch's `canonical_tool_name`).
    fn name(&self) -> &'static str;

    /// Read-only tools never mutate the workspace and can be auto-approved.
    fn read_only(&self) -> bool;

    /// Execute the tool. `quiet` suppresses status chrome (batch/sub-agent use).
    async fn invoke(&self, args: &HashMap<String, String>, quiet: bool) -> Result<ToolResult>;
}

/// Name-indexed collection of [`Tool`]s.
#[derive(Default)]
pub struct ToolRegistry {
    tools: HashMap<&'static str, Box<dyn Tool>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, tool: Box<dyn Tool>) {
        self.tools.insert(tool.name(), tool);
    }

    /// Look up a tool by canonical name.
    pub fn get(&self, name: &str) -> Option<&dyn Tool> {
        self.tools.get(name).map(|boxed| boxed.as_ref())
    }

    /// Canonical names of all registered tools.
    pub fn names(&self) -> impl Iterator<Item = &'static str> + '_ {
        self.tools.keys().copied()
    }

    /// Number of registered tools.
    pub fn len(&self) -> usize {
        self.tools.len()
    }

    pub fn is_empty(&self) -> bool {
        self.tools.is_empty()
    }
}
