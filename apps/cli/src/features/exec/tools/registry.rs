//! Tool trait + registry (C1).
//!
//! Ported in intent from codex-rs's tool abstraction (Apache-2.0): instead of a
//! single hard-coded match arm per tool, a [`Tool`] is a self-describing unit
//! (name + read-only flag + async `invoke`) and a [`ToolRegistry`] looks them up
//! by name. The agent dispatch consults the registry first and falls back to the
//! legacy match for tools not yet migrated, so this lands incrementally without
//! breaking the working dispatch.
//!
//! Migrated so far: the read-only cluster (read_file, list_directory,
//! search_files, glob, grep_files). The remaining tools migrate in follow-on
//! increments by adding a `Tool` impl and a `register` call, no dispatch change.

use std::collections::HashMap;

use agiworkforce_protocol::tool_primitive::ToolActionClass;
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

    /// This tool's class in the cross-surface tool primitive (decision
    /// D-P0-5, `agiworkforce_protocol::tool_primitive`).
    ///
    /// The registry only knows whether a tool reads, so a mutating tool takes
    /// the same conservative `write` default an undeclared tool gets on the
    /// web. A tool that deletes, executes caller-supplied code, or publishes
    /// outside the workspace overrides this; it must not be inferred from the
    /// one flag the trait has.
    fn contract_action_class(&self) -> ToolActionClass {
        if self.read_only() {
            ToolActionClass::Read
        } else {
            ToolActionClass::Write
        }
    }

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

    /// Register a tool under its `name()`. Last registration wins (intentional.
    /// lets a surface override a default tool).
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
