//! Repository configuration host git obeys only as the user first saw it.
//!
//! Host git runs outside the sandbox. A filter, diff driver, merge driver,
//! helper, signing program or configured hook set in the repository's own
//! configuration, or in a file it includes from the work tree, is code a
//! sandboxed command could have written. So each repository's code-running
//! settings are recorded once, as a baseline, when the host first opens it
//! and before any sandboxed command has run there, in a directory no sandbox
//! can write ([`crate::set_host_state_dir`]). Before host git runs, the
//! settings that operation would obey ([`ConfigUse`] says which) are read with
//! their origin, and any from the repository that the baseline does not hold,
//! with the same value from the same file, refuse the operation. Recording the
//! baseline again is how a user trusts what is there now.
//!
//! A host that has not trusted the folder also refuses a recorded setting
//! that lives in the work tree or in the repository's own configuration: a
//! repository a command cloned there in an earlier session would otherwise
//! bless itself the first time it is opened. A host's trust is its own
//! record, or the flag [`trust_repository_config`] keeps beside the baseline.
//!
//! A setting from any scope, the user's own global configuration included,
//! counts as the repository's when the file it lives in, or for an include
//! the file it names, is inside a folder a sandboxed command can write: the
//! work tree, the folder asked about, and every writable and workspace root
//! a host registered ([`crate::add_sandbox_writable_roots`],
//! [`crate::register_workspace_root`]).
//!
//! The guard reads the repository exactly as host git will, with the user's
//! `safe.directory` entries. A folder where git could not read the
//! repository it found, such as one another account owns, refuses rather
//! than passing for clean; only a folder holding no repository at all has
//! nothing to check.
//! An editor, pager or filesystem monitor never runs: host git names harmless
//! ones on its command line, so those keys need no check.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fmt;
use std::path::{Component, Path, PathBuf};
use std::process::Output;

use crate::git::{
    configured_git_command_blocking, host_git_output_blocking, host_state_dir, open_regular_file,
    read_user_config, untrusted_roots, write_private_file, Git, GIT_NOT_FOUND, GIT_TIMED_OUT,
    GIT_TIMEOUT,
};
use crate::runner::CommandRunner;

/// The keys whose value is a program git may run, a remote git may be sent
/// to, or a file whose settings git then reads, matched against git's
/// canonical key: section and name in lower case, a subsection as written.
/// A filter the user installed globally runs what the repository names too:
/// git-lfs its extensions and custom transfer agents, git-annex its
/// `*-command` and `*-hook` settings and per-remote programs.
pub const CODE_RUNNING_KEYS: &str = "^(filter\\..*\\.(clean|smudge|process)\
|core\\.(sshcommand|askpass|gitproxy|alternaterefscommand)\
|diff\\..*\\.(textconv|command)|diff\\.external\
|merge\\..*\\.driver|merge\\.verifysignatures\
|credential\\.(.*\\.)?helper\
|hook\\..*\\.(command|event)\
|gpg\\..*|commit\\.gpgsign|tag\\.gpgsign|push\\.gpgsign|log\\.showsignature\
|remote\\..*\\.(uploadpack|receivepack)\
|protocol\\..*|url\\..*\\.(insteadof|pushinsteadof)\
|submodule\\..*\\.update\
|lfs\\.extension\\..*\\.(clean|smudge)|lfs\\.customtransfer\\..*\\.(path|args)\
|lfs\\.(.*\\.)?standalonetransferagent\
|annex\\..*-(command|hook)|remote\\..*\\.annex-(shell|rsync-transport|.*-command)\
|include(if\\..*)?\\.path)$";

/// What an operation makes git do, and so which code-running settings it
/// would obey. Each family adds its own keys; see [`ConfigUse::obeys`].
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ConfigUse {
    /// Refreshes the index or reads work-tree content: filters. Status, diff,
    /// staging, snapshots, checkouts, `worktree add`, apply, hashing, commit,
    /// merge, rebase, stash, reset.
    pub content: bool,
    /// Produces a diff: diff drivers and text conversion.
    pub diffs: bool,
    /// Merges: merge drivers. Merge, rebase, cherry-pick, revert, pull.
    pub merges: bool,
    /// Talks to a remote: SSH command, proxy, credential helper, askpass,
    /// remote programs, URL rewrites and transports. Fetch, pull, push,
    /// clone, submodule update.
    pub network: bool,
    /// Writes a ref or the index, which runs the hooks configuration
    /// defines (`hook.<name>.command`) whatever `core.hooksPath` says.
    pub refs: bool,
    /// Makes or reads a signature: the signing program and the settings that
    /// turn signing on. Commit, tag, merge, show, log and push, which signs
    /// a push certificate when `push.gpgSign` asks and the remote accepts one.
    pub signatures: bool,
}

impl ConfigUse {
    /// Ref and object reads, which run nothing configuration names.
    pub const NONE: Self = Self {
        content: false,
        diffs: false,
        merges: false,
        network: false,
        refs: false,
        signatures: false,
    };
    /// A ref write that touches nothing else: a branch created or deleted, a
    /// ref updated.
    pub const REFS: Self = Self {
        refs: true,
        ..Self::NONE
    };
    pub const CONTENT: Self = Self {
        content: true,
        ..Self::REFS
    };
    pub const DIFF: Self = Self {
        diffs: true,
        ..Self::CONTENT
    };
    /// A commit of what is staged, which may be signed.
    pub const COMMIT: Self = Self {
        signatures: true,
        ..Self::CONTENT
    };
    /// A commit shown with its patch and, when configured, its signature.
    pub const SHOW: Self = Self {
        signatures: true,
        ..Self::DIFF
    };
    /// A history listing, which shows signatures when configured to.
    pub const LOG: Self = Self {
        signatures: true,
        ..Self::NONE
    };
    pub const MERGE: Self = Self {
        merges: true,
        signatures: true,
        ..Self::CONTENT
    };
    pub const NETWORK: Self = Self {
        network: true,
        ..Self::REFS
    };
    /// A push, which may sign a push certificate.
    pub const PUSH: Self = Self {
        signatures: true,
        ..Self::NETWORK
    };
    pub const PULL: Self = Self {
        network: true,
        ..Self::MERGE
    };

    fn any(self) -> bool {
        self != Self::NONE
    }

    /// Whether an operation of this kind obeys `key`. An include is obeyed
    /// by every operation, since the file it names could set anything.
    pub fn obeys(self, key: &str) -> bool {
        let (section, rest) = key.split_once('.').unwrap_or((key, ""));
        let name = rest.rsplit('.').next().unwrap_or_default();
        match (section, name) {
            ("include" | "includeif", _) => self.any(),
            ("filter", _) => self.content,
            ("diff", _) => self.diffs,
            ("merge", "verifysignatures") => self.signatures,
            ("merge", _) => self.merges,
            ("lfs" | "annex", _) => self.content || self.network,
            ("remote", name) if name.starts_with("annex-") => self.content || self.network,
            ("core" | "credential" | "remote" | "protocol" | "url", _) => self.network,
            ("hook", _) => self.refs,
            ("gpg", _) | ("commit" | "tag" | "push", "gpgsign") | ("log", "showsignature") => {
                self.signatures
            }
            _ => self.any(),
        }
    }
}

/// The arguments, after `git`, that list every [`CODE_RUNNING_KEYS`] setting
/// with its scope and origin as NUL-separated records.
pub const REPOSITORY_CONFIG_QUERY: [&str; 6] = [
    "config",
    "--show-scope",
    "--show-origin",
    "-z",
    "--get-regexp",
    CODE_RUNNING_KEYS,
];

/// The arguments, after `git`, that print the top of the work tree and the
/// common git directory, absolute, one per line.
const REPOSITORY_LOCATION_QUERY: [&str; 4] = [
    "rev-parse",
    "--path-format=absolute",
    "--show-toplevel",
    "--git-common-dir",
];

/// One code-running setting from a repository, as recorded and compared.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct ConfigEntry {
    /// git's canonical key, such as `filter.lfs.clean`.
    pub key: String,
    pub value: String,
    /// The file that sets it, absolute, or git's own name for an origin that
    /// is not a file.
    pub origin: String,
}

/// One setting host git refused to obey.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UntrustedSetting {
    pub key: String,
    /// The file that set it, absolute when git named a file.
    pub origin: String,
    /// Whether the baseline holds it as it is, so it was refused only for
    /// living in the work tree or the configuration of a repository whose
    /// folder the user has not trusted.
    pub recorded: bool,
}

/// The refusal: every setting that would have run, and where each lives.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UntrustedRepositoryConfig {
    pub settings: Vec<UntrustedSetting>,
}

impl UntrustedRepositoryConfig {
    /// The refusal, ending with `remedy`: what the user can do about it on
    /// the surface that shows it. [`fmt::Display`] uses the CLI's.
    pub fn message(&self, remedy: &str) -> String {
        let named: Vec<String> = self
            .settings
            .iter()
            .map(|setting| {
                let why = if setting.recorded {
                    "in the repository of a folder you have not trusted"
                } else {
                    "new or changed since this repository's git settings were last trusted"
                };
                format!("{} in {} ({why})", setting.key, setting.origin)
            })
            .collect();
        format!(
            "host git did not run because this repository's configuration sets {}. A command \
             in the sandbox could have written that file, and git runs what it names outside \
             the sandbox. {remedy}",
            named.join(", ")
        )
    }
}

/// What a CLI user can do about a refusal.
pub const CLI_REMEDY: &str = "Remove the setting, or, if you set it yourself, run /trust grant \
     to trust this folder and its git settings as they are now, and try again.";

impl fmt::Display for UntrustedRepositoryConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message(CLI_REMEDY))
    }
}

impl std::error::Error for UntrustedRepositoryConfig {}

/// One record of [`REPOSITORY_CONFIG_QUERY`] output, judged.
struct Setting {
    entry: ConfigEntry,
    /// Set by the repository: its own or a worktree's configuration, a file
    /// inside the work tree, or an include naming one there.
    from_repository: bool,
    /// The file it lives in, or for an include the file it names, is inside
    /// the work tree, or cannot be told.
    in_work_tree: bool,
    /// Set in the repository's own or a worktree's configuration file.
    local: bool,
}

/// Every setting in `stdout`, the output of [`REPOSITORY_CONFIG_QUERY`] for
/// the repository whose work tree is `top`. A relative origin is resolved
/// against `top`, where git names it from. A file is in the work tree when it
/// is below `top` or one of `roots`, the folders a sandboxed command can
/// write, whatever scope git read it in.
fn settings(stdout: &[u8], top: &Path, roots: &[PathBuf]) -> Vec<Setting> {
    let roots: Vec<PathBuf> = std::iter::once(top)
        .chain(roots.iter().map(PathBuf::as_path))
        .map(normalize)
        .collect();
    let inside = |path: &Path| roots.iter().any(|root| path.starts_with(root));
    let mut fields = stdout.split(|byte| *byte == 0);
    let mut found = Vec::new();
    while let (Some(scope), Some(origin), Some(entry)) =
        (fields.next(), fields.next(), fields.next())
    {
        let scope = String::from_utf8_lossy(scope);
        let origin = String::from_utf8_lossy(origin).into_owned();
        let entry = String::from_utf8_lossy(entry);
        let (key, value) = match entry.split_once('\n') {
            Some((key, value)) => (key.to_string(), Some(value.to_string())),
            None => (entry.to_string(), None),
        };
        if key.is_empty() || switches_signing_off(&key, value.as_deref()) {
            continue;
        }
        let local = matches!(scope.as_ref(), "local" | "worktree");
        let origin_file = origin
            .strip_prefix("file:")
            .map(|file| normalize(&top.join(file)));
        let (from_repository, in_work_tree) = if key.starts_with("include") {
            let named = value
                .as_deref()
                .zip(origin_file.as_deref())
                .map(|(target, file)| included_file(target, file));
            let in_tree = named.as_deref().is_none_or(inside);
            (in_tree, in_tree)
        } else {
            let in_tree = origin_file.as_deref().is_some_and(inside);
            (local || in_tree, in_tree)
        };
        found.push(Setting {
            entry: ConfigEntry {
                key,
                value: value.unwrap_or_default(),
                origin: origin_file
                    .map(|file| file.to_string_lossy().into_owned())
                    .unwrap_or(origin),
            },
            from_repository,
            in_work_tree,
            local,
        });
    }
    found
}

/// The settings in `stdout` that an operation of kind `uses` would obey and
/// must not: any from the repository that `baseline` does not hold exactly,
/// and, unless the folder is `trusted`, any in the work tree or in the
/// repository's own configuration even when it does. See [`settings`] for
/// `top` and `roots`.
pub fn untrusted_settings(
    stdout: &[u8],
    top: &Path,
    roots: &[PathBuf],
    uses: ConfigUse,
    baseline: &BTreeSet<ConfigEntry>,
    trusted: bool,
) -> Vec<UntrustedSetting> {
    settings(stdout, top, roots)
        .into_iter()
        .filter(|setting| setting.from_repository && uses.obeys(&setting.entry.key))
        .filter_map(|setting| {
            let recorded = baseline.contains(&setting.entry);
            if recorded && (trusted || !(setting.in_work_tree || setting.local)) {
                return None;
            }
            Some(UntrustedSetting {
                key: setting.entry.key,
                origin: setting.entry.origin,
                recorded,
            })
        })
        .collect()
}

/// A setting that only turns signing off, which runs nothing: test
/// repositories and CI checkouts set `commit.gpgsign=false` routinely.
fn switches_signing_off(key: &str, value: Option<&str>) -> bool {
    matches!(
        key,
        "commit.gpgsign"
            | "tag.gpgsign"
            | "push.gpgsign"
            | "log.showsignature"
            | "merge.verifysignatures"
    ) && value.is_some_and(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "false" | "no" | "off" | "0"
        )
    })
}

/// The file an include names, as git resolves it: `~/` from the home, and a
/// relative path from the folder of the file that holds the include.
fn included_file(target: &str, including: &Path) -> PathBuf {
    let target = target.trim();
    let resolved = match target.strip_prefix("~/") {
        Some(rest) => std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_default()
            .join(rest),
        None => PathBuf::from(target),
    };
    if resolved.is_absolute() {
        normalize(&resolved)
    } else {
        normalize(
            &including
                .parent()
                .unwrap_or_else(|| Path::new("/"))
                .join(resolved),
        )
    }
}

/// Where a repository lives, from [`REPOSITORY_LOCATION_QUERY`]: the top of
/// its work tree, or the folder asked about when git named none, and its
/// common git directory, or `None` when git did not read one there, with
/// what git said instead.
struct Location {
    top: PathBuf,
    common_dir: Option<PathBuf>,
    unread: String,
}

/// What git says, in the C locale this crate runs it in, when no folder
/// from the one asked about upwards holds a repository.
const NO_REPOSITORY: &str = "not a git repository";

impl Location {
    fn read(output: &Output, dir: &Path) -> Self {
        let text = String::from_utf8_lossy(&output.stdout);
        let mut lines = text.lines().map(str::trim).filter(|line| !line.is_empty());
        match (output.status.success(), lines.next(), lines.next()) {
            (true, Some(top), Some(common)) => Self {
                top: PathBuf::from(top),
                common_dir: Some(normalize(Path::new(common))),
                unread: String::new(),
            },
            _ => Self {
                top: dir.to_path_buf(),
                common_dir: None,
                unread: String::from_utf8_lossy(&output.stderr).trim().to_string(),
            },
        }
    }

    /// Git found no repository at all, as opposed to one it would not or
    /// could not read: a bare one, one another account owns, or one whose
    /// configuration does not parse.
    fn holds_no_repository(&self) -> bool {
        self.common_dir.is_none() && self.unread.contains(NO_REPOSITORY)
    }
}

/// The file the baseline of the repository whose common git directory is
/// `common_dir` is kept in, named by a hash of that directory.
fn baseline_file(common_dir: &Path) -> Option<(PathBuf, String)> {
    let digest = Sha256::digest(common_dir.as_os_str().as_encoded_bytes());
    Some((
        host_state_dir()?.join("config-baselines"),
        format!("{}.json", crate::git::hex(&digest)),
    ))
}

#[derive(Serialize, Deserialize)]
struct Recorded {
    repository: PathBuf,
    entries: BTreeSet<ConfigEntry>,
    /// The user trusted these settings as recorded, through
    /// [`trust_repository_config`].
    #[serde(default)]
    trusted: bool,
}

/// The recorded baseline of a repository, or `None` when there is none or
/// it cannot be read, which a check treats as empty and untrusted.
fn load_baseline(common_dir: &Path) -> Option<Recorded> {
    let (dir, name) = baseline_file(common_dir)?;
    let path = dir.join(name);
    if !std::fs::symlink_metadata(&path).is_ok_and(|meta| meta.is_file()) {
        return None;
    }
    let recorded: Recorded = serde_json::from_slice(&std::fs::read(&path).ok()?).ok()?;
    (recorded.repository == common_dir).then_some(recorded)
}

/// The folders whose files' settings count as the repository's, for the one
/// at `location` asked about from the folders in `asked`.
fn writable_roots(location: &Location, asked: &[&Path]) -> Vec<PathBuf> {
    let mut named = vec![location.top.as_path()];
    named.extend_from_slice(asked);
    untrusted_roots(&named)
}

/// The settings `config` lists that the repository at `location` sets: what
/// a baseline of it holds.
fn repository_entries(
    location: &Location,
    config: &Output,
    asked: &[&Path],
) -> Result<BTreeSet<ConfigEntry>> {
    match config.status.code() {
        Some(0) => Ok(settings(
            &config.stdout,
            &location.top,
            &writable_roots(location, asked),
        )
        .into_iter()
        .filter(|setting| setting.from_repository)
        .map(|setting| setting.entry)
        .collect()),
        Some(1) => Ok(BTreeSet::new()),
        _ => anyhow::bail!(
            "the repository's git settings could not be read, so they were not recorded: {}",
            String::from_utf8_lossy(&config.stderr).trim()
        ),
    }
}

/// Record what `config` lists as the baseline of the repository at
/// `location`, asked about from `asked`, marked `trusted` or not, or with
/// `keep_existing`, only when it has none yet. A folder with no repository
/// at all has nothing to record; one where git could not read the
/// repository it found is an error.
fn record(
    location: &Location,
    config: &Output,
    asked: &[&Path],
    keep_existing: bool,
    trusted: bool,
) -> Result<Vec<ConfigEntry>> {
    let Some(common_dir) = location.common_dir.as_deref() else {
        if location.holds_no_repository() {
            return Ok(Vec::new());
        }
        anyhow::bail!(
            "the repository's git settings could not be read, so they were not recorded: {}",
            location.unread
        );
    };
    if keep_existing {
        if let Some(recorded) = load_baseline(common_dir) {
            return Ok(recorded.entries.into_iter().collect());
        }
    }
    let entries = repository_entries(location, config, asked)?;
    let (dir, name) = baseline_file(common_dir)
        .context("no protected directory is set to record this repository's git settings in")?;
    let text = serde_json::to_string_pretty(&Recorded {
        repository: common_dir.to_path_buf(),
        entries: entries.clone(),
        trusted,
    })?;
    write_private_file(&dir, &name, &text)
        .with_context(|| format!("record this repository's git settings in {}", dir.display()))?;
    Ok(entries.into_iter().collect())
}

/// Decide on a finished query: `Ok` when git found none of the keys or the
/// repository sets none it must not obey, or found no repository at all. A
/// query git could not answer refuses, since what it would have shown is
/// unknown, and so does a folder where git could not read the repository it
/// found: its query read nothing of a repository host git may still run in.
/// `asked` are the folders the check was made from, which a sandboxed
/// command can write. `trusted` is the host's trust in the folder; trust
/// recorded with the baseline counts as well.
fn judge(
    location: &Location,
    config: &Output,
    asked: &[&Path],
    uses: ConfigUse,
    trusted: bool,
) -> Result<()> {
    let Some(common_dir) = location.common_dir.as_deref() else {
        if location.holds_no_repository() {
            return Ok(());
        }
        anyhow::bail!(
            "host git did not run because the repository at {} could not be read: {}",
            location.top.display(),
            location.unread
        );
    };
    match config.status.code() {
        Some(0) => {
            let (baseline, recorded_trust) = load_baseline(common_dir)
                .map(|recorded| (recorded.entries, recorded.trusted))
                .unwrap_or_default();
            let settings = untrusted_settings(
                &config.stdout,
                &location.top,
                &writable_roots(location, asked),
                uses,
                &baseline,
                trusted || recorded_trust,
            );
            if settings.is_empty() {
                Ok(())
            } else {
                Err(UntrustedRepositoryConfig { settings }.into())
            }
        }
        Some(1) => Ok(()),
        _ => anyhow::bail!(
            "host git did not run because the repository's configuration could not be read: {}",
            String::from_utf8_lossy(&config.stderr).trim()
        ),
    }
}

/// Where the repository `runner`'s git works in at `dir` lives, and its
/// code-running settings, the user's own configuration included.
async fn read_repository(runner: &dyn CommandRunner, dir: &Path) -> Result<(Location, Output)> {
    let located = Git::at(runner, dir)
        .run(REPOSITORY_LOCATION_QUERY, None)
        .await?;
    let config = Git::at(runner, dir)
        .with_user_config()
        .run(REPOSITORY_CONFIG_QUERY, None)
        .await?;
    Ok((Location::read(&located, dir), config))
}

/// Host git's answer to `command` within [`GIT_TIMEOUT`]. Running out of
/// time refuses: a FIFO or device in the work tree, which git reads as it
/// answers, would otherwise hang the host. `what` names the query for any
/// other failure.
fn run_blocking(command: std::process::Command, what: &str) -> Result<Output> {
    host_git_output_blocking(command, GIT_TIMEOUT).map_err(|error| {
        if error.kind() == std::io::ErrorKind::TimedOut {
            anyhow::anyhow!("host git did not run because {GIT_TIMED_OUT}")
        } else {
            anyhow::Error::new(error).context(format!("invoke git to {what}"))
        }
    })
}

/// [`read_repository`] for a synchronous caller.
fn read_repository_blocking(dir: &Path) -> Result<(Location, Output)> {
    crate::git::prepare_user_config_blocking();
    let mut located = configured_git_command_blocking(dir)?;
    located.args(REPOSITORY_LOCATION_QUERY);
    let located = run_blocking(located, "find the repository")?;
    let mut config = configured_git_command_blocking(dir)?;
    read_user_config(&mut config);
    config.args(REPOSITORY_CONFIG_QUERY);
    let config = run_blocking(config, "read the repository's settings")?;
    Ok((Location::read(&located, dir), config))
}

/// Refuse when the repository `runner`'s git works in at `dir` sets anything
/// [`untrusted_settings`] names for `uses`, a recorded setting in the work
/// tree included unless the runner trusts the folder. `work_tree` is the
/// checkout a sandboxed command can write.
pub(crate) async fn verify_repository_config(
    runner: &dyn CommandRunner,
    dir: &Path,
    work_tree: &Path,
    uses: ConfigUse,
) -> Result<()> {
    if !uses.any() {
        return Ok(());
    }
    let (location, config) = read_repository(runner, dir).await?;
    judge(
        &location,
        &config,
        &[dir, work_tree],
        uses,
        runner.trusts_repository_config(),
    )
}

/// [`verify_repository_config`] for a host's own use before it runs git on
/// `workspace` itself, such as a typed git tool.
pub async fn check_repository_config(
    runner: &dyn CommandRunner,
    workspace: &crate::checkpoint::Workspace,
    uses: ConfigUse,
) -> Result<()> {
    let pinned = workspace.runner(runner);
    verify_repository_config(&pinned, workspace.top(), workspace.top(), uses).await
}

/// [`verify_repository_config`] on the repository found from `dir`, the
/// folder a sandboxed command can write, for a host's own git there.
pub async fn check_repository_config_at(
    runner: &dyn CommandRunner,
    dir: &Path,
    uses: ConfigUse,
) -> Result<()> {
    verify_repository_config(runner, dir, dir, uses).await
}

/// [`check_repository_config_at`] for a host's own synchronous git outside
/// this crate, such as a discard or a status read. `trusted` is the host's
/// trust in the folder, as [`CommandRunner::trusts_repository_config`].
pub fn check_repository_config_blocking(dir: &Path, uses: ConfigUse, trusted: bool) -> Result<()> {
    if !uses.any() {
        return Ok(());
    }
    let (location, config) = read_repository_blocking(dir)?;
    judge(&location, &config, &[dir], uses, trusted)
}

/// Record the code-running settings of `workspace`'s repository as they are
/// now, replacing any baseline it had, and return them. A host calls this
/// when the user trusts the repository's settings.
pub async fn record_baseline(
    runner: &dyn CommandRunner,
    workspace: &crate::checkpoint::Workspace,
) -> Result<Vec<ConfigEntry>> {
    let (location, config) = read_repository(&workspace.runner(runner), workspace.top()).await?;
    record(&location, &config, &[workspace.top()], false, false)
}

/// [`record_baseline`], kept with a flag saying the user trusts these
/// settings, for a host with no trust record of its own: every later check
/// treats the folder as trusted while the settings stay as recorded, and one
/// added or changed is still refused until the user trusts again.
pub async fn trust_repository_config(
    runner: &dyn CommandRunner,
    workspace: &crate::checkpoint::Workspace,
) -> Result<Vec<ConfigEntry>> {
    let (location, config) = read_repository(&workspace.runner(runner), workspace.top()).await?;
    record(&location, &config, &[workspace.top()], false, true)
}

/// The settings [`trust_repository_config`] would record for `workspace` as
/// they are now, recording nothing: what a host shows the user before it
/// asks whether to trust them.
pub async fn repository_config_to_trust(
    runner: &dyn CommandRunner,
    workspace: &crate::checkpoint::Workspace,
) -> Result<Vec<ConfigEntry>> {
    let (location, config) = read_repository(&workspace.runner(runner), workspace.top()).await?;
    if location.common_dir.is_none() {
        if location.holds_no_repository() {
            return Ok(Vec::new());
        }
        anyhow::bail!(
            "the repository's git settings could not be read: {}",
            location.unread
        );
    }
    Ok(repository_entries(&location, &config, &[workspace.top()])?
        .into_iter()
        .collect())
}

/// What [`trust_repository_config_as_shown`] says when the settings are no
/// longer the ones the user was asked about.
pub const CHANGED_WHILE_DECIDING: &str = "the repository's git settings changed while you were \
     deciding, so none was trusted. Look at them again and retry.";

/// [`trust_repository_config`] only while the settings are still exactly
/// `shown`, the ones the user was asked about. They are read once and what
/// is recorded is what was read, so a setting added or changed while the
/// user decided is not trusted by an answer that never saw it.
pub async fn trust_repository_config_as_shown(
    runner: &dyn CommandRunner,
    workspace: &crate::checkpoint::Workspace,
    shown: &[ConfigEntry],
) -> Result<Vec<ConfigEntry>> {
    let (location, config) = read_repository(&workspace.runner(runner), workspace.top()).await?;
    if location.common_dir.is_some() {
        let now = repository_entries(&location, &config, &[workspace.top()])?;
        if now != shown.iter().cloned().collect::<BTreeSet<_>>() {
            anyhow::bail!(CHANGED_WHILE_DECIDING);
        }
    }
    record(&location, &config, &[workspace.top()], false, true)
}

/// [`record_baseline`] only when `workspace`'s repository has none yet. A
/// host calls this the first time it opens a repository, before any
/// sandboxed command runs there.
pub async fn ensure_baseline(
    runner: &dyn CommandRunner,
    workspace: &crate::checkpoint::Workspace,
) -> Result<()> {
    let (location, config) = read_repository(&workspace.runner(runner), workspace.top()).await?;
    record(&location, &config, &[workspace.top()], true, false).map(|_| ())
}

/// [`record_baseline`] for the repository found from `dir`, for a
/// synchronous caller.
pub fn record_baseline_blocking(dir: &Path) -> Result<Vec<ConfigEntry>> {
    let (location, config) = match read_repository_blocking(dir) {
        Ok(read) => read,
        Err(error) if git_is_missing(&error) => return record_no_repository(dir),
        Err(error) => return Err(error),
    };
    if location.holds_no_repository() {
        return record_no_repository(dir);
    }
    record(&location, &config, &[dir], false, false)
}

/// Whether `error` is host git not being installed, as opposed to git failing.
/// With no git there is no host git to obey a repository's settings, so the
/// folder has none to record.
fn git_is_missing(error: &anyhow::Error) -> bool {
    error.chain().any(|cause| {
        cause.downcast_ref::<std::io::Error>().is_some_and(|io| {
            io.kind() == std::io::ErrorKind::NotFound && io.to_string() == GIT_NOT_FOUND
        })
    })
}

/// Record that `dir` held no repository host git could run in when its
/// settings were asked for: an empty baseline for the repository it would
/// hold. A repository that appears there later, or git installed later, then
/// finds nothing recorded as seen, so every code-running setting it has is
/// refused until the user looks again, instead of the first host git call
/// recording whatever a sandboxed command left as the baseline.
fn record_no_repository(dir: &Path) -> Result<Vec<ConfigEntry>> {
    let common_dir = normalize(dir).join(".git");
    let Some((folder, name)) = baseline_file(&common_dir) else {
        return Ok(Vec::new());
    };
    let text = serde_json::to_string_pretty(&Recorded {
        repository: common_dir,
        entries: BTreeSet::new(),
        trusted: false,
    })?;
    write_private_file(&folder, &name, &text).with_context(|| {
        format!(
            "record that this folder holds no repository in {}",
            folder.display()
        )
    })?;
    Ok(Vec::new())
}

/// How deep [`check_submodule_git_dirs_blocking`] follows submodules of
/// submodules.
const SUBMODULE_DEPTH: usize = 8;

/// Refuse when a submodule of the repository found from `dir` has a git
/// directory outside `<common>/modules`, or a linked worktree's own
/// `modules`, where the superproject keeps the ones it made. A submodule's `.git` file is in the work tree, so a
/// sandboxed command can point it at a directory whose configuration it
/// wrote, and a commit with nothing staged or a stash runs `git status` in
/// that submodule, with every filter that configuration names, outside the
/// sandbox. Submodules of submodules are followed too. A submodule whose own
/// `.git` is a directory, as older setups keep it, is left to the sandbox,
/// which keeps it read-only.
pub fn check_submodule_git_dirs_blocking(dir: &Path) -> Result<()> {
    crate::git::prepare_user_config_blocking();
    let mut located = configured_git_command_blocking(dir)?;
    located.args(REPOSITORY_LOCATION_QUERY);
    let located = run_blocking(located, "find the repository")?;
    let location = Location::read(&located, dir);
    let Some(common_dir) = location.common_dir.as_deref() else {
        anyhow::bail!(
            "host git did not run because the repository at {} could not be read: {}",
            location.top.display(),
            location.unread
        );
    };
    let modules = normalize(&common_dir.join("modules"));
    let mut modules_query = configured_git_command_blocking(dir)?;
    modules_query.args([
        "rev-parse",
        "--path-format=absolute",
        "--git-path",
        "modules",
    ]);
    let found = run_blocking(modules_query, "find the worktree's modules")?;
    let worktree_modules = if found.status.success() {
        normalize(Path::new(String::from_utf8_lossy(&found.stdout).trim()))
    } else {
        modules.clone()
    };
    let mut pending = vec![(location.top.clone(), None::<PathBuf>, 0)];
    while let Some((top, git_dir, depth)) = pending.pop() {
        for path in submodule_paths(&top, git_dir.as_deref())? {
            let dot_git = top.join(&path).join(".git");
            let Ok(meta) = std::fs::symlink_metadata(&dot_git) else {
                continue;
            };
            if meta.is_dir() {
                continue;
            }
            let target = if meta.file_type().is_symlink() {
                normalize(&dot_git)
            } else {
                let line = gitfile_first_line(&dot_git)?;
                let named = line
                    .strip_prefix("gitdir:")
                    .map(str::trim)
                    .unwrap_or_default();
                normalize(&top.join(&path).join(named))
            };
            if named_outside(&target, &modules) && named_outside(&target, &worktree_modules) {
                anyhow::bail!(
                    "host git did not run because the submodule at {} names {} as its git \
                     directory, outside {}. A command in the sandbox could have written its \
                     .git file, and git runs what that directory's configuration names outside \
                     the sandbox. Point {} back at the submodule's directory under {}, or remove \
                     it, and try again.",
                    top.join(&path).display(),
                    target.display(),
                    modules.display(),
                    dot_git.display(),
                    modules.display()
                );
            }
            if depth < SUBMODULE_DEPTH {
                pending.push((top.join(&path), Some(target), depth + 1));
            }
        }
    }
    Ok(())
}

/// The most of a `.git` file read: git names its directory on the first
/// line, and a path is far shorter than this.
const GITFILE_READ_LIMIT: u64 = 4096;

/// The first line of the `.git` file at `path`, from at most its first
/// [`GITFILE_READ_LIMIT`] bytes. It is in the work tree, so a sandboxed
/// command can put a FIFO, a device or an endless file there instead; only a
/// regular file is read ([`crate::git::open_regular_file`]).
fn gitfile_first_line(path: &Path) -> Result<String> {
    use std::io::Read;

    let file = open_regular_file(path).ok_or_else(|| {
        anyhow::anyhow!(
            "host git did not run because {} is not a regular file",
            path.display()
        )
    })?;
    let mut head = Vec::new();
    file.take(GITFILE_READ_LIMIT)
        .read_to_end(&mut head)
        .with_context(|| format!("read {}", path.display()))?;
    Ok(String::from_utf8_lossy(&head)
        .lines()
        .next()
        .unwrap_or_default()
        .to_string())
}

/// Whether `target` is anything but a directory below `modules`.
fn named_outside(target: &Path, modules: &Path) -> bool {
    target == modules || !target.starts_with(modules)
}

/// The submodule paths of the work tree at `top`, whose git directory is
/// `git_dir` or the one git finds there: every path `.gitmodules` names and
/// every gitlink in the index. A path that would leave `top` is not one git
/// checks out, so it is skipped. `git_dir` is canonical, a `\\?\` path on
/// Windows that Git for Windows reads as no repository, so git is given its
/// plain form.
fn submodule_paths(top: &Path, git_dir: Option<&Path>) -> Result<BTreeSet<PathBuf>> {
    let run = |args: &[&str]| -> Result<Output> {
        let mut command = configured_git_command_blocking(top)?;
        if let Some(git_dir) = git_dir {
            command
                .env("GIT_DIR", dunce::simplified(git_dir))
                .env("GIT_WORK_TREE", top);
        }
        command.args(args);
        run_blocking(command, "list the repository's submodules")
    };
    let mut paths = BTreeSet::new();
    let declared = run(&[
        "config",
        "-z",
        "--file",
        ".gitmodules",
        "--get-regexp",
        "^submodule\\..*\\.path$",
    ])?;
    if declared.status.success() {
        paths.extend(
            declared
                .stdout
                .split(|byte| *byte == 0)
                .filter_map(|record| record.splitn(2, |byte| *byte == b'\n').nth(1))
                .map(|value| PathBuf::from(String::from_utf8_lossy(value).into_owned())),
        );
    }
    let staged = run(&["ls-files", "--stage", "-z"])?;
    if !staged.status.success() {
        anyhow::bail!(
            "host git did not run because the repository's index could not be read: {}",
            String::from_utf8_lossy(&staged.stderr).trim()
        );
    }
    paths.extend(
        staged
            .stdout
            .split(|byte| *byte == 0)
            .filter(|record| record.starts_with(b"160000 "))
            .filter_map(|record| record.splitn(2, |byte| *byte == b'\t').nth(1))
            .map(|path| PathBuf::from(String::from_utf8_lossy(path).into_owned())),
    );
    paths.retain(|path| {
        !path.as_os_str().is_empty()
            && path
                .components()
                .all(|component| matches!(component, Component::Normal(_)))
    });
    Ok(paths)
}

/// `path` made absolute against nothing but itself: resolved through the
/// filesystem when it exists, and with `.` and `..` folded otherwise, so a
/// file named through `..` still compares by where it is.
fn normalize(path: &Path) -> PathBuf {
    if let Ok(real) = std::fs::canonicalize(path) {
        return real;
    }
    let mut folded = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                folded.pop();
            }
            other => folded.push(other.as_os_str()),
        }
    }
    match folded
        .parent()
        .and_then(|parent| std::fs::canonicalize(parent).ok())
    {
        Some(parent) => folded
            .file_name()
            .map(|name| parent.join(name))
            .unwrap_or(folded),
        None => folded,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::checkpoint::Workspace;
    use crate::git::test_support::{git, init_repo};
    use crate::runner::{TokioCommandRunner, TrustedConfigRunner};

    fn none() -> BTreeSet<ConfigEntry> {
        BTreeSet::new()
    }

    #[test]
    fn settings_from_the_repository_or_its_work_tree_are_named_and_others_are_not() {
        let tree = tempfile::tempdir().unwrap();
        let top = tree.path();
        let output = b"local\0file:.git/config\0filter.x.clean\ntouch /tmp/x\0\
global\0file:/home/u/.gitconfig\0credential.helper\nosxkeychain\0\
global\0file:inside.cfg\0diff.y.textconv\ncat\0\
command\0command line:\0core.sshcommand\nssh\0\
worktree\0file:.git/config.worktree\0include.path\n../x.cfg\0";
        let found = untrusted_settings(output, top, &[], ConfigUse::DIFF, &none(), false);
        let keys: Vec<&str> = found.iter().map(|setting| setting.key.as_str()).collect();
        assert_eq!(keys, ["filter.x.clean", "diff.y.textconv", "include.path"]);
        assert_eq!(
            Path::new(&found[0].origin),
            normalize(&top.join(".git/config"))
        );
        let keys = |uses| -> Vec<String> {
            untrusted_settings(output, top, &[], uses, &none(), false)
                .into_iter()
                .map(|setting| setting.key)
                .collect()
        };
        assert_eq!(keys(ConfigUse::CONTENT), ["filter.x.clean", "include.path"]);
        assert_eq!(keys(ConfigUse::NETWORK), ["include.path"]);
        assert!(keys(ConfigUse::NONE).is_empty());
    }

    #[test]
    fn each_kind_of_operation_obeys_only_its_own_keys() {
        let local = |key: &str, value: &str| format!("local\0file:.git/config\0{key}\n{value}\0");
        let output = [
            local("credential.helper", "store"),
            local("credential.https://example.com.helper", "store"),
            local("core.sshcommand", "./planted.sh"),
            local("core.askpass", "./planted.sh"),
            local("core.gitproxy", "./planted.sh"),
            local("core.alternaterefscommand", "./planted.sh"),
            local("remote.origin.uploadpack", "./planted.sh"),
            local("url.ext::sh -c planted.insteadof", "https://"),
            local("protocol.ext.allow", "always"),
            local("merge.ours.driver", "./planted.sh"),
            local("diff.y.command", "./planted.sh"),
            local("filter.x.smudge", "./planted.sh"),
            local("hook.planted.command", "./planted.sh"),
            local("gpg.program", "./planted.sh"),
            local("commit.gpgsign", "true"),
            local("push.gpgsign", "if-asked"),
            local("log.showsignature", "true"),
            local("merge.verifysignatures", "true"),
            local("submodule.lib.update", "!./planted.sh"),
        ]
        .concat();
        let top = Path::new("/nowhere/repo");
        let keys = |uses| -> Vec<String> {
            untrusted_settings(output.as_bytes(), top, &[], uses, &none(), false)
                .into_iter()
                .map(|setting| setting.key)
                .collect()
        };
        assert_eq!(
            keys(ConfigUse::REFS),
            ["hook.planted.command", "submodule.lib.update"],
            "a branch created or deleted runs configured hooks"
        );
        assert_eq!(
            keys(ConfigUse::CONTENT),
            [
                "filter.x.smudge",
                "hook.planted.command",
                "submodule.lib.update"
            ]
        );
        assert_eq!(
            keys(ConfigUse::COMMIT),
            [
                "filter.x.smudge",
                "hook.planted.command",
                "gpg.program",
                "commit.gpgsign",
                "push.gpgsign",
                "log.showsignature",
                "merge.verifysignatures",
                "submodule.lib.update",
            ]
        );
        assert_eq!(
            keys(ConfigUse::LOG),
            [
                "gpg.program",
                "commit.gpgsign",
                "push.gpgsign",
                "log.showsignature",
                "merge.verifysignatures",
                "submodule.lib.update",
            ]
        );
        assert!(keys(ConfigUse::DIFF).contains(&"diff.y.command".to_string()));
        assert!(!keys(ConfigUse::DIFF).contains(&"gpg.program".to_string()));
        assert!(keys(ConfigUse::SHOW).contains(&"gpg.program".to_string()));
        assert!(keys(ConfigUse::MERGE).contains(&"merge.ours.driver".to_string()));
        assert_eq!(
            keys(ConfigUse::NETWORK),
            [
                "credential.helper",
                "credential.https://example.com.helper",
                "core.sshcommand",
                "core.askpass",
                "core.gitproxy",
                "core.alternaterefscommand",
                "remote.origin.uploadpack",
                "url.ext::sh -c planted.insteadof",
                "protocol.ext.allow",
                "hook.planted.command",
                "submodule.lib.update",
            ]
        );
        assert_eq!(
            keys(ConfigUse::PUSH),
            [
                "credential.helper",
                "credential.https://example.com.helper",
                "core.sshcommand",
                "core.askpass",
                "core.gitproxy",
                "core.alternaterefscommand",
                "remote.origin.uploadpack",
                "url.ext::sh -c planted.insteadof",
                "protocol.ext.allow",
                "hook.planted.command",
                "gpg.program",
                "commit.gpgsign",
                "push.gpgsign",
                "log.showsignature",
                "merge.verifysignatures",
                "submodule.lib.update",
            ],
            "a push to a remote that takes push certificates signs one"
        );
        assert_eq!(
            keys(ConfigUse::PULL).len(),
            18,
            "everything but the diff driver"
        );
        let off = [
            local("commit.gpgsign", "false"),
            local("push.gpgsign", "false"),
        ]
        .concat();
        assert!(
            untrusted_settings(off.as_bytes(), top, &[], ConfigUse::COMMIT, &none(), false)
                .is_empty()
        );
        assert!(
            untrusted_settings(off.as_bytes(), top, &[], ConfigUse::PUSH, &none(), false)
                .is_empty()
        );
        for key in ["core.editor", "core.pager", "core.fsmonitor"] {
            assert!(!CODE_RUNNING_KEYS.contains(key.trim_start_matches("core.")));
        }
    }

    #[test]
    fn programs_a_global_lfs_or_annex_filter_reads_from_the_repository_are_judged() {
        let local = |key: &str, value: &str| format!("local\0file:.git/config\0{key}\n{value}\0");
        let planted = [
            "lfs.extension.x.clean",
            "lfs.extension.x.smudge",
            "lfs.customtransfer.t.path",
            "lfs.customtransfer.t.args",
            "lfs.standalonetransferagent",
            "lfs.https://example.com/.standalonetransferagent",
            "annex.freezecontent-command",
            "annex.demo-store-hook",
            "remote.origin.annex-shell",
            "remote.origin.annex-rsync-transport",
            "remote.origin.annex-cost-command",
        ];
        let output: String = planted
            .iter()
            .map(|key| local(key, "./planted.sh"))
            .collect();
        let top = Path::new("/nowhere/repo");
        let keys = |uses| -> Vec<String> {
            untrusted_settings(output.as_bytes(), top, &[], uses, &none(), false)
                .into_iter()
                .map(|setting| setting.key)
                .collect()
        };
        assert_eq!(keys(ConfigUse::CONTENT), planted);
        assert_eq!(keys(ConfigUse::NETWORK), planted);
        assert!(keys(ConfigUse::REFS).is_empty());
        assert!(keys(ConfigUse::LOG).is_empty());

        let repo = tempfile::tempdir().unwrap();
        git(repo.path(), &["init", "-q"]);
        let harmless = [
            "lfs.url",
            "lfs.customtransfer.t.concurrent",
            "lfs.extension.x.priority",
            "annex.diskreserve",
            "remote.origin.annex-cost",
        ];
        for key in planted.into_iter().chain(harmless) {
            git(repo.path(), &["config", "--local", key, "./planted.sh"]);
        }
        let matched = git(
            repo.path(),
            &[
                "config",
                "--local",
                "--name-only",
                "--get-regexp",
                CODE_RUNNING_KEYS,
            ],
        );
        assert_eq!(matched.lines().collect::<Vec<_>>(), planted);
    }

    #[test]
    fn an_include_is_judged_by_the_file_it_names() {
        let tree = tempfile::tempdir().unwrap();
        let top = tree.path().join("repo");
        std::fs::create_dir_all(top.join(".git")).unwrap();
        let shared = tree.path().join("shared.cfg");
        let output = format!(
            "local\0file:.git/config\0include.path\n{}\0\
local\0file:.git/config\0includeif.gitdir:~/work/.path\n../team.cfg\0",
            shared.display()
        );
        let found = untrusted_settings(
            output.as_bytes(),
            &top,
            &[],
            ConfigUse::CONTENT,
            &none(),
            false,
        );
        let keys: Vec<&str> = found.iter().map(|setting| setting.key.as_str()).collect();
        assert_eq!(
            keys,
            ["includeif.gitdir:~/work/.path"],
            "an include outside the work tree is fine, one into it is not"
        );
    }

    #[test]
    fn a_global_setting_from_a_folder_a_sandbox_can_write_is_judged_as_the_repositorys() {
        let tree = tempfile::tempdir().unwrap();
        let top = tree.path().join("repo");
        let writable = tree.path().join("scratch");
        std::fs::create_dir_all(&top).unwrap();
        std::fs::create_dir_all(&writable).unwrap();
        let output = format!(
            "global\0file:{}\0filter.x.clean\n./planted.sh\0\
global\0file:/nowhere/home/.gitconfig\0include.path\n{}\0\
global\0file:/nowhere/home/.gitconfig\0credential.helper\nosxkeychain\0",
            writable.join("team.cfg").display(),
            writable.join("more.cfg").display(),
        );
        let keys = |roots: &[PathBuf], trusted: bool| -> Vec<String> {
            let baseline: BTreeSet<ConfigEntry> = if trusted {
                settings(output.as_bytes(), &top, roots)
                    .into_iter()
                    .map(|setting| setting.entry)
                    .collect()
            } else {
                none()
            };
            untrusted_settings(
                output.as_bytes(),
                &top,
                roots,
                ConfigUse::PULL,
                &baseline,
                trusted,
            )
            .into_iter()
            .map(|setting| setting.key)
            .collect()
        };
        assert!(
            keys(&[], false).is_empty(),
            "the user's own configuration, outside every writable folder"
        );
        assert_eq!(
            keys(std::slice::from_ref(&writable), false),
            ["filter.x.clean", "include.path"],
            "a global setting or include from a writable root is refused"
        );
        assert!(
            keys(std::slice::from_ref(&writable), true).is_empty(),
            "unless the baseline holds it and the folder is trusted"
        );
    }

    #[test]
    fn a_recorded_setting_runs_and_a_new_or_changed_one_does_not() {
        let tree = tempfile::tempdir().unwrap();
        let top = tree.path().join("repo");
        std::fs::create_dir_all(top.join(".git")).unwrap();
        let elsewhere = tree.path().join("common");
        std::fs::create_dir_all(&elsewhere).unwrap();
        let config = normalize(&top.join(".git/config"));
        let shared = normalize(&elsewhere.join("config"));
        let output = format!(
            "local\0file:.git/config\0filter.lfs.clean\ngit-lfs clean -- %f\0\
local\0file:{}\0credential.helper\nstore\0",
            shared.display()
        );
        let entry = |key: &str, value: &str, origin: &Path| ConfigEntry {
            key: key.into(),
            value: value.into(),
            origin: origin.to_string_lossy().into_owned(),
        };
        let baseline: BTreeSet<ConfigEntry> = [
            entry("filter.lfs.clean", "git-lfs clean -- %f", &config),
            entry("credential.helper", "store", &shared),
        ]
        .into();
        let refused = |baseline: &BTreeSet<ConfigEntry>, trusted| -> Vec<(String, bool)> {
            untrusted_settings(
                output.as_bytes(),
                &top,
                &[],
                ConfigUse::PULL,
                baseline,
                trusted,
            )
            .into_iter()
            .map(|setting| (setting.key, setting.recorded))
            .collect()
        };

        assert!(
            refused(&baseline, true).is_empty(),
            "a relative origin is resolved against the top, as it was recorded"
        );
        assert_eq!(
            refused(&baseline, false),
            [
                ("filter.lfs.clean".to_string(), true),
                ("credential.helper".to_string(), true)
            ],
            "an untrusted folder refuses a recorded setting in the work tree or in the \
             repository's own configuration, wherever that lives"
        );
        let changed: BTreeSet<ConfigEntry> = [
            entry("filter.lfs.clean", "./planted.sh", &config),
            entry("credential.helper", "store", &shared),
        ]
        .into();
        assert_eq!(
            refused(&changed, true),
            [("filter.lfs.clean".to_string(), false)]
        );
        assert_eq!(refused(&none(), true).len(), 2);
    }

    #[cfg(unix)]
    #[test]
    fn a_query_git_could_not_answer_refuses() {
        use std::os::unix::process::ExitStatusExt;
        let output = |code: i32, stderr: &[u8]| Output {
            status: std::process::ExitStatus::from_raw(code << 8),
            stdout: Vec::new(),
            stderr: stderr.to_vec(),
        };
        let repo = tempfile::tempdir().unwrap();
        let location = Location {
            top: repo.path().to_path_buf(),
            common_dir: Some(repo.path().join(".git")),
            unread: String::new(),
        };
        let dir = repo.path();
        let uses = ConfigUse::CONTENT;
        assert!(judge(&location, &output(1, b""), &[dir], uses, false).is_ok());
        let unreadable = output(3, b"bad config line 4");
        assert!(judge(&location, &unreadable, &[dir], uses, false).is_err());

        let unowned = Location {
            top: repo.path().to_path_buf(),
            common_dir: None,
            unread: "fatal: detected dubious ownership in repository".to_string(),
        };
        let refused = judge(&unowned, &output(1, b""), &[dir], uses, false)
            .expect_err("a repository git would not read is not clean");
        assert!(
            refused.to_string().contains("dubious ownership"),
            "{refused}"
        );
        let bare = Location {
            unread: "fatal: this operation must be run in a work tree".to_string(),
            ..unowned
        };
        assert!(judge(&bare, &output(1, b""), &[dir], uses, false).is_err());
        let nowhere = Location {
            unread: "fatal: not a git repository (or any of the parent directories): .git"
                .to_string(),
            ..bare
        };
        judge(&nowhere, &output(1, b""), &[dir], uses, false)
            .expect("a folder holding no repository has nothing host git could obey");
    }

    #[test]
    fn a_repository_git_could_not_read_is_not_recorded_as_having_no_settings() {
        let folder = tempfile::tempdir().unwrap();
        let output = Output {
            status: std::process::ExitStatus::default(),
            stdout: Vec::new(),
            stderr: Vec::new(),
        };
        let nowhere = Location {
            top: folder.path().to_path_buf(),
            common_dir: None,
            unread: "fatal: not a git repository (or any of the parent directories): .git"
                .to_string(),
        };
        assert!(record(&nowhere, &output, &[], false, false)
            .expect("a folder with no repository has nothing to record")
            .is_empty());

        let unowned = Location {
            unread: "fatal: detected dubious ownership in repository".to_string(),
            ..nowhere
        };
        let failed = record(&unowned, &output, &[], false, false)
            .expect_err("a repository git refused to read is not recorded as empty");
        assert!(failed.to_string().contains("dubious ownership"), "{failed}");
    }

    async fn workspace(dir: &Path) -> Workspace {
        Workspace::discover(&TokioCommandRunner, dir)
            .await
            .unwrap()
            .unwrap()
    }

    #[tokio::test]
    async fn a_planted_filter_refuses_the_snapshot_until_its_settings_are_trusted() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let pinned = workspace(repo.path()).await;
        ensure_baseline(&TokioCommandRunner, &pinned).await.unwrap();
        let marker = repo.path().join("filter-ran");
        git(
            repo.path(),
            &[
                "config",
                "filter.x.clean",
                &format!("touch '{}'; cat", marker.display()),
            ],
        );
        std::fs::write(repo.path().join(".gitattributes"), "*.txt filter=x\n").unwrap();
        std::fs::write(repo.path().join("a.txt"), "content\n").unwrap();
        let index = repo.path().join(".git/agiworkforce/probe.index");
        let trusted = TrustedConfigRunner(&TokioCommandRunner);

        let refused = crate::snapshot::snapshot_tree(&pinned.runner(&trusted), repo.path(), &index)
            .await
            .unwrap_err();
        let refusal = refused
            .downcast_ref::<UntrustedRepositoryConfig>()
            .expect("an untrusted-configuration refusal");
        assert_eq!(refusal.settings[0].key, "filter.x.clean");
        assert!(!refusal.settings[0].recorded);
        assert!(Path::new(&refusal.settings[0].origin).ends_with(".git/config"));
        assert!(refused.to_string().contains("/trust grant"));
        let elsewhere = refusal.message("Remove it from the repository's configuration.");
        assert!(elsewhere.contains("filter.x.clean"));
        assert!(!elsewhere.contains("/trust"));
        assert!(!marker.exists(), "a planted filter ran under host git");

        ensure_baseline(&TokioCommandRunner, &pinned).await.unwrap();
        assert!(
            crate::snapshot::snapshot_tree(&pinned.runner(&trusted), repo.path(), &index)
                .await
                .is_err(),
            "a baseline already taken is not taken again"
        );

        let recorded = record_baseline(&TokioCommandRunner, &pinned).await.unwrap();
        assert!(recorded.iter().any(|entry| entry.key == "filter.x.clean"));
        crate::snapshot::snapshot_tree(&pinned.runner(&trusted), repo.path(), &index)
            .await
            .expect("a trusted folder keeps the filters it recorded");
        assert!(
            crate::snapshot::snapshot_tree(
                &pinned.runner(&TokioCommandRunner),
                repo.path(),
                &index
            )
            .await
            .is_err(),
            "an untrusted folder still refuses a recorded filter in its work tree"
        );
    }

    #[tokio::test]
    async fn trusting_what_was_shown_records_nothing_until_then_and_refuses_a_set_that_changed() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let helper = format!(
            "store --file={}",
            repo.path().join("..").join("store").display()
        );
        git(repo.path(), &["config", "credential.helper", &helper]);
        let pinned = workspace(repo.path()).await;
        ensure_baseline(&TokioCommandRunner, &pinned).await.unwrap();

        let shown = repository_config_to_trust(&TokioCommandRunner, &pinned)
            .await
            .unwrap();
        assert!(shown.iter().any(|entry| entry.key == "credential.helper"));
        assert!(
            check_repository_config(&TokioCommandRunner, &pinned, ConfigUse::NETWORK)
                .await
                .is_err(),
            "listing the settings trusts none of them"
        );

        git(repo.path(), &["config", "core.sshCommand", "./planted.sh"]);
        let refused = trust_repository_config_as_shown(&TokioCommandRunner, &pinned, &shown)
            .await
            .expect_err("a setting added while the user decided");
        assert!(
            refused.to_string().contains("changed while you were"),
            "{refused}"
        );
        assert!(
            check_repository_config(&TokioCommandRunner, &pinned, ConfigUse::NETWORK)
                .await
                .is_err(),
            "a refused trust records nothing"
        );

        let shown = repository_config_to_trust(&TokioCommandRunner, &pinned)
            .await
            .unwrap();
        let trusted = trust_repository_config_as_shown(&TokioCommandRunner, &pinned, &shown)
            .await
            .unwrap();
        assert_eq!(trusted, shown);
        check_repository_config(&TokioCommandRunner, &pinned, ConfigUse::NETWORK)
            .await
            .expect("the settings the user was shown and trusted run");
    }

    #[tokio::test]
    async fn trusting_the_settings_is_kept_with_them_and_covers_only_what_was_recorded() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let helper = format!(
            "store --file={}",
            repo.path().join("..").join("store").display()
        );
        git(repo.path(), &["config", "credential.helper", &helper]);
        let pinned = workspace(repo.path()).await;
        ensure_baseline(&TokioCommandRunner, &pinned).await.unwrap();
        assert!(
            check_repository_config(&TokioCommandRunner, &pinned, ConfigUse::NETWORK)
                .await
                .is_err(),
            "a first baseline blesses nothing in the repository's own configuration"
        );

        let trusted = trust_repository_config(&TokioCommandRunner, &pinned)
            .await
            .unwrap();
        assert!(trusted.iter().any(|entry| entry.key == "credential.helper"));
        check_repository_config(&TokioCommandRunner, &pinned, ConfigUse::NETWORK)
            .await
            .expect("settings the user trusted run without a host trust record");
        assert!(check_repository_config_blocking(repo.path(), ConfigUse::NETWORK, false).is_ok());

        git(repo.path(), &["config", "core.sshCommand", "./planted.sh"]);
        let refused = check_repository_config(&TokioCommandRunner, &pinned, ConfigUse::NETWORK)
            .await
            .expect_err("a setting added after the trust is refused");
        assert!(refused.to_string().contains("core.sshcommand"), "{refused}");

        ensure_baseline(&TokioCommandRunner, &pinned).await.unwrap();
        record_baseline(&TokioCommandRunner, &pinned).await.unwrap();
        assert!(
            check_repository_config(&TokioCommandRunner, &pinned, ConfigUse::NETWORK)
                .await
                .is_err(),
            "recording without trusting clears the trust"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_submodule_whose_git_file_leaves_the_modules_directory_refuses() {
        let tree = tempfile::tempdir().unwrap();
        let library = tree.path().join("library");
        std::fs::create_dir(&library).unwrap();
        init_repo(&library);
        let top = tree.path().join("app");
        std::fs::create_dir(&top).unwrap();
        init_repo(&top);
        check_submodule_git_dirs_blocking(&top).expect("a repository without submodules");
        git(
            &top,
            &[
                "-c",
                "protocol.file.allow=always",
                "submodule",
                "add",
                "-q",
                library.to_str().unwrap(),
                "lib",
            ],
        );
        check_submodule_git_dirs_blocking(&top).expect("a submodule git made itself");

        let planted = top.join("planted");
        let copy = std::process::Command::new("cp")
            .arg("-R")
            .arg(top.join(".git/modules/lib"))
            .arg(&planted)
            .status()
            .unwrap();
        assert!(copy.success());
        std::fs::write(top.join("lib/.git"), "gitdir: ../planted\n").unwrap();
        let refused = check_submodule_git_dirs_blocking(&top)
            .expect_err("a .git file pointing outside the modules directory");
        assert!(refused.to_string().contains("planted"), "{refused}");

        std::fs::remove_file(top.join("lib/.git")).unwrap();
        std::fs::remove_file(top.join(".gitmodules")).unwrap();
        std::os::unix::fs::symlink(&planted, top.join("lib/.git")).unwrap();
        assert!(
            check_submodule_git_dirs_blocking(&top).is_err(),
            "a gitlink the index holds is checked without .gitmodules, through a link too"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_git_file_is_read_only_when_regular_and_only_up_to_its_first_line() {
        let tree = tempfile::tempdir().unwrap();
        let long = tree.path().join("long");
        let mut text = b"gitdir: ../modules/lib\n".to_vec();
        text.resize(text.len() + 8 * 1024 * 1024, b'x');
        std::fs::write(&long, text).unwrap();
        assert_eq!(gitfile_first_line(&long).unwrap(), "gitdir: ../modules/lib");

        let fifo = tree.path().join("fifo");
        let made = std::process::Command::new("mkfifo")
            .arg(&fifo)
            .status()
            .unwrap();
        assert!(made.success());
        let started = std::time::Instant::now();
        assert!(
            gitfile_first_line(&fifo).is_err(),
            "a FIFO is refused without waiting for a writer"
        );
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
        assert!(
            open_regular_file(&fifo).is_none(),
            "opening a FIFO directly, as after a swap, returns at once"
        );

        let zero = tree.path().join("zero");
        std::os::unix::fs::symlink("/dev/zero", &zero).unwrap();
        assert!(gitfile_first_line(&zero).is_err());
    }

    #[tokio::test]
    async fn a_configured_hook_planted_after_the_baseline_refuses_a_ref_write() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let pinned = workspace(repo.path()).await;
        ensure_baseline(&TokioCommandRunner, &pinned).await.unwrap();
        let marker = repo.path().join("hook-ran");
        git(
            repo.path(),
            &[
                "config",
                "hook.planted.command",
                &format!("touch '{}'", marker.display()),
            ],
        );
        git(
            repo.path(),
            &["config", "hook.planted.event", "reference-transaction"],
        );
        let head = git(repo.path(), &["rev-parse", "HEAD"]);
        let trusted = TrustedConfigRunner(&TokioCommandRunner);

        let refused = crate::snapshot::update_ref(
            &pinned.runner(&trusted),
            repo.path(),
            "refs/agiworkforce/probe",
            &head,
            None,
        )
        .await
        .unwrap_err();
        assert!(refused.to_string().contains("hook.planted"), "{refused}");
        assert!(!marker.exists(), "a configured hook ran under host git");
    }

    #[tokio::test]
    async fn an_include_into_the_work_tree_refuses() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        std::fs::write(repo.path().join("settings.cfg"), "[core]\n\teol = lf\n").unwrap();
        git(repo.path(), &["config", "include.path", "../settings.cfg"]);
        let pinned = workspace(repo.path()).await;

        let refused = check_repository_config(&TokioCommandRunner, &pinned, ConfigUse::CONTENT)
            .await
            .unwrap_err();
        let refusal = refused
            .downcast_ref::<UntrustedRepositoryConfig>()
            .expect("an untrusted-configuration refusal");
        assert!(refusal
            .settings
            .iter()
            .any(|setting| setting.key == "include.path"));
    }

    #[tokio::test]
    async fn a_clean_repository_proceeds() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        std::fs::write(repo.path().join("new.txt"), "fresh\n").unwrap();
        let pinned = workspace(repo.path()).await;
        check_repository_config(&TokioCommandRunner, &pinned, ConfigUse::CONTENT)
            .await
            .expect("nothing to refuse");
        let index = repo.path().join(".git/agiworkforce/probe.index");
        crate::snapshot::snapshot_tree(&pinned.runner(&TokioCommandRunner), repo.path(), &index)
            .await
            .expect("a clean repository snapshots");
    }

    #[test]
    fn the_blocking_record_and_check_agree_with_the_async_ones() {
        let repo = tempfile::tempdir().unwrap();
        init_repo(repo.path());
        let helper_store = repo.path().join("..").join("outside-store");
        git(
            repo.path(),
            &[
                "config",
                "credential.helper",
                &format!("store --file={}", helper_store.display()),
            ],
        );
        assert!(check_repository_config_blocking(repo.path(), ConfigUse::NETWORK, true).is_err());
        let recorded = record_baseline_blocking(repo.path()).unwrap();
        assert_eq!(
            recorded
                .iter()
                .map(|entry| entry.key.as_str())
                .collect::<Vec<_>>(),
            ["credential.helper"],
            "commit.gpgsign=false, which init_repo sets, runs nothing and is not recorded"
        );
        check_repository_config_blocking(repo.path(), ConfigUse::NETWORK, true)
            .expect("a recorded helper is obeyed in a trusted folder");
        assert!(
            check_repository_config_blocking(repo.path(), ConfigUse::NETWORK, false).is_err(),
            ".git/config is in the work tree of an untrusted folder"
        );
    }

    #[test]
    fn a_missing_git_is_no_repository_and_any_other_failure_is_not() {
        let missing = anyhow::Error::new(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            GIT_NOT_FOUND,
        ))
        .context("read the repository");
        assert!(git_is_missing(&missing));
        assert!(!git_is_missing(&anyhow::Error::new(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "No such file or directory"
        ))));
        assert!(!git_is_missing(&anyhow::anyhow!("host git timed out")));
    }

    #[test]
    fn a_repository_made_in_a_folder_recorded_as_holding_none_starts_with_nothing_seen() {
        let folder = tempfile::tempdir().unwrap();
        assert!(record_baseline_blocking(folder.path()).unwrap().is_empty());
        let common_dir = normalize(folder.path()).join(".git");
        let recorded = load_baseline(&common_dir).expect("an empty baseline is kept");
        assert!(recorded.entries.is_empty());
        assert!(!recorded.trusted);

        init_repo(folder.path());
        let helper_store = folder.path().join("..").join("planted-store");
        git(
            folder.path(),
            &[
                "config",
                "credential.helper",
                &format!("store --file={}", helper_store.display()),
            ],
        );
        assert!(
            check_repository_config_blocking(folder.path(), ConfigUse::NETWORK, true).is_err(),
            "a helper set after the folder was looked at is not obeyed, even in a trusted folder"
        );

        let recorded = record_baseline_blocking(folder.path()).unwrap();
        assert_eq!(recorded.len(), 1);
        check_repository_config_blocking(folder.path(), ConfigUse::NETWORK, true)
            .expect("looking again records what is there now");
    }
}
