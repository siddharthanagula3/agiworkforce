use agiworkforce_model_registry::{
    AutoRouteDecision, AutoRoutingRequest, RouteCommercialStatus, RoutingTaskType, TrustMode,
    resolve_auto_route, route_pricing,
};

fn generated_registry() -> serde_json::Value {
    serde_json::from_str(include_str!("../src/generated/model_registry.json"))
        .expect("generated model registry JSON should parse independently")
}

struct MultiRouteModel {
    model_key: String,
    default_route_id: String,
    alternate_route_id: String,
}

fn multi_route_model() -> MultiRouteModel {
    let registry = generated_registry();
    let routes = registry["routes"]
        .as_object()
        .expect("generated registry should expose routes")
        .clone();
    let model_key = routes
        .values()
        .map(|route| {
            route["modelKey"]
                .as_str()
                .expect("every route names a model")
                .to_owned()
        })
        .find(|model_key| {
            routes
                .values()
                .filter(|route| route["modelKey"].as_str() == Some(model_key))
                .count()
                > 1
        })
        .expect("the generated registry should carry a model with several routes");

    let find = |is_default: bool| {
        routes
            .iter()
            .find(|(_, route)| {
                route["modelKey"].as_str() == Some(model_key.as_str())
                    && route["isDefault"].as_bool() == Some(is_default)
            })
            .map(|(route_id, _)| route_id.clone())
            .expect("the model should carry both a default and an additional route")
    };

    MultiRouteModel {
        default_route_id: find(true),
        alternate_route_id: find(false),
        model_key,
    }
}

#[test]
fn every_route_carries_its_own_price_sheet() {
    let model = multi_route_model();
    let default_pricing = route_pricing(&model.default_route_id)
        .expect("generated registry should load")
        .expect("the default route should be priced");
    let alternate_pricing = route_pricing(&model.alternate_route_id)
        .expect("generated registry should load")
        .expect("the additional route should be priced");

    assert!(default_pricing.input_per_million.is_some());
    assert!(default_pricing.output_per_million.is_some());
    assert!(alternate_pricing.input_per_million.is_some());
    assert!(alternate_pricing.output_per_million.is_some());
    assert!(alternate_pricing.cache_read_per_million.is_some());
    assert!(alternate_pricing.cache_write_per_million.is_some());
    assert_ne!(
        model.default_route_id, model.alternate_route_id,
        "an additional route is a second priced route on the same model"
    );
    assert_ne!(
        alternate_pricing.commercial_status,
        RouteCommercialStatus::Blocked
    );
    assert_eq!(
        route_pricing("not-a-provider/not-a-model").expect("generated registry should load"),
        None
    );
}

#[test]
fn an_explicit_selection_fails_over_within_its_own_model() {
    let model = multi_route_model();
    let decision = resolve_auto_route(&AutoRoutingRequest {
        selection: Some(&model.model_key),
        task_type: RoutingTaskType::Coding,
        subscription_tier: Some("max"),
        trust_mode: TrustMode::Byok,
        ..AutoRoutingRequest::default()
    })
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.route_id, model.default_route_id);
    assert!(!selected.fallbacks.is_empty());
    for fallback in &selected.fallbacks {
        assert_eq!(fallback.model_key, model.model_key);
        assert_ne!(fallback.route_id, selected.route_id);
        assert_ne!(fallback.provider, selected.provider);
    }
}

#[test]
fn a_trust_mode_the_additional_harness_cannot_serve_sees_one_route_only() {
    let model = multi_route_model();
    let decision = resolve_auto_route(&AutoRoutingRequest {
        selection: Some(&model.model_key),
        task_type: RoutingTaskType::Coding,
        subscription_tier: Some("max"),
        trust_mode: TrustMode::ManagedCloud,
        ..AutoRoutingRequest::default()
    })
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    assert_eq!(selected.route_id, model.default_route_id);
    assert!(selected.fallbacks.is_empty());
}

#[test]
fn same_model_routes_come_before_any_model_substitution() {
    let decision = resolve_auto_route(&AutoRoutingRequest {
        selection: Some("auto-balanced"),
        task_type: RoutingTaskType::Coding,
        subscription_tier: Some("max"),
        trust_mode: TrustMode::Byok,
        ..AutoRoutingRequest::default()
    })
    .expect("generated registry should load");

    let AutoRouteDecision::Selected(selected) = decision else {
        panic!("expected selected route");
    };
    let own_model_fallbacks = selected
        .fallbacks
        .iter()
        .take_while(|fallback| fallback.model_key == selected.model_key)
        .count();
    assert!(own_model_fallbacks > 0);
    assert!(
        selected.fallbacks[own_model_fallbacks..]
            .iter()
            .all(|fallback| fallback.model_key != selected.model_key)
    );
}

#[test]
fn ranking_is_stable_across_repeated_resolutions() {
    let model = multi_route_model();
    let route_ids = (0..20)
        .map(|_| {
            let decision = resolve_auto_route(&AutoRoutingRequest {
                selection: Some(&model.model_key),
                task_type: RoutingTaskType::Coding,
                subscription_tier: Some("max"),
                trust_mode: TrustMode::Byok,
                estimated_input_tokens: Some(100_000),
                estimated_output_tokens: Some(1_000),
                ..AutoRoutingRequest::default()
            })
            .expect("generated registry should load");
            let AutoRouteDecision::Selected(selected) = decision else {
                panic!("expected selected route");
            };
            selected.route_id
        })
        .collect::<Vec<_>>();

    assert!(route_ids.iter().all(|route_id| route_id == &route_ids[0]));
    assert_eq!(route_ids[0], model.default_route_id);
}
