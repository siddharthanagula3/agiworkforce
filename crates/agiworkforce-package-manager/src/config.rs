use crate::ManagedPackage;
use std::path::PathBuf;

/// Immutable configuration for a [`crate::PackageManager`] instance.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PackageManagerConfig<P> {
    pub(crate) agiworkforce_home: PathBuf,
    pub(crate) package: P,
    cache_root: Option<PathBuf>,
}

impl<P> PackageManagerConfig<P> {
    /// Creates a config rooted at the provided Codex home directory.
    pub fn new(agiworkforce_home: PathBuf, package: P) -> Self {
        Self {
            agiworkforce_home,
            package,
            cache_root: None,
        }
    }

    /// Overrides the package cache root instead of deriving it from `agiworkforce_home`.
    pub fn with_cache_root(mut self, cache_root: PathBuf) -> Self {
        self.cache_root = Some(cache_root);
        self
    }
}

impl<P: ManagedPackage> PackageManagerConfig<P> {
    /// Returns the effective cache root for the package.
    pub fn cache_root(&self) -> PathBuf {
        self.cache_root.clone().unwrap_or_else(|| {
            self.agiworkforce_home.join(
                self.package
                    .default_cache_root_relative()
                    .replace('/', std::path::MAIN_SEPARATOR_STR),
            )
        })
    }
}
