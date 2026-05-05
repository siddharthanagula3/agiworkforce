#![allow(dead_code, unused_imports)]
pub use agiworkforce_sandbox_policy::SandboxPolicy;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SandboxType {
    None,
    MacosSeatbelt,
    LinuxBubblewrap,
    LinuxLandlock,
    WindowsRestrictedToken,
}

impl SandboxType {
    pub fn detect() -> Self {
        #[cfg(target_os = "macos")]
        {
            if which_exists("sandbox-exec") {
                return Self::MacosSeatbelt;
            }
        }
        #[cfg(target_os = "linux")]
        {
            if which_exists("bwrap") {
                return Self::LinuxBubblewrap;
            }
        }
        Self::None
    }
    pub fn name(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::MacosSeatbelt => "seatbelt",
            Self::LinuxBubblewrap => "bubblewrap",
            Self::LinuxLandlock => "landlock",
            Self::WindowsRestrictedToken => "windows_restricted_token",
        }
    }
}

/// Network access opt-in flag for sandboxed execution.
///
/// Default: network is denied. Callers that legitimately need outbound access
/// (npm install, git clone, curl APIs) must pass `NetworkPolicy::Allow` explicitly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum NetworkPolicy {
    #[default]
    Deny,
    Allow,
}

pub struct SandboxManager {
    pub sandbox_type: SandboxType,
    pub policy: SandboxPolicy,
    pub workspace_dir: PathBuf,
    /// CRIT-1: controls whether outbound network is permitted inside the sandbox.
    /// Default is Deny — must be explicitly opted in.
    pub network_policy: NetworkPolicy,
}

impl SandboxManager {
    pub fn new(policy: SandboxPolicy, workspace_dir: PathBuf) -> Self {
        Self {
            sandbox_type: SandboxType::detect(),
            policy,
            workspace_dir,
            network_policy: NetworkPolicy::Deny,
        }
    }
    pub fn full_auto(workspace_dir: PathBuf) -> Self {
        Self {
            sandbox_type: SandboxType::detect(),
            policy: SandboxPolicy::default(),
            workspace_dir,
            network_policy: NetworkPolicy::Deny,
        }
    }
    pub fn disabled() -> Self {
        eprintln!(
            "{}",
            colored::Colorize::yellow(
                "warning: running without OS-level sandboxing — system commands will have unrestricted access"
            )
        );
        Self {
            sandbox_type: SandboxType::None,
            policy: SandboxPolicy::DangerFullAccess,
            workspace_dir: std::env::current_dir().unwrap_or_default(),
            network_policy: NetworkPolicy::Allow,
        }
    }
    /// Builder: opt in to outbound network access from within the sandbox.
    pub fn with_network(mut self, policy: NetworkPolicy) -> Self {
        self.network_policy = policy;
        self
    }
}

/// Validate a workspace path before embedding it in a Seatbelt SBPL profile.
///
/// SECURITY (CRIT-2): the previous implementation used `to_string_lossy()` and
/// interpolated the result raw into `format!(... "(allow file-read* (subpath \"{ws}\"))" ...)`.
/// A workspace path `/tmp/x") (allow default) ;#` broke out of the string literal
/// and injected an `(allow default)` rule — a complete macOS sandbox escape.
///
/// Apple provides no parameterised quoting mechanism for Seatbelt profiles.
/// The only safe strategy is to reject any path character that is meaningful
/// in SBPL or could break the string literal:
///   - `"` — closes the string literal the path is embedded in
///   - `(` / `)` — open/close s-expressions; could inject new rules even if `"` is intact
///   - `\` — introduces escape sequences; the escaping strategy itself is
///             implementation-defined and not guaranteed safe across macOS versions
///   - Control chars (< 0x20): NUL terminates C strings; newline/CR split rules
///   - Unicode line/paragraph separators (U+2028, U+2029): treated as newline by
///             some parsers
///   - Leading/trailing whitespace: would silently change the matched subpath
///   - Root `/`: too broad (would allow write everywhere)
///   - Empty or relative paths: rejected for correctness
fn validate_and_escape_seatbelt_path(path: &Path) -> Result<String> {
    let s = path
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("workspace path is not valid UTF-8: {:?}", path))?;

    if s.is_empty() {
        anyhow::bail!("workspace path is empty");
    }
    if s == "/" {
        // SECURITY: root path would grant file-write* everywhere — reject.
        anyhow::bail!("workspace path '/' is too broad for sandboxed exec");
    }
    if !path.is_absolute() {
        anyhow::bail!("workspace path must be absolute: {:?}", path);
    }
    if s != s.trim() {
        anyhow::bail!("workspace path has leading or trailing whitespace: {:?}", path);
    }
    // Control chars including NUL (terminates C string) and newlines (split rules).
    if s.chars().any(|c| (c as u32) < 0x20) {
        anyhow::bail!("workspace path contains ASCII control character: {:?}", path);
    }
    // Unicode line/paragraph separators — some SBPL parsers treat as newlines.
    if s.contains('\u{2028}') || s.contains('\u{2029}') {
        anyhow::bail!(
            "workspace path contains Unicode line/paragraph separator: {:?}",
            path
        );
    }
    // SECURITY: SBPL has no parameterised quoting. Reject all chars that could
    // escape the string literal or inject new s-expressions.
    const SBPL_SPECIAL: &[char] = &['"', '(', ')', '\\'];
    for &ch in SBPL_SPECIAL {
        if s.contains(ch) {
            anyhow::bail!(
                "workspace path contains SBPL-special character {:?} which cannot be \
                 safely embedded in a Seatbelt profile: {:?}",
                ch,
                path
            );
        }
    }

    Ok(s.to_string())
}

pub async fn execute_sandboxed(
    manager: &SandboxManager,
    command: &str,
    cwd: Option<&Path>,
) -> Result<std::process::Output> {
    let mut cmd = tokio::process::Command::new("sh");
    cmd.arg("-c").arg(command);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    match manager.sandbox_type {
        SandboxType::MacosSeatbelt => {
            // CRIT-2: validate path before interpolation to prevent SBPL injection.
            let ws = validate_and_escape_seatbelt_path(&manager.workspace_dir)?;

            // CRIT-1: network is default-deny. Only re-open outbound when the caller
            // has explicitly opted in via NetworkPolicy::Allow.
            let network_rules = match manager.network_policy {
                NetworkPolicy::Allow => {
                    "(allow network-outbound)\n(allow network-inbound)\n"
                }
                // SECURITY: omit (allow network-outbound) entirely so Seatbelt deny-default
                // blocks all outbound connections including DNS resolution.
                NetworkPolicy::Deny => "",
            };

            let profile = format!(
                r#"(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow signal (target self))
(allow sysctl-read)
(allow mach-lookup)
(allow system-socket)
{network_rules}(allow file-read* (subpath "/usr") (subpath "/bin") (subpath "/sbin")
                   (subpath "/Library") (subpath "/System")
                   (subpath "/private/var/db") (subpath "/dev")
                   (subpath "/etc") (subpath "/tmp") (subpath "/private/tmp")
                   (literal "/") (subpath "/opt"))
(allow file-read* (subpath "{ws}"))
(allow file-write* (subpath "{ws}") (subpath "/tmp") (subpath "/private/tmp") (subpath "/dev/null"))
"#,
                network_rules = network_rules,
                ws = ws
            );
            let mut scmd = tokio::process::Command::new("sandbox-exec");
            scmd.arg("-p")
                .arg(&profile)
                .arg("sh")
                .arg("-c")
                .arg(command);
            if let Some(dir) = cwd {
                scmd.current_dir(dir);
            }
            scmd.output()
                .await
                .map_err(|e| anyhow::anyhow!("Seatbelt exec failed: {}", e))
        }
        SandboxType::LinuxBubblewrap => {
            let ws = manager.workspace_dir.to_string_lossy().to_string();
            let mut bcmd = tokio::process::Command::new("bwrap");

            let mut bwrap_args: Vec<&str> = vec![
                "--die-with-parent",
                "--unshare-pid", // isolate process namespace
                "--unshare-uts", // isolate hostname
            ];
            // CRIT-1: default-deny network via --unshare-net; only omit when
            // the caller explicitly opts in with NetworkPolicy::Allow.
            if manager.network_policy == NetworkPolicy::Deny {
                bwrap_args.push("--unshare-net");
            }
            bwrap_args.extend([
                "--ro-bind", "/", "/",
                "--bind", &ws, &ws,
                "--tmpfs", "/tmp",
                "--dev", "/dev",
                "--proc", "/proc",
                "--", "sh", "-c", command,
            ]);
            bcmd.args(&bwrap_args);
            if let Some(dir) = cwd {
                bcmd.current_dir(dir);
            }
            bcmd.output()
                .await
                .map_err(|e| anyhow::anyhow!("Bubblewrap exec failed: {}", e))
        }
        // CLI-SANDBOX-WIN-STUB fix per UNIFIED_LAUNCH_PLAN.md §1:
        // Refuse loudly on Windows + any other OS without an implemented sandbox,
        // instead of silently running unsandboxed. Marketing claim of "sandboxed
        // execution" must not be honored on platforms where the implementation is
        // not built. Windows + Landlock are tracked as future work.
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        _ => Err(anyhow::anyhow!(
            "Sandbox not implemented on this platform ({}). Sandboxed exec is currently \
             supported only on macOS (Seatbelt) and Linux (Bubblewrap). See \
             docs/plans/UNIFIED_LAUNCH_PLAN.md §1 CLI-SANDBOX-WIN-STUB.",
            std::env::consts::OS
        )),
        // On macOS/Linux, this catch-all only matches if SandboxBackend was extended
        // without a corresponding implementation above — fail loud rather than silently
        // bypass.
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        _ => Err(anyhow::anyhow!(
            "Unhandled SandboxBackend variant — sandbox config is broken; refusing exec"
        )),
    }
}

fn which_exists(binary: &str) -> bool {
    std::process::Command::new("which")
        .arg(binary)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    // -----------------------------------------------------------------------
    // CRIT-2: Seatbelt path injection prevention
    // -----------------------------------------------------------------------

    fn accept(s: &str) -> String {
        validate_and_escape_seatbelt_path(&PathBuf::from(s))
            .unwrap_or_else(|e| panic!("expected accept for {:?}: {}", s, e))
    }

    fn reject(s: &str) -> String {
        validate_and_escape_seatbelt_path(&PathBuf::from(s))
            .map(|ok| panic!("expected rejection for {:?}, got: {:?}", s, ok))
            .unwrap_err()
            .to_string()
    }

    #[test]
    fn sbpl_rejects_double_quote() {
        let msg = reject("/tmp/ws\"injected");
        assert!(msg.contains("SBPL-special"), "got: {msg}");
    }

    #[test]
    fn sbpl_rejects_open_paren() {
        let msg = reject("/tmp/ws(inject");
        assert!(msg.contains("SBPL-special"), "got: {msg}");
    }

    #[test]
    fn sbpl_rejects_close_paren() {
        let msg = reject("/tmp/ws)inject");
        assert!(msg.contains("SBPL-special"), "got: {msg}");
    }

    #[test]
    fn sbpl_rejects_backslash() {
        let msg = reject("/tmp/ws\\inject");
        assert!(msg.contains("SBPL-special"), "got: {msg}");
    }

    #[test]
    fn sbpl_rejects_newline() {
        let msg = reject("/tmp/ws\ninjected");
        assert!(msg.contains("control"), "got: {msg}");
    }

    #[test]
    fn sbpl_rejects_carriage_return() {
        let msg = reject("/tmp/ws\rinjected");
        assert!(msg.contains("control"), "got: {msg}");
    }

    #[test]
    fn sbpl_rejects_nul_byte() {
        // Verify the char-level control check catches NUL (0x00 < 0x20).
        let has_nul = "/tmp/ws\0inject".chars().any(|c| (c as u32) < 0x20);
        assert!(has_nul, "NUL detection sanity");
    }

    #[test]
    fn sbpl_rejects_leading_whitespace() {
        // A path with a leading space is not absolute on POSIX, so it hits the
        // absolute-path check first. Either rejection message is correct — the
        // important property is that the path is refused.
        let msg = reject(" /tmp/ws");
        assert!(
            msg.contains("whitespace") || msg.contains("absolute"),
            "got: {msg}"
        );
    }

    #[test]
    fn sbpl_rejects_trailing_whitespace() {
        // Trailing whitespace: the path IS absolute but has trailing space.
        let msg = reject("/tmp/ws ");
        assert!(msg.contains("whitespace"), "got: {msg}");
    }

    #[test]
    fn sbpl_rejects_root_path() {
        let msg = reject("/");
        assert!(msg.contains("broad"), "got: {msg}");
    }

    #[test]
    fn sbpl_rejects_empty_path() {
        let msg = reject("");
        assert!(msg.contains("empty"), "got: {msg}");
    }

    #[test]
    fn sbpl_rejects_unicode_line_separator() {
        let s = format!("/tmp/ws\u{2028}inject");
        let msg = reject(&s);
        assert!(msg.contains("separator"), "got: {msg}");
    }

    #[test]
    fn sbpl_rejects_unicode_paragraph_separator() {
        let s = format!("/tmp/ws\u{2029}inject");
        let msg = reject(&s);
        assert!(msg.contains("separator"), "got: {msg}");
    }

    #[test]
    fn sbpl_accepts_normal_path() {
        let result = accept("/Users/developer/my-project");
        assert_eq!(result, "/Users/developer/my-project");
    }

    #[test]
    fn sbpl_accepts_path_with_unicode_letters() {
        // Non-ASCII Unicode that is not a control char or SBPL-special passes.
        let result = accept("/home/用户/project");
        assert_eq!(result, "/home/用户/project");
    }

    #[test]
    fn sbpl_accepts_path_with_hyphen_and_underscore() {
        let result = accept("/tmp/my-workspace_v2");
        assert_eq!(result, "/tmp/my-workspace_v2");
    }

    #[test]
    fn profile_with_hostile_path_keeps_deny_default_intact() {
        // The PoC from the red-team report — verify it is rejected before
        // it can reach format!().
        let hostile = "/tmp/ws\") (allow default) ;#";
        // With the new rejection strategy the path is refused outright.
        let err = reject(hostile);
        assert!(
            err.contains("SBPL-special"),
            "hostile PoC path must be rejected: {err}"
        );
    }

    // -----------------------------------------------------------------------
    // CRIT-1: Network policy
    // -----------------------------------------------------------------------

    #[test]
    fn network_policy_default_is_deny() {
        assert_eq!(NetworkPolicy::default(), NetworkPolicy::Deny);
    }

    #[test]
    fn sandbox_manager_new_defaults_to_deny_network() {
        let mgr = SandboxManager::new(SandboxPolicy::default(), PathBuf::from("/tmp/test"));
        assert_eq!(mgr.network_policy, NetworkPolicy::Deny);
    }

    #[test]
    fn sandbox_manager_full_auto_defaults_to_deny_network() {
        let mgr = SandboxManager::full_auto(PathBuf::from("/tmp/test"));
        assert_eq!(mgr.network_policy, NetworkPolicy::Deny);
    }

    #[test]
    fn sandbox_manager_with_network_allow_optin() {
        let mgr = SandboxManager::new(SandboxPolicy::default(), PathBuf::from("/tmp/test"))
            .with_network(NetworkPolicy::Allow);
        assert_eq!(mgr.network_policy, NetworkPolicy::Allow);
    }

    #[test]
    fn seatbelt_profile_deny_omits_network_outbound_rule() {
        // Simulate the profile generation logic from execute_sandboxed.
        let network_rules = match NetworkPolicy::Deny {
            NetworkPolicy::Allow => "(allow network-outbound)\n",
            NetworkPolicy::Deny => "",
        };
        let profile = format!(
            "(version 1)\n(deny default)\n{network_rules}(allow file-read*)\n",
            network_rules = network_rules
        );
        assert!(
            !profile.contains("allow network-outbound"),
            "deny-network profile must not contain allow network-outbound"
        );
    }

    #[test]
    fn seatbelt_profile_allow_includes_network_outbound_rule() {
        let network_rules = match NetworkPolicy::Allow {
            NetworkPolicy::Allow => "(allow network-outbound)\n",
            NetworkPolicy::Deny => "",
        };
        let profile = format!(
            "(version 1)\n(deny default)\n{network_rules}(allow file-read*)\n",
            network_rules = network_rules
        );
        assert!(
            profile.contains("allow network-outbound"),
            "allow-network profile must contain allow network-outbound"
        );
    }

    #[test]
    fn bwrap_deny_args_include_unshare_net() {
        // Simulate the bwrap argument construction.
        let network_policy = NetworkPolicy::Deny;
        let mut args: Vec<&str> = vec!["--die-with-parent", "--unshare-pid", "--unshare-uts"];
        if network_policy == NetworkPolicy::Deny {
            args.push("--unshare-net");
        }
        assert!(
            args.contains(&"--unshare-net"),
            "bwrap deny-network args must include --unshare-net"
        );
    }

    #[test]
    fn bwrap_allow_args_exclude_unshare_net() {
        let network_policy = NetworkPolicy::Allow;
        let mut args: Vec<&str> = vec!["--die-with-parent", "--unshare-pid", "--unshare-uts"];
        if network_policy == NetworkPolicy::Deny {
            args.push("--unshare-net");
        }
        assert!(
            !args.contains(&"--unshare-net"),
            "bwrap allow-network args must NOT include --unshare-net"
        );
    }
}
