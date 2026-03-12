use crate::data::db::repository;
use crate::sys::commands::chat::state::AppDatabase;
use chrono::{Datelike, Utc};
use std::sync::Arc;
use tracing::{debug, info, warn};

/// Check billing subscription access and monthly budget limits.
/// Returns `Ok(())` if the request is allowed, `Err(String)` if blocked.
pub(super) fn check_billing_and_budget(
    #[cfg(feature = "billing")] billing_state: &tokio::sync::MutexGuard<
        '_,
        crate::sys::billing::BillingState,
    >,
    db: &AppDatabase,
    user_id: &str,
) -> Result<(), String> {
    #[cfg(feature = "billing")]
    {
        if !billing_state.check_cloud_access() {
            return Err(
                "Subscription required. Please upgrade to the Hobby plan to use the AGI agent."
                    .to_string(),
            );
        }
    }

    let conn = db
        .connection()
        .map_err(|e| format!("Budget check failed: {e}"))?;

    if let Ok(budget_setting) = repository::get_setting(&conn, "billing.monthly_budget") {
        if let Ok(budget_limit) = budget_setting.value.parse::<f64>() {
            if budget_limit > 0.0 {
                let now = Utc::now();
                let start_of_month = now
                    .date_naive()
                    .with_day(1)
                    .ok_or_else(|| "Failed to determine start of month".to_string())?
                    .and_hms_opt(0, 0, 0)
                    .ok_or_else(|| "Failed to set time for start of month".to_string())?
                    .and_utc();

                let current_usage = repository::sum_cost_since(&conn, start_of_month, user_id)
                    .map_err(|e| format!("Failed to query usage for budget check: {}", e))?;

                if current_usage >= budget_limit {
                    return Err(format!(
                        "Monthly budget exceeded. Usage: ${:.2}, Limit: ${:.2}. Please update settings.",
                        current_usage,
                        budget_limit
                    ));
                }
            }
        }
    }

    Ok(())
}

/// Ensure ManagedCloud provider is registered in the router for authenticated users.
///
/// If the user has a valid access token but ManagedCloud is not yet set up, this
/// function initializes and registers it. Does nothing if already present or the
/// user is not authenticated.
pub(super) async fn ensure_managed_cloud_provider(
    router: &Arc<tokio::sync::RwLock<crate::core::llm::llm_router::LLMRouter>>,
) {
    use crate::core::llm::providers::managed_cloud_provider::ManagedCloudProvider;
    use crate::core::llm::Provider;
    use crate::sys::account::get_access_token;

    let has_managed_cloud = {
        let router = router.read().await;
        router.has_provider(Provider::ManagedCloud)
    };

    if !has_managed_cloud {
        match get_access_token() {
            Ok(_) => match ManagedCloudProvider::new() {
                Ok(provider) => {
                    let mut router = router.write().await;
                    router.set_managed_cloud(Box::new(provider));
                    info!("[Chat] Initialized ManagedCloud provider for authenticated user");
                }
                Err(error) => {
                    warn!("[Chat] Failed to create ManagedCloud provider: {}", error);
                }
            },
            Err(_) => {
                debug!("[Chat] User not authenticated, ManagedCloud provider not available");
            }
        }
    }
}
