//! Shared transport for the hosted account APIs the CLI reads and writes.
//!
//! Every hosted surface (chat history, projects, memory) speaks through this
//! one client so the credential, the API base allowlist and the 401 handling
//! cannot drift apart between them.

use std::collections::HashMap;
use std::time::Duration;

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::platform::runtime::session::PrivacyMode;
use crate::schedules::api_error_message;
use crate::tier_cache;

pub(crate) const CLOUD_TIMEOUT: Duration = Duration::from_secs(20);
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
    LocalFile(String),
    /// The deployment refused this build's contract version. Held as the CLI
    /// error itself so the process exits on its class rather than on the
    /// undifferentiated failure every other HTTP status shares.
    UpgradeRequired(Box<crate::errors::CliError>),
}

impl std::fmt::Display for CloudError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CloudError::SignedOut => f.write_str(
                "no AGI credential: your account history, projects and memory live in \
                 your cloud account, sign in with `agi login`",
            ),
            CloudError::SessionExpired => {
                f.write_str("your AGI session expired, sign in again with `agi login`")
            }
            CloudError::NotManaged(mode) => write!(
                f,
                "{}: nothing is sent to your AGI cloud account in this mode. Switch to Cloud mode \
                 with /model to use this.",
                mode.trust_word()
            ),
            CloudError::ApiBase(base) => write!(
                f,
                "AGIWORKFORCE_API_BASE must be an https agiworkforce.com host or a loopback dev \
                 server, got '{base}'"
            ),
            CloudError::Transport(message) => {
                write!(f, "could not reach your AGI account: {message}")
            }
            CloudError::Api { status, message } => write!(f, "{message} (HTTP {status})"),
            CloudError::UpgradeRequired(error) => error.fmt(f),
            CloudError::LocalFile(message) => f.write_str(message),
            CloudError::Decode(message) => {
                write!(
                    f,
                    "your AGI account returned an unreadable response: {message}"
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

    /// What to say after a chat turn that could not reach the account, where
    /// the per-command wording would leave "use this" without a referent.
    pub fn turn_notice(&self) -> String {
        match self {
            CloudError::NotManaged(mode) => format!(
                "{}: this chat stays on this device and is not saved to your account history. \
                 Choose Cloud mode in /model to sync it.",
                mode.trust_word()
            ),
            other => other.to_string(),
        }
    }

    pub fn into_anyhow(self) -> anyhow::Error {
        match self {
            CloudError::UpgradeRequired(error) => anyhow::Error::new(*error),
            other => anyhow::Error::new(other),
        }
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

#[derive(Clone)]
pub struct CloudClient {
    base: String,
    jwt: String,
    auth_base: String,
    owner: String,
    workspace: Option<agiworkforce_protocol::account_cloud::CloudConversationWorkspace>,
    source_surface: Option<&'static str>,
    http: reqwest::Client,
}

impl CloudClient {
    pub(crate) fn with_source_surface(&self, surface: &'static str) -> Self {
        let mut client = self.clone();
        client.source_surface = Some(surface);
        client
    }

    pub(crate) fn workspace(
        &self,
    ) -> Option<&agiworkforce_protocol::account_cloud::CloudConversationWorkspace> {
        self.workspace.as_ref()
    }

    pub(crate) fn with_workspace(
        &self,
        workspace: Option<&agiworkforce_protocol::account_cloud::CloudConversationWorkspace>,
    ) -> Result<Self, CloudError> {
        if workspace.is_some_and(|workspace| matches!(workspace, agiworkforce_protocol::account_cloud::CloudConversationWorkspace::Organization { id } if uuid::Uuid::parse_str(id).is_err())) { return Err(CloudError::Decode("The Cloud workspace identity is invalid".into())); }
        let mut client = self.clone();
        if let Some(workspace) = workspace {
            client.workspace = Some(workspace.clone());
        }
        Ok(client)
    }

    fn handshake_request(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        let mut headers = reqwest::header::HeaderMap::new();
        for (name, value) in crate::cloud::handshake::headers() {
            let value = if name == crate::cloud::handshake::SURFACE_HEADER {
                self.source_surface.unwrap_or(value)
            } else {
                value
            };
            headers.insert(
                reqwest::header::HeaderName::from_static(name),
                reqwest::header::HeaderValue::from_static(value),
            );
        }
        request.headers(headers)
    }

    fn workspace_request(&self, request: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        let Some(workspace) = &self.workspace else {
            return request;
        };
        let contract = super::conversation_contract::contract();
        let value = match workspace {
            agiworkforce_protocol::account_cloud::CloudConversationWorkspace::Personal => {
                contract.personal_workspace.as_str()
            }
            agiworkforce_protocol::account_cloud::CloudConversationWorkspace::Organization {
                id,
            } => id.as_str(),
        };
        request.header(contract.organization_header.as_str(), value)
    }

    pub(crate) fn gateway_runs_path(&self) -> Result<String, CloudError> {
        let endpoint = crate::models::streaming::managed_chat_endpoint(&self.base)
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        let url = reqwest::Url::parse(&endpoint)
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        Ok(format!("{}/runs", url.path()))
    }

    pub(crate) fn gateway_run_path(&self, run_id: &str) -> Result<String, CloudError> {
        Ok(format!(
            "{}/{}",
            self.gateway_runs_path()?,
            urlencoding::encode(run_id)
        ))
    }

    pub(crate) async fn open_chat_stream(
        &self,
        body: &serde_json::Value,
        key: &str,
        surface: &str,
    ) -> Result<reqwest::Response, CloudError> {
        let endpoint = crate::models::streaming::managed_chat_endpoint(&self.base)
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        self.open_gateway_stream(&endpoint, body, key, surface)
            .await
    }

    pub(crate) async fn open_chat_resume(
        &self,
        run_id: Option<&str>,
        body: &serde_json::Value,
        key: &str,
        surface: &str,
    ) -> Result<reqwest::Response, CloudError> {
        let endpoint = crate::models::streaming::managed_chat_endpoint(&self.base)
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        let endpoint = match run_id {
            Some(id) => format!("{endpoint}/runs/{}/resume", urlencoding::encode(id)),
            None => format!("{endpoint}/approve"),
        };
        self.open_gateway_stream(&endpoint, body, key, surface)
            .await
    }

    async fn open_gateway_stream(
        &self,
        endpoint: &str,
        body: &serde_json::Value,
        key: &str,
        surface: &str,
    ) -> Result<reqwest::Response, CloudError> {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::HeaderName::from_static(crate::cloud::handshake::SURFACE_HEADER),
            reqwest::header::HeaderValue::from_str(surface)
                .map_err(|error| CloudError::Transport(error.to_string()))?,
        );
        let request =
            crate::cloud::handshake::apply(self.http.post(endpoint).bearer_auth(&self.jwt))
                .headers(headers)
                .header("Idempotency-Key", key)
                .header("Accept", "text/event-stream")
                .timeout(DOWNLOAD_TIMEOUT)
                .json(body);
        let request = self.workspace_request(request);
        let response = tokio::time::timeout(CLOUD_TIMEOUT, request.send())
            .await
            .map_err(|_| {
                CloudError::Transport(
                    "The gateway did not accept the request before its deadline".into(),
                )
            })?
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response
                .text()
                .await
                .map_err(|error| CloudError::Transport(error.to_string()))?;
            return Err(CloudError::Api {
                status,
                message: api_error_message(&body),
            });
        }
        Ok(response)
    }
    /// Connect for a session running under `privacy`. Only Managed sessions may
    /// reach the account: Local and BYOK sessions are a different trust
    /// boundary and are refused here rather than at the call site.
    pub fn connect(privacy: PrivacyMode) -> Result<Self, CloudError> {
        Self::admit(privacy)?;
        Self::connect_managed()
    }

    /// The same boundary for a transport that does not hold a `CloudClient`
    /// (schedules, account usage): it must pass here before any request.
    pub fn admit(privacy: PrivacyMode) -> Result<(), CloudError> {
        if privacy != PrivacyMode::Managed {
            return Err(CloudError::NotManaged(privacy));
        }
        Ok(())
    }

    fn connect_managed() -> Result<Self, CloudError> {
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
            auth_base: crate::app_server::account::device_auth_base(),
            owner,
            workspace: None,
            source_surface: None,
            http,
        })
    }

    pub(crate) fn policy_context() -> Result<tier_cache::ManagedRequestContext, CloudError> {
        let context = tier_cache::ManagedRequestContext::capture()
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        if context.owner.is_none() {
            return Err(CloudError::Transport(
                "Managed account identity is unreadable".to_string(),
            ));
        }
        Ok(context)
    }

    pub(crate) fn from_managed_context(
        context: &tier_cache::ManagedRequestContext,
    ) -> Result<Self, CloudError> {
        let jwt = context.jwt.as_ref().ok_or(CloudError::SignedOut)?;
        let owner = crate::auth::jwt_subject(jwt)
            .filter(|_| context.owner.is_some())
            .ok_or_else(|| {
                CloudError::Transport("Managed account identity is unreadable".to_string())
            })?;
        let http = reqwest::Client::builder()
            .timeout(CLOUD_TIMEOUT)
            .build()
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        Ok(Self {
            base: context.base.clone(),
            jwt: jwt.clone(),
            auth_base: crate::app_server::account::device_auth_base(),
            owner,
            workspace: None,
            source_surface: None,
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
    pub(crate) fn auth_base(&self) -> &str {
        &self.auth_base
    }

    pub fn base(&self) -> &str {
        &self.base
    }

    pub fn upload_request(
        &self,
        upload_url: &str,
        upload_headers: &HashMap<String, String>,
    ) -> Result<reqwest::RequestBuilder, CloudError> {
        let target = reqwest::Url::parse(upload_url)
            .map_err(|_| CloudError::Transport("The upload destination is invalid.".to_string()))?;
        let base =
            reqwest::Url::parse(&self.base).map_err(|_| CloudError::ApiBase(self.base.clone()))?;
        let account_destination = target.origin() == base.origin();
        if !target.username().is_empty()
            || target.password().is_some()
            || (target.scheme() != "https" && !(target.scheme() == "http" && account_destination))
        {
            return Err(CloudError::Transport(
                "The upload destination is not secure.".to_string(),
            ));
        }
        let missing = unsent_signed_headers(&target, upload_headers);
        if !missing.is_empty() {
            return Err(CloudError::Transport(format!(
                "Refusing an upload that storage would reject: it does not send {}.",
                missing.join(", ")
            )));
        }
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| CloudError::Transport(error.to_string()))?;
        let mut request = client.put(target);
        for (name, value) in upload_headers {
            if account_destination && name.eq_ignore_ascii_case("authorization") {
                continue;
            }
            request = request.header(name, value);
        }
        if account_destination {
            request =
                self.workspace_request(self.handshake_request(request.bearer_auth(&self.jwt)));
        }
        Ok(request)
    }

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.workspace_request(
            self.handshake_request(
                self.http
                    .request(method, format!("{}{path}", self.base))
                    .header("Authorization", format!("Bearer {}", self.jwt))
                    .header("Accept", "application/json"),
            ),
        )
    }

    async fn exchange(&self, builder: reqwest::RequestBuilder) -> Result<Reply, CloudError> {
        self.exchange_with_limit(builder, None).await
    }

    async fn exchange_with_limit(
        &self,
        builder: reqwest::RequestBuilder,
        limit: Option<usize>,
    ) -> Result<Reply, CloudError> {
        let mut response = builder
            .send()
            .await
            .map_err(|error| CloudError::Transport(error.without_url().to_string()))?;
        let etag = response
            .headers()
            .get(reqwest::header::ETAG)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let status = response.status().as_u16();
        let minimum_api_version = crate::cloud::handshake::minimum_api_version(response.headers());
        let body = match limit {
            None => response
                .text()
                .await
                .map_err(|error| CloudError::Transport(error.without_url().to_string()))?,
            Some(limit) => {
                if response
                    .content_length()
                    .is_some_and(|length| length > limit as u64)
                {
                    return Err(CloudError::Decode(
                        "The Cloud response exceeds the native page budget. Read a smaller page."
                            .into(),
                    ));
                }
                let mut bytes = Vec::new();
                while let Some(chunk) = response
                    .chunk()
                    .await
                    .map_err(|error| CloudError::Transport(error.without_url().to_string()))?
                {
                    if bytes.len().saturating_add(chunk.len()) > limit {
                        return Err(CloudError::Decode("The Cloud response exceeds the native page budget. Read a smaller page.".into()));
                    }
                    bytes.extend_from_slice(&chunk);
                }
                String::from_utf8(bytes).map_err(|error| CloudError::Decode(error.to_string()))?
            }
        };
        if let Some(error) =
            crate::cloud::handshake::upgrade_required(status, minimum_api_version, &body)
        {
            return Err(CloudError::UpgradeRequired(Box::new(error)));
        }
        if status == 401 {
            tier_cache::invalidate_for_request(&self.base, &self.jwt);
            return Err(CloudError::SessionExpired);
        }
        Ok(Reply { status, body, etag })
    }

    async fn send_with_limit<T: DeserializeOwned>(
        &self,
        builder: reqwest::RequestBuilder,
        limit: Option<usize>,
    ) -> Result<T, CloudError> {
        self.exchange_with_limit(builder, limit).await?.decode()
    }

    async fn send<T: DeserializeOwned>(
        &self,
        builder: reqwest::RequestBuilder,
    ) -> Result<T, CloudError> {
        self.send_with_limit(builder, None).await
    }

    // A retry retains this request's deployment and session. Resolving a fresh
    // client here could replay the old account's body under a new login.
    async fn send_renewing<T: DeserializeOwned>(
        &self,
        build: impl Fn(&CloudClient) -> reqwest::RequestBuilder,
    ) -> Result<T, CloudError> {
        self.send_renewing_with_limit(build, None).await
    }

    async fn send_renewing_with_limit<T: DeserializeOwned>(
        &self,
        build: impl Fn(&CloudClient) -> reqwest::RequestBuilder,
        limit: Option<usize>,
    ) -> Result<T, CloudError> {
        self.exchange_renewing(build, limit).await?.decode()
    }

    async fn exchange_renewing(
        &self,
        build: impl Fn(&CloudClient) -> reqwest::RequestBuilder,
        limit: Option<usize>,
    ) -> Result<Reply, CloudError> {
        self.exchange_renewing_checked(|client| Ok(build(client)), limit)
            .await
    }
    async fn exchange_renewing_checked(
        &self,
        build: impl Fn(&CloudClient) -> Result<reqwest::RequestBuilder, CloudError>,
        limit: Option<usize>,
    ) -> Result<Reply, CloudError> {
        self.renewing(|client| {
            let request = build(&client);
            async move { client.exchange_with_limit(request?, limit).await }
        })
        .await
    }
    async fn renewing<T, F: std::future::Future<Output = Result<T, CloudError>>>(
        &self,
        send: impl Fn(CloudClient) -> F,
    ) -> Result<T, CloudError> {
        match send(self.clone()).await {
            Err(CloudError::SessionExpired) => {}
            other => return other,
        }
        use crate::app_server::account::{
            forget_refused_session, recover_rejected_session, RejectedSessionRecovery,
        };
        match recover_rejected_session(&self.jwt, &self.base, &self.auth_base).await {
            RejectedSessionRecovery::Renewed(jwt) => {
                let renewed = CloudClient {
                    base: self.base.clone(),
                    jwt,
                    auth_base: self.auth_base.clone(),
                    owner: self.owner.clone(),
                    workspace: self.workspace.clone(),
                    source_surface: self.source_surface,
                    http: self.http.clone(),
                };
                match send(renewed.clone()).await {
                    Err(CloudError::SessionExpired) => {
                        forget_refused_session(&renewed.jwt).map_err(|error| CloudError::Api {
                            status: 401,
                            message: format!(
                                "The rejected credential could not be removed: {error:#}"
                            ),
                        })?;
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
    pub(crate) async fn download_bounded(
        &self,
        path: &str,
        limit: usize,
        timeout: Duration,
        progress: impl Fn(usize) + Send + Sync,
    ) -> Result<Vec<u8>, CloudError> {
        self.renewing(|client| {
            let request = client
                .request(reqwest::Method::GET, path)
                .header("Accept", "*/*")
                .timeout(timeout);
            let progress = &progress;
            async move {
                let mut response = request
                    .send()
                    .await
                    .map_err(|error| CloudError::Transport(error.without_url().to_string()))?;
                let status = response.status().as_u16();
                if status == 401 {
                    tier_cache::invalidate_for_request(&client.base, &client.jwt);
                    return Err(CloudError::SessionExpired);
                }
                if !(200..300).contains(&status) {
                    return Err(CloudError::Api {
                        status,
                        message: "The account did not permit this file download".into(),
                    });
                }
                if response
                    .content_length()
                    .is_some_and(|length| length > limit as u64)
                {
                    return Err(CloudError::Decode(
                        "The source exceeds the reviewed download size. Refresh project files."
                            .into(),
                    ));
                }
                let mut bytes = Vec::new();
                while let Some(chunk) = response
                    .chunk()
                    .await
                    .map_err(|error| CloudError::Transport(error.without_url().to_string()))?
                {
                    if bytes.len().saturating_add(chunk.len()) > limit {
                        return Err(CloudError::Decode(
                            "The source exceeds the reviewed download size. Refresh project files."
                                .into(),
                        ));
                    }
                    bytes.extend_from_slice(&chunk);
                    progress(bytes.len());
                }
                Ok(bytes)
            }
        })
        .await
    }

    pub async fn get<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<T, CloudError> {
        self.send_renewing(|client| client.request(reqwest::Method::GET, path).query(query))
            .await
    }

    pub async fn get_bounded<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
        limit: usize,
    ) -> Result<T, CloudError> {
        self.send_renewing_with_limit(
            |client| client.request(reqwest::Method::GET, path).query(query),
            Some(limit),
        )
        .await
    }

    pub async fn get_versioned<T: DeserializeOwned>(
        &self,
        path: &str,
        query: &[(&str, String)],
        limit: usize,
    ) -> Result<(T, Option<String>), CloudError> {
        let reply = self
            .exchange_renewing(
                |client| client.request(reqwest::Method::GET, path).query(query),
                Some(limit),
            )
            .await?;
        let etag = reply.etag.clone();
        Ok((reply.decode()?, etag))
    }

    pub async fn put_versioned<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
        version: &str,
        limit: usize,
    ) -> Result<(T, Option<String>), CloudError> {
        if version.trim().is_empty() || version.trim() == "*" {
            return Err(CloudError::Decode(
                "An exact conversation revision is required".into(),
            ));
        }
        let reply = self
            .exchange_renewing(
                |client| {
                    client
                        .request(reqwest::Method::PUT, path)
                        .header(reqwest::header::IF_MATCH, version)
                        .json(body)
                },
                Some(limit),
            )
            .await?;
        let etag = reply.etag.clone();
        Ok((reply.decode()?, etag))
    }

    pub(crate) async fn put_reply_bounded<B: Serialize>(
        &self,
        path: &str,
        body: &B,
        limit: usize,
    ) -> Result<Reply, CloudError> {
        self.exchange_renewing(
            |client| client.request(reqwest::Method::PUT, path).json(body),
            Some(limit),
        )
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

    pub async fn post_bounded<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
        limit: usize,
    ) -> Result<T, CloudError> {
        self.send_renewing_with_limit(
            |client| client.request(reqwest::Method::POST, path).json(body),
            Some(limit),
        )
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
        self.send(
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
        self.exchange(builder).await
    }

    /// Read a hosted file the account owns. Media the account stores is served
    /// behind the same credential as the JSON APIs, so a generated image is not
    /// reachable by URL alone.
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
            tier_cache::invalidate_for_request(&self.base, &self.jwt);
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

    pub(crate) async fn upload_bytes_bounded(
        &self,
        url: &str,
        headers: &HashMap<String, String>,
        body: bytes::Bytes,
        timeout: Duration,
        limit: usize,
    ) -> Result<(), CloudError> {
        let request = self
            .upload_request(url, headers)?
            .timeout(timeout)
            .body(body.clone());
        let same_origin = reqwest::Url::parse(url)
            .ok()
            .zip(reqwest::Url::parse(&self.base).ok())
            .is_some_and(|(url, base)| url.origin() == base.origin());
        if same_origin {
            let reply = self
                .exchange_renewing_checked(
                    |client| {
                        client
                            .upload_request(url, headers)
                            .map(|request| request.timeout(timeout).body(body.clone()))
                    },
                    Some(limit),
                )
                .await?;
            if reply.is_success() {
                return Ok(());
            }
            return Err(CloudError::Api {
                status: reply.status,
                message: "The account did not accept this upload part".into(),
            });
        }
        let response = request
            .send()
            .await
            .map_err(|error| CloudError::Transport(error.without_url().to_string()))?;
        if !response.status().is_success() {
            return Err(CloudError::Api {
                status: response.status().as_u16(),
                message: "Storage did not accept this upload part".into(),
            });
        }
        Ok(())
    }
    pub(crate) async fn post_bounded_timeout<B: Serialize, T: DeserializeOwned>(
        &self,
        path: &str,
        body: &B,
        limit: usize,
        timeout: Duration,
    ) -> Result<T, CloudError> {
        self.send_renewing_with_limit(
            |client| {
                client
                    .request(reqwest::Method::POST, path)
                    .timeout(timeout)
                    .json(body)
            },
            Some(limit),
        )
        .await
    }
    pub(crate) async fn delete_bounded<T: DeserializeOwned>(
        &self,
        path: &str,
        limit: usize,
    ) -> Result<T, CloudError> {
        self.send_renewing_with_limit(
            |client| client.request(reqwest::Method::DELETE, path),
            Some(limit),
        )
        .await
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
            tier_cache::invalidate_for_request(&self.base, &self.jwt);
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

const HEADERS_THE_TRANSPORT_SETS: [&str; 2] = ["host", "content-length"];

fn unsent_signed_headers(target: &reqwest::Url, sent: &HashMap<String, String>) -> Vec<String> {
    target
        .query_pairs()
        .filter(|(name, _)| name.eq_ignore_ascii_case("x-amz-signedheaders"))
        .flat_map(|(_, value)| {
            value
                .split(';')
                .map(|name| name.trim().to_ascii_lowercase())
                .collect::<Vec<_>>()
        })
        .filter(|name| !name.is_empty() && !HEADERS_THE_TRANSPORT_SETS.contains(&name.as_str()))
        .filter(|name| !sent.keys().any(|sent| sent.eq_ignore_ascii_case(name)))
        .collect()
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
    let mut file = tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target)
        .await
        .map_err(|error| local_file_error(target, &error))?;
    let written = copy_body(&mut response, &mut file, target).await;
    if written.is_err() {
        drop(file);
        let _ = tokio::fs::remove_file(target).await;
    }
    written
}

async fn copy_body(
    response: &mut reqwest::Response,
    file: &mut tokio::fs::File,
    target: &std::path::Path,
) -> Result<u64, CloudError> {
    let mut written = 0u64;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| CloudError::Transport(error.to_string()))?
    {
        tokio::io::AsyncWriteExt::write_all(&mut *file, &chunk)
            .await
            .map_err(|error| local_file_error(target, &error))?;
        written += chunk.len() as u64;
    }
    tokio::io::AsyncWriteExt::flush(&mut *file)
        .await
        .map_err(|error| local_file_error(target, &error))?;
    Ok(written)
}

fn local_file_error(target: &std::path::Path, error: &std::io::Error) -> CloudError {
    CloudError::LocalFile(if error.kind() == std::io::ErrorKind::AlreadyExists {
        format!(
            "{} already exists, so nothing was overwritten. Move it, or download into another folder.",
            target.display()
        )
    } else {
        format!("could not write {}: {error}", target.display())
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reply {
    pub status: u16,
    pub body: String,
    pub etag: Option<String>,
}

impl Reply {
    pub(crate) fn decode<T: DeserializeOwned>(self) -> Result<T, CloudError> {
        if !self.is_success() {
            return Err(CloudError::Api {
                status: self.status,
                message: api_error_message(&self.body),
            });
        }
        serde_json::from_str(&self.body).map_err(|error| CloudError::Decode(error.to_string()))
    }
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

    #[tokio::test]
    async fn bounded_history_reads_refuse_declared_and_streamed_oversize_bodies() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        for chunked in [false, true] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut request = Vec::new();
                while !request.ends_with(b"\r\n\r\n") {
                    let mut chunk = [0; 1024];
                    let read = socket.read(&mut chunk).await.unwrap();
                    assert!(read > 0);
                    request.extend_from_slice(&chunk[..read]);
                    assert!(request.len() <= 8192);
                }
                assert!(String::from_utf8_lossy(&request).contains("Bearer fixture"));
                let response = if chunked {
                    "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n10\r\n0123456789abcdef\r\n0\r\n\r\n"
                } else {
                    "HTTP/1.1 200 OK\r\nContent-Length: 16\r\nConnection: close\r\n\r\n0123456789abcdef"
                };
                socket.write_all(response.as_bytes()).await.unwrap();
            });
            let client = CloudClient {
                base: format!("http://{address}"),
                jwt: "fixture".into(),
                auth_base: format!("http://{address}"),
                owner: "fixture".into(),
                workspace: None,
                source_surface: None,
                http: reqwest::Client::new(),
            };
            let result = client
                .get_bounded::<serde_json::Value>("/history", &[], 8)
                .await;
            assert!(
                matches!(result, Err(CloudError::Decode(message)) if message.contains("page budget"))
            );
            server.await.unwrap();
        }
    }

    #[test]
    fn upload_credentials_stay_on_the_configured_account_origin() {
        let client = CloudClient {
            base: "https://cloud.example".to_string(),
            jwt: "fixture-account-token".to_string(),
            auth_base: "https://cloud.example".to_string(),
            owner: "fixture-owner".to_string(),
            workspace: Some(
                agiworkforce_protocol::account_cloud::CloudConversationWorkspace::Personal,
            ),
            source_surface: None,
            http: reqwest::Client::new(),
        };
        let headers = HashMap::from([("Content-Type".to_string(), "text/plain".to_string())]);
        let mut relay_headers = headers.clone();
        relay_headers.insert("authorization".to_string(), "Bearer stale".to_string());
        let account = client
            .upload_request(
                "https://cloud.example/api/upload?token=fixture",
                &relay_headers,
            )
            .expect("the account relay is allowed")
            .build()
            .expect("request builds");
        assert_eq!(
            account.headers()["authorization"],
            "Bearer fixture-account-token"
        );
        assert_eq!(account.headers()["content-type"], "text/plain");
        let contract = crate::cloud::conversation_contract::contract();
        assert_eq!(
            account.headers()[&contract.organization_header],
            contract.personal_workspace
        );
        for destination in [
            "https://storage.example/object?signature=fixture",
            "https://cloud.example:444/upload",
            "https://cloud.example.attacker.example/upload",
        ] {
            let storage = client
                .upload_request(destination, &headers)
                .expect("an HTTPS storage destination is allowed")
                .build()
                .expect("request builds");
            assert!(!storage.headers().contains_key("authorization"));
            assert!(!storage
                .headers()
                .contains_key(&contract.organization_header));
        }
        for destination in [
            "http://storage.example/object",
            "file:///private/upload",
            "https://user:password@cloud.example/upload",
        ] {
            assert!(client.upload_request(destination, &headers).is_err());
        }
    }

    #[test]
    fn an_upload_that_omits_a_signed_header_is_refused_before_it_is_sent() {
        let client = CloudClient {
            base: "https://cloud.example".to_string(),
            jwt: "fixture-account-token".to_string(),
            auth_base: "https://cloud.example".to_string(),
            owner: "fixture-owner".to_string(),
            workspace: None,
            source_surface: None,
            http: reqwest::Client::new(),
        };
        let destination = "https://storage.example/object?X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost%3Bx-amz-server-side-encryption&X-Amz-Signature=fixture";
        let mut headers = HashMap::from([("Content-Type".to_string(), "text/plain".to_string())]);
        let refused = client
            .upload_request(destination, &headers)
            .expect_err("storage would reject a PUT without the signed encryption header");
        assert!(
            refused
                .to_string()
                .contains("does not send x-amz-server-side-encryption"),
            "{refused}"
        );
        assert!(!refused.to_string().contains("content-length"));
        assert!(!refused.to_string().contains("host"));

        headers.insert(
            "X-Amz-Server-Side-Encryption".to_string(),
            "AES256".to_string(),
        );
        let request = client
            .upload_request(destination, &headers)
            .expect("every signed header is sent")
            .build()
            .expect("request builds");
        assert_eq!(request.headers()["x-amz-server-side-encryption"], "AES256");
        assert_eq!(request.headers()["content-type"], "text/plain");
    }

    #[test]
    fn scoped_clients_keep_their_workspace_until_an_explicit_override() {
        use agiworkforce_protocol::account_cloud::CloudConversationWorkspace;
        let client = CloudClient {
            base: "https://cloud.example".into(),
            jwt: "fixture-token".into(),
            auth_base: "https://cloud.example".into(),
            owner: "fixture-owner".into(),
            workspace: None,
            source_surface: None,
            http: reqwest::Client::new(),
        };
        let desktop = client.with_source_surface("desktop");
        for (client, expected) in [(&client, "cli"), (&desktop, "desktop")] {
            let request = client
                .request(reqwest::Method::POST, "/fixture")
                .build()
                .unwrap();
            let values = request
                .headers()
                .get_all(crate::cloud::handshake::SURFACE_HEADER)
                .iter()
                .collect::<Vec<_>>();
            assert_eq!(values.len(), 1);
            assert_eq!(values[0], expected);
            let request = client
                .upload_request("https://cloud.example/fixture", &HashMap::new())
                .unwrap()
                .build()
                .unwrap();
            let values = request
                .headers()
                .get_all(crate::cloud::handshake::SURFACE_HEADER)
                .iter()
                .collect::<Vec<_>>();
            assert_eq!(values.len(), 1);
            assert_eq!(values[0], expected);
        }
        let organization = CloudConversationWorkspace::Organization {
            id: uuid::Uuid::new_v4().to_string(),
        };
        let scoped = client.with_workspace(Some(&organization)).unwrap();
        assert_eq!(
            scoped.with_workspace(None).unwrap().workspace,
            Some(organization)
        );
        assert_eq!(
            scoped
                .with_workspace(Some(&CloudConversationWorkspace::Personal))
                .unwrap()
                .workspace,
            Some(CloudConversationWorkspace::Personal)
        );
        assert!(scoped
            .with_workspace(Some(&CloudConversationWorkspace::Organization {
                id: "invalid".into()
            }))
            .is_err());
        assert!(client.workspace.is_none());
    }

    #[test]
    fn upload_relay_accepts_only_the_configured_development_origin_over_http() {
        let client = CloudClient {
            base: "http://localhost:3000".to_string(),
            jwt: "fixture-account-token".to_string(),
            auth_base: "http://localhost:3000".to_string(),
            owner: "fixture-owner".to_string(),
            workspace: None,
            source_surface: None,
            http: reqwest::Client::new(),
        };
        let request = client
            .upload_request("http://localhost:3000/api/upload", &HashMap::new())
            .expect("the configured development relay is allowed")
            .build()
            .expect("request builds");
        assert!(request.headers().contains_key("authorization"));
        assert!(client
            .upload_request("http://localhost:3001/upload", &HashMap::new())
            .is_err());
    }

    #[test]
    fn a_local_session_never_reaches_the_account() {
        let error = CloudClient::connect(PrivacyMode::Local)
            .err()
            .expect("a local session must be refused");
        assert!(matches!(error, CloudError::NotManaged(PrivacyMode::Local)));
        assert!(error.to_string().contains("Switch to Cloud mode"));
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
    fn account_commands_read_the_configured_mode_and_refuse_outside_cloud() {
        for (configured, mode) in [("local", PrivacyMode::Local), ("byok", PrivacyMode::Byok)] {
            let mut config = crate::config::CliConfig::default();
            config.ui.privacy_mode = Some(configured.to_string());
            let error = CloudClient::connect(config.account_privacy_mode())
                .err()
                .expect("keys, data export and invites must be refused before any request");
            assert!(matches!(error, CloudError::NotManaged(seen) if seen == mode));
        }
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
            "Your key: nothing is sent to your AGI cloud account in this mode. Switch to Cloud \
             mode with /model to use this."
        );
        assert!(!byok.to_lowercase().contains("byok"));

        let local = CloudError::NotManaged(PrivacyMode::Local).to_string();
        assert!(local.starts_with("Local:"));
    }

    #[test]
    fn the_post_turn_notice_says_what_did_not_happen_and_how_to_change_it() {
        let local = CloudError::NotManaged(PrivacyMode::Local).turn_notice();
        assert_eq!(
            local,
            "Local: this chat stays on this device and is not saved to your account history. \
             Choose Cloud mode in /model to sync it."
        );
        let byok = CloudError::NotManaged(PrivacyMode::Byok).turn_notice();
        assert!(byok.starts_with("Your key:"), "{byok}");
        assert!(!byok.to_lowercase().contains("byok"), "{byok}");
        assert_eq!(
            CloudError::SignedOut.turn_notice(),
            CloudError::SignedOut.to_string()
        );
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
    fn an_upgrade_refusal_keeps_its_exit_class_and_reads_once() {
        let refusal = crate::cloud::handshake::upgrade_required(
            crate::cloud::handshake::CLIENT_UPDATE_REQUIRED_STATUS,
            Some("2026-10-01".to_string()),
            r#"{"error":{"message":"Contract 2026-09-17 was retired."}}"#,
        )
        .expect("a 426 answer is an upgrade refusal");
        let shown = refusal.to_string();

        let error = CloudError::UpgradeRequired(Box::new(refusal)).into_anyhow();

        assert_eq!(
            crate::exit_code_for(&error),
            crate::errors::ExitClass::ProtocolTooOld.code()
        );
        assert_eq!(format!("{error:#}"), shown);

        let transport = CloudError::Transport("refused".to_string());
        let shown = transport.to_string();
        let error = transport.into_anyhow();
        assert_eq!(format!("{error:#}"), shown);
        assert_eq!(
            crate::exit_code_for(&error),
            crate::errors::ExitClass::Failure.code()
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

    #[tokio::test]
    async fn account_skill_sync_preserves_companion_bytes_instead_of_preview_envelopes() {
        use std::collections::HashMap;

        use axum::extract::{Path, Query};
        use axum::http::{header, StatusCode};
        use axum::response::IntoResponse;
        use axum::routing::get;
        use axum::{Json, Router};
        use serde_json::json;

        const ORIGINAL_SKILL: &str = "---\nname: fixture-sync\ndescription: Read the bundled references.\nversion: 1.2.3\nallow_implicit: false\nrequires:\n  tools: [fixture-read]\n  env: [FIXTURE_SKILL_TOKEN]\n  mcp: [notion]\n---\n\nRead the original companion resources.\n";

        async fn companion(
            Path(path): Path<String>,
            Query(query): Query<HashMap<String, String>>,
        ) -> axum::response::Response {
            let (bytes, binary) = match path.as_str() {
                "SKILL.md" => (ORIGINAL_SKILL.as_bytes().to_vec(), false),
                "references/a guide.md" => (b"first\nsecond\n".to_vec(), false),
                "assets/sample.bin" => (vec![0, 255, 1, 13, 10], true),
                _ => return StatusCode::NOT_FOUND.into_response(),
            };
            if query.get("download").map(String::as_str) == Some("1") {
                return ([(header::CONTENT_TYPE, "application/octet-stream")], bytes)
                    .into_response();
            }
            if binary {
                return StatusCode::UNSUPPORTED_MEDIA_TYPE.into_response();
            }
            Json(json!({
                "file": {
                    "path": path,
                    "size": bytes.len(),
                    "content": String::from_utf8(bytes).unwrap()
                }
            }))
            .into_response()
        }

        let router = Router::new()
            .route(
                "/api/skills",
                get(|| async {
                    Json(json!({
                        "skills": [{
                            "name": "fixture-sync",
                            "description": "Read the bundled references.",
                            "downloadable": true,
                            "lifecycle": "included"
                        }]
                    }))
                }),
            )
            .route(
                "/api/skills/fixture-sync",
                get(|| async { Json(json!({ "body": "Read the companion resources." })) }),
            )
            .route(
                "/api/skills/fixture-sync/files",
                get(|| async {
                    Json(json!({
                        "files": [
                            { "path": "SKILL.md", "size": ORIGINAL_SKILL.len() },
                            { "path": "references/a guide.md", "size": 13 },
                            { "path": "assets/sample.bin", "size": 5 }
                        ]
                    }))
                }),
            )
            .route("/api/skills/fixture-sync/files/{*path}", get(companion));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let client = CloudClient {
            base: format!("http://{}", listener.local_addr().unwrap()),
            jwt: "fixture-token".to_string(),
            auth_base: format!("http://{}/api", listener.local_addr().unwrap()),
            owner: "fixture-owner".to_string(),
            workspace: None,
            source_surface: None,
            http: reqwest::Client::new(),
        };
        let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        let result = crate::cloud::skills::fetch_account_skills(&client).await;
        server.abort();
        let synced = result.expect("companion files must use the raw download contract");
        let dir = tempfile::tempdir().unwrap();
        crate::cloud::skills::write_account_skills(dir.path(), &synced).unwrap();

        let entry = dir.path().join("fixture-sync/SKILL.md");
        assert_eq!(std::fs::read_to_string(&entry).unwrap(), ORIGINAL_SKILL);
        let loaded = crate::skills::load_skill(&entry).expect("the original entry loads");
        assert_eq!(loaded.version.as_deref(), Some("1.2.3"));
        assert!(!loaded.allow_implicit);
        assert_eq!(loaded.required_tools, vec!["fixture-read"]);
        assert_eq!(loaded.required_env_vars, vec!["FIXTURE_SKILL_TOKEN"]);
        assert_eq!(loaded.required_connections, vec!["notion"]);

        assert_eq!(
            (
                std::fs::read(dir.path().join("fixture-sync/references/a guide.md")).unwrap(),
                std::fs::read(dir.path().join("fixture-sync/assets/sample.bin")).unwrap(),
            ),
            (b"first\nsecond\n".to_vec(), vec![0, 255, 1, 13, 10])
        );
    }

    #[tokio::test]
    async fn authored_skill_sync_keeps_the_body_path_without_an_original_entry_file() {
        use axum::routing::get;
        use axum::{Json, Router};
        use serde_json::json;

        let router = Router::new()
            .route(
                "/api/skills",
                get(|| async {
                    Json(json!({
                        "skills": [{
                            "name": "fixture-authored",
                            "description": "Keep the authored instructions.",
                            "lifecycle": "included",
                            "downloadable": false
                        }]
                    }))
                }),
            )
            .route(
                "/api/skills/fixture-authored",
                get(|| async { Json(json!({"body": "Authored instructions.\n"})) }),
            )
            .route(
                "/api/skills/fixture-authored/files",
                get(|| async { Json(json!({"files": [{"path": "SKILL.md", "size": 23}]})) }),
            );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let client = CloudClient {
            base: format!("http://{}", listener.local_addr().unwrap()),
            jwt: "fixture-token".to_string(),
            auth_base: format!("http://{}/api", listener.local_addr().unwrap()),
            owner: "fixture-owner".to_string(),
            workspace: None,
            source_surface: None,
            http: reqwest::Client::new(),
        };
        let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        let result = crate::cloud::skills::fetch_account_skills(&client).await;
        server.abort();
        let synced = result.expect("authored skills need no original entry download");
        assert_eq!(
            (synced[0].name.as_str(), synced[0].document.as_str(), &synced[0].files),
            (
                "fixture-authored",
                "---\nname: fixture-authored\ndescription: Keep the authored instructions.\n---\n\nAuthored instructions.\n",
                &Vec::<(String, Vec<u8>)>::new()
            )
        );
    }
}
