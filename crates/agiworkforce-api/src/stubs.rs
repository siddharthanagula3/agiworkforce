//! Stub implementations for API features that are not yet implemented.
//!
//! These allow downstream crates to compile while the full implementations
//! are being developed.

use crate::auth::AuthProvider;
use crate::error::ApiError;
use crate::provider::Provider;
use agiworkforce_client::ReqwestTransport;
use http::HeaderMap;
use std::path::Path;

/// Stub response type for creating a realtime call.
#[derive(Debug)]
pub struct RealtimeCallResponse {
    pub sdp: String,
    pub call_id: String,
}

/// Stub client for the Realtime Call API (WebRTC).
pub struct RealtimeCallClient<A: AuthProvider> {
    _transport: ReqwestTransport,
    _provider: Provider,
    _auth: A,
}

impl<A: AuthProvider> RealtimeCallClient<A> {
    pub fn new(transport: ReqwestTransport, provider: Provider, auth: A) -> Self {
        Self {
            _transport: transport,
            _provider: provider,
            _auth: auth,
        }
    }

    pub async fn create_with_session_and_headers(
        &self,
        _sdp: String,
        _session_config: crate::endpoint::realtime_websocket::RealtimeSessionConfig,
        _extra_headers: HeaderMap,
    ) -> Result<RealtimeCallResponse, ApiError> {
        todo!("RealtimeCallClient::create_with_session_and_headers is not yet implemented")
    }
}

/// Result type for an uploaded local file.
#[derive(Debug, Clone)]
pub struct UploadedFile {
    pub download_url: String,
    pub file_id: String,
    pub mime_type: String,
    pub file_name: String,
    pub uri: String,
    pub file_size_bytes: u64,
}

/// Upload a local file to OpenAI file storage.
///
/// This is a stub implementation that always fails at runtime.
pub async fn upload_local_file(
    _base_url: &str,
    _auth: &dyn AuthProvider,
    _path: &Path,
) -> Result<UploadedFile, ApiError> {
    todo!("upload_local_file is not yet implemented")
}
