//! Where a host may find a program it runs outside any sandbox. A sandboxed
//! command writes its workspace and writable roots, so a `PATH` entry inside
//! one, such as an activated `<workspace>/.venv/bin`, can hold a program it
//! planted under a trusted name. Host git (`agiworkforce-worktree`) and the
//! sandbox launcher itself are looked up only outside those folders.

use crate::SandboxBackend;
use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

/// Folders a host named as writable by some sandbox or as a workspace, each
/// with where it resolved when first named; see [`add_sandbox_writable_roots`]
/// and [`register_workspace_root`]. An entry stays for the life of the
/// process: a folder whose name is gone may have been moved away by a
/// sandbox that can write its parent, which could put a link there next.
static SANDBOX_WRITABLE_ROOTS: Mutex<Vec<(PathBuf, PathBuf)>> = Mutex::new(Vec::new());

/// How many roots [`SANDBOX_WRITABLE_ROOTS`] holds. Once full, no new root
/// is recorded, so [`verify_writable_root`] refuses every root it has not
/// seen; none is ever forgotten. Per-launch scratch folders are never
/// recorded, see [`verify_scratch_root`].
const MAX_RECORDED_ROOTS: usize = 4096;

/// Folders under which any sandbox may write: the shared temporary
/// directories every sandbox's private scratch directory lives in.
#[cfg(unix)]
const SANDBOX_TEMP_ROOTS: [&str; 3] = ["/tmp", "/private/tmp", "/var/folders"];
#[cfg(not(unix))]
const SANDBOX_TEMP_ROOTS: [&str; 0] = [];

/// How many links [`resolve_root_for_use`] follows from one root.
const MAX_LINK_HOPS: usize = 40;

fn recorded_roots() -> std::sync::MutexGuard<'static, Vec<(PathBuf, PathBuf)>> {
    SANDBOX_WRITABLE_ROOTS
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
}

/// Name folders a sandboxed command can write, so no host program, nor any
/// program it starts, such as `ssh`, `gpg` or a credential helper, is found
/// there. A host calls this with the workspace and every writable root it
/// gives a sandbox, before the sandboxed command runs. Roots only accumulate,
/// and each keeps where it resolved the first time, which
/// [`verify_writable_root`] holds it to. A root that does not fit once the
/// registry is full is left unrecorded here, and [`verify_writable_root`]
/// refuses to grant it.
pub fn add_sandbox_writable_roots(roots: impl IntoIterator<Item = PathBuf>) {
    let roots: Vec<(PathBuf, PathBuf)> = roots
        .into_iter()
        .map(|root| normalized(&root))
        .filter(|root| root.is_absolute())
        .map(|root| {
            let resolved = crate::wrap::resolve_existing_prefix(&root);
            (root, resolved)
        })
        .collect();
    let mut known = recorded_roots();
    for (root, resolved) in roots {
        if !known.iter().any(|(named, _)| *named == root) {
            let _ = record_root(&mut known, root, resolved);
        }
    }
}

/// Add `named`, resolved to `resolved`, to `known`, unless `known` is full.
fn record_root(
    known: &mut Vec<(PathBuf, PathBuf)>,
    named: PathBuf,
    resolved: PathBuf,
) -> Result<(), String> {
    record_root_within(known, named, resolved, MAX_RECORDED_ROOTS)
}

fn record_root_within(
    known: &mut Vec<(PathBuf, PathBuf)>,
    named: PathBuf,
    resolved: PathBuf,
    limit: usize,
) -> Result<(), String> {
    if known.len() >= limit {
        return Err(format!(
            "this session has opened {limit} writable folders, the most it tracks, so {} is \
             not opened; restart the app to open more",
            named.display()
        ));
    }
    known.push((named, resolved));
    Ok(())
}

/// `path` with no `.` component, repeated separator or trailing separator.
/// `lstat` follows a link named with a trailing separator, and a registry
/// entry keyed `T/` never matches `T`.
fn normalized(path: &Path) -> PathBuf {
    path.components().collect()
}

fn is_link(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_symlink())
}

/// Where `path` resolved when a host first named it, matched as named or as
/// that first resolution.
fn first_resolved(known: &[(PathBuf, PathBuf)], path: &Path) -> Option<PathBuf> {
    known
        .iter()
        .find(|(named, first)| named == path || first == path)
        .map(|(_, first)| first.clone())
}

fn link_refusal(path: &Path) -> String {
    format!(
        "{} is a link; choose its real folder {}",
        path.display(),
        crate::wrap::resolve_existing_prefix(path).display()
    )
}

/// `path` as a launch may use it, every link on its way followed, at any
/// position, only when it is one of the system's own links, such as `/tmp`,
/// `/var` and `/etc` on macOS: root owns it under its only name, in a folder
/// only root may write. Any other link
/// may be one a sandboxed command made in place of a folder it could write,
/// or of a folder above one, before this launch or before a restart, so the
/// path is refused, naming the real folder to choose instead. A tail that
/// does not exist yet is kept as written.
///
/// The result keeps this walk's spelling, which a process may take for its
/// working directory. Compare it with nothing `std::fs::canonicalize`
/// produced; [`resolve_root_spellings`] gives the spelling for that.
pub fn resolve_root_for_use(path: &Path) -> Result<PathBuf, String> {
    resolve_following(path, link_owned_by_system)
}

/// A root as [`resolve_root_for_use`] walked it, and as the filesystem
/// spells it. Whether a path lies inside the root is decided on `canonical`
/// against the path canonicalized the same way: on Windows both carry the
/// `\\?\` prefix and long names in place of 8.3 ones, and on macOS both
/// carry the case and Unicode normalization stored on disk, none of which the
/// walk changes. `walked` is the spelling for a process's working directory,
/// since cmd.exe refuses a verbatim `\\?\` one.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedRoot {
    pub walked: PathBuf,
    pub canonical: PathBuf,
}

/// `path` walked by [`resolve_root_for_use`], with the canonical spelling of
/// where the walk arrived.
pub fn resolve_root_spellings(path: &Path) -> Result<ResolvedRoot, String> {
    let walked = resolve_root_for_use(path)?;
    let canonical = crate::wrap::resolve_existing_prefix(&walked);
    Ok(ResolvedRoot { walked, canonical })
}

/// `path` with every link on its way that `follow` accepts followed, and
/// refused at the first one it does not.
fn resolve_following(
    path: &Path,
    follow: impl Fn(&Path, &std::fs::Metadata) -> bool,
) -> Result<PathBuf, String> {
    let mut resolved = PathBuf::new();
    let mut pending = reversed_components(path);
    let mut hops = 0;
    while let Some(part) = pending.pop() {
        match Path::new(&part).components().next() {
            None | Some(std::path::Component::CurDir) => {}
            Some(std::path::Component::ParentDir) => {
                resolved.pop();
            }
            Some(std::path::Component::Normal(_)) => {
                let candidate = resolved.join(&part);
                let Ok(meta) = std::fs::symlink_metadata(&candidate) else {
                    resolved = candidate;
                    while let Some(rest) = pending.pop() {
                        resolved.push(rest);
                    }
                    break;
                };
                if !meta.file_type().is_symlink() {
                    resolved = candidate;
                    continue;
                }
                if !follow(&candidate, &meta) {
                    return Err(format!(
                        "{} goes through a link ({}) that a command could have made; choose the \
                         real folder {}",
                        path.display(),
                        candidate.display(),
                        crate::wrap::resolve_existing_prefix(path).display()
                    ));
                }
                hops += 1;
                if hops > MAX_LINK_HOPS {
                    return Err(format!(
                        "{} goes through too many links; choose its real folder {}",
                        path.display(),
                        crate::wrap::resolve_existing_prefix(path).display()
                    ));
                }
                let target = std::fs::read_link(&candidate).map_err(|_| link_refusal(path))?;
                pending.extend(reversed_components(&target));
            }
            Some(_) => resolved.push(&part),
        }
    }
    Ok(resolved)
}

/// The components of `path`, last first, for [`resolve_root_for_use`] to take
/// from the end.
fn reversed_components(path: &Path) -> Vec<OsString> {
    path.components()
        .rev()
        .map(|component| component.as_os_str().to_os_string())
        .collect()
}

/// Whether `link` is one of the system's own links: root owns it, it has no
/// other name, and the folder holding it is root's and writable by no one
/// else, as `/` is for `/tmp`, `/var` and `/etc` on macOS. Root owning the
/// link is not enough: a user process can hard-link a root-owned link into a
/// folder it owns, where it keeps uid 0 under a second name, and can move or
/// replace one in a folder it may write.
#[cfg(unix)]
fn link_owned_by_system(link: &Path, meta: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    let Some(folder) = link
        .parent()
        .and_then(|parent| std::fs::metadata(parent).ok())
    else {
        return false;
    };
    held_only_by_system(meta.uid(), meta.nlink(), folder.uid(), folder.mode())
}

/// [`link_owned_by_system`] on a link's owner and name count and its
/// folder's owner and mode.
#[cfg(unix)]
fn held_only_by_system(link_uid: u32, link_names: u64, folder_uid: u32, folder_mode: u32) -> bool {
    link_uid == 0 && link_names == 1 && folder_uid == 0 && folder_mode & 0o022 == 0
}

/// Windows has no sandbox to make a link, so a link is followed unless the
/// folder holding it is one a host named as writable.
#[cfg(not(unix))]
fn link_owned_by_system(link: &Path, _meta: &std::fs::Metadata) -> bool {
    !inside_any(link.parent().unwrap_or(link), &untrusted_roots(&[]))
}

/// Whether `path`, resolving to `resolved` now, may be granted again given
/// where it first resolved, `recorded`.
fn held_to_record(path: &Path, resolved: &Path, recorded: Option<&Path>) -> Result<(), String> {
    match recorded {
        Some(first) if first != resolved => Err(format!(
            "a writable folder changed since it was opened: {}",
            path.display()
        )),
        _ => Ok(()),
    }
}

/// `path` as it resolves now, in its canonical spelling, checked before a
/// sandbox is given it to write. Seatbelt's write allow for a folder covers the folder itself, so a
/// sandboxed program could remove or rename its root, or a folder above a
/// nested root, and leave a link there, and the next launch would grant
/// wherever the link points. Refused are: a named root that no longer
/// resolves where it did when first named, one with a link on its way that
/// [`resolve_root_for_use`] does not follow, and one
/// [`crate::is_safe_write_root`] refuses. A root no host named yet is
/// recorded here, as named and as resolved, so every later launch is held to
/// where it resolves now; once the registry is full, such a root is refused.
/// The record and the comparison both use the canonical spelling, as
/// [`add_sandbox_writable_roots`] does.
pub fn verify_writable_root(path: &Path) -> Result<PathBuf, String> {
    let path = normalized(path);
    let now = crate::wrap::resolve_existing_prefix(&path);
    let resolved = resolve_root_spellings(&path);
    let mut known = recorded_roots();
    let recorded = first_resolved(&known, &path);
    held_to_record(&path, &now, recorded.as_deref())?;
    let resolved = resolved?.canonical;
    if !crate::is_safe_write_root(&resolved) {
        return Err(format!(
            "a writable folder resolves to the home folder or above it: {}",
            path.display()
        ));
    }
    if recorded.is_none() {
        record_root(&mut known, path, resolved.clone())?;
    }
    Ok(resolved)
}

/// `path` as it resolves now, for a sandbox's private scratch folder, which
/// the host makes fresh for one launch and removes after it. Refused when it
/// is itself a link or [`crate::is_safe_write_root`] refuses where it
/// resolves. Never recorded: every launch has its own, and none is granted
/// twice.
pub fn verify_scratch_root(path: &Path) -> Result<PathBuf, String> {
    let path = normalized(path);
    if is_link(&path) {
        return Err(link_refusal(&path));
    }
    let resolved = crate::wrap::resolve_existing_prefix(&path);
    if !crate::is_safe_write_root(&resolved) {
        return Err(format!(
            "a scratch folder resolves to the home folder or above it: {}",
            path.display()
        ));
    }
    Ok(resolved)
}

/// `path` as it resolves now, checked before a sandbox is given it to read
/// or a host tool that runs outside any sandbox is given it to work in:
/// refused when a host recorded it and it no longer resolves where it did,
/// or when [`resolve_root_for_use`] refuses a link on its way. Nothing is
/// recorded, and the home folder may be read.
pub fn verify_read_root(path: &Path) -> Result<ResolvedRoot, String> {
    let path = normalized(path);
    let now = crate::wrap::resolve_existing_prefix(&path);
    let recorded = first_resolved(&recorded_roots(), &path);
    held_to_record(&path, &now, recorded.as_deref())?;
    resolve_root_spellings(&path)
}

/// `path`, a folder the user has just chosen, resolved through its links
/// once, so it is stored and used as its real folder from then on and no
/// link on its way is consulted again. A folder a host recorded must still
/// resolve where it first did: one a sandbox swapped since is refused rather
/// than followed. A link the user owns is followed only when it lies outside
/// every folder [`untrusted_roots`] names, such as `~/Dropbox`; one inside
/// such a folder, or in place of one, a sandbox could have planted, so the
/// path is refused, naming the real folder to choose instead.
pub fn resolve_chosen_root(path: &Path) -> Result<PathBuf, String> {
    let path = normalized(path);
    held_to_record(
        &path,
        &crate::wrap::resolve_existing_prefix(&path),
        first_resolved(&recorded_roots(), &path).as_deref(),
    )?;
    let roots = untrusted_roots(&[]);
    resolve_following(&path, |link, meta| {
        link_owned_by_system(link, meta) || !roots.iter().any(|root| link.starts_with(root))
    })
}

/// Name a workspace the host opened, which its sandboxed commands write: a
/// writable root like any [`add_sandbox_writable_roots`] names. This
/// process's working directory is never taken for one, so a host registers
/// each workspace before a sandboxed command runs there.
pub fn register_workspace_root(path: PathBuf) {
    add_sandbox_writable_roots([path]);
}

/// Every folder no host program may come from, and no setting host git
/// obeys may live in: the writable and workspace roots hosts named, the
/// shared temporary directories, and `extra`, such as the work tree a command
/// targets. Each is also given as it resolves through the filesystem: a
/// named root where it resolved when recorded, so the registry costs no
/// filesystem call here. A filesystem root is never one: no sandbox is given
/// `/` to write.
pub fn untrusted_roots(extra: &[&Path]) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = SANDBOX_TEMP_ROOTS.iter().map(PathBuf::from).collect();
    roots.push(std::env::temp_dir());
    roots.extend(extra.iter().map(|root| root.to_path_buf()));
    roots.retain(|root| root.is_absolute() && root.parent().is_some());
    let resolved: Vec<PathBuf> = roots
        .iter()
        .filter_map(|root| std::fs::canonicalize(root).ok())
        .collect();
    roots.extend(resolved);
    roots.extend(
        recorded_roots()
            .iter()
            .flat_map(|(named, first)| [named.clone(), first.clone()])
            .filter(|root| root.is_absolute() && root.parent().is_some()),
    );
    roots
}

/// Whether `path`, as written or as it resolves, is inside one of `roots`.
/// A path that does not exist yet resolves through its nearest existing
/// ancestor, so a missing `PATH` entry under a link into a root is inside it.
pub fn inside_any(path: &Path, roots: &[PathBuf]) -> bool {
    let resolved = crate::wrap::resolve_existing_prefix(path);
    roots
        .iter()
        .any(|root| path.starts_with(root) || resolved.starts_with(root))
}

/// The entries of `path` a host program may search: absolute, with no `.`
/// or `..` to resolve later, and outside every one of `roots`.
pub fn trusted_path_entries(path: &OsStr, roots: &[PathBuf]) -> Vec<PathBuf> {
    std::env::split_paths(path)
        .filter(|entry| {
            entry.is_absolute()
                && entry.components().all(|component| {
                    !matches!(
                        component,
                        std::path::Component::CurDir | std::path::Component::ParentDir
                    )
                })
                && !inside_any(entry, roots)
        })
        .collect()
}

/// This process's `PATH` without the entries a sandboxed command could have
/// put a program in: relative ones, and any inside a folder
/// [`untrusted_roots`] names. Host git, every program git starts, and the
/// sandbox launcher are searched for only on this.
pub fn host_path() -> OsString {
    host_path_within(&untrusted_roots(&[]))
}

/// This process's `PATH` with only the entries outside `roots`.
pub fn host_path_within(roots: &[PathBuf]) -> OsString {
    trusted_search_path(std::env::var_os("PATH").as_deref(), roots)
}

/// The entries of `path` outside `roots`, or the system folders when none
/// is left. An empty `PATH` is never the answer: `sh`, `env` and `execvp`
/// search the working directory on one.
fn trusted_search_path(path: Option<&OsStr>, roots: &[PathBuf]) -> OsString {
    path.map(|path| trusted_path_entries(path, roots))
        .filter(|entries| !entries.is_empty())
        .and_then(|entries| std::env::join_paths(entries).ok())
        .unwrap_or_else(system_path)
}

#[cfg(not(windows))]
fn system_path() -> OsString {
    OsString::from("/usr/bin:/bin:/usr/sbin:/sbin")
}

/// The System32 folders under the Windows directory `SystemRoot` names, or
/// under `C:\Windows` when it names no absolute folder.
#[cfg(windows)]
fn system_path() -> OsString {
    let root = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .filter(|root| root.is_absolute())
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    let system32 = root.join("System32");
    let wbem = system32.join("Wbem");
    std::env::join_paths([system32, root, wbem])
        .unwrap_or_else(|_| OsString::from(r"C:\Windows\System32;C:\Windows"))
}

/// The first runnable file named `name` in an entry of `path`, unless the
/// file itself resolves into one of `roots`.
pub fn find_program(path: &OsStr, name: &str, roots: &[PathBuf]) -> Option<PathBuf> {
    std::env::split_paths(path)
        .filter(|entry| entry.is_absolute())
        .map(|entry| entry.join(name))
        .find(|candidate| is_runnable_file(candidate) && !inside_any(candidate, roots))
}

fn is_runnable_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.is_file() && meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        meta.is_file()
    }
}

/// Seatbelt's launcher, which ships with macOS on its sealed system volume.
const SEATBELT_LAUNCHER: &str = "/usr/bin/sandbox-exec";

const BUBBLEWRAP_LAUNCHER: &str = "bwrap";

/// The `bwrap` [`sandbox_launcher`] last found, with the search path it was
/// found on.
static RESOLVED_BUBBLEWRAP: Mutex<Option<(OsString, Option<PathBuf>)>> = Mutex::new(None);

/// The absolute path of the program that starts `backend`'s sandbox, never a
/// bare name a `PATH` lookup would resolve at spawn time: Seatbelt's from
/// its fixed system location, bubblewrap's the first on [`host_path`],
/// found once and reused while that path is unchanged and the file is still
/// outside every root. `None` when the launcher is not there, which a caller
/// treats as no sandbox.
pub fn sandbox_launcher(backend: SandboxBackend) -> Option<PathBuf> {
    match backend {
        SandboxBackend::MacosSeatbelt => {
            Some(PathBuf::from(SEATBELT_LAUNCHER)).filter(|path| is_runnable_file(path))
        }
        SandboxBackend::LinuxBubblewrap => {
            let roots = untrusted_roots(&[]);
            bubblewrap_on(&host_path_within(&roots), &roots)
        }
    }
}

fn bubblewrap_on(path: &OsStr, roots: &[PathBuf]) -> Option<PathBuf> {
    let mut resolved = RESOLVED_BUBBLEWRAP
        .lock()
        .unwrap_or_else(PoisonError::into_inner);
    if let Some((searched, found)) = resolved.as_ref() {
        if searched == path
            && found
                .as_deref()
                .is_none_or(|found| !inside_any(found, roots))
        {
            return found.clone();
        }
    }
    let found = find_program(path, BUBBLEWRAP_LAUNCHER, roots);
    *resolved = Some((path.to_os_string(), found.clone()));
    found
}

/// [`sandbox_launcher`] as the command a wrapped argv starts with, or why
/// there is none.
pub(crate) fn launcher_command(backend: SandboxBackend) -> Result<String, String> {
    let launcher = sandbox_launcher(backend).ok_or_else(|| match backend {
        SandboxBackend::MacosSeatbelt => format!("{SEATBELT_LAUNCHER} is not installed"),
        SandboxBackend::LinuxBubblewrap => {
            "bwrap was not found outside the folders a sandbox can write".to_string()
        }
    })?;
    launcher
        .to_str()
        .map(str::to_string)
        .ok_or_else(|| format!("sandbox launcher path is not valid UTF-8: {launcher:?}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plant(dir: &Path, name: &str) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let program = dir.join(name);
        std::fs::write(&program, "#!/bin/sh\necho planted\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        program
    }

    fn scratch_tree(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "agi-host-path-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_launcher_planted_in_a_registered_root_on_path_is_passed_over() {
        let base = scratch_tree("launcher");
        let workspace = base.join("project");
        let venv = workspace.join(".venv").join("bin");
        plant(&venv, BUBBLEWRAP_LAUNCHER);
        let system = plant(&base.join("system").join("bin"), BUBBLEWRAP_LAUNCHER);
        register_workspace_root(workspace.clone());
        let roots = vec![
            workspace.clone(),
            std::fs::canonicalize(&workspace).unwrap(),
        ];
        let path = std::env::join_paths([venv.clone(), base.join("system").join("bin")]).unwrap();

        assert!(untrusted_roots(&[]).contains(&workspace));
        assert_eq!(
            find_program(&path, BUBBLEWRAP_LAUNCHER, &[]),
            Some(venv.join(BUBBLEWRAP_LAUNCHER)),
            "without the registered root the planted launcher comes first"
        );
        let trusted = std::env::join_paths(trusted_path_entries(&path, &roots)).unwrap();
        assert_eq!(trusted.as_os_str(), system.parent().unwrap().as_os_str());
        assert_eq!(
            bubblewrap_on(&trusted, &roots),
            Some(system.clone()),
            "the planted launcher is never chosen"
        );

        #[cfg(unix)]
        {
            std::fs::remove_file(&system).unwrap();
            std::os::unix::fs::symlink(venv.join(BUBBLEWRAP_LAUNCHER), &system).unwrap();
            assert_ne!(
                bubblewrap_on(&trusted, &roots),
                Some(system),
                "a cached launcher that now resolves into a root is looked up again"
            );
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn the_seatbelt_launcher_is_its_fixed_system_path() {
        match sandbox_launcher(SandboxBackend::MacosSeatbelt) {
            Some(launcher) => assert_eq!(launcher, Path::new(SEATBELT_LAUNCHER)),
            None => assert!(!Path::new(SEATBELT_LAUNCHER).exists()),
        }
        if let Some(launcher) = sandbox_launcher(SandboxBackend::LinuxBubblewrap) {
            assert!(launcher.is_absolute());
            assert!(!inside_any(&launcher, &untrusted_roots(&[])));
        }
    }

    #[test]
    fn named_writable_and_workspace_roots_and_temporary_folders_are_untrusted() {
        let writable = scratch_tree("writable");
        let target = scratch_tree("target-repo");
        add_sandbox_writable_roots([writable.clone(), PathBuf::from("relative/root")]);
        let roots = untrusted_roots(&[target.as_path()]);

        assert!(roots.contains(&writable));
        assert!(roots.contains(&std::fs::canonicalize(&writable).unwrap()));
        assert!(roots.contains(&std::env::temp_dir()));
        assert!(roots.contains(&target));
        assert!(!roots.contains(&PathBuf::from("relative/root")));
        assert!(roots.iter().all(|root| root.parent().is_some()));
        let _ = std::fs::remove_dir_all(&writable);
        let _ = std::fs::remove_dir_all(&target);
    }

    #[cfg(unix)]
    #[test]
    fn a_missing_path_under_a_link_into_a_root_is_inside_that_root() {
        let base = scratch_tree("link-into-root");
        let workspace = base.join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();
        let link = base.join("outside");
        std::os::unix::fs::symlink(&workspace, &link).unwrap();
        let roots = vec![std::fs::canonicalize(&workspace).unwrap()];
        let missing = link.join(".venv").join("bin");

        assert!(!missing.exists());
        assert!(inside_any(&missing, &roots));
        assert!(trusted_path_entries(missing.as_os_str(), &roots).is_empty());
        assert!(!inside_any(&base.join("elsewhere").join("bin"), &roots));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_root_is_checked_as_itself_however_it_is_spelled_and_held_from_first_sight() {
        let base = scratch_tree("trailing-separator");
        let real = base.join("real");
        std::fs::create_dir_all(&real).unwrap();
        let link = base.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let link_spelled = PathBuf::from(format!("{}/", link.display()));
        let error = verify_writable_root(&link_spelled).expect_err("a link is refused");
        assert!(error.contains("goes through a link"), "{error}");
        assert!(error.contains(&real.canonicalize().unwrap().display().to_string()));
        assert!(verify_read_root(&link_spelled).is_err());

        let root = base.join("root");
        std::fs::create_dir_all(&root).unwrap();
        let root_spelled = PathBuf::from(format!("{}/./", root.display()));
        assert_eq!(
            verify_writable_root(&root_spelled).unwrap(),
            root.canonicalize().unwrap()
        );
        std::fs::rename(&root, base.join("moved")).unwrap();
        std::os::unix::fs::symlink(&real, &root).unwrap();
        assert!(
            verify_read_root(&root)
                .is_err_and(|error| error.contains("changed since it was opened")),
            "a root verified once is held to where it first resolved, read or written"
        );
        for spelled in [root.clone(), root_spelled] {
            let error = verify_writable_root(&spelled).expect_err("the root moved");
            assert!(error.contains("changed since it was opened"), "{error}");
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn the_registry_keeps_deleted_folders_and_refuses_new_ones_once_full() {
        let base = scratch_tree("registry-bound").canonicalize().unwrap();
        let deleted = base.join("deleted");
        let kept = base.join("kept");
        for dir in [&deleted, &kept] {
            std::fs::create_dir_all(dir).unwrap();
        }
        let mut known = Vec::new();
        for dir in [&deleted, &kept] {
            record_root(&mut known, dir.clone(), dir.clone()).unwrap();
        }
        std::fs::remove_dir(&deleted).unwrap();
        let fresh = base.join("fresh");
        record_root(&mut known, fresh.clone(), fresh.clone()).unwrap();
        let named: Vec<&PathBuf> = known.iter().map(|(named, _)| named).collect();
        assert_eq!(
            named,
            [&deleted, &kept, &fresh],
            "a deleted folder stays recorded"
        );

        let more = base.join("more");
        let error = record_root_within(&mut known, more.clone(), more, 3)
            .expect_err("a full registry records nothing new");
        assert!(error.contains("restart the app"), "{error}");
        assert_eq!(known.len(), 3);
        assert_eq!(known[0].0, deleted, "nothing is evicted");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_root_whose_parent_was_moved_away_then_linked_is_refused_after_more_launches() {
        let base = scratch_tree("parent-moved-away").canonicalize().unwrap();
        let project = base.join("parent").join("project");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::create_dir_all(base.join("decoy").join("project")).unwrap();
        assert_eq!(verify_writable_root(&project).unwrap(), project);

        std::fs::rename(base.join("parent"), base.join("moved")).unwrap();
        for launch in 0..3 {
            let scratch = base.join(format!("scratch-{launch}"));
            std::fs::create_dir(&scratch).unwrap();
            assert_eq!(verify_scratch_root(&scratch).unwrap(), scratch);
            std::fs::remove_dir(&scratch).unwrap();
            add_sandbox_writable_roots([base.join(format!("other-{launch}"))]);
        }
        std::os::unix::fs::symlink(base.join("decoy"), base.join("parent")).unwrap();

        let error = verify_writable_root(&project).expect_err("the project resolves elsewhere");
        assert!(error.contains("changed since it was opened"), "{error}");
        assert!(
            !recorded_roots()
                .iter()
                .any(|(named, _)| named.starts_with(base.join("scratch-0"))),
            "a scratch folder is never recorded"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    /// A folder outside the temporary folders, as a project in the user's own
    /// folders is: next to the test binary, in the build output.
    #[cfg(unix)]
    fn tree_outside_temp(name: &str) -> PathBuf {
        let exe = std::env::current_exe().unwrap().canonicalize().unwrap();
        let dir = exe.parent().unwrap().join(format!(
            "agi-host-path-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[cfg(unix)]
    #[test]
    fn a_link_the_user_owns_is_refused_wherever_it_sits_on_the_path() {
        let base = tree_outside_temp("user-link");
        let real = base.join("real");
        std::fs::create_dir_all(real.join("inner")).unwrap();
        std::os::unix::fs::symlink(&real, base.join("link")).unwrap();

        assert_eq!(resolve_root_for_use(&real).unwrap(), real);
        assert_eq!(
            resolve_root_for_use(&real.join("missing").join("tail")).unwrap(),
            real.join("missing").join("tail"),
            "a tail that does not exist yet is kept as written"
        );
        for (path, link) in [
            (base.join("link"), base.join("link")),
            (base.join("link").join("inner"), base.join("link")),
            (base.join("link").join("missing"), base.join("link")),
        ] {
            let error = resolve_root_for_use(&path).expect_err("a user's link is refused");
            assert!(
                error.contains(&format!("goes through a link ({})", link.display())),
                "{error}"
            );
            assert!(error.contains(&real.display().to_string()), "{error}");
            assert!(verify_read_root(&path).is_err());
            assert!(verify_writable_root(&path).is_err());
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_link_root_owns_is_followed() {
        let var = Path::new("/var");
        if let Ok(meta) = std::fs::symlink_metadata(var) {
            use std::os::unix::fs::MetadataExt;
            assert!(!meta.file_type().is_symlink() || meta.uid() == 0);
            assert_eq!(
                resolve_root_for_use(&var.join("agi-missing")).unwrap(),
                var.canonicalize().unwrap().join("agi-missing")
            );
        }
        let temp = std::env::temp_dir();
        assert_eq!(
            resolve_root_for_use(&temp).unwrap(),
            temp.canonicalize().unwrap()
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn the_system_tmp_link_on_macos_is_followed() {
        assert_eq!(
            resolve_root_for_use(Path::new("/tmp/agi-missing")).unwrap(),
            PathBuf::from("/private/tmp/agi-missing")
        );
        assert_eq!(
            verify_read_root(Path::new("/tmp")).unwrap(),
            ResolvedRoot {
                walked: PathBuf::from("/private/tmp"),
                canonical: PathBuf::from("/private/tmp"),
            }
        );
    }

    #[cfg(unix)]
    #[test]
    fn only_a_single_named_root_link_in_a_folder_only_root_writes_is_followed() {
        assert!(
            held_only_by_system(0, 1, 0, 0o40755),
            "/tmp under / on macOS"
        );
        assert!(
            !held_only_by_system(0, 1, 501, 0o40755),
            "a root-owned link in a user's folder"
        );
        assert!(
            !held_only_by_system(0, 2, 501, 0o40700),
            "a root-owned link hard-linked into a user's folder"
        );
        assert!(
            !held_only_by_system(0, 2, 0, 0o40755),
            "a root-owned link with a second name elsewhere"
        );
        assert!(
            !held_only_by_system(0, 1, 0, 0o41777),
            "a root-owned link in a folder anyone may write, such as /private/tmp"
        );
        assert!(!held_only_by_system(0, 1, 0, 0o40775));
        assert!(!held_only_by_system(501, 1, 0, 0o40755));

        let base = tree_outside_temp("user-folder-link");
        let link = base.join("tmp");
        std::os::unix::fs::symlink("/private/tmp", &link).unwrap();
        let meta = std::fs::symlink_metadata(&link).unwrap();
        assert!(
            !link_owned_by_system(&link, &meta),
            "a link in a folder the user writes is not the system's"
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_root_spelled_in_another_case_is_compared_in_its_stored_case() {
        let base = tree_outside_temp("case");
        let stored = base.join("Project");
        std::fs::create_dir_all(stored.join("src")).unwrap();
        let spelled = base.join("project");
        if !spelled.exists() {
            let _ = std::fs::remove_dir_all(&base);
            return;
        }
        let root = resolve_root_spellings(&spelled).unwrap();
        assert_eq!(root.walked, spelled);
        assert_eq!(root.canonical, stored);
        assert!(std::fs::canonicalize(spelled.join("src"))
            .unwrap()
            .starts_with(&root.canonical));

        assert_eq!(verify_writable_root(&spelled).unwrap(), stored);
        assert_eq!(
            verify_writable_root(&spelled).unwrap(),
            stored,
            "a root recorded in its stored case still matches on the next launch"
        );
        assert_eq!(verify_read_root(&spelled).unwrap().canonical, stored);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(windows)]
    #[test]
    fn a_windows_root_is_compared_in_its_verbatim_spelling_and_used_in_its_plain_one() {
        let base = scratch_tree("verbatim");
        std::fs::create_dir_all(base.join("src")).unwrap();
        let root = resolve_root_spellings(&base).unwrap();
        assert!(
            !root.walked.to_string_lossy().starts_with(r"\\?\"),
            "the working-directory spelling is never verbatim: {}",
            root.walked.display()
        );
        assert_eq!(root.canonical, std::fs::canonicalize(&base).unwrap());
        assert!(std::fs::canonicalize(base.join("src"))
            .unwrap()
            .starts_with(&root.canonical));
        assert_eq!(verify_read_root(&base).unwrap().canonical, root.canonical);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_recorded_root_its_sandbox_swapped_for_a_link_is_refused_outside_temp_too() {
        let base = tree_outside_temp("swapped-root");
        let project = base.join("project");
        let elsewhere = base.join("elsewhere");
        for dir in [&project, &elsewhere] {
            std::fs::create_dir_all(dir).unwrap();
        }
        assert_eq!(verify_writable_root(&project).unwrap(), project);
        assert_eq!(verify_read_root(&project).unwrap().canonical, project);

        std::fs::rename(&project, base.join("moved")).unwrap();
        std::os::unix::fs::symlink(&elsewhere, &project).unwrap();
        for error in [
            verify_read_root(&project).expect_err("the recorded root moved"),
            verify_writable_root(&project).expect_err("the recorded root moved"),
            resolve_chosen_root(&project).expect_err("choosing it again is refused too"),
        ] {
            assert!(error.contains("changed since it was opened"), "{error}");
        }

        let unrecorded = base.join("unrecorded");
        std::os::unix::fs::symlink(&elsewhere, &unrecorded).unwrap();
        let error = verify_read_root(&unrecorded).expect_err("a user's link is never followed");
        assert!(error.contains("goes through a link"), "{error}");
        if !inside_any(&base, &untrusted_roots(&[])) {
            assert_eq!(
                resolve_chosen_root(&unrecorded).unwrap(),
                elsewhere,
                "a folder the user just chose through a link is stored as its real folder"
            );
        }
        let _ = std::fs::remove_dir_all(&base);
    }

    #[cfg(unix)]
    #[test]
    fn a_chosen_folder_through_a_link_a_sandbox_could_have_planted_is_refused() {
        let base = tree_outside_temp("planted-link");
        let project = base.join("project");
        let target = base.join("target");
        for dir in [&project, &target] {
            std::fs::create_dir_all(dir).unwrap();
        }
        assert_eq!(verify_writable_root(&project).unwrap(), project);
        std::os::unix::fs::symlink(&target, project.join("planted")).unwrap();
        let error = resolve_chosen_root(&project.join("planted"))
            .expect_err("a link inside a writable folder is never followed at choice");
        assert!(
            error.contains(&format!(
                "goes through a link ({})",
                project.join("planted").display()
            )),
            "{error}"
        );
        assert!(error.contains(&target.display().to_string()), "{error}");

        let temp = scratch_tree("planted-in-temp");
        std::fs::create_dir_all(temp.join("real")).unwrap();
        std::os::unix::fs::symlink(temp.join("real"), temp.join("link")).unwrap();
        assert!(
            resolve_chosen_root(&temp.join("link")).is_err(),
            "a link in a temporary folder any sandbox writes is refused at choice"
        );
        let _ = std::fs::remove_dir_all(&base);
        let _ = std::fs::remove_dir_all(&temp);
    }

    #[test]
    fn a_path_with_no_trusted_entry_is_the_system_folders_never_empty() {
        let workspace = scratch_tree("only-untrusted");
        let roots = vec![workspace.clone()];
        let only_untrusted = std::env::join_paths([workspace.join("bin")]).unwrap();
        for path in [
            None,
            Some(OsStr::new("")),
            Some(OsStr::new("relative/bin")),
            Some(only_untrusted.as_os_str()),
        ] {
            let searched = trusted_search_path(path, &roots);
            assert_eq!(searched, system_path(), "{path:?}");
            assert!(!searched.is_empty());
            assert!(std::env::split_paths(&searched).all(|entry| entry.is_absolute()));
        }
        let system = scratch_tree("system-bin");
        let mixed = std::env::join_paths([workspace.join("bin"), system.clone()]).unwrap();
        assert_eq!(
            trusted_search_path(Some(mixed.as_os_str()), &roots),
            system.clone().into_os_string()
        );
        let _ = std::fs::remove_dir_all(&workspace);
        let _ = std::fs::remove_dir_all(&system);
    }
}
