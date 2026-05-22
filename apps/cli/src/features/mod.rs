//! Phase 6 reorg — feature layer.
//!
//! Files migrate here incrementally. Each submodule's mod.rs documents
//! what will live there. No live public API yet beyond `plan`.

// PILOT (migrated): plan_mode.rs → features/plan/plan_mode.rs
pub mod plan;

// PILOT 8 (Phase 6): a2a/ moved here from apps/cli/src/.
// 7 files: client, jsonrpc, mod, protocol, registry, security, server.
// crate::a2a re-exported from lib.rs. PHASE2 dead_code; 6 live call-sites
// in a2a_ws.rs, agent/mod.rs, repl/mod.rs still resolve unchanged.
#[allow(dead_code)]
pub mod a2a;

// PLACEHOLDER — not yet migrated; declared so lib.rs `features::*` resolves.
pub mod exec;
pub mod hooks;
pub mod mcp;
pub mod plugins;
pub mod providers;
pub mod repl;
pub mod session;
pub mod tui;
