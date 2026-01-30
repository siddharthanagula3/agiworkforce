//! Built-in diagnostic checks
//!
//! This module provides the default set of health checks for AGI Workforce.

mod auth_health;
mod config_validation;
mod database_integrity;
mod dependency;
mod disk_space;
mod mcp_connectivity;
mod network;
mod permissions;

pub use auth_health::AuthHealthCheck;
pub use config_validation::ConfigValidationCheck;
pub use database_integrity::DatabaseIntegrityCheck;
pub use dependency::DependencyCheck;
pub use disk_space::DiskSpaceCheck;
pub use mcp_connectivity::McpConnectivityCheck;
pub use network::NetworkCheck;
pub use permissions::PermissionsCheck;

use crate::sys::diagnostics::DiagnosticCheck;
use std::sync::Arc;

/// Returns all built-in diagnostic checks
#[must_use]
pub fn all_checks() -> Vec<Arc<dyn DiagnosticCheck>> {
    vec![
        Arc::new(ConfigValidationCheck),
        Arc::new(AuthHealthCheck),
        Arc::new(McpConnectivityCheck),
        Arc::new(DatabaseIntegrityCheck),
        Arc::new(DiskSpaceCheck),
        Arc::new(NetworkCheck),
        Arc::new(PermissionsCheck),
        Arc::new(DependencyCheck),
    ]
}

/// Returns critical checks only (subset that must pass for app to function)
#[must_use]
pub fn critical_checks() -> Vec<Arc<dyn DiagnosticCheck>> {
    all_checks()
        .into_iter()
        .filter(|c| c.is_critical())
        .collect()
}

/// Returns checks by category
#[must_use]
pub fn checks_by_category(category: &str) -> Vec<Arc<dyn DiagnosticCheck>> {
    all_checks()
        .into_iter()
        .filter(|c| c.category() == category)
        .collect()
}
