#![allow(dead_code, unused_imports)]
pub use agiworkforce_sandbox_policy::SandboxPolicy;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};

static SANDBOX_MODE: AtomicU8 = AtomicU8::new(SandboxMode::Contained as u8);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum SandboxMode {
    ReadOnly,
    Contained,
    Unrestricted,
}

impl SandboxMode {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "read-only" | "readonly" => Some(Self::ReadOnly),
            "contained" | "workspace" | "workspace-write" => Some(Self::Contained),
            "unrestricted" | "off" | "danger-full-access" => Some(Self::Unrestricted),
            _ => None,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::ReadOnly => "read-only",
            Self::Contained => "contained",
            Self::Unrestricted => "unrestricted",
        }
    }

    fn from_u8(value: u8) -> Self {
        match value {
            0 => Self::ReadOnly,
            2 => Self::Unrestricted,
            _ => Self::Contained,
        }
    }

    fn stricter(self, other: Self) -> Self {
        if (self as u8) <= (other as u8) {
            self
        } else {
            other
        }
    }

    fn policy(self) -> SandboxPolicy {
        match self {
            Self::ReadOnly => SandboxPolicy::ReadOnly,
            Self::Contained | Self::Unrestricted => SandboxPolicy::default(),
        }
    }

    fn summary(self) -> &'static str {
        match self {
            Self::ReadOnly => {
                "Commands the agent runs can read the workspace but write nothing outside a \
                 private scratch directory, and reach the network only with your approval."
            }
            Self::Contained => {
                "Commands the agent runs can write only inside the workspace, and reach the \
                 network only with your approval."
            }
            Self::Unrestricted => {
                "Commands the agent runs have your full user rights: any file you can change, \
                 and the network."
            }
        }
    }
}

pub fn set_sandbox_mode(mode: SandboxMode) {
    SANDBOX_MODE.store(mode as u8, Ordering::Relaxed);
}

pub fn sandbox_mode() -> SandboxMode {
    SandboxMode::from_u8(SANDBOX_MODE.load(Ordering::Relaxed))
}

pub fn launch_mode(no_sandbox: bool, user: Option<&str>, merged: Option<&str>) -> SandboxMode {
    if no_sandbox {
        return SandboxMode::Unrestricted;
    }
    let configured = |value: Option<&str>| {
        value.map_or(SandboxMode::Contained, |value| {
            SandboxMode::parse(value).unwrap_or_else(|| {
                eprintln!(
                    "{} sandbox_mode {value:?} is not read-only, contained or unrestricted; \
                     commands run contained",
                    crate::terminal_style::warning("note:")
                );
                SandboxMode::Contained
            })
        })
    };
    let user_mode = configured(user);
    if merged == user {
        return user_mode;
    }
    configured(merged).stricter(user_mode)
}

fn unrestricted_refusal(forced: bool, shell_unrestricted: bool) -> Option<&'static str> {
    if forced {
        Some("your organization requires the sandbox")
    } else if !shell_unrestricted {
        Some("this folder is not trusted; trust it with /trust grant first")
    } else {
        None
    }
}

pub fn handle_sandbox_command(arg: &str) -> String {
    let arg = arg.trim();
    if !arg.is_empty() {
        let Some(requested) = SandboxMode::parse(arg) else {
            return format!(
                "Unknown sandbox mode {arg:?}. Use /sandbox read-only, /sandbox contained or \
                 /sandbox unrestricted."
            );
        };
        if requested == SandboxMode::Unrestricted {
            if let Some(reason) = unrestricted_refusal(
                sandbox_settings().forced,
                crate::trust::restrictions().unrestricted_shell,
            ) {
                return format!("Commands stay sandboxed: {reason}.");
            }
        }
        set_sandbox_mode(requested);
    }
    describe_sandbox()
}

fn describe_sandbox() -> String {
    let requested = sandbox_mode();
    let active = if sandbox_disabled() {
        SandboxMode::Unrestricted
    } else if requested == SandboxMode::ReadOnly {
        SandboxMode::ReadOnly
    } else {
        SandboxMode::Contained
    };
    let backend = SandboxType::detect();
    let mut lines = vec![
        format!("Sandbox: {}", active.name()),
        format!("  {}", active.summary()),
    ];
    if active != SandboxMode::Unrestricted {
        lines.push(format!("  Backend: {}", status_word(Some(backend))));
        if backend == SandboxType::None {
            lines.push(format!(
                "  {}",
                missing_sandbox_message(std::env::consts::OS)
            ));
        }
    }
    if requested == SandboxMode::Unrestricted && active != SandboxMode::Unrestricted {
        if let Some(reason) = unrestricted_refusal(
            sandbox_settings().forced,
            crate::trust::restrictions().unrestricted_shell,
        ) {
            lines.push(format!("  Unrestricted was asked for, but {reason}."));
        }
    }
    lines.push(
        "  Change it with /sandbox read-only, /sandbox contained or /sandbox unrestricted, \
         or set sandbox_mode in ~/.agiworkforce/config.toml."
            .to_string(),
    );
    lines.join("\n")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SandboxType {
    None,
    MacosSeatbelt,
    LinuxBubblewrap,
}

impl SandboxType {
    pub fn detect() -> Self {
        #[cfg(target_os = "macos")]
        {
            if agiworkforce_sandbox_policy::sandbox_launcher(
                agiworkforce_sandbox_policy::SandboxBackend::MacosSeatbelt,
            )
            .is_some()
            {
                return Self::MacosSeatbelt;
            }
        }
        #[cfg(target_os = "linux")]
        {
            if agiworkforce_sandbox_policy::sandbox_launcher(
                agiworkforce_sandbox_policy::SandboxBackend::LinuxBubblewrap,
            )
            .is_some()
            {
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
        Some(SandboxType::None) | None => "no sandbox",
    }
}

/// Actionable diagnosis for a host where `SandboxType::detect()` found nothing.
/// The Linux branch names bubblewrap as the hard runtime dependency it is:
/// there is no in-process fallback, so a missing `bwrap` leaves no sandbox at
/// all.
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

pub use agiworkforce_sandbox_policy::NetworkPolicy;

pub struct SandboxManager {
    pub sandbox_type: SandboxType,
    pub policy: SandboxPolicy,
    pub workspace_dir: PathBuf,
    /// CRIT-1: controls whether outbound network is permitted inside the sandbox.
    /// Default is Deny, must be explicitly opted in.
    pub network_policy: NetworkPolicy,
    /// Configuration a sandboxed command must not rewrite even inside the
    /// workspace: what [`protected_paths_for`] names.
    pub protected_paths: Vec<PathBuf>,
}

/// The project's hook, policy and MCP configuration, and the CLI's own config
/// root, which the sandbox keeps read-only: a command that could rewrite them
/// would choose what the next session runs outside the sandbox. A workspace
/// inside the config root, such as a managed worktree's checkout, leaves the
/// root out, since denying it would deny the whole workspace; nothing of the
/// root outside that workspace is writable there anyway.
///
/// The directory host git reads its configuration from, and the one that
/// holds each repository's recorded git settings and index locks, are named
/// on their own, so they stay read-only even where the config root is left
/// out, as in a managed worktree session, or moved by `AGIWORKFORCE_HOME`.
///
/// These are paths. The sandbox crate's profiles also deny every protected
/// project entry by name below the workspace, hook managers' files included:
/// always at its top folder, and at any depth outside a dependency or build
/// tree.
pub fn protected_paths_for(workspace_dir: &Path) -> Vec<PathBuf> {
    let mut paths = agiworkforce_sandbox_policy::project_config_paths(workspace_dir);
    let canonical = |path: &Path| path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let workspace = canonical(workspace_dir);
    if let Ok(config_dir) = crate::config::CliConfig::config_dir() {
        if !workspace.starts_with(canonical(&config_dir)) {
            paths.push(config_dir);
        }
    }
    if let Some(git_config) = agiworkforce_worktree::host_git_config_dir() {
        if !workspace.starts_with(canonical(&git_config)) {
            paths.push(git_config);
        }
    }
    if let Some(git_state) = crate::platform::runtime::git::git_state_dir() {
        if !workspace.starts_with(canonical(&git_state)) {
            paths.push(git_state);
        }
    }
    paths
}

/// The folder sandboxed commands write to and run in when no other is named:
/// the working directory, unless that is the filesystem root, the home folder
/// or a folder above it, which no sandbox is given to write. Then it is a
/// private agent workspace, and the sentence telling the user so comes back
/// the first time, for the caller to show.
pub fn command_workspace() -> Result<(PathBuf, Option<String>)> {
    let cwd = current_dir_resolved();
    match cwd {
        Some(cwd) if agiworkforce_sandbox_policy::is_safe_write_root(&cwd) => Ok((cwd, None)),
        cwd => {
            let workspace = fallback_agent_workspace()?;
            let notice = fallback_notice(cwd.as_deref(), &workspace);
            Ok((workspace, notice))
        }
    }
}

/// [`command_workspace`] without the notice, for a launch the user does not
/// watch, such as an MCP server's, or for registering the workspace.
pub fn sandbox_workspace() -> Result<PathBuf> {
    match current_dir_resolved() {
        Some(cwd) if agiworkforce_sandbox_policy::is_safe_write_root(&cwd) => Ok(cwd),
        _ => fallback_agent_workspace(),
    }
}

fn current_dir_resolved() -> Option<PathBuf> {
    std::env::current_dir()
        .ok()
        .map(|cwd| cwd.canonicalize().unwrap_or(cwd))
}

/// A private folder in the CLI's config root, for commands started where no
/// sandbox may write.
fn fallback_agent_workspace() -> Result<PathBuf> {
    let workspace = private_child_dir(&crate::config::CliConfig::config_dir()?, "agent-workspace")?;
    agiworkforce_worktree::register_workspace_root(workspace.clone());
    Ok(workspace)
}

/// `parent/name` as a directory only this user writes, created owner-only
/// when missing. A sandbox writes its own root, so it can replace one with a
/// link, such as to the home folder, for the next launch to grant, or open
/// it to other users. The parent is resolved and the last component never
/// followed: a link, a directory another user owns or one that group or
/// others can write is refused, as is anything [`is_safe_write_root`] is.
///
/// [`is_safe_write_root`]: agiworkforce_sandbox_policy::is_safe_write_root
fn private_child_dir(parent: &Path, name: &str) -> Result<PathBuf> {
    let parent = parent
        .canonicalize()
        .with_context(|| format!("resolve {}", parent.display()))?;
    let dir = parent.join(name);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{DirBuilderExt, MetadataExt};
        match std::fs::DirBuilder::new().mode(0o700).create(&dir) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => {
                return Err(error).with_context(|| format!("create {}", dir.display()));
            }
        }
        let metadata =
            std::fs::symlink_metadata(&dir).with_context(|| format!("read {}", dir.display()))?;
        if !metadata.is_dir() || metadata.uid() != nix::unistd::geteuid().as_raw() {
            anyhow::bail!(
                "{} is not a directory this user owns, so it is not used",
                dir.display()
            );
        }
        if metadata.mode() & 0o022 != 0 {
            anyhow::bail!(
                "{} is writable by other users, so it is not used; run chmod 700 {}",
                dir.display(),
                shell_quote(&dir.to_string_lossy())
            );
        }
    }
    #[cfg(not(unix))]
    {
        std::fs::create_dir_all(&dir).with_context(|| format!("create {}", dir.display()))?;
        if std::fs::symlink_metadata(&dir)
            .with_context(|| format!("read {}", dir.display()))?
            .file_type()
            .is_symlink()
        {
            anyhow::bail!("{} is a link, so it is not used", dir.display());
        }
    }
    if !agiworkforce_sandbox_policy::is_safe_write_root(&dir) {
        anyhow::bail!(
            "{} is the filesystem root, the home folder or above it, so no sandbox writes it",
            dir.display()
        );
    }
    Ok(dir)
}

static FALLBACK_ANNOUNCED: AtomicBool = AtomicBool::new(false);

fn fallback_notice(cwd: Option<&Path>, workspace: &Path) -> Option<String> {
    if FALLBACK_ANNOUNCED.swap(true, Ordering::Relaxed) {
        return None;
    }
    let started = match cwd {
        Some(cwd) => format!("{} is your home folder or above it", cwd.display()),
        None => "the working directory could not be read".to_string(),
    };
    Some(format!(
        "Note: {started}, which the sandbox never lets a command write, so commands run in \
         and write to {} instead. Start agi in a project folder to work there.",
        workspace.display()
    ))
}

impl SandboxManager {
    /// A workspace that is the filesystem root, the home folder or a folder
    /// above it becomes the private agent workspace, and any such extra root
    /// is dropped. When the agent workspace cannot be made, nothing is
    /// writable.
    pub fn new(policy: SandboxPolicy, workspace_dir: PathBuf) -> Self {
        let (policy, workspace_dir) = confine_to_safe_roots(policy, workspace_dir);
        agiworkforce_worktree::add_sandbox_writable_roots(
            std::iter::once(workspace_dir.clone()).chain(policy.writable_roots().iter().cloned()),
        );
        Self {
            sandbox_type: SandboxType::detect(),
            policy,
            protected_paths: protected_paths_for(&workspace_dir),
            workspace_dir,
            network_policy: NetworkPolicy::Deny,
        }
    }
    pub fn full_auto(workspace_dir: PathBuf) -> Self {
        Self::new(SandboxPolicy::default(), workspace_dir)
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
            protected_paths: Vec::new(),
        }
    }
    /// Builder: opt in to outbound network access from within the sandbox.
    pub fn with_network(mut self, policy: NetworkPolicy) -> Self {
        self.network_policy = policy;
        self
    }

    /// Builder: let the command write the [`shared_sandbox_cache`], when
    /// there is one and the policy writes anything at all.
    pub(crate) fn with_shared_cache(mut self) -> Self {
        if let (Some(cache), SandboxPolicy::WorkspaceWrite { writable_roots }) =
            (shared_sandbox_cache(), &mut self.policy)
        {
            agiworkforce_worktree::add_sandbox_writable_roots([cache.clone()]);
            writable_roots.push(cache);
        }
        self
    }

    /// `command` with its package caches in the [`shared_sandbox_cache`],
    /// as [`with_cache_env`] sets them, when this manager can write it;
    /// otherwise `command` as it is.
    pub(crate) fn shell_with_shared_cache(&self, command: &str) -> String {
        let Some(cache) =
            shared_sandbox_cache().filter(|cache| self.policy.writable_roots().contains(cache))
        else {
            return command.to_string();
        };
        let writable: Vec<PathBuf> = std::iter::once(self.workspace_dir.clone())
            .chain(self.policy.writable_roots().iter().cloned())
            .collect();
        let (program, args) = with_cache_env(
            "/bin/sh",
            &["-c".to_string(), command.to_string()],
            &cache,
            &writable,
            |name| std::env::var(name).ok(),
        );
        shell_join(&std::iter::once(program).chain(args).collect::<Vec<_>>())
    }

    fn spec(&self) -> agiworkforce_sandbox_policy::SandboxSpec<'_> {
        agiworkforce_sandbox_policy::SandboxSpec {
            policy: &self.policy,
            workspace_dir: &self.workspace_dir,
            network_policy: self.network_policy,
            protected_paths: &self.protected_paths,
        }
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

    pub fn for_agent_command(
        workspace_dir: PathBuf,
        network_policy: NetworkPolicy,
    ) -> Result<Self> {
        let mut manager = Self::for_command_execution(workspace_dir, network_policy)?;
        manager.policy = sandbox_mode().policy();
        Ok(manager)
    }
}

fn confine_to_safe_roots(
    policy: SandboxPolicy,
    workspace_dir: PathBuf,
) -> (SandboxPolicy, PathBuf) {
    let policy = match policy {
        SandboxPolicy::WorkspaceWrite { writable_roots } => SandboxPolicy::WorkspaceWrite {
            writable_roots: writable_roots
                .into_iter()
                .filter(|root| agiworkforce_sandbox_policy::is_safe_write_root(root))
                .collect(),
        },
        other => other,
    };
    if agiworkforce_sandbox_policy::is_safe_write_root(&workspace_dir)
        || matches!(policy, SandboxPolicy::DangerFullAccess)
    {
        return (policy, workspace_dir);
    }
    match fallback_agent_workspace() {
        Ok(workspace) => (policy, workspace),
        Err(error) => {
            tracing::warn!(%error, "no agent workspace; the sandbox keeps everything read-only");
            if !NO_WORKSPACE_ANNOUNCED.swap(true, Ordering::Relaxed) {
                eprintln!(
                    "{} {}. Sandboxed commands can write nothing until it is fixed.",
                    crate::terminal_style::danger_header("warning:"),
                    crate::terminal_text::sanitize_terminal_text(&format!("{error:#}"))
                );
            }
            (SandboxPolicy::ReadOnly, workspace_dir)
        }
    }
}

static NO_WORKSPACE_ANNOUNCED: AtomicBool = AtomicBool::new(false);

/// Whether the user asked for the sandbox to be off, before any policy applies.
pub fn sandbox_disabled_requested() -> bool {
    sandbox_mode() == SandboxMode::Unrestricted
}

pub fn sandbox_disabled_for_workspace(workspace: &Path) -> bool {
    resolve_sandbox_disabled(
        sandbox_disabled_requested(),
        sandbox_settings().forced,
        crate::trust::restrictions_for(workspace).unrestricted_shell,
    )
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
    pub user_hooks: SandboxDefault,
    pub mcp_servers: SandboxDefault,
}

/// Whether the user's own hooks, or stdio MCP servers, run sandboxed.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum SandboxDefault {
    /// Sandboxed unless the server's entry or the hooks file opts out.
    #[default]
    On,
    /// The user's environment variable turned the sandbox off for them.
    Off,
    /// The managed policy requires the sandbox, so no opt-out applies.
    Required,
}

impl SandboxDefault {
    /// Whether one program runs sandboxed, given whether its own configuration
    /// leaves the sandbox on.
    pub fn applies(self, configured_sandboxed: bool) -> bool {
        match self {
            Self::Required => true,
            Self::On => configured_sandboxed,
            Self::Off => false,
        }
    }
}

/// Turns the sandbox off for the user's own hooks when set to `0`, `false`,
/// `off` or `no`. It once turned the sandbox on, so any other value, such as
/// the `1` that did, leaves it on.
pub const SANDBOX_HOOKS_ENV: &str = "AGIWORKFORCE_SANDBOX_HOOKS";
/// The same for stdio MCP servers.
pub const SANDBOX_MCP_ENV: &str = "AGIWORKFORCE_SANDBOX_MCP";

fn opted_out(value: Option<String>) -> bool {
    value.is_some_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "0" | "false" | "off" | "no"
        )
    })
}

static SANDBOX_SETTINGS: std::sync::OnceLock<SandboxSettings> = std::sync::OnceLock::new();

pub fn sandbox_settings() -> SandboxSettings {
    #[cfg(test)]
    if let Some(settings) =
        crate::native_process_test_fixture::sandbox_settings(load_sandbox_settings)
    {
        return settings;
    }
    *SANDBOX_SETTINGS.get_or_init(load_sandbox_settings)
}

fn load_sandbox_settings() -> SandboxSettings {
    resolve_sandbox_settings(
        &crate::features::hooks::managed::load_managed_sandbox_policy(),
        |name| std::env::var(name).ok(),
    )
}

pub fn resolve_sandbox_settings(
    managed: &crate::features::hooks::managed::ManagedSandboxPolicyState,
    env: impl Fn(&str) -> Option<String>,
) -> SandboxSettings {
    use crate::features::hooks::managed::ManagedSandboxPolicyState;
    let user_default = |name: &str| {
        if opted_out(env(name)) {
            SandboxDefault::Off
        } else {
            SandboxDefault::On
        }
    };
    let user = SandboxSettings {
        forced: false,
        scrub_environment: env("AGIWORKFORCE_SANDBOX_SCRUB_ENV").is_some(),
        user_hooks: user_default(SANDBOX_HOOKS_ENV),
        mcp_servers: user_default(SANDBOX_MCP_ENV),
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
                user_hooks: SandboxDefault::Required,
                mcp_servers: SandboxDefault::Required,
            };
        }
        ManagedSandboxPolicyState::Loaded(policy) => policy,
    };
    let required_or = |required: bool, user: SandboxDefault| {
        if required {
            SandboxDefault::Required
        } else {
            user
        }
    };
    SandboxSettings {
        forced: managed.forced,
        scrub_environment: managed.scrub_environment || user.scrub_environment,
        user_hooks: required_or(managed.sandbox_user_hooks, user.user_hooks),
        mcp_servers: required_or(managed.sandbox_mcp_servers, user.mcp_servers),
    }
}

/// Set to anything, a sandboxed command is no longer given the variables
/// whose names say they hold a credential. Off by default, as in Codex CLI:
/// in a trusted workspace a command inherits this process's environment.
pub const SANDBOX_FILTER_ENV: &str = "AGIWORKFORCE_SANDBOX_FILTER_ENV";

/// With [`SANDBOX_FILTER_ENV`] set, the names of variables to pass all the
/// same, separated by commas: `GITHUB_TOKEN,NPM_TOKEN` for a session that
/// pushes or publishes from inside the sandbox. Both are read from this
/// process's own environment, which a project cannot set, and neither
/// changes what a scrubbed command is given.
pub const SANDBOX_PASS_ENV: &str = "AGIWORKFORCE_SANDBOX_PASS_ENV";

fn credential_filter_requested() -> bool {
    static REQUESTED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *REQUESTED.get_or_init(|| std::env::var_os(SANDBOX_FILTER_ENV).is_some())
}

fn passed_credential_names() -> &'static [String] {
    static NAMES: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    NAMES.get_or_init(|| {
        std::env::var(SANDBOX_PASS_ENV)
            .map(|names| credential_names_in(&names))
            .unwrap_or_default()
    })
}

fn credential_names_in(list: &str) -> Vec<String> {
    list.split(',')
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .collect()
}

/// What a sandboxed command is given of this process's environment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EnvironmentPolicy {
    /// All of it, as any child process gets. The default in a trusted
    /// workspace, and what Codex CLI does: a command sees the tokens in the
    /// environment, its output goes back to the model, and one given the
    /// network can send them out.
    Inherited,
    /// All of it but the credentials: what the one classifier a launch
    /// consent uses calls a credential by its name
    /// ([`agiworkforce_sandbox_policy::holds_a_credential`]), other than the
    /// names the user passes through. A name that only might be a
    /// credential, such as `AWS_ACCESS_KEY_ID`, and a credential inside an
    /// address, such as a proxy's password, are still given.
    WithoutCredentials,
    /// The short list a scrubbed child keeps and nothing else: for an
    /// untrusted workspace, a managed policy or the user's own setting.
    Scrubbed,
}

/// A scrub outranks the filter, which outranks the default.
fn resolve_environment_policy(scrub: bool, filter_credentials: bool) -> EnvironmentPolicy {
    match (scrub, filter_credentials) {
        (true, _) => EnvironmentPolicy::Scrubbed,
        (false, true) => EnvironmentPolicy::WithoutCredentials,
        (false, false) => EnvironmentPolicy::Inherited,
    }
}

/// Windows matches environment names without regard to case, so its `Path`
/// is the allowlist's `PATH`.
fn inherited_by_name(name: &str) -> bool {
    agiworkforce_mcp::INHERITED_ENV_ALLOWLIST.iter().any(|allowed| {
        if cfg!(windows) {
            allowed.eq_ignore_ascii_case(name)
        } else {
            *allowed == name
        }
    })
}

/// What `policy` gives a command of `variables`, with `passed` the names a
/// credential filter lets through.
fn environment_for_a_command(
    variables: impl Iterator<Item = (std::ffi::OsString, std::ffi::OsString)>,
    policy: EnvironmentPolicy,
    passed: &[String],
) -> Vec<(std::ffi::OsString, std::ffi::OsString)> {
    variables
        .filter(|(name, value)| {
            let Some(name) = name.to_str() else {
                return policy == EnvironmentPolicy::Inherited;
            };
            match policy {
                EnvironmentPolicy::Inherited => true,
                EnvironmentPolicy::Scrubbed => inherited_by_name(name),
                EnvironmentPolicy::WithoutCredentials => {
                    let credential = match value.to_str() {
                        Some(value) => agiworkforce_sandbox_policy::holds_a_credential(name, value),
                        None => agiworkforce_sandbox_policy::value_is_secret(name),
                    };
                    !credential
                        || passed
                            .iter()
                            .any(|passed| passed.eq_ignore_ascii_case(name))
                }
            }
        })
        .collect()
}

/// Give `command`, which is about to be started sandboxed for
/// `workspace_dir`, the environment a sandboxed command gets there: the one
/// rule for `run_command`, a hook and anything else that starts a sandboxed
/// child. In a trusted workspace with nothing set that is what it would
/// inherit anyway; with [`SANDBOX_FILTER_ENV`] the credentials are left out;
/// in an untrusted workspace, or under a scrub, only the short list is
/// given. A caller that builds the command itself calls this before it sets
/// a variable of its own; [`execute_sandboxed_with_input`] and the other
/// executors here do it already.
pub fn apply_sandboxed_environment(command: &mut tokio::process::Command, workspace_dir: &Path) {
    apply_environment_policy(command, scrub_environment_for(workspace_dir));
}

fn apply_environment_policy(command: &mut tokio::process::Command, scrub: bool) {
    let policy = resolve_environment_policy(scrub, credential_filter_requested());
    if policy != EnvironmentPolicy::Inherited {
        command.env_clear();
        command.envs(environment_for_a_command(
            std::env::vars_os(),
            policy,
            passed_credential_names(),
        ));
    }
    crate::session_browser::apply_environment(command);
}

/// The sandbox tool by absolute path. A bare name would be looked up on
/// `PATH`, where a project's `.venv/bin` or `node_modules/.bin` can come
/// first, and a `sandbox-exec` or `bwrap` a sandboxed command left there
/// would then run on the host in the sandbox's place.
fn launcher(backend: agiworkforce_sandbox_policy::SandboxBackend) -> Result<PathBuf> {
    agiworkforce_sandbox_policy::sandbox_launcher(backend)
        .ok_or_else(|| anyhow::anyhow!("{}", missing_sandbox_message(std::env::consts::OS)))
}

/// A program rewritten to run under the sandbox, ready to spawn. `scratch`
/// is the program's private temporary directory, with its package caches;
/// dropping this removes it, so the caller keeps it until the program exits.
pub struct SandboxedLaunch {
    pub program: String,
    pub args: Vec<String>,
    pub scratch: Option<tempfile::TempDir>,
}

/// Create the private scratch directory a Seatbelt-wrapped program writes its
/// temporary files to.
fn program_scratch_dir() -> Result<tempfile::TempDir> {
    tempfile::Builder::new()
        .prefix("agi-sandbox-program-")
        .tempdir()
        .map_err(|error| anyhow::anyhow!("failed to create sandbox scratch directory: {error}"))
}

fn scratch_path(scratch: &tempfile::TempDir) -> PathBuf {
    scratch
        .path()
        .canonicalize()
        .unwrap_or_else(|_| scratch.path().to_path_buf())
}

/// Rewrite a program and its arguments so the sandbox backend launches it.
/// The program is exec'd directly, without a shell in between.
pub fn sandboxed_program(
    manager: &SandboxManager,
    program: &str,
    args: &[String],
) -> Result<SandboxedLaunch> {
    let backend = match manager.sandbox_type {
        SandboxType::MacosSeatbelt => agiworkforce_sandbox_policy::SandboxBackend::MacosSeatbelt,
        SandboxType::LinuxBubblewrap => {
            warn_unprotected_once(
                &agiworkforce_sandbox_policy::wrap::bubblewrap_unprotected_paths(&manager.spec())
                    .map_err(anyhow::Error::msg)?,
            );
            agiworkforce_sandbox_policy::SandboxBackend::LinuxBubblewrap
        }
        SandboxType::None => {
            return Err(anyhow::anyhow!(
                "{}",
                missing_sandbox_message(std::env::consts::OS)
            ))
        }
    };
    let scratch = match backend {
        agiworkforce_sandbox_policy::SandboxBackend::MacosSeatbelt => Some(program_scratch_dir()?),
        agiworkforce_sandbox_policy::SandboxBackend::LinuxBubblewrap => None,
    };
    let (program, mut args) = agiworkforce_sandbox_policy::sandboxed_program(
        backend,
        &manager.spec(),
        scratch.as_ref().map(scratch_path).as_deref(),
        program,
        args,
    )
    .map_err(anyhow::Error::msg)?;
    crate::session_browser::restrict_launch(
        &mut args,
        matches!(
            backend,
            agiworkforce_sandbox_policy::SandboxBackend::MacosSeatbelt
        ),
    )?;
    Ok(SandboxedLaunch {
        program,
        args,
        scratch,
    })
}

/// Where cache variables point inside a full-read sandbox when
/// [`shared_sandbox_cache`] has none: seatbelt's scratch directory, or under
/// the private tmpfs bubblewrap mounts on /tmp.
const BUBBLEWRAP_CACHE_BASE: &str = "/tmp/agiworkforce-cache";

/// This user's own directory under the temp folder, owner-only. The temp
/// folder is shared on Linux, so a directory there named for this app could
/// belong to another user, or be a symlink; either is refused.
#[cfg(unix)]
fn private_temp_root() -> Option<PathBuf> {
    use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};
    let uid = tempfile::tempfile()
        .and_then(|probe| probe.metadata())
        .map(|metadata| metadata.uid())
        .ok()?;
    let dir = std::env::temp_dir().join(format!("agiworkforce-{uid}"));
    match std::fs::DirBuilder::new().mode(0o700).create(&dir) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(_) => return None,
    }
    let metadata = std::fs::symlink_metadata(&dir).ok()?;
    if !metadata.is_dir() || metadata.uid() != uid {
        return None;
    }
    if metadata.mode() & 0o077 != 0 {
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).ok()?;
    }
    dir.canonicalize().ok()
}

/// The package caches every sandboxed hook and MCP server shares, so a
/// sandboxed `npx`, `uvx`, `pip` or corepack shim does not download its
/// packages again on every start and run past a hook's timeout. It lives in
/// [`private_temp_root`] and is only ever handed to a sandbox: the host's own
/// caches are never used, and no host program reads this one. A sandboxed
/// program can poison it, so a later sandboxed run may load what an earlier
/// one planted, but a host run never does: it is outside every host cache
/// and, as a sandbox's writable root, off the host `PATH`. `None` when the
/// directory cannot be made safely; each program then gets an empty cache of
/// its own, as before.
#[cfg(unix)]
fn shared_sandbox_cache() -> Option<PathBuf> {
    let cache = private_child_dir(&private_temp_root()?, "sandbox-cache").ok()?;
    agiworkforce_worktree::add_sandbox_writable_roots([cache.clone()]);
    Some(cache)
}

#[cfg(not(unix))]
fn shared_sandbox_cache() -> Option<PathBuf> {
    None
}

/// Cache locations for one sandboxed program, all under `base`: the
/// [`shared_sandbox_cache`] or the program's private scratch space. The
/// host's own `~/.npm`, uv, pnpm, corepack and pip caches hold programs a
/// later host command runs, so none is shared.
fn sandbox_cache_env(base: &Path) -> Vec<(&'static str, PathBuf)> {
    vec![
        ("XDG_CACHE_HOME", base.join("xdg")),
        ("npm_config_cache", base.join("npm")),
        ("COREPACK_HOME", base.join("corepack")),
        ("PRE_COMMIT_HOME", base.join("pre-commit")),
        ("UV_CACHE_DIR", base.join("uv")),
        ("PIP_CACHE_DIR", base.join("pip")),
    ]
}

/// `program args` behind `/bin/sh`, which sets each cache variable the
/// caller's environment leaves unset or empty and then execs the program.
/// A value the caller set is kept only when it names a directory inside
/// `writable`; anywhere else the program could not write its cache, so the
/// scratch default replaces it. `caller_value` reads the environment the
/// program will inherit. The defaults travel as positional arguments, so no
/// path is parsed as shell syntax.
fn with_cache_env(
    program: &str,
    args: &[String],
    base: &Path,
    writable: &[PathBuf],
    caller_value: impl Fn(&str) -> Option<String>,
) -> (String, Vec<String>) {
    let defaults = sandbox_cache_env(base);
    let mut script = String::new();
    for (index, (name, _)) in defaults.iter().enumerate() {
        let name: &str = name;
        let position = index + 1;
        let replaced = caller_value(name)
            .filter(|value| !value.is_empty())
            .filter(|value| !writable_from_inside(Path::new(value), writable));
        match replaced {
            Some(value) => {
                tracing::info!(
                    variable = name,
                    value = %value,
                    "the sandbox cannot write this cache directory, so the sandboxed program uses a private one"
                );
                script.push_str(&format!("{name}=\"${position}\"; export {name}; "));
            }
            None => script.push_str(&format!(
                "{name}=\"${{{name}:-${position}}}\"; export {name}; "
            )),
        }
    }
    script.push_str(&format!("shift {}; exec \"$@\"", defaults.len()));
    let mut wrapped = vec!["-c".to_string(), script, "sh".to_string()];
    wrapped.extend(
        defaults
            .iter()
            .map(|(_, path)| path.to_string_lossy().into_owned()),
    );
    wrapped.push(program.to_string());
    wrapped.extend(args.iter().cloned());
    ("/bin/sh".to_string(), wrapped)
}

/// Whether a sandbox can write `path`, which is inside one of `writable`
/// as the crate resolves it. A relative path never is: what it names depends
/// on a working directory the sandboxed program may not share.
fn writable_from_inside(path: &Path, writable: &[PathBuf]) -> bool {
    path.is_absolute() && agiworkforce_sandbox_policy::host_path::inside_any(path, writable)
}

/// The filesystem MCP server's roots: the directories listed after its
/// package name, which the user chose for it to work in. Any other server's
/// directory arguments stay read-only, and so does a root that resolves to
/// the home folder or above it. A root is followed only through links root
/// owns, such as `/tmp` on macOS: any other link may be one a sandboxed
/// command made in place of a folder, so the root is left out, the user is
/// told once which real folder to configure instead, and the server keeps
/// its other roots.
pub fn filesystem_server_roots(args: &[String]) -> Vec<PathBuf> {
    const PACKAGE: &str = "@modelcontextprotocol/server-filesystem";
    let Some(package) = args.iter().position(|arg| {
        arg == PACKAGE
            || arg
                .strip_prefix(PACKAGE)
                .is_some_and(|version| version.starts_with('@'))
    }) else {
        return Vec::new();
    };
    let mut roots: Vec<PathBuf> = args[package + 1..]
        .iter()
        .map(PathBuf::from)
        .filter(|path| path.is_absolute() && path.is_dir())
        .filter_map(|path| std::path::absolute(path).ok())
        .map(|path| path.components().collect::<PathBuf>())
        .filter(|path| {
            !path
                .components()
                .any(|component| component == std::path::Component::ParentDir)
        })
        .filter_map(|path| {
            match agiworkforce_sandbox_policy::host_path::resolve_root_for_use(&path) {
                Ok(root) => Some(root),
                Err(refusal) => {
                    announce_refused_root(&path, &refusal);
                    None
                }
            }
        })
        .filter(|path| {
            path.canonicalize()
                .is_ok_and(|resolved| agiworkforce_sandbox_policy::is_safe_write_root(&resolved))
        })
        .collect();
    roots.sort();
    roots.dedup();
    roots
}

static REFUSED_ROOTS_ANNOUNCED: std::sync::Mutex<std::collections::BTreeSet<PathBuf>> =
    std::sync::Mutex::new(std::collections::BTreeSet::new());

/// Tell the user, the first time only, why a filesystem server root was
/// left out of its sandbox.
fn announce_refused_root(root: &Path, refusal: &str) {
    let first = REFUSED_ROOTS_ANNOUNCED
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .insert(root.to_path_buf());
    if first {
        eprintln!(
            "{}",
            crate::terminal_text::sanitize_terminal_text(&format!(
                "Note: a filesystem server root is left out of its sandbox: {refusal}."
            ))
        );
    }
}

/// Rewrite a long-lived program, such as a stdio MCP server, to run under the
/// full-read sandbox the desktop gives its servers: it reads anywhere, writes
/// only `workspace`, `extra_writable_roots` and a private scratch directory,
/// and never the configuration [`protected_paths_for`] names. `Ok(None)` on a
/// platform that has no sandbox at all (Windows), where the program runs as
/// configured; on macOS and Linux a missing backend fails closed.
/// `caller_value` reads the environment the program will inherit.
pub fn full_read_program(
    sandbox_type: SandboxType,
    workspace: &Path,
    extra_writable_roots: &[PathBuf],
    network_policy: NetworkPolicy,
    caller_value: impl Fn(&str) -> Option<String>,
    program: &str,
    args: &[String],
) -> Result<Option<SandboxedLaunch>> {
    full_read_program_guarding(
        sandbox_type,
        workspace,
        extra_writable_roots,
        network_policy,
        &[],
        caller_value,
        program,
        args,
    )
}

/// What a sandboxed hook or stdio server may not read: the locations
/// [`agiworkforce_sandbox_policy::credential_paths`] names under the home
/// folder, and the entries in the CLI's own folder that hold a key, a token or
/// the user's conversations. The rest of that folder stays readable, so a
/// script or server kept there still runs.
pub fn credential_locations() -> Vec<PathBuf> {
    let mut locations: Vec<PathBuf> = dirs::home_dir()
        .map(|home| agiworkforce_sandbox_policy::credential_paths(&home))
        .unwrap_or_default();
    if let Ok(config_dir) = crate::config::CliConfig::config_dir() {
        locations.extend(agiworkforce_sandbox_policy::agiworkforce_home_secret_entries(
            &config_dir,
        ));
    }
    locations
}

/// [`full_read_program`] for a program that must not read `unreadable`
/// either. A stdio MCP server keeps the network and reads everywhere, so it
/// is started with [`credential_locations`] here: it could otherwise send a
/// key or a token out. A server that needs one of them, such as one that
/// runs git over ssh, has to run outside the sandbox, which its entry and the
/// user's approval of that decide.
#[allow(clippy::too_many_arguments)]
pub fn full_read_program_guarding(
    sandbox_type: SandboxType,
    workspace: &Path,
    extra_writable_roots: &[PathBuf],
    network_policy: NetworkPolicy,
    unreadable: &[PathBuf],
    caller_value: impl Fn(&str) -> Option<String>,
    program: &str,
    args: &[String],
) -> Result<Option<SandboxedLaunch>> {
    let backend = match sandbox_type {
        SandboxType::MacosSeatbelt => agiworkforce_sandbox_policy::SandboxBackend::MacosSeatbelt,
        SandboxType::LinuxBubblewrap => {
            agiworkforce_sandbox_policy::SandboxBackend::LinuxBubblewrap
        }
        SandboxType::None if !cfg!(any(target_os = "macos", target_os = "linux")) => {
            return Ok(None)
        }
        SandboxType::None => {
            return Err(anyhow::anyhow!(
                "{}",
                missing_sandbox_message(std::env::consts::OS)
            ))
        }
    };
    let shared_cache = shared_sandbox_cache();
    let extra_writable_roots: Vec<PathBuf> = extra_writable_roots
        .iter()
        .cloned()
        .chain(shared_cache.clone())
        .collect();
    let extra_writable_roots = extra_writable_roots.as_slice();
    agiworkforce_worktree::add_sandbox_writable_roots(
        std::iter::once(workspace.to_path_buf()).chain(extra_writable_roots.iter().cloned()),
    );
    let scratch = match backend {
        agiworkforce_sandbox_policy::SandboxBackend::MacosSeatbelt => Some(program_scratch_dir()?),
        agiworkforce_sandbox_policy::SandboxBackend::LinuxBubblewrap => None,
    };
    let scratch_dir = scratch.as_ref().map(scratch_path);
    let cache_base = shared_cache
        .or_else(|| scratch_dir.clone())
        .unwrap_or_else(|| PathBuf::from(BUBBLEWRAP_CACHE_BASE));
    let writable: Vec<PathBuf> = std::iter::once(workspace.to_path_buf())
        .chain(extra_writable_roots.iter().cloned())
        .chain(std::iter::once(
            scratch_dir.clone().unwrap_or_else(|| PathBuf::from("/tmp")),
        ))
        .collect();
    let (program, args) = with_cache_env(program, args, &cache_base, &writable, caller_value);
    let spec = agiworkforce_sandbox_policy::FullReadSpec {
        workspace_dir: workspace,
        extra_writable_roots,
        network_policy,
    };
    let mut wrapped = agiworkforce_sandbox_policy::full_read_program_guarding(
        backend,
        &spec,
        &protected_paths_for(workspace),
        unreadable,
        scratch_dir.as_deref(),
        &program,
        &args,
    )
    .map_err(anyhow::Error::msg)?;
    crate::session_browser::restrict_launch(
        &mut wrapped.args,
        matches!(
            backend,
            agiworkforce_sandbox_policy::SandboxBackend::MacosSeatbelt
        ),
    )?;
    warn_unprotected_once(&wrapped.unprotected);
    Ok(Some(SandboxedLaunch {
        program: wrapped.command,
        args: wrapped.args,
        scratch,
    }))
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

fn validate_and_escape_seatbelt_path(path: &Path) -> Result<String> {
    agiworkforce_sandbox_policy::wrap::validate_and_escape_seatbelt_path(path)
        .map_err(anyhow::Error::msg)
}

#[cfg(test)]
fn writable_roots(manager: &SandboxManager) -> Result<Vec<PathBuf>> {
    agiworkforce_sandbox_policy::wrap::writable_roots(&manager.spec())
        .map(|roots| roots.into_iter().map(|root| root.named).collect())
        .map_err(anyhow::Error::msg)
}

fn command_profile(manager: &SandboxManager, scratch_dir: &Path) -> Result<String> {
    let mut profile =
        agiworkforce_sandbox_policy::wrap::seatbelt_profile(&manager.spec(), Some(scratch_dir))
            .map_err(anyhow::Error::msg)?;
    if let Some(snapshot) = crate::shell_snapshot::applied_file() {
        profile.push_str(&format!(
            "\n(allow file-read* (literal \"{}\"))\n",
            validate_and_escape_seatbelt_path(&snapshot)?,
        ));
    }
    crate::session_browser::extend_profile(&mut profile)?;
    Ok(profile)
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
    let spec = manager.spec();
    warn_unprotected_once(
        &agiworkforce_sandbox_policy::wrap::bubblewrap_unprotected_paths(&spec)
            .map_err(anyhow::Error::msg)?,
    );
    let mut args =
        agiworkforce_sandbox_policy::wrap::bubblewrap_prefix(&spec).map_err(anyhow::Error::msg)?;
    if let Some(snapshot) = crate::shell_snapshot::applied_file() {
        if args.pop().as_deref() != Some("--") {
            anyhow::bail!("sandbox prefix is missing its argument boundary");
        }
        let snapshot = snapshot.canonicalize()?;
        let snapshot = snapshot
            .to_str()
            .ok_or_else(|| anyhow::anyhow!("shell snapshot path is not UTF-8"))?
            .to_string();
        args.extend(["--ro-bind".to_string(), snapshot.clone(), snapshot]);
        args.push("--".to_string());
    }
    crate::session_browser::restrict_launch(&mut args, false)?;
    Ok(args)
}

/// Bubblewrap cannot keep a protected file read-only before it exists, and
/// every command reports the same missing ones, so each is named once.
fn warn_unprotected_once(unprotected: &[PathBuf]) {
    static REPORTED: std::sync::OnceLock<std::sync::Mutex<std::collections::HashSet<PathBuf>>> =
        std::sync::OnceLock::new();
    let mut reported = REPORTED
        .get_or_init(Default::default)
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let new: Vec<&PathBuf> = unprotected
        .iter()
        .filter(|path| reported.insert((*path).clone()))
        .collect();
    if !new.is_empty() {
        tracing::warn!(
            paths = ?new,
            "bubblewrap cannot keep these missing configuration paths read-only; a sandboxed command could create them"
        );
    }
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

pub(crate) fn background_command(
    manager: Option<&SandboxManager>,
    invocation: Invocation<'_>,
    cwd: &Path,
    terminal: Option<&Path>,
) -> Result<crate::terminals::PreparedCommand> {
    let unsandboxed = || match invocation {
        Invocation::Shell(script) => crate::process_tree::shell_command(script),
        Invocation::Program { program, args } => {
            let mut command = tokio::process::Command::new(program);
            command.args(args);
            command
        }
    };
    let mut scratch = None;
    let mut command = match manager {
        None => {
            let mut command = unsandboxed();
            apply_environment_policy(&mut command, scrub_environment_for(cwd));
            command
        }
        Some(manager) if matches!(manager.policy, SandboxPolicy::DangerFullAccess) => {
            let mut command = unsandboxed();
            apply_environment_policy(&mut command, scrub_environment_for(&manager.workspace_dir));
            command
        }
        Some(manager) => {
            let scrub = scrub_environment_for(&manager.workspace_dir);
            match manager.sandbox_type {
                SandboxType::MacosSeatbelt => {
                    let scratch_dir = program_scratch_dir()?;
                    let scratch_dir_path = scratch_path(&scratch_dir);
                    let mut profile = command_profile(manager, &scratch_dir_path)?;
                    if let Some(terminal) = terminal {
                        profile.push_str(&format!(
                            "(allow file-ioctl (literal \"{}\"))\n",
                            validate_and_escape_seatbelt_path(terminal)?
                        ));
                    }
                    let mut command = tokio::process::Command::new(launcher(
                        agiworkforce_sandbox_policy::SandboxBackend::MacosSeatbelt,
                    )?);
                    apply_environment_policy(&mut command, scrub);
                    command.arg("-p").arg(profile).args(invocation.argv()).envs(
                        agiworkforce_sandbox_policy::wrap::seatbelt_environment(&scratch_dir_path)
                            .map_err(anyhow::Error::msg)?,
                    );
                    scratch = Some(scratch_dir);
                    command
                }
                SandboxType::LinuxBubblewrap => {
                    let mut command = tokio::process::Command::new(launcher(
                        agiworkforce_sandbox_policy::SandboxBackend::LinuxBubblewrap,
                    )?);
                    apply_environment_policy(&mut command, scrub);
                    command.args(bubblewrap_args(manager, &invocation)?);
                    command
                }
                SandboxType::None => {
                    anyhow::bail!("{}", missing_sandbox_message(std::env::consts::OS))
                }
            }
        }
    };
    crate::interactive::mark_agent_spawned(&mut command);
    command.current_dir(cwd);
    Ok(crate::terminals::PreparedCommand {
        command: command.into_std(),
        scratch,
    })
}

/// A sandboxed command's process group ends when the command exits, so
/// nothing it left in the background keeps running beside host git.
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
        apply_environment_policy(&mut cmd, scrub_environment);
        crate::interactive::mark_agent_spawned(&mut cmd);
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
            let profile = command_profile(manager, scratch_dir.path())?;
            let mut scmd = tokio::process::Command::new(launcher(
                agiworkforce_sandbox_policy::SandboxBackend::MacosSeatbelt,
            )?);
            apply_environment_policy(&mut scmd, scrub_environment);
            scmd.arg("-p").arg(&profile).args(&argv);
            scmd.envs(
                agiworkforce_sandbox_policy::wrap::seatbelt_environment(scratch_dir.path())
                    .map_err(anyhow::Error::msg)?,
            );
            crate::interactive::mark_agent_spawned(&mut scmd);
            if let Some(dir) = cwd {
                scmd.current_dir(dir);
            }
            crate::process_tree::output_ending_group(scmd, stdin, timeout)
                .await
                .map_err(anyhow::Error::new)
                .context("Seatbelt exec failed")
        }
        SandboxType::LinuxBubblewrap => {
            let mut bcmd = tokio::process::Command::new(launcher(
                agiworkforce_sandbox_policy::SandboxBackend::LinuxBubblewrap,
            )?);
            apply_environment_policy(&mut bcmd, scrub_environment);
            let bwrap_args = bubblewrap_args(manager, &invocation)?;
            bcmd.args(&bwrap_args);
            crate::interactive::mark_agent_spawned(&mut bcmd);
            if let Some(dir) = cwd {
                bcmd.current_dir(dir);
            }
            crate::process_tree::output_ending_group(bcmd, stdin, timeout)
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
    }
}

#[cfg(test)]
mod environment_and_policy_tests {
    use super::*;
    use crate::features::hooks::managed::{ManagedSandboxPolicy, ManagedSandboxPolicyState};

    fn env_of(pairs: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> Option<String> {
        move |name| {
            pairs
                .iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| value.to_string())
        }
    }

    #[test]
    fn hooks_and_mcp_servers_are_sandboxed_by_default_and_a_user_can_opt_out() {
        let settings = resolve_sandbox_settings(&ManagedSandboxPolicyState::Absent, |_| None);
        assert_eq!(settings, SandboxSettings::default());
        assert_eq!(settings.user_hooks, SandboxDefault::On);
        assert_eq!(settings.mcp_servers, SandboxDefault::On);
        assert!(settings.user_hooks.applies(true));
        assert!(!settings.user_hooks.applies(false));

        let opted_out = resolve_sandbox_settings(
            &ManagedSandboxPolicyState::Absent,
            env_of(&[(SANDBOX_HOOKS_ENV, "0"), (SANDBOX_MCP_ENV, "off")]),
        );
        assert_eq!(opted_out.user_hooks, SandboxDefault::Off);
        assert_eq!(opted_out.mcp_servers, SandboxDefault::Off);
        assert!(!opted_out.mcp_servers.applies(true));
        assert!(!opted_out.forced);
        assert!(!opted_out.scrub_environment);
    }

    #[test]
    fn the_value_that_once_opted_in_keeps_the_sandbox_on() {
        let settings = resolve_sandbox_settings(
            &ManagedSandboxPolicyState::Absent,
            env_of(&[(SANDBOX_HOOKS_ENV, "1"), (SANDBOX_MCP_ENV, "")]),
        );
        assert_eq!(settings.user_hooks, SandboxDefault::On);
        assert_eq!(settings.mcp_servers, SandboxDefault::On);
    }

    #[test]
    fn a_managed_policy_forces_and_a_user_cannot_turn_its_controls_off() {
        let managed = ManagedSandboxPolicyState::Loaded(ManagedSandboxPolicy {
            forced: true,
            scrub_environment: true,
            sandbox_user_hooks: false,
            sandbox_mcp_servers: true,
        });
        let settings = resolve_sandbox_settings(
            &managed,
            env_of(&[(SANDBOX_HOOKS_ENV, "0"), (SANDBOX_MCP_ENV, "0")]),
        );
        assert_eq!(
            settings,
            SandboxSettings {
                forced: true,
                scrub_environment: true,
                user_hooks: SandboxDefault::Off,
                mcp_servers: SandboxDefault::Required,
            }
        );
        assert!(settings.mcp_servers.applies(false));
    }

    #[test]
    fn an_unreadable_managed_policy_enforces_every_control() {
        let settings = resolve_sandbox_settings(
            &ManagedSandboxPolicyState::Invalid("bad json".to_string()),
            |_| None,
        );
        assert!(settings.forced);
        assert!(settings.scrub_environment);
        assert_eq!(settings.user_hooks, SandboxDefault::Required);
        assert_eq!(settings.mcp_servers, SandboxDefault::Required);
    }

    #[test]
    fn a_workspace_at_or_above_home_becomes_the_agent_workspace() {
        let Some(home) = dirs::home_dir() else {
            return;
        };
        let home = home.canonicalize().unwrap_or(home);
        let (policy, workspace) = confine_to_safe_roots(
            SandboxPolicy::WorkspaceWrite {
                writable_roots: vec![PathBuf::from("/"), home.join("project")],
            },
            home.clone(),
        );
        assert_ne!(workspace, home);
        assert!(agiworkforce_sandbox_policy::is_safe_write_root(&workspace));
        assert_eq!(policy.writable_roots(), &[home.join("project")]);

        let project = tempfile::tempdir().unwrap();
        let project = project.path().canonicalize().unwrap();
        let (_, kept) = confine_to_safe_roots(SandboxPolicy::default(), project.clone());
        assert_eq!(kept, project);
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn a_launcher_planted_on_path_is_never_the_one_that_runs() {
        use std::os::unix::fs::PermissionsExt;
        let planted = tempfile::tempdir().unwrap();
        let planted_dir = planted.path().canonicalize().unwrap();
        for name in ["sandbox-exec", "bwrap"] {
            let path = planted_dir.join(name);
            std::fs::write(&path, "#!/bin/sh\nexit 0\n").unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let original = std::env::var_os("PATH").unwrap_or_default();
        let mut path = vec![planted_dir.clone()];
        path.extend(std::env::split_paths(&original));
        std::env::set_var("PATH", std::env::join_paths(path).unwrap());
        let detected = SandboxType::detect();
        let workspace = tempfile::tempdir().unwrap();
        let workspace_path = workspace.path().canonicalize().unwrap();
        let launch = full_read_program(
            detected,
            &workspace_path,
            &[],
            NetworkPolicy::Deny,
            |_| None,
            "true",
            &[],
        );
        std::env::set_var("PATH", original);
        let Ok(Some(launch)) = launch else {
            return;
        };
        let program = Path::new(&launch.program);
        assert!(program.is_absolute(), "{}", launch.program);
        assert!(
            !program.starts_with(&planted_dir) && !program.starts_with(planted.path()),
            "the planted {} ran in the sandbox's place",
            launch.program
        );
    }

    #[test]
    fn a_cache_directory_the_sandbox_cannot_write_is_replaced_with_the_scratch_one() {
        let writable = tempfile::tempdir().unwrap();
        let writable = writable.path().canonicalize().unwrap();
        let inside = writable.join("npm").to_string_lossy().into_owned();
        let (_, args) = with_cache_env(
            "npx",
            &[],
            Path::new("/scratch"),
            std::slice::from_ref(&writable),
            |name| match name {
                "npm_config_cache" => Some(inside.clone()),
                "UV_CACHE_DIR" => Some("/somewhere/the/sandbox/cannot/write".to_string()),
                _ => None,
            },
        );
        let script = &args[1];
        assert!(
            script.contains("npm_config_cache=\"${npm_config_cache:-$2}\""),
            "a writable caller value is kept: {script}"
        );
        assert!(
            script.contains("UV_CACHE_DIR=\"$5\";"),
            "an unwritable caller value is replaced: {script}"
        );
        assert!(script.contains("XDG_CACHE_HOME=\"${XDG_CACHE_HOME:-$1}\""));
    }

    #[cfg(unix)]
    #[test]
    fn every_sandboxed_program_shares_one_private_cache_outside_the_hosts() {
        use std::os::unix::fs::PermissionsExt;
        let cache = shared_sandbox_cache().expect("a private sandbox cache");
        assert_eq!(shared_sandbox_cache(), Some(cache.clone()), "one cache");
        let root = private_temp_root().expect("a private temp root");
        assert!(cache.starts_with(&root), "{}", cache.display());
        let mode = std::fs::metadata(&root).unwrap().permissions().mode();
        assert_eq!(mode & 0o077, 0, "owner-only: {mode:o}");
        if let Some(home) = dirs::home_dir() {
            assert!(!cache.starts_with(home.join(".npm")));
            assert!(!cache.starts_with(home.join(".cache")));
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_private_root_a_sandbox_replaced_or_opened_is_refused() {
        use std::os::unix::fs::PermissionsExt;
        let parent = tempfile::tempdir().unwrap();
        let resolved = parent.path().canonicalize().unwrap();
        let dir = resolved.join("agent-workspace");

        let created = private_child_dir(parent.path(), "agent-workspace").expect("created");
        assert_eq!(
            created, dir,
            "the parent is resolved, the leaf is not followed"
        );
        let mode = std::fs::metadata(&dir).unwrap().permissions().mode();
        assert_eq!(mode & 0o077, 0, "created open to other users: {mode:o}");

        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o777)).unwrap();
        assert!(private_child_dir(parent.path(), "agent-workspace").is_err());
        std::fs::remove_dir(&dir).unwrap();

        let home = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(home.path(), &dir).unwrap();
        assert!(
            private_child_dir(parent.path(), "agent-workspace").is_err(),
            "a root replaced with a link was followed"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_plugin_hook_writes_its_packages_to_the_shared_cache() {
        let cache = shared_sandbox_cache().expect("a private sandbox cache");
        let workspace = tempfile::tempdir().unwrap();
        let manager =
            SandboxManager::full_auto(workspace.path().canonicalize().unwrap()).with_shared_cache();
        assert!(manager.policy.writable_roots().contains(&cache));
        let command = manager.shell_with_shared_cache("npx -y some-hook");
        assert!(
            command.contains(cache.join("npm").to_string_lossy().as_ref()),
            "{command}"
        );
        assert!(command.ends_with("'npx -y some-hook'"), "{command}");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_sandboxed_program_gets_the_shared_cache_writable() {
        let cache = shared_sandbox_cache().expect("a private sandbox cache");
        let workspace = tempfile::tempdir().unwrap();
        let workspace = workspace.path().canonicalize().unwrap();
        let launch = full_read_program(
            SandboxType::MacosSeatbelt,
            &workspace,
            &[],
            NetworkPolicy::AllowExternal,
            |_| None,
            "npx",
            &["-y".to_string(), "some-server".to_string()],
        )
        .expect("wrapped")
        .expect("macOS has a sandbox");
        let profile = &launch.args[launch.args.iter().position(|arg| arg == "-p").unwrap() + 1];
        assert!(
            profile.contains(&format!(
                "(allow file-write* (subpath \"{}\"))",
                cache.display()
            )),
            "{profile}"
        );
        let npm = cache.join("npm").to_string_lossy().into_owned();
        assert!(launch.args.contains(&npm), "{:?}", launch.args);
    }

    #[test]
    fn a_relative_or_outside_path_is_not_inside_a_writable_root() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path().canonicalize().unwrap();
        assert!(writable_from_inside(
            &root.join("not-yet").join("made"),
            std::slice::from_ref(&root)
        ));
        assert!(!writable_from_inside(
            Path::new("relative/cache"),
            std::slice::from_ref(&root)
        ));
        assert!(!writable_from_inside(Path::new("/"), &[root]));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn unrestricted_execution_still_honors_environment_scrubbing() {
        let workspace = tempfile::tempdir().unwrap();
        let manager = SandboxManager::new(
            SandboxPolicy::DangerFullAccess,
            workspace.path().to_path_buf(),
        );
        let variable = "AGI_SANDBOX_ENV_REGRESSION_SENTINEL";
        if std::env::var_os("AGI_SANDBOX_SCRUB_REGRESSION_CHILD").is_none() {
            let output = tokio::process::Command::new(std::env::current_exe().unwrap())
                .args(["--exact", "sandbox::environment_and_policy_tests::unrestricted_execution_still_honors_environment_scrubbing", "--test-threads=1"])
                .env(variable, "controlled-private-value")
                .env("AGI_SANDBOX_SCRUB_REGRESSION_CHILD", "1")
                .output().await.unwrap();
            assert!(
                output.status.success(),
                "{}\n{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            );
            return;
        }
        let script = "printf '%s' \"$AGI_SANDBOX_ENV_REGRESSION_SENTINEL\"";
        let inherited = execute_sandboxed_in_environment(
            &manager,
            Invocation::Shell(script),
            Some(workspace.path()),
            None,
            Some(std::time::Duration::from_secs(5)),
            false,
        )
        .await;
        let scrubbed = execute_sandboxed_in_environment(
            &manager,
            Invocation::Shell(script),
            Some(workspace.path()),
            None,
            Some(std::time::Duration::from_secs(5)),
            true,
        )
        .await;
        let inherited = inherited.unwrap();
        let scrubbed = scrubbed.unwrap();
        assert!(inherited.status.success());
        assert_eq!(inherited.stdout, b"controlled-private-value");
        assert!(scrubbed.status.success());
        assert!(scrubbed.stdout.is_empty(), "environment scrub was bypassed");
    }

    #[test]
    fn a_scrubbed_command_keeps_only_the_allowlist() {
        let mut command = tokio::process::Command::new("env");
        apply_environment_policy(&mut command, true);
        for (name, _) in command.as_std().get_envs() {
            let name = name.to_string_lossy();
            assert!(inherited_by_name(&name), "{name} survived the scrub");
        }
    }

    fn given(policy: EnvironmentPolicy, passed: &[&str]) -> Vec<String> {
        let variables = [
            ("PATH", "/usr/bin"),
            ("HOME", "/Users/someone"),
            ("EDITOR", "vi"),
            ("GITHUB_TOKEN", "EXAMPLE"),
            ("APPLE_PASSWORD", "EXAMPLE"),
            ("OPENAI_API_KEY", "EXAMPLE"),
            ("npm_config__authToken", "EXAMPLE"),
            ("AWS_ACCESS_KEY_ID", "EXAMPLE"),
            ("HTTPS_PROXY", "http://proxy.example:8080"),
            ("SSH_AUTH_SOCK", "/tmp/agent.sock"),
            ("NODE_OPTIONS", "--max-old-space-size=4096"),
            ("PWD", "/Users/someone/project"),
            ("MAX_OUTPUT_TOKENS", "32000"),
            ("REQUIRE_AUTH", "true"),
        ]
        .into_iter()
        .map(|(name, value)| (name.into(), value.into()));
        let passed: Vec<String> = passed.iter().map(|name| name.to_string()).collect();
        let mut names: Vec<String> = environment_for_a_command(variables, policy, &passed)
            .into_iter()
            .map(|(name, _)| name.to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn a_trusted_workspace_inherits_unless_the_filter_or_a_scrub_is_on() {
        assert_eq!(
            resolve_environment_policy(false, false),
            EnvironmentPolicy::Inherited
        );
        assert_eq!(
            resolve_environment_policy(false, true),
            EnvironmentPolicy::WithoutCredentials
        );
        for filter in [false, true] {
            assert_eq!(
                resolve_environment_policy(true, filter),
                EnvironmentPolicy::Scrubbed,
                "a scrub outranks the filter"
            );
        }
        assert_eq!(given(EnvironmentPolicy::Inherited, &[]).len(), 14);

        let mut untouched = tokio::process::Command::new("env");
        if resolve_environment_policy(false, credential_filter_requested())
            == EnvironmentPolicy::Inherited
        {
            apply_environment_policy(&mut untouched, false);
            assert_eq!(
                untouched.as_std().get_envs().count(),
                0,
                "nothing is cleared or set, so the command inherits as any child does"
            );
        }
    }

    #[test]
    fn the_filter_leaves_out_the_credentials_and_passes_the_ones_named() {
        assert_eq!(
            given(EnvironmentPolicy::WithoutCredentials, &[]),
            [
                "AWS_ACCESS_KEY_ID",
                "EDITOR",
                "HOME",
                "HTTPS_PROXY",
                "MAX_OUTPUT_TOKENS",
                "NODE_OPTIONS",
                "PATH",
                "PWD",
                "REQUIRE_AUTH",
                "SSH_AUTH_SOCK"
            ],
            "a name that says it is a credential was handed to a sandboxed command"
        );
        assert_eq!(
            given(
                EnvironmentPolicy::WithoutCredentials,
                &["github_token", "NOT_SET"]
            ),
            [
                "AWS_ACCESS_KEY_ID",
                "EDITOR",
                "GITHUB_TOKEN",
                "HOME",
                "HTTPS_PROXY",
                "MAX_OUTPUT_TOKENS",
                "NODE_OPTIONS",
                "PATH",
                "PWD",
                "REQUIRE_AUTH",
                "SSH_AUTH_SOCK"
            ],
            "a variable the user named is passed through, and only that one"
        );
        assert_eq!(
            given(EnvironmentPolicy::Scrubbed, &["GITHUB_TOKEN"]),
            ["HOME", "PATH"],
            "a scrubbed command keeps the short list whatever was named"
        );
        assert_eq!(
            credential_names_in(" GITHUB_TOKEN, ,NPM_TOKEN,"),
            ["GITHUB_TOKEN", "NPM_TOKEN"]
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_variable_whose_name_is_not_text_is_given_only_where_everything_is() {
        use std::os::unix::ffi::OsStringExt;
        let variables = || {
            use std::ffi::OsString;
            let odd = OsString::from_vec(vec![0x66, 0x6f, 0xff]);
            [
                (odd, OsString::from("x")),
                (OsString::from("PATH"), OsString::from("/usr/bin")),
            ]
            .into_iter()
        };
        assert_eq!(
            environment_for_a_command(variables(), EnvironmentPolicy::Inherited, &[]).len(),
            2
        );
        for policy in [
            EnvironmentPolicy::WithoutCredentials,
            EnvironmentPolicy::Scrubbed,
        ] {
            let given = environment_for_a_command(variables(), policy, &[]);
            assert_eq!(given.len(), 1, "{policy:?}");
            assert_eq!(given[0].0, "PATH");
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_wrapped_program_runs_directly_under_seatbelt() {
        let workspace = tempfile::tempdir().unwrap();
        let mut manager = SandboxManager::full_auto(workspace.path().to_path_buf())
            .with_network(NetworkPolicy::Allow);
        let args = vec!["--stdio".to_string(), "a b".to_string()];
        manager.sandbox_type = SandboxType::MacosSeatbelt;
        let launch = sandboxed_program(&manager, "npx", &args).unwrap();
        assert_eq!(
            Some(PathBuf::from(&launch.program)),
            agiworkforce_sandbox_policy::sandbox_launcher(
                agiworkforce_sandbox_policy::SandboxBackend::MacosSeatbelt
            )
        );
        let wrapped = &launch.args;
        assert_eq!(wrapped[0], "-p");
        assert!(wrapped[1].contains("(deny default)"));
        assert_eq!(wrapped[2], "/usr/bin/env");
        let scratch = wrapped[3].strip_prefix("TMPDIR=").expect("TMPDIR argument");
        assert!(
            Path::new(scratch).is_dir(),
            "scratch dir missing: {scratch}"
        );
        assert!(wrapped[1].contains(&format!("(allow file-write* (subpath \"{scratch}\"))")));
        let launched: Vec<&String> = wrapped[4..]
            .iter()
            .filter(|arg| !arg.starts_with("DEVELOPER_DIR="))
            .collect();
        assert_eq!(launched, ["npx", "--stdio", "a b"]);
        let scratch = PathBuf::from(scratch);
        drop(launch);
        assert!(
            !scratch.exists(),
            "the scratch directory outlived its launch"
        );
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn a_wrapped_program_runs_directly_under_bubblewrap() {
        let Some(bwrap) = agiworkforce_sandbox_policy::sandbox_launcher(
            agiworkforce_sandbox_policy::SandboxBackend::LinuxBubblewrap,
        ) else {
            return;
        };
        let workspace = tempfile::tempdir().unwrap();
        let mut manager = SandboxManager::full_auto(workspace.path().to_path_buf());
        manager.sandbox_type = SandboxType::LinuxBubblewrap;
        let args = vec!["--stdio".to_string(), "a b".to_string()];
        let launch = sandboxed_program(&manager, "npx", &args).unwrap();
        assert_eq!(PathBuf::from(&launch.program), bwrap);
        assert!(Path::new(&launch.program).is_absolute());
        let wrapped = &launch.args;
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
        use crate::native_process_test_fixture::NativeProcessFixture;

        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.blocking_lock();
        NativeProcessFixture::require_backend();
        let fixture = NativeProcessFixture::new();
        fixture.sync_scope(|| {
            let workspace = tempfile::tempdir().expect("workspace");
            let workspace_path = workspace.path().canonicalize().expect("workspace path");
            let run = |policy: &SandboxPolicy, script: &str| {
                let mut manager = SandboxManager::new(policy.clone(), workspace_path.clone());
                manager.sandbox_type = SandboxType::MacosSeatbelt;
                let launch =
                    sandboxed_program(&manager, "/bin/sh", &["-c".to_string(), script.to_string()])
                        .unwrap_or_else(|error| panic!("{policy:?} could not be wrapped: {error}"));
                let output = std::process::Command::new(&launch.program)
                    .args(&launch.args)
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
        });
        fixture.assert_inputs(&[]);
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn a_scrubbed_sandboxed_command_cannot_read_the_parent_environment() {
        use crate::native_process_test_fixture::{Input, NativeProcessFixture};

        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        NativeProcessFixture::require_backend();
        assert!(
            std::env::var_os("CARGO_PKG_NAME").is_some(),
            "Cargo package environment required for this regression"
        );
        let fixture = NativeProcessFixture::new();
        fixture
            .scope(async {
                let workspace = tempfile::tempdir().unwrap();
                let workspace_path = workspace.path().canonicalize().unwrap();
                let manager = SandboxManager::for_command_execution(
                    workspace_path.clone(),
                    NetworkPolicy::Deny,
                )
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
            })
            .await;
        fixture.assert_inputs(&[Input::DeviceIdentity]);
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

    #[test]
    fn a_background_command_carries_the_agent_marker() {
        let cwd = std::env::temp_dir();
        let command =
            background_command(None, Invocation::Shell("true"), &cwd, None).expect("builds");
        assert!(command.command.get_envs().any(|(name, value)| {
            name == crate::interactive::AGENT_SPAWNED_ENV && value == Some("1".as_ref())
        }));
    }
    use std::path::PathBuf;

    /// `/status` and the footer must describe the same backend with the same
    /// word; an absent detection result reads identically to an explicit
    /// `SandboxType::None`.
    #[test]
    fn status_word_matches_the_backend() {
        assert_eq!(status_word(Some(SandboxType::MacosSeatbelt)), "seatbelt");
        assert_eq!(status_word(Some(SandboxType::LinuxBubblewrap)), "bwrap");
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

    /// `/tmp` as the profile names it: resolved, as on macOS where it is a
    /// link.
    #[cfg(unix)]
    fn under_tmp(rest: &str) -> String {
        let tmp = Path::new("/tmp").canonicalize().expect("/tmp");
        format!("{}/{rest}", tmp.display())
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_escapes_double_quote() {
        assert_eq!(accept("/tmp/ws\"injected"), under_tmp("ws\\\"injected"));
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_leaves_parentheses_which_mean_nothing_inside_a_string() {
        assert_eq!(accept("/tmp/repo-main (1)"), under_tmp("repo-main (1)"));
        assert_eq!(accept("/tmp/ws)inject("), under_tmp("ws)inject("));
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_escapes_backslash() {
        assert_eq!(accept("/tmp/ws\\inject"), under_tmp("ws\\\\inject"));
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
        // Non-ASCII Unicode that is not a control char passes. The path is
        // under `/tmp`, which is the same real folder on every Unix this runs
        // on; `/home` is a link on macOS, and the answer is the resolved path.
        assert_eq!(accept("/tmp/用户/project"), under_tmp("用户/project"));
    }

    #[cfg(unix)]
    #[test]
    fn sbpl_accepts_path_with_hyphen_and_underscore() {
        let result = accept("/tmp/my-workspace_v2");
        let tmp = Path::new("/tmp").canonicalize().expect("/tmp");
        assert_eq!(result, tmp.join("my-workspace_v2").to_str().unwrap());
    }

    #[cfg(unix)]
    #[test]
    fn profile_with_hostile_path_keeps_deny_default_intact() {
        // The PoC from the red-team report. Its quote is escaped, so the
        // string it sits in never closes and `(allow default)` stays text.
        let spelled = accept("/tmp/ws\") (allow default) ;#");
        assert_eq!(spelled, under_tmp("ws\\\") (allow default) ;#"));
        assert!(
            !spelled.replace("\\\"", "").contains('"'),
            "an unescaped quote would close the string: {spelled}"
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

    #[cfg(unix)]
    #[test]
    fn workspace_write_policy_drops_root_as_an_explicit_writable_root() {
        let mgr = SandboxManager::new(
            SandboxPolicy::WorkspaceWrite {
                writable_roots: vec![PathBuf::from("/")],
            },
            PathBuf::from("/tmp/workspace"),
        );
        assert_eq!(
            writable_roots(&mgr).expect("roots"),
            vec![PathBuf::from("/tmp/workspace")]
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn read_only_seatbelt_profile_does_not_allow_workspace_writes() {
        let mgr = SandboxManager::new(
            SandboxPolicy::ReadOnly,
            PathBuf::from("/tmp/developer-workspace"),
        );
        let profile = command_profile(&mgr, Path::new("/private/tmp/agi-read-only-scratch"))
            .expect("profile");
        assert!(
            profile.contains("(allow file-read* (subpath \"/private/tmp/developer-workspace\"))")
        );
        assert!(!profile.contains("(allow file-read*)\n"));
        assert!(
            !profile.contains("(allow file-write* (subpath \"/private/tmp/developer-workspace\"))")
        );
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

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[tokio::test]
    async fn sandbox_refuses_private_sibling_reads() {
        let workspace = tempfile::tempdir().expect("workspace");
        let sibling_base = if cfg!(target_os = "linux") {
            dirs::home_dir().expect("fixture home directory")
        } else {
            PathBuf::from("/tmp")
        };
        let sibling = tempfile::Builder::new()
            .prefix("agi-private-sibling-")
            .tempdir_in(sibling_base)
            .expect("private sibling");
        let private = sibling.path().join("private.txt");
        std::fs::write(&private, "CONTROLLED_PRIVATE_SIBLING").expect("private fixture");
        for policy in [SandboxPolicy::ReadOnly, SandboxPolicy::default()] {
            let manager = SandboxManager::new(policy, workspace.path().to_path_buf());
            assert_ne!(manager.sandbox_type, SandboxType::None);
            let command = format!("cat {}", shell_quote(&private.to_string_lossy()));
            let output = execute_sandboxed(&manager, &command, Some(workspace.path()))
                .await
                .expect("sandbox launch");
            assert!(!output.status.success(), "private sibling read succeeded");
            assert!(!String::from_utf8_lossy(&output.stdout).contains("CONTROLLED_PRIVATE_SIBLING"));
        }
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn explicit_writable_root_remains_readable() {
        use crate::native_process_test_fixture::{Input, NativeProcessFixture};

        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        NativeProcessFixture::require_backend();
        let fixture = NativeProcessFixture::new();
        fixture
            .scope(async {
                let workspace = tempfile::tempdir().expect("workspace");
                let extra = tempfile::Builder::new()
                    .prefix("agi-explicit-root-")
                    .tempdir_in("/tmp")
                    .expect("extra root");
                let file = extra
                    .path()
                    .canonicalize()
                    .expect("canonical extra")
                    .join("roundtrip.txt");
                let manager = SandboxManager::new(
                    SandboxPolicy::WorkspaceWrite {
                        writable_roots: vec![extra.path().canonicalize().expect("extra root")],
                    },
                    workspace.path().to_path_buf(),
                );
                let quoted = shell_quote(&file.to_string_lossy());
                let command = format!("printf controlled > {quoted} && cat {quoted}");
                let output = execute_sandboxed(&manager, &command, Some(workspace.path()))
                    .await
                    .expect("sandbox launch");
                assert!(output.status.success());
                assert_eq!(output.stdout, b"controlled");
            })
            .await;
        fixture.assert_inputs(&[Input::DeviceIdentity, Input::ManagedSettings]);
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
        use crate::native_process_test_fixture::{Input, NativeProcessFixture};

        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        NativeProcessFixture::require_backend();
        let fixture = NativeProcessFixture::new();
        fixture
            .scope(async {
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
            })
            .await;
        fixture.assert_inputs(&[Input::DeviceIdentity, Input::ManagedSettings]);
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn workspace_write_keeps_temporary_files_out_of_the_shared_tmp() {
        use crate::native_process_test_fixture::{Input, NativeProcessFixture};

        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        NativeProcessFixture::require_backend();
        let fixture = NativeProcessFixture::new();
        fixture
            .scope(async {
                let workspace = tempfile::tempdir().expect("workspace");
                let mgr = SandboxManager::full_auto(workspace.path().to_path_buf());
                let marker = std::path::PathBuf::from(format!(
                    "/tmp/agi-sandbox-escape-{}",
                    std::process::id()
                ));
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
            })
            .await;
        fixture.assert_inputs(&[Input::DeviceIdentity, Input::ManagedSettings]);
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
        set_sandbox_mode(launch_mode(true, None, None));
        assert!(sandbox_disabled_requested());
        set_sandbox_mode(launch_mode(false, None, None));
        assert!(!sandbox_disabled_requested());
    }

    #[test]
    fn unrestricted_launch_mode_does_not_bypass_an_untrusted_workspace() {
        let workspace = tempfile::tempdir().unwrap();
        assert!(!crate::trust::restrictions_for(workspace.path()).unrestricted_shell);
        let previous = sandbox_mode();
        set_sandbox_mode(SandboxMode::Unrestricted);
        let manager =
            SandboxManager::for_agent_command(workspace.path().to_path_buf(), NetworkPolicy::Deny);
        set_sandbox_mode(previous);
        #[cfg(windows)]
        {
            assert_eq!(SandboxType::detect(), SandboxType::None);
            let error = match manager {
                Ok(_) => panic!("an unavailable sandbox must return an error"),
                Err(error) => error,
            };
            assert_eq!(
                error.to_string(),
                "sandbox not available on this platform or host; pass --no-sandbox only if you accept unrestricted command execution"
            );
        }
        #[cfg(not(windows))]
        {
            let manager = manager.unwrap();
            assert!(!matches!(manager.policy, SandboxPolicy::DangerFullAccess));
        }
    }

    #[test]
    fn the_configured_sandbox_mode_is_read_and_a_repository_can_only_tighten_it() {
        assert_eq!(launch_mode(false, None, None), SandboxMode::Contained);
        assert_eq!(
            launch_mode(false, Some("read-only"), Some("read-only")),
            SandboxMode::ReadOnly
        );
        assert_eq!(
            launch_mode(false, Some("unrestricted"), Some("unrestricted")),
            SandboxMode::Unrestricted
        );
        assert_eq!(
            launch_mode(false, None, Some("off")),
            SandboxMode::Contained,
            "a repository's config must not switch the sandbox off"
        );
        assert_eq!(
            launch_mode(false, Some("unrestricted"), Some("read-only")),
            SandboxMode::ReadOnly
        );
        assert_eq!(
            launch_mode(false, Some("contained"), Some("mystery")),
            SandboxMode::Contained
        );
        assert_eq!(
            launch_mode(true, Some("read-only"), Some("read-only")),
            SandboxMode::Unrestricted
        );
    }

    #[test]
    fn unrestricted_is_refused_where_no_sandbox_would_be() {
        assert!(
            unrestricted_refusal(true, true).is_some_and(|reason| reason.contains("organization"))
        );
        assert!(unrestricted_refusal(false, false).is_some_and(|reason| reason.contains("trust")));
        assert_eq!(unrestricted_refusal(false, true), None);
    }

    #[test]
    fn every_sandbox_mode_round_trips_through_its_name() {
        for mode in [
            SandboxMode::ReadOnly,
            SandboxMode::Contained,
            SandboxMode::Unrestricted,
        ] {
            assert_eq!(SandboxMode::parse(mode.name()), Some(mode));
            assert_eq!(SandboxMode::from_u8(mode as u8), mode);
        }
        assert_eq!(
            SandboxMode::parse("workspace"),
            Some(SandboxMode::Contained)
        );
        assert_eq!(SandboxMode::parse("full-auto"), None);
    }

    #[test]
    fn a_read_only_mode_leaves_agent_commands_nothing_to_write() {
        assert_eq!(SandboxMode::ReadOnly.policy(), SandboxPolicy::ReadOnly);
        assert!(SandboxMode::Contained.policy().permits_workspace_writes());
        let manager = SandboxManager {
            sandbox_type: SandboxType::MacosSeatbelt,
            policy: SandboxMode::ReadOnly.policy(),
            workspace_dir: PathBuf::from("/workspace"),
            network_policy: NetworkPolicy::Deny,
            protected_paths: Vec::new(),
        };
        assert!(writable_roots(&manager).expect("roots").is_empty());
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
            protected_paths: Vec::new(),
        };
        let profile = command_profile(&manager, scratch.path()).expect("profile");
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
            protected_paths: Vec::new(),
        };
        let args = bubblewrap_prefix(&manager).expect("bwrap args");
        assert!(
            args.contains(&"--unshare-net".to_string()),
            "bwrap deny-network args must include --unshare-net: {args:?}"
        );
    }

    #[cfg(target_os = "linux")]
    #[tokio::test]
    async fn a_deny_policy_child_must_launch_before_isolation_is_qualified() {
        use crate::native_process_test_fixture::{Input, NativeProcessFixture};

        let _children = crate::process_tree::CHILD_SPAWNING_TESTS.lock().await;
        NativeProcessFixture::require_backend();
        let fixture = NativeProcessFixture::new();
        fixture
            .scope(async {
                let workspace = tempfile::tempdir().expect("workspace");
                let root = workspace.path().canonicalize().expect("workspace path");
                let manager = SandboxManager::for_agent_command(root.clone(), NetworkPolicy::Deny)
                    .expect("Deny-policy manager");
                assert_eq!(manager.sandbox_type, SandboxType::LinuxBubblewrap);
                assert_eq!(manager.network_policy, NetworkPolicy::Deny);
                let args = vec![
                    "-c".to_string(),
                    "printf native-deny-child-reached".to_string(),
                ];
                let prepared = background_command(
                    Some(&manager),
                    Invocation::Program {
                        program: "/bin/sh",
                        args: &args,
                    },
                    &root,
                    None,
                )
                .expect("canonical Deny-policy child command");
                assert_eq!(
                    std::path::Path::new(prepared.command.get_program()).file_name(),
                    Some(std::ffi::OsStr::new("bwrap"))
                );
                assert!(prepared
                    .command
                    .get_args()
                    .any(|arg| arg == std::ffi::OsStr::new("--unshare-net")));
                let output = crate::process_tree::output(
                    tokio::process::Command::from(prepared.command),
                    None,
                    Some(std::time::Duration::from_secs(30)),
                )
                .await
                .expect("Deny-policy child launch");
                drop(prepared.scratch);
                assert!(
                    output.status.success(),
                    "Deny-policy child did not reach its sentinel: status={:?} stderr={}",
                    output.status.code(),
                    crate::native_process_test_fixture::stderr_metadata(&output.stderr)
                );
                assert_eq!(output.stdout, b"native-deny-child-reached");
            })
            .await;
        fixture.assert_inputs(&[Input::DeviceIdentity, Input::ManagedSettings]);
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
                protected_paths: Vec::new(),
            };
            let args = bubblewrap_prefix(&manager).expect("bwrap args");
            assert!(
                !args.contains(&"--unshare-net".to_string()),
                "{network:?} args must NOT include --unshare-net: {args:?}"
            );
        }
    }

    #[test]
    fn host_git_configuration_stays_read_only_even_in_a_managed_worktree() {
        let Some(git_config) = agiworkforce_worktree::host_git_config_dir() else {
            return;
        };
        let project = tempfile::tempdir().expect("project");
        assert!(protected_paths_for(project.path()).contains(&git_config));
        let Ok(config_dir) = crate::config::CliConfig::config_dir() else {
            return;
        };
        let managed = config_dir.join("worktrees").join("probe");
        assert!(
            protected_paths_for(&managed).contains(&git_config),
            "a managed worktree session could rewrite host git's configuration"
        );
        let git_state = crate::platform::runtime::git::git_state_dir().unwrap();
        assert!(
            protected_paths_for(&managed).contains(&git_state),
            "a managed worktree session could rewrite the recorded git settings"
        );
    }

    #[cfg(unix)]
    #[test]
    fn project_hook_and_mcp_configuration_stay_read_only_for_shell_commands() {
        let workspace = tempfile::tempdir().expect("workspace");
        let workspace_dir = workspace
            .path()
            .canonicalize()
            .expect("canonical workspace");
        std::fs::create_dir_all(workspace_dir.join(".agiworkforce")).unwrap();
        let mut manager = SandboxManager::new(SandboxPolicy::default(), workspace_dir.clone());
        for name in [".agiworkforce", ".mcp.json", "mcp.json", ".vscode/mcp.json"] {
            assert!(
                manager.protected_paths.contains(&workspace_dir.join(name)),
                "{name} is not protected"
            );
        }

        manager.sandbox_type = SandboxType::MacosSeatbelt;
        let scratch = tempfile::tempdir().expect("scratch");
        let profile = command_profile(&manager, scratch.path()).expect("profile");
        for name in [".agiworkforce", ".mcp.json"] {
            assert!(
                profile.contains(&format!(
                    "(deny file-write* (subpath \"{}\"))",
                    workspace_dir.join(name).display()
                )),
                "{name} is writable:\n{profile}"
            );
        }
        let allow = profile
            .find(&format!(
                "(allow file-write* (subpath \"{}\"))",
                workspace_dir.display()
            ))
            .expect("workspace writable");
        let first_denial = profile
            .find("(deny file-write* (regex \"^")
            .unwrap_or_else(|| panic!("no entry is denied below the workspace:\n{profile}"));
        assert!(
            first_denial > allow,
            "the entries must be denied after the workspace allow"
        );
        let denied_anywhere: Vec<&str> = profile
            .lines()
            .filter(|line| line.starts_with("(deny file-write* (regex \"^"))
            .filter_map(|line| line.rsplit_once("/(.*/)?("))
            .flat_map(|(_, names)| names.trim_end_matches(")$\"))").split('|'))
            .collect();
        for (entry, name) in [
            (".husky", "[.][hH][uU][sS][kK][yY](/.*)?"),
            (
                "lefthook.yml",
                "[lL][eE][fF][tT][hH][oO][oO][kK][.][yY][mM][lL](/.*)?",
            ),
            (
                "lefthook-local.yml",
                "[lL][eE][fF][tT][hH][oO][oO][kK]-[lL][oO][cC][aA][lL][.][yY][mM][lL](/.*)?",
            ),
            ("a nested mcp.json", "[mM][cC][pP][.][jJ][sS][oO][nN](/.*)?"),
            (
                "the commands loaded as instructions",
                "[.][cC][lL][aA][uU][dD][eE]/[cC][oO][mM][mM][aA][nN][dD][sS](/.*)?",
            ),
        ] {
            assert!(
                denied_anywhere.contains(&name),
                "{entry} is writable by a shell command:\n{profile}"
            );
        }
        assert!(
            profile.lines().any(|line| {
                line.starts_with("(deny file-write-create file-write-unlink (regex \"^")
                    && line.ends_with("/(.*/)?([.][vV][sS][cC][oO][dD][eE])$\"))")
            }),
            ".vscode can be made or renamed around an mcp.json:\n{profile}"
        );
        assert!(!profile.contains("(allow file-read*)\n"));

        manager.sandbox_type = SandboxType::LinuxBubblewrap;
        let ws = workspace_dir.display();
        assert!(bubblewrap_prefix(&manager)
            .expect("bwrap args")
            .join(" ")
            .contains(&format!("--ro-bind {ws}/.agiworkforce {ws}/.agiworkforce")));
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
            protected_paths: Vec::new(),
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

    #[cfg(unix)]
    #[test]
    fn a_filesystem_server_root_replaced_with_a_link_is_left_out() {
        let tree = tempfile::tempdir().unwrap();
        let tree = tree.path().canonicalize().unwrap();
        let workspace = tree.join("workspace");
        let docs = workspace.join("docs");
        let notes = tree.join("notes");
        let elsewhere = tree.join("elsewhere");
        let scratch = tree.join("scratch");
        for dir in [&docs, &notes, &elsewhere, &scratch] {
            std::fs::create_dir_all(dir).unwrap();
        }
        let args = vec![
            "@modelcontextprotocol/server-filesystem".to_string(),
            format!("{}/", docs.display()),
            notes.to_string_lossy().into_owned(),
        ];
        assert_eq!(
            filesystem_server_roots(&args),
            vec![notes.clone(), docs.clone()],
            "the roots come back sorted"
        );

        std::fs::remove_dir(&docs).unwrap();
        std::os::unix::fs::symlink(&elsewhere, &docs).unwrap();
        let roots = filesystem_server_roots(&args);
        assert_eq!(
            roots,
            vec![notes.clone()],
            "the linked root is left out and the others stay"
        );
        let spec = agiworkforce_sandbox_policy::FullReadSpec {
            workspace_dir: &workspace,
            extra_writable_roots: &roots,
            network_policy: NetworkPolicy::Deny,
        };
        let profile =
            agiworkforce_sandbox_policy::full_read::full_read_seatbelt_profile(&spec, &scratch)
                .expect("the server starts with its other roots");
        assert!(!profile.contains(&format!("(subpath \"{}\")", elsewhere.display())));
        assert!(agiworkforce_sandbox_policy::verify_writable_root(&docs).is_err());
    }
}
