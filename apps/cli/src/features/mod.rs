//! Phase 6 reorg — feature layer.
//!
//! Files migrate here incrementally. Each submodule's mod.rs documents
//! what will live there. No live public API yet beyond `plan`.

// PILOT (migrated): plan_mode.rs → features/plan/plan_mode.rs
pub mod plan;

// PLACEHOLDER — not yet migrated; declared so lib.rs `features::*` resolves.
pub mod exec;
pub mod repl;
pub mod session;
pub mod mcp;
pub mod hooks;
pub mod plugins;
pub mod tui;
pub mod providers;
