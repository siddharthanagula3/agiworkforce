use std::collections::BTreeSet;
use std::fmt;
use std::path::{Path, PathBuf};
use std::process::Command;

use agiworkforce_protocol::code_domain::{
    redact_remote_credentials, ChangeKind, CodeEnvironment, ContainerState, CredentialRef,
    CredentialSource, DiscoveredBinary, ExecutionLocation, NetworkCapability, Repository,
    RepositoryChange, RepositoryId, RepositoryPolicy, RepositoryRemote, RepositorySnapshot,
    ShellInfo,
};
use chrono::{DateTime, Utc};

use crate::safety::network_target::{is_internal_host, INTERNAL_HOST_NAMES};
use crate::sandbox::NetworkPolicy;

/// System context about the current working directory and environment.
#[derive(Debug, Clone)]
pub struct SystemContext {
    pub cwd: String,
    pub git_branch: Option<String>,
    pub git_status_summary: Option<String>,
    pub git_remote_url: Option<String>,
    pub project_type: Option<String>,
    pub project_language: Option<String>,
    pub ci_providers: Vec<String>,
    pub monorepo_type: Option<String>,
    pub package_manager: Option<String>,
    pub containerization: Vec<String>,
    pub editor_configs: Vec<String>,
    pub os: String,
    pub shell: String,
}

/// Gather system context about the current working directory.
pub fn gather_system_context() -> SystemContext {
    let cwd = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "unknown".to_string());

    let layout = crate::repo::detect_repository_layout(Path::new(&cwd));
    let git_branch = layout
        .as_ref()
        .map(|layout| layout.head.to_string())
        .or_else(detect_git_branch);
    let git_status_summary = if layout.as_ref().is_some_and(|layout| layout.bare) {
        Some("bare repository".to_string())
    } else {
        detect_git_status_summary()
    };
    let git_remote_url = layout
        .as_ref()
        .and_then(|layout| layout.default_remote_url().map(str::to_string));
    let project_type = detect_project_type(&cwd);
    let project_language = detect_project_language(&cwd);
    let ci_providers = detect_ci_providers(&cwd);
    let monorepo_type = describe_repository_shape(&cwd, layout.as_ref());
    let package_manager = detect_package_manager(&cwd);
    let containerization = detect_containerization(&cwd);
    let editor_configs = detect_editor_configs(&cwd);
    let os = std::env::consts::OS.to_string();
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "unknown".to_string());

    SystemContext {
        cwd,
        git_branch,
        git_status_summary,
        git_remote_url,
        project_type,
        project_language,
        ci_providers,
        monorepo_type,
        package_manager,
        containerization,
        editor_configs,
        os,
        shell,
    }
}

/// Run `git rev-parse --abbrev-ref HEAD` to get the current branch name.
fn detect_git_branch() -> Option<String> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() {
        None
    } else {
        Some(branch)
    }
}

/// Run `git status --short` and summarize modified/added/deleted counts.
fn detect_git_status_summary() -> Option<String> {
    let output = Command::new("git")
        .args(["status", "--short"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    if text.trim().is_empty() {
        return Some("clean".to_string());
    }

    let mut modified = 0u32;
    let mut added = 0u32;
    let mut deleted = 0u32;
    let mut untracked = 0u32;

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        // git status --short format: XY filename
        // X = index status, Y = worktree status
        let first_two: Vec<char> = trimmed.chars().take(2).collect();
        if first_two.len() < 2 {
            continue;
        }

        match (first_two[0], first_two[1]) {
            ('?', '?') => untracked += 1,
            (x, y) => {
                if x == 'A' || y == 'A' {
                    added += 1;
                } else if x == 'D' || y == 'D' {
                    deleted += 1;
                } else if x == 'M' || y == 'M' || x == 'R' || y == 'R' {
                    modified += 1;
                } else {
                    modified += 1; // fallback for other statuses
                }
            }
        }
    }

    let mut parts = Vec::new();
    if modified > 0 {
        parts.push(format!("{} modified", modified));
    }
    if added > 0 {
        parts.push(format!("{} added", added));
    }
    if deleted > 0 {
        parts.push(format!("{} deleted", deleted));
    }
    if untracked > 0 {
        parts.push(format!("{} untracked", untracked));
    }

    if parts.is_empty() {
        Some("clean".to_string())
    } else {
        Some(parts.join(", "))
    }
}

/// The URL of the repository's default remote, which is only `origin` when
/// nothing else resolves first. See [`crate::repo::resolve_default_remote`].
pub fn detect_git_remote_url() -> Option<String> {
    let cwd = std::env::current_dir().ok()?;
    let layout = crate::repo::detect_repository_layout(&cwd)?;
    layout.default_remote_url().map(str::to_string)
}

/// The monorepo line of the prompt context: the orchestration tool, the size of
/// the workspace graph, and any repository checked out inside this one.
pub fn describe_repository_shape(
    cwd: &str,
    layout: Option<&crate::repo::RepositoryLayout>,
) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(tool) = detect_monorepo_type(cwd) {
        parts.push(tool);
    }
    if let Some(layout) = layout {
        if let Some(workspace) = &layout.workspace {
            if !workspace.members.is_empty() {
                parts.push(format!("{} workspace packages", workspace.members.len()));
            }
        }
        if !layout.nested_roots.is_empty() {
            parts.push(format!("{} nested repositories", layout.nested_roots.len()));
        }
        if let Some(parent) = &layout.parent_root {
            parts.push(format!("nested inside {}", parent.display()));
        }
    }
    (!parts.is_empty()).then(|| parts.join(", "))
}

/// Detect project type by checking for well-known config files in the cwd.
///.
pub fn detect_project_type(cwd: &str) -> Option<String> {
    let dir = Path::new(cwd);

    // Ordered by specificity: more distinctive markers first.
    let markers: &[(&[&str], &str)] = &[
        (&["Cargo.toml"], "rust"),
        (&["go.mod"], "go"),
        (&["mix.exs"], "elixir"),
        (&["Gemfile"], "ruby"),
        (&["pom.xml", "build.gradle", "build.gradle.kts"], "java"),
        (&["*.csproj", "*.sln"], "dotnet"),
        (
            &[
                "pyproject.toml",
                "setup.py",
                "setup.cfg",
                "requirements.txt",
            ],
            "python",
        ),
        (&["package.json"], "node"),
        (&["Makefile", "makefile", "GNUmakefile"], "make"),
    ];

    for (files, label) in markers {
        for file in *files {
            if file.contains('*') {
                let pattern = dir.join(file).display().to_string();
                if let Ok(mut paths) = glob::glob(&pattern) {
                    if paths.next().is_some() {
                        return Some((*label).to_string());
                    }
                }
            } else if dir.join(file).exists() {
                return Some((*label).to_string());
            }
        }
    }

    None
}

/// Detect the primary language of a project by inspecting config files.
///.
pub fn detect_project_language(cwd: &str) -> Option<String> {
    let dir = Path::new(cwd);

    // Map marker files to language names.
    let markers: &[(&[&str], &str)] = &[
        (&["Cargo.toml"], "Rust"),
        (&["go.mod"], "Go"),
        (&["mix.exs"], "Elixir"),
        (&["Gemfile"], "Ruby"),
        (&["pom.xml", "build.gradle", "build.gradle.kts"], "Java"),
        (
            &[
                "pyproject.toml",
                "setup.py",
                "setup.cfg",
                "requirements.txt",
            ],
            "Python",
        ),
    ];

    for (files, lang) in markers {
        for file in *files {
            if dir.join(file).exists() {
                return Some((*lang).to_string());
            }
        }
    }

    if dir.join("package.json").exists() {
        if dir.join("tsconfig.json").exists() {
            return Some("TypeScript".to_string());
        }
        return Some("JavaScript".to_string());
    }

    None
}

/// Detect CI/CD providers from config files in the project root.
///.
pub fn detect_ci_providers(cwd: &str) -> Vec<String> {
    let dir = Path::new(cwd);
    let mut providers = Vec::new();

    if dir.join(".github").join("workflows").is_dir() {
        providers.push("GitHub Actions".to_string());
    }
    if dir.join(".gitlab-ci.yml").exists() {
        providers.push("GitLab CI".to_string());
    }
    if dir.join("Jenkinsfile").exists() {
        providers.push("Jenkins".to_string());
    }
    if dir.join(".circleci").is_dir() {
        providers.push("CircleCI".to_string());
    }
    if dir.join(".travis.yml").exists() {
        providers.push("Travis CI".to_string());
    }
    if dir.join("azure-pipelines.yml").exists() {
        providers.push("Azure Pipelines".to_string());
    }
    if dir.join("bitbucket-pipelines.yml").exists() {
        providers.push("Bitbucket Pipelines".to_string());
    }

    providers
}

/// Detect monorepo orchestration tool from well-known config files.
///.
pub fn detect_monorepo_type(cwd: &str) -> Option<String> {
    let dir = Path::new(cwd);

    // Ordered by specificity: more distinctive markers first.
    let markers: &[(&str, &str)] = &[
        ("pnpm-workspace.yaml", "pnpm workspaces"),
        ("lerna.json", "lerna"),
        ("nx.json", "nx"),
        ("turbo.json", "turbo"),
        ("rush.json", "rush"),
    ];

    for (file, label) in markers {
        if dir.join(file).exists() {
            return Some((*label).to_string());
        }
    }

    None
}

/// Detect the package manager / build system from lockfile presence.
///.
pub fn detect_package_manager(cwd: &str) -> Option<String> {
    let dir = Path::new(cwd);

    // Ordered by specificity: lockfiles that uniquely identify a tool first.
    let markers: &[(&str, &str)] = &[
        ("pnpm-lock.yaml", "pnpm"),
        ("yarn.lock", "yarn"),
        ("package-lock.json", "npm"),
        ("bun.lockb", "bun"),
        ("Cargo.lock", "cargo"),
        ("go.sum", "go modules"),
        ("Pipfile.lock", "pipenv"),
        ("poetry.lock", "poetry"),
    ];

    for (file, label) in markers {
        if dir.join(file).exists() {
            return Some((*label).to_string());
        }
    }

    None
}

/// Detect containerization / orchestration technologies.
///.
pub fn detect_containerization(cwd: &str) -> Vec<String> {
    let dir = Path::new(cwd);
    let mut tools = Vec::new();

    if dir.join("Dockerfile").exists() {
        tools.push("docker".to_string());
    }
    if dir.join("docker-compose.yml").exists() || dir.join("docker-compose.yaml").exists() {
        tools.push("docker-compose".to_string());
    }
    if dir.join(".devcontainer").is_dir() {
        tools.push("devcontainer".to_string());
    }
    if dir.join("k8s").is_dir() || dir.join("kubernetes").is_dir() {
        tools.push("kubernetes".to_string());
    }

    tools
}

/// Detect editor / IDE configuration directories.
///.
pub fn detect_editor_configs(cwd: &str) -> Vec<String> {
    let dir = Path::new(cwd);
    let mut editors = Vec::new();

    if dir.join(".vscode").is_dir() {
        editors.push("vscode".to_string());
    }
    if dir.join(".idea").is_dir() {
        editors.push("intellij".to_string());
    }
    if dir.join(".zed").is_dir() {
        editors.push("zed".to_string());
    }
    if dir.join(".nvim").is_dir() || dir.join(".vim").is_dir() {
        editors.push("vim/neovim".to_string());
    }

    editors
}

// ---------------------------------------------------------------------------
// Canonical domain records (agiworkforce_protocol::code_domain).

/// Names that make an environment variable a credential reference rather than
/// configuration. Matched on the name, so no value is ever inspected to.
const CREDENTIAL_NAME_MARKERS: &[&str] = &[
    "API_KEY",
    "APIKEY",
    "ACCESS_KEY",
    "AUTH",
    "CREDENTIAL",
    "PASSWD",
    "PASSWORD",
    "PRIVATE_KEY",
    "SECRET",
    "SESSION_KEY",
    "TOKEN",
];

const MAX_DISCOVERED_BINARIES: usize = 4_096;
const MAX_VERSION_LINE_CHARS: usize = 120;

fn git_output(dir: &Path, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .current_dir(dir)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Parse `git remote -v`. A repository may have any number of remotes, and
/// fetch and push are separate directions on each.
pub fn parse_git_remotes(text: &str) -> Vec<RepositoryRemote> {
    let mut remotes: Vec<RepositoryRemote> = Vec::new();
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let (Some(name), Some(url)) = (parts.next(), parts.next()) else {
            continue;
        };
        let direction = parts.next().unwrap_or("(fetch)");
        if !remotes.iter().any(|remote| remote.name == name) {
            let mut remote = RepositoryRemote::new(name, url);
            remote.fetch = false;
            remote.push = false;
            remotes.push(remote);
        }
        let Some(remote) = remotes.iter_mut().find(|remote| remote.name == name) else {
            continue;
        };
        if direction.contains("push") {
            remote.push = true;
        } else {
            remote.fetch = true;
        }
    }
    remotes
}

fn normalize_remote_identity(url: &str) -> String {
    let without_scheme = url.split_once("://").map_or(url, |(_, rest)| rest);
    let without_user = without_scheme
        .rsplit_once('@')
        .map_or(without_scheme, |(_, rest)| rest);
    without_user
        .replace(':', "/")
        .trim_end_matches(".git")
        .trim_end_matches('/')
        .to_string()
}

/// A repository's identity from a remote URL alone, for callers that persisted
/// the remote and not the whole record.
pub fn repository_identity_from_remote(url: &str) -> RepositoryId {
    RepositoryId::new(normalize_remote_identity(&redact_remote_credentials(url)))
}

/// A repository's identity: its default remote when it has one, so the same
/// repository cloned twice on one machine is one repository, and its root.
pub fn repository_identity(remotes: &[RepositoryRemote], root: &Path) -> RepositoryId {
    repository_identity_with_default(remotes, root, None)
}

/// [`repository_identity`] when the caller already resolved the default remote,
/// which is the only way a fork-first checkout identifies itself by its fork.
pub fn repository_identity_with_default(
    remotes: &[RepositoryRemote],
    root: &Path,
    default_remote: Option<&str>,
) -> RepositoryId {
    let name = default_remote
        .map(str::to_string)
        .or_else(|| crate::repo::resolve_default_remote(remotes, None));
    name.and_then(|name| remotes.iter().find(|remote| remote.name == name))
        .map_or_else(
            || RepositoryId::new(root.display().to_string()),
            |remote| RepositoryId::new(normalize_remote_identity(&remote.url)),
        )
}

/// Build the [`Repository`] the working directory belongs to, or `None` when
/// it is not inside one.
pub fn gather_repository(cwd: &Path) -> Option<Repository> {
    let layout = crate::repo::detect_repository_layout(cwd)?;
    let id = repository_identity_with_default(
        &layout.remotes,
        &layout.root,
        layout.default_remote.as_deref(),
    );
    let name = layout
        .root
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| id.as_str().to_string());

    let mut repository = Repository::local(id, name, layout.root.clone());
    for remote in layout.remotes {
        repository = repository.with_remote(remote);
    }
    Some(repository.with_policy(RepositoryPolicy {
        default_branch: layout.default_branch,
        ..RepositoryPolicy::default()
    }))
}

fn status_kind(code: char) -> Option<ChangeKind> {
    match code {
        'A' => Some(ChangeKind::Added),
        'M' | 'T' | 'U' => Some(ChangeKind::Modified),
        'D' => Some(ChangeKind::Deleted),
        'R' | 'C' => Some(ChangeKind::Renamed),
        _ => None,
    }
}

/// Parse `git status --porcelain` into typed changes. The index column and the
/// worktree column are distinct changes to the same path, which is what makes.
pub fn parse_porcelain_status(text: &str) -> Vec<RepositoryChange> {
    let mut changes = Vec::new();
    for line in text.lines() {
        if line.len() < 4 || !line.is_char_boundary(3) {
            continue;
        }
        let mut columns = line.chars();
        let index = columns.next().unwrap_or(' ');
        let worktree = columns.next().unwrap_or(' ');
        let path = line[3..].trim();
        let path = path.rsplit(" -> ").next().unwrap_or(path).trim_matches('"');
        if path.is_empty() {
            continue;
        }
        if index == '?' && worktree == '?' {
            changes.push(RepositoryChange::new(path, ChangeKind::Untracked, false));
            continue;
        }
        if let Some(kind) = status_kind(index) {
            changes.push(RepositoryChange::new(path, kind, true));
        }
        if let Some(kind) = status_kind(worktree) {
            changes.push(RepositoryChange::new(path, kind, false));
        }
    }
    changes
}

/// Capture what the repository holds right now. Every change starts attributed
/// to the user; call [`RepositorySnapshot::attribute_against`] with the.
pub fn capture_repository_snapshot(
    cwd: &Path,
    repository_id: RepositoryId,
    captured_at: DateTime<Utc>,
) -> Option<RepositorySnapshot> {
    let branch = git_output(cwd, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    let mut snapshot = RepositorySnapshot::new(repository_id, captured_at);
    snapshot.detached_head = branch == "HEAD";
    if !branch.is_empty() && !snapshot.detached_head {
        snapshot.branch = Some(branch);
    }
    snapshot.head_commit = git_output(cwd, &["rev-parse", "HEAD"])
        .map(|text| text.trim().to_string())
        .filter(|commit| !commit.is_empty());
    snapshot.changes = git_output(cwd, &["status", "--porcelain"])
        .map(|text| parse_porcelain_status(&text))
        .unwrap_or_default();
    Some(snapshot)
}

fn is_executable(path: &Path) -> bool {
    let Ok(metadata) = std::fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn executable_candidates(name: &str) -> Vec<String> {
    #[cfg(windows)]
    {
        let mut candidates = vec![name.to_string()];
        if let Ok(extensions) = std::env::var("PATHEXT") {
            for extension in extensions.split(';').filter(|value| !value.is_empty()) {
                candidates.push(format!("{name}{extension}"));
            }
        }
        candidates
    }
    #[cfg(not(windows))]
    {
        vec![name.to_string()]
    }
}

fn binary_path(name: &str) -> Option<PathBuf> {
    if name.contains(std::path::MAIN_SEPARATOR) {
        let direct = PathBuf::from(name);
        return is_executable(&direct).then_some(direct);
    }
    let path_var = std::env::var_os("PATH")?;
    let candidates = executable_candidates(name);
    std::env::split_paths(&path_var).find_map(|dir| {
        candidates
            .iter()
            .map(|candidate| dir.join(candidate))
            .find(|path| is_executable(path))
    })
}

fn binary_version(path: &Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let line: String = text
        .lines()
        .next()?
        .trim()
        .chars()
        .take(MAX_VERSION_LINE_CHARS)
        .collect();
    (!line.is_empty()).then_some(line)
}

/// Resolve any binary by name against `PATH`, with its self-reported version.
/// Not a fixed list: the caller names what it wants to know about.
pub fn discover_binary(name: &str) -> Option<DiscoveredBinary> {
    let path = binary_path(name)?;
    let binary = DiscoveredBinary::new(name, &path);
    Some(match binary_version(&path) {
        Some(version) => binary.versioned(version),
        None => binary,
    })
}

pub fn discover_binaries<I, S>(names: I) -> Vec<DiscoveredBinary>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    names
        .into_iter()
        .filter_map(|name| discover_binary(name.as_ref()))
        .collect()
}

/// Every executable name reachable on `PATH`, in `PATH` precedence order.
/// Versions are not probed here: running several thousand binaries to ask them.
pub fn discover_path_binaries() -> Vec<DiscoveredBinary> {
    let Some(path_var) = std::env::var_os("PATH") else {
        return Vec::new();
    };
    let mut seen: BTreeSet<String> = BTreeSet::new();
    let mut binaries = Vec::new();
    for dir in std::env::split_paths(&path_var) {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            if binaries.len() >= MAX_DISCOVERED_BINARIES {
                return binaries;
            }
            let path = entry.path();
            if !is_executable(&path) {
                continue;
            }
            let Some(name) = path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
            else {
                continue;
            };
            if seen.insert(name.clone()) {
                binaries.push(DiscoveredBinary::new(name, path));
            }
        }
    }
    binaries
}

/// The interactive shell, with the version it reports rather than the name of
/// whatever `$SHELL` points at.
pub fn detect_shell() -> ShellInfo {
    let path = std::env::var_os("SHELL")
        .or_else(|| std::env::var_os("COMSPEC"))
        .map(PathBuf::from);
    let name = path
        .as_ref()
        .and_then(|path| path.file_name())
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "unknown".to_string());
    let mut shell = ShellInfo::new(name);
    if let Some(path) = path {
        if let Some(version) = binary_version(&path) {
            shell = shell.versioned(version);
        }
        shell = shell.at(path);
    }
    shell
}

/// Containers the session is actually inside, plus the ones the project merely
/// configures. Presence of a `Dockerfile` is configuration; a running.
pub fn detect_container_states(cwd: &str) -> Vec<ContainerState> {
    let mut states = Vec::new();
    if Path::new("/.dockerenv").exists() {
        states.push(ContainerState::running(
            "docker",
            std::env::var("HOSTNAME").unwrap_or_else(|_| "container".to_string()),
        ));
    }
    for marker in ["REMOTE_CONTAINERS", "DEVCONTAINER", "CODESPACES"] {
        if std::env::var_os(marker).is_some() {
            states.push(ContainerState::running("devcontainer", marker));
            break;
        }
    }
    if std::env::var_os("KUBERNETES_SERVICE_HOST").is_some() {
        states.push(ContainerState::running(
            "kubernetes",
            std::env::var("KUBERNETES_SERVICE_HOST").unwrap_or_else(|_| "cluster".to_string()),
        ));
    }
    for kind in detect_containerization(cwd) {
        if !states.iter().any(|state| state.kind == kind) {
            states.push(ContainerState::configured(kind));
        }
    }
    states
}

/// `NetworkCapability::except` compares host strings literally, so the record
/// names the internal hosts a user reads; `denies_host` answers the rest.
pub fn network_capability(policy: NetworkPolicy) -> NetworkCapability {
    match policy {
        NetworkPolicy::Deny => NetworkCapability::Offline,
        NetworkPolicy::AllowExternal => NetworkCapability::except(
            INTERNAL_HOST_NAMES
                .iter()
                .map(|host| (*host).to_string())
                .collect(),
        ),
        NetworkPolicy::Allow => NetworkCapability::Full,
    }
}

/// Whether `host` is refused under `policy`, covering the ranges and alternate
/// spellings no displayed list can enumerate.
pub fn network_denies_host(policy: NetworkPolicy, host: &str) -> bool {
    match policy {
        NetworkPolicy::Deny => true,
        NetworkPolicy::AllowExternal => is_internal_host(host),
        NetworkPolicy::Allow => false,
    }
}

pub fn is_credential_env_name(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    CREDENTIAL_NAME_MARKERS
        .iter()
        .any(|marker| upper.contains(marker))
}

/// Credential *references* for the credential-shaped names among `vars`: the
/// name and whether it is set. The value is consulted for emptiness and then.
pub fn credential_refs_from<I, N, V>(vars: I) -> Vec<CredentialRef>
where
    I: IntoIterator<Item = (N, V)>,
    N: AsRef<str>,
    V: AsRef<str>,
{
    let mut refs: Vec<CredentialRef> = vars
        .into_iter()
        .filter_map(|(name, value)| {
            let name = name.as_ref();
            if !is_credential_env_name(name) {
                return None;
            }
            Some(CredentialRef::new(
                name,
                CredentialSource::Environment,
                !value.as_ref().is_empty(),
            ))
        })
        .collect();
    refs.sort_by(|left, right| left.name.cmp(&right.name));
    refs.dedup_by(|left, right| left.name == right.name);
    refs
}

pub fn credential_refs_from_env() -> Vec<CredentialRef> {
    credential_refs_from(std::env::vars_os().map(|(key, value)| {
        (
            key.to_string_lossy().into_owned(),
            value.to_string_lossy().into_owned(),
        )
    }))
}

/// Binaries worth resolving for this project, derived from what the project
/// actually is rather than from a list of every tool the product knows.
fn toolchain_binary_names(cwd: &str) -> Vec<String> {
    let mut names = vec!["git".to_string()];
    if let Some(project) = detect_project_type(cwd) {
        let binary = match project.as_str() {
            "rust" => "cargo",
            "go" => "go",
            "elixir" => "mix",
            "ruby" => "ruby",
            "java" => "java",
            "dotnet" => "dotnet",
            "python" => "python3",
            "node" => "node",
            "make" => "make",
            other => other,
        };
        names.push(binary.to_string());
    }
    for label in detect_package_manager(cwd)
        .into_iter()
        .chain(detect_monorepo_type(cwd))
    {
        if let Some(first) = label.split_whitespace().next() {
            names.push(first.to_string());
        }
    }
    for tool in detect_containerization(cwd) {
        names.push(match tool.as_str() {
            "kubernetes" => "kubectl".to_string(),
            "devcontainer" => "devcontainer".to_string(),
            other => other.to_string(),
        });
    }
    names.sort();
    names.dedup();
    names
}

/// Build the [`CodeEnvironment`] the session runs in.
pub fn gather_code_environment(cwd: &Path, network: NetworkPolicy) -> CodeEnvironment {
    let cwd_display = cwd.display().to_string();
    let mut environment = CodeEnvironment::new(
        ExecutionLocation::Local,
        std::env::consts::OS,
        std::env::consts::ARCH,
    );
    environment.working_directory = Some(cwd.to_path_buf());
    environment.shell = detect_shell();
    environment.binaries = discover_binaries(toolchain_binary_names(&cwd_display));
    environment.containers = detect_container_states(&cwd_display);
    environment.network = network_capability(network);
    environment.credentials = credential_refs_from_env();
    if let Some(helper) = git_output(cwd, &["config", "--get", "credential.helper"])
        .map(|text| text.trim().to_string())
        .filter(|helper| !helper.is_empty())
    {
        environment.credentials.push(CredentialRef::new(
            helper,
            CredentialSource::GitCredentialHelper,
            true,
        ));
    }
    environment
}

impl fmt::Display for SystemContext {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "<environment>")?;
        writeln!(f, "Working directory: {}", self.cwd)?;

        // Git info on one line when both present.
        match (&self.git_branch, &self.git_status_summary) {
            (Some(branch), Some(status)) => {
                writeln!(f, "Git: {} ({})", branch, status)?;
            }
            (Some(branch), None) => {
                writeln!(f, "Git branch: {}", branch)?;
            }
            (None, Some(status)) => {
                writeln!(f, "Git status: {}", status)?;
            }
            (None, None) => {}
        }

        if let Some(ref url) = self.git_remote_url {
            writeln!(f, "Git remote: {}", url)?;
        }

        // Combine project type + language compactly.
        match (&self.project_type, &self.project_language) {
            (Some(pt), Some(lang)) => {
                writeln!(f, "Project: {} ({})", pt, lang)?;
            }
            (Some(pt), None) => {
                writeln!(f, "Project: {}", pt)?;
            }
            (None, Some(lang)) => {
                writeln!(f, "Language: {}", lang)?;
            }
            (None, None) => {}
        }

        if let Some(ref mono) = self.monorepo_type {
            writeln!(f, "Monorepo: {}", mono)?;
        }

        if let Some(ref pm) = self.package_manager {
            writeln!(f, "Package manager: {}", pm)?;
        }

        if !self.containerization.is_empty() {
            writeln!(f, "Containers: {}", self.containerization.join(", "))?;
        }

        if !self.editor_configs.is_empty() {
            writeln!(f, "Editor configs: {}", self.editor_configs.join(", "))?;
        }

        if !self.ci_providers.is_empty() {
            writeln!(f, "CI: {}", self.ci_providers.join(", "))?;
        }

        writeln!(f, "Platform: {} | Shell: {}", self.os, self.shell)?;
        write!(f, "</environment>")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Helper: create a temp dir, returning its canonical path as a String.
    fn tmp_project_dir() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().expect("create tempdir");
        let path = dir
            .path()
            .canonicalize()
            .expect("canonicalize")
            .display()
            .to_string();
        (dir, path)
    }

    #[test]
    fn test_gather_system_context_runs() {
        let ctx = gather_system_context();
        assert!(!ctx.cwd.is_empty());
        assert!(!ctx.os.is_empty());
    }

    // -----------------------------------------------------------------------
    // detect_project_type.

    #[test]
    fn test_detect_project_type_rust() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Cargo.toml"), "[package]").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("rust"));
    }

    #[test]
    fn test_detect_project_type_node() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("package.json"), "{}").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("node"));
    }

    #[test]
    fn test_detect_project_type_go() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("go.mod"), "module foo").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("go"));
    }

    #[test]
    fn test_detect_project_type_python_pyproject() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("pyproject.toml"), "[tool]").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("python"));
    }

    #[test]
    fn test_detect_project_type_python_setup_py() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("setup.py"), "").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("python"));
    }

    #[test]
    fn test_detect_project_type_python_requirements() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("requirements.txt"), "flask").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("python"));
    }

    #[test]
    fn test_detect_project_type_ruby() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Gemfile"), "source").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("ruby"));
    }

    #[test]
    fn test_detect_project_type_java_maven() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("pom.xml"), "<project/>").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("java"));
    }

    #[test]
    fn test_detect_project_type_java_gradle() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("build.gradle"), "plugins {}").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("java"));
    }

    #[test]
    fn test_detect_project_type_java_gradle_kts() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("build.gradle.kts"), "plugins {}").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("java"));
    }

    #[test]
    fn test_detect_project_type_elixir() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("mix.exs"), "defmodule").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("elixir"));
    }

    #[test]
    fn test_detect_project_type_make() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Makefile"), "all:").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("make"));
    }

    #[test]
    fn test_detect_project_type_unknown() {
        let result = detect_project_type("/nonexistent/path/that/does/not/exist");
        assert!(result.is_none());
    }

    #[test]
    fn test_detect_project_type_empty_dir() {
        let (_d, path) = tmp_project_dir();
        assert!(detect_project_type(&path).is_none());
    }

    #[test]
    fn test_detect_project_type_priority_rust_over_node() {
        // When both Cargo.toml and package.json exist, Rust wins (higher priority).
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Cargo.toml"), "[package]").unwrap();
        fs::write(Path::new(&path).join("package.json"), "{}").unwrap();
        assert_eq!(detect_project_type(&path).as_deref(), Some("rust"));
    }

    // -----------------------------------------------------------------------
    // detect_project_language.

    #[test]
    fn test_detect_language_rust() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Cargo.toml"), "[package]").unwrap();
        assert_eq!(detect_project_language(&path).as_deref(), Some("Rust"));
    }

    #[test]
    fn test_detect_language_go() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("go.mod"), "module foo").unwrap();
        assert_eq!(detect_project_language(&path).as_deref(), Some("Go"));
    }

    #[test]
    fn test_detect_language_python() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("pyproject.toml"), "").unwrap();
        assert_eq!(detect_project_language(&path).as_deref(), Some("Python"));
    }

    #[test]
    fn test_detect_language_ruby() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Gemfile"), "").unwrap();
        assert_eq!(detect_project_language(&path).as_deref(), Some("Ruby"));
    }

    #[test]
    fn test_detect_language_java() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("pom.xml"), "<project/>").unwrap();
        assert_eq!(detect_project_language(&path).as_deref(), Some("Java"));
    }

    #[test]
    fn test_detect_language_elixir() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("mix.exs"), "defmodule").unwrap();
        assert_eq!(detect_project_language(&path).as_deref(), Some("Elixir"));
    }

    #[test]
    fn test_detect_language_typescript() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("package.json"), "{}").unwrap();
        fs::write(Path::new(&path).join("tsconfig.json"), "{}").unwrap();
        assert_eq!(
            detect_project_language(&path).as_deref(),
            Some("TypeScript")
        );
    }

    #[test]
    fn test_detect_language_javascript() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("package.json"), "{}").unwrap();
        assert_eq!(
            detect_project_language(&path).as_deref(),
            Some("JavaScript")
        );
    }

    #[test]
    fn test_detect_language_empty_dir() {
        let (_d, path) = tmp_project_dir();
        assert!(detect_project_language(&path).is_none());
    }

    // -----------------------------------------------------------------------
    // detect_ci_providers.

    #[test]
    fn test_detect_ci_github_actions() {
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join(".github").join("workflows")).unwrap();
        let providers = detect_ci_providers(&path);
        assert_eq!(providers, vec!["GitHub Actions"]);
    }

    #[test]
    fn test_detect_ci_gitlab() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join(".gitlab-ci.yml"), "stages:").unwrap();
        let providers = detect_ci_providers(&path);
        assert_eq!(providers, vec!["GitLab CI"]);
    }

    #[test]
    fn test_detect_ci_jenkins() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Jenkinsfile"), "pipeline {}").unwrap();
        let providers = detect_ci_providers(&path);
        assert_eq!(providers, vec!["Jenkins"]);
    }

    #[test]
    fn test_detect_ci_circleci() {
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join(".circleci")).unwrap();
        let providers = detect_ci_providers(&path);
        assert_eq!(providers, vec!["CircleCI"]);
    }

    #[test]
    fn test_detect_ci_travis() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join(".travis.yml"), "language:").unwrap();
        let providers = detect_ci_providers(&path);
        assert_eq!(providers, vec!["Travis CI"]);
    }

    #[test]
    fn test_detect_ci_azure() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("azure-pipelines.yml"), "").unwrap();
        let providers = detect_ci_providers(&path);
        assert_eq!(providers, vec!["Azure Pipelines"]);
    }

    #[test]
    fn test_detect_ci_bitbucket() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("bitbucket-pipelines.yml"), "").unwrap();
        let providers = detect_ci_providers(&path);
        assert_eq!(providers, vec!["Bitbucket Pipelines"]);
    }

    #[test]
    fn test_detect_ci_multiple() {
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join(".github").join("workflows")).unwrap();
        fs::write(Path::new(&path).join(".gitlab-ci.yml"), "stages:").unwrap();
        let providers = detect_ci_providers(&path);
        assert_eq!(providers.len(), 2);
        assert!(providers.contains(&"GitHub Actions".to_string()));
        assert!(providers.contains(&"GitLab CI".to_string()));
    }

    #[test]
    fn test_detect_ci_none() {
        let (_d, path) = tmp_project_dir();
        let providers = detect_ci_providers(&path);
        assert!(providers.is_empty());
    }

    // -----------------------------------------------------------------------
    // detect_monorepo_type.

    #[test]
    fn test_detect_monorepo_pnpm() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("pnpm-workspace.yaml"), "packages:").unwrap();
        assert_eq!(
            detect_monorepo_type(&path).as_deref(),
            Some("pnpm workspaces")
        );
    }

    #[test]
    fn test_detect_monorepo_lerna() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("lerna.json"), "{}").unwrap();
        assert_eq!(detect_monorepo_type(&path).as_deref(), Some("lerna"));
    }

    #[test]
    fn test_detect_monorepo_nx() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("nx.json"), "{}").unwrap();
        assert_eq!(detect_monorepo_type(&path).as_deref(), Some("nx"));
    }

    #[test]
    fn test_detect_monorepo_turbo() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("turbo.json"), "{}").unwrap();
        assert_eq!(detect_monorepo_type(&path).as_deref(), Some("turbo"));
    }

    #[test]
    fn test_detect_monorepo_rush() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("rush.json"), "{}").unwrap();
        assert_eq!(detect_monorepo_type(&path).as_deref(), Some("rush"));
    }

    #[test]
    fn test_detect_monorepo_none() {
        let (_d, path) = tmp_project_dir();
        assert!(detect_monorepo_type(&path).is_none());
    }

    #[test]
    fn test_detect_monorepo_priority() {
        // pnpm-workspace.yaml wins over lerna.json when both present.
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("pnpm-workspace.yaml"), "packages:").unwrap();
        fs::write(Path::new(&path).join("lerna.json"), "{}").unwrap();
        assert_eq!(
            detect_monorepo_type(&path).as_deref(),
            Some("pnpm workspaces")
        );
    }

    // -----------------------------------------------------------------------
    // detect_package_manager.

    #[test]
    fn test_detect_pm_pnpm() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("pnpm-lock.yaml"), "").unwrap();
        assert_eq!(detect_package_manager(&path).as_deref(), Some("pnpm"));
    }

    #[test]
    fn test_detect_pm_yarn() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("yarn.lock"), "").unwrap();
        assert_eq!(detect_package_manager(&path).as_deref(), Some("yarn"));
    }

    #[test]
    fn test_detect_pm_npm() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("package-lock.json"), "{}").unwrap();
        assert_eq!(detect_package_manager(&path).as_deref(), Some("npm"));
    }

    #[test]
    fn test_detect_pm_bun() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("bun.lockb"), [0u8; 4]).unwrap();
        assert_eq!(detect_package_manager(&path).as_deref(), Some("bun"));
    }

    #[test]
    fn test_detect_pm_cargo() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Cargo.lock"), "").unwrap();
        assert_eq!(detect_package_manager(&path).as_deref(), Some("cargo"));
    }

    #[test]
    fn test_detect_pm_go_modules() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("go.sum"), "").unwrap();
        assert_eq!(detect_package_manager(&path).as_deref(), Some("go modules"));
    }

    #[test]
    fn test_detect_pm_pipenv() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Pipfile.lock"), "{}").unwrap();
        assert_eq!(detect_package_manager(&path).as_deref(), Some("pipenv"));
    }

    #[test]
    fn test_detect_pm_poetry() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("poetry.lock"), "").unwrap();
        assert_eq!(detect_package_manager(&path).as_deref(), Some("poetry"));
    }

    #[test]
    fn test_detect_pm_none() {
        let (_d, path) = tmp_project_dir();
        assert!(detect_package_manager(&path).is_none());
    }

    #[test]
    fn test_detect_pm_priority_pnpm_over_npm() {
        // pnpm-lock.yaml wins over package-lock.json when both present.
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("pnpm-lock.yaml"), "").unwrap();
        fs::write(Path::new(&path).join("package-lock.json"), "{}").unwrap();
        assert_eq!(detect_package_manager(&path).as_deref(), Some("pnpm"));
    }

    // -----------------------------------------------------------------------
    // detect_containerization.

    #[test]
    fn test_detect_container_dockerfile() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Dockerfile"), "FROM alpine").unwrap();
        let tools = detect_containerization(&path);
        assert_eq!(tools, vec!["docker"]);
    }

    #[test]
    fn test_detect_container_compose_yml() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("docker-compose.yml"), "version:").unwrap();
        let tools = detect_containerization(&path);
        assert_eq!(tools, vec!["docker-compose"]);
    }

    #[test]
    fn test_detect_container_compose_yaml() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("docker-compose.yaml"), "version:").unwrap();
        let tools = detect_containerization(&path);
        assert_eq!(tools, vec!["docker-compose"]);
    }

    #[test]
    fn test_detect_container_devcontainer() {
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join(".devcontainer")).unwrap();
        let tools = detect_containerization(&path);
        assert_eq!(tools, vec!["devcontainer"]);
    }

    #[test]
    fn test_detect_container_kubernetes_k8s() {
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join("k8s")).unwrap();
        let tools = detect_containerization(&path);
        assert_eq!(tools, vec!["kubernetes"]);
    }

    #[test]
    fn test_detect_container_kubernetes_dir() {
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join("kubernetes")).unwrap();
        let tools = detect_containerization(&path);
        assert_eq!(tools, vec!["kubernetes"]);
    }

    #[test]
    fn test_detect_container_multiple() {
        let (_d, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Dockerfile"), "FROM node").unwrap();
        fs::write(Path::new(&path).join("docker-compose.yml"), "version:").unwrap();
        fs::create_dir_all(Path::new(&path).join("k8s")).unwrap();
        let tools = detect_containerization(&path);
        assert_eq!(tools.len(), 3);
        assert!(tools.contains(&"docker".to_string()));
        assert!(tools.contains(&"docker-compose".to_string()));
        assert!(tools.contains(&"kubernetes".to_string()));
    }

    #[test]
    fn test_detect_container_none() {
        let (_d, path) = tmp_project_dir();
        let tools = detect_containerization(&path);
        assert!(tools.is_empty());
    }

    // -----------------------------------------------------------------------
    // detect_editor_configs.

    #[test]
    fn test_detect_editor_vscode() {
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join(".vscode")).unwrap();
        let editors = detect_editor_configs(&path);
        assert_eq!(editors, vec!["vscode"]);
    }

    #[test]
    fn test_detect_editor_intellij() {
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join(".idea")).unwrap();
        let editors = detect_editor_configs(&path);
        assert_eq!(editors, vec!["intellij"]);
    }

    #[test]
    fn test_detect_editor_zed() {
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join(".zed")).unwrap();
        let editors = detect_editor_configs(&path);
        assert_eq!(editors, vec!["zed"]);
    }

    #[test]
    fn test_detect_editor_nvim() {
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join(".nvim")).unwrap();
        let editors = detect_editor_configs(&path);
        assert_eq!(editors, vec!["vim/neovim"]);
    }

    #[test]
    fn test_detect_editor_vim() {
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join(".vim")).unwrap();
        let editors = detect_editor_configs(&path);
        assert_eq!(editors, vec!["vim/neovim"]);
    }

    #[test]
    fn test_detect_editor_multiple() {
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join(".vscode")).unwrap();
        fs::create_dir_all(Path::new(&path).join(".idea")).unwrap();
        let editors = detect_editor_configs(&path);
        assert_eq!(editors.len(), 2);
        assert!(editors.contains(&"vscode".to_string()));
        assert!(editors.contains(&"intellij".to_string()));
    }

    #[test]
    fn test_detect_editor_none() {
        let (_d, path) = tmp_project_dir();
        let editors = detect_editor_configs(&path);
        assert!(editors.is_empty());
    }

    #[test]
    fn test_detect_editor_both_nvim_and_vim() {
        // When both .nvim and .vim exist, only one "vim/neovim" entry should appear.
        let (_d, path) = tmp_project_dir();
        fs::create_dir_all(Path::new(&path).join(".nvim")).unwrap();
        fs::create_dir_all(Path::new(&path).join(".vim")).unwrap();
        let editors = detect_editor_configs(&path);
        assert_eq!(editors, vec!["vim/neovim"]);
    }

    // -----------------------------------------------------------------------
    // detect_git_remote_url (unit-testable via mock, but we can test the.

    #[test]
    fn test_detect_git_remote_url_runs() {
        // This runs in the repo, so it should return Some(...).
        let url = detect_git_remote_url();
        // In CI or detached forks this might be None, so just assert no panic.
        if let Some(ref u) = url {
            assert!(!u.is_empty());
        }
    }

    // -----------------------------------------------------------------------
    // Display impl.

    #[test]
    fn test_display_full_context() {
        let ctx = SystemContext {
            cwd: "/tmp/test".to_string(),
            git_branch: Some("main".to_string()),
            git_status_summary: Some("2 modified".to_string()),
            git_remote_url: Some("git@github.com:user/repo.git".to_string()),
            project_type: Some("rust".to_string()),
            project_language: Some("Rust".to_string()),
            ci_providers: vec!["GitHub Actions".to_string()],
            monorepo_type: Some("pnpm workspaces".to_string()),
            package_manager: Some("pnpm".to_string()),
            containerization: vec!["docker".to_string(), "kubernetes".to_string()],
            editor_configs: vec!["vscode".to_string()],
            os: "macos".to_string(),
            shell: "/bin/zsh".to_string(),
        };
        let output = ctx.to_string();
        assert!(output.contains("<environment>"));
        assert!(output.contains("Working directory: /tmp/test"));
        // Branch + status combined.
        assert!(output.contains("Git: main (2 modified)"));
        assert!(output.contains("Git remote: git@github.com:user/repo.git"));
        assert!(output.contains("Project: rust (Rust)"));
        assert!(output.contains("Monorepo: pnpm workspaces"));
        assert!(output.contains("Package manager: pnpm"));
        assert!(output.contains("Containers: docker, kubernetes"));
        assert!(output.contains("Editor configs: vscode"));
        assert!(output.contains("CI: GitHub Actions"));
        assert!(output.contains("Platform: macos | Shell: /bin/zsh"));
        assert!(output.contains("</environment>"));
    }

    #[test]
    fn test_display_minimal_context() {
        let ctx = SystemContext {
            cwd: "/home/user".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "linux".to_string(),
            shell: "/bin/bash".to_string(),
        };
        let output = ctx.to_string();
        assert!(output.contains("Working directory: /home/user"));
        assert!(!output.contains("Git"));
        assert!(!output.contains("Project"));
        assert!(!output.contains("CI"));
        assert!(!output.contains("Monorepo"));
        assert!(!output.contains("Package manager"));
        assert!(!output.contains("Containers"));
        assert!(!output.contains("Editor configs"));
        assert!(output.contains("Platform: linux | Shell: /bin/bash"));
    }

    #[test]
    fn test_display_branch_only() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: Some("feature-x".to_string()),
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "linux".to_string(),
            shell: "/bin/sh".to_string(),
        };
        let output = ctx.to_string();
        assert!(output.contains("Git branch: feature-x"));
    }

    #[test]
    fn test_display_project_type_without_language() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: Some("make".to_string()),
            project_language: None,
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "linux".to_string(),
            shell: "/bin/sh".to_string(),
        };
        let output = ctx.to_string();
        assert!(output.contains("Project: make"));
        assert!(!output.contains("Project: make ("));
    }

    #[test]
    fn test_display_language_without_project_type() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: Some("Rust".to_string()),
            ci_providers: vec![],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "linux".to_string(),
            shell: "/bin/sh".to_string(),
        };
        let output = ctx.to_string();
        assert!(output.contains("Language: Rust"));
    }

    #[test]
    fn test_display_multiple_ci_providers() {
        let ctx = SystemContext {
            cwd: "/tmp".to_string(),
            git_branch: None,
            git_status_summary: None,
            git_remote_url: None,
            project_type: None,
            project_language: None,
            ci_providers: vec!["GitHub Actions".to_string(), "Jenkins".to_string()],
            monorepo_type: None,
            package_manager: None,
            containerization: vec![],
            editor_configs: vec![],
            os: "linux".to_string(),
            shell: "/bin/sh".to_string(),
        };
        let output = ctx.to_string();
        assert!(output.contains("CI: GitHub Actions, Jenkins"));
    }

    // -----------------------------------------------------------------------
    // git status parsing.

    #[test]
    fn test_git_status_parsing_runs() {
        // Just ensure no panics. Actual content depends on repo state.
        let _result = detect_git_status_summary();
    }

    #[test]
    fn test_git_branch_parsing_runs() {
        let _result = detect_git_branch();
    }

    // -----------------------------------------------------------------------
    // Canonical domain records.

    #[test]
    fn remotes_are_enumerated_not_reduced_to_origin() {
        let remotes = parse_git_remotes(
            "origin\thttps://github.com/acme/widgets.git (fetch)\n\
             origin\thttps://github.com/acme/widgets.git (push)\n\
             upstream\thttps://github.com/upstream/widgets.git (fetch)\n",
        );

        assert_eq!(remotes.len(), 2);
        assert_eq!(remotes[0].name, "origin");
        assert!(remotes[0].fetch && remotes[0].push);
        assert_eq!(remotes[1].name, "upstream");
        assert!(remotes[1].fetch && !remotes[1].push);
    }

    #[test]
    fn a_remote_credential_never_reaches_the_repository_record() {
        let remotes =
            parse_git_remotes("origin\thttps://user:ghp_secret@github.com/acme/w.git (fetch)\n");

        assert_eq!(remotes[0].url, "https://github.com/acme/w.git");
        assert_eq!(
            repository_identity(&remotes, Path::new("/work/w")).as_str(),
            "github.com/acme/w"
        );
    }

    #[test]
    fn repository_identity_falls_back_to_the_root_without_a_remote() {
        assert_eq!(
            repository_identity(&[], Path::new("/work/w")).as_str(),
            "/work/w"
        );
    }

    #[test]
    fn a_fork_only_checkout_identifies_itself_by_the_fork_not_by_origin() {
        let remotes = parse_git_remotes("fork\thttps://github.com/me/widgets.git (fetch)\n");

        assert_eq!(
            repository_identity(&remotes, Path::new("/work/w")).as_str(),
            "github.com/me/widgets"
        );
        assert_eq!(
            repository_identity_with_default(&remotes, Path::new("/work/w"), Some("fork")).as_str(),
            "github.com/me/widgets"
        );
    }

    #[test]
    fn the_monorepo_line_names_workspace_packages_and_nested_repositories() {
        let (_dir, path) = tmp_project_dir();
        fs::write(
            Path::new(&path).join("pnpm-workspace.yaml"),
            "packages:\n  - 'p/*'\n",
        )
        .unwrap();
        fs::create_dir_all(Path::new(&path).join("p/alpha")).unwrap();
        fs::write(
            Path::new(&path).join("p/alpha/package.json"),
            r#"{"name":"alpha"}"#,
        )
        .unwrap();
        let nested = Path::new(&path).join("p/alpha/.git");
        fs::create_dir_all(&nested).unwrap();

        let layout = crate::repo::RepositoryLayout {
            root: PathBuf::from(&path),
            git_dir: PathBuf::from(&path).join(".git"),
            common_dir: PathBuf::from(&path).join(".git"),
            bare: false,
            linked_worktree: false,
            head: crate::repo::HeadState::Branch("main".to_string()),
            remotes: Vec::new(),
            default_remote: None,
            default_branch: None,
            parent_root: None,
            nested_roots: vec![nested],
            workspace: crate::repo::workspace_graph(Path::new(&path), None),
            config: std::collections::BTreeMap::new(),
        };

        let described = describe_repository_shape(&path, Some(&layout)).expect("a shape");

        assert!(described.contains("pnpm workspaces"));
        assert!(described.contains("1 workspace packages"));
        assert!(described.contains("1 nested repositories"));
    }

    #[test]
    fn porcelain_status_separates_the_index_from_the_worktree() {
        let changes = parse_porcelain_status(
            "MM src/both.rs\n\
             A  src/staged.rs\n\
             ?? src/new.rs\n\
             R  src/old.rs -> src/renamed.rs\n\
             D  src/gone.rs\n",
        );

        let staged: Vec<_> = changes
            .iter()
            .filter(|change| change.staged)
            .map(|change| change.path.display().to_string())
            .collect();
        assert_eq!(
            staged,
            vec![
                "src/both.rs",
                "src/staged.rs",
                "src/renamed.rs",
                "src/gone.rs"
            ]
        );

        let unstaged: Vec<_> = changes
            .iter()
            .filter(|change| !change.staged)
            .map(|change| change.path.display().to_string())
            .collect();
        assert_eq!(unstaged, vec!["src/both.rs", "src/new.rs"]);

        assert!(changes
            .iter()
            .any(|change| change.kind == ChangeKind::Untracked));
        assert!(changes
            .iter()
            .any(|change| change.kind == ChangeKind::Renamed));
    }

    #[test]
    fn a_snapshot_of_a_real_repository_reads_branch_and_staged_state() {
        let (_dir, path) = tmp_project_dir();
        let root = Path::new(&path);
        let run = |args: &[&str]| {
            Command::new("git")
                .current_dir(root)
                .args(args)
                .output()
                .expect("git available");
        };
        run(&["init", "-q", "-b", "main"]);
        run(&["config", "user.email", "test@example.invalid"]);
        run(&["config", "user.name", "Test"]);
        fs::write(root.join("README.md"), "hello").unwrap();
        run(&["add", "README.md"]);
        run(&["commit", "-q", "-m", "init"]);
        fs::write(root.join("staged.txt"), "staged").unwrap();
        run(&["add", "staged.txt"]);
        fs::write(root.join("loose.txt"), "loose").unwrap();

        let repository = gather_repository(root).expect("inside a repository");
        assert!(repository.remotes.is_empty());
        assert!(!repository.is_remote_only());

        let snapshot =
            capture_repository_snapshot(root, repository.id.clone(), Utc::now()).expect("snapshot");
        assert_eq!(snapshot.branch.as_deref(), Some("main"));
        assert!(!snapshot.detached_head);
        assert!(snapshot.head_commit.is_some());
        assert_eq!(snapshot.staged().count(), 1);
        assert_eq!(snapshot.unstaged().count(), 1);
    }

    #[test]
    fn credential_names_are_matched_by_name_alone() {
        assert!(is_credential_env_name("ANTHROPIC_API_KEY"));
        assert!(is_credential_env_name("github_token"));
        assert!(is_credential_env_name("DB_PASSWORD"));
        assert!(!is_credential_env_name("PATH"));
        assert!(!is_credential_env_name("HOME"));
    }

    #[test]
    fn a_credential_reference_records_the_name_and_never_the_value() {
        let refs = credential_refs_from([
            ("ANTHROPIC_API_KEY", "sk-not-a-real-value"),
            ("EMPTY_TOKEN", ""),
            ("PATH", "/usr/bin"),
        ]);

        let serialized = serde_json::to_string(&refs).unwrap();
        assert!(serialized.contains("ANTHROPIC_API_KEY"));
        assert!(!serialized.contains("sk-not-a-real-value"));
        assert!(!serialized.contains("/usr/bin"));
        assert_eq!(refs.len(), 2);
        assert!(refs
            .iter()
            .any(|entry| entry.name == "EMPTY_TOKEN" && !entry.present));
    }

    #[test]
    fn a_gathered_environment_describes_where_code_runs() {
        let (_dir, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Cargo.toml"), "[package]").unwrap();

        let environment = gather_code_environment(Path::new(&path), NetworkPolicy::AllowExternal);

        assert_eq!(environment.location, ExecutionLocation::Local);
        assert_eq!(environment.os, std::env::consts::OS);
        assert!(!environment.shell.name.is_empty());
        assert!(environment.has_binary("git"));
        assert!(!serde_json::to_string(&environment).unwrap().is_empty());
    }

    #[test]
    fn network_capability_keeps_internal_hosts_out_of_a_general_approval() {
        assert_eq!(
            network_capability(NetworkPolicy::Deny),
            NetworkCapability::Offline
        );
        assert_eq!(
            network_capability(NetworkPolicy::Allow),
            NetworkCapability::Full
        );
        let external = network_capability(NetworkPolicy::AllowExternal);
        assert!(external.allows("github.com"));
        for name in INTERNAL_HOST_NAMES {
            assert!(!external.allows(name), "displayed but allowed: {name}");
        }
        assert!(!external.allows("169.254.169.254"));
    }

    #[test]
    fn a_general_approval_refuses_internal_spellings_no_list_enumerates() {
        for host in ["127.1.2.3", "api.localhost", "fd00:ec2::254", "2130706433"] {
            assert!(
                network_denies_host(NetworkPolicy::AllowExternal, host),
                "should be refused: {host}"
            );
        }
        assert!(!network_denies_host(
            NetworkPolicy::AllowExternal,
            "github.com"
        ));
        assert!(network_denies_host(NetworkPolicy::Deny, "github.com"));
        assert!(!network_denies_host(NetworkPolicy::Allow, "127.0.0.1"));
    }

    #[test]
    fn binaries_are_discovered_by_name_against_the_real_path() {
        let git = discover_binary("git").expect("git is on PATH for the test suite");
        assert!(is_executable(&git.path));
        assert!(git.version.is_some());
        assert!(discover_binary("agi-binary-that-does-not-exist").is_none());

        let all = discover_path_binaries();
        assert!(all.iter().any(|binary| binary.name.starts_with("git")));
        assert!(all.len() <= MAX_DISCOVERED_BINARIES);
    }

    #[test]
    fn a_configured_container_is_not_reported_as_a_running_one() {
        let (_dir, path) = tmp_project_dir();
        fs::write(Path::new(&path).join("Dockerfile"), "FROM alpine").unwrap();

        let states = detect_container_states(&path);

        let docker = states
            .iter()
            .find(|state| state.kind == "docker")
            .expect("docker configured");
        assert!(!docker.is_running() || Path::new("/.dockerenv").exists());
    }
}
