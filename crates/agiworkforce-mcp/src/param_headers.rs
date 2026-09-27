use std::collections::HashSet;

use serde_json::{Map, Value};

use crate::protocol::{HEADER_PARAM_PREFIX, encode_header_value};

const X_MCP_HEADER: &str = "x-mcp-header";
const INSTANCE_KEYWORDS: &[&str] = &["enum", "const", "default", "examples"];
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ParamHeader {
    name: String,
    path: Vec<String>,
}

pub(crate) fn scan(input_schema: &Value) -> Result<Vec<ParamHeader>, String> {
    let mut found = Vec::new();
    let mut seen = HashSet::new();
    walk(input_schema, &mut Vec::new(), true, &mut found, &mut seen)?;
    Ok(found)
}

fn walk(
    node: &Value,
    path: &mut Vec<String>,
    reachable: bool,
    found: &mut Vec<ParamHeader>,
    seen: &mut HashSet<String>,
) -> Result<(), String> {
    match node {
        Value::Object(schema) => {
            if let Some(raw) = schema.get(X_MCP_HEADER) {
                found.push(declaration(schema, raw, path, reachable, seen)?);
            }
            for (key, child) in schema {
                match (key.as_str(), child) {
                    ("properties", Value::Object(properties)) => {
                        for (property, subschema) in properties {
                            path.push(property.clone());
                            walk(subschema, path, reachable, found, seen)?;
                            path.pop();
                        }
                    }
                    (keyword, _)
                        if keyword == X_MCP_HEADER || INSTANCE_KEYWORDS.contains(&keyword) => {}
                    _ => walk(child, path, false, found, seen)?,
                }
            }
            Ok(())
        }
        Value::Array(items) => items
            .iter()
            .try_for_each(|item| walk(item, path, false, found, seen)),
        _ => Ok(()),
    }
}

fn declaration(
    schema: &Map<String, Value>,
    raw: &Value,
    path: &[String],
    reachable: bool,
    seen: &mut HashSet<String>,
) -> Result<ParamHeader, String> {
    let at = if path.is_empty() {
        "inputSchema".to_string()
    } else {
        path.join(".")
    };
    if !reachable || path.is_empty() {
        return Err(format!(
            "{at}: x-mcp-header is only allowed on properties reached through a chain of 'properties' keys"
        ));
    }
    let name = raw
        .as_str()
        .filter(|name| !name.is_empty())
        .ok_or_else(|| format!("{at}: x-mcp-header must be a non-empty string"))?;
    if !name.bytes().all(is_token_char) {
        return Err(format!(
            "{at}: x-mcp-header '{name}' is not a valid HTTP field name"
        ));
    }
    if !matches!(
        schema.get("type").and_then(Value::as_str),
        Some("string" | "integer" | "boolean")
    ) {
        return Err(format!(
            "{at}: x-mcp-header is only allowed on string, integer or boolean properties"
        ));
    }
    if !seen.insert(name.to_ascii_lowercase()) {
        return Err(format!("x-mcp-header '{name}' is declared more than once"));
    }
    Ok(ParamHeader {
        name: name.to_string(),
        path: path.to_vec(),
    })
}

fn is_token_char(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || b"!#$%&'*+-.^_`|~".contains(&byte)
}

pub(crate) fn header_values(
    declarations: &[ParamHeader],
    arguments: &Value,
) -> Vec<(String, String)> {
    declarations
        .iter()
        .filter_map(|declaration| {
            let value = declaration
                .path
                .iter()
                .try_fold(arguments, |node, key| node.get(key))?;
            let rendered = match value {
                Value::String(text) => text.clone(),
                Value::Bool(flag) => flag.to_string(),
                Value::Number(number) => number
                    .as_i64()
                    .filter(|integer| integer.unsigned_abs() <= MAX_SAFE_INTEGER)?
                    .to_string(),
                _ => return None,
            };
            Some((
                format!("{HEADER_PARAM_PREFIX}{}", declaration.name),
                encode_header_value(&rendered),
            ))
        })
        .collect()
}
