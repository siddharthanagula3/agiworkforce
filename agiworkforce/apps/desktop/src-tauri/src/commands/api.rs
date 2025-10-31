use std::collections::HashMap;
use tauri::State;
use tokio::sync::Mutex;

use crate::api::{
    ApiClient, ApiRequest, ApiResponse, OAuth2Client, OAuth2Config, PkceChallenge, RequestTemplate,
    ResponseParser, TokenResponse,
};

/// State for managing API clients
pub struct ApiState {
    client: ApiClient,
    oauth_clients: Mutex<HashMap<String, OAuth2Client>>,
    pkce_challenges: Mutex<HashMap<String, PkceChallenge>>,
}

impl ApiState {
    pub fn new() -> Self {
        Self {
            client: ApiClient::new(),
            oauth_clients: Mutex::new(HashMap::new()),
            pkce_challenges: Mutex::new(HashMap::new()),
        }
    }
}

/// Execute an API request
#[tauri::command]
pub async fn api_request(
    request: ApiRequest,
    state: State<'_, ApiState>,
) -> Result<ApiResponse, String> {
    tracing::info!(
        "Executing API request: {} {}",
        request.method.to_string(),
        request.url
    );

    state
        .client
        .execute(request)
        .await
        .map_err(|e| format!("API request failed: {}", e))
}

/// Execute a GET request
#[tauri::command]
pub async fn api_get(url: String, state: State<'_, ApiState>) -> Result<ApiResponse, String> {
    tracing::info!("Executing GET request to {}", url);

    state
        .client
        .get(&url)
        .await
        .map_err(|e| format!("GET request failed: {}", e))
}

/// Execute a POST request with JSON body
#[tauri::command]
pub async fn api_post_json(
    url: String,
    body: String,
    state: State<'_, ApiState>,
) -> Result<ApiResponse, String> {
    tracing::info!("Executing POST request to {}", url);

    state
        .client
        .post_json(&url, &body)
        .await
        .map_err(|e| format!("POST request failed: {}", e))
}

/// Execute a PUT request with JSON body
#[tauri::command]
pub async fn api_put_json(
    url: String,
    body: String,
    state: State<'_, ApiState>,
) -> Result<ApiResponse, String> {
    tracing::info!("Executing PUT request to {}", url);

    state
        .client
        .put_json(&url, &body)
        .await
        .map_err(|e| format!("PUT request failed: {}", e))
}

/// Execute a DELETE request
#[tauri::command]
pub async fn api_delete(url: String, state: State<'_, ApiState>) -> Result<ApiResponse, String> {
    tracing::info!("Executing DELETE request to {}", url);

    state
        .client
        .delete(&url)
        .await
        .map_err(|e| format!("DELETE request failed: {}", e))
}

/// Parse API response
#[tauri::command]
pub async fn api_parse_response(
    body: String,
    content_type: Option<String>,
) -> Result<serde_json::Value, String> {
    tracing::info!("Parsing API response");

    let parsed = ResponseParser::parse(&body, content_type.as_deref())
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(serde_json::json!({
        "format": parsed.format,
        "data": parsed.data,
        "raw": parsed.raw,
    }))
}

/// Extract JSON path from parsed response
#[tauri::command]
pub async fn api_extract_json_path(
    body: String,
    path: String,
) -> Result<serde_json::Value, String> {
    tracing::info!("Extracting JSON path: {}", path);

    let parsed = ResponseParser::parse(&body, Some("application/json"))
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    ResponseParser::extract_json_path(&parsed, &path)
        .map_err(|e| format!("Failed to extract path: {}", e))
}

/// Create OAuth 2.0 client
#[tauri::command]
pub async fn api_oauth_create_client(
    client_id: String,
    config: OAuth2Config,
    state: State<'_, ApiState>,
) -> Result<(), String> {
    tracing::info!("Creating OAuth 2.0 client: {}", client_id);

    let oauth_client = OAuth2Client::new(config);
    let mut clients = state.oauth_clients.lock().await;
    clients.insert(client_id, oauth_client);

    Ok(())
}

/// Get OAuth 2.0 authorization URL
#[tauri::command]
pub async fn api_oauth_get_auth_url(
    client_id: String,
    state_param: String,
    use_pkce: bool,
    state: State<'_, ApiState>,
) -> Result<String, String> {
    tracing::info!("Getting OAuth authorization URL for client: {}", client_id);

    let clients = state.oauth_clients.lock().await;
    let oauth_client = clients
        .get(&client_id)
        .ok_or_else(|| format!("OAuth client not found: {}", client_id))?;

    let pkce = if use_pkce {
        let challenge = PkceChallenge::generate();
        let auth_url = oauth_client.get_authorization_url(&state_param, Some(&challenge));

        // Store PKCE challenge for later use
        let mut challenges = state.pkce_challenges.lock().await;
        challenges.insert(client_id.clone(), challenge);

        auth_url
    } else {
        oauth_client.get_authorization_url(&state_param, None)
    };

    Ok(pkce)
}

/// Exchange authorization code for access token
#[tauri::command]
pub async fn api_oauth_exchange_code(
    client_id: String,
    code: String,
    state: State<'_, ApiState>,
) -> Result<TokenResponse, String> {
    tracing::info!("Exchanging authorization code for client: {}", client_id);

    let clients = state.oauth_clients.lock().await;
    let oauth_client = clients
        .get(&client_id)
        .ok_or_else(|| format!("OAuth client not found: {}", client_id))?;

    // Check for PKCE challenge
    let code_verifier = {
        let mut challenges = state.pkce_challenges.lock().await;
        challenges.remove(&client_id).map(|c| c.code_verifier)
    };

    oauth_client
        .exchange_code(&code, code_verifier.as_deref())
        .await
        .map_err(|e| format!("Failed to exchange code: {}", e))
}

/// Refresh access token
#[tauri::command]
pub async fn api_oauth_refresh_token(
    client_id: String,
    refresh_token: String,
    state: State<'_, ApiState>,
) -> Result<TokenResponse, String> {
    tracing::info!("Refreshing access token for client: {}", client_id);

    let clients = state.oauth_clients.lock().await;
    let oauth_client = clients
        .get(&client_id)
        .ok_or_else(|| format!("OAuth client not found: {}", client_id))?;

    oauth_client
        .refresh_token(&refresh_token)
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))
}

/// Get token via client credentials flow
#[tauri::command]
pub async fn api_oauth_client_credentials(
    client_id: String,
    state: State<'_, ApiState>,
) -> Result<TokenResponse, String> {
    tracing::info!("Getting token via client credentials for: {}", client_id);

    let clients = state.oauth_clients.lock().await;
    let oauth_client = clients
        .get(&client_id)
        .ok_or_else(|| format!("OAuth client not found: {}", client_id))?;

    oauth_client
        .client_credentials()
        .await
        .map_err(|e| format!("Client credentials flow failed: {}", e))
}

/// Render request template
#[tauri::command]
pub async fn api_render_template(
    template: RequestTemplate,
    variables: HashMap<String, String>,
) -> Result<serde_json::Value, String> {
    tracing::info!("Rendering request template: {}", template.name);

    let rendered = template
        .render(&variables)
        .map_err(|e| format!("Failed to render template: {}", e))?;

    Ok(serde_json::json!({
        "method": rendered.method,
        "url": rendered.url,
        "headers": rendered.headers,
        "body": rendered.body,
    }))
}

/// Extract variables from template
#[tauri::command]
pub async fn api_extract_template_variables(template_str: String) -> Result<Vec<String>, String> {
    tracing::info!("Extracting template variables");

    let variables = crate::api::TemplateEngine::extract_variables(&template_str);
    Ok(variables)
}

/// Validate template syntax
#[tauri::command]
pub async fn api_validate_template(template_str: String) -> Result<(), String> {
    tracing::info!("Validating template syntax");

    crate::api::TemplateEngine::validate_template(&template_str)
        .map_err(|e| format!("Template validation failed: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_api_state_creation() {
        let state = ApiState::new();
        assert!(state.oauth_clients.lock().await.is_empty());
        assert!(state.pkce_challenges.lock().await.is_empty());
    }

    #[tokio::test]
    async fn test_oauth_client_management() {
        let state = ApiState::new();

        let config = OAuth2Config {
            client_id: "test_client".to_string(),
            client_secret: None,
            auth_url: "https://example.com/oauth/authorize".to_string(),
            token_url: "https://example.com/oauth/token".to_string(),
            redirect_uri: "http://localhost:8080/callback".to_string(),
            scopes: vec!["read".to_string()],
            use_pkce: true,
        };

        // Create client
        let oauth_client = OAuth2Client::new(config);
        state
            .oauth_clients
            .lock()
            .await
            .insert("test".to_string(), oauth_client);

        // Verify client exists
        assert!(state.oauth_clients.lock().await.contains_key("test"));
    }
}
