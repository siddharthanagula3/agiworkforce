//! Agent runtime around the one chat loop: background runs and triggers,
//! the tool-approval gate and unattended turns, context compaction, prompt
//! assembly, change tracking and undo.

pub mod approval;
pub mod background_agent;
pub mod change_tracker;
pub mod context_compactor;
pub mod prompt_engineer;
pub mod tool_approval;
pub mod triggers;
pub mod unattended_turn;
pub mod undo_manager;

#[cfg(test)]
mod tests;

pub use background_agent::{
    AgentProgress, AgentSummary, BackgroundAgent, BackgroundAgentContext, BackgroundAgentManager,
    BackgroundAgentManagerState, BackgroundAgentStatus, ConversationMessage,
    DEFAULT_AGENT_TIMEOUT_SECS, MAX_BACKGROUND_AGENTS,
};
pub use change_tracker::{ChangeTracker, NamedFileCheckpoint};
pub use triggers::{
    RegisteredTrigger, TriggerAction, TriggerConfig, TriggerExecution, TriggerRegistry,
    TriggerRegistryState, TriggerType,
};
pub use undo_manager::UndoManager;
