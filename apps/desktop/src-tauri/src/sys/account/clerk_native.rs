//! Native Clerk Frontend API transport for Desktop sign-in.
//!
//! Why this lives in Rust rather than in the webview:
//!
//! 1. **Origin.** A Clerk production instance validates the browser `Origin`
//!    against the instance's allowed origins and answers `origin_invalid`
//!    otherwise. The Tauri webview's origin (`tauri://localhost` /
//!    `http://tauri.localhost`) is not — and should not be — an allowed web
//!    origin for the instance. The native HTTP client sends no `Origin`, which
//!    is exactly how Clerk's own React Native/Expo client talks to FAPI.
//! 2. **Native session semantics.** Clerk's native contract (verified against
//!    the installed `@clerk/expo` build,
//!    `dist/provider/singleton/createClerkInstance.js`) is: send
//!    `_is_native=1`, omit cookies, carry the client JWT in the `authorization`
//!    REQUEST header, and read the rotated client JWT back from the
//!    `authorization` RESPONSE header. A cookie-based webview fetch cannot do
//!    that.
//! 3. **Blast radius.** The path allowlist below means this command can only
//!    ever reach the sign-in and session-token routes of the one Clerk
//!    instance named by our own publishable key. It is not a general proxy.
//!
//! Credentials (password, email code, MFA code, client JWT, session JWT) are
//! never logged here and never persisted here. `ApiClient::execute` logs the
//! method and URL only — never headers or bodies — and every credential this
//! module handles travels in a header or a form body.

use std::collections::HashMap;

use base64::Engine as _;
use serde::Serialize;
use tauri::State;

use crate::sys::api::{ApiRequest, ApiResponse, AuthType, HttpMethod};
use crate::sys::commands::ApiState;

/// Clerk Frontend API version pinned by the installed `@clerk/clerk-js`
/// (6.25.3) FapiClient. Sending the same value keeps the response shapes this
/// client parses identical to the ones the SDK parses.
const CLERK_API_VERSION: &str = "2026-05-12";
/// Advertised client version. Mirrors the installed `@clerk/clerk-js` build so
/// Clerk's server-side compatibility handling treats us like that client.
const CLERK_JS_VERSION: &str = "6.25.3";

/// Response handed back to the Desktop webview.
///
/// `client_token` is the rotated Clerk native client JWT from the response
/// `authorization` header. It is a bearer credential for the *client* (not a
/// user session token) and stays in webview memory for the duration of one
/// sign-in ceremony only.
#[derive(Debug, Clone, Serialize)]
pub struct ClerkNativeHttpResponse {
    pub status: u16,
    pub body: String,
    #[serde(rename = "clientToken")]
    pub client_token: Option<String>,
}

/// Decode the Clerk Frontend API host from a publishable key.
///
/// Contract verified against `@clerk/shared` `src/keys.ts` (installed):
/// `pk_test_` / `pk_live_` + unpadded base64 of `"<frontendApi>$"`.
fn frontend_api_from_publishable_key(publishable_key: &str) -> Result<String, String> {
    let key = publishable_key.trim();
    let encoded = key
        .strip_prefix("pk_live_")
        .or_else(|| key.strip_prefix("pk_test_"))
        .ok_or_else(|| {
            "The Clerk publishable key must start with pk_live_ or pk_test_.".to_string()
        })?;
    if encoded.is_empty() {
        return Err("The Clerk publishable key is empty after its prefix.".to_string());
    }

    // Clerk strips base64 padding; restore it before decoding.
    let padded = {
        let mut value = encoded.to_string();
        while value.len() % 4 != 0 {
            value.push('=');
        }
        value
    };
    let decoded_bytes = base64::engine::general_purpose::STANDARD
        .decode(padded.as_bytes())
        .map_err(|_| "The Clerk publishable key is not valid base64.".to_string())?;
    let decoded = String::from_utf8(decoded_bytes)
        .map_err(|_| "The Clerk publishable key does not decode to text.".to_string())?;

    let host = decoded
        .strip_suffix('$')
        .ok_or_else(|| "The Clerk publishable key has an unexpected payload.".to_string())?;
    if host.is_empty() || host.contains('$') || !host.contains('.') {
        return Err("The Clerk publishable key does not name a frontend API host.".to_string());
    }
    // Reject anything that is not a bare host: no scheme, no path, no port
    // trickery, no userinfo. This is the SSRF boundary for this command.
    if host.contains('/')
        || host.contains(':')
        || host.contains('@')
        || host.contains('?')
        || host.contains('#')
        || host.contains(' ')
    {
        return Err("The Clerk publishable key names an invalid frontend API host.".to_string());
    }
    if !host
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
    {
        return Err("The Clerk publishable key names an invalid frontend API host.".to_string());
    }

    Ok(host.to_string())
}

/// Allowlist the exact Clerk routes native Desktop sign-in needs.
///
/// Anything else — user updates, organization routes, sign-ups, arbitrary
/// paths — is refused, so a compromised webview cannot turn this command into
/// a general-purpose Clerk client.
fn validate_clerk_path(path: &str) -> Result<(), String> {
    if !path.starts_with('/') || path.contains("..") || path.contains("//") {
        return Err("Refusing an unsupported Clerk request path.".to_string());
    }
    if !path
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-'))
    {
        return Err("Refusing an unsupported Clerk request path.".to_string());
    }

    // /v1/client/sign_ins
    // /v1/client/sign_ins/{id}
    // /v1/client/sign_ins/{id}/{prepare_first_factor|attempt_first_factor|
    //                            prepare_second_factor|attempt_second_factor}
    // /v1/client/sessions/{id}/tokens
    let segments: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    let allowed = match segments.as_slice() {
        ["v1", "client", "sign_ins"] => true,
        ["v1", "client", "sign_ins", id] => !id.is_empty(),
        ["v1", "client", "sign_ins", id, action] => {
            !id.is_empty()
                && matches!(
                    *action,
                    "prepare_first_factor"
                        | "attempt_first_factor"
                        | "prepare_second_factor"
                        | "attempt_second_factor"
                )
        }
        ["v1", "client", "sessions", id, "tokens"] => !id.is_empty(),
        _ => false,
    };

    if allowed {
        Ok(())
    } else {
        Err("Refusing an unsupported Clerk request path.".to_string())
    }
}

fn clerk_query_params(extra: Option<&str>) -> Result<HashMap<String, String>, String> {
    let mut params = HashMap::new();
    params.insert("__clerk_api_version".to_string(), CLERK_API_VERSION.to_string());
    params.insert("_clerk_js_version".to_string(), CLERK_JS_VERSION.to_string());
    params.insert("_is_native".to_string(), "1".to_string());

    // The only caller-supplied query parameter native sign-in needs is the
    // SSO callback's `rotating_token_nonce`. Keep the allowlist tight.
    if let Some(raw) = extra {
        for pair in raw.trim_start_matches('?').split('&') {
            if pair.is_empty() {
                continue;
            }
            let (name, value) = pair
                .split_once('=')
                .ok_or_else(|| "Refusing a malformed Clerk query parameter.".to_string())?;
            if name != "rotating_token_nonce" {
                return Err("Refusing an unsupported Clerk query parameter.".to_string());
            }
            let decoded = urlencoding::decode(value)
                .map_err(|_| "Refusing a malformed Clerk query parameter.".to_string())?
                .into_owned();
            if decoded.len() > 512 {
                return Err("Refusing an oversized Clerk query parameter.".to_string());
            }
            params.insert(name.to_string(), decoded);
        }
    }

    Ok(params)
}

fn response_client_token(response: &ApiResponse) -> Option<String> {
    response
        .headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("authorization"))
        .map(|(_, value)| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// Perform one native Clerk Frontend API call on behalf of the Desktop
/// sign-in form.
///
/// `body` is already `application/x-www-form-urlencoded` — the wire format
/// Clerk's own client uses — and is passed through untouched. It may contain a
/// password or a one-time code; it is never logged and never written to disk.
#[tauri::command]
#[allow(non_snake_case)]
pub async fn account_clerk_native_request(
    publishableKey: String,
    method: String,
    path: String,
    body: Option<String>,
    clientToken: Option<String>,
    search: Option<String>,
    state: State<'_, ApiState>,
) -> Result<ClerkNativeHttpResponse, String> {
    let frontend_api = frontend_api_from_publishable_key(&publishableKey)?;
    validate_clerk_path(&path)?;

    let http_method = match method.to_ascii_uppercase().as_str() {
        "GET" => HttpMethod::Get,
        "POST" => HttpMethod::Post,
        other => return Err(format!("Refusing an unsupported Clerk request method: {other}")),
    };

    let mut headers = HashMap::from([
        (
            "Content-Type".to_string(),
            "application/x-www-form-urlencoded".to_string(),
        ),
        ("Accept".to_string(), "application/json".to_string()),
        // Clerk's native clients identify themselves; without this some
        // instances treat the request as a browser one and expect cookies.
        ("x-native-app".to_string(), "1".to_string()),
    ]);
    if let Some(token) = clientToken.as_ref().map(|t| t.trim()).filter(|t| !t.is_empty()) {
        if token.len() > 8192 {
            return Err("The Clerk client credential is too large.".to_string());
        }
        headers.insert("authorization".to_string(), token.to_string());
    }

    let request = ApiRequest {
        method: http_method,
        url: format!("https://{frontend_api}{path}"),
        headers,
        query_params: clerk_query_params(search.as_deref())?,
        body,
        auth: AuthType::None,
        timeout_ms: Some(30_000),
    };

    let client = state.get_single_attempt_client()?;
    let response = client.execute(request).await.map_err(|error| {
        // Transport failure. Say it is a transport failure — the caller maps
        // this to a network message, never to "your account was rejected".
        format!("Could not reach the AGI account service: {error}")
    })?;

    Ok(ClerkNativeHttpResponse {
        status: response.status,
        client_token: response_client_token(&response),
        body: response.body,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_key(prefix: &str, host: &str) -> String {
        let encoded = base64::engine::general_purpose::STANDARD.encode(format!("{host}$"));
        format!("{prefix}{}", encoded.trim_end_matches('='))
    }

    #[test]
    fn decodes_a_live_publishable_key() {
        let key = build_key("pk_live_", "clerk.agiworkforce.com");
        assert_eq!(
            frontend_api_from_publishable_key(&key).unwrap(),
            "clerk.agiworkforce.com"
        );
    }

    #[test]
    fn decodes_a_test_publishable_key() {
        let key = build_key("pk_test_", "cheerful-cow-42.clerk.accounts.dev");
        assert_eq!(
            frontend_api_from_publishable_key(&key).unwrap(),
            "cheerful-cow-42.clerk.accounts.dev"
        );
    }

    #[test]
    fn rejects_a_key_without_the_clerk_prefix() {
        assert!(frontend_api_from_publishable_key("sk_live_whatever").is_err());
    }

    #[test]
    fn rejects_a_key_that_smuggles_a_path_or_port() {
        let key = build_key("pk_live_", "clerk.example.com:8080/evil");
        assert!(frontend_api_from_publishable_key(&key).is_err());
    }

    #[test]
    fn rejects_a_key_without_the_dollar_terminator() {
        let encoded = base64::engine::general_purpose::STANDARD.encode("clerk.example.com");
        let key = format!("pk_live_{}", encoded.trim_end_matches('='));
        assert!(frontend_api_from_publishable_key(&key).is_err());
    }

    #[test]
    fn allows_only_the_native_sign_in_routes() {
        assert!(validate_clerk_path("/v1/client/sign_ins").is_ok());
        assert!(validate_clerk_path("/v1/client/sign_ins/sia_123").is_ok());
        assert!(validate_clerk_path("/v1/client/sign_ins/sia_123/attempt_first_factor").is_ok());
        assert!(validate_clerk_path("/v1/client/sign_ins/sia_123/prepare_second_factor").is_ok());
        assert!(validate_clerk_path("/v1/client/sessions/sess_123/tokens").is_ok());

        assert!(validate_clerk_path("/v1/me").is_err());
        assert!(validate_clerk_path("/v1/client/sign_ups").is_err());
        assert!(validate_clerk_path("/v1/client/sign_ins/sia_1/../../me").is_err());
        assert!(validate_clerk_path("v1/client/sign_ins").is_err());
        assert!(validate_clerk_path("/v1/client/sessions/sess_1/end").is_err());
    }

    #[test]
    fn pins_the_native_query_contract() {
        let params = clerk_query_params(None).unwrap();
        assert_eq!(params.get("_is_native").map(String::as_str), Some("1"));
        assert_eq!(
            params.get("__clerk_api_version").map(String::as_str),
            Some(CLERK_API_VERSION)
        );
        assert_eq!(
            params.get("_clerk_js_version").map(String::as_str),
            Some(CLERK_JS_VERSION)
        );
    }

    #[test]
    fn accepts_only_the_sso_callback_nonce_as_extra_query() {
        let params = clerk_query_params(Some("rotating_token_nonce=abc123")).unwrap();
        assert_eq!(
            params.get("rotating_token_nonce").map(String::as_str),
            Some("abc123")
        );
        assert!(clerk_query_params(Some("redirect_url=https://evil.example")).is_err());
    }

    #[test]
    fn reads_the_rotated_client_token_case_insensitively() {
        let response = ApiResponse {
            status: 200,
            headers: HashMap::from([("Authorization".to_string(), " client_jwt ".to_string())]),
            body: "{}".to_string(),
            duration_ms: 1,
            success: true,
        };
        assert_eq!(
            response_client_token(&response),
            Some("client_jwt".to_string())
        );
    }

    #[test]
    fn omits_an_empty_client_token_header() {
        let response = ApiResponse {
            status: 200,
            headers: HashMap::from([("authorization".to_string(), "".to_string())]),
            body: "{}".to_string(),
            duration_ms: 1,
            success: true,
        };
        assert_eq!(response_client_token(&response), None);
    }
}
