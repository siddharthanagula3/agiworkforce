use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

static ADDITIONAL_WORKSPACE_ROOTS: OnceLock<RwLock<Vec<PathBuf>>> = OnceLock::new();

fn additional_roots() -> &'static RwLock<Vec<PathBuf>> {
    ADDITIONAL_WORKSPACE_ROOTS.get_or_init(|| RwLock::new(Vec::new()))
}

pub fn register_additional_workspace_root(path_str: &str) -> std::result::Result<PathBuf, String> {
    let expanded = expand_home(path_str);
    let path = PathBuf::from(expanded);
    let absolute = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .map_err(|e| format!("Cannot determine current directory: {e}"))?
            .join(path)
    };
    register_additional_workspace_root_path(&absolute)
}

pub fn register_additional_workspace_root_path(
    path: &Path,
) -> std::result::Result<PathBuf, String> {
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
const AGENT_INSTRUCTION_DIRS: &[&str] = &[
    ".agiworkforce/rules",
    ".agiworkforce/commands",
    ".claude/commands",
    ".agiworkforce/prompts/claude",
];

/// True when `path` lands inside a directory the agent must not author.
fn is_agent_instruction_path(path: &Path) -> bool {
    // Compare with forward slashes so the check behaves the same on Windows,
    // and case-insensitively because macOS and Windows default to
    // case-insensitive filesystems: `.AGIWORKFORCE/RULES/x.md` is the very same
    // directory `memory.rs` globs, so it has to be the very same denial.
    let normalized = path.to_string_lossy().replace('\\', "/").to_lowercase();
    AGENT_INSTRUCTION_DIRS.iter().any(|dir| {
        normalized.contains(&format!("/{dir}/")) || normalized.starts_with(&format!("{dir}/"))
    })
}

/// Canonicalize the deepest existing ancestor of `path` and re-attach the
/// components below it.
///
/// Resolves every symlink that `realpath` can resolve, i.e. every one whose
/// target exists. A symlink whose target does not exist yet survives this
/// untouched, see `resolve_for_denylist`, which is why that wrapper exists.
fn resolve_existing_prefix(path: &Path) -> PathBuf {
    for ancestor in path.ancestors() {
        let Ok(canonical) = ancestor.canonicalize() else {
            continue;
        };
        let below = path
            .strip_prefix(ancestor)
            .unwrap_or_else(|_| Path::new(""));
        return if below.as_os_str().is_empty() {
            canonical
        } else {
            canonical.join(below)
        };
    }
    // Reached when no ancestor exists on disk. An absolute path always ends its
    // ancestor walk at a root that canonicalizes, so in practice this is the
    // relative-path case, where the raw spelling is all there is to judge.
    path.to_path_buf()
}

/// How many symlink hops to follow. Real paths resolve in one; the cap is only
/// so a link cycle cannot spin here forever.
const MAX_DENYLIST_LINK_HOPS: usize = 16;

/// Resolve `path` to the location a write to it would actually land on.
///
/// The denylist matches on text, and `validate_workspace_path_with_cwd` hands
/// back a not-yet-created file spelled exactly as the caller spelled it. Two
/// spellings reach an instruction directory without ever containing its name:
/// a different casing, where the filesystem is case-insensitive, and a symlink
/// somewhere inside the project.
///
/// Canonicalizing the existing prefix collapses both, but only for a link
/// whose target already exists. A link whose target is still absent is what an
/// attacker actually commits, and it is invisible to both `exists` and
/// `canonicalize`: the ancestor walk pops the link's own name and re-attaches
/// it as raw text, dropping exactly the indirection it was meant to resolve.
/// `tokio::fs::write` at the four write sites opens with `O_CREAT` and follows
/// it regardless, materializing the target. So a dangling leaf link is read
/// here by hand, with `symlink_metadata`, which does not follow, and its target
/// resolved the same way, repeatedly, for chained links.
fn resolve_for_denylist(path: &Path) -> PathBuf {
    let mut resolved = resolve_existing_prefix(path);
    for _ in 0..MAX_DENYLIST_LINK_HOPS {
        let is_dangling_link = std::fs::symlink_metadata(&resolved)
            .map(|meta| meta.file_type().is_symlink())
            .unwrap_or(false);
        if !is_dangling_link {
            return resolved;
        }
        let Ok(target) = std::fs::read_link(&resolved) else {
            return resolved;
        };
        let next = if target.is_absolute() {
            target
        } else {
            // A relative link target is relative to the directory holding the
            // link, not to the process cwd.
            resolved
                .parent()
                .unwrap_or_else(|| Path::new(""))
                .join(target)
        };
        resolved = resolve_existing_prefix(&next);
    }
    resolved
}

/// Containment check plus the agent-instruction denylist.
///
/// Use this for every tool that WRITES. `validate_workspace_path` stays as-is
/// for reads.
pub fn validate_workspace_write_path(path_str: &str) -> std::result::Result<PathBuf, String> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    validate_workspace_write_path_with_cwd(path_str, &cwd)
}

pub fn validate_workspace_write_path_with_cwd(
    path_str: &str,
    cwd: &Path,
) -> std::result::Result<PathBuf, String> {
    let validated = validate_workspace_path_with_cwd(path_str, cwd)?;
    if is_agent_instruction_path(&resolve_for_denylist(&validated)) {
        return Err(format!(
            "Refusing to write {path_str}: this directory is loaded as trusted, always-on \
             instructions for every future session, so an agent write here would rewrite the \
             agent's own instructions. Edit it yourself if that is intended."
        ));
    }
    Ok(validated)
}

pub fn validate_workspace_path(path_str: &str) -> std::result::Result<PathBuf, String> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
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

    let mut existing_parent = absolute.as_path();
    while !existing_parent.exists() {
        existing_parent = existing_parent
            .parent()
            .ok_or_else(|| format!("Cannot resolve existing parent for path: {}", path_str))?;
    }

    let canonical_parent = existing_parent
        .canonicalize()
        .map_err(|e| format!("Cannot resolve parent path: {}", e))?;
    if !is_under_allowed_root(&canonical_parent, &allowed_roots) {
        return Err(format!(
            "Path escapes project directory and additional roots: {} (parent resolved to {})",
            path_str,
            canonical_parent.display()
        ));
    }

    Ok(absolute)
}

fn allowed_workspace_roots(cwd: &Path) -> Vec<PathBuf> {
    let mut roots = vec![cwd.canonicalize().unwrap_or_else(|_| cwd.to_path_buf())];
    roots.extend(registered_additional_workspace_roots());
    roots
}

fn is_under_allowed_root(path: &Path, allowed_roots: &[PathBuf]) -> bool {
    allowed_roots.iter().any(|root| path.starts_with(root))
}

fn expand_home(path: &str) -> String {
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

    #[test]
    fn validate_workspace_path_allows_registered_additional_root() {
        let _guard = lock_roots();
        clear_additional_workspace_roots_for_tests();
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let outside = tempfile::tempdir().expect("outside tempdir");
        let file = outside.path().join("shared.txt");
        std::fs::write(&file, "shared").expect("write outside file");

        register_additional_workspace_root_path(outside.path()).expect("register extra root");

        let result = validate_workspace_path_with_cwd(&file.to_string_lossy(), workspace.path())
            .expect("registered additional root should be allowed");

        assert_eq!(result, file.canonicalize().expect("canonical extra file"));
        clear_additional_workspace_roots_for_tests();
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

        let outcome = (0..500).try_for_each(|_| {
            validate_workspace_path_with_cwd(&file.to_string_lossy(), workspace.path()).map(|_| ())
        });

        stop.store(true, Ordering::Relaxed);
        sibling.join().expect("sibling test thread");
        clear_additional_workspace_roots_for_tests();

        outcome.expect("registered root must survive another test thread's registry reset");
    }
}

#[cfg(test)]
mod agent_instruction_denylist_tests {
    use super::*;
    use std::fs;

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
