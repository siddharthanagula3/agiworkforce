use std::fmt;
use std::path::Path;
use std::process::Command;

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

    let git_branch = detect_git_branch();
    let git_status_summary = detect_git_status_summary();
    let git_remote_url = detect_git_remote_url();
    let project_type = detect_project_type(&cwd);
    let project_language = detect_project_language(&cwd);
    let ci_providers = detect_ci_providers(&cwd);
    let monorepo_type = detect_monorepo_type(&cwd);
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

/// Run `git remote get-url origin` to get the remote URL.
fn detect_git_remote_url() -> Option<String> {
    let output = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if url.is_empty() {
        None
    } else {
        Some(url)
    }
}

/// Detect project type by checking for well-known config files in the cwd.
///
/// Returns a label like "rust", "node", "python", "go", "ruby", "java",
/// "dotnet", "elixir", or `None` if unrecognized.
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
            &["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt"],
            "python",
        ),
        (&["package.json"], "node"),
        (&["Makefile", "makefile", "GNUmakefile"], "make"),
    ];

    for (files, label) in markers {
        for file in *files {
            if file.contains('*') {
                // Glob pattern — check with `glob` crate.
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
///
/// This examines the same markers as `detect_project_type` but returns a
/// human-readable language name (e.g. "Rust", "TypeScript", "Python").
/// For Node projects it peeks at `tsconfig.json` to distinguish TypeScript.
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
            &["pyproject.toml", "setup.py", "setup.cfg", "requirements.txt"],
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

    // Node ecosystem — distinguish TS vs JS.
    if dir.join("package.json").exists() {
        if dir.join("tsconfig.json").exists() {
            return Some("TypeScript".to_string());
        }
        return Some("JavaScript".to_string());
    }

    None
}

/// Detect CI/CD providers from config files in the project root.
///
/// Returns a (possibly empty) list of provider names.
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
///
/// Returns the tool name (e.g. "pnpm workspaces", "nx", "turbo") or `None`.
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
///
/// Returns the package manager name (e.g. "pnpm", "yarn", "cargo") or `None`.
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
///
/// Returns a list of detected tools (e.g. "docker", "docker-compose",
/// "devcontainer", "kubernetes").
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
///
/// Returns a list of detected editors (e.g. "vscode", "intellij", "zed").
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

    // -----------------------------------------------------------------------
    // gather_system_context (integration-ish — runs real git)
    // -----------------------------------------------------------------------

    #[test]
    fn test_gather_system_context_runs() {
        let ctx = gather_system_context();
        assert!(!ctx.cwd.is_empty());
        assert!(!ctx.os.is_empty());
    }

    // -----------------------------------------------------------------------
    // detect_project_type
    // -----------------------------------------------------------------------

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
    // detect_project_language
    // -----------------------------------------------------------------------

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
    // detect_ci_providers
    // -----------------------------------------------------------------------

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
    // detect_monorepo_type
    // -----------------------------------------------------------------------

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
    // detect_package_manager
    // -----------------------------------------------------------------------

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
        fs::write(Path::new(&path).join("bun.lockb"), &[0u8; 4]).unwrap();
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
        assert_eq!(
            detect_package_manager(&path).as_deref(),
            Some("go modules")
        );
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
    // detect_containerization
    // -----------------------------------------------------------------------

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
    // detect_editor_configs
    // -----------------------------------------------------------------------

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
    // detect_git_remote_url (unit-testable via mock, but we can test the
    // parsing logic runs without crashing at minimum)
    // -----------------------------------------------------------------------

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
    // Display impl
    // -----------------------------------------------------------------------

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
            ci_providers: vec![
                "GitHub Actions".to_string(),
                "Jenkins".to_string(),
            ],
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
    // git status parsing
    // -----------------------------------------------------------------------

    #[test]
    fn test_git_status_parsing_runs() {
        // Just ensure no panics. Actual content depends on repo state.
        let _result = detect_git_status_summary();
    }

    #[test]
    fn test_git_branch_parsing_runs() {
        let _result = detect_git_branch();
    }
}
