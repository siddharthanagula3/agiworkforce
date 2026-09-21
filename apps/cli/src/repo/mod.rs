//! Repository detection shared by the app server, `agi doctor` and the prompt
//! context, so one checkout is described the same way on every surface.

pub mod index_policy;
pub mod layout;
pub mod setup;
pub mod workspace;

pub use index_policy::{
    classify, excluded_directory_names, ignored_by_git, index_decision, index_priority,
    prioritized, ExclusionClass, IndexLayer, IndexTiming, INDEX_LAYERS, MAX_INDEXED_FILE_BYTES,
};
pub use layout::{
    declared_submodules, detect_repository_layout, detect_version_control, git_config,
    initialize_repository, is_bare_repository, is_shallow_repository, nested_git_roots,
    parent_repository_root, parse_git_config_list, repository_config, resolve_default_remote,
    unsupported_version_control, HeadState, OperationAvailability, RepositoryLayout,
    RepositoryOperation, VersionControl, REPOSITORY_CONFIG_KEYS,
};
pub use setup::{
    database_setup, declared_env_variables, detect_package_managers, discover_dev_services,
    discover_environment_setup, discover_setup_sources, install_plan, setup_entry_point,
    DatabaseSetup, DevService, DevServiceKind, EnvDeclaration, EnvironmentSetup, InstallPlan,
    PackageManager, SetupCommand, SetupSource, SetupSourceKind,
};
pub use workspace::{
    expand_workspace_patterns, parse_cargo_workspace_members, parse_package_json_workspaces,
    parse_pnpm_workspace_packages, workspace_graph, WorkspaceGraph, WorkspaceMember,
};
