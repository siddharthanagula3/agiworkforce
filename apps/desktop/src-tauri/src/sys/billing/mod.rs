use std::sync::Arc;
use tokio::sync::Mutex;

pub mod models;

pub struct BillingState;

impl BillingState {
    pub fn new() -> Self {
        Self
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
