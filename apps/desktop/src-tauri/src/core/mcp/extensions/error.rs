//! Extension error types
//!
//! Provides a comprehensive error type hierarchy for extension operations,
//! with user-friendly error messages that avoid technical jargon.

use std::io;
use thiserror::Error;

/// Result type alias for extension operations
pub type ExtensionResult<T> = Result<T, ExtensionError>;

/// Errors that can occur during extension operations
#[derive(Error, Debug)]
pub enum ExtensionError {
    /// The extension package file could not be found
    #[error("Extension package not found at the specified location")]
    PackageNotFound(String),

    /// The extension package is not a valid ZIP file
    #[error("This file is not a valid extension package")]
    InvalidPackage(String),

    /// The package exceeds the maximum allowed size
    #[error("Extension package is too large (maximum 50 MB)")]
    PackageTooLarge { size: u64, max_size: u64 },

    /// The package contains too many files
    #[error("Extension package contains too many files")]
    TooManyFiles { count: usize, max_count: usize },

    /// The manifest.json file is missing from the package
    #[error("Extension package is missing the required manifest.json file")]
    ManifestMissing,

    /// The manifest.json file contains invalid JSON
    #[error("Extension manifest is not valid: {0}")]
    ManifestInvalid(String),

    /// A required field is missing from the manifest
    #[error("Extension manifest is missing required field: {0}")]
    ManifestMissingField(String),

    /// The manifest version is not supported
    #[error("Extension requires a newer version of AGI Workforce")]
    UnsupportedManifestVersion { found: String, minimum: String },

    /// The extension ID is not valid
    #[error("Extension ID is not valid: {0}")]
    InvalidExtensionId(String),

    /// An extension with this ID is already installed
    #[error("An extension with ID '{0}' is already installed")]
    AlreadyInstalled(String),

    /// The extension could not be found
    #[error("Extension '{0}' is not installed")]
    NotFound(String),

    /// Failed to create the extensions directory
    #[error("Could not create extensions directory: {0}")]
    DirectoryCreationFailed(String),

    /// Failed to extract the extension package
    #[error("Could not extract extension package: {0}")]
    ExtractionFailed(String),

    /// Failed to install dependencies
    #[error("Could not install extension dependencies: {0}")]
    DependencyInstallFailed(String),

    /// The extension server file is missing
    #[error("Extension server entry point not found")]
    ServerFileMissing,

    /// Failed to register the extension with MCP
    #[error("Could not register extension with MCP: {0}")]
    RegistrationFailed(String),

    /// Database operation failed
    #[error("Database error: {0}")]
    DatabaseError(String),

    /// File system operation failed
    #[error("File system error: {0}")]
    IoError(#[from] io::Error),

    /// JSON serialization/deserialization failed
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),

    /// ZIP archive operation failed
    #[error("Archive error: {0}")]
    ZipError(String),

    /// The extension is currently in use and cannot be modified
    #[error("Extension is currently in use")]
    InUse(String),

    /// The operation was cancelled
    #[error("Operation was cancelled")]
    Cancelled,

    /// Network error during download
    #[error("Network error: {0}")]
    NetworkError(String),

    /// Checksum verification failed
    #[error("Extension package integrity check failed")]
    ChecksumMismatch,

    /// The extension contains potentially unsafe files
    #[error("Extension contains potentially unsafe content: {0}")]
    SecurityViolation(String),

    /// Configuration value is invalid
    #[error("Invalid configuration: {0}")]
    InvalidConfiguration(String),

    /// The extension is not enabled
    #[error("Extension '{0}' is not enabled")]
    NotEnabled(String),

    /// Failed to start the extension server
    #[error("Could not start extension: {0}")]
    StartFailed(String),

    /// Failed to stop the extension server
    #[error("Could not stop extension: {0}")]
    StopFailed(String),
}

impl From<zip::result::ZipError> for ExtensionError {
    fn from(err: zip::result::ZipError) -> Self {
        ExtensionError::ZipError(err.to_string())
    }
}

impl From<rusqlite::Error> for ExtensionError {
    fn from(err: rusqlite::Error) -> Self {
        ExtensionError::DatabaseError(err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display_messages() {
        let err = ExtensionError::PackageNotFound("/path/to/file.agiext".to_string());
        assert_eq!(
            err.to_string(),
            "Extension package not found at the specified location"
        );

        let err = ExtensionError::PackageTooLarge {
            size: 100 * 1024 * 1024,
            max_size: 50 * 1024 * 1024,
        };
        assert_eq!(
            err.to_string(),
            "Extension package is too large (maximum 50 MB)"
        );

        let err = ExtensionError::AlreadyInstalled("slack".to_string());
        assert_eq!(
            err.to_string(),
            "An extension with ID 'slack' is already installed"
        );
    }

    #[test]
    fn test_error_from_io() {
        let io_err = io::Error::new(io::ErrorKind::NotFound, "file not found");
        let ext_err: ExtensionError = io_err.into();
        assert!(matches!(ext_err, ExtensionError::IoError(_)));
    }
}
