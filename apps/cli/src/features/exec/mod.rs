//! One-shot exec feature.
//!
//! Target home for: exec entry point, apply_patch, notebook_edit, review,
//! tool_search, and the runtime/ submodule (session control + tool catalog).
//!
//! PILOT 6 (Phase 6): tools/ moved here from apps/cli/src/ as exec/tools/.
//! lib.rs re-exports this module at `crate::tools` so all 42 call-sites
//! across 4 files resolve unchanged. The 4 external public paths are all
//! defined in tools/mod.rs: ToolResult, ToolExecOptions,
//! execute_tool_with_opts, session_task_summaries.

pub mod tools;

// Re-export the tools submodule so `crate::features::exec` gives access
// at the same level; lib.rs uses `pub use features::exec::tools as tools`.
pub use tools::*;
