#[cfg(feature = "billing")]
use anyhow::Result;

pub mod models;
#[cfg(feature = "billing")]
pub mod stripe_client;
#[cfg(feature = "billing")]
pub mod webhooks;

#[cfg(feature = "billing")]
pub use stripe_client::StripeService;

use std::sync::Arc;
use tokio::sync::Mutex;

#[cfg(feature = "billing")]
pub struct BillingState {
    stripe_service: Option<StripeService>,
}

#[cfg(not(feature = "billing"))]
pub struct BillingState {
    _phantom: std::marker::PhantomData<()>,
}

#[cfg(feature = "billing")]
impl BillingState {
    pub fn new() -> Self {
        Self {
            stripe_service: None,
        }
    }

    pub fn stripe_service(&self) -> Result<&StripeService> {
        self.stripe_service
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Stripe service not initialized"))
    }

    pub fn check_cloud_access(&self) -> bool {
        if let Some(service) = &self.stripe_service {
            matches!(service.get_primary_subscription(), Ok(Some(_)))
        } else {
            // Desktop billing is server-authoritative. When no local Stripe
            // service is configured, entitlement checks happen in the managed
            // web/API boundary instead of through renderer-exposed commands.
            true
        }
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
