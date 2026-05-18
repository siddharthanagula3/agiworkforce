//! Plugin manifest discovery feature.
//!
//! Supports 5 manifest paths:
//!   .agiworkforce-plugin/, .claude-plugin/, .codex-plugin/, + 2 legacy.
//!
//! PILOT 2 (Phase 6): plugins.rs moved here from apps/cli/src/.
//! The crate::plugins path is re-exported from lib.rs so all internal
//! callers (command_registry, hooks, skills, tool_search, tui) resolve
//! unchanged.

#[allow(clippy::module_inception)] // inner mod shares name with parent by design (migration shim)
pub mod plugins;

// Flatten: re-export everything from the inner module so that
// `crate::features::plugins::PluginsManager` works without an extra segment,
// and lib.rs can `pub use features::plugins::plugins as plugins;` cleanly.
pub use plugins::*;
