pub mod landlock;
pub mod macos_permissions;
mod manager;
pub mod policy_transforms;
#[cfg(target_os = "macos")]
pub mod seatbelt;
#[cfg(target_os = "macos")]
mod seatbelt_permissions;

pub use manager::SandboxCommand;
pub use manager::SandboxExecRequest;
pub use manager::SandboxManager;
pub use manager::SandboxTransformError;
pub use manager::SandboxTransformRequest;
pub use manager::SandboxType;
pub use manager::SandboxablePreference;
pub use manager::get_platform_sandbox;
pub use policy_transforms::compatibility_sandbox_policy_for_permission_profile;
pub use policy_transforms::effective_permission_profile;
pub use policy_transforms::system_bwrap_warning;

/// Locate `bwrap` on the user's PATH, returning the absolute path if found.
///
/// Stub for the Linux sandbox launcher port — codex-rs had a richer
/// implementation that probed multiple candidate locations + version
/// constraints. The PATH walk is sufficient for the desktop binary,
/// which falls back to vendored bwrap when this returns `None`.
pub fn find_system_bwrap_in_path() -> Option<std::path::PathBuf> {
    #[cfg(unix)]
    {
        let path_var = std::env::var_os("PATH")?;
        for dir in std::env::split_paths(&path_var) {
            let candidate = dir.join("bwrap");
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}
