//! Published-release comparison for `agi update --check`.
//!
//! Reads the same target-scoped feed the web control plane serves at
//! `/api/releases/cli/latest` (`apps/web/app/api/releases/cli/latest/route.ts`),
//! which resolves the newest stable `v-cli-*` GitHub release. Nothing is
//! downloaded: the command prints the install command the README documents.

use anyhow::{anyhow, bail, Context};
use semver::Version;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::config::CliConfig;
use crate::platform::runtime::session::PrivacyMode;
use crate::tier_cache;

const RELEASE_FETCH_TIMEOUT: Duration = Duration::from_secs(5);
const RELEASE_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(600);
const CLI_RELEASE_PATH: &str = "/api/releases/cli/latest";
const INSTALL_SCRIPT_URL: &str = "https://agiworkforce.com/install.sh";
const INSTALL_SCRIPT: &str = include_str!("../../web/public/install.sh");
const PUBLIC_KEY_BEGIN: &str = "-----BEGIN PUBLIC KEY-----";
const PUBLIC_KEY_END: &str = "-----END PUBLIC KEY-----";
const INSTALLED_BINARIES: [&str; 2] = ["agi", "agiworkforce"];
const NO_UPDATE_CHECK_ENV: &str = "AGIWORKFORCE_NO_UPDATE_CHECK";

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
            crate::tui::push_tui_notice(format!(
                "agi {} is available (you have {}). Install it with: agi update --install",
                release.version,
                running_version()
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
        return Err("This agi is bundled with AGI Cloud and updates with the app.".to_string());
    }
    executable.parent().map(Path::to_path_buf).ok_or_else(|| {
        format!(
            "Could not tell where this agi is installed. Install the update with: {}",
            install_command()
        )
    })
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

fn verify_manifest(work: &Path, manifest: &[u8], signature: &[u8]) -> anyhow::Result<()> {
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
        let verified = Command::new("openssl")
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

fn replace_binaries(unpacked: &Path, directory: &Path) -> anyhow::Result<()> {
    if !unpacked.join(INSTALLED_BINARIES[0]).is_file() {
        bail!("The release archive does not contain agi; nothing was installed.");
    }
    for name in INSTALLED_BINARIES {
        let source = unpacked.join(name);
        if !source.is_file() {
            continue;
        }
        let staged = directory.join(format!(".{name}.update"));
        std::fs::copy(&source, &staged)
            .with_context(|| format!("could not write {}", staged.display()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&staged, std::fs::Permissions::from_mode(0o755))?;
        }
        std::fs::rename(&staged, directory.join(name))
            .with_context(|| format!("could not replace {}", directory.join(name).display()))?;
    }
    Ok(())
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

    let client = reqwest::Client::builder()
        .timeout(RELEASE_DOWNLOAD_TIMEOUT)
        .build()?;
    let archive = fetch_release_file(&client, &download.download_url).await?;
    let manifest = fetch_release_file(&client, &format!("{base}/SHA256SUMS")).await?;
    let signature = fetch_release_file(&client, &format!("{base}/SHA256SUMS.sig")).await?;

    let work = tempfile::tempdir()?;
    verify_manifest(work.path(), &manifest, &signature)?;
    let expected = manifest_checksum(&manifest, &download.asset_name)?;
    if crate::hex::encode(&Sha256::digest(&archive)) != expected {
        bail!("The archive does not match its signed checksum; nothing was installed.");
    }

    let archive_path = work.path().join("release.tar.gz");
    let unpacked = work.path().join("unpacked");
    std::fs::write(&archive_path, &archive)?;
    std::fs::create_dir_all(&unpacked)?;
    let extracted = Command::new("tar")
        .arg("-xzf")
        .arg(&archive_path)
        .arg("-C")
        .arg(&unpacked)
        .status()
        .map_err(|error| anyhow!("tar is required to unpack the release: {error}"))?;
    if !extracted.success() {
        bail!("The release archive could not be unpacked; nothing was installed.");
    }
    replace_binaries(&unpacked, directory)
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
