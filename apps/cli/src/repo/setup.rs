use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};

use crate::context::{CI_MARKERS, COMPOSE_FILES};

const MAX_COMMANDS_PER_SOURCE: usize = 64;
const MAX_ENV_DECLARATIONS: usize = 256;
const MAX_DEV_SERVICES: usize = 64;
const MAX_READ_BYTES: u64 = 1_048_576;

/// Files that run arbitrary repository code as part of an install.
pub const INSTALL_LIFECYCLE_SCRIPTS: &[&str] = &[
    "preinstall",
    "install",
    "postinstall",
    "prepare",
    "prepublish",
];

/// Manifest scripts that mean "bring a checkout up from nothing".
const SETUP_SCRIPT_NAMES: &[&str] = &["setup", "bootstrap", "init", "dev:setup", "prepare"];

const MIGRATE_SCRIPT_NAMES: &[&str] = &["migrate", "db:migrate", "migrations", "db:push"];

const SEED_SCRIPT_NAMES: &[&str] = &["seed", "db:seed", "seed:dev", "db:seed:dev"];

const SERVER_SCRIPT_NAMES: &[&str] = &["dev", "start", "serve", "server"];

/// Every kind of file a repository uses to say how it is set up. Discovery
/// walks this list, so a new kind is found by every caller at once.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum SetupSourceKind {
    Readme,
    Contributing,
    PackageScripts,
    Makefile,
    Justfile,
    DockerCompose,
    DevContainer,
    SetupScript,
    ContinuousIntegration,
}

impl SetupSourceKind {
    pub const ALL: &'static [SetupSourceKind] = &[
        Self::Readme,
        Self::Contributing,
        Self::PackageScripts,
        Self::Makefile,
        Self::Justfile,
        Self::DockerCompose,
        Self::DevContainer,
        Self::SetupScript,
        Self::ContinuousIntegration,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Readme => "README",
            Self::Contributing => "CONTRIBUTING",
            Self::PackageScripts => "package scripts",
            Self::Makefile => "Makefile",
            Self::Justfile => "justfile",
            Self::DockerCompose => "Docker Compose",
            Self::DevContainer => "devcontainer",
            Self::SetupScript => "setup script",
            Self::ContinuousIntegration => "CI definitions",
        }
    }

    /// Paths relative to the repository root that declare this kind of setup.
    pub fn candidates(self) -> Vec<&'static str> {
        match self {
            Self::Readme => vec!["README.md", "README.rst", "README.txt", "README"],
            Self::Contributing => vec![
                "CONTRIBUTING.md",
                "CONTRIBUTING.rst",
                "CONTRIBUTING",
                ".github/CONTRIBUTING.md",
                "docs/CONTRIBUTING.md",
            ],
            Self::PackageScripts => vec!["package.json", "composer.json", "pyproject.toml"],
            Self::Makefile => vec!["Makefile", "makefile", "GNUmakefile"],
            Self::Justfile => vec!["justfile", "Justfile", ".justfile"],
            Self::DockerCompose => COMPOSE_FILES.to_vec(),
            Self::DevContainer => vec![
                ".devcontainer/devcontainer.json",
                ".devcontainer.json",
                ".devcontainer",
            ],
            Self::SetupScript => vec![
                "setup.sh",
                "bootstrap.sh",
                "install.sh",
                "bin/setup",
                "bin/bootstrap",
                "script/setup",
                "script/bootstrap",
                "scripts/setup.sh",
                "scripts/bootstrap.sh",
                "scripts/setup",
            ],
            Self::ContinuousIntegration => CI_MARKERS.iter().map(|(path, _)| *path).collect(),
        }
    }
}

/// A command a setup source declares, named the way a user would run it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetupCommand {
    pub name: String,
    pub run: String,
}

impl SetupCommand {
    fn new(name: impl Into<String>, run: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            run: run.into(),
        }
    }
}

/// One discovered setup source: what kind it is, where it lives, and the
/// commands it declares.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SetupSource {
    pub kind: SetupSourceKind,
    pub path: PathBuf,
    pub commands: Vec<SetupCommand>,
}

impl SetupSource {
    pub fn command(&self, name: &str) -> Option<&SetupCommand> {
        self.commands.iter().find(|command| command.name == name)
    }
}

/// Package managers by the lockfile that identifies them, most specific first.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum PackageManager {
    Pnpm,
    Yarn,
    Npm,
    Bun,
    Cargo,
    GoModules,
    Pipenv,
    Poetry,
    Bundler,
    Composer,
}

impl PackageManager {
    pub const ALL: &'static [PackageManager] = &[
        Self::Pnpm,
        Self::Yarn,
        Self::Npm,
        Self::Bun,
        Self::Cargo,
        Self::GoModules,
        Self::Pipenv,
        Self::Poetry,
        Self::Bundler,
        Self::Composer,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Self::Pnpm => "pnpm",
            Self::Yarn => "yarn",
            Self::Npm => "npm",
            Self::Bun => "bun",
            Self::Cargo => "cargo",
            Self::GoModules => "go modules",
            Self::Pipenv => "pipenv",
            Self::Poetry => "poetry",
            Self::Bundler => "bundler",
            Self::Composer => "composer",
        }
    }

    /// The executable that runs this manager, which is not always its name.
    pub fn binary(self) -> &'static str {
        match self {
            Self::Pnpm => "pnpm",
            Self::Yarn => "yarn",
            Self::Npm => "npm",
            Self::Bun => "bun",
            Self::Cargo => "cargo",
            Self::GoModules => "go",
            Self::Pipenv => "pipenv",
            Self::Poetry => "poetry",
            Self::Bundler => "bundle",
            Self::Composer => "composer",
        }
    }

    /// The lockfile whose presence means this manager owns the checkout.
    pub fn lockfile(self) -> &'static str {
        match self {
            Self::Pnpm => "pnpm-lock.yaml",
            Self::Yarn => "yarn.lock",
            Self::Npm => "package-lock.json",
            Self::Bun => "bun.lockb",
            Self::Cargo => "Cargo.lock",
            Self::GoModules => "go.sum",
            Self::Pipenv => "Pipfile.lock",
            Self::Poetry => "poetry.lock",
            Self::Bundler => "Gemfile.lock",
            Self::Composer => "composer.lock",
        }
    }

    /// The install that installs exactly what the lockfile pins and fails
    /// rather than resolving a new dependency tree.
    pub fn frozen_install(self) -> &'static str {
        match self {
            Self::Pnpm => "pnpm install --frozen-lockfile",
            Self::Yarn => "yarn install --frozen-lockfile",
            Self::Npm => "npm ci",
            Self::Bun => "bun install --frozen-lockfile",
            Self::Cargo => "cargo fetch --locked",
            Self::GoModules => "go mod download",
            Self::Pipenv => "pipenv sync",
            Self::Poetry => "poetry install --no-interaction",
            Self::Bundler => "bundle install --frozen",
            Self::Composer => "composer install",
        }
    }

    /// The manifest this manager reads, when it has one that declares scripts.
    pub fn manifest(self) -> Option<&'static str> {
        match self {
            Self::Pnpm | Self::Yarn | Self::Npm | Self::Bun => Some("package.json"),
            Self::Composer => Some("composer.json"),
            Self::Poetry => Some("pyproject.toml"),
            _ => None,
        }
    }

    /// How a manifest script is invoked under this manager.
    pub fn run_prefix(self) -> Option<&'static str> {
        match self {
            Self::Pnpm => Some("pnpm run"),
            Self::Yarn => Some("yarn run"),
            Self::Npm => Some("npm run"),
            Self::Bun => Some("bun run"),
            Self::Composer => Some("composer run-script"),
            _ => None,
        }
    }

    /// Directories a frozen install fills that are keyed by the lockfile, so
    /// reusing them between runs cannot change what is installed.
    pub fn cache_paths(self) -> &'static [&'static str] {
        match self {
            Self::Pnpm | Self::Yarn | Self::Npm | Self::Bun => &["node_modules"],
            Self::Cargo => &["target"],
            Self::GoModules => &[],
            Self::Pipenv | Self::Poetry => &[".venv"],
            Self::Bundler => &["vendor/bundle"],
            Self::Composer => &["vendor"],
        }
    }
}

/// How to install this repository's dependencies without changing what it
/// pins: the manager that owns it, its lockfile, and whether the result may be
/// reused.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallPlan {
    pub manager: PackageManager,
    pub lockfile: PathBuf,
    pub command: String,
    pub frozen: bool,
    pub install_scripts: Vec<SetupCommand>,
    pub cache_paths: Vec<PathBuf>,
}

impl InstallPlan {
    /// A cache is only safe when the install is pinned by a lockfile and no
    /// repository script runs during it.
    pub fn cache_is_safe(&self) -> bool {
        self.frozen && self.install_scripts.is_empty()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum DevServiceKind {
    Database,
    Cache,
    MessageQueue,
    AppServer,
    Other,
}

impl DevServiceKind {
    pub fn label(self) -> &'static str {
        match self {
            Self::Database => "database",
            Self::Cache => "cache",
            Self::MessageQueue => "message queue",
            Self::AppServer => "app server",
            Self::Other => "service",
        }
    }

    /// Classify a container image or a service name by the software it runs.
    pub fn classify(image_or_name: &str) -> Self {
        let value = image_or_name.to_ascii_lowercase();
        const DATABASES: &[&str] = &[
            "postgres",
            "postgis",
            "pgvector",
            "mysql",
            "mariadb",
            "mongo",
            "cockroach",
            "clickhouse",
            "cassandra",
            "sqlserver",
            "neon",
        ];
        const CACHES: &[&str] = &["redis", "valkey", "memcached", "dragonfly"];
        const QUEUES: &[&str] = &["rabbitmq", "kafka", "redpanda", "nats", "pulsar"];
        if DATABASES.iter().any(|name| value.contains(name)) {
            return Self::Database;
        }
        if CACHES.iter().any(|name| value.contains(name)) {
            return Self::Cache;
        }
        if QUEUES.iter().any(|name| value.contains(name)) {
            return Self::MessageQueue;
        }
        if ["web", "app", "api", "server"]
            .iter()
            .any(|name| value == *name)
        {
            return Self::AppServer;
        }
        Self::Other
    }
}

/// A service a checkout needs running locally, and the command the repository
/// itself declares for starting it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DevService {
    pub kind: DevServiceKind,
    pub name: String,
    pub source: PathBuf,
    pub start: Option<String>,
}

/// The development database a checkout expects, with the commands the
/// repository declares for it. `seed` is present only when the repository
/// declares a seed command.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DatabaseSetup {
    pub service: Option<DevService>,
    pub url_variables: Vec<String>,
    pub migrate: Option<SetupCommand>,
    pub seed: Option<SetupCommand>,
}

/// An environment variable the repository declares, by name and never by
/// value. `required` means it is declared with no default.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvDeclaration {
    pub name: String,
    pub source: PathBuf,
    pub required: bool,
}

/// Everything a checkout says about bringing itself up.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct EnvironmentSetup {
    pub sources: Vec<SetupSource>,
    pub install: Option<InstallPlan>,
    pub services: Vec<DevService>,
    pub database: Option<DatabaseSetup>,
    pub variables: Vec<EnvDeclaration>,
}

impl EnvironmentSetup {
    pub fn source(&self, kind: SetupSourceKind) -> Option<&SetupSource> {
        self.sources.iter().find(|source| source.kind == kind)
    }

    pub fn services_of(&self, kind: DevServiceKind) -> impl Iterator<Item = &DevService> {
        self.services
            .iter()
            .filter(move |service| service.kind == kind)
    }

    pub fn required_variables(&self) -> impl Iterator<Item = &EnvDeclaration> {
        self.variables.iter().filter(|variable| variable.required)
    }

    /// Required variables the process does not have. Names only: a value never
    /// leaves the environment it was read from.
    pub fn missing_variables(&self, present: &BTreeSet<String>) -> Vec<&EnvDeclaration> {
        self.required_variables()
            .filter(|variable| !present.contains(&variable.name))
            .collect()
    }

    /// One line naming every missing variable and where it was declared.
    pub fn missing_variables_message(&self, present: &BTreeSet<String>) -> Option<String> {
        let missing = self.missing_variables(present);
        if missing.is_empty() {
            return None;
        }
        let named = missing
            .iter()
            .map(|variable| {
                format!(
                    "{} (declared in {})",
                    variable.name,
                    variable.source.display()
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        Some(format!(
            "{} required environment variable(s) are not set: {named}",
            missing.len()
        ))
    }
}

fn read_capped(path: &Path) -> Option<String> {
    let metadata = std::fs::metadata(path).ok()?;
    if !metadata.is_file() || metadata.len() > MAX_READ_BYTES {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

/// `scripts` from a package.json or composer.json, in declaration order.
pub fn parse_manifest_scripts(text: &str) -> Vec<(String, String)> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(text) else {
        return Vec::new();
    };
    let Some(scripts) = value.get("scripts").and_then(serde_json::Value::as_object) else {
        return Vec::new();
    };
    scripts
        .iter()
        .filter_map(|(name, body)| match body {
            serde_json::Value::String(body) => Some((name.clone(), body.clone())),
            serde_json::Value::Array(parts) => Some((
                name.clone(),
                parts
                    .iter()
                    .filter_map(serde_json::Value::as_str)
                    .collect::<Vec<_>>()
                    .join(" && "),
            )),
            _ => None,
        })
        .take(MAX_COMMANDS_PER_SOURCE)
        .collect()
}

/// Targets a Makefile declares, skipping pattern rules and the directives that
/// are not runnable targets.
pub fn parse_makefile_targets(text: &str) -> Vec<String> {
    let mut targets = Vec::new();
    for line in text.lines() {
        if line.starts_with(char::is_whitespace) || line.starts_with('#') {
            continue;
        }
        let Some((head, _)) = line.split_once(':') else {
            continue;
        };
        let head = head.trim();
        if head.is_empty() || head.starts_with('.') || head.contains(['%', '=', '$', '(']) {
            continue;
        }
        for target in head.split_whitespace() {
            if targets.len() >= MAX_COMMANDS_PER_SOURCE {
                return targets;
            }
            if !targets.iter().any(|known| known == target) {
                targets.push(target.to_string());
            }
        }
    }
    targets
}

/// Recipes a justfile declares. Assignments, settings and the item keywords
/// share the file and are not recipes.
pub fn parse_justfile_recipes(text: &str) -> Vec<String> {
    const ITEM_KEYWORDS: &[&str] = &["alias", "set", "export", "import", "mod"];
    let mut recipes = Vec::new();
    for line in text.lines() {
        if line.starts_with(char::is_whitespace) || line.starts_with(['#', '@', '[']) {
            continue;
        }
        if line.contains(":=") {
            continue;
        }
        let Some((head, _)) = line.split_once(':') else {
            continue;
        };
        let Some(name) = head.split_whitespace().next() else {
            continue;
        };
        if name.is_empty() || ITEM_KEYWORDS.contains(&name) {
            continue;
        }
        if recipes.len() >= MAX_COMMANDS_PER_SOURCE {
            break;
        }
        if !recipes.iter().any(|known| known == name) {
            recipes.push(name.to_string());
        }
    }
    recipes
}

/// Service names and images from a Compose file, read the same shallow way the
/// pnpm workspace list is read rather than pulling in a YAML parser.
pub fn parse_compose_services(text: &str) -> Vec<(String, Option<String>)> {
    let mut services: Vec<(String, Option<String>)> = Vec::new();
    let mut in_services = false;
    let mut service_indent: Option<usize> = None;
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.trim().is_empty() || trimmed.trim_start().starts_with('#') {
            continue;
        }
        let indent = trimmed.len() - trimmed.trim_start().len();
        if indent == 0 {
            in_services = trimmed.trim_end_matches(':').trim() == "services";
            service_indent = None;
            continue;
        }
        if !in_services {
            continue;
        }
        let body = trimmed.trim_start();
        match service_indent {
            None => {
                if let Some(name) = body.strip_suffix(':') {
                    service_indent = Some(indent);
                    services.push((name.trim().to_string(), None));
                }
            }
            Some(known) if indent == known => {
                if let Some(name) = body.strip_suffix(':') {
                    if services.len() >= MAX_DEV_SERVICES {
                        break;
                    }
                    services.push((name.trim().to_string(), None));
                }
            }
            Some(known) if indent > known => {
                if let Some(image) = body.strip_prefix("image:") {
                    if let Some(last) = services.last_mut() {
                        last.1 = Some(image.trim().trim_matches('"').to_string());
                    }
                }
            }
            _ => {}
        }
    }
    services
}

/// Variable names a dotenv-style file declares. A name with no value on the
/// right is required; one with a value carries its own default.
pub fn parse_dotenv_declarations(text: &str) -> Vec<(String, bool)> {
    let mut declared = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        let line = line.strip_prefix("export ").unwrap_or(line);
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((name, value)) = line.split_once('=') else {
            continue;
        };
        let name = name.trim();
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            continue;
        }
        if declared.len() >= MAX_ENV_DECLARATIONS {
            break;
        }
        let value = value.trim().trim_matches(['"', '\'']);
        declared.push((name.to_string(), value.is_empty()));
    }
    declared
}

/// `${VAR}` references in a Compose file. A reference with a `:-` or `-`
/// fallback supplies its own default and is not required.
pub fn parse_compose_variable_references(text: &str) -> Vec<(String, bool)> {
    let mut found: Vec<(String, bool)> = Vec::new();
    let bytes = text.as_bytes();
    let mut index = 0;
    while let Some(offset) = text[index..].find("${") {
        let start = index + offset + 2;
        let Some(end) = text[start..].find('}') else {
            break;
        };
        let end = start + end;
        let body = &text[start..end];
        index = end + 1;
        let _ = bytes;
        let (name, has_default) = match body.find([':', '-']) {
            Some(split) => (&body[..split], true),
            None => (body, false),
        };
        let name = name.trim();
        if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            continue;
        }
        if found.len() >= MAX_ENV_DECLARATIONS {
            break;
        }
        match found.iter_mut().find(|(known, _)| known == name) {
            Some(entry) => entry.1 = entry.1 && !has_default,
            None => found.push((name.to_string(), !has_default)),
        }
    }
    found
}

fn first_existing(root: &Path, candidates: &[&'static str]) -> Option<PathBuf> {
    candidates
        .iter()
        .map(|candidate| root.join(candidate))
        .find(|path| path.exists())
}

fn run_prefix_for(root: &Path) -> &'static str {
    detect_package_managers(root)
        .into_iter()
        .find_map(PackageManager::run_prefix)
        .unwrap_or("npm run")
}

fn manifest_commands(root: &Path, path: &Path) -> Vec<SetupCommand> {
    let Some(text) = read_capped(path) else {
        return Vec::new();
    };
    if path
        .extension()
        .is_some_and(|extension| extension == "toml")
    {
        return Vec::new();
    }
    let prefix = run_prefix_for(root);
    parse_manifest_scripts(&text)
        .into_iter()
        .map(|(name, _)| SetupCommand::new(&name, format!("{prefix} {name}")))
        .collect()
}

/// Every setup source the checkout declares, one entry per kind.
pub fn discover_setup_sources(root: &Path) -> Vec<SetupSource> {
    let mut sources = Vec::new();
    for kind in SetupSourceKind::ALL.iter().copied() {
        let candidates = kind.candidates();
        let Some(path) = first_existing(root, &candidates) else {
            continue;
        };
        let commands = match kind {
            SetupSourceKind::PackageScripts => manifest_commands(root, &path),
            SetupSourceKind::Makefile => read_capped(&path)
                .map(|text| {
                    parse_makefile_targets(&text)
                        .into_iter()
                        .map(|target| SetupCommand::new(&target, format!("make {target}")))
                        .collect()
                })
                .unwrap_or_default(),
            SetupSourceKind::Justfile => read_capped(&path)
                .map(|text| {
                    parse_justfile_recipes(&text)
                        .into_iter()
                        .map(|recipe| SetupCommand::new(&recipe, format!("just {recipe}")))
                        .collect()
                })
                .unwrap_or_default(),
            SetupSourceKind::SetupScript => {
                let relative = path.strip_prefix(root).unwrap_or(&path);
                let run = format!("./{}", relative.display());
                vec![SetupCommand::new("setup", run)]
            }
            _ => Vec::new(),
        };
        sources.push(SetupSource {
            kind,
            path,
            commands,
        });
    }
    sources
}

/// Package managers that own this checkout, most specific first.
pub fn detect_package_managers(root: &Path) -> Vec<PackageManager> {
    PackageManager::ALL
        .iter()
        .copied()
        .filter(|manager| root.join(manager.lockfile()).exists())
        .collect()
}

/// The install this repository pins, or `None` when no lockfile claims it.
pub fn install_plan(root: &Path) -> Option<InstallPlan> {
    let manager = detect_package_managers(root).into_iter().next()?;
    let lockfile = root.join(manager.lockfile());
    let command = frozen_install_command(root, manager);
    let install_scripts = manager
        .manifest()
        .map(|manifest| root.join(manifest))
        .and_then(|path| read_capped(&path))
        .map(|text| {
            let prefix = manager.run_prefix().unwrap_or("npm run");
            parse_manifest_scripts(&text)
                .into_iter()
                .filter(|(name, _)| INSTALL_LIFECYCLE_SCRIPTS.contains(&name.as_str()))
                .map(|(name, _)| SetupCommand::new(&name, format!("{prefix} {name}")))
                .collect()
        })
        .unwrap_or_default();
    Some(InstallPlan {
        manager,
        lockfile,
        command,
        frozen: true,
        install_scripts,
        cache_paths: manager
            .cache_paths()
            .iter()
            .map(|path| root.join(path))
            .collect(),
    })
}

/// Yarn's frozen install changed name between its two generations, and the
/// repository says which one it is.
pub fn frozen_install_command(root: &Path, manager: PackageManager) -> String {
    if manager == PackageManager::Yarn && root.join(".yarnrc.yml").exists() {
        return "yarn install --immutable".to_string();
    }
    manager.frozen_install().to_string()
}

fn procfile_services(root: &Path) -> Vec<DevService> {
    let path = root.join("Procfile");
    let Some(text) = read_capped(&path) else {
        return Vec::new();
    };
    text.lines()
        .filter_map(|line| line.split_once(':'))
        .filter(|(name, _)| {
            !name.trim().is_empty()
                && name
                    .trim()
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        })
        .take(MAX_DEV_SERVICES)
        .map(|(name, command)| DevService {
            kind: DevServiceKind::classify(name.trim()),
            name: name.trim().to_string(),
            source: path.clone(),
            start: Some(command.trim().to_string()),
        })
        .collect()
}

fn compose_services(root: &Path) -> Vec<DevService> {
    let Some(path) = first_existing(root, COMPOSE_FILES) else {
        return Vec::new();
    };
    let Some(text) = read_capped(&path) else {
        return Vec::new();
    };
    parse_compose_services(&text)
        .into_iter()
        .map(|(name, image)| DevService {
            kind: DevServiceKind::classify(image.as_deref().unwrap_or(&name)),
            start: Some(format!("docker compose up -d {name}")),
            name,
            source: path.clone(),
        })
        .collect()
}

fn script_services(root: &Path, sources: &[SetupSource]) -> Vec<DevService> {
    let Some(source) = sources
        .iter()
        .find(|source| source.kind == SetupSourceKind::PackageScripts)
    else {
        return Vec::new();
    };
    source
        .commands
        .iter()
        .filter(|command| SERVER_SCRIPT_NAMES.contains(&command.name.as_str()))
        .map(|command| DevService {
            kind: DevServiceKind::AppServer,
            name: command.name.clone(),
            source: source.path.clone(),
            start: Some(command.run.clone()),
        })
        .chain(
            root.join("Procfile")
                .exists()
                .then(Vec::new)
                .into_iter()
                .flatten(),
        )
        .collect()
}

/// Every local service the checkout declares, from Compose, a Procfile and the
/// package scripts that start one.
pub fn discover_dev_services(root: &Path, sources: &[SetupSource]) -> Vec<DevService> {
    let mut services = compose_services(root);
    services.extend(procfile_services(root));
    services.extend(script_services(root, sources));
    services.truncate(MAX_DEV_SERVICES);
    services
}

fn command_named(sources: &[SetupSource], names: &[&str]) -> Option<SetupCommand> {
    for source in sources {
        for name in names {
            if let Some(command) = source.command(name) {
                return Some(command.clone());
            }
        }
    }
    None
}

/// The development database the checkout expects. `seed` is `Some` only when
/// the repository declares a seed command of its own.
pub fn database_setup(
    sources: &[SetupSource],
    services: &[DevService],
    variables: &[EnvDeclaration],
) -> Option<DatabaseSetup> {
    let service = services
        .iter()
        .find(|service| service.kind == DevServiceKind::Database)
        .cloned();
    let url_variables: Vec<String> = variables
        .iter()
        .filter(|variable| {
            let name = variable.name.as_str();
            name.ends_with("DATABASE_URL")
                || name.ends_with("DB_URL")
                || name.starts_with("POSTGRES_")
                || name.starts_with("MYSQL_")
        })
        .map(|variable| variable.name.clone())
        .collect();
    let migrate = command_named(sources, MIGRATE_SCRIPT_NAMES);
    let seed = command_named(sources, SEED_SCRIPT_NAMES);
    if service.is_none() && url_variables.is_empty() && migrate.is_none() {
        return None;
    }
    Some(DatabaseSetup {
        service,
        url_variables,
        migrate,
        seed,
    })
}

const DOTENV_TEMPLATES: &[&str] = &[
    ".env.example",
    ".env.sample",
    ".env.template",
    ".env.defaults",
    ".env.dist",
];

/// Environment variables the checkout declares, by name. A value is never
/// read out of a template file.
pub fn declared_env_variables(root: &Path) -> Vec<EnvDeclaration> {
    let mut declared: Vec<EnvDeclaration> = Vec::new();
    let mut seen: BTreeMap<String, usize> = BTreeMap::new();
    let mut record = |name: String, required: bool, source: PathBuf| match seen.get(&name) {
        Some(index) => {
            let existing: &mut EnvDeclaration = &mut declared[*index];
            existing.required = existing.required || required;
        }
        None => {
            seen.insert(name.clone(), declared.len());
            declared.push(EnvDeclaration {
                name,
                source,
                required,
            });
        }
    };
    for template in DOTENV_TEMPLATES {
        let path = root.join(template);
        let Some(text) = read_capped(&path) else {
            continue;
        };
        for (name, required) in parse_dotenv_declarations(&text) {
            record(name, required, path.clone());
        }
    }
    if let Some(path) = first_existing(root, COMPOSE_FILES) {
        if let Some(text) = read_capped(&path) {
            for (name, required) in parse_compose_variable_references(&text) {
                record(name, required, path.clone());
            }
        }
    }
    declared.truncate(MAX_ENV_DECLARATIONS);
    declared
}

/// Read a checkout's own account of how it is set up.
pub fn discover_environment_setup(root: &Path) -> EnvironmentSetup {
    let sources = discover_setup_sources(root);
    let services = discover_dev_services(root, &sources);
    let variables = declared_env_variables(root);
    let database = database_setup(&sources, &services, &variables);
    EnvironmentSetup {
        install: install_plan(root),
        database,
        sources,
        services,
        variables,
    }
}

/// The setup entry point a repository declares, in the order a user would
/// reach for it.
pub fn setup_entry_point(setup: &EnvironmentSetup) -> Option<SetupCommand> {
    for kind in [
        SetupSourceKind::SetupScript,
        SetupSourceKind::PackageScripts,
        SetupSourceKind::Justfile,
        SetupSourceKind::Makefile,
    ] {
        let Some(source) = setup.source(kind) else {
            continue;
        };
        for name in SETUP_SCRIPT_NAMES {
            if let Some(command) = source.command(name) {
                return Some(command.clone());
            }
        }
    }
    setup
        .install
        .as_ref()
        .map(|plan| SetupCommand::new(plan.manager.label(), plan.command.clone()))
}

/// The package manager label the prompt context reports, from the same table
/// the install plan is built from.
pub fn package_manager_label(root: &Path) -> Option<&'static str> {
    detect_package_managers(root)
        .into_iter()
        .next()
        .map(PackageManager::label)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn repo() -> tempfile::TempDir {
        tempfile::tempdir().expect("temp dir")
    }

    fn write(root: &Path, relative: &str, body: &str) {
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(path, body).expect("write file");
    }

    #[test]
    fn every_declared_setup_source_kind_is_discovered_from_a_checkout() {
        let dir = repo();
        let root = dir.path();
        write(root, "README.md", "# project");
        write(root, "CONTRIBUTING.md", "## how to contribute");
        write(
            root,
            "package.json",
            r#"{"scripts":{"setup":"node setup.js"}}"#,
        );
        write(root, "Makefile", "setup:\n\techo setup\n");
        write(root, "justfile", "setup:\n    echo setup\n");
        write(
            root,
            "docker-compose.yml",
            "services:\n  db:\n    image: postgres:16\n",
        );
        write(root, ".devcontainer/devcontainer.json", "{}");
        write(root, "bin/setup", "#!/bin/sh\n");
        write(root, ".github/workflows/ci.yml", "on: push\n");

        let sources = discover_setup_sources(root);
        let found: BTreeSet<SetupSourceKind> = sources.iter().map(|source| source.kind).collect();
        for kind in SetupSourceKind::ALL.iter().copied() {
            assert!(
                found.contains(&kind),
                "{} was declared in the checkout and not discovered",
                kind.label()
            );
        }
        assert_eq!(found.len(), SetupSourceKind::ALL.len());
    }

    #[test]
    fn a_checkout_that_declares_nothing_yields_no_setup_sources() {
        let dir = repo();
        assert!(discover_setup_sources(dir.path()).is_empty());
    }

    #[test]
    fn every_setup_source_kind_names_at_least_one_file_and_one_label() {
        for kind in SetupSourceKind::ALL.iter().copied() {
            assert!(
                !kind.candidates().is_empty(),
                "{kind:?} declares no candidate path"
            );
            assert!(!kind.label().is_empty(), "{kind:?} has no label");
        }
    }

    #[test]
    fn runnable_setup_sources_carry_the_command_a_user_would_type() {
        let dir = repo();
        let root = dir.path();
        write(root, "package-lock.json", "{}");
        write(
            root,
            "package.json",
            r#"{"scripts":{"setup":"node setup.js","dev":"next dev"}}"#,
        );
        write(
            root,
            "Makefile",
            ".PHONY: setup\nsetup: deps\n\techo setup\ndeps:\n\ttrue\n",
        );
        write(
            root,
            "justfile",
            "alias b := build\nsetup:\n    echo setup\n",
        );

        let sources = discover_setup_sources(root);
        let scripts = sources
            .iter()
            .find(|source| source.kind == SetupSourceKind::PackageScripts)
            .expect("package scripts discovered");
        assert_eq!(
            scripts.command("setup").map(|command| command.run.as_str()),
            Some("npm run setup")
        );
        let make = sources
            .iter()
            .find(|source| source.kind == SetupSourceKind::Makefile)
            .expect("makefile discovered");
        assert_eq!(
            make.command("setup").map(|command| command.run.as_str()),
            Some("make setup")
        );
        assert!(make.command(".PHONY").is_none());
        let just = sources
            .iter()
            .find(|source| source.kind == SetupSourceKind::Justfile)
            .expect("justfile discovered");
        assert_eq!(
            just.command("setup").map(|command| command.run.as_str()),
            Some("just setup")
        );
        assert!(just.command("alias").is_none());
    }

    #[test]
    fn the_setup_entry_point_prefers_what_the_repository_declares_over_a_bare_install() {
        let dir = repo();
        let root = dir.path();
        write(root, "pnpm-lock.yaml", "lockfileVersion: 9\n");
        write(root, "package.json", r#"{"scripts":{"build":"tsc"}}"#);
        let setup = discover_environment_setup(root);
        assert_eq!(
            setup_entry_point(&setup).map(|command| command.run),
            Some("pnpm install --frozen-lockfile".to_string())
        );

        write(
            root,
            "package.json",
            r#"{"scripts":{"setup":"./bootstrap"}}"#,
        );
        let setup = discover_environment_setup(root);
        assert_eq!(
            setup_entry_point(&setup).map(|command| command.run),
            Some("pnpm run setup".to_string())
        );
    }

    #[test]
    fn every_package_manager_is_identified_by_its_lockfile_and_installs_frozen() {
        for manager in PackageManager::ALL.iter().copied() {
            let dir = repo();
            let root = dir.path();
            write(root, manager.lockfile(), "");
            let plan = install_plan(root).expect("a lockfile names an install");
            assert_eq!(plan.manager, manager, "{} lockfile", manager.label());
            assert_eq!(plan.lockfile, root.join(manager.lockfile()));
            assert!(plan.frozen, "{} install is not frozen", manager.label());
            assert_eq!(plan.command, manager.frozen_install());
            assert_eq!(
                plan.command.split_whitespace().next(),
                Some(manager.binary()),
                "{} install does not run its own binary",
                manager.label()
            );
        }
    }

    #[test]
    fn no_two_package_managers_claim_the_same_lockfile_or_label() {
        let lockfiles: BTreeSet<&str> = PackageManager::ALL
            .iter()
            .map(|manager| manager.lockfile())
            .collect();
        assert_eq!(lockfiles.len(), PackageManager::ALL.len());
        let labels: BTreeSet<&str> = PackageManager::ALL
            .iter()
            .map(|manager| manager.label())
            .collect();
        assert_eq!(labels.len(), PackageManager::ALL.len());
    }

    #[test]
    fn the_most_specific_lockfile_wins_when_a_checkout_carries_several() {
        let dir = repo();
        let root = dir.path();
        write(root, "package-lock.json", "{}");
        write(root, "pnpm-lock.yaml", "lockfileVersion: 9\n");
        let plan = install_plan(root).expect("install plan");
        assert_eq!(plan.manager, PackageManager::Pnpm);
        assert_eq!(plan.command, "pnpm install --frozen-lockfile");
    }

    #[test]
    fn a_checkout_with_no_lockfile_has_no_install_plan() {
        let dir = repo();
        write(dir.path(), "package.json", r#"{"scripts":{}}"#);
        assert!(install_plan(dir.path()).is_none());
    }

    #[test]
    fn yarn_installs_immutably_under_the_generation_the_repository_declares() {
        let dir = repo();
        let root = dir.path();
        write(root, "yarn.lock", "");
        assert_eq!(
            install_plan(root).expect("plan").command,
            "yarn install --frozen-lockfile"
        );
        write(root, ".yarnrc.yml", "nodeLinker: node-modules\n");
        assert_eq!(
            install_plan(root).expect("plan").command,
            "yarn install --immutable"
        );
    }

    #[test]
    fn every_install_lifecycle_script_the_manifest_declares_is_reported() {
        let dir = repo();
        let root = dir.path();
        write(root, "pnpm-lock.yaml", "");
        let scripts = INSTALL_LIFECYCLE_SCRIPTS
            .iter()
            .map(|name| format!("\"{name}\":\"echo {name}\""))
            .collect::<Vec<_>>()
            .join(",");
        write(
            root,
            "package.json",
            &format!("{{\"scripts\":{{{scripts},\"build\":\"tsc\"}}}}"),
        );
        let plan = install_plan(root).expect("plan");
        let reported: BTreeSet<&str> = plan
            .install_scripts
            .iter()
            .map(|command| command.name.as_str())
            .collect();
        for name in INSTALL_LIFECYCLE_SCRIPTS {
            assert!(reported.contains(name), "{name} was not reported");
        }
        assert!(!reported.contains("build"));
    }

    #[test]
    fn a_cache_is_only_safe_when_the_install_is_frozen_and_runs_no_repository_script() {
        let dir = repo();
        let root = dir.path();
        write(root, "pnpm-lock.yaml", "");
        write(root, "package.json", r#"{"scripts":{"build":"tsc"}}"#);
        let plan = install_plan(root).expect("plan");
        assert!(plan.cache_is_safe());
        assert!(!plan.cache_paths.is_empty());

        write(
            root,
            "package.json",
            r#"{"scripts":{"postinstall":"./gen"}}"#,
        );
        let plan = install_plan(root).expect("plan");
        assert!(!plan.cache_is_safe());
    }

    #[test]
    fn compose_declares_a_database_a_cache_a_queue_and_an_app_server() {
        let dir = repo();
        let root = dir.path();
        write(
            root,
            "docker-compose.yml",
            "version: '3'\nservices:\n  db:\n    image: postgres:16\n    ports:\n      - 5432:5432\n  cache:\n    image: redis:7\n  bus:\n    image: rabbitmq:3\n  web:\n    build: .\n",
        );
        let setup = discover_environment_setup(root);
        let kinds: BTreeMap<&str, DevServiceKind> = setup
            .services
            .iter()
            .map(|service| (service.name.as_str(), service.kind))
            .collect();
        assert_eq!(kinds.get("db"), Some(&DevServiceKind::Database));
        assert_eq!(kinds.get("cache"), Some(&DevServiceKind::Cache));
        assert_eq!(kinds.get("bus"), Some(&DevServiceKind::MessageQueue));
        assert_eq!(kinds.get("web"), Some(&DevServiceKind::AppServer));
        let db = setup
            .services_of(DevServiceKind::Database)
            .next()
            .expect("database service");
        assert_eq!(db.start.as_deref(), Some("docker compose up -d db"));
    }

    #[test]
    fn a_procfile_and_a_dev_script_both_name_the_local_app_server() {
        let dir = repo();
        let root = dir.path();
        write(
            root,
            "Procfile",
            "web: bin/rails server\nworker: bin/jobs\n",
        );
        write(root, "pnpm-lock.yaml", "");
        write(root, "package.json", r#"{"scripts":{"dev":"next dev"}}"#);
        let setup = discover_environment_setup(root);
        let servers: Vec<&str> = setup
            .services_of(DevServiceKind::AppServer)
            .map(|service| service.name.as_str())
            .collect();
        assert!(
            servers.contains(&"web"),
            "procfile web process: {servers:?}"
        );
        assert!(servers.contains(&"dev"), "package dev script: {servers:?}");
        let worker = setup
            .services
            .iter()
            .find(|service| service.name == "worker")
            .expect("worker process");
        assert_eq!(worker.start.as_deref(), Some("bin/jobs"));
    }

    #[test]
    fn the_development_database_is_identified_from_the_service_and_the_declared_url() {
        let dir = repo();
        let root = dir.path();
        write(
            root,
            "docker-compose.yml",
            "services:\n  db:\n    image: postgres:16\n",
        );
        write(root, ".env.example", "DATABASE_URL=\nPORT=3000\n");
        write(root, "pnpm-lock.yaml", "");
        write(
            root,
            "package.json",
            r#"{"scripts":{"db:migrate":"prisma migrate deploy"}}"#,
        );
        let setup = discover_environment_setup(root);
        let database = setup.database.expect("a development database");
        assert_eq!(
            database.service.map(|service| service.name),
            Some("db".to_string())
        );
        assert_eq!(database.url_variables, vec!["DATABASE_URL".to_string()]);
        assert_eq!(
            database.migrate.map(|command| command.run),
            Some("pnpm run db:migrate".to_string())
        );
    }

    #[test]
    fn seeding_is_offered_only_when_the_repository_declares_a_seed_command() {
        let dir = repo();
        let root = dir.path();
        write(root, "pnpm-lock.yaml", "");
        write(root, ".env.example", "DATABASE_URL=\n");
        write(
            root,
            "package.json",
            r#"{"scripts":{"db:migrate":"prisma migrate deploy"}}"#,
        );
        let setup = discover_environment_setup(root);
        assert!(setup.database.expect("database").seed.is_none());

        write(
            root,
            "package.json",
            r#"{"scripts":{"db:migrate":"prisma migrate deploy","db:seed":"tsx seed.ts"}}"#,
        );
        let setup = discover_environment_setup(root);
        assert_eq!(
            setup.database.expect("database").seed.map(|c| c.run),
            Some("pnpm run db:seed".to_string())
        );
    }

    #[test]
    fn a_checkout_with_no_database_signal_reports_none() {
        let dir = repo();
        let root = dir.path();
        write(root, "pnpm-lock.yaml", "");
        write(root, "package.json", r#"{"scripts":{"build":"tsc"}}"#);
        assert!(discover_environment_setup(root).database.is_none());
    }

    #[test]
    fn a_declared_variable_without_a_default_is_required_and_one_with_a_default_is_not() {
        let dir = repo();
        let root = dir.path();
        write(
            root,
            ".env.example",
            "# comment\nDATABASE_URL=\nexport API_KEY=\nPORT=3000\nnot a variable\n",
        );
        let setup = discover_environment_setup(root);
        let required: BTreeSet<&str> = setup
            .required_variables()
            .map(|variable| variable.name.as_str())
            .collect();
        assert_eq!(
            required,
            BTreeSet::from(["DATABASE_URL", "API_KEY"]),
            "required set"
        );
        let port = setup
            .variables
            .iter()
            .find(|variable| variable.name == "PORT")
            .expect("PORT declared");
        assert!(!port.required);
    }

    #[test]
    fn a_compose_reference_without_a_fallback_is_required() {
        let dir = repo();
        let root = dir.path();
        write(
            root,
            "docker-compose.yml",
            "services:\n  web:\n    image: app\n    environment:\n      TOKEN: ${API_TOKEN}\n      PORT: ${PORT:-3000}\n",
        );
        let setup = discover_environment_setup(root);
        let required: BTreeSet<&str> = setup
            .required_variables()
            .map(|variable| variable.name.as_str())
            .collect();
        assert!(required.contains("API_TOKEN"));
        assert!(!required.contains("PORT"));
    }

    #[test]
    fn a_missing_required_variable_is_named_with_where_it_was_declared() {
        let dir = repo();
        let root = dir.path();
        write(root, ".env.example", "DATABASE_URL=\nAPI_KEY=\n");
        let setup = discover_environment_setup(root);

        let present = BTreeSet::from(["DATABASE_URL".to_string()]);
        let missing = setup.missing_variables(&present);
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].name, "API_KEY");
        let message = setup
            .missing_variables_message(&present)
            .expect("a message naming the gap");
        assert!(message.contains("API_KEY"), "{message}");
        assert!(message.contains(".env.example"), "{message}");
        assert!(!message.contains("DATABASE_URL"), "{message}");

        let all_present = BTreeSet::from(["DATABASE_URL".to_string(), "API_KEY".to_string()]);
        assert!(setup.missing_variables_message(&all_present).is_none());
    }

    #[test]
    fn a_declared_variable_never_carries_its_value() {
        let dir = repo();
        let root = dir.path();
        write(
            root,
            ".env.example",
            "STRIPE_KEY=sk_test_never_copied_anywhere\n",
        );
        let setup = discover_environment_setup(root);
        let rendered = format!("{setup:?}");
        assert!(
            !rendered.contains("sk_test_never_copied_anywhere"),
            "a declared value reached the setup record"
        );
        let key = setup
            .variables
            .iter()
            .find(|variable| variable.name == "STRIPE_KEY")
            .expect("name recorded");
        assert!(!key.required);
    }

    #[test]
    fn the_package_manager_label_comes_from_the_same_table_as_the_install() {
        for manager in PackageManager::ALL.iter().copied() {
            let dir = repo();
            write(dir.path(), manager.lockfile(), "");
            assert_eq!(
                package_manager_label(dir.path()),
                Some(manager.label()),
                "{} is labelled differently by the two callers",
                manager.label()
            );
        }
    }
}
