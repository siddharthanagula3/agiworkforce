use reqwest::{Client, Method, Response};
use reqwest_middleware::{ClientBuilder, ClientWithMiddleware};
use reqwest_retry::{policies::ExponentialBackoff, RetryTransientMiddleware};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;

use crate::error::{Error, Result};

/// HTTP methods
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

/// Authentication types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum AuthType {
    None,
    Bearer { token: String },
    ApiKey { key: String, header: String },
    Basic { username: String, password: String },
    OAuth2 { token: String },
}

/// API Request configuration
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

/// API Response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub duration_ms: u128,
    pub success: bool,
}

/// Retry configuration
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

/// API Client with retry and timeout
pub struct ApiClient {
    client: ClientWithMiddleware,
    default_timeout: Duration,
}

impl ApiClient {
    /// Create a new API client
    /// Updated Nov 16, 2025: Return Result to propagate HTTP client construction errors
    pub fn new() -> Result<Self> {
        Self::with_retry_config(RetryConfig::default())
    }

    /// Create API client with custom retry configuration
    /// Updated Nov 16, 2025: Return Result instead of panicking on HTTP client construction failure
    pub fn with_retry_config(config: RetryConfig) -> Result<Self> {
        // Create retry policy with exponential backoff
        let retry_policy = ExponentialBackoff::builder()
            .retry_bounds(
                Duration::from_millis(config.initial_backoff_ms),
                Duration::from_millis(config.max_backoff_ms),
            )
            .build_with_max_retries(config.max_retries);

        // Build client with retry middleware
        let reqwest_client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| Error::Other(format!("Failed to create HTTP client: {}", e)))?;

        let client = ClientBuilder::new(reqwest_client)
            .with(RetryTransientMiddleware::new_with_policy(retry_policy))
            .build();

        Ok(Self {
            client,
            default_timeout: Duration::from_secs(30),
        })
    }

    /// Execute an API request
    pub async fn execute(&self, request: ApiRequest) -> Result<ApiResponse> {
        let start = std::time::Instant::now();

        tracing::info!(
            "Executing {} request to {}",
            request.method.to_reqwest_method(),
            request.url
        );

        // Build request
        let mut req_builder = self
            .client
            .request(request.method.to_reqwest_method(), &request.url);

        // Add timeout
        if let Some(timeout_ms) = request.timeout_ms {
            req_builder = req_builder.timeout(Duration::from_millis(timeout_ms));
        } else {
            req_builder = req_builder.timeout(self.default_timeout);
        }

        // Add authentication
        req_builder = self.add_auth(req_builder, &request.auth);

        // Add headers
        for (key, value) in &request.headers {
            req_builder = req_builder.header(key, value);
        }

        // Add query parameters
        if !request.query_params.is_empty() {
            req_builder = req_builder.query(&request.query_params);
        }

        // Add body
        if let Some(body) = &request.body {
            req_builder = req_builder.body(body.clone());

            // Set Content-Type if not already set
            if !request.headers.contains_key("Content-Type") {
                req_builder = req_builder.header("Content-Type", "application/json");
            }
        }

        // Execute request
        let response = req_builder
            .send()
            .await
            .map_err(|e| Error::Other(format!("Failed to send request: {}", e)))?;

        let duration_ms = start.elapsed().as_millis();

        // Parse response
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

    /// Execute GET request
    pub async fn get(&self, url: &str) -> Result<ApiResponse> {
        let request = ApiRequest {
            method: HttpMethod::Get,
            url: url.to_string(),
            ..Default::default()
        };
        self.execute(request).await
    }

    /// Execute POST request with JSON body
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

    /// Execute PUT request with JSON body
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

    /// Execute DELETE request
    pub async fn delete(&self, url: &str) -> Result<ApiResponse> {
        let request = ApiRequest {
            method: HttpMethod::Delete,
            url: url.to_string(),
            ..Default::default()
        };
        self.execute(request).await
    }

    /// Upload file using multipart/form-data
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

        // Read file
        let file_content = tokio::fs::read(file_path)
            .await
            .map_err(|e| Error::Other(format!("Failed to read file: {}", e)))?;

        let file_name = Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();

        // Build multipart form
        let mut form = reqwest::multipart::Form::new();

        // Add file part
        let file_part = reqwest::multipart::Part::bytes(file_content).file_name(file_name);
        form = form.part(field_name.to_string(), file_part);

        // Add additional fields
        if let Some(fields) = additional_fields {
            for (key, value) in fields {
                form = form.text(key, value);
            }
        }

        // Create a raw reqwest client (not middleware) for multipart support
        let raw_client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| Error::Other(format!("Failed to create client: {}", e)))?;

        // Build request with raw client
        let mut req_builder = raw_client.post(url).multipart(form);

        // Add authentication manually for raw client
        req_builder = match &auth {
            AuthType::None => req_builder,
            AuthType::Bearer { token } => req_builder.bearer_auth(token),
            AuthType::ApiKey { key, header } => req_builder.header(header, key),
            AuthType::Basic { username, password } => {
                req_builder.basic_auth(username, Some(password))
            }
            AuthType::OAuth2 { token } => req_builder.bearer_auth(token),
        };

        // Execute request
        let response = req_builder
            .send()
            .await
            .map_err(|e| Error::Other(format!("Failed to upload file: {}", e)))?;

        let duration_ms = start.elapsed().as_millis();

        // Parse response
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

    /// Download file from URL with retry logic
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
            // Create a raw reqwest client each time to ensure clean state
            let raw_client = Client::builder()
                .timeout(Duration::from_secs(300))
                .build()
                .map_err(|e| Error::Other(format!("Failed to create client: {}", e)))?;

            // Build request
            let mut req_builder = raw_client.get(url);

            // Add authentication
            req_builder = match &auth {
                AuthType::None => req_builder,
                AuthType::Bearer { token } => req_builder.bearer_auth(token),
                AuthType::ApiKey { key, header } => req_builder.header(header, key),
                AuthType::Basic { username, password } => {
                    req_builder.basic_auth(username, Some(password))
                }
                AuthType::OAuth2 { token } => req_builder.bearer_auth(token),
            };

            // Execute request
            match req_builder.send().await {
                Ok(response) => {
                    let status = response.status();
                    let success = status.is_success();

                    if !success {
                        // If server returns error, don't blindly retry unless it's a 5xx
                        if status.is_server_error() {
                            if retry_count < max_retries {
                                retry_count += 1;
                                let backoff =
                                    Duration::from_millis(500 * 2u64.pow(retry_count - 1));
                                tracing::warn!(
                                    "Download failed (status {}), retrying in {:?}...",
                                    status,
                                    backoff
                                );
                                tokio::time::sleep(backoff).await;
                                continue;
                            }
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

                    // Success - write file
                    // Note: response.bytes() consumes the response, so we can't extract headers afterwards easily from the same object
                    // without cloning or extracting first. For simplicity in this retry loop, we'll extract headers if possible or just log size.
                    // We'll extract headers from the success case before successful byte reading if we really need them,
                    // but `reqwest::Response` is consumed.
                    // Let's capture headers first.
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

            // Should we retry?
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

    /// Add authentication to request (using reqwest_middleware's RequestBuilder)
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

    /// Extract headers from response
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
        Self::new().expect("Failed to construct default ApiClient")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
    async fn test_get_request() {
        let client = ApiClient::new().expect("Failed to create ApiClient for test");

        // Test with httpbin.org (public testing API)
        let result = client.get("https://httpbin.org/get").await;

        match result {
            Ok(response) => {
                assert!(response.success);
                assert_eq!(response.status, 200);
            }
            Err(e) => {
                // Network might not be available in test environment
                tracing::warn!("GET request failed (expected in offline tests): {}", e);
            }
        }
    }
}
