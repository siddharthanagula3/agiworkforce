use agiworkforce_protocol::models::PermissionProfile;
use agiworkforce_protocol::permissions::FileSystemSandboxPolicy;
use agiworkforce_protocol::permissions::NetworkSandboxPolicy;
use agiworkforce_protocol::protocol::SandboxPolicy;
use agiworkforce_utils_absolute_path::AbsolutePathBuf;
use std::path::Path;

/// Arg0 (basename) used to identify the agiworkforce-linux-sandbox helper binary.
pub const AGIWORKFORCE_LINUX_SANDBOX_ARG0: &str = "agiworkforce-linux-sandbox";

/// Derive the Linux sandbox command args from a full `PermissionProfile`.
///
/// This wrapper computes the derived policies from the profile and delegates to
/// [`create_linux_sandbox_command_args_for_policies`].
pub fn create_linux_sandbox_command_args_for_permission_profile(
    command: Vec<String>,
    command_cwd: &Path,
    permission_profile: &PermissionProfile,
    sandbox_policy_cwd: &AbsolutePathBuf,
    use_legacy_landlock: bool,
    allow_network_for_proxy: bool,
) -> Vec<String> {
    let file_system_sandbox_policy = permission_profile.file_system_sandbox_policy();
    let network_sandbox_policy = permission_profile.network_sandbox_policy();
    let sandbox_policy = permission_profile
        .to_legacy_sandbox_policy(sandbox_policy_cwd.as_path())
        .unwrap_or(SandboxPolicy::DangerFullAccess);
    create_linux_sandbox_command_args_for_policies(
        command,
        command_cwd,
        &sandbox_policy,
        &file_system_sandbox_policy,
        network_sandbox_policy,
        sandbox_policy_cwd.as_path(),
        use_legacy_landlock,
        allow_network_for_proxy,
    )
}

pub fn allow_network_for_proxy(enforce_managed_network: bool) -> bool {
    // When managed network requirements are active, request proxy-only
    // networking from the Linux sandbox helper. Without managed requirements,
    // preserve existing behavior.
    enforce_managed_network
}

/// Converts the sandbox policies into the CLI invocation for
/// `codex-linux-sandbox`.
///
/// The helper performs the actual sandboxing (bubblewrap by default + seccomp) after
/// parsing these arguments. Policy JSON flags are emitted before helper feature
/// flags so the argv order matches the helper's CLI shape. See
/// `docs/linux_sandbox.md` for the Linux semantics.
#[allow(clippy::too_many_arguments)]
pub fn create_linux_sandbox_command_args_for_policies(
    command: Vec<String>,
    command_cwd: &Path,
    sandbox_policy: &SandboxPolicy,
    file_system_sandbox_policy: &FileSystemSandboxPolicy,
    network_sandbox_policy: NetworkSandboxPolicy,
    sandbox_policy_cwd: &Path,
    use_legacy_landlock: bool,
    allow_network_for_proxy: bool,
) -> Vec<String> {
    let sandbox_policy_json = serde_json::to_string(sandbox_policy)
        .unwrap_or_else(|err| panic!("failed to serialize sandbox policy: {err}"));
    let file_system_policy_json = serde_json::to_string(file_system_sandbox_policy)
        .unwrap_or_else(|err| panic!("failed to serialize filesystem sandbox policy: {err}"));
    let network_policy_json = serde_json::to_string(&network_sandbox_policy)
        .unwrap_or_else(|err| panic!("failed to serialize network sandbox policy: {err}"));
    let sandbox_policy_cwd = sandbox_policy_cwd
        .to_str()
        .unwrap_or_else(|| panic!("cwd must be valid UTF-8"))
        .to_string();
    let command_cwd = command_cwd
        .to_str()
        .unwrap_or_else(|| panic!("command cwd must be valid UTF-8"))
        .to_string();

    let mut linux_cmd: Vec<String> = vec![
        "--sandbox-policy-cwd".to_string(),
        sandbox_policy_cwd,
        "--command-cwd".to_string(),
        command_cwd,
        "--sandbox-policy".to_string(),
        sandbox_policy_json,
        "--file-system-sandbox-policy".to_string(),
        file_system_policy_json,
        "--network-sandbox-policy".to_string(),
        network_policy_json,
    ];
    if use_legacy_landlock {
        linux_cmd.push("--use-legacy-landlock".to_string());
    }
    if allow_network_for_proxy {
        linux_cmd.push("--allow-network-for-proxy".to_string());
    }
    linux_cmd.push("--".to_string());
    linux_cmd.extend(command);
    linux_cmd
}

/// Converts the sandbox cwd and execution options into the CLI invocation for
/// `codex-linux-sandbox`.
#[cfg_attr(not(test), allow(dead_code))]
fn create_linux_sandbox_command_args(
    command: Vec<String>,
    command_cwd: &Path,
    sandbox_policy_cwd: &Path,
    use_legacy_landlock: bool,
    allow_network_for_proxy: bool,
) -> Vec<String> {
    let command_cwd = command_cwd
        .to_str()
        .unwrap_or_else(|| panic!("command cwd must be valid UTF-8"))
        .to_string();
    let sandbox_policy_cwd = sandbox_policy_cwd
        .to_str()
        .unwrap_or_else(|| panic!("cwd must be valid UTF-8"))
        .to_string();

    let mut linux_cmd: Vec<String> = vec![
        "--sandbox-policy-cwd".to_string(),
        sandbox_policy_cwd,
        "--command-cwd".to_string(),
        command_cwd,
    ];
    if use_legacy_landlock {
        linux_cmd.push("--use-legacy-landlock".to_string());
    }
    if allow_network_for_proxy {
        linux_cmd.push("--allow-network-for-proxy".to_string());
    }

    // Separator so that command arguments starting with `-` are not parsed as
    // options of the helper itself.
    linux_cmd.push("--".to_string());

    // Append the original tool command.
    linux_cmd.extend(command);

    linux_cmd
}

#[cfg(test)]
#[path = "landlock_tests.rs"]
mod tests;
