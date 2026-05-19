//! Hook events feature — 19 canonical hook events (Claude Code-aligned).
//!
//! PILOT 4 (Phase 6): hooks.rs (1946 lines) moved here from apps/cli/src/.
//! The crate::hooks path is re-exported from lib.rs so all 20 call-sites
//! across 6 files (agent/chat, tui/tui_app, repl/mod, repl/slash_commands,
//! daemon, agent/mod) resolve unchanged. No wildcard imports, no exhaustive
//! match arms on HookEvent — variant-drop risk confirmed clear.

#[allow(clippy::module_inception)] // inner mod shares name with parent by design (migration shim)
pub mod hooks;

// Flatten: re-export everything so crate::hooks::HookEvent, run_hooks, etc.
// all resolve via the re-export in lib.rs without an extra path segment.
pub use hooks::*;
