//! MCP Desktop Extensions System
//!
//! This module provides a one-click extension installation system for MCP servers,
//! inspired by Claude Desktop's .mcpb format. Extensions are packaged as .agiext files
//! (ZIP archives) containing a manifest, server files, and bundled dependencies.
//!
//! ## Package Format (.agiext)
//!
//! An .agiext file is a ZIP archive with the following structure:
//! ```text
//! extension.agiext/
//!   manifest.json          # Extension metadata and configuration schema
//!   server/                # Server implementation files
//!     index.js             # Entry point (or binary executable)
//!     package.json         # Node.js dependencies (optional)
//!     ...
//!   assets/                # Optional assets (icons, etc.)
//! ```
//!
//! ## Features
//!
//! - One-click installation from .agiext packages
//! - Automatic dependency installation for Node.js extensions
//! - Secure credential configuration via config schema
//! - Extension lifecycle management (enable/disable/uninstall)
//! - Update checking and automatic updates
//! - SQLite-backed persistence of extension state
//!
//! ## Example Usage
//!
//! ```rust,ignore
//! use crate::core::mcp::extensions::{ExtensionManager, ExtensionInstaller};
//!
//! // Install an extension
//! let installer = ExtensionInstaller::new();
//! let extension = installer.install_from_file("/path/to/slack.agiext").await?;
//!
//! // Enable the extension
//! let manager = ExtensionManager::new(db_conn);
//! manager.enable_extension(&extension.id).await?;
//! ```

mod error;
mod installer;
mod manager;
mod manifest;
mod package;
mod repository;

pub use error::{ExtensionError, ExtensionResult};
pub use installer::{ExtensionInstaller, InstallPhase, InstallProgress, InstallResult};
pub use manager::{ExtensionInfo, ExtensionManager, UpdateInfo};
pub use manifest::{
    ConfigProperty, ConfigSchema, ExtensionCapability, ExtensionManifest, ExtensionTool,
    ToolParameter, TransportType,
};
pub use package::ExtensionPackage;
pub use repository::{ExtensionRecord, ExtensionRepository, ExtensionStatus};

/// File extension for AGI Workforce extension packages
pub const EXTENSION_FILE_EXTENSION: &str = "agiext";

/// Maximum allowed size for an extension package (50 MB)
pub const MAX_PACKAGE_SIZE: u64 = 50 * 1024 * 1024;

/// Maximum number of files allowed in an extension package
pub const MAX_PACKAGE_FILES: usize = 1000;

/// Minimum required manifest version
pub const MIN_MANIFEST_VERSION: &str = "1.0.0";
