//! Read-path helpers for Agiworkforce memories.
//!
//! This crate owns memory injection, memory citation parsing, and telemetry
//! classification for read access to the memory folder. It intentionally does
//! not depend on the memory write pipeline.

pub mod citations;
mod metrics;
mod prompts;
pub mod usage;

use agiworkforce_utils_absolute_path::AbsolutePathBuf;

pub use prompts::build_memory_tool_developer_instructions;

const MEMORY_TOOL_DEVELOPER_INSTRUCTIONS_SUMMARY_TOKEN_LIMIT: usize = 5_000;

pub fn memory_root(agiworkforce_home: &AbsolutePathBuf) -> AbsolutePathBuf {
    agiworkforce_home.join("memories")
}
