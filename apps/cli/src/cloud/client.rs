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
    Api { status: u16, message: String },
    Decode(String),
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
                "{} privacy mode keeps this conversation on this device, nothing was sent to your \
                 account. Switch to Managed mode to share history, projects and memory across your \
                 clients.",
                mode.label()
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
            CloudError::Decode(message) => {
                write!(
                    f,
                    "your AGI Workforce account returned an unreadable response: {message}"
                )
            }
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

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.http
            .request(method, format!("{}{path}", self.base))
            .header("Authorization", format!("Bearer {}", self.jwt))
            .header("Accept", "application/json")
            .header("X-AGI-Surface", "cli")
    }

    async fn send<T: DeserializeOwned>(builder: reqwest::RequestBuilder) -> Result<T, CloudError> {
        let response = builder
            .send()
            .await
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        let status = response.status().as_u16();
        let body = response
            .text()
            .await
            .map_err(|error| CloudError::Transport(error.to_string()))?;
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
