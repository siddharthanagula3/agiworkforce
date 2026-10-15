use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

mod file_authority;
pub(crate) use file_authority::{DirectoryAuthority, WorkspaceFileAuthority};

#[derive(Clone)]
struct WorkspacePathAuthority {
    root: PathBuf,
    additional: Vec<PathBuf>,
}

tokio::task_local! {
    static WORKSPACE_PATH_AUTHORITY: WorkspacePathAuthority;
}

pub(crate) async fn scope_workspace_paths<F: std::future::Future>(
    root: Option<PathBuf>,
    additional: Vec<PathBuf>,
    future: F,
) -> F::Output {
    let root = root
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."));
    WORKSPACE_PATH_AUTHORITY
        .scope(WorkspacePathAuthority { root, additional }, future)
        .await
}

pub(crate) fn scope_workspace_paths_sync<T>(
    root: PathBuf,
    additional: Vec<PathBuf>,
    action: impl FnOnce() -> T,
) -> T {
    WORKSPACE_PATH_AUTHORITY.sync_scope(WorkspacePathAuthority { root, additional }, action)
}

pub(crate) fn validation_workspace() -> PathBuf {
    WORKSPACE_PATH_AUTHORITY
        .try_with(|authority| authority.root.clone())
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

static ADDITIONAL_WORKSPACE_ROOTS: OnceLock<RwLock<Vec<PathBuf>>> = OnceLock::new();

fn additional_roots() -> &'static RwLock<Vec<PathBuf>> {
    ADDITIONAL_WORKSPACE_ROOTS.get_or_init(|| RwLock::new(Vec::new()))
}

pub fn register_additional_workspace_root(path_str: &str) -> std::result::Result<PathBuf, String> {
    let expanded = expand_home(path_str);
    let path = PathBuf::from(expanded);
    let launch_dir = std::env::current_dir().ok();
    if let Some(refusal) = network_root_refusal(&path, launch_dir.as_deref()) {
        return Err(refusal);
    }
    let absolute = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .map_err(|e| format!("Cannot determine current directory: {e}"))?
            .join(path)
    };
    register_additional_workspace_root_path(&absolute)
}

pub(crate) fn validate_additional_workspace_root_path(
    path: &Path,
) -> std::result::Result<PathBuf, String> {
    let launch_dir = std::env::current_dir().ok();
    if let Some(refusal) = network_root_refusal(path, launch_dir.as_deref()) {
        return Err(refusal);
    }
    if !path.exists() {
        return Err(format!(
            "Additional directory does not exist: {}",
            path.display()
        ));
    }
    if !path.is_dir() {
        return Err(format!(
            "Additional workspace root must be a directory: {}",
            path.display()
        ));
    }

    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Cannot resolve additional directory: {e}"))?;
    if let Some(refusal) = network_root_refusal(&canonical, launch_dir.as_deref()) {
        return Err(refusal);
    }
    Ok(canonical)
}

pub fn register_additional_workspace_root_path(
    path: &Path,
) -> std::result::Result<PathBuf, String> {
    let canonical = validate_additional_workspace_root_path(path)?;
    {
        let mut roots = additional_roots()
            .write()
            .map_err(|_| "Additional workspace root registry is poisoned".to_string())?;
        if !roots.iter().any(|root| root == &canonical) {
            roots.push(canonical.clone());
        }
    }
    #[cfg(test)]
    record_test_root_owner(&canonical);
    Ok(canonical)
}

/// How many symlink hops to follow. Real paths resolve in one; the cap is only
/// so a link cycle cannot spin here forever.
const MAX_DENYLIST_LINK_HOPS: usize = 16;

fn network_root_refusal(path: &Path, launch_dir: Option<&Path>) -> Option<String> {
    let host = match reached_network_host(path, MAX_DENYLIST_LINK_HOPS) {
        Ok(Some(host)) => host,
        Ok(None) => return None,
        Err(reason) => return Some(reason),
    };
    let launched_there = launch_dir.is_some_and(|dir| {
        network_host(dir)
            .or_else(|| {
                dir.canonicalize()
                    .ok()
                    .and_then(|canonical| network_host(&canonical))
            })
            .is_some_and(|launch_host| launch_host == host)
    });
    (!launched_there).then(|| {
        format!(
            "{} is a network path on {host}, which cannot be added as a working directory. \
             Map the share to a drive letter on Windows, or mount it at a local path on macOS \
             and Linux, and add that path instead.",
            path.display()
        )
    })
}

fn network_host(path: &Path) -> Option<String> {
    let text = path.to_string_lossy();
    let unc = text
        .strip_prefix(r"\\?\UNC\")
        .or_else(|| text.strip_prefix(r"\\"))
        .or_else(|| cfg!(windows).then(|| text.strip_prefix("//")).flatten());
    let host = match unc {
        Some(rest) => rest.split(['\\', '/']).next()?,
        None => text.strip_prefix("/net/")?.split('/').next()?,
    }
    .to_ascii_lowercase();
    let local = matches!(host.as_str(), "" | "?" | "." | "wsl$" | "wsl.localhost");
    (!local).then_some(host)
}

fn reached_network_host(path: &Path, hops: usize) -> Result<Option<String>, String> {
    if let Some(host) = network_host(path) {
        return Ok(Some(host));
    }
    if hops == 0 {
        return Err(
            "Cannot safely resolve additional directory within the symlink limit".to_string(),
        );
    }
    let mut prefix = PathBuf::new();
    for component in path.components() {
        prefix.push(component);
        let is_link =
            std::fs::symlink_metadata(&prefix).is_ok_and(|meta| meta.file_type().is_symlink());
        let Some(target) = is_link.then(|| std::fs::read_link(&prefix).ok()).flatten() else {
            continue;
        };
        let target = if target.is_absolute() {
            target
        } else {
            prefix
                .parent()
                .unwrap_or_else(|| Path::new(""))
                .join(target)
        };
        let suffix = path
            .strip_prefix(&prefix)
            .map_err(|_| "Cannot resolve additional directory suffix".to_string())?;
        return reached_network_host(&target.join(suffix), hops - 1);
    }
    Ok(None)
}

pub fn registered_additional_workspace_roots() -> Vec<PathBuf> {
    additional_roots()
        .read()
        .map(|roots| roots.clone())
        .unwrap_or_default()
}

/// Remove roots owned by a session that is crossing into a newly reviewed
/// privacy boundary. The caller supplies canonical paths previously returned
/// by `register_additional_workspace_root*`; no filesystem content is changed.
pub fn unregister_additional_workspace_roots(paths: &[PathBuf]) {
    if let Ok(mut roots) = additional_roots().write() {
        roots.retain(|root| !paths.iter().any(|path| path == root));
    }
}

#[cfg(test)]
static TEST_ROOT_OWNERS: OnceLock<RwLock<Vec<(std::thread::ThreadId, PathBuf)>>> = OnceLock::new();

#[cfg(test)]
fn test_root_owners() -> &'static RwLock<Vec<(std::thread::ThreadId, PathBuf)>> {
    TEST_ROOT_OWNERS.get_or_init(|| RwLock::new(Vec::new()))
}

#[cfg(test)]
fn record_test_root_owner(canonical: &Path) {
    let owner = std::thread::current().id();
    if let Ok(mut owners) = test_root_owners().write() {
        if !owners
            .iter()
            .any(|(id, path)| *id == owner && path == canonical)
        {
            owners.push((owner, canonical.to_path_buf()));
        }
    }
}

/// Test-only reset. Cargo runs unit tests as parallel threads sharing this one
/// process-global registry, so clearing it wholesale deletes roots a sibling
/// test registered a moment earlier. Only the calling thread's roots are
/// dropped, which is what each caller actually means by "reset".
#[cfg(test)]
pub fn clear_additional_workspace_roots_for_tests() {
    let owner = std::thread::current().id();
    let mut owned = Vec::new();
    if let Ok(mut owners) = test_root_owners().write() {
        owners.retain(|(id, path)| {
            if *id == owner {
                owned.push(path.clone());
                false
            } else {
                true
            }
        });
    }
    unregister_additional_workspace_roots(&owned);
}

/// Directories whose contents the CLI loads as TRUSTED, always-on instructions
/// for every future session in a project.
///
/// `memory.rs::load_rules` reads `.agiworkforce/rules/*.md` into the system
/// prompt of every session, and `custom_commands.rs::default_roots` registers
/// `.agiworkforce/commands`, `.claude/commands` and `~/.agiworkforce/prompts/claude`,
/// each recursively globbed for `*.md` and offered as slash commands. None of
/// them is fenced as untrusted, because all are meant to be authored by the
/// human who owns the repository.
///
/// Nothing stopped the AGENT writing them. `validate_workspace_path` enforces
/// containment only, is this path under an allowed root, and
/// `.agiworkforce/rules/anything.md` is inside the project, so it passed. One
/// approved `write_file`, with content sourced from a poisoned web page or an
/// MCP tool result, therefore rewrote the agent's own instructions for that
/// repository permanently, for that session and every session after it.
///
/// That is a privilege escalation from "influence one turn" to "influence
/// every future turn", and it is invisible: the directory is dotfile-hidden and
/// auto-loaded, so it does not read like configuration a human is reviewing.
///
/// Reads are unaffected, the CLI must load these to work. Only agent WRITES
/// are refused. A human edits them with their own editor, which is the point.
///
/// Every entry must be a directory some loader in this crate reads as trusted
/// instructions. The match is a substring one, so a bare `.claude/commands`
/// covers the project root and the `~/.claude/commands` user root alike.
///
/// The list is the sandbox crate's, which denies a sandboxed command the same
/// folders: a file tool refusing a file under `.claude/commands` meant little while
/// `run_command` could write it.
const AGENT_INSTRUCTION_DIRS: [&str; 4] = agiworkforce_sandbox_policy::AGENT_INSTRUCTION_PATHS;

/// True when writing `path` would change a file that chooses what runs on
/// this machine: git metadata, the project's AGI and MCP configuration, or a
/// hook manager's files. The list is the sandbox crate's, so the approval gate
/// and the sandbox profile cannot disagree about it. `root` is the project;
/// without one the workspace paths are validated against stands in.
pub fn controls_what_runs(root: Option<&Path>, path: &Path) -> bool {
    let root = root
        .map(Path::to_path_buf)
        .unwrap_or_else(validation_workspace);
    agiworkforce_sandbox_policy::is_protected_project_path(&root, path)
}

/// True when `path` lands inside a directory the agent must not author.
fn is_agent_instruction_path(path: &Path) -> bool {
    // Compare with forward slashes so the check behaves the same on Windows,
    // and as a filesystem that ignores case compares names, because macOS and
    // Windows default to one: `.AGIWORKFORCE/RULES/x.md` is the very same
    // directory `memory.rs` globs, so it has to be the very same denial.
    // Lower-casing is not that comparison: APFS opens `commands` for a name
    // spelled with a long s, which the sandbox crate's fold also reads as `s`.
    let normalized =
        agiworkforce_sandbox_policy::folded(&path.to_string_lossy().replace('\\', "/"));
    let components: Vec<&str> = normalized
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    AGENT_INSTRUCTION_DIRS.iter().any(|dir| {
        let protected: Vec<&str> = dir.split('/').collect();
        components.iter().enumerate().any(|(index, component)| {
            *component == protected[0]
                && components[index..]
                    .iter()
                    .zip(&protected)
                    .all(|(actual, expected)| actual == expected)
        })
    })
}

const PROTECTED_DIRECTORIES: &[&str] = &[
    ".vscode",
    ".idea",
    ".husky",
    ".cargo",
    ".devcontainer",
    ".yarn",
    ".mvn",
];

const PROTECTED_FILES: &[&str] = &[
    ".gitconfig",
    ".gitmodules",
    ".bashrc",
    ".bash_profile",
    ".bash_login",
    ".bash_aliases",
    ".bash_logout",
    ".zshrc",
    ".zprofile",
    ".zshenv",
    ".zlogin",
    ".zlogout",
    ".profile",
    ".envrc",
    ".npmrc",
    ".yarnrc",
    ".yarnrc.yml",
    ".pnp.cjs",
    ".pnp.loader.mjs",
    ".pnpmfile.cjs",
    "bunfig.toml",
    ".bunfig.toml",
    ".bazelrc",
    ".bazelversion",
    ".bazeliskrc",
    ".pre-commit-config.yaml",
    "lefthook.yml",
    "lefthook.yaml",
    ".lefthook.yml",
    ".lefthook.yaml",
    "gradle-wrapper.properties",
    "maven-wrapper.properties",
    ".devcontainer.json",
    ".ripgreprc",
    "pyrightconfig.json",
    ".mcp.json",
    ".claude.json",
];

pub fn is_protected_path(path: &Path) -> bool {
    let cwd = validation_workspace();
    is_protected_path_with_cwd(path, &cwd)
}

pub fn is_protected_path_with_cwd(path: &Path, cwd: &Path) -> bool {
    let roots = allowed_workspace_roots(cwd);
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };
    if is_checkpoint_internal_path(&absolute) {
        return true;
    }
    let Ok(landing) = write_landing(&absolute) else {
        return true;
    };
    [absolute.clone(), landing].iter().any(|candidate| {
        let relative = roots
            .iter()
            .find_map(|root| candidate.strip_prefix(root).ok())
            .unwrap_or(candidate);
        names_protected_location(relative)
    })
}

pub(crate) fn is_checkpoint_internal_path(path: &Path) -> bool {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        validation_workspace().join(path)
    };
    [absolute.clone(), resolve_existing_prefix(&absolute)]
        .iter()
        .any(|candidate| {
            candidate.components().any(|component| {
                let std::path::Component::Normal(name) = component else {
                    return false;
                };
                checkpoint_internal_name(name)
            })
        })
}

fn checkpoint_internal_name(name: &std::ffi::OsStr) -> bool {
    let Some(name) = name.to_str() else {
        return false;
    };
    let suffix = format!(
        ".{}",
        crate::runtime::session_control::CHECKPOINT_DIR_EXTENSION
    );
    if name.to_ascii_lowercase().ends_with(&suffix) {
        return true;
    }
    let lowercase = name.to_ascii_lowercase();
    let Some(identifier) = lowercase.strip_prefix(file_authority::STAGING_PREFIX) else {
        return false;
    };
    uuid::Uuid::parse_str(identifier).is_ok_and(|identifier_uuid| {
        identifier_uuid
            .hyphenated()
            .to_string()
            .eq_ignore_ascii_case(identifier)
    })
}

pub(crate) fn checkpoint_internal_globs() -> [String; 2] {
    let insensitive = |value: &str| {
        value
            .chars()
            .map(|character| {
                if character.is_ascii_alphabetic() {
                    format!(
                        "[{}{}]",
                        character.to_ascii_lowercase(),
                        character.to_ascii_uppercase()
                    )
                } else {
                    character.to_string()
                }
            })
            .collect::<String>()
    };
    let identifier = uuid::Uuid::nil()
        .hyphenated()
        .to_string()
        .chars()
        .map(|character| if character == '-' { "-" } else { "[0-9a-fA-F]" })
        .collect::<String>();
    [
        format!(
            "{}{}",
            insensitive(file_authority::STAGING_PREFIX),
            identifier
        ),
        format!(
            "*.{}",
            insensitive(crate::runtime::session_control::CHECKPOINT_DIR_EXTENSION)
        ),
    ]
}

fn names_protected_location(path: &Path) -> bool {
    let names: Vec<String> = path
        .components()
        .filter_map(|component| match component {
            std::path::Component::Normal(name) => Some(name.to_string_lossy().to_lowercase()),
            _ => None,
        })
        .collect();
    if names
        .last()
        .is_some_and(|name| PROTECTED_FILES.contains(&name.as_str()))
    {
        return true;
    }
    names.iter().enumerate().any(|(index, name)| {
        let next = names.get(index + 1).map(String::as_str);
        match name.as_str() {
            ".claude" | ".agiworkforce" => next != Some("worktrees"),
            ".config" => next == Some("git"),
            other => {
                PROTECTED_DIRECTORIES.contains(&other)
                    || agiworkforce_protocol::permissions::PROTECTED_METADATA_PATH_NAMES
                        .contains(&other)
            }
        }
    })
}

/// Why an agent may not write `target`, named `named` by whoever asked, or
/// `None` when it may: the one refusal for a write that would land in a
/// folder loaded as trusted instructions ([`AGENT_INSTRUCTION_DIRS`]),
/// wherever the write comes from. `target` is followed through its links
/// first, and a path whose links never settle is refused as well.
pub fn instruction_folder_refusal(named: &str, target: &Path) -> Option<String> {
    match write_landing(target) {
        Ok(landing) if !is_agent_instruction_path(&landing) => None,
        Ok(_) => Some(format!(
            "Refusing to write {named}: this directory is loaded as trusted, always-on \
             instructions for every future session, so an agent write here would rewrite the \
             agent's own instructions. Edit it yourself if that is intended."
        )),
        Err(refusal) => Some(refusal),
    }
}

/// Whether reading the file a tool named `named` would read one the
/// credential-file policy covers: the one check every read path makes.
///
/// The name alone is not what is read. `notes -> .env` is an ordinary name
/// for a credential file, so the name is judged and so is where a read of it
/// lands, each as written and as a filesystem that ignores case compares it.
/// A path whose links never settle is treated as covered.
pub fn reads_a_credential_file(named: &str) -> bool {
    let path = Path::new(named);
    let cwd = validation_workspace();
    let absolute = if path.is_relative() {
        cwd.join(path)
    } else {
        path.to_path_buf()
    };
    let Ok(landing) = agiworkforce_sandbox_policy::landing_path(&absolute) else {
        return true;
    };
    let inside = agiworkforce_sandbox_policy::landing_path(&cwd)
        .ok()
        .and_then(|cwd| landing.strip_prefix(cwd).ok().map(Path::to_path_buf));
    let landed = inside.unwrap_or(landing).to_string_lossy().into_owned();
    let sensitive = [named, landed.as_str()].into_iter().any(|spelling| {
        crate::sensitive_files::is_sensitive_file(spelling)
            || crate::sensitive_files::is_sensitive_file(&agiworkforce_sandbox_policy::folded(
                spelling,
            ))
    });
    sensitive
}

/// Whether `path`, a file named below a project, is one the credential-file
/// policy covers, as written or as a filesystem that ignores case compares
/// it. This is the test the sandbox crate's reader of project-supplied files
/// ([`agiworkforce_sandbox_policy::read_file_within`]) is given, which asks
/// it about a file's own name and about the name the file leads to, so an
/// instruction file linked to `.env` is refused by the same policy
/// `read_file` applies.
pub fn names_a_credential_file(path: &Path) -> bool {
    let name = path.to_string_lossy();
    crate::sensitive_files::is_sensitive_file(&name)
        || crate::sensitive_files::is_sensitive_file(&agiworkforce_sandbox_policy::folded(&name))
}

/// Where the program `name` is on this machine, looked for only in the
/// folders of `PATH` that no sandboxed command can write, and never taken
/// from a file that resolves into one of those. A tool the CLI runs itself,
/// outside any sandbox, is found this way: a bare name is otherwise resolved
/// on the whole `PATH`, where a project's `node_modules/.bin` or `.venv/bin`
/// may come first and hold a program a sandboxed command left there.
pub fn host_program(name: &str) -> Option<PathBuf> {
    let untrusted = untrusted_program_folders();
    agiworkforce_sandbox_policy::host_path::find_program(
        &agiworkforce_sandbox_policy::host_path::host_path_within(&untrusted),
        name,
        &untrusted,
    )
}

/// Whether `program` is a file a sandboxed command could have written or
/// replaced: one that is, or resolves, inside the working directory, a
/// workspace root or a temporary folder. Such a file is never run on the
/// host to ask what it is.
pub fn program_is_untrusted(program: &Path) -> bool {
    agiworkforce_sandbox_policy::host_path::inside_any(program, &untrusted_program_folders())
}

/// The folders a sandboxed command can write: the ones the sandbox crate
/// keeps, and the session's workspace when a sandbox may be given it. A
/// session started in the home folder writes a private workspace instead, and
/// the toolchains installed under home stay trusted.
fn untrusted_program_folders() -> Vec<PathBuf> {
    let workspace = validation_workspace();
    let extra: Vec<&Path> = std::iter::once(workspace.as_path())
        .filter(|workspace| agiworkforce_sandbox_policy::is_safe_write_root(workspace))
        .collect();
    agiworkforce_sandbox_policy::host_path::untrusted_roots(&extra)
}

/// `path` with every link on it followed, as far as that can be told; a path
/// whose links loop keeps its spelling. For naming a file, never for
/// deciding whether a write is allowed: that is [`write_landing`].
fn resolve_existing_prefix(path: &Path) -> PathBuf {
    agiworkforce_sandbox_policy::landing_path(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Where a write to `path` would actually land.
///
/// The denylist matches on text, and two spellings reach an instruction
/// directory without ever containing its name: a different casing, where the
/// filesystem is case-insensitive, and a symlink somewhere inside the
/// project. A link whose target is still absent is what an attacker actually
/// commits, and it is invisible to both `exists` and `canonicalize`, while a
/// write opens it with `O_CREAT` and follows it regardless, materializing the
/// target. The sandbox crate's resolver follows every link by hand, a
/// dangling one at the end of the path or in the middle of it included, and
/// is the same one the protected-path gate and the sandbox profiles judge a
/// path by. A path whose links never settle is refused: nothing can say
/// where a write to it lands.
fn write_landing(path: &Path) -> std::result::Result<PathBuf, String> {
    agiworkforce_sandbox_policy::landing_path(path).map_err(|_| {
        format!(
            "Path goes through a loop of symbolic links: {}",
            path.display()
        )
    })
}

/// Containment check plus the agent-instruction denylist.
///
/// Use this for every tool that WRITES. `validate_workspace_path` stays as-is
/// for reads.
pub fn validate_workspace_write_path(path_str: &str) -> std::result::Result<PathBuf, String> {
    let cwd = validation_workspace();
    validate_workspace_write_path_with_cwd(path_str, &cwd)
}

pub fn validate_workspace_write_path_with_cwd(
    path_str: &str,
    cwd: &Path,
) -> std::result::Result<PathBuf, String> {
    let validated = validate_workspace_path_with_cwd(path_str, cwd)?;
    match instruction_folder_refusal(path_str, &validated) {
        Some(refusal) => Err(refusal),
        None => Ok(validated),
    }
}

pub fn validate_workspace_path(path_str: &str) -> std::result::Result<PathBuf, String> {
    let cwd = validation_workspace();
    validate_workspace_path_with_cwd(path_str, &cwd)
}

pub fn validate_workspace_path_with_cwd(
    path_str: &str,
    cwd: &Path,
) -> std::result::Result<PathBuf, String> {
    let path = Path::new(path_str);

    if path_str.contains('\0') {
        return Err("Path contains null bytes".to_string());
    }

    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    };

    if is_checkpoint_internal_path(&absolute) {
        return Err("Refusing access to private checkpoint storage or staging".to_string());
    }

    let allowed_roots = allowed_workspace_roots(cwd);

    if absolute.exists() {
        let canonical = absolute
            .canonicalize()
            .map_err(|e| format!("Cannot resolve path: {}", e))?;
        if !is_under_allowed_root(&canonical, &allowed_roots) {
            return Err(format!(
                "Path escapes project directory and additional roots: {} (resolved to {})",
                path_str,
                canonical.display()
            ));
        }
        return Ok(canonical);
    }

    // A path with nothing at it yet is judged by where a write to it would land:
    // through any dangling link, with the `..` in the unresolved tail applied.
    let landing = lexically_normalized(&write_landing(&absolute)?);

    let mut existing_parent = landing.as_path();
    while !existing_parent.exists() {
        existing_parent = existing_parent
            .parent()
            .ok_or_else(|| format!("Cannot resolve existing parent for path: {}", path_str))?;
    }

    let canonical_parent = existing_parent
        .canonicalize()
        .map_err(|e| format!("Cannot resolve parent path: {}", e))?;
    if !is_under_allowed_root(&canonical_parent, &allowed_roots)
        || !is_under_allowed_root(&landing, &allowed_roots)
    {
        return Err(format!(
            "Path escapes project directory and additional roots: {} (resolved to {})",
            path_str,
            landing.display()
        ));
    }

    // A dangling link is handed back as the file it points at. The file
    // tools open the last component without following a link, so that one
    // put there after this check is refused; the link's own name would be
    // refused with it.
    let names_a_link =
        std::fs::symlink_metadata(&absolute).is_ok_and(|found| found.file_type().is_symlink());
    Ok(if names_a_link { landing } else { absolute })
}

/// Collapse `.` and `..` textually. Applied only after the existing prefix is
/// canonical, so no component being removed can be a symlink.
fn lexically_normalized(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    normalized.push("..");
                }
            }
            other => normalized.push(other),
        }
    }
    normalized
}

fn allowed_workspace_roots(cwd: &Path) -> Vec<PathBuf> {
    let mut roots = vec![cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf())];
    if let Ok(additional) =
        WORKSPACE_PATH_AUTHORITY.try_with(|authority| authority.additional.clone())
    {
        roots.extend(additional);
    }
    roots
}

fn is_under_allowed_root(path: &Path, allowed_roots: &[PathBuf]) -> bool {
    allowed_roots.iter().any(|root| path.starts_with(root))
}

pub(crate) fn expand_home(path: &str) -> String {
    if path == "~" {
        return dirs::home_dir()
            .map(|home| home.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string());
    }
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().into_owned();
        }
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex, MutexGuard};

    /// `ADDITIONAL_WORKSPACE_ROOTS` is process-global and cargo runs tests in
    /// parallel threads, so these tests take one order within this module.
    /// Cross-module interference is handled by
    /// `clear_additional_workspace_roots_for_tests` dropping only the calling
    /// thread's roots; this mutex cannot reach `claude_parity` or `agent`.
    static ROOTS_GUARD: Mutex<()> = Mutex::new(());

    /// Recovers from a poisoned lock so one failing test does not cascade into
    /// every sibling.
    fn lock_roots() -> MutexGuard<'static, ()> {
        ROOTS_GUARD.lock().unwrap_or_else(|e| e.into_inner())
    }

    #[cfg(unix)]
    #[test]
    fn validate_workspace_path_rejects_new_file_under_symlinked_parent_outside_workspace() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let outside = tempfile::tempdir().expect("outside tempdir");
        std::os::unix::fs::symlink(outside.path(), workspace.path().join("linked"))
            .expect("create symlink");

        let result = validate_workspace_path_with_cwd("linked/new.txt", workspace.path());

        assert!(
            result.is_err(),
            "new file through symlinked parent outside workspace should be rejected"
        );
    }

    #[test]
    fn validate_workspace_path_allows_new_file_under_real_workspace_dir() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        std::fs::create_dir(workspace.path().join("real")).expect("create real dir");

        let result = validate_workspace_path_with_cwd("real/new.txt", workspace.path())
            .expect("path should be allowed");

        assert_eq!(result, workspace.path().join("real/new.txt"));
    }

    #[test]
    fn validate_workspace_path_allows_existing_file_under_workspace() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let file = workspace.path().join("existing.txt");
        std::fs::write(&file, "ok").expect("write existing file");

        let result = validate_workspace_path_with_cwd("existing.txt", workspace.path())
            .expect("path should be allowed");

        assert_eq!(
            result,
            file.canonicalize().expect("canonical existing file")
        );
    }

    #[test]
    fn validate_workspace_path_rejects_parent_traversal_outside_workspace() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let root = tempfile::tempdir().expect("root tempdir");
        let workspace = root.path().join("workspace");
        let outside = root.path().join("outside");
        std::fs::create_dir(&workspace).expect("create workspace");
        std::fs::create_dir(&outside).expect("create outside");
        let outside_file = outside.join("escape.txt");
        std::fs::write(&outside_file, "outside").expect("write outside file");

        let mut path = PathBuf::from("..");
        path.push("outside");
        path.push("escape.txt");
        let relative_escape = path.to_string_lossy().into_owned();

        let result = validate_workspace_path_with_cwd(&relative_escape, &workspace);

        assert!(
            result.is_err(),
            "parent traversal outside workspace should be rejected"
        );
    }

    /// A link whose target does not exist yet is absent to `exists` and to
    /// `canonicalize`, so the ancestor walk hands back the innocent spelling
    /// while `fs::write` follows the link and materialises the target.
    #[cfg(unix)]
    #[test]
    fn validate_workspace_path_rejects_a_dangling_link_pointing_out_of_the_workspace() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let tmp = tempfile::tempdir().expect("root tempdir");
        let root = tmp.path().canonicalize().expect("canonical root");
        let workspace = root.join("workspace");
        let outside = root.join("outside");
        std::fs::create_dir(&workspace).expect("create workspace");
        std::fs::create_dir(&outside).expect("create outside");

        let link = workspace.join("NOTES.md");
        std::os::unix::fs::symlink(outside.join("captured.txt"), &link).expect("create link");
        assert!(!link.exists(), "fixture must be a DANGLING link");

        let result = validate_workspace_path_with_cwd("NOTES.md", &workspace);

        assert!(
            result.is_err(),
            "a link out of the workspace must be refused even with nothing at its target"
        );
    }

    /// `write_file` creates the parent chain, and the kernel resolves each `..`
    /// against the directory it has just made, so a tail that climbs is a write
    /// outside the workspace rather than a failure.
    #[test]
    fn validate_workspace_path_rejects_a_new_path_whose_tail_climbs_out() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let tmp = tempfile::tempdir().expect("root tempdir");
        let root = tmp.path().canonicalize().expect("canonical root");
        let workspace = root.join("workspace");
        std::fs::create_dir(&workspace).expect("create workspace");

        let mut climbing = PathBuf::from("fresh");
        climbing.push("..");
        climbing.push("..");
        climbing.push("outside");
        climbing.push("captured.txt");

        let result = validate_workspace_path_with_cwd(&climbing.to_string_lossy(), &workspace);

        assert!(
            result.is_err(),
            "a not-yet-created path that resolves above the workspace must be refused"
        );
    }

    #[test]
    fn validate_workspace_path_allows_a_new_path_whose_tail_stays_inside() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let tmp = tempfile::tempdir().expect("workspace tempdir");
        let workspace = tmp.path().canonicalize().expect("canonical workspace");
        std::fs::create_dir(workspace.join("docs")).expect("create docs");

        let mut inside = PathBuf::from("docs");
        inside.push("..");
        inside.push("docs");
        inside.push("new.md");

        validate_workspace_path_with_cwd(&inside.to_string_lossy(), &workspace)
            .expect("a tail that stays inside the workspace is allowed");
    }

    #[test]
    fn validate_workspace_path_allows_registered_additional_root() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let outside = tempfile::tempdir().expect("outside tempdir");
        let file = outside.path().join("shared.txt");
        std::fs::write(&file, "shared").expect("write outside file");

        register_additional_workspace_root_path(outside.path()).expect("register extra root");

        let result = scope_workspace_paths_sync(
            workspace.path().to_path_buf(),
            vec![outside.path().canonicalize().expect("extra root")],
            || validate_workspace_path_with_cwd(&file.to_string_lossy(), workspace.path()),
        )
        .expect("session additional root should be allowed");

        assert_eq!(result, file.canonicalize().expect("canonical extra file"));
        clear_additional_workspace_roots_for_tests();
    }

    #[test]
    fn another_sessions_directory_grant_does_not_authorize_this_workspace() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let workspace = tempfile::tempdir().expect("workspace");
        let other_session_root = tempfile::tempdir().expect("other session root");
        let file = other_session_root.path().join("private.txt");
        std::fs::write(&file, "controlled private content").expect("private fixture");
        register_additional_workspace_root_path(other_session_root.path())
            .expect("other session grant");
        assert!(
            validate_workspace_path_with_cwd(&file.to_string_lossy(), workspace.path()).is_err()
        );
        clear_additional_workspace_roots_for_tests();
    }

    #[tokio::test]
    async fn concurrent_same_workspace_sessions_keep_independent_directory_grants() {
        let workspace = tempfile::tempdir().expect("workspace");
        let first = tempfile::tempdir().expect("first grant");
        let second = tempfile::tempdir().expect("second grant");
        let first_file = first.path().join("first.txt");
        let second_file = second.path().join("second.txt");
        std::fs::write(&first_file, "first").expect("first fixture");
        std::fs::write(&second_file, "second").expect("second fixture");
        let check = |own: PathBuf, other: PathBuf| async move {
            for _ in 0..3 {
                tokio::task::yield_now().await;
                assert!(validate_workspace_path(&own.to_string_lossy()).is_ok());
                assert!(validate_workspace_path(&other.to_string_lossy()).is_err());
            }
        };
        tokio::join!(
            scope_workspace_paths(
                Some(workspace.path().to_path_buf()),
                vec![first.path().canonicalize().expect("first root")],
                check(first_file.clone(), second_file.clone())
            ),
            scope_workspace_paths(
                Some(workspace.path().to_path_buf()),
                vec![second.path().canonicalize().expect("second root")],
                check(second_file, first_file)
            ),
        );
    }

    #[test]
    fn scoped_primary_workspace_resolves_relative_paths_without_process_cwd() {
        let workspace = tempfile::tempdir().expect("workspace");
        let file = workspace.path().join("ordinary.txt");
        std::fs::write(&file, "ordinary").expect("fixture");
        let resolved =
            scope_workspace_paths_sync(workspace.path().to_path_buf(), Vec::new(), || {
                validate_workspace_path("ordinary.txt")
            })
            .expect("scoped file");
        assert_eq!(resolved, file.canonicalize().expect("canonical fixture"));
    }

    #[test]
    fn network_paths_are_named_by_their_host() {
        for (path, host) in [
            (r"\\server\share", Some("server")),
            (r"\\FileServer\share\project", Some("fileserver")),
            (r"\\?\UNC\server\share\project", Some("server")),
            ("/net/nas/projects", Some("nas")),
            (r"\\wsl$\Ubuntu\home\me", None),
            (r"\\wsl.localhost\Ubuntu\home\me", None),
            (r"\\?\C:\work", None),
            (r"\\.\pipe\agent", None),
            ("/home/me/net/projects", None),
            ("/net", None),
            ("/network/share", None),
        ] {
            assert_eq!(network_host(Path::new(path)).as_deref(), host, "{path}");
        }
    }

    #[test]
    fn a_unc_share_is_refused_before_anything_looks_it_up() {
        let error = register_additional_workspace_root(r"\\server\share").unwrap_err();

        assert!(error.contains("network path on server"), "{error}");
    }

    #[test]
    fn an_automount_path_is_refused_unless_the_session_started_on_that_host() {
        let local = tempfile::tempdir().expect("launch dir");
        let share = Path::new("/net/nas/projects");

        assert!(register_additional_workspace_root_path(share)
            .unwrap_err()
            .contains("network path on nas"));
        assert!(network_root_refusal(share, Some(local.path())).is_some());
        assert!(network_root_refusal(share, Some(Path::new("/net/other/home"))).is_some());
        assert!(network_root_refusal(share, Some(Path::new("/net/NAS/home"))).is_none());
    }

    #[cfg(unix)]
    #[test]
    fn a_local_link_to_a_network_location_is_refused() {
        let workspace = tempfile::tempdir().expect("workspace");
        let link = workspace.path().join("share");
        std::os::unix::fs::symlink("/net/nas/projects", &link).expect("create link");

        let error = register_additional_workspace_root_path(&link).unwrap_err();

        assert!(error.contains("network path on nas"), "{error}");
    }

    #[cfg(unix)]
    #[test]
    fn network_directory_inspection_refuses_exhausted_symlink_budget() {
        let workspace = tempfile::tempdir().expect("workspace");
        let mut target = PathBuf::from("/net/nas/projects");
        for index in 0..=MAX_DENYLIST_LINK_HOPS {
            let link = workspace.path().join(format!("link-{index}"));
            std::os::unix::fs::symlink(&target, &link).expect("create link chain");
            target = link;
        }
        assert!(network_root_refusal(&target, Some(workspace.path())).is_some());
    }

    /// `ROOTS_GUARD` only serializes this module. `claude_parity` and `agent`
    /// tests also reset the registry, on their own threads, so the reset must
    /// not reach a root another running test registered.
    #[test]
    fn registered_root_survives_another_test_thread_resetting_the_registry() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let outside = tempfile::tempdir().expect("outside tempdir");
        let file = outside.path().join("shared.txt");
        std::fs::write(&file, "shared").expect("write outside file");

        register_additional_workspace_root_path(outside.path()).expect("register extra root");

        let stop = Arc::new(AtomicBool::new(false));
        let sibling = {
            let stop = Arc::clone(&stop);
            std::thread::spawn(move || {
                while !stop.load(Ordering::Relaxed) {
                    clear_additional_workspace_roots_for_tests();
                }
            })
        };

        let outcome = scope_workspace_paths_sync(
            workspace.path().to_path_buf(),
            vec![outside.path().canonicalize().expect("extra root")],
            || {
                (0..500).try_for_each(|_| {
                    validate_workspace_path_with_cwd(&file.to_string_lossy(), workspace.path())
                        .map(|_| ())
                })
            },
        );

        stop.store(true, Ordering::Relaxed);
        sibling.join().expect("sibling test thread");
        clear_additional_workspace_roots_for_tests();

        outcome.expect("registered root must survive another test thread's registry reset");
    }
}

#[cfg(test)]
mod repo_relative_tests {
    use super::*;

    #[test]
    fn four_spellings_of_one_file_collapse_to_one_key() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let root = workspace.path().canonicalize().expect("canonical root");
        std::fs::create_dir(root.join("src")).expect("create src");
        let file = root.join("src").join("main.rs");
        std::fs::write(&file, "fn main() {}").expect("write fixture");

        let expected = PathBuf::from("src").join("main.rs");
        for spelling in [
            file.clone(),
            PathBuf::from("src/main.rs"),
            PathBuf::from("./src/main.rs"),
            PathBuf::from("src/../src/main.rs"),
        ] {
            assert_eq!(
                repo_relative_to(&spelling, &root),
                expected,
                "spelling {} did not normalize",
                spelling.display()
            );
        }
    }

    /// One assertion for either filesystem: two casings of one file give one
    /// key, two distinct files stay apart.
    #[test]
    fn casing_follows_the_filesystem_the_test_is_running_on() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let root = workspace.path().canonicalize().expect("canonical root");
        std::fs::create_dir(root.join("src")).expect("create src");
        std::fs::write(root.join("src").join("Main.rs"), "fn main() {}").expect("write fixture");

        let lower = repo_relative_to(Path::new("SRC/MAIN.RS"), &root);
        let exact = repo_relative_to(Path::new("src/Main.rs"), &root);

        if filesystem_is_case_insensitive(&root) {
            assert_eq!(
                lower, exact,
                "one file reached by two casings must give one key"
            );
        } else {
            assert_ne!(
                lower, exact,
                "distinct files must not collapse onto one key"
            );
        }
    }

    /// A path that does not exist yet still has to be nameable.
    #[test]
    fn an_absent_path_is_still_relative_to_the_root() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let root = workspace.path().canonicalize().expect("canonical root");

        assert_eq!(
            repo_relative_to(Path::new("does/not/exist.rs"), &root),
            PathBuf::from("does").join("not").join("exist.rs")
        );
    }

    #[test]
    fn a_path_outside_the_root_keeps_its_absolute_form() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let outside = tempfile::tempdir().expect("outside tempdir");
        let root = workspace.path().canonicalize().expect("canonical root");
        let file = outside
            .path()
            .canonicalize()
            .expect("canonical outside")
            .join("x.txt");
        std::fs::write(&file, "x").expect("write fixture");

        assert_eq!(repo_relative_to(&file, &root), file);
    }
}

#[cfg(test)]
mod agent_instruction_denylist_tests {
    use super::*;
    use std::fs;

    #[test]
    fn instruction_directories_and_their_ancestors_are_not_writable() {
        let tmp = tempfile::tempdir().expect("tempdir");
        for target in [
            ".agiworkforce",
            ".agiworkforce/rules",
            ".agiworkforce/commands",
            ".agiworkforce/prompts",
            ".agiworkforce/prompts/claude",
            ".claude",
            ".claude/commands",
        ] {
            assert!(
                validate_workspace_write_path_with_cwd(target, tmp.path()).is_err(),
                "trusted instruction ancestor was writable: {target}"
            );
        }
        assert!(validate_workspace_write_path_with_cwd("docs/rules.md", tmp.path()).is_ok());
    }

    /// The attack this closes: one approved `write_file`, with content from a
    /// poisoned web page or MCP tool result, lands in a directory the CLI loads
    /// as trusted always-on instructions, rewriting the agent's own
    /// instructions for that repository and every session after it.
    #[test]
    fn rules_file_write_denied() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let rules = tmp.path().join(".agiworkforce").join("rules");
        fs::create_dir_all(&rules).expect("create rules dir");
        let target = rules.join("injected.md");

        let err =
            validate_workspace_write_path_with_cwd(target.to_str().expect("utf8 path"), tmp.path())
                .expect_err("writing into .agiworkforce/rules must be refused");
        assert!(err.contains("trusted"), "unexpected message: {err}");
    }

    /// macOS and Windows resolve `.AGIWORKFORCE/RULES` to the same directory
    /// `memory.rs` loads, so a denylist that only matches the lowercase
    /// spelling is a denylist with a one-keystroke bypass.
    #[test]
    fn rules_file_write_denied_under_a_different_casing() {
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(tmp.path().join(".agiworkforce").join("rules"))
            .expect("create rules dir");
        let target = tmp
            .path()
            .join(".AGIWORKFORCE")
            .join("RULES")
            .join("injected.md");

        assert!(validate_workspace_write_path_with_cwd(
            target.to_str().expect("utf8 path"),
            tmp.path()
        )
        .is_err());
    }

    /// A symlink inside the project is a spelling of the rules directory that
    /// contains none of its name. The containment check already canonicalizes
    /// to accept it; the denylist has to canonicalize to refuse it.
    #[cfg(unix)]
    #[test]
    fn rules_file_write_denied_through_a_symlinked_parent() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let rules = tmp.path().join(".agiworkforce").join("rules");
        fs::create_dir_all(&rules).expect("create rules dir");
        std::os::unix::fs::symlink(&rules, tmp.path().join("docs")).expect("create symlink");
        let target = tmp.path().join("docs").join("injected.md");

        assert!(validate_workspace_write_path_with_cwd(
            target.to_str().expect("utf8 path"),
            tmp.path()
        )
        .is_err());
    }

    /// The exploitable form of the symlink channel, and the one an attacker
    /// actually commits: the link's target does not exist yet, so `exists` and
    /// `canonicalize` both report the link as absent and the plain ancestor
    /// walk hands back the innocent spelling. `fs::write` follows it anyway.
    #[cfg(unix)]
    #[test]
    fn rules_file_write_denied_through_a_dangling_symlink() {
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(tmp.path().join(".agiworkforce").join("rules"))
            .expect("create rules dir");
        let link = tmp.path().join("NOTES.md");
        std::os::unix::fs::symlink(
            Path::new(".agiworkforce").join("rules").join("injected.md"),
            &link,
        )
        .expect("create dangling symlink");
        assert!(!link.exists(), "fixture must be a DANGLING link");

        assert!(
            validate_workspace_write_path_with_cwd(link.to_str().expect("utf8 path"), tmp.path())
                .is_err(),
            "a dangling link into the rules directory must be refused; \
             fs::write follows it and materializes the target"
        );
    }

    /// `custom_commands::default_roots` registers `<cwd>/.claude/commands`
    /// alongside `<cwd>/.agiworkforce/commands` and globs both recursively for
    /// `*.md`. Same always-on trust, same project directory, so same denial.
    #[test]
    fn claude_commands_file_write_denied() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let commands = tmp.path().join(".claude").join("commands");
        fs::create_dir_all(&commands).expect("create .claude/commands");
        let target = commands.join("evil.md");

        assert!(validate_workspace_write_path_with_cwd(
            target.to_str().expect("utf8 path"),
            tmp.path()
        )
        .is_err());
    }

    /// Symlinks are not themselves the problem, so following them must not
    /// turn into a blanket refusal of every link in a project.
    #[cfg(unix)]
    #[test]
    fn still_allows_writes_through_a_symlink_to_an_ordinary_file() {
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(tmp.path().join("docs")).expect("create docs");
        std::os::unix::fs::symlink(
            Path::new("docs").join("notes.md"),
            tmp.path().join("NOTES.md"),
        )
        .expect("create symlink");
        let target = tmp.path().join("NOTES.md");

        assert!(validate_workspace_write_path_with_cwd(
            target.to_str().expect("utf8 path"),
            tmp.path()
        )
        .is_ok());
    }

    /// The project files MCP servers are loaded from are named in the MCP
    /// module, and the files a sandbox and the approval gate protect are named
    /// in the sandbox crate. A file loaded from and not protected could be
    /// rewritten by a sandboxed command, so the first list is held inside the
    /// second.
    #[test]
    fn every_project_file_mcp_servers_load_from_is_protected() {
        for file in crate::mcp::consent::PROJECT_CONFIG_FILES {
            assert!(
                agiworkforce_sandbox_policy::PROJECT_CONFIG_PATHS.contains(&file),
                "{file} is loaded from a project and is not in the protected list"
            );
            assert!(controls_what_runs(
                Some(Path::new("/project")),
                Path::new(file)
            ));
        }
    }

    #[test]
    fn a_credential_file_is_named_as_the_filesystem_reads_the_name() {
        for name in [
            ".env",
            "apps/web/.env.local",
            ".ENV",
            ".\u{17f}sh/id_ed25519",
            "certs/\u{17f}erver.pem",
            ".aws/credentials",
        ] {
            assert!(names_a_credential_file(Path::new(name)), "{name:?}");
        }
        for name in [
            "AGENTS.md",
            ".agiworkforce/rules/style.md",
            "docs/environment.md",
        ] {
            assert!(!names_a_credential_file(Path::new(name)), "{name:?}");
        }
    }

    #[test]
    fn the_instruction_folders_are_the_ones_a_sandbox_denies() {
        assert_eq!(
            AGENT_INSTRUCTION_DIRS,
            agiworkforce_sandbox_policy::AGENT_INSTRUCTION_PATHS
        );
        assert!(AGENT_INSTRUCTION_DIRS.contains(&".claude/commands"));
    }

    #[cfg(unix)]
    #[test]
    fn a_host_program_is_never_taken_from_a_folder_a_sandbox_writes() {
        let shell = host_program("sh").expect("sh is on the host PATH");
        assert!(shell.is_absolute());
        assert!(!program_is_untrusted(&shell), "{}", shell.display());
        assert_eq!(host_program("agi-program-that-does-not-exist"), None);

        let planted = tempfile::tempdir().expect("tempdir");
        let program = planted.path().join("rg");
        fs::write(&program, "#!/bin/sh\n").expect("write program");
        assert!(
            program_is_untrusted(&program),
            "a program in a temporary folder would be run on the host"
        );
        assert!(!program_is_untrusted(Path::new("/usr/bin/git")));
    }

    /// APFS opens `commands` for a name spelled with a long s, the sharp s as
    /// `ss` and a ligature as its letters. Lower-casing leaves all three as
    /// they are, so the folder read as some other folder while it was absent.
    #[test]
    fn an_instruction_folder_spelled_as_the_filesystem_folds_it_is_refused() {
        let tmp = tempfile::tempdir().expect("tempdir");
        for spelled in [
            ".claude/command\u{17f}/x.md",
            ".CLAUDE/Command\u{17f}/x.md",
            ".agiworkforce/rule\u{17f}/x.md",
            ".agiworkforce/prompt\u{17f}/claude/x.md",
            ".agiworkforce/command\u{17f}/deep/x.md",
            ".\u{ff41}giworkforce/rules/x.md",
        ] {
            let target = tmp.path().join(spelled);
            assert!(
                validate_workspace_write_path_with_cwd(
                    target.to_str().expect("utf8 path"),
                    tmp.path()
                )
                .is_err(),
                "{spelled:?} is the instruction folder on a volume that ignores case"
            );
        }
        let ordinary = tmp.path().join("docs/command\u{17f}/x.md");
        assert!(validate_workspace_write_path_with_cwd(
            ordinary.to_str().expect("utf8 path"),
            tmp.path()
        )
        .is_ok());
    }

    /// The name a read is asked for is not the file it reads.
    #[cfg(unix)]
    #[test]
    fn a_read_through_a_link_to_a_credential_file_is_a_read_of_that_file() {
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::write(tmp.path().join(".env"), "TOKEN=EXAMPLE").expect("env file");
        fs::write(tmp.path().join("notes.txt"), "notes").expect("notes");
        std::os::unix::fs::symlink(".env", tmp.path().join("settings.txt")).expect("link");
        std::os::unix::fs::symlink(".env.later", tmp.path().join("soon.txt")).expect("dangling");
        std::os::unix::fs::symlink("b", tmp.path().join("a")).expect("a to b");
        std::os::unix::fs::symlink("a", tmp.path().join("b")).expect("b to a");
        let named = |name: &str| tmp.path().join(name).to_string_lossy().into_owned();

        for covered in [
            ".env",
            "settings.txt",
            "soon.txt",
            "a",
            ".ENV",
            "id_r\u{17f}a",
        ] {
            assert!(reads_a_credential_file(&named(covered)), "{covered}");
        }
        for ordinary in ["notes.txt", "src/main.rs", "missing.txt"] {
            assert!(!reads_a_credential_file(&named(ordinary)), "{ordinary}");
        }
        assert!(reads_a_credential_file(".env"));
        assert!(!reads_a_credential_file("README.md"));
    }

    /// A link in the middle of the path whose target does not exist yet is as
    /// invisible to `canonicalize` as one at its end.
    #[cfg(unix)]
    #[test]
    fn rules_file_write_denied_through_a_dangling_link_in_the_middle_of_the_path() {
        let tmp = tempfile::tempdir().expect("tempdir");
        fs::create_dir_all(tmp.path().join(".agiworkforce")).expect("create config dir");
        std::os::unix::fs::symlink(
            Path::new(".agiworkforce").join("rules"),
            tmp.path().join("docs"),
        )
        .expect("create dangling symlink");
        let target = tmp.path().join("docs").join("injected.md");

        assert!(
            validate_workspace_write_path_with_cwd(target.to_str().expect("utf8 path"), tmp.path())
                .is_err(),
            "the rules folder does not exist yet, and the write would create it"
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_loop_of_links_is_refused_for_reads_and_writes() {
        let tmp = tempfile::tempdir().expect("tempdir");
        std::os::unix::fs::symlink("b", tmp.path().join("a")).expect("a to b");
        std::os::unix::fs::symlink("a", tmp.path().join("b")).expect("b to a");
        let target = tmp.path().join("a");
        let target = target.to_str().expect("utf8 path");

        for refusal in [
            validate_workspace_path_with_cwd(target, tmp.path()),
            validate_workspace_write_path_with_cwd(target, tmp.path()),
        ] {
            let refusal = refusal.expect_err("nothing says where a loop lands");
            assert!(refusal.contains("loop of symbolic links"), "{refusal}");
        }
    }

    /// The write opens the last component without following a link, so a
    /// dangling link is handed back as the file it points at.
    #[cfg(unix)]
    #[test]
    fn a_dangling_link_to_an_ordinary_file_validates_as_that_file() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let root = tmp.path().canonicalize().expect("canonical root");
        fs::create_dir_all(root.join("docs")).expect("create docs");
        std::os::unix::fs::symlink(Path::new("docs").join("notes.md"), root.join("NOTES.md"))
            .expect("create symlink");

        let validated = validate_workspace_write_path_with_cwd("NOTES.md", &root)
            .expect("an ordinary target is allowed");

        assert_eq!(validated, root.join("docs").join("notes.md"));
    }

    #[test]
    fn refuses_agent_writes_to_the_commands_directory() {
        // custom_commands.rs loads .agiworkforce/commands/**/*.md as slash
        // commands, which is the same always-on trust with a different name.
        let tmp = tempfile::tempdir().expect("tempdir");
        let commands = tmp.path().join(".agiworkforce").join("commands");
        fs::create_dir_all(&commands).expect("create commands dir");
        let target = commands.join("evil.md");

        assert!(validate_workspace_write_path_with_cwd(
            target.to_str().expect("utf8 path"),
            tmp.path()
        )
        .is_err());
    }

    #[test]
    fn still_allows_ordinary_project_writes() {
        // The denylist must not become a general obstacle, this is what proves
        // the guard is narrow rather than broadly breaking the write tool.
        let tmp = tempfile::tempdir().expect("tempdir");
        let src = tmp.path().join("src");
        fs::create_dir_all(&src).expect("create src");
        let target = src.join("main.rs");

        assert!(validate_workspace_write_path_with_cwd(
            target.to_str().expect("utf8 path"),
            tmp.path()
        )
        .is_ok());
    }

    #[test]
    fn still_allows_other_agiworkforce_subdirectories() {
        // Only the two INSTRUCTION directories are denied. Session state and
        // memories live under .agiworkforce too and are written legitimately.
        let tmp = tempfile::tempdir().expect("tempdir");
        let sessions = tmp.path().join(".agiworkforce").join("sessions");
        fs::create_dir_all(&sessions).expect("create sessions");
        let target = sessions.join("state.json");

        assert!(validate_workspace_write_path_with_cwd(
            target.to_str().expect("utf8 path"),
            tmp.path()
        )
        .is_ok());
    }

    #[test]
    fn reads_are_unaffected() {
        // The CLI must still LOAD rules to work; only writes are refused.
        let tmp = tempfile::tempdir().expect("tempdir");
        let rules = tmp.path().join(".agiworkforce").join("rules");
        fs::create_dir_all(&rules).expect("create rules dir");
        let target = rules.join("always.md");
        fs::write(&target, "# rules").expect("write fixture");

        assert!(
            validate_workspace_path_with_cwd(target.to_str().expect("utf8 path"), tmp.path())
                .is_ok()
        );
    }
}

/// True when `dir`'s filesystem folds case. Probed, not assumed from
/// `cfg!(target_os)`: one machine can host both kinds.
pub fn filesystem_is_case_insensitive(dir: &Path) -> bool {
    let probe = dir.join(".agi-case-probe");
    if std::fs::write(&probe, b"").is_err() {
        return cfg!(any(target_os = "macos", target_os = "windows"));
    }
    let upper = dir.join(".AGI-CASE-PROBE");
    let insensitive = upper.exists();
    let _ = std::fs::remove_file(&probe);
    insensitive
}

/// The one internal spelling of a path: canonical, then relative to the
/// workspace root, so routes to the same file give one key.
pub fn repo_relative(path: &Path) -> PathBuf {
    let cwd = validation_workspace();
    repo_relative_to(path, &cwd)
}

pub fn repo_relative_to(path: &Path, root: &Path) -> PathBuf {
    let canonical_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        canonical_root.join(path)
    };
    let resolved = resolve_existing_prefix(&absolute);
    resolved
        .strip_prefix(&canonical_root)
        .map(Path::to_path_buf)
        .unwrap_or(resolved)
}

/// Existing paths close to one that does not exist, read from the deepest real
/// ancestor, so a refusal can name what is actually there.
pub fn nearest_existing_paths(path: &Path, limit: usize) -> Vec<PathBuf> {
    let Some(parent) = deepest_existing_ancestor(path) else {
        return Vec::new();
    };
    let Some(missing) = path
        .strip_prefix(&parent)
        .ok()
        .and_then(|rest| rest.components().next())
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
    else {
        return Vec::new();
    };

    let Ok(entries) = std::fs::read_dir(&parent) else {
        return Vec::new();
    };
    let mut scored: Vec<(usize, PathBuf)> = entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            let score = name_similarity(&missing, &name)?;
            Some((score, entry.path()))
        })
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    scored
        .into_iter()
        .take(limit)
        .map(|(_, path)| path)
        .collect()
}

fn deepest_existing_ancestor(path: &Path) -> Option<PathBuf> {
    path.ancestors()
        .find(|ancestor| ancestor.is_dir())
        .map(Path::to_path_buf)
}

/// Higher is closer. `None` means not close enough to be worth naming.
fn name_similarity(wanted: &str, candidate: &str) -> Option<usize> {
    if wanted == candidate {
        return Some(1000);
    }
    let stem = |name: &str| name.rsplit_once('.').map(|(s, _)| s.to_string());
    if stem(wanted).is_some_and(|s| stem(candidate).is_some_and(|c| s == c)) {
        return Some(900);
    }
    if candidate.starts_with(wanted) || wanted.starts_with(candidate) {
        return Some(500 + wanted.len().min(candidate.len()));
    }
    let shared = wanted
        .chars()
        .zip(candidate.chars())
        .take_while(|(a, b)| a == b)
        .count();
    (shared >= 3).then_some(shared)
}

/// The path as the user reads it: relative to the working directory when the
/// file is inside it, so an approval card or an activity row does not spend
/// its width on the workspace's own prefix.
pub fn display_path(path: &Path) -> String {
    std::env::current_dir()
        .ok()
        .and_then(|cwd| path.strip_prefix(&cwd).ok())
        .filter(|relative| !relative.as_os_str().is_empty())
        .map(|relative| relative.display().to_string())
        .unwrap_or_else(|| path.display().to_string())
}
