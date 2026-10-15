use once_cell::sync::Lazy;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::{Client, Method, Response, StatusCode};
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware};
use reqwest_retry::{policies::ExponentialBackoff, RetryTransientMiddleware};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use crate::sys::error::{Error, Result};
use crate::sys::security::egress_policy::{
    public_destination_redirect_policy, EgressDenial, PublicHttpClient,
};

/// Render an error together with everything it was caused by.
///
/// `reqwest` reports a refused redirect as the bare string "error following
/// redirect" and hangs the reason off `source()`, so without this the egress
/// policy's own explanation never reaches the caller, or the log.
fn describe_error(error: &dyn std::error::Error) -> String {
    let mut description = error.to_string();
    let mut cause = error.source();
    while let Some(current) = cause {
        let text = current.to_string();
        if !description.contains(&text) {
            description.push_str(": ");
            description.push_str(&text);
        }
        cause = current.source();
    }
    description
}

/// Default HTTP client with retry middleware, lazily initialized.
/// This is shared across all `ApiClient::default()` instances.
static DEFAULT_CLIENT: Lazy<Arc<ClientWithMiddleware>> = Lazy::new(|| {
    let retry_policy = ExponentialBackoff::builder()
        .retry_bounds(Duration::from_millis(500), Duration::from_millis(10000))
        .build_with_max_retries(3);

    // Use default reqwest client configuration which should never fail
    let reqwest_client = Client::builder()
        .timeout(Duration::from_secs(30))
        .redirect(public_destination_redirect_policy())
        .build()
        .expect("Failed to create default HTTP client with standard configuration");

    let client = ClientBuilder::new(reqwest_client)
        .with(RetryTransientMiddleware::new_with_policy(retry_policy))
        .build();

    Arc::new(client)
});

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Head,
    Options,
}

impl HttpMethod {
    pub fn to_reqwest_method(&self) -> Method {
        match self {
            HttpMethod::Get => Method::GET,
            HttpMethod::Post => Method::POST,
            HttpMethod::Put => Method::PUT,
            HttpMethod::Patch => Method::PATCH,
            HttpMethod::Delete => Method::DELETE,
            HttpMethod::Head => Method::HEAD,
            HttpMethod::Options => Method::OPTIONS,
        }
    }

    pub fn to_string(&self) -> &str {
        match self {
            HttpMethod::Get => "GET",
            HttpMethod::Post => "POST",
            HttpMethod::Put => "PUT",
            HttpMethod::Patch => "PATCH",
            HttpMethod::Delete => "DELETE",
            HttpMethod::Head => "HEAD",
            HttpMethod::Options => "OPTIONS",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum AuthType {
    None,
    Bearer { token: String },
    ApiKey { key: String, header: String },
    Basic { username: String, password: String },
    OAuth2 { token: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiRequest {
    pub method: HttpMethod,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub query_params: HashMap<String, String>,
    pub body: Option<String>,
    pub auth: AuthType,
    pub timeout_ms: Option<u64>,
}

impl Default for ApiRequest {
    fn default() -> Self {
        Self {
            method: HttpMethod::Get,
            url: String::new(),
            headers: HashMap::new(),
            query_params: HashMap::new(),
            body: None,
            auth: AuthType::None,
            timeout_ms: Some(30000),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub duration_ms: u128,
    pub success: bool,
    /// True when the body was longer than the client would read and was cut.
    #[serde(default)]
    pub truncated: bool,
}

#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_retries: u32,
    pub initial_backoff_ms: u64,
    pub max_backoff_ms: u64,
    pub exponential_base: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_backoff_ms: 500,
            max_backoff_ms: 10000,
            exponential_base: 2.0,
        }
    }
}

/// Largest request body sent to a destination the app did not choose.
pub const MAX_PUBLIC_REQUEST_BODY_BYTES: usize = 10 * 1024 * 1024;
/// Largest response body read into memory from such a destination. A longer
/// body is cut here and the result is marked truncated.
pub const MAX_PUBLIC_RESPONSE_BODY_BYTES: usize = 10 * 1024 * 1024;
/// Largest file uploaded to or downloaded from such a destination. A larger
/// download is refused whole, because a cut file is not the file.
pub const MAX_PUBLIC_TRANSFER_BYTES: usize = 100 * 1024 * 1024;

const MAX_PUBLIC_REDIRECT_HOPS: usize = 10;
const MAX_IDEMPOTENT_ATTEMPTS: u32 = 3;
const IDEMPOTENT_RETRY_BASE_DELAY: Duration = Duration::from_millis(500);
const PUBLIC_TRANSFER_TIMEOUT: Duration = Duration::from_secs(300);

/// SECURITY: the only request headers that survive a redirect to another
/// origin. Everything else is dropped there, so a credential cannot follow a
/// `Location` header whatever the header carrying it is called.
fn survives_origin_change(name: &HeaderName) -> bool {
    [
        reqwest::header::ACCEPT,
        reqwest::header::ACCEPT_LANGUAGE,
        reqwest::header::CONTENT_LANGUAGE,
        reqwest::header::CONTENT_TYPE,
        reqwest::header::USER_AGENT,
    ]
    .contains(name)
}

/// Opens one hop of a public request. Production judges the destination,
/// pins the addresses it judged and dials only those.
trait PublicHop: Sync {
    fn open(
        &self,
        method: Method,
        url: &url::Url,
    ) -> std::result::Result<reqwest::RequestBuilder, EgressDenial>;
}

impl PublicHop for PublicHttpClient {
    fn open(
        &self,
        method: Method,
        url: &url::Url,
    ) -> std::result::Result<reqwest::RequestBuilder, EgressDenial> {
        self.request(method, url.as_str())
    }
}

enum PublicBody {
    Empty,
    Text(String),
    File {
        field_name: String,
        file_name: String,
        content: Vec<u8>,
        fields: Vec<(String, String)>,
    },
}

impl PublicBody {
    fn is_empty(&self) -> bool {
        matches!(self, PublicBody::Empty)
    }

    fn attach(&self, builder: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        match self {
            PublicBody::Empty => builder,
            PublicBody::Text(text) => builder.body(text.clone()),
            PublicBody::File {
                field_name,
                file_name,
                content,
                fields,
            } => {
                let part =
                    reqwest::multipart::Part::bytes(content.clone()).file_name(file_name.clone());
                let mut form = reqwest::multipart::Form::new().part(field_name.clone(), part);
                for (name, value) in fields {
                    form = form.text(name.clone(), value.clone());
                }
                builder.multipart(form)
            }
        }
    }
}

struct PublicRequest {
    method: Method,
    url: url::Url,
    headers: HeaderMap,
    body: PublicBody,
    timeout: Duration,
}

struct CappedBody {
    bytes: Vec<u8>,
    truncated: bool,
}

/// What a public download returned. `bytes` holds the file on success and the
/// capped error body otherwise.
#[derive(Debug)]
pub struct PublicDownload {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub bytes: Vec<u8>,
    pub success: bool,
}

fn credential_header(value: &str, what: &str) -> Result<HeaderValue> {
    let mut header = HeaderValue::from_str(value)
        .map_err(|_| Error::Other(format!("The {what} is not a valid header value")))?;
    header.set_sensitive(true);
    Ok(header)
}

fn apply_auth(headers: &mut HeaderMap, auth: &AuthType) -> Result<()> {
    match auth {
        AuthType::None => {}
        AuthType::Bearer { token } | AuthType::OAuth2 { token } => {
            headers.insert(
                reqwest::header::AUTHORIZATION,
                credential_header(&format!("Bearer {token}"), "bearer token")?,
            );
        }
        AuthType::Basic { username, password } => {
            use base64::Engine;
            let encoded =
                base64::engine::general_purpose::STANDARD.encode(format!("{username}:{password}"));
            headers.insert(
                reqwest::header::AUTHORIZATION,
                credential_header(&format!("Basic {encoded}"), "basic credential")?,
            );
        }
        AuthType::ApiKey { key, header } => {
            headers.insert(caller_header(header)?, credential_header(key, "API key")?);
        }
    }
    Ok(())
}

/// SECURITY: headers the HTTP client itself must own. `Host` would aim the
/// request at another site on the judged address while the guard, the
/// approval and the hooks all read the URL host; the framing and hop-by-hop
/// headers would let a caller desynchronise the request. A caller that
/// supplies one is refused by name, for plain headers and the API key header
/// alike.
fn caller_header(name: &str) -> Result<HeaderName> {
    let header_name = HeaderName::from_bytes(name.trim().as_bytes())
        .map_err(|_| Error::Other(format!("Invalid request header name: {name}")))?;
    let lower = header_name.as_str();
    let reserved = matches!(
        lower,
        "host"
            | "content-length"
            | "transfer-encoding"
            | "connection"
            | "upgrade"
            | "te"
            | "trailer"
            | "keep-alive"
            | "expect"
    ) || lower.starts_with("proxy-");
    if reserved {
        return Err(Error::Other(format!(
            "Request header '{name}' is set by the HTTP client and cannot be supplied"
        )));
    }
    Ok(header_name)
}

fn public_headers(
    supplied: &HashMap<String, String>,
    auth: &AuthType,
    json_body: bool,
) -> Result<HeaderMap> {
    let mut headers = HeaderMap::new();
    for (name, value) in supplied {
        let header_name = caller_header(name)?;
        let header_value = HeaderValue::from_str(value)
            .map_err(|_| Error::Other(format!("Invalid value for request header {name}")))?;
        headers.insert(header_name, header_value);
    }
    apply_auth(&mut headers, auth)?;
    if json_body && !headers.contains_key(reqwest::header::CONTENT_TYPE) {
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
    }
    Ok(headers)
}

fn url_with_query(url: &str, query_params: &HashMap<String, String>) -> String {
    if query_params.is_empty() {
        return url.to_string();
    }
    let query = query_params
        .iter()
        .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    if url.contains('?') {
        format!("{url}&{query}")
    } else {
        format!("{url}?{query}")
    }
}

fn parse_public_url(url: &str) -> Result<url::Url> {
    url::Url::parse(url)
        .map_err(|_| Error::Other("API request destination blocked: invalid URL".to_string()))
}

/// The origin and path of a URL, for logs and progress text. The query is
/// left out because API keys are often passed there.
pub fn loggable_url(raw: &str) -> String {
    match url::Url::parse(raw) {
        Ok(url) => format!("{}{}", url.origin().ascii_serialization(), url.path()),
        Err(_) => "an unreadable URL".to_string(),
    }
}

fn redirect_target(response: &Response, from: &url::Url) -> Option<url::Url> {
    if !matches!(
        response.status(),
        StatusCode::MOVED_PERMANENTLY
            | StatusCode::FOUND
            | StatusCode::SEE_OTHER
            | StatusCode::TEMPORARY_REDIRECT
            | StatusCode::PERMANENT_REDIRECT
    ) {
        return None;
    }
    let location = response
        .headers()
        .get(reqwest::header::LOCATION)?
        .to_str()
        .ok()?;
    from.join(location).ok()
}

/// One hop, with no redirect followed. Only GET and HEAD are ever sent twice:
/// replaying any other method could repeat an action the user approved once.
async fn send_hop(hop: &dyn PublicHop, request: &PublicRequest) -> Result<Response> {
    let replayable = request.method == Method::GET || request.method == Method::HEAD;
    let mut attempt = 1;
    loop {
        let builder = hop
            .open(request.method.clone(), &request.url)
            .map_err(|denial| Error::Other(format!("API request destination blocked: {denial}")))?
            .headers(request.headers.clone())
            .timeout(request.timeout);
        let outcome = request.body.attach(builder).send().await;

        let transient = match &outcome {
            Ok(response) => matches!(response.status().as_u16(), 502..=504),
            Err(error) => error.is_connect(),
        };
        if !(replayable && transient && attempt < MAX_IDEMPOTENT_ATTEMPTS) {
            return outcome.map_err(|e| {
                Error::Other(format!(
                    "Failed to send request: {}",
                    describe_error(&e.without_url())
                ))
            });
        }
        drop(outcome);
        tokio::time::sleep(IDEMPOTENT_RETRY_BASE_DELAY * 2u32.pow(attempt - 1)).await;
        attempt += 1;
    }
}

/// Send a request to a destination the app did not choose, following
/// redirects by hand so every hop is judged and pinned again and so this
/// code, not the HTTP library, decides what each hop carries.
async fn send_public(hop: &dyn PublicHop, mut request: PublicRequest) -> Result<Response> {
    for _ in 0..=MAX_PUBLIC_REDIRECT_HOPS {
        let response = send_hop(hop, &request).await?;
        let Some(next) = redirect_target(&response, &request.url) else {
            return Ok(response);
        };

        let crosses_origin = next.origin() != request.url.origin();
        let replays_body = matches!(
            response.status(),
            StatusCode::TEMPORARY_REDIRECT | StatusCode::PERMANENT_REDIRECT
        );
        if replays_body && crosses_origin && !request.body.is_empty() {
            // SECURITY: a request body may itself carry a secret, so it is
            // never replayed to another origin. The caller sees the redirect.
            return Ok(response);
        }
        if !replays_body && request.method != Method::GET && request.method != Method::HEAD {
            request.method = Method::GET;
            request.body = PublicBody::Empty;
            for name in [
                reqwest::header::CONTENT_TYPE,
                reqwest::header::CONTENT_LENGTH,
                reqwest::header::CONTENT_ENCODING,
                reqwest::header::TRANSFER_ENCODING,
            ] {
                request.headers.remove(name);
            }
        }
        if crosses_origin {
            request.headers = request
                .headers
                .iter()
                .filter(|(name, _)| survives_origin_change(name))
                .map(|(name, value)| (name.clone(), value.clone()))
                .collect();
        }
        request.url = next;
    }
    Err(Error::Other(format!(
        "Failed to send request: more than {MAX_PUBLIC_REDIRECT_HOPS} redirects"
    )))
}

async fn read_capped(response: &mut Response, cap: usize) -> Result<CappedBody> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| {
        Error::Other(format!(
            "Failed to read response body: {}",
            describe_error(&e.without_url())
        ))
    })? {
        let room = cap - bytes.len();
        if chunk.len() > room {
            bytes.extend_from_slice(&chunk[..room]);
            return Ok(CappedBody {
                bytes,
                truncated: true,
            });
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(CappedBody {
        bytes,
        truncated: false,
    })
}

fn response_headers(response: &Response) -> HashMap<String, String> {
    let mut headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(value_str) = value.to_str() {
            headers.insert(key.to_string(), value_str.to_string());
        }
    }
    headers
}

async fn finish_public(
    hop: &dyn PublicHop,
    request: PublicRequest,
    start: std::time::Instant,
) -> Result<ApiResponse> {
    let mut response = send_public(hop, request).await?;
    let status = response.status();
    let headers = response_headers(&response);
    let body = read_capped(&mut response, MAX_PUBLIC_RESPONSE_BODY_BYTES).await?;
    Ok(ApiResponse {
        status: status.as_u16(),
        headers,
        body: String::from_utf8_lossy(&body.bytes).into_owned(),
        duration_ms: start.elapsed().as_millis(),
        success: status.is_success(),
        truncated: body.truncated,
    })
}

async fn execute_public(hop: &dyn PublicHop, request: ApiRequest) -> Result<ApiResponse> {
    let start = std::time::Instant::now();
    if request
        .body
        .as_ref()
        .is_some_and(|body| body.len() > MAX_PUBLIC_REQUEST_BODY_BYTES)
    {
        return Err(Error::Other(format!(
            "Request body exceeds {MAX_PUBLIC_REQUEST_BODY_BYTES} bytes and was not sent"
        )));
    }

    let url = parse_public_url(&url_with_query(&request.url, &request.query_params))?;
    let headers = public_headers(&request.headers, &request.auth, request.body.is_some())?;
    let method = request.method.to_reqwest_method();
    tracing::info!(
        "Executing {} request to {}",
        method,
        loggable_url(url.as_str())
    );

    let response = finish_public(
        hop,
        PublicRequest {
            method,
            url,
            headers,
            body: request.body.map_or(PublicBody::Empty, PublicBody::Text),
            timeout: Duration::from_millis(request.timeout_ms.unwrap_or(30_000)),
        },
        start,
    )
    .await?;

    tracing::info!(
        "Request completed: status={}, duration={}ms, truncated={}",
        response.status,
        response.duration_ms,
        response.truncated
    );
    Ok(response)
}

/// SECURITY: `path` is the path a grant check returned. It is opened once,
/// without following a link at its last component, and everything that is
/// uploaded is read from that handle, so a link swapped in after the check
/// cannot redirect the upload to another file.
fn read_upload_file(path: &Path) -> Result<Vec<u8>> {
    use std::io::Read;

    let unreadable = |e: std::io::Error| Error::Other(format!("Failed to read file: {}", e));
    let too_large = || {
        Error::Other(format!(
            "File exceeds {MAX_PUBLIC_TRANSFER_BYTES} bytes and was not uploaded"
        ))
    };

    let file = crate::sys::utils::open_file_without_following(path).map_err(unreadable)?;
    let metadata = file.metadata().map_err(unreadable)?;
    if !metadata.is_file() {
        return Err(Error::Other(
            "Only a regular file can be uploaded".to_string(),
        ));
    }
    if metadata.len() > MAX_PUBLIC_TRANSFER_BYTES as u64 {
        return Err(too_large());
    }
    let mut content = Vec::new();
    file.take(MAX_PUBLIC_TRANSFER_BYTES as u64 + 1)
        .read_to_end(&mut content)
        .map_err(unreadable)?;
    if content.len() > MAX_PUBLIC_TRANSFER_BYTES {
        return Err(too_large());
    }
    Ok(content)
}

async fn upload_public(
    hop: &dyn PublicHop,
    url: &str,
    file_path: &Path,
    field_name: &str,
    additional_fields: Option<HashMap<String, String>>,
    auth: &AuthType,
) -> Result<ApiResponse> {
    let start = std::time::Instant::now();
    let url = parse_public_url(url)?;
    let headers = public_headers(&HashMap::new(), auth, false)?;

    let file_name = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();
    let source = file_path.to_path_buf();
    let content = tokio::task::spawn_blocking(move || read_upload_file(&source))
        .await
        .map_err(|e| Error::Other(format!("Failed to read file: {}", e)))??;

    tracing::info!("Uploading a file to {}", loggable_url(url.as_str()));
    finish_public(
        hop,
        PublicRequest {
            method: Method::POST,
            url,
            headers,
            body: PublicBody::File {
                field_name: field_name.to_string(),
                file_name,
                content,
                fields: additional_fields.unwrap_or_default().into_iter().collect(),
            },
            timeout: PUBLIC_TRANSFER_TIMEOUT,
        },
        start,
    )
    .await
}

async fn download_public(
    hop: &dyn PublicHop,
    url: &str,
    auth: &AuthType,
) -> Result<PublicDownload> {
    let url = parse_public_url(url)?;
    tracing::info!("Downloading from {}", loggable_url(url.as_str()));

    let mut response = send_public(
        hop,
        PublicRequest {
            method: Method::GET,
            url,
            headers: public_headers(&HashMap::new(), auth, false)?,
            body: PublicBody::Empty,
            timeout: PUBLIC_TRANSFER_TIMEOUT,
        },
    )
    .await?;

    let status = response.status();
    let headers = response_headers(&response);
    if !status.is_success() {
        let body = read_capped(&mut response, MAX_PUBLIC_RESPONSE_BODY_BYTES).await?;
        return Ok(PublicDownload {
            status: status.as_u16(),
            headers,
            bytes: body.bytes,
            success: false,
        });
    }

    let too_large = || {
        Error::Other(format!(
            "Download exceeds {MAX_PUBLIC_TRANSFER_BYTES} bytes and nothing was saved"
        ))
    };
    if response
        .content_length()
        .is_some_and(|length| length > MAX_PUBLIC_TRANSFER_BYTES as u64)
    {
        return Err(too_large());
    }
    let body = read_capped(&mut response, MAX_PUBLIC_TRANSFER_BYTES).await?;
    if body.truncated {
        return Err(too_large());
    }
    Ok(PublicDownload {
        status: status.as_u16(),
        headers,
        bytes: body.bytes,
        success: true,
    })
}

enum Transport {
    /// Destinations the app builds itself from an already-validated base.
    App(Arc<ClientWithMiddleware>),
    /// Destinations chosen by the renderer or an agent tool.
    Public(PublicHttpClient),
}

pub struct ApiClient {
    transport: Transport,
    default_timeout: Duration,
}

impl ApiClient {
    pub fn new() -> Result<Self> {
        Self::with_retry_config(RetryConfig::default())
    }

    /// Build the API client used for arbitrary public URLs selected by the
    /// renderer or an agent tool. Each hop is resolved once, judged, and dialed
    /// at the address that was judged; redirects are followed by this module.
    pub fn public() -> Result<Self> {
        let transport = PublicHttpClient::without_redirects(
            Client::builder().retry(reqwest::retry::never()).no_proxy(),
        )
        .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            transport: Transport::Public(transport),
            default_timeout: Duration::from_secs(30),
        })
    }

    /// Build a client that never replays a request.
    ///
    /// Use this for non-idempotent operations that do not carry an
    /// idempotency key, such as creating an OAuth device authorization code.
    pub fn single_attempt() -> Result<Self> {
        let reqwest_client = Client::builder()
            .timeout(Duration::from_secs(30))
            .retry(reqwest::retry::never())
            .redirect(public_destination_redirect_policy())
            .build()
            .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            transport: Transport::App(Arc::new(ClientBuilder::new(reqwest_client).build())),
            default_timeout: Duration::from_secs(30),
        })
    }

    /// Build a client that sends a request once and follows no redirect.
    ///
    /// Use this for a request that carries a credential in its body. A
    /// followed 307 or 308 replays that body to wherever the reply points,
    /// and a retry hands a single-use credential to the server twice.
    pub fn single_attempt_without_redirects() -> Result<Self> {
        let reqwest_client = Client::builder()
            .timeout(Duration::from_secs(30))
            .retry(reqwest::retry::never())
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            transport: Transport::App(Arc::new(ClientBuilder::new(reqwest_client).build())),
            default_timeout: Duration::from_secs(30),
        })
    }

    pub fn with_retry_config(config: RetryConfig) -> Result<Self> {
        let retry_policy = ExponentialBackoff::builder()
            .retry_bounds(
                Duration::from_millis(config.initial_backoff_ms),
                Duration::from_millis(config.max_backoff_ms),
            )
            .build_with_max_retries(config.max_retries);

        let reqwest_client = Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(public_destination_redirect_policy())
            .build()
            .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        let client = ClientBuilder::new(reqwest_client)
            .with(RetryTransientMiddleware::new_with_policy(retry_policy))
            .build();

        Ok(Self {
            transport: Transport::App(Arc::new(client)),
            default_timeout: Duration::from_secs(30),
        })
    }

    fn public_transport(&self) -> Result<&PublicHttpClient> {
        match &self.transport {
            Transport::Public(transport) => Ok(transport),
            Transport::App(_) => Err(Error::Other(
                "File transfers require the public API client".to_string(),
            )),
        }
    }

    pub async fn execute(&self, request: ApiRequest) -> Result<ApiResponse> {
        let client = match &self.transport {
            Transport::Public(transport) => return execute_public(transport, request).await,
            Transport::App(client) => client,
        };
        let start = std::time::Instant::now();

        tracing::info!(
            "Executing {} request to {}",
            request.method.to_reqwest_method(),
            request.url
        );

        // AUDIT-FIX (reqwest-0.13 migration): the middleware RequestBuilder
        // does not expose `.query()` in the feature set we ship, so encode
        // query params directly into the URL before the builder is created.
        let target_url = url_with_query(&request.url, &request.query_params);

        let mut req_builder = client.request(request.method.to_reqwest_method(), &target_url);

        if let Some(timeout_ms) = request.timeout_ms {
            req_builder = req_builder.timeout(Duration::from_millis(timeout_ms));
        } else {
            req_builder = req_builder.timeout(self.default_timeout);
        }

        req_builder = self.add_auth(req_builder, &request.auth);

        for (key, value) in &request.headers {
            req_builder = req_builder.header(key, value);
        }

        if let Some(body) = &request.body {
            req_builder = req_builder.body(body.clone());

            if !request.headers.contains_key("Content-Type") {
                req_builder = req_builder.header("Content-Type", "application/json");
            }
        }

        let response = req_builder
            .send()
            .await
            .map_err(|e| Error::Other(format!("Failed to send request: {}", describe_error(&e))))?;

        let duration_ms = start.elapsed().as_millis();

        let status = response.status();
        let headers = response_headers(&response);
        let success = status.is_success();

        let body = response
            .text()
            .await
            .map_err(|e| Error::Other(format!("Failed to read response body: {}", e)))?;

        tracing::info!(
            "Request completed: status={}, duration={}ms, success={}",
            status.as_u16(),
            duration_ms,
            success
        );

        Ok(ApiResponse {
            status: status.as_u16(),
            headers,
            body,
            duration_ms,
            success,
            truncated: false,
        })
    }

    /// Upload the file at `file_path`, which must be a path a grant check
    /// returned: it is opened once without following a link and not reopened.
    pub async fn upload_file(
        &self,
        url: &str,
        file_path: &Path,
        field_name: &str,
        additional_fields: Option<HashMap<String, String>>,
        auth: AuthType,
    ) -> Result<ApiResponse> {
        upload_public(
            self.public_transport()?,
            url,
            file_path,
            field_name,
            additional_fields,
            &auth,
        )
        .await
    }

    /// GET a file from a public destination into memory, refusing one larger
    /// than [`MAX_PUBLIC_TRANSFER_BYTES`].
    pub async fn fetch_public_bytes(&self, url: &str, auth: AuthType) -> Result<PublicDownload> {
        download_public(self.public_transport()?, url, &auth).await
    }

    pub async fn download_file(
        &self,
        url: &str,
        save_path: &str,
        auth: AuthType,
    ) -> Result<ApiResponse> {
        let start = std::time::Instant::now();
        let download = self.fetch_public_bytes(url, auth).await?;
        if !download.success {
            return Ok(ApiResponse {
                status: download.status,
                headers: download.headers,
                body: String::from_utf8_lossy(&download.bytes).into_owned(),
                duration_ms: start.elapsed().as_millis(),
                success: false,
                truncated: false,
            });
        }

        crate::sys::utils::write_file_without_following_async(
            std::path::PathBuf::from(save_path),
            download.bytes,
        )
        .await
        .map_err(|e| Error::Other(format!("Failed to write file: {}", e)))?;

        Ok(ApiResponse {
            status: download.status,
            headers: download.headers,
            body: format!("File downloaded successfully to {}", save_path),
            duration_ms: start.elapsed().as_millis(),
            success: true,
            truncated: false,
        })
    }

    fn add_auth(
        &self,
        builder: reqwest_middleware::RequestBuilder,
        auth: &AuthType,
    ) -> reqwest_middleware::RequestBuilder {
        match auth {
            AuthType::None => builder,
            AuthType::Bearer { token } => builder.bearer_auth(token),
            AuthType::ApiKey { key, header } => builder.header(header, key),
            AuthType::Basic { username, password } => builder.basic_auth(username, Some(password)),
            AuthType::OAuth2 { token } => builder.bearer_auth(token),
        }
    }
}

impl Default for ApiClient {
    fn default() -> Self {
        Self {
            transport: Transport::App(Arc::clone(&DEFAULT_CLIENT)),
            default_timeout: Duration::from_secs(30),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::time::timeout;

    async fn read_http_request(stream: &mut tokio::net::TcpStream) -> Vec<u8> {
        let mut request = Vec::new();
        let mut buffer = [0_u8; 1024];

        loop {
            let bytes_read = stream.read(&mut buffer).await.expect("read request");
            if bytes_read == 0 {
                break;
            }
            request.extend_from_slice(&buffer[..bytes_read]);

            let Some(header_end) = request.windows(4).position(|window| window == b"\r\n\r\n")
            else {
                continue;
            };
            let headers = String::from_utf8_lossy(&request[..header_end]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length")
                        .then(|| value.trim().parse::<usize>().ok())
                        .flatten()
                })
                .unwrap_or(0);
            if request.len() >= header_end + 4 + content_length {
                break;
            }
        }

        request
    }

    /// Bind a loopback HTTP server that answers every connection with whatever
    /// `handler` returns for the requested path, counting connections.
    async fn spawn_http_server<F>(handler: F, connections: Arc<AtomicUsize>) -> std::net::SocketAddr
    where
        F: Fn(&str) -> String + Send + Sync + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind local HTTP server");
        let address = listener.local_addr().expect("read local server address");

        tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                connections.fetch_add(1, Ordering::SeqCst);
                let request = read_http_request(&mut stream).await;
                let text = String::from_utf8_lossy(&request).to_string();
                let path = text.split_whitespace().nth(1).unwrap_or("/").to_string();
                let _ = stream.write_all(handler(&path).as_bytes()).await;
                let _ = stream.flush().await;
            }
        });

        address
    }

    fn ok_response(body: &str) -> String {
        format!(
            "HTTP/1.1 200 OK\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
            body.len()
        )
    }

    fn redirect_response(location: &str) -> String {
        format!(
            "HTTP/1.1 302 Found\r\nLocation: {location}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"
        )
    }

    /// The redirect bypass: judging only the URL a caller supplies is no guard
    /// while the client then follows `Location:` unchecked. A front server that
    /// answers `302 Location: http://127.0.0.1:PORT/latest/meta-data/` must not
    /// produce a single connection to that port.
    #[tokio::test]
    async fn redirect_to_an_internal_destination_is_refused() {
        let metadata_connections = Arc::new(AtomicUsize::new(0));
        let metadata = spawn_http_server(
            |_| ok_response("SECRET_METADATA"),
            Arc::clone(&metadata_connections),
        )
        .await;

        let front_connections = Arc::new(AtomicUsize::new(0));
        let location = format!("http://{metadata}/latest/meta-data/");
        let front = spawn_http_server(
            move |_| redirect_response(&location),
            Arc::clone(&front_connections),
        )
        .await;

        let client = ApiClient::new().expect("create API client for test");
        let error = client
            .execute(ApiRequest {
                method: HttpMethod::Get,
                url: format!("http://{front}/"),
                timeout_ms: Some(3_000),
                ..Default::default()
            })
            .await
            .expect_err("a redirect into loopback must not be followed");

        let message = error.to_string();
        assert!(
            message.contains("egress policy"),
            "refusal should name the policy, got: {message}"
        );

        // Give a hop that did escape time to land before counting.
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(
            front_connections.load(Ordering::SeqCst),
            1,
            "the first hop should have been made exactly once"
        );
        assert_eq!(
            metadata_connections.load(Ordering::SeqCst),
            0,
            "the client followed a redirect into loopback"
        );
    }

    /// A hop that stays inside the origin it came from reaches nothing the first
    /// check did not already allow, so it is still followed, this is what keeps
    /// a development API server on `localhost` (which redirects for trailing
    /// slashes) usable.
    #[tokio::test]
    async fn same_origin_redirects_are_still_followed() {
        let connections = Arc::new(AtomicUsize::new(0));
        let address = spawn_http_server(
            |path| {
                if path == "/redirected" {
                    ok_response("FOLLOWED")
                } else {
                    redirect_response("/redirected")
                }
            },
            Arc::clone(&connections),
        )
        .await;

        let client = ApiClient::new().expect("create API client for test");
        let response = client
            .execute(ApiRequest {
                method: HttpMethod::Get,
                url: format!("http://{address}/"),
                timeout_ms: Some(3_000),
                ..Default::default()
            })
            .await
            .expect("a same-origin redirect must be followed");

        assert_eq!(response.status, 200);
        assert_eq!(response.body, "FOLLOWED");
        assert_eq!(connections.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn test_http_method_conversion() {
        assert_eq!(HttpMethod::Get.to_reqwest_method(), Method::GET);
        assert_eq!(HttpMethod::Post.to_reqwest_method(), Method::POST);
        assert_eq!(HttpMethod::Put.to_reqwest_method(), Method::PUT);
        assert_eq!(HttpMethod::Delete.to_reqwest_method(), Method::DELETE);
    }

    #[test]
    fn test_api_request_default() {
        let request = ApiRequest::default();
        assert!(matches!(request.method, HttpMethod::Get));
        assert_eq!(request.timeout_ms, Some(30000));
    }

    #[tokio::test]
    async fn test_api_client_creation() {
        let client = ApiClient::new().expect("Failed to create ApiClient for test");
        assert_eq!(client.default_timeout, Duration::from_secs(30));
    }

    #[tokio::test]
    async fn public_api_client_refuses_internal_initial_destination() {
        let client = ApiClient::public().expect("create public API client");
        let error = client
            .execute(ApiRequest {
                method: HttpMethod::Get,
                url: "http://127.0.0.1/latest/meta-data/".to_string(),
                ..Default::default()
            })
            .await
            .expect_err("public client must reject loopback before transport");

        assert!(error.to_string().contains("egress policy"));
    }

    #[tokio::test]
    async fn single_attempt_client_does_not_replay_non_idempotent_post() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind local HTTP server");
        let address = listener.local_addr().expect("read local server address");
        let attempts = Arc::new(AtomicUsize::new(0));
        let server_attempts = Arc::clone(&attempts);

        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.expect("accept first request");
            server_attempts.fetch_add(1, Ordering::SeqCst);
            let request = read_http_request(&mut stream).await;
            stream
                .write_all(
                    b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                )
                .await
                .expect("write first response");

            if let Ok(Ok((mut replay, _))) =
                timeout(Duration::from_millis(800), listener.accept()).await
            {
                server_attempts.fetch_add(1, Ordering::SeqCst);
                let _ = read_http_request(&mut replay).await;
                replay
                    .write_all(
                        b"HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    )
                    .await
                    .expect("write replay response");
            }

            request
        });

        let client =
            ApiClient::single_attempt().expect("create single-attempt API client for test");
        let response = client
            .execute(ApiRequest {
                method: HttpMethod::Post,
                url: format!("http://{address}/device/code"),
                headers: HashMap::from([
                    ("Content-Type".to_string(), "application/json".to_string()),
                    ("X-Requested-With".to_string(), "XMLHttpRequest".to_string()),
                ]),
                body: Some(r#"{"surface":"desktop"}"#.to_string()),
                timeout_ms: Some(2_000),
                ..Default::default()
            })
            .await
            .expect("503 should be returned as an HTTP response");

        let raw_request = String::from_utf8(server.await.expect("join local HTTP server"))
            .expect("request should be UTF-8");
        let normalized_request = raw_request.to_ascii_lowercase();

        assert_eq!(response.status, 503);
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
        assert!(normalized_request.starts_with("post /device/code http/1.1\r\n"));
        assert!(normalized_request.contains("\r\ncontent-type: application/json\r\n"));
        assert!(normalized_request.contains("\r\nx-requested-with: xmlhttprequest\r\n"));
        assert!(raw_request.ends_with(r#"{"surface":"desktop"}"#));
    }

    /// Stands in for the pinned public client so the redirect, retry,
    /// credential and size rules can run against loopback servers, which the
    /// real judge refuses by design. `refused_port` plays the private address.
    struct LoopbackHop {
        client: Client,
        refused_port: Option<u16>,
        opened: AtomicUsize,
    }

    impl LoopbackHop {
        fn new(refused_port: Option<u16>) -> Self {
            Self {
                client: Client::builder()
                    .redirect(reqwest::redirect::Policy::none())
                    .retry(reqwest::retry::never())
                    .build()
                    .expect("build loopback test client"),
                refused_port,
                opened: AtomicUsize::new(0),
            }
        }
    }

    impl PublicHop for LoopbackHop {
        fn open(
            &self,
            method: Method,
            url: &url::Url,
        ) -> std::result::Result<reqwest::RequestBuilder, EgressDenial> {
            self.opened.fetch_add(1, Ordering::SeqCst);
            if self.refused_port.is_some() && url.port() == self.refused_port {
                return Err(EgressDenial::InternalDestination(
                    url.host_str().unwrap_or_default().to_string(),
                ));
            }
            Ok(self.client.request(method, url.clone()))
        }
    }

    type RecordedRequests = Arc<std::sync::Mutex<Vec<String>>>;

    /// A loopback server that answers each request with `handler(path)` and
    /// keeps the raw text of everything it was sent.
    async fn spawn_recording_server<F>(handler: F) -> (std::net::SocketAddr, RecordedRequests)
    where
        F: Fn(&str) -> String + Send + Sync + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind recording server");
        let address = listener
            .local_addr()
            .expect("read recording server address");
        let recorded: RecordedRequests = Arc::default();
        let sink = Arc::clone(&recorded);

        tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                let request = read_http_request(&mut stream).await;
                let text = String::from_utf8_lossy(&request).to_string();
                let path = text.split_whitespace().nth(1).unwrap_or("/").to_string();
                sink.lock().expect("record request").push(text);
                let _ = stream.write_all(handler(&path).as_bytes()).await;
                let _ = stream.flush().await;
            }
        });

        (address, recorded)
    }

    fn recorded(requests: &RecordedRequests) -> Vec<String> {
        requests
            .lock()
            .expect("read recorded requests")
            .iter()
            .map(|request| request.to_ascii_lowercase())
            .collect()
    }

    fn status_response(status_line: &str, extra_headers: &str) -> String {
        format!("HTTP/1.1 {status_line}\r\n{extra_headers}content-length: 0\r\nconnection: close\r\n\r\n")
    }

    fn redirect_with(status_line: &str, location: &str) -> String {
        status_response(status_line, &format!("Location: {location}\r\n"))
    }

    fn public_get(url: String) -> ApiRequest {
        ApiRequest {
            method: HttpMethod::Get,
            url,
            timeout_ms: Some(3_000),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn a_redirect_to_a_refused_destination_is_never_connected_to() {
        let (private, private_requests) =
            spawn_recording_server(|_| ok_response("SECRET_METADATA")).await;
        let location = format!("http://{private}/latest/meta-data/");
        let (front, front_requests) =
            spawn_recording_server(move |_| redirect_with("302 Found", &location)).await;
        let hop = LoopbackHop::new(Some(private.port()));

        let error = execute_public(&hop, public_get(format!("http://{front}/")))
            .await
            .expect_err("a redirect to a refused destination must not be followed");

        assert!(
            error.to_string().contains("egress policy"),
            "refusal should name the policy, got: {error}"
        );
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(recorded(&front_requests).len(), 1);
        assert!(
            recorded(&private_requests).is_empty(),
            "the redirect target was dialed although the judge refused it"
        );
        assert_eq!(
            hop.opened.load(Ordering::SeqCst),
            2,
            "every hop, not only the first, must go through the judge"
        );
    }

    #[tokio::test]
    async fn credentials_do_not_follow_a_redirect_to_another_origin() {
        let (other, other_requests) = spawn_recording_server(|_| ok_response("captured")).await;
        let location = format!("http://{other}/capture");
        let (front, front_requests) =
            spawn_recording_server(move |_| redirect_with("302 Found", &location)).await;
        let hop = LoopbackHop::new(None);

        let auths = [
            AuthType::Bearer {
                token: "fixture-bearer-secret".to_string(),
            },
            AuthType::OAuth2 {
                token: "fixture-oauth-secret".to_string(),
            },
            AuthType::Basic {
                username: "fixture-user".to_string(),
                password: "fixture-basic-secret".to_string(),
            },
            AuthType::ApiKey {
                key: "fixture-apikey-secret".to_string(),
                header: "apikey".to_string(),
            },
            AuthType::ApiKey {
                key: "fixture-xapikey-secret".to_string(),
                header: "X-API-Key".to_string(),
            },
        ];
        for auth in auths {
            let response = execute_public(
                &hop,
                ApiRequest {
                    headers: HashMap::from([
                        ("Accept".to_string(), "application/json".to_string()),
                        (
                            "Cookie".to_string(),
                            "session=fixture-cookie-secret".to_string(),
                        ),
                        (
                            "X-Tenant-Signature".to_string(),
                            "fixture-custom-secret".to_string(),
                        ),
                    ]),
                    auth,
                    ..public_get(format!("http://{front}/start"))
                },
            )
            .await
            .expect("the cross-origin redirect is followed without credentials");
            assert_eq!(response.body, "captured");
        }

        let at_origin = recorded(&front_requests).join("\n");
        for sent in [
            "authorization: bearer fixture-bearer-secret",
            "authorization: bearer fixture-oauth-secret",
            "authorization: basic ",
            "apikey: fixture-apikey-secret",
            "x-api-key: fixture-xapikey-secret",
            "fixture-cookie-secret",
            "fixture-custom-secret",
        ] {
            assert!(
                at_origin.contains(sent),
                "the first origin should have received '{sent}'"
            );
        }

        let elsewhere = recorded(&other_requests);
        assert_eq!(elsewhere.len(), 5);
        for request in &elsewhere {
            assert!(request.starts_with("get /capture http/1.1\r\n"));
            assert!(request.contains("\r\naccept: application/json\r\n"));
            for leaked in [
                "authorization",
                "apikey",
                "x-api-key",
                "cookie",
                "x-tenant-signature",
                "secret",
            ] {
                assert!(
                    !request.contains(leaked),
                    "'{leaked}' crossed to another origin: {request}"
                );
            }
        }
    }

    #[tokio::test]
    async fn credentials_stay_on_a_redirect_inside_the_same_origin() {
        let (address, requests) = spawn_recording_server(|path| {
            if path == "/next" {
                ok_response("FOLLOWED")
            } else {
                redirect_with("302 Found", "/next")
            }
        })
        .await;
        let hop = LoopbackHop::new(None);

        let response = execute_public(
            &hop,
            ApiRequest {
                auth: AuthType::Bearer {
                    token: "fixture-bearer-secret".to_string(),
                },
                ..public_get(format!("http://{address}/start"))
            },
        )
        .await
        .expect("a same-origin redirect is followed");

        assert_eq!(response.body, "FOLLOWED");
        let seen = recorded(&requests);
        assert_eq!(seen.len(), 2);
        assert!(seen[1].starts_with("get /next http/1.1\r\n"));
        assert!(seen[1].contains("authorization: bearer fixture-bearer-secret"));
    }

    #[tokio::test]
    async fn a_method_that_changes_state_is_sent_exactly_once() {
        for method in [
            HttpMethod::Post,
            HttpMethod::Put,
            HttpMethod::Patch,
            HttpMethod::Delete,
        ] {
            let (address, requests) =
                spawn_recording_server(|_| status_response("503 Service Unavailable", "")).await;
            let hop = LoopbackHop::new(None);

            let response = execute_public(
                &hop,
                ApiRequest {
                    method: method.clone(),
                    body: Some(r#"{"charge":"once"}"#.to_string()),
                    ..public_get(format!("http://{address}/orders"))
                },
            )
            .await
            .expect("a 503 is returned as the answer, not retried");

            tokio::time::sleep(Duration::from_millis(800)).await;
            assert_eq!(response.status, 503);
            assert_eq!(
                recorded(&requests).len(),
                1,
                "{} was replayed after a 503",
                method.to_string()
            );
        }
    }

    #[tokio::test]
    async fn a_get_is_retried_on_a_gateway_error_and_stops_at_the_bound() {
        let answered = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&answered);
        let (recovering, recovering_requests) = spawn_recording_server(move |_| {
            if counter.fetch_add(1, Ordering::SeqCst) < 2 {
                status_response("503 Service Unavailable", "")
            } else {
                ok_response("RECOVERED")
            }
        })
        .await;
        let hop = LoopbackHop::new(None);

        let response = execute_public(&hop, public_get(format!("http://{recovering}/")))
            .await
            .expect("the third attempt answers");
        assert_eq!(response.body, "RECOVERED");
        assert_eq!(recorded(&recovering_requests).len(), 3);

        let (down, down_requests) =
            spawn_recording_server(|_| status_response("502 Bad Gateway", "")).await;
        let response = execute_public(&hop, public_get(format!("http://{down}/")))
            .await
            .expect("the last gateway error is returned as the answer");
        assert_eq!(response.status, 502);
        assert_eq!(
            recorded(&down_requests).len(),
            MAX_IDEMPOTENT_ATTEMPTS as usize
        );

        let (missing, missing_requests) =
            spawn_recording_server(|_| status_response("404 Not Found", "")).await;
        let response = execute_public(&hop, public_get(format!("http://{missing}/")))
            .await
            .expect("a 404 is an answer");
        assert_eq!(response.status, 404);
        assert_eq!(recorded(&missing_requests).len(), 1);
    }

    #[tokio::test]
    async fn a_response_over_the_cap_is_cut_and_marked() {
        let body = "x".repeat(4096);
        let (address, _) = spawn_recording_server(move |_| ok_response(&body)).await;
        let hop = LoopbackHop::new(None);
        let url = url::Url::parse(&format!("http://{address}/")).expect("test URL");

        let mut response = hop
            .open(Method::GET, &url)
            .expect("open hop")
            .send()
            .await
            .expect("send");
        let cut = read_capped(&mut response, 1000).await.expect("read capped");
        assert!(cut.truncated);
        assert_eq!(cut.bytes.len(), 1000);

        let mut response = hop
            .open(Method::GET, &url)
            .expect("open hop")
            .send()
            .await
            .expect("send");
        let whole = read_capped(&mut response, 4096).await.expect("read whole");
        assert!(!whole.truncated);
        assert_eq!(whole.bytes.len(), 4096);

        let answer = execute_public(&hop, public_get(url.to_string()))
            .await
            .expect("execute");
        assert!(!answer.truncated);
        assert_eq!(answer.body.len(), 4096);
    }

    #[tokio::test]
    async fn a_download_larger_than_the_limit_saves_nothing() {
        let (address, _) = spawn_recording_server(|_| {
            format!(
                "HTTP/1.1 200 OK\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                MAX_PUBLIC_TRANSFER_BYTES + 1
            )
        })
        .await;
        let hop = LoopbackHop::new(None);

        let error = download_public(&hop, &format!("http://{address}/big.bin"), &AuthType::None)
            .await
            .expect_err("an oversized download must be refused");
        assert!(error.to_string().contains("nothing was saved"));
    }

    #[tokio::test]
    async fn a_request_body_over_the_cap_is_refused_before_any_connection() {
        let hop = LoopbackHop::new(None);

        let error = execute_public(
            &hop,
            ApiRequest {
                method: HttpMethod::Post,
                body: Some("x".repeat(MAX_PUBLIC_REQUEST_BODY_BYTES + 1)),
                ..public_get("http://127.0.0.1:9/".to_string())
            },
        )
        .await
        .expect_err("an oversized body must be refused");

        assert!(error.to_string().contains("was not sent"));
        assert_eq!(hop.opened.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn a_request_body_is_never_replayed_to_another_origin() {
        let (other, other_requests) = spawn_recording_server(|_| ok_response("captured")).await;
        let location = format!("http://{other}/capture");
        let (front, _) =
            spawn_recording_server(move |_| redirect_with("307 Temporary Redirect", &location))
                .await;
        let hop = LoopbackHop::new(None);

        let response = execute_public(
            &hop,
            ApiRequest {
                method: HttpMethod::Post,
                body: Some(r#"{"api_key":"fixture-body-secret"}"#.to_string()),
                ..public_get(format!("http://{front}/start"))
            },
        )
        .await
        .expect("the redirect itself is returned");

        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(response.status, 307);
        assert!(recorded(&other_requests).is_empty());
    }

    #[tokio::test]
    async fn redirect_methods_follow_http_semantics_inside_one_origin() {
        let (address, requests) = spawn_recording_server(|path| match path {
            "/replay" => redirect_with("307 Temporary Redirect", "/replayed"),
            "/see-other" => redirect_with("303 See Other", "/done"),
            _ => ok_response("OK"),
        })
        .await;
        let hop = LoopbackHop::new(None);
        let post = |path: &str| ApiRequest {
            method: HttpMethod::Post,
            body: Some(r#"{"name":"fixture-body"}"#.to_string()),
            ..public_get(format!("http://{address}{path}"))
        };

        execute_public(&hop, post("/replay")).await.expect("307");
        execute_public(&hop, post("/see-other")).await.expect("303");

        let seen = recorded(&requests);
        assert_eq!(seen.len(), 4);
        assert!(seen[1].starts_with("post /replayed http/1.1\r\n"));
        assert!(seen[1].ends_with(r#"{"name":"fixture-body"}"#));
        assert!(seen[3].starts_with("get /done http/1.1\r\n"));
        assert!(!seen[3].contains("fixture-body"));
        assert!(!seen[3].contains("content-type"));
    }

    #[tokio::test]
    async fn a_redirect_loop_stops_at_the_hop_bound() {
        let (address, requests) =
            spawn_recording_server(|_| redirect_with("302 Found", "/again")).await;
        let hop = LoopbackHop::new(None);

        let error = execute_public(&hop, public_get(format!("http://{address}/")))
            .await
            .expect_err("an endless redirect chain must stop");

        assert!(error.to_string().contains("redirects"));
        assert_eq!(recorded(&requests).len(), MAX_PUBLIC_REDIRECT_HOPS + 1);
    }

    /// Answers each lookup with the next address in a script, the way a
    /// rebinding resolver answers public once and private afterwards.
    struct RebindingResolver {
        answers: std::sync::Mutex<std::collections::VecDeque<std::net::IpAddr>>,
    }

    impl crate::sys::security::egress_policy::HostResolver for RebindingResolver {
        fn resolve(&self, _host: &str, _port: u16) -> std::io::Result<Vec<std::net::IpAddr>> {
            let next = self
                .answers
                .lock()
                .expect("rebinding script")
                .pop_front()
                .ok_or_else(|| std::io::Error::other("no more scripted answers"))?;
            Ok(vec![next])
        }
    }

    #[test]
    fn a_second_resolution_that_turns_private_is_refused_and_never_dialed() {
        let public: std::net::IpAddr = "93.184.216.34".parse().expect("public address");
        let resolver = RebindingResolver {
            answers: std::sync::Mutex::new(
                [public, "127.0.0.1".parse().expect("loopback address")]
                    .into_iter()
                    .collect(),
            ),
        };
        let client = PublicHttpClient::without_redirects(Client::builder())
            .expect("build pinned public client");

        let _first = client
            .request_with_resolver(Method::GET, "https://rebind.attacker.example/", &resolver)
            .expect("the first answer is public");
        assert_eq!(
            client.pinned_addresses("rebind.attacker.example"),
            Some(vec![public])
        );

        let second = client.request_with_resolver(
            Method::GET,
            "https://rebind.attacker.example/next",
            &resolver,
        );
        assert!(
            matches!(second, Err(EgressDenial::InternalDestination(_))),
            "a later private answer must be refused"
        );
        assert_eq!(
            client.pinned_addresses("rebind.attacker.example"),
            Some(vec![public]),
            "the transport may only ever dial the address that was judged public"
        );
    }

    #[tokio::test]
    async fn an_upload_sends_its_auth_field_name_and_extra_fields() {
        let (address, requests) = spawn_recording_server(|_| ok_response("stored")).await;
        let hop = LoopbackHop::new(None);
        let directory = tempfile::tempdir().expect("temp dir");
        let file_path = directory.path().join("report.txt");
        std::fs::write(&file_path, "fixture file body").expect("write upload fixture");

        let response = upload_public(
            &hop,
            &format!("http://{address}/upload"),
            &file_path,
            "document",
            Some(HashMap::from([(
                "folder".to_string(),
                "fixture-folder".to_string(),
            )])),
            &AuthType::Bearer {
                token: "fixture-upload-token".to_string(),
            },
        )
        .await
        .expect("upload");

        assert_eq!(response.body, "stored");
        let seen = recorded(&requests);
        assert_eq!(seen.len(), 1);
        let request = &seen[0];
        assert!(request.starts_with("post /upload http/1.1\r\n"));
        assert!(request.contains("authorization: bearer fixture-upload-token"));
        assert!(request.contains("content-type: multipart/form-data; boundary="));
        assert!(request.contains(r#"name="document"; filename="report.txt""#));
        assert!(request.contains("fixture file body"));
        assert!(request.contains(r#"name="folder""#));
        assert!(request.contains("fixture-folder"));
        assert!(!request.contains(r#"name="file""#));
    }

    #[tokio::test]
    async fn a_download_sends_its_auth_and_returns_the_bytes() {
        let (address, requests) = spawn_recording_server(|_| ok_response("FILE BYTES")).await;
        let hop = LoopbackHop::new(None);

        let download = download_public(
            &hop,
            &format!("http://{address}/report.pdf"),
            &AuthType::ApiKey {
                key: "fixture-download-key".to_string(),
                header: "X-Download-Key".to_string(),
            },
        )
        .await
        .expect("download");

        assert!(download.success);
        assert_eq!(download.bytes, b"FILE BYTES");
        let seen = recorded(&requests);
        assert_eq!(seen.len(), 1);
        assert!(seen[0].starts_with("get /report.pdf http/1.1\r\n"));
        assert!(seen[0].contains("x-download-key: fixture-download-key"));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn an_upload_path_swapped_for_a_link_is_refused_before_any_connection() {
        let hop = LoopbackHop::new(None);
        let directory = tempfile::tempdir().expect("temp dir");
        let secret = directory.path().join("outside-the-grant.txt");
        std::fs::write(&secret, "fixture secret outside the granted folder").expect("write");
        let approved = directory.path().join("approved.txt");
        std::os::unix::fs::symlink(&secret, &approved).expect("swap the approved path for a link");

        let error = upload_public(
            &hop,
            "http://127.0.0.1:9/upload",
            &approved,
            "file",
            None,
            &AuthType::None,
        )
        .await
        .expect_err("a link at the approved path must not be read through");

        assert!(error.to_string().contains("Failed to read file"));
        assert_eq!(hop.opened.load(Ordering::SeqCst), 0);

        let folder = upload_public(
            &hop,
            "http://127.0.0.1:9/upload",
            directory.path(),
            "file",
            None,
            &AuthType::None,
        )
        .await
        .expect_err("a directory is not an upload");
        assert!(!folder.to_string().is_empty());
        assert_eq!(hop.opened.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn headers_the_client_owns_are_refused_by_name_before_any_connection() {
        let hop = LoopbackHop::new(None);
        let reserved = [
            "Host",
            "HOST",
            "content-length",
            "Transfer-Encoding",
            "Connection",
            "Upgrade",
            "TE",
            "Trailer",
            "Keep-Alive",
            "Expect",
            "Proxy-Authorization",
            "proxy-connection",
            " host ",
        ];

        for name in reserved {
            let as_header = execute_public(
                &hop,
                ApiRequest {
                    headers: HashMap::from([(name.to_string(), "fixture".to_string())]),
                    ..public_get("http://127.0.0.1:9/".to_string())
                },
            )
            .await
            .expect_err("a reserved header must be refused");
            assert!(
                as_header.to_string().contains(name),
                "the refusal must name '{name}', got: {as_header}"
            );

            let as_api_key_header = execute_public(
                &hop,
                ApiRequest {
                    auth: AuthType::ApiKey {
                        key: "fixture-key".to_string(),
                        header: name.to_string(),
                    },
                    ..public_get("http://127.0.0.1:9/".to_string())
                },
            )
            .await
            .expect_err("a reserved header must be refused as an API key header too");
            assert!(as_api_key_header.to_string().contains(name));
        }

        assert_eq!(
            hop.opened.load(Ordering::SeqCst),
            0,
            "a refused header must stop the request before it is opened"
        );
    }

    #[tokio::test]
    async fn ordinary_and_credential_headers_are_still_sent() {
        let (address, requests) = spawn_recording_server(|_| ok_response("ok")).await;
        let hop = LoopbackHop::new(None);

        execute_public(
            &hop,
            ApiRequest {
                headers: HashMap::from([
                    ("Accept".to_string(), "application/json".to_string()),
                    ("X-Request-Id".to_string(), "fixture-request".to_string()),
                    ("Cookie".to_string(), "session=fixture".to_string()),
                ]),
                auth: AuthType::ApiKey {
                    key: "fixture-key".to_string(),
                    header: "X-API-Key".to_string(),
                },
                ..public_get(format!("http://{address}/"))
            },
        )
        .await
        .expect("ordinary headers pass");

        let seen = recorded(&requests);
        assert_eq!(seen.len(), 1);
        for sent in [
            "accept: application/json",
            "x-request-id: fixture-request",
            "cookie: session=fixture",
            "x-api-key: fixture-key",
        ] {
            assert!(seen[0].contains(sent), "'{sent}' should have been sent");
        }
        assert!(seen[0].contains(&format!("host: {address}")));
    }

    #[test]
    fn a_loggable_url_carries_no_query_userinfo_or_fragment() {
        assert_eq!(
            loggable_url("https://user:pass@api.example.com:8443/v1/files?api_key=secret#frag"),
            "https://api.example.com:8443/v1/files"
        );
        assert_eq!(loggable_url("not a url"), "an unreadable URL");
    }

    #[tokio::test]
    async fn file_transfers_need_the_public_client() {
        let client = ApiClient::new().expect("create app API client");
        let error = client
            .fetch_public_bytes("https://8.8.8.8/file", AuthType::None)
            .await
            .expect_err("the app client must not perform a public transfer");
        assert!(error.to_string().contains("public API client"));
    }
}
