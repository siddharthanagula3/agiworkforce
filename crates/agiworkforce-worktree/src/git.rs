use anyhow::{Context, Result};
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::{Output, Stdio};
use std::sync::{Arc, Mutex, OnceLock, PoisonError};
use std::time::{Duration, Instant};
use tokio::process::Command;

use crate::runner::CommandRunner;
use crate::snapshot::IndexHold;

pub(crate) const GIT_TIMEOUT: Duration = Duration::from_secs(30);
/// Snapshotting stages every file in the tree, which on a large checkout takes
/// far longer than one ref update.
pub(crate) const GIT_SNAPSHOT_TIMEOUT: Duration = Duration::from_secs(300);

/// Settings every host git is given ahead of the repository's own, starting
/// with a hooks directory nothing can put a hook in. The host runs git
/// outside any sandbox, in a work tree an agent's commands can write, so
/// nothing git would execute on its own may run: no hooks, no filesystem
/// monitor, no untracked cache a monitor would feed, and no editor or pager
/// the repository names (`true` accepts a message as it is, `cat` pages
/// nothing). The user's global attributes file is not read either, so
/// attributes come only from the repository, like configuration. Hooks set
/// in configuration (`hook.<name>.command`) ignore `core.hooksPath`;
/// [`crate::config_guard`] refuses those instead.
pub fn host_git_hardening() -> Vec<OsString> {
    let mut hardening = vec![OsString::from("-c"), hooks_path_setting().to_os_string()];
    hardening.extend(HOST_GIT_HARDENING_KEEPING_HOOKS.iter().map(OsString::from));
    hardening
}

#[cfg(windows)]
const NULL_DEVICE: &str = "NUL";
#[cfg(not(windows))]
const NULL_DEVICE: &str = "/dev/null";

/// `core.hooksPath` naming an empty directory beside host git's own
/// configuration, which every sandbox keeps read-only, so no command can put a
/// hook there. `/dev/null` would do on Unix, but Git for Windows can read it as
/// `C:\dev\null`, a folder any command could create. Only when that
/// directory cannot be made, or is not empty, is the null device named.
fn hooks_path_setting() -> &'static OsStr {
    static SETTING: OnceLock<OsString> = OnceLock::new();
    SETTING.get_or_init(|| {
        let mut setting = OsString::from("core.hooksPath=");
        match no_hooks_dir() {
            Some(dir) => setting.push(dir),
            None => setting.push(NULL_DEVICE),
        }
        setting
    })
}

fn no_hooks_dir() -> Option<PathBuf> {
    let dir = user_config_dir()?.join("no-hooks");
    create_private_dir(&dir).ok()?;
    std::fs::read_dir(&dir)
        .ok()?
        .next()
        .is_none()
        .then_some(dir)
}

/// [`host_git_hardening`] without its hook setting, for an operation whose
/// hooks the user approved, as listed and as hashed, before it runs. A
/// checkout, reset, fetch, pull or push never recurses into a submodule:
/// a submodule's `.git` file is in the work tree, so a sandboxed command can
/// point it at a git directory whose configuration it wrote.
pub const HOST_GIT_HARDENING_KEEPING_HOOKS: [&str; 12] = [
    "-c",
    "submodule.recurse=false",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.untrackedCache=false",
    "-c",
    "core.attributesFile=/dev/null",
    "-c",
    "core.editor=true",
    "-c",
    "core.pager=cat",
];

/// `git` for any host git outside this crate that is not an operation whose
/// hooks the user approved: the user's own system and global configuration,
/// which no sandbox can write, with [`host_git_hardening`] ahead of the
/// repository's. Arguments added after this come after the hardening, so a
/// caller's `-C` or subcommand still parses. Git is [`host_git_path`], or
/// when there is none a path that fails to start, and its children search
/// [`host_path`]. A synchronous caller runs it through
/// [`host_git_output_blocking`], so a pipe in the work tree cannot hang it.
///
/// One known limit: git reads `.gitignore` and `.gitattributes` whole, so a
/// sparse one a sandboxed command wrote with a huge apparent size makes git
/// allocate that size. Nothing caps it short of a resource limit, which
/// needs `unsafe` to set on the child.
pub fn host_git() -> std::process::Command {
    let mut command = host_git_bare();
    command.args(host_git_hardening());
    command
}

/// How often [`host_git_output_blocking`] looks for its git to have exited.
const EXIT_POLL_INTERVAL: Duration = Duration::from_millis(10);

/// How long [`host_git_output_blocking`] waits, once git has exited, for its
/// output pipes to close. A process git started can outlive it holding them.
const DRAIN_GRACE: Duration = Duration::from_secs(2);

/// Run `command`, a host git, and collect its output, killing it once
/// `timeout` has passed. A file git reads from a work tree a sandboxed
/// command can write, such as a FIFO named `.gitignore`, `.gitattributes` or
/// `.gitmodules`, would otherwise block git, and this caller, forever. Its
/// stdin is the null device, and stdout and stderr drain on their own
/// threads so a full pipe never stalls it. On Unix git leads its own process
/// group, and the whole group is killed. Running out of time is
/// [`std::io::ErrorKind::TimedOut`].
///
/// Once git has exited its process group is never signalled: the id may
/// already name another group. A pipe a leftover process still holds is
/// given [`DRAIN_GRACE`], then git's exit status is returned with the output
/// read so far.
pub fn host_git_output_blocking(
    mut command: std::process::Command,
    timeout: Duration,
) -> std::io::Result<Output> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let deadline = Instant::now() + timeout;
    let mut child = command.spawn()?;
    let stdout = drain(child.stdout.take());
    let stderr = drain(child.stderr.take());
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(EXIT_POLL_INTERVAL),
            Ok(None) => {
                kill_process_tree(&mut child);
                return Err(git_timed_out());
            }
            Err(error) => {
                kill_process_tree(&mut child);
                return Err(error);
            }
        }
    };
    let grace_ends = Instant::now() + DRAIN_GRACE;
    while !(stdout.reader.is_finished() && stderr.reader.is_finished())
        && Instant::now() < grace_ends
    {
        std::thread::sleep(EXIT_POLL_INTERVAL);
    }
    Ok(Output {
        status,
        stdout: collect(stdout)?,
        stderr: collect(stderr)?,
    })
}

/// A pipe being read on its own thread, into `bytes` as it arrives.
struct Drained {
    bytes: Arc<Mutex<Vec<u8>>>,
    reader: std::thread::JoinHandle<std::io::Result<()>>,
}

fn drain<R: std::io::Read + Send + 'static>(pipe: Option<R>) -> Drained {
    let bytes = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&bytes);
    let reader = std::thread::spawn(move || {
        let Some(mut pipe) = pipe else {
            return Ok(());
        };
        let mut chunk = [0u8; 8192];
        loop {
            match pipe.read(&mut chunk) {
                Ok(0) => return Ok(()),
                Ok(read) => sink
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .extend_from_slice(&chunk[..read]),
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => {}
                Err(error) => return Err(error),
            }
        }
    });
    Drained { bytes, reader }
}

/// What `drained` read: all of it once its pipe closed, or what had arrived
/// while a leftover process still holds the pipe, whose thread is left to
/// end when that process closes it.
fn collect(drained: Drained) -> std::io::Result<Vec<u8>> {
    if drained.reader.is_finished() {
        drained
            .reader
            .join()
            .unwrap_or_else(|_| Err(std::io::Error::other("reading git's output panicked")))?;
    }
    let mut bytes = drained.bytes.lock().unwrap_or_else(PoisonError::into_inner);
    Ok(std::mem::take(&mut *bytes))
}

/// Why [`host_git_output_blocking`] gave up.
pub(crate) const GIT_TIMED_OUT: &str =
    "git did not answer in time; a file in the repository may be a pipe or device";

fn git_timed_out() -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::TimedOut, GIT_TIMED_OUT)
}

/// Kill `child` and, on Unix, the process group it leads, then reap it. The
/// group is signalled through `kill(1)`, since `kill(2)` needs `unsafe`.
fn kill_process_tree(child: &mut std::process::Child) {
    #[cfg(unix)]
    {
        let group = format!("-{}", child.id());
        if let Some(program) = ["/bin/kill", "/usr/bin/kill"]
            .into_iter()
            .find(|program| Path::new(program).is_file())
        {
            let _ = std::process::Command::new(program)
                .args(["-KILL", "--", group.as_str()])
                .env_clear()
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    }
    let _ = child.kill();
    let _ = child.wait();
}

/// [`host_git`] for an async caller.
pub fn host_git_async() -> Command {
    Command::from(host_git())
}

/// [`host_git`] with [`HOST_GIT_HARDENING_KEEPING_HOOKS`] in place of
/// [`host_git_hardening`], for an operation whose hooks the user approved,
/// and for reading where those hooks live.
pub fn host_git_keeping_hooks_async() -> Command {
    let mut command = host_git_bare();
    command.args(HOST_GIT_HARDENING_KEEPING_HOOKS);
    Command::from(command)
}

/// What a host git outside this crate runs when [`host_git_path`] finds no
/// git: a path named for that failure below the null device, which nothing
/// can create, so the command fails to start instead of the system
/// searching for a bare `git`. A folder such as `C:\nonexistent` would not
/// do: any account can create one at the root of a Windows drive.
#[cfg(windows)]
const NO_GIT: &str = r"\\.\NUL\git-not-found-on-a-trusted-PATH.exe";
#[cfg(not(windows))]
const NO_GIT: &str = "/dev/null/git-not-found-on-a-trusted-PATH";

/// [`host_git_path`], or [`NO_GIT`] when there is none, with `PATH` set to
/// [`host_path`] and no arguments yet.
fn host_git_bare() -> std::process::Command {
    let roots = untrusted_roots(&[]);
    let path = host_path_within(&roots);
    let program = git_program_on(&path, &roots).unwrap_or_else(|_| PathBuf::from(NO_GIT));
    let mut command = std::process::Command::new(program);
    command.env("PATH", path);
    command
}

pub use agiworkforce_sandbox_policy::host_path::{
    add_sandbox_writable_roots, host_path, register_workspace_root,
};
pub(crate) use agiworkforce_sandbox_policy::host_path::{
    find_program, host_path_within, inside_any, untrusted_roots,
};

#[cfg(windows)]
const GIT_PROGRAM: &str = "git.exe";
#[cfg(not(windows))]
const GIT_PROGRAM: &str = "git";

/// The `git` [`host_git_path`] last found, with the search path it was
/// found on.
static RESOLVED_GIT: Mutex<Option<(OsString, PathBuf)>> = Mutex::new(None);

/// Why no host git runs when [`host_git_path`] finds none.
pub(crate) const GIT_NOT_FOUND: &str = "git not found on a trusted PATH";

/// The absolute path of the `git` host git runs: the first on [`host_path`],
/// found once and reused while that path is unchanged. Never a bare name,
/// which the operating system would look up at spawn time: when none is
/// found it is a [`std::io::ErrorKind::NotFound`] error saying so.
pub fn host_git_path() -> std::io::Result<PathBuf> {
    let roots = untrusted_roots(&[]);
    git_program_on(&host_path_within(&roots), &roots)
}

fn git_program_on(path: &OsStr, roots: &[PathBuf]) -> std::io::Result<PathBuf> {
    let mut resolved = RESOLVED_GIT.lock().unwrap_or_else(PoisonError::into_inner);
    if let Some((searched, found)) = resolved.as_ref() {
        if searched == path && !inside_any(found, roots) {
            return Ok(found.clone());
        }
    }
    let found = find_program(path, GIT_PROGRAM, roots)
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::NotFound, GIT_NOT_FOUND))?;
    *resolved = Some((path.to_os_string(), found.clone()));
    Ok(found)
}

/// The only variables git inherits from this process. Everything else, such
/// as `GIT_DIR`, `GIT_CONFIG_PARAMETERS` or `GIT_EXTERNAL_DIFF`, would let the
/// environment redirect or extend what the host's git does.
const INHERITED_ENV: [&str; 6] = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SYSTEMROOT"];

/// The settings of the user's own configuration that decide what a file's
/// content is rather than what runs: line-ending conversion, and the file of
/// paths ignored everywhere. Host git reads no system or global
/// configuration, so without these a checkout on Git for Windows would lose
/// the `core.autocrlf` its installer sets system-wide, and a file the user
/// ignores everywhere, such as a `.env`, would be staged into every snapshot
/// ref. The user's `safe.directory` entries come too: git honours them only
/// from system or global configuration, and without them this crate's git,
/// and [`crate::config_guard`]'s reading of a repository, would find no
/// repository in a folder another account owns while the user's own host
/// git runs everything there. Only values are read: `git config --get`
/// runs nothing.
#[derive(Debug, Default, PartialEq, Eq)]
struct UserSettings {
    autocrlf: Option<String>,
    eol: Option<String>,
    excludes_file: Option<PathBuf>,
    /// In the order git reads them, system first; an empty one clears those
    /// before it, as it does for git.
    safe_directories: Vec<String>,
}

/// Host git with nothing of this process's environment but
/// [`INHERITED_ENV`] and `also`, its `PATH` [`host_path`] less anything
/// inside `extra`.
fn clean_host_git(extra: &[&Path], also: &[&str]) -> std::io::Result<std::process::Command> {
    let roots = untrusted_roots(extra);
    let path = host_path_within(&roots);
    let mut command = std::process::Command::new(git_program_on(&path, &roots)?);
    command.env_clear();
    for name in INHERITED_ENV.iter().chain(also) {
        if let Some(value) = std::env::var_os(name) {
            command.env(name, value);
        }
    }
    command.env("PATH", path);
    Ok(command)
}

/// [`clean_host_git`] for reading the user's own configuration, started in
/// [`host_git_config_dir`], which no sandbox can write, or failing that the
/// filesystem root, and looking for no repository above it. In this
/// process's working directory a `.git` there, such as a FIFO, could hang
/// the read, and that repository's location could match an
/// `includeIf "gitdir:"` and change the values read.
fn user_config_query() -> std::io::Result<std::process::Command> {
    let mut query = clean_host_git(&[], &["XDG_CONFIG_HOME"])?;
    let dir = user_config_dir()
        .filter(|dir| create_private_dir(dir).is_ok())
        .unwrap_or_else(|| PathBuf::from(std::path::MAIN_SEPARATOR_STR));
    if let Some(parent) = dir.parent() {
        query.env("GIT_CEILING_DIRECTORIES", parent);
    }
    query.current_dir(dir);
    Ok(query)
}

/// The user's effective value of `key`: their global configuration, or
/// failing that the system one, following their includes, as
/// `git config --global --includes --get` answers outside any repository.
/// Read afresh on every call, since the user can change it at any time;
/// `None` when neither sets it to a non-empty value, or when no trusted git
/// answered in time.
pub fn user_config_value(key: &str) -> Option<String> {
    user_setting(key, false)
}

/// One setting from the user's global configuration, or failing that the
/// system one, following their includes, exactly as their own git resolves
/// it outside a repository.
fn user_setting(key: &str, path: bool) -> Option<String> {
    ["--global", "--system"].iter().find_map(|scope| {
        let mut query = user_config_query().ok()?;
        query.args(["config", scope, "--includes"]);
        if path {
            query.arg("--path");
        }
        query.args(["--get", key]);
        host_git_output_blocking(query, GIT_TIMEOUT)
            .ok()
            .filter(|output| output.status.success())
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

/// Every value of `key` in the user's system and then global configuration,
/// following their includes, in the order git reads them.
fn user_setting_values(key: &str) -> Vec<String> {
    ["--system", "--global"]
        .iter()
        .flat_map(|scope| {
            user_config_query()
                .ok()
                .and_then(|mut query| {
                    query.args(["config", scope, "--includes", "-z", "--get-all", key]);
                    host_git_output_blocking(query, GIT_TIMEOUT).ok()
                })
                .filter(|output| output.status.success())
                .and_then(|output| {
                    let values = output.stdout.strip_suffix(&[0])?;
                    Some(
                        values
                            .split(|byte| *byte == 0)
                            .map(|value| String::from_utf8_lossy(value).into_owned())
                            .collect::<Vec<_>>(),
                    )
                })
                .unwrap_or_default()
        })
        .collect()
}

impl UserSettings {
    fn resolve() -> Self {
        let autocrlf = user_setting("core.autocrlf", false).and_then(|value| {
            match value.to_ascii_lowercase().as_str() {
                "true" | "yes" | "on" | "1" => Some("true".to_string()),
                "false" | "no" | "off" | "0" => Some("false".to_string()),
                "input" => Some("input".to_string()),
                _ => None,
            }
        });
        let eol = user_setting("core.eol", false).and_then(|value| {
            let value = value.to_ascii_lowercase();
            matches!(value.as_str(), "lf" | "crlf" | "native").then_some(value)
        });
        let excludes_file = user_setting("core.excludesFile", true)
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("XDG_CONFIG_HOME")
                    .filter(|value| !value.is_empty())
                    .map(PathBuf::from)
                    .or_else(|| {
                        std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config"))
                    })
                    .map(|config| config.join("git").join("ignore"))
            })
            .filter(|path| path.is_absolute());
        Self {
            autocrlf,
            eol,
            excludes_file,
            safe_directories: user_setting_values("safe.directory"),
        }
    }

    /// These settings as a configuration file, or `None` when there are none
    /// or one cannot be written as a git config value.
    fn render(&self) -> Option<String> {
        let mut entries = Vec::new();
        if let Some(value) = &self.autocrlf {
            entries.push(("autocrlf", value.clone()));
        }
        if let Some(value) = &self.eol {
            entries.push(("eol", value.clone()));
        }
        if let Some(path) = self.excludes_file.as_deref().and_then(Path::to_str) {
            if !path.contains(['\n', '\r', '\0']) {
                entries.push(("excludesFile", path.to_string()));
            }
        }
        let safe: Vec<&String> = self
            .safe_directories
            .iter()
            .filter(|value| !value.contains(['\n', '\r', '\0']))
            .collect();
        if entries.is_empty() && safe.is_empty() {
            return None;
        }
        let quoted = |value: &str| value.replace('\\', "\\\\").replace('"', "\\\"");
        let mut text = String::new();
        if !entries.is_empty() {
            text.push_str("[core]\n");
            for (key, value) in entries {
                text.push_str(&format!("\t{key} = \"{}\"\n", quoted(value.as_str())));
            }
        }
        if !safe.is_empty() {
            text.push_str("[safe]\n");
            for value in safe {
                text.push_str(&format!("\tdirectory = \"{}\"\n", quoted(value.as_str())));
            }
        }
        Some(text)
    }
}

/// The directory host git's own configuration file lives in:
/// `~/.agiworkforce/git`. Every sandbox the CLI and the desktop build keeps
/// it read-only (the CLI's `protected_paths_for`, the desktop's
/// `protected_config_paths`), so no sandboxed command can rewrite what host
/// git reads as its global configuration. `None` without an absolute home.
pub fn host_git_config_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|home| !home.is_empty())
        .or_else(|| std::env::var_os("USERPROFILE").filter(|home| !home.is_empty()))
        .map(PathBuf::from)
        .filter(|home| home.is_absolute())
        .map(|home| home.join(".agiworkforce").join("git"))
}

fn refuse_symlink(path: &Path) -> std::io::Result<()> {
    match std::fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => Err(std::io::Error::other(format!(
            "{} is a symlink",
            path.display()
        ))),
        _ => Ok(()),
    }
}

/// Create `dir` and its missing parents, owner-only, refusing a symlink in
/// place of `dir` either before or after.
pub(crate) fn create_private_dir(dir: &Path) -> std::io::Result<()> {
    refuse_symlink(dir)?;
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(dir)?;
    refuse_symlink(dir)
}

/// Write `text` as `name` in `dir`, owner-only, and return its path. Neither
/// the directory nor the file is followed through a symlink. An existing file
/// with the same content is used as it is; anything else is replaced through
/// a sibling and a rename, so a reader never sees half a file.
pub(crate) fn write_private_file(dir: &Path, name: &str, text: &str) -> std::io::Result<PathBuf> {
    use std::io::Write;

    create_private_dir(dir)?;
    let file = dir.join(name);
    refuse_symlink(&file)?;
    if std::fs::read_to_string(&file).is_ok_and(|found| found == text) {
        return Ok(file);
    }
    let staging = dir.join(format!("{name}.{}.tmp", uuid::Uuid::new_v4().simple()));
    let _ = std::fs::remove_file(&staging);
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let written = options
        .open(&staging)
        .and_then(|mut staged| {
            staged.write_all(text.as_bytes())?;
            staged.sync_all()
        })
        .and_then(|()| std::fs::rename(&staging, &file));
    if let Err(error) = written {
        let _ = std::fs::remove_file(&staging);
        return Err(error);
    }
    Ok(file)
}

fn write_private_config(dir: &Path, text: &str) -> std::io::Result<PathBuf> {
    write_private_file(dir, "user.config", text)
}

static HOST_STATE_DIR: OnceLock<PathBuf> = OnceLock::new();

/// Name the directory where this crate keeps what no sandboxed command may
/// change or hold: each repository's recorded configuration
/// ([`crate::config_guard`]) and the lock files of private indexes. A host
/// names one its sandboxes keep out of every writable root, before it runs
/// git; the first call wins. It is created owner-only now, so a sandbox
/// that can only protect a path that exists protects it.
pub fn set_host_state_dir(dir: PathBuf) {
    if HOST_STATE_DIR.get().is_none() {
        let _ = create_private_dir(&dir);
        let _ = HOST_STATE_DIR.set(dir);
    }
}

/// The directory [`set_host_state_dir`] named. Tests use one under the
/// temporary directory unless a test named its own.
pub(crate) fn host_state_dir() -> Option<PathBuf> {
    HOST_STATE_DIR
        .get()
        .cloned()
        .or_else(default_host_state_dir)
}

#[cfg(not(test))]
fn default_host_state_dir() -> Option<PathBuf> {
    None
}

#[cfg(test)]
fn default_host_state_dir() -> Option<PathBuf> {
    user_config_dir().and_then(|dir| dir.parent().map(|parent| parent.join("state")))
}

/// The file host git reads as its global configuration: the user's settings
/// from [`UserSettings`] and nothing else, so a filter, diff driver or helper
/// the user defines globally never runs. Global scope sits below the
/// repository's own, so a repository that sets any of these keeps its value.
/// It lives only in [`host_git_config_dir`]; when that cannot be used, host
/// git falls back to no global configuration at all.
static USER_CONFIG: tokio::sync::OnceCell<Option<PathBuf>> = tokio::sync::OnceCell::const_new();

/// Where [`USER_CONFIG`] is written. Tests write under the temporary
/// directory, never into the real home.
#[cfg(not(test))]
fn user_config_dir() -> Option<PathBuf> {
    host_git_config_dir()
}

#[cfg(test)]
fn user_config_dir() -> Option<PathBuf> {
    Some(
        std::env::temp_dir()
            .join(format!("agiworkforce-worktree-test-{}", std::process::id()))
            .join("git"),
    )
}

/// Resolve [`USER_CONFIG`] once, every caller waiting on the first.
/// Reading the user's settings runs up to six `git config` processes and
/// writes a file, so it happens on a blocking thread rather than on the
/// async worker that first needs it.
pub(crate) async fn prepare_user_config() {
    USER_CONFIG
        .get_or_init(|| async {
            tokio::task::spawn_blocking(|| {
                let text = UserSettings::resolve().render()?;
                write_private_config(&user_config_dir()?, &text).ok()
            })
            .await
            .ok()
            .flatten()
        })
        .await;
}

/// [`prepare_user_config`] for a synchronous caller, on its own thread.
pub(crate) fn prepare_user_config_blocking() {
    if USER_CONFIG.initialized() {
        return;
    }
    let written = UserSettings::resolve()
        .render()
        .and_then(|text| write_private_config(&user_config_dir()?, &text).ok());
    let _ = USER_CONFIG.set(written);
}

/// `git` in `dir` with a clean environment and no configuration but the
/// repository's own and the user's [`UserSettings`]: no system or global
/// file, so a filter, diff driver or helper defined there never runs. Git
/// for Windows maps `/dev/null` too.
///
/// That includes Git LFS, whose filters `git lfs install` defines globally:
/// a checkout this crate makes holds LFS pointer files rather than their
/// content, and a snapshot stores a tracked LFS file's working-tree content
/// as a plain blob.
pub(crate) async fn git_command(dir: &Path) -> std::io::Result<Command> {
    prepare_user_config().await;
    configured_git_command(dir)
}

fn configured_git_command(dir: &Path) -> std::io::Result<Command> {
    configured_git_command_blocking(dir).map(Command::from)
}

/// [`git_command`] for a synchronous caller. It reads the user's settings only
/// when [`prepare_user_config`] or [`prepare_user_config_blocking`] has
/// prepared them already, and otherwise reads no global configuration at all.
pub(crate) fn configured_git_command_blocking(
    dir: &Path,
) -> std::io::Result<std::process::Command> {
    let mut command = clean_host_git(&[dir], &[])?;
    command
        .current_dir(dir)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env(
            "GIT_CONFIG_GLOBAL",
            USER_CONFIG
                .get()
                .and_then(Option::as_deref)
                .unwrap_or(Path::new("/dev/null")),
        )
        .env("GIT_ATTR_NOSYSTEM", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .args(host_git_hardening());
    Ok(command)
}

/// Let `command`, from [`configured_git_command_blocking`], read the user's
/// own system and global configuration and the files they include, as host
/// git outside this crate does, so [`crate::config_guard`] sees every
/// setting that git would obey and where each lives.
pub(crate) fn read_user_config(command: &mut std::process::Command) {
    command
        .env_remove("GIT_CONFIG_NOSYSTEM")
        .env_remove("GIT_CONFIG_GLOBAL");
    if let Some(xdg) = std::env::var_os("XDG_CONFIG_HOME") {
        command.env("XDG_CONFIG_HOME", xdg);
    }
}

/// The file at `path`, open for reading, when it is a regular file reached
/// without a symlink. On Unix it is opened without blocking and without
/// following a link, and only then checked, so a FIFO put in its place
/// between a look and the open cannot hang the open. Elsewhere it is checked
/// before it is opened and again once it is.
pub(crate) fn open_regular_file(path: &Path) -> Option<std::fs::File> {
    #[cfg(unix)]
    let file = {
        use std::os::unix::fs::OpenOptionsExt;
        std::fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NONBLOCK | libc::O_NOFOLLOW)
            .open(path)
            .ok()?
    };
    #[cfg(not(unix))]
    let file = {
        if !std::fs::symlink_metadata(path).ok()?.is_file() {
            return None;
        }
        std::fs::File::open(path).ok()?
    };
    file.metadata().ok()?.is_file().then_some(file)
}

/// The most read of a one-line git metadata file such as `commondir` or
/// `gitdir`, which holds a single path.
const METADATA_READ_LIMIT: u64 = 4096;

/// The first line of the metadata file at `path`, trimmed, from at most its
/// first [`METADATA_READ_LIMIT`] bytes, and only when it is a regular file
/// ([`open_regular_file`]): a git directory can end up in a folder a
/// sandboxed command writes, which could put a FIFO there.
pub(crate) fn read_first_line(path: &Path) -> Option<String> {
    use std::io::Read;

    let mut head = Vec::new();
    open_regular_file(path)?
        .take(METADATA_READ_LIMIT)
        .read_to_end(&mut head)
        .ok()?;
    Some(
        String::from_utf8_lossy(&head)
            .lines()
            .next()
            .unwrap_or_default()
            .trim()
            .to_string(),
    )
}

/// The common git directory of a repository whose git directory is
/// `git_dir`: `git_dir` itself, or for a linked worktree the one its
/// `commondir` file names.
pub(crate) fn common_dir(git_dir: &Path) -> PathBuf {
    read_first_line(&git_dir.join("commondir"))
        .filter(|text| !text.is_empty())
        .map(|text| {
            let common = PathBuf::from(text);
            if common.is_absolute() {
                common
            } else {
                git_dir.join(common)
            }
        })
        .unwrap_or_else(|| git_dir.to_path_buf())
}

/// The private git directory of the linked worktree checked out at
/// `checkout`, found from the repository's side: each entry under
/// `<common>/worktrees` records the `.git` file of its checkout. The
/// checkout's own `.git` file is never read, since a command run in the
/// checkout may have rewritten it to name a git directory it controls.
pub(crate) fn linked_git_dir(common_dir: &Path, checkout: &Path) -> Option<PathBuf> {
    let checkout = std::fs::canonicalize(checkout).unwrap_or_else(|_| checkout.to_path_buf());
    std::fs::read_dir(common_dir.join("worktrees"))
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .find(|admin| {
            read_first_line(&admin.join("gitdir"))
                .and_then(|text| PathBuf::from(text).parent().map(Path::to_path_buf))
                .is_some_and(|recorded| {
                    std::fs::canonicalize(&recorded).unwrap_or(recorded) == checkout
                })
        })
}

/// One repository directory, optionally with a private index so the user's own
/// staging area is never read or written.
pub(crate) struct Git<'a> {
    runner: &'a dyn CommandRunner,
    dir: PathBuf,
    index: Option<PathBuf>,
    envs: Vec<(&'static str, String)>,
    timeout: Duration,
    held: Option<Arc<IndexHold>>,
    user_config: bool,
}

impl<'a> Git<'a> {
    pub(crate) fn at(runner: &'a dyn CommandRunner, dir: impl Into<PathBuf>) -> Self {
        Self {
            runner,
            dir: dir.into(),
            index: None,
            envs: Vec::new(),
            timeout: GIT_TIMEOUT,
            held: None,
            user_config: false,
        }
    }

    /// Read the user's own configuration as well; see [`read_user_config`].
    pub(crate) fn with_user_config(mut self) -> Self {
        self.user_config = true;
        self
    }

    pub(crate) fn with_index(mut self, index: impl Into<PathBuf>) -> Self {
        self.index = Some(index.into());
        self
    }

    /// Keep `guard` held until each git this runs has exited, even one that
    /// outlives a dropped caller.
    pub(crate) fn holding(mut self, guard: Arc<IndexHold>) -> Self {
        self.held = Some(guard);
        self
    }

    pub(crate) fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub(crate) fn with_env(mut self, key: &'static str, value: impl Into<String>) -> Self {
        self.envs.push((key, value.into()));
        self
    }

    /// Commits this crate writes are bookkeeping, never the user's authorship,
    /// and must not fail on a machine with no `user.name` configured.
    pub(crate) fn with_identity(self, name: &str, email: &str) -> Self {
        self.with_env("GIT_AUTHOR_NAME", name)
            .with_env("GIT_AUTHOR_EMAIL", email)
            .with_env("GIT_COMMITTER_NAME", name)
            .with_env("GIT_COMMITTER_EMAIL", email)
    }

    fn command<I, S>(&self, args: I) -> std::io::Result<Command>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = configured_git_command(&self.dir)?;
        command.args(args);
        if let Some(index) = &self.index {
            command.env("GIT_INDEX_FILE", index);
        }
        for (key, value) in &self.envs {
            command.env(key, value);
        }
        if self.user_config {
            read_user_config(command.as_std_mut());
        }
        Ok(command)
    }

    pub(crate) async fn run<I, S>(&self, args: I, stdin: Option<Vec<u8>>) -> Result<Output>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        prepare_user_config().await;
        let command = self.command(args).context("invoke git")?;
        let output = match &self.held {
            Some(held) => {
                self.runner
                    .output_holding(command, stdin, Some(self.timeout), Box::new(held.clone()))
                    .await
            }
            None => self.runner.output(command, stdin, Some(self.timeout)).await,
        };
        output.context("invoke git")
    }

    /// Stdout of a command that must succeed; a failure carries git's stderr.
    pub(crate) async fn ok<I, S>(&self, args: I) -> Result<Vec<u8>>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.ok_with_input(args, None).await
    }

    pub(crate) async fn ok_with_input<I, S>(
        &self,
        args: I,
        stdin: Option<Vec<u8>>,
    ) -> Result<Vec<u8>>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let args: Vec<std::ffi::OsString> = args
            .into_iter()
            .map(|arg| arg.as_ref().to_os_string())
            .collect();
        let output = self.run(&args, stdin).await?;
        if !output.status.success() {
            let verb = args
                .iter()
                .find(|arg| !arg.to_string_lossy().starts_with('-'))
                .map(|arg| arg.to_string_lossy().into_owned())
                .unwrap_or_default();
            anyhow::bail!(
                "git {verb} failed: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            );
        }
        Ok(output.stdout)
    }

    pub(crate) async fn text<I, S>(&self, args: I) -> Result<String>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        Ok(String::from_utf8_lossy(&self.ok(args).await?)
            .trim()
            .to_string())
    }

    /// Whether a command exits zero, for questions git answers by status.
    pub(crate) async fn succeeds<I, S>(&self, args: I) -> Result<bool>
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        Ok(self.run(args, None).await?.status.success())
    }

    /// A path inside this checkout's own git directory, which for a linked
    /// worktree is that worktree's private directory, not the shared one.
    pub(crate) async fn git_path(&self, name: &str) -> Result<PathBuf> {
        let raw = PathBuf::from(self.text(["rev-parse", "--git-path", name]).await?);
        Ok(if raw.is_absolute() {
            raw
        } else {
            self.dir.join(raw)
        })
    }

    pub(crate) async fn head(&self) -> Result<Option<String>> {
        let output = self
            .run(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], None)
            .await?;
        Ok(output
            .status
            .success()
            .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .filter(|head| !head.is_empty()))
    }
}

/// Paths `git status --porcelain=v1 -z` reports, with rename sources folded in
/// so a reader sees every path the change touches.
pub(crate) fn status_paths(porcelain: &[u8]) -> Vec<String> {
    let mut paths = Vec::new();
    let mut records = porcelain.split(|byte| *byte == 0).filter(|r| !r.is_empty());
    while let Some(record) = records.next() {
        if record.len() < 4 {
            continue;
        }
        let code = &record[..2];
        paths.push(String::from_utf8_lossy(&record[3..]).into_owned());
        if code.contains(&b'R') || code.contains(&b'C') {
            if let Some(source) = records.next() {
                paths.push(String::from_utf8_lossy(source).into_owned());
            }
        }
    }
    paths
}

/// Lowercase hex of a digest.
pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
pub(crate) mod test_support {
    use std::path::Path;
    use std::process::Command;

    /// A repository with one commit, for tests that need `git` on PATH.
    pub(crate) fn init_repo(dir: &Path) {
        let run = |args: &[&str]| {
            let status = Command::new("git")
                .current_dir(dir)
                .args(args)
                .status()
                .expect("git");
            assert!(status.success(), "git {args:?}");
        };
        run(&["init", "-q", "-b", "main"]);
        run(&["config", "user.email", "test@example.invalid"]);
        run(&["config", "user.name", "Test"]);
        run(&["config", "commit.gpgsign", "false"]);
        run(&["config", "core.autocrlf", "false"]);
        std::fs::write(dir.join("README.md"), "hello\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-q", "-m", "init"]);
    }

    pub(crate) fn git(dir: &Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .current_dir(dir)
            .args(args)
            .output()
            .expect("git");
        assert!(
            output.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agiworkforce_sandbox_policy::host_path::trusted_path_entries;

    fn hardening_strings() -> Vec<String> {
        host_git_hardening()
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn hooks_are_looked_for_in_an_empty_private_directory_not_a_device_path() {
        let hardening = hardening_strings();
        assert_eq!(hardening[0], "-c");
        let dir = hardening[1]
            .strip_prefix("core.hooksPath=")
            .expect("the hooks setting comes first");
        let expected = user_config_dir().unwrap().join("no-hooks");
        assert_eq!(Path::new(dir), expected);
        assert!(std::fs::read_dir(dir).unwrap().next().is_none());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o700);
        }
    }

    #[tokio::test]
    async fn a_filesystem_monitor_the_repository_names_never_runs_for_host_git() {
        let repo = tempfile::tempdir().unwrap();
        test_support::init_repo(repo.path());
        let marker = repo.path().join("monitor-ran");
        let monitor = repo.path().join("monitor.sh");
        std::fs::write(
            &monitor,
            format!("#!/bin/sh\ntouch '{}'\n", marker.display()),
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&monitor, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        test_support::git(
            repo.path(),
            &["config", "core.fsmonitor", &monitor.display().to_string()],
        );
        std::fs::write(repo.path().join("README.md"), "changed\n").unwrap();
        #[cfg(unix)]
        {
            test_support::git(repo.path(), &["status", "--porcelain"]);
            assert!(marker.exists(), "the planted monitor runs under plain git");
            std::fs::remove_file(&marker).unwrap();
        }
        Git::at(&crate::runner::TokioCommandRunner, repo.path())
            .ok(["status", "--porcelain"])
            .await
            .unwrap();
        assert!(
            !marker.exists(),
            "core.fsmonitor ran under host git despite the hardening"
        );
        assert!(!crate::config_guard::CODE_RUNNING_KEYS.contains("fsmonitor"));
    }

    #[tokio::test]
    async fn host_git_runs_without_hooks_monitors_or_outside_configuration() {
        let command = git_command(Path::new("/tmp")).await.unwrap();
        let args: Vec<_> = command
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert_eq!(args, hardening_strings());
        assert!(args.contains(&"core.attributesFile=/dev/null".to_string()));
        assert!(args.contains(&"submodule.recurse=false".to_string()));
        let envs: std::collections::HashMap<_, _> = command
            .as_std()
            .get_envs()
            .map(|(name, value)| {
                (
                    name.to_string_lossy().into_owned(),
                    value.map(|value| value.to_string_lossy().into_owned()),
                )
            })
            .collect();
        assert_eq!(envs["GIT_CONFIG_NOSYSTEM"].as_deref(), Some("1"));
        match USER_CONFIG.get().and_then(Option::as_deref) {
            Some(file) => {
                assert!(
                    file.starts_with(user_config_dir().unwrap()),
                    "a test wrote {} outside its temporary home",
                    file.display()
                );
                assert_eq!(
                    envs["GIT_CONFIG_GLOBAL"].as_deref(),
                    file.to_str(),
                    "host git reads only the user's content settings"
                );
                let text = std::fs::read_to_string(file).unwrap();
                for line in text.lines() {
                    let key = line.trim().split(' ').next().unwrap_or_default();
                    assert!(
                        [
                            "[core]",
                            "autocrlf",
                            "eol",
                            "excludesFile",
                            "[safe]",
                            "directory"
                        ]
                        .contains(&key),
                        "{line} reached host git"
                    );
                }
            }
            None => assert_eq!(envs["GIT_CONFIG_GLOBAL"].as_deref(), Some("/dev/null")),
        }
        for name in envs.keys() {
            assert!(
                name.starts_with("GIT_") || INHERITED_ENV.contains(&name.as_str()),
                "{name} reached git"
            );
        }
        assert!(!envs.contains_key("GIT_DIR"));
    }

    #[test]
    fn host_git_outside_this_crate_puts_the_hardening_before_its_own_arguments() {
        let mut command = host_git();
        command.args(["-C", "/tmp", "status"]);
        let args: Vec<_> = command
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        let hardening = hardening_strings();
        assert_eq!(&args[..hardening.len()], hardening);
        assert_eq!(&args[hardening.len()..], ["-C", "/tmp", "status"]);
        let async_args: Vec<_> = host_git_async()
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert_eq!(async_args, hardening);
        assert!(!HOST_GIT_HARDENING_KEEPING_HOOKS
            .iter()
            .any(|arg| arg.starts_with("core.hooksPath")));
    }

    #[test]
    fn the_private_config_is_owner_only_and_never_written_through_a_symlink() {
        let home = tempfile::tempdir().unwrap();
        let dir = home.path().join(".agiworkforce/git");

        let file = write_private_config(&dir, "[core]\n\teol = \"lf\"\n").unwrap();
        assert_eq!(
            std::fs::read_to_string(&file).unwrap(),
            "[core]\n\teol = \"lf\"\n"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&file).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        std::fs::write(&file, "[filter \"x\"]\n\tclean = touch /tmp/pwned\n").unwrap();
        write_private_config(&dir, "[core]\n\teol = \"lf\"\n").unwrap();
        assert_eq!(
            std::fs::read_to_string(&file).unwrap(),
            "[core]\n\teol = \"lf\"\n",
            "content that differs is replaced"
        );

        #[cfg(unix)]
        {
            let elsewhere = tempfile::tempdir().unwrap();
            let target = elsewhere.path().join("planted.config");
            std::fs::write(&target, "planted").unwrap();
            std::fs::remove_file(&file).unwrap();
            std::os::unix::fs::symlink(&target, &file).unwrap();
            assert!(write_private_config(&dir, "[core]\n").is_err());
            assert_eq!(std::fs::read_to_string(&target).unwrap(), "planted");

            let linked_dir = home.path().join("linked-git");
            std::os::unix::fs::symlink(elsewhere.path(), &linked_dir).unwrap();
            assert!(write_private_config(&linked_dir, "[core]\n").is_err());
        }
    }

    #[test]
    fn user_settings_render_as_quoted_core_values_only() {
        assert_eq!(UserSettings::default().render(), None);
        let settings = UserSettings {
            autocrlf: Some("true".into()),
            eol: None,
            excludes_file: Some(PathBuf::from("/home/u/odd \"name\\x")),
            safe_directories: Vec::new(),
        };
        assert_eq!(
            settings.render().unwrap(),
            "[core]\n\tautocrlf = \"true\"\n\texcludesFile = \"/home/u/odd \\\"name\\\\x\"\n"
        );
        let shared = UserSettings {
            safe_directories: vec!["/srv/shared".into(), String::new(), "*".into()],
            ..UserSettings::default()
        };
        assert_eq!(
            shared.render().unwrap(),
            "[safe]\n\tdirectory = \"/srv/shared\"\n\tdirectory = \"\"\n\tdirectory = \"*\"\n",
            "every entry is kept in order, an empty one included, since it clears those before it"
        );
        let broken = UserSettings {
            excludes_file: Some(PathBuf::from("/home/u/two\nlines")),
            ..UserSettings::default()
        };
        assert_eq!(broken.render(), None);
    }

    #[tokio::test]
    async fn a_hook_planted_in_the_repository_does_not_run_for_host_git() {
        let repo = tempfile::tempdir().unwrap();
        test_support::init_repo(repo.path());
        let hooks = repo.path().join(".git/hooks");
        std::fs::create_dir_all(&hooks).unwrap();
        let marker = repo.path().join("hook-ran");
        let hook = hooks.join("reference-transaction");
        std::fs::write(&hook, format!("#!/bin/sh\ntouch '{}'\n", marker.display())).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let head = Git::at(&crate::runner::TokioCommandRunner, repo.path())
            .head()
            .await
            .unwrap()
            .unwrap();
        Git::at(&crate::runner::TokioCommandRunner, repo.path())
            .ok(["update-ref", "refs/agiworkforce/probe", head.as_str()])
            .await
            .unwrap();
        assert!(!marker.exists(), "a repository hook ran under host git");
    }

    fn plant_program(dir: &Path) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let program = dir.join(GIT_PROGRAM);
        std::fs::write(&program, "#!/bin/sh\necho planted\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        program
    }

    #[test]
    fn path_entries_a_sandboxed_command_could_write_are_left_out() {
        let base = tempfile::tempdir().unwrap();
        let workspace = base.path().join("project");
        let venv = workspace.join(".venv").join("bin");
        let system = base.path().join("system").join("bin");
        std::fs::create_dir_all(&venv).unwrap();
        std::fs::create_dir_all(&system).unwrap();
        let roots = vec![
            workspace.clone(),
            std::fs::canonicalize(&workspace).unwrap(),
        ];
        #[cfg(unix)]
        let linked = {
            let linked = base.path().join("linked-bin");
            std::os::unix::fs::symlink(&venv, &linked).unwrap();
            Some(linked)
        };
        #[cfg(not(unix))]
        let linked: Option<PathBuf> = None;
        let entries: Vec<PathBuf> = [
            venv.clone(),
            PathBuf::from("bin"),
            system.clone(),
            base.path()
                .join("system")
                .join("..")
                .join("project")
                .join(".venv")
                .join("bin"),
        ]
        .into_iter()
        .chain(linked)
        .collect();
        let path = std::env::join_paths(&entries).unwrap();

        assert_eq!(trusted_path_entries(&path, &roots), vec![system]);
    }

    #[test]
    fn git_is_found_only_where_no_sandbox_can_write() {
        let base = tempfile::tempdir().unwrap();
        let workspace = base.path().join("project");
        let roots = vec![
            workspace.clone(),
            std::fs::canonicalize(base.path()).unwrap().join("project"),
        ];
        plant_program(&workspace.join(".venv").join("bin"));
        let system = plant_program(&base.path().join("system").join("bin"));
        let path = std::env::join_paths([
            workspace.join(".venv").join("bin"),
            base.path().join("system").join("bin"),
        ])
        .unwrap();

        assert_eq!(
            find_program(&path, GIT_PROGRAM, &roots),
            Some(system.clone())
        );
        let trusted = std::env::join_paths(trusted_path_entries(&path, &roots)).unwrap();
        assert_eq!(
            find_program(&trusted, GIT_PROGRAM, &roots),
            Some(system.clone())
        );

        #[cfg(unix)]
        {
            let pointing = base.path().join("pointing").join("bin");
            std::fs::create_dir_all(&pointing).unwrap();
            std::os::unix::fs::symlink(
                workspace.join(".venv").join("bin").join(GIT_PROGRAM),
                pointing.join(GIT_PROGRAM),
            )
            .unwrap();
            let path =
                std::env::join_paths([pointing, base.path().join("system").join("bin")]).unwrap();
            assert_eq!(
                find_program(&path, GIT_PROGRAM, &roots),
                Some(system),
                "a git that resolves into the workspace is passed over"
            );
        }
    }

    #[test]
    fn no_git_on_a_trusted_path_is_an_error_never_the_bare_name() {
        let base = tempfile::tempdir().unwrap();
        let workspace = base.path().join("project");
        let roots = vec![
            workspace.clone(),
            std::fs::canonicalize(base.path()).unwrap().join("project"),
        ];
        plant_program(&workspace.join(".venv").join("bin"));
        let empty = base.path().join("empty").join("bin");
        std::fs::create_dir_all(&empty).unwrap();
        let path = std::env::join_paths([workspace.join(".venv").join("bin"), empty]).unwrap();

        let error = git_program_on(&path, &roots).expect_err("only a planted git is on the path");
        assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
        assert_eq!(error.to_string(), GIT_NOT_FOUND);
    }

    #[test]
    fn a_setting_nobody_made_has_no_user_config_value() {
        assert_eq!(user_config_value("agiworkforce.never-set-by-anyone"), None);
    }

    #[test]
    fn named_writable_and_workspace_roots_and_temporary_folders_are_untrusted() {
        let writable = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        add_sandbox_writable_roots([
            writable.path().to_path_buf(),
            PathBuf::from("relative/root"),
        ]);
        register_workspace_root(workspace.path().to_path_buf());
        let target = tempfile::tempdir().unwrap();
        let roots = untrusted_roots(&[target.path()]);

        assert!(roots.contains(&writable.path().to_path_buf()));
        assert!(roots.contains(&std::fs::canonicalize(writable.path()).unwrap()));
        assert!(roots.contains(&workspace.path().to_path_buf()));
        assert!(roots.contains(&std::fs::canonicalize(workspace.path()).unwrap()));
        assert!(
            !roots.contains(&std::env::current_dir().unwrap()),
            "the working directory is a root only when a host registers it"
        );
        assert!(roots.contains(&std::env::temp_dir()));
        assert!(roots.contains(&target.path().to_path_buf()));
        assert!(!roots.contains(&PathBuf::from("relative/root")));
        assert!(roots.iter().all(|root| root.parent().is_some()));
        #[cfg(unix)]
        {
            for shared in ["/tmp", "/private/tmp", "/var/folders"] {
                assert!(roots.contains(&PathBuf::from(shared)), "{shared}");
            }
        }
    }

    /// `path` as a git config file spells it: forward slashes and no `\\?\`
    /// prefix, since a config value reads a backslash as an escape.
    fn config_spelling(path: &Path) -> String {
        let text = path.to_string_lossy().into_owned();
        text.strip_prefix(r"\\?\")
            .unwrap_or(text.as_str())
            .replace('\\', "/")
    }

    #[test]
    fn the_users_settings_are_read_outside_any_repository_this_process_sits_in() {
        let dir = user_config_dir().unwrap();
        let parent = dir.parent().unwrap().to_path_buf();
        let query = user_config_query().unwrap();
        assert_eq!(query.get_current_dir(), Some(dir.as_path()));
        assert!(query.get_envs().any(|(name, value)| {
            name == "GIT_CEILING_DIRECTORIES" && value == Some(parent.as_os_str())
        }));

        let config = tempfile::tempdir().unwrap();
        let global = config.path().join("global");
        let included = config.path().join("included");
        std::fs::write(&included, "[user]\n\tname = poisoned\n").unwrap();
        std::fs::write(
            &global,
            format!(
                "[user]\n\tname = global\n[includeIf \"gitdir:{}/\"]\n\tpath = {}\n",
                config_spelling(&std::fs::canonicalize(&parent).unwrap()),
                config_spelling(&included)
            ),
        )
        .unwrap();
        test_support::git(&parent, &["init", "-q"]);
        let name = |ceiling: bool| {
            let mut query = user_config_query().unwrap();
            if !ceiling {
                query.env_remove("GIT_CEILING_DIRECTORIES");
            }
            query.env("GIT_CONFIG_GLOBAL", &global).args([
                "config",
                "--global",
                "--includes",
                "--get",
                "user.name",
            ]);
            host_git_output_blocking(query, GIT_TIMEOUT)
                .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        };
        let (bounded, unbounded) = (name(true), name(false));
        let _ = std::fs::remove_dir_all(parent.join(".git"));
        assert_eq!(
            unbounded.unwrap(),
            "poisoned",
            "the repository above is found without the ceiling"
        );
        assert_eq!(bounded.unwrap(), "global");
    }

    #[cfg(unix)]
    #[test]
    fn a_git_that_reads_a_fifo_is_killed_at_its_deadline() {
        let tree = tempfile::tempdir().unwrap();
        let fifo = tree.path().join(".gitmodules");
        let made = std::process::Command::new("mkfifo")
            .arg(&fifo)
            .status()
            .unwrap();
        assert!(made.success());
        let mut query = host_git();
        query.arg("config").arg("--file").arg(&fifo).arg("--list");
        let started = Instant::now();
        let error = host_git_output_blocking(query, Duration::from_millis(500))
            .expect_err("git blocks opening a FIFO nobody writes");
        assert_eq!(error.kind(), std::io::ErrorKind::TimedOut);
        assert_eq!(error.to_string(), GIT_TIMED_OUT);
        assert!(started.elapsed() < Duration::from_secs(10));
    }

    #[cfg(unix)]
    #[test]
    fn a_timed_out_command_takes_its_whole_process_group_with_it() {
        let tree = tempfile::tempdir().unwrap();
        let marker = tree.path().join("survived");
        let mut command = std::process::Command::new("/bin/sh");
        command.arg("-c").arg(format!(
            "(sleep 2; touch '{}') & sleep 30",
            marker.display()
        ));
        let error = host_git_output_blocking(command, Duration::from_millis(300)).unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::TimedOut);
        std::thread::sleep(Duration::from_secs(3));
        assert!(
            !marker.exists(),
            "a child of the timed-out command outlived it"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_pipe_held_after_git_exits_is_given_up_without_signalling_the_group() {
        let tree = tempfile::tempdir().unwrap();
        let marker = tree.path().join("survived");
        let mut command = std::process::Command::new("/bin/sh");
        command.arg("-c").arg(format!(
            "(sleep 4; touch '{}') & echo early; exit 4",
            marker.display()
        ));
        let started = Instant::now();
        let output = host_git_output_blocking(command, Duration::from_secs(30)).unwrap();
        assert!(started.elapsed() < Duration::from_secs(4));
        assert_eq!(output.status.code(), Some(4));
        assert_eq!(output.stdout, b"early\n");
        std::thread::sleep(Duration::from_secs(5));
        assert!(
            marker.exists(),
            "a process group whose leader had exited was signalled"
        );
    }

    #[cfg(unix)]
    #[test]
    fn output_larger_than_a_pipe_is_collected_whole() {
        let mut command = std::process::Command::new("/bin/sh");
        command
            .arg("-c")
            .arg("head -c 1048576 /dev/zero; head -c 1048576 /dev/zero >&2; exit 3");
        let output = host_git_output_blocking(command, GIT_TIMEOUT).unwrap();
        assert_eq!(output.stdout.len(), 1024 * 1024);
        assert_eq!(output.stderr.len(), 1024 * 1024);
        assert_eq!(output.status.code(), Some(3));
    }

    #[test]
    fn every_host_git_runs_an_absolute_git_on_the_trusted_path() {
        let roots = untrusted_roots(&[]);
        let check = |command: &std::process::Command| {
            let program = Path::new(command.get_program());
            assert!(program.is_absolute(), "{}", program.display());
            if program != Path::new(NO_GIT) {
                assert!(!inside_any(program, &roots), "{}", program.display());
            }
            let path = command
                .get_envs()
                .find(|(name, _)| *name == "PATH")
                .and_then(|(_, value)| value)
                .expect("PATH is set")
                .to_os_string();
            assert_eq!(path, host_path());
            for entry in std::env::split_paths(&path) {
                assert!(entry.is_absolute(), "{}", entry.display());
                assert!(!inside_any(&entry, &roots), "{}", entry.display());
            }
        };
        check(&host_git());
        check(host_git_async().as_std());
        check(host_git_keeping_hooks_async().as_std());
        check(&clean_host_git(&[], &[]).unwrap());
        let keeping: Vec<_> = host_git_keeping_hooks_async()
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        assert_eq!(keeping, HOST_GIT_HARDENING_KEEPING_HOOKS);
    }

    #[cfg(unix)]
    #[test]
    fn a_commondir_that_is_a_fifo_is_skipped_without_waiting() {
        let tree = tempfile::tempdir().unwrap();
        let git_dir = tree.path().join("worktrees").join("feature");
        std::fs::create_dir_all(&git_dir).unwrap();
        let made = std::process::Command::new("mkfifo")
            .arg(git_dir.join("commondir"))
            .status()
            .unwrap();
        assert!(made.success());
        let started = Instant::now();
        assert_eq!(common_dir(&git_dir), git_dir);
        assert_eq!(read_first_line(&git_dir.join("commondir")), None);
        assert!(started.elapsed() < Duration::from_secs(5));

        std::fs::remove_file(git_dir.join("commondir")).unwrap();
        let mut text = b"../..\n".to_vec();
        text.resize(text.len() + 8 * 1024 * 1024, b'x');
        std::fs::write(git_dir.join("commondir"), text).unwrap();
        assert_eq!(common_dir(&git_dir), git_dir.join("../.."));
    }

    #[test]
    fn status_paths_keep_rename_sources_and_untracked_files() {
        let porcelain = b"R  new.rs\0old.rs\0?? scratch.txt\0 M src/lib.rs\0";
        assert_eq!(
            status_paths(porcelain),
            vec!["new.rs", "old.rs", "scratch.txt", "src/lib.rs"]
        );
    }
}
