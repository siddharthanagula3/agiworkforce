//! Extension installer
//!
//! Handles the extraction, validation, and installation of extension packages.
//! Supports Node.js dependency installation and MCP registration.

use super::repository::{ExtensionRecord, ExtensionStatus};
use super::{ExtensionError, ExtensionPackage, ExtensionRepository, ExtensionResult};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tokio::process::Command;
use zip::ZipArchive;

/// Progress information during installation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    /// Extension ID being installed
    pub extension_id: String,

    /// Current installation phase
    pub phase: InstallPhase,

    /// Progress percentage (0-100)
    pub progress: u8,

    /// Human-readable status message
    pub message: String,
}

/// Installation phases
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum InstallPhase {
    /// Validating the package
    Validating,

    /// Extracting files
    Extracting,

    /// Installing dependencies
    Dependencies,

    /// Registering with MCP
    Registering,

    /// Finalizing installation
    Finalizing,

    /// Installation complete
    Complete,

    /// Installation failed
    Failed,
}

/// Result of an installation operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    /// Extension ID
    pub extension_id: String,

    /// Extension name
    pub name: String,

    /// Installed version
    pub version: String,

    /// Installation path
    pub install_path: PathBuf,

    /// Whether the extension was updated (vs fresh install)
    pub was_update: bool,
}

/// Callback type for progress updates
pub type ProgressCallback = Box<dyn Fn(InstallProgress) + Send + Sync>;

/// Extension installer
pub struct ExtensionInstaller {
    /// Base directory for extensions
    extensions_dir: PathBuf,

    /// Optional progress callback
    progress_callback: Option<ProgressCallback>,

    /// Optional Tauri app handle for emitting progress events directly.
    /// When set, `emit_progress` sends `extension:install-progress` events
    /// to the frontend in addition to calling `progress_callback`.
    app_handle: Option<tauri::AppHandle>,
}

impl ExtensionInstaller {
    /// Create a new installer with the default extensions directory
    pub fn new() -> ExtensionResult<Self> {
        let extensions_dir = Self::default_extensions_dir()?;
        Ok(Self {
            extensions_dir,
            progress_callback: None,
            app_handle: None,
        })
    }

    /// Create a new installer with a custom extensions directory
    pub fn with_dir(extensions_dir: PathBuf) -> Self {
        Self {
            extensions_dir,
            progress_callback: None,
            app_handle: None,
        }
    }

    /// Set a progress callback
    pub fn with_progress_callback(mut self, callback: ProgressCallback) -> Self {
        self.progress_callback = Some(callback);
        self
    }

    /// Set a Tauri app handle so progress events are emitted to the frontend.
    pub fn with_app_handle(mut self, handle: tauri::AppHandle) -> Self {
        self.app_handle = Some(handle);
        self
    }

    /// Get the default extensions directory
    pub fn default_extensions_dir() -> ExtensionResult<PathBuf> {
        let data_dir = dirs::data_dir().ok_or_else(|| {
            ExtensionError::DirectoryCreationFailed(
                "Could not determine application data directory".to_string(),
            )
        })?;

        Ok(data_dir.join("agiworkforce").join("extensions"))
    }

    /// Install an extension from a file path
    ///
    /// # Arguments
    ///
    /// * `path` - Path to the .agiext file
    /// * `repository` - Extension repository for persistence
    ///
    /// # Returns
    ///
    /// Installation result with extension details
    pub async fn install_from_file<P: AsRef<Path>>(
        &self,
        path: P,
        repository: &ExtensionRepository,
    ) -> ExtensionResult<InstallResult> {
        let path = path.as_ref();

        // Phase 1: Validate package
        self.emit_progress(InstallProgress {
            extension_id: "unknown".to_string(),
            phase: InstallPhase::Validating,
            progress: 0,
            message: "Validating extension package...".to_string(),
        });

        let package = ExtensionPackage::from_file(path)?;
        let extension_id = package.id().to_string();

        self.emit_progress(InstallProgress {
            extension_id: extension_id.clone(),
            phase: InstallPhase::Validating,
            progress: 20,
            message: format!("Validated {} v{}", package.name(), package.version()),
        });

        // Check if already installed
        let was_update = repository.exists(&extension_id)?;
        if was_update {
            // Mark existing as updating
            repository.update_status(&extension_id, ExtensionStatus::Updating, None)?;
        }

        // Phase 2: Extract files
        self.emit_progress(InstallProgress {
            extension_id: extension_id.clone(),
            phase: InstallPhase::Extracting,
            progress: 30,
            message: "Extracting extension files...".to_string(),
        });

        let install_path = self.extract_package(path, &package)?;

        self.emit_progress(InstallProgress {
            extension_id: extension_id.clone(),
            phase: InstallPhase::Extracting,
            progress: 50,
            message: "Files extracted successfully".to_string(),
        });

        // Phase 3: Install dependencies (if needed)
        if package.has_node_dependencies() {
            self.emit_progress(InstallProgress {
                extension_id: extension_id.clone(),
                phase: InstallPhase::Dependencies,
                progress: 55,
                message: "Installing Node.js dependencies...".to_string(),
            });

            self.install_node_dependencies(&install_path).await?;

            self.emit_progress(InstallProgress {
                extension_id: extension_id.clone(),
                phase: InstallPhase::Dependencies,
                progress: 75,
                message: "Dependencies installed".to_string(),
            });
        }

        // Phase 4: Register with database
        self.emit_progress(InstallProgress {
            extension_id: extension_id.clone(),
            phase: InstallPhase::Registering,
            progress: 80,
            message: "Registering extension...".to_string(),
        });

        let record = ExtensionRecord {
            id: extension_id.clone(),
            name: package.manifest.name.clone(),
            version: package.manifest.version.clone(),
            description: package.manifest.description.clone(),
            author: package.manifest.author.clone(),
            install_path: install_path.clone(),
            manifest_json: package.manifest_raw.clone(),
            status: ExtensionStatus::Disabled,
            last_error: None,
            config_json: None,
            package_hash: package.package_hash.clone(),
            installed_at: Utc::now(),
            updated_at: Utc::now(),
            last_started_at: None,
            use_count: 0,
        };

        if was_update {
            repository.update(&record)?;
        } else {
            repository.insert(&record)?;
        }

        // Phase 5: Finalize
        self.emit_progress(InstallProgress {
            extension_id: extension_id.clone(),
            phase: InstallPhase::Finalizing,
            progress: 95,
            message: "Finalizing installation...".to_string(),
        });

        // Copy icon if present
        if let Some(ref icon_path) = package.manifest.icon {
            self.copy_icon(&install_path, icon_path)?;
        }

        self.emit_progress(InstallProgress {
            extension_id: extension_id.clone(),
            phase: InstallPhase::Complete,
            progress: 100,
            message: format!(
                "{} v{} installed successfully",
                package.name(),
                package.version()
            ),
        });

        Ok(InstallResult {
            extension_id,
            name: package.manifest.name,
            version: package.manifest.version,
            install_path,
            was_update,
        })
    }

    /// Extract the package to the extensions directory
    fn extract_package<P: AsRef<Path>>(
        &self,
        package_path: P,
        package: &ExtensionPackage,
    ) -> ExtensionResult<PathBuf> {
        let extension_id = package.id();
        let install_path = self.extensions_dir.join(extension_id);

        // Create or clean the installation directory
        if install_path.exists() {
            std::fs::remove_dir_all(&install_path).map_err(|e| {
                ExtensionError::ExtractionFailed(format!(
                    "Failed to clean existing directory: {}",
                    e
                ))
            })?;
        }
        std::fs::create_dir_all(&install_path).map_err(|e| {
            ExtensionError::DirectoryCreationFailed(format!(
                "Failed to create installation directory: {}",
                e
            ))
        })?;

        // Open and extract the ZIP
        let file = std::fs::File::open(package_path.as_ref())?;
        let mut archive = ZipArchive::new(file)?;

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)?;
            let entry_path = entry.name().to_string();

            // Guard against ZIP path traversal attacks: reject entries with absolute
            // paths or components that escape the install directory (e.g. "../").
            let _output_path = install_path.join(&entry_path);
            let canonical_install = install_path
                .canonicalize()
                .unwrap_or_else(|_| install_path.to_path_buf());
            // For new (not-yet-created) paths we check the normalized join result.
            let normalized = {
                // Strip any ".." components by resolving against the install root.
                let mut base = canonical_install.clone();
                for component in std::path::Path::new(&entry_path).components() {
                    match component {
                        std::path::Component::ParentDir => {
                            return Err(ExtensionError::ExtractionFailed(format!(
                                "Rejected ZIP entry with path traversal: {}",
                                entry_path
                            )));
                        }
                        std::path::Component::RootDir | std::path::Component::Prefix(_) => {
                            return Err(ExtensionError::ExtractionFailed(format!(
                                "Rejected ZIP entry with absolute path: {}",
                                entry_path
                            )));
                        }
                        std::path::Component::Normal(c) => base.push(c),
                        std::path::Component::CurDir => {}
                    }
                }
                base
            };
            if !normalized.starts_with(&canonical_install) {
                return Err(ExtensionError::ExtractionFailed(format!(
                    "Rejected ZIP entry that escapes install directory: {}",
                    entry_path
                )));
            }
            let output_path = normalized;

            if entry.is_dir() {
                std::fs::create_dir_all(&output_path).map_err(|e| {
                    ExtensionError::ExtractionFailed(format!(
                        "Failed to create directory {}: {}",
                        entry_path, e
                    ))
                })?;
            } else {
                // Ensure parent directory exists
                if let Some(parent) = output_path.parent() {
                    std::fs::create_dir_all(parent).map_err(|e| {
                        ExtensionError::ExtractionFailed(format!(
                            "Failed to create parent directory: {}",
                            e
                        ))
                    })?;
                }

                // Write the file
                let mut output_file = std::fs::File::create(&output_path).map_err(|e| {
                    ExtensionError::ExtractionFailed(format!(
                        "Failed to create file {}: {}",
                        entry_path, e
                    ))
                })?;

                let mut buffer = Vec::new();
                entry.read_to_end(&mut buffer).map_err(|e| {
                    ExtensionError::ExtractionFailed(format!(
                        "Failed to read file {}: {}",
                        entry_path, e
                    ))
                })?;

                output_file.write_all(&buffer).map_err(|e| {
                    ExtensionError::ExtractionFailed(format!(
                        "Failed to write file {}: {}",
                        entry_path, e
                    ))
                })?;

                // Set executable permission for Unix
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    if entry_path.ends_with(".sh")
                        || entry_path.contains("/bin/")
                        || entry.unix_mode().map(|m| m & 0o111 != 0).unwrap_or(false)
                    {
                        let mut perms = output_file.metadata()?.permissions();
                        perms.set_mode(perms.mode() | 0o111);
                        std::fs::set_permissions(&output_path, perms)?;
                    }
                }
            }
        }

        tracing::info!(
            "Extension {} extracted to {}",
            extension_id,
            install_path.display()
        );

        Ok(install_path)
    }

    /// Install Node.js dependencies
    async fn install_node_dependencies(&self, install_path: &Path) -> ExtensionResult<()> {
        // Check for package.json in server directory first, then root
        let package_json_paths = [
            install_path.join("server").join("package.json"),
            install_path.join("package.json"),
        ];

        let npm_dir = package_json_paths
            .iter()
            .find(|p| p.exists())
            .and_then(|p| p.parent())
            .ok_or_else(|| {
                ExtensionError::DependencyInstallFailed("No package.json found".to_string())
            })?;

        tracing::info!("Installing npm dependencies in {}", npm_dir.display());

        // Run npm install
        // --ignore-scripts prevents malicious postinstall scripts from executing arbitrary code
        let output = if cfg!(target_os = "windows") {
            Command::new("cmd")
                .args(["/C", "npm", "install", "--production", "--ignore-scripts"])
                .current_dir(npm_dir)
                .output()
                .await
        } else {
            Command::new("npm")
                .args(["install", "--production", "--ignore-scripts"])
                .current_dir(npm_dir)
                .output()
                .await
        };

        match output {
            Ok(output) => {
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    tracing::error!("npm install failed: {}", stderr);
                    return Err(ExtensionError::DependencyInstallFailed(stderr.to_string()));
                }
                tracing::info!("npm install completed successfully");
                Ok(())
            }
            Err(e) => {
                tracing::error!("Failed to run npm: {}", e);
                Err(ExtensionError::DependencyInstallFailed(format!(
                    "Failed to run npm: {}. Is Node.js installed?",
                    e
                )))
            }
        }
    }

    /// Copy the extension icon to a standard location
    fn copy_icon(&self, install_path: &Path, icon_path: &str) -> ExtensionResult<()> {
        let source = install_path.join(icon_path);
        if source.exists() {
            let dest = install_path.join("icon.png");
            if source != dest {
                std::fs::copy(&source, &dest)?;
            }
        }
        Ok(())
    }

    /// Emit a progress update via Tauri event and/or callback.
    fn emit_progress(&self, progress: InstallProgress) {
        tracing::debug!(
            "Install progress: {} - {:?} {}%",
            progress.extension_id,
            progress.phase,
            progress.progress
        );

        // Emit Tauri event to frontend when app_handle is available
        if let Some(ref app_handle) = self.app_handle {
            use tauri::Emitter;
            if let Err(e) = app_handle.emit("extension:install-progress", &progress) {
                tracing::warn!(
                    "Failed to emit extension:install-progress event: {}",
                    e
                );
            }
        }

        if let Some(ref callback) = self.progress_callback {
            callback(progress);
        }
    }

    /// Uninstall an extension
    ///
    /// Removes the extension files and database record
    pub async fn uninstall(
        &self,
        extension_id: &str,
        repository: &ExtensionRepository,
    ) -> ExtensionResult<()> {
        // Get the extension record
        let record = repository
            .get(extension_id)?
            .ok_or_else(|| ExtensionError::NotFound(extension_id.to_string()))?;

        // Check if running
        if record.status == ExtensionStatus::Running {
            return Err(ExtensionError::InUse(extension_id.to_string()));
        }

        // Mark as pending removal
        repository.update_status(extension_id, ExtensionStatus::PendingRemoval, None)?;

        // Remove the installation directory
        if record.install_path.exists() {
            std::fs::remove_dir_all(&record.install_path).map_err(|e| {
                ExtensionError::IoError(std::io::Error::other(format!(
                    "Failed to remove extension directory: {}",
                    e
                )))
            })?;
        }

        // Remove from database
        repository.delete(extension_id)?;

        tracing::info!("Extension {} uninstalled", extension_id);

        Ok(())
    }

    /// Get the installation path for an extension
    pub fn get_install_path(&self, extension_id: &str) -> PathBuf {
        self.extensions_dir.join(extension_id)
    }
}

impl Default for ExtensionInstaller {
    fn default() -> Self {
        Self::new().unwrap_or_else(|_| {
            // Fall back to a platform-appropriate temp directory rather than a
            // Unix-only `/tmp` path (which does not exist on Windows).
            let fallback = std::env::temp_dir().join("agiworkforce-extensions");
            Self {
                extensions_dir: fallback,
                progress_callback: None,
                app_handle: None,
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn create_test_package(dir: &Path) -> PathBuf {
        let package_path = dir.join("test.agiext");
        let file = std::fs::File::create(&package_path).unwrap();
        let mut zip = ZipWriter::new(file);

        // Add manifest
        let manifest = r#"{
            "id": "test-extension",
            "name": "Test Extension",
            "version": "1.0.0",
            "description": "A test extension",
            "command": "node",
            "args": ["server/index.js"]
        }"#;
        let options = SimpleFileOptions::default();
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(manifest.as_bytes()).unwrap();

        // Add server file
        zip.start_file("server/index.js", options).unwrap();
        zip.write_all(b"console.log('hello');").unwrap();

        zip.finish().unwrap();
        package_path
    }

    #[test]
    fn test_default_extensions_dir() {
        let dir = ExtensionInstaller::default_extensions_dir();
        assert!(dir.is_ok());
        let dir = dir.unwrap();
        assert!(dir.to_string_lossy().contains("agiworkforce"));
        assert!(dir.to_string_lossy().contains("extensions"));
    }

    #[tokio::test]
    async fn test_extract_package() {
        let temp_dir = tempdir().unwrap();
        let package_path = create_test_package(temp_dir.path());

        let installer = ExtensionInstaller::with_dir(temp_dir.path().join("extensions"));
        let package = ExtensionPackage::from_file(&package_path).unwrap();

        let install_path = installer.extract_package(&package_path, &package).unwrap();

        assert!(install_path.exists());
        assert!(install_path.join("manifest.json").exists());
        assert!(install_path.join("server/index.js").exists());
    }
}
