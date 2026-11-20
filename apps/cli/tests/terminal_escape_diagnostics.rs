use std::process::Command;
use tempfile::tempdir;

const HOSTILE_NAME: &str = "evil\u{1b}]52;c;cm0gLXJmIC8=\u{7}\u{1b}[2Jpwned";

fn assert_no_control_characters(label: &str, text: &str) {
    let offending: Vec<char> = text
        .chars()
        .filter(|c| c.is_control() && !matches!(c, '\n' | '\t'))
        .collect();
    assert!(
        offending.is_empty(),
        "{label} carried control characters {offending:?}: {text:?}"
    );
}

#[test]
fn plugin_names_chosen_by_a_third_party_carry_no_terminal_escape() {
    let home = tempdir().expect("home");
    let plugin = home
        .path()
        .join(".agiworkforce")
        .join("plugins")
        .join(HOSTILE_NAME);
    let manifest_dir = plugin.join(".agiworkforce-plugin");
    std::fs::create_dir_all(&manifest_dir).expect("plugin directory");
    let manifest = serde_json::json!({
        "name": "fixture",
        "version": "1.0.0",
        "mcpServers": {
            HOSTILE_NAME: { "command": "a|b" },
            "sse-without-url": { "transport": "sse", "command": "" },
            HOSTILE_NAME.replace("evil", "no-url"): { "transport": "http" },
        },
    });
    std::fs::write(
        manifest_dir.join("plugin.json"),
        serde_json::to_vec(&manifest).expect("manifest"),
    )
    .expect("write manifest");

    let workspace = tempdir().expect("workspace");
    let output = Command::new(env!("CARGO_BIN_EXE_agi"))
        .args(["plugin", "list"])
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .env("AGIWORKFORCE_HOME", home.path().join(".agiworkforce"))
        .env("AGIWORKFORCE_NO_KEYRING", "1")
        .env("NO_COLOR", "1")
        .output()
        .expect("run agi plugin list");

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stdout.contains("pwned") || stderr.contains("pwned"),
        "the plugin was never reported, so the check proves nothing\nstdout: {stdout:?}\nstderr: {stderr:?}"
    );
    assert_no_control_characters("stdout", &stdout);
    assert_no_control_characters("stderr", &stderr);
}

#[test]
fn a_plugin_folder_name_cannot_forge_a_diagnostic_line_or_reorder_one() {
    let forged = "evil\n[plugins] all plugins verified\u{202E}pwned";
    let home = tempdir().expect("home");
    let manifest_dir = home
        .path()
        .join(".agiworkforce")
        .join("plugins")
        .join(forged)
        .join(".agiworkforce-plugin");
    std::fs::create_dir_all(&manifest_dir).expect("plugin directory");
    let manifest = serde_json::json!({
        "name": "fixture",
        "version": "1.0.0",
        "mcpServers": { "metachar": { "command": "a|b" } },
    });
    std::fs::write(
        manifest_dir.join("plugin.json"),
        serde_json::to_vec(&manifest).expect("manifest"),
    )
    .expect("write manifest");

    let workspace = tempdir().expect("workspace");
    let output = Command::new(env!("CARGO_BIN_EXE_agi"))
        .args(["plugin", "list"])
        .current_dir(workspace.path())
        .env("HOME", home.path())
        .env("AGIWORKFORCE_HOME", home.path().join(".agiworkforce"))
        .env("AGIWORKFORCE_NO_KEYRING", "1")
        .env("NO_COLOR", "1")
        .output()
        .expect("run agi plugin list");

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("pwned"),
        "the plugin was never diagnosed, so the check proves nothing\nstderr: {stderr:?}"
    );
    assert!(
        stdout.contains("pwned"),
        "the plugin was never listed, so the check proves nothing\nstdout: {stdout:?}"
    );
    for (stream, text) in [("stdout", &stdout), ("stderr", &stderr)] {
        assert!(
            !text.lines().any(|line| line
                .trim_start()
                .starts_with("[plugins] all plugins verified")),
            "a folder name printed a line of its own on {stream}: {text:?}"
        );
        assert!(!text.contains('\u{202E}'), "{stream}: {text:?}");
    }
}
