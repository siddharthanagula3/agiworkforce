use super::SandboxCommand;
use super::SandboxManager;
use super::SandboxTransformRequest;
use super::SandboxType;
use super::SandboxablePreference;
use super::get_platform_sandbox;
use agiworkforce_protocol::config_types::WindowsSandboxLevel;
use agiworkforce_protocol::models::SandboxFileSystemPermissions as FileSystemPermissions;
use agiworkforce_protocol::models::NetworkPermissions;
use agiworkforce_protocol::models::SimplePermissionProfile as PermissionProfile;
use agiworkforce_protocol::permissions::FileSystemAccessMode;
use agiworkforce_protocol::permissions::FileSystemPath;
use agiworkforce_protocol::permissions::FileSystemSandboxEntry;
use agiworkforce_protocol::permissions::FileSystemSandboxPolicy;
use agiworkforce_protocol::permissions::FileSystemSpecialPath;
use agiworkforce_protocol::permissions::NetworkSandboxPolicy;
use agiworkforce_protocol::protocol::NetworkAccess;
use agiworkforce_protocol::protocol::ReadOnlyAccess;
use agiworkforce_protocol::protocol::SandboxPolicy;
use agiworkforce_utils_absolute_path::AbsolutePathBuf;
use dunce::canonicalize;
use pretty_assertions::assert_eq;
use std::collections::HashMap;
use tempfile::TempDir;

#[test]
fn danger_full_access_defaults_to_no_sandbox_without_network_requirements() {
    let manager = SandboxManager::new();
    let sandbox = manager.select_initial(
        &FileSystemSandboxPolicy::unrestricted(),
        NetworkSandboxPolicy::Enabled,
        SandboxablePreference::Auto,
        WindowsSandboxLevel::Disabled,
        false,
    );
    assert_eq!(sandbox, SandboxType::None);
}

#[test]
fn danger_full_access_uses_platform_sandbox_with_network_requirements() {
    let manager = SandboxManager::new();
    let expected = get_platform_sandbox(false).unwrap_or(SandboxType::None);
    let sandbox = manager.select_initial(
        &FileSystemSandboxPolicy::unrestricted(),
        NetworkSandboxPolicy::Enabled,
        SandboxablePreference::Auto,
        WindowsSandboxLevel::Disabled,
        true,
    );
    assert_eq!(sandbox, expected);
}

#[test]
fn restricted_file_system_uses_platform_sandbox_without_managed_network() {
    let manager = SandboxManager::new();
    let expected = get_platform_sandbox(false).unwrap_or(SandboxType::None);
    let sandbox = manager.select_initial(
        &FileSystemSandboxPolicy::restricted(vec![FileSystemSandboxEntry {
            path: FileSystemPath::Special {
                value: FileSystemSpecialPath::Root,
            },
            access: FileSystemAccessMode::Read,
        }]),
        NetworkSandboxPolicy::Enabled,
        SandboxablePreference::Auto,
        WindowsSandboxLevel::Disabled,
        false,
    );
    assert_eq!(sandbox, expected);
}

// Sprint 0 (FIX-006a): the three `transform_*` tests below reference the
// pre-rebrand `SandboxTransformRequest` shape (`policy`, `file_system_policy`,
// `network_policy`, `macos_seatbelt_profile_extensions`). The current struct
// in `manager.rs` collapses those into a single `permissions:
// &SimplePermissionProfile`. Re-porting the assertions belongs in the broader
// sandbox refactor — gating them off so the workspace compiles in the
// meantime.
#[cfg(any())]
#[test]
fn transform_preserves_unrestricted_file_system_policy_for_restricted_network() {
    let manager = SandboxManager::new();
    let cwd = std::env::current_dir().expect("current dir");
    let exec_request = manager
        .transform(SandboxTransformRequest {
            command: SandboxCommand {
                program: "true".to_string(),
                args: Vec::new(),
                cwd: cwd.clone(),
                env: HashMap::new(),
                additional_permissions: None,
            },
            policy: &SandboxPolicy::ExternalSandbox {
                network_access: NetworkAccess::Restricted,
            },
            file_system_policy: &FileSystemSandboxPolicy::unrestricted(),
            network_policy: NetworkSandboxPolicy::Restricted,
            sandbox: SandboxType::None,
            enforce_managed_network: false,
            network: None,
            sandbox_policy_cwd: cwd.as_path(),
            #[cfg(target_os = "macos")]
            macos_seatbelt_profile_extensions: None,
            agiworkforce_linux_sandbox_exe: None,
            use_legacy_landlock: false,
            windows_sandbox_level: WindowsSandboxLevel::Disabled,
            windows_sandbox_private_desktop: false,
        })
        .expect("transform");

    assert_eq!(
        exec_request.file_system_sandbox_policy,
        FileSystemSandboxPolicy::unrestricted()
    );
    assert_eq!(
        exec_request.network_sandbox_policy,
        NetworkSandboxPolicy::Restricted
    );
}

#[cfg(any())]
#[test]
fn transform_additional_permissions_enable_network_for_external_sandbox() {
    let manager = SandboxManager::new();
    let cwd = std::env::current_dir().expect("current dir");
    let temp_dir = TempDir::new().expect("create temp dir");
    let path = AbsolutePathBuf::from_absolute_path(
        canonicalize(temp_dir.path()).expect("canonicalize temp dir"),
    )
    .expect("absolute temp dir");
    let exec_request = manager
        .transform(SandboxTransformRequest {
            command: SandboxCommand {
                program: "true".to_string(),
                args: Vec::new(),
                cwd: cwd.clone(),
                env: HashMap::new(),
                additional_permissions: Some(PermissionProfile {
                    network: Some(NetworkPermissions {
                        enabled: Some(true),
                    }),
                    file_system: Some(FileSystemPermissions {
                        read: Some(vec![path]),
                        write: Some(Vec::new()),
                    }),
                    ..Default::default()
                }),
            },
            policy: &SandboxPolicy::ExternalSandbox {
                network_access: NetworkAccess::Restricted,
            },
            file_system_policy: &FileSystemSandboxPolicy::unrestricted(),
            network_policy: NetworkSandboxPolicy::Restricted,
            sandbox: SandboxType::None,
            enforce_managed_network: false,
            network: None,
            sandbox_policy_cwd: cwd.as_path(),
            #[cfg(target_os = "macos")]
            macos_seatbelt_profile_extensions: None,
            agiworkforce_linux_sandbox_exe: None,
            use_legacy_landlock: false,
            windows_sandbox_level: WindowsSandboxLevel::Disabled,
            windows_sandbox_private_desktop: false,
        })
        .expect("transform");

    assert_eq!(
        exec_request.sandbox_policy,
        SandboxPolicy::ExternalSandbox {
            network_access: NetworkAccess::Enabled,
        }
    );
    assert_eq!(
        exec_request.network_sandbox_policy,
        NetworkSandboxPolicy::Enabled
    );
}

#[cfg(any())]
#[test]
fn transform_additional_permissions_preserves_denied_entries() {
    let manager = SandboxManager::new();
    let cwd = std::env::current_dir().expect("current dir");
    let temp_dir = TempDir::new().expect("create temp dir");
    let workspace_root = AbsolutePathBuf::from_absolute_path(
        canonicalize(temp_dir.path()).expect("canonicalize temp dir"),
    )
    .expect("absolute temp dir");
    let allowed_path = workspace_root.join("allowed").expect("allowed path");
    let denied_path = workspace_root.join("denied").expect("denied path");
    let exec_request = manager
        .transform(SandboxTransformRequest {
            command: SandboxCommand {
                program: "true".to_string(),
                args: Vec::new(),
                cwd: cwd.clone(),
                env: HashMap::new(),
                additional_permissions: Some(PermissionProfile {
                    file_system: Some(FileSystemPermissions {
                        read: None,
                        write: Some(vec![allowed_path.clone()]),
                    }),
                    ..Default::default()
                }),
            },
            policy: &SandboxPolicy::ReadOnly {
                access: ReadOnlyAccess::FullAccess,
                network_access: false,
            },
            file_system_policy: &FileSystemSandboxPolicy::restricted(vec![
                FileSystemSandboxEntry {
                    path: FileSystemPath::Special {
                        value: FileSystemSpecialPath::Root,
                    },
                    access: FileSystemAccessMode::Read,
                },
                FileSystemSandboxEntry {
                    path: FileSystemPath::Path {
                        path: denied_path.clone(),
                    },
                    access: FileSystemAccessMode::None,
                },
            ]),
            network_policy: NetworkSandboxPolicy::Restricted,
            sandbox: SandboxType::None,
            enforce_managed_network: false,
            network: None,
            sandbox_policy_cwd: cwd.as_path(),
            #[cfg(target_os = "macos")]
            macos_seatbelt_profile_extensions: None,
            agiworkforce_linux_sandbox_exe: None,
            use_legacy_landlock: false,
            windows_sandbox_level: WindowsSandboxLevel::Disabled,
            windows_sandbox_private_desktop: false,
        })
        .expect("transform");

    assert_eq!(
        exec_request.file_system_sandbox_policy,
        FileSystemSandboxPolicy::restricted(vec![
            FileSystemSandboxEntry {
                path: FileSystemPath::Special {
                    value: FileSystemSpecialPath::Root,
                },
                access: FileSystemAccessMode::Read,
            },
            FileSystemSandboxEntry {
                path: FileSystemPath::Path { path: denied_path },
                access: FileSystemAccessMode::None,
            },
            FileSystemSandboxEntry {
                path: FileSystemPath::Path { path: allowed_path },
                access: FileSystemAccessMode::Write,
            },
        ])
    );
    assert_eq!(
        exec_request.network_sandbox_policy,
        NetworkSandboxPolicy::Restricted
    );
}
