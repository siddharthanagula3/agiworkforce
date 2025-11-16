#[cfg(feature = "billing")]
pub mod stripe_client;
#[cfg(feature = "billing")]
pub mod webhooks;

#[cfg(not(feature = "billing"))]
use serde::{Deserialize, Serialize};
#[cfg(feature = "billing")]
pub use stripe_client::{
    CustomerInfo, InvoiceInfo, PaymentMethodInfo, StripeService, SubscriptionInfo, UsageStats,
};
#[cfg(feature = "billing")]
pub use webhooks::{WebhookEvent, WebhookHandler};

#[cfg(not(feature = "billing"))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerInfo;
#[cfg(not(feature = "billing"))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionInfo;
#[cfg(not(feature = "billing"))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceInfo;
#[cfg(not(feature = "billing"))]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats;

use std::sync::{Arc, Mutex};

#[cfg(feature = "billing")]
/// Billing state wrapper for Tauri
pub struct BillingState {
    stripe_service: Option<StripeService>,
    webhook_handler: Option<WebhookHandler>,
}

#[cfg(not(feature = "billing"))]
/// Billing state wrapper for Tauri (stub when billing feature is disabled)
pub struct BillingState {
    _phantom: std::marker::PhantomData<()>,
}

#[cfg(feature = "billing")]
impl BillingState {
    pub fn new() -> Self {
        Self {
            stripe_service: None,
            webhook_handler: None,
        }
    }

    pub fn initialize(
        &mut self,
        stripe_api_key: String,
        webhook_secret: String,
        db: Arc<Mutex<Connection>>,
    ) {
        self.stripe_service = Some(StripeService::new(stripe_api_key.clone(), db.clone()));
        self.webhook_handler = Some(WebhookHandler::new(webhook_secret, db));
    }

    pub fn stripe_service(&self) -> Result<&StripeService> {
        self.stripe_service
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Stripe service not initialized"))
    }

    pub fn webhook_handler(&self) -> Result<&WebhookHandler> {
        self.webhook_handler
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Webhook handler not initialized"))
    }
}

#[cfg(not(feature = "billing"))]
impl BillingState {
    pub fn new() -> Self {
        Self {
            _phantom: std::marker::PhantomData,
        }
    }
}

impl Default for BillingState {
    fn default() -> Self {
        Self::new()
    }
}

/// Tauri state wrapper
pub struct BillingStateWrapper(pub Arc<Mutex<BillingState>>);

impl BillingStateWrapper {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(BillingState::new())))
    }
}

impl Default for BillingStateWrapper {
    fn default() -> Self {
        Self::new()
    }
}

// All Tauri commands require the billing feature
#[cfg(feature = "billing")]
/// Initialize billing service with Stripe API key
#[tauri::command]
pub async fn billing_initialize(
    stripe_api_key: String,
    webhook_secret: String,
    state: State<'_, BillingStateWrapper>,
    db_state: State<'_, crate::commands::AppDatabase>,
) -> Result<(), String> {
    let mut billing = state
        .inner()
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let db = Arc::new(db_state.inner().clone());
    billing.initialize(stripe_api_key, webhook_secret, db);

    Ok(())
}

#[cfg(feature = "billing")]
/// Create a new customer
#[tauri::command]
pub async fn stripe_create_customer(
    email: String,
    name: Option<String>,
    state: State<'_, BillingStateWrapper>,
) -> Result<CustomerInfo, String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    service
        .create_customer(&email, name.as_deref())
        .await
        .map_err(|e| format!("Failed to create customer: {}", e))
}

#[cfg(feature = "billing")]
/// Get customer by email
#[tauri::command]
pub fn stripe_get_customer_by_email(
    email: String,
    state: State<'_, BillingStateWrapper>,
) -> Result<Option<CustomerInfo>, String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    service
        .get_customer_by_email(&email)
        .map_err(|e| format!("Failed to get customer: {}", e))
}

#[cfg(feature = "billing")]
/// Create a subscription
#[tauri::command]
pub async fn stripe_create_subscription(
    customer_stripe_id: String,
    price_id: String,
    trial_days: Option<u32>,
    plan_name: String,
    billing_interval: String,
    state: State<'_, BillingStateWrapper>,
) -> Result<SubscriptionInfo, String> {
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
            &price_id,
            trial_days,
            &plan_name,
            &billing_interval,
        )
        .await
        .map_err(|e| format!("Failed to create subscription: {}", e))
}

#[cfg(feature = "billing")]
/// Get subscription details
#[tauri::command]
pub async fn stripe_get_subscription(
    stripe_subscription_id: String,
    state: State<'_, BillingStateWrapper>,
) -> Result<SubscriptionInfo, String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    service
        .get_subscription(&stripe_subscription_id)
        .await
        .map_err(|e| format!("Failed to get subscription: {}", e))
}

#[cfg(feature = "billing")]
/// Update subscription (upgrade/downgrade)
#[tauri::command]
pub async fn stripe_update_subscription(
    stripe_subscription_id: String,
    new_price_id: String,
    new_plan_name: String,
    state: State<'_, BillingStateWrapper>,
) -> Result<SubscriptionInfo, String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    service
        .update_subscription(&stripe_subscription_id, &new_price_id, &new_plan_name)
        .await
        .map_err(|e| format!("Failed to update subscription: {}", e))
}

#[cfg(feature = "billing")]
/// Cancel subscription
#[tauri::command]
pub async fn stripe_cancel_subscription(
    stripe_subscription_id: String,
    state: State<'_, BillingStateWrapper>,
) -> Result<(), String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    service
        .cancel_subscription(&stripe_subscription_id)
        .await
        .map_err(|e| format!("Failed to cancel subscription: {}", e))
}

#[cfg(feature = "billing")]
/// Get invoices for customer
#[tauri::command]
pub async fn stripe_get_invoices(
    customer_stripe_id: String,
    state: State<'_, BillingStateWrapper>,
) -> Result<Vec<InvoiceInfo>, String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    service
        .get_invoices(&customer_stripe_id)
        .await
        .map_err(|e| format!("Failed to get invoices: {}", e))
}

#[cfg(feature = "billing")]
/// Get usage statistics
#[tauri::command]
pub fn stripe_get_usage(
    customer_id: String,
    period_start: i64,
    period_end: i64,
    state: State<'_, BillingStateWrapper>,
) -> Result<UsageStats, String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    service
        .get_usage(&customer_id, period_start, period_end)
        .map_err(|e| format!("Failed to get usage: {}", e))
}

#[cfg(feature = "billing")]
/// Track usage event
#[tauri::command]
pub fn stripe_track_usage(
    customer_id: String,
    usage_type: String,
    count: u64,
    period_start: i64,
    period_end: i64,
    metadata: Option<String>,
    state: State<'_, BillingStateWrapper>,
) -> Result<(), String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    service
        .track_usage(
            &customer_id,
            &usage_type,
            count,
            period_start,
            period_end,
            metadata.as_deref(),
        )
        .map_err(|e| format!("Failed to track usage: {}", e))
}

#[cfg(feature = "billing")]
/// Create Stripe billing portal session
#[tauri::command]
pub async fn stripe_create_portal_session(
    customer_stripe_id: String,
    return_url: String,
    state: State<'_, BillingStateWrapper>,
) -> Result<String, String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    service
        .create_portal_session(&customer_stripe_id, &return_url)
        .await
        .map_err(|e| format!("Failed to create portal session: {}", e))
}

#[cfg(feature = "billing")]
/// Get active subscription for customer
#[tauri::command]
pub fn stripe_get_active_subscription(
    customer_id: String,
    state: State<'_, BillingStateWrapper>,
) -> Result<Option<SubscriptionInfo>, String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let service = billing
        .stripe_service()
        .map_err(|e| format!("Stripe service not initialized: {}", e))?;

    service
        .get_active_subscription(&customer_id)
        .map_err(|e| format!("Failed to get active subscription: {}", e))
}

#[cfg(feature = "billing")]
/// Process webhook event
#[tauri::command]
pub async fn stripe_process_webhook(
    payload: String,
    signature: String,
    state: State<'_, BillingStateWrapper>,
) -> Result<(), String> {
    let billing = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock billing state: {}", e))?;

    let handler = billing
        .webhook_handler()
        .map_err(|e| format!("Webhook handler not initialized: {}", e))?;

    handler
        .process_event(&payload, &signature)
        .await
        .map_err(|e| format!("Failed to process webhook: {}", e))
}

#[cfg(not(feature = "billing"))]
const BILLING_DISABLED_MSG: &str = "Billing feature is not enabled";

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub async fn billing_initialize(
    _stripe_api_key: String,
    _webhook_secret: String,
    _state: tauri::State<'_, BillingStateWrapper>,
    _db_state: tauri::State<'_, crate::commands::AppDatabase>,
) -> Result<(), String> {
    Err(BILLING_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub async fn stripe_create_customer(
    _email: String,
    _name: Option<String>,
    _state: tauri::State<'_, BillingStateWrapper>,
) -> Result<CustomerInfo, String> {
    Err(BILLING_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub fn stripe_get_customer_by_email(
    _email: String,
    _state: tauri::State<'_, BillingStateWrapper>,
) -> Result<Option<CustomerInfo>, String> {
    Err(BILLING_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub async fn stripe_create_subscription(
    _customer_id: String,
    _price_id: String,
    _trial_days: Option<u32>,
    _plan_name: String,
    _billing_interval: String,
    _state: tauri::State<'_, BillingStateWrapper>,
) -> Result<SubscriptionInfo, String> {
    Err(BILLING_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub fn stripe_get_subscription(
    _subscription_id: String,
    _state: tauri::State<'_, BillingStateWrapper>,
) -> Result<Option<SubscriptionInfo>, String> {
    Err(BILLING_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub async fn stripe_update_subscription(
    _subscription_id: String,
    _new_price_id: String,
    _proration_behavior: Option<String>,
    _state: tauri::State<'_, BillingStateWrapper>,
) -> Result<SubscriptionInfo, String> {
    Err(BILLING_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub async fn stripe_cancel_subscription(
    _subscription_id: String,
    _state: tauri::State<'_, BillingStateWrapper>,
) -> Result<(), String> {
    Err(BILLING_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub async fn stripe_get_invoices(
    _customer_id: String,
    _state: tauri::State<'_, BillingStateWrapper>,
) -> Result<Vec<InvoiceInfo>, String> {
    Err(BILLING_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub fn stripe_get_usage(
    _customer_id: String,
    _period_start: i64,
    _period_end: i64,
    _state: tauri::State<'_, BillingStateWrapper>,
) -> Result<UsageStats, String> {
    Err(BILLING_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub fn stripe_track_usage(
    _customer_id: String,
    _usage_type: String,
    _count: u64,
    _period_start: i64,
    _period_end: i64,
    _metadata: Option<String>,
    _state: tauri::State<'_, BillingStateWrapper>,
) -> Result<(), String> {
    Err(BILLING_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub async fn stripe_create_portal_session(
    _customer_stripe_id: String,
    _return_url: String,
    _state: tauri::State<'_, BillingStateWrapper>,
) -> Result<String, String> {
    Err(BILLING_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub fn stripe_get_active_subscription(
    _customer_id: String,
    _state: tauri::State<'_, BillingStateWrapper>,
) -> Result<Option<SubscriptionInfo>, String> {
    Err(BILLING_DISABLED_MSG.to_string())
}

#[cfg(not(feature = "billing"))]
#[tauri::command]
pub async fn stripe_process_webhook(
    _payload: String,
    _signature: String,
    _state: tauri::State<'_, BillingStateWrapper>,
) -> Result<(), String> {
    Err(BILLING_DISABLED_MSG.to_string())
}
