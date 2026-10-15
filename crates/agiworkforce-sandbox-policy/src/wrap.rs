//! Turn a program, its arguments and a sandbox policy into the argv that
//! launches it under the OS sandbox (macOS Seatbelt or Linux bubblewrap).
//!
//! Pure argv construction: nothing here spawns a process or creates a file.
//! The caller owns backend detection, the scratch directory and the spawn.

use crate::host_path::{launcher_command, verify_scratch_root, verify_writable_root};
use crate::SandboxPolicy;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Network access opt-in flag for sandboxed execution.
///
/// Default: network is denied. Callers that legitimately need outbound access
/// (npm install, git clone, curl APIs) must pass an allowing policy explicitly.
///
/// `AllowExternal` is the policy a general network approval grants. It keeps
/// the loopback interface and local Unix-domain sockets blocked, so an approved
/// `curl` cannot turn into a request against a service bound to the developer's
/// own machine. Seatbelt enforces that in the profile for `localhost` only: a
/// host in an SBPL network filter is `*` or `localhost`, so `0.0.0.0` and the
/// machine's other interface addresses cannot be named there. Bubblewrap has
/// no address filter at all. For a command, the caller-side destination check
/// covers both gaps: it refuses an internal target, `0.0.0.0` and the
/// machine's own LAN addresses included, before any approval is offered. A
/// long-lived program such as an MCP server never passes that check, so under
/// this policy it reaches those addresses on macOS, and loopback and
/// Unix-domain sockets as well on Linux.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum NetworkPolicy {
    #[default]
    Deny,
    AllowExternal,
    Allow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SandboxBackend {
    MacosSeatbelt,
    LinuxBubblewrap,
}

/// Everything the argv builders read from a sandbox manager.
#[derive(Debug, Clone, Copy)]
pub struct SandboxSpec<'a> {
    pub policy: &'a SandboxPolicy,
    pub workspace_dir: &'a Path,
    pub network_policy: NetworkPolicy,
    /// Absolute paths kept read-only even inside a writable root, such as the
    /// hook and MCP configuration that decides what runs next.
    pub protected_paths: &'a [PathBuf],
}

/// Validate a workspace path and spell it for a Seatbelt SBPL string literal.
///
/// SECURITY (CRIT-2): the first implementation used `to_string_lossy()` and
/// interpolated the result raw into `format!(... "(allow file-read* (subpath \"{ws}\"))" ...)`.
/// A workspace path `/tmp/x") (allow default) ;#` broke out of the string literal
/// and injected an `(allow default)` rule, a complete macOS sandbox escape.
///
/// The result is the inside of a string literal ([`seatbelt_string`]): a
/// backslash and a double quote are escaped, and nothing else needs to be,
/// since a parenthesis is an ordinary character inside a string. Checked with
/// `sandbox-exec` on a folder named `a (b) "c" \d`: writes inside it are
/// allowed, writes beside it denied, and the path above parses as one string.
/// Still refused, because no escape is known to carry them:
///   - Control chars (< 0x20): NUL terminates C strings; newline/CR split rules
///   - Unicode line/paragraph separators (U+2028, U+2029): treated as newline by
///     some parsers
///   - Leading/trailing whitespace: would silently change the matched subpath
///   - Root `/`: too broad (would allow write everywhere)
///   - Empty or relative paths: rejected for correctness
pub fn validate_and_escape_seatbelt_path(path: &Path) -> Result<String, String> {
    escape_resolved_seatbelt_path(path, &resolve_existing_prefix(path))
}

/// [`validate_and_escape_seatbelt_path`] for `path` already resolved to
/// `canonical`, such as a writable root as [`verify_writable_root`] found it,
/// so the rule names exactly what was verified.
pub(crate) fn escape_resolved_seatbelt_path(
    path: &Path,
    canonical: &Path,
) -> Result<String, String> {
    let s = canonical
        .to_str()
        .ok_or_else(|| format!("workspace path is not valid UTF-8: {:?}", canonical))?;

    if s.is_empty() || path.as_os_str().is_empty() {
        return Err("workspace path is empty".to_string());
    }
    if s == "/" {
        // SECURITY: root path would grant file-write* everywhere, reject.
        return Err("workspace path '/' is too broad for sandboxed exec".to_string());
    }
    if !path.is_absolute() {
        return Err(format!("workspace path must be absolute: {:?}", path));
    }
    if s != s.trim() {
        return Err(format!(
            "workspace path has leading or trailing whitespace: {:?}",
            path
        ));
    }
    // Control chars including NUL (terminates C string) and newlines (split rules).
    if s.chars().any(|c| (c as u32) < 0x20) {
        return Err(format!(
            "workspace path contains ASCII control character: {:?}",
            path
        ));
    }
    // Unicode line/paragraph separators, some SBPL parsers treat as newlines.
    if s.contains('\u{2028}') || s.contains('\u{2029}') {
        return Err(format!(
            "workspace path contains Unicode line/paragraph separator: {:?}",
            path
        ));
    }
    Ok(seatbelt_string(s))
}

/// `text` as the inside of an SBPL string literal: each backslash and each
/// double quote gets a backslash in front. Every path, name and regex a
/// profile holds is written through this, once.
fn seatbelt_string(text: &str) -> String {
    let mut literal = String::with_capacity(text.len());
    for character in text.chars() {
        if matches!(character, '\\' | '"') {
            literal.push('\\');
        }
        literal.push(character);
    }
    literal
}

/// A Seatbelt `regex` filter for `pattern`, written as an ordinary string
/// literal. The `#"..."` form ends at the first double quote whatever comes
/// before it, so it cannot hold a path with a quote in it; an ordinary string
/// can, and the reader undoes [`seatbelt_string`] before the regex is read.
fn seatbelt_regex(pattern: &str) -> String {
    format!("(regex \"{}\")", seatbelt_string(pattern))
}

/// `path` with its symlinks resolved, as the kernel resolves it before a
/// sandbox matches it ([`crate::resolve::landing_path`]): canonical when it
/// exists, and otherwise followed through every link on it, a dangling one
/// included, with the rest that does not exist appended. A path that does
/// not exist yet, such as a protected `.mcp.json` under a project reached
/// through a symlink, would otherwise keep the link's spelling, which a
/// Seatbelt rule never matches. A path whose links loop keeps its spelling:
/// nothing can be read or written through it.
pub(crate) fn resolve_existing_prefix(path: &Path) -> PathBuf {
    crate::resolve::landing_path(path).unwrap_or_else(|_| path.to_path_buf())
}

/// What a write denial of `path` names: where a write through it lands, and,
/// when its last component is a link, the link itself. Seatbelt checks an
/// unlink or a rename against the link's own path, so a rule naming only the
/// target would let a program remove the link and leave a file in its place.
/// A target that is a device is left out: a repository can ship
/// `.gitmodules` as a link to `/dev/null`, and denying writes there would
/// break every program run in it.
fn write_denial_spellings(path: &Path) -> Vec<PathBuf> {
    let landing = resolve_existing_prefix(path);
    let own = match (path.parent(), path.file_name()) {
        (Some(parent), Some(name)) => resolve_existing_prefix(parent).join(name),
        _ => landing.clone(),
    };
    let mut spellings = vec![own];
    if !spellings.contains(&landing) && !landing.starts_with(DEVICE_FOLDER) {
        spellings.push(landing);
    }
    spellings
}

/// Where devices are, such as the null device every program writes to.
const DEVICE_FOLDER: &str = "/dev";

/// `/` itself, or any spelling of it such as `/usr/..` or a link to it.
fn is_filesystem_root(path: &Path) -> bool {
    path == Path::new("/")
        || path
            .canonicalize()
            .is_ok_and(|canonical| canonical == Path::new("/"))
}

/// Git metadata under `root` that a sandboxed program must not write: `.git`
/// itself, whether or not it exists yet, and for a linked worktree the private
/// and shared git directories its `.git` file names. Host-side git reads hooks,
/// config, the index and refs from these, so a write there would run code
/// outside the sandbox the next time the host runs git in this checkout. The
/// `.git` file of every linked worktree checked out below `root`, such as the
/// desktop's named worktrees, is included too: the repository's own
/// `worktrees/*/gitdir` records name them, so none is missed for living inside
/// a writable root. So is the `.git` of every submodule: host git reads the
/// configuration of the git directory it names.
pub fn git_metadata_paths(root: &Path) -> Vec<PathBuf> {
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let dot_git = root.join(".git");
    let git_dir = if dot_git.is_file() {
        read_regular_file(&dot_git, GITFILE_READ_LIMIT).and_then(|head| {
            let text = String::from_utf8_lossy(&head);
            let target = PathBuf::from(text.lines().next()?.strip_prefix("gitdir:")?.trim());
            Some(if target.is_absolute() {
                target
            } else {
                root.join(target)
            })
        })
    } else if dot_git.is_dir() {
        Some(dot_git.clone())
    } else {
        None
    };
    let mut paths = vec![dot_git];
    if let Some(git_dir) = git_dir {
        let git_dir = git_dir.canonicalize().unwrap_or(git_dir);
        let common_dir = read_first_line(&git_dir.join("commondir"))
            .filter(|text| !text.is_empty())
            .map(|text| {
                let common = PathBuf::from(text);
                let common = if common.is_absolute() {
                    common
                } else {
                    git_dir.join(common)
                };
                common.canonicalize().unwrap_or(common)
            });
        let common = common_dir.as_deref().unwrap_or(&git_dir);
        let linked = linked_worktree_git_files(common, &root);
        let submodules = submodule_git_entries(&root, &git_dir, common);
        paths.push(git_dir);
        paths.extend(common_dir);
        paths.extend(linked);
        paths.extend(submodules);
    }
    let mut seen = HashSet::new();
    paths.retain(|path| seen.insert(path.clone()));
    paths
}

/// The `.git` files of the linked worktrees of the repository at `common_dir`
/// that are checked out below `root`, read from the repository's side.
fn linked_worktree_git_files(common_dir: &Path, root: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(common_dir.join("worktrees")) else {
        return Vec::new();
    };
    let mut files: Vec<PathBuf> = entries
        .flatten()
        .filter_map(|entry| read_first_line(&entry.path().join("gitdir")))
        .map(PathBuf::from)
        .filter(|file| file.is_absolute())
        .map(|file| match (file.parent(), file.file_name()) {
            (Some(parent), Some(name)) => parent
                .canonicalize()
                .map(|parent| parent.join(name))
                .unwrap_or(file),
            _ => file,
        })
        .filter(|file| file.starts_with(root) && file.parent() != Some(root))
        .collect();
    files.sort();
    files
}

/// The `.git` of each submodule of the checkout at `root`, whose git
/// directory is `git_dir` and common one `common_dir`: every path its
/// `.gitmodules` names and every gitlink in its index, read from the file
/// rather than through git. A path that would leave `root`, or that a
/// Seatbelt profile cannot name, is left out; host git ignores submodules
/// in status and diff and refuses a commit through a `.git` file that names
/// a directory outside `modules`, so neither leaves anything unguarded.
fn submodule_git_entries(root: &Path, git_dir: &Path, common_dir: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<String> =
        read_regular_file(&root.join(SUBMODULE_MAP_FILE), GITMODULES_READ_LIMIT)
            .map(|text| {
                String::from_utf8_lossy(&text)
                    .lines()
                    .filter_map(|line| {
                        let (key, value) = line.split_once('=')?;
                        (key.trim() == "path").then(|| value.trim().trim_matches('"').to_string())
                    })
                    .collect()
            })
            .unwrap_or_default();
    let hash_len = if sha256_repository(common_dir) {
        32
    } else {
        20
    };
    let indexes = std::fs::read_dir(git_dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| {
                    path.file_name()
                        .and_then(|name| name.to_str())
                        .is_some_and(|name| name == "index" || name.starts_with("sharedindex."))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut budget = INDEX_READ_LIMIT;
    for index in indexes {
        let Some(data) = read_regular_file(&index, budget) else {
            continue;
        };
        budget = budget.saturating_sub(data.len() as u64);
        paths.extend(index_gitlinks(&data, hash_len));
        if budget == 0 {
            break;
        }
    }
    let mut entries: Vec<PathBuf> = paths
        .into_iter()
        .map(PathBuf::from)
        .filter(|path| {
            !path.as_os_str().is_empty()
                && path
                    .components()
                    .all(|component| matches!(component, std::path::Component::Normal(_)))
        })
        .map(|path| root.join(path).join(".git"))
        .filter(|path| validate_and_escape_seatbelt_path(path).is_ok())
        .collect();
    entries.sort();
    entries.dedup();
    entries
}

/// The most read of a `.git` file, whose first line names the git directory.
const GITFILE_READ_LIMIT: u64 = 4096;
/// The most read of `.gitmodules`, far more than any real one holds.
const GITMODULES_READ_LIMIT: u64 = 1024 * 1024;
/// The most read of all of a checkout's index files together.
const INDEX_READ_LIMIT: u64 = 64 * 1024 * 1024;
/// The longest path an index entry may hold before reading stops; git's own
/// limit on a path is this on most systems.
const INDEX_PATH_LIMIT: usize = 4096;
/// The most gitlinks read from the index.
const INDEX_GITLINK_LIMIT: usize = 10_000;

/// The first line, trimmed, of the one-line git metadata file at `path`,
/// such as `commondir` or `gitdir`, from at most [`GITFILE_READ_LIMIT`]
/// bytes of a regular file ([`read_regular_file`]).
fn read_first_line(path: &Path) -> Option<String> {
    let head = read_regular_file(path, GITFILE_READ_LIMIT)?;
    Some(
        String::from_utf8_lossy(&head)
            .lines()
            .next()
            .unwrap_or_default()
            .trim()
            .to_string(),
    )
}

/// At most `limit` bytes of the file at `path`, or `None` unless it is a
/// regular file reached without a symlink. Every file read here is in a
/// folder a sandboxed command may have written, every time a command is
/// wrapped, so a link to `/dev/zero`, a FIFO that never answers or an
/// endless file is refused or cut short rather than followed.
fn read_regular_file(path: &Path, limit: u64) -> Option<Vec<u8>> {
    read_regular(path, limit, false)
}

/// [`read_regular_file`], following symlinks to the file they name, which
/// is still read only when regular.
fn read_regular_file_through_links(path: &Path, limit: u64) -> Option<Vec<u8>> {
    read_regular(path, limit, true)
}

fn read_regular(path: &Path, limit: u64, follow_links: bool) -> Option<Vec<u8>> {
    use std::io::Read;

    let (file, _) = open_regular(path, follow_links).ok()?;
    let mut data = Vec::new();
    file.take(limit).read_to_end(&mut data).ok()?;
    Some(data)
}

/// Why [`open_regular`] did not hand a file back.
pub(crate) enum NotOpened {
    /// It could not be opened at all: it is not there, it is a link where
    /// none is followed, or the open was refused.
    Unopened,
    /// Something is there and it is not a regular file: a folder, a FIFO, a
    /// device, a socket.
    NotRegular { is_dir: bool },
}

/// The regular file at `path`, open for reading, with what it was when it
/// was opened. On Unix the file is opened without blocking, and without
/// following a link unless `follow_links`, and only then checked, so a FIFO
/// put in its place cannot hang the open. Elsewhere it is checked before it
/// is opened and again once it is.
pub(crate) fn open_regular(
    path: &Path,
    follow_links: bool,
) -> Result<(std::fs::File, std::fs::Metadata), NotOpened> {
    #[cfg(unix)]
    let file = {
        use std::os::unix::fs::OpenOptionsExt;
        let no_follow = if follow_links { 0 } else { libc::O_NOFOLLOW };
        std::fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NONBLOCK | no_follow)
            .open(path)
            .map_err(|_| NotOpened::Unopened)?
    };
    #[cfg(not(unix))]
    let file = {
        let found = if follow_links {
            std::fs::metadata(path)
        } else {
            std::fs::symlink_metadata(path)
        };
        let meta = found.map_err(|_| NotOpened::Unopened)?;
        if !meta.is_file() {
            return Err(NotOpened::NotRegular {
                is_dir: meta.is_dir(),
            });
        }
        std::fs::File::open(path).map_err(|_| NotOpened::Unopened)?
    };
    let meta = file.metadata().map_err(|_| NotOpened::Unopened)?;
    if !meta.is_file() {
        return Err(NotOpened::NotRegular {
            is_dir: meta.is_dir(),
        });
    }
    Ok((file, meta))
}

/// Whether the repository whose common git directory is `common_dir` names
/// its objects with SHA-256, which widens every index entry.
fn sha256_repository(common_dir: &Path) -> bool {
    let Some(config) =
        read_regular_file_through_links(&common_dir.join("config"), GITFILE_READ_LIMIT)
    else {
        return false;
    };
    String::from_utf8_lossy(&config).lines().any(|line| {
        line.split_once('=').is_some_and(|(key, value)| {
            key.trim().eq_ignore_ascii_case("objectformat")
                && value.trim().eq_ignore_ascii_case("sha256")
        })
    })
}

/// The paths of the gitlinks, mode `160000`, in a git index file of version
/// 2, 3 or 4 whose object names are `hash_len` bytes. Whatever cannot be read
/// ends the list there, and so does a path longer than [`INDEX_PATH_LIMIT`]
/// or a gitlink past [`INDEX_GITLINK_LIMIT`].
fn index_gitlinks(data: &[u8], hash_len: usize) -> Vec<String> {
    const GITLINK: u32 = 0o160000;
    let be32 = |at: usize| {
        data.get(at..at.checked_add(4)?)
            .map(|bytes| u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    };
    let mut found = Vec::new();
    if data.get(..4) != Some(b"DIRC".as_slice()) {
        return found;
    }
    let (Some(version), Some(count)) = (be32(4), be32(8)) else {
        return found;
    };
    let mut at = 12usize;
    let mut previous: Vec<u8> = Vec::new();
    for _ in 0..count {
        let Some(mode) = be32(at + 24) else { break };
        let flags_at = at + 40 + hash_len;
        let Some(flags) = data
            .get(flags_at..flags_at + 2)
            .map(|bytes| u16::from_be_bytes([bytes[0], bytes[1]]))
        else {
            break;
        };
        let mut name_at = flags_at + 2;
        if version >= 3 && flags & 0x4000 != 0 {
            name_at += 2;
        }
        let path = if version >= 4 {
            let Some((strip, used)) = data.get(name_at..).and_then(offset_varint) else {
                break;
            };
            let suffix_at = name_at + used;
            let Some(end) = data
                .get(suffix_at..)
                .and_then(|rest| rest.iter().position(|byte| *byte == 0))
            else {
                break;
            };
            let Some(keep) = previous.len().checked_sub(strip) else {
                break;
            };
            let mut path = previous[..keep].to_vec();
            path.extend_from_slice(&data[suffix_at..suffix_at + end]);
            at = suffix_at + end + 1;
            path
        } else {
            let Some(end) = data
                .get(name_at..)
                .and_then(|rest| rest.iter().position(|byte| *byte == 0))
            else {
                break;
            };
            let path = data[name_at..name_at + end].to_vec();
            at += (name_at - at + end + 8) & !7;
            path
        };
        if path.len() > INDEX_PATH_LIMIT {
            break;
        }
        if mode == GITLINK {
            if found.len() == INDEX_GITLINK_LIMIT {
                break;
            }
            found.push(String::from_utf8_lossy(&path).into_owned());
        }
        previous = path;
    }
    found
}

/// Git's variable-length offset encoding, as index version 4 prefixes each
/// path with: the value and how many bytes held it.
fn offset_varint(bytes: &[u8]) -> Option<(usize, usize)> {
    let mut used = 0;
    let mut byte = *bytes.get(used)?;
    used += 1;
    let mut value = usize::from(byte & 0x7f);
    while byte & 0x80 != 0 {
        byte = *bytes.get(used)?;
        used += 1;
        value = value
            .checked_add(1)?
            .checked_mul(128)?
            .checked_add(usize::from(byte & 0x7f))?;
    }
    Some((value, used))
}

/// The network rules of a Seatbelt profile. SBPL is last-match-wins, so each
/// denial follows the allow it narrows. A Unix-domain socket is addressed by
/// path, so a path filter on `network-outbound` matches only those; DNS stays
/// reachable through mDNSResponder's socket.
///
/// A program held to the internet may not listen: with every inbound
/// connection allowed it could open a port on `0.0.0.0` for the local network
/// to reach. What it keeps is a UDP socket of its own, which a program that
/// asks a name server directly, as `dig` and some runtimes' resolvers do,
/// has to bind before it can send. Checked with `sandbox-exec`: a TCP listener
/// on `0.0.0.0` or `127.0.0.1` is refused, and a name lookup, a UDP query to
/// a name server, `curl` and `git ls-remote` over HTTPS still work.
pub(crate) fn seatbelt_network_rules(policy: NetworkPolicy) -> &'static str {
    match policy {
        NetworkPolicy::Allow => "(allow network-outbound)\n(allow network-inbound)\n",
        NetworkPolicy::AllowExternal => concat!(
            "(allow network-outbound)\n",
            "(allow network-inbound (local udp \"*:*\"))\n",
            "(deny network-outbound (remote ip \"localhost:*\"))\n",
            "(deny network-outbound (subpath \"/\"))\n",
            "(allow network-outbound (literal \"/private/var/run/mDNSResponder\"))\n",
        ),
        NetworkPolicy::Deny => "",
    }
}

/// The Mach services a sandboxed shell, git, node or python may reach,
/// following Codex's Seatbelt policy. An unfiltered `mach-lookup` would also
/// reach LaunchServices and launchd, through which `open -a` or `launchctl
/// submit` starts a program outside the sandbox; none of these can.
/// - `opendirectoryd.libinfo` and `.membership`: user and group lookups
///   (`getpwuid`, `id`), which git, ssh, python and shell prompts make.
/// - `system.notification_center`: libc's `notify_*`, used for time zone and
///   DNS configuration changes.
/// - `system.logger`: `syslog(3)`.
/// - `PowerManagement.control`: power assertions, which Codex keeps.
/// - `cfprefsd.agent` and `.daemon`: CoreFoundation preferences, read by
///   anything linking Foundation, such as Apple's python and `xcrun`.
const MACH_SERVICES: [&str; 7] = [
    "com.apple.system.opendirectoryd.libinfo",
    "com.apple.system.opendirectoryd.membership",
    "com.apple.system.notification_center",
    "com.apple.system.logger",
    "com.apple.PowerManagement.control",
    "com.apple.cfprefsd.agent",
    "com.apple.cfprefsd.daemon",
];

/// Added when the program may use the network: DNS and proxy configuration,
/// the certificate trust evaluation TLS clients such as git and curl run, and
/// `bsd.dirhelper`, which resolves the per-user temporary and cache
/// directories (as Codex's `seatbelt_network_policy.sbpl` at 5733e00c79).
const NETWORK_MACH_SERVICES: [&str; 7] = [
    "com.apple.bsd.dirhelper",
    "com.apple.SystemConfiguration.configd",
    "com.apple.SystemConfiguration.DNSConfiguration",
    "com.apple.networkd",
    "com.apple.SecurityServer",
    "com.apple.trustd.agent",
    "com.apple.ocspd",
];

/// The `mach-lookup` allowlist every Seatbelt profile this crate writes uses.
pub(crate) fn mach_lookup_rule(network_policy: NetworkPolicy) -> String {
    let network: &[&str] = match network_policy {
        NetworkPolicy::Deny => &[],
        NetworkPolicy::AllowExternal | NetworkPolicy::Allow => &NETWORK_MACH_SERVICES,
    };
    let names: String = MACH_SERVICES
        .iter()
        .chain(network)
        .map(|name| format!("\n    (global-name \"{name}\")"))
        .collect();
    format!("(allow mach-lookup{names})\n")
}

/// Seatbelt denials keeping `protected` read-only. SBPL is last-match-wins,
/// so these follow every allow, and a path is named whether it exists yet or
/// not.
pub(crate) fn seatbelt_protection_rules(protected: &[PathBuf]) -> Result<String, String> {
    let mut rules = String::new();
    for path in protected {
        for spelling in write_denial_spellings(path) {
            let spelling = escape_resolved_seatbelt_path(path, &spelling)?;
            rules.push_str(&format!("(deny file-write* (subpath \"{spelling}\"))\n"));
        }
    }
    Ok(rules)
}

/// `text` as a Seatbelt regex matching exactly it, or with `any_case` it in
/// any case. Each character that means something to the regex is put in a
/// class of its own, and a caret, which a class would negate, and a
/// backslash are escaped. Seatbelt has no flag for ignoring case, so a
/// letter becomes a class of its two cases. A double quote means nothing to
/// the regex; [`seatbelt_regex`] escapes it, and the backslashes written
/// here, for the string the regex sits in.
fn seatbelt_regex_literal(text: &str, any_case: bool) -> String {
    let mut pattern = String::with_capacity(text.len() * 4);
    for character in text.chars() {
        match character {
            '^' => pattern.push_str("\\^"),
            '\\' => pattern.push_str("\\\\"),
            ']' => pattern.push_str("[]]"),
            '.' | '+' | '*' | '?' | '[' | '{' | '}' | '|' | '$' | '(' | ')' => {
                pattern.extend(['[', character, ']']);
            }
            letter if any_case && letter.is_ascii_alphabetic() => {
                pattern.extend([
                    '[',
                    letter.to_ascii_lowercase(),
                    letter.to_ascii_uppercase(),
                    ']',
                ]);
            }
            other => pattern.push(other),
        }
    }
    pattern
}

/// Seatbelt rules keeping the protected entries a sandbox names
/// ([`crate::protected_paths::named_project_entries`]) read-only below
/// `root`, a workspace's resolved path as it is, not yet escaped, in any
/// case. Seatbelt takes the last rule that matches, so the three layers
/// come in this order, and all of them come after the write allows and
/// before every other denial, so the allows in the middle give back nothing
/// but what the first layer took. Within a layer the entries share patterns
/// ([`alternations`]):
///
/// 1. Every entry is denied at any depth, as the approval gate matches them.
/// 2. An entry inside a dependency or build tree
///    ([`crate::protected_paths::DEPENDENCY_TREE_NAMES`]) is allowed again:
///    installing a package that ships one of these names must not fail, and
///    nothing loads them from there.
/// 3. Every entry of the workspace's own top folder is denied whatever lies
///    below it, a dependency tree's name included.
///
/// An entry of more than one segment, `.vscode/mcp.json`, also has creating
/// and removing its parent ruled the same three ways. Otherwise a program
/// could build `x/mcp.json` elsewhere and rename `x` to `.vscode`, touching
/// no path the first rule names. Writes inside a `.vscode` that exists stay
/// allowed. A parent other tools keep their own files in
/// ([`crate::protected_paths::SHARED_PARENT_FOLDERS`]) is ruled that way at
/// the top folder only, where the entry inside it is read from.
///
/// The folders loaded as trusted instructions that no protected entry holds
/// ([`crate::protected_paths::instruction_folders_outside_protected_entries`])
/// are ruled like an entry, so a sandboxed command is refused what the file
/// tools refuse.
///
/// One thing a path rule cannot stop below the top folder: a folder prepared
/// where these names are ordinary, in the scratch directory, a cache or a
/// dependency tree, and then renamed into the project under another name
/// carries them in below that name. It cannot be renamed onto a protected
/// name itself, so the top folder's entries stay out of reach.
pub(crate) fn seatbelt_project_entry_rules(root: &str) -> String {
    const WRITING: &str = "file-write*";
    const MAKING_OR_REMOVING: &str = "file-write-create file-write-unlink";

    let root = seatbelt_regex_literal(root, false);
    let trees = crate::protected_paths::DEPENDENCY_TREE_NAMES
        .iter()
        .map(|name| seatbelt_regex_literal(name, false))
        .collect::<Vec<_>>()
        .join("|");
    let mut entries: Vec<String> = Vec::new();
    let mut parents: Vec<String> = Vec::new();
    let mut parents_at_the_top_only: Vec<String> = Vec::new();
    let named = crate::protected_paths::named_project_entries()
        .chain(crate::protected_paths::instruction_folders_outside_protected_entries());
    for entry in named {
        let in_a_shared_parent = has_a_shared_parent(entry);
        let segments: Vec<String> = entry
            .split('/')
            .map(|segment| seatbelt_regex_literal(segment, true))
            .collect();
        entries.push(format!("{}(/.*)?", segments.join("/")));
        for kept in 1..segments.len() {
            let parent = segments[..kept].join("/");
            let held = if in_a_shared_parent && kept == 1 {
                &mut parents_at_the_top_only
            } else {
                &mut parents
            };
            if !held.contains(&parent) {
                held.push(parent);
            }
        }
    }
    let parents_at_the_top: Vec<String> = parents
        .iter()
        .chain(&parents_at_the_top_only)
        .cloned()
        .collect();

    let anywhere = format!("^{root}/(.*/)?");
    let in_a_tree = format!("^{root}/(.*/)?({trees})/(.*/)?");
    let at_the_top = format!("^{root}/");
    let layers: [(&str, &str, &[String], &[String]); 3] = [
        (
            "deny",
            anywhere.as_str(),
            entries.as_slice(),
            parents.as_slice(),
        ),
        (
            "allow",
            in_a_tree.as_str(),
            entries.as_slice(),
            parents.as_slice(),
        ),
        (
            "deny",
            at_the_top.as_str(),
            entries.as_slice(),
            parents_at_the_top.as_slice(),
        ),
    ];
    let mut rules = String::new();
    for (action, before, written, held) in layers {
        for (operations, names) in [(WRITING, written), (MAKING_OR_REMOVING, held)] {
            for alternatives in alternations(names, before) {
                let filter = seatbelt_regex(&format!("{before}{alternatives}$"));
                rules.push_str(&format!("({action} {operations} {filter})\n"));
            }
        }
    }
    rules
}

/// The most bytes one string of a profile is given. The reader `sandbox-exec`
/// uses refuses a profile holding a longer one, with `Error reading string`:
/// 1023 bytes were read and 1024 were not, on macOS 27, and fewer when the
/// string holds escapes. A pattern is kept well under that.
const SEATBELT_STRING_ROOM: usize = 900;

/// `names` as alternations, `(a|b|c)`, each short enough to stand in one
/// string after `before` and ahead of the `$` that ends the pattern. Every
/// regex in a profile is compiled when a program starts, at about a quarter
/// of a millisecond each, so some fifty names are ruled by a handful of
/// patterns and not by one apiece. A name too long to fit beside `before`
/// still gets a pattern of its own; a profile holding it is refused whole,
/// which stops the program and lets nothing through.
fn alternations(names: &[String], before: &str) -> Vec<String> {
    let around = seatbelt_string(before).len() + "()$".len();
    let room = SEATBELT_STRING_ROOM.saturating_sub(around);
    let mut groups = Vec::new();
    let mut group = String::new();
    for name in names {
        if !group.is_empty() && group.len() + "|".len() + name.len() > room {
            groups.push(format!("({group})"));
            group.clear();
        }
        if !group.is_empty() {
            group.push('|');
        }
        group.push_str(name);
    }
    if !group.is_empty() {
        groups.push(format!("({group})"));
    }
    groups
}

/// Where the rule that starts `head` and names `name` among its alternatives
/// is in `rules`, for a test to ask whether an entry is ruled without
/// depending on which pattern it shares with others.
#[cfg(all(test, unix))]
pub(crate) fn entry_rule(rules: &str, head: &str, name: &str) -> Option<usize> {
    let mut at = 0;
    for line in rules.split_inclusive('\n') {
        let names = line
            .strip_prefix(head)
            .filter(|rest| !rest.starts_with("(.*/)?"))
            .and_then(|rest| rest.strip_prefix('('))
            .and_then(|rest| rest.strip_suffix(")$\"))\n"));
        if names.is_some_and(|names| names.split('|').any(|listed| listed == name)) {
            return Some(at);
        }
        at += line.len();
    }
    None
}

fn first_segment(entry: &str) -> &str {
    entry.split('/').next().unwrap_or(entry)
}

/// Whether `entry` sits in a folder other tools keep their own files in.
fn has_a_shared_parent(entry: &str) -> bool {
    entry.contains('/')
        && crate::protected_paths::SHARED_PARENT_FOLDERS.contains(&first_segment(entry))
}

/// Whether `folder` is such a folder, by its name.
fn is_a_shared_parent(folder: &Path) -> bool {
    folder
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            crate::protected_paths::SHARED_PARENT_FOLDERS
                .iter()
                .any(|shared| shared.eq_ignore_ascii_case(name))
        })
}

/// What keeping one protected path read-only takes under bubblewrap.
enum Protection {
    /// Bind this existing path read-only: the path itself, or for a missing
    /// one its nearest existing ancestor below the writable root.
    Bind(PathBuf),
    /// Missing and outside every writable root: the program cannot create it.
    NotNeeded,
    /// Missing and directly in a writable root: nothing exists to bind over.
    Unprotected,
}

/// A missing path and the roots are compared with their symlinks resolved,
/// so one spelled through a link to the project, and one spelled without,
/// still land in the same root.
fn bubblewrap_protection(path: &Path, roots: &[PathBuf]) -> Protection {
    if std::fs::symlink_metadata(path).is_ok() {
        return Protection::Bind(path.to_path_buf());
    }
    let path = resolve_existing_prefix(path);
    let Some(root) = roots
        .iter()
        .map(|root| resolve_existing_prefix(root.as_path()))
        .find(|root| path.starts_with(root))
    else {
        return Protection::NotNeeded;
    };
    // A shared parent is never bound whole for a missing entry inside it:
    // that would take the folder away from every other tool that writes
    // there.
    path.ancestors()
        .skip(1)
        .take_while(|ancestor| *ancestor != root.as_path())
        .find(|ancestor| std::fs::symlink_metadata(ancestor).is_ok())
        .filter(|ancestor| !is_a_shared_parent(ancestor))
        .map_or(Protection::Unprotected, |ancestor| {
            Protection::Bind(ancestor.to_path_buf())
        })
}

/// The read-only binds that keep `protected` read-only over `roots`, and the
/// protected paths no bind can cover. Bubblewrap applies later mounts over
/// earlier ones, so these follow the writable binds. No placeholder is made
/// for an uncovered path: bubblewrap would create it on the host through the
/// writable bind, and an empty file where a loader expects JSON breaks it.
fn bubblewrap_protection_binds(
    protected: &[PathBuf],
    roots: &[PathBuf],
) -> Result<(Vec<String>, Vec<PathBuf>), String> {
    let mut binds: Vec<String> = Vec::with_capacity(protected.len() * 3);
    let mut unprotected = Vec::new();
    for path in protected {
        if !path.is_absolute() {
            return Err(format!("protected path must be absolute: {path:?}"));
        }
        let target = match bubblewrap_protection(path, roots) {
            Protection::Bind(target) => target,
            Protection::NotNeeded => continue,
            Protection::Unprotected => {
                unprotected.push(path.clone());
                continue;
            }
        };
        let target = target
            .to_str()
            .ok_or_else(|| format!("protected path is not valid UTF-8: {target:?}"))?
            .to_string();
        if binds.contains(&target) {
            continue;
        }
        binds.extend(["--ro-bind".to_string(), target.clone(), target]);
    }
    Ok((binds, unprotected))
}

/// How far below a workspace bubblewrap looks for protected entries.
const NESTED_ENTRY_DEPTH: usize = 3;
/// The most folders read while looking, nearest the workspace first.
const NESTED_ENTRY_FOLDERS: usize = 512;

/// What bubblewrap is asked to keep read-only for the protected entries of
/// `workspace` ([`crate::protected_paths::named_project_entries`]), which
/// Seatbelt names by rule ([`seatbelt_project_entry_rules`]).
///
/// Bubblewrap has no rule for a name: it can only bind a path that exists
/// over itself, read-only. So this is every entry of the workspace's own top
/// folder, where a missing one is reported by
/// [`bubblewrap_unprotected_paths`]; the parent of an entry of more than one
/// segment when it exists, bound whole, since a parent left writable could be
/// renamed away and rebuilt, unless other tools keep their files in it
/// ([`crate::protected_paths::SHARED_PARENT_FOLDERS`]), when it is held in
/// place by [`bubblewrap_shared_parents`] and only the entries inside it are
/// bound; and the entries that exist further down, found
/// nearest first within [`NESTED_ENTRY_DEPTH`] folders and
/// [`NESTED_ENTRY_FOLDERS`] reads. Git's own folder, which
/// [`git_metadata_paths`] covers, and dependency and build trees
/// ([`crate::protected_paths::DEPENDENCY_TREE_NAMES`]) are not looked into,
/// as the Seatbelt rules leave an entry inside one writable. What it cannot
/// cover: an entry that does not exist yet, an entry deeper or later than
/// those bounds, and on a volume that ignores case, no more than the
/// spelling that exists.
fn bubblewrap_project_entries(workspace: &Path) -> Vec<PathBuf> {
    let entries: Vec<&str> = crate::protected_paths::named_project_entries()
        .chain(crate::protected_paths::instruction_folders_outside_protected_entries())
        .collect();
    let mut paths = Vec::new();
    for entry in entries.iter().copied() {
        let parent = workspace.join(first_segment(entry));
        if entry.contains('/')
            && !has_a_shared_parent(entry)
            && std::fs::symlink_metadata(&parent).is_ok()
        {
            paths.push(parent);
        }
        paths.push(workspace.join(entry));
    }

    let mut nested = Vec::new();
    let mut folders = std::collections::VecDeque::from([(workspace.to_path_buf(), 0usize)]);
    let mut read = 0;
    while let Some((folder, depth)) = folders.pop_front() {
        if read == NESTED_ENTRY_FOLDERS {
            break;
        }
        read += 1;
        let Ok(children) = std::fs::read_dir(&folder) else {
            continue;
        };
        for child in children.flatten() {
            let name = child.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            if is_a_shared_parent(&child.path()) {
                if depth > 0 {
                    nested.extend(
                        entries
                            .iter()
                            .filter(|entry| has_a_shared_parent(entry))
                            .filter(|entry| first_segment(entry).eq_ignore_ascii_case(name))
                            .filter_map(|entry| entry.split_once('/'))
                            .map(|(_, inside)| child.path().join(inside))
                            .filter(|entry| std::fs::symlink_metadata(entry).is_ok()),
                    );
                }
                continue;
            }
            if entries
                .iter()
                .any(|entry| first_segment(entry).eq_ignore_ascii_case(name))
            {
                if depth > 0 {
                    nested.push(child.path());
                }
                continue;
            }
            if depth + 1 < NESTED_ENTRY_DEPTH
                && name != crate::protected_paths::GIT_METADATA_ENTRY
                && !crate::protected_paths::DEPENDENCY_TREE_NAMES.contains(&name)
                && child.file_type().is_ok_and(|kind| kind.is_dir())
            {
                folders.push_back((child.path(), depth + 1));
            }
        }
    }
    nested.sort();
    paths.extend(nested);
    paths
}

/// The shared parents at the top of `workspace` that exist and hold a
/// protected entry's place: each is bound over itself, writable, which makes
/// it a mount point that cannot be renamed away and rebuilt around an entry,
/// while everything else in it stays writable.
fn bubblewrap_shared_parents(workspace: &Path) -> Vec<PathBuf> {
    let mut parents: Vec<PathBuf> = Vec::new();
    let entries = crate::protected_paths::named_project_entries()
        .chain(crate::protected_paths::instruction_folders_outside_protected_entries());
    for entry in entries.filter(|entry| has_a_shared_parent(entry)) {
        let parent = workspace.join(first_segment(entry));
        let is_a_folder =
            std::fs::symlink_metadata(&parent).is_ok_and(|found| found.file_type().is_dir());
        if is_a_folder && !parents.contains(&parent) {
            parents.push(parent);
        }
    }
    parents
}

/// The protected paths of `spec` and, when it writes its workspace, that
/// workspace's protected entries ([`bubblewrap_project_entries`]).
fn bubblewrap_protected_paths(spec: &SandboxSpec<'_>, roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut protected = spec.protected_paths.to_vec();
    if roots.is_empty() {
        return protected;
    }
    for path in bubblewrap_project_entries(spec.workspace_dir) {
        if !protected.contains(&path) {
            protected.push(path);
        }
    }
    protected
}

/// Protected paths of `spec`, and protected entries of its workspace, that
/// bubblewrap cannot keep read-only: missing ones directly in a writable
/// root. Seatbelt names a path whether it exists or not, so this is empty
/// there.
pub fn bubblewrap_unprotected_paths(spec: &SandboxSpec<'_>) -> Result<Vec<PathBuf>, String> {
    let roots = named_roots(&writable_roots(spec)?);
    Ok(bubblewrap_protection_binds(&bubblewrap_protected_paths(spec, &roots), &roots)?.1)
}

/// The project files AGI surfaces read hooks, policy, commands, the worktree
/// setup script and MCP servers from, under `project`. A sandboxed command
/// that could rewrite them would choose what runs next, outside the sandbox.
pub fn project_config_paths(project: &Path) -> Vec<PathBuf> {
    crate::protected_paths::PROJECT_CONFIG_PATHS
        .iter()
        .map(|relative| project.join(relative))
        .collect()
}

/// Seatbelt reads of the git metadata of `roots`. A managed worktree's
/// checkout keeps its private and shared git directories outside itself, and
/// git run inside the sandbox cannot even read its own repository without
/// them. Reads only: the write denials still follow every write allow.
pub(crate) fn seatbelt_git_reads(roots: &[PathBuf]) -> Result<String, String> {
    let mut rules = String::new();
    let mut seen = HashSet::new();
    for root in roots {
        for path in git_metadata_paths(root) {
            let path = validate_and_escape_seatbelt_path(&path)?;
            if seen.insert(path.clone()) {
                rules.push_str(&format!("(allow file-read* (subpath \"{path}\"))\n"));
            }
        }
    }
    Ok(rules)
}

/// Every value of `key` in the sections of a git configuration file that
/// `in_section` accepts, in order. A section is named by its header's first
/// word, lower-cased, so `[includeIf "gitdir:~/work/"]` is `includeif`.
fn git_config_values(text: &str, in_section: impl Fn(&str) -> bool, key: &str) -> Vec<String> {
    let mut section = String::new();
    let mut found = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if let Some(header) = line.strip_prefix('[') {
            section = header
                .split(|c: char| c == ']' || c == '"' || c == '.' || c.is_whitespace())
                .next()
                .unwrap_or_default()
                .to_ascii_lowercase();
            continue;
        }
        if !in_section(&section) {
            continue;
        }
        let Some((name, value)) = line.split_once('=') else {
            continue;
        };
        if !name.trim().eq_ignore_ascii_case(key) {
            continue;
        }
        let comment = value
            .char_indices()
            .find(|&(at, c)| matches!(c, '#' | ';') && value[..at].ends_with(char::is_whitespace))
            .map_or(value.len(), |(at, _)| at);
        let value = value[..comment].trim();
        let value = value
            .strip_prefix('"')
            .and_then(|inner| inner.strip_suffix('"'))
            .unwrap_or(value);
        found.push(value.to_string());
    }
    found
}

/// The `core.excludesFile` a git configuration file sets, `~/` expanded
/// against `home`. Only an absolute result counts; includes are not followed.
fn git_excludes_file(text: &str, home: &Path) -> Option<PathBuf> {
    let found = git_config_values(text, |section| section == "core", "excludesfile")
        .pop()
        .filter(|value| !value.is_empty())?;
    let path = match found.strip_prefix("~/") {
        Some(rest) => home.join(rest),
        None => PathBuf::from(found),
    };
    path.is_absolute().then_some(path)
}

/// How deep [`git_include_targets`] follows the includes of included files.
const GIT_INCLUDE_DEPTH: usize = 4;
/// The most include targets [`git_include_targets`] names.
const GIT_INCLUDE_LIMIT: usize = 64;
/// The most read of one configuration file while following its includes.
const GIT_CONFIG_READ_LIMIT: u64 = 1024 * 1024;

/// The files the `include.path` and `includeIf.*.path` settings of the git
/// configuration file `including`, whose text is `text`, name, as git
/// resolves them: `~/` from `home`, and a relative path from the folder of
/// the including file. Every condition counts, since any could hold.
fn git_include_paths(text: &str, including: &Path, home: &Path) -> Vec<PathBuf> {
    let folder = including.parent().unwrap_or_else(|| Path::new("/"));
    git_config_values(
        text,
        |section| section == "include" || section == "includeif",
        "path",
    )
    .into_iter()
    .filter(|target| !target.is_empty())
    .map(|target| match target.strip_prefix("~/") {
        Some(rest) => home.join(rest),
        None => folder.join(target),
    })
    .collect()
}

/// Every file `configs` include, and the files those include, to
/// [`GIT_INCLUDE_DEPTH`] and at most [`GIT_INCLUDE_LIMIT`] of them. Host git
/// reads them as part of the user's global configuration, so one in a
/// writable root would let a sandboxed command choose what host git runs.
/// A relative include is resolved from the including file as spelled and as
/// it resolves, since a dotfile is often a link into a dotfiles repository.
/// Each file is read only when regular, since a sandboxed command may have
/// put a FIFO where an include points.
fn git_include_targets(configs: &[PathBuf], home: &Path) -> Vec<PathBuf> {
    let mut found: Vec<PathBuf> = Vec::new();
    let mut pending: Vec<(PathBuf, usize)> = configs.iter().map(|file| (file.clone(), 0)).collect();
    while let Some((file, depth)) = pending.pop() {
        let Some(text) = read_regular_file_through_links(&file, GIT_CONFIG_READ_LIMIT) else {
            continue;
        };
        let text = String::from_utf8_lossy(&text);
        let resolved = resolve_existing_prefix(&file);
        let mut targets = git_include_paths(&text, &file, home);
        if resolved != file {
            targets.extend(git_include_paths(&text, &resolved, home));
        }
        for target in targets {
            if found.contains(&target) || configs.contains(&target) {
                continue;
            }
            if found.len() == GIT_INCLUDE_LIMIT {
                return found;
            }
            found.push(target.clone());
            if depth + 1 < GIT_INCLUDE_DEPTH {
                pending.push((target, depth + 1));
            }
        }
    }
    found
}

/// The user's global git configuration a sandboxed git reads: `~/.gitconfig`,
/// the XDG `git` directory (`$XDG_CONFIG_HOME/git`, else `~/.config/git`),
/// the `core.excludesFile` either names, and every file either includes
/// ([`git_include_targets`]). Git treats an unreadable global configuration
/// as fatal, so a profile that confines reads must allow these, and keeps
/// them read-only like every other host configuration: host git reads them
/// too, outside the sandbox.
pub fn user_git_config_paths(home: &Path, xdg_config_home: Option<&Path>) -> Vec<PathBuf> {
    let gitconfig = home.join(".gitconfig");
    let xdg = xdg_config_home
        .filter(|dir| dir.is_absolute())
        .map_or_else(|| home.join(".config"), Path::to_path_buf)
        .join("git");
    let excludes = [xdg.join("config"), gitconfig.clone()]
        .iter()
        .filter_map(|file| read_regular_file_through_links(file, GIT_CONFIG_READ_LIMIT))
        .filter_map(|text| git_excludes_file(&String::from_utf8_lossy(&text), home))
        .next_back();
    let includes = git_include_targets(&[gitconfig.clone(), xdg.join("config")], home);
    let mut paths = vec![gitconfig, xdg];
    paths.extend(excludes);
    paths.extend(includes);
    paths
}

/// [`user_git_config_paths`] for this process's `HOME` and
/// `XDG_CONFIG_HOME`, plus the files `GIT_CONFIG_GLOBAL` and
/// `GIT_CONFIG_SYSTEM` name, which a sandboxed git inherits and reads just
/// as fatally. Only absolute paths count, and a device such as `/dev/null`
/// is left out, since denying writes there would break every program.
pub fn host_user_git_config_paths() -> Vec<PathBuf> {
    let absolute = |name: &str| {
        std::env::var_os(name)
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
    };
    let mut paths = match absolute("HOME") {
        Some(home) => user_git_config_paths(&home, absolute("XDG_CONFIG_HOME").as_deref()),
        None => Vec::new(),
    };
    for name in ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"] {
        let named = absolute(name).filter(|path| !path.starts_with("/dev"));
        if let Some(path) = named.filter(|path| !paths.contains(path)) {
            paths.push(path);
        }
    }
    paths
}

/// Each of `paths` as spelled and as resolved, since a dotfile is often a
/// link into a dotfiles repository, keeping only those a Seatbelt profile
/// can quote: an unquotable one is left out rather than refusing the command.
fn seatbelt_spellings(paths: &[PathBuf]) -> Vec<String> {
    let mut seen = HashSet::new();
    paths
        .iter()
        .flat_map(|path| write_denial_spellings(path))
        .filter_map(|path| escape_resolved_seatbelt_path(&path, &path).ok())
        .filter(|path| seen.insert(path.clone()))
        .collect()
}

/// Reads of the user's git configuration, for a profile that confines reads.
pub(crate) fn seatbelt_git_config_reads(config: &[PathBuf]) -> String {
    seatbelt_spellings(config)
        .iter()
        .map(|path| format!("(allow file-read* (subpath \"{path}\"))\n"))
        .collect()
}

/// Write denials keeping the user's git configuration read-only, even where
/// it lies under a writable root. They follow every write allow.
pub(crate) fn seatbelt_git_config_denials(config: &[PathBuf]) -> String {
    seatbelt_spellings(config)
        .iter()
        .map(|path| format!("(deny file-write* (subpath \"{path}\"))\n"))
        .collect()
}

/// The directories above `paths`, below `/`. Git resolves a linked
/// worktree's git directory with a component-by-component realpath, which
/// stats each one and fails on the first the sandbox hides, so each needs
/// its metadata readable, and nothing more.
pub(crate) fn ancestor_directories(paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut ancestors: Vec<PathBuf> = paths
        .iter()
        .flat_map(|path| path.ancestors().skip(1))
        .filter(|ancestor| ancestor.parent().is_some())
        .map(Path::to_path_buf)
        .collect();
    ancestors.sort();
    ancestors.dedup();
    ancestors
}

/// The developer directory a sandboxed program names as `DEVELOPER_DIR`, so
/// Apple's tool shims such as `/usr/bin/git` run the selected developer tools
/// without resolving the selection themselves: that reads the `/var` link and
/// writes a lookup cache into the per-user temporary directory, which
/// ignores TMPDIR and stays unwritable here. `None` when this process sets
/// `DEVELOPER_DIR` already, which the program inherits, or when no developer
/// tools are found: the selected folder when it exists, else the Command
/// Line Tools.
pub fn host_developer_dir() -> Option<String> {
    if std::env::var_os("DEVELOPER_DIR").is_some() {
        return None;
    }
    std::fs::read_link("/private/var/db/xcode_select_link")
        .ok()
        .filter(|dir| dir.is_absolute() && dir.is_dir())
        .or_else(|| {
            Some(PathBuf::from("/Library/Developer/CommandLineTools")).filter(|dir| dir.is_dir())
        })
        .and_then(|dir| dir.to_str().map(str::to_string))
}

/// Seatbelt reads Apple's tool shims need beyond the system paths: an Xcode
/// bundle the selection may name, and, when no `DEVELOPER_DIR` reaches the
/// program, the metadata of the `/var` link the shim resolves its selection
/// through. `/Library/Developer`, `/private/var/db/xcode_select_link` and
/// `/private/var/select` are system reads already.
///
/// The same link is read when the network is open: the resolver reaches its
/// configuration through it, and without its metadata no host name is found
/// while a literal address still connects. Only the link itself becomes
/// readable; nothing under `/var` does.
pub(crate) fn seatbelt_developer_tool_reads(network_policy: NetworkPolicy) -> String {
    let mut rules =
        String::from("(allow file-read* (regex #\"^/Applications/Xcode[^/]*\\.app(/|$)\"))\n");
    let mut reads_the_var_link = network_policy != NetworkPolicy::Deny;
    if std::env::var_os("DEVELOPER_DIR").is_none() && host_developer_dir().is_none() {
        reads_the_var_link = true;
    }
    if reads_the_var_link {
        rules.push_str("(allow file-read-metadata (literal \"/var\"))\n");
    }
    rules
}

/// The `file-read-metadata` rule for [`ancestor_directories`] of `paths`, or
/// nothing when there are none.
pub(crate) fn seatbelt_metadata_rule(paths: &[PathBuf]) -> String {
    let literals: Vec<String> = ancestor_directories(paths)
        .iter()
        .filter_map(|path| validate_and_escape_seatbelt_path(path).ok())
        .map(|path| format!("(literal \"{path}\")"))
        .collect();
    if literals.is_empty() {
        String::new()
    } else {
        format!("(allow file-read-metadata {})\n", literals.join(" "))
    }
}

/// The file at the top of `root` that maps each submodule to its folder and
/// its source. A sandboxed program has no reason to rewire submodules: it
/// cannot add or update one, since git's own metadata is read-only to it,
/// and a host that reads this file to find submodules would be told about
/// ones that are not there, or not told about ones that are.
fn submodule_map(root: &Path) -> PathBuf {
    root.canonicalize()
        .unwrap_or_else(|_| root.to_path_buf())
        .join(SUBMODULE_MAP_FILE)
}

/// The name git gives that file.
const SUBMODULE_MAP_FILE: &str = ".gitmodules";

/// Seatbelt denials keeping every writable root's git metadata and submodule
/// map read-only, each named as [`write_denial_spellings`] spells it, so a
/// `.git` that is a link cannot be swapped for a folder of the program's
/// own.
pub(crate) fn seatbelt_git_denials(roots: &[PathBuf]) -> Result<String, String> {
    let mut rules = String::new();
    for root in roots {
        let paths = git_metadata_paths(root)
            .into_iter()
            .chain(std::iter::once(submodule_map(root)));
        for path in paths {
            for spelling in write_denial_spellings(&path) {
                let spelling = escape_resolved_seatbelt_path(&path, &spelling)?;
                rules.push_str(&format!("(deny file-write* (subpath \"{spelling}\"))\n"));
            }
        }
    }
    Ok(rules)
}

/// The folders below `roots` that hold a git entry of their own, a submodule
/// or a linked worktree, and every folder between each and its root: the
/// names a sandboxed program may fill but not create, rename or remove.
///
/// Denying writes to `libs/sm/.git` stops a rewrite of that entry and nothing
/// else. `mv libs/sm aside && mv staged libs/sm` puts a folder with a `.git`
/// of the program's own under the name, and the user's next `git status`
/// there runs what its configuration says. The name is what has to hold, so
/// it and each name above it are pinned, as `.vscode` is for the entry
/// inside it. Everything inside stays writable.
pub(crate) fn nested_checkout_folders(roots: &[PathBuf]) -> Vec<PathBuf> {
    let mut folders = std::collections::BTreeSet::new();
    for root in roots {
        let top = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
        for entry in git_metadata_paths(root) {
            let names_a_checkout = entry
                .file_name()
                .is_some_and(|name| name == crate::protected_paths::GIT_METADATA_ENTRY);
            if !names_a_checkout {
                continue;
            }
            let above = entry
                .ancestors()
                .skip(1)
                .take_while(|folder| *folder != top && folder.starts_with(&top));
            folders.extend(above.map(Path::to_path_buf));
        }
    }
    folders.into_iter().collect()
}

/// Seatbelt denials keeping each of [`nested_checkout_folders`] where it is.
/// A folder that is a link is pinned under its own name as well as where it
/// leads ([`write_denial_spellings`]): Seatbelt checks an unlink against the
/// link's own path, so with only the target named the link could be removed
/// and a folder made in its place.
pub(crate) fn seatbelt_checkout_pins(roots: &[PathBuf]) -> Result<String, String> {
    let mut rules = String::new();
    let mut pinned = HashSet::new();
    for folder in nested_checkout_folders(roots) {
        for spelling in write_denial_spellings(&folder) {
            let spelling = escape_resolved_seatbelt_path(&folder, &spelling)?;
            if pinned.insert(spelling.clone()) {
                rules.push_str(&format!(
                    "(deny file-write-create file-write-unlink (literal \"{spelling}\"))\n"
                ));
            }
        }
    }
    Ok(rules)
}

/// The denial keeping a writable root, given as its Seatbelt spelling, where
/// it is. A `subpath` write allow covers the folder itself, so without it a
/// sandboxed program could remove or rename its root and leave a link in its
/// place. Only unlinking is denied: everything inside stays writable, and so
/// do the root's own mode and times.
pub(crate) fn seatbelt_root_pin(root: &str) -> String {
    format!("(deny file-write-unlink (literal \"{root}\"))\n")
}

/// Whether `root` lies inside another of `roots`, as spelled or as both
/// resolved when verified. Its own write allow is left out of a Seatbelt
/// profile: the outer allow already covers it, and the outer root's write
/// access could swap a folder on its path for a link that a separate allow
/// would then follow, after which only the spelling still shows it inside.
pub(crate) fn nested_in_another_root(root: &VerifiedRoot, roots: &[VerifiedRoot]) -> bool {
    let nested = roots.iter().any(|outer| {
        outer.resolved != root.resolved
            && (root.resolved.starts_with(&outer.resolved) || root.named.starts_with(&outer.named))
    });
    if nested {
        eprintln!(
            "[sandbox-policy] {} is inside another writable folder, which grants it",
            root.named.display()
        );
    }
    nested
}

/// A writable root as named, and where [`verify_writable_root`] found it
/// resolves. Every allow, pin and bind for the root uses `resolved`, so none
/// resolves the name again after it was verified.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedRoot {
    pub named: PathBuf,
    pub resolved: PathBuf,
}

/// The names of `roots`, for the rules that name a root's git metadata and
/// protected paths through it.
pub(crate) fn named_roots(roots: &[VerifiedRoot]) -> Vec<PathBuf> {
    roots.iter().map(|root| root.named.clone()).collect()
}

/// Where [`writable_roots`] puts the workspace: first, ahead of the roots
/// the policy adds, which are caches and extra folders rather than the
/// project whose protected entries a profile names.
pub(crate) const WORKSPACE_ROOT: usize = 0;

/// The writable roots of `spec`: the workspace and the policy's own, each
/// checked by [`verify_writable_root`] every time a sandbox is built.
pub fn writable_roots(spec: &SandboxSpec<'_>) -> Result<Vec<VerifiedRoot>, String> {
    let configured = match spec.policy {
        SandboxPolicy::ReadOnly => return Ok(Vec::new()),
        SandboxPolicy::WorkspaceWrite { writable_roots } => writable_roots,
        SandboxPolicy::DangerFullAccess => return Ok(Vec::new()),
    };

    let workspace_dir = spec.workspace_dir.to_path_buf();
    let mut roots = Vec::with_capacity(configured.len() + 1);
    let mut seen = HashSet::new();
    for root in std::iter::once(&workspace_dir).chain(configured.iter()) {
        if !root.is_absolute() {
            return Err(format!(
                "sandbox writable root must be absolute: {:?}",
                root
            ));
        }
        if is_filesystem_root(root) {
            return Err("sandbox writable root '/' is too broad".to_string());
        }
        let resolved = verify_writable_root(root)?;
        let named: PathBuf = root.components().collect();
        if seen.insert(named.clone()) {
            roots.push(VerifiedRoot { named, resolved });
        }
    }
    Ok(roots)
}

pub fn seatbelt_profile(
    spec: &SandboxSpec<'_>,
    scratch_dir: Option<&Path>,
) -> Result<String, String> {
    let ws = validate_and_escape_seatbelt_path(spec.workspace_dir)?;
    let network_rules = seatbelt_network_rules(spec.network_policy);
    let read_roots: Vec<PathBuf> = std::iter::once(spec.workspace_dir.to_path_buf())
        .chain(named_roots(&writable_roots(spec)?))
        .collect();
    let git_read_rules = seatbelt_git_reads(&read_roots)?;
    let git_config = host_user_git_config_paths();
    let git_config_read_rules = seatbelt_git_config_reads(&git_config);
    let metadata_rule = seatbelt_metadata_rule(
        &read_roots
            .iter()
            .flat_map(|root| {
                std::iter::once(root.clone())
                    .chain(std::iter::once(resolve_existing_prefix(root)))
                    .chain(git_metadata_paths(root))
            })
            .chain(
                git_config
                    .iter()
                    .flat_map(|path| [path.clone(), resolve_existing_prefix(path)]),
            )
            .collect::<Vec<_>>(),
    );

    let mut scratch_read_rules = String::new();
    let mut write_rules = String::from("(allow file-write* (literal \"/dev/null\"))\n");
    match spec.policy {
        // Both write policies get one private scratch directory rather than the
        // whole of /tmp: a blanket `/tmp` write let a sandboxed command reach
        // every other session's temporary files, and the tempfile crate,
        // mktemp, python and node all honour TMPDIR.
        SandboxPolicy::ReadOnly | SandboxPolicy::WorkspaceWrite { .. } => {
            let scratch_dir = scratch_dir.ok_or_else(|| {
                "Seatbelt execution requires a private scratch directory".to_string()
            })?;
            let scratch_dir =
                escape_resolved_seatbelt_path(scratch_dir, &verify_scratch_root(scratch_dir)?)?;
            scratch_read_rules
                .push_str(&format!("(allow file-read* (subpath \"{scratch_dir}\"))\n"));
            write_rules.push_str(&format!(
                "(allow file-write* (subpath \"{scratch_dir}\"))\n"
            ));
            let mut pins = seatbelt_root_pin(&scratch_dir);
            let roots = writable_roots(spec)?;
            let mut entry_rules = String::new();
            for (position, root) in roots.iter().enumerate() {
                let escaped = escape_resolved_seatbelt_path(&root.named, &root.resolved)?;
                pins.push_str(&seatbelt_root_pin(&escaped));
                if !nested_in_another_root(root, &roots) {
                    scratch_read_rules
                        .push_str(&format!("(allow file-read* (subpath \"{escaped}\"))\n"));
                    write_rules.push_str(&format!("(allow file-write* (subpath \"{escaped}\"))\n"));
                }
                if position == WORKSPACE_ROOT {
                    entry_rules = seatbelt_project_entry_rules(&root.resolved.to_string_lossy());
                }
            }
            pins.push_str(&seatbelt_checkout_pins(&named_roots(&roots))?);
            write_rules.push_str(&entry_rules);
            write_rules.push_str(&pins);
            write_rules.push_str(&seatbelt_git_denials(&named_roots(&roots))?);
            write_rules.push_str(&seatbelt_git_config_denials(&git_config));
            write_rules.push_str(&seatbelt_protection_rules(spec.protected_paths)?);
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
{mach_rules}(allow system-socket)
{network_rules}(allow file-read* (subpath "/usr") (subpath "/bin") (subpath "/sbin")
                   (subpath "/Library") (subpath "/System")
                   (subpath "/private/var/db") (subpath "/dev")
                   ;; macOS resolves `sh` through this symlink directory
                   ;; (/private/var/select/sh -> /bin/bash).
                   (subpath "/private/var/select")
                   ;; /etc is a link to /private/etc, and Seatbelt matches
                   ;; the resolved path.
                   (subpath "/etc") (subpath "/private/etc")
                   (literal "/") (subpath "/opt"))
(allow file-read* (subpath "{ws}"))
{developer_tool_reads}{git_read_rules}{git_config_read_rules}{metadata_rule}{scratch_read_rules}
{write_rules}"#,
        mach_rules = mach_lookup_rule(spec.network_policy),
        network_rules = network_rules,
        ws = ws,
        git_read_rules = git_read_rules,
        developer_tool_reads = seatbelt_developer_tool_reads(spec.network_policy),
        git_config_read_rules = git_config_read_rules,
        metadata_rule = metadata_rule,
        scratch_read_rules = scratch_read_rules,
        write_rules = write_rules,
    ))
}

pub fn bubblewrap_prefix(spec: &SandboxSpec<'_>) -> Result<Vec<String>, String> {
    bubblewrap_prefix_with_scope(spec, &[], BubblewrapReadScope::Workspace)
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum BubblewrapReadScope {
    Workspace,
    Full,
}

/// Bubblewrap mounts that hide each of `unreadable` that exists: an empty
/// tmpfs over a folder, `/dev/null` over a file. One that does not exist has
/// nothing to hide. They go before the writable binds, so a writable root
/// inside a hidden folder is bound back over it.
pub(crate) fn bubblewrap_read_masks(unreadable: &[PathBuf]) -> Result<Vec<String>, String> {
    let mut masks = Vec::new();
    let mut hidden = HashSet::new();
    for path in unreadable {
        let resolved = resolve_existing_prefix(path);
        let Ok(found) = std::fs::metadata(&resolved) else {
            continue;
        };
        if !hidden.insert(resolved.clone()) {
            continue;
        }
        let target = resolved
            .to_str()
            .ok_or_else(|| format!("credential path is not valid UTF-8: {resolved:?}"))?
            .to_string();
        if found.is_dir() {
            masks.extend(["--tmpfs".to_string(), target]);
        } else {
            masks.extend(["--ro-bind".to_string(), "/dev/null".to_string(), target]);
        }
    }
    Ok(masks)
}

/// [`bubblewrap_prefix`] for a program that must not read `unreadable`
/// either, such as a host's own folder of tokens.
///
/// Bubblewrap binds `/` read-only, so without masks a sandboxed program
/// reads everything the user can: a command given the network could send the
/// user's keys out. The credential locations of the home folder
/// ([`crate::full_read::credential_paths`]) are therefore hidden from every
/// program run this way, as the narrow Seatbelt profile keeps them out by
/// reading only what it names. What a mask cannot cover: a credential that
/// is not on that list or that a host did not name, one created after the
/// program started, and whatever the program's own environment holds.
pub fn bubblewrap_prefix_hiding(
    spec: &SandboxSpec<'_>,
    unreadable: &[PathBuf],
) -> Result<Vec<String>, String> {
    bubblewrap_prefix_with_scope(spec, unreadable, BubblewrapReadScope::Full)
}

fn bubblewrap_prefix_with_scope(
    spec: &SandboxSpec<'_>,
    unreadable: &[PathBuf],
    read_scope: BubblewrapReadScope,
) -> Result<Vec<String>, String> {
    if !spec.workspace_dir.is_absolute() {
        return Err(format!(
            "sandbox workspace must be absolute: {:?}",
            spec.workspace_dir
        ));
    }
    if is_filesystem_root(spec.workspace_dir) {
        return Err("sandbox workspace '/' is too broad".to_string());
    }

    // `--new-session` detaches the program from the terminal, so it cannot
    // push input into the parent's shell with the TIOCSTI ioctl.
    let mut args = vec![
        "--die-with-parent".to_string(),
        "--new-session".to_string(),
        "--unshare-pid".to_string(),
        "--unshare-uts".to_string(),
    ];
    if spec.network_policy == NetworkPolicy::Deny {
        args.push("--unshare-net".to_string());
    }
    if read_scope == BubblewrapReadScope::Full {
        args.extend(["--ro-bind".to_string(), "/".to_string(), "/".to_string()]);
    } else {
        for runtime in [
            "/usr",
            "/bin",
            "/sbin",
            "/lib",
            "/lib64",
            "/etc/ld.so.cache",
            "/etc/passwd",
            "/etc/group",
            "/etc/nsswitch.conf",
            "/etc/resolv.conf",
            "/etc/hosts",
            "/etc/ssl/certs",
            "/etc/pki/tls/certs",
        ] {
            if Path::new(runtime).exists() {
                args.extend([
                    "--ro-bind".to_string(),
                    runtime.to_string(),
                    runtime.to_string(),
                ]);
            }
        }
    }
    args.extend([
        "--setenv".to_string(),
        "TMPDIR".to_string(),
        "/tmp".to_string(),
        "--tmpfs".to_string(),
        "/tmp".to_string(),
        "--dev".to_string(),
        "/dev".to_string(),
        "--proc".to_string(),
        "/proc".to_string(),
    ]);
    let hidden: Vec<PathBuf> = dirs::home_dir()
        .map(|home| crate::full_read::credential_paths(&home))
        .unwrap_or_default()
        .into_iter()
        .chain(unreadable.iter().cloned())
        .collect();
    args.extend(bubblewrap_read_masks(&hidden)?);
    let workspace = resolve_existing_prefix(spec.workspace_dir);
    let workspace_hidden = hidden
        .iter()
        .any(|path| workspace.starts_with(resolve_existing_prefix(path)));
    if *spec.policy == SandboxPolicy::ReadOnly
        && (read_scope == BubblewrapReadScope::Workspace
            || spec.workspace_dir.starts_with(Path::new("/tmp"))
            || workspace_hidden)
    {
        let workspace = spec
            .workspace_dir
            .to_str()
            .ok_or_else(|| {
                format!(
                    "sandbox workspace is not valid UTF-8: {:?}",
                    spec.workspace_dir
                )
            })?
            .to_string();
        args.extend(["--ro-bind".to_string(), workspace.clone(), workspace]);
    }
    // Writable binds must follow the /tmp tmpfs mount. Otherwise a workspace
    // below /tmp is shadowed by the later scratch mount.
    let verified = writable_roots(spec)?;
    for root in &verified {
        let root = root
            .resolved
            .to_str()
            .ok_or_else(|| format!("sandbox writable root is not valid UTF-8: {:?}", root.named))?
            .to_string();
        args.extend(["--bind".to_string(), root.clone(), root]);
    }
    let roots = named_roots(&verified);
    // A folder that holds a nested checkout is bound over itself, writable:
    // that makes it a mount point, which cannot be renamed or removed, while
    // its contents stay writable. Parents come before children, and all of
    // them before the read-only binds below, which a later bind of the folder
    // around them would cover.
    for folder in nested_checkout_folders(&roots) {
        if !folder.is_dir() {
            continue;
        }
        let folder = folder
            .to_str()
            .ok_or_else(|| format!("checkout folder is not valid UTF-8: {:?}", folder))?
            .to_string();
        args.extend(["--bind".to_string(), folder.clone(), folder]);
    }
    if !roots.is_empty() {
        for parent in bubblewrap_shared_parents(spec.workspace_dir) {
            let parent = parent
                .to_str()
                .ok_or_else(|| format!("project folder is not valid UTF-8: {:?}", parent))?
                .to_string();
            args.extend(["--bind".to_string(), parent.clone(), parent]);
        }
    }
    // Later mounts win, so the git metadata goes back to read-only over the
    // writable binds. A bind needs its target to exist, so a `.git` that does
    // not exist yet stays creatable here. Host git must therefore never
    // discover a repository below a writable root after a sandboxed program
    // ran: it names the git directory it resolved first, as the worktree
    // crate's pinned `Workspace` does.
    for root in &roots {
        let paths = git_metadata_paths(root)
            .into_iter()
            .chain(std::iter::once(submodule_map(root)));
        for path in paths {
            if std::fs::symlink_metadata(&path).is_err() {
                continue;
            }
            let path = path
                .to_str()
                .ok_or_else(|| format!("git metadata path is not valid UTF-8: {:?}", path))?
                .to_string();
            args.extend(["--ro-bind".to_string(), path.clone(), path]);
        }
    }
    args.extend(bubblewrap_git_config_binds(
        &host_user_git_config_paths(),
        &roots,
    )?);
    args.extend(bubblewrap_protection_binds(&bubblewrap_protected_paths(spec, &roots), &roots)?.0);
    args.push("--".to_string());
    Ok(args)
}

/// Read-only binds for the user's git configuration that lies under a
/// writable root, such as a home directory made writable. `/` is bound
/// read-only already, so everywhere else it is readable and unwritable; a
/// bind needs an existing target, so a missing file is left out.
pub(crate) fn bubblewrap_git_config_binds(
    config: &[PathBuf],
    roots: &[PathBuf],
) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    let mut seen = HashSet::new();
    for path in config
        .iter()
        .flat_map(|path| [path.clone(), resolve_existing_prefix(path)])
    {
        if !roots.iter().any(|root| path.starts_with(root))
            || std::fs::symlink_metadata(&path).is_err()
            || !seen.insert(path.clone())
        {
            continue;
        }
        let path = path
            .to_str()
            .ok_or_else(|| format!("git config path is not valid UTF-8: {:?}", path))?
            .to_string();
        args.extend(["--ro-bind".to_string(), path.clone(), path]);
    }
    Ok(args)
}

/// What a program started under a Seatbelt profile is given in its
/// environment, whoever builds the command: `TMPDIR`, the private scratch
/// directory, and `DEVELOPER_DIR` when [`host_developer_dir`] finds one.
///
/// The scratch directory is named as it resolves. Apple's tool shims keep a
/// lookup cache in `TMPDIR`, and one spelled through the `/var` link cannot
/// be reached inside the sandbox, so the shim falls back to `/tmp`, cannot
/// write there either, and reports an error on every run. Without
/// `DEVELOPER_DIR` the shims `/usr/bin/git`, `make`, `python3` and `cc` do
/// not start at all when the selection link dangles.
pub fn seatbelt_environment(scratch_dir: &Path) -> Result<Vec<(&'static str, String)>, String> {
    let scratch = verify_scratch_root(scratch_dir)?;
    let scratch = scratch.to_str().ok_or_else(|| {
        format!(
            "sandbox scratch directory is not valid UTF-8: {:?}",
            scratch_dir
        )
    })?;
    let mut environment = vec![("TMPDIR", scratch.to_string())];
    environment.extend(host_developer_dir().map(|dir| ("DEVELOPER_DIR", dir)));
    Ok(environment)
}

/// Rewrite a program and its arguments so the sandbox backend launches it.
/// The program is exec'd directly, without a shell in between. Seatbelt needs
/// `scratch_dir`, which becomes the program's TMPDIR. The command is the
/// launcher's absolute path ([`crate::sandbox_launcher`]); without one this
/// fails rather than leave the launcher to a `PATH` lookup.
pub fn sandboxed_program(
    backend: SandboxBackend,
    spec: &SandboxSpec<'_>,
    scratch_dir: Option<&Path>,
    program: &str,
    args: &[String],
) -> Result<(String, Vec<String>), String> {
    let wrapped = sandboxed_args(backend, spec, scratch_dir, program, args)?;
    Ok((launcher_command(backend)?, wrapped))
}

/// The launcher's arguments for [`sandboxed_program`].
fn sandboxed_args(
    backend: SandboxBackend,
    spec: &SandboxSpec<'_>,
    scratch_dir: Option<&Path>,
    program: &str,
    args: &[String],
) -> Result<Vec<String>, String> {
    match backend {
        SandboxBackend::MacosSeatbelt => {
            let scratch_dir = scratch_dir.ok_or_else(|| {
                "Seatbelt execution requires a private scratch directory".to_string()
            })?;
            let mut wrapped = vec!["-p".to_string(), seatbelt_profile(spec, Some(scratch_dir))?];
            // The caller spawns this argv later, so the environment travels
            // through `env` rather than on a Command this function does not own.
            wrapped.push("/usr/bin/env".to_string());
            wrapped.extend(
                seatbelt_environment(scratch_dir)?
                    .into_iter()
                    .map(|(name, value)| format!("{name}={value}")),
            );
            wrapped.push(program.to_string());
            wrapped.extend(args.iter().cloned());
            Ok(wrapped)
        }
        SandboxBackend::LinuxBubblewrap => {
            let mut wrapped = bubblewrap_prefix(spec)?;
            wrapped.push(program.to_string());
            wrapped.extend(args.iter().cloned());
            Ok(wrapped)
        }
    }
}

// Seatbelt and bubblewrap exist only on Unix, and these tests spell Unix
// paths that are not absolute on Windows.
#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn ordinary_bubblewrap_reads_stay_scoped_and_full_reads_are_explicit() {
        let policy = SandboxPolicy::ReadOnly;
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/workspace/controlled-project"),
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let ordinary = bubblewrap_prefix(&spec).expect("ordinary workspace prefix");
        let full = bubblewrap_prefix_hiding(&spec, &[]).expect("explicit full-read prefix");
        let root_read = |args: &[String]| {
            args.windows(3)
                .any(|mount| mount == ["--ro-bind", "/", "/"])
        };
        assert!(!root_read(&ordinary));
        assert!(root_read(&full));
        assert!(ordinary.windows(3).any(|mount| {
            mount
                == [
                    "--ro-bind",
                    "/workspace/controlled-project",
                    "/workspace/controlled-project",
                ]
        }));
        assert!(ordinary.iter().any(|arg| arg == "--unshare-net"));
        assert!(ordinary
            .windows(2)
            .any(|mount| mount == ["--tmpfs", "/tmp"]));
    }

    #[test]
    fn ordinary_seatbelt_never_grants_the_shared_temporary_roots() {
        let policy = SandboxPolicy::ReadOnly;
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/workspace/controlled-project"),
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/owned-scratch")))
            .expect("confined command profile");
        assert!(!profile.contains("(subpath \"/tmp\")"));
        assert!(!profile.contains("(subpath \"/private/tmp\")"));
        assert!(!profile.contains("(allow file-read*)"));
        assert!(profile.contains("(subpath \"/private/tmp/owned-scratch\")"));
    }

    fn workspace_write() -> SandboxPolicy {
        SandboxPolicy::WorkspaceWrite {
            writable_roots: Vec::new(),
        }
    }

    #[test]
    fn seatbelt_wraps_program_with_profile_and_scratch_tmpdir() {
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/Users/someone/project"),
            network_policy: NetworkPolicy::Allow,
            protected_paths: &[],
        };
        let args = sandboxed_args(
            SandboxBackend::MacosSeatbelt,
            &spec,
            Some(Path::new("/private/tmp/agi-scratch")),
            "/usr/local/bin/node",
            &["server.js".to_string()],
        )
        .expect("wrap");
        assert_eq!(args[0], "-p");
        assert!(args[1].contains("(deny default)"));
        assert!(args[1].contains("(allow network-outbound)"));
        assert!(args[1].contains("(allow file-write* (subpath \"/Users/someone/project\"))"));
        let launched: Vec<&String> = args[2..]
            .iter()
            .filter(|arg| !arg.starts_with("DEVELOPER_DIR="))
            .collect();
        assert_eq!(
            launched,
            [
                "/usr/bin/env",
                "TMPDIR=/private/tmp/agi-scratch",
                "/usr/local/bin/node",
                "server.js"
            ]
        );
    }

    #[test]
    fn seatbelt_requires_a_scratch_dir() {
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/Users/someone/project"),
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        assert!(sandboxed_args(SandboxBackend::MacosSeatbelt, &spec, None, "node", &[]).is_err());
        assert!(
            sandboxed_program(SandboxBackend::MacosSeatbelt, &spec, None, "node", &[]).is_err()
        );
    }

    #[test]
    fn bubblewrap_wraps_program_and_binds_workspace() {
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/home/someone/project"),
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let args = sandboxed_args(
            SandboxBackend::LinuxBubblewrap,
            &spec,
            None,
            "node",
            &["server.js".to_string()],
        )
        .expect("wrap");
        assert!(args.contains(&"--unshare-net".to_string()));
        let bind = args.iter().position(|a| a == "--bind").expect("bind");
        let resolved = resolve_existing_prefix(Path::new("/home/someone/project"));
        assert_eq!(Path::new(&args[bind + 1]), resolved);
        assert_eq!(args[bind + 2], args[bind + 1]);
        assert_eq!(&args[args.len() - 3..], ["--", "node", "server.js"]);
    }

    #[test]
    fn the_launcher_is_an_absolute_path_or_the_wrap_fails() {
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/Users/someone/project"),
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        for backend in [
            SandboxBackend::MacosSeatbelt,
            SandboxBackend::LinuxBubblewrap,
        ] {
            let wrapped = sandboxed_program(
                backend,
                &spec,
                Some(Path::new("/private/tmp/agi-scratch")),
                "node",
                &[],
            );
            match crate::sandbox_launcher(backend) {
                Some(launcher) => {
                    let (command, _) = wrapped.expect("wrap");
                    assert!(Path::new(&command).is_absolute(), "{command}");
                    assert_eq!(Path::new(&command), launcher);
                }
                None => assert!(wrapped.is_err(), "{backend:?}"),
            }
        }
    }

    #[test]
    fn root_workspace_is_refused() {
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/"),
            network_policy: NetworkPolicy::Allow,
            protected_paths: &[],
        };
        assert!(bubblewrap_prefix(&spec).is_err());
        assert!(seatbelt_profile(&spec, Some(Path::new("/private/tmp/x"))).is_err());
    }

    fn scratch_tree(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "agi-sandbox-wrap-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir.canonicalize().unwrap()
    }

    #[test]
    fn a_linked_worktree_protects_its_git_file_and_both_git_directories() {
        let tree = scratch_tree("linked");
        let common = tree.join("repo/.git");
        let private = common.join("worktrees/feature");
        std::fs::create_dir_all(&private).unwrap();
        std::fs::write(private.join("commondir"), "../..\n").unwrap();
        let checkout = tree.join("checkout");
        std::fs::create_dir_all(&checkout).unwrap();
        std::fs::write(
            checkout.join(".git"),
            format!("gitdir: {}\n", private.display()),
        )
        .unwrap();

        assert_eq!(
            git_metadata_paths(&checkout),
            vec![checkout.join(".git"), private.clone(), common.clone()]
        );
        let plain = tree.join("plain");
        std::fs::create_dir_all(plain.join(".git")).unwrap();
        assert_eq!(git_metadata_paths(&plain), vec![plain.join(".git")]);
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn every_submodule_git_file_is_protected_from_gitmodules_and_from_the_index() {
        use std::process::Command;

        let repo = scratch_tree("submodules");
        let git = |args: &[&str]| {
            let output = Command::new("git")
                .current_dir(&repo)
                .args(args)
                .output()
                .expect("git");
            assert!(
                output.status.success(),
                "git {args:?}: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        };
        git(&["init", "-q", "-b", "main"]);
        git(&[
            "update-index",
            "--add",
            "--cacheinfo",
            "160000,1111111111111111111111111111111111111111,vendor/lib",
        ]);
        std::fs::write(
            repo.join(".gitmodules"),
            "[submodule \"theme\"]\n\tpath = docs/theme\n\turl = https://example.invalid/t\n\
             [submodule \"escape\"]\n\tpath = ../outside\n",
        )
        .unwrap();
        let expected = |paths: &[PathBuf]| {
            assert!(paths.contains(&repo.join("vendor/lib/.git")), "{paths:?}");
            assert!(paths.contains(&repo.join("docs/theme/.git")), "{paths:?}");
            assert!(
                !paths.iter().any(|path| path.ends_with("outside/.git")),
                "a path that leaves the checkout is not one git checks out: {paths:?}"
            );
        };
        expected(&git_metadata_paths(&repo));

        git(&["update-index", "--index-version", "4"]);
        git(&[
            "update-index",
            "--add",
            "--cacheinfo",
            "160000,2222222222222222222222222222222222222222,vendor/lid",
        ]);
        let paths = git_metadata_paths(&repo);
        expected(&paths);
        assert!(
            paths.contains(&repo.join("vendor/lid/.git")),
            "a version 4 index shares path prefixes: {paths:?}"
        );
        let _ = std::fs::remove_dir_all(&repo);
    }

    #[cfg(unix)]
    #[test]
    fn a_gitmodules_that_is_no_regular_file_is_never_read() {
        let repo = scratch_tree("gitmodules-special");
        std::fs::create_dir_all(repo.join(".git")).unwrap();
        let gitmodules = repo.join(".gitmodules");

        std::os::unix::fs::symlink("/dev/zero", &gitmodules).unwrap();
        let started = std::time::Instant::now();
        assert_eq!(git_metadata_paths(&repo), vec![repo.join(".git")]);
        assert!(started.elapsed() < std::time::Duration::from_secs(5));

        std::fs::remove_file(&gitmodules).unwrap();
        let made = std::process::Command::new("mkfifo")
            .arg(&gitmodules)
            .status()
            .unwrap();
        assert!(made.success());
        assert_eq!(
            git_metadata_paths(&repo),
            vec![repo.join(".git")],
            "a FIFO is skipped without being opened"
        );

        std::fs::remove_file(&gitmodules).unwrap();
        let mut text = "[submodule \"a\"]\n\tpath = near\n".to_string();
        text.push_str(&"#".repeat(GITMODULES_READ_LIMIT as usize));
        text.push_str("\n\tpath = far\n");
        std::fs::write(&gitmodules, text).unwrap();
        let paths = git_metadata_paths(&repo);
        assert!(paths.contains(&repo.join("near/.git")), "{paths:?}");
        assert!(!paths.contains(&repo.join("far/.git")), "{paths:?}");
        let _ = std::fs::remove_dir_all(&repo);
    }

    fn sha1_index(names: &[Vec<u8>]) -> Vec<u8> {
        let mut data = b"DIRC".to_vec();
        data.extend(2u32.to_be_bytes());
        data.extend((names.len() as u32).to_be_bytes());
        for name in names {
            let mut entry = vec![0u8; 62];
            entry[24..28].copy_from_slice(&0o160000u32.to_be_bytes());
            entry[60..62].copy_from_slice(&(name.len().min(0xfff) as u16).to_be_bytes());
            entry.extend_from_slice(name);
            entry.resize((62 + name.len() + 8) & !7, 0);
            data.extend(entry);
        }
        data
    }

    #[test]
    fn the_index_parser_stops_at_an_overlong_path_and_caps_gitlinks() {
        let names: Vec<Vec<u8>> = (0..INDEX_GITLINK_LIMIT + 5)
            .map(|n| format!("m{n}").into_bytes())
            .collect();
        let found = index_gitlinks(&sha1_index(&names), 20);
        assert_eq!(found.len(), INDEX_GITLINK_LIMIT);
        assert_eq!(found[0], "m0");

        let overlong = vec![
            b"first".to_vec(),
            vec![b'a'; INDEX_PATH_LIMIT + 1],
            b"after".to_vec(),
        ];
        assert_eq!(index_gitlinks(&sha1_index(&overlong), 20), vec!["first"]);
    }

    #[test]
    fn git_metadata_stays_read_only_inside_a_writable_workspace() {
        let workspace = scratch_tree("workspace");
        std::fs::create_dir_all(workspace.join(".git")).unwrap();
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let ws = workspace.to_str().unwrap();

        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        let allow = profile
            .find(&format!("(allow file-write* (subpath \"{ws}\"))"))
            .expect("workspace writable");
        let deny = profile
            .find(&format!("(deny file-write* (subpath \"{ws}/.git\"))"))
            .expect(".git denied");
        assert!(deny > allow, "the denial must come after the allow");

        let joined = bubblewrap_prefix(&spec).unwrap().join(" ");
        assert!(joined.contains(&format!(
            "--bind {ws} {ws} --ro-bind {ws}/.git {ws}/.git --"
        )));
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn a_managed_worktree_can_read_the_git_directories_kept_outside_it() {
        let tree = scratch_tree("managed-read");
        let common = tree.join("repo/.git");
        let private = common.join("worktrees/managed");
        std::fs::create_dir_all(&private).unwrap();
        std::fs::write(private.join("commondir"), "../..\n").unwrap();
        let checkout = tree.join("managed/checkout");
        std::fs::create_dir_all(&checkout).unwrap();
        std::fs::write(
            checkout.join(".git"),
            format!("gitdir: {}\n", private.display()),
        )
        .unwrap();
        for policy in [SandboxPolicy::ReadOnly, workspace_write()] {
            let spec = SandboxSpec {
                policy: &policy,
                workspace_dir: &checkout,
                network_policy: NetworkPolicy::Deny,
                protected_paths: &[],
            };
            let profile =
                seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
            for dir in [&private, &common] {
                let read = profile
                    .find(&format!(
                        "(allow file-read* (subpath \"{}\"))",
                        dir.display()
                    ))
                    .unwrap_or_else(|| panic!("{dir:?} not readable:\n{profile}"));
                if let Some(deny) = profile.find(&format!(
                    "(deny file-write* (subpath \"{}\"))",
                    dir.display()
                )) {
                    assert!(read < deny, "the write denial must stay last");
                }
            }
            if policy.permits_workspace_writes() {
                assert!(profile.contains(&format!(
                    "(deny file-write* (subpath \"{}\"))",
                    common.display()
                )));
            }
        }
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[cfg(unix)]
    #[test]
    fn a_missing_protected_path_under_a_symlinked_project_is_named_by_its_real_path() {
        let tree = scratch_tree("symlinked-project");
        let real = tree.join("real");
        std::fs::create_dir_all(&real).unwrap();
        let link = tree.join("link");
        std::os::unix::fs::symlink(&real, &link).unwrap();
        let protected = vec![link.join(".mcp.json"), link.join(".vscode/mcp.json")];
        let policy = workspace_write();
        let linked = SandboxSpec {
            policy: &policy,
            workspace_dir: &link,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &protected,
        };
        assert!(
            seatbelt_profile(&linked, Some(Path::new("/private/tmp/agi-scratch"))).is_err(),
            "a workspace that is itself a link is never granted"
        );
        let spec = SandboxSpec {
            workspace_dir: &real,
            ..linked
        };

        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        for name in [".mcp.json", ".vscode/mcp.json"] {
            assert!(
                profile.contains(&format!(
                    "(deny file-write* (subpath \"{}\"))",
                    real.join(name).display()
                )),
                "{name} is writable through the link:\n{profile}"
            );
        }

        let canonical_roots = [real.clone()];
        assert_eq!(
            bubblewrap_protection_binds(&protected, &canonical_roots)
                .unwrap()
                .1,
            protected,
            "a missing path spelled through the link still falls in the real root"
        );
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn every_writable_root_and_the_scratch_folder_is_pinned_in_place() {
        let tree = scratch_tree("pinned-roots");
        let workspace = tree.join("project");
        let cache = tree.join("cache");
        let scratch = tree.join("scratch");
        for dir in [&workspace, &cache, &scratch] {
            std::fs::create_dir_all(dir).unwrap();
        }
        let policy = SandboxPolicy::WorkspaceWrite {
            writable_roots: vec![cache.clone()],
        };
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let profile = seatbelt_profile(&spec, Some(&scratch)).unwrap();
        for root in [&workspace, &cache, &scratch] {
            let root = root.display();
            let allow = profile
                .find(&format!("(allow file-write* (subpath \"{root}\"))"))
                .unwrap_or_else(|| panic!("{root} not writable:\n{profile}"));
            let pin = profile
                .find(&format!("(deny file-write-unlink (literal \"{root}\"))"))
                .unwrap_or_else(|| panic!("{root} can be removed or renamed:\n{profile}"));
            assert!(pin > allow, "the pin must follow the allow");
        }
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn every_writable_root_stays_readable_without_the_shared_temporary_folders() {
        let tree = scratch_tree("readable-roots");
        let workspace = tree.join("project");
        let cache = tree.join("cache");
        let scratch = tree.join("scratch");
        for dir in [&workspace, &cache, &scratch] {
            std::fs::create_dir_all(dir).unwrap();
        }
        let policy = SandboxPolicy::WorkspaceWrite {
            writable_roots: vec![cache.clone()],
        };
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let profile = seatbelt_profile(&spec, Some(&scratch)).unwrap();
        for root in [&workspace, &cache, &scratch] {
            let root = root.display();
            assert!(
                profile.contains(&format!("(allow file-read* (subpath \"{root}\"))")),
                "{root} is writable but not readable:\n{profile}"
            );
        }
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn a_root_swapped_for_a_link_is_refused_at_the_next_build() {
        let tree = scratch_tree("swapped-root");
        let workspace = tree.join("project");
        let elsewhere = tree.join("elsewhere");
        let scratch = tree.join("scratch");
        for dir in [&workspace, &elsewhere, &scratch] {
            std::fs::create_dir_all(dir).unwrap();
        }
        crate::host_path::register_workspace_root(workspace.clone());
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        assert!(seatbelt_profile(&spec, Some(&scratch)).is_ok());

        std::fs::rename(&workspace, scratch.join("moved")).unwrap();
        std::os::unix::fs::symlink(&elsewhere, &workspace).unwrap();
        for result in [
            seatbelt_profile(&spec, Some(&scratch)).map(|_| ()),
            bubblewrap_prefix(&spec).map(|_| ()),
        ] {
            let error = result.expect_err("the swapped root is refused");
            assert!(
                error.contains("a writable folder changed since it was opened"),
                "{error}"
            );
        }

        let scratch_link = tree.join("scratch-link");
        std::os::unix::fs::symlink(&elsewhere, &scratch_link).unwrap();
        std::fs::remove_file(&workspace).unwrap();
        std::fs::create_dir_all(&workspace).unwrap();
        assert!(
            seatbelt_profile(&spec, Some(&scratch_link)).is_err(),
            "a scratch folder that is a link is refused"
        );
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn a_registered_root_whose_parent_was_swapped_is_refused() {
        let tree = scratch_tree("swapped-parent");
        let inner = tree.join("outer").join("inner");
        let decoy = tree.join("decoy").join("inner");
        std::fs::create_dir_all(&inner).unwrap();
        std::fs::create_dir_all(&decoy).unwrap();
        crate::host_path::add_sandbox_writable_roots([inner.clone()]);
        assert_eq!(crate::verify_writable_root(&inner).unwrap(), inner);

        std::fs::rename(tree.join("outer"), tree.join("moved")).unwrap();
        std::os::unix::fs::symlink(tree.join("decoy"), tree.join("outer")).unwrap();
        let error = crate::verify_writable_root(&inner).expect_err("the root moved");
        assert!(error.contains("changed since it was opened"), "{error}");
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn a_root_inside_another_root_gets_no_allow_of_its_own() {
        let tree = scratch_tree("nested-root");
        let workspace = tree.join("project");
        let nested = workspace.join("vendor").join("cache");
        std::fs::create_dir_all(&nested).unwrap();
        std::fs::create_dir_all(nested.join(".git")).unwrap();
        let policy = SandboxPolicy::WorkspaceWrite {
            writable_roots: vec![nested.clone()],
        };
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        let (ws, inner) = (workspace.display(), nested.display());
        assert!(profile.contains(&format!("(allow file-write* (subpath \"{ws}\"))")));
        assert!(!profile.contains(&format!("(allow file-write* (subpath \"{inner}\"))")));
        assert!(profile.contains(&format!("(deny file-write-unlink (literal \"{inner}\"))")));
        assert!(
            profile.contains(&format!("(deny file-write* (subpath \"{inner}/.git\"))")),
            "the nested root's git metadata stays denied:\n{profile}"
        );

        let elsewhere = tree.join("elsewhere");
        std::fs::create_dir_all(elsewhere.join("cache")).unwrap();
        std::fs::rename(workspace.join("vendor"), tree.join("moved")).unwrap();
        std::os::unix::fs::symlink(&elsewhere, workspace.join("vendor")).unwrap();
        let error = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch")))
            .expect_err(
                "a nested root swapped through its parent is not granted where it now points",
            );
        assert!(error.contains("changed since it was opened"), "{error}");

        let roots = [
            VerifiedRoot {
                named: workspace.clone(),
                resolved: workspace.clone(),
            },
            VerifiedRoot {
                named: nested.clone(),
                resolved: elsewhere.join("cache"),
            },
        ];
        assert!(
            nested_in_another_root(&roots[1], &roots),
            "a root spelled inside another is nested wherever it resolves"
        );
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn the_home_folder_is_never_a_verified_root() {
        let home = dirs::home_dir().expect("home dir");
        assert!(crate::verify_writable_root(&home).is_err());
        assert!(crate::verify_writable_root(Path::new("/")).is_err());
    }

    #[test]
    fn network_profiles_reach_the_directory_helper() {
        assert!(mach_lookup_rule(NetworkPolicy::AllowExternal)
            .contains("(global-name \"com.apple.bsd.dirhelper\")"));
        assert!(!mach_lookup_rule(NetworkPolicy::Deny).contains("dirhelper"));
    }

    #[test]
    fn a_git_directory_that_does_not_exist_yet_is_still_denied_on_seatbelt() {
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/Users/someone/project"),
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        assert!(profile.contains("(deny file-write* (subpath \"/Users/someone/project/.git\"))"));
    }

    #[test]
    fn external_network_refuses_local_sockets_and_keeps_dns() {
        let rules = seatbelt_network_rules(NetworkPolicy::AllowExternal);
        let loopback = rules
            .find("(deny network-outbound (remote ip \"localhost:*\"))")
            .expect("loopback denied");
        let sockets = rules
            .find("(deny network-outbound (subpath \"/\"))")
            .expect("unix sockets denied");
        let dns = rules
            .find("(allow network-outbound (literal \"/private/var/run/mDNSResponder\"))")
            .expect("dns kept");
        assert!(rules.find("(allow network-outbound)").unwrap() < loopback);
        assert!(
            sockets < dns,
            "DNS must be re-allowed after the socket denial"
        );
        assert!(!seatbelt_network_rules(NetworkPolicy::Allow).contains("deny"));
        assert!(seatbelt_network_rules(NetworkPolicy::Deny).is_empty());
    }

    #[test]
    fn the_narrow_profile_reads_etc_through_its_real_path() {
        let policy = SandboxPolicy::ReadOnly;
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/Users/someone/project"),
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        assert!(profile.contains("(subpath \"/private/etc\")"));
    }

    #[test]
    fn bubblewrap_detaches_from_the_terminal_and_refuses_any_spelling_of_root() {
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/home/someone/project"),
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        assert!(bubblewrap_prefix(&spec)
            .unwrap()
            .contains(&"--new-session".to_string()));

        let dotted = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/usr/.."),
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        assert!(bubblewrap_prefix(&dotted).is_err());
    }

    fn spelled(path: &str) -> Result<String, String> {
        escape_resolved_seatbelt_path(Path::new(path), Path::new(path))
    }

    #[test]
    fn a_quote_and_a_backslash_are_escaped_and_parentheses_are_left_as_they_are() {
        assert_eq!(spelled("/w/repo-main (1)").unwrap(), "/w/repo-main (1)");
        assert_eq!(spelled("/w/a\"b").unwrap(), "/w/a\\\"b");
        assert_eq!(spelled("/w/a\\b").unwrap(), "/w/a\\\\b");
        assert_eq!(spelled("/w/a)b(c").unwrap(), "/w/a)b(c");

        let hostile = spelled("/w/x\") (allow default) ;#").unwrap();
        assert_eq!(hostile, "/w/x\\\") (allow default) ;#");
        let closes_the_string = hostile
            .char_indices()
            .any(|(at, character)| character == '"' && !hostile[..at].ends_with('\\'));
        assert!(!closes_the_string, "{hostile}");

        for refused in [
            "/w/a\nb",
            "/w/a\u{0}b",
            "/w/a\u{2028}b",
            "/w/a\u{2029}b",
            "/w/a ",
        ] {
            assert!(spelled(refused).is_err(), "{refused:?}");
        }
    }

    #[test]
    fn a_regex_names_each_special_character_literally() {
        assert_eq!(
            seatbelt_regex_literal("a (b) \"c\" \\d", false),
            "a [(]b[)] \"c\" \\\\d"
        );
        assert_eq!(
            seatbelt_regex("^/w/a [(]b[)] \"c\" \\\\d/x$"),
            "(regex \"^/w/a [(]b[)] \\\"c\\\" \\\\\\\\d/x$\")"
        );
        assert_eq!(seatbelt_regex("^/w/j\\^k$"), "(regex \"^/w/j\\\\^k$\")");
    }

    #[test]
    fn a_workspace_whose_name_holds_all_four_characters_gets_a_profile() {
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/Users/someone/a (b) \"c\" \\d"),
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[PathBuf::from("/Users/someone/a (b) \"c\" \\d/.mcp.json")],
        };
        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        for rule in [
            "(allow file-read* (subpath \"/Users/someone/a (b) \\\"c\\\" \\\\d\"))",
            "(allow file-write* (subpath \"/Users/someone/a (b) \\\"c\\\" \\\\d\"))",
            "(deny file-write-unlink (literal \"/Users/someone/a (b) \\\"c\\\" \\\\d\"))",
            "(deny file-write* (subpath \"/Users/someone/a (b) \\\"c\\\" \\\\d/.mcp.json\"))",
        ] {
            assert!(profile.contains(rule), "missing {rule}\n{profile}");
        }
        for head in [
            "(deny file-write* (regex \"^/Users/someone/a [(]b[)] \\\"c\\\" \\\\\\\\d/(.*/)?",
            "(deny file-write* (regex \"^/Users/someone/a [(]b[)] \\\"c\\\" \\\\\\\\d/",
        ] {
            assert!(
                entry_rule(&profile, head, "[.][hH][uU][sS][kK][yY](/.*)?").is_some(),
                "missing {head}\n{profile}"
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn seatbelt_confines_a_folder_whose_name_holds_all_four_characters() {
        let tree = scratch_tree("special-characters-live");
        let workspace = tree.join("a (b) \"c\" \\d");
        let scratch = tree.join("scratch");
        for folder in [
            workspace.join(".husky"),
            tree.join("other"),
            scratch.clone(),
        ] {
            std::fs::create_dir_all(folder).unwrap();
        }
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let writes = |relative: &str| {
            let (sandbox, args) = sandboxed_program(
                SandboxBackend::MacosSeatbelt,
                &spec,
                Some(&scratch),
                "/usr/bin/touch",
                &[relative.to_string()],
            )
            .unwrap();
            let ran = std::process::Command::new(sandbox)
                .args(args)
                .current_dir(&workspace)
                .output()
                .expect("sandbox-exec");
            ran.status.success() && workspace.join(relative).exists()
        };

        assert!(writes("inside.txt"));
        assert!(!writes("../other/outside.txt"));
        assert!(!writes(".husky/pre-commit"));
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn the_narrow_profile_allows_only_listed_mach_services() {
        for policy in [SandboxPolicy::ReadOnly, workspace_write()] {
            let spec = SandboxSpec {
                policy: &policy,
                workspace_dir: Path::new("/Users/someone/project"),
                network_policy: NetworkPolicy::AllowExternal,
                protected_paths: &[],
            };
            let profile =
                seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
            assert!(!profile.contains("(allow mach-lookup)"), "{profile}");
            assert!(profile.contains("(global-name \"com.apple.system.opendirectoryd.libinfo\")"));
            assert!(!profile.contains("launchservicesd"));
        }
    }

    #[test]
    fn protected_paths_stay_read_only_in_the_narrow_profile() {
        let workspace = scratch_tree("narrow-protected");
        std::fs::create_dir_all(workspace.join(".agiworkforce")).unwrap();
        let protected = project_config_paths(&workspace);
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &protected,
        };
        let ws = workspace.to_str().unwrap();

        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        let allow = profile
            .find(&format!("(allow file-write* (subpath \"{ws}\"))"))
            .unwrap();
        for path in &protected {
            let deny = profile
                .find(&format!(
                    "(deny file-write* (subpath \"{}\"))",
                    path.display()
                ))
                .unwrap_or_else(|| panic!("{path:?} not denied"));
            assert!(deny > allow);
        }

        let joined = bubblewrap_prefix(&spec).unwrap().join(" ");
        assert!(joined.contains(&format!(
            "--bind {ws} {ws} --ro-bind {ws}/.agiworkforce {ws}/.agiworkforce --"
        )));
        let missing: Vec<PathBuf> = crate::protected_paths::named_project_entries()
            .chain(crate::protected_paths::instruction_folders_outside_protected_entries())
            .filter(|entry| *entry != ".agiworkforce")
            .map(|entry| workspace.join(entry))
            .collect();
        assert_eq!(missing.len(), 46);
        assert_eq!(bubblewrap_unprotected_paths(&spec).unwrap(), missing);
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn every_named_entry_is_denied_below_the_workspace_at_any_depth_and_in_any_case() {
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/Users/someone/project"),
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        let allow = profile
            .find("(allow file-write* (subpath \"/Users/someone/project\"))")
            .expect("workspace writable");
        for (operations, name) in [
            ("file-write*", "[.][mM][cC][pP][.][jJ][sS][oO][nN](/.*)?"),
            ("file-write*", "[mM][cC][pP][.][jJ][sS][oO][nN](/.*)?"),
            (
                "file-write*",
                "[.][aA][gG][iI][wW][oO][rR][kK][fF][oO][rR][cC][eE](/.*)?",
            ),
            (
                "file-write*",
                "[.][vV][sS][cC][oO][dD][eE]/[mM][cC][pP][.][jJ][sS][oO][nN](/.*)?",
            ),
            (
                "file-write-create file-write-unlink",
                "[.][vV][sS][cC][oO][dD][eE]",
            ),
            ("file-write*", "[.][hH][uU][sS][kK][yY](/.*)?"),
            ("file-write*", "[.][gG][iI][tT][hH][oO][oO][kK][sS](/.*)?"),
            (
                "file-write*",
                "[lL][eE][fF][tT][hH][oO][oO][kK][.][yY][mM][lL](/.*)?",
            ),
            (
                "file-write*",
                "[.][pP][rR][eE]-[cC][oO][mM][mM][iI][tT]-[cC][oO][nN][fF][iI][gG][.][yY][aA][mM][lL](/.*)?",
            ),
        ] {
            let head = format!("(deny {operations} (regex \"^/Users/someone/project/(.*/)?");
            let deny = entry_rule(&profile, &head, name)
                .unwrap_or_else(|| panic!("missing {name}\n{profile}"));
            assert!(deny > allow, "{name} must follow the allow");
        }
        let named = crate::protected_paths::named_project_entries()
            .chain(crate::protected_paths::instruction_folders_outside_protected_entries());
        for entry in named {
            let name = format!(
                "{}(/.*)?",
                entry
                    .split('/')
                    .map(|segment| seatbelt_regex_literal(segment, true))
                    .collect::<Vec<_>>()
                    .join("/")
            );
            for head in [
                "(deny file-write* (regex \"^/Users/someone/project/(.*/)?".to_string(),
                format!("(allow file-write* (regex \"^/Users/someone/project/(.*/)?{TREES}/(.*/)?"),
                "(deny file-write* (regex \"^/Users/someone/project/".to_string(),
            ] {
                assert!(
                    entry_rule(&profile, &head, &name).is_some(),
                    "{entry} is not ruled by {head}\n{profile}"
                );
            }
        }

        let read_only = SandboxSpec {
            policy: &SandboxPolicy::ReadOnly,
            ..spec
        };
        let profile =
            seatbelt_profile(&read_only, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        assert!(
            !profile.contains("[hH][uU][sS][kK][yY]"),
            "a workspace nothing may write needs no denial"
        );
    }

    #[test]
    fn a_workspace_path_is_matched_literally_whatever_it_holds() {
        assert_eq!(
            seatbelt_regex_literal("/Users/a.b/c+d [e]{f}|g*h?i$j^k", false),
            "/Users/a[.]b/c[+]d [[]e[]][{]f[}][|]g[*]h[?]i[$]j\\^k"
        );
        assert_eq!(
            seatbelt_regex_literal(".Mcp-1_x", true),
            "[.][mM][cC][pP]-1_[xX]"
        );
        let rules = seatbelt_project_entry_rules("/Users/a.b/work");
        assert!(entry_rule(
            &rules,
            "(deny file-write* (regex \"^/Users/a[.]b/work/(.*/)?",
            "[.][hH][uU][sS][kK][yY](/.*)?"
        )
        .is_some());
    }

    const TREES: &str = "(node_modules|site-packages|[.]venv|venv|vendor|target|[.]pnpm-store|[.]yarn|[.]cargo|[.]gradle|Pods|bower_components|[.]terraform|[.]build)";

    #[test]
    fn an_entry_is_denied_everywhere_allowed_in_a_dependency_tree_and_denied_at_the_top() {
        let rules = seatbelt_project_entry_rules("/w");
        let at = |head: String, name: &str| {
            entry_rule(&rules, &head, name)
                .unwrap_or_else(|| panic!("missing {name} after {head}\n{rules}"))
        };
        for (operations, name) in [
            ("file-write*", "[.][hH][uU][sS][kK][yY](/.*)?"),
            ("file-write*", "[.][mM][cC][pP][.][jJ][sS][oO][nN](/.*)?"),
            (
                "file-write*",
                "[.][pP][rR][eE]-[cC][oO][mM][mM][iI][tT]-[cC][oO][nN][fF][iI][gG][.][yY][aA][mM][lL](/.*)?",
            ),
            (
                "file-write*",
                "[.][vV][sS][cC][oO][dD][eE]/[mM][cC][pP][.][jJ][sS][oO][nN](/.*)?",
            ),
            (
                "file-write-create file-write-unlink",
                "[.][vV][sS][cC][oO][dD][eE]",
            ),
        ] {
            let anywhere = at(format!("(deny {operations} (regex \"^/w/(.*/)?"), name);
            let in_a_tree = at(
                format!("(allow {operations} (regex \"^/w/(.*/)?{TREES}/(.*/)?"),
                name,
            );
            let at_the_top = at(format!("(deny {operations} (regex \"^/w/"), name);
            assert!(
                anywhere < in_a_tree && in_a_tree < at_the_top,
                "{name}: the last rule that matches decides"
            );
        }
        assert!(
            !rules.contains("([.][gG][iI][tT](") && !rules.contains("|[.][gG][iI][tT]("),
            "git's own folder is named by path, not by this rule"
        );
    }

    #[test]
    fn the_entry_rules_share_patterns_that_each_fit_in_one_string() {
        let entries = crate::protected_paths::named_project_entries().count()
            + crate::protected_paths::instruction_folders_outside_protected_entries().count();
        let long_root = format!("/Users/someone/{}", "deep/".repeat(60));
        for root in [
            "/w",
            "/Users/someone/a (b) \"c\" \\d",
            long_root.trim_end_matches('/'),
        ] {
            let rules = seatbelt_project_entry_rules(root);
            assert!(
                rules.lines().count() < entries,
                "{} patterns for {entries} entries below {root}",
                rules.lines().count()
            );
            for rule in rules.lines() {
                let pattern = rule
                    .split_once("(regex \"")
                    .and_then(|(_, rest)| rest.strip_suffix("\"))"))
                    .unwrap_or_else(|| panic!("not a regex rule: {rule}"));
                assert!(
                    pattern.len() <= SEATBELT_STRING_ROOM,
                    "{} bytes in one string:\n{rule}",
                    pattern.len()
                );
            }
        }
        assert_eq!(
            alternations(&["a".repeat(500), "b".repeat(500), "c".to_string()], "^/w/"),
            [
                format!("({})", "a".repeat(500)),
                format!("({}|c)", "b".repeat(500))
            ],
            "a name that does not fit beside the last one starts a pattern of its own"
        );
        assert!(alternations(&[], "^/w/").is_empty());
    }

    #[test]
    fn an_entry_in_a_shared_folder_pins_that_folder_at_the_top_only() {
        let rules = seatbelt_project_entry_rules("/w");
        const CONFIG: &str = "[.][cC][oO][nN][fF][iI][gG]";
        const CLAUDE: &str = "[.][cC][lL][aA][uU][dD][eE]";
        const PIN: &str = "file-write-create file-write-unlink";
        let anywhere = |operations: &str| format!("(deny {operations} (regex \"^/w/(.*/)?");
        let in_a_tree =
            |operations: &str| format!("(allow {operations} (regex \"^/w/(.*/)?{TREES}/(.*/)?");
        let at_the_top = |operations: &str| format!("(deny {operations} (regex \"^/w/");
        for parent in [CONFIG, CLAUDE] {
            assert!(
                entry_rule(&rules, &at_the_top(PIN), parent).is_some(),
                "{parent} can be renamed away at the top folder\n{rules}"
            );
            assert!(
                entry_rule(&rules, &anywhere(PIN), parent).is_none(),
                "{parent} could not be made anywhere in the project"
            );
            assert!(entry_rule(&rules, &in_a_tree(PIN), parent).is_none());
        }
        let toml = format!("{CONFIG}/[lL][eE][fF][tT][hH][oO][oO][kK][.][tT][oO][mM][lL](/.*)?");
        let commands = format!("{CLAUDE}/[cC][oO][mM][mM][aA][nN][dD][sS](/.*)?");
        let local = "[lL][eE][fF][tT][hH][oO][oO][kK]-[lL][oO][cC][aA][lL][.][yY][mM][lL](/.*)?";
        for name in [toml.as_str(), commands.as_str(), local] {
            let denied = entry_rule(&rules, &anywhere("file-write*"), name)
                .unwrap_or_else(|| panic!("missing {name}\n{rules}"));
            let allowed = entry_rule(&rules, &in_a_tree("file-write*"), name)
                .unwrap_or_else(|| panic!("missing {name} in a tree\n{rules}"));
            let denied_at_the_top = entry_rule(&rules, &at_the_top("file-write*"), name)
                .unwrap_or_else(|| panic!("missing {name} at the top\n{rules}"));
            assert!(denied < allowed && allowed < denied_at_the_top);
        }
    }

    #[test]
    fn a_program_held_to_the_internet_may_not_listen() {
        let external = seatbelt_network_rules(NetworkPolicy::AllowExternal);
        assert!(
            !external.contains("(allow network-inbound)\n"),
            "every inbound connection is allowed, so a port can be opened to the local network"
        );
        assert!(external.contains("(allow network-inbound (local udp \"*:*\"))\n"));
        assert!(seatbelt_network_rules(NetworkPolicy::Allow).contains("(allow network-inbound)\n"));
    }

    #[cfg(unix)]
    #[test]
    fn a_nested_checkout_behind_a_link_is_pinned_under_both_names() {
        let workspace = scratch_tree("checkout-link-pins");
        std::fs::create_dir_all(workspace.join(".git")).unwrap();
        std::fs::create_dir_all(workspace.join("real/sm")).unwrap();
        std::fs::create_dir_all(workspace.join("libs")).unwrap();
        std::os::unix::fs::symlink("../real/sm", workspace.join("libs/sm")).unwrap();
        std::fs::write(
            workspace.join(".gitmodules"),
            "[submodule \"sm\"]\n\tpath = libs/sm\n",
        )
        .unwrap();
        let ws = workspace.to_str().unwrap();

        let pins = seatbelt_checkout_pins(std::slice::from_ref(&workspace)).unwrap();
        for folder in ["libs", "libs/sm", "real/sm"] {
            assert_eq!(
                pins.matches(&format!(
                    "(deny file-write-create file-write-unlink (literal \"{ws}/{folder}\"))\n"
                ))
                .count(),
                1,
                "{folder}:\n{pins}"
            );
        }
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn bubblewrap_leaves_a_shared_folder_writable_and_binds_the_entries_in_it() {
        let workspace = scratch_tree("shared-parents");
        std::fs::create_dir_all(workspace.join(".config")).unwrap();
        std::fs::write(workspace.join(".config/lefthook.toml"), "").unwrap();
        std::fs::write(workspace.join(".config/nextest.toml"), "").unwrap();
        std::fs::create_dir_all(workspace.join(".claude/commands")).unwrap();
        std::fs::create_dir_all(workspace.join("packages/app/.config")).unwrap();
        std::fs::write(workspace.join("packages/app/.config/lefthook.yml"), "").unwrap();
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let ws = workspace.to_str().unwrap();
        let joined = format!(" {} ", bubblewrap_prefix(&spec).unwrap().join(" "));

        for parent in [".config", ".claude"] {
            assert!(
                !joined.contains(&format!(" --ro-bind {ws}/{parent} {ws}/{parent} ")),
                "{parent} is read-only whole:\n{joined}"
            );
            assert!(
                joined.contains(&format!(" --bind {ws}/{parent} {ws}/{parent} ")),
                "{parent} can be renamed away:\n{joined}"
            );
        }
        assert!(
            !joined.contains(&format!(
                " --ro-bind {ws}/packages/app/.config {ws}/packages/app/.config "
            )),
            "a shared folder further down is read-only whole:\n{joined}"
        );
        for entry in [
            ".config/lefthook.toml",
            ".claude/commands",
            "packages/app/.config/lefthook.yml",
        ] {
            let read_only = joined
                .find(&format!(" --ro-bind {ws}/{entry} {ws}/{entry} "))
                .unwrap_or_else(|| panic!("{entry} is writable:\n{joined}"));
            assert!(
                joined
                    .find(&format!(" --bind {ws}/.config {ws}/.config "))
                    .unwrap()
                    < read_only,
                "a writable bind after the read-only ones would cover them"
            );
        }
        assert!(!joined.contains("nextest.toml"));
        let unprotected = bubblewrap_unprotected_paths(&spec).unwrap();
        assert!(unprotected.contains(&workspace.join(".config/lefthook.yml")));
        assert!(!unprotected.contains(&workspace.join(".config/lefthook.toml")));
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn the_entry_rules_come_before_every_other_denial() {
        let workspace = scratch_tree("entry-rule-order");
        std::fs::create_dir_all(workspace.join(".git")).unwrap();
        let protected = [workspace.join(".agiworkforce")];
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &protected,
        };
        let ws = workspace.to_str().unwrap();

        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        let last_allow = profile.rfind("(allow file-write").expect("an allow");
        for later in [
            format!("(deny file-write-unlink (literal \"{ws}\"))"),
            format!("(deny file-write* (subpath \"{ws}/.git\"))"),
            format!("(deny file-write* (subpath \"{ws}/.agiworkforce\"))"),
        ] {
            let denial = profile
                .find(&later)
                .unwrap_or_else(|| panic!("missing {later}\n{profile}"));
            assert!(
                denial > last_allow,
                "{later} must follow the dependency-tree allows, or a path through one would undo it"
            );
        }
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn seatbelt_denies_an_entry_at_the_top_and_below_it_and_allows_one_in_a_dependency_tree() {
        let tree = scratch_tree("entry-rules-live");
        let workspace = tree.join("project");
        let scratch = tree.join("scratch");
        for folder in [
            workspace.join(".husky"),
            workspace.join("packages/app"),
            workspace.join("node_modules/x"),
            workspace.join(".husky/node_modules"),
            scratch.clone(),
        ] {
            std::fs::create_dir_all(folder).unwrap();
        }
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let writes = |relative: &str| {
            let (sandbox, args) = sandboxed_program(
                SandboxBackend::MacosSeatbelt,
                &spec,
                Some(&scratch),
                "/usr/bin/touch",
                &[relative.to_string()],
            )
            .unwrap();
            let ran = std::process::Command::new(sandbox)
                .args(args)
                .current_dir(&workspace)
                .output()
                .expect("sandbox-exec");
            ran.status.success() && workspace.join(relative).exists()
        };

        assert!(writes("src.txt"), "the workspace itself is writable");
        assert!(!writes(".husky/pre-commit"));
        assert!(!writes("packages/app/.mcp.json"));
        assert!(writes("node_modules/x/.pre-commit-config.yaml"));
        assert!(
            !writes(".husky/node_modules/.pre-commit-config.yaml"),
            "a dependency tree's name below a top-level entry gives nothing back"
        );
        assert!(!writes(".MCP.JSON"));
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[cfg(unix)]
    #[test]
    fn a_protected_path_that_is_a_link_is_denied_as_the_link_and_as_its_target() {
        let workspace = scratch_tree("protected-link");
        std::fs::write(workspace.join("servers.json"), "{}").unwrap();
        std::os::unix::fs::symlink("servers.json", workspace.join(".mcp.json")).unwrap();
        std::os::unix::fs::symlink("later.json", workspace.join("mcp.json")).unwrap();
        let ws = workspace.to_str().unwrap();

        let rules = seatbelt_protection_rules(&[
            workspace.join(".mcp.json"),
            workspace.join("mcp.json"),
            workspace.join(".agiworkforce"),
        ])
        .unwrap();
        assert_eq!(
            rules.lines().collect::<Vec<_>>(),
            [
                format!("(deny file-write* (subpath \"{ws}/.mcp.json\"))"),
                format!("(deny file-write* (subpath \"{ws}/servers.json\"))"),
                format!("(deny file-write* (subpath \"{ws}/mcp.json\"))"),
                format!("(deny file-write* (subpath \"{ws}/later.json\"))"),
                format!("(deny file-write* (subpath \"{ws}/.agiworkforce\"))"),
            ]
        );
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn a_folder_that_holds_a_nested_checkout_cannot_be_swapped_for_another() {
        let workspace = scratch_tree("checkout-pins");
        std::fs::create_dir_all(workspace.join(".git")).unwrap();
        std::fs::create_dir_all(workspace.join("libs/sm")).unwrap();
        std::fs::write(
            workspace.join(".gitmodules"),
            "[submodule \"sm\"]\n\tpath = libs/sm\n[submodule \"tool\"]\n\tpath = vendor/deep/tool\n",
        )
        .unwrap();
        let roots = [workspace.clone()];
        let ws = workspace.to_str().unwrap();

        assert_eq!(
            nested_checkout_folders(&roots),
            [
                workspace.join("libs"),
                workspace.join("libs/sm"),
                workspace.join("vendor"),
                workspace.join("vendor/deep"),
                workspace.join("vendor/deep/tool"),
            ],
            "each folder with a git entry of its own, and every folder above it below the root"
        );
        assert!(
            !nested_checkout_folders(&roots).contains(&workspace),
            "the root has a pin of its own"
        );

        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        let last_allow = profile.rfind("(allow file-write").expect("an allow");
        let root_pin = profile
            .find(&format!("(deny file-write-unlink (literal \"{ws}\"))"))
            .expect("root pin");
        let git_denial = profile
            .find(&format!("(deny file-write* (subpath \"{ws}/.git\"))"))
            .expect("git denial");
        for folder in ["libs", "libs/sm", "vendor/deep/tool"] {
            let pin = profile
                .find(&format!(
                    "(deny file-write-create file-write-unlink (literal \"{ws}/{folder}\"))"
                ))
                .unwrap_or_else(|| panic!("{folder} can be renamed away:\n{profile}"));
            assert!(last_allow < root_pin && root_pin < pin && pin < git_denial);
        }

        let args = bubblewrap_prefix(&spec).unwrap();
        let joined = args.join(" ");
        let pinned = joined
            .find(&format!("--bind {ws}/libs/sm {ws}/libs/sm"))
            .expect("the folder is a mount point of its own");
        assert!(
            joined
                .find(&format!("--bind {ws}/libs {ws}/libs "))
                .expect("its parent too")
                < pinned
        );
        assert!(
            pinned
                < joined
                    .find(&format!("--ro-bind {ws}/.git {ws}/.git"))
                    .unwrap(),
            "a writable bind after the read-only ones would cover them"
        );
        assert!(
            !joined.contains(&format!("--bind {ws}/vendor")),
            "a folder that is not there has nothing to bind"
        );
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn seatbelt_refuses_to_swap_a_submodule_folder_and_still_writes_inside_it() {
        let tree = scratch_tree("checkout-pins-live");
        let workspace = tree.join("project");
        let scratch = tree.join("scratch");
        for folder in [
            workspace.join(".git"),
            workspace.join("libs/sm"),
            workspace.join("staged"),
            scratch.clone(),
        ] {
            std::fs::create_dir_all(folder).unwrap();
        }
        std::fs::write(
            workspace.join(".gitmodules"),
            "[submodule \"sm\"]\n\tpath = libs/sm\n",
        )
        .unwrap();
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let runs = |program: &str, arguments: &[&str]| {
            let arguments: Vec<String> = arguments.iter().map(|arg| arg.to_string()).collect();
            let (sandbox, args) = sandboxed_program(
                SandboxBackend::MacosSeatbelt,
                &spec,
                Some(&scratch),
                program,
                &arguments,
            )
            .unwrap();
            std::process::Command::new(sandbox)
                .args(args)
                .current_dir(&workspace)
                .output()
                .expect("sandbox-exec")
                .status
                .success()
        };

        assert!(runs("/usr/bin/touch", &["libs/sm/new.c"]));
        assert!(runs("/usr/bin/touch", &["libs/beside.txt"]));
        assert!(!runs("/bin/mv", &["libs/sm", "aside"]));
        assert!(!runs("/bin/mv", &["libs", "aside"]));
        assert!(!runs("/bin/rmdir", &["libs/sm"]));
        assert!(workspace.join("libs/sm/new.c").is_file());
        assert!(!workspace.join("aside").exists());
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn a_program_under_seatbelt_gets_a_resolved_scratch_folder_and_the_developer_directory() {
        let environment = seatbelt_environment(Path::new("/private/tmp/agi-scratch")).unwrap();
        assert_eq!(
            environment[0],
            ("TMPDIR", "/private/tmp/agi-scratch".to_string())
        );
        match host_developer_dir() {
            Some(dir) => assert_eq!(environment[1..], [("DEVELOPER_DIR", dir)]),
            None => assert_eq!(environment.len(), 1),
        }

        let linked = scratch_tree("environment-scratch");
        let spelled = std::env::temp_dir().join(linked.file_name().unwrap());
        let environment = seatbelt_environment(&spelled).unwrap();
        assert_eq!(
            environment[0].1,
            linked.to_str().unwrap(),
            "TMPDIR spelled through a link cannot be reached inside the sandbox"
        );
        let _ = std::fs::remove_dir_all(&linked);
    }

    #[test]
    fn bubblewrap_hides_what_it_is_told_to_and_the_home_credentials_before_binding_the_roots() {
        let tree = scratch_tree("shell-masks");
        let secrets = tree.join("tokens");
        let workspace = tree.join("workspace");
        let inside = secrets.join("project");
        for folder in [&secrets, &workspace, &inside] {
            std::fs::create_dir_all(folder).unwrap();
        }
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::AllowExternal,
            protected_paths: &[],
        };
        let joined = bubblewrap_prefix_hiding(&spec, std::slice::from_ref(&secrets))
            .unwrap()
            .join(" ");
        let mask = joined
            .find(&format!("--tmpfs {}", secrets.display()))
            .expect("the folder a host named is hidden from a shell command");
        assert!(mask < joined.find("--bind ").expect("the workspace is bound"));

        if let Some(home) = dirs::home_dir() {
            let ssh = home.join(".ssh");
            if ssh.is_dir() {
                assert!(
                    bubblewrap_prefix(&spec)
                        .unwrap()
                        .join(" ")
                        .contains(&format!(
                            "--tmpfs {}",
                            resolve_existing_prefix(&ssh).display()
                        )),
                    "a shell command given the network could read the user's keys"
                );
            }
        }

        let read_only = SandboxSpec {
            policy: &SandboxPolicy::ReadOnly,
            workspace_dir: &inside,
            ..spec
        };
        let joined = bubblewrap_prefix_hiding(&read_only, std::slice::from_ref(&secrets))
            .unwrap()
            .join(" ");
        let mask = joined
            .find(&format!("--tmpfs {}", secrets.display()))
            .unwrap();
        let shown_again = joined
            .find(&format!("--ro-bind {0} {0}", inside.display()))
            .expect("a workspace inside a hidden folder is still readable");
        assert!(mask < shown_again);
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn the_var_link_is_readable_when_the_network_is_open() {
        for (network_policy, opens) in [
            (NetworkPolicy::AllowExternal, true),
            (NetworkPolicy::Allow, true),
            (NetworkPolicy::Deny, false),
        ] {
            let rules = seatbelt_developer_tool_reads(network_policy);
            let named =
                std::env::var_os("DEVELOPER_DIR").is_some() || host_developer_dir().is_some();
            assert_eq!(
                rules.contains("(allow file-read-metadata (literal \"/var\"))\n"),
                opens || !named,
                "{network_policy:?}"
            );
            assert!(!rules.contains("(subpath \"/var\")"), "{rules}");
        }
    }

    #[cfg(unix)]
    #[test]
    fn the_submodule_map_is_read_only_and_a_link_to_a_device_denies_only_the_link() {
        let workspace = scratch_tree("submodule-map");
        let ws = workspace.to_str().unwrap();
        let roots = [workspace.clone()];

        let rules = seatbelt_git_denials(&roots).unwrap();
        assert!(
            rules.contains(&format!(
                "(deny file-write* (subpath \"{ws}/.gitmodules\"))"
            )),
            "a sandboxed command could rewire submodules:\n{rules}"
        );

        std::os::unix::fs::symlink("/dev/null", workspace.join(".gitmodules")).unwrap();
        let rules = seatbelt_git_denials(&roots).unwrap();
        assert!(rules.contains(&format!(
            "(deny file-write* (subpath \"{ws}/.gitmodules\"))"
        )));
        assert!(
            !rules.contains("\"/dev"),
            "writes to the null device were denied to every program:\n{rules}"
        );

        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        std::fs::remove_file(workspace.join(".gitmodules")).unwrap();
        std::fs::write(workspace.join(".gitmodules"), "").unwrap();
        let joined = bubblewrap_prefix(&spec).unwrap().join(" ");
        assert!(joined.contains(&format!("--ro-bind {ws}/.gitmodules {ws}/.gitmodules")));
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn bubblewrap_binds_the_entries_that_exist_and_reports_the_rest() {
        let workspace = scratch_tree("bubblewrap-entries");
        std::fs::create_dir_all(workspace.join(".husky")).unwrap();
        std::fs::create_dir_all(workspace.join(".vscode")).unwrap();
        std::fs::write(workspace.join(".vscode/mcp.json"), "{}").unwrap();
        std::fs::create_dir_all(workspace.join("packages/web/.husky")).unwrap();
        std::fs::write(workspace.join("packages/web/lefthook.yml"), "").unwrap();
        std::fs::create_dir_all(workspace.join("node_modules/pkg/.husky")).unwrap();
        std::fs::create_dir_all(workspace.join("a/b/c/d/.husky")).unwrap();
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let ws = workspace.to_str().unwrap();

        let args = bubblewrap_prefix(&spec).unwrap();
        let bound: Vec<&str> = args
            .windows(3)
            .filter(|window| window[0] == "--ro-bind" && window[1] == window[2] && window[1] != "/")
            .filter_map(|window| window[1].strip_prefix(ws))
            .collect();
        for expected in [
            "/.vscode",
            "/.vscode/mcp.json",
            "/.husky",
            "/packages/web/.husky",
            "/packages/web/lefthook.yml",
        ] {
            assert!(
                bound.contains(&expected),
                "{expected} is writable: {bound:?}"
            );
        }
        assert!(
            !bound
                .iter()
                .any(|path| path.starts_with("/node_modules") || path.starts_with("/a/")),
            "dependencies and folders past the depth bound are not walked: {bound:?}"
        );

        let unprotected = bubblewrap_unprotected_paths(&spec).unwrap();
        assert!(unprotected.contains(&workspace.join(".mcp.json")));
        assert!(unprotected.contains(&workspace.join(".pre-commit-config.yaml")));
        assert!(!unprotected.contains(&workspace.join(".husky")));
        assert!(!unprotected.contains(&workspace.join(".vscode/mcp.json")));

        let read_only = SandboxSpec {
            policy: &SandboxPolicy::ReadOnly,
            ..spec
        };
        assert!(bubblewrap_unprotected_paths(&read_only).unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn a_linked_worktree_checked_out_inside_the_root_keeps_its_git_file_read_only() {
        let repo = scratch_tree("nested-worktree");
        let common = repo.join(".git");
        let private = common.join("worktrees/feature");
        std::fs::create_dir_all(&private).unwrap();
        let checkout = repo.join(".agiworkforce/worktrees/feature");
        std::fs::create_dir_all(&checkout).unwrap();
        std::fs::write(
            private.join("gitdir"),
            format!("{}\n", checkout.join(".git").display()),
        )
        .unwrap();
        let outside = scratch_tree("outside-worktree");
        let elsewhere = common.join("worktrees/elsewhere");
        std::fs::create_dir_all(&elsewhere).unwrap();
        std::fs::write(
            elsewhere.join("gitdir"),
            format!("{}\n", outside.join(".git").display()),
        )
        .unwrap();

        assert_eq!(
            git_metadata_paths(&repo),
            vec![common.clone(), checkout.join(".git")]
        );
        let _ = std::fs::remove_dir_all(&repo);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn the_excludes_file_is_read_from_the_core_section_with_quotes_and_comments() {
        let home = Path::new("/Users/someone");
        assert_eq!(
            git_excludes_file(
                "[user]\n\texcludesFile = /nope\n[core]\n\texcludesfile = \"~/.gitignore_global\" # mine\n",
                home
            ),
            Some(PathBuf::from("/Users/someone/.gitignore_global"))
        );
        assert_eq!(
            git_excludes_file(
                "[core]\n\tExcludesFile = /etc/ignore ; set by setup\n",
                home
            ),
            Some(PathBuf::from("/etc/ignore"))
        );
        assert_eq!(
            git_excludes_file("[core]\n\texcludesFile = relative/ignore\n", home),
            None
        );
        assert_eq!(git_excludes_file("[core]\n\teditor = vim\n", home), None);
    }

    #[test]
    fn the_user_git_config_paths_name_the_global_file_the_xdg_folder_and_the_excludes_file() {
        let home = scratch_tree("git-config-home");
        std::fs::create_dir_all(home.join(".config/git")).unwrap();
        std::fs::write(
            home.join(".config/git/config"),
            "[core]\n\texcludesFile = ~/xdg-ignore\n",
        )
        .unwrap();
        std::fs::write(
            home.join(".gitconfig"),
            "[core]\n\texcludesFile = ~/global-ignore\n",
        )
        .unwrap();
        assert_eq!(
            user_git_config_paths(&home, None),
            vec![
                home.join(".gitconfig"),
                home.join(".config/git"),
                home.join("global-ignore"),
            ]
        );
        let xdg = scratch_tree("git-config-xdg");
        assert_eq!(
            user_git_config_paths(&home, Some(&xdg)),
            vec![
                home.join(".gitconfig"),
                xdg.join("git"),
                home.join("global-ignore"),
            ]
        );
        let _ = std::fs::remove_dir_all(&home);
        let _ = std::fs::remove_dir_all(&xdg);
    }

    #[test]
    fn files_the_global_git_config_includes_are_named_through_nested_includes() {
        let home = scratch_tree("git-config-includes");
        let work = home.join("work");
        std::fs::create_dir_all(&work).unwrap();
        std::fs::write(
            home.join(".gitconfig"),
            "[include]\n\tpath = ~/work/team.cfg\n\
             [includeIf \"gitdir:~/work/\"]\n\tpath = \"relative.cfg\" # per folder\n\
             [user]\n\tpath = not-an-include.cfg\n",
        )
        .unwrap();
        std::fs::write(work.join("team.cfg"), "[include]\n\tpath = nested.cfg\n").unwrap();
        std::fs::write(
            work.join("nested.cfg"),
            "[include]\n\tpath = ../deeper.cfg\n",
        )
        .unwrap();
        std::fs::create_dir_all(home.join(".config/git")).unwrap();
        std::fs::write(
            home.join(".config/git/config"),
            "[includeIf \"hasconfig:remote.*.url:https://example.com/**\"]\n\tpath = /etc/xdg.cfg\n",
        )
        .unwrap();

        let config = user_git_config_paths(&home, None);
        for included in [
            work.join("team.cfg"),
            home.join("relative.cfg"),
            work.join("nested.cfg"),
            work.join("../deeper.cfg"),
            PathBuf::from("/etc/xdg.cfg"),
        ] {
            assert!(config.contains(&included), "{included:?} in {config:?}");
        }
        assert!(!config.contains(&home.join("not-an-include.cfg")));

        let denials = seatbelt_git_config_denials(&config);
        assert!(
            denials.contains(&format!(
                "(deny file-write* (subpath \"{}\"))",
                work.join("team.cfg").display()
            )),
            "{denials}"
        );
        let binds = bubblewrap_git_config_binds(&config, std::slice::from_ref(&work))
            .unwrap()
            .join(" ");
        assert!(binds.contains(&format!(
            "--ro-bind {0} {0}",
            work.join("team.cfg").display()
        )));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[cfg(unix)]
    #[test]
    fn an_include_that_is_a_fifo_is_named_but_never_waited_on() {
        let home = scratch_tree("git-config-fifo");
        std::fs::write(
            home.join(".gitconfig"),
            "[include]\n\tpath = ~/planted.cfg\n",
        )
        .unwrap();
        let made = std::process::Command::new("mkfifo")
            .arg(home.join("planted.cfg"))
            .status()
            .unwrap();
        assert!(made.success());
        let started = std::time::Instant::now();
        let config = user_git_config_paths(&home, None);
        assert!(started.elapsed() < std::time::Duration::from_secs(5));
        assert!(config.contains(&home.join("planted.cfg")), "{config:?}");
        assert_eq!(
            read_regular_file_through_links(&home.join("planted.cfg"), GIT_CONFIG_READ_LIMIT),
            None
        );
        assert_eq!(
            read_regular_file(&home.join("planted.cfg"), GIT_CONFIG_READ_LIMIT),
            None,
            "a FIFO opened directly, as after a swap, returns at once"
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[cfg(unix)]
    #[test]
    fn git_config_is_readable_as_spelled_and_resolved_and_never_writable() {
        let home = scratch_tree("git-config-link");
        let dotfiles = home.join("dotfiles");
        std::fs::create_dir_all(&dotfiles).unwrap();
        std::fs::write(dotfiles.join("gitconfig"), "[user]\n\tname = x\n").unwrap();
        std::os::unix::fs::symlink(dotfiles.join("gitconfig"), home.join(".gitconfig")).unwrap();
        let config = user_git_config_paths(&home, None);

        let reads = seatbelt_git_config_reads(&config);
        let denials = seatbelt_git_config_denials(&config);
        for path in [
            home.join(".gitconfig"),
            dotfiles.join("gitconfig"),
            home.join(".config/git"),
        ] {
            let path = path.display();
            assert!(
                reads.contains(&format!("(allow file-read* (subpath \"{path}\"))")),
                "{path} not readable:\n{reads}"
            );
            assert!(
                denials.contains(&format!("(deny file-write* (subpath \"{path}\"))")),
                "{path} not write-denied:\n{denials}"
            );
        }
        assert!(!reads.contains("allow file-write"));

        let joined = bubblewrap_git_config_binds(&config, std::slice::from_ref(&home))
            .unwrap()
            .join(" ");
        assert!(joined.contains(&format!(
            "--ro-bind {0} {0}",
            home.join(".gitconfig").display()
        )));
        assert!(joined.contains(&format!(
            "--ro-bind {0} {0}",
            dotfiles.join("gitconfig").display()
        )));
        assert!(
            !joined.contains(".config/git"),
            "a bind needs an existing target"
        );
        assert!(
            bubblewrap_git_config_binds(&config, &[PathBuf::from("/elsewhere")])
                .unwrap()
                .is_empty()
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn the_narrow_profile_reads_the_users_git_config_and_keeps_it_write_denied() {
        let workspace = scratch_tree("profile-git-config");
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &workspace,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        let allow = profile
            .find(&format!(
                "(allow file-write* (subpath \"{}\"))",
                workspace.display()
            ))
            .expect("workspace writable");
        for path in seatbelt_spellings(&host_user_git_config_paths()) {
            assert!(
                profile.contains(&format!("(allow file-read* (subpath \"{path}\"))")),
                "{path} not readable:\n{profile}"
            );
            let deny = profile
                .find(&format!("(deny file-write* (subpath \"{path}\"))"))
                .unwrap_or_else(|| panic!("{path} not write-denied:\n{profile}"));
            assert!(deny > allow, "the denial must follow the write allows");
        }
        let _ = std::fs::remove_dir_all(&workspace);
    }

    #[test]
    fn ancestors_of_roots_and_git_metadata_get_metadata_reads_only() {
        let tree = scratch_tree("metadata");
        let common = tree.join("repo/.git");
        let private = common.join("worktrees/feature");
        std::fs::create_dir_all(&private).unwrap();
        std::fs::write(private.join("commondir"), "../..\n").unwrap();
        let checkout = tree.join("checkouts/feature");
        std::fs::create_dir_all(&checkout).unwrap();
        std::fs::write(
            checkout.join(".git"),
            format!("gitdir: {}\n", private.display()),
        )
        .unwrap();
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: &checkout,
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };

        let profile = seatbelt_profile(&spec, Some(Path::new("/private/tmp/agi-scratch"))).unwrap();
        let rule = profile
            .lines()
            .find(|line| line.starts_with("(allow file-read-metadata "))
            .unwrap_or_else(|| panic!("no metadata rule:\n{profile}"));
        for ancestor in [
            tree.clone(),
            tree.join("checkouts"),
            tree.join("repo"),
            common.join("worktrees"),
        ] {
            assert!(
                rule.contains(&format!("(literal \"{}\")", ancestor.display())),
                "{ancestor:?} missing from {rule}"
            );
        }
        assert!(!rule.contains("(literal \"/\")"));
        assert!(!profile.contains(&format!(
            "(allow file-read* (subpath \"{}\"))",
            tree.join("checkouts").display()
        )));
        assert_eq!(
            ancestor_directories(&[PathBuf::from("/a/b/c"), PathBuf::from("/a/d")]),
            vec![PathBuf::from("/a"), PathBuf::from("/a/b")]
        );
        let _ = std::fs::remove_dir_all(&tree);
    }

    /// Git inside the real narrow profile, in a repository and in one of its
    /// linked worktrees, reading the user's own configuration.
    #[cfg(target_os = "macos")]
    #[test]
    fn git_status_runs_inside_the_narrow_profile_in_a_linked_worktree() {
        use std::process::Command;

        let tree = scratch_tree("sandboxed-git");
        let repo = tree.join("repo");
        let worktree = tree.join("feature");
        std::fs::create_dir_all(&repo).unwrap();
        let host_git = |dir: &Path, args: &[&str]| {
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
        };
        host_git(&repo, &["init", "-q", "-b", "main"]);
        host_git(
            &repo,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "-q",
                "--allow-empty",
                "-m",
                "init",
            ],
        );
        host_git(
            &repo,
            &["worktree", "add", "-q", worktree.to_str().unwrap()],
        );
        let scratch = tree.join("scratch");
        std::fs::create_dir_all(&scratch).unwrap();
        // `/usr/bin/git` is Apple's `xcrun` shim, which needs more than git
        // does; the binary it would run sits in git's own exec path.
        let exec_path = Command::new("git").arg("--exec-path").output().unwrap();
        let git = PathBuf::from(String::from_utf8_lossy(&exec_path.stdout).trim()).join("git");

        for workspace in [&repo, &worktree] {
            let policy = workspace_write();
            let spec = SandboxSpec {
                policy: &policy,
                workspace_dir: workspace,
                network_policy: NetworkPolicy::Deny,
                protected_paths: &[],
            };
            for program in ["/usr/bin/git", git.to_str().unwrap()] {
                for command in [&["--version"][..], &["status", "--short"][..]] {
                    let command: Vec<String> = command.iter().map(|arg| arg.to_string()).collect();
                    let (sandbox, args) = sandboxed_program(
                        SandboxBackend::MacosSeatbelt,
                        &spec,
                        Some(&scratch),
                        program,
                        &command,
                    )
                    .unwrap();
                    let output = Command::new(sandbox)
                        .args(args)
                        .current_dir(workspace)
                        .output()
                        .expect("sandbox-exec");
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    assert!(
                        output.status.success(),
                        "{program} {command:?} in {}: {stderr}",
                        workspace.display()
                    );
                    if command == ["--version"] {
                        assert!(stdout.starts_with("git version"), "{stdout}");
                    }
                    assert!(
                        !stderr.contains("xcrun_db"),
                        "the tool shim could not keep its lookup cache in TMPDIR: {stderr}"
                    );
                }
            }
        }
        let _ = std::fs::remove_dir_all(&tree);
    }

    #[test]
    fn apples_tool_shims_get_the_developer_directory_and_xcode_reads() {
        let policy = workspace_write();
        let spec = SandboxSpec {
            policy: &policy,
            workspace_dir: Path::new("/Users/someone/project"),
            network_policy: NetworkPolicy::Deny,
            protected_paths: &[],
        };
        let args = sandboxed_args(
            SandboxBackend::MacosSeatbelt,
            &spec,
            Some(Path::new("/private/tmp/agi-scratch")),
            "/usr/bin/git",
            &["--version".to_string()],
        )
        .unwrap();
        assert!(args[1]
            .contains("(allow file-read* (regex #\"^/Applications/Xcode[^/]*\\.app(/|$)\"))"));
        assert!(args[1].contains("(subpath \"/Library\")"));
        assert!(args[1].contains("(subpath \"/private/var/db\")"));
        assert!(args[1].contains("(subpath \"/private/var/select\")"));
        assert!(args.contains(&"TMPDIR=/private/tmp/agi-scratch".to_string()));
        match host_developer_dir() {
            Some(dir) => {
                assert!(args.contains(&format!("DEVELOPER_DIR={dir}")));
                assert!(!args[1].contains("(literal \"/var\")"));
            }
            None => assert!(!args.iter().any(|arg| arg.starts_with("DEVELOPER_DIR="))),
        }
        let developer_dir = args
            .iter()
            .position(|arg| arg.starts_with("DEVELOPER_DIR="));
        let program = args.iter().position(|arg| arg == "/usr/bin/git").unwrap();
        assert!(developer_dir.is_none_or(|at| at < program));
    }
}
