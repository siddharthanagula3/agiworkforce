use std::time::Duration;

use serde_json::{json, Value};

use super::client::CloudClient;
use crate::platform::runtime::session::PrivacyMode;

const CONTRACT: &str =
    include_str!("../../../../packages/contracts/types/src/product-analytics.ts");
const SEND_TIMEOUT: Duration = Duration::from_secs(3);

fn contract_string(name: &str) -> Option<&'static str> {
    CONTRACT.lines().find_map(|line| {
        line.trim()
            .strip_prefix(&format!("export const {name} = '"))
            .and_then(|rest| rest.strip_suffix("';"))
    })
}

fn contract_list(name: &str) -> Vec<&'static str> {
    let Some(start) = CONTRACT.find(&format!("export const {name} = [")) else {
        return Vec::new();
    };
    let body = &CONTRACT[start..];
    let body = &body[body.find('[').unwrap_or(0) + 1..body.find(']').unwrap_or(0)];
    body.split(',')
        .map(|item| item.trim().trim_matches('\''))
        .filter(|item| !item.is_empty())
        .collect()
}

fn consent_granted(body: &Value) -> bool {
    let Some(purpose) = contract_string("PRODUCT_ANALYTICS_CONSENT_PURPOSE") else {
        return false;
    };
    body.get("consents")
        .and_then(Value::as_array)
        .is_some_and(|consents| {
            consents.iter().any(|record| {
                record.get("purpose").and_then(Value::as_str) == Some(purpose)
                    && record.get("granted").and_then(Value::as_bool) == Some(true)
            })
        })
}

async fn send(privacy: PrivacyMode, name: &'static str) {
    if !contract_list("PRODUCT_ANALYTICS_EVENT_NAMES").contains(&name) {
        return;
    }
    let (Some(consent_path), Some(ingest_path)) = (
        contract_string("PRODUCT_ANALYTICS_CONSENT_PATH"),
        contract_string("PRODUCT_ANALYTICS_INGEST_PATH"),
    ) else {
        return;
    };
    let Ok(client) = CloudClient::connect(privacy) else {
        return;
    };
    let Ok(consents) = client.get::<Value>(consent_path, &[]).await else {
        return;
    };
    if !consent_granted(&consents) {
        return;
    }
    let body = json!({
        "events": [{
            "name": name,
            "surface": "cli",
            "occurredAt": chrono::Utc::now().to_rfc3339(),
        }],
    });
    let _ = client.post::<_, Value>(ingest_path, &body).await;
}

pub async fn record(privacy: PrivacyMode, name: &'static str) {
    if privacy != PrivacyMode::Managed {
        return;
    }
    let _ = tokio::time::timeout(SEND_TIMEOUT, send(privacy, name)).await;
}
