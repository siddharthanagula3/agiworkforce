//! Plugin manifest matrix — one fixture per supported format.
//!
//! Every supported manifest format must round-trip through `load_manifest_for`
//! and produce the expected `ManifestFormat` variant. This is the M4 exit
//! criterion of `AGIWORKFORCE_RUST_REVERSE_ENGINEERING_PLAN.md`.
//!
//! Fixtures live under `tests/fixtures/<format>/<manifest-path>`.

use agiworkforce_plugin_runtime::{load_manifest_for, ManifestFormat};
use std::path::PathBuf;

fn fixtures_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn load_fixture(subdir: &str) -> (agiworkforce_plugin_runtime::PluginManifest, ManifestFormat) {
    let root = fixtures_root().join(subdir);
    load_manifest_for(&root).unwrap_or_else(|| panic!("expected manifest under {}", root.display()))
}

#[test]
fn agiworkforce_canonical_manifest_loads() {
    let (m, fmt) = load_fixture("agiworkforce");
    assert_eq!(fmt, ManifestFormat::Agiworkforce);
    assert_eq!(m.name.as_deref(), Some("fixture-agi"));
    assert_eq!(m.version.as_deref(), Some("0.1.0"));
    assert_eq!(m.commands.len(), 1);
    assert_eq!(m.agents.len(), 1);
    assert_eq!(m.skills.len(), 1);
}

#[test]
fn claude_code_manifest_loads_with_unknown_fields_in_extra() {
    let (m, fmt) = load_fixture("claude_code");
    assert_eq!(fmt, ManifestFormat::ClaudeCode);
    assert_eq!(m.name.as_deref(), Some("fixture-claude"));
    // unknown `marketplace` field must land in extra
    assert!(m.extra.contains_key("marketplace"));
    // mcpServers (camelCase) maps to mcp_servers and the inner extra carries
    // the `transport` + `url` passthrough fields
    let claude_demo = m
        .mcp_servers
        .get("claude-demo")
        .expect("claude-demo mcp server");
    assert_eq!(
        claude_demo.extra.get("transport").and_then(|v| v.as_str()),
        Some("sse")
    );
    assert_eq!(
        claude_demo.extra.get("url").and_then(|v| v.as_str()),
        Some("https://mcp.example.com/sse")
    );
}

#[test]
fn codex_manifest_loads_with_stdio_mcp_server() {
    let (m, fmt) = load_fixture("codex");
    assert_eq!(fmt, ManifestFormat::Codex);
    assert_eq!(m.name.as_deref(), Some("fixture-codex"));
    assert!(m.commands.is_empty());
    assert_eq!(m.agents.len(), 1);
    let codex_demo = m
        .mcp_servers
        .get("codex-demo")
        .expect("codex-demo mcp server");
    assert_eq!(codex_demo.command, "node");
    assert_eq!(codex_demo.args, vec!["server.js"]);
}

#[test]
fn legacy_app_manifest_loads_with_apps_field() {
    let (m, fmt) = load_fixture("legacy_app");
    assert_eq!(fmt, ManifestFormat::LegacyApp);
    assert!(fmt.is_legacy());
    assert_eq!(m.name.as_deref(), Some("fixture-legacy-app"));
    assert_eq!(m.apps, vec!["github", "slack"]);
}

#[test]
fn legacy_mcp_manifest_loads_with_stdio_only() {
    let (m, fmt) = load_fixture("legacy_mcp");
    assert_eq!(fmt, ManifestFormat::LegacyMcp);
    assert!(fmt.is_legacy());
    assert!(m.name.is_none(), "legacy .mcp.json has no top-level name");
    let server = m
        .mcp_servers
        .get("legacy-stdio")
        .expect("legacy-stdio mcp server");
    assert_eq!(server.command, "python");
    assert_eq!(server.args, vec!["-m", "mcp_server"]);
}

#[test]
fn all_five_formats_round_trip_in_priority_order() {
    // Combined matrix asserts every supported format is exercised.
    let cases = [
        ("agiworkforce", ManifestFormat::Agiworkforce),
        ("claude_code", ManifestFormat::ClaudeCode),
        ("codex", ManifestFormat::Codex),
        ("legacy_app", ManifestFormat::LegacyApp),
        ("legacy_mcp", ManifestFormat::LegacyMcp),
    ];
    for (subdir, expected) in cases {
        let (_, fmt) = load_fixture(subdir);
        assert_eq!(
            fmt, expected,
            "fixture '{subdir}' must load as {:?}, got {:?}",
            expected, fmt
        );
    }
}

#[test]
fn missing_manifest_returns_none() {
    let tmp = std::env::temp_dir().join("agiworkforce_plugin_runtime_no_manifest_test");
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).expect("mkdir tmp");
    let result = load_manifest_for(&tmp);
    assert!(
        result.is_none(),
        "load_manifest_for must return None when no manifest exists"
    );
    let _ = std::fs::remove_dir_all(&tmp);
}
