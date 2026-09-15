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

/// The route a turn would take for this model, and why it cannot run when it
/// cannot. One call, so the trust word and the verdict cannot disagree.
fn model_verdict(
    config: &CliConfig,
    account: &crate::models::AccountRoute,
    model: &str,
    catalog_provider: &str,
) -> (Option<ModelUnreachable>, DeveloperSessionTrustMode) {
    match crate::models::decide_turn_route(config, account, model, None) {
        crate::models::TurnRoute::Runnable(provider) => (
            None,
            trust_mode_for(crate::models::provider_name(&provider)),
        ),
        crate::models::TurnRoute::Blocked { error, .. } => {
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
            let trust = match failure.code {
                TurnFailureCode::AccountSignedOut | TurnFailureCode::PlanExcludesModel => {
                    DeveloperSessionTrustMode::Managed
                }
                _ => trust_mode_for(catalog_provider),
            };
            (
                Some(ModelUnreachable {
                    code: failure.code,
                    action: failure.action,
                    provider: failure.provider,
                }),
                trust,
            )
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
    crate::tier_cache::ensure_plan_models_cached().await;
    let account = crate::models::AccountRoute::load();
    let mut summaries: Vec<HostModelSummary> = Vec::new();
    let mut seen: HashMap<String, ()> = HashMap::new();

    for model in crate::model_catalog::catalog().all() {
        if seen.insert(model.id.clone(), ()).is_some() {
            continue;
        }
        let (verdict, trust_mode) = model_verdict(config, &account, &model.id, &model.provider);
        summaries.push(HostModelSummary {
            id: model.id.clone(),
            provider: model.provider.clone(),
            reachable: verdict.is_none(),
            trust_mode,
            unreachable: verdict,
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
    use crate::models::AccountRoute;
    use crate::tier_cache::UserTier;
    use agiworkforce_protocol::developer_session::TurnFailureAction;

    fn signed_out() -> AccountRoute {
        AccountRoute::with(false, None)
    }

    fn subscriber(tier: UserTier) -> AccountRoute {
        AccountRoute::with(true, Some(tier))
    }

    fn cloud_eligible_model() -> Option<String> {
        crate::model_catalog::catalog()
            .all()
            .iter()
            .find(|model| {
                model.cloud_eligible
                    && crate::model_catalog::can_access_model_for_tier(&model.id, &UserTier::Max)
            })
            .map(|model| model.id.clone())
    }

    #[test]
    fn a_models_verdict_is_the_one_a_turn_would_produce() {
        let config = CliConfig::default();
        for account in [
            signed_out(),
            subscriber(UserTier::Max),
            subscriber(UserTier::Byok),
        ] {
            for model in crate::model_catalog::catalog().all().iter().take(40) {
                let from_turn =
                    crate::models::resolve_turn_route(&config, &account, &model.id, None);
                let from_list = model_verdict(&config, &account, &model.id, &model.provider).0;
                assert_eq!(
                    from_turn.is_ok(),
                    from_list.is_none(),
                    "{}: the list and a turn disagree about whether it can run",
                    model.id
                );
                if let (Err(error), Some(listed)) = (from_turn, from_list.as_ref()) {
                    let turn_failure = error
                        .chain()
                        .find_map(|cause| cause.downcast_ref::<crate::errors::CliError>())
                        .map(crate::errors::CliError::turn_failure);
                    if let Some(turn_failure) = turn_failure {
                        assert_eq!(listed.code, turn_failure.code, "{}", model.id);
                        assert_eq!(listed.action, turn_failure.action, "{}", model.id);
                    }
                }
            }
        }
    }

    #[test]
    fn a_subscription_runs_a_vendor_model_with_no_vendor_key() {
        let Some(model) = cloud_eligible_model() else {
            return;
        };
        let config = CliConfig::default();
        assert!(
            model_verdict(&config, &subscriber(UserTier::Max), &model, "openai")
                .0
                .is_none(),
            "{model}: a Max subscriber was told it cannot run a cloud-eligible model"
        );
        assert_eq!(
            model_verdict(&config, &subscriber(UserTier::Max), &model, "openai").1,
            DeveloperSessionTrustMode::Managed,
            "{model}: the list did not name the managed route"
        );
    }

    #[test]
    fn no_session_asks_for_the_account_rather_than_a_vendor_key() {
        let Some(model) = cloud_eligible_model() else {
            return;
        };
        let (verdict, trust) =
            model_verdict(&CliConfig::default(), &signed_out(), &model, "openai");
        let verdict = verdict.expect("no session and no key cannot be reachable");
        assert_eq!(trust, DeveloperSessionTrustMode::Managed);
        assert_eq!(verdict.code, TurnFailureCode::AccountSignedOut);
        assert_eq!(verdict.action, TurnFailureAction::SignInAccount);
    }

    #[test]
    fn a_plan_that_excludes_a_model_says_so_rather_than_naming_a_vendor() {
        let Some(model) = cloud_eligible_model() else {
            return;
        };
        let verdict = model_verdict(
            &CliConfig::default(),
            &subscriber(UserTier::Byok),
            &model,
            "openai",
        )
        .0
        .expect("a plan that excludes the model cannot be reachable");
        assert_eq!(verdict.code, TurnFailureCode::PlanExcludesModel);
        assert_eq!(verdict.action, TurnFailureAction::UpgradePlan);
    }

    #[test]
    fn a_route_the_subscription_cannot_serve_still_asks_for_its_own_key() {
        let config = CliConfig::default();
        let uncovered = crate::model_catalog::catalog()
            .all()
            .iter()
            .find(|model| !model.cloud_eligible && model.provider == "openrouter")
            .map(|model| model.id.clone());
        let Some(model) = uncovered else {
            return;
        };
        let verdict = model_verdict(&config, &subscriber(UserTier::Max), &model, "openrouter")
            .0
            .expect("a route with no key and no managed cover cannot be reachable");
        assert_eq!(verdict.code, TurnFailureCode::ProviderAuthMissing);
        assert_eq!(verdict.action, TurnFailureAction::SignInProvider);
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
