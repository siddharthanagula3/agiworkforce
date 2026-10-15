//! Artifacts Module for AGI Workforce
//!
//! Provides artifact types, storage and versioning capabilities
//! inspired by Claude Desktop's artifact system. Artifacts are versioned
//! documents that can be previewed live alongside chat conversations.

pub mod persistence;
mod store;
mod types;

pub use store::{
    create_shared_store, create_shared_store_with_db, ArtifactStore, SharedArtifactStore,
};
pub use types::*;

#[cfg(test)]
mod tests;
