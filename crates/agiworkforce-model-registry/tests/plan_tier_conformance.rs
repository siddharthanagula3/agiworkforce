//! The registry crate's half of the plan-tier conformance fixture.
//!
//! `packages/contracts/types/src/__tests__/fixtures/plan-tier-conformance.json`
//! records what every copy of the plan-tier rules answers today, per spelling;
//! the TypeScript suite `plan-tier-conformance.test.ts` documents the contract.
//! This crate owns one copy, `registry.routesLike`: the Auto resolver's private
//! tier normaliser. It cannot be called directly, so the answer is observed the
//! only way a caller can: the plan buckets the resolver treats identically to
//! the spelling, over every alias, task, trust mode and US-only setting.
//!
//! Regenerate with `AGI_UPDATE_PLAN_CONFORMANCE=1`, after the TypeScript suite
//! has written the spellings and before it runs again to refresh `differs`.

use std::collections::BTreeMap;

use agiworkforce_model_registry::{
    AutoRouteDecision, AutoRoutingRequest, RoutingTaskType, TrustMode, resolve_auto_route,
};
use serde_json::{Map, Value, json};

const RECORDED: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../packages/contracts/types/src/__tests__/fixtures/plan-tier-conformance.json"
));
const FIXTURE_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../packages/contracts/types/src/__tests__/fixtures/plan-tier-conformance.json"
);
const REGISTRY: &str = include_str!("../src/generated/model_registry.json");
const UPDATE_ENV: &str = "AGI_UPDATE_PLAN_CONFORMANCE";
const COPY_ID: &str = "registry.routesLike";

const TASKS: [RoutingTaskType; 11] = [
    RoutingTaskType::SimpleChat,
    RoutingTaskType::General,
    RoutingTaskType::Coding,
    RoutingTaskType::Reasoning,
    RoutingTaskType::CreativeWriting,
    RoutingTaskType::Multimodal,
    RoutingTaskType::LongContext,
    RoutingTaskType::Research,
    RoutingTaskType::Agentic,
    RoutingTaskType::ComputerUse,
    RoutingTaskType::ImageGeneration,
];
const TRUST_MODES: [TrustMode; 2] = [TrustMode::Byok, TrustMode::ManagedCloud];

fn encode(decision: &AutoRouteDecision) -> String {
    match decision {
        AutoRouteDecision::Selected(selected) => format!(
            "selected;{};{};{:?};{:?};{:?};{}",
            selected.model_key,
            selected.route_id,
            selected.reason,
            selected.requested_profile,
            selected.effective_profile,
            selected
                .fallbacks
                .iter()
                .map(|fallback| fallback.model_key.as_str())
                .collect::<Vec<_>>()
                .join(",")
        ),
        AutoRouteDecision::Unavailable(unavailable) => format!(
            "unavailable;{:?};{:?};{:?}",
            unavailable.code, unavailable.requested_profile, unavailable.effective_profile
        ),
    }
}

fn routing_signature(tier: &str, aliases: &[String]) -> String {
    let mut signature = String::new();
    for alias in aliases {
        for task in TASKS {
            for trust_mode in TRUST_MODES {
                for us_only in [false, true] {
                    let request = AutoRoutingRequest {
                        selection: Some(alias),
                        task_type: task,
                        subscription_tier: Some(tier),
                        trust_mode,
                        us_only,
                        ..Default::default()
                    };
                    let decision =
                        resolve_auto_route(&request).expect("generated registry should load");
                    signature.push_str(&encode(&decision));
                    signature.push('\n');
                }
            }
        }
    }
    signature
}

fn routes_like(spelling: &str, buckets: &[(String, String)], aliases: &[String]) -> Value {
    let signature = routing_signature(spelling, aliases);
    let mut like: Vec<&str> = buckets
        .iter()
        .filter(|(_, bucket_signature)| *bucket_signature == signature)
        .map(|(bucket, _)| bucket.as_str())
        .collect();
    like.sort_unstable();
    json!(like)
}

fn sorted(value: Value) -> Value {
    match value {
        Value::Object(map) => Value::Object(
            map.into_iter()
                .collect::<BTreeMap<_, _>>()
                .into_iter()
                .map(|(key, inner)| (key, sorted(inner)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.into_iter().map(sorted).collect()),
        other => other,
    }
}

fn rows(fixture: &Value) -> &Map<String, Value> {
    fixture["rows"]
        .as_object()
        .expect("plan conformance fixture has no rows")
}

#[test]
fn the_auto_resolver_buckets_every_recorded_spelling_as_recorded() {
    let registry: Value = serde_json::from_str(REGISTRY).expect("generated registry should parse");
    let auto = &registry["policies"]["auto"];
    let aliases: Vec<String> = auto["aliases"]
        .as_object()
        .expect("registry aliases")
        .keys()
        .cloned()
        .collect();
    let buckets: Vec<(String, String)> = auto["tierAllowedSlots"]
        .as_object()
        .expect("registry tierAllowedSlots")
        .keys()
        .map(|bucket| (bucket.clone(), routing_signature(bucket, &aliases)))
        .collect();

    let updating = std::env::var(UPDATE_ENV).is_ok_and(|value| value == "1");
    let text = if updating {
        std::fs::read_to_string(FIXTURE_PATH).expect("plan conformance fixture should read")
    } else {
        RECORDED.to_string()
    };
    let mut fixture: Value = serde_json::from_str(&text).expect("plan conformance fixture parses");

    if updating {
        fixture["copies"][COPY_ID] = json!({
            "language": "rust",
            "scope": "spelling",
            "question": "resolverBucket",
            "source": "crates/agiworkforce-model-registry/src/lib.rs normalize_tier, observed through resolve_auto_route",
        });
        let spellings: Vec<String> = rows(&fixture).keys().cloned().collect();
        for spelling in spellings {
            fixture["rows"][spelling.as_str()]["answers"][COPY_ID] =
                routes_like(&spelling, &buckets, &aliases);
        }
        let text = serde_json::to_string_pretty(&sorted(fixture))
            .expect("plan conformance fixture should serialise");
        std::fs::write(FIXTURE_PATH, format!("{text}\n"))
            .expect("plan conformance fixture should write");
        return;
    }

    assert!(
        !rows(&fixture).is_empty(),
        "plan conformance fixture has no rows; regenerate it with {UPDATE_ENV}=1"
    );
    let drifted = rows(&fixture)
        .iter()
        .filter_map(|(spelling, row)| {
            let recorded = row["answers"].get(COPY_ID);
            let actual = routes_like(spelling, &buckets, &aliases);
            (recorded != Some(&actual)).then(|| {
                format!(
                    "{spelling:?}: recorded {}, now {actual}",
                    recorded.map_or("nothing".to_string(), Value::to_string)
                )
            })
        })
        .collect::<Vec<_>>();

    assert!(
        drifted.is_empty(),
        "{} of {} spellings route differently than recorded; regenerate with {UPDATE_ENV}=1:\n{}",
        drifted.len(),
        rows(&fixture).len(),
        drifted.join("\n")
    );
}
