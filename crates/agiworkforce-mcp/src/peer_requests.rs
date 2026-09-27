use serde_json::{Value, json};

use crate::elicitation::ElicitationRequest;
use crate::hooks::ClientHooks;
use crate::protocol::{INVALID_PARAMS, METHOD_NOT_FOUND, RpcError};

pub(crate) async fn answer(
    server: &str,
    hooks: &ClientHooks,
    method: &str,
    id: Value,
    params: Option<Value>,
) -> Value {
    match method {
        "ping" => json!({ "jsonrpc": "2.0", "id": id, "result": {} }),
        "elicitation/create" => {
            match serde_json::from_value::<ElicitationRequest>(params.unwrap_or(Value::Null)) {
                Ok(request) => {
                    let response = hooks.elicitation.handle(server, request).await;
                    json!({ "jsonrpc": "2.0", "id": id, "result": response })
                }
                Err(error) => RpcError::new(
                    INVALID_PARAMS,
                    format!("Invalid elicitation request: {error}"),
                )
                .to_response(Some(&id)),
            }
        }
        _ => RpcError::new(
            METHOD_NOT_FOUND,
            format!("This client does not handle '{method}'"),
        )
        .to_response(Some(&id)),
    }
}

pub(crate) fn server_request(frame: &Value) -> Option<(String, Value, Option<Value>)> {
    let method = frame.get("method")?.as_str()?.to_string();
    let id = frame.get("id")?.clone();
    Some((method, id, frame.get("params").cloned()))
}

pub(crate) fn notification(frame: &Value) -> Option<(String, Value)> {
    if frame.get("id").is_some() {
        return None;
    }
    let method = frame.get("method")?.as_str()?.to_string();
    Some((method, frame.get("params").cloned().unwrap_or(Value::Null)))
}
