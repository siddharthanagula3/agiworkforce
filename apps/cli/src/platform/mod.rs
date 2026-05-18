//! Platform / OS abstraction layer.
//!
//! Target home for: sandbox.rs, exec_policy.rs, shell_snapshot.rs,
//! powershell_tool.rs, daemon.rs, app_server.rs, lsp/ submodule,
//! output.rs, output_styles/, design_system.rs, markdown.rs,
//! safety/ submodule, policy/ submodule.
//!
//! PILOT 3 (Phase 6): policy/ moved here from apps/cli/src/.
//! The crate::policy path is re-exported from lib.rs so the PHASE2
//! declaration resolves unchanged.

#[allow(dead_code)] // PHASE2: Gemini-style declarative TOML tool-rule eval not yet wired into agent
pub mod policy;

// PILOT 5 (Phase 6): runtime/ moved here from apps/cli/src/.
// 7 files: advisor, session, session_control, tool_catalog, tool_distillation,
// worktree, mod. crate::runtime re-exported from lib.rs; all 5 submodule paths
// (session_control, tool_catalog, worktree, session, advisor) resolve unchanged.
pub mod runtime;
