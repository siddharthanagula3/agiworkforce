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
    Delete,
}

impl Method {
    pub fn as_str(self) -> &'static str {
        match self {
            Method::Get => "GET",
            Method::Post => "POST",
            Method::Put => "PUT",
            Method::Delete => "DELETE",
        }
    }

    fn reqwest(self) -> reqwest::Method {
        match self {
            Method::Get => reqwest::Method::GET,
            Method::Post => reqwest::Method::POST,
            Method::Put => reqwest::Method::PUT,
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

    async fn send<T: DeserializeOwned>(builder: reqwest::RequestBuilder) -> Result<T, CloudError> {
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
        if !(200..300).contains(&status) {
            return Err(CloudError::Api {
                status,
                message: api_error_message(&body),
            });
        }
        serde_json::from_str(&body).map_err(|error| CloudError::Decode(error.to_string()))
    }

    pub async fn get<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<T, CloudError> {
        Self::send(self.request(reqwest::Method::GET, path).query(query)).await
    }

    pub async fn post<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, CloudError> {
        Self::send(self.request(reqwest::Method::POST, path).json(body)).await
    }

    /// Send one declared [`Route`]. Commands that name their route go through
    /// here, so the method and path they use cannot drift from what is tested.
    pub async fn call<T: DeserializeOwned>(
        &self,
        route: &Route,
        query: &[(&str, String)],
        body: Option<&serde_json::Value>,
    ) -> Result<T, CloudError> {
        let mut builder = self
            .request(route.method.reqwest(), &route.path)
            .query(query);
        if let Some(body) = body {
            builder = builder.json(body);
        }
        Self::send(builder).await
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

    /// Read a hosted file the account owns. Media the account stores is served
    /// behind the same credential as the JSON APIs, so a generated image is not
    /// reachable by URL alone.
    pub async fn get_bytes(&self, path: &str) -> Result<Vec<u8>, CloudError> {
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
        response
            .bytes()
            .await
            .map(|bytes| bytes.to_vec())
            .map_err(|error| CloudError::Transport(error.to_string()))
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
