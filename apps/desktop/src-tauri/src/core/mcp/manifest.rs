//! AUDIT-FIX: CI-5 — MCP allow-list enforcement.

use serde::Deserialize;
use std::path::Path;

#[derive(Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub allowed_packages: Vec<String>,
}

pub fn load(path: &Path) -> Result<Manifest, std::io::Error> {
    let bytes = std::fs::read(path)?;
    let m: Manifest = serde_json::from_slice(&bytes).map_err(std::io::Error::other)?;
    Ok(m)
}

pub fn is_allowed(manifest: &Manifest, package: &str) -> bool {
    manifest.allowed_packages.iter().any(|p| p == package)
}
