//! Published-release comparison for `agi update --check`.
//!
//! Reads the same target-scoped feed the web control plane serves at
//! `/api/releases/cli/latest` (`apps/web/app/api/releases/cli/latest/route.ts`),
//! which resolves the newest stable `v-cli-*` GitHub release. Nothing is
//! downloaded: the command prints the install command the README documents.

use agiworkforce_sandbox_policy::host_path::{find_program, trusted_path_entries, untrusted_roots};
use anyhow::{anyhow, bail, Context};
use semver::Version;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::ffi::{OsStr, OsString};
use std::io::{Read, Seek};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::config::CliConfig;
use crate::platform::runtime::session::PrivacyMode;
use crate::tier_cache;

const RELEASE_FETCH_TIMEOUT: Duration = Duration::from_secs(5);
const RELEASE_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(600);
const SELF_CHECK_TIMEOUT: Duration = Duration::from_secs(15);
const CLI_RELEASE_PATH: &str = "/api/releases/cli/latest";
const INSTALL_SCRIPT_URL: &str = "https://agiworkforce.com/install.sh";
const INSTALL_SCRIPT: &str = include_str!("../../web/public/install.sh");
const PUBLIC_KEY_BEGIN: &str = "-----BEGIN PUBLIC KEY-----";
const PUBLIC_KEY_END: &str = "-----END PUBLIC KEY-----";
const INSTALLED_BINARIES: [&str; 2] = ["agi", "agiworkforce"];
const NO_UPDATE_CHECK_ENV: &str = "AGIWORKFORCE_NO_UPDATE_CHECK";
const MAX_VERSION_OUTPUT_BYTES: u64 = 4096;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliReleaseDownload {
    pub platform: String,
    pub asset_name: String,
    pub download_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliReleaseNotes {
    #[serde(default)]
    pub summary: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRelease {
    pub version: String,
    pub published_at: String,
    #[serde(default)]
    pub downloads: Vec<CliReleaseDownload>,
    #[serde(default)]
    pub release_notes: Option<CliReleaseNotes>,
}

static LATEST_RELEASE: std::sync::OnceLock<CliRelease> = std::sync::OnceLock::new();
const RELEASE_NOTES_SEEN_FILE: &str = "release-notes-seen";

pub fn remember_latest_release(release: &CliRelease) {
    let _ = LATEST_RELEASE.set(release.clone());
}

pub fn latest_known_release() -> Option<&'static CliRelease> {
    LATEST_RELEASE.get()
}

pub fn release_notes_lines(release: &CliRelease) -> Vec<String> {
    let Some(notes) = &release.release_notes else {
        return Vec::new();
    };
    let sanitize = |text: &str| crate::terminal_text::sanitize_terminal_text(text).into_owned();
    notes
        .summary
        .as_deref()
        .map(|summary| format!("What's new in {}: {}", release.version, sanitize(summary)))
        .into_iter()
        .chain(std::iter::once(format!(
            "Release notes: {}",
            sanitize(&notes.url)
        )))
        .collect()
}

pub fn unseen_release_notes(release: &CliRelease) -> Option<Vec<String>> {
    if compare_versions(running_version(), &release.version) != UpdateVerdict::UpToDate {
        return None;
    }
    let path = crate::config::CliConfig::config_dir()
        .ok()?
        .join(RELEASE_NOTES_SEEN_FILE);
    let seen = std::fs::read_to_string(&path).unwrap_or_default();
    if seen.trim() == release.version {
        return None;
    }
    let lines = release_notes_lines(release);
    if lines.is_empty() {
        return None;
    }
    if let Err(error) = std::fs::write(&path, &release.version) {
        tracing::debug!("[update_check] could not record the release notes as seen: {error}");
    }
    Some(lines)
}

pub fn running_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn switched_on(value: Option<&str>) -> bool {
    value.map(str::trim).is_some_and(|value| {
        !value.is_empty()
            && !matches!(
                value.to_ascii_lowercase().as_str(),
                "0" | "false" | "off" | "no"
            )
    })
}

pub fn startup_check_allowed(
    config: &CliConfig,
    privacy: PrivacyMode,
    env: impl Fn(&str) -> Option<String>,
) -> bool {
    privacy != PrivacyMode::Local
        && config.updates.check_on_startup
        && !switched_on(env(NO_UPDATE_CHECK_ENV).as_deref())
}

pub fn spawn_startup_check(config: &CliConfig, privacy: PrivacyMode) {
    if !startup_check_allowed(config, privacy, |name| std::env::var(name).ok()) {
        return;
    }
    tokio::spawn(async {
        let Ok(release) = fetch_latest_release().await else {
            return;
        };
        remember_latest_release(&release);
        if compare_versions(running_version(), &release.version) == UpdateVerdict::Available {
            let executable = std::env::current_exe().ok();
            crate::tui::push_tui_notice(update_available_notice(
                &release.version,
                executable.as_deref(),
            ));
        } else if let Some(lines) = unseen_release_notes(&release) {
            crate::tui::push_tui_notice(lines.join("\n"));
        }
    });
}

pub fn parse_release(body: &str) -> Result<CliRelease, serde_json::Error> {
    serde_json::from_str(body)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UpdateVerdict {
    UpToDate,
    Available,
    AheadOfPublished,
    Unknown(String),
}

pub fn compare_versions(running: &str, published: &str) -> UpdateVerdict {
    let (Ok(running), Ok(published)) = (Version::parse(running), Version::parse(published)) else {
        return UpdateVerdict::Unknown(format!(
            "cannot compare running version {running} with published version {published}"
        ));
    };
    match running.cmp(&published) {
        std::cmp::Ordering::Less => UpdateVerdict::Available,
        std::cmp::Ordering::Equal => UpdateVerdict::UpToDate,
        std::cmp::Ordering::Greater => UpdateVerdict::AheadOfPublished,
    }
}

pub fn render_verdict(running: &str, release: &CliRelease, install_command: &str) -> Vec<String> {
    let mut lines = vec![
        format!("Running:   {running}"),
        format!(
            "Published: {} ({})",
            release.version,
            crate::terminal_text::sanitize_terminal_text(&release.published_at)
        ),
    ];
    match compare_versions(running, &release.version) {
        UpdateVerdict::UpToDate => {
            lines.push("This is the newest published release.".to_string());
            lines.extend(release_notes_lines(release));
        }
        UpdateVerdict::Available => {
            lines.push(format!("An update is available. Install it with: {install_command}"));
            lines.extend(release_notes_lines(release));
        }
        UpdateVerdict::AheadOfPublished => lines.push(
            "This build is newer than the newest published release, so there is nothing to install."
                .to_string(),
        ),
        UpdateVerdict::Unknown(reason) => lines.push(reason),
    }
    lines
}

pub fn install_command() -> String {
    format!("curl -fsSL {INSTALL_SCRIPT_URL} | bash")
}

fn pinned_release_keys() -> Vec<&'static str> {
    let mut keys = Vec::new();
    let mut rest = INSTALL_SCRIPT;
    while let Some(start) = rest.find(PUBLIC_KEY_BEGIN) {
        let Some(length) = rest[start..].find(PUBLIC_KEY_END) else {
            break;
        };
        let end = start + length + PUBLIC_KEY_END.len();
        keys.push(&rest[start..end]);
        rest = &rest[end..];
    }
    keys
}

fn release_platform() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Some("darwin-arm64"),
        ("macos", "x86_64") => Some("darwin-x64"),
        ("linux", "aarch64") => Some("linux-arm64"),
        ("linux", "x86_64") => Some("linux-x64"),
        _ => None,
    }
}

fn install_directory(executable: &Path) -> Result<PathBuf, String> {
    if cfg!(windows) {
        return Err(format!(
            "Windows cannot replace a running agi. Close it, then run this from Git Bash or WSL: {}",
            install_command()
        ));
    }
    if executable
        .components()
        .any(|part| part.as_os_str().to_string_lossy().ends_with(".app"))
    {
        return Err("This agi is bundled with the desktop app and updates with it.".to_string());
    }
    if let Some(manager) = package_manager_owning(executable) {
        return Err(format!(
            "This agi was installed by {manager}, which keeps track of its files. Update it with {manager}, or remove it there and install the published build with: {}",
            install_command()
        ));
    }
    executable.parent().map(Path::to_path_buf).ok_or_else(|| {
        format!(
            "Could not tell where this agi is installed. Install the update with: {}",
            install_command()
        )
    })
}

fn package_manager_owning(executable: &Path) -> Option<&'static str> {
    let parts: Vec<String> = executable
        .components()
        .map(|part| part.as_os_str().to_string_lossy().into_owned())
        .collect();
    let has = |name: &str| parts.iter().any(|part| part == name);
    if has("Cellar")
        || has("Caskroom")
        || has(".linuxbrew")
        || executable.starts_with("/opt/homebrew")
    {
        return Some("Homebrew");
    }
    if executable.starts_with("/nix/store") {
        return Some("Nix");
    }
    if parts
        .windows(2)
        .any(|pair| pair[0] == ".cargo" && pair[1] == "bin")
        || std::env::var_os("CARGO_HOME")
            .is_some_and(|home| executable.starts_with(Path::new(&home).join("bin")))
    {
        return Some("cargo install");
    }
    if executable.starts_with("/snap") {
        return Some("snap");
    }
    let system_directories = [
        "/usr/bin",
        "/usr/sbin",
        "/bin",
        "/sbin",
        "/usr/lib",
        "/usr/libexec",
    ];
    if system_directories
        .iter()
        .any(|directory| executable.starts_with(directory))
    {
        return Some("the system package manager");
    }
    None
}

/// The swap renames a staged file into the install directory, so the user
/// must be able to create files there.
pub fn writable_install_directory(directory: PathBuf) -> Result<PathBuf, String> {
    match tempfile::Builder::new()
        .prefix(".agi-update-probe")
        .tempfile_in(&directory)
    {
        Ok(_) => Ok(directory),
        Err(error) => Err(format!(
            "You cannot write to {} ({error}), so this agi cannot replace itself. Update it the way it was installed, or install the published build in your home folder with: {}",
            directory.display(),
            install_command()
        )),
    }
}

fn update_available_notice(published: &str, executable: Option<&Path>) -> String {
    let instruction = match executable.map(install_directory) {
        Some(Ok(_)) => "Install it with: agi update --install".to_string(),
        Some(Err(reason)) => reason,
        None => format!("Install it with: {}", install_command()),
    };
    format!(
        "agi {published} is available (you have {}). {instruction}",
        running_version()
    )
}

/// What `--install` is about to replace, and why it may have nothing to do.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallPlan {
    pub running: String,
    pub published: String,
    pub verdict: UpdateVerdict,
    pub target: Result<PathBuf, String>,
}

impl InstallPlan {
    pub fn new(running: &str, release: &CliRelease, executable: &Path) -> Self {
        Self {
            running: running.to_string(),
            published: release.version.clone(),
            verdict: compare_versions(running, &release.version),
            target: install_directory(executable),
        }
    }

    /// True when installing could actually change the installed build. An
    /// up-to-date or ahead-of-feed build has nothing to install.
    pub fn has_work(&self) -> bool {
        matches!(self.verdict, UpdateVerdict::Available) && self.target.is_ok()
    }

    /// The lines printed before the confirmation prompt. Nothing is replaced
    /// until the user has read what will be.
    pub fn render(&self) -> Vec<String> {
        let mut lines = vec![
            format!("Running:   {}", self.running),
            format!("Published: {}", self.published),
        ];
        match (&self.verdict, &self.target) {
            (UpdateVerdict::Available, Ok(directory)) => {
                lines.push(String::new());
                lines.push(format!(
                    "Will download agi {} from its GitHub release, verify it, and replace:",
                    self.published
                ));
                lines.push(format!("  {}", directory.join("agi").display()));
                lines.push(String::new());
                lines.push(INSTALL_SIGNING_NOTE.to_string());
            }
            (UpdateVerdict::Available, Err(reason)) => lines.push(reason.clone()),
            (UpdateVerdict::UpToDate, _) => lines
                .push("Already on the newest published release, nothing to install.".to_string()),
            (UpdateVerdict::AheadOfPublished, _) => lines.push(
                "This build is newer than the newest published release, nothing to install."
                    .to_string(),
            ),
            (UpdateVerdict::Unknown(reason), _) => lines.push(reason.clone()),
        }
        lines
    }
}

/// Stated wherever `--install` is described: the key is the one
/// `apps/web/public/install.sh` pins, so the updater and the installer accept
/// exactly the same releases.
pub const INSTALL_SIGNING_NOTE: &str = "The update is checked against the release signing \
key built into this agi, the key the installer pins, and against its SHA-256 checksum before \
anything is replaced.";

async fn fetch_release_file(client: &reqwest::Client, url: &str) -> anyhow::Result<Vec<u8>> {
    let response = client
        .get(url)
        .send()
        .await
        .with_context(|| format!("could not download {url}"))?;
    let status = response.status();
    if !status.is_success() {
        bail!("{url} answered HTTP {}", status.as_u16());
    }
    Ok(response.bytes().await?.to_vec())
}

/// A program the updater runs on the host with the user's rights, found only
/// on `PATH` entries a sandboxed command cannot write, and run with `PATH`
/// set to those entries so nothing it starts comes from one either.
struct HostTool {
    program: PathBuf,
    search_path: OsString,
}

impl HostTool {
    fn command(&self) -> Command {
        let mut command = Command::new(&self.program);
        command.env("PATH", &self.search_path);
        command
    }
}

fn host_tool(name: &str) -> anyhow::Result<HostTool> {
    host_tool_on(&std::env::var_os("PATH").unwrap_or_default(), name)
}

fn host_tool_on(path: &OsStr, name: &str) -> anyhow::Result<HostTool> {
    let roots = untrusted_roots(&[]);
    let entries: Vec<PathBuf> = trusted_path_entries(path, &roots)
        .into_iter()
        .filter(|entry| !crate::path_security::program_is_untrusted(entry))
        .collect();
    let program = entries
        .iter()
        .find_map(|entry| {
            find_program(entry.as_os_str(), name, &roots)
                .filter(|program| !crate::path_security::program_is_untrusted(program))
        })
        .ok_or_else(|| {
            anyhow!(
                "{name} is required to install an update, and no {name} was found on PATH outside \
                 the folders a sandboxed command can write; nothing was installed."
            )
        })?;
    Ok(HostTool {
        program,
        search_path: std::env::join_paths(&entries)?,
    })
}

fn verify_manifest(
    openssl: &HostTool,
    work: &Path,
    manifest: &[u8],
    signature: &[u8],
) -> anyhow::Result<()> {
    let keys = pinned_release_keys();
    if keys.is_empty() {
        bail!(
            "This agi carries no release signing key, so it cannot verify an update. Reinstall with: {}",
            install_command()
        );
    }
    let manifest_path = work.join("SHA256SUMS");
    let signature_path = work.join("SHA256SUMS.sig");
    std::fs::write(&manifest_path, manifest)?;
    std::fs::write(&signature_path, signature)?;
    for (index, key) in keys.iter().enumerate() {
        let key_path = work.join(format!("release-key-{index}.pem"));
        std::fs::write(&key_path, key)?;
        let verified = openssl
            .command()
            .arg("dgst")
            .arg("-sha256")
            .arg("-verify")
            .arg(&key_path)
            .arg("-signature")
            .arg(&signature_path)
            .arg(&manifest_path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|error| {
                anyhow!("openssl is required to verify the release signature: {error}")
            })?
            .success();
        if verified {
            return Ok(());
        }
    }
    bail!(
        "The release signature does not match the key built into this agi; nothing was installed."
    )
}

fn manifest_checksum(manifest: &[u8], asset_name: &str) -> anyhow::Result<String> {
    String::from_utf8_lossy(manifest)
        .lines()
        .find_map(|line| {
            let (checksum, name) = line.split_once(char::is_whitespace)?;
            let name = name.trim_start().trim_start_matches('*');
            (name == asset_name).then(|| checksum.to_ascii_lowercase())
        })
        .ok_or_else(|| anyhow!("The signed checksum manifest does not list {asset_name}."))
}

fn staged_path(directory: &Path, name: &str) -> PathBuf {
    directory.join(format!(".{name}.update"))
}

fn previous_path(directory: &Path, name: &str) -> PathBuf {
    directory.join(format!(".{name}.previous"))
}

fn start_staged_binary(
    staged: &Path,
    stdout: &std::fs::File,
) -> std::io::Result<std::process::Child> {
    let mut attempts = 0;
    loop {
        let started = Command::new(staged)
            .arg("--version")
            .env(NO_UPDATE_CHECK_ENV, "1")
            .stdin(Stdio::null())
            .stdout(stdout.try_clone()?)
            .stderr(Stdio::null())
            .spawn();
        match started {
            Err(error)
                if error.kind() == std::io::ErrorKind::ExecutableFileBusy && attempts < 5 =>
            {
                attempts += 1;
                std::thread::sleep(Duration::from_millis(100));
            }
            other => return other,
        }
    }
}

fn staged_binary_version(staged: &Path) -> anyhow::Result<String> {
    let mut output = tempfile::tempfile()?;
    let mut child = start_staged_binary(staged, &output)?;
    let deadline = std::time::Instant::now() + SELF_CHECK_TIMEOUT;
    loop {
        match child.try_wait()? {
            Some(status) if status.success() => break,
            Some(status) => bail!("it exited with {status}"),
            None if std::time::Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                bail!(
                    "it did not answer within {} seconds",
                    SELF_CHECK_TIMEOUT.as_secs()
                );
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    }
    output.rewind()?;
    let mut reported = Vec::new();
    output
        .take(MAX_VERSION_OUTPUT_BYTES)
        .read_to_end(&mut reported)?;
    Ok(String::from_utf8_lossy(&reported).into_owned())
}

fn reported_version(output: &str) -> Option<&str> {
    output
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())?
        .split_whitespace()
        .last()
}

/// The version an update must report: the one the release feed named, and
/// newer than this agi. The signed manifest names assets without versions, so
/// without this a feed could point at an older signed release.
#[derive(Debug, Clone, Copy)]
struct ReleaseVersions<'a> {
    published: &'a str,
    running: &'a str,
}

impl ReleaseVersions<'_> {
    fn check(&self, name: &str, output: &str) -> anyhow::Result<()> {
        let published = self.published;
        let running = self.running;
        let Some(reported) = reported_version(output) else {
            bail!(
                "The new {name} reports no version, so the installed one was left as it was; nothing was installed."
            );
        };
        let shown = crate::terminal_text::sanitize_terminal_text(reported);
        if compare_versions(reported, published) != UpdateVerdict::UpToDate {
            bail!(
                "The new {name} reports version {shown}, not the {published} the release feed named, so the installed one was left as it was; nothing was installed."
            );
        }
        if compare_versions(running, reported) != UpdateVerdict::Available {
            bail!(
                "The new {name} is version {shown}, which is not newer than this agi ({running}), so the installed one was left as it was; nothing was installed."
            );
        }
        Ok(())
    }
}

fn stage_binaries(
    unpacked: &Path,
    directory: &Path,
    versions: ReleaseVersions<'_>,
) -> anyhow::Result<Vec<&'static str>> {
    let mut staged = Vec::new();
    for name in INSTALLED_BINARIES {
        let source = unpacked.join(name);
        if !source.is_file() {
            continue;
        }
        let path = staged_path(directory, name);
        std::fs::copy(&source, &path)
            .with_context(|| format!("could not write {}", path.display()))?;
        staged.push(name);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))?;
        }
        let reported = staged_binary_version(&path).map_err(|reason| {
            anyhow!(
                "The new {name} does not start ({reason}), so the installed one was left as it was; nothing was installed."
            )
        })?;
        versions.check(name, &reported)?;
    }
    Ok(staged)
}

fn keep_previous(target: &Path, backup: &Path) -> std::io::Result<bool> {
    if !target.is_file() {
        return Ok(false);
    }
    match std::fs::remove_file(backup) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    std::fs::hard_link(target, backup).or_else(|_| std::fs::copy(target, backup).map(drop))?;
    Ok(true)
}

struct Replaced {
    target: PathBuf,
    backup: Option<PathBuf>,
}

fn restore_previous(replaced: &[Replaced]) -> Vec<String> {
    let mut stranded = Vec::new();
    for entry in replaced.iter().rev() {
        let restored = match &entry.backup {
            Some(backup) => std::fs::rename(backup, &entry.target).map_err(|error| {
                format!(
                    "{} is kept at {} ({error})",
                    entry.target.display(),
                    backup.display()
                )
            }),
            None => std::fs::remove_file(&entry.target)
                .map_err(|error| format!("could not remove {} ({error})", entry.target.display())),
        };
        if let Err(problem) = restored {
            stranded.push(problem);
        }
    }
    stranded
}

fn swap_in(directory: &Path, staged: &[&'static str]) -> anyhow::Result<()> {
    let mut replaced: Vec<Replaced> = Vec::new();
    for name in staged {
        let target = directory.join(name);
        let backup = previous_path(directory, name);
        let kept = match keep_previous(&target, &backup) {
            Ok(kept) => kept,
            Err(error) => {
                let stranded = restore_previous(&replaced);
                return Err(swap_failure(
                    format!("could not keep a copy of {}: {error}", target.display()),
                    stranded,
                ));
            }
        };
        if let Err(error) = std::fs::rename(staged_path(directory, name), &target) {
            if kept {
                let _ = std::fs::remove_file(&backup);
            }
            let stranded = restore_previous(&replaced);
            return Err(swap_failure(
                format!("could not replace {}: {error}", target.display()),
                stranded,
            ));
        }
        replaced.push(Replaced {
            target,
            backup: kept.then_some(backup),
        });
    }
    for entry in &replaced {
        if let Some(backup) = &entry.backup {
            let _ = std::fs::remove_file(backup);
        }
    }
    Ok(())
}

fn swap_failure(problem: String, stranded: Vec<String>) -> anyhow::Error {
    if stranded.is_empty() {
        anyhow!("{problem}. The previous agi was put back; nothing was installed.")
    } else {
        anyhow!(
            "{problem}. Putting the previous agi back also failed: {}.",
            stranded.join("; ")
        )
    }
}

fn replace_binaries(
    unpacked: &Path,
    directory: &Path,
    versions: ReleaseVersions<'_>,
) -> anyhow::Result<()> {
    if !unpacked.join(INSTALLED_BINARIES[0]).is_file() {
        bail!("The release archive does not contain agi; nothing was installed.");
    }
    let outcome = stage_binaries(unpacked, directory, versions)
        .and_then(|staged| swap_in(directory, &staged));
    for name in INSTALLED_BINARIES {
        let _ = std::fs::remove_file(staged_path(directory, name));
    }
    outcome
}

pub async fn install_release(release: &CliRelease, directory: &Path) -> anyhow::Result<()> {
    let platform =
        release_platform().ok_or_else(|| anyhow!("No published build matches this platform."))?;
    let download = release
        .downloads
        .iter()
        .find(|download| download.platform == platform)
        .ok_or_else(|| anyhow!("Release {} has no build for {platform}.", release.version))?;
    let (base, _) = download
        .download_url
        .rsplit_once('/')
        .ok_or_else(|| anyhow!("The release feed named no download location."))?;
    let openssl = host_tool("openssl")?;
    let tar = host_tool("tar")?;

    let client = reqwest::Client::builder()
        .timeout(RELEASE_DOWNLOAD_TIMEOUT)
        .build()?;
    let archive = fetch_release_file(&client, &download.download_url).await?;
    let manifest = fetch_release_file(&client, &format!("{base}/SHA256SUMS")).await?;
    let signature = fetch_release_file(&client, &format!("{base}/SHA256SUMS.sig")).await?;

    let work = tempfile::tempdir()?;
    verify_manifest(&openssl, work.path(), &manifest, &signature)?;
    let expected = manifest_checksum(&manifest, &download.asset_name)?;
    if crate::hex::encode(&Sha256::digest(&archive)) != expected {
        bail!("The archive does not match its signed checksum; nothing was installed.");
    }

    let archive_path = work.path().join("release.tar.gz");
    let unpacked = work.path().join("unpacked");
    std::fs::write(&archive_path, &archive)?;
    std::fs::create_dir_all(&unpacked)?;
    let extracted = tar
        .command()
        .arg("-xzf")
        .arg(&archive_path)
        .arg("-C")
        .arg(&unpacked)
        .status()
        .map_err(|error| anyhow!("tar is required to unpack the release: {error}"))?;
    if !extracted.success() {
        bail!("The release archive could not be unpacked; nothing was installed.");
    }
    replace_binaries(
        &unpacked,
        directory,
        ReleaseVersions {
            published: &release.version,
            running: running_version(),
        },
    )
}

pub async fn fetch_latest_release() -> anyhow::Result<CliRelease> {
    let raw_base = std::env::var("AGIWORKFORCE_API_BASE")
        .unwrap_or_else(|_| tier_cache::default_api_base().to_string());
    let base = tier_cache::resolve_agi_api_base(&raw_base).ok_or_else(|| {
        anyhow::anyhow!("AGIWORKFORCE_API_BASE must be an https agiworkforce.com host")
    })?;

    let client = reqwest::Client::builder()
        .timeout(RELEASE_FETCH_TIMEOUT)
        .build()?;

    let response = crate::cloud::handshake::apply(
        client
            .get(format!("{base}{CLI_RELEASE_PATH}"))
            .header("Accept", "application/json"),
    )
    .send()
    .await?;

    let status = response.status();
    if status.as_u16() == 404 {
        anyhow::bail!("no CLI release archive is published yet");
    }
    if !status.is_success() {
        anyhow::bail!("release feed returned HTTP {}", status.as_u16());
    }

    let body = response.text().await?;
    Ok(parse_release(&body)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_feed_shape_the_web_route_serves() {
        let release = parse_release(
            r#"{"version":"1.7.2","publishedAt":"2026-09-12T10:00:00Z","downloads":[{"platform":"darwin-arm64","assetName":"agiworkforce-darwin-arm64.tar.gz","downloadUrl":"https://example.invalid/a.tar.gz","sizeBytes":1}]}"#,
        )
        .expect("feed parses");
        assert_eq!(release.version, "1.7.2");
        assert_eq!(release.downloads.len(), 1);
        assert_eq!(release.downloads[0].platform, "darwin-arm64");
    }

    #[test]
    fn newer_published_version_is_an_update() {
        assert_eq!(compare_versions("1.7.1", "1.8.0"), UpdateVerdict::Available);
    }

    #[test]
    fn matching_version_is_up_to_date() {
        assert_eq!(compare_versions("1.7.1", "1.7.1"), UpdateVerdict::UpToDate);
    }

    #[test]
    fn prerelease_ranks_below_its_release() {
        assert_eq!(
            compare_versions("1.8.0-beta.1", "1.8.0"),
            UpdateVerdict::Available
        );
    }

    #[test]
    fn local_build_ahead_of_the_feed_offers_nothing() {
        assert_eq!(
            compare_versions("2.0.0", "1.7.1"),
            UpdateVerdict::AheadOfPublished
        );
    }

    #[test]
    fn unparseable_version_reports_why_instead_of_guessing() {
        assert!(matches!(
            compare_versions("nightly", "1.7.1"),
            UpdateVerdict::Unknown(_)
        ));
    }

    #[test]
    fn the_startup_check_stays_off_the_network_when_the_user_or_local_mode_says_so() {
        let config = CliConfig::default();
        let no_env = |_: &str| None;
        assert!(startup_check_allowed(&config, PrivacyMode::Managed, no_env));
        assert!(startup_check_allowed(&config, PrivacyMode::Byok, no_env));
        assert!(!startup_check_allowed(&config, PrivacyMode::Local, no_env));

        let mut opted_out = CliConfig::default();
        opted_out.updates.check_on_startup = false;
        assert!(!startup_check_allowed(
            &opted_out,
            PrivacyMode::Managed,
            no_env
        ));

        let env_says = |value: &'static str| {
            move |name: &str| (name == NO_UPDATE_CHECK_ENV).then(|| value.to_string())
        };
        assert!(!startup_check_allowed(
            &config,
            PrivacyMode::Managed,
            env_says("1")
        ));
        assert!(startup_check_allowed(
            &config,
            PrivacyMode::Managed,
            env_says("0")
        ));
        assert!(startup_check_allowed(
            &config,
            PrivacyMode::Managed,
            env_says("")
        ));
    }

    #[test]
    fn a_repository_cannot_switch_the_startup_check_for_its_users() {
        let mut user = CliConfig::default();
        let mut repository = CliConfig::default();
        repository.updates.check_on_startup = false;
        user.merge_from(&repository);
        assert!(user.updates.check_on_startup);
    }

    #[test]
    fn a_saved_opt_out_survives_a_round_trip_through_config_toml() {
        let parsed: CliConfig =
            toml::from_str("[updates]\ncheck_on_startup = false\n").expect("config parses");
        assert!(!parsed.updates.check_on_startup);
        let written = toml::to_string(&parsed).expect("config serializes");
        assert!(written.contains("check_on_startup = false"));
        assert!(!toml::to_string(&CliConfig::default())
            .expect("config serializes")
            .contains("[updates]"));
    }

    #[test]
    fn install_command_is_the_published_install_script() {
        assert_eq!(
            install_command(),
            "curl -fsSL https://agiworkforce.com/install.sh | bash"
        );
    }

    fn release(version: &str) -> CliRelease {
        CliRelease {
            version: version.to_string(),
            published_at: "2026-09-12T10:00:00Z".to_string(),
            downloads: vec![],
            release_notes: None,
        }
    }

    #[test]
    fn the_install_plan_shows_what_it_replaces_before_installing() {
        let plan = InstallPlan::new(
            "1.0.0",
            &release("9.9.9"),
            std::path::Path::new("/home/dev/.agi/bin/agi"),
        );
        #[cfg(windows)]
        {
            assert_eq!(plan.verdict, UpdateVerdict::Available);
            assert!(!plan.has_work());
            let refusal = plan.target.as_ref().unwrap_err();
            let rendered = plan.render().join("\n");
            assert!(rendered.contains(refusal));
            assert!(rendered.contains("Git Bash or WSL"));
            assert!(rendered.contains(&install_command()));
            assert!(!rendered.contains("Will download"));
        }
        #[cfg(not(windows))]
        {
            assert!(plan.has_work());
            let rendered = plan.render().join("\n");
            assert!(rendered.contains("Will download agi 9.9.9"));
            assert!(rendered.contains("/home/dev/.agi/bin/agi"));
            assert!(rendered.contains("release signing key built into this agi"));
        }
    }

    #[test]
    fn a_build_a_package_manager_owns_is_never_rewritten() {
        for (path, manager) in [
            ("/opt/homebrew/Cellar/agi/1.0.0/bin/agi", "Homebrew"),
            ("/usr/local/Cellar/agi/1.0.0/bin/agi", "Homebrew"),
            (
                "/home/linuxbrew/.linuxbrew/Cellar/agi/1.0.0/bin/agi",
                "Homebrew",
            ),
            ("/nix/store/abc-agi-1.0.0/bin/agi", "Nix"),
            ("/home/dev/.cargo/bin/agi", "cargo install"),
            ("/usr/bin/agi", "the system package manager"),
        ] {
            let plan = InstallPlan::new("1.0.0", &release("9.9.9"), Path::new(path));
            assert!(!plan.has_work(), "{path} must not be replaced");
            #[cfg(not(windows))]
            {
                let refusal = plan.target.as_ref().unwrap_err();
                assert!(refusal.contains(manager), "{path}: {refusal}");
            }
            #[cfg(windows)]
            let _ = manager;
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_directory_the_user_cannot_write_is_refused_before_anything_downloads() {
        use std::os::unix::fs::PermissionsExt;
        let home = tempfile::tempdir().expect("tempdir");
        let locked = home.path().join("bin");
        std::fs::create_dir(&locked).expect("create");
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o555)).expect("lock");

        let refusal = writable_install_directory(locked.clone());

        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).expect("unlock");
        if nix::unistd::geteuid().is_root() {
            return;
        }
        let refusal = refusal.expect_err("a read-only directory is refused");
        assert!(refusal.contains(&install_command()), "{refusal}");
        assert_eq!(
            writable_install_directory(locked.clone()),
            Ok(locked),
            "a writable directory passes"
        );
    }

    #[test]
    fn the_update_notice_names_a_command_that_works_for_the_install() {
        for bundled in [
            "/Applications/Desktop.app/Contents/MacOS/agi",
            "/opt/homebrew/Cellar/agi/1.0.0/bin/agi",
            "/usr/bin/agi",
        ] {
            let notice = update_available_notice("9.9.9", Some(Path::new(bundled)));
            assert!(notice.starts_with("agi 9.9.9 is available"), "{notice}");
            assert!(!notice.contains("--install"), "{bundled}: {notice}");
        }

        let unknown = update_available_notice("9.9.9", None);
        assert!(unknown.contains(&install_command()), "{unknown}");
        assert!(!unknown.contains("--install"), "{unknown}");

        #[cfg(not(windows))]
        {
            let home = tempfile::tempdir().expect("tempdir");
            let own = home.path().join("bin").join("agi");
            let notice = update_available_notice("9.9.9", Some(own.as_path()));
            assert!(notice.contains("agi update --install"), "{notice}");
        }
    }

    #[test]
    fn an_up_to_date_build_has_no_install_work() {
        let plan = InstallPlan::new(
            "1.7.1",
            &release("1.7.1"),
            std::path::Path::new("/home/dev/.agi/bin/agi"),
        );
        assert!(!plan.has_work());
        let rendered = plan.render().join("\n");
        assert!(rendered.contains("nothing to install"));
        assert!(
            !rendered.contains("Will download"),
            "a no-op plan must not show a command to confirm"
        );
    }

    #[test]
    fn a_build_ahead_of_the_feed_has_no_install_work() {
        let plan = InstallPlan::new(
            "2.0.0",
            &release("1.7.1"),
            std::path::Path::new("/home/dev/.agi/bin/agi"),
        );
        assert!(!plan.has_work());
        assert!(plan.render().join("\n").contains("nothing to install"));
    }

    #[test]
    fn an_uncomparable_version_reports_why_and_installs_nothing() {
        let plan = InstallPlan::new(
            "nightly",
            &release("1.7.1"),
            std::path::Path::new("/home/dev/.agi/bin/agi"),
        );
        assert!(!plan.has_work());
        assert!(plan.render().join("\n").contains("cannot compare"));
    }

    #[cfg(unix)]
    fn write_script(directory: &Path, name: &str, body: &str) {
        use std::os::unix::fs::PermissionsExt;
        let path = directory.join(name);
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).expect("write script");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
            .expect("make script executable");
    }

    #[cfg(unix)]
    fn file_names(directory: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(directory)
            .expect("list directory")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        names.sort();
        names
    }

    #[cfg(unix)]
    #[test]
    fn a_build_that_will_not_start_leaves_the_installed_one_in_place() {
        let installed = tempfile::tempdir().expect("install dir");
        let unpacked = tempfile::tempdir().expect("unpacked dir");
        write_script(installed.path(), "agi", "echo old-agi");
        write_script(installed.path(), "agiworkforce", "echo old-agiworkforce");
        write_script(unpacked.path(), "agi", "exit 3");
        write_script(unpacked.path(), "agiworkforce", "echo new");

        let error = replace_binaries(unpacked.path(), installed.path(), UPDATE)
            .expect_err("a build that exits non-zero must not be installed");

        assert!(error.to_string().contains("does not start"), "{error}");
        assert!(
            error.to_string().contains("nothing was installed"),
            "{error}"
        );
        for (name, body) in [("agi", "old-agi"), ("agiworkforce", "old-agiworkforce")] {
            let kept = std::fs::read_to_string(installed.path().join(name)).expect("read binary");
            assert!(kept.contains(body), "{name} changed: {kept}");
        }
        assert_eq!(file_names(installed.path()), ["agi", "agiworkforce"]);
    }

    #[cfg(unix)]
    #[test]
    fn a_working_build_replaces_both_binaries_and_drops_the_backups() {
        let installed = tempfile::tempdir().expect("install dir");
        let unpacked = tempfile::tempdir().expect("unpacked dir");
        write_script(installed.path(), "agi", "echo agi 1.0.0");
        write_script(unpacked.path(), "agi", "echo agi 9.9.9");
        write_script(unpacked.path(), "agiworkforce", "echo agiworkforce 9.9.9");

        replace_binaries(unpacked.path(), installed.path(), UPDATE).expect("install the new build");

        for (name, body) in [("agi", "agi 9.9.9"), ("agiworkforce", "agiworkforce 9.9.9")] {
            let installed_now =
                std::fs::read_to_string(installed.path().join(name)).expect("read binary");
            assert!(installed_now.contains(body), "{name}: {installed_now}");
        }
        assert_eq!(file_names(installed.path()), ["agi", "agiworkforce"]);
    }

    #[cfg(unix)]
    #[test]
    fn a_swap_that_fails_part_way_puts_the_first_binary_back() {
        let installed = tempfile::tempdir().expect("install dir");
        let unpacked = tempfile::tempdir().expect("unpacked dir");
        write_script(installed.path(), "agi", "echo old-agi");
        let blocker = installed.path().join("agiworkforce");
        std::fs::create_dir(&blocker).expect("directory in the way");
        std::fs::write(blocker.join("keep"), "x").expect("fill the directory");
        write_script(unpacked.path(), "agi", "echo agi 9.9.9");
        write_script(unpacked.path(), "agiworkforce", "echo agiworkforce 9.9.9");

        let error = replace_binaries(unpacked.path(), installed.path(), UPDATE)
            .expect_err("the second binary cannot replace a directory");

        assert!(error.to_string().contains("put back"), "{error}");
        let agi = std::fs::read_to_string(installed.path().join("agi")).expect("read agi");
        assert!(agi.contains("old-agi"), "agi was not restored: {agi}");
        assert!(blocker.is_dir());
        assert_eq!(file_names(installed.path()), ["agi", "agiworkforce"]);
    }

    #[cfg(unix)]
    const UPDATE: ReleaseVersions<'static> = ReleaseVersions {
        published: "9.9.9",
        running: "1.0.0",
    };

    #[cfg(unix)]
    fn refused_install(unpacked_scripts: &[(&str, &str)], versions: ReleaseVersions<'_>) -> String {
        let installed = tempfile::tempdir().expect("install dir");
        let unpacked = tempfile::tempdir().expect("unpacked dir");
        write_script(installed.path(), "agi", "echo old-agi");
        write_script(installed.path(), "agiworkforce", "echo old-agiworkforce");
        for (name, body) in unpacked_scripts {
            write_script(unpacked.path(), name, body);
        }

        let error = replace_binaries(unpacked.path(), installed.path(), versions)
            .expect_err("a build other than the published, newer one must not be installed");

        for (name, body) in [("agi", "old-agi"), ("agiworkforce", "old-agiworkforce")] {
            let kept = std::fs::read_to_string(installed.path().join(name)).expect("read binary");
            assert!(kept.contains(body), "{name} changed: {kept}");
        }
        assert_eq!(file_names(installed.path()), ["agi", "agiworkforce"]);
        let message = error.to_string();
        assert!(message.contains("nothing was installed"), "{message}");
        message
    }

    #[cfg(unix)]
    #[test]
    fn an_older_signed_build_than_the_feed_named_is_refused() {
        let message = refused_install(&[("agi", "echo agi 0.0.1")], UPDATE);
        assert!(message.contains("reports version 0.0.1"), "{message}");
        assert!(message.contains("9.9.9"), "{message}");
    }

    #[cfg(unix)]
    #[test]
    fn a_second_binary_from_another_release_is_refused() {
        let message = refused_install(
            &[
                ("agi", "echo agi 9.9.9"),
                ("agiworkforce", "echo agiworkforce 0.0.1"),
            ],
            UPDATE,
        );
        assert!(message.contains("new agiworkforce"), "{message}");
    }

    #[cfg(unix)]
    #[test]
    fn a_feed_that_names_the_running_version_installs_nothing() {
        let message = refused_install(
            &[("agi", "echo agi 1.0.0")],
            ReleaseVersions {
                published: "1.0.0",
                running: "1.0.0",
            },
        );
        assert!(message.contains("not newer than this agi"), "{message}");
    }

    #[cfg(unix)]
    #[test]
    fn a_build_that_reports_no_version_is_refused() {
        let message = refused_install(&[("agi", "true")], UPDATE);
        assert!(message.contains("reports no version"), "{message}");
    }

    #[test]
    fn the_reported_version_is_the_last_word_of_the_first_line() {
        assert_eq!(reported_version("agi 1.2.3\n"), Some("1.2.3"));
        assert_eq!(
            reported_version("\n  agiworkforce 2.0.0-beta.1  \nmore\n"),
            Some("2.0.0-beta.1")
        );
        assert_eq!(reported_version(" \n"), None);
    }

    #[cfg(unix)]
    #[test]
    fn a_planted_tool_on_a_sandbox_writable_path_is_never_run() {
        let planted = tempfile::tempdir().expect("sandbox-writable folder");
        let marker = planted.path().join("ran");
        write_script(
            planted.path(),
            "openssl",
            &format!("touch '{}'", marker.display()),
        );

        let error = host_tool_on(planted.path().as_os_str(), "openssl")
            .err()
            .expect("a tool only on a sandbox-writable path must not be resolved");
        assert!(
            error
                .to_string()
                .contains("outside the folders a sandboxed command can write"),
            "{error}"
        );
        assert!(!marker.exists(), "the planted openssl ran");
    }

    #[cfg(unix)]
    #[test]
    fn a_planted_tool_ahead_of_a_trusted_one_is_skipped() {
        let planted = tempfile::tempdir().expect("sandbox-writable folder");
        write_script(planted.path(), "sh", "exit 0");
        let search =
            std::env::join_paths([planted.path(), Path::new("/bin"), Path::new("/usr/bin")])
                .expect("join search path");

        let tool = host_tool_on(&search, "sh").expect("a trusted sh is on the path");

        assert!(
            !tool.program.starts_with(planted.path()),
            "{}",
            tool.program.display()
        );
        assert!(
            std::env::split_paths(&tool.search_path)
                .all(|entry| !entry.starts_with(planted.path())),
            "the planted folder stays on the tool's PATH: {:?}",
            tool.search_path
        );
    }

    #[test]
    fn available_verdict_names_the_install_command() {
        let release = CliRelease {
            version: "9.9.9".to_string(),
            published_at: "2026-09-12T10:00:00Z".to_string(),
            downloads: vec![],
            release_notes: None,
        };
        let lines = render_verdict("1.0.0", &release, &install_command());
        assert!(lines.iter().any(|line| line.contains(&install_command())));
    }
}
