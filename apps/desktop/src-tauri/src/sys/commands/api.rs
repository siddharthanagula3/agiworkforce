use once_cell::sync::OnceCell;

use crate::sys::api::{ApiClient, ApiRequest, ApiResponse};

pub struct ApiState {
    client: OnceCell<ApiClient>,
    public_client: OnceCell<ApiClient>,
    single_attempt_client: OnceCell<ApiClient>,
}

impl Default for ApiState {
    fn default() -> Self {
        Self {
            client: OnceCell::new(),
            public_client: OnceCell::new(),
            single_attempt_client: OnceCell::new(),
        }
    }
}

impl ApiState {
    pub fn new() -> Result<Self, String> {
        let state = Self::default();
        // Eagerly initialize the client to catch errors early
        state.get_client()?;
        Ok(state)
    }

    /// Get or lazily initialize the API client
    pub fn get_client(&self) -> Result<&ApiClient, String> {
        self.client.get_or_try_init(|| {
            ApiClient::new().map_err(|e| format!("Failed to initialize API client: {}", e))
        })
    }

    /// Get the client whose initial destination and every redirect hop must be
    /// public. User- and LLM-selected API destinations must use this client.
    pub fn get_public_client(&self) -> Result<&ApiClient, String> {
        self.public_client.get_or_try_init(|| {
            ApiClient::public()
                .map_err(|e| format!("Failed to initialize public API client: {}", e))
        })
    }

    /// Return the shared client for non-idempotent requests that must never be
    /// replayed by either reqwest or the generic transient-retry middleware.
    pub fn get_single_attempt_client(&self) -> Result<&ApiClient, String> {
        self.single_attempt_client.get_or_try_init(|| {
            ApiClient::single_attempt()
                .map_err(|e| format!("Failed to initialize single-attempt API client: {}", e))
        })
    }

    /// Execute a request whose destination the app did not choose.
    ///
    /// The WebView's CSP `connect-src` allowlist has no effect on a request
    /// made from the Rust process, so the destination and every redirect hop
    /// are judged against the same `egress_policy` the tool guard applies to
    /// LLM-supplied URLs. Requests the app builds itself from an
    /// already-validated base (account, OAuth) use [`Self::get_client`], which may
    /// reach a `localhost` API server in development.
    pub async fn execute_renderer_request(
        &self,
        request: ApiRequest,
    ) -> Result<ApiResponse, String> {
        self.get_public_client()?
            .execute(request)
            .await
            .map_err(|e| format!("Public API request failed: {}", e))
    }

    /// Execute an agent-selected request through the same public-only boundary
    /// as renderer-selected API calls.
    pub async fn execute_public_request(&self, request: ApiRequest) -> Result<ApiResponse, String> {
        self.execute_renderer_request(request).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::api::HttpMethod;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    /// Packet-level negative test for the WebView egress bypass.
    ///
    /// The renderer's CSP cannot restrict a request that Rust makes on its
    /// behalf, so the proof that public requests are governed has to be that no TCP
    /// connection reaches the forbidden destination. A real listener on
    /// loopback counts connections; the guard must keep that count at zero.
    #[tokio::test]
    async fn renderer_requests_never_reach_loopback() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("failed to bind loopback listener");
        let addr = listener.local_addr().expect("listener has no address");

        let connections = Arc::new(AtomicUsize::new(0));
        let observed = Arc::clone(&connections);
        tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                observed.fetch_add(1, Ordering::SeqCst);
                // Answer so an unguarded client finishes fast instead of
                // hanging the test on the 30s request timeout.
                let _ = tokio::io::AsyncWriteExt::write_all(
                    &mut stream,
                    b"HTTP/1.1 200 OK\r\ncontent-length: 0\r\nconnection: close\r\n\r\n",
                )
                .await;
            }
        });

        let state = ApiState::new().expect("Failed to create ApiState");
        let error = state
            .execute_renderer_request(ApiRequest {
                method: HttpMethod::Get,
                url: format!("http://{addr}/"),
                ..Default::default()
            })
            .await
            .expect_err("a loopback destination must be refused");
        assert!(
            error.contains("egress policy"),
            "refusal should name the policy, got: {error}"
        );

        // Give a request that did escape time to land before counting.
        tokio::time::sleep(Duration::from_millis(250)).await;
        assert_eq!(
            connections.load(Ordering::SeqCst),
            0,
            "a public request opened a connection to loopback"
        );
    }

    #[tokio::test]
    async fn renderer_requests_refuse_metadata_local_names_and_odd_schemes() {
        let state = ApiState::new().expect("Failed to create ApiState");

        for url in [
            "http://169.254.169.254/latest/meta-data/",
            "http://localhost:11434/api/tags",
            "http://[::1]:8080/",
            "http://10.0.0.1.nip.io/",
            "file:///etc/passwd",
        ] {
            let result = state
                .execute_renderer_request(ApiRequest {
                    method: HttpMethod::Get,
                    url: url.to_string(),
                    ..Default::default()
                })
                .await;
            assert!(result.is_err(), "{url} must be refused");
        }
    }

    #[test]
    fn test_api_state_creation() {
        let state = ApiState::new().expect("Failed to create ApiState");
        assert!(state.get_public_client().is_ok());
        assert!(state.get_single_attempt_client().is_ok());
    }
}
