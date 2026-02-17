//! Artifacts Module for AGI Workforce
//!
//! Provides artifact types, storage, versioning, and rendering capabilities
//! inspired by Claude Desktop's artifact system. Artifacts are versioned
//! documents that can be previewed live alongside chat conversations.

mod renderer;
mod store;
mod types;

pub use renderer::{ArtifactRenderer, RenderedArtifact, RenderedContent};
pub use store::{create_shared_store, ArtifactStore, ArtifactStoreStats, SharedArtifactStore};
pub use types::*;

#[cfg(test)]
mod tests;
