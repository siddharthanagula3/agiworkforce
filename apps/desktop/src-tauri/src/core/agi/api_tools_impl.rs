// API tool implementations used by api_executor.rs
use anyhow::{anyhow, Result};
use serde_json::{json, Value};
use std::collections::HashMap;

/// The request an `api_call` asks for, read from every parameter the tool
/// declares. Chat and goal runs share it so neither drops one silently.
pub fn build_api_request(
    parameters: &HashMap<String, Value>,
) -> Result<crate::sys::api::ApiRequest> {
    use crate::sys::api::{ApiRequest, HttpMethod};

    let method = match parameters.get("method").filter(|value| !value.is_null()) {
        None => "GET",
        Some(value) => value
            .as_str()
            .ok_or_else(|| anyhow!("method must be a string such as GET or POST"))?,
    };
    let url = parameters
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing url parameter"))?;

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

    let body = if let Some(body_value) = parameters.get("body").filter(|value| !value.is_null()) {
        Some(if body_value.is_string() {
            body_value.as_str().unwrap_or_default().to_string()
        } else {
            serde_json::to_string(body_value)
                .map_err(|e| anyhow!("Failed to serialize body: {}", e))?
        })
    } else {
        None
    };

    let mut headers = HashMap::new();
    if let Some(headers_obj) = parameters.get("headers").and_then(|v| v.as_object()) {
        for (k, v) in headers_obj {
            if let Some(v_str) = v.as_str() {
                headers.insert(k.clone(), v_str.to_string());
            }
        }
    }

    let mut query_params = HashMap::new();
    if let Some(params_obj) = parameters.get("query_params").and_then(|v| v.as_object()) {
        for (k, v) in params_obj {
            if let Some(v_str) = v.as_str() {
                query_params.insert(k.clone(), v_str.to_string());
            }
        }
    }

    let auth = parse_auth_from_parameters(parameters)?;

    let timeout_ms = Some(
        parameters
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(30_000),
    );

    Ok(ApiRequest {
        method: http_method,
        url: url.to_string(),
        headers,
        query_params,
        body,
        auth,
        timeout_ms,
    })
}

pub async fn execute_api_call(
    app_handle: &tauri::AppHandle,
    parameters: &HashMap<String, Value>,
) -> Result<Value> {
    use tauri::Manager;

    let request = build_api_request(parameters)?;

    let api_state = app_handle.state::<crate::sys::commands::ApiState>();
    let response = api_state
        .execute_public_request(request)
        .await
        .map_err(|e| anyhow!("API call failed: {}", e))?;

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
        "truncated": response.truncated,
        "duration_ms": response.duration_ms,
        "headers": response.headers
    }))
}

/// The upload an `api_upload` asks for, read from every parameter the tool
/// declares. Chat and goal runs share it so neither drops one silently.
pub struct ApiUpload {
    pub url: String,
    pub field_name: String,
    pub fields: Option<HashMap<String, String>>,
    pub auth: crate::sys::api::AuthType,
}

impl ApiUpload {
    /// `file_path` must be the path a folder grant check returned; the client
    /// opens it once without following a link.
    pub async fn send(
        self,
        client: &crate::sys::api::ApiClient,
        file_path: &std::path::Path,
    ) -> crate::sys::error::Result<crate::sys::api::ApiResponse> {
        client
            .upload_file(
                &self.url,
                file_path,
                &self.field_name,
                self.fields,
                self.auth,
            )
            .await
    }
}

pub fn build_api_upload(parameters: &HashMap<String, Value>) -> Result<ApiUpload> {
    let url = parameters
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing url parameter"))?;
    let field_name = parameters
        .get("field_name")
        .and_then(|v| v.as_str())
        .unwrap_or(DEFAULT_UPLOAD_FIELD_NAME);
    let fields = parameters
        .get("fields")
        .and_then(|v| v.as_object())
        .map(|fields| {
            fields
                .iter()
                .filter_map(|(k, v)| Some((k.clone(), v.as_str()?.to_string())))
                .collect()
        });

    Ok(ApiUpload {
        url: url.to_string(),
        field_name: field_name.to_string(),
        fields,
        auth: parse_auth_from_parameters(parameters)?,
    })
}

/// The multipart field a file is sent under when the caller names none.
const DEFAULT_UPLOAD_FIELD_NAME: &str = "file";

/// The download an `api_download` asks for, shared by chat and goal runs.
pub struct ApiDownload {
    pub url: String,
    pub auth: crate::sys::api::AuthType,
}

pub fn build_api_download(parameters: &HashMap<String, Value>) -> Result<ApiDownload> {
    let url = parameters
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("Missing url parameter"))?;

    Ok(ApiDownload {
        url: url.to_string(),
        auth: parse_auth_from_parameters(parameters)?,
    })
}

pub async fn execute_api_upload(
    app_handle: &tauri::AppHandle,
    parameters: &HashMap<String, Value>,
    file_path: &str,
) -> Result<Value> {
    use tauri::Manager;

    let upload = build_api_upload(parameters)?;
    let url = upload.url.clone();

    let api_state = app_handle.state::<crate::sys::commands::ApiState>();
    let response = upload
        .send(
            api_state
                .get_public_client()
                .map_err(|e| anyhow!("Failed to get API client: {}", e))?,
            std::path::Path::new(file_path),
        )
        .await
        .map_err(|e| anyhow!("File upload failed: {}", e))?;

    let parsed_body = if !response.body.is_empty() {
        serde_json::from_str::<Value>(&response.body).unwrap_or_else(|_| json!(response.body))
    } else {
        json!(null)
    };

    Ok(json!({
        "success": response.success,
        "status": response.status,
        "body": parsed_body,
        "truncated": response.truncated,
        "duration_ms": response.duration_ms,
        "file_path": file_path,
        "url": url
    }))
}

pub async fn execute_api_download(
    app_handle: &tauri::AppHandle,
    parameters: &HashMap<String, Value>,
    save_path: &str,
) -> Result<Value> {
    use tauri::Manager;

    let ApiDownload { url, auth } = build_api_download(parameters)?;

    let api_state = app_handle.state::<crate::sys::commands::ApiState>();
    let response = api_state
        .get_public_client()
        .map_err(|e| anyhow!("Failed to get API client: {}", e))?
        .download_file(&url, save_path, auth)
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

fn parse_auth_from_parameters(
    parameters: &HashMap<String, Value>,
) -> Result<crate::sys::api::AuthType> {
    use crate::sys::api::AuthType;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::api::{AuthType, HttpMethod};

    fn parameters(value: Value) -> HashMap<String, Value> {
        serde_json::from_value(value).expect("parameters")
    }

    #[test]
    fn a_request_carries_every_parameter_the_tool_declares() {
        let request = build_api_request(&parameters(json!({
            "method": "post",
            "url": "https://8.8.8.8/items",
            "headers": { "Accept": "application/json" },
            "query_params": { "page": "2" },
            "body": { "name": "a" },
            "auth": { "type": "bearer", "token": "fixture-token" },
            "timeout_ms": 5000
        })))
        .expect("request");

        assert!(matches!(request.method, HttpMethod::Post));
        assert_eq!(request.url, "https://8.8.8.8/items");
        assert_eq!(
            request.headers.get("Accept").map(String::as_str),
            Some("application/json")
        );
        assert_eq!(
            request.query_params.get("page").map(String::as_str),
            Some("2")
        );
        assert_eq!(request.body.as_deref(), Some(r#"{"name":"a"}"#));
        assert!(matches!(
            request.auth,
            AuthType::Bearer { ref token } if token == "fixture-token"
        ));
        assert_eq!(request.timeout_ms, Some(5000));
    }

    #[test]
    fn an_upload_carries_the_auth_field_name_and_fields_the_tool_declares() {
        let upload = build_api_upload(&parameters(json!({
            "url": "https://8.8.8.8/upload",
            "file_path": "/tmp/fixture.txt",
            "field_name": "document",
            "fields": { "folder": "reports", "ignored": 7 },
            "auth": { "type": "apikey", "key": "fixture-key", "header": "X-Upload-Key" }
        })))
        .expect("upload");

        assert_eq!(upload.url, "https://8.8.8.8/upload");
        assert_eq!(upload.field_name, "document");
        assert_eq!(
            upload.fields,
            Some(HashMap::from([(
                "folder".to_string(),
                "reports".to_string()
            )]))
        );
        assert!(matches!(
            upload.auth,
            AuthType::ApiKey { ref key, ref header }
                if key == "fixture-key" && header == "X-Upload-Key"
        ));
    }

    #[test]
    fn an_upload_without_optional_parameters_uses_the_default_field_and_no_auth() {
        let upload = build_api_upload(&parameters(json!({
            "url": "https://8.8.8.8/upload",
            "file_path": "/tmp/fixture.txt"
        })))
        .expect("upload");

        assert_eq!(upload.field_name, DEFAULT_UPLOAD_FIELD_NAME);
        assert_eq!(upload.fields, None);
        assert!(matches!(upload.auth, AuthType::None));
        assert!(build_api_upload(&parameters(json!({ "file_path": "/tmp/a" }))).is_err());
    }

    #[test]
    fn a_download_carries_the_auth_the_tool_declares() {
        let download = build_api_download(&parameters(json!({
            "url": "https://8.8.8.8/report.pdf",
            "save_path": "/tmp/report.pdf",
            "auth": { "type": "bearer", "token": "fixture-token" }
        })))
        .expect("download");

        assert_eq!(download.url, "https://8.8.8.8/report.pdf");
        assert!(matches!(
            download.auth,
            AuthType::Bearer { ref token } if token == "fixture-token"
        ));
        assert!(build_api_download(&parameters(json!({ "save_path": "/tmp/a" }))).is_err());
    }

    /// Chat reaches uploads and downloads through the same builders, so a
    /// declared parameter cannot be honoured in a goal run and dropped in chat.
    #[test]
    fn the_chat_tools_read_their_parameters_through_these_builders() {
        let chat = include_str!("../llm/tool_executor/api_tools.rs");
        assert!(chat.contains("build_api_upload(args)"));
        assert!(chat.contains("build_api_download(args)"));
        assert!(chat.contains("build_api_request(args)"));
        assert!(
            chat.contains("canonicalize_readable_path(&self.resolve_path(requested_path))")
                && chat.contains(".send(&client, &validated_path)")
                && !chat.contains("validate_path(file_path)"),
            "the chat upload must send the path the grant check returned, not the raw spelling"
        );
        assert!(
            !chat.contains("AuthType::None"),
            "the chat tools must not replace the declared auth with none"
        );
    }

    #[test]
    fn a_null_body_is_no_body_and_an_unknown_method_is_refused() {
        let request = build_api_request(&parameters(json!({
            "method": "GET",
            "url": "https://8.8.8.8/items",
            "body": null
        })))
        .expect("request");
        assert_eq!(request.body, None);
        assert!(matches!(request.auth, AuthType::None));
        assert_eq!(request.timeout_ms, Some(30_000));

        assert!(build_api_request(&parameters(json!({
            "method": "TRACE",
            "url": "https://8.8.8.8/items"
        })))
        .is_err());
    }

    #[test]
    fn a_request_without_a_method_is_a_get_as_the_tool_declares() {
        for stated in [json!({}), json!({ "method": null })] {
            let mut request = parameters(stated);
            request.insert("url".to_string(), json!("https://8.8.8.8/items"));
            assert!(matches!(
                build_api_request(&request).expect("request").method,
                HttpMethod::Get
            ));
        }

        assert!(build_api_request(&parameters(json!({
            "method": 7,
            "url": "https://8.8.8.8/items"
        })))
        .is_err());
    }
}
