/// Coverage wave 2 — plugin manifest loading and trust boundary.
///
/// Exercises:
///  1. load_manifest_for() returns None on a missing directory.
///  2. All 5 manifest formats parse correctly via load_manifest_for() with
///     the correct ManifestFormat tag (round-trip on known fixture).
///  3. Priority ordering: .agiworkforce-plugin wins over .claude-plugin.
///  4. hook_configs_with_trust() returns from_project_dir=true for a
///     project-local plugin (HIGH-2 trust boundary).
///  5. hook_configs() OMITS hooks from project-local plugins (the security
///     enforcement half of the trust boundary).
use agiworkforce_cli::plugins::{load_manifest_for, ManifestFormat, PluginsManager};

// ---------------------------------------------------------------------------
// Helper — write a minimal plugin.json to a temp path.
// ---------------------------------------------------------------------------
fn write_manifest(root: &std::path::Path, rel: &str, content: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, content).unwrap();
}

// A minimal valid plugin.json that exercises every first-class field we care
// about (name, version, hooks).
const MINIMAL_MANIFEST: &str = r#"{
  "name": "test-plugin",
  "version": "1.0.0",
  "hooks": { "PreToolUse": [{"command": "echo pre"}] }
}"#;

// ---------------------------------------------------------------------------
// Test 1: load_manifest_for returns None on a non-existent directory.
// ---------------------------------------------------------------------------
#[test]
fn load_manifest_for_returns_none_on_missing_dir() {
    let dir = std::path::PathBuf::from("/nonexistent/plugin/root/that/cannot/exist");
    let result = load_manifest_for(&dir);
    assert!(
        result.is_none(),
        "expected None for missing directory, got {:?}",
        result.map(|(_, f)| f)
    );
}

// ---------------------------------------------------------------------------
// Test 2a: .agiworkforce-plugin/plugin.json → ManifestFormat::Agiworkforce
// ---------------------------------------------------------------------------
#[test]
fn load_manifest_agiworkforce_format() {
    let dir = tempfile::tempdir().unwrap();
    write_manifest(
        dir.path(),
        ".agiworkforce-plugin/plugin.json",
        MINIMAL_MANIFEST,
    );
    let result = load_manifest_for(dir.path());
    assert!(result.is_some(), "expected a manifest to load");
    let (manifest, format) = result.unwrap();
    assert_eq!(
        format,
        ManifestFormat::Agiworkforce,
        "expected Agiworkforce format"
    );
    assert_eq!(manifest.name.as_deref(), Some("test-plugin"));
    assert_eq!(format.short_tag(), "agi");
}

// ---------------------------------------------------------------------------
// Test 2b: .claude-plugin/plugin.json → ManifestFormat::ClaudeCode
// ---------------------------------------------------------------------------
#[test]
fn load_manifest_claude_format() {
    let dir = tempfile::tempdir().unwrap();
    write_manifest(dir.path(), ".claude-plugin/plugin.json", MINIMAL_MANIFEST);
    let result = load_manifest_for(dir.path());
    assert!(result.is_some(), "expected a manifest to load");
    let (manifest, format) = result.unwrap();
    assert_eq!(
        format,
        ManifestFormat::ClaudeCode,
        "expected ClaudeCode format"
    );
    assert_eq!(manifest.name.as_deref(), Some("test-plugin"));
    assert_eq!(format.short_tag(), "claude");
}

// ---------------------------------------------------------------------------
// Test 2c: .codex-plugin/plugin.json → ManifestFormat::Codex
// ---------------------------------------------------------------------------
#[test]
fn load_manifest_codex_format() {
    let dir = tempfile::tempdir().unwrap();
    write_manifest(dir.path(), ".codex-plugin/plugin.json", MINIMAL_MANIFEST);
    let (_, format) = load_manifest_for(dir.path()).expect("manifest should load");
    assert_eq!(format, ManifestFormat::Codex, "expected Codex format");
    assert_eq!(format.short_tag(), "codex");
}

// ---------------------------------------------------------------------------
// Test 2d: .app.json → ManifestFormat::LegacyApp
// ---------------------------------------------------------------------------
#[test]
fn load_manifest_legacy_app_format() {
    let dir = tempfile::tempdir().unwrap();
    write_manifest(dir.path(), ".app.json", MINIMAL_MANIFEST);
    let (_, format) = load_manifest_for(dir.path()).expect("manifest should load");
    assert_eq!(
        format,
        ManifestFormat::LegacyApp,
        "expected LegacyApp format"
    );
    assert_eq!(format.short_tag(), "legacy");
}

// ---------------------------------------------------------------------------
// Test 2e: .mcp.json → ManifestFormat::LegacyMcp
// ---------------------------------------------------------------------------
#[test]
fn load_manifest_legacy_mcp_format() {
    let dir = tempfile::tempdir().unwrap();
    write_manifest(dir.path(), ".mcp.json", MINIMAL_MANIFEST);
    let (_, format) = load_manifest_for(dir.path()).expect("manifest should load");
    assert_eq!(
        format,
        ManifestFormat::LegacyMcp,
        "expected LegacyMcp format"
    );
    assert_eq!(format.short_tag(), "legacy");
}

// ---------------------------------------------------------------------------
// Test 3: Priority — .agiworkforce-plugin wins when both formats are present.
// ---------------------------------------------------------------------------
#[test]
fn load_manifest_priority_agiworkforce_over_claude() {
    let dir = tempfile::tempdir().unwrap();
    // Write both formats; agiworkforce-plugin must win.
    write_manifest(
        dir.path(),
        ".agiworkforce-plugin/plugin.json",
        r#"{"name": "winner"}"#,
    );
    write_manifest(
        dir.path(),
        ".claude-plugin/plugin.json",
        r#"{"name": "loser"}"#,
    );
    let (manifest, format) = load_manifest_for(dir.path()).expect("manifest should load");
    assert_eq!(
        format,
        ManifestFormat::Agiworkforce,
        "agiworkforce-plugin must take priority over claude-plugin"
    );
    assert_eq!(
        manifest.name.as_deref(),
        Some("winner"),
        "name from the winning format should be loaded"
    );
}

// ---------------------------------------------------------------------------
// Test 4 + 5: HIGH-2 trust boundary.
//
// Build a minimal plugins tree under tempdir:
//   <project_dir>/.agiworkforce/plugins/<plugin-name>/.agiworkforce-plugin/plugin.json
//
// load_all(Some(project_dir)) must tag the plugin as from_project_dir=true.
//
// hook_configs_with_trust() must expose the hooks with from_project_dir=true.
// hook_configs()            must OMIT those hooks (blocked by default).
// ---------------------------------------------------------------------------
#[test]
fn project_local_plugin_hooks_are_untrusted() {
    let project_dir = tempfile::tempdir().unwrap();

    // Build the project-local plugin directory.
    let plugin_root = project_dir
        .path()
        .join(".agiworkforce")
        .join("plugins")
        .join("untrusted-plugin");

    write_manifest(
        &plugin_root,
        ".agiworkforce-plugin/plugin.json",
        r#"{
          "name": "untrusted-plugin",
          "hooks": { "PreToolUse": [{"command": "echo should-not-run"}] }
        }"#,
    );

    // PluginsManager scans global dir (which may not exist on CI — that is
    // fine; it skips gracefully) and then the project dir.
    let mut manager = PluginsManager::new();
    manager
        .load_all(Some(project_dir.path()))
        .expect("load_all should not error");

    // -- hook_configs_with_trust() must see the event with from_project_dir=true
    let trusted_entries = manager.hook_configs_with_trust();
    let untrusted_entry = trusted_entries
        .iter()
        .find(|(event, _, from_project)| event == "PreToolUse" && *from_project);
    assert!(
        untrusted_entry.is_some(),
        "hook_configs_with_trust() must expose project-local plugin hooks with from_project_dir=true; \
         got entries: {:?}",
        trusted_entries
            .iter()
            .map(|(e, _, f)| (e.as_str(), *f))
            .collect::<Vec<_>>()
    );

    // -- hook_configs() must NOT include the project-local plugin's hooks
    let blocked_map = manager.hook_configs();
    // The project-local plugin's PreToolUse entries, if any survived, would
    // contain "echo should-not-run".  We assert none of the entries for
    // "PreToolUse" originate from that plugin's command.
    let pre_tool_use_cmds: Vec<String> = blocked_map
        .get("PreToolUse")
        .map(|hooks| {
            hooks
                .iter()
                .filter_map(|v| {
                    v.as_object()
                        .and_then(|o| o.get("command"))
                        .and_then(|c| c.as_str())
                        .map(String::from)
                })
                .collect()
        })
        .unwrap_or_default();

    assert!(
        !pre_tool_use_cmds
            .iter()
            .any(|c| c.contains("should-not-run")),
        "hook_configs() must omit project-local plugin hooks (HIGH-2); \
         found leaked command(s): {:?}",
        pre_tool_use_cmds
    );
}
