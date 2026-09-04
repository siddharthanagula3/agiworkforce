//! Plan mode feature, real model-driven plan → approve → execute flow.
//!
//! Sprint B4 plan: model writes a Plan via the `update_plan` tool; the user
//! reviews and approves before mutating tools (Bash/Edit/Write/apply_patch/MCP)
//! are unlocked. Mirrors the Codex `update_plan` tool surface.
//!
//! PILOT MIGRATION (Phase 6 Step 4): plan_mode.rs moved here from apps/cli/src/.
//! All crate-internal callers use `crate::plan_mode::Plan` which is re-exported
//! from lib.rs for backward compatibility.

pub mod plan_mode;
