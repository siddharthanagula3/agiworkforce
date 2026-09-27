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

use crate::tier_cache;

const RELEASE_FETCH_TIMEOUT: Duration = Duration::from_secs(5);
const RELEASE_DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(600);
const CLI_RELEASE_PATH: &str = "/api/releases/cli/latest";
const INSTALL_SCRIPT_URL: &str = "https://agiworkforce.com/install.sh";
const INSTALL_SCRIPT: &str = include_str!("../../web/public/install.sh");
const PUBLIC_KEY_BEGIN: &str = "-----BEGIN PUBLIC KEY-----";
const PUBLIC_KEY_END: &str = "-----END PUBLIC KEY-----";
const INSTALLED_BINARIES: [&str; 2] = ["agi", "agiworkforce"];

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliReleaseDownload {
    pub platform: String,
    pub asset_name: String,
    pub download_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliRelease {
    pub version: String,
    pub published_at: String,
    #[serde(default)]
    pub downloads: Vec<CliReleaseDownload>,
}

pub fn running_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
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
        UpdateVerdict::UpToDate => lines.push("This is the newest published release.".to_string()),
        UpdateVerdict::Available => {
            lines.push(format!("An update is available. Install it with: {install_command}"));
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
        }
    }

    #[test]
    fn the_install_plan_shows_what_it_replaces_before_installing() {
        let plan = InstallPlan::new(
            "1.0.0",
            &release("9.9.9"),
            std::path::Path::new("/home/dev/.agi/bin/agi"),
        );
        assert!(plan.has_work());
        let rendered = plan.render().join("\n");
        assert!(rendered.contains("Will download agi 9.9.9"));
        assert!(rendered.contains("/home/dev/.agi/bin/agi"));
        assert!(rendered.contains("release signing key built into this agi"));
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
        };
        let lines = render_verdict("1.0.0", &release, &install_command());
        assert!(lines.iter().any(|line| line.contains(&install_command())));
    }
}
