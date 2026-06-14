//! Windows AppContainer sandbox preset.
//!
//! Mirrors the pattern of `macos_sandbox.rs` (Seatbelt) and `linux_sandbox.rs`
//! (seccomp-BPF): an allow-list builder, a one-line describe_filter, and a
//! `install_filter` that fails closed by default. Real AppContainer installation
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

/// AppContainer capabilities mapped from the full sandbox options. Each string
/// is the well-known name (resolved at runtime via Windows API to a SID).
///
/// `internetClient` is gated on `allow_network` so the returned SID list matches
/// the documented preset semantics: `ReadOnly` means "no network" and therefore
/// must NOT grant `internetClient` unless the caller explicitly opts in via
/// `allow_network`. This prevents a future AppContainer integration that
/// consumes this list directly from granting outbound network to a ReadOnly
/// sandbox.
pub fn allowed_capabilities(opts: &WindowsSandboxOptions) -> Vec<&'static str> {
    match opts.preset {
        WindowsSandboxPreset::Unrestricted => vec![],
        WindowsSandboxPreset::ReadOnly => {
            let mut caps = vec!["documentsLibrary"];
            if opts.allow_network {
                caps.push("internetClient");
            }
            caps
        }
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
    let caps = allowed_capabilities(opts);
    let net = if opts.allow_network { "yes" } else { "no" };
    format!(
        "windows-appcontainer preset={:?} container={} capabilities={} network={}",
        opts.preset,
        opts.container_name,
        caps.len(),
        net
    )
}

/// Probe whether AppContainer enforcement is available in this build.
pub fn is_available() -> bool {
    false
}

/// Install the AppContainer profile and wrap the current process. Behind the
/// `windows-appcontainer` feature; without it, this fails closed.
#[cfg(feature = "windows-appcontainer")]
pub fn install_filter(_opts: &WindowsSandboxOptions) -> anyhow::Result<()> {
    // Real impl: CreateAppContainerProfile + assignment.
    // Placeholder — leaves the implementation to the feature-gated build.
    anyhow::bail!("install_filter is not yet implemented even with the feature flag; tracking issue: AppContainer integration is a v1.8 work item")
}

#[cfg(not(feature = "windows-appcontainer"))]
pub fn install_filter(_opts: &WindowsSandboxOptions) -> anyhow::Result<()> {
    anyhow::bail!(
        "Windows AppContainer sandbox is not available in this build (missing windows-appcontainer feature)"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts_for(preset: WindowsSandboxPreset, allow_network: bool) -> WindowsSandboxOptions {
        WindowsSandboxOptions {
            preset,
            allow_network,
            container_name: "test".into(),
        }
    }

    #[test]
    fn unrestricted_returns_no_capabilities() {
        let caps = allowed_capabilities(&opts_for(WindowsSandboxPreset::Unrestricted, true));
        assert!(caps.is_empty());
    }

    #[test]
    fn readonly_without_network_has_no_internet_client() {
        // ReadOnly is documented as "no network": internetClient must be absent
        // unless the caller explicitly opts in via allow_network.
        let caps = allowed_capabilities(&opts_for(WindowsSandboxPreset::ReadOnly, false));
        assert!(!caps.contains(&"internetClient"));
        assert!(caps.contains(&"documentsLibrary"));
    }

    #[test]
    fn readonly_with_network_opt_in_has_internet_client() {
        let caps = allowed_capabilities(&opts_for(WindowsSandboxPreset::ReadOnly, true));
        assert!(caps.contains(&"internetClient"));
        assert!(caps.contains(&"documentsLibrary"));
    }

    #[test]
    fn contained_has_strictly_more_capabilities_than_readonly() {
        let ro = allowed_capabilities(&opts_for(WindowsSandboxPreset::ReadOnly, false));
        let cn = allowed_capabilities(&opts_for(WindowsSandboxPreset::Contained, false));
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
    fn install_filter_fails_closed_until_enforcement_is_wired() {
        let opts = WindowsSandboxOptions {
            preset: WindowsSandboxPreset::ReadOnly,
            allow_network: false,
            container_name: "test".into(),
        };
        assert!(install_filter(&opts).is_err());
    }

    #[test]
    fn is_available_does_not_panic() {
        let _ = is_available();
    }
}
