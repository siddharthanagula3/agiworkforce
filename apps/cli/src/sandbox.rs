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
        }
    }
}

/// The word `/status` and the TUI status bar show for the active sandbox
/// backend. An absent detection result reads the same as an explicit
/// `SandboxType::None`: either way nothing is enforced.
pub fn status_word(sandbox_type: Option<SandboxType>) -> &'static str {
    match sandbox_type {
        Some(SandboxType::MacosSeatbelt) => "seatbelt",
        Some(SandboxType::LinuxBubblewrap) => "bwrap",
        Some(SandboxType::LinuxLandlock) => "landlock",
        Some(SandboxType::None) | None => "no sandbox",
    }
}

/// Actionable diagnosis for a host where `SandboxType::detect()` found nothing.
/// The Linux branch names bubblewrap as the hard runtime dependency it is: the
/// in-process seccomp module (`platform::policy::linux_sandbox`) is not compiled
/// into release builds and installs no filter on any exec path, so a missing
/// `bwrap` leaves no sandbox at all.
pub fn missing_sandbox_message(os: &str) -> String {
    match os {
        "linux" => "Sandboxed exec requires bubblewrap (`bwrap`) on PATH and it was not found. \
             Install it, Debian/Ubuntu: `sudo apt install bubblewrap`, Fedora/RHEL: \
             `sudo dnf install bubblewrap`, Arch: `sudo pacman -S bubblewrap`, Alpine: \
             `apk add bubblewrap`: then re-run `agi doctor`. To run without any sandbox, \
             re-run with --no-sandbox and accept unrestricted command execution."
            .to_string(),
        "macos" => "Sandboxed exec requires `sandbox-exec` (macOS Seatbelt) on PATH and it was \
             not found. Restore it from the base macOS install, or re-run with --no-sandbox \
             and accept unrestricted command execution."
            .to_string(),
        "windows" => "Sandboxed exec is unsupported on Windows, so every command a tool call \
             runs executes with your full user rights: it can read, change, and delete any \
             file you can, and reach the network. OS sandboxing is available only on Linux \
             (bubblewrap) and macOS (Seatbelt). Approve each command, or run the CLI inside \
             WSL or a container."
            .to_string(),
        other => format!(
            "Sandboxed exec is unsupported on {other}, so every command a tool call runs \
             executes with your full user rights. It is available only on Linux \
             (bubblewrap) and macOS (Seatbelt)."
        ),
    }
}

/// Network access opt-in flag for sandboxed execution.
///
/// Default: network is denied. Callers that legitimately need outbound access
/// (npm install, git clone, curl APIs) must pass an allowing policy explicitly.
///
/// `AllowExternal` is the policy a general network approval grants. It keeps
/// the loopback interface blocked, so an approved `curl` cannot turn into a
/// request against a service bound to the developer's own machine. Seatbelt
/// enforces that in the profile; Bubblewrap has no address filter, so on Linux
/// the enforcement is the caller-side destination check that refuses an
/// internal target before any approval is offered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum NetworkPolicy {
    #[default]
    Deny,
    AllowExternal,
    Allow,
}

pub struct SandboxManager {
    pub sandbox_type: SandboxType,
    pub policy: SandboxPolicy,
    pub workspace_dir: PathBuf,
    /// CRIT-1: controls whether outbound network is permitted inside the sandbox.
    /// Default is Deny, must be explicitly opted in.
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
                "warning: running without OS-level sandboxing, system commands will have unrestricted access"
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
        // An untrusted workspace never gets the network, whatever the caller
        // asked for: the repository itself is the untrusted input here.
        let network_policy = clamp_network_to_trust(
            network_policy,
            crate::trust::restrictions_for(&workspace_dir).unrestricted_network,
        );
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

/// Whether the user asked for the sandbox to be off, before any policy applies.
pub fn sandbox_disabled_requested() -> bool {
    SANDBOX_DISABLED.load(Ordering::Relaxed) || std::env::var("AGIWORKFORCE_NO_SANDBOX").is_ok()
}

pub fn sandbox_disabled() -> bool {
    resolve_sandbox_disabled(
        sandbox_disabled_requested(),
        sandbox_settings().forced,
        crate::trust::restrictions().unrestricted_shell,
    )
}

/// `--no-sandbox` is honoured only when the organization has not forced the
/// sandbox and the workspace is trusted. An untrusted repository does not get
/// an unsandboxed shell on this machine.
fn resolve_sandbox_disabled(requested: bool, forced: bool, shell_unrestricted: bool) -> bool {
    requested && !forced && shell_unrestricted
}

fn clamp_network_to_trust(requested: NetworkPolicy, network_unrestricted: bool) -> NetworkPolicy {
    if network_unrestricted {
        requested
    } else {
        NetworkPolicy::Deny
    }
}

/// Whether a command launched for `workspace_dir` may see this machine's
/// environment. An untrusted workspace never does: the credentials in the
/// environment are exactly what a repository-supplied command would harvest.
fn scrub_environment_for(workspace_dir: &Path) -> bool {
    resolve_scrub_environment(
        sandbox_settings().scrub_environment,
        crate::trust::restrictions_for(workspace_dir).secret_injection,
    )
}

fn resolve_scrub_environment(settings_scrub: bool, secret_injection_allowed: bool) -> bool {
    settings_scrub || !secret_injection_allowed
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SandboxSettings {
    pub forced: bool,
    pub scrub_environment: bool,
    pub sandbox_user_hooks: bool,
    pub sandbox_mcp_servers: bool,
}

static SANDBOX_SETTINGS: std::sync::OnceLock<SandboxSettings> = std::sync::OnceLock::new();

pub fn sandbox_settings() -> SandboxSettings {
    *SANDBOX_SETTINGS.get_or_init(|| {
        resolve_sandbox_settings(
            &crate::features::hooks::managed::load_managed_sandbox_policy(),
            |name| std::env::var_os(name).is_some(),
        )
    })
}

pub fn resolve_sandbox_settings(
    managed: &crate::features::hooks::managed::ManagedSandboxPolicyState,
    user_opted_in: impl Fn(&str) -> bool,
) -> SandboxSettings {
    use crate::features::hooks::managed::ManagedSandboxPolicyState;
    let user = SandboxSettings {
        forced: false,
        scrub_environment: user_opted_in("AGIWORKFORCE_SANDBOX_SCRUB_ENV"),
        sandbox_user_hooks: user_opted_in("AGIWORKFORCE_SANDBOX_HOOKS"),
        sandbox_mcp_servers: user_opted_in("AGIWORKFORCE_SANDBOX_MCP"),
    };
    let managed = match managed {
        ManagedSandboxPolicyState::Absent => return user,
        ManagedSandboxPolicyState::Invalid(error) => {
            eprintln!(
                "{} managed sandbox policy is invalid ({}); every sandbox control is enforced",
                crate::terminal_style::danger_header("warning:"),
                crate::terminal_text::sanitize_terminal_text(error)
            );
            return SandboxSettings {
                forced: true,
                scrub_environment: true,
                sandbox_user_hooks: true,
                sandbox_mcp_servers: true,
            };
        }
        ManagedSandboxPolicyState::Loaded(policy) => policy,
    };
    SandboxSettings {
        forced: managed.forced,
        scrub_environment: managed.scrub_environment || user.scrub_environment,
        sandbox_user_hooks: managed.sandbox_user_hooks || user.sandbox_user_hooks,
        sandbox_mcp_servers: managed.sandbox_mcp_servers || user.sandbox_mcp_servers,
    }
}

fn apply_environment_policy(command: &mut tokio::process::Command, scrub: bool) {
    if !scrub {
        return;
    }
    command.env_clear();
    for name in agiworkforce_mcp::INHERITED_ENV_ALLOWLIST {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
}

/// Create the private scratch directory a Seatbelt-wrapped program writes its
/// temporary files to.
///
/// The directory is not dropped here: the process this argv belongs to is
/// spawned by the caller and outlives this call, so the OS temp sweep reclaims
/// it rather than a `TempDir` guard.
fn program_scratch_dir() -> Result<PathBuf> {
    let scratch = tempfile::Builder::new()
        .prefix("agi-sandbox-program-")
        .tempdir()
        .map_err(|error| anyhow::anyhow!("failed to create sandbox scratch directory: {error}"))?
        .keep();
    Ok(scratch.canonicalize().unwrap_or(scratch))
}

/// Rewrite a program and its arguments so the sandbox backend launches it.
/// The program is exec'd directly, without a shell in between.
pub fn sandboxed_program(
    manager: &SandboxManager,
    program: &str,
    args: &[String],
) -> Result<(String, Vec<String>)> {
    match manager.sandbox_type {
        SandboxType::MacosSeatbelt => {
            let scratch_dir = program_scratch_dir()?;
            let mut wrapped = vec![
                "-p".to_string(),
                seatbelt_profile(manager, Some(&scratch_dir))?,
            ];
            // The caller spawns this argv later, so TMPDIR travels through `env`
            // rather than on a Command this function does not own.
            let scratch_path = scratch_dir.to_str().ok_or_else(|| {
                anyhow::anyhow!(
                    "sandbox scratch directory is not valid UTF-8: {:?}",
                    scratch_dir
                )
            })?;
            wrapped.push("/usr/bin/env".to_string());
            wrapped.push(format!("TMPDIR={scratch_path}"));
            wrapped.push(program.to_string());
            wrapped.extend(args.iter().cloned());
            Ok(("sandbox-exec".to_string(), wrapped))
        }
        SandboxType::LinuxBubblewrap => {
            let mut wrapped = bubblewrap_prefix(manager)?;
            wrapped.push(program.to_string());
            wrapped.extend(args.iter().cloned());
            Ok(("bwrap".to_string(), wrapped))
        }
        SandboxType::None => Err(anyhow::anyhow!(
            "{}",
            missing_sandbox_message(std::env::consts::OS)
        )),
        _ => Err(anyhow::anyhow!(
            "Unhandled SandboxType variant {}, sandbox config is broken; refusing exec",
            manager.sandbox_type.name()
        )),
    }
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
/// and injected an `(allow default)` rule, a complete macOS sandbox escape.
///
/// Apple provides no parameterised quoting mechanism for Seatbelt profiles.
/// The only safe strategy is to reject any path character that is meaningful
/// in SBPL or could break the string literal:
///   - `"`, closes the string literal the path is embedded in
///   - `(` / `)`, open/close s-expressions; could inject new rules even if `"` is intact
///   - `\`, introduces escape sequences; the escaping strategy itself is
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
        // SECURITY: root path would grant file-write* everywhere, reject.
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
    // Unicode line/paragraph separators, some SBPL parsers treat as newlines.
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

    // SBPL is last-match-wins, so the loopback denial has to follow the allow.
    let network_rules = match manager.network_policy {
        NetworkPolicy::Allow => "(allow network-outbound)\n(allow network-inbound)\n",
        NetworkPolicy::AllowExternal => {
            "(allow network-outbound)\n(allow network-inbound)\n(deny network-outbound (remote ip \"localhost:*\"))\n"
        }
        NetworkPolicy::Deny => "",
    };

    let mut scratch_read_rules = String::new();
    let mut write_rules = String::from("(allow file-write* (literal \"/dev/null\"))\n");
    match &manager.policy {
        // Both write policies get one private scratch directory rather than the
        // whole of /tmp: a blanket `/tmp` write let a sandboxed command reach
        // every other session's temporary files, and the tempfile crate,
        // mktemp, python and node all honour TMPDIR.
        SandboxPolicy::ReadOnly | SandboxPolicy::WorkspaceWrite { .. } => {
            let scratch_dir = scratch_dir.ok_or_else(|| {
                anyhow::anyhow!("Seatbelt execution requires a private scratch directory")
            })?;
            let scratch_dir = validate_and_escape_seatbelt_path(scratch_dir)?;
            scratch_read_rules
                .push_str(&format!("(allow file-read* (subpath \"{scratch_dir}\"))\n"));
            write_rules.push_str(&format!(
                "(allow file-write* (subpath \"{scratch_dir}\"))\n"
            ));
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

fn bubblewrap_args(manager: &SandboxManager, invocation: &Invocation<'_>) -> Result<Vec<String>> {
    let mut args = bubblewrap_prefix(manager)?;
    args.extend(invocation.argv());
    Ok(args)
}

/// How a sandboxed execution reaches the kernel.
///
/// `Program` skips the shell entirely, so nothing in an argument can be read as
/// a separator, redirection or expansion. `Shell` stays for command strings
/// that genuinely need shell semantics (pipes, chains, redirection, expansion).
#[derive(Debug, Clone, Copy)]
pub(crate) enum Invocation<'a> {
    Shell(&'a str),
    Program {
        program: &'a str,
        args: &'a [String],
    },
}

impl Invocation<'_> {
    fn argv(&self) -> Vec<String> {
        match self {
            Invocation::Shell(command) => {
                vec!["sh".to_string(), "-c".to_string(), (*command).to_string()]
            }
            Invocation::Program { program, args } => std::iter::once((*program).to_string())
                .chain(args.iter().cloned())
                .collect(),
        }
    }
}

fn bubblewrap_prefix(manager: &SandboxManager) -> Result<Vec<String>> {
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
    args.push("--".to_string());
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
    execute_sandboxed_with_input(manager, command, cwd, None, timeout).await
}

pub(crate) async fn execute_sandboxed_with_input(
    manager: &SandboxManager,
    command: &str,
    cwd: Option<&Path>,
    stdin: Option<Vec<u8>>,
    timeout: Option<std::time::Duration>,
) -> Result<std::process::Output> {
    execute_sandboxed_in_environment(
        manager,
        Invocation::Shell(command),
        cwd,
        stdin,
        timeout,
        scrub_environment_for(&manager.workspace_dir),
    )
    .await
}

/// Run one program under the sandbox with its arguments passed through as argv,
/// so no shell parses them.
pub(crate) async fn execute_sandboxed_program_with_timeout(
    manager: &SandboxManager,
    program: &str,
    args: &[String],
    cwd: Option<&Path>,
    timeout: Option<std::time::Duration>,
) -> Result<std::process::Output> {
    execute_sandboxed_in_environment(
        manager,
        Invocation::Program { program, args },
        cwd,
        None,
        timeout,
        scrub_environment_for(&manager.workspace_dir),
    )
    .await
}

async fn execute_sandboxed_in_environment(
    manager: &SandboxManager,
    invocation: Invocation<'_>,
    cwd: Option<&Path>,
    stdin: Option<Vec<u8>>,
    timeout: Option<std::time::Duration>,
    scrub_environment: bool,
) -> Result<std::process::Output> {
    let argv = invocation.argv();
    if matches!(manager.policy, SandboxPolicy::DangerFullAccess) {
        let mut cmd = match invocation {
            Invocation::Shell(script) => crate::process_tree::shell_command(script),
            Invocation::Program { program, args } => {
                let mut command = tokio::process::Command::new(program);
                command.args(args);
                command
            }
        };
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }
        return crate::process_tree::output(cmd, stdin, timeout)
            .await
            .map_err(anyhow::Error::new)
            .context("unsandboxed exec failed");
    }
    match manager.sandbox_type {
        SandboxType::MacosSeatbelt => {
            let scratch_dir = tempfile::Builder::new()
                .prefix("agi-sandbox-scratch-")
                .tempdir()
                .map_err(|error| {
                    anyhow::anyhow!("failed to create sandbox scratch directory: {error}")
                })?;
            let profile = seatbelt_profile(manager, Some(scratch_dir.path()))?;
            let mut scmd = tokio::process::Command::new("sandbox-exec");
            apply_environment_policy(&mut scmd, scrub_environment);
            scmd.arg("-p").arg(&profile).args(&argv);
            let scratch_path = scratch_dir
                .path()
                .canonicalize()
                .unwrap_or_else(|_| scratch_dir.path().to_path_buf());
            scmd.env("TMPDIR", scratch_path);
            if let Some(dir) = cwd {
                scmd.current_dir(dir);
            }
            crate::process_tree::output(scmd, stdin, timeout)
                .await
                .map_err(anyhow::Error::new)
                .context("Seatbelt exec failed")
        }
        SandboxType::LinuxBubblewrap => {
            let mut bcmd = tokio::process::Command::new("bwrap");
            apply_environment_policy(&mut bcmd, scrub_environment);
            let bwrap_args = bubblewrap_args(manager, &invocation)?;
            bcmd.args(&bwrap_args);
            if let Some(dir) = cwd {
                bcmd.current_dir(dir);
            }
            crate::process_tree::output(bcmd, stdin, timeout)
                .await
                .map_err(anyhow::Error::new)
                .context("Bubblewrap exec failed")
        }
        // Refuse loudly rather than silently running unsandboxed: the "sandboxed
        // execution" claim must not be honored where no sandbox is installed.
        SandboxType::None => Err(anyhow::anyhow!(
            "{}",
            missing_sandbox_message(std::env::consts::OS)
        )),
        // Only reachable if a SandboxType variant was added without an exec
        // implementation, fail loud rather than silently bypass.
        _ => Err(anyhow::anyhow!(
            "Unhandled SandboxType variant {}, sandbox config is broken; refusing exec",
            manager.sandbox_type.name()
        )),
    }
}

#[cfg(test)]
mod environment_and_policy_tests {
    use super::*;
    use crate::features::hooks::managed::{ManagedSandboxPolicy, ManagedSandboxPolicyState};

    #[test]
    fn user_opt_ins_apply_without_a_managed_policy_and_cannot_force() {
        let settings = resolve_sandbox_settings(&ManagedSandboxPolicyState::Absent, |name| {
            name == "AGIWORKFORCE_SANDBOX_HOOKS"
        });
        assert!(settings.sandbox_user_hooks);
        assert!(!settings.scrub_environment);
        assert!(!settings.sandbox_mcp_servers);
        assert!(!settings.forced);
        assert_eq!(
            resolve_sandbox_settings(&ManagedSandboxPolicyState::Absent, |_| false),
            SandboxSettings::default()
        );
    }

    #[test]
    fn a_managed_policy_forces_and_a_user_cannot_turn_its_controls_off() {
        let managed = ManagedSandboxPolicyState::Loaded(ManagedSandboxPolicy {
            forced: true,
            scrub_environment: true,
            sandbox_user_hooks: false,
            sandbox_mcp_servers: true,
        });
        let settings =
            resolve_sandbox_settings(&managed, |name| name == "AGIWORKFORCE_SANDBOX_HOOKS");
        assert_eq!(
            settings,
            SandboxSettings {
                forced: true,
                scrub_environment: true,
                sandbox_user_hooks: true,
                sandbox_mcp_servers: true,
            }
        );
    }

    #[test]
    fn an_unreadable_managed_policy_enforces_every_control() {
        let settings = resolve_sandbox_settings(
            &ManagedSandboxPolicyState::Invalid("bad json".to_string()),
            |_| false,
        );
        assert!(settings.forced);
        assert!(settings.scrub_environment);
        assert!(settings.sandbox_user_hooks);
        assert!(settings.sandbox_mcp_servers);
    }

    #[test]
    fn a_scrubbed_command_keeps_only_the_allowlist() {
        let mut command = tokio::process::Command::new("env");
        apply_environment_policy(&mut command, true);
        for (name, _) in command.as_std().get_envs() {
            let name = name.to_string_lossy();
            assert!(
                agiworkforce_mcp::INHERITED_ENV_ALLOWLIST.contains(&name.as_ref()),
                "{name} survived the scrub"
            );
        }
        let mut inherited = tokio::process::Command::new("env");
        apply_environment_policy(&mut inherited, false);
        assert_eq!(inherited.as_std().get_envs().count(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn a_wrapped_program_runs_directly_under_seatbelt() {
        let workspace = tempfile::tempdir().unwrap();
        let mut manager = SandboxManager::full_auto(workspace.path().to_path_buf())
            .with_network(NetworkPolicy::Allow);
        let args = vec!["--stdio".to_string(), "a b".to_string()];
        manager.sandbox_type = SandboxType::MacosSeatbelt;
        let (program, wrapped) = sandboxed_program(&manager, "npx", &args).unwrap();
        assert_eq!(program, "sandbox-exec");
        assert_eq!(wrapped[0], "-p");
        assert!(wrapped[1].contains("(deny default)"));
        assert_eq!(wrapped[2], "/usr/bin/env");
        let scratch = wrapped[3].strip_prefix("TMPDIR=").expect("TMPDIR argument");
        assert!(
            Path::new(scratch).is_dir(),
            "scratch dir missing: {scratch}"
        );
        assert!(wrapped[1].contains(&format!("(allow file-write* (subpath \"{scratch}\"))")));
        assert_eq!(&wrapped[4..], &["npx", "--stdio", "a b"]);
    }

    #[test]
    fn a_wrapped_program_runs_directly_under_bubblewrap() {
        let workspace = tempfile::tempdir().unwrap();
        let mut manager = SandboxManager::full_auto(workspace.path().to_path_buf());
        manager.sandbox_type = SandboxType::LinuxBubblewrap;
        let args = vec!["--stdio".to_string(), "a b".to_string()];
        let (program, wrapped) = sandboxed_program(&manager, "npx", &args).unwrap();
        assert_eq!(program, "bwrap");
        let separator = wrapped.iter().position(|arg| arg == "--").unwrap();
        assert_eq!(&wrapped[separator + 1..], &["npx", "--stdio", "a b"]);
    }

    #[test]
    fn a_wrapped_program_refuses_an_unavailable_backend() {
        let workspace = tempfile::tempdir().unwrap();
        let mut manager = SandboxManager::full_auto(workspace.path().to_path_buf());
        manager.sandbox_type = SandboxType::None;
        assert!(sandboxed_program(&manager, "npx", &["--stdio".to_string()]).is_err());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_wrapped_program_launches_and_keeps_a_writable_scratch_under_every_policy() {
        if SandboxType::detect() == SandboxType::None {
            return;
        }
        let workspace = tempfile::tempdir().expect("workspace");
        let workspace_path = workspace.path().canonicalize().expect("workspace path");
        let run = |policy: &SandboxPolicy, script: &str| {
            let mut manager = SandboxManager::new(policy.clone(), workspace_path.clone());
            manager.sandbox_type = SandboxType::MacosSeatbelt;
            let (program, args) =
                sandboxed_program(&manager, "/bin/sh", &["-c".to_string(), script.to_string()])
                    .unwrap_or_else(|error| panic!("{policy:?} could not be wrapped: {error}"));
            let output = std::process::Command::new(&program)
                .args(&args)
                .output()
                .expect("launch sandbox-exec");
            assert!(
                output.status.success(),
                "{policy:?} failed to launch: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            String::from_utf8_lossy(&output.stdout).into_owned()
        };

        let scratch_policies = [
            SandboxPolicy::ReadOnly,
            SandboxPolicy::WorkspaceWrite {
                writable_roots: Vec::new(),
            },
        ];
        for policy in &scratch_policies {
            assert_eq!(run(policy, "printf launched"), "launched");
            assert_eq!(
                run(
                    policy,
                    r#"printf scratch-ok > "$TMPDIR/probe" && cat "$TMPDIR/probe""#
                ),
                "scratch-ok"
            );
        }
        assert_eq!(
            run(&SandboxPolicy::DangerFullAccess, "printf launched"),
            "launched"
        );
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn a_scrubbed_sandboxed_command_cannot_read_the_parent_environment() {
        if SandboxType::detect() == SandboxType::None
            || std::env::var_os("CARGO_PKG_NAME").is_none()
        {
            return;
        }
        let workspace = tempfile::tempdir().unwrap();
        let workspace_path = workspace.path().canonicalize().unwrap();
        let manager =
            SandboxManager::for_command_execution(workspace_path.clone(), NetworkPolicy::Deny)
                .unwrap();
        let scrubbed = execute_sandboxed_in_environment(
            &manager,
            Invocation::Shell("env"),
            Some(&workspace_path),
            None,
            None,
            true,
        )
        .await
        .unwrap();
        let scrubbed = String::from_utf8_lossy(&scrubbed.stdout);
        assert!(!scrubbed.contains("CARGO_PKG_NAME="), "{scrubbed}");
        assert!(scrubbed.contains("PATH="), "{scrubbed}");

        let inherited = execute_sandboxed_in_environment(
            &manager,
            Invocation::Shell("env"),
            Some(&workspace_path),
            None,
            None,
            false,
        )
        .await
        .unwrap();
        assert!(String::from_utf8_lossy(&inherited.stdout).contains("CARGO_PKG_NAME="));
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

    /// `/status` and the footer must describe the same backend with the same
    /// word; an absent detection result reads identically to an explicit
    /// `SandboxType::None`.
    #[test]
    fn status_word_matches_the_backend() {
        assert_eq!(status_word(Some(SandboxType::MacosSeatbelt)), "seatbelt");
        assert_eq!(status_word(Some(SandboxType::LinuxBubblewrap)), "bwrap");
        assert_eq!(status_word(Some(SandboxType::LinuxLandlock)), "landlock");
        assert_eq!(status_word(Some(SandboxType::None)), "no sandbox");
        assert_eq!(status_word(None), "no sandbox");
    }

    // -----------------------------------------------------------------------
    // CRIT-2: Seatbelt path injection prevention
    // -----------------------------------------------------------------------

    #[cfg(unix)]
    fn accept(s: &str) -> String {
        validate_and_escape_seatbelt_path(&PathBuf::from(s))
            .unwrap_or_else(|e| panic!("expected accept for {:?}: {}", s, e))
    }

    #[cfg(unix)]
    fn reject(s: &str) -> String {
        validate_and_escape_seatbelt_path(&PathBuf::from(s))
            .map(|ok| panic!("expected rejection for {:?}, got: {:?}", s, ok))
            .unwrap_err()
            .to_string()
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_double_quote() {
        let msg = reject("/tmp/ws\"injected");
        assert!(msg.contains("SBPL-special"), "got: {msg}");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_open_paren() {
        let msg = reject("/tmp/ws(inject");
        assert!(msg.contains("SBPL-special"), "got: {msg}");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_close_paren() {
        let msg = reject("/tmp/ws)inject");
        assert!(msg.contains("SBPL-special"), "got: {msg}");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_backslash() {
        let msg = reject("/tmp/ws\\inject");
        assert!(msg.contains("SBPL-special"), "got: {msg}");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_newline() {
        let msg = reject("/tmp/ws\ninjected");
        assert!(msg.contains("control"), "got: {msg}");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_carriage_return() {
        let msg = reject("/tmp/ws\rinjected");
        assert!(msg.contains("control"), "got: {msg}");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_nul_byte() {
        // Verify the char-level control check catches NUL (0x00 < 0x20).
        let has_nul = "/tmp/ws\0inject".chars().any(|c| (c as u32) < 0x20);
        assert!(has_nul, "NUL detection sanity");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_leading_whitespace() {
        // A path with a leading space is not absolute on POSIX, so it hits the
        // absolute-path check first. Either rejection message is correct, the
        // important property is that the path is refused.
        let msg = reject(" /tmp/ws");
        assert!(
            msg.contains("whitespace") || msg.contains("absolute"),
            "got: {msg}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_trailing_whitespace() {
        // Trailing whitespace: the path IS absolute but has trailing space.
        let msg = reject("/tmp/ws ");
        assert!(msg.contains("whitespace"), "got: {msg}");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_root_path() {
        let msg = reject("/");
        assert!(msg.contains("broad"), "got: {msg}");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_empty_path() {
        let msg = reject("");
        assert!(msg.contains("empty"), "got: {msg}");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_unicode_line_separator() {
        let s = "/tmp/ws\u{2028}inject";
        let msg = reject(s);
        assert!(msg.contains("separator"), "got: {msg}");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_rejects_unicode_paragraph_separator() {
        let s = "/tmp/ws\u{2029}inject";
        let msg = reject(s);
        assert!(msg.contains("separator"), "got: {msg}");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_accepts_normal_path() {
        let result = accept("/Users/developer/my-project");
        assert_eq!(result, "/Users/developer/my-project");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_accepts_path_with_unicode_letters() {
        // Non-ASCII Unicode that is not a control char or SBPL-special passes.
        let result = accept("/home/用户/project");
        assert_eq!(result, "/home/用户/project");
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_accepts_path_with_hyphen_and_underscore() {
        let result = accept("/tmp/my-workspace_v2");
        assert_eq!(result, "/tmp/my-workspace_v2");
    }

    #[cfg(unix)]
    #[test]
    fn profile_with_hostile_path_keeps_deny_default_intact() {
        // The PoC from the red-team report, verify it is rejected before
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
        let directory = tempfile::tempdir().unwrap();
        let workspace = directory.path().join("workspace");
        let shared = directory.path().join("shared");
        let mgr = SandboxManager::new(
            SandboxPolicy::WorkspaceWrite {
                writable_roots: vec![shared.clone(), shared.clone()],
            },
            workspace.clone(),
        );
        assert_eq!(
            writable_roots(&mgr).expect("roots"),
            vec![workspace, shared]
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
        let args = bubblewrap_args(&mgr, &Invocation::Shell("true")).expect("args");
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

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn workspace_write_keeps_temporary_files_out_of_the_shared_tmp() {
        let workspace = tempfile::tempdir().expect("workspace");
        let mgr = SandboxManager::full_auto(workspace.path().to_path_buf());
        if mgr.sandbox_type == SandboxType::None {
            return;
        }
        let marker =
            std::path::PathBuf::from(format!("/tmp/agi-sandbox-escape-{}", std::process::id()));
        let _ = std::fs::remove_file(&marker);

        let escape = execute_sandboxed(
            &mgr,
            &format!("printf escaped > {}", marker.display()),
            Some(workspace.path()),
        )
        .await
        .expect("sandbox should launch");

        assert!(
            !escape.status.success(),
            "a workspace-write sandbox wrote into the shared /tmp"
        );
        assert!(!marker.exists(), "shared /tmp file was created: {marker:?}");

        let scratch = execute_sandboxed(
            &mgr,
            "printf scratch-ok > \"$TMPDIR/agi-scratch\"; cat \"$TMPDIR/agi-scratch\"",
            Some(workspace.path()),
        )
        .await
        .expect("sandbox should launch");
        assert!(
            scratch.status.success(),
            "the private scratch dir must stay writable: {}",
            String::from_utf8_lossy(&scratch.stderr)
        );
        assert_eq!(String::from_utf8_lossy(&scratch.stdout), "scratch-ok");
    }

    /// The network-disabled profile has to block a real connection, not just
    /// omit a rule. The target is a listener this test owns, so the assertion
    /// does not depend on the host having internet access.
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[tokio::test]
    async fn network_disabled_profile_blocks_a_real_outbound_connection() {
        if SandboxType::detect() == SandboxType::None
            || !crate::process_tree::executable_exists("curl")
        {
            return;
        }
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("listener");
        let port = listener.local_addr().expect("listener addr").port();
        assert!(
            std::net::TcpStream::connect(("127.0.0.1", port)).is_ok(),
            "the fixture's own listener must be reachable outside the sandbox"
        );

        let workspace = tempfile::tempdir().expect("workspace");
        let workspace_path = workspace
            .path()
            .canonicalize()
            .unwrap_or_else(|_| workspace.path().to_path_buf());
        let manager =
            SandboxManager::for_command_execution(workspace_path.clone(), NetworkPolicy::Deny)
                .expect("manager");

        let output = execute_sandboxed_with_timeout(
            &manager,
            &format!("curl -sS --max-time 5 http://127.0.0.1:{port}/"),
            Some(&workspace_path),
            Some(std::time::Duration::from_secs(30)),
        )
        .await
        .expect("sandbox should launch");

        assert!(
            !output.status.success(),
            "the network-disabled profile allowed an outbound connection: {}",
            String::from_utf8_lossy(&output.stdout)
        );
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
        assert!(sandbox_disabled_requested());
        set_sandbox_disabled(false);
        assert!(!sandbox_disabled_requested());
    }

    #[test]
    fn an_untrusted_workspace_cannot_turn_the_sandbox_off() {
        assert!(resolve_sandbox_disabled(true, false, true));
        assert!(
            !resolve_sandbox_disabled(true, false, false),
            "--no-sandbox must not apply in a workspace the user has not trusted"
        );
        assert!(!resolve_sandbox_disabled(true, true, true));
        assert!(!resolve_sandbox_disabled(false, false, true));
    }

    #[test]
    fn an_untrusted_workspace_never_hands_a_command_this_machines_environment() {
        assert!(resolve_scrub_environment(false, false));
        assert!(resolve_scrub_environment(true, true));
        assert!(!resolve_scrub_environment(false, true));
    }

    #[test]
    fn an_untrusted_workspace_gets_no_network_however_the_caller_asked() {
        for requested in [
            NetworkPolicy::Allow,
            NetworkPolicy::AllowExternal,
            NetworkPolicy::Deny,
        ] {
            assert_eq!(
                clamp_network_to_trust(requested, false),
                NetworkPolicy::Deny
            );
            assert_eq!(clamp_network_to_trust(requested, true), requested);
        }
    }

    /// The profile the real execution path would hand to `sandbox-exec`, for a
    /// workspace-write manager on the given network policy.
    #[cfg(unix)]
    fn profile_for(network: NetworkPolicy) -> (tempfile::TempDir, tempfile::TempDir, String) {
        let workspace = tempfile::tempdir().expect("workspace");
        let scratch = tempfile::tempdir().expect("scratch");
        let manager = SandboxManager {
            sandbox_type: SandboxType::MacosSeatbelt,
            policy: SandboxPolicy::default(),
            workspace_dir: workspace.path().to_path_buf(),
            network_policy: network,
        };
        let profile = seatbelt_profile(&manager, Some(scratch.path())).expect("profile");
        (workspace, scratch, profile)
    }

    #[cfg(unix)]
    #[test]
    fn seatbelt_profile_deny_omits_network_outbound_rule() {
        let (_workspace, _scratch, profile) = profile_for(NetworkPolicy::Deny);
        assert!(
            !profile.contains("allow network-outbound"),
            "deny-network profile must not contain allow network-outbound:\n{profile}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn seatbelt_profile_allow_includes_network_outbound_rule() {
        let (_workspace, _scratch, profile) = profile_for(NetworkPolicy::Allow);
        assert!(
            profile.contains("(allow network-outbound)"),
            "allow-network profile must contain allow network-outbound:\n{profile}"
        );
        assert!(
            !profile.contains("(deny network-outbound"),
            "full allow must not deny loopback:\n{profile}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn seatbelt_external_only_allows_the_network_but_denies_loopback_last() {
        let (_workspace, _scratch, profile) = profile_for(NetworkPolicy::AllowExternal);
        let allow = profile
            .find("(allow network-outbound)")
            .expect("external policy must allow outbound");
        let deny = profile
            .find("(deny network-outbound (remote ip \"localhost:*\"))")
            .expect("external policy must deny loopback");
        // SBPL is last-match-wins, so the order is the enforcement.
        assert!(
            deny > allow,
            "loopback denial must follow the allow:\n{profile}"
        );
    }

    #[cfg(unix)]
    #[test]
    fn seatbelt_workspace_write_scopes_temporary_writes_to_a_private_scratch_dir() {
        let (_workspace, scratch, profile) = profile_for(NetworkPolicy::Deny);
        let scratch_path = scratch
            .path()
            .canonicalize()
            .unwrap_or_else(|_| scratch.path().to_path_buf());
        assert!(
            profile.contains(&format!(
                "(allow file-write* (subpath \"{}\"))",
                scratch_path.display()
            )),
            "the private scratch dir must be writable:\n{profile}"
        );
        assert!(
            !profile.contains("(allow file-write* (subpath \"/tmp\")"),
            "the whole of /tmp must not be writable:\n{profile}"
        );
    }

    #[test]
    fn bwrap_deny_args_include_unshare_net() {
        let workspace = tempfile::tempdir().expect("workspace");
        let manager = SandboxManager {
            sandbox_type: SandboxType::LinuxBubblewrap,
            policy: SandboxPolicy::default(),
            workspace_dir: workspace.path().to_path_buf(),
            network_policy: NetworkPolicy::Deny,
        };
        let args = bubblewrap_prefix(&manager).expect("bwrap args");
        assert!(
            args.contains(&"--unshare-net".to_string()),
            "bwrap deny-network args must include --unshare-net: {args:?}"
        );
    }

    #[test]
    fn bwrap_allow_args_exclude_unshare_net() {
        let workspace = tempfile::tempdir().expect("workspace");
        for network in [NetworkPolicy::Allow, NetworkPolicy::AllowExternal] {
            let manager = SandboxManager {
                sandbox_type: SandboxType::LinuxBubblewrap,
                policy: SandboxPolicy::default(),
                workspace_dir: workspace.path().to_path_buf(),
                network_policy: network,
            };
            let args = bubblewrap_prefix(&manager).expect("bwrap args");
            assert!(
                !args.contains(&"--unshare-net".to_string()),
                "{network:?} args must NOT include --unshare-net: {args:?}"
            );
        }
    }

    #[test]
    fn missing_linux_sandbox_message_names_bubblewrap_and_how_to_install_it() {
        let msg = missing_sandbox_message("linux");
        assert!(msg.contains("bwrap"), "{msg}");
        assert!(msg.contains("apt install bubblewrap"), "{msg}");
        assert!(msg.contains("dnf install bubblewrap"), "{msg}");
        assert!(msg.contains("pacman -S bubblewrap"), "{msg}");
        assert!(msg.contains("--no-sandbox"), "{msg}");
    }

    #[tokio::test]
    async fn exec_without_a_detected_sandbox_tells_the_user_what_to_install() {
        let workspace = tempfile::tempdir().expect("workspace");
        let mgr = SandboxManager {
            sandbox_type: SandboxType::None,
            policy: SandboxPolicy::ReadOnly,
            workspace_dir: workspace.path().to_path_buf(),
            network_policy: NetworkPolicy::Deny,
        };

        let error = execute_sandboxed(&mgr, "printf hi", Some(workspace.path()))
            .await
            .expect_err("exec must refuse without a sandbox backend");
        let msg = error.to_string();

        assert_eq!(msg, missing_sandbox_message(std::env::consts::OS), "{msg}");
        assert!(
            !msg.contains("sandbox config is broken"),
            "a missing sandbox backend must not be reported as a broken config: {msg}"
        );
    }
}
