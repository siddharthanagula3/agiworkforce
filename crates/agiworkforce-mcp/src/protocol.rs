use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

pub const MODERN_PROTOCOL_VERSION: &str = "2026-07-28";

pub const LEGACY_PROTOCOL_VERSIONS: &[&str] =
    &["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

pub const META_PROTOCOL_VERSION: &str = "io.modelcontextprotocol/protocolVersion";
pub const META_CLIENT_INFO: &str = "io.modelcontextprotocol/clientInfo";
pub const META_CLIENT_CAPABILITIES: &str = "io.modelcontextprotocol/clientCapabilities";
pub const META_SERVER_INFO: &str = "io.modelcontextprotocol/serverInfo";
pub const META_SUBSCRIPTION_ID: &str = "io.modelcontextprotocol/subscriptionId";

pub const HEADER_PROTOCOL_VERSION: &str = "MCP-Protocol-Version";
pub const HEADER_METHOD: &str = "Mcp-Method";
pub const HEADER_NAME: &str = "Mcp-Name";
pub const HEADER_PARAM_PREFIX: &str = "Mcp-Param-";
pub const HEADER_SESSION_ID: &str = "Mcp-Session-Id";

pub const PARSE_ERROR: i64 = -32700;
pub const INVALID_REQUEST: i64 = -32600;
pub const METHOD_NOT_FOUND: i64 = -32601;
pub const INVALID_PARAMS: i64 = -32602;
pub const INTERNAL_ERROR: i64 = -32603;
pub const LEGACY_RESOURCE_NOT_FOUND: i64 = -32002;
pub const HEADER_MISMATCH: i64 = -32020;
pub const MISSING_REQUIRED_CLIENT_CAPABILITY: i64 = -32021;
pub const UNSUPPORTED_PROTOCOL_VERSION: i64 = -32022;

pub const RESULT_COMPLETE: &str = "complete";
pub const RESULT_INPUT_REQUIRED: &str = "input_required";

const BASE64_PREFIX: &str = "=?base64?";
const BASE64_SUFFIX: &str = "?=";

pub fn is_modern_version(version: &str) -> bool {
    is_revision_date(version) && version >= MODERN_PROTOCOL_VERSION
}

fn is_revision_date(version: &str) -> bool {
    let bytes = version.as_bytes();
    bytes.len() == 10
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            4 | 7 => *byte == b'-',
            _ => byte.is_ascii_digit(),
        })
}

pub fn supported_versions() -> Vec<&'static str> {
    std::iter::once(MODERN_PROTOCOL_VERSION)
        .chain(LEGACY_PROTOCOL_VERSIONS.iter().copied())
        .collect()
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Implementation {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RpcError {
    pub code: i64,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl RpcError {
    pub fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    pub fn unsupported_protocol_version(requested: &str) -> Self {
        Self {
            code: UNSUPPORTED_PROTOCOL_VERSION,
            message: "Unsupported protocol version".to_string(),
            data: Some(json!({
                "supported": supported_versions(),
                "requested": requested,
            })),
        }
    }

    pub fn header_mismatch(message: impl Into<String>) -> Self {
        Self::new(HEADER_MISMATCH, message)
    }

    pub fn supported_versions(&self) -> Option<Vec<String>> {
        if self.code != UNSUPPORTED_PROTOCOL_VERSION {
            return None;
        }
        let versions = self
            .data
            .as_ref()?
            .get("supported")?
            .as_array()?
            .iter()
            .map(|version| version.as_str().map(str::to_string))
            .collect::<Option<Vec<String>>>()?;
        (!versions.is_empty()).then_some(versions)
    }

    pub fn is_resource_not_found(&self) -> bool {
        self.code == INVALID_PARAMS || self.code == LEGACY_RESOURCE_NOT_FOUND
    }

    pub fn to_response(&self, id: Option<&Value>) -> Value {
        json!({
            "jsonrpc": "2.0",
            "id": id.cloned().unwrap_or(Value::Null),
            "error": self,
        })
    }
}

impl std::fmt::Display for RpcError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "MCP error {}: {}", self.code, self.message)
    }
}

impl std::error::Error for RpcError {}

pub fn encode_header_value(value: &str) -> String {
    let visible = value
        .bytes()
        .all(|byte| byte == b'\t' || (0x20..=0x7e).contains(&byte));
    let padded = value.starts_with([' ', '\t']) || value.ends_with([' ', '\t']);
    let looks_encoded = value.starts_with(BASE64_PREFIX) && value.ends_with(BASE64_SUFFIX);
    if visible && !padded && !looks_encoded {
        value.to_string()
    } else {
        format!("{BASE64_PREFIX}{}{BASE64_SUFFIX}", STANDARD.encode(value))
    }
}

pub fn decode_header_value(value: &str) -> Option<String> {
    match value
        .strip_prefix(BASE64_PREFIX)
        .and_then(|rest| rest.strip_suffix(BASE64_SUFFIX))
    {
        Some(encoded) => STANDARD
            .decode(encoded)
            .ok()
            .and_then(|bytes| String::from_utf8(bytes).ok()),
        None => Some(value.to_string()),
    }
}
