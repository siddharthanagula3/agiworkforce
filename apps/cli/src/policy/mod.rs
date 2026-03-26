//! Declarative workspace policy engine — TOML-based tool approval rules.
//!
//! Inspired by Gemini CLI's policy engine. Reads `.agiworkforce/policy.toml`
//! from the workspace root (if trusted) and evaluates tool calls against
//! pattern-matched rules.

mod engine;

#[allow(unused_imports)]
pub use engine::{PolicyDecision, PolicyEngine, PolicyRule, WorkspacePolicy};
