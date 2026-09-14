//! Published-release comparison for `agi update --check`.
//!
//! Reads the same target-scoped feed the web control plane serves at
//! `/api/releases/cli/latest` (`apps/web/app/api/releases/cli/latest/route.ts`),
//! which resolves the newest stable `v-cli-*` GitHub release. Nothing is
//! downloaded: the command prints the install command the README documents.

use semver::Version;
use serde::Deserialize;
use std::time::Duration;

use crate::tier_cache;

const RELEASE_FETCH_TIMEOUT: Duration = Duration::from_secs(5);
const CLI_RELEASE_PATH: &str = "/api/releases/cli/latest";
const NPM_PACKAGE_MANIFEST: &str = include_str!("../npm/package.json");

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

/// The published npm package name, read from the wrapper manifest the release
/// workflow publishes, so the printed instruction cannot drift from it.
pub fn install_command() -> String {
    let name = serde_json::from_str::<serde_json::Value>(NPM_PACKAGE_MANIFEST)
        .ok()
        .and_then(|manifest| {
            manifest
                .get("name")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string)
        });
    match name {
        Some(name) => format!("npm install -g {name}"),
        None => "see the CLI README for install instructions".to_string(),
    }
}

/// What `--install` is about to run, and why the run may still not produce a
/// newer binary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallPlan {
    pub running: String,
    pub published: String,
    pub verdict: UpdateVerdict,
    pub command: String,
}

impl InstallPlan {
    pub fn new(running: &str, release: &CliRelease) -> Self {
        Self {
            running: running.to_string(),
            published: release.version.clone(),
            verdict: compare_versions(running, &release.version),
            command: install_command(),
        }
    }

    /// True when running the command could actually change the installed
    /// build. An up-to-date or ahead-of-feed build has nothing to install.
    pub fn has_work(&self) -> bool {
        matches!(self.verdict, UpdateVerdict::Available)
    }

    /// The lines printed before the confirmation prompt. Nothing runs until
    /// the user has read the exact command.
    pub fn render(&self) -> Vec<String> {
        let mut lines = vec![
            format!("Running:   {}", self.running),
            format!("Published: {}", self.published),
        ];
        match &self.verdict {
            UpdateVerdict::Available => {
                lines.push(String::new());
                lines.push("Will run:".to_string());
                lines.push(format!("  {}", self.command));
                lines.push(String::new());
                lines.push(
                    "Installing replaces the binary this shell resolves as `agi`.".to_string(),
                );
                lines.push(INSTALL_SIGNING_NOTE.to_string());
            }
            UpdateVerdict::UpToDate => lines
                .push("Already on the newest published release, nothing to install.".to_string()),
            UpdateVerdict::AheadOfPublished => lines.push(
                "This build is newer than the newest published release, nothing to install."
                    .to_string(),
            ),
            UpdateVerdict::Unknown(reason) => lines.push(reason.clone()),
        }
        lines
    }
}

/// Stated wherever `--install` is described. The install routes are gated on a
/// signed release: `scripts/install.sh` refuses an archive without `SHA256SUMS`
/// and its sigstore bundle, and the npm package carries the same artifacts. No
/// published CLI release carries them yet, so an install can legitimately fail
/// on provenance rather than on anything the user did wrong.
pub const INSTALL_SIGNING_NOTE: &str =
    "Install needs a signed release: the install routes refuse an archive without its \
signed checksum manifest, and no published CLI release carries one yet.";

/// Run the install command through the shell, streaming its output.
pub fn run_install_command(command: &str) -> anyhow::Result<std::process::ExitStatus> {
    let status = std::process::Command::new("sh")
        .arg("-c")
        .arg(command)
        .status()
        .map_err(|error| anyhow::anyhow!("failed to start `{command}`: {error}"))?;
    Ok(status)
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

    let response = client
        .get(format!("{base}{CLI_RELEASE_PATH}"))
        .header("Accept", "application/json")
        .header("X-AGI-Surface", "cli")
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
    fn install_command_reads_the_published_package_name() {
        assert!(install_command().starts_with("npm install -g @"));
    }

    fn release(version: &str) -> CliRelease {
        CliRelease {
            version: version.to_string(),
            published_at: "2026-09-12T10:00:00Z".to_string(),
            downloads: vec![],
        }
    }

    #[test]
    fn the_install_plan_shows_the_exact_command_before_running_it() {
        let plan = InstallPlan::new("1.0.0", &release("9.9.9"));
        assert!(plan.has_work());
        let rendered = plan.render().join("\n");
        assert!(rendered.contains("Will run:"));
        assert!(rendered.contains(&install_command()));
        assert!(rendered.contains("signed release"));
    }

    #[test]
    fn an_up_to_date_build_has_no_install_work() {
        let plan = InstallPlan::new("1.7.1", &release("1.7.1"));
        assert!(!plan.has_work());
        let rendered = plan.render().join("\n");
        assert!(rendered.contains("nothing to install"));
        assert!(
            !rendered.contains("Will run:"),
            "a no-op plan must not show a command to confirm"
        );
    }

    #[test]
    fn a_build_ahead_of_the_feed_has_no_install_work() {
        let plan = InstallPlan::new("2.0.0", &release("1.7.1"));
        assert!(!plan.has_work());
        assert!(plan.render().join("\n").contains("nothing to install"));
    }

    #[test]
    fn an_uncomparable_version_reports_why_and_installs_nothing() {
        let plan = InstallPlan::new("nightly", &release("1.7.1"));
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
        let lines = render_verdict("1.0.0", &release, "npm install -g pkg");
        assert!(lines.iter().any(|line| line.contains("npm install -g pkg")));
    }
}
