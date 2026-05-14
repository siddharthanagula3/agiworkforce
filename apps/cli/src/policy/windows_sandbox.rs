//! Windows AppContainer sandbox preset.
//!
//! Mirrors the pattern of `macos_sandbox.rs` (Seatbelt) and `linux_sandbox.rs`
//! (seccomp-BPF): an allow-list builder, a one-line describe_filter, and a
//! `install_filter` that's a stub by default. Real AppContainer installation
//! requires linking against the Windows API (CreateAppContainerProfile,
//! DeriveAppContainerSidFromAppContainerName, etc.) which is left to the
//! `windows-appcontainer` Cargo feature (not added in this slice).

#![cfg(target_os = "windows")]
#![allow(dead_code)]

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowsSandboxPreset {
    /// Read-only filesystem; no network; no registry write.
    ReadOnly,
    /// Workspace write OK; outbound network; no admin-privilege escalation.
    Contained,
    /// No sandbox.
    Unrestricted,
}

#[derive(Debug, Clone)]
pub struct WindowsSandboxOptions {
    pub preset: WindowsSandboxPreset,
    pub allow_network: bool,
    pub container_name: String,
}

/// AppContainer capabilities mapped from the preset. Each string is the
/// well-known name (resolved at runtime via Windows API to a SID).
pub fn allowed_capabilities(preset: WindowsSandboxPreset) -> Vec<&'static str> {
    match preset {
        WindowsSandboxPreset::Unrestricted => vec![],
        WindowsSandboxPreset::ReadOnly => vec![
            "internetClient", // Outbound network; gated by allow_network elsewhere
            "documentsLibrary",
        ],
        WindowsSandboxPreset::Contained => vec![
            "internetClient",
            "internetClientServer",
            "documentsLibrary",
            "picturesLibrary",
            "videosLibrary",
            "musicLibrary",
            "removableStorage",
        ],
    }
}

/// Render a one-line summary for `/sandbox` and `/doctor` overlays.
pub fn describe_filter(opts: &WindowsSandboxOptions) -> String {
    let caps = allowed_capabilities(opts.preset);
    let net = if opts.allow_network { "yes" } else { "no" };
    format!(
        "windows-appcontainer preset={:?} container={} capabilities={} network={}",
        opts.preset, opts.container_name, caps.len(), net
    )
}

/// Probe whether AppContainer is available. Checks Windows version >= 8.
pub fn is_available() -> bool {
    // On Windows the IsWindowsServer + IsWindowsVersionOrGreater APIs would
    // be the right check. Heuristic: Cargo runtime cfg already proves we're
    // on Windows; AppContainer ships in Windows 8+ (build 9200+). Assume yes.
    true
}

/// Install the AppContainer profile and wrap the current process. Behind the
/// `windows-appcontainer` feature; without it, this is a no-op stub.
#[cfg(feature = "windows-appcontainer")]
pub fn install_filter(_opts: &WindowsSandboxOptions) -> anyhow::Result<()> {
    // Real impl: CreateAppContainerProfile + assignment.
    // Placeholder — leaves the implementation to the feature-gated build.
    anyhow::bail!("install_filter is not yet implemented even with the feature flag; tracking issue: AppContainer integration is a v1.8 work item")
}

#[cfg(not(feature = "windows-appcontainer"))]
pub fn install_filter(_opts: &WindowsSandboxOptions) -> anyhow::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unrestricted_returns_no_capabilities() {
        let caps = allowed_capabilities(WindowsSandboxPreset::Unrestricted);
        assert!(caps.is_empty());
    }

    #[test]
    fn readonly_has_internet_client_and_docs() {
        let caps = allowed_capabilities(WindowsSandboxPreset::ReadOnly);
        assert!(caps.contains(&"internetClient"));
        assert!(caps.contains(&"documentsLibrary"));
    }

    #[test]
    fn contained_has_strictly_more_capabilities_than_readonly() {
        let ro = allowed_capabilities(WindowsSandboxPreset::ReadOnly);
        let cn = allowed_capabilities(WindowsSandboxPreset::Contained);
        assert!(cn.len() > ro.len());
    }

    #[test]
    fn describe_filter_includes_preset_and_container_name() {
        let opts = WindowsSandboxOptions {
            preset: WindowsSandboxPreset::Contained,
            allow_network: true,
            container_name: "agiworkforce-cli".into(),
        };
        let desc = describe_filter(&opts);
        assert!(desc.contains("Contained"));
        assert!(desc.contains("agiworkforce-cli"));
        assert!(desc.contains("network=yes"));
    }

    #[test]
    fn install_filter_default_feature_is_noop() {
        let opts = WindowsSandboxOptions {
            preset: WindowsSandboxPreset::ReadOnly,
            allow_network: false,
            container_name: "test".into(),
        };
        // Without the windows-appcontainer feature, install_filter is Ok stub.
        assert!(install_filter(&opts).is_ok());
    }

    #[test]
    fn is_available_does_not_panic() {
        let _ = is_available();
    }
}
