// This module requires the "billing" feature to be enabled
#![cfg(feature = "billing")]

use anyhow::{anyhow, Result};
use chrono::Utc;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use stripe::{
    Client, CreateCustomer, CreateSetupIntent, CreateSubscription, Customer, CustomerId, Invoice,
    InvoiceId, ListInvoices, PaymentIntent, PaymentMethod, PaymentMethodId, SetupIntent,
    SetupIntentId, SubscriptionId, UpdateCustomer,
};
use uuid::Uuid;

/// Stripe service for managing subscriptions and payments
pub struct StripeService {
    client: Client,
    db: Arc<Mutex<Connection>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomerInfo {
    pub id: String,
    pub stripe_customer_id: String,
    pub email: String,
    pub name: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubscriptionInfo {
    pub id: String,
    pub customer_id: String,
    pub stripe_subscription_id: String,
    pub stripe_price_id: String,
    pub plan_name: String,
    pub billing_interval: String,
    pub status: String,
    pub current_period_start: i64,
    pub current_period_end: i64,
    pub cancel_at_period_end: bool,
    pub cancel_at: Option<i64>,
    pub canceled_at: Option<i64>,
    pub trial_start: Option<i64>,
    pub trial_end: Option<i64>,
    pub amount: i64,
    pub currency: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InvoiceInfo {
    pub id: String,
    pub customer_id: String,
    pub subscription_id: Option<String>,
    pub stripe_invoice_id: String,
    pub invoice_number: Option<String>,
    pub amount_due: i64,
    pub amount_paid: i64,
    pub amount_remaining: i64,
    pub currency: String,
    pub status: String,
    pub invoice_pdf: Option<String>,
    pub hosted_invoice_url: Option<String>,
    pub period_start: i64,
    pub period_end: i64,
    pub due_date: Option<i64>,
    pub paid_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStats {
    pub automations_executed: u64,
    pub api_calls_made: u64,
    pub storage_used_mb: f64,
    pub llm_tokens_used: u64,
    pub browser_sessions: u64,
    pub mcp_tool_calls: u64,
    pub limit_automations: Option<u64>,
    pub limit_api_calls: Option<u64>,
    pub limit_storage_mb: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentMethodInfo {
    pub id: String,
    pub customer_id: String,
    pub stripe_payment_method_id: String,
    pub payment_type: String,
    pub card_brand: Option<String>,
    pub card_last4: Option<String>,
    pub card_exp_month: Option<i32>,
    pub card_exp_year: Option<i32>,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

impl StripeService {
    /// Create a new Stripe service instance
    pub fn new(api_key: String, db: Arc<Mutex<Connection>>) -> Self {
        let client = Client::new(api_key);
        Self { client, db }
    }

    /// Create a new customer in Stripe
    pub async fn create_customer(&self, email: &str, name: Option<&str>) -> Result<CustomerInfo> {
        let mut params = CreateCustomer::new();
        params.email = Some(email);
        if let Some(n) = name {
            params.name = Some(n);
        }

        let customer = Customer::create(&self.client, params).await?;

        let customer_id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();

        let customer_info = CustomerInfo {
            id: customer_id.clone(),
            stripe_customer_id: customer.id.to_string(),
            email: email.to_string(),
            name: name.map(|s| s.to_string()),
            created_at: now,
            updated_at: now,
        };

        // Store in database
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;
        db.execute(
            "INSERT INTO billing_customers (id, stripe_customer_id, email, name, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                &customer_info.id,
                &customer_info.stripe_customer_id,
                &customer_info.email,
                &customer_info.name,
                customer_info.created_at,
                customer_info.updated_at,
            ],
        )?;

        Ok(customer_info)
    }

    /// Get customer information by email
    pub fn get_customer_by_email(&self, email: &str) -> Result<Option<CustomerInfo>> {
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        let mut stmt = db.prepare(
            "SELECT id, stripe_customer_id, email, name, created_at, updated_at
             FROM billing_customers
             WHERE email = ?1",
        )?;

        let mut rows = stmt.query(rusqlite::params![email])?;

        if let Some(row) = rows.next()? {
            Ok(Some(CustomerInfo {
                id: row.get(0)?,
                stripe_customer_id: row.get(1)?,
                email: row.get(2)?,
                name: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Create a new subscription
    pub async fn create_subscription(
        &self,
        customer_stripe_id: &str,
        price_id: &str,
        trial_days: Option<u32>,
        plan_name: &str,
        billing_interval: &str,
    ) -> Result<SubscriptionInfo> {
        let customer_id = CustomerId::from(customer_stripe_id);

        let mut params = CreateSubscription::new(customer_id.clone());
        params.items = Some(vec![stripe::CreateSubscriptionItems {
            price: Some(price_id.to_string()),
            ..Default::default()
        }]);

        if let Some(days) = trial_days {
            params.trial_period_days = Some(days);
        }

        let subscription = stripe::Subscription::create(&self.client, params).await?;

        // Get customer from database
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        let customer_db_id: String = db.query_row(
            "SELECT id FROM billing_customers WHERE stripe_customer_id = ?1",
            rusqlite::params![customer_stripe_id],
            |row| row.get(0),
        )?;

        let subscription_id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();

        let subscription_info = SubscriptionInfo {
            id: subscription_id.clone(),
            customer_id: customer_db_id.clone(),
            stripe_subscription_id: subscription.id.to_string(),
            stripe_price_id: price_id.to_string(),
            plan_name: plan_name.to_string(),
            billing_interval: billing_interval.to_string(),
            status: subscription.status.to_string(),
            current_period_start: subscription.current_period_start,
            current_period_end: subscription.current_period_end,
            cancel_at_period_end: subscription.cancel_at_period_end.unwrap_or(false),
            cancel_at: subscription.cancel_at,
            canceled_at: subscription.canceled_at,
            trial_start: subscription.trial_start,
            trial_end: subscription.trial_end,
            amount: subscription
                .items
                .data
                .first()
                .and_then(|item| item.price.as_ref())
                .and_then(|price| price.unit_amount)
                .unwrap_or(0),
            currency: "usd".to_string(),
            created_at: now,
            updated_at: now,
        };

        // Store in database
        db.execute(
            "INSERT INTO billing_subscriptions (
                id, customer_id, stripe_subscription_id, stripe_price_id, plan_name, billing_interval,
                status, current_period_start, current_period_end, cancel_at_period_end,
                cancel_at, canceled_at, trial_start, trial_end, amount, currency,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            rusqlite::params![
                &subscription_info.id,
                &subscription_info.customer_id,
                &subscription_info.stripe_subscription_id,
                &subscription_info.stripe_price_id,
                &subscription_info.plan_name,
                &subscription_info.billing_interval,
                &subscription_info.status,
                subscription_info.current_period_start,
                subscription_info.current_period_end,
                subscription_info.cancel_at_period_end,
                &subscription_info.cancel_at,
                &subscription_info.canceled_at,
                &subscription_info.trial_start,
                &subscription_info.trial_end,
                subscription_info.amount,
                &subscription_info.currency,
                subscription_info.created_at,
                subscription_info.updated_at,
            ],
        )?;

        Ok(subscription_info)
    }

    /// Get subscription by Stripe subscription ID
    pub async fn get_subscription(&self, stripe_subscription_id: &str) -> Result<SubscriptionInfo> {
        let subscription_id = SubscriptionId::from(stripe_subscription_id);
        let subscription =
            stripe::Subscription::retrieve(&self.client, &subscription_id, &[]).await?;

        // Update database with latest info
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        let now = Utc::now().timestamp();

        db.execute(
            "UPDATE billing_subscriptions SET
                status = ?1,
                current_period_start = ?2,
                current_period_end = ?3,
                cancel_at_period_end = ?4,
                cancel_at = ?5,
                canceled_at = ?6,
                updated_at = ?7
             WHERE stripe_subscription_id = ?8",
            rusqlite::params![
                subscription.status.to_string(),
                subscription.current_period_start,
                subscription.current_period_end,
                subscription.cancel_at_period_end.unwrap_or(false),
                subscription.cancel_at,
                subscription.canceled_at,
                now,
                stripe_subscription_id,
            ],
        )?;

        // Retrieve from database
        let mut stmt = db.prepare(
            "SELECT id, customer_id, stripe_subscription_id, stripe_price_id, plan_name, billing_interval,
                    status, current_period_start, current_period_end, cancel_at_period_end,
                    cancel_at, canceled_at, trial_start, trial_end, amount, currency,
                    created_at, updated_at
             FROM billing_subscriptions
             WHERE stripe_subscription_id = ?1",
        )?;

        let subscription_info =
            stmt.query_row(rusqlite::params![stripe_subscription_id], |row| {
                Ok(SubscriptionInfo {
                    id: row.get(0)?,
                    customer_id: row.get(1)?,
                    stripe_subscription_id: row.get(2)?,
                    stripe_price_id: row.get(3)?,
                    plan_name: row.get(4)?,
                    billing_interval: row.get(5)?,
                    status: row.get(6)?,
                    current_period_start: row.get(7)?,
                    current_period_end: row.get(8)?,
                    cancel_at_period_end: row.get(9)?,
                    cancel_at: row.get(10)?,
                    canceled_at: row.get(11)?,
                    trial_start: row.get(12)?,
                    trial_end: row.get(13)?,
                    amount: row.get(14)?,
                    currency: row.get(15)?,
                    created_at: row.get(16)?,
                    updated_at: row.get(17)?,
                })
            })?;

        Ok(subscription_info)
    }

    /// Update subscription (upgrade/downgrade)
    pub async fn update_subscription(
        &self,
        stripe_subscription_id: &str,
        new_price_id: &str,
        new_plan_name: &str,
    ) -> Result<SubscriptionInfo> {
        let subscription_id = SubscriptionId::from(stripe_subscription_id);
        let mut subscription =
            stripe::Subscription::retrieve(&self.client, &subscription_id, &[]).await?;

        // Update the subscription item with new price
        let item_id = subscription
            .items
            .data
            .first()
            .ok_or_else(|| anyhow!("No subscription items found"))?
            .id
            .clone();

        let mut update_params = stripe::UpdateSubscription::default();
        update_params.items = Some(vec![stripe::UpdateSubscriptionItems {
            id: Some(item_id.to_string()),
            price: Some(new_price_id.to_string()),
            ..Default::default()
        }]);

        subscription =
            stripe::Subscription::update(&self.client, &subscription_id, update_params).await?;

        // Update database
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        let now = Utc::now().timestamp();

        db.execute(
            "UPDATE billing_subscriptions SET
                stripe_price_id = ?1,
                plan_name = ?2,
                status = ?3,
                updated_at = ?4
             WHERE stripe_subscription_id = ?5",
            rusqlite::params![
                new_price_id,
                new_plan_name,
                subscription.status.to_string(),
                now,
                stripe_subscription_id
            ],
        )?;

        self.get_subscription(stripe_subscription_id).await
    }

    /// Cancel subscription
    pub async fn cancel_subscription(&self, stripe_subscription_id: &str) -> Result<()> {
        let subscription_id = SubscriptionId::from(stripe_subscription_id);
        stripe::Subscription::cancel(&self.client, &subscription_id, Default::default()).await?;

        // Update database
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        let now = Utc::now().timestamp();

        db.execute(
            "UPDATE billing_subscriptions SET
                status = 'canceled',
                canceled_at = ?1,
                updated_at = ?2
             WHERE stripe_subscription_id = ?3",
            rusqlite::params![now, now, stripe_subscription_id],
        )?;

        Ok(())
    }

    /// Get customer's invoices
    pub async fn get_invoices(&self, customer_stripe_id: &str) -> Result<Vec<InvoiceInfo>> {
        let customer_id = CustomerId::from(customer_stripe_id);

        let mut list_params = ListInvoices::new();
        list_params.customer = Some(customer_id);
        list_params.limit = Some(100);

        let invoices = Invoice::list(&self.client, &list_params).await?;

        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        // Get customer DB ID
        let customer_db_id: String = db.query_row(
            "SELECT id FROM billing_customers WHERE stripe_customer_id = ?1",
            rusqlite::params![customer_stripe_id],
            |row| row.get(0),
        )?;

        let mut invoice_infos = Vec::new();

        for invoice in invoices.data {
            let invoice_id = Uuid::new_v4().to_string();
            let now = Utc::now().timestamp();

            let invoice_info = InvoiceInfo {
                id: invoice_id.clone(),
                customer_id: customer_db_id.clone(),
                subscription_id: invoice.subscription.map(|s| s.to_string()),
                stripe_invoice_id: invoice.id.to_string(),
                invoice_number: invoice.number,
                amount_due: invoice.amount_due.unwrap_or(0),
                amount_paid: invoice.amount_paid.unwrap_or(0),
                amount_remaining: invoice.amount_remaining.unwrap_or(0),
                currency: invoice.currency.unwrap_or_else(|| "usd".to_string()),
                status: invoice
                    .status
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "unknown".to_string()),
                invoice_pdf: invoice.invoice_pdf,
                hosted_invoice_url: invoice.hosted_invoice_url,
                period_start: invoice.period_start.unwrap_or(0),
                period_end: invoice.period_end.unwrap_or(0),
                due_date: invoice.due_date,
                paid_at: if invoice.status_transitions.paid_at.is_some() {
                    invoice.status_transitions.paid_at
                } else {
                    None
                },
                created_at: now,
            };

            // Upsert into database
            db.execute(
                "INSERT OR REPLACE INTO billing_invoices (
                    id, customer_id, subscription_id, stripe_invoice_id, invoice_number,
                    amount_due, amount_paid, amount_remaining, currency, status,
                    invoice_pdf, hosted_invoice_url, period_start, period_end,
                    due_date, paid_at, created_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
                rusqlite::params![
                    &invoice_info.id,
                    &invoice_info.customer_id,
                    &invoice_info.subscription_id,
                    &invoice_info.stripe_invoice_id,
                    &invoice_info.invoice_number,
                    invoice_info.amount_due,
                    invoice_info.amount_paid,
                    invoice_info.amount_remaining,
                    &invoice_info.currency,
                    &invoice_info.status,
                    &invoice_info.invoice_pdf,
                    &invoice_info.hosted_invoice_url,
                    invoice_info.period_start,
                    invoice_info.period_end,
                    &invoice_info.due_date,
                    &invoice_info.paid_at,
                    invoice_info.created_at,
                ],
            )?;

            invoice_infos.push(invoice_info);
        }

        Ok(invoice_infos)
    }

    /// Get usage statistics for current billing period
    pub fn get_usage(
        &self,
        customer_id: &str,
        period_start: i64,
        period_end: i64,
    ) -> Result<UsageStats> {
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        let mut stmt = db.prepare(
            "SELECT usage_type, SUM(usage_count) as total
             FROM billing_usage
             WHERE customer_id = ?1 AND billing_period_start >= ?2 AND billing_period_end <= ?3
             GROUP BY usage_type",
        )?;

        let mut rows = stmt.query(rusqlite::params![customer_id, period_start, period_end])?;

        let mut stats = UsageStats {
            automations_executed: 0,
            api_calls_made: 0,
            storage_used_mb: 0.0,
            llm_tokens_used: 0,
            browser_sessions: 0,
            mcp_tool_calls: 0,
            limit_automations: None,
            limit_api_calls: None,
            limit_storage_mb: None,
        };

        while let Some(row) = rows.next()? {
            let usage_type: String = row.get(0)?;
            let total: i64 = row.get(1)?;

            match usage_type.as_str() {
                "automation_execution" => stats.automations_executed = total as u64,
                "api_call" => stats.api_calls_made = total as u64,
                "storage_mb" => stats.storage_used_mb = total as f64,
                "llm_tokens" => stats.llm_tokens_used = total as u64,
                "browser_session" => stats.browser_sessions = total as u64,
                "mcp_tool_call" => stats.mcp_tool_calls = total as u64,
                _ => {}
            }
        }

        Ok(stats)
    }

    /// Track usage event
    pub fn track_usage(
        &self,
        customer_id: &str,
        usage_type: &str,
        count: u64,
        period_start: i64,
        period_end: i64,
        metadata: Option<&str>,
    ) -> Result<()> {
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        let now = Utc::now().timestamp();

        db.execute(
            "INSERT INTO billing_usage (
                customer_id, usage_type, usage_count, metadata,
                billing_period_start, billing_period_end, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                customer_id,
                usage_type,
                count as i64,
                metadata,
                period_start,
                period_end,
                now
            ],
        )?;

        Ok(())
    }

    /// Create Stripe billing portal session URL
    pub async fn create_portal_session(
        &self,
        customer_stripe_id: &str,
        return_url: &str,
    ) -> Result<String> {
        let customer_id = CustomerId::from(customer_stripe_id);

        let mut params = stripe::CreateBillingPortalSession::new(customer_id);
        params.return_url = Some(return_url);

        let session = stripe::BillingPortalSession::create(&self.client, params).await?;

        Ok(session.url)
    }

    /// Get active subscription for customer
    pub fn get_active_subscription(&self, customer_id: &str) -> Result<Option<SubscriptionInfo>> {
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        let mut stmt = db.prepare(
            "SELECT id, customer_id, stripe_subscription_id, stripe_price_id, plan_name, billing_interval,
                    status, current_period_start, current_period_end, cancel_at_period_end,
                    cancel_at, canceled_at, trial_start, trial_end, amount, currency,
                    created_at, updated_at
             FROM billing_subscriptions
             WHERE customer_id = ?1 AND status IN ('active', 'trialing')
             ORDER BY created_at DESC
             LIMIT 1",
        )?;

        let mut rows = stmt.query(rusqlite::params![customer_id])?;

        if let Some(row) = rows.next()? {
            Ok(Some(SubscriptionInfo {
                id: row.get(0)?,
                customer_id: row.get(1)?,
                stripe_subscription_id: row.get(2)?,
                stripe_price_id: row.get(3)?,
                plan_name: row.get(4)?,
                billing_interval: row.get(5)?,
                status: row.get(6)?,
                current_period_start: row.get(7)?,
                current_period_end: row.get(8)?,
                cancel_at_period_end: row.get(9)?,
                cancel_at: row.get(10)?,
                canceled_at: row.get(11)?,
                trial_start: row.get(12)?,
                trial_end: row.get(13)?,
                amount: row.get(14)?,
                currency: row.get(15)?,
                created_at: row.get(16)?,
                updated_at: row.get(17)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get ANY active subscription (for single-user desktop mode)
    pub fn get_primary_subscription(&self) -> Result<Option<SubscriptionInfo>> {
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        let mut stmt = db.prepare(
            "SELECT id, customer_id, stripe_subscription_id, stripe_price_id, plan_name, billing_interval,
                    status, current_period_start, current_period_end, cancel_at_period_end,
                    cancel_at, canceled_at, trial_start, trial_end, amount, currency,
                    created_at, updated_at
             FROM billing_subscriptions
             WHERE status IN ('active', 'trialing')
             ORDER BY created_at DESC
             LIMIT 1",
        )?;

        let mut rows = stmt.query([])?;

        if let Some(row) = rows.next()? {
            Ok(Some(SubscriptionInfo {
                id: row.get(0)?,
                customer_id: row.get(1)?,
                stripe_subscription_id: row.get(2)?,
                stripe_price_id: row.get(3)?,
                plan_name: row.get(4)?,
                billing_interval: row.get(5)?,
                status: row.get(6)?,
                current_period_start: row.get(7)?,
                current_period_end: row.get(8)?,
                cancel_at_period_end: row.get(9)?,
                cancel_at: row.get(10)?,
                canceled_at: row.get(11)?,
                trial_start: row.get(12)?,
                trial_end: row.get(13)?,
                amount: row.get(14)?,
                currency: row.get(15)?,
                created_at: row.get(16)?,
                updated_at: row.get(17)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Get payment methods for a customer
    pub async fn get_payment_methods(
        &self,
        customer_stripe_id: &str,
    ) -> Result<Vec<PaymentMethodInfo>> {
        let customer_id = CustomerId::from(customer_stripe_id);

        let mut list_params = stripe::ListPaymentMethods::new();
        list_params.customer = Some(customer_id);
        list_params.limit = Some(100);

        let payment_methods = PaymentMethod::list(&self.client, &list_params).await?;

        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        // Get customer DB ID
        let customer_db_id: String = db.query_row(
            "SELECT id FROM billing_customers WHERE stripe_customer_id = ?1",
            rusqlite::params![customer_stripe_id],
            |row| row.get(0),
        )?;

        // Get default payment method from customer
        let customer = Customer::retrieve(&self.client, &customer_id, &[]).await?;
        let default_payment_method_id = customer
            .invoice_settings
            .as_ref()
            .and_then(|settings| settings.default_payment_method.as_ref())
            .map(|pm| pm.to_string());

        let mut payment_method_infos = Vec::new();
        let now = Utc::now().timestamp();

        for pm in payment_methods.data {
            let pm_id = Uuid::new_v4().to_string();
            let is_default = default_payment_method_id
                .as_ref()
                .map(|id| id == &pm.id.to_string())
                .unwrap_or(false);

            // Extract card details if available
            let (card_brand, card_last4, card_exp_month, card_exp_year) =
                if let Some(card) = pm.card {
                    (
                        card.brand.map(|b| b.to_string()),
                        card.last4,
                        card.exp_month,
                        card.exp_year,
                    )
                } else {
                    (None, None, None, None)
                };

            let payment_method_info = PaymentMethodInfo {
                id: pm_id.clone(),
                customer_id: customer_db_id.clone(),
                stripe_payment_method_id: pm.id.to_string(),
                payment_type: pm.r#type.to_string(),
                card_brand,
                card_last4,
                card_exp_month,
                card_exp_year,
                is_default,
                created_at: now,
                updated_at: now,
            };

            // Upsert into database
            db.execute(
                "INSERT OR REPLACE INTO billing_payment_methods (
                    id, customer_id, stripe_payment_method_id, type, card_brand, card_last4,
                    card_exp_month, card_exp_year, is_default, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                rusqlite::params![
                    &payment_method_info.id,
                    &payment_method_info.customer_id,
                    &payment_method_info.stripe_payment_method_id,
                    &payment_method_info.payment_type,
                    &payment_method_info.card_brand,
                    &payment_method_info.card_last4,
                    &payment_method_info.card_exp_month,
                    &payment_method_info.card_exp_year,
                    if payment_method_info.is_default { 1 } else { 0 },
                    payment_method_info.created_at,
                    payment_method_info.updated_at,
                ],
            )?;

            payment_method_infos.push(payment_method_info);
        }

        Ok(payment_method_infos)
    }

    /// Attach a payment method to a customer
    pub async fn attach_payment_method(
        &self,
        customer_stripe_id: &str,
        payment_method_id: &str,
    ) -> Result<PaymentMethodInfo> {
        let customer_id = CustomerId::from(customer_stripe_id);
        let pm_id = PaymentMethodId::from(payment_method_id);

        // Attach payment method to customer
        let mut attach_params = stripe::AttachPaymentMethod::new(customer_id.clone());
        let payment_method = PaymentMethod::attach(&self.client, &pm_id, attach_params).await?;

        // Get customer DB ID
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        let customer_db_id: String = db.query_row(
            "SELECT id FROM billing_customers WHERE stripe_customer_id = ?1",
            rusqlite::params![customer_stripe_id],
            |row| row.get(0),
        )?;

        let pm_db_id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();

        // Extract card details if available
        let (card_brand, card_last4, card_exp_month, card_exp_year) =
            if let Some(card) = payment_method.card {
                (
                    card.brand.map(|b| b.to_string()),
                    card.last4,
                    card.exp_month,
                    card.exp_year,
                )
            } else {
                (None, None, None, None)
            };

        let payment_method_info = PaymentMethodInfo {
            id: pm_db_id.clone(),
            customer_id: customer_db_id.clone(),
            stripe_payment_method_id: payment_method.id.to_string(),
            payment_type: payment_method.r#type.to_string(),
            card_brand,
            card_last4,
            card_exp_month,
            card_exp_year,
            is_default: false, // Newly attached methods are not default by default
            created_at: now,
            updated_at: now,
        };

        // Insert into database
        db.execute(
            "INSERT INTO billing_payment_methods (
                id, customer_id, stripe_payment_method_id, type, card_brand, card_last4,
                card_exp_month, card_exp_year, is_default, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                &payment_method_info.id,
                &payment_method_info.customer_id,
                &payment_method_info.stripe_payment_method_id,
                &payment_method_info.payment_type,
                &payment_method_info.card_brand,
                &payment_method_info.card_last4,
                &payment_method_info.card_exp_month,
                &payment_method_info.card_exp_year,
                0, // is_default
                payment_method_info.created_at,
                payment_method_info.updated_at,
            ],
        )?;

        Ok(payment_method_info)
    }

    /// Set default payment method for a customer
    pub async fn set_default_payment_method(
        &self,
        customer_stripe_id: &str,
        payment_method_id: &str,
    ) -> Result<()> {
        let customer_id = CustomerId::from(customer_stripe_id);
        let pm_id = PaymentMethodId::from(payment_method_id);

        // Update customer's default payment method in Stripe
        let mut update_params = stripe::UpdateCustomer::new();
        update_params.invoice_settings = Some(stripe::InvoiceSettingsParams {
            default_payment_method: Some(pm_id.clone()),
            ..Default::default()
        });

        Customer::update(&self.client, &customer_id, update_params).await?;

        // Update database
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        let customer_db_id: String = db.query_row(
            "SELECT id FROM billing_customers WHERE stripe_customer_id = ?1",
            rusqlite::params![customer_stripe_id],
            |row| row.get(0),
        )?;

        let now = Utc::now().timestamp();

        // Unset all other payment methods as default
        db.execute(
            "UPDATE billing_payment_methods SET is_default = 0, updated_at = ?1 WHERE customer_id = ?2",
            rusqlite::params![now, customer_db_id],
        )?;

        // Set this payment method as default
        db.execute(
            "UPDATE billing_payment_methods SET is_default = 1, updated_at = ?1 
             WHERE customer_id = ?2 AND stripe_payment_method_id = ?3",
            rusqlite::params![now, customer_db_id, payment_method_id],
        )?;

        Ok(())
    }

    /// Create a Setup Intent for adding a new payment method
    pub async fn create_setup_intent(&self, customer_stripe_id: &str) -> Result<String> {
        let customer_id = CustomerId::from(customer_stripe_id);

        let mut params = CreateSetupIntent::new();
        params.customer = Some(customer_id);
        params.usage = Some(stripe::SetupIntentUsage::OffSession);
        params.payment_method_types = Some(vec![stripe::PaymentMethodType::Card]);

        let setup_intent = SetupIntent::create(&self.client, params).await?;

        Ok(setup_intent.client_secret.unwrap_or_default())
    }

    /// Detach (delete) a payment method
    pub async fn detach_payment_method(&self, payment_method_id: &str) -> Result<()> {
        let pm_id = PaymentMethodId::from(payment_method_id);

        // Detach payment method from customer in Stripe
        PaymentMethod::detach(&self.client, &pm_id, Default::default()).await?;

        // Remove from database
        let db = self
            .db
            .lock()
            .map_err(|_| anyhow!("Failed to lock database"))?;

        db.execute(
            "DELETE FROM billing_payment_methods WHERE stripe_payment_method_id = ?1",
            rusqlite::params![payment_method_id],
        )?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Arc<Mutex<Connection>> {
        let conn = Connection::open_in_memory().unwrap();
        crate::db::migrations::run_migrations(&conn).unwrap();
        Arc::new(Mutex::new(conn))
    }

    #[test]
    fn test_track_usage() {
        let db = setup_test_db();
        let service = StripeService::new("sk_test_xxx".to_string(), db.clone());

        // Create test customer
        let customer_id = Uuid::new_v4().to_string();
        let now = Utc::now().timestamp();

        {
            let conn = db.lock().unwrap();
            conn.execute(
                "INSERT INTO billing_customers (id, stripe_customer_id, email, name, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![&customer_id, "cus_test", "test@example.com", "Test User", now, now],
            )
            .unwrap();
        }

        // Track usage
        service
            .track_usage(
                &customer_id,
                "automation_execution",
                5,
                now,
                now + 86400,
                None,
            )
            .unwrap();

        // Get usage stats
        let stats = service.get_usage(&customer_id, now, now + 86400).unwrap();
        assert_eq!(stats.automations_executed, 5);
    }
}
