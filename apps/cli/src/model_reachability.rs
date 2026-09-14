//! Which models this machine can reach.

use std::collections::HashMap;

use agiworkforce_protocol::developer_session::{
    DeveloperSessionTrustMode, HostModelSummary, ModelUnreachable, TurnFailureCode,
};

use crate::config::CliConfig;

/// Route names that are a trust boundary rather than an upstream vendor.
const MANAGED_PROVIDER: &str = "managed_cloud";

fn trust_mode_for(provider: &str) -> DeveloperSessionTrustMode {
    match provider {
        MANAGED_PROVIDER | "agi" | "agiworkforce" => DeveloperSessionTrustMode::Managed,
        "ollama" | "lmstudio" => DeveloperSessionTrustMode::Local,
        _ => DeveloperSessionTrustMode::Byok,
    }
}

/// `None` when the route can run; otherwise why it cannot.
fn route_verdict(config: &CliConfig, provider_name: &str) -> Option<ModelUnreachable> {
    let Some(provider) = crate::models::provider_from_name(provider_name) else {
        return Some(ModelUnreachable {
            code: TurnFailureCode::InvalidRequest,
            action: TurnFailureCode::InvalidRequest.default_action(),
            provider: Some(provider_name.to_string()),
        });
    };
    match crate::models::resolve_key(config, &provider) {
        Ok(_) => None,
        Err(error) => {
            let failure = error
                .chain()
                .find_map(|cause| cause.downcast_ref::<crate::errors::CliError>())
                .map(crate::errors::CliError::turn_failure)
                .unwrap_or_else(
                    || -> agiworkforce_protocol::developer_session::TurnFailure {
                        agiworkforce_protocol::developer_session::TurnFailure::new(
                            TurnFailureCode::Unknown,
                            error.to_string(),
                        )
                    },
                );
            Some(ModelUnreachable {
                code: failure.code,
                action: failure.action,
                provider: failure.provider.or_else(|| Some(provider_name.to_string())),
            })
        }
    }
}

/// Models a local runtime is serving right now, as (id, provider).
async fn running_local_models(config: &CliConfig) -> Vec<(String, String)> {
    crate::local_models::discovered_models(&crate::local_models::discover_all(config).await)
        .into_iter()
        .map(|model| (model.id, model.provider))
        .collect()
}

/// Every model this host knows about, each with its verdict.
pub async fn host_models(config: &CliConfig) -> Vec<HostModelSummary> {
    let local = running_local_models(config).await;
    let mut verdicts: HashMap<String, Option<ModelUnreachable>> = HashMap::new();
    let mut summaries: Vec<HostModelSummary> = Vec::new();
    let mut seen: HashMap<String, ()> = HashMap::new();

    for model in crate::model_catalog::catalog().all() {
        let provider = model.provider.clone();
        let verdict = verdicts
            .entry(provider.clone())
            .or_insert_with(|| route_verdict(config, &provider))
            .clone();
        if seen.insert(model.id.clone(), ()).is_some() {
            continue;
        }
        summaries.push(HostModelSummary {
            id: model.id.clone(),
            provider: provider.clone(),
            reachable: verdict.is_none(),
            unreachable: verdict,
            trust_mode: trust_mode_for(&provider),
        });
    }

    for (id, provider) in local {
        if seen.insert(id.clone(), ()).is_some() {
            continue;
        }
        summaries.push(HostModelSummary {
            id,
            provider: provider.clone(),
            reachable: true,
            unreachable: None,
            trust_mode: trust_mode_for(&provider),
        });
    }

    summaries.sort_by(|left, right| {
        right
            .reachable
            .cmp(&left.reachable)
            .then_with(|| left.provider.cmp(&right.provider))
            .then_with(|| left.id.cmp(&right.id))
    });
    summaries
}

#[cfg(test)]
mod tests {
    use super::*;
    use agiworkforce_protocol::developer_session::TurnFailureAction;

    #[test]
    fn a_routes_verdict_is_the_one_a_turn_would_produce() {
        let config = CliConfig::default();
        for provider_name in ["anthropic", "openai", "google", "deepseek", "ollama"] {
            let Some(provider) = crate::models::provider_from_name(provider_name) else {
                continue;
            };
            let from_turn = crate::models::resolve_key(&config, &provider);
            let from_list = route_verdict(&config, provider_name);
            assert_eq!(
                from_turn.is_ok(),
                from_list.is_none(),
                "{provider_name}: the list and a turn disagree about whether it can run"
            );
            if let (Err(error), Some(listed)) = (from_turn, from_list.as_ref()) {
                let turn_failure = error
                    .chain()
                    .find_map(|cause| cause.downcast_ref::<crate::errors::CliError>())
                    .map(crate::errors::CliError::turn_failure);
                if let Some(turn_failure) = turn_failure {
                    assert_eq!(
                        listed.code, turn_failure.code,
                        "{provider_name}: the list's code differs from the turn's"
                    );
                    assert_eq!(listed.action, turn_failure.action);
                }
            }
        }
    }

    #[test]
    fn a_route_with_no_credential_says_which_problem_it_is() {
        let config = CliConfig::default();
        let verdict = route_verdict(&config, "anthropic");
        if let Some(unreachable) = verdict {
            assert!(matches!(
                unreachable.code,
                TurnFailureCode::ProviderAuthMissing | TurnFailureCode::ProviderAuthInvalid
            ));
            assert_eq!(unreachable.action, TurnFailureAction::SignInProvider);
            assert_eq!(unreachable.provider.as_deref(), Some("anthropic"));
        }
    }

    #[test]
    fn an_unknown_route_is_not_reported_as_a_missing_credential() {
        let verdict = route_verdict(&CliConfig::default(), "not-a-provider")
            .expect("an unknown route cannot be reachable");
        assert_eq!(verdict.code, TurnFailureCode::InvalidRequest);
        assert_eq!(verdict.action, TurnFailureAction::OpenSettings);
    }

    #[test]
    fn every_entry_carries_the_boundary_a_turn_would_cross() {
        assert_eq!(trust_mode_for("ollama"), DeveloperSessionTrustMode::Local);
        assert_eq!(trust_mode_for("lmstudio"), DeveloperSessionTrustMode::Local);
        assert_eq!(
            trust_mode_for(MANAGED_PROVIDER),
            DeveloperSessionTrustMode::Managed
        );
        assert_eq!(trust_mode_for("anthropic"), DeveloperSessionTrustMode::Byok);
        assert_eq!(trust_mode_for("deepseek"), DeveloperSessionTrustMode::Byok);
    }
}
