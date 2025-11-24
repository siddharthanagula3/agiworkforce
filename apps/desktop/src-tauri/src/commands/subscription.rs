//! Subscription management commands
//!
//! High-level subscription management wrappers around Stripe integration.
//! These commands provide a simplified API for managing subscriptions.

#[cfg(feature = "billing")]
use crate::billing::{BillingStateWrapper, SubscriptionInfo};

#[cfg(feature = "billing")]
/// Subscribe to a plan
///
/// Creates a new subscription for a user. This is a wrapper around stripe_create_subscription
/// that adds business logic and simplifies the interface.
///
/// # Arguments
/// * `user_id` - The customer ID (billing_customers.id, not stripe_customer_id)
/// * `plan_id` - The Stripe price ID for the plan
///
/// # Returns
/// The created subscription information
#[tauri::command]
pub async fn subscribe_to_plan(
    user_id: String,
    plan_id: String,
    state: State<'_, BillingStateWrapper>,
    db_state: State<'_, crate::commands::AppDatabase>,
) -> Result<SubscriptionInfo, String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    // Get customer's Stripe customer ID from database
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

    // Check if customer already has an active subscription
    let existing_subscription = service
        .get_active_subscription(&user_id)
        .map_err(|e| format!("Failed to check existing subscription: {}", e))?;

    if existing_subscription.is_some() {
        return Err(
            "User already has an active subscription. Use upgrade_plan to change plans."
                .to_string(),
        );
    }

    // Get plan details from database or configuration
    // For now, we'll use default plan names based on common tiers
    let (plan_name, billing_interval) = get_plan_details(&plan_id);

    // Create subscription with optional 14-day trial for new subscribers
    drop(db); // Release database lock before async operation
    drop(billing); // Release billing lock before async operation

    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    service
        .create_subscription(
            &customer_stripe_id,
            &plan_id,
            Some(14), // 14-day trial for new subscriptions
            &plan_name,
            &billing_interval,
        )
        .await
        .map_err(|e| format!("Failed to create subscription: {}", e))
}

#[cfg(feature = "billing")]
/// Upgrade or downgrade a plan
///
/// Updates an existing subscription to a new plan. This is a wrapper around
/// stripe_update_subscription that adds business logic.
///
/// # Arguments
/// * `user_id` - The customer ID (billing_customers.id)
/// * `new_plan_id` - The new Stripe price ID
///
/// # Returns
/// The updated subscription information
#[tauri::command]
pub async fn upgrade_plan(
    user_id: String,
    new_plan_id: String,
    state: State<'_, BillingStateWrapper>,
) -> Result<SubscriptionInfo, String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    // Get the user's active subscription
    let active_subscription = service
        .get_active_subscription(&user_id)
        .map_err(|e| format!("Failed to get active subscription: {}", e))?
        .ok_or_else(|| "No active subscription found for user".to_string())?;

    // Get new plan details
    let (new_plan_name, _) = get_plan_details(&new_plan_id);

    // Update the subscription
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
/// Cancel a subscription
///
/// Cancels an active subscription. This is a wrapper around stripe_cancel_subscription
/// that adds validation and business logic.
///
/// # Arguments
/// * `user_id` - The customer ID (billing_customers.id)
/// * `subscription_id` - The Stripe subscription ID
///
/// # Returns
/// Success or error
#[tauri::command]
pub async fn cancel_subscription(
    user_id: String,
    subscription_id: String,
    state: State<'_, BillingStateWrapper>,
    db_state: State<'_, crate::commands::AppDatabase>,
) -> Result<(), String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    // Verify the subscription belongs to the user
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

    drop(db); // Release database lock before async operation
    drop(billing); // Release billing lock before async operation

    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    // Cancel the subscription
    service
        .cancel_subscription(&subscription_id)
        .await
        .map_err(|e| format!("Failed to cancel subscription: {}", e))
}

#[cfg(not(feature = "billing"))]
/// Stub for subscribe_to_plan when billing feature is disabled
#[tauri::command]
pub async fn subscribe_to_plan(_user_id: String, _plan_id: String) -> Result<String, String> {
    Err("Billing feature is not enabled".to_string())
}

#[cfg(not(feature = "billing"))]
/// Stub for upgrade_plan when billing feature is disabled
#[tauri::command]
pub async fn upgrade_plan(_user_id: String, _new_plan_id: String) -> Result<String, String> {
    Err("Billing feature is not enabled".to_string())
}

#[cfg(not(feature = "billing"))]
/// Stub for cancel_subscription when billing feature is disabled
#[tauri::command]
pub async fn cancel_subscription(_user_id: String, _subscription_id: String) -> Result<(), String> {
    Err("Billing feature is not enabled".to_string())
}

/// Helper function to map plan IDs to plan names and billing intervals
/// This could be moved to a configuration file or database table
#[cfg_attr(not(feature = "billing"), allow(dead_code))]
fn get_plan_details(plan_id: &str) -> (String, String) {
    // Default mapping - in production this would come from a configuration
    // or be looked up from Stripe's API
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

#[tauri::command]
pub async fn get_user_credits() -> Result<f64, String> {
    Ok(0.0)
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
