use once_cell::sync::Lazy;
use reqwest::{Client, Method, Response};
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware};
use reqwest_retry::{policies::ExponentialBackoff, RetryTransientMiddleware};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;

use crate::sys::error::{Error, Result};

/// Default HTTP client with retry middleware, lazily initialized.
/// This is shared across all `ApiClient::default()` instances.
static DEFAULT_CLIENT: Lazy<Arc<ClientWithMiddleware>> = Lazy::new(|| {
    let retry_policy = ExponentialBackoff::builder()
        .retry_bounds(Duration::from_millis(500), Duration::from_millis(10000))
        .build_with_max_retries(3);

    // Use default reqwest client configuration which should never fail
    let reqwest_client = Client::builder()
        .timeout(Duration::from_secs(30))
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

pub struct ApiClient {
    client: Arc<ClientWithMiddleware>,
    default_timeout: Duration,
}

impl ApiClient {
    pub fn new() -> Result<Self> {
        Self::with_retry_config(RetryConfig::default())
    }

    /// Build a client that never replays a request.
    ///
    /// Use this for non-idempotent operations that do not carry an
    /// idempotency key, such as creating an OAuth device authorization code.
    pub fn single_attempt() -> Result<Self> {
        let reqwest_client = Client::builder()
            .timeout(Duration::from_secs(30))
            .retry(reqwest::retry::never())
            .build()
            .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            client: Arc::new(ClientBuilder::new(reqwest_client).build()),
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
            .build()
            .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        let client = ClientBuilder::new(reqwest_client)
            .with(RetryTransientMiddleware::new_with_policy(retry_policy))
            .build();

        Ok(Self {
            client: Arc::new(client),
            default_timeout: Duration::from_secs(30),
        })
    }

    pub async fn execute(&self, request: ApiRequest) -> Result<ApiResponse> {
        let start = std::time::Instant::now();

        tracing::info!(
            "Executing {} request to {}",
            request.method.to_reqwest_method(),
            request.url
        );

        // AUDIT-FIX (reqwest-0.13 migration): the middleware RequestBuilder
        // does not expose `.query()` in the feature set we ship, so encode
        // query params directly into the URL before the builder is created.
        let url_with_query = if request.query_params.is_empty() {
            request.url.clone()
        } else {
            let qs = request
                .query_params
                .iter()
                .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
                .collect::<Vec<_>>()
                .join("&");
            if request.url.contains('?') {
                format!("{}&{qs}", request.url)
            } else {
                format!("{}?{qs}", request.url)
            }
        };

        let mut req_builder = self
            .client
            .request(request.method.to_reqwest_method(), &url_with_query);

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
            .map_err(|e| Error::Other(format!("Failed to send request: {}", e)))?;

        let duration_ms = start.elapsed().as_millis();

        let status = response.status();
        let headers = self.extract_headers(&response);
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
        })
    }

    pub async fn get(&self, url: &str) -> Result<ApiResponse> {
        let request = ApiRequest {
            method: HttpMethod::Get,
            url: url.to_string(),
            ..Default::default()
        };
        self.execute(request).await
    }

    pub async fn post_json(&self, url: &str, body: &str) -> Result<ApiResponse> {
        let request = ApiRequest {
            method: HttpMethod::Post,
            url: url.to_string(),
            body: Some(body.to_string()),
            headers: HashMap::from([("Content-Type".to_string(), "application/json".to_string())]),
            ..Default::default()
        };
        self.execute(request).await
    }

    pub async fn put_json(&self, url: &str, body: &str) -> Result<ApiResponse> {
        let request = ApiRequest {
            method: HttpMethod::Put,
            url: url.to_string(),
            body: Some(body.to_string()),
            headers: HashMap::from([("Content-Type".to_string(), "application/json".to_string())]),
            ..Default::default()
        };
        self.execute(request).await
    }

    pub async fn delete(&self, url: &str) -> Result<ApiResponse> {
        let request = ApiRequest {
            method: HttpMethod::Delete,
            url: url.to_string(),
            ..Default::default()
        };
        self.execute(request).await
    }

    pub async fn upload_file(
        &self,
        url: &str,
        file_path: &str,
        field_name: &str,
        additional_fields: Option<HashMap<String, String>>,
        auth: AuthType,
    ) -> Result<ApiResponse> {
        let start = std::time::Instant::now();

        tracing::info!("Uploading file {} to {}", file_path, url);

        let file_content = tokio::fs::read(file_path)
            .await
            .map_err(|e| Error::Other(format!("Failed to read file: {}", e)))?;

        let file_name = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();

        let mut form = reqwest::multipart::Form::new();

        let file_part = reqwest::multipart::Part::bytes(file_content).file_name(file_name);
        form = form.part(field_name.to_string(), file_part);

        if let Some(fields) = additional_fields {
            for (key, value) in fields {
                form = form.text(key, value);
            }
        }

        let raw_client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| Error::Other(format!("Failed to create client: {}", e)))?;

        let mut req_builder = raw_client.post(url).multipart(form);

        req_builder = match &auth {
            AuthType::None => req_builder,
            AuthType::Bearer { token } => req_builder.bearer_auth(token),
            AuthType::ApiKey { key, header } => req_builder.header(header, key),
            AuthType::Basic { username, password } => {
                req_builder.basic_auth(username, Some(password))
            }
            AuthType::OAuth2 { token } => req_builder.bearer_auth(token),
        };

        let response = req_builder
            .send()
            .await
            .map_err(|e| Error::Other(format!("Failed to upload file: {}", e)))?;

        let duration_ms = start.elapsed().as_millis();

        let status = response.status();
        let headers = self.extract_headers(&response);
        let success = status.is_success();

        let body = response
            .text()
            .await
            .map_err(|e| Error::Other(format!("Failed to read response body: {}", e)))?;

        tracing::info!(
            "Upload completed: status={}, duration={}ms, success={}",
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
        })
    }

    pub async fn download_file(
        &self,
        url: &str,
        save_path: &str,
        auth: AuthType,
    ) -> Result<ApiResponse> {
        let start = std::time::Instant::now();
        let max_retries = 3;
        let mut retry_count = 0;
        #[allow(unused_assignments)]
        let mut last_error = String::new();

        tracing::info!("Downloading file from {} to {}", url, save_path);

        loop {
            let raw_client = Client::builder()
                .timeout(Duration::from_secs(300))
                .build()
                .map_err(|e| Error::Other(format!("Failed to create client: {}", e)))?;

            let mut req_builder = raw_client.get(url);

            req_builder = match &auth {
                AuthType::None => req_builder,
                AuthType::Bearer { token } => req_builder.bearer_auth(token),
                AuthType::ApiKey { key, header } => req_builder.header(header, key),
                AuthType::Basic { username, password } => {
                    req_builder.basic_auth(username, Some(password))
                }
                AuthType::OAuth2 { token } => req_builder.bearer_auth(token),
            };

            match req_builder.send().await {
                Ok(response) => {
                    let status = response.status();
                    let success = status.is_success();

                    if !success {
                        if status.is_server_error() && retry_count < max_retries {
                            retry_count += 1;
                            let backoff = Duration::from_millis(500 * 2u64.pow(retry_count - 1));
                            tracing::warn!(
                                "Download failed (status {}), retrying in {:?}...",
                                status,
                                backoff
                            );
                            tokio::time::sleep(backoff).await;
                            continue;
                        }

                        let headers = self.extract_headers(&response);
                        let body = response.text().await.map_err(|e| {
                            Error::Other(format!("Failed to read error response: {}", e))
                        })?;

                        return Ok(ApiResponse {
                            status: status.as_u16(),
                            headers,
                            body,
                            duration_ms: start.elapsed().as_millis(),
                            success: false,
                        });
                    }

                    let headers = self.extract_headers(&response);

                    let file_size = response.content_length().unwrap_or(0);
                    match response.bytes().await {
                        Ok(bytes) => match File::create(save_path).await {
                            Ok(mut file) => {
                                if let Err(e) = file.write_all(&bytes).await {
                                    last_error = format!("Failed to write file: {}", e);
                                } else if let Err(e) = file.flush().await {
                                    last_error = format!("Failed to flush file: {}", e);
                                } else {
                                    let duration_ms = start.elapsed().as_millis();
                                    tracing::info!(
                                        "Download completed: size={} bytes, duration={}ms",
                                        file_size,
                                        duration_ms
                                    );
                                    return Ok(ApiResponse {
                                        status: status.as_u16(),
                                        headers,
                                        body: format!(
                                            "File downloaded successfully to {}",
                                            save_path
                                        ),
                                        duration_ms,
                                        success: true,
                                    });
                                }
                            }
                            Err(e) => last_error = format!("Failed to create file: {}", e),
                        },
                        Err(e) => last_error = format!("Failed to read response bytes: {}", e),
                    }
                }
                Err(e) => {
                    last_error = format!("Request failed: {}", e);
                }
            }

            if retry_count < max_retries {
                retry_count += 1;
                let backoff = Duration::from_millis(500 * 2u64.pow(retry_count - 1));
                tracing::warn!(
                    "Download attempt {} failed: {}, retrying in {:?}...",
                    retry_count,
                    last_error,
                    backoff
                );
                tokio::time::sleep(backoff).await;
            } else {
                return Err(Error::Other(format!(
                    "Download failed after {} retries. Last error: {}",
                    max_retries, last_error
                )));
            }
        }
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

    fn extract_headers(&self, response: &Response) -> HashMap<String, String> {
        let mut headers = HashMap::new();

        for (key, value) in response.headers() {
            if let Ok(value_str) = value.to_str() {
                headers.insert(key.to_string(), value_str.to_string());
            }
        }

        headers
    }
}

impl Default for ApiClient {
    fn default() -> Self {
        Self {
            client: Arc::clone(&DEFAULT_CLIENT),
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

    #[tokio::test]
    async fn test_get_request() {
        let client = ApiClient::new().expect("Failed to create ApiClient for test");

        // Use httpbin.org for reliable API testing
        let result = client.get("https://httpbin.org/get");

        match result.await {
            Ok(response) => {
                if !response.success {
                    tracing::warn!(
                        "GET request returned status {} (expected in some envs)",
                        response.status
                    );
                } else {
                    assert_eq!(response.status, 200);
                }
            }
            Err(e) => {
                tracing::warn!("GET request failed (expected in offline tests): {}", e);
            }
        }
    }
}
