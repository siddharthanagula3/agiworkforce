use std::time::Duration;

use serde_json::{json, Value};

use super::client::CloudClient;
use crate::config::CliConfig;
use crate::platform::runtime::session::PrivacyMode;

const CONTRACT: &str =
    include_str!("../../../../packages/contracts/types/src/product-analytics.ts");
const SEND_TIMEOUT: Duration = Duration::from_secs(3);

fn env_opts_out(value: Option<&str>) -> bool {
    value.map(str::trim).is_some_and(|value| {
        !value.is_empty()
            && !matches!(
                value.to_ascii_lowercase().as_str(),
                "0" | "false" | "off" | "no"
            )
    })
}

fn enabled(config: &CliConfig) -> bool {
    config.telemetry.product_analytics
        && ![
            std::env::var("DISABLE_TELEMETRY").ok(),
            std::env::var("DO_NOT_TRACK").ok(),
        ]
        .iter()
        .any(|value| env_opts_out(value.as_deref()))
}

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
                    && record
                        .get("noticeVersion")
                        .and_then(Value::as_str)
                        .zip(contract_string("PRODUCT_ANALYTICS_NOTICE_VERSION"))
                        .is_some_and(|(recorded, required)| recorded >= required)
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

pub fn record(config: &CliConfig, privacy: PrivacyMode, name: &'static str) {
    if privacy != PrivacyMode::Managed || !enabled(config) {
        return;
    }
    tokio::spawn(async move {
        let _ = tokio::time::timeout(SEND_TIMEOUT, send(privacy, name)).await;
    });
}
