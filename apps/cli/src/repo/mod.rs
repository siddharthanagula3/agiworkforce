//! Repository detection shared by the app server, `agi doctor` and the prompt
//! context, so one checkout is described the same way on every surface.

pub mod layout;
pub mod workspace;

pub use layout::{
    detect_repository_layout, git_config, is_bare_repository, nested_git_roots,
    parent_repository_root, parse_git_config_list, repository_config, resolve_default_remote,
    HeadState, RepositoryLayout, REPOSITORY_CONFIG_KEYS,
};
pub use workspace::{
    expand_workspace_patterns, parse_cargo_workspace_members, parse_package_json_workspaces,
    parse_pnpm_workspace_packages, workspace_graph, WorkspaceGraph, WorkspaceMember,
};
