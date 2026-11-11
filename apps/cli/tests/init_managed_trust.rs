use serde_json::Value;
use std::path::Path;
use std::process::{Command, Output};
use tempfile::tempdir;

fn run_init(workspace: &Path, home: &Path, managed_policy: Option<&Path>) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_agi"));
    command
        .arg("init")
        .current_dir(workspace)
        .env("HOME", home)
        .env("AGIWORKFORCE_HOME", home.join(".agiworkforce"))
        .env("AGIWORKFORCE_NO_KEYRING", "1")
        .env_remove("AGIWORKFORCE_MANAGED_POLICY");
    if let Some(policy) = managed_policy {
        command.env("AGIWORKFORCE_MANAGED_POLICY", policy);
    }
    command.output().expect("run agi init")
}

fn registered_projects(home: &Path) -> Value {
    let path = home.join(".agiworkforce").join("projects.json");
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).expect("projects.json parses"),
        Err(_) => Value::Object(Default::default()),
    }
}

#[test]
fn init_records_no_trust_grant_when_managed_policy_forbids_new_grants() {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");
    let policy = home.path().join("managed-policy.json");
    std::fs::write(&policy, r#"{"trust":{"allowGrant":false}}"#).expect("write policy");

    let output = run_init(workspace.path(), home.path(), Some(&policy));

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(!output.status.success(), "stderr: {stderr}");
    assert!(stderr.contains("managed policy"), "stderr: {stderr}");
    assert!(
        registered_projects(home.path())
            .as_object()
            .expect("registry is a map")
            .is_empty(),
        "no project may be registered"
    );
}

#[test]
fn init_records_an_identity_bound_trust_grant_when_policy_allows_it() {
    let workspace = tempdir().expect("workspace");
    let home = tempdir().expect("home");

    let output = run_init(workspace.path(), home.path(), None);

    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(output.status.success(), "stderr: {stderr}");
    let projects = registered_projects(home.path());
    let entries = projects.as_object().expect("registry is a map");
    assert_eq!(entries.len(), 1, "registry: {projects}");
    let entry = entries.values().next().expect("one entry");
    assert_eq!(entry["trust_level"], "trusted");
    assert!(entry["identity"].is_string(), "entry: {entry}");
    assert!(entry["trusted_by"].is_string(), "entry: {entry}");
    assert!(entry["trusted_at"].is_string(), "entry: {entry}");
}
