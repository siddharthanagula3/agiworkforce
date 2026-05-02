use agiworkforce_app_server_protocol::AdditionalNetworkPermissions;
use agiworkforce_app_server_protocol::FileUpdateChange;
use agiworkforce_app_server_protocol::GrantedPermissionProfile;
use agiworkforce_app_server_protocol::NetworkApprovalContext as AppServerNetworkApprovalContext;
use agiworkforce_app_server_protocol::PatchChangeKind;
use agiworkforce_protocol::protocol::FileChange;
use agiworkforce_protocol::protocol::NetworkApprovalContext;
use agiworkforce_protocol::protocol::NetworkApprovalProtocol;
use agiworkforce_protocol::request_permissions::RequestPermissionProfile as CoreRequestPermissionProfile;
use std::collections::HashMap;
use std::path::PathBuf;

pub(crate) fn network_approval_context_to_core(
    value: AppServerNetworkApprovalContext,
) -> NetworkApprovalContext {
    NetworkApprovalContext {
        host: value.host,
        protocol: match value.protocol {
            agiworkforce_app_server_protocol::NetworkApprovalProtocol::Http => {
                NetworkApprovalProtocol::Http
            }
            agiworkforce_app_server_protocol::NetworkApprovalProtocol::Https => {
                NetworkApprovalProtocol::Https
            }
            agiworkforce_app_server_protocol::NetworkApprovalProtocol::Socks5Tcp => {
                NetworkApprovalProtocol::Socks5Tcp
            }
            agiworkforce_app_server_protocol::NetworkApprovalProtocol::Socks5Udp => {
                NetworkApprovalProtocol::Socks5Udp
            }
        },
    }
}

pub(crate) fn granted_permission_profile_from_request(
    value: CoreRequestPermissionProfile,
) -> GrantedPermissionProfile {
    GrantedPermissionProfile {
        network: value.network.map(|network| AdditionalNetworkPermissions {
            enabled: network.enabled,
        }),
        file_system: value.file_system.map(Into::into),
    }
}

pub(crate) fn file_update_changes_to_core(
    changes: Vec<FileUpdateChange>,
) -> HashMap<PathBuf, FileChange> {
    changes
        .into_iter()
        .map(|change| {
            let path = PathBuf::from(change.path);
            let file_change = match change.kind {
                PatchChangeKind::Add => FileChange::Add {
                    content: change.diff,
                },
                PatchChangeKind::Delete => FileChange::Delete {
                    content: change.diff,
                },
                PatchChangeKind::Update { move_path } => FileChange::Update {
                    unified_diff: change.diff,
                    move_path,
                },
            };
            (path, file_change)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::file_update_changes_to_core;
    use super::granted_permission_profile_from_request;
    use super::network_approval_context_to_core;
    use agiworkforce_app_server_protocol::FileUpdateChange;
    use agiworkforce_app_server_protocol::PatchChangeKind;
    use agiworkforce_protocol::models::FileSystemPermissions;
    use agiworkforce_protocol::models::NetworkPermissions;
    use agiworkforce_protocol::permissions::FileSystemAccessMode;
    use agiworkforce_protocol::permissions::FileSystemPath;
    use agiworkforce_protocol::permissions::FileSystemSandboxEntry;
    use agiworkforce_protocol::permissions::FileSystemSpecialPath;
    use agiworkforce_protocol::protocol::FileChange;
    use agiworkforce_protocol::protocol::NetworkApprovalContext;
    use agiworkforce_protocol::protocol::NetworkApprovalProtocol;
    use agiworkforce_protocol::request_permissions::RequestPermissionProfile as CoreRequestPermissionProfile;
    use agiworkforce_utils_absolute_path::AbsolutePathBuf;
    use pretty_assertions::assert_eq;
    use std::collections::HashMap;
    use std::path::PathBuf;

    fn absolute_path(path: &str) -> AbsolutePathBuf {
        AbsolutePathBuf::try_from(PathBuf::from(path)).expect("path must be absolute")
    }

    #[test]
    fn converts_app_server_network_approval_context_to_core() {
        assert_eq!(
            network_approval_context_to_core(agiworkforce_app_server_protocol::NetworkApprovalContext {
                host: "example.com".to_string(),
                protocol: agiworkforce_app_server_protocol::NetworkApprovalProtocol::Socks5Tcp,
            }),
            NetworkApprovalContext {
                host: "example.com".to_string(),
                protocol: NetworkApprovalProtocol::Socks5Tcp,
            }
        );
    }

    #[test]
    fn converts_file_update_changes_to_core() {
        assert_eq!(
            file_update_changes_to_core(vec![FileUpdateChange {
                path: "foo.txt".to_string(),
                kind: PatchChangeKind::Add,
                diff: "hello\n".to_string(),
            }]),
            HashMap::from([(
                PathBuf::from("foo.txt"),
                FileChange::Add {
                    content: "hello\n".to_string(),
                },
            )])
        );
    }

    #[test]
    fn converts_request_permissions_into_granted_permissions() {
        assert_eq!(
            granted_permission_profile_from_request(CoreRequestPermissionProfile {
                network: Some(NetworkPermissions {
                    enabled: Some(true),
                }),
                file_system: Some(FileSystemPermissions::from_read_write_roots(
                    Some(vec![absolute_path("/tmp/read-only")]),
                    Some(vec![absolute_path("/tmp/write")]),
                )),
            }),
            agiworkforce_app_server_protocol::GrantedPermissionProfile {
                network: Some(agiworkforce_app_server_protocol::AdditionalNetworkPermissions {
                    enabled: Some(true),
                }),
                file_system: Some(agiworkforce_app_server_protocol::AdditionalFileSystemPermissions {
                    read: Some(vec![absolute_path("/tmp/read-only")]),
                    write: Some(vec![absolute_path("/tmp/write")]),
                    glob_scan_max_depth: None,
                    entries: Some(vec![
                        agiworkforce_app_server_protocol::FileSystemSandboxEntry {
                            path: agiworkforce_app_server_protocol::FileSystemPath::Path {
                                path: absolute_path("/tmp/read-only"),
                            },
                            access: agiworkforce_app_server_protocol::FileSystemAccessMode::Read,
                        },
                        agiworkforce_app_server_protocol::FileSystemSandboxEntry {
                            path: agiworkforce_app_server_protocol::FileSystemPath::Path {
                                path: absolute_path("/tmp/write"),
                            },
                            access: agiworkforce_app_server_protocol::FileSystemAccessMode::Write,
                        },
                    ]),
                }),
            }
        );
    }

    #[test]
    fn converts_request_permissions_into_canonical_granted_permissions() {
        assert_eq!(
            granted_permission_profile_from_request(CoreRequestPermissionProfile {
                file_system: Some(FileSystemPermissions {
                    entries: vec![FileSystemSandboxEntry {
                        path: FileSystemPath::Special {
                            value: FileSystemSpecialPath::Root,
                        },
                        access: FileSystemAccessMode::Write,
                    }],
                    glob_scan_max_depth: None,
                }),
                ..Default::default()
            }),
            agiworkforce_app_server_protocol::GrantedPermissionProfile {
                network: None,
                file_system: Some(agiworkforce_app_server_protocol::AdditionalFileSystemPermissions {
                    read: None,
                    write: None,
                    glob_scan_max_depth: None,
                    entries: Some(vec![agiworkforce_app_server_protocol::FileSystemSandboxEntry {
                        path: agiworkforce_app_server_protocol::FileSystemPath::Special {
                            value: agiworkforce_app_server_protocol::FileSystemSpecialPath::Root,
                        },
                        access: agiworkforce_app_server_protocol::FileSystemAccessMode::Write,
                    },]),
                }),
            }
        );
    }
}
