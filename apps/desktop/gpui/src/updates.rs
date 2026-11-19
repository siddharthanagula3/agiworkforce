use std::cmp::Ordering;
use std::ffi::OsString;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::time::Duration;

use anyhow::{anyhow, bail, ensure, Context as _, Result};
use serde::Deserialize;
use url::Url;

const CLOUD_SHELL_CONFIG: &str = include_str!("../../electron/config.ts");
const CLOUD_SHELL_UPDATE: &str = include_str!("../../electron/desktopCloudUpdate.ts");
const CLOUD_SHELL_NOTICES: &str = include_str!("../../electron/openSourceNoticesFile.ts");
const HEADER_NAMES: &str =
    include_str!("../../../../packages/contracts/cloud-contracts/src/header-names.ts");

const ORIGIN_PLACEHOLDER: &str = "${CLOUD_APP_ORIGIN}";
const CHANNEL_PLACEHOLDER: &str = "${DESKTOP_CLOUD_RELEASE_CHANNEL}";
const ARCHITECTURE_PLACEHOLDER: &str = "${architecture}";
const CHECKSUMS_SEGMENT: &str = "checksums";
const VERSION_QUERY: &str = "version";
const MAX_METADATA_BYTES: usize = 64 * 1024;
const MAX_INSTALLER_BYTES: u64 = 4 * 1024 * 1024 * 1024;
const MAX_SAFE_INTEGER: u64 = (1 << 53) - 1;
const MAX_DESTINATION_ATTEMPTS: u32 = 1000;
const RUNTIME_MANIFEST: &str = "native-runtime.json";
const CURL: &str = "/usr/bin/curl";
const SHASUM: &str = "/usr/bin/shasum";
const SPCTL: &str = "/usr/sbin/spctl";
const CODESIGN: &str = "/usr/bin/codesign";
const CURL_TIMEOUT_EXIT: i32 = 28;

#[derive(Clone, Debug, PartialEq, Eq)]
enum Identifier {
    Numeric(u64),
    Text(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Version {
    text: String,
    core: [u64; 3],
    prerelease: Vec<Identifier>,
}

fn numeric(part: &str) -> Option<u64> {
    if part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    part.parse::<u64>()
        .ok()
        .filter(|value| *value <= MAX_SAFE_INTEGER)
}

fn identifiers(value: &str) -> bool {
    value
        .split(['.', '-'])
        .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_alphanumeric()))
}

fn version_parts(text: &str) -> Option<([u64; 3], Vec<Identifier>)> {
    let unprefixed = text.strip_prefix('v').unwrap_or(text);
    let (without_build, build) = match unprefixed.split_once('+') {
        Some((head, build)) => (head, Some(build)),
        None => (unprefixed, None),
    };
    if build.is_some_and(|build| !identifiers(build)) {
        return None;
    }
    let (core, prerelease) = match without_build.split_once('-') {
        Some((core, prerelease)) => (core, Some(prerelease)),
        None => (without_build, None),
    };
    let mut parts = core.split('.');
    let mut numbers = [0; 3];
    for slot in &mut numbers {
        *slot = parts.next().and_then(numeric)?;
    }
    if parts.next().is_some() || prerelease.is_some_and(|value| !identifiers(value)) {
        return None;
    }
    let prerelease = prerelease
        .map(|value| {
            value
                .split('.')
                .map(|part| match numeric(part) {
                    Some(number) => Identifier::Numeric(number),
                    None => Identifier::Text(part.to_owned()),
                })
                .collect()
        })
        .unwrap_or_default();
    Some((numbers, prerelease))
}

impl Version {
    pub fn parse(value: &str) -> Result<Self> {
        let text = value.trim();
        let (core, prerelease) = version_parts(text)
            .with_context(|| format!("The release version {text:?} is not a semantic version"))?;
        Ok(Self {
            text: text.to_owned(),
            core,
            prerelease,
        })
    }

    pub fn current() -> Self {
        Self::parse(env!("CARGO_PKG_VERSION")).expect("Cargo package versions are semantic")
    }

    pub fn compare(&self, other: &Self) -> Ordering {
        self.core.cmp(&other.core).then_with(|| {
            match (self.prerelease.is_empty(), other.prerelease.is_empty()) {
                (true, true) => Ordering::Equal,
                (true, false) => Ordering::Greater,
                (false, true) => Ordering::Less,
                (false, false) => {
                    for (left, right) in self.prerelease.iter().zip(&other.prerelease) {
                        let order = match (left, right) {
                            (Identifier::Numeric(left), Identifier::Numeric(right)) => {
                                left.cmp(right)
                            }
                            (Identifier::Numeric(_), Identifier::Text(_)) => Ordering::Less,
                            (Identifier::Text(_), Identifier::Numeric(_)) => Ordering::Greater,
                            (Identifier::Text(left), Identifier::Text(right)) => left.cmp(right),
                        };
                        if order != Ordering::Equal {
                            return order;
                        }
                    }
                    self.prerelease.len().cmp(&other.prerelease.len())
                }
            }
        })
    }

    pub fn is_newer_than(&self, other: &Self) -> bool {
        self.compare(other) == Ordering::Greater
    }
}

impl fmt::Display for Version {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.text)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MacArchitecture {
    Arm64,
    X64,
}

impl MacArchitecture {
    pub fn for_target(os: &str, architecture: &str) -> Option<Self> {
        match (os, architecture) {
            ("macos", "aarch64") => Some(Self::Arm64),
            ("macos", "x86_64") => Some(Self::X64),
            _ => None,
        }
    }

    pub fn current() -> Option<Self> {
        Self::for_target(std::env::consts::OS, std::env::consts::ARCH)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Arm64 => "arm64",
            Self::X64 => "x64",
        }
    }
}

fn string_constant<'a>(source: &'a str, name: &str) -> Result<&'a str> {
    let marker = format!("const {name} = '");
    let start = source
        .find(&marker)
        .with_context(|| format!("The release owner no longer declares {name}"))?
        + marker.len();
    let length = source[start..]
        .find('\'')
        .with_context(|| format!("The release owner's {name} is unterminated"))?;
    let value = &source[start..start + length];
    ensure!(
        !value.is_empty() && !value.contains(['\\', '\n']),
        "The release owner's {name} is not a plain string"
    );
    Ok(value)
}

fn origin_template<'a>(source: &'a str, anchor: &str) -> Result<&'a str> {
    let anchored = source
        .find(anchor)
        .with_context(|| format!("The release owner no longer declares {anchor}"))?;
    let marker = format!("`{ORIGIN_PLACEHOLDER}");
    let start = source[anchored..]
        .find(&marker)
        .with_context(|| format!("{anchor} is no longer relative to the cloud origin"))?
        + anchored
        + marker.len();
    let length = source[start..]
        .find('`')
        .with_context(|| format!("{anchor} is unterminated"))?;
    let template = &source[start..start + length];
    ensure!(
        template.starts_with('/') && !template.contains(['\n', '\\']),
        "{anchor} is not an absolute path"
    );
    Ok(template)
}

fn validated_origin(origin: Url) -> Result<Url> {
    let loopback = matches!(origin.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    ensure!(
        (origin.scheme() == "https" || origin.scheme() == "http" && loopback)
            && origin.username().is_empty()
            && origin.password().is_none()
            && origin.path() == "/"
            && origin.query().is_none()
            && origin.fragment().is_none(),
        "The update origin must be an HTTPS origin or a loopback development server"
    );
    Ok(origin)
}

#[derive(Clone, Debug)]
pub struct ReleaseFeed {
    origin: Url,
    availability_path: String,
    installer_template: String,
    channel: String,
    version_header: String,
}

impl ReleaseFeed {
    pub fn production() -> Result<Self> {
        Self::from_sources(CLOUD_SHELL_CONFIG, CLOUD_SHELL_UPDATE, HEADER_NAMES)
    }

    pub fn from_sources(config: &str, update: &str, header_names: &str) -> Result<Self> {
        let origin = Url::parse(string_constant(config, "PRODUCTION_CLOUD_APP_ORIGIN")?)
            .context("The production cloud origin is not a URL")?;
        let availability_path = origin_template(update, "DESKTOP_CLOUD_RELEASE_AVAILABILITY_URL")?;
        ensure!(
            !availability_path.contains("${") && !availability_path.contains('?'),
            "The release availability path must be fixed"
        );
        let installer_template =
            origin_template(update, "function desktopCloudInstallerDownloadUrl")?;
        ensure!(
            installer_template.contains(CHANNEL_PLACEHOLDER)
                && installer_template.contains(ARCHITECTURE_PLACEHOLDER)
                && installer_template
                    .replace(CHANNEL_PLACEHOLDER, "")
                    .replace(ARCHITECTURE_PLACEHOLDER, "")
                    .find("${")
                    .is_none(),
            "The installer download path has unknown parameters"
        );
        Ok(Self {
            origin: validated_origin(origin)?,
            availability_path: availability_path.to_owned(),
            installer_template: installer_template.to_owned(),
            channel: string_constant(update, "DESKTOP_CLOUD_RELEASE_CHANNEL")?.to_owned(),
            version_header: string_constant(header_names, "CLIENT_VERSION_HEADER")?.to_owned(),
        })
    }

    pub fn with_origin(mut self, origin: Url) -> Result<Self> {
        self.origin = validated_origin(origin)?;
        Ok(self)
    }

    pub fn origin(&self) -> &Url {
        &self.origin
    }

    pub fn version_header(&self) -> &str {
        &self.version_header
    }

    pub fn availability_url(&self) -> Result<Url> {
        Ok(self.origin.join(&self.availability_path)?)
    }

    pub fn installer_url(&self, architecture: MacArchitecture, version: &str) -> Result<Url> {
        let mut url = self.origin.join(
            &self
                .installer_template
                .replace(CHANNEL_PLACEHOLDER, &self.channel)
                .replace(ARCHITECTURE_PLACEHOLDER, architecture.as_str()),
        )?;
        url.query_pairs_mut().append_pair(VERSION_QUERY, version);
        Ok(url)
    }

    pub fn checksums_url(&self) -> Result<Url> {
        let mut url = self.origin.join(
            self.installer_template
                .split('?')
                .next()
                .unwrap_or(&self.installer_template),
        )?;
        url.path_segments_mut()
            .map_err(|()| anyhow!("The installer path cannot hold checksums"))?
            .push(CHECKSUMS_SEGMENT);
        Ok(url)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AvailableUpdate {
    pub version: String,
    pub published_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CheckOutcome {
    UpToDate { latest: Option<String> },
    Available(AvailableUpdate),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReleasePayload {
    version: String,
    published_at: Option<String>,
    platforms: ReleasePlatforms,
    architectures: ReleaseArchitectures,
}

#[derive(Deserialize)]
struct ReleasePlatforms {
    mac: bool,
}

#[derive(Deserialize)]
struct ReleaseArchitectures {
    arm64: bool,
    x64: bool,
}

#[derive(Deserialize)]
struct ErrorPayload {
    error: ErrorBody,
}

#[derive(Deserialize)]
struct ErrorBody {
    code: String,
}

pub fn interpret_availability(
    status: u16,
    body: &[u8],
    current: &Version,
    architecture: MacArchitecture,
) -> Result<CheckOutcome> {
    if status == 404 {
        return Ok(CheckOutcome::UpToDate { latest: None });
    }
    if status == 503
        && serde_json::from_slice::<ErrorPayload>(body)
            .is_ok_and(|payload| payload.error.code == "UPDATES_HELD")
    {
        bail!("Updates for this version are paused. Try again later.");
    }
    ensure!(
        status == 200,
        "Update information is unavailable ({status})."
    );
    ensure!(
        body.len() <= MAX_METADATA_BYTES,
        "The update service sent an invalid release response."
    );
    let release: ReleasePayload = serde_json::from_slice(body)
        .map_err(|_| anyhow!("The update service sent an invalid release response."))?;
    let latest = Version::parse(&release.version)
        .map_err(|_| anyhow!("The update service sent incomplete release metadata."))?;
    ensure!(
        release.platforms.mac,
        "The update service sent incomplete release metadata."
    );
    if !latest.is_newer_than(current) {
        return Ok(CheckOutcome::UpToDate {
            latest: Some(release.version),
        });
    }
    let published = match architecture {
        MacArchitecture::Arm64 => release.architectures.arm64,
        MacArchitecture::X64 => release.architectures.x64,
    };
    ensure!(
        published,
        "No signed {} installer is published for this update.",
        architecture.as_str()
    );
    Ok(CheckOutcome::Available(AvailableUpdate {
        version: release.version,
        published_at: release.published_at,
    }))
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InstallerDigest {
    pub name: String,
    pub sha256: String,
}

#[derive(Deserialize)]
struct ChecksumPayload {
    version: String,
    algorithm: String,
    installers: Vec<ChecksumEntry>,
}

#[derive(Deserialize)]
struct ChecksumEntry {
    name: String,
    architecture: Option<String>,
    sha256: String,
}

pub fn safe_installer_name(name: &str) -> bool {
    name.len() <= 255
        && name.ends_with(".dmg")
        && name.len() > ".dmg".len()
        && !name.starts_with(['.', ' '])
        && name
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || " ._()-".contains(character))
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

pub fn interpret_checksums(
    status: u16,
    body: &[u8],
    version: &str,
    architecture: MacArchitecture,
) -> Result<InstallerDigest> {
    ensure!(
        status == 200,
        "No published installer checksum is available ({status}), so the update was not downloaded."
    );
    ensure!(
        body.len() <= MAX_METADATA_BYTES,
        "The update service sent an invalid checksum response."
    );
    let payload: ChecksumPayload = serde_json::from_slice(body)
        .map_err(|_| anyhow!("The update service sent an invalid checksum response."))?;
    ensure!(
        payload.algorithm == "sha256",
        "The update service sent an unsupported checksum algorithm."
    );
    ensure!(
        payload.version == version,
        "A different release was published while checking. Check for updates again."
    );
    let mut matching = payload
        .installers
        .into_iter()
        .filter(|entry| entry.architecture.as_deref() == Some(architecture.as_str()));
    let entry = matching.next().with_context(|| {
        format!(
            "No {} installer checksum is published.",
            architecture.as_str()
        )
    })?;
    ensure!(
        matching.next().is_none(),
        "The release lists more than one {} installer.",
        architecture.as_str()
    );
    ensure!(
        is_sha256(&entry.sha256) && safe_installer_name(&entry.name),
        "The update service sent an invalid installer checksum."
    );
    Ok(InstallerDigest {
        name: entry.name,
        sha256: entry.sha256,
    })
}

pub fn parse_sha256_output(output: &str) -> Result<String> {
    let digest = output
        .split_whitespace()
        .next()
        .map(str::to_ascii_lowercase)
        .context("The checksum tool printed nothing")?;
    ensure!(
        is_sha256(&digest),
        "The checksum tool printed an invalid digest"
    );
    Ok(digest)
}

pub fn parse_team_identifier(codesign_details: &str) -> Option<String> {
    codesign_details
        .lines()
        .find_map(|line| line.strip_prefix("TeamIdentifier="))
        .map(str::trim)
        .filter(|team| {
            !team.is_empty()
                && *team != "not set"
                && team
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
        })
        .map(str::to_owned)
}

pub fn available_destination(directory: &Path, name: &str) -> Result<PathBuf> {
    ensure!(safe_installer_name(name), "The installer name is unsafe");
    let stem = &name[..name.len() - ".dmg".len()];
    for attempt in 0..MAX_DESTINATION_ATTEMPTS {
        let candidate = if attempt == 0 {
            directory.join(name)
        } else {
            directory.join(format!("{stem} ({attempt}).dmg"))
        };
        if fs::symlink_metadata(&candidate).is_err() {
            return Ok(candidate);
        }
    }
    bail!(
        "Too many installers named {name} are already in {}",
        directory.display()
    )
}

pub fn downloads_directory(home: Option<OsString>) -> Result<PathBuf> {
    let home = PathBuf::from(home.context("The home folder is unknown")?);
    ensure!(
        home.is_absolute(),
        "The home folder must be an absolute path"
    );
    Ok(home.join("Downloads"))
}

pub fn notices_file_name() -> Result<&'static str> {
    string_constant(CLOUD_SHELL_NOTICES, "OPEN_SOURCE_NOTICES_FILE")
}

fn bundle_resources(executable: &Path) -> Option<PathBuf> {
    let contents = executable.parent()?.parent()?;
    (contents.file_name()? == "Contents").then(|| contents.join("Resources"))
}

pub fn bundle_path(executable: &Path) -> Option<PathBuf> {
    let contents = executable.parent()?.parent()?;
    let bundle = contents.parent()?;
    (contents.file_name()? == "Contents"
        && bundle
            .extension()
            .is_some_and(|extension| extension == "app"))
    .then(|| bundle.to_path_buf())
}

pub fn bundled_notices(executable: &Path) -> Option<PathBuf> {
    let path = bundle_resources(executable)?.join(notices_file_name().ok()?);
    path.is_file().then_some(path)
}

pub fn bundled_runtime_version(executable: &Path) -> Option<String> {
    let manifest = fs::read(bundle_resources(executable)?.join(RUNTIME_MANIFEST)).ok()?;
    let manifest: serde_json::Value = serde_json::from_slice(&manifest).ok()?;
    manifest
        .get("version")?
        .as_str()
        .map(str::trim)
        .filter(|version| !version.is_empty())
        .map(str::to_owned)
}

pub fn write_notices(directory: &Path, text: &[u8]) -> Result<PathBuf> {
    ensure!(!text.is_empty(), "The open-source notices are empty");
    fs::create_dir_all(directory)?;
    let path = directory.join(notices_file_name()?);
    fs::write(&path, text)?;
    Ok(path)
}

fn run(command: &mut Command) -> Result<Output> {
    command
        .stdin(Stdio::null())
        .output()
        .with_context(|| format!("{:?} could not start", command.get_program()))
}

fn curl(feed: &ReleaseFeed, url: &Url, current: &Version, timeout: Duration) -> Result<Command> {
    ensure!(
        url.origin() == feed.origin.origin(),
        "The update request left the update origin"
    );
    let seconds = timeout.as_secs().max(1).to_string();
    let mut command = Command::new(CURL);
    command
        .arg("-q")
        .args(["--silent", "--show-error", "--globoff", "--max-redirs", "0"])
        .args(["--proto", &format!("={}", url.scheme())])
        .args(["--connect-timeout", &seconds])
        .args(["-H", &format!("{}: {current}", feed.version_header)]);
    Ok(command)
}

fn transport_failure(output: &Output) -> anyhow::Error {
    if output.status.code() == Some(CURL_TIMEOUT_EXIT) {
        anyhow!("Could not reach the update service in time.")
    } else {
        anyhow!("Could not reach the update service. Check your connection and try again.")
    }
}

fn status_code(text: &str) -> Result<u16> {
    text.trim()
        .parse::<u16>()
        .ok()
        .filter(|status| (100..600).contains(status))
        .context("The update service sent an invalid response.")
}

pub fn fetch_metadata(
    feed: &ReleaseFeed,
    url: &Url,
    current: &Version,
    timeout: Duration,
) -> Result<(u16, Vec<u8>)> {
    let seconds = timeout.as_secs().max(1).to_string();
    let output = run(curl(feed, url, current, timeout)?
        .args(["--max-time", &seconds])
        .args(["--max-filesize", &MAX_METADATA_BYTES.to_string()])
        .args(["-H", "Accept: application/json"])
        .args(["--write-out", "\n%{http_code}", "--output", "-"])
        .arg(url.as_str()))?;
    if !output.status.success() {
        return Err(transport_failure(&output));
    }
    let split = output
        .stdout
        .iter()
        .rposition(|byte| *byte == b'\n')
        .context("The update service sent an invalid response.")?;
    let status = status_code(&String::from_utf8_lossy(&output.stdout[split + 1..]))?;
    let mut body = output.stdout;
    body.truncate(split);
    ensure!(
        body.len() <= MAX_METADATA_BYTES,
        "The update service sent an oversized response."
    );
    Ok((status, body))
}

pub fn sha256_file(path: &Path) -> Result<String> {
    let output = run(Command::new(SHASUM).args(["-a", "256", "-b"]).arg(path))?;
    ensure!(
        output.status.success(),
        "The installer checksum could not be computed"
    );
    parse_sha256_output(&String::from_utf8_lossy(&output.stdout))
}

fn codesign_team(path: &Path) -> Result<Option<String>> {
    let output = run(Command::new(CODESIGN).args(["-d", "--verbose=2"]).arg(path))?;
    if !output.status.success() {
        return Ok(None);
    }
    Ok(parse_team_identifier(&String::from_utf8_lossy(
        &output.stderr,
    )))
}

pub fn gatekeeper_gate(running_bundle: Option<PathBuf>) -> impl Fn(&Path) -> Result<()> {
    move |installer| {
        let assessment = run(Command::new(SPCTL)
            .args([
                "--assess",
                "--type",
                "open",
                "--context",
                "context:primary-signature",
            ])
            .arg(installer))?;
        ensure!(
            assessment.status.success(),
            "The downloaded installer is not signed and notarized, so it was deleted."
        );
        let expected = match &running_bundle {
            Some(bundle) => codesign_team(bundle)?,
            None => None,
        };
        if let Some(expected) = expected {
            ensure!(
                codesign_team(installer)?.as_deref() == Some(expected.as_str()),
                "The downloaded installer is signed by a different developer, so it was deleted."
            );
        }
        Ok(())
    }
}

struct Staged(Option<PathBuf>);

impl Drop for Staged {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            let _ = fs::remove_file(path);
        }
    }
}

pub struct UpdateClient {
    feed: ReleaseFeed,
    current: Version,
    architecture: MacArchitecture,
    timeout: Duration,
}

impl UpdateClient {
    pub fn new(
        feed: ReleaseFeed,
        current: Version,
        architecture: MacArchitecture,
        timeout: Duration,
    ) -> Self {
        Self {
            feed,
            current,
            architecture,
            timeout,
        }
    }

    pub fn current(&self) -> &Version {
        &self.current
    }

    pub fn check(&self) -> Result<CheckOutcome> {
        let (status, body) = fetch_metadata(
            &self.feed,
            &self.feed.availability_url()?,
            &self.current,
            self.timeout,
        )?;
        interpret_availability(status, &body, &self.current, self.architecture)
    }

    pub fn download(
        &self,
        update: &AvailableUpdate,
        directory: &Path,
        gate: impl Fn(&Path) -> Result<()>,
    ) -> Result<PathBuf> {
        let latest = Version::parse(&update.version)?;
        ensure!(
            latest.is_newer_than(&self.current),
            "This update is not newer than the installed version."
        );
        let (status, body) = fetch_metadata(
            &self.feed,
            &self.feed.checksums_url()?,
            &self.current,
            self.timeout,
        )?;
        let digest = interpret_checksums(status, &body, &update.version, self.architecture)?;
        fs::create_dir_all(directory)
            .with_context(|| format!("{} could not be created", directory.display()))?;
        let staged_path = directory.join(format!(".{}-{}", uuid::Uuid::new_v4(), digest.name));
        let mut staged = Staged(Some(staged_path.clone()));
        let url = self
            .feed
            .installer_url(self.architecture, &update.version)?;
        let seconds = self.timeout.as_secs().max(1).to_string();
        let output = run(curl(&self.feed, &url, &self.current, self.timeout)?
            .args(["--max-filesize", &MAX_INSTALLER_BYTES.to_string()])
            .args(["--speed-limit", "1", "--speed-time", &seconds])
            .args(["--write-out", "%{http_code}", "--output"])
            .arg(&staged_path)
            .arg(url.as_str()))?;
        if !output.status.success() {
            return Err(transport_failure(&output));
        }
        let status = status_code(&String::from_utf8_lossy(&output.stdout))?;
        ensure!(
            status != 303,
            "A different release was published while downloading. Check for updates again."
        );
        ensure!(status == 200, "The installer download failed ({status}).");
        ensure!(
            fs::metadata(&staged_path).is_ok_and(|metadata| metadata.len() > 0),
            "The installer download was empty."
        );
        ensure!(
            sha256_file(&staged_path)? == digest.sha256,
            "The downloaded installer did not match its published checksum, so it was deleted."
        );
        gate(&staged_path)?;
        let destination = available_destination(directory, &digest.name)?;
        fs::rename(&staged_path, &destination).with_context(|| {
            format!(
                "The installer could not be saved to {}",
                destination.display()
            )
        })?;
        staged.0 = None;
        Ok(destination)
    }
}
