//! Declarative workspace policy engine — TOML-based tool approval rules.
//!
//! Inspired by Gemini CLI's policy engine. Reads `.agiworkforce/policy.toml`
//! from the workspace root (if trusted) and evaluates tool calls against
//! pattern-matched rules.

mod engine;

#[cfg(target_os = "macos")]
pub mod macos_sandbox;

#[cfg(target_os = "linux")]
pub mod linux_sandbox;

#[cfg(target_os = "windows")]
pub mod windows_sandbox;

#[allow(unused_imports)]
pub use engine::{PolicyDecision, PolicyEngine, PolicyRule, WorkspacePolicy};
