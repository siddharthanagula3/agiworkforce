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
