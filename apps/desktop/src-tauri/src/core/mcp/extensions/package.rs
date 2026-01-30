//! Extension package parser and validator
//!
//! Handles reading and validating .agiext extension packages.
//! Performs security checks to prevent malicious content.

use super::{
    ExtensionError, ExtensionManifest, ExtensionResult, EXTENSION_FILE_EXTENSION,
    MAX_PACKAGE_FILES, MAX_PACKAGE_SIZE, MIN_MANIFEST_VERSION,
};
use std::collections::HashSet;
use std::io::{Read, Seek};
use std::path::Path;
use zip::ZipArchive;

/// Represents a parsed extension package
#[derive(Debug)]
pub struct ExtensionPackage {
    /// The parsed manifest
    pub manifest: ExtensionManifest,

    /// Raw manifest JSON for storage
    pub manifest_raw: String,

    /// List of files in the package
    pub files: Vec<PackageFile>,

    /// Total uncompressed size in bytes
    pub total_size: u64,

    /// SHA-256 hash of the package file
    pub package_hash: String,
}

/// Information about a file in the package
#[derive(Debug, Clone)]
pub struct PackageFile {
    /// Path within the archive
    pub path: String,

    /// Uncompressed file size
    pub size: u64,

    /// Whether this is a directory
    pub is_directory: bool,
}

/// File extensions that are not allowed in packages for security
const BLOCKED_EXTENSIONS: &[&str] = &[
    ".exe", ".dll", ".so", ".dylib", ".bat", ".cmd", ".ps1", ".sh", ".bash", ".zsh", ".com",
    ".scr", ".msi", ".dmg", ".pkg", ".deb", ".rpm", ".app",
];

/// Paths that are not allowed in packages
const BLOCKED_PATHS: &[&str] = &[
    "..", "~", "/etc", "/usr", "/var", "/root", "/home", "C:\\", "\\\\",
];

impl ExtensionPackage {
    /// Parse and validate an extension package from a file path
    ///
    /// # Arguments
    ///
    /// * `path` - Path to the .agiext file
    ///
    /// # Returns
    ///
    /// A validated `ExtensionPackage` or an error
    ///
    /// # Security
    ///
    /// This function performs extensive security checks:
    /// - Validates file extension
    /// - Checks package size limits
    /// - Validates ZIP structure
    /// - Checks for path traversal attacks
    /// - Blocks potentially dangerous file types
    /// - Validates manifest structure
    pub fn from_file<P: AsRef<Path>>(path: P) -> ExtensionResult<Self> {
        let path = path.as_ref();

        // Check file exists
        if !path.exists() {
            return Err(ExtensionError::PackageNotFound(path.display().to_string()));
        }

        // Validate file extension
        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if extension != EXTENSION_FILE_EXTENSION {
            return Err(ExtensionError::InvalidPackage(format!(
                "Expected .{} file, got .{}",
                EXTENSION_FILE_EXTENSION, extension
            )));
        }

        // Check file size
        let metadata = std::fs::metadata(path)?;
        let file_size = metadata.len();
        if file_size > MAX_PACKAGE_SIZE {
            return Err(ExtensionError::PackageTooLarge {
                size: file_size,
                max_size: MAX_PACKAGE_SIZE,
            });
        }

        // Calculate hash before opening
        let package_hash = Self::calculate_file_hash(path)?;

        // Open the ZIP archive
        let file = std::fs::File::open(path)?;
        Self::from_reader(file, package_hash)
    }

    /// Parse and validate an extension package from a reader
    pub fn from_reader<R: Read + Seek>(reader: R, package_hash: String) -> ExtensionResult<Self> {
        let mut archive = ZipArchive::new(reader)?;

        // Check file count
        let file_count = archive.len();
        if file_count > MAX_PACKAGE_FILES {
            return Err(ExtensionError::TooManyFiles {
                count: file_count,
                max_count: MAX_PACKAGE_FILES,
            });
        }

        // Collect file information and find manifest
        let mut files = Vec::with_capacity(file_count);
        let mut manifest_raw = None;
        let mut total_size = 0u64;

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)?;
            let name = entry.name().to_string();
            let size = entry.size();
            let is_dir = entry.is_dir();

            // Security: Check for path traversal
            Self::validate_path(&name)?;

            // Security: Check for blocked file types
            if !is_dir {
                Self::validate_file_extension(&name)?;
            }

            total_size += size;

            // Read manifest if found
            if name == "manifest.json" && !is_dir {
                let mut contents = String::new();
                entry
                    .read_to_string(&mut contents)
                    .map_err(|e| ExtensionError::ManifestInvalid(e.to_string()))?;
                manifest_raw = Some(contents);
            }

            files.push(PackageFile {
                path: name,
                size,
                is_directory: is_dir,
            });
        }

        // Manifest is required
        let manifest_raw = manifest_raw.ok_or(ExtensionError::ManifestMissing)?;

        // Parse and validate manifest
        let manifest: ExtensionManifest = serde_json::from_str(&manifest_raw)
            .map_err(|e| ExtensionError::ManifestInvalid(e.to_string()))?;

        // Validate manifest fields
        manifest
            .validate()
            .map_err(|errors| ExtensionError::ManifestInvalid(errors.join("; ")))?;

        // Check manifest version compatibility
        Self::check_manifest_version(&manifest.manifest_version)?;

        // Verify server entry point exists
        Self::verify_server_exists(&manifest, &files)?;

        Ok(ExtensionPackage {
            manifest,
            manifest_raw,
            files,
            total_size,
            package_hash,
        })
    }

    /// Validate a file path for security issues
    fn validate_path(path: &str) -> ExtensionResult<()> {
        // Normalize path separators
        let normalized = path.replace('\\', "/");

        // Check for path traversal
        for blocked in BLOCKED_PATHS {
            // Normalize the blocked pattern too
            let blocked_normalized = blocked.replace('\\', "/");
            if normalized.contains(&blocked_normalized) {
                return Err(ExtensionError::SecurityViolation(format!(
                    "Path contains blocked pattern: {}",
                    blocked
                )));
            }
        }

        // Check for Windows drive letters (e.g., "C:", "D:", etc.)
        if normalized.len() >= 2 {
            let chars: Vec<char> = normalized.chars().take(2).collect();
            if chars[0].is_ascii_alphabetic() && chars[1] == ':' {
                return Err(ExtensionError::SecurityViolation(
                    "Windows absolute paths are not allowed".to_string(),
                ));
            }
        }

        // Check for absolute paths
        if normalized.starts_with('/') {
            return Err(ExtensionError::SecurityViolation(
                "Absolute paths are not allowed".to_string(),
            ));
        }

        // Check for null bytes
        if path.contains('\0') {
            return Err(ExtensionError::SecurityViolation(
                "Path contains null bytes".to_string(),
            ));
        }

        Ok(())
    }

    /// Validate file extension for security
    fn validate_file_extension(path: &str) -> ExtensionResult<()> {
        let lower = path.to_lowercase();

        for blocked in BLOCKED_EXTENSIONS {
            if lower.ends_with(blocked) {
                return Err(ExtensionError::SecurityViolation(format!(
                    "File type {} is not allowed for security reasons",
                    blocked
                )));
            }
        }

        Ok(())
    }

    /// Check manifest version compatibility
    fn check_manifest_version(version: &str) -> ExtensionResult<()> {
        // Simple version comparison - assumes semantic versioning
        let min_parts: Vec<u32> = MIN_MANIFEST_VERSION
            .split('.')
            .filter_map(|s| s.parse().ok())
            .collect();
        let found_parts: Vec<u32> = version
            .split('.')
            .filter_map(|s| s.split('-').next().and_then(|s| s.parse().ok()))
            .collect();

        // Compare major.minor.patch
        for i in 0..3 {
            let min = min_parts.get(i).unwrap_or(&0);
            let found = found_parts.get(i).unwrap_or(&0);

            if found < min {
                return Err(ExtensionError::UnsupportedManifestVersion {
                    found: version.to_string(),
                    minimum: MIN_MANIFEST_VERSION.to_string(),
                });
            } else if found > min {
                break;
            }
        }

        Ok(())
    }

    /// Verify that the server entry point exists in the package
    fn verify_server_exists(
        manifest: &ExtensionManifest,
        files: &[PackageFile],
    ) -> ExtensionResult<()> {
        let entry_point = manifest.server_entry_point();
        let file_set: HashSet<&str> = files.iter().map(|f| f.path.as_str()).collect();

        // Check for the entry point or common variations
        let paths_to_check = vec![
            entry_point.clone(),
            format!("server/{}", entry_point),
            entry_point.replace('/', "\\"),
        ];

        for path in &paths_to_check {
            if file_set.contains(path.as_str()) {
                return Ok(());
            }
        }

        // For node packages, check for package.json instead
        if manifest.has_node_dependencies
            && (file_set.contains("server/package.json") || file_set.contains("package.json"))
        {
            return Ok(());
        }

        Err(ExtensionError::ServerFileMissing)
    }

    /// Calculate SHA-256 hash of a file
    fn calculate_file_hash<P: AsRef<Path>>(path: P) -> ExtensionResult<String> {
        use sha2::{Digest, Sha256};

        let mut file = std::fs::File::open(path)?;
        let mut hasher = Sha256::new();
        let mut buffer = [0u8; 8192];

        loop {
            let bytes_read = file.read(&mut buffer)?;
            if bytes_read == 0 {
                break;
            }
            hasher.update(&buffer[..bytes_read]);
        }

        let hash = hasher.finalize();
        Ok(hex::encode(hash))
    }

    /// Get the installation ID (same as manifest ID)
    pub fn id(&self) -> &str {
        &self.manifest.id
    }

    /// Get the extension name
    pub fn name(&self) -> &str {
        &self.manifest.name
    }

    /// Get the extension version
    pub fn version(&self) -> &str {
        &self.manifest.version
    }

    /// Check if the package has Node.js dependencies
    pub fn has_node_dependencies(&self) -> bool {
        self.manifest.has_node_dependencies
            || self
                .files
                .iter()
                .any(|f| f.path == "package.json" || f.path == "server/package.json")
    }

    /// Get the list of file paths
    pub fn file_paths(&self) -> Vec<&str> {
        self.files.iter().map(|f| f.path.as_str()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_path_security() {
        assert!(ExtensionPackage::validate_path("server/index.js").is_ok());
        assert!(ExtensionPackage::validate_path("assets/icon.png").is_ok());

        assert!(ExtensionPackage::validate_path("../../../etc/passwd").is_err());
        assert!(ExtensionPackage::validate_path("/etc/passwd").is_err());
        assert!(ExtensionPackage::validate_path("~/.ssh/id_rsa").is_err());
        assert!(ExtensionPackage::validate_path("C:\\Windows\\System32").is_err());
    }

    #[test]
    fn test_validate_file_extension() {
        assert!(ExtensionPackage::validate_file_extension("server/index.js").is_ok());
        assert!(ExtensionPackage::validate_file_extension("lib/helper.py").is_ok());
        assert!(ExtensionPackage::validate_file_extension("data.json").is_ok());

        assert!(ExtensionPackage::validate_file_extension("virus.exe").is_err());
        assert!(ExtensionPackage::validate_file_extension("malware.dll").is_err());
        assert!(ExtensionPackage::validate_file_extension("script.bat").is_err());
        assert!(ExtensionPackage::validate_file_extension("install.sh").is_err());
    }

    #[test]
    fn test_check_manifest_version() {
        assert!(ExtensionPackage::check_manifest_version("1.0.0").is_ok());
        assert!(ExtensionPackage::check_manifest_version("1.1.0").is_ok());
        assert!(ExtensionPackage::check_manifest_version("2.0.0").is_ok());

        // Version below minimum should fail
        assert!(ExtensionPackage::check_manifest_version("0.9.0").is_err());
    }
}
