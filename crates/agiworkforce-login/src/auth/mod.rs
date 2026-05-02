mod agent_identity;
pub mod default_client;
pub mod error;
mod storage;
mod util;

mod external_bearer;
mod manager;
mod revoke;

pub use agiworkforce_config::types::AuthCredentialsStoreMode;
pub use error::RefreshTokenFailedError;
pub use error::RefreshTokenFailedReason;
pub use manager::*;

/// Backwards-compat alias matching `crate::AgiWorkforceAuth`.
pub type AgiWorkforceAuth = AgiworkforceAuth;
