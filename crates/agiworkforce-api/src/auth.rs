use std::sync::Arc;

use agiworkforce_client::Request;
use http::HeaderMap;
use http::HeaderValue;

/// Error returned when applying auth to a request.
#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("auth build error: {0}")]
    Build(String),
    #[error("auth transient error: {0}")]
    Transient(String),
}

/// Provides authentication headers for API requests.
///
/// Implementations should be cheap and non-blocking; any asynchronous
/// refresh or I/O should be handled by higher layers before requests
/// reach this interface.
#[async_trait::async_trait]
pub trait AuthProvider: Send + Sync {
    fn add_auth_headers(&self, headers: &mut HeaderMap);

    fn to_auth_headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        self.add_auth_headers(&mut headers);
        headers
    }

    async fn apply_auth(&self, request: Request) -> Result<Request, AuthError> {
        let mut req = request;
        self.add_auth_headers(&mut req.headers);
        Ok(req)
    }
}

/// A shared, heap-allocated `AuthProvider` trait object.
pub type SharedAuthProvider = Arc<dyn AuthProvider>;

/// Blanket `AuthProvider` impl for `Arc<dyn AuthProvider>`.
#[async_trait::async_trait]
impl AuthProvider for Arc<dyn AuthProvider> {
    fn add_auth_headers(&self, headers: &mut HeaderMap) {
        (**self).add_auth_headers(headers);
    }

    async fn apply_auth(&self, request: Request) -> Result<Request, AuthError> {
        (**self).apply_auth(request).await
    }
}

/// Telemetry about whether an auth header will be attached to a request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthHeaderTelemetry {
    pub attached: bool,
    pub name: Option<&'static str>,
}

/// Inspect whether the given auth provider would attach an Authorization header.
pub fn auth_header_telemetry(auth: &dyn AuthProvider) -> AuthHeaderTelemetry {
    let headers = auth.to_auth_headers();
    let attached = headers.contains_key(http::header::AUTHORIZATION);
    AuthHeaderTelemetry {
        attached,
        name: if attached { Some("authorization") } else { None },
    }
}

pub(crate) fn add_auth_headers_to_header_map(auth: &dyn AuthProvider, headers: &mut HeaderMap) {
    auth.add_auth_headers(headers);
}

pub(crate) fn add_auth_headers(auth: &dyn AuthProvider, mut req: Request) -> Request {
    auth.add_auth_headers(&mut req.headers);
    req
}

/// Simple bearer-token auth provider for use inside this crate.
pub(crate) struct BearerToken(pub String);

#[async_trait::async_trait]
impl AuthProvider for BearerToken {
    fn add_auth_headers(&self, headers: &mut HeaderMap) {
        if let Ok(header) = HeaderValue::from_str(&format!("Bearer {}", self.0)) {
            let _ = headers.insert(http::header::AUTHORIZATION, header);
        }
    }
}
