//! OS sandbox for local MCP servers, hook commands and the agent terminal.
//!
//! Programs read anywhere and write only to their workspace, a private
//! scratch directory and any roots the caller adds, through
//! `agiworkforce_sandbox_policy::full_read_program_protecting`. No cache the
//! host shares is writable: package-manager caches hold programs and package
//! metadata the host later trusts. Sandboxed hooks and MCP servers share one
//! cache of their own instead ([`shared_sandbox_cache`]), so a sandboxed
//! `npx`, `uvx`, `pip` or corepack shim does not download its packages again
//! on every start; the agent terminal gets an empty one in its scratch
//! directory on every run. The hook and MCP configuration stays
//! read-only inside the sandbox, so a sandboxed process cannot change what
//! runs next. Windows has no backend, so a program there runs unsandboxed as
//! before.

use agiworkforce_sandbox_policy::{NetworkPolicy, SandboxBackend};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub const SANDBOX_HOOKS_ENV: &str = "AGIWORKFORCE_SANDBOX_HOOKS";

const UNSANDBOXED_KEY_PREFIX: &str = "mcp_unsandboxed_";
const FILESYSTEM_SERVER_PACKAGE: &str = "@modelcontextprotocol/server-filesystem";

/// Hooks run sandboxed unless [`SANDBOX_HOOKS_ENV`] is `0`, `false`, `off`
/// or `no`. It once turned the sandbox on, so any other value, such as the
/// `1` that did, leaves it on.
pub fn hook_sandbox_enabled() -> bool {
    !sandbox_opted_out(std::env::var(SANDBOX_HOOKS_ENV).ok().as_deref())
}

fn sandbox_opted_out(value: Option<&str>) -> bool {
    value.is_some_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "0" | "false" | "off" | "no"
        )
    })
}

/// The sandbox tool for this host and its absolute path, or `None` when the
/// platform has none or it is not installed. It is never looked up on
/// `PATH`, where a project's `.venv/bin` can come first with a
/// `sandbox-exec` or `bwrap` a sandboxed program left there.
pub fn detect_sandbox_backend() -> Option<(SandboxBackend, PathBuf)> {
    let backend = if cfg!(target_os = "macos") {
        SandboxBackend::MacosSeatbelt
    } else if cfg!(target_os = "linux") {
        SandboxBackend::LinuxBubblewrap
    } else {
        return None;
    };
    agiworkforce_sandbox_policy::sandbox_launcher(backend).map(|path| (backend, path))
}

/// This user's own directory under the temp folder, owner-only, for the
/// agent workspace and every sandbox scratch directory. The temp folder is
/// shared on Linux, so a directory there named for this app could belong to
/// another user, or be a symlink; either is refused rather than used.
fn private_temp_root() -> Result<PathBuf, String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};
        let uid = tempfile::tempfile()
            .and_then(|probe| probe.metadata())
            .map(|metadata| metadata.uid())
            .map_err(|e| format!("failed to read the user's temp folder: {e}"))?;
        let dir = std::env::temp_dir().join(format!("agiworkforce-{uid}"));
        match std::fs::DirBuilder::new().mode(0o700).create(&dir) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(format!("failed to create {}: {e}", dir.display())),
        }
        let metadata = std::fs::symlink_metadata(&dir)
            .map_err(|e| format!("failed to read {}: {e}", dir.display()))?;
        if !metadata.is_dir() || metadata.uid() != uid {
            return Err(format!(
                "{} is not a directory this user owns, so it is not used",
                dir.display()
            ));
        }
        if metadata.mode() & 0o077 != 0 {
            std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| format!("failed to restrict {}: {e}", dir.display()))?;
        }
        dir.canonicalize()
            .map_err(|e| format!("failed to resolve {}: {e}", dir.display()))
    }
    #[cfg(not(unix))]
    {
        let dir = std::env::temp_dir().join("agiworkforce");
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("failed to create {}: {e}", dir.display()))?;
        Ok(dir.canonicalize().unwrap_or(dir))
    }
}

/// A private TMPDIR for one sandboxed program, with its package caches. It
/// is removed when dropped, so whoever spawns the program keeps it until
/// the program exits.
pub fn create_sandbox_scratch_dir() -> Result<tempfile::TempDir, String> {
    let root = private_temp_root()?;
    agiworkforce_worktree::add_sandbox_writable_roots([root.clone()]);
    tempfile::Builder::new()
        .prefix("sandbox-scratch-")
        .tempdir_in(root)
        .map_err(|e| format!("failed to create sandbox scratch directory: {e}"))
}

/// The scratch directory's path as the sandbox profile names it.
pub fn scratch_path(scratch: &tempfile::TempDir) -> PathBuf {
    scratch
        .path()
        .canonicalize()
        .unwrap_or_else(|_| scratch.path().to_path_buf())
}

/// A program rewritten to run under the sandbox. `scratch` is removed when
/// this is dropped, so the caller keeps it for as long as the program runs.
pub struct SandboxedProgram {
    pub program: String,
    pub args: Vec<String>,
    pub scratch: Option<tempfile::TempDir>,
}

/// A shell the host runs outside any sandbox, by absolute path. A bare `sh`
/// or `bash` is looked up on `PATH`, where a project's `.venv/bin` can come
/// first with one a sandboxed program left there. Anything that is not a
/// bare shell name, and every name on Windows, is returned as it is; so is
/// a shell found in none of the system folders.
pub fn host_shell(program: &str) -> String {
    const SHELLS: [&str; 4] = ["sh", "bash", "zsh", "fish"];
    const SYSTEM_DIRS: [&str; 5] = [
        "/bin",
        "/usr/bin",
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/run/current-system/sw/bin",
    ];
    if cfg!(windows) || !SHELLS.contains(&program) {
        return program.to_string();
    }
    SYSTEM_DIRS
        .iter()
        .map(|dir| Path::new(dir).join(program))
        .find(|path| path.is_file())
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| program.to_string())
}

/// `name` in [`private_temp_root`], a writable root only this user writes,
/// created owner-only when missing and named for every host check. A sandbox
/// writes its own root, so it can replace one with a link, such as to the
/// home folder, for the next launch to grant, or open it to other users. The
/// last component is never followed: a link, a directory another user owns,
/// one group or others can write, or one [`is_safe_write_root`] refuses is
/// not used.
fn private_dir(name: &str) -> Result<PathBuf, String> {
    let parent = private_temp_root()?;
    let dir = parent.join(name);
    #[cfg(unix)]
    {
        use std::os::unix::fs::{DirBuilderExt, MetadataExt};
        let uid = std::fs::metadata(&parent)
            .map_err(|e| format!("failed to read {}: {e}", parent.display()))?
            .uid();
        match std::fs::DirBuilder::new().mode(0o700).create(&dir) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(format!("failed to create {}: {e}", dir.display())),
        }
        let metadata = std::fs::symlink_metadata(&dir)
            .map_err(|e| format!("failed to read {}: {e}", dir.display()))?;
        if !metadata.is_dir() || metadata.uid() != uid {
            return Err(format!(
                "{} is not a directory this user owns, so it is not used",
                dir.display()
            ));
        }
        if metadata.mode() & 0o022 != 0 {
            return Err(format!(
                "{} is writable by other users, so it is not used; run chmod 700 {}",
                dir.display(),
                dir.display()
            ));
        }
    }
    #[cfg(not(unix))]
    {
        match std::fs::create_dir(&dir) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(e) => return Err(format!("failed to create {}: {e}", dir.display())),
        }
        let metadata = std::fs::symlink_metadata(&dir)
            .map_err(|e| format!("failed to read {}: {e}", dir.display()))?;
        if !metadata.is_dir() {
            return Err(format!(
                "{} is not a directory, so it is not used",
                dir.display()
            ));
        }
    }
    if !is_safe_write_root(&dir) {
        return Err(format!(
            "{} is the filesystem root, the home folder or above it, so no sandbox writes it",
            dir.display()
        ));
    }
    agiworkforce_worktree::add_sandbox_writable_roots([dir.clone()]);
    Ok(dir)
}

pub use agiworkforce_sandbox_policy::is_safe_write_root;

/// Where cache variables point inside the sandbox for a program with
/// [`SandboxCaches::Private`]: seatbelt's fresh scratch directory, or under
/// the private tmpfs bubblewrap mounts on /tmp.
const BUBBLEWRAP_CACHE_BASE: &str = "/tmp/agiworkforce-cache";

/// Which package caches a sandboxed program gets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SandboxCaches {
    /// The [`shared_sandbox_cache`] every sandboxed hook and MCP server uses.
    Shared,
    /// An empty one of its own, removed when it exits.
    Private,
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
/// its own.
fn shared_sandbox_cache() -> Option<PathBuf> {
    private_dir("sandbox-cache").ok()
}

/// Cache locations for one sandboxed program, all under `base`: the
/// [`shared_sandbox_cache`] or the program's private scratch space. The
/// host's own caches cannot be shared: `~/.npm/_npx`, uv's cache
/// and pnpm's cache hold the packages that a later host `npx`, `uvx` or
/// `pnpm dlx` runs; corepack's cache holds the pnpm and yarn the host shims
/// run; pre-commit's holds hook environments; and npm, pip and pnpm map
/// package names to content through index entries any writer can forge.
/// `XDG_CACHE_HOME` also moves pnpm's cache and, on Linux, pip's.
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
/// caller's environment leaves unset or empty and then execs the program. A
/// value the caller set is kept only when it names a directory inside
/// `writable`; anywhere else the tool could not write its cache, so the
/// scratch default replaces it. `caller_value` reads the environment the
/// program will inherit. The defaults travel as positional arguments, so no
/// path is ever parsed as shell syntax.
fn with_cache_env(
    program: &str,
    args: &[String],
    base: &Path,
    writable: &[PathBuf],
    caller_value: &dyn Fn(&str) -> Option<String>,
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
                    "The sandbox cannot write this cache directory, so the sandboxed program uses a private one"
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
            .map(|(_, path)| path.to_string_lossy().to_string()),
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

/// Configuration a sandboxed process must not rewrite: the hook and dotfile
/// directory, the directory host git reads its configuration from, the app
/// data directory with the global MCP config, and the active project's MCP
/// config files.
pub fn protected_config_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".agiworkforce"));
    }
    paths.extend(agiworkforce_worktree::host_git_config_dir());
    if let Ok(app_data) = crate::sys::utils::app_data_dir() {
        paths.push(app_data);
    }
    if let Some(project) = crate::core::mcp::McpServersConfig::active_project_folder_from_env() {
        paths.extend(crate::core::mcp::McpServersConfig::project_config_candidates(&project));
    }
    paths
        .into_iter()
        .map(|path| path.canonicalize().unwrap_or(path))
        .collect()
}

/// The directory a sandboxed program may write to: the active project when
/// one is open, otherwise the process working directory, and a private
/// directory when either resolves to the filesystem root, the home directory
/// or above it. A packaged app starts in `/`. The project keeps the spelling
/// the user opened, never where it resolves: a sandboxed command can replace
/// the folder with a link, which the sandbox refuses only while it still
/// sees the link.
pub fn sandbox_workspace() -> Result<PathBuf, String> {
    let project = crate::core::mcp::McpServersConfig::active_project_folder_from_env()
        .and_then(|project| std::path::absolute(project).ok())
        .map(|project| project.components().collect::<PathBuf>());
    let cwd = std::env::current_dir()
        .ok()
        .map(|cwd| cwd.canonicalize().unwrap_or(cwd));
    let workspace = match project
        .or(cwd)
        .filter(|dir| is_safe_write_root(&dir.canonicalize().unwrap_or_else(|_| dir.clone())))
    {
        Some(dir) => dir,
        None => fallback_agent_workspace()?,
    };
    agiworkforce_worktree::register_workspace_root(workspace.clone());
    Ok(workspace)
}

fn fallback_agent_workspace() -> Result<PathBuf, String> {
    private_dir("agent-workspace")
}

/// A workspace for servers started with no project open. A Finder-launched
/// app has `/` as its working directory, which no sandbox will accept.
pub(crate) fn mcp_workspace() -> Result<PathBuf, String> {
    if crate::core::mcp::McpServersConfig::active_project_folder_from_env().is_some() {
        return sandbox_workspace();
    }
    private_dir("mcp-workspace")
}

/// Rewrite `program args` to run under the full-read sandbox. `Ok(None)`
/// means this host has no sandbox backend at all (Windows), where the caller
/// keeps running the program directly; on macOS and Linux a missing backend
/// fails closed. `caller_value` reads the environment the program will
/// inherit.
pub fn full_read_sandbox_program(
    program: &str,
    args: &[String],
    workspace_dir: &Path,
    extra_writable_roots: &[PathBuf],
    protected_paths: &[PathBuf],
    network_policy: NetworkPolicy,
    caches: SandboxCaches,
    caller_value: &dyn Fn(&str) -> Option<String>,
) -> Result<Option<SandboxedProgram>, String> {
    full_read_sandbox_program_guarding(
        program,
        args,
        workspace_dir,
        extra_writable_roots,
        protected_paths,
        &[],
        network_policy,
        caches,
        caller_value,
    )
}

/// The entries of the CLI folder shared with this app that hold a key, a
/// token or the user's conversations. The rest of that folder stays readable,
/// so a hook script kept there still runs.
const SHARED_CLI_SECRET_ENTRIES: [&str; 13] = [
    "auth.json",
    "auth.toml",
    "secrets",
    "config.toml",
    "hooks.json",
    "hooks.yaml",
    "mcp.json",
    ".mcp.json",
    "mcp-oauth.json",
    "history.txt",
    "conversations",
    "managed_sessions",
    "managed_session_metadata",
];

/// Where this user's credentials are kept: the locations
/// [`agiworkforce_sandbox_policy::credential_paths`] names under the home
/// folder, the secret entries of the shared CLI folder, and this app's data
/// folder, which holds its sign-in, stored tokens and databases.
pub fn credential_locations() -> Vec<PathBuf> {
    let mut locations = Vec::new();
    if let Some(home) = dirs::home_dir() {
        locations.extend(agiworkforce_sandbox_policy::credential_paths(&home));
        let shared = home.join(".agiworkforce");
        locations.extend(SHARED_CLI_SECRET_ENTRIES.map(|name| shared.join(name)));
    }
    locations.extend(crate::sys::utils::app_data_dir().ok());
    locations
}

/// [`full_read_sandbox_program`] for a program that must not read
/// `unreadable` either. An MCP server keeps the network and reads
/// everywhere, so it is started with [`credential_locations`] here: it could
/// otherwise send a key or a token out. A server that needs one of them runs
/// outside the sandbox, which the user chooses per server.
#[allow(clippy::too_many_arguments)]
pub fn full_read_sandbox_program_guarding(
    program: &str,
    args: &[String],
    workspace_dir: &Path,
    extra_writable_roots: &[PathBuf],
    protected_paths: &[PathBuf],
    unreadable: &[PathBuf],
    network_policy: NetworkPolicy,
    caches: SandboxCaches,
    caller_value: &dyn Fn(&str) -> Option<String>,
) -> Result<Option<SandboxedProgram>, String> {
    let shared_cache = match caches {
        SandboxCaches::Shared => shared_sandbox_cache(),
        SandboxCaches::Private => None,
    };
    let extra_writable_roots: Vec<PathBuf> = extra_writable_roots
        .iter()
        .cloned()
        .chain(shared_cache.clone())
        .collect();
    let extra_writable_roots = extra_writable_roots.as_slice();
    agiworkforce_worktree::add_sandbox_writable_roots(
        std::iter::once(workspace_dir.to_path_buf()).chain(extra_writable_roots.iter().cloned()),
    );
    let Some((backend, _)) = detect_sandbox_backend() else {
        if cfg!(target_os = "macos") || cfg!(target_os = "linux") {
            return Err(
                "The OS sandbox is required but sandbox-exec (macOS) or bwrap (Linux) is not \
                 installed."
                    .to_string(),
            );
        }
        tracing::warn!(
            "No OS sandbox backend on this platform; running '{}' unsandboxed",
            program
        );
        return Ok(None);
    };

    let spec = agiworkforce_sandbox_policy::FullReadSpec {
        workspace_dir,
        extra_writable_roots,
        network_policy,
    };
    let scratch = match backend {
        SandboxBackend::MacosSeatbelt => Some(create_sandbox_scratch_dir()?),
        SandboxBackend::LinuxBubblewrap => None,
    };
    let scratch_dir = scratch.as_ref().map(scratch_path);
    let cache_base = shared_cache
        .or_else(|| scratch_dir.clone())
        .unwrap_or_else(|| PathBuf::from(BUBBLEWRAP_CACHE_BASE));
    let writable: Vec<PathBuf> = std::iter::once(workspace_dir.to_path_buf())
        .chain(extra_writable_roots.iter().cloned())
        .chain(std::iter::once(
            scratch_dir.clone().unwrap_or_else(|| PathBuf::from("/tmp")),
        ))
        .collect();
    let (program, args) = with_cache_env(program, args, &cache_base, &writable, caller_value);
    let wrapped = agiworkforce_sandbox_policy::full_read_program_guarding(
        backend,
        &spec,
        protected_paths,
        unreadable,
        scratch_dir.as_deref(),
        &program,
        &args,
    )?;
    warn_unprotected_once(&wrapped.unprotected);
    Ok(Some(SandboxedProgram {
        program: wrapped.command,
        args: wrapped.args,
        scratch,
    }))
}

/// Protected paths already reported this launch. Every sandboxed launch
/// returns the same missing paths, so each is logged once.
static REPORTED_UNPROTECTED: std::sync::LazyLock<std::sync::Mutex<HashSet<PathBuf>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(HashSet::new()));

fn warn_unprotected_once(unprotected: &[PathBuf]) {
    let Ok(mut reported) = REPORTED_UNPROTECTED.lock() else {
        return;
    };
    let new: Vec<&PathBuf> = unprotected
        .iter()
        .filter(|path| reported.insert((*path).clone()))
        .collect();
    if !new.is_empty() {
        tracing::warn!(
            paths = ?new,
            "The sandbox cannot keep these missing configuration paths read-only; a sandboxed program could create them"
        );
    }
}

fn is_filesystem_server_package(arg: &str) -> bool {
    arg == FILESYSTEM_SERVER_PACKAGE
        || arg
            .strip_prefix(FILESYSTEM_SERVER_PACKAGE)
            .is_some_and(|version| version.starts_with('@'))
}

/// The filesystem server's roots: the directories listed after its package
/// name, which are the roots the MCP settings show and the user chose. Any
/// other server's directory arguments stay read-only, and so does a root
/// that resolves to the home directory or above it. A root is followed only
/// through links root owns, such as `/tmp` on macOS: any other link may be
/// one a sandboxed command made in place of a folder, so the server does not
/// start, and the error names the real folder to configure instead.
fn filesystem_server_roots(args: &[String]) -> Result<Vec<PathBuf>, String> {
    let Some(package) = args
        .iter()
        .position(|arg| is_filesystem_server_package(arg))
    else {
        return Ok(Vec::new());
    };
    let roots = args[package + 1..]
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
        .map(|path| agiworkforce_sandbox_policy::host_path::resolve_root_for_use(&path))
        .collect::<Result<Vec<PathBuf>, String>>()?;
    Ok(roots
        .into_iter()
        .filter(|path| {
            path.canonicalize()
                .is_ok_and(|resolved| is_safe_write_root(&resolved))
        })
        .collect())
}

/// Sandbox for a stdio MCP server: workspace and the filesystem server's
/// chosen roots writable, configuration read-only, external network allowed.
/// On macOS loopback and local Unix sockets stay closed, because tmux's
/// socket or `/var/run/docker.sock` would let a server run commands outside
/// the sandbox. On Linux bubblewrap has no address filter and a long-lived
/// server is never checked against a destination, so a server there that
/// keeps the network reaches loopback and Unix sockets too. A server the
/// user let reach services on this computer, `allow_local_network`, gets the
/// whole network on every platform.
pub fn mcp_server_sandbox_program(
    program: &str,
    args: &[String],
    allow_local_network: bool,
    caller_value: &dyn Fn(&str) -> Option<String>,
) -> Result<Option<SandboxedProgram>, String> {
    let workspace = mcp_workspace()?;
    let mut extra_roots = filesystem_server_roots(args)?;
    extra_roots.sort();
    extra_roots.dedup();
    full_read_sandbox_program_guarding(
        program,
        args,
        &workspace,
        &extra_roots,
        &protected_config_paths(),
        &credential_locations(),
        if allow_local_network {
            NetworkPolicy::Allow
        } else {
            NetworkPolicy::AllowExternal
        },
        SandboxCaches::Shared,
        caller_value,
    )
}

/// The opt-out covers the exact command the user saw, and the content of
/// each file it names that a sandboxed process could write. A changed command,
/// argument list or such file runs sandboxed again until the user opts out
/// again.
pub fn launch_fingerprint(command: &str, args: &[String]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(command.as_bytes());
    for arg in args {
        hasher.update([0u8]);
        hasher.update(arg.as_bytes());
    }
    for (named, content_hash) in writable_launch_files(command, args) {
        hasher.update([1u8]);
        hasher.update(named.as_bytes());
        hasher.update([0u8]);
        hasher.update(content_hash.as_bytes());
    }
    hex::encode(hasher.finalize())
}

/// Everywhere a sandboxed process could have left a file an MCP server loads.
fn sandbox_writable_roots() -> Vec<PathBuf> {
    let workspace = mcp_workspace().ok();
    let extra: Vec<&Path> = workspace.iter().map(PathBuf::as_path).collect();
    agiworkforce_sandbox_policy::host_path::untrusted_roots(&extra)
}

/// Why this launch may not leave the sandbox, when it may not: it names a
/// folder a sandboxed process can write that holds nothing the opt-out could
/// pin, so allowing it would allow whatever is put there later.
pub fn unsandboxed_refusal(command: &str, args: &[String]) -> Option<String> {
    let folder = agiworkforce_sandbox_policy::launch_files::unpinnable_launch_folder(
        std::env::current_dir().ok().as_deref(),
        command,
        args,
        &sandbox_writable_roots(),
        &package_entries,
    )?;
    let folder = if folder == "." {
        "the folder it starts in".to_string()
    } else {
        format!("the folder {folder}")
    };
    Some(format!(
        "The sandbox stays on for this server: it runs from {folder}, which a \
         sandboxed program can change and which holds no package.json, pyproject.toml, uv.lock, \
         Cargo.toml or entry file to check. Name the file it runs, or add one of those, then \
         turn the sandbox off again."
    ))
}

/// The files a `package.json` says the package starts from.
pub(crate) fn package_entries(manifest: &Path) -> Vec<String> {
    let Some(package) = std::fs::read(manifest)
        .ok()
        .and_then(|raw| serde_json::from_slice::<serde_json::Value>(&raw).ok())
    else {
        return Vec::new();
    };
    let mut entries: Vec<String> = package
        .get("main")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
        .into_iter()
        .collect();
    match package.get("bin") {
        Some(serde_json::Value::String(bin)) => entries.push(bin.clone()),
        Some(serde_json::Value::Object(bins)) => entries.extend(
            bins.values()
                .filter_map(serde_json::Value::as_str)
                .map(str::to_string),
        ),
        _ => {}
    }
    entries
}

/// The content hash of each file the launch runs code from that a sandboxed
/// process could have written: one in the MCP workspace, a root a sandbox
/// writes, or a temporary folder. That is the command, each file named where
/// the tool reads it as code, and the ones a launch folder or a Python module
/// implies; a file the server is only pointed at, such as a database, is data
/// and stays out. A relative name is read from this process's working folder,
/// where an unsandboxed server starts. What those files import is not
/// followed, and the confirmation says so.
fn writable_launch_files(command: &str, args: &[String]) -> Vec<(String, String)> {
    let roots = sandbox_writable_roots();
    agiworkforce_sandbox_policy::launch_files::pinnable_launch_files(
        std::env::current_dir().ok().as_deref(),
        command,
        args,
        &package_entries,
    )
    .into_iter()
    .filter_map(|(label, path)| {
        let canonical = std::fs::canonicalize(path).ok()?;
        if !canonical.is_file()
            || !agiworkforce_sandbox_policy::host_path::inside_any(&canonical, &roots)
        {
            return None;
        }
        let content = std::fs::read(&canonical).ok()?;
        Some((label, hex::encode(Sha256::digest(&content))))
    })
    .collect()
}

/// What the user is told before a server leaves the sandbox: what it can
/// then do, which of its files run sandboxed again when they change, and that
/// the rest do not.
pub fn unsandboxed_consequence(server_name: &str, command: &str, args: &[String]) -> String {
    let pinned: Vec<String> = writable_launch_files(command, args)
        .into_iter()
        .map(|(named, _)| named)
        .collect();
    let rechecked = if pinned.is_empty() {
        "None of the files it loads is checked again".to_string()
    } else {
        format!(
            "A change to {} puts it back in the sandbox until you allow it again, but no other \
             file it loads is checked again",
            pinned.join(", ")
        )
    };
    format!(
        "'{server_name}' will run with your full user rights: it can read, change and delete \
         any file you can, including other apps' data and your AGI Workforce settings. \
         {rechecked}, so an edit to one of those runs with your rights the next time it starts. \
         Keep the sandbox on to contain it; you can turn it back on in MCP settings at any time. \
         In the sandbox it can reach the internet but cannot read your keys, cloud logins, \
         keychains or this app's own data."
    )
}

fn unsandboxed_key(server_name: &str) -> String {
    format!("{UNSANDBOXED_KEY_PREFIX}{server_name}")
}

/// True when the user chose to run this server, with this exact command,
/// outside the sandbox.
pub fn server_runs_unsandboxed(server_name: &str, command: &str, args: &[String]) -> bool {
    if unsandboxed_refusal(command, args).is_some() {
        return false;
    }
    stored_opt_out(server_name).is_some_and(|stored| stored == launch_fingerprint(command, args))
}

/// The launch the user last let out of the sandbox for this server, if any.
fn stored_opt_out(server_name: &str) -> Option<String> {
    let conn = crate::core::mcp::config::open_mcp_settings_db().ok()?;
    conn.query_row(
        "SELECT value FROM settings_v2 WHERE key = ?1",
        rusqlite::params![unsandboxed_key(server_name)],
        |row| row.get::<_, String>(0),
    )
    .ok()
}

/// Why a server the user let out of the sandbox is running inside it again,
/// when the reason is one they cannot see from the command: the folder it
/// runs from no longer holds anything the opt-out could pin.
pub fn contained_reason(server_name: &str, command: &str, args: &[String]) -> Option<String> {
    stored_opt_out(server_name)?;
    unsandboxed_refusal(command, args)
}

/// [`server_runs_unsandboxed`] for the moment a server starts, which also
/// records why a server the user let out is being kept in.
pub fn launch_runs_unsandboxed(server_name: &str, command: &str, args: &[String]) -> bool {
    if let Some(reason) = contained_reason(server_name, command, args) {
        tracing::warn!("[MCP Sandbox] '{server_name}' starts in the sandbox: {reason}");
    }
    server_runs_unsandboxed(server_name, command, args)
}

pub fn set_server_unsandboxed(
    server_name: &str,
    command: &str,
    args: &[String],
    unsandboxed: bool,
) -> Result<(), String> {
    let conn = crate::core::mcp::config::open_mcp_settings_db()?;
    if unsandboxed {
        if let Some(reason) = unsandboxed_refusal(command, args) {
            return Err(reason);
        }
        crate::core::mcp::config::upsert_settings_v2_value(
            &conn,
            &unsandboxed_key(server_name),
            &launch_fingerprint(command, args),
            "security",
            false,
        )
    } else {
        conn.execute(
            "DELETE FROM settings_v2 WHERE key = ?1",
            rusqlite::params![unsandboxed_key(server_name)],
        )
        .map(|_| ())
        .map_err(|e| format!("Failed to clear the sandbox opt-out: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hooks_are_sandboxed_unless_the_variable_turns_it_off() {
        assert!(!sandbox_opted_out(None));
        assert!(!sandbox_opted_out(Some("1")));
        assert!(!sandbox_opted_out(Some("")));
        for off in ["0", "false", "OFF", " no "] {
            assert!(sandbox_opted_out(Some(off)), "{off}");
        }
    }

    #[test]
    fn host_git_configuration_is_kept_read_only() {
        let _env = crate::sys::utils::APP_DATA_DIR_ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some(git_config) = agiworkforce_worktree::host_git_config_dir() else {
            return;
        };
        let git_config = git_config.canonicalize().unwrap_or(git_config);
        assert!(protected_config_paths().contains(&git_config));
    }

    #[test]
    fn editing_a_file_an_unsandboxed_server_runs_from_a_writable_folder_changes_its_fingerprint() {
        let folder = tempfile::tempdir().unwrap();
        let script = folder.path().join("mcp.js");
        std::fs::write(&script, "console.log('approved')").unwrap();
        let args = vec![script.to_string_lossy().into_owned()];
        let approved = launch_fingerprint("node", &args);
        assert_eq!(approved, launch_fingerprint("node", &args));

        std::fs::write(&script, "require('child_process').exec('planted')").unwrap();
        assert_ne!(approved, launch_fingerprint("node", &args));
    }

    #[test]
    fn editing_what_a_folder_launch_starts_from_changes_its_fingerprint() {
        let folder = tempfile::tempdir().unwrap();
        let manifest = folder.path().join("package.json");
        let entry = folder.path().join("server.js");
        std::fs::write(&manifest, r#"{"main": "server.js"}"#).unwrap();
        std::fs::write(&entry, "console.log('approved')").unwrap();
        std::fs::write(folder.path().join("notes.md"), "notes").unwrap();
        let args = vec![folder.path().to_string_lossy().into_owned()];
        let approved = launch_fingerprint("node", &args);

        std::fs::write(folder.path().join("notes.md"), "edited").unwrap();
        assert_eq!(approved, launch_fingerprint("node", &args));

        std::fs::write(&entry, "require('child_process').exec('planted')").unwrap();
        let entry_edited = launch_fingerprint("node", &args);
        assert_ne!(approved, entry_edited);

        std::fs::write(&manifest, r#"{"main": "other.js"}"#).unwrap();
        assert_ne!(entry_edited, launch_fingerprint("node", &args));
    }

    #[test]
    fn a_launch_from_a_writable_folder_with_nothing_to_pin_may_not_leave_the_sandbox() {
        let folder = tempfile::tempdir().unwrap();
        std::fs::write(folder.path().join("server.py"), "print('x')").unwrap();
        let args = vec![
            "--directory".to_string(),
            folder.path().to_string_lossy().into_owned(),
            "run".to_string(),
            "server".to_string(),
        ];

        let refusal = unsandboxed_refusal("uv", &args).expect("nothing in the folder is pinned");
        assert!(refusal.contains("The sandbox stays on for this server"));
        assert!(refusal.contains(&*folder.path().to_string_lossy()));
        assert!(!server_runs_unsandboxed("tool", "uv", &args));

        std::fs::write(folder.path().join("uv.lock"), "version = 1").unwrap();
        assert_eq!(unsandboxed_refusal("uv", &args), None);
        let approved = launch_fingerprint("uv", &args);
        std::fs::write(folder.path().join("uv.lock"), "version = 2").unwrap();
        assert_ne!(approved, launch_fingerprint("uv", &args));
    }

    #[test]
    fn a_file_the_server_is_only_pointed_at_is_not_part_of_its_fingerprint() {
        let folder = tempfile::tempdir().unwrap();
        let script = folder.path().join("server.js");
        let database = folder.path().join("data.sqlite");
        std::fs::write(&script, "console.log('approved')").unwrap();
        std::fs::write(&database, "rows").unwrap();
        let args = vec![
            script.to_string_lossy().into_owned(),
            "--db".to_string(),
            database.to_string_lossy().into_owned(),
        ];
        let approved = launch_fingerprint("node", &args);

        std::fs::write(&database, "more rows").unwrap();
        assert_eq!(approved, launch_fingerprint("node", &args));

        std::fs::write(&script, "require('child_process').exec('planted')").unwrap();
        assert_ne!(approved, launch_fingerprint("node", &args));
    }

    #[test]
    fn a_folder_given_to_a_server_as_data_neither_pins_nor_blocks_the_opt_out() {
        let folder = tempfile::tempdir().unwrap();
        let args = vec![
            "-y".to_string(),
            "@modelcontextprotocol/server-filesystem".to_string(),
            folder.path().to_string_lossy().into_owned(),
        ];
        assert_eq!(unsandboxed_refusal("npx", &args), None);

        let approved = launch_fingerprint("npx", &args);
        std::fs::write(folder.path().join("package.json"), "{}").unwrap();
        assert_eq!(approved, launch_fingerprint("npx", &args));
    }

    #[test]
    fn the_confirmation_names_the_pinned_files_and_says_the_rest_are_not_checked() {
        let folder = tempfile::tempdir().unwrap();
        let script = folder.path().join("mcp.js");
        std::fs::write(&script, "console.log('approved')").unwrap();
        let named = script.to_string_lossy().into_owned();

        let pinned = unsandboxed_consequence("tool", "node", std::slice::from_ref(&named));
        assert!(pinned.contains("'tool' will run with your full user rights"));
        assert!(pinned.contains(&format!("A change to {named} puts it back in the sandbox")));
        assert!(pinned.contains("no other file it loads is checked again"));
        assert!(pinned.contains("Keep the sandbox on to contain it"));

        let unpinned = unsandboxed_consequence("tool", "npx", &["-y".to_string()]);
        assert!(unpinned.contains("None of the files it loads is checked again"));
    }

    #[test]
    fn fingerprint_changes_with_command_or_arguments() {
        let base = launch_fingerprint("npx", &["-y".to_string(), "pkg@1.0.0".to_string()]);
        assert_eq!(
            base,
            launch_fingerprint("npx", &["-y".to_string(), "pkg@1.0.0".to_string()])
        );
        assert_ne!(
            base,
            launch_fingerprint("npx", &["-y".to_string(), "pkg@2.0.0".to_string()])
        );
        assert_ne!(
            base,
            launch_fingerprint("node", &["-y".to_string(), "pkg@1.0.0".to_string()])
        );
        assert_ne!(
            launch_fingerprint("a", &["bc".to_string()]),
            launch_fingerprint("a", &["b".to_string(), "c".to_string()])
        );
    }

    #[test]
    fn filesystem_roots_skip_relative_missing_root_and_home_paths() {
        let temp = std::env::temp_dir().canonicalize().expect("temp dir");
        let home = dirs::home_dir().expect("home dir");
        let roots = filesystem_server_roots(&[
            "-y".to_string(),
            format!("{FILESYSTEM_SERVER_PACKAGE}@1.4.2"),
            "/".to_string(),
            home.to_string_lossy().to_string(),
            "relative/dir".to_string(),
            "/definitely/not/here".to_string(),
            temp.to_string_lossy().to_string(),
        ])
        .unwrap();
        assert_eq!(roots, vec![temp]);
    }

    #[cfg(unix)]
    #[test]
    fn a_filesystem_root_replaced_with_a_link_stops_the_server_naming_its_real_folder() {
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
            FILESYSTEM_SERVER_PACKAGE.to_string(),
            format!("{}/", docs.display()),
            notes.to_string_lossy().into_owned(),
        ];
        assert_eq!(
            filesystem_server_roots(&args).unwrap(),
            vec![docs.clone(), notes.clone()]
        );

        std::fs::remove_dir(&docs).unwrap();
        std::os::unix::fs::symlink(&elsewhere, &docs).unwrap();
        let error = filesystem_server_roots(&args).expect_err("the linked root is refused");
        assert!(
            error.contains(&elsewhere.display().to_string()),
            "the error names the real folder: {error}"
        );
        let spec = agiworkforce_sandbox_policy::FullReadSpec {
            workspace_dir: &workspace,
            extra_writable_roots: &[docs.clone()],
            network_policy: NetworkPolicy::Deny,
        };
        assert!(
            agiworkforce_sandbox_policy::full_read::full_read_seatbelt_profile(&spec, &scratch)
                .is_err(),
            "the link is refused at the sandbox too"
        );
        assert!(agiworkforce_sandbox_policy::verify_writable_root(&docs).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn outside_the_temporary_folders_a_root_through_a_users_link_stops_the_server() {
        let exe = std::env::current_exe().unwrap().canonicalize().unwrap();
        let tree = exe
            .parent()
            .unwrap()
            .join(format!("agi-mcp-user-link-{}", uuid::Uuid::new_v4()));
        let real = tree.join("real");
        let link = tree.join("link");
        std::fs::create_dir_all(real.join("inner")).unwrap();
        std::os::unix::fs::symlink(&real, &link).unwrap();
        assert_eq!(
            filesystem_server_roots(&[
                FILESYSTEM_SERVER_PACKAGE.to_string(),
                real.to_string_lossy().into_owned(),
            ])
            .unwrap(),
            vec![real.clone()]
        );

        for root in [link.clone(), link.join("inner")] {
            let error = filesystem_server_roots(&[
                FILESYSTEM_SERVER_PACKAGE.to_string(),
                root.to_string_lossy().into_owned(),
            ])
            .expect_err("a link the user's own commands could have made is never followed");
            assert!(
                error.contains(&format!("goes through a link ({})", link.display())),
                "{error}"
            );
            assert!(error.contains(&real.display().to_string()), "{error}");
        }
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn directory_arguments_of_other_servers_are_not_writable() {
        let temp = std::env::temp_dir().canonicalize().expect("temp dir");
        assert!(filesystem_server_roots(&[
            "-y".to_string(),
            "some-other-server".to_string(),
            temp.to_string_lossy().to_string(),
        ])
        .unwrap()
        .is_empty());
        assert!(filesystem_server_roots(&[
            format!("{FILESYSTEM_SERVER_PACKAGE}m"),
            temp.to_string_lossy().to_string(),
        ])
        .unwrap()
        .is_empty());
    }

    #[test]
    fn home_root_and_their_ancestors_are_never_write_roots() {
        let home = dirs::home_dir().expect("home dir");
        let home = home.canonicalize().unwrap_or(home);
        assert!(!is_safe_write_root(Path::new("/")));
        assert!(!is_safe_write_root(&home));
        if let Some(parent) = home.parent() {
            assert!(!is_safe_write_root(parent));
        }
        assert!(is_safe_write_root(&home.join("projects").join("app")));
        assert!(!is_safe_write_root(Path::new("relative")));
    }

    #[test]
    fn mcp_servers_cannot_reach_loopback_or_local_sockets() {
        let _env = crate::sys::utils::APP_DATA_DIR_ENV_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if !matches!(
            detect_sandbox_backend(),
            Some((SandboxBackend::MacosSeatbelt, _))
        ) {
            return;
        }
        let launch = mcp_server_sandbox_program("true", &[], false, &|_| None)
            .expect("sandbox")
            .expect("seatbelt wraps the server");
        let profile = &launch.args[1];
        assert!(profile.contains("(deny network-outbound (remote ip \"localhost:*\"))"));
        assert!(profile.contains("(deny network-outbound (subpath \"/\"))"));

        let launch = mcp_server_sandbox_program("true", &[], true, &|_| None)
            .expect("sandbox")
            .expect("seatbelt wraps the server");
        let profile = &launch.args[1];
        assert!(
            !profile.contains("(deny network-outbound (remote ip \"localhost:*\"))"),
            "a server the user let reach this computer keeps loopback"
        );
        assert!(profile.contains("(allow network-outbound)"));
    }

    #[test]
    fn caches_live_in_the_program_scratch_directory() {
        let base = Path::new("/private/tmp/agi-scratch");
        assert_eq!(
            sandbox_cache_env(base),
            vec![
                ("XDG_CACHE_HOME", base.join("xdg")),
                ("npm_config_cache", base.join("npm")),
                ("COREPACK_HOME", base.join("corepack")),
                ("PRE_COMMIT_HOME", base.join("pre-commit")),
                ("UV_CACHE_DIR", base.join("uv")),
                ("PIP_CACHE_DIR", base.join("pip")),
            ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn cache_variables_default_into_scratch_and_leave_caller_values_alone() {
        let (program, args) = with_cache_env(
            "npx",
            &["-y".to_string(), "pkg@1.0.0".to_string()],
            Path::new("/tmp/agiworkforce-cache"),
            &[],
            &|_| None,
        );
        assert_eq!(program, "/bin/sh");
        assert_eq!(
            args,
            vec![
                "-c",
                "XDG_CACHE_HOME=\"${XDG_CACHE_HOME:-$1}\"; export XDG_CACHE_HOME; \
                 npm_config_cache=\"${npm_config_cache:-$2}\"; export npm_config_cache; \
                 COREPACK_HOME=\"${COREPACK_HOME:-$3}\"; export COREPACK_HOME; \
                 PRE_COMMIT_HOME=\"${PRE_COMMIT_HOME:-$4}\"; export PRE_COMMIT_HOME; \
                 UV_CACHE_DIR=\"${UV_CACHE_DIR:-$5}\"; export UV_CACHE_DIR; \
                 PIP_CACHE_DIR=\"${PIP_CACHE_DIR:-$6}\"; export PIP_CACHE_DIR; \
                 shift 6; exec \"$@\"",
                "sh",
                "/tmp/agiworkforce-cache/xdg",
                "/tmp/agiworkforce-cache/npm",
                "/tmp/agiworkforce-cache/corepack",
                "/tmp/agiworkforce-cache/pre-commit",
                "/tmp/agiworkforce-cache/uv",
                "/tmp/agiworkforce-cache/pip",
                "npx",
                "-y",
                "pkg@1.0.0",
            ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn caller_cache_values_win_and_unset_ones_get_the_scratch_default() {
        let (program, args) = with_cache_env(
            "/bin/sh",
            &[
                "-c".to_string(),
                "printf '%s|%s' \"$npm_config_cache\" \"$UV_CACHE_DIR\"".to_string(),
            ],
            Path::new("/scratch base"),
            &[],
            &|_| None,
        );
        let output = std::process::Command::new(program)
            .args(args)
            .env("npm_config_cache", "/caller/npm")
            .env_remove("UV_CACHE_DIR")
            .output()
            .expect("run sh");
        assert_eq!(
            String::from_utf8_lossy(&output.stdout),
            "/caller/npm|/scratch base/uv"
        );
    }

    #[test]
    fn sandboxed_programs_get_no_host_cache_as_a_write_root() {
        let Some(home) = dirs::home_dir() else {
            return;
        };
        let home = home.canonicalize().unwrap_or(home);
        let Ok(Some(launch)) = full_read_sandbox_program(
            "true",
            &[],
            &std::env::temp_dir().canonicalize().expect("temp dir"),
            &[],
            &[],
            NetworkPolicy::Deny,
            SandboxCaches::Shared,
            &|_| None,
        ) else {
            return;
        };
        let wrapped = launch.args.join("\n");
        for cache in [
            home.join(".npm"),
            home.join(".cache"),
            home.join("Library").join("Caches"),
            home.join("Library").join("pnpm"),
            home.join(".local").join("share").join("pnpm"),
        ] {
            assert!(
                !wrapped.contains(cache.to_string_lossy().as_ref()),
                "{cache:?} is writable"
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn sandboxed_hooks_and_servers_share_one_private_cache_and_the_terminal_does_not() {
        let cache = shared_sandbox_cache().expect("a private sandbox cache");
        assert!(cache.starts_with(private_temp_root().expect("private root")));
        let workspace = std::env::temp_dir().canonicalize().expect("temp dir");
        let launch = |caches| {
            full_read_sandbox_program(
                "true",
                &[],
                &workspace,
                &[],
                &[],
                NetworkPolicy::Deny,
                caches,
                &|_| None,
            )
        };
        let (Ok(Some(shared)), Ok(Some(private))) = (
            launch(SandboxCaches::Shared),
            launch(SandboxCaches::Private),
        ) else {
            return;
        };
        let npm = cache.join("npm").to_string_lossy().to_string();
        assert!(shared.args.contains(&npm), "{:?}", shared.args);
        assert!(
            !private
                .args
                .join("\n")
                .contains(cache.to_string_lossy().as_ref()),
            "the agent terminal reaches the shared cache"
        );
    }

    #[test]
    fn a_cache_directory_the_sandbox_cannot_write_is_replaced_with_the_scratch_one() {
        let writable = tempfile::tempdir().expect("writable root");
        let writable = writable.path().canonicalize().expect("writable root");
        let inside = writable.join("npm").to_string_lossy().to_string();
        let (_, args) = with_cache_env(
            "npx",
            &[],
            Path::new("/scratch"),
            std::slice::from_ref(&writable),
            &|name| match name {
                "npm_config_cache" => Some(inside.clone()),
                "UV_CACHE_DIR" => Some("/somewhere/the/sandbox/cannot/write".to_string()),
                _ => None,
            },
        );
        let script = &args[1];
        assert!(
            script.contains("npm_config_cache=\"${npm_config_cache:-$2}\""),
            "{script}"
        );
        assert!(script.contains("UV_CACHE_DIR=\"$5\";"), "{script}");
    }

    #[test]
    fn a_launcher_is_never_resolved_through_path() {
        let Some((_, launcher)) = detect_sandbox_backend() else {
            return;
        };
        assert!(launcher.is_absolute(), "{}", launcher.display());
        if cfg!(target_os = "macos") {
            assert_eq!(launcher, Path::new("/usr/bin/sandbox-exec"));
        }
    }

    #[cfg(unix)]
    #[test]
    fn scratch_and_workspaces_live_in_an_owner_only_directory() {
        use std::os::unix::fs::PermissionsExt;
        let root = private_temp_root().expect("private root");
        let mode = std::fs::metadata(&root).expect("root").permissions().mode();
        assert_eq!(mode & 0o077, 0, "{} is open to other users", root.display());

        let scratch = create_sandbox_scratch_dir().expect("scratch");
        let path = scratch_path(&scratch);
        assert!(path.starts_with(&root));
        drop(scratch);
        assert!(!path.exists(), "the scratch directory outlived its owner");

        assert!(fallback_agent_workspace()
            .expect("agent workspace")
            .starts_with(&root));
    }

    #[cfg(unix)]
    #[test]
    fn a_private_root_a_sandbox_replaced_or_opened_is_refused() {
        use std::os::unix::fs::PermissionsExt;
        let root = private_temp_root().expect("private root");
        let name = format!("test-root-{}", uuid::Uuid::new_v4());
        let dir = root.join(&name);

        let created = private_dir(&name).expect("a fresh private directory");
        assert_eq!(created, dir);
        let mode = std::fs::metadata(&dir).unwrap().permissions().mode();
        assert_eq!(mode & 0o077, 0, "created open to other users: {mode:o}");
        assert!(agiworkforce_sandbox_policy::host_path::untrusted_roots(&[]).contains(&dir));

        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o777)).unwrap();
        let opened = private_dir(&name);
        std::fs::remove_dir(&dir).unwrap();
        assert!(opened.is_err(), "a root others can write was used");

        let home = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(home.path(), &dir).unwrap();
        let linked = private_dir(&name);
        std::fs::remove_file(&dir).unwrap();
        assert!(linked.is_err(), "a root replaced with a link was followed");
    }

    #[cfg(unix)]
    #[test]
    fn a_host_shell_is_named_by_absolute_path() {
        assert_eq!(host_shell("sh"), "/bin/sh");
        let bash = host_shell("bash");
        if bash != "bash" {
            assert!(Path::new(&bash).is_absolute(), "{bash}");
        }
        assert_eq!(host_shell("/opt/custom/sh"), "/opt/custom/sh");
        assert_eq!(host_shell("python3"), "python3");
    }
}
