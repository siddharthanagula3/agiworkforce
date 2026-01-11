// API Tools Implementation for AGI Executor
// This file contains the implementation of api_call, api_upload, and api_download tools

use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use std::collections::HashMap;

/// Execute an API HTTP call with full authentication support
pub async fn execute_api_call(
    app_handle: &tauri::AppHandle,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    use crate::api::{ApiRequest, HttpMethod};
    use tauri::Manager;

    let method = parameters
        .get("method")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing method parameter"))?;
    let url = parameters
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing url parameter"))?;

    // Parse method
    let http_method = match method.to_uppercase().as_str() {
        "GET" => HttpMethod::Get,
        "POST" => HttpMethod::Post,
        "PUT" => HttpMethod::Put,
        "DELETE" => HttpMethod::Delete,
        "PATCH" => HttpMethod::Patch,
        "HEAD" => HttpMethod::Head,
        "OPTIONS" => HttpMethod::Options,
        _ => return Err(anyhow!("Unsupported HTTP method: {}", method)),
    };

    // Get body if provided (can be JSON string or object)
    let body = if let Some(body_value) = parameters.get("body") {
        Some(if body_value.is_string() {
            body_value.as_str().unwrap().to_string()
        } else {
            serde_json::to_string(body_value)
                .map_err(|e| anyhow!("Failed to serialize body: {}", e))?
        })
    } else {
        None
    };

    // Get headers if provided
    let mut headers = HashMap::new();
    if let Some(headers_obj) = parameters.get("headers").and_then(|v| v.as_object()) {
        for (k, v) in headers_obj {
            if let Some(v_str) = v.as_str() {
                headers.insert(k.clone(), v_str.to_string());
            }
        }
    }

    // Get query parameters if provided
    let mut query_params = HashMap::new();
    if let Some(params_obj) = parameters.get("query_params").and_then(|v| v.as_object()) {
        for (k, v) in params_obj {
            if let Some(v_str) = v.as_str() {
                query_params.insert(k.clone(), v_str.to_string());
            }
        }
    }

    // Parse authentication
    let auth = parse_auth_from_parameters(parameters)?;

    // Get timeout if provided
    let timeout_ms = parameters
        .get("timeout_ms")
        .and_then(|v| v.as_u64())
        .or(Some(30000));

    // Create API request
    let request = ApiRequest {
        method: http_method,
        url: url.to_string(),
        headers,
        query_params,
        body,
        auth,
        timeout_ms,
    };

    // Execute the request using ApiState's public method
    let api_state = app_handle.state::<crate::commands::ApiState>();
    let response = api_state
        .execute_request(request)
        .await
        .map_err(|e| anyhow!("API call failed: {}", e))?;

    // Try to parse response body as JSON for better structure
    let parsed_body = if !response.body.is_empty() {
        serde_json::from_str::<Value>(&response.body).unwrap_or_else(|_| json!(response.body))
    } else {
        json!(null)
    };

    Ok(json!({
        "success": response.success,
        "status": response.status,
        "body": parsed_body,
        "raw_body": response.body,
        "duration_ms": response.duration_ms,
        "headers": response.headers
    }))
}

/// Upload a file via multipart/form-data
pub async fn execute_api_upload(
    app_handle: &tauri::AppHandle,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    use tauri::Manager;

    let url = parameters
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing url parameter"))?;
    let file_path = parameters
        .get("file_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing file_path parameter"))?;
    let field_name = parameters
        .get("field_name")
        .and_then(|v| v.as_str())
        .unwrap_or("file");

    // Parse authentication
    let auth = parse_auth_from_parameters(parameters)?;

    // Get additional form fields if provided
    let additional_fields =
        if let Some(fields_obj) = parameters.get("fields").and_then(|v| v.as_object()) {
            let mut fields = HashMap::new();
            for (k, v) in fields_obj {
                if let Some(v_str) = v.as_str() {
                    fields.insert(k.clone(), v_str.to_string());
                }
            }
            Some(fields)
        } else {
            None
        };

    // Execute the upload using ApiState
    let api_state = app_handle.state::<crate::commands::ApiState>();
    let response = api_state
        .client
        .upload_file(url, file_path, field_name, additional_fields, auth)
        .await
        .map_err(|e| anyhow!("File upload failed: {}", e))?;

    // Try to parse response body as JSON
    let parsed_body = if !response.body.is_empty() {
        serde_json::from_str::<Value>(&response.body).unwrap_or_else(|_| json!(response.body))
    } else {
        json!(null)
    };

    Ok(json!({
        "success": response.success,
        "status": response.status,
        "body": parsed_body,
        "duration_ms": response.duration_ms,
        "file_path": file_path,
        "url": url
    }))
}

/// Download a file from a URL
pub async fn execute_api_download(
    app_handle: &tauri::AppHandle,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    use tauri::Manager;

    let url = parameters
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing url parameter"))?;
    let save_path = parameters
        .get("save_path")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing save_path parameter"))?;

    // Parse authentication
    let auth = parse_auth_from_parameters(parameters)?;

    // Execute the download using ApiState
    let api_state = app_handle.state::<crate::commands::ApiState>();
    let response = api_state
        .client
        .download_file(url, save_path, auth)
        .await
        .map_err(|e| anyhow!("File download failed: {}", e))?;

    Ok(json!({
        "success": response.success,
        "status": response.status,
        "message": response.body,
        "duration_ms": response.duration_ms,
        "url": url,
        "save_path": save_path
    }))
}

/// Helper function to parse authentication from parameters
fn parse_auth_from_parameters(parameters: &HashMap<String, Value>) -> Result<crate::api::AuthType> {
    use crate::api::AuthType;

    if let Some(auth_obj) = parameters.get("auth") {
        if let Some(auth_type) = auth_obj.get("type").and_then(|v| v.as_str()) {
            match auth_type {
                "bearer" => {
                    let token = auth_obj
                        .get("token")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| anyhow!("Bearer auth requires 'token' field"))?;
                    Ok(AuthType::Bearer {
                        token: token.to_string(),
                    })
                }
                "basic" => {
                    let username = auth_obj
                        .get("username")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| anyhow!("Basic auth requires 'username' field"))?;
                    let password = auth_obj
                        .get("password")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| anyhow!("Basic auth requires 'password' field"))?;
                    Ok(AuthType::Basic {
                        username: username.to_string(),
                        password: password.to_string(),
                    })
                }
                "apikey" => {
                    let key = auth_obj
                        .get("key")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| anyhow!("API key auth requires 'key' field"))?;
                    let header = auth_obj
                        .get("header")
                        .and_then(|v| v.as_str())
                        .unwrap_or("X-API-Key");
                    Ok(AuthType::ApiKey {
                        key: key.to_string(),
                        header: header.to_string(),
                    })
                }
                "oauth2" => {
                    let token = auth_obj
                        .get("token")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| anyhow!("OAuth2 auth requires 'token' field"))?;
                    Ok(AuthType::OAuth2 {
                        token: token.to_string(),
                    })
                }
                _ => Ok(AuthType::None),
            }
        } else {
            Ok(AuthType::None)
        }
    } else {
        Ok(AuthType::None)
    }
}
