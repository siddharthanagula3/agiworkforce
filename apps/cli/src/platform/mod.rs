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
