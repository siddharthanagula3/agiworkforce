//! Published-release comparison for `agi update --check`.
//!
//! Reads the same target-scoped feed the web control plane serves at
//! `/api/releases/cli/latest` (`apps/web/app/api/releases/cli/latest/route.ts`),
//! which resolves the newest stable `v-cli-*` GitHub release. Nothing is
//! downloaded: the command prints the install command the README documents.

use semver::Version;
use serde::Deserialize;
use std::path::Path;
use std::time::Duration;

use crate::tier_cache;

const RELEASE_FETCH_TIMEOUT: Duration = Duration::from_secs(5);
const CLI_RELEASE_PATH: &str = "/api/releases/cli/latest";
const INSTALL_SCRIPT_URL: &str = "https://agiworkforce.com/install.sh";

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

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn install_command_for(version: &str, executable: &Path) -> Result<String, String> {
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
    let Some(directory) = executable.parent() else {
        return Err(format!(
            "Could not tell where this agi is installed. Install the update with: {}",
            install_command()
        ));
    };
    Ok(format!(
        "curl -fsSL {INSTALL_SCRIPT_URL} | bash -s -- --version {} --install-dir {} --no-modify-path",
        shell_quote(version),
        shell_quote(&directory.to_string_lossy())
    ))
}

/// What `--install` is about to run, and why the run may still not produce a
/// newer binary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallPlan {
    pub running: String,
    pub published: String,
    pub verdict: UpdateVerdict,
    pub command: Result<String, String>,
}

impl InstallPlan {
    pub fn new(running: &str, release: &CliRelease, executable: &Path) -> Self {
        Self {
            running: running.to_string(),
            published: release.version.clone(),
            verdict: compare_versions(running, &release.version),
            command: install_command_for(&release.version, executable),
        }
    }

    /// True when running the command could actually change the installed
    /// build. An up-to-date or ahead-of-feed build has nothing to install.
    pub fn has_work(&self) -> bool {
        matches!(self.verdict, UpdateVerdict::Available) && self.command.is_ok()
    }

    /// The lines printed before the confirmation prompt. Nothing runs until
    /// the user has read the exact command.
    pub fn render(&self) -> Vec<String> {
        let mut lines = vec![
            format!("Running:   {}", self.running),
            format!("Published: {}", self.published),
        ];
        match (&self.verdict, &self.command) {
            (UpdateVerdict::Available, Ok(command)) => {
                lines.push(String::new());
                lines.push("Will run:".to_string());
                lines.push(format!("  {command}"));
                lines.push(String::new());
                lines.push("Installing replaces this agi with the published release.".to_string());
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

/// Stated wherever `--install` is described: `scripts/install.sh` checks the
/// release's signed checksum manifest before it installs anything.
pub const INSTALL_SIGNING_NOTE: &str = "The installer verifies the release's signed checksum \
manifest and refuses to install anything it cannot verify.";

/// Run the install command through the shell, streaming its output.
pub fn run_install_command(command: &str) -> anyhow::Result<std::process::ExitStatus> {
    let status = std::process::Command::new("bash")
        .arg("-c")
        .arg(format!("set -o pipefail; {command}"))
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
    fn the_install_plan_shows_the_exact_command_before_running_it() {
        let plan = InstallPlan::new(
            "1.0.0",
            &release("9.9.9"),
            std::path::Path::new("/home/dev/.agi/bin/agi"),
        );
        assert!(plan.has_work());
        let rendered = plan.render().join("\n");
        assert!(rendered.contains("Will run:"));
        assert!(rendered.contains("https://agiworkforce.com/install.sh | bash -s -- --version '9.9.9' --install-dir '/home/dev/.agi/bin'"));
        assert!(rendered.contains("signed checksum manifest"));
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
            !rendered.contains("Will run:"),
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
