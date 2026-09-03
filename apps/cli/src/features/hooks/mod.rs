
#[allow(clippy::module_inception)] // inner mod shares name with parent by design (migration shim)
pub mod hooks;

// Flatten: re-export everything so crate::hooks::HookEvent, run_hooks, etc.
// all resolve via the re-export in lib.rs without an extra path segment.
pub use hooks::*;
