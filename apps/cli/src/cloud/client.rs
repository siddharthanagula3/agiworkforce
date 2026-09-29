//! Shared transport for the hosted account APIs the CLI reads and writes.
//!
//! Every hosted surface (chat history, projects, memory) speaks through this
//! one client so the credential, the API base allowlist and the 401 handling
//! cannot drift apart between them.

use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::platform::runtime::session::PrivacyMode;
use crate::schedules::api_error_message;
use crate::tier_cache;

const CLOUD_TIMEOUT: Duration = Duration::from_secs(20);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(3600);

#[derive(Debug)]
pub enum CloudError {
    SignedOut,
    SessionExpired,
    NotManaged(PrivacyMode),
    ApiBase(String),
    Transport(String),
    Api {
        status: u16,
        message: String,
    },
    Decode(String),
    /// The deployment refused this build's contract version. Held as the CLI
    /// error itself so the process exits on its class rather than on the
    /// undifferentiated failure every other HTTP status shares.
    UpgradeRequired(Box<crate::errors::CliError>),
}

impl std::fmt::Display for CloudError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CloudError::SignedOut => f.write_str(
                "no AGI Workforce credential: your account history, projects and memory live in \
                 your cloud account, sign in with `agi login`",
            ),
            CloudError::SessionExpired => {
                f.write_str("your AGI Workforce session expired, sign in again with `agi login`")
            }
            CloudError::NotManaged(mode) => write!(
                f,
                "{}: this conversation stays on this device and is not saved to your account. \
                 Switch to Managed with /model to sync history, projects and memory across your \
                 devices.",
                mode.trust_word()
            ),
            CloudError::ApiBase(base) => write!(
                f,
                "AGIWORKFORCE_API_BASE must be an https agiworkforce.com host or a loopback dev \
                 server, got '{base}'"
            ),
            CloudError::Transport(message) => {
                write!(f, "could not reach your AGI Workforce account: {message}")
            }
            CloudError::Api { status, message } => write!(f, "{message} (HTTP {status})"),
            CloudError::UpgradeRequired(error) => error.fmt(f),
            CloudError::Decode(message) => {
                write!(
                    f,
                    "your AGI Workforce account returned an unreadable response: {message}"
                )
            }
        }
    }
}

/// Carries the upgrade refusal as a cause, so a caller that turns this into
/// `anyhow::Error` still exits on the refusal's class rather than on 1.
impl std::error::Error for CloudError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            CloudError::UpgradeRequired(error) => Some(error.as_ref()),
            _ => None,
        }
    }
}

impl CloudError {
    /// True when nothing is wrong with the request itself: the user is simply
    /// not using the hosted account right now.
    pub fn is_boundary(&self) -> bool {
        matches!(
            self,
            CloudError::SignedOut | CloudError::NotManaged(_) | CloudError::SessionExpired
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Method {
    Get,
    Post,
    Put,
    Patch,
    Delete,
}

impl Method {
    pub fn as_str(self) -> &'static str {
        match self {
            Method::Get => "GET",
            Method::Post => "POST",
            Method::Put => "PUT",
            Method::Patch => "PATCH",
            Method::Delete => "DELETE",
        }
    }

    fn reqwest(self) -> reqwest::Method {
        match self {
            Method::Get => reqwest::Method::GET,
            Method::Post => reqwest::Method::POST,
            Method::Put => reqwest::Method::PUT,
            Method::Patch => reqwest::Method::PATCH,
            Method::Delete => reqwest::Method::DELETE,
        }
    }
}

/// One hosted call as a value: the method and path a command uses, stated once
/// so a test can assert the routing without a live server.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Route {
    pub method: Method,
    pub path: String,
}

impl Route {
    pub fn get(path: impl Into<String>) -> Self {
        Self {
            method: Method::Get,
            path: path.into(),
        }
    }

    pub fn post(path: impl Into<String>) -> Self {
        Self {
            method: Method::Post,
            path: path.into(),
        }
    }

    pub fn put(path: impl Into<String>) -> Self {
        Self {
            method: Method::Put,
            path: path.into(),
        }
    }

    pub fn patch(path: impl Into<String>) -> Self {
        Self {
            method: Method::Patch,
            path: path.into(),
        }
    }

    pub fn delete(path: impl Into<String>) -> Self {
        Self {
            method: Method::Delete,
            path: path.into(),
        }
    }
}

pub struct CloudClient {
    base: String,
    jwt: String,
    owner: String,
    http: reqwest::Client,
}

impl CloudClient {
    /// Connect for a session running under `privacy`. Only Managed sessions may
    /// reach the account: Local and BYOK sessions are a different trust
    /// boundary and are refused here rather than at the call site.
    pub fn connect(privacy: PrivacyMode) -> Result<Self, CloudError> {
        if privacy != PrivacyMode::Managed {
            return Err(CloudError::NotManaged(privacy));
        }
        Self::connect_managed()
    }

    pub fn connect_managed() -> Result<Self, CloudError> {
        let jwt = match tier_cache::load_jwt() {
            Some(jwt) if !jwt.trim().is_empty() => jwt,
            _ => return Err(CloudError::SignedOut),
        };
        let raw_base = std::env::var("AGIWORKFORCE_API_BASE")
            .unwrap_or_else(|_| tier_cache::default_api_base().to_string());
        let base = tier_cache::resolve_agi_api_base(&raw_base)
            .ok_or_else(|| CloudError::ApiBase(raw_base.clone()))?;
        let http = reqwest::Client::builder()
            .timeout(CLOUD_TIMEOUT)
            .build()
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        let owner = crate::auth::jwt_subject(&jwt).unwrap_or_else(|| "unknown".to_string());
        Ok(Self {
            base,
            jwt,
            owner,
            http,
        })
    }

    /// Identity the stored sync cursors belong to. A different account signing
    /// in must not resume another account's cursors.
    pub fn owner(&self) -> &str {
        &self.owner
    }

    /// The deployment these calls reach, so a caller can name a page on the
    /// same host it just read from rather than assuming production.
    pub fn base(&self) -> &str {
        &self.base
    }

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        crate::cloud::handshake::apply(
            self.http
                .request(method, format!("{}{path}", self.base))
                .header("Authorization", format!("Bearer {}", self.jwt))
                .header("Accept", "application/json"),
        )
    }

    async fn exchange(builder: reqwest::RequestBuilder) -> Result<Reply, CloudError> {
        let response = builder
            .send()
            .await
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        let status = response.status().as_u16();
        let minimum_api_version = crate::cloud::handshake::minimum_api_version(response.headers());
        let body = response
            .text()
            .await
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        if let Some(error) =
            crate::cloud::handshake::upgrade_required(status, minimum_api_version, &body)
        {
            return Err(CloudError::UpgradeRequired(Box::new(error)));
        }
        if status == 401 {
            tier_cache::invalidate_tier_cache();
            return Err(CloudError::SessionExpired);
        }
        Ok(Reply { status, body })
    }

    async fn send<T: DeserializeOwned>(builder: reqwest::RequestBuilder) -> Result<T, CloudError> {
        let reply = Self::exchange(builder).await?;
        if !reply.is_success() {
            return Err(CloudError::Api {
                status: reply.status,
                message: api_error_message(&reply.body),
            });
        }
        serde_json::from_str(&reply.body).map_err(|error| CloudError::Decode(error.to_string()))
    }

    /// Send, and on a 401 renew the session once and send again. A token the
    /// server refuses before it was due to expire (a passkey enrolled, the
    /// device unlinked) would otherwise fail every call while the account still
    /// looked signed in. A refresh that is refused too, or a second 401, forgets
    /// the credential, so the next status reads signed out and the user, or the
    /// desktop's account sync, signs in again.
    async fn send_renewing<T: DeserializeOwned>(
        &self,
        build: impl Fn(&CloudClient) -> reqwest::RequestBuilder,
    ) -> Result<T, CloudError> {
        match Self::send(build(self)).await {
            Err(CloudError::SessionExpired) => {}
            other => return other,
        }
        use crate::app_server::account::{
            forget_refused_session, recover_rejected_session, RejectedSessionRecovery,
        };
        match recover_rejected_session(&self.jwt).await {
            RejectedSessionRecovery::Renewed => {
                let renewed = CloudClient::connect_managed()?;
                match Self::send(build(&renewed)).await {
                    Err(CloudError::SessionExpired) => {
                        forget_refused_session();
                        Err(CloudError::SessionExpired)
                    }
                    other => other,
                }
            }
            RejectedSessionRecovery::Refused(message) => Err(CloudError::Api {
                status: 403,
                message,
            }),
            RejectedSessionRecovery::Ended(_) | RejectedSessionRecovery::Unavailable => {
                Err(CloudError::SessionExpired)
            }
        }
    }

    pub async fn get<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<T, CloudError> {
        self.send_renewing(|client| client.request(reqwest::Method::GET, path).query(query))
            .await
    }

    pub async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, CloudError> {
        self.send_renewing(|client| client.request(reqwest::Method::POST, path).json(body))
            .await
    }

    /// Send one declared [`Route`]. Commands that name their route go through
    /// here, so the method and path they use cannot drift from what is tested.
    pub async fn call<T: DeserializeOwned>(
        &self,
        route: &Route,
        query: &[(&str, String)],
        body: Option<&serde_json::Value>,
    ) -> Result<T, CloudError> {
        self.send_renewing(|client| {
            let builder = client
                .request(route.method.reqwest(), &route.path)
                .query(query);
            match body {
                Some(body) => builder.json(body),
                None => builder,
            }
        })
        .await
    }

    /// POST one billable Managed Cloud operation. The key identifies the
    /// operation so a retry settles the same reservation instead of charging
    /// the account twice.
    pub async fn post_idempotent<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        idempotency_key: &str,
        body: &B,
        timeout: Duration,
    ) -> Result<T, CloudError> {
        Self::send(
            self.request(reqwest::Method::POST, path)
                .header("Idempotency-Key", idempotency_key)
                .timeout(timeout)
                .json(body),
        )
        .await
    }

    pub async fn post_reply<B: Serialize>(
        &self,
        path: &str,
        idempotency_key: Option<&str>,
        body: &B,
        timeout: Duration,
    ) -> Result<Reply, CloudError> {
        let mut builder = self
            .request(reqwest::Method::POST, path)
            .timeout(timeout)
            .json(body);
        if let Some(key) = idempotency_key {
            builder = builder.header("Idempotency-Key", key);
        }
        Self::exchange(builder).await
    }

    /// Read a hosted file the account owns. Media the account stores is served
    /// behind the same credential as the JSON APIs, so a generated image is not
    /// reachable by URL alone.
    pub async fn get_bytes(&self, path: &str) -> Result<Vec<u8>, CloudError> {
        self.get_bytes_with_header(path, None)
            .await
            .map(|(bytes, _)| bytes)
    }

    pub async fn get_bytes_with_header(
        &self,
        path: &str,
        header: Option<&str>,
    ) -> Result<(Vec<u8>, Option<String>), CloudError> {
        let response = self
            .request(reqwest::Method::GET, path)
            .header("Accept", "*/*")
            .send()
            .await
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        let status = response.status().as_u16();
        if status == 401 {
            tier_cache::invalidate_tier_cache();
            return Err(CloudError::SessionExpired);
        }
        if !(200..300).contains(&status) {
            let body = response.text().await.unwrap_or_default();
            return Err(CloudError::Api {
                status,
                message: api_error_message(&body),
            });
        }
        let value = header
            .and_then(|name| response.headers().get(name))
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        response
            .bytes()
            .await
            .map(|bytes| (bytes.to_vec(), value))
            .map_err(|error| CloudError::Transport(error.to_string()))
    }

    pub async fn download_to(
        &self,
        path: &str,
        target: &std::path::Path,
    ) -> Result<u64, CloudError> {
        let response = self.download_response(path).await?;
        write_body(response, target).await
    }

    pub async fn download_into(
        &self,
        path: &str,
        directory: &std::path::Path,
        fallback_name: &str,
    ) -> Result<std::path::PathBuf, CloudError> {
        let response = self.download_response(path).await?;
        let name = response
            .headers()
            .get(reqwest::header::CONTENT_DISPOSITION)
            .and_then(|value| value.to_str().ok())
            .and_then(disposition_file_name)
            .unwrap_or_else(|| fallback_name.to_string());
        let target = directory.join(name);
        write_body(response, &target).await?;
        Ok(target)
    }

    async fn download_response(&self, path: &str) -> Result<reqwest::Response, CloudError> {
        let response = self
            .request(reqwest::Method::GET, path)
            .header("Accept", "*/*")
            .timeout(DOWNLOAD_TIMEOUT)
            .send()
            .await
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        let status = response.status().as_u16();
        if status == 401 {
            tier_cache::invalidate_tier_cache();
            return Err(CloudError::SessionExpired);
        }
        if !(200..300).contains(&status) {
            let body = response.text().await.unwrap_or_default();
            return Err(CloudError::Api {
                status,
                message: api_error_message(&body),
            });
        }
        Ok(response)
    }
}

fn disposition_file_name(disposition: &str) -> Option<String> {
    let raw = disposition.split(';').map(str::trim).find_map(|part| {
        part.strip_prefix("filename=")
            .map(|value| value.trim_matches('"').to_string())
    })?;
    std::path::Path::new(&raw)
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty() && *name != "." && *name != "..")
        .map(str::to_string)
}

async fn write_body(
    mut response: reqwest::Response,
    target: &std::path::Path,
) -> Result<u64, CloudError> {
    let write_error = |error: std::io::Error| {
        CloudError::Transport(format!("could not write {}: {error}", target.display()))
    };
    let mut file = tokio::fs::File::create(target).await.map_err(write_error)?;
    let mut written = 0u64;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| CloudError::Transport(error.to_string()))?
    {
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(write_error)?;
        written += chunk.len() as u64;
    }
    tokio::io::AsyncWriteExt::flush(&mut file)
        .await
        .map_err(write_error)?;
    Ok(written)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reply {
    pub status: u16,
    pub body: String,
}

impl Reply {
    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.status)
    }
}

pub async fn connectivity_line(privacy: PrivacyMode) -> String {
    if privacy != PrivacyMode::Managed {
        return format!("AGI Cloud: not used by this {} session", privacy.label());
    }
    let raw_base = std::env::var("AGIWORKFORCE_API_BASE")
        .unwrap_or_else(|_| tier_cache::default_api_base().to_string());
    let Some(base) = tier_cache::resolve_agi_api_base(&raw_base) else {
        return format!("AGI Cloud: {raw_base} is not an AGI Workforce address");
    };
    let started = std::time::Instant::now();
    let probe = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map(|client| client.get(format!("{base}/api/health")).send());
    let outcome = match probe {
        Ok(request) => request.await,
        Err(_) => {
            return "AGI Cloud: unreachable. Check your connection, then run /status to try again."
                .to_string()
        }
    };
    match outcome {
        Ok(response) if response.status().is_success() => format!(
            "AGI Cloud: reachable ({} ms)",
            started.elapsed().as_millis()
        ),
        Ok(response) => format!(
            "AGI Cloud: answered HTTP {}. Run /status to try again.",
            response.status().as_u16()
        ),
        Err(error) if error.is_timeout() => {
            "AGI Cloud: no answer within 5 seconds. Check your connection, then run /status to try again."
                .to_string()
        }
        Err(_) => {
            "AGI Cloud: unreachable. Check your connection, then run /status to try again.".to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_local_session_never_reaches_the_account() {
        let error = CloudClient::connect(PrivacyMode::Local)
            .err()
            .expect("a local session must be refused");
        assert!(matches!(error, CloudError::NotManaged(PrivacyMode::Local)));
        assert!(error.to_string().contains("on this device"));
        assert!(error.is_boundary());
    }

    #[test]
    fn a_byok_session_never_reaches_the_account() {
        let error = CloudClient::connect(PrivacyMode::Byok)
            .err()
            .expect("a byok session must be refused");
        assert!(matches!(error, CloudError::NotManaged(PrivacyMode::Byok)));
        assert!(error.is_boundary());
    }

    #[test]
    fn the_signed_out_error_names_the_login_command() {
        assert!(CloudError::SignedOut.to_string().contains("agi login"));
        assert!(CloudError::SignedOut.is_boundary());
    }

    /// The boundary notice must read for a person: the trust-boundary word,
    /// never the bare `byok` config value.
    #[test]
    fn the_not_managed_notice_names_the_trust_word_not_the_config_value() {
        let byok = CloudError::NotManaged(PrivacyMode::Byok).to_string();
        assert_eq!(
            byok,
            "Your key: this conversation stays on this device and is not saved to your \
             account. Switch to Managed with /model to sync history, projects and memory \
             across your devices."
        );
        assert!(!byok.to_lowercase().contains("byok"));

        let local = CloudError::NotManaged(PrivacyMode::Local).to_string();
        assert!(local.starts_with("Local:"));
    }

    /// A 426 is not an API failure to report as one: the build is what is out
    /// of date, and the exit status has to say so on its own.
    #[test]
    fn an_upgrade_refusal_survives_the_walk_up_an_anyhow_chain() {
        let refusal = crate::cloud::handshake::upgrade_required(
            crate::cloud::handshake::CLIENT_UPDATE_REQUIRED_STATUS,
            Some("2026-10-01".to_string()),
            r#"{"error":{"message":"Contract 2026-09-17 was retired."}}"#,
        )
        .expect("a 426 answer is an upgrade refusal");
        let error = CloudError::UpgradeRequired(Box::new(refusal));

        assert!(!error.is_boundary());
        assert!(error.to_string().contains("Update the AGI CLI"), "{error}");

        let wrapped = anyhow::Error::new(error).context("reading your account");
        let found = wrapped
            .chain()
            .find_map(|cause| cause.downcast_ref::<crate::errors::CliError>())
            .expect("the refusal is reachable as the cause");
        assert_eq!(found.kind(), "client_update_required");
        assert_eq!(
            found.exit_code(),
            crate::errors::ExitClass::ProtocolTooOld.code()
        );
    }

    #[test]
    fn a_transport_failure_is_not_a_boundary() {
        assert!(!CloudError::Transport("refused".to_string()).is_boundary());
        assert!(!CloudError::Api {
            status: 500,
            message: "boom".to_string()
        }
        .is_boundary());
    }
}
