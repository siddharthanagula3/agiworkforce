use serde_json::{Map, Value, json};

use crate::protocol::{
    HEADER_PROTOCOL_VERSION, INVALID_PARAMS, Implementation, LEGACY_PROTOCOL_VERSIONS,
    META_CLIENT_CAPABILITIES, META_PROTOCOL_VERSION, META_SERVER_INFO, META_SUBSCRIPTION_ID,
    MODERN_PROTOCOL_VERSION, RESULT_COMPLETE, RpcError, decode_header_value, is_modern_version,
    supported_versions,
};

#[derive(Debug, Clone, PartialEq)]
pub enum RequestEra {
    Modern {
        protocol_version: String,
        client_capabilities: Map<String, Value>,
    },
    Legacy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CacheScope {
    Public,
    Private,
}

impl CacheScope {
    fn as_str(self) -> &'static str {
        match self {
            CacheScope::Public => "public",
            CacheScope::Private => "private",
        }
    }
}

pub fn classify_request(
    params: Option<&Value>,
    header_version: Option<&str>,
) -> Result<RequestEra, RpcError> {
    let meta = params
        .and_then(|params| params.get("_meta"))
        .and_then(Value::as_object);
    let Some(version) = meta
        .and_then(|meta| meta.get(META_PROTOCOL_VERSION))
        .and_then(Value::as_str)
    else {
        if header_version.is_some_and(is_modern_version) {
            return Err(RpcError::new(
                INVALID_PARAMS,
                format!("Missing required _meta field {META_PROTOCOL_VERSION}"),
            ));
        }
        return Ok(RequestEra::Legacy);
    };
    if let Some(header) = header_version
        && header != version
    {
        return Err(RpcError::header_mismatch(format!(
            "Header mismatch: {HEADER_PROTOCOL_VERSION} header value '{header}' does not match body value '{version}'"
        )));
    }
    if version != MODERN_PROTOCOL_VERSION {
        return Err(RpcError::unsupported_protocol_version(version));
    }
    let client_capabilities = meta
        .and_then(|meta| meta.get(META_CLIENT_CAPABILITIES))
        .and_then(Value::as_object)
        .cloned()
        .ok_or_else(|| {
            RpcError::new(
                INVALID_PARAMS,
                format!("Missing required _meta field {META_CLIENT_CAPABILITIES}"),
            )
        })?;
    Ok(RequestEra::Modern {
        protocol_version: version.to_string(),
        client_capabilities,
    })
}

pub fn validate_standard_headers(
    method: &str,
    params: Option<&Value>,
    header_method: Option<&str>,
    header_name: Option<&str>,
) -> Result<(), RpcError> {
    match header_method {
        None => {
            return Err(RpcError::header_mismatch(
                "Missing required Mcp-Method header",
            ));
        }
        Some(named) if named != method => {
            return Err(RpcError::header_mismatch(format!(
                "Header mismatch: Mcp-Method header value '{named}' does not match body method '{method}'"
            )));
        }
        Some(_) => {}
    }
    let field = match method {
        "tools/call" | "prompts/get" => "name",
        "resources/read" => "uri",
        _ => return Ok(()),
    };
    let Some(expected) = params
        .and_then(|params| params.get(field))
        .and_then(Value::as_str)
    else {
        return Ok(());
    };
    let Some(raw) = header_name else {
        return Err(RpcError::header_mismatch(
            "Missing required Mcp-Name header",
        ));
    };
    match decode_header_value(raw) {
        Some(named) if named == expected => Ok(()),
        Some(named) => Err(RpcError::header_mismatch(format!(
            "Header mismatch: Mcp-Name header value '{named}' does not match body value '{expected}'"
        ))),
        None => Err(RpcError::header_mismatch(
            "Mcp-Name header carries a malformed base64 value",
        )),
    }
}

pub fn negotiate_legacy_version(requested: Option<&str>) -> &'static str {
    requested
        .and_then(|want| {
            LEGACY_PROTOCOL_VERSIONS
                .iter()
                .find(|supported| **supported == want)
                .copied()
        })
        .unwrap_or(LEGACY_PROTOCOL_VERSIONS[0])
}

pub fn initialize_result(
    requested: Option<&str>,
    capabilities: Value,
    server: &Implementation,
) -> Value {
    json!({
        "protocolVersion": negotiate_legacy_version(requested),
        "capabilities": capabilities,
        "serverInfo": server,
    })
}

pub fn discover_result(capabilities: Value, ttl_ms: u64) -> Value {
    json!({
        "supportedVersions": supported_versions(),
        "capabilities": capabilities,
        "ttlMs": ttl_ms,
        "cacheScope": CacheScope::Public.as_str(),
    })
}

pub fn cacheable(result: Value, ttl_ms: u64, scope: CacheScope) -> Value {
    let mut object = into_object(result);
    object.insert("ttlMs".to_string(), json!(ttl_ms));
    object.insert("cacheScope".to_string(), json!(scope.as_str()));
    Value::Object(object)
}

pub fn complete(result: Value, server: &Implementation) -> Value {
    let mut object = into_object(result);
    object.insert("resultType".to_string(), json!(RESULT_COMPLETE));
    let meta = object
        .entry("_meta")
        .or_insert_with(|| Value::Object(Map::new()));
    if let Some(meta) = meta.as_object_mut() {
        meta.insert(META_SERVER_INFO.to_string(), json!(server));
    }
    Value::Object(object)
}

pub fn subscription_acknowledged(subscription_id: &Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "method": "notifications/subscriptions/acknowledged",
        "params": {
            "_meta": { META_SUBSCRIPTION_ID: subscription_id },
            "notifications": {},
        },
    })
}

pub fn subscription_closed(subscription_id: &Value, server: &Implementation) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": subscription_id,
        "result": complete(
            json!({ "_meta": { META_SUBSCRIPTION_ID: subscription_id } }),
            server,
        ),
    })
}

pub fn success(id: Option<&Value>, result: Value) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id.cloned().unwrap_or(Value::Null),
        "result": result,
    })
}

fn into_object(value: Value) -> Map<String, Value> {
    match value {
        Value::Object(object) => object,
        _ => Map::new(),
    }
}
