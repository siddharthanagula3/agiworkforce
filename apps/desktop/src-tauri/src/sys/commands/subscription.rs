use tauri::State;

#[cfg(feature = "billing")]
use crate::sys::billing::{BillingStateWrapper, SubscriptionInfo};

#[cfg(not(feature = "billing"))]
use crate::sys::billing::BillingStateWrapper;

#[cfg(feature = "billing")]
#[tauri::command]
pub async fn subscribe_to_plan(
    user_id: String,
    plan_id: String,
    billing_interval: Option<String>,
    state: State<'_, BillingStateWrapper>,
    db_state: State<'_, crate::sys::commands::AppDatabase>,
) -> Result<SubscriptionInfo, String> {
    let billing = state.0.lock().await;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    let db = db_state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let customer_stripe_id: String = db
        .query_row(
            "SELECT stripe_customer_id FROM billing_customers WHERE id = ?1",
            rusqlite::params![&user_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Customer not found: {}", e))?;

    let existing_subscription = service
        .get_active_subscription(&user_id)
        .map_err(|e| format!("Failed to check existing subscription: {}", e))?;

    if existing_subscription.is_some() {
        return Err(
            "User already has an active subscription. Use upgrade_plan to change plans."
                .to_string(),
        );
    }

    let (plan_name, mut interval) = get_plan_details(&plan_id);

    if let Some(i) = billing_interval {
        interval = i;
    }

    service
        .create_subscription(
            &customer_stripe_id,
            &plan_id,
            Some(14),
            &plan_name,
            &interval,
        )
        .await
        .map_err(|e| format!("Failed to create subscription: {}", e))
}

#[cfg(feature = "billing")]
#[tauri::command]
pub async fn upgrade_plan(
    user_id: String,
    new_plan_id: String,
    state: State<'_, BillingStateWrapper>,
) -> Result<SubscriptionInfo, String> {
    let billing = state.0.lock().await;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    let active_subscription = service
        .get_active_subscription(&user_id)
        .map_err(|e| format!("Failed to get active subscription: {}", e))?
        .ok_or_else(|| "No active subscription found for user".to_string())?;

    let (new_plan_name, _) = get_plan_details(&new_plan_id);

    service
        .update_subscription(
            &active_subscription.stripe_subscription_id,
            &new_plan_id,
            &new_plan_name,
        )
        .await
        .map_err(|e| format!("Failed to upgrade plan: {}", e))
}

#[cfg(feature = "billing")]
#[tauri::command]
pub async fn cancel_subscription(
    user_id: String,
    subscription_id: String,
    state: State<'_, BillingStateWrapper>,
    db_state: State<'_, crate::sys::commands::AppDatabase>,
) -> Result<(), String> {
    let billing = state.0.lock().await;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    let db = db_state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock database: {}", e))?;

    let subscription_customer_id: String = db
        .query_row(
            "SELECT customer_id FROM billing_subscriptions WHERE stripe_subscription_id = ?1",
            rusqlite::params![&subscription_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Subscription not found: {}", e))?;

    if subscription_customer_id != user_id {
        return Err("Subscription does not belong to this user".to_string());
    }

    service
        .cancel_subscription(&subscription_id)
        .await
        .map_err(|e| format!("Failed to cancel subscription: {}", e))
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub async fn subscribe_to_plan(
    _user_id: String,
    _plan_id: String,
    _billing_interval: Option<String>,
) -> Result<String, String> {
    Err("Billing feature is not enabled".to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub async fn upgrade_plan(_user_id: String, _new_plan_id: String) -> Result<String, String> {
    Err("Billing feature is not enabled".to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub async fn cancel_subscription(_user_id: String, _subscription_id: String) -> Result<(), String> {
    Err("Billing feature is not enabled".to_string())
}

#[derive(serde::Serialize, Clone)]
pub struct PricingPlan {
    pub id: String,
    pub tier: String,
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub price_monthly_usd: f64,
    pub price_annual_usd: f64,
    pub features: Vec<String>,
    pub limits: serde_json::Value,
    pub is_popular: bool,
    pub is_available: bool,
}

#[tauri::command]
pub async fn get_pricing_plans() -> Result<Vec<PricingPlan>, String> {
    Ok(vec![
        PricingPlan {
            id: "price_hobby".to_string(),
            tier: "hobby".to_string(),
            name: "hobby".to_string(),
            display_name: "Hobby".to_string(),
            description: "Perfect for getting started with AI automation".to_string(),
            price_monthly_usd: 10.0,
            price_annual_usd: 120.0,
            features: vec![
                "Free to use own APIs".to_string(),
                "Core desktop agent".to_string(),
                "Community support".to_string(),
                "3-month free trial".to_string(),
            ],
            limits: serde_json::json!({
                "automations": 10,
                "api_calls": 100,
                "storage_gb": 1,
                "team_members": 1
            }),
            is_popular: false,
            is_available: true,
        },
        PricingPlan {
            id: "price_pro".to_string(),
            tier: "pro".to_string(),
            name: "pro".to_string(),
            display_name: "Pro".to_string(),
            description: "Advanced features for power users".to_string(),
            price_monthly_usd: 29.99,
            price_annual_usd: 299.88,
            features: vec![
                "Unlimited local automations".to_string(),
                "Advanced AI models (GPT-4, Claude)".to_string(),
                "Priority support".to_string(),
                "$25/mo Token Credits included".to_string(),
                "Multi-step workflows".to_string(),
            ],
            limits: serde_json::json!({
                "automations": null,
                "api_calls": 10000,
                "storage_gb": 10,
                "team_members": 1
            }),
            is_popular: true,
            is_available: true,
        },
        PricingPlan {
            id: "price_max".to_string(),
            tier: "max".to_string(),
            name: "max".to_string(),
            display_name: "Max".to_string(),
            description: "For professionals and teams demanding maximum performance".to_string(),
            price_monthly_usd: 299.99,
            price_annual_usd: 2999.88,
            features: vec![
                "Everything in Pro".to_string(),
                "$300/mo Cloud Credits".to_string(),
                "Dedicated Support Channel".to_string(),
                "Early Access to New Features".to_string(),
                "Higher Rate Limits".to_string(),
                "Priority Queue Access".to_string(),
            ],
            limits: serde_json::json!({
                "automations": null,
                "api_calls": 100000,
                "storage_gb": 100,
                "team_members": 5
            }),
            is_popular: false,
            is_available: true,
        },
    ])
}

#[tauri::command]
pub async fn get_current_plan(
    _user_id: String,
    _state: State<'_, BillingStateWrapper>,
) -> Result<PricingPlan, String> {
    let plans = get_pricing_plans().await?;
    Ok(plans[0].clone())
}

#[cfg_attr(not(feature = "billing"), allow(dead_code))]
fn get_plan_details(plan_id: &str) -> (String, String) {
    match plan_id {
        id if id.contains("month") => {
            if id.contains("basic") {
                ("Basic".to_string(), "monthly".to_string())
            } else if id.contains("pro") {
                ("Pro".to_string(), "monthly".to_string())
            } else if id.contains("enterprise") {
                ("Enterprise".to_string(), "monthly".to_string())
            } else {
                ("Standard".to_string(), "monthly".to_string())
            }
        }
        id if id.contains("year") => {
            if id.contains("basic") {
                ("Basic".to_string(), "yearly".to_string())
            } else if id.contains("pro") {
                ("Pro".to_string(), "yearly".to_string())
            } else if id.contains("enterprise") {
                ("Enterprise".to_string(), "yearly".to_string())
            } else {
                ("Standard".to_string(), "yearly".to_string())
            }
        }
        _ => ("Custom".to_string(), "monthly".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_plan_details() {
        let (name, interval) = get_plan_details("price_basic_month");
        assert_eq!(name, "Basic");
        assert_eq!(interval, "monthly");

        let (name, interval) = get_plan_details("price_pro_year");
        assert_eq!(name, "Pro");
        assert_eq!(interval, "yearly");

        let (name, interval) = get_plan_details("price_custom");
        assert_eq!(name, "Custom");
        assert_eq!(interval, "monthly");
    }
}
