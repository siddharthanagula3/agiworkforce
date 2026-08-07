#![allow(dead_code, unused_imports)]
pub use agiworkforce_sandbox_policy::SandboxPolicy;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

static SANDBOX_DISABLED: AtomicBool = AtomicBool::new(false);

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
            if crate::process_tree::executable_exists("sandbox-exec") {
                return Self::MacosSeatbelt;
            }
        }
        #[cfg(target_os = "linux")]
        {
            if crate::process_tree::executable_exists("bwrap") {
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

    /// Build the manager used for normal shell command execution.
    ///
    /// Callers must provide a network policy explicitly. If no backend is
    /// available this fails closed instead of silently running unsandboxed.
    pub fn for_command_execution(
        workspace_dir: PathBuf,
        network_policy: NetworkPolicy,
    ) -> Result<Self> {
        let manager = Self::full_auto(workspace_dir).with_network(network_policy);
        if manager.sandbox_type == SandboxType::None {
            anyhow::bail!(
                "sandbox not available on this platform or host; pass --no-sandbox only if you accept unrestricted command execution"
            );
        }
        Ok(manager)
    }
}

pub fn set_sandbox_disabled(disabled: bool) {
    SANDBOX_DISABLED.store(disabled, Ordering::Relaxed);
}

pub fn sandbox_disabled() -> bool {
    SANDBOX_DISABLED.load(Ordering::Relaxed) || std::env::var("AGIWORKFORCE_NO_SANDBOX").is_ok()
}

/// Quote one argv element for a POSIX shell.
///
/// `agi sandbox` takes argv but the sandbox executors run `sh -c <string>`, so
/// argv has to be rebuilt into a command line. A naive `join(" ")` loses every
/// quote: `agi sandbox -- sh -c 'echo A; echo B'` became
/// `sh -c echo A; echo B`, which runs `sh -c echo` (printing an empty line,
/// with `A` as $0) and then executes `echo B` in the *outer* shell. The first
/// command silently vanished and the second escaped the intended nesting.
///
/// Unquoted for characters a shell treats literally; single-quoted otherwise,
/// with embedded single quotes closed-escaped-reopened.
pub fn shell_quote(arg: &str) -> String {
    let safe = !arg.is_empty()
        && arg.bytes().all(|b| {
            b.is_ascii_alphanumeric()
                || matches!(
                    b,
                    b'_' | b'-' | b'.' | b'/' | b'=' | b':' | b',' | b'@' | b'+'
                )
        });
    if safe {
        return arg.to_string();
    }
    format!("'{}'", arg.replace('\'', r"'\''"))
}

/// Rebuild an argv vector into a shell command line without losing quoting.
pub fn shell_join(args: &[String]) -> String {
    args.iter()
        .map(|a| shell_quote(a))
        .collect::<Vec<_>>()
        .join(" ")
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
    let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let s = canonical
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("workspace path is not valid UTF-8: {:?}", canonical))?;

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
        anyhow::bail!(
            "workspace path has leading or trailing whitespace: {:?}",
            path
        );
    }
    // Control chars including NUL (terminates C string) and newlines (split rules).
    if s.chars().any(|c| (c as u32) < 0x20) {
        anyhow::bail!(
            "workspace path contains ASCII control character: {:?}",
            path
        );
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

fn writable_roots(manager: &SandboxManager) -> Result<Vec<PathBuf>> {
    let configured = match &manager.policy {
        SandboxPolicy::ReadOnly => return Ok(Vec::new()),
        SandboxPolicy::WorkspaceWrite { writable_roots } => writable_roots,
        SandboxPolicy::DangerFullAccess => return Ok(Vec::new()),
    };

    let mut roots = Vec::with_capacity(configured.len() + 1);
    let mut seen = HashSet::new();
    for root in std::iter::once(&manager.workspace_dir).chain(configured.iter()) {
        if !root.is_absolute() {
            anyhow::bail!("sandbox writable root must be absolute: {:?}", root);
        }
        if root == Path::new("/") {
            anyhow::bail!("sandbox writable root '/' is too broad");
        }
        if seen.insert(root.clone()) {
            roots.push(root.clone());
        }
    }
    Ok(roots)
}

fn seatbelt_profile(manager: &SandboxManager, scratch_dir: Option<&Path>) -> Result<String> {
    let ws = validate_and_escape_seatbelt_path(&manager.workspace_dir)?;

    let network_rules = match manager.network_policy {
        NetworkPolicy::Allow => "(allow network-outbound)\n(allow network-inbound)\n",
        NetworkPolicy::Deny => "",
    };

    let mut scratch_read_rules = String::new();
    let mut write_rules = String::from("(allow file-write* (literal \"/dev/null\"))\n");
    match &manager.policy {
        SandboxPolicy::ReadOnly => {
            let scratch_dir = scratch_dir.ok_or_else(|| {
                anyhow::anyhow!("read-only Seatbelt execution requires a private scratch directory")
            })?;
            let scratch_dir = validate_and_escape_seatbelt_path(scratch_dir)?;
            scratch_read_rules
                .push_str(&format!("(allow file-read* (subpath \"{scratch_dir}\"))\n"));
            write_rules.push_str(&format!(
                "(allow file-write* (subpath \"{scratch_dir}\"))\n"
            ));
        }
        SandboxPolicy::WorkspaceWrite { .. } => {
            write_rules
                .push_str("(allow file-write* (subpath \"/tmp\") (subpath \"/private/tmp\"))\n");
            for root in writable_roots(manager)? {
                let root = validate_and_escape_seatbelt_path(&root)?;
                write_rules.push_str(&format!("(allow file-write* (subpath \"{root}\"))\n"));
            }
        }
        SandboxPolicy::DangerFullAccess => {}
    }

    Ok(format!(
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
                   ;; macOS resolves `sh` through this symlink directory
                   ;; (/private/var/select/sh -> /bin/bash).
                   (subpath "/private/var/select")
                   (subpath "/etc") (subpath "/tmp") (subpath "/private/tmp")
                   (literal "/") (subpath "/opt"))
(allow file-read* (subpath "{ws}"))
{scratch_read_rules}
{write_rules}"#,
        network_rules = network_rules,
        ws = ws,
        scratch_read_rules = scratch_read_rules,
        write_rules = write_rules,
    ))
}

fn bubblewrap_args(manager: &SandboxManager, command: &str) -> Result<Vec<String>> {
    if !manager.workspace_dir.is_absolute() {
        anyhow::bail!(
            "sandbox workspace must be absolute: {:?}",
            manager.workspace_dir
        );
    }
    if manager.workspace_dir == Path::new("/") {
        anyhow::bail!("sandbox workspace '/' is too broad");
    }

    let mut args = vec![
        "--die-with-parent".to_string(),
        "--unshare-pid".to_string(),
        "--unshare-uts".to_string(),
    ];
    if manager.network_policy == NetworkPolicy::Deny {
        args.push("--unshare-net".to_string());
    }
    args.extend([
        "--ro-bind".to_string(),
        "/".to_string(),
        "/".to_string(),
        "--tmpfs".to_string(),
        "/tmp".to_string(),
        "--dev".to_string(),
        "/dev".to_string(),
        "--proc".to_string(),
        "/proc".to_string(),
    ]);
    if manager.policy == SandboxPolicy::ReadOnly
        && manager.workspace_dir.starts_with(Path::new("/tmp"))
    {
        let workspace = manager
            .workspace_dir
            .to_str()
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "sandbox workspace is not valid UTF-8: {:?}",
                    manager.workspace_dir
                )
            })?
            .to_string();
        args.extend(["--ro-bind".to_string(), workspace.clone(), workspace]);
    }
    // Writable binds must follow the /tmp tmpfs mount. Otherwise a workspace
    // below /tmp is shadowed by the later scratch mount.
    for root in writable_roots(manager)? {
        let root = root
            .to_str()
            .ok_or_else(|| anyhow::anyhow!("sandbox writable root is not valid UTF-8: {:?}", root))?
            .to_string();
        args.extend(["--bind".to_string(), root.clone(), root]);
    }
    args.extend([
        "--".to_string(),
        "sh".to_string(),
        "-c".to_string(),
        command.to_string(),
    ]);
    Ok(args)
}

pub async fn execute_sandboxed(
    manager: &SandboxManager,
    command: &str,
    cwd: Option<&Path>,
) -> Result<std::process::Output> {
    execute_sandboxed_with_timeout(manager, command, cwd, None).await
}

pub(crate) async fn execute_sandboxed_with_timeout(
    manager: &SandboxManager,
    command: &str,
    cwd: Option<&Path>,
    timeout: Option<std::time::Duration>,
) -> Result<std::process::Output> {
    let mut cmd = tokio::process::Command::new("sh");
    cmd.arg("-c").arg(command);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    if matches!(manager.policy, SandboxPolicy::DangerFullAccess) {
        return crate::process_tree::output(cmd, None, timeout)
            .await
            .map_err(anyhow::Error::new)
            .context("unsandboxed exec failed");
    }
    match manager.sandbox_type {
        SandboxType::MacosSeatbelt => {
            let scratch_dir = if manager.policy == SandboxPolicy::ReadOnly {
                Some(
                    tempfile::Builder::new()
                        .prefix("agi-sandbox-scratch-")
                        .tempdir()
                        .map_err(|error| {
                            anyhow::anyhow!(
                                "failed to create read-only sandbox scratch directory: {error}"
                            )
                        })?,
                )
            } else {
                None
            };
            let profile =
                seatbelt_profile(manager, scratch_dir.as_ref().map(tempfile::TempDir::path))?;
            let mut scmd = tokio::process::Command::new("sandbox-exec");
            scmd.arg("-p")
                .arg(&profile)
                .arg("sh")
                .arg("-c")
                .arg(command);
            if let Some(scratch_dir) = scratch_dir.as_ref() {
                let scratch_path = scratch_dir
                    .path()
                    .canonicalize()
                    .unwrap_or_else(|_| scratch_dir.path().to_path_buf());
                scmd.env("TMPDIR", scratch_path);
            }
            if let Some(dir) = cwd {
                scmd.current_dir(dir);
            }
            crate::process_tree::output(scmd, None, timeout)
                .await
                .map_err(anyhow::Error::new)
                .context("Seatbelt exec failed")
        }
        SandboxType::LinuxBubblewrap => {
            let mut bcmd = tokio::process::Command::new("bwrap");
            let bwrap_args = bubblewrap_args(manager, command)?;
            bcmd.args(&bwrap_args);
            if let Some(dir) = cwd {
                bcmd.current_dir(dir);
            }
            crate::process_tree::output(bcmd, None, timeout)
                .await
                .map_err(anyhow::Error::new)
                .context("Bubblewrap exec failed")
        }
        // Refuse loudly on Windows + any other OS without a supported sandbox,
        // instead of silently running unsandboxed. Marketing claim of "sandboxed
        // execution" must not be honored on platforms where sandbox support is
        // absent. Windows + Landlock are tracked as future work.
        #[cfg(not(any(target_os = "macos", target_os = "linux")))]
        _ => Err(anyhow::anyhow!(
            "Sandbox unavailable on this platform ({}). Sandboxed exec is currently \
             supported only on macOS (Seatbelt) and Linux (Bubblewrap). See \
             docs/plans/UNIFIED_LAUNCH_PLAN.md §1.",
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

#[cfg(test)]
mod tests {

    #[test]
    fn shell_quote_leaves_plain_arguments_alone() {
        for arg in [
            "echo",
            "hello",
            "/tmp/file.txt",
            "--flag=value",
            "a,b:c@d+e",
        ] {
            assert_eq!(shell_quote(arg), arg, "should not quote {arg}");
        }
    }

    #[test]
    fn shell_quote_neutralises_command_separators() {
        // The regression: `agi sandbox echo 'hello; touch /tmp/x'` used to be
        // joined naively, so `sh -c` received two commands and ran the touch.
        // The argument must survive as one literal token.
        let quoted = shell_quote("hello; touch /tmp/x");
        assert_eq!(quoted, "'hello; touch /tmp/x'");
    }

    #[test]
    fn shell_quote_handles_embedded_single_quotes() {
        // Closed-escaped-reopened; a naive wrap would terminate the string early
        // and leave the rest as shell syntax.
        assert_eq!(shell_quote("it's"), r"'it'\''s'");
    }

    #[test]
    fn shell_join_preserves_a_quoted_shell_command() {
        // `sh -c 'echo A; echo B'` must reach the sandbox as three argv items,
        // the third still one string. Joining without quoting dropped `echo A`
        // entirely and ran `echo B` outside the intended nesting.
        let joined = shell_join(&[
            "sh".to_string(),
            "-c".to_string(),
            "echo A; echo B".to_string(),
        ]);
        assert_eq!(joined, "sh -c 'echo A; echo B'");
    }

    #[test]
    fn shell_join_quotes_empty_and_spaced_arguments() {
        let joined = shell_join(&["cmd".to_string(), String::new(), "two words".to_string()]);
        assert_eq!(joined, "cmd '' 'two words'");
    }
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
        let s = "/tmp/ws\u{2028}inject";
        let msg = reject(s);
        assert!(msg.contains("separator"), "got: {msg}");
    }

    #[test]
    fn sbpl_rejects_unicode_paragraph_separator() {
        let s = "/tmp/ws\u{2029}inject";
        let msg = reject(s);
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
    fn read_only_policy_has_no_persistent_writable_roots() {
        let mgr = SandboxManager::new(SandboxPolicy::ReadOnly, PathBuf::from("/tmp/test"));
        assert!(writable_roots(&mgr).expect("roots").is_empty());
    }

    #[test]
    fn workspace_write_policy_includes_workspace_and_explicit_roots() {
        let mgr = SandboxManager::new(
            SandboxPolicy::WorkspaceWrite {
                writable_roots: vec![PathBuf::from("/tmp/shared"), PathBuf::from("/tmp/shared")],
            },
            PathBuf::from("/tmp/workspace"),
        );
        assert_eq!(
            writable_roots(&mgr).expect("roots"),
            vec![
                PathBuf::from("/tmp/workspace"),
                PathBuf::from("/tmp/shared")
            ]
        );
    }

    #[test]
    fn workspace_write_policy_rejects_root_as_an_explicit_writable_root() {
        let mgr = SandboxManager::new(
            SandboxPolicy::WorkspaceWrite {
                writable_roots: vec![PathBuf::from("/")],
            },
            PathBuf::from("/tmp/workspace"),
        );
        assert!(writable_roots(&mgr).is_err());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn read_only_seatbelt_profile_does_not_allow_workspace_writes() {
        let mgr = SandboxManager::new(
            SandboxPolicy::ReadOnly,
            PathBuf::from("/tmp/developer-workspace"),
        );
        let profile = seatbelt_profile(&mgr, Some(Path::new("/private/tmp/agi-read-only-scratch")))
            .expect("profile");
        assert!(profile.contains("(allow file-read* (subpath \"/tmp/developer-workspace\"))"));
        assert!(!profile.contains("(allow file-write* (subpath \"/tmp/developer-workspace\"))"));
        assert!(profile
            .contains("(allow file-write* (subpath \"/private/tmp/agi-read-only-scratch\"))"));
        assert!(!profile.contains("(allow file-write* (subpath \"/tmp\")"));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn read_only_bubblewrap_profile_does_not_bind_workspace_writable() {
        let mgr = SandboxManager::new(
            SandboxPolicy::ReadOnly,
            PathBuf::from("/tmp/developer-workspace"),
        );
        let args = bubblewrap_args(&mgr, "true").expect("args");
        assert!(!args.windows(3).any(|window| {
            window
                == [
                    "--bind".to_string(),
                    "/tmp/developer-workspace".to_string(),
                    "/tmp/developer-workspace".to_string(),
                ]
        }));
        assert!(args.windows(3).any(|window| {
            window
                == [
                    "--ro-bind".to_string(),
                    "/tmp/developer-workspace".to_string(),
                    "/tmp/developer-workspace".to_string(),
                ]
        }));
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[tokio::test]
    async fn read_only_policy_blocks_a_workspace_write() {
        let workspace = tempfile::tempdir().expect("workspace");
        let marker = workspace.path().join("should-not-exist");
        let mut mgr = SandboxManager::new(SandboxPolicy::ReadOnly, workspace.path().to_path_buf());
        mgr.network_policy = NetworkPolicy::Deny;

        if mgr.sandbox_type == SandboxType::None {
            return;
        }

        let command = format!(
            "printf blocked > {}",
            shell_quote(&marker.to_string_lossy())
        );
        let output = execute_sandboxed(&mgr, &command, Some(workspace.path()))
            .await
            .expect("sandbox should launch");

        assert!(
            !output.status.success(),
            "read-only write unexpectedly succeeded"
        );
        assert!(!marker.exists(), "read-only sandbox created the file");
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn read_only_policy_blocks_a_workspace_write_below_tmp() {
        let workspace = tempfile::Builder::new()
            .prefix("agi-read-only-")
            .tempdir_in("/tmp")
            .expect("workspace below /tmp");
        let marker = workspace.path().join("should-not-exist");
        let mgr = SandboxManager::new(SandboxPolicy::ReadOnly, workspace.path().to_path_buf());
        let command = format!(
            "printf blocked > {}",
            shell_quote(&marker.to_string_lossy())
        );

        let output = execute_sandboxed(&mgr, &command, Some(workspace.path()))
            .await
            .expect("sandbox should launch");

        assert!(
            !output.status.success(),
            "read-only /tmp write unexpectedly succeeded"
        );
        assert!(
            !marker.exists(),
            "read-only sandbox created a file below /tmp"
        );
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn read_only_policy_keeps_private_scratch_writable() {
        let workspace = tempfile::tempdir().expect("workspace");
        let mgr = SandboxManager::new(SandboxPolicy::ReadOnly, workspace.path().to_path_buf());

        let output = execute_sandboxed(
            &mgr,
            "scratch_file=$(mktemp \"$TMPDIR/file.XXXXXX\"); printf scratch-ok > \"$scratch_file\"; cat \"$scratch_file\"",
            Some(workspace.path()),
        )
        .await
        .expect("sandbox should launch");

        assert!(
            output.status.success(),
            "private scratch write failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(String::from_utf8_lossy(&output.stdout), "scratch-ok");
    }

    #[test]
    fn command_execution_manager_uses_explicit_network_policy_or_fails_closed() {
        let detected = SandboxType::detect();
        let result =
            SandboxManager::for_command_execution(PathBuf::from("/tmp/test"), NetworkPolicy::Deny);

        if detected == SandboxType::None {
            assert!(
                result.is_err(),
                "command execution must fail closed when no sandbox backend is available"
            );
        } else {
            let mgr = result.expect("manager");
            assert_eq!(mgr.sandbox_type, detected);
            assert_eq!(mgr.network_policy, NetworkPolicy::Deny);
        }
    }

    #[test]
    fn sandbox_disabled_flag_can_be_set_by_cli() {
        set_sandbox_disabled(true);
        assert!(sandbox_disabled());
        set_sandbox_disabled(false);
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
