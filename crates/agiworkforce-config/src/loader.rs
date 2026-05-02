use crate::cloud_requirements::CloudRequirementsLoader;
use crate::config_requirements::ConfigRequirementsWithSources;
use crate::state::ConfigLayerStack;
use crate::state::LoaderOverrides;
use crate::thread_config::ThreadConfigLoader;
use agiworkforce_file_system::ExecutorFileSystem;
use agiworkforce_utils_absolute_path::AbsolutePathBuf;
use std::path::Path;
use toml::Value as TomlValue;

/// Load a fully-merged `ConfigLayerStack` from disk, applying all layers:
/// CLI overrides, user config, project config, system config, managed config,
/// cloud requirements, and any thread-specific overrides.
///
/// This is the main entry point for loading configuration from disk.
pub async fn load_config_layers_state(
    _fs: &dyn ExecutorFileSystem,
    _agiworkforce_home: &Path,
    _cwd: Option<AbsolutePathBuf>,
    _cli_overrides: &[(String, TomlValue)],
    _loader_overrides: LoaderOverrides,
    _cloud_requirements_loader: CloudRequirementsLoader,
    _thread_config_loader: &dyn ThreadConfigLoader,
) -> std::io::Result<ConfigLayerStack> {
    // Stub — the real implementation lives in agiworkforce-core. Returning
    // an empty layer stack here lets callers (and their tests) proceed with
    // a "no project config loaded" view of the world rather than panicking
    // with todo!() inside the dep graph. Callers that need the real
    // loader still call into agiworkforce-core directly.
    Ok(ConfigLayerStack::default())
}

/// Load and merge requirements from a `requirements.toml` file into `target`.
///
/// Relative paths in the requirements file are resolved relative to the parent
/// directory of `requirements_file`.
pub async fn load_requirements_toml(
    _fs: &dyn ExecutorFileSystem,
    _target: &mut ConfigRequirementsWithSources,
    _requirements_file: &AbsolutePathBuf,
) -> anyhow::Result<()> {
    // Stub — same reasoning as load_config_layers_state above.
    Ok(())
}

/// Return the key used to store the trust level for `project_path` in
/// `config.toml`'s `[projects]` table.
pub fn project_trust_key(project_path: &Path) -> String {
    project_path.to_string_lossy().into_owned()
}

/// Resolve all `AbsolutePathBuf` fields in a raw TOML value that represent
/// relative paths, resolving them against `base`.
pub fn resolve_relative_paths_in_config_toml(
    _config: TomlValue,
    _base: &Path,
) -> TomlValue {
    todo!("resolve_relative_paths_in_config_toml: stub – real implementation lives in agiworkforce-core")
}

/// Load the global MCP server config from `AGIWORKFORCE_HOME/config.toml`.
pub async fn load_global_mcp_servers(
    _agiworkforce_home: &Path,
) -> std::io::Result<std::collections::BTreeMap<String, crate::types::McpServerConfig>> {
    todo!("load_global_mcp_servers: stub – real implementation lives in agiworkforce-core")
}
