
mod engine;

#[cfg(target_os = "macos")]
pub mod macos_sandbox;

#[cfg(target_os = "linux")]
pub mod linux_sandbox;

#[cfg(target_os = "windows")]
pub mod windows_sandbox;

#[allow(unused_imports)]
pub use engine::{PolicyDecision, PolicyEngine, PolicyRule, WorkspacePolicy};
